import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import {
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Button,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import type { CrmLead, CrmStage } from '../../api/crm'

const AVATAR_PALETTE = [
  '#6366F1',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
]

function pickColor(seed: string) {
  return AVATAR_PALETTE[seed.charCodeAt(0) % AVATAR_PALETTE.length]
}

function LeadInitialAvatar({ name }: { name: string }) {
  const color = pickColor(name)
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <Box
      sx={{
        width: 24,
        height: 24,
        // borderRadius: '50%',
        bgcolor: alpha(color, 0.15),
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.62rem',
        fontWeight: 800,
        flexShrink: 0,
        border: `1.5px solid ${alpha(color, 0.3)}`,
      }}
    >
      {initials}
    </Box>
  )
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <Tooltip title={`Lead score: ${score}`}>
      <Box
        sx={{
          minWidth: 30,
          textAlign: 'center',
          px: 0.75,
          py: 0.125,
          // borderRadius: '999px',
          bgcolor: alpha(color, 0.12),
          color,
          fontSize: '0.68rem',
          fontWeight: 800,
          border: `1px solid ${alpha(color, 0.25)}`,
          lineHeight: 1.6,
          flexShrink: 0,
        }}
      >
        {score}
      </Box>
    </Tooltip>
  )
}

interface KanbanCardProps {
  lead: CrmLead
  index: number
  stageColor: string
  onClick: (lead: CrmLead) => void
}

