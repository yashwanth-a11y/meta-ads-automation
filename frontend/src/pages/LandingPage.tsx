import {
  AppBar,
  Box,
  Button,
  Container,
  Grid,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  ArrowForwardRounded,
  AutoAwesomeRounded,
  BoltRounded,
  CheckCircleRounded,
  ChevronRightRounded,
  GraphicEqRounded,
  HubRounded,
  InsightsRounded,
  LockRounded,
  MarkEmailReadRounded,
  MenuRounded,
  PlayArrowRounded,
  PollRounded,
  RocketLaunchRounded,
  ShieldRounded,
  SmartToyRounded,
  SpeedRounded,
  TrendingUpRounded,
  VerifiedRounded,
  VideoLibraryRounded,
} from '@mui/icons-material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import logo from '../assets/logo-1.svg'
import { paths } from '../auth'

// ─── small reveal-on-scroll wrapper ─────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  y = 24,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : `translateY(${y}px)`,
        transition: `opacity 700ms cubic-bezier(.2,.8,.2,1) ${delay}ms, transform 800ms cubic-bezier(.2,.8,.2,1) ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}

// ─── animated counter ───────────────────────────────────────────────────────
function Counter({ to, suffix = '', duration = 1600 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 3)
            setVal(Math.round(to * eased))
            if (t < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.4 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [to, duration])

  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  )
}

export function LandingPage() {
  const theme = useTheme()
  const navigate = useNavigate()
  const auth = theme.palette.auth
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const accent = useMemo(
    () => `linear-gradient(90deg, ${auth.accentFrom}, ${auth.accentTo})`,
    [auth.accentFrom, auth.accentTo],
  )

  const goAuth = () => navigate(paths.auth)

  // ─── nav links ────────────────────────────────────────────────────────────
  const navLinks: { label: string; href: string }[] = [
    { label: 'Product', href: '#product' },
    { label: 'How it works', href: '#workflow' },
    { label: 'Engines', href: '#engines' },
    { label: 'Security', href: '#security' },
  ]

  // ─── reusable styles ──────────────────────────────────────────────────────
  const gradientText = {
    background: accent,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }

  const ctaPrimarySx = {
    px: 3.25,
    py: 1.4,
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'none' as const,
    fontSize: '0.98rem',
    background: '#22d3ee',
    color: '#FFFFFF',
    boxShadow: `0 14px 40px ${alpha('#22d3ee', 0.35)}`,
    transition: 'transform 240ms ease, box-shadow 240ms ease, filter 200ms ease',
    '&:hover': {
      filter: 'brightness(1.06)',
      transform: 'translateY(-2px)',
      boxShadow: `0 20px 50px ${alpha('#22d3ee', 0.45)}`,
      background: '#22d3ee',
    },
  }

  const ctaGhostSx = {
    px: 3,
    py: 1.4,
    borderRadius: 999,
    textTransform: 'none' as const,
    fontWeight: 600,
    fontSize: '0.98rem',
    color: '#22d3ee',
    border: `1px solid ${alpha('#22d3ee', 0.3)}`,
    bgcolor: alpha('#FFFFFF', 0.6),
    backdropFilter: 'blur(8px)',
    '&:hover': {
      borderColor: '#22d3ee',
      bgcolor: alpha('#22d3ee', 0.05),
    },
  }

  // ─── data for sections ────────────────────────────────────────────────────
  const featureCards = [
    {
      icon: TrendingUpRounded,
      title: 'Twitter/X-first trend signal',
      copy: 'Streaming filters across ~500 AI handles, launch keywords, and hashtags. Threads stitched, engagement weighed, authority scored.',
    },
    {
      icon: VideoLibraryRounded,
      title: 'Reels in 60 seconds',
      copy: 'Hook, script, voiceover, scenes, captions, hashtags — rendered 1080×1920 with brand intro/outro and burned-in subtitles.',
    },
    {
      icon: PollRounded,
      title: '6-axis creative scoring',
      copy: 'Trend relevance, hook, clarity, audience fit, platform fit, brand safety. Below 7 auto-discards. Above 8.5 may auto-publish.',
    },
    {
      icon: MarkEmailReadRounded,
      title: 'Signed approval emails',
      copy: 'Inline preview, full bundle, three JWT-signed action links — Approve / Reject / Regenerate. Single-use, 48h expiry, audit logged.',
    },
    {
      icon: HubRounded,
      title: 'Meta in two stages',
      copy: 'Conversational brief → PhotonX-side draft → user approval → Marketing API push with idempotency. Pause/archive rollback.',
    },
    {
      icon: SmartToyRounded,
      title: 'GenUI analytics',
      copy: 'Tool-calling over typed analytics functions. Auto-attached charts. Suggested next prompts. The LLM never sees raw SQL.',
    },
  ]

  const workflowSteps = [
    {
      icon: TrendingUpRounded,
      title: 'Ingest trends',
      copy: 'X streaming + Product Hunt + RSS + Google Trends. LLM sub-classifier labels launch / funding / opinion.',
    },
    {
      icon: AutoAwesomeRounded,
      title: 'Generate creative',
      copy: 'Top-N ideas → complete bundle. Voiceover, scenes, captions. Scored against the rubric, weak ones discarded.',
    },
    {
      icon: RocketLaunchRounded,
      title: 'Approve & publish',
      copy: 'Email with three signed links. On approve, Instagram Content Publishing API with retry/backoff.',
    },
    {
      icon: InsightsRounded,
      title: 'Ads & leads loop',
      copy: 'Brief becomes Meta campaign. Lead Ads webhook into CRM in <60s with full attribution. Daily AI summary.',
    },
  ]

  const kpis = [
    { value: 60, suffix: 's', label: 'creative bundle', sub: 'Hook, script, VO, captions, hashtags' },
    { value: 90, suffix: 's', label: 'Meta OAuth', sub: 'All required scopes, end-to-end' },
    { value: 5, suffix: 's', label: 'GenUI query P95', sub: 'Ranked answer + chart + sources' },
    { value: 99.9, suffix: '%', label: 'availability target', sub: 'Multi-tenant, per-tenant DEK' },
  ]

  const securityRows = [
    {
      icon: ShieldRounded,
      title: 'Per-tenant DEK encryption',
      copy: 'OAuth tokens and lead PII encrypted with a per-tenant data encryption key. System User tokens preferred for stability.',
    },
    {
      icon: VerifiedRounded,
      title: 'Signed, auditable approvals',
      copy: 'Approval links are JWT-signed, single-use, 48h expiry. IP and user-agent logged for every action.',
    },
    {
      icon: LockRounded,
      title: 'Webhook signature verification',
      copy: 'Lead Ads delivered via Meta webhook with signature checks and idempotency on lead_id.',
    },
    {
      icon: BoltRounded,
      title: 'Right-to-erasure & retention',
      copy: 'Configurable retention (default 24 months). Audit log on PII access for 12 months.',
    },
  ]

  // ─── section: hero visual (mocked dashboard with floating cards) ──────────
  const HeroVisual = (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4/3.4',
        maxWidth: 580,
        ml: { md: 'auto' },
      }}
    >
      {/* aura */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: '-12% -8% -8% -12%',
          background: `radial-gradient(60% 60% at 50% 50%, ${alpha(auth.accentFrom, 0.35)} 0%, transparent 70%)`,
          filter: 'blur(20px)',
          animation: 'pxFloat 9s ease-in-out infinite',
        }}
      />

      {/* main panel */}
      <Box
        sx={{
          position: 'absolute',
          inset: '6% 4% 4% 6%',
          borderRadius: '20px',
          background: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.95)} 0%, ${alpha('#FFFFFF', 0.78)} 100%)`,
          border: `1px solid ${alpha('#0F172A', 0.06)}`,
          boxShadow: `0 30px 80px ${alpha('#0F172A', 0.18)}, 0 0 60px ${alpha(auth.accentFrom, 0.1)}`,
          backdropFilter: 'blur(14px)',
          overflow: 'hidden',
          animation: 'pxRiseIn 900ms cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        {/* fake browser chrome */}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            px: 2,
            py: 1.4,
            borderBottom: `1px solid ${alpha('#0F172A', 0.06)}`,
            bgcolor: alpha('#F1F5F9', 0.7),
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#FCA5A5' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#FBBF24' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#34D399' }} />
          <Box
            sx={{
              ml: 1.4,
              px: 1.4,
              py: 0.4,
              borderRadius: 999,
              fontSize: 11,
              color: 'text.secondary',
              bgcolor: alpha('#FFFFFF', 0.8),
              border: `1px solid ${alpha('#0F172A', 0.06)}`,
            }}
          >
            app.photonx.ai/dashboard
          </Box>
        </Stack>

        {/* content */}
        <Box sx={{ p: 2.2 }}>
          <Stack direction="row" spacing={1.4} sx={{ mb: 1.6 }}>
            <Box
              sx={{
                flex: 1,
                p: 1.4,
                borderRadius: 2,
                bgcolor: alpha(auth.accentFrom, 0.08),
                border: `1px solid ${alpha(auth.accentFrom, 0.18)}`,
              }}
            >
              <Typography sx={{ fontSize: 10.5, color: 'text.secondary', fontWeight: 600 }}>
                LEADS THIS WEEK
              </Typography>
              <Typography sx={{ ...gradientText, fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>
                284
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#0EA5B7', fontWeight: 700 }}>+38% vs last</Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                p: 1.4,
                borderRadius: 2,
                bgcolor: alpha('#0F172A', 0.04),
                border: `1px solid ${alpha('#0F172A', 0.06)}`,
              }}
            >
              <Typography sx={{ fontSize: 10.5, color: 'text.secondary', fontWeight: 600 }}>
                AUTO-PUBLISH RATE
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>62%</Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>scored ≥ 8.5/10</Typography>
            </Box>
          </Stack>

          {/* mini chart */}
          <Box
            sx={{
              position: 'relative',
              height: 110,
              borderRadius: 2,
              bgcolor: alpha('#FFFFFF', 0.6),
              border: `1px solid ${alpha('#0F172A', 0.06)}`,
              overflow: 'hidden',
              p: 1,
            }}
          >
            {/* grid */}
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `linear-gradient(${alpha('#0F172A', 0.05)} 1px, transparent 1px)`,
                backgroundSize: '100% 22px',
              }}
            />
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="gline" x1="0" x2="1">
                  <stop offset="0%" stopColor={auth.accentFrom} />
                  <stop offset="100%" stopColor={auth.accentTo} />
                </linearGradient>
                <linearGradient id="garea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={auth.accentFrom} stopOpacity="0.36" />
                  <stop offset="100%" stopColor={auth.accentFrom} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,68 C30,60 50,72 78,52 C108,30 130,58 158,38 C190,18 218,46 246,28 C268,14 282,22 300,16 L300,90 L0,90 Z"
                fill="url(#garea)"
                style={{ animation: 'pxDraw 1500ms ease-out both' }}
              />
              <path
                d="M0,68 C30,60 50,72 78,52 C108,30 130,58 158,38 C190,18 218,46 246,28 C268,14 282,22 300,16"
                fill="none"
                stroke="url(#gline)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="600"
                strokeDashoffset="600"
                style={{ animation: 'pxStroke 1700ms ease-out 200ms forwards' }}
              />
            </svg>
          </Box>

          {/* row of pill tags */}
          <Stack direction="row" spacing={0.8} sx={{ mt: 1.6, flexWrap: 'wrap', rowGap: 0.8 }}>
            {['#OpenAI launch', '#GA today', '#Anthropic', '#shipped'].map((t, i) => (
              <Box
                key={t}
                sx={{
                  px: 1.2,
                  py: 0.4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0EA5B7',
                  borderRadius: 999,
                  bgcolor: alpha(auth.accentFrom, 0.1),
                  border: `1px solid ${alpha(auth.accentFrom, 0.25)}`,
                  animation: `pxPulse 2.2s ease-in-out ${i * 200}ms infinite`,
                }}
              >
                {t}
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* floating "approval" card */}
      <Box
        sx={{
          position: 'absolute',
          left: { xs: '-2%', md: '-8%' },
          bottom: '6%',
          width: { xs: 200, md: 240 },
          p: 1.6,
          borderRadius: 3,
          bgcolor: '#FFFFFF',
          border: `1px solid ${alpha('#0F172A', 0.06)}`,
          boxShadow: `0 18px 40px ${alpha('#0F172A', 0.14)}`,
          animation: 'pxFloat 7s ease-in-out infinite',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.4,
              display: 'grid',
              placeItems: 'center',
              background: accent,
              color: '#fff',
            }}
          >
            <CheckCircleRounded sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 800 }}>Reel approved</Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Score 9.2 / 10</Typography>
          </Box>
        </Stack>
        <Box
          sx={{
            height: 6,
            borderRadius: 999,
            bgcolor: alpha('#0F172A', 0.08),
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: '92%',
              height: '100%',
              background: accent,
              animation: 'pxFill 1500ms ease-out both',
            }}
          />
        </Box>
      </Box>

      {/* floating "lead" card */}
      <Box
        sx={{
          position: 'absolute',
          right: { xs: '-2%', md: '-6%' },
          top: '8%',
          width: { xs: 200, md: 230 },
          p: 1.4,
          borderRadius: 3,
          bgcolor: '#FFFFFF',
          border: `1px solid ${alpha('#0F172A', 0.06)}`,
          boxShadow: `0 18px 40px ${alpha('#0F172A', 0.14)}`,
          animation: 'pxFloat 8s ease-in-out 1s infinite',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: '#34D399',
              boxShadow: `0 0 0 0 ${alpha('#34D399', 0.6)}`,
              animation: 'pxBlink 1.6s ease-in-out infinite',
            }}
          />
          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>New lead — Demo Booked</Typography>
        </Stack>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.4 }}>
          Meta Lead Ad · WhatsApp Automation · ₹1,000/day
        </Typography>
        <Stack direction="row" spacing={0.6} sx={{ mt: 0.8 }}>
          {['attributed', 'utm_track', 'auto-routed'].map((t) => (
            <Box
              key={t}
              sx={{
                px: 0.8,
                py: 0.2,
                fontSize: 9.5,
                fontWeight: 700,
                color: 'text.secondary',
                borderRadius: 999,
                bgcolor: alpha('#0F172A', 0.04),
              }}
            >
              {t}
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  )

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <Box sx={{ bgcolor: theme.palette.background.default, color: 'text.primary', overflow: 'hidden' }}>
      {/* ── nav ── */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: scrolled ? alpha('#FFFFFF', 0.78) : 'transparent',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          borderBottom: scrolled ? `1px solid ${alpha('#0F172A', 0.06)}` : '1px solid transparent',
          color: 'text.primary',
          transition: 'background-color 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease',
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 76 }, gap: 2, position: 'relative' }}>
            <Box component={RouterLink} to="/" sx={{ display: 'inline-flex', alignItems: 'center' }}>
              <img src={logo} alt="PhotonX" style={{ height: 32 }} />
            </Box>

            {/* Nav links – absolutely centered */}
            {isMd && (
              <Stack
                direction="row"
                spacing={1.5}
                sx={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                {navLinks.map((l) => (
                  <Box
                    key={l.href}
                    component="a"
                    href={l.href}
                    sx={{
                      px: 1.2,
                      py: 0.6,
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      color: 'text.secondary',
                      textDecoration: 'none',
                      borderRadius: 999,
                      position: 'relative',
                      transition: 'color 200ms ease',
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        left: 14,
                        right: 14,
                        bottom: 4,
                        height: 2,
                        borderRadius: 2,
                        background: accent,
                        transform: 'scaleX(0)',
                        transformOrigin: 'left',
                        transition: 'transform 260ms ease',
                      },
                      '&:hover': { color: 'text.primary' },
                      '&:hover::after': { transform: 'scaleX(1)' },
                    }}
                  >
                    {l.label}
                  </Box>
                ))}
              </Stack>
            )}

            <Box sx={{ flex: 1 }} />
            {isMd ? (
              <Stack direction="row" spacing={1.2}>
                {/* <Button onClick={goAuth} sx={ctaGhostSx}>
                  Sign in
                </Button> */}
                <Button onClick={goAuth} endIcon={<ArrowForwardRounded />} sx={ctaPrimarySx}>
                  Get started
                </Button>
              </Stack>
            ) : (
              <IconButton onClick={goAuth} sx={{ color: 'text.primary' }}>
                <MenuRounded />
              </IconButton>
            )}
          </Toolbar>
        </Container>
      </AppBar>

      {/* ── HERO ── */}
      <Box
        component="section"
        sx={{
          position: 'relative',
          pt: { xs: 6, md: 10 },
          pb: { xs: 6, md: 10 },
          bgcolor: '#FAFBFF',
          overflow: 'hidden',
        }}
      >
        {/* glowing animated orbs */}
        <Box
          sx={{
            position: 'absolute',
            width: { xs: 300, md: 500 },
            height: { xs: 300, md: 500 },
            borderRadius: '50%',
            background: alpha('#22d3ee', 0.15),
            filter: 'blur(100px)',
            top: '-10%',
            left: '-10%',
            animation: 'pxOrbit 14s infinite ease-in-out',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: { xs: 400, md: 600 },
            height: { xs: 400, md: 600 },
            borderRadius: '50%',
            background: alpha('#22d3ee', 0.12),
            filter: 'blur(120px)',
            bottom: '10%',
            right: '-15%',
            animation: 'pxFloat 10s infinite ease-in-out alternate',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {/* futuristic perspective grid */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {/* line grid with primary color gradient */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              maskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black 20%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black 20%, transparent 70%)',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.25,
                background: `linear-gradient(135deg, ${auth.accentFrom}, ${auth.accentTo})`,
                maskImage: `
                  linear-gradient(black 1px, transparent 1px),
                  linear-gradient(90deg, black 1px, transparent 1px)
                `,
                maskSize: '48px 48px',
                WebkitMaskImage: `
                  linear-gradient(black 1px, transparent 1px),
                  linear-gradient(90deg, black 1px, transparent 1px)
                `,
                WebkitMaskSize: '48px 48px',
              }}
            />
          </Box>
          {/* horizontal scanlines */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: 0.06,
              backgroundImage: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 3px,
                ${alpha('#0F172A', 0.4)} 3px,
                ${alpha('#0F172A', 0.4)} 4px
              )`,
              maskImage: 'linear-gradient(to bottom, transparent 10%, black 40%, black 60%, transparent 90%)',
            }}
          />
        </Box>

        <Container maxWidth="md" sx={{ position: 'relative', textAlign: 'center' }}>
          <Reveal>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
                py: 0.7,
                width: 'fit-content',
                mx: 'auto',
                borderRadius: 999,
                bgcolor: alpha(auth.accentFrom, 0.08),
                border: `1px solid ${alpha(auth.accentFrom, 0.2)}`,
                mb: 2,
              }}
            >
              <SpeedRounded sx={{ fontSize: 16, color: '#0EA5B7' }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0EA5B7', letterSpacing: '0.04em' }}>
                PhotonX GrowthOS
              </Typography>
            </Stack>
          </Reveal>

          <Reveal delay={80}>
            <Typography
              component="h1"
              align="center"
              sx={{
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.05,
                fontSize: { xs: '2.6rem', sm: '3.6rem', md: '4.5rem' },
                mb: 1.5,
                color: '#0F172A',
              }}
            >
              Trends to{' '}
              <Box component="span" sx={{ color: '#22d3ee', display: 'inline' }}>
                Revenue
              </Box>
              <br />
              <Box
                component="span"
                sx={{
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                Automated
              </Box>
            </Typography>
          </Reveal>

          <Reveal delay={160}>
            <Typography
              align="center"
              sx={{
                fontSize: { xs: '0.88rem', md: '0.97rem' },
                color: '#0F172A',
                lineHeight: 1.7,
                maxWidth: 920,
                mx: 'auto',
                mb: 4,
              }}
            >
              PhotonX GrowthOS is the AI marketing operating system that ingests real-time trends, generates viral Reels,
              <br />
              manages Meta ads, and converts leads — end to end, with human approval at every gate.
            </Typography>
          </Reveal>

          <Reveal delay={220}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.6} sx={{ justifyContent: 'center' }}>
              <Button onClick={goAuth} endIcon={<ArrowForwardRounded />} sx={ctaPrimarySx}>
                Start free workspace
              </Button>
              <Button
                onClick={() => {
                  const el = document.getElementById('workflow')
                  el?.scrollIntoView({ behavior: 'smooth' })
                }}
                startIcon={<PlayArrowRounded />}
                sx={ctaGhostSx}
              >
                See how it works
              </Button>
            </Stack>
          </Reveal>

          <Reveal delay={300}>
            <Stack direction="row" spacing={4} sx={{ mt: 6, justifyContent: 'center', flexWrap: 'wrap', rowGap: 1.4 }}>
              {[
                { k: '15 min', v: 'channel → live Reel' },
                { k: '<60 s', v: 'lead → CRM' },
                { k: '<2 min', v: 'brief → live Meta ad' },
              ].map((s) => (
                <Stack key={s.k} direction="row" spacing={1.2} sx={{ alignItems: 'center' }}>
                  <CheckCircleRounded sx={{ color: '#22d3ee', fontSize: 18 }} />
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>{s.k}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {s.v}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Reveal>
        </Container>
      </Box>

      {/* ── trust marquee ── */}
      <Box component="section" id="product" sx={{ pt: { xs: 1, md: 2 }, pb: { xs: 4, md: 5 }, position: 'relative' }}>
        <Container maxWidth="lg">
          <Reveal>
            <Typography
              sx={{
                textAlign: 'center',
                color: '#0F172A',
                fontSize: '0.82rem',
                fontWeight: 700,
                letterSpacing: '0.32em',
                mb: 3,
              }}
            >
              POWERED BY THE SIGNAL FROM
            </Typography>
          </Reveal>

          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
            }}
          >
            <Stack
              direction="row"
              spacing={5}
              sx={{
                width: 'max-content',
                animation: 'pxMarquee 28s linear infinite',
                py: 1,
              }}
            >
              {[
                'OpenAI',
                'Anthropic',
                'xAI',
                'Mistral',
                'Product Hunt',
                'Google Trends',
                'Meta Ads',
                'Instagram',
                'Twitter/X',
                'ElevenLabs',
                'Azure TTS',
                // duplicate for seamless loop
                'OpenAI',
                'Anthropic',
                'xAI',
                'Mistral',
                'Product Hunt',
                'Google Trends',
                'Meta Ads',
                'Instagram',
                'Twitter/X',
                'ElevenLabs',
                'Azure TTS',
              ].map((b, i) => (
                <Typography
                  key={`${b}-${i}`}
                  sx={{
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    color: alpha('#0F172A', 0.45),
                    whiteSpace: 'nowrap',
                    transition: 'color 200ms ease',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {b}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* ── workflow ── */}
      <Box
        component="section"
        id="workflow"
        sx={{
          pt: { xs: 4, md: 6 },
          pb: { xs: 10, md: 14 },
          position: 'relative',
        }}
      >
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', maxWidth: 900, mx: 'auto', mb: 8 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2.5,
                  py: 1,
                  borderRadius: 999,
                  bgcolor: '#FFFFFF',
                  color: '#22d3ee',
                  border: `1px solid ${alpha('#22d3ee', 0.2)}`,
                  boxShadow: `0 4px 12px ${alpha('#22d3ee', 0.1)}`,
                  mb: 3,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                  }}
                >
                  THE LOOP
                </Typography>
              </Box>
              <Typography
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '2rem', md: '2.7rem' },
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  mb: 2,
                  color: '#0F172A',
                }}
              >
                One pipeline from trend to booked demo.
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '1.02rem', lineHeight: 1.6 }}>
                Each step is gated, observable, and reversible. No surprise spend, no rogue publishes, no leaked PII.
              </Typography>
            </Box>
          </Reveal>

          <Grid container spacing={2.5}>
            {workflowSteps.map((s, i) => {
              const Icon = s.icon
              return (
                <Grid key={s.title} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Reveal delay={i * 90}>
                    <Box
                      sx={{
                        position: 'relative',
                        height: '100%',
                        p: 3,
                        borderRadius: 4,
                        bgcolor: '#FFFFFF',
                        border: `1px solid ${alpha('#0F172A', 0.06)}`,
                        boxShadow: `0 8px 26px ${alpha('#0F172A', 0.06)}`,
                        transition: 'transform 320ms cubic-bezier(.2,.8,.2,1), box-shadow 320ms ease, border-color 320ms ease',
                        '&:hover': {
                          transform: 'translateY(-6px)',
                          boxShadow: `0 22px 50px ${alpha('#0F172A', 0.1)}, 0 0 60px ${alpha(
                            auth.accentFrom,
                            0.12,
                          )}`,
                          borderColor: alpha(auth.accentFrom, 0.3),
                        },
                      }}
                    >
                      <Stack direction="row" spacing={1.4} sx={{ alignItems: 'center', mb: 2 }}>
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: alpha('#22d3ee', 0.12),
                            color: '#22d3ee',
                            border: `1px solid ${alpha('#22d3ee', 0.3)}`,
                            boxShadow: `0 8px 22px ${alpha('#22d3ee', 0.1)}`,
                          }}
                        >
                          <Icon />
                        </Box>
                        <Typography sx={{ fontWeight: 800, color: 'text.secondary', fontSize: '0.85rem' }}>
                          STEP 0{i + 1}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.12rem', mb: 0.8, color: '#0F172A' }}>
                        {s.title}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.6 }}>
                        {s.copy}
                      </Typography>


                    </Box>
                  </Reveal>
                </Grid>
              )
            })}
          </Grid>
        </Container>
      </Box>

      {/* ── two engines ── */}
      <Box
        component="section"
        id="engines"
        sx={{
          position: 'relative',
          py: { xs: 10, md: 14 },
          bgcolor: alpha(auth.accentFrom, 0.05),
          borderTop: `1px solid ${alpha('#0F172A', 0.05)}`,
          borderBottom: `1px solid ${alpha('#0F172A', 0.05)}`,
        }}
      >
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', maxWidth: 900, mx: 'auto', mb: 8 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2.5,
                  py: 1,
                  borderRadius: 999,
                  bgcolor: '#FFFFFF',
                  color: '#22d3ee',
                  border: `1px solid ${alpha('#22d3ee', 0.2)}`,
                  boxShadow: `0 4px 12px ${alpha('#22d3ee', 0.1)}`,
                  mb: 3,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                  }}
                >
                  TWO COUPLED ENGINES
                </Typography>
              </Box>
              <Typography
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '2rem', md: '2.7rem' },
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  color: '#0F172A',
                }}
              >
                The growth surface, end to end.
              </Typography>
            </Box>
          </Reveal>

          <Grid container spacing={3}>
            {/* engine 1 */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Reveal>
                <Box
                  sx={{
                    height: '100%',
                    p: { xs: 3, md: 4 },
                    borderRadius: 4,
                    bgcolor: '#FFFFFF',
                    border: `1px solid ${alpha('#0F172A', 0.06)}`,
                    boxShadow: `0 14px 40px ${alpha('#0F172A', 0.06)}`,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 320ms ease, box-shadow 320ms ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: `0 28px 60px ${alpha('#0F172A', 0.12)}`,
                    },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      top: -80,
                      right: -80,
                      width: 240,
                      height: 240,
                      borderRadius: '50%',
                      background: `radial-gradient(circle, ${alpha(auth.accentFrom, 0.18)} 0%, transparent 70%)`,
                    }}
                  />
                  <Stack direction="row" spacing={1.4} sx={{ alignItems: 'center', mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: alpha('#22d3ee', 0.12),
                        color: '#22d3ee',
                        border: `1px solid ${alpha('#22d3ee', 0.3)}`,
                      }}
                    >
                      <GraphicEqRounded />
                    </Box>
                    <Typography sx={{ color: '#475567', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.2em' }}>
                      ENGINE 01
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, mb: 1.4 }}>
                    Trend-to-Video Engine
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mb: 2.6, lineHeight: 1.65 }}>
                    Streams from ~500 AI handles on X, deduplicates by embedding similarity, scores
                    on six axes, and renders Reels with brand intro/outro. Approval is a one-click
                    signed email.
                  </Typography>

                  <Stack spacing={1.4}>
                    {[
                      'X v2 streaming + 15-min recent-search backfill',
                      'Thread reconstruction & engagement-weighted ranking',
                      'Hook · script · VO · scenes · captions · hashtags',
                      '1080×1920 H.264/AAC · 15–45 s · Meta Sound Collection',
                      'JWT-signed Approve / Reject / Regenerate links',
                    ].map((l) => (
                      <Stack key={l} direction="row" spacing={1.2} sx={{ alignItems: 'flex-start' }}>
                        <CheckCircleRounded sx={{ color: '#22d3ee', fontSize: 18, mt: '2px' }} />
                        <Typography sx={{ fontSize: '0.94rem' }}>{l}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Reveal>
            </Grid>

            {/* engine 2 */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Reveal delay={120}>
                <Box
                  sx={{
                    height: '100%',
                    p: { xs: 3, md: 4 },
                    borderRadius: 4,
                    bgcolor: '#FFFFFF',
                    border: `1px solid ${alpha('#0F172A', 0.06)}`,
                    boxShadow: `0 14px 40px ${alpha('#0F172A', 0.06)}`,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 320ms ease, box-shadow 320ms ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: `0 28px 60px ${alpha('#0F172A', 0.12)}`,
                    },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      bottom: -80,
                      left: -80,
                      width: 240,
                      height: 240,
                      borderRadius: '50%',
                      background: `radial-gradient(circle, ${alpha(auth.accentTo, 0.18)} 0%, transparent 70%)`,
                    }}
                  />
                  <Stack direction="row" spacing={1.4} sx={{ alignItems: 'center', mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: alpha('#22d3ee', 0.12),
                        color: '#22d3ee',
                        border: `1px solid ${alpha('#22d3ee', 0.3)}`,
                      }}
                    >
                      <RocketLaunchRounded />
                    </Box>
                    <Typography sx={{ color: '#475567', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.2em' }}>
                      ENGINE 02
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.7rem' }, mb: 1.4 }}>
                    Meta Ads + CRM Intelligence
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mb: 2.6, lineHeight: 1.65 }}>
                    Connect Meta in 90 seconds. Generate ads from a sentence. Push after approval
                    with idempotency. Lead Ads land in the CRM in under a minute, fully attributed.
                  </Typography>

                  <Stack spacing={1.4}>
                    {[
                      'OAuth: ads_management, leads_retrieval, business_management…',
                      '90-day backfill on connect · hourly active sync',
                      'Two-stage publish: PhotonX draft → user → Marketing API',
                      'Lead webhook → CRM in < 60 s with attribution lineage',
                      'GenUI analytics with tool-calling & auto-charts',
                    ].map((l) => (
                      <Stack key={l} direction="row" spacing={1.2} sx={{ alignItems: 'flex-start' }}>
                        <CheckCircleRounded sx={{ color: '#22d3ee', fontSize: 18, mt: '2px' }} />
                        <Typography sx={{ fontSize: '0.94rem' }}>{l}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Reveal>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── feature grid ── */}
      <Box component="section"
        sx={{
          py: { xs: 10, md: 14 },
          pb: "0 !important",
          position: 'relative'
        }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box sx={{ textAlign: 'center', maxWidth: 900, mx: 'auto', mb: 8 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2.5,
                  py: 1,
                  borderRadius: 999,
                  bgcolor: '#FFFFFF',
                  color: '#22d3ee',
                  border: `1px solid ${alpha('#22d3ee', 0.2)}`,
                  boxShadow: `0 4px 12px ${alpha('#22d3ee', 0.1)}`,
                  mb: 3,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                  }}
                >
                  CAPABILITIES
                </Typography>
              </Box>
              <Typography
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '2rem', md: '2.7rem' },
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  mb: 2,
                  color: '#0F172A',
                }}
              >
                Everything the loop needs.
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '1.02rem', lineHeight: 1.6 }}>
                Production-grade defaults, tunable per channel and per tenant.
              </Typography>
            </Box>
          </Reveal>

          <Grid container spacing={2.5} sx={{ alignItems: 'stretch' }}>
            {featureCards.map((f, i) => {
              const Icon = f.icon
              return (
                <Grid key={f.title} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex' }}>
                  <Reveal delay={i * 70} style={{ width: '100%', display: 'flex' }}>
                    <Box
                      sx={{
                        position: 'relative',
                        height: '100%',
                        p: 3,
                        borderRadius: 4,
                        bgcolor: '#FFFFFF',
                        border: `1px solid ${alpha('#0F172A', 0.06)}`,
                        overflow: 'hidden',
                        transition: 'transform 320ms cubic-bezier(.2,.8,.2,1), border-color 320ms ease, box-shadow 320ms ease',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 'inherit',
                          padding: '1px',
                          background: `linear-gradient(135deg, ${alpha(auth.accentFrom, 0)} 0%, ${alpha(
                            auth.accentFrom,
                            0,
                          )} 100%)`,
                          WebkitMask:
                            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                          WebkitMaskComposite: 'xor',
                          maskComposite: 'exclude',
                          pointerEvents: 'none',
                          transition: 'background 320ms ease',
                        },
                        '&:hover': {
                          transform: 'translateY(-6px)',
                          boxShadow: `0 22px 50px ${alpha('#0F172A', 0.1)}`,
                        },
                        '&:hover::before': {
                          background: `linear-gradient(135deg, ${alpha(auth.accentFrom, 0.6)} 0%, ${alpha(
                            auth.accentTo,
                            0.2,
                          )} 100%)`,
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 46,
                          height: 46,
                          borderRadius: 2,
                          display: 'grid',
                          placeItems: 'center',
                          color: '#22d3ee',
                          bgcolor: alpha('#22d3ee', 0.12),
                          border: `1px solid ${alpha('#22d3ee', 0.3)}`,
                          mb: 2,
                          transition: 'transform 300ms ease',
                          'div:hover > &': { transform: 'rotate(-6deg) scale(1.05)' },
                        }}
                      >
                        <Icon />
                      </Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.08rem', mb: 0.8, color: '#0F172A' }}>
                        {f.title}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.6 }}>
                        {f.copy}
                      </Typography>
                    </Box>
                  </Reveal>
                </Grid>
              )
            })}
          </Grid>
        </Container>
      </Box>

      {/* ── KPI strip ── */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 }, position: 'relative' }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box
              sx={{
                position: 'relative',
                p: { xs: 3, md: 5 },
                borderRadius: 5,
                overflow: 'hidden',
                background: `linear-gradient(135deg, ${alpha(auth.accentFrom, 0.16)} 0%, ${alpha(
                  '#FFFFFF',
                  0.6,
                )} 50%, ${alpha(auth.accentTo, 0.16)} 100%)`,
                border: `1px solid ${alpha(auth.accentFrom, 0.22)}`,
                boxShadow: `0 30px 80px ${alpha('#0F172A', 0.08)}`,
              }}
            >
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `radial-gradient(circle at 30% 20%, ${alpha(auth.accentFrom, 0.18)} 0%, transparent 40%), radial-gradient(circle at 80% 80%, ${alpha(
                    auth.accentTo,
                    0.16,
                  )} 0%, transparent 40%)`,
                  pointerEvents: 'none',
                }}
              />

              <Grid container spacing={3} sx={{ position: 'relative' }}>
                {kpis.map((k, i) => (
                  <Grid key={k.label} size={{ xs: 6, md: 3 }}>
                    <Reveal delay={i * 100}>
                      <Box sx={{ textAlign: { xs: 'left', md: 'center' } }}>
                        <Typography
                          sx={{
                            ...gradientText,
                            fontWeight: 800,
                            fontSize: { xs: '2.2rem', md: '3rem' },
                            lineHeight: 1,
                          }}
                        >
                          <Counter to={k.value} suffix={k.suffix} />
                        </Typography>
                        <Typography sx={{ fontWeight: 500, mt: 1, fontSize: '0.98rem', color: '#0F172A' }}>
                          {k.label}
                        </Typography>
                        <Typography sx={{ color: '#0F172A', fontSize: '0.84rem', mt: 0.3, opacity: 0.6 }}>
                          {k.sub}
                        </Typography>
                      </Box>
                    </Reveal>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Reveal>
        </Container>
      </Box>

      {/* ── security ── */}
      <Box
        component="section"
        id="security"
        sx={{
          py: { xs: 10, md: 14 },
          bgcolor: alpha('#0F172A', 0.02),
          borderTop: `1px solid ${alpha('#0F172A', 0.05)}`,
          borderBottom: `1px solid ${alpha('#0F172A', 0.05)}`,
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={6} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Reveal>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 2.5,
                    py: 1,
                    borderRadius: 999,
                    bgcolor: '#FFFFFF',
                    color: '#22d3ee',
                    border: `1px solid ${alpha('#22d3ee', 0.2)}`,
                    boxShadow: `0 4px 12px ${alpha('#22d3ee', 0.1)}`,
                    mb: 3,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      letterSpacing: '0.2em',
                    }}
                  >
                    SECURITY & TRUST
                  </Typography>
                </Box>
                <Typography
                  component="h2"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: '2rem', md: '2.6rem' },
                    letterSpacing: '-0.025em',
                    lineHeight: 1.1,
                    mb: 2.2,
                    color: '#0F172A',
                  }}
                >
                  Multi-tenant by default. Audit-ready by design.
                </Typography>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 3 }}>
                  PhotonX is built for teams that ship under compliance scrutiny. Every approval is signed, every webhook is verified, and every PII access is logged for 12 months.
                </Typography>
                <Button onClick={goAuth} sx={ctaPrimarySx} endIcon={<ArrowForwardRounded />}>
                  Talk to us
                </Button>
              </Reveal>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
                {securityRows.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <Grid key={s.title} size={{ xs: 12, sm: 6 }} sx={{ display: 'flex' }}>
                      <Reveal delay={i * 80} style={{ width: '100%', display: 'flex' }}>
                        <Box
                          sx={{
                            p: 2.6,
                            height: '100%',
                            borderRadius: 3,
                            bgcolor: '#FFFFFF',
                            border: `1px solid ${alpha('#0F172A', 0.06)}`,
                            transition: 'transform 320ms ease, box-shadow 320ms ease',
                            '&:hover': {
                              transform: 'translateY(-4px)',
                              boxShadow: `0 18px 40px ${alpha('#0F172A', 0.08)}`,
                            },
                          }}
                        >
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: 1.6,
                              display: 'grid',
                              placeItems: 'center',
                              color: '#22d3ee',
                              bgcolor: alpha('#22d3ee', 0.12),
                              border: `1px solid ${alpha('#22d3ee', 0.3)}`,
                              mb: 1.4,
                            }}
                          >
                            <Icon fontSize="small" />
                          </Box>
                          <Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: '0.98rem', mb: 0.6 }}>
                            {s.title}
                          </Typography>
                          <Typography sx={{ fontSize: '0.86rem', color: 'text.secondary', lineHeight: 1.55 }}>
                            {s.copy}
                          </Typography>
                        </Box>
                      </Reveal>
                    </Grid>
                  )
                })}
              </Grid>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── final CTA ── */}
      <Box component="section" sx={{ py: { xs: 10, md: 14 }, position: 'relative' }}>
        <Container maxWidth="lg">
          <Reveal>
            <Box
              sx={{
                position: 'relative',
                p: { xs: 4, md: 7 },
                borderRadius: 6,
                overflow: 'hidden',
                textAlign: 'center',
                background: `linear-gradient(135deg, #0F2C33 0%, #082B33 60%, #062228 100%)`,
                color: '#F0FDFF',
                boxShadow: `0 40px 100px ${alpha('#0F172A', 0.4)}`,
              }}
            >
              {/* glow blobs */}
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: -120,
                  left: -120,
                  width: 360,
                  height: 360,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${alpha(auth.accentFrom, 0.5)} 0%, transparent 70%)`,
                  filter: 'blur(8px)',
                  animation: 'pxOrbit 16s ease-in-out infinite',
                }}
              />
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  bottom: -120,
                  right: -120,
                  width: 360,
                  height: 360,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${alpha(auth.accentTo, 0.4)} 0%, transparent 70%)`,
                  filter: 'blur(8px)',
                  animation: 'pxOrbit 20s ease-in-out reverse infinite',
                }}
              />
              <Box sx={{ position: 'relative' }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 2.5,
                    py: 1,
                    borderRadius: 999,
                    bgcolor: '#FFFFFF',
                    color: '#22d3ee',
                    border: `1px solid ${alpha('#22d3ee', 0.2)}`,
                    boxShadow: `0 4px 12px ${alpha('#22d3ee', 0.1)}`,
                    mb: 3,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      letterSpacing: '0.2em',
                    }}
                  >
                    READY WHEN YOU ARE
                  </Typography>
                </Box>
                <Typography
                  component="h2"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.05,
                    fontSize: { xs: '2.2rem', md: '3.2rem' },
                    mb: 2.2,
                    color: '#FFFFFF',
                  }}
                >
                  Your AI growth team, on autopilot.
                </Typography>
                <Typography
                  sx={{
                    color: alpha('#F0FDFF', 0.75),
                    fontSize: '1.05rem',
                    lineHeight: 1.65,
                    maxWidth: 900,
                    mx: 'auto',
                    mb: 4,
                  }}
                >
                  Spin up a workspace in under a minute. Connect Meta in 90 seconds. Watch your first scored Reel go live the same afternoon.
                </Typography>
                <Box direction={{ xs: 'column', sm: 'row' }} spacing={1.6} justifyContent="center">
                  <Button onClick={goAuth} sx={ctaPrimarySx} endIcon={<ArrowForwardRounded />}>
                    Create your workspace
                  </Button>
                  {/* <Button
                    onClick={goAuth}
                    sx={{
                      ...ctaGhostSx,
                      color: '#F0FDFF',
                      bgcolor: alpha('#FFFFFF', 0.08),
                      borderColor: alpha('#FFFFFF', 0.2),
                      '&:hover': {
                        bgcolor: alpha('#FFFFFF', 0.14),
                        borderColor: alpha('#FFFFFF', 0.36),
                      },
                    }}
                  >
                    Sign in
                  </Button> */}
                </Box>
              </Box>
            </Box>
          </Reveal>
        </Container>
      </Box>

      {/* ── footer ── */}
      <Box
        component="footer"
        sx={{
          py: 5,
          borderTop: `1px solid ${alpha('#0F172A', 0.06)}`,
          bgcolor: alpha('#FFFFFF', 0.6),
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'center',
            }}
          >
            <Stack direction="row" spacing={1.4} sx={{ alignItems: 'center' }}>
              <img src={logo} alt="PhotonX" style={{ height: 26 }} />
              <Typography sx={{ fontSize: '0.86rem', color: 'text.secondary' }}>
                © {new Date().getFullYear()} PhotonX GrowthOS — Virlo. All rights reserved.
              </Typography>
            </Stack>

          </Stack>
        </Container>
      </Box>
    </Box>
  )
}

export default LandingPage;
