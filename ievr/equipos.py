#!/usr/bin/env python3
"""Los equipos de la partida: leerlos y cambiarlos.

Un equipo son **1.989 bytes** de campos, con el nombre al final. Se encuentran
por el hash del nombre, `0xE9E94266`, y hay **49 huecos**. Los dos primeros son
de la historia y no se tocan (NOTAS O-109).

**Ojo con el formato**: aqui la longitud de un campo son **3 bytes** y el cuarto
es un tipo; cuando el tipo no es 0 el campo no lleva datos detras y esos tres
bytes son el propio valor (NOTAS O-108). El lector general de `tlv.py` da por
hecho que son 4 bytes de longitud, que vale para el resto de la partida pero se
estrella aqui.

Que hay dentro, todo comprobado contra la captura del equipo ECLIPSE de Aaron:

| campo | que es |
|---|---|
| `0xE9E94266` (128) | nombre |
| `0xFD88F528` (16) | las tres tacticas |
| `0x292566C1` (4) | escudo |
| `0x0589A19B` (4) | formacion |
| `0xA8E04439` (4) | equipacion |
| `0x21DB3FB1` (4) | entrenador, por identidad de personaje |
| `0x7E263C6F` (4) | capitan, por slot de jugador |
| `0x98356E87` | marcador de hueco de plantilla, 30 huecos |
| `0x3A0D9419` (4) | el jugador de ese hueco (su slot) |
| `0x70730B76` (2) | su dorsal |
| `0x709A88E9` (1) | donde juega: 0 el portero, 1-10 el resto, 16+ entrenador y gerentes |
"""
import struct

from ievr import jugador as J, reglas

F_NOMBRE = 0xE9E94266
F_TACTICAS = 0xFD88F528
F_ESCUDO = 0x292566C1
F_FORMACION = 0x0589A19B
F_EQUIPACION = 0xA8E04439
F_ENTRENADOR = 0x21DB3FB1
F_CAPITAN = 0x7E263C6F
F_HUECO = 0x98356E87
F_JUGADOR = 0x3A0D9419
F_DORSAL = 0x70730B76
F_PUESTO = 0x709A88E9

LARGO_NOMBRE = 128
HUECOS = 30
EN_EL_CAMPO = 11          # puestos 0 a 10
PUESTO_STAFF = 16         # del 16 en adelante son entrenador y gerentes

# Cuantos caben **en el campo**. El banquillo no cuenta, pero el entrenador y
# los gerentes si. Lo dijo Aaron (NOTAS O-118).
TOPE_IDOLOS = 2
TOPE_DIAMANTES = 1

# Los dos primeros huecos son los equipos de la historia.
EQUIPOS_DE_LA_HISTORIA = (0, 1)

# De los 49 huecos, en el juego **solo se pueden tocar los que tienen nombre**.
# Los demas existen en la partida pero no salen por ningun sitio jugando, asi
# que el editor no los ensena (NOTAS O-120).

# Partidos que hacen falta para **ganarse la medalla**, dichos por Aaron:
PARTIDOS_PARA_STAFF = 30      # de jugador a gerente o entrenador
PARTIDOS_PARA_JUGADOR = 10    # de gerente o entrenador a jugador

# --- quien puede ser que -----------------------------------------------------
# Cada persona tiene una **aptitud de fabrica**: jugador, gerente o entrenador.
# El juego lo dice con estas palabras: "Cada personaje tiene una aptitud como
# jugador, entrenador o gerente. Al cumplir ciertas condiciones puedes
# desbloquear aptitudes adicionales mas alla de la aptitud inicial".
#
# La aptitud adicional se gana equipando una **medalla** en la tabla de
# habilidades ("Transforma a un personaje en gerente. Equipala en la tabla de
# habilidades"). La medalla puesta se guarda en el campo `0x8F0E9F49` de la
# ficha, y lo que guarda es el **hueco de mochila** del monton de medallas, no
# el id del objeto (NOTAS O-132).
F_MEDALLA = 0x8F0E9F49
MEDALLA_ENTRENADOR = 0x9B6947D9
MEDALLA_GERENTE = 0xEC6E774F
MEDALLAS = {MEDALLA_ENTRENADOR: "entrenador", MEDALLA_GERENTE: "gerente"}

