import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined'
import { GlassCard } from '../../ui/GlassCard'
import type { ChannelApprover } from '../../../api/trends'

interface ApproversCardProps {
  approvers: ChannelApprover[]
  setApprovers: (approvers: ChannelApprover[]) => void
}

export function ApproversCard({ approvers, setApprovers }: ApproversCardProps) {
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'approver' | 'reviewer'>('approver')
  const [emailError, setEmailError] = useState('')

  const add = () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@')) { setEmailError('Enter a valid email address'); return }
    if (approvers.some((a) => a.email === email)) { setEmailError('Already in list'); return }
    setApprovers([...approvers, { email, role: newRole }])
    setNewEmail('')
    setEmailError('')
  }

  const remove = (email: string) => setApprovers(approvers.filter((a) => a.email !== email))

  return (
    <GlassCard sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Approvers</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        People who receive approval emails for this channel's generated reels
      </Typography>

      {approvers.length > 0 ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          {approvers.map((a) => (
            <Stack
              key={a.email}
              direction="row"
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                borderRadius: '10px',
                border: `1px solid ${alpha('#64748B', 0.18)}`,
                bgcolor: (t) => alpha(t.palette.background.paper, 0.5),
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.email}</Typography>
                <Chip
                  label={a.role}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    bgcolor: a.role === 'approver' ? alpha('#22D3EE', 0.1) : alpha('#A78BFA', 0.1),
                    color: a.role === 'approver' ? '#0EA5B7' : '#7C3AED',
                    border: `1px solid ${a.role === 'approver' ? alpha('#22D3EE', 0.25) : alpha('#A78BFA', 0.25)}`,
                  }}
                />
              </Stack>
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  onClick={() => remove(a.email)}
                  sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 2, fontStyle: 'italic' }}>
          No approvers added yet. Add at least one to enable approval emails.
        </Typography>
      )}

      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label="Email address"
          placeholder="approver@company.com"
          value={newEmail}
          onChange={(e) => { setNewEmail(e.target.value); setEmailError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          error={!!emailError}
          helperText={emailError || ' '}
          autoComplete="off"
          size="small"
          sx={{ flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Role</InputLabel>
          <Select value={newRole} label="Role" onChange={(e) => setNewRole(e.target.value as 'approver' | 'reviewer')}>
            <MenuItem value="approver">Approver</MenuItem>
            <MenuItem value="reviewer">Reviewer</MenuItem>
          </Select>
          <FormHelperText> </FormHelperText>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<PersonAddAlt1OutlinedIcon />}
          onClick={add}
          sx={{ height: 40, mt: 0.25, whiteSpace: 'nowrap' }}
        >
          Add
        </Button>
      </Stack>
    </GlassCard>
  )
}
