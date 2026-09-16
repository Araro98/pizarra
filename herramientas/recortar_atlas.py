#!/usr/bin/env python3
"""Parte las laminas del juego en piezas sueltas.

    py herramientas\\recortar_atlas.py

El juego no guarda cada icono en su fichero: mete muchos juntos en una lamina
(las bandas de rareza, por ejemplo, vienen las quince en una sola imagen de
1604x1052). Para usarlas en la interfaz hay que separarlas.

No hace falta saber donde esta cada una: se buscan las **manchas de pixeles no
transparentes que se tocan entre si**, que es exactamente una pieza, y se recorta
cada una por su caja. Luego se ordenan como se leen, de arriba abajo y de
izquierda a derecha.

Deja las piezas en `datos/iconos/recortes/`.
"""
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONOS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon")
SALIDA = os.path.join(RAIZ, "datos", "iconos", "recortes")

# Las nueve rarezas, en el orden en que se leen de la lamina. Se comprobo
# mirandola: la columna izquierda baja elite, estrella, leyenda, y los tres
# Idolos; la derecha trae variantes de "comun" y el Diamante al final.
ORDEN_RAREZA = {
    "0": "comun verde", "1": "emergente azul", "2": "elite morada",
    "3": "estrella amarilla", "4": "leyenda naranja", "5": "idolo roja",
    "6": "idolo plateada", "7": "idolo rosa", "8": "diamante",
}


def manchas(imagen, minimo=900):
    """Las cajas de cada grupo de pixeles opacos que se tocan.

    Recorrido por anchura con una pila, no recursivo: una pieza de 700x100 son
    70.000 pixeles y Python se queda sin pila mucho antes.
    """
    ancho, alto = imagen.size
    alfa = imagen.split()[3].load()
    visto = bytearray(ancho * alto)
    cajas = []
    for y0 in range(alto):
        for x0 in range(ancho):
            if visto[y0 * ancho + x0] or alfa[x0, y0] < 24:
                continue
            pila = [(x0, y0)]
            visto[y0 * ancho + x0] = 1
            xa = xb = x0
            ya = yb = y0
            n = 0
            while pila:
                x, y = pila.pop()
                n += 1
                if x < xa: xa = x
                if x > xb: xb = x
                if y < ya: ya = y
                if y > yb: yb = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    u, v = x + dx, y + dy
                    if 0 <= u < ancho and 0 <= v < alto and not visto[v * ancho + u] \
                            and alfa[u, v] >= 24:
                        visto[v * ancho + u] = 1
                        pila.append((u, v))
            if n >= minimo:
                cajas.append((xa, ya, xb + 1, yb + 1))
    return cajas


def como_se_leen(cajas, tolerancia=40):
    """Ordena las cajas por filas, y dentro de cada fila de izquierda a derecha."""
    filas = []
    for c in sorted(cajas, key=lambda c: c[1]):
        for f in filas:
            if abs(f[0][1] - c[1]) <= tolerancia:
                f.append(c)
                break
        else:
            filas.append([c])
    fuera = []
    for f in filas:
        fuera.extend(sorted(f, key=lambda c: c[0]))
    return fuera


def main():
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("falta Pillow:  py -m pip install Pillow")
    lamina = os.path.join(ICONOS, "05_icon_rarity", "es", "icon_rarity.png")
    if not os.path.isfile(lamina):
        raise SystemExit("no encuentro %s. Saca antes los iconos." % lamina)

    im = Image.open(lamina).convert("RGBA")
    cajas = como_se_leen(manchas(im, minimo=5000))
    print("piezas encontradas en la lamina de rarezas: %d" % len(cajas))

    # La lamina trae mas bandas de las que hacen falta (varios "comun" de
    # colores). Se coge por columnas: la izquierda lleva las ocho que interesan
    # y el Diamante es la ultima de la derecha.
    mitad = im.width // 2
    izquierda = [c for c in cajas if c[0] < mitad]
    derecha = [c for c in cajas if c[0] >= mitad]
    orden = []
    if len(izquierda) >= 8:
        # como se leen: elite, estrella, leyenda, idolo x3, comun, emergente
        elite, estrella, leyenda, ir, ip, irosa, comun, emergente = izquierda[:8]
        orden = [comun, emergente, elite, estrella, leyenda, ir, ip, irosa]
    if derecha:
        orden.append(derecha[-1])           # Diamante

    destino = os.path.join(SALIDA, "rareza")
    os.makedirs(destino, exist_ok=True)
    for i, caja in enumerate(orden):
        im.crop(caja).save(os.path.join(destino, "%d.png" % i))
        print("   %d  %-20s %s" % (i, ORDEN_RAREZA.get(str(i), ""), caja))
    print("\nRecortadas %d bandas en %s" % (len(orden), destino))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
