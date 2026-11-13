/* Lector de comprobantes de Zelle — sin internet.
   1) Lee el texto de la captura (Tesseract, dentro del teléfono).
   2) Reconoce el banco y saca: importe, fecha, número de confirmación, cuenta de origen y a quién se mandó.
   Bancos conocidos: Bank of America, Chase, Wells Fargo, Navy Federal, Truist y Capital One (en español e inglés). */
(function (global) {
  "use strict";
  const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, "")) || "./";
  const NUESTRA_CUENTA = /lapinet|lapino|lapinet1998/i;   // la cuenta Zelle del negocio
  const MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

  // ---------------------------------------------------------------- leer el texto de la imagen
  let trabajador = null;
  async function motor() {
    if (trabajador) return trabajador;
    trabajador = await Tesseract.createWorker(["spa", "eng"], 1, {
      workerPath: BASE + "lib/ocr/worker.min.js",
      corePath: BASE + "lib/ocr/",
      langPath: BASE + "lib/ocr/",
      gzip: true,
      workerBlobURL: false,
      logger: () => {},
    });
    await trabajador.setParameters({ preserve_interword_spaces: "1" });
    return trabajador;
  }

  function cargarImagen(origen) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error("No se pudo abrir la imagen."));
      img.src = typeof origen === "string" ? origen : URL.createObjectURL(origen);
    });
  }

  // Prepara la imagen: tamaño cómodo, en grises y, si es oscura (foto de una pantalla en modo oscuro), invertida.
  function preparar(img, factor = 1) {
    const ancho = Math.min(1600, Math.max(900, img.naturalWidth)) * factor;
    const esc = ancho / img.naturalWidth;
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.naturalWidth * esc); cv.height = Math.round(img.naturalHeight * esc);
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data;
    let suma = 0;
    for (let i = 0; i < p.length; i += 4) suma += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const oscura = suma / (p.length / 4) < 110;
    for (let i = 0; i < p.length; i += 4) {
      let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      if (oscura) g = 255 - g;
      g = g < 128 ? Math.max(0, g * 0.85) : Math.min(255, g * 1.05 + 8);  // un poco más de contraste
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    cx.putImageData(d, 0, 0);
    return { lienzo: cv, oscura };
  }

  async function leerTexto(origen, opciones = {}) {
    const img = origen instanceof HTMLImageElement ? origen : await cargarImagen(origen);
    const { lienzo, oscura } = preparar(img, opciones.factor || 1);
    const t = await motor();
    await t.setParameters({ tessedit_pageseg_mode: opciones.suelto ? "11" : "3", tessedit_char_whitelist: "" });  // 11 = texto suelto (columnas, tablas)
    const r = await t.recognize(lienzo);
    return { texto: r.data.text || "", oscura, confianzaOCR: r.data.confidence, img, palabras: r.data.words || [], lienzo };
  }

  // ---------------------------------------------------------------- entender el texto
  const limpio = (s) => s.replace(/[|“”"’]/g, " ").replace(/[ \t]+/g, " ");

  function banco(t) {
    if (/WFCT|wells\s*fargo|clear access|everyday\s*checking|way2save|dinero enviado a|money sent to|all set!?|¡?listo!?\s*\n/i.test(t) && /inscrito como|enrolled as|wfct|confirmaci/i.test(t)) return "Wells Fargo";
    if (/navy\s*federal|\bNAV[0-9A-Z]{6,}|payment details/i.test(t)) return "Navy Federal";
    if (/truist|\bBBT\d{6,}/i.test(t)) return "Truist";
    if (/\bCOF[0-9A-Z]{6,}|capital\s*one|360\s*checking|enviaste\s*\$/i.test(t)) return "Capital One";
    if (/estamos enviando tu dinero|sending your money now|siri|lo recibir[aá] en unos minutos|get it in a few minutes/i.test(t)) return "Chase";
    if (/bank of america|merrill|imprimir o guardar|print or save|hora del este|eastern time|su pago fue enviado|payment is sent|pago a trav[eé]s de zelle|adv plus|advantage|safebalance/i.test(t)) return "Bank of America";
    if (/¡?listo!?|inscrito como|enrolled as/i.test(t)) return "Wells Fargo";
    return "Desconocido";
  }

  function numero(s) {
    const v = parseFloat(String(s).replace(/[^\d.]/g, ""));
    return isNaN(v) ? null : Math.round(v * 100) / 100;
  }

  function importe(t) {
    const etiqueta = /(cantidad|amount|monto)\s*:?\s*\$?\s*([\d.,]{1,12})/i.exec(t);
    if (etiqueta) { const v = numero(etiqueta[2].replace(/,(?=\d{3}\b)/g, "")); if (v) return v; }
    const todos = [...t.matchAll(/\$\s?(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?!\d)/g)]
      .map((m) => numero(m[1].replace(/[,\s](?=\d{3}\b)/g, "").replace(/,(\d{2})$/, ".$1"))).filter((v) => v && v < 100000);
    return todos.length ? todos[0] : null;
  }

  function fecha(t) {
    const m = /\b(ene|jan|feb|mar|abr|apr|may|jun|jul|ago|aug|sep|set|oct|nov|dic|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})/i.exec(t);
    if (m) return `${m[3]}-${String(MESES[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const n = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(t);
    if (n) return `${n[3]}-${n[1].padStart(2, "0")}-${n[2].padStart(2, "0")}`;
    if (/\b(today|hoy)\b/i.test(t)) return "hoy";
    return null;
  }

  const PALABRAS = /^(confirmaci[oó]n|confirmation|number|numero|número|nro|imprimir|guardar|detalles|informaci[oó]n|legal|hecho|done|estado|pagada|cantidad|amount|fecha|date|desde|from|listo|enrolled|inscrito)$/i;
  function confirmacion(t, b) {
    if (b === "Chase") return null;  // las capturas de Chase no traen número
    const pat = { "Wells Fargo": /\bWFCT[0-9A-Z]{6,10}\b/, "Capital One": /\bCOF[0-9A-Z]{6,12}\b/, "Truist": /\bBBT\d{6,12}\b/ };
    if (pat[b]) { const m = pat[b].exec(t); if (m) return m[0]; }
    if (b === "Navy Federal") {
      const m = /confirmation\s*#?\s*:?\s*(\d{6,14})/i.exec(t); if (m) return m[1];
    }
    // Bank of America y otros: el código está pegado a la etiqueta (antes o después, porque va en dos columnas)
    const re = /(n[uú]mero de|nro\.? de|c[oó]digo de)?\s*confirmaci[oó]n|confirmation(\s*(number|#))?/gi;
    let m;
    while ((m = re.exec(t))) {
      const ventana = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 60);
      const cands = ventana.split(/[\s:#.,;…—-]+/).filter((w) => /^[A-Za-z0-9]{7,16}$/.test(w) && !PALABRAS.test(w) && !/^\d{4}$/.test(w));
      const bofa = cands.find((w) => /^[a-z0-9O]{8,10}$/.test(w));  // los de Bank of America van en minúsculas
      const elegido = b === "Bank of America" ? bofa : (cands.find((w) => /\d/.test(w)) || cands[0]);
      if (elegido) return b === "Bank of America" ? elegido.replace(/O/g, "0").toLowerCase() : elegido;
    }
    return null;
  }

  function cuentaOrigen(t) {
    const pats = [/(?:desde|from|de la cuenta|de)\s*:?\s*([A-Za-z0-9 &;.,'-]{3,50}?)\s*(?:-|\.{2,}|…|x{2,})\s*(\d{4})\b/i,
                  /[ú u]ltimos\s*4[\s\S]{0,40}?(\d{4})\b/i, /x{3,}(\d{4})\b/i, /\.\.\.\s*(\d{4})\b/];
    for (const p of pats) {
      const m = p.exec(t);
      if (m) return m.length > 2 ? `${m[1].replace(/&reg;|®/g, "").trim()} ${m[2]}` : m[1];
    }
    return null;
  }

  function interpretar(textoCrudo) {
    const t = limpio(textoCrudo);
    const b = banco(t);
    const r = {
      banco: b,
      importe: importe(t),
      fecha: fecha(t),
      confirmacion: confirmacion(t, b),
      cuenta: cuentaOrigen(t),
      a_nuestra_cuenta: NUESTRA_CUENTA.test(t),
      remitente: (() => {
        const m = /\bhola,?[ \t]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+)(?:[ \t]+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+))?/i.exec(t);
        if (!m) return null;
        const bonito = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        return [m[1], m[2]].filter((w) => w && !/^(usted|you|te|le)$/i.test(w)).map(bonito).join(" ") || null;
      })(),
      avisos: [],
    };
    if (/pendiente|pending|programad|scheduled|cancelad|canceled|failed|fall[oó]/i.test(t)) r.avisos.push("El comprobante dice pendiente, programado o cancelado: revísalo.");
    if (!r.a_nuestra_cuenta) r.avisos.push("No se ve que el Zelle vaya a nuestra cuenta (LAPINET).");
    if (!r.importe) r.avisos.push("No se encontró el importe: escríbelo.");
    if (!r.fecha || r.fecha === "hoy") r.avisos.push(r.fecha === "hoy" ? "Dice «hoy»: se usa la fecha de la captura." : "La captura no trae fecha: se usa la de la captura; confírmala.");
    if (!r.confirmacion) r.avisos.push("Sin número de confirmación: se comprobará que no esté repetida por la imagen y el importe.");
    else if (b === "Bank of America" && /[0o1l]/i.test(r.confirmacion)) r.avisos.push("Revisa el número de confirmación: tiene letras que se confunden (0/o, 1/l).");
    return r;
  }

  async function leerComprobante(origen) {
    const primera = await leerTexto(origen);
    let { texto, oscura, confianzaOCR, img } = primera;
    let r = interpretar(texto);
    // si falta algo, se vuelve a leer de otra manera y se juntan los textos
    if (!r.importe) {
      const b = await leerTexto(img, { factor: 0.5, suelto: true });
      texto += "\n" + b.texto; r = interpretar(texto);
    }
    if (!r.confirmacion && r.banco !== "Chase") {
      const b = await leerTexto(img, { suelto: true });
      texto += "\n" + b.texto; r = interpretar(texto);
    }
    if (r.banco === "Bank of America" && !r.confirmacion) {  // solo si la lectura normal no lo encontró
      const c = await codigoBofA(primera);
      if (c) {
        r.confirmacion = c;
        r.avisos = r.avisos.filter((a) => !/confirmaci/.test(a));
        r.avisos.push("Número de confirmación leído con dificultad: compáralo con la captura.");
      }
    }
    return Object.assign(r, { texto, oscura, confianzaOCR });
  }

  // Bank of America: se vuelve a leer solo el renglón del código, ampliado y con solo minúsculas y números
  async function codigoBofA(primera) {
    const ws = primera.palabras;
    const et = ws.find((w) => /^confirmaci|^confirmation$/i.test(w.text)) || ws.find((w) => /^(n[uú]mero|nro\.?|number)$/i.test(w.text));
    if (!et) return null;
    const cv = primera.lienzo, h = et.bbox.y1 - et.bbox.y0;
    const y0 = Math.max(0, et.bbox.y0 - h * 1.4), y1 = Math.min(cv.height, et.bbox.y1 + h * 1.4);
    const x0 = Math.round(cv.width * 0.42), ancho = cv.width - x0, alto = y1 - y0;
    const c = document.createElement("canvas"); c.width = ancho * 3; c.height = alto * 3;
    const cx = c.getContext("2d"); cx.imageSmoothingQuality = "high";
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(cv, x0, y0, ancho, alto, 0, 0, c.width, c.height);
    const t = await motor();
    await t.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyz0123456789" });
    const r = await t.recognize(c);
    await t.setParameters({ tessedit_char_whitelist: "" });
    const cands = (r.data.text || "").split(/\s+/).filter((w) => /^[a-z0-9]{8,10}$/.test(w) && !PALABRAS.test(w)
      && !/^(confirmaci|number|numero)/.test(w) && !/(ene|jan|feb|mar|abr|apr|may|jun|jul|ago|aug|sep|oct|nov|dic|dec)\d/.test(w));
    return cands[0] || null;
  }

  global.LectorZelle = { leerComprobante, leerTexto, interpretar };
})(window);
