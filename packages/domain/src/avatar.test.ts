import { describe, expect, it } from "vitest";
import {
  AVATAR_CANDIDATE_COUNT,
  AVATAR_CANDIDATE_MAX,
  AVATAR_CANDIDATE_MIN,
  AVATAR_STYLE_PROMPT,
  clampAvatarCount,
} from "./index.js";

describe("avatar prompt", () => {
  it("keeps likeness and restyles into the room palette on a plain background", () => {
    expect(AVATAR_STYLE_PROMPT).toMatch(/hair color/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/hair length/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/skin tone/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/glasses/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/full-body/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/transparent/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/amber/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/peach/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/sage/i);
    expect(AVATAR_STYLE_PROMPT).toMatch(/no room/i);
  });

  it("clamps a candidate count into 2–4", () => {
    expect(clampAvatarCount(1)).toBe(AVATAR_CANDIDATE_MIN);
    expect(clampAvatarCount(2)).toBe(2);
    expect(clampAvatarCount(3)).toBe(3);
    expect(clampAvatarCount(4)).toBe(4);
    expect(clampAvatarCount(9)).toBe(AVATAR_CANDIDATE_MAX);
    expect(clampAvatarCount(2.5)).toBe(AVATAR_CANDIDATE_COUNT);
    expect(clampAvatarCount(Number.NaN)).toBe(AVATAR_CANDIDATE_COUNT);
  });
});
