import { createTheme, alpha } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    surface: {
      main: string
      elevated: string
      glass: string
    }
    auth: {
      pageBg: string
      panelBg: string
      panelBorder: string
      accentFrom: string
      accentTo: string
      accentMuted: string
    }
  }
  interface PaletteOptions {
    surface?: {
      main: string
      elevated: string
      glass: string
    }
    auth?: {
      pageBg: string
      panelBg: string
      panelBorder: string
      accentFrom: string
      accentTo: string
      accentMuted: string
    }
  }
}

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FAFAFA',
      dark: '#E5E5E5',
      light: '#FFFFFF',
      contrastText: '#050505',
    },
    secondary: {
      main: '#737373',
      contrastText: '#FAFAFA',
    },
    background: {
      default: '#000000',
      paper: '#0A0A0A',
    },
    text: {
      primary: '#F5F5F5',
      secondary: '#A3A3A3',
      disabled: '#525252',
    },
    divider: '#262626',
    error: {
      main: '#F87171',
    },
    warning: {
      main: '#FBBF24',
    },
    success: {
      main: '#34D399',
    },
    surface: {
      main: '#0A0A0A',
      elevated: '#111111',
      glass: alpha('#FFFFFF', 0.04),
    },
    auth: {
      pageBg: '#0B0F14',
      panelBg: '#121821',
      panelBorder: '#1F2937',
      accentFrom: '#2DD4BF',
      accentTo: '#22D3EE',
      accentMuted: alpha('#2DD4BF', 0.65),
    },
  },
  typography: {
    fontFamily: '"Raleway", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
      fontSize: '2rem',
      lineHeight: 1.2,
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.025em',
      fontSize: '1.5rem',
      lineHeight: 1.25,
    },
    h3: {
      fontWeight: 600,
      letterSpacing: '-0.02em',
      fontSize: '1.25rem',
      lineHeight: 1.3,
    },
    h4: {
      fontWeight: 600,
      letterSpacing: '-0.015em',
      fontSize: '1.0625rem',
      lineHeight: 1.35,
    },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.45,
      letterSpacing: '0.02em',
      color: '#A3A3A3',
    },
    button: {
      fontWeight: 600,
      letterSpacing: '0.02em',
      textTransform: 'none' as const,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#404040 #0a0a0a',
          scrollbarWidth: 'thin',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
          transition: 'box-shadow 240ms ease, transform 240ms ease, border-color 240ms ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '10px 20px',
          transition: 'transform 200ms ease, box-shadow 240ms ease, background-color 200ms ease',
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: `0 0 0 1px ${alpha('#FFFFFF', 0.12)}, 0 8px 24px ${alpha('#000000', 0.5)}`,
          '&.MuiButton-colorPrimary': {
            backgroundColor: '#22D3EE',
            // backgroundColor: '#FAFAFA',
            color: '#050505',
            '&:hover': {
              transform: 'translateY(-2px)',
              transition: 'transform 200ms ease',
              // transform: 'scale(1.02)',
              // backgroundColor: '#FFFFFF',
              boxShadow: `0 0 0 1px ${alpha('#FFFFFF', 0.2)}, 0 12px 32px ${alpha('#000000', 0.55)}`,
            },
          },
        },
        outlined: {
          borderColor: alpha('#FFFFFF', 0.14),
          // borderColor: alpha('#FFFFFF', 0.14),
          '&:hover': {
            borderColor: alpha('#FFFFFF', 0.28),
            backgroundColor: alpha('#FFFFFF', 0.04),
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          transition: 'box-shadow 220ms ease, border-color 220ms ease',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#FFFFFF', 0.1),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#FFFFFF', 0.2),
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha('#FFFFFF', 0.08)}`,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#FFFFFF', 0.35),
          },
          '& .MuiInputBase-input:-webkit-autofill': {
            '-webkit-text-fill-color': '#A3A3A3 !important',
            transition: 'background-color 5000s ease-in-out 0s !important',
            backgroundColor: 'transparent !important',
            '-webkit-box-shadow': 'unset !important',
            boxShadow: 'unset !important',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: alpha('#FFFFFF', 0.06) },
        head: {
          fontWeight: 600,
          color: '#A3A3A3',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 200ms ease',
          '&:hover': { backgroundColor: alpha('#FFFFFF', 0.03) },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${alpha('#FFFFFF', 0.06)}`,
          backgroundImage: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.03)} 0%, transparent 40%)`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
  },
})
