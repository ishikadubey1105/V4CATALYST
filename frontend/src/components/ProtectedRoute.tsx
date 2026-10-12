import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { OrgRole } from '../lib/types'
import { useMe } from '../store/useStore'

/** Redirects to /login when signed out (or disabled) and to /unauthorized when the org role is not allowed. */
export function ProtectedRoute({ roles, children }: { roles?: OrgRole[]; children: ReactNode }) {
  const me = useMe()
  const location = useLocation()
  if (!me || !me.active) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(me.orgRole)) return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
