import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Oznaka builda (kratki git hash) — upisuje se u snimke ruke (debug D + R).
let build = 'dev';
try {
  build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}

// Na GitHub Pages stranica živi pod /robot/, lokalno pod / (preview builda isto kao Pages).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/robot/' : '/',
  define: { __BUILD__: JSON.stringify(build) },
  server: { open: true, port: 5180 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
  },
}));
