import {
  ACCESSORIES,
  EXPRESSIONS,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
  type Accessory,
  type AvatarConfig,
  type Expression,
  type HairColor,
  type SkinTone,
} from "@levex/domain";
import { useState, type ReactNode } from "react";
import { Avatar } from "./avatar/Avatar";
import manifest from "./avatar/kit/manifest.json";

const TABS = [
  { id: "hair", label: "Причёска" },
  { id: "face", label: "Лицо" },
  { id: "outfit", label: "Одежда" },
  { id: "extra", label: "Аксессуары" },
] as const;

const PART_LABEL = Object.fromEntries(manifest.parts.map((part) => [part.id, part.label_ru]));

const EXPRESSION_LABEL: Record<Expression, string> = {
  happy: PART_LABEL.face_happy ?? "Радостная",
  proud: PART_LABEL.face_proud ?? "Гордая",
  sleepy: PART_LABEL.face_sleepy ?? "Сонная",
  surprised: PART_LABEL.face_surprised ?? "Удивлённая",
};

const ACCESSORY_LABEL: Record<Accessory, string> = {
  none: "Нет",
  acc_glasses: PART_LABEL.acc_glasses ?? "Очки",
  acc_headphones: PART_LABEL.acc_headphones ?? "Наушники",
  acc_clip: PART_LABEL.acc_clip ?? "Заколка-звезда",
};

const skinPalettes = manifest.recolor.skin.palettes as Record<SkinTone, { main: string }>;
const hairPalettes = manifest.recolor.hair.palettes as Record<HairColor, { main: string }>;

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
        <Avatar config={value} title="Собранный персонаж" />
      </div>
      <div className="controls">
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
            selected={value.skinTone}
            color={(id) => skinPalettes[id].main}
            onPick={(skinTone) => onChange({ ...value, skinTone })}
          />
        ) : null}
        {tab === "hair" ? (
          <>
            <Tiles
              label="Форма"
              values={HAIR_STYLES}
              selected={value.hairStyle}
              onPick={(hairStyle) => onChange({ ...value, hairStyle })}
              preview={(hairStyle) => <Avatar config={{ ...value, hairStyle }} crop="head" idle={false} decorative />}
              name={(hairStyle) => PART_LABEL[hairStyle] ?? hairStyle}
            />
            <Swatches
              label="Цвет"
              values={HAIR_COLORS}
              selected={value.hairColor}
              color={(id) => hairPalettes[id].main}
              onPick={(hairColor) => onChange({ ...value, hairColor })}
            />
          </>
        ) : null}
        {tab === "outfit" ? (
          <Tiles
            label="Одежда"
            values={OUTFITS}
            selected={value.outfit}
            onPick={(outfit) => onChange({ ...value, outfit })}
            preview={(outfit) => <Avatar config={{ ...value, outfit }} crop="body" idle={false} decorative />}
            name={(outfit) => PART_LABEL[outfit] ?? outfit}
          />
        ) : null}
        {tab === "extra" ? (
          <Tiles
            label="Аксессуар"
            values={ACCESSORIES}
            selected={value.accessory}
            onPick={(accessory) => onChange({ ...value, accessory })}
            preview={(accessory) => (
              <Avatar config={{ ...value, accessory }} crop="head" idle={false} decorative />
            )}
            name={(accessory) => ACCESSORY_LABEL[accessory]}
          />
        ) : null}
        <button type="button" className="photo-look" onClick={onPhoto} disabled={busy}>Создать по фото</button>
        <div className="emotions" role="list">
          {EXPRESSIONS.map((expression) => (
            <button
              key={expression}
              type="button"
              className={value.expression === expression ? "emotion on" : "emotion"}
              aria-pressed={value.expression === expression}
              onClick={() => onChange({ ...value, expression })}
            >
              <Avatar config={{ ...value, expression }} crop="head" idle={false} decorative />
              <span>{EXPRESSION_LABEL[expression]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="done" onClick={onDone} disabled={busy}>Готово</button>
      </div>
    </section>
  );
}

function Tiles<T extends string>({
  label,
  values,
  selected,
  onPick,
  preview,
  name,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onPick: (value: T) => void;
  preview: (value: T) => ReactNode;
  name: (value: T) => string;
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
            aria-label={name(value)}
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
