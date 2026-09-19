#!/usr/bin/env python3
"""Escritura de campos en la partida. Con copia de seguridad, siempre.

    py -m ievr.escribir ORIGEN CARPETA_DESTINO --judias 4566:1=3

Reglas que cumple este modulo, y que no son negociables:

1. **Nunca escribe encima del original.** Escribe en una carpeta distinta, y si
   alli ya hay un fichero, primero lo copia a `.bak`.
2. **El nombre del fichero no cambia jamas.** Es la clave de cifrado.
3. **Valida antes de escribir.** Si la validacion no pasa, no se escribe nada:
   ni el campo que falla ni los demas.
4. **Solo toca campos que se han localizado comparando partidas.** Cada uno con
   su entrada en NOTAS.

Sobre el estado de cada campo: hasta que un campo se escribe Y Aaron confirma el
resultado dentro del juego, es OBSERVADO y su docstring lo dice. Todas las
operaciones que hay ahora mismo estan confirmadas dentro del juego.
"""
import argparse
import os
import re
import shutil
import struct
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import codec, inventario, jugador as J, reglas, tlv

NOMBRE_SAVE = "002AB8F4-USERDATALIVE"      # la de Aaron; las demas siguen el mismo patron
PATRON_SAVE = re.compile(r"^[0-9A-Fa-f]{8}-USERDATALIVE$")


def es_partida(nombre):
    """Si un nombre de fichero es el de una partida (8 hexadecimales + sufijo).
    Los 8 hexadecimales cambian con cada cuenta de Steam (NOTAS O-158)."""
    return bool(PATRON_SAVE.match(os.path.basename(nombre or "")))


def partida_en(carpeta):
    """El nombre del fichero de partida que hay en esa carpeta, o None."""
    try:
        nombres = sorted(n for n in os.listdir(carpeta) if es_partida(n))
    except OSError:
        return None
    return nombres[0] if nombres else None

# Topes de judias por nivel. Medidos por Aaron dentro del juego, ver
# datos/reglas-del-jugador/judias.md. Entre dos puntos medidos se interpola en
# linea recta, y eso es una SUPOSICION: por eso el tope se redondea hacia abajo.
TOPES_JUDIAS = [(10, 2), (50, 82), (99, 180)]
NIVEL_MINIMO_JUDIAS = 10


def tope_judias(nivel):
    """Cuantas judias caben en una ranura a ese nivel. 0 si aun no estan abiertas."""
    if nivel < NIVEL_MINIMO_JUDIAS:
        return 0
    if nivel >= TOPES_JUDIAS[-1][0]:
        return TOPES_JUDIAS[-1][1]
    for (n1, t1), (n2, t2) in zip(TOPES_JUDIAS, TOPES_JUDIAS[1:]):
        if n1 <= nivel <= n2:
            return t1 + (t2 - t1) * (nivel - n1) // (n2 - n1)
    return 0


class Ilegal(Exception):
    """La operacion no es alcanzable jugando. No se escribe nada."""


def _campo(plain, fila, fhash):
    """(offset de los datos, longitud) de un campo de la ficha de un jugador."""
    from ievr import tlv
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    ini, _ = tlv.inicio_registro(plain, fichas[fila])
    for off, fh, n, _ in tlv.campos_desde(plain, ini, maximo=20):
        if fh == fhash:
            return off + 8, n
    raise Ilegal("la ficha %d no tiene el campo %08X" % (fila, fhash))


def poner_judias(plain, fila, ranura, cantidad):
    """Cambia cuantas judias hay en una ranura. Probado en el juego (NOTAS P-05).

    `ranura` es 1, 2 o 3 tal y como se ven en la pantalla del juego. El fichero
    las guarda al reves, y de eso se encarga esta funcion.
    """
    if ranura not in (1, 2, 3):
        raise Ilegal("la ranura tiene que ser 1, 2 o 3; me has dado %r" % ranura)
    if cantidad < 0:
        raise Ilegal("la cantidad no puede ser negativa")

    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    tope = tope_judias(nivel)
    if tope == 0:
        raise Ilegal("el jugador de la fila %d es de nivel %d y las judias se "
                     "desbloquean al nivel %d" % (fila, nivel, NIVEL_MINIMO_JUDIAS))
    if cantidad > tope:
        raise Ilegal("a nivel %d el tope por ranura es %d judias, y pides %d"
                     % (nivel, tope, cantidad))

    off_tipo, _ = _campo(plain, fila, J.F_JUDIA_TIPO)
    off_cant, _ = _campo(plain, fila, J.F_JUDIA_CANT)
    k = 3 - ranura  # la ranura 1 de la pantalla es la ultima del array

    tipo = struct.unpack_from("<H", plain, off_tipo + 2 * k)[0]
    if tipo == 0xFFFF:
        raise Ilegal("la ranura %d de ese jugador esta vacia: no hay ningun tipo "
                     "de judia puesto, asi que no se le puede cambiar la cantidad"
                     % ranura)

    antes = struct.unpack_from("<H", plain, off_cant + 2 * k)[0]
    buf = bytearray(plain)
    struct.pack_into("<H", buf, off_cant + 2 * k, cantidad)
    return bytes(buf), {"fila": fila, "ranura": ranura, "nivel": nivel,
                        "tope": tope, "tipo": J.JUDIAS.get(tipo, "tipo %d" % tipo),
                        "antes": antes, "despues": cantidad,
                        "offset": off_cant + 2 * k}


# --- tipo de judia -----------------------------------------------------------

def poner_tipo_judia(plain, fila, ranura, tipo, cantidad):
    """Pone un tipo de judia en una ranura, con su cantidad. Probado en el juego (NOTAS P-06).

    Reglas de datos/reglas-del-jugador/judias.md: tres ranuras, tipo libre, pero
    nunca dos ranuras con el mismo tipo, y el tope lo manda el nivel.
    """
    if ranura not in (1, 2, 3):
        raise Ilegal("la ranura tiene que ser 1, 2 o 3")
    nombres = {v.split(" ")[0].lower(): k for k, v in J.JUDIAS.items()}
    if isinstance(tipo, str):
        if tipo.lower() not in nombres:
            raise Ilegal("no conozco la judia %r. Las que valen: %s"
                         % (tipo, ", ".join(sorted(nombres))))
        tipo = nombres[tipo.lower()]

    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    tope = tope_judias(nivel)
    if tope == 0:
        raise Ilegal("nivel %d: las judias se desbloquean al %d"
                     % (nivel, NIVEL_MINIMO_JUDIAS))
    if not 0 < cantidad <= tope:
        raise Ilegal("a nivel %d el tope por ranura es %d judias, y pides %d"
                     % (nivel, tope, cantidad))

    off_tipo, _ = _campo(plain, fila, J.F_JUDIA_TIPO)
    off_cant, _ = _campo(plain, fila, J.F_JUDIA_CANT)
    k = 3 - ranura
    for otra in range(3):
        if otra != k and struct.unpack_from("<H", plain, off_tipo + 2 * otra)[0] == tipo:
            raise Ilegal("ese jugador ya lleva %s en otra ranura, y no se puede "
                         "repetir tipo" % J.JUDIAS.get(tipo, tipo))

    antes = struct.unpack_from("<H", plain, off_tipo + 2 * k)[0]
    buf = bytearray(plain)
    struct.pack_into("<H", buf, off_tipo + 2 * k, tipo)
    struct.pack_into("<H", buf, off_cant + 2 * k, cantidad)
    return bytes(buf), {"fila": fila, "ranura": ranura, "nivel": nivel, "tope": tope,
                        "antes": "vacia" if antes == 0xFFFF else J.JUDIAS.get(antes, antes),
                        "despues": "%s x%d" % (J.JUDIAS.get(tipo, tipo), cantidad)}


# --- arquetipo ---------------------------------------------------------------

def _pareja_de_pasivas(plain, arquetipo, evitar_fila):
    """Las pasivas 4 y 5 de un jugador real que ya tenga ese arquetipo.

    Copiarlas de alguien que existe garantiza que la pareja es una que el juego
    produce. Inventarsela no lo garantizaria.
    """
    arqs = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    niveles = J.array(plain, J.ARRAY_NIVEL)
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    for f in range(6000):
        if f == evitar_fila or arqs[f] != arquetipo or niveles[f] <= 1:
            continue
        c, _ = J._campos_de(plain, fichas[f], {J.F_PASIVAS})
        d = c.get(J.F_PASIVAS, b"")
        if len(d) == 20 and any(d[12:20]):
            return d[12:20], f
    raise Ilegal("no hay en tu partida ningun jugador de ese arquetipo del que "
                 "copiar unas pasivas que existan de verdad")


def poner_arquetipo(plain, fila, arquetipo):
    """Cambia el arquetipo Y las pasivas 4 y 5, que dependen de el. Probado en el juego (NOTAS P-06).

    Escribir solo el byte del arquetipo dejaria un jugador con pasivas de otro
    arquetipo, y eso el juego no lo produce nunca. Por eso van juntos.
    """
    nombres = {v.lower(): k for k, v in J.ARQUETIPOS.items()}
    if isinstance(arquetipo, str):
        if arquetipo.lower() not in nombres:
            raise Ilegal("no conozco el arquetipo %r. Los que hay: %s"
                         % (arquetipo, ", ".join(J.ARQUETIPOS.values())))
        arquetipo = nombres[arquetipo.lower()]

    arqs = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    actual = arqs[fila]
    if actual not in J.ARQUETIPOS:
        raise Ilegal("ese jugador tiene el arquetipo con valor %d, que no es "
                     "ninguno de los seis. Sospechamos que son los Hero y los "
                     "Fabled, que van por otras reglas. No lo toco." % actual)
    if actual == arquetipo:
        raise Ilegal("ya es de ese arquetipo")

    pasivas, donante = _pareja_de_pasivas(plain, arquetipo, fila)
    pos = J.ocurrencias(plain, J.F_ARQUETIPO, 6000)[0] + 8
    off_pas, n = _campo(plain, fila, J.F_PASIVAS)
    if n != 20:
        raise Ilegal("el campo de pasivas de esa ficha mide %d bytes, no 20" % n)

    buf = bytearray(plain)
    buf[pos + fila] = arquetipo
    buf[off_pas + 12:off_pas + 20] = pasivas
    return bytes(buf), {
        "fila": fila,
        "antes": J.ARQUETIPOS[actual], "despues": J.ARQUETIPOS[arquetipo],
        "donante": donante,
        "pasivas": [tlv.nombres().get(pasivas[i:i + 4].hex().upper(), ("?",))[0]
                    for i in (0, 4)],
    }


# --- equipacion y supertecnicas ------------------------------------------------

# Que categoria de `nombres-es.csv` admite cada ranura de equipacion.
CATEGORIA_RANURA = {1: "equipo-1-botas", 2: "equipo-2-brazalete",
                    3: "equipo-3-colgante", 4: "equipo-4-especial"}


def _limpio_nombre(texto):
    """Un nombre para ensenarlo: sin los marcadores del juego pero con sus
    mayusculas ("Talisman de <FLC:ENDO>" -> "Talisman de Evans"), NOTAS O-187."""
    from ievr import opciones as O
    return O._limpio(texto)


def _sin_marcadores(texto):
    """Quita los marcadores de plantilla del juego para poder comparar nombres.

    El juego guarda las pasivas como `PP del equipo [CPASSIVE01]+<VALUE> %[C]`:
    `[CPASSIVE01]` es el hueco del icono, `<VALUE>` el numero que depende de la
    rareza y `[C]` cierra el color. Nadie escribe eso a mano.
    """
    t = (texto or "").replace("[CPASSIVE01]", "").replace("[C]", "")
    t = t.replace("<VALUE>", "").replace("%", "")
    # El salto de linea llega escapado una o dos veces segun por donde pase el
    # texto: se quitan las barras y la "n" que las acompana.
    while chr(92) in t:
        t = t.replace(chr(92) + chr(92), chr(92))
        t = t.replace(chr(92) + "n", " ")
        t = t.replace(chr(92), " ")
    return " ".join(t.lower().replace("+", " ").replace("-", " ").split())


# Como llama Aaron a cada categoria, para poder escribir "espiritu:Baihu" cuando
# un mismo nombre existe en dos sitios. "Espiritu" es como el juego llama en
# espanol a lo que los ficheros llaman `aura`.
APODOS_CATEGORIA = {
    "espiritu": "aura", "espiritus": "aura", "aura": "aura",
    "tecnica": "supertecnica", "supertecnica": "supertecnica",
    "botas": "equipo-1-botas", "brazalete": "equipo-2-brazalete",
    "colgante": "equipo-3-colgante", "especial": "equipo-4-especial",
    "consumible": "consumible", "objeto": "consumible", "tactica": "tactica",
}


def _buscar_por_nombre(texto, categorias):
    """El id de lo que se llame asi dentro de esas categorias. Exige que sea unico.

    Admite "categoria:nombre" para cuando el nombre existe en dos sitios: hay
    cosas que se llaman igual siendo un espiritu y una supertecnica.
    """
    texto = texto.strip()
    if len(texto) == 8 and all(c in "0123456789abcdefABCDEF" for c in texto):
        for f in reglas._tabla("nombres-es.csv"):
            if f["id"].upper() == texto.upper() and f.get("categoria") in categorias:
                return texto.upper()
        raise Ilegal("el codigo %s no es de nada que se pueda usar aqui" % texto.upper())
    if ":" in texto:
        cabeza, resto = texto.split(":", 1)
        elegida = APODOS_CATEGORIA.get(cabeza.strip().lower())
        if elegida is not None:
            if elegida not in categorias:
                raise Ilegal("aqui no se puede usar la categoria %r" % cabeza.strip())
            categorias, texto = {elegida}, resto
    texto = texto.strip().lower()
    hallados = {}
    for f in reglas._tabla("nombres-es.csv"):
        if f.get("categoria") not in categorias:
            continue
        nombre = (f.get("nombre_es") or f.get("nombre_en") or "").strip()
        if nombre.lower() == texto:
            hallados[f["id"].upper()] = nombre
    if not hallados:
        parecidos = sorted({(f.get("nombre_es") or "") for f in reglas._tabla("nombres-es.csv")
                            if f.get("categoria") in categorias
                            and texto in (f.get("nombre_es") or "").lower()})[:6]
        raise Ilegal("no encuentro %r entre %s.%s" % (
            texto, " / ".join(categorias),
            ("\n   ¿Querias alguno de estos? " + ", ".join(parecidos)) if parecidos else ""))
    if len(hallados) > 1:
        donde = sorted({f.get("categoria") for f in reglas._tabla("nombres-es.csv")
                        if f["id"].upper() in hallados})
        if len(donde) > 1:
            apodos = sorted({a for a, c in APODOS_CATEGORIA.items() if c in donde})
            raise Ilegal("hay %d cosas que se llaman %r, unas en %s.\n"
                         "   Escribelo con la categoria delante, por ejemplo: %s:%s"
                         % (len(hallados), texto, " y otras en ".join(donde),
                            apodos[0] if apodos else donde[0], texto))
        raise Ilegal("hay %d cosas distintas que se llaman %r, todas en %s.\n"
                     "   Como el nombre no las distingue, dime cual con su codigo:\n"
                     "   %s" % (len(hallados), texto, donde[0], "   ".join(sorted(hallados))))
    return list(hallados)[0]


def _es_fila_aprendida(f):
    """Una fila de tecnica APRENDIDA: kind 3, sub 10 (o 9) y una sola unidad.
    Los montones de manuales (sub 1 y 2, o 99 unidades) no valen: si una
    ranura apunta a uno, el juego no ensena la tecnica hasta pasar por el
    arbol (Marvin Murdock, NOTAS O-171) y trata al jugador como del universo
    (O-168)."""
    return (f is not None and f.get("kind") == inventario.KIND_REAL
            and f.get("sub") in (9, 10) and f.get("cantidad") == 1)


def _fila_tecnica_aprendida(plain, id_hex, que):
    """(plain, slot, creada) de una fila aprendida de esa tecnica: la que ya use
    algun jugador, o una nueva. Para crearla hay que tenerla (un manual en la
    mochila o una fila aprendida)."""
    id_hex = id_hex.upper()
    bib = _biblioteca_de_tecnicas(plain)
    if id_hex in bib:
        return plain, bib[id_hex][0], False
    poseidas = inventario.filas_poseidas(plain).get(id_hex)
    if not poseidas:
        raise Ilegal("no tienes ningun/a %s en la mochila, asi que no se puede "
                     "equipar: la partida guarda una referencia a TU copia, y sin "
                     "copia no hay a que apuntar" % que)
    modelo = next((f for _v, f in bib.values()), None)
    if modelo is None:
        raise Ilegal("no hay en la partida ninguna fila de tecnica aprendida de la "
                     "que copiar la forma")
    plain, slot = _meter_en_biblioteca(plain, id_hex, modelo)
    return plain, slot, True


def _una_fila_poseida(plain, id_hex, que):
    poseidas = inventario.filas_poseidas(plain).get(id_hex.upper())
    if not poseidas:
        raise Ilegal("no tienes ningun/a %s en la mochila, asi que no se puede "
                     "equipar: la partida guarda una referencia a TU copia, y sin "
                     "copia no hay a que apuntar" % que)
    return poseidas[0]


def _campo_equipacion(plain, fila, ranura):
    hashes = {r: h for h, etq in J.RANURAS_EQUIPO
              for r in [int(etq.split()[0])] if etq[0].isdigit()}
    if ranura not in hashes:
        raise Ilegal("la ranura de equipacion tiene que ir de 1 a 4")
    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    ini, _ = tlv.inicio_registro(plain, equipos[fila])
    for off, fh, n, _ in tlv.campos_desde(plain, ini, maximo=8):
        if fh == hashes[ranura]:
            return off + 8
    raise Ilegal("la fila de equipacion %d no tiene la ranura %d" % (fila, ranura))


def poner_equipacion(plain, fila, ranura, nombre):
    """Equipa un objeto en una ranura. Probado en el juego (NOTAS P-08).

    Comprueba dos cosas antes de escribir: que el objeto sea del tipo de esa
    ranura (el juego los tiene separados por tipo, ver NOTAS O-42) y que el
    jugador lo tenga en la mochila.
    """
    if ranura not in CATEGORIA_RANURA:
        raise Ilegal("la ranura de equipacion tiene que ir de 1 a 4")
    id_hex = _buscar_por_nombre(nombre, {CATEGORIA_RANURA[ranura]})
    nueva = _una_fila_poseida(plain, id_hex, nombre)

    off = _campo_equipacion(plain, fila, ranura)
    antes = struct.unpack_from("<I", plain, off)[0]
    if antes == nueva["slot"]:
        raise Ilegal("ese jugador ya lleva eso puesto en la ranura %d" % ranura)

    porslot = inventario.por_slot(plain)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, off, nueva["slot"])
    plain = bytes(buf)
    if antes and antes in porslot:                    # lo que llevaba, uno menos
        plain = inventario.ajustar_equipada(plain, porslot[antes], -1)
    plain = inventario.ajustar_equipada(plain, inventario.por_slot(plain)[nueva["slot"]], +1)

    nombres = tlv.nombres()
    return plain, {"fila": fila, "ranura": ranura,
                   # sin los marcadores del juego ("Talisman de <FLC:ENDO>"), O-187
                   "antes": _limpio_nombre(
                       nombres.get(porslot.get(antes, {}).get("id", ""), ("vacia",))[0])
                            if antes else "vacia",
                   "despues": _limpio_nombre(nombres.get(id_hex, (nombre,))[0])}


