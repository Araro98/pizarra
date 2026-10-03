#!/usr/bin/env python3
"""Todos los equipos del juego, con su plantilla, para autorrellenar un equipo.

    py herramientas\\construir_equipos_juego.py

Escribe dos tablas en `datos/reglas-extraidas/`:

- `equipos-juego.csv`: un equipo por fila (id, clave, nombre, grupo, era,
  variante, niveles, formacion, escudo, equipacion, tacticas, capitan...).
- `equipos-juego-miembros.csv`: un miembro por fila (equipo, puesto, identidad,
  dorsal, capitan, rol...).

Solo salen los equipos con nombre y con al menos 11 jugadores (sin contar
entrenador ni gerentes). Al terminar dice cuantos hay de cada grupo y cuantos
se quedan fuera.

De donde sale
=============

`team/team_config` -> `SOCCER_TEAM_INFO_LIST` (765 equipos). Cada equipo es
una fila y cuatro pares (inicio, cuantos) detras:

| col | que es |
|---|---|
| 0 | id del equipo = crc32 de la clave (comprobado: `tm_st_game_0101a`) |
| 1 | clave interna (`tm_st_game_0101a`, `tm_cro_ie2_0100`...) |
| 2 | ? (0 en todos los de la Cronica; no es texto de team_text) |
| 3 | nombre: id de `NOUN_INFO` de `text/<idioma>/team_text` |
| 4 | formacion: el `valor_equipo` de `equipo-objetos.csv` (= formId de formation_config) |
| 5 | equipacion: casi siempre el `valor_equipo`; en unos pocos (demos, equipo inicial) es el id del objeto con los bytes al reves |
| 6 | escudo: el `valor_equipo` (que en los escudos es el propio id del objeto) |
| 7 | ? (solo 10 equipos de demo lo tienen) |
| 8 | ? un numero de nivel/fuerza (1, 10, 40...); no es el nivel del partido |
| par 1 | sus miembros en `SOCCER_TEAM_MEMBER_LIST` |
| par 2 | sus tacticas en `SOCCER_TEAM_TACTICS_LIST` (valor_equipo de la tactica) |
| par 3 | supertecnicas de equipo en `SOCCER_TEAM_SKILL_LIST` (no se usan aqui) |
| par 4 | `SOCCER_TEAM_METAMORPHOSE_MEMBER_LIST` (dos equipos) |

`SOCCER_TEAM_MEMBER_LIST` (11.156 miembros, cada uno con un par detras):

| col | que es |
|---|---|
| 0 | identidad del personaje (como en personajes.csv / jugadores.csv) |
| 1 | id del miembro (unico) |
| 2 | clave de sus tecnicas en `TEAM_MEMBER_SKILL_CONFIG_INFO_LIST` (0 = las suyas) |
| 3 | botas (id de `ITEM_SHOES_INFO_LIST`) |
| 4-6 | ? otros tres ids (no son objetos de item_config) |
| 7 | titulo/emblema de jugador (`ITEM_TITLE_INFO_LIST`) |
| 8 | **puesto**: 0-10 en el campo, en el orden de los puestos de la formacion (el `positionNo` de formation_config, igual que `puesto` en formaciones.csv); 11-15 banquillo; 16-18 gerentes; 19 entrenador; 20+ mas suplentes. Igual que en la partida |
| 10 | dorsal (0 en entrenador y gerentes) |
| 11 | 1 = capitan |
| 12 | ? un entero pequeno (-6..30), a lo mejor un ajuste de nivel |
| 13 | ? de -1 a 4, a lo mejor un rango |
| 14-19 | ? seis valores (-1 o 1-4) |
| 20-27 | ocho multiplicadores (1 en lo normal; 6-10 en los equipos de nivel 99) |

`soccer/soccer_game_config` -> `SOCCER_GAME_INFO_LIST` (cada partido, p. ej.
`fbtl_cro02_010_010`) apunta a filas de `SOCCER_GAME_DIFFICULTY_LIST`:
(dificultad, equipo rival, **nivel del rival**, ..., col 5 equipo del jugador,
col 6 su nivel). De ahi salen los niveles de cada equipo. En la Cronica cada
partido tiene diez filas: la 1 es la primera vez (con el equipo `pltm_` del
jugador), 2-4 y 6-9 son las revanchas, la 10 es el rival de **nivel 99** (un
equipo aparte, con clave acabada en `20`: `tm_cro_ie2_0120`) y la 11 el de
leyenda.

Eras de la Cronica: el numero de `fbtl_croNN_` es la saga (`saga_num` de
personajes.csv): 01 IE1, 02 IE2, 03 IE3, 04 GO, 05 GO Chrono Stone, 06 GO
Galaxy, 07 Ares, 08 Orion, 09 Victory Road; 12 son los equipos originales.

Para los nombres de personajes se usa personajes.csv; para los de objetos,
equipo-objetos.csv; los marcadores `<MNT:...>` se traducen con
`ievr.opciones.sin_marcadores`.
"""
import csv
import os
import re
import struct
import subprocess
import sys
import zlib
from collections import Counter, defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
import rdbn  # noqa: E402

COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
GAMEDATA = os.path.join(COMUN, "gamedata")
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
REGLAS = os.path.join(RAIZ, "datos", "reglas-extraidas")
SALIDA = os.path.join(REGLAS, "equipos-juego.csv")
SALIDA_MIEMBROS = os.path.join(REGLAS, "equipos-juego-miembros.csv")

ERAS = {1: "Inazuma Eleven", 2: "Inazuma Eleven 2", 3: "Inazuma Eleven 3",
        4: "Inazuma Eleven GO", 5: "Inazuma Eleven GO Chrono Stone",
        6: "Inazuma Eleven GO Galaxy", 7: "Inazuma Eleven Ares",
        8: "Inazuma Eleven Orion", 9: "Inazuma Eleven Victory Road",
        12: "Originales de la Cronica"}
# la era por la clave del equipo (los pltm_cro_ieN van numerados por saga)
ERA_CLAVE = {"ie1": 1, "ie2": 2, "ie3": 3, "go1": 4, "go2": 5, "go3": 6,
             "ares": 7, "orion": 8, "victory": 9, "original": 12}
POSICION = {1: "POR", 2: "DF", 3: "DF", 4: "MC", 5: "MC", 6: "MC", 7: "MC", 8: "DC", 9: "DC", 10: "DC"}
SIN_TECNICA = -73827712   # hueco vacio en TEAM_MEMBER_SKILL_CONFIG_INFO_LIST


# --- utilidades -----------------------------------------------------------------

def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return [l.split("\t") for l in r.stdout.splitlines()[1:]]


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def hexa(x):
    """El valor tal cual, en hex (como `valor_equipo` e `identidad`)."""
    v = u32(x)
    return "%08X" % v if v else ""


def al_reves(x):
    """Los cuatro bytes como estan en la partida (como `id_objeto`)."""
    v = u32(x)
    return struct.pack("<I", v).hex().upper() if v else ""


def tabla_csv(nombre):
    ruta = os.path.join(REGLAS, nombre)
    if not os.path.isfile(ruta):
        return []
    with open(ruta, encoding="utf-8") as fh:
        return list(csv.DictReader(l for l in fh if not l.startswith("#")))


def textos(idioma):
    """{name_id: texto} de team_text."""
    fuera = {}
    for fila in volcar(os.path.join(COMUN, "text", idioma, "team_text.cfg.bin"), "NOUN_INFO"):
        ident = u32(fila[0]) if fila else None
        if ident is None:
            continue
        for celda in fila[1:]:
            if celda.startswith('String("') and len(celda) > 10:
                fuera.setdefault(ident, celda[8:-2].replace('\\"', '"'))
                break
    return fuera


def limpia(texto):
    if not texto:
        return ""
    try:
        from ievr import opciones
        return opciones.sin_marcadores(texto)
    except Exception:  # sin el modulo se deja el marcador tal cual
        return texto


# --- lectura de las tablas del juego ---------------------------------------------

def leer_equipos(fichero):
    """[(fila, [pares])]: la fila del equipo y sus cuatro pares (inicio, cuantos).

    Detras del ultimo equipo va un indice de una columna: se ignora."""
    equipos, actual = [], None
    for l in volcar(fichero, "SOCCER_TEAM_INFO_LIST"):
        if len(l) > 3 and l[1].startswith('String("'):
            actual = [l, []]
            equipos.append(actual)
        elif actual is not None and len(l) == 2 and len(actual[1]) < 4:
            actual[1].append((int(l[0]), int(l[1])))
    return equipos


def leer_miembros(fichero):
    return [l for l in volcar(fichero, "SOCCER_TEAM_MEMBER_LIST") if len(l) >= 28]


def leer_lista(fichero, tabla):
    return [l[0] for l in volcar(fichero, tabla) if len(l) == 1 and l[0]]


def leer_tecnicas(fichero):
    """{clave: [ids de tecnica con los bytes al reves]}."""
    fuera = {}
    for l in volcar(fichero, "TEAM_MEMBER_SKILL_CONFIG_INFO_LIST"):
        if len(l) < 7:
            continue
        fuera[u32(l[0])] = [al_reves(x) for x in l[1:7] if u32(x) and int(x) != SIN_TECNICA]
    return fuera


