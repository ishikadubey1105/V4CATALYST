import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

// Deterministic JSON: keys sorted at every depth, undefined normalised to null,
// Dates rendered as UTC ISO strings. The writer and the verifier must both use
// this exact function, or honest data fails verification.
export function sortKeysDeep(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export type ChainEntry = {
  seq: number;
  caseId: string;
  actorId: string;
  verb: string;
  targetType: string;
  targetId: string | null;
  payloadJson: string;
  createdAt: Date;
};

export function canonEntry(e: ChainEntry): string {
  return canonicalJson({
    seq: e.seq,
    caseId: e.caseId,
    actorId: e.actorId,
    verb: e.verb,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    payload: JSON.parse(e.payloadJson),
    createdAt: e.createdAt.toISOString(),
  });
}

export function chainHash(prevHash: string, e: ChainEntry): string {
  return sha256(prevHash + "|" + canonEntry(e));
}

export type StoredEntry = ChainEntry & { prevHash: string; hash: string };

export type ChainReport =
  | { ok: true; entriesChecked: number; headHash: string }
  | {
      ok: false;
      entriesChecked: number;
      brokenAtSeq: number;
      reason: "HASH_MISMATCH" | "LINK_MISMATCH" | "SEQ_GAP" | "HEAD_MISMATCH";
      expectedHash: string;
      foundHash: string;
    };

// Walks entries in seq order and recomputes every link from genesis.
export function verifyEntries(entries: StoredEntry[]): ChainReport {
  let prev = GENESIS_HASH;
  let n = 0;
  for (const e of entries) {
    n++;
    if (e.seq !== n) {
      return { ok: false, entriesChecked: n, brokenAtSeq: n, reason: "SEQ_GAP", expectedHash: `seq ${n}`, foundHash: `seq ${e.seq}` };
    }
    if (e.prevHash !== prev) {
      return { ok: false, entriesChecked: n, brokenAtSeq: e.seq, reason: "LINK_MISMATCH", expectedHash: prev, foundHash: e.prevHash };
    }
    const expected = chainHash(prev, e);
    if (expected !== e.hash) {
      return { ok: false, entriesChecked: n, brokenAtSeq: e.seq, reason: "HASH_MISMATCH", expectedHash: expected, foundHash: e.hash };
    }
    prev = e.hash;
  }
  return { ok: true, entriesChecked: entries.length, headHash: prev };
}
