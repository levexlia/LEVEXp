import { isDisplayableImageUrl } from "@levex/domain";
import { useEffect, useState, type CSSProperties } from "react";
import type { Goal, Placement } from "./api";
import {
  WALL_H,
  boxFaces,
  iso,
  leftWall,
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
}: {
  placements: Placement[];
  goals: Goal[];
  broken: Record<string, boolean>;
  onImageError: (id: string) => void;
  cheer: number;
}) {
  const stage = roomStage(hungWorkCount(goals, placements));
  const [timeOfDay] = useState<TimeOfDay>(readTimeOfDay);
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    if (cheer === 0) return;
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), 2100);
    return () => window.clearTimeout(timer);
  }, [cheer]);

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
        <Window time={timeOfDay} />
        <LightShaft time={timeOfDay} />

        <Furniture />
        {stage >= 1 ? <Rug fresh={walking && stage === 1} /> : null}
        {stage >= 3 ? <Plant fresh={walking && stage === 3} /> : null}
        {stage >= 2 ? <Lamp fresh={walking && stage === 2} night={timeOfDay === "night"} /> : null}

        <Photos placements={placements} goals={goals} broken={broken} onImageError={onImageError} />

        <g className={walking ? "avatar walk" : "avatar"} style={stepStyle}>
          <Character />
        </g>

        {placements.length === 0 ? (
          <text x="470" y="250" textAnchor="middle" className="await-label">Стена ждёт первую работу</text>
        ) : null}
      </svg>
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
  if (time === "night") return null;
  const opacity = time === "dusk" ? 0.16 : 0.22;
  return (
    <polygon
      points={pts([
        iso(0.08, 1.05, 58),
        iso(0.08, 2.25, 58),
        iso(2.4, 3.15, 2),
        iso(1.15, 1.7, 2),
      ])}
      fill={time === "dusk" ? "#f0a36a" : "#ffe0a0"}
      opacity={opacity}
    />
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
  x, y, z = 0, w, d, h, top, south, east,
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
}) {
  const faces = boxFaces(x, y, w, d, h, z);
  return (
    <g>
      <polygon points={pts(faces.south)} fill={south} />
      <polygon points={pts(faces.east)} fill={east} />
      <polygon points={pts(faces.top)} fill={top} />
    </g>
  );
}

function Bed() {
  return (
    <g>
      <Solid x={0.38} y={3.15} w={1.25} d={1.65} h={12} top="#6b4632" south="#4e3224" east="#3d271c" />
      <Solid x={0.48} y={3.25} z={12} w={1.05} d={1.45} h={8} top="#f4efe6" south="#d9cfc2" east="#c9bfb0" />
      <Solid x={0.55} y={3.32} z={20} w={0.42} d={0.95} h={6} top="#f7f4ee" south="#e4ddd2" east="#d5cdc0" />
      <Solid x={1.05} y={3.4} z={20} w={0.4} d={1.15} h={3} top="#7d4a55" south="#5e3640" east="#4c2c34" />
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
      <Solid x={0.16} y={0.28} z={25} w={0.16} d={0.12} h={16} top="#6b3a4a" south="#4e2834" east="#3a1e28" />
      <Solid x={0.16} y={0.42} z={25} w={0.16} d={0.14} h={14} top="#2f4d6b" south="#22384e" east="#1a2c3e" />
      <Solid x={0.18} y={0.34} z={49} w={0.18} d={0.22} h={8} top="#e6d2a4" south="#c4b088" east="#a89470" />
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
  const glow = iso(4.95, 3.55, 2);
  return (
    <g className={fresh ? "fresh" : undefined}>
      <ellipse cx={glow.x} cy={glow.y} rx={night ? 78 : 58} ry={night ? 34 : 24} fill="url(#lamp-glow)" />
      <Solid x={4.82} y={3.35} w={0.16} d={0.16} h={4} top="#5c3e2c" south="#3d2918" east="#2c1d12" />
      <Solid x={4.86} y={3.39} z={4} w={0.08} d={0.08} h={36} top="#e0b15a" south="#b8883a" east="#8d6828" />
      <Solid x={4.62} y={3.18} z={40} w={0.55} d={0.5} h={14} top="#ffe3a4" south="#f0c36a" east="#d7a44a" />
    </g>
  );
}

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
  return (
    <g className="photos">
      {placements.map((placement, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = 0.4 + col * 1.5;
        const zBottom = 96 - row * 52;
        const w = 1.25;
        const zHeight = 52;
        const frame = rightWall(x - 0.06, x + w + 0.06, zBottom - 4, zBottom + zHeight + 4, 0.03);
        const mat = rightWall(x, x + w, zBottom, zBottom + zHeight, 0.05);
        const src = placement.artifact.imageUrl && !broken[placement.artifact.id]
          ? safeImageSrc(placement.artifact.imageUrl)
          : null;
        const goal = goals.find((item) => item.id === placement.artifact.goalId);
        const caption = iso(x + w / 2, 0.08, zBottom - 10);
        return (
          <g key={placement.artifactId} filter="url(#photo-shadow)">
            <title>
              {placement.artifact.title}{goal ? `, ${goal.title}` : ""}
            </title>
            <polygon points={pts(frame)} fill="#5c3b24" />
            <polygon points={pts(mat)} fill="#f7f1e6" />
            {src ? (
              <image
                href={src}
                width="120"
                height="90"
                preserveAspectRatio="xMidYMid slice"
                transform={rightWallImageMatrix(x, w, zBottom, zHeight, 120, 90)}
                onError={() => onImageError(placement.artifact.id)}
              >
                <title>{placement.artifact.title}</title>
              </image>
            ) : (
              <text x={caption.x} y={iso(x + w / 2, 0.08, zBottom + 24).y} textAnchor="middle" className="frame-label">
                {placement.artifact.imageUrl ? "не показывается" : "без фото"}
              </text>
            )}
            <text x={caption.x} y={caption.y} textAnchor="middle" className="frame-label">{shortTitle(placement.artifact.title)}</text>
          </g>
        );
      })}
    </g>
  );
}

