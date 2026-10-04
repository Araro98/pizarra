"""Lector propio de los paquetes .cpk de Inazuma Eleven: Victory Road (PC).

Para que Pizarra saque del juego instalado de cada uno lo que necesita (los
modelos 3D del partido, O-293) sin herramientas de terceros: el toolbox que se
usaba antes no tiene licencia y no se puede repartir ni copiar.

Solo LEE los .cpk (nunca escribe en la carpeta del juego). Python 3 + numpy.

    from ievr import cpk
    for e in cpk.indice(r"...\\data\\packs\\0005....cpk"):   # cabecera + TOC, sin leer el resto
        print(e["dir"], e["nombre"], e["offset"], e["tam"], e["tam_extraido"])
    datos = cpk.extraer(ruta_cpk, entrada)                 # descifra y, si hace falta, descomprime

Linea de ordenes (para mirar a mano):
    py -m ievr.cpk indice <fichero.cpk>                  lista el TOC
    py -m ievr.cpk sacar <fichero.cpk> <regex> <carpeta> saca los ficheros cuya ruta case

De donde sale (todo escrito para Pizarra; no hay codigo copiado de nadie):
- Cifrado: deducido por analisis de caja negra (el binario del toolbox como
  oraculo: meterle ficheros de ceros con distintos nombres y mirar lo que
  sale; su codigo NO se leyo). Cada palabra de 4 bytes del fichero se cifra con
  XOR de una palabra de clave sacada del CRC-32 estandar (zlib.crc32) del
  nombre del fichero seguido del offset de la palabra (u32 little endian,
  modulo 2^32), con los bits barajados en grupos de 2.
- Tablas @UTF / TOC del CPK de CRI: formato publico (descripciones de la
  comunidad, p. ej. el gist "Valkyria Chronicles 3: file formats" de
  unknownbrackets, que es prosa sin codigo) y lo comprobado a mano.
- CRILAYLA: segun la descripcion publica del formato (mismo gist y otras):
  flujo de bits leido desde el final, MSB primero, salida escrita de atras
  hacia delante, 0x100 bytes finales sin comprimir que son el principio del
  fichero.

Licencias de lo que se miro y NO se uso: Viola (sin licencia: no se leyo),
CriFsV2Lib (LGPL-3.0: no se leyo), ievr_toolbox (sin licencia: solo su README y
su binario como caja negra).

Comprobado byte a byte contra el toolbox: 1.005 ficheros sacados al azar
(tres muestras), cinco .cpk descifrados enteros, el TOC de los 936 paquetes
(255.303 ficheros en 1,4 s), el fichero comprimido mas grande del juego
(347 MB) y offsets de mas de 4 GiB.
"""
import os
import re
import struct
import sys
import zlib

import numpy as np

__all__ = ["descifrar", "indice", "indice_de_carpeta", "extraer", "guardar", "sacar", "crilayla",
           "flujo_clave", "ruta_de"]

# --------------------------------------------------------------------------------------------
# Cifrado
# --------------------------------------------------------------------------------------------


def _baraja(c):
    """Baraja los bits de un crc32 (entero o array uint32) para formar la palabra de clave.

    Si B0..B3 son los bytes de c de mas a menos significativo, el byte j de la palabra (little
    endian) se forma con los bits 2j y 2j+1 de B0, B1, B2 y B3 (en ese orden, de abajo arriba).
    """
    if isinstance(c, np.ndarray):
        c = c.astype(np.uint32)
        o = np.zeros_like(c)
        for j in range(4):
            for m in range(4):
                o |= ((c >> np.uint32(24 - 8 * m + 2 * j)) & np.uint32(3)) << np.uint32(8 * j + 2 * m)
        return o
    o = 0
    for j in range(4):
        for m in range(4):
            o |= ((c >> (24 - 8 * m + 2 * j)) & 3) << (8 * j + 2 * m)
    return o


_TABLAS = None


