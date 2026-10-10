"""Datos para el juego de partidos (NOTAS O-286).

Un apartado nuevo de Pizarra, aparte de todo lo demas: partidos online entre
amigos con la jugabilidad de los Inazuma de DS/3DS y el contenido de Victory
Road. Aqui solo va lo que necesita el servidor local para montar un partido:

- `equipos(plain)`: los equipos de la partida con once o mas jugadores.
- `equipo(plain, hueco)`: un equipo listo para jugar: su formacion (donde va
  cada puesto) y, por jugador, sus siete stats de VR, sus supertecnicas
  abiertas (tipo, elemento, poder, PT) y sus pasivas.

El partido en si (reglas, pantalla, raton, red) va en la pagina
(`web/partido.html` y `web/partido/*.js`).
"""
import re

from ievr import equipos as EQ, jugador as J, reglas

TITULARES = EQ.EN_EL_CAMPO          # puestos 0 a 10


def equipos(plain):
    """[{hueco, nombre, cuantos, en_el_campo}] de los equipos que se pueden
    sacar a jugar: los de la partida con once en el campo."""
    return [e for e in EQ.todos(plain) if e["en_el_campo"] >= TITULARES]


# --- las pasivas, de texto a efecto (O-288) ------------------------------------
# Victory Road tiene 80 tipos de pasiva; casi todas son un % sobre los valores
# de los duelos, para alguien y en un momento. Se leen del texto que ya ensena
# Pizarra (con su numero puesto). Las que dependen de cosas que el partido aun
# no tiene (faltas, sustituciones, configuracion de equipo...) se quedan sin
# efecto y se dice.
_QUE = [   # (patron, a que valores del duelo afecta)
    (r"AT y DF de foco de MC", ["foco"]),
    (r"AT y DF del equipo", ["at", "df"]),
    (r"AT del equipo", ["at"]),
    (r"DF del equipo", ["df"]),
    (r"AT (?:propio )?de tiro(?! directo)", ["tiro"]),
    (r"[Vv]alor (?:propio )?de foco", ["foco"]),
    (r"[Vv]alor (?:propio )?de disputa", ["disputa"]),
    (r"DF (?:propia )?del muro", ["muro"]),
    (r"\bPP\b", ["kp"]),
    (r"gana en foco o disputa, tensi.n", ["tension_gana"]),
]
_CONDICION = [   # (patron, condicion, se lee un numero)
    (r"en campo contrario", "campo_contrario"),
    (r"en campo propio", "campo_propio"),
    (r"fuera del .rea", "fuera_area"),
    (r"primera mitad", "mitad1"),
    (r"segunda mitad", "mitad2"),
    (r"jugador del mismo elemento est. cerca", "cerca_mismo"),
    (r"jugador de otro elemento est. cerca", "cerca_otro"),
    (r"tensi.n est. al (\d+)", "tension"),
    (r"Tras recuperar el bal.n sin una captura directa, durante los pr.ximos (\d+)", "tras_robo"),
    (r"mismos goles o menos", "no_gana"),
    (r"Hasta que el equipo reciba una falta", "sin_falta"),  # el partido tiene faltas desde O-295
]
_ALCANCE = [
    (r"(?:AT|[Vv]alor|DF) propi[oa]", "propio"),
    (r"para jugadores del mismo elemento", "mismo_elemento"),
    (r"para jugadores de distintos elementos", "otro_elemento"),
    (r"para jugadores de la misma posici.n", "misma_posicion"),
    (r"para jugadores de distintas posiciones", "otra_posicion"),
    (r"para jugadores cercanos", "cercanos"),
    (r"de MC", "medios"),
]
_SIN_EFECTO = r"Conf\.|sustituci|Tasa de faltas|comete una falta|esprint|afinidad|brecha|perforaci|Enfriamiento|obtenci|drena|tiro directo|Ataque duro|ataque duro|Parada del equipo"


_STATS = ["Potencia", "Control", "Técnica", "Presión", "Físico", "Agilidad", "Inteligencia"]


def _clave_plantilla(texto):
    """El texto de una pasiva sin su numero ni espacios, para cruzarlo con las
    plantillas de pasivas-valor.csv ("... +<VALUE> %")."""
    t = re.sub(r"([+\-－])\s*\d+(?:[.,]\d+)?", r"\1<VALUE>", texto or "")
    return re.sub(r"\s+", "", t)


