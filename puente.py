"""Puente entre la app del iPad (JavaScript) y el programa de siempre (Flask), sin servidor ni internet.

Cada pedido de la pantalla (abrir una página, guardar un formulario) llega aquí y se le pasa al programa
como si viniera de un navegador normal. La copia descifrada de los datos vive solo en la memoria
(/memoria); en el almacenamiento del iPad (/datos) solo se guarda lo cifrado.
"""
import importlib
import os
import sys
import time

import hashlib  # noqa: E402

importlib.reload(hashlib)  # para que use OpenSSL (pbkdf2, scrypt), que se carga aparte en el iPad

os.environ.update({"MC_DATOS": "/datos/d", "MC_COPIAS": "/datos/c", "MC_IPAD": "1",
                   "MC_DB_PLANO": "/memoria/contabilidad.db"})
for d in ("/datos/d", "/datos/c", "/memoria"):
    os.makedirs(d, exist_ok=True)
sys.path[:0] = ["/programa", "/programa/lib"]

import app as A  # noqa: E402
import boveda  # noqa: E402
import db  # noqa: E402

if boveda.estado() != "bloqueada":
    db.iniciar()
cliente = A.app.test_client()
GUARDAR_CADA = 300
_ultimo_guardado = [time.monotonic()]


def atender(metodo, ruta, cuerpo, tipo):
    """Devuelve (estado, cabeceras, contenido) para un pedido de la pantalla."""
    datos = bytes(cuerpo.to_py()) if cuerpo is not None else None
    r = cliente.open(ruta, method=metodo, data=datos, content_type=tipo or None,
                     headers={"Host": "localhost"}, follow_redirects=False)
    cab = [[k, v] for k, v in r.headers.items() if k.lower() not in ("set-cookie", "content-length")]
    contenido = r.get_data()
    r.close()
    return [r.status_code, cab, contenido]


def guardar():
    """Cifra lo anotado y lo deja listo para guardarse en el iPad."""
    if boveda.abierta():
        boveda.guardar()
        _ultimo_guardado[0] = time.monotonic()
        return True
    return False


def vigilar():
    """Cada medio minuto: 1 hora sin uso cierra la sesión y cifra; si no, guarda cada 5 minutos.
    Devuelve True si hay que guardar en el iPad."""
    if not boveda.abierta():
        return False
    ahora = time.monotonic()
    if ahora - boveda.ULTIMO_USO[0] > A.INACTIVIDAD:
        A.ACTIVAS.clear()
        boveda.cerrar()
        return True
    if ahora - _ultimo_guardado[0] > GUARDAR_CADA:
        return guardar()
    return False
