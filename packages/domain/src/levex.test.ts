import { describe, expect, it } from "vitest";
import { lookFromPhoto, looksFromPhoto, parseAvatarConfig } from "./avatarConfig.js";
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

describe("avatar config", () => {
  it("rejects unknown parts and extra fields", () => {
    expect(parseAvatarConfig({
      skin: "peach", hair: "wavy", hairColor: "brown", eyes: "round",
      outfit: "hoodie", accessory: "none", emotion: "happy",
    })?.hair).toBe("wavy");
    expect(parseAvatarConfig({
      skin: "peach", hair: "mohawk", hairColor: "brown", eyes: "round",
      outfit: "hoodie", accessory: "none", emotion: "happy",
    })).toBeUndefined();
    expect(parseAvatarConfig({
      skin: "peach", hair: "wavy", hairColor: "brown", eyes: "round",
      outfit: "hoodie", accessory: "none", emotion: "happy", cape: "red",
    })).toBeUndefined();
  });

  it("maps a photo to the same parts every time", () => {
    const bytes = Uint8Array.from([1, 2, 3, 9, 9, 4]);
    expect(lookFromPhoto(bytes)).toEqual(lookFromPhoto(bytes));
    const other = Uint8Array.from([9, 9, 9, 1]);
    const looks = looksFromPhoto(bytes, 3);
    expect(looks).toHaveLength(3);
    expect(looks[0]).toEqual(lookFromPhoto(bytes));
    expect(lookFromPhoto(other)).not.toEqual(lookFromPhoto(bytes));
  });
});
