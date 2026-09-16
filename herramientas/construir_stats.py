#!/usr/bin/env python3
"""Saca del juego las tablas de stats y lo que suma cada objeto.

    py herramientas\\construir_stats.py

Deja tres ficheros en `datos/reglas-extraidas/`:

- `stats-tabla.csv`  — los siete stats por (posicion, patron, rango) y nivel.
- `stats-clave.csv`  — de cada personaje, su posicion y su patron.
- `bonus-objeto.csv` — lo que suma cada objeto a cada stat.

**Como se busca cada tabla** (NOTAS O-114). No todas usan la misma clave, y
darlo por hecho fue lo que tuvo los stats mal mucho tiempo:

| tabla | clave | filas |
|---|---|---|
| `m_growthTableMainList` (niveles 50 y 99) | posicion, patron, rango | 4 x 2 x 6 = 48 |
| `m_growthTableLv1List` | posicion, **posicion secundaria**, rango | 12 x 3 = 36 |
| `m_growthTableLv30List` | posicion, posicion secundaria, patron, rango | 12 x 2 x 6 = 144 |

Y el **rango no es la rareza**: es la columna 9 de `chara_param`, que trae el
personaje de fabrica y no cambia nunca. La rareza de la partida entra como
**multiplicador** al final:

    stat = parte_entera( base x multiplicador(rareza) ) + arbol + judias + equipacion

Comprobado con Alex Zabel contra el juego, **las catorce cifras exactas**: a nivel
1 y a nivel 99, con y sin equipacion.

Los siete stats van siempre en este orden: potencia, control, tecnica, presion,
fisico, agilidad, inteligencia.
"""
import collections
import csv
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas")

STATS = ["potencia", "control", "tecnica", "presion", "fisico", "agilidad", "inteligencia"]
COL_POSICION, COL_POSICION_ALT, COL_PATRON, COL_RANGO = 3, 4, 7, 9


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s" % tabla)
    return [l.split("\t") for l in r.stdout.splitlines() if l]


