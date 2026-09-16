#!/usr/bin/env python3
"""Acceso a las reglas de legalidad. Los datos viven en `datos/`, nunca aqui.

Regla 4 del CONTEXTO: un unico sitio donde mirar y donde corregir. Este modulo
solo lee ficheros, no decide nada por su cuenta.

Dos origenes, deliberadamente separados:

- `datos/reglas-extraidas/`   sacadas de los ficheros del juego o de volcados
                              de terceros, verificadas contra la partida.
- `datos/reglas-del-jugador/` las que aporta Aaron de cabeza, cada una con su
                              nota explicando por que es asi.
"""
import csv
import os

# La raiz del proyecto. Cuando esto corre como programa (.exe, ver lanzador.py)
# el codigo va empaquetado en una carpeta temporal y la raiz de verdad la
# pone el lanzador en IEVR_RAIZ.
RAIZ = os.environ.get("IEVR_RAIZ") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRAIDAS = os.path.join(RAIZ, "datos", "reglas-extraidas")
DEL_JUGADOR = os.path.join(RAIZ, "datos", "reglas-del-jugador")

_cache = {}


def _tabla(fichero, carpeta=EXTRAIDAS):
    """Lee un csv de reglas ignorando las lineas de comentario."""
    clave = (carpeta, fichero)
    if clave not in _cache:
        ruta = os.path.join(carpeta, fichero)
        try:
            with open(ruta, newline="", encoding="utf-8") as fh:
                lineas = [l for l in fh if not l.lstrip().startswith("#")]
            _cache[clave] = list(csv.DictReader(lineas))
        except OSError:
            _cache[clave] = []
    return _cache[clave]


def _ids(fichero):
    return {f["id_partida"].upper() for f in _tabla(fichero) if f.get("id_partida")}


def pasivas_normales():
    return _ids("pasivas-normales.csv")


def pasivas_hero():
    return _ids("pasivas-hero.csv")


def clase_de_pasiva(id_hex):
    """"normal", "hero", "ambas" o None si no esta en ninguna lista.

    Sirve para la regla de legalidad que pide el CONTEXTO: no cruzar nunca una
    pasiva exclusiva de Hero con un jugador que no lo es.
    """
    id_hex = id_hex.upper()
    n = id_hex in pasivas_normales()
    h = id_hex in pasivas_hero()
    if n and h:
        return "ambas"
    if n:
        return "normal"
    if h:
        return "hero"
    return None


def personajes():
    """{identidad_hex: fila} de `personajes.csv`.

    La identidad es el valor del campo `0xBA162C11` de la partida. Con esto un
    jugador deja de ser "la fila 4566" y pasa a tener nombre y rareza.
    """
    if "personajes" not in _cache:
        _cache["personajes"] = {f["identidad"].upper(): f
                                for f in _tabla("personajes.csv")
                                if f.get("identidad")}
    return _cache["personajes"]


def quien_es(identidad):
    """(nombre, rareza) a partir del valor de `0xBA162C11`, o (None, None)."""
    f = personajes().get("%08X" % identidad)
    if not f:
        return None, None
    return (f.get("nombre_es") or f.get("nombre_en") or None), f.get("rareza")


def supertecnicas():
    """{id_partida: nombre} de la lista extraida."""
    return {f["id_partida"].upper(): f["nombre"] for f in _tabla("supertecnicas.csv")}


def heroes():
    """[(id_ce, nombre)] de los 142 personajes con rareza Hero.

    OJO: estos identificadores NO se han encontrado en la partida. Ver O-22.
    Sirven como lista de personajes, no como clave para buscar en el save.
    """
    return [(f["id_ce"], f["nombre"]) for f in _tabla("heroes.csv")]


def resumen():
    return {
        "pasivas normales": len(pasivas_normales()),
        "pasivas hero": len(pasivas_hero()),
        "supertecnicas": len(supertecnicas()),
        "personajes hero": len(heroes()),
        "personajes con nombre": len(personajes()),
        "reglas del jugador": len(os.listdir(DEL_JUGADOR)) if os.path.isdir(DEL_JUGADOR) else 0,
    }


if __name__ == "__main__":
    for k, v in resumen().items():
        print("%-22s %d" % (k, v))
