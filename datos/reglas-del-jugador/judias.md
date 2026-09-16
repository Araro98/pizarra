# Judias — regla aportada por Aaron

**Fecha:** 2026-09-14
**Origen:** Aaron, jugador competitivo. Los topes los midio el mismo en el juego.

## La regla

**Tres ranuras por jugador.** En cada una va un tipo de judia y cada tipo sube un
stat distinto.

- El tipo de cada ranura **se elige libremente**...
- ...con una restriccion: **no se puede repetir tipo**. Nunca dos ranuras con la
  misma judia.

## Topes por nivel — medidos en el juego

| Nivel | Judias por ranura |
|---|---|
| 1 | **ninguna**: las judias se desbloquean al nivel 10 |
| 10 | 2 |
| 50 | 82 |
| 99 | 180 |

**Confirmado el 2026-09-14:** a nivel 14 el juego muestra el tope en **10**, que
es justo lo que da la recta entre los puntos 10 y 50 (dos judias mas por nivel).
La interpolacion entre puntos medidos acierta en ese tramo.

Aaron subio un Axel a nivel 10 expresamente para medir el primer punto, asi que
en las partidas de esa tanda hay un jugador de mas que cambio de nivel.

Con cuatro puntos se puede ajustar la curva, pero **hasta tenerla comprobada, el
editor solo debe permitir los niveles medidos** o quedarse por debajo.

## Lo que el editor tiene que respetar

- Nunca mas de 3 ranuras.
- Nunca dos ranuras del mismo tipo.
- Nunca mas judias de las que permita el **nivel actual** de ese jugador. Si se le
  baja el nivel, el tope baja con el y hay que recortar.
- Nada de judias por debajo del nivel 10.

## Estado tecnico — RESUELTO

Dos campos de la ficha, 6 bytes cada uno, 3 ranuras de 2 bytes:
`0xEB265368` el tipo (`FFFF` = vacia) y `0xF90D22F5` la cantidad.
**El array va al reves que la pantalla del juego.** Ver NOTAS O-32.

Tipos confirmados: 0 = Potencia, 1 = Control. Los otros cinco, supuestos.
