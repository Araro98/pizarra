#!/usr/bin/env python3
"""Base de datos de TODOS los jugadores del juego, no solo los que tiene Aaron.

    py herramientas\\construir_base_jugadores.py

Escribe `datos/reglas-extraidas/jugadores.csv` con, por cada personaje jugable:
nombre, elemento, posicion, posicion alternativa, arquetipo, rareza, y su arbol
de supertecnicas completo (las nueve ranuras, con el tipo de cada una).

Columnas de `chara_param`, sacadas del codigo del dataminer:

| Col | Que es |
|---|---|
| 0 | identidad del jugador (el campo `0xBA162C11` de la partida) |
| 1 | chara_base_id |
| 2 | elemento | 3 | posicion | 4 | posicion alternativa | 5 | arquetipo |
| 11..28 | el arbol: nueve pares (id de tecnica, nivel) |
| 41 | rareza: 0 normal, 5-7 Hero, 8 Fabled |

Que cuenta como jugable: el dataminer descarta a los que no tienen segundo
camino de tecnicas (columnas 23 a 28 con algun cero), salvo los Hero, que no lo
tienen por diseno. Se hace igual aqui.
"""
import csv
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "jugadores.csv")

ELEMENTOS = {1: "Viento", 2: "Bosque", 3: "Fuego", 4: "Montana"}
POSICIONES = {1: "POR", 2: "DEL", 3: "MED", 4: "DEF"}
ARQUETIPOS = {0: "Brecha", 1: "Contra", 2: "Afinidad", 3: "Tension",
              4: "Juego sucio", 5: "Justicia"}
RAREZAS = {0: "normal", 5: "hero", 6: "hero", 7: "hero", 8: "fabled"}

