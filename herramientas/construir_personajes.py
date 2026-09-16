#!/usr/bin/env python3
"""Construye la tabla de personajes a partir de los ficheros del juego.

    py herramientas\\construir_personajes.py

Escribe `datos/reglas-extraidas/personajes.csv`, que es lo que permite ponerle
nombre a un jugador de la partida.

La cadena, que costo encontrar:

    partida, campo 0xBA162C11  (identidad del jugador)
      -> chara_param, columna 0        (misma cosa)
      -> chara_param, columna 1        = chara_base_id
      -> chara_base,  columna 0        (misma cosa)
      -> chara_base,  columna 3        = name_id
      -> text/<idioma>.sqlite          = el nombre

De chara_param sale ademas la columna 41, que es la rareza: 0 normal, 5 a 7 Hero,
8 Fabled. Eso es lo que permite al editor no tocar a los Hero ni a los Fabled,
que tienen sus propias reglas.
"""
import csv
import os
import re
import sqlite3
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
JUEGO = os.path.join(RAIZ, "datos", "juego")
GAMEDATA = os.path.join(JUEGO, "extracted", "data", "common", "gamedata")
TABLAS = os.path.join(JUEGO, "tablas")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "personajes.csv")

RAREZAS = {0: "normal", 5: "hero", 6: "hero", 7: "hero", 8: "fabled"}


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    os.makedirs(TABLAS, exist_ok=True)
    destino = os.path.join(TABLAS, tabla + ".tsv")
    with open(destino, "w", encoding="utf-8", newline="") as fh:
        r = subprocess.run([VOLCADO, fichero, tabla], stdout=fh, text=True)
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return destino