def _tablas():
    """Parte lineal del CRC respecto al offset, ya barajada.

    crc32(nombre + le32(o)) = crc32(nombre + le32(0)) XOR [crc32(le32(o)) XOR crc32(le32(0))]
    (para mensajes de igual longitud el CRC es afin), y la baraja de bits es lineal, asi que
    clave(o) = K(nombre) XOR BAJA[o & 0xFFFF] XOR ALTA[o >> 16].
    """
    global _TABLAS
    if _TABLAS is None:
        cero = zlib.crc32(b"\0\0\0\0")
        por_byte = []
        for q in range(4):
            v = np.array([zlib.crc32(bytes(q) + bytes([b]) + bytes(3 - q)) ^ cero for b in range(256)],
                         dtype=np.uint32)
            por_byte.append(_baraja(v))
        k = np.arange(1 << 14, dtype=np.uint32) * np.uint32(4)          # offsets 0,4,..,0xFFFC
        baja = por_byte[0][k & 0xFF] ^ por_byte[1][k >> 8]
        s = np.arange(1 << 16, dtype=np.uint32)                       # bits 16..31 del offset
        alta = por_byte[2][s & 0xFF] ^ por_byte[3][s >> 8]
        _TABLAS = (baja, alta)
    return _TABLAS


def _clave_nombre(nombre_fichero):
    nombre = os.path.basename(nombre_fichero).encode("utf-8")
    return np.uint32(_baraja(zlib.crc32(nombre + b"\0\0\0\0")))


def flujo_clave(nombre_fichero, inicio, n):
    """Bytes del flujo de clave del fichero `nombre_fichero` para [inicio, inicio + n)."""
    if n <= 0:
        return np.zeros(0, np.uint8)
    baja, alta = _tablas()
    k = _clave_nombre(nombre_fichero)
    seg0 = inicio >> 16                      # tramos de 64 KiB: misma parte alta del offset
    seg1 = (inicio + n - 1) >> 16
    segs = np.arange(seg0, seg1 + 1, dtype=np.uint64) & np.uint64(0xFFFF)   # offset modulo 2^32
    c = alta[segs.astype(np.int64)] ^ k
    palabras = (baja[None, :] ^ c[:, None]).reshape(-1)
    b = palabras.astype("<u4", copy=False).view(np.uint8)
    d = inicio - (seg0 << 16)
    return b[d:d + n]


def descifrar(datos, nombre_fichero, inicio=0):
    """Descifra (o cifra: es un XOR) `datos`, que estan en el byte `inicio` del fichero `nombre_fichero`.

    Por defecto el trozo empieza en el byte 0 del fichero. Solo cuenta el nombre (con extension),
    no la carpeta. Va por tramos para no gastar mucha memoria con trozos grandes.
    """
    a = np.frombuffer(datos, dtype=np.uint8)
    out = np.empty_like(a)
    paso = 1 << 26
    for p in range(0, len(a), paso):
        q = min(len(a), p + paso)
        np.bitwise_xor(a[p:q], flujo_clave(nombre_fichero, inicio + p, q - p), out=out[p:q])
    return out.tobytes()


# --------------------------------------------------------------------------------------------
# Tablas @UTF de CRI (big endian; offsets relativos a tabla + 8)
# --------------------------------------------------------------------------------------------

_TAM = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 8, 7: 8, 8: 4, 9: 8, 0xA: 4, 0xB: 8}
_FMT = {0: ">B", 1: ">b", 2: ">H", 3: ">h", 4: ">I", 5: ">i", 6: ">Q", 7: ">q", 8: ">f", 9: ">d"}


