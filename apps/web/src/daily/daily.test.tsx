// @vitest-environment jsdom
/** Usefulness v1 (spec 24.11.2026): «Повторить завтра» + empty-day plan, «Начать», micro-reflection, limit texts. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, noXpMessage } from "@levex/domain";
import { App } from "../App";
import type { Goal } from "../api";
import { planChips, todayBoard } from "../map/missions";
import { activityAid, clock } from "./activity";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** In-memory API with the new fields. `capped` makes the next completion a no-XP record (daily_cap). */
function server(initial: Goal[], options: { level?: number; awarded?: number; capped?: boolean } = {}) {
  const goals = initial.map((goal) => ({ ...goal }));
  const level = options.level ?? 1;
  const player = {
    id: "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: { xp: (level - 1) * 100, level, xpBySphere: {} as Record<string, number> },
    streak: 1,
    energy: { current: 50, max: 50 },
    today: { day: "2026-11-24", awarded: options.awarded ?? 0, awardCap: 5, ownAwarded: 0, ownAwardCap: 3 },
  };
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === "/player") return json(player);
    if (url === "/room") return json({ placements: [] });
    if (url === "/goals" && method === "GET") return json(goals);
    if (url === "/goals" && method === "POST") {
      const source = goals.find((goal) => goal.id === body.repeatOf);
      const goal: Goal = {
        id: `n${goals.length}`,
        title: source?.title ?? body.title ?? (body.templateId === "seed-walk" ? "Утренняя прогулка 20 мин" : "Прочитать 10 страниц"),
        sphere: source?.sphere ?? body.sphere ?? "health",
        xpReward: 10,
        status: "open",
        templateId: body.templateId ?? source?.templateId,
        repeatOf: body.repeatOf,
        ...(body.forTomorrow ? { availableFrom: "2099-01-01" } : {}),
      };
      goals.push(goal);
      return json(goal, 201);
    }
    const reflection = url.match(/^\/goals\/(.+)\/reflection$/);
    if (reflection) {
      const goal = goals.find((item) => item.id === reflection[1])!;
      goal.reflection = { felt: body.felt, ...(body.note ? { note: body.note } : {}), at: new Date().toISOString() };
      return json(goal);
    }
    const done = url.match(/^\/goals\/(.+)\/complete$/);
    if (done) {
      const goal = goals.find((item) => item.id === done[1])!;
      goal.status = "done";
      goal.completedAt = new Date().toISOString();
      if (options.capped) {
        goal.xpGranted = 0;
        goal.noXpReason = "daily_cap";
        return json({ goal, progress: player.progress, awarded: false, reason: "daily_cap", message: noXpMessage("daily_cap"), awardedToday: 5, awardCap: 5 });
      }
      goal.xpGranted = goal.xpReward;
      player.progress = { ...player.progress, xp: player.progress.xp + goal.xpReward };
      player.today = { ...player.today, awarded: player.today.awarded + 1 };
      return json({ goal, progress: player.progress, awarded: true, awardedToday: player.today.awarded, awardCap: 5 });
    }
    return json({ error: "not found" }, 404);
  }));
  return { goals, calls };
}

const WALK: Goal = { id: "g1", title: "Утренняя прогулка 20 мин", sphere: "health", xpReward: 10, status: "open", templateId: "seed-walk" };
const READ: Goal = { id: "g2", title: "Прочитать 10 страниц", sphere: "mind", xpReward: 10, status: "open", templateId: "seed-read" };

async function renderApp() {
  const view = render(<App />);
  await screen.findByText(/Серия: 1/);
  return view;
}

describe("activity aid (spec №2)", () => {
  it("reads minutes, pages, or falls back to a stopwatch", () => {
    expect(activityAid("Утренняя прогулка 20 мин")).toEqual({ kind: "timer", minutes: 20 });
    expect(activityAid("Прочитать 10 страниц")).toEqual({ kind: "pages", pages: 10 });
    expect(activityAid("Позвонить маме")).toEqual({ kind: "stopwatch" });
    expect(clock(65)).toBe("01:05");
    expect(clock(3725)).toBe("1:02:05");
  });
});

