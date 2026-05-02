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
import CloudUploadIcon from '@mui/icons-material/CloudUploadOutlined'
import { useState } from 'react'
import { adsApi, ApiError } from '../../../api'
import type { CreateCampaignInput, ValidateCampaignResult } from '../../../api/types'
import type { WizardForm } from './types'
import { toCreateCampaignInput } from './types'
import { GlassCard } from '../../ui/GlassCard'

// Wizard step keys that the Review screen can request the parent to jump to.
// Subset of the parent's StepKey — the parent decides which of these are
// actually present in `steps` for the chosen objective (LEAD_GEN includes
// 'leadform', the others don't).
export type EditableStep = 'objective' | 'audience' | 'budget' | 'creative' | 'leadform'

type Props = {
  form: WizardForm
  // Lets the user upload media inline on the Review step (used by the AI
  // flow that lands here with everything filled except media).
  onCreativeChange?: (next: WizardForm['creative']) => void
  // Jump back to a previous step so the user can correct a value the AI
  // (or they) filled in. Parent maps `key` to its own stepIdx.
  onEditStep?: (key: EditableStep) => void
  onPublishComplete: (campaignId: string) => void
}

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_MIME = ['video/mp4', 'video/quicktime']
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

const STEPS: ('campaign' | 'adset' | 'creative' | 'ad')[] = ['campaign', 'adset', 'creative', 'ad']

