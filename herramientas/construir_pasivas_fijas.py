#!/usr/bin/env python3
"""Las pasivas fijas de Idolos y Diamantes, leidas de sus tableros (NOTAS O-162, O-163).

    py herramientas\\construir_pasivas_fijas.py

Escribe `datos/reglas-extraidas/pasivas-fijas.csv`: identidad, nombre, rareza,
origen (propio / basara), arquetipo (el del tablero basara, vacio si propio),
orden (posicion en la lista basara; el 0 es el que usa el juego si no se ha
elegido arquetipo), tramo (tronco / rama1 / rama2), casilla, nivel al que se
abre y pasiva_id (como en la partida).

De donde sale: un Idolo o un Diamante no sortea pasivas. Su ficha las lleva a
cero y el juego las ensena desde un tablero de habilidades:

- **propio**: `chara_param` columna 10 es la clave de
  `ABILITY_LEARNING_BOARD_INFO_LIST` (skill/ability_learning_config), que da
  el tramo de `ABILITY_LEARNING_BOARD_EFFECT_LIST` con las casillas. Un Idolo
  tiene 17 casillas (una sola rama): 6 tecnicas, 5 pasivas y 6 stats. Los 39
  Diamantes con tablero propio tienen 28: tronco (0-7), rama 1 (8-17) y rama 2
  (18-27).
- **basara**: `character/basara_chara_config`, `m_basaraBuildInfoList`
  (identidad del Diamante, al reves) -> `m_basaraBuildTypeList`: seis
  (arquetipo, tablero), uno por arquetipo que se le puede elegir en el juego.
  Cada tablero tiene 28 casillas: 2 pasivas en el tronco, 3 en cada rama (la
  ultima pareja es la del arquetipo).

Comprobado con las fotos de Aaron: Sonny Wright rojo y plateado y Axel Blaze
plateado (Idolos, tablero propio) y Raika Shinohara Diamante con los seis
arquetipos (basara).
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


def tupla(texto):
    """'Tuple2I16(12, 6)' -> (12, 6)."""
    return tuple(int(x) for x in texto[texto.index("(") + 1:-1].split(","))


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

    def casillas(clave):
        ini, n = tableros[clave]
        return n, [(k, como_en_partida(e[0]), e[1] if len(e) > 1 else "")
                   for k, e in enumerate(efectos[ini:ini + n]) if e and como_en_partida(e[0]) in pasivas]

    per = reglas.personajes()
    filas, raros = [], []

    def anade(ident, origen, arquetipo, orden, clave):
        ficha = per.get("%08X" % ident) or {}
        n, fijas = casillas(clave)
        visibles = [x for x in fijas if tramo_de(x[0], n) != "rama2"]
        if len(visibles) != 5:
            raros.append(("%08X" % ident, ficha.get("nombre_es"), origen, len(visibles)))
        for casilla, pid, nivel in fijas:
            filas.append(["%08X" % ident, ficha.get("nombre_es") or ficha.get("nombre_en") or "",
                          ficha.get("rareza_valor") or "", origen, arquetipo, orden,
                          tramo_de(casilla, n), casilla, nivel, pid, "%08X" % clave])

    # tableros propios (chara_param col 10)
    param = volcar(unico(os.path.join(GAMEDATA, "character"), "chara_param_"), "CHARA_PARAM_INFO_LIST")
    for c in param:
        if len(c) < 42:
            continue
        try:
            ident, clave = int(c[0]) & 0xFFFFFFFF, int(c[10]) & 0xFFFFFFFF
        except ValueError:
            continue
        if clave and clave in tableros:
            anade(ident, "propio", "", 0, clave)

    # tableros basara: uno por arquetipo elegible
    basara = os.path.join(GAMEDATA, "character")
    b_info = volcar(unico(basara, "basara_chara_config"), "m_basaraBuildInfoList")
    b_tipo = volcar(unico(basara, "basara_chara_config"), "m_basaraBuildTypeList")
    for c in b_info:
        if len(c) < 2 or not c[1].startswith("Tuple"):
            continue
        # la clave es la identidad leida al reves (big-endian): su valor en hex
        # ya es la identidad tal cual se escribe (024A9476 = Raika)
        ident = int(c[0]) & 0xFFFFFFFF
        ini, n = tupla(c[1])
        for orden, t in enumerate(b_tipo[ini:ini + n]):
            try:
                arquetipo, clave = int(t[0]), int(t[1]) & 0xFFFFFFFF
            except (ValueError, IndexError):
                continue
            if clave in tableros:
                anade(ident, "basara", arquetipo, orden, clave)

    filas.sort(key=lambda x: (x[1], x[0], x[3], x[5], x[7]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las pasivas fijas de cada Idolo y Diamante, leidas de sus tableros (NOTAS O-162, O-163).\n"
                 "# origen propio = tablero del personaje; basara = un tablero por arquetipo elegible (orden 0 = el de serie).\n"
                 "# pasiva_id como en la partida. Se ensenan las del tronco y las de la rama elegida, por casilla. tablero = la clave del tablero, la que la partida guarda en 0xBAFA8DBD.\n"
                 "# Lo genera herramientas/construir_pasivas_fijas.py.\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "nombre", "rareza", "origen", "arquetipo", "orden", "tramo", "casilla", "nivel", "pasiva_id", "tablero"])
        w.writerows(filas)
    print("Escritas %d filas (%d personajes) en %s" % (len(filas), len({x[0] for x in filas}), SALIDA))
    if raros:
        print("Ojo, no tienen 5 pasivas a la vista:", raros[:10], "..." if len(raros) > 10 else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
