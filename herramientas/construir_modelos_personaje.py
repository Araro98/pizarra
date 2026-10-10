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
- armadura/armadura_tex: si el crc32 de col 5 es un modelo de `_armd/` (las
  armaduras de keshin: `c04003500_5100` lleva `ka002901`), el cuerpo es esa
  armadura y no el uniforme (O-323); el uniforme de su version normal se queda
  en su columna, pero ievr/g4.py usa la armadura.

La equipacion del equipo con el que juega (O-334). En el partido cada uno lleva la del
equipo, no la de su equipo de historia; VR la arma con dos tablas mas:

- `uniform_config`: m_UniformInfoList (id de la equipacion -> sus filas) y
  m_UniformModelInfoList, una fila por diseno (col 23: 0 el de casa, 1 el otro) con el
  crc32 de la "ropa" de cada papel: col 0 campo, 1 portero, 4/5 `_slv`, 6/7 `_fld`,
  8/9 `_dam`, 10/11 `_dmn`, 12/13 `_lse`, 14/15 `_lsa`, 16/17 `_bly` (los cuerpos
  especiales: el personaje lleva ese sufijo en su col 5 de CHARA_MODEL_INFO), 18/19 las
  botas (campo, portero) y 22 los guantes. Y las excepciones de algunos personajes con
  algunas equipaciones (m_CharaUniformExInfoList, por crc32 del codigo ->
  m_UniformExInfoList -> m_UniformExModelInfoList: col 0/1 ropa, 2/3 botas, 4 guantes,
  11 el diseno).
- `chara_parts`: CHARA_PARTS_CLOTHES (y SHOES, GLOVE): por cada ropa, una fila por
  cuerpo (col 2 = CHARA_BODY_INFO col 4, 0..13; los de 14 en adelante van por su talla,
  col 6): el modelo de la camiseta y el pantalon, su textura (solo en la primera fila),
  el dorsal `n` (col 3/4; una hoja de 10x10 numeros), la PIEL `sk` (col 6/7: el cuello,
  los brazos y las manos, lo que faltaba desde O-293: "la manga acaba ahi") y el
  brazalete de capitan `m` (col 8/9). CHARA_PARTS_COLOR_LIST: los dos colores del dorsal
  de cada ropa. Las botas y los guantes, una fila por tipo de esqueleto (col 5 de
  CHARA_BODY_INFO; si no la hay, mod 4).
Salen `modelos-equipacion.csv` y `modelos-ropa.csv`, y en `modelos-personaje.csv` las
columnas cuerpo, tipo, talla, ropa (su ropa de serie) y vestir (1 = en el partido lleva
la equipacion del equipo; 0 = lo suyo: animales, armaduras, cuerpos que no son de
persona y ropa de cuerpo entero `f`).
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
SALIDA_EQUIPACION = os.path.join(RAIZ, "datos", "reglas-extraidas", "modelos-equipacion.csv")
SALIDA_ROPA = os.path.join(RAIZ, "datos", "reglas-extraidas", "modelos-ropa.csv")
# los papeles de m_UniformModelInfoList (O-334): (nombre de columna, columna); el sufijo es
# el de la ropa de serie del personaje (col 5 de CHARA_MODEL_INFO)
PAPELES = [("campo", 0), ("portero", 1), ("campo_slv", 4), ("portero_slv", 5), ("campo_fld", 6), ("portero_fld", 7),
           ("campo_dam", 8), ("portero_dam", 9), ("campo_dmn", 10), ("portero_dmn", 11), ("campo_lse", 12),
           ("portero_lse", 13), ("campo_lsa", 14), ("portero_lsa", 15), ("campo_bly", 16), ("portero_bly", 17)]
CFG = "data/common/gamedata/character/"
UNIFORMES = "data/common/chr/_uniform/"
TEXTURAS = "data/dx11/chr/_uniform/"
ARMADURAS = "data/common/chr/_armd/"
TEX_ARMADURAS = "data/dx11/chr/_armd/"

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


