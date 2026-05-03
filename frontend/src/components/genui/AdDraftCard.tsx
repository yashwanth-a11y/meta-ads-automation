import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import EditNoteIcon from '@mui/icons-material/EditNote'
import { useNavigate } from 'react-router-dom'
import type { AdDraft } from '../../api/genui'
import { GlassCard } from '../ui/GlassCard'

interface AdDraftCardProps {
  draft: AdDraft
  onSendApproval?: () => void
  isSending?: boolean
}

export function AdDraftCard({ draft, onSendApproval, isSending }: AdDraftCardProps) {
  const navigate = useNavigate()
  const hasRiskFlags = Array.isArray(draft.riskFlags) && draft.riskFlags.length > 0

  return (
    <GlassCard
      sx={{
        mt: 1,
        borderLeft: `3px solid #22D3EE`,
        '&:hover': { transform: 'none' },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
          <Chip
            label={draft.objective || 'Ad Draft'}
            size="small"
            sx={{
              bgcolor: alpha('#22D3EE', 0.1),
              color: '#0EA5B7',
              fontWeight: 600,
              fontSize: 11,
              height: 22,
            }}
          />
          {hasRiskFlags
            ? draft.riskFlags.map((flag, i) => (
                <Chip
                  key={i}
                  icon={<WarningAmberIcon sx={{ fontSize: 13 }} />}
                  label={flag}
                  size="small"
                  sx={{
                    bgcolor: alpha('#F97316', 0.1),
                    color: '#EA580C',
                    fontWeight: 500,
                    fontSize: 11,
                    height: 22,
                    '& .MuiChip-icon': { color: '#EA580C' },
                  }}
                />
              ))
            : (
                <Chip
                  icon={<CheckCircleOutlineIcon sx={{ fontSize: 13 }} />}
                  label="No policy risks"
                  size="small"
                  sx={{
                    bgcolor: alpha('#34D399', 0.1),
                    color: '#059669',
                    fontWeight: 500,
                    fontSize: 11,
                    height: 22,
                    '& .MuiChip-icon': { color: '#059669' },
                  }}
                />
              )}
        </Stack>

        {/* Three-column summary */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          divider={<Divider orientation="vertical" flexItem sx={{ borderColor: '#dddddd57' }} />}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Audience
            </Typography>
            <Typography variant="body2" sx={{ color: '#0F172A', mt: 0.25 }}>
              {draft.audience || '—'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Budget
            </Typography>
            <Typography variant="body2" sx={{ color: '#0F172A', mt: 0.25 }}>
              {draft.budget || '—'}
            </Typography>
            {draft.schedule && (
              <Typography variant="caption" sx={{ color: '#64748B' }}>
                {draft.schedule}
              </Typography>
            )}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              CTA
            </Typography>
            <Typography variant="body2" sx={{ color: '#0F172A', mt: 0.25 }}>
              {draft.cta || '—'}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Divider sx={{ borderColor: '#dddddd57' }} />

      {/* Copy variants */}
      <Accordion
        elevation={0}
        disableGutters
        sx={{
          bgcolor: 'transparent',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: '#64748B' }} />}
          sx={{ px: 2, py: 1, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0 } }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Copy Variants ({Array.isArray(draft.headlines) ? draft.headlines.length : 0} headlines · {Array.isArray(draft.primaryTexts) ? draft.primaryTexts.length : 0} texts)
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
          <Stack spacing={2}>
            {/* Headlines */}
            {Array.isArray(draft.headlines) && draft.headlines.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Headlines
                </Typography>
                <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                  {draft.headlines.map((h, i) => (
                    <Box
                      key={i}
                      sx={{
                        px: 1.5,
                        py: 0.75,
                        borderRadius: '6px',
                        bgcolor: alpha('#22D3EE', 0.05),
                        border: '1px solid',
                        borderColor: alpha('#22D3EE', 0.12),
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#0F172A', fontWeight: 500 }}>
                        {h}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Primary texts */}
            {Array.isArray(draft.primaryTexts) && draft.primaryTexts.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Primary Texts
                </Typography>
                <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                  {draft.primaryTexts.map((t, i) => (
                    <Box
                      key={i}
                      sx={{
                        px: 1.5,
                        py: 0.75,
                        borderRadius: '6px',
                        bgcolor: alpha('#475569', 0.04),
                        border: '1px solid #dddddd57',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#475569' }}>
                        {t}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ borderColor: '#dddddd57' }} />

      {/* Action footer */}
      <Stack direction="row" spacing={1} sx={{ p: 1.5, px: 2 }}>
        <Button
          variant="contained"
          size="small"
          disabled={isSending}
          onClick={onSendApproval}
          sx={{
            bgcolor: '#22D3EE',
            color: '#0F172A',
            fontWeight: 600,
            textTransform: 'none',
            fontSize: 12,
            '&:hover': { bgcolor: '#0EA5B7' },
          }}
        >
          {isSending ? 'Sending…' : 'Send for Approval'}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<EditNoteIcon sx={{ fontSize: 15 }} />}
          onClick={() => navigate('/ads/create', { state: { draft } })}
          sx={{
            borderColor: '#dddddd57',
            color: '#475569',
            fontWeight: 500,
            textTransform: 'none',
            fontSize: 12,
            '&:hover': { borderColor: '#22D3EE', color: '#0EA5B7' },
          }}
        >
          Edit in Ads Builder
        </Button>
      </Stack>
    </GlassCard>
  )
}
