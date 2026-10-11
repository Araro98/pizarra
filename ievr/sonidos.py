"""Los efectos de sonido de VR en el partido (NOTAS O-343). Aaron quiere las supertecnicas
"exactamente las mismas que el vr" y pidio las voces del juego (O-339): con su animacion de VR
y sus voces, sus efectos de sonido; y en las jugadas sin tecnica y en el partido, los de VR.

Donde estan en VR (scratchpad juego/animvr/SONIDOS.md):
  common/sound_asset/waza_stream.acb/.awb   los efectos de cada evento: una cue "<ev>_me" por
      supertecnica, invocacion o transformacion ("ev80_<keshin>_me"...) y por jugada sin
      tecnica (ev71), 1.514 en total; HCA estereo a 48 kHz (alguna a 44,1), 291 MB. En el .acb,
      el volumen de cada una (0,45-0,65; las voces van a 1)
  common/sound_asset/common.acb/.awb   los del sistema: los silbatos del partido (sy0312..sy0317,
      cada uno con 5 instrumentos que elige el estadio: el del partido normal, el silbato), la
      patada (sy0310, una de 5 al azar), el silbato del gol (sy0313) y el publico que lo
      celebra (sy0330)
  common/sound_asset/sr.acb/.awb   los ambientes (sr0001: el retumbar de algunas supertecnicas)
  common/event_cfg/snd/<ev>_snd.cfg.bin   el guion de sonido de cada evento (O-339): en que
      fotograma suena cada cue; tipo 0 efecto, 2 ambiente (la musica, 1, y las voces de la
      historia, 3, no). Casi siempre "<ev>_me" en el fotograma 0: dura lo que el evento

Aqui, en el PC de cada uno y desde SU juego (como los modelos y las voces: nunca se reparte),
cada cue que usa un partido se pasa a `datos/modelos3d/sonidos/<cue>.wav` (PCM de 16 bits, mono,
24 kHz, como las voces) con su `.json` (donde empieza cada variante y su volumen en VR), y
`sonidos/eventos.json` dice que cues lleva cada evento y en que segundo.

    preparar(jugadores, solo)  -> estado() con "necesarios": las cues de ese partido
    estado() -> {"hechos": {cue: {"variantes": [[inicio, muestras, volumen], ...], "bucle"}},
                 "sin": [las que el juego no trae], "pendientes", "actual", "errores", "error",
                 "eventos": si eventos.json esta, "necesarios": [cues] o None si aun no se sabe}

Va en su propio hilo, al lado de las colas de los modelos y de las voces, de tanda en tanda
(varias cues a la vez: el decodificador va mas rapido). Codigo propio (O-343).
"""
import json
import os
import re
import struct
import threading

import numpy as np

from ievr import cfgbin, rutas, voces

VERSION_SONIDO = 1        # sube si cambia lo que sale: lo convertido de otra version se rehace
VERSION_EVENTOS = 1
VERSION_INDICE = "sonidos1"
FS = voces.FS             # 24 kHz, como las voces: por encima de 12 kHz los efectos de VR llevan
                          # el 0,3 % de la energia (mediana de 40)
BANCOS = ("waza_stream", "common", "sr")
# los del partido sin tecnica (partido-sonidosvr.js SONIDOSVR.partido): la patada, los silbatos
# (saque, gol, falta, fuera de juego, descanso y final), y el publico que celebra el gol
PARTIDO = ("sy0310", "sy0312", "sy0313", "sy0314", "sy0315", "sy0316", "sy0317", "sy0330")
VARIANTES_MAX = 5
BUCLE_MAX = 15.0          # s que se guardan de un ambiente en bucle (la pagina lo corta con su evento)
TANDA = 8                 # cues que se decodifican a la vez (unos 1,5 MB de memoria por segundo de
                          # audio; con mas no va mas rapido)
_TIPOS = (0, 2)           # en los guiones snd: efecto y ambiente
_VOLUMEN = 146            # el comando de volumen de las secuencias, pistas y synth del .acb (un float)
_SELECTOR = 125           # el selector de una secuencia "switch" (tipo 7) y su etiqueta por defecto
_ETIQUETA = 100           # la etiqueta del selector de cada pista
_INFINITO = 0xFFFFFFFF    # el largo de las cues en bucle
_ACB = re.compile(r"^data/common/sound_asset/(waza_stream|common|sr)\.(acb|awb)$")
_NOMBRE = re.compile(r"^[A-Za-z0-9_]{2,60}$")

