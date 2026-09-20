#!/usr/bin/env python3
"""Que se puede poner en cada sitio. Las listas se GENERAN, no se filtran.

Es la regla 1 del proyecto: la interfaz nunca ensena una opcion que el juego no
pueda dar. Para eso no vale ensenar todo y tachar lo ilegal; hay que preguntar,
para este jugador y esta ranura, que sale de las reglas.

Este modulo no escribe nada. Dice que hay, y `ievr/escribir.py` vuelve a
comprobarlo por su cuenta antes de tocar un byte: si algo se colase aqui, alli se
para. Dos cerraduras en la misma puerta, a proposito.
"""
from ievr import escribir as E, inventario, jugador as J, reglas, tlv


# Indices que se montan una sola vez. Las tablas ya estan cacheadas, pero
# recorrerlas de arriba abajo por cada jugador se nota: una pantalla con treinta
# fichas haria treinta vueltas a `pool-pasivas.csv`, que tiene 35.061 filas.
_indices = {}


def _indice(nombre, construir):
    if nombre not in _indices:
        _indices[nombre] = construir()
    return _indices[nombre]


def _por_identidad():
    def construir():
        d = {}
        for f in reglas._tabla("jugadores.csv"):
            d.setdefault(f["identidad"].upper(), f)
        return d
    return _indice("jugadores", construir)


def _nombres_por_categoria():
    def construir():
        d = {}
        for f in reglas._tabla("nombres-es.csv"):
            d.setdefault(f.get("categoria"), []).append(f)
        return d
    return _indice("nombres", construir)


def _pool_por_identidad():
    def construir():
        d = {}
        for f in reglas._tabla("pool-pasivas.csv"):
            d.setdefault(f.get("identidad", "").upper(), []).append(f)
        return d
    return _indice("pool", construir)


def _por_grupo_de_ranura():
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-por-ranura.csv"):
            d.setdefault(f.get("grupo"), []).append(f)
        return d
    return _indice("ranuras", construir)


def _cuerpo_por_identidad():
    """{identidad: busto con el que se dibuja debajo de la cara} (NOTAS O-148)."""
    def construir():
        return {f["identidad"].upper(): f["cuerpo"]
                for f in reglas._tabla("cuerpos.csv") if f.get("cuerpo")}
    return _indice("cuerpos", construir)


# Como llama el juego a cada tipo de cuerpo (0-7 de CHARA_BODY_INFO col 6).
# Lo dijo Aaron mirando el filtro del juego: el 7 tambien sale como Alto.
NOMBRE_CUERPO = {"0": "Normal", "1": "Normal", "2": "Pequeno", "3": "Robusto",
                 "4": "Alto", "5": "Musculoso", "6": "Grande", "7": "Alto"}


def _tipo_cuerpo_por_identidad():
    def construir():
        return {f["identidad"].upper(): NOMBRE_CUERPO.get(f.get("tipo_cuerpo") or "", "")
                for f in reglas._tabla("cuerpos.csv")}
    return _indice("tipos_cuerpo", construir)


def _hombros():
    """{busto: a que altura (0-100) empiezan los hombros} (NOTAS O-149)."""
    return _indice("hombros", lambda: {f["cuerpo"]: int(f["hombro"] or 75)
                                       for f in reglas._tabla("hombros.csv")})


def _barbillas():
    """{cara: a que altura (0-100) acaba la piel de la barbilla} (NOTAS O-149)."""
    return _indice("barbillas", lambda: {f["cara"]: int(f["barbilla"] or 0)
                                         for f in reglas._tabla("barbillas.csv")})


def datos_cuerpo(identidad):
    """Lo que necesita una tarjeta para dibujar el busto: cuerpo, tipo y a que
    altura se corta la cara de encima (`hombro`): la mas baja entre donde
    empiezan los hombros del busto y donde acaba la barbilla de la cara, para
    que la cara nunca salga cortada (NOTAS O-149)."""
    ident = identidad.upper()
    cuerpo = _cuerpo_por_identidad().get(ident, "")
    cara = _cara_por_identidad().get(ident, "")
    corte = max(_hombros().get(cuerpo, 75), _barbillas().get(cara, 0)) if cuerpo else 0
    return {"cuerpo": cuerpo, "hombro": min(corte, 100),
            "cuerpo_tipo": _tipo_cuerpo_por_identidad().get(ident, "")}


def _valores_pasiva():
    """{id: fila de pasivas-valor.csv}: el texto con <VALUE> y cuanto vale."""
    return _indice("valores_pasiva", lambda: {f["id"].upper(): f
                                              for f in reglas._tabla("pasivas-valor.csv")})


def texto_con_valor(idh, valor, respaldo=""):
    """El texto de una pasiva con el numero que diga la tabla de pasivas
    (NOTAS O-166), que puede no ser el propio del id (un gerente lleva el id
    base con el numero ya subido)."""
    f = _valores_pasiva().get((idh or "").upper())
    if not f or not f.get("texto"):
        return nombre_pasiva(idh, respaldo)
    return " ".join(f["texto"].replace("<VALUE>", "%g" % float(valor)).split())


def nombre_pasiva(idh, respaldo=""):
    """El texto de una pasiva con su numero puesto: "PP del equipo +1.5 %".

    Cada version de una pasiva (por rareza) es un id distinto con su valor
    (NOTAS O-46, O-145), asi que sabiendo el id se sabe el numero.
    """
    f = _valores_pasiva().get((idh or "").upper())
    if not f or not f.get("texto"):
        return respaldo
    try:
        valor = "%g" % float(f.get("valor") or 0)
    except ValueError:
        valor = f.get("valor") or ""
    return " ".join(f["texto"].replace("<VALUE>", valor).split())


def _equipacion_por_identidad():
    """{identidad: nombre del icono de su camiseta}. Ver NOTAS O-76."""
    def construir():
        return {f["identidad"].upper(): f["icono"]
                for f in reglas._tabla("equipacion-jugador.csv")}
    return _indice("equipacion", construir)


def _descripcion_por_identidad():
    """{identidad: la frase que sale bajo el nombre} (NOTAS O-92)."""
    def construir():
        return {f["identidad"].upper(): f["descripcion"]
                for f in reglas._tabla("descripciones.csv")}
    return _indice("descripciones", construir)


def _cara_por_identidad():
    """{identidad: fichero de cara}. Cubre a todos, no solo a los alineables."""
    def construir():
        return {f["identidad"].upper(): f["cara"]
                for f in reglas._tabla("caras.csv") if f.get("existe") == "si"}
    return _indice("caras", construir)


def _ficha_de_personaje(identidad):
    """La fila de jugadores.csv de ese personaje, o None."""
    return _por_identidad().get("%08X" % identidad)


def _marcadores():
    """{(tipo, clave): (completo, nombre, apellido)} para traducir <FUL:ENDO>.

    Van separados por tipo porque una misma palabra puede ser las dos cosas:
    NAGUMOHARA es el nombre de un sitio (*South Cirrus*) y a la vez aparece en
    el nombre de varios personajes. Cada prefijo busca en su lista.
    """
    def construir():
        return {(f.get("tipo") or "persona", f["clave"]):
                (f["completo"], f["nombre"], f["apellido"])
                for f in reglas._tabla("marcadores.csv")}
    return _indice("marcadores", construir)


# Que parte del nombre pide cada prefijo (NOTAS O-98).
_QUE_PIDE = {"FUL": 0, "FLA": 0, "FLC": 0, "FST": 1, "FFS": 1, "FFC": 1,
             "LST": 2, "LAF": 2, "LFC": 2}
# Los <MNT:...> son sitios y equipos, no personas (NOTAS O-101).
_DE_SITIO = ("MNT",)


