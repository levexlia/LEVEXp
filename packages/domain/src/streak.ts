/** Daily energy and the streak are derived from completion timestamps. They are not stored. */

import { playerDay, shiftDay } from "./daily.js";

export const ENERGY_MAX = 50;
export const ENERGY_PER_COMPLETION = 5;

/** UTC day. Kept for callers outside the XP rules (the avatar limit); game days use playerDay. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const dayOffset = shiftDay;

/**
 * Consecutive player days (Asia/Jerusalem, R-XP-5) with at least one completion, ending today if today
 * has one, otherwise ending yesterday. A gap before yesterday breaks the streak.
 * Completions without a timestamp are ignored.
 */
export function streakDays(completedAts: readonly (string | undefined)[], now: Date): number {
  const days = new Set<string>();
  for (const value of completedAts) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    days.add(playerDay(new Date(time)));
  }
  const today = playerDay(now);
  let cursor = days.has(today) ? today : dayOffset(today, -1);
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = dayOffset(cursor, -1);
  }
  return count;
}

/**
 * Completing a goal today (player day) spends {@link ENERGY_PER_COMPLETION}, down to zero.
 * Callers pass only completions that granted XP (R-XP-6); energy never limits XP (R-XP-11).
 */
export function energyForDay(completedAts: readonly (string | undefined)[], now: Date): { current: number; max: number } {
  const today = playerDay(now);
  let done = 0;
  for (const value of completedAts) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    if (playerDay(new Date(time)) === today) done += 1;
  }
  return { current: Math.max(0, ENERGY_MAX - done * ENERGY_PER_COMPLETION), max: ENERGY_MAX };
}
