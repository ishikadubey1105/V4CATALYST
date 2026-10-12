import type { Readiness } from "@/lib/gate";

export type ContextItem = { id: string; kind: string; title: string; body: string; resolution: string | null; resolvedAt: string | null; authorId: string; createdAt: string };
export type Decision = { id: string; title: string; rationale: string; decidedById: string; decidedAt: string; supersedesId: string | null; refDocumentId: string | null };
export type Action = {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  dueDate: string | null;
  blockedReason: string | null;
  note: string | null;
  noteUpdatedAt: string | null;
  refDocumentId: string | null;
  completedAt: string | null;
};
export type Doc = { id: string; filename: string; docClass: string; mimeType: string; sizeBytes: number; sha256: string; uploadedById: string; uploadedAt: string };
export type HandoffRow = { id: string; state: string; fromUserId: string; toUserId: string; reason: string; initiatedAt: string; submittedAt: string | null; respondedAt: string | null };

export type CaseData = {
  case: {
    id: string;
    title: string;
    summary: string;
    caseType: string;
    status: string;
    priority: string;
    team: string;
    deadline: string | null;
    createdAt: string;
    currentOwnerId: string;
    currentOwner: { id: string; name: string; title: string | null };
    contextItems: ContextItem[];
    decisions: Decision[];
    actions: Action[];
    documents: Doc[];
    handoffs: HandoffRow[];
  };
  activeHandoff: { id: string; state: string; toUserId: string } | null;
  names: Record<string, string>;
  readiness: Readiness;
  permissions: { edit: boolean; handoff: boolean; reassign: boolean; isOwner: boolean };
};

export type TabProps = {
  data: CaseData;
  reload: () => Promise<void>;
  focus: string | null;
};
