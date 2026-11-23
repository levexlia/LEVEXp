import { describe, expect, it } from "vitest";
import { CHAT_OPENED_KEY, rememberChatOpened, shouldShowTapMarker, tapMarkerSrc } from "./tapMarker";

function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("tap marker", () => {
  it("shows until the chat is opened once, then stays hidden", () => {
    const store = memory();
    expect(shouldShowTapMarker(store)).toBe(true);
    rememberChatOpened(store);
    expect(store.data.get(CHAT_OPENED_KEY)).toBe("1");
    expect(shouldShowTapMarker(store)).toBe(false);
  });

  it("shows the marker when storage is missing or throws, and never crashes", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowTapMarker(null)).toBe(true);
    expect(shouldShowTapMarker(broken)).toBe(true);
    expect(() => rememberChatOpened(broken)).not.toThrow();
  });

  it("uses the static marker with reduced motion", () => {
    expect(tapMarkerSrc(false)).toBe("/art/scene15/robot_tap_marker.svg");
    expect(tapMarkerSrc(true)).toBe("/art/scene15/static/robot_tap_marker_static.svg");
  });
});
