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
  AutoAwesome,
  CampaignOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  HubOutlined,
  LogoutOutlined,
  PeopleOutlined,
  SettingsOutlined,
  TrendingUpOutlined,
  VideoLibraryOutlined,
} from '@mui/icons-material'
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft'
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight'
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
  { to: paths.approvals, label: 'Approvals', icon: CheckCircleOutlined },
  { to: paths.crm, label: 'CRM', icon: PeopleOutlined },
  { to: paths.analytics, label: 'Analytics', icon: AnalyticsOutlined },
  { to: paths.genui, label: 'AI Assistant', icon: AutoAwesome },
]

type SidebarProps = {
  onNavigate?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

type StoredUser = {
  first_name?: string
  last_name?: string
  email?: string
}

export function Sidebar({ onNavigate, isCollapsed, onToggleCollapse }: SidebarProps) {
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
        position: 'relative',
        height: '100%',
        py: 2,
        px: 1.5,
      }}
    >
      <IconButton
        onClick={onToggleCollapse}
        size="small"
        sx={{
          position: 'absolute',
          top: 24,
          right: -12,
          bgcolor: '#FFFFFF',
          border: `1px solid ${alpha('#0F172A', 0.08)}`,
          color: '#475569',
          zIndex: 10,
          width: 24,
          height: 24,
          '&:hover': { bgcolor: '#F8FAFC' }
        }}
      >
        {isCollapsed ? <KeyboardDoubleArrowRightIcon sx={{ fontSize: 16 }} /> : <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 16 }} />}
      </IconButton>

      <Box sx={{ px: isCollapsed ? 1 : 1.5, mb: 3, display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', minHeight: 40, position: 'relative' }}>
        {isCollapsed ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', animation: 'fadeIn 0.3s ease' }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 0C16 8.83656 23.1634 16 32 16C23.1634 16 16 23.1634 16 32C16 23.1634 8.83656 16 0 16C8.83656 16 16 8.83656 16 0Z" fill="#22D3EE" />
            </svg>
          </Box>
        ) : (
          <Box sx={{
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            width: '160px',
            animation: 'fadeIn 0.3s ease'
          }}>
            <img src={logo} alt="PhotonX" width="160px" />
          </Box>
        )}
      </Box>

      <List sx={{ flex: 1, py: 0 }} disablePadding>
        {navItems.map(({ to, label, icon: Icon }) => (
          <Tooltip key={to} title={isCollapsed ? label : ''} placement="right" arrow disableHoverListener={!isCollapsed}>
            <ListItemButton
              component={NavLink}
              to={to}
              end={to === paths.dashboard}
              onClick={onNavigate}
              sx={{
                borderRadius: "2px",
                mb: 0.5,
                py: 1.1,
                fontSize: "14px !important",
                px: isCollapsed ? 1 : 1.5,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                // color: '#475569', // Slate 600
                transition: 'all 220ms ease',
                '& .MuiListItemIcon-root': {
                  // color: '#475569',
                  minWidth: isCollapsed ? 0 : 40,
                  justifyContent: 'center',
                },
                '&:hover': {
                  bgcolor: alpha('#22D3EE', 0.1),
                  color: '#0F172A',
                  '& .MuiListItemIcon-root': { color: '#0F172A' },
                },
                '&.active': {
                  color: '#0F172A',
                  bgcolor: alpha('#22D3EE', 0.15),
                  borderLeft: '3px solid #22D3EE',
                  fontWeight: 700,
                  '& .MuiListItemIcon-root': { color: '#0EA5E9' }, // Cyan icon when active
                },
              }}
            >
              <ListItemIcon>
                <Icon fontSize="small" />
              </ListItemIcon>
              {!isCollapsed && (
                <ListItemText
                  primary={label}
                  slotProps={{ primary: { variant: 'subtitle1', sx: { fontWeight: 600 } } }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        ))}
        <Tooltip title={isCollapsed ? "Logout" : ''} placement="right" arrow disableHoverListener={!isCollapsed}>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              borderRadius: "8px",
              mb: 0.5,
              py: 1.1,
              px: isCollapsed ? 1 : 1.5,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              color: '#475569',
              transition: 'all 220ms ease',
              '& .MuiListItemIcon-root': {
                color: '#475569',
                minWidth: isCollapsed ? 0 : 40,
                justifyContent: 'center',
              },
              '&:hover': {
                bgcolor: alpha('#EF4444', 0.1), // light red for logout hover
                color: '#EF4444',
                '& .MuiListItemIcon-root': { color: '#EF4444' },
              },
            }}
          >
            <ListItemIcon>
              <LogoutOutlined fontSize="small" />
            </ListItemIcon>
            {!isCollapsed && (
              <ListItemText
                primary="Logout"
                slotProps={{ primary: { variant: 'subtitle1', sx: { fontWeight: 600 } } }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </List>

      <Divider sx={{ borderColor: alpha('#0F172A', 0.08), my: 1 }} />

      <Stack
        direction={isCollapsed ? "column" : "row"}
        spacing={1.25}
        sx={{ px: isCollapsed ? 0.5 : 1, pt: 1, alignItems: 'flex-start' }}
      >
        <Tooltip title={isCollapsed ? displayName : ''} placement="right" arrow disableHoverListener={!isCollapsed}>
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: alpha('#22D3EE', 0.18),
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '0.875rem',
              mb: isCollapsed ? 1 : 0
            }}
          >
            {initials}
          </Avatar>
        </Tooltip>
        {!isCollapsed && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ color: '#0F172A', fontWeight: 600 }}>
              {displayName}
            </Typography>
            <Typography variant="subtitle2" sx={{ color: '#64748B' }} noWrap>
              Logged in user
            </Typography>
          </Box>
        )}
        <Tooltip title="Settings" placement={isCollapsed ? "right" : "top"} arrow>
          <IconButton
            component={NavLink}
            to={paths.settings}
            size="small"
            onClick={onNavigate}
            sx={{
              color: '#64748B',
              '&:hover': { color: '#0F172A', bgcolor: alpha('#0F172A', 0.06) },
            }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* <Tooltip title="Sign out" placement={isCollapsed ? "right" : "top"} arrow>
          <IconButton
            size="small"
            onClick={handleLogout}
            sx={{
              color: '#64748B',
              '&:hover': { color: '#EF4444', bgcolor: alpha('#EF4444', 0.06) },
            }}
          >
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip> */}
      </Stack>
    </Stack>
  )
}