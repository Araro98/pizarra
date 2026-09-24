#!/usr/bin/env python3
"""La base de datos del juego: todo lo que se sabe de cada cosa, sin partida.

No lee la partida de nadie: junta las tablas de `datos/reglas-extraidas/`
(que salen de los ficheros del juego) y las sirve para la pantalla "Base de
datos". Lo que hay:

- **personajes**: ficha entera. Stats a nivel 1, 30, 50 y 99 para cada rareza
  que pueda tener, lo que le da el arbol, sus nueve tecnicas con el nivel al que
  se abren, las pasivas que le pueden salir (las de las ranuras 1-2 son de ese
  personaje; las 3-5 van por arquetipo), su equipo, su frase y sus aptitudes.
- **supertecnicas**, **espiritus**, **pasivas**, **equipacion**, **tacticas**,
  **escudos** y **equipaciones de equipo**, cada cosa con su dibujo.

Todo con los mismos calculos que usa el editor (`stats.py`), asi que si algo
cambia alli cambia aqui.
"""
import re

from ievr import jugador as J, opciones as O, reglas, stats as ST

NIVELES_FICHA = (1, 30, 50, 99)
# Que rarezas puede tener cada familia de personaje. Un futbolista normal va del
# 0 al 4 subiendo con espiritus; un Idolo es el que es; un Diamante idem.
RAREZAS_DE_FAMILIA = {"normal": (0, 1, 2, 3, 4), "hero": None, "fabled": (8,)}
NOMBRE_RAREZA = J.RAREZAS
ELEMENTO_CODIGO = {0: "Viento", 1: "Fuego", 2: "Bosque", 3: "Montana"}


def _limpio(t):
    return O._limpio(t or "")


def _texto_pasiva(t):
    """El texto de una pasiva tal como lo lee una persona: sin marcas de color."""
    t = (t or "").replace("\\\\n", " ").replace("\\n", " ")
    t = re.sub(r"\[[A-Z0-9]+\]|\[C\]", "", t)
    return re.sub(r"\s+", " ", t).strip()


# --- indices, todos de una sola pasada ---------------------------------------

def _jugadores():
    return O._indice("bd_jugadores", lambda: {f["identidad"].upper(): f
                                              for f in reglas._tabla("jugadores.csv")})


def _tecnicas():
    return O._indice("bd_tecnicas", lambda: {f["id"].upper(): f
                                             for f in reglas._tabla("tecnicas.csv")})


def _nombres():
    """{id: fila de nombres-es} de todo lo que tiene nombre."""
    return O._indice("bd_nombres", lambda: {f["id"].upper(): f
                                            for f in reglas._tabla("nombres-es.csv")})


def _pool():
    def construir():
        d = {}
        for f in reglas._tabla("pool-pasivas.csv"):
            d.setdefault(f["identidad"].upper(), []).append(f)
        return d
    return O._indice("bd_pool", construir)


def _por_ranura():
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-por-ranura.csv"):
            d.setdefault(f["grupo"], []).append(f)
        return d
    return O._indice("bd_por_ranura", construir)


def _iconos_objeto():
    return O._iconos_de_objeto()


def _clave_stats(identidad):
    return ST._claves().get(identidad.upper())


# --- personajes ----------------------------------------------------------------

