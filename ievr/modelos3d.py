"""La cola que prepara los modelos 3D del partido en segundo plano (O-293).

Al empezar un partido en 3D la pagina pide los 22 jugadores y va mirando el
estado: los que este PC ya tiene convertidos se ven al momento, y el resto se
convierten aqui de uno en uno desde el juego instalado (ievr/g4.py), cada uno en
2-4 s. Asi el partido arranca enseguida con fichas y cada ficha se cambia por
su modelo en cuanto esta listo.

Los .glb van a `datos/modelos3d/` (no se reparten: son arte del juego, ver
.gitignore). Cada uno se escribe primero como `.tmp` y luego se renombra, asi
que la pagina nunca lee uno a medias. La variable de entorno IEVR_MODELOS3D
cambia esa carpeta (para las pruebas).

    preparar(["c03030080", ...])  -> estado()
    estado() -> {"hechos": [...], "pendientes": [...], "actual": codigo o None,
                 "errores": {codigo: texto}, "error": texto general o "",
                 "eventos": {"hechos", "pendientes", "actual", "errores"}}

Las animaciones reales de VR (O-323, ievr/g4evento.py) van por la misma cola, de una en
una y DESPUES de los modelos de los jugadores: los eventos de las supertecnicas y de los
espiritus (`preparar_eventos` / `preparar_partido`) a `datos/modelos3d/eventos/<ev>/`, y los
modelos que no son personajes (keshin kNNNNNN, almas aNNNNNN, el balon, los de las
tecnicas, el aura del keshin ega_kNNNNNNa) como un codigo mas de `preparar`.
"""
import os
import re
import threading

from ievr import reglas, rutas

_cerrojo = threading.Lock()
_pedidos = []          # todos los codigos pedidos en esta sesion, por orden
_pendientes = []       # los que faltan por convertir, por orden
_errores = {}          # codigo -> por que no se pudo
_actual = None         # el que se esta convirtiendo ahora
_hilo = None
_error = ""            # lo que impide convertir nada (no hay juego, falta numpy...)
# los eventos de VR (O-323): {evento: {"tipos": set, "asignados": set}} pedidos y pendientes
_ev_pedidos = {}
_ev_pendientes = []    # nombres de evento por orden
_ev_errores = {}
_ev_actual = None
_rotulos = []          # rotulos de VR por hacer (telop_waza)


def carpeta():
    """Donde van los .glb y la cache del indice del juego."""
    return os.environ.get("IEVR_MODELOS3D") or os.path.join(reglas.RAIZ, "datos", "modelos3d")


def ruta_glb(codigo):
    return os.path.join(carpeta(), codigo + ".glb")


def codigo_valido(codigo):
    """Solo codigos de modelo (c03030080, c01000010_5000...): van a parar a un nombre de fichero."""
    return isinstance(codigo, str) and re.fullmatch(r"[A-Za-z0-9_]{1,40}", codigo) is not None


def evento_valido(nombre):
    """Nombres de evento de VR (ev60_00030, ev63_00010_1): van a parar a una carpeta."""
    return isinstance(nombre, str) and re.fullmatch(r"ev\d\d_\d{5}(_\d{1,2})?", nombre) is not None


def estado():
    """Los pedidos que ya tienen .glb (menos los que se estan rehaciendo) y como va la cola."""
    with _cerrojo:
        return {"hechos": [c for c in _pedidos if c not in _pendientes and c != _actual
                           and os.path.isfile(ruta_glb(c))],
                "pendientes": list(_pendientes), "actual": _actual,
                "errores": dict(_errores), "error": _error,
                "eventos": {"hechos": [e for e in _ev_pedidos if e not in _ev_pendientes and e != _ev_actual
                                       and e not in _ev_errores
                                       and os.path.isfile(os.path.join(carpeta(), "eventos", e, "escena.json"))],
                            "pendientes": list(_ev_pendientes), "actual": _ev_actual,
                            "errores": dict(_ev_errores)}}


def _al_dia(codigo):
    """Si el .glb existe y lo hizo esta version del conversor (los de una version anterior,
    como los del script de pruebas con las tallas de ropa mal, se vuelven a convertir)."""
    from ievr import g4
    ruta = ruta_glb(codigo)
    return os.path.isfile(ruta) and g4.version_de(ruta) == g4.VERSION_MODELO