def _tipos_y_topes():
    """{clave de plantilla: (tipo_efecto, tope de equipo o None)} (O-292)."""
    from ievr import opciones as O
    def construir():
        topes = {f["tipo_efecto"].upper(): float(f["limite"]) for f in reglas._tabla("pasivas-limites.csv")}
        d = {}
        for f in reglas._tabla("pasivas-valor.csv"):
            tipo = (f.get("tipo_efecto") or "").upper()
            d.setdefault(re.sub(r"\s+", "", f.get("texto") or ""), (tipo, topes.get(tipo)))
        return d
    return O._indice("partido_topes", construir)


# las configuraciones de VR (EQ.NOMBRE_CONFIGURACION) con el nombre que usa el partido
_CONF = {"brecha": "brecha", "contraataque": "contraataque", "vinculo": "vinculo", "tension": "tension",
         "juego sucio": "juego_sucio", "justicia": "justicia"}


def _sin_tildes(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if not unicodedata.combining(c))


def _pct(texto):
    m = re.search(r"([+-])\s*(\d+(?:[.,]\d+)?)\s*[%％]", texto or "")
    return float(m.group(2).replace(",", ".")) * (-1 if m.group(1) == "-" else 1) if m else None


def _efecto_de_rango(texto):
    """"Por cada rango de Conf. X, ... +N %" (O-328): N x el rango de la carga de
    configuracion X del equipo (solo si es la suya), con su tope por rango. None si lo de
    detras aun no hace nada en el partido (perforacion, ataque duro, perdida de afinidad...)."""
    m = re.match(r"\s*Por cada rango de Conf\. ([^,]+), (.*)$", texto)
    conf = _CONF.get(_sin_tildes(m.group(1)).strip().lower()) if m else None
    if not conf:
        return None
    resto = m.group(2)
    if re.search(r"Ataque duro|ataque duro|perforaci|Parada|afinidad|tensi", resto):
        return None
    pct = _pct(resto)
    que = next((q for p, q in _QUE if re.search(p, resto)), None)
    if pct is None or not que:
        return None
    tipo, tope = _tipos_y_topes().get(_clave_plantilla(texto), ("", None))
    return {"que": que, "pct": pct, "alcance": "equipo", "condicion": "rango", "conf": conf, "n": None,
            "tipo": tipo or _clave_plantilla(texto), "tope": tope}


def efecto_de_pasiva(texto):
    """{que:[...], pct, alcance, condicion, n} de una pasiva, o None si en el
    partido aun no hace nada. Las de un stat fijo ("Potencia +3"):
    {que:["stat"], stat, valor}."""
    if not texto:
        return None
    # las de la carga de configuracion y las del poder de afinidad, que el partido ya
    # tiene (O-328)
    if re.match(r"\s*Por cada rango de Conf\.", texto):
        return _efecto_de_rango(texto)
    m = re.match(r"\s*(Al hacer un pase|Cuando el rival comete una falta), poder de afinidad", texto)
    if m and _pct(texto) is not None:
        tipo, tope = _tipos_y_topes().get(_clave_plantilla(texto), ("", None))
        return {"que": ["afinidad_pase" if m.group(1).startswith("Al hacer") else "afinidad_falta"], "pct": _pct(texto),
                "alcance": "equipo", "condicion": None, "n": None, "tipo": tipo or _clave_plantilla(texto), "tope": tope}
    if re.search(_SIN_EFECTO, texto):
        return None
    m = re.match(r"\s*(" + "|".join(_STATS) + r")\s*\+\s*(\d+)\s*$", texto)
    if m:
        return {"que": ["stat"], "stat": _STATS.index(m.group(1)), "valor": int(m.group(2)), "alcance": "propio"}
    m = re.search(r"([+-])\s*(\d+(?:[.,]\d+)?)\s*[%％]", texto)
    if not m:
        return None
    pct = float(m.group(2).replace(",", ".")) * (-1 if m.group(1) == "-" else 1)
    que = next((q for p, q in _QUE if re.search(p, texto)), None)
    if not que:
        return None
    condicion, n = None, None
    for p, c in _CONDICION:
        mc = re.search(p, texto)
        if mc:
            condicion = c
            n = float(mc.group(1)) if mc.groups() else None
            break
    alcance = next((a for p, a in _ALCANCE if re.search(p, texto)), "equipo")
    if condicion in ("cerca_mismo", "cerca_otro"):
        alcance = "propio"
    # su tipo y el tope de la suma del equipo (lo que pasa del tope no cuenta)
    tipo, tope = _tipos_y_topes().get(_clave_plantilla(texto), ("", None))
    if not tipo:
        # las de un espiritu no estan en la tabla: las iguales no se acumulan
        # sin fin (tope de equipo del 30 %)
        tipo, tope = _clave_plantilla(texto), 30.0
    return {"que": que, "pct": pct, "alcance": alcance, "condicion": condicion, "n": n,
            "tipo": tipo, "tope": tope}


