import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adsApi, ApiError, qk } from '../api'
import type { CampaignSummary } from '../api/types'
import { paths } from '../auth/constants'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ads/StatusBadge'
import { GlassCard } from '../components/ui/GlassCard'

function formatMoney(amount?: number | string | null, currency?: string | null) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = typeof amount === 'number' ? amount : parseFloat(amount)
  if (Number.isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency || ''}`.trim()
  }
}

function objectiveLabel(o?: string | null) {
  if (!o) return '—'
  switch (o) {
    case 'OUTCOME_TRAFFIC':
    case 'OUTCOME_TRAFFIC_WEBSITE':
      return 'Website Traffic'
    case 'OUTCOME_TRAFFIC_CTWA':
    case 'OUTCOME_ENGAGEMENT_CTWA':
    case 'OUTCOME_ENGAGEMENT':
      return 'Click to WhatsApp'
    case 'OUTCOME_LEADS':
    case 'OUTCOME_LEADS_ON_AD':
      return 'Lead Gen'
    case 'OUTCOME_SALES':
    case 'OUTCOME_SALES_CATALOG':
      return 'Catalog Sales'
    default:
      return o.replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

export function AdsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const setupQuery = useQuery({
    queryKey: qk.setupStatus,
    queryFn: () => adsApi.getSetupStatus(),
    staleTime: 60_000,
  })

  const balanceQuery = useQuery({
    queryKey: qk.balance,
    queryFn: () => adsApi.getBalance(),
    enabled: setupQuery.data?.connected === true,
    staleTime: 60_000,
  })

  const campaignsQuery = useQuery({
    queryKey: qk.campaigns(),
    queryFn: () => adsApi.getCampaigns({ limit: 50 }),
    enabled: setupQuery.data?.connected === true,
    staleTime: 30_000,
  })

  if (setupQuery.isLoading) {
    return (
      <Stack sx={{ alignItems: 'center', mt: 8 }}>
        <CircularProgress />
      </Stack>
    )
  }

  // Setup query failed (network, server error). 401s are caught upstream
  // by the AppShell auth guard — anything that lands here is non-auth.
  if (setupQuery.error) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', width: '100%' }}>
        <PageHeader title="Ads" subtitle="Couldn't load your Meta connection status." />
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={() => setupQuery.refetch()}>Retry</Button>}
        >
          {(setupQuery.error as ApiError).message || 'Failed to load setup status.'}
        </Alert>
      </Stack>
    )
  }

  // No data at all (rare — usually means disabled feature flag)
  if (!setupQuery.data) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', width: '100%' }}>
        <PageHeader title="Ads" subtitle="Ads module is unavailable." />
        <Alert severity="warning">The ads feature is not enabled on the server.</Alert>
      </Stack>
    )
  }

  if (!setupQuery.data.connected) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', width: '100%' }}>
        <PageHeader title="Ads" subtitle="Connect Meta to start launching campaigns from GrowthOS." />
        <GlassCard sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No Meta account connected</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in with Facebook to choose an ad account and Page.
          </Typography>
          <Button variant="contained" onClick={() => navigate(paths.adsSetup)}>
            Connect Meta
          </Button>
        </GlassCard>
      </Stack>
    )
  }

  const status = setupQuery.data
  const balance = balanceQuery.data
  // Backend returns `{items, totalCount, page, limit}` — see CampaignList type.
  const campaigns = campaignsQuery.data?.items || []

  return (
    // <Stack spacing={3}>
    <Stack spacing={3}>
      <PageHeader
        title="Ads"
        subtitle="Create, validate, and publish Meta campaigns end-to-end."
        action={
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" color="inherit" onClick={() => navigate(paths.adsSetup)}>
              Manage account
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(paths.adsCreate)}>
              Create campaign
            </Button>
          </Stack>
        }
      />

      {/* Account header */}
      <GlassCard sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">Connected to</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {status?.ad_account_name || `act_${status?.ad_account_id}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {status?.page_name ? `Page: ${status.page_name}` : ''}
              {status?.waba_id ? ' · WhatsApp linked' : ''}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 180, textAlign: { sm: 'right' } }}>
            <Typography variant="overline" color="text.secondary">Balance</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: { sm: 'flex-end' } }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {balanceQuery.isLoading ? '…' : formatMoney(balance?.balance, balance?.currency || status?.currency)}
              </Typography>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={() => balanceQuery.refetch()}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
      </GlassCard>

      {campaignsQuery.isLoading && (
        <Stack sx={{ alignItems: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {campaignsQuery.error && (
        <Alert severity="error">{(campaignsQuery.error as ApiError).message || 'Failed to load campaigns'}</Alert>
      )}

      {!campaignsQuery.isLoading && campaigns.length === 0 && (
        <GlassCard sx={{ padding:"30px 15px" ,textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No campaigns yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Build and publish your first ad to Meta in a few minutes.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(paths.adsCreate)}>
            Create your first campaign
          </Button>
        </GlassCard>
      )}

      {campaigns.length > 0 && (
        <Stack spacing={1.5}>
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              currency={status?.currency || balance?.currency}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: qk.campaigns() })
              }}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function CampaignRow({
  campaign,
  currency,
  onChanged,
}: {
  campaign: CampaignSummary
  currency?: string | null
  onChanged: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isActive = campaign.status === 'active'
  const targetStatus = isActive ? 'PAUSED' : 'ACTIVE'

  const toggleMutation = useMutation({
    mutationFn: () => {
      if (!campaign.meta_campaign_id) {
        return Promise.reject(new Error('Campaign has no Meta ID — sync first.'))
      }
      return adsApi.updateMetaCampaignStatus(campaign.meta_campaign_id, targetStatus as 'ACTIVE' | 'PAUSED')
    },
    onSuccess: () => {
      setAnchorEl(null)
      onChanged()
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => adsApi.deleteCampaign(campaign.id),
    onSuccess: () => {
      setConfirmDelete(false)
      setAnchorEl(null)
      onChanged()
    },
    onError: (err: ApiError) => setActionError(err.message),
  })

  const summaryLine = useMemo(() => {
    const parts: string[] = []
    parts.push(objectiveLabel(campaign.objective))
    if (campaign.daily_budget) parts.push(`${formatMoney(campaign.daily_budget, currency)}/day`)
    else if (campaign.lifetime_budget) parts.push(`${formatMoney(campaign.lifetime_budget, currency)} lifetime`)
    return parts.join(' · ')
  }, [campaign.objective, campaign.daily_budget, campaign.lifetime_budget, currency])

  return (
    <>
      <GlassCard sx={{ borderRadius: 3, bgcolor: (t) => alpha(t.palette.background.paper, 0.94) }}>
        <Box sx={{ py: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                  {campaign.name}
                </Typography>
                <StatusBadge status={campaign.status} effectiveStatus={campaign.effective_status} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {summaryLine}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1}>
              {campaign.meta_campaign_id && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Meta ID ${campaign.meta_campaign_id.slice(-8)}`}
                />
              )}
              <Tooltip title={isActive ? 'Pause' : 'Resume'}>
                <span>
                  <IconButton
                    size="small"
                    color={isActive ? 'warning' : 'success'}
                    onClick={() => toggleMutation.mutate()}
                    disabled={toggleMutation.isPending || !campaign.meta_campaign_id}
                  >
                    {isActive ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
              <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>

          {actionError && (
            <Alert
              severity="error"
              onClose={() => setActionError(null)}
              sx={{ mt: 1.5 }}
            >
              {actionError}
            </Alert>
          )}
        </Box>
      </GlassCard>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem
          onClick={() => {
            if (campaign.meta_campaign_id) {
              window.open(
                `https://business.facebook.com/adsmanager/manage/campaigns?act=${campaign.ad_account_id}&selected_campaign_ids=${campaign.meta_campaign_id}`,
                '_blank',
              )
            }
            setAnchorEl(null)
          }}
          disabled={!campaign.meta_campaign_id}
        >
          <OpenInNewIcon fontSize="small" sx={{ mr: 1 }} /> Open in Ads Manager
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            setConfirmDelete(true)
          }}
        >
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete campaign?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will remove <strong>{campaign.name}</strong> from GrowthOS. The campaign on Meta is not deleted automatically — pause it there if needed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default AdsPage
