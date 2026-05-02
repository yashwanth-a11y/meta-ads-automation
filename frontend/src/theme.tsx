import type * as React from 'react'
import { createTheme, alpha } from '@mui/material/styles'

const BaseFontStack = [
  "'Raleway'",
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Segoe UI Symbol"',
].join(',')

export const SecondaryFontStack = BaseFontStack

export const fontWeightStyles = {
  regular: { fontWeight: 400 },
  medium: { fontWeight: 500 },
  semiBold: { fontWeight: 600 },
  bold: { fontWeight: 700 },
}

export const fontStyles = {
  b36: { ...fontWeightStyles.bold, fontSize: '36px', lineHeight: '60px' },
  b30: { ...fontWeightStyles.bold, fontSize: '30px', lineHeight: '30px' },
  b24: { ...fontWeightStyles.bold, fontSize: '24px', lineHeight: '28px' },
  b20: { ...fontWeightStyles.bold, fontSize: '20px', lineHeight: '24px' },
  b18: { ...fontWeightStyles.bold, fontSize: '18px', lineHeight: '22px' },
  b16: { ...fontWeightStyles.bold, fontSize: '16px', lineHeight: '20px' },
  b14: { ...fontWeightStyles.bold, fontSize: '14px', lineHeight: '20px' },
  b12: { ...fontWeightStyles.bold, fontSize: '12px', lineHeight: '18px' },

  sb30: { ...fontWeightStyles.semiBold, fontSize: '30px', lineHeight: '40px' },
  sb24: { ...fontWeightStyles.semiBold, fontSize: '24px', lineHeight: '24px' },
  sb20: { ...fontWeightStyles.semiBold, fontSize: '20px', lineHeight: '26px' },
  sb18: { ...fontWeightStyles.semiBold, fontSize: '18px', lineHeight: '24px' },
  sb16: { ...fontWeightStyles.semiBold, fontSize: '16px', lineHeight: '21px' },
  sb14: { ...fontWeightStyles.semiBold, fontSize: '14px', lineHeight: '24px' },
  sb12: { ...fontWeightStyles.semiBold, fontSize: '12px', lineHeight: '16px' },

  m24: { ...fontWeightStyles.medium, fontSize: '24px', lineHeight: '30px' },
  m20: { ...fontWeightStyles.medium, fontSize: '20px', lineHeight: '26px' },
  m18: { ...fontWeightStyles.medium, fontSize: '18px', lineHeight: '24px' },
  m16: { ...fontWeightStyles.medium, fontSize: '16px', lineHeight: '21px' },
  m14: { ...fontWeightStyles.medium, fontSize: '14px', lineHeight: '16px' },
  m13: { ...fontWeightStyles.medium, fontSize: '13px', lineHeight: '17px' },
  m12: { ...fontWeightStyles.medium, fontSize: '12px', lineHeight: '16px' },
  m10: { ...fontWeightStyles.medium, fontSize: '10px', lineHeight: '18px' },

  r50: { ...fontWeightStyles.regular, fontSize: '50px', lineHeight: 'normal' },
  r32: { ...fontWeightStyles.regular, fontSize: '32px', lineHeight: 'normal' },
  r24: { ...fontWeightStyles.regular, fontSize: '24px', lineHeight: '30px' },
  r20: { ...fontWeightStyles.regular, fontSize: '20px', lineHeight: 'normal' },
  r18: { ...fontWeightStyles.regular, fontSize: '18px', lineHeight: '24px' },
  r16: { ...fontWeightStyles.regular, fontSize: '16px', lineHeight: '21px' },
  r14: { ...fontWeightStyles.regular, fontSize: '14px', lineHeight: '16px' },
  r12: { ...fontWeightStyles.regular, fontSize: '12px', lineHeight: '16px' },
  r10: { ...fontWeightStyles.regular, fontSize: '10px', lineHeight: '14px' },
}

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

  interface TypographyVariants {
    b36: React.CSSProperties
    b30: React.CSSProperties
    b24: React.CSSProperties
    b20: React.CSSProperties
    b18: React.CSSProperties
    b16: React.CSSProperties
    b14: React.CSSProperties
    b12: React.CSSProperties
    sb30: React.CSSProperties
    sb24: React.CSSProperties
    sb20: React.CSSProperties
    sb18: React.CSSProperties
    sb16: React.CSSProperties
    sb14: React.CSSProperties
    sb12: React.CSSProperties
    m24: React.CSSProperties
    m20: React.CSSProperties
    m18: React.CSSProperties
    m16: React.CSSProperties
    m14: React.CSSProperties
    m13: React.CSSProperties
    m12: React.CSSProperties
    m10: React.CSSProperties
    r50: React.CSSProperties
    r32: React.CSSProperties
    r24: React.CSSProperties
    r20: React.CSSProperties
    r18: React.CSSProperties
    r16: React.CSSProperties
    r14: React.CSSProperties
    r12: React.CSSProperties
    r10: React.CSSProperties
  }

  interface TypographyVariantsOptions {
    b36?: React.CSSProperties
    b30?: React.CSSProperties
    b24?: React.CSSProperties
    b20?: React.CSSProperties
    b18?: React.CSSProperties
    b16?: React.CSSProperties
    b14?: React.CSSProperties
    b12?: React.CSSProperties
    sb30?: React.CSSProperties
    sb24?: React.CSSProperties
    sb20?: React.CSSProperties
    sb18?: React.CSSProperties
    sb16?: React.CSSProperties
    sb14?: React.CSSProperties
    sb12?: React.CSSProperties
    m24?: React.CSSProperties
    m20?: React.CSSProperties
    m18?: React.CSSProperties
    m16?: React.CSSProperties
    m14?: React.CSSProperties
    m13?: React.CSSProperties
    m12?: React.CSSProperties
    m10?: React.CSSProperties
    r50?: React.CSSProperties
    r32?: React.CSSProperties
    r24?: React.CSSProperties
    r20?: React.CSSProperties
    r18?: React.CSSProperties
    r16?: React.CSSProperties
    r14?: React.CSSProperties
    r12?: React.CSSProperties
    r10?: React.CSSProperties
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
    ...fontStyles,
    fontFamily: BaseFontStack,
    h1: { ...fontStyles.b24 },
    h2: { ...fontStyles.b20 },
    h3: { ...fontStyles.b16 },
    h4: { ...fontStyles.m18 },
    h5: { ...fontStyles.b16 },
    h6: { ...fontStyles.b14 },
    subtitle1: { ...fontStyles.m14 },
    subtitle2: { ...fontStyles.sb14 },
    body1: { ...fontStyles.r14, color: '#808CA0' },
    body2: { ...fontStyles.sb18 },
    caption: { fontSize: '10px' },
    
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
            transition: 'transform 260ms ease,',
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
