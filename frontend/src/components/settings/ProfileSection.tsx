import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import { GlassCard } from '../ui/GlassCard'
import { put } from '../../api/client'
import type { AuthUser } from '../../auth'

export function ProfileSection() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem('auth_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await put<{ user: AuthUser }>('/auth/me', {
        first_name: firstName,
        last_name: lastName,
        phone: phone
      })
      
      // Update local storage so the sidebar reflects changes immediately
      if (result?.user) {
        localStorage.setItem('auth_user', JSON.stringify(result.user))
        setUser(result.user)
        // Force the sidebar to update by dispatching a storage event
        window.dispatchEvent(new Event('storage'))
      }
      
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2.5}>
      <GlassCard sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Personal Information</Typography>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <TextField
              fullWidth
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Box>
          <TextField
            fullWidth
            label="Phone Number (E.164 format, e.g. +14155552671)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            helperText="Required for WhatsApp integration. We will automatically link incoming WhatsApp messages from this number to your account."
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
        </Stack>
      </GlassCard>

      <Box>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving}
          startIcon={saved ? <CheckCircleOutlineIcon /> : undefined}
          sx={{ minWidth: 160, height: 44 }}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Profile'}
        </Button>
      </Box>
    </Stack>
  )
}