def _sin_juego():
    """Texto claro si este PC no puede convertir nada, o "" si puede."""
    if not rutas.carpeta_del_juego():
        return ("No encuentro Inazuma Eleven: Victory Road en este ordenador, asi que los "
                "jugadores salen con su ficha. Si esta instalado en otra carpeta, pon su "
                "carpeta data\\packs en la variable IEVR_JUEGO.")
    try:
        import numpy
        import PIL
        numpy, PIL              # solo se mira que esten
    except ImportError:
        return "A este Pizarra le falta numpy o Pillow para convertir los modelos 3D."
    return ""


def _arrancar():
    """Arranca el hilo si hay trabajo y no esta ya (con el cerrojo cogido)."""
    global _hilo
    if (_pendientes or _ev_pendientes or _rotulos) and _hilo is None:
        _hilo = threading.Thread(target=_trabajar, name="modelos3d", daemon=True)
        _hilo.start()


def preparar(codigos):
    """Pone en la cola los codigos que aun no tienen .glb y arranca el hilo si hace falta.
    Los que fallaron antes se vuelven a intentar (puede que ya este el juego).
    Lo ultimo pedido va delante: si se deja un partido a medias y se empieza otro, o
    entra un suplente, no espera a que acaben los que ya no se ven; esos se siguen
    haciendo despues, para la proxima vez (O-305)."""
    global _error
    codigos = [c for c in codigos if codigo_valido(c)]
    error = _sin_juego()
    with _cerrojo:
        _error = error
        nuevos = []
        for c in codigos:
            if c not in _pedidos:
                _pedidos.append(c)
            if error or c == _actual or c in nuevos or _al_dia(c):
                continue
            _errores.pop(c, None)
            if c in _pendientes:
                _pendientes.remove(c)
            nuevos.append(c)
        _pendientes[:0] = nuevos
        _arrancar()
    return estado()


def preparar_eventos(pedidos, rotulos=()):
    """Pone en la cola los eventos de VR {evento: {"tipos": ['01'..], "asignados": [kNNNNNN..]}}
    que falten (O-323). Van despues de los modelos: primero se ven los jugadores."""
    global _error
    from ievr import g4evento as GE
    error = _sin_juego()
    with _cerrojo:
        _error = error
        for ev, p in pedidos.items():
            if not evento_valido(ev):
                continue
            tipos = {t for t in p.get("tipos") or () if t in ("01", "02", "03", "04")}
            asignados = {a for a in p.get("asignados") or () if codigo_valido(a)}
            d = _ev_pedidos.setdefault(ev, {"tipos": set(), "asignados": set()})
            d["tipos"] |= tipos
            d["asignados"] |= asignados
            if error or ev in _ev_pendientes:
                continue
            # el que se esta haciendo vuelve a la cola por si piden otro tipo de cuerpo o keshin
            # (lo ya hecho no se rehace)
            if ev != _ev_actual and GE.al_dia(carpeta(), ev, d["tipos"], d["asignados"]):
                continue
            _ev_errores.pop(ev, None)
            _ev_pendientes.append(ev)
        for r in rotulos:
            if r and codigo_valido(r) and r not in _rotulos and \
                    not os.path.isfile(os.path.join(carpeta(), "eventos", "_rotulos", r + ".png")):
                _rotulos.append(r)
        if not error:
            _arrancar()
    return estado()


def preparar_partido(jugadores):
    """Todo lo de las animaciones de VR de los jugadores de un partido (O-323): los modelos
    sueltos y transformados (keshin, alma, armadura, mixi max, modo, aura del campo), los
    eventos de sus supertecnicas y de su espiritu, y sus rotulos. jugadores: [{"cara",
    "tecnicas": [nombre interno o id], "espiritu": id}]. -> estado() con "tecnicas" y
    "espiritus": que evento, que modelo y que rotulo lleva cada una (para la pagina)."""
    from ievr import g4evento as GE
    codigos, pedidos, rotulos, mapa = GE.pedidos_de(jugadores)
    with _cerrojo:
        # los modelos sueltos detras de los que ya esten: los jugadores primero
        extra = [c for c in codigos if codigo_valido(c) and c not in _pendientes and c != _actual
                 and not _al_dia(c)]
        for c in codigos:
            if codigo_valido(c) and c not in _pedidos:
                _pedidos.append(c)
        if not _sin_juego():
            for c in extra:
                _errores.pop(c, None)
            _pendientes.extend(extra)
    preparar_eventos(pedidos, rotulos)
    e = estado()
    e.update(mapa)
    e["modelos"] = codigos
    return e