def _resumen(ident, f, jug):
    clave = _clave_stats(ident) or (0, 0, 0, 0)
    rareza_valor = int(f.get("rareza_valor") or 0)
    # a nivel 99, sin judias ni equipacion y con lo que suma su arbol si es
    # un normal: lo mismo que Fichar (O-236)
    stats = O._stats99_con_arbol(ident, rareza_valor)
    poder = O._poder99_con_arbol(ident, rareza_valor) if any(stats) else 0
    return {
        "identidad": ident,
        "nombre": _limpio(jug.get("nombre") or f.get("nombre_es") or f.get("nombre_en")),
        "cara": jug.get("string_id") or O._cara_por_identidad().get(ident, ""),
        **O.datos_cuerpo(ident),
        "posicion": jug.get("posicion") or "",
        "posicion_alt": jug.get("posicion_alt") or "",
        "elemento": jug.get("elemento") or "",
        "arquetipo": jug.get("arquetipo") or "",
        "rareza": f.get("rareza") or "",
        "rareza_valor": rareza_valor,
        "rareza_nombre": NOMBRE_RAREZA.get(rareza_valor, ""),
        "equipo": O.sin_marcadores(jug.get("equipo") or ""),
        "rango": clave[3], "patron": clave[2],
        "apt": ("entrenador" if f.get("apt_entrenador") else
                "gerente" if f.get("apt_gerente") else "jugador"),
        "poder": poder, "stats": stats,
    }


def personajes():
    """Todos los personajes con nombre, en resumen, para la lista."""
    def construir():
        jugs = _jugadores()
        fichables = {x["identidad"].upper() for x in reglas._tabla("fichables.csv")}
        fuera = []
        for ident, f in reglas.personajes().items():
            ident = ident.upper()
            jug = jugs.get(ident) or {}
            r = _resumen(ident, f, jug)
            r["saga"] = f.get("saga") or ""          # el juego de origen (O-208)
            r["apodo"] = f.get("apodo") or ""        # el apodo, para buscar (O-219)
            r.update(O.puede_llevar(ident))           # armadura / mixi / modo (O-222)
            r["fichable"] = "si" if ident in fichables else "no"   # O-205
            # Sin posicion no es alineable: son las versiones de historia
            # (c04002410_5000...) que no tienen cara, stats ni nada que ensenar.
            if not r["nombre"] or not r["posicion"]:
                continue
            fuera.append(r)
        fuera.sort(key=lambda x: (x["nombre"].lower(), x["rareza_valor"]))
        return fuera
    return O._indice("bd_personajes", construir)


def _tecnica_de(idh, nivel):
    """Una tecnica del arbol, resuelta: nombre, tipo, afinidad, poder."""
    if not idh:
        return None
    t = _tecnicas().get(idh)
    if t:
        return {"id": idh, "nombre": _limpio(t.get("nombre")), "tipo": t.get("categoria") or "",
                "subtipo": t.get("subtipo") or "", "elemento": t.get("elemento") or "",
                "poder": int(t.get("poder") or 0), "tp": int(t.get("tp") or 0),
                "jugadores": O.jugadores_de_tecnica(t)[0],
                "nivel": nivel}
    n = _nombres().get(idh) or {}
    esp = O._espiritus().get(idh) or {}
    return {"id": idh, "nombre": _limpio(n.get("nombre_es") or n.get("nombre_en")) or idh,
            "tipo": "Hipertecnica" if n.get("categoria") == "aura" else "",
            "subtipo": esp.get("familia") or "", "elemento": "", "poder": 0, "tp": 0,
            "nivel": nivel, "icono": esp.get("icono") or ""}


def _stats_por_rareza(ident, familia, rareza_propia):
    """Los siete stats a los niveles tabulados, por cada rareza posible."""
    rarezas = RAREZAS_DE_FAMILIA.get(familia)
    if rarezas is None:
        rarezas = (rareza_propia,)
    fuera = []
    for r in rarezas:
        filas = {}
        for n in NIVELES_FICHA:
            b = ST.base(int(ident, 16), n, r)
            if b:
                filas[n] = b["valores"]
        if filas:
            fuera.append({"rareza": r, "nombre": NOMBRE_RAREZA.get(r, ""),
                          "multiplicador": ST.MULTIPLICADOR.get(r, 1.0),
                          "niveles": filas})
    return fuera


