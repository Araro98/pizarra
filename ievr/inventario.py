#!/usr/bin/env python3
"""Lo que el jugador POSEE: objetos y supertecnicas, y como se referencian.

Ni la equipacion ni las supertecnicas guardan el id de lo que llevas: guardan el
valor del campo `slot` (`0x918020D9`) de **la fila concreta que posees** (NOTAS
O-19). Este modulo traduce en las dos direcciones.

Consecuencia que conviene tener presente: **no se puede equipar algo que no se
tenga**, porque no hay ninguna fila a la que apuntar. Parte de la legalidad la
impone el propio formato.
"""
import struct

from ievr import memoria, tlv

F_SLOT = 0x918020D9
F_ID = 0x126F525E
F_SERIE = 0x90F47C83
F_KIND = 0x047E2314
F_SUB = 0xD1F4EB9A
F_CANT = 0x8F824DAE
F_EQUIPADA = 0xEDC3670F

SUB_EN_MOCHILA = 2      # ver NOTAS O-05
KIND_REAL = 3           # ver NOTAS O-61: esto es lo que marca "esta fila cuenta"


def _ocurrencias(plain, fhash, longitud):
    sig = struct.pack("<II", fhash, longitud)
    out, i = [], plain.find(sig)
    while i != -1:
        out.append(i)
        i = plain.find(sig, i + 1)
    return out


def todas_las_filas(plain):
    """[datos] de TODAS las filas con campo `slot`. Se recuerda por partida."""
    return memoria.recordar(plain, "filas", lambda: _todas_las_filas(plain))


def _todas_las_filas(plain):
    """[datos] de TODAS las filas con campo `slot`, se posean o no.

    Hace falta para **deshacer una referencia**: lo que un jugador lleva equipado
    puede apuntar a una fila que no es una copia de la mochila (`sub != 2`), y si
    solo se miran las poseidas esa referencia se lee como "vacia".
    """
    fuera = []
    for off in _ocurrencias(plain, F_SLOT, 4):
        campos = tlv.campos_desde(plain, off, maximo=8)
        if not campos:
            continue
        datos = {"slot_off": off, "slot": int.from_bytes(campos[0][3], "little")}
        for o, fh, n, d in campos:
            if fh == F_ID and n == 4:
                datos["id"] = d.hex().upper()
                datos["id_off"] = o + 8
            elif fh == F_SERIE and n == 4:
                datos["serie"] = int.from_bytes(d, "little")
                datos["serie_off"] = o + 8
            elif fh == F_KIND and n == 1:
                datos["kind"] = d[0]
                datos["kind_off"] = o + 8
            elif fh == F_SUB and n == 1:
                datos["sub"] = d[0]
                datos["sub_off"] = o + 8
            elif fh == F_CANT and n == 4:
                datos["cantidad"] = int.from_bytes(d, "little")
                datos["cantidad_off"] = o + 8
            elif fh == F_EQUIPADA and n == 4:
                datos["equipada_off"] = o + 8
                datos["equipada"] = int.from_bytes(d, "little")
        if "id" in datos:
            fuera.append(datos)
    return fuera


def filas_poseidas(plain):
    return memoria.recordar(plain, "poseidas", lambda: _filas_poseidas(plain))


def _filas_poseidas(plain):
    """{id_hex: [filas que el jugador POSEE]}.

    Lo que marca que una fila cuenta es `kind == 3`, no `sub == 2` (NOTAS O-61).
    Se creyo mucho tiempo que era `sub`, y era falso: en la partida de Aaron las
    "Botas desafiantes" tienen `sub = 1` y sin embargo las llevan puestas dos
    jugadores. Filtrar por `sub` dejaba fuera 241 filas que si se poseen, y el
    editor se negaba a equipar cosas que el jugador tenia.
    """
    fuera = {}
    for f in todas_las_filas(plain):
        if f.get("kind") == KIND_REAL and f["slot"] != 0:
            fuera.setdefault(f["id"], []).append(f)
    return fuera


