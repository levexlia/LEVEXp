/**
 * Journal (scene18): today's records with «Отменить» / «Вернуть», yesterday as it is, and the week
 * journal in Профиль. Pure: it only reads goals the API sent. Days are player days (Asia/Jerusalem).
 * No bars, no percentages, no «из N», no red: a day is its marks or «Без отметок».
 */
import { LIFE_SPHERE_IDS, canUndo, getLifeSphere, playerDay, playerDayOf, shiftDay } from "@levex/domain";
import type { Goal } from "../api";
import { missionRow, rowWhere } from "../map/missions";

export interface JournalEntry {
  id: string;
  title: string;
  sphere: string | null;
  /** «Сфера · место» / «Сфера · где угодно». */
  where: string;
  sphereName: string;
  place: string | null;
  /** Today's record: «Отменить» is allowed (R: current player day only). */
  undoable: boolean;
  /** Taken back today: «запись отменена» + «Вернуть». */
  undone: boolean;
}

function entry(goal: Goal, now: Date): JournalEntry {
  const row = missionRow(goal, playerDay(now));
  return {
    id: goal.id,
    title: goal.title,
    sphere: goal.sphere ?? null,
    where: rowWhere(row),
    sphereName: row.sphereName,
    place: row.place,
    undoable: canUndo(goal, now),
    undone: goal.status === "open" && playerDayOf(goal.undoneAt) === playerDay(now),
  };
}

const byTimeDesc = (key: (goal: Goal) => string | undefined) => (a: Goal, b: Goal) => (key(b) ?? "").localeCompare(key(a) ?? "");

/** «Записи за сегодня»: today's records (newest first), then the ones taken back today. */
export function todayEntries(goals: readonly Goal[], now: Date): JournalEntry[] {
  const today = playerDay(now);
  const done = goals.filter((goal) => goal.status === "done" && playerDayOf(goal.completedAt) === today).sort(byTimeDesc((goal) => goal.completedAt));
  const undone = goals.filter((goal) => goal.status === "open" && playerDayOf(goal.undoneAt) === today).sort(byTimeDesc((goal) => goal.undoneAt));
  return [...done, ...undone].map((goal) => entry(goal, now));
}

/** Records of one past day: shown as they are, without a button. */
export function dayEntries(goals: readonly Goal[], day: string, now: Date): JournalEntry[] {
  return goals
    .filter((goal) => goal.status === "done" && playerDayOf(goal.completedAt) === day)
    .sort(byTimeDesc((goal) => goal.completedAt))
    .map((goal) => ({ ...entry(goal, now), undoable: false, undone: false }));
}

const WEEKDAY = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"] as const;
const MONTH_SHORT = ["ЯНВ", "ФЕВР", "МАРТ", "АПР", "МАЯ", "ИЮНЯ", "ИЮЛЯ", "АВГ", "СЕНТ", "ОКТ", "НОЯБ", "ДЕК"] as const;
const MONTH_LONG = ["ЯНВАРЯ", "ФЕВРАЛЯ", "МАРТА", "АПРЕЛЯ", "МАЯ", "ИЮНЯ", "ИЮЛЯ", "АВГУСТА", "СЕНТЯБРЯ", "ОКТЯБРЯ", "НОЯБРЯ", "ДЕКАБРЯ"] as const;

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` player day. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

/** Monday of the week of `day`. */
export function weekStart(day: string): string {
  return shiftDay(day, -((weekdayOf(day) + 6) % 7));
}

export const weekdayLabel = (day: string) => WEEKDAY[weekdayOf(day)]!;
export const dayShort = (day: string) => `${Number(day.slice(8, 10))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]}`;

/** «16 — 22 НОЯБРЯ», or «30 НОЯБРЯ — 6 ДЕКАБРЯ» across a month. */
export function weekLabel(start: string): string {
  const end = shiftDay(start, 6);
  const d = (day: string) => Number(day.slice(8, 10));
  const m = (day: string) => MONTH_LONG[Number(day.slice(5, 7)) - 1]!;
  return start.slice(5, 7) === end.slice(5, 7) ? `${d(start)} — ${d(end)} ${m(end)}` : `${d(start)} ${m(start)} — ${d(end)} ${m(end)}`;
}

export interface JournalDay {
  day: string;
  weekday: string;
  short: string;
  today: boolean;
  /** Spheres of the day's records in the order they first appeared, with how many records each. */
  marks: Array<{ sphere: string; name: string; count: number }>;
}

export interface JournalWeek {
  start: string;
  label: string;
  /** Monday … Sunday; the current week stops at today (no future days). */
  days: JournalDay[];
  /** Records per sphere this week, only spheres that have some (a plain count, no «из N»). */
  sum: Array<{ sphere: string; name: string; count: number }>;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Week journal. `offset` 0 is this week, −1 the week before. Every recorded completion counts as a mark
 * (also one recorded without XP); a record taken back with «Отменить» is not a mark.
 */
export function journalWeek(goals: readonly Goal[], offset: number, now: Date): JournalWeek {
  const today = playerDay(now);
  const current = weekStart(today);
  const start = shiftDay(current, 7 * Math.min(0, offset));
  const byDay = new Map<string, Goal[]>();
  let first = today;
  for (const goal of goals) {
    if (goal.status !== "done") continue;
    const day = playerDayOf(goal.completedAt);
    if (!day) continue;
    if (day < first) first = day;
    byDay.set(day, [...(byDay.get(day) ?? []), goal]);
  }
  const days: JournalDay[] = [];
  const totals = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const day = shiftDay(start, i);
    if (day > today) break;
    const marks: JournalDay["marks"] = [];
    const records = [...(byDay.get(day) ?? [])].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
    for (const goal of records) {
      const sphere = goal.sphere ?? "";
      if (!getLifeSphere(sphere)) continue;
      const mark = marks.find((item) => item.sphere === sphere);
      if (mark) mark.count += 1;
      else marks.push({ sphere, name: getLifeSphere(sphere)!.name, count: 1 });
      totals.set(sphere, (totals.get(sphere) ?? 0) + 1);
    }
    days.push({ day, weekday: weekdayLabel(day), short: dayShort(day), today: day === today, marks });
  }
  const sum = LIFE_SPHERE_IDS.filter((sphere) => (totals.get(sphere) ?? 0) > 0).map((sphere) => ({
    sphere,
    name: getLifeSphere(sphere)!.name,
    count: totals.get(sphere)!,
  }));
  return { start, label: weekLabel(start), days, sum, canPrev: start > weekStart(first), canNext: start < current };
}
