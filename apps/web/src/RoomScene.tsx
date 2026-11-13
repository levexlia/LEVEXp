import { isDisplayableImageUrl } from "@levex/domain";
import { useEffect, useState, type CSSProperties } from "react";
import type { Goal, Placement } from "./api";
import {
  WALL_H,
  boxFaces,
  iso,
  leftWall,
  leftWallImageMatrix,
  pts,
  rightWall,
  rightWallImageMatrix,
} from "./iso";

const ROOM_X = 6;
const ROOM_Y = 5;

/** How many completed creativity goals already have a photo on the wall. */
export function hungWorkCount(goals: Goal[], placements: Placement[]): number {
  const done = new Set(
    goals.filter((goal) => goal.status === "done" && goal.sphere === "creativity").map((goal) => goal.id),
  );
  return placements.filter((placement) => {
    const goalId = placement.artifact.goalId;
    return goalId !== undefined && done.has(goalId);
  }).length;
}

/** 0 bare, 1 rug, 2 lamp, 3 plant. Derived only from saved work. */
export function roomStage(hung: number): 0 | 1 | 2 | 3 {
  if (hung >= 3) return 3;
  if (hung >= 2) return 2;
  if (hung >= 1) return 1;
  return 0;
}

type TimeOfDay = "day" | "dusk" | "night";

export function RoomScene({
  placements,
  goals,
  broken,
  onImageError,
  cheer,
  avatarUrl,
}: {
  placements: Placement[];
  goals: Goal[];
  broken: Record<string, boolean>;
  onImageError: (id: string) => void;
  cheer: number;
  avatarUrl?: string | null;
}) {
  const stage = roomStage(hungWorkCount(goals, placements));
  const [timeOfDay] = useState<TimeOfDay>(readTimeOfDay);
  const [walking, setWalking] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const portrait = avatarUrl && !avatarBroken && isDisplayableImageUrl(avatarUrl) ? avatarUrl.trim() : null;

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (cheer === 0) return;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 2100);
    return () => window.clearTimeout(timer);
  }, [cheer]);

  const shown = placements.slice(-FRAME_SLOTS.length);
  const hidden = placements.length - shown.length;
  const home = iso(2.55, 4.05, 0);
  const look = iso(3.15, 2.85, 0);
  const stepStyle = {
    "--step-x": `${(look.x - home.x).toFixed(1)}px`,
    "--step-y": `${(look.y - home.y).toFixed(1)}px`,
  } as CSSProperties;

  return (
    <div className={`room-frame time-${timeOfDay}`}>
      <svg className="iso" viewBox="268 -6 450 392" role="img" aria-label="Изометрическая комната">
        <defs>
          <linearGradient id="glass-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6e2a8" />
            <stop offset="0.45" stopColor="#c5e4f2" />
            <stop offset="1" stopColor="#8ebad4" />
          </linearGradient>
          <linearGradient id="glass-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0a36a" />
            <stop offset="1" stopColor="#6e8cae" />
          </linearGradient>
          <linearGradient id="glass-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#243656" />
            <stop offset="1" stopColor="#121826" />
          </linearGradient>
          <radialGradient id="lamp-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd27a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="floor-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
          <filter id="photo-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="4" stdDeviation="2.2" floodColor="#3a2414" floodOpacity="0.35" />
          </filter>
        </defs>

        <Walls time={timeOfDay} />
        <Floor />
        <Occlusion />
        <Window time={timeOfDay} />
        <LightShaft time={timeOfDay} />

        <Furniture />
        {stage >= 1 ? <Rug fresh={walking && stage === 1} /> : null}
        {stage >= 3 ? <Plant fresh={walking && stage === 3} /> : null}
        {stage >= 2 ? <Lamp fresh={walking && stage === 2} night={timeOfDay === "night"} /> : null}

        <Photos placements={shown} goals={goals} broken={broken} onImageError={onImageError} />

        <g className={walking ? "avatar walk" : "avatar"} style={stepStyle}>
          {portrait ? (
            <AvatarPhoto src={portrait} onError={() => setAvatarBroken(true)} />
          ) : (
            <Character />
          )}
        </g>

        {placements.length === 0 ? (
          <text x={portrait ? "600" : "470"} y={portrait ? "300" : "250"} textAnchor="middle" className="await-label">Стена ждёт первую работу</text>
        ) : null}
      </svg>
      {hidden > 0 ? (
        <p className="gallery-count" aria-label={`В галерее ещё ${hidden}`}>Ещё {hidden}</p>
      ) : null}
      <ul className="sr-only">
        {placements.map((placement) => (
          <li key={placement.artifactId}>{placement.artifact.title}</li>
        ))}
      </ul>
    </div>
  );
}

function readTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 6) return "night";
  if (hour >= 17 || hour < 8) return "dusk";
  return "day";
}

function Walls({ time }: { time: TimeOfDay }) {
  const left = time === "night" ? "#cbb59a" : "#e4d0b6";
  const leftAlt = time === "night" ? "#c2ac90" : "#dcc7ab";
  const right = time === "night" ? "#d9c6ad" : "#f4e6d0";
  const rightAlt = time === "night" ? "#d0bda3" : "#eadcc4";
  const panels = [0, 1, 2, 3, 4];
  return (
    <g className="walls">
      {panels.map((y) => (
        <polygon key={`l${y}`} points={pts(leftWall(y, y + 1, 0, WALL_H))} fill={y % 2 ? leftAlt : left} />
      ))}
      {panels.map((x) => (
        <polygon key={`r${x}`} points={pts(rightWall(x, x + 1, 0, WALL_H, 0))} fill={x % 2 ? rightAlt : right} />
      ))}
      <polygon points={pts(rightWall(5, ROOM_X, 0, WALL_H, 0))} fill={rightAlt} />
      {panels.map((y) => (
        <polygon key={`lb${y}`} points={pts(leftWall(y, y + 1, 0, 12, 0.05))} fill="#6a4a34" />
      ))}
      {panels.map((x) => (
        <polygon key={`rb${x}`} points={pts(rightWall(x, x + 1, 0, 12, 0.05))} fill="#5c3e2c" />
      ))}
      <polygon points={pts(rightWall(5, ROOM_X, 0, 12, 0.05))} fill="#5c3e2c" />
      <polygon points={pts([iso(0, 0, WALL_H), iso(0.18, 0, WALL_H), iso(0.18, ROOM_Y, WALL_H), iso(0, ROOM_Y, WALL_H)])} fill="#cbb89a" />
      <polygon points={pts([iso(0, 0, WALL_H), iso(ROOM_X, 0, WALL_H), iso(ROOM_X, 0.16, WALL_H), iso(0, 0.16, WALL_H)])} fill="#f7ecda" />
    </g>
  );
}

function Floor() {
  const tiles = [];
  for (let y = 0; y < ROOM_Y; y += 1) {
    for (let x = 0; x < ROOM_X; x += 1) {
      const warm = (x + y) % 2 === 0;
      tiles.push(
        <g key={`${x}-${y}`}>
          <polygon points={pts([iso(x, y, 0.2), iso(x + 1, y, 0.2), iso(x + 1, y + 1, 0.2), iso(x, y + 1, 0.2)])} fill={warm ? "#c88a4c" : "#b67b40"} />
          <polyline
            points={pts([iso(x, y + 0.5, 0.5), iso(x + 1, y + 0.5, 0.5)])}
            fill="none"
            stroke="#8d5c30"
            strokeWidth="0.7"
            opacity="0.45"
          />
        </g>,
      );
    }
  }
  const outline = [iso(0, 0, 0.3), iso(ROOM_X, 0, 0.3), iso(ROOM_X, ROOM_Y, 0.3), iso(0, ROOM_Y, 0.3)];
  return (
    <g className="floor">
      {tiles}
      <polygon points={pts(outline)} fill="url(#floor-shade)" />
    </g>
  );
}

