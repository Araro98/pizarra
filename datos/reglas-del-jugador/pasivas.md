# Pasivas y pasivas heredadas — regla aportada por Aaron

**Fecha:** 2026-09-14
**Origen:** Aaron, jugador competitivo.

## Como se reparten las cinco pasivas normales

No todas siguen la misma regla, y esto importa mucho para el editor:

| Ranuras | De que dependen |
|---|---|
| **1 y 2** | De un conjunto de **36 pasivas**, pero **filtrado por la posicion**. Solo los porteros sacan "PP del equipo"; solo los delanteros "AT propio de tiro en campo contrario"; ningun portero saca "Valor propio de foco". Los conjuntos por posicion estan en `../reglas-extraidas/pasivas-por-ranura.csv`, con las veces que se ha visto cada una. |
| **3** | **Del arquetipo.** Tres opciones por arquetipo. No es una "pasiva de arquetipo", es una normal que se elige mirando el arquetipo. |
| **4 y 5** | **Del arquetipo.** De cuatro a seis por arquetipo. **Pueden salir repetidas** entre si. |

Las 36 genericas se reparten por familia de stat: **Tiro 7, Foco 13, Muro 7 y
Disputa 9**. Ese reparto sale igual de la partida de Aaron y de la ficha de
`inazumo.es`, que son dos fuentes independientes.

Ojo: las opciones de la ranura 3 **se solapan entre arquetipos**. Que una pasiva
sea opcion de Brecha no impide que tambien lo sea de Contra.

Las dos cosas estan **dentro del codigo del juego**, asi que la unica forma seria
de tenerlas es extraerlas de ahi. Aaron da permiso expreso para abrir los ficheros
del juego en su PC.

La parte de las ranuras 4 y 5 ya esta medida desde la propia partida: agrupando a
los 573 jugadores por arquetipo, cada grupo usa solo 5 a 7 pasivas distintas en
esas dos ranuras (NOTAS O-33). Encaja exactamente con lo que dice Aaron.

## Pasivas heredadas

Se consiguen **sacrificando a otro jugador**, que desaparece en el proceso.

- Se heredan **como maximo 3 pasivas** por jugador. Las ranuras que se quieran.
- La heredada **sustituye a la normal de su misma ranura**. No se suman.
- **No hay restriccion de arquetipo**: se le puede poner a un jugador de Brecha
  una pasiva del grupo de Tension. **Eso es precisamente para lo que sirve
  heredar**, y es el unico camino legal para saltarse el grupo del arquetipo.

### Por rareza

| Rareza | Heredar |
|---|---|
| Normal | Si, tope 3, sin restriccion de arquetipo |
| **Hero** | Si, tope 3, **pero solo pasivas de otros Hero** |
| **Fabled** | **No.** Sus pasivas son fijas y no se cambian con heredadas. Solo cambian solas al cambiarle el arquetipo (ver `arquetipo.md`). |

## Lo que el editor tiene que impedir

| Situacion | Permitido |
|---|---|
| Heredar 4 o mas | **NO**, el tope son 3 |
| Heredar a un Hero una pasiva de jugador normal | **NO** |
| Heredar cualquier cosa a un Fabled | **NO** |
| Poner en las ranuras 1-3 una pasiva fuera del grupo del personaje | **NO** |
| Poner en las ranuras 4-5 una pasiva fuera del grupo del arquetipo | **NO** |
| Heredar a un jugador normal una pasiva de otro arquetipo | **SI**, es lo normal |

## Estado tecnico — RESUELTO donde estan

- Normales: campo `0x66B81DAF` de la ficha, 20 bytes, 5 identificadores.
- **Heredadas: campo `0xB30A7BA1`**, 20 bytes, 5 identificadores, en paralelo.
  Ver NOTAS O-34.
- Separacion normal / exclusiva de Hero: `../reglas-extraidas/pasivas-normales.csv`
  (136) y `pasivas-hero.csv` (51), validadas contra la partida. **Se solapan en
  parte**, asi que estar en la lista de Hero no implica ser exclusiva de Hero.

Lo que falta: los grupos por personaje (ranuras 1-3) y por arquetipo (ranuras
4-5), que hay que sacar de los ficheros del juego.

## Una cosa que el editor puede ahorrar sin saltarse nada

Heredar en el juego **mata al jugador que se sacrifica**. El editor puede escribir
la pasiva heredada **sin sacrificar a nadie**: el estado final del jugador que la
recibe es identico al que tendria jugando. Se respeta la norma y se ahorran horas.
