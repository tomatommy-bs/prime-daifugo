import '../src/app/globals.css'
import '@mantine/core/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import { MantineProvider } from '@mantine/core'
import type { Preview } from '@storybook/react'
import { MotionProvider } from '../src/design/motion-provider'
import { theme } from '../src/design/theme'

const VIEWPORTS = {
  compact: {
    name: 'compact 844×390 (phone landscape)',
    styles: { width: '844px', height: '390px' },
    type: 'mobile',
  },
  portrait: {
    name: 'portrait 390×844',
    styles: { width: '390px', height: '844px' },
    type: 'mobile',
  },
  wide: {
    name: 'wide 1440×900',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop',
  },
} as const

const preview: Preview = {
  globalTypes: {
    colorScheme: {
      description: 'Mantine colour scheme',
      toolbar: {
        title: 'Scheme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    colorScheme: 'light',
  },
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      viewports: VIEWPORTS,
    },
    backgrounds: { disable: true },
  },
  decorators: [
    (Story, context) => {
      const scheme = context.globals.colorScheme === 'dark' ? 'dark' : 'light'
      return (
        <MantineProvider theme={theme} forceColorScheme={scheme}>
          <MotionProvider>
            <div style={{ background: 'var(--bg)', color: 'var(--ink)', padding: 'var(--sp-4)' }}>
              <Story />
            </div>
          </MotionProvider>
        </MantineProvider>
      )
    },
  ],
}

export default preview
