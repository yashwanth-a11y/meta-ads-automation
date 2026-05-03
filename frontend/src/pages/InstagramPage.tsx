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
import {
  Add,
  Refresh,
  Delete,
  FavoriteBorder,
  ChatBubbleOutlined,
  Send,
  BookmarkBorder,
  MoreHoriz,
  PlayArrow,
  Collections,
  Close,
  CameraAlt,
  Verified,
  BarChart,
  TrendingUp,
  GridOnOutlined,
  PhotoLibraryOutlined,
  MovieOutlined,
  ViewCarouselOutlined,
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
} from '../api/instagram'
import { trendsApi, type Channel } from '../api/trends'
import { qk } from '../api/queryClient'

type Toast = { severity: 'success' | 'error' | 'info'; message: string } | null

const qkInstagram = {
  accounts: ['instagram', 'accounts'] as const,
  media: (accountId: string) => ['instagram', 'accounts', accountId, 'media'] as const,
}

const IG_GRADIENT =
  'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(timestamp).toLocaleDateString()
}

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

const INSIGHT_LABELS: Record<string, string> = {
  reach: 'Reach',
  saved: 'Saves',
  total_interactions: 'Interactions',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  views: 'Views',
  plays: 'Plays',
  replies: 'Replies',
}

function MediaInsightsPanel({
  accountId,
  media,
}: {
  accountId: string
  media: InstagramMediaItem
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['instagram', 'accounts', accountId, 'media', media.id, 'insights'],
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

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <BarChart fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            color: 'text.secondary',
          }}
        >
          Post insights
        </Typography>
      </Stack>

      {isLoading ? (
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : isError ? (
        <Alert
          severity="info"
          icon={<TrendingUp />}
          sx={{ borderRadius: 1 }}
        >
          Insights unavailable for this post
          {error instanceof Error && error.message
            ? ` — ${error.message}`
            : '.'}
        </Alert>
      ) : (
        (() => {
          const entries = Object.entries(data?.insights ?? {}).filter(
            ([, v]) => typeof v === 'number',
          ) as [string, number][]
          if (entries.length === 0) {
            return (
              <Typography variant="body2" color="text.secondary">
                No metrics returned by Instagram for this post yet.
              </Typography>
            )
          }
          return (
            <Box
              sx={{
                display: 'grid',
                gap: 1,
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              }}
            >
              {entries.map(([name, value]) => (
                <Box
                  key={name}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: 'grey.50',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    {INSIGHT_LABELS[name] || name.replace(/_/g, ' ')}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {formatCount(value)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )
        })()
      )}
    </Box>
  )
}

function PostFeedCard({
  account,
  media,
  accountId,
}: {
  account: InstagramAccount
  media: InstagramMediaItem
  accountId: string
}) {
  const isVideo = media.media_type === 'VIDEO'
  const isCarousel = media.media_type === 'CAROUSEL_ALBUM'
  const imageUrl = media.thumbnail_url || media.media_url

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', px: 2, py: 1.5 }}
      >
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
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {account.ig_username}
            </Typography>
            <Verified sx={{ fontSize: 14, color: '#3897F0' }} />
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap>
            {account.ig_name}
          </Typography>
        </Box>
        <IconButton size="small">
          <MoreHoriz fontSize="small" />
        </IconButton>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          bgcolor: 'grey.100',
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
        ) : null}
        {(isVideo || isCarousel) && (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              color: 'white',
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
              display: 'flex',
            }}
          >
            {isVideo ? <PlayArrow /> : <Collections />}
          </Box>
        )}
      </Box>

      <Stack direction="row" sx={{ alignItems: 'center', px: 1, pt: 1 }}>
        <IconButton aria-label="Like">
          <FavoriteBorder />
        </IconButton>
        <IconButton aria-label="Comment">
          <ChatBubbleOutlined />
        </IconButton>
        <Tooltip title="View on Instagram">
          <IconButton
            href={media.permalink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on Instagram"
          >
            <Send />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <IconButton aria-label="Save">
          <BookmarkBorder />
        </IconButton>
      </Stack>

      {typeof media.like_count === 'number' ? (
        <Typography variant="body2" sx={{ px: 2, pt: 0.5, fontWeight: 700 }}>
          {media.like_count.toLocaleString()} {media.like_count === 1 ? 'like' : 'likes'}
        </Typography>
      ) : null}

      {media.caption ? (
        <Typography
          variant="body2"
          sx={{
            px: 2,
            pt: 0.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, mr: 0.75 }}>
            {account.ig_username}
          </Box>
          {media.caption}
        </Typography>
      ) : null}

      {typeof media.comments_count === 'number' && media.comments_count > 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ px: 2, pt: 0.5 }}
        >
          View all {media.comments_count.toLocaleString()} comments
        </Typography>
      ) : null}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          px: 2,
          pt: 1,
          pb: 1,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {formatRelativeTime(media.timestamp)}
      </Typography>

      <Divider sx={{ mt: 1 }} />

      <MediaInsightsPanel accountId={accountId} media={media} />
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
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 2, overflow: 'hidden' } } }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setOpenMedia(null)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1,
              bgcolor: 'rgba(255,255,255,0.9)',
              '&:hover': { bgcolor: 'white' },
            }}
            size="small"
            aria-label="Close"
          >
            <Close fontSize="small" />
          </IconButton>
          {openMedia && (
            <PostFeedCard account={account} media={openMedia} accountId={account.id} />
          )}
        </Box>
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
  refreshPending,
}: {
  account: InstagramAccount
  linked: string[]
  channelById: Record<string, Channel>
  onRefresh: () => void
  onDisconnect: () => void
  onLink: () => void
  onUnlink: (channelId: string) => void
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

          <Stack direction="row" spacing={0.5} sx={{ mb: { sm: 1 } }}>
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
              fontWeight: 800,
              background: IG_GRADIENT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            Instagram
          </Typography>
          <Typography variant="body2" color="text.secondary">
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
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
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
