"""La tier list de jugadores (NOTAS O-265 a O-269).

La clasificacion la hace `herramientas/construir_tier_list.py` y queda en
`datos/reglas-extraidas/tier-list.csv`; aqui solo se lee: la tier de cada
personaje para los filtros (Base de datos, Fichar, Jugadores) y la lista
entera para la pagina de la tier list.
"""
from ievr import reglas
from ievr import opciones as O

# de mejor a peor, como en el constructor
ESCALERA = ["Z", "X", "S", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
            "M", "N", "O", "P", "Q", "R", "T", "U", "V", "W"]
CATEGORIAS = ("leyenda", "idolo", "diamante")


def categoria_de_rareza(rareza_valor):
    """En que tier list se mira a un jugador de esa rareza: los normales (de
    comun a Leyenda) en la de Leyendas, los Idolos en la suya y los
    Diamantes en la de Diamantes."""
    rv = int(rareza_valor or 0)
    return "leyenda" if rv < 5 else "idolo" if rv < 8 else "diamante"


def _filas():
    return reglas._tabla("tier-list.csv")


def _indice():
    """{(categoria, identidad): fila}, la de su posicion (Thaddeus sale
    tambien en la lista de medios, pero su tier es la de delantero)."""
    def construir():
        d = {}
        for f in _filas():
            clave = (f["categoria"], f["identidad"].upper())
            if clave not in d or f["lista"] == f["posicion"]:
                d[clave] = f
        return d
    return O._indice("tiers", construir)


def tier_de(identidad, rareza_valor):
    """La letra de la tier de ese personaje con esa rareza, o ''."""
    f = _indice().get((categoria_de_rareza(rareza_valor), (identidad or "").upper()))
    return f["tier"] if f else ""


def tier_como_diamante(identidad):
    """Su tier si se hace Diamante (con semilla), o ''."""
    f = _indice().get(("diamante", (identidad or "").upper()))
    return f["tier"] if f else ""


def tier_list():
    """Todo para la pagina: las filas de las tres listas y, aparte (para no
    repetirlos), los datos de cada personaje que hacen falta para su tarjeta."""
    from ievr import basedatos as BD
    per = {p["identidad"].upper(): p for p in BD.personajes()}
    filas, personajes = [], {}
    for f in _filas():
        ident = f["identidad"].upper()
        p = per.get(ident) or {}
        if ident not in personajes:
            personajes[ident] = {
                "nombre": f["nombre"], "apodo": p.get("apodo") or "",
                "cara": p.get("cara") or "", "cuerpo": p.get("cuerpo") or "", "hombro": p.get("hombro"),
                "saga": f["saga"], "elemento": f["elemento"], "posicion": f["posicion"],
                "rareza_valor": int(p.get("rareza_valor") or 0), "genero": p.get("genero") or "",
                "equipo": p.get("equipo") or ""}
        filas.append({"categoria": f["categoria"], "lista": f["lista"], "tier": f["tier"],
                      "tier_stats": f["tier_stats"], "ajustes": f["ajustes"], "identidad": ident,
                      "cuerpo_tipo": f["cuerpo"], "arquetipo": f["arquetipo"], "nota": int(f["nota"] or 0)})
    return {"escalera": ESCALERA, "filas": filas, "personajes": personajes}
