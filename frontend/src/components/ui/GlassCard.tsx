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
        bgcolor: (t) => alpha(t.palette.background.paper, 0.72),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid',
        borderColor: alpha('#FFFFFF', 0.08),
        boxShadow: glow
          ? `0 0 0 1px ${alpha('#FFFFFF', 0.1)}, 0 16px 48px ${alpha('#000000', 0.55)}, 0 0 80px ${alpha('#FFFFFF', 0.03)}`
          : `0 8px 32px ${alpha('#000000', 0.45)}`,
        transition: 'transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease',
        '&::before': glow
          ? {
              content: '""',
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              padding: '1px',
              background: `linear-gradient(135deg, ${alpha('#FFFFFF', 0.18)} 0%, transparent 45%, ${alpha('#FFFFFF', 0.06)} 100%)`,
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              pointerEvents: 'none',
            }
          : {},
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha('#FFFFFF', 0.14),
          boxShadow: `0 12px 40px ${alpha('#000000', 0.55)}, 0 0 60px ${alpha('#FFFFFF', 0.04)}`,
        },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Paper>
  )
}