def _texto(e):
    """El fallo de un personaje, en espanol y corto, para el aviso de la pagina."""
    if isinstance(e, LookupError):
        return str(e)
    if isinstance(e, FileNotFoundError):
        return "falta %s" % e.filename if e.filename else str(e)
    if isinstance(e, MemoryError):
        return "no hay memoria para convertirlo"
    return "no se pudo convertir (%s: %s)" % (type(e).__name__, e)


def _trabajar():
    """El hilo: convierte los pendientes de uno en uno y se acaba cuando no queda ninguno.
    Primero los modelos (los jugadores y lo que pidan los eventos), luego los eventos de VR
    y al final los rotulos. El indice del juego y lo ya sacado (banco de animaciones,
    camisetas del mismo equipo) se aprovechan mientras haya cola; al acabar se suelta todo."""
    global _actual, _hilo, _error, _ev_actual
    from ievr import g4
    juego = None
    fuente = None        # el juego con los ficheros de los eventos (O-323), su indice aparte

    def fuente_eventos():
        nonlocal fuente
        if fuente is None:
            from ievr import g4evento as GE
            j = GE.juego(rutas.carpeta_del_juego(), os.path.join(carpeta(), "indice_eventos.json"))
            j.MEMORIA = 96 << 20     # dos Juego a la vez: este con menos memoria
            fuente = GE.Fuente(j)
        return fuente
    while True:
        with _cerrojo:
            if _pendientes:
                codigo = _actual = _pendientes.pop(0)
                tarea = "modelo"
            elif _ev_pendientes:
                codigo = _ev_actual = _ev_pendientes.pop(0)
                pedido = {k: set(v) for k, v in _ev_pedidos.get(codigo, {}).items()}
                tarea = "evento"
            elif _rotulos:
                codigo = _rotulos.pop(0)
                tarea = "rotulo"
            else:
                _actual, _ev_actual, _hilo = None, None, None
                return
        try:
            if tarea == "modelo":
                if not _al_dia(codigo):
                    from ievr import g4evento as GE
                    if GE.es_modelo_suelto(codigo):
                        GE.convertir_modelo(codigo, carpeta(), fuente_eventos())
                    else:
                        if juego is None:
                            juego = g4.Juego(rutas.carpeta_del_juego(), os.path.join(carpeta(), "indice.json"))
                        g4.convertir(codigo, juego.carpeta, carpeta(), juego)
            elif tarea == "evento":
                from ievr import g4evento as GE
                r = GE.convertir(codigo, carpeta(), fuente_eventos(), sorted(pedido.get("tipos") or {"01"}),
                                 sorted(pedido.get("asignados") or ()))
                with _cerrojo:
                    # los modelos que usa (el balon, los de la tecnica...) si aun no estan
                    nuevos = [c for c in r["modelos"] if codigo_valido(c) and c not in _pendientes
                              and c not in _errores and not _al_dia(c)]
                    for c in nuevos:
                        if c not in _pedidos:
                            _pedidos.append(c)
                    _pendientes.extend(nuevos)
            else:
                from ievr import g4evento as GE
                GE.convertir_rotulo(codigo, carpeta(), fuente_eventos())
        except Exception as e:      # uno que falla no para a los demas
            with _cerrojo:
                if tarea == "evento":
                    _ev_errores[codigo] = _texto(e)
                elif tarea == "modelo":
                    _errores[codigo] = _texto(e)
                if juego is None and fuente is None:   # ni siquiera se pudo leer el juego: no sigue
                    _error = "No he podido leer el juego: %s" % _texto(e)
                    _pendientes.clear()
                    _ev_pendientes.clear()
                    _rotulos.clear()
        finally:
            with _cerrojo:
                _actual = None
                _ev_actual = None
