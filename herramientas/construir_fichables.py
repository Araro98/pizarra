#!/usr/bin/env python3
"""Quienes se pueden conseguir de verdad en el juego (NOTAS O-205).

    py herramientas\\construir_fichables.py

Escribe `datos/reglas-extraidas/fichables.csv` (identidad, nombre, fuentes) con
los personajes que el juego da por alguna via, y `no-fichables.csv` con los que
estan en `jugadores.csv` pero no salen en ninguna: formas transformadas de un
partido (modo Aphrody de Byron, modo Furia de Buddy, Reina de Beta...) y
personajes de historia que no se fichan (Umibozu, UM-BZ9, caras npc...).

Las vias, todas en tablas del juego:

| fuente   | tabla                                                                 |
|----------|-----------------------------------------------------------------------|
| universo | `players_universe_config` m_starSignCharaInfoList (5.010): el Universo de jugadores |
| basara   | `basara_chara_config` m_basaraBuildInfoList: los Diamantes (Basara)    |
| tienda   | `shop_config` SHOP_BASARA_SPIRIT_LIST: espiritus Basara de la tienda   |
| unica    | `soccer_chara_unique_rarity_config`: los de rareza unica (Idolos)      |
| correo   | `delivery_config` m_DeliveryContentsDataList: regalos por correo       |
| cronica  | plantillas de los equipos rivales de la Cronica (`team_config`, equipos `tm_cro_*`): se fichan tras jugar contra ellos (Zanark con Cao Cao, la Beta del modo Reina que si se ficha) |
| archivo  | `data_file_config` m_MenuDataFileConfigList: personajes del archivo de datos (los clubes del instituto y demas gente de la historia) |

Y se quitan siempre, salgan donde salgan, las formas a las que se llega en un
partido: la segunda columna de CHARA_MODE_CHANGE_LIST (cambio de modo) y de
CHARA_CHANGE_AWAKENING_POWER_LIST (despertar) de `chara_change`. Lo dijo Aaron
y cuadra con su partida: la Seth Bael despertada esta en un equipo rival de
Orion y aun asi no se ficha.
"""
import csv
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GD = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
EXTRAIDAS = os.path.join(RAIZ, "datos", "reglas-extraidas")

# Sin tabla que los de, pero en la partida de origen del proyecto desde el
# principio (un Diamante de Axel Blaze de la primera entrega, seguramente un
# extra de reserva o de codigo): se conservan.
EXTRAS = {"A41870E9": "extra"}


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def hexa(x):
    return "%08X" % (int(x) & 0xFFFFFFFF)


def numeros(texto):
    return [int(x) for x in re.findall(r"-?\d{5,}", texto)]


def leer_csv(nombre):
    with open(os.path.join(EXTRAIDAS, nombre), encoding="utf-8") as f:
        return list(csv.DictReader(l for l in f if not l.startswith("#")))


def identidades(filas, conocidas):
    fuera = set()
    for fila in filas:
        for celda in fila:
            for v in numeros(celda):
                k = hexa(v)
                if k in conocidas:
                    fuera.add(k)
    return fuera


def codigo_de(celda):
    """String("tm_cro_go2_0900") -> tm_cro_go2_0900"""
    m = re.search(r'"([^"]*)"', celda)
    return m.group(1) if m else celda


def equipos_de_cronica(conocidas):
    """Identidades de los miembros de los equipos rivales de la Cronica."""
    f = unico(os.path.join(GD, "team"), "team_config")
    miembros = [m for m in volcar(f, "SOCCER_TEAM_MEMBER_LIST") if len(m) == 28]
    info = volcar(f, "SOCCER_TEAM_INFO_LIST")
    fuera = set()
    i = 0
    while i < len(info):
        fila = info[i]
        if len(fila) == 10:
            codigo = codigo_de(fila[1])
            desde, cuantos = int(info[i + 1][0]), int(info[i + 1][1])
            if codigo.startswith("tm_cro"):
                for m in miembros[desde:desde + cuantos]:
                    k = hexa(m[0])
                    if k in conocidas:
                        fuera.add(k)
            i += 5
        else:
            i += 1
    return fuera


