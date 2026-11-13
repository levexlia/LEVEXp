/**
 * Gallery slots on the painted right wall.
 * `x` and `y` are the top-left corner, as a percentage of the room picture.
 * `w` and `h` are the frame size in the same units. `rotate` is degrees.
 */
export interface FrameSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}

export const FRAME_SLOTS: readonly FrameSlot[] = [
  { x: 60.4, y: 12.6, w: 4.0, h: 7.4, rotate: -1.5 },
  { x: 64.6, y: 15.6, w: 3.6, h: 6.8, rotate: 1 },
  { x: 68.6, y: 14.2, w: 3.6, h: 6.4, rotate: -0.5 },
  { x: 76.4, y: 16.2, w: 7.2, h: 11.0, rotate: 0.5 },
  { x: 84.2, y: 20.2, w: 4.2, h: 8.0, rotate: -1 },
  { x: 88.4, y: 20.4, w: 4.4, h: 10.2, rotate: 1.5 },
  { x: 72.4, y: 28.2, w: 5.2, h: 8.6, rotate: 0.5 },
  { x: 80.4, y: 31.8, w: 5.4, h: 8.6, rotate: -0.5 },
];

/** Newest photos that fit on the wall, and how many older ones stay off it. */
export function galleryView<T>(items: readonly T[], slotCount = FRAME_SLOTS.length): { shown: T[]; hidden: number } {
  const count = Math.max(0, Math.floor(slotCount));
  if (count === 0) return { shown: [], hidden: items.length };
  const shown = items.slice(-count);
  return { shown, hidden: items.length - shown.length };
}