def sin_marcadores(texto):
    """Cambia los `<FUL:ENDO>` por el nombre de verdad.

    El juego deja esas referencias dentro de los textos y las resuelve al
    vuelo. Si una clave no esta en la tabla se prueba quitandole los digitos del
    final (KIRINO2 -> KIRINO), y si aun asi no se sabe se deja el nombre en
    bonito en vez del corchete, que es feo pero se entiende.
    """
    import re
    tabla = _marcadores()

    def cambia(m):
        prefijo, clave = m.group(1), m.group(2).upper().replace(" ", "")
        tipo = "sitio" if prefijo in _DE_SITIO else "persona"
        corta = re.sub(r"\d+$", "", clave)
        fila = (tabla.get((tipo, clave)) or tabla.get((tipo, corta))
                or tabla.get(("persona", clave)) or tabla.get(("persona", corta))
                or tabla.get(("sitio", clave)) or tabla.get(("sitio", corta)))
        if not fila:
            return clave.capitalize()
        cual = _QUE_PIDE.get(prefijo, 0)
        return fila[cual] or fila[0] or clave.capitalize()

    return re.sub(r"<([A-Z]+):([^>]+)>", cambia, texto or "")


def _limpio(texto):
    """El nombre tal y como se le ensena a una persona.

    `escribir._sin_marcadores` tambien pasa a minusculas, porque alli sirve para
    **comparar** lo que escribe Aaron con lo que pone la tabla. Aqui el texto se
    ensena, asi que se quitan los marcadores del juego pero se respetan las
    mayusculas.
    """
    import re as _re
    t = (texto or "").replace("[CPASSIVE01]", "").replace("[C]", "")
    t = t.replace("<VALUE>", "").replace("%", "")
    # Los textos japoneses traen la lectura entre corchetes: "[雷門中/らいもんちゅう]".
    # Se queda el kanji y se tira la lectura, que es lo que ensena el juego.
    t = _re.sub(r"\[([^\[\]/]+)/[^\[\]]*\]", r"\1", t)
    while chr(92) in t:
        t = t.replace(chr(92) + chr(92), chr(92))
        t = t.replace(chr(92) + "n", " ")
        t = t.replace(chr(92), " ")
    return sin_marcadores(" ".join(t.split()))


# --- equipacion ----------------------------------------------------------------

def _bonus_objetos():
    def construir():
        d = {}
        for f in reglas._tabla("bonus-objeto.csv"):
            d[f["id"].upper()] = [int(f.get(c) or 0) for c in
                                  ("potencia", "control", "tecnica", "presion",
                                   "fisico", "agilidad", "inteligencia")]
        return d
    return _indice("bonus_obj", construir)


NOMBRES_STAT = ["Potencia", "Control", "Tecnica", "Presion", "Fisico",
                "Agilidad", "Inteligencia"]


def _stats_de(id_hex):
    """Los siete numeros que suma un objeto (o ceros), y el total, para poder
    ordenar la mochila y el selector de equipacion por lo que sube."""
    b = _bonus_objetos().get(id_hex) or [0] * 7
    return {"stats": b, "total": sum(b)}


def _bonus_de(id_hex):
    """Lo que suma un objeto, en texto corto: "Potencia +6  Control +5"."""
    b = _bonus_objetos().get(id_hex)
    if not b:
        return ""
    partes = ["%s +%d" % (NOMBRES_STAT[i], v) for i, v in enumerate(b) if v]
    return "  ".join(partes)


def equipacion(plain, ranura):
    """Lo que se puede poner en esa ranura: solo objetos que se TENGAN.

    La equipacion guarda el numero de fila del objeto, no el objeto (NOTAS O-19),
    asi que lo que no se tiene no se puede equipar ni queriendo. Aqui se lista lo
    que hay en la mochila de la categoria de esa ranura.
    """
    categoria = E.CATEGORIA_RANURA.get(ranura)
    if categoria is None:
        return []
    poseidas = inventario.filas_poseidas(plain)
    fuera = []
    for f in _nombres_por_categoria().get(categoria, []):
        idh = f["id"].upper()
        if idh in poseidas:
            fuera.append({"id": idh,
                          "nombre": _limpio(f.get("nombre_es") or f.get("nombre_en")),
                          "cantidad": poseidas[idh][0].get("cantidad", 0),
                          # cada bota, brazalete, colgante y especial tiene su
                          # propio dibujo en el juego (NOTAS O-137)
                          "icono200": _iconos_de_objeto().get(idh, ""),
                          "bonus": _bonus_de(idh), **_stats_de(idh)})
    return sorted(fuera, key=lambda x: x["nombre"])


# --- supertecnicas -------------------------------------------------------------

def tecnicas(plain, fila, ranura):
    """Lo que admite esa ranura del arbol de ese jugador.

    Cada ranura tiene una categoria fija (Tiro, Parada, Regate, Defensa...) que
    viene del personaje, y solo admite tecnicas de esa categoria. Las marcadas
    LIBRE admiten cualquier cosa, hipertecnicas incluidas. Y ademas hay que
    tenerla.
    """
    ficha = _ficha_de_personaje(J.array(plain, J.ARRAY_IDENTIDAD)[fila])
    if ficha is None:
        return {"admite": None, "opciones": []}
    admite = ficha.get("r%d_tipo" % ranura)
    if admite in (None, "", "?"):
        return {"admite": None, "opciones": []}

    poseidas = inventario.filas_poseidas(plain)
    # solo las que se pueden dar de verdad: las que aprende algun personaje o
    # se consiguen en la tienda. Las de los kenshin, los resultados de una
    # combinacion en el partido y las versiones de la historia, no (O-171).
    obtenibles = _indice("tecnicas_obtenibles", lambda: {
        f["id"].upper() for f in reglas._tabla("tecnicas-origen.csv") if f.get("obtenible") == "si"})
    # una tecnica que ya lleva dos veces en ranuras anteriores entra aqui aunque
    # la ranura sea de otro tipo (regla del juego, NOTAS O-199)
    from ievr import escribir as E
    puestas = E._tecnicas_puestas(plain, fila)[:ranura - 1]
    repetibles = {x["id"] for x in puestas
                  if x["id"] and sum(1 for y in puestas if y["id"] == x["id"]) >= 2}
    fuera = []
    for f in reglas._tabla("tecnicas.csv"):
        idh = f["id"].upper()
        repetida = idh in repetibles
        if idh not in poseidas or (obtenibles and idh not in obtenibles and not repetida):
            continue
        if admite != "LIBRE" and f.get("categoria") != admite and not repetida:
            continue
        fuera.append({"id": idh, "nombre": _limpio(f.get("nombre")),
                      "repetida": repetida,
                      "categoria": f.get("categoria"),
                      "subtipo": f.get("subtipo") or "",
                      "elemento": f.get("elemento") or "sin elemento",
                      "poder": int(f.get("poder") or 0),
                      "tp": int(f.get("tp") or 0),
                      "descripcion": f.get("descripcion") or ""})
    if admite == "LIBRE":
        # En una ranura LIBRE tambien caben los espiritus, y esos se distinguen
        # por su familia (kenshin, alma, armadura, mixi), que es justo por lo que
        # Aaron quiere poder filtrar.
        esp = _espiritus()
        identidad_hex = "%08X" % J.array(plain, J.ARRAY_IDENTIDAD)[fila]
        for f in _nombres_por_categoria().get("aura", []):
            idh = f["id"].upper()
            # las armaduras y los mixi max solo se ofrecen a su personaje (O-172)
            if idh in poseidas and espiritu_permitido(idh, identidad_hex):
                e = esp.get(idh) or {}
                fuera.append({"id": idh,
                              "nombre": _limpio(f.get("nombre_es") or f.get("nombre_en")),
                              "categoria": "Hipertecnica",
                              "subtipo": e.get("familia") or "",
                              "elemento": "sin elemento",
                              "icono": e.get("icono") or "",
                              "poder": 0, "tp": 0,
                              # lo que ensena la ficha del espiritu (O-174)
                              **_detalle_espiritu(idh, e)})
    vistos, unicas = set(), []
    for o in sorted(fuera, key=lambda x: x["nombre"]):
        if o["nombre"] and o["id"] not in vistos:
            vistos.add(o["id"])
            unicas.append(o)
    return {"admite": admite, "opciones": unicas}


