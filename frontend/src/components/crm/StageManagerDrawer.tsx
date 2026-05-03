import { useEffect, useState } from 'react'
import {
  Drawer,
  Box,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Chip,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CheckIcon from '@mui/icons-material/Check'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { crmApi } from '../../api/crm'
import type { CrmStage } from '../../api/crm'
import { qk } from '../../api/queryClient'

const PRESET_COLORS = [
  '#6366F1',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6B7280',
]

type Terminal = 'open' | 'win' | 'loss'

function terminalOf(stage: CrmStage): Terminal {
  if (stage.is_terminal_win) return 'win'
  if (stage.is_terminal_loss) return 'loss'
  return 'open'
}

const TERMINAL_COLOR: Record<Terminal, string> = {
  open: '#6B7280',
  win: '#10B981',
  loss: '#EF4444',
}

const TERMINAL_LABEL: Record<Terminal, string> = {
  open: 'Open',
  win: 'Win',
  loss: 'Loss',
}

function ColorSwatchRow({
  value,
  onChange,
  size = 22,
}: {
  value: string
  onChange: (color: string) => void
  size?: number
}) {
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
      {PRESET_COLORS.map((c) => {
        const selected = value === c
        return (
          <Box
            key={c}
            role="button"
            aria-label={`Pick color ${c}`}
            onClick={() => onChange(c)}
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: c,
              cursor: 'pointer',
              boxSizing: 'border-box',
              border: selected
                ? `2.5px solid ${alpha('#0f172a', 0.05)}`
                : '2.5px solid transparent',
              outline: selected ? `2px solid ${c}` : 'none',
              transition: 'transform 120ms ease',
              '&:hover': { transform: 'scale(1.08)' },
            }}
          />
        )
      })}
    </Stack>
  )
}

interface StageRowProps {
  stage: CrmStage
  onUpdate: (id: string, patch: Partial<CrmStage>) => void
  onDelete: (id: string) => void
  updatePending: boolean
}

