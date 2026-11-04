// Доменные типы + чистые функции прогрессии.

export type LifeSphereId =
  | "health" | "mind" | "career" | "finance" | "relationships"
  | "creativity" | "spirit" | "community";

export interface LifeSphere {
  id: LifeSphereId;
  name: string;
  description?: string;
}

export interface Player {
  id: string;
  nickname: string;
  createdAt: string; // ISO
  progression: Progression;
}

export type GoalStatus = "open" | "done";

export interface Goal {
  id: string;
  title: string;
  sphere?: LifeSphereId;
  xpReward: number;
  status: GoalStatus;
  // future: playerId, description, parentGoalId, deadline
}

/** v1 progress of the single (implicit) player. */
export interface PlayerProgress {
  xp: number;
  level: number;
}

export const XP_PER_LEVEL = 100;

/** Level formula v1: level = floor(xp / 100) + 1  (0–99 XP → 1, 100–199 → 2, ...). */
export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

export interface Progression {
  level: number;
  totalXp: number;
  xpBySphere: Partial<Record<LifeSphereId, number>>;
}
