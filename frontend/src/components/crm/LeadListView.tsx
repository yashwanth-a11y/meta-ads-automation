import {
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  LinearProgress,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
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
const pickColor = (seed: string) =>
  AVATAR_PALETTE[seed.charCodeAt(0) % AVATAR_PALETTE.length]

const MUTED = (
  <Typography variant="body2" color="text.disabled" component="span">
    —
  </Typography>
)

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: `1.5px solid ${alpha(color, 0.5)}`,
        bgcolor: alpha(color, 0.1),
        color,
        fontSize: '0.72rem',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {score}
    </Box>
  )
}

function FollowUpBadge({ date }: { date: string | null }) {
  if (!date) return MUTED
  const d = new Date(date)
  const overdue = d < new Date()
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const color = overdue ? '#EF4444' : '#F59E0B'
  return (
    <Tooltip title={overdue ? `Overdue · ${d.toLocaleDateString()}` : d.toLocaleDateString()}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.875,
          py: 0.25,
          borderRadius: '6px',
          fontSize: '0.7rem',
          fontWeight: 700,
          bgcolor: alpha(color, overdue ? 0.12 : 0.1),
          color,
          border: `1px solid ${alpha(color, overdue ? 0.3 : 0.25)}`,
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        }}
      >
        <CalendarTodayOutlinedIcon sx={{ fontSize: 12 }} />
        {label}
      </Box>
    </Tooltip>
  )
}

function OwnerCell({ email }: { email: string | null }) {
  if (!email) {
    return (
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: 'center', color: 'text.disabled' }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: alpha('#0f172a', 0.04),
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <PersonOutlineIcon sx={{ fontSize: 13 }} />
        </Box>
        <Typography variant="caption">Unassigned</Typography>
      </Stack>
    )
  }
  const handle = email.split('@')[0]
  const color = pickColor(handle)
  const initials = handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <Tooltip title={email}>
      <Stack direction="row" spacing={0.875} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: alpha(color, 0.15),
            color,
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.6rem',
            fontWeight: 800,
            border: `1.5px solid ${alpha(color, 0.3)}`,
            flexShrink: 0,
          }}
        >
          {initials}
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.8rem',
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {handle}
        </Typography>
      </Stack>
    </Tooltip>
  )
}

