import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { alpha } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import {
  adsApi,
  qk,
  type CampaignSummary,
  type MetaAd,
  type MetaInsightsRow,
  type MetaActionStat,
  type MetaDatePreset,
} from '../../api'
import { ApiError } from '../../api/client'
import { GlassCard } from '../ui/GlassCard'
import { StatusBadge } from './StatusBadge'

const PRESET_OPTIONS: { value: MetaDatePreset; label: string }[] = [
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

const tip = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
  color: '#FAFAFA',
}

function fmtMoney(amount: string | number | null | undefined, currency: string | null) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount))
  if (!Number.isFinite(n)) return '—'
  const code = currency || 'USD'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${code}`
  }
}

function fmtCompact(n: string | number | null | undefined) {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

function fmtNumber(n: string | number | null | undefined) {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(v)
}

function fmtPct(n: string | number | null | undefined) {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}%`
}

function actionValue(actions: MetaActionStat[] | undefined, types: string[]): number {
  if (!actions) return 0
  let sum = 0
  for (const a of actions) {
    if (types.includes(a.action_type)) {
      const n = typeof a.value === 'number' ? a.value : parseFloat(String(a.value ?? ''))
      if (Number.isFinite(n)) sum += n
    }
  }
  return sum
}

function summarizeResults(actions: MetaActionStat[] | undefined) {
  const leads = actionValue(actions, ['lead', 'onsite_conversion.lead_grouped'])
  const messaging = actionValue(actions, ['onsite_conversion.messaging_conversation_started_7d'])
  const purchases = actionValue(actions, ['purchase'])
  const registrations = actionValue(actions, ['complete_registration'])
  const link_clicks = actionValue(actions, ['link_click'])
  const total = leads + messaging + purchases + registrations
  return { leads, messaging, purchases, registrations, link_clicks, total }
}

function rankingLabel(s?: string | null) {
  if (!s) return null
  const v = s.replace(/_/g, ' ').toLowerCase()
  return v.charAt(0).toUpperCase() + v.slice(1)
}

function rankingColor(s?: string | null) {
  if (!s) return 'default' as const
  if (/below_average_below_35|low/i.test(s)) return 'error' as const
  if (/below_average/i.test(s)) return 'warning' as const
  if (/average/i.test(s)) return 'default' as const
  if (/above_average/i.test(s)) return 'success' as const
  return 'default' as const
}

type Props = {
  open: boolean
  onClose: () => void
  campaign: CampaignSummary | null
  fallbackCurrency?: string | null
}

