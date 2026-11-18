import { cpSync, readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { builtinCatalog } from './frontend/src/fonts-default.js';

const root = fileURLToPath(new URL('./demo', import.meta.url));
const outDir = fileURLToPath(new URL('./demo/dist', import.meta.url));
const appApi = normalize(fileURLToPath(new URL('./frontend/src/api.js', import.meta.url)));
const fixtureApi = fileURLToPath(new URL('./demo/fixture-api.js', import.meta.url));
const soundsDir = fileURLToPath(new URL('./app/public/sounds', import.meta.url));
const fontsDir = fileURLToPath(new URL('./app/public/fonts', import.meta.url));

function demoBase() {
  const fromEnv = process.env.DEMO_BASE;
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) return `/${repo.split('/')[1]}/`;
  return '/';
}

function demoApi() {
  return {
    name: 'demo-api',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.endsWith('api.js')) return null;
      const resolved = normalize(resolve(dirname(importer), id));
      if (resolved === appApi) return fixtureApi;
      return null;
    },
  };
}

function demoVersion() {
  const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
  return {
    name: 'demo-version',
    transformIndexHtml(html) {
      const fonts = JSON.stringify(builtinCatalog()).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      return html.replaceAll('__VERSION__', version).replaceAll('__FONTS__', fonts);
    },
  };
}

function copySounds() {
  return {
    name: 'demo-sounds',
    closeBundle() {
      cpSync(soundsDir, resolve(outDir, 'sounds'), {
        recursive: true,
        filter: (src) => !src.endsWith('.py'),
      });
    },
  };
}

function copyFonts() {
  return {
    name: 'demo-fonts',
    closeBundle() {
      cpSync(fontsDir, resolve(outDir, 'fonts'), { recursive: true });
    },
  };
}

export default defineConfig({
  root,
  base: demoBase(),
  plugins: [preact(), demoApi(), demoVersion(), copySounds(), copyFonts()],
  define: {
    'import.meta.env.VITE_DEMO': 'true',
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
  },
});
