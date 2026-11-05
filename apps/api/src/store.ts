import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  getLifeSphere,
  levelForXp,
  progressFromProgression,
  ARTIFACT_IMAGE_URL_MAX_LENGTH,
  ARTIFACT_TITLE_MAX_LENGTH,
  AVATAR_URL_MAX_LENGTH,
  DEFAULT_ARTIFACT_SPHERE,
  NICKNAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  XP_REWARD_DEFAULT,
  XP_REWARD_MAX,
  type Artifact,
  type Goal,
  type LifeSphereId,
  type Player,
  type PlayerProgress,
  type Progression,
  type Room,
} from "@levex/domain";

export const DEFAULT_DATA_FILE = "./data/levexp.json";
export const DEFAULT_PLAYER_NICKNAME = "Player";

const DEMO_GOALS: Array<{ title: string; sphere: LifeSphereId; xpReward?: number }> = [
  { title: "Morning walk 20 min", sphere: "health", xpReward: 15 },
  { title: "Read 10 pages", sphere: "mind" },
];

export class InvalidPlayerUpdate extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlayerUpdate";
  }
}

export class InvalidGoalUpdate extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGoalUpdate";
  }
}

/** A reward edit was sent for a goal that is already done. */
export class GoalAlreadyDone extends Error {
  constructor() {
    super("goal is already done");
    this.name = "GoalAlreadyDone";
  }
}

export class InvalidArtifact extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArtifact";
  }
}

export class ArtifactNotFound extends Error {
  constructor() {
    super("artifact not found");
    this.name = "ArtifactNotFound";
  }
}

export class ArtifactAlreadyLinked extends Error {
  constructor() {
    super("artifact is linked to another goal");
    this.name = "ArtifactAlreadyLinked";
  }
}

export interface PlayerUpdate {
  nickname?: string;
  title?: string | null;
  avatarUrl?: string | null;
}

export type PlayerView = Player & { progress: PlayerProgress };

export interface ArtifactInput {
  title: string;
  kind: string;
  imageUrl?: string;
  goalId?: string;
}

/** Room plus the artifact for each placement, joined at read time. */
export interface RoomView {
  placements: Array<{ artifactId: string; artifact: Artifact }>;
}

interface StoreFile {
  version: 1;
  player: Player;
  goals: Goal[];
  artifacts: Artifact[];
  room: Room;
}

// Single player, goals, and the virtual room. Null dataFile means in-memory (tests).
// A path is loaded on startup and rewritten after each mutation.
let dataFile: string | null = null;
let goals = new Map<string, Goal>();
let artifacts = new Map<string, Artifact>();
let room: Room = { placements: [] };
let player: Player = makePlayer();

export function currentDataFile(): string | null {
  return dataFile;
}

/** Switch persistence. `null` keeps the current memory and stops writing. A path loads that file, or seeds it when missing. */
export function openStore(filePath: string | null): void {
  if (filePath === null) {
    dataFile = null;
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    throw storeError(filePath, "path is a directory");
  }
  if (!existsSync(filePath)) {
    dataFile = filePath;
    seedMemory(true);
    writeState();
    return;
  }
  const loaded = readState(filePath);
  dataFile = filePath;
  player = loaded.player;
  goals = loaded.goals;
  artifacts = loaded.artifacts;
  room = loaded.room;
  if (loaded.seededPlayer) writeState();
}

/** Replace memory with a new player and, when `seed` is true, the demo goals. Persists when a file is open. */
export function resetStore(seed = true): void {
  seedMemory(seed);
  writeState();
}

export const listGoals = (): Goal[] => [...goals.values()];

export function getProgress(): PlayerProgress {
  return progressFromProgression(player.progression);
}

export function getPlayer(): PlayerView {
  const stored = storedPlayer();
  return { ...stored, progress: progressFromProgression(stored.progression) };
}