def poner_tecnica(plain, fila, ranura, nombre):
    """Pone una supertecnica en una ranura del arbol. Probado en el juego (NOTAS P-08).

    La ranura solo admite tecnicas de su categoria; las marcadas LIBRE admiten
    cualquiera, hipertecnicas incluidas (ver datos/reglas-del-jugador/supertecnicas.md).
    """
    if not 1 <= ranura <= 9:
        raise Ilegal("la ranura de tecnica tiene que ir de 1 a 9")

    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    ficha = None
    for f in reglas._tabla("jugadores.csv"):
        if f["identidad"].upper() == "%08X" % identidad:
            ficha = f
            break
    if ficha is None:
        raise Ilegal("no tengo ficha de ese personaje en jugadores.csv")
    admite = ficha["r%d_tipo" % ranura]

    tec = {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")}
    id_hex = None
    texto = nombre.strip()
    if len(texto) == 8 and all(c in "0123456789abcdefABCDEF" for c in texto):
        # el editor manda el codigo, no el nombre: hay hipertecnicas con el
        # nombre repetido (dos "Archipegaso rojo", NOTAS O-171)
        id_hex = texto.upper()
        if id_hex not in tec:
            id_hex = _buscar_por_nombre(texto, {"aura"})
    else:
        for k, f in tec.items():
            if (f["nombre"] or "").strip().lower() == nombre.strip().lower():
                id_hex = k
                break
    if id_hex is None:
        id_hex = _buscar_por_nombre(nombre, {"aura"})       # hipertecnicas
    if id_hex in tec:
        categoria = tec[id_hex]["categoria"]
        nombre = tec[id_hex].get("nombre") or nombre
    else:
        categoria = "Hipertecnica"
        nombre = tlv.nombres().get(id_hex, (nombre,))[0]

    if admite != "LIBRE" and categoria != admite:
        # La tercera copia de una tecnica vale en cualquier ranura de despues,
        # sea del tipo que sea, si ya la lleva dos veces en ranuras anteriores
        # (regla del juego que dio Aaron, NOTAS O-199).
        previas = [x for x in _tecnicas_puestas(plain, fila)[:ranura - 1] if x["id"] == id_hex]
        if len(previas) < 2:
            raise Ilegal("la ranura %d de %s solo admite tecnicas de %s, y %r es de %s "
                         "(solo entraria si ya la llevara dos veces en ranuras anteriores)"
                         % (ranura, ficha["nombre"], admite, nombre, categoria))
    from ievr import opciones as O
    if categoria == "Hipertecnica" and not O.espiritu_permitido(id_hex, "%08X" % identidad):
        # armaduras y mixi max: solo su personaje (regla de Aaron, O-172)
        de = sorted(O.duenos_de_espiritu(id_hex)["nombres"])
        if not de:
            raise Ilegal("%s no tiene dueno en los datos del juego, y Aaron prefiere que "
                         "no lo lleve nadie" % nombre)
        raise Ilegal("%s es solo de %s; %s no puede llevarlo"
                     % (nombre, ", ".join(de), ficha["nombre"]))
    if admite == "?":
        raise Ilegal("la ranura %d de %s no existe en su arbol" % (ranura, ficha["nombre"]))

    # una fila de tecnica APRENDIDA, como las que deja el juego (O-171)
    plain, slot_nuevo, creada = _fila_tecnica_aprendida(plain, id_hex, nombre)
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    ini, _ = tlv.inicio_registro(plain, tecnicas[fila])
    off = None
    for o, fh, n, _ in tlv.campos_desde(plain, ini, maximo=12):
        if fh == J.RANURAS_TECNICAS[ranura - 1]:
            off = o + 8
            break
    if off is None:
        raise Ilegal("la fila de tecnicas %d no tiene la ranura %d" % (fila, ranura))

    antes = struct.unpack_from("<I", plain, off)[0]
    if antes == slot_nuevo:
        raise Ilegal("ya lleva esa tecnica en esa ranura")
    porslot = inventario.por_slot(plain)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, off, slot_nuevo)
    plain = bytes(buf)
    if antes and antes in porslot:
        plain = inventario.ajustar_equipada(plain, porslot[antes], -1)
    if not creada:      # la fila nueva ya nace con un jugador que la lleva
        plain = inventario.ajustar_equipada(plain, inventario.por_slot(plain)[slot_nuevo], +1)
    # si el cambio deja una copia repetida sin sus dos anteriores, el juego la
    # quita: aqui tambien (O-199)
    plain, quitadas = _quitar_repetidas_sueltas(plain, fila)

    nombres = tlv.nombres()
    return plain, {"fila": fila, "ranura": ranura, "admite": admite,
                   "quitadas": quitadas,
                   "aviso": ("El juego quitaria estas por quedarse sin sus dos copias "
                             "anteriores, asi que se quitan: " + "; ".join(
                                 "ranura %d (%s)" % (r, n) for r, n in quitadas))
                            if quitadas else "",
                   # sin los marcadores del juego ("Talisman de <FLC:ENDO>"), O-187
                   "antes": _limpio_nombre(
                       nombres.get(porslot.get(antes, {}).get("id", ""), ("vacia",))[0])
                            if antes else "vacia",
                   "despues": _limpio_nombre(nombres.get(id_hex, (nombre,))[0])}


def _tecnicas_puestas(plain, fila):
    """[{ranura, off, slot, id}] de las nueve ranuras de tecnica de ese jugador
    (id None si esta vacia)."""
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    ini, _ = tlv.inicio_registro(plain, tecnicas[fila])
    offs = {}
    for o, fh, n, _ in tlv.campos_desde(plain, ini, maximo=12):
        if fh in J.RANURAS_TECNICAS:
            offs[fh] = o + 8
    porslot = inventario.por_slot(plain)
    fuera = []
    for k, fh in enumerate(J.RANURAS_TECNICAS, 1):
        off = offs.get(fh)
        slot = struct.unpack_from("<I", plain, off)[0] if off is not None else 0
        f = porslot.get(slot) if slot else None
        fuera.append({"ranura": k, "off": off, "slot": slot,
                      "id": (f or {}).get("id", "").upper() or None if slot else None})
    return fuera


def _quitar_repetidas_sueltas(plain, fila):
    """Quita las copias de una tecnica que estan en una ranura que no es de su
    tipo y ya no tienen dos copias en ranuras anteriores (O-199). Devuelve
    (plain, [(ranura, nombre)])."""
    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    ficha = next((f for f in reglas._tabla("jugadores.csv")
                  if f["identidad"].upper() == "%08X" % identidad), None)
    if ficha is None:
        return plain, []
    tec = {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")}
    puestas = _tecnicas_puestas(plain, fila)
    nombres = tlv.nombres()
    quitadas, soltadas = [], []
    buf = bytearray(plain)
    porslot = inventario.por_slot(plain)
    for x in puestas:
        if not x["id"] or x["off"] is None:
            continue
        admite = ficha.get("r%d_tipo" % x["ranura"], "?")
        categoria = tec[x["id"]]["categoria"] if x["id"] in tec else "Hipertecnica"
        if admite == "LIBRE" or categoria == admite:
            continue
        previas = [y for y in puestas[:x["ranura"] - 1] if y["id"] == x["id"] and y["slot"]]
        if len(previas) >= 2:
            continue
        struct.pack_into("<I", buf, x["off"], 0)
        soltadas.append(x["slot"])
        x["slot"] = 0            # para que las de despues tampoco cuenten con ella
        quitadas.append((x["ranura"], _limpio_nombre(nombres.get(x["id"], (x["id"],))[0])))
    if not quitadas:
        return plain, []
    plain = bytes(buf)
    # y el contador de "cuantos la llevan" de cada fila que se ha soltado
    for slot in soltadas:
        if slot in porslot:
            plain = inventario.ajustar_equipada(plain, porslot[slot], -1)
    return plain, quitadas


# --- pasivas heredadas ---------------------------------------------------------

TOPE_HEREDADAS = 3      # Aaron lo comprobo en el juego el 2026-09-14.
                        # Antes se creia que eran 2; ver pasivas.md.


def poner_heredada(plain, fila, ranura, nombre):
    """Pone una pasiva heredada en una ranura. Probado en el juego (NOTAS P-08).

    Tres reglas, todas de `datos/reglas-del-jugador/pasivas.md`:
    como mucho **dos** heredadas por jugador; a un Idolo solo se le heredan
    pasivas de otro Idolo; y a un Diamante no se le hereda nada.
    """
    if not 1 <= ranura <= 5:
        raise Ilegal("la ranura de pasiva tiene que ir de 1 a 5")

    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza == 8:
        raise Ilegal("es un Diamante (Fabled): sus pasivas son fijas y no admite "
                     "heredadas")

    from ievr import opciones as O
    id_hex = None
    texto = (nombre or "").strip()
    if len(texto) == 8 and all(c in "0123456789abcdefABCDEF" for c in texto):
        id_hex = texto.upper()          # el editor manda el codigo
    else:
        for f in reglas._tabla("nombres-es.csv"):
            if f.get("categoria") != "pasiva":
                continue
            if _sin_marcadores(f.get("nombre_es")) == _sin_marcadores(nombre):
                id_hex = f["id"].upper()
                break
    if id_hex is None:
        parecidas = sorted({_sin_marcadores(f.get("nombre_es"))
                            for f in reglas._tabla("nombres-es.csv")
                            if f.get("categoria") == "pasiva"
                            and _sin_marcadores(nombre)[:14] in _sin_marcadores(f.get("nombre_es"))})[:5]
        raise Ilegal("no encuentro ninguna pasiva que se llame %r.%s"
                     % (nombre, ("\n   Parecidas: " + " | ".join(parecidas))
                        if parecidas else ""))

    # se guarda siempre la version base; el juego pone el numero de la rareza
    # del que la recibe (O-165). Y solo las que se pueden heredar (O-173).
    id_hex = O.variante_por_rareza(id_hex, 0)
    if id_hex not in O.pasivas_heredables(rareza):
        que = O.nombre_pasiva(id_hex, nombre)
        if rareza in (5, 6, 7):
            raise Ilegal("es un Idolo y %s no es una pasiva de Idolo: a un Idolo solo "
                         "se le heredan las de otro Idolo" % que)
        raise Ilegal("%s no se puede heredar: solo las pasivas de jugador (ni las de "
                     "Idolo, ni las de stats, ni las de entrenador o gerente, ni las "
                     "personalizadas)" % que)

    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    ini, _ = tlv.inicio_registro(plain, fichas[fila])
    off = n = None
    for o, fh, ln, _ in tlv.campos_desde(plain, ini, maximo=20):
        if fh == J.F_HEREDADAS:
            off, n = o + 8, ln
            break
    if off is None or n != 20:
        raise Ilegal("la ficha %d no tiene el campo de pasivas heredadas" % fila)

    actuales = [plain[off + 4 * k:off + 4 * k + 4] for k in range(5)]
    puestas = sum(1 for k, v in enumerate(actuales) if any(v) and k != ranura - 1)
    if puestas >= TOPE_HEREDADAS:
        raise Ilegal("ese jugador ya tiene %d pasivas heredadas y el tope son %d"
                     % (puestas, TOPE_HEREDADAS))

    buf = bytearray(plain)
    buf[off + 4 * (ranura - 1):off + 4 * ranura] = bytes.fromhex(id_hex)
    nombres = tlv.nombres()
    tapada = actuales[ranura - 1]
    fic_pas = None
    for o, fh, ln, d in tlv.campos_desde(plain, ini, maximo=20):
        if fh == J.F_PASIVAS and ln == 20:
            fic_pas = d[4 * (ranura - 1):4 * ranura].hex().upper()
    return bytes(buf), {
        "fila": fila, "ranura": ranura,
        "antes": nombres.get(tapada.hex().upper(), ("vacia",))[0] if any(tapada) else "vacia",
        "despues": O.nombre_pasiva(O.variante_por_rareza(id_hex, rareza), nombres.get(id_hex, (nombre,))[0]),
        "tapa_a": nombres.get(fic_pas or "", ("—",))[0],
        "heredadas_tras_esto": puestas + 1,
    }


# --- nivel ---------------------------------------------------------------------

NIVEL_MAXIMO = 99


def poner_nivel(plain, fila, nivel):
    """Cambia el nivel de un jugador. Probado en el juego (NOTAS P-09).

    El nivel vive en DOS sitios y hay que tocar los dos (NOTAS O-02 y O-15): el
    array `0x377173B1`, que es el bueno, y una copia dentro de la ficha
    (`0x7C27AEEC`) que el juego deja desfasada pero que conviene dejar cuadrada.

    La experiencia (`0xAF047AD9`) **no se toca**: es lo que lleva dentro del nivel
    actual, y no sabemos su relacion exacta con el nivel. Al subir de nivel a mano
    el jugador conserva la que tuviera.
    """
    if not 1 <= nivel <= NIVEL_MAXIMO:
        raise Ilegal("el nivel va de 1 a %d; me has pedido %d" % (NIVEL_MAXIMO, nivel))

    pos = J.ocurrencias(plain, J.ARRAY_NIVEL[0], J.ARRAY_NIVEL[1])[0] + 8
    antes = struct.unpack_from("<H", plain, pos + 2 * fila)[0]
    if antes == nivel:
        raise Ilegal("ese jugador ya es de nivel %d" % nivel)
    if antes == 0:
        raise Ilegal("esa fila esta vacia: no hay ningun jugador ahi")

    buf = bytearray(plain)
    struct.pack_into("<H", buf, pos + 2 * fila, nivel)
    plain = bytes(buf)

    # la copia de la ficha, para no dejar la partida contradiciendose
    try:
        off, n = _campo(plain, fila, 0x7C27AEEC)
        if n == 1:
            buf = bytearray(plain)
            buf[off] = min(nivel, 255)
            plain = bytes(buf)
    except Ilegal:
        pass

    aviso = ""
    tope_antes, tope_ahora = tope_judias(antes), tope_judias(nivel)
    if tope_ahora < tope_antes:
        off_cant, _ = _campo(plain, fila, J.F_JUDIA_CANT)
        exceso = [k for k in range(3)
                  if struct.unpack_from("<H", plain, off_cant + 2 * k)[0] > tope_ahora]
        if exceso:
            raise Ilegal("bajar a nivel %d deja el tope de judias en %d, y ese "
                         "jugador tiene mas puestas. Quitale judias primero."
                         % (nivel, tope_ahora))
    return plain, {"fila": fila, "antes": antes, "despues": nivel,
                   "tope_judias": tope_ahora, "aviso": aviso}


# --- rareza --------------------------------------------------------------------

RAREZAS_QUE_SE_SUBEN = (0, 1, 2, 3, 4)


def poner_rareza(plain, fila, rareza):
    """Cambia la rareza de un jugador. Probado en el juego (NOTAS P-09).

    Solo dentro de los cinco escalones que se suben jugando (NOTAS O-58). Pasar
    un jugador normal a Idolo o a Diamante, o al reves, **no es alcanzable
    jugando** y se rechaza.

    **No toca las pasivas.** Aaron dice que su valor cambia con la rareza; lo que
    no esta claro es si eso es porque cambia el identificador de la pasiva o
    porque el juego escala el numero al vuelo. Los datos de la partida no lo
    zanjan, asi que aqui no se inventa nada: se cambia la rareza y punto, y que
    el juego diga.
    """
    nombres = {v.lower(): k for k, v in J.RAREZAS.items()}
    if isinstance(rareza, str):
        clave = rareza.strip().lower()
        if clave not in nombres:
            raise Ilegal("no conozco la rareza %r. Las que se pueden poner: %s"
                         % (rareza, ", ".join(J.RAREZAS[k] for k in RAREZAS_QUE_SE_SUBEN)))
        rareza = nombres[clave]

    pos = J.ocurrencias(plain, J.ARRAY_RAREZA[0], J.ARRAY_RAREZA[1])[0] + 8
    antes = struct.unpack_from("<I", plain, pos + 4 * fila)[0]
    if antes == rareza:
        raise Ilegal("ese jugador ya es %s" % J.RAREZAS.get(rareza, rareza))
    if antes not in RAREZAS_QUE_SE_SUBEN:
        raise Ilegal("ese jugador es %s, que viene asi de fabrica y no se puede "
                     "cambiar" % J.RAREZAS.get(antes, "rareza %d" % antes))
    if rareza not in RAREZAS_QUE_SE_SUBEN:
        raise Ilegal("%s no se consigue subiendo de rareza: o el jugador es asi o "
                     "no lo es" % J.RAREZAS.get(rareza, "esa rareza"))

    buf = bytearray(plain)
    struct.pack_into("<I", buf, pos + 4 * fila, rareza)
    return bytes(buf), {"fila": fila, "antes": J.RAREZAS[antes],
                        "despues": J.RAREZAS[rareza]}


# --- pasivas normales ----------------------------------------------------------

def _pool_del_personaje(identidad):
    """Las pasivas que ese personaje puede sacar en las ranuras 1 y 2.

    Sale de `pool-pasivas.csv`, que se lee de las tablas de sorteo del juego
    (NOTAS O-57), no de lo observado en una partida.
    """
    clave = "%08X" % identidad
    return [f for f in reglas._tabla("pool-pasivas.csv")
            if f.get("identidad", "").upper() == clave]


def poner_pasiva(plain, fila, ranura, nombre):
    """Cambia una pasiva normal. Probado en el juego (NOTAS P-09).

    Cada ranura tiene su propia regla, y son distintas (NOTAS O-51 y O-57):

    - **ranuras 1 y 2**: solo las que ese personaje concreto puede sacar, leidas
      del sorteo del juego;
    - **ranuras 3, 4 y 5**: las de su arquetipo.
    """
    if not 1 <= ranura <= 5:
        raise Ilegal("la ranura de pasiva tiene que ir de 1 a 5")

    # A un Idolo o a un Diamante no se le cambian las pasivas: no se sortean y
    # **no se guardan en la partida**. Los 95 Idolos de la partida de Aaron
    # tienen ese campo a cero (NOTAS O-67); escribir ahi seria inventarse un
    # estado que el juego no produce.
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza >= 5:
        raise Ilegal("es %s: sus pasivas son fijas y ni siquiera se guardan en la "
                     "partida, las pone el juego. No se pueden cambiar."
                     % J.RAREZAS.get(rareza, "de rareza %d" % rareza))

    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    arquetipo = J.ARQUETIPOS.get(J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila])

    if ranura <= 2:
        permitidas = {f["pasiva_id"].upper(): f["pasiva"] for f in _pool_del_personaje(identidad)}
        de_donde = "las que puede sacar este personaje"
    else:
        permitidas = {}
        for f in reglas._tabla("pasivas-por-ranura.csv"):
            if f["grupo"] == "%s (ranura %d)" % (arquetipo, ranura):
                permitidas[f["id"].upper()] = f["nombre"]
        de_donde = "las del arquetipo %s en la ranura %d" % (arquetipo, ranura)
    if not permitidas:
        raise Ilegal("no tengo la lista de %s, asi que no me arriesgo a escribir"
                     % de_donde)

    from ievr import opciones as O
    id_hex = None
    texto = (nombre or "").strip().upper()
    if len(texto) == 8 and all(c in "0123456789ABCDEF" for c in texto):
        # el editor manda el codigo: el nombre lleva el numero puesto ("+2 %")
        # y la tabla lleva <VALUE>, asi que por nombre no cuadraban (O-173)
        if texto in permitidas:
            id_hex = texto
        else:
            nombre = O.nombre_pasiva(texto, texto)
    for k, v in permitidas.items():
        if id_hex is None and _sin_marcadores(v) == _sin_marcadores(nombre):
            id_hex = k
            break
    if id_hex is None:
        raise Ilegal("%r no esta entre %s.\n   Puede sacar: %s"
                     % (nombre, de_donde,
                        " | ".join(sorted({_sin_marcadores(v)[:44] for v in permitidas.values()}))))

    off, n = _campo(plain, fila, J.F_PASIVAS)
    if n != 20:
        raise Ilegal("la ficha %d no tiene el campo de pasivas" % fila)
    antes = plain[off + 4 * (ranura - 1):off + 4 * ranura].hex().upper()
    buf = bytearray(plain)
    buf[off + 4 * (ranura - 1):off + 4 * ranura] = bytes.fromhex(id_hex)
    nombres = tlv.nombres()
    return bytes(buf), {"fila": fila, "ranura": ranura, "de_donde": de_donde,
                        "antes": O.nombre_pasiva(antes, nombres.get(antes, ("vacia",))[0]) if antes != "00000000" else "vacia",
                        "despues": O.nombre_pasiva(id_hex, nombres.get(id_hex, (nombre,))[0])}


# --- partidos jugados ----------------------------------------------------------

F_PARTIDOS = 0x1238E5AC
PARTIDOS_MAXIMO = 9999


def poner_partidos(plain, fila, partidos):
    """Cambia los partidos jugados de un jugador. Probado en el juego (NOTAS P-09).

    Campo `0x1238E5AC`, 2 bytes en la ficha. Localizado por correlacion: Joseph
    King, recien conseguido, tiene 0; los de nivel 99 tienen 54 de media y hasta
    246 (NOTAS O-60).

    Importa porque las ranuras de insignia se abren a los **10** y a los **30**
    partidos (NOTAS O-25).
    """
    if not 0 <= partidos <= PARTIDOS_MAXIMO:
        raise Ilegal("los partidos van de 0 a %d" % PARTIDOS_MAXIMO)
    off, n = _campo(plain, fila, F_PARTIDOS)
    if n != 2:
        raise Ilegal("el campo de partidos de esa ficha mide %d bytes, no 2" % n)
    antes = struct.unpack_from("<H", plain, off)[0]
    if antes == partidos:
        raise Ilegal("ese jugador ya tiene %d partidos" % partidos)
    buf = bytearray(plain)
    struct.pack_into("<H", buf, off, partidos)
    insignias = sum(1 for umbral in (10, 30) if partidos >= umbral)
    return bytes(buf), {"fila": fila, "antes": antes, "despues": partidos,
                        "insignias": insignias}


# --- inventario ----------------------------------------------------------------

TOPE_CANTIDAD = 99999      # lo que el proyecto de referencia probo en el juego


def _fila_de_objeto(plain, nombre):
    """(id, fila poseida) de un objeto del inventario, buscando por nombre."""
    categorias = set(CATEGORIA_RANURA.values()) | {"consumible"}
    id_hex = _buscar_por_nombre(nombre, categorias)
    poseidas = inventario.filas_poseidas(plain).get(id_hex)
    return id_hex, (poseidas[0] if poseidas else None)


def poner_cantidad(plain, nombre, cantidad):
    """Cambia cuantas unidades de un objeto hay en la mochila. Probado en el juego (NOTAS P-09).

    Solo funciona con objetos que **ya** se tengan: crear la fila de uno nuevo es
    otra operacion (`anadir_objeto`).
    """
    if not 0 <= cantidad <= TOPE_CANTIDAD:
        raise Ilegal("la cantidad va de 0 a %d" % TOPE_CANTIDAD)
    id_hex, fila = _fila_de_objeto(plain, nombre)
    if fila is None:
        raise Ilegal("no tienes ningun/a %r en la mochila. Para crearlo de cero "
                     "usa --anadir-objeto" % nombre)
    if "cantidad_off" not in fila:
        raise Ilegal("de eso no se guarda cuantos tienes: en el juego se tiene o "
                     "no se tiene, y ya lo tienes")
    off = fila["cantidad_off"]
    antes = struct.unpack_from("<I", plain, off)[0]
    if antes == cantidad:
        raise Ilegal("ya tienes %d de eso" % cantidad)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, off, cantidad)
    nombres = tlv.nombres()
    return bytes(buf), {"objeto": nombres.get(id_hex, (nombre,))[0],
                        "antes": antes, "despues": cantidad}


