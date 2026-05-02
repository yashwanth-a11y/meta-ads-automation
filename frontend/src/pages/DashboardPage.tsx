import { alpha } from '@mui/material/styles'
import { Box, Chip, Grid, LinearProgress, Stack, Typography } from '@mui/material'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ui/ChartCard'
import { KPICard } from '../components/ui/KPICard'
import { PageHeader } from '../components/ui/PageHeader'

const lineData = [
  { name: 'Mon', value: 420 },
  { name: 'Tue', value: 510 },
  { name: 'Wed', value: 480 },
  { name: 'Thu', value: 620 },
  { name: 'Fri', value: 590 },
  { name: 'Sat', value: 710 },
  { name: 'Sun', value: 680 },
]

const barData = [
  { name: 'Brand', conv: 240 },
  { name: 'Prospecting', conv: 310 },
  { name: 'Retarget', conv: 190 },
  { name: 'Ascension', conv: 270 },
]

const chartTooltipStyle = {
  backgroundColor: '#111',
  border: '1px solid #262626',
  borderRadius: 8,
  fontSize: 12,
}

const stripData = [
  { label: 'Spend efficiency', value: '82%', progress: 82, trend: '+4.2%' },
  { label: 'Creative velocity', value: '19/day', progress: 68, trend: '+11.0%' },
  { label: 'Reply SLA', value: '6m', progress: 91, trend: '+2.1%' },
]

export function DashboardPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Overview"
        subtitle="Real-time signal across acquisition, creative throughput, and funnel conversion."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: '8px',
              border: `1px solid ${alpha('#FFFFFF', 0.1)}`,
              bgcolor: alpha('#FFFFFF', 0.03),
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: -80,
                background:
                  'conic-gradient(from 180deg, rgba(34,211,238,0.22), rgba(255,255,255,0.14), transparent 60%)',
                filter: 'blur(28px)',
                animation: 'dashboardSweep 7s linear infinite',
              },
              '@keyframes dashboardSweep': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.2}
              sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, position: 'relative', zIndex: 1 }}
            >
              <Chip
                icon={<TrendingUpOutlinedIcon />}
                label="Pipeline acceleration mode"
                sx={{
                  borderRadius: '999px',
                  bgcolor: alpha('#22D3EE', 0.15),
                  border: `1px solid ${alpha('#22D3EE', 0.3)}`,
                  fontWeight: 700,
                }}
              />
              <Typography variant="body2" color="text.secondary">
                Live optimization is active across 12 ad sets with stable CPA and rising conversion quality.
              </Typography>
            </Stack>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: '8px',
              border: `1px solid ${alpha('#FFFFFF', 0.1)}`,
              bgcolor: alpha('#FFFFFF', 0.03),
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <BoltOutlinedIcon sx={{ color: '#22D3EE', fontSize: 18 }} />
              <Typography variant="caption" color="text.secondary">
                Sync pulse
              </Typography>
            </Stack>
            <Typography variant="h4" sx={{ mt: 0.5 }}>
              99.3%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              channels healthy in the last 24h
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {stripData.map((item) => (
          <Grid key={item.label} size={{ xs: 12, md: 4 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: '8px',
                border: `1px solid ${alpha('#FFFFFF', 0.08)}`,
                bgcolor: alpha('#FFFFFF', 0.02),
                transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: alpha('#22D3EE', 0.5),
                  boxShadow: `0 10px 30px ${alpha('#000', 0.35)}`,
                },
              }}
            >
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
                <Chip
                  size="small"
                  label={item.trend}
                  sx={{
                    height: 22,
                    borderRadius: '999px',
                    bgcolor: alpha('#22D3EE', 0.14),
                    color: '#67E8F9',
                    fontWeight: 700,
                  }}
                />
              </Stack>
              <Typography variant="h5" sx={{ mb: 1.2 }}>
                {item.value}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={item.progress}
                sx={{
                  height: 8,
                  borderRadius: 999,
                  bgcolor: alpha('#FFFFFF', 0.08),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 999,
                    background: '#22D3EE',
                    // background: 'linear-gradient(90deg, #22D3EE, #FFFFFF)',
                  },
                }}
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Total Leads"
            value="12,480"
            delta="+12.4% vs last week"
            glow
            icon={<GroupsOutlinedIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Active Campaigns"
            value="38"
            delta="6 scaling · 12 learning"
            icon={<CampaignOutlinedIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Content Generated"
            value="642"
            delta="+48 drafts today"
            icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Conversion Rate"
            value="3.8%"
            delta="+0.6 pts WoW"
            icon={<PercentOutlinedIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <ChartCard title="Performance over time" subtitle="Blended CPA and pipeline velocity" glow>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'transparent' }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22D3EE"
                  strokeWidth={2.5}
                  dot={{ fill: '#22D3EE', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                  animationDuration={900}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <ChartCard
            title="Campaign comparison"
            subtitle="Attributed conversions by initiative"
            cardSx={{
              '&:hover': {
                transform: 'none',
                borderColor: alpha('#FFFFFF', 0.08),
                boxShadow: `0 8px 32px ${alpha('#000000', 0.45)}`,
                bgcolor: 'transparent',
              },
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'transparent' }} />
                <Bar
                  dataKey="conv"
                  fill="#22D3EE"
                  radius={[8, 8, 0, 0]}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      </Grid>
    </Stack>
  )
}
