#!/usr/bin/env python3
"""Tier list de jugadores (NOTAS O-265).

    py herramientas\\construir_tier_list.py

Escribe `datos/reglas-extraidas/tier-list.csv`: cada personaje fichable con
posicion de jugador, en su categoria (leyenda, idolo, diamante), su lista
(DEL, MED, DEF, POR; Thaddeus tambien en MED). En Diamantes salen los
Diamantes de nacimiento y todos los normales (con semilla pueden serlo). Su afinidad, su nota, la tier
que le dan los stats, los ajustes y la tier final.

Criterios de Aaron (2026-10-02, revisados tras el primer borrador):

- Stats: la nota es la suma de los stats que pesan en su posicion (los de
  POS_OPTIMA del editor: DEL potencia + control + tecnica, MED control +
  tecnica + inteligencia, DEF presion + fisico + inteligencia, POR presion +
  fisico + agilidad) a nivel 99 con su arbol: un normal en Leyenda, un Idolo
  y un Diamante con su rareza. Cada nota distinta de su categoria y posicion
  es un escalon (las que se llevan 1 punto van juntas): "si uno es algo peor
  que el otro, no en la misma tier".
- Cada ajuste es un escalon arriba o abajo, sin topes; se crean las letras
  que hagan falta (por arriba S, X, Z; por abajo A, B, C... saltando S, X, Y
  y Z). La mejor nota, sin ajustes, es S si la tienen muy pocos (2 %, al
  menos 3, y saca un 0,3 % a la siguiente); si no, A (y a S se llega con
  ajustes).
- Arbol: ranuras 1 a 6 (tronco y rama 1); las LIBRE valen para cualquier
  cosa y en una de ellas va siempre una hipertecnica.
  - DEL: optimo (+1) si puede llevar 3 tiros, 1 regate, 1 defensa y 1
    hipertecnica (como Axel nino: tiro, regate, libre, tiro, tiro, libre);
    bien (0) si puede llevar al menos 1 regate o 1 defensa con el resto
    tiros y la hipertecnica; mal (-1) si no (2 regates o 2 defensas fijos,
    ranuras de parada, o ningun hueco para regate/defensa).
  - POR: optimo (+1) si todo lo fijo es parada y tiene libre para la
    hipertecnica (5 paradas + 1 hipertecnica); cada ranura fija que no es de
    parada, -1 (como mucho -2).
  - MED: -1 por cada uno de tiro/defensa/regate que no pueda llevar
    contando una sola libre (la otra va con hipertecnica); como mucho -2.
    Optimo (+1): 2 regates, 1 tiro, 1 defensa y 2 libres (una para la
    hipertecnica y otra para lo que necesite el equipo).
- DEL con armadura o mixi max: +1.
- DEF de cuerpo musculoso o grande: +1; pequeno: -1 ("robusto" no cuenta,
  Aaron).
- Thaddeus Bellefax: arriba del todo por su modo, en DEL y tambien en MED.
"""
import csv
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import basedatos as BD, opciones as O  # noqa: E402

SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tier-list.csv")
STATS_DE_POSICION = {"DEL": (0, 1, 2), "MED": (1, 2, 6), "DEF": (3, 4, 6), "POR": (3, 4, 5)}
# de mejor a peor; si hiciera falta mas, se repite la ultima
ESCALERA = ["Z", "X", "S", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N",
            "O", "P", "Q", "R", "T", "U", "V", "W"]
CUERPO_GRANDE = {"Musculoso", "Grande"}
CUERPO_PEQUENO = {"Pequeno"}
THADDEUS = "D5ACAA9D"
# ajustes a mano de Aaron por lo que vale su modo (O-271), en todas sus listas:
# {identidad: (escalones que sube, motivo)} y {identidad: (tier fija, motivo)}
SUBE_A_MANO = {"A28E9F95": (1, "+1 por su modo Reina (Aaron)")}            # Beta, la normal
TIER_A_MANO = {"3E55F38F": ("A", "a la A por su modo Santurron (Aaron)")}   # Seth Bael
TOPE_S = 0.02
MARGEN_S = 0.003
JUNTAS = 1                # notas que se llevan esto o menos, mismo escalon


def categoria(p):
    rv = int(p.get("rareza_valor") or 0)
    return "leyenda" if rv < 5 else "idolo" if rv < 8 else "diamante"


def rareza_para_stats(p):
    rv = int(p.get("rareza_valor") or 0)
    return 4 if rv < 5 else rv