# --- pasivas -------------------------------------------------------------------

def pasivas(plain, fila, ranura):
    """Lo que puede salirle a ese jugador en esa ranura de pasiva.

    Las reglas cambian por ranura, y no es un detalle (NOTAS O-51 y O-57):

    - **1 y 2**: solo las del sorteo de ese personaje concreto. No es una lista
      generica: una portera del equipo Guardianas puede sacar pasivas de tiro y
      otra portera no.
    - **3, 4 y 5**: las del arquetipo que tenga puesto AHORA, no el que le
      corresponde de fabrica.
    """
    if not 1 <= ranura <= 5:
        return {"de_donde": None, "opciones": []}
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza >= 5:
        return {"de_donde": None, "puede": False,
                "motivo": "es %s: sus pasivas son fijas y las pone el juego, no se "
                          "guardan en la partida" % J.RAREZAS.get(rareza, rareza),
                "opciones": []}
    identidad = J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    arquetipo = J.ARQUETIPOS.get(J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila])

    fuera = []
    if ranura <= 2:
        de_donde = "las que puede sacar este personaje"
        for f in _pool_por_identidad().get("%08X" % identidad, []):
            # con el numero que tendra en este jugador: la version de su rareza (O-165)
            fuera.append({"id": f["pasiva_id"].upper(),
                          "nombre": nombre_pasiva(variante_por_rareza(f["pasiva_id"].upper(), rareza),
                                                  _limpio(f.get("pasiva"))),
                          "icono200": iconos_de_pasiva().get(f["pasiva_id"].upper(), "")})
    else:
        de_donde = "las del arquetipo %s en la ranura %d" % (arquetipo, ranura)
        grupo = "%s (ranura %d)" % (arquetipo, ranura)
        for f in _por_grupo_de_ranura().get(grupo, []):
            fuera.append({"id": f["id"].upper(),
                          "nombre": nombre_pasiva(variante_por_rareza(f["id"].upper(), rareza),
                                                  _limpio(f.get("nombre"))),
                          "icono200": iconos_de_pasiva().get(f["id"].upper(), "")})

    vistos, unicas = set(), []
    for o in sorted(fuera, key=lambda x: x["nombre"]):
        if o["nombre"] and o["id"] not in vistos:
            vistos.add(o["id"])
            unicas.append(o)
    return {"de_donde": de_donde, "puede": True, "opciones": unicas}


def pasivas_personalizadas():
    """{id: numero} de las 37 pasivas personalizadas del juego (las que en los
    datos se llaman `ss_ps5xxxx`; son justo la lista "Pasivas Personalizadas"
    de inazumo.es, y el numero del nombre interno es el que ensena el juego:
    `ss_ps50001` es "Pasiva personalizada 1", NOTAS O-179)."""
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-valor.csv"):
            interno = f.get("interno") or ""
            if interno.startswith("ss_ps"):
                try:
                    d[f["id"].upper()] = int(interno[len("ss_ps"):]) - 50000
                except ValueError:
                    d[f["id"].upper()] = 0
        return d
    return _indice("pasivas_personalizadas", construir)


def numero_personalizada(id_hex):
    """El numero con el que el juego la llama ("Pasiva personalizada 7")."""
    return pasivas_personalizadas().get((id_hex or "").upper(), 0)


def personalizadas(plain, fila):
    """Las pasivas personalizadas que se le pueden poner: las que tengas en la
    mochila. Una por jugador (NOTAS O-179)."""
    from ievr import escribir as E
    poseidas = inventario.filas_poseidas(plain)
    puesta, _slot = E.pasiva_personalizada(plain, fila)
    fuera = []
    for idh in sorted(pasivas_personalizadas(), key=numero_personalizada):
        if idh not in poseidas:
            continue
        fuera.append({"id": idh, "nombre": nombre_pasiva(idh, idh),
                      "numero": numero_personalizada(idh),
                      "extra": "Pasiva personalizada %d" % numero_personalizada(idh),
                      "icono200": iconos_de_pasiva().get(idh, ""),
                      "cantidad": poseidas[idh][0].get("cantidad", 0)})
    fuera.sort(key=lambda x: x["numero"])
    return {"puede": bool(fuera), "puesta": puesta,
            "motivo": "" if fuera else "no tienes ningun manual de pasiva "
                                       "personalizada en la mochila",
            "opciones": fuera}


def pasivas_heredables(rareza):
    """{id base} de las pasivas que se le pueden heredar a un jugador de esa
    rareza (NOTAS O-173). Reglas de Aaron:

    - a un normal (0-4) solo pasivas DE JUGADOR: las que salen en las cinco
      ranuras de un jugador normal (`pasivas-por-ranura.csv`, 63; cuadran con
      la lista "Pasivas de jugador" de inazumo.es);
    - a un Idolo (5-7) solo las de otro Idolo: las de los tableros propios
      (`pasivas-fijas.csv`, origen propio, 46);
    - a un Diamante nada;
    - nunca las de "Agilidad +x" y demas stats, ni las de entrenador o gerente,
      ni las personalizadas.

    Se devuelve siempre la version base (rareza 0): la partida guarda esa y el
    juego ensena el numero que le toca al que la recibe (O-165)."""
    def construir():
        normales = {variante_por_rareza(f["id"].upper(), 0)
                    for f in reglas._tabla("pasivas-por-ranura.csv")}
        idolos = {variante_por_rareza(f["pasiva_id"].upper(), 0)
                  for f in reglas._tabla("pasivas-fijas.csv") if f.get("origen") == "propio"}
        return {"normales": normales, "idolos": idolos}
    d = _indice("pasivas_heredables", construir)
    if rareza in (5, 6, 7):
        return d["idolos"]
    if rareza == 8:
        return set()
    return d["normales"]


def grupo_de_heredable(id_hex):
    """"1-3" o "4-5": en que ranuras puede ir esa pasiva heredada (O-213).
    Regla de Aaron: una pasiva de las ranuras 1-3 (las normales) solo se
    hereda a las ranuras 1-3, y una de las 4-5 (las de arquetipo) solo a las
    4-5. En un normal lo dice `pasivas-por-ranura.csv` (grupo "(ranuras 1-2)"
    o "(ranura 3)" contra "(ranura 4)" y "(ranura 5)"); en un Idolo, la casilla
    de su tablero propio (`pasivas-fijas.csv`: tronco 1, 3, 7 y rama 8/18 son
    las ranuras 1-3; tronco 11, 14 y rama 12, 15/22, 25 las 4-5). Ninguna
    pasiva esta en los dos grupos. None si no se sabe."""
    import re

    def construir():
        d = {}
        for f in reglas._tabla("pasivas-por-ranura.csv"):
            m = re.search(r"ranuras? ([\d-]+)", f.get("grupo") or "")
            if not m:
                continue
            d[variante_por_rareza(f["id"].upper(), 0)] = "4-5" if m.group(1) in ("4", "5") else "1-3"
        de_1_3 = {"1", "3", "7", "8", "18"}
        for f in reglas._tabla("pasivas-fijas.csv"):
            if f.get("origen") != "propio":
                continue
            d.setdefault(variante_por_rareza(f["pasiva_id"].upper(), 0),
                         "1-3" if f.get("casilla") in de_1_3 else "4-5")
        return d
    return _indice("grupo_heredable", construir).get(variante_por_rareza((id_hex or "").upper(), 0))


