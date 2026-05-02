import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import { useState } from 'react'
import { adsApi, ApiError } from '../../../api'
import type { CreateCampaignInput, ValidateCampaignResult } from '../../../api/types'
import type { WizardForm } from './types'
import { toCreateCampaignInput } from './types'

type Props = {
  form: WizardForm
  onPublishComplete: (campaignId: string) => void
}

const STEPS: ('campaign' | 'adset' | 'creative' | 'ad')[] = ['campaign', 'adset', 'creative', 'ad']

export function ReviewStep({ form, onPublishComplete }: Props) {
  const [validateResult, setValidateResult] = useState<ValidateCampaignResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  let payload: CreateCampaignInput | null = null
  let buildError: string | null = null
  try {
    payload = toCreateCampaignInput(form)
  } catch (err) {
    buildError = (err as Error).message
  }

  const runValidate = async () => {
    if (!payload) return
    setValidating(true)
    setValidateResult(null)
    try {
      const result = await adsApi.validateCampaign(payload)
      setValidateResult(result)
      if (result.ok && result.warnings) setWarnings(result.warnings)
    } catch (err) {
      setValidateResult({
        ok: false,
        step: 'preflight',
        error: {
          code: err instanceof ApiError ? err.status : 'UNKNOWN',
          user_message: err instanceof Error ? err.message : 'Validation failed',
        },
      })
    } finally {
      setValidating(false)
    }
  }

  const publish = async (mode: 'paused' | 'live') => {
    if (!payload) return
    setPublishing(true)
    setPublishError(null)
    try {
      const result = await adsApi.createCampaign({ ...payload, publish: mode === 'live' })
      onPublishComplete(result.id)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const validateOk = validateResult && validateResult.ok === true
  const validateFailed = validateResult && validateResult.ok === false

  return (
    <Stack spacing={3}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Review and publish</Typography>

      {buildError && <Alert severity="error">{buildError}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">Summary</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Row label="Objective" value={form.objective || '—'} />
            <Row
              label="Audience"
              value={`${form.audience.locations.map((l) => l.name).join(', ') || '—'} · age ${form.audience.age_min}-${form.audience.age_max} · ${form.audience.genders}`}
            />
            <Row
              label="Special category"
              value={form.audience.special_ad_categories.join(', ')}
            />
            <Row
              label="Budget"
              value={`${form.budget.amount} ${form.budget.type}${form.budget.start_date ? ` from ${form.budget.start_date.slice(0, 10)}` : ''}${form.budget.end_date ? ` to ${form.budget.end_date.slice(0, 10)}` : ''}`}
            />
            <Row
              label="Creative"
              value={`${form.creative.media_type} · ${form.creative.headline || '(no headline)'} · CTA ${form.creative.cta_type}`}
            />
            {form.objective === 'WEBSITE_TRAFFIC' && (
              <Row label="Destination" value={form.creative.destination_url || '—'} />
            )}
            {form.objective === 'LEAD_GEN' && (
              <Row label="Lead form" value={form.lead_form.selected_form_id || '(none selected)'} />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
              Validation
            </Typography>
            <Button onClick={runValidate} disabled={validating || !payload} size="small" variant="outlined">
              {validating ? 'Validating…' : validateResult ? 'Re-validate' : 'Validate'}
            </Button>
          </Stack>

          {!validateResult && (
            <Typography variant="body2" color="text.secondary">
              Click Validate to dry-run the campaign against Meta. Nothing is published yet.
            </Typography>
          )}

          {validating && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Asking Meta to check the campaign…</Typography>
            </Stack>
          )}

          {validateOk && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              {STEPS.map((s) => {
                const wasValidated = (validateResult as { validated?: string[] }).validated?.includes(s)
                return (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} key={s}>
                    <CheckCircleOutlineIcon
                      color={wasValidated ? 'success' : 'disabled'}
                      fontSize="small"
                    />
                    <Typography
                      variant="body2"
                      sx={{ textTransform: 'capitalize', color: wasValidated ? 'text.primary' : 'text.secondary' }}
                    >
                      {s}{!wasValidated && ' (validates at publish)'}
                    </Typography>
                  </Stack>
                )
              })}
              {(validateResult as { note?: string }).note && (
                <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
                  {(validateResult as { note: string }).note}
                </Alert>
              )}
              {warnings.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  <Stack spacing={0.5}>
                    {warnings.map((w, i) => <span key={i}>{w}</span>)}
                  </Stack>
                </Alert>
              )}
            </Stack>
          )}

          {validateFailed && (
            <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mt: 2 }}>
              <Stack spacing={0.5}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Failed at step: {(validateResult as { step: string }).step}
                </Typography>
                <Typography variant="body2">{(validateResult as { error: { user_message: string } }).error.user_message}</Typography>
                {(validateResult as { error: { field?: string } }).error.field && (
                  <Chip
                    size="small"
                    label={`field: ${(validateResult as { error: { field: string } }).error.field}`}
                    variant="outlined"
                  />
                )}
              </Stack>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Divider />

      {publishError && <Alert severity="error">{publishError}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
        <ButtonGroup variant="contained" disabled={publishing}>
          <Button
            onClick={() => publish('paused')}
          >
            {publishing ? 'Saving…' : 'Save as Paused'}
          </Button>
          <Button
            color="success"
            onClick={() => publish('live')}
            disabled={!validateOk}
          >
            {publishing ? 'Publishing…' : 'Publish Live'}
          </Button>
        </ButtonGroup>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
        "Publish Live" requires a passing validation. "Save as Paused" creates the campaign in Meta but doesn't deliver until you flip it on.
      </Typography>
    </Stack>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>{label}</Typography>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
      </Box>
    </Stack>
  )
}

export default ReviewStep
