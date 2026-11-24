// The player's gender is unknown: user-facing Russian texts must not use gendered forms (playtest 24.11).
// Scans the source of the web client, the API and the domain (tests and art JSON excluded).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { systemPrompt } from "./assistant/prompt.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DIRS = ["apps/web/src", "apps/api/src", "packages/domain/src"];

/** Past-tense / short-adjective forms that carry gender when said to or about the player. */
const GENDERED = /(^|[^а-яё])(закончил|закончила|сделал|сделала|заметил|заметила|устал|устала|смог|смогла|готов|готова|рад|рада|молодец|умница|сам|сама)(?![а-яё])|\((а|ла)\)/iu;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "fixtures" ? [] : files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Russian string and JSX text, without code comments. */
function texts(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  return [...code.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
    .filter((text) => /[а-яё]/iu.test(text));
}

describe("gender-neutral Russian texts", () => {
  it("no gendered forms in user-facing strings", () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(path.join(ROOT, dir))) {
        for (const text of texts(readFileSync(file, "utf8"))) {
          // The assistant rule itself quotes the forms it forbids.
          if (GENDERED.test(text) && !text.includes("гендерно-нейтрально")) hits.push(`${path.relative(ROOT, file)}: ${text.trim().slice(0, 90)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("the assistant is told to address the player gender-neutrally", () => {
    const prompt = systemPrompt({
      nickname: "Игрок", level: 1, xpIntoLevel: 0, xpPerLevel: 100, streak: 0, openMissions: [], doneToday: 0, places: [],
    });
    expect(prompt).toMatch(/гендерно-нейтрально/);
    expect(prompt).toMatch(/не угадывай/);
  });
});
