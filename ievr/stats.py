#!/usr/bin/env python3
"""Los siete stats de un jugador. La partida no los guarda: el juego los calcula.

    stat = parte_entera( base(posicion, posicion_alt, patron, rango, nivel)
                         x multiplicador(rareza) )
           + arbol de habilidades + judias + equipacion

**Esta comprobado contra el juego** con Alex Zabel, las catorce cifras exactas a
nivel 1 y a nivel 99, y de rebote con Zanark Avalonic (NOTAS O-114).

Tres cosas que costaron encontrar:

- **El rango no es la rareza.** Es la columna 9 de `chara_param`, que trae el
  personaje de fabrica y no cambia. Durante mucho tiempo se uso la rareza de la
  partida como si fuera el rango y los numeros salian bajos.
- **La rareza multiplica.** Un "Leyenda del futbol" (rareza 4) multiplica por
  **1,4**, y se corta la parte decimal.
- **Cada tabla se busca con su clave.** La de nivel 1 va por posicion y
  **posicion secundaria**; la de 50 y 99 por posicion y patron.

Que es exacto y que no:

- **Exacto** a nivel 1, 30, 50 y 99, que son los que trae tabulados el juego.
- **Aproximado** en los demas: se interpola en linea recta entre los dos niveles
  tabulados mas cercanos.
- **Las judias** (+1 cada una) y **la equipacion** son exactas.
- **El arbol de habilidades** tambien (NOTAS O-140): que stat sube cada
  casilla lo decide la **posicion** del personaje (la principal para el tronco
  y la rama 1, la secundaria para la rama 2), y cuanto sube lo decide la casilla
  (+3, +5, +7). Comprobado con Alex Zabel: base + arbol = lo que ensena el juego,
  siete cifras exactas. Solo para futbolistas normales; los Idolos y Diamantes
  llevan un tablero propio que todavia no se ha descifrado.
"""
from ievr import escribir as E, inventario, jugador as J, opciones as O, reglas

NOMBRES = ["Potencia", "Control", "Tecnica", "Presion", "Fisico", "Agilidad",
           "Inteligencia"]
CLAVES = ["potencia", "control", "tecnica", "presion", "fisico", "agilidad",
          "inteligencia"]
NIVELES_TABULADOS = (1, 30, 50, 99)

# Lo que multiplica cada rareza. El 1,4 de "Leyenda del futbol" esta
# **comprobado contra el juego** (catorce cifras exactas en dos jugadores). Los
# demas siguen la misma escalera de decimas, que es lo que encaja, pero **no
# estan comprobados uno por uno**; los de Idolo y Diamante son los mas dudosos.
MULTIPLICADOR = {0: 1.0, 1: 1.1, 2: 1.2, 3: 1.3, 4: 1.4,
                 5: 1.4, 6: 1.4, 7: 1.4, 8: 1.4}
# Un **Diamante usa siempre el rango 5**, sea cual sea el del personaje. Se ve
# comparando dos Diamantes de Aaron: Mayen Harmet es un personaje de rango 0 y
# Mark Evans de rango 5, y los dos ensenan **exactamente los mismos numeros**
# (NOTAS O-130). O sea que al pasar a Diamante el juego los iguala arriba.
RANGO_DE_DIAMANTE = 5
# Medidos contra el juego con jugadores de Aaron, sin judias ni equipacion:
#   rareza 0 Serene Goldwell, 1 Amelia Rainwalker, 2 Alara Belmont,
#   4 Alex Zabel, 5 Sergi Hernandez.  El 3 se deduce de la escalera.
RAREZAS_COMPROBADAS = (0, 1, 2, 4, 5, 8)
SIN_FORMULA = ()


def _tabla():
    def construir():
        d = {}
        for f in reglas._tabla("stats-tabla.csv"):
            clave = (int(f["posicion"]), int(f["posicion_alt"]),
                     int(f["patron"]), int(f["rango"]))
            fila = {}
            for nivel in NIVELES_TABULADOS:
                vals = [f.get("lv%d_%s" % (nivel, c)) for c in CLAVES]
                fila[nivel] = ([int(v) for v in vals]
                               if all(v not in (None, "") for v in vals) else None)
            d[clave] = fila
        return d
    return O._indice("stats_tabla", construir)


