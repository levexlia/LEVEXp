import { MAP_NODES, type MapNodeId, type MapNodeState } from "@levex/domain";
import type { Goal } from "../api";

/**
 * What the Missions tab and the «Сегодня» panel show. Pure: it only reads goals the API sent.
 * XP numbers are the stored `goal.xpReward`; nothing here decides how much XP a mission gives.
 */
export interface MissionRow {
  id: string;
  title: string;
  /** Map place of the goal's sphere, or null for spheres that have no place on the map. */
  place: MapNodeId | null;
  placeName: string;
  xp: number;
  done: boolean;
  /** DD.MM of the completion, done missions only. */
  doneOn: string | null;
  /** Workshop (creativity) missions are finished with a photo: their action is Proof. */
  proof: boolean;
}

export const MISSION_STATUS = { open: "Доступна", done: "Выполнена" } as const;

export function placeForSphere(sphere: string | undefined): MapNodeId | null {
  return MAP_NODES.find((node) => node.sphere === sphere)?.id ?? null;
}

export function placeName(id: MapNodeId | null): string {
  return MAP_NODES.find((node) => node.id === id)?.name ?? "Без места";
}

function ddmm(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function missionRow(goal: Goal): MissionRow {
  const place = placeForSphere(goal.sphere);
  return {
    id: goal.id,
    title: goal.title,
    place,
    placeName: placeName(place),
    xp: goal.xpReward,
    done: goal.status === "done",
    doneOn: goal.status === "done" ? ddmm(goal.completedAt) : null,
    proof: goal.sphere === "creativity",
  };
}

export interface MissionBoard {
  open: MissionRow[];
  done: MissionRow[];
  /** Counts over all goals, ignoring the place filter. */
  total: { open: number; done: number };
}

/** Open missions first (in API order), then done ones, newest first. `place` filters by map place. */
export function missionBoard(goals: readonly Goal[], place: MapNodeId | null = null): MissionBoard {
  const rows = goals.map(missionRow);
  const shown = place ? rows.filter((row) => row.place === place) : rows;
  const completedAt = new Map(goals.map((goal) => [goal.id, goal.completedAt ?? ""]));
  return {
    open: shown.filter((row) => !row.done),
    done: shown
      .filter((row) => row.done)
      .sort((a, b) => (completedAt.get(b.id) ?? "").localeCompare(completedAt.get(a.id) ?? "")),
    total: { open: rows.filter((row) => !row.done).length, done: rows.filter((row) => row.done).length },
  };
}

/** «Сегодня»: the first open missions, and how many were finished today (local day). */
export function todayBoard(goals: readonly Goal[], now: Date, limit = 3): { open: MissionRow[]; openTotal: number; doneToday: number } {
  const board = missionBoard(goals);
  const today = now.toDateString();
  const doneToday = goals.filter((goal) => goal.status === "done" && goal.completedAt && new Date(goal.completedAt).toDateString() === today).length;
  return { open: board.open.slice(0, limit), openTotal: board.open.length, doneToday };
}

/**
 * The calm hint under a locked place: where XP can come from right now. Prefers an unlocked
 * place that still has an open mission, then the first unlocked place (Дом).
 */
export function xpHint(states: ReadonlyMap<MapNodeId, MapNodeState>, goals: readonly Goal[]): { text: string; place: MapNodeId } {
  const unlocked = MAP_NODES.filter((node) => (states.get(node.id) ?? "locked") !== "locked");
  const withOpen = unlocked.find((node) => goals.some((goal) => goal.status === "open" && goal.sphere === node.sphere));
  const node = withOpen ?? unlocked[0] ?? MAP_NODES[0]!;
  return { text: `Опыт дают миссии. Например, выполни миссию в месте «${node.name}».`, place: node.id };
}