def octeto(x):
    x = (x or "").strip()
    return int(x[5:-1]) if x.startswith("Byte(") else int(x)


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def filas_tsv(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def indexar(filas, nclave, nstats):
    fuera = {}
    for c in filas:
        if len(c) < nclave + nstats:
            continue
        try:
            clave = tuple(octeto(c[i]) for i in range(nclave))
            fuera.setdefault(clave, [int(c[nclave + i]) for i in range(nstats)])
        except ValueError:
            continue
    return fuera


def main():
    personaje = os.path.join(GAMEDATA, "character")
    crecimiento = unico(personaje, "growth_table_config_")
    principal = indexar(volcar(crecimiento, "m_growthTableMainList"), 3, 14)
    lv1 = indexar(volcar(crecimiento, "m_growthTableLv1List"), 3, 7)
    lv30 = indexar(volcar(crecimiento, "m_growthTableLv30List"), 4, 7)
    print("filas de crecimiento: principal %d, nivel 1 %d, nivel 30 %d"
          % (len(principal), len(lv1), len(lv30)))

    # Una fila por (posicion, posicion secundaria, patron, rango). El nivel 1 no
    # depende del patron y el 50/99 no dependen de la posicion secundaria, asi
    # que cada tabla se busca con lo suyo.
    # La tabla de nivel 1 solo trae los rangos 0, 1 y 2, asi que se recorre la
    # principal (que los trae los seis) y se rellena lo que haya de las otras.
    parejas = sorted({(pos, alt) for pos, alt, _ in lv1})
    filas = []
    for (pos, patron, rango), nums in sorted(principal.items()):
        for p2, alt in [x for x in parejas if x[0] == pos]:
            a1 = lv1.get((pos, alt, rango)) or lv1.get((pos, alt, min(rango, 2)))
            a30 = lv30.get((pos, alt, patron, rango))
            filas.append([pos, alt, patron, rango] + (a1 or [""] * 7)
                         + (a30 or [""] * 7) + nums[:7] + nums[7:14])
    cab = (["posicion", "posicion_alt", "patron", "rango"]
           + ["lv1_" + s for s in STATS]
           + ["lv30_" + s for s in STATS] + ["lv50_" + s for s in STATS]
           + ["lv99_" + s for s in STATS])
    os.makedirs(SALIDA, exist_ok=True)
    with open(os.path.join(SALIDA, "stats-tabla.csv"), "w", newline="",
              encoding="utf-8") as fh:
        fh.write("# Stats por posicion, posicion secundaria, patron y rango.\n"
                 "# El rango es la columna 9 de chara_param, NO la rareza: esa\n"
                 "# entra despues como multiplicador (NOTAS O-114).\n"
                 "# Orden: potencia, control, tecnica, presion, fisico, agilidad,\n"
                 "# inteligencia. Lo genera herramientas/construir_stats.py.\n")
        w = csv.writer(fh)
        w.writerow(cab)
        w.writerows(filas)
    print("Escritas %d filas de tabla" % len(filas))

    # clave de cada personaje
    claves, rangos = [], collections.Counter()
    for c in filas_tsv(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is None or len(c) < 43:
            continue
        try:
            claves.append(["%08X" % v, int(c[COL_POSICION]),
                           int(c[COL_POSICION_ALT]), int(c[COL_PATRON]),
                           int(c[COL_RANGO])])
            rangos[int(c[COL_RANGO])] += 1
        except ValueError:
            pass
    with open(os.path.join(SALIDA, "stats-clave.csv"), "w", newline="",
              encoding="utf-8") as fh:
        fh.write("# Con que fila de stats-tabla.csv se busca cada personaje.\n"
                 "# El rango lo trae el personaje de fabrica y no cambia; la\n"
                 "# rareza de la partida entra como multiplicador (NOTAS O-114).\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "posicion", "posicion_alt", "patron", "rango"])
        w.writerows(sorted(claves))
    print("Escritos %d personajes (rangos: %s)"
          % (len(claves), dict(sorted(rangos.items()))))

    # --- lo que suma cada objeto
    item = unico(os.path.join(GAMEDATA, "item"), "item_config_")
    TABLAS_OBJ = {
        "equipo-1-botas": "ITEM_SHOES_INFO_LIST",
        "equipo-2-brazalete": "ITEM_MISANGA_INFO_LIST",
        "equipo-3-colgante": "ITEM_ACCESSORY_INFO_LIST",
        "equipo-4-especial": "ITEM_SPECIAL_INFO_LIST",
    }
    bonus = []
    for categoria, tabla in TABLAS_OBJ.items():
        lin = volcar(item, tabla)
        # OJO: las filas NO alternan siempre objeto/bonus. Hay objetos sin fila
        # de bonus, y dar por hecho que van de dos en dos descuadraba el resto de
        # la tabla: salian cosas como "Potencia +1130486001", que era leer la
        # cabecera de otro objeto como si fuera un bonus (NOTAS O-97).
        # Se empareja por ANCHO: la fila larga es el objeto y la de diez columnas
        # que venga justo detras es su bonus.
        anchos = collections.Counter(len(l) for l in lin)
        ancho_objeto = max((a for a, _ in anchos.most_common() if a > 12), default=0)
        n, sin_bonus = 0, 0
        for i, fila in enumerate(lin):
            if len(fila) != ancho_objeto:
                continue
            v = entero(fila[0])
            if v is None:
                continue
            suma = lin[i + 1] if i + 1 < len(lin) else []
            if len(suma) != 10:
                sin_bonus += 1
                continue
            try:
                nums = [int(x) for x in suma[:7]]
            except ValueError:
                sin_bonus += 1
                continue
            en_partida = bytes.fromhex("%08X" % v)[::-1].hex().upper()
            bonus.append([en_partida, categoria] + nums)
            n += 1
        print("   %-20s %d objetos (%d sin bonus)" % (categoria, n, sin_bonus))
    with open(os.path.join(SALIDA, "bonus-objeto.csv"), "w", newline="",
              encoding="utf-8") as fh:
        fh.write("# Lo que suma cada objeto a los siete stats.\n"
                 "# id = los 4 bytes tal y como aparecen en la partida.\n"
                 "# Lo genera herramientas/construir_stats.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "categoria"] + STATS)
        w.writerows(bonus)
    print("Escritos %d objetos con bonus" % len(bonus))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
