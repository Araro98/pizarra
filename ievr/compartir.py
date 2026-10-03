"""Exportar un equipo a un fichero e importarlo en otra partida (Aaron, NOTAS O-280).

"Exportar el equipo de ese slot e importar en el slot en el que estes, con
todo: tecnicas, pasivas, equipacion, supertacticas, uniforme, escudo... y si
le falta algun objeto, pasiva personalizada etc. se lo ponga automaticamente
en la mochila".

El fichero (`.pizarra-equipo`, JSON) guarda el equipo con los codigos del
juego, no con los huecos de la partida (cambian de una a otra): cada miembro
con su puesto, dorsal, personaje, nivel, partidos, rareza, arquetipo, medalla
y su estado (lo de `draft.estado_de_jugador`, con las heredadas), y del
equipo nombre, formacion, escudo, equipacion, tacticas, sinergias y capitan.
Al importar se crean los jugadores nuevos en la partida del que lo recibe
(los suyos no se tocan) y se consigue lo que le falte, como al importar un
draft.
"""
import datetime
import json
import os
import re

from ievr import equipos as EQ, escribir as E, jugador as J, reglas

FORMATO = "pizarra-equipo"
VERSION_FORMATO = 1
EXTENSION = ".pizarra-equipo"


def _arquetipos_diamante(plain):
    try:
        return J.array(plain, (J.F_ARQUETIPO_DIAMANTE, 6000, "B", 1))
    except Exception:
        return None


def exportar(plain, i):
    """El equipo `i` como un dict que se puede guardar en JSON."""
    from ievr import draft as DR
    e = EQ.leer(plain, i)
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    arq = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    arqd = _arquetipos_diamante(plain)
    slots = J.array(plain, EQ.ARRAY_SLOT)
    fila_de = {s: f for f, s in enumerate(slots) if s}
    miembros = []
    for m in e["miembros"]:
        f = fila_de.get(m["jugador"]) if m["jugador"] else None
        if f is None:
            continue
        off, _n = E._campo(plain, f, E.F_PARTIDOS)
        estado = DR.estado_de_jugador(plain, f, heredadas=True)
        estado["crudo"] = {"%08X" % k: v.hex() for k, v in estado["crudo"].items()}
        miembros.append({
            "puesto": m["puesto"], "dorsal": m["dorsal"], "capitan": m["jugador"] == e["capitan"],
            "identidad": "%08X" % ident[f], "nombre": (reglas.personajes().get("%08X" % ident[f]) or {}).get("nombre_es") or "",
            "nivel": nivel[f], "rareza": rareza[f], "arquetipo": arq[f],
            "arquetipo_diamante": arqd[f] if arqd is not None else None,
            "partidos": int.from_bytes(plain[off:off + 2], "little"),
            "rol": E.rol_de_personal(plain, f) or "jugador", "estado": estado})
    return {"formato": FORMATO, "version_formato": VERSION_FORMATO,
            "exportado": datetime.datetime.now().isoformat(timespec="seconds"),
            "equipo": {"nombre": (e["nombre"] or "").strip(), "formacion": "%08X" % e["formacion"],
                       "escudo": "%08X" % e["escudo"], "equipacion": "%08X" % e["equipacion"],
                       "tacticas": ["%08X" % v for v in e["tacticas"][:3]],
                       "sinergias": [(s["id"].to_bytes(4, "little").hex().upper() if s["id"] else "")
                                     for s in e["sinergias"][:2]]},
            "miembros": miembros}


def nombre_de_fichero(nombre):
    limpio = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", nombre or "").strip() or "equipo"
    return limpio[:60] + EXTENSION


def guardar(plain, i, carpeta):
    """Escribe el fichero en `carpeta`. Devuelve su ruta."""
    if not carpeta or not os.path.isdir(carpeta):
        raise E.Ilegal("esa carpeta no existe")
    datos = exportar(plain, i)
    if not datos["miembros"]:
        raise E.Ilegal("ese equipo esta vacio: no hay nada que exportar")
    ruta = os.path.join(carpeta, nombre_de_fichero(datos["equipo"]["nombre"]))
    base, n = ruta[:-len(EXTENSION)], 2
    while os.path.exists(ruta):
        ruta = "%s (%d)%s" % (base, n, EXTENSION)
        n += 1
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1)
    return ruta


def _crear(plain, m, avisos):
    """Crea al miembro en la partida con su rareza, arquetipo, nivel y partidos."""
    ident = m["identidad"].upper()
    familia = (reglas.personajes().get(ident) or {}).get("rareza")
    rv = int(m.get("rareza") or 0)
    if familia == "normal" and rv == 8:
        # un normal hecho Diamante con semilla
        plain, info = E.anadir_jugador(plain, ident)
        plain, _ = E.poner_diamante(plain, info["fila"])
    elif familia == "normal":
        nombre_arq = J.ARQUETIPOS.get(int(m.get("arquetipo") or 0), "Brecha")
        plain, info = E.anadir_jugador(plain, ident, J.RAREZAS.get(rv, rv), nombre_arq)
    else:
        plain, info = E.anadir_jugador(plain, ident)
    fila = info["fila"]
    if J.array(plain, J.ARRAY_RAREZA)[fila] == 8 and m.get("arquetipo_diamante") not in (None, 6):
        try:
            plain, _ = E.poner_arquetipo_diamante(plain, fila, int(m["arquetipo_diamante"]))
        except E.Ilegal as ex:
            avisos.append("%s, arquetipo: %s" % (m.get("nombre") or ident, ex))
    if int(m.get("nivel") or 1) > 1:
        plain, _ = E.poner_nivel(plain, fila, int(m["nivel"]))
    if m.get("partidos"):
        try:
            plain, _ = E.poner_partidos(plain, fila, int(m["partidos"]))
        except E.Ilegal:
            pass
    try:
        plain, _ = E.poner_medalla(plain, fila, m.get("rol") or "jugador")
    except E.Ilegal as ex:
        if "ya es" not in str(ex):
            avisos.append("%s: %s" % (m.get("nombre") or ident, ex))
    return plain, fila


