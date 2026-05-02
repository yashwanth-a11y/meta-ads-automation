import { Box, Button, Chip, Grid, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

const trends = [
  {
    title: '“Invisible funnel” narrative spikes in B2B SaaS',
    source: 'Twitter',
    score: 94,
  },
  {
    title: 'Short-form hooks leaning on contrast + punchy numerics',
    source: 'Google',
    score: 88,
  },
  {
    title: 'Founder-led voice outperforming polished brand tone',
    source: 'Twitter',
    score: 91,
  },
  {
    title: 'UGC-style demos with on-screen captions lifting CTR',
    source: 'Google',
    score: 86,
  },
  {
    title: 'Limited-run scarcity framing with proof stacks',
    source: 'Twitter',
    score: 82,
  },
  {
    title: 'Audience layering: creative fatigue cycles compressing',
    source: 'Google',
    score: 79,
  },
]

export function TrendsPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Trends"
        subtitle="Surface momentum across networks and translate signal into assets instantly."
      />

      <Grid container spacing={2}>
        {trends.map((t) => (
          <Grid key={t.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <GlassCard
              sx={{
                p: 2.5,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Chip
                  label={t.source}
                  size="small"
                  sx={{
                    bgcolor: alpha('#FFFFFF', 0.06),
                    border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                    fontWeight: 700,
                  }}
                />
                <Chip
                  label={`${t.score} score`}
                  size="small"
                  sx={{
                    bgcolor: alpha('#FFFFFF', 0.1),
                    border: `1px solid ${alpha('#FFFFFF', 0.2)}`,
                    // fontWeight: 800,
                  }}
                />
              </Stack>
              <Typography variant="subtitle1">
                {t.title}
              </Typography>
              <Button variant="contained" color="primary" fullWidth sx={{ mt: 'auto' }}>
                Generate content
              </Button>
            </GlassCard>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ height: 1 }} />
    </Stack>
  )
}
