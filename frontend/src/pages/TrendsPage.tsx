import { useState, useEffect } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import BoltIcon from '@mui/icons-material/Bolt'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { trendsApi } from '../api/trends'
import { qk } from '../api/queryClient'
import type { CreativeBundle, QualityScores, TrendWithScore } from '../api/trends'

// ─── Score colour helpers ─────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8) return '#34D399'
  if (score >= 6) return '#22D3EE'
  if (score >= 4) return '#FBBF24'
  return '#F87171'
}

// ─── Classification chip colours ─────────────────────────────────────────────

type ClassificationKey = 'topic' | 'format_template' | 'brand_news' | 'noise' | null

function classificationStyle(c: ClassificationKey) {
  switch (c) {
    case 'topic':
      return {
        bgcolor: alpha('#22D3EE', 0.12),
        color: '#0EA5B7',
        border: `1px solid ${alpha('#22D3EE', 0.3)}`,
        label: 'topic',
      }
    case 'format_template':
      return {
        bgcolor: alpha('#A855F7', 0.12),
        color: '#9333EA',
        border: `1px solid ${alpha('#A855F7', 0.3)}`,
        label: 'format',
      }
    case 'brand_news':
      return {
        bgcolor: alpha('#F97316', 0.12),
        color: '#EA580C',
        border: `1px solid ${alpha('#F97316', 0.3)}`,
        label: 'brand news',
      }
    default:
      return {
        bgcolor: alpha('#64748B', 0.1),
        color: '#64748B',
        border: `1px solid ${alpha('#64748B', 0.2)}`,
        label: c ?? 'uncategorized',
      }
  }
}

// ─── Quality score chip ───────────────────────────────────────────────────────

function QScoreChip({ label, value, large = false }: { label: string; value: number; large?: boolean }) {
  const color = scoreColor(value)
  return (
    <Chip
      label={`${label}: ${value}`}
      size="small"
      sx={{
        height: large ? 28 : 22,
        fontSize: large ? '12px' : '10px',
        fontWeight: 700,
        borderRadius: '8px',
        bgcolor: alpha(color, 0.12),
        color,
        border: `1px solid ${alpha(color, 0.3)}`,
        px: large ? 0.5 : 0,
      }}
    />
  )
}

// ─── Bundle drawer ────────────────────────────────────────────────────────────

interface BundleDrawerProps {
  bundle: CreativeBundle | null
  open: boolean
  onClose: () => void
}

