// Screenshots of every main screen for visual review.
// Usage: node scripts/ui-shots.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "shots";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function session(email, viewport = { width: 1440, height: 900 }, scheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${email} console: ${m.text()}`));
  if (email) {
    const r = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password: "relay-demo" } });
    if (!r.ok()) throw new Error(`login ${email} ${r.status()}`);
  }
  return { ctx, page };
}

async function shot(page, path, name, { full = true, wait = 900 } = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`shot ${name}`);
}

const only = process.env.ONLY?.split(",");
const want = (n) => !only || only.includes(n);

{
  const { ctx, page } = await session(null);
  if (want("login")) await shot(page, "/login", "01-login", { full: false });
  await ctx.close();
}
{
  const { ctx, page } = await session("priya@relay.demo");
  if (want("dash")) await shot(page, "/", "02-dashboard");
  const cases = await (await page.request.get(`${BASE}/api/cases`)).json();
  const acme = cases.cases.find((c) => c.title.startsWith("Acme"));
  if (want("case")) await shot(page, `/cases/${acme.id}`, "03-case-overview");
  if (want("updates")) await shot(page, `/cases/${acme.id}?tab=updates`, "04-case-updates");
  if (want("actions")) await shot(page, `/cases/${acme.id}?tab=actions`, "05-case-actions");
  if (want("activity")) await shot(page, `/cases/${acme.id}?tab=activity`, "06-case-activity");
  if (want("handoff")) await shot(page, `/cases/${acme.id}/handoff`, "07-handoff-start");
  if (want("security")) await shot(page, "/security", "08-security");
  await ctx.close();
}
{
  const { ctx, page } = await session("anjali@relay.demo", { width: 390, height: 844 });
  if (want("mobile")) await shot(page, "/", "09-dashboard-mobile");
  await ctx.close();
}
{
  const { ctx, page } = await session("priya@relay.demo", { width: 1440, height: 900 }, "dark");
  if (want("dark")) await shot(page, "/", "10-dashboard-dark", { full: false });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `\n${errors.length} browser errors:\n${errors.slice(0, 20).join("\n")}` : "\nno browser errors");
