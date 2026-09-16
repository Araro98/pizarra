"""Actualizaciones automaticas del programa (NOTAS O-158).

Al arrancar, `Pizarra.exe` mira si hay una version nueva publicada y, si el
usuario dice que si, la baja y la instala sola. No toca nada mas.

Como funciona:

- La version instalada esta en `version.txt`, en la raiz (por ejemplo
  `2026.09.16`). La publica `herramientas/publicar.py`.
- La direccion donde mirar esta en `actualizaciones.url` (un fichero de texto
  con una sola linea en la raiz). Si no existe, no se busca nada: asi el
  programa funciona igual sin internet o sin repositorio.
- En esa direccion hay un `version.json` con {"version", "exe", "datos",
  "notas"}: la version nueva, de donde bajar el .exe, de donde bajar el zip
  con las pantallas y las tablas, y que cambia.
- Si la version de ahi es mayor: se baja el zip y se extrae encima (web/,
  datos/reglas-extraidas, datos/ui, datos/iconos/recortes), se baja el .exe
  como `Pizarra.nuevo.exe` y se deja un `actualizar.cmd` que espera a que el
  programa se cierre, cambia el .exe y lo vuelve a abrir. El programa
  entonces se cierra solo.

Todo con `urllib`, que viene con Python; sin dependencias.
"""
import ctypes
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

NOMBRE_EXE = "Pizarra.exe"
FICHERO_VERSION = "version.txt"
FICHERO_URL = "actualizaciones.url"
TIEMPO_MAX = 6          # segundos para la comprobacion; si no hay red, se sigue

MB_YESNO, MB_ICONQUESTION, MB_ICONINFO, IDYES = 0x4, 0x20, 0x40, 6


def version_instalada(raiz):
    try:
        with open(os.path.join(raiz, FICHERO_VERSION), encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return "0"


def _tupla(v):
    partes = []
    for x in (v or "0").replace("-", ".").split("."):
        try:
            partes.append(int(x))
        except ValueError:
            partes.append(0)
    return tuple(partes)


def es_mas_nueva(nueva, instalada):
    return _tupla(nueva) > _tupla(instalada)


def url_de_actualizaciones(raiz):
    try:
        with open(os.path.join(raiz, FICHERO_URL), encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def consultar(url):
    """El version.json publicado, o None si no se puede leer."""
    try:
        with urllib.request.urlopen(url, timeout=TIEMPO_MAX) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _pregunta(titulo, texto):
    try:
        return ctypes.windll.user32.MessageBoxW(0, texto, titulo, MB_YESNO | MB_ICONQUESTION) == IDYES
    except Exception:
        return False


def _aviso(titulo, texto):
    try:
        ctypes.windll.user32.MessageBoxW(0, texto, titulo, MB_ICONINFO)
    except Exception:
        print(titulo, texto)


def _bajar(url, destino):
    with urllib.request.urlopen(url, timeout=60) as r, open(destino, "wb") as fh:
        while True:
            trozo = r.read(1 << 20)
            if not trozo:
                break
            fh.write(trozo)


def comprobar_y_aplicar(raiz):
    """Devuelve True si se ha lanzado una actualizacion y hay que salir."""
    url = url_de_actualizaciones(raiz)
    if not url:
        return False
    info = consultar(url)
    if not info or not es_mas_nueva(info.get("version"), version_instalada(raiz)):
        return False
    notas = (info.get("notas") or "").strip()
    if not _pregunta("Pizarra: hay una version nueva",
                     "Hay una version nueva de Pizarra (%s; tienes la %s).\n\n%s\n\n"
                     "Se baja y se instala sola; el programa se cierra y se vuelve a abrir. "
                     "Tu partida no se toca.\n\nActualizar ahora?"
                     % (info.get("version"), version_instalada(raiz), notas)):
        return False
    try:
        tmp = tempfile.mkdtemp(prefix="pizarra-act-")
        if info.get("datos"):
            zip_datos = os.path.join(tmp, "datos.zip")
            _bajar(info["datos"], zip_datos)
            with zipfile.ZipFile(zip_datos) as z:
                for nombre in z.namelist():
                    # solo lo que es del programa: nunca partidas ni nada de fuera
                    if ".." in nombre or nombre.startswith(("/", "\\")):
                        continue
                    if nombre.split("/")[0] in ("web", "datos", FICHERO_VERSION, FICHERO_URL):
                        z.extract(nombre, raiz)
        nuevo_exe = None
        if info.get("exe") and getattr(sys, "frozen", False):
            nuevo_exe = os.path.join(raiz, "Pizarra.nuevo.exe")
            _bajar(info["exe"], nuevo_exe)
        with open(os.path.join(raiz, FICHERO_VERSION), "w", encoding="utf-8") as fh:
            fh.write(str(info.get("version")) + "\n")
    except Exception as e:
        _aviso("Pizarra", "No he podido bajar la actualizacion:\n%s\n\nSe abre la version de siempre." % e)
        return False
    if not nuevo_exe:
        _aviso("Pizarra", "Actualizado a la version %s." % info.get("version"))
        return False
    # el .exe no se puede sobrescribir mientras corre: lo hace un .cmd que
    # espera a que este programa se cierre, lo cambia y lo vuelve a abrir
    cmd = os.path.join(raiz, "actualizar.cmd")
    with open(cmd, "w", encoding="ascii", errors="replace") as fh:
        fh.write("@echo off\r\ncd /d \"%s\"\r\n:espera\r\ntimeout /t 1 /nobreak >nul\r\n"
                 "tasklist /fi \"IMAGENAME eq %s\" | find /i \"%s\" >nul && goto espera\r\n"
                 "move /y \"Pizarra.nuevo.exe\" \"%s\" >nul\r\nstart \"\" \"%s\"\r\n"
                 "del \"%%~f0\"\r\n" % (raiz, NOMBRE_EXE, NOMBRE_EXE, NOMBRE_EXE, NOMBRE_EXE))
    subprocess.Popen(["cmd", "/c", cmd], cwd=raiz, creationflags=0x08000000 | 0x00000008)  # sin ventana, suelto
    return True
