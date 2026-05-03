import { Stack, Typography } from '@mui/material'
import { GlassCard } from '../../ui/GlassCard'
import { ChipInput } from '../ChipInput'

interface KeywordsCardProps {
  products: string[]
  setProducts: (v: string[]) => void
  competitors: string[]
  setCompetitors: (v: string[]) => void
  trackedKeywords: string[]
  setTrackedKeywords: (v: string[]) => void
}

export function KeywordsCard({
  products,
  setProducts,
  competitors,
  setCompetitors,
  trackedKeywords,
  setTrackedKeywords,
}: KeywordsCardProps) {
  return (
    <GlassCard sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Keywords & Products</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Used by the AI to bias trend scoring and content generation for this channel
      </Typography>
      <Stack spacing={2}>
        <ChipInput
          label="Products / services"
          helperText="Your key offerings — boosted in relevance scoring"
          values={products}
          onChange={setProducts}
        />
        <ChipInput
          label="Competitors"
          helperText="Competitor brands — monitored for brand-news trends"
          values={competitors}
          onChange={setCompetitors}
        />
        <ChipInput
          label="Tracked keywords"
          helperText="Custom keywords added to the ingestion watchlist"
          values={trackedKeywords}
          onChange={setTrackedKeywords}
        />
      </Stack>
    </GlassCard>
  )
}
