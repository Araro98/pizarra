# Rarezas — regla aportada por Aaron

**Fecha:** 2026-09-14
**Origen:** Aaron, con la captura de la pantalla de filtros del juego.

## Las nueve rarezas

Son las que ensena el juego en su propio filtro, en este orden:

| Valor | Rareza | Color de la banderola |
|---|---|---|
| 0 | **Futbolista comun** | verde |
| 1 | **Futbolista emergente** | azul |
| 2 | **Futbolista de elite** | morado |
| 3 | **Futbolista estrella** | amarillo |
| 4 | **Leyenda del futbol** | naranja |
| 5 | **Idolo** | roja |
| 6 | **Idolo** | plateada |
| 7 | **Idolo** | rosa |
| 8 | **Diamante** | tornasolada |

**Idolo** es Hero, y sus tres colores son las tres variantes que ya se conocian
(una por cada version del personaje). **Diamante** es Fabled / Basara: asi lo
tradujeron al espanol.

## Que se puede cambiar y que no

- **Los cinco primeros (0 a 4) se suben jugando.** Subir de rareza mejora el
  valor de las pasivas. El editor puede moverse libremente dentro de ese tramo.
- **Idolo y Diamante no son un escalon mas.** Vienen asi de fabrica. Convertir un
  jugador normal en Idolo, o al reves, **no es alcanzable jugando** y el editor
  no debe ofrecerlo.
- Cada rareza tiene su propia version de cada pasiva: al cambiarla hay que
  cambiar tambien las pasivas a la version que toca (ver `pasivas.md` y NOTAS
  O-46).

## Sobre DIAMANTE y el avatar

El texto de ayuda del juego menciona una "Transformacion DIAMANTE del avatar" que
se alterna con Leyenda del Futbol desde el selector de la plantilla, y avisa de
que **al cambiar a Diamante las pasivas heredadas se desequipan temporalmente** y
vuelven al cambiar atras. Es una mecanica del personaje que crea el jugador, no
un escalon de la escalera.

## Estado tecnico — RESUELTO

Campo **`0xE9835BD9`**, 4 bytes por jugador, en la cadena de arrays por jugador.
Ver NOTAS O-58: los valores 0 a 8 corresponden uno a uno con la tabla de arriba,
verificado con tres jugadores de rareza conocida y con la separacion perfecta
entre normales (0-4), Idolo (5-7) y Diamante (8) en los 574 jugadores.
