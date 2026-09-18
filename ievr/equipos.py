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
| `0x627F2D54` (4) | el **hueco de la mochila** del objeto de la equipacion (NOTAS O-190) |
| `0xF863CD5D` (16) | los huecos de la mochila de las tres tacticas |
| `0x20D7819C` (4, x2) | `synergyFlagItemId`: las sinergias puestas, **detras del nombre** (NOTAS O-191, O-196) |

**Ojo con el nombre**: el registro no acaba en el nombre. Detras del nombre
van un byte (`0xF7D8FF40`), cinco `skillId` y las dos sinergias, y son del
mismo equipo que ese nombre (O-196). El resto (plantilla, tacticas, etc.) va
delante del nombre.

**Los codigos de campo son crc32 del nombre en ingles** (O-190): `teamName`,
`uniformId`, `emblemId`, `formationId`, `tacticsId`, `uniformNo` (el dorsal),
`memberList`, `synergyFlagItemId`, `captainParamId` (`0x58C985AC`),
`skillId` (`0xEDA4D49F`, cinco), `titleFlag` (`0xE2A3657B`).

**Dos numeros por pieza.** La equipacion y las tacticas guardan el id de la
pieza Y el hueco de la mochila del objeto que la da. El juego ensena la
equipacion del hueco en la vista del equipo, y la del id en el menu de
uniformes: si solo se cambia el id (lo que hacia el editor) el menu dice
"Alpino" y el equipo sale con la equipacion sencilla (NOTAS O-190).
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
F_HUECO_EQUIPACION = 0x627F2D54     # hueco de mochila del objeto de la equipacion
F_HUECOS_TACTICAS = 0xF863CD5D      # 16 bytes: los huecos de las tres tacticas
F_SINERGIA = 0x20D7819C             # synergyFlagItemId: dos huecos (ofensiva, defensiva)
F_SINERGIA_HUECO = 0x585CA018       # detras de cada uno: el hueco de mochila del objeto
F_FIN_DE_EQUIPO = 0x033925BC        # `teamInfoList`: cierra el bloque de detras del nombre

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
    sinergias = []
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
        elif fh == F_HUECOS_TACTICAS and ln == 16:
            simples["huecos_tacticas"] = [struct.unpack_from("<I", d, 4 * k)[0] for k in range(4)]
            simples["off_huecos_tacticas"] = off + 8
        elif fh in (F_ESCUDO, F_FORMACION, F_EQUIPACION, F_ENTRENADOR, F_CAPITAN,
                    F_HUECO_EQUIPACION) and ln == 4:
            simples[fh] = _u(d)
            simples["off_%08X" % fh] = off + 8
    if actual is not None:
        huecos.append(actual)

    # El registro NO acaba en el nombre (NOTAS O-196): detras del nombre van
    # un byte, las cinco `skillId` y las dos sinergias, y son de ESTE equipo.
    # Se leen desde el final del nombre hasta la marca `0x033925BC`.
    fin_nombre = a[i] + 8 + LARGO_NOMBRE
    for off, fh, tipo, ln, d in _campos(plain, fin_nombre, min(len(plain), fin_nombre + 200)):
        if fh == F_SINERGIA and ln == 4:
            sinergias.append({"id": _u(d), "off": off + 8, "hueco": 0, "off_hueco": None})
        elif fh == F_SINERGIA_HUECO and ln == 4 and sinergias:
            sinergias[-1]["hueco"] = _u(d)
            sinergias[-1]["off_hueco"] = off + 8
        elif fh == F_FIN_DE_EQUIPO:
            break

    return {"hueco": i, "nombre": nombre, "off_nombre": a[i] + 8,
            "de_la_historia": i in EQUIPOS_DE_LA_HISTORIA,
            "tacticas": tacticas, "miembros": huecos, "campos": simples,
            "sinergias": sinergias,
            "hueco_equipacion": simples.get(F_HUECO_EQUIPACION, 0),
            "huecos_tacticas": simples.get("huecos_tacticas", [0, 0, 0, 0]),
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


def _dorsal_libre(e, sin=(), ocupados=()):
    """El dorsal mas bajo (1-99) que nadie lleva en ese equipo, sin contar los
    huecos de `sin`. Un numero libre entre medias antes que uno nuevo, como
    pidio Aaron (NOTAS O-192)."""
    usados = {x["dorsal"] for k, x in enumerate(e["miembros"])
              if x["jugador"] and k not in sin} | set(ocupados)
    for n in range(1, 100):
        if n not in usados:
            return n
    return 0


def poner_dorsal(plain, i, hueco, dorsal):
    """Cambia el dorsal de un miembro. Dos no pueden llevar el mismo: si otro
    lo tenia, ese otro pasa al primer dorsal libre (NOTAS O-192)."""
    e = leer(plain, i)
    _protege(e)
    if not 0 <= hueco < len(e["miembros"]):
        raise Ilegal("ese equipo no tiene el hueco %d" % hueco)
    m = e["miembros"][hueco]
    if not m["jugador"]:
        raise Ilegal("en ese hueco no hay nadie")
    if not 1 <= dorsal <= 99:
        raise Ilegal("el dorsal va de 1 a 99")
    buf = bytearray(plain)
    struct.pack_into("<H", buf, m["off_dorsal"], dorsal)
    movido = None
    for k, x in enumerate(e["miembros"]):
        if k != hueco and x["jugador"] and x["dorsal"] == dorsal:
            nuevo = _dorsal_libre(e, sin=(k,), ocupados=(dorsal,))
            struct.pack_into("<H", buf, x["off_dorsal"], nuevo)
            movido = {"nombre": _nombre_de_slot(plain, x["jugador"]), "dorsal": nuevo}
    return bytes(buf), {"equipo": i, "que": "dorsal",
                        "antes": m["dorsal"], "despues": dorsal, "movido": movido}


def dorsales_repetidos(plain):
    """[(equipo, nombre, [dorsales repetidos o a cero])] (NOTAS O-192)."""
    fuera = []
    for i in range(len(anclas(plain))):
        try:
            e = leer(plain, i)
        except Ilegal:
            continue
        if not e["nombre"].strip() or e["de_la_historia"]:
            continue
        vistos, mal = set(), []
        for x in e["miembros"]:
            if not x["jugador"]:
                continue
            if x["dorsal"] in vistos or x["dorsal"] == 0:
                mal.append(x["dorsal"])
            vistos.add(x["dorsal"])
        if mal:
            fuera.append((i, e["nombre"], mal))
    return fuera


def arreglar_dorsales(plain):
    """A cada equipo con dorsales repetidos (o a cero) le da al segundo que lo
    lleva el primer dorsal libre. El que lo tenia primero se lo queda."""
    mal = dorsales_repetidos(plain)
    if not mal:
        raise Ilegal("no hay dorsales repetidos en ningun equipo")
    buf = bytearray(plain)
    cambiados = 0
    for i, _n, _d in mal:
        e = leer(plain, i)
        vistos = set()
        for k, x in enumerate(e["miembros"]):
            if not x["jugador"]:
                continue
            if x["dorsal"] in vistos or x["dorsal"] == 0:
                nuevo = _dorsal_libre(e, sin=(k,), ocupados=vistos)
                struct.pack_into("<H", buf, x["off_dorsal"], nuevo)
                x["dorsal"] = nuevo
                cambiados += 1
            vistos.add(x["dorsal"])
    return bytes(buf), {"equipos": len(mal), "jugadores": cambiados,
                        "que": "dorsales repetidos cambiados por uno libre"}


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
    # el que entra lleva un dorsal que nadie mas tenga (NOTAS O-192)
    d = e["miembros"][destino]["dorsal"]
    fuera_del_equipo = {k for k in (ocupa, repe) if k is not None and k != destino}
    otros = {x["dorsal"] for k, x in enumerate(e["miembros"])
             if x["jugador"] and k != destino and k not in fuera_del_equipo}
    if repe is not None and repe != destino:
        d = e["miembros"][repe]["dorsal"]     # se trae el suyo si cambia de hueco
    if d == 0 or d in otros:
        d = _dorsal_libre(e, sin=fuera_del_equipo | {destino})
    struct.pack_into("<H", buf, e["miembros"][destino]["off_dorsal"], d)
    return bytes(buf), {"equipo": i, "que": "jugador en el puesto %d" % puesto,
                        "despues": nombre or "fila %d" % fila,
                        "saco": ocupa, "dorsal": d}


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


# --- Sinergias del equipo (NOTAS O-191, O-194) ----------------------------------
#
# El equipo lleva dos `synergyFlagItemId`: el primero la ofensiva y el segundo
# la defensiva (las dos pestanas del juego, bandera y castillo), cada uno con
# el hueco de mochila del objeto detras, como la equipacion (O-190). Una
# sinergia solo vale si sus personajes estan en el equipo (cualquier hueco,
# tambien el banquillo y el cuerpo tecnico: "Las gerentes mas allegadas" son
# tres gerentes).
TIPO_DE_RANURA_SINERGIA = {1: "ofensiva", 2: "defensiva"}


def _base_por_identidad():
    return {f["identidad"].upper(): f["chara_base_id"]
            for f in reglas._tabla("personajes.csv")}


def personajes_del_equipo(plain, e):
    """{chara_base_id} de todos los que estan en el equipo."""
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    base = _base_por_identidad()
    fuera = set()
    for m in e["miembros"]:
        if not m["jugador"]:
            continue
        fila = m["jugador"] >> 16
        if fila < len(ident) and ident[fila]:
            b = base.get("%08X" % ident[fila])
            if b:
                fuera.add(b)
    return fuera


def sinergia_en_equipo(plain, e, sn):
    """[(nombre, esta)] por cada personaje que pide la sinergia."""
    from ievr import opciones as _O
    tiene = personajes_del_equipo(plain, e)
    ids = _O.sinergia_ids_personajes(sn["item_id"])
    return [(n, i in tiene) for n, i in zip(sn["personajes"], ids)]


def poner_sinergia(plain, i, ranura, item_id):
    """Pone (o quita, con item_id vacio) la sinergia de esa ranura: 1 la
    ofensiva, 2 la defensiva. Hay que tenerla y que sus personajes esten."""
    from ievr import inventario, opciones as _O
    e = leer(plain, i)
    _protege(e)
    if ranura not in TIPO_DE_RANURA_SINERGIA:
        raise Ilegal("las sinergias van en la ranura 1 (ofensiva) o 2 (defensiva)")
    if len(e["sinergias"]) < ranura or e["sinergias"][ranura - 1]["off_hueco"] is None:
        raise Ilegal("ese equipo no tiene el hueco de sinergia %d en la partida" % ranura)
    ent = e["sinergias"][ranura - 1]
    buf = bytearray(plain)
    item_id = (item_id or "").upper()
    if not item_id:
        buf[ent["off"]:ent["off"] + 4] = bytes(4)
        struct.pack_into("<I", buf, ent["off_hueco"], 0)
        return bytes(buf), {"equipo": i, "que": "sinergia %s" % TIPO_DE_RANURA_SINERGIA[ranura],
                            "despues": "ninguna"}
    sn = _O.sinergia_por_objeto().get(item_id)
    if not sn:
        raise Ilegal("%s no es ninguna sinergia" % item_id)
    if sn["tipo"] != TIPO_DE_RANURA_SINERGIA[ranura]:
        raise Ilegal("%s es %s y esa ranura es de la %s"
                     % (sn["nombre"], sn["tipo"], TIPO_DE_RANURA_SINERGIA[ranura]))
    filas = [f for f in inventario.filas_poseidas(plain).get(item_id, []) if f.get("slot")]
    if not filas:
        raise Ilegal("no tienes la sinergia %s en la mochila" % sn["nombre"])
    faltan = [n for n, esta in sinergia_en_equipo(plain, e, sn) if not esta]
    if faltan:
        raise Ilegal("para %s hace falta tener en el equipo a %s"
                     % (sn["nombre"], ", ".join(faltan)))
    buf[ent["off"]:ent["off"] + 4] = bytes.fromhex(item_id)
    struct.pack_into("<I", buf, ent["off_hueco"], filas[0]["slot"])
    return bytes(buf), {"equipo": i, "que": "sinergia %s" % TIPO_DE_RANURA_SINERGIA[ranura],
                        "despues": sn["nombre"]}


# --- La "Configuracion de equipo" del juego (NOTAS O-204) --------------------
#
# Lo que sale en el juego debajo de la formacion ("Conf. de equipo: Tension").
# No se guarda en la partida: el juego la calcula. Con los siete equipos de
# Aaron cuadra asi: cuentan las PERSONAS VALIDAS (los del campo sin medalla de
# personal y el cuerpo tecnico con su medalla; el banquillo no), cada una por
# el arquetipo de SUS PASIVAS (las de arquetipo, ranuras 3-5; las de personal
# en el cuerpo tecnico; un Idolo o Diamante por sus fijas), no por el arquetipo
# que lleve puesto (calvos: arquetipos de todo tipo, pasivas de Justicia,
# configuracion Justicia). Gana el que mas personas tenga si llega a 5; si no,
# "Libertad". Good Losers es Libertad porque sus once llevan medalla.
NOMBRE_CONFIGURACION = {0: "Brecha", 1: "Contraataque", 2: "Vinculo", 3: "Tension",
                        4: "Juego sucio", 5: "Justicia"}
PRIORIDAD_CONFIGURACION = {3: 0, 4: 1, 2: 2, 5: 3, 1: 4, 0: 5}
MINIMO_CONFIGURACION = 5


def arquetipo_de(plain, fila):
    """El arquetipo (0-5) de ese jugador; el de un Diamante va en su array."""
    from ievr import escribir as E
    a = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))[fila]
    if a not in J.ARQUETIPOS or J.array(plain, J.ARRAY_RAREZA)[fila] == 8:
        d = E._arquetipo_diamante(plain, fila)
        if d is not None:
            return d
    return a if a in J.ARQUETIPOS else None


