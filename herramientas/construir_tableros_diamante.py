#!/usr/bin/env python3
"""Que tablero de habilidades le pone el juego a un Diamante que no tiene los
suyos propios (NOTAS O-169).

    py herramientas\\construir_tableros_diamante.py

Escribe `datos/reglas-extraidas/tableros-diamante.csv`: posicion, elemento,
tipo (el valor de la columna 4 de chara_param, el mismo que la partida guarda en
0xFC830AAC), arquetipo (0-5) y tablero (la clave que la partida guarda en
0xBAFA8DBD).

De donde sale: `character/basara_chara_config` da a 70 Diamantes sus seis
tableros (uno por arquetipo). Muchos comparten el mismo juego de seis, y ese
juego va con la posicion, el elemento y el tipo del personaje. Para un Diamante
que no esta en esa tabla (un normal ascendido con semilla) el juego elige uno
de esos juegos; con esta clave se acierta en 35 de los 43 ascendidos de la
partida de Aaron (Brecha a Juego sucio); el de Justicia varia mas y aqui va el
mas comun. Cuando hay varias opciones se coge la mas repetida.
"""
import collections
import csv
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tableros-diamante.csv")


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


# (posicion, elemento, tipo, arquetipo) -> tablero, visto en la partida de
# Aaron. Blazer Firefoot (POR, Fuego, tipo 4) al elegir Justicia en el juego:
# el de Justicia de Quentin Cinquedea (O-242).
APRENDIDOS = {("POR", "Fuego", "4", 5): "EE48C1B3"}


def main():
    chara = os.path.join(GAMEDATA, "character")
    b_info = volcar(unico(chara, "basara_chara_config"), "m_basaraBuildInfoList")
    b_tipo = volcar(unico(chara, "basara_chara_config"), "m_basaraBuildTypeList")
    param = {}
    for c in volcar(unico(chara, "chara_param_"), "CHARA_PARAM_INFO_LIST"):
        if len(c) > 41:
            try:
                param["%08X" % (int(c[0]) & 0xFFFFFFFF)] = c
            except ValueError:
                pass
    jug = {f["identidad"].upper(): f for f in reglas._tabla("jugadores.csv")}
    votos = collections.defaultdict(collections.Counter)
    for c in b_info:
        if len(c) < 2 or not c[1].startswith("Tuple"):
            continue
        ident = "%08X" % (int(c[0]) & 0xFFFFFFFF)
        ini, n = [int(x) for x in c[1][c[1].index("(") + 1:-1].split(",")]
        j, p = jug.get(ident), param.get(ident)
        if not j or not p:
            continue
        clave = (j.get("posicion") or "", j.get("elemento") or "", p[4])
        for t in b_tipo[ini:ini + n]:
            try:
                votos[clave + (int(t[0]),)]["%08X" % (int(t[1]) & 0xFFFFFFFF)] += 1
            except (ValueError, IndexError):
                pass
    # Lo visto en partidas: combinaciones que ningun Diamante basara tiene y
    # que el juego ha asignado de verdad a un ascendido con semilla al elegir
    # su arquetipo (O-242). Mandan sobre la votacion.
    for clave, tablero in APRENDIDOS.items():
        votos[clave] = collections.Counter({tablero: 10 ** 6})
    filas = [[*k, v.most_common(1)[0][0]] for k, v in sorted(votos.items())]
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Tablero que le pone el juego a un Diamante sin tableros propios, por posicion, elemento, tipo (col 4 de chara_param) y arquetipo. NOTAS O-169.\n"
                 "# tablero = la clave que la partida guarda en 0xBAFA8DBD. Lo genera herramientas/construir_tableros_diamante.py.\n")
        w = csv.writer(fh)
        w.writerow(["posicion", "elemento", "tipo", "arquetipo", "tablero"])
        w.writerows(filas)
    print("Escritas %d filas en %s" % (len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