_cerrojo = threading.Lock()
_pedido = None            # {evento: asignados} del ultimo partido pedido
_necesarios = None        # las cues de ese partido (None: aun no se sabe, falta eventos.json)
_pendientes = []
_hechos = {}              # cue -> {"variantes": [[inicio, muestras, volumen], ...], "bucle": si lo es}
_sin = set()              # cues que el juego no trae
_errores = {}
_actual = None
_tanda = []               # las que se estan convirtiendo ahora (la primera es _actual)
_hilo = None
_error = ""
_evj = None               # eventos.json en memoria ({evento: [[segundo, cue]]})
_eventos_mirado = False   # el hilo ya ha mirado en esta sesion si el juego ha cambiado
_juego = None


def carpeta():
    from ievr import modelos3d
    return os.path.join(modelos3d.carpeta(), "sonidos")


def _hace_falta(ruta):
    return _ACB.match(ruta) is not None or voces._SND.match(ruta[len("data/"):]) is not None


def _el_juego():
    global _juego
    if _juego is None:
        from ievr import g4
        from ievr import modelos3d
        j = g4.Juego(rutas.carpeta_del_juego(), os.path.join(modelos3d.carpeta(), "indice_sonidos.json"),
                     filtro=_hace_falta, version=VERSION_INDICE)
        j.MEMORIA = 8 << 20
        _juego = j
    return _juego


# --------------------------------------------------------------------------- los bancos (ACB/AWB)
def _comandos(b):
    out, p = [], 0
    b = b or b""
    while p + 3 <= len(b):
        o, tam = int.from_bytes(b[p:p + 2], "big"), b[p + 2]
        out.append((o, bytes(b[p + 3:p + 3 + tam])))
        p += 3 + tam
        if o == 0:
            break
    return out


def cues_de(acb):
    """Las cues de un .acb: {nombre: {"variantes": [(audios, volumen)], "largo": ms o None}}.
    Cada variante, los audios ("s"/"m", id) que suenan juntos y su volumen en VR (el de la
    secuencia por el de su pista y su synth). Las secuencias que suenan todas a la vez (los
    efectos) dan una variante; las de azar (la patada), una por pista; las "switch" (tipo 7: los
    silbatos, cada pista un instrumento que elige el estadio), solo la de la etiqueta por
    defecto (el silbato). Solo audio HCA (EncodeType 2: todo el de estos bancos)."""
    t = voces._utf(acb)[0]
    T = lambda n: voces._tabla(t, n)  # noqa: E731
    nombres, cue, seq, trk = T("CueNameTable"), T("CueTable"), T("SequenceTable"), T("TrackTable")
    tev, syn, wav = T("TrackEventTable"), T("SynthTable"), T("WaveformTable")
    qc, tc, sc = T("SeqCommandTable"), T("TrackCommandTable"), T("SynthCommandTable")

    def ordenes(tabla, i):
        return _comandos(tabla[i]["Command"]) if i is not None and i < len(tabla) else []

    def vol(tabla, i):
        v = 1.0
        for o, a in ordenes(tabla, i):
            if o == _VOLUMEN and len(a) == 4:
                v *= struct.unpack(">f", a)[0]
        return v

    def de_onda(i):
        w = wav[i]
        if w.get("EncodeType") != 2:
            return []
        return [("s", w["StreamAwbId"]) if w.get("Streaming") else ("m", w["MemoryAwbId"])]

    def de_synth(i, prof=0):
        r, out = syn[i]["ReferenceItems"] or b"", []
        for k in range(0, len(r) - 3, 4):
            ty, ix = int.from_bytes(r[k:k + 2], "big"), int.from_bytes(r[k + 2:k + 4], "big")
            if ty == 1 and ix < len(wav):
                out += de_onda(ix)
            elif ty in (2, 3) and prof < 4 and ix < len(syn):
                out += de_synth(ix, prof + 1)[0]
        return out, vol(sc, syn[i].get("CommandIndex"))

    def de_pista(i):
        out, v = [], 1.0
        for orden, arg in _comandos(tev[trk[i]["EventIndex"]]["Command"]):
            if orden == 0x07D0 and len(arg) >= 4 and int.from_bytes(arg[0:2], "big") == 2:
                ix = int.from_bytes(arg[2:4], "big")
                if ix < len(syn):
                    a, vs = de_synth(ix)
                    out += a
                    v = vs if a else v
        return out, v * vol(tc, trk[i].get("CommandIndex"))

    def etiqueta(i):
        for o, a in ordenes(tc, trk[i].get("CommandIndex")):
            if o == _ETIQUETA and len(a) >= 4:
                return int.from_bytes(a[2:4], "big")
        return None

    out = {}
    for c in nombres:
        fila = cue[c["CueIndex"]]
        tipo, i = fila["ReferenceType"], fila["ReferenceIndex"]
        largo = fila.get("Length")
        variantes = []
        if tipo == 3 and i < len(seq):
            s = seq[i]
            ti = s["TrackIndex"] or b""
            ids = [int.from_bytes(ti[k:k + 2], "big") for k in range(0, len(ti) - 1, 2)]
            vs = vol(qc, s.get("CommandIndex"))
            if s["Type"] == 7:
                # (switch: la pista de la etiqueta por defecto del selector; si no, la primera)
                defecto = next((int.from_bytes(a[2:4], "big") for o, a in ordenes(qc, s.get("CommandIndex"))
                                if o == _SELECTOR and len(a) >= 4), None)
                ids = [k for k in ids if etiqueta(k) == defecto][:1] or ids[:1]
            pistas = [de_pista(k) for k in ids]
            pistas = [(a, v * vs) for a, v in pistas if a]
            if s["Type"] == 0 and pistas:
                variantes = [(sum((a for a, _v in pistas), []), max(v for _a, v in pistas))]
            else:
                variantes = pistas[:VARIANTES_MAX]
        elif tipo == 2 and i < len(syn):
            a, v = de_synth(i)
            variantes = [(a, v)] if a else []
        if variantes:
            out[c["CueName"]] = {"variantes": variantes, "largo": None if largo in (None, _INFINITO) else largo}
    return out, (t.get("AwbFile") or b"")


