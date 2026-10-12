import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/authz";
import { notFound, parseJson, route } from "@/lib/http";
import { getRules } from "@/lib/cases";

export const GET = route(async () => {
  await requireUser();
  const rules = await getRules();
  return Response.json({ rules: rules.sort((a, b) => a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code)) });
});

const Patch = z.object({
  code: z.string().min(1),
  enabled: z.boolean().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

// Gate policy is data, not code: an admin can switch rules off or reweight them.
export const PATCH = route(async (req) => {
  const user = await requireUser();
  requireRole(user, "ADMIN");
  const { code, ...data } = await parseJson(req, Patch);
  const existing = await db.gateRule.findUnique({ where: { code } });
  if (!existing) throw notFound("Rule");
  const rule = await db.gateRule.update({ where: { code }, data });
  return Response.json({ rule });
});
