// R-XP-5…R-XP-10 and the new goal fields (spec usefulness_v1, 24.11.2026) through the HTTP API.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { listGoals, openStore, resetStore, setClockForTests } from "./store.js";

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
const xp = async () => (await app().inject({ method: "GET", url: "/progress" })).json().xp as number;
const seedId = (templateId: string) => listGoals().find((goal) => goal.templateId === templateId)!.id;

describe("daily XP rules", () => {
  const temps: string[] = [];
  beforeEach(() => {
    at("2026-11-24T08:00:00.000Z");
    setClockForTests(() => now);
    openStore(null);
    resetStore(true);
  });
  afterEach(() => {
    setClockForTests(null);
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("seeds carry seed-walk / seed-read and two self-reported completions give +10 +10 (R-XP-2)", async () => {
    const templates = listGoals().map((goal) => goal.templateId).sort();
    expect(templates).toEqual(["seed-read", "seed-walk"]);
    const walk = await complete(seedId("seed-walk"));
    expect(walk.json()).toMatchObject({ awarded: true, awardedToday: 1, awardCap: 5 });
    expect(walk.json().goal.xpGranted).toBe(10);
    await complete(seedId("seed-read"));
    expect(await xp()).toBe(20);
  });

  it("R-XP-4: the same goal again gives nothing", async () => {
    const id = seedId("seed-walk");
    await complete(id);
    const again = await complete(id);
    expect(again.json().awarded).toBe(false);
    expect(again.json().reason).toBeUndefined();
    expect(await xp()).toBe(10);
  });

  it("R-XP-6: the sixth completion today is done without XP, with reason and a calm message", async () => {
    await complete(seedId("seed-walk"));
    await complete(seedId("seed-read"));
    for (const title of ["А", "Б", "В"]) await complete(await make({ title, sphere: "career" }));
    expect(await xp()).toBe(50);
    const own = await make({ title: "Г", sphere: "finance" });
    const res = await complete(own);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ awarded: false, reason: "daily_cap", awardedToday: 5, awardCap: 5 });
    expect(res.json().goal).toMatchObject({ status: "done", xpGranted: 0, noXpReason: "daily_cap" });
    expect(res.json().message).toContain("5/5");
    expect(await xp()).toBe(50);
    const player = (await app().inject({ method: "GET", url: "/player" })).json();
    expect(player.today).toMatchObject({ day: "2026-11-24", awarded: 5, awardCap: 5 });
    expect(player.progress.xpBySphere.finance).toBeUndefined();
  });

  it("R-XP-7: four own missions — three with XP, the fourth recorded without XP", async () => {
    const ids = [];
    for (const title of ["1", "2", "3", "4"]) ids.push(await make({ title, sphere: "health" }));
    for (const id of ids.slice(0, 3)) expect((await complete(id)).json().awarded).toBe(true);
    const fourth = (await complete(ids[3]!)).json();
    expect(fourth).toMatchObject({ awarded: false, reason: "own_cap", ownAwardedToday: 3, ownAwardCap: 3 });
    expect(fourth.message).toContain("3/3");
    // Seeds are templates: they still pay (general cap 5 not reached).
    expect((await complete(seedId("seed-walk"))).json().awarded).toBe(true);
    expect(await xp()).toBe(40);
  });

  it("R-XP-8: no creativity mission, photo or completion while Мастерская is locked (map Proof hole)", async () => {
    const create = await post("/goals", { title: "Тёплый свет", sphere: "creativity" });
    expect(create.statusCode).toBe(400);
    expect(create.json().error).toBe("Место «Мастерская» откроется на уровне 2");
    expect((await post("/goals", { title: "Медитация", sphere: "spirit" })).json().error).toBe("Место «Парк» откроется на уровне 2");
    expect(await xp()).toBe(0);
  });

  it("R-XP-8: an old open creativity goal cannot be closed or get a photo while locked; done ones stay", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-daily-"));
    temps.push(dir);
    const file = path.join(dir, "levexp.json");
    writeFileSync(file, JSON.stringify({
      version: 1,
      player: { id: "p", nickname: "Игрок", createdAt: "2026-11-01T00:00:00.000Z", progression: { level: 1, totalXp: 35, xpBySphere: { creativity: 15, health: 20 } } },
      goals: [
        { id: "old-open", title: "Скетч", sphere: "creativity", xpReward: 10, status: "open" },
        { id: "old-done", title: "Фото", sphere: "creativity", xpReward: 15, status: "done", completedAt: "2026-11-20T10:00:00.000Z" },
      ],
    }));
    openStore(file);
    const closing = await complete("old-open");
    expect(closing.statusCode).toBe(400);
    expect(closing.json().error).toBe("Место «Мастерская» откроется на уровне 2");
    const photo = await post("/artifacts", { title: "Свет", kind: "photo", goalId: "old-open" });
    expect(photo.statusCode).toBe(400);
    expect(photo.json().error).toBe("Место «Мастерская» откроется на уровне 2");
    expect((await complete("old-done")).statusCode).toBe(200);
    // History is not recalculated (6.4): 35 XP and the creativity 15 stay.
    expect((await app().inject({ method: "GET", url: "/progress" })).json()).toEqual({ xp: 35, level: 1, xpBySphere: { creativity: 15, health: 20 } });
    expect(listGoals().find((goal) => goal.id === "old-open")!.status).toBe("open");
    expect(JSON.parse(readFileSync(file, "utf8")).player.progression.totalXp).toBe(35);
  });

  it("Мастерская opens at level 2 (two capped days = 100 XP), then creativity + photo gives +15", async () => {
    for (const [day, iso] of [["1", "2026-11-24T08:00:00.000Z"], ["2", "2026-11-25T08:00:00.000Z"]] as const) {
      at(iso);
      for (const k of ["a", "b", "c"]) await complete(await make({ title: `${day}${k}`, sphere: "career" }));
      for (const k of ["d", "e"]) await complete(await make({ title: `${day}${k}`, sphere: "finance" }));
    }
    // Own cap 3/day: the finance ones each day went without XP. Top up with seed templates.
    at("2026-11-25T09:00:00.000Z");
    expect(await xp()).toBe(60);
    await complete(seedId("seed-walk"));
    await complete(seedId("seed-read"));
    at("2026-11-26T08:00:00.000Z");
    for (const k of ["x", "y"]) await complete(await make({ title: k, sphere: "career" }));
    expect(await xp()).toBe(100);
    const goal = await make({ title: "Тёплый свет", sphere: "creativity" });
    const photo = await post("/artifacts", { title: "Свет", kind: "photo", imageUrl: "https://example.com/a.png", goalId: goal });
    expect(photo.statusCode).toBe(201);
    const res = (await complete(goal)).json();
    expect(res).toMatchObject({ awarded: true });
    expect(res.goal.xpGranted).toBe(15);
    expect(await xp()).toBe(115);
  });

  it("spheres without a map place (career) work at level 1 and count toward the caps", async () => {
    const id = await make({ title: "Резюме", sphere: "career" });
    expect((await complete(id)).json()).toMatchObject({ awarded: true, awardedToday: 1, ownAwardedToday: 1 });
  });

  it("R-XP-9/10: «Повторить завтра» makes one copy for the next Israeli day; same template same day pays once", async () => {
    const walk = seedId("seed-walk");
    await complete(walk);
    const first = await post("/goals", { repeatOf: walk, forTomorrow: true });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ title: "Утренняя прогулка 20 мин", sphere: "health", templateId: "seed-walk", repeatOf: walk, availableFrom: "2026-11-25", status: "open" });
    // Double tap: the same copy, no second one.
    const twice = await post("/goals", { repeatOf: walk, forTomorrow: true });
    expect(twice.statusCode).toBe(200);
    expect(twice.json().id).toBe(first.json().id);
    // Closing the copy today: done, but no second award for seed-walk.
    const early = (await complete(first.json().id)).json();
    expect(early).toMatchObject({ awarded: false, reason: "template_already_awarded" });
    expect(early.message).toContain("Утренняя прогулка 20 мин");
    expect(await xp()).toBe(10);
  });

  it("R-XP-10: next Israeli day the repeated copy gives the standard 10", async () => {
    at("2026-11-24T21:30:00.000Z"); // 23:30 on 24.11 in Israel
    const walk = seedId("seed-walk");
    await complete(walk);
    const copy = (await post("/goals", { repeatOf: walk, forTomorrow: true })).json();
    expect(copy.availableFrom).toBe("2026-11-25");
    at("2026-11-24T22:30:00.000Z"); // 00:30 on 25.11 in Israel, still 24.11 in UTC
    const res = (await complete(copy.id)).json();
    expect(res).toMatchObject({ awarded: true, awardedToday: 1 });
    expect(res.goal.xpGranted).toBe(10);
    expect(await xp()).toBe(20);
  });

  it("repeating an own mission makes the template own:<id> and does not use the own cap", async () => {
    const own = await make({ title: "Зарядка 10 мин", sphere: "health" });
    await complete(own);
    const copy = (await post("/goals", { repeatOf: own })).json();
    expect(copy.templateId).toBe(`own:${own}`);
    expect((await complete(copy.id)).json().reason).toBe("template_already_awarded");
    at("2026-11-25T08:00:00.000Z");
    const plan = await post("/goals", { templateId: `own:${own}` });
    expect(plan.statusCode).toBe(201);
    expect((await complete(plan.json().id)).json()).toMatchObject({ awarded: true, ownAwardedToday: 0 });
  });

  it("POST /goals validates the new fields; client xpReward is still 400", async () => {
    expect((await post("/goals", { title: "X", xpReward: 50 })).statusCode).toBe(400);
    expect((await post("/goals", { templateId: "seed-farm" })).statusCode).toBe(400);
    expect((await post("/goals", { templateId: "own:nope" })).statusCode).toBe(400);
    expect((await post("/goals", { repeatOf: "nope" })).statusCode).toBe(400);
    expect((await post("/goals", { repeatOf: seedId("seed-walk"), sphere: "mind" })).statusCode).toBe(400);
    expect((await post("/goals", { templateId: "seed-walk", sphere: "mind" })).statusCode).toBe(400);
    expect((await post("/goals", { sphere: "health" })).statusCode).toBe(400);
    expect((await post("/goals", { title: "X", forTomorrow: "yes" })).statusCode).toBe(400);
    const seed = await post("/goals", { templateId: "seed-read" });
    // The open seed-read from the seed is the same template for today: no duplicate.
    expect(seed.statusCode).toBe(200);
  });

  it("R-XP-11: energy at 0 does not stop XP; energy is spent only by completions with XP", async () => {
    await complete(seedId("seed-walk"));
    const player = (await app().inject({ method: "GET", url: "/player" })).json();
    expect(player.energy.current).toBe(45);
    for (const title of ["1", "2", "3", "4"]) await complete(await make({ title, sphere: "health" }));
    const after = (await app().inject({ method: "GET", url: "/player" })).json();
    // 1 seed + 3 own with XP = 4 paid, the 4th own without XP does not spend energy.
    expect(after.energy.current).toBe(30);
    // The streak still counts the day (a record without XP is still activity).
    expect(after.streak).toBe(1);
  });

  it("parallel completes of one goal do not double XP", async () => {
    const id = seedId("seed-walk");
    const results = await Promise.all([complete(id), complete(id), complete(id)]);
    expect(results.filter((res) => res.json().awarded)).toHaveLength(1);
    expect(await xp()).toBe(10);
  });
});

