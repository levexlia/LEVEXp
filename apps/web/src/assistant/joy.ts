/**
 * scene16 «Радость помощника» (levex_design/scene16/INTEGRATION.md). Pure rules; no XP, progress or API here.
 *
 * - A: every successful mark (button, Proof, «Вернуть») — the map robot is calmly happy for 2.5 s
 *   (2 s static under reduced motion), a pulse to the place's dome; «+N XP» only when XP was granted.
 * - B: a local praise in the chat (a template, never an LLM call). Never mentions the streak; no XP after the cap.
 * - C: a full-screen moment only when places open (levels 2 and 4), once per player and level.
 * No sound, no push, no random choice, no counters of unread praise.
 */
import { MAP_NODES, playerDay, playerDayOf, type MapNodeId } from "@levex/domain";
import type { Goal } from "../api";

/** A: the map robot's calm joy, then idle again. */
export const JOY_MAP_MS = 2500;
/** A under reduced motion: a static frame for 2 s. */
export const JOY_MAP_STATIC_MS = 2000;
/** B: one happy cycle of the chat header. */
export const JOY_CHAT_MS = 2400;
/** C closes by itself after this. */
export const MILESTONE_MS = 2000;
/** Levels that open new places (domain map.ts unlockLevel), the only ones with C. */
export const MILESTONE_LEVELS: readonly number[] = [...new Set(MAP_NODES.map((node) => node.unlockLevel))].filter((level) => level > 1).sort((a, b) => a - b);

export const milestoneKey = (playerId: string) => `levex.milestone.seen.${playerId}`;

export type SeenStore = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null when it is missing or throws (private mode): then C is never shown. */
export function milestoneStore(): SeenStore | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    // Some browsers expose the object but throw on use.
    store.getItem("levex.milestone.probe");
    return store;
  } catch {
    return null;
  }
}

/** Levels already shown to this player; a broken value reads as []. */
export function readSeen(store: SeenStore, playerId: string): number[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(milestoneKey(playerId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

/** Milestone levels crossed by one mark: `before < L ≤ after`. */
export function crossedMilestones(levelBefore: number, levelAfter: number): number[] {
  return MILESTONE_LEVELS.filter((level) => levelBefore < level && level <= levelAfter);
}

/**
 * C for one mark: the highest crossed milestone not shown yet, or null. All crossed levels are written as seen
 * **before** the show, so a double tap or a re-render never gives a second C. No storage → no C at all.
 */
export function takeMilestone(levelBefore: number, levelAfter: number, playerId: string | undefined, store: SeenStore | null): number | null {
  if (!store || !playerId) return null;
  const crossed = crossedMilestones(levelBefore, levelAfter);
  if (crossed.length === 0) return null;
  const seen = readSeen(store, playerId);
  const fresh = crossed.filter((level) => !seen.includes(level));
  try {
    store.setItem(milestoneKey(playerId), JSON.stringify([...new Set([...seen, ...crossed])].sort((a, b) => a - b)));
  } catch {
    return null;
  }
  return fresh.length > 0 ? Math.max(...fresh) : null;
}

/** Places that open at `level` (cards of C). */
export function placesOpenedAt(level: number): Array<{ id: MapNodeId; name: string }> {
  return MAP_NODES.filter((node) => node.unlockLevel === level).map((node) => ({ id: node.id, name: node.name }));
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** The polite live text of C: «Уровень 02, открыто место Парк, открыто место Мастерская». */
export function milestoneLive(level: number): string {
  return [`Уровень ${pad2(level)}`, ...placesOpenedAt(level).map((place) => `открыто место ${place.name}`)].join(", ");
}

/** The assistant's line in C. Calm, no pressure. */
export function milestoneLine(level: number): string {
  const names = placesOpenedAt(level).map((place) => place.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} и ${names.at(-1)}` : names[0] ?? "Новое место";
  return `${list} ${names.length > 1 ? "открыты" : "открыто"}. Можно заглянуть, когда будет удобно.`;
}

/** Place of a goal's sphere and its progress («Парк · 3 / 4»), or null for placeless spheres. */
export function placeProgress(goal: Pick<Goal, "sphere">, goals: readonly Goal[]): { id: MapNodeId; name: string; done: number; total: number } | null {
  const node = MAP_NODES.find((item) => item.sphere === goal.sphere);
  if (!node) return null;
  const own = goals.filter((item) => item.sphere === node.sphere);
  return { id: node.id, name: node.name, done: own.filter((item) => item.status === "done").length, total: own.length };
}

/** One praise in the chat (B). `gainedXp > 0` picks the template — never the server message text. */
export interface Praise {
  /** goal id + completedAt: one praise per record. */
  key: string;
  text: string;
  gainedXp: number;
  place: { name: string; done: number; total: number } | null;
}

export function praiseFor(goal: Goal, gainedXp: number, goals: readonly Goal[]): Praise {
  const place = placeProgress(goal, goals);
  const where = place ? ` ${place.name} теперь ${place.done} / ${place.total}.` : "";
  // Praise the action itself. No streak, no «подряд», no days; after the cap no XP and no «+N».
  const text = gainedXp > 0 ? `Засчитано: «${goal.title}».${where} Хороший шаг.` : `Записано: «${goal.title}».${where} Хорошее дело.`;
  return {
    key: recordKey(goal),
    text,
    gainedXp: Math.max(0, gainedXp),
    place: place ? { name: place.name, done: place.done, total: place.total } : null,
  };
}

export const recordKey = (goal: Pick<Goal, "id" | "completedAt">) => `${goal.id}@${goal.completedAt ?? ""}`;

/**
 * Praise to show when the chat opens: only for the **last** record, only if it is still today's (player day)
 * and not taken back («Отменить» makes it open again), and only once per session (`praised`).
 */
export function pendingPraise(last: Praise | null, goals: readonly Goal[], now: Date, praised: ReadonlySet<string>): Praise | null {
  if (!last || praised.has(last.key)) return null;
  const goal = goals.find((item) => recordKey(item) === last.key);
  if (!goal || goal.status !== "done") return null;
  if (playerDayOf(goal.completedAt) !== playerDay(now)) return null;
  return last;
}

/** Map robot art: the hint pose, the chat's state, the calm joy of A (until `joyUntil`), else idle. */
export type MapRobotLook = "hint" | "chat" | "happysoft" | "idle";

export function mapRobotLook(input: { hint: boolean; chat: boolean; joyUntil: number | null; now: number }): MapRobotLook {
  if (input.chat) return "chat";
  if (input.joyUntil !== null && input.now < input.joyUntil) return "happysoft";
  if (input.hint) return "hint";
  return "idle";
}

/** Chat header: happy for one cycle after a praise, then its usual state. */
export function chatHappy(happyUntil: number | null, now: number): boolean {
  return happyUntil !== null && now < happyUntil;
}
