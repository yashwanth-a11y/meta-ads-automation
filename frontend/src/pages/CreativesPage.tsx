import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { apiFetch, ensureDevAuthToken } from '../lib/api'

type RenderState = {
  jobId: string | null
  status: string
  progress: number
  videoUrl: string | null
  error?: string | null
} | null

type Creative = {
  id: string
  script: string
  hook: string
  caption: string
  createdAt: string
  updatedAt: string
  render: RenderState
}

async function parseJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg =
      err?.error?.message ?? err?.message ?? `Request failed (${r.status})`
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

export function CreativesPage() {
  const [creative, setCreative] = useState<Creative | null>(null)
  const [scriptDraft, setScriptDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const fetchCreative = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/v1/creatives/${id}`)
    const data = await parseJson<{ creative: Creative }>(r)
    setCreative(data.creative)
  }, [])

  const fetchRenderStatus = useCallback(
    async (id: string) => {
      const r = await apiFetch(`/api/v1/creatives/${id}/render-status`)
      const data = await parseJson<{ render: NonNullable<Creative['render']> }>(r)
      setCreative((prev) =>
        prev && prev.id === id
          ? {
              ...prev,
              render: {
                jobId: data.render.jobId,
                status: data.render.status,
                progress: data.render.progress,
                videoUrl: data.render.videoUrl,
                error: data.render.error,
              },
            }
          : prev,
      )
      const st = data.render.status
      if (st === 'completed' || st === 'failed' || st === 'idle') {
        stopPoll()
        if (st === 'failed' && data.render.error) {
          setError(data.render.error)
        }
        if (st === 'completed' && id) await fetchCreative(id)
      }
    },
    [fetchCreative],
  )

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
    return () => stopPoll()
  }, [bootstrap])

  useEffect(() => {
    if (!creative) return
    setScriptDraft(creative.script)
  }, [creative?.id])

  useEffect(() => {
    const r = creative?.render
    if (!creative || !r) return
    if (r.status !== 'queued' && r.status !== 'processing') return

    stopPoll()
    pollRef.current = setInterval(() => {
      void fetchRenderStatus(creative.id)
    }, 700)

    return () => stopPoll()
  }, [creative?.id, creative?.render?.status, fetchRenderStatus])

  /** Create creative from script and start Kling render. */
  const handleGenerateVideoFromScript = async () => {
    const script = scriptDraft.trim()
    if (!script) {
      setError('Paste your voiceover or storyboard script first.')
      return
    }
    setBusy(true)
    setError(null)
    stopPoll()
    try {
      const gen = await apiFetch('/api/v1/creatives/generate', {
        method: 'POST',
        body: JSON.stringify({ script }),
      })
      const data = await parseJson<{ creative: Creative }>(gen)
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

  const renderBusy =
    creative?.render?.status === 'queued' || creative?.render?.status === 'processing'
  const videoUrl = creative?.render?.videoUrl ?? null
  const progress = creative?.render?.progress ?? 0

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Creatives"
        subtitle="Paste your voiceover or storyboard script — the backend sends it to Kling text-to-video (KLING_ACCESS_KEY + KLING_SECRET_KEY required)."
      />

      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <GlassCard glow sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Your script (voiceover / storyboard)
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={8}
          maxRows={22}
          placeholder={`Paste narration, scene beats, on-screen text cues, and timing notes — everything Kling should interpret as one video brief.

Example:
SECTION 3 — Narration: "…"
On-screen text: "…"
VIDEO 1: … (2 sec)
VIDEO 2: …`}
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          disabled={busy}
          slotProps={{
            input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } },
          }}
        />
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={() => void handleGenerateVideoFromScript()}
          disabled={busy || loading || !scriptDraft.trim()}
        >
          Generate video from script
        </Button>
      </GlassCard>

      <GlassCard glow sx={{ p: 3 }}>
        <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
          <Box
            sx={{
              aspectRatio: '9 / 16',
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
              <Box
                component="video"
                src={videoUrl}
                controls
                playsInline
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <>
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: `1px solid ${alpha('#FFFFFF', 0.2)}`,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: alpha('#FFFFFF', 0.06),
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    right: 16,
                    textAlign: 'center',
                    color: 'text.secondary',
                  }}
                >
                  {loading
                    ? 'Loading…'
                    : renderBusy
                      ? `Rendering… ${Math.round(progress)}%`
                      : 'Video appears here when ready'}
                </Typography>
              </>
            )}
          </Box>
        </GlassCard>

        {renderBusy ? (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ mt: 2, borderRadius: 1, bgcolor: alpha('#FFF', 0.06) }}
          />
        ) : null}
      </GlassCard>
    </Stack>
  )
}
