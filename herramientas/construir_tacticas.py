#!/usr/bin/env python3
"""Las tacticas de equipo y las supertacticas con su descripcion (NOTAS O-232).

    py herramientas\\construir_tacticas.py

Escribe `datos/reglas-extraidas/tacticas.csv`: id (como en la partida),
categoria (tactica / supertactica), nombre y descripcion en espanol.

De donde sale: `SPECIAL_TACTICS_INFO_LIST` (skill/special_tactics_config) y
`ITEM_SUPER_TACTICS_INFO_LIST` (item/item_config): la columna 2 es el id del
nombre (NOUN_INFO de los ficheros de texto) y la 3 el de la descripcion
(TEXT_INFO de item_text). Los ids van como en `nombres-es.csv`, con los
cuatro bytes al reves.
"""
import csv
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tacticas.csv")
FUENTES = [
    ("tactica", "gamedata/skill", "special_tactics_config_", "SPECIAL_TACTICS_INFO_LIST"),
    ("supertactica", "gamedata/item", "item_config_", "ITEM_SUPER_TACTICS_INFO_LIST"),
]
TEXTOS = ["item_text.cfg.bin", "skill_text.cfg.bin", "menu_text.cfg.bin", "soccer_common_text.cfg.bin"]


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return []
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    return None


def texto_de(celda):
    if celda.startswith('String("') and celda.endswith('")'):
        return celda[8:-2]
    return ""


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cargar_textos(idioma, tabla):
    """{id: texto} de esa tabla en todos los ficheros de texto del idioma."""
    fuera = {}
    for f in TEXTOS:
        ruta = os.path.join(COMUN, "text", idioma, f)
        if not os.path.isfile(ruta):
            continue
        for fila in volcar(ruta, tabla):
            ident = u32(fila[0]) if fila else None
            if ident is None:
                continue
            for celda in fila[1:]:
                t = texto_de(celda)
                if t:
                    fuera.setdefault(ident, t)
                    break
    return fuera


def limpio(t):
    # el texto llega con "\\n" escrito (barra y ene) y alguna barra suelta
    t = (t or "").replace("\\\\n", " ").replace("\\n", " ").replace("\n", " ").replace("\\", " ")
    return " ".join(t.split())


def main():
    nombres = cargar_textos("es", "NOUN_INFO")
    descripciones = cargar_textos("es", "TEXT_INFO")
    filas, sin = [], 0
    for categoria, subdir, prefijo, tabla in FUENTES:
        ruta = unico(os.path.join(COMUN, subdir), prefijo)
        for c in volcar(ruta, tabla):
            if len(c) < 4 or u32(c[0]) is None or len(c) == 2:
                continue
            ident = u32(c[0])
            if not ident:
                continue
            en_partida = bytes.fromhex("%08X" % ident)[::-1].hex().upper()
            nombre = limpio(nombres.get(u32(c[2]), ""))
            desc = limpio(descripciones.get(u32(c[3]), ""))
            if not nombre:
                continue
            if not desc:
                sin += 1
            filas.append([en_partida, categoria, nombre, desc])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Tacticas de equipo y supertacticas con su descripcion (NOTAS O-232).\n"
                 "# Lo genera herramientas/construir_tacticas.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "categoria", "nombre", "descripcion"])
        w.writerows(filas)
    print("Escritas %d tacticas en %s (%d sin descripcion)" % (len(filas), SALIDA, sin))
    for f in filas[:3] + filas[-3:]:
        print("  ", f[0], f[1], f[2], "|", f[3][:70])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
