import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AVATAR_URL_MAX_LENGTH, LIFE_SPHERE_IDS, NICKNAME_MAX_LENGTH, TITLE_MAX_LENGTH } from "@levex/domain";
import { buildApp } from "./app.js";
import {
  createGoal,
  currentDataFile,
  DEFAULT_DATA_FILE,
  DEFAULT_PLAYER_NICKNAME,
  getPlayer,
  getProgress,
  listGoals,
  openStore,
  resetStore,
} from "./store.js";

if (currentDataFile() !== null) {
  throw new Error(`tests booted a file store at ${currentDataFile()}`);
}

describe("player profile", () => {
  beforeEach(() => {
    openStore(null);
    resetStore(false);
  });
  const app = () => buildApp({ logger: false });

  it("returns the seeded player and zero progress", async () => {
    const res = await app().inject({ method: "GET", url: "/player" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.nickname).toBe(DEFAULT_PLAYER_NICKNAME);
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.title).toBeUndefined();
    expect(body.avatarUrl).toBeUndefined();
    expect(body.progression).toEqual({ level: 1, totalXp: 0, xpBySphere: {} });
    expect(body.progress).toEqual({ xp: 0, level: 1, xpBySphere: {} });
    expect((await app().inject({ method: "GET", url: "/progress" })).json()).toEqual(body.progress);
  });

  it("updates nickname, title, and avatarUrl, and can clear the optional fields", async () => {
    const a = app();
    const before = (await a.inject({ method: "GET", url: "/player" })).json();
    const patched = await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { nickname: "  Ася  ", title: "Следопыт", avatarUrl: "  https://example.com/a.png  " },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      id: before.id,
      createdAt: before.createdAt,
      nickname: "Ася",
      title: "Следопыт",
      avatarUrl: "https://example.com/a.png",
      progress: before.progress,
      progression: before.progression,
    });

    const cleared = await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { title: null, avatarUrl: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().nickname).toBe("Ася");
    expect(cleared.json().title).toBeUndefined();
    expect(cleared.json().avatarUrl).toBeUndefined();
    expect(cleared.json().id).toBe(before.id);
  });

  it("does not keep earlier fields when a later field fails validation", async () => {
    const a = app();
    const before = (await a.inject({ method: "GET", url: "/player" })).json();
    const patched = await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { nickname: "ValidName", title: "   " },
    });
    expect(patched.statusCode).toBe(400);
    expect(patched.json()).toEqual({ error: `title must be 1-${TITLE_MAX_LENGTH} characters` });
    expect((await a.inject({ method: "GET", url: "/player" })).json().nickname).toBe(before.nickname);
  });

  it("rejects empty, overlong, blank, and unknown fields", async () => {
    const a = app();
    expect((await a.inject({ method: "PATCH", url: "/player", payload: {} })).statusCode).toBe(400);
    expect((await a.inject({ method: "PATCH", url: "/player", payload: { nickname: "" } })).statusCode).toBe(400);
    expect((await a.inject({ method: "PATCH", url: "/player", payload: { nickname: "   " } })).statusCode).toBe(400);
    expect((await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { nickname: "a".repeat(NICKNAME_MAX_LENGTH) },
    })).statusCode).toBe(200);
    expect((await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { nickname: "a".repeat(NICKNAME_MAX_LENGTH + 1) },
    })).statusCode).toBe(400);
    expect((await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { title: "t".repeat(TITLE_MAX_LENGTH + 1) },
    })).statusCode).toBe(400);
    expect((await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { avatarUrl: "u".repeat(AVATAR_URL_MAX_LENGTH + 1) },
    })).statusCode).toBe(400);
    expect((await a.inject({ method: "PATCH", url: "/player", payload: { id: "other" } })).statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: "/player" })).json().nickname).toBe("a".repeat(NICKNAME_MAX_LENGTH));
  });

  it("reads progress from the same player state as GET /progress", async () => {
    const a = app();
    const { id } = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Run", sphere: "health", xpReward: 50 },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${id}/complete` });
    await a.inject({ method: "PATCH", url: "/player", payload: { nickname: "Rin" } });

    const progress = (await a.inject({ method: "GET", url: "/progress" })).json();
    const player = (await a.inject({ method: "GET", url: "/player" })).json();
    expect(progress).toEqual({ xp: 50, level: 1, xpBySphere: { health: 50 } });
    expect(player.nickname).toBe("Rin");
    expect(player.progress).toEqual(progress);
    expect(player.progression).toEqual({ level: 1, totalXp: 50, xpBySphere: { health: 50 } });
  });
});

