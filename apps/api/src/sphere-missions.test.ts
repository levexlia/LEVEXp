// Placeless missions (Карьера, Финансы, Отношения) through the HTTP API: level 1, +10 XP, daily rules, no amounts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SPHERE_TEMPLATES } from "@levex/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { listGoals, openStore, resetStore, setClockForTests } from "./store.js";

let now = new Date("2026-11-24T08:00:00.000Z");
const app = () => buildApp({ logger: false });
const post = (url: string, payload?: object) => app().inject({ method: "POST", url, ...(payload ? { payload } : {}) });
const xp = async () => (await app().inject({ method: "GET", url: "/progress" })).json().xp as number;
const level = async () => (await app().inject({ method: "GET", url: "/progress" })).json().level as number;

describe("placeless sphere missions (API)", () => {
  beforeEach(() => {
    now = new Date("2026-11-24T08:00:00.000Z");
    setClockForTests(() => now);
    openStore(null);
    resetStore(true);
  });
  afterEach(() => {
    setClockForTests(null);
    openStore(null);
  });

  it("every template can be added at level 1 and takes title and sphere from the template", async () => {
    expect(await level()).toBe(1);
    for (const t of SPHERE_TEMPLATES) {
      const res = await post("/goals", { templateId: t.id });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ title: t.title, sphere: t.sphere, templateId: t.id, xpReward: 10, status: "open" });
    }
  });

  it("a double tap makes one copy; a sphere that does not match the template is refused", async () => {
    const first = await post("/goals", { templateId: "rel-write" });
    const again = await post("/goals", { templateId: "rel-write" });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect((await post("/goals", { templateId: "rel-write", sphere: "finance" })).statusCode).toBe(400);
  });

  it("+10 XP on completion; the same template again today is recorded without XP (R-XP-10)", async () => {
    const a = (await post("/goals", { templateId: "career-focus" })).json().id;
    const done = await post(`/goals/${a}/complete`);
    expect(done.json()).toMatchObject({ awarded: true });
    expect(done.json().goal.xpGranted).toBe(10);
    expect(await xp()).toBe(10);
    const b = (await post("/goals", { templateId: "career-focus" })).json().id;
    expect(b).not.toBe(a);
    const second = await post(`/goals/${b}/complete`);
    expect(second.json()).toMatchObject({ awarded: false, reason: "template_already_awarded" });
    expect(await xp()).toBe(10);
  });

  it("not counted as own missions (R-XP-7) but counted by the day cap of 5 (R-XP-6)", async () => {
    for (const title of ["А", "Б", "В"]) {
      const id = (await post("/goals", { title, sphere: "health" })).json().id;
      await post(`/goals/${id}/complete`);
    }
    expect(await xp()).toBe(30);
    for (const templateId of ["finance-sub", "rel-thanks"]) {
      const id = (await post("/goals", { templateId })).json().id;
      expect((await post(`/goals/${id}/complete`)).json().awarded).toBe(true);
    }
    expect(await xp()).toBe(50);
    const sixth = (await post("/goals", { templateId: "career-plan" })).json().id;
    expect((await post(`/goals/${sixth}/complete`)).json()).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(await xp()).toBe(50);
    // Next player day (Asia/Jerusalem, R-XP-5): the same templates give XP again.
    now = new Date("2026-11-24T22:30:00.000Z"); // 00:30 on 25.11 in Israel
    const next = (await post("/goals", { templateId: "finance-sub" })).json().id;
    expect((await post(`/goals/${next}/complete`)).json().awarded).toBe(true);
  });

  it("no amounts are stored anywhere: extra fields are not kept; the record has only the done mark and a note", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-spheres-"));
    const file = path.join(dir, "levexp.json");
    try {
      openStore(file);
      const created = await post("/goals", { templateId: "finance-save", amount: 777, currency: "ILS" } as object);
      // Fastify drops or refuses unknown properties; either way nothing about money gets in.
      expect([201, 400]).toContain(created.statusCode);
      const id = created.statusCode === 201 ? created.json().id : (await post("/goals", { templateId: "finance-save" })).json().id;
      const withAmount = await app().inject({ method: "POST", url: `/goals/${id}/complete`, payload: { amount: 777 } });
      if (withAmount.statusCode !== 200) {
        expect(withAmount.statusCode).toBe(400);
        expect((await post(`/goals/${id}/complete`)).json().awarded).toBe(true);
      }
      await post(`/goals/${id}/reflection`, { felt: "easy", note: "Получилось" });
      const stored = listGoals().find((goal) => goal.id === id)!;
      expect(Object.keys(stored).sort()).toEqual(
        ["completedAt", "id", "reflection", "sphere", "status", "templateId", "title", "xpGranted", "xpReward"].sort(),
      );
      const raw = readFileSync(file, "utf8");
      expect(raw).not.toMatch(/amount|currency|777|ILS/);
    } finally {
      openStore(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
