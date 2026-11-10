/* Mi Contabilidad para iPad — arranque.
   Carga Python (Pyodide) y el programa de la Mac dentro del iPad, y atiende cada pantalla. Sin internet. */
(() => {
  "use strict";
  if (window.top !== window) {  // nunca debe cargarse dentro de sí misma
    document.body.innerHTML = '<p style="font:17px -apple-system;padding:30px">Hubo un problema al abrir esta pantalla. Cierra la app y vuelve a abrirla.</p>';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const PASOS = 6;
  let pasoN = 0;
  function paso(texto, detalle = "") {
    pasoN++;
    $("paso").textContent = texto;
    $("detalle").textContent = detalle;
    $("progreso").style.width = Math.min(100, Math.round((pasoN / PASOS) * 100)) + "%";
  }
  function fallo(texto) {
    $("error").style.display = "block";
    $("error").innerHTML = texto;
    $("paso").textContent = "No se pudo abrir";
  }
  const independiente = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (!independiente && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && "ontouchend" in document) {
    $("instalar").style.display = "block";
  }

  let py = null, atender = null, guardar = null, vigilar = null, cola = Promise.resolve();
  const enCola = (f) => (cola = cola.then(f, f));

  async function guardarEnIpad() {
    await new Promise((ok, mal) => py.FS.syncfs(false, (e) => (e ? mal(e) : ok())));
  }

  // ---------------------------------------------------------------- archivos que el programa entrega
  let ultimoArchivo = null;
  function nombreDe(disp) {
    const m = /filename\*=UTF-8''([^;]+)/i.exec(disp) || /filename="?([^";]+)"?/i.exec(disp);
    return m ? decodeURIComponent(m[1]) : "archivo";
  }
  function mostrarArchivo(nombre, tipo, datos) {
    ultimoArchivo = new File([datos], nombre, { type: tipo || "application/octet-stream" });
    $("archivo-nombre").textContent = nombre + " · " + Math.max(1, Math.round(datos.length / 1024)) + " KB";
    $("archivo-titulo").textContent = /\.mcvisor$/i.test(nombre) ? "Archivo para el iPhone listo"
      : /\.cifrado$/i.test(nombre) ? "Copia de seguridad lista" : "Archivo listo";
    $("archivo").style.display = "flex";
  }
  $("archivo-cerrar").onclick = () => { $("archivo").style.display = "none"; };
  $("archivo-compartir").onclick = async () => {
    const f = ultimoArchivo;
    if (!f) return;
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: f.name });
        $("archivo").style.display = "none";
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const a = document.createElement("a");  // plan B: descarga normal (va a Archivos → Descargas)
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  };

  // ---------------------------------------------------------------- cada pedido de la pantalla
  async function atenderPedido(m) {
    let estado = 500, cabeceras = [["Content-Type", "text/html; charset=utf-8"]], contenido = null;
    try {
      const r = atender(m.metodo, m.ruta, m.cuerpo, m.contenido);
      const js = r.toJs();
      r.destroy();
      [estado, cabeceras, contenido] = js;
      if (!(contenido instanceof Uint8Array)) contenido = new Uint8Array(contenido);
    } catch (e) {
      console.error(e);
      contenido = new TextEncoder().encode(`<meta charset="utf-8"><body style="font:17px -apple-system;padding:30px">
        <h2>Algo falló</h2><p>No se guardó nada de este paso. Vuelve atrás e inténtalo otra vez.</p>
        <pre style="white-space:pre-wrap;color:#888;font-size:12px">${String(e).slice(-800).replace(/</g, "&lt;")}</pre>`);
    }
    const disp = (cabeceras.find(([k]) => k.toLowerCase() === "content-disposition") || [])[1] || "";
    if (/attachment/i.test(disp) && estado === 200) {
      const tipo = (cabeceras.find(([k]) => k.toLowerCase() === "content-type") || [])[1];
      mostrarArchivo(nombreDe(disp), tipo, contenido);
      estado = 204; cabeceras = []; contenido = null;  // la pantalla se queda donde estaba
    }
    try {  // el latido de la pantalla y los archivos de estilo no cambian nada: no hace falta guardar
      const cambia = !/^\/(static\/|api\/)/.test(m.ruta);
      if (cambia && m.metodo !== "GET") guardar();
      if (cambia) await guardarEnIpad();
    } catch (e) { console.error("guardar", e); }
    return { estado, cabeceras, contenido };
  }

  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", (ev) => {
    if (!ev.data || ev.data.tipo !== "pedido" || !ev.ports[0]) return;
    const puerto = ev.ports[0];
    if (!atender) return;  // esta ventana no tiene el programa (otra ventana lo atiende)
    enCola(() => atenderPedido(ev.data)).then((r) => {
      puerto.postMessage(r, r.contenido ? [r.contenido.buffer] : []);
    });
  });

  // ---------------------------------------------------------------- arranque
  async function iniciar() {
    if (!("serviceWorker" in navigator)) {
      return fallo("Este navegador no sirve para la app. Abre esta página en <b>Safari</b> (iPad con iPadOS 16.4 o más nuevo).");
    }
    paso("Preparando la app…");
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {  // la primera vez: recargar para que el intermediario tome el control
      await new Promise((ok) => { navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }); setTimeout(ok, 3000); });
      if (!navigator.serviceWorker.controller) { location.reload(); return; }
    }
    if (navigator.locks) {  // una sola ventana a la vez (dos a la vez se pisarían los datos)
      const libre = await new Promise((ok) => {
        navigator.locks.request("mi-contabilidad", { ifAvailable: true }, (lock) => {
          ok(!!lock);
          return lock ? new Promise(() => {}) : null;
        });
      });
      if (!libre) return fallo("La app ya está abierta en otra ventana o pestaña. Usa esa, o ciérrala y vuelve a abrir esta.");
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    paso("Cargando el motor…", "La primera vez tarda un poco más");
    py = await loadPyodide({ indexURL: "/_ipad/pyodide/" });
    paso("Cargando la seguridad…");
    await py.loadPackage(["cryptography", "sqlite3", "markupsafe", "hashlib"], { messageCallback: () => {} });

    paso("Abriendo tus datos…");
    py.FS.mkdir("/datos");
    py.FS.mount(py.FS.filesystems.IDBFS, {}, "/datos");
    await new Promise((ok, mal) => py.FS.syncfs(true, (e) => (e ? mal(e) : ok())));

    paso("Cargando el programa…");
    const zip = await (await fetch("/_ipad/programa.zip")).arrayBuffer();
    py.unpackArchive(zip, "zip", { extractDir: "/programa" });
    py.runPython("import sys; sys.path.insert(0, '/programa')");
    await py.runPythonAsync("import puente");
    const puente = py.pyimport("puente");
    atender = puente.atender; guardar = puente.guardar; vigilar = puente.vigilar;
    if (location.hostname === "localhost") window.__py = py;  // solo para pruebas en la Mac
    await guardarEnIpad();

    paso("Listo");
    const marco = $("marco");
    marco.src = "/";
    marco.addEventListener("load", () => {
      $("arranque").style.display = "none";
      marco.style.display = "block";
      try { document.title = marco.contentDocument.title || "Mi Contabilidad"; } catch (e) {}
    });

    setInterval(() => enCola(async () => {
      try { if (vigilar()) await guardarEnIpad(); } catch (e) { console.error(e); }
    }), 30000);
    const alSalir = () => enCola(async () => { try { guardar(); await guardarEnIpad(); } catch (e) {} });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") alSalir();
      else enCola(async () => { try { if (vigilar()) { await guardarEnIpad(); marco.contentWindow.location.reload(); } } catch (e) {} });
    });
    window.addEventListener("pagehide", alSalir);
  }

  iniciar().catch((e) => {
    console.error(e);
    fallo("No se pudo abrir la app. Comprueba que tienes la última versión de iPadOS y vuelve a abrirla.<br><small>" +
      String(e).replace(/</g, "&lt;").slice(0, 400) + "</small>");
  });
})();
