import { describe, it, expect, beforeEach } from "vitest";
import { LIFE_SPHERE_IDS, LIFE_SPHERES } from "@levex/domain";
import { buildApp } from "./app.js";
import { resetStore } from "./store.js";

describe("life spheres", () => {
  beforeEach(() => resetStore(false));
  const app = () => buildApp({ logger: false });

  it("lists the catalog in stable order", async () => {
    const res = await app().inject({ method: "GET", url: "/spheres" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([...LIFE_SPHERES]);
    expect(res.json().map((sphere: { id: string }) => sphere.id)).toEqual([...LIFE_SPHERE_IDS]);
    expect(new Set(LIFE_SPHERE_IDS).size).toBe(LIFE_SPHERES.length);
  });

  it("returns one sphere by id", async () => {
    const res = await app().inject({ method: "GET", url: "/spheres/relationships" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(LIFE_SPHERES.find((sphere) => sphere.id === "relationships"));
  });

  it("404 for an unknown or differently cased id", async () => {
    const unknown = await app().inject({ method: "GET", url: "/spheres/nope" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "sphere not found" });
    const cased = await app().inject({ method: "GET", url: "/spheres/Health" });
    expect(cased.statusCode).toBe(404);
  });

  it("rejects a sphere outside the catalog when creating a goal", async () => {
    const res = await app().inject({ method: "POST", url: "/goals", payload: { title: "Train", sphere: "sport" } });
    expect(res.statusCode).toBe(400);
  });

  it("credits xpBySphere for the goal sphere once, and leaves unsphered goals out of the map", async () => {
    const a = app();
    const health = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Run", sphere: "health", xpReward: 40 },
    })).json();
    const mind = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Read", sphere: "mind", xpReward: 25 },
    })).json();
    const plain = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Misc", xpReward: 10 },
    })).json();

    const first = await a.inject({ method: "POST", url: `/goals/${health.id}/complete` });
    expect(first.json().progress).toEqual({ xp: 40, level: 1, xpBySphere: { health: 40 } });

    await a.inject({ method: "POST", url: `/goals/${health.id}/complete` });
    await a.inject({ method: "POST", url: `/goals/${mind.id}/complete` });
    await a.inject({ method: "POST", url: `/goals/${plain.id}/complete` });

    expect((await a.inject({ method: "GET", url: "/progress" })).json()).toEqual({
      xp: 75,
      level: 1,
      xpBySphere: { health: 40, mind: 25 },
    });
  });

  it("sums rewards inside one sphere", async () => {
    const a = app();
    const first = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Budget", sphere: "finance", xpReward: 30 },
    })).json();
    const second = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Invoice", sphere: "finance", xpReward: 70 },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${first.id}/complete` });
    const done = await a.inject({ method: "POST", url: `/goals/${second.id}/complete` });
    expect(done.json().progress).toEqual({ xp: 100, level: 2, xpBySphere: { finance: 100 } });
  });
});
