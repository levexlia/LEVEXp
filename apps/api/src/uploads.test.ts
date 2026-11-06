import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { openStore, resetStore } from "./store.js";
import { defaultUploadsDir } from "./uploads.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("photo upload", () => {
  const temps: string[] = [];

  beforeEach(() => {
    openStore(null);
    resetStore(false);
  });

  afterEach(() => {
    openStore(null);
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempFile(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "levexp-upload-"));
    temps.push(dir);
    return path.join(dir, "levexp.json");
  }

  it("stores a png beside the data file, serves it, and keeps it across a reload", async () => {
    const file = tempFile();
    openStore(file);
    resetStore(false);
    expect(defaultUploadsDir()).toBe(path.join(path.dirname(path.resolve(file)), "uploads"));

    const a = buildApp({ logger: false });
    const posted = await a.inject({
      method: "POST",
      url: "/uploads",
      ...multipart("window.png", "image/png", PNG_1X1),
    });
    expect(posted.statusCode).toBe(201);
    const url = posted.json().url as string;
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);

    const saved = readdirSync(defaultUploadsDir());
    expect(saved).toEqual([path.basename(url)]);
    expect(readFileSync(path.join(defaultUploadsDir(), saved[0]!)).equals(PNG_1X1)).toBe(true);

    const served = await a.inject({ method: "GET", url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.rawPayload.equals(PNG_1X1)).toBe(true);

    const goal = (await a.inject({
      method: "POST",
      url: "/goals",
      payload: { title: "Sketch the window", sphere: "creativity" },
    })).json();
    const artifact = await a.inject({
      method: "POST",
      url: "/artifacts",
      payload: { title: "Morning light", kind: "photo", imageUrl: url, goalId: goal.id },
    });
    expect(artifact.statusCode).toBe(201);
    await a.inject({ method: "POST", url: `/goals/${goal.id}/complete` });

    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).toContain(url);
    expect(onDisk).not.toContain(PNG_1X1.toString("base64"));

    openStore(null);
    resetStore(false);
    openStore(file);
    const b = buildApp({ logger: false });
    const room = (await b.inject({ method: "GET", url: "/room" })).json();
    expect(room.placements).toHaveLength(1);
    expect(room.placements[0].artifact.imageUrl).toBe(url);
    expect((await b.inject({ method: "GET", url: "/progress" })).json()).toEqual({
      xp: 15,
      level: 1,
      xpBySphere: { creativity: 15 },
    });
    const again = await b.inject({ method: "GET", url });
    expect(again.statusCode).toBe(200);
    expect(again.rawPayload.equals(PNG_1X1)).toBe(true);
  });

  it("rejects a non-image, a json body, a bad name, and a missing file", async () => {
    const file = tempFile();
    openStore(file);
    const a = buildApp({ logger: false });

    const text = await a.inject({
      method: "POST",
      url: "/uploads",
      ...multipart("note.txt", "text/plain", Buffer.from("hello")),
    });
    expect(text.statusCode).toBe(400);
    expect(text.json()).toEqual({ error: "file must be a png, jpeg, gif, or webp image" });
    expect(storedUploads()).toEqual([]);

    const json = await a.inject({
      method: "POST",
      url: "/uploads",
      payload: { file: "nope" },
      headers: { "content-type": "application/json" },
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().error).toMatch(/multipart/);

    expect((await a.inject({ method: "GET", url: "/uploads/not-a-uuid.png" })).statusCode).toBe(400);
    expect((await a.inject({
      method: "GET",
      url: "/uploads/..%2f..%2fpackage.json",
    })).statusCode).toBe(400);
    const missing = await a.inject({
      method: "GET",
      url: "/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "upload not found" });
  });

  it("rejects a file over the limit and does not keep the bytes", async () => {
    const file = tempFile();
    openStore(file);
    const a = buildApp({ logger: false, maxUploadBytes: 32 });
    const posted = await a.inject({
      method: "POST",
      url: "/uploads",
      ...multipart("big.png", "image/png", PNG_1X1),
    });
    expect(posted.statusCode).toBe(400);
    expect(posted.json()).toEqual({ error: "file is too large" });
    expect(storedUploads()).toEqual([]);
  });
});

function storedUploads(): string[] {
  const dir = defaultUploadsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => !name.startsWith("."));
}

function multipart(filename: string, type: string, content: Buffer): { payload: Buffer; headers: { "content-type": string } } {
  const boundary = "----levexpboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
