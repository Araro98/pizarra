#!/usr/bin/env python3
"""Saca del juego cuanto vale cada pasiva y de que tipo de efecto es.

    py herramientas\\construir_valores_pasivas.py

Escribe `datos/reglas-extraidas/pasivas-valor.csv`.

En `skill/passive_skill_config` cada pasiva apunta a una o mas filas de
`PASSIVE_SKILL_EFFECT_LIST`, y cada fila es (tipo de efecto, valor, objetivos).
El **valor es el numero que el juego ensena** en el texto: "Tasa de brecha del
equipo +<VALUE> %" con valor 2 sale como "+2 %"; las casillas de stat `ps2`
llevan 3, 5, 7 (NOTAS O-145).

El tipo de efecto es un identificador (80 distintos). Su nombre no esta en
ninguna tabla; aqui se le pone una **familia** legible leyendo el texto de las
pasivas que lo usan (AT de tiro, DF del muro, foco, disputa, PP, tension...),
que es lo que necesita la calculadora para saber a que sumarlo.
"""
import csv
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-valor.csv")

# familia legible por el texto, en orden: gana la primera que casa
FAMILIAS = [
    (r"AT de tiro|AT propio de tiro|tiro directo", "at_tiro"),
    (r"DF del muro|DF propia del muro", "df_muro"),
    (r"AT de foco|AT propio de foco", "at_foco"),
    (r"DF de foco|DF propia de foco", "df_foco"),
    (r"valor .*foco|foco del equipo", "foco"),
    (r"AT de disputa", "at_disputa"),
    (r"DF de disputa", "df_disputa"),
    (r"disputa", "disputa"),
    (r"\bPP\b|portero", "pp"),
    (r"brecha|perforaci", "brecha"),
    (r"tensi", "tension"),
    (r"poder de afinidad|afinidad", "afinidad"),
    (r"faltas?\b", "faltas"),
    (r"tasa de obtenci", "obtencion"),
    (r"potencia", "stat_potencia"), (r"control", "stat_control"), (r"t[eé]cnica", "stat_tecnica"),
    (r"inteligencia", "stat_inteligencia"), (r"presi[oó]n", "stat_presion"),
    (r"f[ií]sico", "stat_fisico"), (r"agilidad", "stat_agilidad"),
]


def limpio(t):
    t = (t or "").replace("\\\\n", " ").replace("\\n", " ")
    t = re.sub(r"\[[A-Z0-9]+\]|\[C\]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def trozo_con_valor(texto):
    """El trozo de la frase donde esta el numero: "Cuando el equipo gana en
    foco o disputa, tension +<VALUE> %" es de tension, no de foco."""
    for trozo in re.split(r"[,:;]", texto):
        if "<VALUE>" in trozo:
            return trozo
    return texto


def familia_de(texto):
    for donde in (trozo_con_valor(texto), texto):
        for patron, fam in FAMILIAS:
            if re.search(patron, donde, re.I):
                return fam
    return "otra"


def main():
    crudo = open(os.path.join(TABLAS, "PASSIVE_SKILL_INFO_LIST.crudo.txt"), encoding="utf-8").read().splitlines()
    efectos = []
    for l in open(os.path.join(TABLAS, "PASSIVE_SKILL_EFFECT_LIST.crudo.txt"), encoding="utf-8").read().splitlines()[1:]:
        v = re.findall(r"(Int|Float)\((-?[\d.]+)\)", l)
        if len(v) >= 2:
            efectos.append((int(v[0][1]) & 0xFFFFFFFF, float(v[1][1]) if v[1][0] == "Float" else int(v[1][1])))
    pasivas = []
    k = 1
    while k < len(crudo):
        m = re.match(r'\[\[Int\((-?\d+)\)\], \[Int\((-?\d+)\)\], \[Int\((-?\d+)\)\], \[Int\((-?\d+)\)\], '
                     r'\[Int\((-?\d+)\)\], \[Int\((-?\d+)\)\], \[String\("([^"]+)"\)\]\]', crudo[k])
        if m:
            mm = re.match(r"\[\[Int\((-?\d+)\)\], \[Int\((-?\d+)\)\]\]", crudo[k + 2]) if k + 2 < len(crudo) else None
            ref = (int(mm.group(1)), int(mm.group(2))) if mm else (0, 0)
            pasivas.append((int(m.group(1)) & 0xFFFFFFFF, m.group(7), ref))
            k += 3
        else:
            k += 1

    textos = {f["id"].upper(): (f.get("nombre_es") or f.get("nombre_en"))
              for f in reglas._tabla("nombres-es.csv") if f.get("categoria") == "pasiva"}
    filas = []
    for ident, interno, (desde, cuantas) in pasivas:
        id_partida = bytes.fromhex("%08X" % ident)[::-1].hex().upper()
        texto = limpio(textos.get(id_partida, ""))
        e = efectos[desde:desde + cuantas]
        tipo = "%08X" % e[0][0] if e else ""
        valor = e[0][1] if e else 0
        filas.append([id_partida, interno, tipo, valor, familia_de(texto), texto])
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Cuanto vale cada pasiva y de que va (para sumarlas por equipo).\n"
                 "# id = como esta en la partida. valor = el numero que ensena el juego.\n"
                 "# familia = puesta por nosotros leyendo el texto (NOTAS O-145).\n"
                 "# Lo genera herramientas/construir_valores_pasivas.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "interno", "tipo_efecto", "valor", "familia", "texto"])
        w.writerows(filas)
    fam = {}
    for f in filas:
        fam[f[4]] = fam.get(f[4], 0) + 1
    print("Escritas %d pasivas en %s" % (len(filas), SALIDA))
    for k2, n in sorted(fam.items(), key=lambda x: -x[1]):
        print("  %-18s %4d" % (k2, n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