# Regla de Aaron: la ranura 3 tiene el borde distinto en la pantalla del juego y
# es LIBRE para todos los personajes, aunque venga con una tecnica puesta. Las de
# categoria Aura tambien son libres (ahi van keshin, mixi max y demas).
RANURAS_LIBRES = {3}


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def ent(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


# La categoria fina de la tecnica, que es lo que manda en la ranura.
CATEGORIAS = {"Shot": "Tiro", "Offence": "Regate", "Defence": "Defensa",
              "Goalkeep": "Parada", "Aura": "Hipertecnica"}


def cargar_nombres():
    """{id_partida: (nombre, categoria)}.

    Sale de `tecnicas.csv`, que se genera del propio juego y trae las 1.003
    tecnicas con su categoria sin una sola excepcion. Antes se usaba
    `tlv.nombres()`, que dejaba 441 ranuras sin clasificar porque su tabla de
    categorias venia de un volcado de terceros incompleto.

    Las auras (keshin, mixi max) no estan en `tecnicas.csv`, asi que para esas se
    completa con `nombres-es.csv`.
    """
    import csv as _csv

    def leer(nombre):
        ruta = os.path.join(RAIZ, "datos", "reglas-extraidas", nombre)
        with open(ruta, newline="", encoding="utf-8") as fh:
            return list(_csv.DictReader(
                [l for l in fh if not l.lstrip().startswith("#")]))

    fuera = {}
    for f in leer("nombres-es.csv"):
        cat = f.get("categoria", "")
        fuera[f["id"].upper()] = (f.get("nombre_es") or f.get("nombre_en", ""),
                                  "Hipertecnica" if cat == "aura" else cat)
    for f in leer("tecnicas.csv"):     # encima: es la fuente buena
        fuera[f["id"].upper()] = (f["nombre"], f["categoria"])
    return fuera


def a_partida(valor):
    """Un id del juego, en el orden de bytes en que aparece en la partida."""
    return bytes.fromhex("%08X" % (valor & 0xFFFFFFFF))[::-1].hex().upper()


def main():
    chara = os.path.join(COMUN, "character")
    if not os.path.isdir(chara):
        chara = os.path.join(COMUN, "gamedata", "character")
    param = volcar(unico(chara, "chara_param_"), "CHARA_PARAM_INFO_LIST")
    # nombres de equipo: belong_team_config columna 2 -> NOUN_INFO del idioma
    textos = os.path.join(COMUN, "text", "es", "team_text.cfg.bin")
    noms_equipo = {}
    if os.path.isfile(textos):
        for c in volcar(textos, "NOUN_INFO"):
            i = ent(c[0]) if c else None
            if i is None:
                continue
            for cel in c[1:]:
                if cel.startswith('String("') and len(cel) > 10:
                    noms_equipo.setdefault(i & 0xFFFFFFFF, cel[8:-2])
                    break
    equipos = {}
    bt = unico(os.path.join(COMUN, "gamedata", "character"), "belong_team_config")
    for c in volcar(bt, "m_belongTeamInfoList"):
        i = ent(c[0]) if c else None
        if i is None or len(c) < 3:
            continue
        equipos[i & 0xFFFFFFFF] = noms_equipo.get((ent(c[2]) or 0) & 0xFFFFFFFF, "")

    base = {}
    for c in volcar(unico(chara, "chara_base_"), "CHARA_BASE_INFO_LIST"):
        b = ent(c[0]) if c else None
        if b is not None and len(c) > 16:
            base[b] = (ent(c[2]), ent(c[3]), c[1],
                       equipos.get((ent(c[16]) or 0) & 0xFFFFFFFF, ""))

    nombres = cargar_nombres()
    personajes = os.path.join(RAIZ, "datos", "reglas-extraidas", "personajes.csv")
    nombre_por_ident = {}
    try:
        with open(personajes, newline="", encoding="utf-8") as fh:
            lineas = [l for l in fh if not l.lstrip().startswith("#")]
        for f in csv.DictReader(lineas):
            nombre_por_ident[f["identidad"].upper()] = f.get("nombre_es") or f.get("nombre_en", "")
    except OSError:
        pass

    filas, descartados = [], 0
    for c in param:
        if len(c) < 43:
            continue
        ident, base_id = ent(c[0]), ent(c[1])
        rareza = ent(c[41])
        if ident is None or base_id is None:
            continue
        segundo_camino = [ent(c[i]) for i in range(23, 29)]
        if rareza in (0, 8) and any(v in (None, 0) for v in segundo_camino):
            descartados += 1
            continue  # mismo filtro que usa el dataminer para "jugable"

        indice, name_id, string_id, equipo = base.get(base_id, (None, None, "", ""))
        ident_hex = "%08X" % (ident & 0xFFFFFFFF)
        fila = {
            "identidad": ident_hex,
            "indice": indice,
            "string_id": string_id.replace('String("', "").replace('")', ""),
            "nombre": nombre_por_ident.get(ident_hex, ""),
            "elemento": ELEMENTOS.get(ent(c[2]), "?"),
            "posicion": POSICIONES.get(ent(c[3]), "?"),
            "posicion_alt": POSICIONES.get(ent(c[4]), "?"),
            "arquetipo": ARQUETIPOS.get(ent(c[5]), "?"),
            "rareza": RAREZAS.get(rareza, "?"),
            "equipo": equipo,
        }
        for ranura in range(1, 10):
            col = 11 + (ranura - 1) * 2
            tid, nivel = ent(c[col]), ent(c[col + 1])
            nombre, categoria = ("", "")
            if tid:
                nombre, categoria = nombres.get(a_partida(tid), ("", ""))
            libre = ranura in RANURAS_LIBRES or categoria == "Hipertecnica"
            fila["r%d_tecnica" % ranura] = nombre
            fila["r%d_tipo" % ranura] = "LIBRE" if libre else (categoria or "?")
            fila["r%d_nivel" % ranura] = nivel if tid else ""
        filas.append(fila)

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    campos = list(filas[0].keys()) if filas else []
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Todos los personajes jugables del juego, con su arbol de tecnicas.\n"
                 "# Lo genera herramientas/construir_base_jugadores.py.\n"
                 "# rN_tipo: que admite esa ranura. LIBRE = cualquier tecnica o hipertecnica.\n")
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(filas)
    print("Escritos %d jugables en %s  (%d descartados por no tener segundo camino)"
          % (len(filas), SALIDA, descartados))
    import collections
    print("por rareza:", dict(collections.Counter(f["rareza"] for f in filas)))
    print("por posicion:", dict(collections.Counter(f["posicion"] for f in filas)))
    print("con nombre:", sum(1 for f in filas if f["nombre"]))
    print("con equipo:", sum(1 for f in filas if f["equipo"]),
          " equipos distintos:", len({f["equipo"] for f in filas if f["equipo"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