export function updatePlayer(patch: PlayerUpdate): PlayerView {
  if (patch.nickname !== undefined) {
    player.nickname = trimmed(patch.nickname, "nickname", NICKNAME_MAX_LENGTH);
  }
  if (patch.title !== undefined) {
    if (patch.title === null) delete player.title;
    else player.title = trimmed(patch.title, "title", TITLE_MAX_LENGTH);
  }
  if (patch.avatarUrl !== undefined) {
    if (patch.avatarUrl === null) delete player.avatarUrl;
    else player.avatarUrl = trimmed(patch.avatarUrl, "avatarUrl", AVATAR_URL_MAX_LENGTH);
  }
  writeState();
  return getPlayer();
}

export function createGoal(input: { title: string; sphere?: LifeSphereId; xpReward?: number }): Goal {
  const goal = addGoal(input);
  writeState();
  return goal;
}

/**
 * Sets `xpReward` on an open goal. Returns undefined when the id is missing.
 * Throws {@link GoalAlreadyDone} when the goal is already done, and
 * {@link InvalidGoalUpdate} when the reward is outside 1..{@link XP_REWARD_MAX}.
 */
export function updateGoal(id: string, xpReward: number): Goal | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  if (goal.status !== "open") throw new GoalAlreadyDone();
  assertXpReward(xpReward);
  goal.xpReward = xpReward;
  writeState();
  return goal;
}

/**
 * Marks a goal done. XP is awarded only on the first completion.
 * `artifactId` links a room photo to this goal when the goal's sphere is creativity.
 * Returns undefined if the goal is not found. Linking is checked before any XP is granted.
 */
export function completeGoal(
  id: string,
  artifactId?: string,
): { goal: Goal; progress: PlayerProgress; awarded: boolean } | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  const artifact = artifactId === undefined ? undefined : requireLinkableArtifact(goal, artifactId);
  const awarded = goal.status !== "done";
  if (awarded) {
    goal.status = "done";
    grantXp(goal.xpReward, goal.sphere);
  }
  let linked = false;
  if (artifact && artifact.goalId !== goal.id) {
    artifact.goalId = goal.id;
    linked = true;
  }
  if (awarded || linked) writeState();
  return { goal, progress: getProgress(), awarded };
}

export const listArtifacts = (): Artifact[] => [...artifacts.values()];

export function getRoom(): RoomView {
  return {
    placements: room.placements.map((placement) => {
      const artifact = artifacts.get(placement.artifactId);
      if (!artifact) throw new Error(`missing artifact ${placement.artifactId}`);
      return { artifactId: artifact.id, artifact };
    }),
  };
}

/** Creates a photo and appends it to the room. `goalId` may point at a creativity goal. */
export function createArtifact(input: ArtifactInput): Artifact {
  if (input.kind !== "photo") throw new InvalidArtifact("kind must be photo");
  const artifact: Artifact = {
    id: randomUUID(),
    title: artifactText(input.title, "title", ARTIFACT_TITLE_MAX_LENGTH),
    kind: "photo",
    sphere: DEFAULT_ARTIFACT_SPHERE,
    createdAt: new Date().toISOString(),
  };
  if (input.imageUrl !== undefined) {
    artifact.imageUrl = artifactText(input.imageUrl, "imageUrl", ARTIFACT_IMAGE_URL_MAX_LENGTH);
  }
  if (input.goalId !== undefined) {
    const goal = goals.get(input.goalId);
    if (!goal) throw new InvalidArtifact("goal not found");
    if (goal.sphere !== "creativity") throw new InvalidArtifact("goal must be a creativity goal");
    artifact.goalId = goal.id;
  }
  artifacts.set(artifact.id, artifact);
  room.placements.push({ artifactId: artifact.id });
  writeState();
  return artifact;
}

function makePlayer(): Player {
  return {
    id: randomUUID(),
    nickname: DEFAULT_PLAYER_NICKNAME,
    createdAt: new Date().toISOString(),
    progression: { level: 1, totalXp: 0, xpBySphere: {} },
  };
}

