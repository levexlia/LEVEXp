import { createReadStream } from "node:fs";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import {
  ARTIFACT_IMAGE_URL_MAX_LENGTH,
  ARTIFACT_KINDS,
  ARTIFACT_TITLE_MAX_LENGTH,
  ACCESSORIES,
  AVATAR_URL_MAX_LENGTH,
  EXPRESSIONS,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
  getLifeSphere,
  LIFE_SPHERE_IDS,
  listLifeSpheres,
  NICKNAME_MAX_LENGTH,
  REFLECTION_FEELINGS,
  REFLECTION_NOTE_MAX,
  TITLE_MAX_LENGTH,
} from "@levex/domain";
import {
  ArtifactAlreadyLinked,
  ArtifactNotFound,
  completeGoal,
  createArtifact,
  createGoal,
  getPlayer,
  getProgress,
  getRoom,
  InvalidArtifact,
  InvalidAvatarConfig,
  InvalidGoalUpdate,
  InvalidPlayerUpdate,
  listArtifacts,
  listGoals,
  deleteGoal,
  GoalLimitReached,
  GoalNotOpen,
  GoalNotDone,
  UndoPastDay,
  undoGoal,
  PlaceLocked,
  saveReflection,
  setAvatarConfig,
  updatePlayer,
  type ArtifactInput,
} from "./store.js";
import {
  defaultUploadsDir,
  InvalidUpload,
  resolveUpload,
  saveImageUpload,
  UPLOAD_MAX_BYTES,
} from "./uploads.js";
import { playerView } from "./playerView.js";
import { registerAvatarRoutes } from "./avatar/routes.js";
import type { AvatarGenerator } from "./avatar/generator.js";
import { registerAssistantRoutes, type AssistantOptions } from "./assistant/routes.js";

