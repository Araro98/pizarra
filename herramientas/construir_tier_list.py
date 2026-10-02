#!/usr/bin/env python3
"""Tier list de jugadores (NOTAS O-265).

    py herramientas\\construir_tier_list.py

Escribe `datos/reglas-extraidas/tier-list.csv`: cada personaje fichable con
posicion de jugador, en su categoria (leyenda, idolo, diamante), su lista
(DEL, MED, DEF, POR; Thaddeus tambien en MED), su afinidad, su nota, la tier
que le dan los stats, los ajustes y la tier final.

Criterios de Aaron (2026-10-02):

- Stats: la nota es la suma de los stats que pesan en su posicion (los de
  POS_OPTIMA del editor: DEL potencia + control + tecnica, MED control +
  tecnica + inteligencia, DEF presion + fisico + inteligencia, POR presion +
  fisico + agilidad) a nivel 99 con su arbol: un normal en Leyenda, un Idolo
  y un Diamante con su rareza. Los stats a 99 van por plantillas (muchos
  personajes comparten numeros: en DEF 773 de 1581 tienen la peor nota):
  - leyendas (muchos): por el puesto que ocupa su nota en la lista (el
    centro de su grupo de notas iguales): A hasta el 15 % de arriba, B hasta
    el 40 %, C hasta el 70 %, D el resto;
  - Idolos y Diamantes (pocos): por lo cerca que esta su nota de la mejor
    (A el cuarto de arriba de la distancia entre la peor y la mejor, luego
    B, C y D); el grupo mas alto siempre es A.
- S solo los muy pocos: la nota mas alta si la comparten como mucho un 2 %
  (al menos 3 caben siempre) y saca a la siguiente al menos un 0,3 %. Si no,
  S se queda vacia. Los ajustes no suben a nadie a S: S, X y Z son solo
  para los que ya son S por stats.
- Ajustes (en las tres categorias), cada uno una tier arriba o abajo; por
  encima de S van X y luego Z, por debajo de D, E:
  - DEL con armadura o mixi max: +1.
  - DEL cuyo arbol (ranuras 1 a 6: el tronco y la rama 1, sin las libres)
    no sea todo tiro salvo 1 regate, 1 defensa o 1 regate + 1 defensa: -1.
  - POR con alguna ranura (1 a 6, sin las libres) que no sea de parada: -1.
  - MED que no pueda llevar a la vez tiro, defensa y regate (contando sus
    ranuras 1 a 6 y como mucho UNA libre, la otra va con hipertecnica): -1.
  - DEF de cuerpo musculoso o grande: +1; pequeno: -1.
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
ESCALERA = ["Z", "X", "S", "A", "B", "C", "D", "E"]
CUERPO_GRANDE = {"Musculoso", "Grande"}
CUERPO_PEQUENO = {"Pequeno"}
THADDEUS = "D5ACAA9D"
TOPE_S = 0.02
MARGEN_S = 0.003          # lo que tiene que sacar a la siguiente nota
POCOS = 100               # por debajo de esto, tiers por distancia a la mejor


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


def ajuste_del(p, rs):
    motivos, d = [], 0
    if p.get("armadura") == "si" or p.get("mixi") == "si":
        d += 1
        motivos.append("+1 armadura/mixi")
    fijas = [t for t in rs.values() if t != "LIBRE"]
    reg, defe = fijas.count("Regate"), fijas.count("Defensa")
    otras = [t for t in fijas if t not in ("Tiro", "Regate", "Defensa")]
    if not (reg <= 1 and defe <= 1 and reg + defe >= 1 and not otras):
        d -= 1
        motivos.append("-1 arbol (%s)" % ", ".join(fijas))
    return d, motivos


def ajuste_por(p, rs):
    fijas = [t for t in rs.values() if t != "LIBRE"]
    malas = [t for t in fijas if t != "Parada"]
    if malas:
        return -1, ["-1 arbol con %s" % ", ".join(sorted(set(malas)))]
    return 0, []


def ajuste_med(p, rs):
    fijas = [t for t in rs.values() if t != "LIBRE"]
    libres = sum(1 for t in rs.values() if t == "LIBRE")
    faltan = [c for c in ("Tiro", "Defensa", "Regate") if c not in fijas]
    if len(faltan) > min(1, libres):
        return -1, ["-1 no lleva a la vez tiro, defensa y regate (falta %s)" % ", ".join(faltan)]
    return 0, []


def ajuste_def(p, rs):
    c = p.get("cuerpo_tipo") or ""
    if c in CUERPO_GRANDE:
        return 1, ["+1 cuerpo %s" % c.lower()]
    if c in CUERPO_PEQUENO:
        return -1, ["-1 cuerpo pequeno"]
    return 0, []


AJUSTES = {"DEL": ajuste_del, "POR": ajuste_por, "MED": ajuste_med, "DEF": ajuste_def}


def mueve(tier, d):
    """Sube o baja d tiers. A S (y por encima) solo se llega siendo ya S."""
    k = ESCALERA.index(tier) - d
    if d > 0 and ESCALERA.index(tier) > ESCALERA.index("S"):
        k = max(k, ESCALERA.index("A"))
    return ESCALERA[max(0, min(len(ESCALERA) - 1, k))]


def hay_s(notas):
    """La nota de la S, o None si S se queda vacia."""
    distintas = sorted(set(notas), reverse=True)
    alto = distintas[0]
    cuantos = notas.count(alto)
    siguiente = distintas[1] if len(distintas) > 1 else None
    if cuantos > max(3, TOPE_S * len(notas)):
        return None
    if siguiente is not None and (alto - siguiente) < MARGEN_S * alto:
        return None
    return alto


def tier_por_stats(nota, notas):
    """La tier de una nota entre las de su categoria y posicion."""
    s = hay_s(notas)
    if s is not None and nota == s:
        return "S"
    resto = [n for n in notas if n != s]
    if len(notas) >= POCOS:
        # por el puesto: el centro del grupo de los que tienen esa nota
        encima = sum(1 for n in resto if n > nota)
        iguales = sum(1 for n in resto if n == nota)
        pos = (encima + iguales / 2) / len(resto)
        return "A" if pos < 0.15 else "B" if pos < 0.40 else "C" if pos < 0.70 else "D"
    alto, bajo = max(resto), min(resto)
    if nota == alto:
        return "A"
    f = (nota - bajo) / (alto - bajo) if alto > bajo else 1.0
    return "A" if f >= 0.75 else "B" if f >= 0.5 else "C" if f >= 0.25 else "D"


def main():
    ps = [p for p in BD.personajes()
          if p.get("fichable") == "si" and p.get("posicion") in STATS_DE_POSICION]
    filas = []
    for p in ps:
        st = O._stats99_con_arbol(p["identidad"], rareza_para_stats(p))
        nota = sum(st[k] for k in STATS_DE_POSICION[p["posicion"]])
        filas.append({"categoria": categoria(p), "lista": p["posicion"], "identidad": p["identidad"],
                      "nombre": p["nombre"], "saga": p.get("saga") or "", "elemento": p.get("elemento") or "",
                      "posicion": p["posicion"], "cuerpo": p.get("cuerpo_tipo") or "",
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
    for f in filas:
        f["tier_stats"] = tier_por_stats(f["nota"], grupos[(f["categoria"], f["lista"])])
        d, motivos = AJUSTES[f["lista"]](f["_p"], ranuras(f["identidad"]))
        f["tier"] = mueve(f["tier_stats"], d)
        f["ajustes"] = "; ".join(motivos)
    # Thaddeus: arriba del todo de sus dos listas (y nunca por debajo de S)
    for f in filas:
        if f["identidad"] == THADDEUS:
            mas_alta = min((ESCALERA.index(g["tier"]) for g in filas
                            if g["categoria"] == f["categoria"] and g["lista"] == f["lista"] and g is not f),
                           default=ESCALERA.index("S"))
            f["tier"] = ESCALERA[min(mas_alta, ESCALERA.index("S"))]
            f["ajustes"] = (f["ajustes"] + "; " if f["ajustes"] else "") + "arriba del todo por su modo (Aaron)"
    campos = ["categoria", "lista", "tier", "tier_stats", "ajustes", "identidad", "nombre", "saga",
              "elemento", "posicion", "cuerpo", "nota", "stats"]
    filas.sort(key=lambda f: (f["categoria"], f["lista"], ESCALERA.index(f["tier"]), -f["nota"], f["nombre"]))
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
