import {
  AppBar,
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'

type HeaderProps = {
  title: string
  onMenu: () => void
}

export function Header({ title, onMenu }: HeaderProps) {
  const muiTheme = useTheme()
  const isSm = useMediaQuery(muiTheme.breakpoints.down('md'))

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: alpha('#000000', 0.65),
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${alpha('#FFFFFF', 0.06)}`,
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: { xs: 64, md: 72 }, px: { xs: 2, md: 3 } }}>
        {isSm ? (
          <IconButton edge="start" color="inherit" onClick={onMenu} aria-label="open menu">
            <MenuRoundedIcon />
          </IconButton>
        ) : null}

        <Box sx={{ flex: '0 0 auto' }}>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em', fontSize: '0.65rem' }}>
            Workspace
          </Typography>
          <Typography variant="h4" component="p" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            {title}
          </Typography>
        </Box>

        <TextField
          placeholder="Search campaigns, leads, creatives…"
          size="small"
          sx={{
            flex: 1,
            maxWidth: { xs: '100%', md: 420 },
            ml: { xs: 0, md: 'auto' },
            display: { xs: isSm ? 'none' : 'flex', md: 'flex' },
            '& .MuiOutlinedInput-root': {
              bgcolor: alpha('#FFFFFF', 0.04),
            },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <IconButton color="inherit" sx={{ color: 'text.secondary' }}>
            <NotificationsNoneRoundedIcon />
          </IconButton>
        </Stack>
      </Toolbar>
    </AppBar>
  )
}
