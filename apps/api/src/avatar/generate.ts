import { randomUUID } from "node:crypto";
import { AVATAR_STYLE_PROMPT, clampAvatarCount } from "@levex/domain";
import {
  AvatarLimitReached,
  avatarQuota,
  recordAvatarGeneration,
  type AvatarQuota,
} from "../store.js";
import { imageExtension, InvalidUpload, removeUpload, saveImageUpload } from "../uploads.js";
import {
  AvatarProviderError,
  type AvatarGenerator,
  type AvatarMediaType,
} from "./generator.js";

export interface AvatarGeneration extends AvatarQuota {
  provider: AvatarGenerator["id"];
  sourceUrl?: string;
}

const MEDIA: Record<string, AvatarMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Validates the selfie, asks the generator for candidates, stores those images,
 * then commits the rate-limit count and the candidate ids.
 * The selfie file is removed after a successful commit unless `keepOriginal` is set.
 * A failed commit deletes every file this call wrote and leaves the JSON store unchanged.
 */
export async function generateAvatars(input: {
  dir: string;
  bytes: Buffer;
  maxBytes: number;
  keepOriginal: boolean;
  dailyLimit: number;
  candidateCount: number;
  generator: AvatarGenerator;
}): Promise<AvatarGeneration> {
  if (input.bytes.length === 0) throw new InvalidUpload("file is empty");
  if (input.bytes.length > input.maxBytes) throw new InvalidUpload("file is too large");
  const ext = imageExtension(input.bytes);
  const mediaType = ext ? MEDIA[ext] : undefined;
  if (!mediaType) throw new InvalidUpload("file must be a png, jpeg, or webp image");

  const quota = avatarQuota(input.dailyLimit);
  if (quota.remaining <= 0) throw new AvatarLimitReached(quota.limit, quota.used);

  const count = clampAvatarCount(input.candidateCount);
  const selfie = saveImageUpload(input.dir, input.bytes);
  const written = [selfie.filename];
  let committed = false;
  try {
    const images = await askProvider(input.generator, input.bytes, mediaType, count);
    const saved: Array<{ id: string; url: string }> = [];
    for (const image of images) {
      const bytes = image && Buffer.isBuffer(image.bytes) ? image.bytes : null;
      if (!bytes) throw new AvatarProviderError(new Error("provider image is empty"));
      const kind = imageExtension(bytes);
      if (!kind || !MEDIA[kind]) throw new AvatarProviderError(new Error("provider image is not png, jpeg, or webp"));
      const file = saveImageUpload(input.dir, bytes);
      written.push(file.filename);
      saved.push({ id: randomUUID(), url: file.url });
    }
    const recorded = recordAvatarGeneration({ limit: input.dailyLimit, candidates: saved });
    committed = true;
    if (!input.keepOriginal) removeUpload(input.dir, selfie.filename);
    const generation: AvatarGeneration = {
      ...recorded,
      provider: input.generator.id,
    };
    if (input.keepOriginal) generation.sourceUrl = selfie.url;
    return generation;
  } catch (err) {
    if (!committed) {
      for (const name of written) removeUpload(input.dir, name);
    }
    throw err;
  }
}

async function askProvider(
  generator: AvatarGenerator,
  photo: Buffer,
  mediaType: AvatarMediaType,
  count: number,
) {
  let images;
  try {
    images = await generator.generate({
      photo,
      mediaType,
      prompt: AVATAR_STYLE_PROMPT,
      count,
    });
  } catch (err) {
    if (err instanceof AvatarProviderError) throw err;
    throw new AvatarProviderError(err);
  }
  if (!Array.isArray(images) || images.length !== count) {
    throw new AvatarProviderError(new Error("provider returned the wrong number of images"));
  }
  return images;
}
