#!/usr/bin/env python3
"""Con que imagen se dibuja cada espiritu (kenshin, alma, armadura, mixi).

    py herramientas\\construir_espiritus.py

Deja `datos/reglas-extraidas/espiritus.csv`.

**Como se encontro** (NOTAS O-102). En `aura_skill_config`, la tabla
`AURA_CMD_INFO_LIST` tiene una columna que dice de que **familia** es cada
espiritu, y con eso cuadran las carpetas de iconos:

| columna 10 | modelo | familia | carpeta | cuantos |
|---|---|---|---|---|
| 0 | `wk*` | kenshin | `aura_fs` | 99 contra 98 imagenes |
| 1 | `wa*` | armadura | `aura_armed` | 189 contra 178 |
| 2 | `wmm` | mixi | (la cara del personaje) | 69 |
| 3 | `ws*` | alma | `aura_soul` | **56 contra 56** |

Y el nombre del fichero sale de dos sitios distintos segun la familia:

- kenshin y alma: del **numero del modelo**. `wsd000040` -> `a000040_l.png`.
  Las 56 almas cuadran exactas y 95 de los 99 kenshin.
- armadura y mixi: de **quien la lleva**. La columna 13 es la identidad de un
  personaje, y su modelo (`c04003240_5100`) es ya el nombre del fichero, igual
  que para las caras. La carpeta `aura_mixi` resulta no tener la imagen de cada
  mixi, asi que para esos se ensena la **cara del personaje** con el que se
  hace, que es lo que el juego ensena tambien.

La columna 8 es el **rango** del espiritu, de 1 a 5.
"""
import csv
import glob
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
CHR = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon",
                   "10_icon_chr")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "espiritus.csv")

COL_MODELO, COL_RANGO, COL_FAMILIA, COL_PERSONAJE = 1, 8, 10, 13
FAMILIAS = {"0": ("kenshin", "aura_fs", "k"), "1": ("armadura", "aura_armed", ""),
            "2": ("mixi", "aura_mixi", ""), "3": ("alma", "aura_soul", "a")}


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cadena(celda):
    m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
    return m.group(1) if m else ""


def filas_tsv(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def main():
    aura = sorted(glob.glob(os.path.join(GAMEDATA, "skill", "aura_skill_config_*.cfg.bin")))
    if not aura:
        raise SystemExit("no encuentro aura_skill_config")
    r = subprocess.run([VOLCADO, aura[0], "AURA_CMD_INFO_LIST"], capture_output=True,
                       text=True, encoding="utf-8", errors="replace")

    # la cadena del modelo de cada personaje, para los espiritus de armadura
    base = {}
    for c in filas_tsv(os.path.join(TABLAS, "CHARA_BASE_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > 1:
            base[v] = cadena(c[1])
    de_personaje = {}
    for c in filas_tsv(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > 1:
            de_personaje[v] = base.get(entero(c[1]), "")

    hay = {}
    for carpeta in set(f[1] for f in FAMILIAS.values()) | {"face"}:
        d = os.path.join(CHR, carpeta)
        hay[carpeta] = set(os.listdir(d)) if os.path.isdir(d) else set()

    filas, con, sin = [], 0, 0
    for l in r.stdout.splitlines():
        c = l.split("\t")
        if len(c) <= COL_PERSONAJE:
            continue
        v = entero(c[0])
        modelo = cadena(c[COL_MODELO])
        if v is None or not modelo:
            continue
        familia, carpeta, letra = FAMILIAS.get(c[COL_FAMILIA], ("especial", "", ""))
        fichero = ""
        if familia in ("kenshin", "alma"):
            num = re.search(r"(\d+)", modelo)
            if num:
                fichero = "%s%06d_l.png" % (letra, int(num.group(1)))
        elif familia == "mixi":
            # la carpeta `aura_mixi` no tiene la imagen de cada mixi; lo que si
            # se sabe es CON QUIEN se hace, asi que se ensena su cara.
            modelo_pj = de_personaje.get(entero(c[COL_PERSONAJE]), "")
            if modelo_pj:
                carpeta, fichero = "face", "%s_l.png" % modelo_pj
        elif familia == "armadura":
            modelo_pj = de_personaje.get(entero(c[COL_PERSONAJE]), "")
            if modelo_pj:
                # el identificador del personaje ya trae dentro el sufijo
                # del traje ("c04003240_5100"), asi que la imagen es
                # directamente ese nombre, igual que las caras.
                fichero = "%s_l.png" % modelo_pj
        existe = bool(fichero) and fichero in hay.get(carpeta, ())
        con += existe
        sin += not existe
        # el id tal y como aparece en la partida: los cuatro bytes al reves
        en_partida = bytes.fromhex("%08X" % v)[::-1].hex().upper()
        try:
            rango = int(c[COL_RANGO])
        except ValueError:
            rango = 0
        filas.append([en_partida, familia, rango,
                      (carpeta + "/" + fichero) if existe else "", modelo])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Con que imagen se dibuja cada espiritu.\n"
                 "# id = los 4 bytes tal y como aparecen en la partida.\n"
                 "# icono = ruta dentro de 200_icon/10_icon_chr (vacio = no hay).\n"
                 "# Lo genera herramientas/construir_espiritus.py (NOTAS O-102).\n")
        w = csv.writer(fh)
        w.writerow(["id", "familia", "rango", "icono", "modelo"])
        w.writerows(sorted(filas))
    print("Escritos %d espiritus: %d con imagen, %d sin" % (len(filas), con, sin))
    porfam = {}
    for f in filas:
        d = porfam.setdefault(f[1], [0, 0])
        d[0] += 1
        d[1] += bool(f[3])
    for k in sorted(porfam):
        print("   %-10s %d, con imagen %d" % (k, porfam[k][0], porfam[k][1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
