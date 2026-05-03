import { useState } from 'react'
import { Box, Stack, Tab, Tabs } from '@mui/material'
import { PageHeader } from '../components/ui/PageHeader'
import { GeneralSection } from '../components/settings/GeneralSection'
import { ChannelConfigSection } from '../components/settings/ChannelConfigSection'
import { NotificationsSection } from '../components/settings/NotificationsSection'
import { IntegrationsSection } from '../components/settings/IntegrationsSection'

export function SettingsPage() {
  const [tab, setTab] = useState(0)

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Settings"
        subtitle="Workspace preferences, channel pipeline configuration, and integrations."
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '14px', minWidth: 120 },
          }}
        >
          <Tab label="General" id="settings-tab-0" />
          <Tab label="Channel Config" id="settings-tab-1" />
          <Tab label="Notifications" id="settings-tab-2" />
          <Tab label="Integrations" id="settings-tab-3" />
        </Tabs>
      </Box>

      <Box sx={{ maxWidth: 820 }}>
        {tab === 0 && <GeneralSection />}
        {tab === 1 && <ChannelConfigSection />}
        {tab === 2 && <NotificationsSection />}
        {tab === 3 && <IntegrationsSection />}
      </Box>
    </Stack>
  )
}
