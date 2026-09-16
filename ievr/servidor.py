#!/usr/bin/env python3
"""La interfaz del editor. Se abre en el navegador y funciona sin internet.

    py -m ievr.servidor partidas\\rondas\\18-con-jugadores-creados

Por que un navegador y no una ventana normal: el navegador ya sabe ensenar
listas largas con fotos, buscar y filtrar, y Aaron no tiene que instalar nada.
El servidor solo escucha en su propio ordenador (127.0.0.1), asi que no hay nada
abierto hacia fuera.

Tres cosas que no hace, a proposito:

1. **No toca la partida original.** Todo se edita en memoria y se guarda en una
   carpeta nueva de `partidas/editadas/`.
2. **No instala nada en Steam.** Para eso esta `herramientas/instalar-partida.bat`,
   que se niega si Steam esta abierto. Instalar con Steam abierto es la forma de
   perder lo editado.
3. **No se fia de si mismo.** Las opciones que ensena salen de `ievr/opciones.py`,
   pero al aplicarlas vuelve a pasar por `ievr/escribir.py`, que valida por su
   cuenta. Si algo se colase en la lista, alli se para.
"""
import json
import os
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import (basedatos as BD, codec, equipos as EQ, escribir as E, inventario, jugador as J,
                  opciones as O, reglas, stats as ST)

# La raiz del proyecto. Cuando esto corre como programa (.exe, ver lanzador.py)
# el codigo va empaquetado en una carpeta temporal y la raiz de verdad la
# pone el lanzador en IEVR_RAIZ.
RAIZ = os.environ.get("IEVR_RAIZ") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RAIZ, "web")
ICONOS = os.path.join(RAIZ, "datos", "iconos")
EDITADAS = os.path.join(RAIZ, "partidas", "editadas")
NOMBRE_SAVE = E.NOMBRE_SAVE
PUERTO = 8765

_ICONOS_CHR = os.path.join(ICONOS, "data", "dx11", "menu", "200_icon", "10_icon_chr")
CARAS = os.path.join(_ICONOS_CHR, "face")
CUERPOS = os.path.join(_ICONOS_CHR, "uniform")
RECORTES = os.path.join(ICONOS, "recortes")
# Piezas sueltas de interfaz recortadas de las laminas del juego
# (herramientas/recortar_ui.py). Es lo que hace que la pagina se parezca al
# juego de verdad y no a un dibujo hecho a mano.
UI = os.path.join(RAIZ, "datos", "ui")
CARPETA_STEAM = r"F:\steam\userdata\143274881\2799860\remote"   # la de Aaron


def partidas_de_steam():
    """Las partidas del juego que haya en el Steam de este ordenador, la mas
    reciente primero: [(carpeta, nombre, fecha)]. Se mira la carpeta de Steam
    del registro de Windows, las de siempre y la de Aaron (NOTAS O-158)."""
    raices = [CARPETA_STEAM]
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
            raices.append(os.path.join(winreg.QueryValueEx(k, "SteamPath")[0].replace("/", "\\"), "userdata"))
    except Exception:
        pass
    for unidad in "CDEFGH":
        for sub in (r"Program Files (x86)\Steam\userdata", r"Steam\userdata", r"steam\userdata",
                    r"Juegos\Steam\userdata", r"Games\Steam\userdata"):
            raices.append("%s:\\%s" % (unidad, sub))
    vistas, fuera = set(), []
    for raiz in raices:
        candidatas = [raiz] if raiz.endswith("remote") else [
            os.path.join(raiz, u, "2799860", "remote") for u in _listar(raiz)]
        for carpeta in candidatas:
            carpeta = os.path.normpath(carpeta)
            if carpeta.lower() in vistas or not os.path.isdir(carpeta):
                continue
            vistas.add(carpeta.lower())
            for nombre in _listar(carpeta):
                if E.es_partida(nombre):
                    try:
                        fecha = os.path.getmtime(os.path.join(carpeta, nombre))
                    except OSError:
                        continue
                    fuera.append((carpeta, nombre, fecha))
    fuera.sort(key=lambda x: -x[2])
    return fuera


def _listar(carpeta):
    try:
        return os.listdir(carpeta)
    except OSError:
        return []


class Sesion:
    """La partida abierta ahora mismo y lo que se le ha hecho.

    Se guarda la lista entera de estados por los que ha pasado, no solo el
    ultimo: asi deshacer es coger el anterior, sin tener que saber deshacer cada
    operacion por separado. Una partida son 12 MB, asi que el historial se corta
    a los ultimos 20 pasos.
    """

    PASOS = 20

    def __init__(self, origen):
        self.origen = origen
        self.nombre = E.partida_en(origen)
        if not self.nombre:
            raise E.Ilegal("en %s no hay ningun fichero XXXXXXXX-USERDATALIVE" % origen)
        self.plain = codec.load(os.path.join(origen, self.nombre))
        self.historial = []
        self.cambios = []
        self.lock = threading.Lock()

    def aplicar(self, funcion, *args):
        nuevo, info = funcion(self.plain, *args)
        # cualquier cambio de un jugador deja su tabla de pasivas con numero
        # como la dejaria el juego (NOTAS O-166)
        if isinstance(info, dict) and isinstance(info.get("fila"), int):
            nuevo = E.sincronizar_tabla_pasivas(nuevo, info["fila"])
        self.historial.append((self.plain, list(self.cambios)))
        if len(self.historial) > self.PASOS:
            self.historial.pop(0)
        self.plain = nuevo
        self.cambios.append(info)
        return info

    def deshacer(self):
        if not self.historial:
            raise E.Ilegal("no hay nada que deshacer")
        self.plain, self.cambios = self.historial.pop()

    def guardar(self, nombre):
        destino = os.path.join(EDITADAS, nombre)
        E.guardar(self.plain, destino, self.nombre)
        return destino


sesion = None


# --- lo que se le ensena a la pantalla -----------------------------------------

def _nombre_de(clave, f):
    """El nombre del personaje, mirando en las dos tablas.

    `jugadores.csv` solo tiene los que se pueden alinear, o sea los que tienen
    arbol de tecnicas. El avatar de Aaron (Destin Billows) no lo tiene, porque
    va de entrenador o de gerente, asi que salia con su codigo en hexadecimal.
    `personajes.csv` si lo trae.
    """
    nombre = (f or {}).get("nombre")
    if nombre:
        return nombre
    otro = reglas.personajes().get(clave) or {}
    return otro.get("nombre_es") or otro.get("nombre_en") or clave


def _poder(plain, fila, ident, nivel, rareza):
    """La suma de los siete stats. Es lo que se usa para ordenar por "poder".

    No se llama a `stats.de_jugador` porque eso lee campos de la ficha uno a uno
    y con 3.000 jugadores en pantalla se nota. Aqui se usa solo la base, que sale
    de una tabla de 48 filas; las judias y la equipacion se suman al abrir la
    ficha, donde si importa el detalle.
    """
    b = ST.base(ident[fila], nivel[fila], rareza[fila])
    return sum(b["valores"]) if b else 0


def _campos_ficha(plain, fila):
    """{hash: (offset de los datos, longitud)} de todos los campos de la ficha."""
    from ievr import tlv
    fichas = J.ocurrencias(plain, *J.ANCLA_FICHA)
    ini, _ = tlv.inicio_registro(plain, fichas[fila])
    return {fh: (off + 8, n) for off, fh, n, _ in tlv.campos_desde(plain, ini, maximo=20)}


