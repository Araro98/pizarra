#!/usr/bin/env python3
"""Compara dos partidas y dice exactamente que cambio.

Es la herramienta de la fase 0. El metodo: guardas, cambias UNA sola cosa en el
juego, vuelves a guardar, y esto senala el campo concreto que se movio.

    py -m ievr.comparar  ANTES  DESPUES
    py -m ievr.comparar  ANTES  DESPUES  --informe informes/ronda-01.md
    py -m ievr.comparar  BASE-1 BASE-2   --aprender-ruido

ANTES y DESPUES pueden ser el fichero o la carpeta que lo contiene.
--aprender-ruido se usa con dos partidas en las que NO cambiaste nada: apunta
todo lo que se movio solo en datos/ruido.json para no volver a ensenarlo.
"""
import argparse
import json
import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import codec, tlv

# La raiz del proyecto. Cuando esto corre como programa (.exe, ver lanzador.py)
# el codigo va empaquetado en una carpeta temporal y la raiz de verdad la
# pone el lanzador en IEVR_RAIZ.
RAIZ = os.environ.get("IEVR_RAIZ") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_RUIDO = os.path.join(RAIZ, "datos", "ruido.json")
MAX_DETALLE = 40


def resolver(ruta):
    """Acepta el fichero de partida o la carpeta que lo contiene."""
    if os.path.isdir(ruta):
        cand = [f for f in sorted(os.listdir(ruta)) if f.endswith("USERDATALIVE")]
        if not cand:
            raise SystemExit("en %s no hay ningun fichero *USERDATALIVE" % ruta)
        if len(cand) > 1:
            raise SystemExit("en %s hay varios USERDATALIVE, dame el fichero concreto" % ruta)
        ruta = os.path.join(ruta, cand[0])
    if not os.path.isfile(ruta):
        raise SystemExit("no existe el fichero %s" % ruta)
    return ruta


def cargar_ruido():
    try:
        with open(RUTA_RUIDO, encoding="utf-8") as fh:
            d = json.load(fh)
    except (OSError, ValueError):
        return set(), []
    return set(int(h, 16) for h in d.get("campos", [])), d.get("rangos", [])


def guardar_ruido(campos, rangos, notas):
    os.makedirs(os.path.dirname(RUTA_RUIDO), exist_ok=True)
    with open(RUTA_RUIDO, "w", encoding="utf-8") as fh:
        json.dump({
            "_que_es_esto": "Campos y zonas que cambian solos al guardar aunque no "
                            "toques nada (reloj de juego, contadores). Se ignoran al "
                            "comparar para que no tapen el cambio de verdad.",
            "notas": notas,
            "campos": sorted("%08X" % h for h in campos),
            "rangos": rangos,
        }, fh, indent=2, ensure_ascii=False)


def tramos(a, b):
    """Tramos contiguos de bytes distintos entre dos buffers del mismo tamano."""
    try:
        import numpy as np
    except ImportError:
        out, i, n = [], 0, min(len(a), len(b))
        while i < n:
            if a[i] != b[i]:
                j = i
                while j < n and a[j] != b[j]:
                    j += 1
                out.append((i, j))
                i = j
            else:
                i += 1
        return out
    d = np.frombuffer(a, dtype=np.uint8) != np.frombuffer(b, dtype=np.uint8)
    idx = np.flatnonzero(d)
    if idx.size == 0:
        return []
    cortes = np.flatnonzero(np.diff(idx) != 1)
    ini = np.concatenate(([idx[0]], idx[cortes + 1]))
    fin = np.concatenate((idx[cortes], [idx[-1]]))
    return [(int(i), int(f) + 1) for i, f in zip(ini, fin)]


