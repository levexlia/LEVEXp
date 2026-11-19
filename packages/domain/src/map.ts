import type { LifeSphereId } from "./index.js";

export type MapNodeId = "home" | "study" | "park" | "workshop" | "center";
export type MapNodeState = "locked" | "available" | "current" | "done";

export interface MapNode {
  id: MapNodeId;
  name: string;
  /** Sphere whose completed goals mark this place done. */
  sphere: LifeSphereId;
  /** Player level required before the node leaves the locked state. */
  unlockLevel: number;
}

/**
 * The home-screen path. A node unlocks at `unlockLevel`.
 * It is done when that level is reached and the player has finished a goal in `sphere`.
 * The current node is the first unlocked place that is not done.
 * Other unlocked places that are not done are available.
 * Only a place the player has not reached the level for is locked.
 * A finished place stays done, including the last one.
 */
export const MAP_NODES: readonly MapNode[] = [
  { id: "home", name: "Дом", sphere: "health", unlockLevel: 1 },
  { id: "study", name: "Учебный центр", sphere: "mind", unlockLevel: 1 },
  { id: "park", name: "Парк", sphere: "spirit", unlockLevel: 2 },
  { id: "workshop", name: "Мастерская", sphere: "creativity", unlockLevel: 2 },
  { id: "center", name: "Центр LEVEX", sphere: "community", unlockLevel: 4 },
];

export function mapNodeStates(input: {
  level: number;
  doneSpheres: readonly string[];
}): Array<MapNode & { state: MapNodeState }> {
  const done = new Set(input.doneSpheres);
  const unlocked = MAP_NODES.map((node) => input.level >= node.unlockLevel);
  let currentIndex = MAP_NODES.findIndex((node, index) => unlocked[index] && !done.has(node.sphere));
  if (currentIndex === -1) {
    for (let index = MAP_NODES.length - 1; index >= 0; index -= 1) {
      if (unlocked[index]) {
        currentIndex = index;
        break;
      }
    }
  }
  return MAP_NODES.map((node, index) => {
    if (!unlocked[index]) return { ...node, state: "locked" };
    if (index === currentIndex && !done.has(node.sphere)) return { ...node, state: "current" };
    if (done.has(node.sphere)) return { ...node, state: "done" };
    return { ...node, state: "available" };
  });
}
