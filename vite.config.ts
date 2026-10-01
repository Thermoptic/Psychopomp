import { defineConfig } from 'vitest/config';

// Published as a GitHub Pages *project* site at https://thermoptic.github.io/Psychopomp/,
// so every built asset URL must be prefixed with /Psychopomp/.
// Two pages: the game (index.html) and the internal developer editor (editor/index.html -> /editor/).
export default defineConfig({
  base: '/Psychopomp/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
