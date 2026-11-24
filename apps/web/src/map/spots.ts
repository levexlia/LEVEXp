import { MAP_NODES, XP_PER_LEVEL, type MapNodeId, type MapNodeState } from "@levex/domain";
// Same file as public/map/map_spots.json (a test keeps them equal); Vite cannot import from public/.
import scene from "./scene11/map_spots.json";

/** Scene 14 map background (grid, no domes); domes are drawn per state on top. Layout is scene 11: no road, zigzag. */
export const MAP_SVG = "/art/scene14/map/map_bg_720x1280.svg";

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

/** Tap radius around a badge in scene units: 64 css px at a 390 px wide phone. */
export const BADGE_RADIUS = (scene.badge_diameter_css_px_at_390 / 2) * (sceneW / 390);

/** Drawn badge radius in scene units. The scene14 mock draws badges at about 28 css px. */
export const BADGE_ART_RADIUS = 28;

/** scene14 badge art for each state, viewBox 48. */
export const BADGE_FILE: Record<MapNodeState, string> = {
  done: "/art/scene14/badges/done.svg",
  current: "/art/scene14/badges/current.svg",
  available: "/art/scene14/badges/available.svg",
  locked: "/art/scene14/badges/locked.svg",
};

/** Where the avatar stands next to the current badge (feet point), in scene units. */
export function avatarFeet(spot: Spot): [number, number] {
  // scene14 mock: the operator stands on the inner side of the current dome, toward the middle.
  const [x, y] = spot.building;
  if (spot.side === "left") return [x + 132, y + 58];
  if (spot.side === "right") return [x - 132, y + 58];
  return [x + 178, y + 40];
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
