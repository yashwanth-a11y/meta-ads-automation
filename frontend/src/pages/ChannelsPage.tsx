import { useState, type KeyboardEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
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
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
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
}

function ChannelCard({ channel, selected, onClick }: ChannelCardProps) {
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
      {/* Row 1: brand name + status */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}
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
            bgcolor:
              channel.status === 'active' ? alpha('#34D399', 0.14) : alpha('#94A3B8', 0.14),
            color: channel.status === 'active' ? '#059669' : '#64748B',
            border: `1px solid ${channel.status === 'active' ? alpha('#34D399', 0.35) : alpha('#94A3B8', 0.25)}`,
          }}
        />
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [blockedTopics, setBlockedTopics] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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
    defaultValues: {
      name: '',
      brand_name: '',
      brand_description: '',
      industry: '',
      niche: '',
      tone: '',
      target_audience: '',
      language: 'en',
    },
  })

  // ── Mutation ───────────────────────────────────────────────────────────────

  const { mutate: createChannel, isPending } = useMutation({
    mutationFn: trendsApi.createChannel,
    onSuccess: (created) => {
      client.invalidateQueries({ queryKey: qk.channels })
      setSnackMsg(`Channel "${created.brand_name}" created successfully.`)
      setSnackOpen(true)
      setMutationError(null)
      reset()
      setBlockedTopics([])
      setTopicInput('')
      setDialogOpen(false)
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Failed to create channel. Please try again.')
    },
  })

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
    createChannel({
      ...values,
      blocked_topics: blockedTopics,
    })
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
            onClick={() => setDialogOpen(true)}
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
          <Grid container spacing={1.5}>
            {channels.map((ch) => (
              <Grid key={ch.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <ChannelCard
                  channel={ch}
                  selected={selectedId === ch.id}
                  onClick={() => setSelectedId(ch.id === selectedId ? null : ch.id)}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>

      {/* ── Create channel dialog ── */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: '16px',
              border: '1px solid #dddddd57',
              boxShadow: `0 24px 60px ${alpha('#0F172A', 0.18)}`,
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pr: 1.5,
            py: 2,
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              New channel
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              Define the brand voice and positioning for this growth lane.
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
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
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

               

                {/* Blocked topics */}

                {/* Error state */}
                {mutationError && (
                  <Alert severity="error" sx={{ borderRadius: '8px' }}>
                    {mutationError}
                  </Alert>
                )}

                {/* Submit */}
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ pt: 0.5, justifyContent: 'flex-end' }}
                >
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
                    sx={{ minWidth: 180, height: 44 }}
                    startIcon={
                      isPending ? (
                        <CircularProgress size={16} sx={{ color: 'inherit' }} />
                      ) : undefined
                    }
                  >
                    {isPending ? 'Creating…' : 'Create channel'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </DialogContent>
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
