#!/usr/bin/env python3
"""Que pasivas puede sacar CADA personaje, leido de las tablas del juego.

    py herramientas\\construir_pool_pasivas.py

Escribe `datos/reglas-extraidas/pool-pasivas.csv`: una fila por
(personaje, ranura, pasiva candidata), para los 5.717 jugables, **incluidos los
que Aaron no tiene**.

Esto sustituye a la version observada de `pasivas-por-ranura.csv`, que salia de
mirar la partida y solo cubria sus 343 personajes.

## El sorteo

`skill/ability_learning_config` tiene dos cadenas de indices anidados. La de las
pasivas "de delante" (las ranuras 1 y 2):

```
LOT_FRONT_PASSIVE_INFO_LIST    ->  MAIN  ->  SUB  ->  GROWTH  ->  STYLE  ->  SKILL
```

Cada lista alterna una fila con **la clave** y otra con **(donde empieza, cuantas)**
en la lista siguiente. Al final quedan unas 6 pasivas candidatas.

Las claves, sacadas probando todas las combinaciones de columnas de `chara_param`
contra las pasivas reales de los 574 jugadores de la partida:

| Nivel | Columna de `chara_param` |
|---|---|
| INFO | **col 8 + 1** |
| MAIN | col 3, posicion principal |
| SUB | col 4, posicion alternativa |
| GROWTH | col 7, patron de crecimiento |
| STYLE | col 8 |

**Acierto: 94,1 % en jugadores normales.** Los que fallan son personajes de
historia (Silvia Woods, Mister Yi, Cao Cao, Zanark Avalonic, Gamma...), que
`chara_param` marca aparte en `STORY_FIX_SKILL_INFO_LIST` y que llevan pasivas
fijas. Esos se marcan en la salida como `historia`.

Casos que valida, y que ninguna regla por posicion explicaba: **Amara Myles**, que
es portera y saca pasiva de tiro. Su pool, leido del juego, tiene 3 candidatas y
**las dos que tiene estan dentro**.
"""
import csv
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
GAMEDATA = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas", "pool-pasivas.csv")

# (nivel de la cadena, columna de chara_param, que se le suma)
CLAVES_FRONT = [(0, 8, 1), (1, 3, 0), (2, 4, 0), (3, 7, 0), (4, 8, 0)]


def unico(carpeta, prefijo):
    for f in sorted(os.listdir(carpeta)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(carpeta, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, carpeta))


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return []
    return [l.split(chr(9)) for l in r.stdout.splitlines()[1:] if l]


def pares(fichero, tabla):
    """Las listas alternan una fila de clave y otra de (offset, cuantos)."""
    filas = volcar(fichero, tabla)
    fuera = []
    for i in range(0, len(filas) - 1, 2):
        if len(filas[i]) == 1 and len(filas[i + 1]) == 2:
            fuera.append((int(filas[i][0]), int(filas[i + 1][0]), int(filas[i + 1][1])))
    return fuera


def a_partida(valor):
    return bytes.fromhex("%08X" % (valor & 0xFFFFFFFF))[::-1].hex().upper()


def main():
    from ievr import tlv
    nombres = tlv.nombres()
    skill_dir = os.path.join(GAMEDATA, "skill")
    fich = unico(skill_dir, "ability_learning_config")
    P = "ABILITY_LEARNING_LOT_FRONT_PASSIVE_"
    niveles = [pares(fich, P + t) for t in
               ("INFO_LIST", "MAIN_LIST", "SUB_LIST", "GROWTH_LIST", "STYLE_LIST")]
    skills = [int(x[0]) & 0xFFFFFFFF for x in volcar(fich, P + "SKILL_LIST") if len(x) == 1]

    def buscar(lista, off, cnt, clave):
        for k, o, c in lista[off:off + cnt]:
            if k == clave:
                return o, c
        return None

    def pool(fila):
        off, cnt = 0, len(niveles[0])
        for (nivel, col, suma), lista in zip(CLAVES_FRONT, niveles):
            r = buscar(lista, off, cnt, fila[col] + suma)
            if r is None:
                return None
            off, cnt = r
        return [skills[i] for i in range(off, min(off + cnt, len(skills)))]

    # personajes de historia: llevan pasivas fijas y no pasan por el sorteo
    chara_dir = os.path.join(GAMEDATA, "character")
    param_f = unico(chara_dir, "chara_param_")
    historia = set()
    for c in volcar(param_f, "STORY_FIX_SKILL_INFO_LIST"):
        try:
            historia.add(int(c[0]) & 0xFFFFFFFF)
        except (ValueError, IndexError):
            pass

    jug = {}
    ruta = os.path.join(RAIZ, "datos", "reglas-extraidas", "jugadores.csv")
    with open(ruta, newline="", encoding="utf-8") as fh:
        for f in csv.DictReader([l for l in fh if not l.lstrip().startswith("#")]):
            jug[f["identidad"].upper()] = f

    filas, sin_pool = [], 0
    for c in volcar(param_f, "CHARA_PARAM_INFO_LIST"):
        if len(c) < 43:
            continue
        try:
            datos = [int(c[i]) for i in range(11)]
            ident = int(c[0]) & 0xFFFFFFFF
        except ValueError:
            continue
        clave = "%08X" % ident
        if clave not in jug:
            continue
        ps = pool(datos)
        if ps is None:
            sin_pool += 1
            continue
        j = jug[clave]
        for v in dict.fromkeys(ps):          # sin repetidos, en orden
            h = a_partida(v)
            filas.append({
                "identidad": clave,
                "personaje": j.get("nombre", ""),
                "equipo": j.get("equipo", ""),
                "posicion": j.get("posicion", ""),
                "ranuras": "1-2",
                "pasiva_id": h,
                "pasiva": nombres.get(h, ("", ""))[0],
                "fijas_de_historia": "si" if ident in historia else "",
            })

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Pasivas candidatas de cada personaje para las ranuras 1 y 2.\n"
                 "# Leido de las tablas de sorteo del juego, NO observado de la partida.\n"
                 "# Acierto medido contra la partida de Aaron: 94,1% en jugadores normales.\n"
                 "# Los marcados 'fijas_de_historia' llevan pasivas fijas y no siguen el sorteo.\n"
                 "# Lo genera herramientas/construir_pool_pasivas.py.\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)

    import collections
    porpers = collections.Counter(f["identidad"] for f in filas)
    print("Escritas %d filas en %s" % (len(filas), SALIDA))
    print("   personajes cubiertos: %d   sin pool: %d" % (len(porpers), sin_pool))
    print("   candidatas por personaje: %.1f de media, de %d a %d"
          % (len(filas) / max(len(porpers), 1), min(porpers.values()), max(porpers.values())))
    print("   marcados como de historia: %d"
          % len({f["identidad"] for f in filas if f["fijas_de_historia"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
