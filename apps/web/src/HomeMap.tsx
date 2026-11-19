import { MAP_NODES, mapNodeStates, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useEffect, useId, useState } from "react";
import type { Goal } from "./api";
import { placeIconUrl } from "./map/placeIcons";
import scene14Domes from "./map/scene14_domes.json";
import {
  BADGE_FILE,
  BADGE_RADIUS,
  MAP_SVG,
  MAP_VIEW,
  SCENE_SIZE,
  SPOTS,
  domeEllipse,
  lockedHint,
  toViewPercent,
  type Spot,
} from "./map/spots";

/** Kit badges are drawn in a 919 box; this is their visual centre. */
const BADGE_CENTER: [number, number] = [24, 24];
const BADGE_BOX = 48;
const HINT_MS = 4200;

const STATE_WORD: Record<MapNodeState, string> = {
  done: "пройдено",
  current: "сейчас здесь",
  available: "открыто",
  locked: "закрыто",
};

export function HomeMap({
  level,
  xp,
  goals,
  onOpen,
}: {
  level: number;
  xp: number;
  goals: Goal[];
  onOpen: (id: MapNodeId) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hintFor, setHintFor] = useState<MapNodeId | null>(null);
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  const stateOf = new Map(mapNodeStates({ level, doneSpheres }).map((node) => [node.id, node.state]));
  const state = (id: MapNodeId): MapNodeState => stateOf.get(id) ?? "locked";

  useEffect(() => {
    if (!hintFor) return;
    const timer = window.setTimeout(() => setHintFor(null), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hintFor]);

  function tap(id: MapNodeId) {
    if (state(id) === "locked") {
      setHintFor(id);
      return;
    }
    setHintFor(null);
    onOpen(id);
  }

  const hintSpot = hintFor ? SPOTS.find((spot) => spot.id === hintFor) : undefined;

  return (
    <div className="map-stage">
      <svg
        className="district"
        viewBox={`${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.w} ${MAP_VIEW.h}`}
        role="img"
        aria-label={`Карта: ${MAP_NODES.map((node) => node.name).join(", ")}`}
      >
        <defs>
          <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={`${uid}-halo`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          {/* Locked dome: cool light grey, like the scene 11 mock. */}
          <filter id={`${uid}-grey`} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.264 0.519 0.097 0 0.30  0.276 0.543 0.101 0 0.31  0.318 0.626 0.117 0 0.36  0 0 0 1 0"
            />
          </filter>
          {SPOTS.map((spot) => {
            const dome = domeEllipse(spot);
            return (
              <clipPath key={spot.id} id={`${uid}-dome-${spot.id}`}>
                <ellipse cx={dome.cx} cy={dome.cy} rx={dome.rx} ry={dome.ry} />
              </clipPath>
            );
          })}
        </defs>
        <image href={MAP_SVG} x="0" y="0" width={SCENE_SIZE.w} height={SCENE_SIZE.h} pointerEvents="none" />
        {SPOTS.map((spot) => (
          <DomeState key={spot.id} spot={spot} state={state(spot.id)} uid={uid} />
        ))}
        {SPOTS.map((spot) => (
          <SpotBadge key={spot.id} spot={spot} state={state(spot.id)} uid={uid} onTap={() => tap(spot.id)} />
        ))}
      </svg>
      {SPOTS.map((spot) => (
        <SpotLabel key={spot.id} spot={spot} state={state(spot.id)} onTap={() => tap(spot.id)} />
      ))}
      {hintSpot ? (
        <p
          className="map-hint"
          role="status"
          style={{ top: toViewPercent([hintSpot.badge[0], hintSpot.badge[1] + BADGE_RADIUS + 70]).top }}
          onClick={() => setHintFor(null)}
        >
          <img src="/art/scene14/badges/locked.svg" width={22} height={22} alt="" />
          {lockedHint(hintSpot.id, { level, xp })}
        </p>
      ) : null}
    </div>
  );
}

function DomeState({ spot, state }: { spot: Spot; state: MapNodeState; uid: string }) {
  // scene14: one self-contained SVG per place and state, boxed in scene (720×1280) units.
  const [x, y, w, h] = scene14Domes.domes[spot.id].scene720;
  return <image href={`/art/scene14/domes/${spot.id}_${state}.svg`} x={x} y={y} width={w} height={h} pointerEvents="none" />;
}

function SpotBadge({ spot, state, uid, onTap }: { spot: Spot; state: MapNodeState; uid: string; onTap: () => void }) {
  const [x, y] = spot.badge;
  const scale = (BADGE_RADIUS * 2) / (BADGE_BOX * 0.833);
  return (
    <g
      className={`map-node ${state}`}
      data-node={spot.id}
      data-state={state}
      role="button"
      tabIndex={0}
      aria-label={`${spot.label}: ${STATE_WORD[state]}`}
      onClick={onTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTap();
        }
      }}
    >
      {state === "current" ? (
        <circle cx={x} cy={y} r={BADGE_RADIUS * 0.95} fill="#a855f7" opacity="0.45" filter={`url(#${uid}-halo)`} />
      ) : null}
      <image
        href={BADGE_FILE[state]}
        width={BADGE_BOX}
        height={BADGE_BOX}
        transform={`translate(${x} ${y}) scale(${scale.toFixed(4)}) translate(${-BADGE_CENTER[0]} ${-BADGE_CENTER[1]})`}
      />
      <circle cx={x} cy={y} r={BADGE_RADIUS} fill="#fff" opacity="0" />
    </g>
  );
}

function SpotLabel({ spot, state, onTap }: { spot: Spot; state: MapNodeState; onTap: () => void }) {
  const [x, y] = spot.badge;
  const anchorX = spot.side === "left" ? x - BADGE_RADIUS : spot.side === "right" ? x + BADGE_RADIUS : x;
  const at = toViewPercent([anchorX, y + BADGE_RADIUS + 34]);
  return (
    <button
      type="button"
      className={`spot-label ${spot.side} is-${state}`}
      style={{ left: at.left, top: at.top }}
      onClick={onTap}
      tabIndex={-1}
      aria-hidden="true"
    >
      <img src={placeIconUrl(spot.id)} width={18} height={18} alt="" />
      {spot.label}
    </button>
  );
}

export function missionsFor(nodeId: MapNodeId, goals: Goal[]): Goal[] {
  const node = MAP_NODES.find((item) => item.id === nodeId);
  if (!node) return [];
  return goals.filter((goal) => goal.sphere === node.sphere);
}
