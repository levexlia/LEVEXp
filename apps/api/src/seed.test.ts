import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlayer, getProgress, listGoals, openStore, resetStore } from "./store.js";

/** Seed text is Russian; old data files keep everything but the English seed strings (PR #13 playtest). */
describe("seed text migration", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "levex-seed-"));
  });
  afterEach(() => {
    openStore(null);
    resetStore(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds Russian demo missions and the nickname «Игрок»", () => {
    openStore(path.join(dir, "new.json"));
    expect(getPlayer().nickname).toBe("Игрок");
    expect(listGoals().map((goal) => goal.title)).toEqual(["Утренняя прогулка 20 мин", "Прочитать 10 страниц"]);
  });

  it("translates the old English seed text only, keeping ids, statuses, rewards, dates and XP", () => {
    const file = path.join(dir, "old.json");
    const legacy = {
      version: 1,
      player: {
        id: "p1",
        nickname: "Player",
        createdAt: "2026-11-01T00:00:00.000Z",
        progression: { level: 1, totalXp: 10, xpBySphere: { health: 10 } },
      },
      goals: [
        { id: "g1", title: "Morning walk 20 min", xpReward: 10, status: "done", sphere: "health", completedAt: "2026-11-21T08:00:00.000Z" },
        { id: "g2", title: "Read 10 pages", xpReward: 10, status: "open", sphere: "mind" },
        { id: "g3", title: "Read 10 pages today", xpReward: 10, status: "open", sphere: "mind" },
      ],
      artifacts: [],
      room: { placements: [] },
    };
    writeFileSync(file, JSON.stringify(legacy));
    openStore(file);
    expect(getPlayer().nickname).toBe("Игрок");
    expect(getPlayer().id).toBe("p1");
    expect(getProgress()).toEqual({ xp: 10, level: 1, xpBySphere: { health: 10 } });
    expect(listGoals()).toEqual([
      { id: "g1", title: "Утренняя прогулка 20 мин", xpReward: 10, status: "done", sphere: "health", completedAt: "2026-11-21T08:00:00.000Z" },
      { id: "g2", title: "Прочитать 10 страниц", xpReward: 10, status: "open", sphere: "mind" },
      { id: "g3", title: "Read 10 pages today", xpReward: 10, status: "open", sphere: "mind" },
    ]);
    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.player.nickname).toBe("Игрок");
    expect(disk.goals.map((goal: { title: string }) => goal.title)).toEqual(["Утренняя прогулка 20 мин", "Прочитать 10 страниц", "Read 10 pages today"]);

    // Opening again is a no-op, and a chosen nickname is never touched.
    openStore(null);
    writeFileSync(file, JSON.stringify({ ...disk, player: { ...disk.player, nickname: "Лия" } }));
    openStore(file);
    expect(getPlayer().nickname).toBe("Лия");
    expect(listGoals().map((goal) => goal.title)[0]).toBe("Утренняя прогулка 20 мин");
  });
});
