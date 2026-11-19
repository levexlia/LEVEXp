// Rebuilds public/art/scene14/_static/** from the animated scene14 SVGs.
// Run: npm run art:static -w @levex/web
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIMATED_ART, isAnimatedSvg, staticFrame } from "../src/theme/motion";

const art = join(dirname(fileURLToPath(import.meta.url)), "../public/art/scene14");
for (const rel of ANIMATED_ART) {
  const source = readFileSync(join(art, rel), "utf8");
  if (!isAnimatedSvg(source)) throw new Error(`${rel} is not animated; drop it from ANIMATED_ART`);
  const out = join(art, "_static", rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, staticFrame(source));
}
console.log(`wrote ${ANIMATED_ART.size} static frames`);
