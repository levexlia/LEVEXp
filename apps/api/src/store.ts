import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  getLifeSphere,
  levelForXp,
  progressFromProgression,
  AVATAR_URL_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type Goal,
  type LifeSphereId,
  type Player,
  type PlayerProgress,
  type Progression,
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

export interface PlayerUpdate {
  nickname?: string;
  title?: string | null;
  avatarUrl?: string | null;
}

export type PlayerView = Player & { progress: PlayerProgress };

interface StoreFile {
  version: 1;
  player: Player;
  goals: Goal[];
}

// Single player + goals. Null dataFile means in-memory (tests). A path is loaded on
// startup and rewritten after each mutation.
let dataFile: string | null = null;
let goals = new Map<string, Goal>();
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

/** Marks goal done; XP awarded only on the first completion. Returns undefined if not found. */
export function completeGoal(id: string): { goal: Goal; progress: PlayerProgress; awarded: boolean } | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  const awarded = goal.status !== "done";
  if (awarded) {
    goal.status = "done";
    grantXp(goal.xpReward, goal.sphere);
    writeState();
  }
  return { goal, progress: getProgress(), awarded };
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
  player = makePlayer();
  if (seedGoals) {
    for (const demo of DEMO_GOALS) addGoal(demo);
  }
}

function addGoal(input: { title: string; sphere?: LifeSphereId; xpReward?: number }): Goal {
  const goal: Goal = {
    id: randomUUID(),
    title: input.title,
    xpReward: input.xpReward ?? 10,
    status: "open",
  };
  if (input.sphere) goal.sphere = input.sphere;
  goals.set(goal.id, goal);
  return goal;
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

function readState(file: string): { player: Player; goals: Map<string, Goal>; seededPlayer: boolean } {
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

  if (data.player == null) {
    return { player: makePlayer(), goals: loadedGoals, seededPlayer: true };
  }
  return { player: parsePlayer(file, data.player), goals: loadedGoals, seededPlayer: false };
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

function boot(): void {
  // Vitest imports this module. Stay in memory so tests never touch DATA_FILE.
  if (process.env.VITEST) return;
  openStore(process.env.DATA_FILE?.trim() || DEFAULT_DATA_FILE);
}

boot();
