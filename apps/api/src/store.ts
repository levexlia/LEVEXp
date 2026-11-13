import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  getLifeSphere,
  isDisplayableImageUrl,
  levelForXp,
  progressFromProgression,
  xpForGoal,
  xpGrantedForGoal,
  ARTIFACT_IMAGE_URL_MAX_LENGTH,
  ARTIFACT_TITLE_MAX_LENGTH,
  AVATAR_URL_MAX_LENGTH,
  DEFAULT_ARTIFACT_SPHERE,
  NICKNAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  XP_REWARD_STANDARD,
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

const DEMO_GOALS: Array<{ title: string; sphere: LifeSphereId }> = [
  { title: "Morning walk 20 min", sphere: "health" },
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

export class AvatarLimitReached extends Error {
  readonly limit: number;
  readonly used: number;

  constructor(limit: number, used: number) {
    super("daily avatar limit reached");
    this.name = "AvatarLimitReached";
    this.limit = limit;
    this.used = used;
  }
}

export class AvatarCandidateNotFound extends Error {
  constructor() {
    super("candidate not found");
    this.name = "AvatarCandidateNotFound";
  }
}

export interface AvatarCandidateRecord {
  id: string;
  url: string;
  createdAt: string;
  generationId: string;
}

interface AvatarBook {
  /** UTC day `YYYY-MM-DD` the count belongs to. Empty until the first generation. */
  usageDay: string;
  usageCount: number;
  candidates: AvatarCandidateRecord[];
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
  /** Present after the first avatar generation. Older files omit it. */
  avatar?: {
    usage: { day: string; count: number };
    candidates: AvatarCandidateRecord[];
  };
}

interface MemoryState {
  player: Player;
  goals: Map<string, Goal>;
  artifacts: Map<string, Artifact>;
  room: Room;
  avatar: AvatarBook;
}

// Single player, goals, and the virtual room. Null dataFile means in-memory (tests).
// A path is loaded on startup and rewritten after each mutation.
let dataFile: string | null = null;
let goals = new Map<string, Goal>();
let artifacts = new Map<string, Artifact>();
let room: Room = { placements: [] };
let player: Player = makePlayer();
let avatar: AvatarBook = emptyAvatar();

let clock: () => Date = () => new Date();

/** Tests pin the UTC day used by the avatar rate limit. Pass null to restore the real clock. */
export function setClockForTests(fn: (() => Date) | null): void {
  clock = fn ?? (() => new Date());
}

function currentDay(): string {
  return clock().toISOString().slice(0, 10);
}

function emptyAvatar(): AvatarBook {
  return { usageDay: "", usageCount: 0, candidates: [] };
}

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
    const previous = dataFile;
    dataFile = filePath;
    try {
      commitState(freshState(true));
    } catch (err) {
      dataFile = previous;
      throw err;
    }
    return;
  }
  const loaded = readState(filePath);
  const previous = dataFile;
  if (loaded.seededPlayer) {
    dataFile = filePath;
    try {
      commitState({
        player: loaded.player,
        goals: loaded.goals,
        artifacts: loaded.artifacts,
        room: loaded.room,
        avatar: loaded.avatar,
      });
    } catch (err) {
      dataFile = previous;
      throw err;
    }
    return;
  }
  dataFile = filePath;
  player = loaded.player;
  goals = loaded.goals;
  artifacts = loaded.artifacts;
  room = loaded.room;
  avatar = loaded.avatar;
}

/** Replace memory with a new player and, when `seed` is true, the demo goals. Persists when a file is open. */
export function resetStore(seed = true): void {
  commitState(freshState(seed));
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
  // Validate every provided field before mutating. A later failure must not leave earlier fields applied.
  const nickname = patch.nickname === undefined
    ? undefined
    : trimmed(patch.nickname, "nickname", NICKNAME_MAX_LENGTH);
  const title = patch.title === undefined
    ? undefined
    : patch.title === null ? null : trimmed(patch.title, "title", TITLE_MAX_LENGTH);
  const avatarUrl = patch.avatarUrl === undefined
    ? undefined
    : patch.avatarUrl === null ? null : trimmed(patch.avatarUrl, "avatarUrl", AVATAR_URL_MAX_LENGTH);

  if (nickname !== undefined) player.nickname = nickname;
  if (title !== undefined) {
    if (title === null) delete player.title;
    else player.title = title;
  }
  if (avatarUrl !== undefined) {
    if (avatarUrl === null) delete player.avatarUrl;
    else player.avatarUrl = avatarUrl;
  }
  writeState();
  return getPlayer();
}

