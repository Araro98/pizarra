#!/usr/bin/env python3
"""Las pasivas de entrenadores y gerentes, leidas del juego (NOTAS O-163).

    py herramientas\\construir_pasivas_personal.py

Escribe `datos/reglas-extraidas/pasivas-personal.csv`: rol (entrenador /
gerente), arquetipo (0-5), clave (1-14, o 100 para los Diamantes), ranura
(1-5) y pasiva_id (como en la partida).

De donde sale: `skill/ability_learning_config`, listas
`ABILITY_LEARNING_SUPPORTER_PASSIVE_INFO_LIST` (rol 0 = entrenador, 1 =
gerente) -> `..._BUILD_LIST` (los seis arquetipos) -> `..._SET_LIST` (15
juegos de 5 pasivas por rol y arquetipo, con clave 1..14 y 100). El juego de
clave 100 es el de los Diamantes: cuadra con las fotos de Raika Shinohara
Diamante de Justicia como entrenadora (DF del muro +8 % x2, Justicia +1,6 %
x3) y como gerente (+4 % x2, +0,8 % x3). Que clave usa un personaje normal
esta por confirmar.
"""
import csv
import os
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-personal.csv")
ROLES = {0: "entrenador", 1: "gerente"}


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


def pares(filas):
    """Las listas alternan una fila con la clave y otra con (donde empieza, cuantas)."""
    fuera = []
    for i in range(0, len(filas) - 1, 2):
        if len(filas[i]) == 1 and len(filas[i + 1]) == 2:
            fuera.append((int(filas[i][0]), int(filas[i + 1][0]), int(filas[i + 1][1])))
    return fuera


def como_en_partida(entero):
    return struct.pack("<I", int(entero) & 0xFFFFFFFF).hex().upper()


def main():
    if not os.path.exists(VOLCADO):
        raise SystemExit("falta el volcador (referencia/volcado)")
    skill = unico(os.path.join(GAMEDATA, "skill"), "ability_learning_config")
    P = "ABILITY_LEARNING_SUPPORTER_PASSIVE_"
    info = pares(volcar(skill, P + "INFO_LIST"))
    build = pares(volcar(skill, P + "BUILD_LIST"))
    sets = [c for c in volcar(skill, P + "SET_LIST") if len(c) >= 6]
    filas = []
    for rol, ini, n in info:
        for arquetipo, s_ini, s_n in build[ini:ini + n]:
            for c in sets[s_ini:s_ini + s_n]:
                clave = int(c[0])
                for ranura, pid in enumerate(c[1:6], 1):
                    filas.append([ROLES.get(rol, str(rol)), arquetipo, clave, ranura, como_en_partida(pid)])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Pasivas de entrenadores y gerentes por rol, arquetipo y clave (100 = Diamante). NOTAS O-163.\n"
                 "# pasiva_id como en la partida. Lo genera herramientas/construir_pasivas_personal.py.\n")
        w = csv.writer(fh)
        w.writerow(["rol", "arquetipo", "clave", "ranura", "pasiva_id"])
        w.writerows(filas)
    print("Escritas %d filas en %s" % (len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
