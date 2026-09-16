#!/usr/bin/env python3
"""Lector de ficheros `.cfg.bin` del juego (formato RDBN), en Python.

    py herramientas\\rdbn.py FICHERO            (lista las tablas)
    py herramientas\\rdbn.py FICHERO TABLA      (vuelca la tabla en TSV)

Es el mismo formato que lee `referencia/volcado` (ievr_cfg_bin_editor), pero
este no se cae con los tipos que aquel no conoce: lo que no sabe leer lo saca
como bytes, y los tamanos de 8 y 12 bytes de tipo desconocido como 2 o 3
floats (posiciones). Hacia falta para `formation_config` (NOTAS O-160).

Estructura (sacada de ievr_cfg_bin_editor-core/src/rdbn):
  cabecera: magic "RDBN", i16 tamano, i32 version, i16 data_offset, i32 data_size,
            0x14 bytes, y luego i16: type_offset, type_count, field_offset,
            field_count, root_offset, root_count, string_hash_offset,
            string_offsets_offset, hash_count, value_offset; i32 string_offset.
  Las tablas de entradas van en bloques de 32 bytes; los offsets van en
  unidades de 4 bytes y se suman a data_offset.
"""
import struct
import sys


def _u32(b, o): return struct.unpack_from("<I", b, o)[0]
def _i32(b, o): return struct.unpack_from("<i", b, o)[0]
def _i16(b, o): return struct.unpack_from("<h", b, o)[0]


def leer(ruta):
    b = open(ruta, "rb").read()
    if b[:4] != b"RDBN":
        raise SystemExit("%s no es un RDBN" % ruta)
    data = _i16(b, 10) << 2
    o = 0x24
    type_off, type_n, field_off, field_n, root_off, root_n, sh_off, so_off, hash_n, val_off = \
        struct.unpack_from("<10h", b, o)
    str_off = _i32(b, o + 20) + data
    # cadenas: hash -> texto
    hashes = [_u32(b, (sh_off << 2) + data + 4 * i) for i in range(hash_n)]
    offs = [_i32(b, (so_off << 2) + data + 4 * i) for i in range(hash_n)]
    cadenas = {}
    for h, of in zip(hashes, offs):
        p = str_off + of
        fin = b.index(b"\0", p)
        cadenas[h] = b[p:fin].decode("utf-8", "replace")
    # entradas
    def entradas(off, n, tam, fmt):
        base = (off << 2) + data
        return [struct.unpack_from(fmt, b, base + 32 * i) for i in range(n)]
    raices = entradas(root_off, root_n, 20, "<hhiiiI")       # type_index, _, value_offset, value_size, value_count, name_hash
    tipos = entradas(type_off, type_n, 12, "<IIhh")          # name_hash, unk, field_index, field_count
    campos = entradas(field_off, field_n, 20, "<Ihhiii")     # name_hash, type, category, size, offset, count
    valor_base = (val_off << 2) + data

    def lee_valor(t, tam, p):
        if t == 3: return bool(b[p])
        if t == 4: return b[p]
        if t in (5, 9): return _i16(b, p)
        if t in (6, 10): return _i32(b, p)
        if t == 0xD: return struct.unpack_from("<f", b, p)[0]
        if t == 0xF: return _u32(b, p)
        if t in (0x12, 0x13): return struct.unpack_from("<4f", b, p)
        if t == 0x14:
            of = _u32(b, p)
            if str_off + of < len(b):
                fin = b.index(b"\0", str_off + of); return b[str_off + of:fin].decode("utf-8", "replace")
            return of
        if t == 0x15: return struct.unpack_from("<hh", b, p)
        if tam == 8: return struct.unpack_from("<2f", b, p)
        if tam == 12: return struct.unpack_from("<3f", b, p)
        if tam == 16: return struct.unpack_from("<4f", b, p)
        if tam == 4: return _i32(b, p)
        return b[p:p + tam].hex()

    tablas = {}
    for type_index, _, voff, vsize, vcount, nh in raices:
        _, _, fi, fc = tipos[type_index]
        defs = campos[fi:fi + fc]
        nombres = [cadenas.get(c[0], "%08X" % c[0]) for c in defs]
        filas = []
        for j in range(vcount):
            base = valor_base + voff + j * vsize
            fila = []
            for nh2, t, cat, tam, foff, cnt in defs:
                vals = [lee_valor(t, tam, base + foff + k * tam) for k in range(cnt)]
                fila.append(vals[0] if cnt == 1 else vals)
            filas.append(fila)
        tablas[cadenas.get(nh, "%08X" % nh)] = {"campos": nombres, "tipos": [(c[1], c[3], c[5]) for c in defs], "filas": filas}
    return tablas


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    tablas = leer(sys.argv[1])
    if len(sys.argv) == 2:
        for n, t in tablas.items():
            print("%s\t%d filas\t%s" % (n, len(t["filas"]), ", ".join("%s(t%d x%d)" % (c, ti[0], ti[2]) for c, ti in zip(t["campos"], t["tipos"]))))
        return 0
    t = tablas[sys.argv[2]]
    print("\t".join(t["campos"]))
    for f in t["filas"]:
        print("\t".join(str(x) for x in f))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
