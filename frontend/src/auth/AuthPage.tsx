import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from './constants'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const SIGNUP_URL = `${API_BASE}/api/v1/auth/signup`
const LOGIN_URL = `${API_BASE}/api/v1/auth/login`
const E164_PHONE_RE = /^\+[1-9]\d{1,14}$/
const STRONG_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

type AuthTab = 'login' | 'signup'
type AuthUser = {
  id?: string
  first_name?: string
  last_name?: string
  email?: string
}

export function AuthPage() {
  const theme = useTheme()
  const auth = theme.palette.auth
  const navigate = useNavigate()
  const { login, signup, isAuthenticated, loading } = useAuth()

  const [tab, setTab] = useState<AuthTab>('login')
  const [serverError, setServerError] = useState<string | null>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPass, setShowLoginPass] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showSignupPass, setShowSignupPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState<string | null>(null)

  const loginEmailOk = loginEmail.includes('@')
  const loginPassOk = loginPassword.length >= 8
  const loginValid = loginEmailOk && loginPassOk

  const fnameOk = firstName.trim().length > 0
  const lnameOk = lastName.trim().length > 0
  const signupEmailOk = signupEmail.includes('@')
  const phoneTrimmed = signupPhone.trim()
  const phoneOk = E164_PHONE_RE.test(phoneTrimmed)
  const signupPassOk = STRONG_PASSWORD_RE.test(signupPassword)
  const passwordsMatch = signupPassword === confirmPassword && confirmPassword.length > 0

  const basicsValid = useMemo(
    () => fnameOk && lnameOk && signupEmailOk && phoneOk && signupPassOk && passwordsMatch,
    [fnameOk, lnameOk, signupEmailOk, phoneOk, signupPassOk, passwordsMatch],
  )

  const handleTabChange = (_: React.MouseEvent<HTMLElement>, value: AuthTab | null) => {
    if (!value) return
    setTab(value)
    if (value === 'login') setSignupError(null)
    if (value === 'signup') setLoginError(null)
  }

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
      background: alpha('#FFFFFF', 0.08),
      color: alpha('#FFFFFF', 0.35),
      boxShadow: 'none',
    },
  }

  const inputSlotProps = (icon: React.ReactNode, end?: React.ReactNode) => ({
    input: {
      startAdornment: (
        <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 1 }}>
          {icon}
        </InputAdornment>
      ),
      ...(end ? { endAdornment: end } : {}),
    },
  })

  const goToApp = () => navigate(paths.dashboard)

  const clearLoginError = () => setLoginError(null)
  const clearSignupError = () => setSignupError(null)

  async function handleLogin() {
    if (!loginValid || loginLoading) return
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      })

      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { token?: string; user?: AuthUser } }
        | { error?: { message?: string } }
        | null

      if (!res.ok) {
        const message =
          payload && 'error' in payload && payload.error?.message
            ? payload.error.message
            : `Login failed (${res.status})`
        setLoginError(message)
        return
      }

      const token =
        payload && 'data' in payload && payload.data && typeof payload.data.token === 'string'
          ? payload.data.token
          : null

      if (!token) {
        setLoginError('Unexpected response from server.')
        return
      }

      localStorage.setItem('auth_token', token)
      const user =
        payload && 'data' in payload && payload.data && typeof payload.data.user === 'object'
          ? payload.data.user
          : null
      if (user) {
        localStorage.setItem('auth_user', JSON.stringify(user))
      }
      goToApp()
    } catch {
      setLoginError('Network error — check that the API is running and CORS is enabled.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleSignup() {
    if (!basicsValid || signupLoading) return
    setSignupError(null)
    setSignupLoading(true)
    try {
      const res = await fetch(SIGNUP_URL, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: signupEmail.trim(),
          phone: phoneTrimmed,
          password: signupPassword,
          confirm_password: confirmPassword,
        }),
      })

      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { token?: string } }
        | { error?: { message?: string } }
        | null

      if (!res.ok) {
        const message =
          payload && 'error' in payload && payload.error?.message
            ? payload.error.message
            : `Sign up failed (${res.status})`
        setSignupError(message)
        return
      }

      setLoginEmail(signupEmail.trim())
      setLoginPassword(signupPassword)
      setTab('login')
      setSignupError(null)
    } catch {
      setSignupError('Network error — check that the API is running and CORS is enabled.')
    } finally {
      setSignupLoading(false)
    }
  }

  return (
    <Grid container sx={{ minHeight: '100vh', bgcolor: auth.pageBg }}>
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
          background: `radial-gradient(ellipse 80% 60% at 20% 20%, ${alpha(auth.accentFrom, 0.12)} 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 80% 80%, ${alpha(auth.accentTo, 0.08)} 0%, transparent 50%), ${auth.pageBg}`,
        }}
      >
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
            LET&apos;S CONNECT
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
            WITH OUR
            <br />
            PHOTONX GROWTH OS
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500, maxWidth: 440 }}>
            Seamlessly enhance acquisition through AI-assisted campaigns, creatives, and CRM — built for
            teams who scale with clarity.
          </Typography>
        </Box>

        <Typography
          sx={{
            position: 'absolute',
            left: '0%',
            transform: 'translateX(0%)',
            bottom: '0%',
            fontSize: '9rem' ,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: alpha('#FFFFFF', 0.045),
            userSelect: 'none',
            pointerEvents: 'none',
            lineHeight: 0.85,
            whiteSpace: 'nowrap',
          }}
        >
          VIRLO
        </Typography>
      </Grid>

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
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.65,
            backgroundImage: `
              linear-gradient(${alpha('#22D3EE', 0.08)} 1px, transparent 1px),
              linear-gradient(90deg, ${alpha('#22D3EE', 0.08)} 1px, transparent 1px)
            `,
            backgroundSize: '34px 34px',
            maskImage: 'radial-gradient(circle at 50% 50%, black 44%, transparent 88%)',
          }}
        />
        {/* <Stack
          aria-hidden
          spacing={1.5}
          sx={{
            position: 'absolute',
            top: { xs: 14, md: 26 },
            right: { xs: 14, md: 28 },
            width: { xs: 170, md: 210 },
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {['Signal quality +18%', 'Creative output 642', 'Leads today 148'].map((label, idx) => (
            <Box
              key={label}
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: '8px',
                border: `1px solid ${alpha('#22D3EE', 0.35)}`,
                bgcolor: alpha('#030712', 0.58),
                color: alpha('#D9FBFF', 0.95),
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                backdropFilter: 'blur(8px)',
                transform: `translateX(${idx * 10}px)`,
                boxShadow: `0 10px 24px ${alpha('#000', 0.38)}`,
              }}
            >
              {label}
            </Box>
          ))}
        </Stack> */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: { xs: 14, md: 26 },
            bottom: { xs: 16, md: 26 },
            width: { xs: 170, md: 210 },
            p: 1.5,
            borderRadius: '8px',
            border: `1px solid ${alpha('#FFFFFF', 0.16)}`,
            bgcolor: alpha('#050505', 0.62),
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <Typography sx={{ fontSize: '0.68rem', color: alpha('#FFFFFF', 0.7), mb: 0.8 }}>
            Pipeline readiness
          </Typography>
          <Box
            sx={{
              height: 7,
              borderRadius: 999,
              bgcolor: alpha('#FFFFFF', 0.1),
              overflow: 'hidden',
              mb: 0.8,
            }}
          >
            <Box
              sx={{
                width: '78%',
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${alpha('#22D3EE', 0.92)}, ${alpha('#FFFFFF', 0.95)})`,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: '0.74rem', color: alpha('#22D3EE', 0.95), fontWeight: 700 }}>
            78% healthy campaigns
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 460,
            p: { xs: 3, sm: 4 },
            borderRadius: '8px',
            bgcolor: auth.panelBg,
            border: `1px solid ${auth.panelBorder}`,
            boxShadow: `${alpha('#000000', 0.45)} 0 24px 64px, 0 0 0 1px ${alpha('#FFFFFF', 0.04)}`,
            backdropFilter: 'blur(14px)',
          }}
        >
          <Typography
            variant="h4"
            component="h2"
            sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 0.5 }}
          >
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {tab === 'login'
              ? 'Sign in to orchestrate campaigns or create your PhotonX workspace.'
              : 'Enter your basics — name, email, phone, and password — to start.'}
          </Typography>

          <ToggleButtonGroup
            exclusive
            value={tab}
            onChange={handleTabChange}
            sx={{
              width: '100%',
              mb: 3,
              p: 0.5,
              gap: 0.5,
              bgcolor: alpha('#000000', 0.35),
              borderRadius: 999,
              border: `1px solid ${auth.panelBorder}`,
              '& .MuiToggleButtonGroup-grouped': {
                border: 0,
                borderRadius: `${999}px !important`,
                mx: 0,
              },
            }}
          >
            <ToggleButton
              value="login"
              sx={{
                flex: 1,
                py: 1.25,
                fontWeight: 700,
                textTransform: 'none',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: alpha(auth.accentFrom, 0.14),
                  color: auth.accentTo,
                  boxShadow: `inset 0 0 0 1px ${alpha(auth.accentFrom, 0.55)}, 0 0 20px ${alpha(auth.accentFrom, 0.12)}`,
                  '&:hover': { bgcolor: alpha(auth.accentFrom, 0.18) },
                },
              }}
            >
              Login
            </ToggleButton>
            <ToggleButton
              value="signup"
              sx={{
                flex: 1,
                py: 1.25,
                fontWeight: 700,
                textTransform: 'none',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: alpha(auth.accentFrom, 0.14),
                  color: auth.accentTo,
                  boxShadow: `inset 0 0 0 1px ${alpha(auth.accentFrom, 0.55)}, 0 0 20px ${alpha(auth.accentFrom, 0.12)}`,
                  '&:hover': { bgcolor: alpha(auth.accentFrom, 0.18) },
                },
              }}
            >
              Sign up
            </ToggleButton>
          </ToggleButtonGroup>

          {serverError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setServerError(null)}>
              {serverError}
            </Alert>
          )}

          {tab === 'login' ? (
            <Stack spacing={3}>
              {loginError ? (
                <Alert severity="error" onClose={() => setLoginError(null)}>
                  {loginError}
                </Alert>
              ) : null}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Email
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="new-email"
                  placeholder="you@company.com"
                  value={loginEmail}
                  onChange={(e) => {
                    clearLoginError()
                    setLoginEmail(e.target.value)
                  }}
                  slotProps={inputSlotProps(<EmailOutlinedIcon fontSize="small" />)}
                  error={loginEmail.length > 0 && !loginEmailOk}
                  helperText={loginEmail.length > 0 && !loginEmailOk ? 'Enter a valid email' : ' '}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Password
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="new-password"
                  type={showLoginPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => {
                    clearLoginError()
                    setLoginPassword(e.target.value)
                  }}
                  slotProps={inputSlotProps(
                    <LockOutlinedIcon fontSize="small" />,
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        aria-label="toggle password"
                        onClick={() => setShowLoginPass((v) => !v)}
                        sx={{ color: auth.accentTo }}
                      >
                        {showLoginPass ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>,
                  )}
                  error={loginPassword.length > 0 && !loginPassOk}
                  helperText={loginPassword.length > 0 && !loginPassOk ? 'At least 8 characters' : ' '}
                />
              </Box>
              <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: -1 }}>
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  sx={{ color: auth.accentTo, fontWeight: 600, fontSize: '0.875rem' }}
                >
                  Forgot password?
                </Link>
              </Stack>
              <Button
                fullWidth
                variant="contained"
                disabled={!loginValid || loginLoading}
                sx={ctaSx}
                onClick={() => void handleLogin()}
              >
                {loginLoading ? 'Signing in…' : 'Sign in now'}
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Don&apos;t have access yet?{' '}
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => setTab('signup')}
                  sx={{ color: auth.accentTo, fontWeight: 700 }}
                >
                  Sign up
                </Link>
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={3}>
              {signupError ? (
                <Alert severity="error" onClose={() => setSignupError(null)}>
                  {signupError}
                </Alert>
              ) : null}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                    First name
                  </Typography>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    placeholder="Jordan"
                    value={firstName}
                    onChange={(e) => {
                      clearSignupError()
                      setFirstName(e.target.value)
                    }}
                    slotProps={inputSlotProps(<PersonOutlineOutlinedIcon fontSize="small" />)}
                    error={firstName.length > 0 && !fnameOk}
                    helperText={firstName.length > 0 && !fnameOk ? 'Required' : ' '}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                    Last name
                  </Typography>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    placeholder="Lee"
                    value={lastName}
                    onChange={(e) => {
                      clearSignupError()
                      setLastName(e.target.value)
                    }}
                    slotProps={inputSlotProps(<PersonOutlineOutlinedIcon fontSize="small" />)}
                    error={lastName.length > 0 && !lnameOk}
                    helperText={lastName.length > 0 && !lnameOk ? 'Required' : ' '}
                  />
                </Grid>
              </Grid>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Email
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="new-email"
                  placeholder="you@company.com"
                  value={signupEmail}
                  onChange={(e) => {
                    clearSignupError()
                    setSignupEmail(e.target.value)
                  }}
                  slotProps={inputSlotProps(<EmailOutlinedIcon fontSize="small" />)}
                  error={signupEmail.length > 0 && !signupEmailOk}
                  helperText={signupEmail.length > 0 && !signupEmailOk ? 'Must include @' : ' '}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Phone
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="off"
                  placeholder="+14155552671"
                  value={signupPhone}
                  onChange={(e) => {
                    clearSignupError()
                    setSignupPhone(e.target.value)
                  }}
                  slotProps={inputSlotProps(<PhoneOutlinedIcon fontSize="small" />)}
                  error={signupPhone.length > 0 && !phoneOk}
                  helperText={
                    signupPhone.length > 0 && !phoneOk
                      ? 'E.164 format: + and country code, then digits (6–15 digits after +)'
                      : ' '
                  }
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Password
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="new-password"
                  type={showSignupPass ? 'text' : 'password'}
                  placeholder="At least 8 chars, one letter and one digit"
                  value={signupPassword}
                  onChange={(e) => {
                    clearSignupError()
                    setSignupPassword(e.target.value)
                  }}
                  slotProps={inputSlotProps(
                    <LockOutlinedIcon fontSize="small" />,
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        onClick={() => setShowSignupPass((v) => !v)}
                        sx={{ color: auth.accentTo }}
                      >
                        {showSignupPass ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>,
                  )}
                  error={signupPassword.length > 0 && !signupPassOk}
                  helperText={
                    signupPassword.length > 0 && !signupPassOk
                      ? 'At least 8 characters, with at least one letter and one digit'
                      : ' '
                  }
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Confirm password
                </Typography>
                <TextField
                  fullWidth
                  autoComplete="new-password"
                  type={showConfirmPass ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => {
                    clearSignupError()
                    setConfirmPassword(e.target.value)
                  }}
                  slotProps={inputSlotProps(
                    <LockOutlinedIcon fontSize="small" />,
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        onClick={() => setShowConfirmPass((v) => !v)}
                        sx={{ color: auth.accentTo }}
                      >
                        {showConfirmPass ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>,
                  )}
                  error={confirmPassword.length > 0 && !passwordsMatch}
                  helperText={confirmPassword.length > 0 && !passwordsMatch ? 'Passwords must match' : ' '}
                />
              </Box>
              <Button
                fullWidth
                variant="contained"
                disabled={!basicsValid || signupLoading}
                sx={ctaSx}
                onClick={() => void handleSignup()}
              >
                {signupLoading ? 'Creating account…' : 'Create account'}
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Already onboard?{' '}
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => setTab('login')}
                  sx={{ color: auth.accentTo, fontWeight: 700 }}
                >
                  Login
                </Link>
              </Typography>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 4 }}>
            © {new Date().getFullYear()} PhotonX GrowthOS. All rights reserved.
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  )
}
