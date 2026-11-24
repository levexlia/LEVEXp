import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { currentDataFile } from "./store.js";

/** Matches the README cap. Larger bodies are rejected before they are stored. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = {
  png: ".png",
  jpeg: ".jpg",
  gif: ".gif",
  webp: ".webp",
} as const;

type ImageExtension = (typeof EXTENSIONS)[keyof typeof EXTENSIONS];

const MEDIA_TYPE: Record<ImageExtension, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Stored names are uuids we generate. Anything else is refused before touching the disk. */
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/i;

export class InvalidUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUpload";
  }
}

/**
 * Directory of bytes for `POST /uploads`.
 * Sits next to the JSON store so one `DATA_FILE` and its pictures move together.
 * Default `./data/levexp.json` → `./data/uploads`. No open file → `./data/uploads` from the process cwd.
 */
export function defaultUploadsDir(): string {
  const file = currentDataFile();
  const base = file ? path.dirname(path.resolve(file)) : path.resolve("data");
  return path.join(base, "uploads");
}

/** Write a validated image. The caller already enforced the size cap. */
export function saveImageUpload(dir: string, bytes: Buffer): { url: string; filename: string } {
  if (bytes.length === 0) throw new InvalidUpload("file is empty");
  const ext = imageExtension(bytes);
  if (!ext) throw new InvalidUpload("file must be a png, jpeg, gif, or webp image");
  const filename = `${randomUUID()}${ext}`;
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, filename);
  const tmp = path.join(dir, `.${filename}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, bytes, { flag: "wx" });
    renameSync(tmp, dest);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // The destination was not replaced.
    }
    throw err;
  }
  return { url: `/uploads/${filename}`, filename };
}

export function resolveUpload(
  dir: string,
  name: string,
): { filePath: string; mediaType: string } | "bad-name" | "missing" {
  if (!STORED_NAME.test(name)) return "bad-name";
  const root = path.resolve(dir);
  const filePath = path.resolve(root, name);
  if (path.dirname(filePath) !== root) return "bad-name";
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return "missing";
  const ext = path.extname(filePath).toLowerCase() as ImageExtension;
  const mediaType = MEDIA_TYPE[ext];
  if (!mediaType) return "bad-name";
  return { filePath, mediaType };
}

/** Deletes a file this process stored. A bad or missing name is a no-op. */
export function removeUpload(dir: string, name: string): void {
  const found = resolveUpload(dir, name);
  if (found === "bad-name" || found === "missing") return;
  unlinkSync(found.filePath);
}

/** Identify an image from its bytes. The multipart Content-Type is not trusted. */
export function imageExtension(bytes: Buffer): ImageExtension | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return EXTENSIONS.png;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return EXTENSIONS.jpeg;
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return EXTENSIONS.gif;
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return EXTENSIONS.webp;
  }
  return null;
}
