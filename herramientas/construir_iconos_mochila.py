#!/usr/bin/env python3
"""Busca la imagen de cada cosa de la mochila y deja la tabla lista.

    py herramientas\\construir_iconos_mochila.py

Antes hay que tener las laminas partidas:

    py herramientas\\recortar_g4tx.py --todas

Escribe dos cosas:

- `datos/reglas-extraidas/iconos-objeto.csv`, con la imagen **propia** de cada
  objeto que la tenga;
- `datos/iconos/recortes/categoria/*.png`, la imagen **de la familia**, que es
  la que se ensena cuando el objeto no tiene la suya.

**Si que hay dibujo por objeto** (NOTAS O-137). Durante meses se creyo que no,
porque el convertidor de texturas sacaba **solo la ultima imagen** de cada
fichero `.g4tx` y `02_icon_item` parecia tener diez dibujos genericos. En
realidad cada uno de esos ficheros guarda **una imagen por objeto con su
nombre**: `icon_item03` son 203 botas, `icon_item08` 82 objetos especiales, y
asi. Aaron tenia razon: estaban ahi.

Como se enlaza: la fila del objeto en `item_config` lleva su nombre interno
(`eq_sh010101` para unas botas), y el dibujo se llama igual.
"""
import csv
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
ICONOS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon")
LAMINAS = os.path.join(RAIZ, "datos", "iconos", "recortes", "laminas")
CATEGORIAS = os.path.join(RAIZ, "datos", "iconos", "recortes", "categoria")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "iconos-objeto.csv")

# (categoria del editor, tabla del item_config)
FUENTES = [
    ("equipo-1-botas", "ITEM_SHOES_INFO_LIST"),
    ("equipo-2-brazalete", "ITEM_MISANGA_INFO_LIST"),
    ("equipo-3-colgante", "ITEM_ACCESSORY_INFO_LIST"),
    ("equipo-4-especial", "ITEM_SPECIAL_INFO_LIST"),
    ("consumible", "ITEM_CONSUME_INFO_LIST"),
    ("escudo", "ITEM_EMBLEM_INFO_LIST"),
    ("emblema-jugador", "ITEM_TITLE_INFO_LIST"),
    ("formacion", "ITEM_FORMATION_INFO_LIST"),
    ("equipacion-equipo", "ITEM_FASHION_INFO_LIST"),
    ("tactica-objeto", "ITEM_SPECIAL_TACTICS_INFO_LIST"),
    ("kizuna", "ITEM_KIZUNA_LINK_INFO_LIST"),
    ("placa", "ITEM_NAME_PLATE_INFO_LIST"),
    ("material", "ITEM_CRAFT_OBJ_INFO_LIST"),
]

# El dibujo de cada familia, para lo que no tenga el suyo. Salen de
# `17_icon_category`, que son las mismas pestanas que ensena el juego, y ahora
# se sabe como se llama cada una.
CATEGORIA_IMAGEN = {
    "aura": "item:icon_item01/gd110001",
    "consumible": "cate:battle01",
    "equipo-1-botas": "cate:equip01",
    "equipo-2-brazalete": "cate:equip02",
    "equipo-3-colgante": "cate:equip03",
    "equipo-4-especial": "cate:equip04",
    "equipacion-equipo": "cate:uniform01",
    "supertecnica": "cate:token01",
    "tactica": "cate:ticket01",
    "tactica-objeto": "cate:ticket01",
    "escudo": "cate:emblem01",
    "emblema-jugador": "cate:token01",
    "formacion": "cate:ticket01",
    "kizuna": "cate:kizuna04",
    "placa": "cate:nameplate01",
    "material": "cate:token01",
}
# Los dibujos planos de familia vienen casi transparentes (el juego les sube la
# opacidad al pintarlos) y en blanco, asi que se suben y se tinen.
TINTE = (32, 78, 140)


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


def _mapa_de_laminas():
    """{nombre del dibujo: ruta} mirando todas las laminas ya partidas."""
    d = {}
    if not os.path.isdir(LAMINAS):
        return d
    for carpeta in sorted(os.listdir(LAMINAS)):
        ruta = os.path.join(LAMINAS, carpeta)
        if not os.path.isdir(ruta):
            continue
        for f in os.listdir(ruta):
            if f.endswith(".png"):
                d.setdefault(f[:-4], carpeta + "/" + f)
    return d


_SUELTAS = {}


def _sueltas(rel):
    if rel not in _SUELTAS:
        try:
            _SUELTAS[rel] = set(os.listdir(os.path.join(ICONOS, *rel.split("/"))))
        except OSError:
            _SUELTAS[rel] = set()
    return _SUELTAS[rel]


