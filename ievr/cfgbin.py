"""Lector propio de los .cfg.bin (formato T2B de Level-5) como lista plana de entradas (O-323).

Lo usan los guiones de los eventos de VR (las supertecnicas y las invocaciones:
`common/event_cfg/evt/<ev>.cfg.bin` y `eff/<ev>_eff.cfg.bin`), los `.objbin` de los
efectos y las tablas del juego que hagan falta. El `volcado.exe` de referencia/
revienta con los guiones (indice fuera de rango), por eso este lector.

Formato (little endian), comprobado con los 1.461 guiones de ev60-85:
  cabecera  u32 n entradas, u32 inicio de los textos, u32 tamano de los textos, u32 n textos
  entrada   u32 crc32 del nombre, u8 n parametros, tipos de 2 bits (0 texto, 1 entero,
            2 float) en ceil(n/4) bytes, relleno a 4, y n palabras de 4 bytes (el texto es
            un offset desde el inicio de los textos; -1 = sin texto)
  nombres   detras de los textos (alineado a 16): u32 tamano, u32 n, u32 offset y u32
            tamano de sus textos, n x (crc32, offset) y los nombres
Los nombres de las ordenes de los guiones no estan en la tabla (solo su crc32): ievr/evento.py
les pone nombre por lo que hacen.

Codigo propio (O-323).
"""
import struct
import zlib


def crc(nombre):
    return zlib.crc32(nombre.encode("utf-8")) & 0xFFFFFFFF


def _texto(b, o):
    return bytes(b[o:b.index(b"\0", o)]).decode("utf-8", "replace")


def leer(b):
    """[(nombre, [valores])] en el orden del fichero. Si el nombre no esta en la tabla, su
    crc32 en hexadecimal ("8b9492dd"). Enteros con signo; floats redondeados a 5 decimales."""
    n, o_txt, t_txt, _n_txt = struct.unpack_from("<4I", b, 0)
    p = 0x10
    crudas = []
    for _ in range(n):
        h, cnt = struct.unpack_from("<IB", b, p)
        p += 5
        nb = (cnt + 3) // 4
        tipos = []
        for k in range(nb):
            v = b[p + k]
            for j in range(4):
                tipos.append((v >> (2 * j)) & 3)
        p = (p + nb + 3) & ~3
        vals = []
        for k in range(cnt):
            t = tipos[k]
            if t == 0:
                off = struct.unpack_from("<i", b, p)[0]
                vals.append(None if off < 0 else _texto(b, o_txt + off))
            elif t == 1:
                vals.append(struct.unpack_from("<i", b, p)[0])
            elif t == 2:
                vals.append(round(struct.unpack_from("<f", b, p)[0], 5))
            else:
                vals.append(bytes(b[p:p + 4]).hex())
            p += 4
        crudas.append((h, vals))
    nombres = {}
    q = (o_txt + t_txt + 15) & ~15
    try:
        _tam, cnt, o_s, _t_s = struct.unpack_from("<4I", b, q)
        for k in range(cnt):
            h, off = struct.unpack_from("<II", b, q + 0x10 + 8 * k)
            nombres[h] = _texto(b, q + o_s + off)
    except (struct.error, ValueError):
        pass
    return [(nombres.get(h, "%08x" % h), v) for h, v in crudas]
