import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AVATAR_STYLE_PROMPT } from "@levex/domain";
import { buildApp } from "./app.js";
import {
  avatarGeneratorFromEnv,
  createOpenAIAvatarGenerator,
  createXaiAvatarGenerator,
  DEFAULT_OPENAI_IMAGE_MODEL,
  DEFAULT_XAI_IMAGE_MODEL,
  MockAvatarGenerator,
  type AvatarGenerator,
} from "./avatar/generator.js";
import {
  getPlayer,
  openStore,
  resetStore,
  setClockForTests,
  setStoreWriterForTests,
} from "./store.js";
import { defaultUploadsDir } from "./uploads.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_OTHER = Buffer.concat([PNG_1X1, Buffer.from("other-selfie")]);
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDAQ8OEB4TGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=",
  "base64",
);
const GIF_1X1 = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

describe("avatar from photo", () => {
  const temps: string[] = [];

  beforeEach(() => {
    setStoreWriterForTests(null);
    setClockForTests(() => new Date("2026-11-13T12:00:00.000Z"));
    openStore(null);
    resetStore(false);
  });

  afterEach(() => {
    setStoreWriterForTests(null);
    setClockForTests(null);
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-avatar-"));
    temps.push(dir);
    return path.join(dir, "levexp.json");
  }

  function app(extra: Parameters<typeof buildApp>[0] = {}) {
    return buildApp({ logger: false, avatarGenerator: new MockAvatarGenerator(), avatarCandidateCount: 3, ...extra });
  }

  it("rejects a missing file, a non-image, a gif, an empty file, json, and a file over the limit", async () => {
    const file = tempFile();
    openStore(file);
    const a = app();

    const missing = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }),
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: "file is required" });

    const text = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "note.txt", type: "text/plain", content: Buffer.from("hello") }),
    });
    expect(text.statusCode).toBe(400);
    expect(text.json()).toEqual({ error: "file must be a png, jpeg, or webp image" });

    const gif = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "a.gif", type: "image/gif", content: GIF_1X1 }),
    });
    expect(gif.statusCode).toBe(400);
    expect(gif.json()).toEqual({ error: "file must be a png, jpeg, or webp image" });

    const empty = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "empty.png", type: "image/png", content: Buffer.alloc(0) }),
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual({ error: "file is empty" });

    const json = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      payload: { consent: true },
      headers: { "content-type": "application/json" },
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().error).toMatch(/multipart/);

    const big = await app({ maxUploadBytes: 32 }).inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "big.png", type: "image/png", content: PNG_1X1 }),
    });
    expect(big.statusCode).toBe(400);
    expect(big.json()).toEqual({ error: "file is too large" });

    expect(storedUploads()).toEqual([]);
    expect((await a.inject({ method: "GET", url: "/avatar" })).json()).toMatchObject({ used: 0, remaining: 5 });
    expect(readFileSync(file, "utf8")).not.toContain("avatar");
  });

  it("requires consent and does not keep the selfie or spend a generation without it", async () => {
    const file = tempFile();
    openStore(file);
    const a = app();
    const denied = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "false" }, { name: "selfie.png", type: "image/png", content: PNG_1X1 }),
    });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toEqual({ error: "consent is required" });

    const absent = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({}, { name: "selfie.png", type: "image/png", content: PNG_1X1 }),
    });
    expect(absent.statusCode).toBe(400);
    expect(absent.json()).toEqual({ error: "consent is required" });
    expect(storedUploads()).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf8")).avatar).toBeUndefined();
  });

  it("saves candidates, deletes the selfie, and returns the same pictures for the same photo", async () => {
    const file = tempFile();
    openStore(file);
    const seen: string[] = [];
    const recording: AvatarGenerator = {
      id: "mock",
      async generate(input) {
        seen.push(input.prompt);
        return new MockAvatarGenerator().generate(input);
      },
    };
    const a = app({ avatarGenerator: recording, avatarCandidateCount: 3, avatarDailyLimit: 5 });
    const first = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart(
        { consent: "yes", apiKey: "sk-should-not-matter", provider: "openai" },
        { name: "selfie.png", type: "image/png", content: PNG_1X1 },
      ),
    });
    expect(first.statusCode).toBe(201);
    const body = first.json();
    expect(body.provider).toBe("mock");
    expect(body.candidates).toHaveLength(3);
    expect(body).toMatchObject({ limit: 5, used: 1, remaining: 4 });
    expect(body.sourceUrl).toBeUndefined();
    expect(seen).toEqual([AVATAR_STYLE_PROMPT]);
    expect(JSON.stringify(body)).not.toContain("sk-");

    const names = storedUploads();
    expect(names).toHaveLength(3);
    const bytes = body.candidates.map((candidate: { url: string }) => {
      expect(candidate.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
      return readFileSync(path.join(defaultUploadsDir(), path.basename(candidate.url)));
    });
    expect(new Set(bytes.map((item: Buffer) => item.toString("base64"))).size).toBe(3);
    for (const item of bytes) expect(item.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    for (const name of names) {
      expect(readFileSync(path.join(defaultUploadsDir(), name)).equals(PNG_1X1)).toBe(false);
    }

    const again = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "selfie.png", type: "image/png", content: PNG_1X1 }),
    });
    expect(again.statusCode).toBe(201);
    const second = again.json().candidates as Array<{ url: string }>;
    for (let i = 0; i < 3; i++) {
      const left = await a.inject({ method: "GET", url: body.candidates[i].url });
      const right = await a.inject({ method: "GET", url: second[i]!.url });
      expect(left.rawPayload.equals(right.rawPayload)).toBe(true);
    }

    const other = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "other.png", type: "image/png", content: PNG_OTHER }),
    });
    const otherBytes = readFileSync(path.join(defaultUploadsDir(), path.basename(other.json().candidates[0].url)));
    expect(otherBytes.equals(bytes[0]!)).toBe(false);

    const jpeg = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart({ consent: "true" }, { name: "selfie.jpg", type: "image/jpeg", content: JPEG_1X1 }),
    });
    expect(jpeg.statusCode).toBe(201);
    expect(jpeg.json().candidates).toHaveLength(3);
  });

  it("keeps the original only when asked", async () => {
    const file = tempFile();
    openStore(file);
    const a = app({ avatarCandidateCount: 2 });
    const kept = await a.inject({
      method: "POST",
      url: "/avatar/generate",
      ...multipart(
        { consent: "true", keepOriginal: "true" },
        { name: "selfie.png", type: "image/png", content: PNG_1X1 },
      ),
    });
    expect(kept.statusCode).toBe(201);
    const sourceUrl = kept.json().sourceUrl as string;
    expect(sourceUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    const served = await a.inject({ method: "GET", url: sourceUrl });
    expect(served.rawPayload.equals(PNG_1X1)).toBe(true);
    expect(storedUploads()).toHaveLength(3);
  });

  it("stops at the daily limit and starts again on the next UTC day", async () => {
    const file = tempFile();
    openStore(file);
    const a = app({ avatarDailyLimit: 2, avatarCandidateCount: 2 });
    expect((await generate(a)).statusCode).toBe(201);
    expect((await generate(a)).statusCode).toBe(201);
    const blocked = await generate(a);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "daily avatar limit reached", limit: 2, used: 2 });
    expect(storedUploads()).toHaveLength(4);

    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.avatar.usage).toEqual({ day: "2026-11-13", count: 2 });

    openStore(null);
    resetStore(false);
    openStore(file);
    const reloaded = app({ avatarDailyLimit: 2, avatarCandidateCount: 2 });
    expect((await reloaded.inject({ method: "GET", url: "/avatar" })).json()).toMatchObject({
      provider: "mock",
      used: 2,
      remaining: 0,
      limit: 2,
    });
    expect((await generate(reloaded)).statusCode).toBe(429);

    setClockForTests(() => new Date("2026-11-14T00:30:00.000Z"));
    const nextDay = await generate(reloaded);
    expect(nextDay.statusCode).toBe(201);
    expect(nextDay.json()).toMatchObject({ used: 1, remaining: 1 });
    expect(JSON.parse(readFileSync(file, "utf8")).avatar.usage).toEqual({ day: "2026-11-14", count: 1 });
  });

  it("selects a candidate onto the player and keeps it across a restart", async () => {
    const file = tempFile();
    openStore(file);
    const a = app({ avatarCandidateCount: 2 });
    const created = await generate(a);
    const [first, second] = created.json().candidates as Array<{ id: string; url: string }>;
    const again = await generate(a);
    expect(again.statusCode).toBe(201);

    const missing = await a.inject({ method: "POST", url: "/avatar/select", payload: { candidateId: "nope" } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "candidate not found" });
    expect((await a.inject({ method: "POST", url: "/avatar/select", payload: {} })).statusCode).toBe(400);
    expect((await a.inject({
      method: "POST",
      url: "/avatar/select",
      payload: { candidateId: first!.id, avatarUrl: "https://evil.example/a.png" },
    })).statusCode).toBe(400);
    expect(getPlayer().avatarUrl).toBeUndefined();

    const selected = await a.inject({ method: "POST", url: "/avatar/select", payload: { candidateId: first!.id } });
    expect(selected.statusCode).toBe(200);
    expect(selected.json().avatarUrl).toBe(first!.url);
    expect(selected.json().id).toBe(getPlayer().id);
    expect(JSON.parse(readFileSync(file, "utf8")).player.avatarUrl).toBe(first!.url);

    const older = await a.inject({ method: "POST", url: "/avatar/select", payload: { candidateId: second!.id } });
    expect(older.statusCode).toBe(200);
    expect(older.json().avatarUrl).toBe(second!.url);

    openStore(null);
    resetStore(false);
    openStore(file);
    const b = app();
    const player = (await b.inject({ method: "GET", url: "/player" })).json();
    expect(player.avatarUrl).toBe(second!.url);
    const image = await b.inject({ method: "GET", url: second!.url });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("leaves no candidate, quota, or file behind when the save fails", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    const before = readFileSync(file, "utf8");
    const a = app({ avatarCandidateCount: 2 });

    setStoreWriterForTests(() => {
      throw new Error("simulated persist failure");
    });
    const failed = await generate(a);
    expect(failed.statusCode).toBe(500);
    expect(JSON.stringify(failed.json())).not.toContain("simulated");
    expect(getPlayer().avatarUrl).toBeUndefined();
    expect(storedUploads()).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(before);

    openStore(null);
    resetStore(false);
    openStore(file);
    expect(getPlayer().avatarUrl).toBeUndefined();
    expect(JSON.parse(readFileSync(file, "utf8")).avatar).toBeUndefined();

    setStoreWriterForTests(null);
    const retried = await generate(app({ avatarCandidateCount: 2 }));
    expect(retried.statusCode).toBe(201);
    const candidateId = retried.json().candidates[0].id as string;
    const candidateUrl = retried.json().candidates[0].url as string;
    const saved = readFileSync(file, "utf8");

    setStoreWriterForTests(() => {
      throw new Error("simulated persist failure");
    });
    const selectFailed = await app().inject({
      method: "POST",
      url: "/avatar/select",
      payload: { candidateId },
    });
    expect(selectFailed.statusCode).toBe(500);
    expect(getPlayer().avatarUrl).toBeUndefined();
    expect(readFileSync(file, "utf8")).toBe(saved);
    expect(existsSync(path.join(defaultUploadsDir(), path.basename(candidateUrl)))).toBe(true);

    setStoreWriterForTests(null);
    openStore(null);
    resetStore(false);
    openStore(file);
    const selected = await app().inject({
      method: "POST",
      url: "/avatar/select",
      payload: { candidateId },
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json().avatarUrl).toBe(candidateUrl);
  });

  it("reports a provider failure without saving files, spending quota, or leaking the cause", async () => {
    const file = tempFile();
    openStore(file);
    const failing: AvatarGenerator = {
      id: "mock",
      async generate() {
        throw new Error("upstream blew up sk-test-secret");
      },
    };
    const a = app({ avatarGenerator: failing });
    const failed = await generate(a);
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: "avatar provider failed" });
    expect(failed.body).not.toContain("sk-test-secret");
    expect(storedUploads()).toEqual([]);
    expect((await a.inject({ method: "GET", url: "/avatar" })).json()).toMatchObject({ used: 0, remaining: 5 });
  });
});

