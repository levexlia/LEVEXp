// @vitest-environment jsdom
// scene16 «Радость помощника»: the 19 checks of levex_design/scene16/INTEGRATION.md (test 11 is in art.test.ts).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, playerDay } from "@levex/domain";
import { App } from "../App";
import type { Goal } from "../api";
import { JOY_MAP_MS, MILESTONE_LEVELS, MILESTONE_MS, crossedMilestones, milestoneKey, milestoneLive, readSeen, takeMilestone } from "./joy";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Opts = { id?: string; xp?: number; noXp?: "daily_cap" | "own_cap" | "template_already_awarded" };

/** In-memory API with XP, levels (100 XP each), complete and undo. Records every call. */
function server(initial: Goal[], opts: Opts = {}) {
  const goals = initial.map((goal) => ({ ...goal }));
  let xp = opts.xp ?? 0;
  const progress = () => ({ xp, level: Math.floor(xp / 100) + 1, xpBySphere: { health: xp } });
  const player = () => ({
    id: opts.id ?? "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: progress(),
    streak: 3,
    energy: { current: 45, max: 50 },
    today: { day: playerDay(new Date()), awarded: opts.noXp ? 5 : 1, awardCap: 5, ownAwarded: 0, ownAwardCap: 3 },
  });
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url === "/player") return json(player());
    if (url === "/progress") return json(progress());
    if (url === "/room") return json({ placements: [] });
    if (url === "/goals" && method === "GET") return json(goals);
    const done = url.match(/^\/goals\/(.+)\/complete$/);
    if (done) {
      const goal = goals.find((item) => item.id === done[1])!;
      goal.status = "done";
      goal.completedAt = new Date().toISOString();
      if (opts.noXp) {
        goal.xpGranted = 0;
        goal.noXpReason = opts.noXp;
        return json({ goal, progress: progress(), awarded: false, reason: opts.noXp, message: "Записано без XP.", awardedToday: 5, awardCap: 5 });
      }
      goal.xpGranted = 10;
      xp += 10;
      return json({ goal, progress: progress(), awarded: true, awardedToday: 2, awardCap: 5 });
    }
    const undo = url.match(/^\/goals\/(.+)\/undo$/);
    if (undo) {
      const goal = goals.find((item) => item.id === undo[1])!;
      const removedXp = goal.xpGranted ?? 0;
      xp -= removedXp;
      goal.status = "open";
      delete goal.completedAt;
      delete goal.xpGranted;
      goal.undoneAt = new Date().toISOString();
      return json({ goal, progress: progress(), removedXp, awardedToday: 1, awardCap: 5 });
    }
    return json({ error: "not found" }, 404);
  }));
  return { goals, calls, xp: () => xp };
}

const walk = (id = "w", extra: Partial<Goal> = {}): Goal => ({ id, title: "Утренняя прогулка 20 мин", sphere: "health", xpReward: 10, status: "open", templateId: "seed-walk", ...extra });
const readBook = (id = "r"): Goal => ({ id, title: "Прочитать 10 страниц", sphere: "mind", xpReward: 10, status: "open", templateId: "seed-read" });
const doneOld = (id: string): Goal => ({ ...walk(id), status: "done", completedAt: "2026-11-01T08:00:00.000Z", xpGranted: 10 });

async function renderApp() {
  const view = render(<App />);
  await screen.findByText(/Серия: 3/);
  return view;
}
const robotImg = () => document.querySelector(".map-robot img") as HTMLImageElement;
const today = () => screen.getByRole("complementary", { name: "Сегодня" });
async function mark(title: string) {
  fireEvent.click(within(today()).getByRole("button", { name: `Выполнить: ${title}` }));
  await waitFor(() => expect(document.querySelector(".lx-joy-map")).not.toBeNull());
}
const praises = () => [...document.querySelectorAll(".lx-msg--praise")];
function openChat() {
  fireEvent.click(screen.getByRole("button", { name: /ИИ-помощник: открыть чат/ }));
}
function closeChat() {
  fireEvent.click(screen.getByRole("button", { name: "Закрыть чат" }));
}
function closeAfterSheet() {
  const later = screen.queryByRole("button", { name: /Нет|Закрыть|Позже/ });
  if (later && later.closest(".sheet, [role=dialog]")) fireEvent.keyDown(document, { key: "Escape" });
}
function reducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
}

