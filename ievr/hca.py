"""Decodificador propio del audio HCA de CRI (las voces de VR en sus .awb; NOTAS O-339).

Las voces de Victory Road van en bancos CRI ADX2 (.acb con los nombres y .awb con el audio,
ievr/voces.py) y cada linea es un HCA: audio por transformada (como un MP3 sencillo), a 48 kHz,
en tramas de 1024 muestras por canal. Este modulo pasa un HCA a muestras (numpy, sin
librerias de fuera) para que ievr/voces.py lo deje en WAV, que el navegador toca solo.

    cab = hca.cabecera(datos)          # {"canales", "fs", "tramas", "retraso", "relleno", ...}
    muestras = hca.decodificar(datos)  # float32 (canales, n) en [-1, 1]
    lista = hca.decodificar_varios([d1, d2, ...])   # varios a la vez (mucho mas rapido)

Lo que hay en VR (comprobado con los 1.936 bancos japoneses, scratchpad juego/animvr/VOCES.md):
version 3.0, sin cifrar (ciph 0), mono o estereo, sin estereo por intensidad ni bandas altas
reconstruidas (HFR). Lo que no se ve en VR (cifrado, HFR, intensidad, ms, el ATH de las
versiones 1.x, la cabecera 'dec ') da NoSoportado y esa linea no se convierte.

Como va (el formato es publico: descripciones de la comunidad como la de vgmstream/clHCA y el
decodificador de FFmpeg, LGPL; aqui no se copia codigo de nadie):
  trama   16 bits de sincronia (0xFFFF), nivel de ruido (9) y frontera (7); por canal los
          factores de escala de las 128 bandas (fijos de 6 bits, en diferencias o ninguno), de
          ahi la resolucion de cada banda (cuantos niveles) y su ganancia; luego 8 subtramas de
          128 coeficientes (codigos de prefijo hasta 7 niveles, signo y magnitud a partir de 8);
          las bandas sin bits (resolucion 0) se rellenan con otra banda al azar (version 3); al
          final un CRC-16 (0x8005) de la trama
  salida  una IMDCT de 128 coeficientes por subtrama con la ventana de HCA y solapando la mitad
          con la anterior; se quitan las muestras del retraso del codificador del principio y
          las del relleno del final. La ventana no sale de ninguna formula conocida: VENTANA
          son los 64 numeros que publica la descripcion del formato (hca_data.h de FFmpeg), y la
          otra mitad se saca de ellos (potencia complementaria). Comprobado con la voz de VR:
          con la IMDCT de otra fase la voz sale menos periodica y con picos de 1,35
Para ir rapido, todas las tramas (de una o de varias lineas) se leen a la vez con numpy: cada
paso lee el mismo campo de todas las tramas (la posicion de cada una va por su cuenta).

Codigo propio (O-339).
"""
import struct

import numpy as np

__all__ = ["NoSoportado", "cabecera", "decodificar", "decodificar_varios", "crc16"]

MUESTRAS_TRAMA = 1024
SUB = 128                      # coeficientes por subtrama (8 por trama)


class NoSoportado(ValueError):
    """Un HCA con algo que VR no usa (y este decodificador no hace)."""


# --------------------------------------------------------------------------- tablas del formato
# bits que se miran por coeficiente segun su resolucion (0..15)
_BITS_MAX = np.array([0, 2, 3, 3, 4, 4, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12], np.int64)
# resoluciones 1..7: codigos de prefijo (fila = resolucion, columna = los bits mirados):
# cuantos bits usa de verdad y que valor sale
_PREFIJO_BITS = np.array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    2, 2, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0,
    2, 2, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0,
    3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4,
    3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4,
    3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], np.int64)
_PREFIJO_VAL = np.array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, -1, -1, 2, -2, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, -1, 2, -2, 3, -3, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, -1, -1, 2, 2, -2, -2, 3, 3, -3, -3, 4, -4,
    0, 0, 1, 1, -1, -1, 2, 2, -2, -2, 3, -3, 4, -4, 5, -5,
    0, 0, 1, 1, -1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6,
    0, 0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7], np.float32)
# la resolucion de una banda segun lo que sobra entre su factor de escala y el ruido aceptable
# (posicion 0..65; antes de 0, 15; despues de 65, 0: sin bits, se rellena con ruido)
_RESOLUCION = np.array([14] * 6 + [13] * 6 + [12] * 6 + [11] * 6 + [10] * 7 + [9] * 6 + [8] * 6 +
                       [7] + [6] * 2 + [5] + [4] * 3 + [3] * 3 + [2] * 4 + [1] * 9, np.int64)
