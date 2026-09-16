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


def olvidar():
    """Tira lo guardado. Solo hace falta en las pruebas."""
    _memoria.clear()
