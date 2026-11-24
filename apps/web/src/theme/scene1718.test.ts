import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pub = fileURLToPath(new URL("../../public", import.meta.url));
const css = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");

describe("scene17/18 assets (PR-A)", () => {
  it("ships the accepted art with its licenses", () => {
    for (const file of [
      "scene17/robot_hint_left.svg", "scene17/static/robot_hint_left_static.svg", "scene17/hint_tail.svg", "scene17/ic_trash.svg",
      "scene17/empty_day.svg", "scene17/empty_own.svg", "scene17/empty_resources.svg",
      "scene17/static/empty_day_static.svg", "scene17/static/empty_own_static.svg", "scene17/static/empty_resources_static.svg",
      "scene17/LICENSES.md", "scene17/licenses/LICENSE_lucide.txt",
      "scene18/ic_anywhere_a_glyph.svg", "scene18/LICENSES.md", "scene18/licenses/LICENSE_lucide-static.txt",
    ]) expect(existsSync(`${pub}/art/${file}`), file).toBe(true);
    expect(readFileSync(`${pub}/art/scene17/ic_trash.svg`, "utf8")).toMatch(/Lucide trash-2.*ISC/);
  });

  it("B2 only: variants A and B (ic_anywhere_a/b.svg, .lx-anywhere, .is-anywhere) are not shipped", () => {
    expect(existsSync(`${pub}/art/scene18/ic_anywhere_a.svg`)).toBe(false);
    expect(existsSync(`${pub}/art/scene18/ic_anywhere_b.svg`)).toBe(false);
    const scene18 = css("levex-scene18.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(scene18).not.toMatch(/\.lx-anywhere/);
    expect(scene18).not.toMatch(/\.is-anywhere[^-]/);
    expect(scene18).toMatch(/\.mission\.is-b2/);
    expect(scene18).toMatch(/\.mission\.is-anywhere-b/);
  });

  it("calm styles: no red in the hint and empty states, the hint animation is off under reduced motion", () => {
    for (const name of ["levex-hint.css", "levex-empty.css"]) expect(css(name).replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#ff5c8a|#f00\b|red\b/i);
    expect(css("levex-hint.css")).toMatch(/prefers-reduced-motion:reduce\)\{\.lx-hint-in\{animation:none\}/);
  });
});
