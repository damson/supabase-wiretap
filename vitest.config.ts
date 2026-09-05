import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      // `all: true` counts files no test imports. Without it an untested
      // module is invisible rather than at 0%, which flatters the number
      // exactly where it matters most.
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // The package is small enough that anything below this is a gap someone
      // decided not to look at.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
