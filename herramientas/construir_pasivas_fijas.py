#!/usr/bin/env python3
"""Las pasivas fijas de Idolos y Diamantes, leidas del tablero de cada uno (NOTAS O-162).

    py herramientas\\construir_pasivas_fijas.py

Escribe `datos/reglas-extraidas/pasivas-fijas.csv`: identidad, nombre, rareza,
tramo (tronco / rama1 / rama2), casilla, nivel al que se abre y pasiva_id
(como en la partida).

De donde sale: un Idolo o un Diamante nativo no sortea pasivas. Su ficha las
lleva a cero y el juego las ensena desde **su propio tablero de habilidades**:
`chara_param` columna 10 (solo ellos la tienen distinta de 0) es la clave de
`ABILITY_LEARNING_BOARD_INFO_LIST` (skill/ability_learning_config), que da el
tramo de `ABILITY_LEARNING_BOARD_EFFECT_LIST` con las casillas del tablero.
Un Idolo tiene 17 casillas (una sola rama): 6 tecnicas, 5 pasivas y 6 stats.
Un Diamante tiene 28: tronco (0-7), rama 1 (8-17) y rama 2 (18-27), con 2
pasivas en el tronco y 3 en cada rama; se ensenan las del tronco y las de la
rama elegida (`0x72479F6E`). Comprobado con Sonny Wright rojo y plateado y con
Axel Blaze plateado (fotos de Aaron): las pasivas, en orden de casilla, son
las cinco de la pantalla "Pasivas de equipo".
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
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-fijas.csv")


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
    """El id como lo guarda la partida: los 4 bytes del entero, en hex."""
    return struct.pack("<I", int(entero) & 0xFFFFFFFF).hex().upper()


def tramo_de(casilla, cuantas):
    """17 casillas = una sola rama (Idolo); 28 = tronco 0-7, rama 1 8-17, rama 2 18-27."""
    if cuantas <= 17:
        return "tronco"
    return "tronco" if casilla < 8 else ("rama1" if casilla < 18 else "rama2")


def main():
    if not os.path.exists(VOLCADO):
        raise SystemExit("falta el volcador (referencia/volcado)")
    skill = unico(os.path.join(GAMEDATA, "skill"), "ability_learning_config")
    info = volcar(skill, "ABILITY_LEARNING_BOARD_INFO_LIST")
    efectos = volcar(skill, "ABILITY_LEARNING_BOARD_EFFECT_LIST")
    # BOARD_INFO alterna (clave del tablero, ?) con (donde empieza, cuantas)
    tableros = {}
    for i in range(0, len(info) - 1, 2):
        if len(info[i]) == 2 and len(info[i + 1]) == 2:
            try:
                tableros[int(info[i][0]) & 0xFFFFFFFF] = (int(info[i + 1][0]), int(info[i + 1][1]))
            except ValueError:
                pass
    # solo pasivas de verdad: las casillas de "Potencia +3" tambien estan en
    # pasivas-valor.csv (familia stat_*) y no son de la pantalla de pasivas
    pasivas = {f["id"].upper() for f in reglas._tabla("pasivas-valor.csv")
               if not (f.get("familia") or "").startswith("stat_")}
    per = reglas.personajes()
    param = volcar(unico(os.path.join(GAMEDATA, "character"), "chara_param_"), "CHARA_PARAM_INFO_LIST")
    filas, raros = [], []
    for c in param:
        if len(c) < 42:
            continue
        try:
            ident, clave = int(c[0]) & 0xFFFFFFFF, int(c[10]) & 0xFFFFFFFF
        except ValueError:
            continue
        if not clave or clave not in tableros:
            continue
        ini, n = tableros[clave]
        ficha = per.get("%08X" % ident) or {}
        fijas = [(k, como_en_partida(e[0]), e[1] if len(e) > 1 else "")
                 for k, e in enumerate(efectos[ini:ini + n]) if e and como_en_partida(e[0]) in pasivas]
        visibles = [x for x in fijas if tramo_de(x[0], n) != "rama2"]
        if len(visibles) != 5:
            raros.append(("%08X" % ident, ficha.get("nombre_es"), len(visibles)))
        for casilla, pid, nivel in fijas:
            filas.append(["%08X" % ident, ficha.get("nombre_es") or ficha.get("nombre_en") or "",
                          ficha.get("rareza_valor") or "", tramo_de(casilla, n), casilla, nivel, pid])
    filas.sort(key=lambda x: (x[1], x[0], x[4]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las pasivas fijas de cada Idolo y Diamante nativo, leidas de su tablero (NOTAS O-162).\n"
                 "# pasiva_id como en la partida (4 bytes tal cual). Se ensenan las del tronco y las de la rama elegida, por casilla.\n"
                 "# Lo genera herramientas/construir_pasivas_fijas.py.\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "nombre", "rareza", "tramo", "casilla", "nivel", "pasiva_id"])
        w.writerows(filas)
    print("Escritas %d filas (%d personajes) en %s" % (len(filas), len({x[0] for x in filas}), SALIDA))
    if raros:
        print("Ojo, no tienen 5 pasivas a la vista:", raros[:10], "..." if len(raros) > 10 else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
