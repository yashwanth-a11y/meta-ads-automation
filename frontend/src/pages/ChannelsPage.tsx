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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import AddIcon from '@mui/icons-material/Add'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { trendsApi } from '../api/trends'
import { qk } from '../api/queryClient'
import type { Channel } from '../api/trends'

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
}

function ChannelCard({ channel, selected, onClick, onEdit, onDelete }: ChannelCardProps) {
  return (
    <GlassCard
      onClick={onClick}
      sx={{
        p: 2,
        cursor: 'pointer',
        borderColor: selected ? alpha('#22D3EE', 0.55) : undefined,
        boxShadow: selected
          ? `0 0 0 2px ${alpha('#22D3EE', 0.22)}, 0 8px 24px ${alpha('#0F172A', 0.08)}`
          : undefined,
        '&:hover': {
          borderColor: selected ? alpha('#22D3EE', 0.7) : alpha('#22D3EE', 0.28),
        },
      }}
    >
      {/* Row 1: brand name + status + actions */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {channel.brand_name}
          </Typography>
          <Chip
            label={channel.status}
            size="small"
            sx={{
              height: 20,
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '6px',
              flexShrink: 0,
              bgcolor:
                channel.status === 'active' ? alpha('#34D399', 0.14) : alpha('#94A3B8', 0.14),
              color: channel.status === 'active' ? '#059669' : '#64748B',
              border: `1px solid ${channel.status === 'active' ? alpha('#34D399', 0.35) : alpha('#94A3B8', 0.25)}`,
            }}
          />
        </Stack>
        <Stack direction="row" spacing={0.25} sx={{ ml: 1, flexShrink: 0 }}>
          <Tooltip title="Edit channel">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: alpha('#22D3EE', 0.08) } }}
            >
              <EditOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete channel">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: alpha('#F87171', 0.08) } }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Row 2: channel name */}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1, lineHeight: 1.4 }}>
        {channel.name}
      </Typography>

      {/* Row 3: niche + industry tags */}
      {(channel.niche || channel.industry) && (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', mb: 1 }}>
          {channel.niche && (
            <Chip
              label={channel.niche}
              size="small"
              sx={{
                height: 20,
                fontSize: '10px',
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
                height: 20,
                fontSize: '10px',
                fontWeight: 600,
                borderRadius: '6px',
                bgcolor: alpha('#64748B', 0.08),
                color: '#64748B',
                border: `1px solid ${alpha('#64748B', 0.2)}`,
              }}
            />
          )}
        </Stack>
      )}

      {/* Row 4: tone */}
      {channel.tone && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            fontStyle: 'italic',
            display: 'block',
            lineHeight: 1.4,
          }}
        >
          {channel.tone}
        </Typography>
      )}
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

  const openCreate = () => {
    setMode('create')
    setEditChannel(null)
    setMutationError(null)
    setBlockedTopics([])
    setTopicInput('')
    reset(defaultValues)
  }

  const openEdit = (channel: Channel) => {
    setMode('edit')
    setEditChannel(channel)
    setMutationError(null)
    setBlockedTopics(channel.blocked_topics ?? [])
    setTopicInput('')
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
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to create channel.')
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
        openCreate()
      }
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to delete channel.')
      setDeleteTarget(null)
    },
  })

  const isPending = isCreating || isUpdating

  const onSubmit = (values: FormValues) => {
    setMutationError(null)
    if (mode === 'edit' && editChannel) {
      updateChannel({ id: editChannel.id, data: { ...values, blocked_topics: blockedTopics } })
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
      />

      <Grid container spacing={2.5} sx={{ alignItems: 'flex-start' }}>
        {/* ── Left: channel list ── */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={1.5}>
            <Button
              variant={mode === 'create' ? 'contained' : 'outlined'}
              size="small"
              startIcon={<AddIcon />}
              onClick={openCreate}
              sx={{ alignSelf: 'flex-start', borderRadius: '8px', height: 36 }}
            >
              New channel
            </Button>

            {isLoading ? (
              <>
                <ChannelSkeleton />
                <ChannelSkeleton />
                <ChannelSkeleton />
              </>
            ) : channels.length === 0 ? (
              <GlassCard sx={{ p: 3 }}>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ textAlign: 'center', lineHeight: 1.6 }}
                >
                  No channels yet. Create your first one &rarr;
                </Typography>
              </GlassCard>
            ) : (
              channels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  selected={mode === 'edit' && editChannel?.id === ch.id}
                  onClick={() => openEdit(ch)}
                  onEdit={() => openEdit(ch)}
                  onDelete={() => setDeleteTarget(ch)}
                />
              ))
            )}
          </Stack>
        </Grid>

        {/* ── Right: create / edit form ── */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <GlassCard glow sx={{ p: 3 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
              <Typography variant="h2" sx={{ color: 'text.primary' }}>
                {mode === 'edit' ? `Edit: ${editChannel?.brand_name}` : 'New channel'}
              </Typography>
              {mode === 'edit' && (
                <Tooltip title="Delete this channel">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => editChannel && setDeleteTarget(editChannel)}
                    sx={{ '&:hover': { bgcolor: alpha('#F87171', 0.1) } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>

            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Stack spacing={2}>
                {/* Channel name */}
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

                {/* Industry + Niche side by side */}
                <Grid container spacing={1.5}>
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
                </Grid>

                {/* Tone */}
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

                {/* Target audience */}
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

                {/* Language */}
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

                {/* Blocked topics */}
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

                {/* Error state */}
                {mutationError && (
                  <Alert severity="error" sx={{ borderRadius: '8px' }}>
                    {mutationError}
                  </Alert>
                )}

                {/* Actions */}
                <Stack direction="row" spacing={1.5} sx={{ pt: 0.5 }}>
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
                  {mode === 'edit' && (
                    <Button
                      variant="outlined"
                      onClick={openCreate}
                      sx={{ height: 44 }}
                    >
                      Cancel
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>
          </GlassCard>
        </Grid>
      </Grid>

      {/* ── Delete confirmation dialog ── */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: '12px', minWidth: 360 } }}
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
