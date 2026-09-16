#!/usr/bin/env python3
"""Lee la ficha completa de un jugador. SOLO LECTURA.

    py -m ievr.jugador PARTIDA 4566
    py -m ievr.jugador PARTIDA --con-equipacion     # lista los que llevan algo

La partida guarda un jugador repartido en varias tablas paralelas, todas
indexadas por el mismo numero de fila. Esto las junta.

Nada de lo que se lee aqui esta PROBADO en el sentido del CONTEXTO: no hemos
escrito ninguno de estos campos ni cargado el resultado en el juego. Es una
herramienta para mirar, no para editar.
"""
import argparse
import os
import struct
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import codec, memoria, reglas, tlv

F_SLOT = 0x918020D9
F_ID = 0x126F525E

# Arrays grandes, localizados por su cabecera (hash + longitud), nunca por offset.
ARRAY_NIVEL = (0x377173B1, 12000, "H", 2)
ARRAY_EXP = (0xAF047AD9, 24000, "I", 4)

# Tablas paralelas, una fila por jugador. Se localizan por el hash de su primer campo.
ANCLA_FICHA = (0xBB459017, 60)
ANCLA_EQUIPO = (0x14CF8197, 4)
ANCLA_TECNICAS = (0xAAC36512, 4)

# Identidad del personaje, una por jugador. Es la clave para el nombre.
ARRAY_IDENTIDAD = (0xBA162C11, 24000, "I", 4)
ARRAY_RAREZA = (0xE9835BD9, 24000, "I", 4)

# Las nueve rarezas del juego, en el orden de la pantalla de filtros.
# Los tres "Idolo" son las tres variantes de Hero (roja, plateada y rosa).
RAREZAS = {0: "Futbolista comun", 1: "Futbolista emergente", 2: "Futbolista de elite",
           3: "Futbolista estrella", 4: "Leyenda del futbol",
           5: "Idolo (roja)", 6: "Idolo (plateada)", 7: "Idolo (rosa)",
           8: "Diamante"}
# Lo que se puede subir jugando es solo dentro de los cinco primeros.
RAREZAS_NORMALES = (0, 1, 2, 3, 4)

RANURAS_EQUIPO = [
    (0x14CF8197, "1 botas"),
    (0x375EEC34, "2 brazalete"),
    (0x5E786ADF, "3 colgante"),
    (0x4C6B3FE3, "4 especial"),
    (0x3B0EB3DB, "5 sin usar"),
]
# Arquetipo: campo 0x8BA23AC3. El mapeo se comprobo con tres jugadores conocidos
# y ademas separando las pasivas de las ranuras 4-5, que son las que dependen del
# arquetipo. Ver NOTAS O-33.
F_ARQUETIPO = 0x8BA23AC3
ARQUETIPOS = {0: "Brecha", 1: "Contra", 2: "Afinidad",
              3: "Tension", 4: "Juego sucio", 5: "Justicia"}

F_PASIVAS = 0x66B81DAF          # 5 ids: las pasivas con las que salio el jugador
F_HEREDADAS = 0xB30A7BA1        # 5 ids: las heredadas; tapan a la normal de su ranura
# El arbol de habilidades. El mapa de casillas son 60 bytes con un 0/1 por
# casilla, y solo se usan las 40 primeras (NOTAS O-115):
#   0-7    tronco: lo que tiene siempre, pase lo que pase
#   8-17   rama 1: las tecnicas de las ranuras 4, 5 y 6
#   18-27  rama 2: las de las ranuras 7, 8 y 9
#   28-39  un tercer tramo, comun a las dos, sin identificar
# Y `F_RAMA` dice cual de las dos esta elegida: 0 la primera, 1 la segunda.
# La tabla de pasivas CON NUMERO: aparte de la ficha, la partida lleva una lista
# de 6000 x 5 registros (id de la pasiva en la version que se ensena, su numero
# como float, y una marca de desbloqueada). Es lo que el juego ensena y usa: a
# un Idolo o Diamante (ficha a cero) le pone aqui sus fijas, a un gerente o
# entrenador su juego de personal, a un normal la version de su rareza (NOTAS
# O-166). Cada registro mide 41 bytes y cada jugador 221.
F_TABLA_PASIVA = 0x5D2A9A7A
TABLA_PASIVA_REGISTRO = 41
TABLA_PASIVA_JUGADOR = 221
F_ARQUETIPO_DIAMANTE = 0x14CDA97F   # 1 byte x 6000; solo lo llevan los Diamantes (O-166)

