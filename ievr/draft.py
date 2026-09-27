"""Modo draft entre dos jugadores (NOTAS O-247).

Aqui solo va lo que necesita el servidor local:

- `candidatos()`: los personajes que pueden salir en el draft, con lo que hace
  falta para pintarlos (cara, busto, posicion, afinidad, stats a nivel 99 en
  Leyenda con su arbol). Salen tambien los ilegales (no fichables: formas de
  modo, mixi max, versiones de la historia...), como pidio Aaron, pero solo
  los que tienen cara y modelo de verdad: cara `c...` que existe en los
  dibujos, nombre y posicion (los NPC, objetos, animales de relleno y el Avatar
  no). Los Diamantes nativos no salen: el Diamante lo elige cada uno al final.
- `guardar(resultado)` / `guardados()`: el resultado de cada draft se guarda
  en `partidas/draft/` para seguir luego con el equipo.

La parte en linea (quien esta conectado, invitaciones, turnos) va en la
pagina (`web/draft.html` y `web/draft-red.js`), que habla con un servidor de
mensajes publico (MQTT por WebSocket): no hace falta cuenta ni abrir puertos.
"""
import datetime
import json
import os
import re

from ievr import basedatos as BD, opciones as O, reglas

RAIZ = os.environ.get("IEVR_RAIZ") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# grupos del draft: los cuatro de jugador y los dos de personal
GRUPOS = ("DEL", "MED", "DEF", "POR", "GER", "ENT")


def _carpeta():
    d = os.path.join(RAIZ, "partidas", "draft")
    os.makedirs(d, exist_ok=True)
    return d


def _caras_que_existen():
    carpeta = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon", "10_icon_chr", "face")
    try:
        return {f[:-6] for f in os.listdir(carpeta) if f.endswith("_l.png")}
    except OSError:
        return set()


def candidatos():
    """[{...}] de todos los que pueden salir, una vez por identidad."""
    def construir():
        caras = _caras_que_existen()
        fichables = {f["identidad"].upper() for f in reglas._tabla("fichables.csv")}
        # solo los que Pizarra sabe meter en la partida (O-248)
        creables = {f["identidad"].upper() for f in reglas._tabla("jugadores.csv")}
        fuera = []
        for p in BD.personajes():
            cara = p.get("cara") or ""
            if not re.match(r"^c\d", cara) or (caras and cara not in caras):
                continue
            rv = int(p.get("rareza_valor") or 0)
            if rv == 8:
                continue            # Diamantes nativos: el Diamante se elige al final
            if p.get("posicion") not in ("DEL", "MED", "DEF", "POR"):
                continue
            ident = p["identidad"]
            if ident.upper() not in creables:
                continue
            if p["nombre"] == EQ.NOMBRE_SOLO_STAFF:
                continue            # el protagonista no puede jugar, solo de personal
            # stats a nivel 99: un normal en Leyenda (asi salen todos en el
            # draft) con su arbol; un Idolo con los suyos
            rareza_draft = rv if rv >= 5 else 4
            stats = O._stats99_con_arbol(ident, rareza_draft)
            fuera.append({
                "identidad": ident, "nombre": p["nombre"], "apodo": p.get("apodo") or "",
                "cara": cara, "cuerpo": p.get("cuerpo") or "", "hombro": p.get("hombro"),
                "posicion": p["posicion"], "elemento": p.get("elemento") or "",
                "rareza_valor": rareza_draft, "idolo": rv >= 5,
                "apt": p.get("apt") or "jugador", "saga": p.get("saga") or "",
                "genero": p.get("genero") or "",
                "stats": stats, "poder": O._poder99_con_arbol(ident, rareza_draft),
                "legal": ident in fichables,
            })
        # el cuerpo tecnico de fabrica que no tiene posicion de jugador (no
        # sale en la lista de la base de datos): para las rondas de gerentes y
        # entrenadores solo hace falta la cara
        ya = {x["identidad"] for x in fuera}
        caras_de = O._cara_por_identidad()
        for ident, f in reglas.personajes().items():
            ident = ident.upper()
            if ident in ya or ident not in creables or not (f.get("apt_gerente") or f.get("apt_entrenador")):
                continue
            cara = caras_de.get(ident, "")
            nombre = O._limpio(f.get("nombre_es") or f.get("nombre_en") or "")
            if not nombre or not re.match(r"^c\d", cara) or (caras and cara not in caras):
                continue
            fuera.append({"identidad": ident, "nombre": nombre, "apodo": f.get("apodo") or "",
                          "cara": cara, **O.datos_cuerpo(ident), "posicion": "", "elemento": "",
                          "rareza_valor": 4, "idolo": False,
                          "apt": "entrenador" if f.get("apt_entrenador") else "gerente",
                          "saga": f.get("saga") or "", "genero": f.get("genero") or "",
                          "stats": [0] * 7, "poder": 0, "legal": ident in fichables})
        return fuera
    return O._indice("draft_candidatos", construir)