function KanbanCard({ lead, index, stageColor, onClick }: KanbanCardProps) {
  const followUpDate = lead.follow_up_at ? new Date(lead.follow_up_at) : null
  const overdue = !!followUpDate && followUpDate < new Date()
  const followUpLabel = followUpDate
    ? followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  const tags = (lead.tags as string[]) ?? []
  const visibleTags = tags.slice(0, 2)
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length)
  const ownerLabel = lead.owner_email ? lead.owner_email.split('@')[0] : null
  const subtitle = [lead.company, lead.source].filter(Boolean).join(' · ')

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead)}
          elevation={0}
          sx={{
            position: 'relative',
            mb: 1,
            // borderRadius: 2,
            cursor: 'pointer',
            // Soft wash of the stage color so each card visually belongs to
            // its column at a glance. Keep alpha low (~6%) so text contrast
            // stays comfortable on every palette color.
            // bgcolor: alpha(stageColor, 0.06),
            border: '1px solid',
            borderColor: snapshot.isDragging
              ? alpha(stageColor, 0.55)
              : alpha(stageColor, 0.18),
            boxShadow: snapshot.isDragging
              ? `0 18px 36px ${alpha('#0f172a', 0.18)}, 0 0 0 1px ${alpha(stageColor, 0.4)}`
              : `0 1px 2px ${alpha('#0f172a', 0.04)}`,
            transform: snapshot.isDragging ? 'rotate(-1.2deg)' : 'none',
            transition:
              'background-color 180ms ease, box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
            overflow: 'hidden',
            '&:hover': {
              bgcolor: alpha(stageColor, 0.1),
              boxShadow: `0 6px 18px ${alpha('#0f172a', 0.08)}`,
              borderColor: alpha(stageColor, 0.4),
            },
            // Left accent stripe — anchors the card to its column color.
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              bgcolor: stageColor,
              opacity: 0.85,
            },
          }}
        >
          <Stack spacing={1.25} sx={{ p: 1.75, pl: 2 }}>
            {/* Title + score */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  lineHeight: 1.35,
                  flex: 1,
                  // Cap the title at two lines without truncating the score.
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {lead.name}
              </Typography>
              <ScorePill score={lead.score} />
            </Stack>

            {subtitle ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: '0.74rem',
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {subtitle}
              </Typography>
            ) : null}

            {tags.length > 0 ? (
              <Stack
                direction="row"
                spacing={0.5}
                useFlexGap
                sx={{ flexWrap: 'wrap' }}
              >
                {visibleTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      height: 20,
                      px: 0.25,
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      borderRadius: '5px',
                      bgcolor: alpha('#8B5CF6', 0.08),
                      color: '#7C3AED',
                      border: `1px solid ${alpha('#8B5CF6', 0.18)}`,
                    }}
                  />
                ))}
                {hiddenTagCount > 0 ? (
                  <Chip
                    label={`+${hiddenTagCount}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      borderRadius: '5px',
                      bgcolor: alpha('#0f172a', 0.05),
                      color: 'text.secondary',
                    }}
                  />
                ) : null}
              </Stack>
            ) : null}

            {/* Footer */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}
            >
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', minWidth: 0 }}
              >
                {ownerLabel ? (
                  <LeadInitialAvatar name={ownerLabel} />
                ) : (
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      bgcolor: alpha('#0f172a', 0.04),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <PersonOutlineIcon
                      sx={{ fontSize: 13, color: 'text.disabled' }}
                    />
                  </Box>
                )}
                {ownerLabel ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ownerLabel}
                  </Typography>
                ) : (
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.7rem', color: 'text.disabled' }}
                  >
                    Unassigned
                  </Typography>
                )}
              </Stack>

              {followUpLabel ? (
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.75,
                    py: 0.125,
                    borderRadius: '6px',
                    bgcolor: overdue
                      ? alpha('#EF4444', 0.1)
                      : alpha('#0f172a', 0.04),
                    color: overdue ? '#EF4444' : 'text.secondary',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                >
                  <CalendarTodayOutlinedIcon sx={{ fontSize: 11 }} />
                  {followUpLabel}
                  {overdue ? ' · overdue' : ''}
                </Box>
              ) : null}
            </Stack>
          </Stack>
        </Paper>
      )}
    </Draggable>
  )
}

interface ColumnEmptyStateProps {
  stageColor: string
  onAdd: () => void
}

function ColumnEmptyState({ stageColor, onAdd }: ColumnEmptyStateProps) {
  return (
    <Box
      onClick={onAdd}
      sx={{
        py: 4,
        px: 1.5,
        borderRadius: 2,
        border: '1.5px dashed',
        borderColor: alpha('#0f172a', 0.12),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        color: 'text.disabled',
        cursor: 'pointer',
        transition: 'border-color 160ms ease, background-color 160ms ease',
        '&:hover': {
          borderColor: alpha(stageColor, 0.4),
          bgcolor: alpha(stageColor, 0.04),
          color: stageColor,
        },
      }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 22 }} />
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        No leads here
      </Typography>
      <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
        Drag a card or click to add
      </Typography>
    </Box>
  )
}

interface Props {
  stages: CrmStage[]
  leads: CrmLead[]
  onDrop: (leadId: string, toStageId: string) => void
  onCardClick: (lead: CrmLead) => void
  onAddInStage: (stageId: string) => void
}

export function KanbanBoard({
  stages,
  leads,
  onDrop,
  onCardClick,
  onAddInStage,
}: Props) {
  const byStage: Record<string, CrmLead[]> = {}
  for (const s of stages) byStage[s.id] = []
  for (const lead of leads) {
    if (lead.stage_id && byStage[lead.stage_id]) {
      byStage[lead.stage_id].push(lead)
    }
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination, source } = result
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return
    onDrop(draggableId, destination.droppableId)
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 1,
          alignItems: 'stretch',
          minHeight: '100%',
        }}
      >
        {stages.map((stage) => {
          const stageLeads = byStage[stage.id] ?? []
          const stageColor = stage.color || '#6366F1'
          return (
            <Paper
              key={stage.id}
              elevation={0}
              sx={{
                position: 'relative',
                width: 308,
                minWidth: 308,
                flex: '0 0 308px',
                // Light wash of the stage color so the whole column reads as
                // its stage at a glance. Kept lower than the card alpha (6%)
                // so cards still sit visibly above the column.
                bgcolor: alpha(stageColor, 0.04),
                border: '1px solid',
                borderColor: alpha(stageColor, 0.15),
                // borderRadius: 2.5,
                pt: 1.25,
                pb: 1.25,
                px: 1.25,
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '100%',
                overflow: 'hidden',
              }}
            >
              {/* Top color accent ribbon — column identity at a glance */}
              {/* <Box
              // sx={{
              //   position: 'absolute',
              //   top: 0,
              //   left: 0,
              //   right: 0,
              //   height: 3,
              //   bgcolor: stageColor,
              // }}
              /> */}

              {/* Header */}
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                  px: 0.5,
                  flexShrink: 0,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', minWidth: 0 }}
                >
                  <Box
                    sx={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      bgcolor: stageColor,
                      flexShrink: 0,
                      boxShadow: `0 0 0 3px ${alpha(stageColor, 0.2)}`,
                    }}
                  />
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.825rem',
                      letterSpacing: 0.2,
                      textTransform: 'uppercase',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {stage.name || 'Unnamed'}
                  </Typography>
                  <Box
                    sx={{
                      px: 0.875,
                      py: 0.125,
                      borderRadius: '999px',
                      minWidth: 22,
                      textAlign: 'center',
                      bgcolor: alpha(stageColor, 0.14),
                      color: stageColor,
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {stageLeads.length}
                  </Box>
                </Stack>
                <Tooltip title={`Add lead in ${stage.name}`}>
                  <IconButton
                    size="small"
                    onClick={() => onAddInStage(stage.id)}
                    sx={{
                      width: 26,
                      height: 26,
                      color: 'text.disabled',
                      '&:hover': {
                        color: stageColor,
                        bgcolor: alpha(stageColor, 0.1),
                      },
                    }}
                  >
                    <AddIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Drop zone (scrollable) */}
              <Box
                sx={{
                  flex: 1,
                  minHeight: 80,
                  overflowY: 'auto',
                  mx: -0.5,
                  px: 0.5,
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': {
                    bgcolor: alpha('#0f172a', 0.12),
                    borderRadius: 2,
                  },
                }}
              >
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      sx={{
                        minHeight: '100%',
                        borderRadius: 2,
                        p: 0.5,
                        m: -0.5,
                        transition: 'background-color 160ms ease',
                        // Bumped from 0.07 → 0.12 because the column already
                        // sits at ~4% — the previous value blended in.
                        bgcolor: snapshot.isDraggingOver
                          ? alpha(stageColor, 0.12)
                          : 'transparent',
                        outline: snapshot.isDraggingOver
                          ? `1.5px dashed ${alpha(stageColor, 0.45)}`
                          : 'none',
                        outlineOffset: -2,
                      }}
                    >
                      {stageLeads.length === 0 && !snapshot.isDraggingOver ? (
                        <ColumnEmptyState
                          stageColor={stageColor}
                          onAdd={() => onAddInStage(stage.id)}
                        />
                      ) : (
                        stageLeads.map((lead, idx) => (
                          <KanbanCard
                            key={lead.id}
                            lead={lead}
                            index={idx}
                            stageColor={stageColor}
                            onClick={onCardClick}
                          />
                        ))
                      )}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Box>

              {/* Add at bottom */}
              <Button
                fullWidth
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => onAddInStage(stage.id)}
                sx={{
                  mt: 1,
                  height: 34,
                  justifyContent: 'flex-start',
                  px: 1.25,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'text.disabled',
                  flexShrink: 0,
                  '&:hover': {
                    color: stageColor,
                    bgcolor: alpha(stageColor, 0.08),
                  },
                }}
              >
                Add lead
              </Button>
            </Paper>
          )
        })}
      </Box>
    </DragDropContext>
  )
}
