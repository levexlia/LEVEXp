import { LIFE_SPHERES } from "@levex/domain";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "../avatar/kit/manifest.json";
import { SPHERE_ICON } from "./KitIcon";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

describe("sphere icons in «Ресурсы»", () => {
  it("gives every one of the 8 life spheres an icon", () => {
    expect(LIFE_SPHERES.filter((sphere) => !SPHERE_ICON[sphere.id]).map((sphere) => sphere.id)).toEqual([]);
  });

  it.each([
    ["finance", "sp_finance.svg"],
    ["relationships", "sp_relationships.svg"],
  ])("ships the %s icon as a square kit SVG in public/map", (sphere, file) => {
    expect(SPHERE_ICON[sphere]).toBe(sphere);
    const path = `${publicDir}/map/${file}`;
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, "utf8");
    expect(svg).toMatch(/<svg[^>]*width="300" height="300" viewBox="0 0 300 300"/);
    expect(svg).toContain("#7341ed"); // kit violet, as in sp_community / sp_sport
    expect(svg).not.toMatch(/<script|<image|href="http/);
  });
});

describe("avatar kit manifest labels", () => {
  it("names the faces with the same neutral nouns as AvatarBuilder", () => {
    const faces = Object.fromEntries(
      manifest.parts.filter((part) => part.id.startsWith("face_")).map((part) => [part.id, part.label_ru]),
    );
    expect(faces).toEqual({
      face_happy: "Радость",
      face_proud: "Гордость",
      face_sleepy: "Сонливость",
      face_surprised: "Удивление",
    });
  });
});