def _arbol_de(posicion, alt):
    """Lo que le da el arbol entero a ese personaje, por rama."""
    listas = ST._listas_del_arbol()
    def suma(lista, codigo, cuales):
        nombres = listas.get((lista, codigo)) or []
        out = []
        for cual, cuanto in cuales:
            if cual < len(nombres) and nombres[cual]:
                out.append({"stat": nombres[cual], "suma": cuanto})
        return out
    return {
        "tronco": suma("principal", posicion, [(0, 3), (1, 5)]),
        "rama1": suma("principal", posicion, [(0, 3), (1, 5), (2, 7)]),
        "rama2": suma("secundaria", alt, [(0, 3), (1, 5), (2, 7)]),
    }


def _rareza_pasivas():
    """{id: {rareza: {"id", "valor"}}} para las pasivas que cambian con la rareza (O-46)."""
    def construir():
        grupos = {}
        for f in reglas._tabla("pasivas-rareza.csv"):
            grupos.setdefault(f["grupo"], {})[int(f["rareza"])] = {"id": f["id"].upper(),
                                                                     "valor": f.get("valor") or ""}
        d = {}
        for g in grupos.values():
            for x in g.values():
                d[x["id"]] = g
        return d
    return O._indice("bd_rareza_pasivas", construir)


def _pasiva_con_valores(pid):
    """Texto con el numero, plantilla con <VALUE> y los valores por rareza."""
    f = O._valores_pasiva().get(pid) or {}
    return {"texto": O.nombre_pasiva(pid) or _texto_pasiva(f.get("texto")),
            "plantilla": f.get("texto") or "", "valor": f.get("valor") or "",
            "por_rareza": _rareza_pasivas().get(pid)}


def _pasivas_de(ident, resumen):
    """Las pasivas que le pueden salir: 1-2 del personaje, 3-5 por arquetipo.
    Un Idolo o Diamante nativo no sortea: van las 5 fijas de su tablero (O-162)."""
    iconos = O.iconos_de_pasiva()
    fijas = O.pasivas_fijas(ident, 1)
    if fijas:
        lista = []
        for ranura, pid in enumerate(fijas, 1):
            x = {"id": pid, "ranura": ranura, "icono": iconos.get(pid, ""), "fija": True}
            x.update(_pasiva_con_valores(pid))
            lista.append(x)
        # un Diamante tiene otras tres en la rama 2
        rama2 = [pid for pid in O.pasivas_fijas(ident, 2) if pid not in fijas]
        otras = []
        for pid in rama2:
            x = {"id": pid, "icono": iconos.get(pid, ""), "fija": True}
            x.update(_pasiva_con_valores(pid))
            otras.append(x)
        # y si es un Diamante al que se le elige arquetipo, la pareja de cada uno
        por_arquetipo = {}
        for a in O.arquetipos_elegibles(ident):
            lista_a = []
            for ranura, pid in zip((4, 5), O.PAREJA_ARQUETIPO.get(a, ())):
                x = {"id": pid, "ranura": ranura, "icono": iconos.get(pid, ""), "fija": True}
                x.update(_pasiva_con_valores(pid))
                lista_a.append(x)
            por_arquetipo[J.ARQUETIPOS.get(a, str(a))] = lista_a
        return {"propias": [], "por_arquetipo": por_arquetipo, "fijas": lista, "fijas_rama2": otras}
    propias, vistas = [], set()
    for f in _pool().get(ident, []):
        pid = f["pasiva_id"].upper()
        if pid in vistas:
            continue
        vistas.add(pid)
        x = {"id": pid, "icono": iconos.get(pid, ""),
             "fija": (f.get("fijas_de_historia") or "").strip() == "si"}
        x.update(_pasiva_con_valores(pid))
        if not x["texto"]:
            x["texto"] = _texto_pasiva(f.get("pasiva"))
        propias.append(x)
    por_arquetipo = {}
    for grupo, filas in _por_ranura().items():
        m = re.match(r"^(\w[\w ]*?) \(ranura (\d)\)$", grupo)
        if not m:
            continue
        arq, ranura = m.group(1), int(m.group(2))
        if ranura < 3:
            continue
        lista = por_arquetipo.setdefault(arq, [])
        for f in filas:
            pid = f["id"].upper()
            x = {"id": pid, "ranura": ranura, "familia": f.get("familia") or "",
                 "alcance": f.get("alcance") or "", "icono": iconos.get(pid, "")}
            x.update(_pasiva_con_valores(pid))
            if not x["texto"]:
                x["texto"] = _texto_pasiva(f.get("nombre"))
            lista.append(x)
    return {"propias": propias, "por_arquetipo": por_arquetipo}


