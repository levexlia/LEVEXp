import type { Accessory, AvatarConfig, Expression, HairStyle, Outfit } from "@levex/domain";
import { useId } from "react";
import { recolorMarkup, scopeMarkup, svgInner } from "./paint";
import accClip from "./kit/svg/acc_clip.svg?raw";
import accGlasses from "./kit/svg/acc_glasses.svg?raw";
import accHeadphones from "./kit/svg/acc_headphones.svg?raw";
import bodyCyan from "./kit/svg/body_cyan_jacket.svg?raw";
import bodyHoodie from "./kit/svg/body_hoodie.svg?raw";
import bodyTrack from "./kit/svg/body_tracksuit.svg?raw";
import bodyTee from "./kit/svg/body_tshirt_shorts.svg?raw";
import faceHappy from "./kit/svg/face_happy.svg?raw";
import faceProud from "./kit/svg/face_proud.svg?raw";
import faceSleepy from "./kit/svg/face_sleepy.svg?raw";
import faceSurprised from "./kit/svg/face_surprised.svg?raw";
import hairBackBob from "./kit/svg/hairB_bob.svg?raw";
import hairBackCurly from "./kit/svg/hairB_curly.svg?raw";
import hairBackLong from "./kit/svg/hairB_long.svg?raw";
import hairBob from "./kit/svg/hairF_bob.svg?raw";
import hairBuns from "./kit/svg/hairF_buns.svg?raw";
import hairCurly from "./kit/svg/hairF_curly.svg?raw";
import hairLong from "./kit/svg/hairF_long.svg?raw";
import hairPonytail from "./kit/svg/hairF_ponytail.svg?raw";
import hairShort from "./kit/svg/hairF_short.svg?raw";
import headSvg from "./kit/svg/head.svg?raw";

/** Head, hair, and the top of the outfit. Full figure is `0 0 864 1152`. */
export const HEAD_VIEWBOX = "168 8 528 560";

const HAIR_FRONT: Record<HairStyle, string> = {
  hair_long: hairLong,
  hair_bob: hairBob,
  hair_curly: hairCurly,
  hair_ponytail: hairPonytail,
  hair_buns: hairBuns,
  hair_short: hairShort,
};

const HAIR_BACK: Partial<Record<HairStyle, string>> = {
  hair_long: hairBackLong,
  hair_bob: hairBackBob,
  hair_curly: hairBackCurly,
};

const OUTFIT_SVG: Record<Outfit, string> = {
  outfit_hoodie: bodyHoodie,
  outfit_cyan_jacket: bodyCyan,
  outfit_tshirt_shorts: bodyTee,
  outfit_tracksuit: bodyTrack,
};

const FACE_SVG: Record<Expression, string> = {
  happy: faceHappy,
  proud: faceProud,
  sleepy: faceSleepy,
  surprised: faceSurprised,
};

const ACCESSORY_SVG: Record<Exclude<Accessory, "none">, string> = {
  acc_glasses: accGlasses,
  acc_headphones: accHeadphones,
  acc_clip: accClip,
};

interface Layer {
  id: string;
  z: number;
  svg: string;
}

function layersFor(config: AvatarConfig, expression: Expression): Layer[] {
  const layers: Layer[] = [];
  const back = HAIR_BACK[config.hairStyle];
  if (back) layers.push({ id: "hair_back", z: 10, svg: back });
  layers.push({ id: "body", z: 20, svg: OUTFIT_SVG[config.outfit] });
  layers.push({ id: "head", z: 30, svg: headSvg });
  layers.push({ id: "face", z: 40, svg: FACE_SVG[expression] });
  layers.push({ id: "hair_front", z: 50, svg: HAIR_FRONT[config.hairStyle] });
  if (config.accessory !== "none") {
    layers.push({ id: "accessory", z: 60, svg: ACCESSORY_SVG[config.accessory] });
  }
  return layers.sort((a, b) => a.z - b.z);
}

export function Avatar({
  config,
  cheer = false,
  crop = "body",
  idle = true,
  title,
  decorative = false,
}: {
  config: AvatarConfig;
  cheer?: boolean;
  crop?: "body" | "head";
  idle?: boolean;
  title?: string;
  decorative?: boolean;
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const expression: Expression = cheer ? "happy" : config.expression;
  const layers = layersFor(config, expression);
  const className = ["hero", idle ? "idle" : "", cheer ? "cheer" : ""].filter(Boolean).join(" ");
  return (
    <svg
      id={prefix}
      className={className}
      viewBox={crop === "head" ? HEAD_VIEWBOX : "0 0 864 1152"}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title ?? "Персонаж"}
    >
      {layers.map((layer) => (
        <g
          key={layer.id}
          data-layer={layer.id}
          dangerouslySetInnerHTML={{
            __html: scopeMarkup(
              recolorMarkup(svgInner(layer.svg), config.skinTone, config.hairColor),
              `${prefix}-${layer.id}-`,
            ),
          }}
        />
      ))}
    </svg>
  );
}
