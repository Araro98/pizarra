#!/usr/bin/env python3
"""Donde va cada puesto en cada formacion, sacado del juego (NOTAS O-160).

    py herramientas\\construir_formaciones.py

Escribe `datos/reglas-extraidas/formaciones.csv`: id, nombre, puesto (0-10),
posicion (POR/DF/MC/DC), tipo (el numero fino del juego), x, y, pase, y la
posicion de la tarjeta en la pantalla de formacion del juego (px, py, de 0 a 1)
mas `legal` (1 si es una formacion que un equipo puede llevar).

De donde sale:

- `item/item_config` -> `ITEM_FORMATION_INFO_LIST`: cada formacion que se puede
  tener (las 11 de la partida) con su id de objeto (col 0, como en la partida)
  y en la col 16 el `formId` de la tabla de formaciones.
- `formation/formation_config` (formato RDBN; el volcador de referencia se cae
  con el, por eso `herramientas/rdbn.py`): `m_SoccerFormationInfoList` apunta a
  11 filas de `m_SoccerFormPlacementInfoList` con, por puesto, `positionNo`,
  `positionId` y las coordenadas `startPos` (x de -1 a 1, izquierda a derecha;
  y de 0,9 en la porteria propia a 0,1 arriba), mas las de defensa y ataque.
- `positionId`: 1 portero; 2 y 3 defensas (central y lateral); 4, 5, 6 y 7
  medios (los pesos de linea de `m_SoccerPositionInfoList` lo confirman: 0,4-0,6
  de ataque/defensa) y 8, 9, 10 delanteros (0,65-0,8 de ataque). Cuadra con la
  pantalla del juego: en la 4-3-3 Triangulo los puestos 1-4 son DF, 5-7 MC y
  8-10 DC.
"""
import csv
import os
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
import rdbn  # noqa: E402
from ievr import reglas  # noqa: E402

GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "formaciones.csv")
POSICION = {1: "POR", 2: "DF", 3: "DF", 4: "MC", 5: "MC", 6: "MC", 7: "MC", 8: "DC", 9: "DC", 10: "DC"}

# Donde pinta el juego la tarjeta de cada puesto en su pantalla de formacion,
# medido de las capturas de Aaron (las 8 formaciones con el mismo equipo, asi
# que cada jugador delata su puesto). Coordenadas en pixeles de la captura:
# x desde el centro del campo, y con el portero en 700 y la linea de arriba en
# unos 130. Las coordenadas startPos del juego no dan la pantalla tal cual
# (el juego reparte las filas a su manera), por eso se toma la pantalla real.
# Las tres formaciones "B-" no estan: son de equipos de la historia y no se
# pueden poner (Aaron), asi que no salen en el editor.
PANTALLA = {
    "5-4-1 Doble Volante": [(0, 700), (-220, 440), (-210, 570), (0, 570), (210, 570), (225, 440),
                            (-210, 190), (-105, 315), (105, 315), (210, 190), (0, 150)],
    "3-6-1 Hexa": [(0, 700), (-250, 570), (0, 570), (250, 570), (-225, 300), (-105, 440),
                   (105, 440), (230, 300), (-200, 180), (220, 180), (0, 145)],
    "4-5-1 Equilibrio": [(0, 700), (-115, 570), (115, 570), (-250, 440), (250, 440), (0, 250),
                         (-205, 320), (205, 320), (-250, 180), (250, 180), (0, 120)],
    "4-3-3 Delta": [(0, 700), (-230, 410), (-100, 540), (105, 540), (235, 410), (-110, 275),
                    (0, 410), (110, 275), (-255, 140), (0, 140), (255, 140)],
    "4-3-3 Tri\u00e1ngulo": [(0, 700), (-110, 570), (105, 570), (-260, 440), (255, 440), (0, 270),
                        (-210, 310), (210, 310), (0, 135), (-255, 150), (255, 150)],
    "3-5-2 Libertad": [(0, 700), (-175, 570), (0, 570), (175, 570), (-175, 440), (175, 440),
                       (-250, 310), (0, 295), (250, 310), (-160, 150), (160, 150)],
    "4-4-2 Caja": [(0, 700), (-190, 625), (195, 625), (-225, 500), (225, 500), (-100, 380),
                   (105, 380), (-190, 255), (200, 255), (-100, 135), (105, 135)],
    "4-4-2 Diamante": [(0, 700), (-105, 575), (105, 575), (-215, 450), (215, 450), (0, 450),
                       (-150, 315), (150, 315), (0, 190), (-205, 155), (205, 155)],
}


def en_pantalla(nombre, puesto):
    """(px, py) de 0 a 1 en el campo del editor, o ("", "") si no se conoce."""
    pos = PANTALLA.get(nombre)
    if not pos or puesto >= len(pos):
        return "", ""
    x, y = pos[puesto]
    return "%.3f" % (0.5 + x / 700.0), "%.3f" % ((y - 100) / 630.0)


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def main():
    nombres = {f["id"].upper(): (f.get("nombre_es") or f.get("nombre_en"))
               for f in reglas._tabla("nombres-es.csv") if f.get("categoria") == "formacion"}
    fo = rdbn.leer(unico(os.path.join(GAMEDATA, "formation"), "formation_config_"))
    form = {f[0] & 0xFFFFFFFF: f for f in fo["m_SoccerFormationInfoList"]["filas"]}
    plac = fo["m_SoccerFormPlacementInfoList"]["filas"]
    r = subprocess.run([VOLCADO, unico(os.path.join(GAMEDATA, "item"), "item_config_"),
                        "ITEM_FORMATION_INFO_LIST"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    filas = []
    for l in r.stdout.splitlines():
        c = l.split("\t")
        if len(c) < 17:
            continue
        try:
            id_objeto = struct.pack("<I", int(c[0]) & 0xFFFFFFFF).hex().upper()
            form_id = int(c[16]) & 0xFFFFFFFF
        except ValueError:
            continue
        f = form.get(form_id)
        if not f or id_objeto not in nombres:
            continue
        ini, cuantos = f[1]
        nombre = nombres[id_objeto]
        legal = 1 if (cuantos == 11 and nombre in PANTALLA) else 0
        for p in plac[ini:ini + cuantos]:
            px, py = en_pantalla(nombre, p[10])
            filas.append([id_objeto, nombre, p[10], POSICION.get(p[11], "?"), p[11],
                          "%.2f" % p[2][0], "%.2f" % p[2][1], p[12], f[2], f[3], px, py, legal])
    filas.sort(key=lambda x: (x[1], x[2]))
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Donde va cada puesto (0-10) en cada formacion, del propio juego (NOTAS O-160).\n"
                 "# x: -1 izquierda .. 1 derecha; y: 0.9 porteria propia .. 0.1 arriba. pase = orden de pase.\n"
                 "# px, py: donde pinta el juego la tarjeta en su pantalla (0..1), medido de capturas. legal: se puede llevar.\n"
                 "# Lo genera herramientas/construir_formaciones.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "nombre", "puesto", "posicion", "tipo", "x", "y", "pase", "ataque", "defensa",
                    "px", "py", "legal"])
        w.writerows(filas)
    print("Escritas %d filas (%d formaciones) en %s" % (len(filas), len({x[0] for x in filas}), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
