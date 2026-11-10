/* Mi Contabilidad para iPad — intermediario (service worker).
   - Guarda la app en el iPad para que funcione sin internet.
   - Cada pantalla del programa (/, /caja, /registrar/...) se la pide a la página principal,
     que tiene el programa corriendo dentro (Python en el navegador). Nada sale del iPad. */
const VERSION = "258e20d11c";
const CACHE = "mc-ipad-" + VERSION;
const ESTILOS = "mc-ipad-est-" + VERSION;  // estilos, scripts e imágenes del programa (se guardan aparte en cada versión)
const PROPIOS = [
  "/", "/_ipad/arranque.js", "/_ipad/motor.js", "/_ipad/version.js", "/_ipad/programa.zip", "/_ipad/manifest.webmanifest",
  "/_ipad/icono-180.png", "/_ipad/icono-192.png", "/_ipad/icono-512.png",
  "/_ipad/pyodide/pyodide.js", "/_ipad/pyodide/pyodide.asm.js", "/_ipad/pyodide/pyodide.asm.wasm",
  "/_ipad/pyodide/python_stdlib.zip", "/_ipad/pyodide/pyodide-lock.json",
  "/_ipad/pyodide/cffi-1.17.1-cp312-cp312-pyodide_2024_0_wasm32.whl",
  "/_ipad/pyodide/cryptography-42.0.5-cp312-cp312-pyodide_2024_0_wasm32.whl",
  "/_ipad/pyodide/markupsafe-2.1.5-cp312-cp312-pyodide_2024_0_wasm32.whl",
  "/_ipad/pyodide/openssl-1.1.1w.zip",
  "/_ipad/pyodide/pycparser-2.22-py3-none-any.whl",
  "/_ipad/pyodide/six-1.16.0-py2.py3-none-any.whl",
  "/_ipad/pyodide/sqlite3-1.0.0-cp312-cp312-pyodide_2024_0_wasm32.whl",
  "/_ipad/pyodide/hashlib-1.0.0-cp312-cp312-pyodide_2024_0_wasm32.whl",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PROPIOS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("mc-ipad-") && k !== CACHE && k !== ESTILOS) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function desdeCache(req) {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) || fetch(req);
}

async function ventanas() {
  // Safari no siempre dice cuál es la ventana principal: se pregunta a todas y contesta la que tiene el programa.
  const todas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return todas.filter((c) => !new URL(c.url).pathname.startsWith("/mi-contabilidad-visor"));
}

function aviso(texto, estado = 503) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<body style="font:17px -apple-system,sans-serif;padding:40px;color:#16302b">${texto}</body>`,
    { status: estado, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function alPrograma(e) {
  const req = e.request;
  if (!["GET", "HEAD"].includes(req.method)) {
    // solo se aceptan formularios de la propia app (protección como en la Mac)
    const origen = req.headers.get("Origin") || (req.referrer ? new URL(req.referrer).origin : "");
    if (origen && origen !== self.location.origin) return aviso("Pedido rechazado.", 403);
  }
  const lista = await ventanas();
  if (!lista.length) return aviso('La app no está abierta. <a href="/">Abrir Mi Contabilidad</a>');
  const url = new URL(req.url);
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? null : new Uint8Array(await req.arrayBuffer());
  const respuesta = new Promise((ok, mal) => {
    for (const v of lista) {
      const canal = new MessageChannel();
      canal.port1.onmessage = (m) => ok(m.data);
      const copia = cuerpo ? cuerpo.slice() : null;
      v.postMessage({ tipo: "pedido", metodo: req.method, ruta: url.pathname + url.search,
        cuerpo: copia, contenido: req.headers.get("Content-Type") }, [canal.port2]);
    }
    setTimeout(() => mal(new Error("tiempo")), 180000);
  });
  let r;
  try { r = await respuesta; } catch (err) { return aviso("El programa tardó demasiado. Vuelve a intentarlo."); }
  const cab = new Headers();
  for (const [k, v] of r.cabeceras) {
    cab.append(k, k.toLowerCase() === "location" ? new URL(v, req.url).href : v);
  }
  const sinCuerpo = [204, 205, 304].includes(r.estado) || (r.estado >= 300 && r.estado < 400) || req.method === "HEAD";
  return new Response(sinCuerpo ? null : r.contenido, { status: r.estado, headers: cab });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/mi-contabilidad-visor")) return;              // el visor del iPhone va por su cuenta
  if (p.startsWith("/_ipad/") || p === "/sw.js") { e.respondWith(desdeCache(e.request)); return; }
  if (p === "/api/latido") {                                          // el latido de la Mac: aquí no hace falta
    e.respondWith(new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }));
    return;
  }
  if (p.startsWith("/static/") && e.request.method === "GET") {        // estilos e imágenes: se guardan la primera vez
    e.respondWith((async () => {
      const c = await caches.open(ESTILOS);
      const guardado = await c.match(e.request, { ignoreSearch: true });
      if (guardado) return guardado;
      const r = await alPrograma(e);
      if (r.status === 200) await c.put(new Request(url.pathname), r.clone());
      return r;
    })());
    return;
  }
  if (e.request.mode === "navigate" && e.request.destination === "document") {
    e.respondWith(desdeCache(new Request("/")));                      // la página principal (con el programa)
    return;
  }
  e.respondWith(alPrograma(e));                                       // todo lo demás: el programa
});
