import { useSearchParams } from 'react-router-dom'
import { useMe } from '../store/useStore'
import { PageHeader, Tabs } from '../components/ui'
import { ProcessFlow, TaskTimeline } from '../components/flows'

type View = 'process' | 'timeline'

/** n8n-style workflow view: the process graph with live counts, and tasks laid out on a timeline. */
export default function Flow() {
  const me = useMe()!
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'process'

  return (
    <>
      <PageHeader
        title="Workflow"
        sub={me.orgRole === 'employee'
          ? 'How your complaints move through the process, and where your tasks sit in time'
          : 'How every complaint moves through the process, and where every task sits in time'}
      />
      <Tabs
        value={view}
        onChange={(v) => setParams({ view: v })}
        items={[{ key: 'process', label: 'Process flow' }, { key: 'timeline', label: 'Task timeline' }]}
      />
      <div className="mt-4">
        {view === 'process' ? <ProcessFlow /> : <TaskTimeline height={600} />}
      </div>
    </>
  )
}
