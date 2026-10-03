"""Bajar las caras y dibujos del juego cuando faltan (NOTAS O-278).

Lo que se publica en GitHub no lleva los dibujos del juego (caras, cuerpos,
escudos...: unos 470 MB) en cada version: van una sola vez en la
publicacion "caras" de GitHub (Aaron lo decidio asi, O-278), y el
`version.json` publicado dice donde (`"caras"`). Si a una instalacion le
faltan, el inicio ofrece un boton y esto los baja y los coloca en
`datos/iconos/`, sin tocar nada mas.

Vale cualquier enlace directo; los de Google Drive y Dropbox se convierten
en el de descarga directa, por si algun dia se mueven alli.
"""
import os
import re
import tempfile
import threading
import urllib.request
import zipfile

from ievr import actualizador as AC

# lo que va dentro del zip de caras (y lo unico que se extrae de el)
PREFIJO = "datos/iconos/data/"
CARAS = os.path.join("datos", "iconos", "data", "dx11", "menu", "200_icon", "10_icon_chr", "face")

_estado = {"estado": "parado", "bajado": 0, "total": 0, "error": ""}
_enlace = {"url": None, "mirado": False}
_cerrojo = threading.Lock()


def faltan(raiz):
    """Si a esta instalacion le faltan las caras."""
    try:
        return len(os.listdir(os.path.join(raiz, CARAS))) < 100
    except OSError:
        return True


def directa(url):
    """El enlace de descarga directa de un enlace para compartir."""
    url = (url or "").strip()
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)", url)
    if m:
        return "https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t" % m.group(1)
    if "dropbox.com" in url:
        return re.sub(r"([?&])dl=0", r"\1dl=1", url) if "dl=0" in url else url + ("&" if "?" in url else "?") + "dl=1"
    return url


def enlace(raiz):
    """De donde bajarlas: lo que diga el version.json publicado (se mira una vez)."""
    if not _enlace["mirado"]:
        info = AC.consultar(AC.url_de_actualizaciones(raiz)) if AC.url_de_actualizaciones(raiz) else None
        _enlace["url"] = directa((info or {}).get("caras")) or None
        _enlace["mirado"] = True
    return _enlace["url"]


def estado(raiz):
    return dict(_estado, faltan=faltan(raiz), hay_enlace=bool(enlace(raiz)))


def bajar(raiz):
    """Empieza a bajarlas en segundo plano. Devuelve el estado."""
    url = enlace(raiz)
    with _cerrojo:
        if _estado["estado"] == "bajando":
            return estado(raiz)
        if not url:
            _estado.update(estado="error", error="no hay ningun enlace para bajar las caras")
            return estado(raiz)
        _estado.update(estado="bajando", bajado=0, total=0, error="")
    threading.Thread(target=_trabajo, args=(raiz, url), daemon=True).start()
    return estado(raiz)


def _trabajo(raiz, url):
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(prefix="pizarra-caras-", suffix=".zip")
        os.close(fd)
        pet = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Pizarra"})
        with urllib.request.urlopen(pet, timeout=60) as r, open(tmp, "wb") as fh:
            _estado["total"] = int(r.headers.get("Content-Length") or 0)
            while True:
                trozo = r.read(1 << 20)
                if not trozo:
                    break
                fh.write(trozo)
                _estado["bajado"] += len(trozo)
        if not zipfile.is_zipfile(tmp):
            raise ValueError("lo que ha llegado no es el zip de las caras: mira que el fichero este "
                             "compartido con 'cualquiera con el enlace'")
        _estado["estado"] = "instalando"
        with zipfile.ZipFile(tmp) as z:
            for nombre in z.namelist():
                # solo dibujos, nunca nada de fuera de datos/iconos
                if ".." in nombre or not nombre.startswith(PREFIJO) or nombre.endswith("/"):
                    continue
                z.extract(nombre, raiz)
        _estado["estado"] = "hecho"
    except Exception as e:
        _estado.update(estado="error", error=str(e))
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except OSError:
                pass
