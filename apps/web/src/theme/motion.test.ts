import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANIMATED_ART, ART_ROOT, STATIC_ROOT, artSrc, isAnimatedSvg, readReducedMotion, staticFrame } from "./motion.js";

const art = fileURLToPath(new URL("../../public/art/scene14", import.meta.url));

function svgs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "_static" ? [] : svgs(join(dir, entry.name));
    return entry.name.endsWith(".svg") ? [join(dir, entry.name)] : [];
  });
}

describe("reduced-motion switch", () => {
  it("swaps animated art for its static twin only when motion is reduced", () => {
    expect(artSrc("/art/scene14/domes/park_current.svg", false)).toBe("/art/scene14/domes/park_current.svg");
    expect(artSrc("/art/scene14/domes/park_current.svg", true)).toBe("/art/scene14/_static/domes/park_current.svg");
    expect(artSrc("/art/scene14/places/home_locked.svg", true)).toBe("/art/scene14/_static/places/home_locked.svg");
  });

  it("leaves still art and other URLs alone", () => {
    expect(artSrc("/art/scene14/badges/done.svg", true)).toBe("/art/scene14/badges/done.svg");
    expect(artSrc("/art/scene14/avatar/operator.svg", true)).toBe("/art/scene14/avatar/operator.svg");
    expect(artSrc("/map/map_spots.json", true)).toBe("/map/map_spots.json");
    expect(artSrc(`${STATIC_ROOT}map/map.svg`, true)).toBe(`${STATIC_ROOT}map/map.svg`);
  });

  it("reads the media query and is false without a window", () => {
    const query = (matches: boolean) => ({ matchMedia: () => ({ matches }) as MediaQueryList });
    expect(readReducedMotion(query(true))).toBe(true);
    expect(readReducedMotion(query(false))).toBe(false);
    expect(readReducedMotion(undefined)).toBe(false);
  });
});

describe("static frames", () => {
  it("lists exactly the animated scene14 SVGs", () => {
    const animated = svgs(art)
      .filter((file) => isAnimatedSvg(readFileSync(file, "utf8")))
      .map((file) => relative(art, file).split("\\").join("/"))
      .sort();
    expect([...ANIMATED_ART].sort()).toEqual(animated);
  });

  it("has an up-to-date static twin for each (run npm run art:static -w @levex/web)", () => {
    for (const rel of ANIMATED_ART) {
      const source = readFileSync(join(art, rel), "utf8");
      const still = readFileSync(join(art, "_static", rel), "utf8");
      expect(still, rel).toBe(staticFrame(source));
      expect(still, rel).toContain("animation:none!important");
    }
  });

  it("keeps the drawing and only appends the stop style", () => {
    const frame = staticFrame('<svg xmlns="http://www.w3.org/2000/svg"><style>.ti{animation:ti 1s}</style><path class="ti"/></svg>');
    expect(frame.startsWith('<svg xmlns="http://www.w3.org/2000/svg"><style>.ti{animation:ti 1s}</style><path class="ti"/>')).toBe(true);
    expect(frame.endsWith("</style></svg>")).toBe(true);
    expect(() => staticFrame("<div/>")).toThrow();
    expect(ART_ROOT).toBe("/art/scene14/");
  });
});
