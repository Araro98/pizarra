#!/usr/bin/env python3
"""Con que fichero de cara se dibuja cada personaje.

    py herramientas\\construir_caras.py

Deja `datos/reglas-extraidas/caras.csv`.

La cara de un personaje es `10_icon_chr/face/<string_id>_l.png`, y el `string_id`
esta en la **columna 1 de `chara_base`**. Hasta ahora se sacaba de
`jugadores.csv`, que solo trae los personajes **alineables**; por eso el avatar de
Aaron (Destin Billows), que va de entrenador y no tiene arbol de tecnicas, salia
sin foto aunque su imagen existe (NOTAS O-99).

Esta tabla cubre a **todos** los personajes, jueguen o no.
"""
import csv
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
CARAS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon",
                     "10_icon_chr", "face")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "caras.csv")


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cadena(celda):
    m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
    return m.group(1) if m else ""


def filas(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def main():
    base = {}
    for c in filas(os.path.join(TABLAS, "CHARA_BASE_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > 1:
            base[v] = cadena(c[1])

    hay = set()
    if os.path.isdir(CARAS):
        hay = {f[:-6] for f in os.listdir(CARAS) if f.endswith("_l.png")}
    print("caras extraidas: %d" % len(hay))

    salida, con, sin = [], 0, 0
    for c in filas(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is None or len(c) < 20:
            continue
        sid = base.get(entero(c[1]), "")
        if not sid:
            sin += 1
            continue
        tiene = sid in hay if hay else False
        con += tiene
        salida.append(["%08X" % v, sid, "si" if tiene else "no"])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Con que fichero se dibuja la cara de cada personaje.\n"
                 "# cara = 10_icon_chr/face/<cara>_l.png\n"
                 "# Lo genera herramientas/construir_caras.py (NOTAS O-99).\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "cara", "existe"])
        w.writerows(sorted(salida))
    print("Escritos %d personajes, %d con imagen (sin string_id: %d)"
          % (len(salida), con, sin))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