# Destin Billows es el protagonista de la historia. Se pueden tener varios,
# incluso en Diamante, pero **ninguno puede jugar**: solo gerente o entrenador.
NOMBRE_SOLO_STAFF = "Destin Billows"


class Ilegal(Exception):
    pass


def _campos(plain, ini, fin):
    """Lee los campos del tramo, con el formato de 3 bytes de longitud."""
    off = ini
    fuera = []
    while off + 8 <= fin:
        fh = struct.unpack_from("<I", plain, off)[0]
        bruto = struct.unpack_from("<I", plain, off + 4)[0]
        tipo, ln = bruto >> 24, bruto & 0xFFFFFF
        if tipo:
            fuera.append((off, fh, tipo, ln, None))
            off += 8
        else:
            if off + 8 + ln > len(plain):
                break
            fuera.append((off, fh, 0, ln, bytes(plain[off + 8:off + 8 + ln])))
            off += 8 + ln
    return fuera


def anclas(plain):
    """Los offsets de la cabecera del nombre de cada equipo, en orden."""
    return J.ocurrencias(plain, F_NOMBRE, LARGO_NOMBRE)


def _tramo(plain, anclas_, i):
    """(inicio, fin) del registro del equipo i. El nombre va al final."""
    fin = anclas_[i]
    ini = (anclas_[i - 1] + 8 + LARGO_NOMBRE + 9) if i else max(0, fin - 2100)
    return ini, fin


def _texto(datos):
    return datos.split(b"\0")[0].decode("utf-8", "replace")


def _u(datos):
    return int.from_bytes(datos, "little") if datos else 0


def leer(plain, i):
    """Todo lo que se sabe del equipo i."""
    a = anclas(plain)
    if not 0 <= i < len(a):
        raise Ilegal("no hay ningun equipo en el hueco %d" % i)
    ini, fin = _tramo(plain, a, i)
    campos = _campos(plain, ini, fin)
    nombre = _texto(bytes(plain[a[i] + 8:a[i] + 8 + LARGO_NOMBRE]))

    simples = {}
    tacticas = []
    huecos = []
    actual = None
    for off, fh, tipo, ln, d in campos:
        if fh == F_HUECO:
            if actual is not None:
                huecos.append(actual)
            actual = {"jugador": 0, "dorsal": 0, "puesto": 0}
            continue
        if actual is not None and fh in (F_JUGADOR, F_DORSAL, F_PUESTO):
            if fh == F_JUGADOR and ln == 4:
                actual["jugador"] = _u(d)
                actual["off_jugador"] = off + 8
            elif fh == F_DORSAL and ln == 2:
                actual["dorsal"] = _u(d)
                actual["off_dorsal"] = off + 8
            elif fh == F_PUESTO and ln == 1:
                actual["puesto"] = d[0]
                actual["off_puesto"] = off + 8
            continue
        if fh == F_TACTICAS and ln == 16:
            tacticas = [struct.unpack_from("<I", d, 4 * k)[0] for k in range(4)]
            simples["off_tacticas"] = off + 8
        elif fh in (F_ESCUDO, F_FORMACION, F_EQUIPACION, F_ENTRENADOR, F_CAPITAN) and ln == 4:
            simples[fh] = _u(d)
            simples["off_%08X" % fh] = off + 8
    if actual is not None:
        huecos.append(actual)

    return {"hueco": i, "nombre": nombre, "off_nombre": a[i] + 8,
            "de_la_historia": i in EQUIPOS_DE_LA_HISTORIA,
            "tacticas": tacticas, "miembros": huecos, "campos": simples,
            "escudo": simples.get(F_ESCUDO, 0),
            "formacion": simples.get(F_FORMACION, 0),
            "equipacion": simples.get(F_EQUIPACION, 0),
            "entrenador": simples.get(F_ENTRENADOR, 0),
            "capitan": simples.get(F_CAPITAN, 0)}


