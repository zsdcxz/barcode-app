const CACHE = 'barcode-v34';

// 앱 핵심(로컬) — 반드시 캐시. 이 중 하나라도 실패하면 install 실패하므로 로컬만 둠.
const CORE = [
  './', './index.html', './manifest.json'
];
// 외부 CDN — 있으면 좋지만 실패해도 install을 막지 않음(best-effort).
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/inlined/index.js',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
  // OpenCV.js(~8MB)는 install 때 받지 않고, 처음 사용할 때 fetch 핸들러가 캐시함
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);                 // 핵심만 보장
    await Promise.allSettled(CDN.map(u => c.add(u))); // CDN은 실패 무시
    await self.skipWaiting();             // 대기 없이 즉시 새 워커로
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();           // 열려있는 페이지 즉시 인계
  })());
});

// 페이지가 강제 새로고침을 요청하면 즉시 활성화
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // HTML(앱 본체): 네트워크 우선 → 항상 최신. 오프라인이면 캐시 폴백.
  if (isHTML(req)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./index.html')) ||
               (await caches.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // 그 외(스크립트/이미지 등): 캐시 우선 + 백그라운드 갱신.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(resp => {
      if (resp && resp.status === 200) {
        const cl = resp.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return resp;
    }).catch(() => cached);
    return cached || network;
  })());
});
