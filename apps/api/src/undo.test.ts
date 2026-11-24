// scene18 «Отменить» / «Вернуть»: today's record only; an undo/redo loop never farms XP, energy or levels.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { listGoals, openStore, resetStore, setClockForTests, setUnlockLevelForTests } from "./store.js";

let now = new Date("2026-11-24T08:00:00.000Z"); // 10:00 in Israel
const at = (iso: string) => { now = new Date(iso); };
const app = () => buildApp({ logger: false });
type Res = Awaited<ReturnType<ReturnType<typeof buildApp>["inject"]>>;

async function post(url: string, payload?: unknown): Promise<Res> {
  return app().inject({ method: "POST", url, ...(payload === undefined ? {} : { payload: payload as object }) });
}
async function make(payload: object): Promise<string> {
  const res = await post("/goals", payload);
  expect([200, 201]).toContain(res.statusCode);
  return res.json().id;
}
const complete = (id: string) => post(`/goals/${id}/complete`);
const undo = (id: string) => post(`/goals/${id}/undo`);
const player = async () => (await app().inject({ method: "GET", url: "/player" })).json();
/** Everything an undo/redo loop could try to farm. */
async function state() {
  const p = await player();
  return { xp: p.progress.xp as number, level: p.progress.level as number, bySphere: p.progress.xpBySphere as Record<string, number>, energy: p.energy.current as number, awarded: p.today.awarded as number, ownAwarded: p.today.ownAwarded as number };
}
const seedId = (templateId: string) => listGoals().find((goal) => goal.templateId === templateId && goal.status === "open")!.id;

