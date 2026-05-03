import { Grid, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ui/ChartCard'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

const performance = [
  { name: 'W1', v: 320 },
  { name: 'W2', v: 402 },
  { name: 'W3', v: 378 },
  { name: 'W4', v: 458 },
]

const adsBars = [
  { name: 'TOFU', a: 120 },
  { name: 'MOFU', a: 210 },
  { name: 'BOFU', a: 164 },
]

const pieData = [
  { name: 'Meta', value: 42 },
  { name: 'Search', value: 28 },
  { name: 'Organic', value: 18 },
  { name: 'Partner', value: 12 },
]

const pieColors = ['#FAFAFA', '#D4D4D4', '#A3A3A3', '#737373']

const tip = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
}

export function AnalyticsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Analytics"
        subtitle="Multi-view performance with AI-authored commentary — tuned for executive scans."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCard title="Performance" subtitle="Trailing efficiency curve">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#FAFAFA"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <GlassCard glow sx={{ p: 2.5, flex: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                <AutoAwesomeOutlinedIcon fontSize="small" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Insight
                </Typography>
              </Stack>
              <Typography variant="body1" color="text.secondary">
                Creative refresh cadence is outpacing audience fatigue — maintain +15% weekly net-new
                angles to hold CPA band.
              </Typography>
            </GlassCard>
            <GlassCard sx={{ p: 2.5, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>
                Recommendation
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Shift 12% budget from broad prospecting to ascension retargeting while hooks emphasize
                proof density.
              </Typography>
            </GlassCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Ads breakdown" subtitle="Spend-weighted outcomes">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adsBars} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="a" radius={[8, 8, 0, 0]}>
                  {adsBars.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Lead sources" subtitle="Attributed pipeline mix">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={68}
                  outerRadius={100}
                  paddingAngle={4}
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} />
              </PieChart>
            </ResponsiveContainer>
            <Stack direction="row" sx={{ mt: -2, flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              {pieData.map((p, i) => (
                <Stack key={p.name} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: pieColors[i],
                      boxShadow: `0 0 0 1px ${alpha('#000', 0.4)}`,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {p.name} · {p.value}%
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </ChartCard>
        </Grid>
      </Grid>
    </Stack>
  )
}
