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
                 "errores": {codigo: texto}, "error": texto general o ""}
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


def carpeta():
    """Donde van los .glb y la cache del indice del juego."""
    return os.environ.get("IEVR_MODELOS3D") or os.path.join(reglas.RAIZ, "datos", "modelos3d")


def ruta_glb(codigo):
    return os.path.join(carpeta(), codigo + ".glb")


def codigo_valido(codigo):
    """Solo codigos de modelo (c03030080, c01000010_5000...): van a parar a un nombre de fichero."""
    return isinstance(codigo, str) and re.fullmatch(r"[A-Za-z0-9_]{1,40}", codigo) is not None


def estado():
    """Los pedidos que ya tienen .glb (menos los que se estan rehaciendo) y como va la cola."""
    with _cerrojo:
        return {"hechos": [c for c in _pedidos if c not in _pendientes and c != _actual
                           and os.path.isfile(ruta_glb(c))],
                "pendientes": list(_pendientes), "actual": _actual,
                "errores": dict(_errores), "error": _error}


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
        import numpy  # noqa: F401
        import PIL  # noqa: F401
    except ImportError:
        return "A este Pizarra le falta numpy o Pillow para convertir los modelos 3D."
    return ""


def preparar(codigos):
    """Pone en la cola los codigos que aun no tienen .glb y arranca el hilo si hace falta.
    Los que fallaron antes se vuelven a intentar (puede que ya este el juego)."""
    global _error, _hilo
    codigos = [c for c in codigos if codigo_valido(c)]
    error = _sin_juego()
    with _cerrojo:
        _error = error
        for c in codigos:
            if c not in _pedidos:
                _pedidos.append(c)
            if error or c == _actual or c in _pendientes or _al_dia(c):
                continue
            _errores.pop(c, None)
            _pendientes.append(c)
        if _pendientes and _hilo is None:
            _hilo = threading.Thread(target=_trabajar, name="modelos3d", daemon=True)
            _hilo.start()
    return estado()


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
    El indice del juego y lo ya sacado (banco de animaciones, camisetas del mismo equipo) se
    aprovechan mientras haya cola; al acabar se suelta todo."""
    global _actual, _hilo, _error
    from ievr import g4
    juego = None
    while True:
        with _cerrojo:
            if not _pendientes:
                _actual, _hilo = None, None
                return
            codigo = _actual = _pendientes.pop(0)
        try:
            if not _al_dia(codigo):
                if juego is None:
                    juego = g4.Juego(rutas.carpeta_del_juego(), os.path.join(carpeta(), "indice.json"))
                g4.convertir(codigo, juego.carpeta, carpeta(), juego)
        except Exception as e:      # un personaje que falla no para a los demas
            with _cerrojo:
                _errores[codigo] = _texto(e)
                if juego is None:   # ni siquiera se pudo leer el juego: no sigue
                    _error = "No he podido leer el juego: %s" % _texto(e)
                    _pendientes.clear()
        finally:
            with _cerrojo:
                _actual = None
