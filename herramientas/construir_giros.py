#!/usr/bin/env python3
"""El giro del anillo del arbol de TODOS los personajes, calculado como el juego (NOTAS O-283).

    py herramientas\\construir_giros.py

Escribe `datos/reglas-extraidas/giros-anillo.csv`: identidad, diamante (1 si
es la version Diamante), arquetipo (solo en los Diamantes de fabrica, cuyo
tablero cambia con el arquetipo; vacio = vale para todos), rama (0 o 1) y giro.
Y `giros-tablero.csv`: el giro de cada rama para cada tablero del juego. Un
Diamante lleva su tablero apuntado en la partida (`abilityLearningBoardId`) y
el juego dibuja el arbol con ESE, no con el de sus posiciones: en la partida
de Aaron los 109 Diamantes que hizo el juego cuadran con el apuntado, y los
que el juego rechazo (pasivas 3-5 cerradas) son justo los que no (O-284).

**Como lo hace el juego** (sacado de nie.exe, O-283):

- El arbol se dibuja con una forma (cuadricula de piezas de
  `skill/ability_learning_config`: BOARD_SHAPE_INFO / PIECE_DIR / PIECE_EFF).
  El anillo es la casilla 8 de la forma (casilla 7 del mapa). Su giro
  (`overwriteRouteSwitcherTypeList`) es el par de lados que une con la rama:
  arriba-izq 7, arriba-der 5, arriba-abajo 1, izq-abajo 6, izq-der 8,
  der-abajo 4.
- Un normal: la funcion 0x140E7B5B0 siembra `lives::CPseudoRand` con el
  segundo dato de su fila de `chara_param` (su id de `chara_base`), descarta
  11 numeros, saca `next() % (suma de pesos + 1)` y coge esa forma de
  `ABILITY_LEARNING_SHAPE_TABLE_INFO` (39 formas, peso 1; si sale 39, la 0).
- Un Diamante (funcion 0x14165CED0): si es de fabrica, su tablero por
  arquetipo de `character/basara_chara_config`; si no, el tablero
  `crc32("ability_learning_board_basara_<pos>-<pos2>_<arquetipo+1>")` con
  GK/FW/MF/DF (su forma solo depende de las dos posiciones).

Comprobado con la partida de Aaron: 2.619 de 2.658 giros de normales (los que
fallan son de jugadores pasados a la rama 2 por una version vieja del editor,
O-281), 58 de 62 Diamantes de fabrica y 151 de 159 Diamantes con semilla.
Sin calcular (se queda lo aprendido de partidas): los que llevan tablero
propio en `chara_param` (Destin Billows...) y la rama 2 de la forma 31, cuyas
dos ramas salen del anillo por el mismo lado.
"""
import csv
import os
import re
import subprocess
import zlib
from collections import deque

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "giros-anillo.csv")
SALIDA_TABLEROS = os.path.join(RAIZ, "datos", "reglas-extraidas", "giros-tablero.csv")
M = 0xFFFFFFFF

GIRO = {frozenset(("arriba", "izq")): 7, frozenset(("arriba", "der")): 5, frozenset(("arriba", "abajo")): 1,
        frozenset(("izq", "abajo")): 6, frozenset(("izq", "der")): 8, frozenset(("der", "abajo")): 4}
LADOS = {(-1, 0): "arriba", (1, 0): "abajo", (0, -1): "izq", (0, 1): "der"}
POSICION = ["NONE", "GK", "FW", "MF", "DF"]       # la tabla de nie.exe 0x141A46910