# --- las tacticas del equipo (O-290) -------------------------------------------
# Victory Road: cada equipo lleva tres tacticas (tacticas.csv: efectos en texto,
# duracion y recarga en segundos). Se leen como las pasivas; "En el geoglifo"
# (la zona que dibuja la tactica) se toma como "mientras dure".
_TAC_QUE = [
    (r"Foco, Disputa AT/DF", ["foco", "disputa"]),
    (r"AT/DF de Foco", ["foco"]),
    (r"Foco AT y DF del rival", ["foco"]),
    (r"AT/DF de Disputa", ["disputa"]),
    # "AT. de tiro" lleva punto en unas cuantas (Gran plan...): sin el, caia en
    # el AT general y subia tambien focos y disputas (O-304)
    (r"AT\.?\d* de tiro(?! directo)", ["tiro"]),
    # las de palabras, tambien en minuscula (van tras una coma: Espejismo Shaolin)
    (r"(?i)Poder de t.cnica de tiro", ["poder_tiro"]),
    (r"(?i)Poder de t.cnica de regateo", ["poder_regate"]),
    (r"(?i)Poder de supert.cnicas(?! comb)", ["poder"]),
    (r"PP", ["kp"]),
    (r"(?i)DF de muro", ["muro"]),
    (r"(?i)Velocidad de regate", ["vel_regate"]),
    (r"(?i)Velocidad (?:de mov\w*|en carrera|de movimiento)", ["velocidad"]),
    (r"Aumento de Tensi.n", ["tension_gana"]),
    (r"\bDF\b", ["df"]),
    (r"\bAT\b", ["at"]),
]
_TAC_ESPECIAL = [
    (r"Ignora(?:r)? las batallas de foco", "ignora_foco"),
    (r"Sin intercepci.n de pases", "sin_intercepcion"),
    (r"El rival pierde el bal.n", "robo"),
    (r"Aturde al rival con el bal.n", "robo"),
    (r"Inhabilita a los rivales cerca del bal.n", "aturde"),
    (r"Tensi.n del rival", "drena"),
]


def efectos_de_tactica(texto):
    """[{que, pct, objetivo, condicion, n} o {especial, pct}] de los efectos de
    una tactica (separados por " | "). Los que aun no hacen nada, fuera."""
    fuera = []
    for trozo in (texto or "").split(" | "):
        t = trozo.strip()
        if not t:
            continue
        esp = next((e for p, e in _TAC_ESPECIAL if re.search(p, t)), None)
        m = re.search(r"([+-])\s*(\d+(?:[.,]\d+)?)\s*[%％]", t)
        pct = (float(m.group(2).replace(",", ".")) * (-1 if m.group(1) == "-" else 1)) if m else 0
        if esp:
            fuera.append({"especial": esp, "pct": abs(pct)})
            continue
        if not m or re.search(r"afinidad|brecha|faltas|Faltas|Enfriamiento|Resistencia|Reducci.n de Tensi|reducci.n de tensi|Objetivo|Ataque duro|Tasa de Parada|tiro directo|comb", t):
            continue
        que = next((q for p, q in _TAC_QUE if re.search(p, t)), None)
        if not que:
            continue
        rival = bool(re.search(r"enemig|rival|contrincante", t))
        condicion, n = None, None
        mc = re.search(r"tensi.n es (\d+) ?% o m.s", t, re.I)
        if mc:
            condicion, n = "tension", float(mc.group(1))
        mc = re.search(r"Tensi.n es menor al (\d+)", t, re.I)
        if mc:
            condicion, n = "tension_menor", float(mc.group(1))
        if re.search(r"en campo propio", t):
            condicion = "campo_propio"
        if re.search(r"en campo contrario", t):
            condicion = "campo_contrario"
        mc = re.search(r"Al recuperar el bal.n.*durante (\d+)", t)
        if mc:
            condicion, n = "tras_robo", float(mc.group(1))
        fuera.append({"que": que, "pct": pct, "objetivo": "rival" if rival else "propio",
                      "condicion": condicion, "n": n})
    return fuera


