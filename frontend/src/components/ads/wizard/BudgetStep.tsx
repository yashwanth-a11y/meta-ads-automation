import {
  Alert,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
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

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
        <TextField
          select
          label="Budget type"
          value={budget.type}
          sx={{ minWidth: { xs: '100%', sm: 180 } }}
          onChange={(e) => onChange({ ...budget, type: e.target.value as 'daily' | 'lifetime' })}
        >
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="lifetime">Lifetime</MenuItem>
        </TextField>

        <TextField
          sx={{ flexGrow: 1 }}
          fullWidth
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
      </Stack>

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

      <Divider sx={{ my: 1 }} />

      {/* Bid strategy. Default = "Lowest cost" (no cap), which is what 95%
          of SMBs want. The other strategies require an explicit bid_amount
          (or roas_average_floor for ROAS) — surface those inputs only when
          the corresponding strategy is selected. */}
      <FormControl fullWidth>
        <FormLabel sx={{ mb: 1 }}>Bidding</FormLabel>
        <Select
          value={budget.bid_strategy}
          onChange={(e) =>
            onChange({
              ...budget,
              bid_strategy: e.target.value as WizardForm['budget']['bid_strategy'],
              // Reset cap inputs when switching to a strategy that doesn't use them.
              ...(e.target.value === 'LOWEST_COST_WITHOUT_CAP'
                ? { bid_amount: undefined, roas_average_floor: undefined }
                : {}),
            })
          }
        >
          <MenuItem value="LOWEST_COST_WITHOUT_CAP">
            Lowest cost (recommended) — Meta spends to get the most results
          </MenuItem>
          <MenuItem value="LOWEST_COST_WITH_BID_CAP">
            Bid cap — never bid above your cap
          </MenuItem>
          <MenuItem value="COST_CAP">
            Cost cap — keep avg cost-per-result around your cap
          </MenuItem>
          <MenuItem value="LOWEST_COST_WITH_MIN_ROAS">
            Min ROAS — only spend when projected ROAS clears your floor
          </MenuItem>
        </Select>
        <FormHelperText>
          Lowest cost is what most advertisers should pick. Other strategies require historical performance to work well.
        </FormHelperText>
      </FormControl>

      {(budget.bid_strategy === 'LOWEST_COST_WITH_BID_CAP' ||
        budget.bid_strategy === 'COST_CAP') && (
          <TextField
            label={budget.bid_strategy === 'COST_CAP' ? 'Cost cap' : 'Bid cap'}
            type="number"
            value={budget.bid_amount ?? ''}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start">{symbol}</InputAdornment>,
              },
              htmlInput: { min: 0.01, step: 0.01 },
            }}
            onChange={(e) =>
              onChange({
                ...budget,
                bid_amount: e.target.value ? Math.max(0, parseFloat(e.target.value)) : undefined,
              })
            }
            helperText={
              budget.bid_strategy === 'COST_CAP'
                ? 'Target average cost per result. Meta keeps it close on average — daily fluctuations expected.'
                : 'Hard ceiling on the bid in any individual auction.'
            }
          />
        )}

      {budget.bid_strategy === 'LOWEST_COST_WITH_MIN_ROAS' && (
        <TextField
          label="Minimum ROAS"
          type="number"
          value={budget.roas_average_floor ?? ''}
          slotProps={{ htmlInput: { min: 0.01, max: 10, step: 0.05 } }}
          onChange={(e) =>
            onChange({
              ...budget,
              roas_average_floor: e.target.value ? Math.max(0, parseFloat(e.target.value)) : undefined,
            })
          }
          helperText="e.g. 1.5 = bid such that projected return is at least 150% of spend. Requires Pixel events with value."
        />
      )}
    </Stack>
  )
}

export default BudgetStep