def guardar(resultado):
    """Guarda el resultado de un draft. Devuelve el nombre del fichero."""
    if not isinstance(resultado, dict) or not resultado.get("jugadores"):
        raise ValueError("el resultado del draft no trae jugadores")
    rival = re.sub(r"[^A-Za-z0-9_-]+", "_", str(resultado.get("rival") or "rival"))[:30]
    nombre = "%s-contra-%s.json" % (datetime.datetime.now().strftime("%Y-%m-%d_%H-%M"), rival)
    resultado = dict(resultado, guardado=datetime.datetime.now().isoformat(timespec="seconds"))
    with open(os.path.join(_carpeta(), nombre), "w", encoding="utf-8") as fh:
        json.dump(resultado, fh, ensure_ascii=False, indent=1)
    return nombre


def guardados():
    """[{fichero, rival, fecha, arquetipo, cuantos}] de los drafts guardados, el mas nuevo primero."""
    fuera = []
    for f in sorted(os.listdir(_carpeta()), reverse=True):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(_carpeta(), f), encoding="utf-8") as fh:
                d = json.load(fh)
        except (OSError, ValueError):
            continue
        fuera.append({"fichero": f, "rival": d.get("rival") or "", "yo": d.get("yo") or "",
                      "fecha": d.get("guardado") or "", "arquetipo": d.get("arquetipo"),
                      "arquetipo_nombre": d.get("arquetipo_nombre") or "",
                      "cuantos": len(d.get("jugadores") or []),
                      # segunda parte (O-248): si ya se monto y a que equipo se importo
                      "montado": bool(d.get("montaje")),
                      "importado": ((d.get("importado") or [{}])[-1].get("antes") or "")
                                   if d.get("importado") else ""})
    return fuera