# Lo que se puede crear de cero. Son las categorias que viven en un tramo del
# inventario con filas libres al final (NOTAS O-63). Los "espiritus" del juego
# son la categoria `aura`.
# Las tacticas NO estan aqui a proposito: no son objetos de mochila. Se busco su
# identificador en las filas del inventario y no hay ni una (NOTAS O-84); si
# aparecen en la partida es dentro de los equipos, que es otra cosa y no se toca
# todavia. Ensenarlas en la mochila decia "no tienes ninguna" y era mentira.
# Las **supertacticas** (Buena racha, Explosion, Fiebre de la suerte, Poder
# directo, Portero invicto, Superbarrera) NO van aqui: no se consiguen, salen
# solas durante un partido y se acaban con el partido. Dicho por Aaron.
CATEGORIAS_QUE_SE_ANADEN = (set(CATEGORIA_RANURA.values())
                            | {"consumible", "aura", "supertecnica",
                               "escudo", "emblema-jugador", "equipacion-equipo",
                               "tactica-objeto", "kizuna",
                               "placa", "material"})

# Estas dos familias **no guardan cuantas tienes**: en la partida sus filas no
# tienen campo de cantidad, se tienen o no se tienen. Si se les intenta escribir
# una cantidad revienta con KeyError, que es lo que le pasaba a Aaron al
# conseguir tacticas de equipo (NOTAS O-135).
CATEGORIAS_SIN_CANTIDAD = ("escudo", "tactica-objeto")


def _catalogo_hermanos(id_hex):
    """(categoria, ids de TODO lo de esa categoria) segun las tablas del juego."""
    categoria = None
    for f in reglas._tabla("nombres-es.csv"):
        if f["id"].upper() == id_hex:
            categoria = f.get("categoria")
            break
    if categoria is None:
        raise Ilegal("no se de que tipo es %s, asi que no se donde crearlo" % id_hex)
    hermanos = {f["id"].upper() for f in reglas._tabla("nombres-es.csv")
                if f.get("categoria") == categoria}
    return categoria, hermanos


def anadir_objeto(plain, nombre, cantidad=1):
    """Crea la fila de un objeto que no se tiene. Probado en el juego (NOTAS P-09).

    Lo delicado no es escribir el identificador, son las otras dos cosas:

    1. **Donde.** Cada tipo de objeto ocupa un tramo contiguo de tamano fijo y
       las filas libres estan al final de su tramo. Una fila rellenada fuera de
       su tramo el juego la ignora en silencio (NOTAS O-08), que es como el
       proyecto de referencia perdio 727 escrituras. El tramo se deduce de la
       propia partida, no se adivina.

    2. **El numero de fila.** Las filas libres tienen `slot = 0`, y la
       equipacion apunta a las filas por ese numero (NOTAS O-19). Si se deja en
       cero el objeto aparece pero no se puede poner a nadie, y ademas dos filas
       distintas pasan a tener el mismo numero. Se calcula con la formula de
       NOTAS O-62.

    Lo demas se copia de una fila hermana que ya funcione en la partida, en vez
    de inventar valores: asi la fila nueva tiene exactamente la forma que el
    juego produce.
    """
    if not 1 <= cantidad <= TOPE_CANTIDAD:
        raise Ilegal("la cantidad va de 1 a %d" % TOPE_CANTIDAD)
    id_hex = _buscar_por_nombre(nombre, CATEGORIAS_QUE_SE_ANADEN)
    if inventario.filas_poseidas(plain).get(id_hex):
        raise Ilegal("ya tienes %r; para cambiar cuantos usa --cantidad" % nombre)

    categoria, hermanos = _catalogo_hermanos(id_hex)
    bloque = inventario.bloque_con(plain, hermanos)
    if bloque is None:
        raise Ilegal("no hay en la partida ni una sola fila de %s, asi que no "
                     "puedo saber en que tramo va. No escribo nada." % categoria)

    # La plantilla se busca entre los HERMANOS, no en cualquier fila del tramo:
    # el tramo de lo que se aprende mezcla supertecnicas, espiritus y pasivas, y
    # copiar la forma de una supertecnica para crear un espiritu seria copiar la
    # forma equivocada.
    modelo = next((f for f in bloque["filas"]
                   if f.get("id") in hermanos
                   and f.get("kind") == inventario.KIND_REAL and f["slot"] != 0), None)
    if modelo is None:
        raise Ilegal("no hay ninguna fila de %s que copiar como plantilla" % categoria)

    libre = pos = None
    for i, f in enumerate(bloque["filas"]):
        if f["slot"] == 0 and f.get("id") == "00000000":
            libre, pos = f, i
            break
    if libre is None:
        raise Ilegal("no queda ninguna fila libre en el tramo de %s. El juego "
                     "reserva un numero fijo de filas y agrandarlo obligaria a "
                     "mover todo lo que hay detras." % categoria)

    slot = inventario.componer_slot(bloque["clase"], bloque["tipo"], pos)
    serie = max((f.get("serie", 0) for f in inventario.todas_las_filas(plain)),
                default=0) + 1

    buf = bytearray(plain)
    struct.pack_into("<I", buf, libre["slot_off"] + 8, slot)
    buf[libre["id_off"]:libre["id_off"] + 4] = bytes.fromhex(id_hex)
    struct.pack_into("<I", buf, libre["serie_off"], serie)
    buf[libre["kind_off"]] = inventario.KIND_REAL
    buf[libre["sub_off"]] = modelo.get("sub", inventario.SUB_EN_MOCHILA)
    if "cantidad_off" in libre:
        struct.pack_into("<I", buf, libre["cantidad_off"], cantidad)
    else:
        cantidad = 1          # un escudo o una tactica de equipo: se tiene y ya
    if "equipada_off" in libre:
        struct.pack_into("<I", buf, libre["equipada_off"], 0)

    nombres = tlv.nombres()
    return bytes(buf), {"objeto": nombres.get(id_hex, (nombre,))[0],
                        "categoria": categoria, "cantidad": cantidad,
                        "posicion": pos, "slot": slot, "serie": serie,
                        "copiado_de": nombres.get(modelo["id"], ("?",))[0]}


# --- crear un jugador ----------------------------------------------------------
#
# Un jugador no vive en un sitio, vive en cinco (NOTAS O-64):
#
#   - cuatro arrays paralelos: identidad, nivel, experiencia y rareza
#   - un array mas para el arquetipo
#   - su ficha, con pasivas, judias, partidos y unos bloques que aun no se
#     entienden del todo
#   - su registro de equipacion, que se deja vacio
#   - su registro de supertecnicas, que apunta a la biblioteca de tecnicas
#
# Si se rellena una parte y otra no, el juego ensena un jugador a medias. Por eso
# esta funcion lo prepara todo entero y solo despues devuelve la partida.

# Los once campos que el juego pone y quita a la vez cuando un jugador entra o
# sale de la partida. Se sacaron comparando la partida de Aaron antes y despues
# de borrar 169 jugadores desde el propio juego: los 169 cambiaron en estos once
# y en ningun otro (NOTAS O-68).
#
#   (hash, bytes por jugador, tamano del array, valor al vaciar)
ARRAYS_DE_JUGADOR = [
    (0x918020D9, 4, 24000, 0),      # numero de fila, ver _slot_de_jugador
    (0xBA162C11, 4, 24000, 0),      # identidad
    (0x377173B1, 2, 12000, 0),      # nivel
    (0xE9835BD9, 4, 24000, 0),      # rareza
    (0x90F47C83, 4, 24000, 0),      # serie de adquisicion
    (0x8BA23AC3, 1, 6000, 6),       # arquetipo; 6 es "ninguno"
    (0x05B7786A, 1, 6000, 0),
    (0xFA7AEFFB, 4, 24000, 0),
    (0xFC830AAC, 1, 6000, 0),
    (0x71DB6E55, 1, 6000, 0),
    (0xD6B65E67, 4, 24000, 0),
    (0xBAFA8DBD, 4, 24000, 0),      # tablero asignado por el juego (O-169)
]
# Valores de los cuatro que no se han sabido interpretar. Son los que llevan la
# inmensa mayoria de los jugadores de la partida, y el ultimo va a cero porque
# los 55 jugadores que da la historia lo tienen a cero.
VALORES_POR_DEFECTO = {0x05B7786A: 4, 0xFA7AEFFB: 1025, 0xFC830AAC: 3,
                       0x71DB6E55: 1, 0xD6B65E67: 0}
FORMATO = {1: "B", 2: "<H", 4: "<I"}


def _base_array(plain, fhash, tam):
    return J.ocurrencias(plain, fhash, tam)[0] + 8


def _leer_array(plain, fila, fhash, ancho, tam):
    return struct.unpack_from(FORMATO[ancho], plain,
                              _base_array(plain, fhash, tam) + ancho * fila)[0]


def _slot_de_jugador(fila, serie):
    """El numero de fila de un jugador.

    No es un contador suelto, se calcula (NOTAS O-69):

        slot = (fila << 16) | 0x800 | (serie % 2048)

    Comprobado contra los 4.923 jugadores de la partida: cuadran 4.923, fallan 0.
    La parte de abajo repite el numero de adquisicion para que, si la fila se
    reutiliza, el numero salga distinto y las alineaciones viejas no apunten por
    error al jugador nuevo.
    """
    return (fila << 16) | 0x800 | (serie & 0x7FF)


def _siguiente_serie(plain):
    base = _base_array(plain, 0x90F47C83, 24000)
    return max(struct.unpack_from("<I", plain, base + 4 * i)[0]
               for i in range(6000)) + 1

FAMILIAS_DE_RAREZA = {"normal": (0, 1, 2, 3, 4), "hero": (5, 6, 7), "fabled": (8,)}
TECNICAS_DE_SALIDA = 3      # con las que aparece un jugador normal de nivel 1 (NOTAS O-65)
# Con cuantas tecnicas sale cada familia y como deja el juego el campo de las
# nueve ranuras (0x45E2D879: en que casilla del arbol va cada tecnica; ff = aun
# no hay). Medido en jugadores de nivel 1 hechos por el juego (NOTAS O-162):
# un normal sale con 3 (las ramas se eligen despues), un Idolo con 6 (su unica
# rama) y un Diamante con las 9.
TECNICAS_DE_SALIDA_POR_FAMILIA = {"normal": 3, "hero": 6, "fabled": 9}
RANURAS_NIVEL_1 = {"normal": "000204ffffffffffff", "hero": "000204080a0cffffff",
                   "fabled": "000204090b0d131517"}


def _campo_en(plain, ancla_off, fhash):
    """(offset de los datos, longitud) de un campo dentro del registro que contiene
    a `ancla_off`. Sirve para los registros que no son la ficha."""
    ini, _ = tlv.inicio_registro(plain, ancla_off)
    for off, fh, n, _ in tlv.campos_desde(plain, ini, maximo=25):
        if fh == fhash:
            return off + 8, n
    raise Ilegal("ese registro no tiene el campo %08X" % fhash)


def _personaje_por_nombre(nombre):
    """La ficha de jugadores.csv del personaje que se llame asi. Exige que sea unico."""
    texto = nombre.strip().lower()
    if len(texto) == 8 and all(c in "0123456789abcdef" for c in texto):
        for f in reglas._tabla("jugadores.csv"):
            if f["identidad"].upper() == texto.upper():
                return f
        raise Ilegal("no hay ningun personaje con el codigo %s" % nombre)
    hallados = [f for f in reglas._tabla("jugadores.csv")
                if (f.get("nombre") or "").strip().lower() == texto]
    if not hallados:
        parecidos = sorted({f.get("nombre", "") for f in reglas._tabla("jugadores.csv")
                            if texto in (f.get("nombre") or "").lower()})[:8]
        raise Ilegal("no encuentro ningun personaje que se llame %r.%s" % (
            nombre, ("\n   ¿Querias alguno de estos? " + ", ".join(parecidos))
            if parecidos else ""))
    if len({f["identidad"] for f in hallados}) > 1:
        raise Ilegal("hay %d personajes distintos que se llaman %r; dime cual con "
                     "su codigo:\n   %s"
                     % (len(hallados), nombre,
                        "   ".join(sorted({f["identidad"] for f in hallados}))))
    return hallados[0]


def _familia_de(identidad_hex):
    """"normal", "hero" o "fabled". Manda que rarezas puede tener el personaje."""
    f = reglas.personajes().get(identidad_hex.upper())
    familia = (f or {}).get("rareza")
    if familia not in FAMILIAS_DE_RAREZA:
        raise Ilegal("no se de que familia es ese personaje, asi que no se que "
                     "rarezas puede tener. No escribo nada.")
    return familia


def _campo_fc_de(identidad_hex):
    """El valor de `0xFC830AAC` que le toca a ese personaje.

    Sale de la columna 4 de chara_param, que acierta en los 2.644 personajes con
    los que se pudo contrastar contra la partida (NOTAS O-71).
    """
    for f in reglas._tabla("ficha-jugador.csv"):
        if f["identidad"].upper() == identidad_hex.upper():
            try:
                return int(f["campo_fc"])
            except (TypeError, ValueError):
                return None
    return None


def _identificador_de_copia(plain):
    """Un numero que no tenga ya ningun jugador, para la copia nueva.

    `0xD6B65E67` es distinto en **los 4.868 jugadores** de la partida que lo
    tienen puesto, sin una sola repeticion, y no es el hash de nada que se haya
    probado: es el identificador de esa copia concreta (NOTAS O-72). Dejarlo a
    cero fue lo que hizo que el juego enseñara el nombre y el retrato del jugador
    anterior: no sabia a quien estaba mirando.
    """
    base = _base_array(plain, 0xD6B65E67, 24000)
    usados = {struct.unpack_from("<I", plain, base + 4 * i)[0] for i in range(6000)}
    for _ in range(1000):
        v = int.from_bytes(os.urandom(4), "little")
        if v > 0xFFFF and v not in usados:
            return v
    raise Ilegal("no consigo un identificador libre para la copia nueva")


def _bloques_de_aspecto(plain, identidad, modelo_fila):
    """Los dos bloques de 30 bytes de la ficha de un jugador nuevo: **vacios**.

    El primer byte de `0x38AFC2B8` es propio de cada personaje y no se ha
    encontrado de donde sale (NOTAS O-66): no esta en chara_param, ni en
    chara_base, ni va con el equipo, la posicion, el elemento, la rareza ni el
    orden en que se consiguen. Se probaron todas las columnas de las dos tablas.

    Copiarle a un personaje el valor de otro **rompe el juego de una forma muy
    concreta** (NOTAS O-74): la ficha se ve bien si vas directo a ella, pero si
    pasas antes por encima de otro jugador, se queda el nombre y el retrato del
    anterior con las estadisticas del nuevo.

    Vacio no rompe nada, y eso esta comprobado dos veces: el Axel Blaze creado se
    arreglo vaciandoselos, y **el avatar de Aaron los lleva vacios y llega a nivel
    99**. Asi que se deja vacio, que es no mentir, en vez de poner un numero
    inventado.
    """
    return bytes([0xFF]) * 30, bytes(30), "vacios (NOTAS O-74)"


# El arquetipo que llevan los Diamantes en la partida: no es ninguno de los
# seis con nombre. Los 58 de la partida de Aaron van con este (NOTAS O-161).
ARQUETIPO_DIAMANTE = 6


_VARIANTES = {}
_VALORES = {}


def _variantes():
    """{id: {rareza: id}} de `pasivas-rareza.csv`."""
    if not _VARIANTES:
        grupos = {}
        for f in reglas._tabla("pasivas-rareza.csv"):
            grupos.setdefault(f["grupo"], {})[int(f["rareza"])] = f["id"].upper()
        for g in grupos.values():
            for pid in g.values():
                _VARIANTES[pid] = g
    return _VARIANTES


def _variante(pid, rareza):
    """El id de la version de esa pasiva para esa rareza (0-4; Idolos y
    Diamantes la 4). El mismo id si no tiene versiones."""
    g = _variantes().get((pid or "").upper())
    if not g:
        return (pid or "").upper()
    q = min(max(int(rareza or 0), 0), 4)
    return g.get(q) or g.get(max(g))


def _valor(pid):
    """El numero propio de esa version de la pasiva (`pasivas-valor.csv`)."""
    if not _VALORES:
        for f in reglas._tabla("pasivas-valor.csv"):
            try:
                _VALORES[f["id"].upper()] = float(f.get("valor") or 0)
            except ValueError:
                _VALORES[f["id"].upper()] = 0.0
    return _VALORES.get((pid or "").upper(), 0.0)


def _arquetipo_diamante(plain, fila):
    """El arquetipo elegido de un Diamante (array `14CDA97F`, 0-5; 0 = Brecha).
    None si la partida no trae el array."""
    if not J.ocurrencias(plain, J.F_ARQUETIPO_DIAMANTE, 6000):
        return None
    v = J.array(plain, (J.F_ARQUETIPO_DIAMANTE, 6000, "B", 1))[fila]
    return v if v in J.ARQUETIPOS else None


def _arquetipo_de_serie(identidad_hex):
    """Con que arquetipo sale un Diamante del juego: el de su primer tablero
    basara (Raika: Tension); si no tiene, el que delate la pareja de sus fijas;
    si no, Brecha."""
    from ievr import opciones as O
    elegibles = O.arquetipos_elegibles(identidad_hex)
    if elegibles:
        return elegibles[0]
    fijas = O.pasivas_fijas(identidad_hex, 1, None)
    return _arquetipo_de_pareja([{"id": x} for x in fijas], O.PAREJA_ARQUETIPO) or 0


def poner_arquetipo_diamante(plain, fila, arquetipo):
    """Elige el arquetipo de un Diamante, como se hace dentro del juego: se
    escribe en el array `14CDA97F` y la pareja 4-5 de su tabla de pasivas pasa
    a ser la de ese arquetipo (NOTAS O-166). Un Idolo no cambia."""
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza != 8:
        raise Ilegal("solo un Diamante elige arquetipo; un Idolo lo trae de fabrica")
    if arquetipo not in J.ARQUETIPOS:
        raise Ilegal("no conozco el arquetipo %r" % (arquetipo,))
    occ = J.ocurrencias(plain, J.F_ARQUETIPO_DIAMANTE, 6000)
    if not occ:
        raise Ilegal("esta partida no trae el array de arquetipos de Diamante")
    antes = J.array(plain, (J.F_ARQUETIPO_DIAMANTE, 6000, "B", 1))[fila]
    buf = bytearray(plain)
    buf[occ[0] + 8 + fila] = arquetipo
    identidad_hex = "%08X" % J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    _escribir_tablero(buf, plain, fila, identidad_hex, 8, arquetipo)
    plain = sincronizar_tabla_pasivas(bytes(buf), fila)
    return plain, {"fila": fila, "que": "arquetipo", "antes": J.ARQUETIPOS.get(antes, "?"),
                   "despues": J.ARQUETIPOS[arquetipo]}


def _tablero_para(plain, fila, identidad_hex, rareza, arquetipo, tipo=None):
    """El tablero que le toca (NOTAS O-169), con los datos que hacen falta para
    el generico de un Diamante ascendido."""
    from ievr import opciones as O
    try:
        ficha = _personaje_por_nombre(identidad_hex)
    except Ilegal:
        ficha = {}
    if tipo is None:
        tipo = J.array(plain, (0xFC830AAC, 6000, "B", 1))[fila]
    return O.tablero_del_juego(identidad_hex, rareza, arquetipo,
                               ficha.get("posicion") or "", ficha.get("elemento") or "", tipo)


def _escribir_tablero(buf, plain, fila, identidad_hex, rareza, arquetipo, tipo=None):
    occ = J.ocurrencias(plain, J.F_TABLERO_JUEGO, 24000)
    if occ:
        struct.pack_into("<I", buf, occ[0] + 8 + 4 * fila,
                         _tablero_para(plain, fila, identidad_hex, rareza, arquetipo, tipo))


def _escribir_arquetipo_diamante(buf, plain, fila, identidad_hex):
    """Al fichar o ascender un Diamante: el arquetipo con el que sale del juego."""
    occ = J.ocurrencias(plain, J.F_ARQUETIPO_DIAMANTE, 6000)
    if occ:
        buf[occ[0] + 8 + fila] = _arquetipo_de_serie(identidad_hex)


def _arquetipo_de_pareja(entradas, parejas):
    """Que arquetipo delata la pareja 4-5 de la tabla, o None."""
    if len(entradas) < 5:
        return None
    par = {entradas[3]["id"], entradas[4]["id"]}
    for a, ids in parejas.items():
        if par == set(ids):
            return a
    return None


