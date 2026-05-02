import { Grid, Stack } from '@mui/material'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
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
  borderRadius: 12,
  fontSize: 12,
}

export function DashboardPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Overview"
        subtitle="Real-time signal across acquisition, creative throughput, and funnel conversion."
      />

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
                <Tooltip contentStyle={chartTooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#FAFAFA"
                  strokeWidth={2}
                  dot={{ fill: '#FAFAFA', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <ChartCard title="Campaign comparison" subtitle="Attributed conversions by initiative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="4 8" vertical={false} />
                <XAxis dataKey="name" stroke="#737373" tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="conv" fill="#E5E5E5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      </Grid>
    </Stack>
  )
}
