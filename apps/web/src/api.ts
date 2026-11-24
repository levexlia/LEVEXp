import type { AssistantReply, AssistantTurn, AvatarConfig, NoXpReason, Reflection, ReflectionFeeling } from "@levex/domain";

export type { AssistantReply, AssistantTurn, AvatarConfig };

export interface Player {
  id: string;
  nickname: string;
  title?: string;
  avatarUrl?: string;
  avatarConfig?: AvatarConfig;
  streak?: number;
  energy?: { current: number; max: number };
  /** Today's XP count by the daily rules (player day in Asia/Jerusalem). */
  today?: TodayAwards;
  progress: {
    xp: number;
    level: number;
    xpBySphere: Partial<Record<string, number>>;
  };
}

export interface Goal {
  id: string;
  title: string;
  sphere?: string;
  xpReward: number;
  status: "open" | "done";
  completedAt?: string;
  /** XP really granted at completion; 0 = recorded without XP (daily rules). Missing on old goals. */
  xpGranted?: number;
  noXpReason?: NoXpReason;
  templateId?: string;
  repeatOf?: string;
  /** Player day from which «Сегодня» shows it (a «Повторить завтра» copy). */
  availableFrom?: string;
  reflection?: Reflection;
  /** «Отменить» (scene18): today's record was taken back at this time; the goal is open again. */
  undoneAt?: string;
}

export interface UndoAnswer {
  goal: Goal;
  progress: Player["progress"];
  /** XP taken back: exactly what the record granted (0 for a record without XP). */
  removedXp: number;
  awardedToday: number;
  awardCap: number;
}

export interface TodayAwards {
  day: string;
  awarded: number;
  awardCap: number;
  ownAwarded: number;
  ownAwardCap: number;
}

export interface CompleteAnswer {
  goal: Goal;
  progress: Player["progress"];
  awarded: boolean;
  reason?: NoXpReason;
  /** Calm Russian text when the completion was recorded without XP. */
  message?: string;
  awardedToday: number;
  awardCap: number;
}

export interface Artifact {
  id: string;
  title: string;
  kind: "photo";
  imageUrl?: string;
  goalId?: string;
  sphere: string;
}

export interface Placement {
  artifactId: string;
  artifact: Artifact;
}

export interface RoomData {
  player: Player;
  goals: Goal[];
  placements: Placement[];
}

export interface AvatarCandidate {
  id: string;
  url: string;
}

