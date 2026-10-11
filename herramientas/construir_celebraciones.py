#!/usr/bin/env python3
"""Que celebracion de gol lleva cada personaje en VR, para el Partido (NOTAS O-343).

    py herramientas\\construir_celebraciones.py

Escribe `datos/reglas-extraidas/celebraciones.csv`: `codigo` (el de su modelo, como la columna
`cara` de los jugadores: c01000010, c01000010_5000...), `tipo` y `celebraciones` (los numeros de
sus eventos de gol, ev71_<numero>; en VR sale una de ellas).

La cadena (sacada mirando las tablas, O-343):
  chara_base (CHARA_BASE_INFO), columna 14 = el tipo de celebracion del personaje (0-14; 0 los
      que no juegan). Es la que cuadra: va de 0 a 14 como los tipos de la tabla de abajo, el
      14 solo lo lleva Harper Evans (el protagonista de VR; su tipo trae la ev71_10070, la unica
      que no esta en soccer_performance_config) y el 5 casi solo chicas
  soccer_perfomance_genre_config (RDBN), m_PerformanceGenreList: performanceType -> (desde,
      cuantas) en m_PerformanceData, que son los crc32 de los eventos ("ev71_10080"...).
      Los de performanceType 0 (por id) son las del que encaja (ev71_110NN): no se usan
Las celebraciones son las animaciones ev71_100NN del partido de VR (O-345). En la partida, cada
miembro de un equipo lleva `performanceId` (la que se le ha elegido en el menu de
celebraciones); en la de Aaron, todas a 0 (sin elegir).

Lee los ficheros de `datos/juego/extracted` (el juego extraido) o, si no estan, del juego
instalado (ievr/rutas.py).
"""
import csv
import glob
import os
import sys
import tempfile
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
from ievr import cfgbin  # noqa: E402
import rdbn  # noqa: E402

EXTRAIDO = os.path.join(RAIZ, "datos", "juego", "extracted", "data")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "celebraciones.csv")
CHARA_BASE = "common/gamedata/character/chara_base_*.cfg.bin"
GENEROS = "common/gamedata/soccer/soccer_perfomance_genre_config_*.cfg.bin"
COLUMNA_TIPO = 14


def fichero(patron):
    """Los bytes del fichero del juego que cumple `patron` (el ultimo por version)."""
    hay = sorted(glob.glob(os.path.join(EXTRAIDO, *patron.split("/"))))
    if hay:
        with open(hay[-1], "rb") as fh:
            return fh.read()
    from ievr import cpk, rutas
    carpeta = rutas.carpeta_del_juego()
    if not carpeta:
        raise SystemExit("no encuentro el juego ni datos/juego/extracted")
    import fnmatch
    idx, _err = cpk.indice_de_carpeta(carpeta, lambda r: fnmatch.fnmatch(r, "data/" + patron))
    if not idx:
        raise SystemExit("el juego no trae " + patron)
    ruta = sorted(idx)[-1]
    nom, e = idx[ruta]
    return cpk.extraer(os.path.join(carpeta, nom), e)


def tipos_de_celebracion():
    """{performanceType: [numero del evento ev71_<numero>, ...]} (sin el 0)."""
    with tempfile.NamedTemporaryFile(suffix=".cfg.bin", delete=False) as fh:
        fh.write(fichero(GENEROS))
        ruta = fh.name
    try:
        t = rdbn.leer(ruta)
    finally:
        os.remove(ruta)
    nombres = {zlib.crc32(("ev71_%05d" % n).encode()) & 0xFFFFFFFF: n for n in range(10000, 12000, 10)}
    datos = [nombres.get(f[0] & 0xFFFFFFFF) for f in t["m_PerformanceData"]["filas"]]
    out = {}
    for _id, tipo, (desde, n) in t["m_PerformanceGenreList"]["filas"]:
        lista = [x for x in datos[desde:desde + n] if x]
        if tipo and lista:
            out[tipo] = lista
    return out


def main():
    tipos = tipos_de_celebracion()
    filas = []
    for nombre, v in cfgbin.leer(fichero(CHARA_BASE)):
        if nombre != "CHARA_BASE_INFO" or len(v) <= COLUMNA_TIPO or not isinstance(v[1], str):
            continue
        codigo, tipo = v[1], v[COLUMNA_TIPO]
        if codigo.startswith("c") and isinstance(tipo, int) and tipo in tipos:
            filas.append((codigo, tipo, " ".join(str(x) for x in tipos[tipo])))
    filas.sort()
    with open(SALIDA, "w", encoding="utf-8", newline="") as fh:
        fh.write("# Que celebracion de gol lleva cada personaje en VR, para el Partido (O-343).\r\n"
                 "# tipo: chara_base col 14 (su tipo de celebracion). celebraciones: las de ese tipo\r\n"
                 "# (soccer_perfomance_genre_config), los numeros de sus eventos ev71_<numero>.\r\n"
                 "# Lo genera herramientas/construir_celebraciones.py.\r\n")
        w = csv.writer(fh)
        w.writerow(["codigo", "tipo", "celebraciones"])
        w.writerows(filas)
    print("%d personajes, %d tipos -> %s" % (len(filas), len(tipos), SALIDA))
    for t in sorted(tipos):
        print("  tipo %2d: %s (%d personajes)" % (t, " ".join("ev71_%05d" % x for x in tipos[t]), sum(1 for f in filas if f[1] == t)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