def main():
    per = {f["identidad"].upper(): f for f in leer_csv("personajes.csv")}
    jug = {}
    for f in leer_csv("jugadores.csv"):
        jug.setdefault(f["identidad"].upper(), f)
    conocidas = set(per) | set(jug)
    fuentes = {}

    def anade(nombre, ids):
        for k in ids:
            fuentes.setdefault(k, []).append(nombre)
        print("  %-9s %5d" % (nombre, len(ids)))

    ch = os.path.join(GD, "character")
    anade("universo", identidades(volcar(unico(os.path.join(GD, "players_universe"), "players_universe_config"), "m_starSignCharaInfoList"), conocidas))
    anade("basara", identidades(volcar(unico(ch, "basara_chara_config"), "m_basaraBuildInfoList"), conocidas))
    anade("tienda", identidades(volcar(unico(os.path.join(GD, "shop"), "shop_config"), "SHOP_BASARA_SPIRIT_LIST"), conocidas))
    anade("unica", identidades(volcar(unico(os.path.join(GD, "soccer"), "soccer_chara_unique_rarity_config"), "m_soccerCharaUniqueRarityList"), conocidas))
    anade("correo", identidades(volcar(unico(os.path.join(GD, "post"), "delivery_config"), "m_DeliveryContentsDataList"), conocidas))
    anade("cronica", equipos_de_cronica(conocidas))
    anade("archivo", identidades(volcar(unico(os.path.join(GD, "data_file"), "data_file_config"), "m_MenuDataFileConfigList"), conocidas))
    for k, v in EXTRAS.items():
        fuentes.setdefault(k, []).append(v)

    cambio = unico(ch, "chara_change")
    transformadas = {}
    for tabla, nombre in (("CHARA_MODE_CHANGE_LIST", "cambio de modo"),
                          ("CHARA_CHANGE_AWAKENING_POWER_LIST", "despertar")):
        for fila in volcar(cambio, tabla):
            n = numeros("\t".join(fila))
            if len(n) >= 2:
                origen = (per.get(hexa(n[0])) or {}).get("nombre_es") or hexa(n[0])
                transformadas[hexa(n[1])] = "%s de %s" % (nombre, origen)
    print("  formas transformadas: %d" % len(transformadas))

    def nombre_de(k):
        j = jug.get(k) or {}
        p = per.get(k) or {}
        return j.get("nombre") or p.get("nombre_es") or p.get("nombre_en") or ""

    legales = sorted(k for k in fuentes if k not in transformadas)
    with open(os.path.join(EXTRAIDAS, "fichables.csv"), "w", encoding="utf-8", newline="") as f:
        f.write("# Personajes que el juego da por alguna via (NOTAS O-205). Lo genera herramientas/construir_fichables.py.\n")
        f.write("# fuentes: universo | basara | tienda | unica | correo | cronica | archivo | extra\n")
        w = csv.writer(f)
        w.writerow(["identidad", "nombre", "fuentes"])
        for k in legales:
            w.writerow([k, nombre_de(k), "|".join(fuentes[k])])
    quitados = []
    for k, j in jug.items():
        if k in transformadas:
            quitados.append((k, j, transformadas[k]))
        elif k not in fuentes:
            quitados.append((k, j, "sin ninguna via"))
    quitados.sort(key=lambda x: (x[2].startswith("sin"), (x[1].get("nombre") or "").lower()))
    with open(os.path.join(EXTRAIDAS, "no-fichables.csv"), "w", encoding="utf-8", newline="") as f:
        f.write("# Entradas de jugadores.csv que el juego no da por ninguna via (NOTAS O-205). Lo genera herramientas/construir_fichables.py.\n")
        w = csv.writer(f)
        w.writerow(["identidad", "nombre", "rareza", "posicion", "equipo", "cara", "motivo"])
        for k, j, motivo in quitados:
            w.writerow([k, j.get("nombre", ""), j.get("rareza", ""), j.get("posicion", ""),
                        j.get("equipo", ""), j.get("string_id", ""), motivo])
    print("fichables: %d   de jugadores.csv: %d   quitados: %d"
          % (len(legales), len(set(jug) & set(legales)), len(quitados)))


if __name__ == "__main__":
    main()
