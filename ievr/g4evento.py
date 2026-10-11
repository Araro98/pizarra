"""Las animaciones REALES de VR (supertecnicas, invocaciones y transformaciones) para el Partido (O-323).

En VR cada supertecnica es un evento: un guion (ievr/evento.py) con sus cortes de camara y,
por corte, la animacion de cada actor (el jugador en sus 4 tipos de cuerpo, el rival o el
companero, el balon, el keshin o el alma), la camara, los efectos (mallas, texturas y sus
animaciones) y el rotulo. Las invocaciones (keshin, armadura, mixi max, alma, lazo,
despertar, cambio de modo) son eventos iguales. Aqui se convierten, en el PC de cada uno y
desde SU juego (son arte del juego: no se reparten nunca), a la carpeta de los modelos:

  eventos/<ev>/escena.json          el guion ya masticado: cortes, actores, camara (fov y giro
                                    por fotograma), quien se ve, materiales y mallas de los
                                    efectos por fotograma, rotulo (ver INTEGRAR en la nota O-323),
                                    los emisores de particulas descifrados y el elemento (O-330)
  eventos/<ev>/sombreadores.json    los sombreadores de VR de sus efectos traducidos a GLSL
                                    (ievr/sombrasvr.py, O-331)
  eventos/<ev>/part_<nombre>.png    las texturas de esas particulas
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

from ievr import cfgbin, g4, g4anim, sombrasvr
from ievr import evento as EV
from ievr.g4 import Glb, crc, leer_g4md, leer_g4pk, leer_g4sk, leer_g4tx, leer_vertices, mat_a_quat, u16

# Sube si cambia lo que sale: los eventos ya convertidos de otra version se rehacen solos
# (2: los materiales Grd/Threshold con su forma y su rampa, y los cuartos de mancha en espejo,
# O-323 Fase B; 3: las particulas descifradas en escena.json, O-330; 4: los sombreadores de VR
# con su material entero, sus texturas y UV, sombreadores.json y las animaciones de material
# por ranura, O-331; 5: cuando sale y se va el rotulo de VR, O-332; 6: quien es cada jugador
# (rol y copia) y el tinte de su cuerpo (auras_cuerpo, auras_def), O-345)
VERSION_EVENTO = 6
# las pistas de los jugadores y del keshin/alma (pistas_c000X01.glb, pistas_<k/a>.glb), aparte:
# son lo que mas tarda y no cambiaron con la 3 (solo escena.json, escena.glb y pistas_modelos)
VERSION_PISTAS = 2
# las del keshin o el alma (pistas_<k/a>.glb), aparte (3: el que no trae su animacion en el evento
# sale con la suya de otro evento o quieto, en vez de no salir, O-337); son pocas y rapidas
VERSION_ASIGNADO = 3
# 2: con los sombreadores del juego (dx11/shader, O-331); 3: con los rotulos en ingles (O-332);
# 4: con los tintes del cuerpo (effect_status_define y effect_define, O-345)
VERSION_INDICE = 4
FPS = 60
# los materiales de la cara que animan los eventos (G4MA tipo 32: el numero de expresion de
# los ojos, 1..3, y de la boca, 0..7; la rejilla de su atlas aun no se sabe)
CARAS = {crc(n): n for n in ("eye_10M", "mouth_10M", "eye_00M", "mouth_00M")}
MAX_TEX_EFECTO = 512        # lado maximo de las texturas de los efectos
# las texturas comunes de los efectos (las que un material usa y no trae su efecto, O-331)
TEX_COMUNES = ("dx11/effect/battle/common/effCmnTex/effCmnTex.g4tx", "dx11/effect/battle/common/effAuraTex/effAuraTex.g4tx")
MAX_TEX_ROTULO = 1024       # ancho maximo del rotulo (el de VR mide 1728x352)
IDIOMA_ROTULO = "es"
# si el rotulo no esta en espanol, en ingles (O-332: 3 de 1.249, whd01440, whd01450 y whs02740)
IDIOMA_ROTULO_OTRO = "en"

# del juego hace falta: los eventos, sus guiones (sin luces ni sonido), los efectos de los
# eventos y los comunes (auras de keshin del campo), los rotulos en espanol y los personajes
_CARPETAS = ("data/common/event/", "data/common/event_cfg/evt/", "data/common/event_cfg/eff/",
             "data/common/effect/event/", "data/common/effect/battle/common/",
             "data/dx11/effect/event/", "data/dx11/effect/battle/common/",
             "data/dx11/menu/220_img/telop_waza/%s/" % IDIOMA_ROTULO,
             "data/dx11/menu/220_img/telop_waza/%s/" % IDIOMA_ROTULO_OTRO,
             "data/common/chr/", "data/dx11/chr/", "data/dx11/shader/",
             # los tintes del cuerpo de VR (body_aura_*: el clon oscuro de Sombra de Orion, O-345)
             "data/common/effect/effect_status_define_", "data/common/effect/effect_define_")


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

    def sombras(self):
        """Los sombreadores del juego traducidos (ievr/sombrasvr.py, O-331), una vez."""
        if not hasattr(self, "_sombras"):
            self._sombras = sombrasvr.Biblioteca(self.leer, self.hay, getattr(self.juego, "ficheros", ()))
        return self._sombras

    def auras_cuerpo(self):
        """{nombre: tinte} de los tintes del cuerpo de VR (O-345), una vez: la orden AURA de un guion
        con un body_aura_* (el clon oscuro de Sombra de Orion, los clones azulados de Regate
        multiple, el brillo de muchas tecnicas) tine al jugador como dice effect_status_define
        (EFF_STATUS_DEF_INFO: nombre y tres animaciones de color de effect_define,
        EFF_COLOR_ANIM_DEF_PARAM). En el sombreador de VR (chr_toon_effstatus) son
        u_charaStatusColor (color: multiplica el del jugador), u_charaStatusRimColor (borde: el
        color del borde por su a) y u_charaStatusPowInOutDis (potencia: la x, la del borde): cada
        una [[s, r, g, b, a]...]. entra/sale: lo que tarda en ponerse y en quitarse (s)."""
        if not hasattr(self, "_auras"):
            self._auras = {}
            fs = getattr(self.juego, "ficheros", ())
            st = next((r for r in sorted(fs) if r.startswith("common/effect/effect_status_define_")), None)
            de = next((r for r in sorted(fs) if r.startswith("common/effect/effect_define_")), None)
            if st and de:
                try:
                    anims, cur = {}, None
                    for n, v in cfgbin.leer(self.leer(de)):
                        if n == "EFF_COLOR_ANIM_DEF_PARAM" and v:
                            cur = v[0]
                            anims[cur] = []
                        elif n == "EFF_COLOR_ANIM_DEF_PARAM_DATA" and cur is not None and len(v) >= 5:
                            anims[cur].append([round(float(x), 4) for x in v[:5]])
                    for n, v in cfgbin.leer(self.leer(st)):
                        if n == "EFF_STATUS_DEF_INFO" and len(v) > 16 and isinstance(v[0], str):
                            self._auras[v[0]] = {"color": anims.get(v[1], []), "borde": anims.get(v[2], []),
                                                 "potencia": anims.get(v[3], []),
                                                 "entra": round(float(v[15]), 4), "sale": round(float(v[16]), 4)}
                except (OSError, ValueError, KeyError, IndexError, TypeError):
                    self._auras = {}
        return self._auras


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


# las texturas que corren solas en bucle (O-332): el .objbin del efecto lo dice con
# CReferenceLoopAnimeComponent (el aura del keshin en el campo, 232 efectos de battle y 122 de
# event): por material (crc32 de su nombre), que ranura y que desplazamiento de UV (TRG_TYPE 10 u,
# 11 v; los demas, 6, 5, 4 y 2, sin saber) sigue a un hueso de la animacion "stand" de
# loopAnimeSet.g4pk (SRC_ANIME_BONE_CRC, SRC_TYPE 1: su traslacion x; de 0 a 1, -1, 2... en 1 s)
# a MOTION_SPEED vueltas por segundo
BUCLE_UV = "common/effect/battle/common/loopAnimeSet/loopAnimeSet.g4pk"


def _curvas_bucle(fuente):
    """{crc32 del hueso: [61 valores de su traslacion x en el clip stand]} de loopAnimeSet, una vez."""
    if not hasattr(fuente, "_curvas_bucle"):
        fuente._curvas_bucle = {}
        try:
            mt = g4anim.bancos_de(fuente.leer(BUCLE_UV))[0]
            c = mt["clips"][0]
            fot = np.arange(c["ini"], c["fin"] + 1, dtype=np.float64)
            for inf in mt["infos"][c["info_ini"]: c["info_ini"] + c["info_n"]]:
                for can in mt["canales"][inf["can_ini"]: inf["can_ini"] + inf["can_n"]]:
                    if can["tipo"] == 10 and can["k_n"]:
                        k, v = g4anim.claves_y_valores(mt, can)
                        fuente._curvas_bucle[mt["objetivos"][inf["obj"]]] = [round(float(x), 5) for x in g4anim.muestrear(k, v, fot, can["interp"])[:, 0]]
        except (OSError, ValueError, KeyError, IndexError, FileNotFoundError):
            pass
    return fuente._curvas_bucle


def uv_bucle(fuente, ruta_objbin, materiales):
    """[{material, ranura, eje "u"/"v", vel (vueltas por segundo), curva (61 valores, 60 por
    segundo)}] de un efecto (O-332); materiales: los nombres de los suyos."""
    por_crc = {crc(m): m for m in materiales}
    out, mat, params = [], None, None
    try:
        filas = list(cfgbin.leer(fuente.leer(ruta_objbin)))
    except (OSError, ValueError, KeyError, IndexError, FileNotFoundError):
        return out
    dentro, fuente_hueso = False, None
    for nom, v in filas:
        if nom == "PROP_INFO_BGN":
            dentro = v and v[0] == "CReferenceLoopAnimeComponent"
        if not dentro or nom != "PROP_PARAM" or len(v) < 2:
            continue
        if v[0] == "SRC_ANIME_BONE_CRC":
            fuente_hueso, mat, params = v[1] & 0xFFFFFFFF, None, None
        elif v[0] == "TRG_MODEL_MATERIAL_CRC":
            mat = por_crc.get(v[1] & 0xFFFFFFFF)
        elif v[0] == "SRC_TYPE":
            params = {"src": v[1]}
        elif v[0] == "TRG_TYPE" and params is not None:
            params["trg"] = v[1]
        elif v[0] == "TEX_IDX" and params is not None:
            params["ranura"] = v[1]
        elif v[0] == "MOTION_SPEED" and params is not None:
            params["vel"] = float(v[1])
            curva = _curvas_bucle(fuente).get(fuente_hueso)
            if mat and curva and params.get("src") == 1 and params.get("trg") in (10, 11):
                out.append({"material": mat, "ranura": int(params.get("ranura") or 0), "eje": "u" if params["trg"] == 10 else "v",
                            "vel": round(params["vel"], 4), "curva": curva})
            params = None
    return out


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


def material_vr(b, k):
    """El material k de un G4MD como lo usa su sombreador de VR (O-331), o None:
    {"crc": del nombre del sombreador, "color": difuso, ambiente y el tercero (12 floats),
    "params": [u_shaderParamN], "estados": {id: valor}, "ranuras": [{"tex": crc32, "uv": juego
    de UV, "smp": [escala u, escala v, giro, desplazamiento u, v]}]}.
    Tabla de materiales (0x64, 16 B): u16 color (0x66, 48 B cada uno), u16 parametros (0x6A,
    16 B cada uno), u16 estados (0x6C, en palabras de 2 B), u16 texturas (0x68, 6 B: indice en
    los crc32 de texturas, 3, juego de UV, 0, u16), u16 sombreador (byte alto: indice en los
    crc32 de 0x78), u16 (byte bajo: n parametros), u16 (byte bajo: n texturas), u16 ranuras
    (texProj, 0x8A: 5 floats cada una). Los estados son pares (id, valor) hasta que se repite
    uno: 1 prueba de alfa (2 funcion, 3 referencia/255), 4 prueba de profundidad, 5 escribir
    profundidad, 6 mezcla (7 operacion, 9 origen, 10 destino), 14 recortar las caras de atras.
    Sacado de los 56.457 materiales de los efectos de VR (nota O-331)."""
    try:
        base = u16(b, 0x0A) * 4

        def tabla(o):
            return base + u16(b, o) * 4
        v = struct.unpack_from("<8H", b, tabla(0x64) + k * 16)
        out = {"crc": "%08x" % struct.unpack_from("<I", b, tabla(0x78) + (v[4] >> 8) * 4)[0],
               "color": [round(x, 5) for x in struct.unpack_from("<12f", b, tabla(0x66) + v[0] * 48)],
               "params": [[round(x, 5) for x in struct.unpack_from("<4f", b, tabla(0x6A) + (v[1] + j) * 16)]
                          for j in range(v[5] & 0xFF)]}
        est, p, fin = {}, tabla(0x6C) + v[2] * 2, tabla(0x6E)
        while p + 1 < len(b) and (p < fin or fin <= tabla(0x6C)):
            ide, val = b[p], b[p + 1]
            if ide in est or (ide == 0 and val == 0):
                break
            est[ide] = val
            p += 2
        out["estados"] = {str(i): x for i, x in est.items()}
        hashes = struct.unpack_from("<%dI" % b[0x27], b, tabla(0x76))
        out["ranuras"] = []
        for j in range(v[6] & 0xFF):
            r = b[tabla(0x68) + (v[3] + j) * 6: tabla(0x68) + (v[3] + j) * 6 + 6]
            out["ranuras"].append({"tex": hashes[r[0]] if r[0] < len(hashes) else 0, "uv": r[2],
                                   "smp": [round(x, 5) for x in struct.unpack_from("<5f", b, tabla(0x8A) + (v[7] + j) * 20)]})
        return out
    except (struct.error, IndexError):
        return None


def _uvs_y_mas(md, mg, m):
    """Lo que los sombreadores de VR leen ademas de lo de siempre (O-331): los juegos de UV 1..5
    (elementos 11..15 con formato de UV), el segundo color (9) y la tangente (3)."""
    nv, z = m["nv"], m["zancada"]
    lay = md["layouts"][m["layout"]]
    crudo = np.frombuffer(mg, np.uint8, nv * z, m["vo"]).reshape(nv, z)

    def campo(off, dtype, n):
        return crudo[:, off:off + np.dtype(dtype).itemsize * n].copy().view(dtype).reshape(nv, n)
    out = {}
    for k in range(1, 6):
        if 10 + k not in lay:
            continue
        off, fmt = lay[10 + k]
        if fmt in (2, 3):
            out["uv%d" % k] = campo(off, "<f4", 2).astype(np.float32)
        elif fmt == 18:
            out["uv%d" % k] = (campo(off, "<i2", 2) / 32767.0).astype(np.float32)
        elif fmt == 12:
            out["uv%d" % k] = (campo(off, "u1", 2) / 255.0).astype(np.float32)
        elif fmt == 14:
            out["uv%d" % k] = (campo(off, "<u2", 2) / 65535.0).astype(np.float32)
    if 9 in lay and lay[9][1] == 12:
        out["color1"] = (campo(lay[9][0], "u1", 4) / 255.0).astype(np.float32)
    if 3 in lay and lay[3][1] == 20:
        t = campo(lay[3][0], "<i2", 4).astype(np.float32) / 32767.0
        lon = np.linalg.norm(t[:, :3], axis=1, keepdims=True)
        t[:, :3] = t[:, :3] / np.where(lon < 1e-6, 1, lon)
        t[:, 3] = np.where(t[:, 3] < 0, -1.0, 1.0)
        out["tangente"] = t.astype(np.float32)
    return out


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
        self.sombras = None      # la biblioteca de sombreadores de VR (O-331)
        self.sombreadores = set()

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

    def _textura(self, h, por_hash, max_tex):
        """El indice de textura glTF de la textura `h` (una vez); los cuartos de mancha, en espejo
        (O-323 Fase B)."""
        g = self.g
        if h not in self.tex:
            png, alfa = g4.dds_a_png(por_hash[h][1], max_tex)
            self.tex[h] = (g.imagen_png(png), alfa)
            try:
                cuarto = es_cuarto(por_hash[h][1])
            except (ValueError, OSError, IndexError):
                cuarto = False
            if cuarto:
                if "_espejo" not in self.tex:
                    g.j["samplers"].append({"magFilter": 9729, "minFilter": 9987, "wrapS": 33648, "wrapT": 33648})
                    self.tex["_espejo"] = len(g.j["samplers"]) - 1
                g.j["textures"][self.tex[h][0]]["sampler"] = self.tex["_espejo"]
        return self.tex[h][0]

    def _vr(self, vr, por_hash, max_tex):
        """Lo de un material para su sombreador de VR (O-331): el nombre del sombreador y, por
        ranura, su textura glTF; None si el sombreador no se pudo traducir."""
        if not vr or not self.sombras:
            return None
        nombre = self.sombras.nombre_de_crc(vr["crc"])
        if not nombre or "error" in self.sombras.programa(nombre):
            return None
        self.sombreadores.add(nombre)
        out = {k: vr[k] for k in ("color", "params", "estados")}
        out["sombreador"] = nombre
        out["ranuras"] = [{"textura": self._textura(r["tex"], por_hash, max_tex) if r["tex"] in por_hash else -1,
                           "uv": r["uv"], "smp": r["smp"]} for r in vr["ranuras"]]
        return out

    def _material_efecto(self, mat, mezcla, por_hash, max_tex, vr=None):
        g = self.g
        vr = self._vr(vr, por_hash, max_tex)
        # el mismo nombre de material puede ir con otras texturas (u otros parametros) en otro
        # efecto del evento
        clave = (mat["nombre"], mezcla, tuple(mat["tex"]), json.dumps(vr, sort_keys=True))
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
            gm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": self._textura(h, por_hash, max_tex)}
            gm["extras"]["textura"] = por_hash[h][0]
            gm["extras"]["ranura"] = mat["tex"].index(h)
            self.ranura[mat["nombre"]] = mat["tex"].index(h)
        if mezcla == "contorno":
            gm["pbrMetallicRoughness"]["baseColorFactor"] = [0.05, 0.03, 0.02, 1.0]
        if vr:
            gm["extras"]["vr"] = vr
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
                vr = material_vr(md_b, m["mat"]) if es_efecto else None
                nom_vr = self.sombras.nombre_de_crc(vr["crc"]) if vr and self.sombras else None
                con_vr = bool(nom_vr) and "error" not in self.sombras.programa(nom_vr)
                # (con el sombreador de VR lo hincha el: SolidToon1, u_shaderParam4.y)
                if es_efecto and not con_vr and "nor" in v and mezcla_de(mat_g4["nombre"], m["nombre"]) == "contorno":
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
                    # en los solidos el color de vertice no es color (la mano salia roja); los
                    # sombreadores de VR si lo leen (O-331)
                    if "color" in v and (mezcla in ("suma", "normal") or con_vr):
                        atrib["COLOR_0"] = g.accesor(v["color"], "VEC4", 34962)
                    if con_vr:
                        mas = _uvs_y_mas(md, mg, m)
                        ultimo = max([int(x[2:]) for x in mas if x.startswith("uv")] or [0])
                        for k in range(1, ultimo + 1):
                            uvk = mas.get("uv%d" % k, v.get("uv"))
                            if uvk is not None:
                                atrib["TEXCOORD_%d" % k] = g.accesor(uvk, "VEC2", 34962)
                        if "color1" in mas:
                            atrib["COLOR_1"] = g.accesor(mas["color1"], "VEC4", 34962)
                        if "tangente" in mas:
                            atrib["TANGENT"] = g.accesor(mas["tangente"], "VEC4", 34962)
                    mat = self._material_efecto(mat_g4, mezcla, por_hash, min(max_tex, MAX_TEX_EFECTO),
                                                vr if con_vr else None)
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


# O-337: el keshin o el alma que el guion anima en un corte y el juego no trae (12 keshin, 34 almas
# y 31 armaduras de VR en su evento de invocacion: no salian en ella). Los huesos que dicen por
# donde va (sube del suelo y se pone detras del jugador)
_COLOCAR = ("c_global_0_0", "c_c_1_0")


def _clip_de_otro_evento(fuente, codigo):
    """(G4MT, clip, None) de la animacion de VR del keshin o alma `codigo` en otro evento (el
    primero que la traiga: la de su supertecnica), o None (O-337)."""
    pat = re.compile(r"common/event/ev\d\d/[^/]+/[^/]+_%s_s\d\d_p\d\d_c\d+\.g4pk$" % re.escape(codigo))
    ficheros = getattr(getattr(fuente, "juego", None), "ficheros", None) or {}
    for r in sorted(k for k in ficheros if pat.match(k)):
        c = _clip_de(fuente, r)
        if c:
            return c[0], c[1], None
    return None


def _donante(fuente, patron, corte, codigo):
    """(G4MT, clip, sk, reposo) de otro keshin (o alma, por la letra de `codigo`) que si trae su
    animacion en ese corte del evento (patron: el de ANIM_DE_CORTE), o None (O-337)."""
    exp = re.escape(patron).replace(re.escape("<CHARA>"), r"(%s\d{6})_s\d\d_p\d\d" % re.escape(codigo[:1]))
    pat = re.compile("^" + exp.replace(re.escape("<CUT>"), re.escape(corte)) + "$")
    ficheros = getattr(getattr(fuente, "juego", None), "ficheros", None) or {}
    for r in sorted(ficheros):
        m = pat.match(r)
        if not m or m.group(1) == codigo:
            continue
        c, sk_r = _clip_de(fuente, r), ruta_de_modelo(fuente, m.group(1))
        if c and sk_r:
            sk, rep = fuente.esqueleto(sk_r)
            return c[0], c[1], sk, rep
    return None


def _pistas_parecidas(fuente, patron, corte, codigo, sk, reposo, fr, cache):
    """O-337: las pistas del keshin o alma `codigo` en un corte de un evento en el que el juego no
    trae su animacion (fr: sus fotogramas, a 60 por segundo): el cuerpo con los giros de la suya de
    otro evento (la de su supertecnica; solo los giros: esas esconden partes con escala 0 y las
    mandan lejos) o en reposo, y por donde va (_COLOCAR) lo de otro keshin o alma que si la trae en
    ese corte (lo que se mueve desde su reposo). -> {hueso: {"translation", ...}}"""
    nf, pistas = len(fr), {}
    if "propio" not in cache:
        cache["propio"] = _clip_de_otro_evento(fuente, codigo)
    propio = cache["propio"]
    if propio:
        fot, p0, _sin = g4anim.pistas_de_clip(propio[0], propio[1], sk, reposo)
        idx = np.round(fr * (propio[1]["fps"] or FPS) / FPS).astype(int) % len(fot)
        pistas = {i: {"rotation": np.asarray(d["rotation"])[idx], "translation": np.tile(np.asarray(reposo[i][0], np.float64), (nf, 1)),
                      "scale": np.tile(np.asarray(reposo[i][2], np.float64), (nf, 1))} for i, d in p0.items() if sk["padres"][i] >= 0}
    if ("donante", corte) not in cache:
        cache[("donante", corte)] = _donante(fuente, patron, corte, codigo)
    don = cache[("donante", corte)]
    pd = g4anim.pistas_de_clip(don[0], don[1], don[2], don[3])[1] if don else {}
    for nombre in _COLOCAR:
        if nombre not in sk["nombres"]:
            continue
        i = sk["nombres"].index(nombre)
        t0, q0, s0 = (np.asarray(x, np.float64) for x in reposo[i])
        v = dict(pistas.get(i) or {"rotation": np.tile(q0, (nf, 1)), "scale": np.tile(s0, (nf, 1))})
        v["translation"] = np.tile(t0, (nf, 1))
        k = don[2]["nombres"].index(nombre) if don and nombre in don[2]["nombres"] else None
        if k is not None and k in pd:
            tr = pd[k]["translation"]
            idx = np.minimum(np.round(fr * (don[1]["fps"] or FPS) / FPS).astype(int), len(tr) - 1)
            # (lo que se mueve desde su reposo; lo alto, a la escala de cada uno por la altura de su
            # centro: un alma pequena con el de otra grande se hundia en el suelo y no se veia; y la
            # que lo tiene en el suelo (Delfinus), a la altura del otro)
            t0d = np.asarray(don[3][k][0], np.float64)
            esc = min(2.0, max(0.0, t0[1] / t0d[1])) if t0d[1] > 0.1 else 1.0
            d = tr[idx] - t0d[None, :]
            d[:, 1] *= esc
            v["translation"] = t0[None, :] + d
            if t0[1] < 0.3:
                v["translation"][:, 1] = tr[idx][:, 1]
        pistas[i] = v
    return pistas


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
            # el primero de cada tipo: en G4MA el 16 de la ranura 0 (difuso) va antes que el de
            # la 1 (ambiente); antes el segundo pisaba al primero (O-331)
            out.setdefault(nm, {}).setdefault(c["tipo"], [round(float(x), 4) for x in s])
    return out


def _muestras_vr(mt, clip, nombres):
    """{nombre: {(tipo, ranura): [valores por fotograma]}} de un G4MA/G4TP (O-331)."""
    fot = np.arange(clip["ini"], clip["fin"] + 1, dtype=np.float64)
    out = {}
    for inf in mt["infos"][clip["info_ini"]: clip["info_ini"] + clip["info_n"]]:
        h = mt["objetivos"][inf["obj"]]
        if h not in nombres:
            continue
        for c in mt["canales"][inf["can_ini"]: inf["can_ini"] + inf["can_n"]]:
            if not c["k_n"]:
                continue
            k, v = g4anim.claves_y_valores(mt, c)
            s = g4anim.muestrear(k, v, fot, c["interp"])[:, 0]
            out.setdefault(nombres[h], {})[(c["tipo"], c.get("ranura", 0))] = [round(float(x), 4) for x in s]
    return out


def _quieta(lista):
    """Una lista por fotograma; si no cambia, solo su valor (escena.json ocupa menos)."""
    return [lista[0]] if lista and all(x == lista[0] for x in lista) else lista


def _materiales_vr(ma, tp, clip_nombre, mats, ranuras_tp):
    """{material: {"d": [x, y, z, w] difuso, "a": ambiente, "p": {N: parametro N}, "t": {N:
    {"su", "sv", "rot", "tu", "tv"}}}} por fotograma de un clip de un efecto (O-331): G4MA
    16..19 de la ranura 0 (difuso) y 1 (ambiente), 32..35 del parametro N (la ranura); G4TP
    1/2 escala, 8 giro y 10/11 desplazamiento de la textura N. Lo que no se anima va a null."""
    out = {}
    if ma:
        c2 = next((c for c in ma["clips"] if c["nombre"] == clip_nombre), None)
        if c2:
            for nm, canales in _muestras_vr(ma, c2, mats).items():
                d = out.setdefault(nm, {})
                for (tipo, ranura), lista in canales.items():
                    if 16 <= tipo <= 19 and ranura in (0, 1):
                        d.setdefault("d" if ranura == 0 else "a", [None] * 4)[tipo - 16] = _quieta(lista)
                    elif 32 <= tipo <= 35:
                        d.setdefault("p", {}).setdefault(str(ranura), [None] * 4)[tipo - 32] = _quieta(lista)
    if tp:
        c2 = next((c for c in tp["clips"] if c["nombre"] == clip_nombre), None)
        if c2:
            for nm, canales in _muestras_vr(tp, c2, ranuras_tp).items():
                mat, _, n = nm.partition("#tex")
                t = out.setdefault(mat, {}).setdefault("t", {}).setdefault(n, {})
                for (tipo, _r), lista in canales.items():
                    clave = {1: "su", 2: "sv", 8: "rot", 10: "tu", 11: "tv"}.get(tipo)
                    if clave:
                        t[clave] = _quieta(lista)
    return {k: v for k, v in out.items() if v}


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
    # el aura del keshin en el campo: sus clips in/loop/out como cortes (O-332)
    if es_aura(nombre):
        return convertir_aura(nombre, destino, fuente, informe)
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

    def pistas_actor(mj, actor, clave, real, sk_ruta, tipo=None, caras=None, parecido=None):
        sk, reposo = fuente.esqueleto(sk_ruta)
        mj.esqueleto(clave, sk, reposo)
        hechos = []
        for corte in cortes:
            c = anim_actor(actor, real, corte)
            patron = ev["anim"].get((actor, corte[0]))
            if not c and parecido is not None and patron:
                # O-337: el keshin o el alma que el guion anima en este corte y el juego no trae: lo
                # mas parecido de VR (_pistas_parecidas), donde lo pone el guion (antes no salia)
                desde = _reproducir(ev, actor).get(corte[0], (None, 0))[1]
                fr = np.arange(0, max(2, corte[2] - corte[1] - desde) + 1, 2, dtype=np.float64)
                t = (fr + desde) / FPS
                pistas = parecido(patron, corte[0], sk, reposo, fr)
                if not mj.pistas(clave, corte[0], t, _locales(sk, reposo, pistas, len(fr)), puntos.ancla(actor, corte, t * FPS, tipo)):
                    # (quieto del todo: al menos su raiz, para que salga)
                    r0 = next(i for i in range(sk["n"]) if sk["padres"][i] < 0)
                    mj.pista(corte[0], mj.obj[clave]["base"] + r0, "translation", t, np.tile(np.asarray(reposo[r0][0], np.float64), (len(t), 1)))
                hechos.append(corte[0])
                continue
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
    roles = EV.roles(ev)
    for a, d in actores.items():
        t = EV.tipo_de_actor(a, d.get("carga"))
        if not t:
            continue
        cl = EV.clave(a)
        info = {"tipo": t, "plantilla": a}
        # quien es cada jugador (O-345): "h0" el que la hace, "h1".. sus companeros, "r0" el rival,
        # "r1".. los otros; copia: el actor del que es copia (el mismo jugador otra vez)
        if t == "personaje" and cl in roles:
            info["rol"] = roles[cl][0]
            if roles[cl][1]:
                info["copia"] = roles[cl][1]
        if t in ("modelo", "balon"):
            info["modelo"] = EV.modelo_de_actor(a, d.get("carga"))
            modelos_usados.add(info["modelo"])
        info_actores[cl] = info

    # 1) los jugadores: unas pistas por tipo de cuerpo
    personajes = [a for a in actores if EV.tipo_de_actor(a) == "personaje"]
    for tipo in tipos:
        cuerpo = EV.cuerpo(tipo)
        ruta = os.path.join(carpeta, "pistas_%s.glb" % cuerpo)
        if not personajes or _al_dia_glb(ruta, VERSION_PISTAS):
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
        mj.guardar(ruta, {"version": VERSION_PISTAS, "evento": nombre, "cuerpo": cuerpo,
                          "actores": por_actor, "caras": caras}, orden_cortes)
        informe("  %s -> pistas_%s.glb (%.2f MB)" % (nombre, cuerpo, os.path.getsize(ruta) / 1e6))

    # 2) el keshin o el alma que pone el juego (<ASSIGN>)
    asignables = [a for a in actores if EV.tipo_de_actor(a) == "asignado"]
    for asg in asignados if asignables else ():
        ruta = os.path.join(carpeta, "pistas_%s.glb" % asg)
        if _al_dia_glb(ruta, VERSION_ASIGNADO):
            continue
        sk_ruta = ruta_de_modelo(fuente, asg)
        if not sk_ruta:
            informe("  %s: no encuentro el modelo de %s" % (nombre, asg))
            continue
        mj = Montaje()
        por_actor = {}
        # (sin la suya en el evento: lo mas parecido de VR, buscado una vez, O-337)
        cache = {}

        def parecido(patron, corte, sk, reposo, fr, asg=asg, cache=cache):
            return _pistas_parecidas(fuente, patron, corte, asg, sk, reposo, fr, cache)
        for a in asignables:
            por_actor[EV.clave(a)] = pistas_actor(mj, a, EV.clave(a), EV.rellenar(a, asignado=asg), sk_ruta, parecido=parecido)
        mj.guardar(ruta, {"version": VERSION_ASIGNADO, "evento": nombre, "asignado": asg, "actores": por_actor},
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
    # los rotulos de VR que saca (O-332): los fijos y los del keshin o alma que pone el juego
    # (<CHARA_ID>: whd01400_a000040 en las tecnicas de alma, el keshin en la armadura); los del mixi
    # max, el modo y el despertar van con su espiritu (pedidos_de)
    for r in EV.rotulos_en_pantalla(ev):
        if "<" not in r["rotulo"]:
            nombres = [r["rotulo"]]
        elif "<" not in r["rotulo"].replace("<CHARA_ID>", ""):
            nombres = [r["rotulo"].replace("<CHARA_ID>", a) for a in asignados if a]
        else:
            nombres = []
        for n in nombres:
            try:
                convertir_rotulo(n, destino, fuente)
            except (OSError, ValueError, KeyError, IndexError) as e:
                informe("  rotulo %s: %s" % (n, e))
    return {"carpeta": carpeta, "modelos": sorted(modelos_usados), "rotulo": EV.nombre_del_rotulo(ev["rotulo"])}


def _escena(nombre, ev, fuente, puntos, carpeta, actores, info_actores, informe):
    """escena.glb (camara y efectos), sombreadores.json y lo de escena.json."""
    mj = Montaje()
    mj.sombras = fuente.sombras()
    cortes = ev["cortes"]
    out = {"version": VERSION_EVENTO, "evento": nombre, "fps": FPS,
           "cortes": [{"nombre": c[0], "ini": c[1], "fin": c[2]} for c in cortes],
           "duracion": round(EV.duracion(ev) / FPS, 3), "rotulo": ev["rotulo"] or "",
           "rotulo_png": EV.nombre_del_rotulo(ev["rotulo"]) if "<" not in (ev["rotulo"] or "") else "",
           # cuando sale y se va cada rotulo de VR (fotogramas del evento, O-332)
           "rotulos": EV.rotulos_en_pantalla(ev),
           "visible": {}, "camara": {}, "efectos": {}, "materiales": {}, "mallas": {},
           "auras": [[fr, EV.clave(a), n] for fr, a, n in ev["auras"]], "particulas": {},
           "efectos_comunes": sorted(set(ev["efectos_comunes"])),
           # el elemento de la tecnica: el color de las particulas del aura del balon (O-330)
           "elemento": elemento_de_evento(nombre)}
    # O-345: el tinte del cuerpo de cada jugador (AURA con un body_aura_*: el clon oscuro de Sombra
    # de Orion): [[fotograma, nombre, 0 sale / 1 se va]] por actor, y como es cada uno (auras_def)
    defs = fuente.auras_cuerpo() if ev.get("auras_cuerpo") else {}
    ac = {}
    for fr, a, n, on in ev.get("auras_cuerpo") or []:
        if EV.tipo_de_actor(a) == "personaje" and n in defs:
            ac.setdefault(EV.clave(a), []).append([int(fr), n, int(on)])
    out["auras_cuerpo"] = ac
    out["auras_def"] = {n: defs[n] for n in sorted({x[1] for lista in ac.values() for x in lista})}
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
            # las texturas que corren en bucle (O-332)
            uv = uv_bucle(fuente, d["carga"], mj.obj[cl]["mats"]) if cl in mj.obj else []
            if uv:
                out.setdefault("uv_bucle", {})[cl] = uv
        except (ValueError, IndexError, KeyError, OSError) as e:
            # un efecto que no se entiende no tira el evento entero
            informe("  efecto %s: no se pudo (%s: %s)" % (a, type(e).__name__, e))
            mj.obj.pop(cl, None)
            info_actores.pop(cl, None)
    mj.guardar(os.path.join(carpeta, "escena.glb"), {"version": VERSION_EVENTO, "evento": nombre},
               [c[0] for c in cortes])
    # los sombreadores de VR de sus materiales, traducidos (O-331); la pagina los busca por el
    # nombre que lleva cada material (extras.vr.sombreador)
    _escribir_json(os.path.join(carpeta, "sombreadores.json"),
                   {"version": sombrasvr.VERSION, "programas": {n: mj.sombras.programa(n) for n in sorted(mj.sombreadores)}})
    out["sombreadores"] = sorted(mj.sombreadores)
    return out


def _efecto(mj, cl, actor, pk, ptlb, ev, fuente, puntos, out, info_actores, informe, carpeta):
    p = fuente.pkm(pk)
    base = pk[:-len(".g4pkm")]
    sk = leer_g4sk(p["G4SK"])
    reposo = _reposo(sk)
    o = mj.esqueleto(cl, sk, reposo, ancla=True)
    if "G4MD" in p and fuente.hay(base + ".g4mg"):
        tex = _textura_de(base)
        # las texturas comunes de los efectos van primero: las del efecto, si se llaman igual,
        # mandan (O-331: la rampa de elementos del aura del balon, BallAura0010, esta en effCmnTex)
        texs = [fuente.leer(r) for r in TEX_COMUNES if fuente.hay(r)]
        texs += [fuente.leer(tex)] if fuente.hay(tex) else []
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
            # (en los efectos la escala va relativa al padre, O-332)
            fot, pistas, _sin = g4anim.pistas_de_clip(mt, clip, sk, reposo, escala_propia=False)
            locales = _locales(sk, reposo, pistas, len(fot))
        ancla = puntos.ancla(actor, corte, t * FPS, None)
        mj.pistas(cl, corte_nombre, t, locales, ancla)
        info["clips"][corte_nombre] = {"clip": clip_nombre, "desde": desde, "fotogramas": nf}
        # opacidad, colores, parametros y UV de cada material por fotograma (O-331: por ranura;
        # la pagina saca de ahi tambien lo de antes)
        anim = _materiales_vr(ma, tp, clip_nombre, mats, ranuras)
        if anim:
            out["materiales"].setdefault(corte_nombre, {})[cl] = anim
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


# --------------------------------------------------------------------------- particulas (O-330)
# Los emisores de particulas de VR (.ptlb, T2B): un bloque PARTICLE_INFO_BGN..END por emisor.
# Lo que dice cada numero salio de comparar los 1.642 emisores de los 582 .ptlb del juego (los
# tiempos van de 0 a 1 de la vida; las curvas son [n, valores, tiempos] y las de tres ejes van
# como x(n), y(n), z(n)) y de mirarlo al lado de los videos de VR (nota O-330). Lo que aun no se
# sabe va en "sin_saber" tal cual.
ELEMENTOS_AURA = ("Montana", "Viento", "Fuego", "Bosque", "")   # columnas de BallAura0010
_RAMPAS_AURA = {}


def _n(v, i, defecto=0.0):
    """El numero v[i] (o `defecto` si no esta o no es numero)."""
    try:
        x = v[i]
    except (IndexError, TypeError):
        return defecto
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else defecto


def _cuantas(v, i, tope=64):
    return max(0, min(int(_n(v, i, 0)), tope))


def _curva_simple(v, i, invertir=False):
    """[[t, valor]...] de una curva [n, valores(n), tiempos(n)] que empieza en v[i]."""
    n = _cuantas(v, i)
    out = [[round(_n(v, i + 1 + n + k), 5), round(1 - _n(v, i + 1 + k, 1) if invertir else _n(v, i + 1 + k, 1), 5)]
           for k in range(n)]
    return sorted(out, key=lambda x: x[0])


def _tres(v, p, n, k, defecto=1.0):
    """La clave k de una curva de tres ejes guardada como x(n), y(n), z(n) desde v[p]."""
    return [round(_n(v, p + k, defecto), 5), round(_n(v, p + n + k, defecto), 5), round(_n(v, p + 2 * n + k, defecto), 5)]


def emisor_vr(e):
    """Un emisor de VR ({bloque: [numeros]} de un PARTICLE_INFO) con su significado, para la
    pagina (web/partido-particulasvr.js). Los tiempos en segundos; los angulos en grados."""
    E = e.get("EMITTER_INFO") or []
    L = e.get("LIFE_TIME_INFO") or []
    C = e.get("COLOR_INFO") or []
    S = e.get("SPEED_INFO") or []
    X = e.get("SCALE_INFO") or []
    R = e.get("ROTATION_INFO") or []
    F = e.get("FORCE_FIELD_INFO") or []
    M = e.get("MODEL_INFO") or []
    SH = e.get("SHAPE_INFO") or []
    MAT = e.get("MATERIAL_INFO") or []
    MO = e.get("MOTION_INFO") or []
    # MOTION_INFO [n, clips del efecto en que sale (n), m, (clip, segundos) x m]: los m son
    # los clips en que se borran las que queden, a esos segundos de empezar
    n = _cuantas(MO, 0)
    clips = [x for x in MO[1:1 + n] if isinstance(x, str)]
    m = _cuantas(MO, 1 + n)
    parar = []
    for k in range(m):
        c = MO[2 + n + 2 * k] if 2 + n + 2 * k < len(MO) else None
        if isinstance(c, str):
            parar.append([c, round(_n(MO, 3 + n + 2 * k), 5)])
    # LIFE_TIME_INFO [al azar, min, max, ?]: la vida de cada una (con el 0, siempre la min)
    vida = sorted([_n(L, 1, 0.5), _n(L, 2, 0.5)]) if _n(L, 0) else [_n(L, 1, 0.5)] * 2
    # COLOR_INFO [na, transparencia(na) (la curva va al reves: 0 = se ve entera), tiempos(na),
    # nc, rgb(3 nc), tiempos(nc), al azar, transparencia 2 (na), al azar, rgb 2 (3 nc)]: con el
    # azar, cada una sale entre la curva y la 2. Los colores pasan de 1 (brillan)
    na = _cuantas(C, 0)
    p = 1 + 2 * na
    nc = _cuantas(C, p)
    q = p + 1 + 4 * nc
    alfa = sorted([[round(_n(C, 1 + na + k), 5), round(1 - _n(C, 1 + k), 5), round(1 - _n(C, q + 1 + k), 5)]
                   for k in range(na)], key=lambda x: x[0])
    rgb = sorted([[round(_n(C, p + 1 + 3 * nc + k), 5)] + _tres(C, p + 1, nc, k) + _tres(C, q + 2 + na, nc, k)
                  for k in range(nc)], key=lambda x: x[0])
    # SPEED_INFO [al azar, min, max, n, multiplicador(n), tiempos(n)] (m/s; el multiplicador
    # con la vida: casi todas frenan)
    vel = [_n(S, 1), _n(S, 2)] if _n(S, 0) else [_n(S, 1)] * 2
    # SCALE_INFO [al azar, min xyz, max xyz, azar entre curvas, el mismo azar en los tres
    # ejes, curva por eje (si no, la x para todo), n, x(n), y(n), z(n), tiempos(n), x2, y2, z2]
    ne = _cuantas(X, 10)
    te = [_n(X, 11 + 3 * ne + k) for k in range(ne)]
    escala = sorted([[round(te[k], 5)] + _tres(X, 11, ne, k) + _tres(X, 11 + 4 * ne, ne, k) for k in range(ne)],
                    key=lambda x: x[0])
    esc_min = [_n(X, 1, 1), _n(X, 2, 1), _n(X, 3, 1)]
    esc_max = [_n(X, 4, 1), _n(X, 5, 1), _n(X, 6, 1)] if _n(X, 0) else esc_min
    out = {
        "clips": clips, "parar": parar,
        # EMITTER_INFO [segundos que emite, en bucle, retraso, ?, ?, ?, cuantas a la vez como
        # mucho, por metro (en vez de por segundo: las estelas), ritmo, ?, curva del ritmo]
        "dur": _n(E, 0, 0.1), "bucle": int(_n(E, 1)), "retraso": _n(E, 2), "max": _n(E, 6, 20),
        "por_metro": int(_n(E, 7)), "ritmo": _n(E, 8, 10), "ritmo_curva": _curva_simple(E, 10),
        "vida": [round(x, 5) for x in vida],
        # SHAPE_INFO [0 bola, 1 aro, 2 cono; radio (m), apertura del cono (grados), escala xyz,
        # ?, ?]: salen de esa forma en el hueso (con su escala), hacia fuera / por el eje +Y
        "forma": {"tipo": int(_n(SH, 0)), "radio": _n(SH, 1), "angulo": _n(SH, 2, 30),
                  "escala": [_n(SH, 3, 1), _n(SH, 4, 1), _n(SH, 5, 1)]},
        "vel": [round(x, 5) for x in vel], "vel_curva": _curva_simple(S, 3),
        # FORCE_FIELD_INFO [gravedad (m/s2; las negativas suben: humo, llamitas), ...]
        "gravedad": _n(F, 0),
        # MODEL_INFO [?, ancho, alto (m), 1 mira a la camara / 2 a lo largo de su velocidad
        # (chispas, rayas) / 0 plana, ..., estirar con la velocidad]
        "tam": [_n(M, 1, 0.1), _n(M, 2, 0.1)], "orienta": int(_n(M, 3, 1)), "estira": int(_n(M, 10)),
        "esc_min": esc_min, "esc_max": esc_max, "esc_curvas_azar": int(_n(X, 7)),
        "esc_mismo_azar": int(_n(X, 8, 1)), "esc_por_eje": int(_n(X, 9)), "escala": escala,
        # [t, a, a2] y [t, r, g, b, r2, g2, b2]
        "alfa": alfa, "alfa_azar": int(_n(C, q)), "rgb": rgb, "rgb_azar": int(_n(C, q + 1 + na)),
        # ROTATION_INFO [al azar, giro inicial xyz, cuanto al azar xyz, gira, velocidad min xyz,
        # max xyz (grados/s), ?, ?]: solo cuenta el de la pantalla (z)
        "giro": [_n(R, 3), _n(R, 6) if _n(R, 0) else 0],
        "giro_vel": [_n(R, 10), _n(R, 13)] if _n(R, 7) else [0, 0],
        # MATERIAL_INFO [9]: 2 suma luz (casi todas), 3 mezcla normal
        "mezcla": "normal" if _n(MAT, 9) == 3 else "suma",
        "sombreador": MAT[11] if len(MAT) > 11 and isinstance(MAT[11], str) else "",
        "sin_saber": {"emisor": [_n(E, 3), _n(E, 4), _n(E, 5), _n(E, 9)], "fuerza": list(F[1:]),
                      "forma": list(SH[6:8]), "material": [_n(MAT, 6), _n(MAT, 8), _n(MAT, 10)]},
    }
    return out


def _uv_vr(U):
    """UV_INFO de una textura: [modo (0 entera, 1 una casilla al azar, 2 animada con la vida),
    columnas, filas, vueltas en la vida, fila al azar]."""
    modo = int(_n(U, 10))
    return [modo, max(1, int(_n(U, 11, 1))) if modo else 1, max(1, int(_n(U, 12, 1))) if modo else 1,
            _n(U, 13, 1) or 1, int(_n(U, 14))]


def rampas_aura(fuente):
    """Los colores del aura del balon (BallAura0010 de effCmnTex: una columna por elemento, de
    blanco arriba al color abajo), 8 por elemento, 0..1."""
    if _RAMPAS_AURA:
        return _RAMPAS_AURA
    r = "dx11/effect/battle/common/effCmnTex/effCmnTex.g4tx"
    try:
        dds = dict(leer_g4tx(fuente.leer(r))).get("BallAura0010") if fuente.hay(r) else None
        im = g4.dds_a_imagen(dds).convert("RGB") if dds else None
    except (OSError, ValueError, KeyError, struct.error):
        im = None
    if im is None:
        return {}
    for x, elem in enumerate(ELEMENTOS_AURA):
        _RAMPAS_AURA[elem] = [[round(c / 255, 3) for c in im.getpixel((min(x, im.width - 1), round(k * (im.height - 1) / 7)))]
                              for k in range(8)]
    return _RAMPAS_AURA


_ELEMENTOS_EV = {}


def elemento_de_evento(nombre):
    """El elemento de la supertecnica de ese evento (Fuego, Viento, Bosque, Montana) por
    eventos-tecnicas.csv y tecnicas.csv, o "" (invocaciones, sin elemento, sin tablas)."""
    if not _ELEMENTOS_EV:
        try:
            from ievr import reglas
            elem = {f["nombre_interno"]: f.get("elemento") or "" for f in reglas._tabla("tecnicas.csv")}
            for f in reglas._tabla("eventos-tecnicas.csv"):
                for ev in (f.get("evento"), f.get("evento_fallo")):
                    if ev and elem.get(f["interno"]) and not _ELEMENTOS_EV.get(ev):
                        _ELEMENTOS_EV[ev] = elem[f["interno"]]
        except (OSError, KeyError, ValueError):
            pass
        _ELEMENTOS_EV.setdefault("", "")
    return _ELEMENTOS_EV.get(nombre, "")


def _png_particula(fuente, archivo, nombre_tex, base_efecto, carpeta, texturas):
    """(part_<nombre>.png, tiene alfa) de una textura de particula, o ("", False): la del
    efecto o, con "#/", otra de dx11/."""
    if not isinstance(nombre_tex, str) or not nombre_tex:
        return "", False
    g4tx = "dx11/" + archivo[2:] if isinstance(archivo, str) and archivo.startswith("#/") else _textura_de(base_efecto)
    png = "part_%s.png" % re.sub(r"[^A-Za-z0-9_]", "_", nombre_tex)[:50]
    ruta = os.path.join(carpeta, png)
    clave = (g4tx, nombre_tex)
    if clave in texturas:
        return texturas[clave]
    if g4tx not in texturas:
        texturas[g4tx] = dict(leer_g4tx(fuente.leer(g4tx))) if fuente.hay(g4tx) else {}
    dds = texturas[g4tx].get(nombre_tex)
    if dds is None:
        texturas[clave] = ("", False)
        return texturas[clave]
    datos, alfa = g4.dds_a_png(dds, 256)
    with open(ruta, "wb") as fh:
        fh.write(datos)
    texturas[clave] = (png, bool(alfa))
    return texturas[clave]


def _particulas(fuente, ptlb, base_efecto, carpeta):
    """Los emisores de particulas (.ptlb) de un efecto, descifrados (emisor_vr) para la pagina
    (web/partido-particulasvr.js, O-330). Por emisor ademas: el hueso del efecto donde nacen
    (PARTICLE_NODE_INFO, uno por emisor y en el mismo orden; en escena.glb "<efecto>|<hueso>"),
    su textura (part_<nombre>.png en la carpeta del evento) con su hoja de fotogramas (UV_INFO)
    y, en las del aura del balon (Effect_BallAura1), los colores de cada elemento: alli la
    primera textura es esa rampa y la forma es la segunda."""
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
        d = emisor_vr(e)
        mat = e.get("MATERIAL_INFO") or []
        uvs = e.get("UV_INFO") or [[]]
        cual = 1 if d["sombreador"] == "Effect_BallAura1" and len(mat) > 3 and mat[3] else 0
        png, alfa = _png_particula(fuente, mat[2 * cual] if len(mat) > 2 * cual else 0,
                                   mat[2 * cual + 1] if len(mat) > 2 * cual + 1 else "", base_efecto, carpeta, texturas)
        d.update({"nodo": _nombre(nodos[i]) if i < len(nodos) else "",
                  "corte": d["clips"][0] if d["clips"] else "",
                  "textura": png, "textura_alfa": int(alfa), "uv": _uv_vr(uvs[min(cual, len(uvs) - 1)])})
        if cual:
            d["rampas"] = rampas_aura(fuente)
        out.append(d)
    return out


def _escribir_json(ruta, d):
    tmp = "%s.%d.tmp" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as fh:
        # (dumps entero y luego escribir: json.dump va por el codificador en Python, O-332)
        fh.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, ruta)


def _al_dia_glb(ruta, version=VERSION_EVENTO):
    return os.path.isfile(ruta) and g4.version_de(ruta) == version


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
            if not _al_dia_glb(os.path.join(carpeta, "pistas_%s.glb" % EV.cuerpo(t)), VERSION_PISTAS):
                return False
    if "asignado" in tipos_act:
        for a in asignados:
            if not _al_dia_glb(os.path.join(carpeta, "pistas_%s.glb" % a), VERSION_ASIGNADO):
                return False
    return True


# --------------------------------------------------------------------------- modelos sueltos
def es_modelo_suelto(codigo):
    """Los codigos que no son personajes: keshin, almas, modelos de tecnica, balon, objetos,
    otros de chr, los efectos comunes ega_* (el aura del keshin en el campo) y los clips de la
    disputa aerea de cada tipo de cuerpo (disputa_c000X01, O-341)."""
    return bool(re.fullmatch(r"(k|a|b|i|kx|mx)\d{6}|ev\d\d_\d{5}|ega_[a-z0-9_]+|disputa_c000[1-4]01", codigo or ""))


# la disputa aerea de VR (O-341; Aaron: "hacen como una pequena animacion peleando por el
# balon"): sus clips del banco p030 de cada tipo de cuerpo (modelos3d/clips_c000101.txt de la
# carpeta de trabajo, 46-81): saltar a por el balon (入, 0,33 s), pelear (L, en bucle), ganar y
# salir con el balon (保持...前走り, 1,17 s), perder (失敗...前走り) y ganar de cabeza
# (ヘディングパス, el despeje); cada uno en su lado de la pareja (右 y 左). Van aparte, en
# `disputa_<cuerpo>.glb` (solo los huesos y los clips): asi los modelos de los jugadores no se
# rehacen y la pagina se los pone a cada uno por su tipo de cuerpo
PREFIJO_DISPUTA = "disputa_"
CLIPS_DISPUTA = tuple("戦1スクランブルハイボール" + c % lado for lado in ("右", "左") for c in (
    "競合%s1入", "競合%s1L", "保持%s1前走り", "失敗%s1前走り", "ヘディングパス%s1前"))


def convertir_disputa(codigo, destino, fuente, informe=None):
    """`<destino>/disputa_c000X01.glb`: el esqueleto comun de ese tipo de cuerpo (los mismos
    nombres de hueso que el de cada jugador) y los clips de la disputa aerea (CLIPS_DISPUTA),
    sin mallas ni el avance por el campo, con la VERSION_MODELO de los personajes (O-341)."""
    informe = informe or (lambda *_: None)
    m = re.fullmatch(re.escape(PREFIJO_DISPUTA) + r"(c000[1-4]01)", codigo or "")
    if not m:
        raise LookupError("codigo de disputa raro: %r" % codigo)
    cuerpo = m.group(1)
    sk = "common/chr/%s/%s.g4sk" % (cuerpo, cuerpo)
    banco = "common/chr/%s/%s_p030.g4pk" % (cuerpo, cuerpo)
    if not (fuente.hay(sk) and fuente.hay(banco)):
        raise LookupError("el juego no trae el cuerpo %s" % cuerpo)
    mts = g4anim.bancos_de(fuente.leer(banco))
    hay = {c["nombre"] for mt in mts for c in mt["clips"]}
    clips = [c for c in CLIPS_DISPUTA if c in hay]
    if not clips:
        raise LookupError("el banco %s no trae la disputa aerea" % banco)
    g = g4.armar(fuente.leer(sk), [], [], piel=(255, 255, 255), sin_luz=False,
                 bancos=[(os.path.basename(banco)[:-len(".g4pk")], mts, clips)], informe=informe)
    g.j["asset"]["extras"] = {"version": g4.VERSION_MODELO, "codigo": codigo, "clips": clips, "disputa": True}
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, codigo + ".glb")
    g.guardar(ruta)
    informe("-> %s (%.2f MB, %d clips)" % (ruta, os.path.getsize(ruta) / 1e6, len(clips)))
    return ruta


def convertir_modelo(codigo, destino, fuente, informe=None):
    """`<destino>/<codigo>.glb` de un modelo suelto (es_modelo_suelto), con la VERSION_MODELO de
    los personajes para que la cola los trate igual. El keshin lleva los clips de su banco
    (化身立ち1L: la pose de detras del jugador); el aura del campo, sus clips in/loop/out y en
    asset.extras lo de sus materiales y mallas por clip. Los de la disputa aerea, aparte."""
    informe = informe or (lambda *_: None)
    if (codigo or "").startswith(PREFIJO_DISPUTA):
        return convertir_disputa(codigo, destino, fuente, informe)
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


# --------------------------------------------------------------------------- el aura del campo
def es_aura(nombre):
    """El aura del keshin en el campo (ega_k000020a, O-332): va como una animacion de VR."""
    return bool(re.fullmatch(r"ega_k\d{6}a", nombre or ""))


def convertir_aura(codigo, destino, fuente, informe=None):
    """El aura del keshin en el campo (battle/common/ega_kNNNNNNa: las llamas alrededor del
    jugador y el keshin de luz encima, como sale en VR mientras dura) a `<destino>/eventos/<codigo>/`
    como un evento de un solo efecto y sin camara: sus clips in (sale), loop (en bucle) y out (se
    va) son tres cortes seguidos; con sus sombreadores de VR y sus particulas (O-332). La pagina lo
    pone en el jugador del campo con EventoVR."""
    informe = informe or (lambda *_: None)
    r = "common/effect/battle/common/%s/%s.objbin" % (codigo, codigo)
    if not es_aura(codigo) or not fuente.hay(r):
        raise LookupError("el juego no trae el aura %s" % codigo)
    pk, _ptlb = _pkm_de_objbin(fuente, r)
    p = fuente.pkm(pk) if pk else {}
    if "G4MT" not in p:
        raise LookupError("el aura %s no trae animacion" % codigo)
    clips = {c["nombre"]: c for c in g4anim.leer_g4mt(p["G4MT"])["clips"]}
    cortes, reproducir, fr = [], [], 0
    for nombre in ("in", "loop", "out"):
        c = clips.get(nombre)
        if not c:
            continue
        # (en fotogramas a 60 por segundo: lo que dura el clip; el del bucle cierra sin salto)
        n = max(1, int(round((c["fin"] - c["ini"]) * FPS / (c["fps"] or FPS))))
        cortes.append((nombre, fr, fr + n))
        reproducir.append((fr, codigo, nombre, "eff"))
        fr += n
    if not cortes:
        raise LookupError("el aura %s no trae sus clips" % codigo)
    ev = {"nombre": codigo, "cortes": cortes, "camara": None, "rotulo": None, "anim": {},
          "actores": {codigo: {"carga": r, "sub": "eff", "orden": "CARGAR_OBJ"}}, "reproducir": reproducir,
          "visible": [], "pegados": [], "auras": [], "efectos_comunes": [], "ordenes": [], "rotulos": [], "rotulos_ver": []}
    carpeta = carpeta_evento(destino, codigo)
    os.makedirs(carpeta, exist_ok=True)
    info_actores = {}
    escena = _escena(codigo, ev, fuente, _Puntos(fuente, ev), carpeta, ev["actores"], info_actores, informe)
    escena.update({"actores": info_actores, "modelos": [], "aura": True})
    _escribir_json(os.path.join(carpeta, "escena.json"), escena)
    informe("  %s -> escena.json + escena.glb (aura)" % codigo)
    return {"carpeta": carpeta, "modelos": [], "rotulo": ""}


# --------------------------------------------------------------------------- rotulos
def convertir_rotulo(nombre, destino, fuente):
    """El rotulo de VR con el nombre de la tecnica o del espiritu ('whs00030', 'k000020',
    'aura_mixi_c02023380'...) a `<destino>/eventos/_rotulos/<nombre>.png`, o None si no esta."""
    if not re.fullmatch(r"[A-Za-z0-9_]{1,60}", nombre or ""):
        return None
    # en espanol y, si no esta, en ingles (O-332)
    r = next((x for x in ("dx11/menu/220_img/telop_waza/%s/%s.g4tx" % (i, nombre) for i in (IDIOMA_ROTULO, IDIOMA_ROTULO_OTRO))
              if fuente.hay(x)), None)
    if not r:
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
# O-345 (Aaron: "las animaciones que no son sacadas del juego, se ven raras"): las jugadas sin
# supertecnica del partido de VR, los eventos ev71 (common/event/ev71; mirados uno a uno en la
# carpeta de trabajo, juego/animjuego): el tiro (Tirar 20010/20020, Vaselina 21010, Volea 22010,
# Testarazo 23010), el portero sin tecnica (300NN: parar de frente 30010 y a los lados 30030/30050,
# despejar 30020/30040/30060), el portero que para una supertecnica sin la suya (310NN: 31010..31090
# parar, 31110 despejar), el duelo sin tecnica (320NN_1 gana el que lleva el balon, _2 el que
# defiende: 32010 se le tira delante, 32020 entrada, 32030 y 32060 carga; 40010 rompe), el que
# bloquea con el cuerpo (33050), el balon que entra en la red (00010..00040; con supertecnica
# 00050..00054, una por elemento) y las celebraciones de gol (100NN, las 16 de
# soccer_performance_config). Las pide el partido para cualquiera de sus jugadores
EVENTOS_JUGADAS = (
    "ev71_20010", "ev71_20020", "ev71_21010", "ev71_22010", "ev71_23010",
    "ev71_30010", "ev71_30020", "ev71_30030", "ev71_30040", "ev71_30050", "ev71_30060",
    "ev71_31010", "ev71_31030", "ev71_31050", "ev71_31070", "ev71_31090", "ev71_31110",
    "ev71_32010_1", "ev71_32010_2", "ev71_32020_1", "ev71_32020_2", "ev71_32030_1", "ev71_32030_2",
    "ev71_32060_1", "ev71_32060_2", "ev71_40010", "ev71_33050",
    "ev71_00010", "ev71_00020", "ev71_00030", "ev71_00040",
    "ev71_00050", "ev71_00051", "ev71_00052", "ev71_00053", "ev71_00054",
    "ev71_10010", "ev71_10020", "ev71_10030", "ev71_10040", "ev71_10050", "ev71_10060", "ev71_10080",
    "ev71_10090", "ev71_10100", "ev71_10110", "ev71_10120", "ev71_10130", "ev71_10140", "ev71_10150",
    "ev71_10160", "ev71_10170")


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
            # (O-345: si los demas jugadores del guion son copias del que la hace, como el clon de
            # Sombra de Orion, solo su tipo de cuerpo)
            otros = {x.split("=")[-1] for x in (f.get("roles") or "").split()} - {"h0"}
            tipos = {propio} | (tipos_partido if int(f.get("jugadores") or 1) >= 2 and (otros or not f.get("roles")) else set())
            tipos = (tipos & hay) or {sorted(hay)[0]}
            asg = [asignado] if f.get("asignado") and asignado else []
            pedir(f["evento"], tipos, asg)
            # el de fallo (el gol de la parada, el muro que no para) ya no sale: el que pierde no
            # ensena su tecnica (O-336); no se convierte
            for m in (f.get("modelos") or "").split():
                poner(codigos, m)
            poner(rotulos, f.get("rotulo"))
            # (roles: quien es cada jugador del guion, O-345)
            mapa["tecnicas"][f["interno"]] = {k: f.get(k, "") for k in (
                "evento", "evento_fallo", "segundos", "jugadores", "asignado", "rotulo", "roles")}
        if fe:
            # s00 el de antes y s01 el transformado (armadura, mixi max, modo): con su tipo de cuerpo
            tipos = {propio, _tipo_de_cara(fe["cara_a"]) or propio}
            pedir(fe["evento"], tipos, [asignado])
            for c in (asignado, fe["cara_a"], fe["aura_campo"]):
                poner(codigos, c)
            poner(rotulos, fe.get("rotulo"))
            # y el aura del campo con sus sombreadores y sus particulas de VR (O-332)
            if es_aura(fe.get("aura_campo")):
                pedir(fe["aura_campo"], ())
            mapa["espiritus"][fe["id"].upper()] = {k: fe.get(k, "") for k in (
                "familia", "evento", "segundos", "asignado", "cara_de", "cara_a", "aura_campo", "rotulo")}
    # las jugadas sin tecnica (O-345), con los tipos de cuerpo de todos los del partido (las hace
    # cualquiera); un Pizarra de antes no las pide ni las ensena
    if jugadores:
        for ev in EVENTOS_JUGADAS:
            pedir(ev, tipos_partido or {"01"})
        mapa["jugadas"] = list(EVENTOS_JUGADAS)
        # O-343: y las celebraciones de gol de VR que no estan en esas (la de Harper Evans, ev71_10070,
        # solo es de su tipo de celebracion) si alguno del partido la lleva (ievr/sonidos.celebraciones)
        try:
            from ievr import sonidos
            for evs in sonidos.celebraciones(jugadores).values():
                for ev in evs:
                    if ev not in mapa["jugadas"]:
                        pedir(ev, tipos_partido or {"01"})
                        mapa["jugadas"].append(ev)
        except Exception:
            pass
    return codigos, pedidos, rotulos, mapa
