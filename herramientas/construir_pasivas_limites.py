#!/usr/bin/env python3
"""El tope de cada pasiva de equipo, sacado del juego (NOTAS O-186).

    py herramientas\\construir_pasivas_limites.py

Escribe `datos/reglas-extraidas/pasivas-limites.csv`: el tipo de efecto, el
tope y un texto de ejemplo para poder leerlo.

**Donde estaba.** En `soccer/passive_skill_effect_config` hay 80 efectos de
pasiva. Cada uno lleva su bloque `EFFECT_DATA_LIST`, y ahi, en una fila de tres
numeros `(algo, indice, TOPE)`, el tercero es el tope de la suma del equipo. 40
lo tienen y los otros 40 lo llevan a cero, que es "sin tope" (las de "AT de
tiro para jugadores del mismo elemento" y demas de las ranuras 1-2, que en el
juego se pueden sumar sin limite).

El enlace con la pasiva es la columna `tipo_efecto` de `pasivas-valor.csv`,
**leida tal cual** (no con los bytes al reves como el resto de ids de la
partida): `8A52A068` es el efecto `2320670824`. Casan 1.700 de las 1.716
pasivas del juego.

El fichero se lee con `volcado --json`, que hizo falta anadir (O-184) porque
este fichero repite el mismo nombre de tabla cientos de veces.
"""
import csv
import glob
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-limites.csv")


def limpio(t):
    return " ".join(re.sub(r"\[.*?\]", "", (t or "")).replace("\\n", " ").split())


def valores(v):
    return [list(x.values())[0] for x in v]


def efectos_con_tope():
    """{id de efecto: tope}. Tope 0 = sin tope."""
    fichero = sorted(glob.glob(os.path.join(
        GAMEDATA, "soccer", "passive_skill_effect_config_*.cfg.bin")))
    if not fichero:
        raise SystemExit("no encuentro soccer/passive_skill_effect_config")
    r = subprocess.run([VOLCADO, fichero[0], "--json"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo")
    d = json.loads(r.stdout)
    fuera, act, tabla = {}, None, None
    for t in d["tables"]:
        tabla = t["name"]
        for fila in t["rows"]:
            vs = [valores(v) for v in fila["values"]]
            plano = [x for g in vs for x in g]
            # la ficha de un efecto: (id, indice, indice, indice)
            if (len(vs) == 4 and len(plano) == 4 and isinstance(plano[0], int)
                    and abs(plano[0]) > 100000):
                act = plano[0] & 0xFFFFFFFF
                fuera.setdefault(act, 0)
                continue
            if act is None or not tabla.endswith("EFFECT_DATA_LIST"):
                continue
            # (algo, indice, TOPE)
            if len(plano) == 3 and isinstance(plano[2], int) and not fuera.get(act):
                fuera[act] = plano[2]
    return fuera


def main():
    topes = efectos_con_tope()
    val = reglas._tabla("pasivas-valor.csv")
    filas, vistos = [], {}
    for f in val:
        te = (f.get("tipo_efecto") or "").strip()
        if not te:
            continue
        try:
            efecto = int(te, 16)
        except ValueError:
            continue
        tope = topes.get(efecto)
        if not tope:
            continue
        if te in vistos:
            continue
        vistos[te] = True
        filas.append([te, tope, limpio(f.get("texto"))])
    filas.sort(key=lambda x: (-int(x[1]), x[2].lower()))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# El tope de la suma de cada pasiva de equipo (NOTAS O-186), del propio\n"
                 "# juego: soccer/passive_skill_effect_config. Lo que se pase del tope no\n"
                 "# cuenta en el partido. `tipo_efecto` es la columna del mismo nombre de\n"
                 "# pasivas-valor.csv, leida tal cual.\n"
                 "# Lo genera herramientas/construir_pasivas_limites.py.\n")
        w = csv.writer(fh)
        w.writerow(["tipo_efecto", "limite", "ejemplo"])
        w.writerows(filas)
    con = sum(1 for v in topes.values() if v)
    print("Escritos %d topes en %s (%d efectos con tope de %d)"
          % (len(filas), SALIDA, con, len(topes)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
