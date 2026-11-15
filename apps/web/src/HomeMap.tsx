import { MAP_NODES, mapNodeStates, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useId } from "react";
import type { Goal } from "./api";
import { painted } from "./map/markup";
import {
  BADGE_CENTER,
  BADGE_SCALE,
  MAP_VIEW,
  PLACES,
  PROPS,
  labelPoint,
  partAnchor,
  placeName,
  ribbonPath,
  segmentLit,
  type Place,
} from "./map/layout";

const BADGE_ART: Record<MapNodeState, string> = {
  done: "badge_done_full",
  current: "badge_current_full",
  locked: "badge_locked_full",
};

const HALO_ART: Record<MapNodeState, string> = {
  done: "badge_halo_done",
  current: "badge_halo_current",
  locked: "badge_halo_locked",
};

export function HomeMap({
  level,
  goals,
  onOpen,
}: {
  level: number;
  goals: Goal[];
  onOpen: (id: MapNodeId) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  const nodes = mapNodeStates({ level, doneSpheres });
  const stateOf = new Map(nodes.map((node) => [node.id, node.state]));
  const scenery = [
    ...PROPS.map((prop) => ({ ...prop, y: prop.at[1], location: null as MapNodeId | null })),
    ...PLACES.map((place) => ({ part: place.building, at: place.at, scale: place.scale, locked: false, y: place.at[1], location: place.id })),
  ].sort((a, b) => a.y - b.y);

  return (
    <svg
      className="district"
      viewBox={`${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.w} ${MAP_VIEW.h}`}
      role="img"
      aria-label="Карта района: Дом, Учебный центр, Парк, Мастерская, Центр LEVEX"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B0B1F" />
          <stop offset="1" stopColor="#14123a" />
        </linearGradient>
        <pattern id={`${uid}-ground`} width="128" height="64" patternUnits="userSpaceOnUse" patternTransform="scale(0.5)">
          <g dangerouslySetInnerHTML={{ __html: painted("ground_tile") }} />
        </pattern>
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect x={MAP_VIEW.x} y={MAP_VIEW.y} width={MAP_VIEW.w} height={MAP_VIEW.h} fill={`url(#${uid}-sky)`} pointerEvents="none" />
      <rect x={MAP_VIEW.x - 40} y={MAP_VIEW.y} width={MAP_VIEW.w + 80} height={MAP_VIEW.h} fill={`url(#${uid}-ground)`} pointerEvents="none" />
      {scenery.map((item, index) => {
        const state = item.location ? stateOf.get(item.location) : undefined;
        const locked = item.locked || state === "locked";
        const [ax, ay] = partAnchor(item.part);
        const halo = item.location && state ? `halo_${item.part}` : item.locked ? `halo_${item.part}` : null;
        return (
          <g key={`${item.part}-${index}`}>
            {halo ? (
              <g
                className={state === "current" ? "bld-halo current" : "bld-halo"}
                filter={`url(#${uid}-glow)`}
                opacity={state === "current" ? 0.7 : state === "done" ? 0.4 : 0.22}
                transform={placeTransform([item.at[0], item.at[1] + 8], item.scale * 1.08, ax, ay)}
                dangerouslySetInnerHTML={{ __html: painted(halo, locked) }}
              />
            ) : null}
            <g
              transform={placeTransform(item.at, item.scale, ax, ay)}
              dangerouslySetInnerHTML={{ __html: painted(item.part, locked) }}
              onClick={item.location && state !== "locked" ? () => onOpen(item.location as MapNodeId) : undefined}
            />
          </g>
        );
      })}
      {PLACES.slice(0, -1).map((place, index) => {
        const next = PLACES[index + 1]!;
        const lit = segmentLit(stateOf.get(next.id) ?? "locked");
        const d = ribbonPath(place.badge, next.badge);
        return (
          <g key={`path-${place.id}`}>
            <path d={d} fill="none" stroke="#0a1c46" strokeWidth="20" strokeLinecap="round" pointerEvents="none" />
            <path
              d={d}
              fill="none"
              stroke={lit ? "#25cbfd" : "#8e94ae"}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={lit ? undefined : "1 18"}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {PLACES.map((place) => (
        <NodeBadge
          key={place.id}
          place={place}
          state={stateOf.get(place.id) ?? "locked"}
          onOpen={onOpen}
        />
      ))}
    </svg>
  );
}

function placeTransform(at: [number, number], scale: number, ax: number, ay: number): string {
  return `translate(${at[0]} ${at[1]}) scale(${scale}) translate(${-ax} ${-ay})`;
}

function NodeBadge({
  place,
  state,
  onOpen,
}: {
  place: Place;
  state: MapNodeState;
  onOpen: (id: MapNodeId) => void;
}) {
  const name = placeName(place.id);
  const [lx, ly] = labelPoint(place);
  const width = Math.ceil(name.length * 7.15 + 18);
  const open = () => {
    if (state !== "locked") onOpen(place.id);
  };
  return (
    <g className={`map-node ${state}`} data-node={place.id}>
      <g
        role="button"
        tabIndex={state === "locked" ? -1 : 0}
        aria-disabled={state === "locked" || undefined}
        aria-label={name}
        onClick={open}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && state !== "locked") {
            event.preventDefault();
            open();
          }
        }}
      >
        <g
          className={state === "current" ? "badge-halo current" : "badge-halo"}
          transform={placeTransform(place.badge, state === "current" ? 0.125 : 0.105, BADGE_CENTER[0], BADGE_CENTER[1])}
          dangerouslySetInnerHTML={{ __html: painted(HALO_ART[state]) }}
        />
        <g
          transform={placeTransform(place.badge, BADGE_SCALE, BADGE_CENTER[0], BADGE_CENTER[1])}
          dangerouslySetInnerHTML={{ __html: painted(BADGE_ART[state]) }}
        />
        <circle cx={place.badge[0]} cy={place.badge[1]} r="34" fill="#fff" opacity="0" />
      </g>
      <g onClick={open} style={{ cursor: state === "locked" ? "default" : "pointer" }}>
        <rect x={lx - width / 2} y={ly - 14} width={width} height={19} rx="9" fill="#14122c" opacity="0.94" />
        <text
          x={lx}
          y={ly}
          textAnchor="middle"
          fontSize="12.5"
          fontWeight="600"
          fontFamily="Fredoka, Inter, sans-serif"
          fill={state === "locked" ? "#aeb4d0" : "#ffffff"}
        >
          {name}
        </text>
      </g>
    </g>
  );
}

export function missionsFor(nodeId: MapNodeId, goals: Goal[]): Goal[] {
  const node = MAP_NODES.find((item) => item.id === nodeId);
  if (!node) return [];
  return goals.filter((goal) => goal.sphere === node.sphere);
}
