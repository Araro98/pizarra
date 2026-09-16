# Supertecnicas — reglas aportadas por Aaron

**Fecha:** 2026-09-14 (ampliada)
**Origen:** Aaron, jugador competitivo, con capturas de la Tabla de habilidades.

## El arbol: dos caminos, y la ranura 3 es libre

Cada jugador tiene un **arbol propio** con **dos caminos**, y se elige uno.

**La ranura 3 es LIBRE en todos los personajes.** En la pantalla del juego se
distingue porque tiene **el borde distinto** a las demas. Viene con una tecnica
puesta de serie, pero admite cualquier supertecnica o hipertecnica.

Las de categoria Aura (keshin, mixi max, armed) tambien caen en ranuras libres.

Con eso, el arbol de **Joseph King** queda asi, y cuadra con lo que describio
Aaron ("4 de portero + 2 libres"):

| Ranura | Tipo | Tecnica de serie | Nivel |
|---|---|---|---|
| 1 | Parada | Parada de mano firme | 1 |
| 2 | Parada | Escudo de fuerza | 13 |
| **3** | **LIBRE** | Escudo de fuerza total | 20 |
| 4 | Parada | Destrozataladros | 30 |
| 5 | Parada | Muralla infinita | 38 |
| **6** | **LIBRE** | Determinacion de portero | 43 |
| 7 | Tiro | Triangulo letal | 30 |
| 8 | Regate | Vuelo de Icaro | 38 |
| **9** | **LIBRE** | Catalizador elemental | 43 |

## Las cuatro categorias

**Tiro, Regate, Defensa y Parada.** Aaron prefiere "Defensa" a "bloqueo", porque
dentro de las de defensa hay un subtipo que si es de bloqueo y se confundirian.

En la pantalla: amarillo parada, rojo tiro, verde regate, morado libre.

## Los subtipos

El juego los guarda (columna 9 de `m_skillInfoList`). Que significa cada uno lo
aporto Aaron:

| Categoria | Subtipo | Cuantas | Que es |
|---|---|---|---|
| Tiro | normal | 286 | |
| Tiro | tiro largo | 47 | |
| Tiro | bloqueo de tiros | 32 | **puede bloquear y devolver el tiro del rival** |
| Tiro | (valor 8) | 67 | **sin identificar**, ver abajo |
| Regate | normal | 180 | no hay subtipos |
| Defensa | normal | 137 | |
| Defensa | bloqueo de tiro | 54 | **permite bloquear tiros y bajarles la potencia** |
| Parada | atajo | 148 | el portero para y **se queda el balon** |
| Parada | despeje | 48 | lo **despeja** en vez de atajarlo |

### El subtipo 8 de Tiro: sin identificar, y NO es override

Aaron penso que podia ser "override" (combinar dos tecnicas: dos Tornados de
fuego dan el Tornado de fuego DD), pero dudaba porque el Remate dragon lleva esa
marca y no tiene override, y porque hay tecnicas de defensa y regate con override
que **no** llevan ninguna marca equivalente.

**Comprobado y descartado.** De los 67 tiros con esa marca, solo 13 aparecen en
las tablas de combinacion del juego (`m_skillEx*`), una proporcion menor que la
de los tiros normales (100 de 286). Si la marca fuera override serian todos.

Se deja etiquetado como normal, pero **el valor 8 se conserva** en
`tecnicas.csv` por si algun dia cuadra con algo.

## Lo que el editor tiene que impedir

Poner en una ranura una tecnica que no sea de su categoria. Solo las **LIBRES**
admiten cualquier cosa, hipermovimientos incluidos.

Y no como aviso: esas opciones **no se deben llegar a ofrecer**, porque las
opciones se generan a partir de las reglas (seccion 1 del CONTEXTO).

## Estado tecnico — RESUELTO

- El arbol de cada personaje: `chara_param`, columnas 11 a 28, en pares
  (id de tecnica, nivel). Ver NOTAS O-39.
- La categoria: `m_skillInfoList` columna 14 (1 Tiro, 2 Regate, 3 Defensa,
  4 Parada). Separa las 1.003 tecnicas sin una sola excepcion.
- El subtipo: columna 9 de la misma tabla.
- Todo junto en `datos/reglas-extraidas/tecnicas.csv` y `jugadores.csv`.
