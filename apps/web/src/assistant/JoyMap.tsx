/**
 * scene16 A on the map: a spark from the robot to the dome of the place, a wave on the island, the
 * place's progress tag and, only when XP was granted, «+N XP» over the dome. One play, no loop.
 * Reduced motion: no spark and no wave; the tag and «+N XP» stand still. Purely visual (aria-hidden):
 * the toast already says what happened.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { MapNodeId } from "@levex/domain";
import scene14Domes from "../map/scene14_domes.json";
import { toViewPercent } from "../map/spots";
import { REWARD_ICON_URL } from "../theme/uiArt";
import { joyFxSrc } from "./art";

export interface MapJoy {
  /** Changes on every mark, so the layer replays. */
  id: number;
  gainedXp: number;
  place: { id: MapNodeId; done: number; total: number } | null;
}

/** Island foot and dome top of a place, in scene units (scene14 dome boxes). */
function domePoints(id: MapNodeId): { foot: [number, number]; top: [number, number] } {
  const [x, y, w, h] = scene14Domes.domes[id].scene720 as [number, number, number, number];
  return { foot: [x + w / 2, y + h * 0.8], top: [x + w / 2, y + h * 0.12] };
}

export function JoyMap({ joy, reducedMotion, robotRef }: { joy: MapJoy; reducedMotion: boolean; robotRef: RefObject<HTMLElement | null> }) {
  const layer = useRef<HTMLDivElement>(null);
  const [spark, setSpark] = useState<{ x: number; y: number } | null>(null);
  const points = joy.place ? domePoints(joy.place.id) : null;
  const foot = points ? toViewPercent(points.foot) : null;
  const top = points ? toViewPercent(points.top) : null;

  // Spark start = robot's chest, relative to the island foot (measured once per mark).
  useLayoutEffect(() => {
    if (reducedMotion || !foot || !layer.current || !robotRef.current) return;
    const box = layer.current.getBoundingClientRect();
    const robot = robotRef.current.getBoundingClientRect();
    const fx = (parseFloat(foot.left) / 100) * box.width;
    const fy = (parseFloat(foot.top) / 100) * box.height;
    setSpark({ x: robot.left - box.left + robot.width / 2 - fx, y: robot.top - box.top + robot.height * 0.35 - fy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joy.id, reducedMotion]);

  return (
    <div ref={layer} className={`lx-joy-map${reducedMotion ? " is-static" : " is-anim"}`} data-joy={joy.id} aria-hidden="true">
      {foot && !reducedMotion && spark ? (
        <img
          className="lx-joy-spark"
          src={joyFxSrc("fx_spark", false)}
          width={24}
          height={24}
          alt=""
          style={{ left: foot.left, top: foot.top, ["--sx" as string]: `${spark.x}px`, ["--sy" as string]: `${spark.y}px` } as CSSProperties}
        />
      ) : null}
      {foot && !reducedMotion ? (
        <img className="lx-joy-hit" src={joyFxSrc("fx_dome_hit", false)} width={160} height={80} alt="" style={{ left: foot.left, top: foot.top }} />
      ) : null}
      {joy.place && foot ? (
        <span className="lx-tag lx-joy-tag" style={{ left: foot.left, top: foot.top }}>
          {joy.place.done} / {joy.place.total}
        </span>
      ) : null}
      {joy.gainedXp > 0 ? (
        <span className="lx-float lx-joy-float" style={top ? { left: top.left, top: top.top } : undefined} data-near={top ? "dome" : "robot"}>
          <img src={REWARD_ICON_URL} width={16} height={16} alt="" />+{joy.gainedXp} XP
        </span>
      ) : null}
    </div>
  );
}
