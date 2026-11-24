import {
  MAP_NODES,
  PLACELESS_SPHERES,
  SPHERE_TEMPLATES,
  builtInTemplate,
  getLifeSphere,
  type PlacelessSphere,
  type SphereTemplate,
  REFLECTION_LABEL,
  SEED_TEMPLATES,
  dailyLedger,
  noXpTodayReason,
  type DailyLedger,
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
  /** Place name, or the sphere name for placeless missions (Карьера, Финансы, Отношения). */
  placeName: string;
  /** Life sphere id of the goal (for the sphere icon of placeless missions). */
  sphere: string | null;
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
  /** Open, but completing it today would give no XP (daily cap, own cap, same template): «без XP сегодня». */
  noXpToday: boolean;
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

export function missionRow(goal: Goal, today = playerDay(new Date()), ledger?: DailyLedger): MissionRow {
  const place = placeForSphere(goal.sphere);
  return {
    id: goal.id,
    title: goal.title,
    place,
    placeName: place ? placeName(place) : getLifeSphere(goal.sphere ?? "")?.name ?? placeName(null),
    sphere: goal.sphere ?? null,
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
    // A copy for a later day is judged on its own day, not today.
    noXpToday: ledger && !(goal.availableFrom && !availableOn(goal, today)) ? noXpTodayReason(goal, ledger) !== null : false,
  };
}

export interface MissionBoard {
  /** Open missions for today. */
  open: MissionRow[];
  /** Open copies waiting for a later day («Повторить завтра»): the «Завтра» group. */
  later: MissionRow[];
  done: MissionRow[];
  /** Counts over all goals, ignoring the place filter. */
  total: { open: number; done: number };
}

/** Open missions first (in API order), then done ones, newest first. `place` filters by map place. */
export function missionBoard(goals: readonly Goal[], place: MapNodeId | null = null, now = new Date()): MissionBoard {
  const today = playerDay(now);
  // Same rules as the server (domain daily.ts), so «+10 XP» is not promised when it would be 0.
  const ledger = dailyLedger(goals, now);
  const rows = goals.map((goal) => missionRow(goal, today, ledger));
  const shown = place ? rows.filter((row) => row.place === place) : rows;
  const completedAt = new Map(goals.map((goal) => [goal.id, goal.completedAt ?? ""]));
  return {
    open: shown.filter((row) => !row.done && row.from === null),
    later: shown.filter((row) => !row.done && row.from !== null),
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
  const doneToday = goals.filter((goal) => goal.status === "done" && playerDayOf(goal.completedAt) === today).length;
  return { open: board.open.slice(0, limit), openTotal: board.open.length, doneToday, later: board.later };
}

/** A chip of the empty-day plan: «Можно снова: …». */
export interface PlanChip {
  key: string;
  title: string;
  place: MapNodeId | null;
  /** Copy this goal (a seed or a repeated mission done before)… */
  repeatOf?: string;
  /** …or, when there is none yet, start the seed / placeless template. */
  templateId?: string;
  /** Placeless template chips: the sphere (for the icon). */
  sphere?: PlacelessSphere;
}

/** First placeless template of `sphere` that is neither open for today nor already rewarded today. */
function nextSphereTemplate(sphere: PlacelessSphere, openKeys: ReadonlySet<string>, ledger: DailyLedger): SphereTemplate | undefined {
  return SPHERE_TEMPLATES.find((template) => template.sphere === sphere && !openKeys.has(template.id) && !ledger.templates.has(template.id));
}

/** A placeless template in the Миссии tab: already open today, already gave XP today, or free to add. */
export interface SphereTemplateRow {
  template: SphereTemplate;
  state: "add" | "open" | "awarded";
}

/** «Без места на карте» in the Миссии tab: the 3 placeless spheres with their 3 templates each. */
export function placelessBoard(goals: readonly Goal[], now = new Date()): Array<{ sphere: PlacelessSphere; name: string; rows: SphereTemplateRow[] }> {
  const today = playerDay(now);
  const ledger = dailyLedger(goals, now);
  const open = new Set(goals.filter((goal) => goal.status === "open" && availableOn(goal, today)).map(templateKeyOf).filter(Boolean) as string[]);
  return PLACELESS_SPHERES.map((sphere) => ({
    sphere,
    name: getLifeSphere(sphere)?.name ?? sphere,
    rows: SPHERE_TEMPLATES.filter((template) => template.sphere === sphere).map((template) => ({
      template,
      state: open.has(template.id) ? "open" : ledger.templates.has(template.id) ? "awarded" : "add",
    })),
  }));
}

/**
 * Plan for an empty day (spec №1): the two seeds, one placeless mission per sphere (Карьера, Финансы,
 * Отношения) and every template the player has repeated, minus
 * the ones already open and the ones whose place is still locked (R-XP-8). Newest source goal first.
 */
export function planChips(goals: readonly Goal[], level: number, now = new Date()): PlanChip[] {
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
  // One placeless mission per sphere (Карьера, Финансы, Отношения): open from level 1.
  const ledger = dailyLedger(goals, now);
  for (const sphere of PLACELESS_SPHERES) {
    const template = nextSphereTemplate(sphere, openKeys, ledger);
    if (template) chips.push({ key: template.id, title: template.title, place: null, templateId: template.id, sphere });
  }
  for (const [key, source] of latest) {
    if (builtInTemplate(key) || openKeys.has(key) || lockedPlaceFor(source.sphere, level)) continue;
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