function seedMemory(seedGoals: boolean): void {
  goals = new Map();
  artifacts = new Map();
  room = { placements: [] };
  player = makePlayer();
  if (seedGoals) {
    for (const demo of DEMO_GOALS) addGoal(demo);
  }
}

function addGoal(input: { title: string; sphere?: LifeSphereId; xpReward?: number }): Goal {
  const xpReward = input.xpReward ?? XP_REWARD_DEFAULT;
  assertXpReward(xpReward);
  const goal: Goal = { id: randomUUID(), title: input.title, xpReward, status: "open" };
  if (input.sphere) goal.sphere = input.sphere;
  goals.set(goal.id, goal);
  return goal;
}

function assertXpReward(xpReward: number): void {
  if (!Number.isInteger(xpReward) || xpReward < 1 || xpReward > XP_REWARD_MAX) {
    throw new InvalidGoalUpdate(`xpReward must be an integer from 1 to ${XP_REWARD_MAX}`);
  }
}

function requireLinkableArtifact(goal: Goal, artifactId: string): Artifact {
  const artifact = artifacts.get(artifactId);
  if (!artifact) throw new ArtifactNotFound();
  if (goal.sphere !== "creativity") throw new InvalidGoalUpdate("only a creativity goal can link an artifact");
  if (artifact.goalId !== undefined && artifact.goalId !== goal.id) throw new ArtifactAlreadyLinked();
  return artifact;
}

function artifactText(value: string, label: string, max: number): string {
  const text = value.trim();
  if (text.length < 1 || text.length > max) {
    throw new InvalidArtifact(`${label} must be 1-${max} characters`);
  }
  return text;
}

function grantXp(amount: number, sphere?: LifeSphereId): void {
  const xpBySphere = { ...player.progression.xpBySphere };
  if (sphere) xpBySphere[sphere] = (xpBySphere[sphere] ?? 0) + amount;
  const totalXp = player.progression.totalXp + amount;
  player.progression = { totalXp, level: levelForXp(totalXp), xpBySphere };
}

function trimmed(value: string, label: string, max: number): string {
  const text = value.trim();
  if (text.length < 1 || text.length > max) {
    throw new InvalidPlayerUpdate(`${label} must be 1-${max} characters`);
  }
  return text;
}

function storedPlayer(): Player {
  const progression: Progression = {
    totalXp: player.progression.totalXp,
    level: levelForXp(player.progression.totalXp),
    xpBySphere: { ...player.progression.xpBySphere },
  };
  return {
    id: player.id,
    nickname: player.nickname,
    createdAt: player.createdAt,
    ...(player.title !== undefined ? { title: player.title } : {}),
    ...(player.avatarUrl !== undefined ? { avatarUrl: player.avatarUrl } : {}),
    progression,
  };
}

function snapshot(): StoreFile {
  return {
    version: 1,
    player: storedPlayer(),
    goals: [...goals.values()].map((goal) => ({ ...goal })),
    artifacts: [...artifacts.values()].map((artifact) => ({ ...artifact })),
    room: { placements: room.placements.map((placement) => ({ ...placement })) },
  };
}

