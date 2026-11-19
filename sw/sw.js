// Keeps HK on this device, so it opens at once, even on a slow connection: the page and every built file. The agent
// lives on another address, so its calls never come here and always go to the network.
//
// The build writes this file into dist/sw.js with its own id and the list of its files (see vite.config.ts), so each
// deploy is a new service worker: the browser installs it in the background, it keeps the new page and files (those
// that did not change are copied from the build before), then takes over and drops the old ones. The page reloads into
// it (see src/main.tsx).

const BUILD = '__BUILD__';
const FILES = [/* FILES */];
const CACHE = `hk-${BUILD}`;
const PAGE = '/';

/** The /assets/ files a page names: its script, its stylesheet and the chunks it loads first. */
const assetsOf = html => [...html.matchAll(/\/assets\/[^"']+/g)].map(match => match[0]);

/** A file of this build: from the copy an earlier build kept (a file's name changes with its content), else fetched. */
async function keepFile(cache, file) {
  const response = (await caches.match(file)) ?? (await fetch(file));
  if (!response.ok) throw new Error(`${file} answered ${response.status}`);
  await cache.put(file, response);
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch(PAGE, {cache: 'no-cache'});
      if (!page.ok || page.redirected) throw new Error(`The page answered ${page.status}`);
      // A page of a newer deploy than this file: that deploy's own service worker installs instead.
      if (!assetsOf(await page.clone().text()).every(file => FILES.includes(file))) throw new Error('Another build');
      await cache.put(PAGE, page);
      await Promise.all(FILES.map(file => keepFile(cache, file)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** Every address of the app gets the same page: the kept one. */
async function openPage(request) {
  return (await (await caches.open(CACHE)).match(PAGE)) ?? fetch(request);
}

/** A file under /assets/: the kept copy, else the network's, kept for next time (the fonts outside Latin). */
async function assetFile(request) {
  const {pathname} = new URL(request.url);
  const cache = await caches.open(CACHE);
  const kept = await cache.match(pathname);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(pathname, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if ('GET' !== request.method || url.origin !== self.location.origin) return;
  // A page, not a file of public/ (the icon, the manifest).
  if ('navigate' === request.mode && !/\.\w+$/.test(url.pathname)) event.respondWith(openPage(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetFile(request));
});