function Window({ time }: { time: TimeOfDay }) {
  const y0 = 0.85;
  const y1 = 2.45;
  const z0 = 52;
  const z1 = 128;
  const glass = time === "night" ? "url(#glass-night)" : time === "dusk" ? "url(#glass-dusk)" : "url(#glass-day)";
  const midY = (y0 + y1) / 2;
  const midZ = (z0 + z1) / 2;
  return (
    <g className="window">
      <polygon points={pts(leftWall(y0 - 0.08, y1 + 0.08, z0 - 6, z1 + 6, 0.03))} fill="#6b4632" />
      <polygon points={pts(leftWall(y0, y1, z0, z1, 0.07))} fill={glass} />
      <polygon points={pts(leftWall(midY - 0.035, midY + 0.035, z0, z1, 0.09))} fill="#f3e6d2" />
      <polygon points={pts(leftWall(y0, y1, midZ - 2.5, midZ + 2.5, 0.09))} fill="#f3e6d2" />
      <polygon points={pts(leftWall(y0 - 0.12, y0 + 0.02, z0 - 4, z1 + 8, 0.1))} fill="#8d3d48" />
      <polygon points={pts(leftWall(y1 - 0.02, y1 + 0.14, z0 - 4, z1 + 8, 0.1))} fill="#a34a52" />
    </g>
  );
}

function LightShaft({ time }: { time: TimeOfDay }) {
  const night = time === "night";
  const dusk = time === "dusk";
  const beam = night ? "#c9d7ee" : dusk ? "#f0a36a" : "#ffe3a8";
  const core = night ? "#e4ecf8" : "#fff6d4";
  return (
    <g className="beam">
      <polygon
        points={pts([
          iso(0.08, 0.95, 64),
          iso(0.08, 2.35, 64),
          iso(2.7, 3.35, 1),
          iso(0.95, 1.45, 1),
        ])}
        fill={beam}
        opacity={night ? 0.16 : dusk ? 0.24 : 0.3}
      />
      <polygon
        points={pts([
          iso(0.09, 1.25, 78),
          iso(0.09, 2.05, 78),
          iso(2.15, 2.85, 2),
          iso(1.25, 1.85, 2),
        ])}
        fill={core}
        opacity={night ? 0.12 : 0.28}
      />
    </g>
  );
}

function Occlusion() {
  const strips = [];
  for (let i = 0; i < ROOM_X; i += 1) {
    strips.push(
      <polygon
        key={`ar${i}`}
        points={pts([iso(i, 0, 1), iso(i + 1, 0, 1), iso(i + 1, 0.38, 1), iso(i, 0.38, 1)])}
        fill="#000"
        opacity={0.16}
      />,
    );
  }
  for (let i = 0; i < ROOM_Y; i += 1) {
    strips.push(
      <polygon
        key={`al${i}`}
        points={pts([iso(0, i, 1), iso(0.38, i, 1), iso(0.38, i + 1, 1), iso(0, i + 1, 1)])}
        fill="#000"
        opacity={0.14}
      />,
    );
  }
  return (
    <g className="ao">
      {strips}
      <polygon points={pts([iso(0, 0, 1.2), iso(1.1, 0, 1.2), iso(0, 1.1, 1.2)])} fill="#000" opacity="0.2" />
    </g>
  );
}

function Furniture() {
  return (
    <g className="furniture">
      <Bed />
      <Shelf />
      <Desk />
      <Chair />
      <Armchair />
    </g>
  );
}

