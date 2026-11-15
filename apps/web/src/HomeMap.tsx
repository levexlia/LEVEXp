import { MAP_NODES, mapNodeStates, type MapNodeId } from "@levex/domain";
import type { Goal } from "./api";

const SPOTS: Record<MapNodeId, { x: number; y: number }> = {
  center: { x: 184, y: 86 },
  park: { x: 118, y: 210 },
  study: { x: 214, y: 300 },
  home: { x: 150, y: 410 },
  workshop: { x: 230, y: 500 },
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
  const doneSpheres = goals.filter((goal) => goal.status === "done" && goal.sphere).map((goal) => goal.sphere as string);
  const nodes = mapNodeStates({ level, doneSpheres });
  return (
    <svg className="district" viewBox="0 0 360 560" role="img" aria-label="Карта района">
      <City />
      <path
        className="route"
        d="M184 110 C120 150 90 180 118 230 C160 290 250 270 214 320 C170 380 120 390 150 430 C190 480 250 470 230 520"
        fill="none"
        stroke="url(#path-glow)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      {nodes.map((node) => {
        const spot = SPOTS[node.id];
        return (
          <g key={node.id} transform={`translate(${spot.x} ${spot.y})`}>
            <text y="46" textAnchor="middle" className="node-label">{node.name}</text>
            <g
              className={`node ${node.state}`}
              role="button"
              tabIndex={0}
              aria-label={node.name}
              onClick={() => {
                if (node.state !== "locked") onOpen(node.id);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && node.state !== "locked") onOpen(node.id);
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
    </svg>
  );
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
        <linearGradient id="path-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#7C3AED" />
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
