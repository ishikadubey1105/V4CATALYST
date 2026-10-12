import { describe, expect, it } from "vitest";
import { canonicalJson, chainHash, GENESIS_HASH, verifyEntries, type StoredEntry } from "./canon";

function buildChain(n: number): StoredEntry[] {
  const out: StoredEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const e = {
      seq: i,
      caseId: "case1",
      actorId: "u1",
      verb: "test.event",
      targetType: "Case",
      targetId: null,
      payloadJson: canonicalJson({ i, nested: { b: 2, a: 1 } }),
      createdAt: new Date(Date.UTC(2026, 9, 1, 10, i, 0, 123)),
    };
    const hash = chainHash(prev, e);
    out.push({ ...e, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

describe("canonicalJson", () => {
  it("is independent of key order and normalises undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: null }, b: 1 }));
  });
  it("renders dates as UTC ISO strings", () => {
    expect(canonicalJson({ t: new Date(Date.UTC(2026, 0, 2)) })).toBe('{"t":"2026-01-02T00:00:00.000Z"}');
  });
});

describe("verifyEntries", () => {
  it("accepts an honest chain", () => {
    const r = verifyEntries(buildChain(5));
    expect(r.ok).toBe(true);
    expect(r.entriesChecked).toBe(5);
  });

  it("names the entry whose payload was edited", () => {
    const chain = buildChain(5);
    chain[2] = { ...chain[2], payloadJson: canonicalJson({ i: 999 }) };
    const r = verifyEntries(chain);
    expect(r).toMatchObject({ ok: false, brokenAtSeq: 3, reason: "HASH_MISMATCH" });
  });

  it("catches an edited entry whose hash was recomputed but whose successor was not", () => {
    const chain = buildChain(5);
    const forged = { ...chain[1], payloadJson: canonicalJson({ forged: true }) };
    forged.hash = chainHash(forged.prevHash, forged);
    chain[1] = forged;
    const r = verifyEntries(chain);
    expect(r).toMatchObject({ ok: false, brokenAtSeq: 3, reason: "LINK_MISMATCH" });
  });

  it("catches a deleted middle entry", () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    expect(verifyEntries(chain)).toMatchObject({ ok: false, reason: "SEQ_GAP" });
  });
});
