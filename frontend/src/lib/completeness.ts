import type { Decision, Doc, Draft, Question, Task } from './types'

export interface CheckItem {
  id: string
  label: string
  pass: boolean
  detail: string
  fix: string
  fixLabel: string
}

interface Input {
  caseId: string
  draft: Draft
  tasks: Task[]
  decisions: Decision[]
  docs: Doc[]
  questions: Question[]
}

/** The gate that blocks a bad handoff. Every failing item links to where it gets fixed. */
export function runCompleteness({ caseId, draft, tasks, decisions, docs, questions }: Input) {
  const open = tasks.filter((t) => t.caseId === caseId && !t.done)
  const noOwner = open.filter((t) => !t.ownerId)
  const noDue = open.filter((t) => !t.due)
  const openQ = questions.filter((q) => q.caseId === caseId && !q.answer)
  const caseDecisions = decisions.filter((d) => d.caseId === caseId)
  const caseDocs = docs.filter((d) => d.caseId === caseId)
  const summaryLen = draft.summary.trim().length
  const reasonOk = !!draft.reason && draft.reasonNote.trim().length >= 10
  const wizard = `/cases/${caseId}/forward`

  const items: CheckItem[] = [
    {
      id: 'receiver', label: 'Receiving employee selected', pass: !!draft.toId,
      detail: draft.toId ? 'A named employee will take ownership' : 'Choose who the case is forwarded to',
      fix: `${wizard}?step=0`, fixLabel: 'Choose employee',
    },
    {
      id: 'reason', label: 'Reason for forwarding given', pass: reasonOk,
      detail: reasonOk ? 'Category and explanation recorded' : 'Pick a reason and explain it (min. 10 characters)',
      fix: `${wizard}?step=0`, fixLabel: 'Add reason',
    },
    {
      id: 'summary', label: 'Handoff note written', pass: summaryLen >= 40,
      detail: summaryLen >= 40 ? `${summaryLen} characters` : `Needs at least 40 characters (has ${summaryLen})`,
      fix: `${wizard}?step=1`, fixLabel: 'Write note',
    },
    {
      id: 'decisions', label: 'Key decisions recorded', pass: caseDecisions.length > 0,
      detail: `${caseDecisions.length} decision${caseDecisions.length === 1 ? '' : 's'} logged`,
      fix: `/cases/${caseId}?tab=context`, fixLabel: 'Add decision',
    },
    {
      id: 'documents', label: 'Supporting documents attached', pass: caseDocs.length > 0,
      detail: `${caseDocs.length} file${caseDocs.length === 1 ? '' : 's'} attached`,
      fix: `/cases/${caseId}?tab=documents`, fixLabel: 'Upload files',
    },
    {
      id: 'owners', label: 'Every open task has an assignee', pass: noOwner.length === 0,
      detail: noOwner.length ? `Unassigned: ${noOwner.map((t) => t.title).join('; ')}` : `${open.length} open tasks, all assigned`,
      fix: `/cases/${caseId}?tab=actions${noOwner[0] ? `&highlight=${noOwner[0].id}` : ''}`, fixLabel: 'Assign',
    },
    {
      id: 'deadlines', label: 'Every open task has a deadline', pass: noDue.length === 0,
      detail: noDue.length ? `No deadline: ${noDue.map((t) => t.title).join('; ')}` : 'All open tasks are dated',
      fix: `/cases/${caseId}?tab=actions${noDue[0] ? `&highlight=${noDue[0].id}` : ''}`, fixLabel: 'Set deadline',
    },
    {
      id: 'questions', label: 'No unanswered questions', pass: openQ.length === 0,
      detail: openQ.length ? `${openQ.length} open: "${openQ[0].text}"` : 'All questions answered',
      fix: `/cases/${caseId}?tab=context`, fixLabel: 'Answer',
    },
  ]

  const passed = items.filter((i) => i.pass).length
  return { items, passed, total: items.length, score: Math.round((passed / items.length) * 100), ok: passed === items.length }
}
