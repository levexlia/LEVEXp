import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const art = join(here, "../../public/art/scene14");
const tokens = JSON.parse(readFileSync(join(here, "levex-x.tokens.json"), "utf8"));
const css = readFileSync(join(here, "levex-x.css"), "utf8");

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function svgFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? svgFiles(join(dir, e.name)) : e.name.endsWith(".svg") ? [join(dir, e.name)] : [],
  );
}

describe("levex-x (scene14) art kit", () => {
  const places = ["home", "study", "park", "workshop", "center"];

  it("has every place icon, locked icon, chip and dome state", () => {
    for (const p of places) {
      const t = tokens.place[p];
      for (const f of [t.icon, t.iconLocked, t.chip]) expect(existsSync(join(art, f)), f).toBe(true);
      for (const s of tokens.dome.states) {
        const f = tokens.dome.pattern.replace("{place}", p).replace("{state}", s);
        expect(existsSync(join(art, f)), f).toBe(true);
      }
    }
  });

  it("has the four badges, map, avatars and fonts with their OFL texts", () => {
    for (const b of Object.values(tokens.badge) as { file: string }[]) expect(existsSync(join(art, b.file)), b.file).toBe(true);
    for (const f of [tokens.map.file, tokens.map.scene720, tokens.map.background720, tokens.map.domeBoxes, tokens.avatar.map, ...tokens.avatar.alternates, tokens.font.display.file, tokens.font.mono.file])
      expect(existsSync(join(art, f)), f).toBe(true);
    for (const f of ["fonts/OFL-Tektur.txt", "fonts/OFL-JetBrainsMono.txt", "LICENSES.md"]) {
      expect(existsSync(join(art, f)), f).toBe(true);
    }
    expect(readFileSync(join(art, "fonts/OFL-Tektur.txt"), "utf8")).toContain("SIL Open Font License, Version 1.1");
    expect(readFileSync(join(art, "fonts/OFL-JetBrainsMono.txt"), "utf8")).toContain("SIL Open Font License, Version 1.1");
  });

  it("ships self-contained SVGs (no external files or fonts)", () => {
    const files = svgFiles(art);
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s.startsWith("<svg"), f).toBe(true);
      expect(s).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(/(?:href|url)\(?\s*["']?(?:https?:|file:|\/)/.test(s), f).toBe(false);
      if (s.includes("font-family")) expect(s, f).toContain("data:font/woff;base64,");
    }
  });

  it("keeps text contrast: secondary button readable, disabled ≥ 3:1 but dimmer", () => {
    const b = tokens.button;
    expect(contrast(b.secondary.normal.text, "#1a2358")).toBeGreaterThan(7);
    const dis = contrast(b.primary.disabled.text, "#0b0f25");
    expect(dis).toBeGreaterThanOrEqual(3);
    expect(dis).toBeLessThan(contrast(b.primary.normal.text, "#160b3a"));
  });

  it("CSS variables match the tokens", () => {
    expect(css).toContain(`--lx-outline: ${tokens.color.outline}`);
    expect(css).toContain(`--lx-text-disabled: ${tokens.color.text.disabled}`);
    for (const p of places) expect(css).toContain(`--lx-place-${p}: ${tokens.color.place[p]}`);
  });
});
