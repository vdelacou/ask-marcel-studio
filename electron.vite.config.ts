import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// electron-vite v5 auto-detects the conventional entry points (src/main/index.ts,
// src/preload/index.ts, src/renderer/index.html), so main and preload need no config.
// v5 also dropped `externalizeDepsPlugin`: build.externalizeDeps is on by default.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
