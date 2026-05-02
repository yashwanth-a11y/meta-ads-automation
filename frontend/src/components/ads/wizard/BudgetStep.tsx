import {
  Alert,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputAdornment,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { WizardForm } from './types'

type Props = {
  budget: WizardForm['budget']
  currency?: string | null
  onChange: (next: WizardForm['budget']) => void
}

// Currency-symbol helper. Falls back to the currency code when Intl can't
// resolve a localized symbol — e.g. lesser-used codes.
function currencySymbol(code?: string | null) {
  if (!code) return '$'
  try {
    return (0)
      .toLocaleString(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .replace(/\d|[\s.,]/g, '')
      || code
  } catch {
    return code
  }
}

export function BudgetStep({ budget, currency, onChange }: Props) {
  const symbol = currencySymbol(currency)
  const isLifetime = budget.type === 'lifetime'

  // Today (yyyy-mm-dd) for `min` attribute on date inputs.
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <Stack spacing={3}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>How much do you want to spend?</Typography>

      <FormControl>
        <FormLabel sx={{ mb: 1 }}>Budget type</FormLabel>
        <RadioGroup
          row
          value={budget.type}
          onChange={(e) => onChange({ ...budget, type: e.target.value as 'daily' | 'lifetime' })}
        >
          <FormControlLabel value="daily" control={<Radio />} label="Daily" />
          <FormControlLabel value="lifetime" control={<Radio />} label="Lifetime" />
        </RadioGroup>
      </FormControl>

      <TextField
        label={isLifetime ? `Lifetime budget (${currency || 'USD'})` : `Daily budget (${currency || 'USD'})`}
        type="number"
        value={budget.amount}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start">{symbol}</InputAdornment>,
          },
          htmlInput: { min: 1, step: 0.01 },
        }}
        onChange={(e) => onChange({ ...budget, amount: Math.max(0, parseFloat(e.target.value) || 0) })}
        helperText={
          isLifetime
            ? 'Total spent across the campaign run. Requires an end date.'
            : 'Average spent per day. Meta may go up to ~25% over on busy days.'
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Start date"
          type="date"
          fullWidth
          value={budget.start_date?.slice(0, 10) || ''}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayStr } }}
          onChange={(e) =>
            onChange({
              ...budget,
              start_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            })
          }
          helperText="Leave blank to start immediately when you publish."
        />
        <TextField
          label={`End date${isLifetime ? ' *' : ''}`}
          type="date"
          fullWidth
          value={budget.end_date?.slice(0, 10) || ''}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: budget.start_date?.slice(0, 10) || todayStr } }}
          onChange={(e) =>
            onChange({
              ...budget,
              end_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            })
          }
          required={isLifetime}
          error={isLifetime && !budget.end_date}
          helperText={isLifetime ? 'Required for lifetime budgets.' : 'Optional. Leave blank to run indefinitely.'}
        />
      </Stack>

      {budget.amount > 0 && budget.amount < 1 && (
        <Alert severity="warning">Most ad accounts require at least 1.00 of account currency per day.</Alert>
      )}
    </Stack>
  )
}

export default BudgetStep
