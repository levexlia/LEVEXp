import { describe, expect, it } from "vitest";
import {
  PLACES,
  PROPS,
  chipBox,
  gapToBox,
  screenBox,
  segmentLit,
} from "./layout.js";

function overlaps(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe("map layout", () => {
  it("pairs each place with its building, bottom to top", () => {
    expect(PLACES.map((place) => [place.id, place.building])).toEqual([
      ["home", "bld_home"],
      ["study", "bld_school"],
      ["park", "bld_park"],
      ["workshop", "bld_workshop"],
      ["center", "bld_levex"],
    ]);
    const heights = PLACES.map((place) => place.badge[1]);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
  });

  it("keeps each badge against its own building and each name on that badge", () => {
    for (const place of PLACES) {
      const own = screenBox(place.building, place.at, place.scale);
      const gap = gapToBox(place.badge, own);
      expect(gap, place.id).toBeLessThan(56);
      expect(Math.hypot(place.label[0] - place.badge[0], place.label[1] - place.badge[1]), place.id).toBeLessThan(80);
      for (const other of PLACES) {
        if (other.id === place.id) continue;
        const otherBox = screenBox(other.building, other.at, other.scale);
        expect(gap + 16, `${place.id} vs ${other.id}`).toBeLessThan(gapToBox(place.badge, otherBox));
        expect(overlaps(chipBox(place), otherBox), `${place.id} label on ${other.id}`).toBe(false);
      }
      expect(overlaps(chipBox(place), own), `${place.id} label on itself`).toBe(false);
    }
  });

  it("keeps street furniture off the badges and the names", () => {
    for (const prop of PROPS) {
      const box = screenBox(prop.part, prop.at, prop.scale);
      for (const place of PLACES) {
        expect(gapToBox(place.badge, box), prop.part).toBeGreaterThan(28);
        expect(overlaps(chipBox(place), box), prop.part).toBe(false);
      }
    }
  });

  it("paints the ribbon solid only through the current node", () => {
    expect(segmentLit("done")).toBe(true);
    expect(segmentLit("current")).toBe(true);
    expect(segmentLit("available")).toBe(false);
    expect(segmentLit("locked")).toBe(false);
  });
});
