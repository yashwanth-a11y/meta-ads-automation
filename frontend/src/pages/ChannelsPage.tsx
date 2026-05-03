import { useState, type KeyboardEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { trendsApi } from '../api/trends'
import { qk } from '../api/queryClient'
import type { Channel, ChannelApprover, ChannelTrendSources } from '../api/trends'
import { DEFAULT_SOURCES } from '../components/settings/constants'
import { ApprovalPublishingCard } from '../components/settings/channel/ApprovalPublishingCard'
import { TrendSourcesCard } from '../components/settings/channel/TrendSourcesCard'
import { ApproversCard } from '../components/settings/channel/ApproversCard'
import { KeywordsCard } from '../components/settings/channel/KeywordsCard'
import { MonitoringSourcesCard } from '../components/settings/channel/MonitoringSourcesCard'

// ─── Validation schema ────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Required'),
  brand_name: z.string().min(1, 'Required'),
  brand_description: z.string().optional(),
  industry: z.string().optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
  target_audience: z.string().optional(),
  language: z.string().default('en'),
})

type FormValues = z.infer<typeof schema>

const defaultValues: FormValues = {
  name: '',
  brand_name: '',
  brand_description: '',
  industry: '',
  niche: '',
  tone: '',
  target_audience: '',
  language: 'en',
}

// ─── Channel list skeleton ────────────────────────────────────────────────────

function ChannelSkeleton() {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '8px',
        border: '1px solid #dddddd57',
        bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
      }}
    >
      <Skeleton variant="text" width="55%" height={22} sx={{ mb: 0.5 }} />
      <Skeleton variant="text" width="40%" height={18} sx={{ mb: 1 }} />
      <Stack direction="row" spacing={0.75}>
        <Skeleton variant="rounded" width={64} height={22} sx={{ borderRadius: '8px' }} />
        <Skeleton variant="rounded" width={80} height={22} sx={{ borderRadius: '8px' }} />
      </Stack>
    </Box>
  )
}

// ─── Single channel card ──────────────────────────────────────────────────────

interface ChannelCardProps {
  channel: Channel
  selected: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onSettings: () => void
}

