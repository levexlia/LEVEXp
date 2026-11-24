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
  finance: "sp_finance",
  relationships: "sp_relationships",
} as const;

export type KitIconName = keyof typeof ICONS;

export function kitIconUrl(name: KitIconName): string {
  return `/map/${ICONS[name]}.svg`;
}

export function KitIcon({ name, size = 22 }: { name: KitIconName; size?: number }) {
  return (
    <img className="kit-icon" src={kitIconUrl(name)} width={size} height={size} alt="" />
  );
}

export const SPHERE_ICON: Record<string, KitIconName> = {
  health: "sport",
  mind: "knowledge",
  career: "materials",
  finance: "finance",
  relationships: "relationships",
  creativity: "creative",
  spirit: "growth",
  community: "community",
};
