#!/usr/bin/env python3
"""Hace el INDICE COMPLETO de todo lo que hay dentro de los archivos del juego.

    py herramientas\\listar_archivos.py

Deja dos cosas:

- `datos/juego/listado.txt` — la ruta de **todos** los ficheros del juego, uno
  por linea. Son unos cuantos cientos de miles.
- `datos/iconos/...` — ademas, de paso, convierte a PNG las texturas cuyo
  nombre encaje con `RESCATAR`, respetando su ruta.

**Por que hace falta** (NOTAS O-95): el arte de cada objeto no esta en
`menu/200_icon`, que era donde se habia mirado. Y buscar a ciegas carpeta por
carpeta sale carisimo, porque cada intento vuelve a abrir los 61 GB. Con el
indice hecho una vez, cualquier busqueda futura es un `grep` de un segundo.

El indice no se puede sacar del `.cpk` directamente porque los paquetes vienen
cifrados; hay que pasarlos por la herramienta del juego igual que para extraer.
Por eso se hace por tandas de 3 GB, como en `extraer_iconos.py`: se abre un
grupo, se apunta lo que hay, se borra y se pasa al siguiente. El disco nunca
sube mas de una tanda.
"""
import io
import os
import re
import shutil
import struct
import subprocess
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
# la carpeta del juego en ESTE ordenador (registro de Steam o IEVR_JUEGO), sin
# rutas de nadie escritas (NOTAS O-201)
from ievr import rutas as _rutas  # noqa: E402
JUEGO = _rutas.carpeta_del_juego() or r"C:\Program Files (x86)\Steam\steamapps\common\INAZUMA ELEVEN Victory Road\data\packs"
TRABAJO = os.path.join(RAIZ, "datos", "juego")
EXTRACTOR = os.path.join(TRABAJO, "tools", "ievr_toolbox-win64.exe")
STAGING = os.path.join(TRABAJO, "staging_listado")
SCRATCH = os.path.join(TRABAJO, "scratch_listado")
GUARDADO = os.path.join(RAIZ, "datos", "iconos")
LISTADO = os.path.join(TRABAJO, "listado.txt")

# Los nombres de fichero de la equipacion salen en las tablas de objetos
# (`eq_sh110001` y compania), asi que si el arte existe tiene que llamarse asi.
# Se rescata tambien lo que huela a espiritu (`aura`) y a objeto de batalla.
RESCATAR = re.compile(r"(eq_(sh|mi|ac|sp)\d|btl_re\d|aura|kenshin|soul)", re.I)

TANDA_BYTES = 3 * 1024 ** 3


def limpiar(d):
    shutil.rmtree(d, ignore_errors=True)


def dds_de(datos):
    if len(datos) < 0x30 or datos[:4] != b"G4TX":
        return None
    tam = struct.unpack_from("<I", datos, 0x2C)[0]
    if not 0 < tam <= len(datos):
        return None
    trozo = datos[len(datos) - tam:]
    return trozo if trozo[:4] == b"DDS " else None


def a_png(origen, destino):
    from PIL import Image
    try:
        datos = open(origen, "rb").read()
    except OSError:
        return False
    dds = dds_de(datos)
    if dds is None:
        return False
    try:
        imagen = Image.open(io.BytesIO(dds))
        imagen.load()
    except Exception:
        return False
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    imagen.save(destino, "PNG", optimize=True)
    return True


def main():
    if not os.path.isfile(EXTRACTOR):
        raise SystemExit("no encuentro el extractor en %s" % EXTRACTOR)
    if not os.path.isdir(JUEGO):
        raise SystemExit("no encuentro los archivos del juego en %s" % JUEGO)

    archivos = sorted((os.path.getsize(os.path.join(JUEGO, f)), f)
                      for f in os.listdir(JUEGO) if f.lower().endswith(".cpk"))
    print("%d paquetes, %.1f GB" % (len(archivos), sum(s for s, _ in archivos) / 1e9),
          flush=True)

    tandas, tanda, acum = [], [], 0
    for tam, f in archivos:
        tanda.append((tam, f))
        acum += tam
        if acum >= TANDA_BYTES:
            tandas.append(tanda)
            tanda, acum = [], 0
    if tanda:
        tandas.append(tanda)

    total_rutas = total_png = 0
    arranque = time.time()
    with open(LISTADO, "w", encoding="utf-8", errors="replace") as indice:
        for i, t in enumerate(tandas, 1):
            packs = os.path.join(STAGING, "data", "packs")
            limpiar(STAGING)
            limpiar(SCRATCH)
            os.makedirs(packs)
            for _, f in t:
                shutil.copyfile(os.path.join(JUEGO, f), os.path.join(packs, f))
            r = subprocess.run([EXTRACTOR, "dump", "-i", STAGING, "-o", SCRATCH],
                               capture_output=True, text=True)
            if r.returncode != 0:
                print("   aviso: el extractor devolvio %d" % r.returncode, flush=True)
            rutas = png = 0
            for raiz, _, ficheros in os.walk(SCRATCH):
                rel_dir = os.path.relpath(raiz, SCRATCH).replace("\\", "/")
                for f in ficheros:
                    rel = f if rel_dir == "." else rel_dir + "/" + f
                    indice.write(rel + "\n")
                    rutas += 1
                    if f.lower().endswith(".g4tx") and RESCATAR.search(rel):
                        fin = os.path.join(GUARDADO, os.path.splitext(rel)[0] + ".png")
                        if not os.path.isfile(fin) and a_png(os.path.join(raiz, f), fin):
                            png += 1
            indice.flush()
            total_rutas += rutas
            total_png += png
            print("tanda %d/%d: %d ficheros, %d rutas apuntadas, %d png nuevos "
                  "(total %d rutas, %d png, %.0f min)"
                  % (i, len(tandas), len(t), rutas, png, total_rutas, total_png,
                     (time.time() - arranque) / 60), flush=True)
            limpiar(SCRATCH)
            limpiar(STAGING)

    limpiar(STAGING)
    limpiar(SCRATCH)
    print("\nTerminado. %d rutas en %s" % (total_rutas, LISTADO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
