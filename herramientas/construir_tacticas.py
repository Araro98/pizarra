#!/usr/bin/env python3
"""Las tacticas de equipo y las supertacticas con su descripcion (NOTAS O-232).

    py herramientas\\construir_tacticas.py

Escribe `datos/reglas-extraidas/tacticas.csv`: id (como en la partida),
categoria (tactica / supertactica), nombre, descripcion en espanol, y para las
tacticas de equipo sus efectos con numero, duracion y recarga (O-235).

Los efectos: la fila de cada tactica en `SPECIAL_TACTICS_INFO_LIST` va seguida
de parejas (indice, cuantos); la primera apunta a `SPECIAL_TACTICS_EFFECT_LIST`
(tipo de efecto, numero). Cada tipo de efecto tiene su frase del juego en
`soccer/special_tactics_effect_config` (tipo, id del texto en skill_text,
1 si es del geoglifo). Columnas 4 y 5 de la fila: duracion y recarga en seg.

De donde sale: `SPECIAL_TACTICS_INFO_LIST` (skill/special_tactics_config) y
`ITEM_SUPER_TACTICS_INFO_LIST` (item/item_config): la columna 2 es el id del
nombre (NOUN_INFO de los ficheros de texto) y la 3 el de la descripcion
(TEXT_INFO de item_text). Los ids van como en `nombres-es.csv`, con los
cuatro bytes al reves.
"""
import csv
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tacticas.csv")
FUENTES = [
    ("tactica", "gamedata/skill", "special_tactics_config_", "SPECIAL_TACTICS_INFO_LIST"),
    ("supertactica", "gamedata/item", "item_config_", "ITEM_SUPER_TACTICS_INFO_LIST"),
]
TEXTOS = ["item_text.cfg.bin", "skill_text.cfg.bin", "menu_text.cfg.bin", "soccer_common_text.cfg.bin"]


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
    if celda.startswith('String("') and celda.endswith('")'):
        return celda[8:-2]
    return ""


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cargar_textos(idioma, tabla):
    """{id: texto} de esa tabla en todos los ficheros de texto del idioma."""
    fuera = {}
    for f in TEXTOS:
        ruta = os.path.join(COMUN, "text", idioma, f)
        if not os.path.isfile(ruta):
            continue
        for fila in volcar(ruta, tabla):
            ident = u32(fila[0]) if fila else None
            if ident is None:
                continue
            for celda in fila[1:]:
                t = texto_de(celda)
                if t:
                    fuera.setdefault(ident, t)
                    break
    return fuera


def efectos_de_tacticas(descripciones):
    """{id de tactica en la partida: (efectos, duracion, recarga)}."""
    st = unico(os.path.join(COMUN, "gamedata/skill"), "special_tactics_config_")
    info = volcar(st, "SPECIAL_TACTICS_INFO_LIST")
    lista = [c for c in volcar(st, "SPECIAL_TACTICS_EFFECT_LIST") if len(c) > 2]
    # tipo de efecto -> (texto, del geoglifo)
    cfg = unico(os.path.join(COMUN, "gamedata/soccer"), "special_tactics_effect_config_")
    r = subprocess.run([VOLCADO, cfg, "--todas"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    frase = {}
    for l in r.stdout.splitlines():
        c = l.split("	")
        if len(c) == 3 and c[2] in ("0", "1") and c[0].lstrip("-").isdigit() and abs(int(c[0])) > 100000:
            frase[u32(c[0])] = (descripciones.get(u32(c[1]), ""), c[2] == "1")
    fuera, i = {}, 0
    while i < len(info):
        c = info[i]
        if len(c) < 17:
            i += 1
            continue
        subs, j = [], i + 1
        while j < len(info) and len(info[j]) == 2:
            subs.append([int(x) for x in info[j]])
            j += 1
        i = j
        efectos = []
        if subs:
            e0, n = subs[0]
            for fila in lista[e0:e0 + n]:
                texto, geoglifo = frase.get(u32(fila[0]), ("", False))
                if not texto:
                    continue
                valor = fila[1]
                # los marcadores de color del juego ([CTACTICS01], [CPASSIVE01], [C])
                texto = re.sub(r"\[C[A-Z0-9]*\]", "", texto)
                # "Ignora las batallas de foco durante <VALUE2> s": ese segundo
                # numero no esta en la tabla; dura lo que la tactica
                texto = texto.replace(" durante <VALUE2> s", "")
                if "<VALUE>" in texto:
                    if not valor.lstrip("-").isdigit() or abs(int(valor)) > 100000:
                        continue
                    texto = texto.replace("<VALUE>", valor)
                texto = limpio(texto).replace("%", " %").replace("  %", " %")
                efectos.append(("En el geoglifo: " if geoglifo else "") + texto)
        ident = u32(c[0])
        clave = bytes.fromhex("%08X" % ident)[::-1].hex().upper()
        dur = c[4].replace("Float(", "").replace(")", "")
        rec = c[5].replace("Float(", "").replace(")", "")
        # hay tacticas repetidas (variantes de la historia): se queda la primera
        fuera.setdefault(clave, (efectos, dur, rec))
    return fuera


def limpio(t):
    # el texto llega con "\\n" escrito (barra y ene) y alguna barra suelta
    t = (t or "").replace("\\\\n", " ").replace("\\n", " ").replace("\n", " ").replace("\\", " ")
    return " ".join(t.split())


def main():
    nombres = cargar_textos("es", "NOUN_INFO")
    descripciones = cargar_textos("es", "TEXT_INFO")
    efectos = efectos_de_tacticas(descripciones)
    filas, sin = [], 0
    for categoria, subdir, prefijo, tabla in FUENTES:
        ruta = unico(os.path.join(COMUN, subdir), prefijo)
        for c in volcar(ruta, tabla):
            if len(c) < 4 or u32(c[0]) is None or len(c) == 2:
                continue
            ident = u32(c[0])
            if not ident:
                continue
            en_partida = bytes.fromhex("%08X" % ident)[::-1].hex().upper()
            nombre = limpio(nombres.get(u32(c[2]), ""))
            desc = limpio(descripciones.get(u32(c[3]), ""))
            if not nombre:
                continue
            if not desc:
                sin += 1
            ef, dur, rec = efectos.get(en_partida, ([], "", ""))
            filas.append([en_partida, categoria, nombre, desc, " | ".join(ef),
                          dur if dur not in ("99999",) else "", rec])
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Tacticas de equipo y supertacticas con su descripcion (NOTAS O-232).\n"
                 "# Lo genera herramientas/construir_tacticas.py.\n")
        w = csv.writer(fh)
        w.writerow(["id", "categoria", "nombre", "descripcion", "efectos", "duracion", "recarga"])
        w.writerows(filas)
    print("Escritas %d tacticas en %s (%d sin descripcion)" % (len(filas), SALIDA, sin))
    for f in filas:
        print("  %-26s %3s/%3s  %s" % (f[2][:26], f[5], f[6], f[4]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
