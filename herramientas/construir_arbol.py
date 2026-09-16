#!/usr/bin/env python3
"""Saca del juego que stats sube el arbol de habilidades segun la posicion.

    py herramientas\\construir_arbol.py

Escribe `datos/reglas-extraidas/arbol-stats.csv`.

**Lo que se descubrio** (NOTAS O-140): las casillas de "+3 Potencia" del arbol
no las decide el tablero de cada personaje, sino **su posicion**. En
`skill/ability_learning_config` hay dos tablas:

- `ABILITY_LEARNING_MAIN_PARAM_UP_TABLE` — por **posicion principal**, cuatro
  pasivas de stat (`ps2FFTT`, F = stat, TT = nivel);
- `ABILITY_LEARNING_SUB_PARAM_UP_TABLE` — lo mismo por **posicion secundaria**.

El tronco y la rama 1 usan la lista de la posicion principal; la rama 2 la de la
secundaria. Comprobado casilla por casilla con los arboles de Alex Zabel (DEL,
alt MED) y Mark Evans (POR, alt DEL) que Aaron mando en capturas.

Las tablas van como (clave, desplazamiento, cuantas) apuntando a una lista de
datos, que es como el juego guarda todas las listas anidadas.
"""
import csv
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
SKILL = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata", "skill")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "arbol-stats.csv")

# ps2FFTT: la F es el stat, en el orden del propio juego (NOTAS O-110)
STAT_DE_FAMILIA = {0: "Potencia", 1: "Control", 2: "Tecnica", 3: "Presion",
                   4: "Fisico", 5: "Inteligencia", 6: "Agilidad"}
POSICION = {0: "ninguna", 1: "POR", 2: "DEL", 3: "MED", 4: "DEF"}


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s" % tabla)
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def entero(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def indice(lineas):
    """Las tablas INFO salen como lineas alternas: [clave] y [desplazamiento, cuantas]."""
    fuera = []
    k = 0
    while k + 1 < len(lineas):
        if len(lineas[k]) == 1 and len(lineas[k + 1]) == 2:
            fuera.append((entero(lineas[k][0]), entero(lineas[k + 1][0]),
                          entero(lineas[k + 1][1])))
            k += 2
        else:
            k += 1
    return fuera


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    abl = unico(SKILL, "ability_learning_config_")
    pasivas = {}
    for c in volcar(unico(SKILL, "passive_skill_config_"), "PASSIVE_SKILL_INFO_LIST"):
        if len(c) >= 7 and c[6].startswith('String("'):
            ident = entero(c[0])
            if ident is not None:
                pasivas[ident & 0xFFFFFFFF] = c[6][8:-2]

    def stat_de(valor):
        nombre = pasivas.get((entero(valor) or 0) & 0xFFFFFFFF, "")
        if not nombre.startswith("ps2") or len(nombre) < 7:
            return ""
        return STAT_DE_FAMILIA.get(int(nombre[4]), "")

    filas = []
    for lista, info, datos in (("principal", "ABILITY_LEARNING_MAIN_PARAM_UP_TABLE_INFO_LIST",
                                "ABILITY_LEARNING_MAIN_PARAM_UP_TABLE_DATA_LIST"),
                               ("secundaria", "ABILITY_LEARNING_SUB_PARAM_UP_TABLE_INFO_LIST",
                                "ABILITY_LEARNING_SUB_PARAM_UP_TABLE_DATA_LIST")):
        d = [c for c in volcar(abl, datos) if len(c) >= 4]
        for clave, desde, cuantas in indice(volcar(abl, info)):
            if clave is None or desde is None or desde >= len(d):
                continue
            stats = [stat_de(v) for v in d[desde][:4]]
            filas.append([lista, clave, POSICION.get(clave, "?")] + stats)
            print("  %-10s %d %-7s -> %s" % (lista, clave, POSICION.get(clave, "?"), stats))

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que stats suben las casillas del arbol, segun la posicion del personaje.\n"
                 "# lista = principal (tronco y rama 1) o secundaria (rama 2).\n"
                 "# Cuatro niveles por lista: el 1 vale +3, el 2 +5, el 3 +7 (medidos).\n"
                 "# Lo genera herramientas/construir_arbol.py (NOTAS O-140).\n")
        w = csv.writer(fh)
        w.writerow(["lista", "posicion_codigo", "posicion", "nivel1", "nivel2", "nivel3", "nivel4"])
        w.writerows(filas)
    print("Escritas %d filas en %s" % (len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
