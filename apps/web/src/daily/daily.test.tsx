// @vitest-environment jsdom
/** Usefulness v1 (spec 24.11.2026): «Повторить завтра» + empty-day plan, «Начать», micro-reflection, limit texts. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, SPHERE_TEMPLATES, builtInTemplate, noXpMessage } from "@levex/domain";
import { App } from "../App";
import type { Goal } from "../api";
import { placelessBoard, planChips, todayBoard } from "../map/missions";
import { sphereHint, sphereRows } from "../map/resources";
import { activityAid, clock } from "./activity";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** In-memory API with the new fields. `capped` makes the next completion a no-XP record (daily_cap). */
function server(initial: Goal[], options: { level?: number; awarded?: number; capped?: boolean; xpBySphere?: Record<string, number> } = {}) {
  const goals = initial.map((goal) => ({ ...goal }));
  const level = options.level ?? 1;
  const player = {
    id: "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: { xp: (level - 1) * 100, level, xpBySphere: { ...(options.xpBySphere ?? {}) } as Record<string, number> },
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
    const del = url.match(/^\/goals\/([^/]+)$/);
    if (del && method === "DELETE") {
      const index = goals.findIndex((goal) => goal.id === del[1]);
      if (index < 0) return json({ error: "goal not found" }, 404);
      if (goals[index]!.status !== "open") return json({ error: "only an open mission can be deleted" }, 409);
      goals.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (url === "/goals" && method === "POST") {
      const source = goals.find((goal) => goal.id === body.repeatOf);
      const goal: Goal = {
        id: `n${calls.length}`,
        title: source?.title ?? body.title ?? builtInTemplate(body.templateId)?.title ?? "Прочитать 10 страниц",
        sphere: source?.sphere ?? body.sphere ?? builtInTemplate(body.templateId)?.sphere ?? "health",
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
    expect(chips.map((chip) => chip.title)).toEqual([
      "Утренняя прогулка 20 мин", "Прочитать 10 страниц",
      "25 минут над важной задачей", "Записать траты за день", "Написать близкому человеку",
      "Зарядка",
    ]);
    expect(chips[0]).toMatchObject({ repeatOf: "g1" });
    // A fresh player without seed goals gets the seed template ids.
    expect(planChips([], 1).map((chip) => chip.templateId)).toEqual(["seed-walk", "seed-read", "career-focus", "finance-spend", "rel-write"]);
    // An open seed is not offered again.
    expect(planChips([WALK, done(READ)], 1).map((chip) => chip.key)).toEqual(["seed-read", "career-focus", "finance-spend", "rel-write"]);
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
    // seed-walk already paid today, but tomorrow's copy is judged tomorrow: no «без XP сегодня» on it.
    expect(board.later[0]!.noXpToday).toBe(false);
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
    fireEvent.click(within(screenSheet).getByRole("button", { name: "Готово — отметить" }));
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

  it("open missions say «без XP сегодня» once the daily cap is reached (no «+10 XP» promise)", async () => {
    const paid: Goal[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, title: `Дело ${i}`, sphere: "career", xpReward: 10, xpGranted: 10, status: "done", completedAt: new Date().toISOString(),
    }));
    server([...paid, { id: "o1", title: "Разобрать стол", sphere: "health", xpReward: 10, status: "open" }], { awarded: 5 });
    await renderApp();
    const row = screen.getByRole("complementary", { name: "Сегодня" }).querySelector('[data-mission="o1"]')!;
    expect(row.textContent).toContain("без XP сегодня");
    expect(row.textContent).not.toContain("+10 XP");
  });

  it("an own mission after 3 own awards and a same-template repeat also say «без XP сегодня»", () => {
    const now = new Date();
    const at = now.toISOString();
    const goals: Goal[] = [
      ...[1, 2, 3].map((i) => ({ id: `s${i}`, title: `Своя ${i}`, sphere: "health", xpReward: 10, xpGranted: 10, status: "done" as const, completedAt: at })),
      { ...WALK, status: "done", completedAt: at, xpGranted: 10 },
      { id: "own4", title: "Своя 4", sphere: "health", xpReward: 10, status: "open" },
      { id: "walk2", title: WALK.title, sphere: "health", xpReward: 10, status: "open", templateId: "seed-walk" },
      { id: "read", title: READ.title, sphere: "mind", xpReward: 10, status: "open", templateId: "seed-read" },
    ];
    const rows = new Map(todayBoard(goals, now, 10).open.map((row) => [row.id, row.noXpToday]));
    expect(rows.get("own4")).toBe(true);
    expect(rows.get("walk2")).toBe(true);
    expect(rows.get("read")).toBe(false);
  });

  it("Миссии: tomorrow's copy is in its own «Завтра» group, not under «Доступны»", async () => {
    server([{ ...WALK, id: "t1", availableFrom: "2099-01-01" }, READ]);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    const headings = [...view.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toContain("Завтра");
    const lists = [...view.querySelectorAll("ul.missions")];
    expect(lists[0]!.querySelector('[data-mission="t1"]')).toBeNull();
    expect(lists[1]!.querySelector('[data-mission="t1"]')).not.toBeNull();
  });

  it("«Отменить» after «Да, на завтра» deletes the copy and asks again", async () => {
    const api = server([WALK]);
    await renderApp();
    fireEvent.click(within(screen.getByRole("complementary", { name: "Сегодня" })).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    const sheet = await screen.findByRole("dialog", { name: /выполнена/ });
    fireEvent.click(within(sheet).getByRole("button", { name: "Да, на завтра" }));
    fireEvent.click(await within(sheet).findByRole("button", { name: "Отменить" }));
    await within(sheet).findByRole("button", { name: "Да, на завтра" });
    const created = api.calls.find((call) => call.method === "POST" && call.url === "/goals")!;
    expect(created).toBeTruthy();
    const deleted = api.calls.filter((call) => call.method === "DELETE");
    expect(deleted).toHaveLength(1);
    expect(api.goals.some((goal) => goal.repeatOf === "g1")).toBe(false);
  });

  it("20 open own missions: the form is off with the calm text; «Удалить» frees a place", async () => {
    const own: Goal[] = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, title: `Своя ${i}`, sphere: "career", xpReward: 10, status: "open" }));
    const api = server(own);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    expect(within(view).getByText("Активных своих миссий уже 20. Закрой или удали одну, чтобы добавить новую.")).toBeTruthy();
    fireEvent.change(within(view).getByLabelText("Что сделать"), { target: { value: "Ещё" } });
    expect((within(view).getByRole("button", { name: "Добавить миссию" }) as HTMLButtonElement).disabled).toBe(true);
    // «Удалить» asks first: «Отмена» keeps the mission, nothing is sent.
    fireEvent.click(within(view).getByRole("button", { name: "Удалить: Своя 0" }));
    expect(within(view).getByText("Удалить миссию?")).toBeTruthy();
    fireEvent.click(within(view).getByRole("button", { name: "Отмена" }));
    expect(within(view).queryByText("Удалить миссию?")).toBeNull();
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
    fireEvent.click(within(view).getByRole("button", { name: "Удалить: Своя 0" }));
    fireEvent.click(within(view).getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(view.querySelector('[data-own-full="true"]')).toBeNull());
    expect(api.calls.some((call) => call.method === "DELETE" && call.url === "/goals/o0")).toBe(true);
    expect((within(view).getByRole("button", { name: "Добавить миссию" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("activity: «Запустить таймер» is the main button and nothing starts by itself; pages say «Цель достигнута»", async () => {
    server([WALK, READ]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    fireEvent.click(within(today).getByRole("button", { name: "Начать: Утренняя прогулка 20 мин" }));
    const walk = screen.getByRole("dialog", { name: "Утренняя прогулка 20 мин" });
    const start = within(walk).getByRole("button", { name: "Запустить таймер" });
    expect(start.className).toContain("activity__start");
    expect(start.className).not.toContain("lx-btn--secondary");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(within(walk).getByText("20:00")).toBeTruthy();
    fireEvent.click(within(walk).getByRole("button", { name: "Не сейчас" }));
    fireEvent.click(within(today).getByRole("button", { name: "Начать: Прочитать 10 страниц" }));
    const read = screen.getByRole("dialog", { name: "Прочитать 10 страниц" });
    for (let i = 0; i < 9; i += 1) fireEvent.click(within(read).getByRole("button", { name: "Плюс страница" }));
    expect(within(read).queryByText("Цель достигнута")).toBeNull();
    fireEvent.click(within(read).getByRole("button", { name: "Плюс страница" }));
    expect(within(read).getByText("Цель достигнута")).toBeTruthy();
    fireEvent.click(within(read).getByRole("button", { name: "Плюс страница" }));
    expect(read.textContent).toContain("11 / 10");
    expect(within(read).getByText("Цель достигнута")).toBeTruthy();
  });

  it("locked Мастерская: 50 XP a day pace, and a caption for the disabled «Войти»; Proof explains itself", async () => {
    server([WALK], { level: 2 });
    const view = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Proof" }));
    expect(screen.getByText("Proof — фото того, что сделано своими руками. Оно попадёт в галерею.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    view.unmount();
    server([WALK]);
    const fresh = await renderApp();
    fireEvent.click(fresh.container.querySelector('.map-node[data-node="workshop"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Мастерская" });
    // A fresh player needs 100 XP: at most 50 a day, so honestly 2–3 days (1–2 once 50 XP are in).
    expect(within(sheet).getByText("За день можно получить до 50 XP, поэтому обычно это 2–3 дня.")).toBeTruthy();
    expect(within(sheet).getByText("Войти можно с уровня 2")).toBeTruthy();
  });

  it("Ресурсы: all 8 spheres; the empty ones are dimmed with a hint where they grow", async () => {
    server([WALK], { xpBySphere: { health: 20, mind: 10 } });
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Ресурсы" }));
    const rows = document.querySelectorAll(".bars li");
    expect(rows.length).toBe(8);
    expect(document.querySelectorAll(".bars li.is-zero").length).toBe(6);
    const health = document.querySelector('[data-sphere="health"]')!;
    expect(health.classList.contains("is-zero")).toBe(false);
    expect(health.querySelector(".bars__hint")).toBeNull();
    const park = document.querySelector('[data-sphere="spirit"]')!;
    expect(park.querySelector(".bars__hint")?.textContent).toBe("Растёт от миссий в месте «Парк»: тишина, прогулка без телефона. Место откроется на уровне 2.");
    expect(document.querySelector('[data-sphere="finance"] .bars__hint')?.textContent).toBe("Растёт от миссий без места на карте, например «Записать траты за день». Добавить можно во вкладке «Миссии».");
  });

  it("sphereRows: domain order, 0 for missing, the lock note disappears once the place is open", () => {
    const rows = sphereRows({ creativity: 15 }, 2);
    expect(rows.map((row) => row.id)).toEqual(["health", "mind", "career", "finance", "relationships", "creativity", "spirit", "community"]);
    expect(rows.find((row) => row.id === "creativity")).toMatchObject({ xp: 15, zero: false, hint: null });
    expect(rows.find((row) => row.id === "spirit")?.hint).toBe("Растёт от миссий в месте «Парк»: тишина, прогулка без телефона.");
    expect(sphereHint("community", 2)).toBe("Растёт от миссий в месте «Центр LEVEX»: помощь другим. Место откроется на уровне 4.");
    expect(sphereHint("health", 1)).toBe("Растёт от миссий в месте «Дом»: прогулка, зарядка, сон.");
  });

  it("Ресурсы and Профиль have clear empty states", async () => {
    server([WALK]);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Ресурсы" }));
    expect(document.querySelector('[data-empty="resources"]')?.textContent).toMatch(/в каких сферах жизни копится XP/);
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    expect(document.querySelector('[data-empty="gallery"]')?.textContent).toMatch(/Галерея пока пуста.*уровне 2/s);
  });
});

describe("placeless sphere missions (Карьера, Финансы, Отношения)", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("each template brings its own aid: a timer or steps", () => {
    expect(activityAid("25 минут над важной задачей", "career-focus")).toEqual({ kind: "timer", minutes: 25 });
    const steps = activityAid("Записать траты за день", "finance-spend");
    expect(steps.kind).toBe("steps");
    for (const t of SPHERE_TEMPLATES) expect(activityAid(t.title, t.id).kind).not.toBe("stopwatch");
  });

  it("placelessBoard: open today → «open», gave XP today → «awarded», otherwise «add»", () => {
    const now = new Date("2026-11-24T08:00:00.000Z");
    const goals: Goal[] = [
      { id: "a", title: "Проверить одну подписку", sphere: "finance", xpReward: 10, status: "open", templateId: "finance-sub" },
      { id: "b", title: "Поблагодарить кого-то", sphere: "relationships", xpReward: 10, status: "done", templateId: "rel-thanks", completedAt: "2026-11-24T07:00:00.000Z", xpGranted: 10 },
    ];
    const board = placelessBoard(goals, now);
    expect(board.map((group) => group.name)).toEqual(["Карьера", "Финансы", "Отношения"]);
    const state = (id: string) => board.flatMap((group) => group.rows).find((row) => row.template.id === id)!.state;
    expect(state("finance-sub")).toBe("open");
    expect(state("rel-thanks")).toBe("awarded");
    expect(state("career-focus")).toBe("add");
  });

  it("Миссии tab at level 1: 9 placeless missions; adding one sends only the template id and shows its sphere", async () => {
    const api = server([WALK, READ], { level: 1 });
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    const block = within(view).getByRole("region", { name: "Без места на карте" });
    expect(block.querySelectorAll("[data-template]")).toHaveLength(9);
    fireEvent.click(within(block).getByRole("button", { name: "Добавить: Записать траты за день" }));
    await waitFor(() => expect(within(block).getByRole("button", { name: "Записать траты за день: уже в списке" })).toBeTruthy());
    const post = api.calls.find((call) => call.method === "POST" && call.url === "/goals")!;
    expect(post.body).toEqual({ templateId: "finance-spend" });
    const row = view.querySelector(`[data-mission="${api.goals.at(-1)!.id}"]`)!;
    expect(row.textContent).toContain("Финансы");
    expect(row.querySelector("img.mission__icon")?.getAttribute("src")).toBe("/map/sp_finance.svg");
  });

  it("«Начать» on a finance mission: steps, no amounts, and «Готово — отметить» closes it with +10 XP", async () => {
    const spend: Goal = { id: "f1", title: "Записать траты за день", sphere: "finance", xpReward: 10, status: "open", templateId: "finance-spend" };
    const api = server([spend]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    fireEvent.click(within(today).getByRole("button", { name: "Начать: Записать траты за день" }));
    const sheet = screen.getByRole("dialog", { name: "Записать траты за день" });
    expect(sheet.textContent).toContain("Занятие · Финансы");
    expect(sheet.querySelector('[data-no-amounts="true"]')?.textContent).toBe("Суммы в игре не нужны и нигде не сохраняются.");
    expect(sheet.querySelector("input[type=number]")).toBeNull();
    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) fireEvent.click(box);
    expect(within(sheet).getByText("Все шаги пройдены")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Готово — отметить" }));
    await waitFor(() => expect(document.querySelector(".after")).toBeTruthy());
    const complete = api.calls.find((call) => call.url === "/goals/f1/complete")!;
    expect(complete.body ?? {}).toEqual({});
    expect(api.goals[0]).toMatchObject({ status: "done", xpGranted: 10 });
  });

  it("empty-day plan offers one mission per placeless sphere at level 1", () => {
    const chips = planChips([], 1).filter((chip) => chip.sphere);
    expect(chips.map((chip) => [chip.sphere, chip.templateId])).toEqual([
      ["career", "career-focus"], ["finance", "finance-spend"], ["relationships", "rel-write"],
    ]);
    // Once a template gave XP today, the plan offers the next one of that sphere.
    const now = new Date();
    const done: Goal = { id: "x", title: "Записать траты за день", sphere: "finance", xpReward: 10, status: "done", templateId: "finance-spend", completedAt: now.toISOString(), xpGranted: 10 };
    expect(planChips([done], 1, now).find((chip) => chip.sphere === "finance")?.templateId).toBe("finance-sub");
  });
});
