#!/usr/bin/env python3
"""Traduce los marcadores `<FUL:ENDO>` que el juego deja dentro de los textos.

    py herramientas\\construir_marcadores.py

Deja `datos/reglas-extraidas/marcadores.csv`.

**Como funciona el enlace** (NOTAS O-98): las descripciones traen trozos como
`<FUL:ENDO>` o `<FST:KINO>`. La clave (`ENDO`) es **el apellido en romaji en
mayusculas**, y ese apellido esta en `chara_text_roma.cfg.bin`. La misma fila, en
`chara_text.cfg.bin`, trae el nombre traducido. O sea:

    <FUL:ENDO>  ->  romaji "Endo"  ->  misma clave  ->  "Mark Evans"

Cada clave tiene tres variantes: 0 el nombre completo, 11 el apellido y 12 el
nombre de pila. Los prefijos del marcador eligen cual:

| Prefijo | Que pone |
|---|---|
| FUL, FLA, FLC | el nombre completo |
| FST, FFS, FFC | solo el nombre |
| LST, LAF, LFC | solo el apellido |

Los prefijos raros (FLA, FFС...) son variantes gramaticales del juego; como solo
hay tres textos guardados, se agrupan por lo que piden.

Los `<MNT:...>` son nombres de sitio y de equipo, y funcionan **igual**, solo
que la pareja de ficheros es otra: `map_text_roma.cfg.bin` da el romaji y
`map_text.cfg.bin` el nombre traducido (NOTAS O-101). Por eso
`<MNT:NAGUMOHARA>` sale como *South Cirrus*: Nagumohara es el nombre japones del
sitio y South Cirrus el que se le puso en espanol.
"""
import csv
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
TEXTOS = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "text")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "marcadores.csv")

COMPLETO, APELLIDO, NOMBRE = 0, 11, 12


def entero(x):
    try:
        return int(x) & 0xFFFFFFFF
    except (TypeError, ValueError):
        return None


