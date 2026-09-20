#!/usr/bin/env python3
r"""Que pasivas puede sacar un jugador, por ranura.

    py herramientas\construir_pasivas_jugador.py

Escribe `datos/reglas-extraidas/pasivas-por-ranura.csv`.

**De donde sale**: de observar las cinco pasivas de los 574 jugadores de la
partida de Aaron. No se lee de una tabla del juego: se sabe cual es la CLAVE
(ver abajo) pero no se ha conseguido partir el tablero del juego en sus 72
trozos (NOTAS O-54). Por eso cada fila lleva `veces_visto`.

Estructura, con como se ha establecido cada parte:

| Ranuras | De que dependen | Como se sabe |
|---|---|---|
| 1 y 2 | de **(posicion, posicion alternativa, rango)** | la clave que mejor separa, y coincide con la tabla de 72 tipos del juego (4 x 3 x 6) |
| 3 | del **arquetipo**: 3 opciones | validado 15/15 contra inazumo.es |
| 4 y 5 | del **arquetipo**: 4 a 6 | observado |

Para las ranuras 1 y 2 se escriben **dos agrupaciones**, porque sirven para cosas
distintas:

- **por posicion** (`POR (ranuras 1-2)`): pocas categorias y mucha muestra, asi
  que es fiable. Es la que deberia usar el editor como regla.
- **por tipo de tablero** (`tablero POR-MED-r3 (ranuras 1-2)`): mucho mas fina
  (6,6 pasivas por grupo frente a 24), pero con pocos jugadores en cada una. Util
  como indicio, no como regla.

Aaron aporto la restriccion de posicion y los datos le dan la razon: "PP del
equipo" solo sale en porteros (4 de 4), "AT propio de tiro en campo contrario"
solo en delanteros (53 de 53), y "Valor propio de foco" en ningun portero (0 de
124).

**El editor no deberia ofrecer combinaciones con evidencia baja sin avisar.**
"""
import csv
import collections
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from ievr import codec, jugador as J, tlv

PARTIDA = os.path.join(RAIZ, "partidas", "rondas", "15-tras-primera-escritura",
                       "002AB8F4-USERDATALIVE")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-por-ranura.csv")

# La familia de stat sale del propio texto de la pasiva.
def familia(nombre):
    n = (nombre or "").lower()
    if "tiro" in n:
        return "Tiro"
    if "foco" in n:
        return "Foco"
    if "muro" in n or "pp del equipo" in n:
        return "Muro"
    if "disputa" in n:
        return "Disputa"
    return "otra"


def alcance(nombre):
    """Si la pasiva se aplica a uno mismo o a un grupo del equipo."""
    n = (nombre or "").lower()
    return "propio" if "propio" in n or "propia" in n else "equipo"


