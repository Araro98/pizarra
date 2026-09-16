#!/usr/bin/env python3
"""Parte una lamina `.g4tx` del juego en sus dibujos sueltos, **con su nombre**.

    py herramientas\\recortar_g4tx.py <fichero.g4tx> [carpeta de salida]
    py herramientas\\recortar_g4tx.py --todas

**El formato, resuelto** (NOTAS O-137). Un `.g4tx` no es una imagen suelta: es
una lamina con muchos dibujos dentro y, pegada al final, la imagen en DDS. Lo
que hacia falta era la tabla de recortes, y esta en la propia cabecera:

| donde | que |
|---|---|
| 0x00 | `G4TX` |
| 0x2C | u32: cuantos bytes desde el final empieza el DDS |
| 0x78 | u16 ancho, u16 alto de la lamina entera |
| 0x94 | la tabla de recortes: 24 bytes por dibujo, los 8 primeros son x, y, ancho, alto (u16) |
| ... | mas adelante, los **nombres**, uno detras de otro y separados por un cero |

El primer nombre es el de la propia lamina y los demas van **en el mismo orden
que los recortes**. Comprobado con `icon_common`: 144 recortes y 145 nombres, y
cada dibujo es lo que su nombre dice (`gender01` es el simbolo de hombre,
`platform02_01` el logo de Switch, `btl01_parameter...` los siete stats).

**Hay dos clases de lamina.** La de arriba es una sola imagen con muchos
recortes dentro. La otra guarda **una imagen entera por dibujo**, una detras de
otra: el numero de imagenes va en 0x20 y los nombres igual, seguidos. Asi son
las de la mochila: `icon_item03` son **203 botas** de 256x256 cada una, con su
nombre (`eq_sh010101`...). Eso es lo que echaba en falta Aaron, y estaba ahi
desde el principio: el convertidor antiguo sacaba **solo la ultima imagen** del
fichero y por eso parecia que cada familia tenia un unico dibujo generico
(NOTAS O-137, que corrige O-95 y O-103).
"""
import io
import os
import struct
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRUDAS = os.path.join(RAIZ, "datos", "juego", "laminas")
SALIDA = os.path.join(RAIZ, "datos", "iconos", "recortes", "laminas")


def _imagenes_sueltas(d, dds, ruta):
    """([(nombre, imagen)]) de una lamina que guarda una imagen por dibujo."""
    from PIL import Image
    cuantas = struct.unpack_from("<H", d, 0x20)[0]
    trozos = []
    i = d.find(b"DDS ", dds - 4 if dds >= 4 else 0)
    while i != -1:
        trozos.append(i)
        i = d.find(b"DDS ", i + 1)
    if not trozos or len(trozos) != cuantas:
        return []
    nombres = _nombres(d, trozos[0], ruta)
    # aqui el nombre de la propia lamina **no** va delante: son N nombres para N
    # imagenes. Si viniera de mas, se quita el primero.
    if len(nombres) == cuantas + 1:
        nombres = nombres[1:]
    if len(nombres) != cuantas:
        return []
    fuera = []
    for k, ini in enumerate(trozos):
        fin = trozos[k + 1] if k + 1 < len(trozos) else len(d)
        try:
            im = Image.open(io.BytesIO(d[ini:fin]))
            im.load()
        except Exception:
            continue
        fuera.append((nombres[k], im.convert("RGBA")))
    return fuera


def _nombres(d, hasta, ruta):
    """Los nombres, que van seguidos y separados por un cero, antes de `hasta`."""
    base = os.path.splitext(os.path.basename(ruta))[0].encode("ascii", "replace")
    i = d.find(base + b"\0")
    if i < 0 or i >= hasta:
        # laminas de imagenes sueltas: el primer nombre no es el del fichero,
        # asi que se busca la ultima tirada larga de texto antes de las imagenes
        i = _primer_texto(d, hasta)
    if i < 0:
        return []
    fuera = []
    for trozo in d[i:hasta].split(b"\0"):
        if not trozo:
            continue
        if not all(32 <= c < 127 for c in trozo):
            break
        fuera.append(trozo.decode("ascii"))
    return fuera


