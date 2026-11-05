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
 * Activity XP pays the player for doing something. It is encouragement, not proof of mastery.
 * Future skills are a separate track: they are not derived from `xpReward` or {@link xpForGoal},
 * and this slice does not implement them.
 * The server assigns each new goal's reward. A player's total can grow past
 * {@link XP_REWARD_MAX} by completing more goals.
 */
export const XP_REWARD_MAX = 50;
/** Activity XP for a goal with no completion bonus. */
export const XP_REWARD_STANDARD = 10;
/** Same value as {@link XP_REWARD_STANDARD}. */
export const XP_REWARD_DEFAULT = XP_REWARD_STANDARD;
/**
 * Extra activity XP when a creativity goal has a linked photo.
 * Applied by {@link xpForGoal}; not a skill and not a client input.
 */
export const XP_CREATIVITY_PHOTO_BONUS = 5;

export interface GoalXpInput {
  sphere?: LifeSphereId;
  /** True when a photo artifact is linked to the goal. */
  photoLinked?: boolean;
}

/**
 * Server rule table for activity XP on a newly assigned reward. Pure.
 *
 * - standard goal (any sphere, or none): {@link XP_REWARD_STANDARD}
 * - creativity goal with a linked photo: standard + {@link XP_CREATIVITY_PHOTO_BONUS}
 *
 * The result is always an integer from 1 to {@link XP_REWARD_MAX}.
 * Skills and mastery are not part of this table.
 */
export function xpForGoal(input: GoalXpInput = {}): number {
  let xp = XP_REWARD_STANDARD;
  if (input.sphere === "creativity" && input.photoLinked) {
    xp += XP_CREATIVITY_PHOTO_BONUS;
  }
  if (xp < 1) return 1;
  if (xp > XP_REWARD_MAX) return XP_REWARD_MAX;
  return xp;
}

/**
 * Activity XP granted the first time a stored goal is completed.
 * Legacy rows are not recomputed with {@link xpForGoal}: a stored reward is granted
 * as saved, except a value above {@link XP_REWARD_MAX} is clamped to that maximum.
 * A creativity goal that still has the standard reward and a linked photo is the
 * one case that moves up to the photo-bonus row before the clamp.
 */
export function xpGrantedForGoal(input: GoalXpInput & { xpReward: number }): number {
  let xp = input.xpReward;
  if (input.photoLinked && input.sphere === "creativity" && xp === XP_REWARD_STANDARD) {
    xp = xpForGoal({ sphere: "creativity", photoLinked: true });
  }
  if (!Number.isFinite(xp)) return 0;
  if (xp > XP_REWARD_MAX) return XP_REWARD_MAX;
  return xp;
}

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
  /**
   * Activity XP granted once on the first completion. The server sets it
   * ({@link xpForGoal}); the client does not. Not a mastery score.
   * A legacy value above {@link XP_REWARD_MAX} is clamped by {@link xpGrantedForGoal}.
   */
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
