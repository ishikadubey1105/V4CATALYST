"use client";

import { useRef, useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/client";
import { DOC_CLASSES, REQUIRED_DOCS, label } from "@/lib/domain";
import { Badge, Button, Card, Empty, ErrorNote, Field, Mono, Select, cx } from "../ui";
import type { TabProps } from "./types";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function DocumentsTab({ data, reload, focus }: TabProps) {
  const preset = focus?.startsWith("upload-") ? focus.slice(7) : null;
  const [uploading, setUploading] = useState(Boolean(preset));
  const [docClass, setDocClass] = useState(preset ?? "OTHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = data.case;

  const required = REQUIRED_DOCS[c.caseType] ?? [];
  const missing = required.filter((r) => !c.documents.some((d) => d.docClass === r));
  const referencedBy = (id: string) => [
    ...c.decisions.filter((d) => d.refDocumentId === id).map((d) => `Decision: ${d.title}`),
    ...c.actions.filter((a) => a.refDocumentId === id).map((a) => `Action: ${a.title}`),
  ];

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docClass", docClass);
    try {
      await api(`/api/cases/${c.id}/documents`, { method: "POST", body: fd });
      setUploading(false);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Each file is fingerprinted with SHA-256 on upload and re-checked on every download.</p>
        {data.permissions.edit && !uploading && (
          <Button variant="primary" size="sm" onClick={() => setUploading(true)}>
            Upload
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-bad/30 bg-bad-soft/60 px-3 py-2 text-sm text-bad">
          {label(c.caseType)} cases require: {missing.map((m) => label(m).toLowerCase()).join(", ")}. None attached.
        </div>
      )}

      {uploading && (
        <Card id={preset ? `focus-upload-${preset}` : undefined} className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="File" hint="PDF, image, Word, Excel, CSV or text. Up to 10 MB.">
              <input ref={fileRef} type="file" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            </Field>
            <Field label="Document class">
              <Select value={docClass} onChange={(e) => setDocClass(e.target.value)}>
                {DOC_CLASSES.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                    {required.includes(d) ? " (required)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setUploading(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={upload}>
              Upload and fingerprint
            </Button>
          </div>
        </Card>
      )}

      {c.documents.length === 0 && !uploading && <Empty title="No documents attached." />}
      {c.documents.map((d) => {
        const refs = referencedBy(d.id);
        return (
          <Card key={d.id} id={`focus-${d.id}`} className={cx("p-4", refs.length === 0 && "border-warn/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-[10px] font-bold text-muted">
                {d.filename.split(".").pop()?.toUpperCase().slice(0, 4)}
              </span>
              <span className="font-medium">{d.filename}</span>
              <Badge tone={required.includes(d.docClass as never) ? "accent" : "neutral"}>{label(d.docClass)}</Badge>
              <span className="ml-auto text-xs text-muted">
                {kb(d.sizeBytes)} · {data.names[d.uploadedById]} · {fmtDate(d.uploadedAt)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <Mono>sha256 {d.sha256}</Mono>
              <a href={`/api/documents/${d.id}/download`} className="text-sm font-medium text-accent hover:underline">
                Download
              </a>
            </div>
            <p className={cx("mt-1 text-xs", refs.length ? "text-muted" : "text-warn")}>
              {refs.length ? `Referenced by ${refs.join("; ")}` : "Not referenced by any decision or action. Link it so the receiver knows why it matters."}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
