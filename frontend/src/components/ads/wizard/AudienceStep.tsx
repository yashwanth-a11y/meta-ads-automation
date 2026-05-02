import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adsApi } from '../../../api'
import type { InterestSuggestion, LocationSuggestion, SpecialAdCategory } from '../../../api/types'
import type { WizardForm } from './types'

type Props = {
  audience: WizardForm['audience']
  onChange: (next: WizardForm['audience']) => void
}

const SPECIAL_AD_CATEGORIES: SpecialAdCategory[] = [
  'NONE', 'CREDIT', 'EMPLOYMENT', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING', 'FINANCIAL_PRODUCTS_SERVICES',
]

// Restrictions enforced when a non-NONE Special Ad Category is selected.
// We mirror Meta's rules client-side so the user sees the change immediately.
function applySpecialAdConstraints(audience: WizardForm['audience']): WizardForm['audience'] {
  const hasNonNone = audience.special_ad_categories.some((c) => c !== 'NONE')
  if (!hasNonNone) return audience
  return {
    ...audience,
    age_min: 18,
    age_max: 65,
    genders: 'all',
    advantage_audience: true,
  }
}

// Tiny debounced typeahead helper. We avoid pulling lodash for one function.
function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function AudienceStep({ audience, onChange }: Props) {
  const update = (patch: Partial<WizardForm['audience']>) =>
    onChange(applySpecialAdConstraints({ ...audience, ...patch }))

  const sacLocked = audience.special_ad_categories.some((c) => c !== 'NONE')

  return (
    <Stack spacing={3} sx={{ mt: 2, }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Who should see this ad?</Typography>

      {sacLocked && (
        <Alert severity="warning">
          Special Ad Category restrictions are active: age is locked to 18–65, gender filtering is disabled,
          and Advantage+ audience is required.
        </Alert>
      )}

      <LocationsField
        value={audience.locations}
        onChange={(locations) => update({ locations })}
      />

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
          Age range — {audience.age_min} to {audience.age_max}
        </Typography>
        <Slider
          value={[audience.age_min, audience.age_max]}
          min={13}
          max={65}
          marks={[{ value: 13, label: '13' }, { value: 65, label: '65+' }]}
          disabled={sacLocked}
          onChange={(_, val) => {
            const [lo, hi] = val as [number, number]
            update({ age_min: lo, age_max: hi })
          }}
        />
      </Box>

      <FormControl fullWidth>
        <InputLabel>Gender</InputLabel>
        <Select
          label="Gender"
          value={audience.genders}
          disabled={sacLocked}
          onChange={(e) => update({ genders: e.target.value as WizardForm['audience']['genders'] })}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="male">Male</MenuItem>
          <MenuItem value="female">Female</MenuItem>
        </Select>
      </FormControl>

      <InterestsField
        value={audience.interests}
        onChange={(interests) => update({ interests })}
      />

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Switch
          checked={audience.advantage_audience}
          disabled={sacLocked}
          onChange={(e) => update({ advantage_audience: e.target.checked })}
        />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Advantage+ Audience</Typography>
          <Typography variant="caption" color="text.secondary">
            Let Meta find more people similar to your selection. Recommended; required for Special Ad Categories.
          </Typography>
        </Box>
      </Stack>

      <FormControl fullWidth>
        <InputLabel>Special Ad Category</InputLabel>
        <Select
          label="Special Ad Category"
          multiple
          value={audience.special_ad_categories}
          renderValue={(selected) => (selected as string[]).join(', ')}
          onChange={(e) => {
            const next = e.target.value as SpecialAdCategory[]
            // If user adds a non-NONE category, drop NONE and vice versa.
            const cleaned = next.includes('NONE') && next.length > 1
              ? next.filter((c) => c !== 'NONE')
              : next.length === 0
              ? (['NONE'] as SpecialAdCategory[])
              : next
            update({ special_ad_categories: cleaned })
          }}
        >
          {SPECIAL_AD_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>{c}</MenuItem>
          ))}
        </Select>
        <FormHelperText>
          Required by Meta for housing, employment, credit, financial, gambling, and politics ads.
        </FormHelperText>
      </FormControl>
    </Stack>
  )
}

function LocationsField({
  value,
  onChange,
}: {
  value: WizardForm['audience']['locations']
  onChange: (next: WizardForm['audience']['locations']) => void
}) {
  const [input, setInput] = useState('')
  const debounced = useDebounced(input, 300)
  const [options, setOptions] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!debounced || debounced.trim().length < 2) {
      setOptions([])
      return
    }
    const myReq = ++reqRef.current
    setLoading(true)
    adsApi
      .searchLocations(debounced)
      .then((resp) => {
        if (myReq === reqRef.current) {
          setOptions(resp.data || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (myReq === reqRef.current) {
          setOptions([])
          setLoading(false)
        }
      })
  }, [debounced])

  return (
    <Autocomplete<LocationSuggestion, true>
      multiple
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.name + (o.country_code ? `, ${o.country_code}` : '')}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      value={value as unknown as LocationSuggestion[]}
      onChange={(_, val) => onChange(val.map((v) => ({ key: v.key, name: v.name, type: v.type })))}
      onInputChange={(_, val) => setInput(val)}
      loading={loading}
      renderValue={(val, getItemProps) =>
        val.map((option, index) => {
          const { key: _key, ...itemProps } = getItemProps({ index })
          return <Chip {...itemProps} key={option.key} label={option.name} size="small" />
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Locations"
          placeholder="Type to search countries, regions, cities…"
          helperText="At least one location is required."
        />
      )}
    />
  )
}

function InterestsField({
  value,
  onChange,
}: {
  value: { id: string; name: string }[]
  onChange: (next: { id: string; name: string }[]) => void
}) {
  const [input, setInput] = useState('')
  const debounced = useDebounced(input, 300)
  const [options, setOptions] = useState<InterestSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!debounced || debounced.trim().length < 2) {
      setOptions([])
      return
    }
    const myReq = ++reqRef.current
    setLoading(true)
    adsApi
      .searchInterests(debounced)
      .then((resp) => {
        if (myReq === reqRef.current) {
          setOptions(resp.data || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (myReq === reqRef.current) {
          setOptions([])
          setLoading(false)
        }
      })
  }, [debounced])

  const valueAsOpts = useMemo(
    () => value.map((v) => ({ id: v.id, name: v.name } as InterestSuggestion)),
    [value],
  )

  return (
    <Autocomplete<InterestSuggestion, true>
      multiple
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={valueAsOpts}
      onChange={(_, val) => onChange(val.map((v) => ({ id: v.id, name: v.name })))}
      onInputChange={(_, val) => setInput(val)}
      loading={loading}
      renderValue={(val, getItemProps) =>
        val.map((option, index) => {
          const { key: _key, ...itemProps } = getItemProps({ index })
          return <Chip {...itemProps} key={option.id} label={option.name} size="small" />
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Interests (optional)"
          placeholder="Search Meta interests, behaviors…"
        />
      )}
    />
  )
}

export default AudienceStep
