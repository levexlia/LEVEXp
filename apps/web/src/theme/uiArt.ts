import type { MapNodeId } from "@levex/domain";

/** scene14 UI art paths, one place to change them. All of these files are static (no animation). */
const UI = "/art/scene14/ui";

export type TabIcon = "map" | "missions" | "resources" | "profile";
export type HeaderIcon = "streak" | "energy" | "camera";

/** Tab bar icon: grey when inactive, cyan when active. */
export function tabIconUrl(tab: TabIcon, active: boolean): string {
  return `${UI}/ic_tab_${tab}${active ? "_active" : ""}.svg`;
}

/** Header and button icons, already in their own colours (orange flame, gold bolt, cyan camera). */
export function uiIconUrl(name: HeaderIcon): string {
  return `${UI}/ic_${name}.svg`;
}

/** 96 px hex frame behind the place icon in the place sheet; grey when the place is locked. */
export function hexFrameUrl(id: MapNodeId, locked: boolean): string {
  return `${UI}/hex_frame_96_${locked ? "locked" : id}.svg`;
}

/** 40 px level hex; the digits are HTML text on top. */
export const HEX_LEVEL_URL = `${UI}/hex_level.svg`;

/** Empty hex for an open mission row (the done row uses ic_check). */
export const MISSION_OPEN_URL = "/art/scene14/badges/mission_open.svg";

/** 40 px reward icon (cyan hex, gold star) for the done sheet's earned-XP row. */
export const REWARD_ICON_URL = `${UI}/ic_reward.svg`;
