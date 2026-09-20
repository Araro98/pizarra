"""Presets: combinaciones hechas de judias, equipacion y pasivas, y el boton MAX.

Son atajos de clics (Aaron, NOTAS O-218): hacen lo mismo que ir ranura por
ranura, con las mismas funciones de `escribir.py` y las mismas reglas, y luego
se puede cambiar cualquier cosa a mano. No valen para Idolos ni Diamantes.
"""
from ievr import escribir as E, inventario, jugador as J, opciones as O

# --- judias: siempre al tope que permite el nivel ------------------------------
PRESETS_JUDIAS = [
    {"clave": "delantero", "nombre": "Delantero", "tipos": ["Potencia", "Control", "Tecnica"]},
    {"clave": "medio", "nombre": "MD", "tipos": ["Control", "Tecnica", "Inteligencia"]},
    {"clave": "defensa", "nombre": "Defensa", "tipos": ["Inteligencia", "Presion", "Fisico"]},
    {"clave": "portero", "nombre": "Portero", "tipos": ["Presion", "Fisico", "Agilidad"]},
]

# --- equipacion: (ranura, id del objeto como en la partida) ----------------------
PRESETS_EQUIPACION = [
    {"clave": "delantero", "nombre": "Delantero",
     "objetos": [(1, "E415D568"), (2, "115EF0DC"), (3, "F59B26B4"), (4, "79250F71")]},
    {"clave": "medio", "nombre": "MD",
     "objetos": [(1, "A4E285C8"), (2, "FA9C3BDA"), (3, "2DC0F716"), (4, "2E450FDC")]},
    {"clave": "focos", "nombre": "MD / DF focos",
     "objetos": [(1, "A4E285C8"), (2, "FA9C3BDA"), (3, "7FCD89AF"), (4, "25F63767")]},
    {"clave": "muros", "nombre": "Defensa muros",
     "objetos": [(1, "79D42A7E"), (2, "299A1787"), (3, "A8D6B813"), (4, "246891D6")]},
    {"clave": "portero", "nombre": "Portero",
     "objetos": [(1, "206A6C7C"), (2, "299A1787"), (3, "F575E3F0"), (4, "CA29E180")]},
]

# --- pasivas -------------------------------------------------------------------
# La pareja de arquetipo (ranuras 4 y 5, por "Cambiar"): el id base, que el
# juego ensena con el numero de la rareza del jugador (O-165).
PAREJA_DE_ARQUETIPO = {
    5: "5590EE4C",   # Justicia: Por cada rango de Conf. Justicia, AT y DF del equipo
    0: "9D5F52A9",   # Brecha: Tasa de brecha del equipo
    1: "1F3D649B",   # Contra: Por cada rango de Conf. Contraataque, valor de foco del equipo
    2: "01D4B17B",   # Afinidad: Al hacer un pase, poder de afinidad
    3: "7467BCE0",   # Tension: Por cada rango de Conf. Tension, tension
    4: "2B41EE9C",   # Juego sucio: al ser derribado en esprint, tension
}
# Los subpresets: la heredada que va tres veces (ranuras 1-3, por "Heredar") y
# la pasiva personalizada equivalente. Sin equivalente (PP), la de foco de
# distintas posiciones, que es lo que pidio Aaron.
PERSONALIZADA_POR_DEFECTO = "269B0969"
SUBPRESETS_PASIVAS = [
    {"clave": "foco-distinta-posicion", "nombre": "Foco distinta posicion", "heredada": "A3D9E511", "personalizada": "269B0969"},
    {"clave": "foco-misma-posicion", "nombre": "Foco misma posicion", "heredada": "2811ECBB", "personalizada": "0AFA0787"},
    {"clave": "foco-mismo-elemento", "nombre": "Foco mismo elemento", "heredada": "13F0852C", "personalizada": "67AA1270"},
    {"clave": "foco-distinto-elemento", "nombre": "Foco distinto elemento", "heredada": "4467E7A3", "personalizada": "7E6E7F77"},
    {"clave": "tiro-misma-posicion", "nombre": "Tiro misma posicion", "heredada": "127784FB", "personalizada": "EF73C0E7"},
    {"clave": "tiro-mismo-elemento", "nombre": "Tiro mismo elemento", "heredada": "FD5F303E", "personalizada": "DDFB1BE9"},
    {"clave": "tiro-distinto-elemento", "nombre": "Tiro distinto elemento", "heredada": "AAC852B1", "personalizada": "C43F76EE"},
    {"clave": "tiro-propio", "nombre": "Tiro propio", "heredada": "0511DD1F", "personalizada": "6D11F6D5"},
    {"clave": "pp", "nombre": "PP", "heredada": "38C0FBBB", "personalizada": PERSONALIZADA_POR_DEFECTO},
]

