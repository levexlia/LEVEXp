import { MAP_NODES, mapNodeStates, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useId } from "react";
import type { Goal } from "./api";
import { ART } from "./map/art";
import {
  BADGE_CENTER,
  BADGE_SCALE,
  MAP_VIEW,
  PLACES,
  PROPS,
  placeName,
  ribbonPath,
  segmentLit,
  type Place,
} from "./map/layout";

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
    ...PLACES.map((place) => ({
      part: place.building,
      at: place.at,
      scale: place.scale,
      locked: false,
      y: place.at[1],
      location: place.id,
    })),
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
        <pattern id={`${uid}-ground`} width="64" height="32" patternUnits="userSpaceOnUse" patternTransform="scale(0.5)">
          <image href="/map/ground_tile.svg" width="128" height="64" />
        </pattern>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect x={MAP_VIEW.x} y={MAP_VIEW.y} width={MAP_VIEW.w} height={MAP_VIEW.h} fill={`url(#${uid}-sky)`} pointerEvents="none" />
      <rect x={MAP_VIEW.x} y={MAP_VIEW.y} width={MAP_VIEW.w} height={MAP_VIEW.h} fill={`url(#${uid}-ground)`} pointerEvents="none" />
      {scenery.map((item, index) => {
        const state = item.location ? stateOf.get(item.location) : undefined;
        const locked = Boolean(item.locked) || state === "locked";
        return (
          <g
            key={`${item.part}-${index}`}
            onClick={item.location && state !== "locked" ? () => onOpen(item.location as MapNodeId) : undefined}
          >
            <Sprite part={item.part} at={item.at} scale={item.scale} locked={locked} />
          </g>
        );
      })}
      {PLACES.slice(0, -1).map((place, index) => {
        const next = PLACES[index + 1]!;
        const lit = segmentLit(stateOf.get(next.id) ?? "locked");
        const d = ribbonPath(place.badge, next.badge);
        return (
          <g key={`path-${place.id}`} pointerEvents="none">
            <path d={d} fill="none" stroke="#0a1c46" strokeWidth="16" strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke={lit ? "#25cbfd" : "#8e94ae"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={lit ? undefined : "1 16"}
            />
          </g>
        );
      })}
      {PLACES.map((place) => (
        <NodeBadge
          key={place.id}
          place={place}
          state={stateOf.get(place.id) ?? "locked"}
          uid={uid}
          onOpen={onOpen}
        />
      ))}
    </svg>
  );
}

function Sprite({
  part,
  at,
  scale,
  locked,
}: {
  part: string;
  at: [number, number];
  scale: number;
  locked: boolean;
}) {
  const art = ART[part];
  if (!art) return null;
  const file = locked ? `${part}_locked` : part;
  const [ax, ay] = art.anchor;
  return (
    <image
      href={`/map/${file}.svg`}
      width={art.w}
      height={art.h}
      transform={`translate(${at[0]} ${at[1]}) scale(${scale}) translate(${-ax} ${-ay})`}
    />
  );
}

function NodeBadge({
  place,
  state,
  uid,
  onOpen,
}: {
  place: Place;
  state: MapNodeState;
  uid: string;
  onOpen: (id: MapNodeId) => void;
}) {
  const name = placeName(place.id);
  const [lx, ly] = place.label;
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
        {state === "current" ? (
          <image
            className="badge-halo current"
            href="/map/badge_halo_current.svg"
            width="919"
            height="919"
            filter={`url(#${uid}-glow)`}
            transform={`translate(${place.badge[0]} ${place.badge[1]}) scale(0.12) translate(${-BADGE_CENTER[0]} ${-BADGE_CENTER[1]})`}
          />
        ) : null}
        {state === "available" ? (
          <AvailableBadge x={place.badge[0]} y={place.badge[1]} />
        ) : (
          <image
            href={`/map/badge_${state}_full.svg`}
            width="919"
            height="919"
            transform={`translate(${place.badge[0]} ${place.badge[1]}) scale(${BADGE_SCALE}) translate(${-BADGE_CENTER[0]} ${-BADGE_CENTER[1]})`}
          />
        )}
        <circle cx={place.badge[0]} cy={place.badge[1]} r="32" fill="#fff" opacity="0" />
      </g>
      <Chip place={place} lx={lx} ly={ly} dim={state === "locked"} onOpen={open} />
    </g>
  );
}

function AvailableBadge({ x, y }: { x: number; y: number }) {
  return (
    <polygon
      transform={`translate(${x} ${y})`}
      points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15"
      fill="#1b1442"
      stroke="#c4b5fd"
      strokeWidth="3.5"
    />
  );
}

function Chip({
  place,
  lx,
  ly,
  dim,
  onOpen,
}: {
  place: Place;
  lx: number;
  ly: number;
  dim: boolean;
  onOpen: () => void;
}) {
  const { w, h } = place.chip;
  const top = ly - h / 2;
  return (
    <g onClick={onOpen} style={{ cursor: dim ? "default" : "pointer" }}>
      <rect x={lx - w / 2} y={top} width={w} height={h} rx="10" fill="#12102a" stroke="#0a1c46" strokeWidth="1.5" />
      {place.lines.map((line, index) => (
        <text
          key={line}
          x={lx}
          y={top + 15 + index * 14}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fontFamily="Fredoka, Inter, sans-serif"
          fill={dim ? "#aeb4d0" : "#ffffff"}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function missionsFor(nodeId: MapNodeId, goals: Goal[]): Goal[] {
  const node = MAP_NODES.find((item) => item.id === nodeId);
  if (!node) return [];
  return goals.filter((goal) => goal.sphere === node.sphere);
}
