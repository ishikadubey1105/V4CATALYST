import { authorizeCase, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";
import { readinessFor } from "@/lib/cases";

export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const recipientId = new URL(req.url).searchParams.get("recipientId");
  return Response.json({ readiness: await readinessFor(id, recipientId) });
});
