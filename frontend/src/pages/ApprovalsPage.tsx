import { useState } from 'react'
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
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined'
import SendIcon from '@mui/icons-material/Send'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { approvalsApi } from '../api/approvals'
import { trendsApi } from '../api/trends'
import type { Approval, ApprovalStage } from '../api/approvals'

// ─── Time helper ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

function expiresInHours(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3600000
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<
  ApprovalStage,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  topic_selection: {
    label: 'Topic Selection',
    color: '#0EA5B7',
    bgColor: alpha('#22D3EE', 0.1),
    borderColor: alpha('#22D3EE', 0.28),
  },
  content_review: {
    label: 'Content Review',
    color: '#EA580C',
    bgColor: alpha('#F97316', 0.1),
    borderColor: alpha('#F97316', 0.28),
  },
  video_review: {
    label: 'Video Review',
    color: '#9333EA',
    bgColor: alpha('#A855F7', 0.1),
    borderColor: alpha('#A855F7', 0.28),
  },
}

// ─── Score colour helper ──────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8) return '#34D399'
  if (score >= 6) return '#22D3EE'
  if (score >= 4) return '#FBBF24'
  return '#F87171'
}

// ─── Stats chip ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number
  color?: string
}

function StatCard({ label, value, color = '#22D3EE' }: StatCardProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0.5,
        px: 2.5,
        py: 2,
        borderRadius: '10px',
        bgcolor: alpha(color, 0.06),
        border: `1px solid ${alpha(color, 0.18)}`,
        minWidth: 140,
        flex: 1,
      }}
    >
      <Typography
        sx={{
          fontSize: '28px',
          fontWeight: 800,
          color,
          lineHeight: 1.1,
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </Typography>
    </Box>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function ApprovalCardSkeleton() {
  return (
    <Box
      sx={{
        p: 2.5,
        height: 200,
        borderRadius: '8px',
        border: '1px solid #dddddd57',
        bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton variant="rounded" width={100} height={22} sx={{ borderRadius: '8px' }} />
        <Skeleton variant="rounded" width={60} height={20} sx={{ borderRadius: '8px' }} />
      </Stack>
      <Skeleton variant="text" width="85%" height={20} />
      <Skeleton variant="text" width="65%" height={20} />
      <Box sx={{ mt: 'auto' }}>
        <Skeleton variant="rounded" width="100%" height={36} sx={{ borderRadius: '8px' }} />
      </Box>
    </Box>
  )
}

// ─── Bundle preview dialog ────────────────────────────────────────────────────

interface BundlePreviewDialogProps {
  approval: Approval | null
  open: boolean
  onClose: () => void
}

function BundlePreviewDialog({ approval, open, onClose }: BundlePreviewDialogProps) {
  if (!approval || !approval.bundle) return null

  const bundle = approval.bundle
  const stageConf = STAGE_CONFIG[approval.stage]
  const stageIndex = { topic_selection: 1, content_review: 2, video_review: 3 }[approval.stage]
  // Cast to access optional fields that may be present on the full bundle payload
  const fullBundle = bundle as typeof bundle & {
    script?: string
    caption?: string
    hashtags?: string[]
    score_composite?: string | null
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={0.25}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#0F172A' }}>
            Bundle Preview
          </Typography>
          <Typography sx={{ fontSize: '12px', color: '#475569' }}>
            {approval.brand_name ? `${approval.brand_name} · ` : ''}Stage {stageIndex} of 3 —{' '}
            <Box component="span" sx={{ color: stageConf.color, fontWeight: 600 }}>
              {stageConf.label}
            </Box>
          </Typography>
        </Stack>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close bundle preview"
          sx={{
            color: '#475569',
            '&:hover': { bgcolor: alpha('#0F172A', 0.05) },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 1 }}>
        <Stack spacing={3}>
          {/* Hook */}
          <Box
            sx={{
              borderLeft: `3px solid #22D3EE`,
              pl: 2.5,
              py: 1,
              bgcolor: alpha('#22D3EE', 0.04),
              borderRadius: '0 10px 10px 0',
            }}
          >
            <Typography
              sx={{
                fontStyle: 'italic',
                fontSize: '1.125rem',
                lineHeight: 1.55,
                color: '#0F172A',
                fontWeight: 500,
              }}
            >
              {bundle.hook}
            </Typography>
          </Box>

          {/* Script */}
          {fullBundle.script && (
            <Box>
              <Typography
                sx={{
                  mb: 1,
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94A3B8',
                  fontWeight: 700,
                }}
              >
                Script
              </Typography>
              <Typography
                sx={{
                  color: '#0F172A',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.9375rem',
                }}
              >
                {fullBundle.script}
              </Typography>
            </Box>
          )}

          {/* Caption */}
          {fullBundle.caption && (
            <Box>
              <Typography
                sx={{
                  mb: 1,
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94A3B8',
                  fontWeight: 700,
                }}
              >
                Caption
              </Typography>
              <Typography sx={{ color: '#0F172A', lineHeight: 1.65, fontSize: '0.9375rem' }}>
                {fullBundle.caption.slice(0, 300)}
                {fullBundle.caption.length > 300 && '…'}
              </Typography>
            </Box>
          )}

          {/* Hashtags */}
          {fullBundle.hashtags && fullBundle.hashtags.length > 0 && (
            <Box>
              <Typography
                sx={{
                  mb: 1,
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94A3B8',
                  fontWeight: 700,
                }}
              >
                Hashtags
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '6px' }}>
                {fullBundle.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      bgcolor: alpha('#64748B', 0.08),
                      color: '#475569',
                      border: `1px solid ${alpha('#64748B', 0.18)}`,
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Video */}
          <Box>
            <Typography
              sx={{
                mb: 1,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#94A3B8',
                fontWeight: 700,
              }}
            >
              Video
            </Typography>
            {bundle.video_url ? (
              <Button
                component="a"
                href={bundle.video_url}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                startIcon={<PlayCircleOutlineIcon />}
                sx={{
                  borderColor: alpha('#22D3EE', 0.4),
                  color: '#0EA5B7',
                  fontWeight: 600,
                  '&:hover': {
                    borderColor: '#22D3EE',
                    bgcolor: alpha('#22D3EE', 0.06),
                  },
                }}
              >
                Watch Video
              </Button>
            ) : (
              <Typography sx={{ color: '#94A3B8', fontSize: '0.875rem', fontStyle: 'italic' }}>
                Video not yet generated
              </Typography>
            )}
          </Box>

          {/* Quality score */}
          {fullBundle.score_composite && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography
                sx={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94A3B8',
                  fontWeight: 700,
                }}
              >
                Quality Score
              </Typography>
              {(() => {
                const score = parseFloat(fullBundle.score_composite as string)
                const color = isNaN(score) ? '#94A3B8' : scoreColor(score)
                return (
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: alpha(color, 0.12),
                      border: `2px solid ${alpha(color, 0.4)}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography sx={{ fontSize: '13px', fontWeight: 800, color, lineHeight: 1 }}>
                      {isNaN(score) ? fullBundle.score_composite : score.toFixed(1)}
                    </Typography>
                  </Box>
                )
              })()}
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} variant="outlined" sx={{ minWidth: 100 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Approval card ────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approval: Approval
  onClick: () => void
  onResendSuccess: (msg: string) => void
  onResendError: (msg: string) => void
}

function ApprovalCard({ approval, onClick, onResendSuccess, onResendError }: ApprovalCardProps) {
  const stageConf = STAGE_CONFIG[approval.stage]
  const pending = !approval.action
  const expired = isExpired(approval.expires_at)
  const hoursLeft = expiresInHours(approval.expires_at)
  const nearExpiry = pending && !expired && hoursLeft < 6

  const metadata = approval.metadata as {
    channel_id?: string
    trends?: unknown[]
    [key: string]: unknown
  }
  const channelId = metadata?.channel_id as string | undefined
  const trendsCount = Array.isArray(metadata?.trends) ? metadata.trends.length : null

  const { mutate: resend, isPending: resending } = useMutation({
    mutationFn: () => approvalsApi.resend(approval.id),
    onSuccess: () => onResendSuccess('Approval email resent successfully.'),
    onError: (err: Error) => onResendError(`Failed to resend: ${err.message}`),
  })

  return (
    <GlassCard
      component="article"
      onClick={approval.bundle ? onClick : undefined}
      sx={{
        p: 2.5,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: approval.bundle ? 'pointer' : 'default',
        '&:hover': approval.bundle
          ? { transform: 'translateY(-2px)' }
          : { transform: 'none' },
      }}
    >
      {/* Row 1: stage chip + time */}
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}
      >
        <Chip
          label={stageConf.label}
          size="small"
          sx={{
            height: 22,
            fontSize: '10px',
            fontWeight: 700,
            borderRadius: '6px',
            bgcolor: stageConf.bgColor,
            color: stageConf.color,
            border: `1px solid ${stageConf.borderColor}`,
          }}
        />
        <Typography sx={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
          {timeAgo(approval.created_at)}
        </Typography>
      </Stack>

      {/* Channel */}
      {(approval.brand_name || approval.channel_name || channelId) && (
        <Typography
          sx={{
            fontSize: '11px',
            color: '#475569',
            fontWeight: 600,
            mb: 1,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {approval.brand_name ?? approval.channel_name ?? `${channelId?.slice(0, 8)}…`}
        </Typography>
      )}

      {/* Content: hook or trends count */}
      {approval.stage === 'topic_selection' ? (
        <Typography
          sx={{
            fontSize: '0.9375rem',
            color: '#0F172A',
            fontWeight: 600,
            lineHeight: 1.45,
            mb: 1,
          }}
        >
          {trendsCount !== null ? `${trendsCount} trend${trendsCount !== 1 ? 's' : ''} to review` : 'Topics pending review'}
        </Typography>
      ) : approval.bundle?.hook ? (
        <Typography
          sx={{
            fontSize: '0.875rem',
            color: '#0F172A',
            lineHeight: 1.5,
            mb: 1,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontStyle: 'italic',
          }}
        >
          "{approval.bundle.hook}"
        </Typography>
      ) : null}

      {/* Expiry warning */}
      {nearExpiry && (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: 'center', mb: 1.25 }}
        >
          <WarningAmberIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
          <Typography sx={{ fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>
            Expires in {Math.ceil(hoursLeft)}h
          </Typography>
        </Stack>
      )}

      {expired && pending && (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: 'center', mb: 1.25 }}
        >
          <WarningAmberIcon sx={{ fontSize: 14, color: '#F87171' }} />
          <Typography sx={{ fontSize: '11px', color: '#F87171', fontWeight: 600 }}>
            Expired
          </Typography>
        </Stack>
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Action status or resend button */}
      {approval.action ? (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 1.5 }}>
          {approval.action === 'approved' ? (
            <Chip
              icon={<CheckCircleOutlineIcon sx={{ fontSize: '14px !important' }} />}
              label="Approved"
              size="small"
              sx={{
                height: 24,
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '8px',
                bgcolor: alpha('#34D399', 0.1),
                color: '#059669',
                border: `1px solid ${alpha('#34D399', 0.3)}`,
                '& .MuiChip-icon': { color: '#059669' },
              }}
            />
          ) : (
            <Chip
              icon={<CancelOutlinedIcon sx={{ fontSize: '14px !important' }} />}
              label={approval.action.charAt(0).toUpperCase() + approval.action.slice(1)}
              size="small"
              sx={{
                height: 24,
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '8px',
                bgcolor: alpha('#F87171', 0.1),
                color: '#DC2626',
                border: `1px solid ${alpha('#F87171', 0.3)}`,
                '& .MuiChip-icon': { color: '#DC2626' },
              }}
            />
          )}
          {approval.rejection_reason && (
            <Typography
              sx={{
                fontSize: '11px',
                color: '#94A3B8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {approval.rejection_reason}
            </Typography>
          )}
        </Stack>
      ) : (
        <Button
          variant="outlined"
          size="small"
          fullWidth
          disabled={resending}
          onClick={(e) => {
            e.stopPropagation()
            resend()
          }}
          startIcon={
            resending ? (
              <CircularProgress size={12} sx={{ color: 'inherit' }} />
            ) : (
              <SendIcon sx={{ fontSize: '14px !important' }} />
            )
          }
          sx={{
            mt: 1.5,
            height: 36,
            fontSize: '12px',
            fontWeight: 600,
            borderColor: alpha('#22D3EE', 0.4),
            color: '#0EA5B7',
            '&:hover': {
              borderColor: '#22D3EE',
              bgcolor: alpha('#22D3EE', 0.06),
            },
          }}
        >
          {resending ? 'Sending…' : 'Resend'}
        </Button>
      )}
    </GlassCard>
  )
}

// ─── Send Topics dialog ───────────────────────────────────────────────────────

interface SendTopicsDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

function SendTopicsDialog({ open, onClose, onSuccess, onError }: SendTopicsDialogProps) {
  const [channelId, setChannelId] = useState('')

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: trendsApi.listChannels,
    enabled: open,
  })

  const { mutate: sendTopics, isPending } = useMutation({
    mutationFn: () => approvalsApi.sendTopics(channelId),
    onSuccess: (res) => {
      onSuccess(`Topics sent — ${res.trends_count} trend${res.trends_count !== 1 ? 's' : ''} included.`)
      onClose()
      setChannelId('')
    },
    onError: (err: Error) => {
      onError(`Failed to send topics: ${err.message}`)
    },
  })

  const handleClose = () => {
    if (!isPending) {
      onClose()
      setChannelId('')
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          fontWeight: 700,
          fontSize: '1rem',
          color: '#0F172A',
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        Send Topics for Approval
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#475569', mb: 2.5, lineHeight: 1.55 }}>
          Select a channel to send the current top trends for approval. The approver will receive an
          email to review the topic selection.
        </Typography>
        <FormControl fullWidth size="medium">
          <InputLabel id="send-topics-channel-label">Channel</InputLabel>
          <Select
            labelId="send-topics-channel-label"
            label="Channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            disabled={channelsLoading || isPending}
            sx={{ bgcolor: '#FFFFFF' }}
          >
            {channels.map((ch) => (
              <MenuItem key={ch.id} value={ch.id}>
                {ch.brand_name} — {ch.name}
              </MenuItem>
            ))}
            {!channelsLoading && channels.length === 0 && (
              <MenuItem disabled value="">
                No channels found
              </MenuItem>
            )}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
        <Button onClick={handleClose} variant="outlined" disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          disabled={!channelId || isPending}
          onClick={() => sendTopics()}
          startIcon={
            isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <SendIcon />
          }
          sx={{ minWidth: 120 }}
        >
          {isPending ? 'Sending…' : 'Send Topics'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = 'all' | ApprovalStage | 'completed'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'topic_selection', label: 'Topic Selection' },
  { value: 'content_review', label: 'Content Review' },
  { value: 'video_review', label: 'Video Review' },
  { value: 'completed', label: 'Completed' },
]

function filterApprovals(approvals: Approval[], tab: FilterTab): Approval[] {
  if (tab === 'all') return approvals
  if (tab === 'completed') return approvals.filter((a) => a.action !== null)
  return approvals.filter((a) => a.stage === tab)
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const queryClientInstance = useQueryClient()

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [sendTopicsOpen, setSendTopicsOpen] = useState(false)
  const [previewApproval, setPreviewApproval] = useState<Approval | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Toast state
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackSeverity, setSnackSeverity] = useState<'success' | 'error'>('success')

  const showToast = (msg: string, severity: 'success' | 'error' = 'success') => {
    setSnackMsg(msg)
    setSnackSeverity(severity)
    setSnackOpen(true)
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: approvalsApi.list,
  })

  // ── Trigger pipeline mutation ──────────────────────────────────────────────

  const { mutate: triggerPipeline, isPending: pipelinePending } = useMutation({
    mutationFn: approvalsApi.triggerPipeline,
    onSuccess: (res) => {
      queryClientInstance.invalidateQueries({ queryKey: ['approvals'] })
      showToast(res.message || 'Pipeline triggered successfully.', 'success')
    },
    onError: (err: Error) => {
      showToast(`Pipeline failed: ${err.message}`, 'error')
    },
  })

  // ── Stats ──────────────────────────────────────────────────────────────────

  const pending = approvals.filter(
    (a) => a.action === null && !isExpired(a.expires_at),
  )
  const topicSelectionCount = pending.filter((a) => a.stage === 'topic_selection').length
  const contentReviewCount = pending.filter((a) => a.stage === 'content_review').length
  const videoReviewCount = pending.filter((a) => a.stage === 'video_review').length

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = filterApprovals(approvals, activeTab)

  // ── Card handlers ──────────────────────────────────────────────────────────

  const handleCardClick = (approval: Approval) => {
    if (approval.bundle) {
      setPreviewApproval(approval)
      setPreviewOpen(true)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      {/* Header */}
      <PageHeader
        title="Approvals"
        subtitle="Review and manage your content pipeline"
        action={
          <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
            <Button
              variant="outlined"
              onClick={() => setSendTopicsOpen(true)}
              startIcon={<SendIcon />}
              sx={{
                fontWeight: 600,
                borderColor: alpha('#22D3EE', 0.4),
                color: '#0EA5B7',
                '&:hover': {
                  borderColor: '#22D3EE',
                  bgcolor: alpha('#22D3EE', 0.06),
                },
              }}
            >
              Send Topics
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={pipelinePending}
              onClick={() => triggerPipeline()}
              startIcon={
                pipelinePending ? (
                  <CircularProgress size={16} sx={{ color: 'inherit' }} />
                ) : (
                  <AutorenewIcon
                    sx={{
                      animation: pipelinePending ? 'spin 1s linear infinite' : 'none',
                      '@keyframes spin': {
                        from: { transform: 'rotate(0deg)' },
                        to: { transform: 'rotate(360deg)' },
                      },
                    }}
                  />
                )
              }
              sx={{ fontWeight: 600 }}
            >
              {pipelinePending ? 'Triggering…' : 'Trigger Pipeline'}
            </Button>
          </Stack>
        }
      />

      {/* Stats row */}
      <Stack
        direction="row"
        sx={{
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <StatCard label="Total Pending" value={pending.length} color="#22D3EE" />
        <StatCard label="Topic Selection" value={topicSelectionCount} color="#0EA5B7" />
        <StatCard label="Content Review" value={contentReviewCount} color="#F97316" />
        <StatCard label="Video Review" value={videoReviewCount} color="#A855F7" />
      </Stack>

      {/* Filter tabs */}
      <Box
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v: FilterTab) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              fontSize: '13px',
              fontWeight: 600,
              textTransform: 'none',
              color: '#475569',
              px: 2,
            },
            '& .Mui-selected': {
              color: '#0EA5B7 !important',
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#22D3EE',
              height: 2,
            },
          }}
        >
          {FILTER_TABS.map((t) => (
            <Tab key={t.value} value={t.value} label={t.value === 'all' ? `All (${approvals.length})` : t.label} />
          ))}
        </Tabs>
      </Box>

      {/* Content */}
      {isLoading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <ApprovalCardSkeleton />
            </Grid>
          ))}
        </Grid>
      ) : filtered.length === 0 ? (
        <GlassCard sx={{ p: 6 }}>
          <Stack sx={{ alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: alpha('#22D3EE', 0.08),
                border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 32, color: alpha('#22D3EE', 0.5) }} />
            </Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}>
              {activeTab === 'all'
                ? 'No approvals yet'
                : `No ${FILTER_TABS.find((t) => t.value === activeTab)?.label.toLowerCase()} approvals`}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#475569', maxWidth: 360 }}>
              {activeTab === 'all'
                ? 'No approvals yet — trigger the pipeline to get started.'
                : 'Try a different filter or trigger the pipeline to generate new approvals.'}
            </Typography>
          </Stack>
        </GlassCard>
      ) : (
        <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
          {filtered.map((approval) => (
            <Grid key={approval.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <ApprovalCard
                approval={approval}
                onClick={() => handleCardClick(approval)}
                onResendSuccess={(msg) => showToast(msg, 'success')}
                onResendError={(msg) => showToast(msg, 'error')}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Bundle preview dialog */}
      <BundlePreviewDialog
        approval={previewApproval}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* Send Topics dialog */}
      <SendTopicsDialog
        open={sendTopicsOpen}
        onClose={() => setSendTopicsOpen(false)}
        onSuccess={(msg) => showToast(msg, 'success')}
        onError={(msg) => showToast(msg, 'error')}
      />

      {/* Toast */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={5000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackSeverity}
          onClose={() => setSnackOpen(false)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
