#!/usr/bin/env python3
"""Tabla de todas las supertecnicas del juego, con categoria y subtipo.

    py herramientas\\construir_tecnicas.py

Escribe `datos/reglas-extraidas/tecnicas.csv`.

Columnas de `m_skillInfoList` (fichero `skill_config_*.cfg.bin`):

| Col | Que es |
|---|---|
| 0 | id de la tecnica |
| 1 | nombre interno; su prefijo tambien dice la categoria (whs/whd/who/whk) |
| 6 | name_id, que se busca en los textos del idioma |
| 9 | **subtipo** |
| 10 | **TP** que cuesta usarla |
| 11 | **AT**, el poder que ensena el juego al lado del nombre |
| 12 | **elemento**: 1 Viento, 2 Bosque, 3 Fuego, 4 Montana |
| 14 | **categoria**: 1 Tiro, 2 Regate, 3 Defensa, 4 Parada |

El AT de la columna 11 cuadra con lo que se ve en el juego: Aaron mando una
captura con "Tormenta de fuego AT 440" y "Torbellino de fuego AT 540", y esos son
los numeros que hay ahi. El elemento se comprobo por los nombres: todas las de
fuego caen en el 3 y las de montana en el 4, que es la misma numeracion que ya se
usaba para los jugadores.

La categoria sale de la columna 14, que separa las cuatro sin una sola
excepcion en las 1.003 filas. Antes se sacaba de `names.csv`, que venia de un
volcado de terceros y dejaba 48 sin categoria.

Los nombres de los subtipos los aporto Aaron (2026-09-14), ver
`datos/reglas-del-jugador/supertecnicas.md`.
"""
import csv
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
COMUN = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "tecnicas.csv")

CATEGORIAS = {"Byte(1)": "Tiro", "Byte(2)": "Regate", "Byte(3)": "Defensa",
              "Byte(4)": "Parada"}
# La misma numeracion que en `construir_base_jugadores.py`.
ELEMENTOS = {1: "Viento", 2: "Bosque", 3: "Fuego", 4: "Montana"}

# (categoria, valor de la columna 9) -> como se llama eso jugando.
SUBTIPOS = {
    ("Tiro", "0"): "normal",
    ("Tiro", "4"): "tiro largo",
    ("Tiro", "16"): "bloqueo de tiros",
    # El 8 son 67 tiros normales de toda la vida (Tornado de fuego, Remate
    # dragon, Tiro fantasma...): el juego no los distingue, asi que "normal".
    # Descartado que sea "override": esas tecnicas aparecen en las tablas de
    # combinacion del juego igual que las demas (NOTAS O-188).
    ("Tiro", "8"): "normal",
    ("Defensa", "0"): "normal",
    ("Defensa", "16"): "bloqueo de tiro",
    ("Parada", "1"): "atajo",
    ("Parada", "2"): "despeje",
    ("Parada", "0"): "sin identificar",
    ("Regate", "0"): "normal",
}


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s / %s" % (fichero, tabla))
    lineas = [l.split("\t") for l in r.stdout.splitlines() if l]
    # OJO: unas tablas traen una primera linea con el numero de filas y otras no.
    # Quitar siempre la primera se comia una tecnica de verdad (paso lo mismo con
    # los uniformes, NOTAS O-79). Se quita solo si parece una cabecera: una o dos
    # celdas y todas numeros pequenos.
    if lineas and len(lineas[0]) <= 2 and all(
            c.strip().isdigit() and int(c) < 100000 for c in lineas[0]):
        lineas = lineas[1:]
    return lineas


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def u32(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def cadena(celda):
    return celda.replace('String("', "").replace('")', "") if "String(" in celda else ""


def numero(celda):
    """El numero de una celda, venga suelto o envuelto en Byte()/Short()."""
    import re
    m = re.match(r'^(?:Byte|Short|Int|Float)\((-?[\d.]+)\)$', (celda or "").strip())
    t = m.group(1) if m else (celda or "").strip()
    try:
        return int(float(t))
    except ValueError:
        return 0


def textos_es(fichero, tabla):
    """{id: texto} de una tabla de un fichero de textos en espanol, con los
    saltos del juego (\n) pasados a espacios."""
    import re
    ruta = os.path.join(COMUN, "text", "es", fichero)
    fuera = {}
    for c in volcar(ruta, tabla):
        k = u32(c[0]) if c else None
        if k is None:
            continue
        for celda in c[1:]:
            m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
            if m:
                fuera[k] = " ".join(re.sub(r"\\+n", " ", m.group(1)).replace("\\", "").split())
                break
    return fuera


def main():
    sys.path.insert(0, RAIZ)
    from ievr import tlv
    nombres = tlv.nombres()

    skill = os.path.join(COMUN, "gamedata", "skill")
    descripciones = textos_es("skill_text.cfg.bin", "TEXT_INFO")     # col 7 -> descripcion
    filas = []
    for c in volcar(unico(skill, "skill_config_"), "m_skillInfoList"):
        if len(c) < 15:
            continue
        sid = u32(c[0])
        cat = CATEGORIAS.get(c[14])
        if sid is None or cat is None:
            continue
        en_partida = bytes.fromhex("%08X" % sid)[::-1].hex().upper()
        nombre = nombres.get(en_partida, ("", ""))[0]
        sub = c[9]
        filas.append({
            "id": en_partida,
            "nombre": nombre,
            "categoria": cat,
            "subtipo": SUBTIPOS.get((cat, sub), "sin identificar"),
            "subtipo_valor": sub,
            "elemento": ELEMENTOS.get(numero(c[12]), ""),
            "poder": numero(c[11]),
            "tp": numero(c[10]),
            "nombre_interno": cadena(c[1]),
            "descripcion": descripciones.get(u32(c[7]), ""),
        })

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Todas las supertecnicas del juego, de skill_config.\n"
                 "# categoria: columna 14, que separa las cuatro sin excepciones.\n"
                 "# subtipo: columna 9. Los nombres los aporto Aaron.\n"
                 "# poder (AT): columna 11. tp: columna 10. elemento: columna 12.\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)

    import collections
    print("Escritas %d tecnicas en %s" % (len(filas), SALIDA))
    for cat in ("Tiro", "Regate", "Defensa", "Parada"):
        d = collections.Counter(f["subtipo"] for f in filas if f["categoria"] == cat)
        print("   %-8s %-4d  %s" % (cat, sum(d.values()), dict(d)))
    print("   sin nombre en ningun idioma:", sum(1 for f in filas if not f["nombre"]))
    d = collections.Counter(f["elemento"] for f in filas)
    print("   por elemento:", dict(d))
    poderes = sorted(f["poder"] for f in filas if f["poder"])
    if poderes:
        print("   AT: de %d a %d" % (poderes[0], poderes[-1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
