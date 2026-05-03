import { Box, Grid, Stack, Switch, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined'
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined'
import TagIcon from '@mui/icons-material/Tag'
import { GlassCard } from '../../ui/GlassCard'
import type { ChannelTrendSources } from '../../../api/trends'

const TREND_SOURCE_LABELS: { key: keyof ChannelTrendSources; label: string; icon: React.ReactNode }[] = [
  { key: 'rss', label: 'RSS Feeds', icon: <RssFeedIcon sx={{ fontSize: 18 }} /> },
  { key: 'google_trends', label: 'Google Trends', icon: <ShowChartIcon sx={{ fontSize: 18 }} /> },
  { key: 'reddit', label: 'Reddit', icon: <ForumOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'product_hunt', label: 'Product Hunt', icon: <RocketLaunchOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'youtube', label: 'YouTube', icon: <SmartDisplayOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'twitter', label: 'Twitter / X', icon: <TagIcon sx={{ fontSize: 18 }} /> },
]

interface TrendSourcesCardProps {
  trendSources: ChannelTrendSources
  setTrendSources: (updater: (prev: ChannelTrendSources) => ChannelTrendSources) => void
}

export function TrendSourcesCard({ trendSources, setTrendSources }: TrendSourcesCardProps) {
  return (
    <GlassCard sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Trend Sources</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Control which signal sources are active for this channel's trend pipeline
      </Typography>
      <Grid container spacing={1}>
        {TREND_SOURCE_LABELS.map(({ key, label, icon }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box
              onClick={() => setTrendSources((prev) => ({ ...prev, [key]: !prev[key] }))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                borderRadius: '10px',
                border: '1px solid',
                borderColor: trendSources[key] ? alpha('#22D3EE', 0.4) : alpha('#64748B', 0.2),
                bgcolor: trendSources[key] ? alpha('#22D3EE', 0.06) : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: alpha('#22D3EE', 0.5) },
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ color: trendSources[key] ? '#0EA5B7' : 'text.disabled' }}>{icon}</Box>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px' }}>{label}</Typography>
              </Stack>
              <Switch
                size="small"
                checked={trendSources[key] ?? false}
                onChange={(e) => {
                  e.stopPropagation()
                  setTrendSources((prev) => ({ ...prev, [key]: e.target.checked }))
                }}
                sx={{ '& .MuiSwitch-track': { bgcolor: trendSources[key] ? '#22D3EE !important' : undefined } }}
              />
            </Box>
          </Grid>
        ))}
      </Grid>
    </GlassCard>
  )
}