def leer(fichero):
    f = os.path.basename(fichero or "")
    with open(os.path.join(_carpeta(), f), encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Segunda parte: montar el equipo e importarlo (NOTAS O-248)
#
# El equipo se monta en una COPIA de la partida (el "montaje"), con el editor
# de siempre pero con las reglas del draft; la partida de verdad no se toca
# hasta "Importar equipo". Al importar se vuelven a crear los mismos jugadores
# en la partida de verdad y se les copia lo que tienen en el montaje (pasivas,
# tecnicas, equipacion, judias...), pasando por las mismas funciones del
# editor, que validan; y el equipo elegido se sustituye por el del draft.
# ---------------------------------------------------------------------------
import zlib

from ievr import equipos as EQ, escribir as E, inventario, jugador as J, presets as PR

NOMBRE_EQUIPO = "Draft"
GRUPOS_DE_JUGADOR = ("DEL", "MED", "DEF", "POR")
# todo esto sale "libre" en el montaje: se consigue entero en la copia
CATEGORIAS_LIBRES = tuple(E.CATEGORIA_RANURA.values()) + (
    "supertecnica", "aura", "escudo", "equipacion-equipo", "tactica-objeto")

# lo que se puede hacer en el montaje (lo demas, nivel, rareza, arquetipo,
# heredadas, fichar, mochila..., lo fija el draft)
CAMBIOS_DE_JUGADOR = {"equipacion", "tecnica", "pasiva", "personalizada", "pasiva_personal",
                      "judia", "judias", "preset_judias", "preset_equipacion",
                      "preset_pasivas", "cambiar_rama"}
CAMBIOS_DE_EQUIPO = {"equipo_nombre", "equipo_dorsal", "equipo_capitan", "equipo_jugador",
                     "equipo_intercambiar", "equipo_meter", "equipo_sacar", "equipo_puesto",
                     "equipo_simple", "equipo_tactica", "equipo_sinergia"}
ARREGLOS = {"arreglar_tecnicas", "arreglar_arboles", "arreglar_dorsales", "arreglar_piezas",
            "arreglar_cabeceras", "arreglar_tablas", "arreglar_diamantes",
            "arreglar_pasivas_personal"}


def tras_cambio(plain, info):
    """Lo mismo que hace el editor despues de cada cambio (Sesion.aplicar):
    el arbol como lo deja el juego, la tabla de pasivas con numero y las de
    personal con el valor de su rareza (O-166, O-177, O-197)."""
    if isinstance(info, dict) and isinstance(info.get("fila"), int):
        plain = E.abrir_arbol(plain, info["fila"])
        plain = E.sincronizar_tabla_pasivas(plain, info["fila"])
        plain = E.actualizar_pasivas_personal(plain, info["fila"])
    return plain


def _aplica(plain, funcion, *args):
    plain, info = funcion(plain, *args)
    return tras_cambio(plain, info), info


def _fichero_montaje(fichero):
    return os.path.join(_carpeta(), os.path.splitext(os.path.basename(fichero))[0] + ".montaje")


def _escribe_resultado(fichero, d):
    with open(os.path.join(_carpeta(), os.path.basename(fichero)), "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)


def crear_jugadores(plain, resultado, avisos, al_dia=True):
    """Mete en `plain` a los 20 del draft como dijo Aaron: nivel 99 y Leyenda
    (el boton MAX), todos del arquetipo que toco menos los Idolos; los de
    personal de base que salieron en una ronda de jugadores, pasados a jugador;
    y el Diamante elegido, con el arquetipo que toco. Devuelve (plain, filas)
    con las filas en el orden de `resultado["jugadores"]`."""
    arq = int(resultado.get("arquetipo") or 0)
    arq_nombre = J.ARQUETIPOS[arq]
    filas = []
    # (el arbol y la tabla de pasivas se ponen al dia una vez por jugador, al
    # final: es lo que mas tarda, un segundo cada vez)
    for j in resultado["jugadores"]:
        ident = j["identidad"].upper()
        if j.get("idolo"):
            plain, info = E.anadir_jugador(plain, ident)
        else:
            plain, info = E.anadir_jugador(plain, ident, None, arq_nombre)
        fila = info["fila"]
        plain, _ = PR.maximo(plain, fila)
        if j.get("grupo") in GRUPOS_DE_JUGADOR:
            # un gerente o entrenador de base que salio de jugador, a jugar
            try:
                plain, _ = E.poner_medalla(plain, fila, "jugador")
            except E.Ilegal as e:
                if "ya es" not in str(e):
                    avisos.append("%s: %s" % (j.get("nombre"), e))
        if j.get("diamante"):
            plain, _ = E.poner_diamante(plain, fila)
            plain, _ = E.poner_arquetipo_diamante(plain, fila, arq)
        if al_dia:          # al importar se hace despues, al copiarle lo suyo
            plain = tras_cambio(plain, {"fila": fila})
        filas.append(fila)
    return plain, filas


def _coloca_en_el_equipo(plain, i, filas, resultado, avisos):
    """Los 20 del draft caben justos en un equipo (11 + 5 en el banquillo, 3
    gerentes y el entrenador): se ponen ya colocados, cada uno en un puesto de
    su posicion en la formacion si se puede."""
    from ievr import servidor as SV
    e = EQ.leer(plain, i)
    sitios = SV._puestos_de_formacion("%08X" % e["formacion"])
    libres = {p["puesto"]: p["posicion"] for p in sitios}
    corto = {"DC": "DEL", "MC": "MED", "DF": "DEF", "PT": "POR"}
    campo, banquillo, gerentes = [], [], []
    for j, fila in zip(resultado["jugadores"], filas):
        g = j.get("grupo")
        if g == "ENT":
            plain = _mete(plain, i, 19, fila, j, avisos)
        elif g == "GER":
            gerentes.append((j, fila))
        else:
            campo.append((j, fila))
    for k, (j, fila) in enumerate(gerentes):
        plain = _mete(plain, i, 16 + k, fila, j, avisos)
    # a cada jugador, un puesto libre de su posicion; los que sobran al banquillo
    for j, fila in campo:
        p = next((p for p, pos in sorted(libres.items()) if corto.get(pos, pos) == j.get("grupo")), None)
        if p is None:
            banquillo.append((j, fila))
            continue
        del libres[p]
        plain = _mete(plain, i, p, fila, j, avisos)
    resto = sorted(libres) + list(range(11, 16))
    for (j, fila), p in zip(banquillo, resto):
        plain = _mete(plain, i, p, fila, j, avisos)
    return plain


def _mete(plain, i, puesto, fila, j, avisos):
    try:
        plain, _ = _aplica(plain, EQ.meter_jugador, i, puesto, fila)
    except (E.Ilegal, EQ.Ilegal) as e:
        avisos.append("%s no se pudo poner en el equipo: %s" % (j.get("nombre"), e))
    return plain


def _hueco_para_el_montaje(plain):
    """Un hueco de equipo para el montaje. En la copia da igual cual: si no
    queda uno libre se vacia el ultimo de los tuyos (solo en la copia)."""
    try:
        plain, info = EQ.crear_equipo(plain, NOMBRE_EQUIPO)
        return plain, info["equipo"]
    except EQ.Ilegal:
        pass
    tuyos = [t["hueco"] for t in EQ.todos(plain) if t["hueco"] in EQ.huecos_de_equipo(plain)]
    i = tuyos[-1]
    e = EQ.leer(plain, i)
    for k, m in enumerate(e["miembros"]):
        if m["jugador"]:
            plain, _ = EQ.sacar_jugador(plain, i, k)
    plain, _ = EQ.poner_nombre(plain, i, NOMBRE_EQUIPO)
    return plain, i


def _conceder_todo(plain, avisos):
    """En el montaje todo es libre (Aaron): equipacion, tecnicas, escudos,
    equipaciones de equipo, tacticas, sinergias y pasivas personalizadas y de
    personal. Se consiguen en la copia, que no es tu partida."""
    for cat in CATEGORIAS_LIBRES:
        try:
            plain, _ = E.conseguir_todo(plain, cat, 99)
        except E.Ilegal as e:
            avisos.append("%s: %s" % (cat, e))
    for funcion, args in ((E.dar_sinergias, ()), (E.dar_personalizadas, (99,)),
                          (E.dar_pasivas_personal, (99,))):
        try:
            plain, _ = funcion(plain, *args)
        except E.Ilegal as e:
            if "ya tienes" not in str(e):
                avisos.append(str(e))
    try:
        if _tiene(plain, E.POSIBILIDADES):
            plain, _ = E.poner_cantidad(plain, E.POSIBILIDADES, 999)
        else:
            plain, _ = E.anadir_objeto(plain, E.POSIBILIDADES, 999)
    except E.Ilegal as e:
        avisos.append(str(e))
    return plain


def crear_montaje(plain_real, nombre_partida, fichero):
    """Prepara la copia para montar el equipo de ese draft. Devuelve
    (plain, info) y la deja guardada."""
    d = leer(fichero)
    avisos = []
    plain = _conceder_todo(bytes(plain_real), avisos)
    plain, equipo = _hueco_para_el_montaje(plain)
    plain, filas = crear_jugadores(plain, d, avisos)
    plain = _coloca_en_el_equipo(plain, equipo, filas, d, avisos)
    # un hueco de equipo recien preparado puede traer sinergias viejas
    for r in (1, 2):
        try:
            plain, _ = EQ.poner_sinergia(plain, equipo, r, "")
        except EQ.Ilegal:
            pass
    info = {"equipo": equipo, "filas": filas, "partida": nombre_partida,
            "avisos": avisos, "creado": datetime.datetime.now().isoformat(timespec="seconds")}
    d["montaje"] = info
    _escribe_resultado(fichero, d)
    guardar_montaje(fichero, plain)
    return plain, info


def guardar_montaje(fichero, plain):
    tmp = _fichero_montaje(fichero) + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(zlib.compress(plain, 1))
    os.replace(tmp, _fichero_montaje(fichero))


def leer_montaje(fichero):
    """(plain, info) del montaje guardado, o (None, None) si aun no hay."""
    d = leer(fichero)
    ruta = _fichero_montaje(fichero)
    if not d.get("montaje") or not os.path.isfile(ruta):
        return None, None
    with open(ruta, "rb") as fh:
        return zlib.decompress(fh.read()), d["montaje"]


def comprueba_cambio(plain, info, c):
    """Las reglas del draft sobre un cambio del editor. Lanza Ilegal si no vale."""
    t = c.get("tipo")
    if t in ARREGLOS:
        return
    if t not in CAMBIOS_DE_JUGADOR and t not in CAMBIOS_DE_EQUIPO:
        raise E.Ilegal("en el draft eso no se puede cambiar: nivel, rareza y arquetipo los "
                       "fija el draft, no hay heredadas y no se fichan jugadores")
    filas = set(info["filas"])
    if t in CAMBIOS_DE_EQUIPO:
        if int(c.get("equipo", -1)) != info["equipo"]:
            raise E.Ilegal("en el draft solo se monta el equipo del draft")
        if t == "equipo_meter" and int(c.get("fila", -1)) not in filas:
            raise E.Ilegal("en el equipo del draft solo pueden ir tus jugadores del draft")
        if t == "equipo_jugador":
            slots = J.array(plain, EQ.ARRAY_SLOT)
            if int(c.get("slot", 0)) not in {slots[f] for f in filas}:
                raise E.Ilegal("en el equipo del draft solo pueden ir tus jugadores del draft")
        return
    fila = int(c.get("fila", -1))
    if fila not in filas:
        raise E.Ilegal("ese jugador no es de tu draft")
    if t == "tecnica":
        motivo = tecnica_bloqueada(plain, fila, int(c.get("ranura", 0)))
        if motivo:
            raise E.Ilegal(motivo)
    if t == "preset_pasivas":
        arq = int(c.get("arquetipo", -1))
        mio = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila]
        if arq not in (-1, mio):
            raise E.Ilegal("en el draft el arquetipo es el que toco: solo valen los presets "
                           "de %s" % J.ARQUETIPOS.get(mio, "?"))


def tecnica_bloqueada(plain, fila, ranura):
    """Por que no se puede tocar esa ranura de tecnica en el draft, o ''."""
    if J.array(plain, J.ARRAY_RAREZA)[fila] >= 5:
        return "en el draft las tecnicas de un Idolo o un Diamante vienen fijas"
    if ranura <= 3:
        return "en el draft las tres primeras tecnicas son las suyas de base y no se cambian"
    return ""


# --- importar a la partida de verdad ---------------------------------------

def _id_de_ref(porslot, valor):
    f = porslot.get(valor) if valor else None
    return ((f or {}).get("id") or "").upper()


def estado_de_jugador(plain, fila):
    """Lo que se copia de un jugador del montaje, con los codigos de verdad
    (no los huecos de mochila, que cambian de una partida a otra)."""
    porslot = inventario.por_slot(plain)
    eqs = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    eq, _ = J._campos_de(plain, eqs[fila], {h for h, _ in J.RANURAS_EQUIPO})
    equipacion = [_id_de_ref(porslot, int.from_bytes(eq.get(h, b""), "little"))
                  for h, _ in J.RANURAS_EQUIPO[:4]]
    tecs = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    tc, _ = J._campos_de(plain, tecs[fila], set(J.RANURAS_TECNICAS))
    tecnicas = [_id_de_ref(porslot, int.from_bytes(tc.get(h, b""), "little"))
                for h in J.RANURAS_TECNICAS]
    crudo = {}
    for fh in (J.F_PASIVAS, J.F_RAMA, J.F_JUDIA_TIPO, J.F_JUDIA_CANT):
        off, n = E._campo(plain, fila, fh)
        crudo[fh] = bytes(plain[off:off + n])
    personalizada, _slot = E.pasiva_personalizada(plain, fila)
    personal = []
    if E.rol_de_personal(plain, fila) in ("gerente", "entrenador"):
        personal = [[r, i] for r, i, _v in E.pasivas_personal_puestas(plain, fila)]
    return {"equipacion": equipacion, "tecnicas": tecnicas, "crudo": crudo,
            "personalizada": personalizada or "", "personal": personal}


def _tiene(plain, id_hex, con_cantidad=False):
    for f in inventario.filas_poseidas(plain).get((id_hex or "").upper(), []):
        if f.get("slot") and (not con_cantidad or f.get("cantidad", 0) > 0):
            return True
    return False


def _conseguir(plain, id_hex, anadidos, cantidad=1):
    """Que la partida tenga ese objeto (para poder ponerlo): si no, se crea."""
    if not id_hex or _tiene(plain, id_hex):
        return plain
    plain, _ = E.anadir_objeto(plain, id_hex, cantidad)
    anadidos.add(id_hex.upper())
    return plain


def _copia_jugador(montaje, fd, plain, fr, anadidos, avisos, nombre):
    obj = estado_de_jugador(montaje, fd)
    ahora = estado_de_jugador(plain, fr)
    buf = bytearray(plain)
    rareza = J.array(plain, J.ARRAY_RAREZA)[fr]
    for fh, datos in obj["crudo"].items():
        if fh == J.F_PASIVAS and rareza >= 5:
            continue
        off, n = E._campo(plain, fr, fh)
        buf[off:off + n] = datos[:n]
    plain = bytes(buf)
    # (como en crear_jugadores, el arbol y las tablas se ponen al dia al final)
    for k, idh in enumerate(obj["equipacion"], 1):
        if not idh or ahora["equipacion"][k - 1] == idh:
            continue
        try:
            plain = _conseguir(plain, idh, anadidos)
            plain, _ = E.poner_equipacion(plain, fr, k, idh)
        except E.Ilegal as e:
            avisos.append("%s, equipacion %d: %s" % (nombre, k, e))
    # tecnicas: en varias pasadas, porque la tercera copia de una tecnica
    # solo entra cuando ya estan las otras dos (O-199)
    ultimo = ""
    tecs = list(ahora["tecnicas"])
    for _pasada in range(3):
        pendientes = 0
        for k, idh in enumerate(obj["tecnicas"], 1):
            if not idh or tecs[k - 1] == idh:
                continue
            try:
                plain = _conseguir(plain, idh, anadidos, 1)
                if not _tiene(plain, E.POSIBILIDADES, con_cantidad=True):
                    if _tiene(plain, E.POSIBILIDADES):
                        plain, _ = E.poner_cantidad(plain, E.POSIBILIDADES, 20)
                    else:
                        plain, _ = E.anadir_objeto(plain, E.POSIBILIDADES, 20)
                    anadidos.add(E.POSIBILIDADES)
                plain, info = E.poner_tecnica(plain, fr, k, idh)
                tecs[k - 1] = idh
                if info.get("quitadas"):
                    tecs = estado_de_jugador(plain, fr)["tecnicas"]
            except E.Ilegal as e:
                pendientes += 1
                ultimo = "%s, tecnica %d: %s" % (nombre, k, e)
        if not pendientes:
            break
    else:
        avisos.append(ultimo)
    if obj["personalizada"] and obj["personalizada"] != ahora["personalizada"]:
        try:
            plain = _conseguir(plain, obj["personalizada"], anadidos)
            plain, _ = E.poner_personalizada(plain, fr, obj["personalizada"])
        except E.Ilegal as e:
            avisos.append("%s, pasiva personalizada: %s" % (nombre, e))
    plain = tras_cambio(plain, {"fila": fr})
    # las de personal, despues de poner al dia su tabla (van en ella, O-185)
    for ranura, idh in obj["personal"]:
        if not idh or idh == "00000000":
            continue
        puestas = dict((r, i) for r, i in estado_de_jugador(plain, fr)["personal"])
        if puestas.get(ranura) == idh:
            continue
        try:
            plain = _conseguir(plain, idh, anadidos)
            plain, _ = _aplica(plain, E.poner_pasiva_personal, fr, ranura, idh)
        except E.Ilegal as e:
            avisos.append("%s, pasiva de personal %d: %s" % (nombre, ranura, e))
    # comprobacion: tiene que quedar igual que en el montaje
    final = estado_de_jugador(plain, fr)
    for clave in ("equipacion", "tecnicas", "personalizada", "personal", "crudo"):
        if final[clave] != obj[clave]:
            avisos.append("%s: %s no ha quedado igual que en el draft" % (nombre, clave))
    return plain


def _pieza(plain, tipo, valor, anadidos):
    """Que la partida tenga el objeto de ese escudo, equipacion o tactica."""
    if not valor or EQ.hueco_de_pieza(plain, tipo, valor):
        return plain
    quiero = {"%08X" % valor, EQ._al_reves("%08X" % valor)}
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] == tipo and f["valor_equipo"].upper() in quiero:
            try:
                return _conseguir(plain, f["id_objeto"].upper(), anadidos)
            except E.Ilegal:
                return plain
    return plain


