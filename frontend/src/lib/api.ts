const TOKEN_KEY = 'growthos_jwt'

export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
  return raw.replace(/\/$/, '')
}

/** Dev-only: mint JWT via backend `/auth/dev-token`. No-op if token already stored. */
export async function ensureDevAuthToken(): Promise<string> {
  const existing = localStorage.getItem(TOKEN_KEY)
  if (existing) return existing

  if (!import.meta.env.DEV) {
    throw new Error('Not signed in. Set growthos_jwt in localStorage or run the app in development mode.')
  }

  const r = await fetch(`${getApiBase()}/api/v1/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`dev-token failed (${r.status}): ${text}`)
  }
  const data = (await r.json()) as { token: string }
  localStorage.setItem(TOKEN_KEY, data.token)
  return data.token
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureDevAuthToken()
  const base = getApiBase()
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body != null && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}
