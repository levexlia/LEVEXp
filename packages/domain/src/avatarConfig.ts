/**
 * Vector avatar parts. Ids match the LEVEX kit manifest
 * (`apps/web/src/avatar/kit/manifest.json`). These are the only values the API stores.
 */

export const HAIR_STYLES = [
  "hair_long",
  "hair_bob",
  "hair_curly",
  "hair_ponytail",
  "hair_buns",
  "hair_short",
] as const;
export const HAIR_COLORS = ["chestnut", "black", "blonde", "ginger", "pink", "cyan"] as const;
export const SKIN_TONES = ["porcelain", "fair", "default", "tan", "brown", "deep"] as const;
export const OUTFITS = [
  "outfit_hoodie",
  "outfit_cyan_jacket",
  "outfit_tshirt_shorts",
  "outfit_tracksuit",
] as const;
export const EXPRESSIONS = ["happy", "proud", "sleepy", "surprised"] as const;
export const ACCESSORIES = ["none", "acc_glasses", "acc_headphones", "acc_clip"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type SkinTone = (typeof SKIN_TONES)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Expression = (typeof EXPRESSIONS)[number];
export type Accessory = (typeof ACCESSORIES)[number];

export interface AvatarConfig {
  hairStyle: HairStyle;
  hairColor: HairColor;
  skinTone: SkinTone;
  outfit: Outfit;
  expression: Expression;
  accessory: Accessory;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  hairStyle: "hair_long",
  hairColor: "chestnut",
  skinTone: "default",
  outfit: "outfit_hoodie",
  expression: "happy",
  accessory: "none",
};

const HAIR_SET = new Set<string>(HAIR_STYLES);
const HAIR_COLOR_SET = new Set<string>(HAIR_COLORS);
const SKIN_SET = new Set<string>(SKIN_TONES);
const OUTFIT_SET = new Set<string>(OUTFITS);
const EXPRESSION_SET = new Set<string>(EXPRESSIONS);
const ACCESSORY_SET = new Set<string>(ACCESSORIES);

const KEYS = ["hairStyle", "hairColor", "skinTone", "outfit", "expression", "accessory"] as const;

/** Keys from the previous hand-drawn figure. A stored look that still uses them becomes the default kit. */
const LEGACY_KEYS = new Set(["skin", "hair", "eyes", "emotion"]);

function pick<T extends string>(value: unknown, allowed: Set<string>): T | undefined {
  return typeof value === "string" && allowed.has(value) ? value as T : undefined;
}

/** Accepts only the whitelisted kit ids. Extra fields are rejected. */
export function parseAvatarConfig(value: unknown): AvatarConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length !== KEYS.length || keys.some((key) => !KEYS.includes(key as (typeof KEYS)[number]))) {
    return undefined;
  }
  const hairStyle = pick<HairStyle>(raw.hairStyle, HAIR_SET);
  const hairColor = pick<HairColor>(raw.hairColor, HAIR_COLOR_SET);
  const skinTone = pick<SkinTone>(raw.skinTone, SKIN_SET);
  const outfit = pick<Outfit>(raw.outfit, OUTFIT_SET);
  const expression = pick<Expression>(raw.expression, EXPRESSION_SET);
  const accessory = pick<Accessory>(raw.accessory, ACCESSORY_SET);
  if (!hairStyle || !hairColor || !skinTone || !outfit || !expression || !accessory) return undefined;
  return { hairStyle, hairColor, skinTone, outfit, expression, accessory };
}

/**
 * Reads a stored look. A valid kit config is kept. A look from the old part list
 * (skin, hair, eyes, emotion) becomes {@link DEFAULT_AVATAR_CONFIG}. Anything else is rejected.
 */
export function normalizeAvatarConfig(value: unknown): AvatarConfig | undefined {
  const parsed = parseAvatarConfig(value);
  if (parsed) return parsed;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.some((key) => LEGACY_KEYS.has(key))) return { ...DEFAULT_AVATAR_CONFIG };
  return undefined;
}

/** Same photo bytes always yield the same kit ids. Used by the mock provider. */
export function lookFromPhoto(bytes: Uint8Array): AvatarConfig {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i]!, 16777619);
  hash >>>= 0;
  const at = <T extends string>(list: readonly T[], shift: number): T => list[(hash >>> shift) % list.length]!;
  const accessoryRoll = (hash >>> 17) % 5;
  const accessory: Accessory = accessoryRoll === 0
    ? "acc_glasses"
    : accessoryRoll === 1
      ? "acc_clip"
      : "none";
  return {
    hairStyle: at(HAIR_STYLES, 3),
    hairColor: at(HAIR_COLORS, 7),
    skinTone: at(SKIN_TONES, 0),
    outfit: at(OUTFITS, 13),
    expression: "happy",
    accessory,
  };
}

/** A second and third look, still deterministic, so the player can choose. */
export function looksFromPhoto(bytes: Uint8Array, count: number): AvatarConfig[] {
  const base = lookFromPhoto(bytes);
  const looks = [base];
  const extras: AvatarConfig[] = [
    {
      ...base,
      hairStyle: HAIR_STYLES[(HAIR_STYLES.indexOf(base.hairStyle) + 1) % HAIR_STYLES.length]!,
      expression: "proud",
    },
    {
      ...base,
      outfit: OUTFITS[(OUTFITS.indexOf(base.outfit) + 1) % OUTFITS.length]!,
      expression: "surprised",
    },
  ];
  for (const extra of extras) {
    if (looks.length >= count) break;
    looks.push(extra);
  }
  return looks.slice(0, Math.max(1, count));
}
