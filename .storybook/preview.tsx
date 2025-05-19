import type { Preview } from '@storybook/react'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { ColorSchemeScript, MantineProvider } from '@mantine/core'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <MantineProvider>
        <ColorSchemeScript />
        <Story />
      </MantineProvider>
    ),
  ]
};

export default preview;