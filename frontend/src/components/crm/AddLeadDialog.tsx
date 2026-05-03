import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, MenuItem, Chip, Box, Typography,
} from '@mui/material'
import type { CrmStage } from '../../api/crm'

interface Props {
  open: boolean
  stages: CrmStage[]
  onClose: () => void
  onSubmit: (data: {
    name: string; email: string; phone: string; company: string
    source: string; stage_id: string; tags: string; follow_up_at: string
  }) => void
  loading?: boolean
}

const SOURCES = ['Meta Lead Form', 'Organic Search', 'Partner Referral', 'Webinar', 'Cold Outreach', 'Direct', 'Referral', 'Event']

export function AddLeadDialog({ open, stages, onClose, onSubmit, loading }: Props) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '',
    source: '', stage_id: '', tags: '', follow_up_at: '',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSubmit(form)
    setForm({ name: '', email: '', phone: '', company: '', source: '', stage_id: '', tags: '', follow_up_at: '' })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none', borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Add New Lead</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Full Name *" value={form.name} onChange={set('name')} size="small" fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField label="Email" value={form.email} onChange={set('email')} size="small" fullWidth />
            <TextField label="Phone" value={form.phone} onChange={set('phone')} size="small" fullWidth />
          </Stack>
          <TextField label="Company" value={form.company} onChange={set('company')} size="small" fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField label="Source" value={form.source} onChange={set('source')} size="small" fullWidth select>
              {SOURCES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField label="Stage" value={form.stage_id} onChange={set('stage_id')} size="small" fullWidth select>
              <MenuItem value="">— None —</MenuItem>
              {stages.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                    {s.name}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Tags (comma-separated)" value={form.tags} onChange={set('tags')} size="small" fullWidth
            helperText="e.g. enterprise, hot-lead, SaaS"
          />
          <TextField
            label="Follow-up Date" value={form.follow_up_at} onChange={set('follow_up_at')}
            type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading || !form.name.trim()}>
          {loading ? 'Adding…' : 'Add Lead'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
