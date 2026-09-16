#!/usr/bin/env python3
"""Saca la frase de presentacion de cada personaje, la que sale bajo su nombre.

    py herramientas\\construir_descripciones.py

Deja `datos/reglas-extraidas/descripciones.csv`.

El texto vive en `text/es/chara_description_text.cfg.bin`, indexado por un numero
que trae la **columna 19 de `chara_base`**. Esa columna se encontro probandolas
todas contra las claves del fichero de textos: la 19 encuentra 5.787 de 7.224
personajes y ninguna otra pasa del 30 %.
"""
import csv
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
TEXTOS = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "text")
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "descripciones.csv")
COL_DESCRIPCION = 19


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def limpiar(texto):
    """Quita los saltos escapados que trae el juego."""
    t = texto
    while chr(92) in t:
        t = t.replace(chr(92) + chr(92), chr(92))
        t = t.replace(chr(92) + "n", " ")
        t = t.replace(chr(92), " ")
    return " ".join(t.split())


def textos_de(idioma):
    ruta = os.path.join(TEXTOS, idioma, "chara_description_text.cfg.bin")
    if not os.path.isfile(ruta):
        return {}
    r = subprocess.run([VOLCADO, ruta, "TEXT_INFO"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    fuera = {}
    for l in r.stdout.splitlines():
        c = l.split("\t")
        clave = entero(c[0]) if c else None
        if clave is None:
            continue
        for celda in c[1:]:
            m = re.match(r'^String\("(.*)"\)$', celda.strip(), re.S)
            if m:
                fuera.setdefault(clave, limpiar(m.group(1)))
                break
    return fuera


def filas(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def main():
    es = textos_de("es")
    en = textos_de("en")
    print("descripciones: %d en espanol, %d en ingles" % (len(es), len(en)))
    if not es and not en:
        raise SystemExit("no encuentro chara_description_text")

    base = {}
    for c in filas(os.path.join(TABLAS, "CHARA_BASE_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > COL_DESCRIPCION:
            base[v] = entero(c[COL_DESCRIPCION])

    salida, sin = [], 0
    for c in filas(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is None or len(c) < 20:
            continue
        clave = base.get(entero(c[1]))
        texto = es.get(clave) or en.get(clave)
        if not texto:
            sin += 1
            continue
        salida.append(["%08X" % v, texto])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# La frase que sale bajo el nombre de cada personaje.\n"
                 "# identidad = el valor del campo 0xBA162C11 de la partida.\n"
                 "# Lo genera herramientas/construir_descripciones.py (NOTAS O-92).\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "descripcion"])
        w.writerows(sorted(salida))
    print("Escritas %d descripciones (sin: %d) en %s" % (len(salida), sin, SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
