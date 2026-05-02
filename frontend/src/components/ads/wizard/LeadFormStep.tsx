import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adsApi, ApiError, qk } from '../../../api'
import type { LeadForm, LeadFormQuestion } from '../../../api/types'
import { GlassCard } from '../../ui/GlassCard'
import type { WizardForm } from './types'

type Props = {
  leadForm: WizardForm['lead_form']
  onChange: (next: WizardForm['lead_form']) => void
}

const QUESTION_TYPES = [
  { value: 'FULL_NAME', label: 'Full name' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WORK_EMAIL', label: 'Work email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'WORK_PHONE_NUMBER', label: 'Work phone' },
  { value: 'CITY', label: 'City' },
  { value: 'STATE', label: 'State' },
  { value: 'COUNTRY', label: 'Country' },
  { value: 'ZIP', label: 'Zip code' },
  { value: 'COMPANY_NAME', label: 'Company name' },
  { value: 'JOB_TITLE', label: 'Job title' },
  { value: 'CUSTOM', label: 'Custom question' },
]

export function LeadFormStep({ leadForm, onChange }: Props) {
  const queryClient = useQueryClient()

  const formsQuery = useQuery({
    queryKey: qk.leadForms,
    queryFn: () => adsApi.getLeadForms(),
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const nf = leadForm.new_form!
      return adsApi.createLeadForm({
        name: nf.name,
        locale: nf.locale,
        questions: nf.questions as LeadFormQuestion[],
        privacy_policy: { url: nf.privacy_policy_url, link_text: nf.privacy_policy_link_text },
        follow_up_action_url: nf.follow_up_action_url || undefined,
        thank_you_page: {
          title: nf.thank_you_title,
          body: nf.thank_you_body,
          button_type: nf.thank_you_button_type,
          website_url: nf.thank_you_website_url || undefined,
        },
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: qk.leadForms })
      onChange({ ...leadForm, mode: 'pick', selected_form_id: created.id })
    },
  })

  const update = (patch: Partial<WizardForm['lead_form']>) => onChange({ ...leadForm, ...patch })
  const updateNew = (patch: Partial<NonNullable<WizardForm['lead_form']['new_form']>>) =>
    onChange({ ...leadForm, new_form: { ...leadForm.new_form!, ...patch } })

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Lead form
      </Typography>

      <Tabs
        value={leadForm.mode}
        onChange={(_, val) => update({ mode: val as 'pick' | 'create' })}
        sx={{ mb: 1 }}
      >
        <Tab value="pick" label="Pick existing" />
        <Tab value="create" label="Create new" />
      </Tabs>

      {leadForm.mode === 'pick' && (
        <PickForm
          forms={formsQuery.data?.data || []}
          loading={formsQuery.isLoading}
          error={(formsQuery.error as ApiError)?.message}
          selectedId={leadForm.selected_form_id}
          onSelect={(id) => update({ selected_form_id: id })}
        />
      )}

      {leadForm.mode === 'create' && leadForm.new_form && (
        <GlassCard sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack spacing={2}>
            <TextField
              label="Form name"
              value={leadForm.new_form.name}
              onChange={(e) => updateNew({ name: e.target.value })}
              required
            />
            <FormControl fullWidth>
              <InputLabel>Language</InputLabel>
              <Select
                label="Language"
                value={leadForm.new_form.locale}
                onChange={(e) => updateNew({ locale: e.target.value as string })}
              >
                <MenuItem value="en_US">English (US)</MenuItem>
                <MenuItem value="en_GB">English (UK)</MenuItem>
                <MenuItem value="hi_IN">Hindi</MenuItem>
                <MenuItem value="es_ES">Spanish</MenuItem>
                <MenuItem value="fr_FR">French</MenuItem>
                <MenuItem value="pt_BR">Portuguese (BR)</MenuItem>
              </Select>
            </FormControl>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Questions
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {leadForm.new_form.questions.map((q, idx) => (
                  <Stack key={idx} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <FormControl sx={{ minWidth: 200 }}>
                      <Select
                        size="small"
                        value={q.type}
                        onChange={(e) => {
                          const next = [...leadForm.new_form!.questions]
                          next[idx] = { ...next[idx], type: e.target.value as string }
                          updateNew({ questions: next })
                        }}
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <MenuItem key={qt.value} value={qt.value}>{qt.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {q.type === 'CUSTOM' && (
                      <TextField
                        size="small"
                        placeholder="Question text"
                        value={q.label || ''}
                        onChange={(e) => {
                          const next = [...leadForm.new_form!.questions]
                          next[idx] = { ...next[idx], label: e.target.value, key: e.target.value.toLowerCase().replace(/\W+/g, '_').slice(0, 60) }
                          updateNew({ questions: next })
                        }}
                        sx={{ flex: 1 }}
                      />
                    )}
                    <IconButton
                      size="small"
                      onClick={() => {
                        const next = leadForm.new_form!.questions.filter((_, i) => i !== idx)
                        updateNew({ questions: next })
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => updateNew({ questions: [...leadForm.new_form!.questions, { type: 'EMAIL' }] })}
                sx={{ mt: 1 }}
              >
                Add question
              </Button>
            </Box>

            <TextField
              label="Privacy policy URL"
              type="url"
              value={leadForm.new_form.privacy_policy_url}
              onChange={(e) => updateNew({ privacy_policy_url: e.target.value })}
              required
            />
            <TextField
              label="Privacy policy link text"
              value={leadForm.new_form.privacy_policy_link_text}
              onChange={(e) => updateNew({ privacy_policy_link_text: e.target.value })}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Thank-you title"
                value={leadForm.new_form.thank_you_title}
                onChange={(e) => updateNew({ thank_you_title: e.target.value })}
                fullWidth
              />
              <TextField
                label="Thank-you body"
                value={leadForm.new_form.thank_you_body}
                onChange={(e) => updateNew({ thank_you_body: e.target.value })}
                fullWidth
              />
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Thank-you button</InputLabel>
              <Select
                label="Thank-you button"
                value={leadForm.new_form.thank_you_button_type}
                onChange={(e) =>
                  updateNew({ thank_you_button_type: e.target.value as 'VIEW_WEBSITE' | 'CALL_BUSINESS' | 'NONE' })
                }
              >
                <MenuItem value="VIEW_WEBSITE">View website</MenuItem>
                <MenuItem value="CALL_BUSINESS">Call business</MenuItem>
                <MenuItem value="NONE">None</MenuItem>
              </Select>
            </FormControl>

            {leadForm.new_form.thank_you_button_type === 'VIEW_WEBSITE' && (
              <TextField
                label="Website URL"
                type="url"
                value={leadForm.new_form.thank_you_website_url}
                onChange={(e) => updateNew({ thank_you_website_url: e.target.value })}
              />
            )}

            <TextField
              label="Follow-up URL (optional)"
              type="url"
              value={leadForm.new_form.follow_up_action_url}
              onChange={(e) => updateNew({ follow_up_action_url: e.target.value })}
              helperText="The user can be sent here from a confirmation page."
            />

            {createMutation.isError && (
              <Alert severity="error">{(createMutation.error as ApiError).message}</Alert>
            )}

            <Button
              variant="contained"
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !leadForm.new_form.name ||
                !leadForm.new_form.privacy_policy_url ||
                leadForm.new_form.questions.length === 0
              }
            >
              {createMutation.isPending ? 'Creating…' : 'Create form on Meta'}
            </Button>
          </Stack>
        </GlassCard>
      )}
    </Stack>
  )
}

function PickForm({
  forms,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  forms: LeadForm[]
  loading: boolean
  error?: string
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (loading) return <Stack sx={{ alignItems: 'center', py: 3 }}><CircularProgress size={24} /></Stack>
  if (error) return <Alert severity="error">{error}</Alert>
  if (!forms.length) {
    return (
      <Alert severity="info">
        No lead forms found on the connected Page. Switch to "Create new" to make one.
      </Alert>
    )
  }
  return (
    <FormControl fullWidth>
      <InputLabel>Lead form</InputLabel>
      <Select
        label="Lead form"
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value as string)}
      >
        {forms.map((f) => (
          <MenuItem key={f.id} value={f.id}>
            <Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <span>{f.name}</span>
                {f.status && <Chip size="small" label={f.status} variant="outlined" />}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {f.questions?.length || 0} question{f.questions?.length === 1 ? '' : 's'}
                {f.leads_count !== undefined ? ` · ${f.leads_count} leads` : ''}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export default LeadFormStep