function Solid({
  x, y, z = 0, w, d, h, top, south, east, stroke,
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  top: string;
  south: string;
  east: string;
  stroke?: string;
}) {
  const faces = boxFaces(x, y, w, d, h, z);
  const line = stroke ? { stroke, strokeWidth: 0.8, strokeLinejoin: "round" as const } : {};
  return (
    <g>
      <polygon points={pts(faces.south)} fill={south} {...line} />
      <polygon points={pts(faces.east)} fill={east} {...line} />
      <polygon points={pts(faces.top)} fill={top} {...line} />
    </g>
  );
}

function Bed() {
  return (
    <g>
      <Solid x={0.38} y={3.55} w={1.15} d={1.25} h={12} top="#6b4632" south="#4e3224" east="#3d271c" />
      <Solid x={0.46} y={3.62} z={12} w={0.98} d={1.1} h={8} top="#f4efe6" south="#d9cfc2" east="#c9bfb0" />
      <Solid x={0.52} y={3.68} z={20} w={0.38} d={0.7} h={6} top="#f7f4ee" south="#e4ddd2" east="#d5cdc0" />
      <Solid x={0.95} y={3.74} z={20} w={0.38} d={0.85} h={3} top="#7d4a55" south="#5e3640" east="#4c2c34" />
    </g>
  );
}

function Shelf() {
  return (
    <g>
      <Solid x={0.12} y={0.18} w={0.34} d={0.62} h={78} top="#8a5a38" south="#6b4428" east="#4e311c" />
      <Solid x={0.08} y={0.16} z={22} w={0.42} d={0.66} h={3} top="#c49a6a" south="#8d6844" east="#6b4c30" />
      <Solid x={0.08} y={0.16} z={46} w={0.42} d={0.66} h={3} top="#c49a6a" south="#8d6844" east="#6b4c30" />
      <Solid x={0.08} y={0.16} z={68} w={0.42} d={0.66} h={3} top="#c49a6a" south="#8d6844" east="#6b4c30" />
      <Solid x={0.16} y={0.22} z={25} w={0.12} d={0.1} h={18} top="#6b3a4a" south="#4e2834" east="#3a1e28" />
      <Solid x={0.16} y={0.34} z={25} w={0.12} d={0.12} h={15} top="#2f4d6b" south="#22384e" east="#1a2c3e" />
      <Solid x={0.16} y={0.48} z={25} w={0.12} d={0.1} h={12} top="#c4a15a" south="#8d7340" east="#6e582c" />
      <Solid x={0.18} y={0.28} z={49} w={0.14} d={0.16} h={10} top="#e6d2a4" south="#c4b088" east="#a89470" />
      <Solid x={0.18} y={0.48} z={49} w={0.12} d={0.12} h={7} top="#3f6b5c" south="#2c4e44" east="#214038" />
      <Solid x={0.2} y={0.36} z={71} w={0.14} d={0.14} h={5} top="#f4efe6" south="#d9cfc2" east="#c9bfb0" />
      <Solid x={0.24} y={0.4} z={76} w={0.06} d={0.06} h={6} top="#f0c36a" south="#d7a44a" east="#b8883a" />
    </g>
  );
}

function Desk() {
  return (
    <g>
      <Solid x={3.15} y={1.15} w={0.12} d={0.12} h={20} top="#6b4428" south="#4e311c" east="#3a2414" />
      <Solid x={4.7} y={1.15} w={0.12} d={0.12} h={20} top="#6b4428" south="#4e311c" east="#3a2414" />
      <Solid x={3.15} y={1.95} w={0.12} d={0.12} h={20} top="#6b4428" south="#4e311c" east="#3a2414" />
      <Solid x={4.7} y={1.95} w={0.12} d={0.12} h={20} top="#6b4428" south="#4e311c" east="#3a2414" />
      <Solid x={3.05} y={1.05} z={20} w={1.85} d={1.1} h={5} top="#d7b07a" south="#a88455" east="#8a6840" />
      <Solid x={3.25} y={1.25} z={25} w={0.28} d={0.2} h={3} top="#6b3a4a" south="#4e2834" east="#3a1e28" />
      <Solid x={3.55} y={1.22} z={25} w={0.22} d={0.18} h={5} top="#2f4d6b" south="#22384e" east="#1a2c3e" />
      <Solid x={4.15} y={1.28} z={25} w={0.22} d={0.18} h={6} top="#f4f1ea" south="#d9d3c8" east="#c4beb2" />
    </g>
  );
}

