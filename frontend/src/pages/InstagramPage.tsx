import { useMemo, useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  Alert,
  Divider,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  Add,
  Refresh,
  Delete,
  FavoriteBorder,
  ChatBubbleOutlined,
  BookmarkBorder,
  PlayArrow,
  Collections,
  Close,
  CameraAlt,
  Verified,
  TrendingUp,
  GridOnOutlined,
  PhotoLibraryOutlined,
  MovieOutlined,
  ViewCarouselOutlined,
  ContentCopy,
  ChevronRight,
  IosShare,
  PeopleAltOutlined,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  instagramApi,
  type InstagramAccount,
  type InstagramMediaItem,
  type InstagramMediaResponse,
  type InstagramPostType,
  type InstagramComment,
  type InstagramCommentsResponse,
} from '../api/instagram'
import { trendsApi, type Channel } from '../api/trends'
import { qk } from '../api/queryClient'
import { InstagramComposer } from '../components/instagram/InstagramComposer'

type Toast = { severity: 'success' | 'error' | 'info'; message: string } | null

const qkInstagram = {
  accounts: ['instagram', 'accounts'] as const,
  media: (accountId: string) => ['instagram', 'accounts', accountId, 'media'] as const,
}

const IG_GRADIENT =
  'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'

type PostTab = 'all' | 'posts' | 'reels' | 'carousels'

// Single source of truth for which tab a media item belongs to.
// We treat REELS as its own bucket (regardless of media_type), CAROUSEL_ALBUM
// as its own bucket, and everything else (FEED IMAGE, FEED VIDEO) as a "post".
function classifyMedia(m: InstagramMediaItem): Exclude<PostTab, 'all'> {
  if (m.media_product_type === 'REELS') return 'reels'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousels'
  return 'posts'
}

const TAB_EMPTY_COPY: Record<Exclude<PostTab, 'all'>, string> = {
  posts: 'No standalone posts yet.',
  reels: 'No reels yet.',
  carousels: 'No carousel posts yet.',
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 64 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {typeof value === 'number' ? formatCount(value) : value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
}

function GradientAvatar({
  src,
  fallback,
  size = 88,
}: {
  src?: string | null
  fallback: string
  size?: number
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: IG_GRADIENT,
        p: '3px',
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          bgcolor: 'background.paper',
          p: '2px',
        }}
      >
        <Avatar
          src={src || undefined}
          sx={{ width: '100%', height: '100%', fontSize: size * 0.4, fontWeight: 700 }}
        >
          {fallback}
        </Avatar>
      </Box>
    </Box>
  )
}

function PostThumbnail({
  media,
  onOpen,
}: {
  media: InstagramMediaItem
  onOpen: () => void
}) {
  const isVideo = media.media_type === 'VIDEO'
  const isCarousel = media.media_type === 'CAROUSEL_ALBUM'
  const imageUrl = media.thumbnail_url || media.media_url

  return (
    <Box
      onClick={onOpen}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        bgcolor: 'grey.100',
        cursor: 'pointer',
        overflow: 'hidden',
        borderRadius: 1,
        '&:hover .ig-overlay': { opacity: 1 },
        '&:hover img': { transform: 'scale(1.04)' },
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={media.caption?.slice(0, 80) || media.id}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transition: 'transform 300ms ease',
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: 'text.disabled',
          }}
        >
          <CameraAlt />
        </Box>
      )}

      {(isVideo || isCarousel) && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: 'white',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
            display: 'flex',
          }}
        >
          {isVideo ? <PlayArrow /> : <Collections />}
        </Box>
      )}

      <Box
        className="ig-overlay"
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(0,0,0,0.45)',
          opacity: 0,
          transition: 'opacity 200ms ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          color: 'white',
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <FavoriteBorder fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {typeof media.like_count === 'number' ? formatCount(media.like_count) : '—'}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <ChatBubbleOutlined fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {typeof media.comments_count === 'number' ? formatCount(media.comments_count) : '—'}
          </Typography>
        </Stack>
      </Box>
    </Box>
  )
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  return new Date(timestamp).toLocaleDateString()
}

