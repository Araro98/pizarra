"""Las voces de VR en el partido (NOTAS O-339). Aaron: "tambien añade voces del juego, cuando
hacen una supertecnica, hay personajes que tienen lineas de voz en esas tecnicas, y en general".

Donde estan en VR (scratchpad juego/animvr/VOCES.md):
  common/sound_asset/<idioma>/c<8 cifras>.acb/.awb   el banco de voz de cada personaje con voz
      (1.936 en japones, 106 en ingles): el .acb (tablas @UTF de CRI) dice el nombre de cada
      linea ("c01000010_whk00010") y que audio (o audios: variantes al azar) suena; el .awb
      (AFS2) trae el audio, HCA (ievr/hca.py). El numero del banco es el de la cara del
      personaje (modelos-personaje.csv): la voz va con la cara.
  common/event_cfg/snd/<ev>_snd.cfg.bin   el guion de sonido de cada evento (cada supertecnica,
      invocacion y transformacion, O-323): en que fotograma suena cada linea y de quien (s00 el
      que la hace, s01.. el rival o los companeros, <ASSIGN> su keshin o alma: la dice el
      jugador). La linea de la tecnica es su nombre interno (whs00050) en el banco del que la
      dice; ademas van las generales (sh010 al chutar, sp050 el esfuerzo, sp150 al perder...).
  Las lineas de un partido sin tecnica (eventos ev71 del juego): sh010 el tiro, kp020/kp030 la
      parada y el despeje del portero, bt060/bt070 el que gana un duelo (regate / robo), sp150
      el que pierde, pa010 el pase y gl010..gl170 el gol (cada una con su celebracion).

Aqui, en el PC de cada uno y desde SU juego (como los modelos: nunca se reparte), cada banco se
pasa a `datos/modelos3d/voces/<idioma>/<banco>.wav` (PCM de 16 bits, mono, 24 kHz: el navegador
lo toca sin librerias) con su `.json` (donde empieza y cuanto dura cada linea y sus variantes),
solo con lo que usa el partido: las lineas de sus tecnicas y espiritus, las generales y cuatro
de gol; como mucho dos variantes de cada una. Y `voces/eventos.json`: las lineas de todos los
eventos de supertecnicas y espiritus (segundo, linea, quien). El idioma: el de las voces del
juego de este PC (la opcion VoiceLanguage de su partida de sistema: 0 japones, 1 ingles; en
ingles solo hay 106 bancos, los demas en japones); si no se sabe, japones (el del anime).

    preparar(jugadores, solo)  -> estado() con "idioma" y "bancos" {cara: banco}
    estado() -> {"hechos": {banco: idioma}, "sin": [bancos sin voz], "pendientes", "actual",
                 "errores", "error", "eventos": si eventos.json esta}

Va en su propio hilo, de banco en banco (un banco son 0,2-0,6 s), al lado de la cola de los
modelos (ievr/modelos3d.py). Codigo propio (O-339).
"""
import glob
import json
import os
import re
import struct
import threading

import numpy as np

from ievr import cfgbin, rutas

VERSION_VOZ = 1           # sube si cambia lo que sale: lo convertido de otra version se rehace
VERSION_INDICE = "voces1"
FS = 24000                # la voz a 24 kHz (hasta 12 kHz: de sobra para la voz) ocupa la mitad
GOLES_MAX = 4             # lineas de gol por personaje (cada una con su celebracion en VR)
VARIANTES_MAX = 2
# las lineas generales que salen en los guiones de las supertecnicas y espiritus (ev60-63,
# ev80-85) y en las jugadas sin tecnica (ev71)
GENERALES = ("bt020", "bt060", "bt070", "fr010", "kp020", "kp030", "pa010", "sh010", "sh011",
             "sp020", "sp021", "sp030", "sp040", "sp050", "sp051", "sp070", "sp100", "sp110", "sp150")
