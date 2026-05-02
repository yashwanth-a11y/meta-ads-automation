import {
  Avatar,
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  AnalyticsOutlined,
  CampaignOutlined,
  DashboardOutlined,
  HubOutlined,
  LogoutOutlined,
  PeopleOutlined,
  SettingsOutlined,
  TrendingUpOutlined,
  VideoLibraryOutlined,
} from '@mui/icons-material'
import { useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo-1.svg'
import { paths } from '../../auth'

const navItems = [
  { to: paths.dashboard, label: 'Dashboard', icon: DashboardOutlined },
  { to: paths.channels, label: 'Channels', icon: HubOutlined },
  { to: paths.trends, label: 'Trends', icon: TrendingUpOutlined },
  { to: paths.creatives, label: 'Creatives', icon: VideoLibraryOutlined },
  { to: paths.ads, label: 'Ads', icon: CampaignOutlined },
  { to: paths.crm, label: 'CRM', icon: PeopleOutlined },
  { to: paths.analytics, label: 'Analytics', icon: AnalyticsOutlined },
]

type SidebarProps = {
  onNavigate?: () => void
}

type StoredUser = {
  first_name?: string
  last_name?: string
  email?: string
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const user = useMemo<StoredUser | null>(() => {
    const raw = localStorage.getItem('auth_user')
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredUser
      return typeof parsed === 'object' && parsed ? parsed : null
    } catch {
      return null
    }
  }, [])
  const fullName = [user?.first_name?.trim(), user?.last_name?.trim()].filter(Boolean).join(' ')
  const displayName = fullName || user?.email || 'User'
  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || (displayName[0]?.toUpperCase() ?? 'U')

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    sessionStorage.removeItem('auth_token')
    onNavigate?.()
    navigate(paths.auth)
  }

  return (
    <Stack
      component="nav"
      sx={{
        height: '100%',
        py: 2,
        px: 1.5,
      }}
    >
      <Box sx={{ px: 1, mb: 3 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <img src={logo} alt="PhotonX" width="200px" />
        </Stack>
      </Box>

      <List sx={{ flex: 1, py: 0 }} disablePadding>
        {navItems.map(({ to, label, icon: Icon }) => (
          <ListItemButton
            key={to}
            component={NavLink}
            to={to}
            end={to === paths.dashboard}
            onClick={onNavigate}
            sx={{
              borderRadius: "3px",
              mb: 0.5,
              py: 1.1,
              px: 1.25,
              color: 'text.secondary',
              transition: 'background-color 220ms ease, color 220ms ease, box-shadow 220ms ease',
              '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 40 },
              '&:hover': {
                bgcolor: alpha('#22D3EE', 0.06),
                color: 'text.primary',
                '& .MuiListItemIcon-root': { color: 'text.primary' },
              },
              '&.active': {
                color: 'text.primary',
                bgcolor: alpha('#22D3EE', 0.12),
                borderLeft: '3px solid #22D3EE',
                // boxShadow: `inset 3px 0 0 #22D3EE, 0 8px 20px ${alpha('#0F172A', 0.08)}`,
                '& .MuiListItemIcon-root': { color: 'primary.main' },
              },
            }}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={label}
              slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600 } } }}
            />
          </ListItemButton>
        ))}
        <ListItemButton
          onClick={handleLogout}
          sx={{
            mb: 0.5,
            py: 1.1,
            px: 1.25,
            color: 'text.secondary',
            transition: 'background-color 220ms ease, color 220ms ease, box-shadow 220ms ease',
            '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 40 },
            '&:hover': {
              bgcolor: alpha('#22D3EE', 0.06),
              color: 'text.primary',
              '& .MuiListItemIcon-root': { color: 'text.primary' },
            },
          }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Logout"
            slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600 } } }}
          />
        </ListItemButton>
      </List>

      <Divider sx={{ borderColor: alpha('#0F172A', 0.08), my: 1 }} />

      <Stack direction="row" spacing={1.25} sx={{ px: 1, py: 1, alignItems: 'center' }}>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: alpha('#22D3EE', 0.18),
            color: 'text.primary',
            fontWeight: 700,
            fontSize: '0.875rem',
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Logged in user
          </Typography>
        </Box>
        <Tooltip title="Settings">
          <IconButton
            component={NavLink}
            to={paths.settings}
            size="small"
            onClick={onNavigate}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: alpha('#0F172A', 0.06) },
            }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sign out">
          <IconButton
            size="small"
            onClick={handleLogout}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'error.main', bgcolor: alpha('#0F172A', 0.06) },
            }}
          >
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  )
}
