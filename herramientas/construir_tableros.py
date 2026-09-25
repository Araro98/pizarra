#!/usr/bin/env python3
"""Las pasivas de cada tablero de habilidades del juego (NOTAS O-169).

    py herramientas\\construir_tableros.py

Escribe `datos/reglas-extraidas/tableros.csv`: tablero (la clave que la partida
guarda en 0xBAFA8DBD), casillas, tramo (tronco / rama1 / rama2), casilla, nivel
al que se abre y pasiva_id (como en la partida), para TODOS los tableros de
`ABILITY_LEARNING_BOARD_INFO_LIST` que tengan alguna pasiva. Con esto, sabiendo
el tablero de un jugador (Idolo, Diamante nativo o ascendido con semilla) se
sabe que pasivas fijas ensena el juego, aunque el tablero no sea el propio del
personaje.
"""
import csv
import os
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tableros.csv")
# las casillas de stat de cada tablero (Idolos y Diamantes): +3/+5/+7/+10 a un
# stat, O-244
SALIDA_STATS = os.path.join(RAIZ, "datos", "reglas-extraidas", "tableros-stats.csv")


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def como_en_partida(entero):
    return struct.pack("<I", int(entero) & 0xFFFFFFFF).hex().upper()


def tramo_de(casilla, cuantas):
    if cuantas <= 17:
        return "tronco"
    return "tronco" if casilla < 8 else ("rama1" if casilla < 18 else "rama2")


def main():
    skill = unico(os.path.join(GAMEDATA, "skill"), "ability_learning_config")
    info = volcar(skill, "ABILITY_LEARNING_BOARD_INFO_LIST")
    efectos = volcar(skill, "ABILITY_LEARNING_BOARD_EFFECT_LIST")
    valores = {f["id"].upper(): f for f in reglas._tabla("pasivas-valor.csv")}
    pasivas = {i for i, f in valores.items() if not (f.get("familia") or "").startswith("stat_")}
    nombre_stat = {"stat_potencia": "Potencia", "stat_control": "Control", "stat_tecnica": "Tecnica",
                   "stat_presion": "Presion", "stat_fisico": "Fisico", "stat_agilidad": "Agilidad",
                   "stat_inteligencia": "Inteligencia"}
    filas, filas_stats = [], []
    for i in range(0, len(info) - 1, 2):
        if len(info[i]) != 2 or len(info[i + 1]) != 2:
            continue
        try:
            clave = int(info[i][0]) & 0xFFFFFFFF
            ini, n = int(info[i + 1][0]), int(info[i + 1][1])
        except ValueError:
            continue
        if not clave or not n:
            continue
        for k, e in enumerate(efectos[ini:ini + n]):
            pid = como_en_partida(e[0]) if e else ""
            if pid in pasivas:
                filas.append(["%08X" % clave, n, tramo_de(k, n), k, e[1] if len(e) > 1 else "", pid])
            f = valores.get(pid) or {}
            if f.get("familia") in nombre_stat:
                filas_stats.append(["%08X" % clave, n, tramo_de(k, n), k,
                                    nombre_stat[f["familia"]], f.get("valor") or "0"])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las pasivas de cada tablero de habilidades del juego, por casilla (NOTAS O-169).\n"
                 "# tablero = la clave que la partida guarda por jugador en 0xBAFA8DBD; pasiva_id como en la partida.\n"
                 "# Lo genera herramientas/construir_tableros.py.\n")
        w = csv.writer(fh)
        w.writerow(["tablero", "casillas", "tramo", "casilla", "nivel", "pasiva_id"])
        w.writerows(filas)
    print("Escritas %d filas (%d tableros) en %s" % (len(filas), len({f[0] for f in filas}), SALIDA))
    with open(SALIDA_STATS, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las casillas de stat de cada tablero de habilidades (NOTAS O-244): tramo, casilla,\n"
                 "# stat y cuanto suma. Lo genera herramientas/construir_tableros.py.\n")
        w = csv.writer(fh)
        w.writerow(["tablero", "casillas", "tramo", "casilla", "stat", "valor"])
        w.writerows(filas_stats)
    print("Escritas %d casillas de stat (%d tableros) en %s"
          % (len(filas_stats), len({f[0] for f in filas_stats}), SALIDA_STATS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
