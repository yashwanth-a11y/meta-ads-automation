import { Stack, Typography } from '@mui/material'
import { GlassCard } from '../../ui/GlassCard'
import { ChipInput } from '../ChipInput'
import { trendsApi } from '../../../api/trends'

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/

function validateXAccount(val: string): string | null {
  if (!X_HANDLE_RE.test(val)) return 'Invalid username — only letters, numbers and underscores, max 15 chars'
  return null
}

function transformXAccount(val: string): string {
  return val.replace(/^@+/, '')
}

function validateWebsite(val: string): string | null {
  try {
    const url = val.startsWith('http') ? val : `https://${val}`
    const parsed = new URL(url)
    if (!parsed.hostname.includes('.')) return 'Enter a valid domain (e.g. techcrunch.com)'
    return null
  } catch {
    return 'Enter a valid URL or domain (e.g. techcrunch.com)'
  }
}

function transformWebsite(val: string): string {
  try {
    const url = val.startsWith('http') ? val : `https://${val}`
    const { hostname, pathname } = new URL(url)
    // Store as hostname + path (no trailing slash), strip www.
    const host = hostname.replace(/^www\./, '')
    const path = pathname.replace(/\/$/, '')
    return path ? `${host}${path}` : host
  } catch {
    return val
  }
}

interface MonitoringSourcesCardProps {
  trackedXAccounts: string[]
  setTrackedXAccounts: (v: string[]) => void
  watchedWebsites: string[]
  setWatchedWebsites: (v: string[]) => void
}

export function MonitoringSourcesCard({
  trackedXAccounts,
  setTrackedXAccounts,
  watchedWebsites,
  setWatchedWebsites,
}: MonitoringSourcesCardProps) {
  return (
    <GlassCard sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Monitoring Sources</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Track specific X accounts and websites — new posts are ingested as trend signals for this channel
      </Typography>
      <Stack spacing={2}>
        <ChipInput
          label="X / Twitter accounts"
          helperText="Enter a username (with or without @) — e.g. hubspot, garyvee"
          values={trackedXAccounts}
          onChange={setTrackedXAccounts}
          validate={validateXAccount}
          transform={transformXAccount}
          asyncValidate={async (handle) => {
            const result = await trendsApi.verifyXHandle(handle)
            return result.valid ? null : `@${handle} doesn't exist on X`
          }}
        />
        <ChipInput
          label="Websites to monitor"
          helperText="Enter a domain or URL — e.g. techcrunch.com or techcrunch.com/startups"
          values={watchedWebsites}
          onChange={setWatchedWebsites}
          validate={validateWebsite}
          transform={transformWebsite}
        />
      </Stack>
    </GlassCard>
  )
}
