#!/usr/bin/env node
// Generates src/data/licenses.json, the open-source licences shown on the Licences screen.
//
// It lists only what ships in the app:
//   1. npm packages whose code ends up in the iOS or web JavaScript bundle (read from the bundles' source maps),
//   2. npm packages with native code that is linked into the native app (Expo modules and React Native libraries
//      with a podspec, found by walking the production dependency tree),
//   3. a few notices that no package carries itself: Google's Skia (BSD-3, compiled into react-native-skia and
//      canvaskit.wasm), Metro's runtime (MIT, bundled, but metro-runtime ships no licence file) and the fonts.
//
// Usage:
//   node scripts/gen-licenses.mjs               exports the iOS and web bundles with source maps into a temp folder
//   node scripts/gen-licenses.mjs --maps <dir>  reuses an existing `expo export --source-maps` output folder
//                                               (pass --maps more than once for several folders)
//
// Run it after changing dependencies and commit the result. The output is deterministic (no dates).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/data/licenses.json');
const oflFile = path.join(root, 'src/components/map/OFL.txt');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const exists = (f) => fs.existsSync(f);

// ---------------------------------------------------------------------------------------------------------------
// 1. Production dependency tree, resolved the way Node resolves it (nearest node_modules first).

function resolvePkgDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (exists(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** realpath of package dir -> package.json */
const tree = new Map();
function walk(dir) {
  if (!dir || tree.has(dir)) return;
  const pkg = readJson(path.join(dir, 'package.json'));
  tree.set(dir, pkg);
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    walk(resolvePkgDir(dep, dir));
  }
}
const rootPkg = readJson(path.join(root, 'package.json'));
const direct = Object.keys(rootPkg.dependencies ?? {});
for (const dep of direct) walk(resolvePkgDir(dep, root));

// ---------------------------------------------------------------------------------------------------------------
// 2. Packages in the JavaScript bundles, from the source maps of a production export.

function args(flag) {
  const list = [];
  const argv = process.argv.slice(2);
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) list.push(path.resolve(argv[i + 1]));
  });
  return list;
}

function findMaps(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findMaps(full));
    else if (entry.name.endsWith('.map')) found.push(full);
  }
  return found;
}

function exportBundles() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tob-licenses-'));
  const dirs = [];
  for (const platform of ['ios', 'web']) {
    const dir = path.join(tmp, platform);
    console.log(`Exporting the ${platform} bundle with source maps...`);
    const r = spawnSync('npx', ['expo', 'export', '--platform', platform, '--source-maps', '--output-dir', dir], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, CI: '1' },
    });
    if (r.status !== 0) throw new Error(`expo export --platform ${platform} failed`);
    dirs.push({ platform, dir });
  }
  return dirs;
}

const mapDirs = args('--maps');
const exports = mapDirs.length
  ? mapDirs.map((dir) => ({ platform: guessPlatform(dir), dir }))
  : exportBundles();

function guessPlatform(dir) {
  // Expo writes native bundles to _expo/static/js/<platform>/ and web bundles to _expo/static/js/web/.
  const maps = findMaps(dir).join('\n');
  if (maps.includes('/js/ios/')) return 'ios';
  if (maps.includes('/js/android/')) return 'android';
  return 'web';
}

/** realpath of package dir -> set of platforms ('native' | 'web') */
const shipped = new Map();
const mark = (dir, platform) => {
  if (!shipped.has(dir)) shipped.set(dir, new Set());
  shipped.get(dir).add(platform);
};

