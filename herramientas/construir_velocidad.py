#!/usr/bin/env python3
"""La VELOCIDAD de cada personaje, solo para el Partido (NOTAS O-340).

    py herramientas\\construir_velocidad.py

Lee `informes/velocidad.csv` (la tabla que se hizo con Aaron a partir de la Speed de
los juegos antiguos: IE1-3, GO, CS y Galaxy; los que solo salen en VR, a mano; de 100
a 600 en campana, con la mediana en 350) y escribe
`datos/reglas-extraidas/velocidad.csv` con la clave que usa el Partido, la identidad
de cada personaje (el campo 0xBA162C11 de la partida, como `personajes.csv`):

- `identidad`, `velocidad` (100-600), `nombre`, `posicion`, `elemento`.
- `como`: como se ha unido. `nombre_en` o `nombre` (por su nombre de VR, el mismo con
  el que se hizo el informe, que lleva uno por nombre: las rarezas de un personaje
  comparten velocidad); `+posicion`/`+elemento` si habia varios con ese nombre y se
  ha desempatado asi; `mediana POS` si no se ha podido unir (la mediana de los de su
  posicion en el informe; sin posicion, la de todos).

Aaron (O-340): la velocidad solo se ve y se usa en el Partido (ievr/partido.py la manda
con cada jugador); en el resto de Pizarra no sale. `informes/` no va en git: si no esta,
no se toca la tabla.
"""
import csv
import os
import statistics
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

INFORME = os.path.join(RAIZ, "informes", "velocidad.csv")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "velocidad.csv")


def leer_informe():
    with open(INFORME, encoding="utf-8-sig", newline="") as fh:
        filas = list(csv.DictReader(fh, delimiter=";"))
    fuera = []
    for f in filas:
        try:
            v = int(float(f.get("velocidad") or ""))
        except ValueError:
            continue
        fuera.append({"nombre": (f.get("nombre") or "").strip(), "nombre_en": (f.get("nombre_en") or "").strip(),
                      "posicion": (f.get("posicion") or "").strip(), "elemento": (f.get("elemento") or "").strip(),
                      "velocidad": max(100, min(600, v))})
    return fuera


def desempatar(cands, pos, elem):
    """De varios con el mismo nombre, el de su posicion y elemento (o el que mas se
    parezca); (fila, lo que se ha mirado)."""
    if len(cands) == 1:
        return cands[0], ""
    for filtro, como in ((lambda c: c["posicion"] == pos and c["elemento"] == elem, "+posicion+elemento"),
                         (lambda c: c["posicion"] == pos, "+posicion"),
                         (lambda c: c["elemento"] == elem, "+elemento")):
        mismos = [c for c in cands if filtro(c)]
        if mismos:
            return mismos[0], como
    return cands[0], "+primero"


def main():
    if not os.path.exists(INFORME):
        raise SystemExit("no esta %s: la tabla se queda como esta" % INFORME)
    informe = leer_informe()
    por_en, por_es = {}, {}
    for f in informe:
        if f["nombre_en"]:
            por_en.setdefault(f["nombre_en"], []).append(f)
        if f["nombre"]:
            por_es.setdefault(f["nombre"], []).append(f)
    # la mediana de cada posicion, para los que no se puedan unir
    medianas = {}
    for f in informe:
        medianas.setdefault(f["posicion"], []).append(f["velocidad"])
    medianas = {k: int(statistics.median(v)) for k, v in medianas.items()}
    general = int(statistics.median(f["velocidad"] for f in informe))

    jug = {}
    for f in reglas.jugadores_y_formas():          # con las formas (O-252)
        jug.setdefault(f["identidad"].upper(), f)
    filas, sin = [], []
    for ident, p in sorted(reglas.personajes().items(), key=lambda x: int((x[1].get("indice") or 0) or 0)):
        j = jug.get(ident) or {}
        pos, elem = j.get("posicion") or "", j.get("elemento") or ""
        # (algunos nombres llevan un espacio al final, en las dos tablas)
        en, es = (p.get("nombre_en") or "").strip(), (p.get("nombre_es") or "").strip()
        nombre = es or en or (j.get("nombre") or "").strip()
        # como se hizo el informe: un personaje por nombre en ingles (o en espanol si no tiene)
        cands, como = (por_en.get(en) if en else None), "nombre_en"
        if not cands:
            cands, como = (por_es.get(es) if es else None) or por_es.get((j.get("nombre") or "").strip() or None), "nombre"
        if cands:
            f, extra = desempatar(cands, pos, elem)
            filas.append([ident, f["velocidad"], nombre, pos, elem, como + extra])
        else:
            v = medianas.get(pos, general) if pos else general
            filas.append([ident, v, nombre, pos, elem, "mediana " + (pos or "todos")])
            sin.append((ident, nombre, pos, v))
    with open(SALIDA, "w", encoding="utf-8", newline="") as fh:
        fh.write("# La velocidad de cada personaje (100-600, mediana 350), solo para el Partido (NOTAS O-340).\r\n")
        fh.write("# Sale de informes/velocidad.csv (la Speed de IE1-3, GO, CS y Galaxy; los de VR, a mano).\r\n")
        fh.write("# Lo genera herramientas/construir_velocidad.py.\r\n")
        w = csv.writer(fh, lineterminator="\r\n")
        w.writerow(["identidad", "velocidad", "nombre", "posicion", "elemento", "como"])
        w.writerows(filas)
    cuenta = {}
    for f in filas:
        k = f[5].split("+")[0] if not f[5].startswith("mediana") else "sin unir"
        cuenta[k] = cuenta.get(k, 0) + 1
    print("personajes", len(filas), cuenta, "desempatados", sum(1 for f in filas if "+" in f[5]))
    if sin:
        print("sin unir (con la mediana de su posicion):")
        for s in sin:
            print("  %s %s %s -> %d" % s)


if __name__ == "__main__":
    main()
