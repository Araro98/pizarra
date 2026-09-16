#!/usr/bin/env python3
"""Hace `Pizarra-portable.zip`: el programa entero para pasarselo a alguien.

    py herramientas\\empaquetar.py

Dentro va lo justo para que funcione en otro ordenador sin instalar nada:
`Pizarra.exe` (con Python dentro), las pantallas (`web/`), las tablas
(`datos/reglas-extraidas/`), los dibujos que usa el programa (`datos/ui/`,
`datos/iconos/recortes/` y `datos/iconos/data/dx11/menu/200_icon/`), la
carpeta `partidas/` vacia, `version.txt`, `actualizaciones.url` (si existe) y
`LEEME.md`. Quien lo reciba descomprime la carpeta donde quiera y abre
`Pizarra.exe`: el programa busca su partida en su Steam solo (NOTAS O-158).

No va `datos/juego/` (los volcados del juego, 10 GB) ni las herramientas.
"""
import os
import sys
import subprocess
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOMBRE = "Pizarra-portable"
CARPETAS = ["web", "datos/reglas-extraidas", "datos/ui", "datos/iconos/recortes",
            "datos/iconos/data/dx11/menu/200_icon"]
FICHEROS = ["Pizarra.exe", "LEEME.md", "version.txt", "actualizaciones.url"]


def main():
    if not os.path.isfile(os.path.join(RAIZ, "Pizarra.exe")):
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "construir_exe.py")], cwd=RAIZ)
        if r.returncode != 0:
            raise SystemExit("no se ha podido construir el .exe")
    salida = os.path.join(RAIZ, NOMBRE + ".zip")
    n = 0
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in FICHEROS:
            if os.path.isfile(os.path.join(RAIZ, f)):
                z.write(os.path.join(RAIZ, f), NOMBRE + "/" + f); n += 1
        for carpeta in CARPETAS:
            ruta = os.path.join(RAIZ, carpeta)
            for d, _, fs in os.walk(ruta):
                for f in fs:
                    completo = os.path.join(d, f)
                    z.write(completo, NOMBRE + "/" + carpeta + "/" + os.path.relpath(completo, ruta).replace("\\", "/"))
                    n += 1
        z.writestr(NOMBRE + "/partidas/LEEME.txt",
                   "Aqui deja Pizarra las copias de tu partida (para-editar) y las editadas (editadas).\r\n"
                   "Si el programa no encuentra tu partida solo, copia aqui dentro, en una carpeta\r\n"
                   "'actual', el fichero XXXXXXXX-USERDATALIVE de tu Steam (sin renombrarlo).\r\n")
    print("Listo: %s (%.0f MB, %d ficheros)" % (salida, os.path.getsize(salida) / 1e6, n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