export function ReviewStep({ form, onCreativeChange, onEditStep, onPublishComplete }: Props) {
  const [validateResult, setValidateResult] = useState<ValidateCampaignResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const hasMedia = Boolean(form.creative.image_hash || form.creative.video_id)

  const handleFile = async (file: File) => {
    if (!onCreativeChange) return
    setUploadError(null)
    if (form.creative.media_type === 'image') {
      if (!IMAGE_MIME.includes(file.type)) {
        setUploadError('Image must be JPEG, PNG, or WebP.')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError('Image must be 30 MB or smaller.')
        return
      }
    } else {
      if (!VIDEO_MIME.includes(file.type)) {
        setUploadError('Video must be MP4 or MOV.')
        return
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setUploadError('Video must be 200 MB or smaller.')
        return
      }
    }
    setUploading(true)
    try {
      if (form.creative.media_type === 'image') {
        const result = await adsApi.uploadAdImageFile(file)
        onCreativeChange({
          ...form.creative,
          image_hash: result.hash,
          // Prefer Meta's CDN URL for the preview (stable, survives refresh).
          // Fall back to a local Blob URL if the response didn't include one.
          image_preview_url: result.url || URL.createObjectURL(file),
        })
      } else {
        // Video upload route isn't wired on the backend right now. Show a
        // clear message instead of a confusing 404.
        setUploadError(
          'Video upload is not enabled yet. Use "Use image instead" above and upload an image.',
        )
      }
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

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
      <Typography variant="subtitle1">Review and publish</Typography>

      {buildError && <Alert severity="error">{buildError}</Alert>}

      {/* === Basics === */}
      <Section title="Campaign basics" onEdit={onEditStep && (() => onEditStep('objective'))}>
        <Row label="Objective" value={objectiveLabel(form.objective)} />
        <Row label="Auto-generated name" value={previewCampaignName(form)} />
      </Section>

      {/* === Audience === */}
      <Section title="Audience" onEdit={onEditStep && (() => onEditStep('audience'))}>
        <Row 
          label="Locations"
          value={form.audience.locations.map((l) => l.name).join(', ') || '—'}
        />
        <Row label="Age range" value={`${form.audience.age_min} – ${form.audience.age_max}`} />
        <Row label="Gender" value={genderLabel(form.audience.genders)} />
        <Row
          label="Interests"
          value={
            form.audience.interests.length > 0
              ? form.audience.interests.map((i) => i.name).join(', ')
              : 'None — using broad targeting'
          }
        />
        <Row
          label="Advantage+ Audience"
          value={form.audience.advantage_audience ? 'Enabled (Meta expands matching)' : 'Disabled'}
        />
        <Row
          label="Languages"
          value={
            form.audience.locales.length > 0
              ? form.audience.locales.map((id) => LOCALE_NAMES[id] || `#${id}`).join(', ')
              : 'All languages'
          }
        />
        <Row label="Devices" value={deviceLabel(form.audience.device_platforms)} />
        <Row label="Placements" value={placementsLabel(form.audience)} multiline />
        <Row
          label="Special category"
          value={form.audience.special_ad_categories.join(', ') || 'NONE'}
        />
      </Section>

      {/* === Budget & schedule === */}
      <Section title="Budget & schedule" onEdit={onEditStep && (() => onEditStep('budget'))}>
        <Row
          label="Budget"
          value={`${formatMoney(form.budget.amount)} ${form.budget.type === 'daily' ? 'per day' : 'lifetime'}`}
        />
        <Row label="Start" value={formatDate(form.budget.start_date) || 'On publish'} />
        <Row label="End" value={formatDate(form.budget.end_date) || (form.budget.type === 'lifetime' ? '— (required for lifetime)' : 'No end date')} />
        <Row label="Bidding" value={bidStrategyLabel(form.budget)} multiline />
      </Section>

      {/* === Creative === */}
      <Section title="Creative" onEdit={onEditStep && (() => onEditStep('creative'))}>
        <Row label="Media type" value={form.creative.media_type === 'video' ? 'Single video' : 'Single image'} />
        <Row label="Headline" value={form.creative.headline || '(empty)'} />
        <Row label="Primary text" value={form.creative.primary_text || '(empty)'} multiline />
        <Row label="Description" value={form.creative.description || '(empty)'} />
        <Row label="Call to action" value={ctaLabel(form.creative.cta_type)} />
        {form.objective === 'WEBSITE_TRAFFIC' && (
          <Row label="Destination URL" value={form.creative.destination_url || '— (required)'} />
        )}
        {form.objective === 'CTWA' && (
          <Row
            label="WhatsApp number"
            value={form.creative.whatsapp_number || 'Use connected business number'}
          />
        )}
        <Row
          label="Media uploaded"
          value={
            form.creative.image_hash
              ? `Image · hash ${form.creative.image_hash.slice(0, 12)}…`
              : form.creative.video_id
              ? `Video · id ${form.creative.video_id}`
              : 'Not uploaded yet'
          }
        />
      </Section>

      {/* === Lead form (only when objective = LEAD_GEN) === */}
      {form.objective === 'LEAD_GEN' && (
        <Section title="Lead form" onEdit={onEditStep && (() => onEditStep('leadform'))}>
          <Row
            label="Mode"
            value={form.lead_form.mode === 'pick' ? 'Pick from existing forms' : 'Create new form'}
          />
          {form.lead_form.mode === 'pick' && (
            <Row label="Form ID" value={form.lead_form.selected_form_id || '— (none picked)'} />
          )}
          {form.lead_form.mode === 'create' && form.lead_form.new_form && (
            <>
              <Row label="Form name" value={form.lead_form.new_form.name || '(unnamed)'} />
              <Row label="Locale" value={form.lead_form.new_form.locale} />
              <Row
                label="Questions"
                value={
                  form.lead_form.new_form.questions.length > 0
                    ? form.lead_form.new_form.questions
                        .map((q) => q.label || q.type.replace(/_/g, ' ').toLowerCase())
                        .join(', ')
                    : '(none)'
                }
                multiline
              />
              <Row
                label="Privacy policy"
                value={form.lead_form.new_form.privacy_policy_url || '— (required)'}
              />
              <Row
                label="Thank-you page"
                value={`${form.lead_form.new_form.thank_you_title} · ${form.lead_form.new_form.thank_you_button_type}`}
              />
            </>
          )}
        </Section>
      )}

      {/* Inline media uploader. Always visible on Review so the AI flow
          (which lands here without media) has a place to attach an image
          or video. If media is already attached we show a smaller preview. */}
      {onCreativeChange && (
        <GlassCard variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
                Media
              </Typography>
              {hasMedia && (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label={form.creative.media_type === 'video' ? 'Video attached' : 'Image attached'}
                />
              )}
            </Stack>

            {!hasMedia && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Add an {form.creative.media_type === 'video' ? 'MP4 / MOV video' : 'image'} to publish.
                AI generates the copy and targeting, you bring the visual.
              </Alert>
            )}

            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                disabled={uploading}
              >
                {uploading
                  ? 'Uploading…'
                  : hasMedia
                  ? 'Replace media'
                  : form.creative.media_type === 'video'
                  ? 'Upload video'
                  : 'Upload image'}
                <input
                  hidden
                  type="file"
                  accept={form.creative.media_type === 'image' ? IMAGE_MIME.join(',') : VIDEO_MIME.join(',')}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </Button>

              {/* Quick toggle so the user can switch between image / video
                  here without bouncing back to the Creative step. */}
              <Button
                size="small"
                variant="text"
                onClick={() =>
                  onCreativeChange({
                    ...form.creative,
                    media_type: form.creative.media_type === 'image' ? 'video' : 'image',
                    image_hash: undefined,
                    video_id: undefined,
                    image_preview_url: undefined,
                    video_thumbnail_url: undefined,
                  })
                }
                disabled={uploading}
              >
                Use {form.creative.media_type === 'image' ? 'video' : 'image'} instead
              </Button>
            </Stack>

            {form.creative.media_type === 'image' && form.creative.image_preview_url && (
              <Box sx={{ mt: 2 }}>
                <img
                  src={form.creative.image_preview_url}
                  alt="Ad preview"
                  style={{ maxWidth: 280, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
                />
              </Box>
            )}
            {form.creative.media_type === 'video' && form.creative.video_thumbnail_url && (
              <Box sx={{ mt: 2 }}>
                <video
                  src={form.creative.video_thumbnail_url}
                  controls
                  style={{ maxWidth: 280, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
                />
              </Box>
            )}
            {uploadError && <Alert severity="error" sx={{ mt: 1.5 }}>{uploadError}</Alert>}
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
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
            <Typography variant="subtitle2" color="text.secondary">
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
      </GlassCard>

      <Divider />

      {publishError && <Alert severity="error">{publishError}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
        <ButtonGroup variant="contained" disabled={publishing || !hasMedia}>
          <Button variant='text' onClick={() => publish('paused')}>
            {publishing ? 'Saving…' : 'Save as Paused'}
          </Button>
          <Button
          variant='text'
            color="success"
            onClick={() => publish('live')}
            disabled={!validateOk || !hasMedia}
          >
            {publishing ? 'Publishing…' : 'Publish Live'}
          </Button>
        </ButtonGroup>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
        {!hasMedia
          ? 'Upload an image or video above to enable Publish.'
          : '"Publish Live" requires a passing validation. "Save as Paused" creates the campaign in Meta but doesn\'t deliver until you flip it on.'}
      </Typography>
    </Stack>
  )
}

// Reusable section wrapper. Header carries the section title and a single
// section-level Edit button — replaces the per-row Edit pattern that got
// noisy once we surfaced 25+ fields.
function Section({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit?: () => void
  children: React.ReactNode
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
        '&:hover': {
          // borderColor: (t) => t.palette.primary.main,
          boxShadow: (t) => `0 8px 24px ${t.palette.divider}`,
        },
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            mb: 2,
            pb: 1.5,
            borderBottom: (t) => `1px solid ${t.palette.divider}`,
          }}
        >
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ flex: 1, letterSpacing: 1.2, fontWeight: 500 }}
          >
            {title}
          </Typography>
          {onEdit && (
            <Button
              size="small"
              variant="text"
              onClick={onEdit}
              sx={{
                fontSize: '13px !important',
                        fontWeight: '500',
                        letterSpacing: '0.1rem',
                        whiteSpace: 'nowrap',
                        borderRadius: "0px",
                        textTransform: "uppercase",
                        // padding:"8px 20px",
                        height: "unset !important",
                        minHeight: "unset !important",
              }}
            >
              Edit
            </Button>
          )}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
            columnGap: 3,
            rowGap: 2,
          }}
        >
          {children}
        </Box>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <Stack
      spacing={0.5}
      sx={{
        gridColumn: multiline ? { xs: '1 / -1', sm: '1 / -1' } : 'auto',
        minWidth: 0,
      }}
    >
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 500,
          color: 'text.primary',
          lineHeight: 1.3,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          fontWeight: 400,
          color: 'text.secondary',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {value}
      </Typography>
    </Stack>
  )
}

// === Formatters / labels ===

function objectiveLabel(o: WizardForm['objective']) {
  if (!o) return '—'
  return o === 'WEBSITE_TRAFFIC'
    ? 'Website Traffic'
    : o === 'LEAD_GEN'
    ? 'Lead Generation'
    : 'Click to WhatsApp'
}

function genderLabel(g: WizardForm['audience']['genders']) {
  return g === 'all' ? 'All genders' : g.charAt(0).toUpperCase() + g.slice(1)
}

function deviceLabel(d: WizardForm['audience']['device_platforms']) {
  if (!d || d.length === 0) return 'All devices'
  if (d.length === 1) return d[0] === 'mobile' ? 'Mobile only' : 'Desktop only'
  return d.join(', ')
}

function placementsLabel(a: WizardForm['audience']) {
  if (a.placement_mode === 'auto') return 'Advantage+ Placements (auto)'
  if (a.publisher_platforms.length === 0) return 'Manual — none selected (campaign will fail)'
  const lines: string[] = []
  for (const p of a.publisher_platforms) {
    const positions =
      p === 'facebook'
        ? a.facebook_positions
        : p === 'instagram'
        ? a.instagram_positions
        : p === 'messenger'
        ? a.messenger_positions
        : a.audience_network_positions
    const platformLabel =
      p === 'facebook'
        ? 'Facebook'
        : p === 'instagram'
        ? 'Instagram'
        : p === 'messenger'
        ? 'Messenger'
        : 'Audience Network'
    lines.push(
      positions.length > 0
        ? `${platformLabel} (${positions.join(', ')})`
        : `${platformLabel} (all positions)`,
    )
  }
  return lines.join('\n')
}

function bidStrategyLabel(b: WizardForm['budget']) {
  switch (b.bid_strategy) {
    case 'LOWEST_COST_WITHOUT_CAP':
      return 'Lowest cost (recommended) — no cap'
    case 'LOWEST_COST_WITH_BID_CAP':
      return `Bid cap: ${b.bid_amount != null ? formatMoney(b.bid_amount) : '— missing'}`
    case 'COST_CAP':
      return `Cost cap: ${b.bid_amount != null ? formatMoney(b.bid_amount) : '— missing'}`
    case 'LOWEST_COST_WITH_MIN_ROAS':
      return `Min ROAS: ${b.roas_average_floor != null ? `${b.roas_average_floor}x` : '— missing'}`
    default:
      return b.bid_strategy
  }
}

function ctaLabel(cta: string) {
  if (!cta) return '—'
  return cta.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatMoney(amount: number | undefined | null) {
  if (amount == null || Number.isNaN(amount)) return '—'
  // Account currency isn't passed into ReviewStep; leave the symbol off and
  // just show the number. Currency symbol is shown inline in BudgetStep.
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatDate(s: string | undefined | null) {
  if (!s) return ''
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return s
  }
}

// Mirror of the auto-naming rule in toCreateCampaignInput so the user can
// see what name the campaign will be created with on Meta.
function previewCampaignName(f: WizardForm): string {
  const objLabel =
    f.objective === 'WEBSITE_TRAFFIC' ? 'Traffic'
    : f.objective === 'LEAD_GEN' ? 'Leads'
    : f.objective === 'CTWA' ? 'WhatsApp'
    : 'Untitled'
  const headline = (f.creative.headline || '').trim().slice(0, 40) || 'Untitled'
  return `${objLabel} — ${headline} — ${new Date().toISOString().slice(0, 10)}`
}

// Same locale subset as AudienceStep — kept local to avoid an import cycle.
const LOCALE_NAMES: Record<number, string> = {
  6: 'English (US)',
  24: 'Hindi',
  16: 'Spanish (Spain)',
  23: 'Spanish (Latin America)',
  9: 'French',
  17: 'German',
  10: 'Italian',
  19: 'Portuguese (Brazil)',
  46: 'Tamil',
  53: 'Telugu',
  54: 'Bengali',
  55: 'Marathi',
  68: 'Arabic',
  41: 'Japanese',
  31: 'Korean',
  101: 'Indonesian',
  104: 'Vietnamese',
  64: 'Turkish',
  74: 'Russian',
  108: 'Thai',
}

export default ReviewStep
