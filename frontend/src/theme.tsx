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
    body1: { ...fontStyles.r14, color: '#808CA0', lineHeight: 1.6 },
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
    // === FORM PRIMITIVES — unified across the project ============================
    // Defaults: medium-density inputs with floating labels, soft borders,
    // primary focus ring. Helper text sits left-aligned, tight to the input.
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'medium', fullWidth: true },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
          transition: 'box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E2E8F0',
            transition: 'border-color 200ms ease',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#CBD5E1',
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 4px ${alpha('#22D3EE', 0.18)}`,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#22D3EE',
            borderWidth: 1,
          },
          '&.Mui-error.Mui-focused': {
            boxShadow: `0 0 0 4px ${alpha('#F87171', 0.18)}`,
          },
          '&.Mui-disabled': {
            backgroundColor: '#F8FAFC',
          },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E2E8F0',
          },
          '& .MuiInputBase-input:-webkit-autofill': {
            WebkitTextFillColor: '#0F172A !important',
            transition: 'background-color 5000s ease-in-out 0s !important',
            backgroundColor: 'transparent !important',
            WebkitBoxShadow: 'unset !important',
            boxShadow: 'unset !important',
          },
        },
        input: {
          padding: '12px 14px',
          fontSize: '0.9375rem',
          '&::placeholder': {
            color: '#94A3B8',
            opacity: 1,
          },
        },
        multiline: {
          padding: 0,
          '& textarea': { padding: '12px 14px' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.9375rem',
          color: '#64748B',
          '&.Mui-focused': { color: '#0EA5B7' },
          '&.Mui-error': { color: '#F87171' },
        },
        outlined: {
          // Center the label in a 44px input vertically.
          transform: 'translate(14px, 13px) scale(1)',
          '&.MuiInputLabel-shrink': {
            transform: 'translate(14px, -9px) scale(0.78)',
            fontWeight: 600,
          },
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: '#0F172A',
          letterSpacing: '0.01em',
          '&.Mui-focused': { color: '#0F172A' },
          '&.Mui-error': { color: '#F87171' },
        },
        asterisk: { color: '#F87171' },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          marginLeft: 2,
          marginTop: 6,
          fontSize: '0.75rem',
          lineHeight: 1.45,
          color: '#64748B',
          '&.Mui-error': { color: '#F87171' },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#64748B',
          right: 10,
          transition: 'transform 200ms ease',
        },
        select: {
          // Match TextField padding; reserve right space for the chevron.
          '&.MuiOutlinedInput-input': {
            padding: '12px 36px 12px 14px',
          },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            padding: '4px 10px',
          },
          '& .MuiOutlinedInput-root .MuiAutocomplete-input': {
            padding: '6px 4px',
          },
        },
        paper: {
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: `0 12px 32px ${alpha('#0F172A', 0.08)}`,
          marginTop: 6,
        },
        listbox: {
          padding: 6,
          '& .MuiAutocomplete-option': {
            borderRadius: 8,
            margin: '2px 0',
            fontSize: '0.875rem',
            '&[aria-selected="true"]': {
              backgroundColor: alpha('#22D3EE', 0.1),
            },
            '&.Mui-focused, &[data-focus="true"]': {
              backgroundColor: alpha('#22D3EE', 0.06),
            },
          },
        },
        tag: {
          margin: 2,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: `0 12px 32px ${alpha('#0F172A', 0.08)}`,
          marginTop: 6,
        },
        list: {
          padding: 6,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 0',
          fontSize: '0.875rem',
          minHeight: 36,
          padding: '8px 12px',
          '&:hover': { backgroundColor: alpha('#22D3EE', 0.06) },
          '&.Mui-selected': {
            backgroundColor: alpha('#22D3EE', 0.12),
            color: '#0EA5B7',
            '&:hover': { backgroundColor: alpha('#22D3EE', 0.16) },
          },
        },
      },
    },
    MuiSwitch: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: {
          width: 44,
          height: 26,
          padding: 0,
          overflow: 'visible',
        },
        switchBase: {
          padding: 3,
          '&.Mui-checked': {
            transform: 'translateX(18px)',
            '& + .MuiSwitch-track': {
              backgroundColor: '#22D3EE',
              opacity: 1,
            },
          },
          '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 },
        },
        thumb: {
          width: 20,
          height: 20,
          boxShadow: `0 2px 6px ${alpha('#0F172A', 0.18)}`,
        },
        track: {
          borderRadius: 999,
          backgroundColor: '#CBD5E1',
          opacity: 1,
          transition: 'background-color 200ms ease',
        },
      },
    },
    MuiCheckbox: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: {
          color: '#94A3B8',
          padding: 6,
          '&.Mui-checked': { color: '#22D3EE' },
        },
      },
    },
    MuiRadio: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: {
          color: '#94A3B8',
          padding: 6,
          '&.Mui-checked': { color: '#22D3EE' },
        },
      },
    },
    MuiSlider: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: { height: 4 },
        rail: { backgroundColor: '#E2E8F0', opacity: 1 },
        track: { backgroundColor: '#22D3EE', border: 'none' },
        thumb: {
          width: 18,
          height: 18,
          backgroundColor: '#FFFFFF',
          border: '2px solid #22D3EE',
          boxShadow: `0 2px 6px ${alpha('#0F172A', 0.18)}`,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `0 0 0 8px ${alpha('#22D3EE', 0.16)}`,
          },
          '&.Mui-active': {
            boxShadow: `0 0 0 12px ${alpha('#22D3EE', 0.2)}`,
          },
        },
        mark: { backgroundColor: '#CBD5E1' },
        markActive: { backgroundColor: '#22D3EE' },
        markLabel: { fontSize: '0.75rem', color: '#64748B' },
        valueLabel: {
          backgroundColor: '#0F172A',
          fontSize: '0.75rem',
          fontWeight: 600,
          borderRadius: 6,
        },
      },
    },
    MuiInputAdornment: {
      styleOverrides: {
        root: {
          color: '#64748B',
          '& .MuiTypography-root': { color: '#64748B', fontSize: '0.9375rem' },
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        root: { marginLeft: -6 },
        label: { fontSize: '0.875rem', color: '#0F172A' },
      },
    },
    // === END FORM PRIMITIVES ====================================================
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
