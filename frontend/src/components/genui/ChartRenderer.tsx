import { Box, LinearProgress, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartPayload } from '../../api/genui'
import { GlassCard } from '../ui/GlassCard'

// Project color palette
const CHART_COLORS = ['#22D3EE', '#F97316', '#A855F7', '#34D399', '#F87171', '#0EA5E9', '#FCD34D']

interface ChartRendererProps {
  payload: ChartPayload
}

export function ChartRenderer({ payload }: ChartRendererProps) {
  const { chartType, title, data, xKey, yKeys } = payload

  return (
    <GlassCard sx={{ p: 2, mt: 1, overflow: 'visible' }}>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 600, color: '#0F172A', mb: 1.5, letterSpacing: '0.01em' }}
      >
        {title}
      </Typography>

      {chartType === 'funnel' ? (
        <FunnelChart data={data} xKey={xKey} yKey={yKeys[0] ?? 'count'} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha('#94A3B8', 0.25)} />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  color: '#F1F5F9',
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: '#64748B', paddingTop: 8 }}
              />
              {yKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yKeys[0] ?? 'value'}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  color: '#F1F5F9',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#64748B' }} />
            </PieChart>
          ) : (
            // bar (default)
            <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={alpha('#94A3B8', 0.25)} vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  color: '#F1F5F9',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#64748B', paddingTop: 8 }} />
              {yKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </GlassCard>
  )
}

// ─── Custom funnel (no extra library needed) ──────────────────────────────────

function FunnelChart({
  data,
  xKey,
  yKey,
}: {
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
}) {
  const maxValue = Math.max(...data.map((d) => Number(d[yKey] ?? 0)), 1)

  return (
    <Stack spacing={1} sx={{ mt: 0.5 }}>
      {data.map((row, i) => {
        const value = Number(row[yKey] ?? 0)
        const pct = (value / maxValue) * 100
        const color = CHART_COLORS[i % CHART_COLORS.length]

        return (
          <Box key={i}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>
                {String(row[xKey] ?? '')}
              </Typography>
              <Typography variant="caption" sx={{ color: '#0F172A', fontWeight: 600 }}>
                {value.toLocaleString()}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: alpha(color, 0.12),
                '& .MuiLinearProgress-bar': {
                  bgcolor: color,
                  borderRadius: 4,
                },
              }}
            />
          </Box>
        )
      })}
    </Stack>
  )
}