def _estado_de(plain, fila, nivel):
    """Que le falta a ese jugador: judias, heredadas y equipacion.

    Es lo que Aaron mira para decidir a quien terminar, asi que sirve de filtro:
    "ensename los que aun tienen hueco de judias".
    """
    import struct
    fuera = {"judias": "", "heredadas": "", "equipacion": "", "partidos": 0,
             "medalla_valor": 0}
    # Una sola pasada por los campos de la ficha. Antes cada dato la recorria
    # por su cuenta (cuatro veces aqui y tres mas para el rol), y con 3.000
    # filas en la reserva se notaba.
    campos = _campos_ficha(plain, fila)
    try:
        off, n = campos[E.F_PARTIDOS]
        fuera["partidos"] = int.from_bytes(plain[off:off + min(n, 4)], "little")
    except Exception:
        pass
    try:
        off, n = campos[EQ.F_MEDALLA]
        fuera["medalla_valor"] = int.from_bytes(plain[off:off + min(n, 4)], "little")
    except Exception:
        pass
    try:
        tope = E.tope_judias(nivel)
        off_t, _ = campos[J.F_JUDIA_TIPO]
        off_c, _ = campos[J.F_JUDIA_CANT]
        puestas = 0
        for k in range(3):
            t = struct.unpack_from("<H", plain, off_t + 2 * k)[0]
            c = struct.unpack_from("<H", plain, off_c + 2 * k)[0]
            if t < 7 and c >= tope > 0:
                puestas += 1
        fuera["judias"] = ("sin abrir" if tope == 0 else
                           "al maximo" if puestas == 3 else "le faltan")
    except Exception:
        pass
    try:
        off, _ = campos[J.F_HEREDADAS]
        n = sum(1 for k in range(5) if any(plain[off + 4 * k:off + 4 * k + 4]))
        fuera["heredadas"] = "%d de %d" % (n, E.TOPE_HEREDADAS)
    except Exception:
        pass
    try:
        equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
        puesto, _ = J._campos_de(plain, equipos[fila], {h for h, _ in J.RANURAS_EQUIPO})
        llenas = sum(1 for h, _ in J.RANURAS_EQUIPO[:4]
                     if int.from_bytes(puesto.get(h, b""), "little"))
        fuera["equipacion"] = ("completa" if llenas == 4 else
                               "vacia" if llenas == 0 else "%d de 4" % llenas)
    except Exception:
        pass
    return fuera


def _ficha_corta(plain, fila, ident, nivel, rareza, arq, jugadores):
    clave = "%08X" % ident[fila]
    f = jugadores.get(clave)
    estado = _estado_de(plain, fila, nivel[fila])
    return {
        "nivel_grupo": "99" if nivel[fila] >= 99 else
                       "80-98" if nivel[fila] >= 80 else
                       "50-79" if nivel[fila] >= 50 else
                       "1-49",
        "judias": estado["judias"],
        "heredadas": estado["heredadas"],
        "equipacion": estado["equipacion"],
        "fila": fila,
        "nombre": _nombre_de(clave, f),
        "nivel": nivel[fila],
        # numero de serie de adquisicion (0x90F47C83): cuanto mas bajo, antes llego
        "serie": J.array(plain, (0x90F47C83, 24000, "I", 4))[fila],
        "rareza": J.RAREZAS.get(rareza[fila], "?"),
        "rareza_valor": rareza[fila],
        "arquetipo": J.ARQUETIPOS.get(arq[fila], "?"),
        "posicion": (f or {}).get("posicion") or "",
        "elemento": (f or {}).get("elemento") or "",
        "equipo": O.sin_marcadores((f or {}).get("equipo") or ""),
        "cara": O._cara_por_identidad().get(clave, "")
                or ((f or {}).get("string_id") or ""),
        **O.datos_cuerpo("%08X" % ident[fila]),
        "poder": _poder(plain, fila, ident, nivel, rareza),
        "partidos": estado["partidos"],
        # Que es esa persona: jugador, gerente o entrenador. Sale de la medalla
        # que lleve puesta y de su aptitud de fabrica (NOTAS O-132). Va aqui
        # para que la reserva pueda filtrarse por rol y para que los sitios a
        # los que no puede ir salgan tachados antes de pulsar.
        "rol": EQ.medalla_de(plain, fila << 16, estado["medalla_valor"]) or "jugador",
        "aptitudes": sorted(EQ.aptitudes(plain, fila << 16,
                                         medalla=EQ.medalla_de(plain, fila << 16, estado["medalla_valor"]),
                                         partidos=estado["partidos"])),
    }


ORDENES = {
    "nivel": lambda d: (-d["nivel"], d["nombre"].lower()),
    "nombre": lambda d: (d["nombre"].lower(), -d["nivel"]),
    "rareza": lambda d: (-d["rareza_valor"], -d["nivel"], d["nombre"].lower()),
    "equipo": lambda d: (d["equipo"].lower(), d["nombre"].lower()),
    "fila": lambda d: d["fila"],
    "poder": lambda d: (-d.get("poder", 0), d["nombre"].lower()),
    # el numero de serie de adquisicion: el orden en que fueron llegando
    "llegada": lambda d: (d.get("serie", 0), d["fila"]),
}


def listar_carpetas(ruta):
    """Que hay dentro de una carpeta, para poder elegir la partida a mano.

    Se ensenan solo carpetas y el fichero de partida, que es lo unico que se
    puede abrir. Y se dice de cada carpeta si tiene una partida dentro, para no
    tener que entrar a mirar.
    """
    ruta = os.path.abspath(ruta or RAIZ)
    if not os.path.isdir(ruta):
        raise E.Ilegal("no existe la carpeta %s" % ruta)
    carpetas = []
    try:
        for n in sorted(os.listdir(ruta)):
            completa = os.path.join(ruta, n)
            if os.path.isdir(completa):
                tiene = bool(E.partida_en(completa))
                carpetas.append({"nombre": n, "ruta": completa, "partida": tiene})
    except PermissionError:
        raise E.Ilegal("no tengo permiso para mirar dentro de %s" % ruta)
    padre = os.path.dirname(ruta)
    return {"ruta": ruta,
            "padre": padre if padre and padre != ruta else None,
            "partida_aqui": bool(E.partida_en(ruta)),
            "carpetas": carpetas,
            "atajos": [
                {"nombre": "Partidas del proyecto", "ruta": os.path.join(RAIZ, "partidas")},
                {"nombre": "Rondas guardadas", "ruta": os.path.join(RAIZ, "partidas", "rondas")},
                {"nombre": "Editadas", "ruta": EDITADAS},
                {"nombre": "Carpeta de Steam", "ruta": CARPETA_STEAM},
            ]}


def _quien_es(plain, slot, ident, nivel, rareza, per):
    """Quien es el jugador de ese slot, para las pantallas de equipo."""
    if not slot:
        return None
    fila = slot >> 16
    if fila >= 6000 or not ident[fila]:
        return {"slot": slot, "fila": fila, "nombre": "(hueco roto)", "cara": ""}
    clave = "%08X" % ident[fila]
    f = O._por_identidad().get(clave) or {}
    return {"slot": slot, "fila": fila,
            "nombre": _nombre_de(clave, f),
            "nivel": nivel[fila], "rareza_valor": rareza[fila],
            "rareza": J.RAREZAS.get(rareza[fila], ""),
            "posicion": f.get("posicion") or "",
            "elemento": f.get("elemento") or "",
            "partidos": EQ._partidos_de(plain, slot) or 0,
            "rol": EQ.medalla_de(plain, slot) or "jugador",
            "aptitudes": sorted(EQ.aptitudes(plain, slot)),
            "cara": O._cara_por_identidad().get(clave, "") or (f.get("string_id") or ""),
            **O.datos_cuerpo(clave)}


