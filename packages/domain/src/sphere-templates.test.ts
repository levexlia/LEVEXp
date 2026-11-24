// Placeless missions for Карьера, Финансы, Отношения (package «sphere missions», 24.11.2026).
import { describe, expect, it } from "vitest";
import {
  DAILY_AWARD_CAP,
  MAP_NODES,
  PLACELESS_SPHERES,
  SEED_TEMPLATES,
  SPHERE_TEMPLATES,
  awardDecision,
  builtInTemplate,
  dailyLedger,
  lockedPlaceFor,
  sphereTemplate,
  templateKeyOf,
  xpForGoal,
  type DailyGoal,
} from "./index.js";

const NOW = new Date("2026-11-24T08:00:00.000Z");
const doneAt = "2026-11-24T07:00:00.000Z";

describe("placeless sphere templates", () => {
  it("3 templates for each of Карьера, Финансы, Отношения; unique ids, none of them a seed", () => {
    expect([...PLACELESS_SPHERES]).toEqual(["career", "finance", "relationships"]);
    for (const sphere of PLACELESS_SPHERES) {
      expect(SPHERE_TEMPLATES.filter((t) => t.sphere === sphere)).toHaveLength(3);
    }
    const ids = SPHERE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(9);
    expect(ids.some((id) => SEED_TEMPLATES.some((seed) => seed.id === id))).toBe(false);
  });

  it("these spheres really have no map place, so nothing locks them at level 1 (R-XP-8)", () => {
    for (const sphere of PLACELESS_SPHERES) {
      expect(MAP_NODES.some((node) => node.sphere === sphere)).toBe(false);
      expect(lockedPlaceFor(sphere, 1)).toBeUndefined();
    }
  });

  it("small and realistic: 5–25 minutes, and every one has an activity aid (timer or steps)", () => {
    for (const t of SPHERE_TEMPLATES) {
      expect(t.minutes).toBeGreaterThanOrEqual(5);
      expect(t.minutes).toBeLessThanOrEqual(25);
      if (t.aid.kind === "timer") expect(t.aid.minutes).toBe(t.minutes);
      else expect(t.aid.steps.length).toBeGreaterThanOrEqual(2);
      expect(t.title.length).toBeLessThanOrEqual(60);
    }
  });

  it("+10 XP each (the standard reward, no photo bonus)", () => {
    for (const t of SPHERE_TEMPLATES) expect(xpForGoal({ sphere: t.sphere })).toBe(10);
  });

  it("finance templates never ask for an amount: no digits with currency, no «сколько» in titles or steps", () => {
    for (const t of SPHERE_TEMPLATES.filter((item) => item.sphere === "finance")) {
      const text = [t.title, ...(t.aid.kind === "steps" ? t.aid.steps : [])].join(" ");
      expect(text).not.toMatch(/\d|₪|\$|€|руб|шекел|сколько/iu);
    }
  });

  it("lookup helpers: sphereTemplate / builtInTemplate / templateKeyOf", () => {
    expect(sphereTemplate("finance-sub")?.title).toBe("Проверить одну подписку");
    expect(sphereTemplate("seed-walk")).toBeUndefined();
    expect(builtInTemplate("seed-walk")?.sphere).toBe("health");
    expect(builtInTemplate("rel-call")?.sphere).toBe("relationships");
    expect(builtInTemplate("own:x")).toBeUndefined();
    expect(templateKeyOf({ title: "Проверить одну подписку", sphere: "finance", templateId: "finance-sub" })).toBe("finance-sub");
  });
});

describe("R-XP-6/7/10 apply to placeless templates like to seeds", () => {
  const goal = (id: string, templateId: string | undefined, done = false): DailyGoal => ({
    id, title: id, sphere: "finance", xpReward: 10, templateId,
    status: done ? "done" : "open", ...(done ? { completedAt: doneAt, xpGranted: 10 } : {}),
  });

  it("a template gives XP once a day (R-XP-10)", () => {
    const ledger = dailyLedger([goal("a", "finance-spend", true)], NOW);
    expect(awardDecision(goal("b", "finance-spend"), ledger)).toEqual({ award: false, reason: "template_already_awarded" });
    expect(awardDecision(goal("c", "finance-sub"), ledger)).toEqual({ award: true });
  });

  it("they are not own missions: 3 own awards today do not stop them (R-XP-7)", () => {
    const own = ["o1", "o2", "o3"].map((id) => goal(id, undefined, true));
    const ledger = dailyLedger(own, NOW);
    expect(ledger.ownAwarded).toBe(3);
    expect(awardDecision(goal("x", "rel-thanks"), ledger)).toEqual({ award: true });
  });

  it("the day cap of 5 counts them (R-XP-6)", () => {
    const five = SPHERE_TEMPLATES.slice(0, DAILY_AWARD_CAP).map((t, i) => goal(`d${i}`, t.id, true));
    const ledger = dailyLedger(five, NOW);
    expect(ledger.awarded).toBe(5);
    expect(awardDecision(goal("y", SPHERE_TEMPLATES[8]!.id), ledger)).toEqual({ award: false, reason: "daily_cap" });
  });
});
