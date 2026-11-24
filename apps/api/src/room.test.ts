import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { getProgress, getRoom, listArtifacts, listGoals, openStore, resetStore } from "./store.js";

describe("photo room", () => {
  beforeEach(() => {
    openStore(null);
    resetStore(false);
  });
  const app = () => buildApp({ logger: false });

  it("places a photo in the room and links it to a creativity goal", async () => {
    const a = app();
    const goal = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Sketch the window", sphere: "creativity" },
    })).json();

    const created = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: {
        title: "  Morning light  ",
        kind: "photo",
        imageUrl: "  https://example.com/light.jpg  ",
        goalId: goal.id,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      title: "Morning light",
      kind: "photo",
      imageUrl: "https://example.com/light.jpg",
      sphere: "creativity",
      goalId: goal.id,
    });
    expect(created.json().id).toEqual(expect.any(String));
    expect(created.json().createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const artifacts = (await a.inject({ method: "GET", url: "/artifacts" })).json();
    expect(artifacts).toHaveLength(1);

    const room = (await a.inject({ method: "GET", url: "/room" })).json();
    expect(room.placements).toEqual([
      { artifactId: created.json().id, artifact: created.json() },
    ]);

    const linkedGoal = (await a.inject({ method: "GET", url: "/goals" })).json().find(
      (item: { id: string }) => item.id === goal.id,
    );
    expect(linkedGoal.xpReward).toBe(15);

    const done = await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });
    expect(done.statusCode).toBe(200);
    expect(done.json().goal.status).toBe("done");
    expect(done.json().goal.xpReward).toBe(15);
    expect(done.json().progress).toEqual({ xp: 15, level: 1, xpBySphere: { creativity: 15 } });

    const again = await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });
    expect(again.json().progress).toEqual(done.json().progress);
    expect((await a.inject({ method: "GET", url: "/room" })).json().placements).toHaveLength(1);
  });

  it("does not add the photo bonus after the creativity goal is already done", async () => {
    const a = app();
    const goal = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Hum", sphere: "creativity" },
    })).json();
    expect(goal.xpReward).toBe(10);
    const done = await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });
    expect(done.json().progress).toEqual({ xp: 10, level: 1, xpBySphere: { creativity: 10 } });

    const photo = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Late", kind: "photo", goalId: goal.id },
    });
    expect(photo.statusCode).toBe(201);
    expect((await a.inject({ method: "GET", url: "/progress" })).json().xp).toBe(10);
    expect((await a.inject({ method: "GET", url: "/goals" })).json().find(
      (item: { id: string }) => item.id === goal.id,
    ).xpReward).toBe(10);
  });

  it("can attach an existing photo when the creativity goal is completed", async () => {
    const a = app();
    const goal = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Paint", sphere: "creativity" },
    })).json();
    const other = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Another", sphere: "creativity" },
    })).json();
    const photo = (await a.inject({
      method: "POST", url: "/artifacts", payload: { title: "Canvas", kind: "photo" },
    })).json();
    expect(photo.goalId).toBeUndefined();
    expect(photo.imageUrl).toBeUndefined();

    const before = (await a.inject({ method: "GET", url: "/room" })).json();
    expect(before.placements.map((placement: { artifactId: string }) => placement.artifactId)).toEqual([photo.id]);

    const done = await a.inject({
      method: "POST",
      url: `/goals/${goal.id}/complete`,
      payload: { artifactId: photo.id },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().goal.xpReward).toBe(15);
    expect(done.json().progress.xp).toBe(15);

    const room = (await a.inject({ method: "GET", url: "/room" })).json();
    expect(room.placements).toHaveLength(1);
    expect(room.placements[0].artifact.goalId).toBe(goal.id);

    const relink = await a.inject({
      method: "POST",
      url: `/goals/${other.id}/complete`,
      payload: { artifactId: photo.id },
    });
    expect(relink.statusCode).toBe(409);
    expect(relink.json()).toEqual({ error: "artifact is linked to another goal" });
    expect((await a.inject({ method: "GET", url: "/progress" })).json().xp).toBe(15);
    expect((await a.inject({ method: "GET", url: "/goals" })).json().find(
      (item: { id: string }) => item.id === other.id,
    ).status).toBe("open");
  });

  it("keeps placement order and rejects a photo that is not for a creativity goal", async () => {
    const a = app();
    const health = (await a.inject({
      method: "POST", url: "/goals", payload: { title: "Run", sphere: "health" },
    })).json();
    const first = (await a.inject({
      method: "POST", url: "/artifacts", payload: { title: "One", kind: "photo" },
    })).json();
    const second = (await a.inject({
      method: "POST", url: "/artifacts", payload: { title: "Two", kind: "photo", imageUrl: "https://example.com/two.jpg" },
    })).json();

    const room = (await a.inject({ method: "GET", url: "/room" })).json();
    expect(room.placements.map((placement: { artifact: { title: string } }) => placement.artifact.title)).toEqual(["One", "Two"]);
    expect((await a.inject({ method: "GET", url: "/artifacts" })).json().map(
      (artifact: { id: string }) => artifact.id,
    )).toEqual([first.id, second.id]);

    const linked = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Nope", kind: "photo", goalId: health.id },
    });
    expect(linked.statusCode).toBe(400);
    expect(linked.json().error).toMatch(/creativity/);

    const onComplete = await a.inject({
      method: "POST",
      url: `/goals/${health.id}/complete`,
      payload: { artifactId: first.id },
    });
    expect(onComplete.statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: "/progress" })).json().xp).toBe(0);
    expect((await a.inject({ method: "GET", url: "/goals" })).json().find(
      (item: { id: string }) => item.id === health.id,
    ).status).toBe("open");

    expect((await a.inject({
      method: "POST", url: "/artifacts", payload: { title: "Sticker", kind: "sticker" },
    })).statusCode).toBe(400);
    expect((await a.inject({
      method: "POST", url: "/artifacts", payload: { kind: "photo" },
    })).statusCode).toBe(400);
    expect((await a.inject({
      method: "POST", url: "/artifacts", payload: { title: "Missing", kind: "photo", goalId: "nope" },
    })).statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: "/artifacts" })).json()).toHaveLength(2);
  });

  it("rejects an image address that is not safe to render", async () => {
    const a = app();
    for (const imageUrl of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "//evil.example/a.png",
      "/uploads/not-a-uuid.png",
      "https://user:pass@example.com/a.png",
    ]) {
      const rejected = await a.inject({
        method: "POST",
        url: "/artifacts",
        payload: { title: "Nope", kind: "photo", imageUrl },
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error).toMatch(/imageUrl/);
    }
    expect((await a.inject({ method: "GET", url: "/artifacts" })).json()).toHaveLength(0);
    expect((await a.inject({ method: "GET", url: "/room" })).json().placements).toHaveLength(0);
  });
});

