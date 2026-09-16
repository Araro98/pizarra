#!/usr/bin/env python3
"""Publica una version nueva de Pizarra para que los .exe repartidos se actualicen solos.

    py herramientas\\publicar.py 2026.09.16 "Que cambia, en una linea"

Hace, en este orden:

1. Escribe la version en `version.txt`.
2. Construye `Pizarra.exe` (`construir_exe.py`).
3. Empaqueta `pizarra-datos.zip` con lo que cambia entre versiones y no va
   dentro del .exe: `web/`, `datos/reglas-extraidas/`, `datos/ui/`,
   `datos/iconos/recortes/`, `version.txt` y `actualizaciones.url`.
4. Deja en `publicar/` esos dos ficheros y un `version.json` con la version,
   las direcciones de descarga y las notas.
5. Si `gh` (la linea de comandos de GitHub) esta instalada y con sesion, crea
   la release en el repositorio y sube los tres ficheros. Si no, lo dice y
   deja los ficheros para subirlos a mano.

Las direcciones de descarga se montan a partir de `actualizaciones.url`
(NOTAS O-158): si ahi pone `https://github.com/USUARIO/pizarra/releases/latest/download/version.json`,
el .exe y el zip van a la misma carpeta de la release.
"""
import json
import os
import shutil
import subprocess
import sys
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "publicar")
CARPETAS_DATOS = [("web", "web"), ("datos/reglas-extraidas", "datos/reglas-extraidas"),
                  ("datos/ui", "datos/ui"), ("datos/iconos/recortes", "datos/iconos/recortes")]


def main():
    if len(sys.argv) < 3:
        raise SystemExit("uso: py herramientas\\publicar.py VERSION \"notas\"   (p. ej. 2026.09.16)")
    version, notas = sys.argv[1].strip(), sys.argv[2].strip()
    url = ""
    try:
        with open(os.path.join(RAIZ, "actualizaciones.url"), encoding="utf-8") as fh:
            url = fh.read().strip()
    except OSError:
        pass
    if not url:
        raise SystemExit("falta actualizaciones.url en la raiz (la direccion del version.json publicado)")
    base = url.rsplit("/", 1)[0]
    with open(os.path.join(RAIZ, "version.txt"), "w", encoding="utf-8") as fh:
        fh.write(version + "\n")
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "construir_exe.py")], cwd=RAIZ)
    if r.returncode != 0:
        raise SystemExit("no se ha podido construir el .exe")
    os.makedirs(SALIDA, exist_ok=True)
    shutil.copy2(os.path.join(RAIZ, "Pizarra.exe"), os.path.join(SALIDA, "Pizarra.exe"))
    zip_datos = os.path.join(SALIDA, "pizarra-datos.zip")
    with zipfile.ZipFile(zip_datos, "w", zipfile.ZIP_DEFLATED) as z:
        for carpeta, dentro in CARPETAS_DATOS:
            ruta = os.path.join(RAIZ, carpeta)
            for d, _, fs in os.walk(ruta):
                for f in fs:
                    completo = os.path.join(d, f)
                    z.write(completo, dentro + "/" + os.path.relpath(completo, ruta).replace("\\", "/"))
        z.write(os.path.join(RAIZ, "version.txt"), "version.txt")
        z.write(os.path.join(RAIZ, "actualizaciones.url"), "actualizaciones.url")
    info = {"version": version, "notas": notas,
            "exe": base + "/Pizarra.exe", "datos": base + "/pizarra-datos.zip"}
    with open(os.path.join(SALIDA, "version.json"), "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=2)
    print("Listo en %s: Pizarra.exe, pizarra-datos.zip (%.1f MB), version.json"
          % (SALIDA, os.path.getsize(zip_datos) / 1e6))
    gh = shutil.which("gh")
    if not gh:
        print("No esta instalada la linea de comandos de GitHub (gh): sube los tres ficheros a mano "
              "a una release con la etiqueta v%s." % version)
        return 0
    r = subprocess.run([gh, "release", "create", "v" + version, os.path.join(SALIDA, "Pizarra.exe"),
                        zip_datos, os.path.join(SALIDA, "version.json"), "--title", "Pizarra " + version,
                        "--notes", notas], cwd=RAIZ)
    print("Release creada" if r.returncode == 0 else "gh ha fallado: sube los ficheros a mano")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