# --- El arbol de habilidades de un jugador normal (NOTAS O-177) -----------------
#
# Lo que deja el juego, leido de los 2.700 normales de la partida de Aaron:
# el mapa de casillas (`0xBB459017`) se va abriendo con el nivel, en orden, el
# tronco (0-7) y luego la rama que juega (8-17 o 18-27); y el campo `0x45E2D879`
# lleva la casilla de cada ranura de tecnica CONFIRMADA: las tres del tronco
# siempre (0, 2, 4; desde nivel 1), y las de la rama solo cuando el jugador las
# confirma en el arbol (9, 11, 13 en la rama 1; 19, 21, 23 en la 2). Un jugador
# con tecnicas en las ranuras 4-6 pero sin confirmarlas no las ensena en el
# juego (Kevin Dragonfly), y con el mapa sin abrir hasta su nivel el arbol sale
# "bugueado" y las pasivas con candado hasta que el juego lo repasa.
CELDA_TECNICA_NORMAL = {1: 0, 2: 2, 3: 4, 4: 9, 5: 11, 6: 13, 7: 19, 8: 21, 9: 23}
CELDA_PASIVA_NORMAL = {0: 1, 1: 3, 2: 8, 3: 12, 4: 15}      # ranura 3-5: +10 en la rama 2
# Un Idolo tiene un tablero seguido (0-22) con sus seis tecnicas en 0,2,4,8,10,12;
# un Diamante usa el mismo reparto que un normal. Medido en la partida de Aaron
# contra los que hizo el juego (NOTAS O-178).
CELDA_PASIVA_IDOLO = {0: 1, 1: 9, 2: 11, 3: 13, 4: 15}
CELDA_PASIVA_DIAMANTE = {0: 1, 1: 3, 2: 8, 3: 10, 4: 11}
# (nivel, casillas abiertas): las 17 primeras son la tabla del propio juego
# (ABILITY_LEARNING_LOCK_LEVEL_INFO_LIST) y el resto esta medido
NIVEL_CASILLAS_BASE = ((1, 1), (7, 2), (13, 3), (16, 4), (20, 5), (23, 6), (26, 7),
                       (28, 8), (30, 9), (35, 10), (38, 11), (40, 12), (43, 13),
                       (45, 14), (47, 15), (48, 16), (50, 17))
# El editor se queda en el tronco + la rama: las casillas del tramo comun
# (28-32) las abre el jugador gastando puntos, y no hacen falta para que se
# vean las tecnicas ni para que se abran las pasivas.
NIVEL_CASILLAS_IDOLO = NIVEL_CASILLAS_BASE
NIVEL_CASILLAS_OTROS = NIVEL_CASILLAS_BASE + ((50, 18),)

# --- El anillo del tronco (NOTAS O-189) ---------------------------------------
# En el arbol de un normal o un Diamante la casilla 7 del tronco es un anillo
# giratorio: al llegar a el hay que girarlo para que conecte con la rama. El
# giro se guarda en dos campos de 30 bytes de la ficha: `0x3CAEA0BD` (la lista
# de anillos girados, ff = vacio; en todo el juego solo existe el 07) y
# `0x38AFC2B8` (hacia donde quedo cada uno, del 1 al 8). Y con el se abren las
# cinco casillas 28-32 del mapa. Sin esto el arbol sale "desconectado" en el
# juego (Anastasia, Iggie, Joaquine) hasta que se pulsa el anillo, y con ello
# sale bien (Kevin, Bunny, Gael). Lo que deja el juego en la partida de Aaron:
# rama 1 -> giro 7 (144 de 323), rama 2 -> giro 5 (11 de 27), Diamante -> 8.
# Un Idolo no tiene anillo (tablero seguido).
F_ANILLOS = 0x3CAEA0BD
F_GIROS = 0x38AFC2B8
CASILLA_ANILLO = 7
CASILLAS_DEL_ANILLO = range(28, 33)


# El giro NO es una eleccion del jugador: es fijo por personaje (NOTAS O-195).
# En la partida de Aaron, de los 53 personajes con tres o mas copias hechas
# por el juego, todas las copias de cada uno llevan el mismo giro; y con el
# giro equivocado el juego da la rama por desconectada y cierra las pasivas
# (Anastasia con el 7, cuando lo suyo es el 4). Como no sale de ninguna tabla
# del juego que tengamos, se aprende de los jugadores que hizo el juego:
# `anillos.csv` (2.601 personajes de la partida de Aaron) y la partida abierta.
# Cuando solo se conoce el giro de la otra rama, se pasa por la pareja mas
# frecuente; cuando no se conoce nada, el giro mas comun.
GIRO_DE_LA_OTRA_RAMA = {0: {7: 5, 6: 8, 8: 4, 4: 8, 1: 5},      # rama 1 -> rama 2
                        1: {5: 7, 8: 6, 4: 8, 1: 7}}            # rama 2 -> rama 1


def _giros_de_tabla():
    """{(identidad, diamante, rama): giro} de `anillos.csv`. Un Diamante lleva
    otro giro que las copias normales del mismo personaje."""
    from ievr import opciones as O
    def construir():
        d = {}
        for f in reglas._tabla("anillos.csv"):
            d[(f["identidad"].upper(), int(f.get("diamante") or 0), int(f["rama"]))] = int(f["giro"])
        return d
    return O._indice("anillos", construir)


def _giros_de_la_partida(plain):
    """{(identidad, diamante, rama): {giro: cuantos}} de los jugadores de la partida con
    el anillo girado. Se cuenta todo (tambien lo que haya escrito el editor),
    por eso se mira despues de la tabla."""
    from ievr import memoria
    def calcular():
        import collections
        ident = J.array(plain, J.ARRAY_IDENTIDAD)
        rar = J.array(plain, J.ARRAY_RAREZA)
        d = collections.defaultdict(collections.Counter)
        for fila in range(min(6000, len(ident))):
            if not ident[fila] or 5 <= rar[fila] <= 7:
                continue
            try:
                oa, na = _campo(plain, fila, F_ANILLOS)
                ob, nb = _campo(plain, fila, F_GIROS)
                orr, _ = _campo(plain, fila, J.F_RAMA)
            except Ilegal:
                continue
            if na != 30 or nb != 30 or plain[oa] != CASILLA_ANILLO or not plain[ob]:
                continue
            rama = struct.unpack_from("<I", plain, orr)[0]
            d[("%08X" % ident[fila], 1 if rar[fila] == 8 else 0, rama)][plain[ob]] += 1
        return d
    return memoria.recordar(plain, "giros_anillo", calcular)


def _giro_conocido(plain, fila, rama):
    """El giro que el juego usa para ese personaje en esa rama, si se sabe
    (de la tabla, o de otra copia en la partida); si no, None."""
    ident = "%08X" % J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    dia = 1 if J.array(plain, J.ARRAY_RAREZA)[fila] == 8 else 0
    tabla = _giros_de_tabla()
    if (ident, dia, rama) in tabla:
        return tabla[(ident, dia, rama)]
    otra = tabla.get((ident, dia, 1 - rama))
    if otra is not None and otra in GIRO_DE_LA_OTRA_RAMA[1 - rama]:
        return GIRO_DE_LA_OTRA_RAMA[1 - rama][otra]
    # las otras copias de la partida, SIN contarse a si mismo: si no, un giro
    # que puso el editor se confirmaba solo (Quentin Rackner, NOTAS O-200)
    vivos = _giros_de_la_partida(plain)
    propio = None
    try:
        oa, _ = _campo(plain, fila, F_ANILLOS)
        ob, _ = _campo(plain, fila, F_GIROS)
        if plain[oa] == CASILLA_ANILLO and plain[ob]:
            propio = plain[ob]
    except Ilegal:
        pass
    for r, mapa_giro in ((rama, None), (1 - rama, GIRO_DE_LA_OTRA_RAMA[1 - rama])):
        c = vivos.get((ident, dia, r))
        if not c:
            continue
        c = c.copy()
        if propio is not None and r == rama:
            c[propio] -= 1
        c = +c
        if not c:
            continue
        g = c.most_common(1)[0][0]
        if mapa_giro is None:
            return g
        if g in mapa_giro:
            return mapa_giro[g]
    return None


def _giro_del_anillo(plain, fila, rareza, rama):
    """El giro del anillo para ese personaje, o None si no se conoce: entonces
    el anillo se deja sin girar y lo gira el jugador en el juego con un clic
    (con un giro inventado el juego lo ensena roto y no deja moverlo, O-200)."""
    return _giro_conocido(plain, fila, rama)


def _marcas_dicen_desconectado(plain, fila, rareza, rama):
    """True si el juego ha dejado a cero las marcas de las pasivas 3-5 (con la
    1 abierta): es su forma de decir que la rama no conecta, o sea, que el
    giro del anillo no es el suyo (Anastasia con el 7, Quentin), NOTAS O-200."""
    p = J.pos_tabla_pasivas(plain, fila, 0)
    if p is None:
        return False
    marcas = [plain[q + 32] for q in range(p, p + 41 * 5, 41)]
    return marcas[2:] == [0, 0, 0] and marcas[0] == 1


# Un gerente o entrenador tiene ademas las casillas 33-39: el juego las abre
# solas al entrar en su arbol y con ellas se desbloquean sus pasivas de
# personal (Robert y Hilton; los que el editor dejo sin abrirlas salian con
# candado, NOTAS O-200).
CASILLAS_DE_PERSONAL = range(33, 40)
def _casillas_por_nivel(nivel, rareza):
    tabla = NIVEL_CASILLAS_IDOLO if 5 <= rareza <= 7 else NIVEL_CASILLAS_OTROS
    return max([c for u, c in tabla if nivel >= u] or [0])


def _orden_de_casillas(rareza, rama):
    """El orden en que el juego va abriendo las casillas del mapa de 40 bytes.

    Un Idolo tiene un tablero seguido; un normal o un Diamante abren el tronco
    (0-7), luego la rama que juega (8-17 o 18-27) y luego el tramo comun
    (28-32). Medido en los jugadores que hizo el juego (NOTAS O-178)."""
    if 5 <= rareza <= 7:
        return list(range(0, 23))
    rama_ini = 8 if rama == 0 else 18
    return list(range(0, 8)) + list(range(rama_ini, rama_ini + 10)) + list(range(28, 33))


def _arbol_esperado(plain, fila):
    """(offset del mapa, 40 bytes de mapa, offset del 45E2, 9 bytes, anillo)
    tal y como los dejaria el juego para ese jugador a su nivel; None si no
    aplica. `anillo` es None o ((offset, 30 bytes), (offset, 30 bytes)) de los
    campos del anillo cuando hay que girarlo (O-189)."""
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    try:
        off, n = _campo(plain, fila, J.F_TABLERO)
        offr, nr = _campo(plain, fila, J.F_RAMA)
        o45, n45 = _campo(plain, fila, 0x45E2D879)
    except Ilegal:
        return None
    if n != 60 or nr != 4 or n45 != 9:
        return None
    rama = struct.unpack_from("<I", plain, offr)[0]
    if rama not in (0, 1):
        return None
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    mapa = bytearray(plain[off:off + 40])
    for c in _orden_de_casillas(rareza, rama)[:_casillas_por_nivel(nivel, rareza)]:
        mapa[c] = 1
    # el anillo (O-189, O-195): si la rama ya empieza y el juego no lo ha
    # girado, se gira con el giro de ese personaje; y si esta girado con un
    # giro que no es el suyo (lo puso una version anterior del editor), se
    # corrige, porque con el giro equivocado el juego cierra las pasivas
    anillo = None
    if not 5 <= rareza <= 7 and (mapa[8] or mapa[18]):
        try:
            oa, na = _campo(plain, fila, F_ANILLOS)
            ob, nb = _campo(plain, fila, F_GIROS)
        except Ilegal:
            oa = None
        if oa is not None and na == 30 and nb == 30:
            giro = _giro_del_anillo(plain, fila, rareza, rama)
            if plain[oa] == 0xFF and giro is not None:
                for c in CASILLAS_DEL_ANILLO:
                    mapa[c] = 1
                a = bytearray(plain[oa:oa + 30])
                a[0] = CASILLA_ANILLO
                b = bytearray(plain[ob:ob + 30])
                b[0] = giro
                anillo = ((oa, bytes(a)), (ob, bytes(b)))
            elif plain[oa] == CASILLA_ANILLO:
                if giro is not None and plain[ob] != giro:
                    b = bytearray(plain[ob:ob + 30])
                    b[0] = giro
                    anillo = ((ob, bytes(b)),)
                elif giro is None and _marcas_dicen_desconectado(plain, fila, rareza, rama):
                    # giro inventado que el juego rechaza y no deja mover: se
                    # deja sin girar para que el jugador lo gire con un clic
                    a = bytearray(plain[oa:oa + 30]); a[0] = 0xFF
                    b = bytearray(plain[ob:ob + 30]); b[0] = 0
                    for c in CASILLAS_DEL_ANILLO:
                        mapa[c] = 0
                    anillo = ((oa, bytes(a)), (ob, bytes(b)))
        # las casillas de personal de un gerente o entrenador (O-200)
        if rol_de_personal(plain, fila) in ("gerente", "entrenador") and mapa[28]:
            for c in CASILLAS_DE_PERSONAL:
                mapa[c] = 1
    if rareza >= 5:
        # a un Idolo o Diamante el editor solo le abre casillas: sus ranuras de
        # tecnica ya vienen puestas de fabrica (O-165, O-169)
        return off, bytes(mapa), o45, plain[o45:o45 + 9], anillo
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    campos, _ = J._campos_de(plain, tecnicas[fila], set(J.RANURAS_TECNICAS))
    # solo se ANADE: lo que el juego ya tenga puesto (confirmaciones raras de
    # personajes de la historia, casillas de mas) no se toca
    e45 = bytearray(plain[o45:o45 + 9])
    for k in range(1, 10):
        if e45[k - 1] != 0xFF:
            continue
        celda = CELDA_TECNICA_NORMAL[k]
        if k <= 3:
            e45[k - 1] = celda          # el juego las lista siempre, desde nivel 1
            continue
        ref = int.from_bytes(campos.get(J.RANURAS_TECNICAS[k - 1], b""), "little")
        de_rama = 0 if k <= 6 else 1
        if ref and de_rama == rama and mapa[celda]:
            e45[k - 1] = celda          # confirmada, como al pulsar en el arbol
    return off, bytes(mapa), o45, bytes(e45), anillo


def _arbol_esta_como_toca(plain, esperado):
    off, mapa, o45, e45, anillo = esperado
    if plain[off:off + 40] != mapa or plain[o45:o45 + 9] != e45:
        return False
    return anillo is None


def _escribir_arbol(buf, esperado):
    off, mapa, o45, e45, anillo = esperado
    buf[off:off + 40] = mapa
    buf[o45:o45 + 9] = e45
    if anillo:
        for o, datos in anillo:
            buf[o:o + 30] = datos


def abrir_arbol(plain, fila):
    """Deja el arbol de un jugador normal como lo dejaria el juego: casillas
    abiertas hasta su nivel y las tecnicas de sus ranuras confirmadas (O-177).
    Se llama despues de cualquier cambio en la ficha. Devuelve plain."""
    esperado = _arbol_esperado(plain, fila)
    if esperado is None or _arbol_esta_como_toca(plain, esperado):
        return plain
    buf = bytearray(plain)
    _escribir_arbol(buf, esperado)
    return bytes(buf)


def _marcas_por_mapa(mapa, rareza, rama):
    """La marca de cada ranura de pasiva segun un mapa del arbol (40 bytes)."""
    fuera = []
    for k in range(5):
        if 5 <= rareza <= 7:
            celda = CELDA_PASIVA_IDOLO[k]
        elif rareza == 8:
            celda = CELDA_PASIVA_DIAMANTE[k]
        else:
            celda = CELDA_PASIVA_NORMAL[k] + (10 if (k >= 2 and rama == 1) else 0)
        fuera.append(1 if mapa[celda] else 0)
    return fuera


def _marcas_por_arbol(plain, fila):
    """La marca de desbloqueada de cada ranura de pasiva: 1 si su casilla del
    arbol esta abierta (O-177, O-178). None si no se sabe."""
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    try:
        off, n = _campo(plain, fila, J.F_TABLERO)
        offr, _ = _campo(plain, fila, J.F_RAMA)
    except Ilegal:
        return None
    if n != 60:
        return None
    rama = struct.unpack_from("<I", plain, offr)[0]
    return _marcas_por_mapa(plain[off:off + 40], rareza, rama)


def marcas_previstas(plain, fila):
    """La marca de desbloqueada de cada ranura de la tabla con numero (O-166)
    tal y como quedara AL GUARDAR, cuando se abre el arbol hasta el nivel que
    tenga puesto (arreglar_arboles): asi la configuracion de equipo (O-204) ya
    dice lo que dira el juego con el nivel recien cambiado en el editor, sin
    esperar a guardar. Si no se puede saber, las marcas que hay en la tabla."""
    tabla = J.tabla_pasivas(plain, fila) or []
    de_tabla = [x["marca"] for x in tabla]
    esperado = _arbol_esperado(plain, fila)
    if esperado is None:
        return de_tabla
    mapa = esperado[1]
    if rol_de_personal(plain, fila) in ("gerente", "entrenador"):
        if all(mapa[c] for c in CASILLAS_DE_PERSONAL):
            return [1 if x["id"] != "00000000" else x["marca"] for x in tabla]
        return de_tabla
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    try:
        offr, _ = _campo(plain, fila, J.F_RAMA)
    except Ilegal:
        return de_tabla
    rama = struct.unpack_from("<I", plain, offr)[0]
    return _marcas_por_mapa(mapa, rareza, rama)


def arboles_rotos(plain):
    """[fila] de jugadores cuyo arbol no esta como lo dejaria el juego (O-177)."""
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    fuera = []
    for fila in range(min(6000, len(ident))):
        if not ident[fila]:
            continue
        esperado = _arbol_esperado(plain, fila)
        if esperado is None:
            continue
        if not _arbol_esta_como_toca(plain, esperado):
            fuera.append(fila)
    return fuera


def arreglar_arboles(plain):
    """Abre el arbol hasta su nivel y confirma las tecnicas de todos los que lo
    tengan a medias, y repasa sus marcas de pasivas."""
    rotos = arboles_rotos(plain)
    if not rotos:
        raise Ilegal("no hay ningun arbol a medias")
    buf = bytearray(plain)
    for fila in rotos:
        esperado = _arbol_esperado(plain, fila)
        if esperado is None:
            continue
        _escribir_arbol(buf, esperado)
    plain = bytes(buf)
    for fila in rotos:
        plain = sincronizar_tabla_pasivas(plain, fila)
    return plain, {"jugadores": len(rotos),
                   "que": "arboles abiertos hasta su nivel, anillo girado y tecnicas confirmadas"}


# La pasiva personalizada de un jugador: el decimo campo del registro de
# supertecnicas (`0xB66A2462`, justo detras de las nueve ranuras), que guarda
# el numero de fila del objeto de la mochila, igual que las botas o las
# tecnicas. CONFIRMADO con la partida de Aaron: le puso la 1 a Kevin y la 36 a
# Bunny en el juego y es el unico campo que cambio (NOTAS O-179).
F_PERSONALIZADA = 0xB66A2462


def _es_pasiva_personalizada(id_hex):
    from ievr import opciones as O
    return (id_hex or "").upper() in O.pasivas_personalizadas()


def pasiva_personalizada(plain, fila):
    """(id de la pasiva, slot) que lleva puesta ese jugador, o (None, 0)."""
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    if fila >= len(tecnicas):
        return None, 0
    c, _ = J._campos_de(plain, tecnicas[fila], {F_PERSONALIZADA})
    slot = int.from_bytes(c.get(F_PERSONALIZADA, b""), "little")
    if not slot:
        return None, 0
    f = inventario.por_slot(plain).get(slot)
    return ((f or {}).get("id") or "").upper() or None, slot


def poner_personalizada(plain, fila, nombre):
    """Pone (o quita, con nombre vacio) la pasiva personalizada de un jugador.

    Es un objeto de la mochila, asi que se guarda el numero de fila del objeto
    y se lleva la cuenta de cuantos lo llevan puesto, igual que la equipacion
    (NOTAS O-179). Una por jugador, que es lo que deja el juego.
    """
    from ievr import opciones as O
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= min(6000, len(ident)) or not ident[fila]:
        raise Ilegal("en la fila %d no hay ningun jugador" % fila)
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    try:
        off, n = _campo_en(plain, tecnicas[fila], F_PERSONALIZADA)
    except Ilegal:
        raise Ilegal("esa ficha no tiene el campo de pasiva personalizada")
    antes = struct.unpack_from("<I", plain, off)[0]
    porslot = inventario.por_slot(plain)
    nombres = tlv.nombres()
    texto_antes = "ninguna"
    if antes and antes in porslot:
        texto_antes = O.nombre_pasiva(porslot[antes].get("id", ""), "?")

    texto = (nombre or "").strip()
    if not texto:
        if not antes:
            raise Ilegal("ese jugador no lleva ninguna pasiva personalizada")
        buf = bytearray(plain)
        struct.pack_into("<I", buf, off, 0)
        plain = bytes(buf)
        if antes in porslot:
            plain = inventario.ajustar_equipada(plain, porslot[antes], -1)
        return plain, {"fila": fila, "antes": texto_antes, "despues": "ninguna"}

    id_hex = texto.upper()
    if not (len(id_hex) == 8 and all(c in "0123456789ABCDEF" for c in id_hex)):
        id_hex = None
        for k in O.pasivas_personalizadas():
            if _sin_marcadores(O.nombre_pasiva(k, "")) == _sin_marcadores(texto):
                id_hex = k
                break
        if id_hex is None:
            raise Ilegal("no encuentro ninguna pasiva personalizada que se llame %r" % texto)
    if id_hex not in O.pasivas_personalizadas():
        raise Ilegal("%s no es una pasiva personalizada" % id_hex)
    poseidas = inventario.filas_poseidas(plain).get(id_hex)
    if not poseidas:
        raise Ilegal("no tienes ningun manual de esa pasiva personalizada en la "
                     "mochila, y la partida guarda una referencia a TU copia")
    nueva = poseidas[0]
    if antes == nueva["slot"]:
        raise Ilegal("ya lleva esa pasiva personalizada")
    buf = bytearray(plain)
    struct.pack_into("<I", buf, off, nueva["slot"])
    plain = bytes(buf)
    if antes and antes in porslot:
        plain = inventario.ajustar_equipada(plain, porslot[antes], -1)
    plain = inventario.ajustar_equipada(plain, inventario.por_slot(plain)[nueva["slot"]], +1)
    return plain, {"fila": fila, "antes": texto_antes,
                   "despues": O.nombre_pasiva(id_hex, nombres.get(id_hex, (texto,))[0])}


