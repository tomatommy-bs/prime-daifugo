import path from 'path'
import { defineConfig } from 'vitest/config'

const storybookEnabled = process.env.STORYBOOK_TESTS === '1'
// L3 workerd tests start a real local Worker; opt-in only (`npm run test:integration`).
const integrationEnabled = process.env.INTEGRATION === '1'

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
          // Worker host tests (L2h) are pure; they opt into Node with `// @vitest-environment node`.
          include: ['src/**/*.test.{ts,tsx}', 'worker/test/*.test.ts'],
          exclude: ['**/node_modules/**', 'worker/test/integration/**'],
        },
      },
      ...(integrationEnabled
        ? [
            {
              extends: true as const,
              test: {
                name: 'integration',
                environment: 'node' as const,
                include: ['worker/test/integration/**/*.test.ts'],
                testTimeout: 30_000,
                hookTimeout: 60_000,
                // one local workerd at a time
                fileParallelism: false,
              },
            },
          ]
        : []),
      ...(storybookEnabled ? [await storybookProject()] : []),
    ],
    coverage: {
      provider: 'v8' as const,
      include: ['src/**', 'worker/src/**'],
      exclude: [
        'src/game-card/src/components/icons/**',
        '**/*.stories.*',
        'src/app/labo/gallery/**',
        // the simulator harness runs in `npm test` but is not held to a threshold (spec §12.3)
        'src/session/sim/**',
        // Cloudflare bindings and the router are covered by the L3 workerd tests
        'worker/src/room-do.ts',
        'worker/src/lobby-do.ts',
        'worker/src/index.ts',
      ],
      thresholds: {
        'src/design/**': { lines: 85, branches: 75 },
        // `*` stands in for the literal `[id]` segment (brackets are glob syntax).
        'src/app/room/*/_ui/board/**': { lines: 85, branches: 75 },
        // realtime rebuild (docs/realtime/rebuild-spec.md §12.3)
        'src/game/**': { lines: 95, branches: 90 },
        'src/session/**': { lines: 90, branches: 80 },
        'worker/src/**': { lines: 85, branches: 75 },
        'src/app/room/*/session/**': { lines: 85, branches: 75 },
      },
    },
  },
}))
