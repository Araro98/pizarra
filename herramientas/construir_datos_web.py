#!/usr/bin/env python3
"""Prepara los datos de la pagina de consulta, en un JSON compacto.

    py herramientas\\construir_datos_web.py

Escribe `datos/web/jugadores.json`.

Compacto de verdad: los nombres de tecnica y de pasiva se guardan UNA vez en
listas aparte y cada jugador guarda indices. Con 5.717 jugadores y nueve ranuras
cada uno, repetir los nombres multiplicaria por diez el tamano.
"""
import collections
import csv
import json
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "datos", "reglas-extraidas")
SALIDA = os.path.join(RAIZ, "datos", "web", "jugadores.json")
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
CRECIMIENTO = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common",
                           "gamedata", "character", "growth_table_config_0.00.00.00.cfg.bin")
STATS = ["Potencia", "Control", "Tecnica", "Presion", "Fisico", "Agilidad", "Inteligencia"]


def leer_csv(nombre, carpeta=DATOS):
    with open(os.path.join(carpeta, nombre), newline="", encoding="utf-8") as fh:
        return list(csv.DictReader([l for l in fh if not l.lstrip().startswith("#")]))


def volcar(tabla):
    r = subprocess.run([VOLCADO, CRECIMIENTO, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def octeto(x):
    return int(x.replace("Byte(", "").replace(")", "")) if "Byte(" in x else int(x)


def tabla_crecimiento():
    """{(posicion, patron, rango): {50: [...], 99: [...]}} del fichero del juego."""
    fuera = {}
    for c in volcar("m_growthTableMainList"):
        if len(c) < 17:
            continue
        try:
            clave = (octeto(c[0]), octeto(c[1]), octeto(c[2]))
            nums = [int(v) for v in c[3:17]]
        except ValueError:
            continue
        fuera[clave] = {"50": nums[:7], "99": nums[7:14]}
    return fuera


def limpiar(texto):
    """Deja legible el texto de una pasiva.

    El juego guarda plantillas con marcadores: `[CPASSIVE01]` es donde va el
    icono, `<VALUE>` el numero que depende de la rareza, `[C]` cierra el color y
    `\n` es un salto de linea escapado dos veces.
    """
    if not texto:
        return ""
    t = texto.replace("\\n", " ").replace("\n", " ")
    t = t.replace("[CPASSIVE01]", "").replace("[C]", "")
    t = t.replace("<VALUE>", "X")
    return " ".join(t.split())


def main():
    jugadores = leer_csv("jugadores.csv")
    pasivas = leer_csv("pasivas-por-ranura.csv")
    pool = leer_csv("pool-pasivas.csv")

    # posicion, patron de crecimiento y rango, que hacen falta para los stats
    extra = {}
    tsv = os.path.join(RAIZ, "datos", "juego", "tablas", "CHARA_PARAM_INFO_LIST.tsv")
    with open(tsv, encoding="utf-8", errors="replace") as fh:
        for linea in fh:
            c = linea.rstrip().split(chr(9))
            if len(c) < 43:
                continue
            try:
                extra["%08X" % (int(c[0]) & 0xFFFFFFFF)] = (int(c[3]), int(c[7]), int(c[9]))
            except ValueError:
                pass

    crecimiento = tabla_crecimiento()

    # tablas compartidas de textos
    tecnicas, itec = [], {}
    def idx_tecnica(nombre, tipo):
        if not nombre:
            return -1
        k = (nombre, tipo)
        if k not in itec:
            itec[k] = len(tecnicas)
            tecnicas.append([nombre, tipo])
        return itec[k]

    salida = []
    sin_stats = 0
    for j in jugadores:
        ident = j["identidad"]
        pos, patron, rango = extra.get(ident, (0, 0, 0))
        st = crecimiento.get((pos, patron, rango))
        if st is None:
            sin_stats += 1
        ranuras = []
        for r in range(1, 10):
            nombre = j["r%d_tecnica" % r]
            ranuras.append([idx_tecnica(nombre, j["r%d_tipo" % r]),
                            j["r%d_tipo" % r],
                            int(j["r%d_nivel" % r]) if j["r%d_nivel" % r] else 0])
        salida.append({
            "id": ident,
            "n": j["nombre"],
            "el": j["elemento"],
            "p": j["posicion"],
            "pa": j["posicion_alt"],
            "a": j["arquetipo"],
            "r": j["rareza"],
            "s50": st["50"] if st else None,
            "s99": st["99"] if st else None,
            "t": ranuras,
            "eq": j.get("equipo", ""),
        })

    # pasivas de arquetipo (ranuras 3, 4 y 5), observadas
    grupos = collections.defaultdict(list)
    for p in pasivas:
        if p["grupo"].startswith(("equipo ", "tablero ")) or "ranuras 1-2" in p["grupo"]:
            continue
        grupos[p["grupo"]].append([limpiar(p["nombre"]), p["familia"], p["alcance"],
                                   int(p["veces_visto"])])

    # pool de las ranuras 1 y 2, leido del codigo del juego
    por_pers = collections.defaultdict(list)
    historia = set()
    for f in pool:
        por_pers[f["identidad"]].append(limpiar(f["pasiva"]))
        if f["fijas_de_historia"]:
            historia.add(f["identidad"])
    for j in salida:
        j["p12"] = por_pers.get(j["id"], [])
        j["hist"] = 1 if j["id"] in historia else 0

    datos = {
        "generado": "herramientas/construir_datos_web.py",
        "stats": STATS,
        "tecnicas": tecnicas,
        "jugadores": salida,
        "pasivas": dict(grupos),
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, separators=(",", ":"))
    print("Escrito %s  (%.1f MB)" % (SALIDA, os.path.getsize(SALIDA) / 1e6))
    print("   jugadores: %d   tecnicas distintas: %d   grupos de pasivas: %d"
          % (len(salida), len(tecnicas), len(grupos)))
    print("   sin stats: %d" % sin_stats)
    print("   con pool de ranuras 1-2: %d   de historia: %d"
          % (sum(1 for j in salida if j["p12"]), len(historia)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
