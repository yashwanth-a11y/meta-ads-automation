import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adsApi, ApiError, qk } from '../api'
import { paths } from '../auth/constants'
import { PageHeader } from '../components/ui/PageHeader'
import { AudienceStep } from '../components/ads/wizard/AudienceStep'
import { BudgetStep } from '../components/ads/wizard/BudgetStep'
import { CreativeStep } from '../components/ads/wizard/CreativeStep'
import { LeadFormStep } from '../components/ads/wizard/LeadFormStep'
import { ObjectiveStep } from '../components/ads/wizard/ObjectiveStep'
import { ReviewStep } from '../components/ads/wizard/ReviewStep'
import { aiResultToWizardForm, DEFAULT_FORM, type WizardForm } from '../components/ads/wizard/types'

type StepKey = 'objective' | 'audience' | 'budget' | 'creative' | 'leadform' | 'review'

function buildSteps(objective: WizardForm['objective']): StepKey[] {
  if (objective === 'LEAD_GEN') {
    return ['objective', 'audience', 'budget', 'creative', 'leadform', 'review']
  }
  return ['objective', 'audience', 'budget', 'creative', 'review']
}

const STEP_LABEL: Record<StepKey, string> = {
  objective: 'Objective',
  audience: 'Audience',
  budget: 'Budget',
  creative: 'Creative',
  leadform: 'Lead form',
  review: 'Review',
}

