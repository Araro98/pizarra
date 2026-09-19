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

- `aura_skill_config` / `AURA_CMD_INFO_LIST`, columna 13: la identidad del
  MODELO transformado (el personaje con la armadura puesta o ya mixi-maxeado;
  son filas de chara_param sin arbol, no fichables). La fila de chara_base de
  ese modelo lleva en la columna 9 el chara_base del personaje original, y
  todas las identidades de ese chara_base (normal, Idolos, Diamante) son sus
  usuarios (`modelo`, NOTAS O-209). Cuadra con lo que ensena la tienda del
  juego en "Usuarios" (Aaron: el mixi con Shawn lo usa Axel, el de Raika Cade,
  el de Cao Cao Zanark...).
- `change_aura_skill_config` / `m_ChangeAuraSkillDataList`: pares (espiritu,
  identidad) de quien puede cambiar a esa armadura o mixi (`change`; 0 = nadie
  apuntado).
- `chara_param`: las columnas 11, 15, 19, 21 y 27 llevan la armadura, el mixi
  o el modo propio de algunas versiones del personaje (`cpN`). Los modos
  (Aphrody, Atacante...) solo salen de aqui: el Modo Atacante es de UNA
  version de Shawn Froste, la de defensa con bufanda.
- Dos mixi sin nada de lo anterior heredan los usuarios de otro del mismo
  personaje (`aaron`, comprobado en su partida): Cao Cao los de Zeta (Zanark)
  y Tiranosaurio los de Big (Fei Rune).

El editor compara por IDENTIDAD exacta (O-209): otras versiones del mismo
nombre no valen, porque el modelo cambia y el juego no lo deja.
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

    # el modelo transformado (col 13) -> su chara_base -> col 9 = el chara_base
    # del personaje original -> todas sus identidades (O-209)
    por_base = {}
    for ident, f in personajes.items():
        if f.get("chara_base_id"):
            por_base.setdefault(int(f["chara_base_id"]), set()).add(ident)
    original = {}
    for c in volcar(unico("character", "chara_base_"), "CHARA_BASE_INFO_LIST"):
        if len(c) > 9 and es_entero(c[0]) and es_entero(c[9]) and int(c[9]):
            original[int(c[0])] = int(c[9])
    for c in volcar(unico("skill", "aura_skill_config"), "AURA_CMD_INFO_LIST"):
        if len(c) > 13 and es_entero(c[13]) and int(c[13]):
            modelo = personajes.get(identidad(c[13]))
            base = original.get(int(modelo["chara_base_id"])) if modelo and modelo.get("chara_base_id") else None
            for ident in por_base.get(base, ()):
                apunta(en_partida(c[0]), ident, "modelo")
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

    # los dos mixi sin nada en los datos heredan los usuarios de otro mixi del
    # mismo personaje (Aaron; su partida lleva Cao Cao en un Zanark Idolo y
    # Tiranosaurio en un Fei Rune Idolo puestos por el juego)
    # (la copia de historia del mixi de Raika toma los de la normal, que son
    # los Cade Shelby)
    HEREDA = {"Miximax Trans: Cao Cao": "Miximax Trans: Zeta",
              "Miximax Trans: Tiranosaurio": "Miximax Trans: Big",
              "Miximax Trans: Raika": "Miximax Trans: Raika"}
    for hijo, padre in HEREDA.items():
        ids_hijo = [a for a in de_dueno if nombres.get(a) == hijo]
        ids_padre = [a for a in de_dueno if nombres.get(a) == padre]
        for a in ids_hijo:
            for (b, ident) in list(fuentes):
                if b in ids_padre and b != a:
                    apunta(a, ident, "aaron")

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
        fh.write("# De quien es cada armadura, mixi max y modo (NOTAS O-172, O-209): solo esas\n"
                 "# identidades exactas pueden llevarlo (otras versiones del mismo nombre, no).\n"
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
