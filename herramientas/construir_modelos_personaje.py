#!/usr/bin/env python3
"""Con que piezas se arma el modelo 3D de cada personaje (vista 3D del partido, O-293).

    py herramientas\\construir_modelos_personaje.py

Escribe `datos/reglas-extraidas/modelos-personaje.csv`, una fila por codigo de
modelo (el `string_id` de `chara_base`, p. ej. `c03030080`, que es la "cara"
del partido). Solo nombres de ficheros, ids y colores: nada de dibujos. Con
esta tabla, `ievr/g4.py` arma el modelo en el PC de cada jugador sacando las
piezas de SU juego instalado (no hacen falta las tablas que solo tiene Aaron).

Lee los `.cfg.bin` del juego instalado (con `ievr/cpk.py`, siempre los de la
version que haya) y los vuelca con `referencia/volcado` como el resto de
herramientas; si alguno no estuviera, usa el de `datos/juego/extracted`. El
juego instalado hace falta: su lista de ficheros dice como se llaman las piezas.

De donde sale cada columna (comprobado en el juego, ver el INFORME de la
integracion):

    chara_param col 1 -> chara_base (col 1 codigo, col 6 id de modelo)
      -> CHARA_MODEL_INFO: col 4 cuerpo, col 5/6/7 crc32 de uniforme/botas/
         guantes (0 = sin), col 10 la cara (.g4md), col 16 piel 0xRRGGBBAA
      -> CHARA_BODY_INFO (del cuerpo): col 1 esqueleto (.objbin), col 5 tipo de
         esqueleto (resto de dividir por 4: 0..3 = c000101..c000401), col 6
         talla del uniforme (0..7)

- esqueleto: `common/chr/<ruta del objbin>` con .g4sk (o .g4pkm, que lo lleva
  dentro, para los esqueletos propios de `_face/...`); `_common/` sobra.
- anim: el cuerpo normal cuyo banco de animaciones se usa (c000X01).
- uniforme/botas/guantes: el crc32 es, o el nombre de un modelo propio
  (`_uniform/u03030080/u03030080`), o el de una TEXTURA de una carpeta con
  varias tallas del mismo modelo (`_uniform/u000101/u010101_10.g4tx` -> los
  modelos `u000101..u000108`). La talla buena se comprobo midiendo cada
  forma contra cada esqueleto (distancia de los vertices a sus huesos):
  uniforme `..01/02` = c000101, `03/04` = c000201, `05/08` = c000301,
  `06/07` = c000401, y eso es justo col 6 + 1; botas y guantes tienen 4
  tallas, una por esqueleto (col 5 mod 4 + 1).
"""
import csv
import os
import re
import subprocess
import sys
import tempfile
import zlib
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import cpk, rutas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
EXTRAIDO = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata", "character")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "modelos-personaje.csv")
CFG = "data/common/gamedata/character/"
UNIFORMES = "data/common/chr/_uniform/"
TEXTURAS = "data/dx11/chr/_uniform/"

INDICE = {}            # el indice del juego, para rutas_de

# talla del uniforme -> la otra talla del mismo esqueleto (por si falta)
PAREJA = {1: 2, 2: 1, 3: 4, 4: 3, 5: 8, 8: 5, 6: 7, 7: 6}


