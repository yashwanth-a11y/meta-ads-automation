import { Box, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type ChartCardProps = {
  title: string
  subtitle?: string
  children: ReactNode
  glow?: boolean
  cardSx?: SxProps<Theme>
}

export function ChartCard({ title, subtitle, children, glow, cardSx }: ChartCardProps) {
  return (
    <GlassCard glow={glow} sx={{ p: 2.5, ...cardSx }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {subtitle}
        </Typography>
      ) : (
        <Box sx={{ mb: 2 }} />
      )}
      <Box sx={{ width: '100%', height: 280 }}>{children}</Box>
    </GlassCard>
  )
}
