"""Modelos 3D del juego (formatos G4 de Level-5) a glTF binario (.glb), en el PC de cada uno.

Para la vista 3D del partido (O-293): cada jugador ve los personajes con su
modelo del juego, convertido desde SU juego instalado. Los modelos son arte del
juego y no se reparten nunca: Pizarra solo trae como se arman (la tabla
`modelos-personaje.csv`, nombres de ficheros y colores) y este conversor.

    from ievr import g4
    g4.convertir("c03030080", rutas.carpeta_del_juego(), "datos/modelos3d")
    -> "datos/modelos3d/c03030080.glb"

Las piezas salen directamente de los .cpk con `ievr/cpk.py` (sin el toolbox,
que no tiene licencia). El indice ruta -> .cpk se guarda en
`<destino>/indice.json` y se rehace solo si el juego cambia.

De donde sale: codigo propio. Los formatos se entendieron leyendo G4_Blender
(sin licencia: se leyo, no se copio nada) y se comprobaron uno a uno contra los
ficheros del juego (ver el INFORME de modelos3d en la carpeta de trabajo).

Piezas de un personaje:
  esqueleto  common/chr/c000X01/c000X01.g4sk (comun por tipo de cuerpo; algunos
             traen el suyo dentro de un .g4pkm en su carpeta de _face)
  cara       common/chr/_face/<saga>/<id>/<id>.g4md + .g4mg, textura en dx11/chr/...
  ropa       common/chr/_uniform/<carpeta>/<modelo>.g4md + .g4mg, textura en dx11/chr/...
  animacion  common/chr/c000X01/c000X01_p020.g4pk (el banco del partido)

Formatos (offsets en hex, little endian):
  G4PK  contenedor. 0x20 u32 n, u16 n_hash, u16 n_tabla; detras n offsets (palabras desde la
        cabecera), n tamanos, n crc32, tabla, nombres.
  G4SK  esqueleto. 0x20 u16 n huesos; 0x24 8 x u16 secciones (palabras, +0x40). 0x40 = matrices
        MUNDO de reposo 3x4; sec0 inversas de enlace; sec1 TRS local; sec2 crc32 de nombres;
        sec3 padres; sec7 nombres.
  G4MD  descriptor de modelo: submallas (0x50 c/u), declaraciones de vertice, materiales,
        crc32 de huesos y texturas, paleta de huesos. La geometria esta en el .g4mg.
  G4TX  texturas: una tabla de imagenes con nombre y cada imagen es un DDS completo (BC7).
  G4MT  bancos de animacion (ievr/g4anim.py).
"""
import io
import json
import os
import re
import struct
import time
import zlib
from collections import OrderedDict

import numpy as np

# animaciones de partido que lleva cada modelo (banco p020 del cuerpo = "戦1" = en el campo):
# parado, correr, tiro y patada. Los mismos nombres usa web/partido-3d.js.
BANCO_PARTIDO = "p020"
ANIM_PARTIDO = ["戦1立ち1L", "戦1走り1L", "戦1シュート1", "戦1キック1"]
SOMBRA = 0.72          # cuanto oscurece la sombra de dibujo animado horneada (0 = nada)
MAX_TEX = 1024         # lado maximo de las texturas del .glb
VERSION_INDICE = 1
# Sube cada vez que cambie lo que sale en el .glb: los que ya tenga un PC de
# otra version se rehacen solos (ievr/modelos3d.py). 1 = el script de pruebas
# (tallas de ropa mal en 12 de 22); 2 = Pizarra con modelos-personaje.csv.
VERSION_MODELO = 2


def crc(nombre):
    return zlib.crc32(nombre.encode("ascii")) & 0xFFFFFFFF


def u16(b, o):
    return struct.unpack_from("<H", b, o)[0]


def u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def texto(b, o):
    return bytes(b[o:b.index(b"\0", o)]).decode("ascii", "replace")


