import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./app.js";
import { resetStore } from "./store.js";
import { XP_REWARD_MAX, XP_REWARD_STANDARD, levelForXp } from "@levex/domain";

describe("goals + XP", () => {
  beforeEach(() => resetStore(false));
  const app = () => buildApp({ logger: false });

  it("creates a goal with default xpReward 10", async () => {
    const a = app();
    const res = await a.inject({ method: "POST", url: "/goals", payload: { title: "Run 5k", sphere: "health" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: "Run 5k", sphere: "health", xpReward: 10, status: "open" });
    const list = await a.inject({ method: "GET", url: "/goals" });
    expect(list.json()).toHaveLength(1);
  });

  it("rejects invalid body", async () => {
    const res = await app().inject({ method: "POST", url: "/goals", payload: { xpReward: 5 } });
    expect(res.statusCode).toBe(400);
    const extra = await app().inject({ method: "POST", url: "/goals", payload: { title: "X", note: "nope" } });
    expect(extra.statusCode).toBe(400);
  });

  it("completing awards the server reward exactly once", async () => {
    const a = app();
    const created = (await a.inject({ method: "POST", url: "/goals", payload: { title: "Big" } })).json();
    expect(created.xpReward).toBe(XP_REWARD_STANDARD);
    const first = await a.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    expect(first.json().goal.status).toBe("done");
    expect(first.json().goal.xpReward).toBe(XP_REWARD_STANDARD);
    expect(first.json().progress).toEqual({ xp: XP_REWARD_STANDARD, level: 1, xpBySphere: {} });
    const second = await a.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    expect(second.json().progress).toEqual({ xp: XP_REWARD_STANDARD, level: 1, xpBySphere: {} });
    expect((await a.inject({ method: "GET", url: "/progress" })).json()).toEqual({
      xp: XP_REWARD_STANDARD,
      level: 1,
      xpBySphere: {},
    });
  });

  it("rejects a client-chosen xpReward", async () => {
    const a = app();
    for (const xpReward of [1, XP_REWARD_STANDARD, XP_REWARD_MAX, XP_REWARD_MAX + 1]) {
      const rejected = await a.inject({
        method: "POST",
        url: "/goals",
        payload: { title: "Huge", xpReward },
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toEqual({ error: "xpReward is set by the server" });
    }
    expect((await a.inject({ method: "GET", url: "/goals" })).json()).toHaveLength(0);

    const created = (await a.inject({ method: "POST", url: "/goals", payload: { title: "Draft" } })).json();
    const patched = await a.inject({
      method: "PATCH",
      url: `/goals/${created.id}`,
      payload: { xpReward: 40 },
    });
    expect(patched.statusCode).toBe(404);
    expect((await a.inject({ method: "GET", url: "/goals" })).json()[0].xpReward).toBe(XP_REWARD_STANDARD);
    const done = await a.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    expect(done.json().progress.xp).toBe(XP_REWARD_STANDARD);
  });

  it("404 for unknown goal", async () => {
    expect((await app().inject({ method: "POST", url: "/goals/nope/complete" })).statusCode).toBe(404);
  });

  it("level formula", () => {
    expect([0, 99, 100, 250].map(levelForXp)).toEqual([1, 1, 2, 3]);
  });
});
