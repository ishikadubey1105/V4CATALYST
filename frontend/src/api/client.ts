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

/** Fetches a file (e.g. a PDF) with the bearer token; returns it with the server's suggested file name. */
export async function fetchFile(ep: Endpoint<unknown, unknown>, query: Record<string, string | number | undefined> = {}): Promise<{ blob: Blob; name: string | null }> {
  const filled = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(`${API_BASE}${ep.path}?${new URLSearchParams(filled)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? res.statusText)
  }
  return { blob: await res.blob(), name: /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? null }
}

/** Fetches a file and saves it under the server's suggested name. */
export async function downloadFile(ep: Endpoint<unknown, unknown>, query: Record<string, string | number | undefined> = {}, fallbackName = 'download'): Promise<void> {
  const { blob, name: suggested } = await fetchFile(ep, query)
  const name = suggested ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Typed fetch wrapper: fills :params into the path, attaches the bearer token, maps errors to ApiError. */
export async function request<Req, Res>(
  ep: Endpoint<Req, Res>,
  opts: { params?: Record<string, string>; body?: Req; query?: Record<string, string | number | undefined> } = {},
): Promise<Res> {
  const filled = Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  const qs = filled.length ? `?${new URLSearchParams(filled)}` : ''
  const path = ep.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(opts.params?.[k] ?? '')) + qs
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
