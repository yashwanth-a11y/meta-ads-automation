import { Box, FormControlLabel, Switch, Typography, type SwitchProps } from '@mui/material'
import { alpha, styled } from '@mui/material/styles'

// Polished cyan-themed switch — replaces the dated default MUI Switch.
// 44×24 track, 20×20 white thumb with a soft drop shadow, smooth 240ms
// background transition, theme-primary cyan when on.
export const PrettySwitch = styled((props: SwitchProps) => (
  <Switch focusVisibleClassName=".Mui-focusVisible" disableRipple {...props} />
))(({ theme }) => ({
  width: 44,
  height: 24,
  padding: 0,
  display: 'flex',
  flexShrink: 0,
  '& .MuiSwitch-switchBase': {
    padding: 2,
    transitionDuration: '220ms',
    '&.Mui-checked': {
      transform: 'translateX(20px)',
      color: '#FFFFFF',
      '& + .MuiSwitch-track': {
        backgroundColor: theme.palette.primary.main,
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.25)}`,
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color: '#F1F5F9',
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.4,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 20,
    height: 20,
    backgroundColor: '#FFFFFF',
    boxShadow: `0 2px 4px ${alpha('#0F172A', 0.18)}, 0 0 0 0.5px ${alpha('#0F172A', 0.04)}`,
  },
  '& .MuiSwitch-track': {
    borderRadius: 12,
    backgroundColor: alpha('#0F172A', 0.18),
    opacity: 1,
    transition: theme.transitions.create(['background-color'], { duration: 220 }),
  },
}))

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  divider?: boolean
}

// Clean, evenly-aligned settings row with the label on the left and the
// switch flush right. Hovering the row hints clickability; clicking
// anywhere on the label flips the switch (FormControlLabel handles it).
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  divider = true,
}: ToggleRowProps) {
  return (
    <>
      <FormControlLabel
        labelPlacement="start"
        disabled={disabled}
        control={
          <PrettySwitch
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
        }
        label={
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                color: disabled ? 'text.disabled' : 'text.primary',
                lineHeight: 1.35,
              }}
            >
              {label}
            </Typography>
            {description ? (
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block', lineHeight: 1.5 }}
              >
                {description}
              </Typography>
            ) : null}
          </Box>
        }
        sx={{
          width: '100%',
          m: 0,
          py: 1.75,
          px: 2,
          borderRadius: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'background-color 160ms ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
          '&:hover': disabled
            ? {}
            : { bgcolor: alpha('#22D3EE', 0.04) },
          '& .MuiFormControlLabel-label': {
            flex: 1,
            minWidth: 0,
            mr: 2,
          },
        }}
      />
      {divider ? (
        <Box
          sx={{
            height: 1,
            bgcolor: alpha('#0F172A', 0.06),
            mx: 2,
          }}
        />
      ) : null}
    </>
  )
}
