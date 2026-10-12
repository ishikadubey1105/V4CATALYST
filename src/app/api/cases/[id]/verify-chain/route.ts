import { authorizeCase, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";
import { verifyChain } from "@/lib/audit";

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const report = await verifyChain(id);
  return Response.json({ ...report, verifiedAt: new Date().toISOString() });
});