export interface AvatarQuota {
  day: string;
  limit: number;
  used: number;
  remaining: number;
  candidates: Array<{ id: string; url: string }>;
}

/** Today's usage and the candidates from the latest generation. A new UTC day starts the count over. */
export function avatarQuota(limit: number): AvatarQuota {
  const day = currentDay();
  const used = avatar.usageDay === day ? avatar.usageCount : 0;
  const last = avatar.candidates.at(-1);
  const candidates = last
    ? avatar.candidates.filter((candidate) => candidate.generationId === last.generationId)
    : [];
  return {
    day,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    candidates: candidates.map((candidate) => ({ id: candidate.id, url: candidate.url })),
  };
}

/**
 * Records one successful generation and its candidates. Memory changes only after the file write.
 * Throws {@link AvatarLimitReached} when today's count is already at `limit`.
 */
export function recordAvatarGeneration(input: {
  limit: number;
  candidates: Array<{ id: string; url: string }>;
}): AvatarQuota {
  const day = currentDay();
  const next = cloneState();
  const usedToday = next.avatar.usageDay === day ? next.avatar.usageCount : 0;
  if (usedToday >= input.limit) throw new AvatarLimitReached(input.limit, usedToday);
  const generationId = randomUUID();
  const createdAt = clock().toISOString();
  const stored: AvatarCandidateRecord[] = input.candidates.map((candidate) => ({
    id: candidate.id,
    url: candidate.url,
    createdAt,
    generationId,
  }));
  next.avatar = {
    usageDay: day,
    usageCount: usedToday + 1,
    candidates: [...next.avatar.candidates, ...stored].slice(-48),
  };
  commitState(next);
  return avatarQuota(input.limit);
}

/** Sets `player.avatarUrl` to a stored candidate. Memory changes only after the file write. */
export function selectAvatar(candidateId: string): PlayerView {
  const candidate = avatar.candidates.find((item) => item.id === candidateId);
  if (!candidate || !isDisplayableImageUrl(candidate.url)) throw new AvatarCandidateNotFound();
  const next = cloneState();
  next.player = { ...next.player, avatarUrl: candidate.url };
  commitState(next);
  return getPlayer();
}

export function createGoal(input: { title: string; sphere?: LifeSphereId }): Goal {
  const next = cloneState();
  const goal = makeGoal(input);
  next.goals.set(goal.id, goal);
  commitState(next);
  return goal;
}

/**
 * Marks a goal done. XP is awarded only on the first completion, from the stored
 * reward clamped by {@link xpGrantedForGoal}. A linked creativity photo raises a
 * still-standard reward before that clamp. `artifactId` links a room photo when
 * the goal's sphere is creativity. Returns undefined if the goal is not found.
 * Linking is checked before any XP is granted. Memory changes only after the file write.
 */
