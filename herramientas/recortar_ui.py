#!/usr/bin/env python3
"""Recorta de las laminas del juego las piezas sueltas de interfaz.

    py herramientas\\recortar_ui.py

Deja los PNG en `datos/ui/`.

Aaron dijo que el editor se veia "muy plano y muy IA". La forma de arreglarlo no
es inventarse un estilo: es **usar los mismos trozos de imagen que usa el
juego**. Estan todos en `menu/20_cmn`, que son laminas con varias piezas
pegadas; aqui se cortan con las coordenadas que salieron de medir el canal alfa
(las bandas opacas separadas por huecos transparentes).

| Pieza | De donde sale | Para que |
|---|---|---|
| `franja-azul` | cmn03_06 | el titulo de cada seccion |
| `franja-cian` | cmn03_06 | la banda clara con salpicaduras de debajo |
| `balon` | cmn03_06 | la marca de agua de balon |
| `balon-grande` | cmn03_05 | el balon grande del fondo |
| `busqueda` | cmn06_21 | la caja de buscar |
| `busqueda-activa` | cmn06_21 | la misma con el borde cian encendido |
| `lupa` | cmn06_21 | el icono de buscar |
| `destello` | cmn05_01 | el fogonazo detras de lo seleccionado |
| `flecha` | cmn05_01 | las flechas verdes de pasar pagina |
| `barra` | cmn06_01 | la barra larga de abajo |

Las tres franjas se estiran a lo ancho en CSS (`background-size:100% 100%`), que
es exactamente lo que hace el juego con ellas.
"""
import glob
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMINAS = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "20_cmn")
SALIDA = os.path.join(RAIZ, "datos", "ui")

# nombre -> (lamina, (izq, arriba, der, abajo))  en pixeles de la lamina
PIEZAS = {
    "franja-azul":     ("cmn03_06", (10, 10, 617, 81)),
    "franja-cian":     ("cmn03_06", (10, 98, 617, 169)),
    "balon-oscuro":    ("cmn03_06", (1, 178, 122, 242)),
    "balon":           ("cmn03_06", (129, 178, 250, 242)),
    "balon-grande":    ("cmn03_05", (149, 182, 313, 263)),
    "busqueda":        ("cmn06_21", (6, 6, 598, 46)),
    "busqueda-activa": ("cmn06_21", (2, 58, 602, 106)),
    "lupa":            ("cmn06_21", (74, 115, 133, 157)),
    "lupa-clara":      ("cmn06_21", (15, 115, 74, 157)),
    "destello":        ("cmn05_01", (15, 2, 512, 500)),
    "flecha":          ("cmn05_01", (521, 160, 659, 296)),
    "flecha-fina":     ("cmn05_01", (521, 310, 659, 374)),
    "barra":           ("cmn06_01", None),
    "candado":         ("cmn01_26", None),
    "aviso":           ("cmn01_12", None),
}


def lamina(nombre):
    hay = [x for x in glob.glob(os.path.join(LAMINAS, "**", "*.png"), recursive=True)
           if os.path.basename(x)[:-4] == nombre and os.sep + "zh_" not in x]
    return hay[0] if hay else None


def main():
    from PIL import Image
    os.makedirs(SALIDA, exist_ok=True)
    n = 0
    for pieza, (origen, caja) in sorted(PIEZAS.items()):
        ruta = lamina(origen)
        if not ruta:
            print("   falta la lamina %s (me salto %s)" % (origen, pieza))
            continue
        im = Image.open(ruta).convert("RGBA")
        trozo = im.crop(caja) if caja else im
        # se recorta el aire transparente de alrededor para que la pieza
        # empiece justo donde empieza el dibujo
        borde = trozo.split()[3].getbbox()
        if borde:
            trozo = trozo.crop(borde)
        trozo.save(os.path.join(SALIDA, pieza + ".png"), "PNG", optimize=True)
        print("   %-16s %s  %dx%d" % (pieza, origen, trozo.width, trozo.height))
        n += 1
    print("Recortadas %d piezas en %s" % (n, SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
