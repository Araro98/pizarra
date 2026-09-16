#!/usr/bin/env python3
"""Que version de cada pasiva corresponde a cada rareza.

    py herramientas\\construir_rareza_pasivas.py

Escribe `datos/reglas-extraidas/pasivas-rareza.csv`: grupo, rareza, id, valor.

`skill/passive_skill_rarity_table_config` (`m_passiveSkillRarityTableList`,
NOTAS O-46) tiene 453 filas de seis identificadores: el mismo efecto para las
rarezas 0 (Futbolista comun) a 5. Son ids distintos con el mismo texto y
distinto valor: `ps10001` +0,5 %, `ps10001_01` +0,6 %, ... `ps10001_04` +1 %.
La sexta columna esta a 0 en las pasivas normales. Las pasivas de casilla de
stat (`ps2xxxx`, +3/+5/+7) no estan en esta tabla: su valor es fijo.
"""
import csv
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import reglas  # noqa: E402

TABLA = os.path.join(RAIZ, "datos", "juego", "tablas", "PASSIVE_RARITY.tsv")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pasivas-rareza.csv")


def al_reves(n):
    return bytes.fromhex("%08X" % (int(n) & 0xFFFFFFFF))[::-1].hex().upper()


def main():
    valores = {f["id"].upper(): f for f in reglas._tabla("pasivas-valor.csv")}
    filas = []
    with open(TABLA, encoding="utf-8") as fh:
        for l in fh:
            l = l.strip()
            if not l or "filas" in l:
                continue
            filas.append([x for x in l.replace("\t", ",").split(",") if x != ""])
    salida = []
    for grupo, fila in enumerate(filas):
        for rareza, x in enumerate(fila):
            if x == "0":
                continue
            idh = al_reves(x)
            v = valores.get(idh, {})
            salida.append([grupo, rareza, idh, v.get("valor", "")])
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que version de cada pasiva va con cada rareza (NOTAS O-46, O-148).\n"
                 "# grupo = fila de la tabla del juego; rareza = 0 comun ... 4 leyenda, 5 sexta columna.\n"
                 "# Lo genera herramientas/construir_rareza_pasivas.py.\n")
        w = csv.writer(fh)
        w.writerow(["grupo", "rareza", "id", "valor"])
        w.writerows(salida)
    print("Escritas %d filas (%d grupos) en %s" % (len(salida), len(filas), SALIDA))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
