import {
  Alert,
  Box,
  Button,
  Grid,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '../components/ui/GlassCard'
import { paths } from './constants'
import logo from '../assets/logo.svg'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const FORGOT_PASSWORD_URL = `${API_BASE}/api/v1/auth/forgot-password`

export function ForgotPasswordPage() {
  const theme = useTheme()
  const auth = theme.palette.auth
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const emailOk = email.includes('@')
  const valid = emailOk

  const gradientTextSx = {
    background: `linear-gradient(90deg, ${auth.accentFrom}, ${auth.accentTo})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }

  const ctaSx = {
    py: 1.75,
    borderRadius: 999,
    fontWeight: 700,
    fontSize: '1rem',
    textTransform: 'none' as const,
    background: `linear-gradient(90deg, ${auth.accentFrom}, ${auth.accentTo})`,
    color: '#050505',
    boxShadow: `0 12px 40px ${alpha(auth.accentFrom, 0.25)}`,
    '&:hover': {
      background: `linear-gradient(90deg, ${auth.accentFrom}, ${auth.accentTo})`,
      filter: 'brightness(1.08)',
      boxShadow: `0 16px 48px ${alpha(auth.accentFrom, 0.35)}`,
    },
    '&.Mui-disabled': {
      background: alpha('#0F172A', 0.12),
      color: alpha('#0F172A', 0.35),
      boxShadow: 'none',
    },
  }

  async function handleSubmit() {
    if (!valid || loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(FORGOT_PASSWORD_URL, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: unknown; message?: string }
        | { error?: { message?: string } }
        | null

      if (!res.ok) {
        const message =
          payload && 'error' in payload && payload.error?.message
            ? payload.error.message
            : `Request failed (${res.status})`
        setError(message)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error — check that the API is running and CORS is enabled.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Grid container sx={{ minHeight: '100vh', bgcolor: auth.pageBg }}>
      {/* ── left intro panel ── */}
      <Grid
        size={{ xs: 12, md: 6 }}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          px: { xs: 3, sm: 6 },
          py: { xs: 6, md: 8 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          borderRight: { md: `1px solid ${auth.panelBorder}` },
        }}
      >
        <Link
          href="https://www.virlo.com"
          target="_blank"
          sx={{ position: 'absolute', top: 40, left: 40 }}
        >
          <img src={logo} alt="Virlo" width="200px" />
        </Link>
        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 520 }}>
          <Typography
            variant="overline"
            sx={{
              ...gradientTextSx,
              fontWeight: 800,
              letterSpacing: '0.35em',
              fontSize: '0.8125rem',
              display: 'block',
              mb: 2,
            }}
          >
            ACCOUNT RECOVERY
          </Typography>
          <Typography
            component="h1"
            sx={{
              fontFamily: theme.typography.fontFamily,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
              color: 'text.primary',
              mb: 2,
            }}
          >
            FORGOT YOUR
            <br />
            PASSWORD?
          </Typography>
          <Typography
            variant="subtitle2"
            sx={{ color: 'text.secondary', fontWeight: 500, maxWidth: 440 }}
          >
            No worries — enter the email tied to your PhotonX workspace and we&apos;ll send you a
            secure link to reset it.
          </Typography>
        </Box>
      </Grid>

      {/* ── right form panel ── */}
      <Grid
        size={{ xs: 12, md: 6 }}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2, sm: 4 },
          py: { xs: 4, md: 6 },
        }}
      >
        {/* decorative grid */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.42,
            backgroundImage: `
              linear-gradient(${alpha('#22D3EE', 0.08)} 1px, transparent 1px),
              linear-gradient(90deg, ${alpha('#22D3EE', 0.08)} 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(circle at 50% 50%, black 44%, transparent 88%)',
          }}
        />
        {/* glow */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: '9%',
            right: '-16%',
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha('#22D3EE', 0.2)} 0%, transparent 68%)`,
            filter: 'blur(6px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <GlassCard
          sx={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: '75%',
            p: { xs: 3, sm: 4 },
            borderRadius: '16px',
            bgcolor: auth.panelBg,
            border: '1px solid #dddddd57',
            boxShadow: `0 24px 60px ${alpha('#0F172A', 0.12)}, 0 1px 0 ${alpha('#FFFFFF', 0.7)} inset`,
            backdropFilter: 'blur(14px)',
          }}
        >
          {submitted ? (
            <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: `linear-gradient(135deg, ${alpha(auth.accentFrom, 0.18)}, ${alpha(
                    auth.accentTo,
                    0.18,
                  )})`,
                  border: `1px solid ${alpha(auth.accentFrom, 0.35)}`,
                  color: '#0EA5B7',
                }}
              >
                <MarkEmailReadOutlinedIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography
                variant="h4"
                component="h2"
                sx={{ fontWeight: 600, letterSpacing: '-0.02em' }}
              >
                Check your inbox
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ maxWidth: 360 }}>
                If an account exists for{' '}
                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {email.trim()}
                </Box>
                , you&apos;ll receive a password-reset link shortly. The link expires in a short
                while for your security.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                sx={ctaSx}
                onClick={() => navigate(paths.auth)}
                startIcon={<ArrowBackRoundedIcon />}
              >
                Back to sign in
              </Button>
              <Typography variant="body1" color="text.secondary">
                Didn&apos;t get the email?{' '}
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => {
                    setSubmitted(false)
                    setError(null)
                  }}
                  sx={{ color: auth.accentTo, fontWeight: 700 }}
                >
                  Try a different email
                </Link>
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Typography
                variant="h4"
                component="h2"
                sx={{ fontWeight: 600, letterSpacing: '-0.02em', mb: 0.5 }}
              >
                Reset your password
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 3 }}>
                Enter the email tied to your account and we&apos;ll send a reset link.
              </Typography>

              {error ? (
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              ) : null}

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, mb: 1, display: 'block' }}
                >
                  Email
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setError(null)
                    setEmail(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && valid) void handleSubmit()
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 1 }}>
                          <EmailOutlinedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                  error={email.length > 0 && !emailOk}
                  helperText={email.length > 0 && !emailOk ? 'Enter a valid email' : ' '}
                />
              </Box>

              <Button
                fullWidth
                variant="contained"
                disabled={!valid || loading}
                sx={{ ...ctaSx, mt: 1, mb: 2 }}
                onClick={() => void handleSubmit()}
              >
                {loading ? 'Sending link…' : 'Send reset link'}
              </Button>

              <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
                Remembered it?{' '}
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => navigate(paths.auth)}
                  sx={{ color: auth.accentTo, fontWeight: 700 }}
                >
                  Back to sign in
                </Link>
              </Typography>
            </Stack>
          )}

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'center', mt: 3 }}
          >
            © {new Date().getFullYear()} PhotonX GrowthOS - Virlo. All rights reserved.
          </Typography>
        </GlassCard>
      </Grid>
    </Grid>
  )
}

export default ForgotPasswordPage
