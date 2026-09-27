"""Modo draft entre dos jugadores (NOTAS O-247).

Aqui solo va lo que necesita el servidor local:

- `candidatos()`: los personajes que pueden salir en el draft, con lo que hace
  falta para pintarlos (cara, busto, posicion, afinidad, stats a nivel 99 en
  Leyenda con su arbol). Salen tambien los ilegales (no fichables: formas de
  modo, mixi max, versiones de la historia...), como pidio Aaron, pero solo
  los que tienen cara y modelo de verdad: cara `c...` que existe en los
  dibujos, nombre y posicion (los NPC, objetos, animales de relleno y el Avatar
  no). Los Diamantes nativos no salen: el Diamante lo elige cada uno al final.
- `guardar(resultado)` / `guardados()`: el resultado de cada draft se guarda
  en `partidas/draft/` para seguir luego con el equipo.

La parte en linea (quien esta conectado, invitaciones, turnos) va en la
pagina (`web/draft.html` y `web/draft-red.js`), que habla con un servidor de
mensajes publico (MQTT por WebSocket): no hace falta cuenta ni abrir puertos.
"""
import datetime
import json
import os
import re

from ievr import basedatos as BD, opciones as O, reglas

RAIZ = os.environ.get("IEVR_RAIZ") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# grupos del draft: los cuatro de jugador y los dos de personal
GRUPOS = ("DEL", "MED", "DEF", "POR", "GER", "ENT")


def _carpeta():
    d = os.path.join(RAIZ, "partidas", "draft")
    os.makedirs(d, exist_ok=True)
    return d


def _caras_que_existen():
    carpeta = os.path.join(RAIZ, "datos", "iconos", "data", "dx11", "menu", "200_icon", "10_icon_chr", "face")
    try:
        return {f[:-6] for f in os.listdir(carpeta) if f.endswith("_l.png")}
    except OSError:
        return set()


def candidatos():
    """[{...}] de todos los que pueden salir, una vez por identidad."""
    def construir():
        caras = _caras_que_existen()
        fichables = {f["identidad"].upper() for f in reglas._tabla("fichables.csv")}
        fuera = []
        for p in BD.personajes():
            cara = p.get("cara") or ""
            if not re.match(r"^c\d", cara) or (caras and cara not in caras):
                continue
            rv = int(p.get("rareza_valor") or 0)
            if rv == 8:
                continue            # Diamantes nativos: el Diamante se elige al final
            if p.get("posicion") not in ("DEL", "MED", "DEF", "POR"):
                continue
            ident = p["identidad"]
            # stats a nivel 99: un normal en Leyenda (asi salen todos en el
            # draft) con su arbol; un Idolo con los suyos
            rareza_draft = rv if rv >= 5 else 4
            stats = O._stats99_con_arbol(ident, rareza_draft)
            fuera.append({
                "identidad": ident, "nombre": p["nombre"], "apodo": p.get("apodo") or "",
                "cara": cara, "cuerpo": p.get("cuerpo") or "", "hombro": p.get("hombro"),
                "posicion": p["posicion"], "elemento": p.get("elemento") or "",
                "rareza_valor": rareza_draft, "idolo": rv >= 5,
                "apt": p.get("apt") or "jugador", "saga": p.get("saga") or "",
                "genero": p.get("genero") or "",
                "stats": stats, "poder": O._poder99_con_arbol(ident, rareza_draft),
                "legal": ident in fichables,
            })
        # el cuerpo tecnico de fabrica que no tiene posicion de jugador (no
        # sale en la lista de la base de datos): para las rondas de gerentes y
        # entrenadores solo hace falta la cara
        ya = {x["identidad"] for x in fuera}
        caras_de = O._cara_por_identidad()
        for ident, f in reglas.personajes().items():
            ident = ident.upper()
            if ident in ya or not (f.get("apt_gerente") or f.get("apt_entrenador")):
                continue
            cara = caras_de.get(ident, "")
            nombre = O._limpio(f.get("nombre_es") or f.get("nombre_en") or "")
            if not nombre or not re.match(r"^c\d", cara) or (caras and cara not in caras):
                continue
            fuera.append({"identidad": ident, "nombre": nombre, "apodo": f.get("apodo") or "",
                          "cara": cara, **O.datos_cuerpo(ident), "posicion": "", "elemento": "",
                          "rareza_valor": 4, "idolo": False,
                          "apt": "entrenador" if f.get("apt_entrenador") else "gerente",
                          "saga": f.get("saga") or "", "genero": f.get("genero") or "",
                          "stats": [0] * 7, "poder": 0, "legal": ident in fichables})
        return fuera
    return O._indice("draft_candidatos", construir)


def guardar(resultado):
    """Guarda el resultado de un draft. Devuelve el nombre del fichero."""
    if not isinstance(resultado, dict) or not resultado.get("jugadores"):
        raise ValueError("el resultado del draft no trae jugadores")
    rival = re.sub(r"[^A-Za-z0-9_-]+", "_", str(resultado.get("rival") or "rival"))[:30]
    nombre = "%s-contra-%s.json" % (datetime.datetime.now().strftime("%Y-%m-%d_%H-%M"), rival)
    resultado = dict(resultado, guardado=datetime.datetime.now().isoformat(timespec="seconds"))
    with open(os.path.join(_carpeta(), nombre), "w", encoding="utf-8") as fh:
        json.dump(resultado, fh, ensure_ascii=False, indent=1)
    return nombre


def guardados():
    """[{fichero, rival, fecha, arquetipo, cuantos}] de los drafts guardados, el mas nuevo primero."""
    fuera = []
    for f in sorted(os.listdir(_carpeta()), reverse=True):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(_carpeta(), f), encoding="utf-8") as fh:
                d = json.load(fh)
        except (OSError, ValueError):
            continue
        fuera.append({"fichero": f, "rival": d.get("rival") or "", "yo": d.get("yo") or "",
                      "fecha": d.get("guardado") or "", "arquetipo": d.get("arquetipo"),
                      "arquetipo_nombre": d.get("arquetipo_nombre") or "",
                      "cuantos": len(d.get("jugadores") or [])})
    return fuera


def leer(fichero):
    f = os.path.basename(fichero or "")
    with open(os.path.join(_carpeta(), f), encoding="utf-8") as fh:
        return json.load(fh)
