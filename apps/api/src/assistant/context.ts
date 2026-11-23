import {
  LIFE_SPHERES,
  XP_PER_LEVEL,
  mapNodeStates,
  streakDays,
  playerDay,
  playerDayOf,
  type Goal,
} from "@levex/domain";
import { currentTime, getPlayer, listGoals } from "../store.js";

/** What the assistant may know about the player. Built on the server only; the client never sends it. */
export interface PlayerContext {
  nickname: string;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  streak: number;
  /** Open missions (titles are player text, trimmed and capped). */
  openMissions: Array<{ title: string; sphere: string | null }>;
  doneToday: number;
  places: Array<{ name: string; state: "done" | "current" | "available" | "locked"; unlockLevel: number }>;
}

const MAX_MISSIONS = 8;
const MAX_TITLE = 80;

/** Read-only snapshot of the store. Never writes. */
export function readPlayerContext(): PlayerContext {
  const player = getPlayer();
  const goals = listGoals();
  const now = currentTime();
  const today = playerDay(now);
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  return {
    nickname: clean(player.nickname, 32),
    level: player.progress.level,
    xpIntoLevel: player.progress.xp % XP_PER_LEVEL,
    xpPerLevel: XP_PER_LEVEL,
    streak: streakDays(goals.map((goal) => goal.completedAt), now),
    openMissions: goals
      .filter((goal) => goal.status === "open")
      .slice(0, MAX_MISSIONS)
      .map((goal) => ({ title: clean(goal.title, MAX_TITLE), sphere: sphereName(goal) })),
    doneToday: goals.filter((goal) => playerDayOf(goal.completedAt) === today).length,
    places: mapNodeStates({ level: player.progress.level, doneSpheres }).map((node) => ({
      name: node.name,
      state: node.state,
      unlockLevel: node.unlockLevel,
    })),
  };
}

function sphereName(goal: Goal): string | null {
  if (!goal.sphere) return null;
  return LIFE_SPHERES.find((sphere) => sphere.id === goal.sphere)?.name ?? null;
}

/** One line, no quotes or brackets that could fake prompt structure, capped. */
function clean(text: string, max: number): string {
  const flat = text.replace(/[\r\n\t]+/g, " ").replace(/["«»<>`]/g, "'").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
