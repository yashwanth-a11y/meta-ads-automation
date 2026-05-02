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
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo-1.svg'
import { paths, useAuth } from '../../auth'

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

export function Sidebar({ onNavigate }: SidebarProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const onLogout = () => {
    logout()
    onNavigate?.()
    navigate(paths.auth, { replace: true })
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
              // borderRadius: 2,
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
                bgcolor: alpha('#FFFFFF', 0.08),
                boxShadow: `inset 3px 0 0 #22D3EE, 0 0 24px ${alpha('#FFFFFF', 0.06)}`,
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
      </List>

      <Divider sx={{ borderColor: alpha('#FFFFFF', 0.06), my: 1 }} />

      <Stack direction="row" spacing={1.25} sx={{ px: 1, py: 1, alignItems: 'center' }}>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: alpha('#FFFFFF', 0.12),
            color: 'text.primary',
            fontWeight: 700,
            fontSize: '0.875rem',
          }}
        >
          AJ
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            Alex Jain
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Founder · PhotonX
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
              '&:hover': { color: 'text.primary', bgcolor: alpha('#FFFFFF', 0.06) },
            }}
          >
            <SettingsOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sign out">
          <IconButton
            size="small"
            onClick={onLogout}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'error.main', bgcolor: alpha('#FFFFFF', 0.06) },
            }}
          >
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  )
}