def _pasivas_personal_de(ident, f):
    """Las pasivas que lleva como gerente o entrenador, por arquetipo: las de
    fabrica (clave del personaje) o las de Diamante (clave 100). NOTAS O-164."""
    if f.get("rareza") == "fabled":
        roles = [("entrenador", 100), ("gerente", 100)]
    else:
        clave = O.clave_personal(ident)
        roles = [(r, clave) for r, apt in (("entrenador", "apt_entrenador"), ("gerente", "apt_gerente"))
                 if f.get(apt) and clave]
    if not roles:
        return None
    iconos = O.iconos_de_pasiva()
    fuera = {}
    for rol, clave in roles:
        por_arq = {}
        for a, nombre in sorted(J.ARQUETIPOS.items()):
            lista = []
            for pid in O.pasivas_personal(rol, a, clave):
                x = {"id": pid, "icono": iconos.get(pid, "")}
                x.update(_pasiva_con_valores(pid))
                lista.append(x)
            if lista:
                por_arq[nombre] = lista
        if por_arq:
            fuera[rol] = por_arq
    return fuera or None


# --- cambios de modo (NOTAS O-225) -------------------------------------------

def _modos():
    """({identidad: fila de modos.csv}, {identidad de la forma: fila})."""
    def construir():
        de, a = {}, {}
        for f in reglas._tabla("modos.csv"):
            de[f["de"].upper()] = f
            a[f["a"].upper()] = f
        return de, a
    return O._indice("bd_modos", construir)


def _forma_de_modo(f):
    """La forma que toma un personaje con su modo, resumida para la ficha: lo
    de siempre mas sus stats por rareza y sus tecnicas (sin repetir)."""
    ident = f["a"].upper()
    p = reglas.personajes().get(ident)
    if not p:
        return None
    r = _resumen(ident, p, _jugadores().get(ident) or {})
    tecnicas, vistas = [], set()
    for k in range(1, 10):
        idh = (p.get("tec%d" % k) or "").upper()
        if idh and idh not in vistas:
            vistas.add(idh)
            t = _tecnica_de(idh, int(p.get("tec%d_nivel" % k) or 0))
            if t:
                tecnicas.append(t)
    r["stats"] = _stats_por_rareza(ident, p.get("rareza"), int(p.get("rareza_valor") or 0))
    r["tecnicas"] = tecnicas
    return r


