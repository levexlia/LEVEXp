import { isDisplayableImageUrl } from "@levex/domain";
import type { CSSProperties } from "react";
import type { Goal, Placement } from "./api";

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

/** 0 bare, 1 rug and warm window, 2 lamp, 3 plant. Derived only from saved work. */
export function roomStage(hung: number): 0 | 1 | 2 | 3 {
  if (hung >= 3) return 3;
  if (hung >= 2) return 2;
  if (hung >= 1) return 1;
  return 0;
}

export function RoomScene({
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
  const stage = roomStage(hungWorkCount(goals, placements));
  const goalTitle = (goalId?: string) => goals.find((goal) => goal.id === goalId)?.title;

  return (
    <section className={`room stage-${stage}`} aria-label="Комната">
      <div className="wall">
        <div className="window" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        {placements.length === 0 ? (
          <>
            <div className="nails" aria-hidden="true"><i /><i /><i /></div>
            <p className="await">Стена ждёт первую работу.</p>
          </>
        ) : (
          <ul className="hangings">
            {placements.map((placement, index) => {
              const artifact = placement.artifact;
              const src = artifact.imageUrl && !broken[artifact.id]
                ? safeImageSrc(artifact.imageUrl)
                : null;
              const linked = goalTitle(artifact.goalId);
              return (
                <li key={placement.artifactId} style={slotStyle(index)}>
                  <figure>
                    {src ? (
                      <img
                        src={src}
                        alt={artifact.title}
                        referrerPolicy="no-referrer"
                        onError={() => onImageError(artifact.id)}
                      />
                    ) : (
                      <div className="mat">{artifact.imageUrl ? "Ссылка не показывается" : "Без картинки"}</div>
                    )}
                    <figcaption>
                      {artifact.title}
                      {linked ? <span>{linked}</span> : null}
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="floor">
        <div className="rug" aria-hidden="true" />
        <Character settled={stage > 0} />
        <div className="lamp" aria-hidden="true">
          <div className="shade" />
          <div className="pole" />
        </div>
        <Plant />
      </div>
    </section>
  );
}

function safeImageSrc(value: string): string | null {
  if (!isDisplayableImageUrl(value)) return null;
  return value.trim();
}

function slotStyle(index: number): CSSProperties {
  const column = index % 3;
  const row = Math.floor(index / 3) % 2;
  return {
    "--slot-top": `${8 + row * 28}%`,
    "--slot-left": `${28 + column * 22}%`,
  } as CSSProperties;
}

/** A drawn figure for the room. Pose follows saved work; it is not a character system. */
function Character({ settled }: { settled: boolean }) {
  return (
    <svg className="figure" viewBox="0 0 120 210" aria-hidden="true">
      <ellipse cx="60" cy="198" rx="28" ry="6" fill="#000" opacity="0.18" />
      <path d="M46 92h28l8 70H40z" fill="#2c564a" />
      <path d="M48 118h24l2 18H46z" fill="#3d342c" />
      <path d="M46 158h12l2 28H44z" fill="#3d342c" />
      <path d="M66 158h12l4 28H64z" fill="#3d342c" />
      <path d="M40 186h20l2 8H38z" fill="#241910" />
      <path d="M64 186h22l2 8H62z" fill="#241910" />
      <circle cx="60" cy="48" r="20" fill="#efc7a8" />
      <path d="M40 46c2-24 38-28 44-4-8-10-34-10-44 4z" fill="#3a2a22" />
      <circle cx="52" cy="48" r="1.6" fill="#241910" />
      <circle cx="68" cy="48" r="1.6" fill="#241910" />
      {settled ? (
        <path d="M78 96c16-8 28-28 30-46" fill="none" stroke="#efc7a8" strokeWidth="7" strokeLinecap="round" />
      ) : (
        <path d="M80 98c10 8 14 28 12 46" fill="none" stroke="#efc7a8" strokeWidth="7" strokeLinecap="round" />
      )}
      <path d="M42 98c-12 10-14 30-8 48" fill="none" stroke="#efc7a8" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function Plant() {
  return (
    <svg className="plant" viewBox="0 0 70 90" aria-hidden="true">
      <path d="M34 48c-2-16 10-28 18-32-8 14-6 26-2 32z" fill="#3f6b45" />
      <path d="M32 50C28 34 14 28 8 22c10 8 16 18 18 28z" fill="#2f5d50" />
      <path d="M33 50c2-14 14-20 22-18-8 6-12 14-12 20z" fill="#4e7d52" />
      <rect x="26" y="48" width="16" height="18" rx="2" fill="#6b4632" />
      <path d="M24 64h22l-3 10H27z" fill="#8a5a3a" />
    </svg>
  );
}