describe("«Отменить» today's record (scene18)", () => {
  const temps: string[] = [];
  beforeEach(() => {
    at("2026-11-24T08:00:00.000Z");
    setClockForTests(() => now);
    openStore(null);
    resetStore(true);
  });
  afterEach(() => {
    setClockForTests(null);
    setUnlockLevelForTests(null);
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("takes back exactly the XP and energy, frees the slot; «Вернуть» is a new completion", async () => {
    const walk = seedId("seed-walk");
    const before = await state();
    await complete(walk);
    expect(await state()).toMatchObject({ xp: 10, energy: 45, awarded: 1, bySphere: { health: 10 } });
    const res = await undo(walk);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ removedXp: 10, awardedToday: 0, awardCap: 5 });
    expect(res.json().goal).toMatchObject({ status: "open" });
    expect(res.json().goal.undoneAt).toBe(now.toISOString());
    expect(res.json().goal.completedAt).toBeUndefined();
    expect(res.json().goal.xpGranted).toBeUndefined();
    expect(await state()).toMatchObject({ xp: before.xp, energy: before.energy, awarded: 0, level: before.level, bySphere: { health: 0 } });
    const again = (await complete(walk)).json();
    expect(again).toMatchObject({ awarded: true, awardedToday: 1 });
    expect(again.goal.undoneAt).toBeUndefined();
    expect(await state()).toMatchObject({ xp: 10, energy: 45, awarded: 1 });
  });

  it("an undo/redo loop on one record ends where one honest record ends", async () => {
    const walk = seedId("seed-walk");
    await complete(walk);
    const honest = await state();
    for (let i = 0; i < 25; i += 1) {
      expect((await undo(walk)).statusCode).toBe(200);
      expect((await complete(walk)).statusCode).toBe(200);
    }
    expect(await state()).toEqual(honest);
  });

  it("daily cap 5: an undone slot can be used once, «Вернуть» then records without XP (daily_cap)", async () => {
    const ids = [seedId("seed-walk"), seedId("seed-read")];
    for (const templateId of ["career-focus", "finance-spend", "rel-call", "rel-thanks"]) ids.push(await make({ templateId }));
    for (const id of ids.slice(0, 5)) expect((await complete(id)).json().awarded).toBe(true);
    const sixth = (await complete(ids[5]!)).json();
    expect(sixth).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(await state()).toMatchObject({ xp: 50, awarded: 5, energy: 25 });
    // Undo a paid record: the slot is free.
    expect((await undo(ids[0]!)).json()).toMatchObject({ removedXp: 10, awardedToday: 4 });
    // The sixth (no XP) is taken back for 0 and done again: now it takes the slot.
    expect((await undo(ids[5]!)).json()).toMatchObject({ removedXp: 0, awardedToday: 4 });
    expect((await complete(ids[5]!)).json()).toMatchObject({ awarded: true, awardedToday: 5 });
    // «Вернуть» on the first: the cap is full again.
    expect((await complete(ids[0]!)).json()).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(await state()).toMatchObject({ xp: 50, awarded: 5, energy: 25 });
    // Any order of undo/redo over all six never passes 5 awards / 50 XP.
    for (let round = 0; round < 4; round += 1) {
      for (const id of ids) { await undo(id); }
      for (const id of [...ids].reverse()) { await complete(id); }
      const s = await state();
      expect(s.awarded).toBe(5);
      expect(s.xp).toBe(50);
      expect(s.energy).toBe(25);
    }
  });

  it("own cap 3: undo frees an own slot; the loop never gives a fourth own award", async () => {
    const own = [];
    for (const title of ["1", "2", "3", "4"]) own.push(await make({ title, sphere: "health" }));
    for (const id of own.slice(0, 3)) await complete(id);
    expect((await complete(own[3]!)).json()).toMatchObject({ awarded: false, reason: "own_cap" });
    expect((await undo(own[1]!)).json()).toMatchObject({ removedXp: 10 });
    expect((await player()).today.ownAwarded).toBe(2);
    expect((await undo(own[3]!)).json().removedXp).toBe(0);
    expect((await complete(own[3]!)).json()).toMatchObject({ awarded: true });
    expect((await complete(own[1]!)).json()).toMatchObject({ awarded: false, reason: "own_cap" });
    for (let i = 0; i < 10; i += 1) {
      await undo(own[i % 4]!);
      await complete(own[i % 4]!);
    }
    expect(await state()).toMatchObject({ xp: 30, ownAwarded: 3, energy: 35 });
  });

  it("template once a day: undo resets the mark; «Вернуть» on the first copy gets template_already_awarded", async () => {
    const first = seedId("seed-walk");
    await complete(first);
    const copy = (await post("/goals", { repeatOf: first })).json().id;
    expect((await complete(copy)).json()).toMatchObject({ awarded: false, reason: "template_already_awarded" });
    await undo(first);
    await undo(copy);
    expect((await complete(copy)).json()).toMatchObject({ awarded: true });
    expect((await complete(first)).json()).toMatchObject({ awarded: false, reason: "template_already_awarded" });
    expect(await state()).toMatchObject({ xp: 10, awarded: 1 });
  });

  it("level-ups: undo takes the level back with the XP; the loop cannot level up twice", async () => {
    // Day 1: five awards (50 XP); day 2: four more (90 XP).
    const templates = ["seed-walk", "seed-read", "career-focus", "finance-spend", "rel-call"];
    at("2026-11-22T08:00:00.000Z");
    for (const templateId of templates) await complete(await make({ templateId }));
    at("2026-11-23T08:00:00.000Z");
    for (const templateId of templates.slice(0, 4)) await complete(await make({ templateId }));
    expect(await state()).toMatchObject({ xp: 90, level: 1 });
    at("2026-11-24T08:00:00.000Z");
    const last = await make({ templateId: "rel-thanks" });
    await complete(last);
    expect(await state()).toMatchObject({ xp: 100, level: 2 });
    for (let i = 0; i < 10; i += 1) {
      await undo(last);
      expect(await state()).toMatchObject({ xp: 90, level: 1 });
      await complete(last);
      expect(await state()).toMatchObject({ xp: 100, level: 2 });
    }
  });

  it("the creativity photo bonus is taken back exactly; the photo stays linked; Proof is not changed", async () => {
    setUnlockLevelForTests(2);
    const goal = await make({ title: "Скетч", sphere: "creativity" });
    const photo = (await post("/artifacts", { title: "Свет", kind: "photo", imageUrl: "https://example.com/a.png", goalId: goal })).json();
    const done = (await post(`/goals/${goal}/complete`, { artifactId: photo.id })).json();
    expect(done.goal.xpGranted).toBe(15);
    expect((await undo(goal)).json()).toMatchObject({ removedXp: 15 });
    expect((await state()).bySphere.creativity).toBe(0);
    const room = (await app().inject({ method: "GET", url: "/room" })).json();
    expect(room.placements.some((placement: { artifact: { goalId?: string } }) => placement.artifact.goalId === goal)).toBe(true);
    // «Вернуть» is a plain completion: the linked photo still counts, once.
    expect((await complete(goal)).json().goal.xpGranted).toBe(15);
    expect((await state()).xp).toBe(15);
  });

  it("only today's record: past days answer 409 and stay as they are; open / unknown goals too", async () => {
    const walk = seedId("seed-walk");
    at("2026-11-24T21:30:00.000Z"); // 23:30 in Israel, 24.11
    await complete(walk);
    at("2026-11-24T22:10:00.000Z"); // 00:10 in Israel, 25.11: a new player day
    const res = await undo(walk);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("only today's record can be undone");
    expect(listGoals().find((goal) => goal.id === walk)).toMatchObject({ status: "done", xpGranted: 10 });
    expect((await state()).xp).toBe(10);
    expect((await undo(seedId("seed-read"))).statusCode).toBe(409);
    expect((await undo("missing")).statusCode).toBe(404);
  });

  it("undoneAt is saved to the data file and read back", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "levex-undo-"));
    temps.push(dir);
    const file = path.join(dir, "levexp.json");
    openStore(file);
    resetStore(true);
    const walk = seedId("seed-walk");
    await complete(walk);
    await undo(walk);
    openStore(file);
    const saved = listGoals().find((goal) => goal.id === walk)!;
    expect(saved).toMatchObject({ status: "open", undoneAt: now.toISOString() });
    expect((await state()).xp).toBe(0);
  });
});
