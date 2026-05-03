import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import { Link as RouterLink } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import {
  ANALYTICS_DATE_PRESETS,
  analyticsApi,
  qk,
  type AnalyticsDatePreset,
  type AnalyticsTopAd,
} from '../api'
import { ApiError } from '../api/client'
import { ChartCard } from '../components/ui/ChartCard'
import { GlassCard } from '../components/ui/GlassCard'
import { KPICard } from '../components/ui/KPICard'
import { PageHeader } from '../components/ui/PageHeader'

// Match the existing pages' grayscale-on-white palette.
const seriesColors = ['#FAFAFA', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#404040', '#262626']

const tip = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
  color: '#FAFAFA',
}

const PRESET_OPTIONS: { value: AnalyticsDatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_28d', label: 'Last 28 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'maximum', label: 'All time' },
]

// Defensive helper — if backend ever returns a preset we don't show in the
// dropdown (e.g. last_3d), it'll still pass the type guard but we won't crash.
const ALLOWED_PRESETS = new Set<string>(ANALYTICS_DATE_PRESETS)

function fmtMoney(n: number | null | undefined, currency: string | null) {
  if (n == null || !Number.isFinite(n)) return '—'
  const code = currency || 'USD'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
    }).format(n)
  } catch {
    // Unknown currency code — fall back to plain number with code suffix
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)} ${code}`
  }
}

function fmtCompact(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function fmtNumber(n: number | null | undefined, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n)
}

function fmtPct(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function truncate(s: string, max = 24) {
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
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

function NotConnected() {
  return (
    <GlassCard glow sx={{ p: 4 }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start', maxWidth: 520 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Connect a Meta ad account
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Analytics pulls live insights from the Meta Marketing API. Connect your ad account to see
          spend, results, and per-platform performance across all your campaigns.
        </Typography>
        <Button component={RouterLink} to="/ads/setup" variant="contained" color="primary">
          Connect Meta account
        </Button>
      </Stack>
    </GlassCard>
  )
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<AnalyticsDatePreset>('last_28d')

  const range = useMemo(() => ({ date_preset: preset }), [preset])

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: qk.analyticsDashboard(range),
    queryFn: () => analyticsApi.getDashboard(range),
    // 60s — covers a typical user clicking around between tabs without
    // hammering Meta on every focus.
    staleTime: 60_000,
  })

  const handlePresetChange = (e: SelectChangeEvent<AnalyticsDatePreset>) => {
    const v = String(e.target.value)
    if (ALLOWED_PRESETS.has(v)) setPreset(v as AnalyticsDatePreset)
  }

  // Top ads — separate query so the dashboard renders even if /ads/top fails
  // (e.g. token expired only on the second call, which shouldn't happen but
  // we don't want a single failing endpoint to nuke the whole page).
  const topAdsQuery = useQuery({
    queryKey: qk.analyticsTopAds({ date_preset: preset, limit: 8 }),
    queryFn: () => analyticsApi.getTopAds({ date_preset: preset, limit: 8 }),
    enabled: !!data?.hasAccount,
    staleTime: 60_000,
    retry: false,
  })

  const errorMessage =
    error instanceof Error
      ? error.message
      : error
      ? 'Could not load analytics.'
      : null

  // Token-expired / unauthorized — present a focused reconnect CTA instead of
  // the generic error alert, since this is the most common failure mode.
  const tokenExpired = error instanceof ApiError && error.status === 401
  const noAccountConnected =
    error instanceof ApiError && error.status === 400 && /no.*account/i.test(error.message)

  if (isLoading) {
    return (
      <Stack spacing={3}>
        <PageHeader
          title="Analytics"
          subtitle="Live performance from your connected Meta ad account."
        />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      </Stack>
    )
  }

  if (tokenExpired || noAccountConnected) {
    return (
      <Stack spacing={3}>
        <PageHeader
          title="Analytics"
          subtitle="Live performance from your connected Meta ad account."
        />
        <Alert
          severity="warning"
          action={
            <Button component={RouterLink} to="/ads/setup" color="inherit" size="small">
              {tokenExpired ? 'Reconnect' : 'Connect'}
            </Button>
          }
        >
          {tokenExpired
            ? 'Your Meta connection has expired. Reconnect to refresh analytics.'
            : 'No Meta ad account connected yet.'}
        </Alert>
      </Stack>
    )
  }

  if (errorMessage && !data) {
    return (
      <Stack spacing={3}>
        <PageHeader
          title="Analytics"
          subtitle="Live performance from your connected Meta ad account."
        />
        <Alert
          severity="error"
          action={
            <Button onClick={() => refetch()} color="inherit" size="small" startIcon={<RefreshIcon />}>
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      </Stack>
    )
  }

  if (data && !data.hasAccount) {
    return (
      <Stack spacing={3}>
        <PageHeader
          title="Analytics"
          subtitle="Live performance from your connected Meta ad account."
        />
        <NotConnected />
      </Stack>
    )
  }

  const totals = data?.totals
  const currency = data?.currency ?? null
  const trend = data?.trend ?? []
  const campaignBars = data?.campaignBars ?? []
  const topCampaigns = data?.topCampaigns ?? []
  const platformBreakdown = data?.platformBreakdown ?? []
  const placementBreakdown = (data?.placementBreakdown ?? []).slice(0, 8)
  const demographicBreakdown = data?.demographicBreakdown ?? []
  const ctwaSources = data?.ctwaSources ?? []
  const sectionErrors = data?.sectionErrors ?? {}

  const accountLabel =
    data?.adAccount?.name ?? (data?.adAccount?.id ? `Account ${data.adAccount.id}` : 'Meta ad account')

  const summaryText =
    data && data.hasData && totals
      ? `${fmtMoney(totals.spend, currency)} spent · ${fmtCompact(totals.impressions)} impressions · ${fmtCompact(totals.clicks)} clicks · ${fmtCompact(totals.results)} results.`
      : 'No insights data in this range yet — try a wider window or run a campaign.'

  const recommendation = (() => {
    if (!totals || !data?.hasData) {
      return 'Once a campaign starts spending, this panel surfaces actionable suggestions based on CTR, CPC and result rate.'
    }
    if (totals.cpc != null && totals.cpc > 5) {
      return `Average CPC is ${fmtMoney(totals.cpc, currency)} — narrow targeting or test new creative angles before scaling.`
    }
    if (totals.ctr != null && totals.ctr < 0.8) {
      return `CTR is ${fmtPct(totals.ctr)} — refresh hooks or thumbnails to lift attention before adding spend.`
    }
    if (totals.results === 0 && totals.clicks > 50) {
      return `${fmtCompact(totals.clicks)} clicks but no tracked results — verify your conversion event setup.`
    }
    return `${fmtCompact(totals.results)} results at ${
      totals.cpc != null ? fmtMoney(totals.cpc, currency) : '—'
    } per click. Consider lifting daily budget on the top campaigns.`
  })()

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Analytics"
        subtitle={`Live performance for ${accountLabel}.`}
        action={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="analytics-range">Date range</InputLabel>
              <Select<AnalyticsDatePreset>
                labelId="analytics-range"
                label="Date range"
                value={preset}
                onChange={handlePresetChange}
              >
                {PRESET_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      {errorMessage && data ? (
        <Alert severity="warning">{errorMessage}</Alert>
      ) : null}

      {Object.keys(sectionErrors).length > 0 ? (
        <Alert severity="info">
          Some sections couldn't load: {Object.keys(sectionErrors).join(', ')}. The rest of the data
          is below.
        </Alert>
      ) : null}

      {data && !data.hasData ? (
        <Alert severity="info">
          No insights from Meta in this window. Pick a wider range, or create a campaign in the Ads
          tab and let it run.
        </Alert>
      ) : null}

      {/* === KPI tiles === */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="Spend" value={fmtMoney(totals?.spend ?? 0, currency)} glow />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="Impressions" value={fmtCompact(totals?.impressions ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="Reach" value={fmtCompact(totals?.reach ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="Clicks" value={fmtCompact(totals?.clicks ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="CTR" value={fmtPct(totals?.ctr ?? 0)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="CPC" value={fmtMoney(totals?.cpc ?? null, currency)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="CPM" value={fmtMoney(totals?.cpm ?? null, currency)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard title="Results" value={fmtCompact(totals?.results ?? 0)} />
        </Grid>
      </Grid>

      {/* === Spend trend + summary side card === */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCard
            title="Daily performance"
            subtitle={`${fmtCompact(totals?.impressions ?? 0)} impressions · ${fmtCompact(totals?.clicks ?? 0)} clicks · ${fmtCompact(totals?.results ?? 0)} results`}
          >
            {trend.length === 0 ? (
              <ChartEmpty message="No daily insights in range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                  <XAxis dataKey="date" stroke="#737373" tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value, name) => {
                      if (name === 'spend') return [fmtMoney(Number(value ?? 0), currency), 'Spend']
                      if (name === 'clicks') return [fmtCompact(Number(value ?? 0)), 'Clicks']
                      if (name === 'results') return [fmtCompact(Number(value ?? 0)), 'Results']
                      return [String(value), String(name)]
                    }}
                  />
                  <Line type="monotone" dataKey="spend" stroke="#0F172A" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="#737373" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="results" stroke="#22D3EE" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <GlassCard glow sx={{ p: 2.5, flex: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                <AutoAwesomeOutlinedIcon fontSize="small" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Summary
                </Typography>
              </Stack>
              <Typography variant="body1" color="text.secondary">
                {summaryText}
              </Typography>
            </GlassCard>
            <GlassCard sx={{ p: 2.5, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>
                Recommendation
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {recommendation}
              </Typography>
            </GlassCard>
          </Stack>
        </Grid>
      </Grid>

      {/* === Campaigns + platform === */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Spend by campaign" subtitle="Top campaigns in period">
            {campaignBars.length === 0 ? (
              <ChartEmpty message="No campaigns spent in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={campaignBars.map((b) => ({ ...b, label: truncate(b.name, 22) }))}
                  margin={{ top: 8, right: 8, left: -16, bottom: 8 }}
                >
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={72}
                  />
                  <YAxis
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value) => [fmtMoney(Number(value ?? 0), currency), 'Spend']}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { name?: string } | undefined
                      return row?.name ?? ''
                    }}
                  />
                  <Bar dataKey="spend" radius={[8, 8, 0, 0]}>
                    {campaignBars.map((_, i) => (
                      <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Platform split" subtitle="Spend share by Meta surface">
            {platformBreakdown.length === 0 ? (
              <ChartEmpty message="No platform breakdown for this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={platformBreakdown}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" horizontal={false} />
                  <XAxis type="number" stroke="#737373" tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" stroke="#737373" width={120} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value, _, payload) => {
                      const row = payload?.payload as { spend?: number } | undefined
                      return [
                        `${value}% · ${fmtMoney(row?.spend ?? 0, currency)}`,
                        'Share',
                      ]
                    }}
                  />
                  <Bar dataKey="share" radius={[0, 8, 8, 0]}>
                    {platformBreakdown.map((_, i) => (
                      <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
      </Grid>

      {/* === Placement + age × gender === */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Top placements" subtitle="Spend by publisher × position">
            {placementBreakdown.length === 0 ? (
              <ChartEmpty message="No placement breakdown in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={placementBreakdown.map((p) => ({ ...p, label: truncate(p.name, 24) }))}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#737373"
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <YAxis type="category" dataKey="label" stroke="#737373" width={140} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value) => [fmtMoney(Number(value ?? 0), currency), 'Spend']}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { name?: string } | undefined
                      return row?.name ?? ''
                    }}
                  />
                  <Bar dataKey="spend" radius={[0, 8, 8, 0]}>
                    {placementBreakdown.map((_, i) => (
                      <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Audience" subtitle="Impressions by age × gender">
            {demographicBreakdown.length === 0 ? (
              <ChartEmpty message="No demographic data in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={demographicBreakdown.map((d) => ({
                    ...d,
                    label: `${d.age} · ${d.gender}`,
                  }))}
                  margin={{ top: 8, right: 8, left: -16, bottom: 8 }}
                >
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={72}
                  />
                  <YAxis
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value, name) => {
                      if (name === 'spend') return [fmtMoney(Number(value ?? 0), currency), 'Spend']
                      return [fmtCompact(Number(value ?? 0)), String(name)]
                    }}
                  />
                  <Bar dataKey="impressions" fill={seriesColors[2]} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
      </Grid>

      {/* === Top ads grid === */}
      <ChartCard title="Top ads" subtitle="Highest spend ads in period" cardSx={{ minHeight: 320 }}>
        <TopAdsList
          isLoading={topAdsQuery.isLoading}
          ads={topAdsQuery.data?.ads ?? []}
          currency={currency}
          error={topAdsQuery.error instanceof Error ? topAdsQuery.error.message : null}
        />
      </ChartCard>

      {/* === Top campaigns table === */}
      {topCampaigns.length > 0 ? (
        <GlassCard sx={{ p: 0, overflow: 'auto' }}>
          <Box sx={{ p: 2.5 }}>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              Campaign performance
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ display: 'block' }}>
              Per-campaign metrics in selected window
            </Typography>
          </Box>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Campaign</TableCell>
                <TableCell align="right">Spend</TableCell>
                <TableCell align="right">Impr.</TableCell>
                <TableCell align="right">Clicks</TableCell>
                <TableCell align="right">CTR</TableCell>
                <TableCell align="right">CPC</TableCell>
                <TableCell align="right">CPM</TableCell>
                <TableCell align="right">Results</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topCampaigns.map((c) => (
                <TableRow key={c.campaign_id} hover>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {c.campaign_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{fmtMoney(c.spend, currency)}</TableCell>
                  <TableCell align="right">{fmtCompact(c.impressions)}</TableCell>
                  <TableCell align="right">{fmtNumber(c.clicks)}</TableCell>
                  <TableCell align="right">{fmtPct(c.ctr)}</TableCell>
                  <TableCell align="right">{fmtMoney(c.cpc, currency)}</TableCell>
                  <TableCell align="right">{fmtMoney(c.cpm, currency)}</TableCell>
                  <TableCell align="right">{fmtNumber(c.results)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </GlassCard>
      ) : null}

      {/* === CTWA referral sources (only when present) === */}
      {ctwaSources.length > 0 ? (
        <ChartCard title="WhatsApp conversation sources" subtitle="CTWA referrals (share of conversations)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={ctwaSources}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke="#262626" strokeDasharray="4 8" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 'dataMax']}
                stroke="#737373"
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#737373"
                width={120}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={tip} formatter={(value) => [`${Number(value ?? 0)}%`, 'Share']} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {ctwaSources.map((_, i) => (
                  <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
    </Stack>
  )
}

function TopAdsList({
  isLoading,
  ads,
  currency,
  error,
}: {
  isLoading: boolean
  ads: AnalyticsTopAd[]
  currency: string | null
  error: string | null
}) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', height: '100%', alignItems: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    )
  }
  if (error) {
    return <ChartEmpty message={`Couldn't load top ads: ${error}`} />
  }
  if (ads.length === 0) {
    return <ChartEmpty message="No ads with spend in this range." />
  }
  return (
    <Box sx={{ overflow: 'auto', height: '100%' }}>
      <Grid container spacing={2}>
        {ads.map((ad) => (
          <Grid key={ad.ad_id} size={{ xs: 12, sm: 6, md: 3 }}>
            <GlassCard sx={{ p: 1.5, height: '100%' }}>
              <Stack spacing={1} sx={{ height: '100%' }}>
                <Box
                  sx={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    bgcolor: (t) => alpha(t.palette.action.hover, 0.6),
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {ad.thumbnail_url ? (
                    <img
                      src={ad.thumbnail_url}
                      alt={ad.ad_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No preview
                    </Typography>
                  )}
                </Box>
                <Stack spacing={0.5} sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={ad.ad_name}>
                    {ad.ad_name}
                  </Typography>
                  {ad.campaign_name ? (
                    <Typography variant="caption" color="text.secondary" noWrap title={ad.campaign_name}>
                      {ad.campaign_name}
                    </Typography>
                  ) : null}
                  <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {fmtMoney(ad.spend, currency)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtPct(ad.ctr)} CTR
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtNumber(ad.results)} results
                    </Typography>
                  </Stack>
                </Stack>
                {ad.instagram_permalink_url ? (
                  <Button
                    component="a"
                    href={ad.instagram_permalink_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    View on Instagram
                  </Button>
                ) : null}
              </Stack>
            </GlassCard>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
