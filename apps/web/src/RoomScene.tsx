import { isDisplayableImageUrl } from "@levex/domain";
import { useEffect, useState, type CSSProperties } from "react";
import roomJpeg from "./assets/room.jpg";
import roomWebp from "./assets/room.webp";
import roomWebpSm from "./assets/room-sm.webp";
import type { Placement } from "./api";
import { FRAME_SLOTS, galleryView } from "./frames";

/** Bulbs along the painted string, as percentages of the picture. */
const BULBS: Array<[number, number, number]> = [
  [61, 10.5, 0],
  [67, 8.2, 0.4],
  [73, 7.2, 0.9],
  [79, 8.6, 1.3],
  [85, 11.4, 0.2],
  [91, 14.2, 1.1],
  [96, 16.4, 0.6],
];

export function RoomScene({
  placements,
  broken,
  onImageError,
  cheer,
  avatarUrl,
  onCreateCharacter,
}: {
  placements: Placement[];
  goals?: unknown;
  broken: Record<string, boolean>;
  onImageError: (id: string) => void;
  cheer: number;
  avatarUrl?: string | null;
  onCreateCharacter: () => void;
}) {
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const portrait = avatarUrl && !avatarBroken && isDisplayableImageUrl(avatarUrl) ? avatarUrl.trim() : null;
  const { shown, hidden } = galleryView(placements);

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (cheer === 0) return;
    setCelebrate(true);
    const timer = window.setTimeout(() => setCelebrate(false), 2100);
    return () => window.clearTimeout(timer);
  }, [cheer]);

  return (
    <div className="room-frame">
      <div className="room-stage">
        <picture className="room-art">
          <source
            type="image/webp"
            srcSet={`${roomWebpSm} 768w, ${roomWebp} 1152w`}
            sizes="(max-width: 720px) 100vw, 960px"
          />
          <img src={roomJpeg} alt="" />
        </picture>

        <div className="lamp-glow" aria-hidden="true" />
        <div className="fairy-lights" aria-hidden="true">
          {BULBS.map(([x, y, delay]) => (
            <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }} />
          ))}
        </div>
        <div className="motes" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <i key={index} style={{ "--i": index } as CSSProperties} />
          ))}
        </div>

        <div className="frames">
          {FRAME_SLOTS.map((slot, index) => {
            const placement = shown[index];
            const style = {
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.w}%`,
              height: `${slot.h}%`,
              transform: `rotate(${slot.rotate}deg)`,
            };
            if (!placement) {
              return (
                <div key={`empty-${index}`} className="wall-frame empty" style={style} aria-hidden="true">
                  <span className="wall-blank" />
                </div>
              );
            }
            const failed = broken[placement.artifact.id] === true;
            const src = !failed && placement.artifact.imageUrl && isDisplayableImageUrl(placement.artifact.imageUrl)
              ? placement.artifact.imageUrl.trim()
              : null;
            const title = placement.artifact.title;
            const open = openId === placement.artifactId;
            return (
              <button
                key={placement.artifactId}
                type="button"
                className={open ? "wall-frame open" : "wall-frame"}
                style={style}
                title={title}
                aria-pressed={open}
                onClick={() => setOpenId(open ? null : placement.artifactId)}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    onError={() => onImageError(placement.artifact.id)}
                  />
                ) : (
                  <span className="wall-blank">{failed ? "не показывается" : ""}</span>
                )}
                <span className="wall-cap">{title}</span>
              </button>
            );
          })}
        </div>

        <div className={celebrate ? "resident celebrate" : "resident"}>
          <span className="ground-shadow" aria-hidden="true" />
          {portrait ? (
            <img
              className="resident-figure"
              src={portrait}
              alt=""
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <button type="button" className="resident-cta" onClick={onCreateCharacter}>
              <svg className="silhouette" viewBox="0 0 80 160" aria-hidden="true">
                <ellipse cx="40" cy="22" rx="11" ry="12" fill="#3a2a22" opacity="0.9" />
                <path d="M26 40c1 6 6 10 14 10s13-4 14-10c6 2 10 8 10 16v28c0 4-3 6-6 6h-8l2 18-8 2-4-20h-0l-4 20-8-2 2-18h-8c-3 0-6-2-6-6V56c0-8 4-14 10-16z" fill="#c4a882" />
                <path d="M30 96h20l4 48H26z" fill="#5d7a68" />
                <ellipse cx="32" cy="148" rx="8" ry="3.5" fill="#6b5344" />
                <ellipse cx="48" cy="148" rx="8" ry="3.5" fill="#5c4638" />
              </svg>
              <span>Создать персонажа</span>
            </button>
          )}
        </div>

        {hidden > 0 ? (
          <p className="gallery-count" aria-label={`В галерее ещё ${hidden}`}>Ещё {hidden}</p>
        ) : null}
      </div>
      <ul className="sr-only">
        {placements.map((placement) => (
          <li key={placement.artifactId}>{placement.artifact.title}</li>
        ))}
      </ul>
    </div>
  );
}