def _pasivas_de_personal(rol, rareza, arq, identidad_hex):
    """Lo que ensena el juego en "Pasivas de equipo" a un gerente o entrenador:
    otra lista, que no es la del jugador (NOTAS O-163, O-164).

    - Diamante: el juego de clave 100 de su arquetipo.
    - Gerente o entrenador **de fabrica** (llega del juego ya con la medalla):
      el juego de su arquetipo con la clave del personaje (col 6 de chara_param).
    - Un jugador normal convertido con la medalla: empieza sin pasivas de
      personal y se le dan en el juego con objetos (Aaron); donde se guardan
      esas, todavia no se sabe.
    """
    ahora = (rol or {}).get("ahora")
    if ahora not in ("gerente", "entrenador"):
        return None
    if 5 <= rareza <= 7:
        return None
    if arq not in J.ARQUETIPOS:
        return {"rol": ahora, "motivo": "dependen del arquetipo que se le elija dentro del juego"}
    clave = 100 if rareza == 8 else O.clave_personal(identidad_hex)
    de_fabrica = (rol or {}).get("de_fabrica") == ahora
    if rareza != 8 and not de_fabrica:
        return {"rol": ahora, "motivo": "empiezan vacias: un jugador convertido con la medalla "
                                        "las recibe en el juego con objetos"}
    lista = O.pasivas_personal(ahora, arq, clave) if clave else []
    if not lista:
        return {"rol": ahora, "motivo": "no estan en las tablas del juego para este personaje"}
    iconos = O.iconos_de_pasiva()
    return {"rol": ahora, "clave": clave,
            "lista": [{"ranura": k + 1, "texto": O.nombre_pasiva(O.variante_por_rareza(pid, rareza)),
                       "icono200": iconos.get(pid, "")} for k, pid in enumerate(lista)]}


def _version_instalada():
    """La version de Pizarra (version.txt), para que se vea en la portada y se
    sepa con cual se ha probado algo."""
    try:
        with open(os.path.join(RAIZ, "version.txt"), encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def _rol_de_la_ficha(plain, fila):
    """Que es esa persona y a que puede cambiar, para los botones de la ficha.

    Convertir a alguien en gerente o entrenador es **equiparle una medalla** en
    la tabla de habilidades, igual que en el juego (NOTAS O-132).
    """
    slot = fila << 16
    try:
        ahora = EQ.medalla_de(plain, slot) or "jugador"
    except Exception:
        return None
    f = EQ._ficha_de(plain, slot)
    nombre = f.get("nombre_es") or f.get("nombre_en") or ""
    partidos = EQ._partidos_de(plain, slot) or 0
    rareza = J.array(plain, J.ARRAY_RAREZA)[fila]
    opciones = []
    for cual in ("jugador", "gerente", "entrenador"):
        if cual == ahora:
            continue
        de_fabrica = (bool(f.get("apt_entrenador")) if cual == "entrenador" else
                      bool(f.get("apt_gerente")) if cual == "gerente" else
                      not (f.get("apt_entrenador") or f.get("apt_gerente")))
        falta = ""
        if cual == "jugador" and nombre == EQ.NOMBRE_SOLO_STAFF:
            falta = ("%s es el protagonista de la historia: solo puede ser gerente "
                     "o entrenador." % nombre)
        elif cual != "jugador" and 5 <= rareza <= 7:
            # regla del juego que confirmo Aaron: un Idolo no se sienta en el
            # cuerpo tecnico (NOTAS O-163)
            falta = "Un Idolo no puede ser gerente ni entrenador: el juego no lo deja."
        elif not de_fabrica:
            hacen = (EQ.PARTIDOS_PARA_JUGADOR if cual == "jugador"
                     else EQ.PARTIDOS_PARA_STAFF)
            if partidos < hacen:
                falta = ("Hacen falta %d partidos jugados y lleva %d." % (hacen, partidos))
        opciones.append({"valor": cual, "puede": not falta, "motivo": falta,
                         "de_fabrica": de_fabrica})
    return {"ahora": ahora, "opciones": opciones,
            "de_fabrica": ("entrenador" if f.get("apt_entrenador")
                           else "gerente" if f.get("apt_gerente") else "jugador")}


def detalle_equipo(plain, i):
    """Un equipo con todo resuelto: quien juega donde, tacticas, escudo..."""
    e = EQ.leer(plain, i)
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    per = reglas.personajes()

    nombres_tac = {}
    for f in reglas._tabla("nombres-es.csv"):
        if f.get("categoria") == "tactica":
            nombres_tac[f["id"].upper()] = O._limpio(f.get("nombre_es") or f.get("nombre_en"))
    tacticas = []
    for k, v in enumerate(e["tacticas"][:3], 1):
        # el id se ensena como el entero en hexadecimal, igual que el escudo y
        # la formacion. Antes las tacticas iban al reves y el desplegable no
        # reconocia la que estaba puesta.
        idh = "%08X" % v if v else ""
        tacticas.append({"ranura": k, "id": idh,
                         "icono": (_icono_de_valor("tactica", idh)
                                   or _icono_de_valor("supertactica", idh)) if v else "",
                         "nombre": (_nombre_de_valor(plain, "tactica", idh)
                                    or _nombre_de_valor(plain, "supertactica", idh)) if v else ""})

    miembros = []
    for k, m in enumerate(e["miembros"]):
        q = _quien_es(plain, m["jugador"], ident, nivel, rareza, per)
        sitio = ("campo" if m["puesto"] < EQ.EN_EL_CAMPO else
                 "staff" if m["puesto"] >= EQ.PUESTO_STAFF else "banquillo")
        rol = EQ.nombre_de_puesto(m["puesto"])
        miembros.append({"hueco": k, "puesto": m["puesto"], "dorsal": m["dorsal"],
                         "sitio": sitio, "rol": rol, "jugador": q,
                         # si ya esta puesto donde no deberia, se dice
                         "problema": EQ.por_que_no_puede(plain, m["jugador"], m["puesto"]),
                         "capitan": bool(m["jugador"]) and m["jugador"] == e["capitan"]})
    idolos, diamantes = EQ.cuantos_caben(plain, e)
    entre = None
    if e["entrenador"]:
        f = O._por_identidad().get("%08X" % e["entrenador"]) or {}
        entre = {"identidad": "%08X" % e["entrenador"],
                 "nombre": _nombre_de("%08X" % e["entrenador"], f),
                 "cara": O._cara_por_identidad().get("%08X" % e["entrenador"], "")}
    return {"hueco": i, "nombre": O.sin_marcadores(e["nombre"]),
            "nombre_crudo": e["nombre"], "de_la_historia": e["de_la_historia"],
            "formacion": "%08X" % e["formacion"], "escudo": "%08X" % e["escudo"],
            "equipacion": "%08X" % e["equipacion"], "entrenador": entre,
            "escudo_icono": _icono_de_valor("escudo", "%08X" % e["escudo"]),
            "equipacion_icono": _icono_de_valor("equipacion", "%08X" % e["equipacion"]),
            "formacion_nombre": _nombre_de_valor(plain, "formacion", "%08X" % e["formacion"]),
            "formacion_puestos": _puestos_de_formacion("%08X" % e["formacion"]),
            "escudo_nombre": _nombre_de_valor(plain, "escudo", "%08X" % e["escudo"]),
            "equipacion_nombre": _nombre_de_valor(plain, "equipacion", "%08X" % e["equipacion"]),
            "tacticas": tacticas, "miembros": miembros,
            "idolos": idolos, "diamantes": diamantes,
            "tope_idolos": EQ.TOPE_IDOLOS, "tope_diamantes": EQ.TOPE_DIAMANTES,
            "partidos_staff": EQ.PARTIDOS_PARA_STAFF,
            "partidos_jugador": EQ.PARTIDOS_PARA_JUGADOR,
            "solo_staff": EQ.NOMBRE_SOLO_STAFF,
            "puesto_entrenador": EQ.PUESTO_ENTRENADOR,
            "puestos_gerente": list(EQ.GERENTES),
            "tacticas_que_tienes": _tacticas_que_tienes(plain, nombres_tac),
            # solo las formaciones que un equipo puede llevar de verdad (las
            # "B-" son de equipos de la historia; Aaron pidio quitarlas)
            "formaciones": [f for f in _valores_vistos(plain, "formacion")
                            if _formacion_legal(f["valor"])],
            "escudos": _valores_vistos(plain, "escudo"),
            "equipaciones": _valores_vistos(plain, "equipacion")}


def pasivas_de_equipo(plain, i):
    """Las pasivas de los miembros de un equipo, sumadas como las ensena el juego.

    Es la pantalla "Bonificaciones de equipo > Pasivas de equipo": cada texto de
    pasiva una vez, con la suma de lo que aporta cada jugador que la lleva. La
    heredada tapa a la normal de su ranura, igual que en la ficha (NOTAS O-145).
    """
    e = EQ.leer(plain, i)
    valores = {f["id"].upper(): f for f in reglas._tabla("pasivas-valor.csv")}
    iconos = O.iconos_de_pasiva()
    identidades = J.array(plain, J.ARRAY_IDENTIDAD)
    arquetipos = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    rarezas = J.array(plain, J.ARRAY_RAREZA)
    grupos = {}
    for m in e["miembros"]:
        if not m["jugador"]:
            continue
        fila = m["jugador"] >> 16
        try:
            off, _ = E._campo(plain, fila, J.F_PASIVAS)
            offh, _ = E._campo(plain, fila, J.F_HEREDADAS)
        except E.Ilegal:
            continue
        quien = EQ._nombre_de_slot(plain, m["jugador"]) or "fila %d" % fila
        # lo que ensena el juego: la tabla de pasivas con numero (O-166); si no
        # esta, se reconstruye desde la ficha
        tabla = J.tabla_pasivas(plain, fila)
        if not any(x["id"] != "00000000" for x in tabla):
            tabla = []
        # las fijas de un Idolo o Diamante nativo (campo a cero): las del tablero
        fijas = []
        if not tabla and not any(plain[off:off + 20]):
            fijas = O.pasivas_fijas("%08X" % identidades[fila], _rama_abierta(plain, fila).get("cual", 1),
                                    arquetipos[fila])
        for k in range(5):
            idh = plain[offh + 4 * k:offh + 4 * k + 4].hex().upper()
            idn = plain[off + 4 * k:off + 4 * k + 4].hex().upper()
            if idn == "00000000" and k < len(fijas):
                idn = fijas[k]
            pid = idh if idh != "00000000" else idn
            valor_tabla = None
            if tabla:
                pid, valor_tabla = tabla[k]["id"], tabla[k]["valor"]
            else:
                # la version de su rareza, que es la que cuenta el juego (O-165)
                pid = O.variante_por_rareza(pid, rarezas[fila])
            f = valores.get(pid)
            if not f:
                continue
            clave = f["texto"]
            g = grupos.setdefault(clave, {"texto": f["texto"], "familia": f["familia"],
                                         "icono": iconos.get(pid, ""), "valor": 0.0,
                                         "cuantos": 0, "quienes": [],
                                         "sitio": []})
            try:
                v = float(f["valor"]) if valor_tabla is None else float(valor_tabla)
            except ValueError:
                v = 0.0
            g["valor"] += v
            g["cuantos"] += 1
            g["quienes"].append("%s (%s)" % (quien, EQ.nombre_de_puesto(m["puesto"])))
    fuera = []
    for g in grupos.values():
        g["valor"] = round(g["valor"], 2)
        g["texto_con_valor"] = g["texto"].replace("<VALUE>", ("%g" % g["valor"]))
        fuera.append(g)
    fuera.sort(key=lambda x: (x["familia"], -x["valor"]))
    return {"equipo": O.sin_marcadores(e["nombre"]), "pasivas": fuera}


def _tacticas_que_tienes(plain, nombres_tac):
    """Las tacticas que hay en su mochila, con su nombre y su dibujo."""
    tengo = EQ.catalogo(plain, "tactica") + EQ.catalogo(plain, "supertactica")
    return [{"id": t["valor"], "nombre": t["nombre"], "icono": t.get("icono") or ""}
            for t in tengo]


def _valores_vistos(plain, cual):
    """Lo que se puede poner de formacion, escudo o equipacion.

    Se ofrece **lo que tiene en la mochila**, que es lo que el juego deja poner.
    Si de algo no hubiera nada en la mochila se cae a los valores que ya usan sus
    equipos, que tambien son legales seguro.
    """
    tengo = EQ.catalogo(plain, cual)
    if tengo:
        return tengo
    nombres = EQ.nombres_puestos()
    vistos = {}
    for e in EQ.todos(plain, solo_con_nombre=False):
        try:
            d = EQ.leer(plain, e["hueco"])
        except EQ.Ilegal:
            continue
        v = d.get(cual) or 0
        if v:
            vistos.setdefault("%08X" % v, []).append(d["nombre"] or "hueco %d" % e["hueco"])
    return [{"valor": k, "nombre": nombres.get((cual, k), "") or "sin nombre",
             "cuantos": len(v)} for k, v in sorted(vistos.items())]


def _icono_de_valor(cual, valor_hex):
    """La imagen de ese escudo, equipacion o tactica, si la hay."""
    al_reves = EQ._al_reves(valor_hex)
    propios = EQ._iconos_por_objeto()
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] == cual and f["valor_equipo"].upper() in (valor_hex, al_reves):
            # primero el dibujo que sale en la mochila (la lamina de objetos),
            # que es el que Aaron quiere ver; el render del uniforme, de respaldo
            return propios.get(f["id_objeto"].upper(), "") or f.get("icono")
    return ""