def _utf(b, o=0):
    """Lee la tabla @UTF que empieza en b[o:]. Devuelve una lista de filas (dict columna -> valor).
    Columnas: u8 (almacen | tipo) + u32 nombre [+ valor si almacen 0x30 = constante]; 0x50 = por fila,
    0x10 = vacia. Tipos: 0..7 enteros u8/s8/u16/s16/u32/s32/u64/s64, 8 f32, 9 f64, A texto, B datos."""
    if b[o:o + 4] != b"@UTF":
        raise ValueError("no hay tabla @UTF en 0x%X" % o)
    base = o + 8
    _ver, off_filas, off_txt, off_dat, _nom, ncol, tam_fila, nfil = struct.unpack_from(">HHIIIHHI", b, o + 8)

    def texto(k):
        s = base + off_txt + k
        return bytes(b[s:b.index(b"\0", s)]).decode("utf-8", "replace")

    def valor(tipo, p):
        if tipo == 0xA:
            return texto(struct.unpack_from(">I", b, p)[0])
        if tipo == 0xB:
            d, n = struct.unpack_from(">II", b, p)
            return bytes(b[base + off_dat + d: base + off_dat + d + n])
        return struct.unpack_from(_FMT[tipo], b, p)[0]

    cols = []
    p = o + 0x20
    for _ in range(ncol):
        f = b[p]
        nom = texto(struct.unpack_from(">I", b, p + 1)[0])
        p += 5
        alm, tipo = f & 0xF0, f & 0x0F
        const = None
        if alm == 0x30:
            const = valor(tipo, p)
            p += _TAM[tipo]
        cols.append((nom, alm, tipo, const))
    filas = []
    for r in range(nfil):
        q = base + off_filas + r * tam_fila
        fila = {}
        for nom, alm, tipo, const in cols:
            if alm == 0x50:
                fila[nom] = valor(tipo, q)
                q += _TAM[tipo]
            else:
                fila[nom] = const
        filas.append(fila)
    return filas


# --------------------------------------------------------------------------------------------
# Indice (cabecera + TOC)
# --------------------------------------------------------------------------------------------


class _Lector:
    """Lee trozos del .cpk ya descifrados (detecta si el paquete no va cifrado)."""

    def __init__(self, ruta):
        self.ruta = ruta
        self.nombre = os.path.basename(ruta)
        self.f = open(ruta, "rb")
        cab = self.f.read(4)
        self.cifrado = cab != b"CPK "
        if self.cifrado and descifrar(cab, self.nombre) != b"CPK ":
            raise ValueError("%s: no parece un CPK (ni en claro ni cifrado con su nombre)" % self.nombre)

    def leer(self, offset, n):
        self.f.seek(offset)
        d = self.f.read(n)
        return descifrar(d, self.nombre, offset) if self.cifrado else d

    def tabla(self, offset, firma):
        """Lee el paquete de 16 bytes `firma` + su tabla @UTF, empezando en `offset`."""
        cab = self.leer(offset, 0x18)
        if cab[:4] != firma or cab[0x10:0x14] != b"@UTF":
            raise ValueError("%s: no hay %r + @UTF en 0x%X" % (self.nombre, firma, offset))
        tam = struct.unpack_from(">I", cab, 0x14)[0] + 8
        return _utf(self.leer(offset + 0x10, tam))

    def cerrar(self):
        self.f.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.cerrar()


def cabecera(ruta_cpk):
    """Fila unica de la tabla de cabecera del CPK (TocOffset, ContentOffset, Files, Align...)."""
    with _Lector(ruta_cpk) as lec:
        return lec.tabla(0, b"CPK ")[0]


def indice(ruta_cpk):
    """Lista de ficheros del .cpk: [{dir, nombre, offset, tam, tam_extraido, id}], leyendo solo la
    cabecera y el TOC. `offset` es absoluto (desde el byte 0 del .cpk); `tam` es lo que ocupa dentro
    (comprimido si tam < tam_extraido)."""
    with _Lector(ruta_cpk) as lec:
        cab = lec.tabla(0, b"CPK ")[0]
        toc = cab.get("TocOffset")
        if not toc:
            raise ValueError("%s: sin TOC (solo ITOC); no soportado" % lec.nombre)
        filas = lec.tabla(toc, b"TOC ")
        cont = cab.get("ContentOffset") or toc
        base = min(toc, cont)          # los FileOffset del TOC van desde el TOC (o desde el contenido si va antes)
        out = []
        for r in filas:
            tam = r["FileSize"]
            tamx = r.get("ExtractSize")
            out.append({
                "dir": r.get("DirName") or "",
                "nombre": r.get("FileName") or "",
                "offset": base + r["FileOffset"],
                "tam": tam,
                "tam_extraido": tamx if tamx is not None else tam,
                "id": r.get("ID"),
            })
        return out


