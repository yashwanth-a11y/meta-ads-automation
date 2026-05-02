import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import LanguageIcon from '@mui/icons-material/Language'
import ContactPageIcon from '@mui/icons-material/ContactPage'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import { useState } from 'react'
import type { WizardObjective } from './types'

type Props = {
  value: WizardObjective | null
  onChange: (next: WizardObjective) => void
  hasWaba?: boolean
  // Optional AI props. When `onAiGenerate` is provided we render the
  // "describe your ad" prompt UI above the manual objective picker.
  onAiGenerate?: (prompt: string) => Promise<void> | void
  aiLoading?: boolean
  aiError?: string | null
}

const OPTIONS: {
  key: WizardObjective
  title: string
  description: string
  icon: React.ReactNode
}[] = [
  {
    key: 'WEBSITE_TRAFFIC',
    title: 'Website Traffic',
    description: 'Send people to a landing page or product. Pay per impression, optimize for link clicks.',
    icon: <LanguageIcon fontSize="large" />,
  },
  {
    key: 'LEAD_GEN',
    title: 'Lead Generation',
    description: "Collect emails, phones, and custom answers via Meta's instant lead form. Submissions sync back here.",
    icon: <ContactPageIcon fontSize="large" />,
  },
  {
    key: 'CTWA',
    title: 'Click to WhatsApp',
    description: 'Open a WhatsApp conversation with your business. Best for high-intent inbound funnels.',
    icon: <WhatsAppIcon fontSize="large" />,
  },
]

const PROMPT_EXAMPLES = [
  'Promote our new vegan dog food to pet parents in Bangalore aged 25-45. Send them to https://example.com/dog-food.',
  'Generate enquiries for our solar panel installation service in Pune. Collect name, phone, and roof size.',
  'Get people to start a WhatsApp chat with our salon to book a haircut.',
]

export function ObjectiveStep({ value, onChange, hasWaba, onAiGenerate, aiLoading, aiError }: Props) {
  const [prompt, setPrompt] = useState('')
  // The AI panel is hidden by default — user must opt in via the
  // "Generate with AI" button. Loading state forces the panel open so the
  // user can see what's happening even if they collapsed it mid-generation.
  const [aiMode, setAiMode] = useState(false)

  const submit = () => {
    if (!onAiGenerate || aiLoading) return
    if (prompt.trim().length < 10) return
    onAiGenerate(prompt.trim())
  }

  const closeAi = () => {
    if (aiLoading) return
    setAiMode(false)
    setPrompt('')
  }

  const showAi = aiMode || aiLoading

  return (
    <Stack spacing={3}>
      {onAiGenerate && !showAi && (
        // Collapsed CTA — single button that opens the prompt panel.
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderStyle: 'dashed',
            borderColor: (t) => alpha(t.palette.primary.main, 0.5),
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
          }}
        >
          <Box sx={{ p: 2.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <AutoAwesomeIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Generate with AI
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Describe your ad in one sentence and we'll fill in the objective, audience, budget and copy.
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => setAiMode(true)}
                sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
              >
                Generate with AI
              </Button>
            </Stack>
          </Box>
        </Card>
      )}

      {onAiGenerate && showAi && (
        // Expanded panel — prompt textarea + examples + Generate.
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: (t) => alpha(t.palette.primary.main, 0.5),
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            p: 2.5,
          }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <AutoAwesomeIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                Describe your ad — we'll fill the rest
              </Typography>
              <IconButton size="small" onClick={closeAi} disabled={aiLoading} aria-label="Close AI panel">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <TextField
              fullWidth
              multiline
              minRows={3}
              autoFocus
              placeholder={`e.g. "${PROMPT_EXAMPLES[0]}"`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={aiLoading}
              slotProps={{ htmlInput: { maxLength: 4000 } }}
              helperText={
                prompt.length > 0 && prompt.trim().length < 10
                  ? 'Add a bit more detail (at least 10 characters)'
                  : `${prompt.length}/4000`
              }
            />

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {PROMPT_EXAMPLES.map((ex, i) => (
                <Box
                  key={i}
                  onClick={() => !aiLoading && setPrompt(ex)}
                  sx={{
                    fontSize: 12,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 999,
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    border: (t) => `1px solid ${alpha(t.palette.divider, 0.6)}`,
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary', bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
                  }}
                >
                  {ex.length > 60 ? `${ex.slice(0, 60)}…` : ex}
                </Box>
              ))}
            </Stack>

            {aiError && <Alert severity="error">{aiError}</Alert>}

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Button
                variant="contained"
                startIcon={aiLoading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                onClick={submit}
                disabled={aiLoading || prompt.trim().length < 10}
              >
                {aiLoading ? 'Generating campaign…' : 'Generate'}
              </Button>
              <Button onClick={closeAi} disabled={aiLoading} color="inherit">
                Cancel
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', display: { xs: 'none', md: 'block' } }}>
                You'll review &amp; upload media before publishing.
              </Typography>
            </Stack>
          </Stack>
        </Card>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        What is the goal of this campaign?
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {OPTIONS.map((o) => {
          const selected = value === o.key
          const disabled = o.key === 'CTWA' && hasWaba === false
          return (
            <Card
              key={o.key}
              variant="outlined"
              sx={{
                flex: 1,
                borderColor: (t) => (selected ? t.palette.primary.main : alpha(t.palette.divider, 0.6)),
                bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.06) : 'transparent'),
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <CardActionArea disabled={disabled} onClick={() => onChange(o.key)} sx={{ p: 2.5, height: '100%' }}>
                <Stack spacing={1.5}>
                  <Box sx={{ color: selected ? 'primary.main' : 'text.secondary' }}>{o.icon}</Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {o.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {o.description}
                  </Typography>
                  {disabled && (
                    <Typography variant="caption" color="warning.main">
                      Connect a WhatsApp Business Account to your Page first.
                    </Typography>
                  )}
                </Stack>
              </CardActionArea>
            </Card>
          )
        })}
      </Stack>
    </Stack>
  )
}

export default ObjectiveStep
