"""Las animaciones REALES de VR (supertecnicas, invocaciones y transformaciones) para el Partido (O-323).

En VR cada supertecnica es un evento: un guion (ievr/evento.py) con sus cortes de camara y,
por corte, la animacion de cada actor (el jugador en sus 4 tipos de cuerpo, el rival o el
companero, el balon, el keshin o el alma), la camara, los efectos (mallas, texturas y sus
animaciones) y el rotulo. Las invocaciones (keshin, armadura, mixi max, alma, lazo,
despertar, cambio de modo) son eventos iguales. Aqui se convierten, en el PC de cada uno y
desde SU juego (son arte del juego: no se reparten nunca), a la carpeta de los modelos:

  eventos/<ev>/escena.json          el guion ya masticado: cortes, actores, camara (fov y giro
                                    por fotograma), quien se ve, materiales y mallas de los
                                    efectos por fotograma, rotulo (ver INTEGRAR en la nota O-323)
  eventos/<ev>/escena.glb           lo que se pone en la escena: los efectos (mallas, texturas y
                                    sus huesos) y la camara de VR; una animacion glTF por corte
  eventos/<ev>/pistas_c000X01.glb   solo pistas: las de los jugadores (s00, s01...) con ese tipo de
                                    cuerpo, para el modelo de cada jugador (nodos "s00|<hueso>")
  eventos/<ev>/pistas_<k/a>.glb     las del keshin o alma que pone el juego (<ASSIGN>)
  eventos/<ev>/pistas_modelos.glb   las del balon y los modelos fijos (_waza, objetos...)
  eventos/_rotulos/<nombre>.png     el rotulo de VR con el nombre (telop_waza/es)
  <codigo>.glb                      los modelos que no son personajes: keshin kNNNNNN (con su
                                    pose 化身立ち1L), almas aNNNNNN, modelos de tecnica
                                    evNN_NNNNN, el balon b000001, objetos iNNNNNN y el aura de
                                    keshin del campo ega_kNNNNNNa (clips in/loop/out)

Cada actor va pegado a un hueso de un punto de colocacion (que en los jugadores depende del
tipo de cuerpo); aqui se hornea: la pista del hueso raiz ("output") de cada modelo ya lleva
donde esta en cada fotograma, y los efectos cuelgan de un nodo ancla con su pista. Asi la
pagina solo pone cada modelo en el origen del evento y le aplica sus pistas.

Codigo propio; los formatos, en ievr/g4.py, ievr/g4anim.py, ievr/cfgbin.py y el INFORME de
animvr de la carpeta de trabajo (O-323).
"""
import json
import os
import re
import struct

import numpy as np

from ievr import cfgbin, g4, g4anim
from ievr import evento as EV
from ievr.g4 import Glb, crc, leer_g4md, leer_g4pk, leer_g4sk, leer_g4tx, leer_vertices, mat_a_quat

# Sube si cambia lo que sale: los eventos ya convertidos de otra version se rehacen solos
# (2: los materiales Grd/Threshold con su forma y su rampa, y los cuartos de mancha en espejo,
# O-323 Fase B)
VERSION_EVENTO = 2
VERSION_INDICE = 1
FPS = 60
# los materiales de la cara que animan los eventos (G4MA tipo 32: el numero de expresion de
# los ojos, 1..3, y de la boca, 0..7; la rejilla de su atlas aun no se sabe)
CARAS = {crc(n): n for n in ("eye_10M", "mouth_10M", "eye_00M", "mouth_00M")}
MAX_TEX_EFECTO = 512        # lado maximo de las texturas de los efectos
MAX_TEX_ROTULO = 1024       # ancho maximo del rotulo (el de VR mide 1728x352)
IDIOMA_ROTULO = "es"

# del juego hace falta: los eventos, sus guiones (sin luces ni sonido), los efectos de los
# eventos y los comunes (auras de keshin del campo), los rotulos en espanol y los personajes
_CARPETAS = ("data/common/event/", "data/common/event_cfg/evt/", "data/common/event_cfg/eff/",
             "data/common/effect/event/", "data/common/effect/battle/common/",
             "data/dx11/effect/event/", "data/dx11/effect/battle/common/",
             "data/dx11/menu/220_img/telop_waza/%s/" % IDIOMA_ROTULO,
             "data/common/chr/", "data/dx11/chr/")


def _hace_falta(ruta):
    return ruta.startswith(_CARPETAS) and "_light/" not in ruta


def juego(carpeta_juego, cache=None):
    """Un g4.Juego con el indice de lo que hace falta para los eventos (su cache aparte:
    indice_eventos.json; el de los personajes no cambia)."""
    return g4.Juego(carpeta_juego, cache, filtro=_hace_falta, version=VERSION_INDICE)


def carpeta_evento(destino, ev):
    return os.path.join(destino, "eventos", ev)


def _nombre(s):
    """El nombre de nodo tal y como lo deja three.js (PropertyBinding.sanitizeNodeName): asi
    la pagina encuentra cada nodo por el nombre que dice escena.json."""
    return re.sub(r"[\[\]\.:/]", "", re.sub(r"\s", "_", s))


