import { describe, expect, it } from "vitest";
import {
  XP_CREATIVITY_PHOTO_BONUS,
  XP_REWARD_MAX,
  XP_REWARD_STANDARD,
  xpForGoal,
  xpGrantedForGoal,
} from "./index.js";

describe("xpForGoal", () => {
  it("pays the standard reward unless a creativity photo is linked", () => {
    expect(xpForGoal()).toBe(XP_REWARD_STANDARD);
    expect(xpForGoal({ sphere: "health" })).toBe(XP_REWARD_STANDARD);
    expect(xpForGoal({ sphere: "creativity" })).toBe(XP_REWARD_STANDARD);
    expect(xpForGoal({ sphere: "health", photoLinked: true })).toBe(XP_REWARD_STANDARD);
    expect(xpForGoal({ photoLinked: true })).toBe(XP_REWARD_STANDARD);
    const withPhoto = xpForGoal({ sphere: "creativity", photoLinked: true });
    expect(withPhoto).toBe(XP_REWARD_STANDARD + XP_CREATIVITY_PHOTO_BONUS);
    expect(withPhoto).toBeGreaterThanOrEqual(1);
    expect(withPhoto).toBeLessThanOrEqual(XP_REWARD_MAX);
  });
});

describe("xpGrantedForGoal", () => {
  it("clamps legacy rewards above the max and does not recompute in-range ones", () => {
    expect(xpGrantedForGoal({ xpReward: 10000 })).toBe(XP_REWARD_MAX);
    expect(xpGrantedForGoal({ xpReward: 30, sphere: "mind" })).toBe(30);
    expect(xpGrantedForGoal({ xpReward: 5 })).toBe(5);
    expect(xpGrantedForGoal({
      xpReward: 10000,
      sphere: "creativity",
      photoLinked: true,
    })).toBe(XP_REWARD_MAX);
    expect(xpGrantedForGoal({
      xpReward: XP_REWARD_STANDARD,
      sphere: "creativity",
      photoLinked: true,
    })).toBe(XP_REWARD_STANDARD + XP_CREATIVITY_PHOTO_BONUS);
    expect(xpGrantedForGoal({
      xpReward: XP_REWARD_STANDARD + XP_CREATIVITY_PHOTO_BONUS,
      sphere: "creativity",
      photoLinked: true,
    })).toBe(XP_REWARD_STANDARD + XP_CREATIVITY_PHOTO_BONUS);
  });
});
