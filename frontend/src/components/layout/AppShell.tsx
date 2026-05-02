import { Box, Drawer, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { AIAssistantFab } from '../ui/AIAssistantFab'
import { paths, useAuth } from '../../auth'

const pathTitles: Record<string, string> = {
  [paths.dashboard]: 'Dashboard',
  [paths.channels]: 'Channels',
  [paths.trends]: 'Trends',
  [paths.creatives]: 'Creatives',
  [paths.ads]: 'Ads',
  [paths.crm]: 'CRM',
  [paths.analytics]: 'Analytics',
  [paths.settings]: 'Settings',
}

const SIDEBAR_WIDTH = 268

export function AppShell() {
  const theme = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const title = useMemo(() => pathTitles[location.pathname] ?? 'PhotonX', [location.pathname])

  // Reactive auth guard: any 401 from anywhere clears the token and fires
  // 'auth:invalid' (see api/client.ts). useAuth listens and flips
  // isAuthenticated → we redirect to /auth and remember where they were.
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(paths.auth, { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Initial guard so we don't even render the protected shell during the
  // first paint when we already know there's no token.
  if (!isAuthenticated) {
    return <Navigate to={paths.auth} replace state={{ from: location.pathname }} />
  }

  const drawer = <Sidebar onNavigate={() => setMobileOpen(false)} />

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="aside"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: theme.zIndex.drawer,
          bgcolor: 'background.paper',
          borderRight: `1px solid ${alpha('#0F172A', 0.08)}`,
        }}
      >
        {drawer}
      </Box>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
          },
        }}
      >
        {drawer}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Header title={title} onMenu={() => setMobileOpen(true)} />
        <Box
          sx={{
            flex: 1,
            px: { xs: 2, sm: 3, lg: 4 },
            py: { xs: 2, md: 3 },
            pb: { xs: 10, md: 4 },
            background: (t) =>
              `radial-gradient(1200px 600px at 80% -10%, ${alpha('#22D3EE', 0.12)} 0%, transparent 55%), radial-gradient(900px 480px at 0% 100%, ${alpha('#0F172A', 0.05)} 0%, transparent 50%), ${t.palette.background.default}`,
          }}
        >
          <Outlet />
        </Box>
      </Box>
      <AIAssistantFab />
    </Box>
  )
}
