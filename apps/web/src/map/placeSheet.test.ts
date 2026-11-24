import { describe, expect, it } from "vitest";
import type { Goal } from "../api";
import { ACTION_LABEL, placeSheet, segments, unlockPace } from "./placeSheet.js";

const goals: Goal[] = [
  { id: "g1", title: "Прочитать главу", sphere: "mind", xpReward: 10, status: "done", completedAt: "2026-11-12T10:00:00.000Z" },
  { id: "g2", title: "Конспект", sphere: "mind", xpReward: 15, status: "done", completedAt: "2026-11-14T09:00:00.000Z" },
  { id: "g3", title: "Полчаса в парке", sphere: "spirit", xpReward: 20, status: "open" },
  { id: "g4", title: "Скетч", sphere: "creativity", xpReward: 15, status: "open" },
  { id: "g5", title: "Помочь соседу", sphere: "community", xpReward: 25, status: "open" },
];
const at = { goals, level: 2, xp: 120 };

describe("place sheet by state", () => {
  it("available: later + start, missions shown with their XP", () => {
    const sheet = placeSheet({ ...at, id: "workshop", state: "available" });
    expect(sheet.actions.map((a) => ACTION_LABEL[a])).toEqual(["Позже", "Начать"]);
    expect(sheet.status).toBe("Доступно");
    expect(sheet.meta).toBe("Место 04");
    expect(sheet.missions).toEqual([{ id: "g4", title: "Скетч", xp: 15, done: false, noXpToday: false }]);
    expect(sheet.progress).toEqual({ done: 0, total: 1 });
    expect(sheet.missionsHidden).toBe(false);
    expect(sheet.condition).toBeNull();
    expect(sheet.earnedXp).toBeNull();
    expect(sheet.primaryDisabled).toBe(false);
  });

  it("current: later + enter", () => {
    const sheet = placeSheet({ ...at, id: "park", state: "current" });
    expect(sheet.actions).toEqual(["later", "enter"]);
    expect(sheet.status).toBe("Текущее");
    expect(sheet.title).toBe("Парк");
  });

  it("done: only repeat, earned XP is the sum of finished goals, date of the last one", () => {
    const sheet = placeSheet({ ...at, id: "study", state: "done" });
    expect(sheet.actions).toEqual(["repeat"]);
    expect(sheet.progress).toEqual({ done: 2, total: 2 });
    expect(sheet.earnedXp).toBe(25);
    expect(sheet.doneOn).toMatch(/^1[45]\.11$/);
    expect(sheet.missions.every((m) => m.done)).toBe(true);
  });

  it("locked: condition from unlockLevel, missions masked, primary disabled", () => {
    const sheet = placeSheet({ ...at, id: "center", state: "locked" });
    expect(sheet.actions).toEqual(["later", "enter"]);
    expect(sheet.primaryDisabled).toBe(true);
    expect(sheet.missionsHidden).toBe(true);
    expect(sheet.condition).toEqual({
      text: "Центр LEVEX откроется на уровне 4. Сейчас уровень 2 — ещё 180 XP.",
      level: 2,
      needLevel: 4,
      pace: "За день можно получить до 50 XP, поэтому обычно это 4–5 дней.",
    });
    expect(sheet.disabledWhy).toBe("Войти можно с уровня 4");
    expect(sheet.meta).toBe("Место 05");
  });

  it("throws for an unknown place", () => {
    expect(() => placeSheet({ ...at, id: "x" as never, state: "done" })).toThrow();
  });
});

describe("segments", () => {
  it("lights the done share and never draws zero segments", () => {
    expect(segments(0, 0)).toEqual([false]);
    expect(segments(2, 4)).toEqual([true, true, false, false]);
    expect(segments(4, 4)).toEqual([true, true, true, true]);
    expect(segments(5, 20, 10)).toEqual([true, true, true, false, false, false, false, false, false, false]);
    expect(segments(9, 3)).toEqual([true, true, true]);
  });

  it("pace for a locked place: 50 XP a day, «обычно 1–2 дня» for Мастерская at level 1", () => {
    expect(unlockPace(50)).toBe("За день можно получить до 50 XP, поэтому обычно это 1–2 дня.");
    expect(unlockPace(100)).toBe("За день можно получить до 50 XP, поэтому обычно это 2–3 дня.");
    expect(unlockPace(300)).toBe("За день можно получить до 50 XP, поэтому обычно это 6–7 дней.");
  });

  it("open missions say «без XP сегодня» when today's rules would give 0 (here: daily cap reached)", () => {
    const now = new Date("2026-11-24T10:00:00.000Z");
    const paid = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, title: `П${i}`, sphere: "health", xpReward: 10, xpGranted: 10, status: "done" as const, completedAt: "2026-11-24T08:00:00.000Z",
    }));
    const open = { id: "o", title: "Ещё", sphere: "health", xpReward: 10, status: "open" as const };
    const sheet = placeSheet({ id: "home", state: "done", goals: [...paid, open], level: 1, xp: 50, now });
    expect(sheet.missions.find((m) => m.id === "o")).toMatchObject({ noXpToday: true });
  });
});