describe("JSON persistence", () => {
  const temps: string[] = [];

  beforeEach(() => {
    openStore(null);
    resetStore(false);
  });

  afterEach(() => {
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-"));
    temps.push(dir);
    return path.join(dir, "levexp.json");
  }

  it("does not write the default data file in memory mode", () => {
    const before = existsSync(DEFAULT_DATA_FILE) ? statSync(DEFAULT_DATA_FILE).mtimeMs : null;
    createGoal({ title: "Ephemeral" });
    if (before === null) expect(existsSync(DEFAULT_DATA_FILE)).toBe(false);
    else expect(statSync(DEFAULT_DATA_FILE).mtimeMs).toBe(before);
  });

  it("seeds a default player and demo goals when the file is missing", () => {
    const file = tempFile();
    openStore(file);
    const first = getPlayer();
    expect(first.nickname).toBe(DEFAULT_PLAYER_NICKNAME);
    expect(first.progress).toEqual({ xp: 0, level: 1, xpBySphere: {} });
    const titles = listGoals().map((goal) => goal.title).sort();
    const ids = listGoals().map((goal) => goal.id).sort();
    expect(titles).toEqual(["Morning walk 20 min", "Read 10 pages"]);
    expect(existsSync(file)).toBe(true);

    openStore(null);
    resetStore(false);
    expect(listGoals()).toHaveLength(0);

    openStore(file);
    expect(getPlayer().id).toBe(first.id);
    expect(getPlayer().createdAt).toBe(first.createdAt);
    expect(listGoals().map((goal) => goal.id).sort()).toEqual(ids);
  });

  it("keeps goals, xp, and the player across a store reload", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);

    const a = buildApp({ logger: false });
    const created = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Walk", sphere: "health", xpReward: 30 },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    const saved = (await a.inject({
      method: "PATCH",
      url: "/player",
      payload: { nickname: "Rin", title: "Walker", avatarUrl: "https://example.com/rin.png" },
    })).json();

    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.player).toMatchObject({
      id: saved.id,
      nickname: "Rin",
      title: "Walker",
      avatarUrl: "https://example.com/rin.png",
      progression: { level: 1, totalXp: 30, xpBySphere: { health: 30 } },
    });
    expect(onDisk.goals).toEqual([
      expect.objectContaining({ id: created.id, title: "Walk", status: "done", sphere: "health", xpReward: 30 }),
    ]);

    openStore(null);
    resetStore(false);
    expect(listGoals()).toHaveLength(0);
    expect(getProgress().xp).toBe(0);

    openStore(file);
    const b = buildApp({ logger: false });
    expect((await b.inject({ method: "GET", url: "/goals" })).json()).toHaveLength(1);
    expect((await b.inject({ method: "GET", url: "/progress" })).json()).toEqual({
      xp: 30,
      level: 1,
      xpBySphere: { health: 30 },
    });
    const player = (await b.inject({ method: "GET", url: "/player" })).json();
    expect(player).toMatchObject({
      id: saved.id,
      nickname: "Rin",
      title: "Walker",
      avatarUrl: "https://example.com/rin.png",
      createdAt: saved.createdAt,
    });
    expect(player.progress).toEqual({ xp: 30, level: 1, xpBySphere: { health: 30 } });
    expect(player.progression.totalXp).toBe(player.progress.xp);
    expect((await b.inject({ method: "GET", url: "/spheres" })).json()).toHaveLength(LIFE_SPHERE_IDS.length);

    const again = await b.inject({ method: "POST", url: `/goals/${created.id}/complete` });
    expect(again.json().progress).toEqual({ xp: 30, level: 1, xpBySphere: { health: 30 } });
  });

  it("seeds a player into a file that already has goals", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({
      version: 1,
      goals: [{ id: "g1", title: "Old", xpReward: 5, status: "done", sphere: "mind" }],
    }));
    openStore(file);
    expect(getPlayer().nickname).toBe(DEFAULT_PLAYER_NICKNAME);
    expect(listGoals()).toEqual([
      expect.objectContaining({ id: "g1", title: "Old", status: "done", sphere: "mind" }),
    ]);
    expect(getProgress()).toEqual({ xp: 0, level: 1, xpBySphere: {} });
    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.player.nickname).toBe(DEFAULT_PLAYER_NICKNAME);
    expect(disk.goals).toHaveLength(1);
  });

  it("derives level from stored totalXp when the file disagrees", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({
      version: 1,
      player: {
        id: "p1",
        nickname: "Ada",
        createdAt: "2026-01-01T00:00:00.000Z",
        progression: { level: 1, totalXp: 250, xpBySphere: { career: 250 } },
      },
      goals: [],
    }));
    openStore(file);
    expect(getProgress()).toEqual({ xp: 250, level: 3, xpBySphere: { career: 250 } });
    expect(getPlayer().progression).toEqual({ level: 3, totalXp: 250, xpBySphere: { career: 250 } });
  });

  it("refuses to load a corrupt file and leaves it untouched", () => {
    const file = tempFile();
    writeFileSync(file, "{");
    expect(() => openStore(file)).toThrow(/not JSON/);
    expect(readFileSync(file, "utf8")).toBe("{");
  });
});
