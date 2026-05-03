import { useState } from 'react'
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import { GlassCard } from '../ui/GlassCard'
import { SCHEDULE_OPTIONS } from './constants'

export function GeneralSection() {
  const [autoRefresh, setAutoRefresh] = useState(() =>
    localStorage.getItem('setting_auto_refresh') !== 'false'
  )
  const [requireApproval, setRequireApproval] = useState(() =>
    localStorage.getItem('setting_require_approval') !== 'false'
  )
  const [autoDiscard, setAutoDiscard] = useState(() =>
    localStorage.getItem('setting_auto_discard') !== 'false'
  )
  const [defaultLanguage, setDefaultLanguage] = useState(() =>
    localStorage.getItem('setting_default_language') ?? 'en'
  )
  const [defaultSchedule, setDefaultSchedule] = useState(() =>
    localStorage.getItem('setting_default_schedule') ?? '3x/week'
  )
  const [defaultCooldown, setDefaultCooldown] = useState(() =>
    parseInt(localStorage.getItem('setting_default_cooldown') ?? '14', 10)
  )
  const [saved, setSaved] = useState(false)

  const save = () => {
    localStorage.setItem('setting_auto_refresh', String(autoRefresh))
    localStorage.setItem('setting_require_approval', String(requireApproval))
    localStorage.setItem('setting_auto_discard', String(autoDiscard))
    localStorage.setItem('setting_default_language', defaultLanguage)
    localStorage.setItem('setting_default_schedule', defaultSchedule)
    localStorage.setItem('setting_default_cooldown', String(defaultCooldown))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Stack spacing={2.5}>
      <GlassCard sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Automation</Typography>
        <Stack spacing={0.5}>
          <FormControlLabel
            control={<Switch checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Auto-refresh trend signals</Typography>
                <Typography variant="caption" color="text.secondary">Run the ingestion pipeline on the scheduled interval</Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.75 } }}
          />
          <Divider sx={{ my: 1 }} />
          <FormControlLabel
            control={<Switch checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Require human approval before publish</Typography>
                <Typography variant="caption" color="text.secondary">Send approval email even when channel is set to auto-publish</Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.75 } }}
          />
          <Divider sx={{ my: 1 }} />
          <FormControlLabel
            control={<Switch checked={autoDiscard} onChange={(e) => setAutoDiscard(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Auto-discard reels scoring below 7</Typography>
                <Typography variant="caption" color="text.secondary">Creative bundles with a composite score under 7 are silently dropped</Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.75 } }}
          />
        </Stack>
      </GlassCard>

      <GlassCard sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Content defaults for new channels</Typography>
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Default language</InputLabel>
                <Select value={defaultLanguage} label="Default language" onChange={(e) => setDefaultLanguage(e.target.value)}>
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="de">German</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                  <MenuItem value="ar">Arabic</MenuItem>
                  <MenuItem value="hi">Hindi</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Default posting schedule</InputLabel>
                <Select value={defaultSchedule} label="Default posting schedule" onChange={(e) => setDefaultSchedule(e.target.value)}>
                  {SCHEDULE_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ maxWidth: 280 }}>
            <TextField
              type="number"
              label="Default topic cooldown (days)"
              value={defaultCooldown}
              onChange={(e) => setDefaultCooldown(Math.max(1, parseInt(e.target.value) || 14))}
              inputProps={{ min: 1, max: 90 }}
              helperText="Prevents same trend producing two reels within this window"
            />
          </Box>
        </Stack>
      </GlassCard>

      <Box>
        <Button
          variant="contained"
          onClick={save}
          startIcon={saved ? <CheckCircleOutlineIcon /> : undefined}
          sx={{ minWidth: 160, height: 44 }}
        >
          {saved ? 'Saved' : 'Save preferences'}
        </Button>
      </Box>
    </Stack>
  )
}