# paso del cuantificador por resolucion: 2 / (niveles), con 3, 5 ... 15 niveles y luego 31 ... 4095
_PASO = np.array([0.0] + [2.0 / (2 * r + 1) for r in range(1, 8)] +
                 [2.0 / ((1 << (r - 3)) - 1) for r in range(8, 16)], np.float32)
# escala de cada factor (0..63): sube 53/128 de octava por paso y el 63 vale 8*raiz(2)
_ESCALA = (2.0 ** ((np.arange(64) - 63) * 53.0 / 128.0 + 3.5)).astype(np.float32)
# cambio de escala entre dos bandas (relleno de ruido): 2^((i - 63) * 53/128), el 0 vale 0
_CAMBIO = np.concatenate([[0.0], 2.0 ** ((np.arange(1, 128) - 63) * 53.0 / 128.0)]).astype(np.float32)
# la ventana de la IMDCT de HCA (la mitad que sube; la otra es su reflejo). Es potencia
# complementaria (v[i]^2 + v[127-i]^2 = 1): la mitad alta se saca de la baja con eso
_VENTANA_BAJA = np.array([
    0.000690534, 0.00197623, 0.00367386, 0.00572424, 0.0080967, 0.0107732, 0.0137425, 0.0169979,
    0.0205353, 0.0243529, 0.0284505, 0.0328291, 0.0374906, 0.0424379, 0.0476744, 0.0532043,
    0.0590321, 0.0651629, 0.071602, 0.0783552, 0.0854285, 0.092828, 0.10056, 0.108631,
    0.117048, 0.125817, 0.134944, 0.144437, 0.1543, 0.164539, 0.175161, 0.186169,
    0.197569, 0.209363, 0.221555, 0.234145, 0.247136, 0.260526, 0.274313, 0.288493,
    0.303062, 0.318012, 0.333333, 0.349015, 0.365044, 0.381403, 0.398073, 0.415034,
    0.43226, 0.449725, 0.4674, 0.485251, 0.503245, 0.521344, 0.539509, 0.557698,
    0.575869, 0.593978, 0.611981, 0.629831, 0.647486, 0.6649, 0.682031, 0.698838], np.float64)
VENTANA = np.concatenate([_VENTANA_BAJA, np.sqrt(1.0 - _VENTANA_BAJA[::-1] ** 2)])
_IMDCT = None


def _imdct():
    """La matriz de la IMDCT (128 -> 256) ya con la ventana y la escala de HCA (1/8)."""
    global _IMDCT
    if _IMDCT is None:
        n = np.arange(2 * SUB)[:, None]
        k = np.arange(SUB)[None, :]
        m = np.cos(np.pi / SUB * (n + 0.5 + SUB / 2) * (k + 0.5)) / 8.0
        w = np.concatenate([VENTANA, VENTANA[::-1]])
        _IMDCT = (m * w[:, None]).T.astype(np.float32)        # (128, 256)
    return _IMDCT


_CRC = None


def crc16(datos):
    """CRC-16 de HCA (polinomio 0x8005, MSB primero, empieza en 0) de unos bytes; una trama
    entera (con su CRC al final) da 0."""
    global _CRC
    if _CRC is None:
        t = []
        for i in range(256):
            c = i << 8
            for _ in range(8):
                c = ((c << 1) ^ 0x8005) if c & 0x8000 else c << 1
            t.append(c & 0xFFFF)
        _CRC = t
    c = 0
    for b in datos:
        c = ((c << 8) & 0xFFFF) ^ _CRC[(c >> 8) ^ b]
    return c


def _crc_tramas(tramas):
    """CRC-16 de cada fila de un array (n, tam) de uint8, todas a la vez."""
    crc16(b"")
    tabla = np.array(_CRC, np.uint32)
    c = np.zeros(len(tramas), np.uint32)
    for j in range(tramas.shape[1]):
        c = ((c << 8) & 0xFFFF) ^ tabla[(c >> 8) ^ tramas[:, j]]
    return c


