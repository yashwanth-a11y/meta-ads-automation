import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AdsPage } from './pages/AdsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AuthPage, AUTH_ROUTE, DASHBOARD_ROUTE, paths } from './auth'
import { ChannelsPage } from './pages/ChannelsPage'
import { CreativesPage } from './pages/CreativesPage'
import { CRMPage } from './pages/CRMPage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrendsPage } from './pages/TrendsPage'

function isAuthenticated() {
  const localToken = localStorage.getItem('auth_token')
  const sessionToken = sessionStorage.getItem('auth_token')
  return Boolean(localToken || sessionToken)
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to={paths.auth} replace />
  }
  return <>{children}</>
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to={paths.dashboard} replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        path={AUTH_ROUTE}
        element={
          <PublicOnlyRoute>
            <AuthPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to={isAuthenticated() ? paths.dashboard : paths.auth} replace />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path={DASHBOARD_ROUTE} element={<DashboardPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="creatives" element={<CreativesPage />} />
        <Route path="ads" element={<AdsPage />} />
        <Route path="crm" element={<CRMPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={isAuthenticated() ? paths.dashboard : paths.auth} replace />}
      />
    </Routes>
  )
}