def _al_reves(hexa):
    """El mismo valor con los cuatro bytes al reves."""
    try:
        return bytes.fromhex(hexa)[::-1].hex().upper()
    except ValueError:
        return hexa


def catalogo(plain, tipo):
    """Lo que Aaron TIENE de ese tipo, listo para un desplegable.

    Un escudo, una equipacion o una tactica tienen **dos numeros**: el del
    objeto en la mochila y el que guarda el equipo. `equipo-objetos.csv` los
    empareja (NOTAS O-124). Y no todos guardan el valor en el mismo orden de
    bytes, asi que se prueban los dos.
    """
    from ievr import inventario, opciones as _O
    poseidas = inventario.filas_poseidas(plain)
    dichos = nombres_puestos()
    # el nombre en espanol, que es el que sale en la mochila
    en_espanol = {f["id"].upper(): _O._limpio(f.get("nombre_es") or f.get("nombre_en"))
                  for f in reglas._tabla("nombres-es.csv")}
    fuera, vistos = [], set()
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] != tipo:
            continue
        if f["id_objeto"].upper() not in poseidas:
            continue
        for valor in (f["valor_equipo"].upper(), _al_reves(f["valor_equipo"])):
            if valor in vistos:
                continue
            vistos.add(valor)
            nombre = (dichos.get((tipo, valor))
                      or en_espanol.get(f["id_objeto"].upper())
                      or _O._limpio(f.get("nombre") or ""))
            fuera.append({"valor": valor, "nombre": nombre or "sin nombre",
                          "icono": (_iconos_por_objeto().get(f["id_objeto"].upper(), "")
                                    or f.get("icono")),
                          "id_objeto": f["id_objeto"].upper()})
            break
    return sorted(fuera, key=lambda x: x["nombre"])


def _iconos_por_objeto():
    """{id del objeto: ruta de su dibujo} de `iconos-objeto.csv` (NOTAS O-137)."""
    return {f["id_objeto"].upper(): f["icono"]
            for f in reglas._tabla("iconos-objeto.csv") if f.get("icono")}


def nombres_puestos():
    """{(tipo, id): nombre} de formacion, escudo y equipacion.

    El juego no guarda estos nombres en ninguna tabla que se haya encontrado.
    Los dijo Aaron mirando sus equipos, y estan en
    `datos/reglas-del-jugador/nombres-de-equipo.csv`.
    """
    d = {}
    for f in reglas._tabla("nombres-de-equipo.csv", reglas.DEL_JUGADOR):
        d[(f["tipo"], f["id"].upper())] = f["nombre"]
    return d


def todos(plain, solo_con_nombre=True):
    """Los equipos. Por defecto **solo los que se pueden tocar en el juego**.

    De los 49 huecos, jugando solo se llega a los que tienen nombre; los demas
    ni salen. Ensenarlos seria ofrecer algo que el juego no da (NOTAS O-120).
    """
    from ievr import opciones as _O
    a = anclas(plain)
    fuera = []
    for i in range(len(a)):
        try:
            e = leer(plain, i)
        except Ilegal:
            continue
        if solo_con_nombre and (not e["nombre"].strip() or e["de_la_historia"]):
            continue      # los de la historia tampoco salen: no se tocan
        gente = [m for m in e["miembros"] if m["jugador"]]
        fuera.append({"hueco": i, "nombre": _O.sin_marcadores(e["nombre"]),
                      "de_la_historia": e["de_la_historia"],
                      "cuantos": len(gente),
                      "en_el_campo": sum(1 for m in gente if m["puesto"] < EN_EL_CAMPO)})
    return fuera


# --- escribir -------------------------------------------------------------

def _protege(e):
    if e["de_la_historia"]:
        raise Ilegal("ese equipo es de la historia del juego y no se toca")


