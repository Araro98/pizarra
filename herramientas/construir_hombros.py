#!/usr/bin/env python3
"""A que altura se corta la cara para que el pelo largo quede tras la camiseta.

    py herramientas\\construir_hombros.py

Escribe dos tablas en `datos/reglas-extraidas/`:

- `hombros.csv`: cuerpo, hombro. Por busto, la primera fila (0-100 % de la
  altura) en la que el dibujo ocupa mas de la mitad del ancho: ahi empiezan
  los hombros de verdad. Antes se cogia la primera fila con algo fuera del
  cuello, y los cuellos altos de algunas camisetas subian la linea por encima
  de la barbilla y cortaban la cara (NOTAS O-149).
- `barbillas.csv`: cara, barbilla. Por cara, donde acaba la piel bajando por la
  franja central: se toma el color del centro (la nariz) y se baja mientras
  haya pixeles de ese color; el pelo, que es de otro color, no cuenta.

El retrato pinta la cara, el busto encima y otra vez la cara cortada en la
mas baja de las dos lineas: asi la barbilla y el cuello siempre quedan
delante y el pelo por debajo de los hombros queda detras.
"""
import csv
import os

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHR = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon", "10_icon_chr")
BUSTOS = os.path.join(CHR, "uniform")
CARAS = os.path.join(CHR, "face")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas")


def hombro(ruta):
    a = np.array(Image.open(ruta).convert("RGBA"))[:, :, 3]
    alto, ancho = a.shape
    filas = np.where((a > 40).sum(axis=1) > 0.55 * ancho)[0]
    return int(round(100 * (filas[0] if len(filas) else alto) / alto))


def barbilla(ruta):
    a = np.array(Image.open(ruta).convert("RGBA")).astype(int)
    alto, ancho = a.shape[:2]
    c, m = alto // 2, ancho // 2
    piel = a[c - 10:c + 10, m - 10:m + 10, :3].reshape(-1, 3).mean(axis=0)
    banda = a[:, m - 24:m + 24, :]
    cerca = (np.abs(banda[:, :, :3] - piel).sum(axis=2) < 90) & (banda[:, :, 3] > 40)
    y = c
    while y < alto and cerca[y].sum() >= 3:
        y += 1
    return int(round(100 * y / alto))


def escribe(nombre, cabecera, filas, nota):
    ruta = os.path.join(SALIDA, nombre)
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        fh.write(nota + "# Lo genera herramientas/construir_hombros.py.\n")
        w = csv.writer(fh)
        w.writerow(cabecera)
        w.writerows(filas)
    print("Escritas %d filas en %s" % (len(filas), ruta))


def main():
    os.makedirs(SALIDA, exist_ok=True)
    escribe("hombros.csv", ["cuerpo", "hombro"],
            [[f[:-6], hombro(os.path.join(BUSTOS, f))] for f in sorted(os.listdir(BUSTOS)) if f.endswith("_l.png")],
            "# A que altura (0-100 %) empiezan los hombros en cada busto (NOTAS O-149).\n")
    escribe("barbillas.csv", ["cara", "barbilla"],
            [[f[:-6], barbilla(os.path.join(CARAS, f))] for f in sorted(os.listdir(CARAS)) if f.endswith("_l.png")],
            "# A que altura (0-100 %) acaba la piel de la barbilla/cuello en cada cara (NOTAS O-149).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