function StageRow({ stage, onUpdate, onDelete, updatePending }: StageRowProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(stage.name)
  const [draftColor, setDraftColor] = useState(stage.color)

  // Re-sync drafts whenever the row exits edit mode or the stage changes
  // upstream — without this, switching rows keeps stale drafts.
  useEffect(() => {
    if (!editing) {
      setDraftName(stage.name)
      setDraftColor(stage.color)
    }
  }, [editing, stage.name, stage.color])

  const term = terminalOf(stage)
  const trimmedName = draftName.trim()
  const dirty =
    editing && (trimmedName !== stage.name || draftColor !== stage.color)
  const canSave = editing && trimmedName.length > 0 && dirty

  const save = () => {
    if (!canSave) return
    onUpdate(stage.id, { name: trimmedName, color: draftColor })
    setEditing(false)
  }

  const cancel = () => {
    setDraftName(stage.name)
    setDraftColor(stage.color)
    setEditing(false)
  }

  const handleTerminalChange = (
    _: React.MouseEvent<HTMLElement>,
    next: Terminal | null,
  ) => {
    if (!next || next === term) return
    onUpdate(stage.id, {
      is_terminal_win: next === 'win',
      is_terminal_loss: next === 'loss',
    })
  }

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete stage "${stage.name}"? Leads in this stage will become unassigned.`,
      )
    ) {
      return
    }
    onDelete(stage.id)
  }

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: '8px',
        border: '1px solid',
        borderColor: editing ? alpha(stage.color, 0.45) : 'divider',
        bgcolor: 'background.paper',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        '&:hover .row-actions': { opacity: 1 },
        // '&::before': {
        //   content: '""',
        //   position: 'absolute',
        //   left: 0,
        //   top: 0,
        //   bottom: 0,
        //   width: 3,
        //   borderTopLeftRadius: 8,
        //   borderBottomLeftRadius: 8,
        //   bgcolor: stage.color,
        //   opacity: editing ? 1 : 0.7,
        // },
      }}
    >
      {/* Top row */}
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          alignItems: 'center',
          px: 1.75,
          py: 1.25,
          minHeight: 56,
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: editing ? draftColor : stage.color,
            flexShrink: 0,
            boxShadow: `0 0 0 3px ${alpha(editing ? draftColor : stage.color, 0.2)}`,
          }}
        />

        {editing ? (
          <TextField
            size="small"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
            placeholder="Stage name"
            sx={{ flex: 1 }}
            autoFocus
          />
        ) : (
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'text',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {stage.name}
          </Typography>
        )}

        {!editing && (
          <Chip
            label={TERMINAL_LABEL[term]}
            size="small"
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: '6px',
              bgcolor: alpha(TERMINAL_COLOR[term], 0.12),
              color: TERMINAL_COLOR[term],
              border: `1px solid ${alpha(TERMINAL_COLOR[term], 0.25)}`,
            }}
          />
        )}

        <Stack
          className="row-actions"
          direction="row"
          spacing={0.25}
          sx={{
            alignItems: 'center',
            opacity: editing ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        >
          {editing ? (
            <>
              <Tooltip title="Discard changes">
                <IconButton
                  size="small"
                  onClick={cancel}
                  sx={{ color: 'text.secondary' }}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={canSave ? 'Save changes' : 'No changes to save'}>
                <span>
                  <IconButton
                    size="small"
                    onClick={save}
                    disabled={!canSave || updatePending}
                    sx={{
                      color: canSave ? '#10B981' : 'text.disabled',
                      '&:hover': { bgcolor: alpha('#10B981', 0.08) },
                    }}
                  >
                    <CheckIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="Rename">
                <IconButton
                  // size="small"
                  onClick={() => setEditing(true)}
                  sx={{
                    color: 'text.secondary',
                    fontSize: '10px !important',
                    fontWeight: '500',
                    letterSpacing: '0.1rem',
                    whiteSpace: 'nowrap',
                    borderRadius: "0px",
                    textTransform: "uppercase",
                    // padding:"8px 20px",
                    height: "unset !important",
                    borderRight: '1px solid #eee',
                    paddingRight: '10px',
                    minHeight: "unset !important",
                    ':hover': {
                      bgcolor: 'transparent',
                      color: "#4A90E2",
                    }
                  }}
                >
                  EDIT
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete stage">
                <IconButton
                  size="small"
                  onClick={handleDelete}
                  sx={{
                    color: 'text.secondary',
                    fontSize: '10px !important',
                    fontWeight: '500',
                    letterSpacing: '0.1rem',
                    whiteSpace: 'nowrap',
                    borderRadius: "0px",
                    textTransform: "uppercase",
                    padding: "0 0 0 10px",
                    height: "unset !important",
                    minHeight: "unset !important",
                    '&:hover': {
                      color: '#EF4444',
                      bgcolor: 'transparent'
                      // bgcolor: alpha('#EF4444', 0.08),
                    },
                  }}
                >
                  DELETE
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </Stack>

      {/* Editor — color swatches + terminal segmented control */}
      {editing && (
        <Box
          sx={{
            px: 1.75,
            pb: 1.5,
            pt: 0.25,
            borderTop: '1px dashed',
            borderColor: 'divider',
            mt: 0.5,
          }}
        >
          <Stack spacing={1.25}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.75,
                }}
              >
                COLOR
              </Typography>
              <ColorSwatchRow
                value={draftColor}
                onChange={setDraftColor}
                size={22}
              />
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.75,
                }}
              >
                STATUS
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={term}
                onChange={handleTerminalChange}
                sx={{
                  height: 30,
                  '& .MuiToggleButton-root': {
                    px: 1.5,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                  },
                }}
              >
                <ToggleButton value="open">Open</ToggleButton>
                <ToggleButton
                  value="win"
                  sx={{
                    '&.Mui-selected': {
                      color: '#10B981',
                      bgcolor: alpha('#10B981', 0.1),
                      borderColor: alpha('#10B981', 0.3),
                    },
                  }}
                >
                  Win
                </ToggleButton>
                <ToggleButton
                  value="loss"
                  sx={{
                    '&.Mui-selected': {
                      color: '#EF4444',
                      bgcolor: alpha('#EF4444', 0.1),
                      borderColor: alpha('#EF4444', 0.3),
                    },
                  }}
                >
                  Loss
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>
        </Box>
      )}
    </Paper>
  )
}

interface AddStageCardProps {
  pending: boolean
  onAdd: (data: { name: string; color: string }) => void
}

function AddStageCard({ pending, onAdd }: AddStageCardProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  const trimmed = name.trim()
  const canAdd = trimmed.length > 0 && !pending

  const submit = () => {
    if (!canAdd) return
    onAdd({ name: trimmed, color })
    setName('')
    setColor(PRESET_COLORS[0])
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'divider',
        bgcolor: alpha('#0f172a', 0.02),
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            color: 'text.secondary',
            bgcolor: alpha('#0f172a', 0.05),
          }}
        >
          <AddIcon sx={{ fontSize: 15 }} />
        </Box>
        <Typography
          variant="overline"
          sx={{
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1,
            color: 'text.secondary',
          }}
        >
          New stage
        </Typography>
      </Stack>

      <Stack spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdd) submit()
          }}
          placeholder="e.g. Discovery, Negotiation, Closed Won"
        />
        <ColorSwatchRow value={color} onChange={setColor} size={24} />
        <Button
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          disabled={!canAdd}
          onClick={submit}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            fontWeight: 700,
            px: 2,
          }}
        >
          {pending ? 'Adding…' : 'Add stage'}
        </Button>
      </Stack>
    </Paper>
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

  const createMutation = useMutation({
    mutationFn: (data: Partial<CrmStage>) => crmApi.createStage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.crmStages })
      onChanged()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CrmStage> }) =>
      crmApi.updateStage(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.crmStages })
      onChanged()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmApi.deleteStage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.crmStages })
      onChanged()
    },
  })

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100vw', sm: 520 },
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: "0px",
          },
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2.5,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', minWidth: 0 }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: alpha('#6366F1', 0.1),
                  color: '#6366F1',
                  flexShrink: 0,
                }}
              >
                <AccountTreeOutlinedIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, lineHeight: 1.2 }}
                >
                  Pipeline stages
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Create, rename, and mark Win/Loss stages.
                </Typography>
              </Box>
            </Stack>
            <IconButton size="small" onClick={onClose} aria-label="Close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {/* Body */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2.5,
            py: 2.5,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha('#0f172a', 0.12),
              borderRadius: 3,
            },
          }}
        >
          <AddStageCard
            pending={createMutation.isPending}
            onAdd={(data) => createMutation.mutate(data)}
          />

          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', mt: 3, mb: 1.25 }}
          >
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: 1,
                color: 'text.secondary',
              }}
            >
              Pipeline
            </Typography>
            <Box
              sx={{
                px: 0.875,
                py: 0.125,
                borderRadius: '6px',
                bgcolor: alpha('#0f172a', 0.06),
                color: 'text.secondary',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1.6,
              }}
            >
              {stages.length}
            </Box>
          </Stack>

          {stages.length === 0 ? (
            <Box
              sx={{
                py: 6,
                px: 2,
                textAlign: 'center',
                borderRadius: 2,
                border: '1.5px dashed',
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              <AccountTreeOutlinedIcon
                sx={{ fontSize: 28, color: 'text.disabled', mb: 1 }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                No stages yet
              </Typography>
              <Typography variant="caption">
                Add your first pipeline stage above to get started.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1}>
              {stages.map((s) => (
                <StageRow
                  key={s.id}
                  stage={s}
                  onUpdate={(id, patch) => updateMutation.mutate({ id, patch })}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  updatePending={updateMutation.isPending}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}
