import { useState, useCallback } from 'react'
import {
  Stack, Button, Tooltip, Snackbar, Alert,
  Typography, Box, Divider, ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ViewListIcon from '@mui/icons-material/ViewList'
import ViewKanbanIcon from '@mui/icons-material/ViewKanban'
import AddIcon from '@mui/icons-material/Add'
import SyncIcon from '@mui/icons-material/Sync'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import TuneIcon from '@mui/icons-material/Tune'
import FilterAltIcon from '@mui/icons-material/FilterAlt'

import { GlassCard } from '../components/ui/GlassCard'
import { crmApi } from '../api/crm'
import type { CrmLead, LeadFilters } from '../api/crm'
import { qk } from '../api/queryClient'

import { LeadFiltersBar } from '../components/crm/LeadFiltersBar'
import { LeadListView } from '../components/crm/LeadListView'
import { KanbanBoard } from '../components/crm/KanbanBoard'
import { LeadDetailDrawer } from '../components/crm/LeadDetailDrawer'
import { StageManagerDrawer } from '../components/crm/StageManagerDrawer'
import { AddLeadDialog } from '../components/crm/AddLeadDialog'
import { BulkActionsBar } from '../components/crm/BulkActionsBar'

type ViewMode = 'list' | 'kanban'

const DEFAULT_FILTERS: LeadFilters = { page: 1, page_size: 25, sort_by: 'created_at', sort_dir: 'desc' }

export function CRMPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<ViewMode>('kanban')
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(true)
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addStageId, setAddStageId] = useState<string | undefined>()
  const [stageManagerOpen, setStageManagerOpen] = useState(false)
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null)

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
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, flexShrink: 0 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Total:{' '}
              <Typography component="span" variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {total} Leads
              </Typography>
            </Typography>
            {wonCount > 0 && (
              <>
                <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                <Typography variant="body2" color="text.secondary">
                  Closed:{' '}
                  <Typography component="span" variant="body2" sx={{ fontWeight: 800, color: '#10B981' }}>
                    {wonCount} Won
                  </Typography>
                </Typography>
              </>
            )}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          {/* View toggle */}
          <ToggleButtonGroup value={view} exclusive size="small"
            onChange={(_, v) => { if (v) setView(v) }}
            sx={{ height: 36, '& .MuiToggleButton-root': { px: 1.5, border: '1px solid', borderColor: 'divider' } }}>
            <ToggleButton value="list"><ViewListIcon sx={{ fontSize: 18 }} /></ToggleButton>
            <ToggleButton value="kanban"><ViewKanbanIcon sx={{ fontSize: 18 }} /></ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Toggle filters"><Button size="small" variant={showFilters ? 'contained' : 'outlined'}
            onClick={() => setShowFilters((v) => !v)} sx={{ height: 36, minWidth: 36, p: 0 }}>
            <FilterAltIcon sx={{ fontSize: 18 }} />
          </Button></Tooltip>

          <Divider orientation="vertical" flexItem />

          <Tooltip title="Manage stages">
            <Button size="small" startIcon={<TuneIcon />} variant="outlined" sx={{ height: 36 }}
              onClick={() => setStageManagerOpen(true)}>Stages</Button>
          </Tooltip>

          <Tooltip title="Sync from Meta Lead Forms">
            <Button size="small" startIcon={<SyncIcon />} variant="outlined" sx={{ height: 36 }}
              onClick={() => syncMetaMutation.mutate()} disabled={syncMetaMutation.isPending}>
              {syncMetaMutation.isPending ? 'Syncing…' : 'Sync Meta'}
            </Button>
          </Tooltip>

          <Button size="small" variant="text" sx={{ height: 36, color: 'text.secondary' }} onClick={handleDownloadTemplate}>CSV Template</Button>
          <Button size="small" startIcon={<UploadFileIcon />} variant="outlined" sx={{ height: 36 }} onClick={handleImport}>Import</Button>
          <Button size="small" startIcon={<DownloadIcon />} variant="outlined" sx={{ height: 36 }} onClick={handleExport}>Export</Button>

          <Button variant="contained" startIcon={<AddIcon />} sx={{ height: 36, fontWeight: 700, px: 2.5 }}
            onClick={() => { setAddStageId(undefined); setAddOpen(true) }}>
            Add Lead
          </Button>
        </Stack>
      </Stack>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      {showFilters && (
        <GlassCard sx={{ p: 2, flexShrink: 0 }}>
          <LeadFiltersBar filters={filters} stages={stages}
            onChange={(f) => setFilters(f)} onClear={() => setFilters(DEFAULT_FILTERS)} />
        </GlassCard>
      )}

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

      <AddLeadDialog open={addOpen} stages={stages} onClose={() => setAddOpen(false)}
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
