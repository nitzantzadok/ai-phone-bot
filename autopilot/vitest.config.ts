import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The web app's own `@/` alias, which Next resolves from its tsconfig. Tests import
      // route handlers directly, so the runner has to resolve it the same way.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    // Database tests spin up their own in-process PGlite instance; running files in
    // parallel is safe because no two tests share a database.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['packages/*/src/**'] },
  },
})
