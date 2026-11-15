import { describe, expect, it } from "vitest";
import {
  PLACES,
  PROPS,
  gapToBox,
  labelPoint,
  screenBox,
  segmentLit,
} from "./layout.js";

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
    expect(PLACES.map((place) => place.at[1])).toEqual([...PLACES.map((place) => place.at[1])].sort((a, b) => b - a));
  });

  it("keeps every label nearer its own building than the other places", () => {
    for (const place of PLACES) {
      const label = labelPoint(place);
      const own = gapToBox(label, screenBox(place.building, place.at, place.scale));
      expect(own).toBeLessThan(120);
      for (const other of PLACES) {
        if (other.id === place.id) continue;
        const gap = gapToBox(label, screenBox(other.building, other.at, other.scale));
        expect(own, place.id).toBeLessThan(gap);
      }
    }
  });

  it("paints the ribbon solid only through the current node", () => {
    expect(segmentLit("done")).toBe(true);
    expect(segmentLit("current")).toBe(true);
    expect(segmentLit("locked")).toBe(false);
  });

  it("keeps the gym and the office as locked decoration", () => {
    expect(PROPS.filter((prop) => prop.locked).map((prop) => prop.part)).toEqual(["bld_gym", "bld_office"]);
  });
});