export function AdInsightsDrawer({ open, onClose, campaign, fallbackCurrency }: Props) {
  const [preset, setPreset] = useState<MetaDatePreset>('last_28d')
  const [selectedAd, setSelectedAd] = useState<MetaAd | null>(null)

  const metaCampaignId = campaign?.meta_campaign_id || null

  const adsQuery = useQuery({
    queryKey: qk.metaCampaignAds(metaCampaignId ?? '__none__', preset),
    queryFn: () => adsApi.getMetaCampaignAds(metaCampaignId as string, { date_preset: preset }),
    enabled: open && !!metaCampaignId,
    staleTime: 60_000,
    retry: false,
  })

  const handlePresetChange = (e: SelectChangeEvent<MetaDatePreset>) => {
    setPreset(e.target.value as MetaDatePreset)
  }

  const handleClose = () => {
    setSelectedAd(null)
    onClose()
  }

  const currency = adsQuery.data?.account?.currency ?? fallbackCurrency ?? null

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 560, md: 720 },
            maxWidth: '100vw',
            bgcolor: (t) => alpha(t.palette.background.default, 1),
            backgroundImage: 'none',
          },
        },
      }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            {selectedAd ? (
              <Tooltip title="Back to ads">
                <IconButton size="small" onClick={() => setSelectedAd(null)}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                {selectedAd ? 'Ad insights' : 'Campaign ads'}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap title={selectedAd?.name || campaign?.name || ''}>
                {selectedAd?.name || campaign?.name || 'Campaign'}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="ad-drawer-range">Date range</InputLabel>
              <Select<MetaDatePreset>
                labelId="ad-drawer-range"
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
            <Tooltip title="Refresh">
              <IconButton
                size="small"
                onClick={() => (selectedAd ? null : adsQuery.refetch())}
                disabled={adsQuery.isFetching}
              >
                {adsQuery.isFetching ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          {selectedAd ? (
            <SingleAdInsights ad={selectedAd} preset={preset} currency={currency} />
          ) : (
            <AdsList
              isLoading={adsQuery.isLoading}
              error={adsQuery.error}
              ads={adsQuery.data?.ads ?? []}
              currency={currency}
              campaignSynced={!!metaCampaignId}
              onSelect={(ad) => setSelectedAd(ad)}
              onRefresh={() => adsQuery.refetch()}
            />
          )}
        </Box>
      </Stack>
    </Drawer>
  )
}

// === Ads list view ===

function AdsList({
  isLoading,
  error,
  ads,
  currency,
  campaignSynced,
  onSelect,
  onRefresh,
}: {
  isLoading: boolean
  error: unknown
  ads: MetaAd[]
  currency: string | null
  campaignSynced: boolean
  onSelect: (ad: MetaAd) => void
  onRefresh: () => void
}) {
  if (!campaignSynced) {
    return (
      <Alert severity="info">
        This campaign hasn't been synced with Meta yet. Hit "Sync" on the campaign card first to
        pull live data.
      </Alert>
    )
  }
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    )
  }
  if (error) {
    const apiErr = error instanceof ApiError ? error : null
    if (apiErr?.status === 401) {
      return (
        <Alert severity="warning" action={<Button color="inherit" size="small" href="/ads/setup">Reconnect</Button>}>
          Your Meta connection has expired. Reconnect to load ads.
        </Alert>
      )
    }
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={onRefresh}>Retry</Button>}>
        {apiErr?.message || (error instanceof Error ? error.message : 'Failed to load ads.')}
      </Alert>
    )
  }
  if (ads.length === 0) {
    return (
      <Alert severity="info">No ads under this campaign yet, or none with insights in this date range.</Alert>
    )
  }

  // Sort by spend desc — most active ads first.
  const sorted = [...ads].sort((a, b) => {
    const sa = parseFloat(String(a.insights?.data?.[0]?.spend ?? 0))
    const sb = parseFloat(String(b.insights?.data?.[0]?.spend ?? 0))
    return (Number.isFinite(sb) ? sb : 0) - (Number.isFinite(sa) ? sa : 0)
  })

  return (
    <Stack spacing={1.5}>
      {sorted.map((ad) => (
        <AdRow key={ad.id} ad={ad} currency={currency} onClick={() => onSelect(ad)} />
      ))}
    </Stack>
  )
}