def _arquetipo_de_pasiva():
    """{id de pasiva: arquetipo} para las pasivas de arquetipo (ranuras 3-5)."""
    from ievr import opciones as _O
    nombres = {"Brecha": 0, "Contra": 1, "Afinidad": 2, "Tension": 3, "Juego sucio": 4, "Justicia": 5}
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-por-ranura.csv"):
            g = (f.get("grupo") or "").split(" (")[0]
            if "(ranura" in (f.get("grupo") or "") and g in nombres:
                d[f["id"].upper()] = nombres[g]
        return d
    return _O._indice("arquetipo_de_pasiva", construir)


def _arquetipo_de_pasiva_personal():
    """{(rol, id): arquetipo} de las pasivas de personal que son de UN solo
    arquetipo (las que valen para todos no dicen nada)."""
    from ievr import opciones as _O
    def construir():
        d = {}
        for f in reglas._tabla("pasivas-personal.csv"):
            d.setdefault((f["rol"], f["pasiva_id"].upper()), set()).add(int(f["arquetipo"]))
        return {k: next(iter(v)) for k, v in d.items() if len(v) == 1}
    return _O._indice("arquetipo_de_personal", construir)


def arquetipo_por_pasivas(plain, fila):
    """El arquetipo que dicen las pasivas de esa persona (O-204), o None."""
    from ievr import escribir as E
    import collections
    votos = collections.Counter()
    rol = E.rol_de_personal(plain, fila)
    if rol in ("gerente", "entrenador"):
        tabla = _arquetipo_de_pasiva_personal()
        for x in J.tabla_pasivas(plain, fila) or []:
            a = tabla.get((rol, x["id"]))
            if a is not None:
                votos[a] += 1
    else:
        try:
            off, _ = E._campo(plain, fila, J.F_PASIVAS)
            offh, _ = E._campo(plain, fila, J.F_HEREDADAS)
        except E.Ilegal:
            return None
        ids = [plain[off + 4 * k:off + 4 * k + 4].hex().upper() for k in range(5)]
        her = [plain[offh + 4 * k:offh + 4 * k + 4].hex().upper() for k in range(5)]
        if not any(int(x, 16) for x in ids + her):
            # Idolo o Diamante: sus pasivas fijas son las de su arquetipo (O-163)
            return arquetipo_de(plain, fila)
        tabla = _arquetipo_de_pasiva()
        for k in range(2, 5):
            x = her[k] if her[k] != "00000000" else ids[k]
            if x in tabla:
                votos[tabla[x]] += 1
    if not votos:
        return None
    top = votos.most_common(2)
    if len(top) > 1 and top[0][1] == top[1][1]:
        return None
    return top[0][0]


