import { useState, useCallback } from 'react'
import {
  Stack, Button, Tooltip, Snackbar, Alert,
  Typography, Box, ToggleButtonGroup, ToggleButton,
  TextField, InputAdornment, IconButton, Badge,
  Popover, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ViewListIcon from '@mui/icons-material/ViewList'
import ViewKanbanIcon from '@mui/icons-material/ViewKanban'
import AddIcon from '@mui/icons-material/Add'
import SyncIcon from '@mui/icons-material/Sync'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import TuneIcon from '@mui/icons-material/Tune'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import SearchIcon from '@mui/icons-material/Search'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'

import { GlassCard } from '../components/ui/GlassCard'
import { crmApi } from '../api/crm'
import type { CrmLead, LeadFilters } from '../api/crm'
import { qk } from '../api/queryClient'

import { LeadFiltersBar } from '../components/crm/LeadFiltersBar'
import { LeadListView } from '../components/crm/LeadListView'
import { KanbanBoard } from '../components/crm/KanbanBoard'
import { LeadDetailDrawer } from '../components/crm/LeadDetailDrawer'
import { StageManagerDrawer } from '../components/crm/StageManagerDrawer'
import { AddLeadDrawer } from '../components/crm/AddLeadDrawer'
import { BulkActionsBar } from '../components/crm/BulkActionsBar'

type ViewMode = 'list' | 'kanban'

const DEFAULT_FILTERS: LeadFilters = { page: 1, page_size: 25, sort_by: 'created_at', sort_dir: 'desc' }

export function CRMPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<ViewMode>('kanban')
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS)
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addStageId, setAddStageId] = useState<string | undefined>()
  const [stageManagerOpen, setStageManagerOpen] = useState(false)
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null)

  const filterOpen = Boolean(filterAnchor)
  const actionOpen = Boolean(actionAnchor)
  const closeAction = () => setActionAnchor(null)
  // Closes the actions popover after running an item — keeps each MenuItem
  // tidy without inline IIFEs everywhere.
  const runAction = (fn: () => void) => () => { fn(); closeAction() }
  const activeFilterCount =
    Number(!!filters.stage_id) +
    Number(!!filters.source) +
    Number(!!filters.follow_up_before)

  const { data: stages = [], refetch: refetchStages } = useQuery({
    queryKey: qk.crmStages,
    queryFn: crmApi.listStages,
  })

  const { data: leadsPage, isLoading: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: qk.crmLeads(filters as Record<string, unknown>),
    queryFn: () => crmApi.listLeads(filters),
    keepPreviousData: true,
  })

  const leads = leadsPage?.data ?? []
  const total = leadsPage?.total ?? 0
  const wonStages = stages.filter((s) => s.is_terminal_win)
  const wonCount = leads.filter((l) => wonStages.some((s) => s.id === l.stage_id)).length

  const toast = (msg: string, severity: 'success' | 'error' = 'success') => setSnack({ msg, severity })

  const createMutation = useMutation({
    mutationFn: crmApi.createLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm'] }); setAddOpen(false); toast('Lead added') },
    onError: () => toast('Failed to add lead', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: crmApi.deleteLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm'] }); toast('Lead deleted') },
  })

  const bulkStageMutation = useMutation({
    mutationFn: ({ ids, stageId }: { ids: string[]; stageId: string }) => crmApi.bulkStage(ids, stageId),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['crm'] }); setSelectedIds([]); toast(`Moved ${r.updated} leads`) },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => crmApi.bulkDelete(ids),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['crm'] }); setSelectedIds([]); toast(`Deleted ${r.deleted} leads`) },
  })

  const syncMetaMutation = useMutation({
    mutationFn: crmApi.syncFromMeta,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['crm'] }); toast(`Synced ${r.imported} new leads from Meta`) },
    onError: () => toast('Meta sync failed', 'error'),
  })

  const dragStageMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) => crmApi.changeStage(leadId, stageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })

  const handleAddSubmit = useCallback((form: {
    name: string; email: string; phone: string; company: string
    source: string; stage_id: string; tags: string; follow_up_at: string
  }) => {
    createMutation.mutate({
      name: form.name, email: form.email || undefined, phone: form.phone || undefined,
      company: form.company || undefined, source: form.source || undefined,
      stage_id: addStageId ?? (form.stage_id || undefined),
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      follow_up_at: form.follow_up_at || undefined,
    })
  }, [createMutation, addStageId])

  const handleExport = async () => {
    try {
      const blob = await crmApi.exportCSV(filters)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'leads.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast('Export successful')
    } catch {
      toast('Export failed', 'error')
    }
  }

  const handleDownloadTemplate = () => {
    const csv = 'Name,Email,Phone,Company,Source,Owner Email,Tags\n"John Doe","john@example.com","+1234567890","Acme Corp","Direct","sales@example.com","VIP; Tech"'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_import_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.csv'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      const text = await file.text()
      const lines = text.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim())
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(',').map((v) => v.replace(/"/g, '').trim())
        return Object.fromEntries(headers.map((h, i) => [h.toLowerCase().replace(/ /g, '_'), vals[i] ?? '']))
      })
      try {
        const result = await crmApi.importCSV(rows)
        qc.invalidateQueries({ queryKey: ['crm'] })
        toast(`Imported ${result.imported} leads (${result.skipped} skipped)`)
      } catch { toast('Import failed', 'error') }
    }
    input.click()
  }

  return (
    <Stack spacing={2.5} sx={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2">
            Total Leads : {total}
          </Typography>
          {wonCount > 0 && (
            <>
              <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">
                Closed
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981' }}>
                {wonCount} Won
              </Typography>
            </>
          )}
        </Stack>

        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          {/* View toggle + filter — left cluster */}
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_, v) => { if (v) setView(v) }}
            sx={{
              // height: 36,
              '& .MuiToggleButton-root': {
                width: "50px",
                height: "50px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "unset",
                backgroundColor: "#ffffff !important",
              },
            }}
          >
            <ToggleButton value="list" sx={{
              marginRight: "10px",
              ":hover": {
                background: "#FFF",
              }
            }}>
              <ViewListIcon sx={{ fontSize: "22px", color: '#22D3EE' }} />
            </ToggleButton>
            <ToggleButton value="kanban"><ViewKanbanIcon
              sx={{
                fontSize: "22px",
                color: '#22D3EE'
              }} />
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Search — always visible in the toolbar */}
          <TextField
            placeholder="Search by name, phone, email…"
            value={filters.search ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                search: e.target.value || undefined,
                page: 1,
              }))
            }
            size="small"
            sx={{
              width: { xs: '100%', sm: 300, md: 340 },
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.paper',
                borderRadius: 1.5,
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {/* Filters trigger — opens wenext-style popover with stage/source/date/sort */}
          <Tooltip title="Filters">
            <Badge
              badgeContent={activeFilterCount}
              color="primary"
              overlap="rectangular"
              sx={{
                '& .MuiBadge-badge': {
                  height: 18,
                  minWidth: 18,
                  fontSize: 10,
                  fontWeight: 700,
                  border: '2px solid',
                  borderColor: 'background.paper',
                },
              }}
            >
              <Button
                variant={filterOpen ? 'contained' : 'outlined'}
                color={filterOpen ? 'primary' : 'inherit'}
                onClick={(e) => setFilterAnchor(e.currentTarget)}
                startIcon={<FilterAltIcon sx={{ fontSize: 18 }} />}
                sx={{
                  height: 40,
                  px: 1.75,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 1.5,
                  borderColor: 'divider',
                  bgcolor: filterOpen ? undefined : 'background.paper',
                }}
              >
                Filters
              </Button>
            </Badge>
          </Tooltip>

          {/* Actions trigger — opens menu with Stages / Sync / Import / Export / Template */}
          <Tooltip title="Actions">
            <IconButton
              onClick={(e) => setActionAnchor(e.currentTarget)}
              sx={{
                width: 40,
                height: 40,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                bgcolor: actionOpen ? 'action.selected' : 'background.paper',
                color: 'text.primary',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setAddStageId(undefined); setAddOpen(true) }}
            sx={{
              height: 40,
              px: 2.5,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 1.5,
            }}
          >
            Add Lead
          </Button>
        </Stack>
      </Stack>

      {/* ── Filters popover ─────────────────────────────────────────────── */}
      <Popover
        open={filterOpen}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              mt: 1,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.10)',
              overflow: 'hidden',
            },
          },
        }}
      >
        <LeadFiltersBar
          filters={filters}
          stages={stages}
          onApply={(f) => {
            setFilters(f)
            setFilterAnchor(null)
          }}
          onCancel={() => setFilterAnchor(null)}
          onClear={() => {
            setFilters(DEFAULT_FILTERS)
            setFilterAnchor(null)
          }}
        />
      </Popover>

      {/* ── Actions menu ────────────────────────────────────────────────
          Uses MUI's `Menu` (not `Popover`) because `MenuItem` relies on
          the MenuListContext that `Menu` provides. Same anchor + styling. */}
      <Menu
        open={actionOpen}
        anchorEl={actionAnchor}
        onClose={closeAction}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              mt: 1,
              minWidth: 280,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.10)',
              overflow: 'hidden',
              '& .MuiMenuItem-root': {
                px: 2,
                py: 1.25,
                gap: 1.5,
                alignItems: 'flex-start',
              },
              '& .MuiListItemIcon-root': { minWidth: 28, mt: 0.25 },
              '& .MuiListItemText-secondary': {
                fontSize: 11,
                color: 'text.secondary',
                mt: 0.25,
              },
            },
          },
        }}
      >
        <Typography
          variant="overline"
          sx={{
            px: 2,
            pt: 1.25,
            display: 'block',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: 'text.disabled',
          }}
        >
          Pipeline
        </Typography>
        <MenuItem onClick={runAction(() => setStageManagerOpen(true))}>
          <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Manage stages"
            secondary="Edit pipeline columns and order"
            slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }}
          />
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <Typography
          variant="overline"
          sx={{
            px: 2,
            display: 'block',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: 'text.disabled',
          }}
        >
          Data
        </Typography>
        <MenuItem
          onClick={runAction(() => syncMetaMutation.mutate())}
          disabled={syncMetaMutation.isPending}
        >
          <ListItemIcon><SyncIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary={syncMetaMutation.isPending ? 'Syncing from Meta…' : 'Sync from Meta'}
            secondary="Pull new leads from Meta lead forms"
            slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }}
          />
        </MenuItem>
        <MenuItem onClick={runAction(handleImport)}>
          <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Import from CSV"
            secondary="Upload a CSV of leads"
            slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }}
          />
        </MenuItem>
        <MenuItem onClick={runAction(handleExport)}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Export to CSV"
            secondary="Download leads matching the current filters"
            slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }}
          />
        </MenuItem>
        <MenuItem onClick={runAction(handleDownloadTemplate)}>
          <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Download CSV template"
            secondary="Sample format used for imports"
            slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }}
          />
        </MenuItem>
      </Menu>

      {/* ── Bulk actions ─────────────────────────────────────────────────── */}
      {selectedIds.length > 0 && (
        <BulkActionsBar selectedCount={selectedIds.length} stages={stages}
          onBulkStage={(stageId) => bulkStageMutation.mutate({ ids: selectedIds, stageId })}
          onBulkDelete={() => bulkDeleteMutation.mutate(selectedIds)}
          onClear={() => setSelectedIds([])} />
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <GlassCard sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {view === 'list' ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <LeadListView
              leads={leads} stages={stages} total={leadsPage?.total ?? 0}
              page={leadsPage?.page ?? 1} pageSize={leadsPage?.pageSize ?? 25}
              loading={leadsLoading} selected={selectedIds}
              onSelectChange={setSelectedIds}
              onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              onPageSizeChange={(s) => setFilters((f) => ({ ...f, page_size: s, page: 1 }))}
              onRowClick={setSelectedLead}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          </Box>
        ) : (
          <Box sx={{ p: 3, flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', '&::-webkit-scrollbar': { height: 8 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 4 } }}>
            <KanbanBoard
              stages={stages} leads={leads}
              onDrop={(leadId, stageId) => dragStageMutation.mutate({ leadId, stageId })}
              onCardClick={setSelectedLead}
              onAddInStage={(stageId) => { setAddStageId(stageId); setAddOpen(true) }}
            />
          </Box>
        )}
      </GlassCard>

      {/* ── Drawers & dialogs ─────────────────────────────────────────────── */}
      <LeadDetailDrawer lead={selectedLead} stages={stages} open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdated={() => {
          refetchLeads()
          if (selectedLead) crmApi.getLead(selectedLead.id).then(setSelectedLead).catch(() => { })
        }} />

      <StageManagerDrawer open={stageManagerOpen} stages={stages}
        onClose={() => setStageManagerOpen(false)} onChanged={() => refetchStages()} />

      <AddLeadDrawer open={addOpen} stages={stages} onClose={() => setAddOpen(false)}
        onSubmit={handleAddSubmit} loading={createMutation.isPending} />

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack?.severity ?? 'success'} onClose={() => setSnack(null)} sx={{ borderRadius: 2 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