def ent(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def cadena(celda):
    m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
    return m.group(1) if m else ""


def volcar(ruta, tabla):
    r = subprocess.run([VOLCADO, ruta, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s / %s" % (ruta, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l]


def cfg_del_juego(indice, carpeta, prefijo, tmp):
    """El .cfg.bin mas nuevo de `prefijo` + version (`chara_model_1.03.49.00`, no
    `chara_model_preset_...`), sacado del juego a `tmp` (o el de
    datos/juego/extracted si el juego no esta)."""
    patron = re.compile(re.escape(prefijo) + r"[\d.]+\.cfg\.bin$")
    nombres = sorted(r for r in indice if r.startswith(CFG) and patron.match(r[len(CFG):]))
    if nombres:
        nom, e = indice[nombres[-1]]
        destino = os.path.join(tmp, os.path.basename(nombres[-1]))
        cpk.guardar(os.path.join(carpeta, nom), e, destino)
        return destino
    if os.path.isdir(EXTRAIDO):
        nombres = sorted(f for f in os.listdir(EXTRAIDO) if patron.match(f))
        if nombres:
            return os.path.join(EXTRAIDO, nombres[-1])
    raise SystemExit("no encuentro %s*.cfg.bin ni en el juego ni en datos/juego/extracted" % prefijo)


def piezas_de_uniforme(indice):
    """De las carpetas de _uniform: {crc32 del nombre: (carpeta, nombre)} de los modelos,
    lo mismo de las texturas, y {carpeta: [modelos que tiene]}."""
    modelos, texturas, por_carpeta = {}, {}, {}
    for r in indice:
        if r.startswith(UNIFORMES) and r.endswith(".g4md"):
            carpeta, nombre = r[len(UNIFORMES):-5].split("/", 1)
            modelos.setdefault(zlib.crc32(nombre.encode()), (carpeta, nombre))
            por_carpeta.setdefault(carpeta, []).append(nombre)
        elif r.startswith(TEXTURAS) and r.endswith(".g4tx") and r.count("/") == 5:
            carpeta, nombre = r[len(TEXTURAS):-5].split("/", 1)
            texturas.setdefault(zlib.crc32(nombre.encode()), (carpeta, nombre))
    return modelos, texturas, {c: sorted(v) for c, v in por_carpeta.items()}


def talla(carpeta, modelos, numero, ocho_tallas):
    """El modelo de la talla `numero` (01..08) de una carpeta con varias tallas
    (`u000101` -> `u0001NN`): esa, la otra del mismo esqueleto, la primera talla
    que haya y, si la carpeta no sigue el patron, su primer modelo."""
    prefijo = carpeta[:-2]
    tallas = [m for m in modelos if re.fullmatch(re.escape(prefijo) + r"\d\d", m)]
    quiero = [numero] + ([PAREJA[numero]] if ocho_tallas and numero in PAREJA else [])
    for n in quiero:
        nombre = "%s%02d" % (prefijo, n)
        if nombre in tallas:
            return nombre, n == numero
    return (tallas or modelos)[0], False


def pieza(crc, numero, ocho_tallas, mds, txs, por_carpeta, indice, cuenta):
    """("carpeta/modelo", "textura", propio) de un crc32 de CHARA_MODEL_INFO, o
    ("", "", False). `propio` = modelo hecho para ese personaje (lleva sus botas)."""
    crc &= 0xFFFFFFFF
    if not crc:
        return "", "", False
    if crc in mds:                                   # modelo propio
        carpeta, nombre = mds[crc]
        cuenta["pieza: modelo propio"] += 1
        tex = nombre if (TEXTURAS + carpeta + "/" + nombre + ".g4tx") in indice else ""
        return carpeta + "/" + nombre, tex, True
    if crc in txs:                                   # textura de un modelo con tallas
        carpeta, tex = txs[crc]
        modelos = por_carpeta.get(carpeta)
        if not modelos:
            cuenta["pieza: textura sin modelo"] += 1
            return "", "", False
        nombre, justa = talla(carpeta, modelos, numero, ocho_tallas)
        cuenta["pieza: talla justa" if justa else "pieza: talla aproximada"] += 1
        return carpeta + "/" + nombre, tex, False
    cuenta["pieza: crc sin fichero (armaduras _armd y otros)"] += 1
    return "", "", False


def equipaciones_de_historia():
    """{codigo: [crc32 de la camiseta de su equipo de historia]}, de
    `equipacion-jugador.csv` (O-77) y `caras.csv` (identidad -> codigo). Sus
    nombres (`u010201_10`) son los de las texturas 3D de esas camisetas."""
    from ievr import reglas
    codigo = {f["identidad"].upper(): f["cara"] for f in reglas._tabla("caras.csv")}
    out = {}
    for f in reglas._tabla("equipacion-jugador.csv"):
        c = codigo.get(f["identidad"].upper())
        if c and f.get("icono"):
            out.setdefault(c, []).append(zlib.crc32(f["icono"].encode()))
    return out


def completar(filas, crcs, mds, txs, por_carpeta, indice, cuenta):
    """Los que el juego deja sin ropa en su modelo (las versiones de historia
    `_5000`, 168, y unos 40 mas) saldrian como una cabeza flotando. Como hace
    construir_cuerpos.py con los bustos: la ropa de su version normal (el
    codigo sin `_5000`), si no la de su equipo de historia y, si tampoco, la
    del Raimon, siempre en la talla de su cuerpo. Las botas, igual."""
    historia = equipaciones_de_historia()
    raimon = {"uniforme": zlib.crc32(b"u010101_10"), "botas": zlib.crc32(b"s010101_10")}
    for codigo, f in filas.items():
        if f["uniforme"] or not f["anim"]:          # los animales no llevan ropa
            continue
        normal = crcs.get(codigo.split("_")[0], {}) if "_" in codigo else {}
        quiero = f["_tallas"]
        for origen, prueba in (("version normal", [normal.get("uniforme", 0)]),
                               ("equipo de historia", historia.get(codigo, [])),
                               ("Raimon", [raimon["uniforme"]])):
            for crc in prueba:
                f["uniforme"], f["uniforme_tex"], f["_propio"] = pieza(
                    crc, quiero["uniforme"], True, mds, txs, por_carpeta, indice, Counter())
                if f["uniforme"]:
                    cuenta["sin ropa en el modelo: la de su " + origen] += 1
                    break
            if f["uniforme"]:
                break
        if not f["botas"] and not f["_propio"]:
            for crc in (normal.get("botas", 0), raimon["botas"]):
                f["botas"], f["botas_tex"], _ = pieza(crc, quiero["botas"], False, mds, txs,
                                                       por_carpeta, indice, Counter())
                if f["botas"]:
                    break


def cara_en_su_carpeta(codigo, indice):
    """Unos pocos (Veronica Camry, algunos monstruos) no tienen cara en CHARA_MODEL_INFO: su
    modelo entero va en `_face/<saga>/<codigo>/<codigo>.g4pkm` (esqueleto + modelo) con su
    .g4mg y su textura al lado. Devuelve esa ruta (relativa a common/chr/) o ""."""
    for r in indice:
        if r.startswith("data/common/chr/_face/") and r.endswith("/%s/%s.g4pkm" % (codigo, codigo)):
            return r[len("data/common/chr/"):]
    return ""


def esqueleto_de(objbin, indice):
    base = objbin[:-len(".objbin")] if objbin.endswith(".objbin") else objbin
    if base.startswith("_common/"):
        base = base[len("_common/"):]
    for ext in (".g4sk", ".g4pkm"):
        if "data/common/chr/" + base + ext in indice:
            return base + ext
    return ""


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta %s (compilalo con cargo build --release)" % VOLCADO)
    carpeta = rutas.carpeta_del_juego()
    if not carpeta:
        raise SystemExit("no encuentro el juego en este ordenador (hace falta su lista de ficheros)")
    indice, errores = cpk.indice_de_carpeta(
        carpeta, lambda r: r.startswith(("data/common/chr/", "data/dx11/chr/", CFG)))
    INDICE.update(indice)
    print("indice del juego: %d ficheros de personajes (%d paquetes con error)" % (len(indice), len(errores)))

    with tempfile.TemporaryDirectory() as tmp:
        base_cfg = cfg_del_juego(indice, carpeta, "chara_base_", tmp)
        model_cfg = cfg_del_juego(indice, carpeta, "chara_model_", tmp)
        param_cfg = cfg_del_juego(indice, carpeta, "chara_param_", tmp)
        print("tablas:", ", ".join(os.path.basename(x) for x in (base_cfg, model_cfg, param_cfg)))
        param = volcar(param_cfg, "CHARA_PARAM_INFO_LIST")
        base = {ent(c[0]): c for c in volcar(base_cfg, "CHARA_BASE_INFO_LIST") if len(c) > 6}
        modelo = {ent(c[0]): c for c in volcar(model_cfg, "CHARA_MODEL_INFO_LIST") if len(c) > 16}
        cuerpo = {ent(c[0]): c for c in volcar(model_cfg, "CHARA_BODY_INFO_LIST") if len(c) > 6}

    mds, txs, por_carpeta = piezas_de_uniforme(indice)
    cuenta, filas, crcs, vistos = Counter(), {}, {}, {}
    for p in param:
        b = base.get(ent(p[1])) if len(p) > 1 else None
        codigo = cadena(b[1]) if b else ""
        if not codigo or codigo in vistos:
            if codigo and vistos[codigo] != ent(b[6]):
                cuenta["codigo con dos modelos (vale el primero)"] += 1
            continue
        vistos[codigo] = ent(b[6])
        m = modelo.get(ent(b[6]))
        c = cuerpo.get(ent(m[4])) if m else None
        cara = cadena(m[10]) if m else ""
        if m and c and not cara:
            cara = cara_en_su_carpeta(codigo, indice)
            if cara:
                cuenta["modelo entero en su .g4pkm"] += 1
        if not (m and c and cara.endswith((".g4md", ".g4pkm"))):
            cuenta["sin modelo"] += 1
            continue
        tipo, talla_uni = ent(c[5]) or 0, ent(c[6]) or 0
        esqueleto = esqueleto_de(cadena(c[1]), indice)
        if not esqueleto:
            cuenta["sin esqueleto"] += 1
            continue
        if not esqueleto.startswith("c000"):
            cuenta["esqueleto propio (o de animal)"] += 1
        anim = "c000%d01" % (tipo % 4 + 1) if tipo < 8 else ""
        piel = (ent(m[16]) or 0) & 0xFFFFFFFF
        fila = {"codigo": codigo, "esqueleto": esqueleto, "anim": anim,
                "piel": "%06X" % (piel >> 8) if piel else "", "cara": os.path.splitext(cara)[0],
                "_tallas": {"uniforme": talla_uni + 1, "botas": tipo % 4 + 1}, "_propio": False}
        crcs[codigo] = {}
        for clave, col, numero, ocho in (("uniforme", 5, talla_uni + 1, True),
                                         ("botas", 6, tipo % 4 + 1, False),
                                         ("guantes", 7, tipo % 4 + 1, False)):
            crcs[codigo][clave] = ent(m[col]) or 0
            fila[clave], fila[clave + "_tex"], propio = pieza(crcs[codigo][clave], numero, ocho, mds, txs,
                                                              por_carpeta, indice, cuenta)
            fila["_propio"] = fila["_propio"] or (propio and clave == "uniforme")
        filas[codigo] = fila
    completar(filas, crcs, mds, txs, por_carpeta, indice, cuenta)
    for f in filas.values():
        del f["_tallas"], f["_propio"]
        faltan = [r for r in rutas_de(f) if "data/" + r not in indice]
        if faltan:
            cuenta["con ficheros que no estan en el juego"] += 1
            print("  ojo %s: faltan %s" % (f["codigo"], faltan[:3]))
    filas = sorted(filas.values(), key=lambda f: f["codigo"])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Piezas del modelo 3D de cada personaje (lo convierte ievr/g4.py en el PC de cada uno).\n"
                 "# esqueleto y cara: relativos a common/chr/ (la textura de la cara en dx11/chr/).\n"
                 "# uniforme/botas/guantes: carpeta/modelo de common/chr/_uniform/ y su textura (misma carpeta\n"
                 "# de dx11/chr/_uniform/). anim: cuerpo cuyo banco de animaciones se usa. piel: RRGGBB.\n"
                 "# Lo genera herramientas/construir_modelos_personaje.py (O-293).\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print("Escritos %d personajes en %s" % (len(filas), SALIDA))
    for k, v in sorted(cuenta.items()):
        print("  %-42s %d" % (k, v))
    return 0


def rutas_de(fila):
    """Los ficheros del juego que hacen falta para un personaje (sin el `data/`).
    La misma cuenta que hace ievr/g4.py al convertir."""
    md = "common/chr/%s.g4md" % fila["cara"]
    if "data/" + md not in INDICE:          # el modelo va dentro del .g4pkm
        md = "common/chr/%s.g4pkm" % fila["cara"]
    out = ["common/chr/" + fila["esqueleto"], md, "common/chr/%s.g4mg" % fila["cara"]]
    if fila["anim"]:
        out.append("common/chr/{0}/{0}_p020.g4pk".format(fila["anim"]))
    for k in ("uniforme", "botas", "guantes"):
        if fila[k]:
            out += ["common/chr/_uniform/%s.g4md" % fila[k], "common/chr/_uniform/%s.g4mg" % fila[k]]
    return out


if __name__ == "__main__":
    raise SystemExit(main())