def _claves():
    def construir():
        return {f["identidad"].upper(): (int(f["posicion"]), int(f["posicion_alt"]),
                                         int(f["patron"]), int(f["rango"]))
                for f in reglas._tabla("stats-clave.csv")}
    return O._indice("stats_clave", construir)


def _bonus_por_objeto():
    def construir():
        return {f["id"].upper(): [int(f.get(c) or 0) for c in CLAVES]
                for f in reglas._tabla("bonus-objeto.csv")}
    return O._indice("bonus", construir)


def base(identidad, nivel, rareza):
    """Los siete stats base ya multiplicados por la rareza, o None si no se sabe.

    La parte decimal **se corta, no se redondea**: 190 x 1,4 = 266 y
    179 x 1,4 = 250,6 -> 250, que es justo lo que ensena el juego.
    """
    clave = _claves().get("%08X" % identidad)
    if not clave:
        return None
    posicion, alt, patron, rango = clave
    if rareza == 8:
        rango = RANGO_DE_DIAMANTE
    tabla = _tabla()
    fila = tabla.get((posicion, alt, patron, rango))
    if not fila:
        return None
    if rareza in SIN_FORMULA:
        return None
    mult = MULTIPLICADOR.get(rareza, 1.0)
    conocidos = sorted(n for n in NIVELES_TABULADOS if fila.get(n))
    if not conocidos:
        return None

    def con_rareza(valores):
        return [int(v * mult) for v in valores]

    comun = {"rango": rango, "multiplicador": mult,
             "rareza_comprobada": rareza in RAREZAS_COMPROBADAS}
    if nivel in conocidos:
        return dict(comun, valores=con_rareza(fila[nivel]), exacto=True)
    antes = [n for n in conocidos if n <= nivel]
    despues = [n for n in conocidos if n >= nivel]
    if not antes:
        return dict(comun, valores=con_rareza(fila[despues[0]]), exacto=False)
    if not despues:
        return dict(comun, valores=con_rareza(fila[antes[-1]]), exacto=False)
    a, b = antes[-1], despues[0]
    va, vb = fila[a], fila[b]
    t = (nivel - a) / (b - a)
    crudo = [x + (y - x) * t for x, y in zip(va, vb)]
    return dict(comun, valores=[int(v * mult) for v in crudo], exacto=False)


def de_judias(plain, fila):
    """Cuanto suman las judias: +1 por judia al stat de su tipo."""
    import struct
    suma = [0] * 7
    off_tipo, _ = E._campo(plain, fila, J.F_JUDIA_TIPO)
    off_cant, _ = E._campo(plain, fila, J.F_JUDIA_CANT)
    for k in range(3):
        tipo = struct.unpack_from("<H", plain, off_tipo + 2 * k)[0]
        cant = struct.unpack_from("<H", plain, off_cant + 2 * k)[0]
        # el tipo de judia y la lista de stats no van en el mismo orden en los
        # dos ultimos (O-187): se pasa por el nombre
        if tipo in J.JUDIAS:
            suma[NOMBRES.index(J.JUDIAS[tipo])] += cant
    return suma


# --- el arbol de habilidades ---------------------------------------------
# Que casillas del mapa de 40 (NOTAS O-115) dan stat, cual de la lista y cuanto.
# El tronco y la rama 1 tiran de la lista de la posicion principal, la rama 2 de
# la secundaria. Los +3/+5/+7 estan medidos en las capturas de Aaron (O-112).
CASILLAS_ARBOL = [
    (5, "principal", 0, 3), (6, "principal", 1, 5),                    # tronco
    (9, "principal", 0, 3), (13, "principal", 1, 5), (15, "principal", 2, 7),   # rama 1
    (19, "secundaria", 0, 3), (23, "secundaria", 1, 5), (25, "secundaria", 2, 7),  # rama 2
]
# El arbol de los Idolos (5-7) y Diamantes (8) es otro: tienen tablero propio en
# `chara_param` (columna 10) y sus casillas no siguen la regla de la posicion.
RAREZAS_CON_ARBOL_CONOCIDO = (0, 1, 2, 3, 4)


