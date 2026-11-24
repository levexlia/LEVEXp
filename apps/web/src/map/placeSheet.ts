import { DAILY_AWARD_CAP, MAP_NODES, XP_PER_LEVEL, XP_REWARD_STANDARD, dailyLedger, grantedXp, noXpTodayReason, playerDay, playerDdMm, type MapNodeId, type MapNodeState } from "@levex/domain";
import type { Goal } from "../api";
import { lockedHint } from "./spots";

/** What the place sheet (bottom sheet after tapping a place) shows. Pure: no game rules live here. */
export type SheetAction = "later" | "start" | "enter" | "repeat";

export interface SheetMission {
  id: string;
  title: string;
  xp: number;
  done: boolean;
  /** Open, but today it would be recorded without XP (daily rules). */
  noXpToday: boolean;
  /** Open copy for a later day («Повторить завтра»): its `DD.MM`; it cannot be done before (cycle2 P-C3). */
  from: string | null;
}

/** The place sheet shows open missions and at most this many of the newest finished ones (cycle2 P-C2). */
export const SHEET_DONE_MAX = 3;

export interface PlaceSheetModel {
  id: MapNodeId;
  state: MapNodeState;
  /** "МЕСТО 03": the place's number along the path, bottom to top. */
  meta: string;
  title: string;
  status: string;
  /** Goals of this place's sphere: how many are done out of all. */
  progress: { done: number; total: number };
  missions: SheetMission[];
  /** Finished missions of this place not listed (older than the {@link SHEET_DONE_MAX} newest): «ещё N». */
  moreDone: number;
  /** Missions are listed but their names and XP are masked. */
  missionsHidden: boolean;
  /** Done only: XP already earned here (sum of finished goals), never a new reward. */
  earnedXp: number | null;
  /** Done only: date of the last finished goal here, DD.MM. */
  doneOn: string | null;
  /** Locked only: what opens the place. Built from unlockLevel, see lockedHint. */
  condition: { text: string; level: number; needLevel: number; pace: string } | null;
  /** Locked only: why the primary button is off. */
  disabledWhy: string | null;
  /** Left to right. The primary action is the last one. */
  actions: SheetAction[];
  primaryDisabled: boolean;
}

export const STATUS_WORD: Record<MapNodeState, string> = {
  available: "Доступно",
  current: "Текущее",
  done: "Пройдено",
  locked: "Закрыто",
};

export const ACTION_LABEL: Record<SheetAction, string> = {
  later: "Позже",
  start: "Начать",
  enter: "Войти",
  /** Done place: opens this place's missions. A finished mission gives no XP again (domain completeGoal). */
  repeat: "Миссии места",
};

const ACTIONS: Record<MapNodeState, SheetAction[]> = {
  available: ["later", "start"],
  current: ["later", "enter"],
  done: ["repeat"],
  locked: ["later", "enter"],
};

/** DD.MM in the player's zone (Asia/Jerusalem). */
const ddmm = playerDdMm;

export function placeSheet(input: {
  id: MapNodeId;
  state: MapNodeState;
  goals: readonly Goal[];
  level: number;
  xp: number;
  now?: Date;
}): PlaceSheetModel {
  const now = input.now ?? new Date();
  const ledger = dailyLedger(input.goals, now);
  const today = playerDay(now);
  const index = MAP_NODES.findIndex((node) => node.id === input.id);
  const node = MAP_NODES[index];
  if (!node) throw new Error(`unknown place ${input.id}`);
  const own = input.goals.filter((goal) => goal.sphere === node.sphere);
  const finished = own.filter((goal) => goal.status === "done");
  const toMission = (goal: Goal): SheetMission => {
    const waiting = goal.status === "open" && !!goal.availableFrom && goal.availableFrom > today;
    return {
      id: goal.id,
      title: goal.title,
      xp: goal.status === "done" ? grantedXp(goal) : goal.xpReward,
      done: goal.status === "done",
      noXpToday: !waiting && noXpTodayReason(goal, ledger) !== null,
      from: waiting ? `${goal.availableFrom!.slice(8, 10)}.${goal.availableFrom!.slice(5, 7)}` : null,
    };
  };
  // Open ones in API order, then the newest finished ones; older records stay in the data and the Missions tab.
  const newestDone = [...finished].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const missions = [...own.filter((goal) => goal.status !== "done"), ...newestDone.slice(0, SHEET_DONE_MAX)].map(toMission);
  const locked = input.state === "locked";
  const done = input.state === "done";
  const last = finished
    .map((goal) => goal.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    id: node.id,
    state: input.state,
    meta: `Место ${String(index + 1).padStart(2, "0")}`,
    title: node.name,
    status: STATUS_WORD[input.state],
    progress: { done: finished.length, total: own.length },
    missions,
    moreDone: Math.max(0, finished.length - SHEET_DONE_MAX),
    missionsHidden: locked,
    // XP really granted: a mission recorded without XP (daily rules) adds 0.
    earnedXp: done ? finished.reduce((sum, goal) => sum + grantedXp(goal), 0) : null,
    doneOn: done ? ddmm(last) : null,
    condition: locked
      ? {
        text: lockedHint(node.id, { level: input.level, xp: input.xp }),
        level: input.level,
        needLevel: node.unlockLevel,
        pace: unlockPace(Math.max(0, (node.unlockLevel - 1) * XP_PER_LEVEL - input.xp)),
      }
      : null,
    disabledWhy: locked ? `Войти можно с уровня ${node.unlockLevel}` : null,
    actions: ACTIONS[input.state],
    primaryDisabled: locked,
  };
}

/** Daily XP ceiling: DAILY_AWARD_CAP completions × the standard reward (50). */
export const DAILY_XP_MAX = DAILY_AWARD_CAP * XP_REWARD_STANDARD;

/** «За день можно получить до 50 XP — обычно это 1–2 дня.» for a locked place that needs `need` XP. */
export function unlockPace(need: number): string {
  const days = Math.max(1, Math.ceil(need / DAILY_XP_MAX));
  const range = days === 1 ? "1–2 дня" : `${days}–${days + 1} ${days + 1 >= 5 ? "дней" : "дня"}`;
  return `За день можно получить до ${DAILY_XP_MAX} XP, поэтому обычно это ${range}.`;
}

/** Segments of a progress bar: at least one, at most `max`, `on` of them lit. */
export function segments(done: number, total: number, max = 8): boolean[] {
  const count = Math.max(1, Math.min(max, total));
  const on = total === 0 ? 0 : Math.round((Math.min(done, total) / total) * count);
  return Array.from({ length: count }, (_, i) => i < on);
}
