'use client'

import { MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'
import { cssVariablesResolver, theme } from './theme'

/**
 * The app's MantineProvider (§2.3). A client component, because `cssVariablesResolver`
 * is a function and cannot cross the server → client boundary from `layout.tsx`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      {children}
    </MantineProvider>
  )
}