class PseudoRand:
    """lives::CPseudoRand (nie.exe 0x1404C92B0 sembrar, 0x1404C9330 siguiente,
    0x14009FB20 acotado): xorshift de 128 bits con su propia siembra."""

    def __init__(self, s):
        self.x, self.y, self.z, self.w = 0x6c078966, 0xdd5254a5, 0xb9523b81, 0x3df95b3
        if s:
            self.x = (0x6c078965 * (s ^ (s >> 30)) + 1) & M
            self.y = (0x6c078965 * (self.x ^ (self.x >> 30)) + 2) & M
            self.z = (0x6c078965 * (self.y ^ (self.y >> 30)) + 3) & M

    def siguiente(self):
        x = self.x
        t = (x ^ (x << 11)) & M
        self.x, self.y, self.z = self.y, self.z, self.w
        w = self.w
        self.w = (w ^ t ^ (((w >> 11) ^ t) >> 8)) & M
        return self.w

    def acotado(self, n):
        v = self.siguiente()
        return v % n if n else v


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
    return [l.split("\t") for l in r.stdout.splitlines()]


def main():
    skill = unico(os.path.join(GAMEDATA, "skill"), "ability_learning_config")
    # tableros: clave -> forma
    bi = volcar(skill, "ABILITY_LEARNING_BOARD_INFO_LIST")
    nb = int(bi[0][0])
    forma_de = {int(bi[1 + 2 * k][0]) & M: int(bi[1 + 2 * k][1]) for k in range(nb)}
    # formas: clave -> (filas de piezas, filas de casillas)
    sh = volcar(skill, "ABILITY_LEARNING_BOARD_SHAPE_INFO_LIST")
    ns = int(sh[0][0])
    formas = {int(sh[1 + 3 * k][0]): (int(sh[2 + 3 * k][0]), int(sh[2 + 3 * k][1]),
                                       int(sh[3 + 3 * k][0]), int(sh[3 + 3 * k][1])) for k in range(ns)}
    piezas = volcar(skill, "ABILITY_LEARNING_BOARD_SHAPE_PIECE_DIR_LIST")[1:]
    casillas = volcar(skill, "ABILITY_LEARNING_BOARD_SHAPE_PIECE_EFF_LIST")[1:]

    def giros_de_forma(clave):
        """(giro rama 1, giro rama 2) de una forma; None donde no se sabe."""
        if clave not in formas:
            return None, None
        di, dn, ei, en = formas[clave]
        d = [list(map(int, piezas[di + r][1:])) for r in range(dn)]
        e = [list(map(int, casillas[ei + r][1:])) for r in range(en)]
        pos = {e[r][c]: (r, c) for r in range(len(e)) for c in range(len(e[r])) if 0 < e[r][c] < 1000}
        if 8 not in pos:
            return None, None
        r0, c0 = pos[8]

        def lado_hacia(objetivo, sin=None):
            q, vistos = deque(), {(r0, c0)}
            for (dr, dc), lado in LADOS.items():
                r, c = r0 + dr, c0 + dc
                if lado != sin and 0 <= r < len(d) and 0 <= c < len(d[0]) and d[r][c]:
                    q.append((r, c, lado))
                    vistos.add((r, c))
            while q:
                r, c, lado = q.popleft()
                if e[r][c] == objetivo:
                    return lado
                if 0 < e[r][c] < 1000:
                    continue
                for dr, dc in LADOS:
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < len(d) and 0 <= cc < len(d[0]) and d[rr][cc] and (rr, cc) not in vistos:
                        vistos.add((rr, cc))
                        q.append((rr, cc, lado))
            return None
        tronco, rama1, rama2 = lado_hacia(7), lado_hacia(9), lado_hacia(19)
        if rama1 == rama2:
            # por el lado de la rama 1 tambien se llega a la 2 (la forma de
            # Zanark): la 2 sale por el otro lado que llega a ella. El juego
            # le pone el 8 a Zanark en la rama 2, y es lo que da (O-285)
            rama2 = lado_hacia(19, sin=rama1)
            if rama2 is None or rama2 == tronco:
                return GIRO.get(frozenset((tronco, rama1))), None
        return GIRO.get(frozenset((tronco, rama1))), GIRO.get(frozenset((tronco, rama2)))

    # la tabla de formas de los normales
    st = [list(map(int, f)) for f in volcar(skill, "ABILITY_LEARNING_SHAPE_TABLE_INFO_LIST")[1:] if len(f) == 2]
    pesos = [w for w, _ in st]
    total = sum(pesos)

    def forma_normal(semilla):
        r = PseudoRand(semilla & M)
        for _ in range(11):
            r.siguiente()
        v = r.acotado(total + 1) if total > 0 else 0
        acum = 0
        for (w, clave) in st:
            acum += w
            if v < acum:
                return clave
        return st[0][1]

    # los Diamantes de fabrica: su tablero por arquetipo
    bc = unico(os.path.join(GAMEDATA, "character"), "basara_chara_config")
    tipos = [tuple(map(int, f)) for f in volcar(bc, "m_basaraBuildTypeList")[1:] if len(f) == 2]
    fabrica = {}
    for f in volcar(bc, "m_basaraBuildInfoList")[1:]:
        m = re.match(r"Tuple2I16\((\d+), (\d+)\)", f[1]) if len(f) == 2 else None
        if m:
            ini, n = int(m.group(1)), int(m.group(2))
            fabrica[int(f[0]) & M] = {t: forma_de.get(b & M) for t, b in tipos[ini:ini + n]}

    cp = unico(os.path.join(GAMEDATA, "character"), "chara_param")
    filas = []
    for f in volcar(cp, "CHARA_PARAM_INFO_LIST")[1:]:
        if len(f) < 11:
            continue
        param, base, pos1, pos2, tablero = (int(f[0]) & M, int(f[1]) & M, int(f[3]), int(f[4]), int(f[10]))
        ident = "%08X" % param
        if tablero == 0:
            # normal (sin tablero propio): la forma que sortea el juego
            for rama, giro in enumerate(giros_de_forma(forma_normal(base))):
                if giro:
                    filas.append([ident, 0, "", rama, giro])
            # como Diamante con semilla: el tablero de sus posiciones
            if 0 < pos1 < 5 and 0 <= pos2 < 5:
                nombre = "ability_learning_board_basara_%s-%s_01" % (POSICION[pos1], POSICION[pos2])
                clave = forma_de.get(zlib.crc32(nombre.encode()))
                if clave and param not in fabrica:
                    for rama, giro in enumerate(giros_de_forma(clave)):
                        if giro:
                            filas.append([ident, 1, "", rama, giro])
        if param in fabrica:
            for arq, clave in sorted(fabrica[param].items()):
                for rama, giro in enumerate(giros_de_forma(clave)):
                    if giro:
                        filas.append([ident, 1, arq, rama, giro])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# El giro del anillo del arbol de cada personaje, calculado como el juego (NOTAS O-283).\n"
                 "# diamante: 1 = su version Diamante; arquetipo: solo en Diamantes de fabrica (vacio = todos).\n"
                 "# Lo genera herramientas/construir_giros.py.\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "diamante", "arquetipo", "rama", "giro"])
        w.writerows(filas)
    print("Escritos %d giros (%d personajes) en %s" % (len(filas), len({f[0] for f in filas}), SALIDA))
    # el giro de cada tablero (lo que usa un Diamante: el apuntado en la partida)
    por_tablero = []
    for tablero, clave in sorted(forma_de.items()):
        for rama, giro in enumerate(giros_de_forma(clave)):
            if giro:
                por_tablero.append(["%08X" % tablero, rama, giro])
    with open(SALIDA_TABLEROS, "w", newline="", encoding="utf-8") as fh:
        fh.write("# El giro del anillo de cada rama segun el tablero (NOTAS O-284).\n"
                 "# tablero: el abilityLearningBoardId que lleva el jugador en la partida.\n"
                 "# Lo genera herramientas/construir_giros.py.\n")
        w = csv.writer(fh)
        w.writerow(["tablero", "rama", "giro"])
        w.writerows(por_tablero)
    print("Escritos %d giros (%d tableros) en %s" % (len(por_tablero), len({f[0] for f in por_tablero}),
                                                     SALIDA_TABLEROS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
