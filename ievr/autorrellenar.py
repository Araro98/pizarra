"""Autorrellenar un equipo con uno del juego (Aaron, NOTAS O-279).

"Elegir uno de los equipos de la historia, por ejemplo autorrellenar con el
Tormenta de Geminis... y los del modo cronicas y los del nivel 99, con su
escudo, uniforme y tal; los jugadores al 99 automaticamente, como si le
dieras a MAX, sin judias, equipacion, y pasivas y tecnicas por defecto, y te
ponga los jugadores en su formacion y todo eso, con su nombre tambien."

Los equipos salen de `equipos-juego.csv` y sus plantillas de
`equipos-juego-miembros.csv` (los hace `herramientas/construir_equipos_juego.py`
desde `team_config` del juego). Cada jugador se crea nuevo, como lo da el
juego (sus tres supertecnicas, sin judias ni equipacion), y se le da MAX;
los que ya tienes no se tocan. Los que estaban en el equipo salen de el pero
siguen en tu partida.
"""
import re

from ievr import equipos as EQ, escribir as E, jugador as J, presets as PR, reglas

# los grupos que se ofrecen, en este orden, con su nombre para la pantalla
GRUPOS = [("historia", "Historia"), ("cronica", "Cronicas"), ("cronica-leyenda", "Leyendas de Cronicas"),
          ("cronica-jugador", "Tu equipo en Cronicas"), ("enjoy", "Partido libre"), ("practica", "Amistosos")]
GERENTES = (16, 17, 18)
ENTRENADOR = 19


def _limpio(texto):
    """Sin las marcas del juego (<MNT:...>)."""
    return re.sub(r"<[^>]*>", "", texto or "").strip()


def _miembros():
    d = {}
    for m in reglas._tabla("equipos-juego-miembros.csv"):
        d.setdefault(m["equipo"].upper(), []).append(m)
    return d


def _equipos():
    return {e["id"].upper(): e for e in reglas._tabla("equipos-juego.csv")}


def _plantilla(miembros):
    """Los que se ponen: del 0 al 19 (campo, banquillo, gerentes y entrenador)."""
    return sorted((m for m in miembros if int(m["puesto"]) <= ENTRENADOR), key=lambda m: int(m["puesto"]))


def lista():
    """Los equipos que se pueden elegir, sin repetidos (las versiones de nivel 99
    suelen ser la misma plantilla: se juntan y se dice)."""
    from ievr import opciones as O, servidor as SV
    miembros = _miembros()
    caras = O._cara_por_identidad()
    vistos, fuera = {}, []
    orden = {g: k for k, (g, _) in enumerate(GRUPOS)}
    for e in reglas._tabla("equipos-juego.csv"):
        if e["grupo"] not in orden:
            continue
        pl = _plantilla(miembros.get(e["id"].upper(), []))
        clave = (e["grupo"], e["nombre"], e["formacion"], e["escudo"], e["equipacion"],
                 tuple((m["puesto"], m["identidad"]) for m in pl))
        if clave in vistos:
            if e["variante"] == "nivel99":
                vistos[clave]["nivel99"] = True
            continue
        campo = [m for m in pl if int(m["puesto"]) < EQ.EN_EL_CAMPO]
        x = {"id": e["id"].upper(), "nombre": _limpio(e["nombre"]), "grupo": e["grupo"],
             "era": int(e["era"]) if (e.get("era") or "").isdigit() else 0, "era_nombre": e.get("era_nombre") or "",
             "nivel99": e["variante"] == "nivel99", "formacion": e.get("formacion_nombre") or "",
             "escudo_icono": SV._icono_de_valor("escudo", (e.get("escudo") or "").upper()) if e.get("escudo") else "",
             "jugadores": len(pl), "creables": sum(1 for m in pl if m["creable"] == "1"),
             "caras": [caras.get(m["identidad"].upper(), "") for m in campo][:11]}
        vistos[clave] = x
        fuera.append(x)
    fuera.sort(key=lambda x: (orden[x["grupo"]], x["era"], x["nombre"].lower()))
    return {"grupos": [{"id": g, "nombre": n} for g, n in GRUPOS], "equipos": fuera}


def _valor_de_objeto(tipo, id_objeto):
    """El valor que guarda el equipo para ese objeto (formacion legal sustituta)."""
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] == tipo and f["id_objeto"].upper() == (id_objeto or "").upper():
            return int(f["valor_equipo"], 16)
    return 0