for (const { platform, dir } of exports) {
  const target = platform === 'web' ? 'web' : 'native';
  const maps = findMaps(dir);
  if (!maps.length) throw new Error(`No source maps in ${dir}; export with --source-maps`);
  for (const mapFile of maps) {
    const { sources = [] } = readJson(mapFile);
    for (const src of sources) {
      const i = src.lastIndexOf('node_modules/');
      if (i < 0) continue;
      const rest = src.slice(i + 'node_modules/'.length).split('/');
      const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
      // Sources are relative to the project root ("/node_modules/...") or absolute.
      const prefix = src.slice(0, i);
      const base = prefix.startsWith(root) ? prefix : path.join(root, prefix);
      const dirPath = path.join(base, 'node_modules', name);
      if (!exists(path.join(dirPath, 'package.json'))) continue;
      mark(fs.realpathSync(dirPath), target);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Native code linked into the app: Expo modules (autolinked from the whole tree) and React Native libraries
//    with a podspec among the direct dependencies (React Native's autolinking only looks at those).

const hasPodspec = (dir) => fs.readdirSync(dir).some((f) => f.endsWith('.podspec'));
for (const [dir, pkg] of tree) {
  const expoModule = path.join(dir, 'expo-module.config.json');
  if (exists(expoModule)) {
    const cfg = readJson(expoModule);
    const nativePlatforms = ['apple', 'ios', 'android'];
    const native = !cfg.platforms || cfg.platforms.some((p) => nativePlatforms.includes(p)) || nativePlatforms.some((p) => cfg[p]);
    if (native) mark(dir, 'native');
  } else if (direct.includes(pkg.name) && hasPodspec(dir)) {
    mark(dir, 'native');
  }
}
// The native Skia engine and canvaskit.wasm (copied to public/ for the web build) ship even though no JavaScript
// from canvaskit-wasm is bundled.
const canvaskit = resolvePkgDir('canvaskit-wasm', resolvePkgDir('@shopify/react-native-skia', root) ?? root);
if (canvaskit) mark(canvaskit, 'web');

// ---------------------------------------------------------------------------------------------------------------
// Licence texts.

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;
function licenceText(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .sort();
  if (!files.length) return null;
  return files
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
    .join('\n\n');
}

function licenceId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function repoUrl(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!r) return pkg.homepage ?? null;
  return r
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/#.*$/, '')
    .replace(/^([\w-]+\/[\w.-]+)$/, 'https://github.com/$1');
}

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

// Packages that ship without a licence file, but whose upstream repository states the notice.
const OVERRIDES = {
  // Metro's runtime (module system and polyfills) is bundled into every build. Metro is MIT, Meta.
  'metro-runtime': `MIT License\n\nCopyright (c) Meta Platforms, Inc. and affiliates.\n\n${MIT_BODY}`,
};

const texts = [];
const textIndex = new Map();
function addText(t) {
  if (t == null) return null;
  if (!textIndex.has(t)) {
    textIndex.set(t, texts.length);
    texts.push(t);
  }
  return textIndex.get(t);
}

// Packages from a monorepo often ship without a licence file; the repository's licence applies. Collect the texts
// of packages that do ship one, keyed by repository URL, to fill those gaps.
// React Native moved from github.com/facebook to github.com/react; older packages still name the old URL.
const repoKey = (url) => url?.replace('https://github.com/facebook/react-native', 'https://github.com/react/react-native');
const repoText = new Map();
for (const dir of new Set([...shipped.keys(), ...tree.keys()])) {
  const pkg = tree.get(dir) ?? readJson(path.join(dir, 'package.json'));
  const url = repoKey(repoUrl(pkg));
  const t = licenceText(dir);
  if (url && t && !repoText.has(url)) repoText.set(url, t);
}

function authorName(pkg) {
  const a = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  // Names only: drop "<email>" and "(url)" parts.
  return a ? a.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').trim() || null : null;
}

function textFor(pkg, dir) {
  if (OVERRIDES[pkg.name]) return OVERRIDES[pkg.name];
  const own = licenceText(dir);
  if (own) return own;
  const url = repoKey(repoUrl(pkg));
  if (url && repoText.has(url)) return repoText.get(url);
  // MIT without a licence file: the standard text with the copyright holder named in package.json.
  const author = authorName(pkg);
  if (licenceId(pkg) === 'MIT' && author) return `MIT License\n\nCopyright (c) ${author}\n\n${MIT_BODY}`;
  return null;
}

const byKey = new Map();
for (const [dir, platforms] of shipped) {
  const pkg = tree.get(dir) ?? readJson(path.join(dir, 'package.json'));
  if (pkg.private && !pkg.license) continue;
  const key = `${pkg.name}@${pkg.version}`;
  const prev = byKey.get(key);
  if (prev) {
    for (const p of platforms) if (!prev.platforms.includes(p)) prev.platforms.push(p);
    continue;
  }
  byKey.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: licenceId(pkg),
    url: repoUrl(pkg),
    platforms: [...platforms],
    text: addText(textFor(pkg, dir)),
  });
}

// Skia itself: Google's BSD-3 notice. react-native-skia's own LICENSE covers only Shopify's wrapper, and the same
// Skia notice is what canvaskit-wasm ships.
const skiaNotice = canvaskit ? licenceText(canvaskit) : null;
if (!skiaNotice || !/Google/.test(skiaNotice)) throw new Error('Could not find the Skia BSD-3 notice in canvaskit-wasm');
const notices = [
  {
    name: 'Skia',
    version: null,
    license: 'BSD-3-Clause',
    url: 'https://skia.org',
    platforms: ['native', 'web'],
    note: 'Graphics engine compiled into react-native-skia and canvaskit.wasm.',
    text: addText(skiaNotice.replace(/\n-{20,}\s*$/, '').trim()),
  },
];

// Fonts. Instrument Sans is bundled in the app (src/components/map/instrument-sans.ttf) and self-hosted on the web.
// IBM Plex Mono is self-hosted on the web only.
const ofl = fs.readFileSync(oflFile, 'utf8').replace(/\r\n/g, '\n').trim();
const oflBody = ofl.slice(ofl.indexOf('This Font Software is licensed'));
const fonts = [
  {
    name: 'Instrument Sans',
    version: null,
    license: 'OFL-1.1',
    url: 'https://github.com/Instrument/instrument-sans',
    platforms: ['native', 'web'],
    text: addText(ofl),
  },
  {
    name: 'IBM Plex Mono',
    version: null,
    license: 'OFL-1.1',
    url: 'https://github.com/IBM/plex',
    platforms: ['web'],
    text: addText(`Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"\n\n${oflBody}`),
  },
];

const packages = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
for (const p of packages) p.platforms.sort();

const result = {
  comment: 'Generated by scripts/gen-licenses.mjs from the packages that ship in the app. Do not edit by hand.',
  fonts,
  notices,
  packages,
  texts,
};
fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);

const missing = packages.filter((p) => p.text == null).map((p) => `${p.name}@${p.version} (${p.license})`);
console.log(`Wrote ${path.relative(root, out)}: ${packages.length} packages, ${texts.length} distinct licence texts.`);
if (missing.length) console.log(`No licence file shipped (SPDX id only): ${missing.join(', ')}`);
