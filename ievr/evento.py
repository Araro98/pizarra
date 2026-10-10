"""El guion de un evento de VR (una supertecnica, una invocacion...) leido a algo usable (O-323).

Cada supertecnica de VR es una "pelicula" (un evento): un guion con sus cortes de camara
y, por corte, la animacion de cada actor. Esta en dos .cfg.bin (T2B, ievr/cfgbin.py):
`common/event_cfg/evt/<ev>.cfg.bin` (camara, actores, cortes) y `eff/<ev>_eff.cfg.bin`
(efectos). Cada orden es EVENT_COMMAND_HEADER [fotograma, crc32 de la orden, ...] seguida
de EVENT_COMMAND_ARGS [argumentos]. El nombre de la orden no esta en el fichero: se le
pone por lo que hace (ORDENES, comprobado con los guiones de ev60-85).

Actores (plantillas que rellena el juego):
  c00<TYPE><NO>_sNN_p<VARIATION>  un jugador: TYPE = tipo de cuerpo 01..04 (c000101..
                                  c000401), NO = 01, VARIATION = 00. s00 hace la tecnica;
                                  s01.. el rival (regates, defensas) o los companeros
  <ASSIGN>_sNN_p<VARIATION>       lo que pone el juego: el keshin o el alma del jugador
  b000001_sNN_p..                 el balon
  evNN_NNNNN_sNN_p.., kNNNNNN_.., iNNNNNN_.., cNNNNNNNN_..  modelos fijos (_waza, keshin,
                                  objetos, un personaje concreto)
  point_sNN, point_eff            puntos de colocacion (esqueletos con evp01..evp10)
  evNNNNNNNN (guion eff)          un efecto (.objbin -> .g4pkm)
Las animaciones de cada actor por corte: ANIM_DE_CORTE da la ruta con <CHARA> (el actor
ya rellenado) y <CUT> (el corte). Cada actor va pegado a un hueso de un punto
(PEGAR_A_PUNTO), que en los jugadores depende del tipo de cuerpo (VARIANTE delante).

Codigo propio (O-323).
"""
import re

from ievr import cfgbin

# crc32 de la orden (con signo, como sale del guion) -> el nombre que le damos por lo que hace
ORDENES = {
    -50052350: "CORTE",            # [corte, ini, fin, NONE] (fotogramas a 60 por segundo)
    -1585127052: "CAMARA",         # [ruta .g4cm] (un clip por corte)
    2040143546: "CARGAR_OBJ",      # [actor, ruta del .g4sk/.objbin o codigo de modelo, ...]
    896822880: "CARGAR_PERSONAJE",  # [actor con plantilla, 'INVARID', ...]
    -715982243: "ANIM_DE_CORTE",   # [actor, ruta .g4pk con <CHARA> y <CUT>, ruta de escena, corte]
    -1447171689: "REPRODUCIR",     # [actor, corte/clip, 272, 0, 0, ruta|NONE, 0]
    -1344044979: "VISIBLE",        # [actor, 0/1]
    -1563297470: "PEGAR_A_PUNTO",  # [actor, punto, evpNN, x, y, z, 1] (x, y, z siempre 0)
    -29805182: "VARIANTE",         # [actor, TYPE, 01..04]: la siguiente orden vale solo para ese tipo
    -1950176284: "CAMARA_CERCA",   # [CCameraCtrlEvent, plano cercano]
    -1648841908: "CAMARA_LEJOS",   # [CCameraCtrlEvent, plano lejano]
    -767897457: "ROTULO",          # [soccer10_01_whsNNNNN, ...] el rotulo con el nombre
    -1463526750: "LUCES",
    -1764963769: "EFECTO_CREAR",   # [ega0001] efecto comun
    666125966: "EFECTO_PEGAR",
    921024264: "EFECTO_PARAM",
    -976647469: "ACTIVO",
    -1006936891: "AURA",           # c3fb5cc5 [actor, ball_aura_*/body_aura_*, 0/1, 1]: aura del balon o del cuerpo
}

TIPOS_CUERPO = ("01", "02", "03", "04")


def cuerpo(tipo):
    """'01' -> 'c000101' (el esqueleto y el banco de animaciones de ese tipo de cuerpo)."""
    return "c000%d01" % int(tipo) if len(tipo) == 2 else tipo


def clave(actor):
    """El nombre corto de un actor (sin la variacion), el que llevan sus nodos en los .glb:
    'c00<TYPE><NO>_s00_p<VARIATION>' -> 's00', '<ASSIGN>_s00_p<VARIATION>' -> 'asignado_s00',
    'b000001_s90_p<VARIATION>' -> 'b000001_s90', los efectos y los puntos tal cual."""
    a = re.sub(r"_p(<VARIATION>|\d\d)$", "", actor)
    m = re.fullmatch(r"c00<TYPE><NO>_(s\d\d)", a)
    if m:
        return m.group(1)
    return a.replace("<ASSIGN>", "asignado")


def tipo_de_actor(actor, ruta=None):
    """personaje, asignado, balon, modelo, efecto, punto (o '' si no se sabe)."""
    if actor.startswith("c00<TYPE>"):
        return "personaje"
    if actor.startswith("<ASSIGN>"):
        return "asignado"
    if actor.startswith("point_"):
        return "punto"
    if re.match(r"b\d{6}_s\d\d", actor):
        return "balon"
    if ruta and str(ruta).endswith(".objbin") and "/effect/" in str(ruta):
        return "efecto"
    if re.match(r"([a-z]{1,2}\d{6}|c\d{8}|ev\d\d_\d{5})_s\d\d", actor):
        return "modelo"
    return ""