def poner_nombre(plain, i, nombre):
    """Cambia el nombre del equipo."""
    e = leer(plain, i)
    _protege(e)
    b = nombre.encode("utf-8")
    if not b:
        raise Ilegal("el nombre no puede estar vacio")
    if len(b) > 30:
        raise Ilegal("el nombre no puede pasar de 30 letras")
    buf = bytearray(plain)
    buf[e["off_nombre"]:e["off_nombre"] + LARGO_NOMBRE] = b + bytes(LARGO_NOMBRE - len(b))
    return bytes(buf), {"equipo": i, "que": "nombre",
                        "antes": e["nombre"], "despues": nombre}


def poner_dorsal(plain, i, hueco, dorsal):
    """Cambia el dorsal de un miembro."""
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    m = e["miembros"][hueco]
    if not m["jugador"]:
        raise Ilegal("en ese hueco no hay nadie")
    if not 0 <= dorsal <= 99:
        raise Ilegal("el dorsal va de 0 a 99")
    otros = {x["dorsal"] for k, x in enumerate(e["miembros"])
             if k != hueco and x["jugador"]}
    if dorsal in otros:
        raise Ilegal("ya hay otro con el dorsal %d en ese equipo" % dorsal)
    buf = bytearray(plain)
    struct.pack_into("<H", buf, m["off_dorsal"], dorsal)
    return bytes(buf), {"equipo": i, "que": "dorsal",
                        "antes": m["dorsal"], "despues": dorsal}


def poner_capitan(plain, i, hueco):
    """Pone de capitan al que este en ese hueco."""
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    m = e["miembros"][hueco]
    if not m["jugador"]:
        raise Ilegal("en ese hueco no hay nadie")
    if m["puesto"] >= EN_EL_CAMPO:
        raise Ilegal("el capitan tiene que ser uno de los once que juegan")
    buf = bytearray(plain)
    struct.pack_into("<I", buf, e["campos"]["off_%08X" % F_CAPITAN], m["jugador"])
    return bytes(buf), {"equipo": i, "que": "capitan", "despues": hueco}


def _rareza_de(plain, slot):
    if not slot:
        return None
    fila = slot >> 16
    rar = J.array(plain, J.ARRAY_RAREZA)
    if fila >= len(rar):
        return None
    return rar[fila]


def poner_jugador(plain, i, hueco, slot):
    """Mete a un jugador en un hueco del equipo (o lo vacia con slot 0)."""
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    m = e["miembros"][hueco]
    if slot:
        repes = [k for k, x in enumerate(e["miembros"])
                 if k != hueco and x["jugador"] == slot]
        if repes:
            raise Ilegal("ese jugador ya esta en el hueco %d de este equipo" % repes[0])
        razon = por_que_no_puede(plain, slot, m["puesto"])
        if razon:
            raise Ilegal(razon)
        _comprueba_topes(*cuantos_caben(plain, e, None, {hueco: slot}))
    buf = bytearray(plain)
    struct.pack_into("<I", buf, m["off_jugador"], slot)
    return bytes(buf), {"equipo": i, "que": "jugador del hueco %d" % hueco,
                        "antes": m["jugador"], "despues": slot}


# **Correccion importante** (NOTAS O-132): el entrenador es el puesto **19** y
# los gerentes el 16, 17 y 18. Antes estaba al reves. Se ve en la propia
# partida: los 21 miembros en puestos 16-18 llevan todos la Medalla de gerente,
# y los 9 del puesto 19 llevan la de entrenador o son entrenadores de fabrica.
PUESTO_ENTRENADOR = 19
GERENTES = (16, 17, 18)


def _partidos_de(plain, slot):
    """Los partidos jugados de ese jugador, o None si no se pueden leer."""
    from ievr import escribir as _E
    try:
        off, n = _E._campo(plain, slot >> 16, _E.F_PARTIDOS)
    except Exception:
        return None
    return int.from_bytes(plain[off:off + min(n, 4)], "little")


def _ficha_de(plain, slot):
    """La fila de `personajes.csv` de quien ocupa ese slot."""
    from ievr import reglas as _R
    fila = slot >> 16
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= len(ident) or not ident[fila]:
        return {}
    return _R.personajes().get("%08X" % ident[fila]) or {}