function Chair() {
  return (
    <g>
      <Solid x={3.55} y={2.35} w={0.1} d={0.1} h={12} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
      <Solid x={4.05} y={2.35} w={0.1} d={0.1} h={12} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
      <Solid x={3.55} y={2.85} w={0.1} d={0.1} h={12} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
      <Solid x={4.05} y={2.85} w={0.1} d={0.1} h={12} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
      <Solid x={3.48} y={2.28} z={12} w={0.72} d={0.72} h={4} top="#8d3d48" south="#6b2e36" east="#521f28" />
      <Solid x={3.48} y={2.28} z={16} w={0.12} d={0.72} h={16} top="#a34a52" south="#7a343c" east="#5c262e" />
    </g>
  );
}

function Armchair() {
  return (
    <g>
      <Solid x={1.55} y={2.15} w={1.2} d={1.05} h={16} top="#3f6b5c" south="#2c4e44" east="#214038" />
      <Solid x={1.55} y={2.15} z={16} w={0.18} d={1.05} h={20} top="#4e7d6c" south="#356454" east="#274e42" />
      <Solid x={1.62} y={2.15} z={10} w={1.05} d={0.16} h={12} top="#356454" south="#274e42" east="#1d3c34" />
      <Solid x={1.62} y={3.04} z={10} w={1.05} d={0.16} h={12} top="#4e7d6c" south="#356454" east="#274e42" />
      <Solid x={1.85} y={2.4} z={16} w={0.7} d={0.62} h={5} top="#e7d3b4" south="#cbb892" east="#b39e78" />
    </g>
  );
}

function Rug({ fresh }: { fresh: boolean }) {
  const outer = [iso(1.45, 1.55, 1.2), iso(3.7, 1.55, 1.2), iso(3.7, 3.35, 1.2), iso(1.45, 3.35, 1.2)];
  const inner = [iso(1.7, 1.78, 1.6), iso(3.45, 1.78, 1.6), iso(3.45, 3.12, 1.6), iso(1.7, 3.12, 1.6)];
  const heart = [iso(2.35, 2.25, 2), iso(2.8, 2.25, 2), iso(2.8, 2.7, 2), iso(2.35, 2.7, 2)];
  return (
    <g className={fresh ? "fresh" : undefined}>
      <polygon points={pts(outer)} fill="#8d3040" />
      <polygon points={pts(inner)} fill="#f0e2c4" />
      <polygon points={pts(heart)} fill="#6e2432" />
    </g>
  );
}

function Plant({ fresh }: { fresh: boolean }) {
  const leaf = (dx: number, dy: number, z: number) => [
    iso(0.85 + dx, 0.4 + dy, z),
    iso(1.15 + dx, 0.25 + dy, z + 16),
    iso(0.7 + dx, 0.2 + dy, z + 8),
  ];
  return (
    <g className={fresh ? "fresh" : undefined}>
      <Solid x={0.78} y={0.32} w={0.42} d={0.38} h={12} top="#a85b3c" south="#7c4030" east="#5e3024" />
      <polygon points={pts(leaf(0, 0, 12))} fill="#2f6b45" />
      <polygon points={pts(leaf(0.15, 0.12, 14))} fill="#3f8a52" />
      <polygon points={pts(leaf(-0.05, 0.16, 16))} fill="#245538" />
      <polygon points={pts(leaf(0.08, -0.02, 20))} fill="#4e9a5c" />
    </g>
  );
}

