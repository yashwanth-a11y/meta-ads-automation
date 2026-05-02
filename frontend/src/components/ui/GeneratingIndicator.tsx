import { Box, keyframes, Stack, Typography } from '@mui/material'

const blink = keyframes`
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1); }
`

const sweep = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
`

type GeneratingIndicatorProps = {
  label?: string
  variant?: 'dots' | 'shimmer'
}

export function GeneratingIndicator({
  label = 'Generating',
  variant = 'dots',
}: GeneratingIndicatorProps) {
  if (variant === 'shimmer') {
    return (
      <Box
        sx={{
          borderRadius: 2,
          height: 56,
          background: (t) =>
            `linear-gradient(90deg, ${t.palette.divider} 0%, ${t.palette.action.hover} 50%, ${t.palette.divider} 100%)`,
          backgroundSize: '200% 100%',
          animation: `${sweep} 1.4s ease infinite`,
        }}
      />
    )
  }

  return (
    <Stack direction="row" spacing={1} sx={{ py: 1, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} aria-hidden>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'text.secondary',
              animation: `${blink} 1s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </Stack>
    </Stack>
  )
}
