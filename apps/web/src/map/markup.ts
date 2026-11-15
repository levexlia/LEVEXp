import manifest from "./kit/manifest.json";
import { KIT } from "./assets";

const LOCK = manifest.locked_palette_swap as Record<string, string>;
const cache = new Map<string, string>();

export function svgInner(markup: string): string {
  return markup.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
}

/** One-pass fill swap so a locked colour is never swapped a second time. */
export function lockFills(markup: string): string {
  return markup.replace(/fill="(#[0-9a-fA-F]{3,8})"/g, (full, hex: string) => {
    const next = LOCK[hex.toLowerCase()];
    return next ? `fill="${next}"` : full;
  });
}

export function painted(id: string, locked = false): string {
  const key = locked ? `${id}:locked` : id;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = KIT[id];
  if (!raw) throw new Error(`missing map art ${id}`);
  const body = svgInner(raw);
  const out = locked ? lockFills(body) : body;
  cache.set(key, out);
  return out;
}
