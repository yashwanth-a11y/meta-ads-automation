import { useState } from 'react'
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import { GlassCard } from '../ui/GlassCard'

export function NotificationsSection() {
  const [anomalies, setAnomalies] = useState(() => localStorage.getItem('notif_anomalies') !== 'false')
  const [approval, setApproval] = useState(() => localStorage.getItem('notif_approval') !== 'false')
  const [digest, setDigest] = useState(() => localStorage.getItem('notif_digest') !== 'false')
  const [published, setPublished] = useState(() => localStorage.getItem('notif_published') !== 'false')
  const [expiry, setExpiry] = useState(() => localStorage.getItem('notif_expiry') !== 'false')
  const [saved, setSaved] = useState(false)

  const save = () => {
    localStorage.setItem('notif_anomalies', String(anomalies))
    localStorage.setItem('notif_approval', String(approval))
    localStorage.setItem('notif_digest', String(digest))
    localStorage.setItem('notif_published', String(published))
    localStorage.setItem('notif_expiry', String(expiry))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const row = (
    label: string,
    desc: string,
    checked: boolean,
    set: (v: boolean) => void,
    divider = true,
  ) => (
    <>
      <FormControlLabel
        control={<Switch checked={checked} onChange={(e) => set(e.target.checked)} />}
        label={
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
            <Typography variant="caption" color="text.secondary">{desc}</Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.75 } }}
      />
      {divider && <Divider sx={{ my: 1 }} />}
    </>
  )

  return (
    <Stack spacing={2.5}>
      <GlassCard sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Email notifications</Typography>
        <Stack spacing={0.5}>
          {row('Campaign anomalies', 'Alert when spend, CTR, or CPC deviates significantly from baseline', anomalies, setAnomalies)}
          {row('Approval pending', 'Notify when a generated reel is awaiting your sign-off', approval, setApproval)}
          {row('Approval link expiring', 'Reminder 24 hours before an approval link expires (48h window)', expiry, setExpiry)}
          {row('Reel published', 'Confirm when a reel is successfully posted to Instagram', published, setPublished)}
          {row('Weekly executive digest', 'AI-generated weekly summary with top recommendations', digest, setDigest, false)}
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
