// Daily XP rules R-XP-5…R-XP-10 (spec «ИГРОК v1.0 — полезная составляющая», 24.11.2026).
// Pure functions: the API decides with them, the web client reads the same texts.
// The unit is still called XP (decision LEVEX-DEC-2026-0118-C is not implemented here).

import type { LifeSphereId } from "./index.js";
import { MAP_NODES, type MapNode } from "./map.js";

/** R-XP-5: the player's day is the calendar date in this zone, not UTC and not the browser alone. */
export const PLAYER_TIME_ZONE = "Asia/Jerusalem";

/** R-XP-6: at most this many completions with XP per player day. */
export const DAILY_AWARD_CAP = 5;
/** R-XP-7: at most this many completions with XP of the player's own missions per day. */
export const DAILY_OWN_AWARD_CAP = 3;

export type SeedTemplateId = "seed-walk" | "seed-read";

/** R-XP-10: the two seed templates are fixed in code. */
export const SEED_TEMPLATES: ReadonlyArray<{ id: SeedTemplateId; title: string; sphere: LifeSphereId }> = [
  { id: "seed-walk", title: "Утренняя прогулка 20 мин", sphere: "health" },
  { id: "seed-read", title: "Прочитать 10 страниц", sphere: "mind" },
];

/** Prefix of a template made from the player's own mission by «Повторить завтра» (R-XP-9). */
export const OWN_TEMPLATE_PREFIX = "own:";

/** At most this many open own missions (no template) at once; keeps the list usable (playtest 24.11). */
export const ACTIVE_OWN_MISSIONS_MAX = 20;

/** Calm text when the active own-mission limit is reached. */
export function activeOwnLimitMessage(max = ACTIVE_OWN_MISSIONS_MAX): string {
  return `Активных своих миссий уже ${max}. Закрой или удали одну, чтобы добавить новую.`;
}

/** Open own missions (no template), the ones {@link ACTIVE_OWN_MISSIONS_MAX} counts. */
export function activeOwnCount(goals: ReadonlyArray<Pick<DailyGoal, "status" | "templateId" | "repeatOf" | "title" | "sphere">>): number {
  return goals.filter((goal) => goal.status === "open" && templateKeyOf(goal) === null).length;
}

/**
 * Would completing `goal` now give XP? Same rules as {@link awardDecision}; for the «+10 XP» /
 * «без XP сегодня» label on open missions. Done goals: null.
 */
export function noXpTodayReason(goal: DailyGoal, ledger: DailyLedger): NoXpReason | null {
  if (goal.status === "done") return null;
  const decision = awardDecision(goal, ledger);
  return decision.award ? null : decision.reason;
}

