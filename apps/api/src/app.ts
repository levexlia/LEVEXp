import Fastify from "fastify";
import { completeGoal, createGoal, getProgress, listGoals } from "./store.js";

const SPHERES = ["health", "mind", "career", "finance", "relationships", "creativity", "spirit", "community"];

export function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true });
  app.get("/health", async () => ({ status: "ok", service: "levex-api" }));

  app.get("/goals", async () => listGoals());

  app.post("/goals", {
    schema: {
      body: {
        type: "object",
        required: ["title"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          sphere: { type: "string", enum: SPHERES },
          xpReward: { type: "integer", minimum: 1, maximum: 10000 },
        },
      },
    },
  }, async (req, reply) => {
    const goal = createGoal(req.body as Parameters<typeof createGoal>[0]);
    return reply.code(201).send(goal);
  });

  app.post<{ Params: { id: string } }>("/goals/:id/complete", async (req, reply) => {
    const result = completeGoal(req.params.id);
    if (!result) return reply.code(404).send({ error: "goal not found" });
    return { goal: result.goal, progress: result.progress };
  });

  app.get("/progress", async () => getProgress());
  return app;
}