function AdRow({
  ad,
  currency,
  onClick,
}: {
  ad: MetaAd
  currency: string | null
  onClick: () => void
}) {
  const row = ad.insights?.data?.[0]
  const results = useMemo(() => summarizeResults(row?.actions), [row?.actions])
  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url || null

  return (
    <GlassCard
      onClick={onClick}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'stretch' }}>
        <Box
          sx={{
            width: 84,
            height: 84,
            flexShrink: 0,
            borderRadius: 1.5,
            overflow: 'hidden',
            bgcolor: (t) => alpha(t.palette.action.hover, 0.5),
            border: '1px solid',
            borderColor: 'divider',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {thumb ? (
            <img src={thumb} alt={ad.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Typography variant="caption" color="text.secondary">
              No preview
            </Typography>
          )}
        </Box>

        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap title={ad.name}>
              {ad.name}
            </Typography>
            <StatusBadge status={ad.status} effectiveStatus={ad.effective_status} />
          </Stack>

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Metric label="Spend" value={fmtMoney(row?.spend, currency)} />
            <Metric label="Impr." value={fmtCompact(row?.impressions)} />
            <Metric label="Clicks" value={fmtCompact(row?.clicks)} />
            <Metric label="CTR" value={row?.ctr ? fmtPct(row.ctr) : '—'} />
            <Metric label="CPC" value={fmtMoney(row?.cpc, currency)} />
            <Metric label="Results" value={fmtNumber(results.total)} />
          </Stack>
        </Stack>
      </Stack>
    </GlassCard>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  )
}

// === Single-ad detail view ===

function SingleAdInsights({
  ad,
  preset,
  currency,
}: {
  ad: MetaAd
  preset: MetaDatePreset
  currency: string | null
}) {
  // Ad-level daily time series. Uses /ads/meta-ads/:id/insights — same endpoint
  // the AdsManager parity panel uses, with `time_increment=1` always set
  // server-side.
  const insightsQuery = useQuery({
    queryKey: qk.metaAdInsights(ad.id, { date_preset: preset }),
    queryFn: () => adsApi.getMetaAdInsights(ad.id, { date_preset: preset }),
    enabled: !!ad.id,
    staleTime: 60_000,
    retry: false,
  })

  // Aggregate row from the embedded insights response on the ads list call
  // (Meta sums actions across the period for us).
  const summaryRow = ad.insights?.data?.[0]
  const summary = useMemo(() => summarizeResults(summaryRow?.actions), [summaryRow?.actions])

  const dailyRowsData = insightsQuery.data
  const trend = useMemo(() => {
    const rows: MetaInsightsRow[] = dailyRowsData ?? []
    return [...rows]
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))
      .map((r) => {
        const r2 = summarizeResults(r.actions)
        return {
          date: r.date_start ?? '',
          spend: parseFloat(r.spend ?? '0'),
          clicks: parseInt(r.clicks ?? '0', 10),
          results: r2.total,
        }
      })
  }, [dailyRowsData])

  const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url || null
  const adsManagerUrl = `https://www.facebook.com/adsmanager/manage/ads?selected_ad_ids=${ad.id}`

  return (
    <Stack spacing={2}>
      {/* Header card with creative + meta */}
      <GlassCard sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Box
            sx={{
              width: { xs: '100%', sm: 140 },
              aspectRatio: '1 / 1',
              flexShrink: 0,
              borderRadius: 1.5,
              overflow: 'hidden',
              bgcolor: (t) => alpha(t.palette.action.hover, 0.5),
              border: '1px solid',
              borderColor: 'divider',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {thumb ? (
              <img src={thumb} alt={ad.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Typography variant="caption" color="text.secondary">
                No preview
              </Typography>
            )}
          </Box>
          <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={ad.status} effectiveStatus={ad.effective_status} />
              {summaryRow?.quality_ranking && summaryRow.quality_ranking !== 'UNKNOWN' ? (
                <Chip
                  size="small"
                  label={`Quality · ${rankingLabel(summaryRow.quality_ranking)}`}
                  color={rankingColor(summaryRow.quality_ranking)}
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              ) : null}
              {summaryRow?.engagement_rate_ranking && summaryRow.engagement_rate_ranking !== 'UNKNOWN' ? (
                <Chip
                  size="small"
                  label={`Engagement · ${rankingLabel(summaryRow.engagement_rate_ranking)}`}
                  color={rankingColor(summaryRow.engagement_rate_ranking)}
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              ) : null}
            </Stack>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {ad.name}
            </Typography>
            {ad.creative?.instagram_permalink_url ? (
              <Button
                size="small"
                href={ad.creative.instagram_permalink_url}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<OpenInNewIcon fontSize="small" />}
                sx={{ alignSelf: 'flex-start' }}
              >
                View on Instagram
              </Button>
            ) : null}
            <Button
              size="small"
              href={adsManagerUrl}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start' }}
            >
              Open in Ads Manager
            </Button>
          </Stack>
        </Stack>
      </GlassCard>

      {/* KPI grid */}
      <Grid container spacing={1.5}>
        <KPI label="Spend" value={fmtMoney(summaryRow?.spend, currency)} />
        <KPI label="Impressions" value={fmtCompact(summaryRow?.impressions)} />
        <KPI label="Reach" value={fmtCompact(summaryRow?.reach)} />
        <KPI label="Clicks" value={fmtCompact(summaryRow?.clicks)} />
        <KPI label="CTR" value={summaryRow?.ctr ? fmtPct(summaryRow.ctr) : '—'} />
        <KPI label="CPC" value={fmtMoney(summaryRow?.cpc, currency)} />
        <KPI label="CPM" value={fmtMoney(summaryRow?.cpm, currency)} />
        <KPI label="Frequency" value={summaryRow?.frequency ? Number(summaryRow.frequency).toFixed(2) : '—'} />
      </Grid>

      {/* Results breakdown */}
      <GlassCard sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Results breakdown
        </Typography>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
          <Metric label="Total results" value={fmtNumber(summary.total)} />
          <Metric label="Leads" value={fmtNumber(summary.leads)} />
          <Metric label="Messages" value={fmtNumber(summary.messaging)} />
          <Metric label="Purchases" value={fmtNumber(summary.purchases)} />
          <Metric label="Sign-ups" value={fmtNumber(summary.registrations)} />
          <Metric label="Link clicks" value={fmtNumber(summary.link_clicks)} />
        </Stack>
      </GlassCard>

      {/* Daily trend */}
      <GlassCard sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Daily trend
        </Typography>
        {insightsQuery.isLoading ? (
          <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : insightsQuery.error ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {insightsQuery.error instanceof Error
              ? insightsQuery.error.message
              : 'Failed to load daily insights.'}
          </Alert>
        ) : trend.length === 0 ? (
          <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No daily data in this range yet.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="date" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(Number(v))} />
                <ChartTooltip
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
          </Box>
        )}
      </GlassCard>
    </Stack>
  )
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 6, sm: 3 }}>
      <GlassCard sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      </GlassCard>
    </Grid>
  )
}

export default AdInsightsDrawer
