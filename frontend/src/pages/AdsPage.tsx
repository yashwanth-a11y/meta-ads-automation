import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import { useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { GeneratingIndicator } from '../components/ui/GeneratingIndicator'
import { PageHeader } from '../components/ui/PageHeader'

export function AdsPage() {
  const [prompt, setPrompt] = useState(
    'Launch a prospecting campaign for founders who want AI-assisted creative velocity without losing brand voice.',
  )
  const [loading, setLoading] = useState(false)

  const handleGenerate = () => {
    setLoading(true)
    window.setTimeout(() => setLoading(false), 1800)
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Ads"
        subtitle="Prompt-to-launch workflows with structured outputs your media team can ship."
        action={
          <Chip
            icon={<AutoAwesomeOutlinedIcon />}
            label="Copilot"
            sx={{
              bgcolor: alpha('#FFFFFF', 0.06),
              border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
              fontWeight: 700,
            }}
          />
        }
      />

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: '8px',
          bgcolor: alpha('#FFFFFF', 0.03),
          border: `1px solid ${alpha('#FFFFFF', 0.08)}`,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Your brief
        </Typography>
        <TextField
          autoComplete="off"
          multiline
          minRows={4}
          fullWidth
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe offer, audience, constraints, and desired outcome…"
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ mt: 2, justifyContent: 'flex-end' }}
        >
          <Button variant="outlined" color="inherit" onClick={handleGenerate}>
            Generate variants
          </Button>
          <Button variant="contained" color="primary" onClick={handleGenerate}>
            Run synthesis
          </Button>
        </Stack>
      </Paper>

      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">
            Assistant
          </Typography>
          <Divider sx={{ flex: 1, borderColor: alpha('#FFFFFF', 0.08) }} />
        </Stack>

        <GlassCard sx={{ p: 2.5, alignSelf: 'flex-start', maxWidth: '92%' }}>
          <Typography variant="body2" color="text.secondary">
            Parsed objectives and mapped to PhotonX channel defaults. Generating structured campaign
            scaffold…
          </Typography>
        </GlassCard>

        {loading ? (
          <GlassCard sx={{ p: 2.5, alignSelf: 'flex-start', bgcolor: alpha('#FFF', 0.06) }}>
            <GeneratingIndicator label="Generating" />
          </GlassCard>
        ) : (
          <GlassCard glow sx={{ p: 3, alignSelf: 'flex-start', width: '50%' }}>
            <Typography variant="overline" color="text.secondary">
              Output
            </Typography>
            <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 800 }}>
              Headline
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Ship creative velocity without sacrificing voice — AI-built, founder-approved.
            </Typography>

            <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 800 }}>
              Ad copy
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              PhotonX stitches live trends into hooks, scripts, and captions your team can approve in one
              pass. Built for teams scaling paid social without ballooning headcount.
            </Typography>

            <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 800 }}>
              Audience targeting
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Founders &amp; growth leads · NA/EU · Advantage+ creative · Interest: SaaS, AI tooling,
              marketing automation.
            </Typography>

            <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 800 }}>
              Budget
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Start $420/day · scale at +18% every 3 winning days · cap $3.6k/week during learning.
            </Typography>

            <Box sx={{ mt: 3 }}>
              <Button variant="contained" color="primary" size="large" fullWidth>
                Publish campaign
              </Button>
            </Box>
          </GlassCard>
        )}
      </Stack>
    </Stack>
  )
}