# --------------------------------------------------------------------------- cabecera
def cabecera(b):
    """Lee la cabecera de un HCA. -> dict (canales, fs, tramas, retraso, relleno, tam_trama,
    res_min, res_max, pistas, config, bandas, base, estereo, hfr, ms, cifrado, ath, volumen,
    version, tam_cabecera, muestras)."""
    b = bytes(b[:0x1000])
    if len(b) < 8 or (struct.unpack_from(">I", b, 0)[0] & 0x7F7F7F7F) != 0x48434100:
        raise ValueError("no es un HCA")
    version, tam = struct.unpack_from(">HH", b, 4)
    c = {"version": version, "tam_cabecera": tam, "cifrado": 0, "ath": 0 if version >= 0x200 else 1,
         "volumen": 1.0, "ms": 0, "hfr": 0, "estereo": 0}
    p = 8
    while p + 4 <= tam:
        tag = struct.pack(">I", struct.unpack_from(">I", b, p)[0] & 0x7F7F7F7F)
        if tag == b"fmt\0":
            v, c["tramas"], c["retraso"], c["relleno"] = struct.unpack_from(">IIHH", b, p + 4)
            c["canales"], c["fs"] = v >> 24, v & 0xFFFFFF
            p += 16
        elif tag == b"comp":
            (c["tam_trama"], c["res_min"], c["res_max"], c["pistas"], c["config"], c["bandas"], c["base"],
             c["estereo"], c["hfr"], c["ms"]) = struct.unpack_from(">H9B", b, p + 4)
            p += 16
        elif tag == b"dec\0":
            raise NoSoportado("cabecera 'dec ' (HCA 1.x)")
        elif tag == b"vbr\0":
            p += 8
        elif tag == b"ath\0":
            c["ath"] = struct.unpack_from(">H", b, p + 4)[0]
            p += 6
        elif tag == b"loop":
            p += 16
        elif tag == b"ciph":
            c["cifrado"] = struct.unpack_from(">H", b, p + 4)[0]
            p += 6
        elif tag == b"rva\0":
            c["volumen"] = struct.unpack_from(">f", b, p + 4)[0]
            p += 8
        elif tag == b"comm":
            p += 5 + b[p + 4]
        else:          # "pad" y lo que no se sabe: se acaba la cabecera
            break
    if "canales" not in c or "tam_trama" not in c:
        raise ValueError("cabecera HCA sin fmt o comp")
    c["muestras"] = max(0, c["tramas"] * MUESTRAS_TRAMA - c["retraso"] - c["relleno"])
    return c


def _comprobar(c):
    if c["cifrado"]:
        raise NoSoportado("cifrado %d" % c["cifrado"])
    if c["hfr"] or c["estereo"] or c["ms"]:
        raise NoSoportado("HFR / estereo por intensidad / ms")
    if c["ath"]:
        raise NoSoportado("ATH tipo %d" % c["ath"])
    if not (1 <= c["canales"] <= 8) or c["bandas"] > SUB or c["base"] > SUB:
        raise ValueError("cabecera HCA rara")


def _firma(c):
    return (c["canales"], c["tam_trama"], c["res_min"], c["res_max"], c["bandas"], c["base"])


# --------------------------------------------------------------------------- decodificar
def decodificar(b):
    """Un HCA -> float32 (canales, muestras)."""
    return decodificar_varios([b])[0]


def decodificar_varios(lista, informe=None):
    """Varios HCA (bytes) -> [float32 (canales, muestras)] en el mismo orden. Los que tienen la
    misma forma (canales, tamano de trama, bandas) se leen todos a la vez. Un HCA que no se
    puede leer lanza su error. informe (dict): tramas, malas (CRC) y pasadas (bits de mas)."""
    cabs = [cabecera(b) for b in lista]
    for c in cabs:
        _comprobar(c)
    salida = [None] * len(lista)
    grupos = {}
    for i, c in enumerate(cabs):
        grupos.setdefault(_firma(c), []).append(i)
    for idx in grupos.values():
        res = _grupo([lista[i] for i in idx], [cabs[i] for i in idx], informe)
        for i, x in zip(idx, res):
            salida[i] = x
    return salida