def filas(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as fh:
        for linea in fh:
            yield linea.rstrip("\n").split("\t")


def entero(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def nombres_del_juego(lengua):
    """{clave: nombre} leyendo `chara_text.cfg.bin` del idioma que se pida."""
    ruta = os.path.join(JUEGO, "extracted", "data", "common", "text", lengua,
                        "chara_text.cfg.bin")
    if not os.path.isfile(ruta):
        return {}
    r = subprocess.run([VOLCADO, ruta, "NOUN_INFO"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    fuera = {}
    for l in r.stdout.splitlines():
        c = l.split("\t")
        clave = entero(c[0]) if c else None
        # la variante 0 es el nombre completo; las 11 y 12 son apellido y nombre
        if clave is None or len(c) < 3 or c[1].strip() != "0":
            continue
        for celda in c[2:]:
            m = re.match(r'^String\("(.*)"\)$', celda.strip(), re.S)
            if m and m.group(1):
                fuera.setdefault(clave, m.group(1))
                break
    return fuera


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador. Compilalo con: cargo build --release "
                         "dentro de referencia/volcado")
    chara = os.path.join(GAMEDATA, "character")
    p_param = volcar(unico(chara, "chara_param_"), "CHARA_PARAM_INFO_LIST")
    p_base = volcar(unico(chara, "chara_base_"), "CHARA_BASE_INFO_LIST")

    # chara_param: 0 = identidad, 1 = chara_base_id, 41 = rareza,
    # 37 = aptitud de entrenador de fabrica, 38 = aptitud de gerente de fabrica.
    # Las dos ultimas salieron de cruzar los 176 miembros de los equipos de
    # Aaron con la medalla que llevan puesta (NOTAS O-132): las 110 personas con
    # la 37 son los entrenadores clasicos de la serie (Ray Dark, Seymour
    # Hillman, Mr. D) y las 49 con la 38 las gerentes (Celia Hills, Nelly
    # Raimon, Camellia Travis).
    param = {}
    for c in filas(p_param):
        if len(c) < 42:
            continue
        ident, base_id, rareza = entero(c[0]), entero(c[1]), entero(c[41])
        if ident is None or base_id is None:
            continue
        apt_e = c[37].strip() == "1" if len(c) > 37 else False
        apt_g = c[38].strip() == "1" if len(c) > 38 else False
        # Columna 5: el arquetipo de fabrica, con los mismos numeros que la
        # partida (0 Brecha ... 5 Justicia). En los 61 Idolos de la partida de
        # Aaron coincide siempre con el que llevan (NOTAS O-161); en los
        # normales se sortea y este es solo el de la ficha.
        arquetipo = entero(c[5]) if len(c) > 5 else None
        # Columna 6: la clave (1-14) del juego de pasivas que lleva como gerente
        # o entrenador (NOTAS O-164): cuadra con las seis fotos de Aaron.
        clave_personal = entero(c[6]) if len(c) > 6 else None
        # Columna 10: el tablero de habilidades propio (Idolos y algunos mas),
        # que la partida guarda por jugador en 0xBAFA8DBD (NOTAS O-169).
        tablero = entero(c[10]) if len(c) > 10 else None
        # Las nueve tecnicas del personaje y a que nivel se abre cada una:
        # columnas 11..27 (id) y 12..28 (nivel), de dos en dos. Las tres
        # primeras son el tronco, luego tres de la rama 1 y tres de la rama 2.
        # El id se guarda como en la partida (los 4 bytes al reves).
        tecnicas = []
        for k in range(11, 28, 2):
            tid = entero(c[k]) if len(c) > k + 1 else None
            niv = entero(c[k + 1]) if len(c) > k + 1 else None
            tecnicas.append(("%08X" % (tid & 0xFFFFFFFF), niv or 0) if tid else ("", 0))
        tecnicas = [(bytes.fromhex(t)[::-1].hex().upper() if t else "", lv)
                    for t, lv in tecnicas]
        param[ident & 0xFFFFFFFF] = (base_id, rareza, apt_e, apt_g, tecnicas, arquetipo, clave_personal,
                                     "%08X" % (tablero & 0xFFFFFFFF) if tablero else "")

    # chara_base: 0 = chara_base_id, 2 = indice de catalogo, 3 = name_id
    base = {}
    for c in filas(p_base):
        if len(c) < 4:
            continue
        base_id, indice, name_id = entero(c[0]), entero(c[2]), entero(c[3])
        if base_id is not None:
            base[base_id] = (indice, name_id)

    # Los nombres se leen del PROPIO fichero de textos del juego. Antes se
    # cogian del volcado a sqlite, y ese volcado venia incompleto: 154
    # personajes salian sin nombre y en el editor se les veia el numero en
    # crudo ("2772BDE3"), cuando el juego si tiene su nombre guardado
    # ("Bestia Negra"). Leyendolo directo salen todos (NOTAS O-100).
    idiomas = {}
    for lengua in ("es", "en"):
        idiomas[lengua] = nombres_del_juego(lengua)
        print("nombres en %s: %d" % (lengua, len(idiomas[lengua])))
    # por si algun dia falta el fichero de textos, se rellena con el sqlite
    dir_txt = os.path.join(JUEGO, "output", "text")
    for f in sorted(os.listdir(dir_txt)) if os.path.isdir(dir_txt) else []:
        if not f.endswith(".sqlite"):
            continue
        con = sqlite3.connect(os.path.join(dir_txt, f))
        try:
            for k, v in con.execute("select * from character_names"):
                idiomas.setdefault(f[:-7], {}).setdefault(entero(k), v)
        except sqlite3.Error:
            pass
        con.close()
    if not idiomas.get("es"):
        print("aviso: no hay nombres en espanol, uso los que haya", file=sys.stderr)

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    n = 0
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Personajes del juego, sacados de chara_param y chara_base.\n"
                 "# identidad = el valor del campo 0xBA162C11 de la partida, en hex.\n"
                 "# Lo genera herramientas/construir_personajes.py.\n")
        w = csv.writer(fh)
        # `rareza` es la familia (normal / hero / fabled) y `rareza_valor` el
        # numero exacto, que es lo que distingue los tres Idolos entre si:
        # 5 roja, 6 plateada, 7 rosa (NOTAS O-58).
        w.writerow(["identidad", "chara_base_id", "indice", "rareza", "rareza_valor",
                    "nombre_es", "nombre_en", "apt_entrenador", "apt_gerente"]
                   + ["tec%d" % k for k in range(1, 10)]
                   + ["tec%d_nivel" % k for k in range(1, 10)] + ["arquetipo_valor", "clave_personal", "tablero"])
        for ident, (base_id, rareza, apt_e, apt_g, tecnicas, arquetipo, clave_personal, tablero) in sorted(param.items()):
            if base_id not in base:
                continue
            indice, name_id = base[base_id]
            w.writerow(["%08X" % ident, base_id, indice,
                        RAREZAS.get(rareza, "desconocida(%s)" % rareza), rareza,
                        idiomas.get("es", {}).get(name_id, ""),
                        idiomas.get("en", {}).get(name_id, ""),
                        "1" if apt_e else "", "1" if apt_g else ""]
                       + [t for t, _ in tecnicas] + [lv for _, lv in tecnicas]
                       + ["" if arquetipo is None else arquetipo,
                          "" if clave_personal is None else clave_personal, tablero])
            n += 1
    print("Escritos %d personajes en %s" % (n, SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
