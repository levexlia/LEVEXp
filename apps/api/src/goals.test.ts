import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "./app.js";
import { resetStore } from "./store.js";
import { levelForXp } from "@levex/domain";

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
  });

  it("completing awards XP exactly once", async () => {
    const a = app();
    const { id } = (await a.inject({ method: "POST", url: "/goals", payload: { title: "Big", xpReward: 120 } })).json();
    const first = await a.inject({ method: "POST", url: `/goals/${id}/complete` });
    expect(first.json().goal.status).toBe("done");
    expect(first.json().progress).toEqual({ xp: 120, level: 2 });
    const second = await a.inject({ method: "POST", url: `/goals/${id}/complete` });
    expect(second.json().progress).toEqual({ xp: 120, level: 2 });
    expect((await a.inject({ method: "GET", url: "/progress" })).json()).toEqual({ xp: 120, level: 2 });
  });

  it("404 for unknown goal", async () => {
    expect((await app().inject({ method: "POST", url: "/goals/nope/complete" })).statusCode).toBe(404);
  });

  it("level formula", () => {
    expect([0, 99, 100, 250].map(levelForXp)).toEqual([1, 1, 2, 3]);
  });
});
