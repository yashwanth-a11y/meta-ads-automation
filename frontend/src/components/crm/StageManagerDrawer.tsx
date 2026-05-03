import { useState } from 'react'
import {
  Drawer, Box, Stack, Typography, IconButton, TextField, Button,
  Divider, Chip, Tooltip, CircularProgress,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import CheckIcon from '@mui/icons-material/Check'
import ClearIcon from '@mui/icons-material/Clear'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { crmApi } from '../../api/crm'
import type { CrmStage } from '../../api/crm'
import { qk } from '../../api/queryClient'

const PRESET_COLORS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6B7280',
]

interface StageRowProps {
  stage: CrmStage
  onUpdate: (id: string, patch: Partial<CrmStage>) => void
  onDelete: (id: string) => void
}

function StageRow({ stage, onUpdate, onDelete }: StageRowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)

  const save = () => {
    onUpdate(stage.id, { name, color })
    setEditing(false)
  }

  return (
    <Box sx={{
      p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
      bgcolor: alpha('#FFFFFF', 0.03),
    }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <DragIndicatorIcon sx={{ color: 'text.disabled', cursor: 'grab', fontSize: 18 }} />
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: stage.color, flexShrink: 0 }} />

        {editing ? (
          <TextField size="small" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            sx={{ flex: 1 }} autoFocus />
        ) : (
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setEditing(true)}>
            {stage.name}
          </Typography>
        )}

        <Stack direction="row" spacing={0.5}>
          {stage.is_terminal_win && (
            <Chip label="Win" size="small"
              sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha('#10B981', 0.12), color: '#10B981', borderRadius: '5px' }} />
          )}
          {stage.is_terminal_loss && (
            <Chip label="Loss" size="small"
              sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha('#EF4444', 0.12), color: '#EF4444', borderRadius: '5px' }} />
          )}
        </Stack>

        {editing && (
          <IconButton size="small" onClick={save} sx={{ color: '#10B981' }}><CheckIcon fontSize="small" /></IconButton>
        )}
        <Tooltip title="Toggle Win terminal">
          <IconButton size="small"
            onClick={() => onUpdate(stage.id, { is_terminal_win: !stage.is_terminal_win, is_terminal_loss: false })}
            sx={{ color: stage.is_terminal_win ? '#10B981' : 'text.disabled' }}>
            <CheckIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Toggle Loss terminal">
          <IconButton size="small"
            onClick={() => onUpdate(stage.id, { is_terminal_loss: !stage.is_terminal_loss, is_terminal_win: false })}
            sx={{ color: stage.is_terminal_loss ? '#EF4444' : 'text.disabled' }}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete stage">
          <IconButton size="small" onClick={() => onDelete(stage.id)}
            sx={{ color: 'text.disabled', '&:hover': { color: '#EF4444' } }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {editing && (
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.5, pl: 3 }}>
          {PRESET_COLORS.map((c) => (
            <Box key={c} onClick={() => setColor(c)}
              sx={{
                width: 20, height: 20, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                border: color === c ? `2px solid white` : '2px solid transparent',
                outline: color === c ? `2px solid ${c}` : 'none',
                transition: 'all 0.1s',
              }} />
          ))}
        </Stack>
      )}
    </Box>
  )
}

interface Props {
  open: boolean
  stages: CrmStage[]
  onClose: () => void
  onChanged: () => void
}

export function StageManagerDrawer({ open, stages, onClose, onChanged }: Props) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')

  const createMutation = useMutation({
    mutationFn: (data: Partial<CrmStage>) => crmApi.createStage(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.crmStages }); setNewName(''); onChanged() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CrmStage> }) => crmApi.updateStage(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.crmStages }); onChanged() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmApi.deleteStage(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.crmStages }); onChanged() },
  })

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100vw', sm: 420 }, bgcolor: 'background.paper', backgroundImage: 'none' } }}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Pipeline Stages</Typography>
              <Typography variant="caption" color="text.secondary">
                Create, rename, reorder, and mark Win/Loss stages
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
          <Stack spacing={1}>
            {stages.map((s) => (
              <StageRow key={s.id} stage={s}
                onUpdate={(id, patch) => updateMutation.mutate({ id, patch })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          {/* Add new stage */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Add New Stage</Typography>
          <Stack spacing={1.5}>
            <TextField label="Stage name" size="small" fullWidth value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMutation.mutate({ name: newName.trim(), color: newColor }) }}
            />
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {PRESET_COLORS.map((c) => (
                <Box key={c} onClick={() => setNewColor(c)}
                  sx={{
                    width: 22, height: 22, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                    border: newColor === c ? '2px solid white' : '2px solid transparent',
                    outline: newColor === c ? `2px solid ${c}` : 'none',
                    transition: 'all 0.1s',
                  }} />
              ))}
            </Stack>
            <Button
              variant="contained" startIcon={<AddIcon />}
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), color: newColor })}
            >
              {createMutation.isPending ? 'Adding…' : 'Add Stage'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  )
}
