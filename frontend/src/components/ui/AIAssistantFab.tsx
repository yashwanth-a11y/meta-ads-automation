import {
  Box,
  Drawer,
  Fab,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import { useState } from 'react'
import { GeneratingIndicator } from './GeneratingIndicator'

export function AIAssistantFab() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSend = () => {
    setBusy(true)
    window.setTimeout(() => setBusy(false), 1600)
  }

  return (
    <>
      <Fab
        color="primary"
        aria-label="Open AI assistant"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          right: { xs: 16, md: 28 },
          bottom: { xs: 16, md: 28 },
          zIndex: (t) => t.zIndex.modal - 1,
          boxShadow: `0 12px 40px ${alpha('#000000', 0.55)}, 0 0 0 1px ${alpha('#FFFFFF', 0.12)}`,
        }}
      >
        <AutoAwesomeOutlinedIcon />
      </Fab>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box
          sx={{
            width: { xs: '100vw', sm: 400 },
            maxWidth: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            borderLeft: `1px solid ${alpha('#FFFFFF', 0.08)}`,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              px: 2,
              py: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${alpha('#FFFFFF', 0.06)}`,
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <AutoAwesomeOutlinedIcon fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Growth Copilot
              </Typography>
            </Stack>
            <IconButton onClick={() => setOpen(false)} aria-label="Close assistant">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ask for launch ideas, audience refinements, or copy tweaks. Context-aware suggestions
              stay on-brand.
            </Typography>
            <Box
              sx={{
                p: 2,
                borderRadius: '8px',
                bgcolor: alpha('#FFFFFF', 0.04),
                border: `1px solid ${alpha('#FFFFFF', 0.08)}`,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Suggested
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                “Summarize top-performing hooks from last week and draft three variants for Reels.”
              </Typography>
            </Box>
            {busy ? <GeneratingIndicator label="Thinking" /> : null}
          </Box>

          <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: `1px solid ${alpha('#FFFFFF', 0.06)}` }}>
            <TextField fullWidth autoComplete="off" placeholder="Message PhotonX AI…" size="small" />
            <IconButton color="primary" onClick={handleSend} aria-label="Send message">
              <SendRoundedIcon />
            </IconButton>
          </Stack>
        </Box>
      </Drawer>
    </>
  )
}