describe("empty-day plan and «Сегодня» day (spec №1, R-XP-5)", () => {
  it("offers both seeds after they are done, plus repeated own templates; skips open and locked ones", () => {
    const done = (goal: Goal): Goal => ({ ...goal, status: "done", completedAt: "2026-11-23T08:00:00.000Z" });
    const own: Goal = { id: "c1", title: "Зарядка", sphere: "health", xpReward: 10, status: "done", templateId: "own:o1", completedAt: "2026-11-23T09:00:00.000Z" };
    const art: Goal = { id: "a1", title: "Скетч", sphere: "creativity", xpReward: 10, status: "done", templateId: "own:a0" };
    const chips = planChips([done(WALK), done(READ), own, art], 1);
    expect(chips.map((chip) => chip.title)).toEqual(["Утренняя прогулка 20 мин", "Прочитать 10 страниц", "Зарядка"]);
    expect(chips[0]).toMatchObject({ repeatOf: "g1" });
    // A fresh player without seed goals gets the seed template ids.
    expect(planChips([], 1).map((chip) => chip.templateId)).toEqual(["seed-walk", "seed-read"]);
    // An open seed is not offered again.
    expect(planChips([WALK, done(READ)], 1).map((chip) => chip.key)).toEqual(["seed-read"]);
  });

  it("counts «Выполнено сегодня» by the Israeli day and keeps tomorrow's copies out of today", () => {
    const night = new Date("2026-11-23T23:30:00.000Z"); // 01:30 on 24.11 in Israel
    const goals: Goal[] = [
      { ...WALK, status: "done", completedAt: "2026-11-23T22:10:00.000Z" }, // 00:10 on 24.11 → today
      { ...READ, status: "done", completedAt: "2026-11-23T21:50:00.000Z" }, // 23:50 on 23.11 → yesterday
      { ...WALK, id: "g3", availableFrom: "2026-11-25" },
    ];
    const board = todayBoard(goals, night);
    expect(board.doneToday).toBe(1);
    expect(board.open).toHaveLength(0);
    expect(board.later.map((row) => row.from)).toEqual(["25.11"]);
  });
});

