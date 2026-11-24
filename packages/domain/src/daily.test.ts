import { describe, expect, it } from "vitest";
import {
  awardDecision,
  dailyCapHint,
  dailyLedger,
  lockedPlaceFor,
  noXpMessage,
  placeLockedMessage,
  playerDay,
  playerDdMm,
  templateKeyOf,
  type DailyGoal,
} from "./daily.js";
import { energyForDay, streakDays } from "./streak.js";

// 01:30 in Israel on 24.11 is still 23.11 in UTC (winter, UTC+2).
const NIGHT = new Date("2026-11-23T23:30:00.000Z");

let n = 0;
function done(at: string, extra: Partial<DailyGoal> = {}): DailyGoal {
  n += 1;
  return { id: `g${n}`, title: `Своя ${n}`, sphere: "health", status: "done", completedAt: at, xpReward: 10, xpGranted: 10, ...extra };
}
const open = (extra: Partial<DailyGoal> = {}): DailyGoal => ({ id: "new", title: "Новая", sphere: "health", status: "open", xpReward: 10, ...extra });

describe("R-XP-5 player day (Asia/Jerusalem)", () => {
  it("01:30 Israel on 24.11 is day 24.11, not UTC 23.11", () => {
    expect(playerDay(NIGHT)).toBe("2026-11-24");
    expect(NIGHT.toISOString().slice(0, 10)).toBe("2026-11-23");
    expect(playerDdMm(NIGHT.toISOString())).toBe("24.11");
  });

  it("summer time is UTC+3", () => {
    expect(playerDay(new Date("2026-07-01T21:30:00.000Z"))).toBe("2026-07-02");
    expect(playerDay(new Date("2026-07-01T20:30:00.000Z"))).toBe("2026-07-01");
  });

  it("streak and energy count by the Israeli day", () => {
    // 23.11 22:30Z = 24.11 00:30 in Israel: today, not yesterday.
    expect(streakDays(["2026-11-23T22:30:00.000Z"], NIGHT)).toBe(1);
    expect(energyForDay(["2026-11-23T22:30:00.000Z"], NIGHT).current).toBe(45);
    // 21:30Z on 23.11 is 23:30 on 23.11 in Israel: yesterday.
    expect(energyForDay(["2026-11-23T21:30:00.000Z"], NIGHT).current).toBe(50);
  });

  it("ledger groups by the Israeli day", () => {
    const ledger = dailyLedger([done("2026-11-23T22:10:00.000Z"), done("2026-11-23T21:50:00.000Z")], NIGHT);
    expect(ledger.day).toBe("2026-11-24");
    expect(ledger.awarded).toBe(1);
  });
});

describe("R-XP-6 daily cap 5", () => {
  it("fifth award passes, sixth is recorded without XP", () => {
    const four = Array.from({ length: 4 }, (_, i) => done("2026-11-24T08:00:00.000Z", { templateId: `seed-${i}` }));
    expect(awardDecision(open({ templateId: "seed-walk" }), dailyLedger(four, NIGHT))).toEqual({ award: true });
    const five = [...four, done("2026-11-24T08:00:00.000Z", { templateId: "seed-walk" })];
    expect(awardDecision(open({ templateId: "seed-read" }), dailyLedger(five, NIGHT))).toEqual({ award: false, reason: "daily_cap" });
  });

  it("completions without XP and legacy rows: only granted XP counts", () => {
    const rows = [
      done("2026-11-24T08:00:00.000Z", { xpGranted: 0 }),
      done("2026-11-24T08:00:00.000Z", { xpGranted: undefined, xpReward: 15 }),
    ];
    const ledger = dailyLedger(rows, NIGHT);
    expect(ledger.awarded).toBe(1);
  });
});

describe("R-XP-7 own missions cap 3", () => {
  it("fourth own mission is recorded without XP; templates do not use the own cap", () => {
    const three = Array.from({ length: 3 }, () => done("2026-11-24T08:00:00.000Z"));
    const ledger = dailyLedger(three, NIGHT);
    expect(ledger.ownAwarded).toBe(3);
    expect(awardDecision(open(), ledger)).toEqual({ award: false, reason: "own_cap" });
    expect(awardDecision(open({ templateId: "seed-walk" }), ledger)).toEqual({ award: true });
  });
});

describe("R-XP-10 one award per template per day", () => {
  it("second completion of the same template today gets no XP", () => {
    const ledger = dailyLedger([done("2026-11-24T08:00:00.000Z", { templateId: "seed-walk" })], NIGHT);
    expect(awardDecision(open({ templateId: "seed-walk" }), ledger)).toEqual({ award: false, reason: "template_already_awarded" });
    expect(awardDecision(open({ templateId: "seed-read" }), ledger)).toEqual({ award: true });
  });

  it("a copy of an own mission and its origin count as one template", () => {
    const origin = done("2026-11-24T08:00:00.000Z");
    const ledger = dailyLedger([origin], NIGHT);
    expect(awardDecision(open({ templateId: `own:${origin.id}`, repeatOf: origin.id }), ledger))
      .toEqual({ award: false, reason: "template_already_awarded" });
  });

  it("next Israeli day the template pays again", () => {
    const ledger = dailyLedger([done("2026-11-23T21:00:00.000Z", { templateId: "seed-walk" })], NIGHT);
    expect(awardDecision(open({ templateId: "seed-walk" }), ledger)).toEqual({ award: true });
  });

  it("old seeds without templateId are recognised by exact title and sphere", () => {
    expect(templateKeyOf({ title: "Утренняя прогулка 20 мин", sphere: "health" })).toBe("seed-walk");
    expect(templateKeyOf({ title: "Утренняя прогулка 20 мин", sphere: "mind" })).toBeNull();
    expect(templateKeyOf({ title: "Утренняя прогулка 20 мин", sphere: "health", repeatOf: "x" })).toBeNull();
  });
});

describe("R-XP-8 locked places", () => {
  it("Мастерская and Парк are locked at level 1, spheres without a place never", () => {
    expect(lockedPlaceFor("creativity", 1)?.name).toBe("Мастерская");
    expect(lockedPlaceFor("spirit", 1)?.name).toBe("Парк");
    expect(lockedPlaceFor("creativity", 2)).toBeUndefined();
    expect(lockedPlaceFor("career", 1)).toBeUndefined();
    expect(lockedPlaceFor("health", 1)).toBeUndefined();
    expect(placeLockedMessage({ name: "Мастерская", unlockLevel: 2 })).toBe("Место «Мастерская» откроется на уровне 2");
  });
});

describe("limit texts", () => {
  it("keep the word XP and use no pressure or guilt words", () => {
    const texts = [
      noXpMessage("daily_cap"),
      noXpMessage("own_cap"),
      noXpMessage("template_already_awarded", { title: "Прогулка" }),
      dailyCapHint(),
    ];
    expect(texts[0]).toContain("5/5");
    expect(texts[1]).toContain("3/3");
    for (const text of texts) {
      expect(text).toMatch(/XP/);
      expect(text).not.toMatch(/сгор|потеря|потеряешь|успей|должен|опять|стыд|отметк/i);
    }
  });
});
