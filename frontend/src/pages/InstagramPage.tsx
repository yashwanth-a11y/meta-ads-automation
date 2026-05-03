import { useMemo, useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ImageList,
  ImageListItem,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material'
import { Add, OpenInNew, Refresh, Delete } from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  instagramApi,
  type InstagramAccount,
  type InstagramMediaItem,
} from '../api/instagram'
import { trendsApi, type Channel } from '../api/trends'
import { qk } from '../api/queryClient'

type Toast = { severity: 'success' | 'error' | 'info'; message: string } | null

const qkInstagram = {
  accounts: ['instagram', 'accounts'] as const,
  media: (accountId: string) => ['instagram', 'accounts', accountId, 'media'] as const,
}

export function InstagramPage() {
  const client = useQueryClient()
  const [toast, setToast] = useState<Toast>(null)
  const [linkDialogFor, setLinkDialogFor] = useState<InstagramAccount | null>(null)
  const [linkDialogChannelId, setLinkDialogChannelId] = useState<string>('')
  const [expandedMediaFor, setExpandedMediaFor] = useState<string | null>(null)
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

  const { data: mediaResponse, isFetching: loadingMedia } = useQuery({
    queryKey: expandedMediaFor ? qkInstagram.media(expandedMediaFor) : ['instagram', 'media', 'idle'],
    queryFn: () =>
      expandedMediaFor ? instagramApi.getMedia(expandedMediaFor, { limit: 12 }) : Promise.resolve(null),
    enabled: !!expandedMediaFor,
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

  const handleToggleMedia = (accountId: string) => {
    setExpandedMediaFor((prev) => (prev === accountId ? null : accountId))
  }

  if (loadingAccounts) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Instagram Accounts
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          Connect Instagram
        </Button>
      </Stack>

      {accounts.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            No Instagram accounts connected yet.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Connect an Instagram Business account to publish from your channels.
          </Typography>
          <Button variant="contained" onClick={() => connectMutation.mutate()}>
            Connect Instagram
          </Button>
        </Card>
      ) : (
        <Stack spacing={2}>
          {accounts.map((acct) => {
            const linked = accountLinks[acct.id] ?? []
            const isMediaExpanded = expandedMediaFor === acct.id
            const mediaItems: InstagramMediaItem[] | undefined = isMediaExpanded
              ? mediaResponse?.data
              : undefined
            return (
              <Card key={acct.id}>
                <CardContent>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center' }}
                  >
                    <Avatar
                      src={acct.ig_profile_picture_url || undefined}
                      sx={{ width: 56, height: 56 }}
                    >
                      {(acct.ig_username || '?')[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        @{acct.ig_username}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {acct.ig_name} · {acct.account_type}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(acct.followers_count ?? 0).toLocaleString()} followers ·{' '}
                        {acct.media_count ?? 0} posts
                      </Typography>
                    </Box>
                    <Tooltip title="Refresh token">
                      <span>
                        <IconButton
                          onClick={() => refreshMutation.mutate(acct.id)}
                          disabled={refreshMutation.isPending}
                        >
                          <Refresh />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Disconnect">
                      <IconButton color="error" onClick={() => handleDisconnect(acct)}>
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Linked channels (this session)
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}
                    >
                      {linked.map((channelId) => (
                        <Chip
                          key={channelId}
                          label={channelById[channelId]?.name || channelId}
                          onDelete={() =>
                            unlinkMutation.mutate({ accountId: acct.id, channelId })
                          }
                          size="small"
                        />
                      ))}
                      <Chip
                        icon={<Add />}
                        label="Link channel"
                        onClick={() => setLinkDialogFor(acct)}
                        variant="outlined"
                        size="small"
                      />
                    </Stack>
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => handleToggleMedia(acct.id)}>
                      {isMediaExpanded ? 'Hide recent posts' : 'Show recent posts'}
                    </Button>
                    {isMediaExpanded && loadingMedia && (
                      <CircularProgress size={20} sx={{ ml: 2 }} />
                    )}
                    {isMediaExpanded && mediaItems && mediaItems.length > 0 && (
                      <ImageList cols={4} gap={6} sx={{ mt: 1 }}>
                        {mediaItems.map((m) => (
                          <ImageListItem key={m.id} sx={{ position: 'relative' }}>
                            <img
                              src={m.thumbnail_url || m.media_url}
                              alt={m.caption?.slice(0, 40) || m.id}
                              style={{
                                width: '100%',
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 4,
                              }}
                            />
                            <IconButton
                              size="small"
                              href={m.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                bgcolor: 'rgba(255,255,255,0.8)',
                              }}
                            >
                              <OpenInNew fontSize="small" />
                            </IconButton>
                          </ImageListItem>
                        ))}
                      </ImageList>
                    )}
                    {isMediaExpanded && mediaItems && mediaItems.length === 0 && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                      >
                        No posts yet on this account.
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Stack>
      )}

      <Dialog open={!!linkDialogFor} onClose={() => setLinkDialogFor(null)}>
        <DialogTitle>Link @{linkDialogFor?.ig_username} to a channel</DialogTitle>
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
        <DialogActions>
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
