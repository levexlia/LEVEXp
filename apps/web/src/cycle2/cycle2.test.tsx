// @vitest-environment jsdom
// cycle2 «Чистый Сегодня и честное Завтра»: P-C1 order of «Сегодня», P-C2 folded history,
// P-C3 tomorrow's copy is not done today, P-C5 «всё сделано» ≠ «пустой день».
// Data follows the cycle2 SIMULATION (Вика with missed days, Аня with 3 habits a day); no user research.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, playerDay, shiftDay } from "@levex/domain";
import { App } from "../App";
import type { Goal } from "../api";
import { emptyDayActive, pickHint } from "../assistant/hints";
import { REPEAT_NOTE, missionBoard, todayBoard } from "../map/missions";
import { placeSheet } from "../map/placeSheet";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** In-memory API: GET only plus /complete with the server's not_yet rule. */
function server(initial: Goal[]) {
  const goals = initial.map((goal) => ({ ...goal }));
  const player = {
    id: "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: { xp: 30, level: 1, xpBySphere: { health: 10, mind: 10, relationships: 10 } },
    streak: 1,
    energy: { current: 35, max: 50 },
    today: { day: playerDay(new Date()), awarded: 3, awardCap: 5, ownAwarded: 0, ownAwardCap: 3 },
  };
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url === "/player") return json(player);
    if (url === "/room") return json({ placements: [] });
    if (url === "/goals" && method === "GET") return json(goals);
    if (url === "/goals" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { templateId?: string; repeatOf?: string };
      const source = goals.find((goal) => goal.id === body.repeatOf);
      const goal: Goal = { id: `n${calls.length}`, title: source?.title ?? "Записать траты за день", sphere: source?.sphere ?? "finance", xpReward: 10, status: "open", templateId: body.templateId ?? source?.templateId, repeatOf: body.repeatOf };
      goals.push(goal);
      return json(goal, 201);
    }
    const done = url.match(/^\/goals\/(.+)\/complete$/);
    if (done) {
      const goal = goals.find((item) => item.id === done[1])!;
      if (goal.availableFrom && goal.availableFrom > playerDay(new Date())) {
        return json({ error: "not_yet", message: "Эта миссия на DD.MM", availableFrom: goal.availableFrom }, 409);
      }
      goal.status = "done";
      goal.completedAt = new Date().toISOString();
      goal.xpGranted = 10;
      return json({ goal, progress: player.progress, awarded: true, awardedToday: 4, awardCap: 5 });
    }
    return json({ error: "not found" }, 404);
  }));
  return { goals, calls };
}

async function renderApp() {
  const view = render(<App />);
  await screen.findByText(/Серия: 1/);
  return view;
}

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
/** 08:30 in Israel (winter, UTC+2) on a player day. */
const morning = (day: string) => `${day}T06:30:00.000Z`;

type Tpl = { key: string; title: string; sphere: string; templateId?: string };
const WALK: Tpl = { key: "walk", title: "Утренняя прогулка 20 мин", sphere: "health", templateId: "seed-walk" };
const READ: Tpl = { key: "read", title: "Прочитать 10 страниц", sphere: "mind", templateId: "seed-read" };
const WRITE: Tpl = { key: "write", title: "Написать близкому человеку", sphere: "relationships", templateId: "rel-write" };

/**
 * SIMULATION A (Аня): days 1..`days`, three habits a day, «Повторить завтра» after each; the last day is `today`.
 * Ends with three open copies for tomorrow. days=1 is «evening of day 1», days=14 gives 42 records.
 */
function anya(today: string, days: number): Goal[] {
  const goals: Goal[] = [];
  const prev = new Map<string, string>();
  for (let d = 1; d <= days; d += 1) {
    const day = shiftDay(today, d - days);
    for (const tpl of [WALK, READ, WRITE]) {
      const id = `${tpl.key}-${d}`;
      goals.push({
        id, title: tpl.title, sphere: tpl.sphere, xpReward: 10, status: "done", templateId: tpl.templateId,
        completedAt: morning(day), xpGranted: 10,
        ...(prev.has(tpl.key) ? { repeatOf: prev.get(tpl.key), availableFrom: day } : {}),
      });
      prev.set(tpl.key, id);
    }
  }
  for (const tpl of [WALK, READ, WRITE]) {
    goals.push({ id: `${tpl.key}-next`, title: tpl.title, sphere: tpl.sphere, xpReward: 10, status: "open", templateId: tpl.templateId, repeatOf: prev.get(tpl.key), availableFrom: shiftDay(today, 1) });
  }
  return goals;
}