def analizar(pa, pb, ruido_campos=(), ruido_rangos=()):
    """Agrupa los bytes distintos por (registro, campo). Devuelve (hallazgos, sueltos)."""
    saltar = codec.checksum_offsets(pa) | codec.checksum_offsets(pb)
    hallazgos, sueltos = {}, []
    for ini, fin in tramos(pa, pb):
        for off in range(ini, fin):
            if off in saltar:
                continue
            if any(r[0] <= off < r[1] for r in ruido_rangos):
                continue
            loc = tlv.localizar(pa, off) or tlv.localizar(pb, off)
            if loc is None:
                sueltos.append(off)
                continue
            if loc["hash"] in ruido_campos:
                continue
            hallazgos.setdefault((loc["registro_off"], loc["campo_off"], loc["hash"]), loc)

    return hallazgos, sueltos


def _valor(datos):
    n = tlv.como_numero(datos)
    return "%s  (%d)" % (datos.hex(), n) if n is not None else datos.hex()


def informe(pa, pb, hallazgos, sueltos, ruta_a, ruta_b):
    lin = []
    w = lin.append
    w("# Comparacion de partidas\n")
    w("- **Antes:** `%s`" % ruta_a)
    w("- **Despues:** `%s`\n" % ruta_b)
    if not hallazgos and not sueltos:
        w("**No cambio nada** fuera de los checksums y del ruido conocido.\n")
        return "\n".join(lin)

    por_campo = {}
    for (_, _, h) in hallazgos:
        por_campo[h] = por_campo.get(h, 0) + 1
    w("## Resumen\n")
    w("%d campo(s) distinto(s), en %d registro(s).\n"
      % (len(hallazgos), len(set(k[0] for k in hallazgos))))
    w("| campo | que es | registros afectados |")
    w("|---|---|---|")
    for h, n in sorted(por_campo.items(), key=lambda kv: -kv[1]):
        w("| `%08X` | %s | %d |" % (h, tlv.nombre_campo(h), n))
    w("")

    w("## Detalle\n")
    for i, ((reg, campo, h), loc) in enumerate(sorted(hallazgos.items())):
        if i >= MAX_DETALLE:
            w("_... y %d mas. Usa --todo para verlos todos._\n" % (len(hallazgos) - MAX_DETALLE))
            break
        n = loc["longitud"]
        antes = bytes(pa[campo + 8:campo + 8 + n])
        despues = bytes(pb[campo + 8:campo + 8 + n])
        w("### %s" % tlv.etiqueta_registro(pa, reg))
        w("registro en `0x%07X` - campo `%08X` (%s) - %d byte(s) en `0x%07X`\n"
          % (reg, h, tlv.nombre_campo(h), n, campo))
        w("```")
        if n <= 64:
            w("antes:   %s" % _valor(antes))
            w("despues: %s" % _valor(despues))
        else:
            w("campo de %d bytes; solo se listan las posiciones que cambian:" % n)
            cambios = [k for k in range(n) if antes[k] != despues[k]]
            for k in cambios[:40]:
                w("  byte %6d (0x%07X):  %02X -> %02X"
                  % (k, campo + 8 + k, antes[k], despues[k]))
            if len(cambios) > 40:
                w("  ... y %d posicion(es) mas" % (len(cambios) - 40))
        w("```")
        if n > 64:
            continue
        vecinos = tlv.campos_desde(pa, reg, maximo=14)
        if len(vecinos) > 1:
            w("<details><summary>resto del registro (sin tocar)</summary>\n")
            w("```")
            for off, fh, ln, datos in vecinos:
                marca = "  <-- este" if off == campo else ""
                w("0x%07X  %08X  %2d  %-38s %s%s"
                  % (off, fh, ln, tlv.nombre_campo(fh), datos.hex(), marca))
            w("```")
            w("</details>\n")
    if sueltos:
        grupos = []
        for off in sueltos:
            if grupos and off - grupos[-1][-1] <= 16:
                grupos[-1].append(off)
            else:
                grupos.append([off])
        w("## Bytes en zonas que todavia no sabemos leer\n")
        w("%d byte(s) en %d sitio(s). No caen dentro de ningun campo reconocible, asi "
          "que no afirmo a que pertenecen: solo digo donde estan y cual es el registro "
          "entendible mas cercano por delante.\n" % (len(sueltos), len(grupos)))
        for g in grupos[:12]:
            w("### zona en `0x%07X` (%d byte(s))\n" % (g[0], len(g)))
            w("```")
            for off in g[:24]:
                w("0x%07X  %02X -> %02X" % (off, pa[off], pb[off]))
            if len(g) > 24:
                w("... y %d byte(s) mas" % (len(g) - 24))
            w("```")
            anc = tlv.ancla_cercana(pa, g[0])
            if anc:
                h, campos = anc
                w("registro entendible mas cercano: `0x%07X`, a %d bytes por delante\n"
                  % (h, g[0] - h))
                w("```")
                for off, fh, ln, datos in campos:
                    w("0x%07X  %08X  %2d  %-34s %s"
                      % (off, fh, ln, tlv.nombre_campo(fh), datos[:24].hex()))
                w("```")
            else:
                w("_sin ningun registro reconocible cerca._\n")
        if len(grupos) > 12:
            w("_... y %d zona(s) mas._\n" % (len(grupos) - 12))
    return "\n".join(lin)


