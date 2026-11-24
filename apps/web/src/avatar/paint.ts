import type { HairColor, SkinTone } from "@levex/domain";
import manifest from "./kit/manifest.json";

const skins = manifest.recolor.skin.palettes as Record<SkinTone, { main: string; shade: string }>;
const hairs = manifest.recolor.hair.palettes as Record<HairColor, { main: string; shade: string; brow: string }>;

/** Exact lowercase `fill` replacement from the kit manifest. Outline, white, and pupil stay put. */
export function recolorMarkup(markup: string, skinTone: SkinTone, hairColor: HairColor): string {
  const skin = skins[skinTone];
  const hair = hairs[hairColor];
  return markup
    .replaceAll(`fill="${manifest.recolor.skin.main}"`, `fill="${skin.main}"`)
    .replaceAll(`fill="${manifest.recolor.skin.shade}"`, `fill="${skin.shade}"`)
    .replaceAll(`fill="${manifest.recolor.hair.main}"`, `fill="${hair.main}"`)
    .replaceAll(`fill="${manifest.recolor.hair.shade}"`, `fill="${hair.shade}"`)
    .replaceAll(`fill="${manifest.recolor.hair.brow}"`, `fill="${hair.brow}"`);
}

export function svgInner(markup: string): string {
  return markup
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
}

/** Prefix ids and fragment links so two avatars on one page cannot collide. */
export function scopeMarkup(markup: string, prefix: string): string {
  return markup
    .replace(/\bid=(['"])([^'"]+)\1/g, (_match, quote: string, id: string) => `id=${quote}${prefix}${id}${quote}`)
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}${id})`)
    .replace(
      /((?:href|xlink:href)=)(['"])#([^'"]+)\2/g,
      (_match, attr: string, quote: string, id: string) => `${attr}${quote}#${prefix}${id}${quote}`,
    );
}
