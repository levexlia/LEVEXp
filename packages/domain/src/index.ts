// Только типы. Логика будет добавляться итеративно.

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

export type GoalStatus = "active" | "done" | "abandoned";

export interface Goal {
  id: string;
  playerId: string;
  sphereId: LifeSphereId;
  title: string;
  description?: string;
  xpReward: number;
  status: GoalStatus;
  parentGoalId?: string;
}

export interface Progression {
  level: number;
  totalXp: number;
  xpBySphere: Partial<Record<LifeSphereId, number>>;
}