const COMMENT_PALETTE = [
  '#6366F1',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
]

function pickCommentColor(seed: string): string {
  if (!seed) return COMMENT_PALETTE[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return COMMENT_PALETTE[Math.abs(h) % COMMENT_PALETTE.length]
}

function CommentAvatar({ username, size = 32 }: { username?: string; size?: number }) {
  const color = pickCommentColor(username || '?')
  const initials = (username || '?')
    .replace(/^@/, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: alpha(color, 0.15),
        color,
        border: `1.5px solid ${alpha(color, 0.3)}`,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.36,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initials}
    </Box>
  )
}

function CommentRow({
  comment,
  isReply = false,
}: {
  comment: InstagramComment
  isReply?: boolean
}) {
  const replies = comment.replies?.data ?? []
  return (
    <Box>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
        <CommentAvatar username={comment.username} size={isReply ? 26 : 32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
              {comment.username || 'unknown'}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 11 }}
            >
              {formatRelativeTime(comment.timestamp)}
            </Typography>
            {comment.hidden ? (
              <Chip
                label="Hidden"
                size="small"
                sx={{
                  height: 16,
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: '4px',
                  bgcolor: alpha('#0f172a', 0.06),
                  color: 'text.secondary',
                }}
              />
            ) : null}
          </Stack>
          <Typography
            variant="body2"
            sx={{
              mt: 0.25,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {comment.text}
          </Typography>
          {typeof comment.like_count === 'number' && comment.like_count > 0 ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: 'center', mt: 0.5, color: 'text.secondary' }}
            >
              <FavoriteBorder sx={{ fontSize: 12 }} />
              <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
                {comment.like_count}
              </Typography>
            </Stack>
          ) : null}
        </Box>
      </Stack>

      {replies.length > 0 ? (
        <Stack spacing={1.25} sx={{ mt: 1.25, ml: 5 }}>
          {replies.map((r) => (
            <CommentRow key={r.id} comment={r} isReply />
          ))}
        </Stack>
      ) : null}
    </Box>
  )
}

