import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type ChartCardProps = {
  title: string
  subtitle?: string
  children: ReactNode
  glow?: boolean
}

export function ChartCard({ title, subtitle, children, glow }: ChartCardProps) {
  return (
    <GlassCard glow={glow} sx={{ p: 2.5 }}>
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