def volcar_todo(ruta, tabla):
    """Como volcar, pero la primera linea solo se quita si es la cuenta de filas: en las
    tablas de uniform_config ya es un dato (O-79) y en las de chara_parts es la cuenta (en
    las *_MODEL_LIST, de parejas de lineas: una cuenta por pareja)."""
    r = subprocess.run([VOLCADO, ruta, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("no pude volcar %s / %s" % (ruta, tabla))
    ls = [l.split("\t") for l in r.stdout.splitlines() if l]
    if ls and len(ls[0]) == 1 and ent(ls[0][0]) is not None and \
            ent(ls[0][0]) * (2 if tabla.endswith("_MODEL_LIST") else 1) == len(ls) - 1:
        ls = ls[1:]
    return ls


def _rango(celda):
    m = re.search(r"\((-?\d+), (-?\d+)\)", celda or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def _sin_ext(ruta, carpeta="_uniform/"):
    """'_uniform/u000101/u000101.g4md' -> 'u000101/u000101' ('' si no es de esa carpeta)."""
    if not isinstance(ruta, str) or not ruta.startswith(carpeta):
        return ""
    return os.path.splitext(ruta[len(carpeta):])[0]


def partes_de_ropa(parts_cfg):
    """{tipo: {crc32 de la clave: (nombre o '', [filas])}} de CHARA_PARTS (O-334), tipo =
    CLOTHES, SHOES o GLOVE. Cada fila con las celdas ya leidas (texto o entero); las
    texturas que van vacias heredan la de la primera fila."""
    out = {}
    for tipo in ("CLOTHES", "SHOES", "GLOVE"):
        info = [[cadena(c) or (ent(c) if ent(c) is not None else c) for c in f]
                for f in volcar_todo(parts_cfg, "CHARA_PARTS_%s_INFO_LIST" % tipo)]
        lista = volcar_todo(parts_cfg, "CHARA_PARTS_%s_MODEL_LIST" % tipo)
        claves = {}
        for i in range(0, len(lista) - 1, 2):
            a, b = lista[i], lista[i + 1]
            ini, n = ent(b[0]) or 0, ent(b[1]) or 0
            filas = [list(f) for f in info[ini:ini + n]]
            for k in range(1, len(filas)):           # las texturas heredadas
                for col in (1, 4, 7, 9):
                    if col < len(filas[k]) and not filas[k][col] and filas[0][col]:
                        filas[k][col] = filas[0][col]
            claves[(ent(a[0]) or 0) & 0xFFFFFFFF] = (cadena(a[1]) if len(a) > 1 else "", filas)
        out[tipo] = claves
    colores = {}
    for f in volcar_todo(parts_cfg, "CHARA_PARTS_COLOR_LIST"):
        if len(f) >= 3 and ent(f[0]) is not None:
            colores[ent(f[0]) & 0xFFFFFFFF] = ((ent(f[1]) or 0) & 0xFFFFFFFF, (ent(f[2]) or 0) & 0xFFFFFFFF)
    return out, colores


def equipaciones(uni_cfg, codigo_de_crc):
    """Las filas de modelos-equipacion.csv (O-334): por equipacion y diseno, la ropa de cada
    papel, las botas y los guantes; y detras las excepciones de algunos personajes. Las ropas
    van por su crc32 (en hexadecimal) y se cambian luego por su nombre."""
    modelo = volcar_todo(uni_cfg, "m_UniformModelInfoList")
    hx = lambda c: "%08x" % (ent(c) & 0xFFFFFFFF) if ent(c) else ""
    filas = []
    for f in volcar_todo(uni_cfg, "m_UniformInfoList"):
        ini, n = _rango(f[1] if len(f) > 1 else "")
        for k, m in enumerate(modelo[ini:ini + n]):
            d = re.search(r"\d+", m[23]) if len(m) > 23 else None
            fila = {"id": "%08X" % ((ent(f[0]) or 0) & 0xFFFFFFFF), "diseno": d.group(0) if d else str(k), "personaje": ""}
            for nombre, col in PAPELES:
                fila[nombre] = hx(m[col])
            fila["botas"], fila["botas_portero"], fila["guantes"] = hx(m[18]), hx(m[19]), hx(m[22])
            filas.append(fila)
    ex_modelo = volcar_todo(uni_cfg, "m_UniformExModelInfoList")
    ex_info = volcar_todo(uni_cfg, "m_UniformExInfoList")
    for f in volcar_todo(uni_cfg, "m_CharaUniformExInfoList"):
        cod = codigo_de_crc.get((ent(f[0]) or 0) & 0xFFFFFFFF)
        if not cod:
            continue
        ini, n = _rango(f[1] if len(f) > 1 else "")
        for e in ex_info[ini:ini + n]:
            a, b = _rango(e[2] if len(e) > 2 else "")
            for k, m in enumerate(ex_modelo[a:a + b]):
                d = re.search(r"\d+", m[11]) if len(m) > 11 else None
                fila = {"id": "%08X" % ((ent(e[0]) or 0) & 0xFFFFFFFF), "diseno": d.group(0) if d else str(k),
                        "personaje": cod, "campo": hx(m[0]), "portero": hx(m[1]),
                        "botas": hx(m[2]), "botas_portero": hx(m[3]), "guantes": hx(m[4])}
                if any(fila[c] for c in ("campo", "portero", "botas", "botas_portero", "guantes")):
                    filas.append(fila)
    return filas


def escribir_equipacion(filas_eq, partes, colores, cuerpos, indice, cuenta):
    """modelos-equipacion.csv (la ropa por su nombre) y modelos-ropa.csv: las piezas de cada
    ropa, botas y guantes que se usan, y los cuerpos (O-334)."""
    ropa = partes["CLOTHES"]
    usados = {"CLOTHES": set(), "SHOES": set(), "GLOVE": set()}
    for f in filas_eq:
        for nombre, _col in PAPELES:
            if f.get(nombre):
                c = int(f[nombre], 16)
                if c in ropa:
                    f[nombre] = ropa[c][0] or f[nombre]
                    usados["CLOTHES"].add(c)
                else:
                    cuenta["equipacion: ropa que no esta en chara_parts"] += 1
                    f[nombre] = ""
        for col, tipo in (("botas", "SHOES"), ("botas_portero", "SHOES"), ("guantes", "GLOVE")):
            if f.get(col):
                if int(f[col], 16) in partes[tipo]:
                    usados[tipo].add(int(f[col], 16))
                else:
                    f[col] = ""
    campos = ["id", "diseno", "personaje"] + [n for n, _c in PAPELES] + ["botas", "botas_portero", "guantes"]
    with open(SALIDA_EQUIPACION, "w", newline="", encoding="utf-8") as fh:
        fh.write("# La equipacion de cada equipo para el partido (O-334): por id de equipacion (uniformId del\n"
                 "# equipo, en hex) y diseno (0 el de casa, 1 el otro), la ropa de cada papel (campo, portero\n"
                 "# y los cuerpos especiales _slv, _fld...), las botas y los guantes (crc32 en hex). Con\n"
                 "# personaje: lo que cambia para ese personaje con esa equipacion (lo vacio, lo general).\n"
                 "# Lo genera herramientas/construir_modelos_personaje.py.\n")
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(filas_eq)
    # las ropas comparten las filas de modelos por cuerpo (las tallas de u000101, sk000101...):
    # van una vez como "forma" (sus texturas de la primera fila en la ropa; si una fila trae
    # otra, en la forma) y cada ropa dice su forma y sus texturas. 0,6 MB en vez de 2,6
    out, formas = [], {}
    tex_cols = {"textura": 1, "numero_tex": 4, "piel_tex": 7, "marca_tex": 9}
    for tipo, nombre_tipo in (("CLOTHES", "ropa"), ("SHOES", "botas"), ("GLOVE", "guantes")):
        for c in sorted(usados[tipo], key=lambda x: partes[tipo][x][0] or "%08x" % x):
            nombre, filas = partes[tipo][c]
            clave = nombre if tipo == "CLOTHES" and nombre else "%08x" % c
            filas = [list(f) + [0] * (12 - len(f)) for f in filas]
            for f in filas:
                faltan = [x for x in (_sin_ext(f[0]),) + ((_sin_ext(f[3]), _sin_ext(f[6]), _sin_ext(f[8]))
                                                          if tipo == "CLOTHES" else ()) if x and UNIFORMES + x + ".g4md" not in indice]
                if faltan:
                    cuenta["ropa: piezas que no estan en el juego"] += 1
            if tipo != "CLOTHES":
                for f in filas:
                    out.append({"tipo": nombre_tipo, "clave": clave, "indice": f[2] if isinstance(f[2], int) else 0,
                                "modelo": _sin_ext(f[0]), "textura": _sin_ext(f[1])})
                continue
            primera = {k: _sin_ext(filas[0][col]) for k, col in tex_cols.items()}
            forma = tuple((f[2] if isinstance(f[2], int) else 0, _sin_ext(f[0]), _sin_ext(f[3]), _sin_ext(f[6]), _sin_ext(f[8]))
                          + tuple(_sin_ext(f[col]) if _sin_ext(f[col]) != primera[k] else "" for k, col in tex_cols.items())
                          for f in filas)
            if forma not in formas:
                formas[forma] = "f%d" % len(formas)
                for idx, mo, nu, pi, ma, tx, ntx, ptx, mtx in forma:
                    out.append({"tipo": "forma", "clave": formas[forma], "indice": idx, "modelo": mo, "textura": tx,
                                "numero": nu, "numero_tex": ntx, "piel": pi, "piel_tex": ptx, "marca": ma, "marca_tex": mtx})
            col1, col2 = colores.get(c, (0, 0))
            out.append({"tipo": "ropa", "clave": clave, "modelo": formas[forma], "textura": primera["textura"],
                        "numero_tex": primera["numero_tex"], "piel_tex": primera["piel_tex"], "marca_tex": primera["marca_tex"],
                        "numero_color": "%08X" % col1 if col1 else "", "numero_color2": "%08X" % col2 if col2 else ""})
    for idx, (tipo_c, talla, esq) in sorted(cuerpos.items()):
        out.append({"tipo": "cuerpo", "clave": str(idx), "indice": tipo_c, "modelo": esq, "textura": str(talla)})
    campos = ["tipo", "clave", "indice", "modelo", "textura", "numero", "numero_tex", "numero_color", "numero_color2",
              "piel", "piel_tex", "marca", "marca_tex"]
    with open(SALIDA_ROPA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Las piezas de la ropa de equipo para el partido (O-334), de chara_parts del juego.\n"
                 "# tipo ropa: por clave (la ropa) su forma (en modelo) y sus texturas: camiseta y pantalon,\n"
                 "# dorsal (hoja de 10x10 numeros) con sus dos colores RRGGBBAA, piel (cuello, brazos y\n"
                 "# manos) y brazalete de capitan. tipo forma: por indice (el cuerpo, col 4 de\n"
                 "# CHARA_BODY_INFO) los modelos de esas cuatro piezas (y la textura si esa fila trae otra).\n"
                 "# Rutas de common/chr/_uniform/ (texturas de dx11/chr/_uniform/) sin extension. botas y\n"
                 "# guantes: por tipo de esqueleto. cuerpo: clave = cuerpo, indice = tipo, modelo =\n"
                 "# esqueleto, textura = talla. Lo genera herramientas/construir_modelos_personaje.py.\n")
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(out)
    cuenta["equipacion: filas"] = len(filas_eq)
    cuenta["ropa: filas de piezas"] = len(out)


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


def armaduras(indice):
    """{crc32 del nombre: (carpeta/modelo, textura)} de los modelos de `_armd/` (O-323). La
    textura: la `<carpeta>_10` de dx11/chr/_armd/<carpeta>/ (o la primera que haya)."""
    texs = {}
    for r in indice:
        if r.startswith(TEX_ARMADURAS) and r.endswith(".g4tx") and r.count("/") == 5:
            carpeta, nombre = r[len(TEX_ARMADURAS):-5].split("/", 1)
            texs.setdefault(carpeta, []).append(nombre)
    out = {}
    for r in indice:
        if r.startswith(ARMADURAS) and r.endswith(".g4md"):
            carpeta, nombre = r[len(ARMADURAS):-5].split("/", 1)
            t = sorted(texs.get(carpeta, []))
            tex = carpeta + "_10" if carpeta + "_10" in t else (t[0] if t else "")
            out.setdefault(zlib.crc32(nombre.encode()), (carpeta + "/" + nombre, tex))
    return out


def talla(carpeta, modelos, numero, ocho_tallas):
    """El modelo de la talla `numero` (01..08) de una carpeta con varias tallas
    (`u000101` -> `u0001NN`): esa, la otra del mismo esqueleto, la primera talla
    que haya y, si la carpeta no sigue el patron, su primer modelo. Las de portero
    van de 51 a 58 (`u020351` -> `u0203NN`, 50 + talla): antes se buscaba 01..08, no
    estaba y salia la 51, la de nino, en cuerpos grandes (picos negros, O-334)."""
    prefijo, base = carpeta[:-2], (int(carpeta[-2:]) - 1 if carpeta[-2:].isdigit() else 0)
    tallas = [m for m in modelos if re.fullmatch(re.escape(prefijo) + r"\d\d", m)]
    quiero = [numero] + ([PAREJA[numero]] if ocho_tallas and numero in PAREJA else [])
    for n in quiero:
        nombre = "%s%02d" % (prefijo, base + n)
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
        parts_cfg = cfg_del_juego(indice, carpeta, "chara_parts_", tmp)
        uni_cfg = cfg_del_juego(indice, carpeta, "uniform_config_", tmp)
        print("tablas:", ", ".join(os.path.basename(x) for x in (base_cfg, model_cfg, param_cfg, parts_cfg, uni_cfg)))
        param = volcar(param_cfg, "CHARA_PARAM_INFO_LIST")
        base = {ent(c[0]): c for c in volcar(base_cfg, "CHARA_BASE_INFO_LIST") if len(c) > 6}
        modelo = {ent(c[0]): c for c in volcar(model_cfg, "CHARA_MODEL_INFO_LIST") if len(c) > 16}
        cuerpo = {ent(c[0]): c for c in volcar(model_cfg, "CHARA_BODY_INFO_LIST") if len(c) > 6}
        # la equipacion del equipo (O-334)
        partes, colores = partes_de_ropa(parts_cfg)
        codigo_de_crc = {zlib.crc32(cadena(c[1]).encode()): cadena(c[1]) for c in base.values() if cadena(c[1])}
        filas_eq = equipaciones(uni_cfg, codigo_de_crc)
    # los cuerpos de persona: indice (col 4) -> (tipo, talla, esqueleto comun)
    cuerpos = {}
    for c in cuerpo.values():
        ob, idx = cadena(c[1]), ent(c[4])
        if ob.startswith("_common/c000") and idx is not None and 0 <= idx < 100 and idx not in cuerpos:
            cuerpos[idx] = (ent(c[5]) or 0, ent(c[6]) or 0, esqueleto_de(ob, indice))

    mds, txs, por_carpeta = piezas_de_uniforme(indice)
    armds = armaduras(indice)
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
        # con armadura de keshin el cuerpo es el modelo de _armd (O-323)
        fila["armadura"], fila["armadura_tex"] = armds.get(crcs[codigo]["uniforme"] & 0xFFFFFFFF, ("", ""))
        if fila["armadura"]:
            cuenta["armadura de _armd como cuerpo"] += 1
        # O-334: su cuerpo (la fila de la ropa del equipo), su ropa de serie (por el sufijo de
        # los cuerpos especiales) y si en el partido se viste con la equipacion del equipo: los
        # de cuerpo de persona (con su modelo de sombra sh en CHARA_BODY_INFO col 2), sin
        # armadura y sin ropa de cuerpo entero (f, que tapa tambien la cabeza)
        nombre_ropa, filas_ropa = partes["CLOTHES"].get(crcs[codigo]["uniforme"] & 0xFFFFFFFF, ("", []))
        cuerpo_n = ent(c[4])
        de_persona = cadena(c[2]).startswith("_uniform/sh") and cuerpo_n is not None and 0 <= cuerpo_n < 100
        entero = bool(filas_ropa) and _sin_ext(filas_ropa[0][0]).startswith(("f", "ka"))
        fila.update({"cuerpo": cuerpo_n if de_persona else "", "tipo": tipo, "talla": talla_uni,
                     "ropa": nombre_ropa,
                     "vestir": 1 if (de_persona and anim and not fila["armadura"] and not entero) else 0})
        cuenta["se viste con la equipacion del equipo" if fila["vestir"] else "lleva lo suyo en el partido"] += 1
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
                 "# armadura: carpeta/modelo de common/chr/_armd/ y su textura (el cuerpo con armadura, O-323).\n"
                 "# cuerpo/tipo/talla: CHARA_BODY_INFO col 4/5/6; ropa: su ropa de serie (chara_parts); vestir:\n"
                 "# 1 = en el partido lleva la equipacion de su equipo (modelos-ropa.csv, O-334).\n"
                 "# Lo genera herramientas/construir_modelos_personaje.py (O-293).\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print("Escritos %d personajes en %s" % (len(filas), SALIDA))
    escribir_equipacion(filas_eq, partes, colores, cuerpos, indice, cuenta)
    print("Escritas %s y %s" % (SALIDA_EQUIPACION, SALIDA_ROPA))
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
    if fila.get("armadura"):
        return out + ["common/chr/_armd/%s.g4md" % fila["armadura"], "common/chr/_armd/%s.g4mg" % fila["armadura"]]
    for k in ("uniforme", "botas", "guantes"):
        if fila[k]:
            out += ["common/chr/_uniform/%s.g4md" % fila[k], "common/chr/_uniform/%s.g4mg" % fila[k]]
    return out


if __name__ == "__main__":
    raise SystemExit(main())
