#!/usr/bin/env python3
"""Pizarra (el editor de Victory Road) como programa de ventana.

    py lanzador.py                      (para probarlo)
    py herramientas\\construir_exe.py   (para hacer el .exe)

Hace lo mismo que `herramientas/abrir-editor.bat` pero sin ventana negra ni
navegador: copia la partida de Steam a `partidas/para-editar`, arranca el
servidor de siempre en segundo plano y abre las pantallas en una ventana
propia. Al cerrar la ventana se cierra todo.

El .exe lleva dentro solo el codigo (Python, `ievr/` y este fichero); las
pantallas (`web/`), los datos (`datos/`) y las partidas se leen de la carpeta
donde este el .exe, asi que tiene que estar en la raiz del proyecto.
"""
import os
import shutil
import sys
import threading


def raiz():
    if getattr(sys, "frozen", False):       # dentro del .exe
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def aviso(titulo, texto):
    """Un cuadro de aviso de Windows, para cuando algo falla antes de abrir."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, texto, titulo, 0x10)
    except Exception:
        print(titulo + ": " + texto)


def main():
    RAIZ = raiz()
    os.environ["IEVR_RAIZ"] = RAIZ
    sys.path.insert(0, RAIZ)
    for carpeta in ("web", "datos", "ievr" if not getattr(sys, "frozen", False) else "web"):
        if not os.path.isdir(os.path.join(RAIZ, carpeta)):
            aviso("Pizarra", "No encuentro la carpeta '%s' al lado del programa.\n"
                  "El .exe tiene que estar en la carpeta del proyecto (donde estan web/ y datos/)."
                  % carpeta)
            return 1

    from ievr import servidor, escribir, actualizador

    # si hay una version nueva publicada y el usuario quiere, se instala y se sale
    if actualizador.comprobar_y_aplicar(RAIZ):
        return 0

    # la copia de la partida de Steam (la mas reciente que haya en este
    # ordenador, sea de quien sea la cuenta); si no hay, la ultima que quede
    trabajo = os.path.join(RAIZ, "partidas", "para-editar")
    partidas = servidor.partidas_de_steam()
    if partidas:
        carpeta, nombre, _ = partidas[0]
        os.makedirs(trabajo, exist_ok=True)
        try:
            for vieja in os.listdir(trabajo):          # que no queden dos partidas mezcladas
                if escribir.es_partida(vieja) and vieja != nombre:
                    os.remove(os.path.join(trabajo, vieja))
            shutil.copy2(os.path.join(carpeta, nombre), os.path.join(trabajo, nombre))
        except OSError as e:
            aviso("Pizarra", "No he podido copiar la partida de Steam:\n%s" % e)
    if not escribir.partida_en(trabajo):
        for otra in ("actual", "original"):
            if escribir.partida_en(os.path.join(RAIZ, "partidas", otra)):
                trabajo = os.path.join(RAIZ, "partidas", otra)
                break
        else:
            aviso("Pizarra", "No encuentro ninguna partida del juego en este ordenador.\n"
                  "Copia tu partida (el fichero XXXXXXXX-USERDATALIVE de Steam, sin renombrarlo) "
                  "en la carpeta partidas\\actual y vuelve a abrir el programa.")
            return 1

    try:
        http, puerto = servidor.preparar(trabajo)
    except SystemExit as e:
        aviso("Pizarra", str(e))
        return 1
    hilo = threading.Thread(target=http.serve_forever, daemon=True)
    hilo.start()

    import webview
    webview.create_window("Pizarra", "http://127.0.0.1:%d/" % puerto,
                          width=1500, height=950, min_size=(1000, 650))
    try:
        webview.start(gui="edgechromium")
    finally:
        http.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
