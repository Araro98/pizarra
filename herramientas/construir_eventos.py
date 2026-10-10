#!/usr/bin/env python3
"""Que evento de VR (la animacion entera: camara, actores, efectos) lleva cada supertecnica y
cada espiritu (keshin, armadura, mixi max, alma, lazo, despertar, cambio de modo) (O-323).

    py herramientas\\construir_eventos.py

Escribe en `datos/reglas-extraidas/`:

- `eventos-tecnicas.csv`: por supertecnica (`interno` = el nombre interno de tecnicas.csv),
  su `evento` (skill_config `eventIDName`) y su `evento_fallo` (`failEventIDName`: en las
  paradas y en los bloqueos, el del gol), y lo que trae el guion: cortes, segundos,
  `jugadores` (cuantos actores jugador: en regates y defensas el segundo es el rival; en las
  de 2-3, los companeros), `asignado` (si sale el keshin o el alma del que la hace),
  `modelos` (los modelos fijos: el balon, los de la tecnica en _waza...), `tipos_cuerpo` (los
  que tienen animacion) y `rotulo` (el rotulo de VR con el nombre, telop_waza/es).
- `eventos-espiritus.csv`: por espiritu (`id` como en espiritus.csv), su evento de invocacion
  (AURA_CMD_INFO_LIST col 12), `asignado` (el keshin kNNNNNN o el alma aNNNNNN que pone el
  juego, col 7), `cara_a` (el modelo en el que se convierte: armadura y mixi max por la
  identidad de col 13; cambio de modo por modos.csv, una fila por cada `cara_de`),
  `aura_campo` (el aura del keshin en el campo, battle/common/ega_kNNNNNNa) y `rotulo`.

Solo nombres de eventos y de ficheros: nada de dibujos. Con estas tablas `ievr/g4evento.py`
convierte en el PC de cada uno, desde SU juego, los eventos de los 22 del partido.

Lee las tablas del juego como el resto de herramientas (`referencia/volcado` sobre
datos/juego/extracted) y los guiones del juego instalado (ievr/cpk.py, ievr/evento.py).
"""
import csv
import os
import re
import struct
import subprocess
import sys
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from ievr import evento as EV, g4evento as GE, reglas, rutas  # noqa: E402

VOLCADO = os.path.join(RAIZ, "referencia", "volcado", "target", "release", "volcado.exe")
SKILL = os.path.join(RAIZ, "datos", "juego", "extracted", "data", "common", "gamedata", "skill")
SALIDA = os.path.join(RAIZ, "datos", "reglas-extraidas")
FAMILIAS = {0: "kenshin", 1: "armadura", 2: "mixi", 3: "alma", 4: "lazo", 5: "despertar", 6: "modo",
            7: "despertar"}