def _primer_texto(d, hasta):
    """Donde empieza la tirada de nombres: el primer texto largo seguido de cero."""
    i = 0
    while i < hasta:
        if 97 <= d[i] <= 122:                      # empieza por minuscula
            j = i
            while j < hasta and 32 <= d[j] < 127:
                j += 1
            if j - i >= 6 and j < hasta and d[j] == 0:
                # tiene que haber al menos dos nombres seguidos
                k = j + 1
                while k < hasta and d[k] == 0:
                    k += 1
                m = k
                while m < hasta and 32 <= d[m] < 127:
                    m += 1
                if m - k >= 6:
                    return i
            i = j + 1
        else:
            i += 1
    return -1


def leer(ruta):
    """(ancho, alto, [(x, y, w, h)], [nombres], imagen) de una lamina."""
    from PIL import Image
    d = open(ruta, "rb").read()
    if d[:4] != b"G4TX":
        raise ValueError("%s no es un g4tx" % ruta)
    dds = len(d) - struct.unpack_from("<I", d, 0x2C)[0]
    ancho, alto = struct.unpack_from("<HH", d, 0x78)
    recortes = []
    off = 0x94
    while off + 24 <= dds:
        x, y, w, h = struct.unpack_from("<4H", d, off)
        if w == 0 or h == 0 or x + w > ancho or y + h > alto:
            break
        recortes.append((x, y, w, h))
        off += 24

    # Los nombres: el primero es el de la propia lamina, asi que se busca por el
    # nombre del fichero y a partir de ahi van todos seguidos.
    base = os.path.splitext(os.path.basename(ruta))[0].encode("ascii", "replace")
    i = d.find(base + b"\0", off)
    if i < 0:
        i = d.find(base + b"\0")
    nombres = []
    if i >= 0:
        for trozo in d[i:dds].split(b"\0"):
            if not trozo:
                continue
            try:
                texto = trozo.decode("ascii")
            except UnicodeDecodeError:
                break
            if not all(32 <= c < 127 for c in trozo):
                break
            nombres.append(texto)
    imagen = Image.open(io.BytesIO(d[dds:]))
    imagen.load()
    return ancho, alto, recortes, nombres, imagen.convert("RGBA")


def partir(ruta, carpeta):
    d = open(ruta, "rb").read()
    if d[:4] != b"G4TX":
        raise ValueError("%s no es un g4tx" % ruta)
    dds = len(d) - struct.unpack_from("<I", d, 0x2C)[0]
    sueltas = _imagenes_sueltas(d, dds, ruta)
    if sueltas:
        os.makedirs(carpeta, exist_ok=True)
        for nombre, im in sueltas:
            im.save(os.path.join(carpeta, nombre + ".png"))
        return len(sueltas), len(sueltas), len(sueltas)
    ancho, alto, recortes, nombres, imagen = leer(ruta)
    # nombres[0] es la lamina; del 1 en adelante, uno por recorte
    sueltos = nombres[1:] if len(nombres) > len(recortes) else nombres
    os.makedirs(carpeta, exist_ok=True)
    hechos = 0
    for k, (x, y, w, h) in enumerate(recortes):
        nombre = sueltos[k] if k < len(sueltos) else "sin_nombre_%03d" % k
        trozo = imagen.crop((x, y, x + w, y + h))
        trozo.save(os.path.join(carpeta, nombre + ".png"))
        hechos += 1
    return hechos, len(recortes), len(nombres)


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == "--todas":
        if not os.path.isdir(CRUDAS):
            raise SystemExit("no hay laminas en %s" % CRUDAS)
        total = 0
        for raiz, _, ficheros in os.walk(CRUDAS):
            for f in sorted(ficheros):
                if not f.lower().endswith(".g4tx"):
                    continue
                nombre = os.path.splitext(f)[0]
                try:
                    hechos, n, m = partir(os.path.join(raiz, f),
                                          os.path.join(SALIDA, nombre))
                except Exception as e:
                    print("  %-24s fallo: %s" % (nombre, e))
                    continue
                print("  %-24s %4d dibujos (%d recortes, %d nombres)"
                      % (nombre, hechos, n, m))
                total += hechos
        print("Total: %d dibujos en %s" % (total, SALIDA))
        return 0
    destino = args[1] if len(args) > 1 else os.path.join(
        SALIDA, os.path.splitext(os.path.basename(args[0]))[0])
    hechos, n, m = partir(args[0], destino)
    print("%d dibujos en %s (%d recortes, %d nombres)" % (hechos, destino, n, m))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