def _tacticas_del_equipo(e):
    """Las tacticas puestas en el equipo, con sus efectos (el equipo guarda el
    id con los bytes al reves)."""
    from ievr import opciones as O
    tabla = O._indice("partido_tacticas", lambda: {f["id"].upper(): f for f in reglas._tabla("tacticas.csv")})
    fuera = []
    for v in e.get("tacticas") or []:
        if not v:
            continue
        f = tabla.get(EQ._al_reves("%08X" % v).upper()) or tabla.get("%08X" % v)
        if not f:
            continue
        num = lambda x, d: float(x) if x not in (None, "") else d
        # el nombre sin los marcadores del juego ("Formacion <FLC:SHINANO>", O-304)
        fuera.append({"id": f["id"], "nombre": O._limpio(f["nombre"]), "categoria": f["categoria"],
                      "descripcion": O.sin_marcadores(f.get("descripcion") or ""), "texto": f.get("efectos") or "",
                      "duracion": num(f.get("duracion"), 8.0), "recarga": num(f.get("recarga"), 90.0),
                      "efectos": efectos_de_tactica(f.get("efectos"))})
    return fuera


# --- la hipertecnica de cada espiritu (O-310) ------------------------------------
# VR tiene siete familias de hipertecnica, cada una con su duracion, recarga y
# mejoras (scratchpad reglas-vr/HIPERTENSION.md). Salen de `familia` y `modelo` de
# espiritus.csv; los numeros de cada una estan en REGLAS.HIPER_TIPOS (la pagina).
_HIPER_FAMILIA = {"kenshin": "keshin", "mixi": "miximax", "alma": "totem", "armadura": "armadura"}


def tipo_hiper(familia, modelo):
    """keshin, miximax, totem, armadura, modo, vinculo o despertar."""
    if familia in _HIPER_FAMILIA:
        return _HIPER_FAMILIA[familia]
    modelo = (modelo or "").lower()
    if modelo.startswith("mode_change"):
        return "modo"
    if "kizuna" in modelo or modelo.startswith("wkt"):
        return "vinculo"
    return "despertar"          # wap01*, wap09*, awakening* (y lo que no se sepa)


# --- en lo que se convierte con la hiper puesta (O-327) ---------------------------
# Aaron (O-322 punto 6): "Thaddeus no se convertia en Byron ni cambiaba sus tecnicas".
# Como en VR: con un MODO el jugador es otro personaje entero mientras dura (la forma de
# modos.csv, O-225: su modelo, su nombre, su elemento, sus stats y sus tecnicas); la
# armadura y el mixi max cambian el modelo (cara_a de eventos-espiritus.csv, O-323); el
# keshin y el alma salen detras (asignado y su aura en el campo). Las pasivas son las del
# jugador (las del espiritu ya iban marcadas, O-310).

def _filas_evento_espiritu():
    from ievr import opciones as O

    def construir():
        d = {}
        for f in reglas._tabla("eventos-espiritus.csv"):
            d.setdefault((f.get("id") or "").upper(), []).append(f)
        return d
    return O._indice("partido_eventos_espiritus", construir)


def _evento_espiritu(idh, cara):
    """La fila de eventos-espiritus.csv del espiritu idh para ese jugador: la de su cara
    (los modos van por cara_de) o la general; como g4evento.pedidos_de."""
    filas = _filas_evento_espiritu().get((idh or "").upper(), [])
    return next((f for f in filas if f.get("cara_de") == cara), None) or \
        next((f for f in filas if not f.get("cara_de")), None)


def _seg_evento(interno):
    """Lo que dura (s) la animacion de VR de la supertecnica `interno` (eventos-tecnicas.csv,
    O-323); 0 si no tiene. Con las animaciones completas su tramo dura eso (REGLAS.planAnim):
    va en el equipo, asi los dos PCs de un partido online sacan el mismo plan."""
    from ievr import opciones as O

    def construir():
        d = {}
        for f in reglas._tabla("eventos-tecnicas.csv"):
            try:
                d[f.get("interno") or ""] = round(float(f.get("segundos") or 0), 2)
            except ValueError:
                pass
        return d
    return O._indice("partido_eventos_tecnicas", construir).get(interno or "", 0)


def _tecnica_de_forma(idh, ranura, portec):
    """Una supertecnica del arbol de la forma, como las del jugador (sin las hipertecnicas)."""
    from ievr import opciones as O
    st = portec.get((idh or "").upper())
    if not st or not st.get("categoria"):
        return None
    return {"ranura": ranura, "id": st["id"].upper(), "nombre": O._limpio(st["nombre"]),
            "interno": st.get("nombre_interno") or "", "tipo": st["categoria"],
            "subtipo": st.get("subtipo") or "", "subtipo_valor": int(st.get("subtipo_valor") or 0),
            "elemento": st.get("elemento") or "", "poder": int(st.get("poder") or 0),
            "poderMin": _poder_min(st),
            "tp": _coste(st, st.get("tp")), "jugadores": O.jugadores_de_tecnica(st)[0],
            "seg": _seg_evento(st.get("nombre_interno"))}


