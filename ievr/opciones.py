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
                          "bonus": _bonus_de(idh)})
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
    fuera = []
    for f in reglas._tabla("tecnicas.csv"):
        idh = f["id"].upper()
        if idh not in poseidas:
            continue
        if admite != "LIBRE" and f.get("categoria") != admite:
            continue
        fuera.append({"id": idh, "nombre": _limpio(f.get("nombre")),
                      "categoria": f.get("categoria"),
                      "subtipo": f.get("subtipo") or "",
                      "elemento": f.get("elemento") or "sin elemento",
                      "poder": int(f.get("poder") or 0),
                      "tp": int(f.get("tp") or 0)})
    if admite == "LIBRE":
        # En una ranura LIBRE tambien caben los espiritus, y esos se distinguen
        # por su familia (kenshin, alma, armadura, mixi), que es justo por lo que
        # Aaron quiere poder filtrar.
        esp = _espiritus()
        for f in _nombres_por_categoria().get("aura", []):
            idh = f["id"].upper()
            if idh in poseidas:
                e = esp.get(idh) or {}
                fuera.append({"id": idh,
                              "nombre": _limpio(f.get("nombre_es") or f.get("nombre_en")),
                              "categoria": "Hipertecnica",
                              "subtipo": e.get("familia") or "",
                              "elemento": "sin elemento",
                              "icono": e.get("icono") or "",
                              "poder": 0, "tp": 0})
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
            fuera.append({"id": f["pasiva_id"].upper(),
                          "nombre": nombre_pasiva(f["pasiva_id"], _limpio(f.get("pasiva"))),
                          "icono200": iconos_de_pasiva().get(f["pasiva_id"].upper(), "")})
    else:
        de_donde = "las del arquetipo %s en la ranura %d" % (arquetipo, ranura)
        grupo = "%s (ranura %d)" % (arquetipo, ranura)
        for f in _por_grupo_de_ranura().get(grupo, []):
            fuera.append({"id": f["id"].upper(),
                          "nombre": nombre_pasiva(f["id"], _limpio(f.get("nombre"))),
                          "icono200": iconos_de_pasiva().get(f["id"].upper(), "")})

    vistos, unicas = set(), []
    for o in sorted(fuera, key=lambda x: x["nombre"]):
        if o["nombre"] and o["id"] not in vistos:
            vistos.add(o["id"])
            unicas.append(o)
    return {"de_donde": de_donde, "puede": True, "opciones": unicas}


def heredadas(plain, fila):
    """Las pasivas que se le pueden heredar, y cuantas ranuras quedan.

    Dos reglas de Aaron:

    - A un **Diamante** no se le hereda nada: sus pasivas son las suyas y punto.
    - A un **Idolo** solo se le heredan pasivas **de otro Idolo**. Escribir ya lo
      impedia, pero la lista las ensenaba todas y eso es un error: aqui las
      opciones se **generan** con la regla puesta, no se ensenan para luego
      rechazarlas.
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
    if libres and solo_de_idolo:
        # las de Idolo no estan en nombres-es con esa etiqueta; la lista buena es
        # la de `pasivas-hero.csv`, y el texto de verdad sale de la partida
        nombres_tlv = tlv.nombres()
        for id_hex in sorted(reglas.pasivas_hero()):
            texto = nombres_tlv.get(id_hex.upper())
            opciones.append({"id": id_hex.upper(),
                             "icono200": iconos_de_pasiva().get(id_hex.upper(), ""),
                             "nombre": _limpio(texto[0] if texto else id_hex)})
    elif libres:
        for f in _nombres_por_categoria().get("pasiva", []):
            if reglas.clase_de_pasiva(f["id"].upper()) == "hero":
                continue    # esas son de Idolo y este no lo es
            opciones.append({"id": f["id"].upper(),
                             "icono200": iconos_de_pasiva().get(f["id"].upper(), ""),
                             "nombre": _limpio(f.get("nombre_es") or f.get("nombre_en"))})
    vistos, unicas = set(), []
    for o in sorted(opciones, key=lambda x: x["nombre"]):
        if o["nombre"] and o["id"] not in vistos:
            vistos.add(o["id"])
            unicas.append(o)
    return {"puede": libres > 0 and bool(unicas),
            "de_donde": ("solo pasivas de Idolo" if solo_de_idolo else
                         "pasivas de jugador normal"),
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

def personajes_creables(plain):
    """Los personajes que se pueden meter en la partida, con lo que se elige.

    De un Idolo o un Diamante no se elige nada: rareza, arquetipo y pasivas son
    los suyos. Y si no hay ninguna copia en la partida de la que copiarlos, ni
    siquiera se puede crear, asi que aqui se dice.
    """
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    tengo = {ident[i] for i in range(min(6000, len(ident))) if ident[i]}
    per = reglas.personajes()
    fuera = []
    for f in reglas._tabla("jugadores.csv"):
        clave = f["identidad"].upper()
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
            # el numero exacto de rareza: los tres Idolos (roja 5, plateada 6,
            # rosa 7) salian todos con el mismo fondo por no tenerlo
            "rareza_valor": int(ficha.get("rareza_valor") or 0),
            "rareza": J.RAREZAS.get(int(ficha.get("rareza_valor") or 0), ""),
            "elige_rareza": not fijo, "elige_arquetipo": not fijo,
            "se_puede": (not fijo) or (int(clave, 16) in tengo),
            "motivo": "" if (not fijo) or int(clave, 16) in tengo else
                      "es un %s y no tienes ninguna copia suya de la que copiar "
                      "su rareza y sus pasivas" % ("Idolo" if familia == "hero" else "Diamante"),
        })
    vistos, unicos = set(), []
    for o in sorted(fuera, key=lambda x: (x["nombre"] or "").lower()):
        if o["identidad"] not in vistos:
            vistos.add(o["identidad"])
            unicos.append(o)
    return unicos


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
                      "icono": esp["icono"] if esp else "",
                      "icono200": propio,
                      "familia": esp["familia"] if esp else "",
                      "rango": esp["rango"] if esp else 0,
                      "lleva_cantidad": categoria not in E.CATEGORIAS_SIN_CANTIDAD,
                      "cantidad": poseidas[idh][0].get("cantidad", 0) if idh in poseidas else 0})
    return sorted(fuera, key=lambda x: (x["categoria"], x["nombre"]))


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


def _espiritus():
    """{id: {familia, rango, icono}} para dibujar cada espiritu con SU imagen.

    Un mismo nombre ("Alfil blanco") lo llevan varias piezas distintas: el
    kenshin, el alma y las armaduras. Antes salian todas iguales y parecian
    repetidas; con la familia y su imagen se distinguen (NOTAS O-102).
    """
    def construir():
        return {f["id"].upper(): {"familia": f["familia"], "icono": f["icono"],
                                  "rango": int(f["rango"] or 0)}
                for f in reglas._tabla("espiritus.csv")}
    return _indice("espiritus", construir)
