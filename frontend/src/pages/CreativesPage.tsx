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
  LinearProgress,
  Link,
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
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PublishRoundedIcon from '@mui/icons-material/PublishRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import ViewCarouselRoundedIcon from '@mui/icons-material/ViewCarouselRounded'
import { flushSync } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { apiFetch, ensureDevAuthToken } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentType = 'reel' | 'image' | 'carousel' | 'story'
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
  caption?: string
  thumbnail_url?: string
  image_urls?: string[]
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

const SCRIPT_MAX_CHARS = 12000

async function consumeGenerateScriptSse(
  res: Response,
  onText: (chunk: string) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  const dec = new TextDecoder()
  let carry = ''
  const processBlock = (block: string): boolean => {
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const raw = trimmed.slice(5).trim()
      if (raw === '[DONE]') return true
      let data: { t?: string; done?: boolean; error?: string }
      try {
        data = JSON.parse(raw) as { t?: string; done?: boolean; error?: string }
      } catch {
        continue
      }
      if (typeof data.error === 'string' && data.error) throw new Error(data.error)
      if (data.done === true) return true
      if (typeof data.t === 'string' && data.t) onText(data.t)
    }
    return false
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    carry += dec.decode(value, { stream: true })
    for (; ;) {
      const idx = carry.indexOf('\n\n')
      if (idx < 0) break
      const block = carry.slice(0, idx)
      carry = carry.slice(idx + 2)
      if (processBlock(block)) return
    }
  }
  const tail = carry.trim()
  if (tail) processBlock(tail)
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

interface RecentCreativesProps {
  channels: Channel[]
}

