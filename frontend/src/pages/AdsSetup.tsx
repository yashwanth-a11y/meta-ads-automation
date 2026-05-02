import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import FacebookIcon from '@mui/icons-material/Facebook'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adsApi, ApiError, qk } from '../api'
import type {
  AvailableAdAccount,
  AvailablePage,
  ConnectAdAccountInput,
  OAuthCallbackResult,
} from '../api/types'
import { paths } from '../auth/constants'
import { useMetaOAuth } from '../hooks/useFacebookSdk'
import { PageHeader } from '../components/ui/PageHeader'

type SetupStep = 'idle' | 'connecting' | 'choosing' | 'saving' | 'connected' | 'error'

export function AdsSetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const setupStatusQuery = useQuery({
    queryKey: qk.setupStatus,
    queryFn: () => adsApi.getSetupStatus(),
    staleTime: 60_000,
  })

  const [step, setStep] = useState<SetupStep>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [oauthData, setOauthData] = useState<OAuthCallbackResult | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [selectedPageId, setSelectedPageId] = useState<string>('')

  const { startOAuth } = useMetaOAuth()

  const connectMutation = useMutation({
    mutationFn: (input: ConnectAdAccountInput) => adsApi.connectAdAccount(input),
    onSuccess: () => {
      setStep('connected')
      queryClient.invalidateQueries({ queryKey: qk.setupStatus })
      queryClient.invalidateQueries({ queryKey: qk.balance })
      window.setTimeout(() => navigate(paths.ads), 800)
    },
    onError: (err: ApiError) => {
      setErrorMsg(err.message)
      setStep('error')
    },
  })

  const startConnect = async () => {
    setErrorMsg(null)
    setStep('connecting')
    try {
      const { url } = await adsApi.getOAuthUrl()
      const { code, state } = await startOAuth(url)
      const result = await adsApi.handleOAuthCallback(code, state)
      setOauthData(result)
      // Auto-select first usable account/page
      const firstUsable = (result.ad_accounts || []).find((a) => a.account_status === 1)
      const firstPage = (result.pages || [])[0]
      if (firstUsable) setSelectedAccountId(firstUsable.id || firstUsable.account_id)
      if (firstPage) setSelectedPageId(firstPage.id)
      setStep('choosing')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setErrorMsg(msg)
      setStep('error')
    }
  }

  const onSaveSelection = () => {
    if (!oauthData) return
    const account = (oauthData.ad_accounts || []).find(
      (a) => (a.id || a.account_id) === selectedAccountId,
    )
    const page = (oauthData.pages || []).find((p) => p.id === selectedPageId)
    if (!account) {
      setErrorMsg('Please pick an ad account.')
      return
    }
    if (!page) {
      setErrorMsg('Please pick a Facebook Page.')
      return
    }
    setStep('saving')
    connectMutation.mutate({
      ad_account_id: account.account_id || account.id.replace(/^act_/, ''),
      ad_account_name: account.name,
      page_id: page.id,
      page_name: page.name,
      waba_id: page.whatsapp_business_account?.id || null,
      fb_user_id: oauthData.fb_user_id || null,
      // Backend OAuth callback returns this as `access_token`, not `user_access_token`.
      access_token: oauthData.access_token,
      page_access_token: page.access_token || null,
      expires_in: oauthData.expires_in,
      currency: account.currency,
      oauth_app_id: oauthData.oauth_app_id,
    })
  }

  const disconnectMutation = useMutation({
    mutationFn: () => adsApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.setupStatus })
      setStep('idle')
      setOauthData(null)
    },
    onError: (err: ApiError) => setErrorMsg(err.message),
  })

  const status = setupStatusQuery.data
  const isConnected = status?.connected === true

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', width: '100%' }}>
      <PageHeader
        title="Meta Ads — Setup"
        subtitle="Connect a Meta Business ad account and Facebook Page so you can launch ads from GrowthOS."
      />

      {setupStatusQuery.isLoading && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Checking connection…</Typography>
        </Stack>
      )}

      {isConnected && step !== 'choosing' && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
            <Avatar sx={{ bgcolor: 'success.main' }}>
              <CheckCircleIcon />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Connected to {status.ad_account_name || `Ad account ${status.ad_account_id}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Page: {status.page_name || status.page_id || '—'}
                {status.waba_id ? ' · WhatsApp linked' : ''}
                {status.currency ? ` · ${status.currency}` : ''}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <Button variant="contained" onClick={() => navigate(paths.ads)}>
              Open Ads
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => { setOauthData(null); setStep('idle'); startConnect() }}
            >
              Reconnect / switch account
            </Button>
            <Button
              variant="text"
              color="error"
              startIcon={<LinkOffIcon />}
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </Stack>
        </Paper>
      )}

      {!isConnected && step === 'idle' && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Sign in with Facebook to give GrowthOS permission to manage your ads.
            We will request <code>ads_management</code>, <code>pages_manage_ads</code>,
            <code> leads_retrieval</code>, and related scopes.
          </Typography>
          <Button
            variant="contained"
            startIcon={<FacebookIcon />}
            onClick={startConnect}
            sx={{ bgcolor: '#1877F2', '&:hover': { bgcolor: '#166FE5' } }}
          >
            Connect with Facebook
          </Button>
        </Paper>
      )}

      {step === 'connecting' && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CircularProgress size={24} />
            <Typography>Waiting for Meta sign-in window…</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            If a popup didn't open, check your browser's popup blocker.
          </Typography>
        </Paper>
      )}

      {step === 'choosing' && oauthData && (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Pick an ad account and Facebook Page
          </Typography>

          <Stack spacing={2.5}>
            <FormControl fullWidth>
              <InputLabel>Ad account</InputLabel>
              <Select
                label="Ad account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value as string)}
              >
                {(oauthData.ad_accounts || []).map((acc: AvailableAdAccount) => {
                  const value = acc.id || acc.account_id
                  const isUsable = acc.account_status === 1
                  return (
                    <MenuItem key={value} value={value} disabled={!isUsable}>
                      <ListItemText
                        primary={`${acc.name} (${acc.currency})`}
                        secondary={
                          isUsable ? `act_${acc.account_id || value}` : 'Not usable — disabled or unsettled'
                        }
                      />
                    </MenuItem>
                  )
                })}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Facebook Page</InputLabel>
              <Select
                label="Facebook Page"
                value={selectedPageId}
                onChange={(e) => setSelectedPageId(e.target.value as string)}
              >
                {(oauthData.pages || []).map((p: AvailablePage) => (
                  <MenuItem key={p.id} value={p.id}>
                    <ListItemAvatar sx={{ minWidth: 36 }}>
                      <Avatar src={p.picture?.data?.url} sx={{ width: 28, height: 28 }} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <span>{p.name}</span>
                          {p.whatsapp_business_account?.id ? (
                            <Chip
                              size="small"
                              icon={<WhatsAppIcon sx={{ fontSize: 14 }} />}
                              label="WABA linked"
                              color="success"
                              variant="outlined"
                            />
                          ) : null}
                        </Stack>
                      }
                      secondary={p.id}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider />

            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

            <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
              <Button onClick={() => { setStep('idle'); setOauthData(null) }}>Cancel</Button>
              <Button
                variant="contained"
                onClick={onSaveSelection}
                disabled={!selectedAccountId || !selectedPageId || connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Saving…' : 'Connect this account'}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {step === 'connected' && (
        <Alert severity="success">
          Connected. Redirecting to Ads…
        </Alert>
      )}

      {step === 'error' && errorMsg && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => { setStep('idle'); setErrorMsg(null) }}>
              Try again
            </Button>
          }
        >
          {errorMsg}
        </Alert>
      )}
    </Stack>
  )
}

export default AdsSetupPage
