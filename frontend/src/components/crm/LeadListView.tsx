import {
  Box, Stack, Typography, Chip, IconButton, Tooltip, Checkbox,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, LinearProgress, Badge,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import type { CrmLead, CrmStage } from '../../api/crm'

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 38, height: 38, borderRadius: '50%',
      border: `2px solid ${alpha(color, 0.5)}`,
      bgcolor: alpha(color, 0.1), color,
      fontSize: '0.7rem', fontWeight: 800,
    }}>
      {score}
    </Box>
  )
}

function FollowUpBadge({ date }: { date: string | null }) {
  if (!date) return null
  const d = new Date(date)
  const now = new Date()
  const overdue = d < now
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <Chip
      label={label} size="small"
      sx={{
        height: 20, fontSize: '0.7rem', fontWeight: 600, borderRadius: '6px',
        bgcolor: overdue ? alpha('#EF4444', 0.15) : alpha('#F59E0B', 0.1),
        color: overdue ? '#EF4444' : '#F59E0B',
        border: `1px solid ${overdue ? alpha('#EF4444', 0.3) : alpha('#F59E0B', 0.25)}`,
      }}
    />
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
  leads, stages, total, page, pageSize, loading,
  selected, onSelectChange, onPageChange, onPageSizeChange,
  onRowClick, onDelete,
}: Props) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]))

  const toggleAll = () => {
    onSelectChange(selected.length === leads.length ? [] : leads.map((l) => l.id))
  }
  const toggleOne = (id: string) => {
    onSelectChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <Box>
      {loading && <LinearProgress sx={{ borderRadius: 1 }} />}
      <TableContainer>
        <Table size="medium">
          <TableHead>
            <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 700, fontSize: '0.78rem', py: 1.5, color: 'text.secondary', letterSpacing: 0.3 } }}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small" indeterminate={selected.length > 0 && selected.length < leads.length}
                  checked={leads.length > 0 && selected.length === leads.length}
                  onChange={toggleAll}
                />
              </TableCell>
              <TableCell sx={{ minWidth: 180 }}>Name</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Company</TableCell>
              <TableCell sx={{ minWidth: 130 }}>Phone</TableCell>
              <TableCell sx={{ minWidth: 130 }}>Stage</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Source</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Tags</TableCell>
              <TableCell align="center" sx={{ minWidth: 70 }}>Score</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Follow-up</TableCell>
              <TableCell sx={{ minWidth: 110 }}>Owner</TableCell>
              <TableCell sx={{ width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {leads.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 8, color: 'text.secondary', fontSize: '0.95rem' }}>
                  No leads found — add your first lead or sync from Meta
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => {
              const stage = lead.stage_id ? stageMap[lead.stage_id] : null
              const isSelected = selected.includes(lead.id)
              const overdue = lead.follow_up_at && new Date(lead.follow_up_at) < new Date()
              return (
                <TableRow
                  key={lead.id} hover selected={isSelected}
                  sx={{
                    cursor: 'pointer',
                    bgcolor: overdue ? alpha('#EF4444', 0.03) : undefined,
                    '&:hover': { bgcolor: alpha('#6366F1', 0.04) },
                    '& .MuiTableCell-root': { py: 1.5, fontSize: '0.875rem' },
                  }}
                >
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox size="small" checked={isSelected} onChange={() => toggleOne(lead.id)} />
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>{lead.name}</Typography>
                    {lead.email && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{lead.email}</Typography>
                    )}
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography variant="body2" color="text.secondary">{lead.company ?? '—'}</Typography>
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography variant="body2" color="text.secondary">{lead.phone ?? '—'}</Typography>
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    {stage ? (
                      <Chip
                        label={stage.name} size="small"
                        sx={{
                          height: 20, fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px',
                          bgcolor: alpha(stage.color, 0.12), color: stage.color,
                          border: `1px solid ${alpha(stage.color, 0.3)}`,
                        }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography variant="body2" color="text.secondary">{lead.source ?? '—'}</Typography>
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {(lead.tags as string[]).slice(0, 2).map((tag) => (
                        <Chip key={tag} label={tag} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', borderRadius: '5px', bgcolor: alpha('#8B5CF6', 0.1), color: '#8B5CF6' }}
                        />
                      ))}
                      {(lead.tags as string[]).length > 2 && (
                        <Typography variant="caption" color="text.disabled">+{(lead.tags as string[]).length - 2}</Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="center" onClick={() => onRowClick(lead)}>
                    <ScoreBadge score={lead.score} />
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <FollowUpBadge date={lead.follow_up_at} />
                  </TableCell>
                  <TableCell onClick={() => onRowClick(lead)}>
                    <Typography variant="caption" color="text.secondary">
                      {lead.owner_email?.split('@')[0] ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onRowClick(lead)}
                          sx={{ color: 'text.disabled', '&:hover': { color: '#6366F1' } }}>
                          <EditNoteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => onDelete(lead.id)}
                          sx={{ color: 'text.disabled', '&:hover': { color: '#EF4444' } }}>
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
        sx={{ borderTop: '1px solid', borderColor: 'divider' }}
      />
    </Box>
  )
}
