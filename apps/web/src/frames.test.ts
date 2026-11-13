import { describe, expect, it } from "vitest";
import { FRAME_SLOTS, galleryView } from "./frames";

describe("gallery frames", () => {
  it("keeps every slot inside the painting", () => {
    for (const slot of FRAME_SLOTS) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.w).toBeGreaterThan(0);
      expect(slot.h).toBeGreaterThan(0);
      expect(slot.x + slot.w).toBeLessThanOrEqual(100);
      expect(slot.y + slot.h).toBeLessThanOrEqual(100);
    }
    expect(FRAME_SLOTS.length).toBeGreaterThanOrEqual(3);
  });

  it("shows every photo when the wall has room", () => {
    expect(galleryView(["a", "b", "c"])).toEqual({ shown: ["a", "b", "c"], hidden: 0 });
    expect(galleryView([])).toEqual({ shown: [], hidden: 0 });
  });

  it("keeps the newest photos and counts the overflow", () => {
    const photos = ["a", "b", "c", "d", "e", "f"];
    expect(galleryView(photos, 4)).toEqual({ shown: ["c", "d", "e", "f"], hidden: 2 });
    expect(galleryView(photos, FRAME_SLOTS.length).hidden).toBe(0);
    const many = Array.from({ length: FRAME_SLOTS.length + 3 }, (_, index) => index);
    const view = galleryView(many);
    expect(view.shown).toEqual(many.slice(-FRAME_SLOTS.length));
    expect(view.hidden).toBe(3);
  });

  it("hides every photo when there is no slot", () => {
    expect(galleryView(["a", "b"], 0)).toEqual({ shown: [], hidden: 2 });
  });
});
