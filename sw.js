// Community Corner: saves issue pictures (covers + pages) on the reader's device so issues open fast.
// Only pictures are saved. The site's pages, code, settings and the admin area always come fresh from the network.
const CACHE = 'cc-issue-pictures-v1';
const MAX_ITEMS = 60;                                   // about the newest few issues
const isIssuePicture = url => /\/issues\/\d+\/(cover|p\d+)\.jpg$/.test(new URL(url).pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ITEMS))) await cache.delete(k);
}
// get a fresh copy from the network and save it
async function refresh(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) { const cache = await caches.open(CACHE); await cache.put(url, res.clone()); trim(cache); }
  return res;
}

// show the saved picture right away, and quietly update it in the background
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !isIssuePicture(req.url)) return;       // everything else: untouched
  const url = req.url.split('?')[0];
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) { e.waitUntil(refresh(url).catch(() => {})); return hit; }
    try { return await refresh(url); } catch (err) { return fetch(req); }
  })());
});

// the page asks us to save this week's issue ahead of time
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'save-issue') return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of e.data.urls || []) {
      if (!isIssuePicture(u)) continue;
      if (!(await cache.match(u))) await refresh(u).catch(() => {});
    }
  })());
});
