import { useState } from 'react'
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import { GlassCard } from '../components/ui/GlassCard'
import { GeneralSection } from '../components/settings/GeneralSection'
import { ProfileSection } from '../components/settings/ProfileSection'
import { NotificationsSection } from '../components/settings/NotificationsSection'
import { IntegrationsSection } from '../components/settings/IntegrationsSection'

const ACCENT = '#22D3EE'
const ACCENT_DARK = '#0EA5B7'

type SettingsTab = {
  id: 'general' | 'notifications' | 'integrations'
  label: string
  description: string
  Icon: React.ElementType
  Render: React.ComponentType
}

const TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Workspace name, region, and account-level defaults.',
    Icon: SettingsOutlinedIcon,
    Render: GeneralSection,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Channels, digests, and alert thresholds.',
    Icon: NotificationsOutlinedIcon,
    Render: NotificationsSection,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Connected services, OAuth tokens, and webhooks.',
    Icon: HubOutlinedIcon,
    Render: IntegrationsSection,
  },
]

export function SettingsPage() {
  const [tabIndex, setTabIndex] = useState(0)
  const active = TABS[tabIndex]
  const ActiveSection = active.Render
  const ActiveIcon = active.Icon

  return (
    <Stack spacing={3}>
      {/* ── Hero header ────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          border: `1px solid ${alpha(ACCENT, 0.18)}`,
          bgcolor: 'background.paper',
          backgroundImage: `linear-gradient(135deg, ${alpha(ACCENT, 0.08)} 0%, ${alpha(ACCENT, 0.02)} 60%, ${alpha('#FFFFFF', 0)} 100%)`,
          px: { xs: 2.5, md: 3.5 },
          py: { xs: 2.5, md: 3 },
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
              color: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              boxShadow: `0 8px 24px ${alpha(ACCENT, 0.3)}`,
            }}
          >
            <TuneRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}
            >
              Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Workspace preferences, notifications, and integrations.
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* ── Tabs + content (single card, matches /approvals) ──────────── */}
      <GlassCard
        sx={{
          overflow: 'hidden',
          padding: '10px 10px 5px 10px',
          // Suppress the GlassCard's default hover-lift — the card holds
          // interactive tabs, so it shouldn't move on its own hover.
          '&:hover': {
            transform: 'none',
            boxShadow: `0 8px 24px ${alpha('#0F172A', 0.08)}`,
          },
        }}
      >
        {/* Tabs row */}
        <Box sx={{ px: 1, pt: 0.5 }}>
          <Tabs
            value={tabIndex}
            onChange={(_, v: number) => setTabIndex(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                fontSize: '13px',
                fontWeight: 600,
                textTransform: 'none',
                color: '#475569',
                px: 2,
                borderRadius: '8px',
                transition: 'background-color 160ms ease, color 160ms ease',
                '&:hover': {
                  color: ACCENT_DARK,
                  bgcolor: alpha(ACCENT, 0.06),
                },
              },
              '& .Mui-selected': {
                color: `${ACCENT_DARK} !important`,
                bgcolor: alpha(ACCENT, 0.12),
              },
              '& .MuiTabs-indicator': { display: 'none' },
              '& .MuiTabs-scrollButtons.Mui-disabled': { opacity: 0.3 },
            }}
          >
            {TABS.map((t) => {
              const TabIcon = t.Icon
              return (
                <Tab
                  key={t.id}
                  label={
                    <Stack
                      direction="row"
                      spacing={0.875}
                      sx={{ alignItems: 'center' }}
                    >
                      <TabIcon sx={{ fontSize: 16 }} />
                      <span>{t.label}</span>
                    </Stack>
                  }
                />
              )
            })}
          </Tabs>
        </Box>

        {/* Content */}
        <Box sx={{ p: "0px 20px 20px 20px" }}>
          {/* Section heading — colored icon tile + label + description */}
          <Stack
            direction="row"
            spacing={1.75}
            sx={{
              alignItems: 'center',
              pb: 2.25,
              mb: 2.5,
            }}
          >
            {/* <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                bgcolor: alpha(ACCENT, 0.12),
                color: ACCENT_DARK,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <ActiveIcon sx={{ fontSize: 19 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, lineHeight: 1.2 }}
              >
                {active.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {active.description}
              </Typography>
            </Box> */}
          </Stack>

          {/* Section body — keeps the original 820-px form max-width so dense
              forms don't stretch wider than readable on big screens. */}
          <Box sx={{ maxWidth: '100%' }}>
            <ActiveSection />
          </Box>
        </Box>
      </GlassCard>
    </Stack>
  )
}
