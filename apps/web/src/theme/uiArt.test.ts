import { MAP_NODES } from "@levex/domain";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isAnimatedSvg } from "./motion.js";
import { HEX_LEVEL_URL, MISSION_OPEN_URL, hexFrameUrl, tabIconUrl, uiIconUrl, type TabIcon } from "./uiArt.js";

const pub = fileURLToPath(new URL("../../public", import.meta.url));
const file = (url: string) => `${pub}${url}`;

describe("scene14 UI art", () => {
  it("picks grey and cyan tab icons", () => {
    expect(tabIconUrl("map", false)).toBe("/art/scene14/ui/ic_tab_map.svg");
    expect(tabIconUrl("map", true)).toBe("/art/scene14/ui/ic_tab_map_active.svg");
  });

  it("frames each place in its own hex, and every locked place in the grey one", () => {
    expect(hexFrameUrl("park", false)).toBe("/art/scene14/ui/hex_frame_96_park.svg");
    expect(hexFrameUrl("park", true)).toBe("/art/scene14/ui/hex_frame_96_locked.svg");
  });

  it("points only at files that exist and are static", () => {
    const tabs: TabIcon[] = ["map", "missions", "resources", "profile"];
    const urls = [
      ...tabs.flatMap((tab) => [tabIconUrl(tab, false), tabIconUrl(tab, true)]),
      ...MAP_NODES.flatMap((node) => [hexFrameUrl(node.id, false), hexFrameUrl(node.id, true)]),
      uiIconUrl("streak"),
      uiIconUrl("energy"),
      uiIconUrl("camera"),
      HEX_LEVEL_URL,
      MISSION_OPEN_URL,
    ];
    for (const url of urls) {
      expect(existsSync(file(url)), url).toBe(true);
      expect(isAnimatedSvg(readFileSync(file(url), "utf8")), url).toBe(false);
    }
  });
});
