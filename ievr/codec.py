#!/usr/bin/env python3
"""Cifrado y contenedor del save de Inazuma Eleven: Victory Road.

La clave es crc32 del NOMBRE DEL FICHERO en disco. Renombrar el fichero lo
inutiliza: no es una convencion, es literalmente la clave.

Esquema de cifrado y checksums portado de
  alfizari/Inazuma-Eleven-Victory-Road-Save-Editor  (MIT)
  adhyayanrathi01/inazuma-eleven-victory-road-save-editor  (MIT)
Ver referencia/editor-ref/NOTES.md.

Nada aqui se direcciona por offset fijo: los blobs salen del directorio de
cabecera, para que un parche del juego no rompa la herramienta.
"""
import binascii
import struct

MAGIC = 0x9DCE66C3
HEADER_SIZE = 0x800
OFF_HDR_CRC = 0x04
OFF_NAME = 0x10
OFF_DIR = 0x50
DIR_STRIDE = 0x80

CRC_TABLE = []
for _i in range(256):
    _c = _i
    for _ in range(8):
        _c = 0xEDB88320 ^ (_c >> 1) if _c & 1 else _c >> 1
    CRC_TABLE.append(_c)


def crc32(b):
    return binascii.crc32(b) & 0xFFFFFFFF


def _xor_py(data, key):
    """Keystream auto-inverso: un CRC por bloque de 4 bytes, 2 bits de cada carril."""
    k = [(key >> s) & 0xFF for s in (0, 8, 16, 24)]
    out = bytearray(data)
    crc = 0
    for i in range(len(out)):
        if (i & 3) == 0:
            eax = (~i) & 0xFFFFFFFF
            for kb in k:
                eax = (eax >> 8) ^ CRC_TABLE[(eax & 0xFF) ^ kb]
            crc = (~eax) & 0xFFFFFFFF
        r = (i & 3) << 1
        ks = (crc >> r) & 3
        ks = (ks << 2) | ((crc >> (r + 8)) & 3)
        ks = (ks << 2) | ((crc >> (r + 16)) & 3)
        ks = (ks << 2) | ((crc >> (r + 24)) & 3)
        out[i] ^= ks
    return bytes(out)


def _xor_np(data, key, np):
    """Mismo cifrado, vectorizado. El CRC de cada bloque depende solo de su indice,
    asi que se calculan todos de golpe. ~40x mas rapido; 12 MB lo necesitan."""
    u32 = np.uint32
    n = len(data)
    nblocks = (n + 3) // 4
    tab = np.array(CRC_TABLE, dtype=np.uint32)
    x = ~(np.arange(nblocks, dtype=np.uint32) << u32(2))
    for s in (0, 8, 16, 24):
        x = (x >> u32(8)) ^ tab[(x & u32(0xFF)) ^ u32((key >> s) & 0xFF)]
    crc = ~x
    ks = np.empty((nblocks, 4), dtype=np.uint8)
    for pos in range(4):
        r = pos << 1
        v = (crc >> u32(r)) & u32(3)
        for shift in (8, 16, 24):
            v = (v << u32(2)) | ((crc >> u32(r + shift)) & u32(3))
        ks[:, pos] = v.astype(np.uint8)
    return (np.frombuffer(data, dtype=np.uint8) ^ ks.reshape(-1)[:n]).tobytes()


def xor(data, key):
    try:
        import numpy
    except ImportError:
        return _xor_py(data, key)
    return _xor_np(data, key, numpy)


def decrypt(raw, savename, strict=True):
    """Descifra y verifica. savename es el nombre EN DISCO, con prefijo incluido."""
    plain = xor(raw, crc32(savename.encode("ascii")))
    magic = struct.unpack_from("<I", plain, 0)[0]
    if magic != MAGIC:
        raise ValueError(
            "magia 0x%08X (se esperaba 0x%08X).\n"
            "La clave es crc32 del nombre exacto del fichero: comprueba que %r no se renombro."
            % (magic, MAGIC, savename)
        )
    embedded = plain[OFF_NAME:OFF_NAME + 64].split(b"\0")[0].decode("ascii", "replace")
    if strict and embedded != savename:
        raise ValueError(
            "la cabecera dice %r pero el fichero se llama %r: el fichero fue renombrado."
            % (embedded, savename)
        )
    return plain


def blobs(plain):
    """(offset_entrada, nombre, offset_blob, tamano) por cada entrada del directorio."""
    for n in range((HEADER_SIZE - OFF_DIR) // DIR_STRIDE):
        e = OFF_DIR + n * DIR_STRIDE
        _, size, off = struct.unpack_from("<III", plain, e)
        name = plain[e + 12:e + DIR_STRIDE].split(b"\0")[0]
        if not name:
            return
        if HEADER_SIZE + off + size > len(plain):
            raise ValueError(
                "el blob %s se sale del fichero: me niego a escribir"
                % name.decode(errors="replace"))
        yield e, name.decode("ascii", "replace"), HEADER_SIZE + off, size


def fix_checksums(plain):
    """Recalcula el CRC de cada blob y DESPUES el de la cabecera, que los cubre."""
    buf = bytearray(plain)
    for e, _, off, size in blobs(buf):
        struct.pack_into("<I", buf, e, crc32(bytes(buf[off:off + size])))
    struct.pack_into("<I", buf, OFF_HDR_CRC, crc32(bytes(buf[0x08:HEADER_SIZE])))
    return bytes(buf)


def encrypt(plain, savename):
    return xor(fix_checksums(plain), crc32(savename.encode("ascii")))


def checksum_offsets(plain):
    """Offsets que cambian solos al reescribir: ruido puro en una comparacion."""
    out = {OFF_HDR_CRC + i for i in range(4)}
    for e, _, _, _ in blobs(plain):
        out.update(e + i for i in range(4))
    return out


def load(path, name=None, strict=True):
    """Lee un save de disco y lo devuelve descifrado."""
    import os
    name = name or os.path.basename(path)
    with open(path, "rb") as fh:
        return decrypt(fh.read(), name, strict=strict)
