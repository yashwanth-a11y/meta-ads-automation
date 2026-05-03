import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Add,
  AutoAwesome,
  CameraAlt,
  Close,
  CloudUpload,
  Collections,
  Delete,
  HighlightAlt,
  Image as ImageIcon,
  MovieCreation,
  PhotoCamera,
  PlayArrow,
} from '@mui/icons-material'
// Note: standalone "Video" feed posts are deprecated by Meta (subcode
// 2207067). All single-clip posts go through the Reel tab, which calls
// /media with media_type=REELS + share_to_feed=true.
import {
  instagramApi,
  type InstagramAccount,
  type InstagramCarouselChild,
  type InstagramPostType,
  type InstagramPublishSpec,
  type InstagramUpload,
} from '../../api/instagram'

const IG_GRADIENT =
  'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'

const MAX_CAPTION = 2200
const MAX_HASHTAGS = 30
const MAX_CAROUSEL = 10

type Props = {
  open: boolean
  account: InstagramAccount | null
  onClose: () => void
  onPublished: (result: { type: InstagramPostType; mediaId: string }) => void
  onError: (message: string) => void
}

type UploadedAsset = InstagramUpload & {
  // Object URL of the *local* file used as the preview thumbnail. Object
  // URLs (blob:) load instantly without waiting for our public-uploads
  // route to round-trip through ngrok or the prod CDN.
  // For AI-generated assets, this is the same as the public `url` (since
  // there's no local File to make a blob from).
  previewUrl: string
  fileName: string
  // When set, this asset came from the AI microservice (not our upload
  // service). On publish we send the URL via cleanup_ai_urls so the
  // microservice can delete its own S3 object.
  aiUrl?: string
}

type ComposerStatus =
  | { kind: 'idle' }
  | { kind: 'uploading'; loaded: number; total: number; fileName: string }
  | { kind: 'generating' }
  | { kind: 'publishing' }
  | { kind: 'success'; mediaId: string; postType: InstagramPostType }
  | { kind: 'error'; message: string }

// Per Meta spec: images must be JPEG (PNG is rejected by IG content
// publishing); videos must be MP4/MOV with H.264 + AAC. We expose only the
// post types Meta currently accepts — `video` is intentionally absent
// because standalone feed videos were deprecated in favor of Reels.
const TAB_DEFS: Array<{
  value: InstagramPostType
  label: string
  icon: React.ReactNode
  accept: string
  helper: string
}> = [
    {
      value: 'image',
      label: 'Post',
      icon: <ImageIcon fontSize="small" />,
      accept: 'image/jpeg',
      helper: 'JPEG · up to 8 MB · square (1:1) recommended',
    },
    {
      value: 'reels',
      label: 'Reel',
      icon: <MovieCreation fontSize="small" />,
      accept: 'video/mp4,video/quicktime',
      helper: 'MP4 or MOV · vertical 9:16 · 3–90 s · up to 100 MB',
    },
    {
      value: 'carousel',
      label: 'Carousel',
      icon: <Collections fontSize="small" />,
      accept: 'image/jpeg,video/mp4,video/quicktime',
      helper: '2 to 10 items, mix of JPEG images and MP4/MOV videos',
    },
    {
      value: 'story',
      label: 'Story',
      icon: <HighlightAlt fontSize="small" />,
      accept: 'image/jpeg,video/mp4,video/quicktime',
      helper: 'Single JPEG image or short MP4/MOV (≤ 60 s)',
    },
  ]

