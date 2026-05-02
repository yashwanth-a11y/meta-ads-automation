import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormHelperText,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { useState } from 'react'
import { adsApi, ApiError } from '../../../api'
import type { WizardForm } from './types'
import { CTA_BY_OBJECTIVE } from './types'

type Props = {
  objective: WizardForm['objective']
  creative: WizardForm['creative']
  onChange: (next: WizardForm['creative']) => void
}

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_MIME = ['video/mp4', 'video/quicktime']
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024 // 4 GB; Meta cap

export function CreativeStep({ objective, creative, onChange }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  if (!objective) {
    return <Alert severity="info">Pick an objective first.</Alert>
  }

  const ctas = CTA_BY_OBJECTIVE[objective]

  const update = (patch: Partial<WizardForm['creative']>) => onChange({ ...creative, ...patch })

  const handleFile = async (file: File) => {
    setUploadError(null)
    if (creative.media_type === 'image') {
      if (!IMAGE_MIME.includes(file.type)) {
        setUploadError('Image must be JPEG, PNG, or WebP.')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError('Image must be 30 MB or smaller.')
        return
      }
    } else {
      if (!VIDEO_MIME.includes(file.type)) {
        setUploadError('Video must be MP4 or MOV.')
        return
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setUploadError('Video must be under 4 GB.')
        return
      }
    }
    setUploading(true)
    try {
      if (creative.media_type === 'image') {
        const result = await adsApi.uploadAdImageFile(file)
        update({
          image_hash: result.hash,
          image_preview_url: URL.createObjectURL(file),
        })
      } else {
        // Backend currently exposes uploadImageFile only — video upload route
        // hasn't been added yet. We surface a clear error so the user knows.
        setUploadError('Video upload route is not enabled yet. Use an image for now.')
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      setUploadError(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>How should the ad look?</Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <TextField
            select
            fullWidth
            label="Media format"
            value={creative.media_type}
            onChange={(e) => update({ media_type: e.target.value as 'image' | 'video' })}
          >
            <MenuItem value="image">Single image</MenuItem>
            <MenuItem value="video">Single video</MenuItem>
          </TextField>
        </Grid>
        
        <Grid size={{ xs: 12 }}>
          <Button
            variant="outlined"
            component="label"
            fullWidth
            startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
            disabled={uploading}
            sx={{
              height: 56,
              borderColor: '#22D3EE',
              color: 'grey.400',
              bgcolor: 'rgba(255, 255, 255, 0.03)',
              '&:hover': {
                borderColor: '#22D3EE',
                bgcolor: 'rgba(255, 255, 255, 0.07)'
              }
            }}
          >
            {uploading ? 'Uploading…' : creative.image_hash || creative.video_id ? 'Replace media' : 'Upload media'}
            <input
              hidden
              type="file"
              accept={creative.media_type === 'image' ? IMAGE_MIME.join(',') : VIDEO_MIME.join(',')}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </Button>
          {creative.image_preview_url && (
            <Box sx={{ mt: 2 }}>
              <img
                src={creative.image_preview_url}
                alt="Ad preview"
                style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </Box>
          )}
          {uploadError && <Alert severity="error" sx={{ mt: 1.5 }}>{uploadError}</Alert>}
          {!creative.image_hash && !creative.video_id && (
            <FormHelperText sx={{ mt: 1 }}>
              Recommended dimensions: at least 1080×1080. Meta auto-crops for each placement.
            </FormHelperText>
          )}
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            label="Headline"
            fullWidth
            value={creative.headline}
            onChange={(e) => update({ headline: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 40 } }}
            helperText={`${creative.headline.length}/40`}
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Primary text"
            fullWidth
            multiline
            minRows={3}
            value={creative.primary_text}
            onChange={(e) => update({ primary_text: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 125 } }}
            helperText={`${creative.primary_text.length}/125`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Description (optional)"
            fullWidth
            multiline
            minRows={3}
            value={creative.description}
            onChange={(e) => update({ description: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 30 } }}
            helperText={`${creative.description.length}/30`}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            label="Call to action"
            value={creative.cta_type}
            onChange={(e) => update({ cta_type: e.target.value as string })}
          >
            {ctas.map((c) => (
              <MenuItem key={c} value={c}>
                {c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          {objective === 'WEBSITE_TRAFFIC' && (
            <TextField
              label="Destination URL"
              type="url"
              fullWidth
              value={creative.destination_url || ''}
              onChange={(e) => update({ destination_url: e.target.value })}
              required
              placeholder="https://example.com/landing"
              error={!!creative.destination_url && !/^https?:\/\//.test(creative.destination_url)}
              helperText="Where the user lands after clicking the ad."
            />
          )}

          {objective === 'CTWA' && (
            <TextField
              label="WhatsApp number (optional override)"
              fullWidth
              value={creative.whatsapp_number || ''}
              onChange={(e) => update({ whatsapp_number: e.target.value })}
              placeholder="Leave blank to use the connected business number"
              helperText="Use international format without spaces, e.g. 919876543210"
            />
          )}

          {objective === 'LEAD_GEN' && (
            <Alert severity="info" sx={{ height: 56, display: 'flex', alignItems: 'center' }}>
              Lead form is configured in the next step.
            </Alert>
          )}
        </Grid>
      </Grid>
    </Stack>
  )
}

export default CreativeStep
