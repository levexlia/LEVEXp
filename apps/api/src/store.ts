import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  activeOwnCount,
  activeOwnLimitMessage,
  ACTIVE_OWN_MISSIONS_MAX,
  awardDecision,
  dailyLedger,
  getLifeSphere,
  isSeedTemplateId,
  lockedPlaceFor,
  noXpMessage,
  placeLockedMessage,
  playerDay,
  shiftDay,
  templateKeyOf,
  OWN_TEMPLATE_PREFIX,
  REFLECTION_FEELINGS,
  REFLECTION_NOTE_MAX,
  SEED_TEMPLATES,
  type DailyLedger,
  type NoXpReason,
  type Reflection,
  type ReflectionFeeling,
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
  normalizeAvatarConfig,
  parseAvatarConfig,
  type Player,
  type PlayerProgress,
  type Progression,
  type Room,
} from "@levex/domain";

export const DEFAULT_DATA_FILE = "./data/levexp.json";
export const DEFAULT_PLAYER_NICKNAME = "Игрок";

/** Seeds carry their fixed template id (R-XP-10). */
const DEMO_GOALS: Array<{ title: string; sphere: LifeSphereId; templateId: string }> = SEED_TEMPLATES.map((template) => ({
  title: template.title,
  sphere: template.sphere,
  templateId: template.id,
}));

/**
 * Text the store used to seed in English. On load these exact strings are replaced by the Russian
 * ones; ids, statuses, rewards, dates and XP stay as they are. Other titles and nicknames are untouched.
 */
export const LEGACY_SEED_TEXT = {
  nickname: { from: "Player", to: DEFAULT_PLAYER_NICKNAME },
  goals: new Map<string, string>([
    ["Morning walk 20 min", "Утренняя прогулка 20 мин"],
    ["Read 10 pages", "Прочитать 10 страниц"],
  ]),
} as const;

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

/** Too many open own missions. The message is the Russian text the UI shows. */
export class GoalLimitReached extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalLimitReached";
  }
}

/** Only open goals can be removed: a done one is part of the record and of the XP history. */
export class GoalNotOpen extends Error {
  constructor() {
    super("only an open mission can be deleted");
    this.name = "GoalNotOpen";
  }
}

/**
 * Removes an open goal (it gave no XP, so progress does not change). Used by «Удалить» and by the
 * «Отменить» after «Повторить завтра». Returns false when the goal is not found.
 */
export function deleteGoal(id: string): boolean {
  const goal = goals.get(id);
  if (!goal) return false;
  if (goal.status !== "open") throw new GoalNotOpen();
  const next = cloneState();
  next.goals.delete(id);
  for (const artifact of next.artifacts.values()) {
    if (artifact.goalId === id) delete artifact.goalId;
  }
  commitState(next);
  return true;
}

/** R-XP-8: the goal's map place is still locked. The message is the Russian text the UI shows. */
export class PlaceLocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaceLocked";
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

let unlockLevelForTests: number | null = null;

/**
 * Tests of photo and save mechanics that predate R-XP-8 open every place without changing XP numbers.
 * Pass null to go back to the real level. Never used by the server.
 */
export function setUnlockLevelForTests(level: number | null): void {
  unlockLevelForTests = level;
}

/** Level used for the locked-place rule (R-XP-8). */
function placeLevel(totalXp: number): number {
  return Math.max(levelForXp(totalXp), unlockLevelForTests ?? 0);
}

/** Tests pin the UTC day used by the avatar rate limit. Pass null to restore the real clock. */
export function setClockForTests(fn: (() => Date) | null): void {
  clock = fn ?? (() => new Date());
}

function currentDay(): string {
  return clock().toISOString().slice(0, 10);
}

