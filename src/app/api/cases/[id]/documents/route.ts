import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { badRequest, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { sha256 } from "@/lib/canon";
import { DOC_CLASSES } from "@/lib/domain";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, saveFile } from "@/lib/storage";

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "edit");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const docClass = String(form?.get("docClass") ?? "OTHER");
  if (!(file instanceof File)) throw badRequest("Attach a file.");
  if (!DOC_CLASSES.includes(docClass as (typeof DOC_CLASSES)[number])) throw badRequest("Unknown document class.");
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files are limited to 10 MB.");
  if (!ALLOWED_MIME.has(file.type)) throw badRequest(`File type ${file.type || "unknown"} is not allowed.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Hashed at receipt: proves later that the receiver got the same bytes.
  const digest = sha256(bytes);
  const storageKey = await saveFile(bytes, file.name);
  const filename = file.name.replace(/[\\/\0]/g, "_").slice(0, 200);

  const doc = await db.$transaction(async (tx) => {
    const d = await tx.document.create({
      data: {
        caseId: id,
        filename,
        docClass,
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey,
        sha256: digest,
        uploadedById: user.id,
        uploadedAt: new Date(),
      },
    });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "document.attached",
      targetType: "Document",
      targetId: d.id,
      payload: { filename, docClass, sha256: digest, sizeBytes: file.size },
    });
    return d;
  });
  return Response.json({ document: doc }, { status: 201 });
});