def ruta_de(entrada):
    """'dir/nombre' de una entrada del indice."""
    return (entrada["dir"] + "/" + entrada["nombre"]).lstrip("/")


def paquetes(carpeta):
    """Los .cpk de una carpeta `data/packs`, por orden de nombre."""
    return sorted(f for f in os.listdir(carpeta) if f.lower().endswith(".cpk"))


def indice_de_carpeta(carpeta, quedarse=None):
    """Indice de TODOS los .cpk de `carpeta`: ({ruta: (nombre_cpk, entrada)}, errores).

    Solo lee la cabecera y el TOC de cada paquete (los 936 del juego en ~1,5 s).
    `quedarse(ruta)` decide que rutas se guardan (todas si es None): el juego
    trae 255.303 ficheros y casi nunca hacen falta todos. Un paquete que no se
    pueda leer no para el resto: va a `errores` como (nombre, texto)."""
    rutas, errores = {}, []
    for nombre in paquetes(carpeta):
        try:
            entradas = indice(os.path.join(carpeta, nombre))
        except (OSError, ValueError, struct.error) as e:
            errores.append((nombre, str(e)))
            continue
        for e in entradas:
            r = ruta_de(e)
            if quedarse is None or quedarse(r):
                rutas[r] = (nombre, e)
    return rutas, errores


# --------------------------------------------------------------------------------------------
# CRILAYLA
# --------------------------------------------------------------------------------------------


def _ventanas(comp, desde, hasta):
    """Para cada bit p en [desde, hasta) del flujo (ya dado la vuelta), el valor de los 13 bits que
    empiezan en p (MSB primero). desde es multiplo de 8. Devuelve memoryview de uint16."""
    q0, q1 = desde >> 3, (hasta + 7) >> 3
    t = np.zeros(q1 - q0 + 2, dtype=np.uint32)
    trozo = comp[q0:q1 + 2]
    t[:len(trozo)] = trozo
    w24 = (t[:-2] << 16) | (t[1:-1] << 8) | t[2:]
    v = np.empty((len(w24), 8), dtype=np.uint16)
    for r in range(8):
        v[:, r] = (w24 >> (11 - r)) & 0x1FFF
    return memoryview(v.reshape(-1))


def crilayla(datos):
    """Descomprime un bloque CRILAYLA. Cabecera (LE): 'CRILAYLA', u32 tam_descomprimido (sin los 0x100
    del principio), u32 tam_comprimido; detras el flujo comprimido y 0x100 bytes en claro que son el
    principio del fichero. El flujo se lee desde su ultimo byte hacia atras, bit mas alto primero, y la
    salida se escribe desde el final hacia 0x100:
      bit 0 -> 8 bits = un byte literal
      bit 1 -> 13 bits de distancia (+3) y longitud 3 + trozos de 2, 3, 5 bits y luego de 8 en 8
               (se sigue al siguiente trozo mientras el actual valga todo unos);
               cada byte copiado = el que esta `distancia` posiciones mas adelante en el buffer."""
    if datos[:8] != b"CRILAYLA":
        raise ValueError("no es CRILAYLA")
    tam_desc, tam_comp = struct.unpack_from("<II", datos, 8)
    total = 0x100 + tam_desc
    out = bytearray(total)
    out[:0x100] = datos[0x10 + tam_comp:0x10 + tam_comp + 0x100]
    comp = np.frombuffer(datos, dtype=np.uint8, count=tam_comp, offset=0x10)[::-1]
    nbits = tam_comp * 8

    VENT = 1 << 23            # bits por ventana (1 MiB de flujo comprimido -> 16 MiB de uint16)
    MARGEN = 64               # bits que puede gastar un paso sin mirar el limite
    base = 0
    v = _ventanas(comp, 0, min(nbits, VENT) + MARGEN)
    lim = VENT - MARGEN
    p = 0
    pos = total - 1
    fin = 0x100
    while pos >= fin:
        if p >= lim:
            base += p & ~7
            p &= 7
            v = _ventanas(comp, base, min(nbits, base + VENT) + MARGEN)
        x = v[p]
        if x & 0x1000:                       # copia
            dist = v[p + 1] + 3
            p += 14
            a = v[p] >> 11                   # 2 bits
            p += 2
            n = 3 + a
            if a == 3:
                a = v[p] >> 10               # 3 bits
                p += 3
                n += a
                if a == 7:
                    a = v[p] >> 8            # 5 bits
                    p += 5
                    n += a
                    if a == 31:
                        while True:
                            if p >= lim:
                                base += p & ~7
                                p &= 7
                                v = _ventanas(comp, base, min(nbits, base + VENT) + MARGEN)
                            a = v[p] >> 5    # 8 bits
                            p += 8
                            n += a
                            if a != 255:
                                break
            if n > pos - fin + 1:
                n = pos - fin + 1
            ini = pos - n + 1
            if dist >= n:
                out[ini:pos + 1] = out[ini + dist:pos + 1 + dist]
            else:                            # solapa: se repite un trozo de `dist` bytes
                arriba = pos + 1
                while arriba > ini:
                    abajo = max(ini, arriba - dist)
                    out[abajo:arriba] = out[abajo + dist:arriba + dist]
                    arriba = abajo
            pos -= n
        else:                                # literal
            out[pos] = (x >> 4) & 0xFF
            p += 9
            pos -= 1
    return bytes(out)