beforeEach(() => {
  vi.useRealTimers();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("A: calm joy on the map", () => {
  it("1. with XP: robot happysoft, «+10 XP» and gold segments; idle again after ≈2.5 s", async () => {
    server([walk(), readBook()], { xp: 20 });
    await renderApp();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(robotImg().dataset.state).toBe("idle");
    await mark("Утренняя прогулка 20 мин");
    expect(robotImg().dataset.state).toBe("happysoft");
    expect(robotImg().getAttribute("src")).toBe("/art/scene16/robot_happy_soft.svg");
    expect(document.querySelector(".lx-joy-float")?.textContent).toBe("+10 XP");
    expect(document.querySelector(".lx-joy-tag")?.textContent).toBe("1 / 1");
    expect(document.querySelectorAll(".xp-seg i.lxadd").length).toBe(2);
    act(() => { vi.advanceTimersByTime(JOY_MAP_MS + 600); });
    expect(robotImg().dataset.state).toBe("idle");
    expect(document.querySelector(".lx-joy-map")).toBeNull();
    expect(document.querySelectorAll(".xp-seg i.lxadd").length).toBe(0);
  });

  it.each(["daily_cap", "own_cap", "template_already_awarded"] as const)("2. after the cap (%s): happysoft, no «XP» and no «+» in A", async (reason) => {
    server([walk(), readBook()], { xp: 50, noXp: reason });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(robotImg().dataset.state).toBe("happysoft");
    const layer = document.querySelector(".lx-joy-map")!;
    expect(layer.textContent).not.toMatch(/XP|\+/);
    expect(document.querySelector(".lx-joy-float")).toBeNull();
    expect(document.querySelectorAll(".xp-seg i.lxadd").length).toBe(0);
  });
});

describe("B: praise in the chat", () => {
  it("3. with XP: «+10 XP» in the praise, no streak words", async () => {
    server([walk(), readBook()], { xp: 20 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    closeAfterSheet();
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
    const bubble = praises()[0]!;
    expect(bubble.textContent).toContain("+10 XP");
    expect(bubble.textContent).toContain("ПОХВАЛА");
    expect(bubble.textContent).not.toMatch(/сери|подряд|дней/i);
    expect(document.querySelector(".lx-chat-root")?.getAttribute("data-happy")).toBe("true");
    expect(document.querySelector(".lx-chat__st")?.textContent).toContain("РАДУЕТСЯ");
    expect(document.querySelector(".lx-chat__robot")?.getAttribute("src")).toBe("/art/scene16/robot_happy_soft.svg");
    // One cycle, then the usual header (art.test.ts covers the timing rule).
    await waitFor(() => expect(document.querySelector(".lx-chat-root")?.getAttribute("data-happy")).toBeNull(), { timeout: 3500 });
    expect(document.querySelector(".lx-chat__robot")?.getAttribute("src")).toMatch(/\/art\/scene15\//);
  });

  it("4. after the cap: no «XP» and no «+N» in the praise, «Записано» is there", async () => {
    server([walk(), readBook()], { xp: 50, noXp: "daily_cap" });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    closeAfterSheet();
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
    const bubble = praises()[0]!.querySelector(".lx-msg__b")!;
    expect(bubble.textContent).not.toMatch(/XP|\+\d/);
    expect(bubble.textContent).toContain("Записано");
  });
});

describe("«Отменить» / «Вернуть»", () => {
  it("5. «Отменить»: no A, no B, no C", async () => {
    // Record of today, made in an earlier session (no joy pending), then taken back here.
    const record = walk("w", { status: "done", completedAt: new Date().toISOString(), xpGranted: 10 });
    server([record, readBook()], { xp: 100 });
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await screen.findByRole("button", { name: "Вернуть запись: Утренняя прогулка 20 мин" });
    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    expect(robotImg().dataset.state).toBe("idle");
    expect(document.querySelector(".lx-joy-map")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    openChat();
    expect(praises()).toHaveLength(0);
  });

  it("6. «Отменить» → level 1 → «Вернуть» → level 2: no second C; A and B are shown", async () => {
    server([walk(), readBook()], { xp: 90 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(await screen.findByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    closeAfterSheet();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(document.querySelector(".lvl-hex b")?.textContent).toBe("01"));
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(document.querySelector(".lvl-hex b")?.textContent).toBe("02"));
    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    expect(robotImg().dataset.state).toBe("happysoft");
    expect(JSON.parse(localStorage.getItem(milestoneKey("p1"))!)).toEqual([2]);
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
  });
});

describe("C: new places, levels 2 and 4 only", () => {
  it("7. the rule: shown on 1→2 and 3→4, not on 2→3 / 4→5, one C for a jump 1→4", () => {
    expect(MILESTONE_LEVELS).toEqual([2, 4]);
    const store = new Map<string, string>();
    const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(takeMilestone(1, 2, "a", kv)).toBe(2);
    expect(takeMilestone(2, 3, "a", kv)).toBeNull();
    expect(takeMilestone(3, 4, "a", kv)).toBe(4);
    expect(takeMilestone(4, 5, "a", kv)).toBeNull();
    expect(takeMilestone(1, 4, "b", kv)).toBe(4);
    expect(JSON.parse(store.get(milestoneKey("b"))!)).toEqual([2, 4]);
    expect(crossedMilestones(2, 2)).toEqual([]);
  });

  it("7. in the app: 1→2 shows C; loading straight at level 2 does not", async () => {
    server([walk(), readBook()], { xp: 90 });
    const first = await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(screen.getByRole("dialog", { name: "Новый уровень" }).getAttribute("data-level")).toBe("2");
    first.unmount();
    localStorage.clear();
    server([readBook()], { xp: 150 });
    await renderApp();
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
  });

  it("7. in the app: 3→4 shows C with Центр LEVEX; 2→3 does not", async () => {
    server([walk(), readBook()], { xp: 190 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    cleanup();
    server([walk(), readBook()], { xp: 290 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    const dialog = screen.getByRole("dialog", { name: "Новый уровень" });
    expect(dialog.getAttribute("data-level")).toBe("4");
    expect(dialog.textContent).toContain("Центр LEVEX");
    expect(dialog.textContent).not.toContain("Proof теперь доступен");
  });

  it("8. one tap anywhere closes C; untouched it closes by itself after 2.0 s", async () => {
    server([walk(), readBook()], { xp: 90, id: "tap" });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    const dialog = screen.getByRole("dialog", { name: "Новый уровень" });
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    fireEvent.click(dialog.querySelector(".lxC-sub")!);
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    cleanup();
    server([walk(), readBook()], { xp: 90, id: "auto" });
    await renderApp();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mark("Утренняя прогулка 20 мин");
    expect(screen.getByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    await act(async () => {}); // let C mount its timer (passive effect) before moving the clock
    act(() => { vi.advanceTimersByTime(MILESTONE_MS - 50); });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).not.toBeNull();
    act(() => { vi.advanceTimersByTime(60); });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
  });

  it("9. reduced motion: static SVGs, no animation classes, static C that also closes after 2 s", async () => {
    reducedMotion();
    server([walk(), readBook()], { xp: 90 });
    await renderApp();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mark("Утренняя прогулка 20 мин");
    expect(robotImg().getAttribute("src")).toBe("/art/scene16/static/robot_happy_soft_static.svg");
    const layer = document.querySelector(".lx-joy-map")!;
    expect(layer.classList.contains("is-static")).toBe(true);
    expect(layer.querySelector(".lx-joy-spark, .lx-joy-hit")).toBeNull();
    expect(document.querySelectorAll(".xp-seg i.lxadd").length).toBe(0);
    const dialog = screen.getByRole("dialog", { name: "Новый уровень" });
    expect(dialog.classList.contains("is-static")).toBe(true);
    expect(dialog.querySelector(".is-anim, .lxC-fx, .lxC-rays, .lxC-wave, .lxC-timerbar")).toBeNull();
    const srcs = [...dialog.querySelectorAll("img")].map((img) => img.getAttribute("src")!).filter((src) => src.includes("scene16"));
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(src).toMatch(/\/art\/scene16\/static\/.+_static\.svg$/);
    await act(async () => {}); // let C mount its timer (passive effect) before moving the clock
    act(() => { vi.advanceTimersByTime(MILESTONE_MS + 10); });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(robotImg().dataset.state).toBe("idle");
  });
});

describe("words and nothing else changes", () => {
  it("10. chat header «ИИ-помощник», map bubble «Помощник», «Серия» stays in the header", async () => {
    server([doneOld("old")], { xp: 10 });
    await renderApp();
    await waitFor(() => expect(document.querySelector(".lx-hint__meta")?.textContent).toBe("Помощник"));
    expect(document.querySelector(".meters .streak")?.textContent).toContain("Серия");
    openChat();
    expect(screen.getByRole("heading", { name: "ИИ-помощник" })).toBeTruthy();
  });

  it("12. XP, progress and API untouched: /progress before and after A, B and C is the same; only GETs besides the mark", async () => {
    const api = server([walk(), readBook()], { xp: 90 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    const before = await (await fetch("/progress")).json();
    const callsBefore = api.calls.length;
    expect(screen.getByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    closeAfterSheet();
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
    closeChat();
    const after = await (await fetch("/progress")).json();
    expect(after).toEqual(before);
    expect(api.calls.slice(callsBefore).every((call) => call.method === "GET")).toBe(true);
    expect(api.calls.filter((call) => call.url.startsWith("/assistant"))).toHaveLength(0);
  });
});

describe("praise while the chat was closed", () => {
  it("13. three marks with the chat closed → one praise, for the last one; no badge; no second on reopen", async () => {
    server([walk("a"), readBook("b"), walk("c", { title: "Записать траты за день", sphere: "finance", templateId: "finance-spend" })], { xp: 0 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    closeAfterSheet();
    await mark("Прочитать 10 страниц");
    closeAfterSheet();
    await mark("Записать траты за день");
    closeAfterSheet();
    const robot = screen.getByRole("button", { name: /ИИ-помощник: открыть чат/ });
    expect(robot.textContent).toBe("");
    expect(document.querySelector("[data-unread], .badge, .unread")).toBeNull();
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
    expect(praises()[0]!.textContent).toContain("Записать траты за день");
    closeChat();
    openChat();
    expect(praises()).toHaveLength(0);
  });

  it("14. the last record is yesterday's (the player day changed) → no praise", async () => {
    server([walk(), readBook()], { xp: 0 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    closeAfterSheet();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(Date.now() + 26 * 3600 * 1000));
    openChat();
    expect(praises()).toHaveLength(0);
  });

  it("15. the last record was taken back → no praise; after «Вернуть» one praise for the new record", async () => {
    server([walk(), readBook()], { xp: 0 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    closeAfterSheet();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await screen.findByRole("button", { name: "Вернуть запись: Утренняя прогулка 20 мин" });
    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    openChat();
    expect(praises()).toHaveLength(0);
    closeChat();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть запись: Утренняя прогулка 20 мин" }));
    await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" });
    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    openChat();
    await waitFor(() => expect(praises()).toHaveLength(1));
  });
});

describe("C flag per player and storage", () => {
  it("16. key per player: p1 writes [2]; p2 still gets C at level 2; a broken value reads as []", async () => {
    server([walk(), readBook()], { xp: 90, id: "p1" });
    const first = await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(screen.getByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    expect(localStorage.getItem("levex.milestone.seen.p1")).toBe("[2]");
    first.unmount();
    server([walk(), readBook()], { xp: 90, id: "p2" });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(screen.getByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    localStorage.setItem(milestoneKey("p3"), "{not json");
    expect(readSeen(localStorage, "p3")).toEqual([]);
    localStorage.setItem(milestoneKey("p3"), "\"2\"");
    expect(readSeen(localStorage, "p3")).toEqual([]);
  });

  it.each([
    ["throws", () => { throw new Error("blocked"); }],
    ["is null", () => null],
  ])("17. no localStorage (getter %s): no C on 1→2 or 3→4; A and B work", async (_label, getter) => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;
    try {
      server([walk(), readBook()], { xp: 90 });
      await renderApp();
      Object.defineProperty(globalThis, "localStorage", { configurable: true, get: getter });
      await mark("Утренняя прогулка 20 мин");
      expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
      expect(robotImg().dataset.state).toBe("happysoft");
      closeAfterSheet();
      openChat();
      await waitFor(() => expect(praises()).toHaveLength(1));
      expect(takeMilestone(3, 4, "p1", null)).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "localStorage", real);
    }
  });
});

describe("C accessibility", () => {
  it("18. focus on ✕ at show; Esc closes and focus returns; if the element is gone, focus goes to the robot", async () => {
    server([walk(), readBook()], { xp: 90 });
    await renderApp();
    const button = within(today()).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" });
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Новый уровень" });
    expect(document.activeElement).toBe(dialog.querySelector(".lxC-x"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    // The «Выполнить» button left the DOM with the finished mission: focus is on the map robot.
    expect(button.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /ИИ-помощник: открыть чат/ }));
  });

  it("18. focus returns to an element that is still there (✕, «На карту», tap, auto-close)", async () => {
    for (const how of ["x", "map", "tap", "auto"] as const) {
      cleanup();
      localStorage.clear();
      server([walk(), readBook()], { xp: 90, id: `f-${how}` });
      await renderApp();
      const keep = screen.getByRole("button", { name: "Все миссии" });
      keep.focus();
      if (how === "auto") vi.useFakeTimers({ shouldAdvanceTime: true });
      fireEvent.click(within(today()).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
      const dialog = await screen.findByRole("dialog", { name: "Новый уровень" });
      // The after-mission sheet may take focus first; the moment remembers what had it before.
      keep.focus();
      if (how === "x") fireEvent.click(dialog.querySelector(".lxC-x")!);
      if (how === "map") fireEvent.click(within(dialog).getByRole("button", { name: "На карту" }));
      if (how === "tap") fireEvent.click(dialog);
      if (how === "auto") {
        await act(async () => {});
        act(() => { vi.advanceTimersByTime(MILESTONE_MS + 10); });
      }
      expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
      expect([keep, screen.queryByRole("button", { name: /ИИ-помощник: открыть чат/ })]).toContain(document.activeElement);
      vi.useRealTimers();
    }
  });

  it("19. aria-live=polite: «Уровень 02, открыто место Парк, открыто место Мастерская» while shown, empty after", async () => {
    expect(milestoneLive(4)).toBe("Уровень 04, открыто место Центр LEVEX");
    server([walk(), readBook()], { xp: 90 });
    await renderApp();
    const live = document.querySelector(".lxC-live")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    await mark("Утренняя прогулка 20 мин");
    expect(live.textContent).toBe("Уровень 02, открыто место Парк, открыто место Мастерская");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(live.textContent).toBe("");
  });

  it("«Как прошло?» waits for C: not under its dimmer; it opens once C is closed (Esc, tap or auto-close)", async () => {
    const after = () => document.querySelector("section.after");
    server([walk(), readBook()], { xp: 90, id: "esc" });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    expect(screen.getByRole("dialog", { name: "Новый уровень" })).toBeTruthy();
    expect(after()).toBeNull();
    // Esc closes only C (capture phase), then the sheet comes and stays open.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
    expect(after()).not.toBeNull();
    cleanup();
    server([walk(), readBook()], { xp: 90, id: "auto2" });
    await renderApp();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mark("Утренняя прогулка 20 мин");
    await act(async () => {});
    expect(after()).toBeNull();
    act(() => { vi.advanceTimersByTime(MILESTONE_MS + 10); });
    expect(after()).not.toBeNull();
  });

  it("without C the sheet opens right after the mark, as before", async () => {
    server([walk(), readBook()], { xp: 20 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    await waitFor(() => expect(document.querySelector("section.after")).not.toBeNull());
    expect(screen.queryByRole("dialog", { name: "Новый уровень" })).toBeNull();
  });
});

describe("level after «Отменить» (review fix)", () => {
  it("header and profile drop 2 → 1 from the undo answer at once, even while the reload is still on its way", async () => {
    const api = server([walk(), readBook()], { xp: 90 });
    await renderApp();
    await mark("Утренняя прогулка 20 мин");
    fireEvent.keyDown(document, { key: "Escape" }); // C
    fireEvent.keyDown(document, { key: "Escape" }); // «Как прошло?»
    await waitFor(() => expect(document.querySelector(".lvl-hex b")?.textContent).toBe("02"));
    fireEvent.click(screen.getAllByRole("button", { name: /Профиль/ })[0]);
    await screen.findByText("Уровень 2");
    // From now on GET /player hangs: only the undo answer can bring the new level.
    const real = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => (String(input) === "/player" ? new Promise<Response>(() => {}) : real(input, init))));
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(document.querySelector(".lvl-hex b")?.textContent).toBe("01"));
    expect(screen.getByText("Уровень 1")).toBeTruthy();
    expect(document.body.textContent).toContain("Proof открывается вместе с Мастерской на уровне 2.");
    expect(api.xp()).toBe(90);
  });
});

describe("hint bubble → chat (review fix)", () => {
  it("«Открыть чат» in the bubble opens the chat; the bubble text itself is not a button", async () => {
    server([doneOld("old")], { xp: 10 });
    await renderApp();
    const bubble = await waitFor(() => {
      const el = document.querySelector(".map-hint");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const buttons = [...bubble.querySelectorAll("button")].map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect([...buttons].sort()).toEqual(["Открыть чат", "Скрыть до завтра"]);
    fireEvent.click(within(bubble).getByRole("button", { name: "Открыть чат" }));
    expect(screen.getByRole("heading", { name: "ИИ-помощник" })).toBeTruthy();
  });
});
