import { MAP_NODES, type MapNodeId, type MapNodeState } from "@levex/domain";
import { ART } from "./art";

export const MAP_VIEW = { x: 0, y: 8, w: 390, h: 760 };

/** Visual centre of a kit badge inside its 919 viewBox. */
export const BADGE_CENTER: [number, number] = [458.7, 431.9];
export const BADGE_SCALE = 0.0913;

export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function screenBox(id: string, at: [number, number], scale: number): ScreenBox {
  const art = ART[id];
  if (!art) throw new Error(`missing map art ${id}`);
  const [ax, ay] = art.anchor;
  const [x0, y0, x1, y1] = art.bbox;
  return {
    x0: (x0 - ax) * scale + at[0],
    y0: (y0 - ay) * scale + at[1],
    x1: (x1 - ax) * scale + at[0],
    y1: (y1 - ay) * scale + at[1],
  };
}

export interface Place {
  id: MapNodeId;
  building: string;
  at: [number, number];
  scale: number;
  /** Badge centre, on the path side of this building. */
  badge: [number, number];
  /** Chip centre. The chip names this building and no other. */
  label: [number, number];
  chip: { w: number; h: number };
  lines: readonly string[];
  /** Avatar offset from the badge, away from the building. */
  avatar: [number, number];
}

/**
 * Bottom to top. Each row is one building with its badge and name beside it.
 * The ribbon joins the badges in this order.
 */
export const PLACES: readonly Place[] = [
  { id: "home", building: "bld_home", at: [268, 660], scale: 0.14, badge: [176, 616], label: [176, 668], chip: { w: 56, h: 22 }, lines: ["Дом"], avatar: [-78, 6] },
  { id: "study", building: "bld_school", at: [100, 560], scale: 0.125, badge: [176, 512], label: [176, 568], chip: { w: 84, h: 34 }, lines: ["Учебный", "центр"], avatar: [78, 4] },
  { id: "park", building: "bld_park", at: [286, 415], scale: 0.1, badge: [196, 380], label: [196, 428], chip: { w: 54, h: 22 }, lines: ["Парк"], avatar: [-78, 4] },
  { id: "workshop", building: "bld_workshop", at: [100, 268], scale: 0.115, badge: [190, 228], label: [206, 300], chip: { w: 96, h: 22 }, lines: ["Мастерская"], avatar: [78, 4] },
  { id: "center", building: "bld_levex", at: [278, 128], scale: 0.115, badge: [188, 84], label: [188, 40], chip: { w: 80, h: 34 }, lines: ["Центр", "LEVEX"], avatar: [-78, 2] },
];

export function placeName(id: MapNodeId): string {
  return MAP_NODES.find((node) => node.id === id)?.name ?? id;
}

export function labelPoint(place: Place): [number, number] {
  return place.label;
}

export interface Prop {
  part: string;
  at: [number, number];
  scale: number;
  locked?: boolean;
}

/** A few pieces of street furniture, kept off the badges and the names. */
export const PROPS: readonly Prop[] = [
  { part: "bld_gym", at: [48, 155], scale: 0.07, locked: true },
  { part: "bld_office", at: [352, 100], scale: 0.062, locked: true },
  { part: "tree_pine", at: [42, 430], scale: 0.16 },
  { part: "tree_round", at: [348, 500], scale: 0.16 },
  { part: "bench", at: [352, 455], scale: 0.16 },
  { part: "lamp", at: [40, 640], scale: 0.18 },
  { part: "mailbox", at: [332, 690], scale: 0.18 },
];

/** Cyan and solid through the node the player is on. Later nodes stay dotted. */
export function segmentLit(destination: MapNodeState): boolean {
  return destination === "done" || destination === "current";
}

export function ribbonPath(from: [number, number], to: [number, number]): string {
  const midY = (from[1] + to[1]) / 2;
  return `M${from[0]} ${from[1]} C${from[0]} ${midY}, ${to[0]} ${midY}, ${to[0]} ${to[1]}`;
}

export function avatarInView(id: MapNodeId): { left: string; top: string } {
  const place = PLACES.find((item) => item.id === id) ?? PLACES[0]!;
  const x = place.badge[0] + place.avatar[0];
  const y = place.badge[1] + place.avatar[1];
  return {
    left: `${((x - MAP_VIEW.x) / MAP_VIEW.w) * 100}%`,
    top: `${((y - MAP_VIEW.y) / MAP_VIEW.h) * 100}%`,
  };
}

export function gapToBox(point: [number, number], box: ScreenBox): number {
  const dx = point[0] < box.x0 ? box.x0 - point[0] : point[0] > box.x1 ? point[0] - box.x1 : 0;
  const dy = point[1] < box.y0 ? box.y0 - point[1] : point[1] > box.y1 ? point[1] - box.y1 : 0;
  return Math.hypot(dx, dy);
}

export function chipBox(place: Place): ScreenBox {
  return {
    x0: place.label[0] - place.chip.w / 2,
    y0: place.label[1] - place.chip.h / 2,
    x1: place.label[0] + place.chip.w / 2,
    y1: place.label[1] + place.chip.h / 2,
  };
}