function BundleDrawer({ bundle, open, onClose }: BundleDrawerProps) {
  const qs: QualityScores | null = bundle?.quality_scores ?? null

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 600, md: 750 },
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius:"0"
          },
        },
      }}
    >
      {bundle && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 3,
              py: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: '1rem',
                color: 'text.primary',
              }}
            >
              Creative Bundle
            </Typography>
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="Close bundle drawer"
              sx={{
                color: 'text.secondary',
                '&:hover': { bgcolor: alpha('#0F172A', 0.05) },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ px: 3, py: 2.5, flex: 1, overflowY: 'auto' }}>
        <Stack spacing={3}>
          {/* Hook */}
          <Box
            sx={{
              borderLeft: `3px solid #22D3EE`,
              pl: 2,
              py: 0.5,
              bgcolor: alpha('#22D3EE', 0.04),
              borderRadius: '0 8px 8px 0',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontStyle: 'italic',
                fontSize: '1.0625rem',
                lineHeight: 1.55,
                color: 'text.primary',
                fontWeight: 500,
              }}
            >
              {bundle.hook}
            </Typography>
          </Box>

          {/* Script */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}
            >
              Script
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'text.primary', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
            >
              {bundle.script}
            </Typography>
          </Box>

          {/* Caption */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}
            >
              Caption
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.primary', lineHeight: 1.65 }}>
              {bundle.caption}
            </Typography>
          </Box>

          {/* CTA */}
          {bundle.cta && (
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ mb: 1, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}
              >
                CTA
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                {bundle.cta}
              </Typography>
            </Box>
          )}

          {/* Hashtags */}
          {bundle.hashtags.length > 0 && (
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ mb: 1, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}
              >
                Hashtags
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '6px' }}>
                {bundle.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      height: 22,
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

          {/* Quality scores */}
          {qs && (
            <Box
              sx={{
                p: 2,
                borderRadius: '10px',
                bgcolor: alpha('#0F172A', 0.025),
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ mb: 1.5, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled' }}
              >
                Quality scores
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '8px', mb: 1.5 }}>
                <QScoreChip label="composite" value={qs.composite} large />
                <QScoreChip label="viral hook" value={qs.viral_hook} />
                <QScoreChip label="brand safety" value={qs.brand_safety} />
                <QScoreChip label="clarity" value={qs.clarity} />
                <QScoreChip label="audience fit" value={qs.audience_fit} />
                <QScoreChip label="platform fit" value={qs.platform_fit} />
                <QScoreChip label="relevance" value={qs.trend_relevance} />
              </Stack>
              {qs.rationale && (
                <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
                  {qs.rationale}
                </Typography>
              )}
            </Box>
          )}

          {/* Scene prompts collapsible */}
          {bundle.scene_prompts.length > 0 && (
            <Accordion
              disableGutters
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '10px !important',
                '&:before': { display: 'none' },
                bgcolor: 'transparent',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: 'text.secondary', fontSize: 18 }} />}
                sx={{ px: 2, py: 0.5, minHeight: 48 }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Scene Prompts ({bundle.scene_prompts.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
                <Stack spacing={1.25}>
                  {bundle.scene_prompts.map((prompt, i) => (
                    <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                      <Box
                        sx={{
                          minWidth: 22,
                          height: 22,
                          borderRadius: '50%',
                          bgcolor: alpha('#22D3EE', 0.12),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mt: '1px',
                        }}
                      >
                        <Typography
                          sx={{ fontSize: '10px', fontWeight: 700, color: '#0EA5B7', lineHeight: 1 }}
                        >
                          {i + 1}
                        </Typography>
                      </Box>
                      <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                        {prompt}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </Stack>
          </Box>

          <Box
            sx={{
              px: 3,
              py: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
            <Button onClick={onClose} variant="outlined" sx={{ minWidth: 100 }}>
              Close
            </Button>
          </Box>
        </>
      )}
    </Drawer>
  )
}

// ─── Trend card skeleton ──────────────────────────────────────────────────────

function TrendCardSkeleton() {
  return (
    <Box
      sx={{
        p: 2.5,
        height: 220,
        borderRadius: '8px',
        border: '1px solid #dddddd57',
        bgcolor: (t) => alpha(t.palette.background.paper, 0.94),
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton variant="rounded" width={72} height={22} sx={{ borderRadius: '8px' }} />
        <Skeleton variant="rounded" width={40} height={28} sx={{ borderRadius: '8px' }} />
      </Stack>
      <Skeleton variant="text" width="90%" height={20} />
      <Skeleton variant="text" width="70%" height={20} />
      <Stack direction="row" spacing={0.75}>
        <Skeleton variant="rounded" width={64} height={22} sx={{ borderRadius: '8px' }} />
        <Skeleton variant="rounded" width={56} height={22} sx={{ borderRadius: '8px' }} />
      </Stack>
      <Skeleton variant="text" width="100%" height={16} sx={{ mt: 'auto' }} />
      <Skeleton variant="rounded" width="100%" height={36} sx={{ borderRadius: '8px' }} />
    </Box>
  )
}

// ─── Trend card ───────────────────────────────────────────────────────────────

interface TrendCardProps {
  trend: TrendWithScore
  channelId: string
  onBundleReady: (bundle: CreativeBundle) => void
}

function TrendCard({ trend, channelId, onBundleReady }: TrendCardProps) {
  const { mutate: generate, isPending } = useMutation({
    mutationFn: () => trendsApi.generateBundle(channelId, trend.id),
    onSuccess: (bundle) => onBundleReady(bundle),
  })

  const score = trend.brand_fit.composite_score
  const clsStyle = classificationStyle(trend.classification)
  const lifecycleColor: Record<string, string> = { seed: '#34D399', sprout: '#22D3EE', peak: '#FBBF24', saturated: '#F87171' }
  const lcColor = lifecycleColor[trend.lifecycle_stage] ?? '#94A3B8'
  const velocity = trend.velocity_score ? Math.round(parseFloat(trend.velocity_score)) : 0
  const dna = trend.emotional_dna

  return (
    <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Row 1: classification + score + velocity */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Chip label={clsStyle.label} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 700, borderRadius: '6px', bgcolor: clsStyle.bgcolor, color: clsStyle.color, border: clsStyle.border }} />
          {velocity > 0 && (
            <Tooltip title={`Velocity: ${velocity.toLocaleString()} interactions/hr`}>
              <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', px: 0.75, height: 20, borderRadius: '6px', bgcolor: alpha('#FBBF24', 0.1), border: `1px solid ${alpha('#FBBF24', 0.28)}` }}>
                <BoltIcon sx={{ fontSize: 11, color: '#D97706' }} />
                <Typography sx={{ fontSize: '10px', fontWeight: 700, color: '#D97706', lineHeight: 1 }}>
                  {velocity >= 1000 ? `${(velocity / 1000).toFixed(1)}k` : velocity}
                </Typography>
              </Stack>
            </Tooltip>
          )}
        </Stack>
        <Box sx={{ minWidth: 44, height: 32, borderRadius: '8px', bgcolor: alpha(scoreColor(score), 0.12), border: `1px solid ${alpha(scoreColor(score), 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1 }}>
          <Typography sx={{ fontSize: '15px', fontWeight: 800, color: scoreColor(score), lineHeight: 1 }}>{score.toFixed(1)}</Typography>
        </Box>
      </Stack>

      {/* Title */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
        {trend.title}
      </Typography>

      {/* Source + lifecycle + emotion */}
      <Stack direction="row" spacing={0.75} sx={{ mb: dna ? 1 : 1.25, flexWrap: 'wrap', gap: '5px !important' }}>
        <Chip label={trend.source_name} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 600, borderRadius: '6px', bgcolor: alpha('#64748B', 0.08), color: '#64748B', border: `1px solid ${alpha('#64748B', 0.18)}` }} />
        <Chip label={trend.lifecycle_stage} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 600, borderRadius: '6px', bgcolor: alpha(lcColor, 0.1), color: lcColor, border: `1px solid ${alpha(lcColor, 0.28)}` }} />
        {dna?.core_emotion && (
          <Chip label={dna.core_emotion} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 600, borderRadius: '6px', bgcolor: alpha('#EC4899', 0.08), color: '#DB2777', border: `1px solid ${alpha('#EC4899', 0.22)}` }} />
        )}
      </Stack>

      {/* Emotional DNA themes */}
      {dna?.themes && dna.themes.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '4px', mb: 1 }}>
          {dna.themes.slice(0, 4).map((theme) => (
            <Chip key={theme} label={`# ${theme}`} size="small" sx={{ height: 18, fontSize: '9px', fontWeight: 600, borderRadius: '5px', bgcolor: alpha('#8B5CF6', 0.07), color: '#7C3AED', border: `1px solid ${alpha('#8B5CF6', 0.18)}` }} />
          ))}
        </Stack>
      )}

      {/* Adaptation idea */}
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '11px', lineHeight: 1.6, flexGrow: 1, mb: 1.25, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {trend.brand_fit.adaptation_idea ?? trend.summary ?? '—'}
      </Typography>

      {/* Generate button */}
      <Button variant="outlined" color="primary" fullWidth disabled={isPending} onClick={() => generate()}
        startIcon={isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}>
        {isPending ? 'Generating bundle…' : 'Generate bundle'}
      </Button>
    </GlassCard>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TrendsPage() {
  const client = useQueryClient()
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [activeBundle, setActiveBundle] = useState<CreativeBundle | null>(null)
  const [bundleOpen, setBundleOpen] = useState(false)

  // ── Channels ──────────────────────────────────────────────────────────────

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: qk.channels,
    queryFn: trendsApi.listChannels,
    select: (data) => {
      // Auto-select first channel when loaded
      return data
    },
  })

  // Auto-select first channel after load
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id)
    }
  }, [channels, selectedChannelId])

  // ── Top trends ────────────────────────────────────────────────────────────

  const { data: trends = [], isLoading: trendsLoading } = useQuery({
    queryKey: qk.topTrends(selectedChannelId),
    queryFn: () => trendsApi.getTopTrends(selectedChannelId),
    enabled: !!selectedChannelId,
  })

  // ── Pipeline ──────────────────────────────────────────────────────────────

  const { mutate: runPipeline, isPending: pipelineRunning } = useMutation({
    mutationFn: trendsApi.runPipeline,
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: qk.topTrends(selectedChannelId) })
      setSnackMsg(
        `Pipeline complete — ${result.scored} new trend${result.scored !== 1 ? 's' : ''} scored.`,
      )
      setSnackOpen(true)
    },
    onError: (err: Error) => {
      setSnackMsg(`Pipeline failed: ${err.message}`)
      setSnackOpen(true)
    },
  })

  // ── Bundle handlers ───────────────────────────────────────────────────────

  const handleBundleReady = (bundle: CreativeBundle) => {
    setActiveBundle(bundle)
    setBundleOpen(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Trends"
        subtitle="Surface momentum across networks and translate signal into assets instantly."
      />

      {/* Top bar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}
      >
        {/* Channel selector */}
        <FormControl sx={{ minWidth: 260 }} size="medium">
          <InputLabel id="channel-select-label">Select channel</InputLabel>
          <Select
            labelId="channel-select-label"
            label="Select channel"
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            disabled={channelsLoading || channels.length === 0}
            sx={{ bgcolor: '#FFFFFF' }}
          >
            {channels.map((ch) => (
              <MenuItem key={ch.id} value={ch.id}>
                {ch.brand_name} — {ch.name}
              </MenuItem>
            ))}
            {channels.length === 0 && !channelsLoading && (
              <MenuItem disabled value="">
                No channels found
              </MenuItem>
            )}
          </Select>
        </FormControl>

        {/* Run pipeline */}
        <Button
          variant="contained"
          color="primary"
          disabled={pipelineRunning}
          onClick={() => runPipeline()}
          startIcon={
            pipelineRunning ? (
              <CircularProgress size={18} sx={{ color: 'inherit' }} />
            ) : (
              <AutorenewIcon
                sx={{
                  transition: 'transform 600ms linear',
                  animation: pipelineRunning ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                }}
              />
            )
          }
          sx={{ height: 48, px: 2.5 }}
        >
          {pipelineRunning ? 'Running pipeline…' : 'Run pipeline'}
        </Button>
      </Stack>

      {/* Trend grid */}
      {trendsLoading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, lg: 4 }}>
              <TrendCardSkeleton />
            </Grid>
          ))}
        </Grid>
      ) : !selectedChannelId ? (
        <GlassCard sx={{ p: 4 }}>
          <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
            Select a channel above to see scored trends.
          </Typography>
        </GlassCard>
      ) : trends.length === 0 ? (
        <GlassCard sx={{ p: 4 }}>
          <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
            No trends scored yet. Run the pipeline first.
          </Typography>
        </GlassCard>
      ) : (
        <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
          {trends.map((trend) => (
            <Grid key={trend.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <TrendCard
                trend={trend}
                channelId={selectedChannelId}
                onBundleReady={handleBundleReady}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Bundle dialog */}
      <BundleDrawer
        bundle={activeBundle}
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
      />

      {/* Pipeline snackbar */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={5000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackMsg.startsWith('Pipeline failed') ? 'error' : 'success'}
          onClose={() => setSnackOpen(false)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
