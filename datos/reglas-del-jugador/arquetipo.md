# Arquetipo — regla aportada por Aaron

**Fecha:** 2026-09-14 (segunda correccion)
**Origen:** Aaron, jugador competitivo. No sale de ningun fichero del juego.

## Los seis arquetipos

Brecha, Contra, Afinidad, Tension, Juego sucio, Justicia.

## La regla, por rareza

### Jugadores normales — cualquiera de los seis
Cada personaje tiene uno que le predomina y sale mas facil, pero **puede salir con
cualquiera de los seis**. Por tanto el editor puede ofrecer los seis sin
restriccion por personaje: ese jugador se podria conseguir jugando, con paciencia.

### Hero (idolo) — fijo, dos por personaje
El arquetipo de un Hero **no se puede cambiar**. De cada personaje que tiene Hero
existen **dos Hero distintos**, cada uno con el suyo. Asi que ese personaje solo
puede existir en esos dos arquetipos y en ninguno mas.

El editor solo puede ofrecer esos dos, y necesita saber cuales son. La lista de
142 de `../reglas-extraidas/heroes.csv` ya trae la variante en el nombre
("Acker Reese (Pink)", "Acker Reese (White-Black)").

### Fabled (basara) — se cambia libremente DENTRO DEL JUEGO
Corregido 2026-09-14. **Los Fabled son los unicos jugadores a los que el propio
juego deja cambiarles el arquetipo**: sale un menu de seleccion y se elige el que
se quiera. **Las pasivas cambian solas** al hacerlo.

O sea que aqui no hay nada que justificar: el editor puede ofrecer los seis,
porque el juego mismo lo permite. Lo que si tiene que hacer es **cambiar las
pasivas en consecuencia**, como hace el juego. Escribir solo el arquetipo dejaria
un Fabled con pasivas que no le corresponden.

## Estado tecnico — RESUELTO

Campo **`0x8BA23AC3`**, 1 byte por jugador. Valores: 0 Brecha, 1 Contra,
2 Afinidad, 3 Tension, 4 Juego sucio, 5 Justicia. Ver NOTAS O-33, con la triple
verificacion.

Queda un valor 6 sin identificar, en 63 jugadores. Sospecha: Hero o Fabled.

## Correcciones anteriores

1. La primera version decia "cualquier personaje, cualquier arquetipo" sin
   distinguir rareza, y habria permitido crear un Hero inexistente.
2. La segunda daba los Fabled por fijos. Era al reves: son los unicos que el
   juego deja cambiar.