def _consola_utf8():
    """La consola de Windows llega en cp1252 y destroza los acentos."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv=None):
    _consola_utf8()
    ap = argparse.ArgumentParser(description="Compara dos partidas de IEVR.")
    ap.add_argument("antes")
    ap.add_argument("despues")
    ap.add_argument("--informe", help="escribe el informe en este fichero .md")
    ap.add_argument("--aprender-ruido", action="store_true",
                    help="las dos partidas NO tienen cambios: apunta lo que se movio solo")
    ap.add_argument("--sin-ruido", action="store_true", help="no filtrar por datos/ruido.json")
    ap.add_argument("--todo", action="store_true", help="sin limite de detalle")
    a = ap.parse_args(argv)

    global MAX_DETALLE
    if a.todo:
        MAX_DETALLE = 10 ** 9

    ra, rb = resolver(a.antes), resolver(a.despues)
    na, nb = os.path.basename(ra), os.path.basename(rb)
    if na != nb:
        raise SystemExit("los dos ficheros deben llamarse igual (%s vs %s); el nombre es la clave"
                         % (na, nb))
    print("descifrando...", file=sys.stderr)
    pa, pb = codec.load(ra, na), codec.load(rb, nb)
    if len(pa) != len(pb):
        print("AVISO: tamanos distintos (%d vs %d)" % (len(pa), len(pb)), file=sys.stderr)
        n = min(len(pa), len(pb))
        pa, pb = pa[:n], pb[:n]

    if a.aprender_ruido:
        hall, sueltos = analizar(pa, pb)
        campos = sorted(set(k[2] for k in hall))
        guardar_ruido(campos, [],
                      "Aprendido de dos partidas guardadas sin cambiar nada: %s vs %s"
                      % (a.antes, a.despues))
        print("Ruido aprendido: %d campo(s) cambian solos." % len(campos))
        for h in campos:
            print("   %08X  %s" % (h, tlv.nombre_campo(h)))
        if sueltos:
            print("Ademas %d byte(s) fuera de registros. Esos no los apunto todavia."
                  % len(sueltos))
        print("\nGuardado en %s" % RUTA_RUIDO)
        return 0

    rc, rr = (set(), []) if a.sin_ruido else cargar_ruido()
    hall, sueltos = analizar(pa, pb, rc, rr)
    txt = informe(pa, pb, hall, sueltos, ra, rb)
    if a.informe:
        os.makedirs(os.path.dirname(os.path.abspath(a.informe)), exist_ok=True)
        with open(a.informe, "w", encoding="utf-8") as fh:
            fh.write(txt)
        print("Informe escrito en %s" % a.informe)
    print(txt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
