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

/** A chip of the empty-day plan: «Можно снова:» (done before) or «Можно взять:» (new). */
export interface PlanChip {
  key: string;
  title: string;
  place: MapNodeId | null;
  /** «repeat»: the player has done this template before; «new»: never done yet. */
  kind: "repeat" | "new";
  /** A repeat whose template already gave XP today: shown after the new ones, marked «без XP сегодня». */
  noXpToday?: boolean;
  /** Copy this goal (a seed or a repeated own mission done before)… */
  repeatOf?: string;
  /** …or start the seed / placeless template. */
  templateId?: string;
  /** Life sphere of the chip (icon; «new» chips are ordered by its XP). */
  sphere?: string;
}

/** At most this many plan buttons in total (Игрок, 24.11): repeats first, then new ones. */
export const PLAN_MAX = 3;

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
 * Plan for an empty day: at most {@link PLAN_MAX} buttons.
 * 1. «Можно снова:» templates the player has finished before (seeds, placeless, repeated own) that
 *    can still give XP today, newest first.
 * 2. «Можно взять:» templates never done yet (seeds and placeless), one per sphere, from the spheres
 *    with the least XP (`xpBySphere`); ties keep the domain order.
 * 3. Repeats whose template already gave XP today, marked «без XP сегодня».
 * Skips templates already open and places that are still locked (R-XP-8).
 */
export function planChips(
  goals: readonly Goal[],
  level: number,
  now = new Date(),
  xpBySphere: Partial<Record<string, number>> = {},
  max = PLAN_MAX,
): PlanChip[] {
  const openKeys = new Set(goals.filter((goal) => goal.status === "open").map(templateKeyOf).filter(Boolean) as string[]);
  const ledger = dailyLedger(goals, now);
  // Newest done goal per template: the «done before» source.
  const lastDone = new Map<string, Goal>();
  for (const goal of goals) {
    const key = templateKeyOf(goal);
    if (!key || goal.status !== "done") continue;
    const seen = lastDone.get(key);
    if (!seen || (goal.completedAt ?? "") > (seen.completedAt ?? "")) lastDone.set(key, goal);
  }
  const usable = (key: string, sphere: string | undefined) => !openKeys.has(key) && !lockedPlaceFor(sphere, level);

  const repeats: Array<PlanChip & { at: string; rewarded: boolean }> = [];
  for (const [key, source] of lastDone) {
    if (!usable(key, source.sphere)) continue;
    const builtIn = builtInTemplate(key);
    const isSeed = SEED_TEMPLATES.some((seed) => seed.id === key);
    repeats.push({
      key,
      title: builtIn?.title ?? source.title,
      place: placeForSphere(source.sphere),
      kind: "repeat",
      sphere: source.sphere,
      ...(builtIn && !isSeed ? { templateId: key } : { repeatOf: source.id }),
      at: source.completedAt ?? "",
      rewarded: ledger.templates.has(key),
    });
  }
  repeats.sort((a, b) => Number(a.rewarded) - Number(b.rewarded) || b.at.localeCompare(a.at));

  // Never-done templates, grouped by sphere; spheres with the least XP first, one chip per sphere per round.
  const candidates: Array<{ id: string; title: string; sphere: string }> = [...SEED_TEMPLATES, ...SPHERE_TEMPLATES]
    .filter((template) => !lastDone.has(template.id) && usable(template.id, template.sphere));
  const spheres = [...new Set(candidates.map((template) => template.sphere))]
    .map((sphere, order) => ({ sphere, order, xp: xpBySphere[sphere] ?? 0 }))
    .sort((a, b) => a.xp - b.xp || a.order - b.order);
  const news: PlanChip[] = [];
  for (let round = 0; news.length < candidates.length; round += 1) {
    let added = false;
    for (const { sphere } of spheres) {
      const template = candidates.filter((item) => item.sphere === sphere)[round];
      if (!template) continue;
      added = true;
      news.push({ key: template.id, title: template.title, place: placeForSphere(template.sphere), kind: "new", templateId: template.id, sphere: template.sphere });
    }
    if (!added) break;
  }

  const strip = ({ at: _at, rewarded, ...chip }: PlanChip & { at: string; rewarded: boolean }): PlanChip =>
    rewarded ? { ...chip, noXpToday: true } : chip;
  // Repeats that can still give XP, then new ones, then repeats already rewarded today (Игрок, 24.11).
  const fresh = repeats.filter((chip) => !chip.rewarded).map(strip);
  const stale = repeats.filter((chip) => chip.rewarded).map(strip);
  return [...fresh, ...news, ...stale].slice(0, max);
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