NIVEL_MAX = 99
RAREZA_MAX = 4          # Leyenda del futbol
PARTIDOS_MAX = 30


def _solo_normales(plain, fila):
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    if rareza >= 5:
        raise E.Ilegal("los presets y el MAX son para futbolistas normales: un %s "
                       "tiene sus cosas fijas" % J.RAREZAS.get(rareza, "Idolo"))


def _texto(id_hex, rareza=RAREZA_MAX):
    return O.nombre_pasiva(O.variante_por_rareza(id_hex, rareza), id_hex)


def _nombre_objeto(id_hex):
    from ievr import reglas
    for f in reglas._tabla("nombres-es.csv"):
        if f["id"].upper() == id_hex:
            return O.sin_marcadores(f.get("nombre_es") or f.get("nombre_en") or id_hex)
    return id_hex


def definiciones():
    """Lo que ensena el editor: nombres, textos e iconos de cada preset."""
    iconos_p = O.iconos_de_pasiva()
    iconos_o = O._iconos_de_objeto()
    return {
        "judias": [{"clave": p["clave"], "nombre": p["nombre"], "tipos": p["tipos"]}
                   for p in PRESETS_JUDIAS],
        "equipacion": [{"clave": p["clave"], "nombre": p["nombre"],
                        "objetos": [{"ranura": r, "id": i, "nombre": _nombre_objeto(i),
                                     "icono200": iconos_o.get(i, "")} for r, i in p["objetos"]]}
                       for p in PRESETS_EQUIPACION],
        "arquetipos": [{"valor": k, "nombre": J.ARQUETIPOS[k], "pasiva": PAREJA_DE_ARQUETIPO[k],
                        "texto": _texto(PAREJA_DE_ARQUETIPO[k]),
                        "icono200": iconos_p.get(PAREJA_DE_ARQUETIPO[k], "")}
                       for k in sorted(PAREJA_DE_ARQUETIPO)],
        "subpresets": [{"clave": s["clave"], "nombre": s["nombre"],
                        "heredada": {"id": s["heredada"], "texto": _texto(s["heredada"]),
                                     "icono200": iconos_p.get(s["heredada"], "")},
                        "personalizada": {"id": s["personalizada"], "texto": _texto(s["personalizada"], 0),
                                          "icono200": iconos_p.get(s["personalizada"], "")}}
                       for s in SUBPRESETS_PASIVAS],
        "max": {"nivel": NIVEL_MAX, "rareza": J.RAREZAS.get(RAREZA_MAX, "Leyenda"), "partidos": PARTIDOS_MAX},
    }


def _asegura_objeto(plain, id_hex):
    """Si no se tiene ese objeto, se crea uno (como "Conseguir" en la mochila)."""
    if inventario.filas_poseidas(plain).get(id_hex):
        return plain, False
    plain, _ = E.anadir_objeto(plain, id_hex, 1)
    return plain, True


def preset_judias(plain, fila, clave):
    """Las tres judias del preset, al tope que permite el nivel."""
    _solo_normales(plain, fila)
    p = next((x for x in PRESETS_JUDIAS if x["clave"] == clave), None)
    if p is None:
        raise E.Ilegal("no conozco el preset de judias %r" % clave)
    nivel = J.array(plain, J.ARRAY_NIVEL)[fila]
    tope = E.tope_judias(nivel)
    if tope == 0:
        raise E.Ilegal("a nivel %d las judias aun no estan abiertas (se abren al %d)"
                       % (nivel, E.NIVEL_MINIMO_JUDIAS))
    # se vacian las tres antes, para que no choque el "no repetir tipo"
    off_tipo, _ = E._campo(plain, fila, J.F_JUDIA_TIPO)
    off_cant, _ = E._campo(plain, fila, J.F_JUDIA_CANT)
    buf = bytearray(plain)
    for k in range(3):
        buf[off_tipo + 2 * k:off_tipo + 2 * k + 2] = b"\xff\xff"
        buf[off_cant + 2 * k:off_cant + 2 * k + 2] = b"\x00\x00"
    plain = bytes(buf)
    for ranura, tipo in enumerate(p["tipos"], 1):
        plain, _ = E.poner_tipo_judia(plain, fila, ranura, tipo, tope)
    return plain, {"fila": fila, "que": "preset de judias", "preset": p["nombre"],
                   "tope": tope, "aviso": "Judias %s: %s, %d cada una." % (p["nombre"], ", ".join(p["tipos"]), tope)}


