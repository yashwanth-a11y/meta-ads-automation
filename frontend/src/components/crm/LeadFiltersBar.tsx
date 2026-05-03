import { Stack, TextField, MenuItem, Button, Chip, Box, InputAdornment, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import type { CrmStage, LeadFilters } from '../../api/crm'

const SOURCES = ['Meta Lead Form', 'Organic Search', 'Partner Referral', 'Webinar', 'Cold Outreach', 'Direct', 'Referral', 'Event']

interface Props {
  filters: LeadFilters
  stages: CrmStage[]
  onChange: (f: LeadFilters) => void
  onClear: () => void
}

export function LeadFiltersBar({ filters, stages, onChange, onClear }: Props) {
  const hasFilters = !!(filters.search || filters.stage_id || filters.source || filters.follow_up_before)
  const set = (key: keyof LeadFilters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...filters, [key]: e.target.value || undefined, page: 1 })

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <TextField
          placeholder="Search name, email, phone…" size="small" value={filters.search ?? ''}
          onChange={set('search')} sx={{ flex: '1 1 240px', minWidth: 200 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'text.disabled' }} /></InputAdornment> }}
        />

        <TextField select size="small" label="Stage" value={filters.stage_id ?? ''} onChange={set('stage_id')} sx={{ minWidth: 160, flex: '1 1 160px' }}>
          <MenuItem value="">All stages</MenuItem>
          {stages.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                <span>{s.name}</span>
              </Stack>
            </MenuItem>
          ))}
        </TextField>

        <TextField select size="small" label="Source" value={filters.source ?? ''} onChange={set('source')} sx={{ minWidth: 160, flex: '1 1 160px' }}>
          <MenuItem value="">All sources</MenuItem>
          {SOURCES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <TextField select size="small" label="Sort" value={filters.sort_by ?? 'created_at'} onChange={set('sort_by')} sx={{ minWidth: 140 }}>
          <MenuItem value="created_at">Newest</MenuItem>
          <MenuItem value="name">Name A–Z</MenuItem>
          <MenuItem value="score">Score</MenuItem>
          <MenuItem value="follow_up_at">Follow-up</MenuItem>
        </TextField>

        <Box sx={{ minWidth: 170 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: '0.72rem', ml: 0.5 }}>
            Follow-up before
          </Typography>
          <TextField
            size="small" type="date" fullWidth value={filters.follow_up_before ?? ''}
            onChange={set('follow_up_before')}
            inputProps={{ style: { fontSize: '0.85rem' } }}
          />
        </Box>

        {hasFilters && (
          <Button size="small" startIcon={<CloseIcon />} onClick={onClear}
            sx={{ color: 'text.secondary', height: 36, px: 1.5, '&:hover': { color: 'text.primary' } }}>
            Clear
          </Button>
        )}
      </Stack>

      {/* Active chips */}
      {hasFilters && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {filters.search && (
            <Chip label={`"${filters.search}"`} size="small"
              onDelete={() => onChange({ ...filters, search: undefined, page: 1 })}
              sx={{ height: 24, fontSize: '0.75rem', bgcolor: alpha('#6366F1', 0.1), color: '#6366F1', borderRadius: '6px' }} />
          )}
          {filters.stage_id && (
            <Chip label={stages.find((s) => s.id === filters.stage_id)?.name ?? 'Stage'} size="small"
              onDelete={() => onChange({ ...filters, stage_id: undefined, page: 1 })}
              sx={{ height: 24, fontSize: '0.75rem', bgcolor: alpha('#3B82F6', 0.1), color: '#3B82F6', borderRadius: '6px' }} />
          )}
          {filters.source && (
            <Chip label={filters.source} size="small"
              onDelete={() => onChange({ ...filters, source: undefined, page: 1 })}
              sx={{ height: 24, fontSize: '0.75rem', bgcolor: alpha('#10B981', 0.1), color: '#10B981', borderRadius: '6px' }} />
          )}
          {filters.follow_up_before && (
            <Chip label={`Before ${filters.follow_up_before}`} size="small"
              onDelete={() => onChange({ ...filters, follow_up_before: undefined, page: 1 })}
              sx={{ height: 24, fontSize: '0.75rem', bgcolor: alpha('#F59E0B', 0.1), color: '#F59E0B', borderRadius: '6px' }} />
          )}
        </Stack>
      )}
    </Stack>
  )
}