def icono_de(cadena, laminas):
    """La imagen de ESE objeto, o cadena vacia si no la tiene.

    Se prueba, por este orden:

    1. el dibujo de su lamina, que se llama igual que el objeto;
    2. `icon_w<cadena>`, que es como se llaman los de tactica;
    3. las imagenes sueltas de escudo, placa y equipacion, que no van en lamina.
    """
    if not cadena:
        return ""
    for clave in (cadena, "icon_w" + cadena, "icon_" + cadena):
        if clave in laminas:
            return laminas[clave]
    if "%s.png" % cadena in _sueltas("01_icon_emblem"):
        return "01_icon_emblem/%s.png" % cadena
    if "%s.png" % cadena in _sueltas("25_icon_nameplate"):
        return "25_icon_nameplate/%s.png" % cadena
    # Las equipaciones visitantes acaban en `_20` y su fichero se llama
    # `..._20_00_l.png`, sin el `_10` de las de casa (NOTAS O-128).
    base = cadena.replace("uni_", "")
    hay = _sueltas("10_icon_chr/uniform")
    for nombre in ("%s_10_00_l.png" % base, "%s_00_l.png" % base):
        if nombre in hay:
            return "10_icon_chr/uniform/" + nombre
    cerca = sorted(x for x in hay
                   if x.startswith(base + "_") and x.endswith("_l.png"))
    return "10_icon_chr/uniform/" + cerca[0] if cerca else ""


def _con_margen(im):
    """Centra el dibujo en un cuadrado, con un poco de aire alrededor."""
    from PIL import Image
    lado = int(max(im.size) * 1.18)
    caja = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    caja.paste(im, ((lado - im.size[0]) // 2, (lado - im.size[1]) // 2), im)
    return caja


def escribe_categorias():
    """Deja en `recortes/categoria` la imagen de cada familia."""
    from PIL import Image
    os.makedirs(CATEGORIAS, exist_ok=True)
    hechas = 0
    for categoria, receta in sorted(CATEGORIA_IMAGEN.items()):
        cual, dato = receta.split(":", 1)
        if cual == "cate":
            ruta = os.path.join(LAMINAS, "icon_category", "icon_cate_%s.png" % dato)
        else:
            ruta = os.path.join(LAMINAS, *dato.split("/")) + ".png"
        if not os.path.isfile(ruta):
            print("  falta %s" % ruta)
            continue
        im = Image.open(ruta).convert("RGBA")
        if cual == "cate":
            alfa = im.getchannel("A")
            tope = alfa.getextrema()[1] or 255
            alfa = alfa.point(lambda v: min(255, int(v * 255 / tope)))
            color = Image.new("RGBA", im.size, TINTE + (255,))
            color.putalpha(alfa)
            caja = color.getbbox()
            im = _con_margen(color.crop(caja) if caja else color)
        im.resize((256, 256), Image.LANCZOS).save(
            os.path.join(CATEGORIAS, categoria + ".png"))
        hechas += 1
    print("Imagenes de familia escritas: %d en %s" % (hechas, CATEGORIAS))


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    laminas = _mapa_de_laminas()
    print("dibujos sueltos disponibles en las laminas: %d" % len(laminas))
    item = unico(os.path.join(GAMEDATA, "item"), "item_config_")

    filas, con_imagen = [], 0
    for categoria, tabla in FUENTES:
        lineas = volcar(item, tabla)
        anchos = {}
        for l in lineas:
            anchos[len(l)] = anchos.get(len(l), 0) + 1
        ancho = max((a for a in anchos if a > 10), default=0)
        cuantos = propios = 0
        for l in lineas:
            if len(l) != ancho:
                continue
            ido = entero(l[0])
            if ido is None:
                continue
            m = re.search(r'String\("([^"]+)"\)', "\t".join(l))
            icono = icono_de(m.group(1) if m else "", laminas)
            filas.append([categoria, en_partida(ido), icono])
            cuantos += 1
            if icono:
                propios += 1
        con_imagen += propios
        print("  %-20s %4d objetos, %4d con dibujo propio" % (categoria, cuantos, propios))

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# La imagen de cada cosa de la mochila.\n"
                 "# id_objeto = como esta en la partida (4 bytes tal cual).\n"
                 "# icono = ruta dentro de 200_icon o de recortes/laminas;\n"
                 "#         vacio = usa la de su familia.\n"
                 "# Lo genera herramientas/construir_iconos_mochila.py (NOTAS O-137).\n")
        w = csv.writer(fh)
        w.writerow(["categoria", "id_objeto", "icono"])
        w.writerows(filas)
    print("Escritas %d filas (%d con imagen propia) en %s"
          % (len(filas), con_imagen, SALIDA))
    escribe_categorias()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
