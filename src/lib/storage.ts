import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Local-disk storage for development. On Vercel the filesystem is read-only;
// swap these two functions for Vercel Blob (put / get) when deploying.

const ROOT = path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
]);

// The browser-supplied MIME type is attacker-controlled; check the bytes match it.
const startsWith = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function contentMatchesType(bytes: Buffer, mime: string): boolean {
  switch (mime) {
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(bytes, ZIP);
    case "application/msword":
    case "application/vnd.ms-excel":
      return startsWith(bytes, OLE);
    case "text/plain":
    case "text/csv":
      // Text must not contain NUL bytes; binaries almost always do.
      return !bytes.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}

export async function saveFile(bytes: Buffer, filename: string): Promise<string> {
  await mkdir(ROOT, { recursive: true });
  // Randomised key: the stored name never comes from user input.
  const ext = path.extname(filename).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 10);
  const key = `${Date.now()}-${randomBytes(12).toString("hex")}${ext}`;
  await writeFile(path.join(ROOT, key), bytes);
  return key;
}

export async function readStored(key: string): Promise<Buffer> {
  if (!/^[\w.-]+$/.test(key)) throw new Error("bad storage key");
  return readFile(path.join(ROOT, key));
}