# --------------------------------------------------------------------------- matrices
def _quat_a_mat(q):
    q = np.asarray(q, np.float64)
    q = q / np.maximum(np.linalg.norm(q, axis=-1, keepdims=True), 1e-12)
    x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    m = np.empty(q.shape[:-1] + (3, 3))
    m[..., 0, 0] = 1 - 2 * (y * y + z * z)
    m[..., 0, 1] = 2 * (x * y - z * w)
    m[..., 0, 2] = 2 * (x * z + y * w)
    m[..., 1, 0] = 2 * (x * y + z * w)
    m[..., 1, 1] = 1 - 2 * (x * x + z * z)
    m[..., 1, 2] = 2 * (y * z - x * w)
    m[..., 2, 0] = 2 * (x * z - y * w)
    m[..., 2, 1] = 2 * (y * z + x * w)
    m[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return m


def _trs(t, q, s):
    """(F, 4, 4) de traslacion (F, 3), cuaternio xyzw (F, 4) y escala (F, 3)."""
    t, s = np.asarray(t, np.float64), np.asarray(s, np.float64)
    m = np.zeros(t.shape[:-1] + (4, 4))
    m[..., :3, :3] = _quat_a_mat(q) * s[..., None, :]
    m[..., :3, 3] = t
    m[..., 3, 3] = 1
    return m


def _descomponer(m):
    """(t, q, s) por fotograma de (F, 4, 4); los cuaternios en el mismo hemisferio seguidos."""
    t = m[:, :3, 3].copy()
    s = np.linalg.norm(m[:, :3, :3], axis=1)
    r = m[:, :3, :3] / np.where(s < 1e-9, 1, s)[:, None, :]
    q = np.array([mat_a_quat(x) for x in r])
    for f in range(1, len(q)):
        if np.dot(q[f - 1], q[f]) < 0:
            q[f] = -q[f]
    return t, q, s


def _orden(padres):
    """Los huesos con cada padre antes que sus hijos."""
    hecho, out = set(), []

    def poner(i):
        if i in hecho:
            return
        if padres[i] >= 0:
            poner(padres[i])
        hecho.add(i)
        out.append(i)
    for i in range(len(padres)):
        poner(i)
    return out


def _reposo(sk):
    """El TRS local de reposo de cada hueso, como los nodos del .glb (g4._esqueleto)."""
    out = []
    for i in range(sk["n"]):
        p = sk["padres"][i]
        loc = np.linalg.inv(sk["mundo"][p]) @ sk["mundo"][i] if p >= 0 else sk["mundo"][i]
        esc = np.linalg.norm(loc[:3, :3], axis=0)
        q = mat_a_quat(loc[:3, :3] / np.where(esc < 1e-9, 1, esc))
        out.append((loc[:3, 3].copy(), q, esc))
    return out


def _locales(sk, reposo, pistas, nf):
    """{hueso: (t, q, s)} por fotograma: lo de la pista si la hay y si no el reposo."""
    out = {}
    for i in range(sk["n"]):
        if i in pistas:
            v = pistas[i]
            out[i] = (v["translation"], v["rotation"], v["scale"])
        else:
            t0, q0, s0 = reposo[i]
            out[i] = (np.tile(t0, (nf, 1)), np.tile(q0, (nf, 1)), np.tile(s0, (nf, 1)))
    return out


def _mundo(sk, reposo, pistas, nf):
    """(F, n, 4, 4): la matriz de mundo de cada hueso en cada fotograma."""
    loc = _locales(sk, reposo, pistas, nf)
    m = np.zeros((nf, sk["n"], 4, 4))
    for i in _orden(sk["padres"]):
        li = _trs(*loc[i])
        p = sk["padres"][i]
        m[:, i] = m[:, p] @ li if p >= 0 else li
    return m


# --------------------------------------------------------------------------- el juego
class Fuente:
    """Los ficheros del juego (un g4.Juego), con lo leido a mano."""

    def __init__(self, juego):
        self.juego = juego
        self._sk = {}

    def hay(self, ruta):
        return self.juego.hay(ruta)

    def leer(self, ruta):
        return self.juego.leer(ruta)

    def leer_o_nada(self, ruta):
        return self.juego.leer(ruta) if self.juego.hay(ruta) else None

    def pkm(self, ruta):
        """{tipo: bytes} de un .g4pkm (G4SK, G4MD, G4MT, G4MA, G4TP, G4VS)."""
        out = {}
        for _n, x in leer_g4pk(self.leer(ruta)):
            out.setdefault(bytes(x[:4]).decode("ascii", "replace"), x)
        return out

    def esqueleto(self, ruta):
        if ruta not in self._sk:
            sk = leer_g4sk(self.leer(ruta))
            self._sk[ruta] = (sk, _reposo(sk))
        return self._sk[ruta]


def ruta_de_modelo(fuente, codigo):
    """El .g4pkm de un modelo que no es personaje (keshin, alma, modelo de tecnica, balon,
    objeto) o del efecto comun ega_*, o None."""
    if codigo.startswith("ega"):
        r = "common/effect/battle/common/%s/%s.objbin" % (codigo, codigo)
        return _pkm_de_objbin(fuente, r)[0] if fuente.hay(r) else None
    for c in ("common/chr/%s/%s.g4pkm", "common/chr/_keshin/%s/%s.g4pkm", "common/chr/_waza/%s/%s.g4pkm",
              "common/chr/_item/%s/%s.g4pkm"):
        r = c % (codigo, codigo)
        if fuente.hay(r):
            return r
    return None


def _pkm_de_objbin(fuente, ruta_objbin):
    """El .g4pkm que dice el .objbin (SETUP_PARAM Skeleton) y su .ptlb (particulas) si lo trae."""
    sk = ptlb = None
    for nom, v in cfgbin.leer(fuente.leer(ruta_objbin)):
        if nom == "SETUP_PARAM" and len(v) > 1 and v[0] == "Skeleton":
            sk = v[1]
        if nom == "PROP_PARAM" and len(v) > 1 and v[0] == "File" and str(v[1]).endswith(".ptlb"):
            ptlb = v[1]
    if sk and not fuente.hay(sk):
        alt = ruta_objbin[:-len(".objbin")] + ".g4pkm"
        sk = alt if fuente.hay(alt) else None
    return sk, ptlb


def _textura_de(base_comun):
    """La textura de un .g4pkm de common/... (la misma ruta en dx11/)."""
    return "dx11/" + base_comun[len("common/"):] + ".g4tx"


# --------------------------------------------------------------------------- materiales
def mezcla_de(material, malla=""):
    """Como se dibuja un material de efecto (el modo de mezcla del juego no se ha averiguado:
    por el nombre del sombreador, lo que mejor se vio en las pruebas de animvr):
    solido (SolidToon/Solid: la mano gigante), contorno (su Outline: caras de atras oscuras),
    profundidad (su Culling: solo tapa), normal (los planos "black", que oscurecen) y suma
    (lo demas: fuego, viento, brillos)."""
    n = "%s %s" % (malla, material)
    if "SolidToon" in material or material.startswith("Effect_Solid"):
        if re.search(r"Culling", n, re.I):
            return "profundidad"
        if re.search(r"Outline", n, re.I):
            return "contorno"
        return "solido"
    if re.search(r"black", n, re.I):
        return "normal"
    return "suma"


def clase_textura(dds):
    """Que es una textura de efecto, por lo que se ve (O-323 Fase B): ("rampa", eje, alto) un
    degradado en una sola direccion (el color de los sombreadores Grd y Threshold de VR: se mira
    por la intensidad de la forma; eje "v" de arriba abajo o "u" de lado a lado; alto 0 si el
    extremo fuerte, el mas claro y opaco, es el del principio del eje, 1 si es el del final),
    ("forma",) gris sobre negro (la mascara que dice donde se pinta: la luna de Escudo lunar, el
    rayo...) u ("otra",) (ruido, color liso, un dibujo de color)."""
    im = g4.dds_a_imagen(dds).convert("RGBA").resize((32, 32))
    a = np.asarray(im, dtype=np.float32) / 255.0
    lum, al = a[..., :3].mean(axis=2), a[..., 3]
    gris = float(np.abs(a[..., 0] - a[..., 1]).mean() + np.abs(a[..., 1] - a[..., 2]).mean()) < 0.06
    fuerza = lum + al

    def rampa(eje):
        # constante a lo ancho de cada fila (eje v) o de cada columna (eje u), y que cambie
        por = fuerza if eje == "v" else fuerza.T
        if float(por.std(axis=1).mean()) < 0.03 and float(np.ptp(por.mean(axis=1))) > 0.15:
            m = por.mean(axis=1)
            return ("rampa", eje, 0 if m[:4].mean() >= m[-4:].mean() else 1)
        return None
    r = rampa("v") or rampa("u")
    if r:
        return r
    v = lum * al
    if gris and float(np.median(v)) < 0.25 and float(v.std()) > 0.1:
        return ("forma",)
    return ("otra",)


def es_cuarto(dds):
    """Si una textura de efecto es un cuarto de mancha redonda (las "ALP" de los MA_: lo fuerte
    en una esquina y nada en la de enfrente, bajando poco a poco): VR la pinta en espejo y asi
    sale la mancha entera; repetida salian rectangulos con el borde duro (O-323 Fase B)."""
    im = g4.dds_a_imagen(dds).convert("RGBA").resize((32, 32))
    a = np.asarray(im, dtype=np.float32) / 255.0
    v = a[..., :3].mean(axis=2) * a[..., 3]
    for i, j in ((0, 0), (0, 31), (31, 0), (31, 31)):
        oi, oj = 31 - i, 31 - j
        if v[i, j] >= 0.7 and v[oi, oj] <= 0.1:
            diag = [float(v[i + (oi - i) * k // 31, j + (oj - j) * k // 31]) for k in range(32)]
            if all(diag[k + 1] <= diag[k] + 0.05 for k in range(31)):
                return True
    return False


def familia_de(material):
    """El sombreador, por el nombre del material sin su numero: 'Effect_T3Threshold_02' ->
    'T3Threshold', 'Effect_T1_low_03' -> 'T1_low'; los de artista 'MA'; los demas su nombre."""
    if material.startswith("MA_"):
        return "MA"
    return re.sub(r"_\d+$", "", material[len("Effect_"):] if material.startswith("Effect_") else material)


# --------------------------------------------------------------------------- el montaje (.glb)
class Montaje:
    """Un .glb con varios esqueletos (actores) y una animacion glTF por corte."""

    def __init__(self):
        self.g = Glb()
        self.tex = {}
        self.anims = {}
        self.obj = {}            # clave -> {sk, reposo, base, raices, ancla, mallas, mats}
        self.ranura = {}         # material de efecto -> ranura de su textura (para el G4TP)

    def esqueleto(self, clave, sk, reposo, prefijo=True, ancla=False):
        """Los nodos de los huesos ("<clave>|<hueso>"); con `ancla`, colgados de un nodo vacio
        "<clave>" que se mueve con el punto al que va pegado."""
        g = self.g
        nodo_ancla = None
        if ancla:
            g.j["nodes"].append({"name": _nombre(clave)})
            nodo_ancla = len(g.j["nodes"]) - 1
            g.j["scenes"][0]["nodes"].append(nodo_ancla)
        base = len(g.j["nodes"])
        raices = []
        for i in range(sk["n"]):
            t, q, esc = reposo[i]
            nombre = sk["nombres"][i]
            nodo = {"name": _nombre("%s|%s" % (clave, nombre) if prefijo else nombre)}
            if np.abs(t).max() > 1e-7:
                nodo["translation"] = [float(x) for x in t]
            if np.abs(q - [0, 0, 0, 1]).max() > 1e-7:
                nodo["rotation"] = [float(x) for x in q]
            if np.abs(esc - 1).max() > 1e-5:
                nodo["scale"] = [float(x) for x in esc]
            g.j["nodes"].append(nodo)
        for i in range(sk["n"]):
            p = sk["padres"][i]
            if p >= 0:
                g.j["nodes"][base + p].setdefault("children", []).append(base + i)
            else:
                raices.append(base + i)
        if nodo_ancla is not None:
            g.j["nodes"][nodo_ancla]["children"] = list(raices)
        else:
            g.j["scenes"][0]["nodes"] += raices
        o = {"sk": sk, "reposo": reposo, "base": base, "raices": raices, "ancla": nodo_ancla,
             "mallas": {}, "skin": None, "mats": set()}
        self.obj[clave] = o
        return o

    def _piel(self, o):
        if o["skin"] is None:
            sk, g = o["sk"], self.g
            ibm = np.array([np.linalg.inv(m) for m in sk["mundo"]])
            acc = g.accesor(ibm.transpose(0, 2, 1).reshape(-1, 16).astype(np.float32), "MAT4")
            g.j["skins"].append({"name": "piel", "joints": [o["base"] + i for i in range(sk["n"])],
                                 "inverseBindMatrices": acc, "skeleton": o["raices"][0]})
            o["skin"] = len(g.j["skins"]) - 1
        return o["skin"]

    def _material_efecto(self, mat, mezcla, por_hash, max_tex):
        g = self.g
        # el mismo nombre de material puede ir con otras texturas en otro efecto del evento
        clave = (mat["nombre"], mezcla, tuple(mat["tex"]))
        if clave in self.tex.setdefault("_mats", {}):
            return self.tex["_mats"][clave]
        color = [h for h in mat["tex"] if h in por_hash]
        gm = {"name": mat["nombre"], "doubleSided": mezcla != "contorno", "alphaMode": "BLEND",
              "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 1.0},
              "extensions": {"KHR_materials_unlit": {}},
              "extras": {"efecto": True, "mezcla": mezcla, "familia": familia_de(mat["nombre"])}}
        if mezcla in ("solido", "profundidad", "contorno"):
            gm["alphaMode"] = "OPAQUE"
        # los de varias texturas (Grd, Threshold: rampa, forma y ruido): la forma va de color (asi
        # su desplazamiento de UV es el suyo) y la rampa aparte, para pintar la forma con los
        # colores de la rampa en la pagina; si no, salian rectangulos enteros con el degradado
        # (O-323 Fase B)
        if mezcla in ("suma", "normal") and len(color) > 1:
            clases = self.tex.setdefault("_clase", {})
            for h in color:
                if h not in clases:
                    try:
                        clases[h] = clase_textura(por_hash[h][1])
                    except (ValueError, OSError, IndexError, KeyError):
                        clases[h] = ("otra",)
            forma = next((h for h in color if clases[h][0] == "forma"), None)
            rampa = next((h for h in color if clases[h][0] == "rampa"), None)
            if forma and rampa:
                if rampa not in self.tex:
                    png, alfa = g4.dds_a_png(por_hash[rampa][1], 64)
                    self.tex[rampa] = (g.imagen_png(png), alfa)
                gm["extras"]["rampa"] = {"textura": self.tex[rampa][0], "eje": clases[rampa][1], "alto": clases[rampa][2],
                                         "ranura": mat["tex"].index(rampa)}
                color = [forma]
        if color and mezcla != "contorno":
            h = color[0]
            if h not in self.tex:
                png, alfa = g4.dds_a_png(por_hash[h][1], max_tex)
                self.tex[h] = (g.imagen_png(png), alfa)
                # un cuarto de mancha: en espejo (O-323 Fase B)
                try:
                    cuarto = es_cuarto(por_hash[h][1])
                except (ValueError, OSError, IndexError):
                    cuarto = False
                if cuarto:
                    if "_espejo" not in self.tex:
                        g.j["samplers"].append({"magFilter": 9729, "minFilter": 9987, "wrapS": 33648, "wrapT": 33648})
                        self.tex["_espejo"] = len(g.j["samplers"]) - 1
                    g.j["textures"][self.tex[h][0]]["sampler"] = self.tex["_espejo"]
            gm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": self.tex[h][0]}
            gm["extras"]["textura"] = por_hash[h][0]
            gm["extras"]["ranura"] = mat["tex"].index(h)
            self.ranura[mat["nombre"]] = mat["tex"].index(h)
        if mezcla == "contorno":
            gm["pbrMetallicRoughness"]["baseColorFactor"] = [0.05, 0.03, 0.02, 1.0]
        g.j["materials"].append(gm)
        self.tex["_mats"][clave] = len(g.j["materials"]) - 1
        return self.tex["_mats"][clave]

    def mallas(self, clave, modelos, texturas, efecto=False, piel=None, max_tex=g4.MAX_TEX, informe=None):
        """Las mallas de `modelos` [(nombre, g4md, g4mg)] sobre el esqueleto de `clave`. Las que
        llevan piel van a los huesos; las rigidas (casi todas las de los efectos) cuelgan del
        hueso que se llama como ellas (con los vertices en su espacio)."""
        informe = informe or (lambda *_: None)
        g, o = self.g, self.obj[clave]
        sk = o["sk"]
        por_hash = {}
        for t in texturas:
            for nombre, dds in leer_g4tx(t):
                por_hash[crc(nombre)] = (nombre, dds)
        if not efecto:
            piel = tuple(piel) if piel else g4.color_de_piel(por_hash)
        nodo_hueso = {h: i for i, h in enumerate(sk["hashes"])}
        idx_nombre = {n: i for i, n in enumerate(sk["nombres"])}
        cabeza = nodo_hueso.get(crc("c_head_1_0"), 0)
        for nombre_modelo, md_b, mg in modelos:
            md = leer_g4md(md_b)
            prims_piel = []
            for m in md["mallas"]:
                if "_LOD" in m["nombre"] or not m["nv"]:
                    continue
                v = leer_vertices(md, mg, m)
                if not len(v["ind"]) or int(v["ind"].max()) >= m["nv"]:
                    informe("  %s:%s: formato raro, fuera" % (nombre_modelo, m["nombre"]))
                    continue
                tri = v["ind"].reshape(-1, 3)
                if "nor" in v and len(tri):
                    p = v["pos"].astype(np.float64)
                    nf = np.cross(p[tri[:, 1]] - p[tri[:, 0]], p[tri[:, 2]] - p[tri[:, 0]])
                    if np.sign((nf * v["nor"][tri[:, 0]]).sum(1)).mean() < 0:
                        tri = tri[:, [0, 2, 1]]
                mat_g4 = md["mats"][m["mat"]]
                es_efecto = efecto or mat_g4["nombre"].startswith(("Effect_", "MA_"))
                if es_efecto and "nor" in v and mezcla_de(mat_g4["nombre"], m["nombre"]) == "contorno":
                    # el contorno es la misma malla: el sombreador del juego la hincha por las
                    # normales; sin eso se pelea con la de delante (rayas en la mano de Mark)
                    diag = float(np.linalg.norm(v["pos"].max(0) - v["pos"].min(0)))
                    v["pos"] = (v["pos"] + v["nor"] * (0.004 * diag)).astype(np.float32)
                atrib = {"POSITION": g.accesor(v["pos"], "VEC3", 34962, minmax=True)}
                if "nor" in v:
                    atrib["NORMAL"] = g.accesor(v["nor"], "VEC3", 34962)
                if "uv" in v:
                    atrib["TEXCOORD_0"] = g.accesor(v["uv"], "VEC2", 34962)
                if es_efecto:
                    mezcla = mezcla_de(mat_g4["nombre"], m["nombre"])
                    # en los solidos el color de vertice no es color (la mano salia roja)
                    if "color" in v and mezcla in ("suma", "normal"):
                        atrib["COLOR_0"] = g.accesor(v["color"], "VEC4", 34962)
                    mat = self._material_efecto(mat_g4, mezcla, por_hash, min(max_tex, MAX_TEX_EFECTO))
                else:
                    mat, _nt = g4._material(g, mat_g4, por_hash, self.tex, piel, g4.SOMBRA, True)
                o["mats"].add(mat_g4["nombre"])
                prim = {"attributes": atrib, "material": mat,
                        "indices": g.accesor(tri.reshape(-1).astype(np.uint32), "SCALAR", 34963)}
                if "pesos" in v and m["pal_n"] > 0:
                    faltan = set()
                    atrib["JOINTS_0"], atrib["WEIGHTS_0"] = g4._piel_de_vertices(g, v, m, nodo_hueso, cabeza, faltan)
                    prims_piel.append(prim)
                    continue
                hueso = idx_nombre.get(m["nombre"])
                padre = o["base"] + hueso if hueso is not None else o["raices"][0]
                g.j["meshes"].append({"name": m["nombre"], "primitives": [prim]})
                nodo_nombre = self._unico(_nombre("%s|malla|%s" % (clave, m["nombre"])))
                g.j["nodes"].append({"name": nodo_nombre, "mesh": len(g.j["meshes"]) - 1})
                g.j["nodes"][padre].setdefault("children", []).append(len(g.j["nodes"]) - 1)
                o["mallas"].setdefault(m["nombre"], []).append(nodo_nombre)
            if prims_piel:
                g.j["meshes"].append({"name": nombre_modelo, "primitives": prims_piel})
                nodo_nombre = self._unico(_nombre("%s|malla|%s" % (clave, nombre_modelo)))
                g.j["nodes"].append({"name": nodo_nombre, "mesh": len(g.j["meshes"]) - 1, "skin": self._piel(o)})
                if o["ancla"] is not None:
                    g.j["nodes"][o["ancla"]].setdefault("children", []).append(len(g.j["nodes"]) - 1)
                else:
                    g.j["scenes"][0]["nodes"].append(len(g.j["nodes"]) - 1)
                o["mallas"].setdefault(nombre_modelo, []).append(nodo_nombre)

    def _unico(self, nombre):
        usados = self.tex.setdefault("_nombres", set())
        n, k = nombre, 1
        while n in usados:
            k += 1
            n = "%s~%d" % (nombre, k)
        usados.add(n)
        return n

    # --- animaciones
    def anim(self, corte):
        if corte not in self.anims:
            self.anims[corte] = {"name": corte, "samplers": [], "channels": []}
        return self.anims[corte]

    def pista(self, corte, nodo, prop, t, v):
        g, a = self.g, self.anim(corte)
        salida = g.rotaciones(v) if prop == "rotation" else g.accesor(np.asarray(v, np.float32), "VEC3")
        a["samplers"].append({"input": g.accesor(np.asarray(t, np.float32).reshape(-1, 1), "SCALAR", minmax=True),
                              "output": salida, "interpolation": "LINEAR"})
        a["channels"].append({"sampler": len(a["samplers"]) - 1, "target": {"node": nodo, "path": prop}})

    def pistas(self, clave, corte, t, locales, ancla=None):
        """Escribe las pistas de los huesos de `clave` que se mueven o no estan en reposo
        (locales: {hueso: (t, q, s)} por fotograma). `ancla` (F, 4, 4): donde esta el actor en
        cada fotograma; se hornea en el hueso raiz o va al nodo ancla. -> n pistas."""
        o = self.obj[clave]
        n = 0
        if ancla is not None and o["ancla"] is not None:
            at, aq, asc = _descomponer(ancla)
            for prop, v in (("translation", at), ("rotation", aq), ("scale", asc)):
                if prop == "scale" and np.abs(v - 1).max() < 1e-5:
                    continue
                self.pista(corte, o["ancla"], prop, t, v)
                n += 1
            ancla = None
        for i, (tt, qq, ss) in locales.items():
            t0, q0, s0 = o["reposo"][i]
            if ancla is not None and o["sk"]["padres"][i] < 0:
                tt, qq, ss = _descomponer(ancla @ _trs(tt, qq, ss))
            for prop, v, ref in (("translation", tt, t0), ("rotation", qq, q0), ("scale", ss, s0)):
                if prop == "rotation":
                    quieto = np.abs(v - v[0]).max() < 1e-6 and 1 - abs(float(np.dot(v[0], ref))) < 1e-7
                else:
                    quieto = np.abs(v - v[0]).max() < 1e-6 and np.abs(v[0] - ref).max() < 1e-6
                if quieto:
                    continue
                self.pista(corte, o["base"] + i, prop, t, v)
                n += 1
        return n

    def guardar(self, ruta, extras, orden=None):
        orden = [c for c in (orden or []) if c in self.anims] + sorted(c for c in self.anims if c not in (orden or []))
        # las que ya tenga (los clips del banco del keshin, g4anim) y las de los cortes
        self.g.j["animations"] = list(self.g.j.get("animations") or []) + [
            self.anims[c] for c in orden if self.anims[c]["channels"]]
        self.g.j["extensionsUsed"] = ["KHR_materials_unlit"]
        self.g.j["asset"]["extras"] = extras
        if not self.g.j["meshes"]:
            del self.g.j["meshes"]
        self.g.guardar(ruta)
        if "meshes" not in self.g.j:
            self.g.j["meshes"] = []


# --------------------------------------------------------------------------- lo de cada actor
def _clip_de(fuente, ruta):
    """(G4MT, clip, G4MA o None) del .g4pk de un actor en un corte (su primer clip), o None."""
    if not fuente.hay(ruta):
        return None
    partes = leer_g4pk(fuente.leer(ruta))
    mts = [g4anim.leer_g4mt(x) for _n, x in partes if x[:4] == b"G4MT"]
    mas = [g4anim.leer_g4mt(x) for _n, x in partes if x[:4] == b"G4MA"]
    for mt in mts:
        if mt["clips"]:
            return mt, mt["clips"][0], (mas[0] if mas else None)
    return None


def _muestras(mt, clip, nombres):
    """{nombre del objetivo: {tipo: [valores por fotograma]}} de un G4MA/G4TP/G4VS."""
    fot = np.arange(clip["ini"], clip["fin"] + 1, dtype=np.float64)
    out = {}
    for inf in mt["infos"][clip["info_ini"]: clip["info_ini"] + clip["info_n"]]:
        h = mt["objetivos"][inf["obj"]]
        nm = nombres.get(h, "%08x" % h)
        for c in mt["canales"][inf["can_ini"]: inf["can_ini"] + inf["can_n"]]:
            if not c["k_n"]:
                continue
            k, v = g4anim.claves_y_valores(mt, c)
            s = g4anim.muestrear(k, v, fot, c["interp"])[:, 0]
            out.setdefault(nm, {})[c["tipo"]] = [round(float(x), 4) for x in s]
    return out


def _materiales_limpios(crudo, ranura, de_tp=False):
    """De {material: {tipo: [..]}} a {material: {opacidad, r, g, b, u, v, ...}}: G4MA 19
    opacidad, 16/17/18 color, 32/33 desplazamiento de UV, 34/35 sin saber (se dejan); G4TP
    ("<material>#tex<N>") 10/11 desplazamiento de UV de la textura N, solo si es la que lleva
    el material en el .glb."""
    out = {}
    for nm, tipos in crudo.items():
        if de_tp:
            mat, _, tex = nm.partition("#tex")
            if not tex.isdigit() or ranura.get(mat, 0) != int(tex):
                continue
            d = out.setdefault(mat, {})
            if 10 in tipos:
                d["u"] = tipos[10]
            if 11 in tipos:
                d["v"] = tipos[11]
            continue
        d = out.setdefault(nm, {})
        for tipo, clave in ((19, "opacidad"), (16, "r"), (17, "g"), (18, "b"), (32, "u"), (33, "v"),
                            (34, "34"), (35, "35")):
            if tipo in tipos:
                d[clave] = tipos[tipo]
    return {k: v for k, v in out.items() if v}


def _camara(fuente, ruta, montaje):
    """La camara de VR (G4CM, un clip por corte): un nodo "camara" con su pista por corte y,
    para escena.json, por fotograma: fov (grados, vertical), giro (rad), posicion y objetivo.
    Tipos 22-24 posicion, 26-28 objetivo, 30 giro, 31 fov. El giro va con signo menos respecto
    a Rz (comprobado con el hueso eff_cam de point_eff, que copia la camara)."""
    g = montaje.g
    g.j.setdefault("cameras", []).append({"type": "perspective", "name": "camara_vr",
                                          "perspective": {"yfov": 0.5236, "znear": 0.05, "zfar": 500}})
    g.j["nodes"].append({"name": "camara", "camera": len(g.j["cameras"]) - 1})
    nodo = len(g.j["nodes"]) - 1
    g.j["scenes"][0]["nodes"].append(nodo)
    mt = g4anim.leer_g4mt(fuente.leer(ruta))
    out = {}
    for clip in mt["clips"]:
        fot = np.arange(clip["ini"], clip["fin"] + 1, dtype=np.float64)
        val = {}
        for inf in mt["infos"][clip["info_ini"]: clip["info_ini"] + clip["info_n"]]:
            for c in mt["canales"][inf["can_ini"]: inf["can_ini"] + inf["can_n"]]:
                if c["k_n"]:
                    k, v = g4anim.claves_y_valores(mt, c)
                    val[c["tipo"]] = g4anim.muestrear(k, v, fot, c["interp"])[:, 0]
        z = np.zeros(len(fot))
        P = np.stack([val.get(22, z), val.get(23, z), val.get(24, z)], 1)
        T = np.stack([val.get(26, z), val.get(27, z), val.get(28, z)], 1)
        giro = val.get(30, z)
        fov = val.get(31, z + np.radians(30))
        q = []
        for i in range(len(fot)):
            f = T[i] - P[i]
            f = f / max(np.linalg.norm(f), 1e-9)
            r = np.cross(f, [0, 1, 0])
            r = r / max(np.linalg.norm(r), 1e-9)
            u = np.cross(r, f)
            R = np.stack([r, u, -f], 1)
            cz, sz = np.cos(-giro[i]), np.sin(-giro[i])
            q.append(mat_a_quat(R @ np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])))
        q = np.array(q)
        for j in range(1, len(q)):
            if np.dot(q[j - 1], q[j]) < 0:
                q[j] = -q[j]
        t = (fot - fot[0]) / FPS
        montaje.pista(clip["nombre"], nodo, "translation", t, P)
        montaje.pista(clip["nombre"], nodo, "rotation", t, q)
        out[clip["nombre"]] = {"fov": [round(float(np.degrees(x)), 3) for x in fov],
                               "giro": [round(float(x), 4) for x in giro],
                               "pos": [[round(float(x), 4) for x in p] for p in P],
                               "obj": [[round(float(x), 4) for x in p] for p in T]}
    return out


class _Puntos:
    """Los puntos de colocacion del evento (point_sNN, point_eff): donde esta cada hueso en
    cada fotograma de cada corte, para hornear donde va cada actor."""

    def __init__(self, fuente, ev):
        self.fuente, self.ev = fuente, ev
        self.sk = {}
        self._cache = {}
        for a, d in ev["actores"].items():
            r = d.get("carga")
            if EV.tipo_de_actor(a) == "punto" and r and r.endswith(".g4sk") and fuente.hay(r):
                self.sk[a] = fuente.esqueleto(r)

    def mundo(self, punto, corte):
        """((F, n, 4, 4), fps) del punto en el corte (en reposo si no tiene animacion en el)."""
        k = (punto, corte[0])
        if k not in self._cache:
            sk, reposo = self.sk[punto]
            patron = self.ev["anim"].get((punto, corte[0]))
            c = _clip_de(self.fuente, patron.replace("<CHARA>", punto).replace("<CUT>", corte[0])) if patron else None
            if c:
                fot, pistas, _sin = g4anim.pistas_de_clip(c[0], c[1], sk, reposo)
                self._cache[k] = (_mundo(sk, reposo, pistas, len(fot)), c[1]["fps"] or FPS)
            else:
                self._cache[k] = (_mundo(sk, reposo, {}, 1), FPS)
        return self._cache[k]

    def ancla(self, actor, corte, fotogramas, tipo=None):
        """(F, 4, 4): donde esta `actor` en esos fotogramas del corte (contados desde su
        inicio, a 60 por segundo): el hueso del punto al que esta pegado en ese momento (la
        ultima orden PEGAR_A_PUNTO hasta ese fotograma; antes de la primera, la primera)."""
        fotogramas = np.asarray(fotogramas, dtype=np.float64)
        pegados = [p for p in EV.pegados_de(self.ev, actor, tipo) if p[1] in self.sk]
        out = np.tile(np.eye(4), (len(fotogramas), 1, 1))
        if not pegados:
            return out
        ini, fin = corte[1], corte[2]
        en_corte = [p for p in pegados if ini <= p[0] < fin]
        antes = [p for p in pegados if p[0] < ini]
        lista = ([antes[-1]] if antes else []) + en_corte
        if not lista:
            return out
        for i, f in enumerate(fotogramas):
            activo = lista[0]
            for p in lista:
                if p[0] <= ini + f:
                    activo = p
            _fr, punto, hueso = activo
            sk, _rep = self.sk[punto]
            if hueso not in sk["nombres"]:
                continue
            m, fps = self.mundo(punto, corte)
            out[i] = m[min(int(round(f * fps / FPS)), len(m) - 1), sk["nombres"].index(hueso)]
        return out


# --------------------------------------------------------------------------- el evento
def _reproducir(ev, actor):
    """{corte: (clip, fotograma desde el inicio del corte)} de las ordenes REPRODUCIR."""
    out = {}
    for fr, a, clip, _sub in ev["reproducir"]:
        if a != actor:
            continue
        c = EV.corte_en(ev, fr)
        out.setdefault(c[0], (clip, fr - c[1]))
    return out


def leer_evento(fuente, nombre):
    return EV.leer(nombre, fuente.leer_o_nada)


def _esqueleto_de_actor(fuente, actor, d, tipo_cuerpo=None, asignado=None):
    """(ruta del esqueleto, codigo de modelo) de un actor que es un modelo."""
    t = EV.tipo_de_actor(actor, d.get("carga"))
    if t == "personaje":
        return "common/chr/%s/%s.g4sk" % (EV.cuerpo(tipo_cuerpo), EV.cuerpo(tipo_cuerpo)), None
    codigo = asignado if t == "asignado" else EV.modelo_de_actor(actor, d.get("carga"))
    if not codigo:
        return None, None
    if re.fullmatch(r"c\d{8}(_\d+)?", codigo):
        f = g4.piezas(codigo)
        return ("common/chr/" + f["esqueleto"], codigo) if f else (None, codigo)
    r = ruta_de_modelo(fuente, codigo)
    return r, codigo


def convertir(nombre, destino, fuente, tipos=("01",), asignados=(), informe=None):
    """Convierte el evento `nombre` (ev60_00030) a `<destino>/eventos/<nombre>/`: escena.json,
    escena.glb, pistas_modelos.glb, pistas_c000X01.glb de los `tipos` de cuerpo ('01'..'04')
    y pistas_<asignado>.glb de cada keshin/alma de `asignados`. Rehace solo lo que no este o
    sea de otra VERSION_EVENTO. Devuelve {"carpeta", "modelos": [codigos de modelos que usa],
    "rotulo": nombre del rotulo o ""}."""
    informe = informe or (lambda *_: None)
    ev = leer_evento(fuente, nombre)
    if not ev:
        raise LookupError("el juego no trae el guion del evento %s" % nombre)
    carpeta = carpeta_evento(destino, nombre)
    os.makedirs(carpeta, exist_ok=True)
    puntos = _Puntos(fuente, ev)
    cortes = ev["cortes"]
    orden_cortes = [c[0] for c in cortes]
    actores = {a: d for a, d in ev["actores"].items() if EV.tipo_de_actor(a, d.get("carga")) != "punto"}
    modelos_usados = set()

    def anim_actor(actor, real, corte):
        patron = ev["anim"].get((actor, corte[0]))
        if not patron:
            return None
        return _clip_de(fuente, patron.replace("<CHARA>", real).replace("<CUT>", corte[0]))

    def pistas_actor(mj, actor, clave, real, sk_ruta, tipo=None, caras=None):
        sk, reposo = fuente.esqueleto(sk_ruta)
        mj.esqueleto(clave, sk, reposo)
        hechos = []
        for corte in cortes:
            c = anim_actor(actor, real, corte)
            if not c:
                continue
            mt, clip, ma = c
            desde = _reproducir(ev, actor).get(corte[0], (None, 0))[1]
            fot, pistas, _sin = g4anim.pistas_de_clip(mt, clip, sk, reposo)
            nf = len(fot)
            t = (fot - fot[0]) / (clip["fps"] or FPS) + desde / FPS
            ancla = puntos.ancla(actor, corte, t * FPS, tipo)
            mj.pistas(clave, corte[0], t, _locales(sk, reposo, pistas, nf), ancla)
            hechos.append(corte[0])
            if ma is not None and caras is not None:
                for cl in ma["clips"][:1]:
                    m = _muestras(ma, cl, CARAS)
                    if m:
                        caras.setdefault(clave, {})[corte[0]] = m
        return hechos

    info_actores = {}
    for a, d in actores.items():
        t = EV.tipo_de_actor(a, d.get("carga"))
        if not t:
            continue
        cl = EV.clave(a)
        info = {"tipo": t, "plantilla": a}
        if t in ("modelo", "balon"):
            info["modelo"] = EV.modelo_de_actor(a, d.get("carga"))
            modelos_usados.add(info["modelo"])
        info_actores[cl] = info

    # 1) los jugadores: unas pistas por tipo de cuerpo
    personajes = [a for a in actores if EV.tipo_de_actor(a) == "personaje"]
    for tipo in tipos:
        cuerpo = EV.cuerpo(tipo)
        ruta = os.path.join(carpeta, "pistas_%s.glb" % cuerpo)
        if not personajes or _al_dia_glb(ruta):
            continue
        mj = Montaje()
        caras, por_actor = {}, {}
        for a in personajes:
            real = EV.rellenar(a, tipo)
            sk_ruta = "common/chr/%s/%s.g4sk" % (cuerpo, cuerpo)
            por_actor[EV.clave(a)] = pistas_actor(mj, a, EV.clave(a), real, sk_ruta, tipo, caras)
        if not any(por_actor.values()):
            informe("  %s: sin animaciones para el tipo de cuerpo %s" % (nombre, cuerpo))
            continue
        mj.guardar(ruta, {"version": VERSION_EVENTO, "evento": nombre, "cuerpo": cuerpo,
                          "actores": por_actor, "caras": caras}, orden_cortes)
        informe("  %s -> pistas_%s.glb (%.2f MB)" % (nombre, cuerpo, os.path.getsize(ruta) / 1e6))

    # 2) el keshin o el alma que pone el juego (<ASSIGN>)
    asignables = [a for a in actores if EV.tipo_de_actor(a) == "asignado"]
    for asg in asignados if asignables else ():
        ruta = os.path.join(carpeta, "pistas_%s.glb" % asg)
        if _al_dia_glb(ruta):
            continue
        sk_ruta = ruta_de_modelo(fuente, asg)
        if not sk_ruta:
            informe("  %s: no encuentro el modelo de %s" % (nombre, asg))
            continue
        mj = Montaje()
        por_actor = {}
        for a in asignables:
            por_actor[EV.clave(a)] = pistas_actor(mj, a, EV.clave(a), EV.rellenar(a, asignado=asg), sk_ruta)
        mj.guardar(ruta, {"version": VERSION_EVENTO, "evento": nombre, "asignado": asg, "actores": por_actor},
                   orden_cortes)
        informe("  %s -> pistas_%s.glb (%.2f MB)" % (nombre, asg, os.path.getsize(ruta) / 1e6))

    # 3) el balon y los modelos fijos; 4) la camara y los efectos (escena.glb); 5) escena.json
    ruta_json = os.path.join(carpeta, "escena.json")
    if not _al_dia_json(ruta_json):
        fijos = [a for a in actores if EV.tipo_de_actor(a, actores[a].get("carga")) in ("modelo", "balon")]
        if fijos:
            mj = Montaje()
            por_actor = {}
            for a in fijos:
                sk_ruta, codigo = _esqueleto_de_actor(fuente, a, actores[a])
                if not sk_ruta or not fuente.hay(sk_ruta):
                    informe("  %s: %s sin modelo en el juego: fuera" % (nombre, a))
                    info_actores.pop(EV.clave(a), None)
                    continue
                por_actor[EV.clave(a)] = pistas_actor(mj, a, EV.clave(a), EV.rellenar(a), sk_ruta)
            mj.guardar(os.path.join(carpeta, "pistas_modelos.glb"),
                       {"version": VERSION_EVENTO, "evento": nombre, "actores": por_actor}, orden_cortes)
        escena = _escena(nombre, ev, fuente, puntos, carpeta, actores, info_actores, informe)
        escena["actores"] = info_actores
        for cl, info in info_actores.items():
            if info["tipo"] == "personaje":
                info["pistas"] = "pistas_<cuerpo>.glb"
            elif info["tipo"] == "asignado":
                info["pistas"] = "pistas_<asignado>.glb"
            elif info["tipo"] in ("modelo", "balon"):
                info["pistas"] = "pistas_modelos.glb"
        escena["modelos"] = sorted(modelos_usados)
        _escribir_json(ruta_json, escena)
        informe("  %s -> escena.json + escena.glb" % nombre)
    else:
        with open(ruta_json, encoding="utf-8") as fh:
            modelos_usados.update(json.load(fh).get("modelos") or [])
    return {"carpeta": carpeta, "modelos": sorted(modelos_usados), "rotulo": EV.nombre_del_rotulo(ev["rotulo"])}


def _escena(nombre, ev, fuente, puntos, carpeta, actores, info_actores, informe):
    """escena.glb (camara y efectos) y lo de escena.json."""
    mj = Montaje()
    cortes = ev["cortes"]
    out = {"version": VERSION_EVENTO, "evento": nombre, "fps": FPS,
           "cortes": [{"nombre": c[0], "ini": c[1], "fin": c[2]} for c in cortes],
           "duracion": round(EV.duracion(ev) / FPS, 3), "rotulo": ev["rotulo"] or "",
           "rotulo_png": EV.nombre_del_rotulo(ev["rotulo"]) if "<" not in (ev["rotulo"] or "") else "",
           "visible": {}, "camara": {}, "efectos": {}, "materiales": {}, "mallas": {},
           "auras": [[fr, EV.clave(a), n] for fr, a, n in ev["auras"]], "particulas": {},
           "efectos_comunes": sorted(set(ev["efectos_comunes"]))}
    if ev["camara"] and fuente.hay(ev["camara"]):
        out["camara"] = _camara(fuente, ev["camara"], mj)
    else:
        informe("  %s: sin camara" % nombre)
    for fr, a, val, _sub in ev["visible"]:
        if a in actores:
            out["visible"].setdefault(EV.clave(a), []).append([fr, val])
    for a, d in actores.items():
        if EV.tipo_de_actor(a, d.get("carga")) != "efecto":
            continue
        cl = EV.clave(a)
        try:
            pk, ptlb = _pkm_de_objbin(fuente, d["carga"])
        except (OSError, ValueError, KeyError) as e:
            informe("  efecto %s: %s" % (a, e))
            continue
        if not pk:
            informe("  efecto %s: sin .g4pkm" % a)
            continue
        try:
            _efecto(mj, cl, a, pk, ptlb, ev, fuente, puntos, out, info_actores, informe, carpeta)
        except (ValueError, IndexError, KeyError, OSError) as e:
            # un efecto que no se entiende no tira el evento entero
            informe("  efecto %s: no se pudo (%s: %s)" % (a, type(e).__name__, e))
            mj.obj.pop(cl, None)
            info_actores.pop(cl, None)
    mj.guardar(os.path.join(carpeta, "escena.glb"), {"version": VERSION_EVENTO, "evento": nombre},
               [c[0] for c in cortes])
    return out


def _efecto(mj, cl, actor, pk, ptlb, ev, fuente, puntos, out, info_actores, informe, carpeta):
    p = fuente.pkm(pk)
    base = pk[:-len(".g4pkm")]
    sk = leer_g4sk(p["G4SK"])
    reposo = _reposo(sk)
    o = mj.esqueleto(cl, sk, reposo, ancla=True)
    if "G4MD" in p and fuente.hay(base + ".g4mg"):
        tex = _textura_de(base)
        texs = [fuente.leer(tex)] if fuente.hay(tex) else []
        mj.mallas(cl, [(os.path.basename(base), p["G4MD"], fuente.leer(base + ".g4mg"))], texs, efecto=True,
                  informe=informe)
    mats = {crc(m): m for m in o["mats"]}
    mallas_md = {}
    if "G4MD" in p:
        md = leer_g4md(p["G4MD"])
        mallas_md = {crc(m["nombre"]): m["nombre"] for m in md["mallas"]}
        mats.update({crc(m["nombre"]): m["nombre"] for m in md["mats"]})
    mt = g4anim.leer_g4mt(p["G4MT"]) if "G4MT" in p else None
    clips_mt = {c["nombre"]: c for c in mt["clips"]} if mt else {}
    ma = g4anim.leer_g4mt(p["G4MA"]) if "G4MA" in p else None
    tp = g4anim.leer_g4mt(p["G4TP"]) if "G4TP" in p else None
    vs = g4anim.leer_g4mt(p["G4VS"]) if "G4VS" in p else None
    ranuras = {crc("%s_tex%d" % (n, i)): "%s#tex%d" % (n, i) for n in mats.values() for i in range(8)}
    info = {"tipo": "efecto", "plantilla": actor, "pkm": pk, "particulas": ptlb or "", "clips": {},
            "mallas": o["mallas"]}
    for corte_nombre, (clip_nombre, desde) in _reproducir(ev, actor).items():
        corte = next((c for c in ev["cortes"] if c[0] == corte_nombre), None)
        if corte is None:
            continue
        clip = clips_mt.get(clip_nombre)
        nf = (clip["fin"] - clip["ini"] + 1) if clip else max(corte[2] - corte[1] - desde, 1)
        t = np.arange(nf) / ((clip or {}).get("fps") or FPS) + desde / FPS
        locales = {}
        if clip:
            fot, pistas, _sin = g4anim.pistas_de_clip(mt, clip, sk, reposo)
            locales = _locales(sk, reposo, pistas, len(fot))
        ancla = puntos.ancla(actor, corte, t * FPS, None)
        mj.pistas(cl, corte_nombre, t, locales, ancla)
        info["clips"][corte_nombre] = {"clip": clip_nombre, "desde": desde, "fotogramas": nf}
        crudo = {}
        for banco, nombres in ((ma, mats), (tp, ranuras)):
            if banco:
                c2 = next((c for c in banco["clips"] if c["nombre"] == clip_nombre), None)
                if c2:
                    crudo[banco is tp] = _muestras(banco, c2, nombres)
        limpio = _materiales_limpios(crudo.get(False, {}), mj.ranura)
        for k, v in _materiales_limpios(crudo.get(True, {}), mj.ranura, de_tp=True).items():
            limpio.setdefault(k, {}).update(v)
        if limpio:
            out["materiales"].setdefault(corte_nombre, {})[cl] = limpio
        if vs:
            c2 = next((c for c in vs["clips"] if c["nombre"] == clip_nombre), None)
            if c2:
                m = {}
                for nm, tipos in _muestras(vs, c2, mallas_md).items():
                    if 15 in tipos:
                        m[nm] = [1 if x > 0.5 else 0 for x in tipos[15]]
                if m:
                    out["mallas"].setdefault(corte_nombre, {})[cl] = m
    info_actores[cl] = info
    out["efectos"][cl] = {"pkm": pk, "particulas": ptlb or ""}
    if ptlb and fuente.hay(ptlb):
        try:
            emisores = _particulas(fuente, ptlb, base, carpeta)
            if emisores:
                out["particulas"][cl] = emisores
        except (ValueError, IndexError, KeyError, OSError, struct.error) as e:
            informe("  particulas de %s: no se pudo (%s)" % (actor, e))


def _particulas(fuente, ptlb, base_efecto, carpeta):
    """Los emisores de particulas (.ptlb, T2B) de un efecto, en crudo para la pagina: el
    sistema de particulas lo hara la pagina (Fase B del plan de animvr) y el significado de
    cada numero aun no esta entendido del todo. Por emisor: el hueso del efecto donde nace
    (PARTICLE_NODE_INFO, uno por emisor y en el mismo orden; en escena.glb "<efecto>|<hueso>"),
    el corte en que sale (MOTION_INFO), su textura (MATERIAL_INFO: la del efecto o, con "#/",
    otra de dx11/; se pasa a part_<nombre>.png en la carpeta del evento), su sombreador y
    todos los bloques tal cual (EMITTER_INFO ritmo y tiempos, SHAPE_INFO, LIFE_TIME_INFO,
    COLOR_INFO, SPEED_INFO, SCALE_INFO, ROTATION_INFO, UV_INFO (hoja de fotogramas),
    FORCE_FIELD_INFO, WIND_INFO, MODEL_INFO...)."""
    entradas = cfgbin.leer(fuente.leer(ptlb))
    nodos = [v[0] for n, v in entradas if n == "PARTICLE_NODE_INFO" and v]
    emisores, actual = [], None
    for n, v in entradas:
        if n == "PARTICLE_INFO_BGN":
            actual = {}
        elif n == "PARTICLE_INFO_END":
            if actual is not None:
                emisores.append(actual)
            actual = None
        elif actual is not None:
            if n == "UV_INFO":
                actual.setdefault(n, []).append(v)
            else:
                actual[n] = v
    texturas = {}
    out = []
    for i, e in enumerate(emisores):
        mat = e.get("MATERIAL_INFO") or []
        png = ""
        if len(mat) > 1 and isinstance(mat[1], str) and mat[1]:
            g4tx = "dx11/" + mat[0][2:] if isinstance(mat[0], str) and mat[0].startswith("#/") else _textura_de(base_efecto)
            nombre = re.sub(r"[^A-Za-z0-9_]", "_", mat[1])[:50]
            png = "part_%s.png" % nombre
            ruta = os.path.join(carpeta, png)
            if not os.path.isfile(ruta):
                if g4tx not in texturas:
                    texturas[g4tx] = dict(leer_g4tx(fuente.leer(g4tx))) if fuente.hay(g4tx) else {}
                dds = texturas[g4tx].get(mat[1])
                if dds is None:
                    png = ""
                else:
                    datos, _alfa = g4.dds_a_png(dds, 256)
                    with open(ruta, "wb") as fh:
                        fh.write(datos)
        out.append({"nodo": _nombre(nodos[i]) if i < len(nodos) else "",
                    "corte": (e.get("MOTION_INFO") or [None, ""])[1] or "",
                    "textura": png, "sombreador": mat[11] if len(mat) > 11 else "", "crudo": e})
    return out


def _escribir_json(ruta, d):
    tmp = "%s.%d.tmp" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, ruta)


def _al_dia_glb(ruta):
    return os.path.isfile(ruta) and g4.version_de(ruta) == VERSION_EVENTO


def _al_dia_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as fh:
            d = json.load(fh)
        return d.get("version") == VERSION_EVENTO and os.path.isfile(os.path.join(os.path.dirname(ruta), "escena.glb"))
    except (OSError, ValueError):
        return False


def al_dia(destino, nombre, tipos=(), asignados=()):
    """Si el evento ya esta convertido (con esta VERSION_EVENTO) para esos tipos de cuerpo y
    esos keshin/almas. Los tipos sin jugadores en el evento no cuentan."""
    carpeta = carpeta_evento(destino, nombre)
    ruta = os.path.join(carpeta, "escena.json")
    if not _al_dia_json(ruta):
        return False
    with open(ruta, encoding="utf-8") as fh:
        d = json.load(fh)
    tipos_act = {i["tipo"] for i in (d.get("actores") or {}).values()}
    if "personaje" in tipos_act:
        for t in tipos:
            if not _al_dia_glb(os.path.join(carpeta, "pistas_%s.glb" % EV.cuerpo(t))):
                return False
    if "asignado" in tipos_act:
        for a in asignados:
            if not _al_dia_glb(os.path.join(carpeta, "pistas_%s.glb" % a)):
                return False
    return True


# --------------------------------------------------------------------------- modelos sueltos
def es_modelo_suelto(codigo):
    """Los codigos que no son personajes: keshin, almas, modelos de tecnica, balon, objetos,
    otros de chr y los efectos comunes ega_* (el aura del keshin en el campo)."""
    return bool(re.fullmatch(r"(k|a|b|i|kx|mx)\d{6}|ev\d\d_\d{5}|ega_[a-z0-9_]+", codigo or ""))


def convertir_modelo(codigo, destino, fuente, informe=None):
    """`<destino>/<codigo>.glb` de un modelo suelto (es_modelo_suelto), con la VERSION_MODELO de
    los personajes para que la cola los trate igual. El keshin lleva los clips de su banco
    (化身立ち1L: la pose de detras del jugador); el aura del campo, sus clips in/loop/out y en
    asset.extras lo de sus materiales y mallas por clip."""
    informe = informe or (lambda *_: None)
    pk = ruta_de_modelo(fuente, codigo)
    if not pk:
        raise LookupError("el juego no trae el modelo %s" % codigo)
    efecto = codigo.startswith("ega")
    p = fuente.pkm(pk)
    if "G4SK" not in p:
        raise LookupError("el modelo %s no trae esqueleto" % codigo)
    base = pk[:-len(".g4pkm")]
    sk = leer_g4sk(p["G4SK"])
    reposo = _reposo(sk)
    mj = Montaje()
    mj.esqueleto(codigo, sk, reposo, prefijo=False)
    if "G4MD" in p and fuente.hay(base + ".g4mg"):
        tex = _textura_de(base)
        texs = [fuente.leer(tex)] if fuente.hay(tex) else []
        mj.mallas(codigo, [(os.path.basename(base), p["G4MD"], fuente.leer(base + ".g4mg"))], texs,
                  efecto=efecto, piel=(255, 255, 255), informe=informe)
    extras = {"version": g4.VERSION_MODELO, "codigo": codigo, "pkm": pk}
    clips = []
    if efecto and "G4MT" in p:
        mt = g4anim.leer_g4mt(p["G4MT"])
        mats = {crc(m): m for m in mj.obj[codigo]["mats"]}
        ma = g4anim.leer_g4mt(p["G4MA"]) if "G4MA" in p else None
        tp = g4anim.leer_g4mt(p["G4TP"]) if "G4TP" in p else None
        vs = g4anim.leer_g4mt(p["G4VS"]) if "G4VS" in p else None
        ranuras = {crc("%s_tex%d" % (n, i)): "%s#tex%d" % (n, i) for n in mats.values() for i in range(8)}
        mallas_md = {crc(m["nombre"]): m["nombre"] for m in leer_g4md(p["G4MD"])["mallas"]} if "G4MD" in p else {}
        materiales, visibles = {}, {}
        for c in mt["clips"]:
            fot, pistas, _sin = g4anim.pistas_de_clip(mt, c, sk, reposo)
            mj.pistas(codigo, c["nombre"], (fot - fot[0]) / (c["fps"] or FPS), _locales(sk, reposo, pistas, len(fot)))
            clips.append(c["nombre"])
            limpio = {}
            if ma:
                c2 = next((x for x in ma["clips"] if x["nombre"] == c["nombre"]), None)
                if c2:
                    limpio = _materiales_limpios(_muestras(ma, c2, mats), mj.ranura)
            if tp:
                c2 = next((x for x in tp["clips"] if x["nombre"] == c["nombre"]), None)
                if c2:
                    for k, v in _materiales_limpios(_muestras(tp, c2, ranuras), mj.ranura, de_tp=True).items():
                        limpio.setdefault(k, {}).update(v)
            if limpio:
                materiales[c["nombre"]] = limpio
            c2 = next((x for x in vs["clips"] if x["nombre"] == c["nombre"]), None) if vs else None
            if c2:
                v = {nm: [1 if x > 0.5 else 0 for x in t[15]] for nm, t in _muestras(vs, c2, mallas_md).items() if 15 in t}
                if v:
                    visibles[c["nombre"]] = v
        extras.update({"efecto": True, "materiales": materiales, "visibles": visibles, "mallas": mj.obj[codigo]["mallas"]})
    elif codigo.startswith("k"):
        banco = "%s_p010.g4pk" % base
        if fuente.hay(banco):
            mts = g4anim.bancos_de(fuente.leer(banco))
            for mt in mts:
                for c in mt["clips"]:
                    if c["flags"] & 1:
                        continue
                    g4anim.anadir_animacion(mj.g, sk, reposo, 0, os.path.basename(banco)[:-5], [mt], c["nombre"],
                                            informe, sin_avance=True)
                    clips.append(c["nombre"])
    extras["clips"] = clips
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, codigo + ".glb")
    mj.guardar(ruta, extras, clips)
    informe("-> %s (%.2f MB)" % (ruta, os.path.getsize(ruta) / 1e6))
    return ruta


