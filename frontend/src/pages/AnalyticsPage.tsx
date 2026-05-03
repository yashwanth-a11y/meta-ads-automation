import { Alert, Box, CircularProgress, Grid, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
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
import { analyticsApi, qk } from '../api'
import { ChartCard } from '../components/ui/ChartCard'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

const pieColors = ['#FAFAFA', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#404040', '#262626']

const tip = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n)
}

function fmtCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function truncateLabel(s: string, max = 22) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {message}
      </Typography>
    </Box>
  )
}

export function AnalyticsPage() {
  const days = 28
  const { data, isLoading, error } = useQuery({
    queryKey: qk.analyticsDashboard(days),
    queryFn: () => analyticsApi.getDashboard(days),
  })

  const rangeSubtitle = data
    ? `Last ${data.range.days} days · synced Meta insights + CTWA conversations`
    : 'Trailing efficiency from synced campaign insights'

  const weekly = data?.weeklyPerformance ?? []
  const bars = data?.campaignBars ?? []
  const pieData = data?.leadSources ?? []

  const insightBody =
    data && data.hasData
      ? `${fmtMoney(data.totals.spend)} spend, ${fmtCompact(data.totals.impressions)} impressions, ${fmtCompact(data.totals.clicks)} clicks in range. ${data.totals.ctwa_conversations_in_period} WhatsApp conversations attributed by referral source.`
      : data && !data.hasData
        ? 'No synced insights or conversations in this window yet. Open Ads, sync a campaign, or wait for CTWA traffic.'
        : 'Loading organization metrics…'

  let recommendation =
    'When spend is live, compare cost per conversation across campaigns and double down on angles that start chats efficiently.'
  if (data?.hasData && data.totals.clicks > 20 && data.totals.messaging_conversations_from_insights < data.totals.clicks * 0.02) {
    recommendation =
      'Clicks are outpacing messaging conversations from insights — refresh hooks or opening messages so more sessions become WhatsApp chats.'
  } else if (data?.hasData && data.totals.avg_cpc != null && data.totals.avg_cpc > 3) {
    recommendation = `Average CPC is ${fmtMoney(data.totals.avg_cpc)} — tighten placements or creative testing before scaling further.`
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Analytics"
        subtitle="Multi-view performance from your Meta CTWA mirror — spend, campaigns, and conversation sources."
      />

      {error ? (
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Could not load analytics.'}
        </Alert>
      ) : null}

      {data && !data.hasData && !isLoading ? (
        <Alert severity="info">
          No analytics in this period. Sync campaigns under Ads so daily insights populate, and ensure CTWA webhooks are delivering
          conversations.
        </Alert>
      ) : null}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCard title="Spend trend" subtitle={rangeSubtitle}>
            {weekly.length === 0 ? (
              <ChartEmpty message="No daily insights in range. Sync campaigns from the Ads page." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                  <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value) => [fmtMoney(Number(value ?? 0)), 'Spend']}
                  />
                  <Line type="monotone" dataKey="v" stroke="#FAFAFA" strokeWidth={2} dot={false} />
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
                {insightBody}
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

        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Spend by campaign" subtitle="Top campaigns in period">
            {bars.length === 0 || bars.every((b) => b.spend <= 0) ? (
              <ChartEmpty message="No campaign spend in insights cache for this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bars.map((b) => ({ ...b, label: truncateLabel(b.name) }))}
                  margin={{ top: 8, right: 8, left: -16, bottom: 8 }}
                >
                  <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                  <XAxis dataKey="label" stroke="#737373" tickLine={false} axisLine={false} interval={0} angle={-28} textAnchor="end" height={72} />
                  <YAxis
                    stroke="#737373"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtCompact(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value) => [fmtMoney(Number(value ?? 0)), 'Spend']}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { name?: string } | undefined
                      return row?.name ?? ''
                    }}
                  />
                  <Bar dataKey="spend" radius={[8, 8, 0, 0]}>
                    {bars.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={1}>
            <ChartCard title="Conversation sources" subtitle="CTWA referrals (share of conversations)">
              {pieData.length === 0 ? (
                <ChartEmpty message="No WhatsApp conversations with referral metadata in this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pieData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#262626" strokeDasharray="4 8" horizontal={false} />
                    <XAxis type="number" domain={[0, 'dataMax']} stroke="#737373" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" stroke="#737373" width={120} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tip} formatter={(value) => [`${Number(value ?? 0)}%`, 'Share']} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            {pieData.length > 0 ? (
              <Stack direction="row" sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
                {pieData.map((p, i) => (
                  <Stack key={p.name} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: pieColors[i % pieColors.length],
                        boxShadow: `0 0 0 1px ${alpha('#000', 0.4)}`,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {p.name} · {p.value}%
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Grid>
      </Grid>
      )}
    </Stack>
  )
}