def _grupo(lista, cabs, informe):
    c0 = cabs[0]
    C, T = c0["canales"], c0["tam_trama"]
    # todas las tramas seguidas (y 4 bytes de cero para leer de 4 en 4 al final)
    trozos, nf = [], []
    for b, c in zip(lista, cabs):
        d = np.frombuffer(b, np.uint8, count=min(len(b) - c["tam_cabecera"], c["tramas"] * T) // T * T,
                          offset=c["tam_cabecera"])
        trozos.append(d)
        nf.append(len(d) // T)
    F = sum(nf)
    if F == 0:
        return [np.zeros((c["canales"], 0), np.float32) for c in cabs]
    plano = np.concatenate(trozos + [np.zeros(8, np.uint8)])
    tramas = plano[:F * T].reshape(F, T)
    if informe is not None:
        informe["tramas"] = informe.get("tramas", 0) + F
        informe["malas"] = informe.get("malas", 0) + int((_crc_tramas(tramas) != 0).sum())
    p64 = plano.astype(np.uint64)
    pal = (p64[:-3] << np.uint64(24)) | (p64[1:-2] << np.uint64(16)) | (p64[2:-1] << np.uint64(8)) | p64[3:]
    tope_pal = len(pal) - 1        # (una trama rota no lee fuera)
    pos = np.arange(F, dtype=np.int64) * (T * 8)
    fin = pos + (T * 8 - 16)

    def leer(n):
        """n bits (array o entero, 0..25) de cada trama; avanza."""
        nonlocal pos
        sh = (np.uint64(32) - (pos & 7).astype(np.uint64) - np.asarray(n, np.uint64))
        v = (pal[np.minimum(pos >> 3, tope_pal)] >> sh) & ((np.uint64(1) << np.asarray(n, np.uint64)) - np.uint64(1))
        pos = pos + n
        return v.astype(np.int64)

    sinc = leer(16)
    if informe is not None:
        informe["sin_sincronia"] = informe.get("sin_sincronia", 0) + int((sinc != 0xFFFF).sum())
    ruido = (leer(9) << 8) - leer(7)
    B = c0["base"] + c0["estereo"]          # bandas con datos (sin HFR ni intensidad: todas iguales)
    sf = np.zeros((F, C, SUB), np.int64)
    res = np.zeros((F, C, SUB), np.int64)
    banda = np.arange(B)
    for ch in range(C):
        delta = leer(3)
        fijo = delta >= 6
        dif = (delta > 0) & ~fijo
        valor = leer(np.where(fijo | dif, 6, 0))
        sf[:, ch, 0] = valor
        tope = (np.int64(1) << delta) - 1
        nb = np.where(fijo, 6, np.where(dif, delta, 0))
        for i in range(1, B):
            x = leer(nb)
            esc = dif & (x == tope)
            y = leer(np.where(esc, 6, 0))
            valor = np.where(fijo, x, np.where(esc, y, np.where(dif, valor + x - (tope >> 1), 0)))
            valor = np.clip(valor, 0, 63)
            sf[:, ch, i] = valor
        # la resolucion de cada banda (ATH tipo 0: curva a cero)
        s = sf[:, ch, :B]
        pc = ((ruido[:, None] + banda[None, :]) >> 8) + 1 - ((5 * s) >> 1)
        r = np.where(pc < 0, 15, np.where(pc <= 65, _RESOLUCION[np.clip(pc, 0, 65)], 0))
        r = np.clip(r, c0["res_min"], c0["res_max"])
        res[:, ch, :B] = np.where(s > 0, r, 0)
    ganancia = _ESCALA[sf] * _PASO[res]                                  # (F, C, 128)
    # los coeficientes: 8 subtramas, canal a canal, banda a banda
    q = np.zeros((F, 8, C, SUB), np.float32)
    hay = (res > 0).any(axis=0)                                          # (C, 128)
    maxb = _BITS_MAX[res]
    chico = res < 8
    fila = np.minimum(res, 7) << 4
    for s in range(8):
        for ch in range(C):
            for i in range(B):
                if not hay[ch, i]:
                    continue
                mb = maxb[:, ch, i]
                v = (pal[np.minimum(pos >> 3, tope_pal)] >> (np.uint64(32) - (pos & 7).astype(np.uint64) - mb.astype(np.uint64))) & \
                    ((np.uint64(1) << mb.astype(np.uint64)) - np.uint64(1))
                v = v.astype(np.int64)
                ch_ = chico[:, ch, i]
                k = fila[:, ch, i] + (v & 15)
                grande = (1 - ((v & 1) << 1)) * (v >> 1)
                usados = np.where(ch_, _PREFIJO_BITS[k], mb - (grande == 0))
                q[:, s, ch, i] = np.where(ch_, _PREFIJO_VAL[k], grande)
                pos = pos + usados
    if informe is not None:
        informe["pasadas"] = informe.get("pasadas", 0) + int((pos > fin).sum())
    espectro = q * ganancia[:, None, :, :]
    # las bandas sin bits (version 3, resolucion minima 0): otra banda de la misma subtrama
    # elegida al azar (el rand() de siempre, uno por banda, seguido en toda la linea), con su
    # escala cambiada
    if c0["res_min"] == 0:
        _ruido(espectro, sf, res, nf)
    # la IMDCT y el solape, linea a linea
    M = _imdct()
    out, f0 = [], 0
    for c, n in zip(cabs, nf):
        e = espectro[f0:f0 + n]                       # (n, 8, C, 128)
        f0 += n
        x = np.zeros((C, n * MUESTRAS_TRAMA + SUB), np.float32)
        if n:
            y = np.einsum("fsck,kn->cfsn", e, M).reshape(C, n * 8, 2 * SUB)
            # cada subtrama: su primera mitad sobre la segunda de la anterior
            x[:, :n * 8 * SUB] += y[:, :, :SUB].reshape(C, -1)
            x[:, SUB:n * 8 * SUB + SUB] += y[:, :, SUB:].reshape(C, -1)
        m = x[:, c["retraso"]:c["retraso"] + c["muestras"]]
        if c["volumen"] != 1.0:
            m = m * np.float32(c["volumen"])
        out.append(np.ascontiguousarray(m))
    return out


def _ruido(espectro, sf, res, nf):
    """El relleno de las bandas sin bits (en su sitio)."""
    F, _S, C, _B = espectro.shape
    ruido = (res == 0) & (sf > 0)                     # (F, C, 128)
    valido = res > 0
    if not ruido.any():
        return
    nv = valido.sum(axis=2)                           # (F, C)
    # las validas de menor a mayor banda; el juego las guarda al reves (la ultima, la primera)
    orden = np.argsort(~valido, axis=2, kind="stable")
    f, s, ch, b = np.nonzero(np.broadcast_to(ruido[:, None], (F, 8, C, SUB)) & (nv[:, None, :, None] > 0))
    if not len(f):
        return
    # el numero de cada sorteo dentro de su linea (el azar va seguido en toda la linea)
    linea = np.repeat(np.arange(len(nf)), nf)[f]
    primero = np.searchsorted(linea, np.arange(len(nf)))
    n = np.arange(len(f)) - primero[linea] + 1
    azar = _rand(n)
    v = nv[f, ch]
    m = ((azar & 0x7FFF) * v) >> 15
    donante = orden[f, ch, v - 1 - m]
    k = np.clip(sf[f, ch, b] - sf[f, ch, donante] + 62, 0, 127)
    espectro[f, s, ch, b] = _CAMBIO[k] * espectro[f, s, ch, donante]


_SALTOS = None


def _rand(n):
    """El estado del rand() de HCA (x = 0x343FD x + 0x269EC3, desde 1) tras n pasos (array)."""
    global _SALTOS
    a, c, m = 0x343FD, 0x269EC3, 0xFFFFFFFF
    if _SALTOS is None:
        k = np.arange(4096, dtype=np.uint64)
        pot = np.ones(4096, np.uint64)
        pot[1:] = np.cumprod(np.full(4095, a, np.uint64))          # a^k (mod 2^64, vale mod 2^32)
        suma = np.zeros(4096, np.uint64)
        suma[1:] = np.cumsum(pot[:-1])                               # 1 + a + ... + a^(k-1)
        _SALTOS = (pot & np.uint64(m), suma & np.uint64(m), k)
    pot, suma, _k = _SALTOS
    n = np.asarray(n, np.int64)
    if not len(n):
        return n
    tope = int(n.max())
    # el estado cada 4096 pasos, y desde ahi el salto
    bloques = [1]
    x = 1
    A, S = int(pot[-1]) * a & m, (int(suma[-1]) + int(pot[-1])) & m       # 4096 pasos
    for _ in range(tope // 4096):
        x = (A * x + c * S) & m
        bloques.append(x)
    base = np.array(bloques, np.uint64)[n // 4096]
    r = n % 4096
    return ((pot[r] * base + np.uint64(c) * suma[r]) & np.uint64(m)).astype(np.int64)
