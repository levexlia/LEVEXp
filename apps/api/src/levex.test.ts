import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { getPlayer, openStore, resetStore, setClockForTests, setStoreWriterForTests } from "./store.js";

describe("vector avatar and streak", () => {
  const temps: string[] = [];

  beforeEach(() => {
    setStoreWriterForTests(null);
    setClockForTests(() => new Date("2026-11-15T12:00:00.000Z"));
    openStore(null);
    resetStore(false);
  });

  afterEach(() => {
    setStoreWriterForTests(null);
    setClockForTests(null);
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-look-"));
    temps.push(dir);
    return path.join(dir, "levexp.json");
  }

  const look = {
    skin: "tan",
    hair: "ponytail",
    hairColor: "auburn",
    eyes: "soft",
    outfit: "jacket",
    accessory: "glasses",
    emotion: "proud",
  };

  it("rejects an unknown part and stores a valid look across a restart", async () => {
    const file = tempFile();
    openStore(file);
    const a = buildApp({ logger: false });
    const bad = await a.inject({
      method: "PUT",
      url: "/player/avatar",
      payload: { ...look, hair: "mohawk" },
    });
    expect(bad.statusCode).toBe(400);
    expect(getPlayer().avatarConfig).toBeUndefined();

    const extra = await a.inject({
      method: "PUT",
      url: "/player/avatar",
      payload: { ...look, cape: "red" },
    });
    expect(extra.statusCode).toBe(400);

    const saved = await a.inject({ method: "PUT", url: "/player/avatar", payload: look });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().avatarConfig).toEqual(look);

    openStore(null);
    resetStore(false);
    openStore(file);
    expect(getPlayer().avatarConfig).toEqual(look);
    expect(JSON.parse(readFileSync(file, "utf8")).player.avatarConfig).toEqual(look);
  });

  it("does not keep a look when the save fails", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    const before = readFileSync(file, "utf8");
    setStoreWriterForTests(() => {
      throw new Error("simulated persist failure");
    });
    const failed = await buildApp({ logger: false }).inject({
      method: "PUT",
      url: "/player/avatar",
      payload: look,
    });
    expect(failed.statusCode).toBe(500);
    expect(getPlayer().avatarConfig).toBeUndefined();
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("counts a streak from completion days and spends today's energy", async () => {
    const file = tempFile();
    openStore(file);
    const a = buildApp({ logger: false });
    setClockForTests(() => new Date("2026-11-14T09:00:00.000Z"));
    const first = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Walk", sphere: "health" },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${first.id}/complete` });

    setClockForTests(() => new Date("2026-11-15T09:00:00.000Z"));
    const second = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Read", sphere: "mind" },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${second.id}/complete` });

    const player = (await a.inject({ method: "GET", url: "/player" })).json();
    expect(player.streak).toBe(2);
    expect(player.energy).toEqual({ current: 45, max: 50 });
    expect(player.progress).toEqual({ xp: 20, level: 1, xpBySphere: { health: 10, mind: 10 } });
  });
});
