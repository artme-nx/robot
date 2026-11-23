import { defineConfig } from 'vite';

// Na GitHub Pages stranica živi pod /robot/, lokalno pod / (preview builda isto kao Pages).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/robot/' : '/',
  server: { open: true, port: 5180 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
  },
}));
