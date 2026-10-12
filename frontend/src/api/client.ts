import type { Endpoint } from './contracts'

/** Normalised error every adapter throws. `code` matches the backend error codes listed in contracts.ts. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export const API_MODE: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '/api'

const TOKEN_KEY = 'baton.token'
export const tokenStore = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string | null) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } },
}

/** Typed fetch wrapper: fills :params into the path, attaches the bearer token, maps errors to ApiError. */
export async function request<Req, Res>(
  ep: Endpoint<Req, Res>,
  opts: { params?: Record<string, string>; body?: Req } = {},
): Promise<Res> {
  const path = ep.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(opts.params?.[k] ?? ''))
  const isForm = opts.body instanceof FormData
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method: ep.method,
      headers: {
        ...(isForm || opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.')
  }
  if (res.status === 401) tokenStore.set(null)
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? res.statusText)
  }
  return res.status === 204 ? (undefined as Res) : res.json()
}
