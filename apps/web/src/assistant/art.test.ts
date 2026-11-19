import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAT_ART, ROBOT_STATES, avatarFrameSrc, robotSrc, typingSrc } from "./art";

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));
const read = (url: string) => readFileSync(`${PUBLIC}${url}`, "utf8");

describe("scene 15 robot files", () => {
  it("has an animated and a static file for every state the app uses", () => {
    for (const state of ROBOT_STATES) {
      expect(read(robotSrc(state, false))).toMatch(/@keyframes/);
      const still = read(robotSrc(state, true));
      expect(still).not.toMatch(/@keyframes|animation\s*:|animation-name/);
    }
    expect(read(typingSrc(false))).toMatch(/@keyframes/);
    expect(read(typingSrc(true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
    for (const url of Object.values(CHAT_ART)) expect(existsSync(`${PUBLIC}${url}`)).toBe(true);
  });

  it("ships happy only as a file, not as a state", () => {
    expect(existsSync(`${PUBLIC}/art/scene15/robot_happy.svg`)).toBe(true);
    expect(existsSync(`${PUBLIC}/art/scene15/static/robot_happy_static.svg`)).toBe(true);
    expect(ROBOT_STATES as readonly string[]).not.toContain("happy");
  });

  it("does not ship the tap marker", () => {
    expect(existsSync(`${PUBLIC}/art/scene15/robot_tap_marker.svg`)).toBe(false);
  });
});

describe("chat avatar frame", () => {
  it("is animated by default and static with reduced motion", () => {
    expect(avatarFrameSrc(false)).toBe("/art/scene15/chat/chat_avatar_frame.svg");
    expect(avatarFrameSrc(true)).toBe("/art/scene15/static/chat_avatar_frame_static.svg");
    expect(read(avatarFrameSrc(false))).toMatch(/@keyframes/);
    expect(read(avatarFrameSrc(true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
  });
});
