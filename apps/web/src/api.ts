export interface Player {
  id: string;
  nickname: string;
  title?: string;
  avatarUrl?: string;
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
};

export async function loadRoom(): Promise<RoomData> {
  const [player, goals, room] = await Promise.all([
    getJson<Player>("/player"),
    getJson<Goal[]>("/goals"),
    getJson<{ placements: Placement[] }>("/room"),
  ]);
  return { player, goals, placements: room.placements };
}

export function createGoal(title: string): Promise<Goal> {
  return sendJson<Goal>("/goals", { title, sphere: "creativity" });
}

export function createArtifact(input: { title: string; imageUrl: string; goalId: string }): Promise<Artifact> {
  return sendJson<Artifact>("/artifacts", { title: input.title, kind: "photo", imageUrl: input.imageUrl, goalId: input.goalId });
}

export function completeGoal(id: string): Promise<{ goal: Goal; progress: Player["progress"] }> {
  return sendJson(`/goals/${id}/complete`);
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
    throw new ApiError("Нет связи с API. В другом терминале: npm run dev:api", 0);
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