def configuracion_de_equipo(plain, e):
    """{nombre, arquetipo, cuenta, de, rango, reparto} de ese equipo (O-204)."""
    from ievr import escribir as E
    reparto, campo, validos = {}, {}, 0
    for m in e["miembros"]:
        if not m["jugador"]:
            continue
        fila = m["jugador"] >> 16
        rol = E.rol_de_personal(plain, fila)
        en_campo = m["puesto"] < EN_EL_CAMPO
        es_staff = m["puesto"] >= PUESTO_STAFF
        # solo cuentan los que el juego acepta ahi: en el campo sin medalla, y
        # en el cuerpo tecnico con ella (Good Losers: once con medalla -> Libertad)
        if not ((en_campo and rol not in ("gerente", "entrenador")) or (es_staff and rol in ("gerente", "entrenador"))):
            continue
        validos += 1
        a = arquetipo_por_pasivas(plain, fila)
        if a is None:
            continue
        reparto[a] = reparto.get(a, 0) + 1
        if en_campo:
            campo[a] = campo.get(a, 0) + 1
    orden = sorted(reparto, key=lambda a: (-reparto[a], -campo.get(a, 0), PRIORIDAD_CONFIGURACION.get(a, 9)))
    mejor = orden[0] if orden and reparto[orden[0]] >= MINIMO_CONFIGURACION else None
    if mejor is not None and len(orden) > 1 and reparto[orden[1]] == reparto[mejor] and campo.get(orden[1], 0) == campo.get(mejor, 0):
        mejor = None          # empate total: el juego no elige
    cuenta = reparto.get(mejor, 0) if mejor is not None else 0
    return {"nombre": NOMBRE_CONFIGURACION[mejor] if mejor is not None else "Libertad",
            "arquetipo": mejor, "cuenta": cuenta,
            "en_campo": campo.get(mejor, 0) if mejor is not None else 0, "de": validos,
            "minimo": MINIMO_CONFIGURACION,
            "reparto": sorted(({"arquetipo": a, "nombre": NOMBRE_CONFIGURACION[a], "cuenta": n,
                                "en_campo": campo.get(a, 0)} for a, n in reparto.items()),
                              key=lambda x: -x["cuenta"])}


