import { alpha } from '@mui/material/styles'
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined'
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import { analyticsApi, trendsApi } from '../api'
import { crmApi } from '../api/crm'
import {
  instagramApi,
  type InstagramAccount,
  type InstagramMediaItem,
} from '../api/instagram'
import { qk } from '../api/queryClient'
import { ApiError } from '../api/client'
import { ChartCard } from '../components/ui/ChartCard'
import { GlassCard } from '../components/ui/GlassCard'
import { KPICard } from '../components/ui/KPICard'
import { PageHeader } from '../components/ui/PageHeader'

// ─── Design tokens (matching AnalyticsPage.tsx treatment) ─────────────────────

const GRAY_LADDER = ['#FAFAFA', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#404040', '#262626']
const CYAN = '#22D3EE'

const tip = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
  color: '#FAFAFA',
}

const IG_GRADIENT =
  'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined, currency: string | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const code = currency || 'USD'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
    }).format(n)
  } catch {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)} ${code}`
  }
}

function fmtCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

// Short date label for trend X-axis (e.g. "Apr 3")
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

// Relative time for lead created_at (e.g. "3d ago")
function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch {
    return '—'
  }
}

function truncate(s: string, max = 28): string {
  if (!s) return ''
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

// ─── Small shared components ───────────────────────────────────────────────────

function ValueSkeleton() {
  return <Skeleton variant="rounded" height={32} width={90} sx={{ borderRadius: 1 }} />
}

function InlineSkeleton({ width = 60 }: { width?: number }) {
  return <Skeleton variant="rounded" height={14} width={width} sx={{ borderRadius: 1 }} />
}

function SectionError({ message }: { message: string }) {
  return (
    <Alert severity="error" sx={{ borderRadius: '8px', fontSize: 13 }}>
      {message}
    </Alert>
  )
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {message}
      </Typography>
    </Box>
  )
}

// ─── Section: no Meta account connected ───────────────────────────────────────

function NoAccountHero() {
  return (
    <GlassCard glow sx={{ p: { xs: 3, md: 5 } }}>
      <Stack spacing={2.5} sx={{ alignItems: 'flex-start', maxWidth: 540 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(CYAN, 0.1),
            border: `1px solid ${alpha(CYAN, 0.25)}`,
          }}
        >
          <LinkOffOutlinedIcon sx={{ color: CYAN, fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#0F172A', mb: 0.5 }}>
            Connect your Meta Ads account
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Connect a Meta ad account to see spend, results, CTR and per-campaign breakdown
            right here on the dashboard.
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/ads/setup"
          variant="contained"
          color="primary"
          size="large"
        >
          Connect Meta account
        </Button>
      </Stack>
    </GlassCard>
  )
}

// ─── Section: KPI strip skeletons ─────────────────────────────────────────────

function KpiStripSkeleton() {
  return (
    <Grid container spacing={2}>
      {[0, 1, 2, 3].map((i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
          <GlassCard sx={{ p: 2.5, height: '100%' }}>
            <Skeleton variant="rounded" height={14} width={80} sx={{ mb: 1.5, borderRadius: 1 }} />
            <Skeleton variant="rounded" height={32} width={110} sx={{ mb: 1, borderRadius: 1 }} />
            <Skeleton variant="rounded" height={12} width={60} sx={{ borderRadius: 1 }} />
          </GlassCard>
        </Grid>
      ))}
    </Grid>
  )
}

// ─── Section: Spend trend chart ────────────────────────────────────────────────

function SpendTrendChart({
  trend,
  currency,
  isLoading,
  sectionError,
}: {
  trend: Array<{ date: string; spend: number; clicks: number; results: number }>
  currency: string | null
  isLoading: boolean
  sectionError?: string
}) {
  if (sectionError) return <SectionError message={`Daily trend: ${sectionError}`} />

  const trendWithLabel = trend.map((p) => ({ ...p, label: shortDate(p.date) }))

  return (
    <ChartCard
      title="Spend over time"
      subtitle="Daily spend · clicks · results (last 28 days)"
      glow
    >
      {isLoading ? (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={32} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : trendWithLabel.length === 0 ? (
        <ChartEmpty message="No daily data in this window." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendWithLabel} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CYAN} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 8" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#737373"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#737373"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v) => fmtCount(Number(v))}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(value, name) => {
                if (name === 'spend') return [fmtMoney(Number(value), currency), 'Spend']
                if (name === 'clicks') return [fmtCount(Number(value)), 'Clicks']
                if (name === 'results') return [fmtCount(Number(value)), 'Results']
                return [String(value), String(name)]
              }}
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke={CYAN}
              strokeWidth={2.5}
              fill="url(#spendGrad)"
              dot={false}
              activeDot={{ r: 5, fill: CYAN }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ─── Section: Platform split ───────────────────────────────────────────────────

function PlatformSplitChart({
  breakdown,
  currency,
  isLoading,
  sectionError,
}: {
  breakdown: Array<{ name: string; spend: number; share: number }>
  currency: string | null
  isLoading: boolean
  sectionError?: string
}) {
  if (sectionError) return <SectionError message={`Platform split: ${sectionError}`} />

  return (
    <ChartCard title="Platform split" subtitle="Spend share by Meta surface">
      {isLoading ? (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={28} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : !breakdown || breakdown.length === 0 ? (
        <ChartEmpty message="No platform breakdown for this range." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={breakdown}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          >
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 8" horizontal={false} />
            <XAxis
              type="number"
              stroke="#737373"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#737373"
              width={110}
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(value, _, payload) => {
                const row = payload?.payload as { spend?: number } | undefined
                return [`${value}% · ${fmtMoney(row?.spend ?? 0, currency)}`, 'Share']
              }}
            />
            <Bar dataKey="share" radius={[0, 8, 8, 0]}>
              {breakdown.map((row, i) => (
                <Cell
                  key={row.name}
                  fill={i === 0 ? CYAN : GRAY_LADDER[Math.min(i + 1, GRAY_LADDER.length - 1)]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ─── Section: Signal strip (channels, IG reach, lead velocity) ─────────────────

function SignalStrip({
  channelCount,
  autoPublishCount,
  igFollowers,
  igAccountCount,
  leadTotal,
  leadsThisWeek,
  leadsWoWDelta,
  channelsLoading,
  igLoading,
  leadsLoading,
  channelsError,
  igError,
  leadsError,
}: {
  channelCount: number
  autoPublishCount: number
  igFollowers: number
  igAccountCount: number
  leadTotal: number
  leadsThisWeek: number
  leadsWoWDelta: number
  channelsLoading: boolean
  igLoading: boolean
  leadsLoading: boolean
  channelsError: string | null
  igError: string | null
  leadsError: string | null
}) {
  const tiles = [
    {
      icon: <TuneOutlinedIcon sx={{ color: CYAN, fontSize: 20 }} />,
      label: 'Channels active',
      value: channelsLoading ? <ValueSkeleton /> : channelsError ? '—' : fmtCount(channelCount),
      sub: channelsLoading ? (
        <InlineSkeleton width={100} />
      ) : channelsError ? (
        <Typography variant="caption" color="error.main">{channelsError}</Typography>
      ) : autoPublishCount > 0 ? (
        <Typography variant="caption" color="text.secondary">{autoPublishCount} auto-publishing</Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">all manual approval</Typography>
      ),
    },
    {
      icon: <InstagramIcon sx={{ fontSize: 20, background: IG_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />,
      label: 'Instagram reach',
      value: igLoading ? <ValueSkeleton /> : igError ? '—' : igAccountCount === 0 ? '—' : fmtCount(igFollowers),
      sub: igLoading ? (
        <InlineSkeleton width={90} />
      ) : igError ? (
        <Typography variant="caption" color="error.main">{igError}</Typography>
      ) : igAccountCount === 0 ? (
        <Typography variant="caption" color="text.secondary">
          <RouterLink to="/instagram" style={{ color: 'inherit' }}>Connect Instagram</RouterLink>
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">{igAccountCount} account{igAccountCount !== 1 ? 's' : ''} connected</Typography>
      ),
    },
    {
      icon: <GroupsOutlinedIcon sx={{ color: CYAN, fontSize: 20 }} />,
      label: 'Total leads',
      value: leadsLoading ? <ValueSkeleton /> : leadsError ? '—' : fmtCount(leadTotal),
      sub: leadsLoading ? (
        <InlineSkeleton width={80} />
      ) : leadsError ? (
        <Typography variant="caption" color="error.main">{leadsError}</Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">in CRM pipeline</Typography>
      ),
    },
    {
      icon: <GroupsOutlinedIcon sx={{ color: CYAN, fontSize: 20 }} />,
      label: 'Leads gained',
      value: leadsLoading ? <ValueSkeleton /> : leadsError ? '—' : fmtCount(leadsThisWeek),
      sub: leadsLoading ? (
        <InlineSkeleton width={90} />
      ) : leadsError ? (
        <Typography variant="caption" color="error.main">{leadsError}</Typography>
      ) : leadsThisWeek === 0 && leadsWoWDelta === 0 ? (
        <Typography variant="caption" color="text.secondary">no new leads in 7d</Typography>
      ) : (
        // WoW delta as absolute count: at small N the % is misleading.
        // Sign-prefixed so + and − are scannable at a glance.
        <Typography
          variant="caption"
          sx={{
            color:
              leadsWoWDelta > 0
                ? 'success.main'
                : leadsWoWDelta < 0
                  ? 'error.main'
                  : 'text.secondary',
            fontWeight: 600,
          }}
        >
          {leadsWoWDelta > 0 ? '+' : ''}
          {leadsWoWDelta} vs last 7d
        </Typography>
      ),
    },
  ]

  return (
    <Grid container spacing={2}>
      {tiles.map((tile) => (
        <Grid key={tile.label} size={{ xs: 12, sm: 6, md: 3 }}>
          <GlassCard sx={{ p: 2.5, height: '100%' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: alpha(CYAN, 0.07),
                  border: `1px solid ${alpha(CYAN, 0.15)}`,
                  flexShrink: 0,
                  mt: 0.25,
                }}
              >
                {tile.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  {tile.label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, mb: 0.5 }}>
                  {tile.value}
                </Typography>
                {tile.sub}
              </Box>
            </Stack>
          </GlassCard>
        </Grid>
      ))}
    </Grid>
  )
}

// ─── Section: Recent leads table ───────────────────────────────────────────────

function RecentLeadsTable({
  leads,
  isLoading,
  error,
}: {
  leads: Array<{ id: string; name: string; source: string | null; stage_id: string | null; created_at: string }>
  isLoading: boolean
  error: string | null
}) {
  return (
    <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
              Recent leads
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Last 5 entries across all sources
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/crm"
            size="small"
            variant='contained'
          // sx={{ borderRadius: '6px', textTransform: 'none', fontWeight: 600 }}
          >
            View all
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <SectionError message={error} />
        </Box>
      ) : isLoading ? (
        <Box sx={{ px: 2.5, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={20} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : leads.length === 0 ? (
        <Box sx={{ px: 2.5, pb: 3, pt: 1, textAlign: 'center' }}>
          <GroupsOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No leads yet.
          </Typography>
          <Button component={RouterLink} to="/crm" size="small" variant="text">
            Connect Meta Lead Ads or import a CSV
          </Button>
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary', pl: 2.5 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary' }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary' }}>Added</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  hover
                  sx={{ '&:last-child td': { border: 0 } }}
                >
                  <TableCell sx={{ pl: 2.5, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                      {lead.name}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 1 }}>
                    {lead.source ? (
                      <Chip
                        label={lead.source}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 11,
                          borderRadius: '4px',
                          bgcolor: alpha('#0F172A', 0.06),
                          fontWeight: 500,
                        }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ py: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {relativeTime(lead.created_at)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </GlassCard>
  )
}

// ─── Section: Top campaigns list ──────────────────────────────────────────────

type CampaignRow = {
  campaign_id: string
  campaign_name: string
  spend: number
  results: number
}

function TopCampaignsList({
  campaigns,
  currency,
  isLoading,
  sectionError,
}: {
  campaigns: CampaignRow[]
  currency: string | null
  isLoading: boolean
  sectionError?: string
}) {
  return (
    <GlassCard sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
            Top campaigns
          </Typography>
          <Typography variant="body1" color="text.secondary">
            By spend, last 28 days
          </Typography>
        </Box>
        {/* <CampaignOutlinedIcon sx={{ color: 'text.disabled', fontSize: 20 }} /> */}
      </Stack>

      {sectionError ? (
        <SectionError message={sectionError} />
      ) : isLoading ? (
        <Stack spacing={2}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Box key={i}>
              <Skeleton variant="rounded" height={14} width={160} sx={{ mb: 0.75, borderRadius: 1 }} />
              <Skeleton variant="rounded" height={12} width={220} sx={{ borderRadius: 1 }} />
            </Box>
          ))}
        </Stack>
      ) : campaigns.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="subtitle1" color="text.secondary">
            No campaigns with spend in this window.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={0} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
          {campaigns.slice(0, 5).map((c) => {
            const cpr = c.results > 0 ? c.spend / c.results : null
            return (
              <Box key={c.campaign_id} sx={{ py: 1.5 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, mb: 0.5, color: '#0F172A' }}
                  noWrap
                  title={c.campaign_name}
                >
                  {truncate(c.campaign_name, 36)}
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Box>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                      Spend
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#0F172A' }}>
                      {fmtMoney(c.spend, currency)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                      Results
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#0F172A' }}>
                      {fmtCount(c.results)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                      CPR
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#0F172A' }}>
                      {cpr != null ? fmtMoney(cpr, currency) : '—'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })}
        </Stack>
      )}
    </GlassCard>
  )
}

// ─── Section: Top ads thumbnail grid ──────────────────────────────────────────

type TopAd = {
  ad_id: string
  ad_name: string
  campaign_name: string | null
  thumbnail_url: string | null
  instagram_permalink_url: string | null
  spend: number
  results: number
  ctr: number
}

function TopAdsGrid({
  ads,
  currency,
  isLoading,
}: {
  ads: TopAd[]
  currency: string | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Grid container spacing={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
            <GlassCard sx={{ p: 1.5 }}>
              <Skeleton variant="rounded" sx={{ aspectRatio: '1/1', width: '100%', mb: 1, borderRadius: 1 }} />
              <Skeleton variant="rounded" height={14} sx={{ mb: 0.5, borderRadius: 1 }} />
              <Skeleton variant="rounded" height={12} width={80} sx={{ borderRadius: 1 }} />
            </GlassCard>
          </Grid>
        ))}
      </Grid>
    )
  }

  if (ads.length === 0) return null

  return (
    <GlassCard sx={{ p: 2.5 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25 }}>
        Top creatives
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Highest spend ads, last 28 days
      </Typography>
      <Grid container spacing={2}>
        {ads.slice(0, 4).map((ad) => (
          <Grid key={ad.ad_id} size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              component={ad.instagram_permalink_url ? 'a' : 'div'}
              href={ad.instagram_permalink_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'block',
                textDecoration: 'none',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                bgcolor: alpha('#0F172A', 0.02),
                transition: 'transform 200ms ease, box-shadow 200ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: `0 8px 24px ${alpha('#0F172A', 0.1)}`,
                },
                '&:hover .ad-overlay': { opacity: 1 },
              }}
            >
              <Box sx={{ position: 'relative', aspectRatio: '1/1', overflow: 'hidden' }}>
                {ad.thumbnail_url ? (
                  <img
                    src={ad.thumbnail_url}
                    alt={ad.ad_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: alpha('#0F172A', 0.04),
                    }}
                  >
                    <Typography variant="caption" color="text.disabled">
                      No preview
                    </Typography>
                  </Box>
                )}
                <Box
                  className="ad-overlay"
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    bgcolor: alpha('#0F172A', 0.65),
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    p: 1.5,
                    opacity: 0,
                    transition: 'opacity 200ms ease',
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#FAFAFA', fontWeight: 600, lineHeight: 1.3 }} noWrap>
                    {ad.campaign_name ?? ad.ad_name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: alpha('#FAFAFA', 0.75) }}>
                    {fmtCount(ad.results)} results
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }} noWrap title={ad.ad_name}>
                  {truncate(ad.ad_name, 28)}
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#0F172A' }}>
                    {fmtMoney(ad.spend, currency)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmtPct(ad.ctr, 2)} CTR
                  </Typography>
                </Stack>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    </GlassCard>
  )
}


// ─── Section: Top Instagram posts (organic, ranked by engagement) ─────────────

function TopInstagramPosts({
  posts,
  isLoading,
  hasAccounts,
}: {
  posts: Array<
    InstagramMediaItem & { account: InstagramAccount; _engagement: number }
  >
  isLoading: boolean
  hasAccounts: boolean
}) {
  return (
    <GlassCard sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.25 }}>
            Top Instagram posts
          </Typography>
          <Typography variant="body1" color="text.secondary">
            By likes + comments, across all connected accounts
          </Typography>
        </Box>
        <InstagramIcon
          sx={{
            fontSize: 22,
            background: IG_GRADIENT,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        />
      </Stack>

      {!hasAccounts ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            <RouterLink to="/instagram" style={{ color: 'inherit' }}>
              Connect Instagram
            </RouterLink>{' '}
            to surface your top-performing posts here.
          </Typography>
        </Box>
      ) : isLoading ? (
        <Stack spacing={1.5}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Stack key={i} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Skeleton variant="rounded" width={56} height={56} sx={{ borderRadius: 1.5 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="rounded" height={14} width="40%" sx={{ mb: 0.75, borderRadius: 1 }} />
                <Skeleton variant="rounded" height={12} width="70%" sx={{ borderRadius: 1 }} />
              </Box>
              <Skeleton variant="rounded" height={28} width={64} sx={{ borderRadius: 1 }} />
            </Stack>
          ))}
        </Stack>
      ) : posts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            No posts yet — publish from any account to see them ranked here.
          </Typography>
        </Box>
      ) : (
        <Stack
          spacing={0}
          divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}
        >
          {posts.map((p) => {
            const thumb = p.thumbnail_url || p.media_url
            const captionText = (p.caption || '').replace(/\s+/g, ' ').trim()
            const likes = p.like_count ?? 0
            const comments = p.comments_count ?? 0
            return (
              <Box
                key={p.id}
                component="a"
                href={p.permalink}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1.5,
                  textDecoration: 'none',
                  color: 'inherit',
                  borderRadius: 1,
                  px: 0.5,
                  mx: -0.5,
                  transition: 'background-color 150ms ease',
                  '&:hover': { bgcolor: alpha('#0F172A', 0.02) },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 1.5,
                    bgcolor: 'grey.100',
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : null}
                  {p.media_type === 'VIDEO' || p.media_product_type === 'REELS' ? (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(0,0,0,0.18)',
                        color: 'white',
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10 }}>
                        {p.media_product_type === 'REELS' ? 'REEL' : 'VIDEO'}
                      </Typography>
                    </Box>
                  ) : null}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" color="text.secondary">
                    @{p.account.ig_username || 'account'}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ color: '#0F172A', mt: 0.25, lineHeight: 1.4 }}
                    title={captionText}
                  >
                    {captionText ? truncate(captionText, 70) : <em style={{ color: '#94A3B8' }}>No caption</em>}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
                      Likes
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#0F172A' }}>
                      {fmtCount(likes)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
                      Comments
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#0F172A' }}>
                      {fmtCount(comments)}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })}
        </Stack>
      )}
    </GlassCard>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  // All queries fire in parallel — TanStack Query deduplicates by cache key.
  const analyticsDashboardQuery = useQuery({
    queryKey: qk.analyticsDashboard({ date_preset: 'last_28d' }),
    queryFn: () => analyticsApi.getDashboard({ date_preset: 'last_28d' }),
    staleTime: 60_000,
  })

  const topAdsQuery = useQuery({
    queryKey: qk.analyticsTopAds({ date_preset: 'last_28d', limit: 4 }),
    queryFn: () => analyticsApi.getTopAds({ date_preset: 'last_28d', limit: 4 }),
    // Only fetch when we know an account is connected to avoid a 400 round-trip.
    enabled: analyticsDashboardQuery.data?.hasAccount === true,
    staleTime: 60_000,
    retry: false,
  })

  const channelsQuery = useQuery({
    queryKey: qk.channels,
    queryFn: trendsApi.listChannels,
    staleTime: 60_000,
  })

  // Fetch a larger window so we can both render the recent-leads table (top 5)
  // AND compute "leads gained this week" + WoW delta client-side, with a single
  // round-trip. 100 leads × WoW comparison covers ~14d for any sane lead volume.
  const leadsQuery = useQuery({
    queryKey: qk.crmLeads({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_dir: 'desc',
    }),
    queryFn: () =>
      crmApi.listLeads({
        page: 1,
        page_size: 100,
        sort_by: 'created_at',
        sort_dir: 'desc',
      }),
    staleTime: 60_000,
  })

  const igQuery = useQuery({
    queryKey: ['instagram', 'accounts'] as const,
    queryFn: instagramApi.listAccounts,
    staleTime: 60_000,
    retry: false,
  })

  const igAccountsForQueries = igQuery.data ?? []
  // Fan out — one media query per connected IG account, all in parallel. We
  // ask for 25 most-recent posts per account (Graph default page) which is
  // far more than we need to surface a top-5 ranking by engagement.
  const igMediaQueries = useQueries({
    queries: igAccountsForQueries.map((acc) => ({
      queryKey: ['instagram', 'accounts', acc.id, 'media', 'top-dashboard'] as const,
      queryFn: () => instagramApi.getMedia(acc.id, { limit: 25 }),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  })

  // ── Derived values ──────────────────────────────────────────────────────────

  const dash = analyticsDashboardQuery.data
  const currency = dash?.currency ?? null
  const totals = dash?.totals ?? null
  const trend = dash?.trend ?? []
  const platformBreakdown = dash?.platformBreakdown ?? []
  const topCampaigns = dash?.topCampaigns ?? []
  const sectionErrors = dash?.sectionErrors ?? {}

  const channels = channelsQuery.data ?? []
  const autoPublishCount = channels.filter(
    (ch) => ch.approval_mode === 'auto' && ch.auto_publish_threshold !== '',
  ).length

  const igAccounts = igQuery.data ?? []
  const igFollowers = igAccounts.reduce((sum, acc) => sum + acc.followers_count, 0)

  const leads = leadsQuery.data?.data ?? []
  const leadTotal = leadsQuery.data?.total ?? 0

  // ── Leads gained — bucket recent leads by 7-day window for WoW delta ───────
  const now = Date.now()
  const DAY = 86_400_000
  const inLastWeek = (iso: string) => {
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && t >= now - 7 * DAY && t <= now
  }
  const inPriorWeek = (iso: string) => {
    const t = new Date(iso).getTime()
    return Number.isFinite(t) && t >= now - 14 * DAY && t < now - 7 * DAY
  }
  const leadsThisWeek = leads.filter((l) => inLastWeek(l.created_at)).length
  const leadsLastWeek = leads.filter((l) => inPriorWeek(l.created_at)).length
  // Delta in absolute terms reads better than % at small N (e.g. 0 → 3 is "+3",
  // not "+infinity%"). The WoW chip stays on whether it's up, down, or flat.
  const leadsWoWDelta = leadsThisWeek - leadsLastWeek

  // ── Top Instagram posts — combine media across accounts, rank by engagement ─
  type RankedIgPost = InstagramMediaItem & {
    account: InstagramAccount
    _engagement: number
  }
  const igMediaLoading = igMediaQueries.some((q) => q.isLoading)
  const allIgPosts: RankedIgPost[] = igMediaQueries.flatMap((q, i) => {
    const items = q.data?.data ?? []
    const acc = igAccountsForQueries[i]
    if (!acc) return []
    return items.map((m) => ({
      ...m,
      account: acc,
      _engagement: (m.like_count ?? 0) + (m.comments_count ?? 0),
    }))
  })
  const topIgPosts = [...allIgPosts]
    .sort((a, b) => b._engagement - a._engagement)
    .slice(0, 5)

  // ── Error parsing ───────────────────────────────────────────────────────────

  const analyticsError =
    analyticsDashboardQuery.error instanceof ApiError
      ? analyticsDashboardQuery.error.message
      : analyticsDashboardQuery.error instanceof Error
        ? analyticsDashboardQuery.error.message
        : analyticsDashboardQuery.error
          ? 'Failed to load analytics.'
          : null

  const channelsError =
    channelsQuery.error instanceof Error ? channelsQuery.error.message : channelsQuery.error ? 'Failed.' : null
  const igError =
    igQuery.error instanceof Error ? igQuery.error.message : igQuery.error ? 'Failed.' : null
  const leadsError =
    leadsQuery.error instanceof Error ? leadsQuery.error.message : leadsQuery.error ? 'Failed.' : null
  const leadsErrorMsg = leadsError
    ? 'Could not load leads.'
    : null

  // ── KPI derivations ─────────────────────────────────────────────────────────
  // results may be 0 even when hasData is true (no configured conversion event).
  // Fall back to sum of sub-conversions to produce a non-zero value if possible.
  const conversions =
    totals == null
      ? null
      : totals.results > 0
        ? totals.results
        : totals.leads + totals.purchases + totals.messaging_conversations

  const costPerResult =
    totals != null && (conversions ?? 0) > 0
      ? totals.spend / (conversions ?? 1)
      : null

  // Dashboard title subtitle: interpolate real channel + account counts.
  const headerSubtitle = (() => {
    const parts: string[] = ['Last 28 days']
    if (!channelsQuery.isLoading && channels.length > 0) {
      parts.push(`${channels.length} channel${channels.length !== 1 ? 's' : ''}`)
    }
    if (!igQuery.isLoading && igAccounts.length > 0) {
      parts.push(`${igAccounts.length} IG account${igAccounts.length !== 1 ? 's' : ''}`)
    }
    return parts.join(' · ')
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  const adsLoading = analyticsDashboardQuery.isLoading
  const adsHasAccount = dash?.hasAccount
  const adsHasData = dash?.hasData

  return (
    <Stack spacing={3}>
      {/* 1. Hero header */}
      <PageHeader
        title="Dashboard"
        subtitle={headerSubtitle}
        action={
          <Chip
            size="small"
            icon={<BoltOutlinedIcon sx={{ fontSize: '14px !important' }} />}
            label="Last 28 days"
            sx={{
              height: 28,
              borderRadius: '999px',
              bgcolor: alpha(CYAN, 0.1),
              border: `1px solid ${alpha(CYAN, 0.25)}`,
              fontWeight: 600,
              fontSize: 12,
              color: '#0891B2',
              px: 0.5,
            }}
          />
        }
      />

      {/* Top-level analytics fetch error (non-404) */}
      {analyticsError && !dash ? (
        <SectionError message={analyticsError} />
      ) : null}

      {/* No account connected — show hero CTA, skip ad sections */}
      {!adsLoading && adsHasAccount === false ? (
        <NoAccountHero />
      ) : null}

      {/* 2. KPI strip — only when account exists */}
      {adsHasAccount === false ? null : adsLoading ? (
        <KpiStripSkeleton />
      ) : !adsHasData && dash ? (
        <Alert severity="info" sx={{ borderRadius: '8px' }}>
          We are collecting your first day of insights — check back tomorrow. Data will appear
          here once your campaigns start delivering.
        </Alert>
      ) : totals != null ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KPICard
              title="Spend"
              value={fmtMoney(totals.spend, currency)}
              delta="last 28 days"
              icon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: 22 }} />}
              glow
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KPICard
              title="Conversions"
              value={fmtCount(conversions)}
              delta={
                totals.results > 0
                  ? `${fmtCount(totals.leads)} leads · ${fmtCount(totals.purchases)} purchases`
                  : 'results across objectives'
              }
              icon={<GroupsOutlinedIcon sx={{ fontSize: 22 }} />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KPICard
              title="CTR"
              value={fmtPct(totals.ctr, 2)}
              delta={`${fmtCount(totals.impressions)} impressions`}
              icon={<PercentOutlinedIcon sx={{ fontSize: 22 }} />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KPICard
              title="Cost per result"
              value={costPerResult != null ? fmtMoney(costPerResult, currency) : '—'}
              delta={`${fmtCount(totals.clicks)} clicks total`}
              icon={<TuneOutlinedIcon sx={{ fontSize: 22 }} />}
            />
          </Grid>
        </Grid>
      ) : null}

      {/* 3. Spend trend + platform split (only when account + data exist) */}
      {adsHasAccount !== false && (adsLoading || (adsHasData && dash)) ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <SpendTrendChart
              trend={trend}
              currency={currency}
              isLoading={adsLoading}
              sectionError={sectionErrors.daily?.message}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <PlatformSplitChart
              breakdown={platformBreakdown}
              currency={currency}
              isLoading={adsLoading}
              sectionError={sectionErrors.platform?.message}
            />
          </Grid>
        </Grid>
      ) : null}

      {/* 4. Signal strip — channels, IG reach, lead velocity */}
      <SignalStrip
        channelCount={channels.length}
        autoPublishCount={autoPublishCount}
        igFollowers={igFollowers}
        igAccountCount={igAccounts.length}
        leadTotal={leadTotal}
        leadsThisWeek={leadsThisWeek}
        leadsWoWDelta={leadsWoWDelta}
        channelsLoading={channelsQuery.isLoading}
        igLoading={igQuery.isLoading}
        leadsLoading={leadsQuery.isLoading}
        channelsError={channelsError}
        igError={igError}
        leadsError={leadsError}
      />

      {/* 5. Recent leads + top campaigns */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <RecentLeadsTable
            leads={leads.slice(0, 5)}
            isLoading={leadsQuery.isLoading}
            error={leadsErrorMsg}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <TopCampaignsList
            campaigns={topCampaigns}
            currency={currency}
            isLoading={adsLoading}
            sectionError={sectionErrors.campaigns?.message}
          />
        </Grid>
      </Grid>

      {/* 6. Top Instagram posts — organic, ranked by likes + comments */}
      <TopInstagramPosts
        posts={topIgPosts}
        isLoading={igQuery.isLoading || (igAccounts.length > 0 && igMediaLoading)}
        hasAccounts={igAccounts.length > 0}
      />

      {/* 7. Top creatives grid (paid) — only when ads exist */}
      {adsHasAccount !== false && !adsLoading ? (
        <TopAdsGrid
          ads={topAdsQuery.data?.ads ?? []}
          currency={currency}
          isLoading={topAdsQuery.isLoading && !!adsHasAccount}
        />
      ) : null}
    </Stack>
  )
}
