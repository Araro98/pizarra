#!/usr/bin/env python3
"""De donde sale cada supertecnica, para saber cuales se le pueden dar a un
jugador (NOTAS O-171).

    py herramientas\\construir_tecnicas_origen.py

Escribe `datos/reglas-extraidas/tecnicas-origen.csv`: id, nombre, origen y
obtenible. Origenes, por este orden:

- personaje: la aprende algun personaje en su arbol (chara_param tec1..tec9).
- tienda: esta en la tienda, en los objetos comunes o en los trofeos.
- kenshin: es la tecnica de un espiritu (la referencia aura_skill_config); no
  se le da a un jugador, la usa el kenshin.
- override: es el resultado de combinar dos tecnicas en el partido
  (override_skill_config); no existe como tecnica suelta.
- rara: sin nombre o de las de prueba (rh*, swap_skill_waza).
- ninguna: no la aprende nadie ni se consigue en ningun sitio (versiones de la
  historia: "Ensueno: ...", "... EV", "... de la amistad").

`obtenible` = si para personaje y tienda; el editor solo ofrece esas.
"""
import csv
import os
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tecnicas-origen.csv")


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def como_en_partida(entero):
    return struct.pack("<I", int(entero) & 0xFFFFFFFF).hex().upper()


def ids_en(ruta, ids):
    d = open(ruta, "rb").read()
    fuera = set()
    for i in ids:
        b = bytes.fromhex(i)
        if d.count(b) or d.count(b[::-1]):
            fuera.add(i)
    return fuera


def main():
    tec = {f["id"].upper(): f for f in reglas._tabla("tecnicas.csv")}
    ids = set(tec)
    per = reglas.personajes()
    personaje = {(f.get("tec%d" % k) or "").upper() for f in per.values() for k in range(1, 10)} & ids
    tienda = set()
    for carpeta, prefijo in (("shop", "shop_config"), ("item", "common_item_table"), ("trophy", "trophy_config")):
        try:
            tienda |= ids_en(unico(os.path.join(GAMEDATA, carpeta), prefijo), ids)
        except SystemExit:
            pass
    aura = unico(os.path.join(GAMEDATA, "skill"), "aura_skill_config")
    kenshin = set()
    for t in ("AURA_CMD_INFO_LIST", "AURA_CMD_UNIQUE_EFFECT_LIST", "AURA_CMD_EFFECT_LIST", "AURA_CMD_CHARA_LIST"):
        for c in volcar(aura, t):
            for x in c:
                try:
                    v = como_en_partida(x)
                except ValueError:
                    continue
                if v in ids:
                    kenshin.add(v)
    override = set()
    for c in volcar(unico(os.path.join(GAMEDATA, "skill"), "override_skill_config"), "m_OverrideSkillInfoList"):
        try:
            override.add(como_en_partida(c[0]))
        except (ValueError, IndexError):
            pass
    filas = []
    for i, f in sorted(tec.items(), key=lambda x: (x[1].get("nombre") or "").lower()):
        interno = f.get("nombre_interno") or ""
        if i in personaje:
            origen = "personaje"
        elif i in tienda:
            origen = "tienda"
        elif i in kenshin:
            origen = "kenshin"
        elif i in override:
            origen = "override"
        elif not f.get("nombre") or f.get("nombre") == "null" or interno[:2] in ("rh", "sw"):
            origen = "rara"
        else:
            origen = "ninguna"
        filas.append([i, f.get("nombre") or "", origen, "si" if origen in ("personaje", "tienda") else "no"])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# De donde sale cada supertecnica y si se le puede dar a un jugador (NOTAS O-171).\n"
                 "# Lo genera herramientas/construir_tecnicas_origen.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "nombre", "origen", "obtenible"])
        w.writerows(filas)
    cuenta = {}
    for f in filas:
        cuenta[f[2]] = cuenta.get(f[2], 0) + 1
    print("Escritas %d tecnicas en %s: %s" % (len(filas), SALIDA, cuenta))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
