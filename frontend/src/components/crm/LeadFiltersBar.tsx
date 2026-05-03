import { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Button,
  Divider,
} from '@mui/material'
import type { CrmStage, LeadFilters } from '../../api/crm'

const SOURCES = [
  'Meta Lead Form',
  'Organic Search',
  'Partner Referral',
  'Webinar',
  'Cold Outreach',
  'Direct',
  'Referral',
  'Event',
]

interface Props {
  filters: LeadFilters
  stages: CrmStage[]
  onApply: (next: LeadFilters) => void
  onCancel: () => void
  onClear: () => void
}

// Popover-shaped filter form. Owns a local draft so the user can compose a
// filter set and commit it with "Apply" (matches the wenext-style design).
// Search lives in the parent toolbar — not here.
export function LeadFiltersBar({
  filters,
  stages,
  onApply,
  onCancel,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<LeadFilters>(filters)

  // Resync when the popover reopens with potentially updated upstream filters
  // (e.g. after a "Reset all" elsewhere or a chip removal in the toolbar).
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const setKey =
    (key: keyof LeadFilters) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({
        ...d,
        [key]: e.target.value || undefined,
        page: 1,
      }))

  const hasDraftFilters = !!(
    draft.stage_id ||
    draft.source ||
    draft.follow_up_before
  )

  return (
    <Box sx={{ width: { xs: '90vw', sm: 360 }, p: 2.5 }}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Filters
        </Typography>
        <Button
          size="small"
          onClick={onClear}
          disabled={!hasDraftFilters}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: 'primary.main',
            '&:disabled': { color: 'text.disabled' },
          }}
        >
          Reset all
        </Button>
      </Stack>

      <Stack spacing={2}>
        <TextField
          select
          size="small"
          fullWidth
          label="Stage"
          value={draft.stage_id ?? ''}
          onChange={setKey('stage_id')}
        >
          <MenuItem value="">All stages</MenuItem>
          {stages.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: s.color,
                    flexShrink: 0,
                  }}
                />
                <span>{s.name}</span>
              </Stack>
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          fullWidth
          label="Source"
          value={draft.source ?? ''}
          onChange={setKey('source')}
        >
          <MenuItem value="">All sources</MenuItem>
          {SOURCES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          fullWidth
          type="date"
          label="Follow-up before"
          value={draft.follow_up_before ?? ''}
          onChange={setKey('follow_up_before')}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          select
          size="small"
          fullWidth
          label="Sort"
          value={draft.sort_by ?? 'created_at'}
          onChange={setKey('sort_by')}
        >
          <MenuItem value="created_at">Newest</MenuItem>
          <MenuItem value="name">Name A–Z</MenuItem>
          <MenuItem value="score">Score</MenuItem>
          <MenuItem value="follow_up_at">Follow-up</MenuItem>
        </TextField>
      </Stack>

      <Divider sx={{ my: 2.5 }} />

      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'flex-end' }}
      >
        <Button
          onClick={onCancel}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: 'text.secondary',
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onApply(draft)}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            px: 2.5,
          }}
        >
          Apply Filters
        </Button>
      </Stack>
    </Box>
  )
}