def _puestos_de_formacion(valor_hex):
    """Donde va cada puesto (0-10) en esa formacion, del propio juego
    (`formaciones.csv`, NOTAS O-160): [{puesto, posicion, x, y}] o []."""
    def construir():
        d = {}
        for f in reglas._tabla("formaciones.csv"):
            d.setdefault(f["id"].upper(), []).append({
                "puesto": int(f["puesto"]), "posicion": f["posicion"],
                "x": float(f["x"]), "y": float(f["y"]), "pase": int(f["pase"] or 0),
                "px": float(f["px"]) if f.get("px") else None,
                "py": float(f["py"]) if f.get("py") else None,
                "legal": f.get("legal") == "1"})
        return d
    tabla = O._indice("formaciones", construir)
    # el equipo guarda el "valor_equipo"; la tabla va por el id del objeto
    al_reves = EQ._al_reves(valor_hex)
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] == "formacion" and f["valor_equipo"].upper() in (valor_hex.upper(), al_reves.upper()):
            valor_hex = f["id_objeto"]
            break
    return tabla.get(valor_hex.upper()) or tabla.get(EQ._al_reves(valor_hex).upper()) or []


def _formacion_legal(valor_hex):
    """Si esa formacion la puede llevar un equipo (las de 11 puestos que se
    ven en el juego; las "B-" de la historia, no)."""
    puestos = _puestos_de_formacion(valor_hex)
    return bool(puestos) and all(p["legal"] for p in puestos)


def _nombre_de_valor(plain, cual, valor_hex):
    """Como se llama ese escudo / equipacion / formacion / tactica."""
    dicho = EQ.nombres_puestos().get((cual, valor_hex))
    if dicho:
        return dicho
    al_reves = EQ._al_reves(valor_hex)
    espanol = {f["id"].upper(): O._limpio(f.get("nombre_es") or f.get("nombre_en"))
               for f in reglas._tabla("nombres-es.csv")}
    for f in reglas._tabla("equipo-objetos.csv"):
        if f["tipo"] != cual:
            continue
        if f["valor_equipo"].upper() in (valor_hex, al_reves):
            return (espanol.get(f["id_objeto"].upper())
                    or O._limpio(f.get("nombre") or ""))
    return ""


