import { KIT } from "./assets";

const ICONS = {
  streak: "ic_streak",
  energy: "ic_energy",
  level: "ic_level",
  xp: "ic_xp",
  camera: "ic_camera",
  map: "ic_map",
  missions: "ic_missions",
  resources: "ic_resources",
  profile: "ic_profile",
  sport: "sp_sport",
  knowledge: "sp_knowledge",
  creative: "sp_creative",
  community: "sp_community",
  growth: "sp_growth",
  materials: "sp_materials",
} as const;

export type KitIconName = keyof typeof ICONS;

const bodies = new Map<string, { viewBox: string; body: string }>();

function art(id: string): { viewBox: string; body: string } {
  const hit = bodies.get(id);
  if (hit) return hit;
  const raw = KIT[id] ?? "";
  const parsed = {
    viewBox: raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 64 64",
    body: raw.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, ""),
  };
  bodies.set(id, parsed);
  return parsed;
}

export function KitIcon({ name, size = 22 }: { name: KitIconName; size?: number }) {
  const { viewBox, body } = art(ICONS[name]);
  return (
    <svg className="kit-icon" viewBox={viewBox} width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />
  );
}

export const SPHERE_ICON: Record<string, KitIconName> = {
  health: "sport",
  mind: "knowledge",
  career: "materials",
  creativity: "creative",
  spirit: "growth",
  community: "community",
};
