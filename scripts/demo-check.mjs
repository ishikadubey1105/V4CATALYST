// End-to-end rehearsal of the demo against a running server, through the real API.
// Usage: npm run db:reset && npm run start   (then, in another terminal)
//        node scripts/demo-check.mjs [baseUrl]
// Mutates the database: run `npm run db:reset` afterwards to restore the demo state.

import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function client() {
  let cookie = "";
  return async function call(method, path, body, isForm = false) {
    const headers = { cookie };
    if (body && !isForm) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const json = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    return { status: res.status, json };
  };
}

async function login(email) {
  const c = client();
  const r = await c("POST", "/api/auth/login", { email, password: "relay-demo" });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
  return c;
}

const priya = await login("priya@relay.demo");
const rahul = await login("rahul@relay.demo");
const auditor = await login("auditor@relay.demo");
const anon = client();

console.log("\nAccess control");
check("anonymous API call is 401", (await anon("GET", "/api/cases")).status === 401);
check("wrong password is 401", (await client()("POST", "/api/auth/login", { email: "priya@relay.demo", password: "nope" })).status === 401);
check("auditor cannot create a case", (await auditor("POST", "/api/cases", { title: "x", caseType: "GENERAL" })).status === 403);

const list = await priya("GET", "/api/cases");
const acme = list.json.cases.find((c) => c.title.startsWith("Acme"));
check("Priya sees the Acme case", Boolean(acme));
const caseId = acme.id;
check("rahul cannot edit Priya's case", [403, 404].includes((await rahul("PATCH", `/api/cases/${caseId}`, { summary: "hijack" })).status));

console.log("\nReadiness gate");
const users = (await priya("GET", "/api/users")).json.users;
const rahulId = users.find((u) => u.name === "Rahul Verma").id;
const start = await priya("POST", `/api/cases/${caseId}/handoffs`, { toUserId: rahulId, reason: "On medical leave from tomorrow for three weeks." });
check("handoff draft created", start.status === 201, JSON.stringify(start.json));
const handoffId = start.json.handoff.id;
let h = (await priya("GET", `/api/handoffs/${handoffId}`)).json;
check("gate opens at 58%", h.readiness.score === 58, `got ${h.readiness.score}`);
check("3 blocker rules", new Set(h.readiness.blockers.map((b) => b.code)).size === 3);
check("2 warning rules", new Set(h.readiness.warnings.map((w) => w.code)).size === 2);

let sub = await priya("POST", `/api/handoffs/${handoffId}/submit`);
check("submit refused with standing blockers (409)", sub.status === 409 && sub.json.error.code === "BLOCKERS_STANDING");

const full = (await priya("GET", `/api/cases/${caseId}`)).json.case;
const bareDecision = full.decisions.find((d) => !d.rationale);
check(
  "fix 1: add the missing rationale",
  (await priya("PATCH", `/api/decisions/${bareDecision.id}`, { rationale: "A full refund breaks the MSA's 60-day dispute window; 15% matches the July-September premium delta." })).status === 200,
);
const held = full.actions.find((a) => a.status === "IN_PROGRESS");
check("fix 2: reassign in-progress work to Rahul", (await priya("PATCH", `/api/actions/${held.id}`, { assigneeId: rahulId })).status === 200);
const fd = new FormData();
fd.append("file", new Blob([await readFile("demo-files/acme-invoice-INV-2291.pdf")], { type: "application/pdf" }), "acme-invoice-INV-2291.pdf");
fd.append("docClass", "INVOICE");
check("fix 3: upload the invoice", (await priya("POST", `/api/cases/${caseId}/documents`, fd, true)).status === 201);

h = (await priya("GET", `/api/handoffs/${handoffId}`)).json;
check("no blockers left", h.readiness.blockers.length === 0);
sub = await priya("POST", `/api/handoffs/${handoffId}/submit`);
check("submit refused while warnings are unaddressed", sub.status === 409 && sub.json.error.code === "WARNINGS_UNADDRESSED");
check("blockers cannot be waived", (await priya("POST", `/api/handoffs/${handoffId}/waive`, { code: "NO_SUMMARY", justification: "trying to waive a blocker rule" })).status === 400);
check("short waiver justification refused", (await priya("POST", `/api/handoffs/${handoffId}/waive`, { code: "DEADLINE_SOON", justification: "too short" })).status === 400);
for (const [code, justification] of [
  ["DEADLINE_SOON", "Deadline is in five days; Rahul was briefed verbally on the CFO's board date."],
  ["OVERDUE_ITEMS", "Finance sign-off and AP confirmation are both chased; Rahul has the contacts."],
]) {
  check(`waive ${code}`, (await priya("POST", `/api/handoffs/${handoffId}/waive`, { code, justification })).status === 200);
}
sub = await priya("POST", `/api/handoffs/${handoffId}/submit`);
check("submit accepted", sub.status === 200, JSON.stringify(sub.json));
check("case locked for edits while pending", (await priya("PATCH", `/api/cases/${caseId}`, { summary: "x".repeat(130) })).status === 403);

console.log("\nCase log during a handoff");
check(
  "Priya can still post an event while the handoff is pending",
  (await priya("POST", `/api/cases/${caseId}/updates`, { kind: "EVENT", body: "Acme's CFO moved the board meeting forward to the 16th." })).status === 201,
);
check(
  "auditor can post to the case log",
  (await auditor("POST", `/api/cases/${caseId}/updates`, { kind: "UPDATE", body: "Compliance noted: credit above INR 2L needs controller countersign." })).status === 201,
);
check("auditor still cannot edit case contents", (await auditor("PATCH", `/api/cases/${caseId}`, { summary: "x".repeat(130) })).status === 403);
check("auditor can read the case log", ((await auditor("GET", `/api/cases/${caseId}/updates`)).json?.updates?.length ?? 0) >= 6);

