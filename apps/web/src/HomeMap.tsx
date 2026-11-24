import { MAP_NODES, mapNodeStates, type MapNodeId, type MapNodeState } from "@levex/domain";
import type { Goal } from "./api";
import { placeIconUrl } from "./map/placeIcons";
import scene14Domes from "./map/scene14_domes.json";
import { BADGE_ART_RADIUS, BADGE_FILE, BADGE_RADIUS, MAP_SVG, MAP_VIEW, SCENE_SIZE, SPOTS, toViewPercent, type Spot } from "./map/spots";
import { artSrc } from "./theme/motion";

/** scene14 badges are drawn in a 48 box centred on 24,24; the hex fills about 0.833 of it. */
const BADGE_FILL = 0.833;

const STATE_WORD: Record<MapNodeState, string> = {
  done: "пройдено",
  current: "сейчас здесь",
  available: "открыто",
  locked: "закрыто",
};

export function mapStates(level: number, goals: readonly Goal[]): Map<MapNodeId, MapNodeState> {
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  return new Map(mapNodeStates({ level, doneSpheres }).map((node) => [node.id, node.state]));
}

export function HomeMap({
  states,
  reducedMotion,
  onOpen,
}: {
  states: Map<MapNodeId, MapNodeState>;
  reducedMotion: boolean;
  onOpen: (id: MapNodeId) => void;
}) {
  const state = (id: MapNodeId): MapNodeState => states.get(id) ?? "locked";
  return (
    <div className="map-stage">
      <svg
        className="district"
        viewBox={`${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.w} ${MAP_VIEW.h}`}
        role="img"
        aria-label={`Карта: ${MAP_NODES.map((node) => node.name).join(", ")}`}
      >
        <image href={MAP_SVG} x="0" y="0" width={SCENE_SIZE.w} height={SCENE_SIZE.h} pointerEvents="none" />
        {SPOTS.map((spot) => (
          <Dome key={spot.id} spot={spot} state={state(spot.id)} reducedMotion={reducedMotion} />
        ))}
        {SPOTS.map((spot) => (
          <SpotBadge key={spot.id} spot={spot} state={state(spot.id)} reducedMotion={reducedMotion} onTap={() => onOpen(spot.id)} />
        ))}
      </svg>
      {SPOTS.map((spot) => (
        <SpotChip key={spot.id} spot={spot} state={state(spot.id)} reducedMotion={reducedMotion} onTap={() => onOpen(spot.id)} />
      ))}
    </div>
  );
}

function Dome({ spot, state, reducedMotion }: { spot: Spot; state: MapNodeState; reducedMotion: boolean }) {
  // One self-contained SVG per place and state, boxed in scene (720×1280) units.
  const [x, y, w, h] = scene14Domes.domes[spot.id].scene720;
  return (
    <image
      href={artSrc(`/art/scene14/domes/${spot.id}_${state}.svg`, reducedMotion)}
      x={x}
      y={y}
      width={w}
      height={h}
      pointerEvents="none"
    />
  );
}

function SpotBadge({ spot, state, reducedMotion, onTap }: { spot: Spot; state: MapNodeState; reducedMotion: boolean; onTap: () => void }) {
  const [x, y] = spot.badge;
  const size = (BADGE_ART_RADIUS * 2) / BADGE_FILL;
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
      <image href={artSrc(BADGE_FILE[state], reducedMotion)} x={x - size / 2} y={y - size / 2} width={size} height={size} />
      <circle cx={x} cy={y} r={BADGE_RADIUS} fill="#fff" opacity="0" />
    </g>
  );
}

function SpotChip({ spot, state, reducedMotion, onTap }: { spot: Spot; state: MapNodeState; reducedMotion: boolean; onTap: () => void }) {
  const [x, y] = spot.badge;
  const locked = state === "locked";
  const edge = BADGE_ART_RADIUS + 8;
  const anchorX = spot.side === "left" ? x - edge : spot.side === "right" ? x + edge : x;
  const at = toViewPercent([anchorX, y + BADGE_ART_RADIUS + 34]);
  return (
    <button
      type="button"
      className={`lx-chip spot-chip ${spot.side}${locked ? " is-locked" : ""}`}
      style={{ left: at.left, top: at.top, ["--place" as string]: `var(--lx-place-${spot.id})` }}
      onClick={onTap}
      tabIndex={-1}
      aria-hidden="true"
    >
      <span className="lx-chip__in">
        <img src={artSrc(placeIconUrl(spot.id, locked), reducedMotion)} width={22} height={22} alt="" />
        {spot.label}
      </span>
    </button>
  );
}

export function missionsFor(nodeId: MapNodeId, goals: Goal[]): Goal[] {
  const node = MAP_NODES.find((item) => item.id === nodeId);
  if (!node) return [];
  return goals.filter((goal) => goal.sphere === node.sphere);
}