/**
 * SIMULATION C (Вика), back on day 8 after days 4–7 away, in the store's order: the seeds, her own
 * «Растяжка 10 мин» and the abandoned «Разобрать почту», then «Повторить завтра» copies of days 1–3.
 */
function vika(day8: string): Goal[] {
  const day = (n: number) => shiftDay(day8, n - 8);
  const at = (n: number) => `${day(n)}T17:00:00.000Z`;
  const done = { status: "done" as const, xpGranted: 10 };
  return [
    { id: "walk", title: WALK.title, sphere: "health", xpReward: 10, templateId: "seed-walk", ...done, completedAt: at(1) },
    { id: "read", title: READ.title, sphere: "mind", xpReward: 10, templateId: "seed-read", status: "open" },
    { id: "stretch", title: "Растяжка 10 мин", sphere: "health", xpReward: 10, ...done, completedAt: at(1) },
    { id: "mail", title: "Разобрать почту", sphere: "mind", xpReward: 10, status: "open" },
    { id: "walk2", title: WALK.title, sphere: "health", xpReward: 10, templateId: "seed-walk", repeatOf: "walk", availableFrom: day(2), ...done, completedAt: at(2) },
    { id: "stretch2", title: "Растяжка 10 мин", sphere: "health", xpReward: 10, templateId: "own:stretch", repeatOf: "stretch", availableFrom: day(2), ...done, completedAt: at(2) },
    { id: "walk3", title: WALK.title, sphere: "health", xpReward: 10, templateId: "seed-walk", repeatOf: "walk2", availableFrom: day(3), ...done, completedAt: at(3) },
    { id: "stretch3", title: "Растяжка 10 мин", sphere: "health", xpReward: 10, templateId: "own:stretch", repeatOf: "stretch2", availableFrom: day(3), ...done, completedAt: at(3) },
    { id: "walk4", title: WALK.title, sphere: "health", xpReward: 10, templateId: "seed-walk", repeatOf: "walk3", availableFrom: day(4), status: "open" },
    { id: "stretch4", title: "Растяжка 10 мин", sphere: "health", xpReward: 10, templateId: "own:stretch", repeatOf: "stretch3", availableFrom: day(4), status: "open" },
  ];
}

