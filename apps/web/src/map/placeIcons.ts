import type { MapNodeId } from "@levex/domain";

/**
 * The one place that says which icon each map place uses.
 * scene14 (X «Неон-кибер») icons live in `apps/web/public/art/scene14/places/`:
 * `{id}.svg` and a grey `{id}_locked.svg`. To swap the set, drop new SVGs there under
 * the same names, or change the folder / names below.
 */
export const PLACE_ICON_DIR = "/art/scene14/places";

export const PLACE_ICON_FILE: Record<MapNodeId, string> = {
  home: "home.svg",
  study: "study.svg",
  park: "park.svg",
  workshop: "workshop.svg",
  center: "center.svg",
};

export function placeIconUrl(id: MapNodeId, locked = false): string {
  const file = PLACE_ICON_FILE[id];
  return `${PLACE_ICON_DIR}/${locked ? file.replace(/\.svg$/, "_locked.svg") : file}`;
}
