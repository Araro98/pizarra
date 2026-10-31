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


def _hueco(plain):
    for i, (guardada, datos) in enumerate(_memoria):
        if guardada is plain:
            if i != len(_memoria) - 1:
                _memoria.append(_memoria.pop(i))
            return datos
    datos = {}
    _memoria.append((plain, datos))
    while len(_memoria) > CUANTAS_PARTIDAS:
        _memoria.pop(0)
    return datos


def recordar(plain, clave, calcular):
    """El valor de `clave` para esa partida, calculandolo solo la primera vez."""
    datos = _hueco(plain)
    if clave not in datos:
        datos[clave] = calcular()
    return datos[clave]


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
