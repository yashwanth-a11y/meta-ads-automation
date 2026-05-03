import { Stack, Button, Typography, Chip, MenuItem, Select } from '@mui/material'
import { alpha } from '@mui/material/styles'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import MoveDownIcon from '@mui/icons-material/MoveDown'
import DownloadIcon from '@mui/icons-material/Download'
import type { CrmStage } from '../../api/crm'

interface Props {
  selectedCount: number
  stages: CrmStage[]
  onBulkStage: (stageId: string) => void
  onBulkDelete: () => void
  onClear: () => void
}

export function BulkActionsBar({ selectedCount, stages, onBulkStage, onBulkDelete, onClear }: Props) {
  if (selectedCount === 0) return null

  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{
      p: 1.5, px: 2.5, borderRadius: 2,
      bgcolor: alpha('#6366F1', 0.08), border: `1px solid ${alpha('#6366F1', 0.2)}`,
    }}>
      <Chip label={`${selectedCount} selected`} size="small"
        sx={{ fontWeight: 700, bgcolor: alpha('#6366F1', 0.15), color: '#6366F1', borderRadius: '6px' }} />

      <Stack direction="row" alignItems="center" spacing={1}>
        <MoveDownIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Move to:</Typography>
        <Select
          size="small" displayEmpty defaultValue=""
          onChange={(e) => { if (e.target.value) onBulkStage(e.target.value as string) }}
          sx={{ minWidth: 140, height: 28, fontSize: '0.8rem' }}
        >
          <MenuItem value="" disabled>Select stage</MenuItem>
          {stages.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </Select>
      </Stack>

      <Button size="small" startIcon={<DeleteOutlineIcon />} color="error"
        onClick={onBulkDelete} sx={{ ml: 'auto' }}>
        Delete selected
      </Button>
      <Button size="small" onClick={onClear} sx={{ color: 'text.secondary' }}>
        Deselect
      </Button>
    </Stack>
  )
}
