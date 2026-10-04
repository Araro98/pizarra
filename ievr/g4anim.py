"""Animaciones de los modelos del juego: bancos G4MT de Level-5 a animaciones glTF (O-293).

Lo usa ievr/g4.py para meter en cada .glb las cuatro animaciones del partido
(parado, correr, tiro y patada) del banco `c000X01_p020.g4pk` del cuerpo.

Codigo propio; el formato se entendio leyendo G4_Blender (sin licencia: se
leyo, no se copio) y se comprobo contra los ficheros del juego. Dos cosas en
las que el juego NO hace lo que hace G4_Blender, medidas con sus datos:
- los valores cuantizados se dividen por 65535/32767 (no 65536/32768): asi la
  norma mediana de 534.676 cuaternios del banco de partido sale 1 +- 1e-7;
- la escala de cada hueso es la suya propia, no relativa al padre (se ve en
  los dedos al cerrar el puno), y glTF la hereda: se divide por la del padre.

G4MT (G4MA y G4CM usan la misma estructura). Cabecera 0x40:
  0x20 u16 n clips | 0x22 u16 n objetivos (huesos)
  0x24 u16 info-objetivo | 0x26 u16 canales          (palabras desde 0x40, << desplaz)
  0x28 escalas | 0x2A crc32 de clips | 0x2C crc32 de objetivos | 0x2E nombres (palabras desde 0x40)
  0x30 u16 fotogramas clave | 0x32 u16 datos          (palabras desde 0x40, << 2*desplaz)
  0x36 u8 desplaz (para que un u16 llegue a ficheros de varios MB)
Clip (0x10 c/u desde 0x40): u16 fotograma inicial, u16 final (INCLUSIVE), u16 inicio en
info-objetivo, u16 n info, u8 flags (bit 0 = aditiva), u8 fps, u8 inicio info (bits altos).
Canal (20 B): tipo (1..3 escala, 9 rotacion xyzw, 10..12 traslacion), codec (1 sin cuantizar,
2 sin signo, 3 con signo), interpolacion, bytes por componente, n componentes, bytes por clave,
indice de escala, ranura, u32 primera clave, u32 offset de datos, u32 n claves.
"""
import struct

import numpy as np

from ievr.g4 import leer_g4pk, u16

# tipo de canal -> (propiedad glTF, componente)
TIPO_CANAL = {1: ("scale", 0), 2: ("scale", 1), 3: ("scale", 2), 9: ("rotation", None),
              10: ("translation", 0), 11: ("translation", 1), 12: ("translation", 2)}


def _nombres_de_clips(b, o_nom, n_clips):
    """n u16 (orden por crc32) y, alineado a 16, n u16 offsets de nombre relativos a esa tabla
    (UTF-8, en japones). Si el de 16 no cuadra se prueba alineado a 4."""
    for al in (16, 4):
        t = (o_nom + 2 * n_clips + al - 1) & ~(al - 1)
        offs = struct.unpack_from("<%dH" % n_clips, b, t)
        if all(x >= 2 * n_clips and t + x < len(b) and b[t + x] >= 0x20 for x in offs):
            try:
                return [bytes(b[t + x:b.index(b"\0", t + x)]).decode("utf-8") for x in offs]
            except UnicodeDecodeError:
                pass
    return ["clip%d" % i for i in range(n_clips)]