# --- Las pasivas de un gerente o un entrenador (NOTAS O-185) -------------------
#
# No van en las cinco ranuras de la ficha (`0x66B81DAF`), que siguen con las de
# jugador: van en la **tabla de pasivas con numero** (la de O-166), cinco por
# persona. Un gerente o entrenador de fabrica llega con ellas puestas; a uno
# convertido la tabla se le queda a cero, y por eso salian vacias. Cada una es
# ademas un objeto de la mochila y el contador "cuantos la llevan"
# (`0xEDC3670F`) cuadra exactamente con las veces que aparece en las tablas
# (comprobado en la partida de Aaron: 83 de 83, sin un solo descuadre).


def rol_de_personal(plain, fila):
    """"gerente", "entrenador" o "" segun la medalla que lleve puesta."""
    from ievr import equipos as EQ
    try:
        return EQ.medalla_de(plain, fila << 16) or ""
    except Exception:
        return ""


def pasivas_personal_puestas(plain, fila):
    """[(ranura, id, valor)] de las cinco ranuras de personal de ese jugador."""
    fuera = []
    for k, x in enumerate(J.tabla_pasivas(plain, fila) or []):
        fuera.append((k + 1, x["id"], x["valor"]))
    return fuera


def poner_pasiva_personal(plain, fila, ranura, nombre):
    """Cambia una de las cinco pasivas de un gerente o entrenador (O-185).

    Un gerente solo puede llevar pasivas de gerente y un entrenador solo de
    entrenador: en la partida de Aaron no hay ni una sola mezclada.
    """
    from ievr import opciones as O
    if not 1 <= ranura <= 5:
        raise Ilegal("la ranura de pasiva tiene que ir de 1 a 5")
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= min(6000, len(ident)) or not ident[fila]:
        raise Ilegal("en la fila %d no hay ningun jugador" % fila)
    rol = rol_de_personal(plain, fila)
    if rol not in ("gerente", "entrenador"):
        raise Ilegal("ese no es gerente ni entrenador: las pasivas de personal "
                     "solo las tiene quien lleva la medalla")

    texto = (nombre or "").strip()
    id_hex = None
    de_rol = O.pasivas_de_personal_del_rol(rol)
    if len(texto) == 8 and all(c in "0123456789abcdefABCDEF" for c in texto):
        id_hex = texto.upper()
    else:
        for k in de_rol:
            if _sin_marcadores(O.nombre_pasiva(k, "")) == _sin_marcadores(texto):
                id_hex = k
                break
        if id_hex is None:
            raise Ilegal("no encuentro ninguna pasiva de %s que se llame %r" % (rol, texto))
    if id_hex not in de_rol:
        otro = "entrenador" if rol == "gerente" else "gerente"
        if id_hex in O.pasivas_de_personal_del_rol(otro):
            raise Ilegal("esa es una pasiva de %s y este es %s: no se mezclan" % (otro, rol))
        raise Ilegal("%s no es una pasiva de %s" % (id_hex, rol))
    # las de clave 100 son solo de Diamantes (NOTAS O-198)
    if id_hex not in O.pasivas_personal_legales(plain, fila, rol):
        raise Ilegal("%s es una pasiva de Diamante: solo la lleva un %s Diamante"
                     % (O.nombre_pasiva(id_hex, id_hex), rol))
    poseidas = inventario.filas_poseidas(plain).get(id_hex)
    if not poseidas:
        raise Ilegal("no tienes ningun manual de esa pasiva en la mochila")

    pos = J.pos_tabla_pasivas(plain, fila, ranura - 1)
    if pos is None:
        raise Ilegal("esa fila no esta en la tabla de pasivas de la partida")
    antes = plain[pos + 8:pos + 12].hex().upper()
    if antes == id_hex:
        raise Ilegal("ya lleva esa pasiva en esa ranura")
    valor = valor_de_pasiva_personal(plain, fila, id_hex)
    buf = bytearray(plain)
    buf[pos + 8:pos + 12] = bytes.fromhex(id_hex)
    struct.pack_into("<f", buf, pos + 20, float(valor))
    if not buf[pos + 32]:
        buf[pos + 32] = 1               # desbloqueada, como las de fabrica
    plain = bytes(buf)
    # el contador de "cuantos la llevan", como con la equipacion
    porid = {f["id"].upper(): f for f in inventario.todas_las_filas(plain)}
    if antes != "00000000" and antes in porid:
        plain = inventario.ajustar_equipada(plain, porid[antes], -1)
    porid = {f["id"].upper(): f for f in inventario.todas_las_filas(plain)}
    if id_hex in porid:
        plain = inventario.ajustar_equipada(plain, porid[id_hex], +1)
    return plain, {"fila": fila, "ranura": ranura, "rol": rol,
                   "antes": O.nombre_pasiva(antes, "vacia") if antes != "00000000" else "vacia",
                   "despues": O.texto_con_valor(id_hex, valor, id_hex)}


def valor_de_pasiva_personal(plain, fila, id_hex):
    """El numero que el juego guarda en la tabla para esa pasiva en ESE gerente
    o entrenador: el de la version de la pasiva para su rareza (NOTAS O-197).
    Cuadra en los 915 casos de la partida de Aaron: un gerente de rareza 4 con
    "AT de tiro +4 %" lleva +6 %."""
    from ievr import opciones as O
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    return O.valor_de_pasiva(O.variante_por_rareza(id_hex, rareza))


def pasivas_personal_desajustadas(plain):
    """[(fila, ranura)] de gerentes y entrenadores cuya tabla lleva una pasiva
    con un valor que no es el de su rareza (las puso una version anterior del
    editor con el valor base, O-197)."""
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    fuera = []
    for fila in range(min(6000, len(ident))):
        if not ident[fila] or rol_de_personal(plain, fila) not in ("gerente", "entrenador"):
            continue
        for k, x in enumerate(J.tabla_pasivas(plain, fila) or []):
            if x["id"] == "00000000":
                continue
            if abs(x["valor"] - valor_de_pasiva_personal(plain, fila, x["id"])) > 1e-3:
                fuera.append((fila, k))
    return fuera


def actualizar_pasivas_personal(plain, fila):
    """Deja las pasivas de personal de ESE gerente o entrenador con el valor de
    su rareza actual (si se le sube la rareza, suben; O-197). Devuelve plain."""
    if rol_de_personal(plain, fila) not in ("gerente", "entrenador"):
        return plain
    buf = None
    for k, x in enumerate(J.tabla_pasivas(plain, fila) or []):
        if x["id"] == "00000000":
            continue
        bueno = valor_de_pasiva_personal(plain, fila, x["id"])
        if abs(x["valor"] - bueno) > 1e-3:
            pos = J.pos_tabla_pasivas(plain, fila, k)
            if buf is None:
                buf = bytearray(plain)
            struct.pack_into("<f", buf, pos + 20, float(bueno))
    return bytes(buf) if buf is not None else plain


def arreglar_pasivas_personal(plain):
    """Pone a cada pasiva de personal el valor de su rareza."""
    mal = pasivas_personal_desajustadas(plain)
    if not mal:
        raise Ilegal("todas las pasivas de personal llevan su valor")
    buf = bytearray(plain)
    for fila, k in mal:
        pos = J.pos_tabla_pasivas(plain, fila, k)
        idh = plain[pos + 8:pos + 12].hex().upper()
        struct.pack_into("<f", buf, pos + 20, float(valor_de_pasiva_personal(plain, fila, idh)))
    return bytes(buf), {"jugadores": len({f for f, _ in mal}), "pasivas": len(mal),
                        "que": "pasivas de personal con el valor de su rareza"}


def dar_pasivas_personal(plain, cantidad=99):
    """Pone `cantidad` de cada pasiva de gerente y de entrenador en la mochila,
    creando la fila de las que no se tengan (NOTAS O-185)."""
    from ievr import opciones as O
    if not 1 <= cantidad <= TOPE_CANTIDAD:
        raise Ilegal("la cantidad va de 1 a %d" % TOPE_CANTIDAD)
    todas = sorted(O.pasivas_de_personal_del_rol("gerente")
                   | O.pasivas_de_personal_del_rol("entrenador"))
    return _dar_de_todo(plain, todas, cantidad, "pasivas de gerente y entrenador")


def _dar_de_todo(plain, todas, cantidad, que):
    """Pone `cantidad` de cada cosa de la lista en la mochila, creando la fila
    de las que falten copiando la forma de una hermana."""
    poseidas = inventario.filas_poseidas(plain)
    modelo = None
    for idh in todas:
        f = (poseidas.get(idh) or [None])[0]
        if f is not None and f.get("kind") == inventario.KIND_REAL and f["slot"]:
            modelo = f
            break
    if modelo is None:
        raise Ilegal("no tienes ninguna en la mochila, asi que no se de que tramo "
                     "copiar la forma. No escribo nada.")
    bloque = None
    for b in inventario.bloques(plain):
        if any(x["slot_off"] == modelo["slot_off"] for x in b["filas"]):
            bloque = b
            break
    if bloque is None:
        raise Ilegal("no encuentro el tramo de la mochila donde van")
    creadas = subidas = 0
    buf = bytearray(plain)
    libres = [(i, f) for i, f in enumerate(bloque["filas"])
              if f["slot"] == 0 and f.get("id") == "00000000"]
    serie = max((f.get("serie", 0) for f in inventario.todas_las_filas(plain)), default=0)
    for idh in todas:
        f = (poseidas.get(idh) or [None])[0]
        if f is not None and "cantidad_off" in f:
            if f["cantidad"] != cantidad:
                struct.pack_into("<I", buf, f["cantidad_off"], cantidad)
                subidas += 1
            continue
        if not libres:
            raise Ilegal("no quedan filas libres en el tramo de la mochila para "
                         "crear las que faltan (van %d)" % creadas)
        pos, libre = libres.pop(0)
        serie += 1
        slot = inventario.componer_slot(bloque["clase"], bloque["tipo"], pos)
        struct.pack_into("<I", buf, libre["slot_off"] + 8, slot)
        buf[libre["id_off"]:libre["id_off"] + 4] = bytes.fromhex(idh)
        struct.pack_into("<I", buf, libre["serie_off"], serie)
        buf[libre["kind_off"]] = inventario.KIND_REAL
        buf[libre["sub_off"]] = modelo.get("sub", 2)
        struct.pack_into("<I", buf, libre["cantidad_off"], cantidad)
        creadas += 1
    return bytes(buf), {"que": que, "cuantas": cantidad, "creadas": creadas,
                        "actualizadas": subidas, "total": len(todas)}


# --- Sinergias en la mochila (NOTAS O-194) --------------------------------------
#
# Aaron compro tres en el juego y las tres cayeron en el **mismo tramo que las
# tacticas de equipo y los escudos** (clase 0, tipo 6), con la misma forma de
# fila: sin cantidad, `kind` 3 y `sub` 2 (las tacticas llevan `sub` 1). Se
# tienen o no se tienen.
SUB_SINERGIA = 2


def _bloque_de_sinergias(plain):
    from ievr import opciones as O
    ids = {sn["item_id"] for sn in O.sinergias()}
    ids |= {f["id"].upper() for f in reglas._tabla("nombres-es.csv")
            if f.get("categoria") in ("tactica-objeto", "escudo")}
    return inventario.bloque_con(plain, ids)


def anadir_sinergia(plain, item_id):
    """Crea en la mochila la fila de una sinergia que no se tiene (O-194)."""
    from ievr import opciones as O
    item_id = (item_id or "").upper()
    sn = O.sinergia_por_objeto().get(item_id)
    if not sn:
        raise Ilegal("%s no es ninguna sinergia del juego" % item_id)
    if inventario.filas_poseidas(plain).get(item_id):
        raise Ilegal("ya tienes la sinergia %s" % sn["nombre"])
    bloque = _bloque_de_sinergias(plain)
    if bloque is None:
        raise Ilegal("no encuentro el tramo de la mochila de las sinergias")
    libre = pos = None
    for i, f in enumerate(bloque["filas"]):
        if f["slot"] == 0 and f.get("id") == "00000000":
            libre, pos = f, i
            break
    if libre is None:
        raise Ilegal("no queda ninguna fila libre en el tramo de las sinergias")
    slot = inventario.componer_slot(bloque["clase"], bloque["tipo"], pos)
    serie = max((f.get("serie", 0) for f in inventario.todas_las_filas(plain)), default=0) + 1
    buf = bytearray(plain)
    struct.pack_into("<I", buf, libre["slot_off"] + 8, slot)
    buf[libre["id_off"]:libre["id_off"] + 4] = bytes.fromhex(item_id)
    struct.pack_into("<I", buf, libre["serie_off"], serie)
    buf[libre["kind_off"]] = inventario.KIND_REAL
    buf[libre["sub_off"]] = SUB_SINERGIA
    if "cantidad_off" in libre:
        struct.pack_into("<I", buf, libre["cantidad_off"], 1)
    if "equipada_off" in libre:
        struct.pack_into("<I", buf, libre["equipada_off"], 0)
    return bytes(buf), {"objeto": sn["nombre"], "categoria": "sinergia", "cantidad": 1,
                        "posicion": pos, "slot": slot, "serie": serie}


def dar_sinergias(plain):
    """Todas las sinergias del juego en la mochila (las que falten)."""
    from ievr import opciones as O
    creadas = 0
    for sn in O.sinergias():
        if inventario.filas_poseidas(plain).get(sn["item_id"]):
            continue
        plain, _ = anadir_sinergia(plain, sn["item_id"])
        creadas += 1
    if not creadas:
        raise Ilegal("ya tienes las %d sinergias" % len(O.sinergias()))
    return plain, {"que": "sinergias en la mochila", "creadas": creadas,
                   "total": len(O.sinergias())}


def dar_personalizadas(plain, cantidad=99):
    """Pone `cantidad` de cada una de las 37 pasivas personalizadas en la
    mochila, creando la fila de las que no se tengan (NOTAS O-179)."""
    from ievr import opciones as O
    if not 1 <= cantidad <= TOPE_CANTIDAD:
        raise Ilegal("la cantidad va de 1 a %d" % TOPE_CANTIDAD)
    return _dar_de_todo(plain, sorted(O.pasivas_personalizadas()), cantidad,
                        "pasivas personalizadas en la mochila")


def sincronizar_tabla_pasivas(plain, fila):
    """Deja la tabla de pasivas con numero de ese jugador (NOTAS O-166) como la
    dejaria el juego con lo que hay ahora en su ficha:

    - gerente o entrenador de fabrica, o Diamante de personal: su juego de
      personal (ids base, numero de su rareza), como Celia Hills o Raika;
    - Idolo o Diamante con la ficha a cero: sus fijas (a la version maxima);
      si es un Diamante sin arquetipo elegido se respeta la pareja 4-5 que ya
      tuviera la tabla, que es la que el jugador eligio en el juego;
    - cualquier otro: la version de su rareza de cada pasiva de la ficha (la
      heredada tapa a la normal), con su numero;
    - gerentes y entrenadores se dejan como esten: sus numeros los pone el
      juego (a un normal convertido con objetos; a uno de fabrica al llegar).
    La marca de desbloqueada se conserva.
    """
    from ievr import opciones as O, equipos as EQ
    if J.tabla_pasivas_base(plain) is None:
        return plain
    actual = J.tabla_pasivas(plain, fila)
    marcas = [x["marca"] for x in actual] if actual else [0] * 5
    ident = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    # en un normal la marca dice si la casilla de esa pasiva esta abierta en el
    # arbol (O-177): nivel 1 -> 00000, nivel 99 -> 11111, como deja el juego
    if ident:
        por_arbol = _marcas_por_arbol(plain, fila)
        if por_arbol is not None:
            marcas = por_arbol
    entradas = None
    if not ident:
        entradas = [("00000000", 0.0)] * 5
    else:
        rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
        arq = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila]
        ident_hex = "%08X" % ident
        try:
            rol = EQ.medalla_de(plain, fila << 16) or ""
        except Exception:
            rol = ""
        off, _ = _campo(plain, fila, J.F_PASIVAS)
        offh, _ = _campo(plain, fila, J.F_HEREDADAS)
        normales = [plain[off + 4 * k:off + 4 * k + 4].hex().upper() for k in range(5)]
        heredadas = [plain[offh + 4 * k:offh + 4 * k + 4].hex().upper() for k in range(5)]
        arq_eff = arq if arq in J.ARQUETIPOS else None
        if rareza == 8:
            # el arquetipo elegido de un Diamante vive en el array 14CDA97F
            # (0 = Brecha; Raika: Afinidad 2 -> Brecha 0, confirmado en el juego)
            arq_eff = _arquetipo_diamante(plain, fila)
        if rol in ("entrenador", "gerente"):
            # Los numeros de las pasivas de personal van por su rareza (O-197) y
            # la marca de desbloqueada la dan las casillas 33-39 del arbol, que
            # el juego abre al entrar en el (O-200): con ellas abiertas, marca 1
            try:
                offm, nm = _campo(plain, fila, J.F_TABLERO)
            except Ilegal:
                return plain
            if nm != 60 or not all(plain[offm + c] for c in CASILLAS_DE_PERSONAL):
                return plain
            buf = None
            for k, x in enumerate(actual or []):
                if x["id"] != "00000000" and not x["marca"]:
                    pos = J.pos_tabla_pasivas(plain, fila, k)
                    if buf is None:
                        buf = bytearray(plain)
                    buf[pos + 32] = 1
            return bytes(buf) if buf is not None else plain
        elif not any(int(x, 16) for x in normales + heredadas) and rareza < 5:
            # ficha sin pasivas (jugadores viejos de la partida): lo que haya en
            # la tabla lo puso el juego, se respeta
            return plain
        else:
            fijas = []
            if rareza >= 5:
                try:
                    offr, _ = _campo(plain, fila, J.F_RAMA)
                    rama = 2 if struct.unpack_from("<I", plain, offr)[0] == 1 else 1
                except Ilegal:
                    rama = 1
                tablero_j = J.array(plain, (J.F_TABLERO_JUEGO, 24000, "I", 4))[fila] if J.ocurrencias(plain, J.F_TABLERO_JUEGO, 24000) else 0
                fijas = O.pasivas_fijas(ident_hex, rama, arq_eff, tablero_j or None)
            entradas = []
            for k in range(5):
                # la heredada tapa a la de la ficha, y la de la ficha a la fija
                if heredadas[k] != "00000000":
                    v = _variante(heredadas[k], rareza)
                    entradas.append((v, _valor(v)))
                elif normales[k] != "00000000" and rareza < 5:
                    # (a un Idolo o Diamante el juego le ignora las de la ficha
                    # y ensena sus fijas: Aaron quiere ver siempre las fijas)
                    v = _variante(normales[k], rareza)
                    entradas.append((v, _valor(v)))
                elif k < len(fijas):
                    entradas.append((fijas[k], _valor(fijas[k])))
                elif rareza >= 5 and actual and actual[k]["id"] != "00000000":
                    # lo que el juego ya le puso (tablero generico, pareja elegida)
                    entradas.append((actual[k]["id"], actual[k]["valor"]))
                else:
                    entradas.append(("00000000", 0.0))
    if entradas is None:
        return plain
    buf = bytearray(plain)
    for k, (pid, valor) in enumerate(entradas[:5]):
        p = J.pos_tabla_pasivas(plain, fila, k)
        if p is None:
            return plain
        buf[p + 8:p + 12] = bytes.fromhex(pid)
        struct.pack_into("<f", buf, p + 20, float(valor))
        buf[p + 32] = marcas[k] if pid != "00000000" else 0
    return bytes(buf)


def _vaciar_tabla_pasivas(buf, plain, fila):
    """Pone a cero los 5 registros de esa fila en la tabla de pasivas con
    numero: la tabla conserva los de quien ocupo la fila antes (NOTAS O-166)."""
    for k in range(5):
        p = J.pos_tabla_pasivas(plain, fila, k)
        if p is not None:
            buf[p + 8:p + 12] = bytes(4)
            struct.pack_into("<f", buf, p + 20, 0.0)
            buf[p + 32] = 0


