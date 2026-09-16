#!/usr/bin/env python3
"""Decide con que cuerpo (busto) se dibuja cada personaje debajo de su cara.

    py herramientas\\construir_cuerpos.py

Escribe `datos/reglas-extraidas/cuerpos.csv`: identidad, cuerpo, complexion,
tipo_cuerpo, origen. `cuerpo` es el nombre del fichero de
`10_icon_chr/uniform/` sin el `_l.png`.

**De donde sale, ya con la tabla del propio juego** (NOTAS O-148, O-154):

    chara_base col 6  ->  CHARA_MODEL_INFO (el modelo del personaje)
                             col 4  ->  CHARA_BODY_INFO: tipo de cuerpo (col 6, 0-7)
                             col 5  ->  crc32 del dibujo de su ropa en los menus

Ese dibujo es de dos clases:

- **Camiseta de equipo**, `u<equipo><diseno>01_<variante>` (siempre con la talla
  01 en la tabla): se le pone la talla del cuerpo, `01..08` = tipo + 1, y en
  las camisetas de portero (`51..58`) igual pero desde 51. Comprobado a ojo:
  el cuello del busto encaja con la barbilla justo en esa talla. Ojo: 3.749
  modelos traen la del Raimon (`u0101`) de serie; ahi la camiseta buena es la
  de su equipo de historia (`equipacion-jugador.csv`, O-77) y del modelo solo
  se coge si es de portero.
- **Ropa propia**, `u<string_id sin la c>` (307 personajes: casi todos los
  entrenadores y gerentes, y algunos jugadores de historia): el peto de Nerina
  Hartland, la camisa de Jambo Reemoth, el traje de Schemer Guile... Un solo
  fichero, sin tallas.

Si el modelo no lleva dibujo (las versiones de historia `_5000`, 244), se cae
a la camiseta de su equipo de historia (`equipacion-jugador.csv`, O-77) con la
talla del cuerpo, y si tampoco, a `u0101` (la primera del juego).
"""
import csv
import os
import re
import sys
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
ICONOS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon",
                      "10_icon_chr", "uniform")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "cuerpos.csv")
CAMISETA_SIN_EQUIPO = "u0101"


def filas(tabla, minimo=2):
    out = []
    with open(os.path.join(TABLAS, tabla + ".tsv"), encoding="utf-8") as fh:
        for l in fh:
            c = l.rstrip("\n").split("\t")
            if len(c) >= minimo:
                out.append(c)
    return out


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def main():
    existe = {f[:-6] for f in os.listdir(ICONOS) if f.endswith("_l.png")}
    familias = {re.sub(r"_\d+_l$", "", f[:-4]) for f in os.listdir(ICONOS) if f.endswith("_l.png")}
    por_hash = {zlib.crc32(n.encode()) & 0xFFFFFFFF: n for n in familias | existe}
    base = {entero(c[0]): c for c in filas("CHARA_BASE_INFO_LIST", 20)}
    modelo = {entero(m[0]): m for m in filas("CHARA_MODEL_INFO_LIST", 6)}
    cuerpo_info = {entero(b[0]): b for b in filas("CHARA_BODY_INFO_LIST", 7)}
    camiseta = {f["identidad"].upper(): f["icono"]
                for f in reglas._tabla("equipacion-jugador.csv")}

    def con_talla(familia, tipo, diseno, portero):
        """`familia` es `uXXXX`; se prueba la talla del cuerpo y, si no hay, las
        de abajo, y al final la 01."""
        suelo = 51 if portero else 1
        tallas = ["%02d" % t for t in range(suelo + tipo, suelo - 1, -1)] + ["01"]
        for t in tallas:
            for d in (diseno, "10", "20"):
                nombre = "%s%s_%s_00" % (familia, t, d)
                if nombre in existe:
                    return nombre
        return None

    salida = []
    cuenta = {"camiseta": 0, "portero": 0, "propia": 0, "respaldo_equipo": 0,
              "respaldo_generico": 0, "sin_tipo": 0}
    for f in reglas._tabla("personajes.csv"):
        ident = f["identidad"].upper()
        cb = base.get(entero(f.get("chara_base_id")))
        m = modelo.get(entero(cb[6])) if cb else None
        complexion, tipo = "", 0
        b = cuerpo_info.get(entero(m[4])) if m else None
        if b and b[6].isdigit() and int(b[6]) < 8:
            complexion = b[1].split("/")[-1].split(".")[0]
            tipo = int(b[6])
        else:
            cuenta["sin_tipo"] += 1
        dibujo = por_hash.get(entero(m[5])) if m else None
        cuerpo, origen = None, ""
        kit = camiseta.get(ident)
        if dibujo and re.match(r"^u\d{6}_\d{2}$", dibujo):
            # El modelo dice si es de portero (5x). La camiseta `u0101` (Raimon)
            # en el modelo es la de serie de 3.749 jugadores de otros equipos:
            # ahi manda la de su equipo de historia (O-154).
            portero = dibujo[5] == "5"
            if dibujo[:5] == "u0101" and kit:
                familia, diseno = kit[:5], kit.rsplit("_", 1)[1]
            else:
                familia, diseno = dibujo[:5], dibujo[-2:]
            cuerpo = con_talla(familia, tipo, diseno, portero)
            origen = "portero" if portero else "camiseta"
        elif dibujo and dibujo in existe:
            cuerpo, origen = dibujo, "propia"
        if not cuerpo:
            if kit:
                cuerpo = con_talla(kit[:5], tipo, kit.rsplit("_", 1)[1], False)
                origen = "respaldo_equipo"
        if not cuerpo:
            cuerpo = con_talla(CAMISETA_SIN_EQUIPO, tipo, "10", False) or ""
            origen = "respaldo_generico"
        cuenta[origen] += 1
        salida.append([ident, cuerpo, complexion, str(tipo) if complexion else "", origen])
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Con que busto se dibuja cada personaje debajo de la cara (NOTAS O-148, O-154).\n"
                 "# cuerpo = fichero de 10_icon_chr/uniform/<cuerpo>_l.png, ya en su talla.\n"
                 "# complexion = cuerpo base 3D (c000101..c000401); tipo_cuerpo = 0-7, lo que usa\n"
                 "# el filtro de cuerpo del juego; origen = camiseta / portero / propia / respaldo.\n"
                 "# Lo genera herramientas/construir_cuerpos.py.\n")
        w = csv.writer(fh)
        w.writerow(["identidad", "cuerpo", "complexion", "tipo_cuerpo", "origen"])
        w.writerows(salida)
    print("Escritos %d personajes en %s" % (len(salida), SALIDA))
    print("  camiseta de equipo: %(camiseta)d, de portero: %(portero)d, ropa propia: %(propia)d, "
          "respaldo por equipo de historia: %(respaldo_equipo)d, generico: %(respaldo_generico)d, "
          "sin tipo de cuerpo: %(sin_tipo)d" % cuenta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