def _forma_de_modo(plain, fila, idh, d, stats):
    """La forma del cambio de modo (modos.csv: de -> a) de ese jugador, lista para el
    partido, o None. Stats: los de la forma a su nivel y rareza mas lo que el jugador
    suma encima de los suyos (judias, equipacion, arbol): VR no lo dice, se supone que lo
    entrenado se queda. Tecnicas: las del arbol de la forma en las ranuras que el jugador
    tiene abiertas (el tronco y su rama; "te cambia el set", O-225)."""
    from ievr import opciones as O, stats as ST
    ident = "%08X" % J.array(plain, J.ARRAY_IDENTIDAD)[fila]
    filas = [f for f in reglas._tabla("modos.csv") if (f.get("modo") or "").upper() == idh]
    f = next((x for x in filas if x["de"].upper() == ident), None) or \
        next((x for x in reglas._tabla("modos.csv") if x["de"].upper() == ident), None) or \
        (filas[0] if filas else None)
    if not f:
        return None
    a = f["a"].upper()
    per = reglas.personajes().get(a) or {}
    jug = O._por_identidad().get(a) or {}
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    bf = ST.base(int(a, 16), nivel, rareza)
    bo = ST.base(int(ident, 16), nivel, rareza)
    st_forma = None
    if bf:
        extra = [s - b for s, b in zip(stats, bo["valores"])] if bo and stats else [0] * 7
        st_forma = [int(v) + int(e) for v, e in zip(bf["valores"], extra)]
    portec = _tecnicas_por_id()
    abiertas = sorted({t["ranura"] for t in d.get("tecnicas") or [] if t.get("abierta")}) or list(range(1, 10))
    tecnicas, vistas = [], set()
    for k in abiertas:
        t = _tecnica_de_forma(per.get("tec%d" % k), k, portec)
        if t and t["id"] not in vistas:
            vistas.add(t["id"])
            tecnicas.append(t)
    cara = O._cara_por_identidad().get(a) or jug.get("string_id") or ""
    return {"identidad": a, "nombre": O._limpio(jug.get("nombre") or per.get("nombre_es") or per.get("nombre_en") or ""),
            "cara": cara, "elemento": jug.get("elemento") or "", "posicion": jug.get("posicion") or "",
            "arquetipo": jug.get("arquetipo") or "", "stats": st_forma, "tecnicas": tecnicas,
            "modo": f.get("modo_nombre") or ""}


def _aspecto_hiper(plain, fila, espiritu, cara, d, stats):
    """Lo que cambia a la vista (y en un modo, el jugador entero) con la hiper puesta:
    {modelo (armadura, mixi max), keshin (el keshin o alma que sale detras), aura (la del
    keshin en el campo), forma (modo)}. Solo lo que haya."""
    fe = _evento_espiritu(espiritu["id"], cara) or {}
    tipo = espiritu.get("tipo")
    fuera = {}
    if tipo in ("armadura", "miximax") and fe.get("cara_a"):
        fuera["modelo"] = fe["cara_a"]
    if tipo in ("keshin", "totem") and fe.get("asignado"):
        fuera["keshin"] = fe["asignado"]
    if fe.get("aura_campo"):
        fuera["aura"] = fe["aura_campo"]
    # lo que dura su animacion de VR al invocar (la de arriba, O-323)
    try:
        if float(fe.get("segundos") or 0) > 0:
            fuera["seg"] = round(float(fe["segundos"]), 2)
    except ValueError:
        pass
    if tipo == "modo":
        forma = _forma_de_modo(plain, fila, espiritu["id"], d, stats)
        if forma:
            # el modelo de la forma: el de la tabla de eventos si lo trae (el de VR)
            forma["modelo"] = fe.get("cara_a") or forma["cara"]
            fuera["forma"] = forma
    return fuera


def _coste(fila, antes):
    """La tension que cuesta una supertecnica en VR (columna `coste` de
    tecnicas.csv, el consumeTp del juego); si la tabla no la trae, el `tp` de
    antes. El `tp` de la tabla es el poder a nivel 1, no el coste: un tiro keshin
    de 800 cuesta 100, no 140 (O-310)."""
    try:
        c = int((fila or {}).get("coste") or 0)
    except ValueError:
        c = 0
    return c if c > 0 else int(antes or 0)


