import type { FastifyInstance } from "fastify";
import {
  AvatarCandidateNotFound,
  AvatarLimitReached,
  avatarQuota,
  selectAvatar,
} from "../store.js";
import { InvalidUpload } from "../uploads.js";
import { generateAvatars } from "./generate.js";
import {
  avatarCandidateCountFromEnv,
  avatarDailyLimitFromEnv,
  avatarGeneratorFromEnv,
  AvatarProviderError,
  type AvatarGenerator,
} from "./generator.js";

const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function registerAvatarRoutes(
  app: FastifyInstance,
  opts: {
    uploadsDir: () => string;
    maxUploadBytes: number;
    generator?: AvatarGenerator;
    dailyLimit?: number;
    candidateCount?: number;
  },
): void {
  const generator = (): AvatarGenerator => opts.generator ?? avatarGeneratorFromEnv();
  const dailyLimit = (): number => opts.dailyLimit ?? avatarDailyLimitFromEnv();
  const candidateCount = (): number => opts.candidateCount ?? avatarCandidateCountFromEnv();

  app.get("/avatar", async () => {
    const active = generator();
    return { provider: active.id, ...avatarQuota(dailyLimit()) };
  });

  app.post("/avatar/generate", async (req, reply) => {
    try {
      const form = await readForm(req as unknown as { parts: () => AsyncIterable<MultipartPart> });
      if (form.truncated || (form.bytes && form.bytes.length > opts.maxUploadBytes)) {
        return reply.code(400).send({ error: "file is too large" });
      }
      if (!form.bytes) return reply.code(400).send({ error: "file is required" });
      if (!TRUTHY.has(form.consent)) return reply.code(400).send({ error: "consent is required" });
      const result = await generateAvatars({
        dir: opts.uploadsDir(),
        bytes: form.bytes,
        maxBytes: opts.maxUploadBytes,
        keepOriginal: TRUTHY.has(form.keepOriginal),
        dailyLimit: dailyLimit(),
        candidateCount: candidateCount(),
        generator: generator(),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof InvalidUpload) return reply.code(400).send({ error: err.message });
      if (err instanceof AvatarLimitReached) {
        return reply.code(429).send({ error: err.message, limit: err.limit, used: err.used });
      }
      if (err instanceof AvatarProviderError) {
        req.log.error({ err: err.cause ?? err }, "avatar provider failed");
        return reply.code(502).send({ error: "avatar provider failed" });
      }
      const message = uploadError(err);
      if (message) return reply.code(400).send({ error: message });
      req.log.error({ err }, "avatar save failed");
      return reply.code(500).send({ error: "could not save avatar" });
    }
  });

  app.post("/avatar/select", {
    schema: {
      body: {
        type: "object",
        required: ["candidateId"],
        additionalProperties: false,
        properties: {
          candidateId: { type: "string", minLength: 1, maxLength: 80 },
        },
      },
    },
  }, async (req, reply) => {
    try {
      return selectAvatar((req.body as { candidateId: string }).candidateId);
    } catch (err) {
      if (err instanceof AvatarCandidateNotFound) return reply.code(404).send({ error: err.message });
      req.log.error({ err }, "avatar save failed");
      return reply.code(500).send({ error: "could not save avatar" });
    }
  });
}

interface AvatarForm {
  bytes: Buffer | null;
  truncated: boolean;
  consent: string;
  keepOriginal: string;
}

async function readForm(req: { parts: () => AsyncIterable<MultipartPart> }): Promise<AvatarForm> {
  const fields = new Map<string, string>();
  let bytes: Buffer | null = null;
  let truncated = false;
  let sawFile = false;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buf = await part.toBuffer();
      if (part.fieldname !== "file" || sawFile) continue;
      sawFile = true;
      bytes = buf;
      truncated = part.file.truncated;
      continue;
    }
    const key = part.fieldname.toLowerCase();
    if ((key === "consent" || key === "keeporiginal") && typeof part.value === "string" && !fields.has(key)) {
      fields.set(key, part.value.trim().toLowerCase());
    }
  }
  return {
    bytes,
    truncated,
    consent: fields.get("consent") ?? "",
    keepOriginal: fields.get("keeporiginal") ?? "",
  };
}

interface MultipartPart {
  type: "file" | "field";
  fieldname: string;
  value?: string;
  file: { truncated: boolean };
  toBuffer: () => Promise<Buffer>;
}

function uploadError(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = String((err as { code: unknown }).code);
  if (code === "FST_REQ_FILE_TOO_LARGE") return "file is too large";
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE" || code === "FST_INVALID_MULTIPART_CONTENT_LENGTH") {
    return "expected multipart file";
  }
  return null;
}
