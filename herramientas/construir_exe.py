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


def main():
    salida = os.path.join(RAIZ, "construccion")
    orden = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--onefile", "--noconsole",
             "--name", NOMBRE, "--icon", os.path.join(RAIZ, "datos", "ui", "pizarra-icono.ico"),
             "--distpath", os.path.join(salida, "dist"), "--workpath", os.path.join(salida, "build"),
             "--specpath", salida,
             "--paths", RAIZ,
             "--hidden-import", "ievr.servidor", "--hidden-import", "ievr.basedatos",
             "--collect-all", "webview",
             os.path.join(RAIZ, "lanzador.py")]
    r = subprocess.run(orden, cwd=RAIZ)
    if r.returncode != 0:
        raise SystemExit("PyInstaller ha fallado (codigo %d)" % r.returncode)
    hecho = os.path.join(salida, "dist", NOMBRE + ".exe")
    destino = os.path.join(RAIZ, NOMBRE + ".exe")
    shutil.copy2(hecho, destino)
    print("Listo: %s (%.1f MB)" % (destino, os.path.getsize(destino) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