def _nombre_de_slot(plain, slot):
    f = _ficha_de(plain, slot)
    return f.get("nombre_es") or f.get("nombre_en") or ""


def montones_de_medalla(plain):
    """{hueco de mochila: cual de las dos medallas es}.

    Las medallas se amontonan: Aaron tiene 99.999 de cada una en una sola fila,
    y los 188 personajes que llevan una apuntan todos a esas mismas filas.
    """
    from ievr import memoria

    def construir():
        from ievr import inventario
        d = {}
        # Ojo: `inventario` da el id **con los bytes tal cual estan**, o sea al
        # reves de como se escribe el numero. Hay que darle la vuelta.
        for f in inventario.todas_las_filas(plain):
            crudo = f.get("id") or ""
            if len(crudo) != 8:
                continue
            cual = MEDALLAS.get(int(_al_reves(crudo), 16))
            if cual:
                d[f["slot"]] = cual
        return d
    return memoria.recordar(plain, "montones_de_medalla", construir)


def medalla_de(plain, slot, valor=None):
    """"entrenador", "gerente" o "" segun la medalla que lleve puesta.

    `valor` es el contenido del campo si ya se ha leido (la lista de la reserva
    lo lee de una pasada para sus 3.000 filas); si no, se lee aqui.
    """
    if valor is None:
        from ievr import escribir as _E
        try:
            off, n = _E._campo(plain, slot >> 16, F_MEDALLA)
        except Exception:
            return ""
        valor = int.from_bytes(plain[off:off + min(n, 4)], "little")
    return montones_de_medalla(plain).get(valor, "") if valor else ""


def aptitudes(plain, slot, medalla=None, partidos=None):
    """Que puede ser esa persona: "jugador", "gerente" y/o "entrenador".

    Tres cosas mandan, en este orden:

    1. **La medalla puesta.** Si lleva una, *es* eso y deja de ser jugador. El
       propio juego lo dice al intentarlo: "No puedes colocar gerentes ni en el
       campo ni en el banquillo".
    2. **La aptitud de fabrica**, que sale de `personajes.csv`. Hay 110
       entrenadores y 49 gerentes de fabrica, y esos no necesitan medalla.
    3. **Destin Billows**, el protagonista, que no juega nunca.

    Comprobado contra los 176 miembros de los once equipos de Aaron: cuadran
    166, y los 10 que no son justo los que el propio editor habia dejado mal
    puestos, que es el fallo que pidio arreglar (NOTAS O-132).
    """
    f = _ficha_de(plain, slot)
    fuera = set()
    if f.get("apt_entrenador"):
        fuera.add("entrenador")
    if f.get("apt_gerente"):
        fuera.add("gerente")
    med = medalla_de(plain, slot) if medalla is None else medalla
    if med:
        fuera.add(med)
    else:
        nombre = f.get("nombre_es") or f.get("nombre_en") or ""
        if nombre == NOMBRE_SOLO_STAFF:
            pass                      # el protagonista no juega nunca
        elif not fuera:
            fuera.add("jugador")      # de fabrica es jugador: sin condiciones
        else:
            # De fabrica es gerente o entrenador. Para jugar tiene que haberse
            # ganado la aptitud de jugador, que son 10 partidos (regla de Aaron).
            if partidos is None:
                partidos = _partidos_de(plain, slot)
            if partidos is None or partidos >= PARTIDOS_PARA_JUGADOR:
                fuera.add("jugador")
    return fuera


def _es_staff(puesto):
    return puesto >= PUESTO_STAFF


def rol_de(puesto):
    """"jugador", "gerente" o "entrenador"."""
    if puesto == PUESTO_ENTRENADOR:
        return "entrenador"
    if puesto in GERENTES:
        return "gerente"
    return "jugador"


def nombre_de_puesto(p):
    if p == 0:
        return "portero"
    if p < EN_EL_CAMPO:
        return "campo"
    if p < PUESTO_STAFF:
        return "banquillo"
    if p == PUESTO_ENTRENADOR:
        return "entrenador"
    return "gerente"