# las de las tecnicas (whs00050, whk00550_ie3, whd00010a...) y los espiritus (k000510_inc, la
# armadura "armed", el mixi max "wmt"/"wmm", las tecnicas con el keshin a000080_whs00410)
_TECNICA = re.compile(r"^(wh[a-z]{1,2}\d{5}[a-z]?(_\d{1,2}|_ie\d)?|[ka]\d{5,6}_(inc|wh[a-z]{1,2}\d{5}[a-z]?)|armed|wmt|wmm|winc)$")
_GOL = re.compile(r"^gl0\d\d$")
_BANCO = re.compile(r"c\d{8}")
# los guiones de sonido de las supertecnicas (ev60-63) y de los espiritus (ev80-85)
_SND = re.compile(r"^common/event_cfg/snd/(ev6[0-3]|ev8[0-5])_\d{5}(_\d{1,2})?_snd\.cfg\.bin$")
_JUGAR = 960914812        # la orden de los guiones snd que hace sonar (la de antes, -1167595452, prepara)
_VOZ = 4                  # tipo de sonido: voz del actor (0 efectos, 1 musica, 2 ambiente)
_VOICE_LANGUAGE = 0xB3EF42F8      # crc32("VoiceLanguage") en la partida de sistema
_IDIOMAS = ("ja", "en")           # el orden de los idiomas en VR (ja 0, en 1, fr 2, es 3...)

_cerrojo = threading.Lock()
_pedidos = []             # bancos pedidos en esta sesion
_pendientes = []
_hechos = {}              # banco -> idioma de su carpeta
_sin = set()              # bancos que el juego no trae (ese personaje no tiene voz)
_errores = {}
_actual = None
_hilo = None
_error = ""
_eventos = None           # None: sin mirar; True/False: eventos.json al dia o no
_eventos_mirado = False   # el hilo ya ha mirado en esta sesion si el juego ha cambiado
_juego = None
_idioma = None


def carpeta():
    from ievr import modelos3d
    return os.path.join(modelos3d.carpeta(), "voces")


def banco_de(cara):
    """'c01000010_5000' -> 'c01000010' (la voz va con la cara); '' si no es de personaje."""
    m = _BANCO.match(cara or "")
    return m.group(0) if m else ""


def _hace_falta(ruta):
    if ruta.startswith("data/common/sound_asset/"):
        return re.search(r"/(ja|en)/c\d{8}\.(acb|awb)$", ruta) is not None
    return _SND.match(ruta[len("data/"):]) is not None


def _el_juego():
    global _juego
    if _juego is None:
        from ievr import g4
        from ievr import modelos3d
        j = g4.Juego(rutas.carpeta_del_juego(), os.path.join(modelos3d.carpeta(), "indice_voces.json"),
                     filtro=_hace_falta, version=VERSION_INDICE)
        j.MEMORIA = 8 << 20
        _juego = j
    return _juego


# --------------------------------------------------------------------------- el idioma
def idioma():
    """'ja' o 'en': el de las voces del juego de este PC (IEVR_VOZ_IDIOMA lo fuerza)."""
    global _idioma
    fijo = os.environ.get("IEVR_VOZ_IDIOMA")
    if fijo in _IDIOMAS:
        return fijo
    if _idioma is None:
        _idioma = _idioma_de_la_partida() or "ja"
    return _idioma


def _idioma_de_la_partida():
    """El VoiceLanguage de la partida de sistema mas reciente de Steam (o None)."""
    raices = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
            raices.append(winreg.QueryValueEx(k, "SteamPath")[0])
    except Exception:
        pass
    for unidad in "CDEFGH":
        for sub in (r"Program Files (x86)\Steam", "Steam", "steam", r"Juegos\Steam", r"Games\Steam"):
            raices.append("%s:\\%s" % (unidad, sub))
    vistos = []
    for r in raices:
        vistos += glob.glob(os.path.join(r, "userdata", "*", "2799860", "remote", "*-SYSTEMLIVE"))
    for ruta in sorted(set(vistos), key=lambda x: -os.path.getmtime(x)):
        try:
            from ievr import codec
            plano = codec.load(ruta)
            k = plano.find(struct.pack("<II", _VOICE_LANGUAGE, 1))
            if k >= 0:
                v = plano[k + 8]
                return _IDIOMAS[v] if v < len(_IDIOMAS) else None
        except Exception:
            continue
    return None


# --------------------------------------------------------------------------- el banco (ACB/AWB)
def _utf(b):
    from ievr import cpk
    return cpk._utf(b)


