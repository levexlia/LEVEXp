import type { AvatarConfig } from "@levex/domain";

const SKIN: Record<AvatarConfig["skin"], string> = {
  peach: "#F6C7A8",
  light: "#FDE7D6",
  tan: "#E0A878",
  amber: "#C68642",
  brown: "#8D5524",
  deep: "#5C3317",
};

const HAIR: Record<AvatarConfig["hairColor"], string> = {
  black: "#2A211C",
  brown: "#6B3E26",
  auburn: "#A24B2C",
  blonde: "#E6C07B",
  pink: "#F472B6",
  cyan: "#22D3EE",
};

const INK = "#1B1233";

export function AvatarFigure({
  config,
  cheer = false,
  title,
}: {
  config: AvatarConfig;
  cheer?: boolean;
  title?: string;
}) {
  const skin = SKIN[config.skin];
  const hair = HAIR[config.hairColor];
  const raised = config.emotion === "happy" || config.emotion === "surprised";
  return (
    <svg className={cheer ? "hero cheer" : "hero"} viewBox="0 0 160 220" role="img" aria-label={title ?? "Персонаж"}>
      <ellipse cx="80" cy="208" rx="36" ry="8" fill="#000" opacity="0.25" />
      <Limb x={raised ? 28 : 36} y={raised ? 78 : 118} skin={skin} />
      <Limb x={raised ? 116 : 108} y={raised ? 78 : 118} skin={skin} />
      <Outfit kind={config.outfit} />
      <circle cx="80" cy="72" r="34" fill={hair} stroke={INK} strokeWidth="3" />
      <circle cx="80" cy="78" r="30" fill={skin} stroke={INK} strokeWidth="3" />
      <Bangs style={config.hair} color={hair} />
      <Eyes emotion={config.emotion} style={config.eyes} />
      <Mouth emotion={config.emotion} />
      {config.accessory === "glasses" ? (
        <g fill="none" stroke={INK} strokeWidth="2.5">
          <circle cx="68" cy="80" r="8" />
          <circle cx="92" cy="80" r="8" />
          <path d="M76 80 h8" />
        </g>
      ) : null}
      {config.accessory === "star" ? (
        <polygon points="118,48 122,58 132,58 124,64 127,74 118,68 109,74 112,64 104,58 114,58" fill="#FDE68A" stroke={INK} strokeWidth="1.5" />
      ) : null}
      {config.accessory === "headphones" ? (
        <g fill={hair} stroke={INK} strokeWidth="2">
          <path d="M50 78 C50 48 110 48 110 78" fill="none" stroke={hair} strokeWidth="5" />
          <rect x="42" y="72" width="12" height="16" rx="3" />
          <rect x="106" y="72" width="12" height="16" rx="3" />
        </g>
      ) : null}
      {config.emotion === "sleepy" ? <text x="112" y="40" fill="#C4B5FD" fontSize="16" fontFamily="sans-serif">z</text> : null}
    </svg>
  );
}

function Limb({ x, y, skin }: { x: number; y: number; skin: string }) {
  return <rect x={x} y={y} width="14" height="36" rx="7" fill={skin} stroke={INK} strokeWidth="3" />;
}

function Outfit({ kind }: { kind: AvatarConfig["outfit"] }) {
  const cloth = kind === "tee" ? "#3B82F6" : kind === "jacket" ? "#312E81" : kind === "dress" ? "#A855F7" : "#7C3AED";
  return (
    <g stroke={INK} strokeWidth="3">
      <rect x="48" y="112" width="64" height="46" rx="14" fill={cloth} />
      {kind === "dress" ? (
        <path d="M44 150 h72 l8 40 H36 z" fill={cloth} />
      ) : (
        <>
          <rect x="52" y="154" width="22" height="42" rx="8" fill="#312E81" />
          <rect x="86" y="154" width="22" height="42" rx="8" fill="#312E81" />
        </>
      )}
    </g>
  );
}

function Bangs({ style, color }: { style: AvatarConfig["hair"]; color: string }) {
  const fringe = style === "short" || style === "bob" || style === "curly"
    ? "M52 70 C60 48 100 46 108 70 C96 60 64 60 52 70 Z"
    : "M54 66 C62 46 98 44 108 64 C90 56 68 56 54 66 Z";
  return (
    <g fill={color} stroke={INK} strokeWidth="2.5">
      <path d={fringe} />
      {style === "long" || style === "wavy" ? <path d="M50 78 C46 110 52 130 60 132 C58 100 62 86 50 78 Z" /> : null}
      {style === "long" || style === "wavy" ? <path d="M110 78 C114 110 108 130 100 132 C102 100 98 86 110 78 Z" /> : null}
      {style === "bun" ? <circle cx="80" cy="40" r="12" /> : null}
      {style === "ponytail" ? <path d="M104 58 C124 70 122 110 108 120" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" /> : null}
      {style === "pigtails" ? <circle cx="46" cy="96" r="10" /> : null}
      {style === "pigtails" ? <circle cx="114" cy="96" r="10" /> : null}
    </g>
  );
}

function Eyes({ emotion, style }: { emotion: AvatarConfig["emotion"]; style: AvatarConfig["eyes"] }) {
  if (emotion === "sleepy") {
    return <path d="M60 80 h16 M86 80 h16" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
  }
  const ry = emotion === "surprised" || style === "wide" ? 7 : style === "soft" ? 4.5 : 5.5;
  return (
    <g className="eyes">
      <Eye cx={64} ry={ry} />
      <Eye cx={96} ry={ry} />
    </g>
  );
}

function Eye({ cx, ry }: { cx: number; ry: number }) {
  return (
    <g className="eye">
      <ellipse cx={cx} cy="80" rx="5" ry={ry} fill={INK} />
      <circle cx={cx + 1.5} cy="78" r="1.6" fill="#fff" />
      <rect className="lid" x={cx - 6} y="73" width="12" height="14" fill="#F6C7A8" />
    </g>
  );
}

function Mouth({ emotion }: { emotion: AvatarConfig["emotion"] }) {
  if (emotion === "surprised") return <ellipse cx="80" cy="98" rx="6" ry="8" fill={INK} />;
  if (emotion === "sleepy") return <path d="M72 96 h16" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
  if (emotion === "proud") return <path d="M70 96 Q80 102 90 95" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
  return <path d="M68 94 Q80 108 92 94" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
}
