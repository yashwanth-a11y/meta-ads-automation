import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
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

  const FULL_WIDTH = { gridColumn: { xs: '1', md: '1 / -1' } }

  return (
    <Stack spacing={4} sx={{ mt: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Who should see this ad?</Typography>

      {sacLocked && (
        <Alert severity="warning">
          Special Ad Category restrictions are active: age is locked to 18–65, gender filtering is disabled,
          and Advantage+ audience is required.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <Box sx={FULL_WIDTH}>
          <LocationsField
            value={audience.locations}
            onChange={(locations) => update({ locations })}
          />
        </Box>

        <Box sx={FULL_WIDTH}>
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

        <FormControl fullWidth>
          <InputLabel>Special Ad Category</InputLabel>
          <Select
            label="Special Ad Category"
            multiple
            value={audience.special_ad_categories}
            renderValue={(selected) => (selected as string[]).join(', ')}
            onChange={(e) => {
              const next = e.target.value as SpecialAdCategory[]
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

        <Box sx={FULL_WIDTH}>
          <InterestsField
            value={audience.interests}
            onChange={(interests) => update({ interests })}
          />
        </Box>

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

        <FormControl>
          <FormLabel sx={{ mb: 1 }}>Device</FormLabel>
          <RadioGroup
            row
            value={
              audience.device_platforms.length === 0
                ? 'all'
                : audience.device_platforms.length === 1
                  ? audience.device_platforms[0]
                  : 'all'
            }
            onChange={(e) => {
              const v = e.target.value
              update({
                device_platforms:
                  v === 'all' ? [] : v === 'mobile' ? ['mobile'] : ['desktop'],
              })
            }}
          >
            <FormControlLabel value="all" control={<Radio />} label="All devices" />
            <FormControlLabel value="mobile" control={<Radio />} label="Mobile only" />
            <FormControlLabel value="desktop" control={<Radio />} label="Desktop only" />
          </RadioGroup>
        </FormControl>
      </Box>

      <Divider sx={{ my: 1 }} />

      <PlacementsSection audience={audience} update={update} />

      <Divider sx={{ my: 1 }} />

      <FormControl fullWidth>
        <InputLabel>Languages (optional)</InputLabel>
        <Select
          multiple
          label="Languages (optional)"
          value={audience.locales}
          onChange={(e) => {
            const v = e.target.value as number[]
            update({ locales: v })
          }}
          renderValue={(selected) =>
            (selected as number[]).map((id) => META_LOCALES[id] || `#${id}`).join(', ')
          }
        >
          {Object.entries(META_LOCALES).map(([id, label]) => (
            <MenuItem key={id} value={Number(id)}>
              <Checkbox checked={audience.locales.includes(Number(id))} size="small" />
              <ListItemText primary={label} secondary={`locale id ${id}`} />
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>
          Restrict to users whose Facebook language matches. Leave blank to reach everyone in the chosen geos.
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

// === Placements section ===

const FB_POSITIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'right_hand_column', label: 'Right column' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'video_feeds', label: 'Video feeds' },
  { value: 'story', label: 'Stories' },
  { value: 'search', label: 'Search results' },
  { value: 'instream_video', label: 'In-stream video' },
  { value: 'facebook_reels', label: 'Reels' },
]
const IG_POSITIONS = [
  { value: 'stream', label: 'Feed' },
  { value: 'story', label: 'Stories' },
  { value: 'explore', label: 'Explore' },
  { value: 'reels', label: 'Reels' },
  { value: 'profile_feed', label: 'Profile feed' },
  { value: 'ig_search', label: 'Search' },
]
const MESSENGER_POSITIONS = [
  { value: 'messenger_home', label: 'Inbox' },
  { value: 'sponsored_messages', label: 'Sponsored messages' },
  { value: 'story', label: 'Stories' },
]
const AN_POSITIONS = [
  { value: 'classic', label: 'Native, banner, interstitial' },
  { value: 'rewarded_video', label: 'Rewarded video' },
]

function PlacementsSection({
  audience,
  update,
}: {
  audience: WizardForm['audience']
  update: (patch: Partial<WizardForm['audience']>) => void
}) {
  const togglePlatform = (
    platform: WizardForm['audience']['publisher_platforms'][number],
  ) => {
    const has = audience.publisher_platforms.includes(platform)
    update({
      publisher_platforms: has
        ? audience.publisher_platforms.filter((p) => p !== platform)
        : [...audience.publisher_platforms, platform],
    })
  }
  const togglePosition = (
    field:
      | 'facebook_positions'
      | 'instagram_positions'
      | 'messenger_positions'
      | 'audience_network_positions',
    value: string,
  ) => {
    const list = audience[field]
    update({
      [field]: list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    } as Partial<WizardForm['audience']>)
  }

  const isManual = audience.placement_mode === 'manual'

  return (
    <FormControl>
      <FormLabel sx={{ mb: 1 }}>Where should the ad show? (Placements)</FormLabel>
      <RadioGroup
        row
        value={audience.placement_mode}
        onChange={(e) =>
          update({ placement_mode: e.target.value as 'auto' | 'manual' })
        }
      >
        <FormControlLabel
          value="auto"
          control={<Radio />}
          label="Advantage+ Placements (recommended)"
        />
        <FormControlLabel value="manual" control={<Radio />} label="Manual" />
      </RadioGroup>

      {!isManual && (
        <FormHelperText>
          Meta picks the best mix across Facebook, Instagram, Messenger, and Audience Network.
          Usually delivers cheaper results.
        </FormHelperText>
      )}

      {isManual && (
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <FormGroup row>
            {(
              [
                { id: 'facebook', label: 'Facebook' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'messenger', label: 'Messenger' },
                { id: 'audience_network', label: 'Audience Network' },
              ] as const
            ).map((p) => (
              <FormControlLabel
                key={p.id}
                control={
                  <Checkbox
                    checked={audience.publisher_platforms.includes(p.id)}
                    onChange={() => togglePlatform(p.id)}
                  />
                }
                label={p.label}
              />
            ))}
          </FormGroup>

          {audience.publisher_platforms.includes('facebook') && (
            <PositionSubsection
              title="Facebook positions"
              options={FB_POSITIONS}
              selected={audience.facebook_positions}
              onToggle={(v) => togglePosition('facebook_positions', v)}
            />
          )}
          {audience.publisher_platforms.includes('instagram') && (
            <PositionSubsection
              title="Instagram positions"
              options={IG_POSITIONS}
              selected={audience.instagram_positions}
              onToggle={(v) => togglePosition('instagram_positions', v)}
            />
          )}
          {audience.publisher_platforms.includes('messenger') && (
            <PositionSubsection
              title="Messenger positions"
              options={MESSENGER_POSITIONS}
              selected={audience.messenger_positions}
              onToggle={(v) => togglePosition('messenger_positions', v)}
            />
          )}
          {audience.publisher_platforms.includes('audience_network') && (
            <PositionSubsection
              title="Audience Network positions"
              options={AN_POSITIONS}
              selected={audience.audience_network_positions}
              onToggle={(v) => togglePosition('audience_network_positions', v)}
            />
          )}

          <FormHelperText sx={{ ml: 0 }}>
            Leave individual positions empty to use all positions of the selected platforms.
          </FormHelperText>
        </Stack>
      )}
    </FormControl>
  )
}

function PositionSubsection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        {title}
      </Typography>
      <FormGroup row sx={{ ml: 1 }}>
        {options.map((o) => (
          <FormControlLabel
            key={o.value}
            control={
              <Checkbox
                size="small"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
            }
            label={o.label}
          />
        ))}
      </FormGroup>
    </Box>
  )
}

// Common Meta locale ids (from /search?type=adlocale). Subset; covers the
// languages most SMB advertisers care about. Add more by querying Meta if
// you ever need to expand.
const META_LOCALES: Record<number, string> = {
  6: 'English (US)',
  24: 'Hindi',
  16: 'Spanish (Spain)',
  23: 'Spanish (Latin America)',
  9: 'French',
  17: 'German',
  10: 'Italian',
  19: 'Portuguese (Brazil)',
  46: 'Tamil',
  53: 'Telugu',
  54: 'Bengali',
  55: 'Marathi',
  68: 'Arabic',
  41: 'Japanese',
  31: 'Korean',
  101: 'Indonesian',
  104: 'Vietnamese',
  64: 'Turkish',
  74: 'Russian',
  108: 'Thai',
}

export default AudienceStep
