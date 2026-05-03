import { Box, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded'
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded'
import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type KPICardProps = {
  title: string
  value: string
  delta?: string
  /** Direction of the delta — drives the trend arrow + color. */
  trend?: 'up' | 'down' | 'flat'
  icon?: ReactNode
  /** Accent color (top stripe, icon tile, gradient wash). Defaults to theme cyan. */
  color?: string
  glow?: boolean
}

export function KPICard({
  title,
  value,
  delta,
  trend = 'up',
  icon,
  color = '#22D3EE',
  glow,
}: KPICardProps) {
  // Trend semantics: "up" is good for growth metrics (spend, impressions),
  // "down" is good for cost metrics (CPC, CPM). Caller picks the direction
  // based on whether a higher number is better or worse for that KPI.
  const trendColor =
    trend === 'down' ? '#10B981' : trend === 'flat' ? '#64748B' : '#10B981'
  const TrendIcon = trend === 'down' ? TrendingDownIcon : TrendingUpIcon

  return (
    <GlassCard
      glow={glow}
      sx={{
        position: 'relative',
        p: 2.25,
        height: '100%',
        overflow: 'hidden',
        // Subtle diagonal wash so the card has its own personality even at
        // rest. Falls off quickly so the value text stays high-contrast.
        backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.06)} 0%, ${alpha(color, 0.01)} 50%, ${alpha('#FFFFFF', 0)} 100%)`,
        // Top accent stripe — the card's identity color across the grid.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.4)} 100%)`,
        },
        // GlassCard's default hover-lift is fine here — emphasizes that the
        // card is a stat tile, not interactive content.
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              fontSize: 10.5,
              letterSpacing: 0.8,
              color: 'text.secondary',
              lineHeight: 1.4,
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="h4"
            sx={{
              mt: 0.75,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              fontSize: 26,
              lineHeight: 1.15,
              color: 'text.primary',
            }}
            title={value}
          >
            {value}
          </Typography>
          {delta ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                mt: 1,
                alignItems: 'center',
                px: 0.75,
                py: 0.25,
                width: 'fit-content',
                borderRadius: '6px',
                bgcolor: alpha(trendColor, 0.1),
              }}
            >
              <TrendIcon sx={{ fontSize: 12, color: trendColor }} />
              <Typography
                variant="caption"
                sx={{
                  color: trendColor,
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1.2,
                }}
              >
                {delta}
              </Typography>
            </Stack>
          ) : null}
        </Box>
        {icon ? (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha(color, 0.12),
              color,
              flexShrink: 0,
              border: `1px solid ${alpha(color, 0.18)}`,
            }}
          >
            {icon}
          </Box>
        ) : null}
      </Stack>
    </GlassCard>
  )
}
