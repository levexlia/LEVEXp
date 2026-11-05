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

export const NICKNAME_MAX_LENGTH = 32;
export const TITLE_MAX_LENGTH = 64;
export const AVATAR_URL_MAX_LENGTH = 2048;

/**
 * XP pays the player for doing an activity. It is encouragement, not proof of mastery.
 * Future skills are a separate track and are not derived from `xpReward`.
 * One goal accepts at most {@link XP_REWARD_MAX}; a player's total can grow past that
 * by completing more goals.
 */
export const XP_REWARD_MAX = 50;
export const XP_REWARD_DEFAULT = 10;

export const ARTIFACT_TITLE_MAX_LENGTH = 200;
export const ARTIFACT_IMAGE_URL_MAX_LENGTH = 2048;
/** Kinds a room can hold in v0. Only photos for now. */
export const ARTIFACT_KINDS = ["photo"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
/** Artifacts created by the API land in this sphere unless a later version says otherwise. */
export const DEFAULT_ARTIFACT_SPHERE: LifeSphereId = "creativity";

export interface Player {
  id: string;
  nickname: string;
  createdAt: string; // ISO
  /** Optional display title. Omitted when unset. */
  title?: string;
  /** Optional avatar URL. Omitted when unset. */
  avatarUrl?: string;
  /** Stored progress. `totalXp` is the `xp` returned by the progress API. */
  progression: Progression;
}

export type GoalStatus = "open" | "done";

export interface Goal {
  id: string;
  title: string;
  sphere?: LifeSphereId;
  /** Activity XP, capped at {@link XP_REWARD_MAX} on create and patch. Not a mastery score. */
  xpReward: number;
  status: GoalStatus;
  // future: playerId, description, parentGoalId, deadline, skills
}

/** A photo (or, later, another kind) the player keeps in the virtual room. */
export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  /** Optional address of the image. Omitted when unset. */
  imageUrl?: string;
  sphere: LifeSphereId;
  createdAt: string; // ISO
  /** Creativity goal this photo is attached to. Omitted when unset. */
  goalId?: string;
}

/** One artifact standing in the room. Order in `Room.placements` is placement order. */
export interface Placement {
  artifactId: string;
}

/** The single player's virtual room. */
export interface Room {
  placements: Placement[];
}

/** Progress view of the single v1 player. `xp` mirrors `Progression.totalXp`. */
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

/** Map stored progression to the public progress shape. Level always follows `levelForXp`. */
export function progressFromProgression(progression: Progression): PlayerProgress {
  return {
    xp: progression.totalXp,
    level: levelForXp(progression.totalXp),
    xpBySphere: { ...progression.xpBySphere },
  };
}