# --------------------------------------------------------------------------- G4PK (contenedor)
def leer_g4pk(b):
    """[(nombre, bytes)] de un .g4pk/.g4pkm. Offsets en palabras de 4 bytes relativos a la cabecera."""
    if b[:4] != b"G4PK":
        raise ValueError("no es un G4PK")
    cab = u16(b, 4)
    n, n_hash, n_tabla = struct.unpack_from("<IHH", b, 0x20)
    p = cab
    offs = struct.unpack_from("<%dI" % n, b, p)
    p += 4 * n
    tams = struct.unpack_from("<%dI" % n, b, p)
    p += 4 * n
    p += 4 * n_hash
    p += 2 * (n_tabla // 2)
    p = (p + 3) & ~3
    noms = struct.unpack_from("<%dH" % (n_tabla // 2), b, p)
    return [(texto(b, p + noms[i]), b[cab + (offs[i] << 2): cab + (offs[i] << 2) + tams[i]]) for i in range(n)]


# --------------------------------------------------------------------------- G4SK (esqueleto)
def leer_g4sk(b):
    """Esqueleto. Cabecera 0x40; 0x20 u16 n_huesos; 0x24 8 x u16 = inicio de secciones (palabras, +0x40).
    0x40           n x 3x4 float  matriz MUNDO de reposo (filas; traslacion en la 4a columna)
    sec0           n x 3x4 float  matriz inversa de enlace (inverse bind)
    sec1           n x 0x30       local: escala xyz(+pad), cuaternio xyzw, traslacion xyz(+pad)
    sec2           n x u32        crc32 del nombre de cada hueso
    sec3           n x u16        padre (n = sin padre)
    sec7           n x u16        offset de nombre (relativo a sec7) + textos
    Un .g4pkm (esqueleto propio de algunos personajes) lo lleva dentro."""
    if b[:4] == b"G4PK":
        b = next((x for _n, x in leer_g4pk(b) if x[:4] == b"G4SK"), b"")
    if b[:4] != b"G4SK":
        raise ValueError("no es un esqueleto G4SK")
    n = u16(b, 0x20)
    sec = [0x40 + u16(b, 0x24 + 2 * i) * 4 for i in range(8)]
    mundo = np.frombuffer(b, "<f4", n * 12, 0x40).reshape(n, 3, 4).astype(np.float64)
    inv = np.frombuffer(b, "<f4", n * 12, sec[0]).reshape(n, 3, 4).astype(np.float64)
    loc = np.frombuffer(b, "<f4", n * 12, sec[1]).reshape(n, 12).astype(np.float64)
    hashes = list(struct.unpack_from("<%dI" % n, b, sec[2]))
    padres = list(struct.unpack_from("<%dH" % n, b, sec[3]))
    nombres = [texto(b, sec[7] + u16(b, sec[7] + 2 * i)) for i in range(n)]

    def a4(m):
        out = np.zeros((len(m), 4, 4))
        out[:, :3, :] = m
        out[:, 3, 3] = 1
        return out
    return {
        "n": n, "nombres": nombres, "padres": [p if p < n else -1 for p in padres], "hashes": hashes,
        "mundo": a4(mundo), "inv": a4(inv),
        "escala": loc[:, 0:3], "rot": loc[:, 4:8], "tras": loc[:, 8:11],
    }


# --------------------------------------------------------------------------- G4MD (descriptor de modelo)
# tipos de elemento de vertice (byte 0 de cada elemento de la declaracion)
E_POS, E_NOR, E_BIN, E_PESO, E_HUESO, E_COLOR, E_UV0, E_TAN = 1, 2, 3, 5, 6, 8, 10, 13
# formatos: 3 float3 | 20 snorm16x4 | 32 unorm16x8 (pesos) | 24 u8x8 (indices) | 12 unorm8x4 | 14 unorm16x2


def leer_g4md(b):
    """Descriptor de modelo.
    0x04 u16 inicio de la tabla de submallas | 0x0A u16 base de tablas en palabras
    0x20 u16 n submallas | 0x22 u16 n materiales | 0x24 u8 n huesos | 0x26 u8 n declaraciones
    0x27 u8 n texturas | 0x5C u32 inicio del buffer de indices dentro del .g4mg
    0x60..0x8B u16 en palabras desde la base: 0x64 materiales, 0x68 refs de textura, 0x74 crc32 de
    huesos, 0x76 crc32 de texturas, 0x82 paleta de huesos, 0x84 nombres de submalla, 0x86 de material.
    Submalla (0x50): +0 u32 offset de vertices, +4 u32 offset de indices, +8 u32 n vertices,
    +0xC u32 n indices, +0x30 u32 n triangulos, +0x3A u16 inicio en la paleta, +0x3C u16 flags0
    (0x100 = con piel; byte bajo = n huesos), +0x3E u16 flags1 (byte bajo = zancada),
    +0x42 u8 declaracion, +0x43 u8 material."""
    if b[:4] != b"G4MD":
        raise ValueError("no es un modelo G4MD")
    base = u16(b, 0x0A) * 4

    def tabla(o):
        return base + u16(b, o) * 4
    n_mallas, n_mats = u16(b, 0x20), u16(b, 0x22)
    n_huesos, n_layouts, n_tex = b[0x24], b[0x26], b[0x27]
    ib_base = u32(b, 0x5C)
    sub = u16(b, 0x04)
    mallas = []
    for i in range(n_mallas):
        o = sub + i * 0x50
        vo, io_, nv, ni = struct.unpack_from("<4I", b, o)
        f0, f1 = u16(b, o + 0x3C), u16(b, o + 0x3E)
        mallas.append({
            "vo": vo, "io": io_, "nv": nv, "ni": ni, "tri": u32(b, o + 0x30),
            "pal_ini": u16(b, o + 0x3A), "pal_n": (f0 & 0xFF) if f0 & 0x100 else 0,
            "zancada": (f1 & 0xFF) or 0x44, "layout": b[o + 0x42], "mat": b[o + 0x43],
        })
    layouts = []
    c = sub + n_mallas * 0x50
    for _ in range(n_layouts):
        n = b[c + 1]
        els = {}
        for k in range(n):
            tipo, off, _pad, fmt = struct.unpack_from("<BHBI", b, c + 8 + k * 8)
            els.setdefault(tipo, (off, fmt))
        layouts.append(els)
        c += 8 + n * 8
    huesos = list(struct.unpack_from("<%dI" % n_huesos, b, tabla(0x74)))
    t_pal, t_nm = tabla(0x82), tabla(0x84)
    paleta = list(struct.unpack_from("<%dH" % ((t_nm - t_pal) // 2), b, t_pal))
    nombres_malla = [texto(b, t_nm + u16(b, t_nm + 2 * i)) for i in range(n_mallas)]
    t_nmat = tabla(0x86)
    nombres_mat = [texto(b, t_nmat + u16(b, t_nmat + 2 * i)) for i in range(n_mats)]
    tex_hash = list(struct.unpack_from("<%dI" % n_tex, b, tabla(0x76)))
    t_mat, t_ref = tabla(0x64), tabla(0x68)
    mats = []
    for m in range(n_mats):
        v = struct.unpack_from("<8H", b, t_mat + m * 16)
        refs = [b[t_ref + (v[3] + k) * 6] for k in range(v[6] & 0xFF)]   # indice en la tabla de crc32
        mats.append({"nombre": nombres_mat[m], "tex": [tex_hash[r] for r in refs]})
    for i, m in enumerate(mallas):
        m["nombre"] = nombres_malla[i]
        m["huesos"] = [huesos[j] for j in paleta[m["pal_ini"]: m["pal_ini"] + m["pal_n"]]]
    return {"mallas": mallas, "layouts": layouts, "huesos": huesos, "mats": mats, "ib_base": ib_base}


def leer_vertices(md, mg, m):
    """Arrays numpy de una submalla: pos, nor, uv, color, joints (u8 locales) y pesos, e indices."""
    nv, z = m["nv"], m["zancada"]
    crudo = np.frombuffer(mg, np.uint8, nv * z, m["vo"]).reshape(nv, z)
    lay = md["layouts"][m["layout"]]

    def campo(tipo, dtype, n):
        off, _fmt = lay[tipo]
        return crudo[:, off:off + np.dtype(dtype).itemsize * n].copy().view(dtype).reshape(nv, n)
    out = {"pos": campo(E_POS, "<f4", 3).astype(np.float32)}
    if E_NOR in lay:
        nor = campo(E_NOR, "<i2", 4)[:, :3].astype(np.float32) / 32767.0
        lon = np.linalg.norm(nor, axis=1, keepdims=True)
        out["nor"] = (nor / np.where(lon < 1e-6, 1, lon)).astype(np.float32)
    if E_UV0 in lay:
        fmt = lay[E_UV0][1]
        if fmt in (2, 3):                       # float2
            out["uv"] = campo(E_UV0, "<f4", 2).astype(np.float32)
        elif fmt == 18:                         # snorm16 x2 (la placa de ojos de algunas caras)
            out["uv"] = campo(E_UV0, "<i2", 2).astype(np.float32) / 32767.0
        elif fmt == 12:                         # unorm8 x2
            out["uv"] = campo(E_UV0, "u1", 2).astype(np.float32) / 255.0
        else:                                   # 14 = unorm16 x2 (lo normal)
            out["uv"] = campo(E_UV0, "<u2", 2).astype(np.float32) / 65535.0
    if E_PESO in lay and E_HUESO in lay:
        out["pesos"] = campo(E_PESO, "<u2", 8).astype(np.float32)
        out["joints"] = campo(E_HUESO, "u1", 8)
    if m["ni"]:
        out["ind"] = np.frombuffer(mg, "<u2", m["ni"], md["ib_base"] + m["io"]).astype(np.uint32)
    else:   # sin indices: los vertices ya van de tres en tres (las botas de c11802040)
        out["ind"] = np.arange(min(nv, m["tri"] * 3) // 3 * 3, dtype=np.uint32)
    return out


# --------------------------------------------------------------------------- G4TX (texturas)
def leer_g4tx(b):
    """[(nombre, dds_bytes)]. Cabecera: 0x04 u16 tam_cab, 0x0C u32 tam_tabla, 0x20 u16 n_tex,
    0x22 u16 n_nombres, 0x25 u8 n_recortes. Desde tam_cab: n_tex entradas de 0x30 (+4 u32 offset,
    +8 u32 tam); luego recortes (0x18 c/u), alinear 16, crc32 de nombres, bytes de id, alinear 4,
    u16 offsets de nombre y los nombres. Datos (DDS completos) desde alinear16(tam_cab + tam_tabla)."""
    if b[:4] != b"G4TX":
        raise ValueError("no es una textura G4TX")
    cab, tam_tabla = u16(b, 4), u32(b, 0x0C)
    n_tex, n_nom, n_rec = u16(b, 0x20), u16(b, 0x22), b[0x25]
    ents = [struct.unpack_from("<II", b, cab + i * 0x30 + 4) for i in range(n_tex)]
    p = cab + n_tex * 0x30 + n_rec * 0x18
    p = (p + 0xF) & ~0xF
    p += n_nom * 4
    p = (p + n_nom + 3) & ~3
    noms = [texto(b, p + u16(b, p + 2 * i)) for i in range(n_nom)]
    datos = (cab + tam_tabla + 0xF) & ~0xF
    return [(noms[i], b[datos + off: datos + off + tam]) for i, (off, tam) in enumerate(ents)]


def dds_a_imagen(dds):
    from PIL import Image
    im = Image.open(io.BytesIO(dds))
    im.load()
    return im.convert("RGBA")


def capa(nombre):
    """'u03030080_10msk' -> 'msk'; 'u03030080_10' -> '' (color base). Las capas: oc = mascara de
    sombra, msk = zona de piel, line = color del contorno, sp/spm = brillo."""
    cola = nombre.rsplit("_", 1)[-1]
    i = 0
    while i < len(cola) and cola[i].isdigit():
        i += 1
    return cola[i:]


def color_de_piel(por_hash):
    """Si la tabla no trae color de piel: el color dominante del atlas de la cara (cXXXXXXXX_10),
    que en los que si lo traen coincide con el de la tabla."""
    for nombre, dds in por_hash.values():
        if re.fullmatch(r"c\d{8}_10", nombre):
            im = dds_a_imagen(dds).convert("RGB").resize((64, 32))
            return tuple(max(im.getcolors(64 * 32))[1])
    return (254, 214, 186)


def componer_color(img, extras, piel, sombra):
    """Lo que hace el sombreador del juego, horneado en la textura de color (aproximado):
    - msk (canal R): zona de piel, que se multiplica por el color de piel del personaje.
    - oc  (canal G): mascara de sombra de dibujo animado (1 = luz, 0 = sombra fija)."""
    from PIL import Image
    a = np.asarray(img, dtype=np.float32) / 255.0
    if "msk" in extras:
        m = np.asarray(extras["msk"].resize(img.size, Image.BILINEAR), dtype=np.float32)[..., 0:1] / 255.0
        p = np.array(piel, dtype=np.float32) / 255.0
        a[..., :3] = a[..., :3] * (1 - m) + a[..., :3] * p * m
    if sombra and "oc" in extras:
        oc = extras["oc"]
        if oc.size[0] > img.size[0]:
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize(oc.size, Image.BILINEAR),
                           dtype=np.float32) / 255.0
        g = np.asarray(oc.resize((a.shape[1], a.shape[0]), Image.BILINEAR), dtype=np.float32)[..., 1:2] / 255.0
        a[..., :3] *= sombra + (1 - sombra) * g
    return Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA")


def dds_a_png(dds, max_lado=MAX_TEX, extras=None, piel=None, sombra=0.0):
    """PNG de la textura de color con la piel y la sombra horneadas, de `max_lado` como mucho.
    Primero se reduce y luego se compone, y el PNG va sin `optimize`: asi tarda 0,3 s en vez de
    1,1 s por camiseta (medido) y sale igual a la vista (PSNR 57 dB contra componer a 2048)."""
    from PIL import Image
    im = dds_a_imagen(dds)
    extras = dict(extras or {})
    if max(im.size) > max_lado:
        f = max_lado / max(im.size)
        tam = (max(1, int(im.width * f)), max(1, int(im.height * f)))
        im = im.resize(tam, Image.LANCZOS)
        extras = {k: v.resize(tam, Image.BILINEAR) if max(v.size) > max_lado else v for k, v in extras.items()}
    if extras:
        im = componer_color(im, extras, piel, sombra)
    tiene_alfa = im.getchannel("A").getextrema()[0] < 250
    if not tiene_alfa:
        im = im.convert("RGB")
    s = io.BytesIO()
    im.save(s, "PNG", compress_level=6)
    return s.getvalue(), tiene_alfa


# --------------------------------------------------------------------------- glTF
class Glb:
    """Un .glb escrito a mano (JSON + un buffer binario), sin librerias."""

    def __init__(self):
        self.j = {"asset": {"version": "2.0", "generator": "Pizarra ievr/g4.py"}, "scene": 0,
                  "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "materials": [], "textures": [],
                  "images": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
                  "accessors": [], "bufferViews": [], "buffers": [], "skins": [], "animations": []}
        self.bin = bytearray()

    def vista(self, datos, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(datos)}
        if target:
            v["target"] = target
        self.bin += datos
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def accesor(self, arr, tipo, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        comp = {np.dtype("float32"): 5126, np.dtype("uint32"): 5125, np.dtype("uint16"): 5123,
                np.dtype("uint8"): 5121}[arr.dtype]
        a = {"bufferView": self.vista(arr.tobytes(), target), "componentType": comp,
             "count": int(arr.shape[0]), "type": tipo}
        if minmax:                              # glTF lo exige en POSITION y en los tiempos
            a["min"] = [float(x) for x in arr.min(axis=0)]
            a["max"] = [float(x) for x in arr.max(axis=0)]
        self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def imagen_png(self, png):
        self.j["images"].append({"bufferView": self.vista(png), "mimeType": "image/png"})
        self.j["textures"].append({"sampler": 0, "source": len(self.j["images"]) - 1})
        return len(self.j["textures"]) - 1

    def guardar(self, ruta):
        """Escribe primero `<ruta>.tmp` y luego lo renombra: quien lea el .glb a
        la vez (la pagina del partido) nunca ve uno a medias."""
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j["buffers"] = [{"byteLength": len(self.bin)}]
        for k in ("skins", "textures", "images", "materials", "animations"):
            if not self.j[k]:
                del self.j[k]
        js = json.dumps(self.j, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        js += b" " * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        # con el numero del proceso: dos Pizarras a la vez no comparten el .tmp
        tmp = "%s.%d.tmp" % (ruta, os.getpid())
        try:
            with open(tmp, "wb") as f:
                f.write(struct.pack("<III", 0x46546C67, 2, total))
                f.write(struct.pack("<II", len(js), 0x4E4F534A))
                f.write(js)
                f.write(struct.pack("<II", len(self.bin), 0x004E4942))
                f.write(self.bin)
            # en Windows falla si alguien esta leyendo el .glb viejo justo ahora:
            # se espera un poco y se vuelve a probar
            for intento in range(5):
                try:
                    os.replace(tmp, ruta)
                    break
                except PermissionError:
                    if intento == 4:
                        raise
                    time.sleep(0.2)
        except OSError:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise


def mat_a_quat(r):
    """Cuaternio xyzw de una matriz de rotacion 3x3 (sin escala)."""
    t = np.trace(r)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
    elif r[1, 1] > r[2, 2]:
        s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def _esqueleto(g, sk, informe):
    """Un nodo por hueso con su TRS local (local = inv(mundo_padre) @ mundo) y la piel.
    Devuelve el reposo local de cada hueso (para las animaciones) y {crc32: indice}."""
    reposo, raices = [], []
    for i in range(sk["n"]):
        p = sk["padres"][i]
        loc = np.linalg.inv(sk["mundo"][p]) @ sk["mundo"][i] if p >= 0 else sk["mundo"][i]
        esc = np.linalg.norm(loc[:3, :3], axis=0)
        nodo = {"name": sk["nombres"][i]}
        t = loc[:3, 3]
        if np.abs(t).max() > 1e-7:
            nodo["translation"] = [float(x) for x in t]
        q = mat_a_quat(loc[:3, :3] / np.where(esc < 1e-9, 1, esc))
        if np.abs(q - [0, 0, 0, 1]).max() > 1e-7:
            nodo["rotation"] = [float(x) for x in q]
        if np.abs(esc - 1).max() > 1e-5:
            nodo["scale"] = [float(x) for x in esc]
        reposo.append((t.copy(), q, esc))
        g.j["nodes"].append(nodo)
    for i in range(sk["n"]):
        p = sk["padres"][i]
        if p >= 0:
            g.j["nodes"][p].setdefault("children", []).append(i)
        else:
            raices.append(i)
    ibm = np.array([np.linalg.inv(m) for m in sk["mundo"]])
    dif = np.abs(ibm[:, :3, :] - sk["inv"][:, :3, :]).max()
    informe("esqueleto: %d huesos; |inv(mundo) - inv_fichero| max = %.2e" % (sk["n"], dif))
    acc_ibm = g.accesor(ibm.transpose(0, 2, 1).reshape(-1, 16).astype(np.float32), "MAT4")
    g.j["skins"].append({"name": "esqueleto", "joints": list(range(sk["n"])), "inverseBindMatrices": acc_ibm,
                         "skeleton": raices[0]})
    g.j["scenes"][0]["nodes"] += raices
    return reposo, {h: i for i, h in enumerate(sk["hashes"])}


def _piel_de_vertices(g, v, m, nodo_hueso, cabeza, faltan):
    """JOINTS_0/WEIGHTS_0: indice local (u8) -> paleta de la submalla -> crc32 del hueso -> nodo.
    De las 8 ranuras se quedan las 4 mayores (three.js usa 4; el juego nunca usa mas de 4)."""
    pal = []
    for h in m["huesos"]:
        if h in nodo_hueso:
            pal.append(nodo_hueso[h])
        else:
            faltan.add("%08x" % h)
            pal.append(cabeza)                   # hueso que no esta en este esqueleto: va con la cabeza
    pal = np.array(pal + [0], dtype=np.int64)
    w, jl = v["pesos"], v["joints"].astype(np.int64)
    jl = np.where(jl >= len(pal) - 1, len(pal) - 1, jl)
    w = np.where(v["joints"] == 0xFF, 0, w)
    orden = np.argsort(-w, axis=1)[:, :4]
    w4 = np.take_along_axis(w, orden, 1)
    j4 = pal[np.take_along_axis(jl, orden, 1)]
    s = w4.sum(1, keepdims=True)
    sin = (s[:, 0] <= 0)
    w4 = np.where(s > 0, w4 / np.where(s > 0, s, 1), 0)
    w4[sin, 0] = 1.0
    j4[sin, 0] = pal[0] if m["huesos"] else 0
    j4 = np.where(w4 > 0, j4, 0)
    return (g.accesor(j4.astype(np.uint16), "VEC4", 34962), g.accesor(w4.astype(np.float32), "VEC4", 34962))


def _material(g, mat, por_hash, tex_glb, piel, sombra, sin_luz):
    """Material glTF sin luz (aspecto anime plano) con la textura de color, la piel tintada y la
    sombra horneadas. Devuelve (material, nombre de la textura usada)."""
    color = [h for h in mat["tex"] if h in por_hash and capa(por_hash[h][0]) == ""]
    gm = {"name": mat["nombre"], "doubleSided": False,
          "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 1.0}}
    nombre_tex = None
    if color:
        h = color[0]
        nombre_tex = por_hash[h][0]
        extras = {capa(por_hash[x][0]): por_hash[x][1] for x in mat["tex"]
                  if x in por_hash and capa(por_hash[x][0]) in ("msk", "oc")}
        if not sombra:
            extras.pop("oc", None)
        clave = (h, tuple(sorted(extras)))
        if clave not in tex_glb:
            imagenes = {k: dds_a_imagen(d) for k, d in extras.items()}
            png, alfa = dds_a_png(por_hash[h][1], MAX_TEX, imagenes, piel, sombra)
            tex_glb[clave] = (g.imagen_png(png), alfa)
        ti, alfa = tex_glb[clave]
        if extras:
            nombre_tex += "+" + "+".join(sorted(extras))
        gm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": ti}
        if alfa:
            gm["alphaMode"] = "MASK"
            gm["alphaCutoff"] = 0.5
    if sin_luz:
        gm["extensions"] = {"KHR_materials_unlit": {}}
    g.j["materials"].append(gm)
    return len(g.j["materials"]) - 1, nombre_tex


def armar(esqueleto, modelos, texturas, piel=None, sombra=SOMBRA, sin_luz=True, bancos=(), sin_avance=True,
          informe=None):
    """El .glb en memoria (un Glb) a partir de las piezas ya leidas:
    esqueleto: bytes del G4SK (o del .g4pkm que lo lleva); modelos: [(nombre, g4md, g4mg)];
    texturas: [bytes de G4TX]; piel: (r, g, b) o None (se saca de la cara);
    bancos: [(nombre del banco, [G4MT leidos], [clips])] (ver ievr/g4anim.py)."""
    informe = informe or (lambda *_: None)
    g = Glb()
    sk = leer_g4sk(esqueleto)
    por_hash = {}
    for t in texturas:
        for nombre, dds in leer_g4tx(t):
            por_hash[crc(nombre)] = (nombre, dds)
    informe("texturas: %d (%s)" % (len(por_hash), ", ".join(sorted(n for n, _ in por_hash.values()))))
    piel = tuple(piel) if piel else color_de_piel(por_hash)
    informe("color de piel: %s" % (piel,))
    reposo, nodo_hueso = _esqueleto(g, sk, informe)
    cabeza = nodo_hueso.get(crc("c_head_1_0"), 0)
    tex_glb = {}
    for nombre, md_b, mg in modelos:
        md = leer_g4md(md_b)
        prims = []
        for m in md["mallas"]:
            if "_LOD" in m["nombre"]:          # niveles de detalle lejanos: solo el LOD0
                continue
            faltan = {h for h in m["huesos"] if h not in nodo_hueso}
            if len(faltan) * 2 > len(m["huesos"]):
                # ropa de persona sobre un esqueleto de monstruo (c11500260...): saldria
                # pegada a la cabeza; el modelo propio del personaje ya es el cuerpo entero
                informe("  %s:%s: no encaja en este esqueleto (%d de %d huesos no estan): fuera"
                        % (nombre, m["nombre"], len(faltan), len(m["huesos"])))
                continue
            v = leer_vertices(md, mg, m)
            if len(v["ind"]) and int(v["ind"].max()) >= m["nv"]:
                raise ValueError("la malla %s:%s tiene un formato que aun no se entiende" % (nombre, m["nombre"]))
            # sentido de las caras: glTF quiere antihorario visto desde fuera; se compara con las normales
            tri = v["ind"].reshape(-1, 3)
            p = v["pos"].astype(np.float64)
            nf = np.cross(p[tri[:, 1]] - p[tri[:, 0]], p[tri[:, 2]] - p[tri[:, 0]])
            acuerdo = np.sign((nf * v["nor"][tri[:, 0]]).sum(1)).mean() if "nor" in v else 1
            if acuerdo < 0:
                tri = tri[:, [0, 2, 1]]
            atrib = {"POSITION": g.accesor(v["pos"], "VEC3", 34962, minmax=True)}
            if "nor" in v:
                atrib["NORMAL"] = g.accesor(v["nor"], "VEC3", 34962)
            if "uv" in v:
                atrib["TEXCOORD_0"] = g.accesor(v["uv"], "VEC2", 34962)
            if "pesos" in v:
                atrib["JOINTS_0"], atrib["WEIGHTS_0"] = _piel_de_vertices(g, v, m, nodo_hueso, cabeza, faltan)
            mat, nombre_tex = _material(g, md["mats"][m["mat"]], por_hash, tex_glb, piel, sombra, sin_luz)
            prims.append({"attributes": atrib, "material": mat,
                          "indices": g.accesor(tri.reshape(-1).astype(np.uint32), "SCALAR", 34963)})
            informe("  %s:%s: %d vert, %d tri, tex=%s%s" % (nombre, m["nombre"], m["nv"], len(tri), nombre_tex,
                                                           ", huesos que faltan %s" % sorted(faltan) if faltan else ""))
        if not prims:                          # glTF no admite mallas vacias
            continue
        g.j["meshes"].append({"name": nombre, "primitives": prims})
        g.j["nodes"].append({"name": nombre, "mesh": len(g.j["meshes"]) - 1, "skin": 0})
        g.j["scenes"][0]["nodes"].append(len(g.j["nodes"]) - 1)
    if bancos:
        from ievr import g4anim
        for nombre_banco, mts, clips in bancos:
            for quien in clips:
                g4anim.anadir_animacion(g, sk, reposo, 0, nombre_banco, mts, quien, informe, sin_avance)
    if sin_luz:
        g.j["extensionsUsed"] = ["KHR_materials_unlit"]
    return g


# --------------------------------------------------------------------------- el juego instalado
def _firma(carpeta):
    """Lo que cambia si el juego se actualiza: nombre, tamano y fecha de cada .cpk."""
    h = zlib.crc32(b"")
    for e in sorted(os.scandir(carpeta), key=lambda x: x.name):
        if e.name.lower().endswith(".cpk"):
            st = e.stat()
            h = zlib.crc32(("%s:%d:%d;" % (e.name, st.st_size, st.st_mtime_ns)).encode(), h)
    return "%08x" % h


def _hace_falta(ruta):
    """Del juego solo interesan las piezas de personajes (unos 30.000 de 255.000 ficheros)."""
    return ruta.startswith(("data/common/chr/", "data/dx11/chr/")) and \
        ruta.endswith((".g4sk", ".g4pkm", ".g4md", ".g4mg", ".g4tx", ".g4pk"))


class Juego:
    """Los ficheros del juego instalado que hacen falta para los modelos.

    El indice (ruta -> .cpk, offset, tamanos) se lee de los TOC de los 936
    paquetes (~1,5 s) y se guarda en `cache` (indice.json) para la proxima vez;
    se rehace solo si cambian los .cpk (una actualizacion del juego). Lo que se
    saca se guarda un rato en memoria: el banco de animaciones (7 MB) y las
    camisetas de un equipo valen para muchos jugadores seguidos."""

    MEMORIA = 192 << 20

    def __init__(self, carpeta, cache=None):
        if not carpeta or not os.path.isdir(carpeta):
            raise FileNotFoundError("no encuentro la carpeta del juego (data/packs)")
        self.carpeta = carpeta
        self.ficheros = self._indice(cache)
        if not self.ficheros:
            raise FileNotFoundError("en %s no estan los paquetes .cpk del juego" % carpeta)
        self._memoria = OrderedDict()
        self._bytes = 0
        self.objetos = {}                     # cosas ya leidas (bancos de animacion)

    def _indice(self, cache):
        firma = _firma(self.carpeta)
        if cache:
            try:
                with open(cache, encoding="utf-8") as fh:
                    d = json.load(fh)
                if d.get("version") == VERSION_INDICE and d.get("firma") == firma:
                    paq = d["paquetes"]
                    return {r: (paq[v[0]], v[1], v[2], v[3]) for r, v in d["ficheros"].items()}
            except (OSError, ValueError, KeyError, IndexError, TypeError):
                pass
        from ievr import cpk
        rutas, errores = cpk.indice_de_carpeta(self.carpeta, _hace_falta)
        paq = sorted({nom for nom, _e in rutas.values()})
        num = {n: i for i, n in enumerate(paq)}
        ficheros = {r[len("data/"):]: (nom, e["offset"], e["tam"], e["tam_extraido"]) for r, (nom, e) in rutas.items()}
        # si algun paquete no se pudo leer (el antivirus o Steam lo tenian abierto) no se guarda:
        # la firma no cambiaria y sus ficheros faltarian hasta la proxima actualizacion del juego
        if cache and not errores:
            d = {"version": VERSION_INDICE, "firma": firma, "paquetes": paq,
                 "ficheros": {r: [num[v[0]], v[1], v[2], v[3]] for r, v in sorted(ficheros.items())}}
            os.makedirs(os.path.dirname(os.path.abspath(cache)), exist_ok=True)
            with open(cache + ".tmp", "w", encoding="utf-8") as fh:
                json.dump(d, fh, separators=(",", ":"))
            os.replace(cache + ".tmp", cache)
        return ficheros

    def hay(self, ruta):
        return ruta in self.ficheros

    def leer(self, ruta):
        """Los bytes de `ruta` (p. ej. common/chr/c000101/c000101.g4sk), descifrados y descomprimidos."""
        if ruta in self._memoria:
            self._memoria.move_to_end(ruta)
            return self._memoria[ruta]
        if ruta not in self.ficheros:
            raise FileNotFoundError("el juego no trae %s" % ruta)
        from ievr import cpk
        nom, off, tam, tamx = self.ficheros[ruta]
        datos = cpk.extraer(os.path.join(self.carpeta, nom),
                            {"dir": os.path.dirname(ruta), "nombre": os.path.basename(ruta),
                             "offset": off, "tam": tam, "tam_extraido": tamx})
        self._memoria[ruta] = datos
        self._bytes += len(datos)
        while self._bytes > self.MEMORIA and len(self._memoria) > 1:
            _r, viejo = self._memoria.popitem(last=False)
            self._bytes -= len(viejo)
        return datos


# --------------------------------------------------------------------------- un personaje
def piezas(codigo):
    """La fila de `modelos-personaje.csv` de ese codigo (cXXXXXXXX), o None."""
    from ievr import reglas
    if "modelos_personaje" not in reglas._cache:
        reglas._cache["modelos_personaje"] = {f["codigo"]: f for f in reglas._tabla("modelos-personaje.csv")}
    return reglas._cache["modelos_personaje"].get(codigo)


def rutas_de(f):
    """Los ficheros del juego que hacen falta para la fila `f` de modelos-personaje.csv:
    (esqueleto, [(nombre, g4md, g4mg)], [g4tx], banco de animacion o None)."""
    modelos, texturas = [], []
    for k in ("uniforme", "botas", "guantes"):
        if f.get(k):
            m = "common/chr/_uniform/" + f[k]
            modelos.append((os.path.basename(f[k]), m + ".g4md", m + ".g4mg"))
            if f.get(k + "_tex"):
                texturas.append("dx11/chr/_uniform/%s/%s.g4tx" % (f[k].split("/")[0], f[k + "_tex"]))
    cara = f["cara"]
    modelos.append((os.path.basename(cara), "common/chr/%s.g4md" % cara, "common/chr/%s.g4mg" % cara))
    texturas.append("dx11/chr/%s.g4tx" % cara)
    banco = "common/chr/{0}/{0}_{1}.g4pk".format(f["anim"], BANCO_PARTIDO) if f.get("anim") else None
    return "common/chr/" + f["esqueleto"], modelos, texturas, banco


def version_de(ruta):
    """La VERSION_MODELO con la que se hizo un .glb (0 si es de antes, si esta cortado o si no
    se puede leer). Cortado: el JSON va al principio y se leeria bien aunque falte la geometria
    (un apagon justo despues de escribirlo); la cabecera dice cuanto mide entero."""
    try:
        with open(ruta, "rb") as fh:
            cab = fh.read(20)
            if cab[:4] != b"glTF" or cab[16:20] != b"JSON":
                return 0
            if struct.unpack_from("<I", cab, 8)[0] != os.fstat(fh.fileno()).st_size:
                return 0
            j = json.loads(fh.read(struct.unpack_from("<I", cab, 12)[0]))
        return int(j.get("asset", {}).get("extras", {}).get("version") or 0)
    except (OSError, ValueError, AttributeError, struct.error):
        return 0


def _leer_g4md(juego, ruta):
    """El .g4md, o el que va dentro del .g4pkm de al lado (unos pocos personajes, como Veronica
    Camry o algunos monstruos, traen asi su modelo entero junto a su esqueleto)."""
    if juego.hay(ruta):
        return juego.leer(ruta)
    pkm = ruta[:-len(".g4md")] + ".g4pkm"
    if juego.hay(pkm):
        md = next((x for _n, x in leer_g4pk(juego.leer(pkm)) if x[:4] == b"G4MD"), None)
        if md:
            return md
    raise FileNotFoundError("el juego no trae %s" % ruta)


def convertir(codigo, carpeta_juego, destino, juego=None, informe=None):
    """Convierte el personaje `codigo` (p. ej. c03030080) a `<destino>/<codigo>.glb` sacando las
    piezas del juego instalado en `carpeta_juego` (su data/packs). Devuelve la ruta del .glb.

    `juego` (un Juego) se puede pasar para convertir varios seguidos sin rehacer el indice y
    aprovechando lo ya sacado; si no, se crea uno con la cache `<destino>/indice.json`."""
    from ievr import g4anim
    informe = informe or (lambda *_: None)
    if not re.fullmatch(r"[A-Za-z0-9_]+", codigo or ""):
        raise ValueError("codigo de modelo raro: %r" % codigo)
    f = piezas(codigo)
    if not f:
        raise LookupError("no se con que piezas se arma %s (no esta en modelos-personaje.csv)" % codigo)
    os.makedirs(destino, exist_ok=True)
    juego = juego or Juego(carpeta_juego, os.path.join(destino, "indice.json"))
    esqueleto, modelos, texturas, banco = rutas_de(f)
    leidos = [(n, _leer_g4md(juego, md), juego.leer(mg)) for n, md, mg in modelos]
    texs = []
    for t in texturas:
        if juego.hay(t):
            texs.append(juego.leer(t))
        else:
            informe("  (el juego no trae %s: esa pieza sale sin textura)" % t)
    bancos = []
    if banco and juego.hay(banco):
        if banco not in juego.objetos:
            juego.objetos[banco] = g4anim.bancos_de(juego.leer(banco))
        bancos.append((os.path.splitext(os.path.basename(banco))[0], juego.objetos[banco], ANIM_PARTIDO))
    piel = bytes.fromhex(f["piel"]) if f.get("piel") else None
    g = armar(juego.leer(esqueleto), leidos, texs, piel=piel, bancos=bancos, informe=informe)
    g.j["asset"]["extras"] = {"version": VERSION_MODELO, "codigo": codigo,
                              "piezas": {k: v for k, v in f.items() if v and k != "codigo"}}
    ruta = os.path.join(destino, codigo + ".glb")
    g.guardar(ruta)
    informe("-> %s (%.2f MB)" % (ruta, os.path.getsize(ruta) / 1e6))
    return ruta
