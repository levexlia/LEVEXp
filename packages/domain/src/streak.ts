/** Daily energy and the streak are derived from completion timestamps. They are not stored. */

export const ENERGY_MAX = 50;
export const ENERGY_PER_COMPLETION = 5;

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayOffset(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDay(date);
}

/**
 * Consecutive UTC days with at least one completion, ending today if today
 * has one, otherwise ending yesterday. A gap before yesterday breaks the streak.
 * Completions without a timestamp are ignored.
 */
export function streakDays(completedAts: readonly (string | undefined)[], now: Date): number {
  const days = new Set<string>();
  for (const value of completedAts) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    days.add(utcDay(new Date(time)));
  }
  const today = utcDay(now);
  let cursor = days.has(today) ? today : dayOffset(today, -1);
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = dayOffset(cursor, -1);
  }
  return count;
}

/** Completing a goal today spends {@link ENERGY_PER_COMPLETION}, down to zero. */
export function energyForDay(completedAts: readonly (string | undefined)[], now: Date): { current: number; max: number } {
  const today = utcDay(now);
  let done = 0;
  for (const value of completedAts) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    if (utcDay(new Date(time)) === today) done += 1;
  }
  return { current: Math.max(0, ENERGY_MAX - done * ENERGY_PER_COMPLETION), max: ENERGY_MAX };
}
