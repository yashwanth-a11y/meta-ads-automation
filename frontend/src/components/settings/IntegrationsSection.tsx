import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import FacebookOutlinedIcon from '@mui/icons-material/FacebookOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '../ui/GlassCard'
import { adsApi } from '../../api/ads'
import { qk } from '../../api/queryClient'
import { paths } from '../../auth/constants'

export function IntegrationsSection() {
  const navigate = useNavigate()
  const setupStatus = useQuery({
    queryKey: qk.setupStatus,
    queryFn: () => adsApi.getSetupStatus(),
    staleTime: 60_000,
    retry: false,
  })

  const connected = setupStatus.data?.connected ?? false

  return (
    <Stack spacing={2.5}>
      <GlassCard sx={{ p: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha('#1877F2', 0.12),
              }}
            >
              <FacebookOutlinedIcon sx={{ color: '#1877F2', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Meta Ads</Typography>
              <Typography variant="caption" color="text.secondary">Ad account, campaigns & lead sync</Typography>
            </Box>
          </Stack>
          <Chip
            label={setupStatus.isLoading ? 'Checking…' : connected ? 'Connected' : 'Not connected'}
            size="small"
            sx={{
              height: 22,
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '6px',
              bgcolor: connected ? alpha('#34D399', 0.12) : alpha('#94A3B8', 0.12),
              color: connected ? '#059669' : '#64748B',
              border: `1px solid ${connected ? alpha('#34D399', 0.3) : alpha('#94A3B8', 0.25)}`,
            }}
          />
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          {connected
            ? 'Your Meta Ad account is connected. Campaigns and leads sync automatically.'
            : 'Connect your Meta Business account to enable ad creation, campaign management, and lead sync.'}
        </Typography>
        <Button
          variant={connected ? 'outlined' : 'contained'}
          endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate(paths.adsSetup)}
          sx={{ height: 40 }}
        >
          {connected ? 'Manage connection' : 'Connect Meta Ads'}
        </Button>
      </GlassCard>

      <GlassCard sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha('#E1306C', 0.1),
            }}
          >
            <InstagramIcon sx={{ color: '#E1306C', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Instagram Publishing</Typography>
            <Typography variant="caption" color="text.secondary">Instagram Business accounts for Reels publishing</Typography>
          </Box>
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          Instagram account IDs are configured per channel. Go to <strong>Channel Config</strong> tab above and set the Instagram Business Account ID for each channel.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => document.getElementById('settings-tab-1')?.click()}
          sx={{ height: 40 }}
        >
          Configure per channel
        </Button>
      </GlassCard>
    </Stack>
  )
}