def heredadas(plain, fila, ranura=None):
    """Las pasivas que se le pueden heredar, y cuantas ranuras quedan. Con
    `ranura`, solo las que pueden ir en esa ranura (O-213).

    Reglas de Aaron (NOTAS O-173, `pasivas_heredables`): a un Diamante nada; a
    un Idolo solo las de otro Idolo; a un normal solo pasivas de jugador. Cada
    pasiva sale UNA vez (la version base), con el numero que tendria en este
    jugador: al heredar de un comun a un leyenda, la pasiva se pone con el
    valor del leyenda; es la misma pasiva con otro numero.
    """
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza == 8:
        return {"puede": False, "motivo": "es un Diamante: sus pasivas son fijas",
                "libres": 0, "opciones": []}
    solo_de_idolo = rareza in (5, 6, 7)
    off, n = E._campo(plain, fila, J.F_HEREDADAS)
    # Se cuentan RANURAS ocupadas. Hubo un rato en que se contaron "distintas",
    # porque en la partida habia 52 jugadores con las cinco llenas y solo dos
    # pasivas repetidas; resulta que esos los hizo Aaron con Cheat Engine y son
    # ilegales. El tope de verdad son 3 ranuras (NOTAS O-107).
    puestas = sum(1 for k in range(5) if any(plain[off + 4 * k:off + 4 * k + 4]))
    libres = max(0, E.TOPE_HEREDADAS - puestas)
    opciones = []
    if libres:
        nombres_tlv = tlv.nombres()
        grupo_pedido = None if ranura is None else ("1-3" if int(ranura) <= 3 else "4-5")
        for id_hex in sorted(pasivas_heredables(rareza)):
            # solo las de ese grupo de ranuras (O-213)
            if grupo_pedido and grupo_de_heredable(id_hex) != grupo_pedido:
                continue
            # el numero que ensenaria ESTE jugador (su rareza manda, O-165)
            version = variante_por_rareza(id_hex, rareza)
            texto = nombres_tlv.get(version) or nombres_tlv.get(id_hex)
            opciones.append({"id": id_hex,
                             "icono200": iconos_de_pasiva().get(id_hex, "") or iconos_de_pasiva().get(version, ""),
                             "nombre": nombre_pasiva(version, _limpio(texto[0] if texto else id_hex))})
    # una sola por texto: hay pasivas de Idolo repetidas (dos ids con el mismo
    # texto y numero); se queda la que mas tableros usan (regla de Aaron: "solo
    # deberia salir 1")
    usos = _indice("usos_pasiva_tablero", lambda: __import__("collections").Counter(
        variante_por_rareza(f["pasiva_id"].upper(), 0) for f in reglas._tabla("pasivas-fijas.csv")))
    vistos, unicas = set(), []
    for o in sorted(opciones, key=lambda x: (x["nombre"], -usos.get(x["id"], 0), x["id"])):
        if o["nombre"] and o["nombre"] not in vistos:
            vistos.add(o["nombre"])
            unicas.append(o)
    return {"puede": libres > 0 and bool(unicas),
            "de_donde": ("solo pasivas de Idolo" if solo_de_idolo else
                         "pasivas de jugador normal")
                        + ("" if ranura is None else
                           (" de las ranuras 1-3 (normales)" if int(ranura) <= 3
                            else " de las ranuras 4-5 (de arquetipo)")),
            "motivo": "" if libres else "ya lleva las %d que caben"
            % E.TOPE_HEREDADAS, "libres": libres, "opciones": unicas}


# --- judias, nivel, rareza, arquetipo ------------------------------------------

def judias(plain, fila, ranura):
    """Los tipos de judia que caben en esa ranura y cuantas.

    No se puede repetir tipo entre ranuras, asi que los que ya lleva en otra no
    salen. Y el tope por ranura lo manda el nivel.
    """
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    tope = E.tope_judias(nivel)
    if tope == 0:
        return {"tope": 0, "motivo": "las judias se abren al nivel %d y este va por el %d"
                % (E.NIVEL_MINIMO_JUDIAS, nivel), "opciones": []}
    off, _ = E._campo(plain, fila, J.F_JUDIA_TIPO)
    import struct
    k = 3 - ranura
    puestos = {struct.unpack_from("<H", plain, off + 2 * o)[0]
               for o in range(3) if o != k}
    opciones = [{"valor": v, "nombre": n} for v, n in sorted(J.JUDIAS.items())
                if v not in puestos]
    return {"tope": tope, "motivo": "", "opciones": opciones}


def rarezas(plain, fila):
    """Las rarezas a las que se puede mover ese jugador.

    Solo dentro de los cinco escalones que se suben jugando. Un Idolo o un
    Diamante viene asi de fabrica y no se toca (NOTAS O-58 y O-67).
    """
    actual = J.array(plain, J.ARRAY_RAREZA)[fila]
    if actual not in E.RAREZAS_QUE_SE_SUBEN:
        return {"puede": False,
                "motivo": "es %s, que viene asi de fabrica" % J.RAREZAS.get(actual, actual),
                "opciones": []}
    return {"puede": True, "motivo": "",
            "opciones": [{"valor": v, "nombre": J.RAREZAS[v]}
                         for v in E.RAREZAS_QUE_SE_SUBEN]}


def arquetipos():
    """Los seis. Cualquier jugador puede salir de cualquiera; solo cambia lo
    facil que es que toque (regla de Aaron, datos/reglas-del-jugador/arquetipo.md)."""
    return [{"valor": v, "nombre": n} for v, n in sorted(J.ARQUETIPOS.items())]


def niveles():
    return {"minimo": 1, "maximo": E.NIVEL_MAXIMO}


def partidos():
    return {"minimo": 0, "maximo": E.PARTIDOS_MAXIMO, "insignias": [10, 30]}


# --- crear cosas ---------------------------------------------------------------

def _stats99(clave, rareza):
    from ievr import stats as ST
    b = ST.base(int(clave, 16), 99, rareza)
    return list(b["valores"]) if b else [0] * 7