// Inspect a local video file via a hidden <video> element to read width,
// height, and duration BEFORE uploading. Catches the most common Meta
// rejections — wrong aspect ratio for Story (must be 9:16), Reel duration
// out of bounds, and unplayable codecs (HEVC iPhone clips that don't
// decode in browser typically don't decode at IG either).
function inspectVideo(file: File): Promise<{
  width: number
  height: number
  duration: number
  aspectRatio: number
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        /* ignore */
      }
    }
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = video
      cleanup()
      if (!videoWidth || !videoHeight) {
        reject(
          new Error(
            'Video metadata could not be read — the file may be corrupt or use an unsupported codec (HEVC/H.265). Re-encode as H.264 MP4 and try again.',
          ),
        )
        return
      }
      resolve({
        width: videoWidth,
        height: videoHeight,
        duration,
        aspectRatio: videoWidth / videoHeight,
      })
    }
    video.onerror = () => {
      cleanup()
      reject(
        new Error(
          'Browser cannot decode this video. Instagram requires H.264 video + AAC audio in MP4 — re-encode and try again.',
        ),
      )
    }
    video.src = url
  })
}

// Aspect-ratio limits per Meta Content Publishing docs.
function validateVideoForType(
  meta: { width: number; height: number; duration: number; aspectRatio: number },
  type: InstagramPostType,
): string | null {
  const { aspectRatio, duration, width, height } = meta
  // Story: STRICT 9:16 (0.5625). Even a few % off → IG container ERROR with
  // no human reason. The 1% tolerance covers off-by-a-pixel encoder rounding.
  if (type === 'story') {
    const target = 9 / 16
    if (Math.abs(aspectRatio - target) / target > 0.01) {
      return `Stories require a 9:16 vertical video (e.g. 1080×1920). This clip is ${width}×${height} (${aspectRatio.toFixed(3)}:1). Re-export as 9:16.`
    }
    if (duration > 60) {
      return `Story videos must be 60 s or shorter. This clip is ${Math.round(duration)} s.`
    }
  }
  // Reels: 0.01:1 to 10:1 per docs, but anything far from 9:16 renders
  // letterboxed and Meta has been increasingly aggressive about rejecting
  // far-off aspect ratios on Reels too. Warn at ±15% off 9:16.
  if (type === 'reels') {
    if (duration < 3) {
      return `Reels must be at least 3 s long. This clip is ${duration.toFixed(1)} s.`
    }
    if (duration > 90) {
      return `Reels must be 90 s or shorter. This clip is ${Math.round(duration)} s.`
    }
    const target = 9 / 16
    if (Math.abs(aspectRatio - target) / target > 0.15) {
      return `Reels expect a 9:16 vertical video. This clip is ${width}×${height} (${aspectRatio.toFixed(2)}:1) — Instagram may reject it. Re-export as 9:16 if it fails.`
    }
  }
  if (type === 'carousel') {
    // Carousel videos: 4:5 (0.8) to 1.91:1
    if (duration < 3 || duration > 60) {
      return `Carousel videos must be 3–60 s. This clip is ${duration.toFixed(1)} s.`
    }
    if (aspectRatio < 0.78 || aspectRatio > 1.92) {
      return `Carousel videos must have aspect ratio between 4:5 and 1.91:1. This clip is ${aspectRatio.toFixed(2)}:1.`
    }
  }
  return null
}

