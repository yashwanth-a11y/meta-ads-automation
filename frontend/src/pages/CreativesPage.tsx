import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import PublishRoundedIcon from '@mui/icons-material/PublishRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import ViewCarouselRoundedIcon from '@mui/icons-material/ViewCarouselRounded'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { apiFetch } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentType = 'reel' | 'image' | 'image_post' | 'carousel' | 'story'
type BundleStatus = 'draft' | 'ready' | 'approved' | 'published' | 'rejected'

interface Channel {
  id: string
  name: string
  brand_name: string
}

interface RecentBundle {
  id: string
  content_type: ContentType
  channel_id?: string
  channel_name?: string
  status: BundleStatus
  hook?: string
  caption?: string
  hashtags?: string[]
  image_prompts?: string[]
  script?: string
  voiceover_text?: string
  thumbnail_url?: string
  image_urls?: string[]
  video_url?: string
  scheduled_publish_at?: string | null
  score_composite?: string | null
  created_at: string
}

type RenderState = {
  jobId: string | null
  status: string
  progress: number
  videoUrl: string | null
  error?: string | null
} | null

type ReelCreative = {
  id: string
  script: string
  hook: string
  caption: string
  createdAt: string
  updatedAt: string
  render: RenderState
}

interface ImageResult {
  image_url: string
  caption: string
  hashtags: string[]
}

interface CarouselResult {
  slide_images: string[]
  caption: string
  hashtags: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg =
      (err as { error?: { message?: string } })?.error?.message ??
      (err as { message?: string })?.message ??
      `Request failed (${r.status})`
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

// ─── Status/type badge configs ────────────────────────────────────────────────

const STATUS_COLORS: Record<BundleStatus, { bg: string; color: string; border: string; label: string }> = {
  draft: { bg: alpha('#94A3B8', 0.12), color: '#64748B', border: alpha('#94A3B8', 0.28), label: 'Draft' },
  ready: { bg: alpha('#FBBF24', 0.12), color: '#B45309', border: alpha('#FBBF24', 0.35), label: 'Ready' },
  approved: { bg: alpha('#34D399', 0.12), color: '#059669', border: alpha('#34D399', 0.3), label: 'Approved' },
  published: { bg: alpha('#22D3EE', 0.12), color: '#0891B2', border: alpha('#22D3EE', 0.3), label: 'Published' },
  rejected: { bg: alpha('#F87171', 0.12), color: '#DC2626', border: alpha('#F87171', 0.28), label: 'Rejected' },
}

const TYPE_COLORS: Record<ContentType, { bg: string; color: string; border: string; label: string }> = {
  reel: { bg: alpha('#A78BFA', 0.12), color: '#7C3AED', border: alpha('#A78BFA', 0.3), label: 'Reel' },
  image: { bg: alpha('#60A5FA', 0.12), color: '#2563EB', border: alpha('#60A5FA', 0.3), label: 'Image' },
  image_post: { bg: alpha('#60A5FA', 0.12), color: '#2563EB', border: alpha('#60A5FA', 0.3), label: 'Image Post' },
  carousel: { bg: alpha('#FB923C', 0.12), color: '#EA580C', border: alpha('#FB923C', 0.28), label: 'Carousel' },
  story: { bg: alpha('#F472B6', 0.12), color: '#DB2777', border: alpha('#F472B6', 0.28), label: 'Story' },
}

// ─── No channel selected empty state ─────────────────────────────────────────

function NoChannelState() {
  return (
    <Box
      sx={{
        py: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '14px',
          bgcolor: alpha('#22D3EE', 0.08),
          border: `1px solid ${alpha('#22D3EE', 0.18)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <HubOutlinedIcon sx={{ fontSize: 26, color: '#0891B2' }} />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
        Select a channel first
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 340 }}>
        Choose a channel from the dropdown above to generate content for that brand.
      </Typography>
    </Box>
  )
}

// ─── Channel selector ─────────────────────────────────────────────────────────

interface ChannelSelectorProps {
  channels: Channel[]
  loading: boolean
  value: string
  onChange: (id: string) => void
}

function ChannelSelector({ channels, loading, value, onChange }: ChannelSelectorProps) {
  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="creative-channel-label" sx={{ fontSize: 13 }}>
        Select channel
      </InputLabel>
      <Select
        labelId="creative-channel-label"
        label="Select channel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        sx={{ fontSize: 13 }}
      >
        <MenuItem value="">
          <em>No channel selected</em>
        </MenuItem>
        {channels.map((ch) => (
          <MenuItem key={ch.id} value={ch.id} sx={{ fontSize: 13 }}>
            {ch.brand_name || ch.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

// ─── Schedule modal (inline drawer) ──────────────────────────────────────────

interface ScheduleDrawerProps {
  open: boolean
  bundleId: string | null
  onClose: () => void
  onScheduled: () => void
}

function ScheduleDrawer({ open, bundleId, onClose, onScheduled }: ScheduleDrawerProps) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setError(null)
    }
  }, [open])

  const handleConfirm = async () => {
    if (!bundleId || !value) return
    setLoading(true)
    setError(null)
    try {
      const iso = new Date(value).toISOString()
      const r = await apiFetch(`/api/v1/calendar/${bundleId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduled_publish_at: iso }),
      })
      await parseJson<unknown>(r)
      onScheduled()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule post.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 380 },
            borderLeft: '1px solid #dddddd57',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: '1px solid #dddddd57' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Schedule Post
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose when to publish this post.
        </Typography>
      </Box>
      <Box sx={{ flex: 1, px: 3, py: 3 }}>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: '8px' }}>
              {error}
            </Alert>
          )}
          <TextField
            type="datetime-local"
            label="Publish date &amp; time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <ScheduleRoundedIcon />}
            onClick={() => void handleConfirm()}
            disabled={loading || !value}
            sx={{ height: 44 }}
          >
            {loading ? 'Scheduling…' : 'Schedule Post'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

// ─── Recent creatives grid ────────────────────────────────────────────────────

type GalleryFilter = 'all' | 'reel' | 'image_post' | 'carousel'
type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom'

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date()
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  if (preset === 'today') return { from: startOfDay(now), to: new Date(now.getTime() + 86400000) }
  if (preset === '7d') return { from: new Date(now.getTime() - 7 * 86400000), to: null }
  if (preset === '30d') return { from: new Date(now.getTime() - 30 * 86400000), to: null }
  return { from: null, to: null }
}

interface CreativeLibraryProps {
  channels: Channel[]
  refreshKey: number
  typeFilter: GalleryFilter
  datePreset: DatePreset
  customFrom: string
  customTo: string
  onBundlesLoaded: (bundles: RecentBundle[]) => void
}