def leer_niveles():
    """{id equipo: {"rival": [(partido, dificultad, nivel)], "jugador": [...]}}."""
    fich = unico(os.path.join(GAMEDATA, "soccer"), "soccer_game_config_")
    partidos, actual = [], None
    for l in volcar(fich, "SOCCER_GAME_INFO_LIST"):
        if len(l) > 3 and l[1].startswith('String("'):
            actual = [l[1][8:-2], None]
            partidos.append(actual)
        elif actual is not None and actual[1] is None and len(l) == 2:
            actual[1] = (int(l[0]), int(l[1]))
    dif = [l for l in volcar(fich, "SOCCER_GAME_DIFFICULTY_LIST") if len(l) > 10]
    fuera = defaultdict(lambda: {"rival": [], "jugador": []})
    for clave, par in partidos:
        if not par:
            continue
        ini, n = par
        for d in dif[ini:ini + n]:
            if u32(d[1]):
                fuera[u32(d[1])]["rival"].append((clave, int(d[0]), int(d[2])))
            if u32(d[5]):
                fuera[u32(d[5])]["jugador"].append((clave, int(d[0]), int(d[6])))
    return fuera


def leer_formaciones():
    """{formId: {puesto: (positionId, POR/DF/MC/DC)}} de formation_config."""
    fo = rdbn.leer(unico(os.path.join(GAMEDATA, "formation"), "formation_config_"))
    plac = fo["m_SoccerFormPlacementInfoList"]["filas"]
    fuera = {}
    for f in fo["m_SoccerFormationInfoList"]["filas"]:
        ini, n = f[1]
        fuera[f[0] & 0xFFFFFFFF] = {p[10]: (p[11], POSICION.get(p[11], "?")) for p in plac[ini:ini + n]}
    return fuera


# --- clasificacion ----------------------------------------------------------------

def clasifica(clave, niveles):
    """(grupo, era, variante)."""
    m = re.match(r"tm_cro_legend_([A-Za-z]+)(\d?)_", clave)
    if m:
        base = m.group(1).lower() + m.group(2)
        return "cronica-leyenda", ERA_CLAVE.get(base, ""), "leyenda"
    m = re.match(r"pltm_cro_ie(\d+)_", clave)
    if m:
        return "cronica-jugador", int(m.group(1)), "jugador"
    m = re.match(r"tm_cro_([a-z]+\d?)_(\d+)", clave)
    if m:
        era = ERA_CLAVE.get(m.group(1), "")
        lv = {n for _, _, n in niveles.get("rival", [])}
        # las de clave acabada en 20 son el rival de nivel 99; unas pocas no
        # salen en ningun partido, pero se llaman igual que las demas
        if lv == {99} or (not lv and m.group(2).endswith("20")):
            variante = "nivel99"
        else:
            variante = "normal" if m.group(2).endswith("00") else "variante"
        return "cronica", era, variante
    if clave.startswith("tm_st_game_"):
        return "historia", 9, "partido"
    if clave.startswith("tm_st_scbattle_"):
        return "historia", 9, "minipartido"
    if clave.startswith("tm_prc_"):
        return "practica", 9, ""
    if clave.startswith("bb_"):
        return "enjoy", "", ""
    if clave.startswith(("trial_", "tgs")):
        return "demo", "", ""
    return "otros", "", ""


def rol(puesto):
    if puesto == 0:
        return "portero"
    if puesto <= 10:
        return "campo"
    if puesto <= 15:
        return "banquillo"
    if puesto <= 18:
        return "gerente"
    if puesto == 19:
        return "entrenador"
    return "reserva"


def rango_niveles(lista):
    if not lista:
        return "", ""
    v = [n for _, _, n in lista]
    return min(v), max(v)


def sugerir_formacion(forma, formas, legales):
    """La formacion que se puede llevar mas parecida a una que no se puede.

    exacta: mismo tipo de puesto (positionId) en los 11 puestos;
    posiciones: misma POR/DF/MC/DC en cada puesto;
    lineas: mismas cuentas de DF/MC/DC (los puestos pueden ir en otro orden)."""
    if not forma:
        return "", ""
    for modo, clave in (("exacta", lambda f: tuple(f[p][0] for p in sorted(f))),
                        ("posiciones", lambda f: tuple(f[p][1] for p in sorted(f))),
                        ("lineas", lambda f: tuple(sorted(Counter(x[1] for x in f.values()).items())))):
        for valor, obj in legales:
            if valor in formas and clave(formas[valor]) == clave(forma):
                return obj, modo
    return "", ""


