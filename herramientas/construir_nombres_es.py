#!/usr/bin/env python3
"""Construye la tabla de nombres en espanol a partir de los ficheros del juego.

    py herramientas\\construir_nombres_es.py

Escribe `datos/reglas-extraidas/nombres-es.csv`. Sustituye a `names.csv`, que
venia de volcados de terceros y estaba en ingles.

Como se enlaza: cada fichero de configuracion tiene una tabla con
`(id, ..., name_id, ...)`, y el `name_id` se busca en la tabla `NOUN_INFO` del
fichero de textos del idioma. El identificador se guarda **con los bytes al
reves** respecto a como lo tiene el juego, que es como aparece en la partida.

El dataminer tambien hace esto, pero su parte de habilidades se cae con un error
interno, asi que aqui se hace por nuestra cuenta.
"""
import csv
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "nombres-es.csv")

# (categoria, fichero de config, tabla, columna del id, columna del name_id)
FUENTES = [
    ("supertecnica", "gamedata/skill", "skill_config_", "m_skillInfoList", 0, 6),
    ("aura", "gamedata/skill", "aura_skill_config_", "AURA_CMD_INFO_LIST", 0, 2),
    ("pasiva", "gamedata/skill", "passive_skill_config_", "PASSIVE_SKILL_INFO_LIST", 0, 1),
    ("tactica", "gamedata/skill", "special_tactics_config_", "SPECIAL_TACTICS_INFO_LIST", 0, 2),
    # Objetos. El juego los tiene separados por tipo, y cada tipo es una ranura
    # de equipacion: comprobado con los tres objetos que lleva Joseph King.
    ("equipo-1-botas", "gamedata/item", "item_config_", "ITEM_SHOES_INFO_LIST", 0, 2),
    ("equipo-2-brazalete", "gamedata/item", "item_config_", "ITEM_MISANGA_INFO_LIST", 0, 2),
    ("equipo-3-colgante", "gamedata/item", "item_config_", "ITEM_ACCESSORY_INFO_LIST", 0, 2),
    ("equipo-4-especial", "gamedata/item", "item_config_", "ITEM_SPECIAL_INFO_LIST", 0, 2),
    ("consumible", "gamedata/item", "item_config_", "ITEM_CONSUME_INFO_LIST", 0, 2),
    # Escudos de equipo. Estaban en la mochila desde siempre, pero sin esta
    # linea el editor no sabia como se llamaban ni de que categoria eran, asi
    # que salian como huecos sin nombre (NOTAS O-121).
    ("escudo", "gamedata/item", "item_config_", "ITEM_EMBLEM_INFO_LIST", 0, 2),
    ("emblema-jugador", "gamedata/item", "item_config_", "ITEM_TITLE_INFO_LIST", 0, 2),
    ("formacion", "gamedata/item", "item_config_", "ITEM_FORMATION_INFO_LIST", 0, 2),
    # Equipaciones y tacticas. Estaban en la mochila igual que los escudos: 65
    # equipaciones y 61 tacticas tiene Aaron. El nombre esta en la columna 0,
    # que es el propio id (NOTAS O-124).
    ("equipacion-equipo", "gamedata/item", "item_config_", "ITEM_FASHION_INFO_LIST", 0, 2),
    ("tactica-objeto", "gamedata/item", "item_config_", "ITEM_SPECIAL_TACTICS_INFO_LIST", 0, 2),
    ("supertactica", "gamedata/item", "item_config_", "ITEM_SUPER_TACTICS_INFO_LIST", 0, 2),
    ("kizuna", "gamedata/item", "item_config_", "ITEM_KIZUNA_LINK_INFO_LIST", 0, 2),
    ("placa", "gamedata/item", "item_config_", "ITEM_NAME_PLATE_INFO_LIST", 0, 2),
    ("material", "gamedata/item", "item_config_", "ITEM_CRAFT_OBJ_INFO_LIST", 0, 2),
]
# Ficheros de texto donde buscar los nombres. Se miran todos.
TEXTOS = ["skill_text.cfg.bin", "soccer_team_passive_text.cfg.bin",
          "item_text.cfg.bin", "team_text.cfg.bin", "menu_text.cfg.bin"]


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return []
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    return None


def texto_de(celda):
    """Saca el texto de una celda con pinta de String("...")."""
    if celda.startswith('String("') and celda.endswith('")'):
        return celda[8:-2]
    return ""


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cargar_nombres(idioma):
    """{name_id: texto} juntando todos los ficheros de texto del idioma."""
    fuera = {}
    carpeta = os.path.join(COMUN, "text", idioma)
    if not os.path.isdir(carpeta):
        return fuera
    for f in TEXTOS:
        ruta = os.path.join(carpeta, f)
        if not os.path.isfile(ruta):
            continue
        for fila in volcar(ruta, "NOUN_INFO"):
            ident = u32(fila[0]) if fila else None
            if ident is None:
                continue
            for celda in fila[1:]:
                t = texto_de(celda)
                if t:
                    fuera.setdefault(ident, t)
                    break
    return fuera


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    es = cargar_nombres("es")
    en = cargar_nombres("en")
    print("nombres cargados: %d en espanol, %d en ingles" % (len(es), len(en)))

    filas, sin_nombre = [], 0
    for categoria, subdir, prefijo, tabla, col_id, col_nombre in FUENTES:
        carpeta = os.path.join(COMUN, subdir)
        fichero = unico(carpeta, prefijo)
        if not fichero:
            print("aviso: no encuentro %s* en %s" % (prefijo, carpeta), file=sys.stderr)
            continue
        n = 0
        for c in volcar(fichero, tabla):
            if len(c) <= max(col_id, col_nombre):
                continue
            ident, nid = u32(c[col_id]), u32(c[col_nombre])
            if ident is None or nid is None:
                continue
            nombre_es, nombre_en = es.get(nid, ""), en.get(nid, "")
            if not nombre_es and not nombre_en:
                sin_nombre += 1
                continue
            # El identificador, con los bytes al reves: asi aparece en la partida.
            en_partida = bytes.fromhex("%08X" % ident)[::-1].hex().upper()
            filas.append([en_partida, categoria, nombre_es, nombre_en])
            n += 1
        print("   %-14s %d" % (categoria, n))

    vistos, unicas = set(), []
    for f in filas:
        if f[0] not in vistos:
            vistos.add(f[0])
            unicas.append(f)

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Nombres sacados de los ficheros del propio juego.\n"
                 "# id = los 4 bytes tal y como aparecen en la partida.\n"
                 "# Lo genera herramientas/construir_nombres_es.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "categoria", "nombre_es", "nombre_en"])
        w.writerows(unicas)
    print("Escritas %d entradas en %s  (%d sin nombre en ningun idioma)"
          % (len(unicas), SALIDA, sin_nombre))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
