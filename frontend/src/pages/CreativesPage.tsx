import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import { flushSync } from 'react-dom'
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

const SCRIPT_MAX_CHARS = 12000

/** Parse our SSE relay from POST /generate-script-stream (data: JSON lines). */
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
    for (;;) {
      const idx = carry.indexOf('\n\n')
      if (idx < 0) break
      const block = carry.slice(0, idx)
      carry = carry.slice(idx + 2)
      if (processBlock(block)) return
    }
  }
  const tail = carry.trim()
  if (tail) {
    if (processBlock(tail)) return
  }
}

export function CreativesPage() {
  const [creative, setCreative] = useState<Creative | null>(null)
  const [scriptDraft, setScriptDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [generatingScript, setGeneratingScript] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [publishingToMeta, setPublishingToMeta] = useState(false)
  const [publishMetaSuccess, setPublishMetaSuccess] = useState<{
    url: string
    creativeId: string
    videoId: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)

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
    return () => {
      stopPoll()
      streamAbortRef.current?.abort()
    }
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

  const handleGenerateScriptFromBrief = async () => {
    const prompt = briefDraft.trim()
    if (!prompt) {
      setError('Enter a short idea or product brief first.')
      return
    }
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
        const msg =
          (err as { error?: { message?: string } })?.error?.message ??
          (err as { message?: string })?.message ??
          `Request failed (${res.status})`
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
    if (!script) {
      setError('Paste your voiceover or storyboard script first.')
      return
    }
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

  /** Create creative from script and start render (Models Lab / Replicate / Kling). */
  const handleGenerateVideoFromScript = async () => {
    const script = scriptDraft.trim()
    if (!script) {
      setError('Paste your voiceover or storyboard script first.')
      return
    }
    setBusy(true)
    setError(null)
    setPublishMetaSuccess(null)
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
  const videoReadyForMeta =
    Boolean(creative?.id && creative.render?.status === 'completed' && videoUrl)

  const handlePublishToMeta = async () => {
    if (!creative?.id || !videoUrl) return
    setPublishingToMeta(true)
    setPublishMetaSuccess(null)
    setError(null)
    try {
      const res = await apiFetch(`/api/v1/creatives/${creative.id}/publish-meta`, {
        method: 'POST',
        body: JSON.stringify({
          headline: creative.hook || undefined,
          primaryText: creative.caption || undefined,
        }),
      })
      const data = await parseJson<{
        publish: { ads_manager_url: string; creative_id: string | null; video_id: string }
      }>(res)
      setPublishMetaSuccess({
        url: data.publish.ads_manager_url,
        creativeId: data.publish.creative_id ?? '',
        videoId: data.publish.video_id,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish to Meta failed')
    } finally {
      setPublishingToMeta(false)
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Creatives"
        subtitle="Describe an idea — the script streams in from OpenAI as it is written. Edit, optionally enhance, then generate video. Video backends: Models Lab, HeyGen (avatar + voice), Replicate, or Kling — see backend .env for keys."
      />

      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {publishMetaSuccess ? (
        <Alert
          severity="success"
          onClose={() => setPublishMetaSuccess(null)}
          action={
            <Button
              color="inherit"
              size="small"
              href={publishMetaSuccess.url}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewRoundedIcon />}
            >
              Ads Manager
            </Button>
          }
        >
          Video uploaded and ad creative created in Meta. Creative ID{' '}
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
            {publishMetaSuccess.creativeId || '—'}
          </Typography>
          {publishMetaSuccess.videoId ? (
            <>
              {' '}
              · Video ID{' '}
              <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
                {publishMetaSuccess.videoId}
              </Typography>
            </>
          ) : null}
          . Open Ads Manager to attach it to a campaign or ad set.
        </Alert>
      ) : null}

      <GlassCard glow sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Idea or brief (generate script)
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={5}
          placeholder="e.g. Skincare serum for busy moms — 15% off first order, warm UGC tone, 30s vertical."
          value={briefDraft}
          onChange={(e) => setBriefDraft(e.target.value)}
          sx={{ mt: 1, mb: 1.5 }}
          disabled={busy || enhancing || generatingScript}
          slotProps={{
            input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } },
          }}
        />
        <Button
          variant="outlined"
          color="secondary"
          size="medium"
          startIcon={<ArticleRoundedIcon />}
          onClick={() => void handleGenerateScriptFromBrief()}
          disabled={busy || enhancing || generatingScript || loading || !briefDraft.trim()}
          sx={{ mb: 3 }}
        >
          Generate script (live)
        </Button>

        <Typography variant="overline" color="text.secondary">
          Your script (voiceover / storyboard)
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={8}
          maxRows={22}
          placeholder={`Paste narration, scene beats, on-screen text cues, and timing notes — one brief for the video model.

Example:
SECTION 3 — Narration: "…"
On-screen text: "…"
VIDEO 1: … (2 sec)
VIDEO 2: …`}
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          disabled={busy || enhancing || generatingScript}
          slotProps={{
            input: { sx: { fontFamily: 'inherit', fontSize: '0.875rem' } },
          }}
        />
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.5,
            alignItems: { xs: 'stretch', sm: 'center' },
          }}
        >
          <Button
            variant="outlined"
            color="primary"
            size="large"
            startIcon={<AutoAwesomeRoundedIcon />}
            onClick={() => void handleEnhanceScript()}
            disabled={busy || enhancing || generatingScript || loading || !scriptDraft.trim()}
          >
            Enhance script
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<PlayArrowRoundedIcon />}
            onClick={() => void handleGenerateVideoFromScript()}
            disabled={busy || enhancing || generatingScript || loading || !scriptDraft.trim()}
          >
            Generate video
          </Button>
        </Box>
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

        {videoReadyForMeta ? (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              color="secondary"
              size="large"
              startIcon={<OpenInNewRoundedIcon />}
              onClick={() => void handlePublishToMeta()}
              disabled={
                publishingToMeta || busy || enhancing || generatingScript || loading || renderBusy
              }
            >
              {publishingToMeta ? 'Publishing to Meta…' : 'Publish to Meta Ads'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Uses your connected ad account and Facebook Page (see{' '}
              <Link href="/ads/setup" target="_blank" rel="noopener noreferrer">
                Ads setup
              </Link>
              ). Uploads this video and creates an ad creative you can attach in Ads Manager.
            </Typography>
          </Box>
        ) : null}
      </GlassCard>
    </Stack>
  )
}
