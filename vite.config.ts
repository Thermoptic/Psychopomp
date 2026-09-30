import { defineConfig } from 'vitest/config';

// Published as a GitHub Pages *project* site at https://thermoptic.github.io/Psychopomp/,
// so every built asset URL must be prefixed with /Psychopomp/.
export default defineConfig({
  base: '/Psychopomp/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
