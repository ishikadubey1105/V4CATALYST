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
