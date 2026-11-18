import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const root = fileURLToPath(new URL('./frontend', import.meta.url));
const fontsRoot = fileURLToPath(new URL('./app/public/fonts', import.meta.url));

function serveLocalFonts() {
  return {
    name: 'kocoui-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? '';
        if (!raw.startsWith('/fonts/')) {
          next();
          return;
        }
        let rel;
        try {
          rel = decodeURIComponent(raw.slice('/fonts/'.length));
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (rel === '' || rel.includes('\0') || rel.split(/[/\\]/).includes('..')) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const file = resolve(fontsRoot, rel);
        const fromRoot = relative(fontsRoot, file);
        if (fromRoot.startsWith('..') || fromRoot === '' || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const mime = extname(file).toLowerCase() === '.woff2' ? 'font/woff2' : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  root,
  base: command === 'build' ? '/assets/' : '/',
  plugins: [preact(), serveLocalFonts()],
  define: {
    // False here so demo-only branches are stripped from the app bundle.
    'import.meta.env.VITE_DEMO': 'false',
  },
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
