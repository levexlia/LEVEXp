import { MAP_NODES, mapNodeStates, type MapNodeId } from "@levex/domain";
import type { Goal } from "./api";

/**
 * The path is read from the bottom upward:
 * Дом → Учебный центр → Парк → Мастерская → Центр LEVEX.
 * Labels sit off the stroke and off the hex so they do not cover either.
 */
const SPOTS: Record<MapNodeId, {
  x: number;
  y: number;
  lx: number;
  ly: number;
  anchor: "start" | "end" | "middle";
}> = {
  home: { x: 168, y: 498, lx: -60, ly: 4, anchor: "end" },
  study: { x: 206, y: 386, lx: -62, ly: 18, anchor: "end" },
  park: { x: 108, y: 274, lx: -54, ly: 4, anchor: "end" },
  workshop: { x: 228, y: 162, lx: 56, ly: 4, anchor: "start" },
  center: { x: 180, y: 72, lx: 0, ly: -44, anchor: "middle" },
};

const ROUTE = [
  "M168 498",
  "Q196 446 206 386",
  "Q168 328 108 274",
  "Q156 214 228 162",
  "Q248 116 180 72",
].join(" ");

export function HomeMap({
  level,
  goals,
  onOpen,
}: {
  level: number;
  goals: Goal[];
  onOpen: (id: MapNodeId) => void;
}) {
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  const nodes = mapNodeStates({ level, doneSpheres });
  return (
    <svg className="district" viewBox="0 0 360 560" role="img" aria-label="Карта района: Дом, Учебный центр, Парк, Мастерская, Центр LEVEX">
      <City />
      <path className="route" d={ROUTE} fill="none" stroke="url(#path-glow)" strokeWidth="16" strokeLinecap="round" />
      {nodes.map((node) => {
        const spot = SPOTS[node.id];
        return (
          <g key={node.id} transform={`translate(${spot.x} ${spot.y})`}>
            <g
              className={`node ${node.state}`}
              role="button"
              tabIndex={0}
              aria-label={node.name}
              onClick={() => {
                if (node.state !== "locked") onOpen(node.id);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && node.state !== "locked") {
                  event.preventDefault();
                  onOpen(node.id);
                }
              }}
            >
              <polygon points="0,-28 24,-14 24,14 0,28 -24,14 -24,-14" />
              {node.state === "done" ? <path d="M-8 0 l6 7 12-14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /> : null}
              {node.state === "locked" ? <Lock /> : null}
              {node.state === "current" ? <circle r="6" fill="#fff" /> : null}
            </g>
          </g>
        );
      })}
      {nodes.map((node) => {
        const spot = SPOTS[node.id];
        const lines = labelLines(node.name);
        return (
          <text
            key={`${node.id}-label`}
            className="node-label"
            x={spot.x + spot.lx}
            y={spot.y + spot.ly}
            textAnchor={spot.anchor}
            fontSize="12"
          >
            {lines.map((line, index) => (
              <tspan key={line} x={spot.x + spot.lx} dy={index === 0 ? 0 : 15}>{line}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

function labelLines(name: string): string[] {
  if (name === "Учебный центр") return ["Учебный", "центр"];
  return [name];
}

function Lock() {
  return (
    <g fill="none" stroke="#CBD5E1" strokeWidth="2.4">
      <rect x="-7" y="-2" width="14" height="12" rx="2" />
      <path d="M-4 -2 v-4 a4 4 0 0 1 8 0 v4" />
    </g>
  );
}

function City() {
  const blocks = [
    [18, 40, 36, 70], [70, 24, 28, 50], [250, 30, 40, 80], [300, 70, 34, 60],
    [20, 180, 30, 54], [300, 200, 36, 70], [30, 340, 40, 48], [300, 360, 32, 64],
    [40, 470, 28, 40], [290, 480, 40, 50],
  ];
  return (
    <g className="city">
      <defs>
        <linearGradient id="path-glow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      {blocks.map(([x, y, w, h]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={w} height={h} rx="4" fill="#15132E" stroke="#312E81" />
          {windows(x!, y!, w!, h!)}
        </g>
      ))}
    </g>
  );
}

function windows(x: number, y: number, w: number, h: number) {
  const dots = [];
  for (let row = y + 8; row < y + h - 6; row += 12) {
    for (let col = x + 6; col < x + w - 6; col += 10) {
      dots.push(<rect key={`${row}-${col}`} x={col} y={row} width="4" height="5" rx="1" fill="#67E8F9" opacity="0.8" />);
    }
  }
  return dots;
}

export function missionsFor(nodeId: MapNodeId, goals: Goal[]): Goal[] {
  const node = MAP_NODES.find((item) => item.id === nodeId);
  if (!node) return [];
  return goals.filter((goal) => goal.sphere === node.sphere);
}