def _trozo(juego, ruta, desde, n):
    """n bytes de un fichero del juego desde `desde`, sin sacarlo entero (el .awb de waza_stream
    son 291 MB): los .awb van sin comprimir en el .cpk."""
    from ievr import cpk
    nom, off, tam, tamx = juego.ficheros[ruta]
    if tam != tamx:
        return bytes(juego.leer(ruta)[desde:desde + n])
    with cpk._Lector(os.path.join(juego.carpeta, nom)) as lec:
        return lec.leer(off + desde, n)


def _tabla_awb(juego, ruta):
    """Las entradas de un .awb (AFS2) leyendo solo su cabecera: {id: (inicio, fin)}."""
    cab = _trozo(juego, ruta, 0, 16)
    if cab[:4] != b"AFS2":
        raise ValueError("%s no es un AFS2" % ruta)
    osz, isz = cab[5], struct.unpack_from("<H", cab, 6)[0]
    n = struct.unpack_from("<I", cab, 8)[0]
    return voces.afs2(_trozo(juego, ruta, 0, 16 + isz * n + osz * (n + 1)))


class Bancos:
    """Los tres bancos del juego, leidos cuando hacen falta (sus .acb son pequenos)."""

    def __init__(self, juego):
        self.juego = juego
        self._b = {}

    def banco(self, nombre):
        if nombre not in self._b:
            acb = self.juego.leer("common/sound_asset/%s.acb" % nombre)
            cues, dentro = cues_de(acb)
            self._b[nombre] = {"cues": cues, "dentro": bytes(dentro), "m": voces.afs2(dentro) if dentro else {},
                               "s": None}
        return self._b[nombre]

    def de(self, cue):
        """(nombre del banco, su cue) o (None, None)."""
        for b in BANCOS:
            x = self.banco(b)["cues"].get(cue)
            if x:
                return b, x
        return None, None

    def nombres(self):
        return {c for b in BANCOS for c in self.banco(b)["cues"]}

    def audio(self, banco, a, i):
        """Los bytes del HCA ("s" en el .awb, "m" dentro del .acb) o None."""
        B = self.banco(banco)
        if a == "m":
            if i not in B["m"]:
                return None
            ini, fin = B["m"][i]
            return B["dentro"][ini:fin]
        ruta = "common/sound_asset/%s.awb" % banco
        if B["s"] is None:
            B["s"] = _tabla_awb(self.juego, ruta)
        if i not in B["s"]:
            return None
        ini, fin = B["s"][i]
        return _trozo(self.juego, ruta, ini, fin - ini)


_FILTROS = {}


