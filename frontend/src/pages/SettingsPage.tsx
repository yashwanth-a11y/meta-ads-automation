import { Stack, Switch, Typography, FormControlLabel, Divider } from '@mui/material'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

export function SettingsPage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <PageHeader title="Settings" subtitle="Workspace preferences for PhotonX GrowthOS." />
      <GlassCard sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
          AI & automation
        </Typography>
        <FormControlLabel control={<Switch defaultChecked />} label="Auto-refresh trend signals" />
        <FormControlLabel control={<Switch />} label="Require human approval before publish" />
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
          Notifications
        </Typography>
        <FormControlLabel control={<Switch defaultChecked />} label="Campaign anomalies" />
        <FormControlLabel control={<Switch defaultChecked />} label="Weekly executive digest" />
      </GlassCard>
    </Stack>
  )
}
