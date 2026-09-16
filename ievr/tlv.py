#!/usr/bin/env python3
"""Lector de registros del save.

El save es una sucesion de campos autodescriptivos:

    [u32 hash-del-campo LE][u32 longitud LE][datos...]

No hay contador de registros ni marca de fin. Un registro es una cadena de
campos seguidos; se acaba cuando la "longitud" del siguiente deja de ser
plausible. Todo se direcciona por hash de campo, nunca por offset fijo.
"""
import os
import struct

MAX_FIELD_LEN = 64

# Campos ya identificados. Fuente: referencia/editor-ref/NOTES.md.
CAMPOS = {
    0x126F525E: "id de entidad",
    0x918020D9: "slot (dos contadores correlativos)",
    0x90F47C83: "serie de adquisicion",
    0x047E2314: "kind",
    0xD1F4EB9A: "sub (2 = copia en la mochila)",
    0x8F824DAE: "cantidad en mochila / celdas de rareza",
    0xEDC3670F: "cantidad equipada",
    0x127CB52F: "u8 sin identificar",
    0x5C9EBB5E: "marca de fila de objeto",
    0x67C548C1: "marca de fila de judia",
    0xBA162C11: "array de plantilla",
    0x04FB11DF: "indice de catalogo del personaje",
    0xF9A1342D: "chara_base_id",
    0x856BEB74: "celdas de rareza (recicladas)",
    0x05ACD148: "contador pequeno sin identificar",
    0x1FE0EA22: "u16, siempre 0 hasta ahora",
    0xBB459017: "ancla de ficha de jugador (60 bytes)",
    0x7C27AEEC: "nivel del jugador",
    0x3CAEA0BD: "ficha de jugador, bloque de 30 bytes (A)",
    0x38AFC2B8: "ficha de jugador, bloque de 30 bytes (B)",
    0x45E2D879: "ficha de jugador, 9 ranuras (ff = vacia)",
    0x66B81DAF: "pasivas normales del jugador (5 ids)",
    0xB30A7BA1: "pasivas heredadas (5 ids); tapan a la normal de su ranura",
    0xEB265368: "judias: tipo de cada ranura (3 x u16, ffff = vacia)",
    0xF90D22F5: "judias: cantidad de cada ranura (3 x u16)",
    0x8BA23AC3: "arquetipo (0 Brecha, 1 Contra, 2 Afinidad, 3 Tension, 4 Juego sucio, 5 Justicia)",
    0x377173B1: "array de nivel (6000 x u16)",
    0xAF047AD9: "array de experiencia (6000 x u32)",
    # Tabla de equipacion: 6048 filas en paralelo con las fichas de jugador.
    0x14CF8197: "equipacion: ranura 1, botas",
    0x375EEC34: "equipacion: ranura 2",
    0x5E786ADF: "equipacion: ranura 3",
    0x4C6B3FE3: "equipacion: ranura 4",
    0x3B0EB3DB: "equipacion: ranura 5 (sin usar en esta partida)",
    0x3A0D9419: "plantilla de equipo: referencia a un personaje",
    # Sello del guardado. Cambian solos cada vez que guardas: son ruido.
    0x9AB367EA: "guardado: ano",
    0x76F58F7B: "guardado: mes",
    0x604041A4: "guardado: dia",
    0x512F0593: "guardado: hora",
    0x408EE5AB: "guardado: minuto",
    0x98535F77: "guardado: segundo",
    0x77BFE5E1: "guardado: dia de la semana (0 = lunes)",
    0x0877F0CD: "guardado: fecha y hora empaquetadas (8 bytes)",
    0x3A40C52C: "tiempo jugado en segundos",
    0x64916694: "tiempo jugado en segundos (copia)",
}

F_ID = 0x126F525E


def nombre_campo(fhash):
    return CAMPOS.get(fhash, "sin identificar")


def _u32(plain, off):
    return struct.unpack_from("<I", plain, off)[0]


def cabecera(plain, off):
    """(hash, longitud) si en `off` hay una cabecera de campo plausible, si no None."""
    if off < 0 or off + 8 > len(plain):
        return None
    fhash, n = struct.unpack_from("<II", plain, off)
    if not (1 <= n <= MAX_FIELD_LEN) or off + 8 + n > len(plain):
        return None
    return fhash, n


def campos_desde(plain, off, maximo=64):
    """Recorre campos hacia delante desde `off` mientras la cadena sea valida."""
    out = []
    while len(out) < maximo:
        h = cabecera(plain, off)
        if h is None:
            break
        fhash, n = h
        out.append((off, fhash, n, bytes(plain[off + 8:off + 8 + n])))
        off += 8 + n
    return out


def campo_anterior(plain, off):
    """Offset de la cabecera del campo que termina justo en `off`, o None."""
    for n in range(1, MAX_FIELD_LEN + 1):
        p = off - 8 - n
        if p < 0:
            return None
        if p + 4 + 4 <= len(plain) and _u32(plain, p + 4) == n:
            return p
    return None


def inicio_registro(plain, off, maximo=64):
    """Retrocede por la cadena de campos hasta donde deja de encadenar."""
    pasos = 0
    while pasos < maximo:
        p = campo_anterior(plain, off)
        if p is None:
            break
        off = p
        pasos += 1
    return off, pasos