describe("App: usefulness v1", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("after «Выполнить»: «Повторить завтра?» creates one copy for tomorrow; «Как прошло?» saves felt + note", async () => {
    const api = server([WALK, READ]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    fireEvent.click(within(today).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    const sheet = await screen.findByRole("dialog", { name: "«Утренняя прогулка 20 мин» выполнена" });
    expect(within(sheet).getByText("+10 XP")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Да, на завтра" }));
    await within(sheet).findByText(/Поставлено на завтра/);
    expect(api.calls.find((call) => call.method === "POST" && call.url === "/goals")?.body).toEqual({ repeatOf: "g1", forTomorrow: true });
    // Tomorrow's copy is listed under «Завтра», not in today's list.
    await waitFor(() => expect(today.textContent).toContain("Завтра: «Утренняя прогулка 20 мин»"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Было трудно" }));
    fireEvent.change(within(sheet).getByLabelText("Заметка (необязательно)"), { target: { value: "Дождь" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /выполнена/ })).toBeNull());
    expect(api.calls.find((call) => call.url === "/goals/g1/reflection")?.body).toEqual({ felt: "hard", note: "Дождь" });
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    expect(screen.getByRole("region", { name: "Миссии" }).querySelector('[data-mission="g1"]')!.textContent).toContain("Было трудно · Дождь");
  });

  it("«Пропустить» saves nothing; «Сохранить» is off until a feeling is picked", async () => {
    const api = server([WALK]);
    await renderApp();
    fireEvent.click(within(screen.getByRole("complementary", { name: "Сегодня" })).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    const sheet = await screen.findByRole("dialog", { name: /выполнена/ });
    expect((within(sheet).getByRole("button", { name: "Сохранить" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Пропустить" }));
    expect(screen.queryByRole("dialog", { name: /выполнена/ })).toBeNull();
    expect(api.calls.some((call) => call.url.endsWith("/reflection"))).toBe(false);
    expect(api.calls.filter((call) => call.method === "POST" && call.url === "/goals")).toHaveLength(0);
  });

  it("a completion without XP shows the calm limit text and the row says «без XP»", async () => {
    server([WALK], { capped: true, awarded: 5 });
    const { container } = await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    expect(today.textContent).toContain("Можно записать дело без начисления: лимит XP на сегодня исчерпан (5/5).");
    fireEvent.click(within(today).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    const sheet = await screen.findByRole("dialog", { name: /выполнена/ });
    expect(within(sheet).getByText(/Записано без начисления: лимит XP на сегодня 5\/5/)).toBeTruthy();
    expect(container.querySelector(".toast")?.textContent).toMatch(/лимит XP на сегодня 5\/5/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Пропустить" }));
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    expect(screen.getByRole("region", { name: "Миссии" }).querySelector('[data-mission="g1"]')!.textContent).toContain("без XP · записано");
  });

  it("empty day: a plan chip creates today's copy", async () => {
    const api = server([{ ...WALK, status: "done", completedAt: "2026-11-20T08:00:00.000Z" }]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    expect(today.textContent).toContain("На сегодня дел нет. Можно снова:");
    expect(within(today).getByRole("button", { name: "+ Прочитать 10 страниц" })).toBeTruthy();
    fireEvent.click(within(today).getByRole("button", { name: "+ Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(within(today).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" })).toBeTruthy());
    // A done seed is copied for today (repeatOf); a seed never played would go by templateId (planChips test).
    expect(api.calls.find((call) => call.method === "POST" && call.url === "/goals")?.body).toEqual({ repeatOf: "g1", forTomorrow: false });
    // Today is no longer empty: the plan gives way to the list.
    expect(today.querySelector("[data-plan]")).toBeNull();
  });

  it("«Начать» opens the activity screen; «Не сейчас» keeps the goal open; marking works without the timer", async () => {
    const api = server([WALK, READ]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    fireEvent.click(within(today).getByRole("button", { name: "Начать: Утренняя прогулка 20 мин" }));
    let screenSheet = screen.getByRole("dialog", { name: "Утренняя прогулка 20 мин" });
    expect(screenSheet.getAttribute("data-activity")).toBe("timer");
    expect(within(screenSheet).getByText("20:00")).toBeTruthy();
    expect(within(screenSheet).getByText("Таймер необязателен: отметить можно в любой момент.")).toBeTruthy();
    fireEvent.click(within(screenSheet).getByRole("button", { name: "Не сейчас" }));
    expect(screen.queryByRole("dialog", { name: "Утренняя прогулка 20 мин" })).toBeNull();
    expect(api.calls.some((call) => call.url.endsWith("/complete"))).toBe(false);

    fireEvent.click(within(today).getByRole("button", { name: "Начать: Прочитать 10 страниц" }));
    screenSheet = screen.getByRole("dialog", { name: "Прочитать 10 страниц" });
    expect(screenSheet.getAttribute("data-activity")).toBe("pages");
    fireEvent.click(within(screenSheet).getByRole("button", { name: "Плюс страница" }));
    expect(screenSheet.textContent).toContain("1 / 10");
    fireEvent.click(within(screenSheet).getByRole("button", { name: "Я закончил — отметить" }));
    await screen.findByRole("dialog", { name: "«Прочитать 10 страниц» выполнена" });
    expect(api.calls.some((call) => call.method === "POST" && call.url === "/goals/g2/complete")).toBe(true);
  });

  it("«Начать» in the Дом place sheet opens the activity screen for its open mission", async () => {
    server([WALK, READ]);
    const { container } = await renderApp();
    fireEvent.click(container.querySelector('.map-node[data-node="home"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Дом" });
    fireEvent.click(within(sheet).getByRole("button", { name: /Начать|Войти/ }));
    expect(screen.getByRole("dialog", { name: "Утренняя прогулка 20 мин" }).getAttribute("data-activity")).toBe("timer");
  });

  it("R-XP-8 in the UI: map Proof explains the locked Мастерская without an upload; locked rows are disabled", async () => {
    server([WALK, { id: "w1", title: "Скетч", sphere: "creativity", xpReward: 10, status: "open" }]);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Proof" }));
    const sheet = screen.getByRole("dialog", { name: "Proof: фото к миссии" });
    expect(within(sheet).getByText(/Место «Мастерская» откроется на уровне 2/)).toBeTruthy();
    expect(sheet.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "К миссиям" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    const locked = within(view).getByRole("button", { name: "Место «Мастерская» откроется на уровне 2: Скетч" }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(within(view).queryByRole("button", { name: "Proof: Скетч" })).toBeNull();
  });
});
