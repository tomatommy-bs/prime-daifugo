import { type CSSVariablesResolver, type MantineColorsTuple, createTheme } from '@mantine/core'

// generated around --prime light #B3361B (index 7 = light primary, index 4 = dark primary ≈ #FF8A5C)
export const prime: MantineColorsTuple = [
  '#FFF1EC',
  '#FFDFD4',
  '#FFBFA8',
  '#FF9C78',
  '#FF8A5C',
  '#E8623A',
  '#CC4826',
  '#B3361B',
  '#922A14',
  '#72200E',
]
export const mod: MantineColorsTuple = [
  '#EEF0FF',
  '#DCE0FE',
  '#C3CAFD',
  '#A5B4FC',
  '#8794F5',
  '#6A73E6',
  '#5551D6',
  '#4338CA',
  '#3730A3',
  '#2B2680',
]
export const factor: MantineColorsTuple = [
  '#E6FBF7',
  '#C7F5EC',
  '#94EBDB',
  '#5EE0CB',
  '#2DD4BF',
  '#14B3A0',
  '#0F9083',
  '#0E6E66',
  '#0B5751',
  '#08413D',
]
export const gold: MantineColorsTuple = [
  '#FFF8E1',
  '#FDEFC0',
  '#FAE08A',
  '#F7D263',
  '#F5C542',
  '#D9A521',
  '#B07D0A',
  '#8A5A00',
  '#6E4800',
  '#523500',
]
export const ink: MantineColorsTuple = [
  '#ECE9E2',
  '#D6D3CC',
  '#B5B7BE',
  '#A2A7B2',
  '#878B95',
  '#6E7483',
  '#585D69',
  '#3A3F49',
  '#22252C',
  '#15171C',
]

const SANS = 'var(--font-sans), "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif'

/**
 * Mantine's dark-scheme neutrals, re-tuned to the dark tokens so inputs (6), papers and
 * popovers (7), borders (4) and dimmed text (2) match --surface/--line/--ink-muted instead
 * of Mantine's default greys.
 */
export const dark: MantineColorsTuple = [
  '#ECE9E2', // 0 text (--ink)
  '#C9C6BF',
  '#A2A7B2', // 2 dimmed (--ink-muted)
  '#6E7483', // 3 (--border-strong)
  '#3A404D', // 4 borders (--composite)
  '#2A2F3A', // 5 hover (--line)
  '#1F232C', // 6 inputs, default buttons (--surface-raised)
  '#161920', // 7 paper, popover (--surface)
  '#0D0F13', // 8 (--bg)
  '#08090C',
]

export const theme = createTheme({
  primaryColor: 'prime',
  primaryShade: { light: 7, dark: 4 },
  colors: { prime, mod, factor, gold, ink, dark },
  black: '#15171C',
  white: '#FFFFFF',
  fontFamily: SANS,
  fontFamilyMonospace: 'var(--font-mono), ui-monospace, monospace',
  headings: { fontFamily: SANS, fontWeight: '700' },
  fontSizes: { xs: '0.8rem', sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '1.5625rem' },
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1.25rem', xl: '2rem' }, // 4 8 12 20 32
  radius: { xs: '0.25rem', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '0.75rem' }, // r-1 r-1 r-2 r-3 r-3
  defaultRadius: 'md',
  breakpoints: { xs: '36em', sm: '48em', md: '62em', lg: '75em', xl: '88em' }, // unchanged (postcss-simple-vars)
  focusRing: 'never', // global :focus-visible in globals.css handles it
  cursorType: 'pointer',
  other: { motion: 'see src/design/motion.ts' },
  components: {
    Button: { defaultProps: { radius: 'md' }, styles: { root: { minHeight: 44 } } },
    ActionIcon: { defaultProps: { variant: 'subtle', size: 44 } },
    Modal: {
      defaultProps: {
        centered: true,
        radius: 'lg',
        overlayProps: { backgroundOpacity: 0.4, blur: 2 },
      },
    },
    Drawer: { defaultProps: { radius: 'lg' } },
    SegmentedControl: { defaultProps: { radius: 'md' } },
    Notification: { defaultProps: { radius: 'md', withBorder: true } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 233 } },
    Popover: { defaultProps: { radius: 'md', shadow: 'md' } },
  },
})

/**
 * Maps Mantine's scheme variables onto the design tokens. Mantine emits these unlayered,
 * so they win over its own `@layer mantine` defaults (which otherwise paint the body
 * `#fff` / `#242424` and the text `#000` / `#C9C9C9` over our `@layer base` tokens).
 */
const TOKEN_VARS: Record<string, string> = {
  '--mantine-color-body': 'var(--bg)',
  '--mantine-color-text': 'var(--ink)',
  '--mantine-color-dimmed': 'var(--ink-muted)',
  '--mantine-color-placeholder': 'var(--ink-muted)',
  '--mantine-color-default': 'var(--surface)',
  '--mantine-color-default-hover': 'var(--surface-raised)',
  '--mantine-color-default-color': 'var(--ink)',
  '--mantine-color-default-border': 'var(--border-strong)',
  '--mantine-color-disabled': 'var(--line)',
  '--mantine-color-disabled-color': 'var(--ink-muted)',
  '--mantine-color-disabled-border': 'var(--line)',
}

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: TOKEN_VARS,
  dark: TOKEN_VARS,
})
