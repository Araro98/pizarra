#!/usr/bin/env python3
"""Las caras de personaje que el juego trae pero no usa (NOTAS O-239).

    py herramientas\\construir_sin_usar.py

Escribe `datos/reglas-extraidas/caras-sin-usar.csv`: cara, grupo, nombre,
identidades. Tres grupos, mirando las 5.685 caras de `10_icon_chr/face`:

- `sin_personaje`: la imagen existe pero ninguna fila de `chara_base` la usa
  como `string_id` (columna 1). No es de nadie.
- `sin_ficha`: tiene fila en `chara_base` (con nombre) pero ninguna en
  `chara_param`, asi que no existe como jugador. Algunas seran gente que sale
  en la historia; el juego no dice cual.
- `no_fichable`: es de uno o mas jugadores de `chara_param`, pero ninguno
  esta en `fichables.csv` (O-205): versiones de la historia, formas de modo,
  rivales...

Solo caras: los modelos 3D no se pueden ensenar en la pagina.
"""
import csv
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
CARAS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon", "10_icon_chr", "face")
EXTRAIDAS = os.path.join(RAIZ, "datos", "reglas-extraidas")
SALIDA = os.path.join(EXTRAIDAS, "caras-sin-usar.csv")


def filas(nombre):
    with open(os.path.join(TABLAS, nombre), encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def cadena(celda):
    m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
    return m.group(1) if m else ""


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def limpio(t):
    t = re.sub(r"\[([^/\]]*)/[^\]]*\]", r"\1", t or "")     # [kanji/lectura] -> kanji
    t = re.sub(r"<[A-Z]+:([^>]*)>", r"\1", t)
    return t.strip()


def main():
    base = {}
    for c in filas("CHARA_BASE_INFO_LIST.tsv"):
        v = u32(c[0]) if c else None
        if v is not None and len(c) > 5:
            base[v] = c
    nombres = {}
    for c in filas("chara_text_NOUN_INFO.tsv"):
        v = u32(c[0]) if c else None
        if v is None:
            continue
        for x in c[1:]:
            t = cadena(x)
            if t:
                nombres[v] = t
                break
    # el nombre en espanol de los jugadores, si lo hay
    per = {}
    with open(os.path.join(EXTRAIDAS, "personajes.csv"), encoding="utf-8") as fh:
        for f in csv.DictReader(l for l in fh if not l.startswith("#")):
            per[f["identidad"].upper()] = f
    fichables = set()
    with open(os.path.join(EXTRAIDAS, "fichables.csv"), encoding="utf-8") as fh:
        for f in csv.DictReader(l for l in fh if not l.startswith("#")):
            fichables.add(f["identidad"].upper())

    cara_de_base = {v: cadena(c[1]) for v, c in base.items()}
    jugadores_de_cara = {}
    for c in filas("CHARA_PARAM_INFO_LIST.tsv"):
        v = u32(c[0]) if c else None
        if v is None or len(c) < 20:
            continue
        cara = cara_de_base.get(u32(c[1]), "")
        if cara:
            jugadores_de_cara.setdefault(cara, []).append("%08X" % v)
    caras = sorted(f[:-6] for f in os.listdir(CARAS) if f.endswith("_l.png")
                   and not f.startswith("face_"))
    usadas = {s for s in cara_de_base.values() if s}

    def nombre_de_base(c):
        for k in (3, 4, 5):
            t = nombres.get(u32(c[k]))
            if t:
                return limpio(t)
        return ""

    salida = []
    for cara in caras:
        if cara not in usadas:
            salida.append([cara, "sin_personaje", "", ""])
            continue
        jug = jugadores_de_cara.get(cara, [])
        if not jug:
            fila = next(c for v, c in base.items() if cara_de_base[v] == cara)
            salida.append([cara, "sin_ficha", nombre_de_base(fila), ""])
            continue
        if not any(j in fichables for j in jug):
            nombre = ""
            for j in jug:
                f = per.get(j) or {}
                nombre = limpio(f.get("nombre_es") or f.get("nombre_en") or "")
                if nombre:
                    break
            salida.append([cara, "no_fichable", nombre, " ".join(jug)])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Caras que el juego trae pero no usa (NOTAS O-239).\n"
                 "# Lo genera herramientas/construir_sin_usar.py.\n")
        w = csv.writer(fh)
        w.writerow(["cara", "grupo", "nombre", "identidades"])
        w.writerows(salida)
    import collections
    print("Escritas %d caras en %s" % (len(salida), SALIDA))
    print("   por grupo:", dict(collections.Counter(f[1] for f in salida)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