interface Props {
  leads: CrmLead[]
  stages: CrmStage[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  selected: string[]
  onSelectChange: (ids: string[]) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRowClick: (lead: CrmLead) => void
  onDelete: (id: string) => void
}

export function LeadListView({
  leads,
  stages,
  total,
  page,
  pageSize,
  loading,
  selected,
  onSelectChange,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  onDelete,
}: Props) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]))

  const allSelected = leads.length > 0 && selected.length === leads.length
  const someSelected = selected.length > 0 && selected.length < leads.length

  const toggleAll = () =>
    onSelectChange(allSelected ? [] : leads.map((l) => l.id))
  const toggleOne = (id: string) =>
    onSelectChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {loading && <LinearProgress sx={{ height: 2 }} />}

      <TableContainer sx={{ flex: 1 }}>
        <Table
          stickyHeader
          size="small"
          sx={{
            // Single source of truth for cell baseline alignment — keeps the
            // score circle, stage chip, and follow-up pill on the same line
            // even when one cell wraps.
            '& .MuiTableCell-root': {
              verticalAlign: 'middle',
              borderBottom: '1px solid',
              borderColor: 'divider',
              py: 1.25,
              px: 1.5,
              fontSize: '0.875rem',
            },
            '& .MuiTableCell-head': {
              fontWeight: 700,
              fontSize: '0.7rem',
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'text.secondary',
              bgcolor: 'background.paper',
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                <Checkbox
                  size="small"
                  indeterminate={someSelected}
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </TableCell>
              <TableCell sx={{ minWidth: 220 }}>Name</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Company</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Phone</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Stage</TableCell>
              <TableCell sx={{ minWidth: 140, maxWidth: 180 }}>Source</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Tags</TableCell>
              <TableCell align="center" sx={{ width: 76 }}>Score</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Follow-up</TableCell>
              <TableCell sx={{ minWidth: 150 }}>Owner</TableCell>
              <TableCell align="right" sx={{ width: 96 }} />
            </TableRow>
          </TableHead>

          <TableBody>
            {leads.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={11}
                  sx={{
                    py: 8,
                    textAlign: 'center',
                    color: 'text.secondary',
                    borderBottom: 'none',
                  }}
                >
                  <Stack
                    spacing={1}
                    sx={{ alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        border: '1.5px dashed',
                        borderColor: 'divider',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'text.disabled',
                      }}
                    >
                      <InboxOutlinedIcon />
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      No leads found
                    </Typography>
                    <Typography variant="caption">
                      Add your first lead or sync from Meta to get started.
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}

            {leads.map((lead) => {
              const stage = lead.stage_id ? stageMap[lead.stage_id] : null
              const isSelected = selected.includes(lead.id)
              const tags = (lead.tags as string[]) ?? []
              const visibleTags = tags.slice(0, 2)
              const hiddenCount = Math.max(0, tags.length - visibleTags.length)
              return (
                <TableRow
                  key={lead.id}
                  hover
                  selected={isSelected}
                  sx={{
                    cursor: 'pointer',
                    transition: 'background-color 120ms ease',
                    '&:hover': { bgcolor: alpha('#6366F1', 0.04) },
                    '&.Mui-selected': {
                      bgcolor: alpha('#6366F1', 0.06),
                      '&:hover': { bgcolor: alpha('#6366F1', 0.09) },
                    },
                    // Reveal action icons only on hover/selection — keeps the
                    // resting row visually clean.
                    '& .row-actions': { opacity: 0, transition: 'opacity 120ms ease' },
                    '&:hover .row-actions, &.Mui-selected .row-actions': {
                      opacity: 1,
                    },
                  }}
                >
                  <TableCell
                    padding="checkbox"
                    sx={{ pl: 1.5 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => toggleOne(lead.id)}
                    />
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lead.name}
                    </Typography>
                    {lead.email ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          fontSize: '0.72rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lead.email}
                      </Typography>
                    ) : null}
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: '0.85rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lead.company || (
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          —
                        </Box>
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: '0.85rem',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lead.phone || (
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          —
                        </Box>
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    {stage ? (
                      <Chip
                        size="small"
                        label={stage.name}
                        avatar={
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: stage.color,
                              ml: '6px !important',
                            }}
                          />
                        }
                        sx={{
                          height: 24,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          bgcolor: alpha(stage.color, 0.1),
                          color: stage.color,
                          border: `1px solid ${alpha(stage.color, 0.3)}`,
                          '& .MuiChip-avatar': {
                            width: 8,
                            height: 8,
                            mr: '-2px',
                          },
                          '& .MuiChip-label': { pl: 0.75, pr: 1 },
                        }}
                      />
                    ) : (
                      MUTED
                    )}
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: '0.85rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={lead.source ?? ''}
                    >
                      {lead.source || (
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          —
                        </Box>
                      )}
                    </Typography>
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    {tags.length === 0 ? (
                      MUTED
                    ) : (
                      <Stack
                        direction="row"
                        spacing={0.5}
                        useFlexGap
                        sx={{ flexWrap: 'nowrap', alignItems: 'center' }}
                      >
                        {visibleTags.map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: '5px',
                              bgcolor: alpha('#8B5CF6', 0.08),
                              color: '#7C3AED',
                              border: `1px solid ${alpha('#8B5CF6', 0.18)}`,
                            }}
                          />
                        ))}
                        {hiddenCount > 0 ? (
                          <Tooltip title={tags.slice(2).join(', ')}>
                            <Box
                              component="span"
                              sx={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: 'text.secondary',
                                px: 0.625,
                                py: 0.125,
                                borderRadius: '5px',
                                bgcolor: alpha('#0f172a', 0.05),
                                lineHeight: 1.6,
                              }}
                            >
                              +{hiddenCount}
                            </Box>
                          </Tooltip>
                        ) : null}
                      </Stack>
                    )}
                  </TableCell>

                  <TableCell align="center" onClick={() => onRowClick(lead)}>
                    <ScoreBadge score={lead.score} />
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <FollowUpBadge date={lead.follow_up_at} />
                  </TableCell>

                  <TableCell onClick={() => onRowClick(lead)}>
                    <OwnerCell email={lead.owner_email} />
                  </TableCell>

                  <TableCell
                    align="right"
                    onClick={(e) => e.stopPropagation()}
                    sx={{ pr: 1.5 }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.25}
                      className="row-actions"
                      sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
                    >
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => onRowClick(lead)}
                          sx={{
                            color: 'text.disabled',
                            '&:hover': {
                              color: '#6366F1',
                              bgcolor: alpha('#6366F1', 0.08),
                            },
                          }}
                        >
                          <EditNoteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => onDelete(lead.id)}
                          sx={{
                            color: 'text.disabled',
                            '&:hover': {
                              color: '#EF4444',
                              bgcolor: alpha('#EF4444', 0.08),
                            },
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page - 1}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[10, 25, 50, 100]}
        onPageChange={(_, p) => onPageChange(p + 1)}
        onRowsPerPageChange={(e) => onPageSizeChange(parseInt(e.target.value))}
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          '& .MuiToolbar-root': { minHeight: 48, px: 2 },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
            fontSize: '0.8rem',
            fontWeight: 500,
          },
        }}
      />
    </Box>
  )
}
