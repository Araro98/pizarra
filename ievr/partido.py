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
from ievr import equipos as EQ, jugador as J, reglas

TITULARES = EQ.EN_EL_CAMPO          # puestos 0 a 10


def equipos(plain):
    """[{hueco, nombre, cuantos, en_el_campo}] de los equipos que se pueden
    sacar a jugar: los de la partida con once en el campo."""
    return [e for e in EQ.todos(plain) if e["en_el_campo"] >= TITULARES]


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
                         "elemento": t["elemento"], "poder": t["poder"],
                         "tp": t["tp"], "jugadores": t.get("jugadores") or 1})
    # las pasivas, de momento con su texto (los efectos con numero, mas adelante)
    pasivas = [{"ranura": p.get("ranura"), "texto": p.get("normal") or "",
                "heredada": p.get("heredada") or "", "abierta": p.get("marca") == 1,
                "fija": bool(p.get("fija"))}
               for p in d.get("pasivas") or [] if isinstance(p, dict) and (p.get("normal") or p.get("heredada"))]
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