def por_que_no_puede(plain, slot, puesto):
    """Por que esa persona no puede ir a ese puesto. Cadena vacia si si puede.

    Es la **misma** funcion que usan el guardado y la pantalla, para que lo que
    sale tachado y lo que el editor rechaza no puedan discrepar nunca.
    """
    if not slot:
        return ""
    quiere = rol_de(puesto)
    tiene = aptitudes(plain, slot)
    if quiere in tiene:
        return ""
    nombre = _nombre_de_slot(plain, slot) or "ese jugador"
    if nombre == NOMBRE_SOLO_STAFF:
        return ("%s es el protagonista de la historia: solo puede ser gerente o "
                "entrenador, nunca jugar." % NOMBRE_SOLO_STAFF)
    med = medalla_de(plain, slot)
    if quiere == "jugador":
        return ("%s lleva puesta la Medalla de %s, asi que ya no es jugador y no "
                "puede ir ni al campo ni al banquillo. Quitasela en su ficha y "
                "vuelve a intentarlo." % (nombre, med))
    partidos = _partidos_de(plain, slot)
    hacen_falta = PARTIDOS_PARA_JUGADOR if med else PARTIDOS_PARA_STAFF
    if partidos is not None and partidos < hacen_falta:
        return ("%s no puede ser %s: hace falta la Medalla de %s, y para ganarsela "
                "tiene que haber jugado %d partidos. Lleva %d."
                % (nombre, quiere, quiere, hacen_falta, partidos))
    return ("%s no puede ser %s: le falta la Medalla de %s. Ponsela en su ficha "
            "y ya se puede mover ahi." % (nombre, quiere, quiere))


def _comprueba_rol(plain, slot, puesto_ahora, puesto_nuevo):
    """Salta si esa persona no puede ocupar el puesto nuevo.

    Antes esto miraba **el salto** (de jugador a gerente, 30 partidos) y ademas
    solo se llamaba desde `poner_puesto`. Las dos cosas estaban mal: lo que el
    juego mira no es el salto sino **lo que la persona es**, y hay que mirarlo
    en los tres caminos (mover, intercambiar y meter de la reserva).
    """
    if puesto_ahora == puesto_nuevo:
        return
    razon = por_que_no_puede(plain, slot, puesto_nuevo)
    if razon:
        raise Ilegal(razon)


def cuantos_caben(plain, e, nuevos=None, entra=None):
    """(idolos, diamantes) contando campo y cuerpo tecnico, con los cambios puestos.

    `nuevos` = {hueco: puesto nuevo}; `entra` = {hueco: slot nuevo}.
    """
    nuevos = nuevos or {}
    entra = entra or {}
    idolos = diamantes = 0
    for k, x in enumerate(e["miembros"]):
        slot = entra.get(k, x["jugador"])
        if not slot:
            continue
        p2 = nuevos.get(k, x["puesto"])
        if EN_EL_CAMPO <= p2 < PUESTO_STAFF:
            continue          # el banquillo no cuenta
        r = _rareza_de(plain, slot)
        if r in (5, 6, 7):
            idolos += 1
        elif r == 8:
            diamantes += 1
    return idolos, diamantes


def _comprueba_topes(idolos, diamantes):
    if idolos > TOPE_IDOLOS:
        raise Ilegal("asi quedarian %d Idolos entre el campo y el cuerpo tecnico, "
                     "y solo caben %d" % (idolos, TOPE_IDOLOS))
    if diamantes > TOPE_DIAMANTES:
        raise Ilegal("asi quedarian %d Diamantes entre el campo y el cuerpo "
                     "tecnico, y solo cabe %d" % (diamantes, TOPE_DIAMANTES))


def _aplica_movimientos(plain, e, nuevos):
    """Comprueba de golpe los roles y los topes de un conjunto de movimientos.

    `nuevos` es {hueco: puesto nuevo}. Se mira **como quedaria todo**, no cada
    paso por su cuenta, que es lo que dejaba las cosas a medias.
    """
    for hueco, puesto in nuevos.items():
        m = e["miembros"][hueco]
        if m["jugador"]:
            _comprueba_rol(plain, m["jugador"], m["puesto"], puesto)
    _comprueba_topes(*cuantos_caben(plain, e, nuevos))


