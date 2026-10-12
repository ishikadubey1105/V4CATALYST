import { useState } from 'react'
import { API_MODE, ApiError } from './client'
import { httpApi } from './http'
import { mockApi } from './mock'
import type { Api } from './types'
import { useStore, type Toast } from '../store/useStore'

/** The one object screens talk to. Set VITE_API_MODE=http (and VITE_API_BASE_URL) to use the real backend. */
export const api: Api = API_MODE === 'http' ? httpApi : mockApi

export { API_MODE, ApiError }
export { endpoints } from './contracts'

/**
 * Wraps an api call for a component: tracks pending state, shows an error toast with the backend's
 * message and code, and an optional success toast.
 */
export function useAction() {
  const [pending, setPending] = useState(false)
  const run = async <T,>(fn: () => Promise<T>, success?: Omit<Toast, 'id'>): Promise<T | undefined> => {
    setPending(true)
    try {
      const out = await fn()
      if (success) useStore.getState().toast(success)
      return out
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, 'UNKNOWN', 'Something went wrong.')
      useStore.getState().toast({ tone: 'danger', title: err.message, body: `${err.code}${err.status ? ` · HTTP ${err.status}` : ''}` })
      return undefined
    } finally {
      setPending(false)
    }
  }
  return { run, pending }
}
