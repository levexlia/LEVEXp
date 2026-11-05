// Доменные типы + чистые функции прогрессии.

export type LifeSphereId =
  | "health" | "mind" | "career" | "finance" | "relationships"
  | "creativity" | "spirit" | "community";

export interface LifeSphere {
  id: LifeSphereId;
  name: string;
  description?: string;
}

/** Static v1 catalog. Array order is the public list order of GET /spheres. */
export const LIFE_SPHERES: readonly LifeSphere[] = [
  { id: "health", name: "Здоровье", description: "Тело, сон, движение и восстановление." },
  { id: "mind", name: "Разум", description: "Учёба, внимание и ясность мышления." },
  { id: "career", name: "Карьера", description: "Работа, мастерство и профессиональный рост." },
  { id: "finance", name: "Финансы", description: "Доходы, расходы и финансовая устойчивость." },
  { id: "relationships", name: "Отношения", description: "Близкие люди, дружба и общение." },
  { id: "creativity", name: "Творчество", description: "Самовыражение, проекты и игра." },
  { id: "spirit", name: "Дух", description: "Смысл, ценности и внутренняя опора." },
  { id: "community", name: "Сообщество", description: "Помощь другим и вклад в общее дело." },
];

export const LIFE_SPHERE_IDS: readonly LifeSphereId[] = LIFE_SPHERES.map((sphere) => sphere.id);

const sphereById = new Map<LifeSphereId, LifeSphere>(LIFE_SPHERES.map((sphere) => [sphere.id, sphere]));

export function listLifeSpheres(): LifeSphere[] {
  return LIFE_SPHERES.map((sphere) => ({ ...sphere }));
}

export function getLifeSphere(id: string): LifeSphere | undefined {
  const sphere = sphereById.get(id as LifeSphereId);
  return sphere ? { ...sphere } : undefined;
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
  /** XP from completed goals that belong to a sphere. Goals without a sphere are not listed. */
  xpBySphere: Partial<Record<LifeSphereId, number>>;
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
