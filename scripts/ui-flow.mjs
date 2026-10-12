// End-to-end UI test: drives a real browser through the whole demo, as each
// role, by clicking the interface. Screenshots every step.
// Usage: npm run db:reset, start the app, then
//        node scripts/ui-flow.mjs [baseUrl] [shotsDir]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "shots/flow";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const problems = [];
let passed = 0;
let n = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    problems.push(`FAILED: ${name} ${extra}`);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function open(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, colorScheme: "light" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource.*(40[0-9]|409)/.test(m.text())) problems.push(`console ${page.url()}: ${m.text()}`);
  });
  page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  return { ctx, page };
}

async function snap(page, name, full = true) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: full });
}

async function signIn(page, who) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: new RegExp(who) }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

const db = new PrismaClient();
const acme = await db.case.findFirstOrThrow({ where: { title: { startsWith: "Acme" } } });
const initech = await db.case.findFirstOrThrow({ where: { title: { startsWith: "Initech" } } });

// ── Priya: refused, fixes, discloses, submits ──
console.log("\nPriya hands off Acme");
{
  const { ctx, page } = await open();
  await page.goto(`${BASE}/`);
  ok("signed-out visitor is sent to sign in", /\/login/.test(page.url()));
  await snap(page, "login", false);
  await signIn(page, "Priya Nair");
  ok("dashboard greets Priya", (await page.getByRole("heading", { level: 1 }).textContent())?.includes("Priya"));
  await snap(page, "dashboard");

  await page.locator("table").getByRole("link", { name: /Acme Corp/ }).click();
  await page.waitForURL(/\/cases\//);
  await page.getByText("Handoff readiness").waitFor();
  await snap(page, "case-overview");

  await page.getByRole("link", { name: "Hand off case" }).click();
  await page.getByLabel("Recipient").selectOption({ label: "Rahul Verma — Senior Support Engineer" });
  await page.getByLabel("Why is it changing hands?").fill("On medical leave from tomorrow for three weeks.");
  await snap(page, "handoff-recipient", false);
  await page.getByRole("button", { name: "Check readiness" }).click();
  await page.getByText(/Handoff refused/).waitFor();
  ok("gate opens at 58%", (await page.locator("svg[aria-label^='Handoff readiness']").getAttribute("aria-label"))?.includes("58"));
  ok("submit is locked", await page.getByRole("button", { name: /Submit handoff/ }).isDisabled());
  await snap(page, "gate-refused");

  // Fix 1: decision rationale, through the finding's link
  await page.getByRole("link", { name: /has no recorded rationale/ }).click();
  await page.waitForURL(/tab=decisions/);
  await page.getByLabel("Why was this decided?").fill("A full refund breaks the MSA's 60-day dispute window; 15% matches the premium delta.");
  await page.getByRole("button", { name: "Save rationale" }).click();
  await page.getByText(/blocker(s)? left/).waitFor();
  await snap(page, "fix-decision", false);

  // Fix 2: reassign in-progress work
  await page.getByRole("link", { name: "Back to handoff" }).click();
  await page.getByRole("link", { name: /still assigned to the outgoing owner/ }).click();
  await page.waitForURL(/tab=actions/);
  await page.getByLabel("Assignee").selectOption({ label: "Rahul Verma" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("1 blocker left").waitFor();

  // Fix 3: upload the invoice
  await page.getByRole("link", { name: "Back to handoff" }).click();
  await page.getByRole("link", { name: /require an invoice/ }).click();
  await page.waitForURL(/tab=documents/);
  await page.locator("input[type=file]").setInputFiles("demo-files/acme-invoice-INV-2291.pdf");
  await page.getByRole("button", { name: "Upload and fingerprint" }).click();
  await page.getByText("acme-invoice-INV-2291.pdf").first().waitFor();
  await snap(page, "fix-invoice");

  // Disclose the two warnings
  await page.getByRole("link", { name: "Back to handoff" }).click();
  await page.getByText(/warnings? to fix or disclose/).waitFor();
  for (const text of [
    // Cards are in rule order: overdue items first, then the deadline.
    "Finance sign-off and AP confirmation are both chased; Rahul has the contacts.",
    "Deadline is in five days; Rahul was briefed on the CFO's board date.",
  ]) {
    await page.getByRole("button", { name: "Waive with justification" }).first().click();
    await page.getByPlaceholder(/Why is it acceptable/).fill(text);
    await page.getByRole("button", { name: "Waive and disclose" }).click();
    await page.getByText(`“${text}”`).waitFor();
  }
  await page.getByText("Ready to hand off").waitFor();
  ok("gate reaches 100% after fixes and waivers", (await page.locator("svg[aria-label^='Handoff readiness']").getAttribute("aria-label"))?.includes("100"));
  await snap(page, "gate-ready");

  await page.getByRole("button", { name: /Submit handoff to Rahul/ }).click();
  await page.waitForURL(/\/handoffs\//);
  await page.getByText("Package intact").waitFor();
  await snap(page, "package-sender");

  // The case log stays open while the handoff is pending
  await page.goto(`${BASE}/cases/${acme.id}?tab=updates`);
  await page.getByRole("radio", { name: "Event" }).click();
  await page.getByPlaceholder(/CFO office moved/).fill("Acme's CFO moved the board meeting forward to the 16th.");
  await page.getByRole("button", { name: "Post to case log" }).click();
  await page.getByText("Acme's CFO moved the board meeting forward to the 16th.").waitFor();
  ok("Priya posts to the case log during the pending handoff", true);
  await snap(page, "case-log");

  await signOut(page);
  ok("sign out returns to sign in", /\/login/.test(page.url()));
  await ctx.close();
}

// ── Rahul: reviews the package and accepts ──
console.log("\nRahul accepts");
{
  const { ctx, page } = await open();
  await signIn(page, "Rahul Verma");
  await page.getByText(/is handing you/).click();
  await page.waitForURL(/\/handoffs\//);
  await page.getByText("Since this package was sent").waitFor();
  ok("receiver sees the event posted after submission", await page.getByText("Acme's CFO moved the board meeting forward to the 16th.").isVisible());
  ok("receiver sees the disclosed gaps", await page.getByText("Known gaps, disclosed by the sender").isVisible());
  await snap(page, "package-receiver");
  await page.getByRole("button", { name: "Accept responsibility" }).click();
  await snap(page, "accept-dialog", false);
  await page.getByRole("button", { name: "Accept and take ownership" }).click();
  await page.waitForURL(/\/cases\//);
  await page.getByText("Rahul Verma owns this case").waitFor();
  ok("ownership moved to Rahul", true);
  await page.getByRole("button", { name: /Notifications/ }).click();
  await snap(page, "notifications", false);
  await signOut(page);
  await ctx.close();
}

// ── Auditor: verifies, then catches tampering ──
console.log("\nAuditor verifies history");
{
  const { ctx, page } = await open();
  await signIn(page, "Meera Iyer");
  await page.goto(`${BASE}/cases/${acme.id}?tab=ownership`);
  await page.getByText("Who was responsible, when").waitFor();
  await snap(page, "ownership");
  await page.goto(`${BASE}/cases/${acme.id}?tab=activity`);
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await page.getByText(/Chain intact/).waitFor();
  await snap(page, "verify-intact", false);

  const row = await db.activityLog.findFirstOrThrow({ where: { caseId: acme.id, seq: 5 } });
  await db.activityLog.update({ where: { id: row.id }, data: { payloadJson: JSON.stringify({ title: "Refund approved in full" }) } });
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await page.getByText(/Tampering detected at entry #5/).waitFor();
  ok("auditor catches an edited history row", true);
  await snap(page, "verify-tampered", false);
  await page.goto(`${BASE}/security`);
  await page.getByText(/Tampering detected in 1 case/).waitFor();
  ok("security page flags the tampered case", true);
  await snap(page, "security-tampered");
  await db.activityLog.update({ where: { id: row.id }, data: { payloadJson: row.payloadJson } });
  ok("auditor cannot see a New case button", (await page.getByRole("link", { name: "New case" }).count()) === 0);
  await signOut(page);
  await ctx.close();
}

// ── Manager: bypasses the gate, which is recorded ──
console.log("\nManager reassigns");
{
  const { ctx, page } = await open();
  await signIn(page, "Anjali Desai");
  await page.goto(`${BASE}/cases/${initech.id}`);
  await page.getByRole("button", { name: "Reassign" }).click();
  await page.getByLabel("New owner").selectOption({ label: "Rahul Verma" });
  await page.getByLabel("Why the gate is being skipped").fill("Kabir is unreachable on emergency leave this week.");
  await snap(page, "reassign-dialog", false);
  await page.getByRole("button", { name: "Reassign and record bypass" }).click();
  await page.getByText("Rahul Verma owns this case").waitFor();
  await page.goto(`${BASE}/security`);
  await page.getByText("Kabir is unreachable", { exact: false }).waitFor();
  ok("bypass appears on the security page", true);
  await snap(page, "security-bypass");

  await page.goto(`${BASE}/cases/new`);
  await page.getByLabel("Title").fill("Stark Industries — onboarding escalation");
  await page.getByLabel("Summary").fill("Stark's onboarding stalled on SSO; their CIO escalated to our VP. Two integration tickets are open and the go-live date is at risk.");
  await page.getByLabel("Type").selectOption("CUSTOMER_ESCALATION");
  await page.getByRole("button", { name: "Create case" }).click();
  await page.waitForURL(/\/cases\/(?!new)/);
  await page.getByText("Stark Industries — onboarding escalation").first().waitFor();
  ok("manager creates a new case", true);
  await snap(page, "new-case");
  await signOut(page);
  await ctx.close();
}

// ── Admin: gate policy ──
console.log("\nAdmin edits policy");
{
  const { ctx, page } = await open();
  await signIn(page, "Relay Admin");
  await page.goto(`${BASE}/admin/rules`);
  const toggle = page.getByRole("switch", { name: /Fewer than 3 context items/ });
  await toggle.click();
  await page.waitForTimeout(300);
  ok("admin can switch a rule off", (await toggle.getAttribute("aria-checked")) === "false");
  await snap(page, "gate-policy");
  await toggle.click();
  await signOut(page);
  await ctx.close();
}

// ── Phone ──
console.log("\nPhone");
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await page.goto(`${BASE}/login`);
  await snap(page, "phone-login");
  await signIn(page, "Priya Nair");
  await snap(page, "phone-dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await snap(page, "phone-menu", false);
  await ctx.close();
}

await db.$disconnect();
await browser.close();
console.log(`\n${passed} checks passed, ${problems.length} problems.`);
if (problems.length) console.log(problems.slice(0, 30).join("\n"));
process.exit(problems.length ? 1 : 0);