def autorrellenar(plain, i, id_equipo):
    """Vacia el equipo `i` y lo rellena con el equipo del juego `id_equipo`."""
    from ievr import draft as DR
    e = _equipos().get((id_equipo or "").upper())
    if not e:
        raise E.Ilegal("no conozco ese equipo del juego")
    pl = _plantilla(_miembros().get(e["id"].upper(), []))
    if not pl:
        raise E.Ilegal("ese equipo no tiene jugadores")
    destino = EQ.leer(plain, i)
    if destino["de_la_historia"]:
        raise E.Ilegal("ese equipo es de la historia del juego y no se toca")
    avisos, anadidos = [], set()
    # fuera los que habia (siguen en la partida)
    for k, m in enumerate(destino["miembros"]):
        if m["jugador"]:
            plain, _ = EQ.sacar_jugador(plain, i, k)
    # la formacion antes de colocarlos (si es de la historia, la legal mas parecida)
    if e.get("formacion_legal_modo") == "es legal" and e.get("formacion"):
        formacion = int(e["formacion"], 16)
    else:
        formacion = _valor_de_objeto("formacion", e.get("formacion_legal"))
        if formacion:
            nombre_legal = next((f["nombre"] for f in reglas._tabla("formaciones.csv")
                                 if f["id"].upper() == (e.get("formacion_legal") or "").upper()), "?")
            avisos.append("su formacion (%s) no se puede llevar: puesta la %s" % (
                e.get("formacion_nombre") or "de la historia", nombre_legal))
    if formacion:
        plain, _ = EQ.poner_simple(plain, i, "formacion", formacion)
    # los jugadores: nuevos, como los da el juego, con MAX
    colocados = []          # (fila, miembro)
    for m in pl:
        nombre = m.get("nombre") or m["identidad"]
        if m["creable"] != "1":
            avisos.append("%s no se puede crear (no esta entre los fichables del editor)" % nombre)
            continue
        try:
            plain, info = E.anadir_jugador(plain, m["identidad"].upper())
        except E.Ilegal as ex:
            avisos.append("%s: %s" % (nombre, ex))
            continue
        fila = info["fila"]
        plain, _ = PR.maximo(plain, fila)
        puesto = int(m["puesto"])
        medalla = "gerente" if puesto in GERENTES else "entrenador" if puesto == ENTRENADOR else "jugador"
        try:
            plain, _ = E.poner_medalla(plain, fila, medalla)
        except E.Ilegal as ex:
            if "ya es" not in str(ex):
                avisos.append("%s: %s" % (nombre, ex))
        plain = DR.tras_cambio(plain, {"fila": fila})
        try:
            plain, _ = DR._aplica(plain, EQ.meter_jugador, i, puesto, fila)
        except (E.Ilegal, EQ.Ilegal) as ex:
            avisos.append("%s en el puesto %d: %s" % (nombre, puesto, ex))
            continue
        colocados.append((fila, m))
    # dorsales (primero altos para que no choquen) y capitan
    huecos = {}
    for fila, m in colocados:
        slot = EQ.slot_de_fila(plain, fila)
        huecos[fila] = next((k for k, x in enumerate(EQ.leer(plain, i)["miembros"]) if x["jugador"] == slot), None)
    for n, (fila, m) in enumerate(colocados):
        if huecos[fila] is not None:
            try:
                plain, _ = EQ.poner_dorsal(plain, i, huecos[fila], 99 - n)
            except EQ.Ilegal:
                pass
    for fila, m in colocados:
        d = int(m.get("dorsal") or 0)
        if d and huecos[fila] is not None:
            try:
                plain, _ = EQ.poner_dorsal(plain, i, huecos[fila], d)
            except EQ.Ilegal as ex:
                avisos.append("dorsal %d: %s" % (d, ex))
    for fila, m in colocados:
        if m.get("capitan") == "1" and int(m["puesto"]) < EQ.EN_EL_CAMPO and huecos[fila] is not None:
            try:
                plain, _ = EQ.poner_capitan(plain, i, huecos[fila])
            except EQ.Ilegal as ex:
                avisos.append("capitan: %s" % ex)
    # escudo y equipacion (si no los tienes, se consiguen) y tacticas
    for cual in ("escudo", "equipacion"):
        if e.get(cual + "_objeto") and e.get(cual):
            valor = int(e[cual], 16)
            plain = DR._pieza(plain, cual, valor, anadidos)
            try:
                plain, _ = EQ.poner_simple(plain, i, cual, valor)
            except EQ.Ilegal as ex:
                avisos.append("%s: %s" % (cual, ex))
        elif cual == "equipacion":
            avisos.append("su equipacion no es un objeto que se pueda tener: se queda la que habia")
    tacticas = [t for t in (e.get("tacticas") or "").split("|") if t][:3]
    if tacticas:
        for r in (1, 2, 3):
            plain, _ = EQ.poner_tactica(plain, i, r, "")
        for r, t in enumerate(tacticas, 1):
            plain = DR._pieza(plain, "tactica", int(t, 16), anadidos)
            try:
                plain, _ = EQ.poner_tactica(plain, i, r, t.upper())
            except EQ.Ilegal as ex:
                avisos.append("tactica %d: %s" % (r, ex))
    # y su nombre
    try:
        plain, _ = EQ.poner_nombre(plain, i, _limpio(e["nombre"]))
    except EQ.Ilegal as ex:
        avisos.append("nombre: %s" % ex)
    return plain, {"que": "equipo autorrellenado", "equipo": i, "con": _limpio(e["nombre"]),
                   "jugadores": len(colocados), "avisos": avisos}
