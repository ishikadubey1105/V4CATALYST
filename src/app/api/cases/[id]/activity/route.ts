import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const entries = await db.activityLog.findMany({ where: { caseId: id }, orderBy: { seq: "desc" } });
  return Response.json({
    entries: entries.map((e) => ({ ...e, payload: JSON.parse(e.payloadJson), payloadJson: undefined })),
  });
});