function parseHashtags(text: string): string[] {
  // Matches #word — allows letters, digits, underscore, period (Instagram
  // accepts those). Drops the leading "#" so the backend re-emits them.
  const matches = text.match(/#[\p{L}\p{N}_.]+/gu) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of matches) {
    const t = tag.slice(1)
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

function MediaPreview({
  asset,
  onRemove,
  size = 96,
}: {
  asset: UploadedAsset
  onRemove?: () => void
  size?: number
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: 'grey.100',
        border: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {asset.kind === 'video' ? (
        <video
          src={asset.previewUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          playsInline
        />
      ) : (
        <img
          src={asset.previewUrl}
          alt={asset.fileName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {asset.kind === 'video' ? (
        <Box
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: 'white',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
          }}
        >
          <PlayArrow fontSize="small" />
        </Box>
      ) : null}
      {onRemove ? (
        <IconButton
          size="small"
          aria-label="Remove"
          onClick={onRemove}
          sx={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: 'white',
            width: 22,
            height: 22,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
          }}
        >
          <Delete sx={{ fontSize: 14 }} />
        </IconButton>
      ) : null}
    </Box>
  )
}

// Post types that the AI image microservice can fulfill. Reels are video-
// only and the microservice generates still JPEGs; we hide the AI button
// on the Reel tab.
const AI_SUPPORTED_TYPES: InstagramPostType[] = ['image', 'carousel', 'story']

export function InstagramComposer({ open, account, onClose, onPublished, onError }: Props) {
  const [postType, setPostType] = useState<InstagramPostType>('image')
  const [caption, setCaption] = useState('')
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [status, setStatus] = useState<ComposerStatus>({ kind: 'idle' })
  // AI generation panel state.
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const tab = useMemo(() => TAB_DEFS.find((t) => t.value === postType)!, [postType])
  const hashtags = useMemo(() => parseHashtags(caption), [caption])
  const captionLength = caption.length
  const captionTooLong = captionLength > MAX_CAPTION
  const tooManyTags = hashtags.length > MAX_HASHTAGS
  const isUploading = status.kind === 'uploading'
  const isPublishing = status.kind === 'publishing'
  const isGenerating = status.kind === 'generating'
  const isBusy = isUploading || isPublishing || isGenerating
  const aiSupportedHere = AI_SUPPORTED_TYPES.includes(postType)

  const reset = useCallback(() => {
    // Only revoke blob: previewUrls — AI-generated assets reuse the public
    // URL as their preview, and revoking that breaks the <img> tag.
    for (const a of assets) {
      if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
    }
    setAssets([])
    setCaption('')
    setStatus({ kind: 'idle' })
    setPostType('image')
    setAiPanelOpen(false)
    setAiPrompt('')
  }, [assets])

  const handleClose = useCallback(() => {
    if (isBusy) return // don't drop a publish in progress
    reset()
    onClose()
  }, [isBusy, onClose, reset])

  const handleTypeChange = useCallback(
    (next: InstagramPostType) => {
      if (next === postType) return
      // Switching post type discards uploaded assets — different types have
      // different validation rules, and silently keeping the wrong-shape
      // upload around would just confuse the user.
      for (const a of assets) {
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
      }
      setAssets([])
      setStatus({ kind: 'idle' })
      setPostType(next)
      setAiPanelOpen(false)
    },
    [assets, postType],
  )

  const validateFileForType = (file: File, type: InstagramPostType): string | null => {
    // Mirrors backend (InstagramUploadService) so a bad file is rejected
    // before it eats the upload bandwidth. Meta's Content Publishing spec
    // only accepts JPEG for image posts — PNG is rejected at /media.
    const isImage = file.type === 'image/jpeg'
    const isVideo = file.type === 'video/mp4' || file.type === 'video/quicktime'
    if (!isImage && !isVideo) {
      if (file.type === 'image/png') {
        return `"${file.name}" — Instagram requires JPEG. Convert and try again.`
      }
      return `"${file.name}" — unsupported format. Use JPEG (image) or MP4/MOV (video).`
    }
    if (type === 'image' && !isImage) return 'Posts require a JPEG image. Use the Reel tab for clips.'
    if (type === 'reels' && !isVideo) return 'Reels require a video file.'
    if (type === 'image' && file.size > 8 * 1024 * 1024) return 'Images must be 8 MB or smaller.'
    if (isVideo && file.size > 100 * 1024 * 1024) {
      return 'Videos must be 100 MB or smaller.'
    }
    return null
  }

  const onFilesPicked = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !account) return
      const files = Array.from(fileList)
      if (postType !== 'carousel' && files.length > 1) {
        onError('Only a carousel post supports multiple files. Pick one and try again.')
        return
      }
      if (postType !== 'carousel') {
        // single-asset types: replace any prior pick
        for (const a of assets) URL.revokeObjectURL(a.previewUrl)
        setAssets([])
      } else if (assets.length + files.length > MAX_CAROUSEL) {
        onError(`Carousels can hold at most ${MAX_CAROUSEL} items.`)
        return
      }

      for (const file of files) {
        const validationError = validateFileForType(file, postType)
        if (validationError) {
          onError(validationError)
          continue
        }
        // Pre-upload metadata check for videos. Meta returns container
        // ERROR with no human reason for wrong-aspect Stories (must be
        // strictly 9:16) and out-of-bounds Reel durations — catching it
        // here saves the upload bandwidth + an opaque round-trip failure.
        const isVideoFile = file.type.startsWith('video/')
        if (isVideoFile) {
          try {
            const meta = await inspectVideo(file)
            const videoError = validateVideoForType(meta, postType)
            if (videoError) {
              onError(videoError)
              continue
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not read video metadata.'
            onError(message)
            continue
          }
        }
        const previewUrl = URL.createObjectURL(file)
        setStatus({ kind: 'uploading', loaded: 0, total: file.size, fileName: file.name })
        try {
          const upload = await instagramApi.uploadMedia(account.id, file, (loaded, total) => {
            setStatus({ kind: 'uploading', loaded, total, fileName: file.name })
          })
          setAssets((prev) => [...prev, { ...upload, previewUrl, fileName: file.name }])
          setStatus({ kind: 'idle' })
        } catch (err) {
          URL.revokeObjectURL(previewUrl)
          const message = err instanceof Error ? err.message : 'Upload failed'
          setStatus({ kind: 'error', message })
          onError(message)
          // Stop on first failure — uploading half a carousel and then
          // erroring puts the UI in a weird half-state.
          break
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [account, assets, onError, postType],
  )

  const removeAsset = useCallback((index: number) => {
    setAssets((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed && removed.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!account) return
    if (!aiSupportedHere) {
      onError('AI generation is available for Post, Carousel, and Story.')
      return
    }
    const prompt = aiPrompt.trim()
    if (prompt.length < 5) {
      onError('Describe what you want — at least a few words.')
      return
    }
    if (postType !== 'carousel' && assets.length > 0) {
      onError('You already have a post asset. Remove it first or switch to Carousel for multiple slides.')
      return
    }
    if (postType === 'carousel' && assets.length >= MAX_CAROUSEL) {
      onError(`Carousels can hold at most ${MAX_CAROUSEL} items.`)
      return
    }

    setStatus({ kind: 'generating' })
    try {
      const result = await instagramApi.generateAiPost(account.id, {
        prompt,
        post_type: postType as 'image' | 'carousel' | 'story',
      })
      // Add the generated image as an asset. previewUrl reuses the public
      // microservice URL — works as an <img src> directly. storedPath stays
      // empty because we didn't go through our upload service; cleanup uses
      // aiUrl instead.
      const newAsset: UploadedAsset = {
        url: result.image_url,
        storedPath: '',
        kind: 'image',
        mimeType: result.mime_type || 'image/jpeg',
        size: 0,
        backend: 's3',
        previewUrl: result.image_url,
        fileName: 'ai-generated.jpg',
        aiUrl: result.ai_microservice_url,
      }
      setAssets((prev) => [...prev, newAsset])

      // Prefill caption + hashtags only if the user hasn't already written
      // something — otherwise we'd clobber their draft. Stories return an
      // empty caption from the backend.
      if (postType !== 'story') {
        const hashtagBlock = result.hashtags.length
          ? '\n\n' + result.hashtags.map((t) => `#${t}`).join(' ')
          : ''
        const next = `${result.caption}${hashtagBlock}`.trim()
        setCaption((prev) => (prev.trim().length === 0 ? next : prev))
      }

      setStatus({ kind: 'idle' })
      setAiPanelOpen(false)
      setAiPrompt('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI generation failed'
      setStatus({ kind: 'error', message })
      onError(message)
    }
  }, [account, aiPrompt, aiSupportedHere, assets.length, onError, postType])

  const canPublish = useMemo(() => {
    if (!account || isBusy || captionTooLong || tooManyTags) return false
    switch (postType) {
      case 'image':
        return assets.length === 1 && assets[0].kind === 'image'
      case 'video':
        return assets.length === 1 && assets[0].kind === 'video'
      case 'reels':
        return assets.length === 1 && assets[0].kind === 'video'
      case 'carousel':
        return assets.length >= 2 && assets.length <= MAX_CAROUSEL
      case 'story':
        return assets.length === 1
      default:
        return false
    }
  }, [account, assets, captionTooLong, isBusy, postType, tooManyTags])

  const buildSpec = (): InstagramPublishSpec | null => {
    if (assets.length === 0) return null
    const captionText = caption.trim() || undefined
    switch (postType) {
      case 'image':
        return {
          type: 'image',
          image_url: assets[0].url,
          caption: captionText,
        }
      case 'video':
        return {
          type: 'video',
          video_url: assets[0].url,
          caption: captionText,
        }
      case 'reels':
        return {
          type: 'reels',
          video_url: assets[0].url,
          caption: captionText,
          share_to_feed: true,
        }
      case 'carousel': {
        const children: InstagramCarouselChild[] = assets.map((a) => ({
          kind: a.kind,
          ...(a.kind === 'image' ? { image_url: a.url } : { video_url: a.url }),
        }))
        return { type: 'carousel', children, caption: captionText }
      }
      case 'story':
        return assets[0].kind === 'image'
          ? { type: 'story', image_url: assets[0].url }
          : { type: 'story', video_url: assets[0].url }
      default:
        return null
    }
  }

  const handlePublish = useCallback(async () => {
    if (!account || !canPublish) return
    const spec = buildSpec()
    if (!spec) return
    // Split cleanup by storage origin: regular uploads go to our S3/local via
    // the upload service; AI-generated images live in the microservice's S3
    // and need its /reject endpoint instead.
    const cleanupPaths = assets
      .filter((a) => !a.aiUrl && a.storedPath)
      .map((a) => a.storedPath)
    const cleanupAiUrls = assets
      .filter((a) => !!a.aiUrl)
      .map((a) => a.aiUrl as string)
    setStatus({ kind: 'publishing' })
    try {
      const result = await instagramApi.publishMedia(
        account.id,
        spec,
        cleanupPaths,
        cleanupAiUrls,
      )
      setStatus({ kind: 'success', mediaId: result.media_id, postType })
      onPublished({ type: postType, mediaId: result.media_id })
      // Auto-close after success so the parent can reflect new media in the
      // grid; user can dismiss earlier via the X.
      setTimeout(() => {
        reset()
        onClose()
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed'
      setStatus({ kind: 'error', message })
      onError(message)
    }
    // Note: don't unconditionally clear status to idle on publish failure —
    // keeping `error` visible inside the dialog gives the user something to
    // act on. They can edit caption, retry, or close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, assets, canPublish, onClose, onError, onPublished, postType, reset])

  if (!account) return null

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
    >
      <Box
        sx={{
          height: 6,
          background: IG_GRADIENT,
        }}
      />
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: IG_GRADIENT,
              p: '2px',
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                bgcolor: 'background.paper',
                p: '1px',
              }}
            >
              <Avatar
                src={account.ig_profile_picture_url || undefined}
                sx={{ width: '100%', height: '100%', fontSize: 14 }}
              >
                {(account.ig_username || '?')[0]?.toUpperCase()}
              </Avatar>
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
              New post
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Posting as @{account.ig_username}
            </Typography>
          </Box>
          <IconButton onClick={handleClose} disabled={isBusy} aria-label="Close" size="small">
            <Close fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <Tabs
        value={postType}
        onChange={(_, v: InstagramPostType) => handleTypeChange(v)}
        variant="fullWidth"
        sx={{
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 44,
          '& .MuiTab-root': {
            minHeight: 44,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          },
          '& .MuiTabs-indicator': { bgcolor: 'text.primary', height: 1.5 },
        }}
      >
        {TAB_DEFS.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            icon={t.icon as React.ReactElement}
            iconPosition="start"
            label={t.label}
            disabled={isBusy}
          />
        ))}
      </Tabs>

      <DialogContent sx={{ pt: 2.5 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {tab.helper}
          </Typography>
          {aiSupportedHere ? (
            <Button
              size="small"
              startIcon={<AutoAwesome sx={{ fontSize: 16 }} />}
              onClick={() => setAiPanelOpen((v) => !v)}
              disabled={isBusy}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 12,
                px: 1.25,
                py: 0.25,
                background: aiPanelOpen ? IG_GRADIENT : 'transparent',
                color: aiPanelOpen ? 'white' : 'text.primary',
                border: aiPanelOpen ? 'none' : '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  background: aiPanelOpen ? IG_GRADIENT : 'grey.50',
                  filter: aiPanelOpen ? 'brightness(1.05)' : undefined,
                },
              }}
            >
              {aiPanelOpen ? 'Hide AI' : 'Generate with AI'}
            </Button>
          ) : null}
        </Stack>

        {aiPanelOpen && aiSupportedHere ? (
          <Box
            sx={{
              mb: 2,
              p: 1.75,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              background:
                'linear-gradient(135deg, rgba(240,148,51,0.05), rgba(220,39,67,0.05) 50%, rgba(188,24,136,0.05))',
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.75 }}>
              <AutoAwesome sx={{ fontSize: 14, color: '#dc2743' }} />
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
              >
                Describe the post
              </Typography>
            </Stack>
            <TextField
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={
                postType === 'story'
                  ? 'e.g. minimal vertical announcement for our new espresso blend, warm tones'
                  : postType === 'carousel'
                  ? 'e.g. one slide showing our new espresso blend on a marble counter'
                  : 'e.g. cozy coffee shop morning, soft natural light, our espresso cup on a marble counter'
              }
              multiline
              minRows={2}
              maxRows={5}
              fullWidth
              size="small"
              disabled={isGenerating}
              slotProps={{ input: { sx: { fontSize: 13, lineHeight: 1.5 } } }}
            />
            <Stack
              direction="row"
              sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 1 }}
            >
              <Typography variant="caption" color="text.secondary">
                {postType === 'story'
                  ? '9:16 vertical · JPEG'
                  : '1:1 square · JPEG · caption + hashtags included'}
              </Typography>
              <Button
                size="small"
                variant="contained"
                onClick={handleGenerate}
                disabled={isBusy || aiPrompt.trim().length < 5}
                startIcon={
                  isGenerating ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <AutoAwesome sx={{ fontSize: 14 }} />
                  )
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                  background: IG_GRADIENT,
                  color: 'white',
                  '&:hover': { background: IG_GRADIENT, filter: 'brightness(1.05)' },
                  '&.Mui-disabled': {
                    background: 'rgba(0,0,0,0.12)',
                    color: 'rgba(0,0,0,0.38)',
                  },
                }}
              >
                {isGenerating ? 'Generating…' : 'Generate'}
              </Button>
            </Stack>
            {isGenerating ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}
              >
                Composing your post — this usually takes 30-60 seconds.
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {assets.length === 0 ? (
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              py: 5,
              px: 3,
              textAlign: 'center',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.5 : 1,
              transition: 'all 150ms ease',
              '&:hover': isBusy ? {} : { borderColor: 'text.secondary', bgcolor: 'grey.50' },
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: IG_GRADIENT,
                display: 'grid',
                placeItems: 'center',
                mx: 'auto',
                mb: 1.5,
                color: 'white',
              }}
            >
              <CloudUpload />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {postType === 'carousel' ? 'Add 2–10 photos or videos' : 'Click to upload'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              or drop a file here
            </Typography>
          </Box>
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
          >
            {assets.map((a, i) => (
              <MediaPreview
                key={`${a.aiUrl || a.storedPath || a.url}-${i}`}
                asset={a}
                onRemove={() => removeAsset(i)}
              />
            ))}
            {postType === 'carousel' && assets.length < MAX_CAROUSEL ? (
              <Tooltip title="Add another item">
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  sx={{
                    width: 96,
                    height: 96,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    color: 'text.secondary',
                  }}
                  aria-label="Add carousel item"
                >
                  <Add />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={tab.accept}
          multiple={postType === 'carousel'}
          style={{ display: 'none' }}
          onChange={(e) => onFilesPicked(e.target.files)}
        />

        {isUploading ? (
          <Box sx={{ mt: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography variant="caption" color="text.secondary" noWrap>
                Uploading {status.fileName}…
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round((status.loaded / Math.max(status.total, 1)) * 100)}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.round((status.loaded / Math.max(status.total, 1)) * 100)}
              sx={{ mt: 0.5, height: 6, borderRadius: 999 }}
            />
          </Box>
        ) : null}

        {postType === 'story' ? null : (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
              >
                Caption
              </Typography>
              <Typography
                variant="caption"
                color={captionTooLong ? 'error' : 'text.secondary'}
              >
                {captionLength.toLocaleString()} / {MAX_CAPTION.toLocaleString()}
              </Typography>
            </Stack>
            <TextField
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption… use #hashtags inline"
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              error={captionTooLong}
              disabled={isBusy}
              slotProps={{
                input: {
                  sx: { fontSize: 14, lineHeight: 1.55 },
                },
              }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {hashtags.slice(0, 12).map((tag) => (
                <Chip
                  key={tag}
                  label={`#${tag}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 11 }}
                />
              ))}
              {hashtags.length > 12 ? (
                <Chip
                  label={`+${hashtags.length - 12}`}
                  size="small"
                  sx={{ height: 22, fontSize: 11 }}
                />
              ) : null}
            </Stack>
            {tooManyTags ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Instagram allows up to {MAX_HASHTAGS} hashtags per post — you have{' '}
                {hashtags.length}.
              </Alert>
            ) : null}
          </>
        )}

        {postType === 'reels' || postType === 'video' ? (
          <Alert
            severity="info"
            icon={<AutoAwesome fontSize="inherit" />}
            sx={{ mt: 2, '& .MuiAlert-message': { fontSize: 12 } }}
          >
            Video processing on Instagram can take up to ~6 minutes. We'll keep this
            window open until it's done.
          </Alert>
        ) : null}

        {status.kind === 'success' ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Posted to @{account.ig_username}. Closing…
          </Alert>
        ) : null}
        {status.kind === 'error' ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {status.message}
          </Alert>
        ) : null}
      </DialogContent>

      <Divider />
      <Stack
        direction="row"
        spacing={1}
        sx={{ p: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
          {postType === 'story' ? (
            <PhotoCamera fontSize="small" />
          ) : postType === 'carousel' ? (
            <Collections fontSize="small" />
          ) : (
            <CameraAlt fontSize="small" />
          )}
          <Typography variant="caption">
            {assets.length === 0
              ? 'No media yet'
              : postType === 'carousel'
                ? `${assets.length} item${assets.length === 1 ? '' : 's'}`
                : `1 ${assets[0].kind}`}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={handleClose} disabled={isBusy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!canPublish}
            onClick={handlePublish}
            startIcon={isPublishing ? <CircularProgress size={14} color="inherit" /> : null}
            sx={{
              background: IG_GRADIENT,
              color: 'white',
              fontWeight: 700,
              textTransform: 'none',
              minWidth: 120,
              '&:hover': { background: IG_GRADIENT, filter: 'brightness(1.05)' },
              '&.Mui-disabled': { background: 'rgba(0,0,0,0.12)', color: 'rgba(0,0,0,0.38)' },
            }}
          >
            {isPublishing ? 'Posting…' : 'Post'}
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}
