import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../ui/GlassCard'
import { trendsApi } from '../../api/trends'
import { qk } from '../../api/queryClient'
import { DEFAULT_SOURCES } from './constants'
import { ApprovalPublishingCard } from './channel/ApprovalPublishingCard'
import { TrendSourcesCard } from './channel/TrendSourcesCard'
import { ApproversCard } from './channel/ApproversCard'
import { KeywordsCard } from './channel/KeywordsCard'
import { MonitoringSourcesCard } from './channel/MonitoringSourcesCard'
import type { ChannelApprover, ChannelTrendSources } from '../../api/trends'

export function ChannelConfigSection() {
  const client = useQueryClient()
  const { data: channels = [], isLoading } = useQuery({
    queryKey: qk.channels,
    queryFn: trendsApi.listChannels,
  })

  const [selectedId, setSelectedId] = useState<string>('')
  const channel = channels.find((c) => c.id === selectedId) ?? null

  const [approvalMode, setApprovalMode] = useState<'manual' | 'auto'>('manual')
  const [threshold, setThreshold] = useState<number>(8.5)
  const [schedule, setSchedule] = useState('3x/week')
  const [cooldown, setCooldown] = useState(14)
  const [instagramId, setInstagramId] = useState('')
  const [trendSources, setTrendSources] = useState<ChannelTrendSources>({ ...DEFAULT_SOURCES })
  const [approvers, setApprovers] = useState<ChannelApprover[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [competitors, setCompetitors] = useState<string[]>([])
  const [trackedKeywords, setTrackedKeywords] = useState<string[]>([])
  const [trackedXAccounts, setTrackedXAccounts] = useState<string[]>([])
  const [watchedWebsites, setWatchedWebsites] = useState<string[]>([])

  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!channel) return
    setApprovalMode(channel.approval_mode ?? 'manual')
    setThreshold(parseFloat(channel.auto_publish_threshold ?? '8.5'))
    setSchedule(channel.posting_schedule ?? '3x/week')
    setCooldown(channel.topic_cooldown_days ?? 14)
    setInstagramId(channel.instagram_account_id ?? '')
    setTrendSources({ ...DEFAULT_SOURCES, ...(channel.trend_sources ?? {}) })
    setApprovers(channel.brand_assets?.approvers ?? [])
    setProducts(channel.products ?? [])
    setCompetitors(channel.competitors ?? [])
    setTrackedKeywords(channel.tracked_keywords ?? [])
    setTrackedXAccounts(channel.brand_assets?.tracked_x_accounts ?? [])
    setWatchedWebsites(channel.brand_assets?.watched_websites ?? [])
    setSaveError(null)
  }, [channel?.id])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      trendsApi.updateChannel(selectedId, {
        approval_mode: approvalMode,
        auto_publish_threshold: String(threshold),
        posting_schedule: schedule,
        topic_cooldown_days: cooldown,
        instagram_account_id: instagramId || undefined,
        trend_sources: trendSources,
        brand_assets: {
          ...(channel?.brand_assets ?? {}),
          approvers,
          tracked_x_accounts: trackedXAccounts,
          watched_websites: watchedWebsites,
        },
        products,
        competitors,
        tracked_keywords: trackedKeywords,
      }),
    onSuccess: (updated) => {
      client.invalidateQueries({ queryKey: qk.channels })
      setSnackMsg(`Saved settings for "${updated.brand_name}".`)
      setSnackOpen(true)
      setSaveError(null)
    },
    onError: (err: Error) => setSaveError(err.message || 'Failed to save.'),
  })

  if (isLoading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={52} sx={{ borderRadius: '8px' }} />
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: '12px' }} />
      </Stack>
    )
  }

  if (channels.length === 0) {
    return (
      <GlassCard sx={{ p: 3 }}>
        <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
          No channels yet — create one in the Channels page first.
        </Typography>
      </GlassCard>
    )
  }

  return (
    <Stack spacing={2.5}>
      <FormControl sx={{ maxWidth: 360 }}>
        <InputLabel>Select channel to configure</InputLabel>
        <Select
          value={selectedId}
          label="Select channel to configure"
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {channels.map((ch) => (
            <MenuItem key={ch.id} value={ch.id}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{ch.brand_name}</Typography>
                <Typography variant="caption" color="text.secondary">— {ch.name}</Typography>
              </Stack>
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>Changes apply only to the selected channel</FormHelperText>
      </FormControl>

      {!channel && (
        <GlassCard sx={{ p: 3 }}>
          <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
            Select a channel above to configure its settings.
          </Typography>
        </GlassCard>
      )}

      {channel && (
        <Stack spacing={2.5}>
          <ApprovalPublishingCard
            approvalMode={approvalMode}
            setApprovalMode={setApprovalMode}
            threshold={threshold}
            setThreshold={setThreshold}
            schedule={schedule}
            setSchedule={setSchedule}
            cooldown={cooldown}
            setCooldown={setCooldown}
            instagramId={instagramId}
            setInstagramId={setInstagramId}
          />

          <TrendSourcesCard
            trendSources={trendSources}
            setTrendSources={setTrendSources}
          />

          <ApproversCard
            approvers={approvers}
            setApprovers={setApprovers}
          />

          <KeywordsCard
            products={products}
            setProducts={setProducts}
            competitors={competitors}
            setCompetitors={setCompetitors}
            trackedKeywords={trackedKeywords}
            setTrackedKeywords={setTrackedKeywords}
          />

          <MonitoringSourcesCard
            trackedXAccounts={trackedXAccounts}
            setTrackedXAccounts={setTrackedXAccounts}
            watchedWebsites={watchedWebsites}
            setWatchedWebsites={setWatchedWebsites}
          />

          {saveError && (
            <Alert severity="error" sx={{ borderRadius: '8px' }}>{saveError}</Alert>
          )}

          <Box>
            <Button
              variant="contained"
              onClick={() => save()}
              disabled={isPending}
              sx={{ minWidth: 180, height: 44 }}
              startIcon={isPending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : undefined}
            >
              {isPending ? 'Saving…' : 'Save channel config'}
            </Button>
          </Box>
        </Stack>
      )}

      <Snackbar
        open={snackOpen}
        autoHideDuration={3500}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