def _copia_equipo(montaje, d_eq, plain, t, mapa, anadidos, avisos):
    ed = EQ.leer(montaje, d_eq)
    slots_m = J.array(montaje, EQ.ARRAY_SLOT)
    fila_de_slot_m = {slots_m[f]: f for f in mapa}
    # fuera todos los que habia
    er = EQ.leer(plain, t)
    for k, m in enumerate(er["miembros"]):
        if m["jugador"]:
            plain, _ = EQ.sacar_jugador(plain, t, k)
    # dentro los del draft, cada uno en su puesto
    colocados = []          # (hueco en la partida, miembro del montaje)
    for m in ed["miembros"]:
        if not m["jugador"] or m["jugador"] not in fila_de_slot_m:
            continue
        fr = mapa[fila_de_slot_m[m["jugador"]]]
        try:
            plain, _ = _aplica(plain, EQ.meter_jugador, t, m["puesto"], fr)
        except (E.Ilegal, EQ.Ilegal) as e:
            avisos.append("puesto %d: %s" % (m["puesto"], e))
            continue
        slot = EQ.slot_de_fila(plain, fr)
        hueco = next(k for k, x in enumerate(EQ.leer(plain, t)["miembros"]) if x["jugador"] == slot)
        colocados.append((hueco, m))
    # dorsales: primero todos a uno alto y luego los suyos (que no choquen)
    for n, (hueco, m) in enumerate(colocados):
        try:
            plain, _ = EQ.poner_dorsal(plain, t, hueco, 99 - n)
        except EQ.Ilegal:
            pass
    for hueco, m in colocados:
        if m["dorsal"]:
            try:
                plain, _ = EQ.poner_dorsal(plain, t, hueco, m["dorsal"])
            except EQ.Ilegal as e:
                avisos.append("dorsal %d: %s" % (m["dorsal"], e))
    for hueco, m in colocados:
        if m["jugador"] == ed["capitan"] and m["puesto"] < EQ.EN_EL_CAMPO:
            try:
                plain, _ = EQ.poner_capitan(plain, t, hueco)
            except EQ.Ilegal as e:
                avisos.append("capitan: %s" % e)
    # formacion, escudo, equipacion
    for cual in ("formacion", "escudo", "equipacion"):
        if ed[cual] and EQ.leer(plain, t)[cual] != ed[cual]:
            if cual in ("equipacion", "escudo"):
                plain = _pieza(plain, cual, ed[cual], anadidos)
            try:
                plain, _ = EQ.poner_simple(plain, t, cual, ed[cual])
            except EQ.Ilegal as e:
                avisos.append("%s: %s" % (cual, e))
    # tacticas: se vacian y se ponen las del draft
    for r in (1, 2, 3):
        plain, _ = EQ.poner_tactica(plain, t, r, "")
    for r, v in enumerate(ed["tacticas"][:3], 1):
        if v:
            plain = _pieza(plain, "tactica", v, anadidos)
            try:
                plain, _ = EQ.poner_tactica(plain, t, r, "%08X" % v)
            except EQ.Ilegal as e:
                avisos.append("tactica %d: %s" % (r, e))
    # sinergias
    from ievr import opciones as O
    for r, s in enumerate(ed["sinergias"][:2], 1):
        try:
            sn = O.sinergia_por_objeto().get(s["id"].to_bytes(4, "little").hex().upper()) if s["id"] else None
            if sn and any(not esta for _n, esta in EQ.sinergia_en_equipo(montaje, ed, sn)):
                sn = None           # en el draft no se cumplia: no se pasa
            if sn:
                # el id va con los mismos 4 bytes que en la mochila
                idh = s["id"].to_bytes(4, "little").hex().upper()
                if not _tiene(plain, idh):
                    plain, _ = E.anadir_sinergia(plain, idh)
                    anadidos.add(idh)
                plain, _ = EQ.poner_sinergia(plain, t, r, idh)
            else:
                ahora = EQ.leer(plain, t)["sinergias"]
                if len(ahora) >= r and ahora[r - 1]["id"]:
                    plain, _ = EQ.poner_sinergia(plain, t, r, "")
        except (E.Ilegal, EQ.Ilegal) as e:
            avisos.append("sinergia %d: %s" % (r, e))
    try:
        plain, _ = EQ.poner_nombre(plain, t, ed["nombre"].strip() or NOMBRE_EQUIPO)
    except EQ.Ilegal as e:
        avisos.append("nombre: %s" % e)
    return plain


