/* Mi Contabilidad para iPad — motor.
   El programa (Python con Pyodide) corre aquí, en un hilo aparte: así la pantalla nunca se traba,
   aunque el programa esté calculando, cifrando o comprobando una contraseña. */
"use strict";

// Los archivos del programa se leen de lo guardado en el iPad (sin internet), y solo si faltan, de la red.
const fetchRed = self.fetch.bind(self);
self.fetch = async (entrada, opciones) => {
  try {
    const url = new URL(typeof entrada === "string" ? entrada : entrada.url, self.location.href).href;
    const guardado = await caches.match(url, { ignoreSearch: true });
    if (guardado) return guardado;
  } catch (e) { /* sigue a la red */ }
  return fetchRed(entrada, opciones);
};
async function cargarScript(ruta) {
  const r = await self.fetch(ruta);
  if (!r.ok) throw new Error("No se pudo cargar " + ruta);
  importScripts(URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" })));
}

let py = null, puente = null, cola = Promise.resolve();
const enCola = (f) => (cola = cola.then(f, f));
const paso = (texto, detalle = "") => postMessage({ tipo: "paso", texto, detalle });
const guardarEnIpad = () => new Promise((ok, mal) => py.FS.syncfs(false, (e) => (e ? mal(e) : ok())));

async function iniciar() {
  paso("Cargando el motor…", "La primera vez tarda un poco más");
  await cargarScript("/_ipad/pyodide/pyodide.js");
  await cargarScript("/_ipad/pyodide/pyodide.asm.js");
  py = await loadPyodide({ indexURL: "/_ipad/pyodide/" });
  paso("Cargando la seguridad…");
  await py.loadPackage(["cryptography", "sqlite3", "markupsafe", "hashlib", "pillow", "fonttools"], { messageCallback: () => {} });
  paso("Abriendo tus datos…");
  py.FS.mkdir("/datos");
  py.FS.mount(py.FS.filesystems.IDBFS, {}, "/datos");
  await new Promise((ok, mal) => py.FS.syncfs(true, (e) => (e ? mal(e) : ok())));
  paso("Cargando el programa…");
  const zip = await (await self.fetch("/_ipad/programa.zip")).arrayBuffer();
  py.unpackArchive(zip, "zip", { extractDir: "/programa" });
  py.runPython("import sys; sys.path.insert(0, '/programa')");
  await py.runPythonAsync("import puente");
  puente = py.pyimport("puente");
  await guardarEnIpad();
}
const listo = iniciar();

function pedido(m) {
  let estado = 500, cabeceras = [["Content-Type", "text/html; charset=utf-8"]], contenido;
  try {
    const r = puente.atender(m.metodo, m.ruta, m.cuerpo || null, m.contenido || null);
    const js = r.toJs();
    r.destroy();
    [estado, cabeceras, contenido] = js;
    if (!(contenido instanceof Uint8Array)) contenido = new Uint8Array(contenido);
  } catch (e) {
    contenido = new TextEncoder().encode(`<meta charset="utf-8"><body style="font:17px -apple-system;padding:30px">
      <h2>Algo falló</h2><p>No se guardó nada de este paso. Vuelve atrás e inténtalo otra vez.</p>
      <pre style="white-space:pre-wrap;color:#888;font-size:12px">${String(e).slice(-800).replace(/</g, "&lt;")}</pre>`);
  }
  return { estado, cabeceras, contenido };
}

async function persistir(m) {  // los estilos y las consultas no cambian nada: no hace falta guardar
  if (/^\/(static\/|api\/)/.test(m.ruta)) return;
  if (m.metodo !== "GET") puente.guardar();
  await guardarEnIpad();
}

self.onmessage = (ev) => {
  const m = ev.data || {};
  enCola(async () => {
    let r = null, error = null;
    try {
      await listo;
      if (m.op === "pedido") {
        r = pedido(m);
        postMessage({ id: m.id, r }, r.contenido ? [r.contenido.buffer] : []);
        try { await persistir(m); } catch (e) { console.error("guardar", e); }
        return;
      }
      if (m.op === "guardar") { puente.guardar(); await guardarEnIpad(); }
      else if (m.op === "vigilar") { r = !!puente.vigilar(); if (r) await guardarEnIpad(); }
      else if (m.op === "listo") { r = true; }
      else if (m.op === "python" && self.location.hostname === "localhost") {  // solo pruebas en la Mac
        if (m.archivo) py.FS.writeFile(m.archivo, m.texto);
        const x = await py.runPythonAsync(m.codigo || "None");
        r = x && x.toJs ? x.toJs() : x;
      }
    } catch (e) { error = String((e && (e.message || e)) || "error"); }
    postMessage({ id: m.id, r, error });
  });
};