# --------------------------------------------------------------------------- rotulos
def convertir_rotulo(nombre, destino, fuente):
    """El rotulo de VR con el nombre de la tecnica o del espiritu ('whs00030', 'k000020',
    'aura_mixi_c02023380'...) a `<destino>/eventos/_rotulos/<nombre>.png`, o None si no esta."""
    if not re.fullmatch(r"[A-Za-z0-9_]{1,60}", nombre or ""):
        return None
    r = "dx11/menu/220_img/telop_waza/%s/%s.g4tx" % (IDIOMA_ROTULO, nombre)
    if not fuente.hay(r):
        return None
    carpeta = os.path.join(destino, "eventos", "_rotulos")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, nombre + ".png")
    if os.path.isfile(ruta):
        return ruta
    texs = leer_g4tx(fuente.leer(r))
    if not texs:
        return None
    png, _alfa = g4.dds_a_png(texs[0][1], MAX_TEX_ROTULO)
    tmp = "%s.%d.tmp" % (ruta, os.getpid())
    with open(tmp, "wb") as fh:
        fh.write(png)
    os.replace(tmp, ruta)
    return ruta


# --------------------------------------------------------------------------- lo que pide el partido
def _tipo_de_cara(cara):
    """El tipo de cuerpo ('01'..'04') de un personaje (su banco de animaciones), o ''."""
    f = g4.piezas(cara or "")
    anim = (f or {}).get("anim") or ""
    return "%02d" % int(anim[4]) if re.fullmatch(r"c000\d01", anim) else ""


