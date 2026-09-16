#!/usr/bin/env python3
"""Enlaza los objetos de la mochila con lo que guarda un equipo.

    py herramientas\\construir_equipo_objetos.py

Deja `datos/reglas-extraidas/equipo-objetos.csv`.

**El lio que resuelve** (NOTAS O-124): una tactica o una equipacion tienen **dos
identificadores distintos**. Uno es el del objeto que esta en la mochila y otro
es el que el equipo guarda dentro. Por eso el editor decia que Aaron no tenia
ninguna tactica teniendo 61: estaba comparando los dos numeros, que no son el
mismo.

El enlace esta en la **ultima columna** de la fila del objeto:

    ITEM_FASHION_INFO_LIST         ... String("uni_u110301") ... 1796276832
                                                                 ^ 0x6B110260
                                                                 = la equipacion
                                                                   del ECLIPSE

Con esta tabla el editor puede ofrecer **lo que de verdad tiene** en cada
desplegable del equipo, en vez de solo lo que ya esta puesto en algun sitio.
"""
import csv
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "equipo-objetos.csv")

# (que es, tabla del item_config, columna del name_id)
# El nombre esta en la **columna 0**, que es el propio id del objeto: se
# comprobo probando todas las columnas contra los textos de la partida.
# `enlace`: de donde sale el valor que guarda el equipo.
#   "ultima" -> la ultima columna de la fila
#   "mismo"  -> el propio id del objeto (los escudos son asi)
# `icono`: como se llega a su imagen desde la cadena interna de la fila.
#   emblema  -> 200_icon/01_icon_emblem/<cadena>.png     (330 de 330 existen)
#   uniforme -> 10_icon_chr/uniform/<cadena sin uni_>_10_00_l.png
FUENTES = [
    ("escudo", "ITEM_EMBLEM_INFO_LIST", "mismo", "emblema"),
    ("equipacion", "ITEM_FASHION_INFO_LIST", "ultima", "uniforme"),
    ("tactica", "ITEM_SPECIAL_TACTICS_INFO_LIST", "ultima", ""),
    ("supertactica", "ITEM_SUPER_TACTICS_INFO_LIST", "ultima", ""),
    ("formacion", "ITEM_FORMATION_INFO_LIST", "ultima", ""),
]
CHR = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon")


_CACHE_UNIFORMES = {}


def icono_de(clase, cadena):
    """Ruta de la imagen dentro de 200_icon, o vacio si no hay.

    Las equipaciones **visitantes** traen el numero dentro del nombre
    (`u041401_20`) y su fichero se llama `u041401_20_00_l.png`, sin el `_10`.
    Por eso al principio salian sin dibujo: se probaba una sola forma. Ahora se
    prueban las dos y, si no, cualquier fichero que empiece igual.
    """
    if not cadena:
        return ""
    if clase == "emblema":
        rel = "01_icon_emblem/%s.png" % cadena
        return rel if os.path.isfile(os.path.join(CHR, *rel.split("/"))) else ""
    if clase != "uniforme":
        return ""
    base = cadena.replace("uni_", "")
    carpeta = os.path.join(CHR, "10_icon_chr", "uniform")
    if not _CACHE_UNIFORMES:
        try:
            _CACHE_UNIFORMES["hay"] = sorted(os.listdir(carpeta))
        except OSError:
            _CACHE_UNIFORMES["hay"] = []
    hay = _CACHE_UNIFORMES["hay"]
    for nombre in ("%s_10_00_l.png" % base, "%s_00_l.png" % base):
        if nombre in hay:
            return "10_icon_chr/uniform/" + nombre
    cerca = [x for x in hay if x.startswith(base + "_") and x.endswith("_l.png")]
    return "10_icon_chr/uniform/" + cerca[0] if cerca else ""


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return [l.split("\t") for l in r.stdout.splitlines() if l]


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def en_partida(v):
    """Los cuatro bytes tal y como se guardan en la partida."""
    return bytes.fromhex("%08X" % v)[::-1].hex().upper()


def main():
    sys.path.insert(0, RAIZ)
    from ievr import tlv
    nombres = tlv.nombres()
    item = unico(os.path.join(GAMEDATA, "item"), "item_config_")

    filas = []
    for etiqueta, tabla, enlace, clase in FUENTES:
        lin = volcar(item, tabla)
        # la fila del objeto es la mas ancha de la tabla
        anchos = {}
        for l in lin:
            anchos[len(l)] = anchos.get(len(l), 0) + 1
        ancho = max((a for a in anchos if a > 10), default=0)
        n = 0
        for l in lin:
            if len(l) != ancho:
                continue
            ido = entero(l[0])
            if ido is None:
                continue
            valor = ido if enlace == "mismo" else entero(l[-1])
            if not valor:
                continue
            texto = nombres.get(en_partida(ido))
            nombre = texto[0] if texto else ""
            m = re.search(r'String\("([^"]+)"\)', "	".join(l))
            filas.append([etiqueta, en_partida(ido), "%08X" % valor, nombre,
                          icono_de(clase, m.group(1) if m else "")])
            n += 1
        print("   %-14s %d objetos con enlace (de %d filas)" % (etiqueta, n, len(lin)))

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que objeto de la mochila da cada escudo, equipacion o tactica.\n"
                 "# id_objeto = como esta en la mochila (4 bytes tal cual).\n"
                 "# valor_equipo = lo que guarda el equipo, en hexadecimal.\n"
                 "# Lo genera herramientas/construir_equipo_objetos.py (NOTAS O-124).\n")
        w = csv.writer(fh)
        w.writerow(["tipo", "id_objeto", "valor_equipo", "nombre", "icono"])
        w.writerows(filas)
    print("Escritas %d filas en %s" % (len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
