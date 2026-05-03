import { useState } from 'react'
import {
  Drawer, Box, Stack, Typography, IconButton, Divider, TextField,
  Button, Chip, MenuItem, CircularProgress, Tab, Tabs,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SendIcon from '@mui/icons-material/Send'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { crmApi } from '../../api/crm'
import type { CrmLead, CrmStage } from '../../api/crm'
import { qk } from '../../api/queryClient'

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <Box sx={{
      width: 52, height: 52, borderRadius: '50%',
      border: `3px solid ${alpha(color, 0.5)}`,
      bgcolor: alpha(color, 0.1), color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.1rem', fontWeight: 800,
    }}>
      {score}
    </Box>
  )
}

function ActivityTimeline({ leadId }: { leadId: string }) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: qk.crmActivities(leadId),
    queryFn: () => crmApi.getActivities(leadId),
  })
  if (isLoading) return <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 2 }} />
  const icons: Record<string, string> = {
    note: '📝', status_change: '🔄', assign: '👤', ai_summary: '✨', meta_sync: '🔗', created: '🎉',
  }
  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      {activities.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 2 }}>
          No activity yet
        </Typography>
      )}
      {activities.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <Typography sx={{ fontSize: '1rem', mt: 0.25 }}>{icons[a.type] ?? '•'}</Typography>
          <Box flex={1}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{a.body}</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              {a.actor_email?.split('@')[0] ?? 'System'} · {new Date(a.created_at).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  )
}

const SOURCES = ['Meta Lead Form', 'Organic Search', 'Partner Referral', 'Webinar', 'Cold Outreach', 'Direct', 'Referral', 'Event']