def main():
    if not os.path.isfile(PARTIDA):
        raise SystemExit("no encuentro la partida en %s" % PARTIDA)
    plain = codec.load(PARTIDA)
    niveles = J.array(plain, J.ARRAY_NIVEL)
    arquetipos = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    nombres = tlv.nombres()

    # posicion de cada personaje, para filtrar las ranuras 1-2
    POS = {1: "POR", 2: "DEL", 3: "MED", 4: "DEF"}
    posiciones = {}
    tableros = {}
    tsv = os.path.join(RAIZ, "datos", "juego", "tablas", "CHARA_PARAM_INFO_LIST.tsv")
    with open(tsv, encoding="utf-8", errors="replace") as fh:
        for linea in fh:
            c = linea.rstrip().split(chr(9))
            if len(c) < 43:
                continue
            try:
                ident = int(c[0]) & 0xFFFFFFFF
                posiciones[ident] = POS.get(int(c[3]), "?")
                # tipo de tablero = (posicion, posicion alternativa, rango).
                # Es la clave que mejor separa las pasivas 1-2 y coincide con la
                # tabla de 72 tipos del juego (4 x 3 x 6). Ver NOTAS O-54.
                tableros[ident] = "%s-%s-r%d" % (POS.get(int(c[3]), "?"),
                                                 POS.get(int(c[4]), "?"), int(c[9]))
            except ValueError:
                pass
    # el equipo del personaje: la clave que explica las excepciones (Guardianas)
    equipos_de = {}
    ruta_j = os.path.join(RAIZ, "datos", "reglas-extraidas", "jugadores.csv")
    with open(ruta_j, newline="", encoding="utf-8") as fh:
        for fila in csv.DictReader([l for l in fh if not l.lstrip().startswith("#")]):
            try:
                equipos_de[int(fila["identidad"], 16)] = fila.get("equipo", "")
            except ValueError:
                pass

    identidades = J.array(plain, J.ARRAY_IDENTIDAD)

    visto = collections.Counter()     # (grupo, id) -> cuantas veces
    jugadores = 0
    for f in range(6000):
        if niveles[f] <= 1:
            continue
        campos, _ = J._campos_de(plain, fichas[f], {J.F_PASIVAS})
        d = campos.get(J.F_PASIVAS, b"")
        if len(d) != 20:
            continue
        jugadores += 1
        arq = J.ARQUETIPOS.get(arquetipos[f], "arquetipo %d" % arquetipos[f])
        for r in range(5):
            h = d[r * 4:r * 4 + 4].hex().upper()
            if h == "00000000":
                continue
            if r < 2:
                # dos agrupaciones: la de posicion, con buena muestra, y la del
                # tipo de tablero, mas fina pero con menos jugadores en cada una
                visto[("%s (ranuras 1-2)" % posiciones.get(identidades[f], "?"), h)] += 1
                visto[("tablero %s (ranuras 1-2)" % tableros.get(identidades[f], "?"), h)] += 1
                eq = equipos_de.get(identidades[f], "")
                grupo = "equipo %s / %s (ranuras 1-2)" % (
                    eq or "?", posiciones.get(identidades[f], "?"))
            else:
                grupo = "%s (ranura %d)" % (arq, r + 1)
            visto[(grupo, h)] += 1

    # Lo visto en la partida que NO es del grupo (Aaron, O-218): "Cuando el
    # equipo gana en foco o disputa, tension" es de Tension, no de Contra; en
    # la partida la llevaban jugadores de Contra por heredarla o por un cambio
    # de arquetipo, y se colaba en el selector de Contra.
    EXCLUIR = {("Contra (ranura 4)", "5E0C7F82"), ("Contra (ranura 5)", "5E0C7F82")}
    filas = []
    for (grupo, h), n in sorted(visto.items(), key=lambda kv: (kv[0][0], -kv[1])):
        if (grupo, h.upper()) in EXCLUIR:
            continue
        nombre = nombres.get(h, ("", ""))[0]
        filas.append({"grupo": grupo, "id": h, "nombre": nombre,
                      "familia": familia(nombre), "alcance": alcance(nombre),
                      "veces_visto": n})

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que pasivas puede sacar un jugador, por ranura.\n"
                 "# Observado en la partida de Aaron (%d jugadores), no leido de una\n"
                 "# tabla del juego. Las ranuras 1-2 estan contrastadas con inazumo.es\n"
                 "# y coinciden exactamente; las demas son lo visto hasta ahora.\n"
                 "# Lo genera herramientas/construir_pasivas_jugador.py.\n" % jugadores)
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)

    print("Escritas %d filas en %s  (%d jugadores mirados)" % (len(filas), SALIDA, jugadores))
    por_grupo = collections.Counter(f["grupo"] for f in filas)
    for g, n in sorted(por_grupo.items()):
        print("   %-28s %d pasivas" % (g, n))
    for pos in ("POR", "DEL", "MED", "DEF"):
        g = [f for f in filas if f["grupo"].startswith(pos)]
        solidas = sum(1 for f in g if f["veces_visto"] >= 5)
        print("   %s: %d pasivas vistas, %d con 5 o mas apariciones"
              % (pos, len(g), solidas))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