# --- main --------------------------------------------------------------------------

def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    team = unico(os.path.join(GAMEDATA, "team"), "team_config_")
    equipos = leer_equipos(team)
    miembros = leer_miembros(team)
    tacticas = leer_lista(team, "SOCCER_TEAM_TACTICS_LIST")
    tecnicas = leer_tecnicas(team)
    niveles = leer_niveles()
    formas = leer_formaciones()
    es, en = textos("es"), textos("en")

    personajes = {f["identidad"].upper(): f for f in tabla_csv("personajes.csv")}
    jugables = {f["identidad"].upper(): f for f in tabla_csv("jugadores.csv")}
    objetos = defaultdict(dict)      # tipo -> valor_equipo -> fila
    por_objeto = defaultdict(dict)   # tipo -> id_objeto -> fila
    for f in tabla_csv("equipo-objetos.csv"):
        objetos[f["tipo"]][f["valor_equipo"].upper()] = f
        por_objeto[f["tipo"]][f["id_objeto"].upper()] = f
    legales = sorted({(f["id"].upper(), f["nombre"]) for f in tabla_csv("formaciones.csv")
                      if f.get("legal") == "1"})
    legal_valor = []  # (formId, id_objeto) de las formaciones que se pueden llevar
    for obj, _ in legales:
        f = por_objeto["formacion"].get(obj)
        if f:
            legal_valor.append((u32(int(f["valor_equipo"], 16)), obj))

    def pieza(tipo, crudo):
        """(valor_equipo, id_objeto, nombre) de un escudo/equipacion/formacion."""
        v = hexa(crudo)
        if not v:
            return "", "", ""
        f = objetos[tipo].get(v)
        if f:
            return v, f["id_objeto"], f["nombre"]
        f = por_objeto[tipo].get(al_reves(crudo))  # algunos guardan el id del objeto
        if f:
            return f["valor_equipo"], f["id_objeto"], f["nombre"]
        return v, "", ""

    filas, filas_m = [], []
    cuenta = defaultdict(Counter)
    for t, pares in equipos:
        ident = u32(t[0])
        clave = t[1][8:-2]
        if zlib.crc32(clave.encode()) != ident:
            print("aviso: el id de %s no es el crc32 de su clave" % clave, file=sys.stderr)
        nv = niveles.get(ident, {})
        grupo, era, variante = clasifica(clave, nv)
        # la era manda la del partido (fbtl_croNN_...) si sale en alguno: los de
        # leyenda ORIGINAL se juegan en la 09
        eras_p = {int(m.group(1)) for p, _, _ in nv.get("rival", []) + nv.get("jugador", [])
                  for m in [re.match(r"fbtl_cro(\d+)_", p)] if m}
        if grupo.startswith("cronica") and len(eras_p) == 1:
            era = eras_p.pop()
        nombre = limpia(es.get(u32(t[3]), ""))
        nombre_en = limpia(en.get(u32(t[3]), ""))
        (ini, n) = pares[0] if pares else (0, 0)
        mios = miembros[ini:ini + n]
        juegan = [m for m in mios if not 16 <= int(m[8]) <= 19]
        campo = {int(m[8]) for m in mios if int(m[8]) <= 10}
        cuenta[grupo]["total"] += 1
        if not nombre:
            cuenta[grupo]["sin nombre"] += 1
            continue
        if len(juegan) < 11 or len(campo) < 11:
            cuenta[grupo]["menos de 11"] += 1
            continue
        cuenta[grupo]["incluidos"] += 1

        form_valor = u32(t[4])
        form = formas.get(form_valor, {})
        fv, fobj, fnom = pieza("formacion", t[4])
        if fobj and any(o == fobj for o, _ in legales):
            sug, modo = fobj, "es legal"
        else:
            sug, modo = sugerir_formacion(form, formas, legal_valor)
        ev, eobj, enom = pieza("equipacion", t[5])
        sv, sobj, snom = pieza("escudo", t[6])
        tini, tn = pares[1] if len(pares) > 1 else (0, 0)
        tacs = [pieza("tactica", x) for x in tacticas[tini:tini + tn]]
        capitan = next((hexa(m[0]) for m in mios if m[11] == "1"), "")
        entrenador = next((hexa(m[0]) for m in mios if int(m[8]) == 19), "")
        rival, jugador = rango_niveles(nv.get("rival")), rango_niveles(nv.get("jugador"))
        nmin = min([x for x in (rival[0], jugador[0]) if x != ""], default="")
        nmax = max([x for x in (rival[1], jugador[1]) if x != ""], default="")
        creables = sum(1 for m in mios if hexa(m[0]) in jugables)
        era_txt = ERAS.get(era, "") if era != "" else ""
        etiqueta = nombre
        if grupo.startswith("cronica"):
            etiqueta += " (Cronica %s%s)" % (era_txt or "?", "" if variante in ("normal", "") else ", " + variante)
        elif grupo != "historia":
            etiqueta += " (%s)" % grupo
        partidos = sorted({p for p, _, _ in nv.get("rival", []) + nv.get("jugador", [])})
        filas.append([
            "%08X" % ident, clave, nombre, nombre_en, grupo, era, era_txt, variante, etiqueta,
            nmin, nmax, t[8], partidos[0] if partidos else "",
            fv, fobj, fnom, sug, modo,
            sv, sobj, snom,
            ev, eobj, enom, hexa(t[5]),
            "|".join(x[0] for x in tacs), "|".join(x[1] for x in tacs), "|".join(x[2] for x in tacs),
            capitan, entrenador, len(mios), len(juegan), creables])

        for orden, m in enumerate(mios):
            p = int(m[8])
            idn = hexa(m[0])
            per = personajes.get(idn, {})
            jug = jugables.get(idn, {})
            mult = m[20][6:-1] if m[20].startswith("Float(") else m[20]
            filas_m.append([
                "%08X" % ident, clave, orden, p, rol(p),
                form.get(p, ("", ""))[1] if p <= 10 else "",
                idn, per.get("nombre_es", ""), m[10], 1 if m[11] == "1" else 0,
                1 if jug else 0, jug.get("posicion", ""), jug.get("rareza", ""),
                m[12], m[13], mult,
                al_reves(m[3]), al_reves(m[7]),
                "|".join(tecnicas.get(u32(m[2]), [])) if u32(m[2]) else ""])

    os.makedirs(REGLAS, exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Equipos del juego (team_config), para autorrellenar un equipo.\n"
                 "# formacion/escudo/equipacion/tacticas = valor_equipo de equipo-objetos.csv (lo que guarda el equipo);\n"
                 "# *_objeto = id_objeto (el de la mochila; formacion_objeto = id de formaciones.csv). Vacio si no es un objeto.\n"
                 "# formacion_legal: la que se puede llevar mas parecida (modo: es legal, exacta, posiciones, lineas).\n"
                 "# nivel_min/max: niveles con los que sale en los partidos (soccer_game_config). nivel_base: col 8, sin confirmar.\n"
                 "# Lo genera herramientas/construir_equipos_juego.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "clave", "nombre", "nombre_en", "grupo", "era", "era_nombre", "variante",
                    "etiqueta", "nivel_min", "nivel_max", "nivel_base", "partido",
                    "formacion", "formacion_objeto", "formacion_nombre", "formacion_legal",
                    "formacion_legal_modo", "escudo", "escudo_objeto", "escudo_nombre",
                    "equipacion", "equipacion_objeto", "equipacion_nombre", "equipacion_crudo",
                    "tacticas", "tacticas_objeto", "tacticas_nombre",
                    "capitan", "entrenador", "miembros", "jugadores", "creables"])
        w.writerows(filas)
    with open(SALIDA_MIEMBROS, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Plantillas de los equipos de equipos-juego.csv, una fila por miembro.\n"
                 "# puesto: 0-10 campo (puesto de formaciones.csv), 11-15 banquillo, 16-18 gerentes, 19 entrenador, 20+ reserva.\n"
                 "# creable: 1 si la identidad esta en jugadores.csv. nivel_rel, rango: columnas 12 y 13, sin confirmar.\n"
                 "# botas, titulo: id_objeto (bytes al reves). tecnicas: supertecnicas propias del equipo (id de nombres-es).\n"
                 "# Lo genera herramientas/construir_equipos_juego.py.\n")
        w = csv.writer(fh)
        w.writerow(["equipo", "clave", "orden", "puesto", "rol", "posicion_formacion", "identidad", "nombre",
                    "dorsal", "capitan", "creable", "posicion_jugador", "rareza",
                    "nivel_rel", "rango", "multiplicador", "botas", "titulo", "tecnicas"])
        w.writerows(filas_m)

    print("Equipos en team_config: %d" % len(equipos))
    for g in sorted(cuenta):
        c = cuenta[g]
        print("   %-16s %4d en total, %4d incluidos, %3d sin nombre, %3d con menos de 11"
              % (g, c["total"], c["incluidos"], c["sin nombre"], c["menos de 11"]))
    print("Escritos %d equipos en %s" % (len(filas), SALIDA))
    print("Escritos %d miembros en %s" % (len(filas_m), SALIDA_MIEMBROS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
