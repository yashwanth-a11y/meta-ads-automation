import { Paper, type PaperProps } from '@mui/material'
import { alpha } from '@mui/material/styles'

type GlassCardProps = PaperProps & {
  glow?: boolean
}

export function GlassCard({ glow = false, sx, children, ...rest }: GlassCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid #dddddd57',
        boxShadow: glow
          ? `0 1px 2px ${alpha('#0F172A', 0.08)}, 0 18px 40px ${alpha('#0F172A', 0.12)}, 0 0 70px ${alpha('#22D3EE', 0.12)}`
          : `0 8px 24px ${alpha('#0F172A', 0.08)}`,
        transition: 'transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease',
        '&::before': glow
          ? {
              content: '""',
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              padding: '1px',
              background: `linear-gradient(135deg, ${alpha('#22D3EE', 0.22)} 0%, transparent 45%, ${alpha('#0F172A', 0.06)} 100%)`,
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              pointerEvents: 'none',
            }
          : {},
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: '#dddddd57',
          boxShadow: `0 14px 30px ${alpha('#0F172A', 0.12)}, 0 0 50px ${alpha('#22D3EE', 0.08)}`,
        },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Paper>
  )
}
