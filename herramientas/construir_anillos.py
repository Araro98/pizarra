#!/usr/bin/env python3
"""El giro del anillo del arbol de cada personaje, leido de una partida (NOTAS O-195).

    py herramientas\\construir_anillos.py <partida> [<partida> ...]

Cada partida (carpeta o fichero) SUMA a lo que ya hay en `anillos.csv`: los
giros ya apuntados se quedan y se anaden los personajes nuevos (O-234). Asi
se pueden ir juntando partidas de Aaron y de sus amigos.

Escribe `datos/reglas-extraidas/anillos.csv`: identidad, chara_base_id,
diamante (1 si es un Diamante: tienen otro giro que las copias normales del
mismo personaje), rama, giro y cuantas copias lo confirman.

**Por que de una partida.** El giro (`0x38AFC2B8`) no es una eleccion del
jugador: en la partida de Aaron, de los 53 personajes con tres o mas copias
hechas por el juego, TODAS las copias de cada uno llevan el mismo giro, y no
hay ninguna columna de `chara_param`, `chara_base` ni de las tablas del arbol
que lo prediga. El juego lo saca de algo que no esta en los datos que tenemos
(lo mas probable, un tablero sorteado con la identidad como semilla). Asi que
se aprende de los jugadores que el juego ya ha hecho, y el editor usa este
fichero (y ademas la partida abierta) para girar el anillo como lo haria el
juego. Cuando no conoce al personaje, cae en el giro mas comun.

Solo se cuentan jugadores con el anillo girado y sin rastro del editor: se
excluyen las filas con giro distinto al de la mayoria de su personaje.
"""
import collections
import csv
import os
import struct
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import codec, escribir as E, jugador as J, reglas  # noqa: E402

SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "anillos.csv")


def muestras(plain):
    """[(identidad, rama, giro)] de los jugadores con el anillo girado."""
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    rar = J.array(plain, J.ARRAY_RAREZA)
    fuera = []
    for fila in range(min(6000, len(ident))):
        if not ident[fila] or 5 <= rar[fila] <= 7:
            continue
        try:
            oa, na = E._campo(plain, fila, E.F_ANILLOS)
            ob, nb = E._campo(plain, fila, E.F_GIROS)
            orr, _ = E._campo(plain, fila, J.F_RAMA)
        except E.Ilegal:
            continue
        if na != 30 or nb != 30 or plain[oa] != E.CASILLA_ANILLO or not plain[ob]:
            continue
        # solo los que el juego da por buenos: si el giro no conecta, al cargar
        # la partida el juego cierra las pasivas 3-5 (O-195). Asi no se aprende
        # un giro que puso mal el editor o que el jugador no ha terminado.
        t = J.tabla_pasivas(plain, fila)
        if t and any(x["id"] != "00000000" for x in t) and not all(x["marca"] for x in t[2:5]):
            continue
        rama = struct.unpack_from("<I", plain, orr)[0]
        fuera.append(("%08X" % ident[fila], 1 if rar[fila] == 8 else 0, rama, plain[ob]))
    return fuera


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    base = {f["identidad"].upper(): f["chara_base_id"] for f in reglas._tabla("personajes.csv")}
    cuenta = collections.defaultdict(collections.Counter)
    # lo que ya estaba apuntado se queda, con sus muestras
    antes = 0
    if os.path.isfile(SALIDA):
        for f in reglas._tabla("anillos.csv"):
            clave = (f["identidad"].upper(), int(f["diamante"]), int(f["rama"]))
            cuenta[clave][int(f["giro"])] += int(f.get("muestras") or 1)
            antes += 1
    for ruta in argv[1:]:
        if os.path.isdir(ruta):
            ruta = os.path.join(ruta, "002AB8F4-USERDATALIVE")
        # el nombre del fichero es la clave del cifrado: una copia renombrada
        # se lee con el de la partida
        nombre = os.path.basename(ruta)
        plain = codec.load(ruta, name=nombre if nombre.endswith("USERDATALIVE") else "002AB8F4-USERDATALIVE")
        nuevas = 0
        for identidad, diamante, rama, giro in muestras(plain):
            if (identidad, diamante, rama) not in cuenta:
                nuevas += 1
            cuenta[(identidad, diamante, rama)][giro] += 1
        print("  %s: %d personajes nuevos" % (ruta, nuevas))
    filas = []
    for (identidad, diamante, rama), c in sorted(cuenta.items()):
        giro, n = c.most_common(1)[0]
        filas.append({"identidad": identidad, "chara_base_id": base.get(identidad, ""),
                      "diamante": diamante, "rama": rama, "giro": giro, "muestras": n,
                      "discrepan": sum(c.values()) - n})
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# El giro del anillo del arbol (0x38AFC2B8) de cada personaje, leido de los\n"
                 "# jugadores que hizo el juego en una partida (NOTAS O-195). Es fijo por\n"
                 "# personaje: el editor lo usa al girar el anillo. Lo genera\n"
                 "# herramientas/construir_anillos.py <partida>.\n")
        w = csv.DictWriter(fh, fieldnames=["identidad", "chara_base_id", "diamante", "rama",
                                           "giro", "muestras", "discrepan"])
        w.writeheader()
        w.writerows(filas)
    print("Escritos %d giros en %s (antes %d; %d con dos o mas copias)"
          % (len(filas), SALIDA, antes, sum(1 for f in filas if f["muestras"] >= 2)))
    print("   por giro:", dict(collections.Counter((f["rama"], f["giro"]) for f in filas)))
    print("   con copias que discrepan:", sum(1 for f in filas if f["discrepan"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