def listar_jugadores(plain, texto="", filtros=None, orden="nivel",
                     desde=0, cuantos=120, sentido="asc"):
    """La plantilla, filtrada y por paginas.

    Devuelve tambien **de que se puede filtrar y cuantos hay de cada cosa**,
    contados sobre la plantilla de verdad y no sobre una lista escrita a mano:
    si Aaron no tiene ningun jugador de Viento, "Viento" no sale como opcion.
    """
    filtros = filtros or {}
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    arq = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    jugadores = O._por_identidad()
    texto = (texto or "").strip().lower()

    todos = []
    for i in range(min(6000, len(ident))):
        if ident[i]:
            todos.append(_ficha_corta(plain, i, ident, nivel, rareza, arq, jugadores))

    import collections
    cuentas = {c: collections.Counter() for c in
               ("elemento", "posicion", "rareza", "arquetipo", "equipo",
                "nivel_grupo", "judias", "heredadas", "equipacion", "rol", "cuerpo_tipo")}
    for d in todos:
        for c in cuentas:
            if d.get(c):
                cuentas[c][d[c]] += 1

    def pasa(d):
        if texto and texto not in (d["nombre"] + " " + d["equipo"] + " "
                                   + d["posicion"] + " " + d["elemento"]).lower():
            return False
        for campo, valor in filtros.items():
            if valor and d.get(campo) != valor:
                return False
        return True

    filtrados = [d for d in todos if pasa(d)]
    filtrados.sort(key=ORDENES.get(orden, ORDENES["nivel"]))
    if sentido == "desc":
        filtrados.reverse()
    trozo = filtrados[desde:desde + cuantos] if cuantos else filtrados[desde:]
    return {
        "total": len(todos), "encajan": len(filtrados), "desde": desde,
        "jugadores": trozo,
        "filtros": {c: [{"valor": v, "cuantos": n}
                        for v, n in sorted(cuentas[c].items(),
                                           key=lambda x: (-x[1], x[0]))]
                    for c in cuentas},
        "ordenes": sorted(ORDENES),
    }


def _sin_opciones(d):
    """La misma informacion pero sin la lista larga: solo cuantas hay.

    Un jugador con nueve ranuras de tecnica, algunas LIBRE, arrastra casi 900
    opciones por ranura. Mandarlas todas de golpe son 400 KB por ficha, y el 99 %
    no se mira nunca. Se piden cuando se abre el desplegable.
    """
    return {k: (len(v) if k == "opciones" else v) for k, v in d.items()}


def arbol_admite(base, ranura):
    """Que categoria admite esa ranura del arbol, segun el personaje."""
    v = (base or {}).get("r%d_tipo" % ranura)
    return None if v in (None, "", "?") else v


def _rama_abierta(plain, fila):
    """Que rama del arbol de habilidades tiene abierta ese jugador.

    El campo de 60 bytes `0xBB459017` lleva un 1 por casilla cogida, y solo se
    usan los indices 0 a 39: del 0 al 17 el tronco, del 18 al 27 una rama y del
    28 al 39 la otra (NOTAS O-111).
    """
    try:
        off, n = E._campo(plain, fila, J.F_TABLERO)
        offr, _ = E._campo(plain, fila, J.F_RAMA)
    except E.Ilegal:
        return {"cual": 0, "tronco": 0, "rama": 0, "casillas": 0, "elegida": False}
    import struct
    b = plain[off:off + n]
    cual = struct.unpack_from("<I", plain, offr)[0]
    corta = lambda t: sum(1 for x in b[t[0]:t[1]] if x)
    tronco = corta(J.TRAMO_TRONCO)
    r1, r2 = corta(J.TRAMO_RAMA1), corta(J.TRAMO_RAMA2)
    extra = corta(J.TRAMO_EXTRA)
    return {"cual": cual + 1, "tronco": tronco, "rama1": r1, "rama2": r2,
            "extra": extra, "casillas": tronco + r1 + r2 + extra,
            "elegida": bool(r1 or r2)}