F_TABLERO = 0xBB459017
F_RAMA = 0x72479F6E
TRAMO_TRONCO = (0, 8)
TRAMO_RAMA1 = (8, 18)
TRAMO_RAMA2 = (18, 28)
TRAMO_EXTRA = (28, 40)

F_JUDIA_TIPO = 0xEB265368       # 3 x u16, 0xFFFF = ranura vacia
F_JUDIA_CANT = 0xF90D22F5       # 3 x u16

# Los tipos de judia son los siete stats, en el mismo orden que las tablas de
# crecimiento. **Ya no es un supuesto**: el orden entero sale de cruzar la tabla
# de judias del juego con lo que hay en la partida de Aaron, y las cuatro
# posiciones cuadran a la vez sin contradecirse (NOTAS O-104). Ademas tiene
# sentido futbolistico: el delantero recibe Potencia, Control y Tecnica, y el
# portero Inteligencia, Fisico y Presion.
JUDIAS = {0: "Potencia", 1: "Control", 2: "Tecnica", 3: "Presion",
          4: "Fisico", 5: "Agilidad", 6: "Inteligencia"}

RANURAS_TECNICAS = [
    0xAAC36512, 0xDDC45584, 0x44CD043E, 0x33CA34A8, 0xADAEA10B,
    0xDAA9919D, 0x43A0C027, 0x34A7F0B1, 0xA418ED20,
]


def ocurrencias(plain, fhash, longitud):
    """Donde aparece esa cabecera. Se recuerda: recorre la partida entera."""
    def buscar():
        sig = struct.pack("<II", fhash, longitud)
        out, i = [], plain.find(sig)
        while i != -1:
            out.append(i)
            i = plain.find(sig, i + 1)
        return out
    return memoria.recordar(plain, ("ocurrencias", fhash, longitud), buscar)


def array(plain, definicion):
    """Localiza un array grande por su cabecera y lo devuelve desempaquetado."""
    return memoria.recordar(plain, ("array", definicion), lambda: _array(plain, definicion))


