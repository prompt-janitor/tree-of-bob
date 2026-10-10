// Web document shell (static export). Sets the page colours and self-hosted typefaces before React hydrates,
// links the web app manifest, gives each page its screen title, and registers the service worker that
// scripts/build-sw.mjs generates. Every URL is prefixed with the base path (EXPO_BASE_URL, "/tree-of-bob" on
// GitHub Pages) so the same file works at a domain root and under a subpath.
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import app from '../../app.json';
import { APP_TITLE, SCREEN_TITLES } from '@/web/document-title';

const base = process.env.EXPO_BASE_URL ?? '';
const production = process.env.NODE_ENV === 'production';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{APP_TITLE}</title>
        <meta name="description" content={app.expo.web.description} />
        <script dangerouslySetInnerHTML={{ __html: titleScript }} />
        <link rel="preload" href={`${base}/fonts/InstrumentSans-Regular.woff2`} as="font" type="font/woff2" crossOrigin="" />
        <link rel="manifest" href={`${base}/manifest.webmanifest`} />
        <meta name="theme-color" content="#F3F4F6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0C0F13" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/png" sizes="192x192" href={`${base}/icons/icon-192.png`} />
        <link rel="apple-touch-icon" href={`${base}/icons/apple-touch-icon.png`} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={APP_TITLE} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        {children}
        {production ? <script dangerouslySetInnerHTML={{ __html: serviceWorkerScript }} /> : null}
      </body>
    </html>
  );
}

// Same rule as documentTitle() in src/web/document-title.ts, inlined so the title is right before hydration on
// whichever page the visitor lands on (the static export shares this shell between all pages).
const titleScript = `
(function () {
  var titles = ${JSON.stringify(SCREEN_TITLES)};
  var path = location.pathname.slice(${JSON.stringify(base)}.length).replace(/\\.html$/, '').replace(/\\/index$/, '/').replace(/(.)\\/+$/, '$1') || '/';
  document.title = titles[path] ? titles[path] + ' · ${APP_TITLE}' : '${APP_TITLE}';
})();
`;

// Registers the service worker (precached app, works offline). A new version installs in the background and
// waits; it takes over while the page is hidden (app switched away or tab in the background), then the page
// reloads itself so it never runs old code against new files. The reading position is in localStorage, so the
// reload loses nothing. Installed (Home Screen) copies ask for persistent storage so iOS keeps the position.
const serviceWorkerScript = `
(function () {
  if (!('serviceWorker' in navigator)) return;
  var hadController = !!navigator.serviceWorker.controller;
  var reloadWhenHidden = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    if (document.hidden) location.reload(); else reloadWhenHidden = true;
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}/' }).then(function (reg) {
      function skipWhenHidden() {
        if (document.hidden && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && reloadWhenHidden) location.reload();
        else skipWhenHidden();
      });
      reg.addEventListener('updatefound', function () {
        var sw = reg.installing;
        if (sw) sw.addEventListener('statechange', skipWhenHidden);
      });
    }).catch(function () {});
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  });
})();
`;

const font = (family: string, file: string, weight: number) =>
  `@font-face { font-family: '${family}'; src: url('${base}/fonts/${file}.woff2') format('woff2'); font-weight: ${weight}; font-style: normal; font-display: swap; }`;

const css = `
${font('Instrument Sans', 'InstrumentSans-Regular', 400)}
${font('Instrument Sans', 'InstrumentSans-Medium', 500)}
${font('Instrument Sans', 'InstrumentSans-SemiBold', 600)}
${font('Instrument Sans', 'InstrumentSans-Bold', 700)}
${font('IBM Plex Mono', 'IBMPlexMono-Regular', 400)}
${font('IBM Plex Mono', 'IBMPlexMono-Medium', 500)}
${font('IBM Plex Mono', 'IBMPlexMono-SemiBold', 600)}
body { background-color: #F3F4F6; color: #11151B; }
@media (prefers-color-scheme: dark) { body { background-color: #0C0F13; color: #E9ECF1; } }
:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