export function buildApp(opts: {
  logger?: boolean;
  uploadsDir?: string;
  maxUploadBytes?: number;
  avatarGenerator?: AvatarGenerator;
  avatarDailyLimit?: number;
  avatarCandidateCount?: number;
  assistant?: AssistantOptions;
} = {}) {
  const app = Fastify({
    logger: opts.logger ?? true,
    // Default Ajv removes unknown fields. Reject them so additionalProperties: false means 400.
    ajv: { customOptions: { removeAdditional: false } },
  });
  const maxUploadBytes = opts.maxUploadBytes ?? UPLOAD_MAX_BYTES;
  // fastify-plugin: the multipart parser is visible to the routes on this instance.
  app.register(multipart, {
    limits: { fileSize: maxUploadBytes, files: 1 },
  });

  const uploadsDir = (): string => opts.uploadsDir ?? defaultUploadsDir();

  registerAvatarRoutes(app, {
    uploadsDir,
    maxUploadBytes,
    generator: opts.avatarGenerator,
    dailyLimit: opts.avatarDailyLimit,
    candidateCount: opts.avatarCandidateCount,
  });

  registerAssistantRoutes(app, opts.assistant);

  app.get("/health", async () => ({ status: "ok", service: "levex-api" }));

  app.post("/uploads", async (req, reply) => {
    try {
      const part = await req.file();
      if (!part) return reply.code(400).send({ error: "file is required" });
      const bytes = await part.toBuffer();
      if (part.file.truncated || bytes.length > maxUploadBytes) {
        return reply.code(400).send({ error: "file is too large" });
      }
      const saved = saveImageUpload(uploadsDir(), bytes);
      return reply.code(201).send({ url: saved.url });
    } catch (err) {
      const message = uploadError(err);
      if (message) return reply.code(400).send({ error: message });
      throw err;
    }
  });

  app.get<{ Params: { name: string } }>("/uploads/:name", async (req, reply) => {
    const found = resolveUpload(uploadsDir(), req.params.name);
    if (found === "bad-name") return reply.code(400).send({ error: "invalid upload name" });
    if (found === "missing") return reply.code(404).send({ error: "upload not found" });
    return reply
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "public, max-age=31536000, immutable")
      .type(found.mediaType)
      .send(createReadStream(found.filePath));
  });

  app.get("/spheres", async () => listLifeSpheres());

  app.get<{ Params: { id: string } }>("/spheres/:id", async (req, reply) => {
    const sphere = getLifeSphere(req.params.id);
    if (!sphere) return reply.code(404).send({ error: "sphere not found" });
    return sphere;
  });

  app.get("/goals", async () => listGoals());

  app.post("/goals", {
    preValidation: async (req, reply) => {
      if (bodyHasXpReward(req.body)) {
        return reply.code(400).send({ error: "xpReward is set by the server" });
      }
    },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        // A new mission needs a title; a repeat or a template copy takes it from its source.
        anyOf: [{ required: ["title"] }, { required: ["repeatOf"] }, { required: ["templateId"] }],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          sphere: { type: "string", enum: [...LIFE_SPHERE_IDS] },
          templateId: { type: "string", minLength: 1, maxLength: 80 },
          repeatOf: { type: "string", minLength: 1, maxLength: 80 },
          forTomorrow: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { goal, created } = createGoal(req.body as Parameters<typeof createGoal>[0], true);
      return reply.code(created ? 201 : 200).send(goal);
    } catch (err) {
      if (err instanceof InvalidGoalUpdate || err instanceof PlaceLocked) return reply.code(400).send({ error: err.message });
      if (err instanceof GoalLimitReached) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Open missions only; a done one stays in the record (409). XP never changes here.
  app.delete<{ Params: { id: string } }>("/goals/:id", async (req, reply) => {
    try {
      if (!deleteGoal(req.params.id)) return reply.code(404).send({ error: "goal not found" });
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof GoalNotOpen) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/goals/:id/reflection", {
    schema: {
      body: {
        type: "object",
        required: ["felt"],
        additionalProperties: false,
        properties: {
          felt: { type: "string", enum: [...REFLECTION_FEELINGS] },
          note: { type: "string", maxLength: REFLECTION_NOTE_MAX },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const goal = saveReflection(req.params.id, req.body as { felt: string; note?: string });
      if (!goal) return reply.code(404).send({ error: "goal not found" });
      return goal;
    } catch (err) {
      if (err instanceof InvalidGoalUpdate) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/goals/:id/complete", async (req, reply) => {
    try {
      const result = completeGoal(req.params.id, readArtifactId(req.body));
      if (!result) return reply.code(404).send({ error: "goal not found" });
      // 200 also when the daily rules recorded the goal without XP: awarded false plus reason and message.
      return {
        goal: result.goal,
        progress: result.progress,
        awarded: result.awarded,
        ...(result.reason ? { reason: result.reason, message: result.message } : {}),
        awardedToday: result.today.awarded,
        awardCap: result.today.awardCap,
        ownAwardedToday: result.today.ownAwarded,
        ownAwardCap: result.today.ownAwardCap,
      };
    } catch (err) {
      if (err instanceof PlaceLocked) return reply.code(400).send({ error: err.message });
      if (err instanceof ArtifactNotFound) return reply.code(400).send({ error: err.message });
      if (err instanceof ArtifactAlreadyLinked) return reply.code(409).send({ error: err.message });
      if (err instanceof InvalidGoalUpdate) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // scene18 «Отменить»: today's record only (409 for an open goal or a past day). «Вернуть» is /complete.
  app.post<{ Params: { id: string } }>("/goals/:id/undo", async (req, reply) => {
    try {
      const result = undoGoal(req.params.id);
      if (!result) return reply.code(404).send({ error: "goal not found" });
      return {
        goal: result.goal,
        progress: result.progress,
        removedXp: result.removedXp,
        awardedToday: result.today.awarded,
        awardCap: result.today.awardCap,
        ownAwardedToday: result.today.ownAwarded,
        ownAwardCap: result.today.ownAwardCap,
      };
    } catch (err) {
      if (err instanceof GoalNotDone || err instanceof UndoPastDay) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.get("/artifacts", async () => listArtifacts());

  app.post("/artifacts", {
    schema: {
      body: {
        type: "object",
        required: ["title", "kind"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: ARTIFACT_TITLE_MAX_LENGTH },
          kind: { type: "string", enum: [...ARTIFACT_KINDS] },
          imageUrl: { type: "string", minLength: 1, maxLength: ARTIFACT_IMAGE_URL_MAX_LENGTH },
          goalId: { type: "string", minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const artifact = createArtifact(req.body as ArtifactInput);
      return reply.code(201).send(artifact);
    } catch (err) {
      if (err instanceof InvalidArtifact) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.get("/room", async () => getRoom());

  app.get("/progress", async () => getProgress());

  app.get("/player", async () => playerView(getPlayer()));

  app.put("/player/avatar", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["hairStyle", "hairColor", "skinTone", "outfit", "expression", "accessory"],
        properties: {
          hairStyle: { type: "string", enum: [...HAIR_STYLES] },
          hairColor: { type: "string", enum: [...HAIR_COLORS] },
          skinTone: { type: "string", enum: [...SKIN_TONES] },
          outfit: { type: "string", enum: [...OUTFITS] },
          expression: { type: "string", enum: [...EXPRESSIONS] },
          accessory: { type: "string", enum: [...ACCESSORIES] },
        },
      },
    },
  }, async (req, reply) => {
    try {
      return playerView(setAvatarConfig(req.body));
    } catch (err) {
      if (err instanceof InvalidAvatarConfig) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.patch("/player", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          nickname: { type: "string", minLength: 1, maxLength: NICKNAME_MAX_LENGTH },
          title: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: TITLE_MAX_LENGTH },
              { type: "null" },
            ],
          },
          avatarUrl: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: AVATAR_URL_MAX_LENGTH },
              { type: "null" },
            ],
          },
        },
      },
    },
  }, async (req, reply) => {
    try {
      return playerView(updatePlayer(req.body as Parameters<typeof updatePlayer>[0]));
    } catch (err) {
      if (err instanceof InvalidPlayerUpdate) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  return app;
}

function uploadError(err: unknown): string | null {
  if (err instanceof InvalidUpload) return err.message;
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = String((err as { code: unknown }).code);
  if (code === "FST_REQ_FILE_TOO_LARGE") return "file is too large";
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE" || code === "FST_INVALID_MULTIPART_CONTENT_LENGTH") {
    return "expected multipart file";
  }
  return null;
}

function bodyHasXpReward(body: unknown): boolean {
  return !!body && typeof body === "object" && !Array.isArray(body)
    && Object.prototype.hasOwnProperty.call(body, "xpReward");
}

/** Completion body is optional. A missing body awards XP only; `{ artifactId }` also links a photo. */
function readArtifactId(body: unknown): string | undefined {
  if (body == null || body === "") return undefined;
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidGoalUpdate("body must be an object");
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "artifactId") throw new InvalidGoalUpdate("unknown field");
  }
  if (record.artifactId === undefined) return undefined;
  if (typeof record.artifactId !== "string" || record.artifactId.trim().length < 1) {
    throw new InvalidGoalUpdate("artifactId must be a non-empty string");
  }
  return record.artifactId;
}