def modelo_de_actor(actor, ruta):
    """El codigo del modelo de un actor fijo: 'ev60_00060_s00_p<VARIATION>' -> 'ev60_00060',
    'i000001_s00_..' con ruta 'common/chr/i000001/i000001.objbin' -> 'i000001'."""
    m = re.match(r"([a-z]{1,2}\d{6}|c\d{8}|ev\d\d_\d{5})_s\d\d", actor)
    if m:
        return m.group(1)
    if ruta and str(ruta).endswith(".objbin"):
        return str(ruta).rsplit("/", 1)[-1][:-len(".objbin")]
    return ""


def rellenar(plantilla, tipo="01", asignado=None):
    """La plantilla del juego con lo de este caso: <TYPE> el tipo de cuerpo, <NO> 01,
    <VARIATION> 00 y <ASSIGN> el keshin/alma."""
    s = plantilla.replace("<TYPE>", tipo).replace("<NO>", "01").replace("<VARIATION>", "00")
    if asignado:
        s = s.replace("<ASSIGN>", asignado)
    return s


def leer(nombre, leer_fichero):
    """El guion del evento `nombre` (ev60_00030) leido con `leer_fichero(ruta)` (ruta dentro de
    data/; devuelve bytes o None si no esta). None si el evento no tiene guion."""
    out = {"nombre": nombre, "cortes": [], "camara": None, "rotulo": None, "actores": {},
           "anim": {}, "reproducir": [], "visible": [], "pegados": [], "auras": [],
           "efectos_comunes": [], "ordenes": []}
    hay = False
    for sub, ruta in (("evt", "common/event_cfg/evt/%s.cfg.bin" % nombre),
                      ("eff", "common/event_cfg/eff/%s_eff.cfg.bin" % nombre)):
        b = leer_fichero(ruta)
        if not b:
            continue
        hay = True
        cab = None
        variante = {}
        for nom, v in cfgbin.leer(b):
            if nom == "EVENT_COMMAND_HEADER":
                cab = v
                continue
            if nom != "EVENT_COMMAND_ARGS" or cab is None:
                continue
            fr, o = cab[0], ORDENES.get(cab[1], "%08x" % (cab[1] & 0xFFFFFFFF))
            cab = None
            out["ordenes"].append((fr, o, v, sub))
            if o == "CORTE" and sub == "evt" and len(v) >= 3:
                out["cortes"].append((v[0], int(v[1]), int(v[2])))
            elif o == "CAMARA" and v and not out["camara"]:
                out["camara"] = v[0].replace("\\", "/")
            elif o == "ROTULO" and v and not out["rotulo"]:
                out["rotulo"] = v[0]
            elif o in ("CARGAR_OBJ", "CARGAR_PERSONAJE") and v and isinstance(v[0], str):
                ruta_obj = v[1] if len(v) > 1 and isinstance(v[1], str) else None
                out["actores"].setdefault(v[0], {"carga": ruta_obj, "sub": sub, "orden": o})
            elif o == "ANIM_DE_CORTE" and len(v) >= 4:
                out["anim"][(v[0], v[3])] = v[1].replace("\\", "/")
            elif o == "REPRODUCIR" and len(v) >= 2:
                out["reproducir"].append((fr, v[0], v[1], sub))
            elif o == "VISIBLE" and len(v) >= 2:
                out["visible"].append((fr, v[0], int(v[1]), sub))
            elif o == "VARIANTE" and len(v) >= 3:
                variante[v[0]] = str(v[2])
            elif o == "PEGAR_A_PUNTO" and len(v) >= 3:
                # con VARIANTE delante vale solo para ese tipo de cuerpo (y se gasta)
                out["pegados"].append((fr, v[0], v[1], v[2], variante.pop(v[0], None), sub))
            elif o == "AURA" and len(v) >= 2:
                out["auras"].append((fr, v[0], v[1]))
            elif o == "EFECTO_CREAR" and v:
                out["efectos_comunes"].append(v[0])
    if not hay or not out["cortes"]:
        return None
    out["cortes"].sort(key=lambda c: c[1])
    return out


def duracion(ev):
    """Fotogramas del evento entero (a 60 por segundo)."""
    return max((c[2] for c in ev["cortes"]), default=0)


def corte_en(ev, fotograma):
    """El corte que se ve en `fotograma` (el ultimo que empieza antes)."""
    actual = ev["cortes"][0]
    for c in ev["cortes"]:
        if c[1] <= fotograma:
            actual = c
    return actual


def pegados_de(ev, actor, tipo=None):
    """[(fotograma, punto, hueso)] de un actor por orden; en los jugadores solo los de su tipo
    de cuerpo ('01'..'04') y los que no llevan VARIANTE."""
    out = []
    for fr, a, punto, hueso, var, _sub in ev["pegados"]:
        if a != actor:
            continue
        if var is not None and tipo is not None and var != tipo:
            continue
        out.append((fr, punto, hueso))
    return out


def personajes(ev):
    """Las plantillas de los jugadores del evento por orden de hueco (s00, s01...)."""
    return sorted((a for a in ev["actores"] if tipo_de_actor(a) == "personaje"), key=clave)


def nombre_del_rotulo(rotulo, asignado=None, cara=None):
    """El nombre del rotulo de VR (dx11/menu/220_img/telop_waza/<idioma>/<nombre>.g4tx) de la
    orden ROTULO: 'soccer10_01_whs00030' -> 'whs00030'; '<CHARA_ID>' es el keshin o el alma
    (`asignado`) o, en el mixi y el modo, la cara del personaje."""
    if not rotulo or not rotulo.startswith("soccer10_01_"):
        return ""
    r = rotulo[len("soccer10_01_"):]
    if "<CHARA_ID>" in r:
        quien = asignado if r == "<CHARA_ID>" else cara
        if not quien:
            return ""
        r = r.replace("<CHARA_ID>", quien)
    return r
