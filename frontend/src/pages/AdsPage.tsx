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
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adsApi, ApiError, qk } from '../api'
import type { CampaignSummary } from '../api/types'
import { paths } from '../auth/constants'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ads/StatusBadge'
import { GlassCard } from '../components/ui/GlassCard'
import { AdInsightsDrawer } from '../components/ads/AdInsightsDrawer'

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
  // Drawer state — opens when a campaign card is clicked. Pulled to the page
  // level (not inside CampaignRow) so it sits over the whole layout and uses a
  // single instance regardless of how many cards are rendered.
  const [insightsCampaign, setInsightsCampaign] = useState<CampaignSummary | null>(null)

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
      <Stack spacing={3} sx={{ mx: 'auto', width: '100%' }}>
        <PageHeader title="Ads" subtitle="Ads module is unavailable." />
        <Alert severity="warning">The ads feature is not enabled on the server.</Alert>
      </Stack>
    )
  }

  if (!setupQuery.data.connected) {
    return (
      <Stack spacing={3} sx={{ mx: 'auto', width: '100%' }}>
        <PageHeader title="Ads" subtitle="Connect Meta to start launching campaigns from GrowthOS." />
        <GlassCard sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No Meta account connected</Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
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
        <GlassCard sx={{ padding: "30px 15px", textAlign: 'center' }}>
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
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              currency={status?.currency || balance?.currency}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: qk.campaigns() })
              }}
              onOpenInsights={() => setInsightsCampaign(c)}
            />
          ))}
        </Box>
      )}

      <AdInsightsDrawer
        open={!!insightsCampaign}
        onClose={() => setInsightsCampaign(null)}
        campaign={insightsCampaign}
        fallbackCurrency={status?.currency || balance?.currency}
      />
    </Stack>
  )
}