function Lamp({ fresh, night }: { fresh: boolean; night: boolean }) {
  const foot = iso(4.95, 3.48, 1.5);
  const wall = iso(5.15, 0.08, 48);
  return (
    <g className={fresh ? "fresh" : undefined}>
      <ellipse cx={wall.x} cy={wall.y} rx={night ? 46 : 34} ry={night ? 28 : 20} fill="url(#lamp-glow)" opacity="0.85" />
      <ellipse cx={foot.x} cy={foot.y + 3} rx={night ? 54 : 42} ry={night ? 22 : 16} fill="#000" opacity="0.28" />
      <ellipse cx={foot.x} cy={foot.y} rx={night ? 70 : 56} ry={night ? 28 : 22} fill="url(#lamp-glow)" />
      <Solid x={4.72} y={3.22} w={0.48} d={0.42} h={3} top="#4a301c" south="#3a2414" east="#2a1a0e" />
      <Solid x={4.84} y={3.32} z={3} w={0.22} d={0.2} h={3} top="#6b4428" south="#4e311c" east="#3a2414" />
      <Solid x={4.9} y={3.38} z={6} w={0.1} d={0.1} h={38} top="#f0d48a" south="#c9963e" east="#8d6828" />
      <Solid x={4.66} y={3.16} z={42} w={0.58} d={0.52} h={4} top="#a86820" south="#8a5418" east="#6a3e10" />
      <Solid x={4.62} y={3.12} z={46} w={0.66} d={0.58} h={12} top="#fff0c4" south="#f0c36a" east="#e0a84a" />
    </g>
  );
}

const PLAQUE_W = 168;
const PLAQUE_H = 28;

/** Fixed slots. Right wall is one row of three; the left wall, beside the window, holds two more. */
const FRAME_SLOTS: Array<{ wall: "right" | "left"; along: number; w: number; zBottom: number; zHeight: number }> = [
  { wall: "right", along: 0.4, w: 1.4, zBottom: 108, zHeight: 46 },
  { wall: "right", along: 2.15, w: 1.4, zBottom: 108, zHeight: 46 },
  { wall: "right", along: 3.9, w: 1.4, zBottom: 108, zHeight: 46 },
  { wall: "left", along: 2.58, w: 1.05, zBottom: 112, zHeight: 42 },
  { wall: "left", along: 2.58, w: 1.05, zBottom: 42, zHeight: 40 },
];