def _copia_existente(plain, identidad):
    """Un jugador de la partida que sea ese mismo personaje, o None.

    Para un Idolo o un Diamante es la unica fuente fiable de su rareza, su
    arquetipo y sus cinco pasivas, porque en esos no se sortea nada.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    arq = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    for i in range(min(6000, len(ident))):
        if ident[i] != identidad:
            continue
        c, _ = J._campos_de(plain, fichas[i], {J.F_PASIVAS})
        d = c.get(J.F_PASIVAS, b"")
        if len(d) == 20:
            # Ojo: en los Idolos este campo esta VACIO, y es lo correcto. Los 95
            # de la partida lo tienen a cero (NOTAS O-67): sus pasivas no se
            # guardan, las pone el juego. Copiar ese vacio es copiar lo bueno.
            return {"fila": i, "rareza": rareza[i], "arquetipo": arq[i], "pasivas": d}
    return None


def _fila_libre_de_jugador(plain):
    """La primera fila sin nadie. Solo hasta 6000, que es lo que miden los arrays.

    Hay 6048 fichas pero los arrays de identidad, nivel y rareza solo tienen 6000
    huecos. Un jugador en la fila 6000 o mas tendria ficha y no tendria ni nombre
    ni nivel, asi que ahi no se pone nadie.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    for i in range(min(6000, len(ident))):
        if ident[i] == 0:
            return i
    raise Ilegal("no queda ni una fila libre de jugador: las 6000 estan ocupadas")


def _plantilla_de_jugador(plain, evitar):
    """La ficha de un jugador de nivel 1 de la que copiar la forma.

    Los bloques `0x3CAEA0BD`, `0x38AFC2B8` y el de 60 bytes todavia no se
    entienden (NOTAS O-66). En vez de inventarles un valor se copian de un
    jugador recien conseguido de la propia partida, que es un estado que el juego
    produce de verdad.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    for i in range(min(6000, len(ident))):
        if i == evitar or ident[i] == 0 or nivel[i] != 1:
            continue
        c, _ = J._campos_de(plain, fichas[i], {0x3CAEA0BD, 0x38AFC2B8, 0x45E2D879,
                                               J.F_PASIVAS})
        if c.get(0x3CAEA0BD, b"\xff")[0] != 0xFF and any(c.get(J.F_PASIVAS, b"")):
            return i
    raise Ilegal("no hay en tu partida ningun jugador de nivel 1 del que copiar "
                 "la forma de la ficha. No me invento los bytes que no entiendo.")


def _biblioteca_de_tecnicas(plain):
    """{id de tecnica: numero de fila} de las tecnicas a las que ya apunta alguien.

    Las ranuras de supertecnica no guardan la tecnica, guardan el numero de fila
    de la biblioteca (NOTAS O-19). Solo valen las filas que el juego ya usa para
    eso: por eso se miran las que algun jugador tiene puestas, y no cualquier fila
    que lleve ese identificador.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    porslot = inventario.por_slot(plain)
    fuera = {}
    for i in range(min(6000, len(ident))):
        if ident[i] == 0:
            continue
        c, _ = J._campos_de(plain, tecnicas[i], set(J.RANURAS_TECNICAS))
        for h in J.RANURAS_TECNICAS:
            v = int.from_bytes(c.get(h, b""), "little")
            f = porslot.get(v) if v else None
            # Solo filas de tecnica APRENDIDA (sub 10, o 9), que es donde apuntan
            # los jugadores que entrega el juego. Los fichados por el universo
            # apuntan a montones de objetos (sub 1 y 2), y un jugador que apunte
            # ahi el juego lo trata como fichado del universo: le sortea pasivas
            # y solo le ensena tres tecnicas (Terry Archibald, NOTAS O-168).
            # ...y ademas de UNA unidad: los montones de 99 manuales tambien
            # llevan sub 10 (Aiden Froste, O-168) y el juego los trata igual
            if (f is not None and f.get("kind") == inventario.KIND_REAL
                    and f.get("sub") in (9, 10) and f.get("cantidad") == 1):
                fuera.setdefault(f["id"], (v, f))
    return fuera


def _meter_en_biblioteca(plain, id_tec, modelo):
    """Crea la fila de biblioteca de una supertecnica y devuelve su numero.

    Un jugador nuevo trae sus tecnicas puestas, asi que si el jugador no las
    tiene hay que crearlas igual que se crea un objeto (NOTAS O-62 y O-63): en el
    tramo que les toca, en una fila libre, con el numero de fila calculado y
    copiando la forma de una fila de biblioteca que el juego ya use.
    """
    bloque = None
    for b in inventario.bloques(plain):
        if any(f["slot_off"] == modelo["slot_off"] for f in b["filas"]):
            bloque = b
            break
    if bloque is None:
        raise Ilegal("no encuentro el tramo de la biblioteca de tecnicas")

    libre = pos = None
    for i, f in enumerate(bloque["filas"]):
        if f["slot"] == 0 and f.get("id") == "00000000":
            libre, pos = f, i
            break
    if libre is None:
        raise Ilegal("no queda sitio en el tramo de tecnicas aprendidas")

    slot = inventario.componer_slot(bloque["clase"], bloque["tipo"], pos)
    serie = max((f.get("serie", 0) for f in inventario.todas_las_filas(plain)),
                default=0) + 1
    buf = bytearray(plain)
    struct.pack_into("<I", buf, libre["slot_off"] + 8, slot)
    buf[libre["id_off"]:libre["id_off"] + 4] = bytes.fromhex(id_tec)
    struct.pack_into("<I", buf, libre["serie_off"], serie)
    buf[libre["kind_off"]] = inventario.KIND_REAL
    # una tecnica aprendida: sub 10, una unidad, y un jugador que la lleva
    # (como las filas que crea el juego al invocar; NOTAS O-168)
    buf[libre["sub_off"]] = 10
    struct.pack_into("<I", buf, libre["cantidad_off"], 1)
    if "equipada_off" in libre:
        struct.pack_into("<I", buf, libre["equipada_off"], 1)
    return bytes(buf), slot


def _pasivas_del_nuevo(plain, identidad, arquetipo, fila):
    """Las cinco pasivas que le tocan, cada ranura con su regla (NOTAS O-51, O-57).

    Ranuras 1 y 2: del sorteo propio del personaje. Ranura 3: del grupo de su
    arquetipo. Ranuras 4 y 5: la pareja del arquetipo, copiada de un jugador real
    para no inventarse una combinacion que el juego no da.
    """
    pool = _pool_del_personaje(identidad)
    if len(pool) < 2:
        raise Ilegal("no tengo las pasivas que puede sacar ese personaje, asi que "
                     "no puedo darle unas legales. No escribo nada.")
    # dos distintas al azar de su pool, como sortea el juego (NOTAS O-51, O-57)
    import random
    elegidas = random.sample([f["pasiva_id"].upper() for f in pool], 2)
    uno, dos = elegidas

    candidatas = [f["id"].upper() for f in reglas._tabla("pasivas-por-ranura.csv")
                  if f["grupo"] == "%s (ranura 3)" % arquetipo]
    tercera = random.choice(candidatas) if candidatas else None
    if tercera is None:
        raise Ilegal("no tengo las pasivas de ranura 3 del arquetipo %s" % arquetipo)

    valores = {v: k for k, v in J.ARQUETIPOS.items()}
    pareja, de_quien = _pareja_de_pasivas(plain, valores[arquetipo], fila)
    return (bytes.fromhex(uno) + bytes.fromhex(dos) + bytes.fromhex(tercera)
            + pareja), de_quien


def _tecnicas_de_salida(plain, ficha_base, identidad_hex, cuantas):
    """Las referencias de biblioteca de las `cuantas` primeras tecnicas del
    personaje (3 un normal, 6 un Idolo, 9 un Diamante), creando en la
    biblioteca las que falten. Devuelve (plain, refs, creadas)."""
    biblioteca = _biblioteca_de_tecnicas(plain)
    nombres_tec = {}
    for f in reglas._tabla("nombres-es.csv"):
        if f.get("categoria") == "supertecnica":
            nombres_tec.setdefault((f.get("nombre_es") or "").strip().lower(),
                                   f["id"].upper())
    modelo_tec = next((f for _v, f in biblioteca.values()), None)
    refs, creadas, sin_nombre = [], [], []
    nuevas = {}   # id de tecnica -> fila creada en esta misma llamada
    # El id exacto de cada tecnica de salida lo dice chara_param (`tec1..tec3`
    # de personajes.csv). El nombre queda solo de respaldo: hay tecnicas cuyo
    # nombre no esta entre las "supertecnica" (Miximax Trans: Raika es un
    # "aura") y con el nombre no se podia fichar a quien las lleva (NOTAS O-161).
    ficha_juego = reglas.personajes().get(identidad_hex) or {}
    # las que el juego no da aunque el arbol las traiga (la tecnica de un
    # kenshin: Guardia sombria en Dardinello, NOTAS O-206): esa ranura se deja
    # vacia, que es como la entrega el juego
    no_se_dan = {f["id"].upper() for f in reglas._tabla("tecnicas-origen.csv")
                 if f.get("obtenible") == "no"}
    for k in range(1, cuantas + 1):
        nom_tec = (ficha_base.get("r%d_tecnica" % k) or "").strip()
        id_tec = (ficha_juego.get("tec%d" % k) or "").strip().upper() or None
        if not nom_tec and not id_tec:
            refs.append(0)
            continue
        if id_tec is None:
            id_tec = nombres_tec.get(nom_tec.lower())
        if id_tec is None:
            sin_nombre.append(nom_tec)
            continue
        if id_tec in no_se_dan:
            refs.append(0)
            continue
        if id_tec in nuevas:
            # la misma tecnica repetida en el arbol (Frente frio x3 de Aiden):
            # una sola fila, como hace el juego, y se suma al contador
            ref = nuevas[id_tec]
            refs.append(ref)
            plain = inventario.ajustar_equipada(plain, inventario.por_slot(plain)[ref], +1)
            continue
        if id_tec in biblioteca:
            ref, fila_bib = biblioteca[id_tec]
            refs.append(ref)
            # un jugador mas la lleva puesta (el juego mantiene ese contador)
            plain = inventario.ajustar_equipada(plain, fila_bib, +1)
            biblioteca = _biblioteca_de_tecnicas(plain)
            continue
        if modelo_tec is None:
            raise Ilegal("no hay en la partida ninguna fila de biblioteca de la "
                         "que copiar la forma. No escribo nada.")
        plain, ref = _meter_en_biblioteca(plain, id_tec, modelo_tec)
        biblioteca = _biblioteca_de_tecnicas(plain)
        nuevas[id_tec] = ref
        refs.append(ref)
        creadas.append(nom_tec)
    if sin_nombre:
        raise Ilegal("no se que identificador tienen estas supertecnicas de %s: "
                     "%s. No escribo nada."
                     % (ficha_base.get("nombre"), ", ".join(sin_nombre)))

    return plain, refs, creadas


def anadir_jugador(plain, nombre, rareza=None, arquetipo=None, nivel=1):
    """Mete en la partida un jugador que no se tiene. Probado en el juego (NOTAS P-10).

    Se crea tal y como lo entrega el juego cuando lo acabas de conseguir: nivel 1,
    sin experiencia, sin equipacion, sin judias, sin pasivas heredadas, 0 partidos
    y sus tres supertecnicas de salida. Lo que se elige es el personaje, la rareza
    y el arquetipo; todo lo demas sale de las reglas, no de una lista escrita a
    mano.

    La rareza no es libre: un personaje normal no puede salir de Idolo ni de
    Diamante, ni al reves. Eso lo dice la propia tabla del juego.
    """
    ficha_base = _personaje_por_nombre(nombre)
    identidad_hex = ficha_base["identidad"].upper()
    identidad = int(identidad_hex, 16)
    familia = _familia_de(identidad_hex)
    if not 1 <= nivel <= NIVEL_MAXIMO:
        raise Ilegal("el nivel va de 1 a %d" % NIVEL_MAXIMO)

    valores = {v.lower(): k for k, v in J.ARQUETIPOS.items()}
    gemelo = _copia_existente(plain, identidad)
    fijo = familia in ("hero", "fabled")

    if fijo:
        # Un Idolo o un Diamante no se sortea: en la partida de Aaron ninguno
        # aparece con dos rarezas distintas, ni con dos arquetipos, ni con dos
        # juegos de pasivas (NOTAS O-67). Asi que no se elige nada. Si ya hay
        # una copia se copia de ella; si no, se saca de las tablas del juego,
        # que dicen lo mismo que las copias (NOTAS O-161): la rareza es la de
        # `personajes.csv`, el arquetipo de un Idolo es la columna 5 de
        # chara_param, un Diamante lleva el 6 ("sin arquetipo", como los 58 de
        # la partida) y las pasivas van vacias, que es como las guarda el juego.
        if rareza is not None or arquetipo is not None:
            raise Ilegal("%s es un %s: su rareza y su arquetipo son los que son y "
                         "el juego no deja elegirlos. Pidemelo sin rareza ni "
                         "arquetipo." % (ficha_base.get("nombre"),
                                         "Idolo" if familia == "hero" else "Diamante"))
        if gemelo is not None:
            rareza, arquetipo_valor = gemelo["rareza"], gemelo["arquetipo"]
            # Las pasivas NO se copian de la copia: el juego las deja a cero al
            # invocar y las fijas van en la tabla de pasivas con numero (O-166).
            # Una copia con pasivas sorteadas (fichada por el universo de
            # jugadores) contaminaba al nuevo (Plink Powai, O-167).
            pasivas, de_quien = bytes(20), None
        else:
            ficha_juego = reglas.personajes().get(identidad_hex) or {}
            try:
                rareza = int(ficha_juego.get("rareza_valor") or "")
                arquetipo_valor = (ARQUETIPO_DIAMANTE if familia == "fabled"
                                   else int(ficha_juego.get("arquetipo_valor") or ""))
            except ValueError:
                raise Ilegal("no se que rareza o arquetipo lleva %s de fabrica "
                             "(falta en personajes.csv). No escribo nada."
                             % ficha_base.get("nombre"))
            # Tambien los Diamantes sin tablero propio: Raika Shinohara
            # invocada con capsulas sale con el campo a cero (NOTAS O-162).
            pasivas, de_quien = bytes(20), None
        arquetipo = J.ARQUETIPOS.get(arquetipo_valor, "sin arquetipo")
    else:
        if rareza is None:
            rareza = RAREZAS_QUE_SE_SUBEN[0]
        elif isinstance(rareza, str):
            nombres = {v.lower(): k for k, v in J.RAREZAS.items()}
            if rareza.strip().lower() not in nombres:
                raise Ilegal("no conozco la rareza %r" % rareza)
            rareza = nombres[rareza.strip().lower()]
        if rareza not in RAREZAS_QUE_SE_SUBEN:
            raise Ilegal("%s es un futbolista normal, y esos salen como: %s"
                         % (ficha_base.get("nombre"),
                            ", ".join(J.RAREZAS[r] for r in RAREZAS_QUE_SE_SUBEN)))
        if arquetipo is None:
            arquetipo = ficha_base.get("arquetipo") or "Brecha"
        arquetipo = str(arquetipo).strip()
        if arquetipo.lower() not in valores:
            raise Ilegal("no conozco el arquetipo %r. Los que hay: %s"
                         % (arquetipo, ", ".join(J.ARQUETIPOS.values())))
        arquetipo = J.ARQUETIPOS[valores[arquetipo.lower()]]
        arquetipo_valor = valores[arquetipo.lower()]
        pasivas = de_quien = None

    fila = _fila_libre_de_jugador(plain)
    modelo = _plantilla_de_jugador(plain, fila)
    if pasivas is None:
        pasivas, de_quien = _pasivas_del_nuevo(plain, identidad, arquetipo, fila)

    # --- las tecnicas de salida, por numero de fila de la biblioteca
    plain, refs, creadas = _tecnicas_de_salida(
        plain, ficha_base, identidad_hex,
        TECNICAS_DE_SALIDA_POR_FAMILIA.get(familia, TECNICAS_DE_SALIDA))

    # --- a partir de aqui ya no puede fallar nada, se escribe
    buf = bytearray(plain)

    def _array(definicion, valor):
        fhash, nbytes, fmt, ancho = definicion
        base = J.ocurrencias(plain, fhash, nbytes)[0] + 8
        struct.pack_into(fmt, buf, base + ancho * fila, valor)

    serie = _siguiente_serie(plain)
    a_poner = dict(VALORES_POR_DEFECTO)
    a_poner[0x918020D9] = _slot_de_jugador(fila, serie)
    a_poner[0xBA162C11] = identidad
    a_poner[0x377173B1] = nivel
    a_poner[0xE9835BD9] = rareza
    a_poner[0x90F47C83] = serie
    a_poner[0x8BA23AC3] = arquetipo_valor
    a_poner[0xD6B65E67] = _identificador_de_copia(plain)
    a_poner[0xBAFA8DBD] = 0   # el tablero se pone despues, segun la familia (O-169)
    fc = _campo_fc_de(identidad_hex)
    if fc is not None:
        a_poner[0xFC830AAC] = fc
    for fhash, ancho, tam, _vacio in ARRAYS_DE_JUGADOR:
        struct.pack_into(FORMATO[ancho], buf,
                         _base_array(plain, fhash, tam) + ancho * fila,
                         a_poner[fhash])
    _array(J.ARRAY_EXP, 0)

    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    cop, _ = J._campos_de(plain, fichas[modelo], {0x45E2D879, 0xBB459017})
    bloque_a, bloque_b, de_donde_aspecto = _bloques_de_aspecto(plain, identidad, modelo)
    cop[0x3CAEA0BD], cop[0x38AFC2B8] = bloque_a, bloque_b
    cop[0x45E2D879] = bytes.fromhex(RANURAS_NIVEL_1.get(familia, RANURAS_NIVEL_1["normal"]))
    for fhash in (0x3CAEA0BD, 0x38AFC2B8, 0x45E2D879, 0xBB459017):
        off, n = _campo(plain, fila, fhash)
        d = cop.get(fhash, b"")
        if len(d) == n:
            buf[off:off + n] = d

    # La copia del nivel que hay en la ficha se queda a 0: los jugadores de
    # nivel 1 de la partida la tienen asi. Es un resto que el juego no mantiene
    # al dia (NOTAS O-15), y ponerla a 1 era una diferencia mas con un jugador
    # de verdad.
    off, _ = _campo(plain, fila, 0x7C27AEEC)
    buf[off] = 0
    off, n = _campo(plain, fila, J.F_PASIVAS)
    buf[off:off + n] = pasivas[:n]
    off, n = _campo(plain, fila, J.F_HEREDADAS)
    buf[off:off + n] = bytes(n)
    off, n = _campo(plain, fila, J.F_JUDIA_TIPO)
    buf[off:off + n] = b"\xff" * n
    off, n = _campo(plain, fila, J.F_JUDIA_CANT)
    buf[off:off + n] = bytes(n)
    off, n = _campo(plain, fila, F_PARTIDOS)
    buf[off:off + n] = bytes(n)

    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    for h, _etiqueta in J.RANURAS_EQUIPO:
        try:
            off, n = _campo_en(plain, equipos[fila], h)
        except Ilegal:
            continue
        buf[off:off + n] = bytes(n)

    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    for k, h in enumerate(J.RANURAS_TECNICAS):
        try:
            off, n = _campo_en(plain, tecnicas[fila], h)
        except Ilegal:
            continue
        valor = refs[k] if k < len(refs) else 0
        struct.pack_into("<I", buf, off, valor)

    _vaciar_tabla_pasivas(buf, plain, fila)
    if rareza == 8:
        _escribir_arquetipo_diamante(buf, plain, fila, identidad_hex)
        arq_dia = _arquetipo_de_serie(identidad_hex)
    else:
        arq_dia = None
    _escribir_tablero(buf, plain, fila, identidad_hex, rareza, arq_dia, a_poner.get(0xFC830AAC))
    info = {"fila": fila, "nombre": ficha_base.get("nombre"),
            "rareza": J.RAREZAS[rareza], "arquetipo": arquetipo,
            "nivel": nivel, "familia": familia,
            "tecnicas": sum(1 for r in refs if r), "copiado_de": modelo,
            "pasivas_de": de_quien, "serie": serie, "creadas": creadas,
            "aspecto": de_donde_aspecto,
            "slot": a_poner[0x918020D9]}
    plain = bytes(buf)
    # Un gerente o entrenador de fabrica llega del juego ya con su medalla
    # puesta (Celia Hills, Nelly Raimon, Percival Travis... en la partida de
    # Aaron, NOTAS O-164). Si no hay medalla en la mochila, se queda de jugador
    # y se avisa.
    ficha_juego = reglas.personajes().get(identidad_hex) or {}
    apt = ("entrenador" if ficha_juego.get("apt_entrenador") else
           "gerente" if ficha_juego.get("apt_gerente") else "")
    if apt and familia == "normal":
        try:
            plain, _ = poner_medalla(plain, fila, apt)
            info["rol"] = apt
        except Ilegal as ex:
            info["aviso"] = "Es %s de fabrica pero se queda de jugador: %s" % (apt, ex)
    return plain, info


# --- borrar jugadores ----------------------------------------------------------

CAMPOS_DE_FICHA_AL_BORRAR = (0x3CAEA0BD, 0x38AFC2B8, 0x45E2D879, 0xBB459017,
                             J.F_PASIVAS, J.F_HEREDADAS, J.F_JUDIA_TIPO,
                             J.F_JUDIA_CANT, 0x8F0E9F49, 0x7C27AEEC)


