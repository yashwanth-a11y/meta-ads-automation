import { useState, type KeyboardEvent } from 'react'
import { Box, Button, Chip, Stack, TextField } from '@mui/material'
import { alpha } from '@mui/material/styles'

interface ChipInputProps {
  label: string
  helperText?: string
  values: string[]
  onChange: (next: string[]) => void
}

export function ChipInput({ label, helperText, values, onChange }: ChipInputProps) {
  const [input, setInput] = useState('')

  const add = () => {
    const val = input.trim()
    if (val && !values.includes(val)) onChange([...values, val])
    setInput('')
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
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        autoComplete="off"
        helperText={helperText ?? ' '}
        InputProps={{
          endAdornment: input.trim() ? (
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
