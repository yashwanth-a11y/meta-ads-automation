import { Skeleton, Stack } from '@mui/material'

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="rounded"
          height={14}
          sx={{
            bgcolor: (t) => t.palette.action.hover,
            borderRadius: 1,
            width: i === lines - 1 ? '72%' : '100%',
          }}
        />
      ))}
    </Stack>
  )
}
