#!/usr/bin/env python3
"""Saca de los archivos del juego los iconos de personaje, y los deja en PNG.

    py herramientas\\extraer_iconos.py

Aaron quiere ver la cara de cada jugador en la interfaz, para reconocerlos sin
saberse el nombre. Las imagenes estan en los archivos del propio juego, asi que
no hace falta bajarlas de ninguna pagina.

**Como es un `.g4tx`:** una cabecera con el nombre de la textura y, pegado
detras, un **fichero DDS normal y corriente**. Empieza justo en
`tamano_del_fichero - el numero de 4 bytes que hay en 0x2C`, y eso cuadra en las
892 texturas con las que se comprobo. Dentro es BC7, que Pillow sabe abrir.

**Por que por tandas:** el juego son 61 GB en 936 archivos y el indice
(`cpk_list.cfg.bin`) no se puede leer con esta version de la herramienta (NOTAS
O-36), asi que hay que abrirlos a ciegas. Se abre un grupo, se rescata lo que
interesa, se borra el resto y se pasa al siguiente. El pico de disco nunca pasa
del tamano de una tanda.
"""
import io
import os
import re
import shutil
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JUEGO = r"F:\steam\steamapps\common\INAZUMA ELEVEN Victory Road\data\packs"
TRABAJO = os.path.join(RAIZ, "datos", "juego")
EXTRACTOR = os.path.join(TRABAJO, "tools", "ievr_toolbox-win64.exe")
STAGING = os.path.join(TRABAJO, "staging_iconos")
SCRATCH = os.path.join(TRABAJO, "scratch_iconos")
GUARDADO = os.path.join(RAIZ, "datos", "iconos")

# Se filtra por RUTA, no por nombre: el nombre de fichero de un icono no dice
# nada, pero la carpeta si. Todo lo de menu/200_icon son iconos de menu
# (personajes, objetos, tecnicas), que es justo lo que hara falta en la interfaz.
RUTA_QUE_INTERESA = re.compile(r"menu[\\/]200_icon[\\/]", re.I)

# Se puede pasar otro patron por la linea de ordenes para buscar en otro sitio.
# Por ejemplo, para traerse todo el menu y no solo los iconos:
#     py herramientas\extraer_iconos.py "menu[\\/]"
if len(sys.argv) > 1:
    RUTA_QUE_INTERESA = re.compile(sys.argv[1], re.I)

TANDA_BYTES = 3 * 1024 ** 3


def limpiar(d):
    shutil.rmtree(d, ignore_errors=True)


def dds_de(datos):
    """El DDS que lleva dentro un .g4tx, o None si no tiene la pinta esperada."""
    if len(datos) < 0x30 or datos[:4] != b"G4TX":
        return None
    tam = struct.unpack_from("<I", datos, 0x2C)[0]
    if not 0 < tam <= len(datos):
        return None
    trozo = datos[len(datos) - tam:]
    return trozo if trozo[:4] == b"DDS " else None


def a_png(origen, destino):
    """Convierte un .g4tx a PNG. Devuelve True si salio."""
    from PIL import Image
    datos = open(origen, "rb").read()
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


def rescatar(origen, destino):
    """Convierte a PNG lo que caiga en las carpetas que interesan.

    Se guarda con la MISMA ruta que dentro del juego. La ruta es lo que dice de
    que es cada icono, y aplanarla los haria indistinguibles.
    """
    n = 0
    for raiz, _, ficheros in os.walk(origen):
        if not RUTA_QUE_INTERESA.search(raiz):
            continue
        for f in ficheros:
            if not f.lower().endswith(".g4tx"):
                continue
            rel = os.path.relpath(os.path.join(raiz, f), origen)
            fin = os.path.join(destino, os.path.splitext(rel)[0] + ".png")
            if os.path.isfile(fin):
                continue
            if a_png(os.path.join(raiz, f), fin):
                n += 1
    return n


def main():
    if not os.path.isfile(EXTRACTOR):
        raise SystemExit("no encuentro el extractor en %s" % EXTRACTOR)
    if not os.path.isdir(JUEGO):
        raise SystemExit("no encuentro los archivos del juego en %s" % JUEGO)
    try:
        import PIL
        del PIL          # solo se comprueba que este instalado
    except ImportError:
        raise SystemExit("falta Pillow. Instalalo con:  py -m pip install Pillow")

    archivos = sorted((os.path.getsize(os.path.join(JUEGO, f)), f)
                      for f in os.listdir(JUEGO) if f.lower().endswith(".cpk"))
    print("%d archivos, %.1f GB en total" % (len(archivos), sum(s for s, _ in archivos) / 1e9))
    os.makedirs(GUARDADO, exist_ok=True)
    total = 0

    def procesar(tanda, idx, cuantas):
        nonlocal total
        if not tanda:
            return
        packs = os.path.join(STAGING, "data", "packs")
        limpiar(STAGING)
        limpiar(SCRATCH)
        os.makedirs(packs)
        for _, f in tanda:
            shutil.copyfile(os.path.join(JUEGO, f), os.path.join(packs, f))
        r = subprocess.run([EXTRACTOR, "dump", "-i", STAGING, "-o", SCRATCH],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("   aviso: el extractor devolvio %d" % r.returncode)
        n = rescatar(SCRATCH, GUARDADO)
        total += n
        print("tanda %d de %d: %d archivos -> %d iconos nuevos (total %d)"
              % (idx, cuantas, len(tanda), n, total), flush=True)
        limpiar(SCRATCH)
        limpiar(STAGING)

    tandas, tanda, acum = [], [], 0
    for tam, f in archivos:
        tanda.append((tam, f))
        acum += tam
        if acum >= TANDA_BYTES:
            tandas.append(tanda)
            tanda, acum = [], 0
    if tanda:
        tandas.append(tanda)

    for i, t in enumerate(tandas, 1):
        procesar(t, i, len(tandas))

    limpiar(STAGING)
    limpiar(SCRATCH)
    print("\nTerminado. %d iconos en %s" % (total, GUARDADO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
