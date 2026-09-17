"""Donde esta el juego en ESTE ordenador, sin rutas de nadie escritas (O-201).

Lo usan las herramientas que leen los ficheros del juego. Orden: la variable
de entorno IEVR_JUEGO, la carpeta de Steam del registro de Windows (y sus
bibliotecas de `libraryfolders.vdf`), y por ultimo las carpetas de siempre en
cada unidad.
"""
import os
import re

CARPETA_JUEGO = os.path.join("steamapps", "common", "INAZUMA ELEVEN Victory Road")


def _bibliotecas_de_steam():
    raices = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
            raices.append(winreg.QueryValueEx(k, "SteamPath")[0].replace("/", "\\"))
    except Exception:
        pass
    for raiz in list(raices):
        vdf = os.path.join(raiz, "steamapps", "libraryfolders.vdf")
        try:
            with open(vdf, encoding="utf-8", errors="replace") as fh:
                raices += [m.replace("\\\\", "\\") for m in re.findall(r'"path"\s+"([^"]+)"', fh.read())]
        except OSError:
            pass
    for unidad in "CDEFGH":
        for sub in (r"Program Files (x86)\Steam", "Steam", "steam", r"Juegos\Steam",
                    r"Games\Steam", "SteamLibrary"):
            raices.append("%s:\\%s" % (unidad, sub))
    return raices


def carpeta_del_juego():
    """La carpeta `data\\packs` del juego, o None si no esta en este ordenador."""
    fija = os.environ.get("IEVR_JUEGO")
    if fija and os.path.isdir(fija):
        return fija
    for raiz in _bibliotecas_de_steam():
        packs = os.path.join(raiz, CARPETA_JUEGO, "data", "packs")
        if os.path.isdir(packs):
            return packs
    return None