def nombres(idioma, fichero):
    """{(clave, variante): texto} de un fichero de nombres."""
    ruta = os.path.join(TEXTOS, idioma, fichero)
    if not os.path.isfile(ruta):
        return {}
    r = subprocess.run([VOLCADO, ruta, "NOUN_INFO"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    fuera = {}
    for l in r.stdout.splitlines():
        c = l.split("\t")
        clave = entero(c[0]) if c else None
        if clave is None or len(c) < 3:
            continue
        try:
            variante = int(c[1])
        except ValueError:
            continue
        for celda in c[2:]:
            m = re.match(r'^String\("(.*)"\)$', celda.strip(), re.S)
            if m and m.group(1):
                fuera[(clave, variante)] = m.group(1)
                break
    return fuera


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta el volcador: compila referencia/volcado")
    roma = nombres("es", "chara_text_roma.cfg.bin")
    es = nombres("es", "chara_text.cfg.bin")
    en = nombres("en", "chara_text.cfg.bin")
    print("nombres leidos: romaji %d, espanol %d, ingles %d"
          % (len(roma), len(es), len(en)))
    if not roma:
        raise SystemExit("no encuentro chara_text_roma")

    # La clave del marcador no siempre es el apellido: a veces es el nombre de
    # pila (AARON, ALICE) o el nombre entero pegado. Se indexa por las tres
    # formas, que es lo que cubre los casos reales.
    vistas = {}
    for (clave, variante), texto in sorted(roma.items()):
        if not texto or variante not in (COMPLETO, APELLIDO, NOMBRE):
            continue
        completo = es.get((clave, COMPLETO)) or en.get((clave, COMPLETO)) or ""
        nombre = es.get((clave, NOMBRE)) or en.get((clave, NOMBRE)) or ""
        apellido = es.get((clave, APELLIDO)) or en.get((clave, APELLIDO)) or ""
        if not (completo or nombre or apellido):
            continue
        # Una misma clave la pueden reclamar varios personajes: "ENDO" vale para
        # Mark Evans y para su abuelo David Evans, y no hay forma de saber a cual
        # se refiere el marcador. Se apuntan todos los candidatos y luego se
        # decide; **si hay duda se pone solo el apellido**, que es comun a todos y
        # por tanto nunca es mentira, en vez de arriesgarse a nombrar al que no es.
        for forma in (texto, texto.replace(" ", "")):
            marcador = forma.upper()
            if marcador:
                vistas.setdefault(marcador, []).append((completo, nombre, apellido))

    # --- los de sitio y equipo: misma idea, otra pareja de ficheros
    roma_m = nombres("es", "map_text_roma.cfg.bin")
    es_m = nombres("es", "map_text.cfg.bin")
    en_m = nombres("en", "map_text.cfg.bin")
    sitios = 0
    de_sitio = {}
    for (clave, variante), texto in sorted(roma_m.items()):
        if not texto or variante != COMPLETO:
            continue
        # solo interesa cuando el romaji es una palabra suelta: es lo que cabe
        # dentro de un <MNT:...>. Las frases enteras ("Ciudad de ...") no.
        if len(texto.split()) > 2 or "<" in texto:
            continue
        bueno = es_m.get((clave, COMPLETO)) or en_m.get((clave, COMPLETO)) or ""
        if not bueno or "<" in bueno:
            continue
        for forma in (texto, texto.replace(" ", "")):
            # aparte de las personas: "NAGUMOHARA" es a la vez un sitio y parte
            # del nombre de varios personajes, y mezclarlos dejaba la casilla
            # vacia. Cada prefijo busca en su propia lista.
            de_sitio.setdefault(forma.upper(), bueno)
        sitios += 1
    print("nombres de sitio y equipo anadidos: %d" % sitios)

    filas, ambiguas = [], 0
    for k, bueno in sorted(de_sitio.items()):
        filas.append([k, "sitio", bueno, bueno, bueno])
    for k, cands in vistas.items():
        completos = {c[0] for c in cands if c[0]}
        if len(completos) > 1:
            ambiguas += 1
            apellidos = {c[2] for c in cands if c[2]}
            comun = list(apellidos)[0] if len(apellidos) == 1 else ""
            filas.append([k, "persona", comun, comun, comun])
        else:
            mejor = max(cands, key=lambda c: (bool(c[0]), bool(c[1]), bool(c[2])))
            filas.append([k, "persona"] + list(mejor))
    print("claves con varios personajes (se pone solo el apellido): %d" % ambiguas)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Para traducir los marcadores <FUL:ENDO> de los textos del juego.\n"
                 "# clave = el apellido en romaji en mayusculas, que es lo que\n"
                 "# el marcador lleva dentro. Lo genera\n"
                 "# herramientas/construir_marcadores.py (NOTAS O-98).\n")
        w = csv.writer(fh)
        w.writerow(["clave", "tipo", "completo", "nombre", "apellido"])
        w.writerows(sorted(filas))
    print("Escritos %d marcadores en %s" % (len(filas), SALIDA))

    # cuantos de los que salen de verdad quedan resueltos
    try:
        sys.path.insert(0, RAIZ)
        from ievr import reglas
        conocidas = {f[0] for f in filas}
        usadas, resueltas = set(), set()
        for f in reglas._tabla("descripciones.csv"):
            for m in re.finditer(r"<([A-Z]+):([^>]+)>", f["descripcion"]):
                usadas.add(m.group(2))
                if m.group(2).upper().replace(" ", "") in conocidas:
                    resueltas.add(m.group(2))
        print("claves que aparecen en las descripciones: %d, resueltas: %d"
              % (len(usadas), len(resueltas)))
        faltan = sorted(usadas - resueltas)[:12]
        if faltan:
            print("   sin resolver, ejemplos: %s" % ", ".join(faltan))
    except Exception as e:
        print("   (no pude comprobar la cobertura: %s)" % e)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
