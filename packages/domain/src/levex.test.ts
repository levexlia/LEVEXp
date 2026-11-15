import { describe, expect, it } from "vitest";
import {
  ACCESSORIES,
  DEFAULT_AVATAR_CONFIG,
  EXPRESSIONS,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
  lookFromPhoto,
  looksFromPhoto,
  normalizeAvatarConfig,
  parseAvatarConfig,
} from "./avatarConfig.js";
import { mapNodeStates } from "./map.js";
import { energyForDay, streakDays } from "./streak.js";

const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("streak and energy", () => {
  it("counts a run of days that reaches today or yesterday", () => {
    expect(streakDays([
      "2026-11-13T08:00:00.000Z",
      "2026-11-14T08:00:00.000Z",
      "2026-11-15T01:00:00.000Z",
      "2026-11-15T18:00:00.000Z",
    ], NOW)).toBe(3);
    expect(streakDays(["2026-11-14T22:00:00.000Z"], NOW)).toBe(1);
    expect(streakDays(["2026-11-12T22:00:00.000Z"], NOW)).toBe(0);
    expect(streakDays([undefined, "not-a-date"], NOW)).toBe(0);
  });

  it("spends five energy for each goal finished today", () => {
    expect(energyForDay(["2026-11-15T01:00:00.000Z", "2026-11-15T02:00:00.000Z", "2026-11-14T02:00:00.000Z"], NOW))
      .toEqual({ current: 40, max: 50 });
    expect(energyForDay(Array.from({ length: 12 }, () => "2026-11-15T03:00:00.000Z"), NOW).current).toBe(0);
  });
});

describe("map nodes", () => {
  it("unlocks by level and marks a sphere done only after a finished goal", () => {
    const fresh = mapNodeStates({ level: 1, doneSpheres: [] });
    expect(fresh.map((node) => node.state)).toEqual(["current", "locked", "locked", "locked", "locked"]);

    const studied = mapNodeStates({ level: 1, doneSpheres: ["health"] });
    expect(studied.find((node) => node.id === "home")?.state).toBe("done");
    expect(studied.find((node) => node.id === "study")?.state).toBe("current");

    const wider = mapNodeStates({ level: 2, doneSpheres: ["health", "mind"] });
    expect(wider.find((node) => node.id === "park")?.state).toBe("current");
    expect(wider.find((node) => node.id === "center")?.state).toBe("locked");

    const all = mapNodeStates({
      level: 4,
      doneSpheres: ["health", "mind", "spirit", "creativity", "community"],
    });
    expect(all.every((node) => node.state === "done")).toBe(true);
  });
});

const KIT_LOOK = {
  hairStyle: "hair_ponytail",
  hairColor: "cyan",
  skinTone: "fair",
  outfit: "outfit_cyan_jacket",
  expression: "proud",
  accessory: "acc_glasses",
} as const;

describe("avatar config", () => {
  it("accepts kit ids and rejects unknown parts and extra fields", () => {
    expect(parseAvatarConfig(KIT_LOOK)).toEqual(KIT_LOOK);
    expect(parseAvatarConfig({ ...KIT_LOOK, hairStyle: "mohawk" })).toBeUndefined();
    expect(parseAvatarConfig({ ...KIT_LOOK, cape: "red" })).toBeUndefined();
    expect(parseAvatarConfig({ ...KIT_LOOK, accessory: "star" })).toBeUndefined();
  });

  it("normalizes a legacy hand-drawn look to the default kit", () => {
    expect(normalizeAvatarConfig({
      skin: "peach",
      hair: "wavy",
      hairColor: "brown",
      eyes: "round",
      outfit: "hoodie",
      accessory: "glasses",
      emotion: "proud",
    })).toEqual(DEFAULT_AVATAR_CONFIG);
    expect(normalizeAvatarConfig(KIT_LOOK)).toEqual(KIT_LOOK);
    expect(normalizeAvatarConfig({ nope: true })).toBeUndefined();
    expect(normalizeAvatarConfig(null)).toBeUndefined();
  });

  it("maps a photo to the same kit ids every time", () => {
    const bytes = Uint8Array.from([1, 2, 3, 9, 9, 4]);
    const look = lookFromPhoto(bytes);
    expect(look).toEqual(lookFromPhoto(bytes));
    expect(HAIR_STYLES).toContain(look.hairStyle);
    expect(HAIR_COLORS).toContain(look.hairColor);
    expect(SKIN_TONES).toContain(look.skinTone);
    expect(OUTFITS).toContain(look.outfit);
    expect(EXPRESSIONS).toContain(look.expression);
    expect(ACCESSORIES).toContain(look.accessory);
    expect(look.expression).toBe("happy");
    const other = Uint8Array.from([9, 9, 9, 1]);
    const looks = looksFromPhoto(bytes, 3);
    expect(looks).toHaveLength(3);
    expect(looks[0]).toEqual(look);
    expect(looks[1]?.expression).toBe("proud");
    expect(looks[2]?.expression).toBe("surprised");
    expect(lookFromPhoto(other)).not.toEqual(look);
  });
});
