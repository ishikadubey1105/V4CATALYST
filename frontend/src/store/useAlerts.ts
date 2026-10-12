import { create } from 'zustand'
import type { Alert, AlertSeverity } from '../api/contracts'

/**
 * Live alerts from GET /alerts. Kept outside the main store because they are computed by the server, not synced
 * records. Refreshed by the 60s tick in Layout and after every mutation (http adapter's sync).
 */
interface AlertsState {
  alerts: Alert[]
  counts: Record<AlertSeverity, number>
  loaded: boolean
  refresh: () => Promise<void>
}

const empty: Record<AlertSeverity, number> = { critical: 0, high: 0, warning: 0, info: 0 }

export const useAlerts = create<AlertsState>()((set) => ({
  alerts: [],
  counts: empty,
  loaded: false,
  refresh: async () => {
    // Imported lazily: the api module imports this store (http adapter), so a static import would be circular.
    const { api } = await import('../api')
    try {
      const res = await api.alerts()
      set({ alerts: res.alerts, counts: res.counts, loaded: true })
    } catch {
      /* signed out or offline — keep the last known alerts */
    }
  },
}))
