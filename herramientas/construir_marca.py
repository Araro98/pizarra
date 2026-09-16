#!/usr/bin/env python3
"""Saca el icono de Pizarra en los formatos que hacen falta (NOTAS O-153).

    py herramientas\\construir_marca.py

Parte de `datos/ui/pizarra-icono.svg` (dibujado a mano) y deja al lado:
`pizarra-icono.png` (1024), `pizarra-icono-64.png` (favicon) y
`pizarra-icono.ico` (para el .exe). El SVG se pinta con Chrome sin cabeza y
fondo transparente, que es lo que hay instalado y lo hace fiel.
"""
import os
import subprocess
import tempfile

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(RAIZ, "datos", "ui")
SVG = os.path.join(UI, "pizarra-icono.svg")
CHROMES = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
           r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
           r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]


def main():
    chrome = next((c for c in CHROMES if os.path.isfile(c)), None)
    if not chrome:
        raise SystemExit("no encuentro Chrome ni Edge para pintar el SVG")
    with tempfile.TemporaryDirectory() as tmp:
        html = os.path.join(tmp, "icono.html")
        with open(html, "w", encoding="utf-8") as fh:
            fh.write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;'
                     'background:transparent}img{display:block;width:1024px;height:1024px}</style>'
                     '</head><body><img src="file:///%s"></body></html>' % SVG.replace("\\", "/"))
        png = os.path.join(tmp, "icono.png")
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", "--window-size=1024,1024",
                        "--virtual-time-budget=3000", "--allow-file-access-from-files",
                        "--screenshot=" + png, "file:///" + html.replace("\\", "/")],
                       capture_output=True)
        if not os.path.isfile(png):
            raise SystemExit("Chrome no ha dejado la imagen")
        im = Image.open(png).convert("RGBA")
    im.save(os.path.join(UI, "pizarra-icono.png"))
    im.resize((64, 64), Image.LANCZOS).save(os.path.join(UI, "pizarra-icono-64.png"))
    im.save(os.path.join(UI, "pizarra-icono.ico"),
            sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print("Icono listo en %s (png 1024, png 64, ico)" % UI)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