def poner_puesto(plain, i, hueco, puesto):
    """Mueve a un miembro. Si el sitio esta cogido, los dos se intercambian.

    | puesto | que es |
    |---|---|
    | 0 | el portero |
    | 1-10 | los otros diez del campo |
    | 11-15 | banquillo |
    | 16-18 | gerentes |
    | 19 | entrenador |
    """
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    if not 0 <= puesto <= 19:
        raise Ilegal("el puesto va de 0 a 19")
    m = e["miembros"][hueco]
    if not m["jugador"]:
        raise Ilegal("en ese hueco no hay nadie que mover")
    if m["puesto"] == puesto:
        raise Ilegal("ya esta en ese puesto")

    otro = next((k for k, x in enumerate(e["miembros"])
                 if k != hueco and x["jugador"] and x["puesto"] == puesto), None)
    nuevos = {hueco: puesto}
    if otro is not None:
        nuevos[otro] = m["puesto"]
    _aplica_movimientos(plain, e, nuevos)

    buf = bytearray(plain)
    for k, p2 in nuevos.items():
        buf[e["miembros"][k]["off_puesto"]] = p2
    # Antes aqui se escribia ademas el campo `F_ENTRENADOR` con la identidad del
    # personaje. Era inventarse un dato: en los once equipos de Aaron ese campo
    # vale **cero** siempre, o sea que el juego no lo usa para esto (O-132).
    return bytes(buf), {"equipo": i, "que": "puesto",
                        "antes": rol_de(m["puesto"]), "despues": rol_de(puesto),
                        "tambien": otro}


def intercambiar(plain, i, hueco_a, hueco_b):
    """Cambia de sitio a dos miembros, con sus dorsales."""
    e = leer(plain, i)
    _protege(e)
    for h in (hueco_a, hueco_b):
        if not 0 <= h < len(e["miembros"]):
            raise Ilegal("ese equipo no tiene el hueco %d" % h)
    if hueco_a == hueco_b:
        raise Ilegal("son el mismo hueco")
    a, b = e["miembros"][hueco_a], e["miembros"][hueco_b]
    _aplica_movimientos(plain, e, {hueco_a: b["puesto"], hueco_b: a["puesto"]})
    buf = bytearray(plain)
    struct.pack_into("<I", buf, a["off_jugador"], b["jugador"])
    struct.pack_into("<I", buf, b["off_jugador"], a["jugador"])
    struct.pack_into("<H", buf, a["off_dorsal"], b["dorsal"])
    struct.pack_into("<H", buf, b["off_dorsal"], a["dorsal"])
    return bytes(buf), {"equipo": i, "que": "cambio de sitio",
                        "antes": hueco_a, "despues": hueco_b}


ARRAY_SLOT = (0x918020D9, 24000, "I", 4)


def slot_de_fila(plain, fila):
    """El slot con el que un equipo se refiere a ese jugador."""
    a = J.array(plain, ARRAY_SLOT)
    if not 0 <= fila < len(a) or not a[fila]:
        raise Ilegal("en la fila %d no hay ningun jugador" % fila)
    return a[fila]


