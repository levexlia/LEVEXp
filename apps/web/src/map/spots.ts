import { MAP_NODES, XP_PER_LEVEL, type MapNodeId, type MapNodeState } from "@levex/domain";
// Same file as public/map/map_spots.json (a test keeps them equal); Vite cannot import from public/.
import scene from "./scene11/map_spots.json";

/** Scene 11 map: no road, five domes on hex islands in a zigzag. */
export const MAP_SVG = "/map/scene11_map.svg";

const [, , sceneW, sceneH] = scene.viewBox as [number, number, number, number];

/** Part of the scene shown on screen (trims empty sky above LEVEX and below Дом). */
export const MAP_VIEW = { x: 0, y: 24, w: sceneW, h: Math.min(sceneH, 1232) - 24 };
export const SCENE_SIZE = { w: sceneW, h: sceneH };

/** Ids in map_spots.json that differ from the domain place ids. */
const SCENE_ID: Record<string, MapNodeId> = {
  home: "home",
  school: "study",
  park: "park",
  workshop: "workshop",
  levex: "center",
};

export type Side = "left" | "right" | "center";

export interface Spot {
  id: MapNodeId;
  label: string;
  /** Badge seat on the island ("plaza" in map_spots.json). */
  badge: [number, number];
  /** Foot of the dome ("building" in map_spots.json). */
  building: [number, number];
  side: Side;
  /** Centre Центр LEVEX is drawn larger than the four regular places. */
  hero: boolean;
}

function toSpots(): Spot[] {
  const { left_x: leftX, right_x: rightX } = scene.layout;
  return scene.landmarks.map((landmark) => {
    const id = SCENE_ID[landmark.id];
    if (!id) throw new Error(`map_spots.json: unknown place ${landmark.id}`);
    const building = landmark.building as [number, number];
    const side: Side = building[0] === leftX ? "left" : building[0] === rightX ? "right" : "center";
    return {
      id,
      label: landmark.label,
      badge: landmark.plaza as [number, number],
      building,
      side,
      hero: side === "center",
    };
  });
}

/** Bottom to top, in path order. */
export const SPOTS: readonly Spot[] = toSpots();

export function spotFor(id: MapNodeId): Spot {
  const spot = SPOTS.find((item) => item.id === id);
  if (!spot) throw new Error(`no map spot for ${id}`);
  return spot;
}

/** Badge radius in scene units: 64 css px at a 390 px wide phone. */
export const BADGE_RADIUS = (scene.badge_diameter_css_px_at_390 / 2) * (sceneW / 390);

/** Kit badge art for each state. All four share the 919 viewBox of the map kit. */
export const BADGE_FILE: Record<MapNodeState, string> = {
  done: "/map/badge_done_full.svg",
  current: "/map/badge_current_full.svg",
  available: "/map/badge_available_full.svg",
  locked: "/map/badge_locked_full.svg",
};

/** Glow over a dome: cyan when done, violet when current, none otherwise. */
export function domeGlow(state: MapNodeState): { color: string; opacity: number } | null {
  if (state === "done") return { color: "#22d3ee", opacity: 0.22 };
  if (state === "current") return { color: "#a78bfa", opacity: 0.38 };
  return null;
}

/** Ellipse that covers the glass dome above a spot's foot, in scene units. */
export function domeEllipse(spot: Spot): { cx: number; cy: number; rx: number; ry: number } {
  const equator = spot.hero ? scene.layout.hero_dome_equator : scene.layout.regular_dome_equator;
  const rx = equator / 2 + 6;
  const ry = equator * 0.47;
  return { cx: spot.building[0], cy: spot.building[1] - ry * 0.9, rx, ry };
}

/** Where the avatar stands next to the current badge (feet point), in scene units. */
export function avatarFeet(spot: Spot): [number, number] {
  const [x, y] = spot.badge;
  if (spot.side === "left") return [x + BADGE_RADIUS + 52, y + 62];
  if (spot.side === "right") return [x - BADGE_RADIUS - 52, y + 62];
  return [x + BADGE_RADIUS + 60, y + 40];
}

/** A scene point as CSS percentages of the visible map. */
export function toViewPercent([x, y]: [number, number]): { left: string; top: string } {
  return {
    left: `${(((x - MAP_VIEW.x) / MAP_VIEW.w) * 100).toFixed(3)}%`,
    top: `${(((y - MAP_VIEW.y) / MAP_VIEW.h) * 100).toFixed(3)}%`,
  };
}

/**
 * Short hint for a locked place. Uses only what the game already has:
 * the place's `unlockLevel` and the level formula (XP_PER_LEVEL per level).
 */
export function lockedHint(id: MapNodeId, progress: { level: number; xp: number }): string {
  const node = MAP_NODES.find((item) => item.id === id);
  if (!node) return "Это место пока закрыто.";
  if (progress.level >= node.unlockLevel) return "Это место уже открыто.";
  const need = Math.max(0, (node.unlockLevel - 1) * XP_PER_LEVEL - progress.xp);
  return `${node.name} откроется на уровне ${node.unlockLevel}. Сейчас уровень ${progress.level} — ещё ${need} XP.`;
}
