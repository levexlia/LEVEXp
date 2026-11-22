import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR_CONFIG, NICKNAME_MAX_LENGTH } from "@levex/domain";
import { buildApp } from "./app.js";
import { DEFAULT_PLAYER_NICKNAME, getPlayer, listGoals, openStore, resetStore } from "./store.js";

/** Regressions found in the PR #13 playtest (22.11.2026). */
describe("player answers keep streak and energy", () => {
  beforeEach(() => {
    openStore(null);
    resetStore(true);
  });
  const app = () => buildApp({ logger: false });

  async function finishOne(a: ReturnType<typeof app>) {
    const goal = listGoals()[0]!;
    await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });
    const player = (await a.inject({ method: "GET", url: "/player" })).json();
    expect(player.streak).toBe(1);
    expect(player.energy).toEqual({ current: 45, max: 50 });
    return player;
  }

  it("PUT /player/avatar answers with the same streak, energy and XP as GET /player", async () => {
    const a = app();
    const before = await finishOne(a);
    const res = await a.inject({ method: "PUT", url: "/player/avatar", payload: { ...DEFAULT_AVATAR_CONFIG, hairColor: "black" } });
    expect(res.statusCode).toBe(200);
    const saved = res.json();
    expect(saved.streak).toBe(before.streak);
    expect(saved.energy).toEqual(before.energy);
    expect(saved.progress).toEqual(before.progress);
    expect(saved.avatarConfig.hairColor).toBe("black");
  });

  it("PATCH /player renames and keeps streak, energy and progress", async () => {
    const a = app();
    const before = await finishOne(a);
    const res = await a.inject({ method: "PATCH", url: "/player", payload: { nickname: "  Лия  " } });
    expect(res.statusCode).toBe(200);
    const saved = res.json();
    expect(saved.nickname).toBe("Лия");
    expect(saved.streak).toBe(before.streak);
    expect(saved.energy).toEqual(before.energy);
    expect(saved.progress).toEqual(before.progress);
  });

  it("PATCH /player rejects an empty or too long nickname and changes nothing", async () => {
    const a = app();
    for (const nickname of ["", "   ", "я".repeat(NICKNAME_MAX_LENGTH + 1)]) {
      const res = await a.inject({ method: "PATCH", url: "/player", payload: { nickname } });
      expect(res.statusCode).toBe(400);
    }
    expect(getPlayer().nickname).toBe(DEFAULT_PLAYER_NICKNAME);
  });

  it("completing a mission again gives no XP a second time", async () => {
    const a = app();
    const goal = listGoals()[0]!;
    const first = (await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` })).json();
    const again = (await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` })).json();
    expect(first.progress.xp).toBe(10);
    expect(again.progress).toEqual(first.progress);
  });
});
