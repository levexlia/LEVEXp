import {
  MAP_NODES,
  REFLECTION_LABEL,
  SEED_TEMPLATES,
  lockedPlaceFor,
  playerDay,
  playerDayOf,
  playerDdMm,
  templateKeyOf,
  type MapNodeId,
  type MapNodeState,
} from "@levex/domain";
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
  /** Done, but recorded without XP by the daily rules. */
  noXp: boolean;
  /** Open copy for a later day («Повторить завтра»): `DD.MM` it shows in «Сегодня», else null. */
  from: string | null;
  /** «Легко · note» after a saved micro-reflection. */
  reflection: string | null;
}

export const MISSION_STATUS = { open: "Доступна", done: "Выполнена" } as const;

export function placeForSphere(sphere: string | undefined): MapNodeId | null {
  return MAP_NODES.find((node) => node.sphere === sphere)?.id ?? null;
}

export function placeName(id: MapNodeId | null): string {
  return MAP_NODES.find((node) => node.id === id)?.name ?? "Без места";
}

/** DD.MM in the player's zone (Asia/Jerusalem, R-XP-5). */
const ddmm = playerDdMm;

/** Whether an open goal belongs to «Сегодня» on `today` (a «Повторить завтра» copy waits for its day). */
export function availableOn(goal: Goal, today: string): boolean {
  return !goal.availableFrom || goal.availableFrom <= today;
}

export function missionRow(goal: Goal, today = playerDay(new Date())): MissionRow {
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
    noXp: goal.status === "done" && goal.xpGranted === 0,
    from: goal.status === "open" && goal.availableFrom && !availableOn(goal, today)
      ? `${goal.availableFrom.slice(8, 10)}.${goal.availableFrom.slice(5, 7)}`
      : null,
    reflection: goal.reflection
      ? `${REFLECTION_LABEL[goal.reflection.felt]}${goal.reflection.note ? ` · ${goal.reflection.note}` : ""}`
      : null,
  };
}

export interface MissionBoard {
  open: MissionRow[];
  done: MissionRow[];
  /** Counts over all goals, ignoring the place filter. */
  total: { open: number; done: number };
}

/** Open missions first (in API order), then done ones, newest first. `place` filters by map place. */
export function missionBoard(goals: readonly Goal[], place: MapNodeId | null = null, now = new Date()): MissionBoard {
  const today = playerDay(now);
  const rows = goals.map((goal) => missionRow(goal, today));
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

/**
 * «Сегодня»: the first open missions for today, how many were finished today and the copies waiting
 * for tomorrow. The day is the player's day in Asia/Jerusalem (R-XP-5), the same as the server's.
 */
export function todayBoard(
  goals: readonly Goal[],
  now: Date,
  limit = 3,
): { open: MissionRow[]; openTotal: number; doneToday: number; later: MissionRow[] } {
  const today = playerDay(now);
  const board = missionBoard(goals, null, now);
  const open = board.open.filter((row) => row.from === null);
  const doneToday = goals.filter((goal) => goal.status === "done" && playerDayOf(goal.completedAt) === today).length;
  return { open: open.slice(0, limit), openTotal: open.length, doneToday, later: board.open.filter((row) => row.from !== null) };
}

/** A chip of the empty-day plan: «Можно снова: …». */
export interface PlanChip {
  key: string;
  title: string;
  place: MapNodeId | null;
  /** Copy this goal (a seed or a repeated mission done before)… */
  repeatOf?: string;
  /** …or, when there is none yet, start the seed template. */
  templateId?: string;
}

/**
 * Plan for an empty day (spec №1): the two seeds plus every template the player has repeated, minus
 * the ones already open and the ones whose place is still locked (R-XP-8). Newest source goal first.
 */
export function planChips(goals: readonly Goal[], level: number): PlanChip[] {
  const openKeys = new Set(goals.filter((goal) => goal.status === "open").map(templateKeyOf).filter(Boolean) as string[]);
  const latest = new Map<string, Goal>();
  for (const goal of goals) {
    const key = templateKeyOf(goal);
    if (!key) continue;
    const seen = latest.get(key);
    if (!seen || (goal.completedAt ?? "") > (seen.completedAt ?? "")) latest.set(key, goal);
  }
  const chips: PlanChip[] = [];
  for (const seed of SEED_TEMPLATES) {
    if (openKeys.has(seed.id) || lockedPlaceFor(seed.sphere, level)) continue;
    const source = latest.get(seed.id);
    chips.push({
      key: seed.id,
      title: seed.title,
      place: placeForSphere(seed.sphere),
      ...(source ? { repeatOf: source.id } : { templateId: seed.id }),
    });
  }
  for (const [key, source] of latest) {
    if (SEED_TEMPLATES.some((seed) => seed.id === key) || openKeys.has(key) || lockedPlaceFor(source.sphere, level)) continue;
    chips.push({ key, title: source.title, place: placeForSphere(source.sphere), repeatOf: source.id });
  }
  return chips;
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
