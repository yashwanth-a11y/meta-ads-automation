import { useEffect, useState } from 'react'
import {
  Drawer,
  Box,
  Stack,
  Typography,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Divider,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined'
import type { CrmStage } from '../../api/crm'

interface Props {
  open: boolean
  stages: CrmStage[]
  onClose: () => void
  onSubmit: (data: {
    name: string
    email: string
    phone: string
    company: string
    source: string
    stage_id: string
    tags: string
    follow_up_at: string
  }) => void
  loading?: boolean
}

const SOURCES = [
  'Meta Lead Form',
  'Organic Search',
  'Partner Referral',
  'Webinar',
  'Cold Outreach',
  'Direct',
  'Referral',
  'Event',
]

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  source: '',
  stage_id: '',
  tags: '',
  follow_up_at: '',
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: 1,
          display: 'grid',
          placeItems: 'center',
          color: 'text.secondary',
          bgcolor: alpha('#0f172a', 0.05),
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="overline"
        sx={{
          fontWeight: 700,
          fontSize: '0.7rem',
          letterSpacing: 1,
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Stack>
  )
}

export function AddLeadDrawer({
  open,
  stages,
  onClose,
  onSubmit,
  loading,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM)

  // Reset to a clean form whenever the drawer closes so reopening doesn't
  // surface stale input from the previous attempt.
  useEffect(() => {
    if (!open) setForm(EMPTY_FORM)
  }, [open])

  const set =
    (k: keyof typeof EMPTY_FORM) =>
      (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }))

  const canSubmit = form.name.trim().length > 0 && !loading

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(form)
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100vw', sm: 600 },
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: '0px',
          },
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2.5,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Add new lead
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Create a lead and place it on the pipeline.
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose} aria-label="Close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {/* Body — scrollable */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2.5,
            py: 2.5,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha('#0f172a', 0.12),
              borderRadius: 3,
            },
          }}
        >
          {/* Contact section */}
          <SectionHeader
            icon={<PersonOutlineOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Contact"
          />
          <Stack spacing={1.75}>
            <TextField
              label="Full name"
              required
              value={form.name}
              onChange={set('name')}
              size="small"
              fullWidth
              autoFocus
              placeholder="e.g. Jane Cooper"
            />
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={set('email')}
                size="small"
                fullWidth
                placeholder="jane@example.com"
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={set('phone')}
                size="small"
                fullWidth
                placeholder="+1 555 123 4567"
              />
            </Stack>
            <TextField
              label="Company"
              value={form.company}
              onChange={set('company')}
              size="small"
              fullWidth
              placeholder="Acme Corp"
            />
          </Stack>

          <Divider sx={{ my: 3 }} />

          {/* Pipeline section */}
          <SectionHeader
            icon={<AccountTreeOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Pipeline"
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Source"
              value={form.source}
              onChange={set('source')}
              size="small"
              fullWidth
              select
            >
              <MenuItem value="">— None —</MenuItem>
              {SOURCES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Stage"
              value={form.stage_id}
              onChange={set('stage_id')}
              size="small"
              fullWidth
              select
            >
              <MenuItem value="">— None —</MenuItem>
              {stages.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: s.color,
                        flexShrink: 0,
                      }}
                    />
                    <span>{s.name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Divider sx={{ my: 3 }} />

          {/* Tags & follow-up */}
          <SectionHeader
            icon={<LocalOfferOutlinedIcon sx={{ fontSize: 16 }} />}
            label="Tags & follow-up"
          />
          <Stack spacing={1.75}>
            <TextField
              label="Tags"
              value={form.tags}
              onChange={set('tags')}
              size="small"
              fullWidth
              placeholder="enterprise, hot-lead, SaaS"
              helperText="Comma-separated. Press Enter inside the next field to add multiple."
            />
            <TextField
              label="Follow-up date"
              type="date"
              value={form.follow_up_at}
              onChange={set('follow_up_at')}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </Box>

        {/* Footer — sticky actions */}
        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'flex-end' }}
          >
            <Button
              onClick={onClose}
              disabled={loading}
              sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!canSubmit}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                px: 2.5,
                minWidth: 120,
              }}
            >
              {loading ? 'Adding…' : 'Add lead'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  )
}