console.log("\nAcknowledgement");
const notes = (await rahul("GET", "/api/notifications")).json;
check("Rahul is notified", notes.items.some((n) => n.kind === "handoff.received" && n.handoffId === handoffId));
const pkg = (await rahul("GET", `/api/handoffs/${handoffId}`)).json;
check("package hash intact", pkg.snapshotIntact === true);
check("package discloses both waivers", pkg.snapshot.waivers.length === 2);
check("package carries the case log", (pkg.snapshot.updates?.length ?? 0) >= 5);
check("Rahul sees both entries posted after submission", pkg.updatesSince.length === 2);
check("Rahul was notified of that event", notes.items.some((n) => n.kind === "case.update"));
check("Priya cannot accept her own handoff", (await priya("POST", `/api/handoffs/${handoffId}/accept`, { snapshotHash: pkg.handoff.snapshotHash })).status === 403);
check("stale package hash refused", (await rahul("POST", `/api/handoffs/${handoffId}/accept`, { snapshotHash: "0".repeat(64) })).status === 409);
check("Rahul accepts", (await rahul("POST", `/api/handoffs/${handoffId}/accept`, { snapshotHash: pkg.handoff.snapshotHash, note: "Reviewed. Taking it." })).status === 200);
const after = (await rahul("GET", `/api/cases/${caseId}`)).json.case;
check("ownership transferred to Rahul", after.currentOwnerId === rahulId && after.status === "ACTIVE");
const ledger = (await auditor("GET", `/api/cases/${caseId}/ownership`)).json;
check("auditor sees two ownership periods", ledger.periods.length === 2);

console.log("\nTamper evidence");
let v = (await auditor("GET", `/api/cases/${caseId}/verify-chain`)).json;
check(`chain verifies clean (${v.entriesChecked} entries)`, v.ok === true);
const db = new PrismaClient();
const target = await db.activityLog.findFirst({ where: { caseId, seq: 5 } });
const original = target.payloadJson;
await db.activityLog.update({ where: { id: target.id }, data: { payloadJson: JSON.stringify({ title: "Quietly rewritten" }) } });
v = (await auditor("GET", `/api/cases/${caseId}/verify-chain`)).json;
check("edited entry #5 is detected", v.ok === false && v.brokenAtSeq === 5, JSON.stringify(v));
await db.activityLog.update({ where: { id: target.id }, data: { payloadJson: original } });
const last = await db.activityLog.findFirst({ where: { caseId }, orderBy: { seq: "desc" } });
await db.activityLog.delete({ where: { id: last.id } });
v = (await auditor("GET", `/api/cases/${caseId}/verify-chain`)).json;
check("deleted newest entry is detected", v.ok === false && v.reason === "HEAD_MISMATCH", JSON.stringify(v));
await db.$disconnect();

console.log("\nAttack resistance");
{
  // Lockout: five wrong passwords lock the account; the right one is then refused too.
  const kabir = client();
  for (let i = 0; i < 5; i++) await kabir("POST", "/api/auth/login", { email: "kabir@relay.demo", password: `wrong-${i}` });
  const locked = await kabir("POST", "/api/auth/login", { email: "kabir@relay.demo", password: "relay-demo" });
  check("account locks after 5 failed sign-ins (423)", locked.status === 423, `got ${locked.status}`);
  const lockDb = new PrismaClient();
  await lockDb.user.update({ where: { email: "kabir@relay.demo" }, data: { lockedUntil: null, failedLogins: 0 } });
  await lockDb.$disconnect();

  // Revocation: a copied cookie dies when its owner signs out.
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "anjali@relay.demo", password: "relay-demo" }),
  });
  const stolen = login.headers.get("set-cookie").split(";")[0];
  const meBefore = await fetch(BASE + "/api/me", { headers: { cookie: stolen } });
  await fetch(BASE + "/api/auth/logout", { method: "POST", headers: { cookie: stolen } });
  const meAfter = await fetch(BASE + "/api/me", { headers: { cookie: stolen } });
  check("signing out revokes a copied session cookie", meBefore.status === 200 && meAfter.status === 401, `${meBefore.status} → ${meAfter.status}`);

  // Cross-site: a state-changing request from another origin is refused.
  const csrf = await fetch(BASE + "/api/notifications/read-all", { method: "POST", headers: { cookie: stolen, origin: "https://evil.example" } });
  check("cross-site POST is refused (403)", csrf.status === 403);

  // Upload: a text file disguised as a PDF is refused.
  const relogin = await login_("priya@relay.demo");
  const nw = (await relogin("GET", "/api/cases")).json.cases.find((c) => c.title.startsWith("Northwind"));
  const fake = new FormData();
  fake.append("file", new Blob(["MZ this is not a pdf"], { type: "application/pdf" }), "invoice.pdf");
  fake.append("docClass", "OTHER");
  check("disguised upload is refused", (await relogin("POST", `/api/cases/${nw.id}/documents`, fake, true)).status === 400);

  // Headers
  const page = await fetch(BASE + "/login");
  check("Content-Security-Policy is set", (page.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  check("framing is denied", page.headers.get("x-frame-options") === "DENY");
  check("server header does not advertise the framework", !page.headers.get("x-powered-by"));

  // Pages need a session (the redirect target itself is unit-tested in paths.test.ts)
  const redirect = await fetch(BASE + "/cases/x", { redirect: "manual" });
  check("signed-out page redirects to sign-in", redirect.status === 307 && redirect.headers.get("location").includes("/login"));
}

async function login_(email) {
  return login(email);
}

console.log(`\n${passed} passed, ${failed} failed. Run \`npm run db:reset\` to restore the demo state.\n`);
process.exit(failed ? 1 : 0);
