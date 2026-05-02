import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

const channels = [
  { id: '1', name: 'DTC Skincare', niche: 'Beauty · Subscription' },
  { id: '2', name: 'B2B Analytics', niche: 'SaaS · PLG' },
  { id: '3', name: 'Fitness Coaching', niche: 'Health · High-ticket' },
]

export function ChannelsPage() {
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [tone, setTone] = useState('')
  const [language, setLanguage] = useState('en')
  const [touched, setTouched] = useState(false)

  const invalid = touched && (!name.trim() || !niche.trim() || !tone)

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Channels"
        subtitle="Organize brand voices, languages, and positioning for each growth lane."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={1.5}>
            {channels.map((c) => (
              <GlassCard
                key={c.id}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  '&:hover': { borderColor: alpha('#FFFFFF', 0.16) },
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {c.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.niche}
                </Typography>
              </GlassCard>
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <GlassCard glow sx={{ p: 3 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Create channel
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Name"
                placeholder="e.g. Premium Coaching"
                fullWidth
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !name.trim()}
                helperText={touched && !name.trim() ? 'Name is required' : ' '}
              />
              <TextField
                label="Niche"
                placeholder="Industry, offer type, ICP"
                fullWidth
                autoComplete="off"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !niche.trim()}
                helperText={touched && !niche.trim() ? 'Niche is required' : ' '}
              />
              <TextField
                label="Tone"
                placeholder="Authoritative, playful, minimal…"
                fullWidth
                autoComplete="off"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !tone.trim()}
                helperText={touched && !tone.trim() ? 'Tone is required' : ' '}
              />
              <FormControl fullWidth>
                <InputLabel id="lang-label">Language</InputLabel>
                <Select
                  labelId="lang-label"
                  label="Language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="de">German</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                </Select>
                <FormHelperText>Used for AI copy and compliance templates.</FormHelperText>
              </FormControl>
              <Box sx={{ pt: 1 }}>
                <Button variant="contained" color="primary" disabled={invalid} sx={{ minWidth: 160 }}>
                  Save channel
                </Button>
              </Box>
            </Stack>
          </GlassCard>
        </Grid>
      </Grid>
    </Stack>
  )
}