describe("active own missions limit and delete (playtest 24.11)", () => {
  beforeEach(() => {
    setClockForTests(() => new Date("2026-11-24T08:00:00.000Z"));
    openStore(null);
    resetStore(true);
  });
  afterEach(() => setClockForTests(null));

  it("allows 20 open own missions, refuses the 21st with a calm 409; repeats and seeds are not counted", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 20; i += 1) ids.push(await make({ title: `Своя ${i}`, sphere: "career" }));
    const extra = await post("/goals", { title: "Ещё одна", sphere: "career" });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().error).toBe("Активных своих миссий уже 20. Закрой или удали одну, чтобы добавить новую.");
    // A template copy is still fine.
    await complete(seedId("seed-walk"));
    expect((await post("/goals", { repeatOf: seedId("seed-walk"), forTomorrow: true })).statusCode).toBe(201);
    // Closing one frees a place.
    await complete(ids[0]!);
    expect((await post("/goals", { title: "Ещё одна", sphere: "career" })).statusCode).toBe(201);
  });

  it("DELETE removes an open mission only (no XP change); a done one is kept (409); unknown 404", async () => {
    const id = await make({ title: "Лишняя", sphere: "career" });
    const del = await app().inject({ method: "DELETE", url: `/goals/${id}` });
    expect(del.statusCode).toBe(204);
    expect(listGoals().some((goal) => goal.id === id)).toBe(false);
    const walk = seedId("seed-walk");
    await complete(walk);
    expect((await app().inject({ method: "DELETE", url: `/goals/${walk}` })).statusCode).toBe(409);
    expect((await app().inject({ method: "DELETE", url: "/goals/nope" })).statusCode).toBe(404);
    expect(await xp()).toBe(10);
  });

  it("«Отменить» after «Повторить завтра»: deleting the copy lets the same repeat be made again", async () => {
    const walk = seedId("seed-walk");
    await complete(walk);
    const copy = (await post("/goals", { repeatOf: walk, forTomorrow: true })).json();
    expect((await app().inject({ method: "DELETE", url: `/goals/${copy.id}` })).statusCode).toBe(204);
    const again = await post("/goals", { repeatOf: walk, forTomorrow: true });
    expect(again.statusCode).toBe(201);
    expect(again.json().id).not.toBe(copy.id);
  });
});