function CreativeLibrary({ channels, refreshKey, typeFilter, datePreset, customFrom, customTo, onBundlesLoaded }: CreativeLibraryProps) {
  const [bundles, setBundles] = useState<RecentBundle[]>([])
  const [loading, setLoading] = useState(false)
  const [detailBundle, setDetailBundle] = useState<RecentBundle | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  const [detailIdx, setDetailIdx] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/v1/calendar?limit=100')
      if (r.ok) {
        const data = await r.json() as RecentBundle[] | { bundles?: RecentBundle[] }
        const list: RecentBundle[] = Array.isArray(data) ? data : (data.bundles ?? [])
        const mapped = list.map((b) => ({
          ...b,
          channel_name: b.channel_name ?? channels.find((c) => c.id === b.channel_id)?.brand_name,
        }))
        setBundles(mapped)
        onBundlesLoaded(mapped)
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [channels, onBundlesLoaded])

  useEffect(() => { void load() }, [load, refreshKey])

  const filtered = useMemo(() => {
    let list = bundles
    if (typeFilter !== 'all') {
      list = list.filter((b) =>
        typeFilter === 'image_post'
          ? b.content_type === 'image_post' || b.content_type === 'image'
          : b.content_type === typeFilter
      )
    }
    if (datePreset !== 'all') {
      const { from, to } = datePreset === 'custom'
        ? { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(customTo + 'T23:59:59') : null }
        : getPresetRange(datePreset)
      if (from || to) {
        list = list.filter((b) => {
          const d = new Date(b.created_at)
          if (from && d < from) return false
          if (to && d > to) return false
          return true
        })
      }
    }
    return list
  }, [bundles, typeFilter, datePreset, customFrom, customTo])

  useEffect(() => {
    if (!detailOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const next = Math.min(detailIdx + 1, filtered.length - 1)
        setDetailIdx(next); setDetailBundle(filtered[next]); setImgIdx(0)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const prev = Math.max(detailIdx - 1, 0)
        setDetailIdx(prev); setDetailBundle(filtered[prev]); setImgIdx(0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detailOpen, detailIdx, filtered])

  const handleCopy = () => {
    if (!detailBundle?.caption) return
    navigator.clipboard.writeText(detailBundle.caption).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePublishNow = async () => {
    if (!detailBundle?.id) return
    setPublishing(true)
    try {
      const r = await apiFetch(`/api/v1/calendar/${detailBundle.id}/publish`, { method: 'POST' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Publish failed')
      }
      setSnackMsg('Published successfully!')
      setSnackOpen(true)
      setDetailOpen(false)
      void load()
    } catch (e) {
      setSnackMsg(e instanceof Error ? e.message : 'Publish failed')
      setSnackOpen(true)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Box>
      {/* (filters rendered in parent header) */}

      {/* Gallery grid */}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 2 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: '12px' }} />
          ))}
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            {bundles.length === 0
              ? 'No content generated yet. Generate your first image post or carousel above.'
              : `No ${typeFilter === 'all' ? '' : typeFilter.replace('_', ' ') + ' '}content found.`}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 2 }}>
          {filtered.map((bundle, index) => {
            const ct = TYPE_COLORS[bundle.content_type] ?? TYPE_COLORS.image
            const st = STATUS_COLORS[bundle.status] ?? STATUS_COLORS.draft
            const thumb = bundle.thumbnail_url ?? bundle.image_urls?.[0]
            const isReel = bundle.content_type === 'reel'

            return (
              <Box
                key={bundle.id}
                onClick={() => { setDetailBundle(bundle); setDetailIdx(index); setImgIdx(0); setDetailOpen(true) }}
                sx={{
                  borderRadius: '12px',
                  border: '1px solid #dddddd57',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.9),
                  transition: 'all 180ms ease',
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    borderColor: alpha('#22D3EE', 0.4),
                    transform: 'translateY(-3px)',
                    boxShadow: `0 10px 28px ${alpha('#0F172A', 0.12)}`,
                  },
                }}
              >
                {/* Thumbnail */}
                <Box
                  sx={{
                    width: '100%',
                    height: 200,
                    position: 'relative',
                    bgcolor: alpha('#0F172A', 0.06),
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {thumb ? (
                    <Box
                      component="img"
                      src={thumb}
                      alt=""
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isReel ? (
                        <VideoLibraryRoundedIcon sx={{ fontSize: 36, color: 'text.disabled', opacity: 0.35 }} />
                      ) : bundle.content_type === 'carousel' ? (
                        <SlideshowRoundedIcon sx={{ fontSize: 36, color: 'text.disabled', opacity: 0.35 }} />
                      ) : (
                        <ImageRoundedIcon sx={{ fontSize: 36, color: 'text.disabled', opacity: 0.35 }} />
                      )}
                    </Box>
                  )}

                  {/* Type badge — top left */}
                  <Box
                    sx={{
                      position: 'absolute', top: 7, left: 7,
                      px: 0.875, py: 0.35, borderRadius: '5px',
                      bgcolor: alpha('#0F172A', 0.62), backdropFilter: 'blur(6px)',
                    }}
                  >
                    <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: ct.color, lineHeight: 1 }}>
                      {ct.label}
                    </Typography>
                  </Box>

                  {/* Status badge — top right */}
                  <Box
                    sx={{
                      position: 'absolute', top: 7, right: 7,
                      px: 0.875, py: 0.35, borderRadius: '5px',
                      bgcolor: alpha('#0F172A', 0.62), backdropFilter: 'blur(6px)',
                    }}
                  >
                    <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: st.color, lineHeight: 1 }}>
                      {st.label}
                    </Typography>
                  </Box>

                  {/* Slide count for carousels */}
                  {bundle.content_type === 'carousel' && (bundle.image_urls?.length ?? 0) > 1 && (
                    <Box
                      sx={{
                        position: 'absolute', bottom: 7, right: 7,
                        px: 0.875, py: 0.35, borderRadius: '5px',
                        bgcolor: alpha('#0F172A', 0.62), backdropFilter: 'blur(6px)',
                      }}
                    >
                      <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
                        {bundle.image_urls!.length} slides
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Info row */}
                <Box sx={{ px: 1.25, pt: 1, pb: 1.25, flex: 1 }}>
                  {bundle.hook ? (
                    <Typography
                      sx={{
                        fontSize: 12, fontWeight: 600, color: 'text.primary', lineHeight: 1.4, mb: 0.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {bundle.hook}
                    </Typography>
                  ) : bundle.caption ? (
                    <Typography
                      sx={{
                        fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4, mb: 0.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {bundle.caption}
                    </Typography>
                  ) : null}
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
                    {bundle.channel_name && (
                      <Typography
                        sx={{
                          fontSize: 10, color: 'text.disabled', fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%',
                        }}
                      >
                        {bundle.channel_name}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', ml: 'auto' }}>
                      {new Date(bundle.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Detail drawer */}
      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 480 },
              borderLeft: '1px solid #dddddd57',
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}
      >
        {detailBundle && (
          <>
            {/* Header */}
            <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: '1px solid #dddddd57', flexShrink: 0 }}>
              <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.75 }}>Creative Details</Typography>
                  <Stack direction="row" spacing={0.75}>
                    {(() => {
                      const ct = TYPE_COLORS[detailBundle.content_type] ?? TYPE_COLORS.image
                      const st = STATUS_COLORS[detailBundle.status] ?? STATUS_COLORS.draft
                      return (
                        <>
                          <Box sx={{ px: 0.75, py: 0.3, borderRadius: '5px', bgcolor: ct.bg, border: `1px solid ${ct.border}` }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: ct.color, lineHeight: 1 }}>{ct.label}</Typography>
                          </Box>
                          <Box sx={{ px: 0.75, py: 0.3, borderRadius: '5px', bgcolor: st.bg, border: `1px solid ${st.border}` }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: st.color, lineHeight: 1 }}>{st.label}</Typography>
                          </Box>
                        </>
                      )
                    })()}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Tooltip title="Previous (←)">
                    <span>
                      <IconButton size="small" disabled={detailIdx <= 0} onClick={() => { const p = detailIdx - 1; setDetailIdx(p); setDetailBundle(filtered[p]); setImgIdx(0) }} sx={{ color: 'text.secondary' }}>
                        <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Typography variant="caption" sx={{ color: 'text.disabled', minWidth: 32, textAlign: 'center', fontSize: 11 }}>
                    {detailIdx + 1}/{filtered.length}
                  </Typography>
                  <Tooltip title="Next (→)">
                    <span>
                      <IconButton size="small" disabled={detailIdx >= filtered.length - 1} onClick={() => { const n = detailIdx + 1; setDetailIdx(n); setDetailBundle(filtered[n]); setImgIdx(0) }} sx={{ color: 'text.secondary' }}>
                        <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <IconButton size="small" onClick={() => setDetailOpen(false)} sx={{ color: 'text.secondary', ml: 0.5 }}>
                    <CloseRoundedIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </Box>

            {/* Scrollable body */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
              <Stack spacing={2.5}>
                {/* Image viewer */}
                {detailBundle.image_urls && detailBundle.image_urls.length > 0 && (
                  <Box>
                    <Box
                      sx={{
                        width: '100%',
                        aspectRatio: detailBundle.content_type === 'reel' ? '9/16' : '4/3',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        bgcolor: alpha('#0F172A', 0.06),
                      }}
                    >
                      <Box
                        component="img"
                        src={detailBundle.image_urls[imgIdx]}
                        alt={`Slide ${imgIdx + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </Box>
                    {detailBundle.image_urls.length > 1 && (
                      <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, overflowX: 'auto', pb: 0.5 }}>
                        {detailBundle.image_urls.map((url, i) => (
                          <Box
                            key={i}
                            onClick={() => setImgIdx(i)}
                            sx={{
                              width: 52, height: 52, flexShrink: 0, borderRadius: '7px',
                              overflow: 'hidden', cursor: 'pointer',
                              border: `2px solid ${i === imgIdx ? '#22D3EE' : 'transparent'}`,
                              opacity: i === imgIdx ? 1 : 0.55,
                              transition: 'all 120ms ease',
                            }}
                          >
                            <Box
                              component="img"
                              src={url}
                              alt=""
                              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}

                {/* Hook */}
                {detailBundle.hook && (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>Hook</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.5 }}>{detailBundle.hook}</Typography>
                  </Box>
                )}

                {/* Image prompt(s) used */}
                {detailBundle.image_prompts && detailBundle.image_prompts.length > 0 && (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
                      {detailBundle.image_prompts.length > 1 ? 'Image Prompts Used' : 'Image Prompt Used'}
                    </Typography>
                    <Stack spacing={0.75}>
                      {detailBundle.image_prompts.map((p, i) => (
                        <Box
                          key={i}
                          sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#0F172A', 0.04), border: '1px solid #dddddd57' }}
                        >
                          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
                            {detailBundle.image_prompts!.length > 1 ? `[${i + 1}] ` : ''}{p}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Script for reels */}
                {(detailBundle.content_type === 'reel') && detailBundle.script && (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>Script</Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{detailBundle.script}</Typography>
                  </Box>
                )}

                {/* Caption */}
                {detailBundle.caption && (
                  <Box>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Caption</Typography>
                      <Tooltip title={copied ? 'Copied!' : 'Copy caption'}>
                        <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? '#059669' : 'text.secondary' }}>
                          <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <Typography variant="body2" sx={{ lineHeight: 1.65, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
                      {detailBundle.caption}
                    </Typography>
                  </Box>
                )}

                {/* Hashtags */}
                {detailBundle.hashtags && detailBundle.hashtags.length > 0 && (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>Hashtags</Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                      {detailBundle.hashtags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag.startsWith('#') ? tag : `#${tag}`}
                          size="small"
                          sx={{
                            height: 26, fontSize: 11, fontWeight: 600, borderRadius: '6px',
                            bgcolor: alpha('#22D3EE', 0.08), color: '#0891B2',
                            border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Channel + date */}
                <Box sx={{ pt: 0.5, borderTop: '1px dashed #dddddd57' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    {detailBundle.channel_name && (
                      <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}>
                        {detailBundle.channel_name}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: 11, color: 'text.disabled', ml: 'auto' }}>
                      {new Date(detailBundle.created_at).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </Typography>
                  </Stack>
                </Box>
              </Stack>
            </Box>

            {/* Actions footer */}
            <Box sx={{ px: 3, py: 2, borderTop: '1px solid #dddddd57', flexShrink: 0 }}>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="outlined" size="medium"
                  startIcon={<ScheduleRoundedIcon />}
                  onClick={() => setScheduleOpen(true)}
                  sx={{ flex: 1 }}
                >
                  Schedule
                </Button>
                <Button
                  variant="contained" color="primary" size="medium"
                  startIcon={publishing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <PublishRoundedIcon />}
                  onClick={() => void handlePublishNow()}
                  disabled={publishing}
                  sx={{ flex: 1 }}
                >
                  {publishing ? 'Publishing…' : 'Publish Now'}
                </Button>
              </Stack>
            </Box>
          </>
        )}
      </Drawer>

      <ScheduleDrawer
        open={scheduleOpen}
        bundleId={detailBundle?.id ?? null}
        onClose={() => setScheduleOpen(false)}
        onScheduled={() => { setSnackMsg('Scheduled!'); setSnackOpen(true); void load() }}
      />

      <Snackbar
        open={snackOpen}
        autoHideDuration={3500}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackMsg.toLowerCase().includes('fail') || snackMsg.toLowerCase().includes('error') ? 'error' : 'success'}
          onClose={() => setSnackOpen(false)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Box>
  )
}

// ─── Tab 0: Reel (Quick Generate) ────────────────────────────────────────────

type QuickGenMode = 'image_post' | 'carousel' | 'reel'

interface QuickResult {
  hook?: string
  caption: string
  hashtags: string[]
  image_urls?: string[]
  script?: string
  bundleId?: string
}

interface ReelTabProps {
  channelId: string
  onGenerated?: (label: string) => void
}

function ReelTab({ channelId, onGenerated }: ReelTabProps) {
  const [mode, setMode] = useState<QuickGenMode>('reel')
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<QuickResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)

  const MODES: { value: QuickGenMode; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'image_post', label: 'Image Post', icon: <ImageRoundedIcon sx={{ fontSize: 15 }} />, color: '#10B981' },
    { value: 'carousel', label: 'Carousel', icon: <ViewCarouselRoundedIcon sx={{ fontSize: 15 }} />, color: '#F59E0B' },
    { value: 'reel', label: 'Reel Script', icon: <VideoLibraryRoundedIcon sx={{ fontSize: 15 }} />, color: '#8B5CF6' },
  ]

  const PLACEHOLDERS: Record<QuickGenMode, string> = {
    image_post: 'e.g. A minimalist flat-lay of our new skincare range with soft morning light.',
    carousel: 'e.g. 5 tips to grow your Instagram organically — friendly educational tone.',
    reel: 'e.g. 30-second reel about our summer sale — energetic, Gen Z humor, trending audio vibe.',
  }

  const BUTTON_LABELS: Record<QuickGenMode, string> = {
    image_post: 'Generate Image Post',
    carousel: 'Generate Carousel',
    reel: 'Generate Reel Script',
  }

  const needsChannel = mode === 'image_post' || mode === 'carousel'
  const canGenerate = Boolean(brief.trim()) && (!needsChannel || Boolean(channelId))

  const handleGenerate = async () => {
    if (!brief.trim()) { setError('Enter a brief or idea first.'); return }
    setGenerating(true)
    setError(null)
    setResult(null)
    setShowScript(false)
    try {
      if (mode === 'image_post') {
        const r = await apiFetch('/api/v1/creatives/generate-image', {
          method: 'POST',
          body: JSON.stringify({ channel_id: channelId, prompt: brief }),
        })
        const data = await parseJson<{
          bundle?: { id?: string; hook?: string; caption?: string; hashtags?: string[]; image_urls?: string[] }
          image_urls?: string[]
          caption?: string
          hashtags?: string[]
          id?: string
          bundle_id?: string
        }>(r)
        const bundle = data.bundle
        setResult({
          hook: bundle?.hook,
          caption: bundle?.caption ?? data.caption ?? '',
          hashtags: bundle?.hashtags ?? data.hashtags ?? [],
          image_urls: bundle?.image_urls ?? data.image_urls ?? [],
          bundleId: bundle?.id ?? data.bundle_id ?? data.id,
        })
        onGenerated?.('Image Post created!')
      } else if (mode === 'carousel') {
        const r = await apiFetch('/api/v1/creatives/generate-carousel', {
          method: 'POST',
          body: JSON.stringify({ channel_id: channelId, prompt: brief }),
        })
        const data = await parseJson<{
          bundle?: { id?: string; hook?: string; caption?: string; hashtags?: string[]; image_urls?: string[] }
          slide_images?: string[]
          caption?: string
          hashtags?: string[]
          id?: string
          bundle_id?: string
        }>(r)
        const bundle = data.bundle
        setResult({
          hook: bundle?.hook,
          caption: bundle?.caption ?? data.caption ?? '',
          hashtags: bundle?.hashtags ?? data.hashtags ?? [],
          image_urls: bundle?.image_urls ?? data.slide_images ?? [],
          bundleId: bundle?.id ?? data.bundle_id ?? data.id,
        })
        onGenerated?.('Carousel created!')
      } else {
        const r = await apiFetch('/api/v1/creatives/generate-script', {
          method: 'POST',
          body: JSON.stringify({ prompt: brief }),
        })
        const data = await parseJson<{
          script?: string
          hook?: string
          caption?: string
          hashtags?: string[]
          id?: string
          bundle_id?: string
        }>(r)
        setResult({
          hook: data.hook,
          caption: data.caption ?? '',
          hashtags: data.hashtags ?? [],
          script: data.script,
          bundleId: data.bundle_id ?? data.id,
        })
        onGenerated?.('Reel script generated!')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyCaption = () => {
    if (!result?.caption) return
    navigator.clipboard.writeText(result.caption).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePublishNow = async () => {
    if (!result?.bundleId) return
    setPublishing(true)
    setError(null)
    try {
      const r = await apiFetch(`/api/v1/calendar/${result.bundleId}/publish`, { method: 'POST' })
      await parseJson<unknown>(r)
      setSnackMsg('Post published successfully.')
      setSnackOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setPublishing(false)
    }
  }

  const HashtagRow = ({ tags }: { tags: string[] }) => (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
      {tags.map((tag) => (
        <Chip
          key={tag}
          label={tag.startsWith('#') ? tag : `#${tag}`}
          size="small"
          sx={{
            height: 26, fontSize: 11, fontWeight: 600, borderRadius: '6px',
            bgcolor: alpha('#22D3EE', 0.08), color: '#0891B2',
            border: `1px solid ${alpha('#22D3EE', 0.2)}`,
          }}
        />
      ))}
    </Stack>
  )

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Generate form — type picker + brief + button in one compact card */}
      <GlassCard glow sx={{ p: 2.5 }}>
        {/* Type picker row */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5, flexShrink: 0 }}>
            Create a:
          </Typography>
          {MODES.map(({ value, label, icon, color }) => {
            const selected = mode === value
            return (
              <Box
                key={value}
                onClick={() => { setMode(value); setResult(null); setError(null) }}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.625,
                  px: 1.25, py: 0.5, borderRadius: '20px', cursor: 'pointer',
                  border: `1.5px solid ${selected ? color : alpha('#0F172A', 0.14)}`,
                  bgcolor: selected ? alpha(color, 0.1) : 'transparent',
                  color: selected ? color : 'text.secondary',
                  transition: 'all 150ms ease',
                  '&:hover': { borderColor: alpha(color, 0.5), bgcolor: alpha(color, 0.07) },
                }}
              >
                {icon}
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'inherit', lineHeight: 1 }}>{label}</Typography>
              </Box>
            )
          })}
        </Stack>

        {/* Brief textarea */}
        <TextField
          fullWidth multiline minRows={2} maxRows={5}
          placeholder={PLACEHOLDERS[mode]}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={generating}
          sx={{ mb: 1.75 }}
          slotProps={{ input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } } }}
        />

        {/* Generate + channel warning */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="contained" color="primary" size="medium"
            startIcon={generating ? <CircularProgress size={15} sx={{ color: 'inherit' }} /> : MODES.find((m) => m.value === mode)?.icon}
            onClick={() => void handleGenerate()}
            disabled={generating || !canGenerate}
          >
            {generating ? 'Generating…' : BUTTON_LABELS[mode]}
          </Button>
          {result && !generating && (
            <Button variant="outlined" size="medium" startIcon={<RefreshRoundedIcon />} onClick={() => void handleGenerate()} disabled={generating}>
              Regenerate
            </Button>
          )}
          {needsChannel && !channelId && (
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
              Select a channel above first.
            </Typography>
          )}
        </Stack>
      </GlassCard>

      {/* Loading skeleton */}
      {generating && !result && (
        <GlassCard sx={{ p: 3 }}>
          <Stack spacing={2}>
            {mode === 'image_post' && (
              <Skeleton
                variant="rounded"
                sx={{ aspectRatio: '9/16', maxHeight: 380, borderRadius: '12px' }}
              />
            )}
            {mode === 'carousel' && (
              <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" sx={{ width: 140, height: 140, flexShrink: 0, borderRadius: '10px' }} />
                ))}
              </Box>
            )}
            {mode === 'reel' && (
              <>
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="90%" height={20} />
                <Skeleton variant="text" width="80%" height={20} />
              </>
            )}
            <Skeleton variant="text" width="70%" height={18} />
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={80} height={26} sx={{ borderRadius: '6px' }} />
              <Skeleton variant="rounded" width={80} height={26} sx={{ borderRadius: '6px' }} />
              <Skeleton variant="rounded" width={80} height={26} sx={{ borderRadius: '6px' }} />
            </Stack>
          </Stack>
        </GlassCard>
      )}

      {/* Result card */}
      {result && (
        <GlassCard glow sx={{ p: 3 }}>
          <Stack spacing={2.5}>

            {/* Image Post: single 9/16 preview */}
            {mode === 'image_post' && result.image_urls && result.image_urls.length > 0 && (
              <Box
                sx={{
                  borderRadius: '12px',
                  overflow: 'hidden',
                  aspectRatio: '9/16',
                  maxHeight: 400,
                  mx: 'auto',
                  width: '100%',
                  bgcolor: alpha('#0F172A', 0.04),
                }}
              >
                <Box
                  component="img"
                  src={result.image_urls[0]}
                  alt="Generated post"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </Box>
            )}

            {/* Carousel: horizontal scroll strip */}
            {mode === 'carousel' && result.image_urls && result.image_urls.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
                  Slides ({result.image_urls.length})
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    overflowX: 'auto',
                    pb: 1,
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${alpha('#0F172A', 0.15)} transparent`,
                  }}
                >
                  {result.image_urls.map((url, i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'relative',
                        width: 140,
                        height: 140,
                        flexShrink: 0,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid #dddddd57',
                      }}
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={`Slide ${i + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <Box
                        sx={{
                          position: 'absolute', bottom: 5, left: 5,
                          px: 0.75, py: 0.25, borderRadius: '4px',
                          bgcolor: alpha('#0F172A', 0.7), backdropFilter: 'blur(4px)',
                        }}
                      >
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>
                          {i + 1}/{result.image_urls!.length}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Reel Script: hook in large bold */}
            {mode === 'reel' && result.hook && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
                  Hook
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.4, color: 'text.primary' }}>
                  {result.hook}
                </Typography>
              </Box>
            )}

            {/* Caption */}
            {result.caption && (
              <Box>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Caption
                  </Typography>
                  <Tooltip title={copied ? 'Copied!' : 'Copy caption'}>
                    <IconButton size="small" onClick={handleCopyCaption} sx={{ color: copied ? '#059669' : 'text.secondary' }}>
                      <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography variant="body2" sx={{ lineHeight: 1.65, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
                  {result.caption}
                </Typography>
              </Box>
            )}

            {/* Hashtags */}
            {result.hashtags && result.hashtags.length > 0 && (
              <HashtagRow tags={result.hashtags} />
            )}

            {/* Reel script collapse */}
            {mode === 'reel' && result.script && (
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowScript((s) => !s)}
                  sx={{ fontSize: 12, fontWeight: 600, mb: 1, borderRadius: '8px' }}
                >
                  {showScript ? 'Hide script' : 'Show full script'}
                </Button>
                <Box
                  sx={{
                    overflow: 'hidden',
                    maxHeight: showScript ? 600 : 0,
                    transition: 'max-height 280ms ease',
                  }}
                >
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: '10px',
                      bgcolor: alpha('#0F172A', 0.04),
                      border: '1px solid #dddddd57',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ lineHeight: 1.7, color: 'text.secondary', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
                    >
                      {result.script}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Actions */}
            {result.bundleId && (
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="medium"
                  startIcon={<ScheduleRoundedIcon />}
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule Post
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  size="medium"
                  startIcon={publishing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <PublishRoundedIcon />}
                  onClick={() => void handlePublishNow()}
                  disabled={publishing}
                >
                  {publishing ? 'Publishing…' : 'Publish Now'}
                </Button>
              </Stack>
            )}
          </Stack>
        </GlassCard>
      )}

      <ScheduleDrawer
        open={scheduleOpen}
        bundleId={result?.bundleId ?? null}
        onClose={() => setScheduleOpen(false)}
        onScheduled={() => { setSnackMsg('Post scheduled.'); setSnackOpen(true) }}
      />

      <Snackbar open={snackOpen} autoHideDuration={3500} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>{snackMsg}</Alert>
      </Snackbar>
    </Stack>
  )
}

