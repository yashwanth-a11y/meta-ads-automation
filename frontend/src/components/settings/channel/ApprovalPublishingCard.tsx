import {
  Box,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { GlassCard } from '../../ui/GlassCard'
import { SCHEDULE_OPTIONS } from '../constants'

interface ApprovalPublishingCardProps {
  approvalMode: 'manual' | 'auto'
  setApprovalMode: (v: 'manual' | 'auto') => void
  threshold: number
  setThreshold: (v: number) => void
  schedule: string
  setSchedule: (v: string) => void
  cooldown: number
  setCooldown: (v: number) => void
  instagramId: string
  setInstagramId: (v: string) => void
}

export function ApprovalPublishingCard({
  approvalMode,
  setApprovalMode,
  threshold,
  setThreshold,
  schedule,
  setSchedule,
  cooldown,
  setCooldown,
  instagramId,
  setInstagramId,
}: ApprovalPublishingCardProps) {
  return (
    <GlassCard sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Approval & Publishing</Typography>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Approval mode</Typography>
          <RadioGroup value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as 'manual' | 'auto')}>
            <FormControlLabel
              value="manual"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Manual — always send approval email</Typography>
                  <Typography variant="caption" color="text.secondary">Every generated reel requires human sign-off before publishing</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', mb: 0.5, '& .MuiFormControlLabel-label': { mt: 0.5 } }}
            />
            <FormControlLabel
              value="auto"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Auto-publish if score above threshold</Typography>
                  <Typography variant="caption" color="text.secondary">Reels scoring above the threshold publish automatically; others go to email review</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.5 } }}
            />
          </RadioGroup>
        </Box>

        {approvalMode === 'auto' && (
          <Box sx={{ maxWidth: 400, px: 0.5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Auto-publish threshold</Typography>
              <Chip
                label={threshold.toFixed(1)}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '12px',
                  fontWeight: 700,
                  bgcolor: alpha('#22D3EE', 0.12),
                  color: '#0EA5B7',
                  border: `1px solid ${alpha('#22D3EE', 0.25)}`,
                }}
              />
            </Stack>
            <Slider
              value={threshold}
              onChange={(_, v) => setThreshold(v as number)}
              min={7}
              max={10}
              step={0.5}
              marks={[
                { value: 7, label: '7.0' },
                { value: 8.5, label: '8.5' },
                { value: 10, label: '10' },
              ]}
              sx={{ color: '#22D3EE' }}
            />
            <Typography variant="caption" color="text.secondary">
              Reels scoring below {threshold.toFixed(1)} will require manual approval
            </Typography>
          </Box>
        )}

        <Divider />

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Posting schedule</InputLabel>
              <Select value={schedule} label="Posting schedule" onChange={(e) => setSchedule(e.target.value)}>
                {SCHEDULE_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
              <FormHelperText>How often to publish on this channel</FormHelperText>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              type="number"
              label="Topic cooldown (days)"
              value={cooldown}
              onChange={(e) => setCooldown(Math.max(1, parseInt(e.target.value) || 14))}
              inputProps={{ min: 1, max: 90 }}
              helperText="Prevents the same trend producing two reels"
              fullWidth
            />
          </Grid>
        </Grid>

        <TextField
          label="Instagram Business Account ID"
          placeholder="e.g. 17841400455970"
          value={instagramId}
          onChange={(e) => setInstagramId(e.target.value)}
          autoComplete="off"
          helperText="The Instagram account used to publish reels for this channel"
        />
      </Stack>
    </GlassCard>
  )
}
