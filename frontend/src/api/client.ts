import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { ApiResponse } from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

const TOKEN_KEY = 'growthos.jwt'

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string, persist = false) {
  if (persist) localStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

export const http = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 60_000,
})

http.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Maps a low-level axios error into a typed ApiError that callers can rely on.
// Backend always responds in `{success, data | error, message}` shape — we
// surface the most actionable message to the caller without losing the raw
// payload (which the wizard's error step displays in collapsible "details").
export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown
  raw?: unknown
  constructor(message: string, status: number, code?: string, details?: unknown, raw?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.raw = raw
  }
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        // Token expired or invalid — surface for app shell to redirect.
        clearAuthToken()
        // Broadcast so useAuth() / AppShell / any open page can react.
        try {
          window.dispatchEvent(new CustomEvent('auth:invalid'))
        } catch { /* SSR / older runtimes */ }
      }
      const failure = data && typeof data === 'object' ? (data as ApiResponse<unknown>) : null
      const failureMsg =
        failure && 'success' in failure && failure.success === false
          ? failure.error || failure.message
          : undefined
      const message =
        failureMsg ||
        (status === 401
          ? 'Your session expired. Please sign in again.'
          : status === 403
          ? 'You do not have permission to perform this action.'
          : status === 404
          ? 'Not found.'
          : status === 429
          ? 'Too many requests. Please retry in a moment.'
          : status >= 500
          ? 'The server returned an error. Please retry shortly.'
          : 'Request failed.')
      throw new ApiError(message, status, undefined, (failure as { details?: unknown })?.details, data)
    }
    if (error.code === 'ECONNABORTED') {
      throw new ApiError('Request timed out.', 0, 'TIMEOUT')
    }
    throw new ApiError(error.message || 'Network error.', 0, 'NETWORK')
  },
)

// Unwraps the backend `{success, data}` envelope. Callers receive `T` directly
// or an ApiError is thrown.
export async function unwrap<T>(promise: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const res = await promise
  const body = res.data
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success) return body.data
    throw new ApiError(body.error || body.message || 'Request failed', res.status, undefined, body.details, body)
  }
  // Some endpoints (e.g. forgot-password) return a plain message envelope
  return body as unknown as T
}

export function get<T>(url: string, config?: AxiosRequestConfig) {
  return unwrap<T>(http.get(url, config))
}
export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return unwrap<T>(http.post(url, data, config))
}
export function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return unwrap<T>(http.patch(url, data, config))
}
export function del<T>(url: string, config?: AxiosRequestConfig) {
  return unwrap<T>(http.delete(url, config))
}
