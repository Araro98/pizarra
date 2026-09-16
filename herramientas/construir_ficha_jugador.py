#!/usr/bin/env python3
"""Saca de chara_param el dato que lleva el campo 0xFC830AAC de cada jugador.

    py herramientas\\construir_ficha_jugador.py

Al crear un jugador hay que rellenarle once campos (NOTAS O-68). Diez se saben
calcular o copiar; este salia de una columna de la tabla de personajes del juego,
y se encontro buscando, columna por columna, cual predice el valor que tienen los
jugadores de la partida: la **columna 4 acierta en el 100 % de los 2.644
personajes** con los que se pudo comprobar. Ninguna otra pasa del 99 %.

Que significa esa columna no se sabe, y no hace falta: lo que importa es que un
jugador creado lleve el mismo valor que le pondria el juego.
"""
import csv
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "ficha-jugador.csv")
COLUMNA = 4


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def entero(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    fichero = unico(os.path.join(COMUN, "character"), "chara_param_")
    r = subprocess.run([VOLCADO, fichero, "CHARA_PARAM_INFO_LIST"],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con chara_param")

    filas = []
    for linea in r.stdout.splitlines():
        c = linea.split("\t")
        ident = entero(c[0]) if c else None
        # Las filas de continuacion son cortas; solo valen las completas.
        if ident is None or len(c) <= COLUMNA + 16:
            continue
        valor = entero(c[COLUMNA])
        if valor is None:
            continue
        filas.append(["%08X" % (ident & 0xFFFFFFFF), valor])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Dato de la ficha de cada personaje, sacado de chara_param.\n"
                 "# identidad = el valor del campo 0xBA162C11 de la partida.\n"
                 "# campo_fc = lo que hay que escribir en 0xFC830AAC (NOTAS O-71).\n"
                 "# Lo genera herramientas/construir_ficha_jugador.py.\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "campo_fc"])
        w.writerows(filas)
    print("Escritos %d personajes en %s" % (len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