def personaje(identidad):
    """La ficha entera de un personaje."""
    ident = identidad.upper()
    f = reglas.personajes().get(ident)
    if not f:
        return None
    jug = _jugadores().get(ident) or {}
    r = _resumen(ident, f, jug)
    clave = _clave_stats(ident) or (0, 0, 0, 0)
    tecnicas = []
    for k in range(1, 10):
        t = _tecnica_de((f.get("tec%d" % k) or "").upper(), int(f.get("tec%d_nivel" % k) or 0))
        if t:
            t["ranura"] = k
            t["trozo"] = "tronco" if k <= 3 else ("rama 1" if k <= 6 else "rama 2")
            tecnicas.append(t)
    r.update({
        "descripcion": O.sin_marcadores(O._descripcion_por_identidad().get(ident, "")),
        "equipacion_icono": O._equipacion_por_identidad().get(ident, ""),
        "stats": _stats_por_rareza(ident, f.get("rareza"), int(f.get("rareza_valor") or 0)),
        "nombres_stats": ST.NOMBRES,
        "arbol": _arbol_de(clave[0], clave[1]),
        "arbol_conocido": (f.get("rareza") == "normal"),
        "tecnicas": tecnicas,
        "pasivas": _pasivas_de(ident, r),
        "apt_entrenador": bool(f.get("apt_entrenador")),
        "pasivas_personal": _pasivas_personal_de(ident, f),
        "apt_gerente": bool(f.get("apt_gerente")),
        "variantes": [x for x in personajes()
                      if x["nombre"] == r["nombre"] and x["identidad"] != ident],
    })
    # si se puede fichar (O-205) y que armaduras, mixi max y modos puede llevar
    # de forma legal (espiritus-duenos.csv, O-209, O-222)
    r["fichable"] = ident in {x["identidad"].upper() for x in reglas._tabla("fichables.csv")}
    esp = O._espiritus()
    legales = []
    for x in reglas._tabla("espiritus-duenos.csv"):
        if (x.get("identidad") or "").upper() == ident and x.get("personaje") != "todos":
            e = esp.get(x["id"].upper()) or {}
            n = _nombres().get(x["id"].upper()) or {}
            legales.append({"id": x["id"].upper(), "familia": e.get("familia") or x.get("familia") or "",
                            "nombre": _limpio(n.get("nombre_es") or n.get("nombre_en") or e.get("nombre_largo") or ""),
                            "icono": e.get("icono") or "", "rango": int(e.get("rango") or 0)})
    vistos = set()
    r["espiritus_legales"] = [x for x in sorted(legales, key=lambda x: (x["familia"], x["nombre"]))
                              if not (x["id"] in vistos or vistos.add(x["id"]))]
    # el cambio de modo, si lo tiene, y de quien es forma, si lo es (O-225)
    de, a = _modos()
    if ident in de:
        f = de[ident]
        r["modo"] = dict({"nombre": f["modo_nombre"], "id": f["modo"], "forma": _forma_de_modo(f)},
                         **{k: f.get(k) or "" for k in ("tension", "duracion", "at", "df", "velocidad", "extra")})
    if ident in a:
        f = a[ident]
        base = reglas.personajes().get(f["de"].upper()) or {}
        r["forma_de"] = {"identidad": f["de"].upper(), "modo": f["modo_nombre"],
                         "nombre": _limpio(base.get("nombre_es") or base.get("nombre_en") or "")}
    return r


# --- lo demas ------------------------------------------------------------------

def tecnicas():
    fuera = []
    origen = {f["id"].upper(): f for f in reglas._tabla("tecnicas-origen.csv")}
    for idh, t in _tecnicas().items():
        n_jug, comb = O.jugadores_de_tecnica(t)
        og = origen.get(idh) or {}
        fuera.append({"id": idh, "nombre": _limpio(t.get("nombre")),
                      "tipo": t.get("categoria") or "", "subtipo": t.get("subtipo") or "",
                      "elemento": t.get("elemento") or "",
                      "poder": int(t.get("poder") or 0), "tp": int(t.get("tp") or 0),
                      "interno": t.get("nombre_interno") or "",
                      # individual o combinada (O-237), y como se consigue (O-206)
                      "jugadores": n_jug, "combinada": comb,
                      "origen": og.get("origen") or "",
                      "obtenible": og.get("obtenible") or "",
                      "descripcion": t.get("descripcion") or ""})
    fuera.sort(key=lambda x: (x["tipo"], -x["poder"], x["nombre"].lower()))
    return fuera


def _dueno_de_espiritu(idh, familia):
    d = O.duenos_de_espiritu(idh)
    if d.get("todos") or familia in ("kenshin", "alma"):
        return {"quien": "Cualquiera", "dueno": "de cualquier jugador"}
    if d["nombres"]:
        return {"quien": "Solo su personaje", "dueno": "solo de " + ", ".join(sorted(d["nombres"]))}
    return {"quien": "Sin dueno conocido", "dueno": ""}


