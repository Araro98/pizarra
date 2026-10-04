#!/usr/bin/env python3
"""Hace el programa de ventana `Pizarra.exe` en la raiz del proyecto.

    py herramientas\\construir_exe.py

Usa PyInstaller (`py -m pip install pyinstaller pywebview`). El .exe lleva
Python, `ievr/` y `lanzador.py`; las pantallas, los datos y las partidas se
leen de la carpeta donde este el .exe, asi que hay que dejarlo en la raiz.
"""
import os
import shutil
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOMBRE = "Pizarra"


# Lo que PyInstaller no ve solo: los modulos que el servidor importa dentro de
# las funciones y, para convertir los modelos 3D del partido en el PC de cada
# uno (O-293), numpy y Pillow con los lectores de DDS (las texturas del juego)
# y PNG (las que van dentro de cada .glb).
OCULTOS = ["ievr.servidor", "ievr.basedatos",
           "ievr.cpk", "ievr.g4", "ievr.g4anim", "ievr.modelos3d",
           "numpy", "PIL.Image", "PIL.DdsImagePlugin", "PIL.PngImagePlugin"]


def orden(salida):
    """La orden de PyInstaller, dejando todo lo suyo en `salida`."""
    ocultos = [x for m in OCULTOS for x in ("--hidden-import", m)]
    return [sys.executable, "-m", "PyInstaller", "--noconfirm", "--onefile", "--noconsole",
            "--name", NOMBRE, "--icon", os.path.join(RAIZ, "datos", "ui", "pizarra-icono.ico"),
            "--distpath", os.path.join(salida, "dist"), "--workpath", os.path.join(salida, "build"),
            "--specpath", salida,
            "--paths", RAIZ] + ocultos + [
            "--collect-all", "webview",
            os.path.join(RAIZ, "lanzador.py")]


def main():
    salida = os.path.join(RAIZ, "construccion")
    r = subprocess.run(orden(salida), cwd=RAIZ)
    if r.returncode != 0:
        raise SystemExit("PyInstaller ha fallado (codigo %d)" % r.returncode)
    hecho = os.path.join(salida, "dist", NOMBRE + ".exe")
    destino = os.path.join(RAIZ, NOMBRE + ".exe")
    shutil.copy2(hecho, destino)
    print("Listo: %s (%.1f MB)" % (destino, os.path.getsize(destino) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
