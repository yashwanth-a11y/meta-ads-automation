import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import LanguageIcon from '@mui/icons-material/Language'
import ContactPageIcon from '@mui/icons-material/ContactPage'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import type { WizardObjective } from './types'

type Props = {
  value: WizardObjective | null
  onChange: (next: WizardObjective) => void
  hasWaba?: boolean
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
    description: 'Collect emails, phones, and custom answers via Meta\'s instant lead form. Submissions sync back here.',
    icon: <ContactPageIcon fontSize="large" />,
  },
  {
    key: 'CTWA',
    title: 'Click to WhatsApp',
    description: 'Open a WhatsApp conversation with your business. Best for high-intent inbound funnels.',
    icon: <WhatsAppIcon fontSize="large" />,
  },
]

export function ObjectiveStep({ value, onChange, hasWaba }: Props) {
  return (
    <Stack spacing={2}>
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
                // borderRadius: 3,
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
