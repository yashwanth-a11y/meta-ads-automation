import { Chip, Tooltip } from '@mui/material'
import type { ChipProps } from '@mui/material'

// Maps Meta `effective_status` (preferred) or our internal `status` to a
// visible badge. We deliberately keep the badge dumb — pages decide what
// to do with the user's click; the tooltip carries the Meta-side reason.
type Props = {
  status?: string | null
  effectiveStatus?: string | null
  reason?: string | null
}

type Variant = {
  label: string
  color: ChipProps['color']
  variant: ChipProps['variant']
  hint?: string
}

const MAP: Record<string, Variant> = {
  ACTIVE: { label: 'Active', color: 'success', variant: 'filled' },
  PAUSED: { label: 'Paused', color: 'default', variant: 'outlined' },
  ADSET_PAUSED: { label: 'Ad set paused', color: 'default', variant: 'outlined' },
  CAMPAIGN_PAUSED: { label: 'Campaign paused', color: 'default', variant: 'outlined' },
  PENDING_REVIEW: { label: 'In review', color: 'warning', variant: 'outlined', hint: 'Meta is reviewing this ad. Usually under 24h.' },
  WITH_ISSUES: { label: 'Issues', color: 'warning', variant: 'filled' },
  PREAPPROVED: { label: 'Pre-approved', color: 'info', variant: 'outlined' },
  DISAPPROVED: { label: 'Disapproved', color: 'error', variant: 'filled' },
  PENDING_BILLING_INFO: { label: 'Billing required', color: 'error', variant: 'outlined' },
  IN_PROCESS: { label: 'Processing', color: 'info', variant: 'outlined' },
  ARCHIVED: { label: 'Archived', color: 'default', variant: 'outlined' },
  DELETED: { label: 'Deleted', color: 'error', variant: 'outlined' },
  active: { label: 'Active', color: 'success', variant: 'filled' },
  paused: { label: 'Paused', color: 'default', variant: 'outlined' },
}

export function StatusBadge({ status, effectiveStatus, reason }: Props) {
  const key = (effectiveStatus || status || '').toString()
  const variant = MAP[key] || MAP[key.toUpperCase()] || { label: key || 'Unknown', color: 'default' as const, variant: 'outlined' as const }
  const tip = reason || variant.hint
  const chip = (
    <Chip
      size="small"
      label={variant.label}
      color={variant.color}
      variant={variant.variant}
      sx={{ fontWeight: 700, borderRadius: '4px' }}
    />
  )
  return tip ? <Tooltip title={tip} arrow>{chip}</Tooltip> : chip
}

export default StatusBadge