/** The clock used for streaks, energy, and the avatar day limit. */
export function currentTime(): Date {
  return clock();
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
  if (loaded.seededPlayer || loaded.migrated) {
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

export class InvalidAvatarConfig extends Error {
  constructor() {
    super("avatar config is invalid");
    this.name = "InvalidAvatarConfig";
  }
}

/** Replaces the vector look. Memory changes only after the file write. */
export function setAvatarConfig(value: unknown): PlayerView {
  const config = parseAvatarConfig(value);
  if (!config) throw new InvalidAvatarConfig();
  const next = cloneState();
  next.player = { ...next.player, avatarConfig: config };
  commitState(next);
  return getPlayer();
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

export interface GoalInput {
  title?: string;
  sphere?: LifeSphereId;
  /** `seed-walk`, `seed-read` or an `own:<goal id>` template that already exists. */
  templateId?: string;
  /** «Повторить завтра» / plan chip: copy this goal (title, sphere, template). */
  repeatOf?: string;
  /** Show the copy in «Сегодня» from the next player day. */
  forTomorrow?: boolean;
}

/**
 * Creates an open goal. Returns `created: false` with the existing goal when the same template is
 * already open for that day (a double tap on «Да, на завтра» makes one copy).
 * Throws {@link PlaceLocked} for a sphere whose map place is locked (R-XP-8) and
 * {@link InvalidGoalUpdate} for a bad template or source.
 */
export function createGoal(input: GoalInput): Goal;
export function createGoal(input: GoalInput, withFlag: true): { goal: Goal; created: boolean };
export function createGoal(input: GoalInput, withFlag?: true): Goal | { goal: Goal; created: boolean } {
  let title = input.title?.trim();
  let sphere = input.sphere;
  let templateId: string | undefined;
  let repeatOf: string | undefined;
  if (input.repeatOf !== undefined) {
    const source = goals.get(input.repeatOf);
    if (!source) throw new InvalidGoalUpdate("repeatOf goal not found");
    if (sphere !== undefined && sphere !== source.sphere) throw new InvalidGoalUpdate("sphere does not match repeatOf");
    title = source.title;
    sphere = source.sphere;
    repeatOf = source.id;
    // R-XP-9: a seed (or a copy of one) keeps its template; an own mission becomes the template own:<id>.
    templateId = templateKeyOf(source) ?? `${OWN_TEMPLATE_PREFIX}${source.id}`;
    if (input.templateId !== undefined && input.templateId !== templateId) {
      throw new InvalidGoalUpdate("templateId does not match repeatOf");
    }
  } else if (input.templateId !== undefined) {
    const template = templateSource(input.templateId);
    if (!template) throw new InvalidGoalUpdate("unknown templateId");
    if (sphere !== undefined && sphere !== template.sphere) throw new InvalidGoalUpdate("sphere does not match templateId");
    title = template.title;
    sphere = template.sphere;
    templateId = input.templateId;
  }
  if (!title) throw new InvalidGoalUpdate("title is required");
  // Own missions: at most ACTIVE_OWN_MISSIONS_MAX open at once (repeats and seeds are templates, not counted).
  if (templateId === undefined && activeOwnCount([...goals.values()]) >= ACTIVE_OWN_MISSIONS_MAX) {
    throw new GoalLimitReached(activeOwnLimitMessage());
  }
  const locked = lockedPlaceFor(sphere, placeLevel(player.progression.totalXp));
  if (locked) throw new PlaceLocked(placeLockedMessage(locked));
  const availableFrom = input.forTomorrow ? shiftDay(playerDay(clock()), 1) : undefined;
  if (templateId !== undefined) {
    const day = availableFrom ?? playerDay(clock());
    const twin = [...goals.values()].find((goal) =>
      goal.status === "open" && templateKeyOf(goal) === templateId && (goal.availableFrom ?? day) === day);
    if (twin) return withFlag ? { goal: twin, created: false } : twin;
  }
  const next = cloneState();
  const goal = makeGoal({ title, sphere, templateId, repeatOf, availableFrom });
  next.goals.set(goal.id, goal);
  commitState(next);
  return withFlag ? { goal, created: true } : goal;
}

/** Title and sphere behind a template id the client may send. */
function templateSource(id: string): { title: string; sphere?: LifeSphereId } | undefined {
  if (isSeedTemplateId(id)) return SEED_TEMPLATES.find((template) => template.id === id);
  if (!id.startsWith(OWN_TEMPLATE_PREFIX)) return undefined;
  const origin = goals.get(id.slice(OWN_TEMPLATE_PREFIX.length));
  if (!origin || templateKeyOf(origin) !== null) return undefined;
  return { title: origin.title, sphere: origin.sphere };
}

/** Today's XP count for this player (R-XP-6/7), for GET /player and the complete answer. */
export function todayAwards(): { day: string; awarded: number; awardCap: number; ownAwarded: number; ownAwardCap: number } {
  return publicLedger(dailyLedger(listGoals(), clock()));
}

function publicLedger(ledger: DailyLedger) {
  return {
    day: ledger.day,
    awarded: ledger.awarded,
    awardCap: ledger.awardCap,
    ownAwarded: ledger.ownAwarded,
    ownAwardCap: ledger.ownAwardCap,
  };
}

export interface CompleteResult {
  goal: Goal;
  progress: PlayerProgress;
  awarded: boolean;
  /** Set when a first completion gave no XP (R-XP-6/7/10). */
  reason?: NoXpReason;
  message?: string;
  today: ReturnType<typeof todayAwards>;
}

/** Saves how a done mission went. XP, level and the map do not change. */
export function saveReflection(id: string, input: { felt: string; note?: string }): Goal | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  if (goal.status !== "done") throw new InvalidGoalUpdate("goal is not done");
  if (!(REFLECTION_FEELINGS as readonly string[]).includes(input.felt)) throw new InvalidGoalUpdate("felt must be easy, ok or hard");
  const note = input.note?.trim();
  if (note !== undefined && note.length > REFLECTION_NOTE_MAX) {
    throw new InvalidGoalUpdate(`note must be at most ${REFLECTION_NOTE_MAX} characters`);
  }
  const next = cloneState();
  const reflection: Reflection = { felt: input.felt as ReflectionFeeling, at: clock().toISOString() };
  if (note) reflection.note = note;
  next.goals.get(id)!.reflection = reflection;
  commitState(next);
  return goals.get(id)!;
}

/**
 * Marks a goal done. XP is awarded only on the first completion, from the stored
 * reward clamped by {@link xpGrantedForGoal}. A linked creativity photo raises a
 * still-standard reward before that clamp. `artifactId` links a room photo when
 * the goal's sphere is creativity. Returns undefined if the goal is not found.
 * Linking is checked before any XP is granted. Memory changes only after the file write.
 */
export function completeGoal(id: string, artifactId?: string): CompleteResult | undefined {
  const goal = goals.get(id);
  if (!goal) return undefined;
  const first = goal.status !== "done";
  if (first) {
    // R-XP-8: an open goal in a locked place is neither closed nor paid. Old done goals stay as they are.
    const locked = lockedPlaceFor(goal.sphere, placeLevel(player.progression.totalXp));
    if (locked) throw new PlaceLocked(placeLockedMessage(locked));
  }
  const artifact = artifactId === undefined ? undefined : requireLinkableArtifact(goal, artifactId);
  const willLink = artifact !== undefined && artifact.goalId !== goal.id;
  if (!first && !willLink) {
    return { goal, progress: getProgress(), awarded: false, today: todayAwards() };
  }

  const next = cloneState();
  const nextGoal = next.goals.get(id)!;
  let awarded = false;
  let reason: NoXpReason | undefined;
  if (first) {
    const decision = awardDecision(nextGoal, dailyLedger([...next.goals.values()], clock()));
    nextGoal.status = "done";
    nextGoal.completedAt = clock().toISOString();
    if (decision.award) {
      const photoLinked = willLink || hasLinkedPhoto(next.artifacts, id);
      const amount = xpGrantedForGoal({
        sphere: nextGoal.sphere,
        xpReward: nextGoal.xpReward,
        photoLinked,
      });
      nextGoal.xpReward = amount;
      nextGoal.xpGranted = amount;
      next.player = playerWithXp(next.player, amount, nextGoal.sphere);
      awarded = true;
    } else {
      // R-XP-6/7/10: recorded as done (journal, streak), totalXp / xpBySphere / level unchanged.
      nextGoal.xpGranted = 0;
      nextGoal.noXpReason = decision.reason;
      reason = decision.reason;
    }
  }
  if (willLink && artifact) {
    next.artifacts.get(artifact.id)!.goalId = nextGoal.id;
  }
  commitState(next);
  const saved = goals.get(id)!;
  const result: CompleteResult = { goal: saved, progress: getProgress(), awarded, today: todayAwards() };
  if (reason) {
    result.reason = reason;
    result.message = noXpMessage(reason, { title: saved.title });
  }
  return result;
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
    // R-XP-8: no photo for a mission of a locked Мастерская.
    const locked = lockedPlaceFor(linkedGoal.sphere, placeLevel(next.player.progression.totalXp));
    if (locked) throw new InvalidArtifact(placeLockedMessage(locked));
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

function makeGoal(input: {
  title: string;
  sphere?: LifeSphereId;
  templateId?: string;
  repeatOf?: string;
  availableFrom?: string;
}): Goal {
  const goal: Goal = {
    id: randomUUID(),
    title: input.title,
    xpReward: xpForGoal({ sphere: input.sphere }),
    status: "open",
  };
  if (input.sphere) goal.sphere = input.sphere;
  if (input.templateId) goal.templateId = input.templateId;
  if (input.repeatOf) goal.repeatOf = input.repeatOf;
  if (input.availableFrom) goal.availableFrom = input.availableFrom;
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
    goals: new Map([...goals].map(([id, goal]) => [id, cloneGoal(goal)])),
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

function cloneGoal(goal: Goal): Goal {
  return goal.reflection ? { ...goal, reflection: { ...goal.reflection } } : { ...goal };
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
    ...(player.avatarConfig !== undefined ? { avatarConfig: { ...player.avatarConfig } } : {}),
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
      ...(state.player.avatarConfig !== undefined ? { avatarConfig: { ...state.player.avatarConfig } } : {}),
      progression,
    },
    goals: [...state.goals.values()].map(cloneGoal),
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
  migrated: boolean;
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

  let migrated = false;
  for (const goal of loadedGoals.values()) {
    const title = LEGACY_SEED_TEXT.goals.get(goal.title);
    if (title) {
      goal.title = title;
      migrated = true;
    }
  }

  if (data.player == null) {
    return {
      player: makePlayer(),
      goals: loadedGoals,
      artifacts: loadedArtifacts,
      room: loadedRoom,
      avatar: loadedAvatar,
      seededPlayer: true,
      migrated,
    };
  }
  const loadedPlayer = parsePlayer(file, data.player);
  if (loadedPlayer.nickname === LEGACY_SEED_TEXT.nickname.from) {
    loadedPlayer.nickname = LEGACY_SEED_TEXT.nickname.to;
    migrated = true;
  }
  return {
    player: loadedPlayer,
    goals: loadedGoals,
    artifacts: loadedArtifacts,
    room: loadedRoom,
    avatar: loadedAvatar,
    seededPlayer: false,
    migrated,
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
  if (raw.avatarConfig != null) {
    const config = normalizeAvatarConfig(raw.avatarConfig);
    if (!config) throw storeError(file, "player avatarConfig invalid");
    parsed.avatarConfig = config;
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
  if (raw.completedAt !== undefined) {
    if (typeof raw.completedAt !== "string" || raw.completedAt.length === 0) {
      throw storeError(file, `goal ${index} has invalid completedAt`);
    }
    goal.completedAt = raw.completedAt;
  }
  if (raw.sphere !== undefined) {
    if (typeof raw.sphere !== "string" || !getLifeSphere(raw.sphere)) {
      throw storeError(file, `goal ${index} has invalid sphere`);
    }
    goal.sphere = raw.sphere as LifeSphereId;
  }
  // Fields of the daily rules (24.11.2026). Older files omit them; nothing is recalculated.
  for (const key of ["templateId", "repeatOf", "availableFrom"] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "string" || (raw[key] as string).length === 0) throw storeError(file, `goal ${index} has invalid ${key}`);
    goal[key] = raw[key] as string;
  }
  if (raw.xpGranted !== undefined) {
    if (typeof raw.xpGranted !== "number" || !Number.isFinite(raw.xpGranted) || raw.xpGranted < 0) {
      throw storeError(file, `goal ${index} has invalid xpGranted`);
    }
    goal.xpGranted = raw.xpGranted;
  }
  if (raw.noXpReason !== undefined) {
    if (raw.noXpReason !== "daily_cap" && raw.noXpReason !== "own_cap" && raw.noXpReason !== "template_already_awarded") {
      throw storeError(file, `goal ${index} has invalid noXpReason`);
    }
    goal.noXpReason = raw.noXpReason;
  }
  if (raw.reflection !== undefined) {
    const r = raw.reflection as Record<string, unknown> | null;
    if (!r || typeof r !== "object" || !(REFLECTION_FEELINGS as readonly unknown[]).includes(r.felt) || typeof r.at !== "string") {
      throw storeError(file, `goal ${index} has invalid reflection`);
    }
    goal.reflection = { felt: r.felt as ReflectionFeeling, at: r.at };
    if (typeof r.note === "string" && r.note.length > 0) goal.reflection.note = r.note;
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
