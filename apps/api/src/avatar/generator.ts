import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AVATAR_CANDIDATE_COUNT,
  AVATAR_DAILY_LIMIT_DEFAULT,
  clampAvatarCount,
} from "@levex/domain";

const FIXTURES = [0, 1, 2].map((index) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", `${index}.png`)),
);

export type AvatarMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface AvatarGeneratorInput {
  photo: Buffer;
  mediaType: AvatarMediaType;
  /** Always {@link AVATAR_STYLE_PROMPT}. Providers must send this text unchanged. */
  prompt: string;
  count: number;
}

export interface AvatarImage {
  bytes: Buffer;
  mediaType: AvatarMediaType;
}

export interface AvatarGenerator {
  readonly id: "mock" | "openai" | "xai";
  generate(input: AvatarGeneratorInput): Promise<AvatarImage[]>;
}

/**
 * Deterministic stand-in used when no provider key is configured.
 * Three painted characters in the room's style. Their order follows a hash of the
 * photo, so the same selfie always yields the same files. It does not call the network
 * and it does not copy a face — that is the real provider's job.
 */
export class MockAvatarGenerator implements AvatarGenerator {
  readonly id = "mock" as const;

  async generate(input: AvatarGeneratorInput): Promise<AvatarImage[]> {
    const count = clampAvatarCount(input.count);
    const start = createHash("sha256").update(input.photo).digest()[0]! % FIXTURES.length;
    return Array.from({ length: count }, (_, index) => {
      const png = FIXTURES[(start + index) % FIXTURES.length]!;
      // A fourth candidate repeats a picture. A trailing byte keeps the file distinct
      // without changing the pixels a browser paints.
      const bytes = index < FIXTURES.length ? png : Buffer.concat([png, Buffer.from([index])]);
      return { mediaType: "image/png" as const, bytes };
    });
  }
}

export class AvatarProviderError extends Error {
  constructor(readonly cause?: unknown) {
    super("avatar provider failed");
    this.name = "AvatarProviderError";
  }
}

const MODEL_TOKEN = /^[a-zA-Z0-9._-]{1,80}$/;
const OPENAI_QUALITIES = new Set(["low", "medium", "high", "xhigh", "max", "auto"]);

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const DEFAULT_XAI_IMAGE_MODEL = "grok-imagine-image-2.0";

export function createOpenAIAvatarGenerator(opts: {
  apiKey: string;
  model?: string;
  quality?: string;
  fetchImpl?: typeof fetch;
}): AvatarGenerator {
  const apiKey = opts.apiKey.trim();
  const model = opts.model && MODEL_TOKEN.test(opts.model) ? opts.model : DEFAULT_OPENAI_IMAGE_MODEL;
  const quality = opts.quality && OPENAI_QUALITIES.has(opts.quality) ? opts.quality : "medium";
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    id: "openai",
    async generate(input) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", input.prompt);
      form.set("n", String(input.count));
      form.set("size", "1024x1536");
      form.set("background", "transparent");
      form.set("output_format", "png");
      form.set("quality", quality);
      const filename = input.mediaType === "image/jpeg"
        ? "selfie.jpg"
        : input.mediaType === "image/webp" ? "selfie.webp" : "selfie.png";
      form.append("image", new Blob([new Uint8Array(input.photo)], { type: input.mediaType }), filename);
      let response: Response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        throw new AvatarProviderError(err);
      }
      if (!response.ok) throw new AvatarProviderError(new Error(`openai images ${response.status}`));
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
      const images = decodeImages(payload.data);
      if (images.length < input.count) throw new AvatarProviderError(new Error("openai returned too few images"));
      return images.slice(0, input.count);
    },
  };
}