beforeEach(() => {
  vi.useRealTimers();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("P-C1: order of «Сегодня» (pure)", () => {
  // Day 8 of the simulation = Mon 07.12.2026, 19:00 in Israel.
  const day8 = "2026-12-07";
  const now = new Date("2026-12-07T17:00:00.000Z");

  it("Вика, day 8: her planned habit copies first, then the seed, the abandoned own mission behind «Ещё 1»", () => {
    const goals = vika(day8);
    const before = missionBoard(goals, null, now);
    const today = todayBoard(goals, now);
    expect(today.open.map((row) => row.title)).toEqual(["Растяжка 10 мин", "Утренняя прогулка 20 мин", "Прочитать 10 страниц"]);
    expect(today.open[0]!.id).toBe("stretch4");
    // Counters and the Missions tab are unchanged: all 4 open, in the API order, nothing hidden or deleted.
    expect(today.openTotal).toBe(4);
    expect(today.doneToday).toBe(0);
    expect(today.later).toEqual([]);
    expect(before.open.map((row) => row.id)).toEqual(["read", "mail", "walk4", "stretch4"]);
    expect(before.total).toEqual({ open: 4, done: 6 });
  });

  it("own missions come last, newest first; templates keep the API order", () => {
    const goals: Goal[] = [
      { id: "own-old", title: "Старое своё", sphere: "mind", xpReward: 10, status: "open" },
      { id: "seed", title: READ.title, sphere: "mind", xpReward: 10, status: "open", templateId: "seed-read" },
      { id: "own-new", title: "Новое своё", sphere: "health", xpReward: 10, status: "open" },
      { id: "fin", title: "Записать траты за день", sphere: "finance", xpReward: 10, status: "open", templateId: "finance-spend" },
      { id: "copy", title: WALK.title, sphere: "health", xpReward: 10, status: "open", templateId: "seed-walk", repeatOf: "x", availableFrom: day8 },
    ];
    expect(todayBoard(goals, now, 10).open.map((row) => row.id)).toEqual(["copy", "seed", "fin", "own-new", "own-old"]);
  });
});

describe("P-C3: tomorrow's copy is not done today", () => {
  it("Миссии «Завтра» and the place sheet: «с DD.MM» instead of «Выполнить» and «+10 XP»", async () => {
    const today = playerDay(new Date());
    const tomorrow = ddmm(shiftDay(today, 1));
    const { calls } = server(anya(today, 1));
    const { container } = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    const row = view.querySelector('[data-mission="walk-next"]')!;
    expect(row).not.toBeNull();
    expect(row.querySelector(".mission__meta")?.textContent).toBe("Здоровье · Дом · запланирована");
    expect(row.querySelector(".mission__xp")).toBeNull();
    expect(row.textContent).not.toContain("XP");
    expect(row.querySelector(".mission__from")?.textContent).toBe(`с ${tomorrow}`);
    expect(within(row as HTMLElement).queryByRole("button")).toBeNull();
    expect(within(view).queryByRole("button", { name: `Выполнить: ${WALK.title}` })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    fireEvent.click(container.querySelector('.map-node[data-node="home"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Дом" });
    const open = [...sheet.querySelectorAll(".ps-missions li")].find((li) => li.querySelector(".ps-from"))!;
    expect(open.querySelector(".ps-from")?.textContent).toBe(`с ${tomorrow}`);
    expect(open.querySelector(".xpv")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: `Выполнить: ${WALK.title}` })).toBeNull();
    expect(calls.some((call) => call.url.endsWith("/complete"))).toBe(false);
  });

  it("on its day the copy is an ordinary open mission with «Выполнить» and «+10 XP»", async () => {
    const today = playerDay(new Date());
    // Yesterday's evening data, seen today: the copies are due.
    server(anya(shiftDay(today, -1), 1));
    await renderApp();
    const panel = screen.getByRole("complementary", { name: "Сегодня" });
    const row = panel.querySelector('[data-mission="walk-next"]')!;
    expect(row.querySelector(".mission__xp")?.textContent).toBe("+10 XP");
    expect(within(panel).getByRole("button", { name: `Выполнить: ${WALK.title}` })).toBeTruthy();
    expect(row.querySelector(".mission__from")).toBeNull();
  });

  it("the place sheet model: open + the 3 newest done + «ещё N» (Аня, day 14, Дом: 15 rows → 4)", () => {
    const today = "2026-12-13";
    const goals = anya(today, 14);
    const sheet = placeSheet({ id: "home", state: "done", goals, level: 4, xp: 330, now: new Date("2026-12-13T19:00:00.000Z") });
    expect(goals.filter((goal) => goal.sphere === "health")).toHaveLength(15);
    expect(sheet.missions).toHaveLength(4);
    expect(sheet.missions[0]).toMatchObject({ id: "walk-next", done: false, from: "14.12", noXpToday: false });
    expect(sheet.missions.slice(1).map((m) => m.id)).toEqual(["walk-14", "walk-13", "walk-12"]);
    expect(sheet.moreDone).toBe(11);
    // Progress and earned XP still count every record.
    expect(sheet.progress).toEqual({ done: 14, total: 15 });
    expect(sheet.earnedXp).toBe(140);
  });
});

describe("P-C2: one honest repeat note", () => {
  it("the place sheet of a done place and «Выполнены» show the same REPEAT_NOTE, no «повторно XP не дают»", async () => {
    expect(REPEAT_NOTE).toBe("Повторить дело можно кнопкой «Повторить завтра» после выполнения.");
    const { container } = await (async () => { server(anya(playerDay(new Date()), 14)); return renderApp(); })();
    fireEvent.click(container.querySelector('.map-node[data-node="home"]')!);
    const sheet = await screen.findByRole("dialog", { name: "Дом" });
    expect(sheet.querySelector(".ps-note")?.textContent).toBe(REPEAT_NOTE);
    expect(sheet.textContent).not.toMatch(/повторно XP не да/);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const history = within(screen.getByRole("region", { name: "Миссии" })).getByRole("region", { name: "Выполнены" });
    expect(history.querySelector(".missions-note")?.textContent).toContain(REPEAT_NOTE);
  });
});

describe("P-C2: folded history (Аня, 42 records)", () => {
  it("«Выполнены» shows today + yesterday, «Показать ещё» reveals the rest; the form is above; GET /goals loses nothing", async () => {
    const today = playerDay(new Date());
    const data = anya(today, 14);
    expect(data.filter((goal) => goal.status === "done")).toHaveLength(42);
    const { goals, calls } = server(data);
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const view = screen.getByRole("region", { name: "Миссии" });
    expect(view.querySelector(".missions-sum")?.textContent).toBe("Доступно: 3 · Выполнено: 42");
    const history = within(view).getByRole("region", { name: "Выполнены" });
    expect(history.querySelectorAll("[data-mission]")).toHaveLength(6);
    expect(within(history).queryByText("Выполненная миссия повторно XP не даёт.")).toBeNull();
    expect(history.textContent).toContain("Повторить дело можно кнопкой «Повторить завтра» после выполнения.");
    // «Новая миссия» and «Свои миссии» come before «Выполнены» in the DOM.
    const form = within(view).getByRole("heading", { name: "Новая миссия" });
    const own = within(view).getByRole("heading", { name: "Свои миссии" });
    const heading = within(history).getByRole("heading", { name: "Выполнены" });
    expect(form.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(own.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // a) the label counts what is still hidden; b) the caption names the shown range.
    expect(history.querySelector(".missions-note")?.textContent).toMatch(/^Сегодня и вчера\. /);
    expect(within(history).getByRole("button", { name: "Показать более ранние (36)" })).toBeTruthy();
    fireEvent.click(within(history).getByRole("button", { name: /Показать более ранние/ }));
    expect(history.querySelectorAll("[data-mission]")).toHaveLength(26);
    expect(history.querySelector(".missions-note")?.textContent).toMatch(/^Сегодня, вчера и раньше\. Повторить дело/);
    expect(within(history).getByRole("button", { name: "Показать более ранние (16)" })).toBeTruthy();
    fireEvent.click(within(history).getByRole("button", { name: /Показать более ранние/ }));
    expect(history.querySelectorAll("[data-mission]")).toHaveLength(42);
    expect(within(history).queryByRole("button", { name: /Показать более ранние/ })).toBeNull();
    expect(history.querySelector(".missions-note")?.textContent).toMatch(/^Сегодня, вчера и раньше\. /);
    // Nothing was deleted or changed: only GETs went out, and all 45 goals are still there.
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(goals).toHaveLength(45);
  });
});

describe("P-C5: «всё сделано» is not «пустой день»", () => {
  it("emptyDayActive: a record today turns empty_day off", () => {
    expect(emptyDayActive({ loaded: true, planCount: 3, openToday: 0, doneToday: 0 })).toBe(true);
    expect(emptyDayActive({ loaded: true, planCount: 3, openToday: 0, doneToday: 1 })).toBe(false);
    expect(emptyDayActive({ loaded: true, planCount: 3, openToday: 1, doneToday: 0 })).toBe(false);
    expect(emptyDayActive({ loaded: false, planCount: 3, openToday: 0, doneToday: 0 })).toBe(false);
    expect(emptyDayActive({ loaded: true, planCount: 0, openToday: 0, doneToday: 0 })).toBe(false);
    // The once-a-day rule is unchanged: shown today → not again today.
    const store = new Map<string, string>([["levex.hint.empty_day", "2026-12-07"]]);
    const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-12-07", new Map(), kv)).toBeNull();
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-12-08", new Map(), kv)).toBe("empty_day");
  });

  it("Аня, evening of day 1: «Сегодня записано: 3», the plan is folded under «Ещё идеи», no robot bubble", async () => {
    server(anya(playerDay(new Date()), 1));
    await renderApp();
    const panel = screen.getByRole("complementary", { name: "Сегодня" });
    expect(within(panel).getByText("Сегодня записано: 3. Можно на этом остановиться.")).toBeTruthy();
    expect(panel.textContent).not.toContain("день свободен");
    expect(panel.querySelectorAll("[data-plan]")).toHaveLength(0);
    const more = within(panel).getByRole("button", { name: "Ещё идеи" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelectorAll("[data-plan]").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-hint="empty_day"]')).toBeNull();
    expect(localStorage.getItem("levex.hint.empty_day")).toBeNull();
    // Tomorrow's copies are still listed as tomorrow's.
    expect(panel.textContent).toContain("Завтра:");
  });

  it("a truly empty day (no records today) still shows the free-day line, the plan and the bubble", async () => {
    server([{ id: "w", title: WALK.title, sphere: "health", xpReward: 10, status: "done", templateId: "seed-walk", completedAt: "2026-11-01T08:00:00.000Z", xpGranted: 10 }]);
    await renderApp();
    const panel = screen.getByRole("complementary", { name: "Сегодня" });
    expect(panel.querySelector('[data-empty="today"]')?.textContent).toMatch(/^На сегодня дел нет — день свободен\./);
    expect(panel.querySelectorAll("[data-plan]").length).toBeGreaterThan(0);
    await waitFor(() => expect(document.querySelector('[data-hint="empty_day"]')).not.toBeNull());
  });

  it("«Ещё N — во вкладке «Миссии»» under three rows, neutral words only", async () => {
    server(vika(playerDay(new Date())));
    await renderApp();
    const panel = screen.getByRole("complementary", { name: "Сегодня" });
    expect(panel.querySelectorAll("[data-mission]")).toHaveLength(3);
    const more = panel.querySelector(".today-more")!;
    expect(more.textContent).toBe("Ещё 1 — во вкладке «Миссии»");
    expect(panel.textContent).not.toMatch(/просроч/i);
    expect(panel.querySelector('[data-mission="stretch4"]')).toBe(panel.querySelector("[data-mission]"));
  });

  it("«Ещё идеи» is folded on load and folds again after a plan chip is taken and done (not left open)", async () => {
    server(anya(playerDay(new Date()), 1));
    await renderApp();
    const panel = screen.getByRole("complementary", { name: "Сегодня" });
    expect(within(panel).getByRole("button", { name: "Ещё идеи" }).getAttribute("aria-expanded")).toBe("false");
    expect(panel.querySelector("#today-ideas")).toBeNull();
    expect(panel.querySelectorAll("[data-plan]")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Ещё идеи" }));
    const chip = panel.querySelector<HTMLButtonElement>("[data-plan]")!;
    fireEvent.click(chip);
    // The taken idea is an open mission now; finishing it brings the «всё сделано» state back — folded.
    const finish = await within(panel).findByRole("button", { name: /^Выполнить: / });
    fireEvent.click(finish);
    await waitFor(() => expect(within(panel).getByText("Сегодня записано: 4. Можно на этом остановиться.")).toBeTruthy());
    expect(within(panel).getByRole("button", { name: "Ещё идеи" }).getAttribute("aria-expanded")).toBe("false");
    expect(panel.querySelectorAll("[data-plan]")).toHaveLength(0);
  });
});

describe("P-C2: Вика's folded «Выполнены» (no records today or yesterday)", () => {
  it("«За сегодня и вчера записей нет.» and «Показать более ранние (6)», then the caption «Сегодня, вчера и раньше.»", async () => {
    server(vika(playerDay(new Date())));
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Миссии" }));
    const history = within(screen.getByRole("region", { name: "Миссии" })).getByRole("region", { name: "Выполнены" });
    expect(within(history).getByText("За сегодня и вчера записей нет.")).toBeTruthy();
    expect(history.textContent).not.toMatch(/Показать ещё|из 6/);
    fireEvent.click(within(history).getByRole("button", { name: "Показать более ранние (6)" }));
    expect(history.querySelectorAll("[data-mission]")).toHaveLength(6);
    expect(within(history).queryByText("За сегодня и вчера записей нет.")).toBeNull();
    expect(history.querySelector(".missions-note")?.textContent).toMatch(/^Сегодня, вчера и раньше\. Повторить дело/);
    expect(within(history).queryByRole("button", { name: /Показать более ранние/ })).toBeNull();
  });
});
