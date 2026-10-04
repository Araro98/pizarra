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
    (r"Hasta que el equipo reciba una falta", None),        # no hay faltas: siempre
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


def efecto_de_pasiva(texto):
    """{que:[...], pct, alcance, condicion, n} de una pasiva, o None si en el
    partido aun no hace nada. Las de un stat fijo ("Potencia +3"):
    {que:["stat"], stat, valor}."""
    if not texto or re.search(_SIN_EFECTO, texto):
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
    return {"que": que, "pct": pct, "alcance": alcance, "condicion": condicion, "n": n}


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
    tecnicas = []
    for t in d.get("tecnicas") or []:
        if not (t.get("puesta") and t.get("abierta") and t.get("tipo")):
            continue
        idh = t.get("id") or ids.get(t["ranura"], "")
        tecnicas.append({"ranura": t["ranura"], "id": idh, "nombre": t["puesta"],
                         "interno": (portec.get(idh) or {}).get("nombre_interno") or "",
                         "tipo": t["tipo"], "subtipo": (portec.get(idh) or {}).get("subtipo") or "",
                         "subtipo_valor": int((portec.get(idh) or {}).get("subtipo_valor") or 0),
                         "elemento": t["elemento"], "poder": t["poder"],
                         "tp": t["tp"], "jugadores": t.get("jugadores") or 1})
    # las pasivas: en cada ranura manda la heredada si la hay (tapa a la de la
    # ficha) y solo cuentan las abiertas en el arbol (O-288)
    pasivas = []
    for p in d.get("pasivas") or []:
        if not isinstance(p, dict) or not (p.get("normal") or p.get("heredada")):
            continue
        texto = p.get("heredada") or p.get("normal") or ""
        abierta = p.get("marca") == 1
        pasivas.append({"ranura": p.get("ranura"), "texto": texto, "abierta": abierta,
                        "efecto": efecto_de_pasiva(texto) if abierta else None})
    # las de un stat fijo se suman ya a sus stats
    stats = list(stats)
    for p in pasivas:
        e = p["efecto"]
        if e and e["que"] == ["stat"]:
            stats[e["stat"]] += e["valor"]
    return {"fila": fila, "nombre": d["nombre"], "cara": d.get("cara") or "",
            "posicion": d.get("posicion") or "", "elemento": d.get("elemento") or "",
            "nivel": d.get("nivel"), "rareza": d.get("rareza"), "arquetipo": d.get("arquetipo"),
            "stats": list(stats), "tecnicas": tecnicas, "pasivas": pasivas}


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
    jugadores, banquillo = [], []
    for m in e["miembros"]:
        if not m["jugador"]:
            continue
        fila = m["jugador"] >> 16
        try:
            ficha = _ficha(plain, fila)
        except Exception as ex:          # un hueco roto no tumba el partido
            ficha = {"fila": fila, "nombre": "?", "error": str(ex)}
        ficha.update({"puesto": m["puesto"], "dorsal": m["dorsal"]})
        (jugadores if m["puesto"] < TITULARES else banquillo).append(ficha)
    jugadores.sort(key=lambda j: j["puesto"])
    from ievr import opciones as O
    return {"hueco": hueco, "nombre": O.sin_marcadores(e["nombre"]),
            "formacion": {"valor": "%08X" % e["formacion"], "nombre": nombre_formacion, "puestos": puestos},
            "capitan": e["capitan"], "jugadores": jugadores,
            "banquillo": [b for b in banquillo if b["puesto"] < 16]}