def localizar(plain, byte_off):
    """Que campo contiene el byte `byte_off`.

    Devuelve dict con offset del campo, hash, longitud, posicion dentro del
    campo e inicio del registro; o None si ese byte no cae dentro de ningun
    campo reconocible (cabecera del fichero, relleno, zona no TLV).
    """
    mejor = None
    for h in range(max(0, byte_off - 8 - MAX_FIELD_LEN + 1), byte_off - 8 + 1):
        c = cabecera(plain, h)
        if c is None:
            continue
        fhash, n = c
        if not (h + 8 <= byte_off < h + 8 + n):
            continue
        ini, pasos = inicio_registro(plain, h)
        cand = (pasos, h, fhash, n, ini)
        if mejor is None or cand[0] > mejor[0]:
            mejor = cand
    if mejor is None:
        return None
    pasos, h, fhash, n, ini = mejor
    return {
        "campo_off": h,
        "hash": fhash,
        "longitud": n,
        "pos_en_campo": byte_off - (h + 8),
        "registro_off": ini,
        "profundidad": pasos,
    }


VENTANA_ANCLA = 1 << 14


def ancla_cercana(plain, byte_off, ventana=VENTANA_ANCLA, minimo=3):
    """El registro reconocible mas cercano ANTES de `byte_off`.

    Para bytes que caen en zonas que no sabemos leer. No afirma que el byte
    pertenezca a ese registro: solo dice "lo mas cercano que entiendo esta aqui",
    que es lo que hace falta para orientarse. Devuelve (offset, campos) o None.

    `minimo` es cuantos campos seguidos tienen que encadenar para fiarnos: con
    tres, la probabilidad de que sea casualidad es despreciable.
    """
    tope = max(0, byte_off - ventana)
    for h in range(byte_off - 8, tope - 1, -1):
        c = campos_desde(plain, h, maximo=minimo + 2)
        if len(c) >= minimo and c[0][1] != 0:
            return h, c
    return None


def como_numero(datos):
    """Interpreta los datos de un campo como entero sin signo, si tiene pinta."""
    if len(datos) in (1, 2, 4, 8):
        return int.from_bytes(datos, "little")
    return None


# --- nombres (opcional, de referencia/editor-ref/*.csv) ----------------------

_RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REF = os.path.join(_RAIZ, "referencia", "editor-ref")
_NOMBRES = None
_PERSONAJES = None


def _leer_csv(ruta):
    """Lee un csv ignorando las lineas de comentario que empiezan por #."""
    import csv
    try:
        with open(ruta, newline="", encoding="utf-8") as fh:
            lineas = [l for l in fh if not l.lstrip().startswith("#")]
    except OSError:
        return []
    return list(csv.DictReader(lineas))


_NOMBRES_ES = os.path.join(_RAIZ, "datos", "reglas-extraidas", "nombres-es.csv")


def nombres():
    """{id_hex: (nombre, categoria)}.

    Dos fuentes, y el orden importa:

    1. `referencia/editor-ref/names.csv`, compilado de volcados de terceros y en
       ingles. Es el unico que trae objetos, asi que se carga primero.
    2. `datos/reglas-extraidas/nombres-es.csv`, sacado de los ficheros del propio
       juego y en espanol. Se carga encima porque es la fuente buena: sale del
       juego que tiene instalado Aaron, no de un volcado de otra version.
    """
    global _NOMBRES
    if _NOMBRES is None:
        _NOMBRES = {}
        for fila in _leer_csv(os.path.join(_REF, "names.csv")):
            idh = (fila.get("id") or "").strip().upper()
            if idh:
                _NOMBRES[idh] = (fila.get("name", ""), fila.get("category", ""))
        for fila in _leer_csv(_NOMBRES_ES):
            idh = (fila.get("id") or "").strip().upper()
            nombre = (fila.get("nombre_es") or fila.get("nombre_en") or "").strip()
            if idh and nombre:
                # La categoria fina de names.csv (Shot, Goalkeep...) se conserva
                # si la habia: distingue mas que la nuestra.
                anterior = _NOMBRES.get(idh)
                cat = anterior[1] if anterior and anterior[1] else fila.get("categoria", "")
                _NOMBRES[idh] = (nombre, cat)
    return _NOMBRES


def personajes():
    """{indice_de_catalogo: nombre} o {} si no esta el csv de referencia."""
    global _PERSONAJES
    if _PERSONAJES is None:
        _PERSONAJES = {}
        for fila in _leer_csv(os.path.join(_REF, "characters.csv")):
            try:
                _PERSONAJES[int(fila["index"])] = fila.get("name", "")
            except (KeyError, TypeError, ValueError):
                pass
    return _PERSONAJES


def nombre_entidad(plain, registro_off):
    """(id_hex, nombre, categoria) del registro que empieza en `registro_off`."""
    for _, fhash, _, datos in campos_desde(plain, registro_off, maximo=24):
        if fhash == F_ID and len(datos) == 4:
            idh = datos.hex().upper()
            n = nombres().get(idh)
            return idh, (n[0] if n else None), (n[1] if n else None)
    return None, None, None


def etiqueta_registro(plain, registro_off):
    """Una linea que identifique el registro: nombre de objeto o de personaje."""
    idh, nombre, cat = nombre_entidad(plain, registro_off)
    if nombre:
        return "%s [%s] (id %s)" % (nombre, cat, idh)
    for _, fhash, _, datos in campos_desde(plain, registro_off, maximo=24):
        if fhash == 0x04FB11DF and len(datos) == 4:
            idx = int.from_bytes(datos, "little")
            quien = personajes().get(idx)
            if quien:
                return "personaje %s (indice de catalogo %d)" % (quien, idx)
            return "personaje sin nombrar (indice de catalogo %d)" % idx
    if idh:
        return "id %s (sin nombre en las tablas)" % idh
    return "registro sin id"
