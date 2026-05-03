import { useState, useRef } from 'react'
import {
  AppBar,
  Badge,
  Box,
  Button,
  ClickAwayListener,
  Divider,
  Grow,
  IconButton,
  InputAdornment,
  Paper,
  Popper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded'
import DoneAllIcon from '@mui/icons-material/DoneAllRounded'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded'
import { useNotifications, type AppNotification } from '../../context/NotificationsContext'

// ── Single notification row ───────────────────────────────────────────────────

function NotificationRow({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const isDone = n.type === 'pipeline_done'

  const title = isDone
    ? 'Pipeline complete'
    : 'Pipeline failed'

  const body = isDone
    ? `${n.scored ?? 0} trend${n.scored !== 1 ? 's' : ''} scored · ${n.classified ?? 0} classified · ${n.ingested ?? 0} ingested`
    : n.error ?? 'An error occurred'

  const timeAgo = (() => {
    const diff = Date.now() - new Date(n.timestamp).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  })()

  return (
    <Box
      onClick={() => onRead(n.id)}
      sx={{
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        bgcolor: n.read ? 'transparent' : alpha('#22D3EE', 0.04),
        borderLeft: `3px solid ${n.read ? 'transparent' : (isDone ? '#22D3EE' : '#F87171')}`,
        '&:hover': { bgcolor: alpha('#0F172A', 0.03) },
        transition: 'background 0.15s',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ mt: '2px', flexShrink: 0 }}>
          {isDone
            ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#22D3EE' }} />
            : <ErrorOutlineIcon sx={{ fontSize: 18, color: '#F87171' }} />
          }
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px' }}>
              {title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '11px', flexShrink: 0, ml: 1 }}>
              {timeAgo}
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', lineHeight: 1.5 }}>
            {body}
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

type HeaderProps = {
  title: string
  onMenu: () => void
}

export function Header({ title, onMenu }: HeaderProps) {
  const muiTheme = useTheme()
  const isSm = useMediaQuery(muiTheme.breakpoints.down('md'))
  const { notifications, unreadCount, markAllRead, markRead, clear } = useNotifications()

  const [open, setOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)

  const handleBellClick = () => {
    setOpen((v) => !v)
    if (!open && unreadCount > 0) markAllRead()
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: alpha('#FFFFFF', 0.9),
        borderRadius: '0px',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`,
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: { xs: 64, md: 72 }, px: { xs: 2, md: 3 } }}>
        {isSm && (
          <IconButton edge="start" color="inherit" onClick={onMenu} aria-label="open menu">
            <MenuRoundedIcon />
          </IconButton>
        )}

        <Box sx={{ flex: '0 0 auto' }}>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em', fontSize: '0.65rem' }}>
            Workspace
          </Typography>
          <Typography variant="h4" component="p" sx={{ letterSpacing: '-0.02em' }}>
            {title}
          </Typography>
        </Box>

        <TextField
          autoComplete="off"
          placeholder="Search campaigns, leads, creatives…"
          size="small"
          sx={{
            flex: 1,
            maxWidth: { xs: '100%', md: 420 },
            ml: { xs: 0, md: 'auto' },
            display: { xs: isSm ? 'none' : 'flex', md: 'flex' },
            '& .MuiOutlinedInput-root': { bgcolor: alpha('#0F172A', 0.03) },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Notifications">
            <IconButton ref={bellRef} onClick={handleBellClick} sx={{ color: 'text.secondary' }}>
              <Badge
                badgeContent={unreadCount}
                color="error"
                max={9}
                sx={{ '& .MuiBadge-badge': { fontSize: '10px', height: 16, minWidth: 16 } }}
              >
                <NotificationsNoneRoundedIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        </Stack>
      </Toolbar>

      {/* Notification dropdown */}
      <Popper open={open} anchorEl={bellRef.current} placement="bottom-end" transition style={{ zIndex: 1400 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: 'top right' }}>
            <Paper
              elevation={8}
              sx={{
                width: 360,
                maxHeight: 480,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '12px',
                border: `1px solid ${alpha('#0F172A', 0.08)}`,
                overflow: 'hidden',
                mt: 1,
              }}
            >
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Header row */}
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${alpha('#0F172A', 0.07)}` }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Notifications
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {notifications.length > 0 && (
                        <>
                          <Tooltip title="Mark all read">
                            <IconButton size="small" onClick={markAllRead} sx={{ color: 'text.secondary' }}>
                              <DoneAllIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Clear all">
                            <IconButton size="small" onClick={clear} sx={{ color: 'text.secondary' }}>
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </Stack>

                  {/* List */}
                  <Box sx={{ overflowY: 'auto', flex: 1 }}>
                    {notifications.length === 0 ? (
                      <Box sx={{ py: 5, textAlign: 'center' }}>
                        <NotificationsNoneRoundedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.disabled">
                          No notifications yet
                        </Typography>
                      </Box>
                    ) : (
                      notifications.map((n, i) => (
                        <Box key={n.id}>
                          <NotificationRow n={n} onRead={markRead} />
                          {i < notifications.length - 1 && (
                            <Divider sx={{ mx: 2, borderColor: alpha('#0F172A', 0.05) }} />
                          )}
                        </Box>
                      ))
                    )}
                  </Box>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${alpha('#0F172A', 0.07)}` }}>
                      <Button
                        size="small"
                        fullWidth
                        onClick={() => { clear(); setOpen(false) }}
                        sx={{ fontSize: '12px', color: 'text.secondary' }}
                      >
                        Clear all notifications
                      </Button>
                    </Box>
                  )}
                </Box>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </AppBar>
  )
}