def _fila_virgen(plain):
    """Una fila de jugador que nunca ha tenido a nadie, para copiar como se ve.

    Se busca por detras del ultimo ocupado: esas no las ha usado el juego nunca,
    asi que valen de modelo de "fila vacia de verdad". Borrar copiando de aqui
    deja la fila igual que las que el juego tiene sin estrenar, en vez de
    inventarse con que valor se vacia cada campo.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    tope = max((i for i in range(min(6000, len(ident))) if ident[i]), default=-1)
    if tope + 1 >= min(6000, len(ident)):
        raise Ilegal("no hay ninguna fila sin estrenar de la que copiar el vacio")
    return tope + 1


def reparar_jugador(plain, fila, vaciar_aspecto=False):
    """Pone al dia a un jugador creado por una version vieja del editor. Probado (P-10).

    Las primeras versiones dejaban a cero `0xD6B65E67`, que es el identificador
    de esa copia (NOTAS O-72), y ponian a ojo `0xFC830AAC`. El juego los guardaba
    igual, pero al pasar por encima ensenaba el nombre y el retrato del jugador
    anterior: no sabia a quien estaba mirando.

    Toca solo esos campos. Ni el nivel, ni la equipacion, ni el equipo en el que
    este: lo que se haya jugado con el se queda como esta.

    `vaciar_aspecto` ademas deja los dos bloques de 30 bytes vacios. Solo se usa
    con Idolos y Diamantes, donde no es una suposicion: **los 95 Idolos de la
    partida los tienen vacios**, y a los creados se les habia copiado los de un
    futbolista normal.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= min(6000, len(ident)) or ident[fila] == 0:
        raise Ilegal("en la fila %d no hay ningun jugador" % fila)
    identidad_hex = "%08X" % ident[fila]

    arreglado = []
    buf = bytearray(plain)

    if _leer_array(plain, fila, 0xD6B65E67, 4, 24000) == 0:
        struct.pack_into("<I", buf, _base_array(plain, 0xD6B65E67, 24000) + 4 * fila,
                         _identificador_de_copia(plain))
        arreglado.append("identificador de la copia")

    fc = _campo_fc_de(identidad_hex)
    if fc is not None and _leer_array(plain, fila, 0xFC830AAC, 1, 6000) != fc:
        buf[_base_array(plain, 0xFC830AAC, 6000) + fila] = fc
        arreglado.append("dato de ficha 0xFC830AAC")

    if vaciar_aspecto:
        for fhash, relleno in ((0x3CAEA0BD, b"\xff"), (0x38AFC2B8, b"\x00")):
            off, n = _campo(plain, fila, fhash)
            if plain[off:off + n] != relleno * n:
                buf[off:off + n] = relleno * n
                arreglado.append("bloque %08X vaciado" % fhash)

    if not arreglado:
        raise Ilegal("el jugador de la fila %d ya esta bien; no hay nada que "
                     "arreglar" % fila)
    return bytes(buf), {"fila": fila,
                        "nombre": reglas.quien_es(ident[fila])[0] or identidad_hex,
                        "arreglado": arreglado}


def equipos_del_jugador(plain, fila):
    """Los nombres de los equipos en los que esta ese jugador (campo, banquillo
    o cuerpo tecnico). [] si esta suelto."""
    from ievr import equipos as EQ
    slot = EQ.slot_de_fila(plain, fila)
    fuera = []
    for t in EQ.todos(plain, solo_con_nombre=False):
        try:
            e = EQ.leer(plain, t["hueco"])
        except EQ.Ilegal:
            continue
        if any(m["jugador"] == slot for m in e["miembros"]):
            fuera.append(t["nombre"] or "un equipo de la historia (hueco %d)" % t["hueco"])
    return fuera


def borrar_jugador(plain, fila):
    """Quita un jugador de la partida. Probado en el juego (NOTAS P-10).

    Hace lo mismo que hace el juego cuando lo borras tu: se comprobo comparando
    la partida de Aaron antes y despues de que borrase 169 jugadores desde el
    menu, y son estos campos y no otros (NOTAS O-68).

    Se niega si el jugador lleva algo equipado: cada objeto guarda cuantos
    jugadores lo llevan puesto, y borrar sin mas dejaria esa cuenta mal.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= min(6000, len(ident)) or ident[fila] == 0:
        raise Ilegal("en la fila %d no hay ningun jugador" % fila)
    # Regla de Aaron: al que esta en algun equipo (campo, banquillo o cuerpo
    # tecnico) no se le borra; primero se le saca del equipo.
    en = equipos_del_jugador(plain, fila)
    if en:
        raise Ilegal("esta en el equipo %s. Sacalo del equipo primero y luego ya "
                     "se puede borrar." % ", ".join(en))
    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    puesto, _ = J._campos_de(plain, equipos[fila], {h for h, _ in J.RANURAS_EQUIPO})
    if any(int.from_bytes(v, "little") for v in puesto.values()):
        raise Ilegal("el jugador de la fila %d lleva algo equipado. Quitaselo "
                     "primero, que si no la cuenta de ese objeto queda mal." % fila)

    nombre = reglas.quien_es(ident[fila])[0] or "%08X" % ident[fila]
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    virgen = _fila_virgen(plain)
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)

    buf = bytearray(plain)
    _vaciar_tabla_pasivas(buf, plain, fila)
    for fhash, ancho, tam, vacio in ARRAYS_DE_JUGADOR:
        struct.pack_into(FORMATO[ancho], buf,
                         _base_array(plain, fhash, tam) + ancho * fila, vacio)
    struct.pack_into("<I", buf,
                     _base_array(plain, J.ARRAY_EXP[0], J.ARRAY_EXP[1]) + 4 * fila, 0)

    limpio, _ = J._campos_de(plain, fichas[virgen], set(CAMPOS_DE_FICHA_AL_BORRAR))
    for fhash in CAMPOS_DE_FICHA_AL_BORRAR:
        try:
            off, n = _campo(plain, fila, fhash)
        except Ilegal:
            continue
        d = limpio.get(fhash)
        if d is not None and len(d) == n:
            buf[off:off + n] = d

    for h in J.RANURAS_TECNICAS:
        try:
            off, n = _campo_en(plain, tecnicas[fila], h)
        except Ilegal:
            continue
        buf[off:off + n] = bytes(n)

    return bytes(buf), {"fila": fila, "nombre": nombre, "nivel": nivel}


APARICIONES_DE_UN_JUGADOR_SUELTO = 3


def repetidos_de_nivel_1(plain):
    """Las filas que se pueden borrar sin perder nada: copias de sobra a nivel 1.

    Se deja siempre una copia de cada personaje, la mas antigua. Y se dejan en
    paz los Idolos, los Diamantes y cualquiera que lleve algo encima, aunque este
    repetido: esos no son relleno.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)

    porid = {}
    for i in range(min(6000, len(ident))):
        if ident[i]:
            porid.setdefault(ident[i], []).append(i)

    fuera = []
    for identidad, filas in porid.items():
        if len(filas) < 2:
            continue
        serie = {i: _leer_array(plain, i, 0x90F47C83, 4, 24000) for i in filas}
        se_queda = min(filas, key=lambda i: (serie[i] == 0, serie[i]))
        for i in filas:
            if i == se_queda or nivel[i] != 1 or rareza[i] in (5, 6, 7, 8):
                continue
            puesto, _ = J._campos_de(plain, equipos[i], {h for h, _ in J.RANURAS_EQUIPO})
            if any(int.from_bytes(v, "little") for v in puesto.values()):
                continue
            c, _ = J._campos_de(plain, fichas[i], {J.F_HEREDADAS, J.F_JUDIA_CANT})
            if any(c.get(J.F_HEREDADAS, b"")) or any(c.get(J.F_JUDIA_CANT, b"")):
                continue
            fuera.append(i)

    # Ultimo filtro, y el importante: que el numero de fila del jugador no
    # aparezca en mas sitios de los normales. Un jugador suelto aparece 3 veces
    # en la partida; uno metido en un equipo aparece 5, 7, 12 o 18, porque las
    # alineaciones guardan ese numero (NOTAS O-70). Borrar uno que este en un
    # equipo dejaria la alineacion apuntando al vacio.
    seguros = []
    for i in fuera:
        numero = _leer_array(plain, i, 0x918020D9, 4, 24000)
        if plain.count(struct.pack("<I", numero)) <= APARICIONES_DE_UN_JUGADOR_SUELTO:
            seguros.append(i)
    return sorted(seguros)


def limpiar_repetidos(plain, tope=None):
    """Borra las copias de sobra a nivel 1. Deja una de cada personaje.

    Hace lo mismo que `borrar_jugador` pero de una tacada. No lo llama una vez
    por jugador a proposito: esa funcion vuelve a recorrer los 12 MB de la
    partida para localizar cada campo, y con 1.900 jugadores eso son horas. Aqui
    se busca todo una vez y despues solo se escribe.
    """
    filas = repetidos_de_nivel_1(plain)
    if tope is not None:
        filas = filas[:tope]
    if not filas:
        raise Ilegal("no hay ninguna copia repetida de nivel 1 que se pueda quitar")

    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    quitados = {reglas.quien_es(ident[i])[0] for i in filas}

    bases = {fh: _base_array(plain, fh, tam)
             for fh, _a, tam, _v in ARRAYS_DE_JUGADOR}
    base_exp = _base_array(plain, J.ARRAY_EXP[0], J.ARRAY_EXP[1])
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    virgen = _fila_virgen(plain)
    limpio, _ = J._campos_de(plain, fichas[virgen], set(CAMPOS_DE_FICHA_AL_BORRAR))
    quiero_ficha = set(CAMPOS_DE_FICHA_AL_BORRAR)
    quiero_tecnica = set(J.RANURAS_TECNICAS)

    buf = bytearray(plain)
    for fila in filas:
        for fh, ancho, _tam, vacio in ARRAYS_DE_JUGADOR:
            struct.pack_into(FORMATO[ancho], buf, bases[fh] + ancho * fila, vacio)
        struct.pack_into("<I", buf, base_exp + 4 * fila, 0)

        ini, _ = tlv.inicio_registro(plain, fichas[fila])
        for off, fh, n, _d in tlv.campos_desde(plain, ini, maximo=25):
            if fh in quiero_ficha:
                d = limpio.get(fh)
                if d is not None and len(d) == n:
                    buf[off + 8:off + 8 + n] = d

        ini, _ = tlv.inicio_registro(plain, tecnicas[fila])
        for off, fh, n, _d in tlv.campos_desde(plain, ini, maximo=25):
            if fh in quiero_tecnica:
                buf[off + 8:off + 8 + n] = bytes(n)

    return bytes(buf), {"cuantos": len(filas), "filas": filas,
                        "distintos": len(quitados)}


def quitar_heredada(plain, fila, ranura):
    """Quita la pasiva heredada de una ranura. Debajo vuelve a verse la normal.

    Las heredadas van en su propio campo (`0xB30A7BA1`) y **tapan** a la normal
    de su misma ranura sin borrarla (NOTAS O-24). Asi que quitarla es poner esos
    cuatro bytes a cero: la de siempre reaparece sola.
    """
    if not 1 <= ranura <= 5:
        raise Ilegal("la ranura de pasiva tiene que ir de 1 a 5")
    off, n = _campo(plain, fila, J.F_HEREDADAS)
    if n != 20:
        raise Ilegal("la ficha %d no tiene el campo de pasivas heredadas" % fila)
    antes = plain[off + 4 * (ranura - 1):off + 4 * ranura]
    if not any(antes):
        raise Ilegal("en la ranura %d no hay ninguna pasiva heredada" % ranura)
    buf = bytearray(plain)
    buf[off + 4 * (ranura - 1):off + 4 * ranura] = bytes(4)
    nombres = tlv.nombres()
    # cual vuelve a verse
    offn, _ = _campo(plain, fila, J.F_PASIVAS)
    debajo = plain[offn + 4 * (ranura - 1):offn + 4 * ranura].hex().upper()
    return bytes(buf), {
        "fila": fila, "ranura": ranura,
        "antes": _sin_marcadores(nombres.get(antes.hex().upper(), ("?",))[0])[:60],
        "despues": (_sin_marcadores(nombres.get(debajo, ("",))[0])[:60]
                    if debajo != "00000000" else "vacia")}


