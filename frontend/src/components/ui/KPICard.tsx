import { Box, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

type KPICardProps = {
  title: string
  value: string
  delta?: string
  icon?: ReactNode
  glow?: boolean
}

export function KPICard({ title, value, delta, icon, glow }: KPICardProps) {
  return (
    <GlassCard glow={glow} sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {value}
          </Typography>
          {delta ? (
            <Typography variant="subtitle1" sx={{ mt: 1, display: 'block', color: 'success.main' }}>
              {delta}
            </Typography>
          ) : null}
        </Box>
        {icon ? (
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '8px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: (t) => t.palette.action.hover,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {icon}
          </Box>
        ) : null}
      </Stack>
    </GlassCard>
  )
}