def hueco_de_pieza(plain, tipo, valor):
    """El hueco de la mochila del objeto que da esa equipacion o tactica
    (NOTAS O-190), o 0 si no se tiene. `valor` es lo que guarda el equipo."""
    from ievr import inventario
    if not valor:
        return 0
    quiero = {"%08X" % valor, _al_reves("%08X" % valor)}
    poseidas = inventario.filas_poseidas(plain)
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] != tipo or f["valor_equipo"].upper() not in quiero:
            continue
        for fila in poseidas.get(f["id_objeto"].upper(), []):
            if fila.get("slot"):
                return fila["slot"]
    return 0


def piezas_desajustadas(plain):
    """[(equipo, que)] de los equipos cuya equipacion o tacticas no llevan el
    hueco de mochila que les toca (NOTAS O-190). Solo se dice algo cuando el
    objeto se tiene, que es cuando se sabe el hueco bueno."""
    fuera = []
    for i in range(len(anclas(plain))):
        try:
            e = leer(plain, i)
        except Ilegal:
            continue
        if not e["nombre"].strip() or e["de_la_historia"]:
            # un equipo sin nombre no sale en el juego: si tiene una sinergia
            # es que la puso el editor en el bloque equivocado (O-196)
            if not e["de_la_historia"] and any(x["id"] for x in e["sinergias"]):
                fuera.append((i, "sinergia de sobra"))
            continue
        if "off_%08X" % F_HUECO_EQUIPACION in e["campos"]:
            bueno = hueco_de_pieza(plain, "equipacion", e["equipacion"])
            if bueno and bueno != e["hueco_equipacion"]:
                fuera.append((i, "equipacion"))
        if "off_huecos_tacticas" in e["campos"]:
            for k in range(3):
                bueno = hueco_de_pieza(plain, "tactica", e["tacticas"][k])
                if bueno and bueno != e["huecos_tacticas"][k]:
                    fuera.append((i, "tactica %d" % (k + 1)))
    return fuera


