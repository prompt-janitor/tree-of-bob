// Runs after `expo export --platform web` (npm run build:web). Tidies dist/ for publishing and generates
// dist/sw.js, the service worker that precaches the whole app (page HTML, JS bundles, fonts, icons and
// canvaskit.wasm) so it works offline after the first visit.
//
// Removed from dist/ before publishing:
// - _sitemap.html and +not-found.html: Expo's route list and its default not-found page (which links to it).
// - (tabs)/*.html: duplicates of the tab pages under their group folder.
// - bob/: the web app opens Bob details in the page, so there are no /bob/<name> URLs to serve.
// The base path comes from experiments.baseUrl in app.json ("/tree-of-bob" for GitHub Pages).
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSW } from 'workbox-build';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html not found: run `expo export --platform web` first');

const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const base = (process.env.EXPO_BASE_URL ?? app.expo.experiments?.baseUrl ?? '').trim().replace(/\/+$/, '');

for (const path of ['_sitemap.html', '+not-found.html', '(tabs)', 'bob']) {
  rmSync(join(dist, path), { recursive: true, force: true });
}
// GitHub Pages: publish folders that start with an underscore (_expo/) as they are.
writeFileSync(join(dist, '.nojekyll'), '');

// Each page gets its screen title in the HTML itself, before any script runs. The titles come from the inline
// title script that +html.tsx writes into every page (from src/web/document-title.ts). Expo's head manager adds
// an empty <title> ahead of ours, which would otherwise win.
for (const file of readdirSync(dist).filter((f) => f.endsWith('.html'))) {
  const path = join(dist, file);
  let html = readFileSync(path, 'utf8').replace('<title data-rh="true"></title>', '');
  const titles = JSON.parse(html.match(/var titles = (\{.*?\});/)?.[1] ?? 'null');
  if (!titles) throw new Error(`${file}: title script not found`);
  const route = file === 'index.html' ? '/' : `/${file.replace(/\.html$/, '')}`;
  const title = titles[route] ? `${titles[route]} · Tree of Bob` : 'Tree of Bob';
  html = html.replace('<title>Tree of Bob</title>', `<title>${title}</title>`);
  writeFileSync(path, html);
}

const { count, size, warnings } = await generateSW({
  globDirectory: dist,
  globPatterns: ['**/*.{html,js,css,json,wasm,png,jpg,svg,ico,ttf,otf,woff2,txt,webmanifest}'],
  globIgnores: ['sw.js', 'workbox-*.js', '**/*.map'],
  swDest: join(dist, 'sw.js'),
  modifyURLPrefix: base ? { '': `${base}/` } : {},
  // canvaskit.wasm (the star map) is about 8 MB; Workbox's default limit of 2 MB would silently skip it.
  maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  // A new version waits until the page asks it to take over (see the script in src/app/+html.tsx), so a page
  // never loads chunks from a different build than the one it started with.
  skipWaiting: false,
  // /tree-of-bob/tree is served from tree.html, /tree-of-bob/ from index.html (Workbox cleanURLs and
  // directoryIndex). Unknown paths are not rewritten to another page, which would not hydrate.
  navigateFallback: undefined,
  sourcemap: false,
  mode: 'production',
});
for (const w of warnings) console.warn(w);
console.log(`sw.js: precached ${count} files, ${(size / 1048576).toFixed(1)} MB, scope ${base || ''}/`);
if (!readFileSync(join(dist, 'sw.js'), 'utf8').includes('canvaskit.wasm')) throw new Error('sw.js does not precache canvaskit.wasm');