def leer_g4mt(b):
    """Directorio de un G4MT: clips, info por objetivo, canales y escalas (ver el docstring del modulo)."""
    mag = bytes(b[:4])
    if mag not in (b"G4MT", b"G4MA", b"G4CM"):
        raise ValueError("no es un banco G4MT")
    cab, pal = u16(b, 0x04), u16(b, 0x0A)
    if cab != 0x40 or pal * 4 != cab:
        raise ValueError("cabecera de G4MT rara")
    n_clips, n_obj = u16(b, 0x20), u16(b, 0x22)
    d = b[0x36]

    def sec(o, k=0):
        return (pal + (u16(b, o) << k)) * 4
    o_info, o_can = sec(0x24, d), sec(0x26, d)
    o_esc, o_hclip, o_hobj, o_nom = sec(0x28), sec(0x2A), sec(0x2C), sec(0x2E)
    o_claves, o_datos = sec(0x30, 2 * d), sec(0x32, 2 * d)
    escalas = struct.unpack_from("<%df" % ((o_hclip - o_esc) // 4), b, o_esc)
    h_obj = struct.unpack_from("<%dI" % n_obj, b, o_hobj)
    nombres = _nombres_de_clips(b, o_nom, n_clips)
    clips = []
    for i in range(n_clips):
        ini, fin, inf_lo, inf_n, flags, fps, inf_hi = struct.unpack_from("<4H3B", b, cab + i * 0x10)
        clips.append({"i": i, "nombre": nombres[i], "ini": ini, "fin": fin, "flags": flags,
                      "fps": fps, "info_ini": inf_lo | (inf_hi << 16), "info_n": inf_n})
    n_info = max((c["info_ini"] + c["info_n"] for c in clips), default=0)
    infos = []
    for i in range(n_info):
        obj, c_lo, c_n, c_hi = struct.unpack_from("<HHBB", b, o_info + i * 8)
        infos.append({"obj": obj, "can_ini": c_lo | (c_hi << 16), "can_n": c_n})
    n_can = max((x["can_ini"] + x["can_n"] for x in infos), default=0)
    canales = []
    for i in range(n_can):
        tipo, codec, interp, var, ncomp, bpk, esc, _x7, k_ini, dat, k_n = struct.unpack_from(
            "<8B3I", b, o_can + i * 20)
        canales.append({"tipo": tipo, "codec": codec, "interp": interp, "var": var, "ncomp": ncomp,
                        "bpk": bpk, "esc": esc, "k_ini": k_ini, "dat": dat, "k_n": k_n})
    return {"magia": mag.decode(), "b": b, "clips": clips, "infos": infos, "canales": canales,
            "escalas": escalas, "objetivos": h_obj, "o_claves": o_claves, "o_datos": o_datos}


def bancos_de(b):
    """[G4MT leidos] de un .g4pk / .g4pkm / .g4mt (bytes)."""
    if b[:4] == b"G4PK":
        return [leer_g4mt(x) for _n, x in leer_g4pk(b) if x[:4] == b"G4MT"]
    return [leer_g4mt(b)]


def claves_y_valores(mt, c):
    """(fotogramas[k], valores[k, ncomp]) de un canal, ya decodificados a float."""
    b = mt["b"]
    k = np.frombuffer(b, "<u2", c["k_n"], mt["o_claves"] + 2 * c["k_ini"]).astype(np.float64)
    n, nc, bpk = c["k_n"], c["ncomp"], c["bpk"]
    tam = bpk // nc if nc else bpk
    crudo = np.frombuffer(b, np.uint8, n * bpk, mt["o_datos"] + c["dat"]).reshape(n, bpk)[:, :tam * nc].copy()
    s = mt["escalas"][c["esc"]] if c["esc"] < len(mt["escalas"]) else 1.0
    codec, var = c["codec"], c["var"]
    if codec == 1:                                  # sin cuantizar: s8 / s16 / float
        v = crudo.view({1: "<i1", 2: "<i2", 4: "<f4"}[var]).astype(np.float64)
    elif codec == 2:                                # sin signo, 0..escala
        v = crudo.view({1: "<u1", 2: "<u2"}[var]).astype(np.float64) * s / (255.0 if var == 1 else 65535.0)
    elif codec == 3:                                # con signo, -escala..escala
        v = crudo.view({1: "<i1", 2: "<i2"}[var]).astype(np.float64) * s / (127.0 if var == 1 else 32767.0)
    else:
        raise ValueError("codec %d/%d desconocido" % (codec, var))
    return k, v.reshape(n, nc)


def muestrear(k, v, fotogramas, interp, cuaternio=False):
    """Valor del canal en cada fotograma (escalon si interp == 0, lineal si no; los cuaternios por
    el camino corto y renormalizados, que con claves tan seguidas basta)."""
    f = np.asarray(fotogramas, dtype=np.float64)
    if len(k) == 1:
        return np.repeat(v[:1], len(f), 0)
    j = np.clip(np.searchsorted(k, f, side="right") - 1, 0, len(k) - 1)
    if interp == 0:
        return v[j]
    j2 = np.minimum(j + 1, len(k) - 1)
    span = k[j2] - k[j]
    t = np.where(span > 0, (f - k[j]) / np.where(span > 0, span, 1), 0.0)
    t = np.clip(t, 0, 1)[:, None]
    a, c = v[j], v[j2]
    if cuaternio:
        c = np.where((a * c).sum(1, keepdims=True) < 0, -c, c)
        q = a + (c - a) * t
        return q / np.linalg.norm(q, axis=1, keepdims=True)
    return a + (c - a) * t


def elegir_clip(mts, quien):
    """(G4MT, clip) por nombre exacto o por indice (texto de digitos) en el primer banco."""
    for mt in mts:
        for c in mt["clips"]:
            if c["nombre"] == quien:
                return mt, c
    if str(quien).isdigit() and mts and int(quien) < len(mts[0]["clips"]):
        return mts[0], mts[0]["clips"][int(quien)]
    raise KeyError("no hay clip %r" % (quien,))


def pistas_de_clip(mt, clip, sk, reposo):
    """Muestrea un clip fotograma a fotograma. reposo[i] = (tras, cuat xyzw, escala) LOCAL del hueso i
    (lo que llevan los nodos del .glb). Las componentes sin canal se quedan en reposo.
    -> (fotogramas, {hueso: {"translation": (F,3), "rotation": (F,4), "scale": (F,3)}}, n sin hueso)"""
    idx = {h: i for i, h in enumerate(sk["hashes"])}
    fot = np.arange(clip["ini"], clip["fin"] + 1, dtype=np.float64)
    nf = len(fot)
    pistas, sin_hueso = {}, 0
    for inf in mt["infos"][clip["info_ini"]: clip["info_ini"] + clip["info_n"]]:
        i = idx.get(mt["objetivos"][inf["obj"]])
        if i is None:
            sin_hueso += 1
            continue
        t0, q0, s0 = reposo[i]
        val = {"translation": np.tile(np.asarray(t0, np.float64), (nf, 1)),
               "rotation": np.tile(np.asarray(q0, np.float64), (nf, 1)),
               "scale": np.tile(np.asarray(s0, np.float64), (nf, 1))}
        for c in mt["canales"][inf["can_ini"]: inf["can_ini"] + inf["can_n"]]:
            m = TIPO_CANAL.get(c["tipo"])
            if not m or not c["k_n"]:
                continue
            k, v = claves_y_valores(mt, c)
            s = muestrear(k, v, fot, c["interp"], cuaternio=m[0] == "rotation")
            if m[1] is None:
                val[m[0]] = s / np.linalg.norm(s, axis=1, keepdims=True)
            else:
                val[m[0]][:, m[1]] = s[:, 0]
        q = val["rotation"]                        # mismo hemisferio fotograma a fotograma
        for f in range(1, nf):
            if np.dot(q[f - 1], q[f]) < 0:
                q[f] = -q[f]
        pistas[i] = val
    # escala no heredada (como "segment scale compensate" de Maya) -> la local de glTF
    propia = {i: v["scale"].copy() for i, v in pistas.items()}
    for i, v in pistas.items():
        p = sk["padres"][i]
        if p >= 0 and p in propia:
            ps = propia[p]
            v["scale"] = np.where(np.abs(ps) > 1e-9, v["scale"] / np.where(np.abs(ps) > 1e-9, ps, 1), v["scale"])
    return fot, pistas, sin_hueso


def anadir_animacion(g, sk, reposo, nodo_base, nombre_banco, mts, quien, informe=None, sin_avance=True):
    """Anade al Glb `g` la animacion `quien` (nombre o indice) de los bancos `mts`.
    Solo se escriben las propiedades que se mueven o que no estan en reposo.
    El avance por el campo (root motion) va en `c_global_0_0` (3,2 m en la patada); con
    sin_avance (lo normal en Pizarra) no se escribe: el partido mueve al jugador y el modelo
    anima en su sitio. El avance total queda en extras.avance."""
    informe = informe or (lambda *_: None)
    mt, clip = elegir_clip(mts, quien)
    if clip["flags"] & 1:
        informe("  anim %s: ADITIVA, necesita una pose base: se salta" % clip["nombre"])
        return None
    fps = clip["fps"] or 60
    fot, pistas, sin_hueso = pistas_de_clip(mt, clip, sk, reposo)
    t = ((fot - fot[0]) / fps).astype(np.float32)
    acc_t = g.accesor(t.reshape(-1, 1), "SCALAR", minmax=True)
    acc_t2 = None
    samplers, canales = [], []
    raiz = sk["nombres"].index("c_global_0_0") if "c_global_0_0" in sk["nombres"] else -1
    avance = [0.0] * 3
    if raiz in pistas:
        avance = [float(x) for x in pistas[raiz]["translation"][-1] - pistas[raiz]["translation"][0]]
    for i, val in sorted(pistas.items()):
        t0, q0, s0 = reposo[i]
        for prop, v in val.items():
            if sin_avance and i == raiz and prop in ("translation", "rotation"):
                continue
            se_mueve = np.abs(v - v[0]).max() > 1e-5
            if prop == "rotation":
                distinto = 1 - abs(float(np.dot(v[0], q0))) > 1e-7
            else:
                distinto = np.abs(v[0] - (t0 if prop == "translation" else s0)).max() > 1e-5
            if not se_mueve and not distinto:
                continue
            if se_mueve or len(t) == 1:
                entrada, salida = acc_t, v
            else:                                  # constante pero distinta del reposo: 2 claves
                if acc_t2 is None:
                    acc_t2 = g.accesor(np.array([[0.0], [t[-1]]], np.float32), "SCALAR", minmax=True)
                entrada, salida = acc_t2, v[[0, -1]]
            tipo = "VEC4" if prop == "rotation" else "VEC3"
            samplers.append({"input": entrada, "output": g.accesor(salida.astype(np.float32), tipo),
                             "interpolation": "LINEAR"})
            canales.append({"sampler": len(samplers) - 1, "target": {"node": nodo_base + i, "path": prop}})
    g.j.setdefault("animations", []).append({
        "name": clip["nombre"], "samplers": samplers, "channels": canales,
        "extras": {"banco": nombre_banco, "clip": clip["i"], "fotogramas": len(fot), "fps": fps,
                   "bucle": clip["nombre"].endswith("L"), "avance": avance, "sin_avance": bool(sin_avance)}})
    informe("  anim %s#%d %s: %d fotogramas a %d fps, %d huesos, %d canales%s"
            % (nombre_banco, clip["i"], clip["nombre"], len(fot), fps, len(pistas), len(canales),
               ", %d objetivos sin hueso" % sin_hueso if sin_hueso else ""))
    return clip
