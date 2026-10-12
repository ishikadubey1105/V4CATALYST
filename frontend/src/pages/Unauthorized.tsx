import { useLocation } from 'react-router-dom'
import { useMe } from '../store/useStore'
import { ButtonLink, Panel } from '../components/ui'
import { orgRoleLabel } from '../lib/utils'

export default function Unauthorized() {
  const me = useMe()
  const from = (useLocation().state as { from?: string } | null)?.from
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6">
      <div className="font-mono text-xs text-red-700">403 · ACCESS DENIED</div>
      <h1 className="mt-1 text-lg font-semibold">You don't have access to this page</h1>
      <p className="mt-2 text-[13px] text-zinc-600">
        Your access level is <b>{me ? orgRoleLabel[me.orgRole] : 'unknown'}</b>.
        {from && <> The page <code className="rounded-sm bg-zinc-100 px-1 font-mono text-xs">{from}</code> requires a different level.</>}
        {' '}Ask an administrator if you need it.
      </p>
      <ButtonLink to="/dashboard" variant="secondary" className="mt-4">Back to my work</ButtonLink>
    </Panel>
  )
}
