#!/usr/bin/env python3
"""Hace `publicar/pizarra-caras.zip`: solo los dibujos del juego que no van
en cada version (caras, cuerpos, escudos... de `datos/iconos/data/dx11/menu/200_icon`).
Va una sola vez en la publicacion "caras" de GitHub y Pizarra lo baja solo
cuando le faltan (NOTAS O-278).

    py herramientas\\empaquetar_caras.py
    gh release upload caras publicar\\pizarra-caras.zip --clobber

Solo hace falta rehacerlo si cambian los dibujos (casi nunca).
"""
import os
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = "datos/iconos/data/dx11/menu/200_icon"
SALIDA = os.path.join(RAIZ, "publicar", "pizarra-caras.zip")


def main():
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    n = 0
    # los PNG ya van comprimidos: guardarlos tal cual es mucho mas rapido
    with zipfile.ZipFile(SALIDA, "w", zipfile.ZIP_STORED) as z:
        base = os.path.join(RAIZ, CARPETA)
        for d, _, fs in os.walk(base):
            for f in fs:
                completo = os.path.join(d, f)
                z.write(completo, CARPETA + "/" + os.path.relpath(completo, base).replace("\\", "/"))
                n += 1
    print("Listo: %s (%.0f MB, %d ficheros)" % (SALIDA, os.path.getsize(SALIDA) / 1e6, n))


if __name__ == "__main__":
    main()
