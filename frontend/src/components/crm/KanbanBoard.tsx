import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { Box, Stack, Typography, Chip, IconButton, Tooltip, Paper, Button } from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import CalendarTodayIcon from '@mui/icons-material/CalendarTodayOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import type { CrmLead, CrmStage } from '../../api/crm'

function LeadInitialAvatar({ name }: { name: string }) {
  const colors = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']
  const color = colors[name.charCodeAt(0) % colors.length]
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <Box sx={{
      width: 28, height: 28, borderRadius: '50%',
      bgcolor: alpha(color, 0.15), color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
      border: `1.5px solid ${alpha(color, 0.3)}`,
    }}>
      {initials}
    </Box>
  )
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <Box sx={{
      px: 1, py: 0.25, borderRadius: '20px',
      bgcolor: alpha(color, 0.1), color,
      fontSize: '0.68rem', fontWeight: 800,
      border: `1px solid ${alpha(color, 0.25)}`,
      lineHeight: 1.6,
    }}>
      {score}
    </Box>
  )
}

interface KanbanCardProps {
  lead: CrmLead
  index: number
  onClick: (lead: CrmLead) => void
}

function KanbanCard({ lead, index, onClick }: KanbanCardProps) {
  const overdue = lead.follow_up_at && new Date(lead.follow_up_at) < new Date()
  const followUpLabel = lead.follow_up_at
    ? new Date(lead.follow_up_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead)}
          elevation={snapshot.isDragging ? 4 : 0}
          sx={{
            p: 2, mb: 1.5, borderRadius: 2, cursor: 'pointer',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: snapshot.isDragging ? alpha('#6366F1', 0.5) : alpha('#000', 0.08),
            boxShadow: snapshot.isDragging
              ? `0 12px 24px ${alpha('#000', 0.1)}, 0 0 0 2px ${alpha('#6366F1', 0.3)}`
              : `0 1px 3px ${alpha('#000', 0.05)}`,
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${alpha('#000', 0.25)}`,
              borderColor: alpha('#6366F1', 0.3),
            },
          }}
        >
          <Stack spacing={1.5}>
            {/* Title row */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35, flex: 1, fontSize: '0.875rem' }}>
                {lead.name}
              </Typography>
              <ScorePill score={lead.score} />
            </Stack>

            {/* Company / Source */}
            {(lead.company || lead.source) && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                {lead.company ?? lead.source}
              </Typography>
            )}

            {/* Tags */}
            {(lead.tags as string[]).length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(lead.tags as string[]).slice(0, 2).map((tag) => (
                  <Chip key={tag} label={tag} size="small"
                    sx={{
                      height: 20, fontSize: '0.67rem', fontWeight: 600, borderRadius: '5px',
                      bgcolor: alpha('#8B5CF6', 0.1), color: '#8B5CF6',
                      border: `1px solid ${alpha('#8B5CF6', 0.2)}`,
                    }}
                  />
                ))}
              </Stack>
            )}

            {/* Footer row */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              {/* Owner avatar */}
              <Stack direction="row" alignItems="center" spacing={0.75}>
                {lead.owner_email ? (
                  <LeadInitialAvatar name={lead.owner_email.split('@')[0]} />
                ) : (
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    bgcolor: alpha('#000', 0.04),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PersonOutlineIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  </Box>
                )}
                {lead.owner_email && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {lead.owner_email.split('@')[0]}
                  </Typography>
                )}
              </Stack>

              {/* Follow-up date */}
              {followUpLabel && (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <CalendarTodayIcon sx={{ fontSize: 12, color: overdue ? '#EF4444' : 'text.disabled' }} />
                  <Typography variant="caption"
                    sx={{ fontSize: '0.7rem', fontWeight: 600, color: overdue ? '#EF4444' : 'text.secondary' }}>
                    {followUpLabel}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Paper>
      )}
    </Draggable>
  )
}

interface Props {
  stages: CrmStage[]
  leads: CrmLead[]
  onDrop: (leadId: string, toStageId: string) => void
  onCardClick: (lead: CrmLead) => void
  onAddInStage: (stageId: string) => void
}

export function KanbanBoard({ stages, leads, onDrop, onCardClick, onAddInStage }: Props) {
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
    if (destination.droppableId === source.droppableId && destination.index === source.index) return
    onDrop(draggableId, destination.droppableId)
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box sx={{ display: 'flex', gap: 2.5, overflowX: 'auto', pb: 2, alignItems: 'flex-start' }}>
        {stages.map((stage) => {
          const stageLeads = byStage[stage.id] ?? []
          return (
            <Box key={stage.id} sx={{ 
              minWidth: 280, maxWidth: 300, flex: '0 0 290px',
              bgcolor: alpha('#000', 0.02),
              borderRadius: 3, p: 1.5,
              display: 'flex', flexDirection: 'column',
              maxHeight: '100%',
            }}>

              {/* Column header */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, px: 0.5, flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box sx={{
                    width: 10, height: 10, borderRadius: '50%',
                    bgcolor: stage.color, flexShrink: 0,
                    boxShadow: `0 0 0 3px ${alpha(stage.color, 0.2)}`,
                  }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {stage.name || 'Unnamed Stage'}
                  </Typography>
                  <Box sx={{
                    px: 1, py: 0.1, borderRadius: '20px', minWidth: 22, textAlign: 'center',
                    bgcolor: alpha(stage.color, 0.12), color: stage.color,
                    fontSize: '0.72rem', fontWeight: 800,
                  }}>
                    {stageLeads.length}
                  </Box>
                </Stack>
                <Tooltip title={`Add lead in ${stage.name}`}>
                  <IconButton size="small" onClick={() => onAddInStage(stage.id)}
                    sx={{ color: 'text.disabled', '&:hover': { color: stage.color, bgcolor: alpha(stage.color, 0.08) } }}>
                    <AddIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Drop zone (Scrollable) */}
              <Box sx={{ 
                flex: 1, overflowY: 'auto', minHeight: 60, mx: -0.5, px: 0.5,
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-thumb': { bgcolor: alpha('#000', 0.1), borderRadius: 2 },
              }}>
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      sx={{
                        minHeight: '100%', borderRadius: 2.5,
                        transition: 'background 0.15s ease',
                        bgcolor: snapshot.isDraggingOver ? alpha(stage.color, 0.05) : 'transparent',
                        border: '2px dashed',
                        borderColor: snapshot.isDraggingOver ? alpha(stage.color, 0.35) : 'transparent',
                      }}
                    >
                      {stageLeads.map((lead, idx) => (
                        <KanbanCard key={lead.id} lead={lead} index={idx} onClick={onCardClick} />
                      ))}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Box>

              {/* Add button at bottom */}
              <Button
                fullWidth size="small" startIcon={<AddIcon />}
                onClick={() => onAddInStage(stage.id)}
                sx={{
                  mt: 1.5, color: 'text.disabled', justifyContent: 'flex-start',
                  borderRadius: 2, height: 36, fontSize: '0.8rem', flexShrink: 0,
                  '&:hover': { color: stage.color, bgcolor: alpha(stage.color, 0.06) },
                }}
              >
                Add lead
              </Button>
            </Box>
          )
        })}
      </Box>
    </DragDropContext>
  )
}
