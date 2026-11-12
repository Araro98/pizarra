#!/usr/bin/env python3
"""Se acuerda de lo que ya se calculo para una partida concreta.

Localizar un array o listar el inventario obliga a recorrer los 12 MB de la
partida entera. Hacerlo una vez no se nota; hacerlo una vez por jugador, con
treinta jugadores en pantalla, son varios segundos de espera por cada cosa que se
toca.

**La partida es inmutable**: cada edicion devuelve un `bytes` nuevo, nunca
modifica el anterior. Eso es lo que hace seguro guardar lo calculado: mientras
sea el mismo objeto, el contenido es el mismo.

Se guarda por identidad del objeto y **ademas se conserva una referencia a el**.
Sin esa referencia Python podria liberar la partida vieja y darle el mismo numero
de identidad a otra distinta, que es como se devuelven datos de una partida
creyendo que son de otra. Se conservan solo las dos ultimas, que es lo que hace
falta para comparar antes y despues.
"""

CUANTAS_PARTIDAS = 2

_memoria = []       # [(partida, {clave: valor})], la mas reciente al final


# Lo que NO cambia al editar (O-354). Una partida mide siempre lo mismo y editar solo reescribe
# valores: las cabeceras de los campos no se mueven. Asi que lo que depende solo de DONDE estan
# las cosas vale para la partida siguiente, y no hace falta volver a recorrer sus 12 MB tras cada
# cambio (un preset son diez cambios seguidos, y cada uno la recorria decenas de veces):
# - donde aparece cada cabecera (`ocurrencias`): pasa a la partida nueva, comprobando que cada
#   cabecera siga en su sitio (`_OCU`);
# - donde empieza cada registro y cosas asi (`estructura`): un diccionario que comparten todas
#   las partidas del mismo tamano.
_OCU = "_ocurrencias_del_pariente"
_ESTRUCTURA = "_estructura"


def _hueco(plain):
    for i, (guardada, datos) in enumerate(_memoria):
        if guardada is plain:
            if i != len(_memoria) - 1:
                _memoria.append(_memoria.pop(i))
            return datos
    datos = {}
    # el pariente: la partida mas reciente del mismo tamano (de la que esta sale editando)
    for guardada, suyos in reversed(_memoria):
        if len(guardada) == len(plain):
            pendientes = dict(suyos.get(_OCU) or {})
            pendientes.update({k: v for k, v in suyos.items()
                               if isinstance(k, tuple) and k and k[0] == "ocurrencias"})
            datos[_OCU] = pendientes
            datos[_ESTRUCTURA] = suyos.setdefault(_ESTRUCTURA, {})
            break
    _memoria.append((plain, datos))
    while len(_memoria) > CUANTAS_PARTIDAS:
        _memoria.pop(0)
    return datos


def recordar(plain, clave, calcular):
    """El valor de `clave` para esa partida, calculandolo solo la primera vez."""
    datos = _hueco(plain)
    if clave not in datos:
        heredado = None
        if isinstance(clave, tuple) and clave and clave[0] == "ocurrencias" and len(clave) == 3:
            heredado = (datos.get(_OCU) or {}).get(clave)
            if heredado is not None:
                import struct
                sig = struct.pack("<II", clave[1], clave[2])
                if not all(plain[p:p + 8] == sig for p in heredado):
                    heredado = None
        datos[clave] = heredado if heredado is not None else calcular()
    return datos[clave]


def estructura(plain):
    """El diccionario de lo que depende solo de donde estan las cosas en la partida (O-354),
    compartido por todas las del mismo tamano que se van editando una de otra."""
    return _hueco(plain).setdefault(_ESTRUCTURA, {})


def heredar_ocurrencias(viejo, nuevo):
    """Pasa a `nuevo` donde estaban las cabeceras en `viejo` (jugador.ocurrencias), para
    cambios que solo reescriben valores sin mover nada (borrar jugadores en masa, O-350: sin
    esto cada borrado volvia a recorrer los 12 MB decenas de veces). Solo si miden lo mismo y cada
    cabecera sigue en su sitio; si no, `nuevo` las buscara como siempre."""
    if len(viejo) != len(nuevo) or viejo is nuevo:
        return
    import struct
    antes = _hueco(viejo)
    despues = _hueco(nuevo)
    for clave, pos in list(antes.items()):
        if isinstance(clave, tuple) and clave[0] == "ocurrencias" and clave not in despues:
            sig = struct.pack("<II", clave[1], clave[2])
            if all(nuevo[p:p + 8] == sig for p in pos):
                despues[clave] = pos


def olvidar():
    """Tira lo guardado. Solo hace falta en las pruebas."""
    _memoria.clear()
