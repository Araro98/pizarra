#!/usr/bin/env python3
"""Le pone a cada pasiva un dibujo del juego, segun lo que hace.

    py herramientas\\construir_iconos_pasivas.py

Escribe `datos/reglas-extraidas/pasivas-icono.csv`.

**Que es esto y que no es** (NOTAS O-141). El juego trae en
`200_icon/18_icon_abilearboard` los dibujos que usa en la tabla de habilidades
para las pasivas de equipo: el cometa del tiro, el muro, la diana del foco, los
dos jugadores de la disputa, la T de la tension, el muro roto de la brecha...
Pero **no hay ninguna tabla que diga que dibujo lleva cada pasiva**: solo 108
de las 1.716 tienen icono en `PASSIVE_SKILL_BUFF_ICON_LIST`, y ese es el que
sale en el partido, no en el menu.

Asi que la asignacion es **nuestra**: se lee el texto en espanol de la pasiva
("AT de tiro +5 %", "DF del muro...") y se le pone el dibujo que el juego usa
para esa misma cosa. Si Aaron ve alguno que no cuadra, la regla esta aqui y se
cambia en una linea.
"""
import csv
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-icono.csv")
LAMINA = "icon_abilearboard"

# Comprobado contra la pantalla "Bonificaciones de equipo" del juego (captura de
# Aaron): brecha = ondas, AT de tiro = bota y balon, PP = mano, tension = rayo
# en S, muro = muralla, foco = diana, afinidad = rayo en circulo.
# (patron en el texto, dibujo). Se prueban en orden y gana el primero que casa,
# asi que lo concreto va antes que lo generico.
REGLAS = [
    (r"tasa de brecha|perforaci|brecha", "icon_alb01_teambuff03_on"),   # las ondas (asi lo pinta el juego)
    (r"DF del muro|DF propia del muro|muro", "icon_alb01_teambuff13_on"),  # muro
    (r"AT de tiro|AT propio de tiro|tiro directo|chut", "icon_alb01_teambuff01_on"),  # bota y balon
    (r"valor .*foco|foco del equipo|de foco", "icon_alb01_teambuff11_on"),  # diana
    (r"disputa", "icon_alb01_teambuff12_on"),                             # dos jugadores
    (r"tensi", "icon_alb01_teambuff15_on"),                               # rayo en S
    (r"poder de afinidad|afinidad", "icon_alb01_teambuff38_on"),          # rayo en circulo
    (r"faltas?\b|tarjeta", "icon_alb01_teambuff29_on"),                   # corredor con aviso
    (r"portero|PP\b|parad", "icon_alb01_teambuff14_on"),                  # la mano
    (r"regate|esprint|velocidad|correr|carrera", "icon_alb01_teambuff27_on"),  # corredor
    (r"obtenci|drop|recompensa|espiritu|espíritu", "icon_alb01_teambuff17_on"),  # bolsa
    (r"tiempo|segundos|durante los", "icon_alb01_teambuff36_on"),         # cronometro
    (r"AT y DF|AT/DF", "icon_alb01_teambuff30_on"),
    (r"\bAT\b", "icon_alb01_teambuff19_on"),
    (r"\bDF\b", "icon_alb01_teambuff20_on"),
    (r"potencia", "icon_alb01_parameter01_on"),
    (r"control", "icon_alb01_parameter02_on"),
    (r"t[eé]cnica", "icon_alb01_parameter03_on"),
    (r"inteligencia", "icon_alb01_parameter04_on"),
    (r"presi[oó]n", "icon_alb01_parameter05_on"),
    (r"f[ií]sico", "icon_alb01_parameter06_on"),
    (r"agilidad", "icon_alb01_parameter07_on"),
]
POR_DEFECTO = "icon_alb01_teambuff40_on"      # la estrella: pasiva sin familia clara


def limpio(t):
    return re.sub(r"\[[^\]]*\]|<[^>]*>|\\\\n", " ", t or "")


def trozo_con_valor(texto):
    """El trozo de la frase donde esta el numero: "Cuando el equipo gana en
    foco o disputa, tension +<VALUE> %" es de tension, no de foco."""
    for trozo in re.split(r"[,:;]", texto):
        if "<VALUE>" in trozo:
            return trozo
    return texto


def dibujo_de(texto):
    t = limpio(texto)
    for donde in (trozo_con_valor(t), t):
        for patron, dibujo in REGLAS:
            if re.search(patron, donde, re.I):
                return dibujo
    return POR_DEFECTO


def main():
    filas = []
    cuenta = {}
    for f in reglas._tabla("nombres-es.csv"):
        if f.get("categoria") != "pasiva":
            continue
        d = dibujo_de(f.get("nombre_es") or f.get("nombre_en"))
        filas.append([f["id"].upper(), LAMINA + "/" + d + ".png"])
        cuenta[d] = cuenta.get(d, 0) + 1
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# El dibujo de cada pasiva, elegido por lo que dice su texto.\n"
                 "# NO viene de una tabla del juego: el juego no la tiene (NOTAS O-141).\n"
                 "# Los dibujos si son los suyos, de 200_icon/18_icon_abilearboard.\n"
                 "# Lo genera herramientas/construir_iconos_pasivas.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "icono"])
        w.writerows(filas)
    print("Escritas %d pasivas en %s" % (len(filas), SALIDA))
    for d, n in sorted(cuenta.items(), key=lambda x: -x[1]):
        print("  %-30s %4d" % (d, n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
