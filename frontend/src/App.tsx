import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AdsPage } from './pages/AdsPage'
import { AdsSetupPage } from './pages/AdsSetup'
import { AdsCreatePage } from './pages/AdsCreate'
import { OAuthCallback } from './pages/OAuthCallback'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AuthPage, AUTH_ROUTE, DASHBOARD_ROUTE, FORGOT_PASSWORD_ROUTE, ForgotPasswordPage, paths } from './auth'
import { ChannelsPage } from './pages/ChannelsPage'
import { ContentCalendarPage } from './pages/ContentCalendarPage'
import { CreativesPage } from './pages/CreativesPage'
import { CRMPage } from './pages/CRMPage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrendsPage } from './pages/TrendsPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import GenUIPage from './pages/GenUIPage'
import { InstagramPage } from './pages/InstagramPage'
import { InstagramCallbackPage } from './pages/InstagramCallbackPage'

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
        path={FORGOT_PASSWORD_ROUTE}
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to={isAuthenticated() ? paths.dashboard : paths.auth} replace />}
      />
      {/* OAuth popup callback — must live OUTSIDE ProtectedRoute so the
          popup can reach it even if it has no JWT (the page just postMessages
          the code+state back to the opener and closes). */}
      <Route path="oauth/meta-ads/callback" element={<OAuthCallback />} />
      {/* Instagram Business Login redirects here with ?code & ?state. The
          callback exchanges the code via /oauth/exchange. Lives outside
          ProtectedRoute because the user just bounced back from Meta. */}
      <Route path="instagram-callback" element={<InstagramCallbackPage />} />
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
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="creatives" element={<CreativesPage />} />
        <Route path="calendar" element={<ContentCalendarPage />} />
        <Route path="instagram" element={<InstagramPage />} />
        <Route path="ads" element={<AdsPage />} />
        <Route path="ads/setup" element={<AdsSetupPage />} />
        <Route path="ads/create" element={<AdsCreatePage />} />
        <Route path="crm" element={<CRMPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="genui" element={<GenUIPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={isAuthenticated() ? paths.dashboard : paths.auth} replace />}
      />
    </Routes>
  )
}