def ranuras(ident):
    """{ranura: lo que admite} de las ranuras 1 a 6 que existen."""
    f = O._por_identidad().get(ident.upper()) or {}
    fuera = {}
    for k in range(1, 7):
        t = f.get("r%d_tipo" % k) or ""
        if t and t != "?":
            fuera[k] = t
    return fuera


def _fijas_y_libres(rs):
    fijas = [t for t in rs.values() if t != "LIBRE"]
    return fijas, sum(1 for t in rs.values() if t == "LIBRE")


def ajuste_del(p, rs):
    motivos, d = [], 0
    if p.get("armadura") == "si" or p.get("mixi") == "si":
        d += 1
        motivos.append("+1 armadura/mixi")
    fijas, libres = _fijas_y_libres(rs)
    tiros, reg, defe = fijas.count("Tiro"), fijas.count("Regate"), fijas.count("Defensa")
    otras = len(fijas) - tiros - reg - defe
    texto = ", ".join(fijas) + (" + %d libres" % libres if libres else "")
    if otras or reg > 1 or defe > 1 or libres < 1:
        d -= 1
        motivos.append("-1 arbol (%s)" % texto)
    elif tiros <= 3 and libres >= 1 + (1 - reg) + (1 - defe) + (3 - tiros):
        # 3 tiros + regate + defensa + hipertecnica, con las libres (y con las
        # ranuras que tiene de verdad: el Axel de Ares no tiene la 4)
        d += 1
        motivos.append("+1 arbol optimo (%s)" % texto)
    elif reg + defe == 0 and libres < 2:
        d -= 1
        motivos.append("-1 arbol sin regate ni defensa (%s)" % texto)
    return d, motivos


def ajuste_por(p, rs):
    fijas, libres = _fijas_y_libres(rs)
    malas = [t for t in fijas if t != "Parada"]
    if malas:
        return -min(2, len(malas)), ["-%d arbol con %s" % (min(2, len(malas)), ", ".join(malas))]
    if libres >= 1:
        return 1, ["+1 arbol optimo (paradas + hipertecnica)"]
    return 0, []


def ajuste_med(p, rs):
    fijas, libres = _fijas_y_libres(rs)
    faltan = [c for c in ("Tiro", "Defensa", "Regate") if c not in fijas]
    sin = len(faltan) - min(1, libres)
    if sin > 0:
        return -min(2, sin), ["-%d no lleva a la vez tiro, defensa y regate (falta %s)" % (min(2, sin), ", ".join(faltan))]
    # optimo (Aaron): 2 regates, 1 tiro, 1 defensa y 2 libres (una para la
    # hipertecnica y otra para lo que necesite el equipo); con mas libres y
    # menos fijas tambien vale si llega a lo mismo
    reg, tiros, defe = fijas.count("Regate"), fijas.count("Tiro"), fijas.count("Defensa")
    otras = len(fijas) - reg - tiros - defe
    faltan_opt = max(0, 2 - reg) + max(0, 1 - tiros) + max(0, 1 - defe)
    if not otras and reg <= 2 and tiros <= 1 and defe <= 1 and libres >= 2 + faltan_opt:
        return 1, ["+1 arbol optimo (%s + %d libres)" % (", ".join(fijas), libres)]
    return 0, []


def ajuste_def(p, rs):
    c = p.get("cuerpo_tipo") or ""
    if c in CUERPO_GRANDE:
        return 1, ["+1 cuerpo %s" % c.lower()]
    if c in CUERPO_PEQUENO:
        return -1, ["-1 cuerpo pequeno"]
    return 0, []


AJUSTES = {"DEL": ajuste_del, "POR": ajuste_por, "MED": ajuste_med, "DEF": ajuste_def}


def hay_s(notas):
    """Si la mejor nota es S: la tienen muy pocos y saca a la siguiente."""
    distintas = sorted(set(notas), reverse=True)
    alto, cuantos = distintas[0], notas.count(distintas[0])
    siguiente = distintas[1] if len(distintas) > 1 else None
    if cuantos > max(3, TOPE_S * len(notas)):
        return False
    return siguiente is None or (alto - siguiente) >= MARGEN_S * alto


def escalones(notas):
    """{nota: escalon} con 0 la mejor; las que se llevan JUNTAS o menos van juntas."""
    fuera, k, anterior = {}, -1, None
    for n in sorted(set(notas), reverse=True):
        if anterior is None or anterior - n > JUNTAS:
            k += 1
        fuera[n] = k
        anterior = n
    return fuera


def letra(k):
    return ESCALERA[max(0, min(len(ESCALERA) - 1, k))]