export function AdsCreatePage() {
  const navigate = useNavigate()

  const setupQuery = useQuery({
    queryKey: qk.setupStatus,
    queryFn: () => adsApi.getSetupStatus(),
    staleTime: 60_000,
  })

  const [form, setForm] = useState<WizardForm>(DEFAULT_FORM)
  const [stepIdx, setStepIdx] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const steps = useMemo(() => buildSteps(form.objective), [form.objective])
  const currentKey = steps[stepIdx]

  if (setupQuery.isLoading) {
    return <Stack sx={{ alignItems: 'center', mt: 8 }}><CircularProgress /></Stack>
  }

  // Setup query failed (network / server error). 401s are handled upstream
  // by the AppShell auth guard (token cleared, redirect to /auth) — anything
  // that lands here is a non-auth failure.
  if (setupQuery.error) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto' }}>
        <PageHeader title="Create campaign" subtitle="Couldn't load your Meta connection." />
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={() => setupQuery.refetch()}>Retry</Button>}
        >
          {(setupQuery.error as ApiError).message || 'Failed to load setup status.'}
        </Alert>
      </Stack>
    )
  }

  // No data and no error means the request finished but returned nothing
  // (e.g. backend returned an empty body or the feature flag is off). Block
  // the wizard either way.
  if (!setupQuery.data) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto' }}>
        <PageHeader title="Create campaign" subtitle="Ads module is unavailable." />
        <Alert severity="warning">The ads feature is not enabled on the server.</Alert>
      </Stack>
    )
  }

  if (!setupQuery.data.connected) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto' }}>
        <PageHeader title="Create campaign" subtitle="Connect a Meta account first." />
        <Alert
          severity="info"
          action={<Button color="inherit" onClick={() => navigate(paths.adsSetup)}>Connect</Button>}
        >
          You need to connect a Meta ad account and Facebook Page before creating campaigns.
        </Alert>
      </Stack>
    )
  }

  const setup = setupQuery.data
  const hasWaba = Boolean(setup.waba_id)

  // AI generation: prompt → backend OpenAI call → fill form → jump to Review.
  // Lead Gen with AI lands on the Lead Form step instead so the user can
  // pick or create the form before reviewing (AI can't pick which form).
  const onAiGenerate = async (prompt: string) => {
    setAiError(null)
    setAiLoading(true)
    try {
      const ai = await adsApi.aiGenerateCampaign(prompt)
      const filled = aiResultToWizardForm(ai, form)
      setForm(filled)
      setStepError(null)
      const nextSteps = buildSteps(filled.objective)
      // Jump to Lead Form step for LEAD_GEN (form selection still needed),
      // otherwise straight to Review.
      const targetKey: StepKey = filled.objective === 'LEAD_GEN' ? 'leadform' : 'review'
      const targetIdx = nextSteps.indexOf(targetKey)
      setStepIdx(targetIdx >= 0 ? targetIdx : nextSteps.length - 1)
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : (err as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  const validateStep = (key: StepKey): string | null => {
    switch (key) {
      case 'objective':
        if (!form.objective) return 'Pick an objective to continue.'
        return null
      case 'audience':
        if (form.audience.locations.length === 0) return 'Add at least one location.'
        if (form.audience.age_min > form.audience.age_max) return 'Age range is invalid.'
        return null
      case 'budget':
        if (!form.budget.amount || form.budget.amount < 1) return 'Budget must be at least 1.'
        if (form.budget.type === 'lifetime' && !form.budget.end_date) return 'Lifetime budgets require an end date.'
        return null
      case 'creative':
        if (!form.creative.image_hash && !form.creative.video_id) return 'Upload an image or video.'
        if (!form.creative.headline) return 'Headline is required.'
        if (!form.creative.primary_text) return 'Primary text is required.'
        if (form.objective === 'WEBSITE_TRAFFIC' && !form.creative.destination_url) {
          return 'Destination URL is required for Website Traffic.'
        }
        if (form.objective === 'WEBSITE_TRAFFIC' && form.creative.destination_url && !/^https?:\/\//.test(form.creative.destination_url)) {
          return 'Destination URL must start with http(s)://'
        }
        return null
      case 'leadform':
        if (!form.lead_form.selected_form_id) return 'Pick or create a lead form.'
        return null
      case 'review':
        return null
    }
  }

  const next = () => {
    const err = validateStep(currentKey)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    if (stepIdx < steps.length - 1) setStepIdx(stepIdx + 1)
  }

  const back = () => {
    setStepError(null)
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }

  return (
    <Stack>
      <PageHeader
        title="Create campaign"
        subtitle="Build a Meta ad in a few steps. Validation runs against Meta before publish."
      />

      {/* Clickable stepper — lets the user jump back to any step to edit
          AI-filled values, then return to Review. We always allow going
          backward; forward jumps are also allowed (the per-step `next()`
          validation runs whenever they actually try to publish anyway). */}
      <Stepper activeStep={stepIdx} alternativeLabel nonLinear sx={{ mb: 1 }}>
        {steps.map((s, i) => (
          <Step key={s}>
            <StepButton
              onClick={() => { setStepError(null); setStepIdx(i) }}
            >
              {STEP_LABEL[s]}
            </StepButton>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: { xs: 2, sm: 3 },
      mt: 2,
          // border: "1px solid #dddddd57",
        "&:hover": {
          boxShadow: `0 8px 32px ${alpha('#000000', 0.45)}`,
          bgcolor: 'transparent',
        },
      }}>
        {currentKey === 'objective' && (
          <ObjectiveStep
            value={form.objective}
            onChange={(o) => setForm((f) => ({ ...f, objective: o }))}
            hasWaba={hasWaba}
            onAiGenerate={onAiGenerate}
            aiLoading={aiLoading}
            aiError={aiError}
          />
        )}
        {currentKey === 'audience' && (
          <AudienceStep
            audience={form.audience}
            onChange={(audience) => setForm((f) => ({ ...f, audience }))}
          />
        )}
        {currentKey === 'budget' && (
          <BudgetStep
            budget={form.budget}
            currency={setup?.currency}
            onChange={(budget) => setForm((f) => ({ ...f, budget }))}
          />
        )}
        {currentKey === 'creative' && (
          <CreativeStep
            objective={form.objective}
            creative={form.creative}
            onChange={(creative) => setForm((f) => ({ ...f, creative }))}
          />
        )}
        {currentKey === 'leadform' && (
          <LeadFormStep
            leadForm={form.lead_form}
            onChange={(lead_form) => setForm((f) => ({ ...f, lead_form }))}
          />
        )}
        {currentKey === 'review' && (
          <ReviewStep
            form={form}
            onCreativeChange={(creative) => setForm((f) => ({ ...f, creative }))}
            onEditStep={(key) => {
              const idx = steps.indexOf(key)
              if (idx >= 0) {
                setStepError(null)
                setStepIdx(idx)
              }
            }}
            onPublishComplete={() => navigate(paths.ads)}
          />
        )}

        {stepError && <Alert severity="error" sx={{ mt: 2 }}>{stepError}</Alert>}

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={back} disabled={stepIdx === 0}>Back</Button>
          {currentKey !== 'review' && (
            <Button variant="contained" onClick={next}>Next</Button>
          )}
          {currentKey === 'review' && (
            <Button onClick={() => navigate(paths.ads)} color="inherit">Cancel</Button>
          )}
        </Box>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        Connected: {setup?.ad_account_name || setup?.ad_account_id} · {setup?.page_name || setup?.page_id}
      </Typography>
    </Stack>
  )
}

export default AdsCreatePage