def _listas_del_arbol():
    def construir():
        d = {}
        for f in reglas._tabla("arbol-stats.csv"):
            d[(f["lista"], int(f["posicion_codigo"]))] = [
                f.get("nivel1", ""), f.get("nivel2", ""), f.get("nivel3", ""),
                f.get("nivel4", "")]
        return d
    return O._indice("arbol_stats", construir)


def de_arbol(plain, fila):
    """Cuanto suma el arbol de habilidades, casilla a casilla.

    Devuelve (los siete sumandos, detalle, se_sabe). `se_sabe` es False para
    Idolos y Diamantes, cuyo tablero es otro y todavia no esta descifrado.
    """
    suma = [0] * 7
    detalle = []
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza not in RAREZAS_CON_ARBOL_CONOCIDO:
        return suma, detalle, False
    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    clave = _claves().get("%08X" % identidad)
    if not clave:
        return suma, detalle, False
    posicion, alt = clave[0], clave[1]
    try:
        off, n = E._campo(plain, fila, J.F_TABLERO)
    except E.Ilegal:
        return suma, detalle, False
    mapa = plain[off:off + n]
    listas = _listas_del_arbol()
    for casilla, lista, cual, cuanto in CASILLAS_ARBOL:
        if casilla >= len(mapa) or not mapa[casilla]:
            continue
        nombres = listas.get((lista, posicion if lista == "principal" else alt))
        if not nombres or not nombres[cual]:
            continue
        i = NOMBRES.index(nombres[cual])
        suma[i] += cuanto
        detalle.append({"casilla": casilla, "stat": nombres[cual], "suma": cuanto})
    return suma, detalle, True


def de_equipacion(plain, fila):
    """Cuanto suma lo que lleva puesto, y de que objeto viene cada suma."""
    suma = [0] * 7
    detalle = []
    porslot = inventario.por_slot(plain)
    bonus = _bonus_por_objeto()
    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    puesto, _ = J._campos_de(plain, equipos[fila], {h for h, _ in J.RANURAS_EQUIPO})
    for h, etiqueta in J.RANURAS_EQUIPO[:4]:
        v = int.from_bytes(puesto.get(h, b""), "little")
        f = porslot.get(v) if v else None
        b = bonus.get((f or {}).get("id", "")) if f else None
        if not b:
            continue
        for i in range(7):
            suma[i] += b[i]
        detalle.append({"ranura": etiqueta, "bonus": b})
    return suma, detalle


def de_jugador(plain, fila):
    """Los siete stats completos, con el desglose de donde sale cada numero."""
    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    b = base(identidad, nivel, rareza)
    if b is None:
        motivo = ("los Diamantes no siguen la misma cuenta que los demas y todavia "
                  "no se ha encontrado la suya, asi que prefiero no ensenar un "
                  "numero que estaria mal" if rareza in SIN_FORMULA
                  else "no tengo los stats base de ese personaje")
        return {"hay": False, "motivo": motivo}
    judias = de_judias(plain, fila)
    equipo, detalle = de_equipacion(plain, fila)
    arbol, detalle_arbol, arbol_sabido = de_arbol(plain, fila)
    total = [b["valores"][i] + judias[i] + equipo[i] + arbol[i] for i in range(7)]
    return {"hay": True, "exacto": b["exacto"], "nivel": nivel, "rango": b["rango"],
            "multiplicador": b["multiplicador"],
            "rareza_comprobada": b["rareza_comprobada"],
            "nombres": NOMBRES, "base": b["valores"], "judias": judias,
            "equipacion": equipo, "detalle_equipacion": detalle,
            "arbol": arbol, "detalle_arbol": detalle_arbol, "arbol_sabido": arbol_sabido,
            "total": total, "suma": sum(total)}
