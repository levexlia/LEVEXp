import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./app.js";
import { resetStore } from "./store.js";
import { XP_REWARD_MAX, levelForXp } from "@levex/domain";

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

  it("completing awards XP exactly once", async () => {
    const a = app();
    const { id } = (await a.inject({ method: "POST", url: "/goals", payload: { title: "Big", xpReward: 50 } })).json();
    const first = await a.inject({ method: "POST", url: `/goals/${id}/complete` });
    expect(first.json().goal.status).toBe("done");
    expect(first.json().progress).toEqual({ xp: 50, level: 1, xpBySphere: {} });
    const second = await a.inject({ method: "POST", url: `/goals/${id}/complete` });
    expect(second.json().progress).toEqual({ xp: 50, level: 1, xpBySphere: {} });
    expect((await a.inject({ method: "GET", url: "/progress" })).json()).toEqual({ xp: 50, level: 1, xpBySphere: {} });
  });

  it("rejects xpReward above 50 and accepts the cap", async () => {
    const a = app();
    const tooHigh = await a.inject({ method: "POST", url: "/goals", payload: { title: "Huge", xpReward: XP_REWARD_MAX + 1 } });
    expect(tooHigh.statusCode).toBe(400);
    expect(JSON.stringify(tooHigh.json())).toContain(String(XP_REWARD_MAX));
    expect((await a.inject({ method: "GET", url: "/goals" })).json()).toHaveLength(0);

    const capped = await a.inject({ method: "POST", url: "/goals", payload: { title: "Enough", xpReward: XP_REWARD_MAX } });
    expect(capped.statusCode).toBe(201);
    expect(capped.json().xpReward).toBe(XP_REWARD_MAX);
  });

  it("patches xpReward only while the goal is open", async () => {
    const a = app();
    const created = (await a.inject({ method: "POST", url: "/goals", payload: { title: "Draft" } })).json();
    expect(created.xpReward).toBe(10);

    const rejected = await a.inject({
      method: "PATCH", url: `/goals/${created.id}`, payload: { xpReward: XP_REWARD_MAX + 1 },
    });
    expect(rejected.statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: "/goals" })).json()[0].xpReward).toBe(10);

    const patched = await a.inject({
      method: "PATCH", url: `/goals/${created.id}`, payload: { xpReward: 40 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().xpReward).toBe(40);

    const done = await a.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    expect(done.json().progress).toEqual({ xp: 40, level: 1, xpBySphere: {} });

    const blocked = await a.inject({
      method: "PATCH", url: `/goals/${created.id}`, payload: { xpReward: 10 },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "goal is already done" });
    expect((await a.inject({ method: "GET", url: "/progress" })).json().xp).toBe(40);
    expect((await a.inject({ method: "PATCH", url: "/goals/missing", payload: { xpReward: 10 } })).statusCode).toBe(404);
  });

  it("404 for unknown goal", async () => {
    expect((await app().inject({ method: "POST", url: "/goals/nope/complete" })).statusCode).toBe(404);
  });

  it("level formula", () => {
    expect([0, 99, 100, 250].map(levelForXp)).toEqual([1, 1, 2, 3]);
  });
});
