import { LIFE_SPHERES, MAP_NODES, type LifeSphereId } from "@levex/domain";

/** Example missions per sphere for the «Ресурсы» hint (the seeds and typical own missions). */
const EXAMPLES: Partial<Record<LifeSphereId, string>> = {
  health: "прогулка, зарядка, сон",
  mind: "чтение, учёба",
  spirit: "тишина, прогулка без телефона",
  creativity: "рисунок, поделка, Proof",
  community: "помощь другим",
};

export interface SphereRow {
  id: LifeSphereId;
  name: string;
  xp: number;
  /** No XP yet: the row is dimmed and shows {@link hint}. */
  zero: boolean;
  /** Which missions grow this sphere (only for zero rows). */
  hint: string | null;
}

/** Где растёт сфера: место на карте (и уровень, если оно ещё закрыто) или честное «пока нет». */
export function sphereHint(sphere: LifeSphereId, level: number): string {
  const node = MAP_NODES.find((n) => n.sphere === sphere);
  if (!node) return "Миссий для этой сферы пока нет: они появятся в новых местах.";
  const examples = EXAMPLES[sphere] ? `: ${EXAMPLES[sphere]}` : "";
  const lock = level < node.unlockLevel ? ` Место откроется на уровне ${node.unlockLevel}.` : "";
  return `Растёт от миссий в месте «${node.name}»${examples}.${lock}`;
}

/** All 8 spheres in the domain order, with XP (0 when absent) and a hint for the empty ones. */
export function sphereRows(xpBySphere: Partial<Record<string, number>>, level: number): SphereRow[] {
  return LIFE_SPHERES.map((sphere) => {
    const xp = Math.max(0, xpBySphere[sphere.id] ?? 0);
    return { id: sphere.id, name: sphere.name, xp, zero: xp === 0, hint: xp === 0 ? sphereHint(sphere.id, level) : null };
  });
}
