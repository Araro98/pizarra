#!/usr/bin/env python3
"""Averigua que camiseta lleva cada personaje, para poder ensenarlo de cuerpo.

    py herramientas\\construir_equipacion_jugador.py

Deja `datos/reglas-extraidas/equipacion-jugador.csv` con, por personaje, el
nombre del fichero de icono de su equipacion.

**La cadena, que tiene cuatro saltos** (NOTAS O-76):

    chara_base col 16          el equipo al que pertenece
      -> belong_team_config    la ficha de ese equipo
      -> col 16 (y 17,18,19)   los identificadores de sus equipaciones
      -> m_UniformInfoList     (posicion, cuantas) dentro de la lista de modelos
      -> m_UniformModelInfoList
      -> columna 0             crc32("u<equipacion>_<variante>")

Ese ultimo paso es el que lo cierra: los identificadores son el **crc32 del
nombre del fichero**, asi que se pueden traducir al reves calculando el crc32 de
los 4.873 nombres de icono que hay extraidos y mirando cual cuadra. Resuelve
1.052 de las 1.246 filas de modelo.

Una cosa que NO es: el tipo de cuerpo. Se midio la silueta de las variantes de
una misma equipacion y todas tienen el mismo ancho de hombros (147-154 px de
256), asi que **estos iconos no cambian por complexion**; las variantes son
disenos de camiseta distintos. Si el juego ensena cuerpos de distinto tamano,
sera con los modelos 3D, no con estos.
"""
import collections
import csv
import os
import re
import subprocess
import sys
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
ICONOS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon",
                      "10_icon_chr", "uniform")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "equipacion-jugador.csv")

COL_EQUIPO_EN_CHARA_BASE = 16
COL_EQUIPACIONES_EN_EQUIPO = (16, 17, 18, 19)


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    """Las filas de una tabla.

    OJO con la primera linea: en unas tablas es una cabecera con el numero de
    filas y en otras es ya un dato. Descartarla a ciegas fue un error real: las
    equipaciones salian **todas corridas en uno**, y cada jugador aparecia con la
    camiseta del equipo siguiente. Aqui se mira: si la primera linea tiene menos
    columnas que las demas, es cabecera.
    """
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (os.path.basename(fichero), tabla))
    filas = [l.split("\t") for l in r.stdout.splitlines() if l]
    if not filas:
        return filas
    ancho = collections.Counter(len(f) for f in filas).most_common(1)[0][0]
    return filas[1:] if len(filas[0]) < ancho else filas


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def tupla(celda):
    """Saca los dos numeros de una celda `Tuple2I16(a, b)`."""
    m = re.match(r"Tuple2I16\((-?\d+),\s*(-?\d+)\)", (celda or "").strip())
    return (int(m.group(1)), int(m.group(2))) if m else None


def filas_tsv(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for l in fh:
            yield l.rstrip("\n").split("\t")


def main():
    if not os.path.isdir(ICONOS):
        raise SystemExit("no encuentro los iconos de equipacion. Sacalos antes con "
                         "herramientas/extraer_iconos.py")

    # crc32 del nombre de cada icono -> ese nombre
    por_hash = {}
    for f in sorted(os.listdir(ICONOS)):
        if not f.endswith(".png"):
            continue
        base = re.sub(r"_\d+_l$", "", f[:-4])
        por_hash.setdefault(zlib.crc32(base.encode()) & 0xFFFFFFFF, base)
    print("iconos de equipacion indexados: %d" % len(por_hash))

    personaje = os.path.join(GAMEDATA, "character")
    modelos = volcar(unico(personaje, "uniform_config_"), "m_UniformModelInfoList")
    info = volcar(unico(personaje, "uniform_config_"), "m_UniformInfoList")
    equipos = volcar(unico(personaje, "belong_team_config_"), "m_belongTeamInfoList")

    # identificador de equipacion -> (posicion, cuantas) en la lista de modelos
    donde = {}
    for f in info:
        v, t = entero(f[0]), tupla(f[1] if len(f) > 1 else "")
        if v is not None and t:
            donde[v] = t

    # equipo -> nombre del icono de su primera equipacion
    def icono_de(id_equipacion):
        t = donde.get(id_equipacion)
        if not t:
            return None
        ini, cuantas = t
        for k in range(ini, min(ini + max(cuantas, 1), len(modelos))):
            v = entero(modelos[k][0])
            if v in por_hash:
                return por_hash[v]
        return None

    equipo_a_icono = {}
    for f in equipos:
        clave = entero(f[0])
        if clave is None:
            continue
        for col in COL_EQUIPACIONES_EN_EQUIPO:
            if col < len(f):
                nombre = icono_de(entero(f[col]))
                if nombre:
                    equipo_a_icono[clave] = nombre
                    break
    print("equipos con equipacion resuelta: %d de %d" % (len(equipo_a_icono), len(equipos)))

    # personaje -> equipo, via chara_base
    base_por_id = {}
    for c in filas_tsv(os.path.join(TABLAS, "CHARA_BASE_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > COL_EQUIPO_EN_CHARA_BASE:
            base_por_id[v] = c
    param = {}
    for c in filas_tsv(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv")):
        v = entero(c[0]) if c else None
        if v is not None and len(c) > 20:
            param[v] = c

    filas, sin = [], 0
    for identidad, c in param.items():
        b = base_por_id.get(entero(c[1]))
        if b is None:
            sin += 1
            continue
        icono = equipo_a_icono.get(entero(b[COL_EQUIPO_EN_CHARA_BASE]))
        if not icono:
            sin += 1
            continue
        filas.append(["%08X" % identidad, icono])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Equipacion de cada personaje, para ensenarlo de cuerpo.\n"
                 "# identidad = el valor del campo 0xBA162C11 de la partida.\n"
                 "# icono = fichero de datos/iconos/.../10_icon_chr/uniform/<icono>_00_l.png\n"
                 "# Lo genera herramientas/construir_equipacion_jugador.py (NOTAS O-76).\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "icono"])
        w.writerows(sorted(filas))
    print("Escritos %d personajes con equipacion en %s" % (len(filas), SALIDA))
    print("Sin resolver: %d" % sin)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