def importar(plain, i, datos):
    """Vacia el equipo `i` (los que habia siguen en la partida) y lo deja
    como el del fichero, creando a sus jugadores y consiguiendo lo que falte."""
    from ievr import draft as DR
    if not isinstance(datos, dict) or datos.get("formato") != FORMATO:
        raise E.Ilegal("ese fichero no es un equipo exportado con Pizarra")
    if int(datos.get("version_formato") or 0) > VERSION_FORMATO:
        raise E.Ilegal("ese equipo es de una Pizarra mas nueva: actualiza Pizarra")
    destino = EQ.leer(plain, i)
    if destino["de_la_historia"]:
        raise E.Ilegal("ese equipo es de la historia del juego y no se toca")
    eq, avisos, anadidos = datos["equipo"], [], set()
    for k, m in enumerate(destino["miembros"]):
        if m["jugador"]:
            plain, _ = EQ.sacar_jugador(plain, i, k)
    if eq.get("formacion") and eq["formacion"] != "00000000":
        try:
            plain, _ = EQ.poner_simple(plain, i, "formacion", int(eq["formacion"], 16))
        except EQ.Ilegal as ex:
            avisos.append("formacion: %s" % ex)
    colocados = []
    for m in datos["miembros"]:
        nombre = m.get("nombre") or m["identidad"]
        try:
            plain, fila = _crear(plain, m, avisos)
        except E.Ilegal as ex:
            avisos.append("%s no se ha podido crear: %s" % (nombre, ex))
            continue
        obj = dict(m["estado"])
        obj["crudo"] = {int(k, 16): bytes.fromhex(v) for k, v in m["estado"]["crudo"].items()}
        plain = DR.copia_estado(obj, plain, fila, anadidos, avisos, nombre, donde="el equipo exportado")
        try:
            plain, _ = DR._aplica(plain, EQ.meter_jugador, i, int(m["puesto"]), fila)
        except (E.Ilegal, EQ.Ilegal) as ex:
            avisos.append("%s en el puesto %s: %s" % (nombre, m["puesto"], ex))
            continue
        colocados.append((fila, m))
    # dorsales y capitan
    def hueco_de(fila):
        slot = EQ.slot_de_fila(plain, fila)
        return next((k for k, x in enumerate(EQ.leer(plain, i)["miembros"]) if x["jugador"] == slot), None)
    for n, (fila, m) in enumerate(colocados):
        h = hueco_de(fila)
        if h is not None:
            try:
                plain, _ = EQ.poner_dorsal(plain, i, h, 99 - n)
            except EQ.Ilegal:
                pass
    for fila, m in colocados:
        h = hueco_de(fila)
        if m.get("dorsal") and h is not None:
            try:
                plain, _ = EQ.poner_dorsal(plain, i, h, int(m["dorsal"]))
            except EQ.Ilegal as ex:
                avisos.append("dorsal %s: %s" % (m["dorsal"], ex))
        if m.get("capitan") and int(m["puesto"]) < EQ.EN_EL_CAMPO and h is not None:
            try:
                plain, _ = EQ.poner_capitan(plain, i, h)
            except EQ.Ilegal as ex:
                avisos.append("capitan: %s" % ex)
    # escudo, equipacion, tacticas y sinergias (lo que falte, a la mochila)
    for cual in ("escudo", "equipacion"):
        v = int(eq.get(cual) or "0", 16)
        if v:
            plain = DR._pieza(plain, cual, v, anadidos)
            try:
                plain, _ = EQ.poner_simple(plain, i, cual, v)
            except EQ.Ilegal as ex:
                avisos.append("%s: %s" % (cual, ex))
    for r in (1, 2, 3):
        plain, _ = EQ.poner_tactica(plain, i, r, "")
    for r, t in enumerate(eq.get("tacticas") or [], 1):
        v = int(t or "0", 16)
        if v and r <= 3:
            plain = DR._pieza(plain, "tactica", v, anadidos)
            try:
                plain, _ = EQ.poner_tactica(plain, i, r, "%08X" % v)
            except EQ.Ilegal as ex:
                avisos.append("tactica %d: %s" % (r, ex))
    for r, idh in enumerate(eq.get("sinergias") or [], 1):
        if r > 2:
            break
        try:
            if idh:
                if not DR._tiene(plain, idh):
                    plain, _ = E.anadir_sinergia(plain, idh)
                    anadidos.add(idh)
                plain, _ = EQ.poner_sinergia(plain, i, r, idh)
            else:
                plain, _ = EQ.poner_sinergia(plain, i, r, "")
        except (E.Ilegal, EQ.Ilegal) as ex:
            avisos.append("sinergia %d: %s" % (r, ex))
    if eq.get("nombre"):
        try:
            plain, _ = EQ.poner_nombre(plain, i, eq["nombre"])
        except EQ.Ilegal as ex:
            avisos.append("nombre: %s" % ex)
    return plain, {"que": "equipo importado", "equipo": i, "nombre": eq.get("nombre") or "",
                   "jugadores": len(colocados), "de": len(datos["miembros"]), "avisos": avisos,
                   "anadidos": len(anadidos)}