function Photos({
  placements,
  goals,
  broken,
  onImageError,
}: {
  placements: Placement[];
  goals: Goal[];
  broken: Record<string, boolean>;
  onImageError: (id: string) => void;
}) {
  const [tip, setTip] = useState<{ id: string; title: string; left: number; top: number } | null>(null);

  return (
    <g className="photos">
      {placements.map((placement, index) => {
        const slot = FRAME_SLOTS[index];
        if (!slot) return null;
        const { along, w, zBottom, zHeight } = slot;
        const frame = slot.wall === "right"
          ? rightWall(along - 0.05, along + w + 0.05, zBottom - 3, zBottom + zHeight + 4, 0.03)
          : leftWall(along - 0.05, along + w + 0.05, zBottom - 3, zBottom + zHeight + 4, 0.04);
        const mat = slot.wall === "right"
          ? rightWall(along, along + w, zBottom, zBottom + zHeight, 0.05)
          : leftWall(along, along + w, zBottom, zBottom + zHeight, 0.07);
        const plaqueAlong = along + 0.08;
        const plaqueW = w - 0.16;
        const plaqueZ = zBottom - 18;
        const imageMatrix = slot.wall === "right"
          ? rightWallImageMatrix(along, w, zBottom, zHeight, 120, 90)
          : leftWallImageMatrix(along, w, zBottom, zHeight, 120, 90);
        const plaqueMatrix = slot.wall === "right"
          ? rightWallImageMatrix(plaqueAlong, plaqueW, plaqueZ, 14, PLAQUE_W, PLAQUE_H)
          : leftWallImageMatrix(plaqueAlong, plaqueW, plaqueZ, 14, PLAQUE_W, PLAQUE_H);
        const src = placement.artifact.imageUrl && !broken[placement.artifact.id]
          ? safeImageSrc(placement.artifact.imageUrl)
          : null;
        const goal = goals.find((item) => item.id === placement.artifact.goalId);
        const full = goal ? `${placement.artifact.title} — ${goal.title}` : placement.artifact.title;
        const anchor = slot.wall === "right"
          ? iso(plaqueAlong + plaqueW / 2, 0.08, plaqueZ + 7)
          : iso(0.1, plaqueAlong + plaqueW / 2, plaqueZ + 7);
        const missingAt = slot.wall === "right"
          ? iso(along + w / 2, 0.08, zBottom + 20)
          : iso(0.1, along + w / 2, zBottom + 20);
        return (
          <g key={placement.artifactId} filter="url(#photo-shadow)">
            <title>{full}</title>
            <polygon points={pts(frame)} fill="#5c3b24" />
            <polygon points={pts(mat)} fill="#f7f1e6" />
            {src ? (
              <image
                href={src}
                width="120"
                height="90"
                preserveAspectRatio="xMidYMid slice"
                transform={imageMatrix}
                onError={() => onImageError(placement.artifact.id)}
              >
                <title>{placement.artifact.title}</title>
              </image>
            ) : (
              <text x={missingAt.x} y={missingAt.y} textAnchor="middle" className="frame-label">
                {placement.artifact.imageUrl ? "не показывается" : "без фото"}
              </text>
            )}
            <foreignObject
              width={PLAQUE_W}
              height={PLAQUE_H}
              transform={plaqueMatrix}
            >
              <div
                className="wall-plaque"
                title={full}
                role="button"
                tabIndex={0}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setTip({ id: placement.artifactId, title: full, ...tipPos(anchor) });
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setTip((current) => current?.id === placement.artifactId ? null : current);
                }}
                onClick={() => {
                  const next = { id: placement.artifactId, title: full, ...tipPos(anchor) };
                  setTip((current) => current?.id === placement.artifactId ? null : next);
                }}
                onFocus={() => setTip({ id: placement.artifactId, title: full, ...tipPos(anchor) })}
                onBlur={() => setTip((current) => current?.id === placement.artifactId ? null : current)}
              >
                <span>{placement.artifact.title}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
      {tip ? <CaptionTip title={tip.title} left={tip.left} top={tip.top} /> : null}
    </g>
  );
}

function CaptionTip({ title, left, top }: { title: string; left: number; top: number }) {
  return (
    <foreignObject x={left} y={top} width="180" height="64" className="caption-tip-fo">
      <div className="caption-tip">{title}</div>
    </foreignObject>
  );
}

function tipPos(anchor: { x: number; y: number }): { left: number; top: number } {
  return { left: anchor.x - 90, top: anchor.y - 70 };
}

function safeImageSrc(value: string): string | null {
  if (!isDisplayableImageUrl(value)) return null;
  return value.trim();
}

/** Chosen portrait, standing where the drawn figure stood. Feet sit on the floor. */
function AvatarPhoto({ src, onError }: { src: string; onError: () => void }) {
  const foot = iso(2.72, 4.2, 2);
  const w = 112;
  const h = 184;
  return (
    <g className="breathe">
      <image
        href={src}
        x={foot.x - w / 2}
        y={foot.y - h}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMax meet"
        onError={onError}
      >
        <title>Персонаж</title>
      </image>
    </g>
  );
}

/** Cosmetic figure. Idle motion is decorative; it is not a progression system. */
function Character() {
  const x = 2.55;
  const y = 4.02;
  const ink = "#2a1c14";
  return (
    <g className="bob">
      <ellipse cx={iso(x + 0.22, y + 0.18, 0).x} cy={iso(x + 0.22, y + 0.18, 0).y + 3} rx="18" ry="7" fill="#000" opacity="0.22" />
      <Solid x={x + 0.04} y={y + 0.06} w={0.16} d={0.16} h={15} top="#3a2e28" south="#2a221e" east="#1c1612" stroke={ink} />
      <Solid x={x + 0.24} y={y + 0.16} w={0.16} d={0.16} h={15} top="#4a3b32" south="#2a221e" east="#1c1612" stroke={ink} />
      <Solid x={x - 0.02} y={y + 0.02} w={0.22} d={0.2} h={4} top="#1c1612" south="#14100e" east="#0e0c0a" />
      <Solid x={x + 0.22} y={y + 0.14} w={0.22} d={0.2} h={4} top="#1c1612" south="#14100e" east="#0e0c0a" />
      <g className="breathe">
        <Solid x={x} y={y} z={15} w={0.46} d={0.36} h={22} top="#f09068" south="#d86b42" east="#b55230" stroke={ink} />
        <Solid x={x + 0.08} y={y + 0.06} z={22} w={0.16} d={0.22} h={12} top="#f7d2bc" south="#e7b89a" east="#d4a484" stroke={ink} />
        <Solid x={x + 0.04} y={y + 0.04} z={34} w={0.38} d={0.28} h={4} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
        <g className="arm-rest">
          <Solid x={x + 0.4} y={y + 0.16} z={18} w={0.12} d={0.14} h={16} top="#efc7a8" south="#e0b494" east="#c99a7c" stroke={ink} />
        </g>
        <g className="arm-up">
          <Solid x={x + 0.38} y={y - 0.06} z={32} w={0.12} d={0.14} h={18} top="#efc7a8" south="#e0b494" east="#c99a7c" stroke={ink} />
        </g>
        <Head x={x + 0.22} y={y + 0.16} z={48} />
      </g>
    </g>
  );
}

function Head({ x, y, z }: { x: number; y: number; z: number }) {
  const c = iso(x, y, z);
  const hair = `M${c.x - 14} ${c.y - 2}
    C ${c.x - 16} ${c.y - 20}, ${c.x - 6} ${c.y - 28}, ${c.x} ${c.y - 27}
    C ${c.x + 8} ${c.y - 30}, ${c.x + 16} ${c.y - 18}, ${c.x + 14} ${c.y - 1}
    C ${c.x + 8} ${c.y - 12}, ${c.x - 8} ${c.y - 12}, ${c.x - 14} ${c.y - 2} Z`;
  return (
    <g>
      <ellipse cx={c.x} cy={c.y - 1} rx="14" ry="15" fill="#efc7a8" stroke="#3a2418" strokeWidth="1.3" />
      <path d={hair} fill="#3a2a22" stroke="#241810" strokeWidth="1" />
      <path d={`M${c.x - 4} ${c.y - 18} C ${c.x - 1} ${c.y - 22}, ${c.x + 4} ${c.y - 16}, ${c.x + 2} ${c.y - 12}`} fill="none" stroke="#6b5344" strokeWidth="1.4" />
      <ellipse cx={c.x - 12} cy={c.y + 1} rx="2.2" ry="3" fill="#e7b498" stroke="#3a2418" strokeWidth="0.6" />
      <g className="eyes">
        <ellipse cx={c.x - 4.5} cy={c.y} rx="1.7" ry="1.9" fill="#241910" />
        <ellipse cx={c.x + 4.5} cy={c.y} rx="1.7" ry="1.9" fill="#241910" />
        <circle cx={c.x - 4} cy={c.y - 0.6} r="0.45" fill="#fff" />
        <circle cx={c.x + 5} cy={c.y - 0.6} r="0.45" fill="#fff" />
        <rect className="lid" x={c.x - 8} y={c.y - 3} width="16" height="6" fill="#efc7a8" />
      </g>
      <path d={`M${c.x - 3.5} ${c.y + 6} Q ${c.x} ${c.y + 9} ${c.x + 3.5} ${c.y + 6}`} fill="none" stroke="#a86b58" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}