export type NoXpReason = "daily_cap" | "own_cap" | "template_already_awarded";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLAYER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` of `date` in {@link PLAYER_TIME_ZONE}. */
export function playerDay(date: Date): string {
  const parts = dayFormat.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Player day of an ISO time, or null when it is missing or not a date. */
export function playerDayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return playerDay(new Date(time));
}

/** Calendar arithmetic on `YYYY-MM-DD` (no time zone involved). */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `DD.MM` of an ISO time in the player's zone. */
export function playerDdMm(iso: string | undefined): string | null {
  const day = playerDayOf(iso);
  return day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : null;
}

/** The fields of a goal the daily rules read. */
export interface DailyGoal {
  id: string;
  title: string;
  sphere?: LifeSphereId | string;
  status: "open" | "done";
  completedAt?: string;
  xpReward: number;
  /** XP actually granted at completion. Missing on goals finished before these rules: then `xpReward`. */
  xpGranted?: number;
  templateId?: string;
  repeatOf?: string;
}

export function isSeedTemplateId(value: string): value is SeedTemplateId {
  return SEED_TEMPLATES.some((template) => template.id === value);
}

/**
 * Template of a goal: its stored `templateId`, or, for goals seeded before templates existed,
 * the seed whose exact title and sphere it has. Null means the player's own mission (R-XP-7).
 */
export function templateKeyOf(goal: Pick<DailyGoal, "templateId" | "repeatOf" | "title" | "sphere">): string | null {
  if (goal.templateId) return goal.templateId;
  if (goal.repeatOf) return null;
  const seed = SEED_TEMPLATES.find((template) => template.title === goal.title && template.sphere === goal.sphere);
  return seed ? seed.id : null;
}

/** XP a done goal really gave. Old rows without `xpGranted` gave their stored reward. */
export function grantedXp(goal: DailyGoal): number {
  if (goal.status !== "done") return 0;
  return goal.xpGranted ?? goal.xpReward;
}

export interface DailyLedger {
  day: string;
  /** Completions with XP today (R-XP-6). */
  awarded: number;
  /** Of those, the player's own missions (R-XP-7). */
  ownAwarded: number;
  awardCap: number;
  ownAwardCap: number;
  /** Templates that already gave XP today (R-XP-10). */
  templates: Set<string>;
  /** Goals that gave XP today. */
  goalIds: Set<string>;
}

/** What today (player day of `now`) has already granted. */
export function dailyLedger(goals: readonly DailyGoal[], now: Date): DailyLedger {
  const day = playerDay(now);
  const ledger: DailyLedger = {
    day,
    awarded: 0,
    ownAwarded: 0,
    awardCap: DAILY_AWARD_CAP,
    ownAwardCap: DAILY_OWN_AWARD_CAP,
    templates: new Set(),
    goalIds: new Set(),
  };
  for (const goal of goals) {
    if (goal.status !== "done" || playerDayOf(goal.completedAt) !== day) continue;
    if (grantedXp(goal) <= 0) continue;
    ledger.awarded += 1;
    ledger.goalIds.add(goal.id);
    const key = templateKeyOf(goal);
    if (key) ledger.templates.add(key);
    else ledger.ownAwarded += 1;
  }
  return ledger;
}

/**
 * R-XP-6/7/10: may completing `goal` now grant XP? The goal is still recorded as done either way.
 * Order: the daily cap, then one award per template, then the own-mission cap.
 */
export function awardDecision(goal: DailyGoal, ledger: DailyLedger): { award: true } | { award: false; reason: NoXpReason } {
  if (ledger.awarded >= ledger.awardCap) return { award: false, reason: "daily_cap" };
  const key = templateKeyOf(goal);
  if (key) {
    const ownOrigin = key.startsWith(OWN_TEMPLATE_PREFIX) ? key.slice(OWN_TEMPLATE_PREFIX.length) : null;
    if (ledger.templates.has(key) || (ownOrigin !== null && ledger.goalIds.has(ownOrigin))) {
      return { award: false, reason: "template_already_awarded" };
    }
    return { award: true };
  }
  // An own mission whose repeat copy already gave XP today counts as the same template.
  if (ledger.templates.has(`${OWN_TEMPLATE_PREFIX}${goal.id}`)) return { award: false, reason: "template_already_awarded" };
  if (ledger.ownAwarded >= ledger.ownAwardCap) return { award: false, reason: "own_cap" };
  return { award: true };
}

/**
 * Calm Russian text for a completion recorded without XP. No pressure, no guilt, no "lost" words.
 * Shown by the UI as is and sent by the API as `message`.
 */
export function noXpMessage(reason: NoXpReason, input: { title?: string; awardCap?: number; ownAwardCap?: number } = {}): string {
  const cap = input.awardCap ?? DAILY_AWARD_CAP;
  const own = input.ownAwardCap ?? DAILY_OWN_AWARD_CAP;
  switch (reason) {
    case "daily_cap":
      return `Записано без начисления: лимит XP на сегодня ${cap}/${cap}. Дело сохранено, завтра начисления снова будут.`;
    case "own_cap":
      return `Записано без начисления: свои миссии дают XP до ${own} раз в день (${own}/${own}). Дело сохранено.`;
    case "template_already_awarded":
      return input.title
        ? `Записано без начисления: за «${input.title}» сегодня XP уже был. Дело сохранено.`
        : "Записано без начисления: за это дело сегодня XP уже был. Дело сохранено.";
  }
}

/** Hint on «Сегодня» when the daily cap is used up (spec №1). */
export function dailyCapHint(cap = DAILY_AWARD_CAP): string {
  return `Можно записать дело без начисления: лимит XP на сегодня исчерпан (${cap}/${cap}).`;
}

/** R-XP-8: the map place of `sphere` when it is still locked at `level`. Spheres without a place: undefined. */
export function lockedPlaceFor(sphere: string | undefined, level: number): MapNode | undefined {
  const node = MAP_NODES.find((item) => item.sphere === sphere);
  return node && level < node.unlockLevel ? node : undefined;
}

/** R-XP-8 error text, the same in the API answer and in the UI. */
export function placeLockedMessage(node: Pick<MapNode, "name" | "unlockLevel">): string {
  return `Место «${node.name}» откроется на уровне ${node.unlockLevel}`;
}

/** Micro-reflection after a mission (spec №3). Does not touch XP, level or the map. */
export const REFLECTION_FEELINGS = ["easy", "ok", "hard"] as const;
export type ReflectionFeeling = (typeof REFLECTION_FEELINGS)[number];
export const REFLECTION_NOTE_MAX = 200;
export const REFLECTION_LABEL: Record<ReflectionFeeling, string> = {
  easy: "Легко",
  ok: "Нормально",
  hard: "Было трудно",
};

export interface Reflection {
  felt: ReflectionFeeling;
  note?: string;
  /** ISO time it was saved. */
  at: string;
}