function writeState(): void {
  if (!dataFile) return;
  const file = dataFile;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(snapshot(), null, 2)}\n`, "utf8");
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // The original file is still intact; surface the write error.
    }
    throw err;
  }
}

function storeError(file: string, detail: string): Error {
  return new Error(`Invalid store file ${file}: ${detail}`);
}

function readState(file: string): {
  player: Player;
  goals: Map<string, Goal>;
  artifacts: Map<string, Artifact>;
  room: Room;
  seededPlayer: boolean;
} {
  const raw = readFileSync(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw storeError(file, "not JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw storeError(file, "expected an object");
  }
  const data = parsed as Record<string, unknown>;
  if (data.version !== undefined && data.version !== 1) {
    throw storeError(file, `unsupported version ${String(data.version)}`);
  }
  if (!Array.isArray(data.goals)) throw storeError(file, "missing goals");

  const loadedGoals = new Map<string, Goal>();
  data.goals.forEach((value, index) => {
    const goal = parseGoal(file, value, index);
    if (loadedGoals.has(goal.id)) throw storeError(file, `duplicate goal id ${goal.id}`);
    loadedGoals.set(goal.id, goal);
  });

  const loadedArtifacts = parseArtifacts(file, data.artifacts, loadedGoals);
  const loadedRoom = parseRoom(file, data.room, loadedArtifacts);

  if (data.player == null) {
    return {
      player: makePlayer(),
      goals: loadedGoals,
      artifacts: loadedArtifacts,
      room: loadedRoom,
      seededPlayer: true,
    };
  }
  return {
    player: parsePlayer(file, data.player),
    goals: loadedGoals,
    artifacts: loadedArtifacts,
    room: loadedRoom,
    seededPlayer: false,
  };
}

function parsePlayer(file: string, value: unknown): Player {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw storeError(file, "invalid player");
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) throw storeError(file, "player missing id");
  if (typeof raw.nickname !== "string" || raw.nickname.trim().length === 0) {
    throw storeError(file, "player missing nickname");
  }
  if (typeof raw.createdAt !== "string" || raw.createdAt.length === 0) {
    throw storeError(file, "player missing createdAt");
  }
  const parsed: Player = {
    id: raw.id,
    nickname: raw.nickname,
    createdAt: raw.createdAt,
    progression: parseProgression(file, raw.progression),
  };
  if (raw.title != null) {
    if (typeof raw.title !== "string") throw storeError(file, "player title invalid");
    parsed.title = raw.title;
  }
  if (raw.avatarUrl != null) {
    if (typeof raw.avatarUrl !== "string") throw storeError(file, "player avatarUrl invalid");
    parsed.avatarUrl = raw.avatarUrl;
  }
  return parsed;
}

function parseProgression(file: string, value: unknown): Progression {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storeError(file, "player missing progression");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.totalXp !== "number" || !Number.isFinite(raw.totalXp) || raw.totalXp < 0) {
    throw storeError(file, "progression.totalXp must be a non-negative number");
  }
  return {
    totalXp: raw.totalXp,
    level: levelForXp(raw.totalXp),
    xpBySphere: parseXpBySphere(file, raw.xpBySphere),
  };
}

function parseXpBySphere(file: string, value: unknown): Progression["xpBySphere"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storeError(file, "progression.xpBySphere must be an object");
  }
  const xpBySphere: Progression["xpBySphere"] = {};
  for (const [key, xp] of Object.entries(value)) {
    const sphere = getLifeSphere(key);
    if (!sphere) throw storeError(file, `unknown sphere in xpBySphere: ${key}`);
    if (typeof xp !== "number" || !Number.isFinite(xp) || xp < 0) {
      throw storeError(file, `invalid xp for sphere ${key}`);
    }
    xpBySphere[sphere.id] = xp;
  }
  return xpBySphere;
}

function parseGoal(file: string, value: unknown, index: number): Goal {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storeError(file, `invalid goal at ${index}`);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) throw storeError(file, `goal ${index} missing id`);
  if (typeof raw.title !== "string") throw storeError(file, `goal ${index} missing title`);
  if (typeof raw.xpReward !== "number" || !Number.isFinite(raw.xpReward)) {
    throw storeError(file, `goal ${index} has invalid xpReward`);
  }
  if (raw.status !== "open" && raw.status !== "done") throw storeError(file, `goal ${index} has invalid status`);
  const goal: Goal = { id: raw.id, title: raw.title, xpReward: raw.xpReward, status: raw.status };
  if (raw.sphere !== undefined) {
    if (typeof raw.sphere !== "string" || !getLifeSphere(raw.sphere)) {
      throw storeError(file, `goal ${index} has invalid sphere`);
    }
    goal.sphere = raw.sphere as LifeSphereId;
  }
  return goal;
}

function parseArtifacts(
  file: string,
  value: unknown,
  loadedGoals: Map<string, Goal>,
): Map<string, Artifact> {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) throw storeError(file, "artifacts must be an array");
  const loaded = new Map<string, Artifact>();
  value.forEach((entry, index) => {
    const artifact = parseArtifact(file, entry, index, loadedGoals);
    if (loaded.has(artifact.id)) throw storeError(file, `duplicate artifact id ${artifact.id}`);
    loaded.set(artifact.id, artifact);
  });
  return loaded;
}

function parseArtifact(
  file: string,
  value: unknown,
  index: number,
  loadedGoals: Map<string, Goal>,
): Artifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storeError(file, `invalid artifact at ${index}`);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) throw storeError(file, `artifact ${index} missing id`);
  if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
    throw storeError(file, `artifact ${index} missing title`);
  }
  if (raw.kind !== "photo") throw storeError(file, `artifact ${index} has invalid kind`);
  if (typeof raw.createdAt !== "string" || raw.createdAt.length === 0) {
    throw storeError(file, `artifact ${index} missing createdAt`);
  }
  const sphere = raw.sphere === undefined ? DEFAULT_ARTIFACT_SPHERE : raw.sphere;
  if (typeof sphere !== "string" || !getLifeSphere(sphere)) {
    throw storeError(file, `artifact ${index} has invalid sphere`);
  }
  const artifact: Artifact = {
    id: raw.id,
    title: raw.title,
    kind: "photo",
    sphere: sphere as LifeSphereId,
    createdAt: raw.createdAt,
  };
  if (raw.imageUrl !== undefined) {
    if (typeof raw.imageUrl !== "string" || raw.imageUrl.trim().length === 0) {
      throw storeError(file, `artifact ${index} has invalid imageUrl`);
    }
    artifact.imageUrl = raw.imageUrl;
  }
  if (raw.goalId !== undefined) {
    if (typeof raw.goalId !== "string" || !loadedGoals.has(raw.goalId)) {
      throw storeError(file, `artifact ${index} has invalid goalId`);
    }
    const goal = loadedGoals.get(raw.goalId);
    if (!goal || goal.sphere !== "creativity") {
      throw storeError(file, `artifact ${index} goal is not creativity`);
    }
    artifact.goalId = raw.goalId;
  }
  return artifact;
}

function parseRoom(file: string, value: unknown, loadedArtifacts: Map<string, Artifact>): Room {
  if (value === undefined) {
    if (loadedArtifacts.size > 0) throw storeError(file, "every artifact must be placed in the room");
    return { placements: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw storeError(file, "invalid room");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.placements)) throw storeError(file, "room.placements must be an array");
  const seen = new Set<string>();
  const placements = raw.placements.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw storeError(file, `invalid placement at ${index}`);
    }
    const placement = entry as Record<string, unknown>;
    if (typeof placement.artifactId !== "string" || !loadedArtifacts.has(placement.artifactId)) {
      throw storeError(file, `placement ${index} has invalid artifactId`);
    }
    if (seen.has(placement.artifactId)) throw storeError(file, `duplicate placement ${placement.artifactId}`);
    seen.add(placement.artifactId);
    return { artifactId: placement.artifactId };
  });
  if (seen.size !== loadedArtifacts.size) throw storeError(file, "every artifact must be placed in the room");
  return { placements };
}

function boot(): void {
  // Vitest imports this module. Stay in memory so tests never touch DATA_FILE.
  if (process.env.VITEST) return;
  openStore(process.env.DATA_FILE?.trim() || DEFAULT_DATA_FILE);
}

boot();