def _tabla(t, nombre):
    v = t.get(nombre)
    return _utf(v) if isinstance(v, (bytes, bytearray)) and bytes(v[:4]) == b"@UTF" else []


def afs2(b):
    """Las entradas de un AFS2 (.awb): {id: (inicio, fin)}."""
    if bytes(b[:4]) != b"AFS2":
        raise ValueError("no es un AFS2")
    osz, isz = b[5], struct.unpack_from("<H", b, 6)[0]
    n, alin = struct.unpack_from("<I", b, 8)[0], struct.unpack_from("<H", b, 12)[0]
    ids = [int.from_bytes(b[16 + isz * k:16 + isz * (k + 1)], "little") for k in range(n)]
    p = 16 + isz * n
    offs = [int.from_bytes(b[p + osz * k:p + osz * (k + 1)], "little") for k in range(n + 1)]
    return {ids[k]: ((offs[k] + alin - 1) // alin * alin, offs[k + 1]) for k in range(n)}


def cues_de(acb):
    """Las lineas de un .acb: {nombre: [variante, ...]}, cada variante una lista de audios
    ("s"/"m", id del awb) que suenan juntos ("s": en el .awb aparte; "m": dentro del .acb).
    Las secuencias al azar (las de voz casi todas) dan una variante por pista; las que suenan
    todas a la vez, una sola con todo. Solo audio HCA (EncodeType 2: todo el de las voces)."""
    t = _utf(acb)[0]
    nombres = _tabla(t, "CueNameTable")
    cue, seq, trk = _tabla(t, "CueTable"), _tabla(t, "SequenceTable"), _tabla(t, "TrackTable")
    tev, syn, wav = _tabla(t, "TrackEventTable"), _tabla(t, "SynthTable"), _tabla(t, "WaveformTable")

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
                out += de_synth(ix, prof + 1)
        return out

    def de_pista(i):
        ev, p, out = tev[trk[i]["EventIndex"]]["Command"] or b"", 0, []
        while p + 3 <= len(ev):
            orden, tam = int.from_bytes(ev[p:p + 2], "big"), ev[p + 2]
            arg = ev[p + 3:p + 3 + tam]
            p += 3 + tam
            if orden == 0:
                break
            if orden == 0x07D0 and len(arg) >= 4 and int.from_bytes(arg[0:2], "big") == 2:
                ix = int.from_bytes(arg[2:4], "big")
                if ix < len(syn):
                    out += de_synth(ix)
        return out

    lineas = {}
    for c in nombres:
        fila = cue[c["CueIndex"]]
        tipo, i = fila["ReferenceType"], fila["ReferenceIndex"]
        if tipo == 3 and i < len(seq):
            ti = seq[i]["TrackIndex"] or b""
            pistas = [de_pista(int.from_bytes(ti[k:k + 2], "big")) for k in range(0, len(ti) - 1, 2)]
            pistas = [x for x in pistas if x]
            variantes = [sum(pistas, [])] if seq[i]["Type"] == 0 and pistas else pistas
        elif tipo == 2 and i < len(syn):
            variantes = [de_synth(i)]
        else:
            variantes = []
        variantes = [v for v in variantes if v]
        if variantes:
            lineas[c["CueName"]] = variantes
    return lineas, (t.get("AwbFile") or b"")


def que_lineas(banco, lineas):
    """Las lineas del banco que usa el partido: {sufijo: variantes} (ver GENERALES)."""
    out, goles = {}, []
    for nombre in sorted(lineas):
        if not nombre.startswith(banco + "_"):
            continue
        suf = nombre[len(banco) + 1:]
        if "_sp_" in suf:          # las de las parejas especiales (sp_voice): no se sabe cuando
            continue
        if suf in GENERALES or _TECNICA.match(suf):
            out[suf] = lineas[nombre][:VARIANTES_MAX]
        elif _GOL.match(suf):
            goles.append(suf)
    # las de gol: las primeras con audio distinto (muchas comparten el mismo)
    vistas = set()
    for suf in goles:
        v = lineas[banco + "_" + suf][:1]
        clave = tuple(v[0])
        if clave in vistas:
            continue
        vistas.add(clave)
        out[suf] = v
        if len(vistas) >= GOLES_MAX:
            break
    return out


_FILTRO = None


def _a_24k(x, fs):
    """De fs (48 kHz en VR) a FS, con un filtro paso bajo (seno cardinal con ventana)."""
    global _FILTRO
    if fs == FS or len(x) == 0:
        return x
    if fs == 2 * FS:
        if _FILTRO is None:
            n = np.arange(63) - 31
            h = 0.46 * np.sinc(0.46 * n) * np.blackman(63)
            _FILTRO = (h / h.sum()).astype(np.float32)
        return np.convolve(x, _FILTRO)[31:31 + len(x)][::2]
    t = np.arange(0, len(x) * FS // fs) * (fs / FS)
    return np.interp(t, np.arange(len(x)), x).astype(np.float32)


def _escribir_wav(ruta, pcm):
    datos = pcm.astype("<i2").tobytes()
    cab = (b"RIFF" + struct.pack("<I", 36 + len(datos)) + b"WAVEfmt " +
           struct.pack("<IHHIIHH", 16, 1, 1, FS, FS * 2, 2, 16) + b"data" + struct.pack("<I", len(datos)))
    with open(ruta + ".tmp", "wb") as fh:
        fh.write(cab + datos)
    os.replace(ruta + ".tmp", ruta)


def _escribir_json(ruta, d):
    with open(ruta + ".tmp", "w", encoding="utf-8") as fh:
        json.dump(d, fh, separators=(",", ":"))
    os.replace(ruta + ".tmp", ruta)


def convertir_banco(juego, idioma_, banco, destino, informe=None):
    """El banco de voz de un personaje -> <destino>/<idioma>/<banco>.wav y .json. -> segundos."""
    from ievr import hca
    acb = juego.leer("common/sound_asset/%s/%s.acb" % (idioma_, banco))
    lineas, awb_dentro = cues_de(acb)
    usa = que_lineas(banco, lineas)
    ruta_awb = "common/sound_asset/%s/%s.awb" % (idioma_, banco)
    fuera = juego.leer(ruta_awb) if any(a == "s" for v in usa.values() for var in v for a, _ in var) else b""
    tabs = {"s": afs2(fuera) if fuera else {}, "m": afs2(awb_dentro) if awb_dentro else {}}
    fuentes = {"s": fuera, "m": awb_dentro}
    claves = sorted({w for v in usa.values() for var in v for w in var if w[1] in tabs[w[0]]})
    trozos = [bytes(fuentes[a][tabs[a][i][0]:tabs[a][i][1]]) for a, i in claves]
    audio = {}
    if trozos:
        try:
            dec = hca.decodificar_varios(trozos, informe)
        except hca.NoSoportado:
            # (no pasa en VR; si una linea no se puede, las demas de una en una)
            dec = []
            for b in trozos:
                try:
                    dec.append(hca.decodificar(b))
                except hca.NoSoportado:
                    dec.append(None)
        for k, x in zip(claves, dec):
            if x is not None:
                audio[k] = (x, hca.cabecera(trozos[claves.index(k)])["fs"])
    partes, indice, n, ya = [], {}, 0, {}
    for suf, variantes in usa.items():
        for var in variantes:
            # (muchas lineas comparten el mismo audio: una vez en el .wav)
            if tuple(var) in ya:
                indice.setdefault(suf, []).append(ya[tuple(var)])
                continue
            sonidos = [audio[w] for w in var if w in audio]
            if not sonidos:
                continue
            fs = sonidos[0][1]
            largo = max(s[0].shape[1] for s in sonidos)
            mezcla = np.zeros(largo, np.float32)
            for s, _fs in sonidos:
                mezcla[:s.shape[1]] += s.mean(axis=0)
            m = _a_24k(mezcla, fs)
            pico = float(np.abs(m).max()) if len(m) else 0.0
            if pico > 0.999:             # (alguna pasa un pelo de 1 al decodificar: sin recortar)
                m = m * (0.999 / pico)
            pcm = np.round(m * 32767).astype(np.int16)
            indice.setdefault(suf, []).append([n, len(pcm)])
            ya[tuple(var)] = [n, len(pcm)]
            partes.append(pcm)
            n += len(pcm)
    os.makedirs(os.path.join(destino, idioma_), exist_ok=True)
    base = os.path.join(destino, idioma_, banco)
    _escribir_wav(base + ".wav", np.concatenate(partes) if partes else np.zeros(0, np.int16))
    _escribir_json(base + ".json", {"version": VERSION_VOZ, "banco": banco, "idioma": idioma_, "fs": FS,
                                    "lineas": indice, "segundos": round(n / FS, 2)})
    return n / FS


def al_dia(destino, idioma_, banco):
    try:
        with open(os.path.join(destino, idioma_, banco + ".json"), encoding="utf-8") as fh:
            d = json.load(fh)
        return d.get("version") == VERSION_VOZ and os.path.isfile(os.path.join(destino, idioma_, banco + ".wav"))
    except (OSError, ValueError):
        return False


# --------------------------------------------------------------------------- los guiones de sonido
def lineas_de_evento(datos):
    """Las voces del guion de sonido de un evento: [[segundo, linea, quien]] por orden; quien
    es "s00".."s04" (el actor) o "a" (su keshin o alma: la dice el jugador s00; en la linea va
    <ASSIGN_SND>, el codigo del keshin). Sin las de las parejas especiales (sp_voice)."""
    out = []
    fotograma = orden = None
    for nombre, v in cfgbin.leer(datos):
        if nombre == "EVENT_COMMAND_HEADER" and len(v) >= 2:
            fotograma, orden = v[0], v[1]
        elif nombre == "EVENT_COMMAND_ARGS" and orden == _JUGAR and len(v) > 7 and v[1] == _VOZ:
            linea, actor = v[2], v[7]
            if not isinstance(linea, str) or not isinstance(actor, str) or actor == "NONE" or "_sp_" in linea:
                continue
            cond = next((k for k, x in enumerate(v) if isinstance(x, str) and x.endswith("_sp_voice")), None)
            if cond is not None and cond + 1 < len(v) and v[cond + 1] == 0:
                continue
            if actor.startswith("<ASSIGN>"):
                quien = "a"
            else:
                m = re.search(r"_s(\d\d)", actor)
                if not m:
                    continue
                quien = "s" + m.group(1)
            x = [round(fotograma / 60.0, 3), linea, quien]
            if x not in out:
                out.append(x)
    out.sort(key=lambda x: x[0])
    return out


def convertir_eventos(juego, destino):
    """voces/eventos.json: las voces de todos los eventos de supertecnicas y espiritus."""
    from ievr import g4
    eventos = {}
    for ruta in sorted(r for r in juego.ficheros if _SND.match(r)):
        ev = os.path.basename(ruta)[:-len("_snd.cfg.bin")]
        try:
            l = lineas_de_evento(juego.leer(ruta))
        except Exception:
            continue
        if l:
            eventos[ev] = l
    os.makedirs(destino, exist_ok=True)
    _escribir_json(os.path.join(destino, "eventos.json"), {"version": VERSION_VOZ, "firma": g4._firma(juego.carpeta),
                                                           "eventos": eventos})
    return len(eventos)


def _eventos_al_dia(destino, juego=None):
    try:
        with open(os.path.join(destino, "eventos.json"), encoding="utf-8") as fh:
            d = json.load(fh)
    except (OSError, ValueError):
        return False
    if d.get("version") != VERSION_VOZ:
        return False
    if juego is not None:
        from ievr import g4
        return d.get("firma") == g4._firma(juego.carpeta)
    return True


# --------------------------------------------------------------------------- la cola
def estado():
    with _cerrojo:
        return {"hechos": {b: _hechos[b] for b in _pedidos if b in _hechos},
                "sin": sorted(b for b in _pedidos if b in _sin), "pendientes": list(_pendientes),
                "actual": _actual, "errores": dict(_errores), "error": _error,
                "eventos": bool(_eventos)}


def _sin_juego():
    if not rutas.carpeta_del_juego():
        return "No encuentro Inazuma Eleven: Victory Road en este ordenador: el partido va sin voces."
    return ""


def bancos_de(jugadores):
    """{cara: banco} de los jugadores de un partido y de en lo que se convierten con su espiritu
    (la armadura, el mixi max, el modo: cara_a de eventos-espiritus.csv)."""
    from ievr import reglas
    esp = {}
    for f in reglas._tabla("eventos-espiritus.csv"):
        esp.setdefault((f.get("id") or "").upper(), []).append(f)
    out = {}
    for j in jugadores:
        cara = str(j.get("cara") or "")
        if banco_de(cara):
            out[cara] = banco_de(cara)
        filas = esp.get(str(j.get("espiritu") or "").upper(), [])
        fe = next((f for f in filas if f.get("cara_de") == cara), None) or next((f for f in filas if not f.get("cara_de")), None)
        if fe and banco_de(fe.get("cara_a")):
            out[fe["cara_a"]] = banco_de(fe["cara_a"])
    return out


def preparar(jugadores, solo=False):
    """Pone en la cola los bancos de voz de estos jugadores que falten (y eventos.json). Lo
    ultimo pedido va delante; con `solo` (la precarga, O-329) lo de otros partidos se quita."""
    global _error, _eventos
    bancos = bancos_de(jugadores)
    lista = list(dict.fromkeys(bancos.values()))
    error = _sin_juego()
    id_ = idioma()
    destino = carpeta()
    with _cerrojo:
        _error = error
        if solo:
            _pendientes[:] = [b for b in _pendientes if b in lista]
        nuevos = []
        for b in lista:
            if b not in _pedidos:
                _pedidos.append(b)
            if b in _hechos or b in _sin or b == _actual or error:
                continue
            # ya convertido (en su idioma o, si no lo trae, en japones): sin mirar el juego
            hecho = next((i for i in (id_, "ja") if al_dia(destino, i, b)), None)
            if hecho:
                _hechos[b] = hecho
                continue
            _errores.pop(b, None)
            if b in _pendientes:
                _pendientes.remove(b)
            nuevos.append(b)
        _pendientes[:0] = nuevos
        if _eventos is None and not error:
            _eventos = _eventos_al_dia(destino) or None
        if not error and (_pendientes or not _eventos_mirado):
            _arrancar()
    e = estado()
    e["idioma"] = id_
    e["bancos"] = bancos
    return e


def _arrancar():
    global _hilo
    if _hilo is None:
        _hilo = threading.Thread(target=_trabajar, name="voces", daemon=True)
        _hilo.start()


def _trabajar():
    """El hilo: eventos.json (una vez por sesion se mira si el juego ha cambiado) y luego los
    bancos de uno en uno; se acaba cuando no queda ninguno."""
    global _actual, _hilo, _error, _eventos, _eventos_mirado
    destino = carpeta()
    try:
        juego = _el_juego()
    except Exception as e:
        with _cerrojo:
            _error = "No he podido leer el juego para las voces: %s" % e
            _pendientes.clear()
            _hilo = None
        return
    if not _eventos_mirado:
        try:
            ok = _eventos_al_dia(destino, juego) or convertir_eventos(juego, destino) >= 0
        except Exception as e:
            ok = False
            with _cerrojo:
                _errores["eventos"] = "%s: %s" % (type(e).__name__, e)
        with _cerrojo:
            _eventos, _eventos_mirado = ok, ok
    while True:
        with _cerrojo:
            if not _pendientes:
                _actual = None
                _hilo = None
                return
            banco = _actual = _pendientes.pop(0)
        try:
            id_ = idioma()
            # el banco en el idioma de las voces del juego; si no lo trae (en ingles solo hay
            # 106), en japones; si tampoco, ese personaje no tiene voz
            hecho = next((i for i in (id_, "ja") if juego.hay("common/sound_asset/%s/%s.acb" % (i, banco))), None)
            if hecho is None:
                with _cerrojo:
                    _sin.add(banco)
            else:
                if not al_dia(destino, hecho, banco):
                    convertir_banco(juego, hecho, banco, destino)
                with _cerrojo:
                    _hechos[banco] = hecho
        except Exception as e:      # uno que falla no para a los demas
            with _cerrojo:
                _errores[banco] = "%s: %s" % (type(e).__name__, e)
        finally:
            with _cerrojo:
                _actual = None