# --- como se numeran las filas -------------------------------------------------
#
# El campo `slot` no es un contador suelto: es una direccion compuesta, y se
# puede reconstruir entera. Comprobado contra las 2.053 filas usadas de la
# partida de Aaron, sin una sola excepcion (NOTAS O-62):
#
#     slot = ((pos + 1) << 18) | (clase << 16) | (tipo << 13) | pos
#
# `pos` es el numero de fila DENTRO de su bloque, `tipo` que clase de cosa
# guarda el bloque y `clase` separa los objetos (0) de lo que se aprende (1).
# Importa porque una fila nueva con `slot = 0` el juego no la sabe nombrar: la
# equipacion apunta a las filas por este numero, no por el objeto.

MASCARA_POS = 0x1FFF


def descomponer_slot(slot):
    """(clase, tipo, pos) a partir del numero de una fila."""
    return (slot >> 16) & 3, (slot >> 13) & 7, slot & MASCARA_POS


def componer_slot(clase, tipo, pos):
    """El numero que le toca a la fila `pos` del bloque (clase, tipo)."""
    if not 0 <= pos <= MASCARA_POS:
        raise ValueError("posicion fuera del bloque")
    return ((pos + 1) << 18) | (clase << 16) | (tipo << 13) | pos


def bloques(plain):
    """Los bloques del inventario, sacados de la propia partida.

    Cada tipo de cosa vive en un tramo contiguo de tamano fijo, y las filas
    libres van al final de su tramo. Los limites no se adivinan: se deducen de
    los `slot` que ya hay, porque cada fila dice en que posicion de su bloque
    esta. El principio del bloque es `indice - pos`, y acaba donde empieza el
    siguiente.

    Devuelve [{clase, tipo, principio, fin, filas}] ordenado por posicion, donde
    `fin` es el indice de la primera fila que YA NO es del bloque.
    """
    filas = sorted(todas_las_filas(plain), key=lambda f: f["slot_off"])
    principios = {}
    for i, f in enumerate(filas):
        if f["slot"] == 0:
            continue
        clase, tipo, pos = descomponer_slot(f["slot"])
        principios.setdefault((clase, tipo), i - pos)

    orden = sorted(principios.items(), key=lambda kv: kv[1])
    fuera = []
    for j, ((clase, tipo), principio) in enumerate(orden):
        fin = orden[j + 1][1] if j + 1 < len(orden) else len(filas)
        fuera.append({"clase": clase, "tipo": tipo, "principio": principio,
                      "fin": fin, "filas": filas[principio:fin]})
    return fuera


def bloque_con(plain, ids_hermanos):
    """El bloque donde viven esos objetos, y cuantas de sus filas son de ellos.

    `ids_hermanos` es el catalogo entero de ese tipo de objeto segun el juego
    (todas las botas, por ejemplo). Se busca el bloque que mas filas suyas
    contenga: asi un objeto que no se tiene todavia hereda el sitio de sus
    hermanos, que es la unica forma de saber donde va.

    Devuelve None si ninguna fila de la partida es de ese catalogo. Entonces no
    se escribe: una fila fuera de su bloque el juego la ignora en silencio
    (NOTAS O-08).
    """
    mejor, mejor_n = None, 0
    for b in bloques(plain):
        n = sum(1 for f in b["filas"] if f.get("id") in ids_hermanos)
        if n > mejor_n:
            mejor, mejor_n = b, n
    return mejor


def por_slot(plain):
    return memoria.recordar(plain, "por_slot", lambda: _por_slot(plain))


def _por_slot(plain):
    """{valor de slot: fila}, para deshacer una referencia.

    Indexa **todas** las filas, no solo las poseidas: si no, lo que un jugador
    lleva puesto desde una fila ajena se leeria como vacio.
    """
    return {f["slot"]: f for f in todas_las_filas(plain)}


def ajustar_equipada(plain, fila, delta):
    """Suma `delta` al contador de "cuantos jugadores lo llevan puesto".

    Es el campo `0xEDC3670F`, y el juego lo mantiene: al equipar unas botas subio
    de 7 a 8 y al quitarlas volvio a 7 (NOTAS O-12). Si no se toca, la partida
    queda incoherente con lo que ensena la ficha del objeto.
    """
    if "equipada_off" not in fila:
        return plain
    nuevo = max(0, fila["equipada"] + delta)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, fila["equipada_off"], nuevo)
    return bytes(buf)
