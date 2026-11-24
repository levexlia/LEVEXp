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

/**
 * Activity screen help of a built-in template («Начать»): an optional countdown or a short list
 * of steps. Steps live only on the screen; nothing the player ticks or types there is stored.
 */
export type TemplateAid = { kind: "timer"; minutes: number } | { kind: "steps"; steps: readonly string[] };

/** Spheres with no place on the map yet: their missions live in the Миссии tab («Без места»). */
export const PLACELESS_SPHERES = ["career", "finance", "relationships"] as const satisfies readonly LifeSphereId[];
export type PlacelessSphere = (typeof PLACELESS_SPHERES)[number];

export interface SphereTemplate {
  id: string;
  title: string;
  sphere: PlacelessSphere;
  /** About how long it takes, minutes (5–25). */
  minutes: number;
  aid: TemplateAid;
}

/**
 * Placeless missions (package «sphere missions», 24.11.2026): 3 small realistic templates per
 * sphere, open from level 1, +10 XP under the same R-XP-5…10 rules as the seeds (a template
 * gives XP once a day, the day cap counts them, the own-mission cap does not).
 * Finance missions never ask for or store amounts: only the done mark and an optional note.
 */
export const SPHERE_TEMPLATES: readonly SphereTemplate[] = [
  { id: "career-focus", title: "25 минут над важной задачей", sphere: "career", minutes: 25, aid: { kind: "timer", minutes: 25 } },
  {
    id: "career-plan", title: "Записать 3 дела на завтра", sphere: "career", minutes: 5,
    aid: { kind: "steps", steps: ["Открыть блокнот или заметки", "Записать три дела на завтра", "Отметить самое важное"] },
  },
  { id: "career-learn", title: "Узнать одну новую вещь по работе или учёбе", sphere: "career", minutes: 15, aid: { kind: "timer", minutes: 15 } },
  {
    id: "finance-spend", title: "Записать траты за день", sphere: "finance", minutes: 5,
    aid: { kind: "steps", steps: ["Открыть свой блокнот или приложение банка", "Записать сегодняшние траты там, где удобно", "Посмотреть, что из этого было нужно"] },
  },
  {
    id: "finance-sub", title: "Проверить одну подписку", sphere: "finance", minutes: 10,
    aid: { kind: "steps", steps: ["Выбрать одну подписку", "Вспомнить, когда ею пользовались в последний раз", "Решить: оставить, поставить на паузу или отменить"] },
  },
  {
    id: "finance-save", title: "Отложить небольшую сумму", sphere: "finance", minutes: 5,
    aid: { kind: "steps", steps: ["Выбрать посильную сумму, можно совсем маленькую", "Отложить её в копилку или на накопительный счёт"] },
  },
  {
    id: "rel-write", title: "Написать близкому человеку", sphere: "relationships", minutes: 5,
    aid: { kind: "steps", steps: ["Выбрать человека", "Написать пару тёплых строк", "Отправить"] },
  },
  { id: "rel-call", title: "Позвонить родным или другу", sphere: "relationships", minutes: 10, aid: { kind: "timer", minutes: 10 } },
  {
    id: "rel-thanks", title: "Поблагодарить кого-то", sphere: "relationships", minutes: 5,
    aid: { kind: "steps", steps: ["Вспомнить, кто недавно помог", "Сказать или написать «спасибо» и за что именно"] },
  },
];

export function sphereTemplate(id: string | undefined): SphereTemplate | undefined {
  return id ? SPHERE_TEMPLATES.find((template) => template.id === id) : undefined;
}

/** Seeds and placeless templates: the ids POST /goals accepts as `templateId` besides `own:<id>`. */
export function builtInTemplate(id: string): { id: string; title: string; sphere: LifeSphereId } | undefined {
  return SEED_TEMPLATES.find((template) => template.id === id) ?? sphereTemplate(id);
}

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

/** The one label used instead of «+N XP» when a completion now would give nothing. */
export const NO_XP_TODAY_LABEL = "без XP сегодня";

/**
 * The XP promise of an open mission or a catalog / plan button: «+10 XP», or «без XP сегодня»
 * when the daily rules would give nothing now. Every place that shows a promise uses this.
 */
export function xpPromiseLabel(noXpToday: boolean, xp: number): string {
  return noXpToday ? NO_XP_TODAY_LABEL : `+${xp} XP`;
}

/** A done mission: what it really gave («+10 XP получено») or «без XP · записано». */
export function xpDoneLabel(granted: number): string {
  return granted > 0 ? `+${granted} XP получено` : "без XP · записано";
}

/**
 * Would a NEW goal of this template (or an own mission, `templateKey` null) give XP if finished now?
 * For catalog and plan buttons that are not goals yet. Same order as {@link awardDecision}.
 */
export function templateNoXpReason(templateKey: string | null, ledger: DailyLedger): NoXpReason | null {
  const probe: DailyGoal = { id: "", title: "", status: "open", xpReward: 0, ...(templateKey ? { templateId: templateKey } : {}) };
  const decision = awardDecision(probe, ledger);
  return decision.award ? null : decision.reason;
}

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
/**
 * scene18 «Отменить»: only a record of the current player day (Asia/Jerusalem) can be taken back.
 * Past days stay in the journal as they are.
 */
export function canUndo(goal: Pick<DailyGoal, "status" | "completedAt">, now: Date): boolean {
  return goal.status === "done" && playerDayOf(goal.completedAt) === playerDay(now);
}

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