export function completeGoal(
  id: string,
  artifactId?: string,
): { goal: Goal; progress: PlayerProgress; awarded: boolean } | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  const artifact = artifactId === undefined ? undefined : requireLinkableArtifact(goal, artifactId);
  const awarded = goal.status !== "done";
  const willLink = artifact !== undefined && artifact.goalId !== goal.id;
  if (!awarded && !willLink) {
    return { goal, progress: getProgress(), awarded: false };
  }

  const next = cloneState();
  const nextGoal = next.goals.get(id)!;
  if (awarded) {
    const photoLinked = willLink || hasLinkedPhoto(next.artifacts, id);
    const amount = xpGrantedForGoal({
      sphere: nextGoal.sphere,
      xpReward: nextGoal.xpReward,
      photoLinked,
    });
    nextGoal.xpReward = amount;
    nextGoal.status = "done";
    next.player = playerWithXp(next.player, amount, nextGoal.sphere);
  }
  if (willLink && artifact) {
    next.artifacts.get(artifact.id)!.goalId = nextGoal.id;
  }
  commitState(next);
  return { goal: goals.get(id)!, progress: getProgress(), awarded };
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
  const title = artifactText(input.title, "title", ARTIFACT_TITLE_MAX_LENGTH);
  const imageUrl = input.imageUrl === undefined
    ? undefined
    : artifactText(input.imageUrl, "imageUrl", ARTIFACT_IMAGE_URL_MAX_LENGTH);
  if (imageUrl !== undefined && !isDisplayableImageUrl(imageUrl)) {
    throw new InvalidArtifact("imageUrl must be an http(s) URL or an /uploads file");
  }

  const next = cloneState();
  const linkedGoal = input.goalId === undefined ? undefined : next.goals.get(input.goalId);
  if (input.goalId !== undefined) {
    if (!linkedGoal) throw new InvalidArtifact("goal not found");
    if (linkedGoal.sphere !== "creativity") throw new InvalidArtifact("goal must be a creativity goal");
  }
  const artifact: Artifact = {
    id: randomUUID(),
    title,
    kind: "photo",
    sphere: DEFAULT_ARTIFACT_SPHERE,
    createdAt: new Date().toISOString(),
  };
  if (imageUrl !== undefined) artifact.imageUrl = imageUrl;
  if (linkedGoal) {
    artifact.goalId = linkedGoal.id;
    // Only the server standard reward grows. Legacy amounts stay put until completion clamps them.
    if (linkedGoal.status === "open" && linkedGoal.xpReward === XP_REWARD_STANDARD) {
      linkedGoal.xpReward = xpForGoal({ sphere: "creativity", photoLinked: true });
    }
  }
  next.artifacts.set(artifact.id, artifact);
  next.room.placements.push({ artifactId: artifact.id });
  commitState(next);
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

function freshState(seedGoals: boolean): MemoryState {
  const next: MemoryState = {
    player: makePlayer(),
    goals: new Map(),
    artifacts: new Map(),
    room: { placements: [] },
    avatar: emptyAvatar(),
  };
  if (seedGoals) {
    for (const demo of DEMO_GOALS) {
      const goal = makeGoal(demo);
      next.goals.set(goal.id, goal);
    }
  }
  return next;
}

function makeGoal(input: { title: string; sphere?: LifeSphereId }): Goal {
  const goal: Goal = {
    id: randomUUID(),
    title: input.title,
    xpReward: xpForGoal({ sphere: input.sphere }),
    status: "open",
  };
  if (input.sphere) goal.sphere = input.sphere;
  return goal;
}

function cloneState(): MemoryState {
  return {
    player: {
      ...player,
      progression: {
        totalXp: player.progression.totalXp,
        level: player.progression.level,
        xpBySphere: { ...player.progression.xpBySphere },
      },
    },
    goals: new Map([...goals].map(([id, goal]) => [id, { ...goal }])),
    artifacts: new Map([...artifacts].map(([id, artifact]) => [id, { ...artifact }])),
    room: { placements: room.placements.map((placement) => ({ ...placement })) },
    avatar: {
      usageDay: avatar.usageDay,
      usageCount: avatar.usageCount,
      candidates: avatar.candidates.map((candidate) => ({ ...candidate })),
    },
  };
}

/** Write `next` first. Memory is replaced only after that write returns. */
function commitState(next: MemoryState): void {
  writeState(snapshotFrom(next));
  player = next.player;
  goals = next.goals;
  artifacts = next.artifacts;
  room = next.room;
  avatar = next.avatar;
}

function hasLinkedPhoto(artifactMap: Map<string, Artifact>, goalId: string): boolean {
  for (const artifact of artifactMap.values()) {
    if (artifact.goalId === goalId) return true;
  }
  return false;
}

function playerWithXp(current: Player, amount: number, sphere?: LifeSphereId): Player {
  const xpBySphere = { ...current.progression.xpBySphere };
  if (sphere) xpBySphere[sphere] = (xpBySphere[sphere] ?? 0) + amount;
  const totalXp = current.progression.totalXp + amount;
  return {
    ...current,
    progression: { totalXp, level: levelForXp(totalXp), xpBySphere },
  };
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
  return snapshotFrom({ player, goals, artifacts, room, avatar });
}