// ─── Tab 1: Image Post ────────────────────────────────────────────────────────

interface ImageTabProps {
  channelId: string
  onGenerated?: (label: string) => void
}

function ImageTab({ channelId, onGenerated }: ImageTabProps) {
  const [brief, setBrief] = useState('')
  const [result, setResult] = useState<ImageResult | null>(null)
  const [bundleId, setBundleId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)

  const handleGenerate = async () => {
    if (!brief.trim()) { setError('Enter a brief or idea first.'); return }
    setGenerating(true)
    setError(null)
    setResult(null)
    setBundleId(null)
    try {
      const r = await apiFetch('/api/v1/creatives/generate-image', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, prompt: brief }),
      })
      const data = await parseJson<{ bundle?: { id?: string; image_urls?: string[]; caption?: string; hashtags?: string[] } }>(r)
      const b = data.bundle
      setResult({
        image_url: b?.image_urls?.[0] ?? '',
        caption: b?.caption ?? '',
        hashtags: b?.hashtags ?? [],
      })
      setBundleId(b?.id ?? null)
      onGenerated?.('Image Post created!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePublishNow = async () => {
    if (!bundleId) return
    setPublishing(true)
    setError(null)
    try {
      const r = await apiFetch(`/api/v1/calendar/${bundleId}/publish`, { method: 'POST' })
      await parseJson<unknown>(r)
      setSnackMsg('Post published successfully.')
      setSnackOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setPublishing(false)
    }
  }

  if (!channelId) return <NoChannelState />

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <GlassCard glow sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary">Idea or brief</Typography>
        <TextField
          fullWidth multiline minRows={2} maxRows={5}
          placeholder="e.g. Minimalist product shot of our new coffee blend with warm morning light aesthetic."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={generating}
          sx={{ mt: 1, mb: 2 }}
          slotProps={{ input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } } }}
        />
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained" color="primary" size="large"
            startIcon={generating ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <ImageRoundedIcon />}
            onClick={() => void handleGenerate()}
            disabled={generating || !brief.trim()}
          >
            {generating ? 'Generating…' : 'Generate Image Post'}
          </Button>
          {result && (
            <Button
              variant="outlined" size="large"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              Regenerate
            </Button>
          )}
        </Stack>
      </GlassCard>

      {/* Result */}
      {generating && !result && (
        <GlassCard sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Skeleton variant="rounded" sx={{ aspectRatio: '4/5', maxHeight: 400, borderRadius: '12px' }} />
            <Skeleton variant="text" width="80%" height={20} />
            <Skeleton variant="text" width="60%" height={20} />
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={80} height={28} sx={{ borderRadius: '8px' }} />
              <Skeleton variant="rounded" width={80} height={28} sx={{ borderRadius: '8px' }} />
              <Skeleton variant="rounded" width={80} height={28} sx={{ borderRadius: '8px' }} />
            </Stack>
          </Stack>
        </GlassCard>
      )}

      {result && (
        <GlassCard glow sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            {/* Image preview — 4:5 portrait */}
            <Box
              sx={{
                borderRadius: '12px',
                overflow: 'hidden',
                aspectRatio: '4/5',
                maxHeight: 420,
                mx: 'auto',
                width: '100%',
                bgcolor: alpha('#0F172A', 0.04),
              }}
            >
              {result.image_url ? (
                <Box
                  component="img"
                  src={result.image_url}
                  alt="Generated post"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.3 }} />
                </Box>
              )}
            </Box>

            {/* Caption */}
            {result.caption && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                  Caption
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.65, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
                  {result.caption}
                </Typography>
              </Box>
            )}

            {/* Hashtags */}
            {result.hashtags && result.hashtags.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {result.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag.startsWith('#') ? tag : `#${tag}`}
                    size="small"
                    sx={{
                      height: 26, fontSize: 11, fontWeight: 600, borderRadius: '6px',
                      bgcolor: alpha('#22D3EE', 0.08), color: '#0891B2',
                      border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                    }}
                  />
                ))}
              </Stack>
            )}

            {/* Actions */}
            {bundleId && (
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <Button
                  variant="outlined" size="medium"
                  startIcon={<ScheduleRoundedIcon />}
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule Post
                </Button>
                <Button
                  variant="contained" color="primary" size="medium"
                  startIcon={publishing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <PublishRoundedIcon />}
                  onClick={() => void handlePublishNow()}
                  disabled={publishing}
                >
                  {publishing ? 'Publishing…' : 'Publish Now'}
                </Button>
              </Stack>
            )}
          </Stack>
        </GlassCard>
      )}

      <ScheduleDrawer
        open={scheduleOpen}
        bundleId={bundleId}
        onClose={() => setScheduleOpen(false)}
        onScheduled={() => { setSnackMsg('Post scheduled.'); setSnackOpen(true) }}
      />

      <Snackbar open={snackOpen} autoHideDuration={3500} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>{snackMsg}</Alert>
      </Snackbar>
    </Stack>
  )
}