def main():
    ps = [p for p in BD.personajes()
          if p.get("fichable") == "si" and p.get("posicion") in STATS_DE_POSICION]
    filas = []
    # cada normal sale en Leyendas y tambien en Diamantes (con una semilla
    # cualquiera puede ser Diamante): ahi se mira con sus stats de Diamante
    pares = [(p, categoria(p), rareza_para_stats(p)) for p in ps]
    pares += [(p, "diamante", 8) for p in ps if categoria(p) == "leyenda"]
    for p, cat, rareza in pares:
        st = O._stats99_con_arbol(p["identidad"], rareza)
        nota = sum(st[k] for k in STATS_DE_POSICION[p["posicion"]])
        filas.append({"categoria": cat, "lista": p["posicion"], "identidad": p["identidad"],
                      "nombre": p["nombre"], "saga": p.get("saga") or "", "elemento": p.get("elemento") or "",
                      "posicion": p["posicion"], "cuerpo": p.get("cuerpo_tipo") or "",
                      "arquetipo": p.get("arquetipo") or "",      # el de los Idolos es fijo
                      "nota": nota, "stats": " ".join(map(str, st)), "_p": p})
    # Thaddeus tambien en la lista de medios (se juega asi en el competitivo)
    extra = []
    for f in filas:
        if f["identidad"] == THADDEUS:
            extra.append(dict(f, lista="MED"))
    # las tiers por stats, con las notas de SU posicion (Thaddeus en MED se
    # compara con los medios por su nota de medio)
    for f in extra:
        st = [int(x) for x in f["stats"].split()]
        f["nota"] = sum(st[k] for k in STATS_DE_POSICION["MED"])
    filas += extra
    grupos = {}
    for f in filas:
        if f in extra:
            continue
        grupos.setdefault((f["categoria"], f["lista"]), []).append(f["nota"])
    base = {g: (escalones(n), ESCALERA.index("S") if hay_s(n) else ESCALERA.index("A")) for g, n in grupos.items()}
    for f in filas:
        esc, cero = base[(f["categoria"], f["lista"])]
        k = esc.get(f["nota"])
        if k is None:      # Thaddeus en MED: su nota de medio entre las de los medios
            k = min((esc[n] for n in esc if n <= f["nota"] + JUNTAS), default=max(esc.values()))
        f["tier_stats"] = letra(cero + k)
        d, motivos = AJUSTES[f["lista"]](f["_p"], ranuras(f["identidad"]))
        f["_k"] = cero + k - d
        f["tier"] = letra(f["_k"])
        f["ajustes"] = "; ".join(motivos)
    for f in filas:
        if f["identidad"] in SUBE_A_MANO:
            n, motivo = SUBE_A_MANO[f["identidad"]]
            f["_k"] -= n
            f["tier"] = letra(f["_k"])
            f["ajustes"] = (f["ajustes"] + "; " if f["ajustes"] else "") + motivo
        if f["identidad"] in TIER_A_MANO:
            t, motivo = TIER_A_MANO[f["identidad"]]
            f["_k"] = ESCALERA.index(t)
            f["tier"] = t
            f["ajustes"] = (f["ajustes"] + "; " if f["ajustes"] else "") + motivo
    # Thaddeus: arriba del todo de sus dos listas
    for f in filas:
        if f["identidad"] == THADDEUS:
            mejor = min((g["_k"] for g in filas if g["categoria"] == f["categoria"]
                         and g["lista"] == f["lista"] and g["identidad"] != THADDEUS), default=2)
            f["_k"] = min(mejor, ESCALERA.index("S"))
            f["tier"] = letra(f["_k"])
            f["ajustes"] = (f["ajustes"] + "; " if f["ajustes"] else "") + "arriba del todo por su modo (Aaron)"
    campos = ["categoria", "lista", "tier", "tier_stats", "ajustes", "identidad", "nombre", "saga",
              "elemento", "posicion", "cuerpo", "arquetipo", "nota", "stats"]
    filas.sort(key=lambda f: (f["categoria"], f["lista"], f["_k"], -f["nota"], f["nombre"]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Tier list de jugadores (NOTAS O-265). Lo genera herramientas/construir_tier_list.py.\n")
        w = csv.DictWriter(fh, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)
    import collections
    for c in ("leyenda", "idolo", "diamante"):
        for lista in ("DEL", "MED", "DEF", "POR"):
            cnt = collections.Counter(f["tier"] for f in filas if f["categoria"] == c and f["lista"] == lista)
            print("%-8s %s  %s" % (c, lista, "  ".join("%s:%d" % (t, cnt[t]) for t in ESCALERA if cnt[t])))
    print("escritos %d en %s" % (len(filas), SALIDA))


if __name__ == "__main__":
    main()
