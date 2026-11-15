/** Vector avatar parts. Ids are the only values the API will store. */

export const SKIN_TONES = ["peach", "light", "tan", "amber", "brown", "deep"] as const;
export const HAIR_STYLES = ["short", "bob", "wavy", "long", "bun", "ponytail", "curly", "pigtails"] as const;
export const HAIR_COLORS = ["black", "brown", "auburn", "blonde", "pink", "cyan"] as const;
export const EYE_STYLES = ["round", "soft", "sharp", "wide"] as const;
export const OUTFITS = ["hoodie", "tee", "jacket", "dress"] as const;
export const ACCESSORIES = ["none", "glasses", "star", "headphones"] as const;
export const EMOTIONS = ["happy", "proud", "sleepy", "surprised"] as const;

export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Emotion = (typeof EMOTIONS)[number];

export interface AvatarConfig {
  skin: SkinTone;
  hair: HairStyle;
  hairColor: HairColor;
  eyes: EyeStyle;
  outfit: Outfit;
  accessory: Accessory;
  emotion: Emotion;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skin: "peach",
  hair: "wavy",
  hairColor: "brown",
  eyes: "round",
  outfit: "hoodie",
  accessory: "none",
  emotion: "happy",
};

const SKIN_SET = new Set<string>(SKIN_TONES);
const HAIR_SET = new Set<string>(HAIR_STYLES);
const HAIR_COLOR_SET = new Set<string>(HAIR_COLORS);
const EYE_SET = new Set<string>(EYE_STYLES);
const OUTFIT_SET = new Set<string>(OUTFITS);
const ACCESSORY_SET = new Set<string>(ACCESSORIES);
const EMOTION_SET = new Set<string>(EMOTIONS);

function pick<T extends string>(value: unknown, allowed: Set<string>): T | undefined {
  return typeof value === "string" && allowed.has(value) ? value as T : undefined;
}

/** Accepts only the whitelisted part ids. Extra fields are rejected. */
export function parseAvatarConfig(value: unknown): AvatarConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  const allowedKeys = ["skin", "hair", "hairColor", "eyes", "outfit", "accessory", "emotion"];
  if (keys.some((key) => !allowedKeys.includes(key))) return undefined;
  const skin = pick<SkinTone>(raw.skin, SKIN_SET);
  const hair = pick<HairStyle>(raw.hair, HAIR_SET);
  const hairColor = pick<HairColor>(raw.hairColor, HAIR_COLOR_SET);
  const eyes = pick<EyeStyle>(raw.eyes, EYE_SET);
  const outfit = pick<Outfit>(raw.outfit, OUTFIT_SET);
  const accessory = pick<Accessory>(raw.accessory, ACCESSORY_SET);
  const emotion = pick<Emotion>(raw.emotion, EMOTION_SET);
  if (!skin || !hair || !hairColor || !eyes || !outfit || !accessory || !emotion) return undefined;
  return { skin, hair, hairColor, eyes, outfit, accessory, emotion };
}

/** Same photo bytes always yield the same parts. Used by the mock provider. */
export function lookFromPhoto(bytes: Uint8Array): AvatarConfig {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i]!, 16777619);
  hash >>>= 0;
  const at = <T extends string>(list: readonly T[], shift: number): T => list[(hash >>> shift) % list.length]!;
  return {
    skin: at(SKIN_TONES, 0),
    hair: at(HAIR_STYLES, 3),
    hairColor: at(HAIR_COLORS, 7),
    eyes: at(EYE_STYLES, 11),
    outfit: at(OUTFITS, 13),
    accessory: (hash >>> 17) % 4 === 0 ? "glasses" : "none",
    emotion: "happy",
  };
}

/** A second and third look, still deterministic, so the player can choose. */
export function looksFromPhoto(bytes: Uint8Array, count: number): AvatarConfig[] {
  const base = lookFromPhoto(bytes);
  const looks = [base];
  const extras: AvatarConfig[] = [
    { ...base, hair: HAIR_STYLES[(HAIR_STYLES.indexOf(base.hair) + 1) % HAIR_STYLES.length]!, emotion: "proud" },
    { ...base, outfit: OUTFITS[(OUTFITS.indexOf(base.outfit) + 1) % OUTFITS.length]!, emotion: "surprised" },
  ];
  for (const extra of extras) {
    if (looks.length >= count) break;
    looks.push(extra);
  }
  return looks.slice(0, Math.max(1, count));
}
