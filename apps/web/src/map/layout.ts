import { MAP_NODES, type MapNodeId, type MapNodeState } from "@levex/domain";
import manifest from "./kit/manifest.json";

export const MAP_VIEW = { x: 0, y: 78, w: 390, h: 712 };

/** Badge art is centred on this point inside its 919 viewBox, matching the kit mock. */
export const BADGE_CENTER: [number, number] = [458.7, 431.9];
export const BADGE_SCALE = 0.0913;

interface PartInfo {
  anchor: [number, number];
  kind: string;
  bbox: [number, number, number, number];
}

const parts = manifest.parts as unknown as Record<string, PartInfo>;

export function partAnchor(id: string): [number, number] {
  const part = parts[id];
  if (!part) throw new Error(`missing map part ${id}`);
  return part.anchor;
}

export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function screenBox(id: string, at: [number, number], scale: number): ScreenBox {
  const [ax, ay] = partAnchor(id);
  const [x0, y0, x1, y1] = parts[id]!.bbox;
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
  /** Where the building's ground contact sits. */
  at: [number, number];
  scale: number;
  /** Badge centre, beside that building. */
  badge: [number, number];
  /** Name baseline, kept on this building rather than a neighbour. */
  label: [number, number];
  /** Avatar offset from the badge, in viewBox units. */
  avatar: [number, number];
}

/**
 * Bottom to top: Дом, Учебный центр, Парк, Мастерская, Центр LEVEX.
 * Each badge and its label sit beside that place's own building.
 * The approved mock had put several names on the opposite side of the street.
 */
export const PLACES: readonly Place[] = [
  { id: "home", building: "bld_home", at: [304, 676], scale: 0.16, badge: [176, 630], label: [176, 678], avatar: [-86, 22] },
  { id: "study", building: "bld_school", at: [98, 548], scale: 0.15, badge: [196, 500], label: [78, 488], avatar: [72, 14] },
  { id: "park", building: "bld_park", at: [292, 448], scale: 0.125, badge: [150, 408], label: [300, 352], avatar: [78, 8] },
  { id: "workshop", building: "bld_workshop", at: [98, 346], scale: 0.145, badge: [190, 300], label: [86, 372], avatar: [74, 12] },
  { id: "center", building: "bld_levex", at: [292, 240], scale: 0.145, badge: [176, 188], label: [168, 140], avatar: [-74, 8] },
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
  /** Future spheres. Always drawn with the locked palette. */
  locked?: boolean;
}

/** Decoration taken from the approved mock, in ground-contact order later. */
export const PROPS: readonly Prop[] = [
  { part: "tree_round", at: [208, 160], scale: 0.25 },
  { part: "bld_gym", at: [46, 172], scale: 0.1, locked: true },
  { part: "bld_office", at: [352, 186], scale: 0.11, locked: true },
  { part: "tree_pine", at: [240, 215], scale: 0.26 },
  { part: "filler_2", at: [34, 250], scale: 0.25 },
  { part: "filler_5", at: [350, 300], scale: 0.25 },
  { part: "bush", at: [200, 300], scale: 0.24 },
  { part: "filler_1", at: [350, 360], scale: 0.27 },
  { part: "bench", at: [340, 400], scale: 0.24 },
  { part: "filler_7", at: [346, 420], scale: 0.22 },
  { part: "tree_round", at: [232, 420], scale: 0.26 },
  { part: "filler_8", at: [36, 455], scale: 0.25 },
  { part: "bush", at: [56, 500], scale: 0.22 },
  { part: "lamp", at: [346, 500], scale: 0.28 },
  { part: "lamp", at: [40, 520], scale: 0.28 },
  { part: "filler_9", at: [356, 560], scale: 0.27 },
  { part: "lamp", at: [232, 590], scale: 0.3 },
  { part: "filler_3", at: [34, 600], scale: 0.27 },
  { part: "tree_pine", at: [370, 640], scale: 0.26 },
  { part: "mailbox", at: [162, 646], scale: 0.24 },
  { part: "filler_6", at: [40, 690], scale: 0.25 },
  { part: "filler_4", at: [360, 700], scale: 0.22 },
  { part: "tree_round", at: [170, 740], scale: 0.26 },
  { part: "filler_4", at: [200, 745], scale: 0.2 },
  { part: "road_ne", at: [80, 748], scale: 0.3 },
  { part: "road_nw", at: [170, 760], scale: 0.3 },
  { part: "road_cross", at: [270, 760], scale: 0.3 },
  { part: "road_ne", at: [366, 770], scale: 0.3 },
];

/** The ribbon up to the current node is solid cyan. Everything after it is dotted. */
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