function RecentCreatives({ channels }: RecentCreativesProps) {
  const [bundles, setBundles] = useState<RecentBundle[]>([])
  const [loading, setLoading] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  const [captionBundle, setCaptionBundle] = useState<RecentBundle | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/v1/calendar?limit=10')
      if (r.ok) {
        const data = await r.json() as { bundles?: RecentBundle[] } | RecentBundle[]
        const list: RecentBundle[] = Array.isArray(data) ? data : (data.bundles ?? [])
        const enriched = list.slice(0, 10).map((b) => {
          const ch = channels.find((c) => c.id === b.channel_id)
          return { ...b, channel_name: b.channel_name ?? ch?.brand_name ?? ch?.name }
        })
        setBundles(enriched)
      }
    } catch {
      // Non-fatal — silently hide section
    } finally {
      setLoading(false)
    }
  }, [channels])

  useEffect(() => {
    void load()
  }, [load])

  const handleCopyCaption = () => {
    if (!captionBundle?.caption) return
    navigator.clipboard.writeText(captionBundle.caption).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!loading && bundles.length === 0) return null

  return (
    <Box>
      {loading ? (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width={140} height={180} sx={{ borderRadius: '10px' }} />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 1.5,
          }}
        >
          {bundles.map((bundle) => {
            const ct = TYPE_COLORS[bundle.content_type] ?? TYPE_COLORS.image
            const st = STATUS_COLORS[bundle.status] ?? STATUS_COLORS.draft
            const thumb = bundle.thumbnail_url ?? bundle.image_urls?.[0]

            return (
              <Box
                key={bundle.id}
                onClick={() => { setCaptionBundle(bundle); setCaptionOpen(true) }}
                sx={{
                  borderRadius: '10px',
                  border: '1px solid #dddddd57',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 180ms ease',
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.9),
                  '&:hover': {
                    borderColor: alpha('#22D3EE', 0.35),
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 20px ${alpha('#0F172A', 0.1)}`,
                  },
                }}
              >
                {/* Thumbnail */}
                <Box
                  sx={{
                    width: '100%',
                    aspectRatio: '1/1',
                    bgcolor: alpha('#0F172A', 0.06),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
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
                    <Box sx={{ color: 'text.disabled', opacity: 0.4 }}>
                      {bundle.content_type === 'reel' ? (
                        <VideoLibraryRoundedIcon sx={{ fontSize: 28 }} />
                      ) : bundle.content_type === 'carousel' ? (
                        <SlideshowRoundedIcon sx={{ fontSize: 28 }} />
                      ) : (
                        <ImageRoundedIcon sx={{ fontSize: 28 }} />
                      )}
                    </Box>
                  )}
                </Box>

                {/* Info */}
                <Box sx={{ p: 1 }}>
                  <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                    <Box
                      sx={{
                        px: 0.75,
                        py: 0.25,
                        borderRadius: '4px',
                        bgcolor: ct.bg,
                        border: `1px solid ${ct.border}`,
                      }}
                    >
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: ct.color, lineHeight: 1 }}>
                        {ct.label}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        px: 0.75,
                        py: 0.25,
                        borderRadius: '4px',
                        bgcolor: st.bg,
                        border: `1px solid ${st.border}`,
                      }}
                    >
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: st.color, lineHeight: 1 }}>
                        {st.label}
                      </Typography>
                    </Box>
                  </Stack>
                  {bundle.channel_name && (
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', fontWeight: 600, mb: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bundle.channel_name}
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                    {new Date(bundle.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Caption viewer dialog */}
      {captionBundle && (
        <Drawer
          anchor="right"
          open={captionOpen}
          onClose={() => setCaptionOpen(false)}
          slotProps={{
            paper: {
              sx: {
                width: { xs: '100%', sm: 400 },
                borderLeft: '1px solid #dddddd57',
              },
            },
          }}
        >
          <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: '1px solid #dddddd57' }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Caption &amp; Details</Typography>
              <IconButton size="small" onClick={() => setCaptionOpen(false)} sx={{ color: 'text.secondary' }}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
          </Box>
          <Box sx={{ px: 3, py: 2.5, flex: 1, overflowY: 'auto' }}>
            <Stack spacing={2.5}>
              {captionBundle.caption ? (
                <Box>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Caption
                    </Typography>
                    <Tooltip title={copied ? 'Copied!' : 'Copy caption'}>
                      <IconButton
                        size="small"
                        onClick={handleCopyCaption}
                        sx={{ color: copied ? '#059669' : 'text.secondary' }}
                      >
                        <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Typography variant="body1" sx={{ lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                    {captionBundle.caption}
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body1" color="text.secondary">No caption available.</Typography>
              )}
            </Stack>
          </Box>
        </Drawer>
      )}

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message="Caption copied to clipboard"
      />
    </Box>
  )
}

// ─── Tab 0: Reel ──────────────────────────────────────────────────────────────

interface ReelTabProps {
  channelId: string
}

function ReelTab({ channelId }: ReelTabProps) {
  const [creative, setCreative] = useState<ReelCreative | null>(null)
  const [scriptDraft, setScriptDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [generatingScript, setGeneratingScript] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [publishingToMeta, setPublishingToMeta] = useState(false)
  const [publishMetaSuccess, setPublishMetaSuccess] = useState<{
    url: string; creativeId: string; videoId: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const fetchCreative = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/v1/creatives/${id}`)
    const data = await parseJson<{ creative: ReelCreative }>(r)
    setCreative(data.creative)
  }, [])

  const fetchRenderStatus = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/v1/creatives/${id}/render-status`)
    const data = await parseJson<{ render: NonNullable<ReelCreative['render']> }>(r)
    setCreative((prev) =>
      prev && prev.id === id
        ? { ...prev, render: { jobId: data.render.jobId, status: data.render.status, progress: data.render.progress, videoUrl: data.render.videoUrl, error: data.render.error } }
        : prev,
    )
    const st = data.render.status
    if (st === 'completed' || st === 'failed' || st === 'idle') {
      stopPoll()
      if (st === 'failed' && data.render.error) setError(data.render.error)
      if (st === 'completed' && id) await fetchCreative(id)
    }
  }, [fetchCreative]) // eslint-disable-line react-hooks/exhaustive-deps

  const bootstrap = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await ensureDevAuthToken()
      const listRes = await apiFetch('/api/v1/creatives/')
      const listData = await parseJson<{ creatives: { id: string }[] }>(listRes)
      if (listData.creatives.length > 0) {
        await fetchCreative(listData.creatives[0].id)
      } else {
        setCreative(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load creatives')
    } finally {
      setLoading(false)
    }
  }, [fetchCreative])

  useEffect(() => {
    void bootstrap()
    return () => { stopPoll(); streamAbortRef.current?.abort() }
  }, [bootstrap])

  useEffect(() => {
    if (creative) setScriptDraft(creative.script)
  }, [creative?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = creative?.render
    if (!creative || !r) return
    if (r.status !== 'queued' && r.status !== 'processing') return
    stopPoll()
    pollRef.current = setInterval(() => { void fetchRenderStatus(creative.id) }, 700)
    return () => stopPoll()
  }, [creative?.id, creative?.render?.status, fetchRenderStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateScript = async () => {
    const prompt = briefDraft.trim()
    if (!prompt) { setError('Enter a short idea or product brief first.'); return }
    streamAbortRef.current?.abort()
    const ac = new AbortController()
    streamAbortRef.current = ac
    setGeneratingScript(true)
    setError(null)
    setScriptDraft('')
    try {
      const res = await apiFetch('/api/v1/creatives/generate-script-stream', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
        signal: ac.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: { message?: string } })?.error?.message
          ?? (err as { message?: string })?.message ?? `Request failed (${res.status})`
        throw new Error(msg)
      }
      await consumeGenerateScriptSse(res, (chunk) => {
        flushSync(() => {
          setScriptDraft((prev) => {
            const next = prev + chunk
            return next.length > SCRIPT_MAX_CHARS ? next.slice(0, SCRIPT_MAX_CHARS) : next
          })
        })
      })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Generate script failed')
    } finally {
      setGeneratingScript(false)
      streamAbortRef.current = null
    }
  }

  const handleEnhanceScript = async () => {
    const script = scriptDraft.trim()
    if (!script) { setError('Paste your script first.'); return }
    setEnhancing(true)
    setError(null)
    try {
      const res = await apiFetch('/api/v1/creatives/enhance-script', {
        method: 'POST',
        body: JSON.stringify({ script }),
      })
      const data = await parseJson<{ script: string }>(res)
      setScriptDraft(data.script)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enhance script failed')
    } finally {
      setEnhancing(false)
    }
  }

  const handleGenerateVideo = async () => {
    const script = scriptDraft.trim()
    if (!script) { setError('Paste your script first.'); return }
    setBusy(true)
    setError(null)
    setPublishMetaSuccess(null)
    stopPoll()
    try {
      const gen = await apiFetch('/api/v1/creatives/generate', {
        method: 'POST',
        body: JSON.stringify({ script }),
      })
      const data = await parseJson<{ creative: ReelCreative }>(gen)
      const { id } = data.creative
      setCreative(data.creative)
      const ren = await apiFetch(`/api/v1/creatives/${id}/render`, {
        method: 'POST',
        body: JSON.stringify({ script }),
      })
      await parseJson(ren)
      await fetchRenderStatus(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate video failed')
    } finally {
      setBusy(false)
    }
  }

  const handlePublishToMeta = async () => {
    if (!creative?.id || !videoUrl) return
    setPublishingToMeta(true)
    setPublishMetaSuccess(null)
    setError(null)
    try {
      const res = await apiFetch(`/api/v1/creatives/${creative.id}/publish-meta`, {
        method: 'POST',
        body: JSON.stringify({ headline: creative.hook || undefined, primaryText: creative.caption || undefined }),
      })
      const data = await parseJson<{ publish: { ads_manager_url: string; creative_id: string | null; video_id: string } }>(res)
      setPublishMetaSuccess({ url: data.publish.ads_manager_url, creativeId: data.publish.creative_id ?? '', videoId: data.publish.video_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish to Meta failed')
    } finally {
      setPublishingToMeta(false)
    }
  }

  const renderBusy = creative?.render?.status === 'queued' || creative?.render?.status === 'processing'
  const videoUrl = creative?.render?.videoUrl ?? null
  const progress = creative?.render?.progress ?? 0
  const videoReadyForMeta = Boolean(creative?.id && creative.render?.status === 'completed' && videoUrl)

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {publishMetaSuccess && (
        <Alert
          severity="success"
          onClose={() => setPublishMetaSuccess(null)}
          action={
            <Button color="inherit" size="small" href={publishMetaSuccess.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon />}>
              Ads Manager
            </Button>
          }
        >
          Video uploaded and ad creative created in Meta. Creative ID{' '}
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>{publishMetaSuccess.creativeId || '—'}</Typography>
          {publishMetaSuccess.videoId && (
            <> · Video ID <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>{publishMetaSuccess.videoId}</Typography></>
          )}
        </Alert>
      )}

      {/* Brief + script */}
      <GlassCard glow sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary">Idea or brief</Typography>
        <TextField
          fullWidth multiline minRows={2} maxRows={4}
          placeholder="e.g. Skincare serum for busy moms — 15% off first order, warm UGC tone, 30s vertical."
          value={briefDraft}
          onChange={(e) => setBriefDraft(e.target.value)}
          sx={{ mt: 1, mb: 1.5 }}
          disabled={busy || enhancing || generatingScript}
          slotProps={{ input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } } }}
        />
        <Button
          variant="outlined" color="secondary" size="medium"
          startIcon={<ArticleRoundedIcon />}
          onClick={() => void handleGenerateScript()}
          disabled={busy || enhancing || generatingScript || loading || !briefDraft.trim()}
          sx={{ mb: 3 }}
        >
          Generate script (live)
        </Button>

        <Typography variant="overline" color="text.secondary">Voiceover / storyboard script</Typography>
        <TextField
          fullWidth multiline minRows={8} maxRows={20}
          placeholder={`Paste narration, scene beats, on-screen text cues, and timing notes.\n\nExample:\nSECTION 3 — Narration: "…"\nOn-screen text: "…"\nVIDEO 1: … (2 sec)`}
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          disabled={busy || enhancing || generatingScript}
          slotProps={{ input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } } }}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
          <Button
            variant="outlined" color="primary" size="large"
            startIcon={<AutoAwesomeRoundedIcon />}
            onClick={() => void handleEnhanceScript()}
            disabled={busy || enhancing || generatingScript || loading || !scriptDraft.trim()}
          >
            Enhance script
          </Button>
          <Button
            variant="contained" color="primary" size="large"
            startIcon={<PlayArrowRoundedIcon />}
            onClick={() => void handleGenerateVideo()}
            disabled={busy || enhancing || generatingScript || loading || !scriptDraft.trim()}
          >
            Generate video
          </Button>
        </Stack>
      </GlassCard>

      {/* Video preview */}
      <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
        <Box
          sx={{
            aspectRatio: '9/16',
            maxHeight: 560,
            mx: 'auto',
            bgcolor: '#050505',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {videoUrl ? (
            <Box component="video" src={videoUrl} controls playsInline sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <>
              <Box
                sx={{
                  width: 72, height: 72, borderRadius: '50%',
                  border: `1px solid ${alpha('#FFFFFF', 0.2)}`,
                  display: 'grid', placeItems: 'center',
                  bgcolor: alpha('#FFFFFF', 0.06),
                  backdropFilter: 'blur(8px)',
                }}
              >
                <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
              </Box>
              <Typography
                variant="caption"
                sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, textAlign: 'center', color: 'text.secondary' }}
              >
                {loading ? 'Loading…' : renderBusy ? `Rendering… ${Math.round(progress)}%` : 'Video appears here when ready'}
              </Typography>
            </>
          )}
        </Box>
      </GlassCard>

      {renderBusy && (
        <LinearProgress variant="determinate" value={progress} sx={{ mt: 2, borderRadius: 1, bgcolor: alpha('#FFF', 0.06) }} />
      )}

      {videoReadyForMeta && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined" color="primary" size="large"
              startIcon={<ScheduleRoundedIcon />}
              onClick={() => setScheduleOpen(true)}
              disabled={publishingToMeta || renderBusy}
            >
              Schedule Post
            </Button>
            <Button
              variant="contained" color="secondary" size="large"
              startIcon={<OpenInNewRoundedIcon />}
              onClick={() => void handlePublishToMeta()}
              disabled={publishingToMeta || busy || enhancing || generatingScript || loading || renderBusy}
            >
              {publishingToMeta ? 'Publishing to Meta…' : 'Publish to Meta Ads'}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Uses your connected ad account and Facebook Page (see{' '}
            <Link href="/ads/setup" target="_blank" rel="noopener noreferrer">Ads setup</Link>
            ). Uploads this video and creates an ad creative.
          </Typography>
        </Box>
      )}

      <ScheduleDrawer
        open={scheduleOpen}
        bundleId={creative?.id ?? null}
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
}

function ImageTab({ channelId }: ImageTabProps) {
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
      const data = await parseJson<{ image_url?: string; caption?: string; hashtags?: string[]; bundle_id?: string; id?: string } & Partial<ImageResult>>(r)
      setResult({
        image_url: data.image_url ?? '',
        caption: data.caption ?? '',
        hashtags: data.hashtags ?? [],
      })
      setBundleId(data.bundle_id ?? data.id ?? null)
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
}

function CarouselTab({ channelId }: CarouselTabProps) {
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
        body: JSON.stringify({ channel_id: channelId, slide_count: slideCount }),
      })
      const data = await parseJson<{ slide_images?: string[]; caption?: string; hashtags?: string[]; bundle_id?: string; id?: string } & Partial<CarouselResult>>(r)
      setResult({
        slide_images: data.slide_images ?? [],
        caption: data.caption ?? '',
        hashtags: data.hashtags ?? [],
      })
      setBundleId(data.bundle_id ?? data.id ?? null)
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
  const [tab, setTab] = useState(0)
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [selectedChannelId, setSelectedChannelId] = useState('')

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

  return (
    <Stack spacing={3}>
      {/* ── Hero header — matches /calendar and /settings ───────────────── */}
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
            <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h5"
              sx={{ fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}
            >
              Creatives
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Generate reels, image posts, and carousels powered by AI — then schedule or publish directly.
            </Typography>
          </Box>
        </Stack>

        {/* Quick-info strip — surfaces what each tab produces at a glance */}
        <Stack
          direction="row"
          spacing={3}
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: `1px dashed ${alpha('#0F172A', 0.1)}`,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {[
            { label: 'Reels', icon: <VideoLibraryRoundedIcon sx={{ fontSize: 14 }} />, color: '#8B5CF6' },
            { label: 'Image posts', icon: <ImageRoundedIcon sx={{ fontSize: 14 }} />, color: '#10B981' },
            { label: 'Carousels', icon: <ViewCarouselRoundedIcon sx={{ fontSize: 14 }} />, color: '#F59E0B' },
            { label: 'Auto-schedule ready', icon: <ScheduleRoundedIcon sx={{ fontSize: 14 }} />, color: ACCENT_DARK },
          ].map((s) => (
            <Stack key={s.label} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '6px',
                  bgcolor: alpha(s.color, 0.12),
                  color: s.color,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12.5, color: 'text.secondary' }}>
                {s.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Content type tabs (matches /approvals — pill active state, no underline) */}
      <GlassCard
        sx={{
          overflow: 'hidden',
          padding: '10px 10px 5px 10px',
          // Suppress GlassCard's hover-lift since the card is interactive.
          '&:hover': {
            transform: 'none',
            boxShadow: `0 8px 24px ${alpha('#0F172A', 0.08)}`,
          },
        }}
      >
        <Box sx={{ px: 1, pt: 0.5 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{
              alignItems: { sm: 'center' },
              justifyContent: 'space-between',
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as number)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 44,
                flex: { sm: 1 },
                minWidth: 0,
                '& .MuiTab-root': {
                  minHeight: 44,
                  fontSize: '13px',
                  fontWeight: 600,
                  textTransform: 'none',
                  color: '#475569',
                  px: 2,
                  borderRadius: '8px',
                  transition:
                    'background-color 160ms ease, color 160ms ease',
                  '&:hover': {
                    color: '#0EA5B7',
                    bgcolor: alpha('#22D3EE', 0.06),
                  },
                },
                '& .Mui-selected': {
                  color: '#0EA5B7 !important',
                  bgcolor: alpha('#22D3EE', 0.12),
                },
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTabs-scrollButtons.Mui-disabled': { opacity: 0.3 },
              }}
            >
              <Tab
                label={
                  <Stack
                    direction="row"
                    spacing={0.875}
                    sx={{ alignItems: 'center' }}
                  >
                    <VideoLibraryRoundedIcon sx={{ fontSize: 16 }} />
                    <span>Reel</span>
                  </Stack>
                }
              />
              <Tab
                label={
                  <Stack
                    direction="row"
                    spacing={0.875}
                    sx={{ alignItems: 'center' }}
                  >
                    <ImageRoundedIcon sx={{ fontSize: 16 }} />
                    <span>Image Post</span>
                  </Stack>
                }
              />
              <Tab
                label={
                  <Stack
                    direction="row"
                    spacing={0.875}
                    sx={{ alignItems: 'center' }}
                  >
                    <ViewCarouselRoundedIcon sx={{ fontSize: 16 }} />
                    <span>Carousel</span>
                  </Stack>
                }
              />
            </Tabs>

            {/* Channel selector — always visible */}
            <Box sx={{ flexShrink: 0 }}>
              <ChannelSelector
                channels={channels}
                loading={channelsLoading}
                value={selectedChannelId}
                onChange={setSelectedChannelId}
              />
            </Box>
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {tab === 0 && (
            // Reel tab doesn't gate on channel — works with existing global creative flow
            <ReelTab channelId={selectedChannelId} />
          )}
          {tab === 1 && <ImageTab channelId={selectedChannelId} />}
          {tab === 2 && <CarouselTab channelId={selectedChannelId} />}
        </Box>
      </GlassCard>

      {/* Recent creatives — same single-card pattern as the tabs section */}
      <GlassCard
        sx={{
          overflow: 'hidden',
          padding: '10px 10px 5px 10px',
          '&:hover': {
            transform: 'none',
            boxShadow: `0 8px 24px ${alpha('#0F172A', 0.08)}`,
          },
        }}
      >
        <Stack
          direction="row"
          spacing={1.75}
          sx={{
            alignItems: 'center',
            px: 2,
            pt: 1.25,
            pb: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              bgcolor: alpha(ACCENT, 0.12),
              color: ACCENT_DARK,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <SlideshowRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, lineHeight: 1.2 }}
            >
              Recent creatives
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Latest 10 creative bundles across all channels.
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          <RecentCreatives channels={channels} />
        </Box>
      </GlassCard>
    </Stack>
  )
}
