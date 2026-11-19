/**
 * Reduced motion for the scene14 art.
 *
 * Most scene14 SVGs animate with CSS inside the file. An SVG shown through <img> or <image>
 * cannot be paused from the page, so each animated file has a static twin under
 * `/art/scene14/_static/` (same relative path). `npm run art:static -w @levex/web` rebuilds them.
 */

export const ART_ROOT = "/art/scene14/";
export const STATIC_ROOT = "/art/scene14/_static/";

/** Stops every animation and hides the moving-only layers (trail, scan line, pulse rings). */
export const STATIC_STYLE =
  "<style>*,*::before,*::after{animation:none!important;transition:none!important}" +
  ".ti,.xtr,.xscan,.xring,.xtok{display:none!important}</style>";

export function isAnimatedSvg(source: string): boolean {
  return /@keyframes|animation\s*:/.test(source);
}

/** The static frame of one animated SVG: the same drawing with the style above appended. */
export function staticFrame(source: string): string {
  const end = source.lastIndexOf("</svg>");
  if (end === -1) throw new Error("not an svg");
  return `${source.slice(0, end)}${STATIC_STYLE}${source.slice(end)}`;
}

/** Art URLs that have a static twin. Kept in sync with the files by src/theme/motion.test.ts. */
export const ANIMATED_ART = new Set<string>([
  "domes/center_available.svg", "domes/center_current.svg", "domes/center_done.svg", "domes/center_locked.svg",
  "domes/home_available.svg", "domes/home_current.svg", "domes/home_done.svg", "domes/home_locked.svg",
  "domes/park_available.svg", "domes/park_current.svg", "domes/park_done.svg", "domes/park_locked.svg",
  "domes/study_available.svg", "domes/study_current.svg", "domes/study_done.svg", "domes/study_locked.svg",
  "domes/workshop_available.svg", "domes/workshop_current.svg", "domes/workshop_done.svg", "domes/workshop_locked.svg",
  "places/center.svg", "places/center_locked.svg", "places/home.svg", "places/home_locked.svg",
  "places/park.svg", "places/park_locked.svg", "places/study.svg", "places/study_locked.svg",
  "places/workshop.svg", "places/workshop_locked.svg",
  "badges/current.svg",
  "map/map.svg", "map/map_720x1280.svg",
  "ui/chip_center.svg", "ui/chip_home.svg", "ui/chip_park.svg", "ui/chip_study.svg", "ui/chip_workshop.svg",
]);

/** The URL to draw for a piece of art: the static twin when motion is reduced and one exists. */
export function artSrc(url: string, reducedMotion: boolean): string {
  if (!reducedMotion || !url.startsWith(ART_ROOT) || url.startsWith(STATIC_ROOT)) return url;
  const rel = url.slice(ART_ROOT.length);
  return ANIMATED_ART.has(rel) ? `${STATIC_ROOT}${rel}` : url;
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Reads the media query once; `subscribe` wires it to React (see useReducedMotion). */
export function readReducedMotion(win: Pick<Window, "matchMedia"> | undefined = globalThis.window): boolean {
  return Boolean(win?.matchMedia?.(REDUCED_MOTION_QUERY).matches);
}
