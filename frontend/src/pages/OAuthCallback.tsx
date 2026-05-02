import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'

// This page lives at /oauth/meta-ads/callback. Meta redirects the OAuth
// popup window here with `?code=...&state=...`. We forward those values
// to the opener (AdsSetup) via window.postMessage and close ourselves.
//
// If anything goes wrong (no opener, error param, missing code) we surface
// a fallback message so the user isn't left staring at a blank tab.
export function OAuthCallback() {
  const [message, setMessage] = useState('Finishing sign-in…')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorReason = params.get('error_description') || params.get('error_reason') || params.get('error')

    const opener = window.opener as Window | null

    if (errorReason) {
      setMessage(errorReason)
      setIsError(true)
      try {
        opener?.postMessage({ source: 'meta-oauth', error: errorReason }, window.location.origin)
      } catch {
        /* ignore */
      }
      return
    }

    if (!code || !state) {
      setMessage('Missing OAuth response from Meta.')
      setIsError(true)
      try {
        opener?.postMessage(
          { source: 'meta-oauth', error: 'Missing code or state in callback' },
          window.location.origin,
        )
      } catch {
        /* ignore */
      }
      return
    }

    try {
      opener?.postMessage({ source: 'meta-oauth', code, state }, window.location.origin)
    } catch {
      /* ignore */
    }

    if (opener) {
      // Give the opener a tick to receive the message before closing.
      window.setTimeout(() => {
        try { window.close() } catch { /* ignore */ }
        // If close was blocked (some browsers), at least show success.
        setMessage('You can close this window.')
      }, 200)
    } else {
      setMessage('No setup window detected. Please return to the app and try again.')
      setIsError(true)
    }
  }, [])

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 420, textAlign: 'center' }}>
        {!isError && <CircularProgress size={32} />}
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {isError ? 'Sign-in problem' : 'Connecting your Meta account'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </Stack>
    </Box>
  )
}

export default OAuthCallback
