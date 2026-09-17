#!/usr/bin/env python3
"""Las 37 sinergias del juego, con sus personajes y sus efectos (NOTAS O-191).

    py herramientas\\construir_sinergias.py

Escribe `datos/reglas-extraidas/sinergias.csv`.

**De donde sale.** Tres ficheros del juego:

- `skill/synergy_flag_config`: la lista `SYNERGY_FLAG_INFO_LIST` va en tercias
  de filas: `[id]`, `[desde, cuantas]` de condiciones y `[desde, cuantas]` de
  efectos. Las condiciones (`SYNERGY_FLAG_EXEC_COND_LIST`) son todas del mismo
  tipo, "este personaje en el equipo", y el segundo numero es el
  `chara_base_id` del personaje. Los efectos (`SYNERGY_FLAG_EFFECT_LIST`) son
  `(tipo de efecto, valor, ...)`.
- `soccer/synergy_flag_effect_config`: que texto va con cada tipo de efecto
  (una fila de tres numeros `(id de texto, icono, tope)` dentro de cada bloque).
- `item/item_config`, tabla `ITEM_SYNERGY_FLAG_INFO_LIST`: la sinergia como
  objeto de la mochila: id del objeto, id del nombre (en `item_text`), la
  columna 7 dice **221 = ofensiva, 222 = defensiva** (casa con los efectos:
  las 221 suben AT, tiro y foco en AT; las 222 DF, muro y foco en DF), el
  nombre del dibujo y, al final, el id de la sinergia.

Los ids se escriben como en la partida (4 bytes al reves, en hexadecimal).
"""
import csv
import glob
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
GAMEDATA = os.path.join(COMUN, "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "sinergias.csv")

TIPOS = {"221": "ofensiva", "222": "defensiva"}


def unico(patron):
    f = sorted(glob.glob(patron))
    if not f:
        raise SystemExit("no encuentro %s" % patron)
    return f[0]


def volcar(fichero, *args):
    r = subprocess.run([VOLCADO, fichero] + list(args), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s" % fichero)
    return r.stdout


def tablas_json(fichero):
    """{nombre de tabla: [filas planas]} de un fichero volcado con --json. Las
    tablas repetidas se juntan en orden."""
    d = json.loads(volcar(fichero, "--json"))
    fuera = {}
    for t in d["tables"]:
        fuera.setdefault(t["name"], []).extend(
            [list(x.values())[0] for v in r["values"] for x in v] for r in t["rows"])
    return fuera


def textos_es(fichero):
    """{id: primer texto} de un fichero de textos en espanol."""
    fuera = {}
    for l in volcar(os.path.join(COMUN, "text", "es", fichero), "--todas").splitlines():
        c = l.split("\t")
        if len(c) < 2 or not c[0].lstrip("-").isdigit():
            continue
        for celda in c[1:]:
            m = re.match(r'^String\("(.*)"\)$', celda.strip())
            if m and m.group(1):
                fuera[int(c[0])] = m.group(1)
                break
    return fuera


def limpio(t, valor=None):
    t = t.replace("<PASSIVE_COLOR>", "").replace("[C]", "").replace("<OVER_PASSIVE_INFO>", "")
    if valor is not None:
        t = t.replace("<VALUE>", str(valor))
    t = re.sub(r"\\+n", " ", t)
    return " ".join(t.split())


def en_partida(v):
    return (v & 0xFFFFFFFF).to_bytes(4, "little").hex().upper()


def main():
    sin = tablas_json(unico(os.path.join(GAMEDATA, "skill", "synergy_flag_config_*.cfg.bin")))
    info = sin["SYNERGY_FLAG_INFO_LIST"]
    conds = sin["SYNERGY_FLAG_EXEC_COND_LIST"][1:]
    effs = sin["SYNERGY_FLAG_EFFECT_LIST"][1:]

    # que texto va con cada tipo de efecto
    skill_text = textos_es("skill_text.cfg.bin")
    texto_de_efecto, actual = {}, None
    # el volcador parte cada efecto en varias tablas: hay que leerlas en el
    # orden del fichero, no agrupadas por nombre
    soccer = json.loads(volcar(unico(os.path.join(
        GAMEDATA, "soccer", "synergy_flag_effect_config_*.cfg.bin")), "--json"))
    for t in soccer["tables"]:
        for r in t["rows"]:
            v = [list(x.values())[0] for vv in r["values"] for x in vv]
            if len(v) == 1 and isinstance(v[0], int) and abs(v[0]) > 100000:
                actual = v[0]
            elif len(v) == 3 and actual is not None and v[0] in skill_text:
                texto_de_efecto.setdefault(actual, skill_text[v[0]])

    # la sinergia como objeto
    item_text = textos_es("item_text.cfg.bin")
    objetos, dentro = {}, False
    for l in volcar(unico(os.path.join(GAMEDATA, "item", "item_config_*.cfg.bin")), "--todas").splitlines():
        if l.startswith("#TABLA"):
            dentro = "ITEM_SYNERGY_FLAG_INFO_LIST" in l
            continue
        c = l.rstrip("\n").split("\t")
        if dentro and len(c) > 16 and c[0].lstrip("-").isdigit():
            objetos[int(c[16])] = {"item": int(c[0]), "nombre": item_text.get(int(c[2]), ""),
                                   "orden": int(c[4] or 0), "tipo": TIPOS.get(c[6], c[6]),
                                   "icono": c[11].replace('String("', "").rstrip('")')}

    personajes = {}
    for f in reglas._tabla("personajes.csv"):
        personajes.setdefault(f["chara_base_id"], f["nombre_es"])

    filas = []
    k = 1
    while k + 2 < len(info) and len(info[k]) == 1 and len(info[k + 1]) == 2:
        sid = info[k][0]
        ci, cn = info[k + 1]
        ei, en = info[k + 2]
        k += 3
        o = objetos.get(sid)
        if not o:
            continue
        ids = [str(r[1]) for r in conds[ci:ci + cn] if len(r) > 1]
        efectos = []
        for r in effs[ei:ei + en]:
            if len(r) < 2:
                continue
            t = texto_de_efecto.get(r[0])
            efectos.append(limpio(t, r[1]) if t else "efecto %d = %s" % (r[0], r[1]))
        filas.append({
            "id": en_partida(sid), "item_id": en_partida(o["item"]),
            "nombre": limpio(o["nombre"]), "tipo": o["tipo"], "icono": o["icono"],
            "orden": o["orden"],
            "personajes_ids": ";".join(ids),
            "personajes": ";".join(personajes.get(i, "personaje %s" % i) for i in ids),
            "efectos": "|".join(efectos),
        })
    filas.sort(key=lambda f: (f["tipo"], f["orden"]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las sinergias del juego (NOTAS O-191): id como en la partida, el objeto\n"
                 "# de la mochila que la da, tipo (ofensiva/defensiva), los personajes que\n"
                 "# tienen que estar en el equipo (chara_base_id y nombre) y sus efectos.\n"
                 "# Lo genera herramientas/construir_sinergias.py.\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    import collections
    print("Escritas %d sinergias en %s" % (len(filas), SALIDA))
    print("   por tipo:", dict(collections.Counter(f["tipo"] for f in filas)))
    print("   sin personaje conocido:", sum(1 for f in filas if "personaje " in f["personajes"]))
    print("   sin texto de efecto:", sum(1 for f in filas if "efecto " in f["efectos"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