function ChannelCard({ channel, selected, onClick, onEdit, onDelete, onSettings }: ChannelCardProps) {
  const isActive = channel.status === 'active'
  const blockedCount = channel.blocked_topics?.length ?? 0
  const hasFooter = !!channel.tone || !!channel.target_audience || blockedCount > 0

  return (
    <GlassCard
      onClick={onClick}
      sx={{
        p: 2.25,
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderColor: selected ? alpha('#22D3EE', 0.55) : undefined,
        boxShadow: selected
          ? `0 0 0 2px ${alpha('#22D3EE', 0.22)}, 0 8px 24px ${alpha('#0F172A', 0.08)}`
          : undefined,
        '&:hover': {
          borderColor: selected ? alpha('#22D3EE', 0.7) : alpha('#22D3EE', 0.28),
        },
      }}
    >
      <Stack direction="row" spacing={1.75} sx={{ alignItems: 'flex-start', flex: 1 }}>
        <Stack sx={{ flex: 1, minWidth: 0 }} spacing={1.25}>
          {/* Header row: eyebrow + brand name + status, with action icons on the right */}
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Stack sx={{ minWidth: 0, flex: 1, gap: 0.75 }}>
              <Typography
                sx={{
                  color: 'text.disabled',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontSize: 10,
                  lineHeight: 1.2,
                  mb: 0.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {channel.name}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    color: 'text.primary',
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {channel.brand_name}
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.625}
                  sx={{
                    alignItems: 'center',
                    flexShrink: 0,
                    px: 0.875,
                    py: 0.25,
                    borderRadius: '4px',
                    bgcolor: isActive ? alpha('#34D399', 0.12) : alpha('#94A3B8', 0.12),
                    border: `1px solid ${isActive ? alpha('#34D399', 0.3) : alpha('#94A3B8', 0.22)}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isActive ? '#059669' : '#64748B',
                      textTransform: 'capitalize',
                      lineHeight: 1,
                    }}
                  >
                    {channel.status}
                  </Typography>
                </Stack>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={0.5} sx={{ ml: 1, flexShrink: 0, mt: -0.25 }}>
              <Tooltip title="Edit profile">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onEdit() }}
                  sx={{ color: 'primary.main', bgcolor: alpha('#22D3EE', 0.08), borderRadius: '4px' }}
                >
                  <EditOutlinedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Channel settings">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onSettings() }}
                  sx={{ color: '#A78BFA', bgcolor: alpha('#A78BFA', 0.08), borderRadius: '4px' }}
                >
                  <SettingsOutlinedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete channel">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  sx={{ color: 'error.main', bgcolor: alpha('#F87171', 0.08), borderRadius: '4px' }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Brand description */}
          {channel.brand_description && (
            <Typography
              variant="body1"
              sx={{
                color: 'text.secondary',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {channel.brand_description}
            </Typography>
          )}

          {/* Tags row */}
          {(channel.niche || channel.industry || channel.language) && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {channel.niche && (
                <Chip
                  label={channel.niche}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: '6px',
                    bgcolor: alpha('#22D3EE', 0.08),
                    color: '#0EA5B7',
                    border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                  }}
                />
              )}
              {channel.industry && (
                <Chip
                  label={channel.industry}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: '6px',
                    bgcolor: alpha('#64748B', 0.08),
                    color: '#475569',
                    border: `1px solid ${alpha('#64748B', 0.2)}`,
                  }}
                />
              )}
              {channel.language && (
                <Chip
                  label={channel.language.toUpperCase()}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: '6px',
                    bgcolor: alpha('#A78BFA', 0.08),
                    color: '#7C3AED',
                    border: `1px solid ${alpha('#A78BFA', 0.22)}`,
                    letterSpacing: '0.04em',
                  }}
                />
              )}
            </Stack>
          )}

          {/* Footer metadata */}
          {hasFooter && (
            <Stack
              direction="row"
              sx={{
                pt: 1,
                mt: 0.25,
                borderTop: `1px dashed ${alpha('#94A3B8', 0.22)}`,
                flexWrap: 'wrap',
                rowGap: 0.5,
                columnGap: 2,
                alignItems: 'center',
              }}
            >
              {channel.tone && (
                <Stack direction="row" spacing={0.625} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Tone : 
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {channel.tone}
                  </Typography>
                </Stack>
              )}
              {channel.target_audience && (
                <Stack direction="row" spacing={0.625} sx={{ alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Audience : 
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {channel.target_audience}
                  </Typography>
                </Stack>
              )}
              {blockedCount > 0 && (
                <Stack direction="row" spacing={0.625} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Blocked
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>
                    {blockedCount} topic{blockedCount === 1 ? '' : 's'}
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </Stack>
    </GlassCard>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ChannelsPage() {
  const client = useQueryClient()
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editChannel, setEditChannel] = useState<Channel | null>(null)
  const [blockedTopics, setBlockedTopics] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null)
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState(0)

  // ── Channel config state ───────────────────────────────────────────────────
  const [approvalMode, setApprovalMode] = useState<'manual' | 'auto'>('manual')
  const [threshold, setThreshold] = useState(8.5)
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

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: channels = [], isLoading } = useQuery({
    queryKey: qk.channels,
    queryFn: trendsApi.listChannels,
  })

  // ── Form ───────────────────────────────────────────────────────────────────

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // ── Mode helpers ───────────────────────────────────────────────────────────

  const resetToCreateMode = () => {
    setMode('create')
    setEditChannel(null)
    setMutationError(null)
    setBlockedTopics([])
    setTopicInput('')
    setDrawerTab(0)
    reset(defaultValues)
  }

  const openCreate = () => {
    resetToCreateMode()
    setDialogOpen(true)
  }

  const openEdit = (channel: Channel) => {
    setMode('edit')
    setEditChannel(channel)
    setMutationError(null)
    setBlockedTopics(channel.blocked_topics ?? [])
    setTopicInput('')
    setDrawerTab(0)
    reset({
      name: channel.name,
      brand_name: channel.brand_name,
      brand_description: channel.brand_description ?? '',
      industry: channel.industry ?? '',
      niche: channel.niche ?? '',
      tone: channel.tone ?? '',
      target_audience: channel.target_audience ?? '',
      language: channel.language,
    })
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
    setDialogOpen(true)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const { mutate: createChannel, isPending: isCreating } = useMutation({
    mutationFn: trendsApi.createChannel,
    onSuccess: (created) => {
      client.invalidateQueries({ queryKey: qk.channels })
      setSnackMsg(`Channel "${created.brand_name}" created.`)
      setSnackOpen(true)
      setMutationError(null)
      reset(defaultValues)
      setBlockedTopics([])
      setTopicInput('')
      setDialogOpen(false)
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to create channel. Please try again.')
    },
  })

  const { mutate: updateChannel, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof trendsApi.updateChannel>[1] & { blocked_topics?: string[] } }) =>
      trendsApi.updateChannel(id, data),
    onSuccess: (updated) => {
      client.invalidateQueries({ queryKey: qk.channels })
      setSnackMsg(`Channel "${updated.brand_name}" updated.`)
      setSnackOpen(true)
      setMutationError(null)
      setEditChannel(updated)
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to update channel.')
    },
  })

  const { mutate: deleteChannel, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => trendsApi.deleteChannel(id),
    onSuccess: () => {
      const deletedId = deleteTarget?.id
      client.invalidateQueries({ queryKey: qk.channels })
      setSnackMsg('Channel deleted.')
      setSnackOpen(true)
      setDeleteTarget(null)
      if (editChannel?.id === deletedId) {
        resetToCreateMode()
      }
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to delete channel.')
      setDeleteTarget(null)
    },
  })

  const isPending = isCreating || isUpdating

  const handleCloseDialog = () => {
    if (isPending) return
    setDialogOpen(false)
    setMutationError(null)
    reset()
    setBlockedTopics([])
    setTopicInput('')
  }

  const onSubmit = (values: FormValues) => {
    setMutationError(null)
    if (mode === 'edit' && editChannel) {
      updateChannel({
        id: editChannel.id,
        data: {
          ...values,
          blocked_topics: blockedTopics,
          approval_mode: approvalMode,
          auto_publish_threshold: String(threshold),
          posting_schedule: schedule,
          topic_cooldown_days: cooldown,
          instagram_account_id: instagramId || undefined,
          trend_sources: trendSources,
          brand_assets: {
            ...(editChannel.brand_assets ?? {}),
            approvers,
            tracked_x_accounts: trackedXAccounts,
            watched_websites: watchedWebsites,
          },
          products,
          competitors,
          tracked_keywords: trackedKeywords,
        },
      })
    } else {
      createChannel({ ...values, blocked_topics: blockedTopics })
    }
  }

  // ── Blocked topics ─────────────────────────────────────────────────────────

  const handleTopicKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = topicInput.trim()
      if (val && !blockedTopics.includes(val)) {
        setBlockedTopics((prev) => [...prev, val])
      }
      setTopicInput('')
    }
  }

  const removeTopic = (topic: string) => {
    setBlockedTopics((prev) => prev.filter((t) => t !== topic))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Channels"
        subtitle="Organize brand voices, languages, and positioning for each growth lane."
        action={
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddRoundedIcon />}
            onClick={openCreate}
            sx={{ minWidth: 180, height: 44 }}
          >
            Create channel
          </Button>
        }
      />

      <Stack spacing={1.5}>
        {isLoading ? (
          <>
            <ChannelSkeleton />
            <ChannelSkeleton />
            <ChannelSkeleton />
          </>
        ) : channels.length === 0 ? (
          <GlassCard sx={{ p: 4 }}>
            <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                No channels yet. Create your first one to get started.
              </Typography>
              {/* <Button
                variant="contained"
                color="primary"
                startIcon={<AddRoundedIcon />}
                onClick={() => setDialogOpen(true)}
              >
                Create channel
              </Button> */}
            </Stack>
          </GlassCard>
        ) : (
          <Grid container spacing={1.5} sx={{ alignItems: 'stretch' }}>
            {channels.map((ch) => (
              <Grid key={ch.id} size={{ xs: 12, sm: 6, lg: 4 }} sx={{ display: 'flex' }}>
                <ChannelCard
                  channel={ch}
                  selected={mode === 'edit' && editChannel?.id === ch.id}
                  onClick={() => openEdit(ch)}
                  onEdit={() => openEdit(ch)}
                  onDelete={() => setDeleteTarget(ch)}
                  onSettings={() => { openEdit(ch); setDrawerTab(1) }}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>

      {/* ── Create / Edit channel drawer ── */}
      <Drawer
        anchor="right"
        open={dialogOpen}
        onClose={handleCloseDialog}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 560, md: 720 },
              maxWidth: '100%',
              borderRadius: 0,
              border: 'none',
              borderLeft: '1px solid #dddddd57',
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            px: 3,
            pt: 2,
            pb: 1.5,
            flexShrink: 0,
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 700 }}>
              {mode === 'edit' ? 'Edit channel' : 'New channel'}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {mode === 'edit'
                ? 'Update brand voice, positioning, and pipeline config.'
                : 'Define the brand voice and positioning for this growth lane.'}
            </Typography>
          </Box>
          <IconButton
            aria-label="Close"
            onClick={handleCloseDialog}
            disabled={isPending}
            sx={{ color: 'text.secondary' }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        {mode === 'edit' && (
          <Tabs
            value={drawerTab}
            onChange={(_, v) => setDrawerTab(v)}
            sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
          >
            <Tab label="Profile" sx={{ fontWeight: 600, fontSize: 13 }} />
            <Tab label="Settings" sx={{ fontWeight: 600, fontSize: 13 }} />
          </Tabs>
        )}
        {mode === 'create' && <Divider />}
        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          <Box sx={{ px: 3, py: 3, flex: 1, overflowY: 'auto' }}>
            {/* Settings tab — only in edit mode */}
            {mode === 'edit' && drawerTab === 1 && (
              <Stack spacing={2.5}>
                <ApprovalPublishingCard
                  approvalMode={approvalMode} setApprovalMode={setApprovalMode}
                  threshold={threshold} setThreshold={setThreshold}
                  schedule={schedule} setSchedule={setSchedule}
                  cooldown={cooldown} setCooldown={setCooldown}
                  instagramId={instagramId} setInstagramId={setInstagramId}
                />
                <TrendSourcesCard trendSources={trendSources} setTrendSources={setTrendSources} />
                <KeywordsCard
                  products={products} setProducts={setProducts}
                  competitors={competitors} setCompetitors={setCompetitors}
                  trackedKeywords={trackedKeywords} setTrackedKeywords={setTrackedKeywords}
                />
                <MonitoringSourcesCard
                  trackedXAccounts={trackedXAccounts} setTrackedXAccounts={setTrackedXAccounts}
                  watchedWebsites={watchedWebsites} setWatchedWebsites={setWatchedWebsites}
                />
                <ApproversCard approvers={approvers} setApprovers={setApprovers} />
              </Stack>
            )}
            {/* Profile tab */}
            {drawerTab === 0 && (
              <Stack spacing={2}>
                {/* Channel name */}

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                     <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Channel name *"
                      placeholder="e.g. Premium Coaching"
                      autoComplete="off"
                      error={!!errors.name}
                      helperText={errors.name?.message ?? ' '}
                    />
                  )}
                />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                     {/* Brand name */}
                <Controller
                  name="brand_name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Brand name *"
                      placeholder="e.g. Photon Studios"
                      autoComplete="off"
                      error={!!errors.brand_name}
                      helperText={errors.brand_name?.message ?? ' '}
                    />
                  )}
                />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    {/* Brand description */}
                <Controller
                  name="brand_description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Brand description"
                      placeholder="What does this brand do and who does it serve?"
                      multiline
                      minRows={2}
                      autoComplete="off"
                      error={!!errors.brand_description}
                      helperText={errors.brand_description?.message ?? ' '}
                    />
                  )}
                />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Controller
                      name="industry"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Industry"
                          placeholder="e.g. Health & Wellness"
                          autoComplete="off"
                          error={!!errors.industry}
                          helperText={errors.industry?.message ?? ' '}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Controller
                      name="niche"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Niche"
                          placeholder="e.g. Subscription box, DTC"
                          autoComplete="off"
                          error={!!errors.niche}
                          helperText={errors.niche?.message ?? ' '}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="tone"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Tone"
                        placeholder="innovative, confident, helpful"
                        autoComplete="off"
                        error={!!errors.tone}
                        helperText={errors.tone?.message ?? ' '}
                      />
                    )}
                  />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="target_audience"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Target audience"
                        placeholder="e.g. Women 25–40, fitness-focused, mid-income"
                        autoComplete="off"
                        error={!!errors.target_audience}
                        helperText={errors.target_audience?.message ?? ' '}
                      />
                    )}
                  />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="language"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth error={!!errors.language}>
                        <InputLabel id="language-label">Language</InputLabel>
                        <Select {...field} labelId="language-label" label="Language">
                          <MenuItem value="en">English</MenuItem>
                          <MenuItem value="es">Spanish</MenuItem>
                          <MenuItem value="de">German</MenuItem>
                          <MenuItem value="fr">French</MenuItem>
                          <MenuItem value="ar">Arabic</MenuItem>
                          <MenuItem value="hi">Hindi</MenuItem>
                        </Select>
                        <FormHelperText>
                          {errors.language?.message ?? 'Used for AI copy and compliance templates.'}
                        </FormHelperText>
                      </FormControl>
                    )}
                  />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                      <Box>
                        <TextField
                          label="Blocked topics"
                          placeholder="Type a topic and press Enter to add"
                          value={topicInput}
                          onChange={(e) => setTopicInput(e.target.value)}
                          onKeyDown={handleTopicKeyDown}
                          autoComplete="off"
                          helperText="Topics the AI should never reference in generated content."
                        />
                        {blockedTopics.length > 0 && (
                          <Stack
                            direction="row"
                            spacing={0.75}
                            sx={{ flexWrap: 'wrap', gap: '6px !important', mt: 1.25 }}
                          >
                            {blockedTopics.map((topic) => (
                              <Chip
                                key={topic}
                                label={topic}
                                size="small"
                                onDelete={() => removeTopic(topic)}
                                sx={{
                                  height: 24,
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  borderRadius: '8px',
                                  bgcolor: alpha('#F87171', 0.1),
                                  color: '#DC2626',
                                  border: `1px solid ${alpha('#F87171', 0.28)}`,
                                  '& .MuiChip-deleteIcon': {
                                    fontSize: 14,
                                    color: alpha('#DC2626', 0.6),
                                    '&:hover': { color: '#DC2626' },
                                  },
                                }}
                              />
                            ))}
                          </Stack>
                        )}
                      </Box>

                  </Grid>
                </Grid>

               

              </Stack>
            )}
          </Box>

          <Divider />
          <Box
            sx={{
              px: 3,
              py: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5,
              flexShrink: 0,
            }}
          >
            {mutationError && (
              <Alert severity="error" sx={{ borderRadius: '8px', flex: 1, mr: 1 }}>
                {mutationError}
              </Alert>
            )}
            {!mutationError && <Box sx={{ flex: 1 }} />}
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              onClick={handleCloseDialog}
              disabled={isPending}
              sx={{ height: 44 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isPending}
              sx={{ minWidth: 160, height: 44 }}
              startIcon={
                isPending ? (
                  <CircularProgress size={16} sx={{ color: 'inherit' }} />
                ) : undefined
              }
            >
              {mode === 'edit'
                ? isPending ? 'Saving…' : 'Save changes'
                : isPending ? 'Creating…' : 'Create channel'}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        slotProps={{
          paper: { sx: { borderRadius: '12px', minWidth: 360 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete channel?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{deleteTarget?.brand_name}</strong>. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteTarget && deleteChannel(deleteTarget.id)}
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success snackbar */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="success"
          onClose={() => setSnackOpen(false)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