function CampaignRow({
  campaign,
  currency,
  onChanged,
  onOpenInsights,
}: {
  campaign: CampaignSummary
  currency?: string | null
  onChanged: () => void
  onOpenInsights: () => void
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

  // Click on the card body opens the ad insights drawer; nested
  // controls (kebab, pause/resume, "View ads") stop propagation so they keep
  // their own behavior. Disabled when there's no Meta ID — the drawer would
  // just show a "not synced" hint anyway, but keeping it click-blocked makes
  // the affordance match reality.
  const canOpenInsights = !!campaign.meta_campaign_id

  return (
    <>
      {(() => {
        // Status-derived accent: green = active, amber = paused, red = errored,
        // slate = anything else. Drives the left stripe + the small dot inline
        // with the title so each card's state is readable at a glance.
        const eff = (campaign.effective_status || campaign.status || '').toUpperCase()
        const accentColor =
          eff === 'ACTIVE' || eff === 'PREAPPROVED'
            ? '#10B981'
            : eff === 'PAUSED' || eff === 'CAMPAIGN_PAUSED' || eff === 'ADSET_PAUSED' || eff === 'ARCHIVED'
              ? '#F59E0B'
              : eff === 'DISAPPROVED' || eff === 'PENDING_BILLING_INFO' || eff === 'WITH_ISSUES' || eff === 'DELETED'
                ? '#EF4444'
                : eff === 'PENDING_REVIEW' || eff === 'IN_PROCESS'
                  ? '#22D3EE'
                  : '#64748B'

        // Split the summary so the budget can render as a prominent tile
        // separately from the objective text.
        const budgetLabel = campaign.daily_budget
          ? `${formatMoney(campaign.daily_budget, currency)}/day`
          : campaign.lifetime_budget
            ? `${formatMoney(campaign.lifetime_budget, currency)} lifetime`
            : null
        const budgetSubtitle = campaign.daily_budget
          ? 'Daily budget'
          : campaign.lifetime_budget
            ? 'Lifetime budget'
            : 'No budget set'

        return (
          <GlassCard
            sx={{
              position: 'relative',
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              cursor: canOpenInsights ? 'pointer' : 'default',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: alpha('#0F172A', 0.08),
              overflow: 'hidden',
              transition:
                'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
              boxShadow: `0 1px 2px ${alpha('#0F172A', 0.04)}`,
              '&:hover': canOpenInsights
                ? {
                  transform: 'translateY(-2px)',
                  borderColor: alpha(accentColor, 0.4),
                  boxShadow: `0 12px 28px ${alpha('#0F172A', 0.10)}, 0 0 0 1px ${alpha(accentColor, 0.15)}`,
                }
                : {},
              // Left status stripe — anchors the card to its current state.
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                bgcolor: accentColor,
                opacity: 0.85,
              },
            }}
            onClick={canOpenInsights ? onOpenInsights : undefined}
            role={canOpenInsights ? 'button' : undefined}
            tabIndex={canOpenInsights ? 0 : -1}
            onKeyDown={(e) => {
              if (canOpenInsights && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onOpenInsights()
              }
            }}
          >
            <Stack spacing={1.5} sx={{ p: 2.25, pl: 2.5, flex: 1, minWidth: 0 }}>
              {/* Header — name + kebab; status badge sits below to keep the
                  title clean even when the badge label is long. */}
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: accentColor,
                      flexShrink: 0,
                      boxShadow: `0 0 0 3px ${alpha(accentColor, 0.18)}`,
                    }}
                  />
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, fontSize: 14.5, letterSpacing: -0.1 }}
                    noWrap
                    title={campaign.name}
                  >
                    {campaign.name}
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAnchorEl(e.currentTarget)
                  }}
                  sx={{
                    mt: -0.5,
                    mr: -0.5,
                    color: 'text.secondary',
                    '&:hover': { bgcolor: alpha('#0F172A', 0.04) },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Stack>

              {/* Status + objective on one line — compact metadata strip */}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge
                  status={campaign.status}
                  effectiveStatus={campaign.effective_status}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: 11.5, fontWeight: 500 }}
                >
                  {objectiveLabel(campaign.objective)}
                </Typography>
              </Stack>

              {/* Budget tile — the most-scanned metric on each card */}
              <Box
                sx={{
                  px: 1.5,
                  py: 1.25,
                  borderRadius: '10px',
                  bgcolor: alpha(accentColor, 0.06),
                  border: `1px solid ${alpha(accentColor, 0.15)}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  {budgetSubtitle}
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontSize: 18,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    color: budgetLabel ? accentColor : 'text.disabled',
                    mt: 0.25,
                  }}
                >
                  {budgetLabel ?? '—'}
                </Typography>
              </Box>

              <Box sx={{ flex: 1 }} />

              {/* Footer — Meta ID chip on left, action icons on right */}
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  pt: 0.5,
                }}
              >
                {campaign.meta_campaign_id ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Meta · ${campaign.meta_campaign_id.slice(-8)}`}
                    sx={{
                      maxWidth: '60%',
                      height: 22,
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: '6px',
                      borderColor: alpha('#0F172A', 0.12),
                      color: 'text.secondary',
                      bgcolor: alpha('#0F172A', 0.025),
                    }}
                  />
                ) : (
                  <Chip
                    size="small"
                    label="Not synced"
                    sx={{
                      height: 22,
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: '6px',
                      bgcolor: alpha('#F59E0B', 0.1),
                      color: '#B45309',
                    }}
                  />
                )}
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
                  <Tooltip title={canOpenInsights ? 'View ad insights' : 'Sync campaign first to see ads'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenInsights()
                        }}
                        disabled={!canOpenInsights}
                        sx={{
                          color: 'text.secondary',
                          '&:hover': {
                            color: '#22D3EE',
                            bgcolor: alpha('#22D3EE', 0.08),
                          },
                          '&.Mui-disabled': { color: 'text.disabled' },
                        }}
                      >
                        <InsightsOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={isActive ? 'Pause campaign' : 'Resume campaign'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMutation.mutate()
                        }}
                        disabled={toggleMutation.isPending || !campaign.meta_campaign_id}
                        sx={{
                          color: isActive ? '#F59E0B' : '#10B981',
                          bgcolor: isActive
                            ? alpha('#F59E0B', 0.08)
                            : alpha('#10B981', 0.08),
                          '&:hover': {
                            bgcolor: isActive
                              ? alpha('#F59E0B', 0.16)
                              : alpha('#10B981', 0.16),
                          },
                          '&.Mui-disabled': {
                            color: 'text.disabled',
                            bgcolor: alpha('#0F172A', 0.04),
                          },
                        }}
                      >
                        {isActive ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>

              {actionError && (
                <Alert
                  severity="error"
                  onClose={() => setActionError(null)}
                  sx={{ borderRadius: '8px', fontSize: 12 }}
                >
                  {actionError}
                </Alert>
              )}
            </Stack>
          </GlassCard>
        )
      })()}

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} sx={{

      }}>
        <MenuItem
          sx={{
            color: '#0F172A',
          }}
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
          Open in Ads Manager
        </MenuItem>
        <MenuItem sx={{
          color: '#0F172A',
        }}
          onClick={() => {
            setAnchorEl(null)
            setConfirmDelete(true)
          }}
        >
          Delete
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