def _a_fs(x, fs):
    """De fs a FS: de 48 kHz como las voces; de otra (44,1 kHz) un paso bajo a 11 kHz y
    luego interpolar."""
    if fs == 2 * FS:
        return voces._a_24k(x, fs)
    if fs == FS or len(x) == 0:
        return x
    if fs not in _FILTROS:
        n = np.arange(63) - 31
        f = 0.46 * 2 * FS / fs           # (el corte a 11 kHz, como voces._a_24k a 48 kHz)
        h = f * np.sinc(f * n) * np.blackman(63)
        _FILTROS[fs] = (h / h.sum()).astype(np.float32)
    y = np.convolve(x, _FILTROS[fs])[31:31 + len(x)]
    t = np.arange(0, len(x) * FS // fs) * (fs / FS)
    return np.interp(t, np.arange(len(x)), y).astype(np.float32)


def _ruta(destino, cue):
    return os.path.join(destino, cue)


def convertir_tanda(B, nombres, destino, informe=None):
    """Varias cues -> <destino>/<cue>.wav y .json. -> {cue: {"variantes": [[inicio, muestras,
    volumen]], "bucle"} o None si el juego no la trae}."""
    from ievr import hca
    out, trabajos, trozos, claves = {}, [], [], {}
    for c in nombres:
        banco, x = B.de(c)
        if not x:
            out[c] = None
            continue
        trabajos.append((c, banco, x))
        for audios, _v in x["variantes"]:
            for a, i in audios:
                if (banco, a, i) not in claves:
                    d = B.audio(banco, a, i)
                    if d:
                        claves[(banco, a, i)] = len(trozos)
                        trozos.append(d)
    dec = [None] * len(trozos)
    if trozos:
        try:
            dec = hca.decodificar_varios(trozos, informe)
        except hca.NoSoportado:
            # (no pasa en VR; si una no se puede, las demas de una en una)
            dec = []
            for b in trozos:
                try:
                    dec.append(hca.decodificar(b))
                except hca.NoSoportado:
                    dec.append(None)
    fs_de = [hca.cabecera(b)["fs"] for b in trozos]
    os.makedirs(destino, exist_ok=True)
    for c, banco, x in trabajos:
        partes, indice, n = [], [], 0
        for audios, v in x["variantes"]:
            sonidos = [(dec[claves[(banco, a, i)]], fs_de[claves[(banco, a, i)]]) for a, i in audios
                       if (banco, a, i) in claves and dec[claves[(banco, a, i)]] is not None]
            if not sonidos:
                continue
            # (estereo a mono; los de una variante suenan juntos)
            ms = [_a_fs(s.mean(axis=0), fs) for s, fs in sonidos]
            m = np.zeros(max(len(y) for y in ms), np.float32)
            for y in ms:
                m[:len(y)] += y
            # lo que dura la cue en VR (si es menos que el audio, con un fundido) y los bucles, BUCLE_MAX
            tope = x["largo"] / 1000.0 if x["largo"] else BUCLE_MAX
            if len(m) > int(tope * FS):
                m = m[:int(tope * FS)].copy()
                f = min(len(m), int(0.3 * FS))
                m[len(m) - f:] *= np.linspace(1, 0, f, dtype=np.float32)
            pico = float(np.abs(m).max()) if len(m) else 0.0
            if pico > 0.999:             # (alguno pasa un pelo de 1: sin recortar)
                m = m * (0.999 / pico)
            pcm = np.round(m * 32767).astype(np.int16)
            indice.append([n, len(pcm), round(float(v), 4)])
            partes.append(pcm)
            n += len(pcm)
        if not partes:
            out[c] = None
            continue
        base = _ruta(destino, c)
        voces._escribir_wav(base + ".wav", np.concatenate(partes))
        voces._escribir_json(base + ".json", {"version": VERSION_SONIDO, "cue": c, "banco": banco, "fs": FS,
                                              "variantes": indice, "bucle": x["largo"] is None,
                                              "segundos": round(n / FS, 3)})
        out[c] = {"variantes": indice, "bucle": x["largo"] is None}
    return out


def al_dia(destino, cue):
    """{"variantes", "bucle"} de una cue ya convertida (con esta version), o None."""
    try:
        base = _ruta(destino, cue)
        with open(base + ".json", encoding="utf-8") as fh:
            d = json.load(fh)
        if d.get("version") == VERSION_SONIDO and os.path.isfile(base + ".wav"):
            return {"variantes": d.get("variantes") or [], "bucle": bool(d.get("bucle"))}
    except (OSError, ValueError):
        pass
    return None


# --------------------------------------------------------------------------- los guiones de sonido
def efectos_de_evento(datos):
    """Los efectos del guion de sonido de un evento: [[segundo, cue]] por orden (con
    <ASSIGN_SND>, el keshin o alma, sin poner)."""
    out = []
    fotograma = orden = None
    for nombre, v in cfgbin.leer(datos):
        if nombre == "EVENT_COMMAND_HEADER" and len(v) >= 2:
            fotograma, orden = v[0], v[1]
        elif nombre == "EVENT_COMMAND_ARGS" and orden == voces._JUGAR and len(v) > 2 and v[1] in _TIPOS \
                and isinstance(v[2], str):
            x = [round(fotograma / 60.0, 3), v[2]]
            if x not in out:
                out.append(x)
    out.sort(key=lambda x: x[0])
    return out


def convertir_eventos(juego, B, destino):
    """sonidos/eventos.json: los efectos de todos los eventos de supertecnicas, espiritus y
    jugadas sin tecnica (solo las cues que traen los bancos; la musica y las de la historia no).
    -> {evento: [[segundo, cue]]}"""
    from ievr import g4
    existen = B.nombres()
    plantillas = {}
    eventos = {}
    for ruta in sorted(r for r in juego.ficheros if voces._SND.match(r)):
        ev = os.path.basename(ruta)[:-len("_snd.cfg.bin")]
        try:
            lista = efectos_de_evento(juego.leer(ruta))
        except Exception:
            continue
        buenas = []
        for s, c in lista:
            if "<ASSIGN_SND>" in c:
                if c not in plantillas:
                    rx = re.compile("^" + re.escape(c).replace(re.escape("<ASSIGN_SND>"), "[ka]\\d{6}") + "$")
                    plantillas[c] = any(rx.match(x) for x in existen)
                if plantillas[c]:
                    buenas.append([s, c])
            elif c in existen:
                buenas.append([s, c])
        if buenas:
            eventos[ev] = buenas
    os.makedirs(destino, exist_ok=True)
    voces._escribir_json(os.path.join(destino, "eventos.json"), {"version": VERSION_EVENTOS, "firma": g4._firma(juego.carpeta),
                                                                 "eventos": eventos})
    return eventos


def _leer_eventos(destino, juego=None):
    """eventos.json si esta al dia (con el juego: si no ha cambiado), o None."""
    try:
        with open(os.path.join(destino, "eventos.json"), encoding="utf-8") as fh:
            d = json.load(fh)
    except (OSError, ValueError):
        return None
    if d.get("version") != VERSION_EVENTOS:
        return None
    if juego is not None:
        from ievr import g4
        if d.get("firma") != g4._firma(juego.carpeta):
            return None
    return d.get("eventos") or {}


# --------------------------------------------------------------------------- lo de un partido
def eventos_de(jugadores):
    """{evento: {asignados}} de un partido: los de sus supertecnicas (y la de fallo de sus
    bloqueos y paradas, O-344, con el keshin de la de acierto), sus espiritus y las jugadas sin
    tecnica (ievr/g4evento.pedidos_de, O-323, O-345)."""
    from ievr import g4evento as GE
    _c, pedidos, _r, mapa = GE.pedidos_de(jugadores)
    out = {ev: set(p["asignados"]) for ev, p in pedidos.items()}
    for t in mapa["tecnicas"].values():
        ev, ef = t.get("evento"), t.get("evento_fallo")
        if ef:
            out.setdefault(ef, set()).update(out.get(ev, set()))
    return out


def cues_de_eventos(eventos, evj):
    """Las cues que suenan en esos eventos (con el keshin o alma puesto) y las del partido."""
    out = set(PARTIDO)
    for ev, asignados in eventos.items():
        for _s, c in evj.get(ev, []):
            if "<ASSIGN_SND>" in c:
                out.update(c.replace("<ASSIGN_SND>", a) for a in asignados if a)
            else:
                out.add(c)
    return out


def celebraciones(jugadores):
    """{cara: [eventos de gol]}: las celebraciones de VR de cada jugador del partido, por su
    tipo de celebracion (datos/reglas-extraidas/celebraciones.csv, herramientas/
    construir_celebraciones.py). Los que no lo tienen no salen."""
    from ievr import reglas
    tabla = {f["codigo"]: f for f in reglas._tabla("celebraciones.csv")}
    out = {}
    for j in jugadores:
        cara = str(j.get("cara") or "")
        f = tabla.get(cara) or tabla.get(voces.banco_de(cara))
        if f and f.get("celebraciones"):
            out[cara] = ["ev71_%s" % x for x in f["celebraciones"].split()]
    return out


# --------------------------------------------------------------------------- la cola
def estado():
    with _cerrojo:
        nec = _necesarios
        return {"hechos": {c: _hechos[c] for c in (nec or ()) if c in _hechos},
                "sin": sorted(c for c in (nec or ()) if c in _sin), "pendientes": _tanda[1:] + list(_pendientes),
                "actual": _actual, "errores": dict(_errores), "error": _error, "eventos": _evj is not None,
                "necesarios": sorted(nec) if nec is not None else None}


def _sin_juego():
    if not rutas.carpeta_del_juego():
        return "No encuentro Inazuma Eleven: Victory Road en este ordenador: el partido va sin sus efectos de sonido."
    return ""


def _poner_en_cola(cues, solo):
    """(con el cerrojo) Las cues que falten a la cola; lo ya convertido, a hechos."""
    destino = carpeta()
    if solo:
        _pendientes[:] = [c for c in _pendientes if c in cues]
    nuevos = []
    for c in sorted(cues):
        if c in _hechos or c in _sin or c in _tanda or c in _pendientes:
            continue
        v = al_dia(destino, c)
        if v is not None:
            _hechos[c] = v
            continue
        _errores.pop(c, None)
        nuevos.append(c)
    # (las del partido primero: suenan en todos)
    nuevos.sort(key=lambda c: c not in PARTIDO)
    _pendientes[:0] = nuevos


def preparar(jugadores, solo=False):
    """Pone en la cola las cues de los eventos de estos jugadores que falten. Lo ultimo pedido va
    delante; con `solo` (la precarga, O-329) lo de otros partidos se quita."""
    global _error, _pedido, _necesarios
    eventos = eventos_de(jugadores)
    error = _sin_juego()
    with _cerrojo:
        _error = error
        _pedido = (eventos, solo)
        _necesarios = None
        if _evj is not None:
            _necesarios = cues_de_eventos(eventos, _evj)
            if not error:
                _poner_en_cola(_necesarios, solo)
        if not error:
            _arrancar()
    return estado()


def _arrancar():
    global _hilo
    if _hilo is None:
        _hilo = threading.Thread(target=_trabajar, name="sonidos", daemon=True)
        _hilo.start()


def _trabajar():
    """El hilo: eventos.json (una vez por sesion se mira si el juego ha cambiado), las cues del
    partido pedido y luego las que falten, de tanda en tanda; se acaba cuando no queda ninguna."""
    global _actual, _hilo, _error, _evj, _eventos_mirado, _necesarios
    destino = carpeta()
    try:
        juego = _el_juego()
        B = Bancos(juego)
        if not _eventos_mirado:
            evj = _leer_eventos(destino, juego)
            if evj is None:
                evj = convertir_eventos(juego, B, destino)
            with _cerrojo:
                _evj, _eventos_mirado = evj, True
    except Exception as e:
        with _cerrojo:
            _error = "No he podido leer el juego para los efectos de sonido: %s" % e
            _pendientes.clear()
            _hilo = None
        return
    while True:
        with _cerrojo:
            if _pedido is not None and _necesarios is None:
                _necesarios = cues_de_eventos(_pedido[0], _evj)
                _poner_en_cola(_necesarios, _pedido[1])
            if not _pendientes:
                _actual = None
                _hilo = None
                return
            tanda = _pendientes[:TANDA]
            del _pendientes[:TANDA]
            _actual = tanda[0]
            _tanda[:] = tanda
        try:
            r = convertir_tanda(B, tanda, destino)
        except Exception as e:
            # (una tanda que falla: de una en una, para que una no se lleve a las demas)
            r = {}
            for c in tanda:
                try:
                    r.update(convertir_tanda(B, [c], destino))
                except Exception as e2:
                    with _cerrojo:
                        _errores[c] = "%s: %s" % (type(e2).__name__, e2 or e)
        with _cerrojo:
            for c, v in r.items():
                if v is None:
                    _sin.add(c)
                else:
                    _hechos[c] = v
            _actual = None
            _tanda[:] = []