export interface AvatarStatus {
  provider: "mock" | "openai" | "xai";
  limit: number;
  used: number;
  remaining: number;
  candidates: AvatarCandidate[];
  looks?: AvatarConfig[];
  sourceUrl?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const KNOWN: Record<string, string> = {
  "file is required": "Выберите файл",
  "file is empty": "Файл пустой",
  "file is too large": "Файл больше 5 МБ",
  "file must be a png, jpeg, gif, or webp image": "Нужна картинка PNG, JPEG, GIF или WebP",
  "file must be a png, jpeg, or webp image": "Нужна картинка PNG, JPEG или WebP",
  "expected multipart file": "Сервер ждал файл",
  "goal not found": "Цель не найдена",
  "artifact not found": "Фото не найдено",
  "goal must be a creativity goal": "Фото можно привязать только к цели творчества",
  "imageUrl must be an http(s) URL or an /uploads file": "Нужна ссылка http(s) или адрес загруженного файла",
  "consent is required": "Нужно согласие: на фото должен быть реальный человек",
  "daily avatar limit reached": "Лимит генераций на сегодня исчерпан",
  "avatar provider failed": "Не удалось нарисовать персонажа. Попробуйте ещё раз",
  "candidate not found": "Этот вариант уже недоступен",
  "could not save avatar": "Не удалось сохранить персонажа. Попробуйте ещё раз",
  "nickname must be 1-32 characters": "Ник: от 1 до 32 символов",
  "only an open mission can be deleted": "Выполненную миссию удалить нельзя: она уже в истории",
};

export const NO_CONNECTION = "Нет связи с API. В другом терминале: npm run dev:api";

export async function loadRoom(): Promise<RoomData> {
  const [player, goals, room] = await Promise.all([
    getJson<Player>("/player"),
    getJson<Goal[]>("/goals"),
    getJson<{ placements: Placement[] }>("/room"),
  ]);
  return { player, goals, placements: room.placements };
}

export function createGoal(title: string, sphere = "creativity"): Promise<Goal> {
  return sendJson<Goal>("/goals", { title, sphere });
}

/** «Повторить завтра» (forTomorrow) or a plan chip for today: a copy of a goal. */
export function repeatGoal(goalId: string, forTomorrow: boolean): Promise<Goal> {
  return sendJson<Goal>("/goals", { repeatOf: goalId, forTomorrow });
}

/** Remove an open mission (also the «Отменить» after «Повторить завтра»). XP does not change. */
export async function deleteGoal(goalId: string): Promise<void> {
  await request<null>(`/goals/${goalId}`, { method: "DELETE" });
}

/** Plan chip for a template that has no goal yet (a seed). */
export function goalFromTemplate(templateId: string): Promise<Goal> {
  return sendJson<Goal>("/goals", { templateId });
}

/** Micro-reflection after a mission. Does not change XP. */
export function saveReflection(goalId: string, felt: ReflectionFeeling, note: string): Promise<Goal> {
  const body: { felt: ReflectionFeeling; note?: string } = { felt };
  if (note.trim()) body.note = note.trim();
  return sendJson<Goal>(`/goals/${goalId}/reflection`, body);
}

export function saveAvatar(config: AvatarConfig): Promise<Player> {
  return request<Player>("/player/avatar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
}

/** PATCH /player with a new nickname (1–32 characters after trimming, checked by the server too). */
export function updateNickname(nickname: string): Promise<Player> {
  return request<Player>("/player", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
}

/**
 * Take a player the server sent back after a change. Streak and energy are derived from
 * completions; an answer without them keeps the ones we had instead of showing 0 and 50/50.
 */
export function mergePlayer(previous: Player | null, next: Player): Player {
  return {
    ...next,
    streak: next.streak ?? previous?.streak,
    energy: next.energy ?? previous?.energy,
    today: next.today ?? previous?.today,
  };
}

export function createArtifact(input: { title: string; imageUrl: string; goalId: string }): Promise<Artifact> {
  return sendJson<Artifact>("/artifacts", { title: input.title, kind: "photo", imageUrl: input.imageUrl, goalId: input.goalId });
}

export function completeGoal(id: string): Promise<CompleteAnswer> {
  return sendJson(`/goals/${id}/complete`);
}

/** scene18 «Отменить»: takes back today's record (its XP, cap slot and template mark). */
export function undoGoal(id: string): Promise<UndoAnswer> {
  return sendJson(`/goals/${id}/undo`);
}

export function loadAvatar(): Promise<AvatarStatus> {
  return getJson<AvatarStatus>("/avatar");
}

export function generateAvatar(file: File, consent: boolean, keepOriginal: boolean): Promise<AvatarStatus> {
  const body = new FormData();
  body.append("file", file);
  body.append("consent", consent ? "true" : "false");
  if (keepOriginal) body.append("keepOriginal", "true");
  return request<AvatarStatus>("/avatar/generate", { method: "POST", body });
}

export function selectAvatar(candidateId: string): Promise<Player> {
  return sendJson<Player>("/avatar/select", { candidateId });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Что-то пошло не так";
}

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const saved = await request<{ url: string }>("/uploads", { method: "POST", body });
  return saved.url;
}

async function getJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

async function sendJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(NO_CONNECTION, 0);
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw new ApiError(translate(readError(payload) ?? "Запрос не выполнен"), response.status);
  }
  return payload as T;
}

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error !== "Bad Request") return record.error;
  if (typeof record.message === "string") return record.message;
  return null;
}

function translate(message: string): string {
  const known = KNOWN[message];
  if (known) return known;
  if (message.includes("must be") || message.startsWith("body")) return "Проверьте поля формы";
  return message;
}

/** Ask the AI assistant. The server adds the player's context itself; the client sends only the chat. */
export function askAssistant(message: string, history: AssistantTurn[], signal?: AbortSignal): Promise<AssistantReply> {
  return request<AssistantReply>("/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });
}