function snapshotFrom(state: MemoryState): StoreFile {
  const progression: Progression = {
    totalXp: state.player.progression.totalXp,
    level: levelForXp(state.player.progression.totalXp),
    xpBySphere: { ...state.player.progression.xpBySphere },
  };
  return {
    version: 1,
    player: {
      id: state.player.id,
      nickname: state.player.nickname,
      createdAt: state.player.createdAt,
      ...(state.player.title !== undefined ? { title: state.player.title } : {}),
      ...(state.player.avatarUrl !== undefined ? { avatarUrl: state.player.avatarUrl } : {}),
      progression,
    },
    goals: [...state.goals.values()].map((goal) => ({ ...goal })),
    artifacts: [...state.artifacts.values()].map((artifact) => ({ ...artifact })),
    room: { placements: state.room.placements.map((placement) => ({ ...placement })) },
    ...(state.avatar.usageCount > 0 || state.avatar.candidates.length > 0
      ? {
        avatar: {
          usage: { day: state.avatar.usageDay, count: state.avatar.usageCount },
          candidates: state.avatar.candidates.map((candidate) => ({ ...candidate })),
        },
      }
      : {}),
  };
}

type StoreWriter = (file: string, contents: string) => void;

function atomicWrite(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, contents, "utf8");
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

let storeWriter: StoreWriter = atomicWrite;

/** Tests replace the writer to simulate a failed save. Pass null to restore the atomic write. */
export function setStoreWriterForTests(writer: StoreWriter | null): void {
  storeWriter = writer ?? atomicWrite;
}

function writeState(fileSnapshot?: StoreFile): void {
  if (!dataFile) return;
  storeWriter(dataFile, `${JSON.stringify(fileSnapshot ?? snapshot(), null, 2)}\n`);
}

function storeError(file: string, detail: string): Error {
  return new Error(`Invalid store file ${file}: ${detail}`);
}

function readState(file: string): {
  player: Player;
  goals: Map<string, Goal>;
  artifacts: Map<string, Artifact>;
  room: Room;
  avatar: AvatarBook;
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
  const loadedAvatar = parseAvatar(file, data.avatar);

  if (data.player == null) {
    return {
      player: makePlayer(),
      goals: loadedGoals,
      artifacts: loadedArtifacts,
      room: loadedRoom,
      avatar: loadedAvatar,
      seededPlayer: true,
    };
  }
  return {
    player: parsePlayer(file, data.player),
    goals: loadedGoals,
    artifacts: loadedArtifacts,
    room: loadedRoom,
    avatar: loadedAvatar,
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

function parseAvatar(file: string, value: unknown): AvatarBook {
  if (value === undefined) return emptyAvatar();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw storeError(file, "invalid avatar");
  const raw = value as Record<string, unknown>;
  if (!raw.usage || typeof raw.usage !== "object" || Array.isArray(raw.usage)) {
    throw storeError(file, "avatar.usage invalid");
  }
  const usage = raw.usage as Record<string, unknown>;
  if (typeof usage.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(usage.day)) {
    throw storeError(file, "avatar.usage.day invalid");
  }
  if (typeof usage.count !== "number" || !Number.isInteger(usage.count) || usage.count < 0) {
    throw storeError(file, "avatar.usage.count invalid");
  }
  if (!Array.isArray(raw.candidates)) throw storeError(file, "avatar.candidates must be an array");
  const seen = new Set<string>();
  const candidates = raw.candidates.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw storeError(file, `invalid avatar candidate at ${index}`);
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 80) {
      throw storeError(file, `avatar candidate ${index} missing id`);
    }
    if (seen.has(candidate.id)) throw storeError(file, `duplicate avatar candidate ${candidate.id}`);
    seen.add(candidate.id);
    if (typeof candidate.url !== "string" || !isDisplayableImageUrl(candidate.url)) {
      throw storeError(file, `avatar candidate ${index} has invalid url`);
    }
    if (typeof candidate.createdAt !== "string" || candidate.createdAt.length === 0) {
      throw storeError(file, `avatar candidate ${index} missing createdAt`);
    }
    if (typeof candidate.generationId !== "string" || candidate.generationId.length === 0) {
      throw storeError(file, `avatar candidate ${index} missing generationId`);
    }
    return {
      id: candidate.id,
      url: candidate.url,
      createdAt: candidate.createdAt,
      generationId: candidate.generationId,
    };
  });
  return { usageDay: usage.day, usageCount: usage.count, candidates };
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