describe("avatar providers", () => {
  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    AVATAR_PROVIDER: process.env.AVATAR_PROVIDER,
  };

  afterEach(() => {
    restore("OPENAI_API_KEY", env.OPENAI_API_KEY);
    restore("XAI_API_KEY", env.XAI_API_KEY);
    restore("AVATAR_PROVIDER", env.AVATAR_PROVIDER);
  });

  it("uses the mock when no key is set, and does not call a provider just to choose one", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.AVATAR_PROVIDER;
    expect(avatarGeneratorFromEnv().id).toBe("mock");

    process.env.OPENAI_API_KEY = "sk-test-openai";
    expect(avatarGeneratorFromEnv().id).toBe("openai");

    delete process.env.OPENAI_API_KEY;
    process.env.XAI_API_KEY = "xai-test";
    expect(avatarGeneratorFromEnv().id).toBe("xai");

    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.AVATAR_PROVIDER = "mock";
    expect(avatarGeneratorFromEnv().id).toBe("mock");

    process.env.AVATAR_PROVIDER = "xai";
    expect(avatarGeneratorFromEnv().id).toBe("xai");

    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    process.env.AVATAR_PROVIDER = "openai";
    expect(avatarGeneratorFromEnv().id).toBe("mock");
  });

  it("sends the reference image and the shared prompt to OpenAI and keeps the key in the header", async () => {
    let seen: { url: string; auth: string; model: string; prompt: string; n: string; background: string; image: Buffer } | null = null;
    const fetchImpl: typeof fetch = async (url, init) => {
      const form = init?.body as FormData;
      const headers = init?.headers as { Authorization: string };
      const image = form.get("image") as Blob;
      seen = {
        url: String(url),
        auth: headers.Authorization,
        model: String(form.get("model")),
        prompt: String(form.get("prompt")),
        n: String(form.get("n")),
        background: String(form.get("background")),
        image: Buffer.from(await image.arrayBuffer()),
      };
      expect(init?.headers && "Content-Type" in (init.headers as object)).toBe(false);
      const payload = {
        data: [
          { b64_json: PNG_1X1.toString("base64") },
          { b64_json: PNG_1X1.toString("base64") },
        ],
      };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    };
    const generator = createOpenAIAvatarGenerator({ apiKey: "sk-test-openai", fetchImpl });
    const images = await generator.generate({
      photo: PNG_1X1,
      mediaType: "image/png",
      prompt: AVATAR_STYLE_PROMPT,
      count: 2,
    });
    expect(images).toHaveLength(2);
    expect(images[0]!.bytes.equals(PNG_1X1)).toBe(true);
    expect(seen).toMatchObject({
      url: "https://api.openai.com/v1/images/edits",
      auth: "Bearer sk-test-openai",
      model: DEFAULT_OPENAI_IMAGE_MODEL,
      prompt: AVATAR_STYLE_PROMPT,
      n: "2",
      background: "transparent",
    });
    expect(seen!.image.equals(PNG_1X1)).toBe(true);
  });

  it("sends the reference image as a data URL to xAI", async () => {
    let body: Record<string, unknown> | null = null;
    let auth = "";
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://api.x.ai/v1/images/edits");
      auth = (init?.headers as { Authorization: string }).Authorization;
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_1X1.toString("base64") }, { b64_json: PNG_1X1.toString("base64") }],
      }), { status: 200 });
    };
    const generator = createXaiAvatarGenerator({ apiKey: "xai-test-key", fetchImpl });
    const images = await generator.generate({
      photo: JPEG_1X1,
      mediaType: "image/jpeg",
      prompt: AVATAR_STYLE_PROMPT,
      count: 2,
    });
    expect(images).toHaveLength(2);
    expect(auth).toBe("Bearer xai-test-key");
    expect(body).toMatchObject({
      model: DEFAULT_XAI_IMAGE_MODEL,
      prompt: AVATAR_STYLE_PROMPT,
      n: 2,
      response_format: "b64_json",
      aspect_ratio: "2:3",
    });
    const image = body!.image as { url: string };
    expect(image.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(image.url).not.toContain("xai-test-key");
  });
});

function restore(name: "OPENAI_API_KEY" | "XAI_API_KEY" | "AVATAR_PROVIDER", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function storedUploads(): string[] {
  const dir = defaultUploadsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => !name.startsWith("."));
}

function generate(a: ReturnType<typeof buildApp>) {
  return a.inject({
    method: "POST",
    url: "/avatar/generate",
    ...multipart({ consent: "true" }, { name: "selfie.png", type: "image/png", content: PNG_1X1 }),
  });
}

function multipart(
  fields: Record<string, string>,
  file?: { name: string; type: string; content: Buffer },
): { payload: Buffer; headers: { "content-type": string } } {
  const boundary = "----levexpboundary";
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ));
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
    ));
    parts.push(file.content);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