describe("room persistence", () => {
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

  it("reloads the room, the photo, and the awarded XP", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);

    const a = buildApp({ logger: false });
    const goal = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Sketch", sphere: "creativity" },
    })).json();
    const artifact = (await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Sketchbook", kind: "photo", imageUrl: "https://example.com/sketch.jpg", goalId: goal.id },
    })).json();
    await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });

    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk.artifacts).toEqual([
      expect.objectContaining({
        id: artifact.id,
        title: "Sketchbook",
        kind: "photo",
        sphere: "creativity",
        goalId: goal.id,
        imageUrl: "https://example.com/sketch.jpg",
      }),
    ]);
    expect(onDisk.room).toEqual({ placements: [{ artifactId: artifact.id }] });
    expect(onDisk.player.progression).toMatchObject({ totalXp: 15, xpBySphere: { creativity: 15 } });

    openStore(null);
    resetStore(false);
    expect(listArtifacts()).toHaveLength(0);
    expect(getRoom().placements).toHaveLength(0);
    expect(getProgress().xp).toBe(0);

    openStore(file);
    const b = buildApp({ logger: false });
    const room = (await b.inject({ method: "GET", url: "/room" })).json();
    expect(room.placements).toHaveLength(1);
    expect(room.placements[0].artifact).toMatchObject({
      id: artifact.id,
      title: "Sketchbook",
      goalId: goal.id,
      imageUrl: "https://example.com/sketch.jpg",
    });
    expect((await b.inject({ method: "GET", url: "/artifacts" })).json()).toHaveLength(1);
    expect((await b.inject({ method: "GET", url: "/progress" })).json()).toEqual({
      xp: 15,
      level: 1,
      xpBySphere: { creativity: 15 },
    });
    const again = await b.inject({ method: "POST", url: `/goals/${goal.id}/complete` });
    expect(again.json().progress.xp).toBe(15);
  });

  it("reads a file from before the room existed as an empty room", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({
      version: 1,
      player: {
        id: "p1",
        nickname: "Ada",
        createdAt: "2026-01-01T00:00:00.000Z",
        progression: { level: 1, totalXp: 0, xpBySphere: {} },
      },
      goals: [{ id: "g1", title: "Old", xpReward: 5, status: "open", sphere: "creativity" }],
    }));
    openStore(file);
    expect(listGoals().map((goal) => goal.id)).toEqual(["g1"]);
    expect(listArtifacts()).toEqual([]);
    expect(getRoom()).toEqual({ placements: [] });
    expect(readFileSync(file, "utf8")).not.toContain("artifacts");
  });
});
