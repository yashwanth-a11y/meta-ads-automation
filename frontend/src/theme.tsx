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
    mode: 'light',
    primary: {
      main: '#22D3EE',
      dark: '#0EA5B7',
      light: '#67E8F9',
      contrastText: '#05242A',
    },
    secondary: {
      main: '#64748B',
      contrastText: '#0F172A',
    },
    background: {
      default: '#F7FAFC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
      disabled: '#94A3B8',
    },
    divider: '#D8E1EA',
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
      main: '#FFFFFF',
      elevated: '#F8FAFC',
      glass: alpha('#0F172A', 0.03),
    },
    auth: {
      pageBg: '#F1F6FB',
      panelBg: '#FFFFFF',
      panelBorder: '#D8E1EA',
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
          scrollbarColor: '#94A3B8 #F1F5F9',
          scrollbarWidth: 'thin',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #dddddd57',
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
          boxShadow: `0 1px 2px ${alpha('#0F172A', 0.08)}, 0 10px 24px ${alpha('#22D3EE', 0.22)}`,
          '&.MuiButton-colorPrimary': {
            backgroundColor: '#22D3EE',
            background: "#22D3EE !important",
            color: '#FFF !important',
            '&:hover': {
              transform: 'translateY(-2px)',
              transition: 'transform 200ms ease',
              // boxShadow: `0 1px 2px ${alpha('#0F172A', 0.08)}, 0 14px 30px ${alpha('#22D3EE', 0.26)}`,
            },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(15, 23, 42, 0.05) !important',
              color: "#ddd !important",
              boxShadow: 'none',
            },
          },
        },
        outlined: {
          borderColor: alpha('#0F172A', 0.2),
          '&:hover': {
            borderColor: alpha('#0F172A', 0.3),
            backgroundColor: alpha('#0F172A', 0.03),
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
            borderColor: alpha('#0F172A', 0.2),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#0F172A', 0.3),
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha('#22D3EE', 0.2)}`,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#22D3EE', 0.55),
          },
          '& .MuiInputBase-input:-webkit-autofill': {
            '-webkit-text-fill-color': '#334155 !important',
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
        root: { borderColor: alpha('#0F172A', 0.08) },
        head: {
          fontWeight: 600,
          color: '#64748B',
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
          '&:hover': { backgroundColor: alpha('#0F172A', 0.02) },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${alpha('#0F172A', 0.08)}`,
          backgroundImage: `linear-gradient(180deg, ${alpha('#22D3EE', 0.08)} 0%, transparent 45%)`,
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