def preset_equipacion(plain, fila, clave):
    """Las cuatro piezas del preset; si falta alguna en la mochila se crea."""
    _solo_normales(plain, fila)
    p = next((x for x in PRESETS_EQUIPACION if x["clave"] == clave), None)
    if p is None:
        raise E.Ilegal("no conozco el preset de equipacion %r" % clave)
    creados = []
    for ranura, id_hex in p["objetos"]:
        plain, creado = _asegura_objeto(plain, id_hex)
        if creado:
            creados.append(_nombre_objeto(id_hex))
        try:
            plain, _ = E.poner_equipacion(plain, fila, ranura, id_hex)
        except E.Ilegal as ex:
            if "ya lleva" not in str(ex):
                raise
    return plain, {"fila": fila, "que": "preset de equipacion", "preset": p["nombre"],
                   "aviso": "Equipacion %s puesta." % p["nombre"]
                            + (" Se crearon en la mochila: " + ", ".join(creados) + "." if creados else "")}


def preset_pasivas(plain, fila, arquetipo, clave):
    """El arquetipo con su pareja en las ranuras 4 y 5 (por "Cambiar"), la
    heredada del subpreset tres veces en las ranuras 1-3 (por "Heredar") y la
    pasiva personalizada equivalente."""
    _solo_normales(plain, fila)
    arquetipo = int(arquetipo)
    if arquetipo not in PAREJA_DE_ARQUETIPO:
        raise E.Ilegal("no conozco el arquetipo %r" % arquetipo)
    s = next((x for x in SUBPRESETS_PASIVAS if x["clave"] == clave), None)
    if s is None:
        raise E.Ilegal("no conozco el preset de pasivas %r" % clave)
    arq_ahora = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila]
    if arq_ahora != arquetipo:
        plain, _ = E.poner_arquetipo(plain, fila, J.ARQUETIPOS[arquetipo])
    pareja = PAREJA_DE_ARQUETIPO[arquetipo]
    for ranura in (4, 5):
        plain, _ = E.poner_pasiva(plain, fila, ranura, pareja)
    # las heredadas: fuera las que hubiera en 1-3 y la del preset tres veces
    off, _ = E._campo(plain, fila, J.F_HEREDADAS)
    for ranura in (1, 2, 3):
        if any(plain[off + 4 * (ranura - 1):off + 4 * ranura]):
            plain, _ = E.quitar_heredada(plain, fila, ranura)
    for ranura in (1, 2, 3):
        plain, _ = E.poner_heredada(plain, fila, ranura, s["heredada"])
    # la personalizada equivalente (se crea el manual si no se tiene)
    plain, creado = _asegura_objeto(plain, s["personalizada"])
    try:
        plain, _ = E.poner_personalizada(plain, fila, s["personalizada"])
    except E.Ilegal as ex:
        if "ya lleva" not in str(ex):
            raise
    return plain, {"fila": fila, "que": "preset de pasivas", "preset": s["nombre"],
                   "arquetipo": J.ARQUETIPOS[arquetipo],
                   "aviso": "Pasivas %s de %s: %s x2 en las ranuras 4 y 5, %s x3 heredada en las 1-3 y la personalizada %s."
                            % (s["nombre"], J.ARQUETIPOS[arquetipo], _texto(pareja), _texto(s["heredada"]),
                               _texto(s["personalizada"], 0))
                            + (" Se creo el manual de la personalizada en la mochila." if creado else "")}


def maximo(plain, fila):
    """Nivel 99, Leyenda del futbol y 30 partidos, de una vez."""
    _solo_normales(plain, fila)
    hecho = []
    if J.array(plain, J.ARRAY_NIVEL)[fila] != NIVEL_MAX:
        plain, _ = E.poner_nivel(plain, fila, NIVEL_MAX)
        hecho.append("nivel %d" % NIVEL_MAX)
    if J.array(plain, J.ARRAY_RAREZA)[fila] != RAREZA_MAX:
        plain, _ = E.poner_rareza(plain, fila, RAREZA_MAX)
        hecho.append(J.RAREZAS.get(RAREZA_MAX, "Leyenda"))
    try:
        offp, _ = E._campo(plain, fila, E.F_PARTIDOS)
        import struct
        partidos = struct.unpack_from("<I", plain, offp)[0]
    except Exception:
        partidos = None
    if partidos != PARTIDOS_MAX:
        plain, _ = E.poner_partidos(plain, fila, PARTIDOS_MAX)
        hecho.append("%d partidos" % PARTIDOS_MAX)
    return plain, {"fila": fila, "que": "MAX",
                   "aviso": ("MAX: " + ", ".join(hecho) + ".") if hecho else "Ya estaba al maximo."}
