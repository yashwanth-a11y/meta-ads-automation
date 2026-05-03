import { useState, type KeyboardEvent } from 'react'
import { Box, Button, Chip, CircularProgress, Stack, TextField } from '@mui/material'
import { alpha } from '@mui/material/styles'

interface ChipInputProps {
  label: string
  helperText?: string
  values: string[]
  onChange: (next: string[]) => void
  validate?: (val: string) => string | null
  asyncValidate?: (val: string) => Promise<string | null>
  transform?: (val: string) => string
}

export function ChipInput({ label, helperText, values, onChange, validate, asyncValidate, transform }: ChipInputProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const add = async () => {
    const raw = input.trim()
    if (!raw) return
    const val = transform ? transform(raw) : raw
    const syncErr = validate ? validate(val) : null
    if (syncErr) { setError(syncErr); return }
    if (asyncValidate) {
      setChecking(true)
      const asyncErr = await asyncValidate(val).catch(() => 'Verification failed — check your connection')
      setChecking(false)
      if (asyncErr) { setError(asyncErr); return }
    }
    if (!values.includes(val)) onChange([...values, val])
    setInput('')
    setError(null)
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  return (
    <Box>
      <TextField
        label={label}
        placeholder="Type and press Enter to add"
        value={input}
        onChange={(e) => { setInput(e.target.value); if (error) setError(null) }}
        onKeyDown={handleKey}
        autoComplete="off"
        error={!!error}
        disabled={checking}
        helperText={error ?? helperText ?? ' '}
        InputProps={{
          endAdornment: checking ? (
            <CircularProgress size={16} sx={{ mr: 1 }} />
          ) : input.trim() ? (
            <Button size="small" onClick={add} sx={{ minWidth: 0, px: 1, fontSize: 12 }}>Add</Button>
          ) : undefined,
        }}
      />
      {values.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '6px', mt: 1 }}>
          {values.map((v) => (
            <Chip
              key={v}
              label={v}
              size="small"
              onDelete={() => onChange(values.filter((x) => x !== v))}
              sx={{
                height: 24,
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '8px',
                bgcolor: alpha('#22D3EE', 0.08),
                color: '#0EA5B7',
                border: `1px solid ${alpha('#22D3EE', 0.2)}`,
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}
