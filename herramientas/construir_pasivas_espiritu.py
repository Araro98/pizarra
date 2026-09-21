#!/usr/bin/env python3
"""La habilidad pasiva de cada espiritu (NOTAS O-184).

    py herramientas\\construir_pasivas_espiritu.py

Escribe `datos/reglas-extraidas/pasivas-espiritu.csv`: id del espiritu, nombre,
familia, el texto de la pasiva y su numero.

**Como se encontro.** Detras de la ficha de cada espiritu en `aura_skill_config`
(la fila de 19 columnas de `AURA_CMD_INFO_LIST`) van tres parejas
(indice, cuantos) que apuntan a `AURA_CMD_UNIQUE_EFFECT_LIST`,
`AURA_CMD_EFFECT_LIST` y `AURA_CMD_CHARA_LIST`. Las de EFFECT son los +50 %
genericos que llevan todos; **la de UNIQUE es la pasiva propia**, y el indice va
**desplazado en uno** (el primer indice apunta a la fila siguiente).

Ese id se busca en `soccer/soccer_command_effect_config`, donde cada efecto se
describe en tres partes: el tipo y el numero (`EFFECT_DATA_LIST`), y a quien o
cuando se aplica (`TARGET_COND_DATA_LIST` o `EXEC_COND_DATA_LIST`). El fichero
repite el nombre de tabla decenas de veces, asi que hace falta
`volcado --todas`, que se anadio para esto.

Comprobado con las tres fotos que mando Aaron (Argentia, Metis y Asura) y
contra los 60 espiritus con pasiva de inazumo.es: 55 aciertos de 59.

Lo unico que no se sabe es si un efecto "en campo propio", "en campo
contrario" o "fuera del area" es del propio jugador o de todo el equipo: los
datos no lo separan. En esos el texto se deja sin ese matiz.
"""
import csv
import glob
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-espiritu.csv")

# El indice de UNIQUE va desplazado en uno (medido, ver arriba).
DESPLAZAMIENTO = 1

# El tipo de efecto -> (como se dice cuando afecta a otros, cuando es propio)
STAT = {
    535144085: ("AT de tiro", "AT propio de tiro"),
    2263676719: ("Valor de foco", "Valor propio de foco"),
    4058761145: ("Valor de disputa", "Valor propio de disputa"),
    1871663642: ("DF del muro", "DF propia del muro"),
}
# Efectos que ya son una frase entera, sin condicion
FRASE = {
    2962847875: "Al hacer un pase, poder de afinidad +%s %%",
    659267851: "Tensión necesaria para la brecha del equipo -%s %%",
    3106878632: "Cuando el equipo gana en foco o disputa, tensión +%s %%",
    2132946800: "Tasa de parada +%s %%",
    208073416: "Tasa de brecha del equipo +%s %%",
    1989436251: "Tasa de faltas del equipo -%s %% al esprintar",
}
# A quien afecta
A_QUIEN = {
    ("target", 1): "para jugadores del mismo elemento",
    ("target", 2): "para jugadores de distintos elementos",
    ("target", 4): "para jugadores de la misma posición",
    ("target", 5): "para jugadores de distintas posiciones",
    ("target", 10): "para jugadores cercanos",
    # en estos tres los datos no dicen si es propio o de todo el equipo
    ("target", 7): "en campo propio",
    ("target", 8): "en campo contrario",
    ("target", 9): "cuando se está fuera del área",
}
# Cuando se aplica (y entonces el efecto es del propio jugador)
CUANDO = {
    ("exec", 12): "Cuando un jugador del mismo elemento está cerca,",
    ("exec", 13): "Cuando un jugador de otro elemento está cerca,",
}


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


