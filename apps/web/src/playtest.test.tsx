// @vitest-environment jsdom
/** Regressions from the PR #13 playtest (22.11.2026): missions path, builder reset, toast, «Сегодня», Proof, place sheet. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, nicknameError } from "./App";
import { Toast, TOAST_MS } from "./Controls";
import { DEFAULT_AVATAR_CONFIG } from "@levex/domain";

type G = { id: string; title: string; sphere?: string; xpReward: number; status: "open" | "done"; completedAt?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A tiny in-memory server: completing a goal adds its XP, as the API does on the first completion only. */
function server(initial: G[], options: { avatarAnswerWithoutDerived?: boolean; level?: number } = {}) {
  const goals = initial.map((goal) => ({ ...goal }));
  const player = {
    id: "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    // Level 2 opens Мастерская (R-XP-8); level 1 keeps it locked as for a new player.
    progress: { xp: ((options.level ?? 1) - 1) * 100, level: options.level ?? 1, xpBySphere: {} as Record<string, number> },
    streak: 1,
    energy: { current: 35, max: 50 },
  };
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === "/player" && method === "GET") return json(player);
    if (url === "/player" && method === "PATCH") {
      player.nickname = String(body.nickname).trim();
      return json(player);
    }
    if (url === "/goals" && method === "GET") return json(goals);
    if (url === "/goals" && method === "POST") {
      const goal: G = { id: `n${goals.length}`, title: body.title, sphere: body.sphere, xpReward: 10, status: "open" };
      goals.push(goal);
      return json(goal, 201);
    }
    const done = url.match(/^\/goals\/(.+)\/complete$/);
    if (done && method === "POST") {
      const goal = goals.find((item) => item.id === done[1])!;
      if (goal.status === "open") {
        goal.status = "done";
        goal.completedAt = new Date().toISOString();
        player.progress.xp += goal.xpReward;
        player.energy = { current: player.energy.current - 5, max: 50 };
      }
      return json({ goal, progress: player.progress });
    }
    if (url === "/room") return json({ placements: [] });
    if (url === "/player/avatar" && method === "PUT") {
      // The API before the fix answered without streak and energy.
      const { streak: _s, energy: _e, ...bare } = player;
      return json(options.avatarAnswerWithoutDerived ? { ...bare, avatarConfig: body } : { ...player, avatarConfig: body });
    }
    return json({ error: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { goals, player, calls };
}

async function renderApp() {
  const view = render(<App />);
  await screen.findByText(/Серия: 1/);
  return view;
}

const OPEN: G[] = [
  { id: "g1", title: "Утренняя прогулка 20 мин", sphere: "health", xpReward: 10, status: "open" },
  { id: "g2", title: "Прочитать 10 страниц", sphere: "mind", xpReward: 10, status: "open" },
];

describe("playtest fixes", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("Миссии: title, statuses, «Выполнить» marks a mission done through the API", async () => {
    const api = server(OPEN);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    expect(within(view).getByRole("heading", { name: "Миссии" })).toBeTruthy();
    const row = view.querySelector('[data-mission="g1"]')!;
    expect(row.textContent).toContain("Доступна");
    fireEvent.click(within(view).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(view.querySelector('[data-mission="g1"]')?.getAttribute("data-status")).toBe("done"));
    expect(view.querySelector('[data-mission="g1"]')!.textContent).toContain("Выполнена");
    expect(api.calls.some((call) => call.method === "POST" && call.url === "/goals/g1/complete")).toBe(true);
    expect(within(view).getByText("Выполненная миссия повторно XP не даёт.")).toBeTruthy();
    // No dead end: the done mission has no action, the open one still does.
    expect(within(view).queryByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" })).toBeNull();
    expect(within(view).getByRole("button", { name: "Выполнить: Прочитать 10 страниц" })).toBeTruthy();
  });

  it("Миссии: empty states and a new mission through POST /goals", async () => {
    const api = server([]);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    expect(view.querySelector('[data-empty="open"]')?.textContent).toBe("Миссий пока нет. Добавь первую ниже.");
    fireEvent.change(within(view).getByLabelText("Что сделать"), { target: { value: "  Зарядка 10 мин " } });
    fireEvent.click(within(view).getByRole("button", { name: "Добавить миссию" }));
    await waitFor(() => expect(view.querySelector('[data-status="open"]')?.textContent).toContain("Зарядка 10 мин"));
    expect(api.calls.find((call) => call.method === "POST" && call.url === "/goals")?.body).toEqual({ title: "Зарядка 10 мин", sphere: "health" });
  });

  it("Миссии: Workshop missions are finished with Proof, which links the photo to that mission", async () => {
    server([{ id: "w1", title: "Нарисовать закат", sphere: "creativity", xpReward: 10, status: "open" }], { level: 2 });
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    fireEvent.click(screen.getByRole("button", { name: "Proof: Нарисовать закат" }));
    const sheet = screen.getByRole("dialog", { name: "Proof: фото к миссии" });
    expect(sheet.querySelector("[data-proof-goal]")?.getAttribute("data-proof-goal")).toBe("w1");
    expect(within(sheet).getByText(/«Нарисовать закат»/)).toBeTruthy();
  });

  it("«Готово» in the builder keeps streak and energy (API answer without them)", async () => {
    server(OPEN, { avatarAnswerWithoutDerived: true });
    const { container } = await renderApp();
    const meters = () => container.querySelector(".meters")!.textContent;
    expect(meters()).toContain("01");
    expect(meters()).toContain("35/50");
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(screen.getByRole("button", { name: "Собрать персонажа" }));
    // The builder is a page with «Назад»; the tab bar stays.
    expect(screen.getByRole("button", { name: "← Назад" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Разделы" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Создать по фото" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await screen.findByRole("img", { name: "Мой персонаж" });
    expect(meters()).toContain("01");
    expect(meters()).toContain("35/50");
    expect(meters()).not.toContain("50/50");
  });

  it("+XP is a toast in a live region, not a banner that moves the map", async () => {
    server(OPEN);
    const { container } = await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    fireEvent.click(within(today).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
    const toast = await waitFor(() => {
      const node = container.querySelector(".toast-live .toast");
      expect(node).not.toBeNull();
      return node!;
    });
    expect(toast.textContent).toBe("+10 XP · «Утренняя прогулка 20 мин» выполнена");
    const live = container.querySelector(".toast-live")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.parentElement?.tagName).not.toBe("MAIN");
    expect(container.querySelector("main .banner")).toBeNull();
  });

  it("the toast hides itself after 3 s", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { rerender } = render(<Toast toast={{ id: 1, text: "+10 XP" }} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    rerender(<Toast toast={null} onDone={onDone} />);
    expect(document.querySelector(".toast")).toBeNull();
    expect(TOAST_MS).toBe(3000);
  });

  it("«Сегодня» lists the same open missions and offers a plan, not «нет», when all are done", async () => {
    server([{ ...OPEN[0]!, status: "done", completedAt: new Date().toISOString() }, OPEN[1]!]);
    await renderApp();
    const today = screen.getByRole("complementary", { name: "Сегодня" });
    expect(within(today).getByText("Прочитать 10 страниц")).toBeTruthy();
    expect(today.textContent).toContain("Выполнено сегодня: 1");
    expect(today.textContent).not.toContain("Миссий пока нет");
    fireEvent.click(within(today).getByRole("button", { name: "Выполнить: Прочитать 10 страниц" }));
    // Spec №1: an empty day shows a plan instead of only the form: «Можно снова:» first, max 3 buttons.
    // Both seeds already gave XP today: new missions come first and fill the 3 buttons, so no «Можно снова» block.
    await waitFor(() => expect(today.querySelector('[data-empty="today"]')?.textContent).toMatch(/^На сегодня дел нет\.Можно взять:/));
    expect(today.querySelectorAll("[data-plan]")).toHaveLength(3);
    expect(today.querySelector('[data-plan-block="repeat"]')).toBeNull();
  });

  it("Proof sheet: empty caption with a placeholder, Russian photo picker, closes on Esc and on the backdrop", async () => {
    server(OPEN, { level: 2 });
    const { container } = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Proof" }));
    let sheet = screen.getByRole("dialog", { name: "Proof: фото к миссии" });
    const caption = within(sheet).getByLabelText("Подпись") as HTMLInputElement;
    expect(caption.value).toBe("");
    expect(caption.placeholder).toBe("Например: Тёплый свет");
    expect(within(sheet).getByText("Выбрать фото")).toBeTruthy();
    expect(within(sheet).getByText("Фото не выбрано")).toBeTruthy();
    expect(within(sheet).getByText(/Новая миссия в месте «Мастерская»/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Proof: фото к миссии" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Proof" }));
    sheet = screen.getByRole("dialog", { name: "Proof: фото к миссии" });
    fireEvent.click(container.querySelector(".sheet-back")!);
    expect(screen.queryByRole("dialog", { name: "Proof: фото к миссии" })).toBeNull();
  });

  it("a done place opens its own missions («Миссии места») and says a repeat gives no XP", async () => {
    server([{ ...OPEN[0]!, status: "done", completedAt: "2026-11-22T08:00:00.000Z" }, OPEN[1]!]);
    const { container } = await renderApp();
    fireEvent.click(container.querySelector('.map-node[data-node="home"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Дом" });
    expect(within(sheet).getByText("Пройденные миссии повторно XP не дают.")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: /Повторить/ })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Миссии места" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    expect(within(view).getByRole("button", { name: "Дом" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.querySelectorAll(".mission")).toHaveLength(1);
  });

  it("a locked place points calmly to where XP comes from, with a link to missions", async () => {
    server(OPEN);
    const { container } = await renderApp();
    fireEvent.click(container.querySelector('.map-node[data-node="park"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Парк" });
    expect(within(sheet).getByText(/Опыт дают миссии\. Например, выполни миссию в месте «Дом»\./)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "К миссиям" }));
    expect(within(screen.getByRole("region", { name: "Миссии" })).getByRole("button", { name: "Дом" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Профиль: nickname «Игрок» can be changed, with a length check", async () => {
    const api = server(OPEN);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    expect(screen.getByText("Игрок")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Сменить ник" }));
    const input = screen.getByLabelText("Ник");
    fireEvent.change(input, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "я".repeat(33) } });
    expect(screen.getByText("Не длиннее 32 символов")).toBeTruthy();
    fireEvent.change(input, { target: { value: " Лия " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Лия")).toBeTruthy();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ nickname: "Лия" });
    expect(nicknameError("")).toBe("Введи ник");
    expect(nicknameError("Лия")).toBeNull();
  });
});
