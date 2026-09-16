#!/usr/bin/env python3
"""Pruebas de la base. Se ejecutan contra la partida real del usuario.

    py pruebas\\test_basico.py

Lo que comprueba, en orden de importancia:

1. Abrir la partida y volver a guardarla sin tocar nada da un fichero IDENTICO
   byte a byte al original. Es la regla 8 del CONTEXTO.
2. El recorrido de campos TLV encuentra el campo de nivel y el registro entero.
3. La herramienta de comparar detecta un cambio de un solo byte, lo situa en el
   campo correcto y no inventa nada mas.
"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import codec, comparar, tlv

PARTIDA = os.environ.get(
    "IEVR_PARTIDA",
    r"F:\steam\userdata\143274881\2799860\remote\002AB8F4-USERDATALIVE")

F_NIVEL = 0x7C27AEEC
fallos = []


def comprobar(titulo, condicion, detalle=""):
    print(("  OK   " if condicion else "  FALLA") + "  " + titulo + (" - " + detalle if detalle else ""))
    if not condicion:
        fallos.append(titulo)


def main():
    if not os.path.isfile(PARTIDA):
        raise SystemExit(
            "No encuentro la partida en %s\n"
            "Pon la ruta en la variable IEVR_PARTIDA si la tienes en otro sitio." % PARTIDA)
    nombre = os.path.basename(PARTIDA)
    raw = open(PARTIDA, "rb").read()

    print("1. Ida y vuelta sin tocar nada")
    plain = codec.decrypt(raw, nombre)
    comprobar("descifra con la magia correcta", plain[:4] == b"\xc3\x66\xce\x9d")
    comprobar("re-cifrar reproduce el fichero original byte a byte",
              codec.encrypt(plain, nombre) == raw)
    comprobar("el directorio de blobs se recorre entero",
              len(list(codec.blobs(plain))) >= 1,
              "%d blob(s)" % len(list(codec.blobs(plain))))
    try:
        codec.decrypt(raw, "OTRO-NOMBRE")
        comprobar("descifrar con otro nombre falla", False)
    except ValueError:
        comprobar("descifrar con otro nombre falla (el nombre es la clave)", True)

    print("\n2. Recorrido de campos")
    import struct
    off_nivel = plain.find(struct.pack("<II", F_NIVEL, 1))
    comprobar("encuentra un campo de nivel", off_nivel > 0, "en 0x%X" % off_nivel)
    loc = tlv.localizar(plain, off_nivel + 8)
    comprobar("localiza el byte dentro del campo de nivel",
              loc is not None and loc["hash"] == F_NIVEL)
    campos = tlv.campos_desde(plain, loc["registro_off"], maximo=8)
    comprobar("el registro del jugador tiene varios campos", len(campos) >= 4,
              "%d campos" % len(campos))
    comprobar("uno de ellos es el ancla de ficha de jugador",
              any(c[1] == 0xBB459017 for c in campos))

    print("\n3. Detectar un cambio de un solo byte")
    tmp = tempfile.mkdtemp(prefix="ievr-prueba-")
    try:
        dir_a = os.path.join(tmp, "antes")
        dir_b = os.path.join(tmp, "despues")
        os.makedirs(dir_a)
        os.makedirs(dir_b)
        shutil.copyfile(PARTIDA, os.path.join(dir_a, nombre))

        buf = bytearray(plain)
        objetivo = off_nivel + 8
        buf[objetivo] = (buf[objetivo] + 1) % 100
        with open(os.path.join(dir_b, nombre), "wb") as fh:
            fh.write(codec.encrypt(bytes(buf), nombre))

        pa = codec.load(os.path.join(dir_a, nombre))
        pb = codec.load(os.path.join(dir_b, nombre))
        hall, sueltos = comparar.analizar(pa, pb)
        comprobar("ve exactamente un campo cambiado", len(hall) == 1,
                  "%d campos, %d bytes sueltos" % (len(hall), len(sueltos)))
        comprobar("sin bytes sueltos sin explicar", not sueltos)
        if hall:
            (reg, campo, h), _ = next(iter(hall.items()))
            comprobar("lo identifica como el campo de nivel", h == F_NIVEL,
                      "%08X = %s" % (h, tlv.nombre_campo(h)))
            comprobar("apunta al campo correcto", campo == off_nivel)

        shutil.copyfile(PARTIDA, os.path.join(dir_b, nombre))
        hall, sueltos = comparar.analizar(codec.load(os.path.join(dir_a, nombre)),
                                          codec.load(os.path.join(dir_b, nombre)))
        comprobar("dos copias iguales no dan ningun cambio", not hall and not sueltos)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if fallos:
        print("FALLAN %d prueba(s): %s" % (len(fallos), ", ".join(fallos)))
        return 1
    print("Todas las pruebas pasan.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
