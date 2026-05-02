// NOTE: We do NOT use the Facebook JS SDK. The backend implements the
// standard OAuth code flow (`/dialog/oauth?response_type=code`), so we open
// a popup window directly at the OAuth URL and wait for the callback page
// to post the code back via window.postMessage. See `useMetaOAuth` below.

import { useCallback, useEffect, useRef, useState } from 'react'

export type MetaOAuthResult = { code: string; state: string }
export type MetaOAuthOptions = {
  width?: number
  height?: number
}

const POPUP_NAME = 'meta-oauth-popup'
const ORIGIN = window.location.origin

// Opens a Meta OAuth popup, waits for the callback page to postMessage the
// code+state back, then resolves. Rejects on user-close, cross-origin
// message, or timeout.
//
// The callback page (frontend/src/pages/OAuthCallback.tsx) must call
//   window.opener.postMessage({ source: 'meta-oauth', code, state }, ORIGIN)
// from inside the popup.
export function openMetaOAuthPopup(authUrl: string, opts: MetaOAuthOptions = {}): Promise<MetaOAuthResult> {
  return new Promise((resolve, reject) => {
    const width = opts.width ?? 600
    const height = opts.height ?? 720
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const features = `width=${width},height=${height},left=${left},top=${top},popup=1`

    const popup = window.open(authUrl, POPUP_NAME, features)
    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'))
      return
    }

    let settled = false
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearInterval(closedPoll)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ORIGIN) return
      const data = event.data as { source?: string; code?: string; state?: string; error?: string } | null
      if (!data || data.source !== 'meta-oauth') return
      settled = true
      cleanup()
      try { popup.close() } catch { /* ignore */ }
      if (data.error) reject(new Error(data.error))
      else if (data.code && data.state) resolve({ code: data.code, state: data.state })
      else reject(new Error('OAuth callback returned no code'))
    }
    window.addEventListener('message', onMessage)

    const closedPoll = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup()
        reject(new Error('Login window was closed before completing.'))
      }
    }, 600)
  })
}

export type UseMetaOAuth = {
  inProgress: boolean
  error: Error | null
  startOAuth: (authUrl: string) => Promise<MetaOAuthResult>
}

export function useMetaOAuth(): UseMetaOAuth {
  const [inProgress, setInProgress] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => () => { cancelledRef.current = true }, [])

  const startOAuth = useCallback(async (authUrl: string) => {
    setInProgress(true)
    setError(null)
    try {
      const result = await openMetaOAuthPopup(authUrl)
      if (!cancelledRef.current) setInProgress(false)
      return result
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err as Error)
        setInProgress(false)
      }
      throw err
    }
  }, [])

  return { inProgress, error, startOAuth }
}
