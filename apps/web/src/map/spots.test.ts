import { MAP_NODES, mapNodeStates } from "@levex/domain";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLACE_ICON_DIR, PLACE_ICON_FILE, placeIconUrl } from "./placeIcons.js";
import {
  BADGE_FILE,
  BADGE_RADIUS,
  MAP_VIEW,
  SPOTS,
  avatarFeet,
  domeEllipse,
  domeGlow,
  lockedHint,
  spotFor,
  toViewPercent,
} from "./spots.js";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));
const publicFile = (url: string) => `${publicDir}${url}`;

describe("scene 11 map spots", () => {
  it("reads all five places from map_spots.json, bottom to top in domain order", () => {
    expect(SPOTS.map((spot) => spot.id)).toEqual(MAP_NODES.map((node) => node.id));
    expect(SPOTS.map((spot) => spot.label)).toEqual(MAP_NODES.map((node) => node.name));
    const heights = SPOTS.map((spot) => spot.badge[1]);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
  });

  it("zigzags left and right with Центр LEVEX centred on top", () => {
    expect(SPOTS.map((spot) => spot.side)).toEqual(["left", "right", "left", "right", "center"]);
    expect(SPOTS.filter((spot) => spot.hero).map((spot) => spot.id)).toEqual(["center"]);
  });

  it("keeps every badge inside the visible part of the map", () => {
    for (const spot of SPOTS) {
      const [x, y] = spot.badge;
      expect(x - BADGE_RADIUS, spot.id).toBeGreaterThanOrEqual(MAP_VIEW.x);
      expect(x + BADGE_RADIUS, spot.id).toBeLessThanOrEqual(MAP_VIEW.x + MAP_VIEW.w);
      expect(y - BADGE_RADIUS, spot.id).toBeGreaterThanOrEqual(MAP_VIEW.y);
      expect(y + BADGE_RADIUS + 60, spot.id).toBeLessThanOrEqual(MAP_VIEW.y + MAP_VIEW.h);
    }
  });

  it("puts each dome ellipse over its own building and not over another badge", () => {
    for (const spot of SPOTS) {
      const dome = domeEllipse(spot);
      expect(dome.cx).toBe(spot.building[0]);
      expect(dome.cy).toBeLessThan(spot.building[1]);
      for (const other of SPOTS) {
        const dx = (other.badge[0] - dome.cx) / dome.rx;
        const dy = (other.badge[1] - dome.cy) / dome.ry;
        expect(dx * dx + dy * dy, `${other.id} badge under ${spot.id} dome`).toBeGreaterThan(1);
      }
    }
  });

  it("stands the avatar beside the badge, inside the map", () => {
    for (const spot of SPOTS) {
      const [x] = avatarFeet(spot);
      expect(Math.abs(x - spot.badge[0]), spot.id).toBeGreaterThan(BADGE_RADIUS);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_VIEW.w);
    }
    expect(toViewPercent([MAP_VIEW.x, MAP_VIEW.y])).toEqual({ left: "0.000%", top: "0.000%" });
  });

  it("reads the same map_spots.json that ships in public/map", () => {
    const shipped = readFileSync(publicFile("/map/map_spots.json"), "utf8");
    const bundled = readFileSync(fileURLToPath(new URL("./scene11/map_spots.json", import.meta.url)), "utf8");
    expect(bundled).toBe(shipped);
  });

  it("throws for an unknown place", () => {
    expect(() => spotFor("nowhere" as never)).toThrow();
  });
});

describe("spot states", () => {
  it("draws the four states with four different badges that exist", () => {
    const files = Object.values(BADGE_FILE);
    expect(new Set(files).size).toBe(4);
    for (const file of files) expect(existsSync(publicFile(file)), file).toBe(true);
  });

  it("matches the scene 11 mock at level 2 with Дом and Учебный центр done", () => {
    const states = mapNodeStates({ level: 2, doneSpheres: ["health", "mind"] }).map((node) => [node.id, node.state]);
    expect(states).toEqual([
      ["home", "done"],
      ["study", "done"],
      ["park", "current"],
      ["workshop", "available"],
      ["center", "locked"],
    ]);
  });

  it("glows done cyan and current violet only", () => {
    expect(domeGlow("done")?.color).toBe("#22d3ee");
    expect(domeGlow("current")?.color).toBe("#a78bfa");
    expect(domeGlow("available")).toBeNull();
    expect(domeGlow("locked")).toBeNull();
  });
});

describe("locked hint", () => {
  it("names the place, the unlock level and the XP still needed", () => {
    expect(lockedHint("center", { level: 2, xp: 155 })).toBe(
      "Центр LEVEX откроется на уровне 4. Сейчас уровень 2 — ещё 145 XP.",
    );
    expect(lockedHint("park", { level: 1, xp: 40 })).toBe("Парк откроется на уровне 2. Сейчас уровень 1 — ещё 60 XP.");
  });

  it("never asks for negative XP and knows when a place is open", () => {
    expect(lockedHint("center", { level: 3, xp: 900 })).toContain("ещё 0 XP");
    expect(lockedHint("home", { level: 1, xp: 0 })).toBe("Это место уже открыто.");
  });
});

describe("place icons", () => {
  it("maps every place to one icon file that exists", () => {
    for (const node of MAP_NODES) {
      expect(PLACE_ICON_FILE[node.id], node.id).toMatch(/\.svg$/);
      const url = placeIconUrl(node.id);
      expect(url.startsWith(`${PLACE_ICON_DIR}/`)).toBe(true);
      expect(existsSync(publicFile(url)), url).toBe(true);
      const svg = readFileSync(publicFile(url), "utf8");
      expect(svg, `${url} must not rely on currentColor inside <img>`).not.toContain("currentColor");
    }
  });

  it("ships the icon license next to the icons", () => {
    // scene14 icons are original work; their licenses sit one level up, next to the fonts' OFL texts.
    expect(existsSync(publicFile(`${PLACE_ICON_DIR}/../LICENSES.md`))).toBe(true);
    expect(existsSync(publicFile("/map/SCENE11_LICENSES.md"))).toBe(true);
  });
});