interface Props {
  lead: CrmLead | null
  stages: CrmStage[]
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

export function LeadDetailDrawer({ lead, stages, open, onClose, onUpdated }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [newTag, setNewTag] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<CrmLead>) => crmApi.updateLead(lead!.id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm'] }); onUpdated() },
  })

  const noteMutation = useMutation({
    mutationFn: (text: string) => crmApi.addNote(lead!.id, text),
    onSuccess: () => { setNoteText(''); qc.invalidateQueries({ queryKey: qk.crmActivities(lead!.id) }) },
  })

  const stageMutation = useMutation({
    mutationFn: (stageId: string) => crmApi.changeStage(lead!.id, stageId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm'] }); onUpdated() },
  })

  const handleAISummary = async () => {
    if (!lead) return
    setAiLoading(true)
    try {
      await crmApi.generateAISummary(lead.id)
      qc.invalidateQueries({ queryKey: ['crm'] }); onUpdated()
    } finally { setAiLoading(false) }
  }

  const handleAddTag = () => {
    if (!newTag.trim() || !lead) return
    updateMutation.mutate({ tags: [...(lead.tags as string[]), newTag.trim()] })
    setNewTag('')
  }

  if (!lead) return null
  const stage = stages.find((s) => s.id === lead.stage_id)

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100vw', sm: 480 }, bgcolor: 'background.paper', backgroundImage: 'none' } }}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={2} alignItems="center">
              <ScoreRing score={lead.score} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{lead.name}</Typography>
                {lead.company && <Typography variant="caption" color="text.secondary">{lead.company}</Typography>}
                {stage && (
                  <Box sx={{ mt: 0.5 }}>
                    <Chip label={stage.name} size="small"
                      sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px',
                        bgcolor: alpha(stage.color, 0.12), color: stage.color, border: `1px solid ${alpha(stage.color, 0.3)}` }} />
                  </Box>
                )}
              </Box>
            </Stack>
            <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab label="Details" sx={{ fontSize: '0.8rem', minHeight: 40 }} />
          <Tab label="Notes & Activity" sx={{ fontSize: '0.8rem', minHeight: 40 }} />
          <Tab label="AI Summary" sx={{ fontSize: '0.8rem', minHeight: 40 }} />
        </Tabs>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
          {/* ── Details ── */}
          {tab === 0 && (
            <Stack spacing={2.5}>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Contact Info</Typography>
                {[
                  { label: 'Name', key: 'name', value: lead.name },
                  { label: 'Email', key: 'email', value: lead.email },
                  { label: 'Phone', key: 'phone', value: lead.phone },
                  { label: 'Company', key: 'company', value: lead.company },
                ].map(({ label, key, value }) => (
                  <TextField key={key} label={label} size="small" defaultValue={value ?? ''} fullWidth
                    onBlur={(e) => { if (e.target.value !== (value ?? '')) updateMutation.mutate({ [key]: e.target.value }) }} />
                ))}
              </Stack>
              <Divider />
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Pipeline</Typography>
                <TextField label="Stage" size="small" fullWidth select value={lead.stage_id ?? ''}
                  onChange={(e) => stageMutation.mutate(e.target.value)}>
                  <MenuItem value="">— None —</MenuItem>
                  {stages.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                        <span>{s.name}</span>
                      </Stack>
                    </MenuItem>
                  ))}
                </TextField>
                <TextField label="Source" size="small" fullWidth select value={lead.source ?? ''}
                  onChange={(e) => updateMutation.mutate({ source: e.target.value })}>
                  {SOURCES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </TextField>
                <TextField label="Owner Email" size="small" fullWidth defaultValue={lead.owner_email ?? ''}
                  onBlur={(e) => updateMutation.mutate({ owner_email: e.target.value })} />
                <TextField label="Follow-up Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                  defaultValue={lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : ''}
                  onBlur={(e) => updateMutation.mutate({ follow_up_at: e.target.value || null })} />
              </Stack>
              <Divider />
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Tags</Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {(lead.tags as string[]).map((tag) => (
                    <Chip key={tag} label={tag} size="small"
                      onDelete={() => updateMutation.mutate({ tags: (lead.tags as string[]).filter((t) => t !== tag) })}
                      sx={{ bgcolor: alpha('#8B5CF6', 0.1), color: '#8B5CF6', borderRadius: '6px', height: 22, fontSize: '0.72rem' }} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField placeholder="Add tag…" size="small" value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
                    sx={{ flex: 1 }} />
                  <Button size="small" variant="outlined" onClick={handleAddTag} disabled={!newTag.trim()}>Add</Button>
                </Stack>
              </Stack>
            </Stack>
          )}

          {/* ── Notes & Activity ── */}
          {tab === 1 && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1}>
                <TextField placeholder="Add a note…" multiline minRows={2} size="small" fullWidth
                  value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <Button variant="contained" size="small" sx={{ alignSelf: 'flex-end' }}
                  disabled={!noteText.trim() || noteMutation.isPending}
                  onClick={() => noteMutation.mutate(noteText)}>
                  <SendIcon fontSize="small" />
                </Button>
              </Stack>
              <Divider />
              <ActivityTimeline leadId={lead.id} />
            </Stack>
          )}

          {/* ── AI Summary ── */}
          {tab === 2 && (
            <Stack spacing={2}>
              <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={handleAISummary}
                disabled={aiLoading} sx={{ alignSelf: 'flex-start', borderColor: alpha('#8B5CF6', 0.4), color: '#8B5CF6' }}>
                {aiLoading ? 'Generating…' : lead.ai_summary ? 'Regenerate' : 'Generate AI Summary'}
              </Button>
              {lead.ai_summary && !aiLoading && (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#8B5CF6', 0.06), border: `1px solid ${alpha('#8B5CF6', 0.15)}` }}>
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 16, color: '#8B5CF6', mt: 0.25 }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      AI Summary
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '0.85rem' }}>
                    {lead.ai_summary}
                  </Typography>
                </Box>
              )}
              {!lead.ai_summary && !aiLoading && (
                <Typography variant="caption" color="text.secondary">
                  Click Generate to get a GPT-powered status summary and next-action recommendation.
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}