def espiritus():
    esp = O._espiritus()
    fuera = []
    for idh, n in _nombres().items():
        if n.get("categoria") != "aura":
            continue
        e = esp.get(idh) or {}
        fuera.append({"id": idh, "nombre": _limpio(n.get("nombre_es") or n.get("nombre_en")),
                      "familia": e.get("familia") or "", "rango": int(e.get("rango") or 0),
                      "icono": e.get("icono") or "", "modelo": e.get("modelo") or "",
                      # la habilidad pasiva de cada uno (NOTAS O-184)
                      "pasiva": O.pasiva_de_espiritu(idh),
                      "nombre_largo": e.get("nombre_largo") or "",
                      # quien puede llevarlo (O-172, O-209)
                      **_dueno_de_espiritu(idh, e.get("familia") or "")})
    fuera.sort(key=lambda x: (x["familia"], -x["rango"], x["nombre"].lower()))
    return fuera


def pasivas():
    """Las pasivas agrupadas por texto: una linea por efecto, con el valor de
    cada rareza (las de la tabla de rarezas, O-46) o la lista de valores fijos
    (las de casilla de stat, +3/+5/+7)."""
    iconos = O.iconos_de_pasiva()
    rareza = _rareza_pasivas()
    grupos = {}
    for idh, n in _nombres().items():
        if n.get("categoria") != "pasiva":
            continue
        v = O._valores_pasiva().get(idh) or {}
        plantilla = _texto_pasiva(v.get("texto") or n.get("nombre_es") or n.get("nombre_en"))
        clase = reglas.clase_de_pasiva(idh)
        propia = idh in O.pasivas_personalizadas()   # las 37 `ss_ps*` (O-179)
        # una linea por texto: las versiones por rareza y las dos familias con
        # el mismo texto (O-55) se juntan, que es como lo lee una persona
        g = grupos.setdefault(plantilla, {
            "texto": plantilla, "clase": clase, "icono": iconos.get(idh, ""),
            "ids": [], "por_rareza": None, "valores": [], "personalizada": False})
        g["ids"].append(idh)
        if propia:
            g["personalizada"] = True
        # "de Idolo" solo si TODAS las versiones lo son; si hay de las dos, nada
        if g["clase"] != clase and len(g["ids"]) > 1:
            g["clase"] = "mixta" if "hero" in (clase, g["clase"]) else (g["clase"] or clase)
        if not g["icono"]:
            g["icono"] = iconos.get(idh, "")
        if idh in rareza and g["por_rareza"] is None:
            g["por_rareza"] = rareza[idh]
        elif idh not in rareza and v.get("valor") not in ("", None):
            if v["valor"] not in g["valores"]:
                g["valores"].append(v["valor"])
    fuera = list(grupos.values())
    for g in fuera:
        g["valores"].sort(key=lambda x: float(x) if x.replace(".", "", 1).replace("-", "", 1).isdigit() else 0)
    fuera.sort(key=lambda x: x["texto"].lower())
    return fuera


def sinergias():
    """Las sinergias del juego, tal cual (NOTAS O-191)."""
    return O.sinergias()


def objetos():
    """Equipacion con sus bonus, y lo demas de la mochila, con su dibujo."""
    bonus = {f["id"].upper(): f for f in reglas._tabla("bonus-objeto.csv")}
    iconos = _iconos_objeto()
    fuera = []
    for idh, n in _nombres().items():
        cat = n.get("categoria") or ""
        if cat in ("pasiva", "aura", "supertecnica"):
            continue
        b = bonus.get(idh) or {}
        nombre = _limpio(n.get("nombre_es") or n.get("nombre_en"))
        o = {"id": idh, "nombre": nombre,
             "categoria": cat, "icono": iconos.get(idh, ""),
             "bonus": [int(b.get(c) or 0) for c in ST.CLAVES] if b else None,
             "bonus_texto": O._bonus_de(idh)}
        if cat in ("tactica-objeto", "supertactica"):
            # lo que hace, con sus numeros (O-232, O-235)
            o.update(O.datos_de_tactica("", idh, nombre))
        fuera.append(o)
    fuera.sort(key=lambda x: (x["categoria"], x["nombre"].lower()))
    return fuera
