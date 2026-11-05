import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XP_REWARD_MAX, XP_REWARD_STANDARD } from "@levex/domain";
import { buildApp } from "./app.js";
import {
  getProgress,
  listArtifacts,
  listGoals,
  openStore,
  resetStore,
  setStoreWriterForTests,
} from "./store.js";

describe("save integrity and legacy XP", () => {
  const temps: string[] = [];

  beforeEach(() => {
    setStoreWriterForTests(null);
    openStore(null);
    resetStore(false);
  });

  afterEach(() => {
    setStoreWriterForTests(null);
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-"));
    temps.push(dir);
    return path.join(dir, "levexp.json");
  }

  function failSaves(): void {
    setStoreWriterForTests(() => {
      throw new Error("simulated persist failure");
    });
  }

  it("does not keep XP or a photo link when completion cannot be saved", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    const a = buildApp({ logger: false });
    const goal = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Paint", sphere: "creativity" },
    })).json();
    const photo = (await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Canvas", kind: "photo" },
    })).json();
    const before = readFileSync(file, "utf8");

    failSaves();
    const failed = await a.inject({
      method: "POST",
      url: `/goals/${goal.id}/complete`,
      payload: { artifactId: photo.id },
    });
    expect(failed.statusCode).toBe(500);
    expect(getProgress().xp).toBe(0);
    expect(listGoals()).toEqual([
      expect.objectContaining({ id: goal.id, status: "open", xpReward: XP_REWARD_STANDARD }),
    ]);
    expect(listArtifacts()[0].goalId).toBeUndefined();
    expect(readFileSync(file, "utf8")).toBe(before);

    openStore(null);
    resetStore(false);
    openStore(file);
    expect(getProgress().xp).toBe(0);
    expect(listGoals()[0]).toMatchObject({ id: goal.id, status: "open", xpReward: XP_REWARD_STANDARD });
    expect(listArtifacts()[0].goalId).toBeUndefined();

    setStoreWriterForTests(null);
    const retried = await buildApp({ logger: false }).inject({
      method: "POST",
      url: `/goals/${goal.id}/complete`,
      payload: { artifactId: photo.id },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().progress).toEqual({
      xp: XP_REWARD_STANDARD + 5,
      level: 1,
      xpBySphere: { creativity: XP_REWARD_STANDARD + 5 },
    });
    expect(getProgress().xp).toBe(XP_REWARD_STANDARD + 5);
    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.player.progression.totalXp).toBe(getProgress().xp);
    expect(disk.goals[0]).toMatchObject({ id: goal.id, status: "done", xpReward: XP_REWARD_STANDARD + 5 });
    expect(disk.artifacts[0].goalId).toBe(goal.id);
  });

  it("does not keep a goal when creating it cannot be saved", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    const before = readFileSync(file, "utf8");

    failSaves();
    const failed = await buildApp({ logger: false }).inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Nope", sphere: "health" },
    });
    expect(failed.statusCode).toBe(500);
    expect(listGoals()).toHaveLength(0);
    expect(getProgress().xp).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(before);

    openStore(null);
    resetStore(false);
    openStore(file);
    expect(listGoals()).toHaveLength(0);
    expect(getProgress().xp).toBe(0);
  });

  it("does not keep a photo or raise the reward when creating it cannot be saved", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    const a = buildApp({ logger: false });
    const goal = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Sketch", sphere: "creativity" },
    })).json();
    const before = readFileSync(file, "utf8");

    failSaves();
    const failed = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Sketchbook", kind: "photo", goalId: goal.id },
    });
    expect(failed.statusCode).toBe(500);
    expect(listArtifacts()).toHaveLength(0);
    expect(listGoals()[0]).toMatchObject({ id: goal.id, xpReward: XP_REWARD_STANDARD, status: "open" });
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("clamps a legacy reward above the max and keeps an in-range legacy reward", async () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({
      version: 1,
      player: {
        id: "p1",
        nickname: "Ada",
        createdAt: "2026-01-01T00:00:00.000Z",
        progression: { level: 1, totalXp: 0, xpBySphere: {} },
      },
      goals: [
        { id: "huge", title: "Huge", xpReward: 10000, status: "open", sphere: "finance" },
        { id: "kept", title: "Kept", xpReward: 30, status: "open", sphere: "mind" },
        { id: "photo", title: "Photo", xpReward: 10000, status: "open", sphere: "creativity" },
        { id: "again", title: "Again", xpReward: 10000, status: "open", sphere: "finance" },
      ],
    }));
    openStore(file);
    const a = buildApp({ logger: false });
    const shot = (await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Shot", kind: "photo" },
    })).json();
    const linked = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Already", kind: "photo", goalId: "photo" },
    });
    expect(linked.statusCode).toBe(201);
    expect(listGoals().find((goal) => goal.id === "photo")?.xpReward).toBe(10000);

    const first = await a.inject({ method: "POST", url: "/goals/huge/complete" });
    expect(first.statusCode).toBe(200);
    expect(first.json().goal.xpReward).toBe(XP_REWARD_MAX);
    expect(first.json().progress).toEqual({ xp: XP_REWARD_MAX, level: 1, xpBySphere: { finance: XP_REWARD_MAX } });

    const kept = await a.inject({ method: "POST", url: "/goals/kept/complete" });
    expect(kept.json().goal.xpReward).toBe(30);
    expect(kept.json().progress.xp).toBe(XP_REWARD_MAX + 30);
    expect(kept.json().progress.xpBySphere).toEqual({ finance: XP_REWARD_MAX, mind: 30 });

    const withPhoto = await a.inject({
      method: "POST",
      url: "/goals/photo/complete",
      payload: { artifactId: shot.id },
    });
    expect(withPhoto.statusCode).toBe(200);
    expect(withPhoto.json().goal.xpReward).toBe(XP_REWARD_MAX);
    expect(withPhoto.json().progress.xp).toBe(XP_REWARD_MAX + 30 + XP_REWARD_MAX);
    expect(withPhoto.json().progress.xpBySphere.creativity).toBe(XP_REWARD_MAX);

    const second = await a.inject({ method: "POST", url: "/goals/again/complete" });
    expect(second.json().progress).toEqual({
      xp: 180,
      level: 2,
      xpBySphere: { finance: 100, mind: 30, creativity: XP_REWARD_MAX },
    });
    const repeat = await a.inject({ method: "POST", url: "/goals/huge/complete" });
    expect(repeat.json().progress.xp).toBe(180);

    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.player.progression.totalXp).toBe(180);
    expect(disk.goals.find((goal: { id: string }) => goal.id === "huge").xpReward).toBe(XP_REWARD_MAX);
    expect(disk.goals.find((goal: { id: string }) => goal.id === "kept").xpReward).toBe(30);
    expect(disk.goals.find((goal: { id: string }) => goal.id === "photo").xpReward).toBe(XP_REWARD_MAX);
  });
});
