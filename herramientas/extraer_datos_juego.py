#!/usr/bin/env python3
"""Extrae de los archivos del juego solo los ficheros de datos que interesan.

    py herramientas\\extraer_datos_juego.py

Por que por tandas: el juego ocupa 61 GB comprimidos y al abrirlo entero pasaria
de 200 GB, que no caben. Asi que se abre un grupo de archivos, se guarda lo que
encaja con los patrones, se borra el resto, y se pasa al siguiente grupo. El pico
de disco nunca supera el tamano de una tanda.

El indice del juego (`cpk_list.cfg.bin`) no se usa: esta version de la
herramienta no sabe leerlo (ver NOTAS O-36). Se abren los archivos a ciegas.
"""
import os
import re
import shutil
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JUEGO = r"F:\steam\steamapps\common\INAZUMA ELEVEN Victory Road\data\packs"
TRABAJO = os.path.join(RAIZ, "datos", "juego")
EXTRACTOR = os.path.join(TRABAJO, "tools", "ievr_toolbox-win64.exe")
STAGING = os.path.join(TRABAJO, "staging")
SCRATCH = os.path.join(TRABAJO, "scratch")
GUARDADO = os.path.join(TRABAJO, "extracted")

# Que nos interesa. Mismos patrones que usa el dataminer, mas los textos.
PATRONES = [
    # Todo lo que sea una tabla de configuracion. Son ficheros pequenos y es
    # preferible tenerlos todos a tener que volver a extraer cada vez que hace
    # falta uno nuevo.
    r".*\.cfg\.bin$",
]
RE = [re.compile(p, re.I) for p in PATRONES]

TANDA_BYTES = 3 * 1024 ** 3   # cuanto .cpk se abre de una vez


def interesa(nombre):
    return any(r.match(nombre) for r in RE)


def limpiar(d):
    shutil.rmtree(d, ignore_errors=True)


def rescatar(origen, destino):
    """Copia a `destino` lo que encaje, CONSERVANDO LA RUTA de dentro del juego.

    La ruta importa: el mismo fichero (`chara_text.cfg.bin`, por ejemplo) existe
    una vez por idioma, en carpetas distintas. Aplanarlo los pisaria unos a otros.
    Ademas el dataminer busca en rutas concretas (`data/common/gamedata/...`).
    """
    n = 0
    for raiz, _, ficheros in os.walk(origen):
        for f in ficheros:
            if not interesa(f):
                continue
            rel = os.path.relpath(os.path.join(raiz, f), origen)
            fin = os.path.join(destino, rel)
            os.makedirs(os.path.dirname(fin), exist_ok=True)
            shutil.copyfile(os.path.join(raiz, f), fin)
            n += 1
    return n


def main():
    if not os.path.isfile(EXTRACTOR):
        raise SystemExit("no encuentro el extractor en %s" % EXTRACTOR)
    archivos = sorted(
        ((os.path.getsize(os.path.join(JUEGO, f)), f)
         for f in os.listdir(JUEGO) if f.lower().endswith(".cpk")))
    print("%d archivos, %.1f GB en total" % (len(archivos), sum(s for s, _ in archivos) / 1e9))

    os.makedirs(GUARDADO, exist_ok=True)
    total, tanda, acum = 0, [], 0

    def procesar(tanda, idx):
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
        print("tanda %d: %d archivos -> %d ficheros utiles (total %d)"
              % (idx, len(tanda), n, total), flush=True)
        limpiar(SCRATCH)
        limpiar(STAGING)

    idx = 0
    for tam, f in archivos:
        tanda.append((tam, f))
        acum += tam
        if acum >= TANDA_BYTES:
            idx += 1
            procesar(tanda, idx)
            tanda, acum = [], 0
    idx += 1
    procesar(tanda, idx)

    print("\nTerminado. %d ficheros de datos en %s" % (total, GUARDADO))
    for raiz, _, fs in os.walk(GUARDADO):
        for f in sorted(fs):
            print("   %s" % os.path.relpath(os.path.join(raiz, f), GUARDADO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