def detalle_jugador(plain, fila):
    ident = J.array(plain, J.ARRAY_IDENTIDAD)
    if fila >= min(6000, len(ident)) or not ident[fila]:
        raise E.Ilegal("en la fila %d no hay ningun jugador" % fila)
    nivel = J.array(plain, J.ARRAY_NIVEL)
    rareza = J.array(plain, J.ARRAY_RAREZA)
    arq = J.array(plain, (J.F_ARQUETIPO, 6000, "B", 1))
    base = O._por_identidad().get("%08X" % ident[fila]) or {}

    porslot = inventario.por_slot(plain)
    todos = {}
    for cat, filas in O._nombres_por_categoria().items():
        for f in filas:
            todos.setdefault(f["id"].upper(), O._limpio(f.get("nombre_es") or f.get("nombre_en")))
    for f in reglas._tabla("tecnicas.csv"):
        todos.setdefault(f["id"].upper(), O._limpio(f.get("nombre")))

    def nombre_de_ref(valor):
        f = porslot.get(valor) if valor else None
        return todos.get((f or {}).get("id", ""), "") if f else ""

    propios = O._iconos_de_objeto()
    portec = {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")}

    def id_de_ref(valor):
        f = porslot.get(valor) if valor else None
        return ((f or {}).get("id", "") or "").upper() if f else ""

    equipos = J.ocurrencias(plain, *J.ANCLA_EQUIPO)
    eq, _ = J._campos_de(plain, equipos[fila], {h for h, _ in J.RANURAS_EQUIPO})
    equipacion = []
    for k, (h, etiqueta) in enumerate(J.RANURAS_EQUIPO[:4], 1):
        v = int.from_bytes(eq.get(h, b""), "little")
        idh = id_de_ref(v)
        equipacion.append({"ranura": k, "etiqueta": etiqueta,
                           "puesto": nombre_de_ref(v),
                           "icono200": propios.get(idh, "")})

    tecnicas = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    tc, _ = J._campos_de(plain, tecnicas[fila], set(J.RANURAS_TECNICAS))
    # El arbol se parte en dos ramas y solo se juega una (NOTAS O-111): las
    # ranuras 1-3 son del tronco y luego van dos grupos de tres con los mismos
    # niveles. Cual esta abierta se lee del mapa de casillas de la partida.
    rama = _rama_abierta(plain, fila)
    arbol = []
    for k, h in enumerate(J.RANURAS_TECNICAS, 1):
        v = int.from_bytes(tc.get(h, b""), "little")
        trozo = "tronco" if k <= 3 else ("rama 1" if k <= 6 else "rama 2")
        idh = id_de_ref(v)
        tec = portec.get(idh) or {}
        esp = O._espiritus().get(idh) or {}
        arbol.append({"ranura": k, "admite": arbol_admite(base, k),
                      "trozo": trozo, "puesta": nombre_de_ref(v),
                      # el tipo de lo que hay puesto, para el icono del juego
                      "tipo": tec.get("categoria") or ("Hipertecnica" if esp else ""),
                      "elemento": tec.get("elemento") or "",
                      "poder": int(tec.get("poder") or 0),
                      "tp": int(tec.get("tp") or 0),
                      "icono": esp.get("icono") or "",
                      "abierta": trozo == "tronco" or
                                 trozo == "rama %d" % rama.get("cual", 1)})

    off, _ = E._campo(plain, fila, J.F_PASIVAS)
    offh, _ = E._campo(plain, fila, J.F_HEREDADAS)
    # Un Idolo o Diamante nativo lleva el campo a cero y el juego ensena las de
    # su tablero (NOTAS O-162): aqui se ensenan esas mismas
    fijas = O.pasivas_fijas("%08X" % ident[fila], rama.get("cual", 1), arq[fila])
    if fijas and not any(plain[off:off + 20]):
        fijas = fijas + [""] * 5
    else:
        fijas = []
    # Lo que ensena el juego de verdad: la tabla de pasivas con numero (O-166).
    # Si la partida no la tuviera, se reconstruye desde la ficha como antes.
    tabla = J.tabla_pasivas(plain, fila)
    if not any(x["id"] != "00000000" for x in tabla):
        tabla = []
    pasivas = []
    for k in range(5):
        idn = plain[off + 4 * k:off + 4 * k + 4].hex().upper()
        if idn == "00000000" and fijas and fijas[k]:
            idn = fijas[k]
        idh = plain[offh + 4 * k:offh + 4 * k + 4].hex().upper()
        iconos_p = O.iconos_de_pasiva()
        if tabla:
            t = tabla[k]
            visible = O.texto_con_valor(t["id"], t["valor"]) if t["id"] != "00000000" else ""
            pasivas.append({"ranura": k + 1, "fija": bool(fijas), "marca": t["marca"],
                            "normal": visible if idh == "00000000" else O.nombre_pasiva(O.variante_por_rareza(idn, rareza[fila]), todos.get(idn, "")),
                            "heredada": visible if idh != "00000000" else "",
                            "icono200": iconos_p.get(t["id"] if t["id"] != "00000000" else (idh if idh != "00000000" else idn), "")})
            continue
        pasivas.append({"ranura": k + 1, "fija": bool(fijas),
                        # con su numero puesto: cada version por rareza es un id (O-46)
                        # con el numero que ensena el juego para su rareza (O-165)
                        "normal": O.nombre_pasiva(O.variante_por_rareza(idn, rareza[fila]), todos.get(idn, "")) if idn != "00000000" else "",
                        "heredada": O.nombre_pasiva(O.variante_por_rareza(idh, rareza[fila]), todos.get(idh, "")) if idh != "00000000" else "",
                        # el dibujo de la que se ve (la heredada tapa a la normal)
                        "icono200": iconos_p.get(idh if idh != "00000000" else idn, "")})

    offt, _ = E._campo(plain, fila, J.F_JUDIA_TIPO)
    offc, _ = E._campo(plain, fila, J.F_JUDIA_CANT)
    import struct
    judias = []
    for ranura in (1, 2, 3):
        k = 3 - ranura
        tipo = struct.unpack_from("<H", plain, offt + 2 * k)[0]
        cant = struct.unpack_from("<H", plain, offc + 2 * k)[0]
        judias.append({"ranura": ranura,
                       "tipo": "" if tipo == 0xFFFF else J.JUDIAS.get(tipo, str(tipo)),
                       "cantidad": cant, **O.judias(plain, fila, ranura)})
        # las judias son solo seis tipos: esas si caben enteras

    offp, _ = E._campo(plain, fila, E.F_PARTIDOS)
    rol = _rol_de_la_ficha(plain, fila)
    return {
        "fila": fila,
        "nombre": _nombre_de("%08X" % ident[fila], base),
        "cara": O._cara_por_identidad().get("%08X" % ident[fila], "")
                or (base.get("string_id") or ""),
        **O.datos_cuerpo("%08X" % ident[fila]),
        "posicion": base.get("posicion") or "", "elemento": base.get("elemento") or "",
        "equipo": O.sin_marcadores(base.get("equipo") or ""),
        "descripcion": O.sin_marcadores(
            O._descripcion_por_identidad().get("%08X" % ident[fila], "")),
        "nivel": nivel[fila], "niveles": O.niveles(),
        "rareza": J.RAREZAS.get(rareza[fila], "?"), "rareza_valor": rareza[fila],
        "rarezas": O.rarezas(plain, fila),
        # El arquetipo: un normal lo cambia aqui; un Idolo lo trae de fabrica; un
        # Diamante lo elige dentro del juego (NOTAS O-163)
        "arquetipo": (J.ARQUETIPOS.get(E._arquetipo_diamante(plain, fila), "sin elegir") if rareza[fila] == 8
                      else J.ARQUETIPOS.get(arq[fila], "?")),
        "arquetipos": O.arquetipos() if rareza[fila] < 5 or rareza[fila] == 8 else [],
        "arquetipo_motivo": "viene fijo de fabrica" if 5 <= rareza[fila] <= 7 else "",
        # si la tabla ya trae lo que ensena el juego, no hace falta la lista aparte
        "pasivas_personal": None if tabla else _pasivas_de_personal(
            rol, rareza[fila], E._arquetipo_diamante(plain, fila) if rareza[fila] == 8 else arq[fila],
            "%08X" % ident[fila]),
        "partidos": struct.unpack_from("<H", plain, offp)[0], "partidos_limites": O.partidos(),
        "rol": rol,
        "equipos": E.equipos_del_jugador(plain, fila),
        "pasivas_bloqueadas": rareza[fila] >= 5,
        "motivo_pasivas": (("fija: la pone el juego desde su tablero" if fijas
                            else "son fijas y las pone el juego")
                           if rareza[fila] >= 5 else ""),
        "stats": ST.de_jugador(plain, fila),
        "equipacion": equipacion, "rama": rama, "tecnicas": arbol, "pasivas": pasivas,
        "judias": judias, "heredadas": _sin_opciones(O.heredadas(plain, fila)),
    }


# --- el servidor ----------------------------------------------------------------

class Manejador(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _responder(self, codigo, cuerpo, tipo="application/json; charset=utf-8"):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        elif isinstance(cuerpo, str):
            cuerpo = cuerpo.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _fichero(self, ruta, tipo):
        try:
            with open(ruta, "rb") as fh:
                datos = fh.read()
        except OSError:
            return self._responder(404, {"error": "no encuentro %s" % os.path.basename(ruta)})
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        # Sin cache: si no, el navegador se queda con la pantalla vieja y parece
        # que los arreglos no han entrado.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            # El menu de inicio, y desde el las tres pantallas: el editor, la
            # base de datos del juego y la calculadora de poder.
            if u.path in ("/", "/index.html", "/inicio"):
                return self._fichero(os.path.join(WEB, "inicio.html"), "text/html; charset=utf-8")
            if u.path in ("/editor", "/editor.html"):
                return self._fichero(os.path.join(WEB, "editor.html"), "text/html; charset=utf-8")
            if u.path in ("/bd", "/basedatos", "/basedatos.html"):
                return self._fichero(os.path.join(WEB, "basedatos.html"), "text/html; charset=utf-8")
            if u.path in ("/calc", "/calculadora", "/calculadora.html"):
                return self._fichero(os.path.join(WEB, "calculadora.html"), "text/html; charset=utf-8")
            if u.path.startswith("/web/"):
                nombre = os.path.basename(unquote(u.path[5:]))
                tipo = {"css": "text/css; charset=utf-8", "js": "text/javascript; charset=utf-8",
                        "html": "text/html; charset=utf-8"}.get(nombre.rsplit(".", 1)[-1], "text/plain")
                return self._fichero(os.path.join(WEB, nombre), tipo)
            # --- la base de datos del juego: no toca la partida ---
            if u.path == "/api/bd/personajes":
                return self._responder(200, {"personajes": BD.personajes()})
            if u.path.startswith("/api/bd/personaje/"):
                f = BD.personaje(os.path.basename(u.path))
                if not f:
                    return self._responder(404, {"error": "no conozco ese personaje"})
                return self._responder(200, f)
            if u.path == "/api/bd/tecnicas":
                return self._responder(200, {"tecnicas": BD.tecnicas()})
            if u.path == "/api/bd/espiritus":
                return self._responder(200, {"espiritus": BD.espiritus()})
            if u.path == "/api/bd/pasivas":
                return self._responder(200, {"pasivas": BD.pasivas()})
            if u.path == "/api/bd/objetos":
                return self._responder(200, {"objetos": BD.objetos()})
            if u.path.startswith("/api/bd/stats/"):
                # los siete stats base de un personaje a cualquier nivel y
                # rareza, para la calculadora (interpolados como en el editor)
                ident = os.path.basename(u.path)
                nivel = int((q.get("nivel") or ["99"])[0])
                rareza = int((q.get("rareza") or ["0"])[0])
                b = ST.base(int(ident, 16), nivel, rareza)
                if not b:
                    return self._responder(404, {"error": "no tengo los stats base de ese personaje"})
                return self._responder(200, {"base": b["valores"], "exacto": b["exacto"],
                                             "multiplicador": b["multiplicador"],
                                             "nombres": ST.NOMBRES})
            if u.path.startswith("/cara/"):
                nombre = os.path.basename(unquote(u.path[6:]))
                return self._fichero(os.path.join(CARAS, nombre + "_l.png"), "image/png")
            if u.path.startswith("/categoria/"):
                n = os.path.basename(unquote(u.path[11:]))
                return self._fichero(os.path.join(RECORTES, "categoria", n + ".png"),
                                     "image/png")
            if u.path.startswith("/icono/"):
                # imagenes sueltas de 200_icon (escudos, equipaciones...)
                partes = [x for x in unquote(u.path[7:]).split("/") if x
                          and x not in (".", "..")]
                if not partes:
                    return self._responder(404, {"error": "ruta de icono rara"})
                # Primero se busca entre las imagenes sueltas del juego y, si no
                # esta, entre los recortes de las laminas (NOTAS O-137).
                suelta = os.path.join(ICONOS, "data", "dx11", "menu",
                                      "200_icon", *partes)
                if not os.path.isfile(suelta):
                    suelta = os.path.join(RECORTES, "laminas", *partes)
                return self._fichero(suelta, "image/png")
            if u.path.startswith("/espiritu/"):
                # la ruta trae carpeta/fichero; se limpia a mano para que no se
                # pueda pedir nada de fuera de la carpeta de iconos
                partes = [p for p in unquote(u.path[10:]).split("/") if p
                          and p not in (".", "..")]
                if len(partes) != 2:
                    return self._responder(404, {"error": "ruta de espiritu rara"})
                return self._fichero(os.path.join(_ICONOS_CHR, *partes), "image/png")
            if u.path.startswith("/ui/"):
                n = os.path.basename(unquote(u.path[4:]))
                return self._fichero(os.path.join(UI, n + ".png"), "image/png")
            if u.path == "/fondo/trama":
                return self._fichero(os.path.join(RECORTES, "fondo", "trama.png"),
                                     "image/png")
            if u.path == "/api/carpetas":
                return self._responder(200, listar_carpetas((q.get("ruta") or [""])[0]))
            if u.path.startswith("/elemento/"):
                n = os.path.basename(unquote(u.path[10:])).replace("ñ", "n")
                return self._fichero(os.path.join(RECORTES, "elemento", n + ".png"),
                                     "image/png")
            if u.path.startswith("/rareza/"):
                n = os.path.basename(unquote(u.path[8:]))
                return self._fichero(os.path.join(RECORTES, "rareza", n + ".png"),
                                     "image/png")
            if u.path.startswith("/cuerpo/"):
                nombre = os.path.basename(unquote(u.path[8:]))
                ruta = os.path.join(CUERPOS, nombre + "_l.png")
                if not os.path.isfile(ruta):           # nombre viejo, sin variante
                    ruta = os.path.join(CUERPOS, nombre + "_00_l.png")
                return self._fichero(ruta, "image/png")
            if u.path == "/api/estado":
                with sesion.lock:
                    return self._responder(200, {
                        "origen": sesion.origen,
                        "cambios": sesion.cambios,
                        "puede_deshacer": bool(sesion.historial),
                        "version": _version_instalada()})
            if u.path == "/api/jugadores":
                filtros = {c: (q.get(c) or [""])[0]
                           for c in ("elemento", "posicion", "rareza",
                                     "arquetipo", "equipo", "nivel_grupo",
                                     "judias", "heredadas", "equipacion", "rol",
                                     "cuerpo_tipo")}
                with sesion.lock:
                    return self._responder(200, listar_jugadores(
                        sesion.plain, (q.get("q") or [""])[0], filtros,
                        (q.get("orden") or ["nivel"])[0],
                        int((q.get("desde") or ["0"])[0]),
                        int((q.get("cuantos") or ["120"])[0]),
                        (q.get("sentido") or ["asc"])[0]))
            if u.path.startswith("/api/jugador/"):
                fila = int(u.path.rsplit("/", 1)[1])
                with sesion.lock:
                    return self._responder(200, detalle_jugador(sesion.plain, fila))
            if u.path == "/api/opciones":
                tipo = (q.get("tipo") or [""])[0]
                fila = int((q.get("fila") or ["-1"])[0])
                ranura = int((q.get("ranura") or ["1"])[0])
                with sesion.lock:
                    p = sesion.plain
                    if tipo == "equipacion":
                        return self._responder(200, {"opciones": O.equipacion(p, ranura)})
                    if tipo == "tecnica":
                        return self._responder(200, O.tecnicas(p, fila, ranura))
                    if tipo == "pasiva":
                        return self._responder(200, O.pasivas(p, fila, ranura))
                    if tipo == "heredada":
                        return self._responder(200, O.heredadas(p, fila))
                    return self._responder(400, {"error": "no se que opciones son %r" % tipo})
            if u.path == "/api/inventario":
                with sesion.lock:
                    return self._responder(200, O.objetos_creables(sesion.plain))
            if u.path == "/api/equipos":
                with sesion.lock:
                    return self._responder(200, EQ.todos(sesion.plain))
            if u.path.startswith("/api/equipo/") and u.path.endswith("/pasivas"):
                n = int(u.path.split("/")[3])
                with sesion.lock:
                    return self._responder(200, pasivas_de_equipo(sesion.plain, n))
            if u.path.startswith("/api/equipo/"):
                n = int(u.path.rsplit("/", 1)[1])
                with sesion.lock:
                    return self._responder(200, detalle_equipo(sesion.plain, n))
            if u.path == "/api/personajes":
                with sesion.lock:
                    return self._responder(200, O.personajes_creables(sesion.plain))
            return self._responder(404, {"error": "no existe esa direccion"})
        except (E.Ilegal, EQ.Ilegal) as e:
            return self._responder(400, {"error": str(e)})
        except Exception as e:      # que un fallo no tire el servidor entero
            return self._responder(500, {"error": "%s: %s" % (type(e).__name__, e)})

    def do_POST(self):
        u = urlparse(self.path)
        largo = int(self.headers.get("Content-Length") or 0)
        try:
            cuerpo = json.loads(self.rfile.read(largo) or b"{}")
        except ValueError:
            return self._responder(400, {"error": "no entiendo la peticion"})
        try:
            with sesion.lock:
                if u.path == "/api/cambiar":
                    info = self._cambiar(cuerpo)
                    return self._responder(200, {"hecho": info,
                                                 "cambios": sesion.cambios})
                if u.path == "/api/deshacer":
                    sesion.deshacer()
                    return self._responder(200, {"cambios": sesion.cambios})
                if u.path == "/api/abrir":
                    ruta = (cuerpo.get("ruta") or "").strip()
                    if not E.partida_en(ruta):
                        raise E.Ilegal("ahi no hay ninguna partida (XXXXXXXX-USERDATALIVE)")
                    nueva = Sesion(ruta)
                    sesion.origen, sesion.plain, sesion.nombre = nueva.origen, nueva.plain, nueva.nombre
                    sesion.historial, sesion.cambios = [], []
                    return self._responder(200, {"origen": sesion.origen})
                if u.path == "/api/guardar":
                    carpeta = (cuerpo.get("carpeta") or "").strip()
                    if carpeta:
                        E.guardar(sesion.plain, carpeta, sesion.nombre)
                        destino = carpeta
                    else:
                        nombre = (cuerpo.get("nombre") or "desde-la-interfaz").strip()
                        nombre = "".join(c for c in nombre
                                         if c.isalnum() or c in "-_") or "editada"
                        destino = sesion.guardar(nombre)
                    return self._responder(200, {"carpeta": destino,
                                                 "fichero": os.path.join(destino, sesion.nombre)})
            return self._responder(404, {"error": "no existe esa direccion"})
        except (E.Ilegal, EQ.Ilegal) as e:
            return self._responder(400, {"error": str(e)})
        except Exception as e:
            return self._responder(500, {"error": "%s: %s" % (type(e).__name__, e)})

    def _cambiar(self, c):
        """Aplica UN cambio. Cada tipo va a su funcion de `escribir`, que valida."""
        t = c.get("tipo")
        fila = int(c.get("fila", -1))
        if t == "nivel":
            return sesion.aplicar(E.poner_nivel, fila, int(c["valor"]))
        if t == "rareza":
            return sesion.aplicar(E.poner_rareza, fila, int(c["valor"]))
        if t == "arquetipo":
            if J.array(sesion.plain, J.ARRAY_RAREZA)[fila] == 8:
                return sesion.aplicar(E.poner_arquetipo_diamante, fila, int(c["valor"]))
            return sesion.aplicar(E.poner_arquetipo, fila,
                                  J.ARQUETIPOS[int(c["valor"])])
        if t == "partidos":
            return sesion.aplicar(E.poner_partidos, fila, int(c["valor"]))
        if t == "equipacion":
            return sesion.aplicar(E.poner_equipacion, fila, int(c["ranura"]), c["nombre"])
        if t == "tecnica":
            return sesion.aplicar(E.poner_tecnica, fila, int(c["ranura"]), c["nombre"])
        if t == "pasiva":
            return sesion.aplicar(E.poner_pasiva, fila, int(c["ranura"]), c["nombre"])
        if t == "quitar_heredada":
            return sesion.aplicar(E.quitar_heredada, fila, int(c["ranura"]))
        if t == "equipo_nombre":
            return sesion.aplicar(EQ.poner_nombre, int(c["equipo"]), c["nombre"])
        if t == "equipo_dorsal":
            return sesion.aplicar(EQ.poner_dorsal, int(c["equipo"]),
                                  int(c["hueco"]), int(c["valor"]))
        if t == "equipo_capitan":
            return sesion.aplicar(EQ.poner_capitan, int(c["equipo"]), int(c["hueco"]))
        if t == "equipo_jugador":
            return sesion.aplicar(EQ.poner_jugador, int(c["equipo"]),
                                  int(c["hueco"]), int(c["slot"]))
        if t == "equipo_intercambiar":
            return sesion.aplicar(EQ.intercambiar, int(c["equipo"]),
                                  int(c["a"]), int(c["b"]))
        if t == "equipo_meter":
            return sesion.aplicar(EQ.meter_jugador, int(c["equipo"]),
                                  int(c["puesto"]), int(c["fila"]))
        if t == "equipo_sacar":
            return sesion.aplicar(EQ.sacar_jugador, int(c["equipo"]), int(c["hueco"]))
        if t == "equipo_puesto":
            return sesion.aplicar(EQ.poner_puesto, int(c["equipo"]),
                                  int(c["hueco"]), int(c["valor"]))
        if t == "equipo_simple":
            return sesion.aplicar(EQ.poner_simple, int(c["equipo"]), c["cual"],
                                  int(c["valor"], 16))
        if t == "equipo_tactica":
            return sesion.aplicar(EQ.poner_tactica, int(c["equipo"]),
                                  int(c["ranura"]), c.get("id") or "")
        if t == "rol":
            return sesion.aplicar(E.poner_medalla, fila, c["valor"])
        if t == "diamante":
            return sesion.aplicar(E.poner_diamante, fila)
        if t == "cambiar_rama":
            return sesion.aplicar(E.cambiar_rama, fila)
        if t == "arreglar_heredadas":
            return sesion.aplicar(E.arreglar_heredadas)
        if t == "conseguir_todo":
            return sesion.aplicar(E.conseguir_todo, c["categoria"], int(c["cantidad"]))
        if t == "heredada":
            return sesion.aplicar(E.poner_heredada, fila, int(c["ranura"]), c["nombre"])
        if t == "judia":
            return sesion.aplicar(E.poner_tipo_judia, fila, int(c["ranura"]),
                                  c["nombre"], int(c["cantidad"]))
        if t == "judias":
            return sesion.aplicar(E.poner_judias, fila, int(c["ranura"]), int(c["cantidad"]))
        # El editor manda el codigo del objeto ademas del nombre: hay cosas que
        # se llaman igual (dos "alfil negro" de aura) y el nombre no las separa.
        if t == "cantidad":
            return sesion.aplicar(E.poner_cantidad, c.get("id") or c["nombre"], int(c["cantidad"]))
        if t == "objeto":
            return sesion.aplicar(E.anadir_objeto, c.get("id") or c["nombre"], int(c.get("cantidad", 1)))
        if t == "jugador":
            if c.get("diamante"):
                return sesion.aplicar(E.anadir_jugador_diamante, c["nombre"])
            return sesion.aplicar(E.anadir_jugador, c["nombre"],
                                  c.get("rareza") or None, c.get("arquetipo") or None)
        if t == "borrar_jugador":
            return sesion.aplicar(E.borrar_jugador, fila)
        raise E.Ilegal("no se que es %r" % t)


def preparar(origen, puerto=PUERTO):
    """Abre la partida y deja el servidor listo (sin arrancarlo). Lo usan el
    modo de siempre (`py -m ievr.servidor`) y el programa de ventana
    (`lanzador.py`). Si el puerto esta ocupado prueba los siguientes."""
    global sesion
    if not E.partida_en(origen):
        raise SystemExit("no encuentro ningun XXXXXXXX-USERDATALIVE dentro de %s" % origen)
    sesion = Sesion(origen)
    import socket
    ultimo = None
    for p in range(puerto, puerto + 20):
        # En Windows, abrir un puerto que ya usa otro programa NO da error
        # (allow_reuse_address), asi que primero se mira si alguien contesta.
        try:
            socket.create_connection(("127.0.0.1", p), timeout=0.2).close()
            continue          # ocupado: alguien contesta ahi
        except OSError:
            pass
        try:
            return ThreadingHTTPServer(("127.0.0.1", p), Manejador), p
        except OSError as e:
            ultimo = e
    raise SystemExit("no encuentro un puerto libre a partir del %d: %s" % (puerto, ultimo))


def main():
    if len(sys.argv) < 2:
        raise SystemExit("dime que partida abrir, por ejemplo:\n"
                         "   py -m ievr.servidor partidas\\rondas\\18-con-jugadores-creados")
    print("Abriendo la partida... (son 12 MB, tarda un momento)")
    servidor, puerto = preparar(sys.argv[1])
    url = "http://127.0.0.1:%d/" % puerto
    print("\nListo. Si no se abre solo, entra en:  %s" % url)
    print("Para cerrarlo, cierra esta ventana negra.\n")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