def meter_jugador(plain, i, puesto, fila):
    """Mete en el equipo a uno de los jugadores de la reserva.

    Si el puesto esta cogido, el que estaba **sale del equipo**; es lo que hace
    el juego al poner a otro encima. Si no hay nadie en ese puesto se usa uno de
    los huecos libres y se le pone ese puesto.
    """
    e = leer(plain, i)
    _protege(e)
    if not 0 <= puesto <= 19:
        raise Ilegal("el puesto va de 0 a 19")
    slot = slot_de_fila(plain, fila)
    repe = next((k for k, x in enumerate(e["miembros"]) if x["jugador"] == slot), None)
    if repe is not None and e["miembros"][repe]["puesto"] == puesto:
        raise Ilegal("ese jugador ya esta justo en ese puesto")

    nombre = _nombre_de_slot(plain, slot)
    # El que entra viene de la reserva, asi que **se mira lo que es**, no de
    # donde venia: si lleva la Medalla de gerente no puede caer en el campo, y
    # si no lleva ninguna no puede caer en el cuerpo tecnico.
    razon = por_que_no_puede(plain, slot, puesto)
    if razon:
        raise Ilegal(razon)

    ocupa = next((k for k, x in enumerate(e["miembros"])
                  if x["jugador"] and x["puesto"] == puesto), None)
    if ocupa is not None:
        destino = ocupa
    else:
        destino = next((k for k, x in enumerate(e["miembros"]) if not x["jugador"]), None)
        if destino is None:
            raise Ilegal("ese equipo ya tiene los %d huecos llenos" % HUECOS)

    # El que estaba en el sitio se va del equipo, asi que no cambia de rol; solo
    # hay que recontar Idolos y Diamantes con el cambio ya hecho.
    entra = {destino: slot}
    if ocupa is not None and ocupa != destino:
        entra[ocupa] = 0
    if repe is not None and repe != destino:
        entra[repe] = 0
    _comprueba_topes(*cuantos_caben(plain, e, {destino: puesto}, entra))

    buf = bytearray(plain)
    struct.pack_into("<I", buf, e["miembros"][destino]["off_jugador"], slot)
    buf[e["miembros"][destino]["off_puesto"]] = puesto
    if repe is not None and repe != destino:
        struct.pack_into("<I", buf, e["miembros"][repe]["off_jugador"], 0)
    return bytes(buf), {"equipo": i, "que": "jugador en el puesto %d" % puesto,
                        "despues": nombre or "fila %d" % fila,
                        "saco": ocupa}


def sacar_jugador(plain, i, hueco):
    """Saca del equipo al del hueco. El hueco se queda libre."""
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    m = e["miembros"][hueco]
    if not m["jugador"]:
        raise Ilegal("en ese hueco no hay nadie")
    buf = bytearray(plain)
    struct.pack_into("<I", buf, m["off_jugador"], 0)
    return bytes(buf), {"equipo": i, "que": "sacar del equipo",
                        "antes": _nombre_de_slot(plain, m["jugador"])}


def poner_simple(plain, i, cual, valor):
    """Cambia formacion, escudo o equipacion."""
    # `F_ENTRENADOR` no esta: en los once equipos de Aaron vale cero siempre,
    # el juego no lo usa y escribirlo seria inventar (NOTAS O-132).
    campos = {"formacion": F_FORMACION, "escudo": F_ESCUDO,
              "equipacion": F_EQUIPACION}
    if cual not in campos:
        raise Ilegal("no se que es %r" % cual)
    e = leer(plain, i)
    _protege(e)
    clave = "off_%08X" % campos[cual]
    if clave not in e["campos"]:
        raise Ilegal("ese equipo no tiene el campo de %s" % cual)
    buf = bytearray(plain)
    struct.pack_into("<I", buf, e["campos"][clave], valor & 0xFFFFFFFF)
    return bytes(buf), {"equipo": i, "que": cual,
                        "antes": "%08X" % e[cual], "despues": "%08X" % valor}


def poner_tactica(plain, i, ranura, id_hex):
    """Cambia una de las tres tacticas."""
    e = leer(plain, i)
    _protege(e)
    if not 1 <= ranura <= 3:
        raise Ilegal("las tacticas van de 1 a 3")
    valor = int(id_hex, 16) if id_hex else 0
    if valor:
        repes = [k for k, v in enumerate(e["tacticas"][:3])
                 if v == valor and k != ranura - 1]
        if repes:
            raise Ilegal("esa tactica ya esta en la ranura %d" % (repes[0] + 1))
    buf = bytearray(plain)
    struct.pack_into("<I", buf, e["campos"]["off_tacticas"] + 4 * (ranura - 1), valor)
    return bytes(buf), {"equipo": i, "que": "tactica %d" % ranura,
                        "despues": id_hex or "ninguna"}
