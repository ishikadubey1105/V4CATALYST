import { useMemo } from 'react'
import { useMe, useRelations, useStore } from '../store/useStore'
import { caseRole, canViewCase } from './permissions'
import type { Case, CaseRole } from './types'

export interface VisibleCase extends Case { role: CaseRole }

/** Cases the signed-in employee may see, each tagged with their relationship to it. */
export function useVisibleCases(): VisibleCase[] {
  const me = useMe()
  const cases = useStore((s) => s.cases)
  const rel = useRelations()
  return useMemo(
    () => cases.filter((c) => canViewCase(me, c, rel)).map((c) => ({ ...c, role: caseRole(me, c, rel) })),
    [cases, me, rel.handoffs, rel.tasks, rel.ownership], // eslint-disable-line react-hooks/exhaustive-deps
  )
}

export function useEmployee() {
  const employees = useStore((s) => s.employees)
  return (id?: string) => employees.find((u) => u.id === id)
}