# --------------------------------------------------------------------------------------------
# Extraer
# --------------------------------------------------------------------------------------------


def leer_crudo(ruta_cpk, entrada):
    """Bytes de la entrada tal cual estan en el .cpk, ya descifrados (sin descomprimir)."""
    with _Lector(ruta_cpk) as lec:
        return lec.leer(entrada["offset"], entrada["tam"])


def extraer(ruta_cpk, entrada):
    """Lee la entrada del .cpk, la descifra y, si va comprimida (tam < tam_extraido), la descomprime."""
    d = leer_crudo(ruta_cpk, entrada)
    if entrada["tam"] < entrada["tam_extraido"] or d[:8] == b"CRILAYLA":
        d = crilayla(d)
    if len(d) != entrada["tam_extraido"]:
        raise ValueError("%s: salen %d bytes y el TOC dice %d" % (ruta_de(entrada), len(d), entrada["tam_extraido"]))
    return d


def guardar(ruta_cpk, entrada, destino, trozo=1 << 26):
    """Como extraer() pero escribe en `destino`; los ficheros sin comprimir van por trozos (para los
    videos .usm de cientos de MB o varios GB no hace falta tenerlos enteros en memoria)."""
    os.makedirs(os.path.dirname(os.path.abspath(destino)), exist_ok=True)
    if entrada["tam"] < entrada["tam_extraido"]:
        with open(destino, "wb") as g:
            g.write(extraer(ruta_cpk, entrada))
        return
    with _Lector(ruta_cpk) as lec, open(destino, "wb") as g:
        o, fin = entrada["offset"], entrada["offset"] + entrada["tam"]
        while o < fin:
            n = min(trozo, fin - o)
            g.write(lec.leer(o, n))
            o += n


def sacar(ruta_cpk, regex, carpeta):
    """Saca a `carpeta` los ficheros del .cpk cuya ruta (dir/nombre) case con `regex`."""
    rx = re.compile(regex)
    hechos = []
    for e in indice(ruta_cpk):
        r = ruta_de(e)
        if rx.search(r):
            dst = os.path.join(carpeta, *r.split("/"))
            guardar(ruta_cpk, e, dst)
            hechos.append(dst)
    return hechos


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "indice":
        ent = indice(sys.argv[2])
        for e in ent:
            print("%s\t%d\t%d\t%d" % (ruta_de(e), e["offset"], e["tam"], e["tam_extraido"]))
        print(len(ent), "ficheros", file=sys.stderr)
    elif len(sys.argv) >= 5 and sys.argv[1] == "sacar":
        for x in sacar(sys.argv[2], sys.argv[3], sys.argv[4]):
            print(x)
    else:
        print(__doc__)