def arreglar_piezas(plain):
    """Pone a cada equipo el hueco de mochila de su equipacion y sus tacticas."""
    mal = piezas_desajustadas(plain)
    if not mal:
        raise Ilegal("todos los equipos tienen sus piezas bien enlazadas")
    buf = bytearray(plain)
    for i, que in mal:
        e = leer(plain, i)
        if que == "sinergia de sobra":
            for x in e["sinergias"]:
                buf[x["off"]:x["off"] + 4] = bytes(4)
                if x["off_hueco"] is not None:
                    struct.pack_into("<I", buf, x["off_hueco"], 0)
            continue
        if que == "equipacion":
            struct.pack_into("<I", buf, e["campos"]["off_%08X" % F_HUECO_EQUIPACION],
                             hueco_de_pieza(plain, "equipacion", e["equipacion"]))
        else:
            k = int(que.split()[1]) - 1
            struct.pack_into("<I", buf, e["campos"]["off_huecos_tacticas"] + 4 * k,
                             hueco_de_pieza(plain, "tactica", e["tacticas"][k]))
    return bytes(buf), {"equipos": len({i for i, _ in mal}), "piezas": len(mal),
                        "que": "equipacion y tacticas enlazadas con su objeto de la mochila"}


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
    if cual == "equipacion" and "off_%08X" % F_HUECO_EQUIPACION in e["campos"]:
        # y el hueco de la mochila del objeto, que es lo que ensena el equipo
        # en el juego (NOTAS O-190)
        struct.pack_into("<I", buf, e["campos"]["off_%08X" % F_HUECO_EQUIPACION],
                         hueco_de_pieza(plain, "equipacion", valor & 0xFFFFFFFF))
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
    if "off_huecos_tacticas" in e["campos"]:
        # y el hueco de la mochila del objeto (NOTAS O-190)
        struct.pack_into("<I", buf, e["campos"]["off_huecos_tacticas"] + 4 * (ranura - 1),
                         hueco_de_pieza(plain, "tactica", valor))
    return bytes(buf), {"equipo": i, "que": "tactica %d" % ranura,
                        "despues": id_hex or "ninguna"}
