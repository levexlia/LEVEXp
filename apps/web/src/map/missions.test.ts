import { describe, expect, it } from "vitest";
import type { Goal } from "../api";
import { ACTION_LABEL } from "./placeSheet";
import { missionBoard, missionRow, todayBoard, xpHint } from "./missions";

const goals: Goal[] = [
  { id: "a", title: "Прогулка", sphere: "health", xpReward: 10, status: "done", completedAt: "2026-11-21T09:00:00.000Z" },
  { id: "b", title: "Чтение", sphere: "mind", xpReward: 10, status: "open" },
  { id: "c", title: "Рисунок", sphere: "creativity", xpReward: 15, status: "done", completedAt: "2026-11-22T09:00:00.000Z" },
  { id: "d", title: "Бюджет", sphere: "finance", xpReward: 10, status: "open" },
];

describe("missions model", () => {
  it("maps a goal to its place, status and Proof action", () => {
    expect(missionRow(goals[1]!)).toMatchObject({ place: "study", placeName: "Учебный центр", done: false, proof: false, xp: 10 });
    expect(missionRow(goals[2]!)).toMatchObject({ place: "workshop", done: true, proof: true, xp: 15 });
    expect(missionRow(goals[3]!)).toMatchObject({ place: null, placeName: "Финансы", sphere: "finance" });
    expect(missionRow({ id: "e", title: "Что-то", xpReward: 10, status: "open" })).toMatchObject({ place: null, placeName: "Без места", sphere: null });
  });

  it("splits open and done (newest first) and filters by place", () => {
    const all = missionBoard(goals);
    expect(all.open.map((row) => row.id)).toEqual(["b", "d"]);
    expect(all.done.map((row) => row.id)).toEqual(["c", "a"]);
    expect(all.total).toEqual({ open: 2, done: 2 });
    const home = missionBoard(goals, "home");
    expect(home.open).toEqual([]);
    expect(home.done.map((row) => row.id)).toEqual(["a"]);
    expect(home.total).toEqual({ open: 2, done: 2 });
  });

  it("«Сегодня» uses the same goals", () => {
    const today = todayBoard(goals, new Date("2026-11-22T12:00:00.000Z"));
    // cycle2 P-C1: own missions (no template) newest first.
    expect(today.open.map((row) => row.id)).toEqual(["d", "b"]);
    expect(today.openTotal).toBe(2);
    expect(today.doneToday).toBe(1);
  });

  it("xpHint prefers an unlocked place with an open mission", () => {
    const states = new Map([["home", "done"], ["study", "current"], ["park", "locked"]] as const);
    expect(xpHint(states, goals)).toEqual({ text: "Опыт дают миссии. Например, выполни миссию в месте «Учебный центр».", place: "study" });
    expect(xpHint(states, []).place).toBe("home");
  });

  it("the done place action is «Миссии места», not «Повторить»", () => {
    expect(ACTION_LABEL.repeat).toBe("Миссии места");
  });
});
