import { useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import { GlassCard } from '../ui/GlassCard'
import { ToggleRow } from './ToggleRow'

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

  const rows: Array<{
    label: string
    description: string
    checked: boolean
    set: (v: boolean) => void
  }> = [
    {
      label: 'Campaign anomalies',
      description: 'Alert when spend, CTR, or CPC deviates significantly from baseline',
      checked: anomalies,
      set: setAnomalies,
    },
    {
      label: 'Approval pending',
      description: 'Notify when a generated reel is awaiting your sign-off',
      checked: approval,
      set: setApproval,
    },
    {
      label: 'Approval link expiring',
      description: 'Reminder 24 hours before an approval link expires (48h window)',
      checked: expiry,
      set: setExpiry,
    },
    {
      label: 'Reel published',
      description: 'Confirm when a reel is successfully posted to Instagram',
      checked: published,
      set: setPublished,
    },
    {
      label: 'Weekly executive digest',
      description: 'AI-generated weekly summary with top recommendations',
      checked: digest,
      set: setDigest,
    },
  ]

  return (
    <Stack spacing={2.5}>
      <GlassCard sx={{ p: 0, '&:hover': { transform: 'none' } }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Email notifications
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Choose which events trigger an email to your account.
          </Typography>
        </Box>
        <Box sx={{ px: 1, pb: 1 }}>
          {rows.map((r, i) => (
            <ToggleRow
              key={r.label}
              label={r.label}
              description={r.description}
              checked={r.checked}
              onChange={r.set}
              divider={i < rows.length - 1}
            />
          ))}
        </Box>
      </GlassCard>

      <Box>
        <Button
          variant="contained"
          onClick={save}
          startIcon={saved ? <CheckCircleOutlineIcon /> : undefined}
          sx={{ minWidth: 160, height: 44, fontWeight: 700, textTransform: 'none', borderRadius: '10px' }}
        >
          {saved ? 'Saved' : 'Save preferences'}
        </Button>
      </Box>
    </Stack>
  )
}