def efectos_del_juego():
    """{id de efecto: (tipo, numero, condicion)} de soccer_command_effect_config."""
    fichero = unico("soccer", "soccer_command_effect_config")
    r = subprocess.run([VOLCADO, fichero, "--todas"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con el fichero de efectos")
    seq, tabla = [], None
    for l in r.stdout.splitlines():
        c = l.split("\t")
        if c[0].startswith("#TABLA"):
            tabla = c[2]
            continue
        if (tabla == "SC_COMMAND_EFFECT_INFO_EFFECT_DATA_LIST" and len(c) > 5
                and u32(c[0]) and c[1].lstrip("-").isdigit()):
            seq.append(("efecto", (u32(c[0]), int(c[1]))))
        elif (tabla and tabla.endswith("COND_DATA_LIST") and len(c) >= 2
              and c[0].lstrip("-").isdigit() and abs(int(c[0])) < 200
              and c[1] == "-992181094"):
            seq.append(("cond", ("target" if "TARGET" in tabla else "exec", int(c[0]))))
        elif (len(c) == 3 and u32(c[0]) and abs(int(c[0])) > 100000
              and u32(c[1]) and abs(int(c[1])) > 100000):
            seq.append(("padre", u32(c[0])))
    fuera = {}
    for i, (clase, v) in enumerate(seq):
        if clase != "padre":
            continue
        efecto = cond = None
        for j in range(i + 1, len(seq)):
            if seq[j][0] == "padre":
                break
            if seq[j][0] == "efecto" and efecto is None:
                efecto = seq[j][1]
            if seq[j][0] == "cond" and cond is None:
                cond = seq[j][1]
        if efecto:
            fuera[v] = (efecto[0], efecto[1], cond)
    return fuera


def texto_de(tipo, numero, cond):
    """El texto de la pasiva, o "" si no se sabe decirlo."""
    if tipo in FRASE:
        return FRASE[tipo] % ("%g" % numero)
    if tipo not in STAT:
        return ""
    normal, propio = STAT[tipo]
    if cond in CUANDO:
        return "%s %s +%g %%" % (CUANDO[cond], propio, numero)
    if cond in A_QUIEN:
        return "%s +%g %% %s" % (normal, numero, A_QUIEN[cond])
    if cond is None:
        return "%s del equipo +%g %%" % (normal, numero)
    return ""


def main():
    aura = unico("skill", "aura_skill_config")
    info = volcar(aura, "AURA_CMD_INFO_LIST")
    uni = volcar(aura, "AURA_CMD_UNIQUE_EFFECT_LIST")
    efectos = efectos_del_juego()

    # cada ficha de 19 columnas va seguida de sus parejas (indice, cuantos)
    fichas, i = {}, 0
    while i < len(info):
        c = info[i]
        if len(c) == 19:
            subs, j = [], i + 1
            while j < len(info) and len(info[j]) == 2:
                subs.append([int(x) for x in info[j]])
                j += 1
            fichas[en_partida(c[0])] = subs
            i = j
        else:
            i += 1

    esp = {f["id"].upper(): f for f in reglas._tabla("espiritus.csv")}
    nombres = {f["id"].upper(): (f.get("nombre_es") or f.get("nombre_en") or "")
               for f in reglas._tabla("nombres-es.csv") if f.get("categoria") == "aura"}
    filas, sin_texto = [], 0
    for idh, subs in sorted(fichas.items()):
        if not subs:
            continue
        # Sin pareja UNIQUE (cuantos = 0) el espiritu no tiene pasiva propia:
        # es el caso de todas las armaduras, mixi max y almas, y de los modos.
        # Antes se caia en la fila 1 de la lista y salia el mismo texto de
        # relleno en 296 espiritus ("AT propio de tiro +20 %"). Aaron: "quita
        # los efectos de las pasivas de almas, armaduras y mixi" (O-224).
        if subs[0][1] == 0:
            continue
        k = subs[0][0] + DESPLAZAMIENTO
        if not (0 <= k < len(uni)):
            continue
        e = efectos.get(u32(uni[k][0]))
        if not e:
            continue
        texto = texto_de(*e)
        if not texto:
            sin_texto += 1
            continue
        f = esp.get(idh) or {}
        filas.append([idh, nombres.get(idh, ""), f.get("familia") or "", texto,
                      "%g" % e[1]])
    filas.sort(key=lambda f: (f[2], f[1].lower()))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# La habilidad pasiva de cada espiritu (NOTAS O-184).\n"
                 "# Lo genera herramientas/construir_pasivas_espiritu.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "nombre", "familia", "texto", "valor"])
        w.writerows(filas)
    import collections
    print("Escritas %d pasivas en %s (%d sin texto conocido)"
          % (len(filas), SALIDA, sin_texto))
    print("   por familia:", dict(collections.Counter(f[2] for f in filas)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
