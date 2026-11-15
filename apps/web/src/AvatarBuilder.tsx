import {
  ACCESSORIES,
  EMOTIONS,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
  type AvatarConfig,
} from "@levex/domain";
import { useState, type ReactNode } from "react";
import { AvatarFigure } from "./AvatarFigure";

const TABS = [
  { id: "face", label: "Лицо" },
  { id: "hair", label: "Причёска" },
  { id: "eyes", label: "Глаза" },
  { id: "outfit", label: "Одежда" },
  { id: "extra", label: "Аксессуары" },
] as const;

const EMOTION_LABEL: Record<AvatarConfig["emotion"], string> = {
  happy: "Радостная",
  proud: "Гордая",
  sleepy: "Сонная",
  surprised: "Удивлённая",
};

const HAIR_COLOR: Record<AvatarConfig["hairColor"], string> = {
  black: "#2A211C",
  brown: "#6B3E26",
  auburn: "#A24B2C",
  blonde: "#E6C07B",
  pink: "#F472B6",
  cyan: "#22D3EE",
};

export function AvatarBuilder({
  value,
  busy,
  onChange,
  onDone,
  onPhoto,
}: {
  value: AvatarConfig;
  busy: boolean;
  onChange: (next: AvatarConfig) => void;
  onDone: () => void;
  onPhoto: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("hair");
  return (
    <section className="builder" aria-labelledby="builder-title">
      <h2 id="builder-title" className="sr-only">Собрать персонажа</h2>
      <div className="platform">
        <AvatarFigure config={value} />
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "tab on" : "tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "face" ? (
        <Swatches
          label="Тон кожи"
          values={SKIN_TONES}
          selected={value.skin}
          color={(id) => ({ peach: "#F6C7A8", light: "#FDE7D6", tan: "#E0A878", amber: "#C68642", brown: "#8D5524", deep: "#5C3317" }[id])}
          onPick={(skin) => onChange({ ...value, skin })}
        />
      ) : null}
      {tab === "hair" ? (
        <>
          <Tiles
            label="Форма"
            values={HAIR_STYLES}
            selected={value.hair}
            onPick={(hair) => onChange({ ...value, hair })}
            preview={(hair) => <AvatarFigure config={{ ...value, hair }} />}
          />
          <Swatches
            label="Цвет"
            values={HAIR_COLORS}
            selected={value.hairColor}
            color={(id) => HAIR_COLOR[id]}
            onPick={(hairColor) => onChange({ ...value, hairColor })}
          />
        </>
      ) : null}
      {tab === "eyes" ? (
        <Tiles
          label="Глаза"
          values={EYE_STYLES}
          selected={value.eyes}
          onPick={(eyes) => onChange({ ...value, eyes })}
          preview={(eyes) => <AvatarFigure config={{ ...value, eyes }} />}
        />
      ) : null}
      {tab === "outfit" ? (
        <Tiles
          label="Одежда"
          values={OUTFITS}
          selected={value.outfit}
          onPick={(outfit) => onChange({ ...value, outfit })}
          preview={(outfit) => <AvatarFigure config={{ ...value, outfit }} />}
        />
      ) : null}
      {tab === "extra" ? (
        <Tiles
          label="Аксессуар"
          values={ACCESSORIES}
          selected={value.accessory}
          onPick={(accessory) => onChange({ ...value, accessory })}
          preview={(accessory) => <AvatarFigure config={{ ...value, accessory }} />}
        />
      ) : null}
      <button type="button" className="photo-look" onClick={onPhoto} disabled={busy}>Создать по фото</button>
      <div className="emotions" role="list">
        {EMOTIONS.map((emotion) => (
          <button
            key={emotion}
            type="button"
            className={value.emotion === emotion ? "emotion on" : "emotion"}
            onClick={() => onChange({ ...value, emotion })}
          >
            <AvatarFigure config={{ ...value, emotion }} />
            <span>{EMOTION_LABEL[emotion]}</span>
          </button>
        ))}
      </div>
      <button type="button" className="done" onClick={onDone} disabled={busy}>Готово</button>
    </section>
  );
}

function Tiles<T extends string>({
  label,
  values,
  selected,
  onPick,
  preview,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onPick: (value: T) => void;
  preview: (value: T) => ReactNode;
}) {
  return (
    <div>
      <p className="tab-label">{label}</p>
      <div className="tiles">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={value === selected ? "tile on" : "tile"}
            aria-pressed={value === selected}
            onClick={() => onPick(value)}
          >
            {preview(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches<T extends string>({
  label,
  values,
  selected,
  color,
  onPick,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  color: (value: T) => string;
  onPick: (value: T) => void;
}) {
  return (
    <div>
      <p className="tab-label">{label}</p>
      <div className="swatches">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={value === selected ? "swatch on" : "swatch"}
            style={{ background: color(value) }}
            aria-label={value}
            aria-pressed={value === selected}
            onClick={() => onPick(value)}
          />
        ))}
      </div>
    </div>
  );
}
