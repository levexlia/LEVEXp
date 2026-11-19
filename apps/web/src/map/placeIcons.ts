import type { MapNodeId } from "@levex/domain";

/**
 * The one place that says which icon each map place uses.
 * Files live in `apps/web/public/icons/places/`. To swap the set (icons2 → icons3),
 * drop new SVGs there under the same names, or change the folder / names below.
 */
export const PLACE_ICON_DIR = "/art/scene14/places";

export const PLACE_ICON_FILE: Record<MapNodeId, string> = {
  home: "home.svg",
  study: "study.svg",
  park: "park.svg",
  workshop: "workshop.svg",
  center: "center.svg",
};

export function placeIconUrl(id: MapNodeId): string {
  return `${PLACE_ICON_DIR}/${PLACE_ICON_FILE[id]}`;
}