def importar(plain_real, fichero, equipo):
    """El equipo del draft a la partida de verdad, en el hueco de equipo
    `equipo`. Devuelve (plain, resumen)."""
    from ievr import tlv
    d = leer(fichero)
    montaje, info = leer_montaje(fichero)
    if montaje is None:
        raise E.Ilegal("ese draft aun no tiene equipo montado")
    antes = EQ.leer(plain_real, equipo)
    if antes["de_la_historia"]:
        raise E.Ilegal("ese equipo es de la historia del juego y no se toca")
    avisos, anadidos = [], set()
    plain, filas = crear_jugadores(bytes(plain_real), d, avisos, al_dia=False)
    mapa = dict(zip(info["filas"], filas))
    for j, fd, fr in zip(d["jugadores"], info["filas"], filas):
        plain = _copia_jugador(montaje, fd, plain, fr, anadidos, avisos, j.get("nombre") or "?")
    plain = _copia_equipo(montaje, info["equipo"], plain, equipo, mapa, anadidos, avisos)
    d.setdefault("importado", []).append({"equipo": equipo, "antes": antes["nombre"].strip(),
                                           "cuando": datetime.datetime.now().isoformat(timespec="seconds")})
    _escribe_resultado(fichero, d)
    nombres = tlv.nombres()
    return plain, {"que": "draft importado", "equipo": equipo,
                   "antes": antes["nombre"].strip(),
                   "despues": EQ.leer(plain, equipo)["nombre"].strip(),
                   "jugadores": len(filas), "filas": filas, "avisos": avisos,
                   "anadidos": sorted(E._limpio_nombre(nombres.get(x, (x,))[0]) for x in anadidos)}
