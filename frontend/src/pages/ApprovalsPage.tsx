import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { approvalsApi } from '../api/approvals'
import type { Approval, ApprovalStage } from '../api/approvals'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isExpired(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

function expiresInHours(iso: string) {
  return (new Date(iso).getTime() - Date.now()) / 3600000
}

function scoreColor(score: number) {
  if (score >= 8) return '#34D399'
  if (score >= 6) return '#22D3EE'
  if (score >= 4) return '#FBBF24'
  return '#F87171'
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE: Record<ApprovalStage, { label: string; color: string; bg: string; border: string }> = {
  topic_selection: { label: 'Topic Selection', color: '#0EA5B7', bg: alpha('#22D3EE', 0.1), border: alpha('#22D3EE', 0.28) },
  content_review:  { label: 'Content Review',  color: '#EA580C', bg: alpha('#F97316', 0.1), border: alpha('#F97316', 0.28) },
  video_review:    { label: 'Video Review',     color: '#9333EA', bg: alpha('#A855F7', 0.1), border: alpha('#A855F7', 0.28) },
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = '#22D3EE' }: { label: string; value: number; color?: string }) {
  return (
    <Box sx={{ px: 2.5, py: 2, borderRadius: '10px', bgcolor: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.18)}`, minWidth: 140, flex: 1 }}>
      <Typography sx={{ fontSize: '28px', fontWeight: 800, color, lineHeight: 1.1, fontFamily: 'Raleway, sans-serif' }}>{value}</Typography>
      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', mt: 0.5 }}>{label}</Typography>
    </Box>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography sx={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 700, mb: 0.75 }}>
      {children}
    </Typography>
  )
}

// ─── Inline action buttons ────────────────────────────────────────────────────

interface ActionButtonsProps {
  approvalId: string
  stage: ApprovalStage
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  onOpenDetail: () => void
}

function ActionButtons({ approvalId, stage, onSuccess, onError, onOpenDetail }: ActionButtonsProps) {
  const client = useQueryClient()
  const [showFeedback, setShowFeedback] = useState<'reject' | 'regenerate' | null>(null)
  const [feedback, setFeedback] = useState('')

  const { mutate: act, isPending } = useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject' | 'regenerate'; feedback?: string }) =>
      approvalsApi.takeAction(approvalId, payload.action, payload.feedback),
    onSuccess: (_, vars) => {
      client.invalidateQueries({ queryKey: ['approvals'] })
      const label = vars.action === 'approve' ? 'Approved' : vars.action === 'reject' ? 'Rejected' : 'Regenerating…'
      onSuccess(label + ' successfully.')
      setShowFeedback(null)
      setFeedback('')
    },
    onError: (err: Error) => onError(err.message),
  })

  if (showFeedback) {
    return (
      <Stack spacing={1} onClick={(e) => e.stopPropagation()}>
        <TextField
          size="small"
          multiline
          minRows={2}
          placeholder={showFeedback === 'reject' ? 'Optional: reason for rejection…' : 'What should be improved?'}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          autoFocus
        />
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            color={showFeedback === 'reject' ? 'error' : 'primary'}
            disabled={isPending}
            onClick={() => act({ action: showFeedback, feedback: feedback || undefined })}
            startIcon={isPending ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : undefined}
            sx={{ height: 32, fontSize: '12px', flex: 1 }}
          >
            {isPending ? 'Processing…' : showFeedback === 'reject' ? 'Confirm reject' : 'Regenerate'}
          </Button>
          <Button size="small" variant="outlined" onClick={() => { setShowFeedback(null); setFeedback('') }} sx={{ height: 32, fontSize: '12px' }}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    )
  }

  return (
    <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
      <Button
        size="small"
        variant="contained"
        disabled={isPending}
        onClick={() => act({ action: 'approve' })}
        startIcon={isPending ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <CheckCircleOutlinedIcon sx={{ fontSize: 15 }} />}
        sx={{
          height: 32, fontSize: '12px', fontWeight: 700, flex: 1,
          bgcolor: '#059669', '&:hover': { bgcolor: '#047857' },
        }}
      >
        Approve
      </Button>
      {stage !== 'topic_selection' && (
        <Tooltip title="Regenerate with feedback">
          <IconButton
            size="small"
            disabled={isPending}
            onClick={() => setShowFeedback('regenerate')}
            sx={{ border: `1px solid ${alpha('#22D3EE', 0.35)}`, color: '#0EA5B7', borderRadius: '8px', '&:hover': { bgcolor: alpha('#22D3EE', 0.08) } }}
          >
            <AutorenewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
      <Button
        size="small"
        variant="outlined"
        disabled={isPending}
        onClick={() => setShowFeedback('reject')}
        startIcon={<CancelOutlinedIcon sx={{ fontSize: 15 }} />}
        sx={{
          height: 32, fontSize: '12px', fontWeight: 700,
          borderColor: alpha('#F87171', 0.4), color: '#DC2626',
          '&:hover': { borderColor: '#F87171', bgcolor: alpha('#F87171', 0.06) },
        }}
      >
        Reject
      </Button>
      <Tooltip title="View full content">
        <Button
          size="small"
          variant="outlined"
          onClick={() => { onOpenDetail() }}
          sx={{ height: 32, fontSize: '12px', px: 1.5, borderColor: alpha('#64748B', 0.3), color: '#64748B', '&:hover': { borderColor: '#64748B', bgcolor: alpha('#64748B', 0.06) } }}
        >
          Details
        </Button>
      </Tooltip>
    </Stack>
  )
}

// ─── Topic selection dialog ───────────────────────────────────────────────────

interface TopicSelectDialogProps {
  approval: Approval | null
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

function TopicSelectDialog({ approval, open, onClose, onSuccess, onError }: TopicSelectDialogProps) {
  const client = useQueryClient()
  const [selecting, setSelecting] = useState<string | null>(null)

  const { mutate: selectTopic } = useMutation({
    mutationFn: (trendId: string) => approvalsApi.selectTopic(approval!.id, trendId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['approvals'] })
      onSuccess('Topic selected — content generation started.')
      onClose()
      setSelecting(null)
    },
    onError: (err: Error) => { onError(err.message); setSelecting(null) },
  })

  if (!approval) return null

  const trends = (approval.metadata?.trends ?? []) as Array<{
    id: string; title: string; summary?: string; source_name?: string; lifecycle_stage?: string
  }>

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Select a Trend Topic</Typography>
          <Typography variant="caption" color="text.secondary">{approval.brand_name} — pick one to generate content from</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5, pb: 3 }}>
        {trends.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>No trends available for this approval.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {trends.map((trend) => (
              <Box
                key={trend.id}
                sx={{
                  p: 2,
                  borderRadius: '10px',
                  border: `1px solid ${alpha('#64748B', 0.18)}`,
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                }}
              >
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4, mb: 0.5 }}>{trend.title}</Typography>
                    {trend.summary && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
                        {trend.summary.slice(0, 140)}{trend.summary.length > 140 ? '…' : ''}
                      </Typography>
                    )}
                    {(trend.source_name || trend.lifecycle_stage) && (
                      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                        {trend.source_name && (
                          <Chip label={trend.source_name} size="small" sx={{ height: 18, fontSize: '10px', fontWeight: 600, borderRadius: '5px', bgcolor: alpha('#64748B', 0.08), color: '#64748B' }} />
                        )}
                        {trend.lifecycle_stage && (
                          <Chip label={trend.lifecycle_stage} size="small" sx={{ height: 18, fontSize: '10px', fontWeight: 600, borderRadius: '5px', bgcolor: alpha('#22D3EE', 0.08), color: '#0EA5B7' }} />
                        )}
                      </Stack>
                    )}
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!!selecting}
                    onClick={() => { setSelecting(trend.id); selectTopic(trend.id) }}
                    startIcon={selecting === trend.id ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{ height: 34, fontSize: '12px', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {selecting === trend.id ? 'Selecting…' : 'Use this'}
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Content / video detail dialog ───────────────────────────────────────────

interface DetailDialogProps {
  approval: Approval | null
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

function DetailDialog({ approval, open, onClose, onSuccess, onError }: DetailDialogProps) {
  const client = useQueryClient()
  const [showFeedback, setShowFeedback] = useState<'reject' | 'regenerate' | null>(null)
  const [feedback, setFeedback] = useState('')

  const { mutate: act, isPending } = useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject' | 'regenerate'; feedback?: string }) =>
      approvalsApi.takeAction(approval!.id, payload.action, payload.feedback),
    onSuccess: (_, vars) => {
      client.invalidateQueries({ queryKey: ['approvals'] })
      const label = vars.action === 'approve' ? 'Approved' : vars.action === 'reject' ? 'Rejected' : 'Regenerating…'
      onSuccess(label + ' successfully.')
      onClose()
      setShowFeedback(null)
      setFeedback('')
    },
    onError: (err: Error) => onError(err.message),
  })

  if (!approval) return null

  const bundle = approval.bundle as typeof approval.bundle & {
    script?: string; caption?: string; hashtags?: string[]; score_composite?: string | null
  }
  const stageConf = STAGE[approval.stage]
  const alreadyActioned = !!approval.action

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>
            {approval.brand_name ?? 'Content Review'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.25 }}>
            <Chip label={stageConf.label} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 700, borderRadius: '6px', bgcolor: stageConf.bg, color: stageConf.color, border: `1px solid ${stageConf.border}` }} />
            {bundle?.score_composite && (() => {
              const score = parseFloat(bundle.score_composite as string)
              const color = isNaN(score) ? '#94A3B8' : scoreColor(score)
              return (
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: alpha(color, 0.12), border: `2px solid ${alpha(color, 0.4)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '11px', fontWeight: 800, color, lineHeight: 1 }}>
                    {isNaN(score) ? '?' : score.toFixed(1)}
                  </Typography>
                </Box>
              )
            })()}
          </Stack>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 1 }}>
        <Stack spacing={2.5}>
          {bundle?.hook && (
            <Box sx={{ borderLeft: `3px solid #22D3EE`, pl: 2.5, py: 1, bgcolor: alpha('#22D3EE', 0.04), borderRadius: '0 10px 10px 0' }}>
              <SectionLabel>Hook</SectionLabel>
              <Typography sx={{ fontStyle: 'italic', fontSize: '1.1rem', lineHeight: 1.55, color: 'text.primary', fontWeight: 500 }}>
                {bundle.hook}
              </Typography>
            </Box>
          )}

          {bundle?.script && (
            <Box>
              <SectionLabel>Script</SectionLabel>
              <Typography sx={{ color: 'text.primary', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>
                {bundle.script}
              </Typography>
            </Box>
          )}

          {bundle?.caption && (
            <Box>
              <SectionLabel>Caption</SectionLabel>
              <Typography sx={{ color: 'text.primary', lineHeight: 1.65, fontSize: '0.9375rem' }}>
                {bundle.caption.slice(0, 400)}{(bundle.caption?.length ?? 0) > 400 ? '…' : ''}
              </Typography>
            </Box>
          )}

          {bundle?.hashtags && bundle.hashtags.length > 0 && (
            <Box>
              <SectionLabel>Hashtags</SectionLabel>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '6px' }}>
                {bundle.hashtags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" sx={{ height: 24, fontSize: '11px', fontWeight: 600, borderRadius: '8px', bgcolor: alpha('#64748B', 0.08), color: '#475569', border: `1px solid ${alpha('#64748B', 0.18)}` }} />
                ))}
              </Stack>
            </Box>
          )}

          {approval.stage === 'video_review' && (
            <Box>
              <SectionLabel>Video</SectionLabel>
              {bundle?.video_url ? (
                <Button
                  component="a"
                  href={bundle.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  startIcon={<PlayCircleOutlinedIcon />}
                  sx={{ borderColor: alpha('#22D3EE', 0.4), color: '#0EA5B7', fontWeight: 600, '&:hover': { borderColor: '#22D3EE', bgcolor: alpha('#22D3EE', 0.06) } }}
                >
                  Watch Video
                </Button>
              ) : (
                <Typography sx={{ color: 'text.disabled', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  Video not yet generated
                </Typography>
              )}
            </Box>
          )}

          {/* Already actioned */}
          {alreadyActioned && (
            <Alert severity={approval.action === 'approved' ? 'success' : 'info'} sx={{ borderRadius: '8px' }}>
              {approval.action === 'approved' ? 'Already approved.' : `Already actioned: ${approval.action}`}
              {approval.rejection_reason && ` — "${approval.rejection_reason}"`}
            </Alert>
          )}

          {/* Action area */}
          {!alreadyActioned && (
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              {showFeedback ? (
                <Stack spacing={1.5}>
                  <TextField
                    multiline
                    minRows={2}
                    label={showFeedback === 'reject' ? 'Reason for rejection (optional)' : 'What should be improved?'}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    autoFocus
                  />
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      variant="contained"
                      color={showFeedback === 'reject' ? 'error' : 'primary'}
                      disabled={isPending}
                      onClick={() => act({ action: showFeedback, feedback: feedback || undefined })}
                      startIcon={isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                      sx={{ height: 42, flex: 1 }}
                    >
                      {isPending ? 'Processing…' : showFeedback === 'reject' ? 'Confirm Reject' : 'Regenerate with feedback'}
                    </Button>
                    <Button variant="outlined" onClick={() => { setShowFeedback(null); setFeedback('') }} sx={{ height: 42 }}>
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    disabled={isPending}
                    onClick={() => act({ action: 'approve' })}
                    startIcon={isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <CheckCircleOutlinedIcon />}
                    sx={{ height: 42, flex: 1, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={isPending}
                    onClick={() => setShowFeedback('regenerate')}
                    startIcon={<AutorenewIcon />}
                    sx={{ height: 42, borderColor: alpha('#22D3EE', 0.4), color: '#0EA5B7', '&:hover': { borderColor: '#22D3EE', bgcolor: alpha('#22D3EE', 0.06) } }}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={isPending}
                    onClick={() => setShowFeedback('reject')}
                    startIcon={<CancelOutlinedIcon />}
                    sx={{ height: 42 }}
                  >
                    Reject
                  </Button>
                </Stack>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}

// ─── Approval card ────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approval: Approval
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

function ApprovalCard({ approval, onSuccess, onError }: ApprovalCardProps) {
  const [topicOpen, setTopicOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const stageConf = STAGE[approval.stage]
  const pending = !approval.action
  const expired = isExpired(approval.expires_at)
  const hoursLeft = expiresInHours(approval.expires_at)
  const nearExpiry = pending && !expired && hoursLeft < 6

  const metadata = approval.metadata as { channel_id?: string; trends?: unknown[] }
  const trendsCount = Array.isArray(metadata?.trends) ? metadata.trends.length : null

  return (
    <>
      <GlassCard
        component="article"
        sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Stage + time */}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Chip label={stageConf.label} size="small" sx={{ height: 22, fontSize: '10px', fontWeight: 700, borderRadius: '6px', bgcolor: stageConf.bg, color: stageConf.color, border: `1px solid ${stageConf.border}` }} />
          <Typography sx={{ fontSize: '11px', color: 'text.disabled', fontWeight: 500 }}>{timeAgo(approval.created_at)}</Typography>
        </Stack>

        {/* Brand name */}
        {(approval.brand_name || approval.channel_name) && (
          <Typography sx={{ fontSize: '11px', color: '#475569', fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {approval.brand_name ?? approval.channel_name}
          </Typography>
        )}

        {/* Content preview */}
        {approval.stage === 'topic_selection' ? (
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.primary', fontWeight: 600, lineHeight: 1.45, mb: 1 }}>
            {trendsCount !== null ? `${trendsCount} trend${trendsCount !== 1 ? 's' : ''} ready to review` : 'Topics pending review'}
          </Typography>
        ) : approval.bundle?.hook ? (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', lineHeight: 1.5, mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontStyle: 'italic' }}>
            "{approval.bundle.hook}"
          </Typography>
        ) : null}

        {/* Expiry warnings */}
        {nearExpiry && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
            <Typography sx={{ fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>Expires in {Math.ceil(hoursLeft)}h</Typography>
          </Stack>
        )}
        {expired && pending && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 14, color: '#F87171' }} />
            <Typography sx={{ fontSize: '11px', color: '#F87171', fontWeight: 600 }}>Expired</Typography>
          </Stack>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Actions or status */}
        <Box sx={{ mt: 1.5 }}>
          {approval.action ? (
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Chip
                icon={approval.action === 'approved' || approval.action === 'select_topic'
                  ? <CheckCircleOutlinedIcon sx={{ fontSize: '14px !important' }} />
                  : <CancelOutlinedIcon sx={{ fontSize: '14px !important' }} />}
                label={approval.action === 'select_topic' ? 'Topic selected' : approval.action.charAt(0).toUpperCase() + approval.action.slice(1)}
                size="small"
                sx={{
                  height: 24, fontSize: '11px', fontWeight: 700, borderRadius: '8px',
                  bgcolor: (approval.action === 'approved' || approval.action === 'select_topic') ? alpha('#34D399', 0.1) : alpha('#F87171', 0.1),
                  color: (approval.action === 'approved' || approval.action === 'select_topic') ? '#059669' : '#DC2626',
                  border: `1px solid ${(approval.action === 'approved' || approval.action === 'select_topic') ? alpha('#34D399', 0.3) : alpha('#F87171', 0.3)}`,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
              {approval.rejection_reason && (
                <Typography sx={{ fontSize: '11px', color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {approval.rejection_reason}
                </Typography>
              )}
            </Stack>
          ) : approval.stage === 'topic_selection' ? (
            <Button
              variant="contained"
              size="small"
              fullWidth
              onClick={() => setTopicOpen(true)}
              startIcon={<TipsAndUpdatesOutlinedIcon sx={{ fontSize: 15 }} />}
              sx={{ height: 36, fontSize: '12px', fontWeight: 700 }}
            >
              Review & Select Topic
            </Button>
          ) : (
            <ActionButtons
              approvalId={approval.id}
              stage={approval.stage}
              onSuccess={onSuccess}
              onError={onError}
              onOpenDetail={() => setDetailOpen(true)}
            />
          )}
        </Box>
      </GlassCard>

      <TopicSelectDialog
        approval={topicOpen ? approval : null}
        open={topicOpen}
        onClose={() => setTopicOpen(false)}
        onSuccess={onSuccess}
        onError={onError}
      />

      <DetailDialog
        approval={detailOpen ? approval : null}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSuccess={onSuccess}
        onError={onError}
      />
    </>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = 'all' | ApprovalStage | 'completed'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',              label: 'All' },
  { value: 'topic_selection',  label: 'Topic Selection' },
  { value: 'content_review',   label: 'Content Review' },
  { value: 'video_review',     label: 'Video Review' },
  { value: 'completed',        label: 'Completed' },
]

function filterApprovals(list: Approval[], tab: FilterTab) {
  if (tab === 'all') return list
  if (tab === 'completed') return list.filter((a) => a.action !== null)
  return list.filter((a) => a.stage === tab)
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const client = useQueryClient()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [snackSeverity, setSnackSeverity] = useState<'success' | 'error'>('success')

  const showToast = (msg: string, severity: 'success' | 'error' = 'success') => {
    setSnackMsg(msg); setSnackSeverity(severity); setSnackOpen(true)
  }

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: approvalsApi.list,
  })

  const { mutate: triggerPipeline, isPending: pipelinePending } = useMutation({
    mutationFn: approvalsApi.triggerPipeline,
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['approvals'] })
      showToast(res.message || 'Pipeline triggered.', 'success')
    },
    onError: (err: Error) => showToast(`Pipeline failed: ${err.message}`, 'error'),
  })

  const pending = approvals.filter((a) => a.action === null && !isExpired(a.expires_at))
  const filtered = filterApprovals(approvals, activeTab)

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Approvals"
        subtitle="Review and approve content directly — no email needed."
        action={
          <Button
            variant="contained"
            disabled={pipelinePending}
            onClick={() => triggerPipeline()}
            startIcon={pipelinePending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <AutorenewIcon />}
            sx={{ fontWeight: 600, height: 42 }}
          >
            {pipelinePending ? 'Running…' : 'Run Pipeline'}
          </Button>
        }
      />

      {/* Stats */}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <StatCard label="Pending" value={pending.length} color="#22D3EE" />
        <StatCard label="Topic Selection" value={pending.filter((a) => a.stage === 'topic_selection').length} color="#0EA5B7" />
        <StatCard label="Content Review" value={pending.filter((a) => a.stage === 'content_review').length} color="#F97316" />
        <StatCard label="Video Review" value={pending.filter((a) => a.stage === 'video_review').length} color="#A855F7" />
      </Stack>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v: FilterTab) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 44,
            '& .MuiTab-root': { minHeight: 44, fontSize: '13px', fontWeight: 600, textTransform: 'none', color: '#475569', px: 2 },
            '& .Mui-selected': { color: '#0EA5B7 !important' },
            '& .MuiTabs-indicator': { backgroundColor: '#22D3EE', height: 2 },
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
              <Box sx={{ height: 200, borderRadius: '12px', bgcolor: (t) => alpha(t.palette.background.paper, 0.6), border: '1px solid #dddddd30', animation: 'pulse 1.5s infinite' }} />
            </Grid>
          ))}
        </Grid>
      ) : filtered.length === 0 ? (
        <GlassCard sx={{ p: 6 }}>
          <Stack sx={{ alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: alpha('#22D3EE', 0.08), border: `1px solid ${alpha('#22D3EE', 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 32, color: alpha('#22D3EE', 0.5) }} />
            </Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>
              {activeTab === 'all' ? 'No approvals yet' : `No ${FILTER_TABS.find((t) => t.value === activeTab)?.label.toLowerCase()} items`}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', maxWidth: 360 }}>
              {activeTab === 'all' ? 'Run the pipeline to generate trends and creative bundles.' : 'Try a different filter or run the pipeline.'}
            </Typography>
          </Stack>
        </GlassCard>
      ) : (
        <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
          {filtered.map((approval) => (
            <Grid key={approval.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <ApprovalCard
                approval={approval}
                onSuccess={(msg) => showToast(msg, 'success')}
                onError={(msg) => showToast(msg, 'error')}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <Snackbar open={snackOpen} autoHideDuration={5000} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackSeverity} onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