// ─── Tab 2: Carousel ──────────────────────────────────────────────────────────

interface CarouselTabProps {
  channelId: string
  onGenerated?: (label: string) => void
}

function CarouselTab({ channelId, onGenerated }: CarouselTabProps) {
  const [brief, setBrief] = useState('')
  const [slideCount, setSlideCount] = useState(5)
  const [result, setResult] = useState<CarouselResult | null>(null)
  const [bundleId, setBundleId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)

  const handleGenerate = async () => {
    if (!brief.trim()) { setError('Enter a brief or idea first.'); return }
    setGenerating(true)
    setError(null)
    setResult(null)
    setBundleId(null)
    try {
      const r = await apiFetch('/api/v1/creatives/generate-carousel', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, slide_count: slideCount, prompt: brief }),
      })
      const data = await parseJson<{ bundle?: { id?: string; image_urls?: string[]; caption?: string; hashtags?: string[] } }>(r)
      const b = data.bundle
      setResult({
        slide_images: b?.image_urls ?? [],
        caption: b?.caption ?? '',
        hashtags: b?.hashtags ?? [],
      })
      setBundleId(b?.id ?? null)
      onGenerated?.('Carousel created!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Carousel generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePublishNow = async () => {
    if (!bundleId) return
    setPublishing(true)
    setError(null)
    try {
      const r = await apiFetch(`/api/v1/calendar/${bundleId}/publish`, { method: 'POST' })
      await parseJson<unknown>(r)
      setSnackMsg('Carousel published successfully.')
      setSnackOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setPublishing(false)
    }
  }

  if (!channelId) return <NoChannelState />

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <GlassCard glow sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary">Idea or brief</Typography>
        <TextField
          fullWidth multiline minRows={2} maxRows={5}
          placeholder="e.g. 5-slide educational carousel about the benefits of cold brew coffee."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={generating}
          sx={{ mt: 1, mb: 2 }}
          slotProps={{ input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } } }}
        />

        {/* Slide count */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Number of slides
          </Typography>
          <Stack direction="row" spacing={0.75}>
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <Box
                key={n}
                onClick={() => setSlideCount(n)}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: slideCount === n ? alpha('#22D3EE', 0.55) : alpha('#0F172A', 0.12),
                  bgcolor: slideCount === n ? alpha('#22D3EE', 0.08) : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  '&:hover': { borderColor: alpha('#22D3EE', 0.35) },
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: slideCount === n ? '#0891B2' : 'text.secondary' }}>
                  {n}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained" color="primary" size="large"
            startIcon={generating ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <ViewCarouselRoundedIcon />}
            onClick={() => void handleGenerate()}
            disabled={generating || !brief.trim()}
          >
            {generating ? 'Generating…' : 'Generate Carousel'}
          </Button>
          {result && (
            <Button
              variant="outlined" size="large"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              Regenerate
            </Button>
          )}
        </Stack>
      </GlassCard>

      {/* Loading skeleton */}
      {generating && !result && (
        <GlassCard sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              overflowX: 'auto',
              pb: 1,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {Array.from({ length: slideCount }).map((_, i) => (
              <Skeleton key={i} variant="rounded" sx={{ width: 160, height: 160, flexShrink: 0, borderRadius: '10px' }} />
            ))}
          </Box>
          <Skeleton variant="text" width="70%" height={20} sx={{ mt: 2 }} />
          <Skeleton variant="text" width="50%" height={20} sx={{ mt: 1 }} />
        </GlassCard>
      )}

      {/* Result */}
      {result && (
        <GlassCard glow sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            {/* Slide strip */}
            {result.slide_images.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
                  Slides ({result.slide_images.length})
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    overflowX: 'auto',
                    pb: 1,
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${alpha('#0F172A', 0.15)} transparent`,
                  }}
                >
                  {result.slide_images.map((url, i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'relative',
                        width: 160,
                        height: 160,
                        flexShrink: 0,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid #dddddd57',
                      }}
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={`Slide ${i + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 6,
                          left: 6,
                          px: 0.75,
                          py: 0.25,
                          borderRadius: '4px',
                          bgcolor: alpha('#0F172A', 0.7),
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>
                          {i + 1}/{result.slide_images.length}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Caption */}
            {result.caption && (
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                  Caption
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.65, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
                  {result.caption}
                </Typography>
              </Box>
            )}

            {/* Hashtags */}
            {result.hashtags && result.hashtags.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {result.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag.startsWith('#') ? tag : `#${tag}`}
                    size="small"
                    sx={{
                      height: 26, fontSize: 11, fontWeight: 600, borderRadius: '6px',
                      bgcolor: alpha('#22D3EE', 0.08), color: '#0891B2',
                      border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                    }}
                  />
                ))}
              </Stack>
            )}

            {/* Actions */}
            {bundleId && (
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <Button
                  variant="outlined" size="medium"
                  startIcon={<ScheduleRoundedIcon />}
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule Post
                </Button>
                <Button
                  variant="contained" color="primary" size="medium"
                  startIcon={publishing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <PublishRoundedIcon />}
                  onClick={() => void handlePublishNow()}
                  disabled={publishing}
                >
                  {publishing ? 'Publishing…' : 'Publish Now'}
                </Button>
              </Stack>
            )}
          </Stack>
        </GlassCard>
      )}

      <ScheduleDrawer
        open={scheduleOpen}
        bundleId={bundleId}
        onClose={() => setScheduleOpen(false)}
        onScheduled={() => { setSnackMsg('Carousel scheduled.'); setSnackOpen(true) }}
      />

      <Snackbar open={snackOpen} autoHideDuration={3500} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>{snackMsg}</Alert>
      </Snackbar>
    </Stack>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CreativesPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const createRef = useRef<HTMLDivElement | null>(null)
  const [typeFilter, setTypeFilter] = useState<GalleryFilter>('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [bundleCounts, setBundleCounts] = useState({ total: 0, reel: 0, image_post: 0, carousel: 0 })
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null)
  const filterOpen = Boolean(filterAnchorEl)

  const handleBundlesLoaded = useCallback((bundles: RecentBundle[]) => {
    setBundleCounts({
      total: bundles.length,
      reel: bundles.filter(b => b.content_type === 'reel').length,
      image_post: bundles.filter(b => b.content_type === 'image_post' || b.content_type === 'image').length,
      carousel: bundles.filter(b => b.content_type === 'carousel').length,
    })
  }, [])

  const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) + (datePreset !== 'all' ? 1 : 0)

  const chipSx = (active: boolean) => ({
    fontWeight: 600, fontSize: 12, height: 30, cursor: 'pointer',
    ...(active
      ? { bgcolor: alpha('#22D3EE', 0.12), color: '#0891B2', borderColor: alpha('#22D3EE', 0.4) }
      : { color: 'text.secondary', borderColor: alpha('#0F172A', 0.15) }),
  })

  const handleGenerated = useCallback((label: string) => {
    setToastMsg(label)
    setToastOpen(true)
    setLibraryRefreshKey((k) => k + 1)
  }, [])

  // Also refresh library when a creative_generated notification arrives via SSE
  // (covers other tabs / other users in the same org)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; title?: string }>).detail
      if (detail?.type === 'creative_generated') {
        setLibraryRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('app:notification', handler)
    return () => window.removeEventListener('app:notification', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      setChannelsLoading(true)
      try {
        const r = await apiFetch('/api/v1/channels')
        if (r.ok) {
          const data = await r.json() as { channels?: Channel[] } | Channel[]
          const list = Array.isArray(data) ? data : (data.channels ?? [])
          setChannels(list)
        }
      } catch {
        // Non-fatal
      } finally {
        setChannelsLoading(false)
      }
    }
    void load()
  }, [])

  const ACCENT = '#22D3EE'
  const ACCENT_DARK = '#0EA5B7'

  const handleNewClick = () => {
    setShowCreate(true)
    setTimeout(() => createRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <Stack spacing={3}>
      {/* ── Create panel — shown when "+ New Content" is clicked ── */}
      {showCreate && (
        <Box ref={createRef}>
        <GlassCard
          sx={{
            overflow: 'hidden',
            padding: '10px 10px 5px 10px',
            '&:hover': { transform: 'none', boxShadow: `0 8px 24px ${alpha('#0F172A', 0.08)}` },
          }}
        >
          {/* Header: channel selector + close */}
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: 1.5, pb: 0.5 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              New Content
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              {!channelsLoading && channels.length === 0 ? (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                    No channels —
                  </Typography>
                  <Button
                    component="a" href="/channels" size="small" variant="text"
                    sx={{ fontSize: 12, p: 0, minWidth: 0, color: '#0891B2', fontWeight: 600 }}
                  >
                    Add one
                  </Button>
                </Stack>
              ) : (
                <ChannelSelector
                  channels={channels}
                  loading={channelsLoading}
                  value={selectedChannelId}
                  onChange={setSelectedChannelId}
                />
              )}
              <Tooltip title="Close">
                <IconButton size="small" onClick={() => setShowCreate(false)} sx={{ color: 'text.secondary' }}>
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Box sx={{ p: { xs: 2, md: 2.5 } }}>
            <ReelTab
              channelId={selectedChannelId}
              onGenerated={(label) => {
                handleGenerated(label)
                setShowCreate(false)
              }}
            />
          </Box>
        </GlassCard>
        </Box>
      )}

      {/* ── Creative Library ── */}
      <GlassCard
        sx={{
          overflow: 'hidden',
          padding: '10px 10px 5px 10px',
          '&:hover': { transform: 'none', boxShadow: `0 8px 24px ${alpha('#0F172A', 0.08)}` },
        }}
      >
        <Stack
          direction="row"
          spacing={1.75}
          sx={{ alignItems: 'center', px: 2, pt: 1.25, pb: 1.5 }}
        >
          <Box
            sx={{
              width: 36, height: 36, borderRadius: '10px',
              bgcolor: alpha(ACCENT, 0.12), color: ACCENT_DARK,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}
          >
            <SlideshowRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Creative Library
            </Typography>
            <Typography variant="caption" color="text.secondary">
              All AI-generated images, carousels, and reels.
            </Typography>
          </Box>
          <Tooltip title="Filter">
            <IconButton
              size="small"
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
              sx={{
                color: activeFilterCount > 0 ? '#0891B2' : 'text.secondary',
                bgcolor: activeFilterCount > 0 ? alpha('#22D3EE', 0.1) : 'transparent',
                border: `1px solid ${activeFilterCount > 0 ? alpha('#22D3EE', 0.35) : alpha('#0F172A', 0.12)}`,
                borderRadius: '8px',
                width: 34, height: 34,
                flexShrink: 0,
              }}
            >
              <TuneRoundedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>

          {/* Filter popover */}
          <Popover
            open={filterOpen}
            anchorEl={filterAnchorEl}
            onClose={() => setFilterAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1, borderRadius: '12px', minWidth: 340,
                  border: `1px solid ${alpha('#0F172A', 0.08)}`,
                  boxShadow: `0 8px 32px ${alpha('#0F172A', 0.12)}`,
                  p: 2,
                },
              },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Filter Content
            </Typography>

            {/* Type */}
            <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.875, mb: 2 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', width: 36, flexShrink: 0 }}>TYPE</Typography>
              {([
                { value: 'all', label: `All (${bundleCounts.total})` },
                { value: 'reel', label: `Reels (${bundleCounts.reel})` },
                { value: 'image_post', label: `Images (${bundleCounts.image_post})` },
                { value: 'carousel', label: `Carousels (${bundleCounts.carousel})` },
              ] as { value: GalleryFilter; label: string }[]).map((f) => (
                <Chip key={f.value} label={f.label} onClick={() => setTypeFilter(f.value)} variant="outlined" size="small" sx={chipSx(typeFilter === f.value)} />
              ))}
            </Stack>

            {/* Date */}
            <Stack direction="row" sx={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 0.875 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', width: 36, flexShrink: 0, mt: 0.25 }}>DATE</Typography>
              <Box>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.875, mb: datePreset === 'custom' ? 1.5 : 0 }}>
                  {([
                    { value: 'all', label: 'All time' },
                    { value: 'today', label: 'Today' },
                    { value: '7d', label: 'Last 7 days' },
                    { value: '30d', label: 'Last 30 days' },
                    { value: 'custom', label: 'Custom' },
                  ] as { value: DatePreset; label: string }[]).map((p) => (
                    <Chip key={p.value} label={p.label} onClick={() => setDatePreset(p.value)} variant="outlined" size="small" sx={chipSx(datePreset === p.value)} />
                  ))}
                </Stack>
                {datePreset === 'custom' && (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <TextField type="date" size="small" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} slotProps={{ input: { sx: { fontSize: 12, height: 30, py: 0 } } }} sx={{ width: 140 }} />
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>to</Typography>
                    <TextField type="date" size="small" value={customTo} onChange={(e) => setCustomTo(e.target.value)} slotProps={{ input: { sx: { fontSize: 12, height: 30, py: 0 } } }} sx={{ width: 140 }} />
                    {(customFrom || customTo) && (
                      <IconButton size="small" onClick={() => { setCustomFrom(''); setCustomTo('') }} sx={{ color: 'text.disabled' }}>
                        <CloseRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Stack>
                )}
              </Box>
            </Stack>

            {activeFilterCount > 0 && (
              <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${alpha('#0F172A', 0.07)}` }}>
                <Button size="small" onClick={() => { setTypeFilter('all'); setDatePreset('all'); setCustomFrom(''); setCustomTo('') }} sx={{ color: 'text.secondary', fontSize: 12 }}>
                  Clear all filters
                </Button>
              </Box>
            )}
          </Popover>

          <Button
            variant="contained"
            size="small"
            startIcon={<AddRoundedIcon />}
            onClick={handleNewClick}
            sx={{ borderRadius: '20px', px: 2, fontWeight: 600, flexShrink: 0 }}
          >
            New Content
          </Button>
        </Stack>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          <CreativeLibrary
            channels={channels}
            refreshKey={libraryRefreshKey}
            typeFilter={typeFilter}
            datePreset={datePreset}
            customFrom={customFrom}
            customTo={customTo}
            onBundlesLoaded={handleBundlesLoaded}
          />
        </Box>
      </GlassCard>

      <Snackbar
        open={toastOpen}
        autoHideDuration={4000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          onClose={() => setToastOpen(false)}
          icon={<AutoAwesomeRoundedIcon fontSize="inherit" />}
          sx={{ borderRadius: '10px', fontWeight: 600, minWidth: 280 }}
        >
          {toastMsg} — added to your library.
        </Alert>
      </Snackbar>
    </Stack>
  )
}
