/* Caja del Yera: guarda la app en el teléfono para que funcione sin internet. */
const VERSION = "ec3bbb9d66";
const CACHE = "caja-yera-" + VERSION;
const ARCHIVOS = ["./", "index.html", "estilo.css", "app.js", "lector.js", "manifest.webmanifest", "icono-192.png", "icono-512.png",
  "lib/ocr/tesseract.min.js", "lib/ocr/worker.min.js", "lib/ocr/tesseract-core-simd-lstm.wasm.js", "lib/ocr/tesseract-core-lstm.wasm.js",
  "lib/ocr/eng.traineddata.gz", "lib/ocr/spa.traineddata.gz"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("caja-yera-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const r = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === "navigate" ? await c.match("index.html") : null);
    if (r) return r;
    try { return await fetch(e.request); } catch (err) { return new Response("Sin internet", { status: 503 }); }
  })());
});
