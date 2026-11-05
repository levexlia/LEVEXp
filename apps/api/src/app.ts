import Fastify from "fastify";
import {
  ARTIFACT_IMAGE_URL_MAX_LENGTH,
  ARTIFACT_KINDS,
  ARTIFACT_TITLE_MAX_LENGTH,
  AVATAR_URL_MAX_LENGTH,
  getLifeSphere,
  LIFE_SPHERE_IDS,
  listLifeSpheres,
  NICKNAME_MAX_LENGTH,
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
  InvalidGoalUpdate,
  InvalidPlayerUpdate,
  listArtifacts,
  listGoals,
  updatePlayer,
  type ArtifactInput,
} from "./store.js";

export function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? true,
    // Default Ajv removes unknown fields. Reject them so additionalProperties: false means 400.
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.get("/health", async () => ({ status: "ok", service: "levex-api" }));

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
        required: ["title"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          sphere: { type: "string", enum: [...LIFE_SPHERE_IDS] },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const goal = createGoal(req.body as Parameters<typeof createGoal>[0]);
      return reply.code(201).send(goal);
    } catch (err) {
      if (err instanceof InvalidGoalUpdate) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/goals/:id/complete", async (req, reply) => {
    try {
      const result = completeGoal(req.params.id, readArtifactId(req.body));
      if (!result) return reply.code(404).send({ error: "goal not found" });
      return { goal: result.goal, progress: result.progress };
    } catch (err) {
      if (err instanceof ArtifactNotFound) return reply.code(400).send({ error: err.message });
      if (err instanceof ArtifactAlreadyLinked) return reply.code(409).send({ error: err.message });
      if (err instanceof InvalidGoalUpdate) return reply.code(400).send({ error: err.message });
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

  app.get("/player", async () => getPlayer());

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
      return updatePlayer(req.body as Parameters<typeof updatePlayer>[0]);
    } catch (err) {
      if (err instanceof InvalidPlayerUpdate) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  return app;
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
