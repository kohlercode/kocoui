import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./frontend', import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === 'build' ? '/assets/' : '/',
  plugins: [preact()],
  build: {
    outDir: fileURLToPath(new URL('./app/public/assets', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    assetsDir: '',
    rollupOptions: {
      input: fileURLToPath(new URL('./frontend/src/main.jsx', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target: process.env.KOCOUI_BACKEND || 'http://localhost:8080', changeOrigin: true },
    },
  },
}));