function safeImageSrc(value: string): string | null {
  if (!isDisplayableImageUrl(value)) return null;
  return value.trim();
}

function shortTitle(title: string): string {
  const text = title.trim();
  return text.length > 16 ? `${text.slice(0, 15)}…` : text;
}

/** Cosmetic figure. Idle motion is decorative; it is not a progression system. */
function Character() {
  const x = 2.55;
  const y = 4.02;
  return (
    <g className="bob">
      <ellipse cx={iso(x + 0.22, y + 0.18, 0).x} cy={iso(x + 0.22, y + 0.18, 0).y + 2} rx="16" ry="6" fill="#000" opacity="0.2" />
      <Solid x={x + 0.06} y={y + 0.08} w={0.14} d={0.14} h={16} top="#3a2e28" south="#2a221e" east="#1c1612" />
      <Solid x={x + 0.24} y={y + 0.16} w={0.14} d={0.14} h={16} top="#4a3b32" south="#2a221e" east="#1c1612" />
      <g className="breathe">
        <Solid x={x + 0.02} y={y + 0.02} z={16} w={0.42} d={0.34} h={24} top="#e07a52" south="#c4623e" east="#a34e30" />
        <g className="arm-rest">
          <Solid x={x + 0.36} y={y + 0.18} z={20} w={0.1} d={0.12} h={16} top="#efc7a8" south="#e0b494" east="#c99a7c" />
        </g>
        <g className="arm-up">
          <Solid x={x + 0.34} y={y - 0.02} z={30} w={0.1} d={0.12} h={18} top="#efc7a8" south="#e0b494" east="#c99a7c" />
        </g>
        <Head x={x + 0.2} y={y + 0.16} z={46} />
      </g>
    </g>
  );
}

function Head({ x, y, z }: { x: number; y: number; z: number }) {
  const c = iso(x, y, z);
  return (
    <g>
      <ellipse cx={c.x} cy={c.y - 2} rx="13" ry="14" fill="#efc7a8" />
      <path d={`M${c.x - 13} ${c.y - 4} C ${c.x - 12} ${c.y - 22}, ${c.x + 12} ${c.y - 22}, ${c.x + 13} ${c.y - 2} C ${c.x + 8} ${c.y - 12}, ${c.x - 8} ${c.y - 12}, ${c.x - 13} ${c.y - 4} Z`} fill="#3a2a22" />
      <g className="eyes">
        <ellipse cx={c.x - 4} cy={c.y - 1} rx="1.5" ry="1.7" fill="#241910" />
        <ellipse cx={c.x + 4} cy={c.y - 1} rx="1.5" ry="1.7" fill="#241910" />
        <rect className="lid" x={c.x - 8} y={c.y - 4} width="16" height="6" fill="#efc7a8" />
      </g>
      <path d={`M${c.x - 3} ${c.y + 5} Q ${c.x} ${c.y + 8} ${c.x + 3} ${c.y + 5}`} fill="none" stroke="#c4846a" strokeWidth="1" />
    </g>
  );
}
