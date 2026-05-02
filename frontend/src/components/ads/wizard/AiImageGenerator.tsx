import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import RefreshIcon from '@mui/icons-material/Refresh'
import EditIcon from '@mui/icons-material/Edit'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useRef, useState } from 'react'
import { adsApi, ApiError } from '../../../api'
import type { GeneratedAdImage, ImageUploadResult } from '../../../api/types'

// State machine for the AI image generator. Drawn out so the JSX below is
// readable without context-switching:
//
//   idle  ──[Generate]──►  generating  ──ok──►  preview
//                                       │
//                                       └─err──►  idle (with error)
//
//   preview ──[Approve]──►  uploading  ──ok──►  done (image_hash on form)
//   preview ──[Reject]───►  discarding ──►  generating (auto-regen)
//   preview ──[Edit]─────►  discarding ──►  idle (prompt preserved)
//
// `discarding` runs the discard call in the background; the user doesn't
// wait for it to finish before the next action — we just kick it off and
// move on. Failures are non-fatal (orphan stays in S3, logged backend-side).
type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'preview'; image: GeneratedAdImage }
  | { kind: 'uploading'; image: GeneratedAdImage }

export type AiImageContext = {
  objective?: string
  headline?: string
  primary_text?: string
  cta_type?: string
  target_audience?: string
  // Derived from the user's placement selection so the microservice
  // generates an image whose aspect matches where the ad will run.
  // Defaults to 1:1 backend-side when omitted.
  aspect_ratio?: '1:1' | '4:5' | '9:16' | '16:9'
}

type Props = {
  context?: AiImageContext
  // Called when the user approves a generated image and we've successfully
  // pushed it to Meta. Parent should set creative.image_hash + preview URL.
  onApprove: (result: ImageUploadResult & { source: 'ai' }) => void
  // Optional initial prompt — useful when re-opening the panel after edit.
  initialPrompt?: string
}

export function AiImageGenerator({ context, onApprove, initialPrompt = '' }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // If the user navigates away mid-generation, abort the in-flight request
  // so we don't burn microservice quota on a result nobody will see.
  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const generate = async (promptToUse: string) => {
    if (state.kind === 'generating' || state.kind === 'uploading') return
    if (!promptToUse || promptToUse.trim().length < 5) {
      setError('Add a few more words to your prompt (5+ characters).')
      return
    }
    setError(null)
    setState({ kind: 'generating' })
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const image = await adsApi.aiGenerateImage(promptToUse.trim(), context, ac.signal)
      setState({ kind: 'preview', image })
    } catch (err) {
      if (ac.signal.aborted) return
      setError(err instanceof ApiError ? err.message : (err as Error).message)
      setState({ kind: 'idle' })
    }
  }

  // Fire-and-forget S3 cleanup; we don't await before the next action.
  const discardInBackground = (image: GeneratedAdImage) => {
    adsApi.aiDiscardImage(image.image_url).catch(() => {
      /* non-fatal — backend logs orphans */
    })
  }

  const onReject = () => {
    if (state.kind !== 'preview') return
    discardInBackground(state.image)
    generate(prompt)
  }

  const onEdit = () => {
    if (state.kind !== 'preview') return
    discardInBackground(state.image)
    setState({ kind: 'idle' })
    // Prompt stays so the user can tweak it.
  }

  const onApproveClick = async () => {
    if (state.kind !== 'preview') return
    setError(null)
    setState({ kind: 'uploading', image: state.image })
    try {
      const result = await adsApi.uploadAdImage(state.image.image_url)
      onApprove({ ...result, source: 'ai' })
      // Don't reset to idle — leave the panel hidden by parent (it can
      // re-mount with a fresh state if the user wants to try again).
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message)
      setState({ kind: 'preview', image: state.image })  // back to preview so they can retry
    }
  }

  const isWorking = state.kind === 'generating' || state.kind === 'uploading'

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.4)}`,
        bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
        p: 2,
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            Generate ad image with AI
          </Typography>
          {state.kind === 'preview' && (
            <IconButton size="small" onClick={onEdit} aria-label="Discard and edit prompt">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {state.kind === 'idle' && (
          <>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              placeholder='e.g. "A fit person working out in a modern gym, dynamic lighting, high energy"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText={
                error ||
                "We'll expand your brief into a detailed scene using the campaign context. No text rendered inside the image — Meta flags those."
              }
              error={!!error}
            />
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => generate(prompt)}
                disabled={prompt.trim().length < 5}
              >
                Generate image
              </Button>
              {context?.headline && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Using campaign context: "{context.headline}"
                </Typography>
              )}
            </Stack>
          </>
        )}

        {state.kind === 'generating' && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', py: 2 }}>
            <CircularProgress size={28} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Generating your image…
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This usually takes 20-60 seconds.
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                abortRef.current?.abort()
                setState({ kind: 'idle' })
              }}
            >
              Cancel
            </Button>
          </Stack>
        )}

        {(state.kind === 'preview' || state.kind === 'uploading') && (
          <Stack spacing={1.5}>
            <Box
              sx={{
                position: 'relative',
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: 'rgba(0,0,0,0.2)',
                maxWidth: 360,
              }}
            >
              <img
                src={state.image.image_url}
                alt="AI-generated ad preview"
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
              {state.kind === 'uploading' && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    bgcolor: 'rgba(0,0,0,0.55)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'white',
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <CircularProgress size={20} sx={{ color: 'white' }} />
                    <Typography variant="caption">Uploading to Meta…</Typography>
                  </Stack>
                </Box>
              )}
            </Box>

            <Stack
              direction="row"
              spacing={2}
              sx={{ flexWrap: 'wrap', alignItems: 'center', color: 'text.secondary' }}
            >
              {state.image.width && state.image.height && (
                <Typography variant="caption">
                  {state.image.width}×{state.image.height}
                  {state.image.width >= 600 && state.image.height >= 600 ? ' ✓' : ' ⚠ below 600×600'}
                </Typography>
              )}
              {state.image.size_bytes != null && (
                <Typography variant="caption">
                  {formatBytes(state.image.size_bytes)}
                  {state.image.size_bytes > 30 * 1024 * 1024 ? ' ⚠ exceeds 30MB' : ''}
                </Typography>
              )}
              {state.image.refined_payload?.aspect_ratio && (
                <Typography variant="caption">
                  Aspect {state.image.refined_payload.aspect_ratio}
                </Typography>
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Prompt sent: <em>{state.image.generated_prompt.slice(0, 200)}{state.image.generated_prompt.length > 200 ? '…' : ''}</em>
            </Typography>

            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckIcon />}
                onClick={onApproveClick}
                disabled={isWorking}
              >
                Use this image
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={onReject}
                disabled={isWorking}
              >
                Try another
              </Button>
              <Button
                variant="text"
                color="inherit"
                startIcon={<EditIcon />}
                onClick={onEdit}
                disabled={isWorking}
              >
                Edit prompt
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

// Tiny KB/MB formatter for the dimensions row.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export default AiImageGenerator
