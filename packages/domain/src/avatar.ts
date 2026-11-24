/**
 * One prompt for every image provider. The reference photo carries identity;
 * this text only restyles that person into the game's illustrated character.
 * English, because the image models follow these constraints more reliably that way.
 * The player-facing screen stays Russian.
 */
export const AVATAR_STYLE_PROMPT = [
  "Edit the reference photo into a single full-body character of the same person,",
  "standing, head to feet, three-quarter view so the face is visible.",
  "Keep their likeness exactly: hair color, hair length, hairstyle, skin tone,",
  "glasses, facial hair, freckles, and other distinctive features.",
  "Restyle only the rendering into a cozy hand-painted illustration,",
  "like a modern storybook room at dusk: soft gouache, warm amber, peach, cream, and sage,",
  "gentle painted edges, a knitted sweater and comfortable trousers in that palette.",
  "Plain fully transparent background.",
  "No room, no floor, no scenery, no frame, no text, no watermark, no checkerboard, no extra people.",
].join(" ");

/** Inclusive bounds for how many candidates one generation may return. */
export const AVATAR_CANDIDATE_MIN = 2;
export const AVATAR_CANDIDATE_MAX = 4;
/** Used when the count is missing or not an integer. */
export const AVATAR_CANDIDATE_COUNT = 3;

/** Generations per player per UTC day when `AVATAR_DAILY_LIMIT` is unset. */
export const AVATAR_DAILY_LIMIT_DEFAULT = 5;

/** Integers outside 2–4 clamp to the ends. Anything else uses the default of 3. */
export function clampAvatarCount(value: number): number {
  if (!Number.isInteger(value)) return AVATAR_CANDIDATE_COUNT;
  if (value < AVATAR_CANDIDATE_MIN) return AVATAR_CANDIDATE_MIN;
  if (value > AVATAR_CANDIDATE_MAX) return AVATAR_CANDIDATE_MAX;
  return value;
}
