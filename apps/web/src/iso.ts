/** 2:1 isometric projection. +x runs down-right, +y down-left, +z up. */

export const TILE_W = 72;
export const TILE_H = 36;
export const ORIGIN_X = 470;
export const ORIGIN_Y = 168;
export const WALL_H = 168;

export interface Pt {
  x: number;
  y: number;
}

export function iso(x: number, y: number, z = 0): Pt {
  return {
    x: ORIGIN_X + (x - y) * (TILE_W / 2),
    y: ORIGIN_Y + (x + y) * (TILE_H / 2) - z,
  };
}

export function pts(points: Pt[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export interface Faces {
  top: Pt[];
  south: Pt[];
  east: Pt[];
}

/** Top, the +y face (screen-left), and the +x face (screen-right). */
export function boxFaces(x: number, y: number, w: number, d: number, h: number, z = 0): Faces {
  return {
    top: [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)],
    south: [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)],
    east: [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)],
  };
}

/** Left-wall quad (plane of constant x), y0→y1, z0→z1. */
export function leftWall(y0: number, y1: number, z0: number, z1: number, x = 0): Pt[] {
  return [iso(x, y0, z0), iso(x, y1, z0), iso(x, y1, z1), iso(x, y0, z1)];
}

/** Right-wall quad (plane of constant y). */
export function rightWall(x0: number, x1: number, z0: number, z1: number, y = 0): Pt[] {
  return [iso(x0, y, z0), iso(x1, y, z0), iso(x1, y, z1), iso(x0, y, z1)];
}

/**
 * Map a bitmap onto a right-wall rectangle.
 * Image space (0,0) is the top-left of the photo.
 */
export function rightWallImageMatrix(
  x: number,
  w: number,
  zBottom: number,
  zHeight: number,
  imgW: number,
  imgH: number,
  y = 0.06,
): string {
  const topLeft = iso(x, y, zBottom + zHeight);
  const topRight = iso(x + w, y, zBottom + zHeight);
  const bottomLeft = iso(x, y, zBottom);
  const a = (topRight.x - topLeft.x) / imgW;
  const b = (topRight.y - topLeft.y) / imgW;
  const c = (bottomLeft.x - topLeft.x) / imgH;
  const d = (bottomLeft.y - topLeft.y) / imgH;
  return `matrix(${a} ${b} ${c} ${d} ${topLeft.x} ${topLeft.y})`;
}
