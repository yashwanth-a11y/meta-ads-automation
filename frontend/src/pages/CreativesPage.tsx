import { Box, Button, Grid, LinearProgress, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import { useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { GeneratingIndicator } from '../components/ui/GeneratingIndicator'
import { PageHeader } from '../components/ui/PageHeader'
import { SkeletonBlock } from '../components/ui/SkeletonBlock'

export function CreativesPage() {
  const [generating, setGenerating] = useState(false)

  const handleRegenerate = () => {
    setGenerating(true)
    window.setTimeout(() => setGenerating(false), 2200)
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Creatives"
        subtitle="Review AI-assembled scripts and previews before pushing to paid channels."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <GlassCard glow sx={{ p: 3, height: '100%' }}>
            <Typography variant="overline" color="text.secondary">
              Script
            </Typography>
            {generating ? (
              <SkeletonBlock lines={5} />
            ) : (
              <Typography variant="body1" sx={{ mt: 1, mb: 3, whiteSpace: 'pre-line' }}>
                {`Hook: You’re not bad at ads — your angles are expired.\n\nBody: In 48 hours we rebuilt creative velocity with PhotonX: hooks sourced from live trends, captions matched to tone, and variants scaled automatically.\n\nCTA: Tap to see the workflow founders use before they scale spend.`}
              </Typography>
            )}

            <Typography variant="overline" color="text.secondary">
              Hook options
            </Typography>
            {generating ? (
              <GeneratingIndicator variant="shimmer" />
            ) : (
              <Typography variant="body1" sx={{ mt: 1, mb: 3 }}>
                “Stop guessing angles — ship the ones the feed already rewards.”
              </Typography>
            )}

            <Typography variant="overline" color="text.secondary">
              Caption
            </Typography>
            {generating ? (
              <GeneratingIndicator label="Polishing caption" />
            ) : (
              <Typography variant="body1" sx={{ mt: 1 }}>
                PhotonX turns trend signal into creative drafts your team can approve in minutes — built
                for founders who want speed without sacrificing brand voice.
              </Typography>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
              <Button variant="contained" color="primary" fullWidth sx={{ flex: 1 }}>
                Approve
              </Button>
              <Button variant="outlined" color="inherit" fullWidth sx={{ flex: 1 }} onClick={handleRegenerate}>
                Regenerate
              </Button>
            </Stack>
            {generating ? <LinearProgress sx={{ mt: 2, borderRadius: 1, bgcolor: alpha('#FFF', 0.06) }} /> : null}
          </GlassCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <GlassCard sx={{ p: 0, overflow: 'hidden', height: '100%', minHeight: 420 }}>
            <Box
              sx={{
                aspectRatio: '9 / 16',
                maxHeight: 560,
                mx: 'auto',
                bgcolor: '#050505',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: `1px solid ${alpha('#FFFFFF', 0.08)}`,
              }}
            >
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  border: `1px solid ${alpha('#FFFFFF', 0.2)}`,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: alpha('#FFFFFF', 0.06),
                  backdropFilter: 'blur(8px)',
                }}
              >
                <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  right: 16,
                  textAlign: 'center',
                  color: 'text.secondary',
                }}
              >
                Mock preview · 1080×1920 vertical
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Vertical cut · Trend-safe pacing
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Safe zones respected · captions burned-in optional
              </Typography>
            </Box>
          </GlassCard>
        </Grid>
      </Grid>
    </Stack>
  )
}
