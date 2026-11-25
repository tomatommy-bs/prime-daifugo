import path from 'path'
import { defineConfig } from 'vitest/config'

const storybookEnabled = process.env.STORYBOOK_TESTS === '1'

// The Storybook project needs a real browser, so it is loaded only on demand
// (`npm run test:storybook`). `npm test` never touches a browser binary.
const storybookProject = async () => {
  const { storybookTest } = await import('@storybook/experimental-addon-test/vitest-plugin')
  const executablePath = process.env.PW_CHROMIUM_PATH
  return {
    extends: true as const,
    plugins: [storybookTest({ configDir: path.join(__dirname, '.storybook') })],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        headless: true,
        provider: 'playwright' as const,
        instances: [
          {
            browser: 'chromium' as const,
            ...(executablePath ? { launch: { executablePath } } : {}),
          },
        ],
      },
      setupFiles: ['.storybook/vitest.setup.ts'],
    },
  }
}

export default defineConfig(async () => ({
  esbuild: { jsx: 'automatic' as const },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      '@storybook/experimental-nextjs-vite',
      '@mantine/core',
      '@mantine/hooks',
      'react/jsx-dev-runtime',
      'framer-motion',
    ],
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true as const,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      ...(storybookEnabled ? [await storybookProject()] : []),
    ],
    coverage: {
      provider: 'v8' as const,
      include: ['src/**'],
      exclude: [
        'src/game-card/src/components/icons/**',
        'src/partykit/**',
        '**/*.stories.*',
        'src/app/labo/gallery/**',
      ],
      thresholds: {
        'src/design/**': { lines: 85, branches: 75 },
        // `*` stands in for the literal `[id]` segment (brackets are glob syntax).
        'src/app/room/*/_ui/board/**': { lines: 85, branches: 75 },
      },
    },
  },
}))
