import { Box, Drawer, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { AIAssistantFab } from '../ui/AIAssistantFab'
import { paths, useAuth } from '../../auth'
import GenUIPage from '../../pages/GenUIPage'
import { NotificationsProvider } from '../../context/NotificationsContext'

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
const SIDEBAR_COLLAPSED_WIDTH = 85

export function AppShell() {
  const theme = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [aiFullscreen, setAiFullscreen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const title = useMemo(() => pathTitles[location.pathname] ?? 'PhotonX', [location.pathname])
  const toggleAiFullscreen = () => setAiFullscreen((v) => !v)

  useEffect(() => {
    if (!isAuthenticated) navigate(paths.auth, { replace: true })
  }, [isAuthenticated, navigate])

  if (!isAuthenticated) {
    return <Navigate to={paths.auth} replace state={{ from: location.pathname }} />
  }

  if (aiFullscreen) {
    return (
      <NotificationsProvider>
        <Box
          sx={{
            minHeight: '100vh',
            bgcolor: 'background.default',
            position: 'relative',
            background: (t) =>
              `radial-gradient(1200px 600px at 80% -10%, ${alpha('#22D3EE', 0.12)} 0%, transparent 55%), radial-gradient(900px 480px at 0% 100%, ${alpha('#0F172A', 0.05)} 0%, transparent 50%), ${t.palette.background.default}`,
          }}
        >
          <Box sx={{ minHeight: '100vh', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2, md: 3 }, pb: { xs: 10, md: 4 } }}>
            <GenUIPage />
          </Box>
          <AIAssistantFab active onToggle={toggleAiFullscreen} />
        </Box>
      </NotificationsProvider>
    )
  }

  return (
    <NotificationsProvider>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box
          component="aside"
          sx={{
            width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
            transition: 'width 220ms ease',
            flexShrink: 0,
            display: { xs: 'none', md: 'block' },
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: theme.zIndex.drawer,
            bgcolor: '#FFFFFF',
            borderRight: `1px solid ${alpha('#0F172A', 0.08)}`,
          }}
        >
          <Sidebar onNavigate={() => setMobileOpen(false)} isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
        </Box>

        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box', bgcolor: '#FFFFFF' },
          }}
        >
          <Sidebar onNavigate={() => setMobileOpen(false)} isCollapsed={false} onToggleCollapse={() => setMobileOpen(false)} />
        </Drawer>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            ml: { xs: 0, md: isCollapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px` },
            transition: 'margin-left 220ms ease',
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
        <AIAssistantFab active={false} onToggle={toggleAiFullscreen} />
      </Box>
    </NotificationsProvider>
  )
}
