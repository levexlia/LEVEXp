import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAT_ART, ROBOT_STATES, avatarFrameSrc, happyFrameSrc, happyRobotSrc, joyFxSrc, robotSrc, typingSrc } from "./art";
import { JOY_CHAT_MS, JOY_MAP_MS, chatHappy, mapRobotLook } from "./joy";
import { tapMarkerSrc } from "./tapMarker";

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

  it("scene16 (test 11): happy is a moment after a record, never a chat state; it ends by itself", () => {
    // Files: animated and static for both joys, the gold frame and the effects.
    for (const kind of ["soft", "bright"] as const) {
      expect(read(happyRobotSrc(kind, false))).toMatch(/@keyframes/);
      expect(read(happyRobotSrc(kind, true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
    }
    expect(read(happyFrameSrc(false))).toMatch(/@keyframes/);
    expect(read(happyFrameSrc(true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
    for (const fx of ["fx_spark", "fx_dome_hit", "milestone_token"] as const) {
      expect(read(joyFxSrc(fx, false))).toMatch(/@keyframes/);
      expect(read(joyFxSrc(fx, true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
    }
    // Not a state the chat mirrors: still only idle / listening / thinking / speaking.
    expect(ROBOT_STATES as readonly string[]).not.toContain("happy");
    expect(ROBOT_STATES as readonly string[]).not.toContain("happysoft");
    // Map: without a record no joy; after one (joyUntil = record time + 2.5 s) happysoft, then idle again.
    const t = 1_000_000;
    expect(mapRobotLook({ hint: false, chat: false, joyUntil: null, now: t })).toBe("idle");
    expect(mapRobotLook({ hint: false, chat: false, joyUntil: t + JOY_MAP_MS, now: t + 10 })).toBe("happysoft");
    expect(mapRobotLook({ hint: false, chat: false, joyUntil: t + JOY_MAP_MS, now: t + JOY_MAP_MS })).toBe("idle");
    expect(mapRobotLook({ hint: true, chat: false, joyUntil: t + JOY_MAP_MS, now: t + JOY_MAP_MS + 1 })).toBe("hint");
    expect(mapRobotLook({ hint: false, chat: true, joyUntil: t + JOY_MAP_MS, now: t + 10 })).toBe("chat");
    // Chat header: one cycle of 2.4 s after a praise, then the usual state.
    expect(chatHappy(null, t)).toBe(false);
    expect(chatHappy(t + JOY_CHAT_MS, t + 100)).toBe(true);
    expect(chatHappy(t + JOY_CHAT_MS, t + JOY_CHAT_MS)).toBe(false);
    // scene15 robot_happy.svg stays a file only.
    expect(existsSync(`${PUBLIC}/art/scene15/robot_happy.svg`)).toBe(true);
    expect(existsSync(`${PUBLIC}/art/scene15/static/robot_happy_static.svg`)).toBe(true);
  });

  it("ships the tap marker, animated and static", () => {
    expect(read(tapMarkerSrc(false))).toMatch(/@keyframes/);
    expect(read(tapMarkerSrc(true))).not.toMatch(/@keyframes|animation\s*:|animation-name/);
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
