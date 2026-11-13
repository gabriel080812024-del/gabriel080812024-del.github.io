/* Caja del Yera — app sin internet para Android.
   El Yera anota lo que hace con el dinero de Gabriel (recibir, cambiar, pagar, comprar Zelle, entregar),
   sube el comprobante (la app lo lee sola) y le manda a Gabriel un archivo cifrado para cuadrar con la contabilidad.
   Todo se guarda en el teléfono (IndexedDB). */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const vista = $("#vista");
  const VERSION_DATOS = 1;

  // ------------------------------------------------------------ iconos (línea)
  const P = {
    zelle: '<path d="M7 7h10L7 17h10"/><path d="M12 4v3M12 17v3"/>',
    recibi: '<path d="M17 7L7 17"/><path d="M16 17H7V8"/>',
    cambio: '<path d="M7 10h14l-4-4"/><path d="M17 14H3l4 4"/>',
    pague: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
    entregue: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 9v6M9 12l3 3 3-3"/>',
    camara: '<path d="M5 7h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    enviar: '<path d="M10 14L21 3"/><path d="M21 3l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1z"/>',
    ajustes: '<path d="M4 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0M6 4v4M6 12v8M10 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0M12 4v10M12 18v2M16 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0M18 4v1M18 9v11"/>',
    inicio: '<path d="M5 12H3l9-9 9 9h-2"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>',
    libro: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6v13M12 6v13M21 6v13"/>',
    compartir: '<path d="M8 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1"/><path d="M12 14V3M9 6l3-3 3 3"/>',
    izq: '<path d="M15 6l-6 6 6 6"/>', der: '<path d="M9 6l6 6-6 6"/>',
    papelera: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;
  const TIPOS = {
    zelle: { titulo: "Compré Zelle", corto: "Zelle", icono: "zelle" },
    recibi: { titulo: "Recibí dinero", corto: "Recibí", icono: "recibi" },
    cambio: { titulo: "Cambié CUP a USD", corto: "Cambio", icono: "cambio" },
    pague: { titulo: "Pagué a alguien", corto: "Pagué", icono: "pague" },
    entregue: { titulo: "Le entregué a Gabriel", corto: "Entregué", icono: "entregue" },
  };

  // ------------------------------------------------------------ guardar en el teléfono
  let _db = null;
  function db() {
    if (_db) return _db;
    _db = new Promise((ok, mal) => {
      const r = indexedDB.open("caja-yera", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("mov")) d.createObjectStore("mov", { keyPath: "id" });
        if (!d.objectStoreNames.contains("ajustes")) d.createObjectStore("ajustes");
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
    return _db;
  }
  async function tx(almacen, modo, fn) {
    const d = await db();
    return new Promise((ok, mal) => {
      const t = d.transaction(almacen, modo), s = t.objectStore(almacen);
      const r = fn(s);
      t.oncomplete = () => ok(r && r.result !== undefined ? r.result : undefined);
      t.onerror = () => mal(t.error);
    });
  }
  const todos = () => tx("mov", "readonly", (s) => s.getAll()).then((l) => (l || []).sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado)));
  const uno = (id) => tx("mov", "readonly", (s) => s.get(id));
  const guardarMov = (m) => tx("mov", "readwrite", (s) => s.put(m));
  const borrarMov = (id) => tx("mov", "readwrite", (s) => s.delete(id));
  const ajuste = (k) => tx("ajustes", "readonly", (s) => s.get(k));
  const ponerAjuste = (k, v) => tx("ajustes", "readwrite", (s) => s.put(v, k));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ------------------------------------------------------------ números y fechas
  const hoy = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const fechaDe = (ms) => { const d = new Date(ms); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const dinero = (v, dec = 2) => (v < 0 ? "−" : "") + Math.abs(v || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fFecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");
  function num(s) {
    s = String(s ?? "").trim().replace(/\s|\$/g, "");
    if (!s) return 0;
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
    const v = parseFloat(s);
    return isNaN(v) ? NaN : Math.round(v * 100) / 100;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------ cuentas
  // Lo que gana el Yera (su %) sale del dinero de Gabriel y va a su cuenta "Ganancias"
  function saldos(movs) {
    const s = { CUP: 0, USD: 0, zelleMes: 0, costoMes: 0, gan: { USD: 0, CUP: 0 }, ganMes: { USD: 0, CUP: 0 } };
    const mes = hoy().slice(0, 7);
    for (const m of movs) {
      for (const [k, v] of Object.entries(efecto(m))) s[k] += v;
      if (m.ganancia) { s.gan[m.gan_moneda] += m.ganancia; if (m.fecha.slice(0, 7) === mes) s.ganMes[m.gan_moneda] += m.ganancia; }
      if (m.tipo === "zelle" && m.fecha.slice(0, 7) === mes) { s.zelleMes += m.zelle; s.costoMes += costoZelle(m); }
    }
    return s;
  }
  // la ganancia del Yera: un % de lo que mueve, cobrada en USD o CUP
  function calcularGanancia(tipo, base, pct, moneda, tasa) {
    if (!(pct > 0) || !(base > 0)) return 0;
    const g = base * pct / 100;                      // en la moneda de la base (Zelle y cambio: USD; envío: su moneda)
    if (tipo === "pague") return Math.round(g * 100) / 100;
    return Math.round((moneda === "CUP" ? g * (tasa || 0) : g) * 100) / 100;
  }
  const costoZelle = (m) => (m.pago_usd || 0) + (m.tasa ? (m.pago_cup || 0) / m.tasa : 0);
  function resumenMov(m) {
    switch (m.tipo) {
      case "zelle": return { t: m.quien ? `Zelle de ${m.quien}` : `Zelle ${m.banco && m.banco !== "Desconocido" ? "· " + m.banco : ""}`, d: [m.mercado_pct ? `a ${m.mercado_pct} %` : "", textoGan(m) || m.confirmacion || "sin número"].filter(Boolean).join(" · "), i: `+${dinero(m.zelle)}`, s: "Zelle" };
      case "recibi": return { t: `Recibí de ${m.de || "—"}`, d: m.nota || "", i: `+${dinero(m.importe)}`, s: m.moneda };
      case "cambio": return { t: "Cambié CUP a USD", d: [`tasa ${dinero(m.cup / m.usd)}`, textoGan(m)].filter(Boolean).join(" · "), i: `+${dinero(m.usd)}`, s: `por ${dinero(m.cup, 0)} CUP` };
      case "pague": return { t: `Pagué a ${m.a || "—"}`, d: [m.concepto, textoGan(m)].filter(Boolean).join(" · "), i: `−${dinero(m.importe)}`, s: m.moneda };
      case "entregue": return { t: "Le entregué a Gabriel", d: m.nota || "", i: `−${dinero(m.importe)}`, s: m.moneda };
    }
    return { t: m.tipo, d: "", i: "", s: "" };
  }
  const textoGan = (m) => m.ganancia ? `gané ${dinero(m.ganancia, m.gan_moneda === "CUP" ? 0 : 2)} ${m.gan_moneda}` : "";

  // ------------------------------------------------------------ navegación
  function ir(ruta) { location.hash = ruta; }
  window.addEventListener("hashchange", pintar);
  $("#atras").onclick = () => (history.length > 1 ? history.back() : ir("#/"));
  function cabecera(titulo, conAtras, seccion) {
    $("#titulo").textContent = titulo; $("#atras").hidden = !conAtras; window.scrollTo(0, 0);
    document.body.classList.toggle("con-nav", !!seccion);
    document.querySelectorAll("#nav [data-sec]").forEach((b) => b.classList.toggle("on", b.dataset.sec === seccion));
  }
  document.body.insertAdjacentHTML("beforeend", `<nav class="nav" id="nav">
    <button data-sec="inicio" data-ir="#/">${ico("inicio")}<span>Inicio</span></button>
    <button data-sec="diario" data-ir="#/diario">${ico("libro")}<span>Diario</span></button>
    <button class="fab" data-ir="#/nuevo/zelle" aria-label="Subir captura de Zelle">${ico("camara")}</button>
    <button data-sec="enviar" data-ir="#/enviar">${ico("enviar")}<span>Enviar</span></button>
    <button data-sec="ajustes" data-ir="#/ajustes">${ico("ajustes")}<span>Ajustes</span></button></nav>`);
  document.querySelectorAll("#nav [data-ir]").forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
  let tAviso = null;
  function avisar(t, malo) {
    const a = $("#aviso"); a.textContent = t; a.className = "aviso-flotante" + (malo ? " malo" : ""); a.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => (a.hidden = true), malo ? 6000 : 3000);
  }
  function estadoRed() { $("#estado-red").textContent = navigator.onLine ? "" : "sin internet"; }
  addEventListener("online", estadoRed); addEventListener("offline", estadoRed); estadoRed();

  async function pintar() {
    const r = location.hash.replace(/^#\/?/, "").split("/");
    try {
      if (r[0] === "nuevo") return await vistaForm(r[1], null);
      if (r[0] === "editar") return await vistaForm(null, r[1]);
      if (r[0] === "mov") return await vistaDetalle(r[1]);
      if (r[0] === "enviar") return await vistaEnviar();
      if (r[0] === "diario") return await vistaDiario(r[1]);
      if (r[0] === "ajustes") return await vistaAjustes();
      return await vistaInicio();
    } catch (e) { console.error(e); vista.innerHTML = `<div class="tarjeta">Algo falló: ${esc(e.message || e)}</div>`; }
  }

  // ------------------------------------------------------------ cuánto mueve cada operación (para saldos y colores)
  function efecto(m) {
    let e = {};
    switch (m.tipo) {
      case "recibi": e = { [m.moneda]: m.importe }; break;
      case "pague": case "entregue": e = { [m.moneda]: -m.importe }; break;
      case "cambio": e = { CUP: -m.cup, USD: m.usd }; break;
      case "zelle": if (m.pago_usd) e.USD = -m.pago_usd; if (m.pago_cup) e.CUP = -m.pago_cup; break;
    }
    if (m.ganancia) e[m.gan_moneda] = (e[m.gan_moneda] || 0) - m.ganancia;  // lo que se queda el Yera
    return e;
  }
  const tono = (m) => m.tipo === "zelle" ? "zelle" : m.tipo === "recibi" ? "entra" : m.tipo === "cambio" ? "cambio" : "sale";
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function nombreDia(f) {
    const h = hoy(), ay = fechaDe(Date.now() - 864e5);
    if (f === h) return "Hoy";
    if (f === ay) return "Ayer";
    const d = new Date(f + "T12:00:00");
    return `${DIAS[d.getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
  }
  function filaMov(m, extra) {
    const r = resumenMov(m), t = tono(m);
    const signo = t === "entra" || t === "zelle" || t === "cambio" ? "ent" : "sal";
    return `<button class="mov" data-ir="#/mov/${m.id}"><span class="ic ${t}">${ico(TIPOS[m.tipo].icono)}</span>
      <span class="tx"><b>${esc(r.t)}</b>${r.d ? `<small>${esc(r.d)}</small>` : ""}</span>
      <span class="im ${signo}">${r.i}<small>${esc(extra || r.s)}</small></span></button>`;
  }
  function agruparPorDia(lista) {
    const g = [];
    for (const m of lista) { const u = g[g.length - 1]; if (u && u.fecha === m.fecha) u.movs.push(m); else g.push({ fecha: m.fecha, movs: [m] }); }
    return g;
  }

  // ------------------------------------------------------------ inicio (estilo banca)
  async function vistaInicio() {
    cabecera("Caja del Yera", false, "inicio");
    const movs = await todos(), s = saldos(movs);
    const pct = s.zelleMes ? (s.costoMes / s.zelleMes - 1) * 100 : 0;
    const recientes = movs.slice(0, 25);
    vista.innerHTML = `
      <section class="saldo-cab">
        <small>Tengo de Gabriel</small>
        <div class="saldo-dos"><div><b class="${s.CUP < -0.004 ? "neg" : ""}">${dinero(s.CUP, 0)}</b><span>CUP</span></div>
          <div><b class="${s.USD < -0.004 ? "neg" : ""}">${dinero(s.USD)}</b><span>USD</span></div></div>
        <p>Zelle del mes <b>${dinero(s.zelleMes)}</b>${s.zelleMes ? ` · costó <b>${pct >= 0 ? "+" : ""}${pct.toFixed(1)} %</b>` : ""}</p>
      </section>
      <section class="ganancias">
        <span class="ic entra">${ico("recibi")}</span>
        <div><small>Ganancias (lo mío)</small><b>${dinero(s.gan.USD)} <i>USD</i></b>${s.gan.CUP ? `<b>${dinero(s.gan.CUP, 0)} <i>CUP</i></b>` : ""}</div>
        <div class="mes"><small>este mes</small><b>+${dinero(s.ganMes.USD)}</b>${s.ganMes.CUP ? `<b>+${dinero(s.ganMes.CUP, 0)}</b>` : ""}</div>
      </section>
      <div class="rapidos">
        ${["recibi", "cambio", "pague", "entregue"].map((k) => `<button data-ir="#/nuevo/${k}"><span class="ic ${tono({ tipo: k })}">${ico(TIPOS[k].icono)}</span>${TIPOS[k].corto === "Cambio" ? "Cambié" : TIPOS[k].corto}</button>`).join("")}
      </div>
      ${recientes.length ? agruparPorDia(recientes).map((d) => `<h2>${nombreDia(d.fecha)}</h2><div class="lista">${d.movs.map((m) => filaMov(m)).join("")}</div>`).join("")
        + (movs.length > recientes.length ? `<button class="boton sec" data-ir="#/diario">Ver todo en el diario</button>` : "")
        : `<div class="lista"><div class="vacio">Todavía no hay nada anotado.<br>Toca el botón de la <b>cámara</b> para subir una captura de Zelle, o <b>Recibí</b> cuando te den dinero.</div></div>`}`;
    vista.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
  }

  // ------------------------------------------------------------ libro diario por días
  async function vistaDiario(mesPedido) {
    cabecera("Libro diario", false, "diario");
    const movs = (await todos()).slice().sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado));
    const meses = [...new Set(movs.map((m) => m.fecha.slice(0, 7)))].sort();
    const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : (meses[meses.length - 1] || hoy().slice(0, 7));
    // saldos corridos desde el principio
    const corr = { CUP: 0, USD: 0 }, despues = new Map(), cierre = new Map();
    let inicioMes = null, finMes = null;
    for (const m of movs) {
      if (m.fecha.slice(0, 7) >= mes && inicioMes === null) inicioMes = { ...corr };
      for (const [k, v] of Object.entries(efecto(m))) corr[k] += v;
      despues.set(m.id, { ...corr });
      cierre.set(m.fecha, { ...corr });
      if (m.fecha.slice(0, 7) <= mes) finMes = { ...corr };
    }
    if (inicioMes === null) inicioMes = { ...corr };
    if (finMes === null) finMes = { CUP: 0, USD: 0 };
    const delMes = movs.filter((m) => m.fecha.slice(0, 7) === mes);
    const tot = { CUP: { e: 0, s: 0 }, USD: { e: 0, s: 0 } };
    let zelle = 0; const ganM = { USD: 0, CUP: 0 };
    for (const m of delMes) {
      for (const [k, v] of Object.entries(efecto(m))) v > 0 ? (tot[k].e += v) : (tot[k].s -= v);
      if (m.tipo === "zelle") zelle += m.zelle;
      if (m.ganancia) ganM[m.gan_moneda] += m.ganancia;
    }
    const i = meses.indexOf(mes), ant = meses[i - 1] || null, sig = meses[i + 1] || null;
    const queda = (m) => {
      const d = despues.get(m.id), e = efecto(m);
      return Object.keys(e).map((k) => `queda ${dinero(d[k], k === "CUP" ? 0 : 2)} ${k}`).join(" · ");
    };
    const dias = agruparPorDia(delMes.slice().reverse());
    vista.innerHTML = `
      <div class="mes-sel">
        <button ${ant ? `data-ir="#/diario/${ant}"` : "disabled"} aria-label="Mes anterior">${ico("izq")}</button>
        <b>${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}</b>
        <button ${sig ? `data-ir="#/diario/${sig}"` : "disabled"} aria-label="Mes siguiente">${ico("der")}</button>
      </div>
      <div class="resumen-mes">
        ${["CUP", "USD"].map((k) => `<div><small>${k}</small><b>${dinero(finMes[k], k === "CUP" ? 0 : 2)}</b>
          <span class="ent">+${dinero(tot[k].e, k === "CUP" ? 0 : 2)}</span> <span class="sal">−${dinero(tot[k].s, k === "CUP" ? 0 : 2)}</span>
          <em>empezó el mes con ${dinero(inicioMes[k], k === "CUP" ? 0 : 2)}</em></div>`).join("")}
      </div>
      ${zelle || ganM.USD || ganM.CUP ? `<p class="nota">${zelle ? `Zelle comprado en el mes: <b>${dinero(zelle)} USD</b>` : ""}${(ganM.USD || ganM.CUP) ? `${zelle ? " · " : ""}mis ganancias: <b>${dinero(ganM.USD)} USD${ganM.CUP ? " · " + dinero(ganM.CUP, 0) + " CUP" : ""}</b>` : ""}</p>` : ""}
      ${dias.length ? dias.map((d) => {
        const c = cierre.get(d.fecha);
        return `<div class="dia-cab"><b>${nombreDia(d.fecha)}</b><span>al cerrar: ${dinero(c.USD)} USD · ${dinero(c.CUP, 0)} CUP</span></div>
          <div class="lista">${d.movs.map((m) => filaMov(m, m.tipo === "cambio" ? `tasa ${dinero(m.cup / m.usd)}` : queda(m))).join("")}</div>`;
      }).join("") : `<div class="lista"><div class="vacio">No hay operaciones en este mes.</div></div>`}
      ${delMes.length ? `<button class="boton sec no-imprimir" id="pdf">${ico("compartir")} Guardar o mandar en PDF</button>` : ""}`;
    vista.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
    const pdf = $("#pdf");
    if (pdf) pdf.onclick = () => { document.title = `Diario del Yera - ${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`; window.print(); setTimeout(() => (document.title = "Caja del Yera"), 1500); };
  }

  // ------------------------------------------------------------ ajustes
  async function vistaAjustes() {
    cabecera("Ajustes", false, "ajustes");
    const movs = await todos();
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    vista.innerHTML = `
      <div class="tarjeta">
        <b>Recuperar una copia</b>
        <p class="nota">Si cambiaste de teléfono o se borró la app: elige el último archivo .yera que mandaste y escribe su contraseña.</p>
        <label>Archivo (.yera)<input type="file" id="copia" accept=".yera,application/octet-stream"></label>
        <label>Contraseña<input type="password" id="clave2" autocomplete="off"></label>
        <button class="boton sec" id="recuperar">Recuperar</button>
      </div>
      <div class="tarjeta">
        <b>Este teléfono</b>
        <p class="nota">${movs.length} operaciones guardadas${est ? ` · ocupa ${(est.usage / 1048576).toFixed(1)} MB` : ""}. Todo se guarda solo aquí: manda el archivo a Gabriel cada semana, que también es tu copia.</p>
        <p class="nota">Caja del Yera · funciona sin internet</p>
      </div>`;
    $("#recuperar").onclick = recuperarCopia;
  }
  async function recuperarCopia() {
    const f = $("#copia").files[0];
    if (!f) return avisar("Elige el archivo .yera.", true);
    try {
      const d = await leerArchivo(new Uint8Array(await f.arrayBuffer()), $("#clave2").value);
      let n = 0;
      for (const x of d.movimientos || []) {
        if (x.comprobante && x.comprobante.datos) x.comprobante = deB64(x.comprobante.datos, x.comprobante.tipo);
        else delete x.comprobante;
        await guardarMov(x); n++;
      }
      avisar(`Recuperadas ${n} operaciones.`); ir("#/");
    } catch (err) { avisar(err.message || String(err), true); }
  }

  // ------------------------------------------------------------ imágenes: comprimir, huellas para no repetir
  function cargarImg(blob) {
    return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo abrir la imagen.")); i.src = URL.createObjectURL(blob); });
  }
  async function comprimir(img) {
    const max = 1400, e = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.72));
  }
  function huellaVisual(img) {  // dHash de 64 bits: parecida aunque cambie el tamaño o la compresión
    const c = document.createElement("canvas"); c.width = 9; c.height = 8;
    const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 9, 8);
    const p = cx.getImageData(0, 0, 9, 8).data; let bits = "";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4, j = i + 4;
      bits += (p[i] + p[i + 1] + p[i + 2]) > (p[j] + p[j + 1] + p[j + 2]) ? "1" : "0";
    }
    return bits;
  }
  const distancia = (a, b) => { let d = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) d += a[i] !== b[i]; return d; };
  async function sha256(blob) {
    const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function repetido(m, movs) {
    for (const o of movs) {
      if (o.id === m.id) continue;
      if (m.tipo === "zelle" && o.tipo === "zelle" && m.confirmacion && o.confirmacion &&
          m.confirmacion.toLowerCase() === o.confirmacion.toLowerCase()) return `Ya está anotado un Zelle con ese número de confirmación (${fFecha(o.fecha)}, ${dinero(o.zelle)} USD).`;
      if (m.sha && o.sha && m.sha === o.sha) return `Esa misma captura ya se subió el ${fFecha(o.fecha)}.`;
      const imp = (x) => x.tipo === "zelle" ? x.zelle : x.tipo === "cambio" ? x.usd : x.importe;
      if (m.huella && o.huella && distancia(m.huella, o.huella) <= 4 && Math.abs(imp(m) - imp(o)) < 0.01)
        return `Parece la misma captura que una del ${fFecha(o.fecha)} por ${dinero(imp(o))}.`;
    }
    return null;
  }

  // ------------------------------------------------------------ formularios
  const campo = (n, et, v, extra = "") => `<label>${et}<input name="${n}" value="${esc(v ?? "")}" ${extra}></label>`;
  async function vistaForm(tipo, id) {
    const previo = id ? await uno(id) : null;
    tipo = previo ? previo.tipo : tipo;
    if (!TIPOS[tipo]) return ir("#/");
    cabecera(previo ? "Cambiar: " + TIPOS[tipo].corto : TIPOS[tipo].titulo, true);
    const m = previo || { tipo, fecha: hoy() };
    const tasaUlt = (await ajuste("tasa")) || "";
    const ganUlt = (await ajuste("gan_pct")) || {};
    const gm = m.gan_moneda || "USD";
    const GANMON = `<option ${gm === "USD" ? "selected" : ""}>USD</option><option ${gm === "CUP" ? "selected" : ""}>CUP</option>`;
    const dec = 'inputmode="decimal" autocomplete="off"';
    let cuerpo = "";
    if (tipo === "zelle") cuerpo = `
      ${campo("quien", "¿Quién mandó el Zelle? <small>(el nombre que viene con la foto)</small>", m.quien || "", 'list="remitentes" required autocomplete="off" placeholder="Nombre"')}
      ${campo("zelle", "Zelle recibido (USD)", m.zelle, dec + ' required placeholder="1050.00"')}
      <div class="dos">${campo("fecha", "Fecha", m.fecha, 'type="date" required')}${campo("banco", "Banco", m.banco, 'placeholder="Bank of America"')}</div>
      ${campo("confirmacion", "N.º de confirmación", m.confirmacion, 'autocapitalize="off" spellcheck="false"')}
      ${campo("mercado_pct", "El Zelle está a <small>(% que cobra el vendedor)</small>", m.mercado_pct || (await ajuste("mercado_pct")) || "", dec + ' placeholder="5"')}
      <h2>Lo que le pagué al vendedor</h2>
      <div class="dos">${campo("pago_usd", "En USD", m.pago_usd || "", dec + ' placeholder="0"')}${campo("pago_cup", "En CUP", m.pago_cup || "", dec + ' placeholder="0"')}</div>
      ${campo("tasa", "Tasa de los CUP <small>(CUP por 1 USD)</small>", m.tasa || tasaUlt, dec)}
      <h2>Mi ganancia</h2>
      <div class="dos">${campo("gan_pct", "Mi % ", m.gan_pct || ganUlt[tipo] || "", dec + ' placeholder="0"')}
        <label>La cobro en<select name="gan_moneda">${GANMON}</select></label></div>
      <div class="calculo" id="calc"></div>
      ${campo("nota", "Nota <small>(opcional)</small>", m.nota)}`;
    else if (tipo === "recibi") cuerpo = `
      ${campo("de", "¿De quién?", m.de || "", 'list="personas" required placeholder="Gabriel, JIMMY…"')}
      <div class="dos"><label>Moneda<select name="moneda"><option ${m.moneda === "CUP" ? "selected" : ""}>CUP</option><option ${m.moneda === "USD" ? "selected" : ""}>USD</option></select></label>
      ${campo("importe", "Importe", m.importe, dec + " required")}</div>
      ${campo("fecha", "Fecha", m.fecha, 'type="date" required')}${campo("nota", "Nota <small>(opcional)</small>", m.nota)}`;
    else if (tipo === "cambio") cuerpo = `
      <div class="dos">${campo("cup", "Entregué CUP", m.cup, dec + " required")}${campo("usd", "Recibí USD", m.usd, dec + " required")}</div>
      <h2>Mi ganancia</h2>
      <div class="dos">${campo("gan_pct", "Mi % ", m.gan_pct || ganUlt[tipo] || "", dec + ' placeholder="0"')}
        <label>La cobro en<select name="gan_moneda">${GANMON}</select></label></div>
      <div class="calculo" id="calc"></div>
      ${campo("fecha", "Fecha", m.fecha, 'type="date" required')}${campo("nota", "¿Con quién? <small>(opcional)</small>", m.nota)}`;
    else if (tipo === "pague") cuerpo = `
      ${campo("a", "¿A quién le pagué?", m.a || "", 'list="personas" required')}
      <div class="dos"><label>Moneda<select name="moneda"><option ${m.moneda === "CUP" ? "selected" : ""}>CUP</option><option ${m.moneda === "USD" ? "selected" : ""}>USD</option></select></label>
      ${campo("importe", "Importe", m.importe, dec + " required")}</div>
      ${campo("concepto", "¿Por qué?", m.concepto, 'placeholder="Flete, mercancía…"')}${campo("fecha", "Fecha", m.fecha, 'type="date" required')}
      <h2>Mi ganancia por el envío</h2>
      ${campo("gan_pct", "Mi % <small>(opcional)</small>", m.gan_pct || "", dec + ' placeholder="0"')}
      <div class="calculo" id="calc"></div>`;
    else if (tipo === "entregue") cuerpo = `
      <div class="dos"><label>Moneda<select name="moneda"><option ${m.moneda === "USD" ? "selected" : ""}>USD</option><option ${m.moneda === "CUP" ? "selected" : ""}>CUP</option></select></label>
      ${campo("importe", "Importe", m.importe, dec + " required")}</div>
      ${campo("fecha", "Fecha", m.fecha, 'type="date" required')}${campo("nota", "Nota <small>(opcional)</small>", m.nota)}`;
    const lista = await todos();
    const personas = [...new Set(lista.flatMap((x) => [x.de, x.a]).filter(Boolean))];
    const remitentes = [...new Set(lista.map((x) => x.quien).filter(Boolean))];
    vista.innerHTML = `
      <form class="tarjeta" id="f" novalidate>
        <label class="foto" id="foto" for="archivo">${m.comprobante ? `<img src="${URL.createObjectURL(m.comprobante)}" alt="Comprobante">` : ico("camara") + (tipo === "zelle" ? "Subir la captura del Zelle<small>o escribe los datos a mano abajo</small>" : "Subir comprobante (opcional)")}</label>
        <input type="file" accept="image/*,application/pdf" id="archivo" hidden>
        <button type="button" class="quitar-foto" id="quitar-foto" ${m.comprobante ? "" : "hidden"}>Quitar la foto</button>
        <div id="lectura"></div>
        ${cuerpo}
        <datalist id="personas">${personas.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>
        <datalist id="remitentes">${remitentes.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>
        <ul class="avisos" id="errores"></ul>
        <button class="boton" type="submit">${previo ? "Guardar cambios" : "Guardar"}</button>
        ${previo ? `<button class="boton peligro" type="button" id="borrar">${ico("papelera")} Borrar</button>` : ""}
      </form>`;
    const f = $("#f");
    let comp = previo ? { blob: previo.comprobante, sha: previo.sha, huella: previo.huella } : null;
    const ganTexto = (base, monedaBase, tasaG) => {
      if (!f.gan_pct) return "";
      const gp = num(f.gan_pct.value);
      if (!(gp > 0)) return "";
      const gmon = tipo === "pague" ? monedaBase : f.gan_moneda.value;
      if (gmon === "CUP" && tipo !== "pague" && !(tasaG > 0)) return `<br>Para cobrar tu ganancia en CUP falta la tasa.`;
      const g = calcularGanancia(tipo, base, gp, gmon, tasaG);
      return `<br>Tu ganancia: <b class="gana">${dinero(g, gmon === "CUP" ? 0 : 2)} ${gmon}</b> (${gp} %) → va a <b>Ganancias</b>`;
    };
    const calc = () => {
      const el = $("#calc"); if (!el) return;
      if (tipo === "cambio") {
        const c = num(f.cup.value), u = num(f.usd.value);
        el.innerHTML = c > 0 && u > 0 ? `Tasa del cambio: <b>${dinero(c / u)}</b> CUP por 1 USD` + ganTexto(u, "USD", c / u) : "Escribe los CUP que diste y los USD que recibiste.";
        return;
      }
      if (tipo === "pague") {
        const imp = num(f.importe.value);
        el.innerHTML = imp > 0 && num(f.gan_pct.value) > 0 ? ganTexto(imp, f.moneda.value).replace(/^<br>/, "") : "Si cobras por hacer el envío, escribe tu %.";
        return;
      }
      const z = num(f.zelle.value), pu = num(f.pago_usd.value) || 0, pc = num(f.pago_cup.value) || 0, t = num(f.tasa.value), mp = num(f.mercado_pct.value);
      let h = "";
      if (z > 0 && mp > 0) {
        const precio = z * (1 + mp / 100);
        h += `Al <b>${mp} %</b>, el vendedor cobra <b>${dinero(precio)} USD</b>${t > 0 ? ` o <b>${dinero(precio * t, 0)} CUP</b>` : ""}.<br>`;
      }
      if (!(z > 0) || (!pu && !pc)) { el.innerHTML = h + "Escribe lo que le pagaste (USD, CUP o las dos)." + (z > 0 ? ganTexto(z, "USD", t) : ""); return; }
      if (pc && !(t > 0)) { el.innerHTML = h + "Pagaste en CUP: escribe la tasa para calcular."; return; }
      const costo = pu + (pc ? pc / t : 0), d = costo - z, pct = d / z * 100;
      h += `Costó <b>${dinero(costo)} USD</b> por <b>${dinero(z)}</b> de Zelle: <b class="${d > 0 ? "pierde" : "gana"}">${d >= 0 ? "+" : ""}${pct.toFixed(2)} %</b>`;
      if (mp > 0 && Math.abs(pct - mp) > 0.05) h += ` <small>(el vendedor dijo ${mp} %)</small>`;
      el.innerHTML = h + ganTexto(z, "USD", t);
    };
    f.addEventListener("input", calc); calc();

    const alElegir = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const lectura = $("#lectura");
      if (/pdf/i.test(file.type)) { lectura.innerHTML = `<p class="nota">PDF guardado. Escribe los datos a mano (la lectura de PDF llega en la próxima versión).</p>`; comp = { blob: file, sha: await sha256(file), huella: null }; return; }
      lectura.innerHTML = `<div class="leyendo"><span class="rueda"></span>Leyendo la captura… (unos segundos)</div>`;
      try {
        const img = await cargarImg(file);
        const blob = await comprimir(img);
        comp = { blob, sha: await sha256(file), huella: huellaVisual(img) };
        $("#foto").innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Comprobante">`;
        const r = await LectorZelle.leerComprobante(img.src);
        const poner = (n, v) => { if (v === null || v === undefined || v === "" || !f[n]) return; f[n].value = v; f[n].classList.add("leido"); };
        if (tipo === "zelle") {
          poner("zelle", r.importe ? r.importe.toFixed(2) : null);
          poner("banco", r.banco !== "Desconocido" ? r.banco : null);
          poner("confirmacion", r.confirmacion);
          poner("fecha", r.fecha && r.fecha !== "hoy" ? r.fecha : fechaDe(file.lastModified || Date.now()));
          comp.cuenta = r.cuenta || null; comp.a_nuestra = r.a_nuestra_cuenta;
          if (r.remitente && !f.quien.value) poner("quien", r.remitente);
        } else {
          const t = r.texto || "";
          const cup = /([\d.,]{3,})\s*(cup|mn|pesos)/i.exec(t);
          if (cup && f.importe && !f.importe.value) { poner("importe", num(cup[1])); if (f.moneda) f.moneda.value = "CUP"; }
          else if (r.importe && f.importe && !f.importe.value) { poner("importe", r.importe.toFixed(2)); if (f.moneda) f.moneda.value = "USD"; }
          if (r.fecha && r.fecha !== "hoy" && f.fecha) poner("fecha", r.fecha);
        }
        const avisos = tipo === "zelle" ? r.avisos : [];
        lectura.innerHTML = `<p class="nota">Lo marcado en verde lo leyó la app: revísalo.</p>` + (avisos.length ? `<ul class="avisos">${avisos.map((a) => `<li class="${/nuestra cuenta|cancelad/.test(a) ? "malo" : ""}">${esc(a)}</li>`).join("")}</ul>` : "");
        calc();
      } catch (err) {
        console.error(err);
        lectura.innerHTML = `<ul class="avisos"><li>No se pudo leer la captura: escribe los datos a mano.</li></ul>`;
      }
      $("#quitar-foto").hidden = false;
    };
    $("#archivo").onchange = alElegir;

    $("#quitar-foto").onclick = () => {
      if (!confirm("¿Quitar la foto de este movimiento?")) return;
      comp = null;
      $("#foto").innerHTML = ico("camara") + "Subir otra foto";
      $("#archivo").value = "";
      $("#quitar-foto").hidden = true; $("#lectura").innerHTML = "";
    };
    if (previo) $("#borrar").onclick = async () => {
      if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
      await borrarMov(previo.id); avisar("Borrado."); ir("#/");
    };

    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = [];
      const v = (n) => (f[n] ? f[n].value.trim() : "");
      const nuevo = { id: previo ? previo.id : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), tipo,
        fecha: v("fecha"), creado: previo ? previo.creado : new Date().toISOString(), cambiado: previo ? new Date().toISOString() : null };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevo.fecha)) err.push("Pon la fecha.");
      const positivo = (n, et) => { const x = num(v(n)); if (!(x > 0)) err.push(`Escribe ${et} (mayor que cero).`); return x; };
      if (tipo === "zelle") {
        nuevo.zelle = positivo("zelle", "el Zelle recibido");
        nuevo.pago_usd = num(v("pago_usd")) || 0; nuevo.pago_cup = num(v("pago_cup")) || 0; nuevo.tasa = num(v("tasa")) || 0;
        if (isNaN(nuevo.pago_usd) || isNaN(nuevo.pago_cup) || nuevo.pago_usd < 0 || nuevo.pago_cup < 0) err.push("Revisa lo que pagaste.");
        if (!nuevo.pago_usd && !nuevo.pago_cup) err.push("Escribe lo que le pagaste al vendedor (USD, CUP o las dos).");
        if (nuevo.pago_cup && !(nuevo.tasa > 0)) err.push("Pagaste en CUP: escribe la tasa.");
        nuevo.banco = v("banco"); nuevo.confirmacion = v("confirmacion"); nuevo.nota = v("nota");
        nuevo.mercado_pct = num(v("mercado_pct")) || 0;
        nuevo.cuenta = comp && comp.cuenta || (previo && previo.cuenta) || null;
        nuevo.quien = v("quien");
        if (!nuevo.quien) err.push("Escribe quién mandó el Zelle (el nombre que te dijeron con la foto).");
      } else if (tipo === "cambio") {
        nuevo.cup = positivo("cup", "los CUP que diste"); nuevo.usd = positivo("usd", "los USD que recibiste"); nuevo.nota = v("nota");
      } else {
        nuevo.moneda = v("moneda") === "USD" ? "USD" : "CUP"; nuevo.importe = positivo("importe", "el importe");
        if (tipo === "recibi") { nuevo.de = v("de"); if (!nuevo.de) err.push("Escribe de quién lo recibiste."); }
        if (tipo === "pague") { nuevo.a = v("a"); nuevo.concepto = v("concepto"); if (!nuevo.a) err.push("Escribe a quién le pagaste."); }
        nuevo.nota = v("nota");
      }
      // ganancia del Yera
      const gp = f.gan_pct ? num(v("gan_pct")) : 0;
      if (gp && (isNaN(gp) || gp < 0 || gp > 50)) err.push("Revisa tu % de ganancia (entre 0 y 50).");
      else if (gp > 0) {
        nuevo.gan_pct = gp;
        nuevo.gan_moneda = tipo === "pague" ? nuevo.moneda : (v("gan_moneda") === "CUP" ? "CUP" : "USD");
        const base = tipo === "zelle" ? nuevo.zelle : tipo === "cambio" ? nuevo.usd : nuevo.importe;
        const tasaG = tipo === "cambio" ? (nuevo.usd ? nuevo.cup / nuevo.usd : 0) : nuevo.tasa;
        if (nuevo.gan_moneda === "CUP" && tipo !== "pague" && !(tasaG > 0)) err.push("Para cobrar tu ganancia en CUP escribe la tasa.");
        nuevo.ganancia = calcularGanancia(tipo, base, gp, nuevo.gan_moneda, tasaG);
      }
      if (comp && comp.blob) Object.assign(nuevo, { comprobante: comp.blob, sha: comp.sha, huella: comp.huella });
      if (tipo === "zelle" && !nuevo.comprobante && !nuevo.confirmacion) nuevo.manual = true;
      const movs = await todos();
      if (!err.length) { const r = await repetido(nuevo, movs); if (r) err.push(r + " No se guardó para no contarlo dos veces."); }
      $("#errores").innerHTML = err.map((x) => `<li class="malo">${esc(x)}</li>`).join("");
      if (err.length) { $("#errores").scrollIntoView({ block: "center" }); return; }
      if (tipo === "zelle" && nuevo.tasa) await ponerAjuste("tasa", nuevo.tasa);
      if (tipo === "zelle" && nuevo.mercado_pct) await ponerAjuste("mercado_pct", nuevo.mercado_pct);
      if (nuevo.gan_pct && tipo !== "pague") { const g = (await ajuste("gan_pct")) || {}; g[tipo] = nuevo.gan_pct; await ponerAjuste("gan_pct", g); }
      await guardarMov(nuevo);
      avisar(previo ? "Cambios guardados." : "Guardado.");
      ir("#/");
    };
  }

  // ------------------------------------------------------------ detalle
  async function vistaDetalle(id) {
    const m = await uno(id);
    if (!m) return ir("#/");
    cabecera(TIPOS[m.tipo].titulo, true);
    const filas = [["Fecha", fFecha(m.fecha)]];
    if (m.tipo === "zelle") {
      const costo = costoZelle(m), pct = (costo / m.zelle - 1) * 100;
      filas.push(["Lo mandó", m.quien || "—"], ["Zelle recibido", dinero(m.zelle) + " USD"], ["Banco", m.banco || "—"], ["N.º de confirmación", m.confirmacion || "—"], ["Cuenta de origen", m.cuenta || "—"],
        ["Pagué en USD", dinero(m.pago_usd || 0)], ["Pagué en CUP", dinero(m.pago_cup || 0, 0) + (m.pago_cup ? ` (tasa ${dinero(m.tasa)})` : "")],
        ["Costó", `${dinero(costo)} USD (${pct >= 0 ? "+" : ""}${pct.toFixed(2)} %)`]);
      if (m.mercado_pct) filas.push(["El Zelle estaba a", `${m.mercado_pct} %`]);
    } else if (m.tipo === "cambio") filas.push(["Entregué", dinero(m.cup, 0) + " CUP"], ["Recibí", dinero(m.usd) + " USD"], ["Tasa", dinero(m.cup / m.usd)]);
    else {
      if (m.de) filas.push(["De", m.de]);
      if (m.a) filas.push(["A", m.a]);
      filas.push(["Importe", `${dinero(m.importe)} ${m.moneda}`]);
      if (m.concepto) filas.push(["Por", m.concepto]);
    }
    if (m.ganancia) filas.push(["Mi ganancia", `${dinero(m.ganancia, m.gan_moneda === "CUP" ? 0 : 2)} ${m.gan_moneda} (${m.gan_pct} %)`]);
    if (m.nota) filas.push(["Nota", m.nota]);
    vista.innerHTML = `<div class="tarjeta detalle"><dl>${filas.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>
      ${m.comprobante ? (/pdf/.test(m.comprobante.type) ? `<p class="nota">Comprobante en PDF guardado.</p>` : `<img src="${URL.createObjectURL(m.comprobante)}" alt="Comprobante">`) : `<p class="nota">Sin comprobante.</p>`}
      <div class="dos"><button class="boton sec" id="editar">Modificar</button><button class="boton peligro" id="eliminar">${ico("papelera")} Eliminar</button></div></div>`;
    $("#editar").onclick = () => ir("#/editar/" + m.id);
    $("#eliminar").onclick = async () => {
      if (!confirm("¿Eliminar este movimiento? No se puede deshacer.")) return;
      await borrarMov(m.id); avisar("Eliminado."); ir("#/");
    };
  }

  // ------------------------------------------------------------ mandar a Gabriel y copia de seguridad (archivo cifrado)
  const MAGIA = new TextEncoder().encode("YERA1");
  async function llave(clave, sal) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 210000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const aB64 = async (blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); };
  const deB64 = (s, tipo) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type: tipo }); };
  async function comprimirTexto(texto) {
    if (!window.CompressionStream) return { gz: false, datos: new TextEncoder().encode(texto) };
    const s = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
    return { gz: true, datos: new Uint8Array(await new Response(s).arrayBuffer()) };
  }
  async function descomprimir(bytes, gz) {
    if (!gz) return new TextDecoder().decode(bytes);
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(s).text();
  }
  async function crearArchivo(clave) {
    const movs = await todos();
    const lista = [];
    for (const m of movs) {
      const x = Object.assign({}, m);
      delete x.comprobante;
      if (m.comprobante) x.comprobante = { tipo: m.comprobante.type || "image/jpeg", datos: await aB64(m.comprobante) };
      lista.push(x);
    }
    const s = saldos(movs);
    const json = JSON.stringify({ formato: "caja-yera", version: VERSION_DATOS, generado: new Date().toISOString(),
      saldos: { CUP: Math.round(s.CUP * 100) / 100, USD: Math.round(s.USD * 100) / 100 }, movimientos: lista });
    const { gz, datos } = await comprimirTexto(json);
    const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llave(clave, sal), datos));
    const salida = new Uint8Array(MAGIA.length + 1 + 16 + 12 + cifrado.length);
    salida.set(MAGIA, 0); salida[5] = gz ? 1 : 0; salida.set(sal, 6); salida.set(iv, 22); salida.set(cifrado, 34);
    return { bytes: salida, n: movs.length };
  }
  async function leerArchivo(bytes, clave) {
    if (bytes.length < 40 || new TextDecoder().decode(bytes.slice(0, 5)) !== "YERA1") throw new Error("Ese archivo no es de la Caja del Yera.");
    let plano;
    try { plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(22, 34) }, await llave(clave, bytes.slice(6, 22)), bytes.slice(34)); }
    catch (e) { throw new Error("Contraseña incorrecta."); }
    return JSON.parse(await descomprimir(new Uint8Array(plano), bytes[5] === 1));
  }
  async function vistaEnviar() {
    cabecera("Mandar a Gabriel", false, "enviar");
    const clave = (await ajuste("clave")) || "";
    const movs = await todos();
    vista.innerHTML = `
      <div class="tarjeta">
        <p style="margin-top:0">Crea un archivo protegido con contraseña con <b>todo lo anotado</b> (${movs.length} movimientos, con sus comprobantes) para mandárselo a Gabriel por WhatsApp. Él lo carga en Mi Contabilidad para cuadrar.</p>
        <label>Contraseña acordada con Gabriel <small>(mínimo 8)</small><input type="password" id="clave" value="${esc(clave)}" autocomplete="off"></label>
        <label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="checkbox" id="recordar" ${clave ? "checked" : ""} style="width:auto;margin:0"> Recordarla en este teléfono</label>
        <button class="boton" id="mandar">${ico("enviar")} Crear y mandar</button>
        <p class="nota">Ese mismo archivo es tu copia de seguridad: si cambias de teléfono, lo cargas abajo con la contraseña y recuperas todo.</p>
      </div>
`;
    $("#mandar").onclick = async (e) => {
      const c = $("#clave").value;
      if (c.length < 8) return avisar("La contraseña tiene que tener al menos 8 letras o números.", true);
      const b = e.currentTarget; b.disabled = true; b.textContent = "Preparando…";
      try {
        await ponerAjuste("clave", $("#recordar").checked ? c : "");
        const { bytes } = await crearArchivo(c);
        const nombre = `caja-yera_${hoy()}.yera`;
        const file = new File([bytes], nombre, { type: "application/octet-stream" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: nombre, text: "Caja del Yera" }).catch((err) => { if (err.name !== "AbortError") throw err; });
        } else {
          const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
          avisar("Archivo guardado en Descargas: mándalo por WhatsApp.");
        }
      } catch (err) { avisar("No se pudo crear el archivo: " + (err.message || err), true); }
      b.disabled = false; b.innerHTML = `${ico("enviar")} Crear y mandar`;
    };
  }

  // para las pruebas
  window.__caja = { crearArchivo, leerArchivo, todos, saldos };

  // ------------------------------------------------------------ funcionar sin internet
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  pintar();
})();