def pedidos_de(jugadores):
    """Lo que hay que convertir para los jugadores de un partido, de las tablas
    eventos-tecnicas.csv y eventos-espiritus.csv (herramientas/construir_eventos.py).

    jugadores: [{"cara": "c01000100", "tecnicas": [nombre interno (whs00030) o id], "espiritu": id
    de espiritus.csv o ""}]. -> (codigos de modelos sueltos y personajes transformados,
    {evento: {"tipos": set, "asignados": set}}, [rotulos], {"tecnicas": {...}, "espiritus": {...}}
    para la pagina). Los tipos de cuerpo: el del que la hace y, si en el evento sale otro jugador
    (el rival de un regate o una defensa, los companeros), los de todos los del partido."""
    from ievr import reglas
    tec = {f["interno"]: f for f in reglas._tabla("eventos-tecnicas.csv")}
    tec_id = {f["id"].upper(): f for f in tec.values() if f.get("id")}
    esp = {}
    for f in reglas._tabla("eventos-espiritus.csv"):
        esp.setdefault(f["id"].upper(), []).append(f)
    tipos_partido = {t for t in (_tipo_de_cara(j.get("cara")) for j in jugadores) if t}
    codigos, rotulos, pedidos = [], [], {}
    mapa = {"tecnicas": {}, "espiritus": {}}

    def pedir(ev, tipos, asignados=()):
        if not ev:
            return
        p = pedidos.setdefault(ev, {"tipos": set(), "asignados": set()})
        p["tipos"] |= set(tipos)
        p["asignados"] |= {a for a in asignados if a}

    def poner(lista, x):
        if x and x not in lista:
            lista.append(x)
    for j in jugadores:
        cara = j.get("cara") or ""
        propio = _tipo_de_cara(cara) or "01"
        filas_esp = esp.get(str(j.get("espiritu") or "").upper(), [])
        fe = next((f for f in filas_esp if f["cara_de"] == cara), None) or \
            next((f for f in filas_esp if not f["cara_de"]), None)
        asignado = fe["asignado"] if fe else ""
        for x in j.get("tecnicas") or []:
            f = tec.get(str(x)) or tec_id.get(str(x).upper())
            if not f:
                continue
            hay = set((f.get("tipos_cuerpo") or "").split()) or set(EV.TIPOS_CUERPO)
            tipos = {propio} | (tipos_partido if int(f.get("jugadores") or 1) >= 2 else set())
            tipos = (tipos & hay) or {sorted(hay)[0]}
            asg = [asignado] if f.get("asignado") and asignado else []
            pedir(f["evento"], tipos, asg)
            pedir(f["evento_fallo"], tipos, asg)
            for m in (f.get("modelos") or "").split():
                poner(codigos, m)
            poner(rotulos, f.get("rotulo"))
            mapa["tecnicas"][f["interno"]] = {k: f.get(k, "") for k in (
                "evento", "evento_fallo", "segundos", "jugadores", "asignado", "rotulo")}
        if fe:
            # s00 el de antes y s01 el transformado (armadura, mixi max, modo): con su tipo de cuerpo
            tipos = {propio, _tipo_de_cara(fe["cara_a"]) or propio}
            pedir(fe["evento"], tipos, [asignado])
            for c in (asignado, fe["cara_a"], fe["aura_campo"]):
                poner(codigos, c)
            poner(rotulos, fe.get("rotulo"))
            mapa["espiritus"][fe["id"].upper()] = {k: fe.get(k, "") for k in (
                "familia", "evento", "segundos", "asignado", "cara_de", "cara_a", "aura_campo", "rotulo")}
    return codigos, pedidos, rotulos, mapa