def volcar(fichero, tabla):
    r = subprocess.run([VOLCADO, fichero, tabla], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("el volcador fallo con %s / %s" % (fichero, tabla))
    return [l.split("\t") for l in r.stdout.splitlines()]


def unico(prefijo):
    for f in sorted(os.listdir(SKILL)):
        if f.startswith(prefijo) and f.endswith(".cfg.bin"):
            return os.path.join(SKILL, f)
    raise SystemExit("no encuentro %s* en %s" % (prefijo, SKILL))


def cadena(celda):
    m = re.match(r'^String\("(.*)"\)$', (celda or "").strip())
    return m.group(1) if m else ""


def ent(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def en_partida(v):
    """El id como lo guarda la partida (los 4 bytes al reves), como en espiritus.csv."""
    return struct.pack("<I", v & 0xFFFFFFFF).hex().upper()


def crc(s):
    return zlib.crc32(s.encode("utf-8")) & 0xFFFFFFFF


def analizar(fuente, nombre, cache):
    """Lo que trae el guion del evento `nombre` (o None si no lo hay)."""
    if nombre in cache:
        return cache[nombre]
    ev = GE.leer_evento(fuente, nombre)
    out = None
    if ev:
        personajes = EV.personajes(ev)
        modelos = sorted({EV.modelo_de_actor(a, d.get("carga")) for a, d in ev["actores"].items()
                          if EV.tipo_de_actor(a, d.get("carga")) in ("modelo", "balon")} - {""})
        tipos = []
        if personajes:
            a = personajes[0]
            for t in EV.TIPOS_CUERPO:
                patron = next((ev["anim"][k] for k in ev["anim"] if k[0] == a), None)
                c = next((c[0] for c in ev["cortes"] if (a, c[0]) in ev["anim"]), None)
                if patron and c and fuente.hay(patron.replace("<CHARA>", EV.rellenar(a, t)).replace("<CUT>", c)):
                    tipos.append(t)
        efectos = [a for a, d in ev["actores"].items() if EV.tipo_de_actor(a, d.get("carga")) == "efecto"]
        particulas = 0
        for a in efectos:
            try:
                particulas += bool(GE._pkm_de_objbin(fuente, ev["actores"][a]["carga"])[1])
            except (OSError, ValueError):
                pass
        out = {"cortes": len(ev["cortes"]), "segundos": round(EV.duracion(ev) / GE.FPS, 2),
               "jugadores": len(personajes),
               "asignado": "si" if any(EV.tipo_de_actor(a) == "asignado" for a in ev["actores"]) else "",
               "modelos": " ".join(modelos), "tipos_cuerpo": " ".join(tipos), "efectos": len(efectos),
               "particulas": particulas, "rotulo_guion": ev["rotulo"] or ""}
    cache[nombre] = out
    return out


def main():
    if not os.path.isfile(VOLCADO):
        raise SystemExit("falta %s (compilalo con cargo build --release)" % VOLCADO)
    carpeta = rutas.carpeta_del_juego()
    if not carpeta:
        raise SystemExit("no encuentro el juego en este ordenador (hacen falta sus guiones de eventos)")
    fuente = GE.Fuente(GE.juego(carpeta))
    telops = {r.rsplit("/", 1)[1][:-5] for r in fuente.juego.ficheros
              if r.startswith("dx11/menu/220_img/telop_waza/%s/" % GE.IDIOMA_ROTULO) and r.endswith(".g4tx")}
    print("juego: %d ficheros de eventos y personajes, %d rotulos" % (len(fuente.juego.ficheros), len(telops)))
    cache = {}

    # --- supertecnicas
    tecnicas = {f["nombre_interno"]: f for f in reglas._tabla("tecnicas.csv") if f.get("nombre_interno")}
    filas = []
    for c in volcar(unico("skill_config_"), "m_skillInfoList"):
        if len(c) < 6:
            continue
        interno, ev, fallo = cadena(c[1]), cadena(c[3]), cadena(c[5])
        if not interno or not ev:
            continue
        a = analizar(fuente, ev, cache)
        if not a:
            continue
        if fallo and not analizar(fuente, fallo, cache):
            fallo = ""
        rot = EV.nombre_del_rotulo(a["rotulo_guion"])
        filas.append({"interno": interno, "id": (tecnicas.get(interno) or {}).get("id", ""), "evento": ev,
                      "evento_fallo": fallo, "cortes": a["cortes"], "segundos": a["segundos"],
                      "jugadores": a["jugadores"], "asignado": a["asignado"], "modelos": a["modelos"],
                      "tipos_cuerpo": a["tipos_cuerpo"], "efectos": a["efectos"], "particulas": a["particulas"],
                      "rotulo": rot if rot in telops else ""})
    filas.sort(key=lambda f: f["interno"])
    ruta = os.path.join(SALIDA, "eventos-tecnicas.csv")
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que evento de VR (la animacion de la supertecnica) lleva cada supertecnica (O-323).\n"
                 "# interno: nombre interno de tecnicas.csv. evento/evento_fallo: skill_config eventIDName y\n"
                 "# failEventIDName (paradas y bloqueos: el del gol). jugadores: actores jugador del guion (s00 el\n"
                 "# que la hace; s01.. el rival o los companeros). asignado: sale su keshin/alma. modelos: modelos\n"
                 "# fijos (balon, _waza...). tipos_cuerpo: 01..04 con animacion. rotulo: telop_waza/es.\n"
                 "# Lo genera herramientas/construir_eventos.py; lo convierte ievr/g4evento.py en cada PC.\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print("Escritas %d supertecnicas con evento en %s" % (len(filas), ruta))

    # --- espiritus
    nombres = set()
    for r in fuente.juego.ficheros:
        if r.startswith("common/event_cfg/evt/") and r.endswith(".cfg.bin"):
            nombres.add(r.rsplit("/", 1)[1][:-len(".cfg.bin")])
        m = re.match(r"common/chr/(?:_keshin|_waza|_armd|_face/[^/]+)/([a-z]+\d+)/", r)
        if m:
            nombres.add(m.group(1))
    por_crc = {crc(n): n for n in nombres}
    caras = {f["identidad"].upper(): f["cara"] for f in reglas._tabla("caras.csv")}
    esp = {f["id"].upper(): f for f in reglas._tabla("espiritus.csv")}
    modos = {}
    for f in reglas._tabla("modos.csv"):
        modos.setdefault(f["modo"].upper(), []).append(f)
    filas = []
    for c in volcar(unico("aura_skill_config"), "AURA_CMD_INFO_LIST"):
        if len(c) != 19:
            continue
        ident = en_partida(ent(c[0]) or 0)
        modelo = cadena(c[1])
        familia = FAMILIAS.get(ent(c[10]), str(c[10]))
        ev = por_crc.get((ent(c[12]) or 0) & 0xFFFFFFFF, "")
        a = analizar(fuente, ev, cache) if ev else None
        if not a:
            continue
        # col 7: el keshin, el alma o (en el mixi max) el codigo del companero (para su rotulo)
        m7 = por_crc.get((ent(c[7]) or 0) & 0xFFFFFFFF, "")
        asignado = m7 if re.fullmatch(r"[ka]\d{6}", m7 or "") and GE.ruta_de_modelo(fuente, m7) else ""
        # col 13: la identidad en que se convierte (armadura y mixi max), tal cual (no al reves)
        cara_a = caras.get("%08X" % ((ent(c[13]) or 0) & 0xFFFFFFFF), "") if ent(c[13]) else ""
        aura = "ega_%sa" % m7 if m7.startswith("k") and fuente.hay(
            "common/effect/battle/common/ega_%sa/ega_%sa.objbin" % (m7, m7)) else ""
        parejas = [("", cara_a)]
        if familia == "modo":
            # las variantes (_exst, _legend) van con las parejas del modo base (col 6)
            filas_modo = modos.get(ident) or modos.get(en_partida(ent(c[6]) or 0), [])
            parejas = [(caras.get(f["de"].upper(), ""), caras.get(f["a"].upper(), "")) for f in filas_modo]
            parejas = sorted(set(p for p in parejas if p[1])) or [("", "")]
        for cara_de, cara in parejas:
            plantilla = EV.nombre_del_rotulo(a["rotulo_guion"]) if "<CHARA_ID>" not in a["rotulo_guion"] else \
                a["rotulo_guion"][len("soccer10_01_"):]
            # <CHARA_ID>: el keshin o el alma; en el mixi max la forma mixi; en el modo, el de antes
            quien = {"kenshin": m7, "alma": m7, "armadura": m7, "mixi": cara, "modo": cara_de}.get(familia, modelo)
            rot = plantilla.replace("<CHARA_ID>", quien or "")
            if rot not in telops and "aura_power_" + modelo in telops:
                rot = "aura_power_" + modelo          # los despertares (wap01001...)
            filas.append({"id": ident, "modelo": modelo, "familia": familia,
                          "nombre": (esp.get(ident) or {}).get("nombre_largo", ""), "evento": ev,
                          "segundos": a["segundos"], "asignado": asignado, "cara_de": cara_de, "cara_a": cara,
                          "aura_campo": aura, "rotulo": rot if rot in telops else ""})
    ruta = os.path.join(SALIDA, "eventos-espiritus.csv")
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        fh.write("# Que evento de VR (la invocacion o la transformacion) lleva cada espiritu (O-323).\n"
                 "# id: como en espiritus.csv. asignado: el keshin/alma que pone el juego en el evento.\n"
                 "# cara_a: el modelo en que se convierte (armadura, mixi max, modo; en el modo, de cara_de).\n"
                 "# aura_campo: el aura del keshin en el campo (clips in/loop/out). rotulo: telop_waza/es.\n"
                 "# Lo genera herramientas/construir_eventos.py; lo convierte ievr/g4evento.py en cada PC.\n")
        w = csv.DictWriter(fh, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print("Escritos %d espiritus con evento en %s" % (len(filas), ruta))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