export function createXaiAvatarGenerator(opts: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AvatarGenerator {
  const apiKey = opts.apiKey.trim();
  const model = opts.model && MODEL_TOKEN.test(opts.model) ? opts.model : DEFAULT_XAI_IMAGE_MODEL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    id: "xai",
    async generate(input) {
      const dataUrl = `data:${input.mediaType};base64,${input.photo.toString("base64")}`;
      const images: AvatarImage[] = [];
      // One call asks for every missing picture. If the API returns fewer, ask again
      // until the count is filled. Cap the calls so a short response cannot loop forever.
      for (let call = 0; images.length < input.count && call < input.count; call++) {
        const want = input.count - images.length;
        let response: Response;
        try {
          response = await fetchImpl("https://api.x.ai/v1/images/edits", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              prompt: input.prompt,
              image: { type: "image_url", url: dataUrl },
              aspect_ratio: "2:3",
              quality: "medium",
              response_format: "b64_json",
              n: want,
            }),
            signal: AbortSignal.timeout(120_000),
          });
        } catch (err) {
          throw new AvatarProviderError(err);
        }
        if (!response.ok) throw new AvatarProviderError(new Error(`xai images ${response.status}`));
        const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
        const batch = await decodeImagesAsync(payload.data, fetchImpl);
        if (batch.length === 0) throw new AvatarProviderError(new Error("xai returned no image"));
        images.push(...batch);
      }
      if (images.length < input.count) throw new AvatarProviderError(new Error("xai returned too few images"));
      return images.slice(0, input.count);
    },
  };
}

function decodeImages(data: Array<{ b64_json?: string }> | undefined): AvatarImage[] {
  if (!data) return [];
  const images: AvatarImage[] = [];
  for (const item of data) {
    if (!item.b64_json) continue;
    const bytes = Buffer.from(item.b64_json, "base64");
    if (bytes.length === 0) continue;
    images.push({ bytes, mediaType: "image/png" });
  }
  return images;
}

async function decodeImagesAsync(
  data: Array<{ b64_json?: string; url?: string }> | undefined,
  fetchImpl: typeof fetch,
): Promise<AvatarImage[]> {
  if (!data) return [];
  const images: AvatarImage[] = [];
  for (const item of data) {
    if (item.b64_json) {
      const bytes = Buffer.from(item.b64_json, "base64");
      if (bytes.length > 0) images.push({ bytes, mediaType: "image/png" });
      continue;
    }
    if (item.url && item.url.startsWith("https://")) {
      const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new AvatarProviderError(new Error(`image fetch ${response.status}`));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new AvatarProviderError();
      images.push({ bytes, mediaType: "image/png" });
    }
  }
  return images;
}

/** OpenAI when its key is set, otherwise xAI, otherwise the mock. An explicit provider without a key stays on the mock. */
export function avatarGeneratorFromEnv(): AvatarGenerator {
  const choice = process.env.AVATAR_PROVIDER?.trim().toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  if (choice === "mock") return new MockAvatarGenerator();
  if (choice === "openai") {
    return openaiKey
      ? createOpenAIAvatarGenerator({
        apiKey: openaiKey,
        model: process.env.OPENAI_IMAGE_MODEL?.trim(),
        quality: process.env.OPENAI_IMAGE_QUALITY?.trim(),
      })
      : new MockAvatarGenerator();
  }
  if (choice === "xai") {
    return xaiKey
      ? createXaiAvatarGenerator({ apiKey: xaiKey, model: process.env.XAI_IMAGE_MODEL?.trim() })
      : new MockAvatarGenerator();
  }
  if (openaiKey) {
    return createOpenAIAvatarGenerator({
      apiKey: openaiKey,
      model: process.env.OPENAI_IMAGE_MODEL?.trim(),
      quality: process.env.OPENAI_IMAGE_QUALITY?.trim(),
    });
  }
  if (xaiKey) return createXaiAvatarGenerator({ apiKey: xaiKey, model: process.env.XAI_IMAGE_MODEL?.trim() });
  return new MockAvatarGenerator();
}

export function avatarCandidateCountFromEnv(): number {
  const raw = process.env.AVATAR_CANDIDATE_COUNT;
  if (raw === undefined || raw.trim() === "") return AVATAR_CANDIDATE_COUNT;
  return clampAvatarCount(Number(raw));
}

export function avatarDailyLimitFromEnv(): number {
  const raw = process.env.AVATAR_DAILY_LIMIT;
  if (raw === undefined || raw.trim() === "") return AVATAR_DAILY_LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 1000) return AVATAR_DAILY_LIMIT_DEFAULT;
  return n;
}