def _poder_min(fila):
    """El poder de la supertecnica a nivel 1 (power_min: la columna `tp` de tecnicas.csv),
    para su poder por nivel en el partido (O-328: floor(min + (poder - min) x (nivel - 1) / 98));
    0 si no se sabe."""
    try:
        return int((fila or {}).get("tp") or 0)
    except ValueError:
        return 0


def _tecnicas_por_id():
    from ievr import opciones as O
    return O._indice("partido_tecnicas", lambda: {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")})


def _ids_de_tecnicas(plain, fila):
    """{ranura: id de la supertecnica} de las nueve ranuras de un jugador."""
    from ievr import inventario
    tecs = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    campos, _ = J._campos_de(plain, tecs[fila], set(J.RANURAS_TECNICAS))
    porslot = inventario.por_slot(plain)
    fuera = {}
    for k, h in enumerate(J.RANURAS_TECNICAS, 1):
        v = int.from_bytes(campos.get(h, b""), "little")
        f = porslot.get(v) if v else None
        if f and f.get("id"):
            fuera[k] = f["id"].upper()
    return fuera


def _ficha(plain, fila):
    """Lo que el partido necesita de un jugador, sacado de la ficha del editor."""
    from ievr import servidor as SV
    d = SV.detalle_jugador(plain, fila)
    st = d.get("stats") or {}
    if st.get("hay"):
        stats = st["total"]
    else:
        # sin formula exacta (algunos Diamantes): sus stats base a su nivel
        from ievr import stats as ST
        b = ST.base(J.array(plain, J.ARRAY_IDENTIDAD)[fila], d["nivel"], d["rareza_valor"])
        stats = (b or {}).get("valores") or [0] * 7
    ids = _ids_de_tecnicas(plain, fila)
    portec = _tecnicas_por_id()
    tecnicas, de_espiritu, espiritu = [], [], None
    for t in d.get("tecnicas") or []:
        if not (t.get("puesta") and t.get("abierta") and t.get("tipo")):
            continue
        idh = t.get("id") or ids.get(t["ranura"], "")
        if t["tipo"] == "Hipertecnica":
            # un espiritu (kenshin, mixi max, alma...): en el partido se usa su
            # supertecnica, y su pasiva cuenta como una mas (O-291)
            from ievr import opciones as O
            esp = O._espiritus().get(idh) or {}
            st = portec.get((esp.get("tecnica") or "").upper())
            # el espiritu va siempre en el jugador: se puede invocar (aura) aunque
            # no tenga supertecnica, como Sobrecarga ardiente (O-304)
            # con su id y su tipo de hipertecnica (keshin, totem, despertar...), para
            # la duracion, la recarga y las mejoras de cada una en el partido (O-310)
            if esp:
                espiritu = {"nombre": O.sin_marcadores(esp.get("nombre_largo") or t["puesta"]),
                            "familia": esp.get("familia") or "", "rango": esp.get("rango"),
                            "id": (idh or "").upper(),
                            "tipo": tipo_hiper(esp.get("familia") or "", esp.get("modelo") or "")}
            if st:
                tecnicas.append({"ranura": t["ranura"], "id": st["id"].upper(), "nombre": O._limpio(st["nombre"]),
                                 "interno": st.get("nombre_interno") or "", "tipo": st["categoria"],
                                 "subtipo": st.get("subtipo") or "", "subtipo_valor": int(st.get("subtipo_valor") or 0),
                                 "elemento": st.get("elemento") or "", "poder": int(st.get("poder") or 0),
                                 "poderMin": _poder_min(st),
                                 "tp": _coste(st, st.get("tp")), "jugadores": O.jugadores_de_tecnica(st)[0],
                                 "seg": _seg_evento(st.get("nombre_interno")), "espiritu": espiritu})
            texto = O.pasiva_de_espiritu(idh)
            if texto:
                # marcada: en VR solo cuenta con la hipertecnica puesta (O-310)
                de_espiritu.append({"ranura": "espiritu", "texto": texto, "abierta": True,
                                    "efecto": efecto_de_pasiva(texto), "espiritu": True})
            continue
        tecnicas.append({"ranura": t["ranura"], "id": idh, "nombre": t["puesta"],
                         "interno": (portec.get(idh) or {}).get("nombre_interno") or "",
                         "tipo": t["tipo"], "subtipo": (portec.get(idh) or {}).get("subtipo") or "",
                         "subtipo_valor": int((portec.get(idh) or {}).get("subtipo_valor") or 0),
                         "elemento": t["elemento"], "poder": t["poder"], "poderMin": _poder_min(portec.get(idh)),
                         # lo que cuesta de verdad en VR, no el "TP" del editor (O-310)
                         "tp": _coste(portec.get(idh), t["tp"]), "jugadores": t.get("jugadores") or 1,
                         # lo que dura su animacion de VR (O-323)
                         "seg": _seg_evento((portec.get(idh) or {}).get("nombre_interno"))})
    # las pasivas: en cada ranura manda la heredada si la hay (tapa a la de la
    # ficha) y solo cuentan las abiertas en el arbol (O-288)
    # La marca de abierta sale de la tabla del juego: el detalle no la trae para
    # los Idolos y Diamantes con tablero (ensena las de su tablero) y entonces
    # salian todas cerradas (O-304). Sin tabla, cuenta como abierta.
    marcas = [x.get("marca") for x in J.tabla_pasivas(plain, fila)]
    pasivas = []
    for p in d.get("pasivas") or []:
        if not isinstance(p, dict) or not (p.get("normal") or p.get("heredada")):
            continue
        texto = p.get("heredada") or p.get("normal") or ""
        marca = p.get("marca")
        if marca is None:
            k = (p.get("ranura") or 0) - 1
            marca = marcas[k] if 0 <= k < len(marcas) else 1
        abierta = marca == 1
        pasivas.append({"ranura": p.get("ranura"), "texto": texto, "abierta": abierta,
                        "efecto": efecto_de_pasiva(texto) if abierta else None})
    pasivas += de_espiritu
    # las de un stat fijo se suman ya a sus stats
    stats = list(stats)
    for p in pasivas:
        e = p["efecto"]
        if e and e["que"] == ["stat"]:
            stats[e["stat"]] += e["valor"]
    # en lo que se convierte con la hiper puesta: modelo, keshin, forma del modo (O-327).
    # La forma lleva los stats con lo mismo de las pasivas de stat fijo que el jugador
    if espiritu:
        try:
            espiritu.update(_aspecto_hiper(plain, fila, espiritu, d.get("cara") or "", d,
                                           (d.get("stats") or {}).get("total")))
        except Exception as ex:          # sin la forma se juega igual (solo sus %)
            espiritu["error_forma"] = str(ex)
        fo = espiritu.get("forma")
        if fo and fo.get("stats"):
            for p in pasivas:
                e = p["efecto"]
                if e and e["que"] == ["stat"]:
                    fo["stats"][e["stat"]] += e["valor"]
    return {"fila": fila, "nombre": d["nombre"], "cara": d.get("cara") or "",
            "posicion": d.get("posicion") or "", "elemento": d.get("elemento") or "",
            "nivel": d.get("nivel"), "rareza": d.get("rareza"), "arquetipo": d.get("arquetipo"),
            "stats": list(stats), "tecnicas": tecnicas, "pasivas": pasivas, "espiritu": espiritu}


# el arquetipo de la configuracion (EQ.NOMBRE_CONFIGURACION) con el nombre del partido (O-328)
_CONF_ARQUETIPO = {0: "brecha", 1: "contraataque", 2: "vinculo", 3: "tension", 4: "juego_sucio", 5: "justicia"}


def _pasivas_de_personal(plain, fila):
    """Las pasivas que suma al equipo un entrenador o un gerente (O-328), con la regla de
    las Pasivas de equipo de Pizarra (servidor.pasivas_de_equipo, O-193): solo su tabla de
    personal con numero (O-185); un convertido que aun no tiene ninguna no aporta nada
    (O-228). [{texto, efecto}]."""
    from ievr import servidor as SV
    tabla = J.tabla_pasivas(plain, fila)
    if not any(x["id"] != "00000000" for x in tabla):
        return []
    if J.array(plain, J.ARRAY_RAREZA)[fila] >= 5 and SV._tablero_guardado(plain, fila):
        return []
    from ievr import opciones as O
    valores = O._indice("partido_pasivas_valor", lambda: {f["id"].upper(): f for f in reglas._tabla("pasivas-valor.csv")})
    fuera = []
    for x in tabla:
        f = valores.get(x["id"])
        if not f or not f.get("texto"):
            continue
        texto = f["texto"].replace("<VALUE>", "%g" % round(x["valor"], 2))
        fuera.append({"texto": texto, "efecto": efecto_de_pasiva(texto)})
    return fuera


def equipo(plain, hueco):
    """Un equipo listo para jugar."""
    from ievr import servidor as SV
    e = EQ.leer(plain, hueco)
    puestos = SV._puestos_de_formacion("%08X" % e["formacion"]) if e["formacion"] else []
    nombre_formacion = ""
    if puestos:
        valor = "%08X" % e["formacion"]
        al_reves = EQ._al_reves(valor).upper()
        for f in reglas._tabla("equipo-objetos.csv"):
            if f["tipo"] == "formacion" and f["valor_equipo"].upper() in (valor, al_reves):
                nombre_formacion = f.get("nombre") or ""
                break
    jugadores, banquillo, personal = [], [], []
    for m in e["miembros"]:
        if not m["jugador"]:
            continue
        fila = m["jugador"] >> 16
        # el entrenador y los gerentes: sus pasivas cuentan para el equipo (O-328)
        if m["puesto"] >= EQ.PUESTO_STAFF:
            try:
                d = _ficha(plain, fila)
                personal.append({"nombre": d["nombre"], "puesto": m["puesto"], "elemento": d.get("elemento") or "",
                                 "posicion": d.get("posicion") or "", "pasivas": _pasivas_de_personal(plain, fila)})
            except Exception:          # sin el, se juega igual
                pass
            continue
        try:
            ficha = _ficha(plain, fila)
        except Exception as ex:          # un hueco roto no tumba el partido
            ficha = {"fila": fila, "nombre": "?", "error": str(ex)}
        ficha.update({"puesto": m["puesto"], "dorsal": m["dorsal"]})
        # O-334: el capitan lleva el brazalete
        if e["capitan"] and m["jugador"] == e["capitan"]:
            ficha["capitan"] = True
        (jugadores if m["puesto"] < TITULARES else banquillo).append(ficha)
    jugadores.sort(key=lambda j: j["puesto"])
    equipacion = _equipacion(e, jugadores + banquillo)
    from ievr import opciones as O
    return {"hueco": hueco, "nombre": O.sin_marcadores(e["nombre"]),
            "formacion": {"valor": "%08X" % e["formacion"], "nombre": nombre_formacion, "puestos": puestos},
            "capitan": e["capitan"], "jugadores": jugadores,
            # O-334: la equipacion que lleva el equipo (cada jugador, su ropa con ella)
            "equipacion": equipacion,
            "tacticas": _tacticas_del_equipo(e),
            "banquillo": [b for b in banquillo if b["puesto"] < 16],
            # O-328: el entrenador y los gerentes, y la configuracion del equipo (la carga)
            "personal": personal, "configuracion": _configuracion(plain, e)}


def _equipacion(e, fichas):
    """La equipacion del equipo para los modelos 3D (O-334): {id (uniformId en hex), disenos
    (los que tiene con ropa distinta: el de casa y el otro), campo (la ropa de campo de cada
    uno: con ella se mira si los dos equipos van iguales)}, y a cada ficha (y a su forma del
    modo y al modelo de su armadura o mixi max) su "ropa": {campo: [.glb por diseno], portero:
    [...]} (ievr/g4.py ropa_de), o nada si se queda con lo suyo. Sin hueco de la mochila el
    juego ensena la Equipacion sencilla (O-190): aqui igual. Si algo falla, sin ropa: cada uno
    con la de su equipo de historia, como antes."""
    from ievr import g4
    try:
        uniforme = (e["equipacion"] if e.get("hueco_equipacion") else 0) or g4.EQUIPACION_SENCILLA
        disenos = g4.disenos(uniforme)
        if not disenos:
            return None

        def ropa(cara):
            if not cara:
                return None
            r = {"campo": [g4.ropa_de(cara, uniforme, d, False) for d in disenos],
                 "portero": [g4.ropa_de(cara, uniforme, d, True) for d in disenos]}
            return r if any(r["campo"]) else None
        for f in fichas:
            r = ropa(f.get("cara"))
            if r:
                f["ropa"] = r
            esp = f.get("espiritu")
            if esp:
                fo = esp.get("forma")
                r = ropa(fo and (fo.get("modelo") or fo.get("cara")))
                if r:
                    fo["ropa"] = r
                r = ropa(esp.get("modelo"))
                if r:
                    esp["ropa_modelo"] = r
        # O-334, vuelta 2: la ropa de campo de cada diseno (dos equipaciones pueden llevar la misma)
        return {"id": "%08X" % uniforme, "disenos": disenos, "campo": g4.campo_de_disenos(uniforme)}
    except Exception:              # sin las tablas de la ropa se juega igual
        return None


def _configuracion(plain, e):
    """La configuracion del equipo (EQ.configuracion_de_equipo, O-204) para la carga de
    configuracion del partido (O-328): {tipo, nombre}; tipo None con Libertad."""
    try:
        c = EQ.configuracion_de_equipo(plain, e)
    except Exception:
        return {"tipo": None, "nombre": ""}
    return {"tipo": _CONF_ARQUETIPO.get(c.get("arquetipo")), "nombre": c.get("nombre") or ""}
