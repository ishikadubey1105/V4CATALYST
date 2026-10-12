import { db } from "@/lib/db";
import { canViewCase, requireUser } from "@/lib/authz";
import { HttpError, notFound, route } from "@/lib/http";
import { sha256 } from "@/lib/canon";
import { readStored } from "@/lib/storage";

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id }, include: { case: true } });
  if (!doc || !(await canViewCase(user, doc.case))) throw notFound("Document");

  const bytes = await readStored(doc.storageKey).catch(() => null);
  if (!bytes) throw new HttpError(410, "FILE_MISSING", "The stored file is no longer available.");
  // Re-verify integrity on every download.
  if (sha256(bytes) !== doc.sha256) {
    throw new HttpError(409, "INTEGRITY_FAILURE", "The stored file no longer matches the hash recorded at upload.");
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.filename)}"`,
      "X-Content-SHA256": doc.sha256,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
