import { describe, expect, it } from "vitest";
import { recolorMarkup, scopeMarkup } from "./paint.js";

const SAMPLE = [
  '<path fill="#feb175"/>',
  '<path fill="#f28f52"/>',
  '<path fill="#70432a"/>',
  '<path fill="#53301e"/>',
  '<path fill="#6b3d22"/>',
  '<path fill="#0a1c46"/>',
  '<path fill="#fff"/>',
  '<path fill="#211a1a"/>',
].join("");

describe("avatar paint", () => {
  it("recolors skin, hair, and brows and leaves the fixed inks", () => {
    const painted = recolorMarkup(SAMPLE, "deep", "cyan");
    expect(painted).toContain('fill="#7a4a2c"');
    expect(painted).toContain('fill="#5e3520"');
    expect(painted).toContain('fill="#22d3ee"');
    expect(painted).toContain('fill="#0ea5c4"');
    expect(painted).toContain('fill="#0b86a0"');
    expect(painted).toContain('fill="#0a1c46"');
    expect(painted).toContain('fill="#fff"');
    expect(painted).toContain('fill="#211a1a"');
    expect(painted).not.toContain("#feb175");
    expect(painted).not.toContain("#70432a");
    expect(painted).not.toContain("#6b3d22");
  });

  it("prefixes ids so neighboring avatars do not share them", () => {
    const src = '<g id="iris"><use href="#iris"/><path fill="url(#iris)"/></g>';
    const one = scopeMarkup(src, "a1-");
    const two = scopeMarkup(src, "a2-");
    expect(one).toContain('id="a1-iris"');
    expect(one).toContain('href="#a1-iris"');
    expect(one).toContain("url(#a1-iris)");
    expect(one).not.toContain('id="a2-iris"');
    expect(two).toContain('id="a2-iris"');
    expect(two).not.toContain('id="a1-iris"');
  });
});
