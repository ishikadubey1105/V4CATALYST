import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_GATE_RULES } from "./domain";
import { evaluate, type Readiness } from "./gate";
import { canonicalJson, sha256 } from "./canon";

export async function getRules() {
  const rows = await db.gateRule.findMany();
  if (rows.length >= DEFAULT_GATE_RULES.length) return rows;
  // First run on a fresh database: install the default policy.
  await db.$transaction(
    DEFAULT_GATE_RULES.map((r) =>
      db.gateRule.upsert({ where: { code: r.code }, create: { ...r, enabled: true }, update: {} }),
    ),
  );
  return db.gateRule.findMany();
}

const caseInclude = {
  contextItems: { orderBy: { createdAt: "desc" } },
  decisions: { orderBy: { decidedAt: "desc" } },
  actions: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
  documents: { orderBy: { uploadedAt: "desc" } },
} satisfies Prisma.CaseInclude;

export async function loadCaseFull(caseId: string) {
  return db.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      ...caseInclude,
      currentOwner: { select: { id: true, name: true, title: true, team: true } },
      createdBy: { select: { id: true, name: true } },
      handoffs: { orderBy: { initiatedAt: "desc" } },
      updates: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] },
    },
  });
}

export type CaseFull = Awaited<ReturnType<typeof loadCaseFull>>;

export async function readinessFor(
  caseId: string,
  recipientId: string | null,
  waived: string[] = [],
): Promise<Readiness> {
  const [c, rules] = await Promise.all([
    db.case.findUniqueOrThrow({ where: { id: caseId }, include: caseInclude }),
    getRules(),
  ]);
  return evaluate(c, rules, recipientId, waived);
}

export type Waiver = { code: string; justification: string; userId: string; at: string };

export function parseWaivers(json: string): Waiver[] {
  try {
    return JSON.parse(json) as Waiver[];
  } catch {
    return [];
  }
}

// The context package the receiver acknowledges. Frozen at submission and
// hashed, so what was handed over can be proven later.
export function buildSnapshot(
  c: CaseFull,
  readiness: Readiness,
  waivers: Waiver[],
  names: Record<string, string>,
  meta: { fromUserId: string; toUserId: string; reason: string; submittedAt: Date },
) {
  const name = (id: string | null | undefined) => (id ? (names[id] ?? id) : null);
  const snapshot = {
    version: 1,
    handoff: { from: name(meta.fromUserId), to: name(meta.toUserId), reason: meta.reason, submittedAt: meta.submittedAt },
    case: {
      id: c.id,
      title: c.title,
      summary: c.summary,
      caseType: c.caseType,
      priority: c.priority,
      deadline: c.deadline,
      createdAt: c.createdAt,
    },
    context: c.contextItems.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      body: i.body,
      resolution: i.resolution,
      author: name(i.authorId),
      createdAt: i.createdAt,
    })),
    decisions: c.decisions.map((d) => ({
      id: d.id,
      title: d.title,
      rationale: d.rationale,
      decidedBy: name(d.decidedById),
      decidedAt: d.decidedAt,
      supersedesId: d.supersedesId,
    })),
    actions: c.actions.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      assignee: name(a.assigneeId),
      dueDate: a.dueDate,
      blockedReason: a.blockedReason,
      note: a.note,
    })),
    documents: c.documents.map((d) => ({ id: d.id, filename: d.filename, docClass: d.docClass, sha256: d.sha256 })),
    updates: c.updates.slice(0, 20).map((u) => ({
      id: u.id,
      kind: u.kind,
      body: u.body,
      author: name(u.authorId),
      occurredAt: u.occurredAt,
    })),
    readiness: {
      score: readiness.score,
      warnings: readiness.warnings.map((w) => ({ code: w.code, message: w.message, waived: w.waived })),
    },
    waivers: waivers.map((w) => ({ code: w.code, justification: w.justification, by: name(w.userId), at: w.at })),
  };
  const json = canonicalJson(snapshot);
  return { json, hash: sha256(json) };
}

export async function userNames(): Promise<Record<string, string>> {
  const users = await db.user.findMany({ select: { id: true, name: true } });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}