describe("micro-reflection (spec №3)", () => {
  beforeEach(() => {
    setClockForTests(() => new Date("2026-11-24T08:00:00.000Z"));
    openStore(null);
    resetStore(true);
  });
  afterEach(() => setClockForTests(null));

  it("saves felt + note on a done goal and never changes XP", async () => {
    const id = seedId("seed-walk");
    expect((await post(`/goals/${id}/reflection`, { felt: "easy" })).statusCode).toBe(400); // not done yet
    await complete(id);
    const before = (await app().inject({ method: "GET", url: "/player" })).json();
    const res = await post(`/goals/${id}/reflection`, { felt: "hard", note: "  Дождь, но прошлась  " });
    expect(res.statusCode).toBe(200);
    expect(res.json().reflection).toMatchObject({ felt: "hard", note: "Дождь, но прошлась" });
    const after = (await app().inject({ method: "GET", url: "/player" })).json();
    expect(after.progress).toEqual(before.progress);
    expect(after.today).toEqual(before.today);
  });

  it("validates felt, note length and unknown goals", async () => {
    const id = seedId("seed-read");
    await complete(id);
    expect((await post(`/goals/${id}/reflection`, { felt: "great" })).statusCode).toBe(400);
    expect((await post(`/goals/${id}/reflection`, { felt: "ok", note: "x".repeat(201) })).statusCode).toBe(400);
    expect((await post(`/goals/${id}/reflection`, { felt: "ok", xp: 5 })).statusCode).toBe(400);
    expect((await post(`/goals/nope/reflection`, { felt: "ok" })).statusCode).toBe(404);
    const okNoNote = await post(`/goals/${id}/reflection`, { felt: "ok" });
    expect(okNoNote.json().reflection.note).toBeUndefined();
  });

  it("a reflection survives a reload of the data file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-refl-"));
    const file = path.join(dir, "levexp.json");
    try {
      openStore(file);
      const id = seedId("seed-walk");
      await complete(id);
      await post(`/goals/${id}/reflection`, { felt: "ok", note: "Норм" });
      await post("/goals", { repeatOf: id, forTomorrow: true });
      openStore(null);
      resetStore(false);
      openStore(file);
      const goals = listGoals();
      expect(goals.find((goal) => goal.id === id)).toMatchObject({ reflection: { felt: "ok", note: "Норм" }, xpGranted: 10, templateId: "seed-walk" });
      expect(goals.find((goal) => goal.repeatOf === id)).toMatchObject({ availableFrom: "2026-11-25", templateId: "seed-walk" });
    } finally {
      openStore(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
