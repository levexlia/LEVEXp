import { randomUUID } from "node:crypto";
import { levelForXp, type Goal, type LifeSphereId, type PlayerProgress } from "@levex/domain";

// v1: in-memory, single implicit player. Lost on restart.
const goals = new Map<string, Goal>();
let xp = 0;
let xpBySphere: Partial<Record<LifeSphereId, number>> = {};

export function resetStore(seed = true) {
  goals.clear();
  xp = 0;
  xpBySphere = {};
  if (seed) {
    createGoal({ title: "Morning walk 20 min", sphere: "health", xpReward: 15 });
    createGoal({ title: "Read 10 pages", sphere: "mind" });
  }
}

export const listGoals = (): Goal[] => [...goals.values()];
export const getProgress = (): PlayerProgress => ({ xp, level: levelForXp(xp), xpBySphere: { ...xpBySphere } });

export function createGoal(input: { title: string; sphere?: LifeSphereId; xpReward?: number }): Goal {
  const goal: Goal = { id: randomUUID(), title: input.title, xpReward: input.xpReward ?? 10, status: "open" };
  if (input.sphere) goal.sphere = input.sphere;
  goals.set(goal.id, goal);
  return goal;
}

/** Marks goal done; XP awarded only on the first completion. Returns undefined if not found. */
export function completeGoal(id: string): { goal: Goal; progress: PlayerProgress; awarded: boolean } | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  const awarded = goal.status !== "done";
  if (awarded) {
    goal.status = "done";
    xp += goal.xpReward;
    if (goal.sphere) xpBySphere[goal.sphere] = (xpBySphere[goal.sphere] ?? 0) + goal.xpReward;
  }
  return { goal, progress: getProgress(), awarded };
}

resetStore();