def personajes_creables(plain):
    """Los personajes que se pueden meter en la partida, con lo que se elige.

    De un Idolo o un Diamante no se elige nada: rareza, arquetipo y pasivas son
    los suyos (de una copia que ya haya, o de las tablas del juego, NOTAS O-161).
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    tengo = {ident[i] for i in range(min(6000, len(ident))) if ident[i]}
    per = reglas.personajes()
    # solo los que el juego da por alguna via (NOTAS O-205): fuera las formas
    # a las que se llega en un partido (el Byron del modo Aphrody, el Buddy
    # del modo Furia...) y los figurantes de la historia (Umibozu, UM-BZ9)
    fichables = {f["identidad"].upper() for f in reglas._tabla("fichables.csv")}
    fuera = []
    for f in reglas._tabla("jugadores.csv"):
        clave = f["identidad"].upper()
        if fichables and clave not in fichables:
            continue
        familia = (per.get(clave) or {}).get("rareza")
        if familia not in E.FAMILIAS_DE_RAREZA:
            continue
        fijo = familia in ("hero", "fabled")
        # El nombre y la cara se completan con las tablas grandes: `jugadores.csv`
        # solo trae a los alineables y a algunos les faltaba una cosa o la otra,
        # asi que salian con su numero en crudo y sin foto (NOTAS O-99, O-100).
        ficha = per.get(clave) or {}
        nombre = _limpio(f.get("nombre") or ficha.get("nombre_es")
                         or ficha.get("nombre_en") or "")
        if not nombre:
            # sin nombre en ningun idioma: son entradas que el juego no ensena
            continue
        fuera.append({
            "identidad": clave,
            "nombre": nombre,
            "cara": f.get("string_id") or _cara_por_identidad().get(clave, ""),
            **datos_cuerpo(clave),
            "posicion": f.get("posicion"), "elemento": f.get("elemento"),
            "equipo": _limpio(f.get("equipo") or ""), "familia": familia,
            "saga": ficha.get("saga") or "",       # el juego de origen (O-208)
            "apodo": ficha.get("apodo") or "",     # el apodo del juego, para buscar (O-219)
            **puede_llevar(clave),                 # armadura, mixi max, modo (O-222)
            # el numero exacto de rareza: los tres Idolos (roja 5, plateada 6,
            # rosa 7) salian todos con el mismo fondo por no tenerlo
            "rareza_valor": int(ficha.get("rareza_valor") or 0),
            "rareza": J.RAREZAS.get(int(ficha.get("rareza_valor") or 0), ""),
            "elige_rareza": not fijo, "elige_arquetipo": not fijo,
            "se_puede": True, "motivo": "",
            "tengo": int(clave, 16) in tengo,
            # los siete stats base a nivel 99, con su rareza y como Diamante,
            # para ordenar la lista de Fichar por cada uno (NOTAS O-203)
            "stats_propios": _stats99(clave, int(ficha.get("rareza_valor") or 0)),
            "stats_diamante": _stats99(clave, 8),
        })
    vistos, unicos = set(), []
    for o in sorted(fuera, key=lambda x: (x["nombre"] or "").lower()):
        if o["identidad"] not in vistos:
            vistos.add(o["identidad"])
            unicos.append(o)
    return unicos


def orden_de_sagas():
    """{nombre de la saga: su numero 1-9} de `personajes.csv` (O-208), para
    ordenar el filtro "Juego" como el propio juego y no por abecedario."""
    def construir():
        fuera = {}
        for f in reglas.personajes().values():
            if f.get("saga") and f.get("saga_num"):
                fuera[f["saga"]] = int(f["saga_num"])
        return fuera
    return _indice("orden_de_sagas", construir)


def sinergias():
    """Las 37 sinergias del juego, de `sinergias.csv` (NOTAS O-191)."""
    def construir():
        fuera = []
        for f in reglas._tabla("sinergias.csv"):
            fuera.append({"id": f["id"].upper(), "item_id": f["item_id"].upper(),
                          "nombre": f["nombre"], "tipo": f["tipo"], "icono": f["icono"],
                          "icono_ruta": _icono_de_sinergia(f["icono"]),
                          "orden": int(f.get("orden") or 0),
                          "personajes": [x for x in f["personajes"].split(";") if x],
                          "efectos": [x for x in f["efectos"].split("|") if x]})
        return fuera
    return _indice("sinergias", construir)


def _icono_de_sinergia(icono):
    """La ruta (para /icono/) del dibujo de esa sinergia, si esta recortado de
    la lamina `icon_synergy` (NOTAS O-194); si no, vacio."""
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "datos", "iconos", "recortes", "laminas", "icon_synergy", icono + ".png")
    return "icon_synergy/%s.png" % icono if os.path.isfile(ruta) else ""


def sinergia_ids_personajes(item_id):
    """[chara_base_id] que pide esa sinergia, en el mismo orden que sus nombres."""
    def construir():
        return {f["item_id"].upper(): [x for x in f["personajes_ids"].split(";") if x]
                for f in reglas._tabla("sinergias.csv")}
    return _indice("sinergias_ids", construir).get((item_id or "").upper(), [])


def sinergias_para_equipo(plain, e):
    """Las 37 con lo que hace falta para elegir una para ESE equipo: si se
    tiene, y que personajes de los que pide estan (NOTAS O-194)."""
    from ievr import equipos as EQ
    poseidas = inventario.filas_poseidas(plain)
    fuera = []
    for sn in sinergias():
        quien = EQ.sinergia_en_equipo(plain, e, sn)
        fuera.append({**sn, "tengo": sn["item_id"] in poseidas,
                      "quien": [{"nombre": n, "esta": esta} for n, esta in quien],
                      "cumple": all(esta for _, esta in quien)})
    fuera.sort(key=lambda x: (not (x["tengo"] and x["cumple"]), not x["tengo"], x["nombre"]))
    return fuera


def sinergia_por_objeto():
    """{id del objeto de la mochila: sinergia}."""
    return _indice("sinergia_por_objeto", lambda: {s["item_id"]: s for s in sinergias()})


def objetos_creables(plain):
    """Lo que se puede meter en la mochila y todavia no se tiene."""
    poseidas = inventario.filas_poseidas(plain)
    fuera = []
    for f in reglas._tabla("nombres-es.csv"):
        categoria = f.get("categoria")
        if categoria not in E.CATEGORIAS_QUE_SE_ANADEN:
            continue
        idh = f["id"].upper()
        nombre = _limpio(f.get("nombre_es") or f.get("nombre_en"))
        if not nombre:
            continue
        esp = _espiritus().get(idh)
        propio = _iconos_de_objeto().get(idh, "")
        tec = _tecnicas_por_id().get(idh) or {}
        fuera.append({"id": idh, "nombre": nombre, "categoria": categoria,
                      # De que va la tecnica: Tiro, Regate, Defensa o Parada.
                      # Con eso la mochila le pone el icono que usa el juego y
                      # deja filtrar por tipo, que es lo que pidio Aaron.
                      "tipo": tec.get("categoria") or "",
                      "subtipo": tec.get("subtipo") or "",
                      "elemento": tec.get("elemento") or "",
                      "poder": int(tec.get("poder") or 0),
                      "tp": int(tec.get("tp") or 0),
                      "bonus": _bonus_de(idh), "tengo": idh in poseidas,
                      **(_stats_de(idh) if categoria.startswith("equipo-") else {}),
                      "icono": esp["icono"] if esp else "",
                      "icono200": propio,
                      "familia": esp["familia"] if esp else "",
                      "rango": esp["rango"] if esp else 0,
                      "lleva_cantidad": categoria not in E.CATEGORIAS_SIN_CANTIDAD,
                      "cantidad": poseidas[idh][0].get("cantidad", 0) if idh in poseidas else 0})
    fuera.sort(key=lambda x: (x["categoria"], x["nombre"]))
    # Las sinergias (NOTAS O-191, O-194): con sus personajes y efectos; se
    # crean en el tramo de las tacticas de equipo, como las que compro Aaron.
    for sn in sinergias():
        fuera.append({"id": sn["item_id"], "nombre": sn["nombre"], "categoria": "sinergia",
                      "tipo": "", "subtipo": "", "elemento": "", "poder": 0, "tp": 0,
                      "bonus": "", "tengo": sn["item_id"] in poseidas,
                      "icono": "", "icono200": "", "familia": "", "rango": 0,
                      "lleva_cantidad": False, "cantidad": 1 if sn["item_id"] in poseidas else 0,
                      "sinergia": sn["tipo"], "personajes": sn["personajes"],
                      "efectos": sn["efectos"], "icono_sinergia": sn["icono_ruta"]})
    return fuera


def variante_por_rareza(pid, rareza):
    """El id de la version de esa pasiva que ensena el juego a un jugador de esa
    rareza: la partida guarda SIEMPRE la version base (0) y el juego sube el
    numero al vuelo, rareza 0-4 -> version 0-4, Idolos y Diamantes -> la 4
    (NOTAS O-165). Si la pasiva no tiene versiones, el mismo id."""
    def construir():
        grupos = {}
        for f in reglas._tabla("pasivas-rareza.csv"):
            grupos.setdefault(f["grupo"], {})[int(f["rareza"])] = f["id"].upper()
        d = {}
        for g in grupos.values():
            for pid_g in g.values():
                d[pid_g] = g
        return d
    g = _indice("variantes_pasiva", construir).get((pid or "").upper())
    if not g:
        return pid
    quiero = min(max(int(rareza or 0), 0), 4)
    return g.get(quiero) or g.get(max(g))


def _variante_maxima():
    """{id: id de la version mas alta de su grupo} (`pasivas-rareza.csv`). Un
    Idolo o Diamante ensena cada pasiva con el numero de la version mas alta
    (Axel Nv.14 guarda "disputa +8 %" y ensena "+13 %"; NOTAS O-162)."""
    def construir():
        grupos = {}
        for f in reglas._tabla("pasivas-rareza.csv"):
            grupos.setdefault(f["grupo"], []).append((int(f["rareza"]), f["id"].upper()))
        d = {}
        for lista in grupos.values():
            alta = max(lista)[1]
            for _, pid in lista:
                d[pid] = alta
        return d
    return _indice("variante_maxima", construir)


# La pareja de pasivas (ranuras 4 y 5) de cada arquetipo en un Idolo o un
# Diamante: siempre la misma, a su valor maximo (NOTAS O-163; cuadra con los
# tableros de Sonny, Axel y Raika y con las fotos de Aaron).
PAREJA_ARQUETIPO = {0: ("84E41252", "B14171BB"), 1: ("CF6EEDEE", "595EEA99"),
                    2: ("186FF180", "C99ABCE7"), 3: ("47B73F79", "72125C90"),
                    4: ("41436E70", "32FAAE67"), 5: ("9642721E", "4C2BAEB7")}


def _tablas_fijas():
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-fijas.csv"):
            d.setdefault(f["identidad"].upper(), []).append(f)
        return d
    return _indice("pasivas_fijas", construir)


def _tableros():
    def construir():
        d = {}
        for f in reglas._tabla("tableros.csv"):
            d.setdefault(f["tablero"].upper(), []).append(f)
        return d
    return _indice("tableros", construir)


def pasivas_de_tablero(tablero, rama=1):
    """Las pasivas que ensena un tablero (tronco + rama elegida, por casilla),
    cada una en su version mas alta. `tablero` en hex o entero. [] si no se
    conoce (NOTAS O-169)."""
    clave = ("%08X" % tablero) if isinstance(tablero, int) else (tablero or "").upper()
    filas = _tableros().get(clave, [])
    if not filas:
        return []
    tramos = ("tronco", "rama%d" % (2 if rama == 2 else 1))
    alta = _variante_maxima()
    return [alta.get(f["pasiva_id"].upper(), f["pasiva_id"].upper())
            for f in sorted(filas, key=lambda f: int(f["casilla"])) if f["tramo"] in tramos]


def pasivas_fijas(identidad_hex, rama=1, arquetipo=None, tablero=None):
    """Las 5 pasivas fijas de un Idolo o Diamante, en el orden de la pantalla.
    Si se sabe el tablero que le tiene asignado el juego (`tablero`, el array
    0xBAFA8DBD), salen de ese tablero; si no, del que le tocaria por identidad
    y arquetipo; y si tampoco, de las tablas viejas por identidad."""
    if tablero:
        ids = pasivas_de_tablero(tablero, rama)
        if ids:
            return ids
    ficha = reglas.personajes().get(identidad_hex.upper()) or {}
    try:
        rareza = int(ficha.get("rareza_valor") or 0)
    except ValueError:
        rareza = 0
    if rareza:
        jug = _por_identidad().get(identidad_hex.upper()) or {}
        t = tablero_del_juego(identidad_hex, rareza, arquetipo, jug.get("posicion") or "",
                              jug.get("elemento") or "", _tipo_fc(identidad_hex))
        ids = pasivas_de_tablero(t, rama) if t else []
        if ids:
            return ids
    return _pasivas_fijas_por_identidad(identidad_hex, rama, arquetipo)


def _tipo_fc(identidad_hex):
    """El tipo (col 4 de chara_param, campo 0xFC830AAC) de `ficha-jugador.csv`."""
    def construir():
        return {f["identidad"].upper(): f.get("campo_fc") or "" for f in reglas._tabla("ficha-jugador.csv")}
    return _indice("tipo_fc", construir).get(identidad_hex.upper(), "")


def _pasivas_fijas_por_identidad(identidad_hex, rama=1, arquetipo=None):
    """Las 5 pasivas fijas de un Idolo o Diamante, en el orden de la pantalla,
    cada una con el id de su version mas alta, que es la que ensena el juego
    (`pasivas-fijas.csv`; NOTAS O-162 y O-163). [] si no las tiene.

    Que tablero: el basara del arquetipo elegido si lo hay; si no el propio;
    si no el basara de serie (orden 0). Se cogen las del tronco y las de la
    rama elegida (1 o 2). Si hay arquetipo elegido y el tablero no es el suyo,
    las ranuras 4 y 5 son la pareja de ese arquetipo."""
    filas = _tablas_fijas().get(identidad_hex.upper(), [])
    if not filas:
        return []
    # Las tres primeras salen siempre del tablero propio (o del basara de serie,
    # orden 0): en las seis fotos de Raika son las mismas con cualquier
    # arquetipo. Solo cambia la pareja 4-5, que es la del arquetipo elegido.
    arq = arquetipo if arquetipo in PAREJA_ARQUETIPO else None
    basaras = [f for f in filas if f["origen"] == "basara"]
    if basaras:
        # si tiene tableros basara, el juego usa esos (Zanark, Gabriel, Victor
        # o Axel Diamante de nivel 99 llevan en su tabla el tronco basara, no
        # el de su tablero propio); el de serie es el de orden 0
        primero = min(basaras, key=lambda f: int(f["orden"]))
        quiero = ("basara", primero["arquetipo"])
    else:
        quiero = ("propio", "")
    pareja = PAREJA_ARQUETIPO.get(arq)
    tramos = ("tronco", "rama%d" % (2 if rama == 2 else 1))
    alta = _variante_maxima()
    ids = [alta.get(f["pasiva_id"].upper(), f["pasiva_id"].upper())
           for f in sorted(filas, key=lambda f: int(f["casilla"]))
           if (f["origen"], f["arquetipo"]) == quiero and f["tramo"] in tramos]
    # Un Idolo lleva su arquetipo de fabrica y su tablero ya trae la pareja en
    # su orden (Sonny plateado: tiro directo y luego pase). Solo un Diamante
    # cambia de pareja; si tiene tablero basara de ese arquetipo, en el orden
    # de ese tablero (Raika Afinidad: pase y luego tiro directo).
    es_diamante = (reglas.personajes().get(identidad_hex.upper()) or {}).get("rareza") == "fabled"
    if pareja and es_diamante and len(ids) >= 5:
        del_tablero = [alta.get(f["pasiva_id"].upper(), f["pasiva_id"].upper())
                       for f in sorted(filas, key=lambda f: int(f["casilla"]))
                       if f["origen"] == "basara" and f["arquetipo"] == str(arq) and f["tramo"] == "rama1"]
        if len(del_tablero) >= 2 and set(del_tablero[-2:]) == set(pareja):
            pareja = tuple(del_tablero[-2:])
        ids = ids[:3] + list(pareja)
    return ids


def tablero_del_juego(identidad_hex, rareza, arquetipo, posicion="", elemento="", tipo=""):
    """La clave del tablero que el juego le asigna (0xBAFA8DBD, NOTAS O-169):
    Idolo -> el suyo (`tablero` de personajes.csv); Diamante -> el basara de su
    arquetipo, y si no tiene basara el generico por posicion, elemento y tipo
    (`tableros-diamante.csv`); normal -> 0. Devuelve un entero."""
    ident = identidad_hex.upper()
    if 5 <= rareza <= 7:
        t = (reglas.personajes().get(ident) or {}).get("tablero") or ""
        return int(t, 16) if t else 0
    if rareza == 8:
        arq = arquetipo if arquetipo in PAREJA_ARQUETIPO else None
        filas = [f for f in _tablas_fijas().get(ident, []) if f["origen"] == "basara" and f.get("tablero")]
        if filas:
            if arq is None:
                arq = arquetipos_elegibles(ident)[0]
            for f in filas:
                if int(f["arquetipo"]) == arq:
                    return int(f["tablero"], 16)
        def construir():
            return {(f["posicion"], f["elemento"], f["tipo"], int(f["arquetipo"])): int(f["tablero"], 16)
                    for f in reglas._tabla("tableros-diamante.csv")}
        genericos = _indice("tableros_diamante", construir)
        return genericos.get((posicion or "", elemento or "", str(tipo or ""), arq if arq is not None else 0), 0)
    return 0


def arquetipos_elegibles(identidad_hex):
    """Los arquetipos que un Diamante puede elegir en el juego (los de sus
    tableros basara), en el orden del juego. [] si no tiene."""
    filas = [f for f in _tablas_fijas().get(identidad_hex.upper(), []) if f["origen"] == "basara"]
    vistos = sorted({(int(f["orden"]), int(f["arquetipo"])) for f in filas})
    return [a for _, a in vistos]


def clave_personal(identidad_hex):
    """La clave (1-14) del juego de pasivas de personal de un personaje normal:
    columna 6 de chara_param (`clave_personal` en personajes.csv, NOTAS O-164).
    Un Diamante usa la 100. None si no se sabe."""
    f = reglas.personajes().get(identidad_hex.upper()) or {}
    try:
        return int(f.get("clave_personal") or "")
    except ValueError:
        return None


def pasivas_de_personal_del_rol(rol):
    """{id} de las pasivas que puede llevar un gerente o un entrenador. No se
    mezclan: en la partida de Aaron los 110 gerentes llevan de gerente y los 82
    entrenadores de entrenador, sin una sola cruzada (NOTAS O-185)."""
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-personal.csv"):
            d.setdefault(f["rol"], set()).add(f["pasiva_id"].upper())
        return d
    return _indice("pasivas_por_rol", construir).get(rol, set())


def valor_de_pasiva(id_hex):
    """El numero propio de esa pasiva (`pasivas-valor.csv`)."""
    f = _valores_pasiva().get((id_hex or "").upper()) or {}
    try:
        return float(f.get("valor") or 0)
    except ValueError:
        return 0.0


def personales(plain, fila):
    """Las pasivas de personal que se le pueden poner a ese gerente o
    entrenador: las de SU rol que tengas en la mochila (NOTAS O-185)."""
    from ievr import escribir as E
    rol = E.rol_de_personal(plain, fila)
    if rol not in ("gerente", "entrenador"):
        return {"puede": False, "rol": rol,
                "motivo": "solo tienen pasivas de personal los gerentes y los entrenadores",
                "opciones": []}
    poseidas = inventario.filas_poseidas(plain)
    fuera = []
    legales = pasivas_personal_legales(plain, fila, rol)
    for idh in sorted(legales) if legales else pasivas_de_personal_del_rol(rol):
        if idh not in poseidas:
            continue
        # con el numero que tendra en ESTE gerente o entrenador (O-197)
        valor = E.valor_de_pasiva_personal(plain, fila, idh)
        fuera.append({"id": idh, "nombre": texto_con_valor(idh, valor, idh),
                      "icono200": iconos_de_pasiva().get(idh, ""),
                      "cantidad": poseidas[idh][0].get("cantidad", 0)})
    fuera.sort(key=lambda x: x["nombre"])
    return {"puede": bool(fuera), "rol": rol,
            "motivo": "" if fuera else "no tienes ningun manual de pasiva de %s "
                                       "en la mochila" % rol,
            "opciones": fuera}


def pasivas_solo_de_diamante(rol):
    """{id} de las pasivas de personal que solo estan en los juegos de clave
    100, los de los Diamantes (12 por rol). En la partida de Aaron ningun
    gerente ni entrenador normal hecho por el juego lleva una (NOTAS O-198)."""
    def construir():
        d = {}
        for r in ("gerente", "entrenador"):
            cien, resto = set(), set()
            for f in reglas._tabla("pasivas-personal.csv"):
                if f["rol"] != r:
                    continue
                (cien if f["clave"] == "100" else resto).add(f["pasiva_id"].upper())
            d[r] = cien - resto
        return d
    return _indice("personal_diamante", construir).get(rol, set())


def pasivas_personal_legales(plain, fila, rol):
    """{id} de las pasivas de personal que puede llevar ese gerente o
    entrenador: las de su rol, y las de Diamante solo si es Diamante (NOTAS
    O-198). El arquetipo no se mira: en la partida de Aaron hay 43 de fabrica
    con el juego de otro arquetipo."""
    todas = set(pasivas_de_personal_del_rol(rol))
    if J.array(plain, J.ARRAY_RAREZA)[fila] == 8:
        return todas
    return todas - pasivas_solo_de_diamante(rol)


def pasivas_personal(rol, arquetipo, clave=100):
    """Las 5 pasivas que lleva un gerente o entrenador de ese arquetipo
    (`pasivas-personal.csv`, del juego; NOTAS O-163). La clave 100 es la de los
    Diamantes; la de los normales esta por confirmar."""
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-personal.csv"):
            d.setdefault((f["rol"], int(f["arquetipo"]), int(f["clave"])), []).append(
                (int(f["ranura"]), f["pasiva_id"].upper()))
        return {k: [pid for _, pid in sorted(v)] for k, v in d.items()}
    return _indice("pasivas_personal", construir).get((rol, arquetipo, clave), [])


def iconos_de_pasiva():
    """{id: ruta del dibujo} de `pasivas-icono.csv`.

    El dibujo es del juego, pero **la asignacion es nuestra**, por lo que dice
    el texto de cada pasiva: el juego no tiene una tabla que lo diga (O-141).
    """
    def construir():
        return {f["id"].upper(): f["icono"]
                for f in reglas._tabla("pasivas-icono.csv") if f.get("icono")}
    return _indice("iconos_pasiva", construir)


def _tecnicas_por_id():
    """{id: fila de tecnicas.csv} para poner tipo y afinidad en la mochila."""
    def construir():
        return {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")}
    return _indice("tecnicas_por_id", construir)


def _iconos_de_objeto():
    """{id: ruta dentro de 200_icon} de las cosas que tienen dibujo propio.

    Solo tres familias lo tienen: escudos, equipaciones y placas de nombre. Las
    botas, los colgantes, los materiales y demas **no lo tienen en el juego**;
    esas se dibujan con la imagen de su familia (NOTAS O-133).
    """
    def construir():
        d = {f["id_objeto"].upper(): f["icono"]
             for f in reglas._tabla("equipo-objetos.csv") if f.get("icono")}
        d.update({f["id_objeto"].upper(): f["icono"]
                  for f in reglas._tabla("iconos-objeto.csv") if f.get("icono")})
        return d
    return _indice("iconos_objeto", construir)


def puede_llevar(identidad_hex):
    """{"armadura", "mixi", "modo"} -> "si" o "": que espiritus puede llevar de
    forma legal esa identidad exacta, segun `espiritus-duenos.csv` (O-209).
    "modo" son las hipertecnicas especiales de un personaje (Modo Reina,
    Modo Aphrody...), no las cinco que son de todos (O-174). Es el filtro
    "Armadura / Mixi max / Modo" de Jugadores, Equipos y Fichar (O-222)."""
    def construir():
        d = {}
        for f in reglas._tabla("espiritus-duenos.csv"):
            if f.get("personaje") == "todos" or not f.get("identidad"):
                continue
            fam = {"armadura": "armadura", "mixi": "mixi", "especial": "modo"}.get(f.get("familia"))
            if fam:
                d.setdefault(f["identidad"].upper(), set()).add(fam)
        return d
    tiene = _indice("puede_llevar", construir).get((identidad_hex or "").upper(), set())
    return {k: ("si" if k in tiene else "") for k in ("armadura", "mixi", "modo")}


def duenos_de_espiritu(id_hex):
    """{"nombres": {nombres de personaje}, "identidades": {identidades}} de
    quien puede llevar esa armadura o ese mixi max; vacio si no tiene dueno
    (kenshin, alma) o no se conoce (NOTAS O-172)."""
    def construir():
        d = {}
        for f in reglas._tabla("espiritus-duenos.csv"):
            e = d.setdefault(f["id"].upper(), {"nombres": set(), "identidades": set(), "todos": False})
            if f.get("personaje") == "todos":
                e["todos"] = True       # hipertecnica especial de cualquiera (O-174)
                continue
            e["identidades"].add(f["identidad"].upper())
            if f.get("personaje"):
                e["nombres"].add(f["personaje"])
        return d
    return _indice("duenos_espiritu", construir).get(id_hex.upper(), {"nombres": set(), "identidades": set(), "todos": False})


def espiritu_de_escena(id_hex):
    """Si ese espiritu es la copia de una escena y no el que se consigue.

    Aaron vio "el Animador y el Nike duplicados". Los dos de cada pareja son el
    mismo espiritu con dos modelos: el normal (`wko02030`) y uno con sufijo de
    escena (`wko02030_st0701`). Se ofrece el normal (NOTAS O-182)."""
    def construir():
        esp = _espiritus()
        modelos = {(f.get("modelo") or "") for f in esp.values()}
        return {i for i, f in esp.items()
                if "_st" in (f.get("modelo") or "")
                and (f["modelo"].split("_st")[0]) in modelos}
    return id_hex.upper() in _indice("espiritus_de_escena", construir)


def espiritu_sin_tecnica(id_hex):
    """Un kenshin sin supertecnica propia. Solo hay uno, el Protoanimador, y
    Aaron dice que es ilegal (NOTAS O-182)."""
    f = _espiritus().get(id_hex.upper()) or {}
    return f.get("familia") == "kenshin" and not (f.get("tecnica") or "").strip()


def espiritu_permitido(id_hex, identidad_hex):
    """Si ese jugador puede llevar ese espiritu. Las armaduras, los mixi max y
    los modos son de un personaje concreto (regla de Aaron: la armadura del
    Pegaso solo la lleva Arion) y se compara por IDENTIDAD exacta (O-209): el
    Modo Atacante es del Shawn Froste de defensa con bufanda y no de otro
    Shawn, porque el modelo cambia y el juego no lo deja. Las versiones que
    valen (normal, Idolos, Diamante del mismo personaje) ya vienen en
    `espiritus-duenos.csv`. Las armaduras y mixis sin dueno conocido no se
    dejan a NADIE (Aaron: "mejor que nadie pueda usarlos antes de que todos
    puedan usarlos")."""
    if espiritu_de_escena(id_hex) or espiritu_sin_tecnica(id_hex):
        return False        # copias de escena y el Protoanimador (O-182)
    d = duenos_de_espiritu(id_hex)
    if d.get("todos"):
        return True
    if not d["identidades"]:
        return (_espiritus().get(id_hex.upper()) or {}).get("familia") not in ("armadura", "mixi", "especial")
    return (identidad_hex or "").upper() in d["identidades"]


def pasiva_de_espiritu(id_hex):
    """La habilidad pasiva de un espiritu, en texto (NOTAS O-184)."""
    return _indice("pasivas_espiritu", lambda: {
        f["id"].upper(): f["texto"] for f in reglas._tabla("pasivas-espiritu.csv")
    }).get((id_hex or "").upper(), "")


def _detalle_espiritu(idh, e):
    """Rango, nombre largo, descripcion, pasiva, de quien es y su tecnica
    propia, para ensenarlo en el selector (O-174, O-184)."""
    d = duenos_de_espiritu(idh)
    if d.get("todos"):
        dueno = "de cualquier jugador"
    elif d["nombres"]:
        dueno = "solo de " + ", ".join(sorted(d["nombres"]))
    else:
        dueno = ""
    fuera = {"rango": int(e.get("rango") or 0), "nombre_largo": e.get("nombre_largo") or "",
             "descripcion": e.get("descripcion") or "", "dueno": dueno,
             "pasiva": pasiva_de_espiritu(idh), "familia": e.get("familia") or "",
             "tecnica": "", "tecnica_categoria": "", "tecnica_poder": 0, "tecnica_tp": 0,
             "tecnica_elemento": ""}
    t = _tecnicas_por_id().get((e.get("tecnica") or "").upper())
    if t:
        fuera.update({"tecnica": _limpio(t.get("nombre")), "tecnica_categoria": t.get("categoria") or "",
                      "tecnica_poder": int(t.get("poder") or 0), "tecnica_tp": int(t.get("tp") or 0),
                      "tecnica_elemento": t.get("elemento") or ""})
    return fuera


def _tecnicas_por_id():
    return _indice("tecnicas_por_id", lambda: {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")})


def limite_de_pasiva(id_hex):
    """(tope, "") de la suma de esa pasiva en el equipo, o (None, "") si no
    tiene. Sale del propio juego (`pasivas-limites.csv`, NOTAS O-186): el tope
    va por TIPO DE EFECTO, asi que todas las versiones por rareza de una pasiva
    comparten tope."""
    def construir():
        topes = {f["tipo_efecto"].upper(): float(f["limite"])
                 for f in reglas._tabla("pasivas-limites.csv")}
        d = {}
        for f in reglas._tabla("pasivas-valor.csv"):
            t = (f.get("tipo_efecto") or "").upper()
            if t in topes:
                d[f["id"].upper()] = topes[t]
        return d
    return _indice("limites_pasiva", construir).get((id_hex or "").upper()), ""


def _espiritus():
    """{id: {familia, rango, icono}} para dibujar cada espiritu con SU imagen.

    Un mismo nombre ("Alfil blanco") lo llevan varias piezas distintas: el
    kenshin, el alma y las armaduras. Antes salian todas iguales y parecian
    repetidas; con la familia y su imagen se distinguen (NOTAS O-102).
    """
    def construir():
        return {f["id"].upper(): {"familia": f["familia"], "icono": f["icono"],
                                  "rango": int(f["rango"] or 0),
                                  "nombre_largo": f.get("nombre_largo") or "",
                                  "descripcion": f.get("descripcion") or "",
                                  "tecnica": f.get("tecnica") or "",
                                  "modelo": f.get("modelo") or ""}
                for f in reglas._tabla("espiritus.csv")}
    return _indice("espiritus", construir)