function CommentsPanel({
  account,
  accountId,
  mediaId,
  totalCount,
}: {
  account: InstagramAccount
  accountId: string
  mediaId: string
  totalCount: number
}) {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<InstagramCommentsResponse, Error>({
    queryKey: ['instagram', 'accounts', accountId, 'media', mediaId, 'comments'],
    queryFn: ({ pageParam }) =>
      instagramApi.getMediaComments(accountId, mediaId, {
        limit: 25,
        after: pageParam as string | undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.paging?.next ? lastPage.paging.cursors?.after : undefined,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const comments = data?.pages.flatMap((p) => p.data) ?? []

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
        maxHeight: 320,
        bgcolor: 'background.paper',
      }}
    >
      {/* Header strip — count + handle */}
      <Stack
        direction="row"
        sx={{
          px: 2.5,
          py: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
              color: 'primary.main',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <ChatBubbleOutlined sx={{ fontSize: 14 }} />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Comments ({totalCount})
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap>
          @{account.ig_username}
        </Typography>
      </Stack>

      <Divider />

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: 2.5,
          py: 1.5,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha('#0f172a', 0.12),
            borderRadius: 3,
          },
        }}
      >
        {isLoading ? (
          <Stack spacing={1.5}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Stack
                key={i}
                direction="row"
                spacing={1.25}
                sx={{ alignItems: 'flex-start' }}
              >
                <Skeleton variant="circular" width={32} height={32} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="40%" height={14} />
                  <Skeleton variant="text" width="80%" height={14} />
                </Box>
              </Stack>
            ))}
          </Stack>
        ) : isError ? (
          <Alert
            severity="info"
            icon={<ChatBubbleOutlined />}
            sx={{ borderRadius: 1.5 }}
          >
            Comments unavailable for this post
            {error instanceof Error && error.message ? ` — ${error.message}` : '.'}
          </Alert>
        ) : comments.length === 0 ? (
          <Box
            sx={{
              py: 3,
              textAlign: 'center',
              color: 'text.secondary',
            }}
          >
            <ChatBubbleOutlined sx={{ fontSize: 24, color: 'text.disabled', mb: 0.5 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              No comments yet
            </Typography>
            <Typography variant="caption">
              Comments on this post will appear here.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.75} divider={<Divider flexItem sx={{ opacity: 0.6 }} />}>
            {comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </Stack>
        )}

        {hasNextPage ? (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              startIcon={
                isFetchingNextPage ? <CircularProgress size={12} /> : null
              }
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5 }}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more comments'}
            </Button>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

function formatPostTimestamp(ts: string): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${date}, ${time}`
}

function StatTile({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number | null | undefined
  loading: boolean
}) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 1.25,
        px: 1,
        minWidth: 0,
      }}
    >
      {loading && value == null ? (
        <Skeleton width={56} height={32} sx={{ mx: 'auto', mb: 0.5 }} />
      ) : (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            lineHeight: 1.1,
            mb: 0.5,
          }}
        >
          {value == null ? '—' : formatCount(value)}
        </Typography>
      )}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
        }}
      >
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 12 }}>
          {label}
        </Typography>
      </Stack>
    </Box>
  )
}

function InlineStat({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number | null | undefined
  color: string
  loading: boolean
}) {
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        py: 1,
        px: 1,
        minWidth: 0,
      }}
    >
      <Box sx={{ color, display: 'flex', alignItems: 'center' }}>{icon}</Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, fontSize: 12, color: 'text.secondary' }}
      >
        {label}
      </Typography>
      {loading && value == null ? (
        <Skeleton width={28} height={18} />
      ) : (
        <Typography
          variant="body2"
          sx={{ fontWeight: 800, fontSize: 14, color: 'text.primary' }}
        >
          {value == null ? '—' : formatCount(value)}
        </Typography>
      )}
    </Stack>
  )
}

function PostDetailDialog({
  account,
  media,
  accountId,
  onClose,
}: {
  account: InstagramAccount
  media: InstagramMediaItem
  accountId: string
  onClose: () => void
}) {
  const { data: insightsData, isLoading: insightsLoading, isError: insightsError } =
    useQuery({
      queryKey: [
        'instagram',
        'accounts',
        accountId,
        'media',
        media.id,
        'insights',
      ],
      queryFn: () =>
        instagramApi.getMediaInsights(accountId, media.id, {
          mediaType: media.media_type,
          mediaProductType: media.media_product_type,
        }),
      // Insights are fetched on demand when the modal opens. Don't refetch on
      // window focus (cheap-but-real Graph API call) and don't retry — a 400
      // here means "metric not supported", not a transient failure.
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })

  const insights =
    (insightsData?.insights ?? {}) as Record<string, number | null | undefined>
  // Prefer the counts from the media payload (always present) over the
  // insight metric of the same name; fall back to insight when missing.
  const likes =
    typeof media.like_count === 'number'
      ? media.like_count
      : (insights.likes ?? null)
  const comments =
    typeof media.comments_count === 'number'
      ? media.comments_count
      : (insights.comments ?? null)
  const shares = insights.shares ?? null
  const reach = insights.reach ?? null
  const saved = insights.saved ?? null
  const engaged = insights.total_interactions ?? null

  const isVideo = media.media_type === 'VIDEO'
  const isCarousel = media.media_type === 'CAROUSEL_ALBUM'
  const imageUrl = media.thumbnail_url || media.media_url

  const [copied, setCopied] = useState(false)
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(media.permalink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header strip */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          {/* <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              bgcolor: 'action.hover',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <ImageOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
          </Box> */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Post -
          </Typography>
          <Typography variant="body1" color="text.secondary" noWrap>
            {formatPostTimestamp(media.timestamp)}
          </Typography>
        </Stack>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close"
          sx={{
            width: 30,
            height: 30,
            bgcolor: '#ddd',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Stack>

      {/* Two-column body */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* LEFT — media */}
        <Box
          sx={{
            p: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              bgcolor: 'grey.900',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={media.caption?.slice(0, 80) || media.id}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <Stack
                sx={{
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                <CameraAlt />
              </Stack>
            )}
            {(isVideo || isCarousel) && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  color: 'white',
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
                }}
              >
                {isVideo ? <PlayArrow /> : <Collections />}
              </Box>
            )}
          </Box>
        </Box>

        {/* RIGHT — analytics */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            borderLeft: { md: '1px solid #DDD' },
            borderTop: { xs: '1px solid', md: 0 },
            borderColor: 'divider',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {/* Top stat tiles */}
            <Stack
              direction="row"
              sx={{
                alignItems: 'stretch',
                // pb: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <StatTile
                icon={<FavoriteBorder sx={{ fontSize: 14 }} />}
                label="Likes"
                value={likes}
                loading={false}
              />
              <Divider orientation="vertical" flexItem />
              <StatTile
                icon={<ChatBubbleOutlined sx={{ fontSize: 14 }} />}
                label="Comments"
                value={comments}
                loading={false}
              />
              <Divider orientation="vertical" flexItem />
              <StatTile
                icon={<IosShare sx={{ fontSize: 14 }} />}
                label="Shares"
                value={shares}
                loading={insightsLoading}
              />
            </Stack>

            {/* Mid inline stats */}
            <Box
              sx={{
                m: 2,
                py: 0.5,
                borderRadius: "8px",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
              }}
            >
              <InlineStat
                icon={<PeopleAltOutlined sx={{ fontSize: 18 }} />}
                label="Reach"
                value={reach}
                color="#8B5CF6"
                loading={insightsLoading}
              />
              <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
              <InlineStat
                icon={<BookmarkBorder sx={{ fontSize: 18 }} />}
                label="Saved"
                value={saved}
                color="#F59E0B"
                loading={insightsLoading}
              />
              <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
              <InlineStat
                icon={<TrendingUp sx={{ fontSize: 18 }} />}
                label="Engaged"
                value={engaged}
                color="#10B981"
                loading={insightsLoading}
              />
            </Box>

            {/* Caption */}
            {media.caption ? (
              <Box
                sx={{
                  m: 2,
                  p: 1.75,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  maxHeight: 160,
                  overflowY: 'auto',
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.55,
                  }}
                >
                  {media.caption}
                </Typography>
              </Box>
            ) : null}

            {insightsError ? (
              <Alert
                severity="info"
                icon={<TrendingUp />}
                sx={{ mt: 2, borderRadius: 1.5 }}
              >
                Some insights are unavailable for this post.
              </Alert>
            ) : null}
          </Box>

          {/* CTAs */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              p: 2.5,
              pt: 1.25,
              borderTop: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
              bgcolor: 'background.paper',
            }}
          >
            <Button
              variant="contained"
              fullWidth
              endIcon={<ChevronRight />}
              href={media.permalink}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                height: 44,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 14,
                borderRadius: 1.5,
              }}
            >
              See Post
            </Button>
            <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
              <IconButton
                onClick={handleCopyLink}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  height: 44,
                  width: 44,
                  flexShrink: 0,
                  color: copied ? 'primary.main' : 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                aria-label="Copy post link"
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {/* Comments — paginated, scrollable list of top-level comments + replies */}
      <CommentsPanel
        account={account}
        accountId={accountId}
        mediaId={media.id}
        totalCount={typeof comments === 'number' ? comments : 0}
      />
    </Box>
  )
}


function PostTabBar({
  value,
  onChange,
  counts,
}: {
  value: PostTab
  onChange: (tab: PostTab) => void
  counts: Record<PostTab, number>
}) {
  const tabSx = {
    minHeight: 48,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: 'text.secondary',
    gap: 0.75,
    '& .MuiTab-iconWrapper': { mr: 0 },
    '&.Mui-selected': { color: 'text.primary' },
  }

  const labelWithCount = (label: string, count: number) => (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <span>{label}</span>
      <Box
        component="span"
        sx={{
          fontSize: 10,
          fontWeight: 700,
          minWidth: 18,
          px: 0.5,
          py: 0,
          borderRadius: 999,
          bgcolor: 'action.hover',
          color: 'text.secondary',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {count}
      </Box>
    </Stack>
  )

  return (
    <Tabs
      value={value}
      onChange={(_, v: PostTab) => onChange(v)}
      variant="fullWidth"
      sx={{
        borderTop: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider',
        minHeight: 48,
        '& .MuiTabs-indicator': {
          top: 0,
          bottom: 'auto',
          height: 1.5,
          bgcolor: 'text.primary',
        },
      }}
    >
      <Tab
        value="all"
        icon={<GridOnOutlined fontSize="small" />}
        iconPosition="start"
        label={labelWithCount('All', counts.all)}
        sx={tabSx}
      />
      <Tab
        value="posts"
        icon={<PhotoLibraryOutlined fontSize="small" />}
        iconPosition="start"
        label={labelWithCount('Posts', counts.posts)}
        sx={tabSx}
      />
      <Tab
        value="reels"
        icon={<MovieOutlined fontSize="small" />}
        iconPosition="start"
        label={labelWithCount('Reels', counts.reels)}
        sx={tabSx}
      />
      <Tab
        value="carousels"
        icon={<ViewCarouselOutlined fontSize="small" />}
        iconPosition="start"
        label={labelWithCount('Carousels', counts.carousels)}
        sx={tabSx}
      />
    </Tabs>
  )
}

function PostsGrid({ account }: { account: InstagramAccount }) {
  const [openMedia, setOpenMedia] = useState<InstagramMediaItem | null>(null)
  const [tab, setTab] = useState<PostTab>('all')

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<InstagramMediaResponse, Error>({
    queryKey: qkInstagram.media(account.id),
    queryFn: ({ pageParam }) =>
      instagramApi.getMedia(account.id, {
        limit: 12,
        after: pageParam as string | undefined,
      }),
    initialPageParam: undefined,
    // IG Graph signals "more results" via paging.next; cursors.after is the
    // token to continue. When either is missing, we've reached the end.
    getNextPageParam: (lastPage) =>
      lastPage.paging?.next ? lastPage.paging.cursors?.after : undefined,
  })

  const items: InstagramMediaItem[] = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  )

  const counts = useMemo<Record<PostTab, number>>(() => {
    const c: Record<PostTab, number> = { all: 0, posts: 0, reels: 0, carousels: 0 }
    for (const m of items) {
      c.all += 1
      c[classifyMedia(m)] += 1
    }
    return c
  }, [items])

  const filteredItems = useMemo(
    () => (tab === 'all' ? items : items.filter((m) => classifyMedia(m) === tab)),
    [items, tab],
  )

  if (isLoading) {
    return (
      <Box sx={{ mt: 2 }}>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 0 }} />
        <Box
          sx={{
            mt: 1,
            display: 'grid',
            gap: { xs: 0.5, sm: 1 },
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              sx={{ aspectRatio: '1 / 1', borderRadius: 1 }}
            />
          ))}
        </Box>
      </Box>
    )
  }

  if (isError) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {(error as Error).message}
      </Alert>
    )
  }

  if (items.length === 0) {
    return (
      <Box
        sx={{
          mt: 2,
          py: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: 'divider',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CameraAlt />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          No posts yet
        </Typography>
        <Typography variant="caption">
          Posts published from linked channels will appear here.
        </Typography>
      </Box>
    )
  }

  return (
    <>
      <Box sx={{ mt: 2 }}>
        <PostTabBar value={tab} onChange={setTab} counts={counts} />
      </Box>

      {filteredItems.length === 0 ? (
        <Box
          sx={{
            mt: 4,
            mb: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            color: 'text.secondary',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {TAB_EMPTY_COPY[tab as Exclude<PostTab, 'all'>]}
          </Typography>
          <Typography variant="caption">
            Try a different tab or load more posts.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            mt: 2,
            display: 'grid',
            gap: { xs: 0.5, sm: 1 },
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {filteredItems.map((m) => (
            <PostThumbnail key={m.id} media={m} onOpen={() => setOpenMedia(m)} />
          ))}
        </Box>
      )}

      {hasNextPage ? (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : null}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more posts'}
          </Button>
        </Box>
      ) : items.length > 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 2 }}
        >
          You're all caught up.
        </Typography>
      ) : null}

      <Dialog
        open={!!openMedia}
        onClose={() => setOpenMedia(null)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 2, overflow: 'hidden' } } }}
      >
        {openMedia && (
          <PostDetailDialog
            account={account}
            media={openMedia}
            accountId={account.id}
            onClose={() => setOpenMedia(null)}
          />
        )}
      </Dialog>
    </>
  )
}

function AccountCard({
  account,
  linked,
  channelById,
  onRefresh,
  onDisconnect,
  onLink,
  onUnlink,
  onCompose,
  refreshPending,
}: {
  account: InstagramAccount
  linked: string[]
  channelById: Record<string, Channel>
  onRefresh: () => void
  onDisconnect: () => void
  onLink: () => void
  onUnlink: (channelId: string) => void
  onCompose: () => void
  refreshPending: boolean
}) {
  return (
    <Card
      sx={{
        overflow: 'hidden',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          height: 72,
          background:
            'linear-gradient(135deg, rgba(240,148,51,0.18) 0%, rgba(220,39,67,0.18) 50%, rgba(188,24,136,0.18) 100%)',
        }}
      />

      <Box sx={{ px: { xs: 2, sm: 4 }, pb: 3, mt: -6 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 2, sm: 4 }}
          sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }}
        >
          <GradientAvatar
            src={account.ig_profile_picture_url}
            fallback={(account.ig_username || '?')[0]?.toUpperCase()}
            size={104}
          />
          <Box sx={{ flex: 1, minWidth: 0, mb: { sm: 1 } }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                @{account.ig_username}
              </Typography>
              <Verified sx={{ fontSize: 18, color: '#3897F0' }} />
              {account.account_type ? (
                <Chip
                  label={account.account_type}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                />
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {account.ig_name}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75} sx={{ mb: { sm: 1 }, alignItems: 'center' }}>
            <Button
              // size="small"
              variant="contained"
              // startIcon={<EditIcon fontSize="small" />}
              onClick={onCompose}
              sx={{
                background: IG_GRADIENT,
                color: 'white',
                fontWeight: 700,
                textTransform: 'none',
                px: 1.5,
                boxShadow: '0 2px 8px rgba(220,39,67,0.30)',
                '&:hover': { background: IG_GRADIENT, filter: 'brightness(1.05)' },
              }}
            >
              New post
            </Button>
            <Tooltip title="Refresh token">
              <span>
                <IconButton
                  onClick={onRefresh}
                  disabled={refreshPending}
                  size="small"
                >
                  <Refresh fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Disconnect">
              <IconButton color="error" onClick={onDisconnect} size="small">
                <Delete fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack
          direction="row"
          spacing={4}
          sx={{
            mt: 3,
            pb: 2,
            justifyContent: { xs: 'space-around', sm: 'flex-start' },
          }}
        >
          <StatBlock value={account.media_count ?? 0} label="posts" />
          <StatBlock value={account.followers_count ?? 0} label="followers" />
          <StatBlock value={account.follows_count ?? 0} label="following" />
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Linked channels
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}
          >
            {linked.map((channelId) => (
              <Chip
                key={channelId}
                label={channelById[channelId]?.name || channelId}
                onDelete={() => onUnlink(channelId)}
                size="small"
                sx={{
                  background: IG_GRADIENT,
                  color: 'white',
                  fontWeight: 600,
                  '& .MuiChip-deleteIcon': {
                    color: 'rgba(255,255,255,0.85)',
                    '&:hover': { color: 'white' },
                  },
                }}
              />
            ))}
            <Chip
              icon={<Add />}
              label="Link channel"
              onClick={onLink}
              variant="outlined"
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
        </Box>

        <PostsGrid account={account} />
      </Box>
    </Card>
  )
}

export function InstagramPage() {
  const client = useQueryClient()
  const [toast, setToast] = useState<Toast>(null)
  const [linkDialogFor, setLinkDialogFor] = useState<InstagramAccount | null>(null)
  const [linkDialogChannelId, setLinkDialogChannelId] = useState<string>('')
  const [composerFor, setComposerFor] = useState<InstagramAccount | null>(null)
  // Per-session in-memory linked-channel map. Backend doesn't expose
  // "channels for this IG account" in v1, so we track links the user makes
  // in this session. Refreshing the page resets this view (the link rows
  // still exist in the DB and continue driving fan-out).
  const [accountLinks, setAccountLinks] = useState<Record<string, string[]>>({})

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: qkInstagram.accounts,
    queryFn: instagramApi.listAccounts,
  })

  const { data: channels = [] } = useQuery({
    queryKey: qk.channels,
    queryFn: trendsApi.listChannels,
  })

  const connectMutation = useMutation({
    mutationFn: () => instagramApi.getAuthUrl(),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl
    },
    onError: (err: Error) => setToast({ severity: 'error', message: err.message }),
  })

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => instagramApi.disconnectAccount(accountId),
    onSuccess: () => {
      setToast({ severity: 'success', message: 'Account disconnected' })
      void client.invalidateQueries({ queryKey: qkInstagram.accounts })
    },
    onError: (err: Error) => setToast({ severity: 'error', message: err.message }),
  })

  const refreshMutation = useMutation({
    mutationFn: (accountId: string) => instagramApi.refreshAccount(accountId),
    onSuccess: () => {
      setToast({ severity: 'success', message: 'Token refreshed' })
      void client.invalidateQueries({ queryKey: qkInstagram.accounts })
    },
    onError: (err: Error) => setToast({ severity: 'error', message: err.message }),
  })

  const linkMutation = useMutation({
    mutationFn: ({ accountId, channelId }: { accountId: string; channelId: string }) =>
      instagramApi.linkChannel(accountId, channelId).then(() => ({ accountId, channelId })),
    onSuccess: ({ accountId, channelId }) => {
      setAccountLinks((prev) => ({
        ...prev,
        [accountId]: [...(prev[accountId] ?? []), channelId],
      }))
      setToast({ severity: 'success', message: 'Linked' })
      setLinkDialogFor(null)
      setLinkDialogChannelId('')
    },
    onError: (err: Error) => setToast({ severity: 'error', message: err.message }),
  })

  const unlinkMutation = useMutation({
    mutationFn: ({ accountId, channelId }: { accountId: string; channelId: string }) =>
      instagramApi.unlinkChannel(accountId, channelId).then(() => ({ accountId, channelId })),
    onSuccess: ({ accountId, channelId }) => {
      setAccountLinks((prev) => ({
        ...prev,
        [accountId]: (prev[accountId] ?? []).filter((c) => c !== channelId),
      }))
      setToast({ severity: 'success', message: 'Unlinked' })
    },
    onError: (err: Error) => setToast({ severity: 'error', message: err.message }),
  })

  const channelById = useMemo<Record<string, Channel>>(
    () => Object.fromEntries(channels.map((c) => [c.id, c])),
    [channels],
  )

  const handleDisconnect = (acct: InstagramAccount) => {
    if (
      !window.confirm(
        `Disconnect @${acct.ig_username}? Linked channels will stop posting to it.`,
      )
    ) {
      return
    }
    disconnectMutation.mutate(acct.id)
  }

  if (loadingAccounts) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          mb: 4,
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              background: IG_GRADIENT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            Instagram
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage connected business accounts and their recent posts.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          sx={{
            background: IG_GRADIENT,
            color: 'white',
            fontWeight: 700,
            textTransform: 'none',
            px: 2.5,
            boxShadow: '0 4px 14px rgba(220,39,67,0.35)',
            '&:hover': {
              background: IG_GRADIENT,
              filter: 'brightness(1.05)',
              boxShadow: '0 6px 18px rgba(220,39,67,0.45)',
            },
          }}
        >
          Connect Instagram
        </Button>
      </Stack>

      {accounts.length === 0 ? (
        <Card
          sx={{
            p: 2,
            textAlign: 'center',
            borderRadius: "4px",
            border: '1px dashed',
            borderColor: 'divider',
            boxShadow: 'none',
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: IG_GRADIENT,
              display: 'grid',
              placeItems: 'center',
              mx: 'auto',
              mb: 2,
              color: 'white',
            }}
          >
            <CameraAlt fontSize="large" />
          </Box>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
            No Instagram accounts connected yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Connect an Instagram Business account to publish from your channels.
          </Typography>
          <Button
            variant="contained"
            onClick={() => connectMutation.mutate()}
            sx={{
              background: IG_GRADIENT,
              color: 'white',
              fontWeight: 700,
              textTransform: 'none',
              '&:hover': { background: IG_GRADIENT, filter: 'brightness(1.05)' },
            }}
          >
            Connect Instagram
          </Button>
        </Card>
      ) : (
        <Stack spacing={3}>
          {accounts.map((acct) => (
            <AccountCard
              key={acct.id}
              account={acct}
              linked={accountLinks[acct.id] ?? []}
              channelById={channelById}
              onRefresh={() => refreshMutation.mutate(acct.id)}
              onDisconnect={() => handleDisconnect(acct)}
              onLink={() => setLinkDialogFor(acct)}
              onUnlink={(channelId) =>
                unlinkMutation.mutate({ accountId: acct.id, channelId })
              }
              onCompose={() => setComposerFor(acct)}
              refreshPending={refreshMutation.isPending}
            />
          ))}
        </Stack>
      )}

      <Dialog
        open={!!linkDialogFor}
        onClose={() => setLinkDialogFor(null)}
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Link @{linkDialogFor?.ig_username} to a channel
        </DialogTitle>
        <DialogContent sx={{ minWidth: 360 }}>
          <Select
            fullWidth
            value={linkDialogChannelId}
            onChange={(e) => setLinkDialogChannelId(e.target.value)}
            displayEmpty
            sx={{ mt: 1 }}
          >
            <MenuItem value="" disabled>
              Pick a channel…
            </MenuItem>
            {channels.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} · {c.brand_name}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLinkDialogFor(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!linkDialogChannelId || linkMutation.isPending}
            onClick={() => {
              if (!linkDialogFor || !linkDialogChannelId) return
              linkMutation.mutate({
                accountId: linkDialogFor.id,
                channelId: linkDialogChannelId,
              })
            }}
            sx={{
              background: IG_GRADIENT,
              color: 'white',
              fontWeight: 700,
              textTransform: 'none',
              '&:hover': { background: IG_GRADIENT, filter: 'brightness(1.05)' },
            }}
          >
            Link
          </Button>
        </DialogActions>
      </Dialog>

      <InstagramComposer
        open={!!composerFor}
        account={composerFor}
        onClose={() => setComposerFor(null)}
        onPublished={({ type }: { type: InstagramPostType; mediaId: string }) => {
          setToast({
            severity: 'success',
            message:
              type === 'story'
                ? 'Story posted to Instagram'
                : `Posted to @${composerFor?.ig_username}`,
          })
          // Refresh the grid for the account that just got a new post and
          // bump the account list so media_count / followers reflect.
          if (composerFor) {
            void client.invalidateQueries({
              queryKey: qkInstagram.media(composerFor.id),
            })
          }
          void client.invalidateQueries({ queryKey: qkInstagram.accounts })
        }}
        onError={(message: string) => setToast({ severity: 'error', message })}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  )
}
