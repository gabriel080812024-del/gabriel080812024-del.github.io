"""Arma la app del iPad a partir del programa de la Mac (mi-contabilidad).

Uso:  python3 construir.py
Crea _ipad/programa.zip (el programa + sus librerías) y pone la versión nueva en sw.js e index.html,
para que el iPad la descargue sola la próxima vez que se abra con internet.
"""
import hashlib
import io
import re
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PROGRAMA = AQUI.parent / "mi-contabilidad"
RUEDAS = AQUI / "vendor_whl"
SALIDA = AQUI / "_ipad" / "programa.zip"
FUERA = {"iniciar.py", "restablecer_contrasena.py"}  # cosas solo de la Mac

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(PROGRAMA.glob("*.py")):
        if p.name not in FUERA:
            z.write(p, p.name)
    for carpeta in ("templates", "static"):
        for p in sorted((PROGRAMA / carpeta).rglob("*")):
            if p.is_file() and not p.name.startswith("."):
                z.write(p, str(p.relative_to(PROGRAMA)))
    z.write(AQUI / "puente.py", "puente.py")
    for rueda in sorted(RUEDAS.glob("*.whl")):  # librerías puras: se desempacan en lib/
        with zipfile.ZipFile(rueda) as w:
            for n in w.namelist():
                if ".dist-info/" in n and not n.endswith("METADATA"):
                    continue
                z.writestr("lib/" + n, w.read(n))
datos = buf.getvalue()
SALIDA.write_bytes(datos)

# versión = huella del contenido (programa + página + intermediario)
h = hashlib.sha256(datos)
for f in ("index.html", "_ipad/arranque.js"):
    h.update((AQUI / f).read_bytes())
version = h.hexdigest()[:10]
sw = AQUI / "sw.js"
sw.write_text(re.sub(r'const VERSION = "[^"]*"', f'const VERSION = "{version}"', sw.read_text()))
(AQUI / "_ipad" / "version.js").write_text(f'window.VERSION_APP = "{version}";\n')
print(f"programa.zip: {len(datos) / 1e6:.1f} MB · versión {version}")