def arreglar_heredadas(plain):
    """Deja a todo el mundo con como mucho TOPE_HEREDADAS pasivas heredadas.

    Aaron tiene 52 jugadores con las cinco ranuras llenas. No los hizo el juego:
    los hizo el probando con Cheat Engine, y en el juego el tope son tres
    (NOTAS O-107). Esto vacia las de mas **empezando por el final**, que es lo
    que pidio: cuales se quiten da igual.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    buf = bytearray(plain)
    tocados = quitadas = 0
    for fila in range(min(6000, len(ident))):
        if not ident[fila]:
            continue
        try:
            off, n = _campo(plain, fila, J.F_HEREDADAS)
        except Ilegal:
            continue
        if n != 20:
            continue
        llenas = [k for k in range(5) if any(buf[off + 4 * k:off + 4 * k + 4])]
        if len(llenas) <= TOPE_HEREDADAS:
            continue
        for k in llenas[TOPE_HEREDADAS:]:
            buf[off + 4 * k:off + 4 * k + 4] = bytes(4)
            quitadas += 1
        tocados += 1
    if not tocados:
        raise Ilegal("no hay ningun jugador con mas de %d pasivas heredadas"
                     % TOPE_HEREDADAS)
    return bytes(buf), {"jugadores": tocados, "quitadas": quitadas,
                        "que": "heredadas de mas quitadas"}


def tecnicas_rotas(plain):
    """[(fila, ranura, id)] de ranuras de tecnica de Idolos y Diamantes que
    apuntan a un monton de manuales en vez de a una fila aprendida (O-171).

    Solo se miran los que tienen tablero asignado (0xBAFA8DBD distinto de 0):
    a esos el juego siempre les deja filas aprendidas (vienen de la capsula o
    de una semilla), asi que un monton ahi lo puso el editor. A los fichados
    del universo (tablero 0) el propio juego los apunta a montones (O-168), y
    eso no se toca."""
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    occ = J.ocurrencias(plain, J.F_TABLERO_JUEGO, 24000)
    if not occ:
        return []
    tablero = J.array(plain, (J.F_TABLERO_JUEGO, 24000, "I", 4))
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    porslot = inventario.por_slot(plain)
    fuera = []
    for fila in range(min(6000, len(ident))):
        if not ident[fila] or not tablero[fila]:
            continue
        c, _ = J._campos_de(plain, tecnicas[fila], set(J.RANURAS_TECNICAS))
        for k, h in enumerate(J.RANURAS_TECNICAS):
            v = int.from_bytes(c.get(h, b""), "little")
            if not v:
                continue
            f = porslot.get(v)
            if f is not None and not _es_fila_aprendida(f) and f.get("id"):
                fuera.append((fila, k + 1, f["id"].upper()))
    return fuera


def arreglar_tecnicas(plain):
    """Las ranuras que apuntan a montones de manuales pasan a apuntar a filas
    de tecnica aprendida (las que ya haya, o nuevas). Es lo que deja el juego,
    y lo que hace falta para que la tecnica se vea sin pasar por el arbol.

    Se hace todo sobre un solo buffer y los contadores de "cuantos la llevan"
    se ajustan al final, que con cientos de ranuras (Aaron tenia 322) hacerlo
    de una en una tardaba minuto y medio."""
    rotas = tecnicas_rotas(plain)
    if not rotas:
        raise Ilegal("no hay ninguna ranura de tecnica que apunte a un monton de manuales")
    biblioteca = _biblioteca_de_tecnicas(plain)
    bib = {k: v[0] for k, v in biblioteca.items()}
    modelo = next((f for _v, f in biblioteca.values()), None)
    if modelo is None:
        raise Ilegal("no hay en la partida ninguna fila de tecnica aprendida de la "
                     "que copiar la forma")
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    # los offsets de las ranuras no cambian: solo se sobreescriben bytes
    offsets = {(fila, ranura): _campo_en(plain, tecnicas[fila], J.RANURAS_TECNICAS[ranura - 1])[0]
               for fila, ranura, _ in rotas}
    deltas = {}
    buf = bytearray(plain)
    tocados = set()
    for fila, ranura, id_hex in rotas:
        if id_hex in bib:
            slot_nuevo = bib[id_hex]
            deltas[slot_nuevo] = deltas.get(slot_nuevo, 0) + 1
        else:
            # la fila nueva ya nace con un jugador que la lleva
            nuevo, slot_nuevo = _meter_en_biblioteca(bytes(buf), id_hex, modelo)
            buf = bytearray(nuevo)
            bib[id_hex] = slot_nuevo
        off = offsets[(fila, ranura)]
        antes = struct.unpack_from("<I", buf, off)[0]
        deltas[antes] = deltas.get(antes, 0) - 1
        struct.pack_into("<I", buf, off, slot_nuevo)
        tocados.add(fila)
    plain = bytes(buf)
    porslot = inventario.por_slot(plain)
    for slot, d in deltas.items():
        f = porslot.get(slot)
        if d and f is not None and "equipada_off" in f:
            struct.pack_into("<I", buf, f["equipada_off"], max(0, f["equipada"] + d))
    return bytes(buf), {"jugadores": len(tocados), "ranuras": len(rotas),
                        "que": "tecnicas apuntadas a filas aprendidas"}


def cambiar_rama(plain, fila):
    """Cambia el arbol de habilidades a la otra rama.

    En el juego se hace pulsando el nudo del medio del arbol. Aaron lo hizo con
    Zanark Avalonic y guardo la partida, y comparando las dos se ve exactamente
    que toca el juego (NOTAS O-115):

    - el campo `0x72479F6E` pasa de 0 a 1 (o al reves), y
    - las casillas cogidas se **mudan** del tramo de una rama al de la otra,
      las mismas y en el mismo orden.

    Las del tronco y las del tercer tramo no se tocan.
    """
    off, n = _campo(plain, fila, J.F_TABLERO)
    if n != 60:
        raise Ilegal("la ficha %d no tiene el mapa del arbol" % fila)
    offr, nr = _campo(plain, fila, J.F_RAMA)
    if nr != 4:
        raise Ilegal("la ficha %d no tiene el campo de rama" % fila)
    import struct
    ahora = struct.unpack_from("<I", plain, offr)[0]
    if ahora not in (0, 1):
        raise Ilegal("ese jugador tiene un valor de rama raro (%d)" % ahora)

    a, b = (J.TRAMO_RAMA1, J.TRAMO_RAMA2) if ahora == 0 else (J.TRAMO_RAMA2, J.TRAMO_RAMA1)
    cogidas = [x for x in plain[off + a[0]:off + a[1]] if x]
    if not cogidas and not any(plain[off + b[0]:off + b[1]]):
        raise Ilegal("ese jugador todavia no ha abierto ninguna rama, asi que no "
                     "hay nada que cambiar")
    if len(cogidas) > b[1] - b[0]:
        raise Ilegal("no caben %d casillas en la otra rama" % len(cogidas))

    buf = bytearray(plain)
    buf[off + a[0]:off + a[1]] = bytes(a[1] - a[0])
    buf[off + b[0]:off + b[1]] = bytes([1] * len(cogidas)) + bytes(b[1] - b[0] - len(cogidas))
    struct.pack_into("<I", buf, offr, 1 - ahora)
    return bytes(buf), {
        "fila": fila, "que": "rama del arbol",
        "antes": "rama %d" % (ahora + 1), "despues": "rama %d" % (2 - ahora),
        "casillas": len(cogidas)}


def poner_diamante(plain, fila):
    """Pasa un jugador normal a Diamante, como lo hace la semilla del juego.

    En el juego se hace cambiandolo por una semilla Diamante o comprandolo en la
    tienda con espiritus de Idolo, asi que **cualquier jugador normal puede
    serlo**. Y no es un personaje distinto: es la misma identidad con otra rareza
    (NOTAS O-117).

    Lo que deja el juego, leido de los 46 ascendidos con semilla de la partida
    de Aaron (NOTAS O-163): rareza 8, arquetipo "sin elegir" (6), pasivas y
    heredadas a cero (las fijas las ensena el juego desde su tablero), rama 0,
    el campo de ranuras de Diamante y **las nueve tecnicas** en sus ranuras.
    El arbol de casillas se queda como estaba.
    """
    pos = J.ocurrencias(plain, J.ARRAY_RAREZA[0], J.ARRAY_RAREZA[1])[0] + 8
    antes = struct.unpack_from("<I", plain, pos + 4 * fila)[0]
    if antes == 8:
        raise Ilegal("ese jugador ya es Diamante")
    if antes not in RAREZAS_QUE_SE_SUBEN:
        raise Ilegal("ese jugador es %s: los Idolos no se pasan a Diamante"
                     % J.RAREZAS.get(antes, "rareza %d" % antes))
    identidad_hex = "%08X" % J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    ficha_base = _personaje_por_nombre(identidad_hex)
    plain, refs, creadas = _tecnicas_de_salida(plain, ficha_base, identidad_hex, 9)

    # a partir de aqui ya no falla nada; las posiciones se calculan sobre la
    # partida con la biblioteca ya ampliada
    buf = bytearray(plain)
    pos = J.ocurrencias(plain, J.ARRAY_RAREZA[0], J.ARRAY_RAREZA[1])[0] + 8
    struct.pack_into("<I", buf, pos + 4 * fila, 8)
    pos_arq = J.ocurrencias(plain, J.F_ARQUETIPO, 6000)[0] + 8
    arq_normal = plain[pos_arq + fila]
    buf[pos_arq + fila] = ARQUETIPO_DIAMANTE
    # el arquetipo elegido del Diamante empieza siendo el que tenia de normal
    # (los ascendidos de la partida llevan de todo, no siempre el de serie)
    arq_dia = arq_normal if arq_normal in J.ARQUETIPOS else _arquetipo_de_serie(identidad_hex)
    occ_ad = J.ocurrencias(plain, J.F_ARQUETIPO_DIAMANTE, 6000)
    if occ_ad:
        buf[occ_ad[0] + 8 + fila] = arq_dia
    _escribir_tablero(buf, plain, fila, identidad_hex, 8, arq_dia)
    for fhash in (J.F_PASIVAS, J.F_HEREDADAS, J.F_RAMA):
        off, n = _campo(plain, fila, fhash)
        buf[off:off + n] = bytes(n)
    off, n = _campo(plain, fila, 0x45E2D879)
    buf[off:off + n] = bytes.fromhex(RANURAS_NIVEL_1["fabled"])[:n]
    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    for k, h in enumerate(J.RANURAS_TECNICAS):
        try:
            off, n = _campo_en(plain, tecnicas[fila], h)
        except Ilegal:
            continue
        struct.pack_into("<I", buf, off, refs[k] if k < len(refs) else 0)
    return bytes(buf), {"fila": fila, "que": "rareza",
                        "antes": J.RAREZAS.get(antes, antes), "despues": "Diamante",
                        "tecnicas": sum(1 for r in refs if r), "creadas": creadas}


def anadir_jugador_diamante(plain, nombre):
    """Ficha un jugador normal y lo pasa a Diamante en el mismo paso, como si
    se le hubiera dado una semilla Diamante nada mas llegar (NOTAS O-163)."""
    plain, info = anadir_jugador(plain, nombre)
    if info.get("familia") != "normal":
        return plain, info
    plain, otro = poner_diamante(plain, info["fila"])
    info.update({"rareza": "Diamante", "arquetipo": "sin elegir", "diamante": True,
                 "tecnicas": otro.get("tecnicas", info.get("tecnicas"))})
    return plain, info


def poner_medalla(plain, fila, cual):
    """Convierte a alguien en gerente, entrenador o jugador normal.

    En el juego esto se hace **equipando una medalla** en la tabla de
    habilidades: la "Medalla de gerente" lo convierte en gerente y la "Medalla
    de entrenador" en entrenador. Quitarsela lo devuelve a jugador. La medalla
    puesta vive en el campo `0x8F0E9F49` de la ficha, y lo que guarda es el
    hueco de mochila del monton de medallas (NOTAS O-132).

    Las dos condiciones de Aaron:

    - para hacerlo gerente o entrenador, **30 partidos jugados**
    - para devolverlo a jugador, **10 partidos**

    y no se le piden a quien ya tiene esa aptitud de fabrica, que por eso puede
    ser gerente con cero partidos (el caso de Lucy Wongfu en su partida).
    """
    from ievr import equipos as EQ
    if cual not in ("jugador", "gerente", "entrenador"):
        raise Ilegal("no se que es %r: tiene que ser jugador, gerente o entrenador"
                     % cual)
    slot = EQ.slot_de_fila(plain, fila)
    nombre = EQ._nombre_de_slot(plain, slot) or "ese jugador"
    ficha = EQ._ficha_de(plain, slot)
    ahora = EQ.medalla_de(plain, slot) or "jugador"
    if ahora == cual:
        raise Ilegal("%s ya es %s" % (nombre, cual))
    if cual != "jugador" and 5 <= J.array(plain, J.ARRAY_RAREZA)[fila] <= 7:
        raise Ilegal("%s es un Idolo, y el juego no deja que un Idolo sea gerente "
                     "ni entrenador" % nombre)
    if cual == "jugador" and nombre == EQ.NOMBRE_SOLO_STAFF:
        raise Ilegal("%s es el protagonista de la historia: solo puede ser gerente "
                     "o entrenador, nunca jugar" % EQ.NOMBRE_SOLO_STAFF)

    de_fabrica = bool(ficha.get("apt_entrenador") if cual == "entrenador"
                      else ficha.get("apt_gerente") if cual == "gerente"
                      else not (ficha.get("apt_entrenador") or ficha.get("apt_gerente")))
    if not de_fabrica:
        hacen_falta = (EQ.PARTIDOS_PARA_JUGADOR if cual == "jugador"
                       else EQ.PARTIDOS_PARA_STAFF)
        partidos = EQ._partidos_de(plain, slot)
        if partidos is not None and partidos < hacen_falta:
            raise Ilegal("para que %s sea %s hacen falta %d partidos jugados y "
                         "lleva %d. Juegale esos partidos, o subeselos aqui mismo "
                         "en su ficha." % (nombre, cual, hacen_falta, partidos))

    # Donde esta metido ahora: si el cambio lo deja en un sitio imposible, se
    # avisa en vez de dejar el equipo mal puesto.
    for t in EQ.todos(plain):
        e = EQ.leer(plain, t["hueco"])
        for m in e["miembros"]:
            if m["jugador"] == slot and EQ.rol_de(m["puesto"]) != cual:
                raise Ilegal("%s esta ahora mismo de %s en el equipo %s. Sacalo de "
                             "ahi primero y luego ya se le cambia el rol."
                             % (nombre, EQ.rol_de(m["puesto"]), t["nombre"]))

    if cual == "jugador":
        valor = 0
    else:
        quiero = (EQ.MEDALLA_ENTRENADOR if cual == "entrenador"
                  else EQ.MEDALLA_GERENTE)
        valor = next((h for h, q in EQ.montones_de_medalla(plain).items()
                      if q == EQ.MEDALLAS[quiero]), 0)
        if not valor:
            raise Ilegal("no tienes ninguna Medalla de %s en la mochila. "
                         "Consiguela primero en la pantalla de la mochila." % cual)

    off, n = _campo(plain, fila, EQ.F_MEDALLA)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, off, valor)
    plain = bytes(buf)
    if cual != "jugador" and not de_fabrica and J.array(plain, J.ARRAY_RAREZA)[fila] != 8:
        # un normal convertido empieza sin pasivas de personal (Aaron, O-164):
        # se vacia su tabla y ya se las dara el juego con objetos
        buf = bytearray(plain)
        for k in range(5):
            p = J.pos_tabla_pasivas(plain, fila, k)
            if p is not None:
                buf[p + 8:p + 12] = bytes(4)
                struct.pack_into("<f", buf, p + 20, 0.0)
                buf[p + 32] = 0
        plain = bytes(buf)
    return plain, {"fila": fila, "que": "rol", "antes": ahora, "despues": cual}


def conseguir_todo(plain, categoria, cantidad):
    """Pone `cantidad` de TODOS los objetos de una categoria, creando los que falten.

    Es comodidad pura, pero sigue las mismas reglas que hacerlo de uno en uno: se
    crea la fila donde toca, con su numero de fila calculado, y si el tramo se
    llena se para y lo dice en vez de escribir fuera (NOTAS O-62 y O-63).

    **De una sola pasada.** Antes esto llamaba a `anadir_objeto` una vez por
    objeto, y cada llamada volvia a recorrer los 12 MB de la partida entera para
    buscar el bloque y las filas libres. Con los 285 escudos que le faltaban a
    Aaron eran **40 segundos**. Ahora se lee el bloque una vez, se reparten
    todas las filas libres y se escribe todo de golpe: poco mas de un segundo
    (NOTAS O-136).
    """
    if not 1 <= cantidad <= TOPE_CANTIDAD:
        raise Ilegal("la cantidad va de 1 a %d" % TOPE_CANTIDAD)
    if categoria == "sinergia":
        return dar_sinergias(plain)
    if categoria not in CATEGORIAS_QUE_SE_ANADEN:
        raise Ilegal("no se pueden conseguir cosas de %r" % categoria)

    ids = [f["id"].upper() for f in reglas._tabla("nombres-es.csv")
           if f.get("categoria") == categoria
           and (f.get("nombre_es") or f.get("nombre_en"))]
    if not ids:
        raise Ilegal("no hay ningun objeto de %r en las tablas del juego" % categoria)

    hermanos = set(ids)
    bloque = inventario.bloque_con(plain, hermanos)
    if bloque is None:
        raise Ilegal("no hay en la partida ni una sola fila de %s, asi que no "
                     "puedo saber en que tramo va. No escribo nada." % categoria)
    modelo = next((f for f in bloque["filas"]
                   if f.get("id") in hermanos
                   and f.get("kind") == inventario.KIND_REAL and f["slot"] != 0), None)
    if modelo is None:
        raise Ilegal("no hay ninguna fila de %s que copiar como plantilla" % categoria)

    poseidas = inventario.filas_poseidas(plain)
    libres = [(i, f) for i, f in enumerate(bloque["filas"])
              if f["slot"] == 0 and f.get("id") == "00000000"]
    serie = max((f.get("serie", 0) for f in inventario.todas_las_filas(plain)),
                default=0)

    buf = bytearray(plain)
    creados = ajustados = 0
    sin_sitio = ""
    for id_hex in ids:
        fila = (poseidas.get(id_hex) or [None])[0]
        if fila is not None:
            # Ya lo tiene: solo queda ajustar la cantidad, si es que la guarda.
            if "cantidad_off" not in fila:
                continue
            antes = struct.unpack_from("<I", buf, fila["cantidad_off"])[0]
            if antes != cantidad:
                struct.pack_into("<I", buf, fila["cantidad_off"], cantidad)
                ajustados += 1
            continue
        if not libres:
            sin_sitio = ("no queda ninguna fila libre en el tramo de %s, asi que "
                         "no he podido meter todos. El juego reserva un numero "
                         "fijo de filas." % categoria)
            break
        pos, libre = libres.pop(0)
        serie += 1
        struct.pack_into("<I", buf, libre["slot_off"] + 8,
                         inventario.componer_slot(bloque["clase"], bloque["tipo"], pos))
        buf[libre["id_off"]:libre["id_off"] + 4] = bytes.fromhex(id_hex)
        struct.pack_into("<I", buf, libre["serie_off"], serie)
        buf[libre["kind_off"]] = inventario.KIND_REAL
        buf[libre["sub_off"]] = modelo.get("sub", inventario.SUB_EN_MOCHILA)
        if "cantidad_off" in libre:
            struct.pack_into("<I", buf, libre["cantidad_off"], cantidad)
        if "equipada_off" in libre:
            struct.pack_into("<I", buf, libre["equipada_off"], 0)
        creados += 1

    return bytes(buf), {"categoria": categoria, "cantidad": cantidad,
                        "creados": creados, "ajustados": ajustados,
                        "aviso": sin_sitio}


def guardar(plain, carpeta, nombre):
    """Cifra y escribe, haciendo copia de seguridad de lo que hubiera alli.

    `nombre` tiene que ser el nombre ORIGINAL del fichero (es la clave)."""
    if not es_partida(nombre):
        raise Ilegal("el fichero tiene que llamarse XXXXXXXX-USERDATALIVE: el nombre es la clave")
    os.makedirs(carpeta, exist_ok=True)
    destino = os.path.join(carpeta, nombre)
    if os.path.exists(destino):
        respaldo = destino + ".bak"
        shutil.copyfile(destino, respaldo)
        print("  copia de seguridad de lo que habia: %s" % respaldo)
    with open(destino, "wb") as fh:
        fh.write(codec.encrypt(plain, nombre))
    return destino


def _consola_utf8():
    """La consola de Windows llega en cp1252 y destroza los acentos."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv=None):
    _consola_utf8()
    ap = argparse.ArgumentParser(description="Escribe campos en la partida.")
    ap.add_argument("origen", help="fichero o carpeta de la partida de partida")
    ap.add_argument("destino", help="CARPETA donde dejar la partida editada")
    ap.add_argument("--judias", action="append", default=[], metavar="FILA:RANURA=N",
                    help="cambia cuantas judias hay en esa ranura. PROBADO.")
    ap.add_argument("--tipo-judia", action="append", default=[],
                    metavar="FILA:RANURA=TIPO:N",
                    help="pone un tipo de judia y su cantidad.")
    ap.add_argument("--arquetipo", action="append", default=[], metavar="FILA=NOMBRE",
                    help="cambia el arquetipo y las pasivas 4-5.")
    ap.add_argument("--equipar", action="append", default=[], metavar="FILA:RANURA=OBJETO",
                    help="equipa un objeto en una ranura (1 botas .. 4 especial).")
    ap.add_argument("--tecnica", action="append", default=[], metavar="FILA:RANURA=TECNICA",
                    help="pone una supertecnica en una ranura del arbol.")
    ap.add_argument("--heredada", action="append", default=[], metavar="FILA:RANURA=PASIVA",
                    help="pone una pasiva heredada.")
    ap.add_argument("--nivel", action="append", default=[], metavar="FILA=N",
                    help="cambia el nivel (1 a 99).")
    ap.add_argument("--rareza", action="append", default=[], metavar="FILA=NOMBRE",
                    help="cambia la rareza, solo entre las cinco normales.")
    ap.add_argument("--pasiva", action="append", default=[], metavar="FILA:RANURA=PASIVA",
                    help="cambia una pasiva normal.")
    ap.add_argument("--partidos", action="append", default=[], metavar="FILA=N",
                    help="cambia los partidos jugados.")
    ap.add_argument("--cantidad", action="append", default=[], metavar="OBJETO=N",
                    help="cambia cuantos tienes de un objeto.")
    ap.add_argument("--anadir-jugador", action="append", default=[],
                    metavar="PERSONAJE[:RAREZA[:ARQUETIPO]]",
                    help="crea un jugador que no tienes, de nivel 1.")
    ap.add_argument("--reparar-jugador", action="append", default=[], metavar="FILA[:vaciar]",
                    help="pone al dia un jugador creado por una version vieja.")
    ap.add_argument("--borrar-jugador", action="append", default=[], metavar="FILA",
                    help="quita un jugador de la partida.")
    ap.add_argument("--limpiar-repetidos", type=int, nargs="?", const=0, default=None,
                    metavar="CUANTOS",
                    help="borra copias de sobra de nivel 1 y deja una de cada.")
    ap.add_argument("--anadir-objeto", action="append", default=[], metavar="OBJETO=N",
                    help="crea la fila de un objeto que no tienes.")
    a = ap.parse_args(argv)

    origen = a.origen
    if os.path.isdir(origen):
        if not partida_en(origen):
            raise SystemExit("en %s no hay ningun fichero XXXXXXXX-USERDATALIVE" % origen)
        origen = os.path.join(origen, partida_en(origen))
    if not es_partida(origen):
        raise SystemExit("el fichero tiene que llamarse XXXXXXXX-USERDATALIVE: el nombre es la clave")
    if os.path.abspath(os.path.dirname(origen)) == os.path.abspath(a.destino):
        raise SystemExit("el destino no puede ser la misma carpeta que el origen")

    plain = codec.load(origen)
    original = plain
    cambios = []
    try:
        for spec in a.judias:
            objetivo, _, valor = spec.partition("=")
            fila, _, ranura = objetivo.partition(":")
            plain, info = poner_judias(plain, int(fila), int(ranura), int(valor))
            cambios.append(("judias", info))
        for spec in a.tipo_judia:
            objetivo, _, valor = spec.partition("=")
            fila, _, ranura = objetivo.partition(":")
            tipo, _, cuantas = valor.partition(":")
            plain, info = poner_tipo_judia(plain, int(fila), int(ranura), tipo, int(cuantas))
            cambios.append(("tipo de judia", info))
        for spec in a.arquetipo:
            fila, _, nombre = spec.partition("=")
            plain, info = poner_arquetipo(plain, int(fila), nombre)
            cambios.append(("arquetipo", info))
        for spec in a.nivel:
            f, _, v = spec.partition("=")
            plain, info = poner_nivel(plain, int(f), int(v))
            cambios.append(("nivel", info))
        for spec in a.partidos:
            f, _, v = spec.partition("=")
            plain, info = poner_partidos(plain, int(f), int(v))
            cambios.append(("partidos", info))
        for spec in a.cantidad:
            objeto, _, v = spec.rpartition("=")
            plain, info = poner_cantidad(plain, objeto, int(v))
            cambios.append(("cantidad", info))
        for spec in a.reparar_jugador:
            trozos = spec.split(":")
            plain, info = reparar_jugador(plain, int(trozos[0]),
                                          len(trozos) > 1 and trozos[1] == "vaciar")
            cambios.append(("jugador reparado", info))
        for spec in a.borrar_jugador:
            plain, info = borrar_jugador(plain, int(spec))
            cambios.append(("jugador borrado", info))
        if a.limpiar_repetidos is not None:
            plain, info = limpiar_repetidos(plain, a.limpiar_repetidos or None)
            cambios.append(("limpieza", info))
        for spec in a.anadir_jugador:
            trozos = [t.strip() for t in spec.split(":")]
            plain, info = anadir_jugador(plain, trozos[0],
                                         trozos[1] if len(trozos) > 1 and trozos[1] else None,
                                         trozos[2] if len(trozos) > 2 and trozos[2] else None)
            cambios.append(("jugador nuevo", info))
        for spec in a.anadir_objeto:
            objeto, _, v = spec.rpartition("=")
            plain, info = anadir_objeto(plain, objeto, int(v or 1))
            cambios.append(("objeto nuevo", info))
        for spec in a.rareza:
            f, _, v = spec.partition("=")
            plain, info = poner_rareza(plain, int(f), v)
            cambios.append(("rareza", info))
        for clase, especificaciones, funcion in (
                ("equipacion", a.equipar, poner_equipacion),
                ("tecnica", a.tecnica, poner_tecnica),
                ("pasiva heredada", a.heredada, poner_heredada),
                ("pasiva", a.pasiva, poner_pasiva)):
            for spec in especificaciones:
                objetivo, _, valor = spec.partition("=")
                fila, _, ranura = objetivo.partition(":")
                plain, info = funcion(plain, int(fila), int(ranura), valor)
                cambios.append((clase, info))
    except (Ilegal, ValueError) as e:
        raise SystemExit("NO SE ESCRIBE NADA. %s" % e)

    if not cambios:
        raise SystemExit("no me has pedido ningun cambio")

    print("Cambios preparados:")
    for clase, c in cambios:
        if "fila" in c:
            print("  [%s] jugador de la fila %d" % (clase, c["fila"]))
        else:
            print("  [%s] inventario" % clase)
        if clase == "judias":
            print("    judias de %s en la ranura %d: %d -> %d   (tope a ese nivel: %d)"
                  % (c["tipo"], c["ranura"], c["antes"], c["despues"], c["tope"]))
        elif clase == "tipo de judia":
            print("    ranura %d: %s -> %s   (tope a ese nivel: %d)"
                  % (c["ranura"], c["antes"], c["despues"], c["tope"]))
        elif clase == "nivel":
            print("    nivel: %s -> %s   (tope de judias ahora: %d)"
                  % (c["antes"], c["despues"], c["tope_judias"]))
        elif clase == "partidos":
            print("    partidos: %s -> %s   (insignias abiertas: %d de 2)"
                  % (c["antes"], c["despues"], c["insignias"]))
        elif clase == "cantidad":
            print("    %s: %s -> %s" % (c["objeto"][:40], c["antes"], c["despues"]))
        elif clase == "jugador reparado":
            print("    %s (fila %d): %s"
                  % (c["nombre"], c["fila"], ", ".join(c["arreglado"])))
        elif clase == "jugador borrado":
            print("    %s (nivel %s) fuera de la fila %d"
                  % (c["nombre"], c["nivel"], c["fila"]))
        elif clase == "limpieza":
            print("    %d copias de sobra quitadas, de %d personajes distintos"
                  % (c["cuantos"], c["distintos"]))
        elif clase == "jugador nuevo":
            print("    %s, %s, arquetipo %s, nivel %d"
                  % (c["nombre"], c["rareza"], c["arquetipo"], c["nivel"]))
            print("    %d supertecnicas de salida; forma de ficha copiada de la "
                  "fila %d" % (c["tecnicas"], c["copiado_de"]))
        elif clase == "objeto nuevo":
            print("    %s x%d, creado en el tramo de %s, fila %d del tramo"
                  % (c["objeto"][:40], c["cantidad"], c["categoria"], c["posicion"]))
            print("    numero de fila 0x%08X, copiando la forma de %s"
                  % (c["slot"], c["copiado_de"][:34]))
        elif clase == "rareza":
            print("    rareza: %s -> %s" % (c["antes"], c["despues"]))
        elif clase == "pasiva":
            print("    ranura %d, de %s" % (c["ranura"], c["de_donde"]))
            print("      %s -> %s" % (c["antes"][:34], c["despues"][:44]))
        elif clase == "arquetipo":
            print("    arquetipo: %s -> %s" % (c["antes"], c["despues"]))
            print("    pasivas 4 y 5, copiadas del jugador real de la fila %d:"
                  % c["donante"])
            for texto in c["pasivas"]:
                print("       %s" % texto[:58])
        elif clase == "tecnica":
            print("    ranura %d (admite %s): %s -> %s"
                  % (c["ranura"], c["admite"], c["antes"][:34], c["despues"][:34]))
        elif clase == "pasiva heredada":
            print("    ranura %d: %s -> %s" % (c["ranura"], c["antes"][:30], c["despues"][:44]))
            print("    tapa a la normal: %s" % c["tapa_a"][:52])
            print("    heredadas tras esto: %d de %d" % (c["heredadas_tras_esto"], TOPE_HEREDADAS))
        else:
            print("    ranura %d: %s -> %s"
                  % (c["ranura"], c["antes"][:34], c["despues"][:34]))

    distintos = sum(1 for x, y in zip(original, plain) if x != y)
    print("  bytes cambiados en el fichero descifrado: %d" % distintos)

    destino = guardar(plain, a.destino)
    print("\nEscrita en: %s" % destino)
    print("El nombre del fichero NO se ha tocado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
