import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, CircularProgress, Stack, Typography, Button, Alert } from '@mui/material'
import { paths } from '../auth'
import { instagramApi } from '../api/instagram'

type Status = 'pending' | 'success' | 'error'

export function InstagramCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('pending')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const exchangedRef = useRef(false)

  useEffect(() => {
    // Strict-mode mounts effects twice in dev — guard so the code isn't
    // posted twice (which would 4xx the second time since IG codes are
    // single-use).
    if (exchangedRef.current) return
    exchangedRef.current = true

    const code = params.get('code')
    const errParam = params.get('error')
    const errDesc = params.get('error_description')

    if (errParam) {
      setStatus('error')
      setErrorMsg(errDesc || errParam)
      return
    }
    if (!code) {
      setStatus('error')
      setErrorMsg('Missing authorization code in callback URL.')
      return
    }

    instagramApi
      .exchangeCode(code)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate(paths.instagram), 1200)
      })
      .catch((err: Error) => {
        setStatus('error')
        setErrorMsg(err.message || 'Failed to connect Instagram account.')
      })
  }, [params, navigate])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: '#F8FAFC',
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 480, p: 4, alignItems: 'center' }}>
        {status === 'pending' && (
          <>
            <CircularProgress />
            <Typography variant="h6">Connecting your Instagram account…</Typography>
            <Typography variant="body2" color="text.secondary">
              Hang tight — this usually takes a few seconds.
            </Typography>
          </>
        )}
        {status === 'success' && (
          <Alert severity="success" sx={{ width: '100%' }}>
            Instagram connected. Redirecting…
          </Alert>
        )}
        {status === 'error' && (
          <>
            <Alert severity="error" sx={{ width: '100%' }}>
              {errorMsg}
            </Alert>
            <Button variant="contained" onClick={() => navigate(paths.instagram)}>
              Back to Instagram
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
