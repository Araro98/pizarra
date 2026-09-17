#!/usr/bin/env python3
"""De quien es cada armadura y cada mixi max (NOTAS O-172).

    py herramientas\\construir_duenos_espiritus.py

Escribe `datos/reglas-extraidas/espiritus-duenos.csv`: id del espiritu, nombre,
familia, identidad del personaje que puede llevarlo, su nombre y de donde sale.

Regla de Aaron: las armaduras y los mixi max son de un personaje concreto (la
armadura del Pegaso solo la lleva Arion; el mixi con el Rey Arturo, solo Arion).
Los kenshin y las almas no tienen dueno. De las hipertecnicas especiales, cinco
son de todos (fila con personaje "todos") y el resto de su personaje (O-174).

Fuentes, en los datos del juego:

- `aura_skill_config` / `AURA_CMD_INFO_LIST`, columna 13: para una armadura, la
  identidad del personaje con el modelo de la armadura puesta (`col13`). Para
  un mixi esa columna es el companero con el que se hace, no el dueno, y no se usa.
- `change_aura_skill_config` / `m_ChangeAuraSkillDataList`: pares (espiritu,
  identidad) de quien puede cambiar a esa armadura o mixi (`change`; 0 = nadie
  apuntado).
- `chara_param`: las columnas 11, 15, 19, 21 y 27 llevan la armadura o el mixi
  propio de algunas versiones del personaje (`cpN`).

Un mismo personaje tiene muchas identidades (normal, Idolo, version de la
historia...), asi que el editor compara por NOMBRE del personaje.
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
TABLAS = os.path.join(RAIZ, "datos", "juego", "tablas")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "espiritus-duenos.csv")
COLUMNAS_CHARA_PARAM = (11, 15, 19, 21, 27)
# hipertecnicas especiales que puede llevar cualquiera (Aaron, O-174)
PARA_TODOS = {"Catalizador elemental", "Determinación de portero", "Impulso temporal",
              "Guardián férreo", "Sobrecarga ardiente"}


def unico(carpeta, prefijo):
    hallados = sorted(glob.glob(os.path.join(GAMEDATA, carpeta, prefijo + "*.cfg.bin")))
    if not hallados:
        raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))
    return hallados[0]


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def es_entero(x):
    return bool(x) and x.lstrip("-").isdigit()


def en_partida(x):
    """Un id de espiritu tal y como aparece en la partida (los 4 bytes al reves)."""
    return bytes.fromhex("%08X" % (int(x) & 0xFFFFFFFF))[::-1].hex().upper()


def identidad(x):
    """Una identidad de personaje tal y como va en personajes.csv."""
    return "%08X" % (int(x) & 0xFFFFFFFF)


def main():
    esp = {f["id"].upper(): f["familia"] for f in reglas._tabla("espiritus.csv")}
    nombres = {f["id"].upper(): f.get("nombre_es") or f.get("nombre_en") or ""
               for f in reglas._tabla("nombres-es.csv") if f.get("categoria") == "aura"}
    personajes = reglas.personajes()
    de_dueno = {a for a, f in esp.items() if f in ("armadura", "mixi", "especial")}

    fuentes = {}      # (espiritu, identidad) -> {fuentes}
    def apunta(espiritu, ident, fuente):
        if espiritu in de_dueno and ident in personajes:
            if esp[espiritu] == "especial" and nombres.get(espiritu, "") in PARA_TODOS:
                return      # esas son de todos: no se apunta a miles de personajes
            fuentes.setdefault((espiritu, ident), set()).add(fuente)

    for c in volcar(unico("skill", "aura_skill_config"), "AURA_CMD_INFO_LIST"):
        if len(c) > 13 and c[10] == "1" and es_entero(c[13]) and int(c[13]):
            apunta(en_partida(c[0]), identidad(c[13]), "col13")
    for c in volcar(unico("skill", "change_aura_skill_config"), "m_ChangeAuraSkillDataList"):
        if len(c) == 2 and es_entero(c[1]) and int(c[1]):
            apunta(en_partida(c[0]), identidad(c[1]), "change")
    with open(os.path.join(TABLAS, "CHARA_PARAM_INFO_LIST.tsv"), encoding="utf-8", errors="replace") as fh:
        for l in fh:
            c = l.rstrip("\n").split("\t")
            if not c or not es_entero(c[0]):
                continue
            for i in COLUMNAS_CHARA_PARAM:
                if i < len(c) and es_entero(c[i]):
                    apunta(en_partida(c[i]), identidad(c[0]), "cp%d" % i)

    filas = []
    for (espiritu, ident), fs in fuentes.items():
        filas.append([espiritu, nombres.get(espiritu, ""), esp[espiritu], ident,
                      personajes[ident].get("nombre_es") or "", "+".join(sorted(fs))])
    # Regla de Aaron (O-174): de las hipertecnicas especiales, cinco son de
    # todos los jugadores; el resto ("Modo Reina", "Modo Aphrody"...) de su
    # personaje, y las que no tienen dueno en los datos, de nadie.
    for espiritu in sorted(de_dueno):
        if esp[espiritu] == "especial" and nombres.get(espiritu, "") in PARA_TODOS:
            filas.append([espiritu, nombres.get(espiritu, ""), "especial", "*", "todos", "aaron"])
    filas.sort(key=lambda f: (f[2], f[1], f[4], f[3]))
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# De quien es cada armadura y cada mixi max (NOTAS O-172): solo ese personaje\n"
                 "# (por nombre, en cualquiera de sus versiones) puede llevarlo.\n"
                 "# Lo genera herramientas/construir_duenos_espiritus.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "nombre", "familia", "identidad", "personaje", "fuente"])
        w.writerows(filas)
    con = {f[0] for f in filas}
    sin = sorted((nombres.get(a, ""), a) for a in de_dueno if a not in con)
    print("Escritas %d parejas en %s: %d armaduras/mixi con dueno, %d sin dueno conocido"
          % (len(filas), SALIDA, len(con), len(sin)))
    for n, a in sin:
        print("  sin dueno: %s %s" % (a, n))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
