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

export default function App() {
  return (
    <Routes>
      <Route path={AUTH_ROUTE} element={<AuthPage />} />
      <Route path="/" element={<Navigate to={paths.auth} replace />} />
      <Route element={<AppShell />}>
        <Route path={DASHBOARD_ROUTE} element={<DashboardPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="creatives" element={<CreativesPage />} />
        <Route path="ads" element={<AdsPage />} />
        <Route path="crm" element={<CRMPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={paths.auth} replace />} />
    </Routes>
  )
}
