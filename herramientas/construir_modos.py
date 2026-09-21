#!/usr/bin/env python3
"""Los cambios de modo (Modo Aphrody, Modo Reina...): quien se convierte en
quien y que numeros lleva el modo (NOTAS O-225).

    py herramientas\\construir_modos.py

Escribe `datos/reglas-extraidas/modos.csv`:

- `de`, `a`: la identidad del personaje y la de la forma que toma (pareja de
  `CHARA_MODE_CHANGE_LIST`, en `character/chara_change`).
- `modo`, `modo_nombre`: la hipertecnica "Modo ..." que lo activa (esta en el
  arbol del personaje y en `espiritus.csv` como familia especial, modelo
  `mode_change_*`).
- `tension`, `duracion`: las columnas 4 y 5 de su ficha en `AURA_CMD_INFO_LIST`
  (75 y 90 en todos los modos; en los kenshin 45 y 60). Sin confirmar que
  sean eso.
- `at`, `df`, `velocidad`, `extra`: los cuatro efectos genericos de la ficha
  (`AURA_CMD_EFFECT_LIST`), por su id crc32. Los dos primeros son los mismos
  que llevan los despertares (Sobrecarga ardiente y compania), que la
  comunidad tiene medidos como AT +30 % y DF +30 %; el tercero tambien va en
  los despertares (50) y se describe como velocidad de movimiento; el cuarto
  (10) no se sabe que es.
"""
import csv
import glob
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "modos.csv")

# id crc32 del efecto -> columna (ver la cabecera del fichero)
EFECTOS = {-1474450477: "at", 823458409: "df", -663265444: "velocidad", 913915504: "extra"}


def unico(carpeta, prefijo):
    h = sorted(glob.glob(os.path.join(GAMEDATA, carpeta, prefijo + "*.cfg.bin")))
    if not h:
        raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))
    return h[0]


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()]


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def en_partida(x):
    v = u32(x)
    return None if v is None else bytes.fromhex("%08X" % v)[::-1].hex().upper()


def main():
    parejas = []
    for c in volcar(unico("character", "chara_change"), "CHARA_MODE_CHANGE_LIST"):
        if len(c) == 2 and u32(c[0]) and u32(c[1]):
            parejas.append(("%08X" % u32(c[0]), "%08X" % u32(c[1])))

    aura = unico("skill", "aura_skill_config")
    info = volcar(aura, "AURA_CMD_INFO_LIST")
    eff = volcar(aura, "AURA_CMD_EFFECT_LIST")
    fichas, i = {}, 0
    while i < len(info):
        c = info[i]
        if len(c) == 19:
            subs, j = [], i + 1
            while j < len(info) and len(info[j]) == 2:
                subs.append([int(x) for x in info[j]])
                j += 1
            fichas[en_partida(c[0])] = (c, subs)
            i = j
        else:
            i += 1

    esp = {f["id"].upper(): f for f in reglas._tabla("espiritus.csv")}
    nombres = {f["id"].upper(): (f.get("nombre_es") or f.get("nombre_en") or "")
               for f in reglas._tabla("nombres-es.csv") if f.get("categoria") == "aura"}
    personajes = reglas.personajes()
    filas = []
    for de, a in parejas:
        p = personajes.get(de) or {}
        modo = ""
        for k in range(1, 10):
            t = (p.get("tec%d" % k) or "").upper()
            if t and (esp.get(t) or {}).get("modelo", "").startswith("mode_change"):
                modo = t
                break
        if not modo:
            print("  sin hipertecnica de modo en el arbol de", de, p.get("nombre_es"))
        ficha = fichas.get(modo)
        valores = {"tension": "", "duracion": "", "at": "", "df": "", "velocidad": "", "extra": ""}
        if ficha:
            c, subs = ficha
            valores["tension"], valores["duracion"] = c[4], c[5]
            if len(subs) > 1:
                e0, en = subs[1]
                for r in eff[e0:e0 + en]:
                    col = EFECTOS.get(int(r[0]))
                    if col and len(r) > 1 and r[1] != "-992181094":
                        valores[col] = r[1]
        filas.append([de, a, modo, nombres.get(modo, ""), valores["tension"], valores["duracion"],
                      valores["at"], valores["df"], valores["velocidad"], valores["extra"]])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Cambios de modo: quien se convierte en quien y los numeros del modo (NOTAS O-225).\n"
                 "# Lo genera herramientas/construir_modos.py.\n")
        w = csv.writer(fh)
        w.writerow(["de", "a", "modo", "modo_nombre", "tension", "duracion", "at", "df", "velocidad", "extra"])
        w.writerows(filas)
    print("Escritos %d modos en %s" % (len(filas), SALIDA))
    for f in filas:
        print("  ", f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