def _array(plain, definicion):
    fhash, nbytes, fmt, ancho = definicion
    pos = ocurrencias(plain, fhash, nbytes)
    if len(pos) != 1:
        raise ValueError("esperaba una sola cabecera %08X/%d, encontre %d"
                         % (fhash, nbytes, len(pos)))
    return struct.unpack_from("<%d%s" % (nbytes // ancho, fmt), plain, pos[0] + 8)


def tabla_pasivas_base(plain):
    """Donde empieza la tabla de pasivas con numero, o None si no esta."""
    occ = ocurrencias(plain, F_TABLA_PASIVA, 4)
    if len(occ) < 30000:
        return None
    base = occ[0]
    if occ[5] - base != TABLA_PASIVA_JUGADOR or occ[1] - base != TABLA_PASIVA_REGISTRO:
        return None
    return base


def pos_tabla_pasivas(plain, fila, ranura):
    """Offset del registro (ranura 0-4) de ese jugador en la tabla, o None."""
    base = tabla_pasivas_base(plain)
    if base is None:
        return None
    p = base + fila * TABLA_PASIVA_JUGADOR + ranura * TABLA_PASIVA_REGISTRO
    if plain[p:p + 4] != struct.pack("<I", F_TABLA_PASIVA):
        return None
    return p


def tabla_pasivas(plain, fila):
    """Las 5 pasivas con numero de ese jugador, como las ensena el juego:
    [{id, valor, marca}] (id como en la partida). [] si no hay tabla."""
    out = []
    for k in range(5):
        p = pos_tabla_pasivas(plain, fila, k)
        if p is None:
            return []
        out.append({"id": plain[p + 8:p + 12].hex().upper(),
                    "valor": struct.unpack_from("<f", plain, p + 20)[0],
                    "marca": plain[p + 32]})
    return out


def indice_por_slot(plain):
    """{valor del campo slot: (id_hex, offset del registro)}.

    La equipacion y las tecnicas no guardan el id del objeto: guardan el valor
    del campo `slot` de la fila concreta que el jugador posee. Esto deshace esa
    referencia.
    """
    idx = {}
    for off in ocurrencias(plain, F_SLOT, 4):
        campos = tlv.campos_desde(plain, off, maximo=6)
        if not campos:
            continue
        slot = int.from_bytes(campos[0][3], "little")
        for _, fh, _, datos in campos:
            if fh == F_ID and len(datos) == 4:
                idx.setdefault(slot, (datos.hex().upper(), off))
                break
    return idx


def _nombre(idx, valor):
    if not valor:
        return "vacio"
    ref = idx.get(valor)
    if ref is None:
        return "referencia 0x%08X (no encuentro la fila)" % valor
    idh, _ = ref
    n = tlv.nombres().get(idh)
    return "%s [%s]" % n if n else "id %s (sin nombre en las tablas)" % idh


def _campos_de(plain, off, quiero):
    ini, _ = tlv.inicio_registro(plain, off)
    out = {}
    for _, fh, _, datos in tlv.campos_desde(plain, ini, maximo=20):
        if fh in quiero:
            out[fh] = datos
    return out, ini


def leer(plain, fila, idx=None):
    """Junta todo lo que sabemos de la fila `fila`."""
    idx = idx if idx is not None else indice_por_slot(plain)
    niveles = array(plain, ARRAY_NIVEL)
    exps = array(plain, ARRAY_EXP)
    fichas = ocurrencias(plain, *ANCLA_FICHA)
    equipos = ocurrencias(plain, *ANCLA_EQUIPO)
    tecnicas = ocurrencias(plain, *ANCLA_TECNICAS)

    d = {"fila": fila,
         "nivel": niveles[fila] if fila < len(niveles) else None,
         "exp": exps[fila] if fila < len(exps) else None}

    eq, _ = _campos_de(plain, equipos[fila], {h for h, _ in RANURAS_EQUIPO})
    d["equipacion"] = [(etiqueta, _nombre(idx, int.from_bytes(eq.get(h, b""), "little")))
                       for h, etiqueta in RANURAS_EQUIPO]

    tc, _ = _campos_de(plain, tecnicas[fila], set(RANURAS_TECNICAS))
    d["tecnicas"] = [_nombre(idx, int.from_bytes(tc.get(h, b""), "little"))
                     for h in RANURAS_TECNICAS]

    v = array(plain, (F_ARQUETIPO, 6000, "B", 1))[fila]
    d["arquetipo"] = ARQUETIPOS.get(v, "valor %d, sin identificar" % v)
    d["identidad"] = array(plain, ARRAY_IDENTIDAD)[fila]
    d["nombre"], d["categoria"] = reglas.quien_es(d["identidad"])
    v = array(plain, ARRAY_RAREZA)[fila]
    d["rareza"] = RAREZAS.get(v, "valor %d, sin identificar" % v)
    d["rareza_valor"] = v

    fic, ini = _campos_de(plain, fichas[fila],
                          {0x7C27AEEC, 0x45E2D879, F_PASIVAS, F_HEREDADAS,
                           F_JUDIA_TIPO, F_JUDIA_CANT})
    d["ficha_off"] = ini
    d["nivel_copia"] = (fic.get(0x7C27AEEC) or bytes(1))[0]
    d["ranuras_9"] = fic.get(0x45E2D879, b"").hex()

    tipos = fic.get(F_JUDIA_TIPO, b"")
    cants = fic.get(F_JUDIA_CANT, b"")
    d["judias"] = []
    for k in range(3):
        t = int.from_bytes(tipos[2 * k:2 * k + 2], "little") if len(tipos) >= 2 * k + 2 else 0xFFFF
        c = int.from_bytes(cants[2 * k:2 * k + 2], "little") if len(cants) >= 2 * k + 2 else 0
        d["judias"].append(None if t == 0xFFFF else (JUDIAS.get(t, "tipo %d" % t), c))
    # El array va al reves que la pantalla del juego: la ranura 1 es la ultima.
    d["judias"].reverse()

    def _pas(datos):
        out = []
        for k in range(0, len(datos), 4):
            idh = datos[k:k + 4].hex().upper()
            if not int(idh, 16):
                out.append(None)
                continue
            n = tlv.nombres().get(idh)
            out.append((idh, n[0] if n else None,
                        reglas.clase_de_pasiva(idh) or "sin clasificar"))
        return out
    d["pasivas"] = _pas(fic.get(F_PASIVAS, b""))
    d["heredadas"] = _pas(fic.get(F_HEREDADAS, b""))
    return d


def imprimir(d):
    print("%s   (fila %d, ficha en 0x%07X)"
          % (d["nombre"] or "Jugador sin nombrar", d["fila"], d["ficha_off"]))
    print("  rareza: %s" % d["rareza"])
    if d["rareza_valor"] not in RAREZAS_NORMALES:
        print("  OJO: %s no es una rareza que se suba jugando; tiene reglas propias."
              % d["rareza"])
    print("  nivel %s     experiencia %s     arquetipo %s"
          % (d["nivel"], d["exp"], d["arquetipo"]))
    if d["nivel_copia"] != d["nivel"]:
        print("  AVISO: la copia del nivel en la ficha dice %d y el array dice %s."
              % (d["nivel_copia"], d["nivel"]))
    print("  equipacion:")
    for etiqueta, nombre in d["equipacion"]:
        print("     %-14s %s" % (etiqueta, nombre))
    print("  supertecnicas:")
    for i, nombre in enumerate(d["tecnicas"], 1):
        print("     %-14s %s" % ("ranura %d" % i, nombre))
    print("  judias:")
    for i, j in enumerate(d["judias"], 1):
        print("     ranura %d       %s" % (i, "vacia" if j is None else "%s x%d" % j))
    print("  pasivas   (una heredada TAPA a la normal de su misma ranura):")
    for i in range(5):
        normal = d["pasivas"][i] if i < len(d["pasivas"]) else None
        hered = d["heredadas"][i] if i < len(d["heredadas"]) else None
        activa = hered or normal
        if activa is None:
            print("     %d  vacia" % (i + 1))
            continue
        idh, nombre, clase = activa
        etiqueta = "HEREDADA" if hered else "normal  "
        print("     %d  %s [%-7s] %s" % (i + 1, etiqueta, clase, nombre or ("id " + idh)))
        if hered and normal:
            print("        (tapa a: %s)" % (normal[1] or normal[0]))
    n_her = sum(1 for h in d["heredadas"] if h)
    if n_her > 2:
        print("     AVISO: %d heredadas. El tope legal son 2." % n_her)
    print("  nueve ranuras de la ficha: %s" % d["ranuras_9"])


def _consola_utf8():
    """La consola de Windows llega en cp1252 y destroza los acentos."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv=None):
    _consola_utf8()
    ap = argparse.ArgumentParser(description="Lee la ficha de un jugador. Solo lectura.")
    ap.add_argument("partida")
    ap.add_argument("fila", nargs="?", type=int)
    ap.add_argument("--con-equipacion", action="store_true",
                    help="lista las filas que llevan algo equipado")
    a = ap.parse_args(argv)

    ruta = a.partida
    if os.path.isdir(ruta):
        from ievr.escribir import partida_en
        ruta = os.path.join(ruta, partida_en(ruta) or "002AB8F4-USERDATALIVE")
    plain = codec.load(ruta)

    if a.con_equipacion:
        idx = indice_por_slot(plain)
        equipos = ocurrencias(plain, *ANCLA_EQUIPO)
        niveles = array(plain, ARRAY_NIVEL)
        identidades = array(plain, ARRAY_IDENTIDAD)
        hashes = {h for h, _ in RANURAS_EQUIPO}
        for fila, off in enumerate(equipos):
            eq, _ = _campos_de(plain, off, hashes)
            puestos = [(e, v) for (h, e) in RANURAS_EQUIPO
                       for v in [int.from_bytes(eq.get(h, b""), "little")] if v]
            if puestos:
                quien, _ = reglas.quien_es(identidades[fila])
                print("fila %-5d %-22s nivel %-3s  %s"
                      % (fila, (quien or "?")[:22],
                         niveles[fila] if fila < len(niveles) else "?",
                         ", ".join(_nombre(idx, v) for _, v in puestos)))
        return 0

    if a.fila is None:
        ap.error("dime que fila quieres, o usa --con-equipacion")
    imprimir(leer(plain, a.fila))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
