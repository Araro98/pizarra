# NOTAS — registro de hallazgos

Un hallazgo por entrada. Cada uno lleva una etiqueta y no se cambia sin motivo:

| Etiqueta | Significa |
|---|---|
| **PROBADO** | Lo hemos escrito nosotros, hemos cargado la partida en el juego real y hemos confirmado el resultado. **Solo esto se puede escribir.** |
| **OBSERVADO** | Lo hemos visto comparando dos partidas, o viene de otro proyecto, pero no lo hemos escrito y verificado nosotros. **Solo lectura.** |
| **SUPUESTO** | Hipotesis. No se toca. |

Regla que manda sobre todo lo demas: **lo que no esta PROBADO es de solo lectura.**

---

## Entorno (confirmado 2026-09-13)

- Windows 11 Pro, Steam instalado en `F:\steam`.
- Juego: app `2799860` de Steam.
- Partida: `<Steam>\userdata\<cuenta>\2799860\remote\XXXXXXXX-USERDATALIVE` (12.598.458 bytes).
  El programa la encuentra solo (NOTAS O-158); nada de la cuenta ni del PC de
  nadie va escrito en el codigo (O-201).
- `002AB8F4-SYSTEMLIVE` son solo ajustes. Hay ademas un `002B8D10-*` antiguo (feb 2025).
- Juego instalado en `F:\steam\steamapps\common\INAZUMA ELEVEN Victory Road`.
- Copia intacta de la partida guardada en `partidas/original/` (md5 `6d066d329f38908b5e44e0a57a622fa4`).
- Python 3.13 con numpy disponible (`py`). Sin numpy el descifrado tarda 21 s en vez de 0,2 s.

## Jugador de calibracion

**Joseph King**, nivel 1, portero, sin equipo hasta la ronda 3. Es el que usamos
para las pruebas porque estaba a estrenar.

- Su fila de equipacion es la **numero 4566** (`0x05AD958` en estas partidas).
- Su ficha de jugador es por tanto la 4566 tambien, en `0x09ED400`.
- Entro en el equipo **02 ECLIPSE** sacando a un Axel. Su referencia de personaje
  en la plantilla es `0x11D60F80`; la de Axel, `0x06310E3B`.
- Las botas usadas son **Botas Pequenos Gigantes** = `Little Gigantes Boots`,
  id `DC5E7463`, fila del objeto en `0x03030D8`.

Rondas hechas hasta ahora: `01-base`, `02-base-repetida`, `03-botas`,
`04-sin-botas`, `05-nivel` (a 14), `06-brazalete`, `07-colgante`, `08-especial`,
`09-tecnica` (Escudo de fuerza -> Mano celestial).

**Aviso para las proximas rondas:** cambiar una supertecnica desde el juego gasta
un objeto **Nuevas Posibilidades**, y ese objeto **borra el keshin / mixi max**
del jugador (ver O-07). En King daba igual porque no tenia, pero no se puede usar
ese metodo sobre un jugador con hipermovimiento.

Sobre el metodo: hay **guardado automatico** ademas del manual, asi que entre dos
copias puede colarse un guardado que no pediste. En la practica no ha molestado
porque lo unico que anade es la fecha y el tiempo jugado, que ya se filtran.

---

## PROBADO

### P-01 · El nombre del fichero es la clave de cifrado
Verificado **en esta misma partida**, no heredado: descifrar con
`crc32("002AB8F4-USERDATALIVE")` da la magia correcta `0x9DCE66C3`, y descifrar
con cualquier otro nombre falla. Renombrar el fichero lo inutiliza.

### P-02 · Ida y vuelta sin perdida
Descifrar la partida real y volver a cifrarla, recalculando todos los checksums,
reproduce el fichero original **byte a byte**. Comprobado por `pruebas/test_basico.py`.
Esto valida a la vez el cifrado, el recorrido del directorio de blobs y el modelo
de checksums.

Nota: esto prueba que el fichero sale bien formado, **no** que el juego acepte una
partida editada. Eso solo lo prueba cargarla en el juego.

### P-03 · Estructura del contenedor
| Offset | Que hay |
|---|---|
| `0x00` | magia `0x9DCE66C3`. Si no cuadra, la clave es otra (casi siempre: fichero renombrado). |
| `0x04` | crc32 de `0x08..0x800` — checksum de cabecera |
| `0x10` | copia del nombre del fichero, terminada en cero |
| `0x50` | directorio de blobs, entradas de `0x80` bytes: crc32, tamano, offset desde `0x800`, nombre |
| `0x800` | empiezan los datos |

En esta partida hay dos blobs: `AUTOSAVE_data.bin` (12.594.329 bytes) y
`HEADERSAVE_data.bin` (2.081 bytes).

Orden de escritura obligatorio: primero el crc de cada blob, **despues** el de la
cabecera, porque este ultimo cubre las entradas del directorio.

### P-05 · PRIMERA ESCRITURA ACEPTADA POR EL JUEGO (2026-09-14)
Joseph King, fila 4566, ranura 1 de judias, de 1 a 3. Aaron cargo la partida y
**en el juego se ven las 3 judias de Potencia**.

Lo que queda probado con esto, que es bastante mas que un campo:

1. **El ciclo entero de escritura funciona.** Descifrar, modificar, recalcular los
   checksums, volver a cifrar, y que el juego lo cargue sin quejarse. Esto ya no
   es teoria.
2. **`0xF90D22F5` es la cantidad de judias**, y el orden invertido respecto a la
   pantalla es correcto: pedimos la ranura 1 y salio en la ranura 1 del juego.
3. **La fila 4566 es Joseph King de verdad.** Las judias aparecieron en el
   jugador correcto, asi que el modelo de tablas paralelas indexadas por el mismo
   numero (O-11) queda confirmado desde dentro del juego, no solo por
   correlacion.
4. **Las defensas no estorban.** Los limites por nivel dejaron pasar un valor
   legal sin falsos rechazos.

Un solo byte distinto en todo el fichero. La partida de partida fue
`partidas/rondas/14-actual`, el estado real de Aaron, no una copia vieja.

### P-06 · ARQUETIPO Y TIPO DE JUDIA, ACEPTADOS POR EL JUEGO (2026-09-14)
Segunda escritura. Joseph King, fila 4566, dos cambios a la vez, 12 bytes:

- ranura 3 de judias: vacia -> **Velocidad x5**;
- arquetipo **Brecha -> Contra**, y con el las pasivas 4 y 5, copiadas de un
  jugador de Contra que ya existia en la partida (fila 18).

Aaron lo cargo y el juego lo muestra todo: el arquetipo cambiado, las judias a 5,
y las pasivas nuevas con su texto de Contraataque en pantalla.

**Por que esto es lo mas importante del proyecto hasta ahora:** el juego **no
deja** cambiar el arquetipo de un jugador que ya tienes. Aqui se ha conseguido un
estado que si es alcanzable jugando (ver `datos/reglas-del-jugador/arquetipo.md`)
sin salirse de la norma, precisamente porque las pasivas se cambiaron con el.
Escribir solo el byte habria dejado un King de Contra con pasivas de Brecha, que
es un jugador que el juego no produce nunca.

Quedan probados: `0x8BA23AC3` (arquetipo), `0xEB265368` (tipo de judia) y
`0x66B81DAF` (pasivas normales).

### P-07 · El tope de judias por nivel: la formula es correcta
La pantalla de judias de King, a nivel 14, muestra **3/10, 5/10 y 1/10**. Ese
**10** es exactamente lo que predecia la interpolacion entre los dos puntos que
midio Aaron (2 judias al nivel 10 y 82 al nivel 50): dos judias mas por cada
nivel, luego 2 + 2 x 4 = 10.

Asi que la recta entre puntos medidos acierta, al menos en ese tramo. Sigue
siendo prudente no fiarse fuera de los puntos medidos, pero ya no es una
suposicion a ciegas.

De paso confirma los tres tipos: Potencia 3, Control 1 y Velocidad 5, cada uno en
su ranura, tal y como se escribieron.

### P-08 · EQUIPACION, SUPERTECNICAS Y PASIVAS HEREDADAS (2026-09-14)
Tercera escritura, tres cosas a la vez sobre Joseph King, **14 bytes**, y Aaron
las confirmo las tres en el juego:

| Que | Cambio | Campo |
|---|---|---|
| Equipacion | ranura 1: vacia -> Botas Pequenos Gigantes | `0x14CF8197` |
| Supertecnica | ranura 1: Parada de mano firme -> Despeje de fuego | `0xAAC36512` |
| Pasiva heredada | ranura 3: vacia -> PP del equipo | `0xB30A7BA1` |

Con esto quedan **probadas todas las escrituras del editor**: judias (cantidad y
tipo), arquetipo con sus pasivas, equipacion, supertecnicas y heredadas.

**Detalle util de la captura:** en la pantalla de pasivas de equipo, las
heredadas salen marcadas con un **punto azul** a la izquierda. En King hay
exactamente dos puntos, que son las dos heredadas que tiene. O sea que el juego
las distingue visualmente y el tope de 2 se ve de un vistazo.

Tambien se confirma que el contador `0xEDC3670F` se ajusto bien: la tecnica
retirada baja y la nueva sube, sin dejar la ficha del objeto descuadrada.

### P-09 · NIVEL, RAREZA, PASIVA NORMAL, PARTIDOS E INVENTARIO (2026-09-14)
Los seis que faltaban, todos en una sola partida y todos confirmados por Aaron
dentro del juego:

| Que | De | A | Como se comprobo |
|---|---|---|---|
| nivel | 14 | **50** | la ficha pone Nv. 50 |
| rareza | Leyenda del futbol | **Futbolista estrella** | el rotulo de la ficha |
| pasiva normal, ranura 2 | DF del muro (mismo elemento) | **Valor propio de disputa en campo contrario** | la lista de pasivas |
| partidos jugados | 0 | **30** | el juego le deja convertirse en gerente o entrenador, que es justo lo que pide 30 partidos |
| cantidad de un objeto | 1 Semilla diamante | **99** | la mochila |
| objeto que no se tenia | — | **5 Botas Genesis** | aparecen en la mochila **y se dejan equipar** |

Lo de las botas es la prueba importante de O-62: que el juego permita ponerselas
a un jugador significa que el numero de fila calculado es el correcto. Una fila
con el numero mal habria aparecido igual en la lista y no se habria dejado
equipar.

**Y esto zanja la duda abierta de O-58:** cambiar la rareza **no** obliga a tocar
las pasivas. Se bajo a King de Leyenda a Estrella sin tocarle ni un
identificador de pasiva y las cinco siguen ahi, con sus valores. Asi que
`poner_rareza` se queda como esta: cambia la rareza y nada mas.

Detalle que se ve en la captura y conviene recordar para la interfaz: a King solo
le aparece **desbloqueada la pasiva 1**; las otras cuatro salen con candado. O
sea que cuantas pasivas estan activas es cosa aparte del contenido de las cinco
ranuras, y todavia no se sabe de que depende.

### P-10 · CREAR, BORRAR Y REPARAR JUGADORES (2026-09-14)
Confirmado por Aaron dentro del juego, en tres vueltas:

| Que | Como se comprobo |
|---|---|
| **Crear un jugador normal** | Flanko Midspringle, que no tenia. Aparece, se le sube de nivel, se le cambian tecnicas, judias y equipacion, y **se le puede meter en un equipo** |
| **Crear un Idolo** | Axel Blaze Idolo (plateada), con su rareza y arquetipo copiados de la copia que ya tenia |
| **Crear un espiritu** | Rey negro, aparece en la lista y se puede equipar |
| **Borrar jugadores** | 1.890 copias de sobra de nivel 1 quitadas de una vez; los huecos quedaron libres y utilizables |
| **Reparar un jugador** | los dos creados por versiones viejas se arreglaron **sin perder** su nivel 14, su equipacion ni el equipo en el que estaban |
| **El retrato** | "ya va perfecto el retrato de Flanko, como todos los demas jugadores" |

Hicieron falta tres intentos, y cada fallo enseño algo que esta apuntado:

1. **Once campos, no cinco** (O-68). El juego guardaba la fila y no la ensenaba.
2. **El identificador de la copia a cero** (O-72). Aparecia, funcionaba, pero al
   pasar por encima ensenaba el nombre y el retrato del jugador anterior.
3. **El bloque de aspecto copiado de otro personaje** (O-74). Mismo sintoma. Se
   arreglo dejandolo vacio.

Los dos ultimos se encontraron igual: **comparando una copia creada por el editor
contra una del mismo personaje hecha por el juego**. Comparar contra el mismo
personaje quita todo el ruido y deja solo los campos sospechosos.

### P-04 · Los registros son campos autodescriptivos
`[u32 hash del campo][u32 longitud][datos]`, uno detras de otro. No hay contador
de registros ni marca de fin: se acaba cuando la longitud del siguiente deja de
ser plausible (tope practico: 64 bytes). Por eso todo se direcciona por hash de
campo y nunca por posicion fija.

Verificado recorriendo la partida real hacia delante y hacia atras desde un campo
conocido y reconstruyendo el registro entero.

---

## OBSERVADO

### O-01 · Ficha de jugador — localizada, sin descifrar
Ancla `0xBB459017`, campo de 60 bytes. En esta partida la primera ficha esta en
`0x08A3490`. Un registro completo, leido de la partida real:

```
0x08A3490  7C27AEEC   1  nivel del jugador
0x08A3499  3CAEA0BD  30  bloque A
0x08A34BF  38AFC2B8  30  bloque B
0x08A34E5  45E2D879   9  nueve ranuras, ff = vacia
0x08A34F6  BB459017  60  ancla de la ficha
0x08A353A  72479F6E   4  ?
0x08A3546  EB265368   6  ?
0x08A3554  F90D22F5   6  ?
0x08A3562  8F0E9F49   4  ?
0x08A356E  66B81DAF  20  ?
0x08A358A  1238E5AC   2  ?
0x08A3594  B30A7BA1  20  ?
```

**Esto es el objetivo de la fase 0.** Nivel, judias, pasivas, equipacion,
arquetipo, partidos jugados y las supertecnicas equipadas tienen que estar aqui
dentro o en una tabla enlazada. Nada de esto esta identificado todavia.

### O-02 · CORREGIDO · `0x7C27AEEC` NO es el nivel de verdad
El proyecto de referencia lo dio por nivel a partir de su distribucion. Es una
**copia que se queda desfasada**, no el valor bueno:

- Joseph King subio de nivel 1 a 14 y este byte **no se movio**; siguio en 0.
- Se actualizo cuatro rondas mas tarde, al cambiarle una supertecnica.
- Hay jugadores de nivel 98 y 99 cuya copia sigue leyendo 0 (filas 100 y 147).

El nivel bueno esta en otro sitio, ver O-15. **Escribir solo esta copia dejaria
la partida incoherente consigo misma.** Es justo el tipo de error que la regla 1
existe para evitar.

### O-15 · Nivel — array de verdad, localizado
Array de **6.000 numeros de 2 bytes**, cabecera `0x377173B1` con longitud 12.000.
Se localiza por esa cabecera, nunca por offset.

Validacion: los 6.000 valores caen **todos** entre 0 y 99, ni uno se sale del
tope del juego. 175 jugadores a 99, 4.520 a nivel 1 (sin tocar) y 907 a 0 (huecos
vacios). Joseph King lee **14**, que es exactamente donde lo dejo Aaron.

### O-16 · Experiencia
Array de **6.000 numeros de 4 bytes**, cabecera `0xAF047AD9` con longitud 24.000,
misma indexacion. Subio de 0 a 2.274 al subir King de nivel, gastando un Orbe de
EXP Grande (se vio bajar de 87.550 a 87.549).

Solo 382 entradas no son cero, y varios jugadores de nivel 99 leen 0, asi que
**no es experiencia acumulada total**. Probablemente sea lo que lleva dentro del
nivel actual. Sin confirmar.

### O-17 · Las cuatro ranuras de equipacion, confirmadas una a una
Tres rondas seguidas, un objeto por ronda, dos campos movidos en cada una:

| Ranura | Campo | Objeto usado en la prueba |
|---|---|---|
| 1 botas | `0x14CF8197` | Botas Pequenos Gigantes |
| 2 brazalete | `0x375EEC34` | Pulsera de la juventud |
| 3 colgante | `0x5E786ADF` | Colgante medalla |
| 4 especial | `0x4C6B3FE3` | Capucha del restaurante de fideos |
| 5 sin usar | `0x3B0EB3DB` | vacio en toda la partida |

S-03 queda confirmado: el orden de los campos es el orden del juego.

### O-18 · Supertecnicas por jugador — LOCALIZADAS
Esto es lo que no habia resuelto nadie.

Tabla de **9 ranuras** por jugador, misma indexacion que las demas. Joseph King
es la fila 4566 aqui tambien. Los nueve campos, en orden:

```
AAC36512  DDC45584  44CD043E  33CA34A8  ADAEA10B
DAA9919D  43A0C027  34A7F0B1  A418ED20
```

Al cambiar "Escudo de fuerza" por "Mano celestial", la ranura 2 (`0xDDC45584`)
paso de apuntar a una fila a apuntar a otra, y la de la tecnica retirada aparecio
escrita en la **fila 10566**, que es 6.000 mas arriba. Eso apunta a un segundo
bloque que haria de "aprendidas pero sin equipar". Sin confirmar.

Leido con `ievr/jugador.py`, King sale con Mighty Save, God Hand (Mountain) y
Full Power Shield, que es lo que tiene en el juego.

### O-21 · Hay un bloque entero de arrays por jugador
Los arrays de nivel y de experiencia son **campos consecutivos de una misma
cadena**. Recorriendola salen quince arrays seguidos, todos de 6.000 posiciones,
uno por jugador. Se llega a ellos encadenando desde la cabecera de experiencia,
sin offsets fijos.

| Cabecera | Bytes por jugador | Que sabemos |
|---|---|---|
| `0xAF047AD9` | 4 | experiencia (O-16) |
| `0x377173B1` | 2 | **nivel** (O-15) |
| `0x05B7786A` | 1 | 4 valores entre los jugadores reales (2,4,5,6). King = 4 |
| `0xE9835BD9` | 4 | 9 valores. King = 4 |
| `0x90F47C83` | 4 | **serie de adquisicion**: un valor distinto por jugador |
| `0xC09A350A` | 4 | cero en 572 de 573 |
| `0xA231B7D3` | 4 | cero en todos |
| `0xFA7AEFFB` | 4 | solo 13 valores distintos. King = 1025 |
| `0xF9C76ADC` | 32 | sin mirar |
| `0xBAFA8DBD` | 4 | 65 valores, cero en 461 |
| `0xFC830AAC` | 1 | 4 valores (1..4). King = 3 |
| `0x8BA23AC3` | 1 | 7 valores (0..6), bien repartidos. King = 0 |
| `0x71DB6E55` | 1 | uno en todos |
| `0x14CDA97F` | 1 | 6 valores (0..5), pero 513 de 573 a cero. King = 0 |
| `0xD6B65E67` | 4 | 519 valores distintos entre 573 jugadores. King = `0x847FADC2` |

**Candidatos a arquetipo**: `0x8BA23AC3` es el que mejor pinta tiene, porque tiene
siete valores repartidos. `0x14CDA97F` esta demasiado sesgado a cero. Hace falta
saber el arquetipo de dos o tres jugadores mas para decidir.

### O-22 · CONFIRMADO NEGATIVO · nombrar a los jugadores sigue sin resolverse
Dos intentos, los dos fallidos, apuntados para no repetirlos:

1. `0xFA7AEFFB` daba 1025 para King, y el indice 1026 de `characters.csv` es
   justo "Joseph King". **Era casualidad**: ese array solo tiene 13 valores
   distintos entre 573 jugadores, asi que no puede ser una identidad. La
   comprobacion que lo delato: contar valores distintos, no contar cuantos
   "resuelven" contra una tabla de 5.419 nombres, donde casi cualquier numero
   pequeno acierta por accidente.
2. `0xD6B65E67` si tiene pinta de identidad (519 valores para 573 jugadores),
   pero **ninguno** de sus valores aparece en el campo `0xF9A1342D` de la tabla
   de espiritus, asi que no se puede unir por ahi para sacar el nombre. 0 de 573.

Sigue en pie lo de O-04: la identidad del personaje vive en los ficheros del
juego, no en la partida. La diferencia respecto al proyecto de referencia es que
**los archivos `.cpk` si estan en este PC**, asi que esa puerta se puede abrir
cuando toque.

### O-19 · Como se referencia un objeto o una tecnica
Ni la equipacion ni las supertecnicas guardan el **id** de lo que llevas. Guardan
el valor del campo `slot` (`0x918020D9`) de **la fila concreta que posees**.

Tiene una consecuencia que va justo en la direccion del proyecto: **no se puede
equipar algo que no tengas**, porque no hay ninguna fila a la que apuntar. La
propia estructura del juego impone parte de la legalidad.

### O-20 · `0xE2C66FA7` parece "lo ultimo conseguido"
En `0x050C5DE` paso a `Power Shield` justo cuando King subio de nivel y aprendio
esa tecnica, y a `God Hand (Mountain)` cuando se la cambiaron. Un solo sitio, no
una tabla por jugador. Pinta de aviso de novedad. Sin confirmar.

### O-03 · Los identificadores son `crc32` del nombre interno
Se guardan en orden inverso al que muestra Cheat Engine. Cuadra exactamente para
pasivas (1716/1716), equipacion (468/468), auras (443/443), tacticas (86/86) y
supertecnicas (850/852).

### O-04 · Los personajes NO siguen esa regla — negativo confirmado
0 aciertos de 5418. El identificador de personaje es un numero de la tabla de
datos del juego, no se deriva de ningun texto. Hay una demostracion algebraica
en `referencia/editor-ref/NOTES.md` (cuatro identificadores de la misma longitud
que se anulan al hacer XOR pero cuyos valores en la partida no). **No perder
tiempo buscando esa funcion.**

Consecuencia: solo se pueden editar personajes que la partida ya conoce.

### O-05 · `sub` (`0xD1F4EB9A`) = 2 significa "copia en la mochila"
Otros valores (1, 5, 9, 10) son copias pegadas a un personaje o espiritu. Que
exista una fila **no** significa que el jugador lo tenga.

### O-06 · Las estadisticas mostradas no estan en la partida
Se calculan al vuelo a partir de base + nivel + judias + equipacion. Buscar un
valor exacto visto en el juego no encuentra nada.

### O-07 · Trampa: "Nuevas Posibilidades" borra los hipermovimientos
Usar ese objeto para reescribir los movimientos de un jugador le **borra el
keshin / mixi max**, sin vuelta atras. Visto jugando normal, sin editar nada.

### O-09 · Lo unico que cambia solo al guardar: la fecha y el tiempo jugado
De `01-base` vs `02-base-repetida` (guardadas con 28 s de diferencia sin tocar
nada): **5 campos**, ni uno mas. El registro de `0x810` guarda la fecha
desglosada y el de `0xC03A0B` la misma fecha empaquetada en 8 bytes.

| Campo | Que es |
|---|---|
| `0x9AB367EA` | ano (`ea 07` = 2026) |
| `0x76F58F7B` | mes |
| `0x604041A4` | dia |
| `0x512F0593` | hora |
| `0x408EE5AB` | minuto |
| `0x98535F77` | segundo |
| `0x77BFE5E1` | dia de la semana, 0 = lunes |
| `0x0877F0CD` | los siete anteriores juntos, 8 bytes |
| `0x3A40C52C` y `0x64916694` | tiempo jugado en segundos (dos copias del mismo valor) |

Comprobado contra la realidad: la fecha leida era 2026-09-13 18:32:46 y luego
18:33:14, y el tiempo jugado subio 29 s entre las dos copias. En total 353 h.

Todos estos campos estan en `datos/ruido.json` y se ignoran al comparar. Por eso
la ronda de las botas salio tan limpia.

### O-10 · Equipacion — tabla localizada, ranura 1 identificada
De `03-botas` vs `04-sin-botas`, que es una ida y vuelta perfecta: se pusieron
unas botas y se quitaron, y **solo dos campos se movieron, volviendo exactos a su
valor original**. Eso descarta casualidad.

- Tabla de **6.048 filas**, paso **68 bytes**, la primera en `0x0561C80`.
- Cada fila tiene **cinco campos de 4 bytes**:
  `0x14CF8197`, `0x375EEC34`, `0x5E786ADF`, `0x4C6B3FE3`, `0x3B0EB3DB`.
- En esta partida hay 355 / 349 / 350 / 354 filas usando los cuatro primeros y
  **cero** usando el quinto. Cuadra con las cuatro ranuras que ensena el juego
  (botas, brazalete, colgante, especial).
- `0x14CF8197` es la **ranura 1, botas**: es el que cambio al equipar las
  "Botas Pequenos Gigantes" y el que volvio a cero al quitarlas.
- **No guarda el id del objeto**, guarda el valor del campo `slot` (`0x918020D9`)
  de la fila de ese objeto: `0x0040200F`, que es exactamente lo que tiene la fila
  de las botas. Es una referencia a la fila, no al tipo de objeto.

Que las ranuras 2, 3 y 4 vayan en ese orden es **SUPUESTO**, ver S-03.

### O-11 · La fila N de equipacion es el jugador N de la ficha
Las dos tablas tienen exactamente **6.048 filas** y van emparejadas por posicion.
Comprobado por correlacion, no por suposicion:

| Grupo | Con nivel > 0 |
|---|---|
| 355 filas de equipacion con algo puesto | **353 (99 %)** |
| 400 filas de equipacion vacias, al azar | **10 (2 %)** |

Un 99 % contra un 2 % no sale por azar. Es el puente que hace falta para pasar de
"esta fila cambio" a "este jugador cambio".

### O-12 · `0xEDC3670F` en la fila de un objeto = cuantos jugadores lo llevan
En las botas paso de 7 a 8 al equiparlas y de 8 a 7 al quitarlas. Coincide con lo
que ensena el juego en la ficha del objeto.

### O-13 · `0x3A0D9419` = referencia a un personaje dentro de una plantilla
Al meter a Joseph King en un equipo sacando a Axel, este campo cambio de
`0x06310E3B` a `0x11D60F80` en **dos** registros (`0x0A7C70F` y `0x0A7CDA2`).
Ese valor no aparece dentro de ninguna ficha de jugador, asi que es un tercer
identificador de personaje, distinto del indice de catalogo y del `chara_base_id`.

Por que hay dos registros y no uno esta sin explicar.

### O-14 · `0x66B81DAF` = las cinco pasivas de equipo de un personaje
Los 20 bytes son cinco identificadores, y los cinco se resuelven contra la tabla
de nombres como entradas de categoria "Custom Passive" (pasivas de equipo del
tipo "Team KP", "Team Tension Breach Cost", "Breach Team Build").

**Cuidado con leer esto de mas**: 4.825 de las 6.048 fichas tienen las cinco, y
1.172 no tienen ninguna, con independencia de que el jugador exista o tenga
nivel. O sea que **no es "las pasivas que le ha puesto el jugador"**, sino algo
mucho mas parecido al juego de pasivas que ese personaje trae de serie. Antes de
tocarlo hay que averiguar cual de las dos cosas es.

### O-08 · El juego rellena huecos, no agranda el fichero
Al obtener algo nuevo, el juego escribe en filas vacias que ya existian. El
fichero no cambia de tamano. Y las filas vacias **no son intercambiables**: solo
sirven las que caen dentro del bloque contiguo que el juego recorre para ese tipo.

---

### O-23 · La tabla de Cheat Engine de EasyGameCheatEngine — validada
Aaron aporto la tabla de Cheat Engine de **EasyGameCheatEngine** para la version
7.1.1. Es un editor de memoria en vivo, no de partidas, asi que sus direcciones
no sirven aqui. Pero lleva dentro listas de identificadores, y esas **si** valen.

Extraidas a `datos/reglas-extraidas/` y contrastadas contra la tabla de nombres
de la propia partida (invirtiendo el orden de bytes, como manda O-03):

| Lista | Entradas | Casan con la partida |
|---|---|---|
| supertecnicas | 1.292 | **1.290** |
| pasivas normales | 136 | **136** |
| pasivas exclusivas de Hero | 51 | **50** |
| personajes con rareza Hero | 142 | 0 (ver O-26) |

Que 136 de 136 y 1.290 de 1.292 casen contra una tabla compilada de otra fuente
distinta es una validacion cruzada fuerte: las dos describen el mismo juego.

**Lo que esto da de valor real**: la separacion entre **pasiva normal** y
**pasiva exclusiva de Hero**, que es justo la regla de legalidad que pedia el
CONTEXTO ("nunca cruzar categorias"). Ya esta en `ievr/reglas.py`.

Ojo: las dos listas **se solapan en parte**. Una de las cinco pasivas de Joseph
King sale en las dos. O sea que "esta en la lista de Hero" no implica "es
exclusiva de Hero"; hay que tratar el solape aparte.

### O-24 · La tabla de CE corrobora la forma de la ficha
Sin darnos ninguna direccion util, su lista de campos confirma dos cosas que
habiamos deducido de las comparaciones:

- **Supertecnicas: 6 ranuras normales mas 3 de cambio = 9.** Exactamente las
  nueve de O-18.
- **Pasivas: cinco por jugador**, y ademas hay **un segundo juego de cinco** solo
  para Hero / Fabled, en otro sitio. Encaja con lo que dice Aaron de que la
  pasiva heredada no se guarda donde las normales.

### O-25 · Partidos jugados: los umbrales son 10 y 30
La tabla lo dice explicitamente: las ranuras de insignia se desbloquean a los
**10** y a los **30** partidos. Dato de reglas util para la fase 2.

### O-26 · CONFIRMADO NEGATIVO · los ids de Hero tampoco estan en la partida
Los 142 identificadores de personaje con rareza Hero de la tabla de CE, probados
en los dos ordenes de bytes contra el array de identidad por jugador
(`0xD6B65E67`), contra `0xFA7AEFFB` y contra el campo de plantilla
(`0x3A0D9419`): **0 coincidencias en los tres**. Nombrar a los jugadores sigue
sin resolverse y sigue apuntando a los ficheros del juego.

### O-27 · `0x66B81DAF` son las pasivas del jugador, no algo de serie
Correccion de O-14. Las cinco de Joseph King salen **todas** en la lista de
pasivas normales, y la tabla de CE llama a ese grupo "Player Summon - Passive 1..5
ID". Es decir: **son las cinco pasivas con las que salio ese jugador al
invocarlo**, guardadas por fila. Que casi todas las filas las tengan rellenas ya
no es raro: cada hueco lleva su tirada.

Lo que sigue sin estar claro es cual de esas cinco es la **heredada**, si es que
alguna lo es. Eso lo dira la ronda `11-heredada`.

### O-28 · Las plantillas apuntan a jugadores por su `slot` — RESUELTO
Recorriendo la cadena de arrays **hacia atras** aparecen dos mas:

| Cabecera | Bytes por jugador | Que es |
|---|---|---|
| `0x918020D9` | 4 | el **`slot`** de ese jugador |
| `0xBA162C11` | 4 | la identidad del personaje (ver O-29) |

El campo de plantilla `0x3A0D9419` guarda ese `slot`. Comprobado: **426 de 426**
referencias de plantilla no vacias corresponden al `slot` de un jugador, y la de
Joseph King (`0x11D60F80`) es exactamente el `slot` de la fila 4566.

Es el mismo mecanismo que la equipacion y las tecnicas (O-19): **todo se
referencia por `slot` de fila, nunca por id de tipo**. Ya son tres sistemas
distintos que lo usan, asi que es el patron del formato, no una casualidad.

Con esto se puede reconstruir quien juega en cada equipo.

### O-29 · La identidad del personaje comparte espacio con los espiritus
`0xBA162C11` da un valor distinto por jugador (King: `0x33D11B4C`). **572 de los
573 jugadores reales tienen un valor que tambien aparece en el campo
`0xF9A1342D` de la tabla de espiritus.** O sea: jugadores y espiritus usan el
mismo espacio de identificadores. Eso es nuevo y es la pista buena.

**Pero seguir esa pista hasta el nombre no funciona todavia.** Al emparejar cada
id con el indice de catalogo de su propio registro de espiritu, solo salen 80
pares validos y solo 3 jugadores quedan nombrados. La mayoria de los indices se
salen del rango de la tabla de nombres.

Tercer intento fallido de nombrar jugadores. La via realista sigue siendo
extraer los ficheros del juego.

### O-30 · Donde NO estan las judias
Descartados antes de la ronda `10-judias`, para no perder el tiempo ahi:

- el array de 32 bytes por jugador (`0xF9C76ADC`): **cero en los 573** jugadores
  reales;
- los bloques A y B de la ficha (`0x3CAEA0BD` y `0x38AFC2B8`): A es `07` y
  relleno `ff`, B es un byte pequeno y ceros. **Ningun jugador real tiene datos**
  mas alla del primer byte.

### O-31 · El campo de nueve huecos no es la categoria de la tecnica
`0x45E2D879` (`00 02 04 ff ...` en King). Cruzados los nueve huecos con la
categoria real de la tecnica de cada ranura, sobre 573 jugadores: cada valor sale
mezclado con las cuatro categorias. **No sirve para la regla de posicion.**

Lo unico que asoma: los valores **12, 13 y 23** aparecen casi siempre con
tecnicas de categoria "Aura", es decir hipermovimientos.

### O-32 · Judias — LOCALIZADAS
Dos campos de la ficha, 6 bytes cada uno = **3 ranuras de 2 bytes**:

| Campo | Que es |
|---|---|
| `0xEB265368` | tipo de judia de cada ranura. `FFFF` = ranura vacia |
| `0xF90D22F5` | cuantas judias hay en esa ranura |

**El array va al reves que la pantalla del juego**: la ranura 1 de la pantalla es
la ultima del array. Comprobado dandole a King una judia de Potencia (ranura 1) y
otra de Control (ranura 2): en el fichero aparecieron en la tercera y la segunda
posicion, por ese orden.

Tipos confirmados: **0 = Potencia**, **1 = Control**. El resto se supone que sigue
el orden de los identificadores internos `tr000001..tr000007`, sin confirmar.

Al dar una judia tambien sube el campo `0xEDC3670F` de la fila de ese objeto, que
es el contador de "cuantas se han usado" (17.013 a 17.014 en las de Potencia).

### O-33 · Arquetipo — LOCALIZADO Y DESCIFRADO
Campo **`0x8BA23AC3`**, 1 byte por jugador, en la cadena de arrays de O-21.

| Valor | Arquetipo |
|---|---|
| 0 | Brecha |
| 1 | Contra |
| 2 | Afinidad |
| 3 | Tension |
| 4 | Juego sucio |
| 5 | Justicia |

Verificado por tres caminos independientes:

1. **Tres jugadores conocidos.** Joseph King (Brecha) = 0, Morgan Sanders
   (Afinidad) = 2, Julia Blaze (Juego sucio) = 4.
2. **Separacion de pasivas.** Aaron dice que las pasivas de las ranuras 4 y 5
   dependen del arquetipo. Agrupando los 573 jugadores por este byte, cada grupo
   usa solo **5 a 7 pasivas distintas** de las 136 en esas dos ranuras, y entre
   grupos el solape maximo son 2. Casi estancos.
3. **Los nombres lo confirman.** Buscando la palabra del arquetipo dentro del
   texto de esas pasivas: valor 1 -> "Counter" el 100 %, valor 2 -> "Bond" el
   100 %, valor 3 -> "Tension" el 100 %, valor 4 -> "Rough" el 100 %. Los valores
   0 y 5 dan 76 % "Breach" y 79 % "Justice", y el resto son pasivas cuyo texto
   nombra dos arquetipos a la vez.

Queda un **valor 6** con 63 jugadores y una sola pasiva distinta en las ranuras
4-5. No es ninguno de los seis. Sospecha: Hero o Fabled, que llevan las pasivas
fijas. Sin confirmar.

### O-34 · Pasivas heredadas — LOCALIZADAS
Campo **`0xB30A7BA1`**, 20 bytes = 5 identificadores, exactamente en paralelo a
las pasivas normales de `0x66B81DAF`. Estaba a cero en todos los jugadores hasta
esta ronda.

Al heredarle a King la pasiva de Paul Siddon, aparecio en la **ranura 1** de este
campo, y la normal de esa misma ranura ("Team KP", que en el juego es "PP del
equipo") quedo tapada. **Es exactamente la regla que describio Aaron**: la
heredada sustituye a la normal de su misma ranura.

### O-35 · Sacrificar un jugador borra su ficha
El jugador que se sacrifica para heredar **desaparece de verdad**. La ficha de
Paul Siddon (`0x09C1E40`) quedo con las nueve ranuras a `ff` y los bloques
reiniciados.

Consecuencia para el editor: si algun dia se escriben pasivas heredadas, **no
hace falta sacrificar a nadie**. Es una de las cosas donde la herramienta puede
ahorrar horas sin salirse de la norma, porque el estado final es el mismo.

### O-36 · Abrir los ficheros del juego: lo que funciona y lo que no
Aaron dio permiso para abrir los archivos del juego (2026-09-14). Todo lo de
abajo se compilo **desde codigo fuente**, no se descargo ningun ejecutable:
Rust via rustup, `Telmo26/ievr_dataminer` y `Telmo26/ievr_toolbox`.

Aviso: el dataminer, por su cuenta, **intenta descargarse el extractor ya
compilado** de las releases de GitHub. Esa descarga fallo y no llego a instalar
nada. Se sustituyo poniendo el binario compilado aqui en
`datos/juego/tools/ievr_toolbox-win64.exe`, que es donde lo busca.

**Trampas de la herramienta, apuntadas para no volver a caer:**

1. `dump -i <carpeta>` **le anade `data` por su cuenta** si la ruta no acaba ya
   en `data`. Y busca los `.cpk` recursivamente a partir de ahi. O sea que una
   carpeta de pruebas tiene que ser `<carpeta>/data/packs/*.cpk`.
2. El dataminer llama al extractor **sin subcomando** (`-i -o -r`), pero el
   toolbox actual exige `dump -i -o -r`. Son versiones distintas: hay que
   ejecutar el extractor a mano.
3. El indice `cpk_list.cfg.bin` **solo se lee si se pasa `-r`**. Sin reglas, no
   hace falta.

**El muro:** con `-r`, el toolbox descifra `cpk_list.cfg.bin` y luego intenta
leerlo como base de datos `RDBN` o `T2B`. **Falla con "Unable to detect file
format".** Descartado que sea culpa nuestra: se probo con la ruta correcta, con
la carpeta `temp` limpia, y el paso de descifrado por separado si funciona (y da
exactamente el mismo resultado que nuestro propio `codec.xor` con
`crc32("cpk_list.cfg.bin")`, lo cual confirma que el cifrado es el mismo de las
partidas). Lo que no se puede es interpretar el resultado: sigue con entropia
7,999 y sin magia `RDBN` ni `CRILAYLA` por ningun lado.

Lectura mas probable: **la version del juego de Aaron (7.1.2) es mas nueva que
lo que soporta el toolbox.**

### O-37 · NOMBRAR JUGADORES — RESUELTO (2026-09-14)
Era lo unico gordo que quedaba sin resolver, y que el proyecto de referencia dio
por imposible desde la partida (O-04, O-22, O-26). Tenian razon: **no esta en la
partida**. Sale de los ficheros del juego, y la cadena es esta:

```
partida, campo 0xBA162C11        identidad del jugador
  -> chara_param, columna 0      la misma cosa
  -> chara_param, columna 1      chara_base_id
  -> chara_base,  columna 0      la misma cosa
  -> chara_base,  columna 3      name_id
  -> text/es.sqlite              el nombre, en espanol
```

**574 de 574 jugadores con nivel resueltos.** La fila 4566 da "Joseph King", que
es quien tiene que ser.

Como se encontro: buscando los valores de `0xBA162C11` en crudo dentro de cada
fichero del juego. Salieron 120 de 120 en `chara_param`. La busqueda a lo bruto
resolvio en un minuto lo que tres intentos de deduccion no habian conseguido.

La tabla resultante esta en `datos/reglas-extraidas/personajes.csv`, 6.151
personajes. La genera `herramientas/construir_personajes.py`.

### O-38 · Rareza — resuelta desde los ficheros del juego
`chara_param`, **columna 41**: 0 normal, 5 a 7 Hero, 8 Fabled. Los totales
cuadran con lo que se sabia: **147 Hero y 72 Fabled**.

Esto es lo que permite al editor no tocar a un Hero ni a un Fabled, que tienen
reglas propias (ver `datos/reglas-del-jugador/`). Ya esta en `personajes.csv`.

Ojo: esto es la **categoria**, no el escalon de rareza que se sube jugando
(Futbolista de elite, Estrella, Leyenda del futbol). Joseph King es "Leyenda del
futbol" y aqui sale como `normal`. Ese escalon sigue sin localizar.

### O-39 · EL ARBOL DE TECNICAS — RESUELTO
`chara_param`, de la columna 11 en adelante, en **pares (id de tecnica, nivel)**.
Es el arbol de ese personaje: que aprende y a que nivel.

El de Joseph King, leido del juego:

| Columna | Tecnica | Nivel | Categoria |
|---|---|---|---|
| 11 | Mighty Save | 1 | Goalkeep |
| 13 | Power Shield | 13 | Goalkeep |
| 15 | Full Power Shield | 20 | Goalkeep |
| 17 | Drill Smasher | 30 | Goalkeep |
| 19 | Infinite Wall | 38 | Goalkeep |
| 21 | Keeper's Grit | 43 | Aura |
| 23 | Death Zone | 30 | Shot |
| 25 | The Ikaros | 38 | Offence |
| 27 | Elemental Catalyst | 43 | Aura |

Se ven los **dos caminos** que describio Aaron: uno de portero hasta la columna
21, y otro a partir de la 23 que mete tiro y ataque. Y las de categoria "Aura"
caen donde el describio las ranuras moradas.

**Esto es lo que hace falta para la regla de legalidad de las supertecnicas**: la
categoria de cada ranura sale de la categoria de la tecnica que ese personaje
aprende ahi. Con esto el editor puede generar solo las opciones validas en vez de
ofrecerlo todo.

Pendiente de que Aaron confirme el reparto exacto: el dice "4 de portero + 2
libres" para el camino 1, y aqui se leen 5 de portero y una Aura.

### O-41 · Nombres en espanol — RESUELTO, sin el dataminer
Su parte de habilidades se cae con un error interno, asi que se hace por nuestra
cuenta con `herramientas/construir_nombres_es.py`, que vuelca las tablas con
`referencia/volcado` y las cruza a mano.

Cada fichero de configuracion lleva `(id, ..., name_id, ...)`, y el `name_id` se
busca en la tabla `NOUN_INFO` del fichero de textos del idioma:

| Que | Tabla | col id | col nombre | Salen |
|---|---|---|---|---|
| supertecnicas | `m_skillInfoList` | 0 | 6 | 994 |
| auras (keshin, mixi max) | `AURA_CMD_INFO_LIST` | 0 | 2 | **443** |
| pasivas | `PASSIVE_SKILL_INFO_LIST` | 0 | 1 | 1.694 |
| tacticas | `SPECIAL_TACTICS_INFO_LIST` | 0 | 2 | **86** |

Los 443 de auras y los 86 de tacticas **cuadran exactamente** con las cifras que
el proyecto de referencia habia establecido por otro camino (O-03). Validacion
cruzada.

Comprobacion directa contra la partida: de las 926 supertecnicas que conocemos,
**923 tienen nombre en espanol**, y las dos que Aaron nombro salen exactas:
`5228388C` = "Mano celestial" y `917B15A7` = "Escudo de fuerza".

La tabla esta en `datos/reglas-extraidas/nombres-es.csv` (3.217 entradas) y
`tlv.nombres()` la carga **encima** de `names.csv`, que se queda solo para los
objetos.

### O-42 · Objetos: el juego los separa por ranura — REGLA DE LEGALIDAD GRATIS
`item_config_7.00.25.00.cfg.bin` no tiene una lista de objetos, tiene **una por
tipo**, y cada tipo es exactamente una ranura de equipacion:

| Tabla del juego | Ranura | Objetos con nombre |
|---|---|---|
| `ITEM_SHOES_INFO_LIST` | 1 botas | 223 |
| `ITEM_MISANGA_INFO_LIST` | 2 brazalete | 82 |
| `ITEM_ACCESSORY_INFO_LIST` | 3 colgante | 81 |
| `ITEM_SPECIAL_INFO_LIST` | 4 especial | 82 |
| `ITEM_CONSUME_INFO_LIST` | consumibles | 73 |

Comprobado con los tres objetos que lleva Joseph King: su brazalete cae en
MISANGA, su colgante en ACCESSORY y su especial en SPECIAL. Ni uno se cruza.

O sea que la regla "cada objeto solo en su ranura" **no hay que escribirla a
mano**: sale del propio juego. La categoria va en `nombres-es.csv`.

De paso queda confirmado el esquema de identificadores de O-03:
`crc32("eq_sh110001")` = 1834815904 = exactamente la columna 0 de esa fila.

### O-40 · Lo que NO ha salido todavia de los ficheros
- `skills.sqlite` del dataminer salio **vacia**: su hilo de habilidades se cayo
  con un error interno. Resuelto por otro camino, ver O-41.
- (resuelto) Los objetos ya salen en espanol, ver O-42.
- Quedan 3.930 identificadores sin nombre en ningun idioma. Son sobre todo
  variantes de pasivas (la tabla tiene 6.866 filas y solo 1.694 llevan nombre),
  asi que probablemente sean filas internas, no cosas que se ensenen al jugador.

### O-43 · Las cinco pasivas no se reparten igual — CONFIRMADO CON DATOS
Aaron describio el reparto y los numeros de su propia partida lo confirman.
Agrupando sus 574 jugadores y midiendo cuantas pasivas distintas usa cada grupo:

| Ranuras | Agrupado por | Pasivas distintas por grupo |
|---|---|---|
| 4 y 5 | **arquetipo real del jugador** | **5,0** |
| 4 y 5 | arquetipo por defecto del personaje | 20,2 |
| 3 | **arquetipo real** | **3,7** |
| 1 y 2 | **el personaje concreto** | **4,5** |
| 1 y 2 | posicion | 25,2 |
| 1 y 2 | tipo de build (col 6) | 22,2 |

Dos cosas que importan:

1. **La ranura 3 mira el arquetipo**, como decia Aaron, aunque la pasiva que
   pone no sea de las "de arquetipo".
2. **El arquetipo que manda es el que le toco al jugador**, no el que trae el
   personaje de serie. Con el de serie los grupos salen cuatro veces mas sucios.
   Esto es importante para el editor: al cambiar el arquetipo hay que rehacer las
   pasivas mirando el arquetipo NUEVO.

Error propio que costo varias pruebas: al principio se metian las ranuras 1, 2 y
3 en el mismo saco. Como la 3 va por arquetipo y las otras dos por personaje,
mezclarlas emborronaba todas las agrupaciones y **ninguna clave parecia
funcionar**. Separandolas, salen solas.

### O-44 · El sorteo de pasivas de arquetipo — LOCALIZADO
`character/team_passive_lot_table_config_0.00.00.cfg.bin`:

| Tabla | Filas | Que es |
|---|---|---|
| `m_teamPassiveLotDataList` | 652 | pasiva, peso, y **seis marcas, una por rareza** |
| `m_teamPassiveLotTableDataList` | 131 | cada una apunta a un tramo de la anterior |

**129 de las 131 tablas tienen exactamente 5 entradas**, con nombres distintos y
pesos distintos (1, 20, 40, 50...). O sea: cinco candidatas, sale una. Es el
mecanismo que describio Aaron.

Que ranuras cubre, medido contra la partida de Aaron:

| Ranura | Pasivas suyas que salen en el sorteo |
|---|---|
| 1 | 29 % |
| 2 | 29 % |
| 3 | 54 % |
| **4** | **68 %** |
| **5** | **68 %** |

El gradiente encaja: **este sorteo es sobre todo el de las pasivas de arquetipo**
(ranuras 4 y 5), toca a medias la 3, y apenas las 1 y 2. **La fuente de las
ranuras 1 y 2 sigue sin localizar.**

### O-45 · CONFIRMADO NEGATIVO · de donde NO sale la pasiva de un personaje
Para no repetir el trabajo:

- **Ninguna columna** de `chara_base` (34) ni de `chara_param` (43) separa las
  pasivas. Probadas todas, una a una, midiendo el solape entre grupos.
- **No hay ninguna columna con varios valores** en esas tablas, asi que la lista
  de pasivas permitidas no esta metida dentro de la ficha del personaje.
- **No es la clave de los stats** (posicion + patron de crecimiento + rango).
- **No es el tablero de habilidades.** `ABILITY_LEARNING_BOARD_EFFECT_LIST`
  existe (23.790 casillas, 791 efectos distintos) pero solo contiene 3 de las 5
  pasivas de Joseph King: ese tablero es el de las pasivas personalizadas que se
  desbloquean con judias, no el de las que salen al invocar.
- **Los 131 identificadores de tabla de sorteo no aparecen en ningun otro fichero
  del juego**, ni hay en la ficha del personaje ninguna columna con un rango de
  0 a 130 que pudiera ser un indice. El enlace personaje -> tabla no es directo.

### O-46 · Los valores de una pasiva por rareza — RESUELTO
`skill/passive_skill_rarity_table_config_4.00.14.00.cfg.bin`, tabla
`m_passiveSkillRarityTableList`: **453 filas de seis identificadores cada una**.
Son el mismo efecto a seis niveles de rareza.

Matiz frente a lo que suponia Aaron: **no es el mismo id con distinto valor, son
ids distintos que comparten el mismo texto**. En el fichero de pasivas se ven
como `ps10001`, `ps10001_01`, `ps10001_02`... todos con el mismo `name_id`.

**Consecuencia para el editor:** al poner una pasiva a un jugador hay que darle
**la version que corresponde a su rareza**, no una cualquiera. Poner la de
Leyenda a un jugador de Elite seria un estado que el juego no produce.

### O-47 · Override de tecnicas — RESUELTO
`skill/override_skill_config_3.00.21.00.cfg.bin`, tres tablas que se cruzan:
`m_OverrideSkillInfoList` (32 resultados), `m_OverrideConditionInfoList` (32) y
`m_OverrideConditionSkillInfoList` (60 ingredientes).

Reconstruido entero. Ejemplos, que cuadran con lo que describio Aaron:

```
Chut de 200 toques    <- Chut de 100 toques + Chut de 100 toques
Tornado de fuego DD   <- Tornado de fuego + Tornado de fuego
Tornado doble         <- Tornado de fuego + Tornado inverso
Remate caotico        <- Disparo sagrado + Ventisca de fuego + Ventisca de fuego
```

**Y zanja la duda del subtipo 8**: de los 32 resultados, 21 son de Tiro pero
**4 de Regate, 4 de Defensa y 3 de Parada**. Si la marca 8 significara "tiene
override" apareceria en las cuatro categorias, y solo aparece en tiros. Segundo
argumento independiente para descartarlo (el primero esta en `supertecnicas.md`).

### O-51 · PASIVAS — RESUELTO. Las ranuras 1 y 2 son GENERICAS
Se habia dado por hecho (Aaron lo creia, y yo lo di por bueno) que las ranuras 1
y 2 dependian del personaje. **No es asi: hay un unico conjunto generico, el
mismo para todos los jugadores.**

El dato estaba delante desde el principio y no se vio: en 574 jugadores y 343
personajes distintos, las ranuras 1 y 2 solo usan **36 pasivas**. Un conjunto tan
pequeno no puede ser "cada personaje las suyas".

**Contraste externo que lo cierra.** Aaron aporto la ficha de pasivas de
`inazumo.es`, que dice literalmente "Slots 1-2: pasivas genericas que ocupan los
dos primeros huecos de cualquier jugador", y las reparte por familia de stat. El
recuento de la partida coincide **exactamente, familia por familia**:

| Familia | inazumo | partida de Aaron |
|---|---|---|
| Tiro | 7 | **7** |
| Foco | 13 | **13** |
| Muro | 7 | **7** |
| Disputa | 9 | **9** |
| **Total** | **36** | **36** |

Dos fuentes independientes —una base de datos externa y el contenido real de la
partida— dando el mismo reparto exacto. Y explica por que el enlace
personaje -> tablero no aparecia: **no existe**.

La estructura completa, ya confirmada por las dos vias:

| Ranuras | De que dependen |
|---|---|
| 1 y 2 | **de nada**: conjunto generico de 36, igual para todos |
| 3 | del **arquetipo**: 3 opciones por arquetipo |
| 4 y 5 | del **arquetipo**: 4 a 6 por arquetipo |

La ranura 3 medida en la partida da **3 opciones en cinco de los seis
arquetipos**; Contra da 4, sin explicar todavia. Las opciones **se solapan entre
arquetipos** (la misma pasiva puede ser opcion de Brecha y de Contra).

Tabla resultante: `datos/reglas-extraidas/pasivas-por-ranura.csv`.

**Correccion a O-43:** la medida "4,5 pasivas por personaje" en las ranuras 1-2
no significaba que cada personaje tuviera su grupo. Con un conjunto generico de
36 y dos ranuras por jugador, un personaje del que se tienen dos copias no puede
ensenar mas de 4 valores distintos. El numero salia tan bajo por el tamano de la
muestra, no por una regla.

**Correccion a O-50:** aquel muro no era un muro, era una pregunta mal planteada.

### O-52 · CORRECCION a O-51 · las ranuras 1-2 SI dependen de la posicion
O-51 se paso de frenada. Que el conjunto sea de 36 no significa que cualquier
jugador pueda sacar cualquiera de las 36. **Aaron lo senalo y los datos le dan la
razon.** Cruzando las 36 contra la posicion de quien las lleva (850
observaciones):

| Pasiva | POR | DEL | MED | DEF |
|---|---|---|---|---|
| PP del equipo | **4** | 0 | 0 | 0 |
| AT propio de tiro en campo contrario | 0 | **53** | 0 | 0 |
| DF del muro (dos variantes) | **30 / 26** | 0 | 0 | 1 |
| Valor de disputa para jugadores... | **12** | 0 | 0 | 1 |
| Valor propio de foco | 0 | 41 | 25 | 30 |
| Cuando un jugador del mismo elemento esta cerca, valor... | 0 | 0 | 18 | 8 |

Casos como 53 de 53 en delanteros o 0 de 124 en porteros no son casualidad.

Cuantas de las 36 se han visto en cada posicion:

| Posicion | Vistas | Con 5 o mas apariciones |
|---|---|---|
| POR | 20 | 6 |
| DEL | 24 | 15 |
| MED | 22 | 13 |
| DEF | 31 | 17 |

**Lo que esto es y lo que no es.** Es lo observado en la partida de Aaron, o sea
un **minimo**: una pasiva que no se ha visto en porteros podria ser posible y
simplemente no haber tocado. **No es** una regla leida de una tabla del juego.
Por eso `pasivas-por-ranura.csv` lleva la columna `veces_visto`, y el editor no
deberia tratar igual una vista 53 veces que una vista 1.

La posicion alternativa explica **algunas** excepciones pero no todas: de los tres
delanteros con "DF del muro" (una pasiva de portero), los tres tienen POR como
posicion alternativa. Pero quedan casos sin explicar.

**Sigue abierto** encontrar la tabla del juego que define esto. Lo que O-51 si
deja resuelto es que el universo son 36 y que el reparto por familia (Tiro 7,
Foco 13, Muro 7, Disputa 9) es correcto.

### O-53 · Ranura 3 — VALIDADA CONTRA FUENTE EXTERNA, 3 de 3 en cinco arquetipos
Aaron aporto la ficha de la ranura 3 de `inazumo.es`. Contrastada con lo que sale
de su partida, sin haberla mirado antes:

| Arquetipo | Coincidencias |
|---|---|
| Brecha | **3 de 3** |
| Tension | **3 de 3** |
| Afinidad | **3 de 3** |
| Juego sucio | **3 de 3** |
| Justicia | **3 de 3** |
| Contra | 3 de 3, **mas una de sobra** |

Quince de quince en los cinco primeros, con los identificadores saliendo de la
partida y los nombres de una web que no habiamos usado para nada. Eso valida de
golpe: el campo del arquetipo (O-33), el campo de las pasivas (O-27) y el modelo
de que la ranura 3 se elige por arquetipo (O-43).

**La de sobra**: `D210C171` ("cuando un jugador de otro elemento esta cerca, AT
propio de tiro"), que inazumo asigna a Afinidad y a Tension, aparece en **7
jugadores de Contra** de los 574. Ninguno es Fabled, asi que no es por el cambio
de arquetipo que permite el juego. **2 de los 6 personajes implicados si estan en
`seasonal_chara_param`**, que es la tabla de personajes con pasivas FIJAS, y esos
no siguen el sorteo. Los otros cuatro quedan sin explicar.

No se toca la tabla: se deja lo observado con su `veces_visto`. Que una fuente
externa y la partida coincidan 15 de 15 es mucho mas fuerte que cualquiera de las
dos por separado.

### O-54 · PASIVAS 1 y 2 — LA CLAVE ES EL TIPO DE TABLERO
`skill/ability_learning_config`, tabla `ABILITY_LEARNING_TYPE_INFO_LIST`:
**72 filas** de `(indice, A, B, C)` con

- A = 1..4, 18 filas de cada
- B = 1..4, 18 de cada, **siempre distinta de A**
- C = 0..5, 12 de cada

**4 x 3 x 6 = 72.** Esos son exactamente los tres campos que tiene cada personaje
en `chara_param`: **posicion principal (col 3), posicion alternativa (col 4) y
rango (col 9)**. El tipo de tablero de un personaje es esa terna.

Contrastado contra las pasivas 1-2 de los 574 jugadores de la partida, la mejora
es monotona segun se anaden las tres partes de la clave:

| Agrupado por | Pasivas por grupo | Solape medio |
|---|---|---|
| posicion | 24,2 | 76 % |
| posicion + alternativa | 14,4 | 51 % |
| posicion + rango | 12,8 | 43 % |
| **las tres = el tipo de tablero** | **8,1** | **33 %** |

Ninguna otra clave probada (build, arquetipo, patron de crecimiento, chara_base
entera) se acerca. Y el que la mejor clave empirica coincida exactamente con la
unica tabla del juego que tiene 4x3x6 filas no es casualidad.

Explica ademas el sesgo por familia que se veia antes: los porteros sacan 69 % de
pasivas de Muro y los delanteros 50 % de Tiro, porque su tablero es otro.

**Lo que falta para cerrarlo del todo:** partir
`ABILITY_LEARNING_BOARD_EFFECT_LIST` (23.790 casillas, 791 efectos distintos) en
los 72 tableros. No se divide en bloques iguales (23.790 / 72 = 330,4) ni los
ceros lo separan de forma regular, asi que hace falta el indice, probablemente
`ABILITY_LEARNING_SHAPE_TABLE_INFO_LIST` (41 formas con identificador).

Mientras tanto, los conjuntos observados por tipo de tablero ya son utiles: 37
tipos con 4 o mas jugadores en la partida de Aaron.

### O-55 · Las dos familias de pasiva ocupan bloques separados de la tabla de rarezas
De las 36 de las ranuras 1-2, **13 estan en el sorteo de arquetipo** (las de
alcance "propio") y **23 no** (las de "para jugadores de..."). Y en
`passive_skill_rarity_table_config` caen en bloques que no se tocan: las del
sorteo en las familias **0 a 108**, las otras en las **109 a 141**.

O sea que el juego las tiene deliberadamente separadas. Un jugador saca de las
dos fuentes en sus ranuras 1 y 2.

### O-56 · PASIVAS 1 y 2 — LA CLAVE QUE FALTABA ES EL EQUIPO DEL PERSONAJE
Aaron dio el contraejemplo que rompio la regla de la posicion: **Amara Myles es
portera y puede sacar pasivas de tiro**, y le pasa a mas jugadoras de las
Guardianas. Tenia razon, y ha resultado ser la pieza que faltaba.

`character/belong_team_config_0.00.00.cfg.bin`, tabla `m_belongTeamInfoList`:
**208 equipos**. El enlace es **`chara_base` columna 16**, y el nombre sale de la
columna 2 de esa tabla contra `text/<idioma>/team_text.cfg.bin`. El equipo de
Amara Myles se llama, literalmente, **"Guardianas"**.

Lo que tienen en la partida de Aaron los seis personajes de ese equipo que posee:

| Personaje | Posicion | Familias en las ranuras 1-2 |
|---|---|---|
| Amara Myles | POR | Foco, **Tiro** |
| Cecily Noire | DEF | **Tiro, Tiro** |
| Keira Donnell | DEF | **Tiro, Tiro** |
| Julietta Belamy | DEF | **Tiro, Tiro** |
| Vivian Calder | DEF | **Tiro, Tiro** |
| Ivy Celeste | DEF | **Tiro, Tiro** |

Un defensa cualquiera saca Tiro el 16 % de las veces; aqui es el 100 %. Y un
portero con Tiro es del 2 % en toda la partida.

Comparacion de claves, sobre las pasivas 1-2 de los jugadores de la partida:

| Clave | Grupos | Pasivas por grupo | Solape |
|---|---|---|---|
| posicion | 4 | 24,2 | 76 % |
| equipo solo | 31 | 9,7 | 45 % |
| pos + alt + rango (tablero) | 31 | 9,0 | 37 % |
| **equipo + posicion** | 36 | **5,9** | **24 %** |
| **tablero + equipo** | 31 | **4,8** | 22 % |
| el personaje concreto (techo) | 26 | 4,5 | 23 % |

`tablero + equipo` llega practicamente al techo teorico. **El equipo es la pieza
que explicaba las excepciones.**

`pasivas-por-ranura.csv` usa ahora `equipo / posicion` como agrupacion principal
de las ranuras 1-2: **134 grupos, 3,4 pasivas cada uno**. Y `jugadores.csv` trae
el equipo de cada personaje (192 equipos con nombre sobre 5.585 jugadores).

**Leccion de metodo, por segunda vez en este proyecto**: Aaron dijo desde el
principio que dependia del personaje, se le llevo la contraria con datos
agregados, y tenia razon. Los agregados escondian el efecto porque los equipos
son pocos y grandes: la media por posicion tapa que un equipo entero se salga de
la norma. **Un contraejemplo concreto vale mas que un promedio.**

### O-57 · PASIVAS 1 y 2 — RESUELTO DESDE EL CODIGO DEL JUEGO
Aaron pidio poder saber, **para cualquier personaje y de forma fiable**, que
pasivas puede sacar; observar su partida no vale porque no cubre los ~5.400 que
no tiene ni a los sueltos raros. Tenia razon, y la tabla existe.

**El error propio que lo retraso**: al listar las tablas de
`ability_learning_config` se corto la salida a las seis primeras. El fichero
tiene **45 tablas**, y la que hacia falta era la numero 34.

La cadena, para las pasivas "de delante" (ranuras 1 y 2):

```
LOT_FRONT_PASSIVE_INFO (6) -> MAIN (24) -> SUB (72) -> GROWTH (144) -> STYLE (432) -> SKILL (1710)
```

Cada lista alterna **una fila con la clave** y **otra con (donde empieza, cuantas)**
en la siguiente. Al final quedan entre 3 y 9 pasivas candidatas.

Las claves se sacaron probando todas las combinaciones de columnas de
`chara_param` contra las pasivas reales de los 574 jugadores de la partida:

| Nivel | Columna | Que es |
|---|---|---|
| INFO | **col 8 + 1** | |
| MAIN | col 3 | posicion principal |
| SUB | col 4 | posicion alternativa |
| GROWTH | col 7 | patron de crecimiento |
| STYLE | col 8 | |

**Acierto: 94,1 % en jugadores normales**, 85,3 % en Fabled.

**Los que fallan son personajes de historia**: Silvia Woods, Mister Yi, Cao Cao,
Xavier Schiller, **Zanark Avalonic**, Gamma... justo el otro equipo que Aaron
menciono como excepcion. `chara_param` los marca aparte en
`STORY_FIX_SKILL_INFO_LIST` (87 filas) y llevan pasivas fijas.

**La validacion que importa** es la de Amara Myles, que rompia toda regla por
posicion. Su pool leido del juego tiene **exactamente 3 candidatas**:

```
AT de tiro, para jugadores de distintos elementos
AT de tiro, para jugadores cercanos
Valor de foco del equipo, cuando ...
```

Es portera y **dos de sus tres candidatas son de tiro**. Las dos que tiene en la
partida estan dentro. Por eso las Guardianas se salian de la norma: no es una
excepcion, es su pool.

Resultado: `datos/reglas-extraidas/pool-pasivas.csv`, **35.061 filas cubriendo los
5.717 personajes jugables**, 6,1 candidatas de media. Ninguno se queda sin pool.

Sustituye a la version observada, que solo cubria los 343 personajes de Aaron.

**Queda pendiente** la cadena equivalente de las pasivas "de atras"
(`LOT_BACK_PASSIVE_INFO` 16 / `BUILD` 86 / `SKILL` 149), que deberia dar las
ranuras 4 y 5, y las pasivas fijas de los personajes de historia.

### O-58 · RAREZA DEL JUGADOR — LOCALIZADA
Campo **`0xE9835BD9`**, 4 bytes por jugador, en la cadena de arrays de O-21.

Verificado con los tres jugadores cuya rareza dijo Aaron, y salen en orden:

| Valor | Rareza | Jugador |
|---|---|---|
| 2 | Futbolista de elite | Julia Blaze |
| 3 | Futbolista estrella | Morgan Sanders |
| 4 | Leyenda del futbol | Joseph King |

Y la distribucion sobre sus 574 jugadores separa las categorias sin mezcla:

| Valor | Jugadores | Categoria en `chara_param` |
|---|---|---|
| 0 | 40 | todos normales |
| 1 | 26 | todos normales |
| 2 | 7 | todos normales |
| 3 | 9 | todos normales |
| 4 | 386 | todos normales |
| **5** | 17 | **todos hero** |
| **6** | 10 | **todos hero** |
| **7** | 16 | **todos hero** |
| 8 | 63 | fabled |

**0 a 4 son los cinco escalones que se suben jugando**; 5, 6 y 7 son los **tres
tipos de Hero** (encaja con lo que ya se sabia de que hay tres variantes); 8 es
Fabled.

Para el editor esto es justo lo que hacia falta: subir de 3 a 4 es legal, pero
pasar de 4 a 5 convertiria a un jugador normal en Hero, y eso no lo es.

**Los nombres no estan en los ficheros de texto**: en el juego son banderolas
dibujadas, o sea imagenes. Aaron los aporto con la captura de la pantalla de
filtros, y los nueve encajan uno a uno con los nueve valores:

| Valor | Rareza |
|---|---|
| 0 | Futbolista comun |
| 1 | Futbolista emergente |
| 2 | Futbolista de elite |
| 3 | Futbolista estrella |
| 4 | Leyenda del futbol |
| 5 | Idolo (roja) |
| 6 | Idolo (plateada) |
| 7 | Idolo (rosa) |
| 8 | Diamante |

**Idolo** es Hero, y sus tres colores son las tres variantes por personaje que ya
se conocian: que ocupen justo los valores 5, 6 y 7 lo confirma desde otro angulo.
**Diamante** es Fabled / Basara, asi traducido al espanol.

### O-59 · CORREGIDO · DIAMANTE es Fabled, no un modo del avatar
Primero se interpreto, por un texto de ayuda, que DIAMANTE era una transformacion
del avatar. **Es la traduccion espanola de Fabled / Basara**, y ocupa el valor 8.

El texto de ayuda va de otra cosa: el avatar que crea el jugador puede alternar
entre Diamante y Leyenda del Futbol desde el selector de plantilla, y al pasar a
Diamante **las pasivas heredadas se desequipan temporalmente**. Eso es una
mecanica del avatar, no una rareza aparte.

### O-48 · Hay DOS familias de pasiva de equipo, con mecanismos distintos
Listando las **36 pasivas** que usan las ranuras 1 y 2 en los 574 jugadores de
Aaron (son solo 36; ademas 298 de esas ranuras estan directamente vacias), el
texto las parte en dos grupos limpios:

| En el sorteo de arquetipo | Fuera del sorteo |
|---|---|
| "Valor **propio** de foco..." | "Valor de foco **para jugadores de**..." |
| "AT **propio** de tiro..." | "DF del muro **para jugadores del** mismo elemento" |
| "**Cuando un jugador esta cerca**, ..." | "AT de tiro **para jugadores de** la misma posicion" |

Las del sorteo se aplican **a uno mismo o por proximidad**. Las otras benefician
**a un grupo del equipo**. No es que falte "la tabla de las ranuras 1 y 2": es
que hay dos tipos de pasiva con origen distinto.

Normalizar por familia de rareza **no cambia nada** (29 % sigue siendo 29 %), asi
que la diferencia no es de variantes.

### O-49 · Las de "para jugadores de X" viven en el tablero de habilidades
Buscando tres de ellas en crudo por los 71.100 ficheros: **3 de 3** aparecen en
`skill/ability_learning_config_1.03.63.00.cfg.bin`, ademas de en la definicion de
pasivas y en la tabla de rarezas.

Eso explica el 3 de 5 de King que antes parecia descartar el tablero (O-45): las
3 que aparecen son las de esta familia, y las 2 que no, las del sorteo.

Y encaja con la captura de Aaron: las cinco pasivas de equipo salen en la pantalla
del tablero, **una activa y cuatro con candado**, que se abren por partidos
jugados. La tabla `ABILITY_LEARNING_LOCK_LEVEL_INFO_LIST` trae filas `254/10/10` y
`255/20/20`, que cuadran con los umbrales de partidos.

Tablas del fichero: `TYPE_INFO` (74 tipos de tablero), `SHAPE_TABLE` (41 formas
con identificador), `BOARD_EFFECT` (23.790 casillas, 791 efectos distintos),
`LOT_PASSIVE_LV` (7), `BEANS` (7), `LOCK_LEVEL` (21).

### O-50 · MURO ACTUAL · no se sabe que tablero le toca a cada personaje
Probado y descartado:

- ninguna columna de `chara_base` ni de `chara_param` contiene los 40
  identificadores de forma de tablero;
- ninguna columna tiene un rango 0..73 que pudiera indexar los 74 tipos;
- 23.790 casillas no se reparten en 74 ni en 41 partes iguales, asi que el
  tablero no es un tramo de tamano fijo.

**Lo que falta es exactamente eso: el enlace personaje -> tablero.** Con el, la
regla de "que pasivas puede sacar este personaje" quedaria cerrada.

**Plan B si no aparece:** deducir los grupos desde la propia partida de Aaron.
Tiene 343 personajes distintos con 574 copias; para los que tiene repetidos se
puede reconstruir su grupo por observacion. Seria parcial (no cubriria los ~5.400
que no tiene) pero sirve para validar y para los suyos.

### O-60 · Partidos jugados — localizado
Campo `0x1238E5AC`, 2 bytes dentro de la ficha del jugador.

No se encontro comparando partidas sino por correlacion, y cuadra por los cuatro
lados:

| Quien | Partidos |
|---|---|
| Joseph King, recien conseguido | 0 |
| Media de los de nivel <= 20 | 2,3 |
| Media de los de nivel >= 90 | 54,4 |
| El que mas | 246 |

Y el propio Aaron leia "Quedan 30 partidos" en la ficha de King, que con 0
jugados es exactamente lo que toca.

Importa porque **las dos ranuras de insignia se abren a los 10 y a los 30
partidos** (O-25): sin este campo no se puede dejar a un jugador en un estado que
el juego considere completo.

### O-61 · CORREGIDO · Lo que marca que un objeto es tuyo es `kind`, no `sub`
Se venia creyendo (O-05) que una fila del inventario era tuya cuando
`sub (0xD1F4EB9A) == 2`. **Es falso**, y el contraejemplo esta en la propia
partida de Aaron:

| Objeto | sub | cantidad | jugadores que lo llevan puesto |
|---|---|---|---|
| Botas desafiantes | **1** | 99999 | 1 |
| Botas de champon con tacos | **1** | 99999 | 3 |
| Botas de EXP (fila duplicada) | 5 | 0 | 0 |

Una fila con `sub = 1` que tres jugadores llevan puesta se posee, sin discusion.
Lo que separa de verdad las filas de verdad de las de adorno es
**`kind (0x047E2314) == 3`**: las 48 filas con `kind = 0` son todas `sub = 5` y
tienen cantidad 0 o 900, y duplican el nombre de una fila `kind = 3`.

Coste del error: `filas_poseidas` dejaba fuera **241 filas que si se poseen**, y
el editor se negaba a equipar cosas que Aaron tenia en la mochila.

Que es `sub` exactamente sigue sin saberse. No hace falta saberlo: al crear una
fila se copia el valor de una fila hermana de la partida en vez de inventarlo.

Leccion, otra vez la misma que en O-56: **un contraejemplo concreto vale mas que
una correlacion**. Aqui bastaba mirar si alguna fila "no poseida" estaba
equipada.

### O-62 · El numero de fila (`slot`) se puede calcular entero
`slot (0x918020D9)` no es un contador suelto. Es una direccion compuesta:

    slot = ((pos + 1) << 18) | (clase << 16) | (tipo << 13) | pos

- `pos` — numero de fila **dentro de su bloque** (13 bits)
- `tipo` — que guarda el bloque (3 bits)
- `clase` — 0 objetos, 1 lo que se aprende (2 bits)
- los 14 bits de arriba repiten `pos + 1`

**Comprobado contra las 2.053 filas usadas de la partida de Aaron: cuadran
2.053, fallan 0.** Y tras crear una fila nueva con la formula, 2.054 de 2.054.

Que la parte alta siga a la posicion y no al orden de adquisicion se ve en el
bloque de tecnicas: las filas 3 y 4 estan vacias y la 5 tiene `(5+1)`, no `(3+1)`.
Por eso no es un contador de generacion.

Para que importa: las filas libres tienen `slot = 0`, y **la equipacion apunta a
las filas por este numero, no por el objeto** (O-19). Una fila nueva con `slot`
en cero aparece en la mochila pero no se le puede poner a nadie, y ademas choca
con las demas filas libres.

### O-63 · El mapa de bloques del inventario
Las 6.166 filas estan repartidas en 15 tramos contiguos de tamano fijo, con las
filas libres siempre al final de su tramo. Los limites **no hay que adivinarlos**:
cada fila dice en que posicion de su bloque esta (O-62), asi que el principio es
`indice - pos` y el final es donde empieza el siguiente.

| clase | tipo | principio | tamano | usadas | Que guarda | Tabla del juego |
|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 150 | 45 | consumibles | ITEM_CONSUME_INFO_LIST |
| 0 | 1 | 150 | 300 | 21 | botas | ITEM_SHOES_INFO_LIST |
| 0 | 2 | 450 | 150 | 17 | brazaletes | ITEM_MISANGA_INFO_LIST |
| 0 | 3 | 600 | 150 | 17 | colgantes | ITEM_ACCESSORY_INFO_LIST |
| 0 | 4 | 750 | 150 | 37 | especiales | ITEM_SPECIAL_INFO_LIST |
| 0 | 7 | 900 | 200 | 1 | ropa | ITEM_FASHION_INFO_LIST |
| 0 | 5 | 1100 | 200 | 65 | equipaciones | ITEM_COSTUME_INFO_LIST |
| 0 | 6 | 1300 | 500 | 114 | emblemas | ITEM_EMBLEM_INFO_LIST |
| 1 | 0 | 1800 | 350 | 36 | muebles del club | ITEM_CRAFT_OBJ_INFO_LIST |
| 1 | 2 | 2150 | 200 | 55 | titulos | ITEM_TITLE_INFO_LIST |
| 1 | 3 | 2350 | 3200 | 1554 | tecnicas, auras, pasivas, insignias | ITEM_SPECIAL_SKILL_INFO_LIST |
| 1 | 4 | 5550 | 150 | 36 | pegatinas | |
| 1 | 5 | 5700 | 400 | 31 | placas de nombre | ITEM_NAME_PLATE_INFO_LIST |
| 1 | 6 | 6100 | 50 | 10 | celebraciones | ITEM_PERFORMANCE_INFO_LIST |
| 1 | 7 | 6150 | 16 | 14 | judias | |

Los tamanos cuadran con los catalogos del juego donde se puede comprobar: 3.033
tecnicas especiales en un tramo de 3.200, 34 celebraciones en uno de 50.

El tramo **no se puede agrandar**: esta reservado y detras empieza el siguiente.
Cuando se llena, se llena.


### O-64 · Un jugador vive en cinco sitios a la vez
Crear un jugador no es escribir un registro, es escribir cinco cosas que tienen
que cuadrar entre si:

| Donde | Que lleva |
|---|---|
| arrays paralelos | identidad, nivel, experiencia, rareza (6.000 huecos cada uno) |
| array del arquetipo | `0x8BA23AC3`, 1 byte por jugador |
| su ficha (`0xBB459017`) | pasivas, heredadas, judias, partidos, y tres bloques que aun no se entienden |
| su registro de equipacion (`0x14CF8197`) | las 4 ranuras, vacias en uno nuevo |
| su registro de supertecnicas (`0xAAC36512`) | 9 ranuras, que apuntan a la biblioteca |

Detalle que importa: **hay 6.048 fichas pero los arrays solo tienen 6.000
huecos**. Un jugador puesto en la fila 6.000 o mas tendria ficha y no tendria ni
nombre ni nivel. El editor no pasa de 6.000.

Otra cosa comprobada: **no hay ningun contador de jugadores**. Se busco el valor
5.092 (y 5.091 y 5.093) como contenido de cualquier campo TLV de la partida y no
aparece. El juego recorre las filas y da por vacia la que tiene identidad 0, asi
que rellenar una fila libre basta.

### O-65 · Un jugador de nivel 1 sale con sus tres primeras supertecnicas
De los 4.515 jugadores de nivel 1 de la partida que estan en la tabla del juego,
**4.479 llevan exactamente las tecnicas r1, r2 y r3 de su arbol** (99,2 %). Los
36 restantes son casos donde la tabla trae la tercera vacia.

Unos cuantos llevan ademas ranuras extra (espiritu, Miximax): 4.184 tienen 3
ranuras llenas, 232 tienen 4, 52 tienen 6 y 47 tienen 9. Las tres primeras
cuadran igual.

Y esto explica de paso el `sub = 10` de O-61: **las filas con `sub = 10` son la
biblioteca de tecnicas**, las filas a las que apuntan las ranuras de los
jugadores. Por eso son 721 con identificadores todos distintos y 595 con el
contador de "equipada" por encima de cero.

### O-66 · Tres bloques de la ficha que siguen sin entenderse
| Campo | Tamano | Que se sabe |
|---|---|---|
| `0x3CAEA0BD` | 30 | 30 casillas, `ff` = vacia. Solo se usa la primera, y vale 7 en 4.987 jugadores. En 105 esta vacia. |
| `0x38AFC2B8` | 30 | la pareja de la anterior, `00` = vacia. La primera casilla vale 1, 4, 5, 6, 7 u 8. |
| `0xBB459017` | 60 | un byte 0/1 por casilla. Un jugador de nivel 2 tiene 1 encendida, uno de nivel 79 o 98 tiene 18. Pinta de tablero de crecimiento. |

Lo que se descarto: el valor de `0x38AFC2B8` **no es** rareza, arquetipo,
elemento ni posicion, y **no sale de ninguna columna** de `chara_param` ni de
`chara_base` (se probaron todas las columnas de las dos tablas contra los 2.545
personajes que tienen un valor unico; ninguna lo separa).

Lo que si se sabe: es casi propio del personaje — solo 38 personajes de 2.645
tienen mas de un valor — y **los 95 Idolos de la partida lo tienen vacio**.

Como no se entiende, el editor **no se lo inventa**: al crear un jugador copia
estos tres bloques de un jugador de nivel 1 de la propia partida.

### O-67 · Idolos y Diamantes no sortean nada, y sus pasivas NO se guardan
Dos cosas distintas, las dos comprobadas sobre los 5.092 jugadores:

**1. Su rareza y su arquetipo son fijos.** Ningun personaje de familia `hero` o
`fabled` aparece en la partida con dos rarezas distintas, ni con dos arquetipos
distintos. Los normales si: de 289 personajes con varias copias, solo 84
coinciden en arquetipo y **solo 1 coincide en las cinco pasivas**. O sea que en
los normales se sortea y en los Idolos no.

**2. El campo de pasivas de un Idolo esta VACIO, y es lo correcto.**

| Rareza | Con pasivas guardadas | Con el campo a cero |
|---|---|---|
| Idolo (roja, plateada, rosa) | 0 | **95** |
| Diamante | 51 | 59 |
| Normales (0 a 4) | 4.824 | 63 |

Los 95 Idolos, sin excepcion. Sus pasivas no viven en la partida: las pone el
juego desde sus propias tablas. Que los Diamantes salgan partidos encaja con lo
que cuenta Aaron: un futbolista normal puede acabar de Diamante, y ese conserva
las pasivas que le tocaron.

Consecuencia para el editor: al crear un Idolo o un Diamante nativo no se eligen
ni rareza ni arquetipo ni pasivas. Se copian de una copia suya que ya haya en la
partida, y si no la hay **se rechaza la operacion** en vez de inventarselas.

**Superado**: O-161 (rareza y arquetipo de las tablas del juego), O-162 (lo que
escribe el juego al invocar, y las pasivas fijas salen del tablero de cada uno)
y O-163 (Diamantes: arquetipo elegible, semilla y personal).


### O-68 · CORREGIDO · Un jugador son ONCE campos, no cinco
El primer intento de crear jugadores escribio identidad, nivel, experiencia,
rareza y arquetipo. **El juego los guardo y no los enseño.** No los borro: se
quedaron ahi, invisibles.

La respuesta salio de la propia partida. Aaron borro 169 jugadores desde el menu
del juego; comparando la partida de antes con la de despues, los 169 cambiaron
exactamente en estos once campos y en ninguno mas:

| Campo | Bytes | Al vaciar | Que es |
|---|---|---|---|
| `0x918020D9` | 4 | 0 | numero de fila del jugador (ver O-69) |
| `0xBA162C11` | 4 | 0 | identidad |
| `0x377173B1` | 2 | 0 | nivel |
| `0xE9835BD9` | 4 | 0 | rareza |
| `0x90F47C83` | 4 | 0 | serie de adquisicion |
| `0x8BA23AC3` | 1 | **6** | arquetipo; 6 significa "ninguno" |
| `0x05B7786A` | 1 | 0 | sin identificar; vale 4 en 4.868 de 4.923 |
| `0xFA7AEFFB` | 4 | 0 | sin identificar, pinta de banderas; 1025 (`0x401`) en 3.975 |
| `0xFC830AAC` | 1 | 0 | sin identificar, de 1 a 4; vale 3 en 2.727 |
| `0x71DB6E55` | 1 | 0 | vale **1** en todos, sin excepcion |
| `0xD6B65E67` | 4 | 0 | numero grande y distinto en cada uno; **55 jugadores lo tienen a 0** |

La experiencia (`0xAF047AD9`) **no** la limpia: se queda de basura en la fila
vacia. Por eso no es parte de lo que define a un jugador.

Y en la ficha limpia estos: `0x3CAEA0BD` a `ff`, `0x38AFC2B8` a cero,
`0x45E2D879` a `ff`, el bloque de 60 a cero, las pasivas a cero y `0x8F0E9F49` a
cero. En el registro de supertecnicas, las tres ranuras usadas a cero.

Leccion, y van tres: **comparar dos partidas responde en una tarde lo que la
deduccion no resuelve en un dia**. La operacion inversa (borrar) enseña el mismo
conjunto de campos que la directa (crear), y borrar si lo puede hacer Aaron.

### O-69 · El numero de fila de un jugador tambien se calcula
Igual que en el inventario (O-62), pero con otra forma:

    slot = (fila << 16) | 0x800 | (serie % 2048)

**Comprobado contra los 4.923 jugadores: cuadran 4.923, fallan 0.**

Arriba va el numero de fila tal cual. Abajo, el `0x800` marca "esto es un
jugador" y los 11 bits de la derecha repiten el numero de adquisicion. Para que
sirve esa parte de abajo se ve al reutilizar una fila: como la serie es otra, el
numero sale distinto, y **una alineacion vieja que apuntase a esa fila ya no
cuadra** en vez de ensenar al jugador nuevo que ha caido ahi.

Los dos jugadores que cree con este campo a cero tenian serie 0 y numero 0: eso
era justo lo que les faltaba.

### O-70 · Como saber si un jugador esta metido en algun equipo
El numero de fila de un jugador suelto aparece **3 veces** en la partida. El de
uno que esta en alguna alineacion aparece 5, 7, 9, 10, 12 o 18 veces, porque las
alineaciones lo guardan.

No hace falta entender donde estan las alineaciones para usarlo: contar cuantas
veces aparece el numero basta para no borrar a nadie que este jugando. De las
1.890 copias de sobra de nivel 1 de la partida de Aaron, las 1.890 aparecen 3
veces.


### O-71 · `0xFC830AAC` sale de la columna 4 de chara_param
Se encontro puntuando **todas** las columnas de chara_param por lo bien que
predicen el valor que tienen los jugadores de la partida, en vez de exigir que
acertaran todas. La columna 4 acierta en **2.644 de 2.644** personajes; la
siguiente mejor se queda en 98,8 %.

Que significa esa columna no se sabe. Da igual: lo que hace falta es que un
jugador creado lleve el mismo valor que le pondria el juego, y eso ya se sabe.

Lo genera `herramientas/construir_ficha_jugador.py` en `ficha-jugador.csv`.

### O-72 · `0xD6B65E67` es el identificador de la copia, y dejarlo a cero rompe el retrato
**El sintoma:** Aaron creo dos jugadores con el editor, aparecian en la lista y
funcionaban (subir nivel, equipar, meterlos en un equipo), pero al pasar por
encima de ellos el juego ensenaba **el nombre y el retrato del jugador anterior**
con las estadisticas correctas del nuevo.

**La causa:** el campo estaba a cero. Es un numero de 32 bits distinto en **los
4.868 jugadores de la partida que lo tienen puesto, sin una sola repeticion**. No
es el crc32 de la identidad, ni de la serie, ni del numero de fila, ni de la
suma: se probaron los cuatro y no coincide ninguno. Es el identificador de esa
copia concreta, y el juego lo usa para saber a quien esta mirando.

Los 55 que lo tienen a cero son los jugadores que da la historia al empezar, que
deben ir por otro camino.

Al crear un jugador se genera un numero al azar que no tenga ya nadie.

**Como se encontro, que es lo que vale la pena recordar:** en vez de mirar la
ficha del jugador nuevo, se **creo una copia de un personaje que Aaron ya tenia**
y se compararon las dos fichas campo a campo. Todo lo que salio distinto era
sospechoso, sin ruido de "es que son personajes distintos". Quedaron cuatro
diferencias, dos de ellas legitimas.

### O-73 · CUIDADO · No copiar nunca de una fila que haya creado el editor
El primer arreglo copiaba los bloques de aspecto de "otra copia del mismo
personaje" que hubiera en la partida. Funciona... hasta que la unica copia que
hay es una que creo el editor con el valor mal: entonces el error se copia a si
mismo y parece que todo cuadra.

Paso de verdad: al crear un Flanko Midspringle nuevo, copio los bloques de **mi
propio Flanko roto** de la prueba anterior.

Regla: una fila creada por el editor no es una fuente. Antes de usar la partida
como referencia hay que quitar de en medio lo que haya puesto el editor.

### O-74 · Los bloques de aspecto: o el valor correcto o vacios, nunca el de otro
Aaron probo en el juego los dos jugadores creados, cada uno arreglado de una
forma distinta a proposito:

| Jugador | Que se le hizo a `0x3CAEA0BD` / `0x38AFC2B8` | Resultado |
|---|---|---|
| Axel Blaze (Idolo) | vaciados | **bien** |
| Flanko Midspringle | se dejaron con el valor copiado de otro personaje | **sigue mal** |

Asi que el identificador de copia (O-72) no era toda la causa: **el bloque de
aspecto con el valor de otro personaje rompe el mismo sitio**.

El sintoma es muy concreto y conviene reconocerlo: si vas directo a la ficha, se
ve bien. Si pasas antes por encima de otro jugador y luego por el, se queda el
nombre y el retrato del anterior con las estadisticas del nuevo.

**Que se hace ahora:** al crear un jugador los bloques se dejan vacios. Vacio no
es un apano, es un estado que el juego produce: los 95 Idolos de la partida los
tienen asi, y tambien **el avatar de Aaron (Destin Billows), que llega a nivel
99** con ellos vacios. Diez filas de la partida lo demuestran.

De donde sale el valor bueno sigue sin saberse, y se ha buscado en serio: todas
las columnas de chara_param y de chara_base puntuadas por cuanto aciertan (la
mejor, 43 %, que es lo mismo que acertar siempre "7"), el equipo, la posicion, el
elemento, la rareza, el arquetipo, el prefijo del identificador interno y el
orden de adquisicion. Nada.

### O-75 · CUIDADO · La nube de Steam puede devolver la partida vieja
Despues de que Aaron instalara una partida editada, la probara y contara lo que
veia, la partida que habia en la carpeta de Steam volvia a ser **byte a byte la
anterior**. Se comprobo comparando el sha256: identico a la de dos instalaciones
atras.

O sea que no basta con cerrar Steam para copiar: hay que asegurarse de que
despues **el juego guarda encima**, o la nube puede reponer su copia. Lo que se
pierde no es solo la edicion, tambien lo que se haya jugado con ella.

Costo real: se perdio el nivel 14 y la equipacion que Aaron habia dado a los dos
jugadores creados. Se pudo reponer porque el proyecto guarda cada ronda, no
porque la partida se salvara.

### O-76 · Las imagenes del juego: un `.g4tx` lleva un DDS dentro
No hace falta bajar las fotos de ninguna pagina: estan en los archivos del juego.

Las texturas son `.g4tx`, y el formato es facil una vez visto: **una cabecera y,
pegado detras, un fichero DDS normal y corriente**. Empieza en

    tamano_del_fichero - (los 4 bytes que hay en el offset 0x2C)

Comprobado en las 892 texturas del primer lote: **cuadran 892, fallan 0**. Dentro
es BC7 (DXGI 98) en 891 de ellas y DXT5 en una, y Pillow las abre las dos.

Otros datos de la cabecera, por si hacen falta: `G4TX` en 0x00, y el ancho y el
alto como dos `u16` en 0x78.

Del juego entero (61 GB, 936 archivos) salen **19.534 imagenes, medio giga en
PNG**, y estan en `datos/iconos/` con las mismas carpetas que usa el juego:

| Carpeta | Cuantas |
|---|---|
| `10_icon_chr/uniform` | 12.560 |
| `10_icon_chr/face` | 5.685 |
| `01_icon_emblem` | 715 |
| espiritus (`aura_armed`, `aura_fs`, `aura_soul`, `aura_mixi`) | 349 |
| el resto (placas, objetos, rarezas, clases, rangos, numeros) | 225 |

Las caras se llaman `<string_id>_l.png`, asi que cuadran con el personaje sin
mas: **5.672 de los 5.717 jugables**. Los 45 que faltan son NPCs sin nombre.

### O-77 · Que camiseta lleva cada personaje
Para ensenar a un jugador de cuerpo y no solo la cara. La cadena tiene cuatro
saltos y el ultimo es el que la cierra:

    chara_base col 16        el equipo al que pertenece
      -> belong_team_config  su ficha (207 equipos)
      -> col 16..19          los identificadores de sus equipaciones
      -> m_UniformInfoList   Tuple2I16(posicion, cuantas)
      -> m_UniformModelInfoList
      -> columna 0           crc32("u<equipacion>_<variante>")

Ese ultimo paso es un **hash de nombre de fichero**, asi que se deshace al reves:
se calcula el crc32 de los nombres de icono que hay extraidos y se mira cual
cuadra. Resuelve **1.052 de las 1.246 filas de modelo**, **204 de 207 equipos** y
**5.939 personajes**.

Y la cara se pone encima del busto sin mover nada: encajan tal cual.

**El tercer numero del nombre SI es la complexion.** Aqui se dijo lo contrario y
estaba mal; ver O-80, que explica el error de medicion.

### O-78 · CUIDADO · Un desplegable normal no sirve si las opciones llegan tarde
La primera version de la interfaz pedia las opciones al servidor cuando se
pulsaba el desplegable. **El desplegable del navegador se abre antes de que
lleguen**, y coge las opciones que hay en ese momento: ninguna. Aaron lo conto
como "no me deja hacer nada en el editor", y tenia razon.

Se cambio por un selector propio: se abre, dice que esta cargando, y cuando
llegan las pinta con un buscador. Hacia falta de todas formas, porque una ranura
LIBRE tiene casi 900 tecnicas y eso en un desplegable no hay quien lo mire.

### O-79 · CORREGIDO · La primera linea de un volcado unas veces es cabecera y otras no
`construir_equipacion_jugador.py` descartaba la primera linea de cada tabla, como
hace `construir_nombres_es.py`. En las tablas de objetos eso es correcto (la
primera linea es `<filas> <algo>`), pero en `m_UniformInfoList` y
`m_UniformModelInfoList` **la primera linea ya es un dato**.

Efecto: todas las equipaciones salian **corridas en uno**. Cada jugador aparecia
con la camiseta del equipo siguiente, y las parejas de modelos mezclaban dos
uniformes distintos (`u010101_60` con `u010201_10`).

Se detecto porque Aaron dijo "los cuerpos no concuerdan en su mayoria". La
comprobacion que lo confirma, y que ahora vale de prueba: **los jugadores de un
mismo equipo tienen que llevar todos la misma camiseta**. Antes fallaba en muchos
equipos; ahora cuadra en 188 de 189.

Arreglado mirando el ancho: si la primera linea tiene menos columnas que las
demas, es cabecera. Y sin resolver bajo de 227 personajes a 111.

### O-80 · CORREGIDO · El tercer numero del icono SI es la complexion
En O-77 se dijo que las variantes `_00`, `_01`, `_02`, `_03` eran disenos de
camiseta y no tipos de cuerpo. **Era falso**, y el error estuvo en como se midio:
se comparo el ancho de la silueta **en una sola fila de pixeles**, a 30 px del
borde, que es justo donde todas coinciden.

Mirandolas enteras se ve a la primera:

| Variante | Como es |
|---|---|
| `_00` | cuello y hombros estrechos |
| `_01` | con cuello de camisa, mismo ancho |
| `_02` | manga corta y el mas estrecho (165 px) |
| `_03` | cuello grueso y el mas ancho (196 px) |

Y cuadra con lo que dice Aaron: su equipo (Nagumohara) tiene las variantes 00, 02
y 03, y Cade Shelby, que segun el es de cuerpo grande, tendria que ser la 03.

**Lo que sigue sin saberse: de donde sale la complexion de cada personaje.**
Descartado a base de probar:

- `chara_base` col 22 a 32: son binarias, no llegan a cuatro cuerpos. La mejor
  (col 22) acierta el 93 % pero solo sabe decir 0 o 1.
- `chara_base` col 14: tiene 15 valores, no 4.
- **Y lo definitivo**: los 44 jugadores del equipo Nagumohara tienen las columnas
  20 a 33 de `chara_base` **identicas entre si**, asi que su complexion no puede
  salir de ahi.

Comparando la ficha entera de Cade Shelby con la de un companero, lo unico que
difiere son identificadores y la columna 14. Asi que la complexion estara en otra
tabla que aun no se ha mirado.

Leccion: **medir en un solo punto no es medir.** Una sola fila de pixeles dio la
respuesta contraria a la verdadera, y se dio por buena porque encajaba con lo que
ya se pensaba.

### O-81 · CORREGIDO · Una cabecera pegajosa que se parte tapa lo que hay debajo
La cabecera del editor es `position: sticky`. Con la ventana estrecha se parte en
dos lineas y crece; al bajar la pagina, **tapaba la fila de pestanas** y no habia
forma de pulsarlas. Aaron lo conto como "tampoco me deja clicar a las otras
pestanas".

Arreglado poniendo las pestanas tambien pegajosas, justo debajo.

De paso: las paginas se sirven con `Cache-Control: no-store`. Sin eso el
navegador se queda con la pantalla vieja y parece que los arreglos no han entrado.

### O-82 · La complexion: lo que se sabe y lo que no
**Lo que si.** El tercer numero del icono de equipacion es la complexion, y
**crece con el tamano**: `_00` es el de hombros mas estrechos y `_03` el mas
ancho. Se vio poniendo la cara de un mismo jugador sobre las variantes de su
equipo, no midiendo pixeles: las dos veces que se midio se saco la conclusion
contraria a la verdadera (ver O-80).

No todos los equipos tienen las cuatro: 6.052 camisetas tienen solo la `_00`,
1.969 tienen dos, 619 tres y 97 las cuatro. Asi que hace falta un plan B cuando
la que toca no existe.

**Lo que no.** De donde sale la complexion de cada personaje. Descartado, y todo
con datos:

| Se probo | Por que no es |
|---|---|
| columnas binarias de `chara_base` (22 a 32) | solo distinguen dos cuerpos |
| `chara_base` col 14 | 15 valores distintos, no cuatro |
| `chara_base` col 13 | tiene **exactamente cuatro** valores, que enganaba mucho, pero le da el mismo a Cade Shelby (grande) y a Hugo Tallgeese (pequeno) |
| cualquier columna de `chara_base` o `chara_param` | con 11 personajes que Aaron etiqueto a mano, **ninguna** separa los grupos, ni siquiera relajando a grande/normal/pequeno |
| `chara_face_icon_config` | sus registros son de 32 bytes y no contienen ninguna identidad de personaje |

Y lo que lo zanja: **los 44 jugadores del equipo Nagumohara tienen las columnas 20
a 33 de `chara_base` identicas entre si**, y entre ellos hay cuerpos distintos.

Mientras no se sepa, el editor usa la `_00`, que existe siempre.

### O-83 · APARCADO · Los cuerpos, y una pista que queda por mirar
Decision de Aaron el 2026-09-14: la interfaz ensena **solo la cara**. El cuerpo se
retoma mas adelante; con la complexion equivocada se ve peor que sin cuerpo.

Lo que queda hecho y sirve cuando se retome:

- `datos/reglas-extraidas/equipacion-jugador.csv`, con la camiseta del equipo de
  cada personaje (O-77), y el endpoint `/cuerpo/<icono>` del servidor.
- El numero de variante **crece con el tamano**: `_00` el mas estrecho, `_03` el
  mas ancho (O-82).
- Donde NO esta la complexion, ya descartado (O-82).

Dos cosas nuevas que aporto Aaron y conviene no perder:

1. **Esa pantalla del juego no usa la camiseta del equipo.** En sus capturas,
   jugadores de equipos distintos llevan todos la misma camiseta blanca con
   naranja. Asi que el cuerpo no sale por la via del equipo, y por eso ninguna de
   las opciones que se le ofrecieron encajaba.
2. **"O el tamano de la imagen del cuerpo es mas pequena que la de la cara".**
   Pista sin comprobar: puede que cara y cuerpo no vayan a la misma escala y haya
   que ajustar uno de los dos antes de superponerlos. Se dio por hecho que
   encajaban tal cual porque *parecian* encajar.

Tambien se aclaro que las prendas que empiezan por `o` y `f` son abrigos y trajes
de **gerentes y entrenadores**, no equipaciones.

### O-84 · Las tacticas no son objetos de mochila
La interfaz ensenaba una pestana "Tacticas" que decia "no tienes ninguna", y
Aaron aviso de que si tiene varias.

Comprobado: de las 86 tacticas del catalogo, **ninguna** aparece como fila del
inventario. Pero **11 de las 86 si aparecen dentro de la partida**, hasta ocho
veces cada una, asi que existen; lo que pasa es que viven en otro sitio, casi
seguro dentro de los equipos, que es donde el juego las equipa.

Se quitaron de la mochila. Editarlas sera parte de tocar equipos, que es un area
que todavia no se ha abierto.

Leccion: una lista vacia no siempre significa "no hay"; puede significar "estas
mirando donde no es". Aqui lo canto el usuario, pero la comprobacion (buscar el
identificador en toda la partida, no solo en las filas del inventario) se podia
haber hecho antes de ensenar la pestana.

### O-85 · Los iconos de objeto no estan en `02_icon_item`
Esa carpeta solo tiene **diez** ficheros, y no son los objetos: son los iconos
**genericos de categoria** (una medalla, una bebida, unas botas, un brazalete, un
colgante, una camiseta, una chaqueta, un libro), los que el juego usa en la barra
de pestanas de la mochila.

El arte de cada objeto esta en otra carpeta que no aparecio en dos sondeos de
paquetes al azar, asi que se lanzo una extraccion que se trae **todo
`data/dx11/menu/`** para dar con ella.

### O-86 · Las judias se llaman como los stats, y son los mismos siete
Los tipos de judia no son una lista aparte: **son los siete stats**, con los
mismos nombres y en el mismo orden que usan las tablas de crecimiento del juego:

| valor | judia / stat |
|---|---|
| 0 | Potencia |
| 1 | Control |
| 2 | Tecnica |
| 3 | Presion |
| 4 | Fisico |
| 5 | Agilidad |
| 6 | Inteligencia |

Lo conto Aaron y encaja con lo que ya habia: tres de los siete estaban puestos a
ojo y marcados como supuestos, y el que llevaba Joseph King en la ranura 3 se
adivino como "Velocidad" cuando era **Agilidad**, que es el valor 5.

### O-87 · Los stats se calculan, no se guardan
La partida **no lleva los stats**. El juego los calcula, y ahora el editor
tambien:

    stat = base del personaje a su nivel  +  judias  +  equipacion

- **La base** sale de `growth_table_config`. `m_growthTableMainList` da los siete
  stats **a nivel 50 y a nivel 99**, y `m_growthTableLv1List` y
  `m_growthTableLv30List` los de nivel 1 y 30. La fila de cada personaje se
  encuentra con tres numeros de su `chara_param` (columnas 3, 7 y 9): posicion,
  patron de crecimiento y rango. **Resuelve 6.156 personajes.**
  Ojo: las tablas de nivel 1 y 30 guardan esa clave en otro orden, asi que el
  constructor prueba las seis ordenaciones y se queda con la que encuentra a mas.
- **Las judias** suman **+1 cada una** al stat de su tipo.
- **La equipacion** suma lo que dicen las tablas de objetos: la fila corta que va
  detras de cada objeto son sus siete bonus, en el mismo orden. **467 objetos.**

A nivel 1, 30, 50 y 99 el numero es exacto porque esta tabulado; entre medias se
interpola en linea recta, y **eso es una aproximacion**: el juego puede usar otra
curva. La interfaz lo dice debajo del panel en vez de aparentar exactitud.

Lo que aun NO entra en la cuenta y puede hacer que no cuadre con el juego: el
tablero de crecimiento, las pasivas que suben stats, y la rareza.

### O-88 · Los iconos de afinidad, localizados en la lamina comun
Estan en `15_icon_common`, mezclados con otros cien. Se encontraron partiendo la
lamina en manchas de pixeles que se tocan, quedandose con las piezas cuadradas de
tamano parecido, y comparando con las capturas que mando Aaron. Son cuatro
cuadrados redondeados: verde con hojas (Bosque), rojo con llama (Fuego), naranja
con montana (Montana) y azul con remolino (Viento).

Recortados a `datos/iconos/recortes/elemento/`.

### O-89 · El color de cada rareza sale de su propia banda
La interfaz pintaba las fichas con colores elegidos a ojo y la franja de la ficha
siempre naranja. En el juego **la franja lleva el color de la rareza del
jugador**: verde un comun, rojo un Idolo.

Los colores no hay que inventarlos: se sacan de las bandas de rareza recortadas
del propio juego, cogiendo el color dominante de cada una. Para que salga el
bueno hay que descartar sombras y bordes (agrupando por tono y saturacion en
HSV), porque el color mas repetido a secas es el negro del contorno de las letras.

| Rareza | Color |
|---|---|
| Comun | `#51d447` |
| Emergente | `#4b99f0` |
| Elite | `#a64be7` |
| Estrella | `#f4e03b` |
| Leyenda | `#dd7206` |
| Idolo roja | `#9e0a02` |
| Idolo plateada | `#8fabbe` |
| Idolo rosa | `#ef4fe3` |
| Diamante | `#bdbfd4` |

### O-90 · La trama de las fichas esta en `menu/101_member`
El fondo de cada ficha de jugador no es color plano: lleva una trama de puntos.
Esta en `101_member/member01_00.png`, y el juego la tinta con el color de la
rareza. En la interfaz se guarda pasada a blanco con transparencia
(`recortes/fondo/trama.png`) para poder tintarla igual.

Se encontro extrayendo **todo `data/dx11/menu/`** en vez de solo los iconos:
27.003 imagenes y 3,2 GB, con 41 carpetas de pantalla. Ahi aparecio tambien
`103_item`, que es donde esta el arte de los objetos.

### O-91 · Los stats van SIEMPRE a la izquierda
Colocacion del juego, comprobada en las cuatro capturas de la ficha: el panel de
stats ocupa la columna izquierda **en todas las secciones** y a la derecha cambia
el contenido (atributos, supertecnicas, equipacion, pasivas). Dentro del panel:
Potencia arriba, Tecnica y Control a los lados, Inteligencia y Presion debajo,
Agilidad y Fisico abajo, y la telarana en el centro.

### O-92 · La frase de presentacion de cada personaje
La que sale bajo el nombre en la ficha del juego ("Le llaman 'el rey de los
porteros'..."). Vive en `text/es/chara_description_text.cfg.bin`, indexada por un
numero que trae la **columna 19 de `chara_base`**.

Esa columna se encontro probandolas todas contra las claves del fichero de
textos: la 19 encuentra 5.787 de 7.224 y ninguna otra pasa del 30 %. Salen
**6.041 descripciones**.

### O-93 · EQUIVOCADO · La rareza no elige fila, multiplica (ver O-114)
**Esto estaba mal.** La tabla si tiene 48 filas, pero el tercer componente de la
clave **no es la rareza**: es el rango de fabrica del personaje, y la rareza entra
como multiplicador al final. La formula buena esta en **O-114**. Se deja escrito
lo que se creia porque explica por que los numeros salian bajos durante semanas.

Lo que se creia:

| familia | valores de la columna 9 |
|---|---|
| normal | 0, 1, 2, 3, 4 — las cinco rarezas que se suben |
| hero (Idolo) | 4 |
| fabled (Diamante) | 5 |

Y los numeros suben con el rango. Para una misma posicion y patron, a nivel 99:

| rango | Potencia |
|---|---|
| 0 | 177 |
| 3 | 182 |
| 4 | 218 |
| 5 | 261 |

O sea que **subirle la rareza a un jugador le sube los stats**, y el salto gordo
esta entre el 3 y el 4 y entre el 4 y el 5.

Consecuencia: el calculo usa **la rareza que tiene el jugador en la partida**, no
la que trae el personaje de fabrica. Antes se usaba la de fabrica y los numeros
salian mal para todo el que hubiera subido de rareza.

Las tablas de nivel 1 y 30 guardan la clave **en otro orden** (0,2,1 en vez de
0,1,2) y solo cubren 24 de las 48 filas; donde faltan, se interpola entre 50 y 99.

**Sin verificar en el juego.** Aaron deberia comparar un jugador concreto con lo
que ensena su ficha. Lo que falta para que cuadre del todo: el tablero de
crecimiento y las pasivas que suben stats.

### O-94 · CORREGIDO · Dos errores tontos de imagen
**La trama de las fichas salia invisible.** Se calculo el alfa a partir del color
(`255 - min(r,g,b)`), y la trama del juego **no esta en el color: esta en el canal
alfa**, que va de 0 a 79. El resultado salio justo al reves, opaco entero, y por
eso se veia color plano. Se saca del alfa, multiplicado por 3,2 para que luzca.

**Los iconos de afinidad eran de dos familias distintas.** La lamina trae varias
versiones de cada elemento: unas con fondo saturado y otras con fondo claro.
Fuego y Bosque se cogieron de la saturada y Montana y Viento de la clara, asi que
a 18 px los dos primeros se veian y los otros dos no. Los cuatro tienen que ser
de la misma familia.

Leccion comun a los dos: **mirar el resultado al tamano al que se va a usar**.
Los dos fallos se ven a simple vista en una tira de 20 px y ninguno mirando el
fichero suelto.

### O-95 · El arte de cada objeto no esta en el menu (cerrado en O-103)
Se extrajo **todo `data/dx11/menu/`** (27.003 imagenes, 3,2 GB, 41 carpetas) y no
aparece. `02_icon_item` solo tiene **diez** iconos y son **genericos de
categoria**: una medalla, una bebida, unas botas, un brazalete, un colgante, una
camiseta, un collar, una chaqueta y un libro. Son los de la barra de pestanas de
la mochila.

De momento la mochila usa el generico de su categoria, que ya es mucho mejor que
nada, mas el bonus del objeto escrito debajo. **Y va a quedarse asi**: en O-103
se busco en el juego entero y no existe.

Los espiritus **si** tienen icono propio, y desde entonces se ha encontrado como
se enlazan: esta en **O-102**. La pista que faltaba era que `wks00020` no es el
icono pero **si lleva dentro su numero**, y que armaduras y mixis van por el
personaje.

### O-96 · CORREGIDO · El tablero SI da stats, y es lo que falta
Antes aqui ponia lo contrario. Estaba **mal**, y lo desmonto Aaron con tres
capturas del mismo jugador (Alex Zabel, nivel 99, Leyenda del futbol):

| | con todo | con equipacion, sin judias | pelado |
|---|---|---|---|
| Potencia | 584 | 404 | **279** |
| Control | 544 | 364 | **260** |
| Tecnica | 449 | 269 | **229** |
| Presion | 184 | 184 | **184** |
| Fisico | 180 | 180 | **180** |
| Agilidad | 180 | 180 | **180** |
| Inteligencia | 200 | 200 | **200** |

Restando sale que **las judias y la equipacion estan exactas**: +180 en las tres
que lleva, y de equipacion +125 Potencia, +104 Control, +40 Tecnica, que es
justo lo que calcula el editor.

Lo que no cuadra es **la base**. La tabla de crecimiento da 233/221/202/169/163/
163/179 para (posicion 2, patron 1, rango 4), y el juego ensena 279/260/229/184/
180/180/200. Faltan:

    +46 Potencia  +39 Control  +27 Tecnica  +15 Presion
    +17 Fisico    +17 Agilidad  +21 Inteligencia     = 182 puntos

Y Aaron mando la cuarta captura: el **arbol de habilidades** tiene casillas de
"Potencia +3", "+5" y demas. Cada personaje tiene **dos ramas y solo se puede
elegir una**, asi que no se suman las dos.

**Por que la conclusion anterior era falsa**: se busco el hash de cada stat en la
columna 0 de `ABILITY_LEARNING_BOARD_EFFECT_LIST` y solo aparecia tres veces. De
ahi se dedujo que el tablero no daba stats. Lo que en realidad dice ese dato es
que **las casillas de stat no se guardan ahi**, no que no existan. Leccion:
"no lo encuentro en la tabla que miro" no es "no existe"; para decir que algo no
existe hace falta haber mirado en todo (como en O-103).

Lo que si esta encontrado del tablero:

- En la partida, el campo de **60 bytes `0xBB459017`** es el mapa de casillas
  cogidas. Alex Zabel tiene las 0-17 y las 28-33: **24 casillas**.
- `ABILITY_LEARNING_BOARD_INFO_LIST` son parejas de lineas: `(id, id2)` y
  `(desde, cuantas)`, un tramo dentro de `..._BOARD_EFFECT_LIST`. Los tramos
  encajan uno detras de otro sin huecos.
- `..._LOCK_LEVEL_INFO_LIST` dice a que nivel se abre cada casilla: la 0 al 1, la
  1 al 7, la 2 al 13... hasta la 16 al nivel 50.
- `..._BOARD_SHAPE_PIECE_EFF_LIST` es la **rejilla dibujada**: numeros pequenos
  donde hay casilla y hashes donde hay tuberia de union (lo confirma
  `..._PIECE_DIR_LIST`, que en esos mismos sitios lleva direcciones 1-15).
- `..._TYPE_INFO_LIST` son 72 filas = 4 x 3 x 6, con **dos posiciones distintas**
  por fila. Encaja con las etiquetas que el juego pone a cada stat en la ficha
  (Potencia `[DC]`, Tecnica `[DC][MC]`, Presion `[POR][DF]`...).

Lo que falta: **de donde sale el "+3" de cada casilla**. Con 24 casillas y 182
puntos salen 7,6 por casilla, asi que o hay casillas de mas valor que las de +3 y
+5, o parte de esos 182 no viene del arbol.

**Lo mas barato para cerrarlo**: que Aaron mande el arbol de Alex Zabel entero,
viendose cuales tiene cogidas. Sumando sus "+N" se sabe en un minuto si el arbol
explica los 182 o si falta otra cosa.

Mientras tanto el editor **lo dice**: la nota bajo los stats avisa de que falta el
arbol y de que en el juego se vera algo mas alto. Nunca se ensena un numero como
exacto cuando no lo es.

### O-97 · CORREGIDO · Los objetos con numeros absurdos
"Guantes del abuelo: Potencia +1130486001". La tabla de objetos **no** alterna
siempre objeto/bonus: hay objetos sin fila de bonus, y darlo por hecho
descuadraba todo lo que venia detras, asi que se leia la cabecera de otro objeto
como si fuera un bonus. Ahora se empareja por **ancho de fila**: la fila larga es
el objeto y la de diez columnas que venga justo detras es su bonus.

### O-98 · Los marcadores `<FUL:ENDO>` de los textos
La clave es el **apellido en romaji en mayusculas**, y esta en
`chara_text_roma.cfg.bin`; la misma clave en `chara_text.cfg.bin` da el nombre
traducido. Los prefijos eligen que parte: FUL/FLA/FLC el nombre completo,
FST/FFS/FFC el nombre, LST/LAF/LFC el apellido. Cuando una clave la reclaman
varios personajes (hay varios "Endo") se pone **solo el apellido**, que es comun
a todos y por tanto nunca es mentira.

### O-99 · CORREGIDO · Destin Billows no tenia foto
La tabla de caras salia de `jugadores.csv`, que solo trae a los **alineables**.
El avatar de Aaron va de entrenador, no tiene arbol de tecnicas y por eso no
estaba, aunque su imagen (`c11010010`) si existe. Ahora se saca de `chara_base`
entero: 5.908 personajes.

### O-100 · CORREGIDO · 154 personajes salian con su numero en vez del nombre
El editor ensenaba cosas como "2772BDE3". Los nombres se cogian del volcado a
**sqlite** del datamineador, y ese volcado viene incompleto. Leyendo directamente
`chara_text.cfg.bin` con el volcador salen todos: quedan 50 sin nombre de 6.151,
y esos no lo tienen tampoco dentro del juego.

Ejemplo: `2772BDE3` es **Bestia Negra**, la identidad falsa de Beta.

### O-101 · Los marcadores `<MNT:...>` son sitios y equipos
Funcionan igual que los de persona, pero con otra pareja de ficheros:
`map_text_roma.cfg.bin` da el romaji y `map_text.cfg.bin` el nombre traducido.

| marcador | sale como |
|---|---|
| `<MNT:NAGUMOHARA>` | South Cirrus |
| `<MNT:SHIROSHIKA>` | Ciervo Blanco |
| `<MNT:TENMAS>` | Arions |

**Ojo con mezclarlos**: NAGUMOHARA es a la vez un sitio y parte del nombre de
varios personajes. Al meterlos en la misma lista la casilla se quedaba vacia,
porque el desempate de personas ("si hay duda, solo el apellido") no encontraba
apellido comun. Por eso la tabla lleva una columna `tipo` y cada prefijo busca en
la suya.

Quedan sin resolver `TEAMK` y `KINUNS`, que no aparecen en esos ficheros.

### O-102 · Cada espiritu SI tiene su icono, y asi se encuentra
En `aura_skill_config`, `AURA_CMD_INFO_LIST`:

- columna 1: el modelo (`wkd00200`, `wad00200`, `wsd000040`, `wmm00010`)
- columna 8: el **rango** del espiritu, de 1 a 5
- columna 10: la **familia**
- columna 13: la **identidad del personaje** al que pertenece

| columna 10 | modelos | familia | de donde sale su imagen |
|---|---|---|---|
| 0 | `wk*` | kenshin | `aura_fs/k<numero>_l.png` |
| 1 | `wa*` | armadura | `aura_armed/<modelo del personaje>_l.png` |
| 2 | `wmm` | mixi | la **cara** del personaje con el que se hace |
| 3 | `ws*` | alma | `aura_soul/a<numero>_l.png` |

El numero sale del propio nombre del modelo: `wsd000040` -> `a000040_l.png`. Las
56 almas cuadran exactas, y los kenshin 99 de 103.

Para armadura y mixi la carpeta no vale: hay que ir por el personaje. Su
identificador de modelo (`c04003240_5100`) **ya trae dentro el sufijo del
traje**, asi que el fichero se llama igual que el, como pasa con las caras.

Resultado: **413 de 443 espiritus con imagen propia**. Antes salian todos con la
misma medalla generica, y como varios comparten nombre ("Alfil blanco" es
kenshin, y tambien dos armaduras distintas) parecian repetidos.

### O-103 · CERRADO · La equipacion NO tiene arte por objeto. No existe.
Aaron pedia que cada objeto de la mochila tuviera su propio dibujo. **No lo
tiene ninguno**, y esto ya no es "no lo encuentro": esta comprobado sobre el
juego entero.

Se hizo el **indice completo**: `herramientas/listar_archivos.py` abre los 936
paquetes por tandas de 3 GB y apunta la ruta de todo lo que hay dentro. Salen
**255.303 ficheros** en `datos/juego/listado.txt` (14 MB). Con eso:

- **ni un solo fichero** tiene `eq_` en el nombre, y `eq_sh110001`,
  `eq_mi0100101`, `eq_ac0100101` y `eq_sp0100101` son justo las cadenas que cada
  objeto lleva en su tabla. Si hubiera imagen, se llamaria asi.
- `200_icon/02_icon_item` tiene **exactamente diez** ficheros, que son los
  genericos de categoria (medalla, bebida, botas, brazalete, colgante, camiseta,
  collar, chaqueta, libro).

O sea que el juego dibuja la equipacion con el icono de su categoria, igual que
hace el editor. Lo que **si** tiene imagen propia es cada espiritu, y eso ya esta
puesto (O-102).

**El indice se queda para siempre.** Cualquier busqueda futura en los archivos
del juego es ahora un `grep datos/juego/listado.txt` de un segundo, en vez de
volver a abrir 61 GB.

### O-104 · Los siete numeros de los stats, resueltos
Eran los "siete hashes" que llevaban semanas sin identificar. No hizo falta
adivinar el algoritmo: se resolvieron **cruzando dos cosas que ya estaban**.

1. `ABILITY_LEARNING_BEANS_INFO_LIST` tiene una fila por posicion con **los tres
   tipos de judia que admite**, en forma de hash y en un orden fijo.
2. En la partida de Aaron, mirando los 3.037 jugadores, cada posicion usa
   siempre las mismas tres ranuras de judia y en el mismo orden:

| posicion | ranura 0 | ranura 1 | ranura 2 |
|---|---|---|---|
| POR (columna 1) | 6 | 4 | 3 |
| DEL (columna 2) | 0 | 1 | 2 |
| MED (columna 3) | 2 | 1 | 5 |
| DEF (columna 4) | 5 | 3 | 4 |

Poniendo las dos tablas una al lado de la otra, las cuatro filas dan **la misma
respuesta sin contradecirse**:

| hash | indice | stat |
|---|---|---|
| 3377206738 | 0 | Potencia |
| 1346716776 | 1 | Control |
| 658666750 | 2 | Tecnica |
| 3106333021 | 3 | Presion |
| 3458322891 | 4 | Fisico |
| 539996391 | 5 | Agilidad |
| 1462272113 | 6 | Inteligencia |

Y de paso queda confirmado el orden de los tipos de judia, que hasta ahora era un
supuesto con solo dos valores comprobados (O-86). Tiene sentido futbolistico: el
delantero recibe Potencia, Control y Tecnica; el portero Inteligencia, Fisico y
Presion; el defensa Agilidad, Presion y Fisico.

**Lo que no demuestra**: que el indice 0 se llame "Potencia" y no otra cosa. Eso
sigue apoyandose en los nombres de las judias del juego. Si algun dia sale un
numero raro, esto es lo primero que hay que mirar.

Tambien queda confirmado que la columna 3 de `chara_param` es la posicion:
1 = POR, 2 = DEL, 3 = MED, 4 = DEF.

### O-105 · A un Idolo solo se le heredan pasivas de otro Idolo
Lo dijo Aaron. `escribir.poner_heredada` ya lo impedia, pero **la lista las
ensenaba todas** y eso va contra la regla 1 del proyecto: las opciones se
generan con la regla puesta, no se ensenan para luego rechazarlas.

La lista buena es `pasivas-hero.csv` (51 pasivas). Se comprobo contra la partida:
las **cinco** pasivas heredadas que Aaron tiene puestas en Idolos estan las cinco
en esa lista. Los nombres de verdad salen de los textos de la partida, porque en
el CSV vienen como "Hero Passive 01".

A los jugadores normales se les quitan de la lista las de Idolo, por simetria.
**Sin confirmar**: si el juego deja heredar una pasiva de Idolo a un jugador
normal. Si se puede, hay que quitar ese filtro.

### O-106 · El AT y el elemento de cada tecnica
En `m_skillInfoList`:

| Col | Que es |
|---|---|
| 10 | TP que cuesta |
| 11 | **AT**, el poder que ensena el juego |
| 12 | elemento: 1 Viento, 2 Bosque, 3 Fuego, 4 Montana |

Comprobado con una captura de Aaron: *Tiro potente* AT 200, *Tormenta de fuego*
AT 440 y *Torbellino de fuego* AT 540, y la tabla da exactamente esos numeros. El
elemento cuadra por los nombres (todas las "de fuego" caen en el 3) y usa la
misma numeracion que ya tenian los jugadores.

De paso se arreglo un fallo tonto: el volcador quitaba **siempre** la primera
linea, y `m_skillInfoList` no trae cabecera de recuento, asi que faltaba una
tecnica (*Inazuma Drop*). Es el mismo fallo que con los uniformes (O-79). Ahora
se quita la primera linea solo si de verdad parece una cabecera.

### O-107 · Una pasiva heredada puede ocupar VARIAS ranuras
Salio al montar los filtros de la lista: **52 jugadores** de la partida de Aaron
tienen las cinco ranuras de heredada ocupadas. Mirando una:

    ranura 1  heredada A3D9E511  Valor de foco +...
    ranura 2  heredada A3D9E511  (la misma)
    ranura 3  heredada A3D9E511  (la misma)
    ranura 4  heredada 5590EE4C  Por cada rango de Conf. Justicia...
    ranura 5  heredada 5590EE4C  (la misma)

Cinco ranuras llenas pero **dos pasivas distintas**. O sea que el campo no guarda
"una heredada por ranura": guarda, para cada ranura, cual la esta tapando, y una
misma puede tapar varias.

**Que estaba mal por esto**: se contaban ranuras ocupadas, asi que a esos 52 el
editor les decia "ya lleva las 3 que caben" cuando en realidad llevan dos.
Corregido en `opciones.heredadas`, `escribir.poner_heredada` y en el filtro de la
lista: ahora se cuentan las **distintas**.

**Sin confirmar**: si al heredar en el juego se eligen las ranuras que tapa o lo
decide el juego solo. Escribir sigue tocando una ranura cada vez, que es como
Aaron lo probo y le funciono (P-08).

### O-108 · CORREGIDO · La longitud de un campo son 3 bytes, no 4
El lector de campos daba por hecho que los 4 bytes de detras del hash eran la
longitud. En casi toda la partida funciona porque el cuarto byte es 0, pero en la
zona de equipos no lo es y el lector se estrellaba con "longitudes" de 50 millones.

La forma de verdad es:

    [hash 4] [longitud 3] [tipo 1] [datos...]

Y cuando **tipo no es 0, el campo no lleva datos detras**: los tres bytes de la
longitud son el propio valor. Se ve clarisimo en la lista de jugadores de un
equipo, donde el marcador de cada hueco es un campo de tipo 3 o 4 sin datos.

Con esta regla el registro de un equipo se lee entero y **termina justo donde
empieza el siguiente**, 180 campos despues. Antes se leian 12.

### O-109 · Los equipos de la partida, mapeados
Hay **49 huecos de equipo**. Se encuentran por el hash del nombre,
`0xE9E94266` (128 bytes). Los dos primeros son de la historia
(*Secundaria South Cirrus*, *Club de futbol de South Cirrus*); el resto son los
que se hace uno. Aaron tiene ECLIPSE (dos veces), ESPANA, ZeusAllStars, SHINOBI,
gordos, Abolla2VR, calvos y Good Losers.

Cada equipo ocupa unos 1.989 bytes y el nombre va **al final**. Lo que se ha
identificado dentro, todo comprobado contra su captura del equipo ECLIPSE:

| Campo | Que es |
|---|---|
| `0xE9E94266` (128) | **nombre** del equipo |
| `0xFD88F528` (16) | las **tres tacticas**, en 4 huecos |
| `0x292566C1` (4) | el **escudo** (sale en `ITEM_EMBLEM_INFO_LIST`) |
| `0x21DB3FB1` (4) | el **entrenador**, por identidad de personaje |
| `0x7E263C6F` (4) | el **capitan**, por slot de jugador |
| `0x98356E87` | marcador de hueco de plantilla, **30 huecos** |
| `0x3A0D9419` (4) | el **jugador** de ese hueco (su slot) |
| `0x70730B76` (2) | su **dorsal** |
| `0x709A88E9` (1) | **donde juega**: 0 el portero, 1-10 el resto, y del 16 en adelante entrenador y gerentes |
| `0xF863CD5D` (16) | cuatro slots de jugador, sin identificar |
| `0x0589A19B` `0xA8E04439` `0x627F2D54` `0x58C985AC` | cuatro valores de 4 bytes sin identificar; entre ellos deben estar la **formacion** y la **equipacion** |

La prueba de que esta bien leido: las tres tacticas salen *Formacion caparazon*,
*Aislar al jugador clave* y *Supresion inquebrantable*, que son exactamente las
de su captura; el entrenador sale **Briar Bloomhurst**; el capitan, **Mark
Evans**; y la plantilla son sus 30, con los cuatro Briar en los huecos 16 a 19,
que son el entrenador y los gerentes.

**Antes de tocar nada** hay que resolver la formacion y la equipacion, y dejar
los dos primeros equipos bloqueados por ser de la historia.

### O-110 · Las casillas de stat del arbol son PASIVAS
El "+3 Potencia" del arbol no es un numero suelto: es una **pasiva** de
`passive_skill_config`, y hay **siete familias de diez niveles**:

| interno | stat |
|---|---|
| `ps200xx` | Potencia |
| `ps201xx` | Control |
| `ps202xx` | Tecnica |
| `ps203xx` | Presion |
| `ps204xx` | Fisico |
| `ps205xx` | Inteligencia |
| `ps206xx` | Agilidad |

En `ABILITY_LEARNING_BOARD_EFFECT_LIST` esas pasivas aparecen como una casilla
mas del tablero. Y el nivel al que se abre cada casilla sale de
`..._LOCK_LEVEL_INFO_LIST`: casilla 0 al nivel 1, 1 al 7, 2 al 13, 3 al 16,
4 al 20, 5 al 23, 6 al 26, 7 al 28, 8 al 30, 9 al 35, 10 al 38, 11 al 40,
12 al 43, 13 al 45, 14 al 47, 15 al 48, 16 al 50.

Eso **cuadra exactamente** con las capturas de Aaron: sus casillas de stat estan
en los niveles 23, 26, 35, 45 y 48, o sea las casillas 5, 6, 9, 13 y 15.

**Lo que aun falta**: el numero. Las pasivas `ps2xxxx` no tienen fila de efecto,
asi que el "+3" no esta en ellas. La pista que queda sin seguir es
`..._TYPE_INFO_LIST`: 72 filas = 4 x 3 x 6, con **dos posiciones distintas** por
fila, que encaja con las etiquetas que el juego pone a cada casilla
(`[DC]`, `[DC][MC]`, `[DF][MC]`) y deja seis valores posibles. Aaron vio tres:
+3, +5 y +7.

### O-111 · El arbol se parte en dos ramas, y eso esta en la partida
El campo de 60 bytes `0xBB459017` marca con un 1 cada casilla cogida. Mirando los
3.037 jugadores de la partida, **solo se usan los indices 0 a 39** y se reparten
en tres tramos:

| tramo | casillas | lo usan |
|---|---|---|
| 0-17 | tronco comun | todos, y se llena en orden |
| 18-27 | una rama | 64 jugadores |
| 28-39 | la otra rama | 436 jugadores |

Alex Zabel tiene el tronco entero (0-17) y seis casillas del tramo 28-33, que es
la rama que Aaron dice tener activa (la de su propia posicion).

Y en `jugadores.csv` el corte se ve igual de claro: las tecnicas **r1, r2 y r3**
son del tronco (niveles 1, 13 y 20) y luego hay **dos grupos de tres** con los
mismos niveles (30, 38 y 43): r4-r6 por un lado y r7-r9 por otro. Son las dos
ramas. Eso es lo que pide Aaron: que solo se puedan tocar las tecnicas de la rama
elegida.

### O-112 · El "+N" de cada casilla del arbol depende de LA CASILLA
Aaron mando el arbol de Alex Zabel (delantero) y el de Mark Evans (portero), cada
uno con sus dos ramas. Poniendolos uno al lado del otro sale clarisimo:

| casilla | nivel | Zabel rama 1 | Zabel rama 2 | Mark rama 1 | Mark rama 2 |
|---|---|---|---|---|---|
| 5 | 23 | Potencia **+3** | — | Agilidad **+3** | — |
| 6 | 26 | Control **+5** | — | Fisico **+5** | — |
| 9 | 35 | Potencia **+3** | Tecnica **+3** | Agilidad **+3** | Potencia **+3** |
| 13 | 45 | Control **+5** | Control **+5** | Fisico **+5** | Control **+5** |
| 15 | 48 | Potencia **+7** | Inteligencia **+7** | Agilidad **+7** | Potencia **+7** |

Cuatro arboles distintos, cuatro stats distintos, **siempre los mismos numeros**:

    casilla  5 -> +3      casilla  6 -> +5      casilla  9 -> +3
    casilla 13 -> +5      casilla 15 -> +7

O sea que el valor lo pone la **casilla** y la pasiva `ps2xxxx` solo dice **que
stat** sube. Eso explica que tres pasivas de "nivel 01" distintas valgan +3, +5 y
+7 cada una.

**Pero no cuadra con los stats.** Con esas cinco casillas, el arbol de Zabel le da
**+13 Potencia y +10 Control**, 23 puntos en total. Y lo que falta para llegar a
lo que ensena el juego son **182**. Asi que el arbol explica una octava parte: hay
otra cosa que suma unos 160 puntos y que todavia no esta encontrada.

Lo que **queda descartado**: que sean mas casillas de stat. Con casillas de 3, 5 y
7 harian falta mas de 26, y Zabel solo tiene 24 casillas cogidas **contando las de
tecnica**.

### O-113 · CORREGIDO · El tramo del mapa de casillas no dice que rama es
Se habia dado por hecho que el tramo 18-27 era una rama y el 28-39 la otra. **Es
falso**, y lo pillo Aaron: en Alfonso Iniguez y en Asuna Sugami el editor ensenaba
abierta la rama que el tiene cerrada, y al reves; en cambio en los Idolos salia
bien.

Mirando los 3.037 jugadores se ve por que:

| rareza | tramo que usa |
|---|---|
| 0-4 y 8 (normales y Diamante) | **28-39** |
| 5, 6 y 7 (Idolos) | **18-27** |

De 470 jugadores con rama elegida solo **uno** se sale de ahi. Asi que el tramo no
lo elige el jugador: **lo elige el tablero del personaje**, y los Idolos tienen
otro tablero distinto. Cual de las dos ramas ha cogido esta en **que casillas
concretas** marca dentro de su tramo, y eso no se puede saber sin tener el
tablero del personaje.

Por eso el editor ya **no dice** cual esta abierta: ensena el arbol partido en
tronco (ranuras 1-3), rama 1 (4-6) y rama 2 (7-9), cuenta las casillas que tiene
cogidas y avisa de que aun no sabe leer cual de las dos eligio. **Mejor callarse
que decirlo al reves.**

Lo que falta para cerrarlo: **el enlace entre un personaje y su tablero**. Lo que
ya se descarto: la columna 10 de `chara_param` (solo la tienen 187 personajes de
6.166), la 11, y cualquier columna de `chara_base`.

### O-114 · RESUELTO · La formula de los stats
Llevaba semanas sin cuadrar. Con un Alex Zabel de nivel 1 que mando Aaron salio
entero. **Habia dos errores a la vez**, y por eso no se veia:

**1. El rango de la tabla NO es la rareza.** Es la **columna 9 de `chara_param`**,
que trae el personaje de fabrica y no cambia nunca. Zabel es rango 0.

**2. La rareza multiplica.** Un *Leyenda del futbol* (rareza 4) multiplica por
**1,4**, y la parte decimal **se corta, no se redondea**.

**3. Cada tabla se busca con su clave**, y no son la misma:

| tabla | clave | filas |
|---|---|---|
| `m_growthTableMainList` (niveles 50 y 99) | posicion, patron, rango | 4 x 2 x 6 = 48 |
| `m_growthTableLv1List` | posicion, **posicion secundaria**, rango | 12 x 3 = 36 |
| `m_growthTableLv30List` | posicion, posicion secundaria, patron, rango | 12 x 2 x 6 = 144 |

La formula entera:

    stat = parte_entera( base(clave, nivel) x multiplicador(rareza) )
           + arbol + judias + equipacion

**La comprobacion**, con Alex Zabel (posicion 2, secundaria 3, patron 1, rango 0,
rareza 4):

| | nivel 1 | nivel 99 |
|---|---|---|
| tabla | 13 14 12 10 10 9 11 | 190 179 164 132 129 129 143 |
| x1,4 | **18 19 16 14 14 12 15** | **266 250 229 184 180 180 200** |
| el juego | 18 19 16 14 14 12 15 | 279 260 229 184 180 180 200 |

A nivel 1, **las siete exactas**. A nivel 99, cinco exactas y dos cortas en 13 y
10, que es justo lo que le da su arbol (+13 Potencia y +10 Control). Y de rebote
cuadra con Zanark Avalonic: la diferencia sale +3/+10/+3/+7, que son casillas de
+3, +5 y +7.

**Lo que falta**: repartir los ~23 puntos del arbol entre los stats. Se sabe
cuanto da cada casilla (O-112), pero no a que stat va cada una sin tener el
tablero del personaje.

**Sin comprobar**: el multiplicador de las demas rarezas. El 1,4 esta medido; el
resto (1,0 / 1,1 / 1,2 / 1,3 y los de Idolo y Diamante) siguen la escalera que
encaja, pero hace falta comprobar uno de cada.

### O-115 · PROBADO · Como cambia el juego de rama del arbol
Aaron cambio la rama de **Zanark Avalonic** dentro del juego y guardo la partida.
Comparando la de antes con la de despues cambian **79 bytes**, y tres cosas
importan:

1. El campo **`0x72479F6E`** (4 bytes) pasa de **0 a 1**. Es el que dice que rama
   se juega: **0 la primera, 1 la segunda**.
2. En el mapa de casillas (`0xBB459017`, 60 bytes) las casillas cogidas **se
   mudan** de un tramo al otro, las mismas y en el mismo orden.
3. Las supertecnicas de la rama que se cierra **se caen** de la seleccion.

Y con eso el mapa queda entendido del todo:

| casillas | que son |
|---|---|
| 0-7 | tronco: lo que tiene siempre |
| 8-17 | **rama 1**, las tecnicas de las ranuras 4, 5 y 6 |
| 18-27 | **rama 2**, las de las ranuras 7, 8 y 9 |
| 28-39 | un tercer tramo comun a las dos, sin identificar |

Esto corrige O-113, que decia que el tramo dependia del personaje: era que los
limites estaban mal puestos (se creia que el tronco llegaba hasta la 17).

`escribir.cambiar_rama` reproduce el cambio **byte a byte**: aplicado a la partida
de antes da exactamente la de despues.

### O-116 · Los multiplicadores de rareza, medidos
Aaron mando seis jugadores de distintas rarezas a nivel 99 **sin judias ni
equipacion**, que es la forma limpia de medirlo. Comparando con la tabla:

| rareza | jugador | multiplicador | como quedo |
|---|---|---|---|
| 0 Futbolista comun | Serene Goldwell | **1,0** | exacto |
| 1 Futbolista emergente | Amelia Rainwalker | **1,1** | exacto |
| 2 Futbolista de elite | Alara Belmont | **1,2** | exacto |
| 3 Futbolista estrella | — | 1,3 | deducido de la escalera |
| 4 Leyenda del futbol | Alex Zabel | **1,4** | exacto |
| 5 Idolo | Sergi Hernandez | **1,4** | exacto en los cuatro stats limpios |
| 8 Diamante | Mayen Harmet | **no cuadra** | ver abajo |

En los cinco medidos, los stats que **no** reciben nada del arbol salen clavados,
y los que si reciben quedan cortos justo en +3, +5 o +7, que son los valores de
casilla (O-112). O sea que la formula esta bien y lo unico que falta es repartir
las casillas del arbol.

**El Diamante no sigue esta cuenta.** Se probaron las **144 filas x 160
multiplicadores** contra un Mayen Harmet de Diamante y no encaja ninguna
combinacion. Mientras no se sepa, el editor **dice que no lo sabe** en vez de
ensenar un numero que estaria mal.

### O-117 · Un Diamante es el MISMO personaje con otra rareza
No es un personaje aparte. En la partida de Aaron hay **28 identidades que estan
a la vez como normales y como Diamante**: la misma identidad, distinta rareza.
Su Mayen Harmet sale dos veces, una de rareza 0 y otra de rareza 8.

Los Idolos si son otra cosa: las familias *hero* (61 identidades) y *fabled*
(58) solo existen como Idolo o Diamante y no tienen version normal.

Asi que `escribir.poner_diamante` solo cambia la rareza a 8. Las pasivas no se
tocan: en la partida hay Diamantes con el campo de pasivas a cero y otros con
pasivas dentro, y no esta claro que escribe el juego.

### O-118 · Cuantos Idolos y Diamantes caben en un equipo
Lo dijo Aaron: **2 Idolos y 1 Diamante**, del tipo que sean. El **banquillo no
cuenta**, pero el **entrenador y los gerentes si**. Eso es lo que comprueba
`equipos.py` antes de dejar mover a nadie.

### O-119 · Los puestos dentro de un equipo
El byte `0x709A88E9` de cada hueco dice donde esta esa persona:

| puesto | que es |
|---|---|
| 0 | el portero |
| 1-10 | los otros diez del campo |
| 11-15 | banquillo |
| 16 | entrenador |
| 17-19 | gerentes |

Visto en el equipo ECLIPSE: los cuatro Briar Bloomhurst estan en los puestos 16
a 19, que son el entrenador y los tres gerentes de su captura. El entrenador
ademas se guarda aparte en `0x21DB3FB1`, por identidad de personaje.

Asi que pasar a alguien de jugador a gerente o a entrenador es cambiar ese byte.
**Sin confirmar**: Aaron dice que hacen falta cierto numero de partidos jugados
para poder hacerlo. No ha dicho cuantos, asi que de momento no se comprueba.

### O-120 · De los 49 equipos, solo 11 se pueden tocar
Lo dijo Aaron: jugando **solo se llega a los equipos que tienen nombre**. Los
otros huecos existen en la partida y hasta tienen gente dentro, pero el juego no
los ensena por ningun lado. Ensenarlos en el editor seria ofrecer algo que el
juego no da, asi que `equipos.todos()` los deja fuera.

Los suyos estan en los huecos 6, 9, 12, 15, 18, 21, 24, 27 y 30 (de tres en
tres), mas los dos de la historia en el 0 y el 1, que salen pero bloqueados.

### O-121 · Los escudos SI estan en la mochila; las formaciones y equipaciones no
El escudo *Nova* del ECLIPSE aparece **dos veces** en la partida: en el equipo y
en una fila normal de la mochila. Lo que pasaba es que `nombres-es.csv` no traia
la tabla de escudos, asi que el editor los tenia delante sin saber como se
llamaban. Anadida `ITEM_EMBLEM_INFO_LIST` (y de paso los emblemas de jugador y
las formaciones), Aaron tiene **53 escudos**.

La equipacion, en cambio, **solo aparece dentro del equipo**: no hay fila de
mochila, asi que donde guarda el juego cuales estan desbloqueadas sigue sin
encontrarse. Lo mismo con las tacticas (se buscaron las 86 y ninguna esta en la
mochila).

Por eso el desplegable de escudo ofrece **los 53 que tiene**, y los de formacion
y equipacion solo **los que ya usan sus equipos**, que son legales seguro.

### O-122 · Las formaciones, con nombre
El juego no guarda estos nombres en ninguna tabla encontrada. Los dijo Aaron
mirando sus equipos, y cuadran solos: dos equipos suyos con la misma formacion
dan el mismo id.

| id | formacion |
|---|---|
| `7A1F0E36` | 3-5-2 Libertad |
| `0A75FAB9` | 4-5-1 Equilibrio |
| `94116F1A` | 4-4-2 Diamante |
| `E47B9B95` | 4-3-3 Triangulo |
| `937CAB03` | 4-3-3 Delta |

Faltan 4-4-2 Caja, 3-6-1 Hexa y 5-4-1 Doble Volante, que Aaron esta preparando en
dos equipos de prueba. Van en
`datos/reglas-del-jugador/nombres-de-equipo.csv` junto con los escudos y
equipaciones que ya dijo.

### O-123 · Jugador, gerente y entrenador
Reglas de Aaron:

- de **jugador a gerente o entrenador**: hacen falta **30 partidos jugados**
- de **gerente o entrenador a jugador**: **10 partidos**
- hecho el primer cambio, ya se mueve libremente
- **Destin Billows no puede jugar nunca**. Es el protagonista de la historia, se
  pueden tener varias copias e incluso en Diamante, pero todas solo de gerente o
  de entrenador.

Comprobado en la partida: Flanko Midspringle (0 partidos) se rechaza y Mark Evans
(34) pasa.

### O-124 · RESUELTO · Un escudo o una tactica tienen DOS numeros
Por esto el editor decia que Aaron no tenia ninguna tactica teniendo 61: estaba
comparando dos numeros que no son el mismo.

- el **objeto de la mochila** tiene su id
- el **equipo** guarda otro valor distinto

El enlace esta en la **ultima columna** de la fila del objeto en `item_config`:

    ITEM_FASHION_INFO_LIST  ... String("uni_u110301") ... 1796276832
                                                          ^ 0x6B110260 = la
                                                            equipacion del ECLIPSE

Con `herramientas/construir_equipo_objetos.py` queda la tabla
`equipo-objetos.csv`, y con ella el editor ofrece **lo que de verdad tiene**:

| que | tiene |
|---|---|
| escudos | 53 |
| equipaciones | 65 |
| tacticas | 61 |
| formaciones | 10 |

Los escudos son la excepcion: ahi el valor del equipo **es** el id del objeto.

**Y hay que tener cuidado con el orden de los bytes**: las tacticas se guardaban
en el equipo al reves que el escudo y la formacion, y por eso el desplegable no
reconocia la que ya estaba puesta. Ahora todo se ensena igual, como el entero en
hexadecimal.

### O-125 · Los iconos de escudo y equipacion
La cadena interna de la fila lleva a la imagen directamente:

| que | de donde |
|---|---|
| escudo | `200_icon/01_icon_emblem/<cadena>.png` — **330 de 330** existen |
| equipacion | `200_icon/10_icon_chr/uniform/<cadena sin uni_>_10_00_l.png` |

Con eso hay imagen para **337 escudos y 170 equipaciones**, y salen tanto en la
mochila como en la ficha del equipo.

Pendiente: los iconos de **pasiva** y de **tactica** estan en laminas
(`13_icon_tactics/icon_tactics.png` es una sola de 2336x2076), asi que hay que
recortarlos y todavia no se sabe que trozo va con cada una.

### O-126 · CORREGIDO · Los cambios de equipo no se veian
Aaron decia que no podia mover a nadie. El cambio **si se hacia**, pero `manda()`
recargaba siempre la lista de jugadores y **nunca el equipo**, asi que la
pantalla se quedaba igual y parecia que no funcionaba nada.

Ahora recarga la pantalla en la que se esta, y de paso se puede soltar a alguien
en un **hueco libre** (antes solo se podia intercambiar con otro que ya
estuviera), tanto en el campo como en el banquillo o en el cuerpo tecnico.

### O-127 · La pantalla de equipos, rehecha
Aaron pidio montar un equipo con **los 3.000 y pico jugadores de la reserva**, no
solo con los que ya estaban dentro. Ahora la pantalla es de dos columnas: la
plantilla entera a la izquierda con sus filtros, y el equipo a la derecha.

Como funciona: se pulsa a alguien (de la reserva o del equipo) y se queda
**cogido**; luego se pulsa un sitio del equipo y se suelta ahi. Los huecos libres
parpadean en cian mientras hay alguien cogido. Cada ficha del campo lleva una x
para sacar del equipo.

Dos funciones nuevas en `equipos.py`:

- `meter_jugador(partida, equipo, puesto, fila)` — mete a uno de la reserva. Si
  el puesto esta cogido, el que estaba sale; si el jugador ya estaba en otro
  puesto, se mueve en vez de duplicarse.
- `sacar_jugador(partida, equipo, hueco)` — lo deja libre.

Las dos comprueban los topes de Idolos y Diamantes y la regla de Destin antes de
tocar nada.

El escudo, la equipacion, la formacion y las tacticas ya no son desplegables:
abren una **ventana con el dibujo de cada uno**, buscador incluido, y solo con lo
que tiene.

### O-128 · CORREGIDO · Las equipaciones visitantes salian sin dibujo
La cadena de una equipacion visitante ya trae el numero dentro
(`uni_u041401_20`) y su fichero se llama `u041401_20_00_l.png`, **sin el `_10`**.
Como solo se probaba una forma, esas salian sin imagen; era el caso de la
visitante del Zeus que dijo Aaron.

Ahora se prueban `<base>_10_00_l.png`, `<base>_00_l.png` y, si no, cualquier
fichero que empiece igual. Resultado: **176 de 181 equipaciones** y **337 de 338
escudos** con dibujo, y de lo que Aaron tiene **no falta ninguno**.

### O-129 · Lo que seguia sin salir (los Diamantes ya estan, ver O-130)
**El calculo de los Diamantes.** Se han probado las 144 filas de las dos tablas
de crecimiento x 300 multiplicadores contra un Mayen Harmet de Diamante y no
encaja ninguna combinacion. Hace falta **una medida limpia**: un Diamante de
nivel 99 **sin equipacion y sin judias**, como los seis que mando para las demas
rarezas. Con eso se saca en un minuto.

**Repartir los puntos del arbol.** Se sabe cuanto da cada casilla (+3, +5, +7
segun cual, O-112) pero no a que stat va cada una sin saber **que tablero tiene
cada personaje**. Lo probado y descartado para encontrar ese enlace: la columna
10 de `chara_param` (solo la tienen 187 de 6.166), la 11, todas las de
`chara_base`, y buscar el tablero por las tecnicas del personaje (se queda en 4
de 6 y los dos candidatos no cuadran con lo que ensena el juego).

**Los iconos de pasiva y de tactica.** Estan en laminas grandes
(`15_icon_common` es una sola imagen de 1192x1108 con los iconos de stat, y
`13_icon_tactics` otra de 2336x2076). Hay que recortarlas y aun no se sabe que
trozo va con cada pasiva; `PASSIVE_SKILL_BUFF_ICON_LIST` (108 filas) tiene pinta
de ser el enlace pero su estructura no esta clara.

### O-130 · RESUELTO · Los Diamantes usan siempre el rango 5
Era el ultimo agujero de la formula de stats. Aaron mando un **Mark Evans de
Diamante a nivel 99 sin judias ni equipacion**, y comparandolo con un **Mayen
Harmet** tambien Diamante sale solo:

| | personaje | su rango | lo que ensena el juego |
|---|---|---|---|
| Mayen Harmet | normal pasado a Diamante | **0** | 289 322 294 325 348 378 312 |
| Mark Evans | Diamante de fabrica | **5** | 289 322 294 325 348 378 312 |

**Los mismos siete numeros** con dos rangos distintos. O sea que al pasar a
Diamante el juego **iguala a todos al rango 5**, y el multiplicador es el mismo
1,4 que ya tenian Leyenda e Idolo.

Con la fila (1, 2, 1, **5**) x 1,4 sale 289 / 312 / 294 / 315 / 338 / 358 / 312:
**Potencia, Tecnica e Inteligencia exactas**, y las otras cuatro cortas en 10, 10,
10 y 20, que es lo que les da el arbol.

Asi que ya **no hay ninguna rareza sin formula**. Medidas contra el juego: 0, 1,
2, 4, 5 y 8. La 3 se deduce de la escalera y las 6 y 7 van con la 5.

### O-131 · CORREGIDO · Las reglas de gerente y entrenador se colaban
Aaron decia que a veces le dejaba mover a alguien a gerente y a veces no, y que a
veces se quedaba a medias. El motivo: la comprobacion estaba **solo en
`poner_puesto`, y solo para el que se movia a mano**. Se colaba por tres sitios:

1. al **intercambiar** dos, no se miraba al que salia
2. al **meter a uno de la reserva** directo a un puesto de gerente, no se miraba nada
3. los topes de Idolos y Diamantes se contaban de forma distinta en cada funcion

Ahora todo pasa por `_aplica_movimientos`, que mira **como quedaria el equipo
entero** y comprueba el rol de cada uno que se mueve. Y el editor lo avisa
**antes de pulsar**: con alguien cogido, los sitios a los que no puede ir salen
tachados y dicen *"Primero hay que convertirlo en gerente: hacen falta 30
partidos jugados y lleva 0"*.

Comprobado en los cinco caminos: mover a mano, intercambiar, meter de la reserva,
y los dos que si deben pasar (34 partidos a gerente, gerente de 64 a jugador).

### O-132 · RESUELTO · Lo que decide si alguien es jugador, gerente o entrenador

(Lo de que `F_ENTRENADOR` vale cero siempre era falso: ver O-223.)

Aaron dijo que el editor seguia dejando poner a un gerente de la reserva en el
campo, y que habia que mirar **la medalla**, no los partidos. Tenia razon y
ademas la cosa estaba peor de lo que parecia: el puesto del entrenador estaba al
reves.

**La regla del juego**, en sus propias palabras (textos en espanol del juego):

> *Cada personaje tiene una aptitud como jugador, entrenador o gerente. Al
> cumplir ciertas condiciones puedes desbloquear aptitudes adicionales mas alla
> de la aptitud inicial.*

> *Transforma a un personaje en gerente. Equipala en la tabla de habilidades.*
> (descripcion de la **Medalla de gerente**)

> *No puedes colocar gerentes ni en el campo ni en el banquillo.*

O sea, dos cosas:

1. **La aptitud de fabrica**, que viene del juego. Sale de `chara_param`:
   columna **37** = entrenador, columna **38** = gerente, ninguna = jugador. Son
   110 entrenadores y 49 gerentes, y la lista se lee sola: en la 37 estan Ray
   Dark, Seymour Hillman y Mr. D, y en la 38 Celia Hills, Nelly Raimon y
   Camellia Travis. Ya va en `personajes.csv`.
2. **La medalla puesta**, que es la aptitud ganada. Vive en el campo
   `0x8F0E9F49` de la ficha del jugador, 4 bytes, y **no guarda el id de la
   medalla sino el hueco de mochila del monton**. Aaron tiene 99.999 de cada una
   en dos filas, y los 188 personajes que llevan medalla apuntan a esas dos.
   Los ids de los objetos son `0x9B6947D9` (entrenador) y `0xEC6E774F`
   (gerente), de `ITEM_SPECIAL_SKILL_INFO_LIST`.

Quien lleva medalla **deja de ser jugador**. Por eso un gerente no pisa el campo
ni el banquillo.

**El puesto del entrenador es el 19, no el 16.** Un equipo lleva tres gerentes y
un entrenador. Se ve sin lugar a dudas en la propia partida: los **21** miembros
que estan en los puestos 16, 17 y 18 llevan **todos** la Medalla de gerente, y
los **9** del puesto 19 llevan la de entrenador o son entrenadores de fabrica.
El campo `0x21DB3FB1`, que se creia que guardaba al entrenador, vale **cero en
los once equipos**: no es eso, y se ha dejado de escribir.

**Comprobacion**: la regla cuadra con **166 de los 176** miembros de sus once
equipos. Los 10 que no cuadran son justo los que el propio editor habia dejado
mal puestos (nueve en Good Losers y uno en ZeusAllStars, gerentes y entrenadores
metidos en el campo), que es el fallo que pedia arreglar. Ahora salen marcados
en rojo en la pantalla, con el motivo.

Los partidos siguen contando, pero para lo que de verdad son: **ganarse la
medalla**. 30 partidos para la de gerente o entrenador y 10 para volver a
jugador, como dijo Aaron. A quien ya tiene esa aptitud de fabrica no se le pide
nada: por eso Lucy Wongfu es gerente con **cero** partidos.

Y con esto el editor puede hacer el cambio de rol **como lo hace el juego**:
poniendole o quitandole la medalla (`escribir.poner_medalla`), no moviendolo de
sitio a la fuerza.

### O-133 · CORREGIDO en O-137 · Los iconos de la mochila: cuales existen y cuales no

Aaron pidio los iconos de todo lo de la mochila, y en concreto los de las botas
y los colgantes, "que no salgan las genericas, el juego las tiene".

Se busco el nombre interno de cada objeto (`eq_sh110001` para unas botas,
`fm0101` para una formacion, `coi_object_k01a001a` para un material...) en los
**255.303 ficheros** del juego. Resultado:

| familia | dibujo propio | donde |
|---|---|---|
| escudos de equipo | **si**, 716 | `200_icon/01_icon_emblem/<cadena>.png` |
| equipaciones | **si**, 289 | `200_icon/10_icon_chr/uniform/...` |
| placas de nombre | **si**, 60 | `200_icon/25_icon_nameplate/<cadena>.png` |
| espiritus | **si**, 413 | `200_icon/10_icon_chr/aura_*` |
| botas, brazaletes, colgantes, especiales | **no** | — |
| materiales, vinculos, formaciones, tacticas, emblemas de jugador, consumibles | **no** | — |

O sea: **no es que falten, es que no existen**. El juego les pone a todas el
dibujo de su familia, y esos dibujos si estan:

- `200_icon/02_icon_item`, **diez dibujos a color**: las botas verdes, la banda
  trenzada, el colgante de estrella, la camiseta del Raimon, la bolsa de bebida,
  el cuaderno de supertecnicas. Son los que el juego usa de verdad.
- `200_icon/17_icon_category`, **doce dibujos planos** de las pestanas: camiseta,
  bota, entrada, escudo, banda, cofre, colgante, bolsa, amuleto, insignia,
  carita y placa. Vienen **casi transparentes** (la opacidad no pasa de 52 sobre
  255, el juego la sube al pintarlos), asi que hay que subirla y tenirlos.

Con eso las **17 familias** de la mochila tienen ya su dibujo, cuando antes solo
lo tenian 8. Lo deja todo `herramientas/construir_iconos_mochila.py`, en
`datos/reglas-extraidas/iconos-objeto.csv` (1.547 objetos, 573 con dibujo
propio) y en `datos/iconos/recortes/categoria/`.

### O-134 · RESUELTO en O-137 · Los 72 iconos de tactica estan, falta saber de quien es cada uno

`200_icon/13_icon_tactics/icon_tactics.png` son 2336x2076 y se parte limpiamente
en una rejilla de **9 por 8 = 72 dibujos dorados** de 259,5 px (medido buscando
las franjas transparentes entre ellos, no a ojo).

Lo que falta es **cual es de cada tactica**. Se probo el orden de la tabla
(`ITEM_SPECIAL_TACTICS_INFO_LIST`, columna 16, que va de 1 a 71) y **no cuadra**:
"Monte Fuji" es la 3 y la montana esta en la casilla 2, pero "Cuadricula
defensiva" es la 44 y el muro de ladrillos esta justo en la 44. O sea que ni es
ese orden ni es ese orden desplazado. Tampoco hay ninguna columna con pinta de
indice de icono ni en `SPECIAL_TACTICS_INFO_LIST` ni en `ITEM_...`.

Mientras no se sepa, **no se inventa**: las tacticas salen con el dibujo de su
familia. Lo mismo pasa con las pasivas, cuyos iconos estan en
`200_icon/15_icon_common` (1192x1108) pero en un empaquetado **sin rejilla**, y
ahi el enlace tendria que salir de `PASSIVE_SKILL_BUFF_ICON_LIST` (108 numeros
del 0 al 37, en grupos que se repiten) cruzado con `PASSIVE_SKILL_EFFECT_LIST`.

### O-135 · Los escudos y las tacticas de equipo no guardan cuantos tienes

Aaron intentaba conseguir tacticas de equipo y le salia `KeyError: cantidad_off`.
El motivo: en la partida **sus filas no tienen campo de cantidad**. Contado sobre
sus 3.037 objetos:

| familia | filas | con campo de cantidad |
|---|---|---|
| escudo | 53 | **0** |
| tactica de equipo | 61 | **0** |
| todas las demas | ... | todas |

O sea que un escudo o una tactica de equipo **se tiene o no se tiene**, sin
numero. El editor escribia la cantidad siempre y reventaba.

Ahora: al crear la fila solo se escribe la cantidad si el hueco la tiene, la
tarjeta pone "lo tienes" en vez de un numero, se consiguen de un toque sin
preguntar cuantos, y en esas dos pestanas sale un solo boton ("Conseguirlos
todos") en vez de los dos de 1 y 99.

De paso, fuera las **supertacticas** de la mochila: Aaron avisa de que no se
consiguen, salen solas durante el partido y se acaban con el.

### O-136 · "Conseguir todo" pasa de 40 segundos a menos de uno

Conseguir los 285 escudos que le faltaban tardaba **39,6 s**. La culpa era de
hacerlo objeto a objeto: cada `anadir_objeto` volvia a recorrer los 12 MB de la
partida para encontrar el bloque, las filas libres y el numero de serie mas alto.

Ahora se lee el bloque **una vez**, se reparten todas las filas libres y se
escribe todo de golpe: **0,16 s**, 250 veces mas rapido. Se comprobo que la
primera fila creada sale **byte a byte igual** que por el camino de uno en uno.

Ademas la mochila se repinta en la pantalla **sin esperar al servidor**: se
aplica el cambio a lo que ya se tiene en memoria y luego se refresca por detras.

### O-137 · RESUELTO · El formato `.g4tx`, y si que hay un dibujo por objeto

Esto desmonta O-95 y O-103, que daban por cerrado que la equipacion no tenia
arte propio. **Aaron tenia razon**: la tiene, y estaba delante todo el tiempo.

**El fallo**: el convertidor de texturas sacaba de cada `.g4tx` **una sola
imagen**, la ultima. Como `200_icon/02_icon_item` tiene diez ficheros, parecia
que habia diez dibujos genericos de familia. En realidad `icon_item03.g4tx`
**pesa 13 MB y lleva dentro 203 botas**, cada una con su nombre.

**El formato, entero.** Un `.g4tx` tiene dos formas:

| donde | que |
|---|---|
| 0x00 | `G4TX` |
| 0x20 | u16: cuantas imagenes lleva (solo en la segunda forma) |
| 0x2C | u32: a cuantos bytes del final empieza la imagen |
| 0x78 | u16 ancho, u16 alto de la lamina (solo en la primera forma) |
| 0x94 | tabla de recortes: 24 bytes cada uno, los 8 primeros x, y, ancho, alto (u16) |
| antes de la imagen | los **nombres**, seguidos y separados por un cero |

- **Lamina con recortes**: una sola imagen grande y una tabla que dice que
  trozo es cada dibujo. Asi son `icon_common` (144 dibujos), `icon_tactics`
  (71) y `icon_category` (12).
- **Lamina de imagenes sueltas**: N imagenes enteras, una detras de otra. Asi
  son las de la mochila.

Y en las dos, **los nombres van en el mismo orden que los dibujos**. Comprobado
sin margen de duda: en `icon_common`, `gender01` es el simbolo de hombre,
`platform02_01` el logo de Switch y `btl01_parameter..` los siete stats.

Lo saca `herramientas/recortar_g4tx.py`, que deja **1.083 dibujos** sueltos.

**Lo que se gana**, enlazando cada objeto por su nombre interno:

| familia | con dibujo propio |
|---|---|
| botas | 196 de 223 |
| brazaletes | 81 de 82 |
| colgantes | 81 de 81 |
| especiales | 82 de 82 |
| equipaciones | 178 de 181 |
| escudos | 337 de 338 |
| placas | 60 de 60 |
| tacticas de equipo | **70 de 70** |
| consumibles | 57 de 73 |
| **materiales** | **148 de 148** |
| **vinculos** | **82 de 82** |

En total **1.372 de 1.541** objetos de la mochila con su propio dibujo, cuando
antes eran 573 y casi todos escudos.

Las 27 botas que faltan son las de nombre largo (`eq_sh1100101`): el juego solo
trae 25 de esas 52, asi que a las otras les pone el dibujo de la familia, igual
que hace el editor. **No se inventa un parecido**: probando a recortar digitos
del nombre salen dos reglas distintas que se contradicen.

**Y de paso cae O-134**: el icono de una tactica se llama `icon_w` + su cadena
(`ht10010` -> `icon_wht10010`). Las **70** cuadran, y el dibujo dice lo que el
nombre: "Cuernos de toro" son unos cuernos, "Monte Fuji" la montana, "Avance de
caballeria" el caballo del ajedrez y "Bloqueo espectral" un ojo.

**No todo estaba en `02_icon_item`.** Dos familias vivian en laminas de otro
menu, y se encontraron buscando su nombre interno dentro de los propios `.g4tx`:

- **materiales** (`coi_object_*`) en `200_icon/22_icon_town/icon_town.g4tx`,
  que es la lamina de los objetos de la ciudad: 163 dibujos;
- **vinculos** (`ds*`) en `200_icon/20_icon_deco/icon_deco.g4tx`, la de las
  pegatinas del modo foto: 86 dibujos.

Sin resolver: **emblemas de jugador** (`ti*`) y **formaciones** (`fm*`). Su
nombre no aparece en ninguna de las 78 laminas sacadas de los 936 paquetes, asi
que o los dibuja el juego sobre la marcha o estan guardados de otra forma. Se
quedan con el dibujo de su familia.

**Como se encontraron las laminas en crudo**: `datos/juego/listado.txt` dice que
existen pero no en que paquete, y el indice del juego no se puede leer (O-36).
Se abrieron los 936 paquetes de uno en uno, dos veces (una para `200_icon` y
otra para el resto del menu): 38 minutos en total. Las 78 laminas utiles estan
en `datos/juego/laminas` y sus 1.332 dibujos en
`datos/iconos/recortes/laminas`.

### O-138 · Los iconos de tipo de tecnica y de los siete stats

Con las laminas ya partidas (O-137), `icon_common` trae los dos juegos de iconos
que faltaban para que el editor se parezca al juego.

**El tipo de tecnica**, que es el circulo que el juego pone a la izquierda de
cada una. Cuadran uno a uno con las capturas de Aaron:

| dibujo | nombre en el juego | es |
|---|---|---|
| cometa rojo | `icon_sp_area01` | Tiro |
| bota verde | `icon_sp_area02` | Regate |
| barrera azul | `icon_sp_area03` | Defensa |
| mano amarilla | `icon_sp_area04` | Parada |
| fantasma morado | `icon_sp_area05` | espiritu / hipertecnica |
| rombo con armadura | `icon_sp_area06` | Armadura |

**Los siete stats**, en tres colores (`icon_btl01/02/03_parameterNN`):

| nombre | dibujo |
|---|---|
| 01 Potencia | la bota chutando |
| 02 Control | el balon enmarcado |
| 03 Tecnica | la chilena |
| 04 Inteligencia | la bombilla |
| 05 Presion | las ondas alrededor de uno |
| 06 Fisico | el brazo |
| 07 Agilidad | el corredor |

Los cinco primeros y los dos ultimos son inequivocos. **Inteligencia y Presion
se han asignado por el dibujo** (bombilla = cabeza, ondas = presencia), que es lo
unico que hay: en las tablas del juego no aparece el orden. Si estuvieran al
reves, se cambian dos lineas de `ICONO_STAT`.

Con eso, en el editor:

- **elegir tecnica** se ve como en el juego: circulo del tipo, barra del color de
  su afinidad (rojo Fuego, verde Bosque, azul Viento, dorado Montana), nombre,
  TP y AT/DF con su numero;
- el **arbol de habilidades** ensena cada ranura con esa misma barra;
- la **mochila** pone a cada supertecnica el circulo de su tipo, y tiene filtros
  nuevos de **Tipo**, **Clase** y **Afinidad**;
- la **equipacion** ensena el dibujo de lo que lleva puesto y el de cada cosa al
  elegir;
- las **judias** y los **siete stats** llevan su dibujo.

### O-139 · Las siete judias tienen su propio dibujo, y estaba escondido

Aaron pidio que las judias salieran con **su** dibujo, las alubias de colores del
juego, y mando una captura del menu SET con las siete.

Costo encontrarlas porque en las pantallas de judias el icono es un **hueco**:
las laminas del menu solo traen `icon_bean_dmy01` y `icon_parameter_dmy01`, o
sea marcadores de posicion. El icono de verdad lo pone el juego en marcha.

La pista estaba en la configuracion del propio menu,
`gamedata/menu/cfg/ability_learning_set_beans_menu_setting.cfg.bin`, que declara
que recursos usa esa pantalla:

    String("#/menu/200_icon/02_icon_item/icon_item10.g4tx")
    String("#/menu/200_icon/100_num/num_menu01.g4tx")

Y dentro de `icon_item10` estan, con el nombre **`tr000001`** a **`tr000007`**
("tr" de *training*, que es como el juego llama a las judias: el objeto del menu
se llama `item02_01_list_training_beans_attach`).

Van **en el mismo orden que los stats**, y cada dibujo lleva el simbolo del suyo:

| | judia | dibujo |
|---|---|---|
| tr000001 | Potencia | roja, con la bota |
| tr000002 | Control | rosa, con el balon |
| tr000003 | Tecnica | amarilla, con la chilena |
| tr000004 | Presion | verde, con las ondas |
| tr000005 | Fisico | azul, con el brazo |
| tr000006 | Agilidad | naranja, con el corredor |
| tr000007 | Inteligencia | celeste, con la bombilla |

**Ojo con las dos ultimas.** En la captura de Aaron la sexta de la lista es la
celeste y la septima la naranja, al reves que en el fichero. Se ha ido por el
**dibujo**, que no deja lugar a dudas (la bombilla es Inteligencia y el corredor
Agilidad) y ademas cuadra con el orden de `icon_parameterNN`. Si en el juego la
sexta fuera de verdad Agilidad, se cambian dos lineas de `ICONO_JUDIA`.

De paso, en `18_icon_abilearboard` estan los iconos de las casillas del arbol de
habilidades (`icon_alb01_parameterNN_on/off`), que haran falta cuando se resuelva
lo del tablero.

### O-140 · RESUELTO · El arbol de habilidades: que stat sube cada casilla

Era el muro que quedaba (O-50, O-129). La respuesta no estaba en el tablero de
cada personaje sino en **su posicion**.

**Como se llego.** Primero se descifro `skill/ability_learning_config` entero
(46 tablas, no las 12 que se veian; la lista estaba cortada). Con eso salio que:

- todos los identificadores del juego son **CRC32 del nombre interno** (7 de 7
  probados: `eq_sh110001`, `ht10010`, `ps10001`... y los 7.224 de `chara_base`);
- `BOARD_INFO` son 877 tableros, cada uno un tramo de `BOARD_EFFECT` (23.790
  casillas en total, cuadra al byte); `chara_param` columna 10 apunta a uno de
  ellos, pero **solo los 187 Idolos y Diamantes** lo tienen;
- los 5.946 futbolistas normales no apuntan a ningun tablero por ninguna
  columna, ni por CRC32 de ningun nombre que se haya probado.

La pieza que lo resolvio fueron dos tablas pequenas:
`ABILITY_LEARNING_MAIN_PARAM_UP_TABLE` y `..._SUB_PARAM_UP_TABLE`. Cada una da,
**por posicion**, cuatro pasivas de stat (`ps2FFTT`):

| posicion | nivel 1 | nivel 2 | nivel 3 | nivel 4 |
|---|---|---|---|---|
| POR (1) | Agilidad | Fisico | Agilidad | Fisico |
| DEL (2) | Potencia | Control | Potencia | Control |
| MED (3) | Tecnica | Control | Inteligencia | Tecnica |
| DEF (4) | Presion | Fisico | Inteligencia | Presion |

**El tronco y la rama 1 usan la lista de la posicion principal; la rama 2 la de
la secundaria.** Y cuanto sube lo pone la casilla: nivel 1 = +3, nivel 2 = +5,
nivel 3 = +7 (O-112). En el mapa de 40 casillas de la partida:

    casilla  5 -> principal[0] +3     casilla  6 -> principal[1] +5
    casilla  9 -> principal[0] +3     casilla 13 -> principal[1] +5     casilla 15 -> principal[2] +7
    casilla 19 -> secundaria[0] +3    casilla 23 -> secundaria[1] +5    casilla 25 -> secundaria[2] +7

**Comprobado**: cuadra casilla por casilla con las capturas de Alex Zabel (DEL,
alt MED: Potencia/Control en el tronco y la rama 1, Tecnica/Control/Inteligencia
en la rama 2) y de Mark Evans (POR, alt DEL: Agilidad/Fisico y luego
Potencia/Control/Potencia). Y con eso la formula entera de los stats sale
**exacta**: Zabel con todo puesto da 584/544/449/184/180/180/200, las siete
cifras de su captura.

Lo hace `stats.de_arbol`, con `datos/reglas-extraidas/arbol-stats.csv` (de
`herramientas/construir_arbol.py`).

**Lo que queda fuera**: Idolos y Diamantes. Su mapa de casillas es otro (22-23
casillas seguidas, sin la particion 8/10/10) y su tablero propio (columna 10)
lista pasivas de stat que **no** cuadran con los numeros de Mark Evans Diamante
([0,10,0,10,10,20,0]). Se ha probado la regla de posicion y la del tablero y
ninguna da esos numeros. El editor lo dice en vez de inventar.

De paso quedan descifradas dos cosas que serviran mas adelante:
- el formato de los tableros (`BOARD_INFO` -> tramo de `BOARD_EFFECT`; cada
  casilla es una tecnica, una pasiva `ps1`, una de stat `ps2` o un nudo);
- la forma visual (`SHAPE_INFO` -> `PIECE_DIR`/`PIECE_EFF`, rejilla de 12x22
  con el numero de casilla en cada hueco).

### O-141 · Los iconos de las pasivas: el dibujo es del juego, la asignacion es nuestra

Aaron pidio los iconos de las pasivas. Lo que hay en el juego:

- `200_icon/18_icon_abilearboard` trae los dibujos de la tabla de habilidades:
  siete de stat (`icon_alb01_parameterNN`) y 32 de efecto de equipo
  (`icon_alb01_teambuffNN`: el cometa del tiro, el muro, la diana del foco, los
  dos jugadores de la disputa, la T de la tension, el muro roto de la brecha, la
  tarjeta de las faltas, la mano del portero, el cronometro...).
- `PASSIVE_SKILL_INFO_LIST` (1.716 pasivas) apunta a `PASSIVE_SKILL_BUFF_ICON_LIST`,
  pero **solo 108** tienen icono ahi, y es el que sale durante el partido, no en
  el menu. Las otras 1.608 no apuntan a nada.
- Ninguna otra columna (familia, tipo de efecto —80 tipos—, objetivo) lleva a
  un dibujo.

Asi que la asignacion la hace `herramientas/construir_iconos_pasivas.py`
**leyendo el texto en espanol** de cada pasiva: "AT de tiro" -> cometa, "DF del
muro" -> muro, "foco" -> diana, "disputa" -> dos jugadores, "brecha" -> muro
roto, "tension" -> T, "faltas" -> tarjeta, "portero" -> mano, "+N Potencia" ->
el stat. Sale en `pasivas-icono.csv` y se ensena en la ficha, al elegir, al
heredar y en la base de datos. En la pantalla se dice que la asignacion es
nuestra.

### O-142 · La calculadora de poder: lo que dice el juego y lo que no dice

Los textos de ayuda del juego (`text/es/help_list_text.cfg.bin`) describen con
palabras de que depende cada valor de partido:

| valor | de que sale, segun el juego |
|---|---|
| AT de tiro | "el total combinado de Potencia y Control" |
| AT de foco | Tecnica, Control y Potencia |
| DF de foco | Tecnica, Inteligencia y Agilidad |
| AT de disputa | "la suma de Inteligencia y Fisico" |
| DF de disputa | Presion (y la Inteligencia "suma DF de disputa") |
| DF del muro | Presion y Fisico |
| PP (poder del portero) | Fisico, Agilidad y Presion |
| elementos | viento > montana > fuego > bosque > viento |
| afinidad | los pases seguidos suben el AT de tiro, en % |
| sustitucion | +15 % AT y DF 60 s al que entra; +5 % a los de su posicion |
| tiros | "las supertecnicas o las cadenas de tiros aumentan el AT" |

Lo que **no** dice: los porcentajes del elemento (mismo que el jugador, ventaja,
desventaja) ni los pesos si no son sumas planas. Se buscaron en
`soccer_basic_effect_config` (104 funciones por nombre), `soccer_add_status`,
`soccer_focus_battle_effect_config` y `soccer_game_config`: son listas de
funciones y disparadores, los numeros estan en el propio programa. La
calculadora (`web/calculadora.html`) usa las sumas del juego y deja los
porcentajes como casillas que se pueden tocar, marcadas "por confirmar". Aaron
puede decirlos si los sabe.

### O-143 · El menu de inicio, la base de datos y la calculadora

Tres pantallas nuevas sobre el mismo servidor:

- `/` es un **menu de inicio** a lo pantalla de titulo (`web/inicio.html`) con
  tres botones: editor, base de datos y calculadora.
- `/editor` es el editor de siempre.
- `/bd` es la **base de datos del juego** (`web/basedatos.html`,
  `ievr/basedatos.py`): no lee la partida; junta las tablas de
  `reglas-extraidas/`. Personajes (6.101 con nombre) con stats a 1/30/50/99 por
  cada rareza que puedan tener, lo que le da el arbol, las nueve tecnicas con su
  nivel, las pasivas que le pueden salir en 1-2 y las de 3-5 por arquetipo, su
  frase y sus versiones; y aparte supertecnicas, espiritus, pasivas y objetos.
- `/calc` es la calculadora (O-142), con jugadores de la partida, de la base de
  datos (a cualquier nivel y rareza, con el arbol) o a mano.

`web/comun.css` y `web/comun.js` llevan lo que comparten (colores, pestanas,
tarjetas, la barra de tecnica, los iconos). El editor sigue con su copia dentro
de `editor.html`.

### O-144 · Revision general del codigo

Aaron pidio "una revision tocha": fallos, estetica, limpieza y rapidez. Lo que
se ha hecho:

- **Rapidez.** La lista de la reserva (3.037 filas) recorria la ficha de cada
  jugador siete veces (partidos, judias, heredadas, equipacion, medalla, rol,
  aptitudes). Ahora `_campos_ficha` la recorre **una** y lo demas lo lee de ahi:
  de 1,2 s a 0,29 s, mismos resultados fila por fila. "Conseguir todo" ya se
  habia dejado en una pasada (O-136).
- **Codigo muerto.** Fuera `cuenta_de_rarezas` (sustituida por `cuantos_caben`),
  fuera el campo "entrenador" de `poner_simple` (el juego no lo usa, O-132), y
  fuera de `web/` tres pantallas viejas que nada abria (`codice.html`,
  `plantilla.html`, `editor-anterior.html`): estan en `referencia/antiguo/`.
- **Estetica.** El texto de un campo bloqueado (la rareza de un Idolo) salia en
  gris sobre el verde del campo y no se leia: ahora va en caja blanca. Las
  marcas de la equipacion ("bota", "braz"...) se cortaban: ahora son el numero
  de ranura y al lado va el dibujo del objeto.
- **Comprobado.** Las dos baterias en verde; `py_compile` de todo; `node --check`
  del javascript compartido; las tres pantallas abiertas en el navegador sin
  errores ni imagenes rotas.

Lo que se deja apuntado y **no** se ha tocado, porque es un cambio grande para
otro dia:

- `web/editor.html` lleva su propia copia de lo que ahora esta en
  `web/comun.js` y `comun.css` (`el`, `pedir`, los iconos, la barra de
  tecnica). Funciona, pero cualquier retoque hay que hacerlo dos veces.
- `ievr/escribir.py` (2.068 lineas) y `ievr/servidor.py` (~970) piden
  partirse por temas.

### O-145 · Las pasivas valen lo que ensena el juego, y se suman por equipo

`skill/passive_skill_config` tiene `PASSIVE_SKILL_EFFECT_LIST`: cada pasiva
apunta a una o mas filas (tipo de efecto, valor, objetivo). El **valor es el
numero que sale en el texto**: `ps10052` vale 2 y su texto es "Tasa de brecha
del equipo +<VALUE> %"; las casillas de stat `ps2xxxx` valen 3, 5 y 7 (las del
arbol, O-140). El tipo de efecto es un identificador (80 distintos) sin nombre
en ninguna tabla.

`herramientas/construir_valores_pasivas.py` deja `pasivas-valor.csv` (1.716
filas: id, interno, tipo_efecto, valor, familia, texto). La **familia** la
ponemos nosotros leyendo el trozo de la frase donde esta el numero ("Cuando el
equipo gana en foco o disputa, tension +4 %" es de tension): at_tiro, df_muro,
foco, disputa, pp, afinidad, brecha, tension, faltas, stat_*... Lo mismo se ha
aplicado a los iconos (O-141), que antes miraban la frase entera.

Con eso, `/api/equipo/<n>/pasivas` hace lo que la pantalla del juego
"Equipo > Bonificaciones de equipo > Pasivas de equipo": cada texto una vez,
con la suma de todos los del equipo que la llevan ("PP del equipo +18 %" son
doce jugadores con +1,5 %), la heredada tapando a la normal de su ranura. Sale
en el editor (pantalla de equipo, plegado "Bonificaciones de equipo") y en la
calculadora: al elegir un equipo, sus pasivas se suman solas a la jugada que
toca (AT de tiro al tiro, DF del muro al muro, PP al portero, foco y disputa a
las suyas); las condicionales (cuando, tras, en campo contrario, del mismo
elemento, por cada rango...) salen apagadas y se encienden a mano.

Comprobado con ECLIPSE (26 lineas) contra la captura de Aaron: las cifras
cuadran con lo que ensena el juego.

### O-146 · Menu de inicio como la pantalla de titulo, y remates de la ronda

- **Menu** (`web/inicio.html`): fondo claro con hexagonos, logo grande en el
  centro (hecho con letras: el juego no trae el logo como imagen suelta, solo
  las fichas de menu en `100_topmenu`/`100_mainmenu`), dos paneles grandes
  (Editor con el dibujo de equipo `mainmenu90_00_p1` del juego, Base de datos
  con ocho caras al azar) y dos filas de fichas inclinadas azul oscuro con los
  iconos blancos de `icon_list_tab`. Cada ficha enlaza directo: `/editor#equipos`
  abre esa pestana (el editor lee `location.hash`) y `/bd?p=tecnicas` esa otra.
- **Base de datos**: fuera las 419 versiones sin posicion (las de historia,
  `c04002410_5000` y parecidas): no tienen cara, stats ni nada que ensenar, y
  eran las tarjetas vacias que vio Aaron (Abram Cadabra). Las pestanas no
  abrian porque `.dos{display:grid}` pisaba al atributo `hidden`:
  `[hidden]{display:none!important}` en `comun.css`. Las tarjetas son ya las
  del editor (`fichaMini` en `comun.js`, con silueta del juego si no hay cara).
- **Calculadora**: tarjeta del editor para el jugador elegido y para los
  resultados de busqueda, iconos de stat grandes sobre caja azul, desplegable
  de equipo con sus jugadores para elegirlos de un clic (O-145).
- **Pantalla de equipo**: la equipacion sale con el dibujo de la mochila
  (`uni_*` de `icon_item07`), no con el render del uniforme.
- Comprobado: las dos baterias en verde, `node --check` de las cuatro
  pantallas, y las cuatro abiertas en Chrome sin errores ni imagenes rotas.

### O-147 · Misma estetica en todas las pantallas, ventanas propias y partida a elegir

- **Estetica.** Todas las pantallas llevan ya lo del menu de inicio: fondo claro
  con la trama de hexagonos, y las pestanas, botones y cajas en azul marino con
  borde blanco y aro celeste (`--panel`, `--panel-claro`, `--aro` en
  `comun.css` y en `editor.html`). Lo que ya tenia su pinta propia (tarjetas,
  barras de tecnica, campo, mochila, franjas del juego) no se ha tocado.
- **Ventanas propias.** Fuera el `prompt()`/`confirm()`/`alert()` del navegador:
  `pideNumero`, `confirma` y `avisa` (en `comun.js` y, con la misma caja, en el
  editor). La cantidad de la mochila, "conseguir todo", "convertir en Diamante",
  "dejarlos en 3" y "guardar copia" preguntan con la ventana del editor.
- **Objetos con el mismo nombre.** Al anadir un objeto el editor mandaba solo el
  nombre, y hay dos "Alfil negro" de aura (kenshin y armadura), asi que el
  servidor no sabia cual y saltaba "hay 2 cosas distintas...". Ahora manda
  tambien el codigo (`id`) y el servidor lo usa si viene (`_buscar_por_nombre`
  ya aceptaba codigos). Probado: se anade el kenshin y no el otro.
- **Partida a elegir en el inicio.** Arriba a la izquierda sale que partida esta
  cargada y un boton "Cambiar partida..." con la misma ventana de carpetas del
  editor (`/api/carpetas`, `/api/abrir`), para ensenarselo a alguien con su
  propia partida. Y el editor tiene una ficha "Inicio" en su barra de pestanas.
- Comprobado en Chrome: las cinco pantallas sin errores ni imagenes rotas; las
  dos baterias en verde.

### O-148 · Los cuerpos: la cara encima del busto, y el valor de cada pasiva por rareza

**Cuerpos.** Desde O-77 se sabia que camiseta lleva cada personaje, pero ninguna
pantalla la usaba: salian solo las cabezas. Ahora `cuerpos.csv`
(`herramientas/construir_cuerpos.py`) dice con que busto se dibuja cada uno y
todas las tarjetas (editor, equipos, fichar, base de datos, calculadora, menu)
ponen el busto debajo de la cara; encajan tal cual, son del mismo tamano.

- La camiseta es la de su equipo de historia, en el diseno que dice
  `chara_base` col 10 (`_10` casi siempre; 26 personajes llevan el `_20`).
- Los **entrenadores** de fabrica llevan el polo negro de cuerpo tecnico
  (`o000401`). Es la unica ropa de calle que se ha podido cerrar.
- Sin equipo (95): la camiseta `u010101`.
- La **talla** (lo que el filtro del juego llama tipo de cuerpo) tambien:
  `chara_base col 6 -> CHARA_MODEL_INFO col 4 -> CHARA_BODY_INFO`, col 6 es el
  tipo (0-7) y col 5 dice si es chica (4-7). Y cada camiseta esta dibujada en
  **ocho tallas**: `u0101` + `01..08` (chicos) y `51..58` (chicas); por eso hay
  4.754 ficheros de camiseta y los equipos solo referencian 315. Talla = tipo
  + 1, o 51 + tipo si es chica. Comprobado a ojo: el cuello del busto encaja
  con la barbilla justo en esa talla (Cade Shelby 07, Jambo Reemoth 06, Clark
  von Wunderbar 04, Lumina 52) y en ninguna otra. El polo de entrenador viene
  en 01/02/05/08 y se coge la mas cercana por debajo. Los dos numeros finales
  del fichero (`_10_00`) son el diseno (col 10) y una variante que no cambia
  con el cuerpo. Antes (O-80) se creyo que la variante final era la complexion:
  no, la complexion va en el numero de la camiseta.
- Que etiqueta del filtro del juego (Normal, Pequeno, Grande, Alto, Musculoso,
  Robusto) es cada tipo 0-7 esta por confirmar con Aaron; en `cuerpos.csv` va
  el tipo en crudo.
- Lo que queda abierto: el juego trae **123 prendas de calle** en
  `10_icon_chr/uniform/o0004..o0034` (polos, chandales, uniformes de colegio,
  cada una en 2-4 tallas) y 5 retratos de entrenadores en `coach/`, pero
  ninguna tabla dice quien lleva cual: sus hashes solo aparecen en
  `m_UniformModelInfoList`, y esas filas no las referencia ningun equipo ni
  ningun personaje (`m_CharaUniformExInfoList` tiene 388 personajes con ropa
  extra, pero apuntan a camisetas `u`). Lo mas probable es que la asignacion
  este en codigo o en `chara_costume` con hashes de modelo 3D, no de icono.

**Pasivas con numero.** `pasivas-rareza.csv`
(`herramientas/construir_rareza_pasivas.py`) es la tabla de O-46 ya resuelta:
453 grupos x 6 rarezas, cada uno un id con su valor (+0,5 / +0,6 / +0,7 /
+0,8 / +1 para las rarezas 0-4; la sexta columna casi siempre vacia). Con eso:

- En el editor, cada pasiva de un jugador sale con su numero ("PP del equipo
  +1.5 %"): el id que lleva ya es la version de su rareza.
- En la base de datos, la pestana Pasivas agrupa por texto (191 lineas en vez
  de 1.716) con un desplegable de rareza que cambia los numeros; las que no
  dependen de la rareza (las de casilla de stat, "+3 / +5 / +7") ensenan sus
  valores fijos. En la ficha de un personaje los numeros siguen a la rareza
  elegida en los stats.

### O-149 · El pelo largo va detras de la camiseta: retrato en tres capas

Aaron vio que en el juego el pelo largo (Byron Love, David Samford, Thiago
Torres) queda **detras** de la camiseta y la cara **delante** del cuello, y en
el editor el pelo tapaba la camiseta. Los dibujos son solo dos (cara con pelo y
busto con cuello, sin ninguna mascara escondida en el alfa: se comprobo), asi
que se pinta en tres capas: la cara entera, el busto encima, y otra vez la cara
**cortada a la altura de los hombros** (`clip-path`). Por encima de esa linea
manda la cara, barbilla y cuello incluidos; por debajo, el pelo queda tapado por
la camiseta. La linea es la primera fila del busto con dibujo fuera de la franja
central del cuello, calculada para los 12.560 bustos en `hombros.csv`
(`herramientas/construir_hombros.py`), entre el 61 % y el 78 % de la altura.
Cortar mas arriba (por ejemplo donde empieza el cuello) no vale: el cuello del
busto sube hasta la boca y taparia la barbilla.

**Segunda vuelta (Aaron vio caras cortadas, sin cuello).** Dos causas: la
linea de hombros se calculaba como "primera fila con dibujo fuera del cuello"
y los cuellos altos de muchas camisetas la subian por encima de la barbilla;
y aunque estuviera bien, una barbilla ancha (las criaturas) o una cara baja
quedaba cortada. Ahora la linea de hombros es la primera fila en la que el
busto ocupa mas de la mitad del ancho (`hombros.csv`), y ademas cada cara
lleva su propia linea de barbilla (`barbillas.csv`): se toma el color de la
piel en el centro de la cara y se baja por la franja central mientras haya
pixeles de ese color (el pelo, de otro color, no cuenta). El corte es la mas
baja de las dos, asi que la barbilla y el cuello nunca se cortan y el pelo
largo sigue detras de la camiseta. Comprobado con Byron Love, Silica
Fieltour, Thiago Torres, Cade Shelby, Jambo Reemoth, Xene y las criaturas
A'ddah, A'kra y A'tac.

`opciones.datos_cuerpo(identidad)` da a las tarjetas `cuerpo`, `hombro` y
`cuerpo_tipo`; `capasRetrato()` (en `comun.js` y en el editor) monta las tres
capas. Y con los nombres que dio Aaron del filtro del juego (tipo 0/1 Normal, 2
Pequeno, 3 Robusto, 4 Alto, 5 Musculoso, 6 Grande, 7 Alto) hay filtro de
**Cuerpo** en la plantilla, la reserva, fichar y la base de datos.

### O-150 · Los numeros del partido: lo que se ha podido medir con capturas

Aaron mando nueve capturas de partido con su equipo `test2` (todos a nivel 22,
stats conocidos por la partida). Lo que cuadra y lo que no:

**Lo que cuadra.**

- **AT de tiro = Potencia + Control.** Gandares Baran (72 + 72 = 144) sale
  como "TOTAL AT 145" antes de chutar sin tecnica (hay 1 de mas que no se
  explica; puede ser un redondeo del juego).
- **Al chutar sin tecnica**: 145 -> 162 con "Tasa de brecha 10 %" y "Poder de
  afinidad 2 % (AT 3)": 145 x 1,10 = 159,5 (+3 de afinidad) = 162,5 -> 162.
  O sea, brecha = +10 % multiplicativo, afinidad = su % del subtotal, y se
  corta hacia abajo. El "AT N" que sale junto a la afinidad es justo eso: su
  aportacion. El "AT N" junto a la brecha NO es su aportacion (sale 16 con 0 %
  y 270 con 10 %): no se sabe que es.
- **La supertecnica no suma su poder entero.** En la lista de tiros del
  partido, "Tiro con efecto" (poder 200) sale como "AT 66" y "Grito del Eden"
  (640) como "AT 215": poder x 0,33 (con 1/3 seria 213, no 215; queda un pelin
  sin explicar, quiza por ser del elemento del jugador).
- **"Efectos elementales +20 %"** en un tiro de fuego por un jugador de fuego
  contra un portero de bosque (mismo elemento que el jugador y ventaja sobre
  el rival). No se puede separar cuanto es cada cosa.
- **"Atenuacion de distancia N"**: un tiro lejano resta AT (14 en esa captura).
  Es lo que hace que dos tiros iguales desde sitios distintos no den lo mismo, y
  por eso las capturas 1, 2, 3 y 7 (Renden y Berg, mismos stats 55+56, tecnicas
  de 300) no se dejan cuadrar entre si: 245, 222, 237 y 245 con brechas y
  afinidades distintas y distancia desconocida.

**Lo que no cuadra todavia.**

- **DF de foco.** Homer Grower (DEF, Tec 46 + Int 54 + Agi 43 = 143) sale con
  "DF 81"; Julia Blaze (MED, 70 + 85 + 54 = 209) con "DF 73". Ni la suma de la
  ayuda ni ninguna pareja de stats da esos numeros: hay algo mas (posicion,
  fatiga, tension, distancia al balon...). La calculadora sigue con la suma que
  dice la ayuda del juego, marcada como por confirmar.
- **PP del portero rival** (59, 46, 270) y los "AT" del rival en foco (117, 182)
  son de equipos de la historia sin datos de nivel: no sirven para ajustar.

La calculadora (`web/calculadora.html`) ya usa lo medido: supertecnica x 0,33,
brecha +10 %, afinidad, elemento 10 + 10 (por confirmar el reparto) y una
casilla de atenuacion por distancia.

**Lo que ayudaria a cerrar el resto** (para Aaron): un partido de sus dos
equipos entre si (modo versus con `test2` contra otro equipo suyo), chutando
siempre desde el mismo sitio (el punto de penalti), con y sin tecnica, y un par
de duelos de regate/defensa entre dos jugadores suyos: asi los dos lados son
conocidos y la distancia no cambia.

### O-151 · Revision general: sin duplicados, una sola escala de letra, pyflakes limpio

Aaron pidio "pulir todo bien bien" antes de irse a dormir. Lo hecho:

- **Codigo compartido de verdad.** El editor cargaba su propia copia de lo que
  ya estaba en `web/comun.js` (`el`, `pedir`, los iconos, `montaFiltros`,
  `capasRetrato`, las ventanas propias, `elegirCarpeta`, las tablas de colores).
  Ahora el editor carga `comun.js` y esas piezas viven en un solo sitio (243
  lineas menos en `editor.html`); `iconoJudia` se quedo con la version buena
  del editor (con clase y `onerror`). Los avisos de las piezas compartidas
  salen por el `aviso` del editor (`avisa = aviso`).
- **Una escala de letra.** Habia 26 tamanos distintos (8, 8.5, 9, 9.5, 10,
  10.5, 11, 11.5, 12, 12.5...). Ahora hay nueve, como variables:
  `--t-xxs` 9, `--t-xs` 10, `--t-sm` 11.5, `--t-md` 13, `--t-base` 15,
  `--t-lg` 17, `--t-xl` 20, `--t-2xl` 24, `--t-3xl` 30 (en `comun.css` y en el
  `:root` del editor, que no carga `comun.css`). Cada tamano viejo paso al
  paso mas cercano (script de un solo uso). Una sola familia de letra (la del sistema) y monoespaciada solo para rutas.
- **Estetica igualada** (viene de O-147): fondo de hexagonos, pestanas y
  botones azul marino con borde blanco en las cuatro pantallas; los titulos de
  seccion de la base de datos con una clase (`.titulo-seccion`) en vez de
  estilo en linea.
- **Python limpio**: `pyflakes` no dice nada en `ievr/`, `herramientas/` ni
  `pruebas/` (habia 21 avisos: imports sin usar en 15 herramientas, un
  `struct` y un `ident` sin usar en el servidor, tres variables sin usar en las
  pruebas). Sin `except:` a pelo; los `print` que quedan son de la linea de
  comandos de `escribir.py`, que es donde toca.
- **Comprobado**: las dos baterias en verde, `node --check` de las cuatro
  pantallas y `comun.js`, y las cinco pantallas abiertas en Chrome (editor con
  un jugador abierto, base de datos con un personaje abierto, calculadora,
  menu, mochila) sin errores nuevos en la consola.

Lo que se deja apuntado para otro dia: `ievr/escribir.py` (2.068 lineas) y
`ievr/servidor.py` (~1.050) siguen pidiendo partirse por temas, y el editor
aun lleva su propio CSS (no carga `comun.css`) porque sus cajas y botones
tienen forma propia; los colores y la escala ya son los mismos.

### O-152 · El programa de ventana: `IEVR Team Builder.exe`

Aaron pidio que fuera un programa en vez de una pagina, sin cambiar nada de
como es. `lanzador.py` hace lo del `.bat` (copiar la partida de Steam a
`partidas/para-editar`), arranca el servidor de siempre en un hilo y abre las
pantallas en una ventana propia (pywebview sobre el WebView2 de Windows, que
es el motor de Edge y viene con Windows 11). Al cerrar la ventana se para el
servidor.

`herramientas/construir_exe.py` lo empaqueta con PyInstaller en un solo
fichero (24 MB, con Python dentro). El .exe **no lleva** `web/`, `datos/` ni
las partidas: los lee de la carpeta donde esta, asi que tiene que quedarse en
la raiz del proyecto. Para eso `RAIZ` en `reglas.py`, `servidor.py` y
`comparar.py` se lee de la variable `IEVR_RAIZ`, que pone el lanzador
(dentro del .exe `__file__` apunta a una carpeta temporal y no valdria).
El icono es el balon de `datos/ui/balon.png` pasado a `.ico`.

Una trampa de Windows que salio al probarlo: si el puerto 8765 ya lo usa otro
programa (el servidor de desarrollo), abrirlo otra vez **no da error**
(`allow_reuse_address`) y los dos se quedan escuchando en el mismo puerto. Por
eso `servidor.preparar` prueba primero si alguien contesta en el puerto y, si
es asi, pasa al siguiente.

### O-153 · Marca: se llama Pizarra

Aaron pidio un nombre menos generico que "IEVR Team Builder", un logo y un
icono a juego con la estetica del programa (el icono anterior era el balon de
`datos/ui/balon.png`, que es un dibujo de 121x64 y salia aplastado).

- **Nombre: Pizarra.** La pizarra tactica del entrenador: donde se decide el
  equipo, se miran los jugadores y se hacen las cuentas. Corto, en castellano,
  y no lo lleva nadie mas. El .exe es `Pizarra.exe`; las ventanas y pestanas
  se titulan "Editor · Pizarra", "Base de datos · Pizarra", "Calculadora ·
  Pizarra".
- **Icono** (`datos/ui/pizarra-icono.svg`, dibujado a mano): la ficha
  hexagonal azul marino del menu, con su borde blanco y su aro celeste, y
  dentro una pizarra blanca con el campo dibujado con tiza, tres equis azul
  marino, tres circulos naranja, la flecha de la jugada en cian y el balon
  delante. Los colores son los del programa (`--panel`, `--aro`, `--cian`,
  `--naranja`). Se comprobo a 16, 24, 32, 48, 64 y 128 px: se sigue leyendo.
- El SVG se pasa a PNG con Chrome sin cabeza (fondo transparente) y de ahi
  salen `pizarra-icono.png` (1024), `pizarra-icono-64.png` (favicon de las
  cuatro pantallas) y `pizarra-icono.ico` (256/128/64/48/32/16, para el .exe).
  `herramientas/construir_marca.py` rehace los tres.
- **Logo del menu**: el icono al lado del nombre en letras gordas inclinadas
  ("PI" azul, "ZARRA" naranja) con la banda "VICTORY ROAD" debajo, como antes.

### O-154 · La ropa de gerentes y entrenadores: estaba en la tabla de modelos

Aaron pidio buscar a fondo la ropa propia de gerentes y entrenadores (O-148
la daba por no encontrada). Estaba en la tabla que ya se usaba para la talla:

    chara_base col 6 -> CHARA_MODEL_INFO -> col 5 = crc32 del dibujo de su ropa

Ese hash resuelve contra los nombres de `10_icon_chr/uniform/` y da dos cosas:
la **camiseta de equipo** con su diseno (`u011001_10`, siempre con talla 01 en
la tabla: la talla la pone el cuerpo), o la **ropa propia** del personaje,
un fichero unico que se llama como su `string_id` con `u` en vez de `c`:
`u11802060` es el peto con panuelo de Nerina Hartland, `u11802050` la camisa
hawaiana de Jambo Reemoth, `u06039110` el traje de Schemer Guile,
`u06039290` el traje blanco de Astero Black, `u11600120` la ropa de Lumina.
Son **307 personajes**: 123 de los 126 entrenadores de fabrica, 46 de los 55
gerentes y algunos jugadores de historia. Ya no hace falta el polo generico.

Por el camino salieron dos cosas mas:

- Las camisetas `51..58` **no son de chica**, son las **de portero** (Mark
  Evans -> `u010151`): las tallas son tipo + 1 desde 01 (campo) o desde 51
  (portero). El sexo esta en `CHARA_BODY_INFO` col 5 (4-7) y no cambia el
  dibujo. Corregido en `construir_cuerpos.py` (antes las chicas iban con la
  camiseta de portero).
- `chara_costume` es la tienda de trajes: por personaje (crc32 del
  `string_id`) una lista de trajes con su precio (100.000 / 200.000) y el
  modelo que cargan, que es otra fila de `CHARA_MODEL_INFO` (el traje de oso
  de Clark von Wunderbar es `u11600050`, 200.000). No se usa para el retrato
  porque no se sabe cual lleva puesto cada uno en la partida.
- Las 123 prendas de calle `o0004..o0034` siguen sin dueno: no las apunta
  ningun modelo de personaje. Seran del modo historia, como decia Aaron.

Los 244 modelos sin dibujo son las versiones de historia (`_5000`), que no
salen en ninguna lista; se caen a la camiseta de su equipo.

Matiz importante: en 3.749 jugadores el modelo trae la camiseta del Raimon
(`u010101`) **de serie** aunque sean de otro equipo (Ignacio Gerhardt, Mars
Hung, John Bleach...), asi que para la camiseta de equipo sigue mandando la
del equipo de historia (O-77); del modelo se coge la ropa propia, si es de
portero, y la camiseta solo cuando no es la de serie (256 casos, p. ej. Jude
Sharp con la de la Royal Academy).

### O-155 · Los equipos de la Bahia de Batalla (modo "enjoy"): tabla encontrada, plantillas sin descifrar

Aaron propuso usar los equipos fijos de la Bahia de Batalla (no se pueden
tocar, todos a Nv. 40) para medir las formulas del partido con los dos lados
conocidos. Lo que hay en los datos:

- `team/enjoy_mode_team_config` -> `ENJOY_MODE_TEAM_INFO_LIST`: **28 filas**,
  una por equipo del modo, con su imagen (`ev_chronicle_img/ev_bb_s10g001_01`,
  `bb` = Bahia de Batalla) y cinco identificadores (cols 0, 1, 2, 4, 8) que
  **no cuadran con nada**: ni ids de personaje, ni crc32 del `string_id`, ni
  ids de `belong_team`, ni los textos (el nombre "Equipo de Mister Yi" esta en
  `map_text`/`chara_text` con otro id), ni al reves, ni como crc de formas
  razonables (`tm_...`, `team001`...). La col 1 se repite entre dos equipos
  (s10 y s14), asi que sera el equipo "padre" o el capitan que sale en grande.
- `team/team_config` -> `SOCCER_TEAM_MEMBER_LIST` (11.156 filas x 28 cols) es
  la tabla de plantillas: col 2 apunta a `TEAM_MEMBER_SKILL_CONFIG_INFO_LIST`
  (seis supertecnicas por miembro, resuelto: "Mano celestial, Mano magica...")
  y col 10 parece el dorsal. Pero cols 0 y 1 (personaje y equipo) son
  identificadores que tampoco cuadran con nada de lo anterior. Sin la clave
  de esas dos columnas no se puede sacar quien juega en cada equipo.
- `soccer_opponent_info` (155), `opponent_team_config` (17 + 404 dificultades
  + 101 amistosos) y `game_quest_config` no referencian los ids del modo.

Lo que si vale: los jugadores de esos equipos van a Nv. 40 y, siendo
plantillas fijas, lo normal es que lleven los stats base de su rareza sin
arbol ni judias; eso lo da `stats.base(identidad, 40, rareza)`. Asi que si
Aaron dice **quienes son** (nombres y rareza, que se ven en la pantalla del
equipo), los stats de los dos lados salen de las tablas y las capturas de
duelo sirven para ajustar los porcentajes.

### O-156 · Tres jugadores de la Bahia de Batalla: la supertecnica crece con el nivel

Aaron mando las fichas de Jimmy Wongfu, Byron Love y Mark Evans del "Equipo de
Mister Yi" (Bahia de Batalla, todos Nv. 40, "Leyenda del futbol").

**Stats.** Son sus versiones normales x 1,4 (Leyenda) mas un arbol grande en
los tres stats principales de su posicion de origen: Jimmy y Byron (MED de
origen aunque en la Bahia juegan de DF) llevan +37 Tecnica, +36 Control y +31
Inteligencia sobre `floor(base x 1,4)`; Mark (POR) +36 Agilidad, +35 Fisico y
+31 Presion. Los otros cuatro stats son exactamente `floor(base x 1,4)`. O sea,
las plantillas fijas llevan tablero completo. Como el tablero entero no esta
descifrado (O-140 solo cubre tronco y ramas), para calcular con esos equipos
hay que leer los stats de la ficha, que es lo que Aaron hace con la captura.

**La supertecnica crece con el nivel.** En la lista de tecnicas de la ficha:

    Nv. 22 (Gandares Baran)   poder 200 -> AT 66     poder 640 -> AT 215   (x 0,33)
    Nv. 40 (los tres de arriba) poder 440 -> 217, 540 -> 266, 640 -> 314   (x 0,49)

Cuadra con **AT de la tecnica = poder x (nivel + 15) / 112** (a Nv. 22 da 0,33,
a Nv. 40 0,491 y a Nv. 99 el poder entero), con un error de 1-3 puntos que
sera redondeo o el efecto del elemento propio. La calculadora ya lo usa con el
nivel del jugador en vez del 0,33 fijo.

### O-157 · El tiro, medido: Equipo de Mister Yi contra Plathos (Bahia de Batalla)

Aaron mando las 11 fichas de cada equipo (todos Nv. 40, stats y tecnicas
completos), las pasivas de equipo y nueve duelos con los numeros del juego. Con
los dos lados conocidos, esto es lo que cuadra **exacto** en los tiros:

    TOTAL AT = floor( (Pot + Ctrl) x (1 + pasivas de tiro) )
             + floor( AT de la tecnica x (1,15 si es del elemento del jugador) x (1 + pasivas de tiro) )
             + floor( todo lo anterior x poder de afinidad % )

| tiro | base | pasivas | tecnica | afinidad | calculado | juego |
|---|---|---|---|---|---|---|
| Caleb sin tirar | 123+167 = 290 | +1,5 % (la de "distintos elementos") | - | - | 294 | 294 |
| Elliot sin tirar | 165+164 = 329 | 0 % | - | - | 329 | 329 |
| Elliot chuta sin tecnica | 329 | 0 % | - | 1 % (AT 3) | 332 | 332 |
| Elliot, Tiburon abisal (viento, no es el suyo) | 329 | 0 % | 266 | 1 % (AT 5) | 600 | 600 |
| Elliot, Pinguino perfecto (bosque, el suyo) | 329 | 0 % | 266 x 1,15 = 305 | 1 % (AT 7) | 641 | 641 |
| Alexander sin tirar | 119+171 = 290 | +9,3 % | - | - | 317 | 317 |
| Alexander chuta sin tecnica | 290 | +9,3 % | - | 2 % (AT 6) | 323 | 323 |
| Alexander, Uno para todos (montana) | 290 | +9,3 % | 266 x 1,093 = 291 | 4 % (AT 25) | 633 | 633 |

Y con esto se reinterpretan las de O-150: el +10 % que se atribuia a la brecha
en Gandares era su pasiva de tiro, y el 1,15 del elemento propio cuadra tambien
en Renden a Nv. 22 (111 + 99 x 1,15 = 225 x 1,057 = 238, juego 238).

Conclusiones:

- **La "tasa de brecha" no suma AT**: Alexander chuta con brecha 11 % y el
  total es base + afinidad, sin mas. Es la probabilidad de brecha. El "AT" que
  sale a su lado (1407, 539, 867...) no es un sumando; sigue sin saberse que es.
- **Las pasivas de AT de tiro multiplican la base y la tecnica**, y el % que
  el juego ensena abajo (iconos de la barra inferior) es el que esta activo en
  ese momento (Caleb "2 %" es el 1,5 % redondeado; Alexander "10 %" es 9,3).
- **La tecnica del elemento del jugador vale un 15 % mas.** El elemento del
  tiro respecto al portero va en la parada: "Efectos elementales +20 %" cuando
  el del tiro gana al del portero, +0 % si no (Byron, bosque, contra Mark,
  montana).
- **PP del portero = 3 x (Fisico + Agilidad + Presion)**: Ash Barnes 463 x 3 =
  1389 (juego 1407, +1,3 % de alguna pasiva); Mark 470 x 3 = 1410 (juego 1427).
  Tras una parada el portero queda "gastado": 1407 -> 1049 (x 0,75).
- **Atenuacion de distancia**: resta AT en la parada (14 y 53 vistos). Y hay
  algo mas en el tiro de Byron (651 esperados, 321 + 53 en la parada) que
  parece perdida de poder al atravesar el muro; sin datos para cerrarlo.
- **Foco**: Heath (MC) defiende con "DF 335" = Presion + Inteligencia +
  Agilidad exactos, pero tambien = (Tecnica + Inteligencia + Agilidad) x 0,9,
  y en el otro regate la afinidad ganada/perdida (flechas verdes/amarillas)
  multiplica los numeros (Torin 422 -> 553). No se puede cerrar con dos duelos.

La calculadora (`web/calculadora.html`) ya usa la formula del tiro y el PP
x 3; la brecha desaparece de la cuenta.

### O-158 · Para otros ordenadores: partida de cualquier cuenta, zip portable y actualizaciones

Aaron quiere pasarle el programa a un amigo y que se actualice solo.

- **La partida de cualquier cuenta.** Hasta ahora todo asumia el nombre
  `002AB8F4-USERDATALIVE`, que es el de la cuenta de Aaron; cada cuenta de
  Steam tiene sus 8 hexadecimales, y el nombre es la clave de cifrado (O-01),
  asi que no se puede renombrar. Ahora `escribir.es_partida` / `partida_en`
  aceptan `XXXXXXXX-USERDATALIVE`, la `Sesion` recuerda el nombre y `guardar`
  lo exige (se escribe siempre con el nombre original). Probado con la de
  Aaron; con otra cuenta solo se podra probar cuando la haya.
- **Buscar la partida en Steam.** `servidor.partidas_de_steam()` mira la
  carpeta de Steam del registro de Windows (`HKCU\Software\Valve\Steam\
  SteamPath`), las rutas de siempre en C-H y la de Aaron, y devuelve todas las
  partidas `userdata/*/2799860/remote/*-USERDATALIVE` por fecha. El lanzador
  coge la mas reciente y limpia de `partidas/para-editar` cualquier otra para
  que no se mezclen. En el PC de Aaron encuentra la suya y una vieja de 2025.
- **Zip portable** (`herramientas/empaquetar.py`): el .exe mas `web/`, tablas,
  `datos/ui`, recortes y `200_icon` (los 19.534 dibujos, 450 MB); sin
  `datos/juego` (10 GB). Se descomprime y se abre, sin instalar nada. Lleva
  dibujos del juego: es para pasarlo en privado, no para colgarlo.
- **Actualizaciones** (`ievr/actualizador.py`): al arrancar, si existe
  `actualizaciones.url` en la raiz, se lee el `version.json` de esa direccion
  y, si la version es mayor que `version.txt`, se pregunta con un cuadro de
  Windows; si se acepta se baja `pizarra-datos.zip` (se extrae encima: solo
  `web/`, `datos/`, `version.txt`, `actualizaciones.url`) y `Pizarra.exe` como
  `Pizarra.nuevo.exe`, y un `actualizar.cmd` espera a que el programa se
  cierre, cambia el .exe y lo vuelve a abrir. Sin red o sin fichero de
  direccion, no hace nada y el programa abre normal. `herramientas/publicar.py
  VERSION "notas"` construye y deja (o sube con `gh`) los tres ficheros.
  Hecho el mismo dia: Aaron creo `https://github.com/Araro98/pizarra`, se
  instalo `gh` (winget), inicio sesion con el codigo de un solo uso, se subio
  el codigo (sin `datos/iconos`, sin el .exe, sin `CONTEXTO.md`) y se publico
  la release `v2026.09.16` con `Pizarra.exe`, `pizarra-datos.zip` (58 MB) y
  `version.json`. `actualizaciones.url` apunta a
  `.../releases/latest/download/version.json`, asi que cada release nueva es
  la que ven los .exe repartidos. Probado el actualizador contra la release
  real en una carpeta aparte con version vieja: baja el zip, lo extrae y sube
  la version. Para publicar otra: `py herramientas\publicar.py VERSION "notas"`
  con `gh` en el PATH (`C:\Program Files\GitHub CLI`).

### O-159 · Ordenar la equipacion por lo que sube

Aaron pidio poder ordenar botas, brazaletes, colgantes y especiales por el stat
que suben, para encontrar las mejores. `opciones._stats_de` da a cada objeto
de equipacion sus siete numeros (`stats`, de `bonus-objeto.csv`) y el `total`;
en la mochila, en esas cuatro pestanas, hay un desplegable "Ordenar por"
(nombre, total, +Potencia, +Control, ... +Inteligencia), y el selector de
equipacion de la ficha del jugador lleva las mismas opciones en su "Ordenar".

### O-160 · Las formaciones: donde va cada puesto, del propio juego

Aaron vio que la pantalla de equipo pintaba siempre 4-3-3 aunque el equipo
llevara otra formacion, y pidio ademas saber que es cada hueco.

- `formation/formation_config` es RDBN pero el volcador de referencia se cae
  con el (un tipo de campo que no conoce, el de las posiciones). Se escribio
  `herramientas/rdbn.py`, un lector propio en Python que saca los tipos raros
  como floats por su tamano. Tablas: `m_SoccerFormationInfoList` (115
  formaciones: `formId`, rango de 11 filas en `m_SoccerFormPlacementInfoList`,
  poder de ataque y defensa) y los puestos (`positionNo`, `positionId`,
  `startPos` y las posiciones de defensa, ataque, corners y penaltis).
- El id de la partida es el del **objeto** formacion; `item/item_config` ->
  `ITEM_FORMATION_INFO_LIST` col 16 lleva el `formId`. Con eso las 11
  formaciones que existen como objeto (las unicas que puede llevar un equipo)
  quedan resueltas en `formaciones.csv` (`construir_formaciones.py`).
- `positionId`: 1 portero; 2 y 3 defensas; 4-7 medios; 8-10 delanteros. Lo
  dicen los pesos de linea de `m_SoccerPositionInfoList` y cuadra con la
  pantalla del juego (4-3-3 Triangulo: puestos 1-4 DF, 5-7 MC, 8-10 DC).
- **Los puestos 0-10 de la partida son los `positionNo` de la formacion**: el
  0 es siempre el portero y el resto van en el orden de la tabla.

- Aaron paso capturas de la pantalla de formacion del juego con el mismo
  equipo en las 8 formaciones: se ve que **al cambiar de formacion cada jugador
  se queda en su puesto y lo que cambia es lo que es ese hueco** (Nobby Shinn
  sale de MC en la 5-4-1 y de DC en la 4-3-3 Delta). El juego rotula la tarjeta
  con el papel del hueco, no con la posicion natural del jugador.
- Las `startPos` no dan la pantalla tal cual (el juego reparte las filas a su
  manera y `bustupPos` no lo explica), asi que `construir_formaciones.py` lleva
  la posicion de cada tarjeta **medida de las capturas** (`px`, `py`, de 0 a 1).
- Las tres formaciones "B-" (Raimon, Nagumo Hara, Club de Beisbol) tienen 5
  puestos y son de equipos de la historia: Aaron confirma que no se pueden
  poner, asi que `legal = 0` y el editor no las ofrece.

El editor pinta el campo como la pantalla del juego (vertical, con sus areas y
el circulo central), cada tarjeta donde la pone el juego y debajo el rotulo
POR/DF/MC/DC de ese hueco en esa formacion.

### O-161 · Idolos y Diamantes se pueden fichar sin tener una copia

Aaron: "hay algunos diamantes e idolos que no me deja pillarlos en fichar, dice
que no tengo ninguna copia en el juego y salen en gris". Desde O-67 el editor
solo los creaba copiando rareza, arquetipo y pasivas de una copia que ya
hubiera. Comprobado sobre la partida (61 Idolos y 58 Diamantes distintos) que
las tablas del juego dicen lo mismo que las copias:

- **Rareza**: `chara_param` col 41 (= `rareza_valor` de `personajes.csv`)
  coincide con la partida en los 119 (Idolos 5/6/7, Diamantes 8).
- **Arquetipo de un Idolo**: `chara_param` col 5, con los mismos numeros que la
  partida (0 Brecha, 1 Contra, 2 Afinidad, 3 Tension, 4 Juego sucio, 5
  Justicia). Coincide en los 61. Ahora va en `personajes.csv` como
  `arquetipo_valor`.
- **Arquetipo de un Diamante**: en la partida los 58 llevan el valor **6**, que
  no es ninguno de los seis con nombre ("sin arquetipo"). La col 5 de un
  Diamante trae otra cosa (Gandares: 2) y no se usa.
- **Pasivas**: vacias (20 bytes a cero), que es como las guarda el juego en los
  95 Idolos y en los Diamantes nativos (O-67).

`escribir.crear_jugador` usa la copia si la hay y si no estas tablas; Fichar ya
no pone a nadie en gris.

### O-162 · Idolos y Diamantes: que escribe el juego al invocarlos, y sus pasivas fijas

Aaron borro sus Sonny Wright e invoco dos rojos (Tension) y dos plateados
(Afinidad) con las capsulas, guardo, y se leyo la partida de Steam sin tocarla.
Con eso queda cerrado lo que O-67 y O-161 dejaban a medias:

- **Lo que escribe el juego**: ficha con las pasivas (`0x66B81DAF`) **a cero**,
  heredadas a cero, tablero con la casilla 0, y en `0x45E2D879` (en que casilla
  del arbol va cada tecnica) `00 02 04 08 0a 0c ff ff ff`. Y en las ranuras de
  tecnica **seis** referencias (tronco + su unica rama), no tres. Medido en
  todos los de nivel 1 hechos por el juego: normal `00 02 04 ff...` y 3 tecnicas;
  Idolo `08 0a 0c` y 6; Diamante `09 0b 0d 13 15 17` y 9.
  `escribir.anadir_jugador` escribe eso por familia; el Sonny del editor y el
  del juego ya no se distinguen en nada mas que sus numeros de serie.
- **Los Sonny "invocados" del dia anterior no venian de las capsulas**: llevaban
  pasivas sorteadas como un normal y `ff ff ff`; por eso se veian distintos.
  El juego ensena las pasivas **guardadas** (Axel Nv.14 las tiene sorteadas y
  ensena esas, subidas al valor de su rareza), y las fijas solo cuando el campo
  esta a cero.
- **De donde salen las fijas**: `chara_param` col 10 (solo Idolos y Diamantes
  nativos la tienen) es la clave de `ABILITY_LEARNING_BOARD_INFO_LIST`
  (skill/ability_learning_config), que da el tramo de
  `ABILITY_LEARNING_BOARD_EFFECT_LIST` con las 17 casillas de **su propio
  tablero**: 6 tecnicas, 5 pasivas y 6 subidas de stats. Las 5 pasivas, en
  orden, son las de la pantalla "Pasivas de equipo": cuadran con las fotos de
  Sonny rojo, Sonny plateado y Axel plateado, y dos copias del mismo salen
  iguales (Aaron). `construir_pasivas_fijas.py` -> `pasivas-fijas.csv`
  (186 personajes: los 147 Idolos y 39 Diamantes nativos; los normales que
  acaban de Diamante conservan sus sorteadas). El editor, la base de datos y
  las sumas del equipo ensenan esas cuando el campo esta a cero, cada una con
  el numero de su version mas alta, que es como las ensena el juego.
- **El tablero de un Diamante** tiene 28 casillas: tronco (0-7, con 2
  pasivas), rama 1 (8-17, 3 pasivas) y rama 2 (18-27, otras 3); la segunda
  columna de cada casilla es el nivel al que se abre. Se ensenan tronco + rama
  elegida. Los 33 Diamantes **sin** tablero propio son los que solo existen
  como version Diamante de un normal. Aaron invoco a Raika Shinohara Diamante:
  el juego la deja **igual que a los demas** (pasivas a cero, 9 tecnicas,
  `09 0b 0d 13 15 17`) y en pantalla le ensena 5 pasivas (AT de tiro +3,5 %
  cercanos, DF del muro +3,5 % cercanos, mismo elemento AT propio de tiro +8 %,
  y la pareja de Tension +6 % / +2 %) que no salen de ningun tablero propio ni
  de su sorteo: vienen de un tablero generico que aun no se ha localizado
  (`ABILITY_LEARNING_TABLE_INFO_LIST`, 1.159 claves que no son ni la identidad
  ni ninguna columna de chara_param). El editor los crea bien; solo le falta
  ensenar esas 5 en la ficha. **Pendiente.**
- Aaron avisa: un Diamante puede cambiar de rareza dentro del juego, y los
  entrenadores y gerentes llevan sus propias pasivas (las listas
  `ABILITY_LEARNING_SUPPORTER_PASSIVE_*`). Sin mirar todavia.

### O-163 · Diamantes: arquetipo elegible, semilla, personal, y las pasivas de cada cosa

Aaron: un Diamante elige arquetipo dentro del juego (fotos de Raika Shinohara
Diamante con los seis), cualquiera de los 5.000 puede ser Diamante con semilla
o tienda, y gerentes y entrenadores llevan otras pasivas. Y los Idolos ni
cambian de arquetipo ni pueden ser personal.

- **Tableros por arquetipo**: `character/basara_chara_config` ("basara" es
  como llama el juego al Diamante). `m_basaraBuildInfoList` (identidad al
  reves) -> `m_basaraBuildTypeList`: seis (arquetipo, tablero de
  ability_learning) por Diamante, 70 Diamantes. Cada tablero: 28 casillas,
  tronco con 2 pasivas, cada rama con 3; **la ultima pareja es la del
  arquetipo** y es la misma para todos (Idolos incluidos): Brecha
  84E41252/B14171BB, Contra CF6EEDEE/595EEA99, Afinidad 186FF180/C99ABCE7,
  Tension 47B73F79/72125C90, Juego sucio 41436E70/32FAAE67, Justicia
  9642721E/4C2BAEB7. Raika: las tres primeras iguales en las seis fotos y la
  pareja cambia; el tablero de orden 0 (Tension en su caso) es el que ensena
  sin arquetipo elegido. `pasivas-fijas.csv` lleva ahora `origen` (propio /
  basara), `arquetipo` y `orden`.
- **Donde guarda la partida el arquetipo elegido: sin resolver.** Raika, tras
  pasar por los seis y quedarse de entrenadora de Justicia, sigue con el byte
  de arquetipo a 6 y su ficha solo cambio en la medalla (0x8F0E9F49 =
  05601900, la Medalla de entrenador) y en el contador 0x1238E5AC. Los 60
  Diamantes de la partida llevan 6. Pendiente de una partida guardada con
  Raika de jugadora y un arquetipo concreto.
- **Semilla Diamante** (46 ascendidos en la partida, identidad normal):
  rareza 8, arquetipo 6, pasivas y heredadas a cero, rama 0, ranuras
  `00 02 04 09 0b 0d 13 15 17`, las **nueve** tecnicas puestas; el arbol se
  queda. `escribir.poner_diamante` hace ahora todo eso (antes solo la rareza),
  y Fichar tiene la pestana "Con semilla" para fichar a cualquiera ya como
  Diamante (`anadir_jugador_diamante`).
- **Personal**: `ABILITY_LEARNING_SUPPORTER_PASSIVE_INFO/BUILD/SET`: rol 0
  entrenador, 1 gerente; por arquetipo 15 juegos de 5 pasivas con clave 1..14
  y 100. **La clave 100 es la del Diamante**: Raika Justicia entrenadora = DF
  del muro +8 % x2 + Justicia +1,6 % x3; gerente = +4 % x2 + +0,8 % x3, tal
  cual las fotos. `pasivas-personal.csv` (`construir_pasivas_personal.py`).
  Que clave (1-14) usa un normal esta por confirmar: los juegos van en bloques
  de tres por familia de stat (tiro, foco, disputa, muro) mas dos mixtos.
- El editor: un Idolo no puede pasar a gerente ni entrenador ni cambiar de
  arquetipo; un Diamante ensena "sin elegir" y no deja tocar el arquetipo
  hasta saber donde va; la ficha de un gerente o entrenador Diamante ensena
  sus pasivas de personal.

### O-164 · Personal: la clave de cada personaje, y lo que llega del juego

Aaron paso fotos de tres gerentes y tres entrenadores recien invocados (Celia
Hills, Nelly Raimon, Silvia Woods, Percival Travis, Axel Blaze, Alessio
Ganonti), y la partida de Steam con ellos:

- **El juego de pasivas de personal de un normal es `chara_param` col 6**
  (`clave_personal` en personajes.csv): Celia 8, Nelly 1, Silvia 2, Percival
  7, Axel 5, Alessio 1, y los seis cuadran con su foto (juego del rol y del
  arquetipo de esa copia). Los juegos van por familia de stat: 1-3 tiro, 4-6
  foco, 7-9 disputa, 10-12 muro, 13-14 mixtos; 100 el Diamante.
- Un gerente o entrenador **de fabrica** llega del juego como un normal
  cualquiera (pasivas de jugador sorteadas de su pool, `00 02 04 ff...`, 3
  tecnicas) **mas la medalla puesta** en `0x8F0E9F49` (3160c900 gerente,
  05601900 entrenador: el hueco de mochila del monton de medallas). Lo que
  ensena en "Pasivas de equipo" NO son esas sorteadas sino el juego de
  personal. `anadir_jugador` le pone ahora la medalla al ficharlo.
- Un normal **convertido** con la medalla empieza sin pasivas de personal y se
  le dan en el juego con objetos (Aaron). En que campo van esas, sin muestra
  todavia: Clark von Wunderbar (convertido) lleva todo a cero.
- **Raika con Contra elegido como jugadora**: el byte de arquetipo sigue a 6 y
  lo unico que cambia en su ficha son dos casillas del arbol (28 y 33) del
  tramo 28-39 que O-115 dejo sin identificar, y la copia de nivel. Los
  Diamantes de nivel 50+ llevan 28-32 (o mas) puestas. Hipotesis: la eleccion
  de arquetipo es "comprar" casillas de ese tramo. **Descartado**: con
  Afinidad elegido siguen siendo 28 y 33, y Clark von Wunderbar (entrenador
  normal con una pasiva de entrenador puesta) lleva las mismas dos casillas.
  Esas dos casillas parecen ir con haber sido personal, no con el arquetipo.
- Las pasivas de personal de un convertido (Clark cambio la "Pasiva de
  entrenador 43", disputa +10 % mismo elemento, por la 42, foco +1,5 %)
  **tampoco estan en su ficha**: pasivas a cero, sin objeto en la mochila con
  ese nombre. Los unicos sitios de la partida que nombran el slot de Raika o de
  Clark son listas de slots y un registro pequeno por jugador (campos
  `3A0D9419` = slot, `73700B76` = 2 bytes, `709A88E9` = 1 byte, `E2A3657B` = 4
  bytes; Raika nueva 13/12, Raika vieja 11/9 y 1/0), aun sin descifrar. Copia
  de la partida del 16-9 14:20 guardada aparte para comparar con la siguiente.

### O-165 · La partida guarda siempre la version base de cada pasiva

Al contrastar las fichas de personal (O-164) salio esto, que corrige O-46: en
la partida de Steam, **las 13.885 pasivas guardadas de jugadores normales son
todas la version 0** de su grupo, sea el jugador de rareza 0 o Leyenda. Los ids
de las versiones 1-4 existen en las tablas pero no se escriben nunca. Es el
juego el que sube el numero al ensenarla: Celia Hills Leyenda guarda "disputa
+1 %" y ensena "+2 %"; Axel Blaze Idolo Nv.14 guarda "disputa +8 %" y ensena
"+13 %" (version 4). Regla: rareza 0-4 -> version 0-4; Idolo y Diamante -> la
4. `O.variante_por_rareza` la aplica en la ficha del editor, en las sumas del
equipo (y por tanto en la calculadora) y en las pasivas de personal.
**Comprobado**: Orville Newman Leyenda (foto de Aaron) ensena foco +1,1 %, foco
propio +6 %, disputa propia +13 %, afinidad +10 % y muro +2 %, que es
exactamente lo que da `variante_por_rareza` sobre sus cinco ids guardados
(version 0). Y coincide con lo que ensenaba Axel Idolo (version 4 tambien).

### O-166 · La tabla de pasivas CON NUMERO: lo que el juego ensena de verdad

Comparando byte a byte dos partidas de Steam (Raika de Afinidad y Clark con la
"Pasiva de entrenador 42" frente a Raika de Brecha y Clark con la 43) salio
donde estaba todo lo que faltaba:

- Aparte de la ficha, la partida lleva una **tabla de 6000 x 5 registros**
  (cabecera `C86C5ADB`, cada jugador `4307B6FA` con 5 hijos): por registro
  `5D2A9A7A` = id de la pasiva, `11F630D2` = su numero como float y `9A091BF4`
  = marca (0 cerrada, 1 desbloqueada). 41 bytes por registro, 221 por jugador,
  en el orden de las filas. **Es lo que el juego ensena y usa**:
  - Orville Newman Leyenda: la ficha guarda ids base y la tabla lleva las
    versiones 4 con 1,1 / 6 / 13 / 10 / 2, lo de su foto.
  - Sonny plateado y Raika Diamante: ficha a cero, tabla con sus fijas.
  - Celia Hills gerente: ficha con sus pasivas de jugadora, tabla con las de
    personal (ids base del juego de clave 8 con numeros ya subidos: 2 / 2 / 1 /
    0,4 / 5; un entrenador lleva la pareja a x3). Esos numeros no salen de las
    tablas de rareza (los ids de personal solo tienen version 0): los pone el
    juego, y las pasivas de personal son objetos con un grado ("E 16").
  - Clark (convertido): ficha a cero, tabla con la pasiva de entrenador que le
    dio Aaron (foco +1,5 -> disputa +10 al cambiar el objeto).
  - Raika de Brecha: la pareja 4-5 de la tabla cambia; el byte de arquetipo de
    la ficha sigue a 6. Ahi vive el arquetipo elegido del Diamante.
- La tabla **conserva los registros de quien ocupo la fila antes**: al fichar
  se vacian los cinco de esa fila antes de rellenar.
- **El arquetipo elegido del Diamante es el array de 1 byte x 6000
  `14CDA97F`** (0 Brecha ... 5 Justicia, como los demas): Raika paso de 2
  (Afinidad) a 0 y Aaron confirmo en el juego que es Brecha. La tabla de
  pasivas se queda con la pareja anterior hasta que el juego la refresca (en
  la partida de las 14:25 aun llevaba la de Contra), asi que manda el array.
  El juego se lo escribe al invocar (34 de los 48 Diamantes de nivel 1 lo
  llevan a 1-5): el editor pone el de serie al fichar o ascender (el primer
  tablero basara; Raika, Tension) y `poner_arquetipo_diamante` lo cambia.

Consecuencia: el editor **lee** la ficha y las sumas del equipo de esta tabla
(`jugador.tabla_pasivas`), y tras cualquier cambio de un jugador la **deja como
la dejaria el juego** (`escribir.sincronizar_tabla_pasivas`, enganchado en
`Sesion.aplicar`): normales con la version de su rareza, Idolos y Diamantes con
sus fijas (respetando la pareja elegida), y el personal se deja como este (sus
numeros son del juego; a uno recien fichado de fabrica se le deja a cero y el
juego se la rellena, como hizo con Buddy Arnolds). O-165 sigue valiendo como
regla de los numeros de los jugadores, pero ya no hace falta calcularla: esta
escrita en la tabla.

### O-168 · Un jugador que apunte a montones de objetos, el juego lo trata como del universo

Aaron ficho a Terry Archibald rosa con la 2026.09.16.3 y el juego le ensenaba
tres tecnicas y pasivas sorteadas. La partida que escribio el editor
(`partidas/test-cambios3`) llevaba la ficha a cero, seis tecnicas y la tabla de
pasivas con sus fijas; la que guardo el juego despues tenia **la ficha con
cinco pasivas sorteadas** y todo lo demas igual. Registro por registro, la
unica diferencia con un Sonny invocado por el juego eran las filas de
biblioteca a las que apuntaban las tecnicas: el editor reutilizaba cualquier
fila que ya usara otro jugador, y dos de las de Terry eran **montones de
objetos** (sub 2, 99 unidades: los manuales de tecnica de la mochila). Los
fichados por el universo de jugadores apuntan justo ahi, y son los que llegan
con pasivas sorteadas y tres tecnicas: el juego, al ver esas referencias,
inicializa al jugador como si viniera del universo.

Los que entrega el juego apuntan a filas de **tecnica aprendida**: kind 3,
sub 10 (o 9), una unidad, y el contador de "cuantos la llevan" que el juego
mantiene. `_biblioteca_de_tecnicas` solo reutiliza esas, `_meter_en_biblioteca`
crea las nuevas con esa forma, y al reutilizar una se suma uno al contador.
Con eso un Terry, un Sonny o un normal del editor apuntan a las mismas filas
que los del juego.

Segunda vuelta (Aiden Froste rojo, 2026.09.16.4): tambien hay **montones de
99 manuales con sub 10**, y el juego los trata igual que los de sub 2. La
condicion buena es **una sola unidad** (cantidad 1): 492 filas de sub 10 y 54
de sub 9 en la partida son asi, y son a las que apuntan todos los de nivel 1
que entrega el juego. Y una tecnica repetida en el arbol (Frente frio tres
veces) va a **una sola fila**, con el contador de "cuantos la llevan" sumado.

### O-169 · `0xBAFA8DBD`: el tablero que el juego le tiene asignado a cada jugador

Tras O-168 Aiden Froste rosa del editor seguia saliendo con tres tecnicas y
pasivas sorteadas. Se enumeraron TODAS las estructuras de la partida con una
entrada por jugador (19 arrays y 6 contenedores de 6.000) y se comparo al
Aiden del editor con el Sonny invocado: la unica diferencia es el array
`0xBAFA8DBD` (4 bytes x 6000): Sonny lleva `A264FA75`, que es **su tablero de
habilidades** (col 10 de chara_param); el del editor lleva 0. Sin tablero el
juego trata al jugador como fichado del universo (Axel Idolo Nv.14, que vino
del universo, tambien lleva 0): tres tecnicas y pasivas sorteadas.

Lo que lleva cada uno, en la partida:
- Idolos: su tablero propio (col 10), los 100 que entrego el juego.
- Diamantes: el tablero basara de **su arquetipo elegido** (`14CDA97F`), los 57
  nativos sin excepcion (Raika de Brecha: `A9320039`).
- Normales: 0 (el generico va por otra via). Destin Billows, el propio.
- Normales ascendidos con semilla: uno de los juegos basara; va con posicion,
  elemento y tipo (col 4 de chara_param) pero no del todo (35 de 43 en Brecha a
  Juego sucio; Justicia varia mas). `tableros-diamante.csv` lleva el mas comun.

El editor lo escribe al fichar (`tablero` de personajes.csv para un Idolo,
basara para un Diamante), al ascender con semilla y al cambiar el arquetipo de
un Diamante. Y `tableros.csv` (`construir_tableros.py`) lleva las pasivas de
TODOS los tableros del juego: las fijas de un jugador salen del tablero que
tiene asignado, sea el propio, el basara o el generico de un ascendido (Nerina
Hartland ascendida con el editor lleva ahora las del tablero de portera de
Brecha, no las viejas). Al ascender con semilla, el arquetipo del Diamante
empieza siendo el que tenia de normal. Y las pasivas de un normal fichado se
sortean de verdad entre las legales (ranuras 1-2 de su pool, 3 del arquetipo).

### O-170 · Borrar jugadores desde el editor

Aaron: "mete lo de borrar jugadores desde el editor, excepto si estan en algun
equipo". `escribir.borrar_jugador` ya existia (P-10) y se niega si el jugador
lleva algo equipado; ahora ademas se niega si esta en algun equipo (campo,
banquillo o cuerpo tecnico: `equipos_del_jugador`, que recorre las
alineaciones). La ficha lleva el boton "Borrar jugador" con confirmacion, y
sale vetado con el nombre del equipo si esta metido en uno. Se puede deshacer.

### O-171 · Que tecnicas se pueden dar, y a que fila tienen que apuntar

Tres cosas de Aaron a la vez:

- **Las tecnicas puestas con el editor no se ven en el juego hasta entrar en
  el arbol** (Marvin Murdock). Es O-168 otra vez: `poner_tecnica` apuntaba la
  ranura a la primera fila poseida, que era el monton de 99 manuales de la
  mochila. Ahora apunta a una fila de tecnica aprendida (una unidad), la que
  ya use alguien o una nueva, igual que al fichar. "Arreglar las tecnicas"
  (pestana Resumen) repasa las ranuras que apuntan a montones y las cambia.
- **Hay tecnicas que el juego no deja dar**: las 151 que son la tecnica de un
  espiritu (aura_skill_config las referencia: Carga de pegaso rojo...), los 32
  resultados de combinar dos en el partido (override_skill_config), 29
  versiones de la historia ("Ensueno: ...", "... EV", "... de la amistad") y 9
  de prueba. Se dan las 738 que aprende algun personaje y las 45 que estan en
  la tienda, objetos comunes o trofeos. `tecnicas-origen.csv`
  (`construir_tecnicas_origen.py`); el editor solo ofrece las `obtenible`.
- **No podia cambiar un kenshin por otro**: hay hipertecnicas con el nombre
  repetido (dos "Archipegaso rojo") y el editor mandaba el nombre; ahora manda
  el codigo y `poner_tecnica` lo acepta.

Y la lista de Jugadores y la reserva del Team builder se recargan solas al
fichar o borrar (antes habia que pasar por Inicio).

Comprobado contra inazumo.es/tecnicas (su `data/supertecnicas-completas.json`,
786 sin contar despertares; regla de Aaron: cuando una tecnica sale dos veces,
la legal es la de menos potencia y la otra es la de override). En las 58 que
salen repetidas la de menos potencia es siempre la que aqui es `personaje` o
`tienda`, y ninguna de las excluidas esta en su lista. Las 63 que ofrece el
editor y alli no aparecen son del DLC posterior a su exportacion (enero 2026)
o cambian de nombre en su traduccion ("Remate halcon" / Hawk Shot).

### O-172 · Las armaduras y los mixi max son de un personaje

Aaron: "no todos los personajes pueden tener armaduras y mixi max, solo los que
lo permitan: solo Arion puede tener la armadura del Pegaso, y solo Arion el mixi
con el Rey Arturo". En los datos del juego el dueno sale de tres sitios:

- `aura_skill_config` / `AURA_CMD_INFO_LIST` col 13: para una armadura, la
  identidad del personaje con la armadura puesta (para un mixi es el companero:
  Rey Arturo, Raika... y no sirve).
- `change_aura_skill_config` / `m_ChangeAuraSkillDataList`: pares (espiritu,
  identidad) de quien puede cambiar a el.
- `chara_param` cols 11, 15, 19, 21 y 27: la armadura o el mixi propio de
  algunas versiones del personaje.

`espiritus-duenos.csv` (`construir_duenos_espiritus.py`) junta las tres. Un
personaje tiene muchas identidades, asi que se compara por nombre. De los 258
(189 armaduras + 69 mixi), 249 tienen dueno; los 9 sin dueno (mixi con
Shindo/Kariya/Endo/Goenji/Fudo/Fubuki/Yuto, Cao Cao y una Raika) no se dejan
a NADIE: Aaron los intuye (Raika a Cade, Froste a Axel, Cazador a Gabi...) pero
no esta seguro y prefiere "que nadie pueda usarlos antes de que todos puedan". Comprobado con su partida: de 35 mixi puestos
por el juego, 34 cuadran con el dueno (el otro es el Cao Cao de Zanark, sin
dueno en los datos). El editor solo ofrece al jugador sus armaduras y mixis, y
`poner_tecnica` se niega con los ajenos.

### O-173 · Que pasivas se pueden heredar, y una sola vez cada una

Aaron, probando: la lista de heredadas sacaba "muchas pasivas iguales" (una por
version de rareza, y sin numero porque el marcador se limpiaba), y ofrecia
cosas que el juego no deja heredar. Sus reglas:

- Una pasiva es una: al heredar de un comun a un leyenda se pone con el valor
  del leyenda. La partida guarda la version base (O-165) y el editor ofrece
  cada pasiva UNA vez con el numero que tendria en el que la recibe.
- Ni de Idolo a normal ni de normal a Idolo; de Idolo a Idolo si; a Diamante
  nada. Y nunca las de stats ("Agilidad +x"), ni las de entrenador o gerente,
  ni las personalizadas.
- Las que si: la lista "Pasivas de jugador" de inazumo.es/pasivas (63).

`pasivas-por-ranura.csv` tiene justo 63 ids base distintos (los que salen en
las cinco ranuras de un normal) y cuadran una a una con esa lista; para un
Idolo valen las 46 de los tableros propios (`pasivas-fijas.csv`, origen
propio). `O.pasivas_heredables(rareza)`, y `poner_heredada` se niega con el
resto y guarda siempre la base. El editor manda el codigo, no el nombre.

Y lo mismo en las pasivas normales (ranuras 1-5): el selector ensenaba el
nombre con el numero puesto ("tension +2 %") y `poner_pasiva` comparaba con
el texto de la tabla, que lleva `<VALUE>`, asi que no cuadraba nunca (Aaron con
Kevin Dragonfly, Juego sucio, ranura 5). Ahora el editor manda el codigo y se
comprueba por codigo: probadas las 144 opciones de los seis arquetipos.

### O-174 · Hipertecnicas especiales: cinco de todos, el resto de su personaje

Aaron: "para todos los jugadores solo estan disponibles Catalizador elemental,
Determinacion de portero, Impulso temporal, Guardian ferreo y Sobrecarga
ardiente; las demas estan asignadas a X jugadores (Modo Reina solo de Beta,
Modo Aphrody solo de Thaddeus)". Las cinco de todos van a mano en
`construir_duenos_espiritus.py` (`PARA_TODOS`, fila con personaje "todos"); las
demas salen de `chara_param` (cols 15, 21 y 27: Modo Reina -> Beta, Modo
Aphrody -> Thaddeus Bellefax, Modo Atacante -> Shawn Froste, Modo Brutal ->
Hekyll Jyde, Modo Dos Caras -> Aitor Cazador, Modo Furia -> Buddy Fury, Modo
Leon Salvaje -> Bilal Kalil, Modo Santurron -> Seth Bael, Modo Serio -> Scott
Banyan, Despertar -> Thierry Reyes). Las que no tienen dueno en los datos
(Cambio de despertar, Espiritu Miximax, Limitadores desactivados, Mejora de
capsula, Transformacion de vinculo y una copia de Aphrody, Santurron y
Despertar) no se dejan a nadie, como los mixi sin dueno de O-172.

Ademas `espiritus.csv` lleva ahora `nombre_largo` (col 2 de
`AURA_CMD_INFO_LIST`, NOUN_INFO de skill_text: "Pegaso alado"), `descripcion`
(col 3, TEXT_INFO) y `tecnica` (col 6: la supertecnica propia del espiritu,
"Rayo celeste" en el Pegaso); y `tecnicas.csv` lleva `descripcion` (col 7 de
`m_skillInfoList` -> TEXT_INFO). El efecto pasivo de un kenshin ("al pasar,
poder de afinidad +50 %") NO esta como texto: `AURA_CMD_EFFECT_LIST` guarda
codigos de efecto numericos (que apuntan a `soccer_command_effect_config`) y
no hay ningun texto ligado a ellos; queda pendiente.

### O-175 · El selector en rejilla

Aaron: "en los submenus, por ejemplo el de cambiar tecnicas, que no se tenga
que hacer tanto scroll: un popup en horizontal, con las tecnicas ahi en
horizontal, manteniendo el icono y el color, con todos los datos de cada cosa,
muy visual". `abrePicker` pinta ahora una ventana ancha (1200 px) con
TARJETAS en rejilla (3-4 por fila) en vez de una lista de una columna: la
tecnica con su barra del juego + tipo, clase, afinidad y la descripcion; el
espiritu con su icono grande, familia, rango en estrellas, de quien es, su
tecnica propia con barra y la descripcion; la equipacion con sus stats y el
total; la pasiva con su numero. La que lleva puesta sale la primera con la
marca "la lleva ahora"; la busqueda tambien mira descripcion, dueno y tecnica
del espiritu; Enter elige la primera; y hay filtro nuevo "De quien es".
Todos los selectores mandan ya el codigo, no el nombre.

### O-176 · Topes de las pasivas de equipo sumadas

Aaron: "el juego te permite pasarte del limite, pero si te pasas deja de
sumar en partidos, asi que si te pasas que salga en rojo, justo en naranja y
por debajo en verde". Los topes son los de la tabla "Limites de Pasivas de
Equipo" de inazumo.es (Brecha: perforacion de muro 100 %, tension necesaria
-80 %; Tension: 150 / 50 / 200; Contraataque: 50 / 50 / 50 / 100 / 100;
Afinidad: 150 / 250 / 150 / -100; Juego sucio: -80 / -80 / 50 / 100; Justicia:
200 / 200 / 50 / 50; Staff: sustitucion 150 / 150, enfriamiento de tacticas
-50, primera mitad 30, segunda mitad 30). Estan en `pasivas-limites.csv` como
patrones sobre el texto de la pasiva; `O.limite_de_pasiva`, y
`pasivas_de_equipo` devuelve `limite` y `estado` (bien / justo / pasa). Las
pasivas sin tope conocido (tasa de brecha, drenar tension...) no llevan numero.

### O-177 · El arbol de un normal: casillas por nivel y tecnicas confirmadas

Aaron, con Kevin Dragonfly (Leyenda, nivel 99 puesto con el editor, seis
tecnicas puestas con el editor): en el juego salia SIN tecnicas y con las
pasivas con candado; el arbol "medio bugueado, como si no tuviera ruta"; al
elegir la ruta y salir se abrian las pasivas y las tres del tronco, pero las
tres de la rama seguian sin salir.

Leido de los 2.700 normales de su partida:

- El mapa de casillas (`0xBB459017`) lo abre el juego con el nivel, en orden:
  tronco 1 casilla a nivel 1, 2 a nivel 10, 5 a nivel 20, 8 a nivel 30; la rama
  que juega 2-3 casillas a nivel 30, 5 a nivel 40, 7 a nivel 45, 10 a nivel 50.
  Kevin tenia UNA casilla (nivel 1) con nivel 99: por eso el arbol raro.
- `0x45E2D879` (9 bytes) lleva la casilla de cada ranura de tecnica
  CONFIRMADA: `00 02 04` siempre (desde nivel 1, aunque las casillas 2 y 4 no
  esten abiertas), y `09 0b 0d` (rama 1) o `13 15 17` (rama 2) solo cuando el
  jugador confirma esas tecnicas en el arbol. Los 53 leyendas de nivel 99 del
  juego llevan `000204090b0dffffff`; Kevin llevaba `000204ffffffffffff` con las
  ranuras 4-6 llenas: por eso no salian.
- La marca de la tabla de pasivas (byte `9A091BF4`) es si la casilla de esa
  pasiva esta abierta: nivel 1 -> 00000, nivel 99 -> 11111. El editor la
  conservaba (0 en filas nuevas): el candado.

`abrir_arbol(plain, fila)` deja el mapa abierto hasta su nivel y confirma las
tecnicas de las ranuras de la rama que juega; se llama tras cualquier cambio
de ficha de un normal (`Sesion.aplicar`), y `sincronizar_tabla_pasivas` pone
las marcas por el arbol. "Arreglar los arboles" (Resumen) repasa los que ya
estaban a medias. Idolos y Diamantes no se tocan (van con sus ranuras de
fabrica, O-165/O-169).

### O-178 · El arbol tambien se abre en Idolos y Diamantes

Aaron: un Shawn Idolo fichado con el editor salia "con las tecnicas vacias
menos la primera". O-177 solo abria el arbol de los normales, y a un Idolo el
editor le dejaba el mapa de casillas de nivel 1 aunque lo subiera a 99: de las
seis tecnicas que declara su `45E2D879` (celdas 0, 2, 4, 8, 10, 12) solo se
veia la de la casilla 0.

Como reparte cada rareza sus casillas, medido en los que hizo el juego:

| rareza | orden en que se abren |
|---|---|
| Idolo (5-7) | seguido, 0 a 22 |
| normal (0-4) y Diamante (8) | tronco 0-7, rama 8-17 (o 18-27), comun 28-32 |

Y cuantas se abren por nivel sale de la tabla del propio juego
(`ABILITY_LEARNING_LOCK_LEVEL_INFO_LIST`): 1, 7, 13, 16, 20, 23, 26, 28, 30,
35, 38, 40, 43, 45, 47, 48 y 50 para las 17 primeras, mas una a nivel 50 en
normales y Diamantes. El editor **se queda ahi**: las del tramo comun (28-32)
las abre el jugador gastando puntos y no hacen falta para ver las tecnicas.
Con eso las marcas de las pasivas cuadran con lo medido: Idolo celdas 1, 9,
11, 13 y 15; Diamante 1, 3, 8, 10 y 11; normal 1, 3, 8, 12 y 15 (+10 en la
rama 2).

Y el arreglo ya no depende de acordarse del boton: **al guardar la partida** se
repasa el arbol de todos (`Sesion.arreglar_arboles`), que es justo cuando la
partida va al juego. Se dice en el aviso de guardado y se puede deshacer.

### O-179 · Las pasivas personalizadas

Aaron: "anade el poder poner pasivas personalizadas dentro del editor (1 por
jugador)". En los datos del juego son las 37 pasivas cuyo nombre interno
empieza por `ss_ps` (`ss_ps50001` a `ss_ps50037`, en `passive_skill_config` /
`PASSIVE_SKILL_INFO_LIST`), y son **exactamente** la lista "Pasivas
Personalizadas" de inazumo.es: mismo orden, mismos textos y mismos numeros
(1, 1, 1.5, 1, ... y las dos ultimas 10 y 5, "Tasa de obtencion del equipo
(comunes/inusuales)"). Ya estaban en `pasivas-valor.csv`, solo habia que
separarlas: `O.pasivas_personalizadas()`.

En la partida son objetos de la mochila (kind 3, sub 2) y el jugador guarda el
numero de fila del objeto en **`0xB66A2462`, el decimo campo del registro de
supertecnicas**, justo detras de las nueve ranuras. Se maneja como la
equipacion: se apunta la fila y se lleva la cuenta de "cuantos la llevan"
(`0xEDC3670F`). Una por jugador. `E.poner_personalizada(plain, fila, id)`; con
id vacio se quita.

**CONFIRMADO en el juego**: primero se dio por bueno el quinto campo del
registro de equipacion (`0x3B0EB3DB`) por descarte, y **era falso**. Aaron le
puso en el juego la "Pasiva personalizada 1" a Kevin Dragonfly y la 36 a Bunny
Cottontail, y comparando la partida de antes con la de despues los unicos
cambios de asignacion son ese campo en sus dos registros de supertecnicas (a
los slots de los objetos `DDFB1BE9` y `BD3D525C`) y el contador de los dos
objetos, que sube en uno. En su partida hay 346 jugadores con una puesta.

El numero que ensena el juego es el del nombre interno: `ss_ps50001` es la
"Pasiva personalizada 1". `O.numero_personalizada`. Y el boton **"Conseguir 99
pasivas personalizadas"** (pestana Mochila) pone 99 de las 37, creando la fila
de las que no se tengan (`E.dar_personalizadas`).

### O-180 · Las judias, al tope del nivel

Aaron: "cuando anades judias a un jugador, que se pongan el maximo que permita
ese nivel; al 99, 180". Al elegir el tipo de judia el editor manda ya
`cantidad = tope` (`E.tope_judias(nivel)`), y el numero se puede bajar a mano
despues. En la ventana de elegir se dice cuantas se van a poner.

### O-181 · Filtrar la lista por MIS equipos

Aaron: "dentro de Jugadores, poder buscar por equipo de los que tengo guardados
en el juego; por ejemplo ECLIPSE y que salgan solo los de ese equipo, con su
entrenador y sus gerentes". El filtro "Equipo" que ya habia es el equipo del
personaje en la historia (Raimon, Zeus...), que es otra cosa y se queda.

El nuevo es **"Mi equipo"**: `servidor.equipos_por_fila` recorre los equipos con
nombre (`EQ.todos`) y apunta en que equipos esta cada fila, mirando TODOS los
miembros, que ya incluyen campo, banquillo, entrenador y gerentes. Un jugador
puede estar en varios equipos a la vez, asi que el campo es una lista y el
filtro comprueba pertenencia en vez de igualdad. Dos equipos con el mismo
nombre (Aaron tiene dos "ECLIPSE") se distinguen con su hueco.

### O-182 · Espiritus repetidos y el Protoanimador

Aaron: "el Animador y el Nike estan duplicados, investiga por que; y el
Protoanimador quitalo, que es ilegal".

- **Repetidos**: son el mismo espiritu con dos modelos, el normal y otro con
  sufijo de escena: `wko02030` y `wko02030_st0701` (Animador), `wks02060` y
  `wks02060_st0901` (Nike), y lo mismo con Conejo de cristal y Warborg. Son
  cuatro parejas de kenshin, un mixi y un especial. El editor ofrece el normal
  y esconde el del sufijo. **Robin no es un repetido**: son dos kenshin de
  verdad, con modelos distintos sin sufijo y nombres largos distintos
  ("caballero ultraveloz" y "paladin ultraveloz").
- **Protoanimador** (`1E1F0FD7`, modelo `wko02025`): es el **unico** kenshin
  de los 103 sin supertecnica propia, lo que cuadra con que no sea jugable.
  Fuera de la lista.

`O.espiritu_de_escena` y `O.espiritu_sin_tecnica`, dentro de
`espiritu_permitido`.

### O-183 · Las pasivas sumadas, en la lista de Jugadores

Aaron: "cuando pongo el filtro de mis equipos, que salga la suma de las pasivas
que ya tiene el editor de equipos, para plantear las pasivas con todo a la
vista". Al filtrar por un equipo propio sale el mismo panel plegable de
"Bonificaciones de equipo" que el Team builder, con sus topes en verde, naranja
y rojo (O-176). El filtro devuelve tambien el hueco de cada equipo, que es lo
que pide `/api/equipo/<hueco>/pasivas`.

### O-184 · RESUELTO · La habilidad pasiva de cada espiritu

Aaron pidio verlas en el editor y paso tres fotos: Argentia "valor de disputa
+10 % para jugadores cercanos", Metis "valor de foco +10 % para jugadores de
distintas posiciones" y Asura "cuando un jugador de otro elemento esta cerca,
AT propio de tiro +20 %". **Las tres salen ahora exactas.**

Donde estaban:

1. Detras de la ficha de cada espiritu en `aura_skill_config` (la fila de 19
   columnas de `AURA_CMD_INFO_LIST`) van tres parejas (indice, cuantos) que
   apuntan a `AURA_CMD_UNIQUE_EFFECT_LIST`, `AURA_CMD_EFFECT_LIST` y
   `AURA_CMD_CHARA_LIST`. Las de EFFECT son los +50 % genericos que llevan
   todos; **la de UNIQUE es la pasiva propia**, y el indice va **desplazado en
   uno**.
2. Ese id se busca en `soccer/soccer_command_effect_config`, que describe cada
   efecto en tres partes: el tipo y el numero (`EFFECT_DATA_LIST`) y a quien o
   cuando se aplica (`TARGET_COND_DATA_LIST` / `EXEC_COND_DATA_LIST`). El
   fichero **repite el nombre de tabla** 212 veces y `db.table(nombre)` solo
   daba la primera: por eso no habia forma de leerlo. Se le anadio al volcador
   el modo **`--todas`** (y `--json`), que era lo que faltaba. Para eso se
   instalo Rust, que ya estaba en el PC pero sin PATH.

Salen **10 tipos de efecto** (AT de tiro, valor de foco, valor de disputa, DF
del muro, poder de afinidad al pasar, tension necesaria para la brecha, tension
al ganar foco o disputa, tasa de parada, tasa de brecha y tasa de faltas al
esprintar) y **11 condiciones** (mismo/distinto elemento, misma/distinta
posicion, cercanos, campo propio, campo contrario, fuera del area, y las dos
"cuando un jugador del mismo/otro elemento esta cerca"). Con eso se arma el
texto en espanol: `construir_pasivas_espiritu.py` -> `pasivas-espiritu.csv`,
**399 de 443 espiritus** (103 kenshin, 161 armaduras, 68 mixi, 43 almas, 24
especiales).

Comprobado ademas contra los 60 espiritus con pasiva de inazumo.es: **55
aciertos de 59**. Lo unico que los datos no separan es si un efecto "en campo
propio", "en campo contrario" o "fuera del area" es del jugador o de todo el
equipo; en esos el texto va sin ese matiz.

En el editor: la pasiva sale en la tarjeta del selector de hipertecnicas, en la
base de datos de espiritus, y con el **boton "i"** de la ranura del arbol, que
abre la ficha del espiritu (nombre largo, familia, rango, dueno, pasiva,
supertecnica propia y descripcion).

### O-185 · Las pasivas de un gerente o un entrenador se pueden cambiar

Aaron convirtio a Robert Cottontail de entrenador a gerente y no podia tocarle
las pasivas: "es verdad que salen vacias, pero aun asi se pueden cambiar".

**Donde estaban.** No en las cinco ranuras de la ficha (`0x66B81DAF`), que se
quedan con las de jugador, sino en la **tabla de pasivas con numero** (la de
O-166), cinco por persona:

| | ranuras de la ficha | tabla con numero |
|---|---|---|
| entrenador de fabrica (Clark) | vacias | sus 5 de entrenador |
| gerente de fabrica (Juno) | vacias | sus 5 de gerente |
| gerente convertido (Robert) | sus pasivas de jugador | **a cero** |

Por eso a un convertido le salen vacias, y por eso `sincronizar_tabla_pasivas`
deja en paz al personal: ahi no se sincroniza nada, se escribe a mano.

Cada pasiva es ademas un objeto de la mochila, y el contador "cuantos la
llevan" (`0xEDC3670F`) cuadra **exacto** con las veces que aparece en las
tablas: 83 de 83 sin un solo descuadre. Al cambiarla se ajusta igual que la
equipacion.

**Los roles no se mezclan**, como dice Aaron: de los 192 con medalla de la
partida, los 110 gerentes llevan pasivas de gerente y los 82 entrenadores de
entrenador, ni una cruzada. El editor ofrece solo las del rol que tenga puesto
y se niega si se intenta cruzar.

`E.poner_pasiva_personal(plain, fila, ranura, id)`, `E.rol_de_personal`,
`O.personales(plain, fila)` (las de su rol que tengas en la mochila) y el boton
**"Conseguir 99 pasivas de personal"** en la Mochila (las 112 de los dos roles,
`E.dar_pasivas_personal`), que son las mismas que salen al quitarselas a
alguien en el juego.

### O-186 · RESUELTO · Los topes de las pasivas, sacados del juego

Aaron: "en las notas de un parche se anadieron limites de pasivas, y el propio
juego te lo marca en rojo, asi que tiene que estar en algun sitio". Lo estaba, y
estaba **en el sitio que ya habia mirado**: la primera pasada se quedo a medias.

En `soccer/passive_skill_effect_config` hay **80 efectos de pasiva**. Cada uno
lleva su bloque `EFFECT_DATA_LIST` y ahi, en una fila de tres numeros
`(algo, indice, TOPE)`, el tercero es el tope de la suma del equipo. La primera
vez se miro solo el segundo numero (50, 51, 52...), que es un indice
correlativo, y se dio por hecho que la fila no servia.

**40 efectos tienen tope y 40 lo llevan a cero** (sin tope: las de "AT de tiro
para jugadores del mismo elemento" y demas de las ranuras 1-2, que se suman sin
limite).

El enlace con la pasiva es la columna `tipo_efecto` de `pasivas-valor.csv`
**leida tal cual**, no con los bytes al reves como el resto de ids de la
partida: `8A52A068` es el efecto `2320670824`. Casan 1.700 de las 1.716
pasivas. `construir_pasivas_limites.py` -> `pasivas-limites.csv` (40 topes,
por tipo de efecto, asi que todas las versiones por rareza comparten tope).

Contra la lista de inazumo.es (26): coinciden las que son "de una vez"
(tension necesaria 80, gana en foco o disputa 150, faltas al esprintar 80,
sustitucion 150, mitades 30...). Las que no coinciden son las de **"Por cada
rango de Conf. X"** y la de **"Al hacer un pase"**, y es porque miden cosas
distintas: el juego pone el tope a la SUMA de la pasiva y inazumo al efecto
final. Cuadran multiplicando por lo que se acumula: Conf. Vinculo 50 x 5 rangos
= 250, Conf. Brecha 20 x 5 = 100, Conf. Justicia 10 x 5 = 50, y "al hacer un
pase" 5 x 30 % de poder de afinidad acumulable = 150. Para el panel del editor,
que compara la SUMA, el bueno es el del juego.

Ademas salen **14 topes que inazumo no tiene**: valor de foco del equipo en
campo propio, en campo contrario y fuera del area (50 cada uno), tasa de brecha
del equipo (100), drenar tension (100), PP del equipo (20), Conf. Tension (20),
Conf. Contraataque (15), enfriamiento de supertecnicas propias (10), las dos de
tasa de obtencion de objetos (200 y 100), y tres mas.

### O-187 · Judias y equipacion: Agilidad e Inteligencia iban al reves

Aaron, con Gael Vehemaint: "la judia naranja, que es de agilidad, en el editor
sale como la celeste de inteligencia". Y era mas gordo que el icono.

Gael tiene en la partida judias de tipo 4, 6 y 3 (180 cada una) y en el juego
salen Fisico, **Agilidad** y Presion, con la naranja de correr. El editor decia
Inteligencia para el 6. Y comparando los siete stats del juego con los del
editor, los cinco primeros cuadraban exactos y los dos ultimos no; cuadran
**exactos** solo si:

- el tipo de judia 5 es **Inteligencia** y el 6 **Agilidad** (el orden interno
  del juego, que no es el de la ficha), y
- los bonus de la equipacion llevan **las dos ultimas columnas al reves**: las
  botas y el colgante de Gael dan +29 y +29 que el juego suma a Agilidad
  (232 + 58 + 13 del arbol = 303, que con las 180 judias da los 483 del
  juego), y el brazalete +25 que suma a Inteligencia (210 + 25 = 235, exacto).

Alex Zabel (O-96) cuadraba porque su equipacion no tocaba esas dos. Arreglado
en `J.JUDIAS`, en `stats.de_judias` (pasa por el nombre) y en
`construir_stats.py` (intercambia las dos columnas al generar
`bonus-objeto.csv`). El arbol estaba bien.

De paso: **"Talisman de Evans" y "Capa de Jude" no se podian equipar**. El
nombre en la tabla lleva marcador (`Talisman de <FLC:ENDO>`) y el editor
mandaba el texto limpio, que no casaba. Ahora la equipacion se manda por
codigo, como todo lo demas.

### O-188 · Los desplegables, iguales en todas partes

Aaron: "los selectores de los filtros salen feillos y unos empiezan en
mayuscula y otros en minuscula; igualalo". Un solo estilo en `comun.css` para
todos los `select` (flecha propia en vez de la del sistema, misma letra, mismo
borde, hover y foco), fuera los estilos sueltos del editor, y las etiquetas
pasan por `bonito()` (primera letra en mayuscula y sin el "(subtipo N sin
identificar)") en la lista de Jugadores, en el selector y en la base de datos.

Dos cosas mas que salieron al comprobarlo:

- El editor no carga `comun.css` (lleva su hoja dentro, con sus propios
  colores), asi que la regla de los `select` esta **dos veces**: en `comun.css`
  para inicio y base de datos, y copiada en `editor.html`. Si se toca una, tocar
  la otra.
- Salia "Normal" dos veces en la clase de los tiros porque el subtipo 8 iba
  como "normal (subtipo 8 sin identificar)". Son 67 tiros normales de toda la
  vida (Tornado de fuego, Remate dragon, Tiro fantasma...) que el juego no
  distingue de los demas: ahora `construir_tecnicas.py` los llama "normal" y
  quedan 353 tiros normales, 47 largos y 33 bloqueos.

### O-189 · El anillo del arbol: por que salia "desconectado"

Aaron: "al entrar al arbol de un jugador subido con el editor sale como si
los arboles no estuvieran conectados; le haces clic y ya se conecta. Anastasia
Mingler, Iggie y Joaquine lo tienen; Bunny y Kevin bien".

Comparando los cinco en la partida, los tres "mal" y los dos "bien" tienen el
mismo mapa de casillas 0-27 y las mismas tecnicas confirmadas; lo que cambia
son **tres cosas** que el editor no tocaba:

| | Kevin, Bunny, Gael (bien) | Anastasia, Iggie, Joaquine (mal) |
|---|---|---|
| mapa, casillas 28-32 | abiertas | cerradas |
| `0x3CAEA0BD` (30 bytes) | `07 ff ff...` | `ff ff...` |
| `0x38AFC2B8` (30 bytes) | `01` / `04` / `04` | `00` |

La casilla 7 del tronco es un **anillo giratorio** (el circulo con flechas de
la foto): al llegar a el hay que girarlo para que conecte con la rama.
`0x3CAEA0BD` es la lista de anillos girados (ff = vacio; en todo el juego solo
existe el 07) y `0x38AFC2B8` hacia donde quedo cada uno (1-8). Contado en los
2.700 normales de la partida: con la rama 1, el giro 7 en 144 de 323 (luego 6,
1, 8, 4); con la rama 2, el 5 en 11 de 27 (luego 8, 1, 4); los Diamantes
llevan casi siempre el 8. Un Idolo no tiene anillo (tablero seguido).

El editor ahora, al abrir un arbol cuya rama ya empieza y con el anillo sin
girar, pone `07`, el giro que mas usa el juego para esa rama (7, 5 u 8 en un
Diamante) y abre las casillas 28-32, como en Kevin y Bunny. Si el anillo ya
esta girado no se toca nada. Entra en `arboles_rotos` / `arreglar_arboles`,
asi que se repasa solo al guardar: en la partida de Aaron eran 16 jugadores.

### O-190 · La equipacion del equipo no se veia: van dos numeros, id y hueco

Aaron: "tengo puesto el uniforme Alpino en el Super Alpino, pero en la vista
del equipo no se aplica; si entro a los uniformes si sale el Alpino".

**Los codigos de campo de la partida son crc32 del nombre en ingles.** Con un
diccionario de palabras salieron `teamName`, `uniformId`, `emblemId`,
`formationId`, `tacticsId`, `uniformNo` (el dorsal), `memberList`,
`synergyFlagItemId`, `captainParamId`, `skillId`, `titleFlag`. Los ids de las
tecnicas tambien son crc32 de su nombre interno (300 de 300).

El equipo guarda de la equipacion **dos numeros**: `uniformId` (el id del
uniforme, lo que el editor ya escribia) y `0x627F2D54`, el **hueco de la
mochila** del objeto que lo da, con el mismo formato de hueco que usa la
mochila (`((pos+1)<<18) | (clase<<16) | (tipo<<13) | pos`). Igual las
tacticas: `tacticsId` y `0xF863CD5D` con los tres huecos. La vista del equipo
lee el hueco y el menu de uniformes el id, por eso pasaba lo que decia Aaron:
el Super Alpino tenia el hueco 0, que es la "Equipacion sencilla" (la camiseta
blanca de la foto).

Comprobado en los once equipos que hizo el juego: el hueco que calcula el
editor (`equipo-objetos.csv` + la fila de la mochila) coincide con el guardado
en los 11 uniformes y las 33 tacticas, sin una sola diferencia.
`EQ.hueco_de_pieza`, `piezas_desajustadas`, `arreglar_piezas`; se escribe al
cambiar equipacion o tactica y se repasa al guardar.

### O-191 · Las sinergias: que son y donde estan

Aaron: "revisa las sinergias ofensivas y defensivas, mete una pestana en la
mochila y que se puedan poner en el editor de equipo; no tengo ninguna".

**En los datos del juego** (`skill/synergy_flag_config`,
`soccer/synergy_flag_effect_config`, `item_config` tabla
`ITEM_SYNERGY_FLAG_INFO_LIST`, textos en `item_text` y `skill_text`): 37
sinergias, 19 ofensivas y 18 defensivas (columna 7 del objeto: 221 / 222; casa
con los efectos, las 221 suben AT y foco en AT y las 222 DF y muro). Cada una
pide unos personajes en el equipo (por `chara_base_id`, todos identificados
menos las tres ultimas, que no piden ninguno) y da dos o tres efectos ("PP
del equipo +2 %", "DF del muro +5 %"...). `construir_sinergias.py` ->
`sinergias.csv`. El dibujo de cada una esta en una sola lamina
(`30_icon_synergy/icon_synergy.png`, 42 casillas) sin los nombres, asi que de
momento llevan una marca: bandera las ofensivas y castillo las defensivas,
como las dos pestanas del juego.

**En la partida**: el equipo tiene dos huecos `synergyFlagItemId`
(`0x20D7819C`, cada uno con un `0x585CA018` detras, seguramente el hueco de
mochila como en O-190). Lo que NO se sabe: **en que tramo de la mochila van
los objetos de sinergia**. La mochila de Aaron tiene 15 tramos y ninguno es de
sinergias (el juego los crea al recibir el primero), asi que crear una a ciegas
seria inventar la estructura de un tramo. Por eso el editor las ensena (base
de datos, pestana de la mochila y los dos huecos del equipo) pero no las crea
ni las pone. **Hace falta una partida con al menos una sinergia** para
terminarlo.

### O-192 · Dorsales: dos no pueden llevar el mismo

Aaron: "el desplegable de dorsales se cierra al hacer un cambio, y el editor
deja dos jugadores con el mismo dorsal". El editor rechazaba el repetido en
`poner_dorsal`, pero al meter a alguien en el equipo se quedaba con el dorsal
que tuviera el hueco (o 0). Ahora: al poner un dorsal que otro lleva, ese otro
pasa al **primer dorsal libre** (un hueco entre medias antes que uno nuevo,
como pidio Aaron) y se avisa; al meter a uno en el equipo se le da uno libre
si el suyo esta cogido o es 0; y `dorsales_repetidos` / `arreglar_dorsales`
se repasan al guardar y salen en el Resumen. El desplegable recuerda si estaba
abierto.

### O-193 · Las pasivas sumadas del equipo: sin suplentes

Aaron: "en las pasivas sumadas los suplentes no entran; entrenador y gerentes
si". `pasivas_de_equipo` salta los puestos 11-15.

### O-194 · Las sinergias, resueltas con las tres que compro Aaron

Aaron compro "Los guerreros de Santuario", "El duo del Trueno de primavera"
y "El emperador y su vasallo" (las unicas que podia comprar) y mando la foto
de cada una.

**Las fotos corrigieron los personajes.** En `SYNERGY_FLAG_INFO_LIST` las dos
parejas `[desde, cuantas]` van al reves de como se leyeron en O-191: la
primera son los **efectos** y la segunda las **condiciones** (las sumas
cuadran, 91 efectos y 82 condiciones, y ahora "Los guerreros de Santuario"
son Bai Long y Tezcat, como en la foto). Cada condicion es un `chara_base_id`,
que agrupa las rarezas de una misma version del personaje.

**En la mochila** cayeron en el tramo de las tacticas de equipo y los escudos
(clase 0, tipo 6): tres filas nuevas con la misma forma que una tactica, sin
cantidad, `kind` 3 y `sub` 2. `E.anadir_sinergia` copia esa forma exacta
(comprobado byte a byte contra las compradas) y `dar_sinergias` crea las 37;
el tramo tiene 500 filas y sobran.

**En el equipo**: los dos `synergyFlagItemId` (primero la ofensiva, segundo
la defensiva, como las dos pestanas del juego) con el id del objeto tal cual
va en la mochila y, detras, `0x585CA018` con el hueco de mochila del objeto,
como la equipacion (O-190). Aaron no habia puesto ninguna todavia, asi que el
orden ofensiva/defensiva y el hueco son lo que mas sentido tiene, **sin
comprobar en el juego**: pendiente de que Aaron ponga una con el editor y mire.
`EQ.poner_sinergia` solo deja poner una que se tenga, del tipo de la ranura,
y con sus personajes en el equipo (cualquier hueco, tambien banquillo y
cuerpo tecnico: "Las gerentes mas allegadas" son tres gerentes). El selector
ensena los personajes en verde o tachados y los efectos.

**Los dibujos**: `icon_synergy.g4tx` no estaba en `datos/juego/laminas`
(es de la 6.00). Se saco de los paquetes del juego (estaba en la segunda
tanda de 3 GB, de los paquetes mas nuevos) y se recorto con
`recortar_g4tx.py`: 41 dibujos con su nombre, y 35 de las 37 sinergias tienen
el suyo (`sf04002.png`...); las dos que no ("El principe del campo de nieve" y
"Centinela temporal", las de prueba `sf010000xx`) llevan bandera o castillo.
Van en `recortes/laminas/icon_synergy/` y el editor los coge solo
(`O._icono_de_sinergia`).

### O-195 · El giro del anillo es fijo por personaje (Anastasia, segunda vuelta)

Aaron instalo la partida con los arboles arreglados (O-189) y el juego, al
cargarla, **volvio a cerrar las pasivas 3-5 de Anastasia** (y de otro) con
los mismos bytes que a Bob Sled le valieron. Asi que el giro 7 no vale para
todos.

Contado en la partida de antes del editor: de los 53 personajes con tres o
mas copias hechas por el juego, **todas las copias de cada uno llevan el mismo
giro**, y con la clave "identidad + si es Diamante" no discrepa ni una en
2.900 (un Diamante lleva otro giro que las copias normales del mismo
personaje). O sea: el giro no lo elige el jugador, lo fija el juego por
personaje. Lo que no se encontro es de donde lo saca: ninguna columna de
`chara_param` ni `chara_base`, ni las tablas del arbol (`BOARD_INFO`, `TYPE`,
`TABLE`), ni crc32 de los nombres internos lo predicen; los normales no llevan
tablero en `chara_param` (columna 10 a cero) y el sorteo de tableros parece
usar la identidad como semilla.

Asi que se aprende de los jugadores hechos por el juego:
`construir_anillos.py <partida>` -> `anillos.csv` (2.628 personajes de la
partida de Aaron, con la rama y si es Diamante), y el editor mira ademas las
copias de la partida abierta. Cuando solo conoce la otra rama pasa por la
pareja mas frecuente (7->5, 6->8, 8->4, 4->8, 1->5; no es exacta: el 7 va al
5 seis veces y al 1 tres), y si no conoce nada, el mas comun (7, 5 o 8). Y si
un anillo esta girado con un giro que no es el de su personaje, se corrige
(`arboles_rotos` lo lista; con la clave buena, en la partida de antes del
editor no se toca ninguno hecho por el juego). Anastasia pasa del 7 al 4, que
es lo que lleva su otra copia; el jugador japones de nivel 48 se queda con el
7 porque no hay ninguna copia suya.

### O-196 · El registro del equipo no acaba en el nombre: las sinergias van detras

Aaron puso "Los guerreros de Santuario" en gordos con el editor y en el juego
el hueco salia vacio; luego la puso a mano y mando la partida. Comparando la
partida de antes de instalar con la de despues: el juego escribio la sinergia
en un bloque que va **detras del nombre** del equipo (`0xF7D8FF40` de un
byte, cinco `skillId` y las dos sinergias, cerrado por `0x033925BC`), y el
editor la habia escrito en el bloque de antes del nombre, que es el del
equipo anterior. Desde O-108 se daba por hecho que el nombre cerraba el
registro; la plantilla, las tacticas y la equipacion si van delante (todo
eso cuadra con las capturas), pero ese bloque de detras es del mismo equipo
que el nombre que lo precede: detras del ultimo nombre (el 47) hay un bloque
asi y luego otra cosa, y delante del primero hay una plantilla entera.

`EQ.leer` lee ahora las sinergias desde el final del nombre hasta
`0x033925BC`. Con eso, lo que escribe el editor para gordos es byte a byte
lo que escribio el juego. La lectura antigua dejo una sinergia escrita en el
bloque del equipo 23 (sin nombre, no se ve en el juego): es inofensiva.

### O-197 · El valor de una pasiva de gerente o entrenador va por su rareza

Aaron: "le doy a Robert pasivas de gerente y salen +12 % y +4 %, pero Carlos
Arroyo (gerente hecho en el juego) tiene la misma con +6 %, que no existe en
el editor; y la de ganar tension al esprintar tambien esta mal".

En la tabla de pasivas con numero (O-166) el juego guarda, junto al id, un
**valor** por pasiva. Para el personal ese valor NO es el del catalogo: Carlos
lleva `6CA04827` ("AT de tiro +4 %" en el catalogo) con 6.0. Contando los 915
valores de los 192 gerentes y entrenadores de la partida de Aaron: el valor
depende solo de (pasiva, rareza del personaje), sin una sola excepcion, y es
**el valor de la version de esa pasiva para esa rareza** (`pasivas-rareza.csv`
+ `pasivas-valor.csv`): cuadra 915 de 915. El id que se guarda sigue siendo
el base; solo cambia el numero. El editor escribia siempre el valor base, asi
que un gerente de rareza 4 se quedaba con +4 en vez de +6.

Ahora `E.valor_de_pasiva_personal` da el numero por rareza, el selector lo
ensena tal cual le quedara, y `pasivas_personal_desajustadas` /
`arreglar_pasivas_personal` corrigen los que puso el editor con el valor base
(al guardar y en el Resumen). En la partida de antes del editor no hay ninguno.

De paso, dos cosas mas que vio Aaron: en la ficha de un gerente, "pasivas como
jugador" salia repetida con las de gerente (la ficha leia la tabla con numero,
que en el personal lleva las de personal: ahora lee las ranuras de la ficha);
y "Conseguirlos todos" en la pestana de sinergias daba error (ahora crea las
37, como el boton verde).

### O-198 · Las pasivas de personal de clave 100 son solo de Diamantes

Aaron: "a Cottontail le salen la de +6 % y la de +12 % de tension al 100 %;
creo que la de +12 % es ilegal, revisa si son exclusivas de Diamantes".

En `pasivas-personal.csv` (O-163) cada rol tiene juegos de 5 pasivas por
arquetipo y clave, y la clave 100 es la de los Diamantes. Contado: las
pasivas de los juegos de clave 100 son **12 por rol** y no aparecen en
ningun juego normal ("AT de tiro +12 %" `E3E95F08` frente a "+4 %"
`6CA04827`, que con la rareza 4 sale como +6 %, O-197). Y en los 192
gerentes y entrenadores hechos por el juego en la partida de Aaron, **solo
los 4 Diamantes** llevan alguna. Asi que Aaron tenia razon: para un normal
son ilegales, y el editor ya no las ofrece ni las acepta (`Ilegal` con
"es una pasiva de Diamante").

El arquetipo, en cambio, **no** lo respeta el juego: 43 de fabrica llevan el
juego de otro arquetipo y 10 llevan mezcla, asi que no se limita por eso.
La clave del personaje (`clave_personal`) si cuadra siempre con el juego que
llevan los de fabrica (`O.pasivas_personal_legales`).

### O-199 · Tecnicas repetidas: la tercera copia entra en cualquier ranura de despues

Regla del juego, dicha por Aaron y comprobada por el con Dvalin Diamante
(Abolla2VR): una misma tecnica puede ir varias veces en el arbol (y sube de
poder), y **la tercera copia se puede poner en cualquier ranura posterior,
sea del tipo que sea**, aunque sea exclusiva de otra categoria. Ejemplo: dos
"Mano magica" en las dos ranuras de Parada y una tercera en una de Defensa.
Lo que no vale es ponerla antes de sus dos copias, y si luego se cambia una
de las dos, **el juego quita** la copia que se queda sin sus dos anteriores.

El editor hace lo mismo: `poner_tecnica` deja la tecnica en una ranura que no
es de su tipo si ya esta dos veces en ranuras anteriores, y despues de cada
cambio `_quitar_repetidas_sueltas` vacia las copias que se quedan sin sus dos
anteriores (en orden, para que una quitada no sostenga a la siguiente), baja
el contador de "cuantos la llevan" y lo avisa en pantalla. Probado con Gael:
Mano magica en 2 y 4 (Parada) y en 7 (Regate) entra; cambiar la 2 por otra
parada vacia la 7.

Dos mas de Aaron en la misma tanda: la vista previa de las pasivas de jugador
ensena ahora el numero de la version de su rareza (antes salia el base y al
ponerla cambiaba), y al subir de rareza a un gerente o entrenador sus pasivas
de personal se ponen al valor nuevo (`actualizar_pasivas_personal` tras cada
cambio de ficha, O-197).

### O-200 · Quentin (giro desconocido) y los candados del cuerpo tecnico

Dos fotos de Aaron del Super Alpino.

**Quentin Rackner**: solo dos pasivas y el anillo apuntando a ninguna parte,
sin dejarse girar en el juego. Quentin no tiene ninguna otra copia en la
partida ni esta en `anillos.csv`, asi que el editor le habia puesto el giro
por defecto (7), y ademas `_giro_conocido` se lo confirmaba a si mismo
contando su propia copia. Con un giro inventado el juego ensena el anillo
roto y NO deja moverlo. Ahora: (1) las copias de la partida se cuentan sin
uno mismo; (2) si el giro no se conoce, el anillo **se deja sin girar** (ff)
y lo gira el jugador con un clic en el juego, que es lo que siempre funciono;
(3) si ya esta girado con un giro desconocido y el juego ha dejado las
pasivas 3-5 a cero (su forma de decir "no conecta"), se vuelve a dejar sin
girar y se cierran las casillas 28-32. En la partida de antes del editor esto
no toca a ningun normal.

**Gerentes y entrenadores con candado** (Robert, Hilton, Clifford, Wilder):
Aaron abrio en el juego el arbol de dos y dejo los otros dos como los deja
el editor. Diferencia: a los dos abiertos el juego les abrio solas las
casillas **33-39** del mapa, y con eso las cinco pasivas de personal quedan
desbloqueadas; a los otros dos, con 33-39 cerradas, les puso las marcas a
cero. Contado en los 192 del juego: 33-39 abiertas <-> marcas a 1, sin
excepcion. Ahora el editor abre 33-39 a todo gerente o entrenador cuyo arbol
llega al anillo, y `sincronizar_tabla_pasivas` pone la marca a 1 cuando
estan abiertas. En la partida de antes del editor esto abre a 16 del juego
que nunca habian entrado en su arbol (es lo que el juego haria al entrar).

### O-201 · Listo para otro ordenador: sin rutas de nadie y con "Instalar en Steam"

Aaron va a pasarle el programa a un amigo. Repaso:

- **Nada del PC de Aaron en el codigo.** `servidor.CARPETA_STEAM` (su ruta con
  su cuenta) fuera: `partidas_de_steam` mira el registro de Windows y las
  carpetas de siempre en cada unidad, para cualquier cuenta. Los tres `.bat`
  buscan la partida con `buscar-steam.bat` (registro + unidades, la partida
  mas nueva) en vez de llevar la ruta escrita. Las herramientas que leen los
  ficheros del juego usan `ievr/rutas.py` (registro, `libraryfolders.vdf`,
  unidades; o `IEVR_JUEGO`). `test_basico` coge la partida de `partidas/` o de
  Steam. En NOTAS quedaba la cuenta en la cabecera: fuera. Comprobado con
  `git grep`: ni la cuenta, ni `F:\`, ni la carpeta del proyecto, ni el
  correo aparecen en ningun fichero del repositorio.
- **Nada depende de la partida de Aaron**: el nombre de la partida sale del
  fichero (es la clave), las tablas son del juego, y `anillos.csv` es una
  tabla por personaje que vale para cualquiera.
- **"Instalar en Steam"** en el editor, al lado de Guardar: copia la ultima
  partida guardada a la carpeta de Steam de la cuenta con ESE nombre de
  partida (no puede ir a otra cuenta), guardando antes la que habia en
  `partidas/antes-de-instalar/<fecha>`. Se niega si Steam esta abierto: lo
  mira en el registro (`ActiveProcess\pid`, comprobando que el proceso vive)
  y no con `tasklist`, que desde el .exe sin consola se queda colgado. Ojo:
  el POST ya lleva el cerrojo de la sesion; un `with sesion.lock` dentro se
  quedaba esperando para siempre (segunda vez que pasa).
- **Guardar siempre**: el boton ya no se apaga sin cambios (Aaron tuvo que
  bajar de nivel a uno para poder guardar y que se aplicaran los arreglos).

### O-202 · Al amigo de Aaron no le salen las caras

Primer uso del zip portable en otro ordenador: la pantalla de inicio sale
entera pero las caras de los personajes son la silueta blanca. El zip esta
completo (5.685 caras y 12.560 uniformes en `datos/iconos/data/.../10_icon_chr`,
igual que en disco), la actualizacion automatica no borra nada y las rutas
del zip no pasan de 115 letras, asi que lo que falla esta en su ordenador (lo
mas probable: el zip descomprimido a medias o abierto sin descomprimir del
todo). Como desde aqui no se ve, el programa lo dice el mismo: `/api/estado`
devuelve cuantas caras, recortes y piezas de interfaz encuentra y la carpeta
raiz que esta mirando, y la pantalla de inicio saca un aviso rojo con eso
cuando falta algo.

### O-203 · Filtros plegados, "Mi equipo" destacado y orden por cada stat

Aaron: "que los filtros no salgan directamente, que haya un boton; menos el de
mi equipo en Jugadores, que destaque; y en Fichar, Equipos y Jugadores, poder
ordenar por cada stat en los dos sentidos; y que todo se combine bien".

- **Boton "Filtros y orden"** en Jugadores, Equipos (reservas), Fichar y
  Mochila (`botonFiltros`): la caja de filtros sale plegada, el boton lleva
  un numero naranja con cuantos filtros hay puestos (contando el orden si no
  es el de siempre), y se recuerda por pantalla si estaba abierta.
- **"Mi equipo"** va fuera de la caja, al lado del boton, en naranja y con
  estrella; cuando hay uno elegido el desplegable se pone en naranja entero.
- **Orden por stat**: la lista de Jugadores lleva ahora los siete stats base
  de cada jugador (`_stats7`, la misma tabla de 48 filas que `_poder`, sin
  coste) y el servidor ordena por `st0`..`st6`; las reservas y Fichar ordenan
  en la pantalla (Fichar con los stats a nivel 99 de su rareza, o de Diamante
  en la pestana "con semilla"). La tarjeta ensena el stat por el que se
  ordena (`AGI 358`) abajo a la izquierda, y el poder a la derecha.
- **El sentido con palabras**: "De mayor a menor / De menor a mayor" para
  numeros, "De la A a la Z" para nombres, "Primeros huecos"... Los filtros
  siguen combinandose (posicion + afinidad + equipo + orden por stat, etc.),
  porque el orden se aplica sobre lo ya filtrado, como antes.

### O-204 · La "Configuracion de equipo" (Tension, Justicia, Contraataque, Libertad...)

Aaron: "en cada equipo el juego ensena una configuracion (Tension en el Super
Alpino), fija, que solo cambia cambiando jugadores, e importa para algunas
pasivas ('Por cada rango de Conf. Tension...'). Averigua como la decide".

**Lo que dice el propio juego** (textos de ayuda, `help_list_text` y
`menu_text`): "La configuracion del equipo se define segun el NUMERO DE
PASIVAS que poseas de cada tipo. 'Libertad' aparece al no cumplir los
requisitos de ninguna otra configuracion" y "Segun las pasivas de tus
personajes, tu equipo tendra una de estas siete configuraciones: justicia,
juego sucio, vinculo, tension, contraataque, brecha o libertad".

**No se guarda en la partida**: se compararon todos los campos del registro
de siete equipos con configuracion distinta y ninguno cambia con ella (el
juego la calcula al abrir la plantilla). **En los datos del juego** (indice de
las 3.000 tablas de todos los `.cfg.bin` fuera de mapas y escenas):
`skill/team_build_config` (seis configuraciones, una por arquetipo, "Vinculo"
es Afinidad; cinco rangos de efecto y las reglas que suben y bajan la "Carga
de configuracion" durante el partido), `soccer/team_build_effect_config`
(los efectos de cada rango) y las listas de "build type" de personajes de
temporada. El **minimo de pasivas** para que cuente una configuracion no esta
en ninguna tabla: va en el programa del juego.

**La regla, con siete equipos de Aaron** (Super Alpino Tension, test2
Libertad, ECLIPSE-9 Tension, ECLIPSE-12 Justicia, ZeusAllStars Contraataque,
Good Losers Libertad, calvos Justicia):

1. Cuentan las personas validas: los once del campo que NO llevan medalla de
   personal y el cuerpo tecnico que SI la lleva. El banquillo no. Good Losers
   es Libertad porque sus once son gerentes y entrenadores con medalla (los
   triangulos rojos de la foto).
2. De cada una cuentan sus **pasivas de arquetipo**: las ranuras 4 y 5 de un
   jugador (la 3 la elige el arquetipo pero es del monton, como la 1 y la 2,
   dicho por Aaron; la heredada tapa a la normal), las cinco de personal de un gerente
   o entrenador (las que son de un solo arquetipo en `pasivas-personal.csv`),
   y las fijas de un Idolo o Diamante con la ficha vacia (las de su
   arquetipo, O-163). Las **heredadas cuentan** (tapan a la normal de su
   ranura): calvos y gordos son Justicia justo por las heredadas de Justicia
   que Aaron les puso. Las heredadas que vienen de un tablero de Idolo se
   tipifican por su grupo de rareza (`pasivas-rareza.csv`). El arquetipo que
   lleva puesto el jugador no cuenta:
   en calvos los once son de arquetipos de todo tipo pero todos llevan
   pasivas de Justicia y la configuracion es Justicia.
3. Solo cuentan las pasivas **desbloqueadas** (marca 1 en la tabla con numero,
   O-166): test2 al nivel 22 tiene las ranuras 4 y 5 con candado en los once
   y es Libertad; Aaron los subio al 99 con el editor y, con 8 de Tension
   (4 de Vinculo, 4 de Juego sucio, 4 de Brecha, 2 de Contraataque), salio
   **Tension**. Lo dijo Aaron ("salen Libertad porque estan bajos de nivel y
   aun no desbloquean las dos ultimas").
4. Gana el tipo con mas pasivas si llega al minimo, que es **5**; si no,
   Libertad. Lo midio Aaron en test2 con el resto al nivel 1 (candado, cuentan
   0): tres jugadores de Tension al 99 (6 pasivas) -> Tension; dos (4) ->
   Libertad; dos mas una heredada de Tension en un jugador de otro arquetipo
   (5) -> Tension. Comprobado con su partida: test2 tiene 5 de Tension, 4 de
   Vinculo, 4 de Brecha, 3 de Juego sucio y 2 de Contraataque y sale Tension.
   **Empate** entre los dos primeros (test2 con 5 de Tension y 5 de Juego
   sucio, forzado por Aaron): el juego pone **Libertad**; el editor lo dice
   ("empate") y ya no desempata por las pasivas del campo.

Lo primero que se probo (contar arquetipos puestos de los 16) cuadraba 5 de
7; fue Aaron quien apunto a las pasivas. `EQ.configuracion_de_equipo` ->
pieza "Conf. de equipo" en la cabecera del equipo (con el reparto de pasivas
y personas al pasar el raton) y linea en las pasivas sumadas, en Equipos y en
Jugadores al elegir un "Mi equipo".

### O-205 · Quien se puede fichar de verdad (el Byron del modo Aphrody no)

Aaron: "en Fichar hay varios Byron Love y uno (delantero, 1330 de poder) es el
resultado del modo Aphrody de Thaddeus: no se puede fichar en el juego. Hay
mas con modos parecidos (Beta modo Reina, Buddy Fury, Seth, Cascada Perfecta,
Epsilon); investiga en los archivos del juego antes de quitar nada".

**Las formas de partido**: `character/chara_change` trae CHARA_MODE_CHANGE_LIST
(12 parejas "de -> a": Shawn Froste, Scott Banyan, Buddy Fury x4, Bilal Kalil,
Aitor Cazador, Beta, Hekyll Jyde, Thaddeus Bellefax -> Byron Love `C68B09DE`,
Seth Bael) y CHARA_CHANGE_AWAKENING_POWER_LIST (31 despertares: los once de
Epsilon y los dieciseis de Cascada Perfecta, que ni estan en `jugadores.csv`,
mas Seth Bael `3E55F38F -> A75CA235` y los tres Dvalin de Epsilon Plus). Esas
segundas formas no se fichan nunca.

**Las vias por las que el juego da personajes** (todo tablas del juego, ver
`herramientas/construir_fichables.py`): el Universo de jugadores
(`players_universe_config` m_starSignCharaInfoList, 5.010 identidades: la
lista grande), los Diamantes Basara (`basara_chara_config`, 70), la tienda
(`shop_config`: TODAS sus SHOP_INFO_ITEM_LIST, que hay una por tienda y
`volcado` sin `--todas` solo da la primera, mas SHOP_BASARA_SPIRIT_LIST; ahi
estan los tres de evento que Aaron recordo, el Mark nino sin bandana
`06E25622`, el Jude sin gafas `2DCF05E1` y el Shawn de ojos de dos colores
`3CFE7E61`, y el Axel Blaze Diamante `A41870E9`), los de rareza unica (141), los regalos por correo
(`delivery_config`, 9), las plantillas de los equipos rivales de la Cronica
(`team_config`, equipos `tm_cro_*`; de ahi salen el Zanark con Cao Cao
`1EC03F8D` y la Beta modo Reina `8842AB42`, que Aaron da por fichables y no
estan en el Universo; la otra Beta, `B0069AEE`, es la del cambio de modo) y el
archivo de datos (`data_file_config`, 550: los clubes del instituto y demas
gente de la historia, que Aaron tiene en su partida).

**Destin Billows** (el protagonista, avatar de Aaron): el que se ficha como
jugador de campo (`BCC3EB16`, en `jugadores.csv`) no sale por ninguna via y
se quita; Aaron: "Destin solo puede ser entrenador o gerente, lo tienes por la
historia y suelta espiritus suyos que luego invocas". Los suyos son la version
de entrenador `C19FE60C` (siete en su partida, rarezas 3, 4 y 8), que no esta
en `jugadores.csv` (sin arbol) y el editor nunca ofrecio: no se tocan.

Comprobado contra la partida original de Aaron (2.645 personajes: todos salen
por alguna via) y contra sus certezas (Zanark Cao Cao y una Beta Reina si;
Byron Aphrody, dos Seth, Buddy Furia, Shawn con Axel, Jude con Caleb no). Lo
unico que pide excepcion es la regla de las formas de partido: la Seth
despertada esta en un equipo rival de Orion y aun asi no se ficha.

Resultado: `fichables.csv` (5.623) y `no-fichables.csv` (100 entradas de
`jugadores.csv`: 16 formas de partido y 84 sin via, casi todos figurantes:
Umibozu, UM-BZ9, Cien Peldanos, caras `npc`, el Destin de campo...).
`personajes_creables` solo ofrece los fichables; la base de datos sigue
ensenando a todos. Los que ya esten en la partida no se tocan.

### O-206 · La tecnica de un kenshin no se aprende aunque venga en el arbol

"Guardia sombria" (`DD1DC90C`) es la tecnica del kenshin Sombra de plasma DF
(`espiritus.csv`) y a la vez `chara_param` la trae en el arbol de dos
Guardianes de la Reina: Dardinello Foscari `1CB0E623` (rama 2, nivel 30) y
Camilla Gonzaga `4B282B92` (rama 1, nivel 38). `tecnicas-origen.csv` la daba
por "personaje" y obtenible (O-171), y al fichar un Dardinello Diamante el
editor la ponia en la ranura 7.

Aaron lo comprobo en el juego con dos Dardinello Diamante, uno fichado en el
juego y otro con el editor: en el arbol esa casilla sale VACIA en los dos; en
la ficha del del editor aparecia "Guardia sombria" y al subirlo a 30
desaparecia. En su partida, la ranura 7 del Dardinello del juego esta a 0 y la
del editor llevaba `DD1DC90C`. Con Camilla, igual (probado en una partida sin
editor).

En cambio "Rizo de dragon" (`467E091C`), que es la tecnica de una ARMADURA
(Guiverno blanco) y esta en 19 arboles, si se aprende: los Bai Long Idolo y
Diamante de la partida original de Aaron la llevan en las ranuras 3-5 (y 7).
Son las dos unicas tecnicas de arbol que ademas son de un espiritu (aparte de
unas "especial" sin nombre que el editor nunca ofrecio).

Arreglo: en `construir_tecnicas_origen.py` la tecnica de un espiritu de
familia kenshin es "kenshin" (no obtenible) antes que "personaje"; y
`_tecnicas_de_salida` (fichar y `poner_diamante`) deja a 0 la ranura de una
tecnica no obtenible, como el juego. Los Dardinello del editor ya hechos se
arreglan solos al subir de nivel (el juego la quita).

### O-207 · Repaso de todas las tecnicas contra las tiendas (todo se queda)

Aaron: "revisa todas las tiendas, de historia, normales, de espiritus, y dime
que tecnicas ofrece el editor que no se consigan; sospecho de Soy
todopoderoso". Se cruzaron las 1.004 tecnicas con las 16 listas de
`shop_config` (con `--todas`: G-Mart x3, Pingui Go x2, Movimientos magicos
x2, Tienda de Cronica, Tienda Vs, Tienda vinculo, Mercado BB, Mercado de
espiritus, El atrio de los indomables, Tienda del torneo y una sin nombre en
ningun idioma; el volcador desordena las filas padre de SHOP_INFO_LIST, asi
que dos listas no se pudieron nombrar con seguridad), los trofeos, el correo,
los botines (`common_item_table` ITBL) y los arboles SOLO de fichables
(`fichables.csv`).

- Todas las de arbol las aprende algun fichable; ninguna depende solo de una
  forma de partido (Byron Aphrody, Buddy Furia...).
- Soy todopoderoso `332A85B6`: la vende la Tienda Vs y la aprenden Huracan
  Zeta y Zack Avalon, fichables. Se queda.
- La Tierra: Infinito, Pinguinos de luz y sombra, Tiro aereo triple: solo
  aparecen en una lista secundaria (CONSUME) de una tienda, no como
  articulo; Fuego cruzado y Gota de la quietud: solo en la lista de tienda que
  no se pudo nombrar. Aaron: "dejalas todas".
- Mano matriarcal `945A81A9`: llega por correo (`delivery_config`) y estaba
  como "ninguna". Ahora `delivery_config` cuenta como tienda en
  `construir_tecnicas_origen.py` y se ofrece.

### O-208 · Filtro "Juego" (la saga de cada personaje)

Aaron: "anade en Jugadores, Fichar y Equipos un filtro por juego o saga, que
el juego lo tiene". `chara_base` columna 15 es la clave de serie;
`chara_series_config` (m_charaSeriesInfoList, 9 filas) la lleva a un numero
1-9 y a una clave de texto, y el nombre esta en `text/es/chara_add_info_text`
(NOUN_INFO): Inazuma Eleven, 2, 3, GO, GO 2 (Chrono Stones), GO Galaxy,
Ares, Orion y Heroes' Victory Road. `construir_personajes.py` escribe `saga` y
`saga_num` en `personajes.csv` (6.091 de 6.151 con saga; los 60 sin ella son
figurantes: Cien Peldanos, Profe de ciencias...). Ojo: el volcador solo pone
linea de recuento cuando la tabla la tiene, y saltarla a ciegas se comia
Inazuma Eleven 1.

El servidor lo manda en la ficha corta (Jugadores y reserva del Team
builder), en Fichar y en la base de datos, y admite `saga=` como filtro;
`montaFiltros` (comun.js) acepta `orden` para listar los juegos en su orden
y no por abecedario.

### O-209 · Armaduras, mixi max y modos: por identidad exacta, no por nombre

Aaron: "el Modo Atacante solo lo puede tener el Shawn de defensa con bufanda y
creo que el editor me dejaba darselo a otro Shawn; mira que las armaduras y
mixi solo las tengan las versiones que de verdad pueden (cambian el modelo)".
En O-172 se comparaba por NOMBRE porque no se sabia que versiones valian.

Lo que dicen los datos: la columna 13 de AURA_CMD_INFO_LIST no es "el
companero" (O-172 se equivocaba) sino el MODELO transformado: una fila de
chara_param sin arbol (no fichable) con el nombre del usuario. El mixi "con
Shawn" (FUBUKI) apunta a un Axel Blaze, el "con Axel" (GOENJI) a un Shawn, el
de Raika a Cade Shelby, el de Cao Cao al Zanark `1EC03F8D`: justo la lista de
usuarios que ensena la tienda del juego y que Aaron dio de memoria. Y la fila
de chara_base de ese modelo lleva en la columna 9 el chara_base del personaje
ORIGINAL (144 de 172 espiritus con dueno conocido lo cumplen; los demas tienen
0 ahi). Todas las identidades de ese chara_base (normal, los Idolos y el
Diamante) son los usuarios: fuente `modelo` en `espiritus-duenos.csv`, que se
suma a `change` y a las columnas de chara_param (`cpN`). Los modos solo tienen
`cpN` y por eso el Modo Atacante queda para `A2957757` y nadie mas.

Dos mixi sin nada (col 9 a 0): Cao Cao y Tiranosaurio; en la partida original
de Aaron los lleva un Zanark Idolo y un Fei Rune Idolo puestos por el juego,
asi que heredan los usuarios de Zeta y de Big (fuente `aaron`). La copia de
historia del mixi de Raika toma los de la normal.

`espiritu_permitido` ya solo mira la identidad exacta. Comprobado: de los 646
espiritus puestos por el juego en la partida original y los 454 de la actual,
todos pasan. La tabla pasa de 428 parejas a 722.

### O-210 · Un gerente o entrenador recien fichado llega con sus pasivas

Aaron: "cuando ficho un entrenador o gerente me salen sus pasivas vacias y en
el juego si las tiene". `anadir_jugador` vaciaba la tabla con numero
(`_vaciar_tabla_pasivas`), le ponia la medalla y no la volvia a rellenar; y
`sincronizar_tabla_pasivas` en la rama de personal solo tocaba las marcas.

Ahora `juego_de_personal(plain, fila, rol)` da los 5 ids que le tocan: un
normal DE FABRICA el de su clave (chara_param col 6), su rol y su arquetipo
(`pasivas-personal.csv`, O-164); un Diamante de personal el de su arquetipo
elegido con la clave 100, sea quien sea (Aaron: "una Nelly gerente Diamante
de Tension tiene las mismas que una Celia"). La rama de personal de
`sincronizar_tabla_pasivas` los escribe (valor de su rareza, O-197; marca 0
hasta que el arbol abra las casillas 33-39, O-200) cuando la tabla esta vacia
y es de fabrica o Diamante, y cuando un Diamante no lleva el juego de su
arquetipo (acaba de elegirlo con `poner_arquetipo_diamante`). Un normal
convertido con la medalla sigue vacio (O-164). Fichar llama a la
sincronizacion tras poner la medalla.

Comprobado con la partida de Aaron: los 4 Diamantes de personal llevan justo
ese juego; de los 148 normales de fabrica cuadran 86 y los otros 62 son los
que Aaron cambio a mano (cinco copias de la misma pasiva, o una ranura vacia).

### O-211 · La sinergia defensiva no se podia poner ("no tiene el hueco 2")

Aaron: "intento equipar una sinergia defensiva a un equipo que cumple y me
sale 'ese equipo no tiene el hueco de sinergia 2 en la partida'". `leer()`
recorria el bloque de detras del nombre con una ventana de 200 bytes y el
bloque mide unos 220: la segunda pareja (id `20D7819C` + hueco `585CA018`)
quedaba a medias, sin su hueco, en TODOS los equipos. Ventana a 600 (se para
en `033925BC` igualmente). Probado con la partida: ofensivas y defensivas
entran en su ranura (ECLIPSE con "Promesa del camino a la victoria" en la 2).

### O-212 · La pasiva personalizada suma en las pasivas de equipo

Aaron: "las pasivas personalizadas cuentan para la suma de bonificaciones
del equipo igual que las normales: todos menos los suplentes". No estaba:
`pasivas_de_equipo` solo recorria las cinco de la tabla con numero. Ahora
anade la personalizada de cada miembro que cuenta (`E.pasiva_personalizada`,
O-179; su texto y valor estan en `pasivas-valor.csv`, `ss_ps5xxxx`), en el
mismo grupo que las normales del mismo texto, y en "quienes" sale marcada
"(personalizada)". Comprobado en la partida: en Super Alpino suman Njord,
Shawn y Aiden con la 29 y no los suplentes Fifi, Grisley o Adam.

### O-213 · Las heredadas van a su grupo de ranuras: 1-3 con 1-3 y 4-5 con 4-5

Aaron: "solo puedes heredar pasivas de los 3 primeros slots a los 3
primeros, y las de los 2 ultimos (las de arquetipo) a los 2 ultimos; nunca
cruzadas". `O.grupo_de_heredable(id)` da "1-3" o "4-5": en un normal por el
grupo de `pasivas-por-ranura.csv` ("(ranuras 1-2)" y "(ranura 3)" contra
"(ranura 4)" y "(ranura 5)": 36 y 27 de las 63, ninguna en los dos); en un
Idolo por la casilla de su tablero propio en `pasivas-fijas.csv` (tronco 1,
3, 7 y rama 8/18 son las ranuras 1-3; tronco 11, 14 y rama 12, 15/22, 25 las
4-5; tampoco hay cruces). El selector "Heredar aqui" pide
`/api/opciones?tipo=heredada&ranura=N` y solo ensena las de ese grupo;
`poner_heredada` rechaza las cruzadas. Cuadra con la partida: de las 667
heredadas puestas, ninguna cruza de grupo.

### O-214 · "Conseguir 1 de todo" solo da lo que se consigue de verdad

Aaron: "en la mochila, conseguir 1 de todo te sigue dando tecnicas EV e
ilegales; y la Parada celestial TURBO es legal, que se pueda conseguir".
`conseguir_todo` daba las 994 tecnicas y los 443 espiritus de `nombres-es.csv`
tal cual. Ahora, para "supertecnica" solo las `obtenible = si` de
`tecnicas-origen.csv` (784: fuera las 29 de la historia "... EV" / "de la
amistad" / "Ensueno", las 152 de kenshin, las 32 de combinacion y las 9 de
prueba), y para "aura" solo los espiritus que alguien puede llevar (fuera las
copias de escena, los sin tecnica y las armaduras, mixi y modos sin dueno,
O-209): 426 de 443. Lo que ya estuviera en la mochila no se toca. Ojo: "Mano
celestial EV" y "Mano celestial de la amistad" siguen entrando porque las
venden El atrio de los indomables y la Tienda Vs (O-207).

Parada celestial TURBO (`32DBF59E`) no esta en ninguna tienda ni arbol de
fichable, pero Aaron la ha visto conseguir: lista `DE_AARON` en
`construir_tecnicas_origen.py`, origen "tienda", obtenible.

(Lo de "usar nuevas posibilidades" quedo resuelto en O-215.)

### O-215 · Una tecnica que no es del arbol se pone como "Nuevas posibilidades"

Aaron: "si cambio una tecnica con el editor, en el juego sale 'usar nuevas
posibilidades' en vez de aprendida; asi es ilegal". Hizo la prueba: partidas
`nuevas posibilidades 1` y `2` (Kevin Dragonfly fila 840, ranura 2, Arcoiris
luminoso -> Ataque condor usando "Nuevas posibilidades" en el juego). Byte a
byte, lo que hace el juego:

- la ranura 2 (`DDC45584`) pasa a apuntar al **monton de manuales** de Ataque
  condor (fila de mochila kind 3, sub 2, 99 unidades) y ese monton cuenta un
  jugador mas (`equipada` 0 -> 1); las 99 unidades no bajan;
- el consumible **"Nuevas posibilidades"** (`63166002`, sub 1) baja de 99.221
  a 99.220;
- la fila de Arcoiris (aprendida, sub 10) pierde un equipado y su referencia
  se escribe en la **fila espejo** del jugador (registro de tecnicas
  `fila + 6000`, misma ranura): S-05 confirmado, ahi guarda el juego "aprendida
  sin equipar";
- `45E2D879`, el mapa del arbol y `BB459017` no cambian;
- y ademas el juego recuenta equipadas de otras filas (Vaselina 79 -> 78,
  Despeje explosivo 27 -> 22...) y rellena listas de novedades (`E2C66FA7`
  x muchas, pares de 16 bits en `11076639`), que no hacen falta.

Asi que O-168 era verdad a medias: las tecnicas DE SALIDA apuntan a filas
aprendidas, pero una tecnica que no es la propia del arbol apunta al monton.
`poner_tecnica` ahora hace las dos cosas: si la tecnica es la propia de esa
ranura (`personajes.csv` tec1..9) o una hipertecnica, fila aprendida como
antes; si no, monton de manuales (hace falta tener el manual) mas una
"Nuevas posibilidades" (hace falta tener alguna) y la que sale a la fila
espejo. Reproducido sobre `nuevas posibilidades 1`: ranuras, espejo, monton y
consumible salen identicos a la partida 2.

De paso, en la misma comparacion: el juego puso a 0 las marcas de la tabla
de pasivas de Kreaton Coco, Paco Dermott y Terry Pinn (ranuras 3-5, llevan la
misma heredada TRES veces, de las de Cheat Engine, O-107) y del Seymour
Hillman Diamante entrenador (sus casillas 33-39 no estan abiertas, O-200).

### O-216 · La ranura 3: al cambiarla, la del arquetipo; al heredar, cualquiera de 1-3

Aaron, en dos pasos. Primero "la ranura 3 no es pasiva de arquetipo, es
normal, aunque al invocar dependa del arquetipo; las de arquetipo son solo la
4 y la 5", y con eso se abrio la ranura 3 a las de cualquier arquetipo
(version 2026.09.19.13). Luego lo afino: "al CAMBIAR la pasiva de la ranura 3
salen unas u otras segun el arquetipo, como te explique; al HEREDAR se puede
pillar cualquier pasiva de las ranuras 1, 2 o 3". Asi que se deshizo lo de
la .13: `O.pasivas` y `poner_pasiva` vuelven a dar en la ranura 3 solo el
grupo "<arquetipo> (ranura 3)" del arquetipo puesto (O-51, O-57), y las
heredadas siguen como en O-213: a las ranuras 1-3 cualquiera de los grupos
de 1-3, a las 4-5 solo las de arquetipo. Kreaton, Paco y Terry (pasiva de la
ranura 3 de otro arquetipo) son legales por la via de heredar.

Al repasar la partida con el criterio viejo salian 1.085 jugadores "raros"
(ranura 2 fuera de su pool observado, o la misma pasiva en 4 y 5); los pools
de las ranuras 1-2 son observados, no del juego, y Aaron da esos jugadores
por legales: no se toca nada ahi.

### O-217 · Crear un equipo: ponerle nombre a un hueco vacio ("+ Equipo nuevo")

Aaron: "que alguien sin equipos pueda darle a + y crear otro, con el tope de
11 del juego. En el juego no se borran equipos: si los vacias se quedan
vacios pero el hueco sigue; y creo que hasta que no abres un equipo no sale
el hueco". Su amigo solo ve 3 en el editor (los 3 con nombre).

En la partida los huecos de equipo del jugador van de tres en tres desde el
6 (`huecos_de_equipo`: 6, 9, ... 45, catorce; el segundo de cada tres es la
copia de partido y el tercero va a cero). Un hueco recien preparado por el
juego (33, 34, 43, 46 de la partida de Aaron: sin nombre, sin nadie) lleva
formacion 2484170522, equipacion 2961452819 (con su hueco de mochila en
`627F2D54`) y escudo 1456326706; el resto de campos a cero. `crear_equipo`
coge el primer hueco de esos catorce sin nombre y sin nadie, le pone eso
mismo (a el y a su copia de partido), y el nombre. Tope: 11 con nombre
(`TOPE_EQUIPOS`), que es lo que ensena el juego. Como jugando solo se llega a
los equipos con nombre (O-120), ponerle nombre deberia bastar para que salga
en el juego; falta que el amigo de Aaron lo confirme (Aaron no puede: sus 11
estan usados).

### O-218 · Presets (judias, equipacion, pasivas), boton MAX y panel de stats como el juego

Aaron pidio atajos de clics, "aunque tengas un preset puesto puedes cambiar
cosas", con popup bonito e iconos, y nada de esto para Idolos ni Diamantes.
`ievr/presets.py` los define y los aplica con las mismas funciones de
`escribir.py` (y sus reglas) que ir ranura por ranura:

- **Judias** (encima de las judias): Delantero (Potencia, Control, Tecnica),
  MD (Control, Tecnica, Inteligencia), Defensa (Inteligencia, Presion,
  Fisico), Portero (Presion, Fisico, Agilidad); siempre al tope del nivel.
  Se vacian las tres ranuras antes para que no choque el "no repetir tipo".
- **Equipacion** (encima de la equipacion): Delantero (Botas con tacos,
  Pulsera del abismo, Bufanda del campeon, Brazalete Omega), MD (Zapatillas
  Tormenta cortante, Pulsera luz de luna, Collar azul celeste, Pegatina de
  Pegaso), MD/DF focos (las dos primeras, Capa de Sharp = `Capa de <FLC:YUTO>`,
  Gafas deportivas Neo), Defensa muros (Zapatillas Aplastarocas, Guantes
  legendarios, Capa de comandante, Accesorio de profesor Layton), Portero
  (Zapatillas Llamarada volcanica, Guantes legendarios, Colgante del guardian,
  Talisman de Evans). Si falta la pieza en la mochila se crea (como "Conseguir").
- **Pasivas** (encima de las pasivas), en dos pasos: el arquetipo (el jugador
  pasa a el y lleva su pareja x2 en las ranuras 4 y 5 por "Cambiar": Justicia
  `5590EE4C`, Brecha `9D5F52A9`, Contra `1F3D649B`, Afinidad `B019292C` (Conf.
  Vinculo por cada 1 % del poder de afinidad, desde 2026.09.22.5; antes
  `01D4B17B`, O-229),
  Tension `7467BCE0`, Juego sucio `2B41EE9C`), y el subpreset: la heredada x3
  en las ranuras 1-3 por "Heredar" mas la pasiva personalizada equivalente
  (foco/tiro por posicion o elemento, tiro propio, PP; PP no tiene equivalente
  y lleva la de foco de distintas posiciones, `269B0969`). Los textos se
  ensenan con el numero de Leyenda, que es como los dio Aaron.
- **MAX** (cabecera, a la izquierda del nivel): nivel 99, Leyenda del futbol
  y 30 partidos de una vez.
- **Panel de stats** como la pantalla del juego: fondo claro con hexagonos,
  numeros azul marino, debajo de cada uno la posicion a la que mas le rinde
  (`POS_OPTIMA`: Potencia DC; Tecnica y Control DC/MC; Inteligencia DF/MC;
  Presion POR/DF; Agilidad POR; Fisico POR/DF, en chapitas de color) y el
  disco oscuro con la figura roja y el icono de cada stat en su punta. El
  desglose (judias, equipacion, arbol) pasa al tooltip de cada numero.
- De paso: "Cuando el equipo gana en foco o disputa, tension" (`5E0C7F82`)
  se colaba en el selector de Contra; es de Tension. Fuera de
  `pasivas-por-ranura.csv` (grupos Contra 4 y 5) y `EXCLUIR` en
  `construir_pasivas_jugador.py` para que no vuelva.

Segunda vuelta (Aaron): los presets de judias y de equipacion valen tambien
para Idolos y Diamantes; el de pasivas no. El MAX sale en todos, pero a un
Idolo o Diamante solo le sube el nivel a 99 y le pone 30 partidos (la rareza
es fija). Y se quito el boton "Convertir en Diamante" de la ficha: Aaron
prefiere que la unica forma de conseguir uno sea Fichar (la accion
`diamante` sigue en el servidor por si hiciera falta, sin boton).

### O-219 · El apodo de cada personaje, y buscar por el

Aaron: "cada personaje tiene un apodo (Mark Evans es 'Mark', Cerise Crane es
'Phoenix'); que al buscar en Jugadores, Fichar, Equipos... salga tambien por
el apodo". Esta en `chara_base` columna 4: la clave de texto del apodo en
`chara_text` (col 3 es la del nombre). `construir_personajes.py` la escribe
como `apodo` en `personajes.csv` (6.072 de 6.151 lo tienen; 509 son distintos
del nombre: Byron Love "Aphrody", Terry Pinn "Tortoise"...). Va en la ficha
corta, en Fichar y en la base de datos, entra en todas las busquedas (la del
servidor en Jugadores, la reserva del Team builder, Fichar y la base de
datos) y la cabecera de la ficha lo ensena bajo el nombre como el juego,
cuando no es el propio nombre.

### O-220 · La chapita del juego de origen en cada tarjeta

Aaron: "arriba a la derecha de cada personaje, en pequeno, el icono de cada
juego, porque hay jugadores iguales de juegos distintos". El juego no trae
un icono por saga (se miraron las laminas de `200_icon`: `icon_common2` son
las chapas de posicion, `icon_list_tab_filter` los iconos del filtro, y en
`220_img` solo hay logos de DLC y del titulo), asi que la chapa es nuestra:
`chapaSaga` en `comun.js`, con siglas y color por juego (IE1, IE2, IE3, GO,
CS, GX, ARES, ORI, VR) y el nombre completo al pasar el raton. Va en todas
las tarjetas (Jugadores, reserva del Team builder, Fichar y base de datos),
en la linea de datos de la ficha y como chip en la ficha de la base de datos.

### O-221 · Imagenes rotas al arrancar: la cola de conexiones del servidor

Aaron: "a veces al iniciar salen imagenes sin cargar (iconos de Fichar y
Supertecnicas, el fondo de Base de datos); al entrar y salir del editor se
corrige". El servidor iba con `ThreadingHTTPServer` tal cual: HTTP/1.0 (una
conexion por peticion) y cola de conexiones pendientes de 5. La pantalla de
inicio pide de golpe una veintena de imagenes, el css y el js; cuando la
ventana abria mas conexiones de las que cabian en la cola, Windows las
rechazaba y esas imagenes quedaban rotas hasta recargar (por eso "a veces").
Ahora `ServidorPizarra` lleva cola de 128 y hilos daemon, y `Manejador` va
por HTTP/1.1 con la conexion abierta (todas las respuestas llevan
Content-Length: `_responder` y `_fichero`), asi que el navegador reutiliza
unas pocas conexiones. Probado con 150 peticiones a la vez: 150 de 150 bien.

### O-222 · Filtros "Armadura", "Mixi max" y "Modo"

Aaron: "en Jugadores, Equipos y Fichar, un filtro de personajes que puedan
llevar armadura, mixi max o modo (Reina, Aphrody...) de forma legal".
`O.puede_llevar(identidad)` lo saca de `espiritus-duenos.csv` (O-209): por
identidad exacta, y "modo" son las especiales de un personaje (no las cinco
de todos, O-174). En la partida de Aaron y en las tablas: 151 identidades
solo armadura, 81 armadura y mixi, 24 solo mixi, 11 solo modo, 2 mixtas. Van
como tres campos "si"/vacio en la ficha corta y en Fichar, con su filtro en
las tres pantallas (el recuento solo cuenta los "si").
En Fichar y en la reserva no salian: `montaFiltros` (comun.js) esconde un
filtro con menos de dos valores distintos, y estos solo tienen "si". Ahora
las definiciones llevan `siempre:true` y se pintan aunque solo haya un valor
(2026.09.20.8). Comprobado en el navegador: Fichar Modo 9, Mixi 26, Armadura
136 (pestana de jugadores); reserva 13 / 104 / 190, igual que `/api/jugadores`.

### O-223 · El capitan y el entrenador del equipo: si no cuadran, no se puede poner de predeterminado

Aaron: "intento poner TRAINERS de equipo predeterminado y suena el error, como
si tuviera algo mal; a mi amigo le paso lo mismo con un equipo hecho con el
editor, y al meter a los mismos jugadores a mano en otro hueco ya le dejo".

En su partida de hoy, TRAINERS es el antiguo hueco 9 (ECLIPSE) con toda la
plantilla cambiada por el editor. Comparando sus campos con los de los otros
equipos: en **todos** los hechos por el juego (los once de la partida
original, Furros, NEW Fauxshore, Super Alpino) `F_CAPITAN` es el slot de uno
de sus jugadores (campo o banquillo: Good Losers lo lleva en el puesto 15) y
`F_ENTRENADOR` es la identidad del personaje del **puesto 19**. En TRAINERS
el capitan seguia siendo Mark Evans (fila 2714), que ya no esta en el
equipo, y el entrenador seguia siendo Briar, con Axel Diamante en el 19. Son
los dos unicos campos que no cuadran con la plantilla. Y el equipo nuevo del
amigo (O-217) nace con los dos a cero, que tampoco cuadra.

O-132 decia que `F_ENTRENADOR` "vale cero siempre" y por eso el editor dejo
de escribirlo: era falso (en la partida original va relleno en los once
equipos), y el capitan nunca se revisaba al sacar o mover gente.

Ahora `cabecera_prevista` da lo que toca: el capitan de antes si sigue
siendo jugador del equipo, y si no el del puesto mas bajo del campo; el
entrenador, la identidad del que este en el 19. El juego no borra estos
campos al vaciar un equipo (ECLIPSE, ESPANA... vaciados los conservan), asi
que sin jugadores o sin nadie en el 19 se deja lo que hubiera.
`_sincroniza_cabecera` lo aplica al meter, sacar, mover o intercambiar
miembros (el aviso dice "Capitan ahora: X" cuando cambia);
`cabeceras_desajustadas` / `arreglar_cabeceras` lo revisan en el Resumen y
al guardar, como los dorsales y las piezas. En las partidas hechas por el
juego no sale ningun equipo desajustado; en la de hoy, solo TRAINERS (8
bytes: capitan Seymour Hillman, entrenador Axel). **Confirmado por Aaron**
con la 2026.09.21.1: "ya va el equipo, seguramente era eso".

### O-224 · Las armaduras, mixi max y almas no tienen pasiva propia

Aaron: "quita los efectos de las pasivas de almas, armaduras y mixi". Tenia
razon: en `AURA_CMD_INFO_LIST` la pareja UNIQUE de esas familias (y de los
modos) va con cuantos = 0, y `construir_pasivas_espiritu.py` caia en la fila
1 de la lista y les ponia a los 296 el mismo texto de relleno ("Cuando un
jugador de otro elemento esta cerca, AT propio de tiro +20 %"). Ahora se
salta las fichas sin UNIQUE: quedan 103 kenshin y los 3 despertares con
efecto propio (Sobrecarga ardiente, Impulso temporal, Catalizador
elemental). Lo que si llevan todas las familias son los efectos genericos
de `AURA_CMD_EFFECT_LIST`, distintos por familia (ver O-225).

### O-225 · Los cambios de modo (Aphrody, Reina, Furia...): en que se convierte cada uno

Aaron: "en el juego no te dice nada de lo que hace un modo; al activarlo te
cambia el set y te da buffos; quiero saber cuales sin probar uno a uno".

`CHARA_MODE_CHANGE_LIST` (`character/chara_change`) solo trae 12 parejas
"personaje -> forma"; la forma es otro personaje entero de `chara_param`
(no fichable, O-205). Comparando cada pareja con la base de datos:

- **Stats**: los de la forma (su propia ficha, misma rareza y nivel). En 7
  de los 12 son iguales; cambian en Shawn (Modo Atacante: pasa de DF a DEL
  y de Afinidad a Brecha, con mas Potencia y Control y menos Presion y
  Fisico), Aitor (Modo Dos Caras: -12 Tecnica, +11 Inteligencia...), Seth
  (Modo Santurron: +27 de total), Bilal (solo cambia la posicion
  alternativa, DEL -> MED) y Thaddeus (Modo Aphrody: **se convierte en Byron
  Love**, de Tension a Brecha, 1097 -> 1330 a nivel 99 rareza comun).
- **Tecnicas**: la forma lleva su propio arbol, casi siempre con 3-6
  tecnicas repetidas (Beta: Disparo doble, Barrena voladora, Ataque Omega).
  Es el "set" del modo.
- **Efectos del modo**: la hipertecnica "Modo X" tiene ficha en
  `AURA_CMD_INFO_LIST` como cualquier espiritu, con cuatro efectos genericos
  en `AURA_CMD_EFFECT_LIST` (ids crc32, sin nombre en los ficheros):
  `-1474450477` = 60, `823458409` = 60, `-663265444` = 80 y `913915504` =
  10 (Modo Brutal sin el cuarto). Los tres primeros son los mismos ids que
  llevan los despertares (Sobrecarga ardiente y compania) con 30, 30 y 50,
  y la comunidad (inazumo.es, HyperMoves.csv) los tiene medidos como "Own
  AT/DF +30 %" y "Movement Speed Increase": asi que un modo da AT +60 %, DF
  +60 % y velocidad +80 %, y el cuarto no se sabe. Las variantes `_legend`
  de Aphrody y Santurron (jefes de la historia) llevan 800/800/80. Cada
  familia lleva su juego de ids: kenshin 50/50, armadura 30/30/50/50, mixi
  50/50/20/50, alma tres sin numero. Se intento descifrar los nombres por
  fuerza bruta con crc32 (120 millones de candidatos): nada fiable.
- Columnas 4 y 5 de la ficha: 75 y 90 en todos los modos (kenshin 45/60,
  despertares 30/90, almas 60/60). Probablemente tension y duracion; sin
  confirmar.

`herramientas/construir_modos.py` -> `modos.csv`; la ficha de la Base de
datos ensena la seccion "Cambio de modo" (forma, efectos, stats frente a
frente a nivel 99 por rareza, y las tecnicas de la forma) y en la forma, de
quien es.

### O-226 · Las ranuras 4 y 5 comparten la lista de pasivas del arquetipo

Aaron: "a Tom Skipper (Brecha) le he puesto en la 4 'por cada rango de Conf.
Brecha, tasa de parada del equipo +4 %' y en la 5 no me la deja poner".
`pasivas-por-ranura.csv` se hizo observando su partida (O-54), y esa pasiva
(`AEF0FCCC`) solo se habia visto una vez, en una ranura 4. Para los seis
arquetipos la lista observada de la 4 y la de la 5 es identica salvo por
esa; asi que la regla es una lista por arquetipo para las dos ranuras.
`O.pasivas` y `E.poner_pasiva` juntan ahora los grupos "(ranura 4)" y
"(ranura 5)" cuando se pide la 4 o la 5.

### O-227 · En la mochila solo existen como manual las pasivas que el juego da

Aaron: "puede ser que en la mochila aun se puedan conseguir pasivas que no
estan permitidas? revisalo con las que el editor deja poner a jugadores,
entrenadores y gerentes, y quita las ilegales de la mochila".

Los manuales de pasiva de la mochila son solo dos familias: las 37
personalizadas (O-179) y las de gerente y entrenador (O-185). No estan en
las tablas de tienda, correo ni trofeos (se buscaron los 149 ids en
shop_config, common_item_table, trophy_config y delivery_config: ninguno),
asi que la referencia es la mochila del juego: en la partida original de
Aaron hay 26 personalizadas, 44 de gerente y 43 de entrenador, y **ninguna
de las 24 de Diamante** (clave 100, O-198) aunque sus 4 Diamantes las
llevan puestas: los Diamantes las llevan sin objeto. En la de hoy hay 149,
con las 24 de Diamante a 99, creadas por "Conseguir 99 pasivas de personal".

Cambios: el boton ya no las crea; `pasivas_ilegales_en_mochila` /
`quitar_pasivas_ilegales` (Resumen y al guardar) vacian esas filas, que es
como estan las filas libres y los huecos que deja el propio juego (todo a
cero: slot, id, serie, kind, sub, cantidad y contador); a un Diamante el
selector le ofrece las 12 de Diamante de su rol sin pedir manual y
`poner_pasiva_personal` no le exige el objeto ni toca contadores. Las de
jugador (ranuras 1-5) y las heredadas no son objetos de mochila, asi que
ahi no hay nada que limpiar.

### O-228 · Un gerente o entrenador sin pasivas de personal no suma nada

Aaron: "cuando tienes un gerente o entrenador sin pasivas de gerente o
entrenador, la suma de pasivas del equipo pone las que tiene como jugador;
no deberia salir ninguna suya. Tanto en Jugadores como en Equipo".

`pasivas_de_equipo` (la misma funcion sirve a las dos pantallas) leia la
tabla con numero y, si estaba vacia, reconstruia desde las cinco ranuras de
la ficha: para un jugador vale, pero un convertido a personal conserva ahi
sus pasivas de jugador (O-185) y salian sumadas. Ahora un miembro del
cuerpo tecnico solo suma su tabla de personal; si esta vacia, nada. Y su
pasiva personalizada, tampoco.

### O-229 · Afinidad tambien tiene "Conf. Vinculo: por cada 1 % del poder de afinidad, AT/DF del equipo"

Aaron: "a un Afinidad le puede salir una pasiva que el editor no ofrece; la
tiene una Cate Heckel". Es `B019292C` (`ps10119`, familia afinidad en las
tablas del juego, +0.04 % de base y +0.1 % en Leyenda; la de personal
Diamante con el mismo texto es otra, `bcps10012`, +0.4 %). En la partida
original 17 jugadores de Afinidad la llevaban en la 4 o la 5, todos como
**heredada**, y `construir_pasivas_jugador.py` solo mira las cinco ranuras
normales de la ficha: por eso no entro en `pasivas-por-ranura.csv`. Anadida
a "Afinidad (ranura 4)" y "(ranura 5)" (`INCLUIR` en el generador).

Repaso del resto de arquetipos con las tablas del juego: quedan 10 pasivas
de familia afinidad/brecha/tension con id propio que no estan en las listas,
pero todas repiten el texto de otra que si esta (otra version de "Tasa de
brecha del equipo", de "Al hacer un pase, poder de afinidad"...) y no las
lleva ningun jugador de ninguna partida: no se anaden sin que Aaron lo diga.

De paso, otra cosa vista al comparar: entre la partida del 21 por la manana
y la del 22, **104 heredadas de las ranuras 4 y 5** (todas de Leyendas fuera
de equipo: 82 la pareja de Justicia, 12 la de Contra, 10 la de Juego sucio)
desaparecieron de la ficha, y la tabla con numero (lo que ensena el juego)
las conserva con la marca a 0. El editor no borra heredadas de la 4-5 por
ningun sitio y cada accion suya deja la tabla al dia, asi que lo hizo el
juego o algo que Aaron hizo en el juego. Pendiente de preguntarselo; no se
toca hasta saberlo. (Resuelto: ver O-230.)

### O-230 · "Dejarlos en 3" quitaba la heredada sin tocar la tabla del juego

Aaron: "lo unico que hice fue usar la herramienta del editor que elimina
heredadas cuando tienen 5, y quitar jugadores de equipos". Era eso:
`arreglar_heredadas` (O-107) es una accion de toda la partida, y
`Sesion.aplicar` solo sincroniza la tabla con numero (O-166) cuando el
cambio trae una `fila`. Asi que la heredada se iba de la ficha y la tabla,
que es lo que ensena el juego, se quedaba con ella (Cate Heckel con la
pareja de Justicia en la 4 y la 5: en el editor las de Afinidad, en el
juego "Conf. Justicia +0,4 %"). Ahora `arreglar_heredadas` sincroniza cada
fila tocada, y `tablas_desajustadas` / `arreglar_tablas` (Resumen y al
guardar) reparan a los que ya lo tenian: en la partida original el juego
no deja ninguno desajustado; en la del 22 salen los 104.

Y la foto de Mateo Bonachea (Leyenda de Afinidad recien fichado) confirma
la pasiva de O-229 tal cual: "Conf. Vinculo: Por cada 1 % del poder de
afinidad, AT/DF del equipo +0.10 %", en la ranura 5.

### O-231 · La tercera copia de una tecnica vale en CUALQUIER ranura, no solo en las de despues

Aaron, con Goldus Janque (portero de ESPANA): Mano de pinguinos en la 1 y
la 3 (Parada) y la tercera en la 2, que es de Defensa; el juego se lo dejo
poner a mano y mando la captura. "Es indiferente el slot en el que esta:
mientras tenga 2 mas iguales, la tercera se puede poner en cualquiera".
O-199 lo tenia como "ranura posterior a sus dos copias" y el editor no
ofrecia la tecnica en la ranura 2. Ahora `O.tecnicas`, `poner_tecnica` y
`_quitar_repetidas_sueltas` cuentan las otras copias esten donde esten (y
al quitar, se repite hasta que no caiga ninguna mas).

### O-232 · Que hace cada tactica de equipo, en el selector

Aaron: "en las supertacticas, cuando le vas a dar una a un equipo, pon lo
que hace cada una: una i, un hover, lo que sea, sin que abulte". Las
descripciones estan en `item_text` (TEXT_INFO), apuntadas por la columna 3
de `SPECIAL_TACTICS_INFO_LIST` y de `ITEM_SUPER_TACTICS_INFO_LIST` (la 2 es
el nombre). `construir_tacticas.py` -> `tacticas.csv` (92: 86 tacticas y 6
supertacticas, todas con texto). El selector de tacticas del Team builder
ensena el texto debajo del nombre, siempre a la vista y centrado (primero
fue con una "i" que lo desplegaba; Aaron: "quita el i y dejalo abierto de
base, asi es mas rapido").

### O-233 · El selector de formacion ofrece las ocho, no solo las que se usan

Aaron: "faltan algunas formaciones". El desplegable salia de
`_valores_vistos`: como las formaciones no estan en la mochila (O-121),
caia en las que llevaba algun equipo en ese momento, y en su partida nadie
llevaba 3-6-1 Hexa. Ahora `_formaciones_ofrecidas` da las ocho de
`nombres-de-equipo.csv` (las que ve en el juego) mas las que usen los
equipos, solo las legales. Con sus capturas de AURA FARMERS en Hexa, Caja,
Equilibrio y Doble Volante se comprobo tambien `formaciones.csv` (O-160):
los once de cada formacion caen donde los pinta el juego.

### O-234 · Mas giros del anillo, y por que no se pueden sacar para todos

Aaron: "mira los jugadores nuevos al 99 y guarda los giros; hice algunos en
varios. Y si hay forma de encontrar el giro de todos, para que un amigo no
tenga que girar a cada uno".

- De su partida del 23: **42 personajes nuevos** (Goldus Janque, Silvain
  Hache, Tom Skipper, Big, Quentin Rackner, Destin Billows normal y
  Diamante...). Solo se aprenden los que el juego da por buenos: con las
  pasivas 3-5 desbloqueadas, que es lo que el juego cierra al cargar si el
  giro no conecta (O-195). Dos Dardinello girados con 3-5 cerradas se
  dejan fuera. Ningun giro choca con los ya apuntados. `anillos.csv` pasa
  de 2.632 a 2.674.
- `construir_anillos.py` ahora SUMA: lee `anillos.csv` y le anade las
  partidas que se le pasen (varias a la vez), en vez de reescribirla con una
  sola. Sirve para meter partidas de los amigos de Aaron.
- **No hay forma de sacarlo de los datos del juego.** Se probaron las 5.863
  tablas de `gamedata`, columna por columna, contra los 2.506 giros
  conocidos (contando cada personaje una vez): ninguna acierta mas del 60 %
  (el giro mas comun por rama ya da el 41 %). Tampoco la posicion, la
  alternativa, el rango, el arquetipo, la clave de personal, la identidad
  modulo 8 ni el tablero guardado en la partida (los normales lo llevan a
  0). Confirma O-195: el juego lo fija por personaje con algo que no esta en
  los ficheros.
- Cobertura: de los 5.410 fichables normales, 2.541 tienen giro conocido.
  Para el resto el editor deja el anillo **sin girar** (O-200) y en el juego
  basta un clic en el anillo; no se queda roto. Y el editor tambien usa las
  otras copias del mismo personaje en la partida abierta.

### O-235 · Los efectos de cada tactica de equipo, con sus numeros

Aaron: "esta la descripcion de las tacticas pero no sus efectos; buscalos".
Detras de cada fila de `SPECIAL_TACTICS_INFO_LIST` van parejas (indice,
cuantos): la primera apunta a `SPECIAL_TACTICS_EFFECT_LIST` (tipo de efecto
crc32, numero). El nombre de cada tipo esta en
`soccer/special_tactics_effect_config`: filas (tipo, id del texto en
skill_text TEXT_INFO, 1 si es del geoglifo), 120 tipos; las frases llevan
`<VALUE>` y marcadores de color ([CTACTICS01] mejora, [CTACTICS02]
empeora). Columnas 4 y 5 de la ficha: duracion y recarga en segundos
(99999 = sin fin, variantes de la historia). Cotejado con la tabla de
inazumo.es (Tactics.csv, 53 tacticas en ingles): coinciden numeros y
geoglifo/general (Cuernos de toro: foco +40 y brecha +5 en el geoglifo,
faltas +25 general). Las supertacticas (Buena racha, Explosion...) ya
llevan los numeros en su descripcion. El selector del Team builder ensena
los efectos y "dura X s · recarga Y s"; la descripcion, al pasar el raton.

### O-236 · El numero de la tarjeta: el stat por el que se ordena, y Fichar al 99 con arbol

Aaron: "cuando ordenas por un stat (Jugadores, Equipo, Fichar...), que en vez
del poder total salga el numero de ese stat; y en Fichar, siempre, los stats
al 99 sin judias ni equipacion pero con las pasivas de su arbol que dan
stats". `numeroDeTarjeta` pone en el numero grande de abajo a la derecha el
stat con su abreviatura ("POT 212") cuando se ordena por el, y el poder si
no (antes el stat salia en una chapita aparte, O-203). En Fichar,
`_stats99_con_arbol`: base a nivel 99 de su rareza + las casillas de stat
del arbol de un normal (O-140: tronco +3/+5, rama 1 y rama 2 +3/+5/+7), con
el tronco y, de cada stat, la rama que mas le da, que es lo maximo que puede
llegar a tener de ese stat. Idolos y Diamantes (y "con semilla"), los base:
su arbol de stats no esta descifrado. El poder (suma) cuenta el tronco y UNA
rama (+23, `_poder99_con_arbol`): sumar la mejor rama de cada stat lo
inflaria (Thaddeus: +33).

### O-237 · Tecnicas individuales y combinadas

Aaron: "en los filtros de supertecnicas, de todos los sitios, filtrar si es
individual o combinada, y ponerlo al lado del elemento (que salga entero)".
Columna 19 de `m_skillInfoList`: 0 en las individuales y 2, 3 o 4 (cuantos
jugadores) en las combinadas: Remate combinado 2, Tripegaso 3, Muro
colectivo 4, Inazuma Drop 2, Relampago salton 2. Siete combinadas la llevan
a 0 (Defensa radial, Trimano celestial, Bloqueo doble, Defensa triple,
Muralla infinita, Ruptura relampago CG): se completan con las columnas
20-22 (compañeros concretos) o con la descripcion ("dos jugadores", "con un
compañero"...). Total: 803 individuales, 106 de 2, 87 de 3, 8 de 4.
`tecnicas.csv` columna `jugadores`; `O.jugadores_de_tecnica`. Filtro
"Individual o combinada" en el selector de tecnicas del editor, en la
Mochila y en la Base de datos (mas "Jugadores" y "Como se consigue");
chapa "Combinada · N jugadores" / "Individual" en el selector y "xN" en la
barra de la tecnica (ficha del jugador, Base de datos, Calculadora). La
chapa del elemento salia "B..": usaba la clase `elem`, que es el cuadradito
de 21 px de las tarjetas; ahora `chip-elem`.

### O-238 · Base de datos al dia

Aaron: "actualiza la base de datos, la calculadora... con todo lo nuevo".
- Personajes: ordenar por nombre, poder o cada stat (con el stat en la
  tarjeta, O-236), stats y poder a nivel 99 con su arbol (como Fichar),
  filtros Armadura / Mixi max / Modo (O-222) y "Se puede fichar" (O-205);
  en la ficha, "se puede fichar / no", y la lista de armaduras, mixi max y
  modos que solo puede llevar el (espiritus-duenos.csv, O-209).
- Supertecnicas: individual o combinada, jugadores, como se consigue
  (tecnicas-origen.csv), orden por poder / TP / nombre, descripcion al pasar
  el raton y se busca tambien en ella.
- Espiritus: "Quien lo lleva" (cualquiera / solo su personaje) y "Pasiva
  propia" (solo kenshin y 3 despertares, O-224); se ensena de quien es.
- Objetos: las tacticas de equipo con sus efectos, duracion y recarga
  (O-235); las supertacticas con su texto.
- La Calculadora usa las mismas barras de tecnica: tambien sale "xN".

### O-239 · Caras que el juego trae y no usa

Aaron: "pon en la base de datos sprites o modelos de jugadores que no se
usen: que haya su modelo pero no sean fichables o esten sin asignar a
ningun jugador o npc". De las 5.685 caras de `10_icon_chr/face`
(`construir_sin_usar.py` -> `caras-sin-usar.csv`):
- 73 que ninguna fila de `chara_base` usa como string_id: de nadie;
- 121 con fila en `chara_base` y nombre (Thomas Feldt, Harry Leading...)
  pero sin fila en `chara_param`: no existen como jugador;
- 83 de jugadores de `chara_param` que no estan en `fichables.csv` (O-205)
  y cuya cara no la usa ningun fichable (las otras versiones de Jude,
  Arion, Fei... de la historia).
Pestana "Sin usar" en la Base de datos, con filtro por grupo y buscador; los
no fichables abren su ficha. Los modelos 3D no se ensenan (no hay visor).

### O-240 · Las pasivas fijas de Idolos y Diamantes, visibles en la ficha

Aaron: "aunque sean fijas, no hay forma de verlas? en vez de vacias deberian
salir las que tienen, sin poder cambiarlas" (Blazer Firefoot, Diamante).
La ficha solo las sacaba de la tabla con numero o de `pasivas_fijas` sin el
tablero; a un Diamante con semilla que el juego nunca sincronizo (tabla a
cero) le salian cinco "vacia". `fijas_de_jugador` (servidor) las saca del
tablero que el juego le tiene asignado (0xBAFA8DBD) y, en un Diamante, con su
arquetipo elegido; lo usan la ficha y la suma de pasivas del equipo. Y a un
Idolo o Diamante se le ensenan las fijas aunque la ficha traiga pasivas
sueltas, porque el juego las ignora (Abuelo Danger llevaba dos).
Blazer (POR, Fuego, tipo 4, Justicia) no tiene tablero apuntado y esa
combinacion no esta en `tableros-diamante.csv` (O-169):
`tablero_diamante_parecido` coge el de misma posicion, tipo y arquetipo, y
la ficha avisa "las 4 y 5 seguras, las 1 a 3 sin confirmar". En la partida
del 25: 59+30+34 Idolos y 128 Diamantes con las cinco; 2 aproximados
(Blazer y Abuelo Danger); Destin Billows (entrenador) sin pasivas de jugador.

### O-241 · Blazer en el juego: dos pasivas y tres huecos (`swap_team_passive`)

Aaron mando la foto del juego: Blazer Firefoot (Diamante con semilla, sin
tablero apuntado) ensena "PP del equipo +3,5 %" y "DF del muro +1,5 % mismo
elemento" y las ranuras 3-5 vacias (sale MC porque esta de MC en la
formacion: es portero, esta bien). En la partida de la manana del 25 el
juego le escribio la ficha (ranuras 1-2: `38C0FBBB` y `CFAFEE09`, sorteadas
como a un fichado del universo, O-169) y en la tabla con numero las 1-2 en
version Leyenda y en las 3-5 tres ids sin texto: `D49FB96D`, `770ADDF3`,
`E13ADA84` = `swap_team_passive_03..05` (valor 0). Son huecos que el juego
rellena al aplicar un arquetipo de Diamante. Es el unico jugador de la
partida con ellos.
El editor ya ensena lo mismo que el juego (la tabla manda), y el aviso de la
ficha lo explica. Arreglo propuesto: elegir su arquetipo de Diamante en el
juego, que le asigna tablero y rellena las 3-5; con esa partida se aprende
el tablero de POR/Fuego/tipo 4/Justicia para `tableros-diamante.csv`.

### O-242 · Blazer, arreglado en el juego: su tablero de Justicia

Aaron eligio en el juego el arquetipo de Diamante de Blazer (O-241) y le
salieron las cinco: DF del muro +3,5 % cercanos, Valor propio de foco +7 % en
campo propio, DF del muro +1,5 % distintos elementos y la pareja de
Justicia. La partida lleva ahora el tablero `EE48C1B3` en 0xBAFA8DBD, que es
el de Justicia de Quentin Cinquedea (POR, Fuego, tipo 3) y de Alexander
Allegrov; la votacion de `tableros-diamante.csv` daba para POR/Fuego/Justicia
`E358A3C2`. Apuntado como aprendido (`APRENDIDOS` en
`construir_tableros_diamante.py`): POR, Fuego, tipo 4, Justicia ->
`EE48C1B3`. El editor lo enseñaba ya igual que el juego; y con la partida de
antes (sin tablero) ahora acierta las cinco sin avisar de aproximacion.
Lo mismo con Abuelo Danger (DEF, Fuego, tipo 3, Justicia): el juego le
puso `0C00C5E1`, justo el que el editor habia supuesto por parecido (sus
cinco pasivas coinciden con la captura). Apuntado tambien.

### O-243 · Suma de pasivas: si se pasa del tope, el texto dice el tope

Aaron: "cuando te pasas del limite, en el texto de la pasiva pon el numero
del tope, no la suma; la pastilla roja esta perfecta". `pasivas_de_equipo`
rellena `<VALUE>` con el tope cuando `estado` es "pasa" (TRAINERS: Conf.
Contraataque 16 -> "+15 %", PP 21 -> "+20 %"); la pastilla sigue con
suma/tope. Y la Calculadora sumaba la suma entera: ahora cuenta el tope,
que es lo que vale en el partido.

### O-244 · Las casillas de stat de los tableros de Idolos y Diamantes

Aaron: "busca en las tablas de los Diamantes las pasivas que suben stats
(Agilidad +x...); en el juego todas suman +10; quiero ver en que stat cada
uno y filtrarlo". `construir_tableros.py` dejaba fuera las pasivas de stat
(`ps2FFTT`, O-110); ahora las escribe en `tableros-stats.csv` (7.330
casillas de 871 tableros). Un tablero de Diamante (28 casillas) lleva 8: dos
en el tronco (5, 6) y tres en cada rama (10, 14, 16 / 20, 24, 26), casi
siempre +10 (algunos basara mezclan +3/+5/+7). Blazer (EE48C1B3): tronco
Fisico y Tecnica; rama 1 Agilidad y Presion x2; rama 2 Tecnica y Fisico x2.
Los de Idolo tienen 17-27 casillas con +3 a +10.
- `stats.de_arbol` suma a Idolos y Diamantes las casillas abiertas de su
  tablero, del tronco y de la rama que juega (hay Diamantes con las dos
  ramas abiertas en el mapa). En la partida: Diamantes al 99 con +50 casi
  todos, Idolos +15 a +28. Se quita el aviso "les falta lo del arbol".
- Fichar y la Base de datos: stats y poder al 99 de Idolos y Diamantes
  (y "con semilla") con su tablero, como los normales (O-236).
- Filtro "El arbol sube" (varios valores: `multi` en `montaFiltros`) en
  Jugadores, la reserva, Fichar y la Base de datos. Para un jugador de la
  partida, con su tablero real; en Fichar y la Base de datos, con el que le
  tocaria recien fichado. La ficha de la Base de datos ensena su arbol.

### O-245 · Cambiar el arquetipo de un Diamante no cambiaba sus pasivas (Billy Dash)

Aaron: "a Billy Dash le he puesto Tension con el editor (era Justicia) y no
se le cambian las pasivas". `poner_arquetipo_diamante` escribe el arquetipo
(14CDA97F) y el tablero (0xBAFA8DBD) con `_tablero_para`; para una
combinacion de Diamante con semilla que no esta en `tableros-diamante.csv`
daba 0, se escribia 0 y `sincronizar_tabla_pasivas` no encontraba fijas, asi
que la tabla se quedaba con las de Justicia. Ahora `_tablero_para` cae en
`tablero_diamante_parecido` (O-240) y el aviso lo dice: 4-5 seguras (la
pareja del arquetipo), 1-3 del Diamante mas parecido; para las exactas,
cambiar el arquetipo dentro del juego (y mandar la partida para apuntarlo,
como Blazer y Abuelo, O-242). Para los que ya quedaron asi:
`diamantes_desajustados` (tabla 4-5 de otra familia que las del tablero de
su arquetipo) / `arreglar_diamantes` en el Resumen y al guardar. Las 4-5 de
todos los tableros de un mismo arquetipo son siempre las mismas (30 de 30 en
cada uno), asi que se comparan por familia de pasiva.
En la partida del 26 salen Billy, Cedric Freud y Raika Shinohara. Los dos
ultimos no estaban mal: tienen tablero puesto (el basara de su arquetipo) y
la tabla con la pareja anterior, que el juego tarda en refrescar (O-166:
Raika sale de Brecha en el juego). Por eso la ficha y la suma del equipo
ahora ensenan las del tablero cuando el Idolo o Diamante tiene uno puesto
(`_tablero_guardado`), y la tabla solo cuando no lo tiene (Blazer, O-241).
El arreglo a esos dos solo les reescribe su mismo tablero y pone la tabla al
dia; a Billy le pone el de Tension.

### O-246 · Chico, chica o sin genero

Aaron: "filtros de si el jugador es chico, chica o sin genero". Es la
columna 11 de `chara_base`: 1 chico (4.753), 2 chica (1.064), 5 sin genero
(56: soldados de terracota, robots Gin, Tech Nobit...); hay un 4 (Ptumri
Emnator) y 0 (el Avatar y filas vacias), que van como sin genero.
Comprobado con Celia, Katya, Nerina (2) y Mark, Axel, Tom (1).
`personajes.csv` columna `genero` (construir_personajes.py); filtro
"Genero" en Jugadores, la reserva, Fichar y la Base de datos.
Aaron: Ptumri es un alien y la version payaso (la del 4) va a sin genero;
Josefina es una gata (chica); Clark von Wunderbar es un robot (sin genero).
Ya salian asi salvo la Josefina de la historia (0): `GENERO_A_MANO`.

### O-247 · Modo draft en linea (primera parte: sala y elecciones)

Aaron quiere un draft a tiempo real entre dos amigos, solo con nombre de
usuario. Hecho de momento: entrar con nombre, ver quien esta conectado o
buscarlo, invitar / aceptar / rechazar, la moneda, las 40 elecciones por
turnos, el arquetipo al azar de cada uno y elegir el Diamante. El resultado se
guarda en `partidas/draft/<fecha>-contra-<rival>.json` (jugadores con su
grupo, arquetipo, Diamante) para la segunda parte (montar el equipo con las
reglas del draft e importarlo a la partida), que falta.

- Red: sin servidor propio ni cuenta. Cada Pizarra habla MQTT 3.1.1 por
  WebSocket (`web/draft-red.js`, cliente escrito a mano) con tres servidores
  publicos gratuitos a la vez (hivemq, emqx, mosquitto) y lo manda todo por
  los tres. Primero iba a uno y saltaba al siguiente si fallaba, pero en la
  prueba cada pestana acabo en uno distinto y no se veian. Los repetidos no
  molestan: el estado va numerado (`seq`), la presencia se apunta por
  servidor y las invitaciones se avisan una vez.
- Temas bajo `pizarra-draft/v1/`: `conectados/<usuario>` (retenido, con
  ultima voluntad vacia), `buzon/<usuario>`, `sala/<id>/estado` (lo publica
  el que invita, retenido, cada 5 s) y `sala/<id>/acciones` (el invitado
  repite su accion cada 2,5 s hasta verla en el estado). Al terminar o
  cancelar, el que invito borra el estado retenido.
- Reglas: 4 DEL, 5 MED, 3 DEF, 4 POR, 3 gerentes y 1 entrenador por cabeza.
  Aaron corrigio: cada ronda saca justo los que se reparten (8 delanteros,
  10 medios, 6 defensas, 8 porteros, 6 gerentes, 2 entrenadores), los dos ven
  la misma tanda y el elegido se queda en gris con una X hasta agotarla (no
  "5 opciones por turno" como lo hice primero). Elegido por mi: la moneda
  decide quien empieza y luego cada ronda empieza el otro; cada hueco de
  jugador tiene un 2 % de ser un Idolo; los Diamantes nativos no salen (el Diamante
  se elige al final, y puede ser un gerente o el entrenador, no un Idolo).
- Candidatos (`ievr/draft.py`): todos con cara `c...` que existe y posicion,
  legales o no (formas de modo, mixi max...), con stats a nivel 99 en Leyenda
  con arbol; y el personal de fabrica. 5.609 en total.
- Si se recarga la pagina a mitad se retoma (localStorage); probado con dos
  pestanas: draft entero, recarga del invitado a mitad y abandonar. Un draft
  terminado o cancelado no se retoma al recargar. La invitacion y el
  "acepto" se repiten cada 3 s hasta llegar (no quedan guardados en el
  servidor y en una prueba se perdio uno).

### O-248 · Draft: montar el equipo, revisarlo e importarlo

Segunda y tercera parte del draft (O-247). "Montar equipo" (al terminar el
draft o desde "Tus drafts terminados") abre `/draft/montar?f=<fichero>`: el
editor de siempre (`web/editor.html` con `window.DRAFT`) sobre una COPIA de
la partida, el "montaje", que se guarda solo en
`partidas/draft/<fichero>.montaje` (zlib del plano). La partida de verdad no
se toca hasta "Importar equipo".

- Peticiones: `comun.js` anade la cabecera `X-Pizarra-Draft` a todo `/api/`
  y el servidor elige la sesion por peticion (`self.ses`: la partida o el
  `SesionDraft` de ese draft). Mandarla vacia = la partida de verdad.
- Al crear el montaje (`draft.crear_montaje`, ~1 minuto): en la copia se
  consigue todo lo "libre" (equipacion, tecnicas, espiritus, escudos,
  equipaciones, tacticas, sinergias, personalizadas, pasivas de personal,
  Nuevas posibilidades), se prepara un equipo "Draft" y se crean los 20:
  `anadir_jugador` con el arquetipo del draft (los Idolos con el suyo), MAX
  (99, Leyenda, 30 partidos), el personal de base que salio en una ronda de
  jugadores pasado a jugador, y el Diamante con `poner_diamante` y el
  arquetipo del draft. Caben justos en el equipo (11 + 5 + 3 gerentes +
  entrenador) y se colocan cada uno en un puesto de su posicion.
- Reglas (`draft.comprueba_cambio`): solo equipacion, tecnicas, pasivas,
  personalizada, de personal, judias, presets (pasivas solo del arquetipo
  del draft), rama y todo lo del equipo del draft. Nada de nivel, rareza,
  arquetipo, heredadas, fichar, mochila ni otros equipos. Tecnicas: en un
  normal las 3 primeras fijas; en un Idolo o Diamante todas fijas (Aaron
  dijo "los idolos y diamantes, ninguna": lo tomo como que no se cambia
  ninguna; si queria decir lo contrario es quitar una condicion).
- "Revisar e importar": el equipo a la derecha (pulsar un jugador), su
  ficha a la izquierda (tecnicas, pasivas, equipacion, judias) y el boton.
  Importar (`draft.importar`, ~2 minutos): se vuelven a crear los 20 en la
  partida de verdad y a cada uno se le copia lo del montaje: pasivas, rama
  y judias tal cual (son codigos) y equipacion, tecnicas, personalizada y
  de personal con las funciones del editor (varias pasadas para la tercera
  copia de una tecnica, O-199), consiguiendo en la mochila lo que falte. El
  equipo elegido se vacia y se llena como el del draft (puestos, dorsales,
  capitan, formacion, escudo, equipacion, tacticas, sinergias y nombre). Al
  final se compara cada jugador con el del montaje y se avisa de lo que no
  quede igual. Un solo paso de deshacer. Probado: montaje con 115 cambios
  sueltos, importado, 20 de 20 iguales, equipo igual, guardado y reabierto
  sin nada desajustado.
- Lento por las funciones del editor (cada una relee la mochila entera):
  el arbol y las tablas se ponen al dia una vez por jugador, no por cambio.
- Candidatos: solo los que estan en `jugadores.csv` (los que Pizarra sabe
  crear) y el protagonista (Destin Billows) solo en las rondas de personal.
- "Tus drafts terminados" solo ensena los del nombre con el que entras:
  probando solo en el mismo PC con dos nombres, los dos lados se guardan en
  la misma carpeta y salia tambien el del rival (Aaron).
- Boton rojo "Cerrar draft" en esa lista (Aaron): lo quita de la lista
  moviendolo con su montaje a `partidas/draft/cerrados/` (no se borra). Lo
  ya importado a la partida se queda.

### O-249 · Personalizar el draft

Aaron: al invitar, un desplegable para personalizar el draft: de que juegos
salen los personajes, si pueden salir ilegales "y cosas asi". En la sala,
"Personalizar el draft" (plegado, con el resumen al lado): los nueve juegos
como pastillas que se encienden y apagan (Todos / Ninguno), "Pueden salir
jugadores ilegales" y cuantos Idolos (sin, pocos 2 %, algunos 6 %, muchos
15 % por hueco). Debajo, cuantos pueden salir en cada ronda con esas reglas.
Se recuerdan (localStorage `draft-reglas`).

- Viajan con la invitacion (el invitado las ve antes de aceptar) y el que
  invita las guarda en el estado (`estado.reglas`) y reparte con ellas; se
  ven en el draft ("Reglas: ...") y se guardan con el resultado.
- Hay juegos sin gerentes (IE2, GO 2) o con muy pocos: si con esos juegos no
  hay bastantes para una ronda, esa ronda sale de todos los juegos (se avisa
  en rojo en las cuentas). Los ilegales se respetan siempre.
- Probado: IE1-IE3, sin ilegales, muchos Idolos: los 40 de esos juegos,
  ninguno ilegal, 3 Idolos.

### O-250 · Mas opciones del draft

Aaron pidio todas las que propuse y dos cambios:

- Juegos sin bastantes para una ronda: se rellena con el juego ANTERIOR de
  cada uno (IE2 con IE1, GO 2 con GO...; en el orden de la lista de juegos),
  paso a paso, y solo si aun faltan, de todos. Luego, si hace falta, se
  ignora la afinidad y despues el genero. Las cuentas del panel lo dicen.
- Idolos: un equipo solo alinea 2, asi que cada opcion tiene tope en todo el
  draft (pocos 2, algunos 4, muchos 6 ofrecidos) y nadie coge mas de 3
  (2 + un suplente). Simulado 200 veces con "muchos": nunca mas de 6.
- Nuevas: genero (chicos y chicas / solo chicos / solo chicas); afinidades
  marcadas y como (mezcladas, una al azar para los dos, una al azar para
  cada uno: la tanda sale mitad de cada una y cada uno solo coge de la suya,
  el personal no mira afinidad); tamano de la tanda (justa, 2 de mas, 4 de
  mas, el doble); cuantos de cada (DEL/MED/DEF/POR entre 11 y 16 jugadores,
  al menos un portero; 0-3 gerentes, 0-1 entrenador); arquetipo (al azar
  cada uno, el mismo para los dos, lo elige cada uno: el del rival no se ve
  hasta que eligen los dos); tiempo por turno (30, 60, 90 s: si se acaba, el
  anfitrion elige al azar por quien toque; el invitado corrige la diferencia
  de hora con `estado.ahora`); y versiones repetidas (sin ellas, un nombre
  no vuelve a salir en todo el draft).
- Si con las reglas a alguien no le queda ninguna carta que pueda coger,
  puede coger cualquiera (que nadie se atasque).
- Probado con IE2, solo chicas, muchos Idolos, una afinidad para cada uno,
  2 de mas, 3-4-3-1 + 2 + 1, arquetipo elegido, 30 s y sin repetidas: turno
  agotado elegido solo y de su afinidad, cantidades justas, sin repetidos,
  gerentes de IE1, y el montaje de 14 colocados (11 + 2 gerentes + 1).

### O-251 · Las reglas del draft, en la ventana de invitar

Aaron: que el menu de reglas solo salga al darle a Invitar (una ventana, y
al darle a Invitar otra vez se aplican), mejor maquetado: "se entiende
poco". Fuera el desplegable de la sala. `abreInvitar` abre una ventana
"Invitar a X" con cada regla en su tarjeta (titulo, una linea de ayuda que
cambia con lo elegido y el control), botones de elegir (Si/No, Ninguno /
Pocos / Algunos / Muchos...) en vez de desplegables y `- n +` para las
cantidades con el total de jugadores debajo. Abajo, cuantos pueden salir por
ronda (amarillo si se rellena con otro juego, rojo si no hay bastantes) y
"Invitar a X", apagado si falta un juego, una afinidad o las cantidades no
valen. Las reglas se recuerdan para la siguiente vez.

### O-252 · Formas mixi max y modos en el draft con ilegales

Aaron: con ilegales no le salian las formas mixi max (Arion con el mixi max
del Rey Arturo) ni los modos hiperdrive de la Cascada Perfecta. No estaban
en `jugadores.csv`: `construir_base_jugadores.py` descarta, como el
dataminer, a los que no tienen segundo camino de tecnicas (columnas 23-28 de
chara_param), y esas formas de la historia son asi. Ahora las normales
descartadas se escriben aparte en `jugadores-formas.csv` (449; `jugadores.csv`
queda igual) y:

- `reglas.jugadores_y_formas()`: las busquedas POR CODIGO (crear, ficha,
  tecnicas, `O._por_identidad`) ven tambien las formas; por nombre no (se
  llaman igual que el normal). Fichar, la base de datos y los fichables
  siguen solo con `jugadores.csv`.
- No traen lista de pasivas: usan la de su personaje
  (`reglas.pariente_de_forma`: el jugable con el mismo nombre, del mismo
  juego si hay; si no, uno de su posicion).
- Candidatos del draft: las que tienen cara, nombre y posicion, como
  ilegales, sin repetir cara (las copias de la historia con la misma cara
  que el normal no aportan). Salen 69, 52 de Chrono Stone (mixi max de Arion,
  los modos con gafas de la Cascada Perfecta...).
- Solo tienen el medio arbol que traen (sin las ranuras de la rama 2).
  Creadas las 236 con cara en una copia (con MAX y un cuarto como Diamante).
  No estan probadas en el juego: son personajes de partidos de la historia.

### O-253 · Moneda, blitz y ficha de cada jugador en el draft

Aaron: una moneda mas guay con cara y cruz, un modo blitz de 5 segundos por
eleccion y un desplegable en cada jugador con la informacion detallada.

- Moneda: dorada, en 3D (CSS), con cara (un rayo, la del que invita) y cruz
  (un balon, la del invitado). Sube girando, cae del lado que toco
  (`--final`: 1800 o 1980 grados) y entonces se marca la apuesta ganadora y
  "¡Sale cara! Empieza ...". Se pinta una sola vez (`zona.dataset.moneda`):
  si se repintara con cada estado volveria a girar. La fase dura 5,2 s.
  Sin animacion para quien la tenga quitada en el sistema.
- Blitz: "Blitz 5 s" en el tiempo por turno. La cuenta atras se pone roja
  en los ultimos segundos (un tercio del tiempo, como mucho 10). Las caras de
  la tanda se cargan ya (con la carga perezosa no salian al repintar tan
  rapido).
- Ficha: boton "Ficha" en cada carta de la tanda y pulsando las de los
  equipos. Stats a nivel 99 con arbol (barras y la telarana del editor,
  que pasa a `comun.js`), lo que sube el arbol, y el arbol de tecnicas por
  tronco y ramas: numero de ranura, lo que admite, la tecnica que trae (con
  su barra de color, nivel, TP y poder) y si en el draft es fija o
  cambiable. `basedatos.personaje` da ahora `admite` en cada tecnica y la
  lista `ranuras` (las formas del draft tambien).

### O-254 · Draft: sin judias/equipacion/tecnicas/pasivas, sin posiciones, intercambio

Aaron pidio modos nuevos. En la ventana de invitar:

- "Al montar el equipo": Judias, Equipacion, Tecnicas nuevas y Cambiar
  pasivas, cada una Si/No (`reglas.judias/equipacion/tecnicas/pasivas`).
  Viajan con el resultado; el servidor las aplica en
  `draft.comprueba_cambio` (`CAMBIOS_POR_REGLA`) y en `tecnica_bloqueada`,
  y el editor del draft esconde lo que no se puede (`prohibidoDraft`).
  "Cambiar pasivas" = No tambien fija la personalizada y las de personal
  (decision mia: "sin cambiar pasivas" es llevar las que traen).
- "Sin posiciones": los jugadores salen en rondas de 2 para cada uno (tanda
  de 4) de cualquier posicion (grupo `JUG`), tantas como jugadores haya en
  las cantidades (16 -> 8 rondas); gerentes y entrenador igual. Los turnos
  llevan su `ronda` (antes la tanda cambiaba al cambiar de grupo, y aqui
  todas son JUG). Al montar, cada JUG va a un puesto de SU posicion.
- "Intercambio de jugadores" (No / hasta 1, 2, 3): al acabar las
  elecciones, fase `intercambio` antes de los arquetipos. Cada uno elige a
  quien da y a quien pide (los mismos de cada lado; jugador por jugador,
  gerente por gerente, entrenador por entrenador) y propone; el otro acepta
  o rechaza. Se puede retirar. Cuando los dos pulsan Listo, o se llega al
  tope, se sigue. Queda un historial de lo propuesto.
- Probado con dos ventanas: sin posiciones (10 rondas, posiciones
  mezcladas), intercambio 1 por 1 aceptado y Listo de los dos, montaje con
  judias y tecnicas nuevas rechazadas y la equipacion permitida.

### O-255 · Maestro Li no se ficha

Aaron: el "maestro Yi" del casco raro tipo japones es ilegal. Es el Maestro
Li (1F86DCAC, Orion, gorro azul con mono negro): salia como fichable porque
esta en un equipo rival de la Cronica. `construir_fichables.py` tiene ahora
`NO_FICHABLES_A_MANO` para lo que Aaron sabe del juego; con el se va a
no-fichables.csv (es el unico cambio). En el draft pasa a salir como ilegal.

### O-256 · Preset de pasivas sin ninguna personalizada en la mochila

Al amigo de Aaron le salia "el codigo 269B0969 no es de nada que se pueda
usar aqui" al poner un preset de pasivas. El preset crea el manual de la
personalizada si no se tiene, y lo hacia con `anadir_objeto`, que no crea
pasivas (categoria `pasiva` no esta en CATEGORIAS_QUE_SE_ANADEN). Y
"Conseguir 99 personalizadas" (`_dar_de_todo`) necesitaba tener ya alguna
para copiar la forma de la fila.

- `_dar_de_todo` acepta `parientes` (otros objetos del mismo tramo de la
  mochila: las personalizadas van con los manuales de tecnicas y de pasivas,
  tramo clase 1 tipo 3) y `sub` (2, como las 26 personalizadas de la
  partida original de Aaron).
- `conseguir_personalizada` crea UNA pasiva de mochila (personalizada o de
  gerente/entrenador); la usan el preset (`_asegura_objeto`) y la
  importacion del draft (`_conseguir`), que tenia el mismo fallo.
- Probado en una copia sin ninguna personalizada ni de gerente: el preset
  crea y pone la personalizada (sub 2), "Conseguir 99" crea las 37.

### O-257 · MAX no baja los partidos

Aaron: si se le da a MAX y el jugador tiene mas de 30 partidos, que se
quede con los suyos. `presets.maximo` solo los sube si tiene menos de 30.
Al probarlo salio que `maximo` leia el campo de partidos con 4 bytes y es
de 2 (asi lo leen la ficha y `poner_partidos`): daba un numero enorme, y
antes no se notaba porque siempre se ponian a 30. Probado: 10 -> 30,
30 -> 30, 250 -> 250.

### O-258 · Draft: guardar tras importar, bonificaciones, formaciones, sin ilegales, tecnicas al azar, supertacticas

Lo que pidio Aaron tras jugar con sus amigos:

- Guardar desde el draft: tras "Importar equipo" salen ahi mismo "Guardar
  copia de la partida" e "Instalar en Steam". Guardar e instalar van siempre
  con `X-Pizarra-Draft` vacio, o sea a la partida de verdad (en el editor
  normal da igual).
- Bonificaciones de equipo tambien en Jugadores: en el draft, siempre las
  del equipo del draft.
- Formaciones "sin nombre" a los amigos: los nombres de formaciones, escudos
  y equipaciones estan en `datos/reglas-del-jugador/nombres-de-equipo.csv`,
  que no iba en `pizarra-datos.zip`. Ahora `publicar.py` mete esa carpeta (a
  Aaron no le pasaba porque tiene el proyecto entero).
- Sin el modo de ilegales: el juego tampoco deja usarlos. `completa()` deja
  siempre `ilegales:false` y la tarjeta se ha quitado.
- Supertecnicas al azar (`tecnicas_random`): al crear el montaje, en cada
  normal (no Idolos, Diamantes ni personal) las ranuras 4-6 llevan una al
  azar de lo que admite cada una (legales, individuales, sin repetir); en la
  libre, una hipertecnica si en la 3 no lleva ya una, y si la lleva una
  tecnica de su posicion (DEL tiro, MED regate, DEF defensa, POR parada).
  Despues no se cambian.
- Supertacticas drafteadas (`tacticas_draft`): una ronda mas al final con
  una tanda de 6 (70 tacticas del juego con efectos, `draft.tacticas_draft`,
  `/api/draft/tacticas`); cada uno se queda 3. Van al equipo del montaje y
  no se cambian. No cuentan para el Diamante ni para el intercambio.
- Probado con dos ventanas: tacticas drafteadas 3 y 3, sin ilegales, el
  montaje con las tecnicas al azar bien por tipo y la hipertecnica en la 6,
  tacticas puestas y bloqueadas, bonificaciones en Jugadores y guardar la
  partida desde el draft.

### O-259 · Tecnicas al azar: tambien combinadas

Aaron: en el modo de supertecnicas al azar tambien pueden salir las
combinadas (yo las habia quitado). Probado con 8 jugadores: 16 tecnicas en
las ranuras 4-6, 3 combinadas.

### O-260 · Supertecnicas en "Al montar el equipo" y la ficha del draft

Aaron: la opcion de supertecnicas va dentro de "Al montar el equipo", con
tres: A tu gusto (`tecnicas` si), Vacias (`tecnicas:false`: solo las 3
primeras y no se cambian) y Al azar (`tecnicas_random`). Fuera la tarjeta
aparte. Y en la ficha del draft, un normal ensena en las ranuras 4-9 solo
lo que admite cada una (llega al montaje solo con las 3 primeras): "vacia",
o "?" en la 4-6 si van al azar; un Idolo ensena todas, que si las trae.

### O-261 · En el draft, lo que no se puede cambiar ni se pulsa

Aaron: que lo prohibido no se pueda ni pulsar (ejemplo: el preset de pasivas
ofrecia todos los arquetipos y luego daba error; las supertacticas
drafteadas se dejaban pulsar). Repasados todos los tipos de cambio que manda
el editor: lo demas prohibido (nivel, rareza, arquetipo, partidos, rol, MAX,
borrar, heredar, mochila, fichar, crear equipo) ya estaba escondido.

- Preset de pasivas en el draft: salta la eleccion de arquetipo y va directo
  al del jugador.
- Supertacticas drafteadas: en el equipo salen como piezas sin boton.
- Sinergias que no se cumplen: en el draft, desactivadas (antes se pulsaban
  y daban aviso).
- Y un fallo que salio al revisarlo: el preset de pasivas en el draft
  ponia las 3 heredadas, y en el draft no se hereda.
  `PR.preset_pasivas(..., heredar=False)` en el draft: solo la pareja 4-5 y
  la personalizada (el texto del preset tambien lo dice).

### O-262 · Sin presets de pasivas en el draft

Aaron: en el draft no tiene sentido el preset de pasivas (la pareja 4-5 es
siempre la del arquetipo y no se hereda). Fuera el boton en el editor del
draft y `preset_pasivas` fuera de los cambios permitidos del draft.

### O-263 · Dos modos nuevos de draft: Individual y Subasta

Aaron: dos modos mas, como pestanas aparte, con su configuracion y las del
draft de siempre que encajen. En la sala, pestanas "Por turnos /
Individual / Subasta" (con una linea que explica cada uno); Invitar usa las
reglas de la pestana elegida (`reglas.modo`) y cada modo recuerda las suyas
(`draft-reglas-<modo>`, `draft-modo`).

- Individual: cada uno tiene SUS opciones (3 por defecto, de 2 a 6:
  "Opciones por eleccion") y elige una; luego otra tanda, hasta llenar.
  Los dos a la vez, sin moneda. La secuencia es la de las rondas
  (`secuenciaDe`: DEL x4, MED x5... y TAC si hay tacticas drafteadas). El
  anfitrion saca las opciones de cada uno sin repetir las que esta viendo
  el otro (`ofreceInd`), y al que ya tiene 3 Idolos no le salen mas.
  Tiempo por eleccion (blitz incluido): si se acaba, una al azar.
- Subasta: inspirada en las subastas de las ligas fantasy (ESPN, Yahoo,
  Sleeper: presupuesto fijo, puja minima 1, el reloj se reinicia con cada
  puja). Presupuesto 300 por defecto (200/300/500/1000; con 20 huecos son
  15 por hueco, parecido a 200 para 16 de las fantasy), subida minima 1/5/10,
  15 s por lote (10/15/20/30) y cada puja deja al menos 8 s
  (`SEGUNDOS_TRAS_PUJA`). Reserva: nunca se puede pujar tanto que no quede
  la subida minima por cada hueco que falta (`maxPuja`). Cada lote lo abre
  uno a la puja minima (se turnan; la moneda dice quien abre el primero) y
  si nadie sube se lo lleva. Salen antes los grupos que les faltan a los dos
  (jugadores, luego personal, luego tacticas); si un lote solo le sirve a
  uno, va directo a el al minimo. Pantalla: el lote, el precio, +1/+5/+10/
  +25/+50 o una cantidad, el dinero y la puja maxima de cada uno y los
  ultimos vendidos. El precio va con cada jugador del equipo.
- Opciones por modo: Juegos, Versiones, Idolos, Genero, Afinidad (en la
  subasta sin "una para cada uno"), Cuantos para cada uno, Posiciones,
  Supertacticas (drafteadas en el individual; "subastadas" en la subasta),
  Intercambio, Al montar el equipo y Arquetipo, en todos. Tamano de la tanda
  solo en el de turnos; Tiempo por eleccion en turnos e individual.
- "Tus drafts terminados" dice de que modo fue cada uno.
- Probado con dos ventanas: individual con afinidad para cada uno y
  tacticas drafteadas (23 y 23, ninguno de la afinidad del otro, sin
  repetidos); subasta entera (40 lotes, dinero cuadrado: 300 - 179 = 121 y
  300 - 59 = 241, equipos completos, sin repetidos) y, tras ordenar los
  lotes, 1 directo en 30 (antes 13 en 40); y el de turnos sigue igual.

### O-264 · Subasta: personal al azar, rellenos de los peores y mas ambiente

Aaron, tras jugar la subasta:

- Gerentes y entrenador no se pujan (casi iguales, nadie gastaba en
  ellos): al empezar, a cada uno los suyos al azar y gratis (`regalo`).
- Lo que solo le falta a uno ya no sale "gratis y bueno": es un relleno
  gratis sacado de la cuarta parte peor de su posicion (`sacaRelleno`), sin
  Idolos. "Peor" por los stats que pesan en cada posicion (los de
  POS_OPTIMA del editor: DEL potencia/control/tecnica, MED control/tecnica/
  inteligencia, DEF presion/fisico/inteligencia, POR presion/fisico/
  agilidad) a nivel 99 en Leyenda con arbol. Ojo: a 99 los stats se agrupan
  en pocas plantillas (DEF: 773 de 1581 con la peor nota, 720; la mejor 772)
  asi que el relleno es siempre de la plantilla mas baja, "del monton", nunca
  de los buenos.
- Ambiente: cartel de LOTE n (rosa si es Idolo), un subastador que canta
  ("¡Sale a subasta X!", "¡25 de Y!", "¡A la una... a las dos... y a las
  tres!", "¡Adjudicado a X por N!"), la carta entra con foco, barra de
  tiempo que se pone roja, las pujas del lote en directo, "¡Guerra de pujas!"
  desde 5 pujas, sello VENDIDO con martillazo (RELLENO en gris), valor
  estimado de cada lote (segun lo bueno que es en su posicion, solo como
  pista), el precio en cada ficha de los equipos y un resumen al acabar
  (fichaje mas caro, mejor compra, mas disputado, dinero que queda). Sonidos
  hechos con WebAudio (lote, puja, tic en los ultimos 5 s, martillazo), con
  boton para quitarlos. La pantalla del lote se construye una vez y luego
  solo se actualiza, para no repetir las animaciones con cada estado.
- Probado con dos ventanas: personal al azar a los dos, 8 rellenos para el
  que pujaba poco (todos de la plantilla mas baja), resumen al acabar.

### O-265 · Tier list (primer borrador, aun fuera del editor)

Aaron pidio una tier list (leyendas, Idolos y Diamantes; por posicion y
afinidad, como su documento "Tier IE3": columnas DL/MD/DF/PR con las cuatro
afinidades y filas por tier) y de momento solo la clasificacion interna.
`herramientas/construir_tier_list.py` -> `datos/reglas-extraidas/tier-list.csv`
(categoria, lista, tier, tier_stats, ajustes, nota, stats...). Criterios y
decisiones en el docstring. Lo principal:

- Nota = suma de los stats que pesan en su posicion (POS_OPTIMA) a 99 con
  arbol. Los stats a 99 van por plantillas (DEF: 773 de 1581 con la peor
  nota), asi que en leyendas la tier va por el puesto en la lista (A hasta el
  15 %, B 40 %, C 70 %, D el resto) y en Idolos y Diamantes (pocos) por la
  distancia a la mejor nota.
- S: la nota mas alta solo si la tienen muy pocos (2 %, al menos 3) y saca
  un 0,3 % a la siguiente. Leyendas: MED Arion, Mehr, Ryoma, Celia, Jimmy,
  Lucas, Ivan, Alexander, Serge, Sergi (772); DEF solo Cao Cao; POR Silvia
  Woods; DEL vacia (salvo Thaddeus).
- Ajustes (+/-1): DEL armadura/mixi +1 (57), arbol de DEL que no sea todo
  tiro salvo 1 regate/1 defensa -1 (282), POR con ranuras que no son de
  parada -1 (626 de 845), MED sin tiro+defensa+regate contando una libre -1
  (107), DEF musculoso/grande +1 y pequeno -1. Decision mia: los ajustes no
  suben a nadie a S (si no, 154 defensas acababan en S): S, X y Z solo para
  los que ya son S por stats. "Robusto" (93) no cuenta como grande ni
  pequeno: a preguntar.
- Thaddeus arriba del todo en DEL y tambien en MED.
- Pagina local de repaso con las caras (no se publica): scratchpad
  tier-list-borrador.html.

### O-266 · Inazuma Drop no salia en los arboles

Repasando la tier list salio el Axel de Ares con la ranura 4 "que no
existe". Es Inazuma Drop (A4A8BD63, tiro, combinada x2): esta en
`tecnicas.csv` pero se anadio despues de generar `jugadores.csv`, que la
dejaba como "?" en 39 ranuras (Axel de Ares, Jimmy Mach, Gaby Farmer...). En
el editor esas ranuras salian como "no existe en su arbol". Rehecho
`jugadores.csv` con `construir_base_jugadores.py`: solo cambian esas 39
ranuras y 10 nombres que estaban vacios (Josefina, Profe de ciencias...).
Tier list regenerada (el Axel de Ares sigue en A: 4 tiros fijos y 2 libres,
regate o defensa pero no los dos).

La tier list tambien queda guardada asi: cada nota distinta un escalon,
arbol optimo +1 contando las libres, sin topes en S (O-265 revisado).

### O-267 · Tier list: medios optimos, todos los Diamantes; rellenos de la subasta por tier

Aaron, sobre el borrador de la tier list:
- Cuerpo Robusto en defensas: no cuenta (ni sube ni baja).
- MED optimo (+1): 2 regates, 1 tiro, 1 defensa y 2 libres (una para la
  hipertecnica y otra para lo que necesite el equipo); se cuentan las libres
  para lo que falte. Quedan en X Arion, Jimmy Wongfu, Lucas Star, Mehr y
  Thaddeus.
- Diamantes: no solo los ~70 de nacimiento, tambien todos los normales (con
  semilla cualquiera puede serlo): ~5400 mas, con sus stats de Diamante
  (rareza 8). A 99 los Diamantes se agrupan en muy pocas plantillas de stats
  (DEL: 6 notas distintas, MED: 5), asi que salen menos tiers y muy llenas.
- Subasta: los rellenos (lo que solo le falta a uno) salen de la tier mas
  baja de su posicion en la tier list de Leyendas (P en delanteros, H en
  medios y defensas, J en porteros); cuando ya no queda nadie ahi, de la de
  encima (O, N...). Sin Idolos. En "sin posiciones", la peor de cada
  posicion por igual. Los candidatos del draft llevan su tier (`tier`, 0 la
  mejor).

### O-268 · Draft individual con formacion al azar; reglas que se pisaban

Aaron: "en el draft individual, un modo con formaciones: que salga una
formacion random a cada uno y los jugadores te vayan saliendo en funcion de
esa formacion (y solo puedas usar esa)... luego tambien suplentes".

- Regla `formacion` (solo en el modo individual) y `suplentes` (0 a 5, de
  serie 5). A cada uno le toca una de las 8 formaciones de 11 del juego
  (`draft.formaciones_draft()`, `/api/draft/formaciones`, sacadas de
  `formaciones.csv` con el id que guarda el equipo). Sus elecciones son 1
  POR, los DEF, MED y DEL de su formacion, luego los suplentes (de cualquier
  posicion, grupo JUG) y el personal. La pantalla ensena la formacion de los
  dos dibujada en un campo pequeno.
- Al montar el equipo se pone esa formacion antes de colocarlos (cada uno en
  un hueco de su posicion; los suplentes, al banquillo) y no se puede
  cambiar: `comprueba_cambio` lo prohibe y en el editor la pieza no se pulsa.
- Intercambio con formacion: cada uno por otro de su mismo hueco (delantero
  por delantero, suplente por suplente...), si no la formacion se quedaba
  coja. `_coloca_en_el_equipo` coloca antes a los de un puesto que a los de
  "cualquier posicion", para que un suplente no le quite el sitio a uno que
  llego en un intercambio.

Repaso de reglas que se podian elegir juntas y se pisaban:
- Formacion + "sin posiciones" o los cuantos por posicion: manda la
  formacion; esas tarjetas no salen.
- "Sin posiciones" + cuantos por posicion: solo contaba el total y se
  ensenaban los cuatro contadores. Ahora sale un solo contador de jugadores
  (11 a 16, regla `jugadores`).
- Supertecnicas "al azar" y "vacias" a la vez (reglas viejas guardadas):
  manda "al azar".
- Intercambio: ya no deja acabar con mas de 3 Idolos ni cambiar
  supertacticas (la pantalla no las ofrecia, pero el anfitrion no lo
  comprobaba).
- Las demas ya se excluian: tanda solo en por turnos, opciones solo en
  individual, tiempo por turno no en la subasta, "una afinidad para cada
  uno" no en la subasta.

### O-269 · La tier list dentro de Pizarra; filtros por tier

Aaron: "ponla en pizarra dentro de un apartado que sea tier list pero que
este bien maquetada, todos con sus caras, nombres y si son personajes
repetidos su juego... cuando clicas en una cara que te lleve a su pagina de
la database y un boton ahi donde facilmente puedas volver a la tier", con
iconos del juego; y "filtros en base de datos, fichar etc para cada tier".

- `ievr/tiers.py` lee `tier-list.csv`: la tier de cada personaje segun su
  rareza (normales en Leyendas, Idolos, Diamantes), la de un normal como
  Diamante y todo para la pagina (`/api/tier-list`).
- Pagina `/tier` (`web/tierlist.html`, ficha "Tier list" en el inicio): las
  tres listas con la franja de rareza del juego, las cuatro posiciones con
  su marcador del juego, una fila por tier y una columna por afinidad (o
  todos juntos), filtros de afinidad y de juego (iconos de serie del
  juego), buscador que dice en que otras listas esta y lleva alli. Tarjetas
  de Pizarra con la cara; el juego solo si hay otra version en esa lista;
  en Idolos su arquetipo con el icono del juego (icon_build01-06, en el
  orden Brecha, Contra, Afinidad, Tension, Juego sucio, Justicia: SUPUESTO
  por el dibujo de cada uno); flechas de los ajustes; la nota y los ajustes
  al pasar el raton. Las tiers con mas de 36 en una celda salen plegadas
  ("Ver los N").
- Pulsar una tarjeta abre `/bd?id=...&desde=tier`: la ficha y un boton
  fijo "Volver a la tier list" que vuelve al mismo sitio (la tarjeta
  queda marcada). La ficha de la base de datos ensena sus tiers con
  enlace a la tier list.
- Filtro "Tier" en Jugadores, Reserva, Fichar (en "con semilla", la de
  Diamante) y Base de datos (y "Tier como Diamante").

### O-270 · Portada nueva

Aaron: el draft en grande al lado del editor (se usa mas que la base de
datos) y debajo, en tres bloques medianos, tier list, calculadora y base de
datos; fuera las fichas pequenas de cosas que ya estan dentro del editor
(jugadores, mochila, fichar...). El panel del draft lleva cuatro caras
contra cuatro al azar.

### O-271 · Tier list: Beta y Seth Bael suben por su modo

Aaron: "sube una tier a la Beta normal por su modo reina... y a Seth subelo
hasta A por el modo santurron". En `construir_tier_list.py`, `SUBE_A_MANO`
(Beta A28E9F95, la normal con modo: +1, queda S en Leyendas y Z en
Diamantes) y `TIER_A_MANO` (Seth Bael 3E55F38F, el unico Seth con modo: A en
Leyendas y en Diamantes). El motivo sale en sus ajustes.

### O-272 · Los 70 Diamantes de fabrica no se repiten "con semilla"

Aaron: "de los 70 diamantes que hay sin semilla, quita sus versiones de con
semilla... aunque uses semilla en ellos, el juego te da la version de los 70
diamantes. Quitalos tambien de fichar, que se puedan fichar solo en su
pestaña de 70 diamantes". (Que la semilla de el Diamante de fabrica es lo
que cree Aaron: SUPUESTO suyo, no comprobado.)

- `reglas.diamante_propio()`: {normal: su Diamante}, unidos por
  `chara_base_id` (cada uno de los 70 tiene justo un normal fichable; con
  las versiones de historia son 161).
- Tier list: esos normales ya no salen en Diamantes (salen los 70);
  "Tier como Diamante" de esos normales es la de su Diamante. 10.951 filas.
- Fichar: en "Con semilla" no salen (5.333) y `anadir_jugador_diamante` lo
  prohibe: "tiene su propio Diamante: fichalo en la pestaña Diamantes".
- Ajustes a mano por categoria: Beta solo +1 en Leyendas (en Diamantes queda
  la de fabrica, en X); Seth Bael A en Leyendas y S en Diamantes.
- Pendiente de preguntar: el boton "Diamante" del editor sobre uno de esos
  normales que ya tienes sigue haciendolo "normal hecho Diamante".

### O-273 · En el draft, el Diamante elegido sale como el de los 70

Aaron: "deja que cuando conviertes en diamante (solo en draft porque en
otros sitios esta desactivado) te ponga la version de esos 70, que se 100%
que son legales". Lo de la semilla en el juego queda sin saber (O-272): si
lo prueba, se decide si el boton "Diamante" del editor hace lo mismo.

- `crear_jugadores` (montaje e importar): si el Diamante elegido tiene su
  version de los 70 (`reglas.diamante_propio()`), se crea esa (nivel 99,
  MAX) con el arquetipo que toco, en vez de pasar el normal a Diamante.
- Los candidatos del draft llevan `diamante_propio`; al elegir Diamante su
  tarjeta dice "Diamante de fabrica".

### O-274 · Tier list: potencia manda en delanteros, agilidad en porteros

Aaron: "prioriza en porteros la agilidad, mucho mas... si hay empate en
agilidad, entonces si desempata con los otros dos... Haz lo mismo en los
delanteros con potencia, potencia es prioridad numero 1 porque sube mas".
En las tres listas. `construir_tier_list.py`: `PRIORIDAD` y `clave_de`
ordenan DEL por (potencia, control + tecnica) y POR por (agilidad, presion
+ fisico); los escalones salen de esa clave (mismo stat que manda y el resto
a 1 punto o menos, juntos). Medios y defensas, igual que antes. Columna
nueva `prioridad` (el valor de ese stat); la pagina lo ensena al pasar el
raton. Comprobado: nadie con mas potencia/agilidad queda por debajo por
stats.

### O-275 · Tier list: Briar Bloomhurst a la X en Leyendas

Aaron: "sube a briar a X porque tiene una de las mejores sinergias del juego
y si lo llevas de delantero no pierdes mucho de no llevar por ejemplo a
zanark y ademas tienes hueco para la sinergia ofensiva"; "en la tier de
leyendas solo". `TIER_A_MANO[("leyenda", "EAB2B5CF")] = X`; sus Idolos (A)
y su Diamante de fabrica (B) se quedan como estaban.

### O-276 · Un amigo instalo desde GitHub y no tenia caras

Se bajo de la release de GitHub (unos 90 MB: Pizarra.exe + pizarra-datos.zip)
en vez del zip portable (530 MB). Es lo esperado: las caras y cuerpos del
juego (`datos/iconos/data/...`) no se publican, van solo en
`Pizarra-portable.zip`, que Aaron pasa en privado. Arreglado:
- El aviso del inicio lo dice claro (lo de GitHub no lleva los dibujos;
  pide el zip portable) y ya no se come las barras de la ruta (el
  `"\datos\iconos"` del JS perdia las `\`).
- `publicar.py` anade a las notas de cada release (`AVISO_INSTALAR`) que
  para instalar por primera vez hace falta el zip portable.
- Rehecho `Pizarra-portable.zip` con la version del dia.

### O-277 · Subasta: "Seguir subastando" hasta llenar los dos equipos

Aaron: "una opcion que sea como esta ahora y otra que siga dando jugadores
para pujar infinitos hasta que los 2 rellenen el team; si a algun jugador le
queda alguna posicion llena, no puede pujar a jugadores de esa posicion".
Regla `fin_puja`: "rellenos" (de serie, lo de antes: lo que solo le falta a
uno, relleno gratis de las tiers mas bajas) o "seguir". Con "seguir", lo que
solo le falta a uno sale como lote que solo puede pujar el (`abreLoteSolo`):
sin puja de salida, su primera puja es la minima; si no puja o pulsa
"Pasar", no se vende ("SIN VENTA") y sale otro. Tambien cuando el otro no
puede pujar por Idolos o dinero. Si ya no queda nadie que sacar, relleno
para acabar. El que tiene llena esa posicion no puede pujar (como siempre).

### O-278 · Las caras se bajan solas de GitHub

Aaron: "si mi amigo abre pizarra ya se le actualizara con las caras
automaticamente? si no es asi y puedes hacerlo estaria bien"; tras explicarle
que un repositorio privado de GitHub no vale "con enlace" (romperia las
actualizaciones de todos), decidio: "dejalo en github las caras mejor".

- `herramientas/empaquetar_caras.py` hace `publicar/pizarra-caras.zip`
  (`datos/iconos/data/dx11/menu/200_icon`, 455 MB, 19.534 ficheros, sin
  comprimir). Subido una sola vez a la publicacion `caras` de GitHub
  (prerelease, sin "latest": la ultima version sigue siendo la normal).
  Solo hay que volver a subirlo si cambian los dibujos
  (`gh release upload caras publicar\pizarra-caras.zip --clobber`).
- `version.json` lleva `"caras"` (lo pone `publicar.py`).
- `ievr/caras.py`: si faltan las caras (`/api/caras`), el inicio enseña
  "Faltan las caras de los personajes" con un boton; `/api/caras/bajar` las
  baja en segundo plano (barra de progreso) y extrae solo `datos/iconos/data/`;
  al acabar la pagina se recarga. Probado en una carpeta como la del amigo:
  35 s, todas las caras.
- Las notas de cada version explican como instalar por primera vez.

### O-279 · Autorrellenar un equipo con uno del juego

Aaron: "una opcion de autorrellenar y que puedas elegir uno de los equipos de
la historia, por ejemplo el tormenta de geminis... todos los teams del modo
cronicas y los del nivel 99 con su escudo, uniforme y tal; los jugadores al 99
automaticamente, como si le dieras a max, sin judias, equipacion, y pasivas y
tecnicas por defecto, y te ponga los jugadores en su formacion, con su nombre".

- Datos: `herramientas/construir_equipos_juego.py` (desde `team_config`:
  SOCCER_TEAM_INFO_LIST, SOCCER_TEAM_MEMBER_LIST, grupos de Cronicas, nombres
  de team_text, niveles de soccer_game_config) escribe `equipos-juego.csv`
  (706 equipos: historia, cronica normal y nivel 99, leyendas de Cronicas, tu
  equipo en Cronicas, partido libre, amistosos, demo...) y
  `equipos-juego-miembros.csv` (10.797; puesto 0-10 = puesto de la formacion,
  11-15 banquillo, 16-18 gerentes, 19 entrenador). Formacion, escudo,
  equipacion y tacticas como `valor_equipo` de equipo-objetos.csv. 99 % de
  los miembros se pueden crear; 698 de 706 equipos enteros. Comprobados
  Raimon, Royal, Zeus, Geminis (capitan Janus), Raimon leyenda.
- `ievr/autorrellenar.py`: `lista()` (sin demo ni otros; las plantillas
  iguales se juntan: las de nivel 99 suelen ser la misma, "tambien Nv. 99";
  485 equipos) y `autorrellenar()`: vacia el equipo (los que habia siguen en
  la partida), pone la formacion (si es de la historia, la legal mas
  parecida, y lo avisa), crea a cada uno nuevo con `anadir_jugador` + MAX,
  gerentes y entrenador con su medalla, los coloca en su puesto, dorsales,
  capitan, escudo y equipacion (se consiguen si no los tienes), sus
  tacticas y el nombre. Un paso de deshacer. Unos 20 s por equipo.
- Editor, Equipos: boton "Autorrellenar" en la cabecera del equipo (no en
  el draft ni en los de la historia): ventana con buscador (sin tildes),
  pestanas por grupo, escudo, era, caras de los once, formacion.

### O-280 · Exportar e importar equipos (para pasarlos a un amigo)

Aaron: "un boton en equipos que sea exportar y otro importar, y te exporta el
equipo de ese slot y te importa el equipo del slot en el que estes, con todo,
tecnicas, pasivas, equipacion, supertacticas, uniforme, escudo... y si le
falta algun objeto, pasiva personalizada etc se lo ponga automaticamente en
la mochila; que al exportarlo te pida la ruta".

- `ievr/compartir.py`: `exportar`/`guardar` escriben `<nombre>.pizarra-equipo`
  (JSON, unos 18 KB) en la carpeta elegida (el mismo selector de carpetas de
  "Abrir partida"): por miembro puesto, dorsal, capitan, personaje, nivel,
  partidos, rareza, arquetipo, arquetipo de Diamante, medalla y su estado
  (`draft.estado_de_jugador` con heredadas: pasivas, heredadas, rama,
  judias, equipacion, tecnicas, personalizada, las de personal), todo con
  codigos del juego; del equipo nombre, formacion, escudo, equipacion,
  tacticas y sinergias. `importar` vacia el hueco (los que habia siguen en
  la partida), crea a cada uno (normal con su rareza y arquetipo, Idolo,
  Diamante de fabrica o hecho con semilla), le copia todo con
  `draft.copia_estado` (sacado de `_copia_jugador`; consigue lo que falte) y
  pone dorsales, capitan, piezas, tacticas, sinergias y nombre. Un paso de
  deshacer.
- Editor, Equipos: botones "Exportar" e "Importar" (este pide el fichero con
  el selector del navegador).
- Comprobado: VINLAND (20, con gerentes y una entrenadora Diamante)
  exportado e importado en otro hueco queda identico (0 diferencias), y por
  los botones igual. Tarda 1-2 minutos (lo lento es repasar la mochila tras
  cada tecnica, como al importar un draft).

### O-281 · Arbol de Lumina Diamante (Lightyear) en la rama equivocada

Aaron: "lumina diamante del equipo lightyear tiene la rama del arbol
bugueada, me sale en posicion incorrecta y aunque la gire no se gira bien".
En su partida (fila 3199): rama marcada 2 (`F_RAMA` = 1) y sus tecnicas
confirmadas de la rama 2, pero las casillas abiertas en el tramo de la rama 1
(8-17) y el anillo con el giro 7, el de la rama 1. Unico caso en toda la
partida (los que tienen las dos ramas abiertas son normales del juego).

- Causa: `draft._copia_jugador` (importar un draft; y ahora tambien importar
  equipo) copiaba `F_RAMA` a pelo. Ahora `copia_estado` no lo copia: si la
  rama es otra, `cambiar_rama` (muda las casillas como el juego) y
  `abrir_arbol` gira el anillo. Probado importando dos de rama 2: bien.
- `_arbol_esperado`: si la rama marcada no tiene casillas y la otra si, se
  mudan a la suya (antes "arreglar arboles" habria abierto las dos).
- Giros del anillo: estan las dos Luminas y las dos "Luvy y Duvy" Diamante,
  todas con un giro que el juego rechaza (pasivas 3-5 cerradas). El giro se
  sacaba de la otra copia, tambien mala, y se pisaban. `_giros_de_la_partida`
  ya no cuenta copias con las pasivas 3-5 cerradas: sin giro conocido, el
  anillo queda sin girar y Aaron lo gira con un clic en el juego (O-200).
  Con "Arreglar arboles" las 4 quedan bien y no queda ninguno roto (57 bytes).

### O-282 · De donde sale el giro del anillo (investigacion)

Aaron: "intentar descubrir los giros de los 5000 pjs sin tener que tenerlos
ya... en el draft siempre tenemos que irnos al juego a girar el arbol".

**Lo que ya se sabe (comprobado):**
- El arbol de un normal (y el de un Diamante) se dibuja con una de las 39
  formas de `skill/ability_learning_config` -> `ABILITY_LEARNING_SHAPE_TABLE_INFO`
  (filas (1, clave de forma)). Cada forma es una cuadricula 11x22 en
  `BOARD_SHAPE_PIECE_DIR` (piezas) y `BOARD_SHAPE_PIECE_EFF` (numero de
  casilla, 1-28; la 8 es el anillo = casilla 7 del mapa).
- El giro es el par de lados que une el anillo con la rama: arriba-izq 7,
  arriba-der 5, arriba-abajo 1, izq-abajo 6, izq-der 8, der-abajo 4. Las seis
  parejas rama1->rama2 que se ven en las partidas (7->5, 7->1, 1->5, 6->8,
  8->4, 4->8) salen exactas de las formas, y la frecuencia de cada giro en la
  partida cuadra con cuantas formas lo tienen (7: 16 de 39 ~ 40 %).
- Por eso `GIRO_DE_LA_OTRA_RAMA` ahora solo usa las parejas seguras (6->8,
  1->5, 8->4, 4->8; y 1->7, 4->8 al reves); con el 7 (rama 1) o el 5 y el 8
  (rama 2) ya no se adivina: queda sin girar en vez de girado mal.

**Lo que falta: que forma le toca a cada personaje.** No esta en ningun dato:
ni `chara_param` (col 10 es el tablero de Idolos/Diamantes; las 11-28 son las
pasivas del arbol), ni `chara_base`, ni la partida (`abilityLearningBoardId` =
`0xBAFA8DBD`, solo en Idolos; los normales y los Diamantes no lo llevan). Los
70 Diamantes de fabrica comparten tablero en los datos y en la partida tienen
giros distintos. Probado sin exito (acierto ~30-40 %, el del azar): columnas
y pares de columnas con validacion; identidad/chara id/indice modulo 39;
crc32, adler, murmur3, xxh32, fnv1/1a, djb2 de varias codificaciones;
Mersenne Twister, rand de MSVC, xorshift32/128 sembrados con la identidad.
Las 580 `TABLE_INFO` llevan a tableros de 27-28 casillas pero sus claves no
salen en ningun otro fichero.
- **Siguiente paso** (largo): seguir el codigo de `nie.exe` (no esta cifrado;
  `.text` normal). Los crc32 de los nombres de tabla estan en una tabla de
  registro en `.data` (crc, funcion de carga): SHAPE_TABLE_INFO se carga con
  `0x140272B80` en el objeto de configuracion `+0x328` (filas de 8 bytes:
  (1, forma)) y su cuenta en `+0x330`. Hay que encontrar quien lee esa lista
  para elegir la forma (y con que semilla). Textos utiles del exe:
  `abilityLearningBoardId`, `ABILITY_LEARNING_ROUTE_TYPE`,
  `ability_learning_board_basara_%s-%s_%02u` (nombre de los tableros de
  Diamante).

**Mientras tanto:** `anillos.csv` rehecho con la partida actual de Aaron y sus
copias: 2.810 giros (antes 2.674), unos 2.600 normales de ~5.400.
`construir_anillos.py` ya no apunta empates (Luvy y Duvy Diamante salia 6 o 7).
Cada partida que se abre ensena tambien sus giros buenos, asi que un
personaje que Aaron gire una vez en el juego queda aprendido.

### O-283 · El giro del anillo, calculado como el juego (resuelto)

Siguiendo O-282 en nie.exe (solo leido, con capstone):
- Nombres reales de los campos (crc32 de los textos del exe): `F_ANILLOS` =
  `overwriteRouteSwitcherIdxList`, `F_GIROS` = `overwriteRouteSwitcherTypeList`
  (el anillo es un "route switcher"), `F_RAMA` = `currentRouteType`, el mapa =
  `openedEffectPieceList`, 45E2 = `specialSkillPieceEffectIdxList`,
  `F_ARQUETIPO_DIAMANTE` = `basaraBuildType`, `0xBAFA8DBD` = `abilityLearningBoardId`.
- Forma de un normal: funcion `0x140E7B5B0`. Siembra `lives::CPseudoRand`
  (vtable 0x1419B7378: sembrar 0x1404C92B0, siguiente 0x1404C9330, acotado
  0x14009FB20; un xorshift de 128 bits) con el 2.o dato de su fila de
  `chara_param` (el id de `chara_base`), descarta 11 numeros, saca
  `next() % (39 + 1)` y coge esa forma de `SHAPE_TABLE_INFO` (si sale 39, la
  0). La guarda en memoria, no en la partida.
- Tablero de un Diamante: funcion `0x14165CED0`. Si esta en
  `character/basara_chara_config` (los 70 de fabrica), su tablero por
  arquetipo; si no, `crc32("ability_learning_board_basara_<pos>-<pos2>_<arq+1>")`
  con GK/FW/MF/DF (72 tableros; la forma solo depende de las posiciones).
- Giro = par de lados que une el anillo en la forma (O-282).
- `herramientas/construir_giros.py` -> `giros-anillo.csv`: 24.543 giros de
  6.016 personajes (normales, como Diamante con semilla, y Diamantes de
  fabrica por arquetipo). `_giro_conocido` los usa primero; lo aprendido de
  partidas queda de respaldo (Destin Billows y otros con tablero propio, y la
  rama 2 de la forma 31, cuyas dos ramas salen del anillo por el mismo lado).
- Comprobado con la partida de Aaron: normales en rama 1 3.196 iguales y 4
  distintos; en rama 2, 38 iguales y 35 distintos que llevan el giro de la
  rama 1 (los paso el editor viejo a la rama 2 sin girar, O-281; una partida
  de antes del editor solo tenia 5/8/1/4 en rama 2, lo que da el calculo);
  Diamantes de fabrica 58 de 62; con semilla 151 de 159 (los porteros que
  fallan, hechos con el editor). 2.829 normales que no estaban en ninguna
  partida salen ya girados al crearlos con MAX.
- En la partida de Aaron "Arreglar arboles" toca 140: anillos sin girar que
  ahora se giran y los 35 de rama 2 mal girados.

### O-284 · Lo que rompio la 2026.10.04.3 en los arboles, y la regla buena

Aaron, tras instalar la 2026.10.04.3: Hotel, Vee Wai y Dave Quagmire de
Lightyear con el arbol mal; Boulder, Tabit, Weathervane, Slinka y Nieve Alba
se le habian girado solos a la otra rama; Luvy y Duvy (Diamante) mal.

Comparando su partida de antes de guardar (`.bak` de las 07:39) con la de
despues de jugar (07:48), la O-283 cambio el giro de 140 jugadores. Dos
errores:

1. **Jugadores con las dos ramas abiertas** (37 normales y varios Diamantes,
   hechos con versiones viejas del editor): el juego ensena la rama a la que
   apunta el anillo, no la marcada en `currentRouteType`. Su giro era el de la
   otra rama y funcionaba; "corregirlo" les dio la vuelta.
2. **Diamantes**: el juego dibuja el arbol con el tablero apuntado en la
   partida (`abilityLearningBoardId`), no con el de sus posiciones. El editor
   les pone a veces el de un Diamante parecido (O-240), y Hotel y Dave llevan
   un tablero de giros 6/8 aunque por posiciones les tocaria 7/1.

Comprobado en cinco partidas (la de antes del editor y cuatro de Aaron): con
el tablero apuntado para los Diamantes y la forma sorteada para los normales,
un giro que no une ninguna rama de su dibujo es **siempre** uno que el juego
rechazo (pasivas 3-5 a cero), y todos los rechazados son de esos. En la
partida de antes del editor, 109 de 109 Diamantes cuadran con el apuntado.

La regla nueva (`_giro_a_corregir`):
- Un giro que une una de las dos ramas de su dibujo no se toca, salvo que
  apunte a una rama sin casillas y la marcada tenga (pasa al cambiar de rama).
- Si no une ninguna rama de su dibujo, el de la rama marcada.
- Sin saber su dibujo entero, solo si el juego ya lo ha rechazado.
- `giros-tablero.csv` (836 tableros) da los giros de cada tablero, y
  `_giros_de_su_forma` usa el apuntado si lo hay.

Con ella, en la partida de antes del editor no se toca ni un anillo girado; en
la de Aaron de antes de la actualizacion solo los 7 que el juego ya habia
rechazado (Luvy y Duvy x2, Lumina x2, Darren LaChance, Terry Archibald y
Stephen Black, este por el calculo).

Tambien:
- `rama_que_ensena`: la rama que ensena el juego (con las dos abiertas manda
  el anillo). La usan la ficha, las estadisticas del arbol, el copiado al
  draft y el exportar. `cambiar_rama` parte de ella, muda las casillas como el
  juego (Boulder, al girarlo Aaron, quedo solo con la rama nueva) y gira el
  anillo. Antes, con las dos abiertas, cambiar de rama no cambiaba nada en el
  juego.
- Las pasivas 3-5 de un Diamante en la rama 2 van diez casillas mas alla
  (18, 20, 21), como en su tablero; con la 8/10/11 fija salian con candado.

Para Aaron: `partidas/arreglo-arboles` es su partida de ahora con los 49
jugadores que la 2026.10.04.3 estropeo vueltos a como estaban (giro, rama,
casillas y marcas de la `.bak`). Boulder no, que lo giro el en el juego y ya
esta como antes. Al guardarla con Pizarra solo se arregla Luvy y Duvy (que ya
estaba rechazado). La `.bak` queda en `partidas/antes-de-2026.10.04.3`.

### O-285 · Girar en el juego = cambiar_rama del editor (confirmado)

Aaron no abrio `partidas/arreglo-arboles` (O-284): guardo con la 2026.10.04.4
la partida de las 07:48 (08:15) y luego giro a mano en el juego los que
seguian en la otra rama, los de sus equipos (08:22). Con eso:

- **Los 19 que giro, byte a byte**: rama, mapa, anillo, giro, 45E2 y tabla de
  pasivas que dejo el juego son exactamente los que da `E.cambiar_rama` +
  `abrir_arbol` + `sincronizar_tabla_pasivas` sobre lo que escribio Pizarra.
  Con las dos ramas abiertas, el juego parte de la rama que ENSENA (la del
  anillo), deja las casillas solo en la nueva, `currentRouteType` = la nueva y
  el giro de esa rama (Tabit: r1 t1/t2 g1 -> r0 t1 g7; Nieve Alba: r0 t1/t2
  g7 -> r1 t2 g5). Confirma O-284: con las dos abiertas manda el anillo.
- Con la partida de las 08:22 Pizarra ya no toca ningun arbol al guardar.
- Quedaban 24 en la rama contraria a la de antes de la 2026.10.04.3 (21 sin
  equipo; Finn Geld en Prohibido Divertirse, Jomon Dorg y Bert Laydie en
  Marineros). `partidas/arreglo-ramas` es la de las 08:22 con esos 24 girados
  con `cambiar_rama` a su rama de antes (Cerise Crane a la 2, el resto a la 1).
  Lumina (fila 3199) no: antes estaba rota y ahora esta bien.

Tres revisiones independientes (diff de bytes, los 3.682 jugadores con anillo
frente a la partida de antes, y el codigo) dan bien la partida preparada y
encontraron tres fallos del codigo, ya arreglados:
- **Forma de Zanark** (121 personajes, giros 6 en la rama 1): la busqueda
  daba que las dos ramas salen por el mismo lado y la rama 2 quedaba sin
  calcular; al cambiarlos de rama el anillo se quedaba apuntando a la rama
  vacia y nadie lo corregia (Selenia Mund, Wilder Bigfoot). La rama 2 sale
  por el otro lado que llega a ella: giro 8, el que puso el juego a Zanark.
  `cambiar_rama` busca ademas el giro con la partida de antes del cambio, y
  `_giro_a_corregir` con el dibujo a medias usa el giro conocido.
- **Cambiar de tablero** (arquetipo de Diamante, pasar a Diamante) a un
  jugador con las dos ramas abiertas le cambiaba la rama que ensena (Beluga,
  Galileo, Nero): `_conservar_rama_ensenada` le pone el giro de esa rama en
  el dibujo nuevo.
- `arreglar_diamantes` cambiaba el tablero sin repasar el arbol: ahora pasa
  `abrir_arbol` por cada uno.
- Una segunda revision encontro que `poner_diamante` dejaba siempre la rama 0
  (la de los ascendidos de la partida, que no tenian rama empezada): a uno con
  solo la rama 2 (Cedric Freud) lo devolvia a la 1. Ahora, si tiene rama
  empezada, sigue en la que ensena. Comprobado en 64 (40 de rama 2).
Visto y no tocado: al girar, el juego rehace tambien la seleccion de tecnicas
(`0xE2C66FA7`, 6 por jugador) y `cambiar_rama` no; el juego la rehace solo al
cargar (de la `.bak` a las 07:48 cambio la de 67 jugadores sin girarlos).

### O-286 · El juego de partidos: fase 1, contra la maquina

Aaron (2026-10-04): "un Inazuma antiguo dentro de Pizarra, con todo lo del
VR": la jugabilidad de IE 1-3 (DS) y GO/CS/Galaxy (3DS) -lapiz, pausa en cada
duelo- con los personajes, stats, tecnicas, pasivas y calculos de Victory Road.
Solo partidos online con amigos. Aparte de todo lo demas, sin tocarlo.

Investigacion (informes en el scratchpad de la sesion, juego/investigacion):
- DS/3DS (manual oficial de IE3 Team Ogre y de GO Light; formulas de IE3 por
  ingenieria inversa de oupo): arrastrar desde un jugador = su ruta; tocar a
  un companero = pase; tocar un punto = pase al hueco; tocar la porteria =
  tiro. Al cruzarse con un rival el juego se para: comando seguro, comando
  potente (fuerte pero inestable) o supertecnica. Gana con probabilidad
  A^3 / (A^3 + D^3). Muro: con 1,25 veces el tiro lo para, por debajo de
  0,75 nada, entre medias lo frena.
- VR: AT tiro = Pot + Ctrl (+ tecnica x (nivel+15)/112, x1,15 si es de su
  elemento); AT foco = Tec + Ctrl + Pot/2; DF foco = Tec + Int + Agi/2;
  disputa Int + Fis contra Int + Pres; muro Fis + Pres; KP del portero
  Agi x4 + Fis x3 + Pres x2 y se desgasta al parar; ventaja de elemento +20 %
  por el jugador y +20 % por la tecnica. Las tecnicas no gastan PT del
  jugador: gastan la TENSION del equipo (max 300; +60 al ganar un duelo, +30
  al perderlo; la columna "tp" de tecnicas.csv es su coste).
- Modelos 3D: estan en los paquetes del juego (.g4pk/.g4md/.g4mg/.g4sk/.g4mt);
  hay un lector propio de G4PK que abre 1.859 de 1.859 de una muestra. La
  herramienta mas completa (G4_Blender) no tiene licencia: solo para probar.
  Plan: convertir en el PC de cada uno desde su propio juego, sin repartir nada.
- Online: WebRTC directo entre los dos con el saludo por los mismos servidores
  MQTT del draft; el que invita simula y el otro recibe instantaneas.

Hecho (fase 1, contra la maquina, en /partido y una franja en el inicio):
- `ievr/partido.py`: los equipos de la partida con once en el campo, y un
  equipo listo para jugar (formacion, siete stats, tecnicas abiertas con id,
  nombre interno, tipo, elemento, poder y coste; pasivas en texto).
- `web/partido-reglas.js` (todos los numeros, ajustables), `partido-motor.js`
  (simulacion a 30 pasos por segundo con azar con semilla: igual en dos PCs),
  `partido-ia.js` (la maquina), `partido-pantalla.js` (campo en canvas, caras)
  y `partido.js` (el raton como el lapiz y la pausa con los comandos).
  `/partido?demo` = maquina contra maquina.
- Probado: 12 partidos maquina contra maquina sin pantalla (node): unos 3,7
  goles, 21 tiros y 50 duelos por partido de 2 x 3 minutos; y en el navegador
  la pausa del duelo, el resultado, el tiro con su parada y los tres gestos
  del raton.
Falta: online, pasivas con efecto, cadenas y tiros directos, tacticas,
espiritus (hipertecnicas), modelos 3D y cinematicas de las tecnicas.

### O-287 · El juego de partidos: online entre amigos

Fase 2 de O-286. En /partido, "Jugar online": pones tu nombre (el mismo que
en el draft, se recuerda), ves quien mas esta en Partido con su equipo y le
invitas; el otro acepta y empieza el partido, cada uno con el equipo que
tenga elegido arriba a la izquierda.

- Red: la misma del draft (`web/draft-red.js`, MQTT por WebSocket a tres
  servidores publicos a la vez, sin cuenta ni puertos), sin tocarla, con temas
  propios bajo `partido/` (`web/partido-red.js`): conectados, buzon y la sala
  (`anfitrion` / `invitado`).
- El que invita lleva el partido: su PC simula y manda unas 10 fotos por
  segundo (`Partido.foto()`, ~1,9 KB; una por segundo si esta parado en un
  duelo). El invitado no simula: pinta las fotos suavizadas
  (`aplicarFoto`, `suavizar`) y manda sus gestos y elecciones como ordenes
  numeradas (cada mensaje llega hasta tres veces, uno por servidor: lo
  repetido se tira). Los equipos viajan una vez al empezar (`equipoParaRed`,
  sin textos largos). Sin noticias del rival 8 s, el partido espera.
- Las rutas valen tambien con el juego parado (una ruta podia llegar justo al
  empezar un duelo y se perdia).
- Cartel final con el resultado, los goles y "Otro partido".

Probado con dos pestanas (127.0.0.1 y localhost) por los servidores publicos:
presencia, invitacion, aceptar, intercambio de equipos, fotos (el invitado a
3 pasos del anfitrion), un duelo elegido por cada lado con su resultado y la
tension igual en los dos, y una ruta del invitado que su jugador recorre en el
PC del anfitrion.
Pendiente: WebRTC directo (menos retraso), retomar un partido cortado.

### O-288 · El juego de partidos: las pasivas cuentan

Victory Road tiene 80 tipos de pasiva (pasivas-valor.csv). `ievr/partido.py`
(`efecto_de_pasiva`) lee el texto de cada una (con su numero) y saca
{que, pct, alcance, condicion}: 44 tipos ya hacen algo en el partido.
- Que: AT de tiro, valor de foco y de disputa (AT y DF), DF del muro, PP del
  portero, "AT/DF del equipo", tension al ganar un duelo; y los stats fijos
  ("Potencia +3"), que se suman ya a sus stats.
- Para quien: el propio jugador, todo el equipo, los del mismo o distinto
  elemento o posicion, los cercanos (12 m), los medios.
- Cuando: en campo propio o contrario, fuera del area, en la primera o la
  segunda parte, con un companero del mismo/otro elemento cerca, con la
  tension a cierto %, los N segundos tras recuperar el balon (robo en un
  duelo o pase cortado), con el marcador igual o perdiendo.
- En cada ranura manda la heredada si la hay, y solo cuentan las abiertas en
  el arbol. Tope de +60 % por valor (`PASIVAS_TOPE`).
- Sin efecto aun (36 tipos): configuracion de equipo, brecha, afinidad,
  faltas, sustituciones, enfriamientos, ataque duro, tiro directo.
- El motor las suma en cada duelo (`bonusPasivas`). La ficha del jugador las
  ensena con una marca en las que cuentan. Viajan en el online.
- Con ellas subieron los goles; el KP del portero pasa a x0,5 (de 0,45):
  unos 4 goles por partido de 2 x 3 minutos.

### O-289 · El juego de partidos: cadenas, tiro de primeras, contra-tiro y rotulos

- Rotulo de cada duelo como en el juego: la cara, la supertecnica en una
  tarjeta del color de su elemento, lo que suman las pasivas y el numero, que
  sube poco a poco; el que gana, marcado.
- Subtipos de tecnicas.csv: Tiro 4 = tiro largo (antes no se reconocia: el
  texto es "tiro largo" y se buscaba "larga"); Defensa 16 = bloqueo de tiro
  (antes se colaba en los duelos de regate: se buscaba "bloqueo de tiros");
  Tiro 16 = "bloqueo de tiros", el contra-tiro de VR.
- Muro: solo las defensas de bloqueo de tiro, o un contra-tiro, que frena con
  la mitad de su tiro (VR: "contra-tiro: resta su AT x 0,5").
- Cadena (DS IE3, VR): un companero en la linea de tiro, mas cerca de la
  porteria, puede encadenar con cualquier tiro que no sea largo; los AT se
  suman y el elemento que cuenta ante el portero es el del ultimo; el gol es
  suyo. Al elegir tiro se pregunta "¿encadena?".
- Tiro de primeras (DS: tocar la porteria mientras va un pase; VR: tiro
  directo): al recibir, chuta en el acto y suma el 50 % del AT de tiro del que
  paso.
- La maquina encadena si le llega la tension y remata de primeras a veces.
- Equilibrio: KP del portero x0,62 y desgaste 0,4 (unos 4 goles por partido).

### O-290 · El juego de partidos: las tacticas del equipo

- Cada equipo de la partida lleva tres tacticas (el id va con los bytes al
  reves respecto a tacticas.csv). `ievr/partido.py` (`efectos_de_tactica`)
  lee sus efectos del texto: % a foco, disputa, AT, DF, AT de tiro, PP, DF del
  muro, poder de las tecnicas (de tiro, de regate o todas), velocidad (de
  movimiento o de regate) y tension ganada; propios o que se le bajan al
  rival ("enemigo", "rival", "contrincante"); con condiciones de campo,
  tension (a partir de / por debajo de) y "al recuperar el balon". "En el
  geoglifo" se toma como "mientras dure". Especiales: ignora los focos, sin
  intercepcion de pases, el rival pierde el balon (robo al instante), aturde
  a los rivales cerca del balon, baja la tension del rival. 58 de 92 tacticas
  hacen algo.
- Duran y se recargan lo que dice la tabla (casi todas 40 s y 90 s); solo una
  activa a la vez por equipo.
- En la pantalla, la tarjeta "Tacticas" con un boton por tactica (lista,
  activa y los segundos que le quedan, o la recarga). La maquina usa una
  defensiva si le atacan en su campo y una ofensiva si ataca en el contrario.
  Viajan en el online.
- Medido: unas 15 tacticas por partido entre los dos; unos 3,3 goles.

### O-291 · El juego de partidos: espiritus y duracion

- Espiritus (kenshin, mixi max, alma/totem): la ranura "Hipertecnica" del
  jugador es un espiritu (espiritus.csv); en el partido el jugador tiene la
  supertecnica del espiritu (columna `tecnica`: 102 kenshin, 69 mixi y 56
  almas la tienen; casi ninguna armadura) con su poder y coste de tension
  (casi todas 800 y 140), marcada con una estrella; y la pasiva del espiritu
  (`O.pasiva_de_espiritu`) cuenta como una mas.
- Duracion del partido: corto 2 x 3, normal 2 x 5 o largo 2 x 8 minutos (se
  recuerda; online manda la del que invita). El marcador cuenta siempre de 0
  a 90.
- Pendiente: los topes por equipo de las pasivas (pasivas-limites.csv); ahora
  hay un tope general de +60 % por valor.

### O-292 · El juego de partidos: topes de las pasivas y focos automaticos

- Topes de equipo como el juego (pasivas-limites.csv): cada pasiva se cruza
  con su plantilla de pasivas-valor.csv (texto sin el numero ni espacios) para
  saber su `tipo_efecto`: 922 de 922. El motor suma por tipo y corta cada uno
  en su tope (PP del equipo 20 %, foco del equipo en campo contrario 50 %...).
  Las de los espiritus no estan en esa tabla: las iguales tienen un tope de
  equipo del 30 % (antes, diez jugadores con el mismo espiritu sumaban +200 %
  de AT de tiro y solo los paraba el tope general de +60 %).
- "Focos automaticos" (casilla al elegir equipos, se recuerda): la maquina
  elige por ti en los focos y disputas; en tiros y paradas sigues eligiendo
  tu. En un partido salen ~50 focos.

### O-293 · El juego de partidos: vista 3D y modelos del juego

- Casilla "Vista 3D" al elegir equipos (se recuerda). Usa three.js r160 copiado
  en `web/` (licencia MIT, sin internet) con los imports cambiados a rutas
  planas, porque `/web/` solo sirve nombres de fichero.
- Sin modelos, cada jugador es una ficha con su cara. Con modelos, el personaje
  del juego con sus animaciones: parado (戦1立ち1L), correr (戦1走り1L),
  tiro (戦1シュート1) y patada (戦1キック1).
- Los modelos NO van en el repo ni en las releases (son arte del juego). Cada
  PC los convierte desde su propio juego a `datos/modelos3d/` (ignorado) al
  pedirlos el partido.
  - `ievr/cpk.py`: lector propio de los .cpk. La clave es el crc32 del nombre
    mas el offset, con los grupos de 2 bits barajados; descomprime CRILAYLA.
    Indice de los 936 .cpk en 1,4 s.
  - `ievr/g4.py` y `ievr/g4anim.py`: G4PK/G4PKM/G4MD/G4MG/G4SK/G4TX/G4MT a
    glTF. La talla de la ropa sale de CHARA_BODY_INFO: uniforme = columna 6
    + 1; botas y guantes = columna 5 mod 4 + 1 (el script de pruebas cogia
    la carpeta por orden y vestia a cuerpos grandes con ropa de nino: de ahi
    las cabezas flotando). Cada .glb lleva su VERSION_MODELO y los de una
    version vieja, o cortados, se rehacen solos. Los "monstruos" con
    esqueleto propio dejan fuera la ropa que no encaja.
  - `ievr/modelos3d.py`: cola en segundo plano.
  - Rutas: `POST /api/partido/modelos/preparar` y
    `GET /api/partido/modelos/estado`. El aviso "Preparando modelos 3D: n de
    22" se cambia por cada modelo segun sale.
  - Tabla de piezas: `datos/reglas-extraidas/modelos-personaje.csv` (5.703
    personajes), hecha con `herramientas/construir_modelos_personaje.py`.
  - Nada del toolbox ni de librerias sin licencia: todo es codigo propio.
  - El .exe lleva numpy y PIL: pasa de 24,8 a 31 MB.
  - Probado: 420 personajes, 419 bien (media 1,2 s; c11130500 tiene un
    formato de malla que aun no se entiende y se queda con ficha). Los
    uniformes de equipo salen sin antebrazos ni manos (la manga acaba ahi):
    pendiente.
  - Revision: el indice del juego no se guarda si un .cpk no se pudo leer
    (antivirus, Steam); el .tmp lleva el numero del proceso y el renombrado
    se reintenta si el .glb viejo esta abierto (Windows).

### O-294 · El juego de partidos: jugabilidad de 3DS

- Campo en VERTICAL, como la pantalla tactil de 3DS: tu equipo ataca siempre
  hacia arriba, tambien en la segunda parte. El panel de los duelos va al
  lado, no encima del campo.
- Pausa tecnica (boton o espacio). Hay 3 por parte de hasta 20 s; el reloj no
  corre. Se dibujan rutas y se marca un pase (amarillo), que sale al seguir.
- Rutas durante los duelos y las pausas: lo que dibujes se cumple al acabar.
- Presionar: tocar al rival que lleva el balon manda a tus dos mas cercanos a
  por el (linea roja).
- Pase bombeado (mantener pulsado al pasar): va por el aire y no se puede
  cortar hasta los 4 ultimos metros.
- Apoyos en los duelos: cada companero a menos de 7 m suma un +5 %, y otro
  +5 % si es del mismo elemento (maximo 3).

### O-295 · El juego de partidos: faltas, penaltis y espiritus invocados

- Faltas: arriesgarse ("Entrada") puede ser falta (22 %), y cargar tambien
  (12 %). Dentro del area pasa x0,4 de veces, pero es penalti: un tiro desde
  11 m sin muro ni cadena. En las faltas, los rivales se apartan 9,15 m.
- Invocar el espiritu (como en GO/CS): cuesta 100 de tension y da un aura de
  30 s con +25 % a todo. La supertecnica del espiritu solo vale con el aura
  puesta. Recarga de 60 s.
- Medido: unas 2,5 faltas, 0,3 penaltis, 6 espiritus y 3,8 goles por partido.

### O-296 · El juego de partidos: solo en pruebas, y fuera de juego opcional

- Aaron no quiere el Partido en el Pizarra de todos mientras esta en pruebas.
  Solo sale si existe `datos/partido-pruebas.txt` (ignorado en git; no va en
  pizarra-datos.zip ni en el zip portable) o con `IEVR_PARTIDO=1`. Sin eso,
  `/partido` y `/api/partido/*` dan 404 y la portada no ensena la franja
  (`/api/estado` lleva `partido`). Para jugar online, el amigo tambien
  necesita el fichero.
- Fuera de juego, opcional al elegir equipos. Al principio venia quitado
  (bajaba los goles de 3,8 a 2,1 por partido), pero Aaron confirma que en los
  de 3DS lo hay: ahora viene PUESTO (se recuerda si se quita) y la maquina da
  pases al hueco (O-303). Como funciona:
  - Es fuera de juego pasar a un companero que, al salir el pase, esta en el
    campo rival, por delante del balon y del penultimo rival (contando al
    portero). Se pita al recibir y el balon pasa al rival.
  - Con el balon, se ve la linea en discontinua.
  - La maquina casi nunca pasa a uno en fuera de juego (~1 por partido) y sus
    delanteros esperan en la linea.
  - Online manda la opcion del que invita.
- El pase bombeado se ve por el aire: la sombra en el suelo y el balon arriba
  (tambien en el invitado online: la foto lleva `alto` y la distancia total).

### O-297 · El juego de partidos: cambios en la pausa

- Hay 3 cambios por partido con los 5 del banquillo de la partida
  (`equipo()` ya traia `banquillo`). Se hacen en la pausa tecnica o en el
  descanso: en la ficha de un jugador tuyo salen los suplentes y, al pulsar
  uno, entra por el.
- El que entra se queda en el sitio del que sale, con su puesto en la
  formacion, el sentido de esa parte y el balon si lo tenia. Si sale el
  portero, el que entra hace de portero (con su KP). El que sale ya no vuelve.
- Online: los cambios viajan en la foto (`cb`) y el invitado los repite una
  sola vez; el banquillo va en `equipoParaRed`.
- La maquina, en el descanso, mete al del banquillo si es un 5 % mejor (suma
  de stats) que el peor de su puesto. Con los equipos de Aaron casi nunca pasa,
  porque sus suplentes no son mejores.
- El aviso de la pausa pasa arriba a la izquierda: abajo tapaba al portero.

### O-298 · El juego de partidos: supertecnicas de varios jugadores

- `tecnicas.csv` trae `jugadores` (1 a 4): 71 tiros de 2, 56 de 3, 6 de 4,
  defensas y paradas de 2-3... Antes cualquiera las hacia solo.
- Ahora necesitan n-1 companeros (sin aturdir) a menos de 12 m
  (`REGLAS.COMBINADA_RADIO`). En el boton sale "con X y Y" o "de 3: necesita
  2 companeros a menos de 12 m", y no se puede pulsar. Vale igual para la
  maquina y viaja en el online (`jugadores` en `equipoParaRed`).
- CORREGIDO por Aaron: en VR vale cualquier companero, este cerca o no. Ya
  no hay radio: siempre se puede, y en el boton sale "con X y Y" (los mas
  cercanos, que son los que la hacen con el).

### O-299 · El juego de partidos: tiempo para elegir online

- CORREGIDO por Aaron: en los de 3DS no hay limite, asi que
  `REGLAS.DUELO_MAX` = 0 (sin limite, tambien online). El motor lo sigue
  sabiendo hacer por si hiciera falta.
- Como estaba: online, cada duelo daba 15 s para elegir (`REGLAS.DUELO_MAX`; el reloj va en
  `duelo.reloj` y viaja en la foto). Al acabarse, el anfitrion juega el
  comando seguro del que falta (`eleccionSegura`: Regatear/Tapar, Tiro
  normal, Parar y Bloquear, sin encadenar). Asi el partido no se queda parado
  si el amigo se despista. En el panel sale "Te quedan n s para elegir".
- Contra la maquina no hay prisa.

### O-300 · El juego de partidos: rotulo de gol y sonidos

- En cada gol sale "¡GOL!" grande en el campo, con el nombre del que marca
  (amarillo si es tuyo, rojizo si es del rival), mientras dura la
  celebracion (`Pantalla._rotuloGol`).
- Sonidos hechos con el navegador (WebAudio, sin ficheros ni nada del juego,
  en `web/partido-sonido.js`):
  - silbato al empezar, al sacar tras un gol, en las faltas y en el fuera de
    juego; dos pitidos en el descanso y tres al final;
  - una patada al pasar (y mas fuerte al chutar);
  - dos notas que suben cuando se para por un duelo;
  - el publico en los goles (mas largo si es tuyo).
  `Sonido.mirar(p)` compara cada cuadro con el anterior, asi suena igual en
  el invitado online. Casilla "Sonido" al elegir equipos (se recuerda). El
  navegador solo deja sonar tras un clic, asi que se despierta en cualquier
  clic de la pagina.

### O-301 · El juego de partidos: la pantalla de arriba en 3D

- Como en la 3DS: se juega SIEMPRE en el campo 2D en vertical (la pantalla
  tactil), y la casilla "Pantalla de arriba en 3D" pone encima del panel de
  duelos el partido en 3D, en 5:3 como la pantalla de arriba (hasta 560 px de
  ancho en pantallas anchas). Antes la 3D sustituia al campo 2D y, con el
  campo en vertical, se veia muy estrecha.
- Camara: desde la banda, siguiendo el balon. En un duelo se acerca a los dos
  (en un tiro, al que chuta) y al acabar vuelve.
- El pase bombeado va por el aire tambien en 3D.
- Con un cambio (O-297), la figura del que entra se rehace y se pide su modelo
  a la cola.
- Al empezar otro partido se suelta la tarjeta grafica del anterior
  (`Pantalla3D.cerrar`).

### O-302 · El juego de partidos: tiros como en Inazuma (la supertecnica cuenta)

- Medido antes (`medir3.js`): unos 27 tiros a puerta por partido y casi todos
  muy por debajo de la parada (AT/DF < 0,75 en 24 de 27). Los goles salian de
  la suerte con A^3/(A^3+D^3) (con AT/DF 0,6, el 22 % entraba), no de superar
  al portero.
- Ahora:
  - El tiro contra el portero va a la quinta (`REGLAS.probabilidadTiro`,
    `TIRO_EXPONENTE` 5): con AT/DF 0,75 entra el 19 %; con 1, el 50 %; con
    1,2, el 71 %. Los duelos de regate y entrada siguen a la tercera (IE3).
  - KP del portero x0,42 (antes x0,62).
  - La maquina chuta menos y mejor (`REGLAS.IA_TIRO`: a menos de 18 m; 15 %
    cerca, 5 % con la linea libre y nunca tapada).
- Resultado: unos 16 tiros a puerta y 3,5 goles por partido. De esos goles,
  2 de cada 3 son tiros que superan la parada (83-90 % entran) y casi ninguno
  por debajo de 0,75.

### O-303 · El juego de partidos: pase al hueco de la maquina

- Con el fuera de juego puesto, los delanteros de la maquina esperan en la
  linea y los goles bajaban a 2,8 por partido. Ahora la maquina tambien da
  pases al hueco (`Maquina._alHueco`): a un punto 8 m por detras de la
  defensa, para un companero que esta en la linea sin fuera de juego, si
  llega antes que cualquier rival y el pase no se corta. Va como un
  "pasePunto"; a por el va el companero mas cerca.
- Medido con fuera de juego: unos 14 tiros a puerta, 3,5 goles y 0,7 fueras
  de juego por partido.

### O-304 · El juego de partidos: fallos de los datos de los equipos (revision)

Encontrados por la revision a fondo (angulo datos/servidor) y confirmados cada
uno por dos verificadores:
- ALTA: los Idolos y Diamantes con tablero llegaban con TODAS las pasivas
  cerradas. El detalle del jugador no trae la marca de abierta cuando ensena
  las del tablero (`detalle_jugador`, O-166/O-245), y `_ficha` la tomaba de
  ahi. Pasaba a 39 jugadores en 10 de los 11 equipos de Aaron, justo los
  buenos. Ahora la marca sale de la tabla del juego (`J.tabla_pasivas`); sin
  tabla, cuenta como abierta.
- "AT. de tiro +10 %" (con punto; Gran plan y otras tres) se leia como AT
  general y subia tambien focos y disputas. Ahora es solo tiro.
- Las tacticas con efectos en minuscula tras una coma los perdian (Espejismo
  Shaolin se quedaba sin ninguno; Marcaje al hombre sin la velocidad): las
  partes de palabras van sin distinguir mayusculas.
- Las tacticas que el partido aun no sabe aplicar (Supresion inquebrantable,
  Formacion caparazon, Aislar al jugador clave...) se podian pulsar: no hacian
  nada, bloqueaban a las otras y gastaban la recarga. Ahora salen apagadas
  ("sin efecto en el partido") y el motor no las activa.
- El DF general de las tacticas y pasivas (Fortaleza de llamas DF +40 %...)
  subia tambien la parada del portero (x1,5). La parada sube solo con PP.
- Los espiritus sin supertecnica (Sobrecarga ardiente, Guardian ferreo...) no
  se podian invocar (en Gafas, 1 de 11). Ahora el jugador lleva siempre su
  espiritu (`espiritu` en el equipo y en el online) y todos pueden invocar el
  aura; la supertecnica solo si existe.
- Las supertecnicas de espiritu de varios jugadores llegaban como de 1
  (Caliburn es de 2).
- "Hasta que el equipo reciba una falta" ya cuenta las faltas recibidas
  (condicion `sin_falta`; `faltasRecibidas` por equipo).
- El nombre "Formacion <FLC:SHINANO>" sale limpio ("Formacion Mercer").
- Medido con los datos arreglados: 3,9 goles y 12 tiros a puerta por partido;
  9 espiritus invocados.

### O-305 · El juego de partidos: arreglos de la segunda revision a fondo

La segunda revision a fondo confirmo 46 fallos (cada uno con su verificador).
Arreglados todos; en el codigo los cambios citan esta nota.
- Reglas:
  - El descanso ya no dura 3 s: espera a que los dos pulsen "Segunda parte"
    (la maquina pulsa sola tras sus cambios; online, cuando pulsan los dos),
    como mucho `REGLAS.DESCANSO` (60 s). En el descanso, pulsar a uno de los
    tuyos solo lo elige, para cambiarlo (O-297). La foto lleva `ls` (quien ha
    pulsado).
  - El que saca de banda, de puerta o de corner tiene respiro
    (`RESPIRO_SAQUE`, 2,5 s, como en la falta), y su pase directo no es
    fuera de juego (regla 11) si no se ha ido del sitio (`fueraEnPase`).
  - El fuera de juego se pita tambien si el balon llega al punto del pase al
    hueco antes que el delantero (`balon.fueraDe`; cualquier toque lo borra).
  - En el mismo paso, un duelo ya no pisa un remate de primeras, un saque ni
    un fuera de juego (`_mirarDuelos` solo con el juego en marcha).
  - El portero con el balon en su area no se disputa los primeros
    `PORTERO_MANOS` (6) s: nadie le sale al paso ni se le echa encima (se lo
    quitaban tras la parada y lo empujaban detras de su linea). Tras blocar
    tiene respiro. El empujon entre jugadores ya no saca a nadie del campo.
  - Un punto de ruta tapado por otro jugador cuenta como alcanzado: se
    quedaban clavados con la ruta y sin ir a por el balon.
  - La cadena solo se ofrece a quien puede encadenar (la supertecnica del
    espiritu, solo con el aura).
  - El remate de primeras desde demasiado lejos se avisa y no se anuncia; con
    un tiro largo a punto llega mas lejos, como el tiro (`_alcanceTiro`).
- La maquina:
  - Su portero saca enseguida (al mejor colocado o en largo) y sin ruta: se
    iba con el balon hasta el area rival.
  - Usa todas sus tacticas con efecto (Ataque en tres frentes, Monte Fuji...).
  - Invoca solo si luego le llega para la supertecnica del espiritu, guarda
    tension para ella y la usa. Los focos automaticos de la persona usan la
    misma eleccion.
  - No elige muro y parada (ni tiro y cadena) si no puede pagar los dos.
- Raton y pausa:
  - Pulsar a uno de los tuyos sin balon solo lo elige (antes lo paraba y le
    borraba la ruta).
  - En la pausa, pulsar la porteria marca el tiro (linea naranja), pulsar al
    del balon quita lo marcado y cambiar al que iba el pase lo quita. Con un
    pase de camino, pulsar la porteria deja preparado el remate de primeras.
  - Si al que le pasas le has dibujado una carrera, el pase va al punto de su
    carrera donde le alcanza el balon y la carrera se cumple (solo personas;
    la maquina pasa como antes).
  - Un arrastre que no empieza en un jugador no hace nada (salia un pase al
    hueco). Pulsar a un companero delante de la porteria le pasa (chutaba).
  - Mantener la barra o hacer doble clic ya no gasta pausas ni cambios ni
    elige un comando sin querer; los clics en Invocar y en las tacticas ya no
    se pierden.
- Online:
  - La eleccion del invitado lleva su duelo y se repite cada 1,5 s mientras
    el anfitrion la espera: si se perdia, el partido se quedaba parado.
  - La foto lleva quien pasa (`b[3][5]`: remate de primeras del invitado y
    patada en 3D) y a por quien presiona cada uno (`j[k][9]`: linea roja).
  - Tras un corte largo el invitado ya no se congela: se avisa de los
    sucesos perdidos.
  - Al cerrar la pestana o pulsar Inicio se manda "adios": al otro le sale
    "X ha salido del partido" con "Otro partido".
  - Parado y sin cambios, una foto por segundo, tambien al acabar (O-287).
  - Todo es compatible con un Pizarra anterior en los dos sentidos.
- Pantalla:
  - El poder de cada supertecnica sale en su boton.
  - El campo encoge con la ventana y no se sale por los lados.
  - Columna derecha: Pausa, Tacticas, Tu jugador (pasivas plegadas), Lo que
    pasa y Como se juega. Los avisos de lo tuyo ("demasiado lejos para
    chutar") salen tambien arriba.
  - En el tiro con cadena, el total va en la fila de la cadena y se marca al
    que marca. Los nombres de las supertecnicas salen enteros.
  - Los dos equipos elegidos se recuerdan.
  - El suplente que entra sale con su cara en el campo.
- 3D:
  - Ya no sale en espejo: es el campo de abajo girado.
  - Con el balon pegado a la banda de la camara, la camara va con el (hay
    cesped fuera del campo).
  - Los modelos miran hacia donde se mueven, tambien en el invitado, y la
    animacion de correr no se reinicia en cada cuadro.
  - La columna de los duelos baja sola para que se vean los botones.
  - Las lineas de las rutas ya no dejan memoria sin soltar, el aviso de
    modelos cuenta solo a los que juegan y la cola de modelos atiende primero
    lo ultimo pedido (O-293).
- Medido despues: 11 tiros a puerta y 3,4 goles por partido (medir3).
- Repaso final: el portero solo tiene el balon "en las manos" (6 s sin que
  le salgan) tras una parada o en su saque de puerta, no en un pase atras de
  un companero; el que saca de centro tiene respiro (ya no hay duelos en el
  minuto 0); al acabar el partido sale "Final" aunque el rival se haya ido;
  en la ficha cada supertecnica sale una vez. Medido: 3,2 goles por partido.

### O-306 · El juego de partidos: lo que se ve en los videos de Inazuma

Se estudiaron 5 partidos grabados (Chrono Stones, Galaxy, IE3, GO Light y CS en
frances). Los informes, el plan por prioridad y la critica del plan estan en el
scratchpad (juego/videos/resultado.json). Lo que dependia de Aaron se le
pregunto (sus respuestas, en O-307); aqui va lo que se hizo sin esperar. En el
codigo los cambios citan esta nota.
- Los numeros antes de elegir (los cuatro juegos los ensenan: "Poder de base"
  en CS, "Valeur de base" en el CS frances, la barra Form de Light, IE3):
  - Al empezar un foco o un tiro, el motor guarda en el duelo `base` (lo de
    cada lado sin comando ni tecnica: stats, elemento, pasivas y apoyos) y en
    cada boton `total`. Romper y Entrada dicen "de X a Y" (x0,75 a x1,65),
    Cargar su numero de disputa y la cadena un total por cada tiro
    (`totales`). Va dentro del duelo, que ya viajaba en la foto.
  - Las cuentas estan en `_valorFoco`, `_valorTiro`, `_valorCadena`,
    `_valorMuro` y `_valorParada`, que usa tambien el duelo: el numero del
    panel es el que se juega (12 partidos con semilla dan lo mismo que antes).
    Si se cambian las formulas, hay que hacerlo ahi.
  - Como dijo la critica, un foco tiene dos numeros: si el defensa carga se
    juega la disputa (otros stats); sale en una segunda fila.
  - Panel: bajo las caras, "Poder de base" de cada uno en el color de su
    equipo, los dos elementos y una flecha amarilla hacia el que pierde la
    ventaja (en el tiro solo cuenta la del tirador). Los apoyos que ya habia
    (`apoyos()` da ahora `ids`) salen con sus caras pequenas y "apoyo +x %";
    en el resultado del foco, "pasivas +x % · apoyo +y %".
  - Aproximados: la parada no descuenta lo que paga el muro, el muro aun
    lleva su +-10 % al resolver y los totales del que ataca suponen foco.
- Pase marcado durante el foco (CS frances 9:32, "pase programado"): el que
  lleva el balon puede marcar el pase, el pase al hueco o el tiro como en la
  pausa (`paseMarcado`). Si gana, sale al acabar el resultado; si pierde (o
  hay penalti), se borra. En el duelo de un tiro no se marca nada y el que
  defiende tampoco marca.
- Rotulos grandes en el campo, como el del gol (salen en los cinco juegos):
  "¡Saque!", "Fin de la 1.ª parte", "Fin del partido" y luego "¡Victoria!",
  "Empate" o "Derrota" desde tu lado (este se queda), "¡Fuera de juego!",
  "¡Falta!", "¡Penalti!", "Fuera de banda", "¡Corner!", "Saque de puerta",
  "¡Bloqueo!", "¡Invocacion!" o "¡Miximax Trans!" y "¡Supertactica!". Los
  pone el motor en el suceso (`ro` = {que, lado, sub}): viajan en la foto con
  los sucesos. La banda va del color del equipo al que le toca y no tapa el
  balon; los de jugada son mas pequenos y cortos (el juego no se para, O-307).
  El saque de centro es un suceso nuevo, "Saca de centro <equipo>" (no empieza
  por "Saque de": eso son los fueras que cuentan las medidas).
- Estadisticas en el descanso y al final (las cinco las tienen): tiros
  (tambien bloqueados y penaltis), supertecnicas pagadas, posesion (cada paso
  con el reloj en marcha es del ultimo que toco el balon) y los goles con la
  parte, el minuto y quien (el nombre: tras un cambio el id es otro). En
  `estadisticas`, y en la foto al final como `es`. En el descanso salen en la
  columna de los duelos con el marcador; los cambios y "Segunda parte" siguen
  como en O-305.
- El campo como en 3DS (CS, CS frances, Galaxy, IE3): rutas como flechas
  azules gruesas con punta (la que se dibuja, azul claro); el pase raso, linea
  cian; el bombeado, arco cian con su sombra (el balon va por el arco, que en
  2D se abre de lado para no quedar encima de la sombra); X amarilla donde
  cae; una onda cian donde pulsas (la mirilla de IE3); el jugador de la ficha
  con aro azul que gira y un rombo azul encima (antes aro amarillo); el rival
  al que presionas, con la marca naranja de pinchos; el tiro, un cono cian a
  los palos con la X donde pulsaste. En la 3D igual: cintas en el suelo en vez
  de lineas de 1 pixel, el arco en tubo y el rombo flotando.
- Anillos rojos que se cierran en 0,4 s sobre los dos del foco o sobre el que
  chuta. La critica corrigio el plan: en los videos salen cuando el duelo ya
  ha saltado, no como aviso a 6 m (eso seria un invento; se pregunto).
- Bocadillos de tu equipo: "¡Aqui!" sobre los companeros libres cuando llevas
  el balon (sin rival a 5 m ni cerca de la linea de pase, entre 5 y 38 m y no
  por detras; como mucho 2; constante `AQUI`) y "¡Uy!" sobre el tuyo que
  pierde el balon en un foco o al cortarle un pase (el suceso lleva `pierde`).
  El "¡Regate!" no se hizo.
- Repaso final: el temporizador de un resultado anterior (un foco, 2,2 s) ya
  no esconde el siguiente (un fuera de juego) a los pocos ms: cada resultado
  tiene su turno. En las estadisticas un nombre largo de los goles pasa a dos
  lineas (a 1400 de ancho salia "Lenora Gra..." en casi todos).
- Online: lo nuevo va dentro de lo que ya viajaba (`base` y `total` en el
  duelo, `ro` y `pierde` en los sucesos) o al final (`es`). Un Pizarra
  anterior lo ignora; con un anfitrion anterior no sale nada de esto (ni
  barra, ni totales, ni rotulos, ni estadisticas) y el pase marcado en un
  foco lo rechaza.
- Medido: prueba3ds 172 OK; fotos del invitado iguales (2545 bytes de media,
  antes 2364); medir3 13,8 tiros y 3,17 goles por partido, como antes. Pintar
  el campo 2D cuesta ~0,2 ms por cuadro.
- Queda, por las respuestas de O-307: gana el numero mayor (90-10) con
  critico, zoom del campo, "Jugar" antes de cada saque, invocar e
  hipertecnicas en el duelo, el tiro que viaja con bloqueos, el reloj de
  cada parte y las tacticas sin parar el juego.

### O-307 · El juego de partidos: como se juega, segun Aaron (2026-10-05)

Respuestas de Aaron tras el estudio de los videos (O-306). Mandan sobre lo
anterior:
1. Campo de abajo con ZOOM siguiendo al balon, como la tactil de 3DS, y con
   las flechas del teclado se puede mover la camara. Arriba, el mapa del
   campo entero (y lo demas de la pantalla de arriba de 3DS).
2. Pausa tecnica: sin limite (de momento).
3. Antes de cada saque se espera a que los dos den a "Jugar", sin limite (de
   momento).
4. Duelos sin supertecnica: se quedan Regatear/Romper y Tapar/Entrada/Cargar.
5. Tiros sin supertecnica: Vaselina = balon bombeado, puede pasar por encima
   de los defensas si no estan encima del que chuta; Testarazo/Volea igual con
   el balon alto. Portero: Parar = se la queda; Despejar = la despeja y rebota
   a donde sea.
6. Quien gana: 90-10. Casi siempre el numero mas fuerte, pero puede haber un
   critico y ganar el otro.
7. Espiritus: NO gastan tension, gastan HIPERTENSION, como en VR; la
   hipertension se consigue haciendo supertecnicas. En VR se puede invocar en
   mitad de un duelo. Si usas espiritu, mixi max o cualquier hipertecnica y el
   rival no (o usa supertecnica), ganas siempre el duelo; si los dos usan
   hipertecnica, duelo de poder: gana el que mas tiene. Revisar en VR como va.
8. Duracion de cada parte: elegir 15 o 30 (reloj de 3DS). En empate: elegir
   penaltis, prorroga o nada (todo elegible).
9. Cambios: se eligen en la pausa, pero no se aplican hasta que el balon se
   para (fuera, falta, gol...), como en la vida real.
10. Supertacticas, invocar e hipertecnicas: como en VR, cada uno cuando
    quiera sin parar el juego; en un duelo, como en el punto 7.
11. Colores: da igual.
Ademas: todo con la estetica y el layout de los juegos antiguos (que se
entienda), y las reglas como en la vida real.
12. Tarjetas: en VR hay tarjetas al hacer faltas, pero es raro: ponerlas con
    poca probabilidad. Ley de la ventaja: no.
13. (Al probar la version de O-306) En 3DS se juega EN la pantalla de los
    modelos 3D: el campo vertical en 3D, cerca del balon. El campo plano con
    las fichas es solo el mapa (la vista previa). Rediseñar asi.
14. En los saques (fuera, falta, corner...) se puede colocar a los jugadores
    donde sea antes de dar a Jugar, menos demasiado cerca del balon.
15. El rediseño de las pantallas: copiar LITERALMENTE Inazuma Eleven GO
    Galaxy (el ultimo de 3DS): estetica, layout, graficos y todas las
    animaciones que se ven en los videos (entrar en duelo, chutar, las
    supertecnicas...). Con dibujo y codigo propios: no hay ni se usan
    ficheros de Galaxy; los modelos 3D son los de VR de cada PC.
16. Cambios: como en VR, y el que sale no vuelve a entrar. Lo que dice VR
    (textos de ayuda del juego): se cambia desde la formacion solo con el
    juego parado (balon parado o descanso); tras un cambio el que entra
    tiene AT y DF +15 % durante 60 s y los de su misma posicion +5 %; cada
    cambio suma 30 s de descuento (uAddAdditionalTimeOfPlayerChange); el
    expulsado no se puede sustituir. No sale un maximo de cambios: con el
    banquillo de 5 y sin volver a entrar, como mucho 5.
17. Duracion de las hipertecnicas: igual que en VR (sin acortar).
18. Critico: como esta (deja de haberlo cuando un numero triplica al otro).

### O-308 · El juego de partidos: el ritmo de 3DS (reloj, pausa, saques, cambios) y la version online

Primer encargo del diseno de las reglas de Aaron (O-307 puntos 2, 3, 8 y 9;
scratchpad juego/reglas-vr/DISENO.md, seccion 3). En el codigo los cambios
citan esta nota.
- El reloj de 3DS: al elegir equipos, "2 x 15 min" (por defecto) o "2 x 30
  min" (lo guardado de antes, 2 x 3/5/8 minutos reales, pasa a 15). El reloj
  va a 12 s por segundo real (`REGLAS.RELOJ_RITMO`): una parte de 15 son 75 s
  de juego corriendo. En el marcador "1ª 07:32"; cada parte empieza en 00:00.
  En "Lo que pasa" y en las estadisticas, "1ª 7'" (el minuto dentro de la
  parte).
- Si a las 15:00 el balon esta en juego, la parte sigue hasta que se pare
  (fuera, falta, gol, fuera de juego o el portero con el balon en las manos),
  como mucho hasta las 17:00 (`FIN_PARTE_EXTRA`, 120 s de reloj; 0 = corta en
  seco). Un penalti pitado se tira antes.
- La pausa, sin limite de veces ni de tiempo. La puede pedir cualquiera y el
  partido sigue cuando han pulsado "Seguir" los dos (contra la maquina, al
  pulsar tu). Online, al que ya ha pulsado le sale "Esperando a X...".
- Antes de CADA saque (de centro al empezar y tras un gol, banda, corner,
  puerta, falta, fuera de juego y penalti), tras su rotulo, el juego espera con
  todos colocados y el balon a los pies del que saca: se dibujan rutas, se marca
  el pase (o el tiro de la falta) del que saca y se hacen cambios; "Jugar" (o
  la barra espaciadora) y, online, cuando pulsan los dos. En el penalti no se
  marca nada: al pulsar Jugar se tira. La segunda parte no espera dos veces (el
  descanso ya es su espera). El silbato suena al pulsar Jugar (ya no al salir
  del gol) y en la 3D todos miran al frente un momento.
- Los cambios: 5 por partido (antes 3). Boton "Menu" en la pausa, en la espera
  del saque y en el descanso: tus jugadores con "Cambiar" (salen los suplentes
  libres) y los pendientes con "Quitar". En la pausa, con el balon en juego, el
  cambio queda pendiente ("Cambio preparado: entrara X por Y cuando se pare el
  balon", que solo ve su equipo) y entra en la siguiente parada; en el saque y
  en el descanso entra ya. Rotulo pequeno "Cambio" en el campo. La ficha sigue
  sirviendo para cambiar. El banquillo es de 5: con 5 cambios puede entrar
  entero.
- El descanso, sin limite de tiempo (antes un minuto).
- Online: `REGLAS.VERSION` 2 en la presencia, la invitacion y la respuesta. Con
  otra version: "otra version del Partido" e Invitar apagado; la invitacion sale
  con "X tiene otra version del Partido: actualizad Pizarra los dos" y solo
  "No"; si acepta un Pizarra anterior, no se entra y se le manda "adios". **Aaron
  y su amigo tienen que tener los dos este Pizarra** (cada encargo siguiente
  sube la version). La foto lleva al final la espera del saque (`sq`), su numero
  (`ne`) y los cambios pendientes del invitado (`pc`; los del anfitrion no se le
  ensenan). El "Jugar" del invitado lleva el numero de su espera (uno que llega
  tarde no cuenta en la siguiente) y se repite cada 1,5 s hasta que llega.
  Orden nueva `quitarCambio`.
- Online, que no se cuelgue: si el rival lleva un minuto sin dar senales (o sin
  pulsar Jugar/Seguir), sale "X no responde" y el boton "Dejar el partido"
  (manda "adios", como Inicio); si vuelve a responder, el aviso se quita y se
  sigue. No se le da por ido solo: el navegador para una pestana oculta y se
  perderian partidos buenos. **El que invita no debe minimizar Pizarra**: su PC
  lleva el partido y con la pestana oculta se para.
- Medido (scratchpad prueba/medir-vr.js, 12 partidos maquina contra maquina):
  en 2 x 15, 5,5 tiros a puerta y 1,67 goles por partido (~220 s de
  simulacion); en 2 x 30, 11,7 tiros y 3,25 goles. Con partes de 180 s como
  antes (medir3 MITAD=180), 14,4 tiros y 3,58 goles (el motor anterior: 13,8 y
  3,17; con otras semillas, de 3,2 a 4,25). Los goles de 2 x 15 se ajustan en
  el siguiente encargo (quien gana y los tiros). 17 de cada 24 partes llegan al
  tope de las 17:00: en el Partido el balon casi nunca sale (0,08 fueras por
  partido) y los focos no paran la parte.
- Pruebas: prueba3ds 175 OK. Se cambiaron las que miraban las reglas viejas
  (las 3 pausas, la pausa que se acababa a los 20 s, el cambio en el acto en la
  pausa, el descanso de 60 s, el minuto del gol de 0 a 90) y a varias se les
  dio un paso tras "Seguir" (la maquina se da por lista en el primer paso de la
  espera); fotos.js aplica la foto del final (el partido ya acaba antes de sus
  9000 pasos). Nuevas: prueba-e1.js (98 OK), comun-vr.js y medir-vr.js. Sin las
  esperas y sin alargar la parte, el motor da los mismos sucesos que el
  anterior en las primeras partes de los 12 partidos de medir3.
- A confirmar con Aaron: 5 cambios o 3; seguir hasta las 17:00 o cortar a las
  15:00; que la pausa la quiten los dos; el descanso sin limite; "Dejar el
  partido" al minuto.

### O-309 · El juego de partidos: quien gana (90-10 con critico) y los tiros y paradas de 3DS

Segundo encargo del diseno de las reglas de Aaron (O-307 puntos 5 y 6;
scratchpad juego/reglas-vr/DISENO.md, seccion 4). En el codigo los cambios
citan esta nota.
- Quien gana (Aaron: "90-10"): en cada foco, disputa, bloqueo del muro y tiro
  contra el portero gana el numero mayor (el del panel, redondeado). A veces hay
  un critico y gana el otro: el 10 % con numeros parecidos (hasta 1,5 veces),
  cada vez menos, y nada a partir del triple (`REGLAS.probCritico`: 1600 contra
  900, el 8 %; 2000 contra 900, el 5 %). Con los dos numeros iguales, a cara o
  cruz. El critico es invento de Aaron: los "critical" de los datos de VR son
  del minijuego RPG. Una sola funcion en el motor, `_decidir(a, d)`, que usaran
  tambien la hiper contra hiper y los penaltis. Se borraron `probabilidad` (la
  de A^3 de IE3), `probabilidadTiro` (a la quinta, O-302), `TIRO_EXPONENTE` y
  `AZAR` (el +-10 % del muro): el numero del panel es el que se juega.
- Nunca se ve ganar al numero pequeno: el que gana por critico ensena el numero
  del otro x1,05 a x1,20 (`CRITICO_SUBE`) y el suyo de verdad va en `antes`. En
  el resultado su numero sube hasta el suyo, sale "¡Crítico!" en amarillo encima
  y salta por encima del otro; en el campo, el rotulo pequeno "¡Crítico!" a la
  vez (no antes: lo destripaba); en "Lo que pasa", "(¡crítico!)"; y en las
  estadisticas del descanso y del final, una fila "Críticos" por equipo.
- El muro: si gana el bloqueo, para el tiro, como antes; si pierde, el tiro
  sigue con la mitad del numero del muro de menos (`MURO_RESTA`; VR: el bloqueo
  resta al tiro). Antes se jugaba con +-10 % y solo bloqueaba con 1,25 veces el
  tiro. En el resultado, la fila del tiro ensena su numero contra el muro y luego
  baja ("le quita X al tiro"); con muro las filas salen mas despacio.
- Los tiros sin supertecnica, con los botones de 3DS (O-307 punto 5): con el
  balon en el suelo, Tirar (Potencia + Control, el de siempre) y Vaselina (x0,8,
  pero pasa por encima del defensa de la linea de tiro si esta a mas de 2,5 m del
  que chuta: no juega ni paga su supertecnica; tras una vaselina no se
  encadena). Rematando de primeras un pase bombeado, Testarazo (Potencia +
  Fisico) y Volea (lo mismo, pero fuerte e inestable como Romper: x0,75 a x1,65,
  "de X a Y" en el boton). El portero: Parar (se la queda, como antes) y
  Despejar (x1,25, pero no se la queda: el balon sale desde 1,5 m del portero
  hacia el campo, hasta 100 grados a cada lado y a 10-18 m/s; le puede caer a
  un rival o irse por la banda o a corner). Las supertecnicas de despeje o de
  puno rebotan igual, sin el x1,25 (antes iban siempre hacia delante). El
  penalti, hasta que llegue el suyo, con Tirar y Vaselina y sin muro.
- En el panel del tiro: "Balón alto: ..." al rematar un pase bombeado y, con un
  defensa en la linea, si la vaselina le pasa por encima o "está pegado a ti:
  también para la vaselina". El que defiende, que no sabe lo que le van a tirar:
  "¿bloquea? (si es vaselina, pasa por encima)" o "(está pegado: para también la
  vaselina)". "Vaselina" es tambien una supertecnica de VR (rhs10010; la lleva
  Briar Bloomhurst): sale como "Vaselina (técnica)". La ayuda "Como se juega"
  explica el critico, los cuatro tiros y las dos paradas.
- La maquina, si no usa supertecnica: con un defensa en la linea que no esta
  pegado, vaselina el 60 % de las veces; con el balon alto, volea el 40 %; de
  portero, despeja si el poder de base del tiro pasa del 90 % de su Parar.
- Online: lo nuevo va dentro de lo que ya viajaba (en el duelo `alto` y
  `muroPegado`; en el resultado `critico` y `antes`, y en sus pasos `contra`,
  `resta`, `critico`, `antes` y `encima`; `criticos` en las estadisticas). La
  eleccion del tiro y de la parada se comprueba contra las opciones del duelo:
  una Volea sin balon alto o un Despejar en un foco valen como lo seguro.
  `REGLAS.VERSION` 3: **Aaron y su amigo tienen que tener los dos este
  Pizarra**.
- Equilibrio (scratchpad prueba/medir-vr.js, maquina contra maquina, 2 x 15). Con
  las reglas de antes salian 5,5 tiros a puerta y 1,67 goles por partido (O-308);
  con el 90-10 y la maquina y el portero de antes, 6,8 tiros y 1,0 goles (solo
  el 14 % de los tiros pasaba de la parada). Se cambio primero la maquina, que
  chuta mas (`IA_TIRO`: a menos de 22 m, el 30 % cerca, el 12 % con la linea
  libre y el 2 % tapado; antes 18 m, 15 %, 5 % y 0), y luego el portero
  (`KP_ESCALA` 0,30; antes 0,42). Medido con 32 partidos: 9,8 tiros a puerta y
  3,5 goles por partido, el 35 % de los tiros por encima de la parada; de los
  focos y disputas parejos (hasta x1,5) el 10,2 % se gana por critico (2,5
  criticos por partido). Goles por tramos de AT/parada: menos de 0,5, el 3 %;
  0,5-0,75, el 4 %; 0,75-1, el 7 %; 1-1,33, el 92 %; mas de 1,33, el 91 %. El
  muro: 1,1 tiros con muro y 0,25 bloqueos por partido (la critica del diseno
  calculaba ~0,1 con la regla de antes y ~0,3 con esta: casi no cambia); 0,3
  vaselinas por encima. La maquina elige Despejar en 4 de cada 10 tiros (1,8
  despejes que paran por partido). En 2 x 30: 18,7 tiros y 6,7 goles. medir3
  (sin esperas): 9,9 tiros y 3,4 goles. Con el 90-10 el equipo mejor gana mas
  (salio un 0-7): es lo que pide Aaron.
- Pruebas: prueba3ds 175 OK (se cambiaron tres: las que comparan el numero del
  panel con el del resultado miran el de verdad, `antes`, cuando hay critico, y
  las estadisticas empiezan tambien con `criticos`); prueba-e1 98 OK (la version,
  2 o mas); nueva prueba-e2.js (68 OK: probCritico, 20.000 decisiones al 90 %,
  400 focos, los botones, la vaselina y el muro a 5 y a 2 m, 500 despejes con
  corners, lo que resta el muro, 500 tiros parejos con ~10 % de criticos, la
  maquina, el online y el rotulo); fotos del invitado iguales. medir3 y medir2
  leen ahora los numeros de verdad del resultado (el texto ensena los del
  critico) y medir-vr acepta `SEMILLAS=8`. Capturas en el navegador: el panel
  del tiro, la vaselina por encima del muro, un foco, un tiro (pasa el muro y
  gana al portero) y una parada con "¡Crítico!", Parar/Despejar con el muro y
  las estadisticas.
- A confirmar con Aaron: el critico que baja hasta nada al triple (¿o el 10 %
  siempre?); la vaselina (x0,8, a mas de 2,5 m), el testarazo con el Fisico, la
  volea como Romper, el despeje (x1,25 y 100 grados) y que el muro que pierde le
  quite al tiro la mitad de su numero.

### O-310 · El juego de partidos: la hiperbarra, los espiritus y las hipertecnicas (con la tension y el coste de VR)

Tercer encargo del diseno de las reglas de Aaron (O-307 puntos 7 y 10;
scratchpad juego/reglas-vr/DISENO.md, seccion 5; los numeros de VR, en
reglas-vr/HIPERTENSION.md). En el codigo los cambios citan esta nota.
- La hiperbarra (Aaron: los espiritus no gastan tension sino hipertension, como
  en VR): una por equipo, de 0 a 200, empieza en 40. Se llena SOLO usando
  supertecnicas, con lo que cuestan: x0,4 un tiro (tambien la cadena y el
  contra-tiro), x0,6 un regate, x0,8 una defensa (y el bloqueo) y x1,0 una
  parada. Las "habilidades reales" de VR (Vaselina, Tiro con efecto...: nombre
  interno rh*) no llenan nada, y ganar o perder duelos tampoco (VR game_param).
  En la ficha, bajo la tension: "Hiperbarra 140 / 200", con una barra morada
  partida en dos mitades (cada mitad, una invocacion).
- Invocar un espiritu (una hipertecnica) gasta 100 de hiperbarra y nada de
  tension, cuando quieras y sin parar el juego (O-307 punto 10): con el balon en
  juego, en la pausa y en la espera del saque. Sale el rotulo pequeno de su
  familia ("¡Invocación!", "¡Miximax Trans!", "¡Armadura!", "¡Tótem!",
  "¡Despertar!", "¡Cambio de modo!", "¡Vínculo!") y en "Lo que pasa" "¡X invoca a
  Y! (hiperbarra 140 → 40)". Como mucho 2 del mismo equipo con la hiper puesta y
  15 s entre una invocacion y otra del equipo (la comunidad de VR). Si no se
  puede, el boton dice por que: "faltan 30 de hiperbarra", "ya hay 2 activos",
  "espera 9 s (acaba de invocar un compañero)", "vuelve en 40 s", "activo 32 s".
  En un duelo, desde su panel (abajo).
- Cada familia, con los numeros de VR (REGLAS.HIPER_TIPOS; AURA_CMD_INFO_LIST y
  AURA_CMD_EFFECT_LIST), en segundos de juego sin escalar: keshin, dura 45 s y
  vuelve 60 s despues, AT y DF +50 %; armadura 45 + 60, +30 % y el poder de sus
  supertecnicas +50 %; miximax 45 + 60, +50 % y poder +20 %; totem 60 + 60, +35 %
  y +20 % mas por cada foco que gana con el puesto (35, 55 y 75 %; lo ganado lo
  guarda para la siguiente vez); vinculo 60 + 60, +10 % y poder +20 %; despertar
  30 + 90, +30 % y poder +30 %; cambio de modo 75 + 90, +60 %. Con la hiper
  puesta corre un 10 % mas (VR no da el numero), y un portero de keshin,
  armadura, miximax o totem suma a su parada el 15 % de su KP maximo. Lo propio de
  dos despertares: Determinacion de portero, parada +20 %; Guardian ferreo, DF
  +20 % y muro +30 % (los otros tres ya lo llevan en su pasiva). Las mejoras van
  fuera del tope de las pasivas. Antes eran 30 s y +25 % para todos. El vinculo no
  se convierte en el companero ni el modo cambia de forma: solo sus %. El tipo de
  cada espiritu lo pone partido.py (familia y modelo de espiritus.csv) junto con
  su id. En el campo, el aura sale del color de su familia (keshin morado,
  armadura gris azulado, miximax amarillo, totem verde, despertar naranja, modo
  rojo, vinculo turquesa), con un borde para que se vea sobre el cesped.
- La pasiva del espiritu (la de los keshin y de tres despertares) solo cuenta con
  su hiper puesta, como en VR (antes contaba siempre): llega marcada desde
  partido.py y en la ficha sale "(de su espíritu: con la hiper puesta)". Lo mismo
  la de "cuando el equipo gana en foco o disputa, tension".
- En un foco, si tu jugador tiene espiritu y no lo tiene puesto, un boton morado
  mas, el ultimo: "★ <espiritu> · gana el duelo · 100 de hiperbarra" (apagado y
  con lo que falta si no se puede). Si lo eliges y el rival no saca otra, **ganas
  siempre** (aunque el rival use una supertecnica, tambien la de un keshin ya
  invocado, o Cargar), nunca es falta, tu hiper queda puesta y no cobras tension;
  el rival se lleva +30 (y si eligio una supertecnica, la paga). En el resultado,
  tu fila dice "¡Hipertécnica!" con una estrella en vez del numero, y en el campo
  sale el rotulo "¡Hipertécnica!". Si los dos la sacan, duelo de poder: cada uno
  con su foco sin tecnica como si ya tuviera la hiper puesta (el numero del boton,
  "contra hiper X"); gana el mayor con el 90-10 y el que pierde no la paga. Si uno
  ya la tenia puesta y el otro la saca, foco normal (el de la ya puesta juega lo
  que eligio; con Cargar, la disputa): si gana el que la saca, la paga. La ya
  puesta contra nada no gana sola: solo suma sus %. Online, un "hiper" sin barra
  al resolver vale como Regatear o Tapar.
- En el tiro no hay victoria automatica (en VR es solo de los focos): el que chuta
  y el portero ven arriba del panel "Invocar <espiritu>" (100 de hiperbarra). Al
  pulsarlo se invoca en el acto y el panel se rehace con los numeros nuevos y, si
  la tiene, la supertecnica de su espiritu (✦). Al otro, si estaba eligiendo, se
  le rehace el panel con "El rival ha invocado: los números han cambiado." y
  vuelve a la primera lista.
- La tension como en VR (antes empezaba en 120, subia 0,6 por segundo y 60 en el
  descanso): empieza en 105, no sube sola ni en el descanso; ganar un foco o
  disputa sin tecnica ni hiper, +60; perder un foco, +30 SIEMPRE (tambien con
  tecnica o contra una hiper; antes nada si usaba tecnica); perder una disputa,
  nada (antes +30); y +10 al equipo al que le pitan un fuera de juego a favor.
- El coste de las supertecnicas es el de VR. La columna `tp` de tecnicas.csv no es
  el coste sino el poder a nivel 1 (power_min); el coste es consumeTp (campo 17
  de m_skillInfoList). herramientas/construir_tecnicas.py la escribe en una
  columna nueva `coste` al final y tecnicas.csv se ha regenerado: solo cambia esa
  columna (comprobado fila a fila contra el commit anterior). Solo la usa el
  Partido (partido.py): un tiro keshin de 800 cuesta 100 (antes 140), uno de 540
  cuesta 80 (antes 85), las habilidades reales 40 (antes 30). OJO, para otro dia:
  el "TP" que ensena el editor (fichas, base de datos) sigue siendo el poder a
  nivel 1, no lo que cuesta.
- Las tacticas se lanzan tambien en la pausa y en la espera del saque (el
  "Tactica" del Menu de 3DS), no en un duelo; su tiempo empieza a contar al
  volver el juego. Las que quitan el balon o aturden, solo con el balon en juego
  (en una espera se lo quitarian al que va a sacar): salen apagadas con "solo con
  el balón en juego".
- La maquina: en un foco que importa (defiende en su tercio o ataca a menos de 30
  m de la porteria rival) saca la hiper si su mejor total no llega al poder de
  base del rival x1,05, el 60 % de las veces (el 80 % con la barra llena). En un
  tiro, su portero invoca si el tiro viene mas fuerte que su mejor parada, y el que
  chuta si tiene el tiro de su espiritu y tension para el; elige en el siguiente
  momento, con los numeros nuevos. Fuera de los duelos invoca al del balon cerca
  del area o al que defiende cerca del balon si le llega la tension para su
  tecnica ✦, y si no tiene ✦, solo con la barra llena. El ayudante de "focos
  automaticos" nunca usa la hiperbarra: la gasta la persona.
- En las estadisticas del descanso y del final, una fila "Hipertécnicas"
  (invocaciones de cada equipo). La ayuda "Como se juega" explica la tension, la
  hiperbarra, el boton ★ y las tacticas en las esperas.
- Online: la foto lleva al final la hiperbarra (`hb`), hasta cuando no puede
  invocar cada equipo (`hk`) y el totem de cada jugador (`j[k][10]`); el resultado
  de un foco, `hiper` (el lado que gano con la estrella) y `hipers`; el duelo del
  tiro, `v` y `vLado` con las opciones rehechas; las estadisticas, `hiper`. Las
  pasivas viajan con su marca de espiritu y el espiritu con su `id` y su `tipo`.
  `REGLAS.VERSION` 4: **Aaron y su amigo tienen que tener los dos este Pizarra**.
- Medido (scratchpad prueba/medir-vr.js, ahora con los equipos _vr, que llevan el
  coste de VR, el tipo de cada espiritu y la marca de sus pasivas; 32 partidos de
  2 x 15, maquina contra maquina). Con el motor del O-309 y los _vr: 9,6 tiros a
  puerta y 3,31 goles por partido. Con todo esto: 9,8 tiros y 3,53 goles, el 35 %
  de los tiros por encima de la parada. Unas 6 invocaciones por partido entre los
  dos: 1,7 en focos ganados con la estrella, 0,2 duelos de poder, 1 en tiros y el
  resto con el balon en juego; ~20 supertecnicas pagadas y ~370 de hiperbarra
  ganada por equipo; tension media con el balon en juego ~90 por equipo. medir3
  (equipos de antes, sin esperas): 9,5 tiros y 3,9 goles; medir2, 3,9 goles. En 2 x
  30: 19 tiros y 7,3 goles.
- Pruebas: prueba3ds 175 OK (se cambiaron cuatro por las reglas nuevas: la de la
  maquina que invoca, que ahora necesita 100 de hiperbarra y la tension justa para
  su tecnica y no gasta tension; la del rotulo de invocar, que necesita hiperbarra;
  las estadisticas, que empiezan tambien con `hiper`; y el "Romper de X a Y", con
  +-1 de redondeo: la pasiva del keshin ya no cuenta sin la hiper, la base cambio y
  caia justo en el medio); prueba-e1 98 OK; prueba-e2 68 OK (la version, 3 o mas);
  nueva prueba-e3.js 88 OK (la barra y como se llena, invocar y sus limites, las
  7 familias, la ★ en 200 focos, hiper contra hiper en 400, contra una ya puesta,
  la pasiva del espiritu, el totem, invocar en el tiro, el portero +15 y +20 %, la
  tension, tecnicas.csv contra el commit anterior, los equipos _vr, las tacticas
  en las esperas, el online con un partido entero por la foto y la maquina);
  fotos del invitado iguales. Los equipos nuevos son `*_vr.json`; los de siempre
  se quedan como estaban (prueba3ds depende de ellos). Capturas en el navegador
  (scratchpad juego/cdp, e3_*.png): la ficha con la hiperbarra en el saque, la
  tactica lanzada en el saque, el foco con el boton ★ y su resultado
  "¡Hipertécnica!", el tiro con Invocar arriba y tras invocar, el aviso de que el
  rival ha invocado, las auras de cada familia y las estadisticas del descanso.
- A confirmar con Aaron: la hiperbarra de 0 a 200, empezando en 40 y 100 por
  hiper; los 2 activos y los 15 s; hiper contra hiper con el 90-10 (y que el que
  pierde no paga); hiper contra una ya puesta como un foco normal; las duraciones
  de VR sin escalar (un keshin de 45 s es mas de media parte de 15); que la pasiva
  del keshin solo cuente con la hiper puesta; la tension exacta de VR; el coste de
  VR; vinculo y modo solo con sus %; el +10 % de velocidad; que el que pierde
  contra una hiper pague su supertecnica; y que en el tiro invocar no gane solo
  (en VR la victoria automatica es solo de los focos).

### O-311 · El juego de partidos: las tarjetas (amarilla, roja y el expulsado)

Cuarto encargo del diseno de las reglas de Aaron (O-307 punto 12: "en VR hay
tarjetas al hacer faltas, pero es raro: ponerlas con poca probabilidad"; scratchpad
juego/reglas-vr/DISENO.md, seccion 6). En el codigo los cambios citan esta nota.
- En cada falta, una tirada (`REGLAS.TARJETAS`): amarilla en el 20 % de las faltas
  normales (VR: yellowCardRate 0,2) y en el 35 % de las fuertes (con Entrada o en el
  area); roja directa en el 0,5 % y el 3 %. Dos amarillas son roja. No se expulsa a
  nadie de un equipo que tiene menos de 8 en el campo (VR: enableRedCardMemberNum 8;
  nunca baja de 7): se queda en amarilla y "Lo que pasa" lo dice. Las faltas no
  cambian (22 % Entrada, 12 % Cargar) y no hay ley de la ventaja (la falta se pita
  siempre, como ya era).
- Lo que se ve: detras del rotulo de la falta, "¡Tarjeta amarilla!" o "¡Tarjeta
  roja!" con el nombre (en la banda del color de su equipo); en "Lo que pasa", en
  amarillo o en rojo ("¡Segunda amarilla para X: tarjeta roja! Expulsado: Marineros
  juega con 10"); en el panel de la falta, con la tarjetita de su color, "Tarjeta
  amarilla para X", "¡Roja! X expulsado" o "¡Segunda amarilla! X expulsado". En la
  ficha, "Tarjeta amarilla: otra sería roja" o "Expulsado (roja): ya no juega y no se
  le puede cambiar" (sin botones). En el campo, una tarjetita amarilla arriba a la
  izquierda de la cara; en la 3D, junto a la cabeza. En el Menu, los expulsados al
  final y apagados. En las estadisticas del descanso y del final, filas "Amarillas" y
  "Rojas" si ha habido alguna (la segunda amarilla de un jugador cuenta tambien como
  amarilla, como en el futbol). La ayuda "Como se juega" lo explica.
- El expulsado sale del campo (fuera de su banda) pero sigue en `jugadores` con su id
  (la foto, los cambios y las ordenes van por el). `enCampo()` y `equipo()` lo dejan
  fuera: no cuenta para apoyos, companeros de una supertecnica, muro, cadena, pasivas
  del equipo, la linea del fuera de juego (se calcula con 10) ni la maquina; no se
  mueve ni empuja, no coge el balon, no tiene duelos, no vuelve en los saques, no se
  le pinta ni en 2D ni en 3D y no se le puede elegir. No acepta ordenes ni pases, no
  puede invocar, no se le puede cambiar y su cambio pendiente se quita. Si era el
  portero, el de campo con mejor KP (empate: el de menor id) pasa a portero con el KP
  lleno y va a su porteria ("X se pone de portero"). En el Partido el portero no hace
  faltas nunca (no defiende focos): eso es por si acaso.
- La maquina: un defensa suyo con amarilla entra fuerte (Entrada) la mitad de veces
  (el 20 % en vez del 40 %).
- Online: la foto lleva al final, por jugador, `j[k][11]` (0 nada, 1 amarilla, 2
  expulsado); el invitado repite la roja con `_expulsar` sin apuntar nada y sin azar,
  asi le sale el mismo portero nuevo. El resultado de la falta lleva `tarjeta` y las
  estadisticas `amarillas` y `rojas`. `REGLAS.VERSION` 5: **Aaron y su amigo tienen
  que tener los dos este Pizarra**.
- Medido (scratchpad prueba/medir-vr.js, 32 partidos de 2 x 15, maquina contra
  maquina): 0,56 faltas, 0,16 amarillas y 0 rojas por partido, o sea una amarilla
  cada 6 partidos y una roja casi nunca (el diseno calculaba una cada 50-150
  partidos); 3,59 goles y 9,9 tiros (antes 3,53 y 9,8: la tirada de cada falta cambia
  un poco el azar de despues). En 2 x 30 (16 partidos): 2,2 faltas, 0,56 amarillas y
  0,06 rojas; 7,1 goles. medir3, 3,75 goles; medir2, 3,8.
- Pruebas: prueba3ds 175 OK (se cambiaron dos: las estadisticas empiezan tambien con
  `amarillas` y `rojas`, y la del rotulo de la falta busca el suceso de la falta y no
  el ultimo: detras puede ir el de la tarjeta, y con su semilla sale una amarilla);
  prueba-e1 98 y prueba-e2 68 OK; prueba-e3 88 OK (se cambiaron dos: la version, 4 o
  mas, y la foto de cada jugador, 11 datos o mas); nueva prueba-e4.js 65 OK (la
  tirada en 20.000 faltas de cada clase, la segunda amarilla, el minimo de 7, el
  expulsado, el portero expulsado y el invitado con el mismo portero, la linea del
  fuera de juego, la falta con su tarjeta, la maquina, un partido entero online con
  muchas tarjetas y la pantalla 2D); fotos del invitado iguales. Capturas en el
  navegador (scratchpad juego/cdp, e4_*.png y e4_3d_*.png): la amarilla (panel,
  rotulo, ficha y la tarjetita en el campo y en la 3D), la roja (panel, rotulo y el
  rival con 10, tambien en la 3D), la segunda amarilla (ficha y Menu) y las
  estadisticas del descanso.
- A confirmar con Aaron: los numeros (amarilla 20 % y 35 %, roja directa 0,5 % y
  3 %), que no se expulse con 7 y si las faltas siguen como ahora o como VR (15 % al
  arriesgar). Con partes de 15 hay poco mas de media falta por partido, asi que sale
  una amarilla cada 5 o 6 partidos y una roja casi nunca.

### O-312 · El juego de partidos: el empate (prorroga y penaltis) y el equilibrio final

Quinto y ultimo encargo del diseno de las reglas de Aaron (O-307 punto 8: "en empate:
elegir penaltis, prorroga o nada"; scratchpad juego/reglas-vr/DISENO.md, seccion 7). En
el codigo los cambios citan esta nota.
- Al elegir equipos, "Si hay empate": Nada (por defecto), Prórroga, Penaltis o Prórroga
  y penaltis (como las reglas A/B/C de GO Light). Se recuerda; online vale la del que
  invita (va en el mensaje `equipos`). `REGLAS.EMPATE`.
- La prorroga: si al acabar la 2.ª parte hay empate y se eligio, rotulo "Fin del tiempo
  reglamentario" y un descanso como el de la media parte (estadisticas, Menu, y el boton
  "Prórroga"; online, los dos). Dos partes de un tercio de las normales
  (`PRORROGA_FRACCION`: 5:00 en partes de 15, 10:00 en las de 30; VR:
  soccerExtraTimeDefault 30 de 90), con el rotulo "¡Prórroga!" y el reloj "1ª pr. 03:12"
  / "2ª pr.", otro descanso entre ellas (boton "Seguir") y cambio de campo en cada parte.
  Cada equipo tiene un cambio mas (`CAMBIOS_PRORROGA`; el Menu dice "te quedan 6 de 6").
  Sin gol de oro. Como las partes normales, si a las 5:00 el balon esta en juego sigue
  hasta que se pare (como mucho 2:00 de reloj mas). Las pasivas "en la segunda parte"
  siguen valiendo en la prorroga. Todo sale de `_finDeParte()`, el unico sitio que decide
  que viene tras una parte.
- La tanda de penaltis (tras la 2.ª parte con "Penaltis", o tras la prorroga con
  "Prórroga y penaltis"): rotulo "¡Penaltis!" y dos pitidos. El orden es automatico: los
  de campo con mas tiro primero (su AT de tiro mas su mejor supertecnica de tiro) y el
  portero el ultimo, sin expulsados y los mismos de cada equipo (si uno juega con 10, el
  otro deja fuera a su peor tirador). Empieza el que sale en un sorteo y tiran por turnos:
  5 cada uno, se acaba antes si uno ya no puede alcanzar al otro y, si siguen empatados,
  muerte subita por parejas (vuelven a tirar los primeros). Los porteros empiezan con el KP
  lleno y en la tanda no se cansan. El que tira va al punto, el portero a su linea y los
  demas al centro, en dos filas.
- Cada penalti (tambien el de una falta en el area, tras su espera de "Jugar"): el que
  tira y el portero eligen a la vez una zona (izquierda, centro o derecha, como se ve en
  SU pantalla) y, si quieren, una supertecnica (de tiro o de parada, o "Tirar"/"Parar").
  Si el portero se tira a otra zona, gol; si acierta, gana el numero mayor con el 90-10
  (el tiro desde 11 m con su elemento contra la parada, como el tiro normal). En el panel:
  el tablero (en la tanda), las caras, el poder de base, las supertecnicas con su total
  (se marca una) y los tres botones de zona. En el resultado, "X tira a la izquierda · Y
  se tira al centro" y las dos filas con sus numeros si acerto la zona; en el campo, el
  cono hacia la zona del tiro y, en la red, la zona a la que se tiro el portero (naranja).
  Las zonas: la pantalla pinta x * sentido (tu ataque siempre hacia arriba), asi que en
  las partes pares la izquierda de tu pantalla es la derecha del campo; la pagina lo
  convierte (`zonaCampo`) y el cono sale hacia donde pulsaste.
- En la tanda: los tiros no cuentan en "Tiros" ni sus goles en el marcador ni en los
  goles (van en "Penaltis" de las estadisticas); la supertecnica si cuenta y llena la
  hiperbarra. Rotulo pequeno "¡Gol!" o "¡Parada!" tras cada tiro y el tablero (● gol, ✕
  fallo) en el panel y en el campo. El reloj esta parado en la tanda: cada penalti empieza
  sin hipers puestas ni esperas de invocar, asi que una invocacion vale solo para ese
  penalti (el boton dice "activo en este penalti") y la limita la hiperbarra. La tension
  no sube en la tanda (no hay focos): se pagan pocas supertecnicas.
- Quien gana: por goles y, con empate, el de la tanda (`ganador()`). El marcador dice
  "1 - 1 (4-2 pen.)" (en el de arriba, "Penaltis" en vez del reloj), el final "¡Has ganado
  en los penaltis!" / "Has perdido en los penaltis" con el tablero, y el rotulo del campo
  "¡Victoria!" o "Derrota" por la tanda.
- El penalti del partido es ahora un duelo "penalti" (antes un tiro desde 11 m con Tirar y
  Vaselina): si es gol, el gol de siempre; si lo para, se la queda el portero (y se cansa,
  como en el tiro). Cuenta como tiro.
- La maquina: la zona al azar con los pesos de `IA_PENALTI` (tira 40/20/40 % y se tira
  35/30/35 %) y la supertecnica como siempre; su portero invoca si el tiro viene mas
  fuerte que su mejor parada, como en el tiro.
- Online: la foto lleva al final la tanda (`pn`: orden, tiros, quien empieza y quien gana);
  la eleccion del penalti es {zona, tecnica} y el anfitrion la comprueba (una zona de fuera
  vale centro, una supertecnica que no es suya o no sirve, ninguna). El invitado se da el
  cambio de mas de la prorroga al ver su descanso (no pasa por el). `REGLAS.VERSION` 6:
  **Aaron y su amigo tienen que tener los dos este Pizarra**.
- La ayuda "Como se juega" explica el empate, la prorroga, la tanda y las zonas. En la 3D
  (partido-3d.js, dos lineas) el penalti tiene su patada y su cono, como el tiro.
- Equilibrio final con todo puesto (scratchpad prueba/medir-vr.js, ahora con
  `EMPATE=prorroga-penaltis`; 32 partidos de 2 x 15, maquina contra maquina): 3,63 goles
  en el tiempo normal (4,0 con la prorroga) y 9,9 tiros a puerta (10,8 con la prorroga),
  el 35 % por encima de la parada; no hizo falta tocar `IA_TIRO` ni `KP_ESCALA`. Acaban
  en empate el 25 % (8 de 32), 6 se desempatan en la prorroga (92 s de juego de media) y 2
  van a la tanda. 0,66 faltas, 0,19 amarillas, 0 rojas y 6,9 invocaciones por partido. En
  2 x 30 (16 partidos): 7,2 goles, 20 tiros, 2,2 faltas, 0,56 amarillas y 0,06 rojas.
  medir3 (equipos de antes, sin esperas): 9,3 tiros y 3,75 goles; medir2, 3,8. La tanda
  (scratchpad prueba/medir-tanda.js): tras un partido entero (40 tandas), el 78 % de los
  penaltis es gol (el diseno pedia 75-85 %; el portero acierta la zona el 35 % y entonces
  es gol el 38 %), 11 tiros por tanda, 1 de cada 3 llega a la muerte subita, el 13 % de
  los tiros con supertecnica y 1,3 invocaciones por tanda; empezada en frio (tension 105,
  hiperbarra 40), el 74 %.
- Pruebas: prueba3ds 175 OK; prueba-e1 98 OK (se cambio una: el penalti del partido es un
  duelo "penalti", antes un tiro con `penalti: true`); prueba-e2 68 y prueba-e3 88 OK;
  prueba-e4 65 OK (se cambio una: la version, 5 o mas); nueva prueba-e5.js 82 OK (lo que
  se elige, la prorroga entera con la maquina, el tiempo que no baja, el orden, los
  turnos, el corte anticipado y la muerte subita, 200 penaltis a otra zona todos gol, 400
  con la misma ~90 %, las elecciones que llegan de cualquier sitio, la supertecnica en la
  tanda, la maquina en 3.000 penaltis, el penalti del partido, invocar en el penalti, un
  partido entero online con prorroga y tanda, los rotulos, el tablero, el cono y las zonas
  en las partes pares desde los dos lados); fotos del invitado iguales. Capturas en el
  navegador (scratchpad juego/cdp, e5_*.png y e5_3d_*.png): "Si hay empate", el panel y
  el resultado del penalti del partido con su cono, el fin del tiempo reglamentario, la
  prorroga, su descanso, el rotulo de la tanda, sus paneles (tiras y paras) con el tablero,
  sus resultados y el final "1 - 1 (4-5 pen.)".
- A confirmar con Aaron: la prorroga de 2 x 5 min (2 x 10 en partes de 30) con un cambio
  mas; el orden automatico de la tanda (en GO Light se ordena a mano) y las tres zonas sin
  el "Charge" de 3 usos; "Nada" por defecto; que las pasivas de la 2.ª parte sigan en la
  prorroga; que en la tanda una invocacion valga para un solo penalti y el portero no se
  canse; y los pesos de la maquina.

### O-313 · El juego de partidos: colocar a los jugadores en los saques

Sexto encargo de las reglas de Aaron (O-307 punto 14: "en los saques (fuera, falta,
corner...) se puede colocar a los jugadores donde sea antes de dar a Jugar, menos
demasiado cerca del balon"; scratchpad juego/reglas-vr/DISENO.md, seccion 7.7). En el
codigo los cambios citan esta nota.
- En la espera de cada saque (la de "Jugar" de O-308: banda, corner, puerta, falta,
  centro y penalti) cada uno arrastra a los suyos donde quiera y se ponen ahi en el acto,
  mirando al balon: no es una ruta. El aviso de arriba lo dice: "Córner para X. Coloca a
  tus jugadores y pulsa Jugar (arrástralos, no muy cerca del balón)"; al que saca,
  "(arrástralos; marca antes el pase)" ("el pase o el tiro" en la falta). La ficha del
  jugador dice como se coloca (y, del que saca, por que no).
- Lo que no se deja (`REGLAS.COLOCAR_LEJOS`, 9,15 m): a los rivales del que saca, a
  menos de 9,15 m del balon; en el penalti, a nadie en el area ni en el semicirculo
  (9,15 m del punto de penalti) salvo el que tira y el portero; en el saque de centro,
  ademas, cada equipo en su campo. El que saca no se mueve (lleva el balon) y en el
  penalti el portero tampoco (en su linea). Si lo intentas sale "Muy cerca del balón"
  (o "En el saque de centro, cada equipo en su campo") y no se mueve. Mientras lo
  arrastras, el jugador sale donde lo soltarias (en rojo con una X y el porque si ahi no
  puede), y lo que no puedes pisar se pinta en rojo claro con el borde a rayas (el
  circulo del balon; en el penalti, el area y el semicirculo) toda la espera, mas fuerte
  al arrastrar.
- Al empezar la espera, los que ya estan donde no se dejaria (un rival a 3 m del que
  saca de banda, uno en el semicirculo del penalti) se apartan al sitio valido mas
  cerca: si no, al otro no le dejaban poner al suyo donde ya habia uno. En el penalti el
  que tira se pone detras del punto mirando a la porteria y el balon en el punto.
- Al pulsar Jugar, los colocados se quedan en su sitio hasta que alguien coge el balon,
  el que saca se va conduciendo o pasan 3 s (`REGLAS.COLOCADO_SEGUNDOS`): si no, se iban
  corriendo a su zona en cuanto se sacaba y colocarlos no servia de nada (asi la marca
  esta pegada al que recibe y hay duelo). El pase marcado a un colocado va a su sitio, al
  pie (al hueco iba varios metros hacia donde mira). Mandarle presionar o dibujarle una
  carrera le saca de su sitio.
- Las rutas siguen en la espera: manteniendo pulsado un momento (450 ms) antes de
  arrastrar se dibuja su carrera, como en la pausa. Al que saca, arrastrarle le dibuja la
  carrera. Colocar a uno le quita la ruta que tuviera.
- La maquina coloca a los suyos con sentido y sin azar (le sale lo mismo cada vez: lo
  repite mientras dura la espera, sigue a los que mueves y no toca lo que ya esta en su
  sitio). Defendiendo un tiro libre a menos de 32 m de su porteria, una barrera de 2 a 4
  (segun la distancia) a 9,65 m del balon tapando el palo cercano: el muro del tiro sale
  de ella. En faltas y corners marca (1,6 m por delante, hacia su porteria) a los que
  esperan en su area o cerca; en la banda, a los que estan a menos de 22 m del balon; en
  el corner pone uno al palo cercano. Atacando un corner mete 4 en el area (primer palo,
  segundo palo, punto de penalti y frontal) y al sacar la bombea al mas libre (antes
  salia conduciendo desde el banderin); atacando una falta cerca del area, 3 en la
  frontal sin pasar del penultimo defensa (hay fuera de juego). Siempre deja a dos sin
  tocar (arriba si defiende, atras si ataca).
- Online: orden nueva `colocar` ({lado, jugador, x, y}); el anfitrion la aplica si el
  jugador es del invitado y se ve en la foto (las posiciones ya viajaban: la foto no
  cambia). El invitado sabe con su copia del partido donde puede colocar (avisa al
  momento y pinta lo mismo) y, si el anfitrion no le deja, le llega el aviso solo a el.
  `REGLAS.VERSION` 7: **Aaron y su amigo tienen que tener los dos este Pizarra**.
- No va en el saque de centro de la segunda parte (ni de la prorroga): el descanso es su
  espera y alli aun no estan colocados para la parte siguiente (se cambia de campo al
  salir). La ayuda "Como se juega" lo explica.
- Pruebas: prueba3ds 175 OK; prueba-e1 98, e2 68, e3 88 y e4 65 OK; e5 82 OK (se cambio
  una: la version, 6 o mas); nueva prueba-e6.js 85 OK (lo que se deja y lo que no en cada
  saque, apartar al empezar, quietos al sacar hasta que se coge el balon, se conduce o
  pasan 3 s, el pase al pie, la barrera y las marcas de la maquina (que no mueve a nadie
  si nada cambia y le sale lo mismo con otra semilla), su corner, la banda, el online,
  la pantalla, el aviso y 8 partidos enteros sin nadie donde no debe); fotos del
  invitado iguales; medir3 9,3 tiros y 3,75 goles y medir2 3,8 (sin esperas, como
  antes). medir-vr (64 partidos de 2 x 15, maquina contra maquina): 3,8 goles y 9,8
  tiros; con la maquina sin colocar y sin apartar, 3,55: es ruido de partidos que se
  separan tras el primer saque (en los 12 s tras cada saque que no es de centro, 8 goles
  del que saca con colocar y 10 sin, en 52 saques). Capturas en el navegador (scratchpad
  juego/cdp, e6_*.png): los avisos, el circulo de la banda, arrastrar a 4 m (rojo con
  "Muy cerca del balón") y a 13 m, la ficha, la barrera y las marcas de la maquina en un
  tiro libre, su corner (4 al area y el centro bombeado) y el area y el semicirculo del
  penalti.
- A confirmar con Aaron: 9,15 m en todos los saques (en la vida real, en el de banda
  bastan 2 m); que los colocados esperen al sacar (como mucho 3 s); mantener pulsado
  para dibujar la carrera en la espera del saque.

### O-314 · El juego de partidos: revision final de las reglas de Aaron (O-308 a O-313)

Revision a fondo de los seis encargos de las reglas de Aaron (O-307; scratchpad
juego/reglas-vr/DISENO.md) sobre el diff entero, contra O-307 y el diseno, buscando lo que
falta y lo que se rompe: online (anfitrion e invitado), contra la maquina, pausa, saques,
cambios, descanso, prorroga, penaltis, tarjetas e hipertecnicas en los duelos. E2, E3 y E4
se cortaron una vez a medias y se retomaron: no queda nada a medias ni repetido (ni
funciones ni claves de REGLAS dobles; una entrada de NOTAS y una seccion HECHO del diseno
por encargo; tecnicas.csv solo gana la columna `coste`).
- Lo que hay, en una linea cada encargo (los detalles, en su nota):
  - O-308, el ritmo de 3DS: partes de 15 o 30 minutos de reloj; tras las 15:00 la parte
    sigue hasta que se para el balon (tope 17:00); pausa y descanso sin limite; Jugar y
    Menu antes de cada saque; 5 cambios, los de la pausa entran al pararse el balon.
  - O-309, quien gana: el numero mayor salvo un critico (el 90-10); Tirar/Vaselina,
    Testarazo/Volea y Parar/Despejar; el muro que pierde resta la mitad de su numero.
  - O-310, la hiperbarra: espiritus e hipertecnicas sin tension (la ★ gana el foco,
    Invocar en el tiro no gana solo); tension y coste de VR; tacticas en pausa y saque.
  - O-311, las tarjetas y el expulsado. O-312, prorroga, tanda de penaltis y el penalti
    del partido con zonas. O-313, colocar a los jugadores en los saques.
- Arreglado en la revision: un pase marcado en un foco que acaba en falta con la parte ya
  alargada (tras las 15:00) pasaba el descanso: se veia en el campo y podia salir en la
  parte siguiente si el mismo jugador tenia el balon al acabar un duelo. `_descanso()` lo
  borra (prueba en scratchpad prueba/probar-pase-descanso.js). Y en el resultado de un
  duelo, las pasivas que restan (una tactica del rival) salian "pasivas +-30 %": ahora
  "pasivas -30 %" (partido.js, filaDuelo; era de antes).
- Los numeros con todo puesto (scratchpad prueba/medir-vr.js y medir-revision.js, 32
  partidos de 2 x 15 maquina contra maquina con "Prorroga y penaltis"; 2 x 30, 16):
  - Duracion: 75 s de juego corriendo por parte de 15 (150 en las de 30). Tras las 15:00
    la parte sigue de media 81 s de reloj (unos 7 s de juego) y 33 de 80 partes llegan al
    tope de las 17:00; 163 s de juego por partido de 2 x 15 (312 en 2 x 30). La prorroga,
    2 x 5:00 (unos 90 s de juego).
  - Goles: 3,84 por partido en el tiempo normal (4,06 con la prorroga), 10,8 tiros a
    puerta, el 34 % por encima de la parada; 25 % de empates; en 2 x 30, 8,3 goles.
    medir3 (sin esperas, equipos de antes): 9,3 tiros y 3,75 goles; medir2, 3,8.
  - Critico: el 10 % con numeros parecidos (hasta x1,5), menos cuanto mas lejos y nada al
    triple. Medido: el 10,8 % de los focos y disputas parejos, 2,5 a 2,8 por partido.
  - Hiperbarra (la "hipertension"): de 0 a 200, empieza en 40, 100 por hiper; se llena con
    lo que cuestan las supertecnicas (x0,4 tiro, x0,6 regate, x0,8 defensa, x1 parada);
    como mucho 2 activos por equipo y 15 s entre invocaciones. Medido: ~384 ganada por
    equipo y partido, 6 a 7 invocaciones por partido (2,3 de ellas ganando un foco con la
    ★) y alguna hiper puesta en el 72 % del juego (83 % en 2 x 30). Tension media con el
    balon en juego, ~87 de 300.
  - Tarjetas: amarilla el 20 % de las faltas (35 % las fuertes), roja directa el 0,5 %
    (3 % las fuertes). Medido: 0,53 faltas, 0,22 a 0,25 amarillas y 0 rojas por partido
    de 2 x 15 (una amarilla cada 4 partidos); en 2 x 30, 0,3 amarillas.
  - Tanda (scratchpad prueba/medir-tanda.js, 100 tandas tras un partido entero): el 75 %
    de los penaltis es gol, 10,8 tiros por tanda y 3 de cada 10 llegan a muerte subita.
- Pruebas: prueba3ds 175 OK, prueba-e1 98, e2 68, e3 88, e4 65, e5 82 y e6 85 OK; fotos
  del invitado iguales; medir3 y medir2 como antes del arreglo. Un partido entero por la
  pantalla contra la maquina (scratchpad juego/cdp/rev_partido_entero.mjs, Machangas
  contra Footsies, 2 x 15 con "Prorroga y penaltis", los botones pulsados como Aaron; los
  goles se igualaron a mano antes del final para ver la prorroga y la tanda): colocar
  arrastrando con el raton (y el aviso "En el saque de centro, cada equipo en su campo"),
  Jugar en cada saque, una pausa con un cambio desde el Menu que entro en la siguiente
  falta, invocar desde la ficha, 74 clics en los paneles de duelos y penaltis, una
  amarilla a cada equipo, la ★ ganando focos, "Fin del tiempo reglamentario", la prorroga
  con su descanso y la tanda hasta "Has perdido en los penaltis" (0 - 0, 3-5 pen.); 6
  minutos reales con los botones pulsados al momento. Como en ese partido no salio el
  balon ni hubo penalti, otra pasada (rev_saques.mjs) los forzo: saque de banda del rival
  (arrastrar a 4 m del balon, en rojo y "Muy cerca del balón"; a 13 m, colocado), un
  corner propio y un penalti a favor (Jugar, zona, "acierta: a la izquierda", parada).
  Sin errores en la consola. Capturas en scratchpad juego/cdp, rev_*.png.
- Visto en la revision y sin tocar, para decidir con Aaron:
  - El balon casi nunca sale del campo: 0,16 fueras por partido (en el partido por la
    pantalla, ningun saque de banda, de corner ni de puerta). Las esperas de Jugar,
    colocar y los cambios de la pausa casi solo llegan tras un gol, una falta o el
    descanso, y por eso las partes se alargan tanto tras las 15:00. Es del motor de antes,
    no de estas reglas: si Aaron quiere mas saques, hay que hacer que el balon salga.
  - Con las duraciones de VR sin escalar hay alguna hiper puesta casi todo el partido (un
    keshin dura 45 s de los 75 de una parte).
  - La tension no sube sola (VR): quien usa muchas supertecnicas se queda sin ella (en el
    partido por la pantalla, 5 de 300 al acabar la 2.a parte).
  - En la tanda cada equipo tira a la porteria que atacaba (en la vida real, todos a la
    misma).
  - Con "Focos automaticos" tu ★ en los focos no sale nunca (el ayudante no gasta la
    hiperbarra: solo se gasta invocando desde la ficha o en el tiro).
  - El saque de centro de la 2.a parte y de la prorroga no tiene su espera ni se coloca
    (el descanso es su espera).
- A confirmar con Aaron (todo junto; el porque, en cada nota): 5 cambios (y 1 mas en la
  prorroga) o 3; seguir tras las 15:00 hasta que se pare el balon (tope 17:00) o cortar
  en seco; que la pausa la quiten los dos; descanso sin limite; "Dejar el partido" al
  minuto sin noticias; el critico que baja a nada al triple (o el 10 % siempre); la
  vaselina (x0,8, pasa si el defensa esta a mas de 2,5 m), el testarazo con el Fisico, la
  volea como Romper, despejar (x1,25 y hasta 100 grados) y el muro que resta la mitad; la
  hiperbarra (0-200, empieza en 40, 100 por hiper), los 2 activos y los 15 s, hiper contra
  hiper con el 90-10, hiper contra una ya puesta como foco normal, las duraciones de VR
  sin escalar, la pasiva del espiritu solo con la hiper puesta, la tension y el coste de
  VR, vinculo y modo solo con sus %, el +10 % de velocidad y que en el tiro invocar no
  gane solo; las tarjetas (20/35 % y 0,5/3 %), no expulsar con 7 y las faltas como ahora
  o como VR; la prorroga de 2 x 5 (2 x 10) con un cambio mas, el orden automatico de la
  tanda, las tres zonas sin "Charge", "Nada" por defecto, las pasivas de la 2.a parte en
  la prorroga, una invocacion por penalti en la tanda y los pesos de la maquina; los
  9,15 m en todos los saques (en la banda bastan 2 m), los colocados quietos hasta 3 s al
  sacar y mantener pulsado para dibujar la carrera en la espera.
- Online: `REGLAS.VERSION` 7. **Aaron y su amigo tienen que tener los dos este Pizarra**;
  el que invita no debe minimizar Pizarra (con la pestana oculta el partido se para). El
  online de verdad con dos PCs aun no se ha probado (si con las pruebas sin pantalla y la
  foto).
- Siguen fuera de estas reglas, para otro encargo: O-307 puntos 1 (zoom con las flechas),
  13 (jugar en la pantalla 3D) y 15 (copiar Galaxy).

### O-315 · El juego de partidos: reglas como en la vida real (el balon que sale, las distancias, la tanda y los cambios de VR)

Lo que dejo la revision O-314 (Aaron, O-307: "las reglas como en la vida real"; O-307
punto 16 para los cambios). Un primer intento se corto a medias (se apago el PC) y se
retomo sobre el git diff: nada repetido ni a medias. En el codigo los cambios citan
esta nota.
- El balon sale del campo (antes 0,16 fueras por partido: casi no habia saques de
  banda, corners ni de puerta, ni las esperas de Jugar, colocar y cambios que traen):
  - Los pases no son perfectos (`REGLAS.PASE_ERROR`): el balon va a unos metros de
    donde se apunta (`objetivo`), en largo y de lado como una normal con el azar del
    partido (sale igual en los dos PCs). Error tipico 0,3 m + 0,04 por metro + hasta
    1 m con un rival a menos de 4 m, x1,5 el bombeado, tope 8 (un pase de 20 m sin
    nadie, ~1,1 m). El que recibe va adonde va el balon (dentro del campo). Mas fallo
    quitaba goles (los centros no llegaban) y casi no sacaba balones: los pases van
    por el medio, lejos de las lineas.
  - El tiro sin supertecnica (ni la de la cadena) puede irse fuera (`TIRO_FUERA`):
    0 hasta 12 m, +6 % por metro (48 % a 20 m), +10 % con un rival a menos de 4 m, la
    volea x1,4, tope 75 %. Sin azar en la cuenta: el boton lo dice ("puede irse fuera:
    48 %", `o.fuera` en el duelo) y al resolver se tira. Se va por la linea de fondo
    junto a un palo, el portero no juega ni paga, en el panel "Se va fuera" sin numero
    del portero y "¡FUERA!", y luego saque de puerta. El muro que lo toca y pierde lo
    desvia a corner el 30 % ("¡Desviado a córner!", gana el muro). El penalti, a
    puerta siempre.
  - A corner directo (`A_CORNER`): el 60 % de los despejes del portero (Despejar o su
    supertecnica de despeje) y el 60 % de los bloqueos del muro.
  - El balon disputado se escapa (`ESCAPA`): el defensa que gana un foco sin
    supertecnica ni hiper a veces no se lo queda (6 % con Tapar, 15 % con Entrada o
    Cargar) y sale rodando a 10-16 m/s hacia donde iba el que lo llevaba ("se la quita,
    pero el balón se escapa").
  - El despeje de cabeza (`CABEZA`): el balon bombeado del rival (un centro, un
    despeje) que corta un defensa de campo a menos de 26 m de su porteria no se lo
    queda: lo despeja de cabeza, a corner la mitad de las veces.
  - La maquina: apretada (rival a menos de 6 m) a menos de 34 m de su porteria despeja
    a la banda el 65 % de las veces (`IA_DESPEJE`, orden nueva "despeje"), apuntando de
    1 a 8 m pasada la linea (los despejes que se quedaban dentro eran balones perdidos
    delante de su area y bajaban los goles a 3,2); pegada a su linea de fondo y por un
    lado, a corner el 60 %. Su portero saca en largo hacia una banda. Centra desde la
    banda cerca del area rival (`IA_CENTRO`, a primer palo, segundo palo o el punto de
    penalti, y a veces lo remata de primeras, tambien el corner). Tira mas y desde mas
    lejos (`IA_TIRO`: con lo de antes salian 2,5 goles y 0,6 saques de puerta).
  - Medido (scratchpad prueba/medir-o315.js, 192 partidos de 2 x 15 maquina contra
    maquina con esperas): 7,5 saques de banda, 3,0 corners y 3,3 saques de puerta por
    partido (160, 129 y 112 de 192 partidos dentro de 6-12, 2-5 y 3-6), 3,59 goles
    (antes 3,84) y 15 tiros (4 fuera). De donde salen: la banda, casi toda de despejes
    de la maquina; los corners, del portero (0,8), del muro (0,7 desviados y 0,45
    bloqueos), de la maquina (0,6) y de cabeza (0,4); los de puerta, de tiros fuera
    (3,3). medir-revision: 3,88 goles, 7,6 / 2,75 / 3,3 (32 partidos); en 2 x 30, 7,1
    goles y 14,6 / 7 / 6,2 (16). medir2 y medir3 (12 partidos, equipos de antes, sin
    esperas) dan 2,2 goles (antes 3,8): son pocos partidos; con 96 de esos
    (medir-o315 VIEJOS=1 SIN_ESPERAS=1), 3,28 contra 3,31 antes. medir3 ya no cuenta
    los que se van fuera como tiros que llegan al portero.
- Las distancias de cada saque (`COLOCAR_LEJOS`, antes 9,15 m en todos): 2 m en el de
  banda; 9,15 en la falta, el corner y el de centro; en el penalti, el area y el
  semicirculo; y en el saque de puerta, los rivales fuera del area (regla 16) ("En el
  saque de puerta, fuera del área"; el aviso "arrástralos, fuera de su área"; la
  pantalla pinta el area sin semicirculo). Al empezar la espera se apartan y la
  maquina coloca respetandolo.
- La tanda de penaltis a una sola porteria (antes cada uno a la que atacaba): la
  sortea el arbitro (`tanda.porteria`, +1 o -1). En cada penalti el que tira ataca
  hacia ella y el otro la defiende (cambia el sentido de los equipos: porteriaRival,
  el portero y las pasivas valen como siempre). La pantalla y la 3D la ponen arriba
  para los dos (`sentidoPantalla`) y no giran entre penaltis; izquierda y derecha
  son las mismas para el que tira y para el portero.
- Los cambios como en VR (O-307 punto 16; `CAMBIO_REFUERZO`, `CAMBIO_DESCUENTO`):
  el que entra, AT y DF +15 % durante 60 s de juego, y sus companeros de la misma
  posicion +5 % (se suman si entran varios). Va en focos, disputas, tiro, cadena y
  muro, fuera del tope de las pasivas; la parada del portero no (solo con PP, O-304).
  Ficha: "Recién entrado: AT y DF +15 % (quedan 42 s)" o "Cambio en su posición: AT y
  DF +5 %". Cada cambio con la parte en juego suma 30 s de reloj de descuento (VR:
  uAddAdditionalTimeOfPlayerChange 30; aqui 2,5 s de juego); los del descanso no
  (como en la vida real). El reloj lo ensena: "1ª 07:32 +0:30". La parte acaba a las
  15:00 mas el descuento (y sigue hasta que se pare el balon, 2:00 de reloj como
  mucho); si ya se alargaba y el descuento le devuelve tiempo, vuelve a ser tiempo de
  la parte. El expulsado no se puede cambiar y el que sale no vuelve (ya era asi:
  comprobado tambien con la cola de la pausa de O-308, que no deja dos cambios del
  mismo que sale ni del mismo que entra). El Menu y la ayuda lo explican.
- Online: `REGLAS.VERSION` 8. La foto lleva al final, por jugador, `j[k][12]` (los
  refuerzos [[pct, hasta]]) y `dc` (el descuento de cada parte); la tanda lleva
  `porteria` en `pn`. Una foto sin ellos los deja como estaban. **Aaron y su amigo
  tienen que tener los dos este Pizarra.**
- La pagina: en las estadisticas, "Tiros" cuenta tambien los que se van fuera; la
  ayuda "Cómo se juega" explica el balon que sale, las distancias, la tanda y los
  cambios.
- Pruebas: prueba3ds 175, e1 98, e2 68, e3 88, e4 65, e5 82 y e6 85 OK; nueva
  prueba-o315.js 84 OK (el fallo del pase y sus pases fuera, los tiros fuera con su
  boton y su saque de puerta, desviados, bloqueos y despejes a corner, el balon que se
  escapa, el despeje de cabeza, el despeje de la maquina, 48 partidos enteros con los
  saques y los goles en lo pedido, las distancias, el saque de puerta, la tanda a una
  porteria en 10 tandas y en el invitado, los cambios con el refuerzo, el descuento,
  el fin de la parte, el expulsado, el que no vuelve, la cola, la foto y la pagina);
  fotos del invitado iguales. Pruebas viejas cambiadas: prueba3ds (el fuera de juego
  del pase al hueco, sin el fallo del pase; el desmarque mira adonde apunta), e2 (los
  despejes y los criticos, sin tiros fuera ni despejes a corner), e3 (tecnicas.csv
  contra el commit anterior a E3: contra HEAD fallaba desde que se hizo el commit
  3910c27), e5 (pn y dc al final de la foto; la tanda arriba para los dos) y e6 (2 m
  en la banda; el pase al pie sin el fallo). Capturas en el navegador (scratchpad
  juego/cdp, o315_ver.mjs y o315_ver3d.mjs, o315_*.png): el Menu, la ficha del que
  entra con el reloj "+0:30", el saque de banda (a 1,4 m no, a 3 m si), el saque de
  puerta (el area en rojo y "En el saque de puerta, fuera del área"), el panel del tiro
  ("puede irse fuera: 75 %"), "¡FUERA!" y su saque de puerta, y la tanda tirando y
  parando con la misma porteria arriba (tambien la 3D). Sin errores en la consola.
- A confirmar con Aaron: los numeros (el fallo del pase, el % de fuera, el 60 % a
  corner, los balones que se escapan, cuanto despeja la maquina); 30 s de reloj de
  descuento por cambio (VR los da en un partido de 90 minutos: escalado a partes de
  15 serian 10 s) y los 60 s de juego del refuerzo (casi una parte entera de 15); que
  los cambios del descanso no sumen descuento y los de antes del saque inicial si; que
  la parada del portero que entra no suba; la tanda con la misma vista para los dos.

### O-316 · El juego de partidos: la consola y la pantalla de arriba como GO Galaxy (E1)

Primer encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E1; O-307 puntos 1, 13 y 15). En el codigo los cambios
citan esta nota. El motor, la IA, la 3D, el raton y los paneles no cambian.
- La pagina es una 3DS: dos pantallas a escala, ARRIBA (400x240 px de 3DS, "u") y ABAJO
  (320x240 u), una encima de otra como la consola (por defecto) o una al lado de otra (mas
  grandes; opcion "Pantallas"). Sin la cabecera de Pizarra: un "‹ Inicio" pequeno arriba
  a la izquierda; fuera de las pantallas, casi negro. La escala es fraccionaria y llena la
  ventana (8 px de margen): en la de Pizarra de 1366x768 maximizada, la de abajo sale de
  448x336 (593x445 al lado); en 1920x1080, 649x486. Con la ventana muy pequena (S < 0,8)
  solo un aviso; si sale pequena (S < 1,4), en la pestana Pantalla "Maximiza la ventana"
  (la ventana de Pizarra no tiene F11 ni pantalla completa).
- web/partido-consola.js: `Consola` (montar, escala pura, las capas de cada pantalla: un
  canvas 2D encima que dibuja en u y una capa HTML con `zoom`, el canvas WebGL de detras
  para E2, el raton en u, alCambiar, las letras, registrar/modulo para los modulos ES, el
  limite de FPS por tiempo (60, o 30 en Baja; tambien en pantallas de 144 Hz) y la calidad
  automatica por el intervalo entre cuadros, y el contador "Ver FPS") y `GX` (toda la
  paleta de la guia de Galaxy con nombres, el texto con contornos y degradado, botones,
  placas, el escudo dibujado, los iconos y las caras). GX.color: tu equipo azul y a la
  izquierda en cada PC (tambien el invitado), el rival rojo.
- web/partido-arriba.js: la pantalla de ARRIBA en 2D. En juego, el mapa de Galaxy: los
  marcadores (tus goles a la izquierda), la pestana del reloj ("1.ª 07 : 32", el descuento
  "+0:30", "1.ª pr.", "Penaltis 4-2"; online, "esperando a X...", "X no responde", "X ha
  salido": la logica del marcador() de antes), el campo entero en vertical con un punto por
  jugador (morado con la hiper puesta) y el balon, los paneles de goles ("1.ª 21' Zanark",
  las 5 ultimas) y, en la tanda, el tablero de cada equipo en su panel. La ficha del
  elegido o del que lleva el balon (la tuya a la izquierda, la del rival a la derecha en
  espejo; en la espera del saque solo la del elegido, como el tiempo de tactica de
  Galaxy): placa del color de su elemento, su cara con la camiseta de su equipo debajo,
  el balon si lo lleva, el elemento, la pastilla de su posicion, el nombre y dos barras:
  TEN (tension del equipo) e HIP (hiperbarra, con la raya de la mitad); el portero KP y
  TEN; con la hiper puesta AURA (lo que le queda) y PODER ("+50 %"); la amarilla y el
  "+15 %" del que acaba de entrar. La ficha grande (retrato, nivel, tension, hiperbarra,
  espiritu, los 7 stats, las supertecnicas y las pasivas): hasta el icono T de E3, el
  boton "Ficha grande arriba" del aside. El descanso y el final: la pantalla verde de
  Galaxy con el titulo ("Descanso", "Fin del tiempo reglamentario", "Descanso de la
  prórroga", "Fin del partido"), los escudos, el marcador grande en perspectiva, "(4-2
  pen.)", la banda negra con los nombres y el VS, y "Nivel del equipo" (la media de los
  11 que empezaron). Lo que no cambia se pinta una vez en un lienzo aparte.
- La pantalla de elegir, dentro de la consola: ARRIBA los dos equipos con sus 11 caras,
  la banda VS, el nivel y el resumen ("2 × 15 min · Empate: nada · Fuera de juego"); ABAJO
  la lista azul de Galaxy con dos pestanas, Partido (tu equipo, rival, duracion, empate,
  focos automaticos, fuera de juego) y Pantalla (animaciones, campo en 3D, pantallas,
  calidad 3D, sonido, ver FPS), filas de casillas cian con flechas o Si/No, la rejilla de
  equipos 2x4 con paginas al pulsar el nombre, Online en la tactil (con [Atrás]), "Cómo se
  juega" y la barra con [Jugar] y [Online]. Los <select> y casillas de siempre siguen en
  partido.html, ocultos, como modelo de datos (localStorage, el online y las pruebas los
  leen igual; las filas los cambian con un "change" de verdad); los ids de siempre. Las
  opciones nuevas se guardan solo en este PC (partido-pantallas, partido-calidad,
  partido-animaciones, partido-campo-3d, partido-fps); "Pantalla de arriba en 3D" se va.
- El Director de mentira (partido-director.js: arriba "mapa", "descanso", "final" o
  "ficha"; los goles del motor) y los esqueletos de los encargos siguientes
  (partido-hud-abajo.js, partido-abajo.js y .css, partido-hud-duelo.js, partido-rotulos.js,
  partido-escenas.js), cargados ya en el orden del diseno. El bucle pinta con el limite de
  FPS; lo de los paneles (que repite la eleccion del invitado) va antes del corte.
- Provisional hasta E2 y E3: abajo, el campo 2D de hoy encajado en la pantalla de abajo;
  los paneles de hoy (duelos, tacticas, ficha, registro, ayuda, pausa, menu) en un aside a
  la derecha de la consola (como la columna lleva ahora tambien las tacticas y la ficha,
  verPausa sube el panel si un duelo largo la habia bajado: si no, el final quedaba fuera
  de la vista). La vista 3D de arriba de antes ya no se ve (vuelve abajo en E2).
- Las letras: las cuatro libres (OFL) de la guia hay que bajarlas y no hay permiso de
  Aaron: el codigo usa las familias "GX Redonda", "GX Cifras", "GX Nombre" y "GX Rotulo",
  que hoy son letras de Windows (Segoe UI Bold/Black, Bahnschrift, Impact, Arial Black;
  todas con ñ, tildes, ¡¿, ª, · y ×). LICENCIA-letras-partido.txt dice como cambiarlo.
  Los 30 iconos SVG propios van en partido-iconos.js.
- Lo que no es Galaxy [PIZARRA]: la pastilla de la posicion en vez del icono de sexo, las
  barras con los nombres de VR, los escudos dibujados con las iniciales (no hay emblemas en
  los datos), la camiseta del busto (las caras de Pizarra son solo la cabeza), la tanda en
  los paneles (como GO Light) y la pantalla de elegir entera (Galaxy no ensena un menu asi:
  se hizo con sus piezas, la lista de tecnicas, los botones y la banda VS).
- Pruebas: nueva prueba-g1.js (56 OK: la escala de la ventana de Pizarra y la de Chrome en
  los dos modos, el aviso y la linea de maximizar, GX.color por perspectiva, la paleta y los
  iconos, el limite de FPS a 60/144 Hz y en Baja, Arriba en la espera del saque, juego,
  pausa, el rival con balon, el portero, la hiper, los goles en perspectiva y sus lineas,
  el gol que aun no se ve, la ficha grande, la prorroga "1.ª pr. 03:12 +0:30", la tanda
  "Penaltis 4-2" y la muerte subita, descanso y final con "Nivel del equipo" y "(4-5
  pen.)", el online "esperando a Ana...", la pantalla de elegir y un partido entero de
  maquina contra maquina con prorroga y tanda pintando arriba para los dos lados). Las de
  siempre en verde (prueba3ds, e1 a e6, o315; fotos "iguales: true"); prueba-o315 lee ahora
  "la pagina" como la union de partido.js y los ficheros nuevos (el reloj esta en
  partido-arriba.js), sin quitar nada de lo que mira.
- Capturas (Chrome headless, scratchpad juego/cdp/gx_e1.mjs con gx_comun.mjs; comparadas
  con galaxy/trabajo/comparar.py en galaxy/comparado/, Pizarra a la izquierda y Galaxy a la
  derecha): a 1366x633 y 1920x945 "encima", 1366x633 "lado" y 1536x795 al 125 %: arriba en
  juego contra p02 y la maqueta m01, marcador a01, reloj a02, minimapa a03, paneles a04,
  fichas a05-a07 con m10, descanso a25, final a26, y la de elegir (pestanas, filas,
  rejilla, online) contra b13, b15, b25 y la banda VS de a25. Lo que no queda igual: las
  letras (las de Windows en vez de las de Galaxy), los escudos, las caras (solo cabeza) y
  el minimapa con las medidas reales del campo (las areas un poco mas grandes que las de
  Galaxy). Un partido entero contra la maquina con el aside (esperas, duelos, descanso,
  tanda y final) sin errores en la consola. Sin scroll en ningun tamano.
- A confirmar con Aaron: bajar las 4 letras OFL (~0,5 MB de github.com/google/fonts) o
  quedarse con las de Windows; las pantallas una encima de otra por defecto; tu equipo
  siempre azul y a la izquierda tambien de invitado; los escudos dibujados y la camiseta
  del busto; los colores de las pastillas de posicion (DEL rojo, MED azul, DEF verde, POR
  naranja).

### O-317 · El juego de partidos: el campo 3D de abajo como GO Galaxy (E2)

Segundo encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E2; O-307 puntos 1, 13 y 15). En el codigo los cambios
citan esta nota. El motor, la IA, el online (la foto no cambia: VERSION igual) y la
pantalla de arriba no cambian.
- Se juega EN el 3D de abajo, como la tactil de Galaxy (O-307 punto 13). web/partido-3d.js
  rehecho como Mundo3D: un solo WebGL detras de las dos pantallas (#gl) con tijera y dos
  escenas, Campo (abajo) y Estudio (arriba, vacia hasta E5). El renderer, el campo y la
  cache de modelos se hacen una vez por pagina. Se van la camara desde la banda, el rombo
  flotante y _pintarLineas (creaba mallas nuevas en cada cuadro).
- El campo de Galaxy: cesped moteado sin franjas (el verde de p03), las lineas en UNA
  malla de cintas (nitidas de cerca), la pista roja teja, las porterias con su red, un
  estadio sencillo (muro, gradas con publico, techo con focos y cielo, sobre todo para la
  pantalla de arriba de E5) y luces para los modelos.
- Los jugadores: el modelo de VR a x2,2 (cabezones de ~28 u, como los de Galaxy; antes
  x1,45) o la ficha con su cara mientras llega; debajo el disco de su color (tu equipo
  azul, el rival rojo, con borde blanco: 22 discos en dos llamadas), el cursor del elegido
  o del tuyo con balon (el aro azul a trozos con tres pestanas blancas que gira), el aura
  de la hiper puesta (un brillo del color de su familia detras de el), la tarjetita
  amarilla y un cilindro invisible para el raton. El expulsado no se ve.
- Los modelos: como mucho 2 cargandose a la vez; sus texturas, reducidas a 512 (calidad
  Alta) o 256 (Media y Baja) antes de subirlas (los 22 con las de 1024 eran ~410 MB en la
  grafica, que en un portatil es su RAM); al tener los 22 se compilan los shaders y se
  sube todo de una vez: el primer duelo no se atasca y la memoria no crece despues
  (mismas mallas y texturas a los 10 y a los 60 s). Las animaciones, solo de los que se
  ven (y a 30 por segundo en Baja). La calidad cambia el pixelRatio del 3D (Alta hasta
  1,5, Media 1, Baja 0,8; Baja con el publico liso).
- La camara (guia 7.1): 48 grados, FOV 25 y a 53 m del punto mirado, como Galaxy: en la
  fila del centro se ven 31 m de ancho (el 46 % del campo), el circulo central sale como
  una elipse de 0,75 y el balon queda al 58 % del alto (mira 2,5 m por delante del
  balon). Sigue al balon con un suavizado de 0,2 s sin pasar de 24 m a cada lado ni de
  50 m a lo largo (pegado a la banda se ve la pista). Las FLECHAS del teclado la mueven a
  25 m/s (el doble con Mayusculas; O-307 punto 1); con el balon en juego vuelve sola al
  balon a los 1,5 s de soltarlas; con el juego parado (pausa, espera del saque, duelo,
  descanso) se queda donde la dejes y tambien se arrastra con el raton desde un sitio
  vacio; al seguir el juego vuelve al balon. Al saltar un duelo, corte al portador (o al
  que chuta); al empezar la espera de un saque, viaja al balon. En el penalti, mas baja y
  cerca (35 grados, 25 m), detras del que tira o de tu porteria, sin girar (la izquierda
  y la derecha de las zonas, como O-315). Esta camara (CamaraAbajo) es la misma para el
  3D y para la reserva 2D.
- El raton por rayo (raton() escucha ahora la pantalla de abajo entera, con la misma
  logica de siempre): aCampo corta el suelo; jugadorEn, los cilindros (manda el corte mas
  cercano) y, si no, el que tenga su cuerpo a menos de 14 u; la X del tiro y del remate
  de primeras sale de cortar con la linea de gol de pie (pulsar la red de pie caia 2-3 m
  detras). Los controles de la tactil (E3) no son gestos del campo.
- En el suelo (debajo de los jugadores): la zona de tiro de Galaxy (b28) cuando tu
  jugador con balon esta a su alcance de tiro (no en el saque de centro) o en el duelo de
  tiro: el cono cian a los dos palos, la linea amarilla con borde oscuro hasta la X (de
  pie en la linea de gol, donde pulsaste) y el rombo azul sobre su cabeza (sin su nombre:
  el rombo ya dice quien es); el destino del pase, un circulo cian (b53; antes una X); la
  zona roja del saque (O-313, un lienzo que solo se repinta al empezar la espera o un
  arrastre) y la sombra del balon.
- Encima (web/partido-hud-abajo.js, HudAbajo, el mismo para el 3D y la reserva 2D, en u y
  proyectando cada punto: las rayas tienen el grosor de Galaxy por lejos que esten): las
  rutas (flecha azul gruesa con punta), el pase raso y el bombeado (un arco con su altura
  de verdad y su sombra en el suelo, b11), la estela roja del pase del rival (b10, b53),
  la presion, los ANILLOS del duelo y del tiro, que ahora CRECEN como en Galaxy (dos
  alrededor del portador o del que chuta, de 8 y 16 u a 100 y 200 u: medidos en t01, a
  los 133, 333 y 466 ms el de dentro mide 35, 75 y 95 u; se apagan desde los 530 ms),
  las ondas donde pulsas, el fantasma de colocar, la linea del fuera de juego, los
  triangulos amarillos de los que no se ven (b03; de los dos equipos), el nombre del
  elegido y del que lleva el balon, las barras KP del portero y AURA de la hiper (b49) y
  los bocadillos de Galaxy con su tamano: "¡Aquí!", "¡Uy!", "¡Bien!" (azul, al ganar un
  foco), "¡A por ellos!" (al soltar una ruta en la pausa) y "¡Atrás!" (el que esta en
  fuera de juego con tu balon). Los rotulos de hoy (¡Saque!, ¡Falta!, Fin del partido...)
  se movieron ahi tal cual (E4 los cambia por los de Galaxy). El tablero de la tanda ya
  no sale en el campo: esta arriba, en los paneles (O-316).
- La reserva 2D (web/partido-pantalla.js): sin WebGL, con "Campo en 3D" quitado o con
  /partido?2d, el campo de arriba con la misma camara (31 m de ancho, las flechas, el
  arrastre), los colores de Galaxy, las caras de pie sobre su disco y el mismo HUD.
- En "Cómo se juega", una linea con las flechas y el arrastre de la camara.
- Pruebas: nueva prueba-g2.js (la camara: 31,3 m, la elipse 0,75, el balon al 58 %, los
  limites, la derecha de la pantalla en los dos sentidos y en la reserva 2D, ida y vuelta
  pantalla-campo en 200 puntos; jugadorEn con dos a 1 m y por cercania; la X del tiro en la
  porteria; las flechas a 25 m/s, la vuelta a los 1,5 s solo en juego, el corte del duelo
  y el viaje al saque; el penalti sin girar; HudAbajo con los rotulos, ¡Uy!, ¡Aquí!,
  ¡Bien!, ¡A por ellos!, los anillos que crecen, los triangulos, nombres y barras; el
  limite de FPS). Las de siempre en verde (prueba3ds, e1 a e6, o315, g1; fotos "iguales:
  true"): las que miraban rotulos, bocadillos, anillos, el fantasma o el cono del penalti
  en la pantalla 2D los miran ahora en HudAbajo (prueba/vista-abajo.js los carga juntos),
  sin quitar nada de lo que comprobaban; los anillos del foco van alrededor del portador.
- Capturas (Chrome headless, juego/cdp/gx_e2.mjs y gx_e2_entero.mjs; comparadas en
  galaxy/comparado/e2_*, Pizarra a la izquierda y Galaxy a la derecha) en la ventana de
  Pizarra de un portatil 1366x768 (1366x697) y de un 1920x1080 (1920x1001), y la reserva
  2D: abajo contra p03 y la maqueta m02, pases b11, pase del rival b10/b53, triangulos
  b03, bocadillos b05-b09, discos b50, cursor b04/b51, zona de tiro b28, las tiras de los
  anillos contra t01 y t02 (+0, +133, +333, +466, +533, +666 ms con el reloj congelado) y
  colocar en un saque; una vez a 1536x795 al 125 % y una con las pantallas una al lado de
  otra. Dos partidos enteros contra la maquina jugados con el raton por el 3D (gx_e2_entero:
  pases, bombeados, pases al hueco, rutas, presionar, elegir y mandar, colocar, las flechas
  y el arrastre en la pausa; los duelos y las esperas con el aside), sin errores en la
  consola; cada gesto montado a mano y comprobado (gx_e2_gestos: tambien el tiro con su X y
  el remate de primeras), todos bien tambien al 125 %. Memoria: 180 mallas y 274 texturas a
  los 10 y a los 60 s de juego (iguales); JS de abajo por cuadro ~0,2 ms sin el render.
- Lo que no queda igual que Galaxy: el estadio es sencillo; los modelos son los de VR
  (proporciones de VR, no cabezones de verdad: solo mas grandes); la camara corta al
  portador centrado (Galaxy lo deja donde cae); los nombres y las barras encima son de
  Pizarra; la zona de tiro sale desde mas lejos porque en Pizarra se chuta desde 38 m (o
  mas con un tiro largo). Junto a la porteria (p03) Galaxy se ve ~20 % mas cerca que con
  la camara de la guia (31 m, medida en el circulo central): se dejo la de la guia. La
  columna de iconos de m02 es de E3.
- A confirmar con Aaron: los jugadores del tamano de Galaxy (x2,2) o del real; los
  triangulos de los dos equipos o solo de los tuyos; el nombre del elegido y del que
  lleva el balon y las barras del portero y del aura (Galaxy no pone nada); la camara que
  vuelve sola al balon a los 1,5 s; la zona de tiro desde tan lejos (o solo cerca del
  area, como Galaxy); que pruebe la calidad Automatica en su portatil.

### O-318 · El juego de partidos: la tactil como GO Galaxy (E3)

Tercer encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E3; O-307 puntos 10 y 15). En el codigo los cambios
citan esta nota. El motor, la IA, el online (la foto no cambia: VERSION igual) y la
pantalla de arriba no cambian.
- Se va el aside provisional de O-316: todo lo que iba en los paneles de al lado esta
  ahora DENTRO de la pantalla de abajo, como la tactil de Galaxy (web/partido-abajo.js y
  partido-abajo.css: una capa HTML de 320x240 px de 3DS con zoom encima del campo 3D; lo
  que no es un boton deja pasar el raton al campo, asi que se siguen dibujando rutas):
  - En juego, la columna de hexagonos de la derecha (m02, b01, b02): la mano (la pausa;
    tambien la barra espaciadora), TS (las tacticas), el aura (los espiritus, con el
    numero de invocaciones que se pueden hacer ya: la hiperbarra, el limite de 2 activos
    y los 15 s entre una y otra, O-310) y la T (la ficha grande arriba, alterna con el
    mapa). Rellenos de verde oscuro cuando ahora no se puede; al pulsarlos dicen por que
    en la franja de abajo (TS y el aura abren su panel igual, para mirar).
  - Las tacticas y los espiritus en juego: paneles compactos PEGADOS ABAJO (no tapan el
    balon ni lo de delante) que suben como el de auras de Galaxy y NO paran el juego
    (O-307 punto 10). Pulsar una tactica la lanza; [Invocar] invoca al elegido en la fila
    de las 11 caras (los que no tienen espiritu, apagados), con su tarjeta morada
    (familia, espiritu, "HIP 100 + AT/DF +50 % = 45 s") y lo que le falta.
  - La pausa (b12, b13): sin columna, el rotulo "Pausa", la caja de ayuda de Galaxy (la
    camara con las flechas y lo que se puede hacer) y [Registro] [Equipo] [Táctica]
    [Seguir]. El tiempo de tactica, en cada espera de saque (m06, p16): "Tiempo de
    táctica" con el saque, la ayuda (lo de siempre en dos lineas, y como se coloca el que
    has elegido) y [Jugar] [Menú]; el Menú: [Registro] [Equipo] [Táctica] [Atrás]. Al
    pulsar Seguir o Jugar el boton se pone naranja y, online, sale "Espera unos
    instantes..." hasta que pulse el otro (con [Dejar el partido] si no pulsa en 60 s).
  - Equipo (los cambios, como la formacion de p26): el mini campo con las caras en los
    puestos de la formacion (el que entra ocupa el del que sale), el banquillo, los
    recursos del equipo (tension e hiperbarra; en la ficha de un rival no se veian) y los
    cambios que quedan; se elige uno del campo (arriba sale su ficha grande) y uno del
    banquillo y [Cambiar]; [Quitar] el pendiente. En la pausa entra al pararse el balon;
    en el saque y en el descanso, en el acto. El expulsado sale apagado.
  - Registro: "Lo que pasa" (lo ultimo arriba) y "Cómo se juega", [Salir del partido]
    (con un segundo clic, para no salir sin querer) y [Dejar el partido] si el rival no
    responde. Táctica: las pestanas Tácticas y Espíritus (el panel de auras entero de
    p19): asi tambien se invoca en la pausa y en la espera del saque (O-310).
  - El duelo (m04, b19-b23): la franja del objetivo ("¡Esquiva la defensa del
    oponente!", "¡Detén el regate del oponente!", "¡Elige un tiro!", "¡Bloquea el
    tiro!", "¿Encadenas el tiro?", "¡Defiende la portería!") y la barra [izquierdo]
    [rayo] [derecho]: Regatear | Romper, Tapar | Entrada/Cargar (el boton partido en dos,
    como el "Volée Tir"), Tirar | Vaselina, Testarazo | Volea, Bloquear | Dejar pasar, No
    encadenar | (nada), Parar | Despejar; debajo de cada uno su total ("total 1407", "de
    1055 a 2322", "disputa 478") y lo que se puede ir fuera. El rayo abre la lista de
    supertecnicas (m05: 2x4 casillas con su elemento, ✦ si es de espiritu y su coste en
    tension; con mas de 8, paginas): se marca una y [¡Aceptar!]; sube como en Galaxy
    (t03: la barra aun se ve 67 ms y sus botones salen por los lados). La franja morada
    del espiritu: en un foco la hipertecnica (★ Usar: gana el duelo), en el tiro y el
    penalti [Invocar]. La caja de ayuda con lo de antes (marcar el pase en un foco, el
    balon alto, quien esta en la linea de tiro, el rival que ha invocado). Siguen los dos
    pasos muro -> portero y tiro -> cadena con la tension de cada uno. Tras elegir, la
    barra azul con [Atrás] apagado y, online, "Espera unos instantes...". Con los focos
    automaticos no sale la barra.
  - El penalti (b46): "PK" y la porteria dibujada de frente con 3 casillas (al pasar el
    raton, cian con la mano); pulsar una elige la zona (como se ve en tu pantalla);
    antes, si quieres, una supertecnica con el rayo.
  - El descanso y el final (b44, b45): las estadisticas en el panel verde (tus cifras a
    la izquierda, la posesion en la barra azul y roja, los goles de cada lado), [Menú] y
    [Segunda parte] / [Prórroga] / [Seguir]; al final [Otro partido] y quien ha ganado.
  - El rival que se ha ido (online): la caja con quien se ha ido, el marcador y [Otro
    partido], en cualquier fase.
  - La franja oscura de abajo (b47): los avisos de lo tuyo ("demasiado lejos para
    chutar", "Muy cerca del balón", el cambio preparado) y, como en Galaxy, cuando a uno
    de los tuyos se le acaba el espiritu ("X se queda sin su espíritu (vuelve en N s)",
    hasta ahora no se decia en ningun sitio). Fuera del partido (errores, invitaciones),
    en la franja de la pantalla de elegir.
- Las defensas de los clics de siempre (O-305): el segundo clic de un doble clic no
  cuenta, ni un clic en algo que acaba de salir (300 ms), y la tactil no se rehace con
  el raton apretado. La barra espaciadora pulsa el boton que toca (la mano, Seguir,
  Jugar o "Segunda parte").
- partido.js: sin los paneles de antes; vigilar() hace cada cuadro lo que no es pintar
  (repetir la eleccion y el Jugar del invitado cada 1,5 s, el ayudante de los focos
  automaticos, los avisos), aunque la tactil no se rehaga. De momento (hasta E4), arriba
  encima del mapa: en un duelo las caras con el poder de base y luego el resultado con
  las filas de siempre.
- "Cómo se juega" al dia: los iconos, la pausa, Equipo, el rayo y la franja morada.
- Pruebas: nueva prueba-g3.js (142 OK: en cada fase y papel, que paneles y botones salen
  y cuales apagados con su porque: juego (la columna, el numero del aura con 40, 150 y 200
  de hiperbarra, tras invocar y sin espiritus; TS sin tacticas o con una activa; la T),
  los compactos, la pausa, el saque y el Menú, Equipo (los puestos, el cambio en dos
  pasos, pendiente en la pausa y en el acto en el saque, el expulsado), Registro, Táctica
  con los espiritus en la pausa y en el saque, los focos con balon y defendiendo (el
  boton partido), el tiro en el suelo, alto y desde lejos, muro -> portero con la tension
  del bloqueo, tiro -> cadena con su total, el rival que invoca, la lista con 3, 8 y 10
  tecnicas, el penalti tirando y parando, la espera, el descanso, la prorroga, el final,
  el rival que no responde o se va; vigilar() repite la eleccion y el Jugar del invitado
  sin pintar; y con un DOM de mentira las 19 vistas montadas y las defensas de los
  clics). Las de siempre en verde (prueba3ds, e1 a e6, o315, g1, g2; fotos "iguales:
  true"): prueba-e3, e4, e5 y e6 leen ahora la pagina como partido.js + partido-abajo.js
  + partido-arriba.js, sin quitar nada de lo que miran.
- Capturas (Chrome headless, juego/cdp/gx_e3.mjs; comparadas con comparar.py e3 en
  galaxy/comparado/e3_*, Pizarra a la izquierda y Galaxy a la derecha) en la ventana de
  Pizarra de 1366x697 y 1920x1001, y una vez una al lado de otra y al 125 %: la columna
  (b01, b02, m02), la pausa (b12, m07), el Menú (b13), el tiempo de tactica (b14, b15,
  b16, m06, p16), el foco (b19, m04), el robo (b20), el tiro (b21), el portero y el muro
  (b22), la franja del espiritu (b23), la lista (b24-b27, m05 y la tira de t03 a +0, +33,
  +67, +170 y +270 ms), la espera (b17, b18, m08), las auras enteras y compactas (b39-b41,
  m09, p19), Equipo (p26), las estadisticas (b44, b45), el penalti (b46, p24) y el aviso
  (b47). Un partido entero contra la maquina jugado solo con la tactil y el raton de
  verdad (gx_e3_entero.mjs: pausa con un cambio en Equipo pulsado con doble clic (un
  solo cambio), Registro, una tactica en la pausa y otra con TS, invocar con el aura, la
  T, los focos con la barra y 21 veces con la lista, la ★, muro y portero, cambios en el
  saque, el descanso con su Menú, la prorroga y la tanda hasta el final con [Otro
  partido]), sin errores en la consola; y otro haciendo de invitado online de un
  anfitrion simulado en la misma pagina que pierde la primera eleccion y el primer
  Jugar: los dos se repiten y acaban con el mismo marcador.
- Lo que no queda igual que Galaxy: los botones dicen lo de Pizarra (Registro en vez de
  Objetos, que Pizarra no tiene) y llevan debajo los totales [PIZARRA]; la tarjeta del
  espiritu lleva la cara del jugador (no hay dibujos de los espiritus) y la segunda
  tarjeta es lo que da su hipertecnica; Equipo no tiene el "Coach" (van la tension y la
  hiperbarra); la pantalla de las tacticas y la franja de los avisos fuera del espiritu
  no salen en Galaxy; las letras siguen siendo las de Windows (O-316). El resultado de
  los duelos arriba es el de antes hasta E4.
- A confirmar con Aaron: los paneles de tacticas y espiritus pegados abajo sin parar el
  juego; Registro en el sitio de "Objetos"; Equipo con el cambio en dos pasos (uno del
  campo, uno del banquillo y Cambiar); el segundo clic para salir del partido; los
  textos de la franja del duelo como CS espanol.

### O-319 · El juego de partidos: el tiempo de las animaciones como GO Galaxy (E4)

Cuarto encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E4; el tiempo de cada cosa sale de las tiras t01-t23 y de la
guia 8). En el codigo los cambios citan esta nota. Retomado tras apagarse el PC.
- Las animaciones (una opcion nueva en la pantalla de elegir: "Completas" o "Cortas"; online
  valen las del que invita y viajan en el mensaje "equipos"; un invitado con un valor raro o
  sin el, sin animaciones). Con ellas el partido se para lo que dura cada animacion, como en
  Galaxy: la entrada al duelo (0,87 s), el choque, la supertecnica de cada uno (4,2 s
  completas, 1,6 cortas; la ★ y las de espiritu 5,0 / 2,0), las cifras que se fijan, el
  tiro en vuelo, el bloqueo, el portero, el gol (10,8 s completo con la repeticion), la
  tanda, la falta y la tarjeta, el fuera de juego y la banda, el corner y la puerta.
- El motor (web/partido-motor.js) solo cambia lo que espera: cada espera de un resultado o
  de un gol vale lo que dura su animacion (REGLAS.planAnim, en partido-reglas.js con la
  tabla REGLAS.ANIM), y el resultado lleva `anim` (el modo, la entrada y el total). Lo que
  pasa en el partido es lo MISMO con animaciones o sin ellas (los sucesos, los goles y las
  estadisticas de 12 partidos con semilla: prueba-g4). VERSION 9: online, los dos con el
  mismo Pizarra.
- El Director (web/partido-director.js, nuevo): decide en cada cuadro que se ve en cada
  pantalla, tramo a tramo del mismo plan que hace esperar al motor (en el invitado, con la
  espera que llega en las fotos). Lo que cuenta el resultado no sale antes de su momento:
  el marcador de arriba cambia al acabar el gol, y los rotulos y los sonidos del
  resultado, en su tramo. Graba los ultimos segundos de juego para la repeticion (tambien
  si el tiro se resolvio sin que lo viera empezar, como el invitado entre dos fotos).
- Arriba (web/partido-hud-duelo.js, nuevo), con un fondo 2D hasta que llegue el 3D (E5):
  el duelo eligiendo (las caras, el "Poder de base", los elementos, los apoyos con su
  "+ %"), y en la animacion las cifras "Poder total" rodando y fijandose (la que gana
  amarilla y la que pierde morada), "¡Crítico!", la ★ e "¡Hipertécnica!", la barra TEN /
  HIP con lo que gasta la tecnica, el nombre de la supertecnica grande y de su color, el
  rayo contra la mano del portero, "¡Tiro debilitado!" con "le quita N" y "¡Tiro
  bloqueado!", el "Talento +N %", las zonas del penalti, y el gol: el balon que rompe la
  mano, la porteria, el balon en la red con su fuego, "¡GOL!" y el marcador nuevo enorme.
- Abajo: los rotulos de Galaxy (web/partido-rotulos.js) con su tiempo y su forma:
  "¡SAQUE!", "Fuera de juego", "Descanso", "Fin del tiempo reglamentario", "Fin del
  partido" con "¡Victoria!" / "Derrota..." / "Empate", "¡Bloqueo!" con sus estallidos,
  la invocacion ("¡Invocación!", "¡Despertar!"... con su espiral), "¡Supertáctica!", el
  panel CAMBIOS cuando entran cambios de cualquier equipo, la placa "Poder total" del tiro
  en vuelo con la estela del balon, la repeticion del gol con "Vídeo" y, tras el gol,
  [Repetir] / [Reanudar partido] (cada uno en su PC; Reanudar lleva al tiempo de
  tactica). La tactil se apaga mientras sale una animacion y la barra del duelo sale a los
  670 ms, como en Galaxy. Se van los rotulos de antes (partido-hud-abajo.js) y el
  resultado provisional de E3 (mostrarResultado, filaDuelo).
- "Cómo se juega" al dia: las animaciones (completas o cortas) y Repetir / Reanudar.
- Lo que alarga un partido (medir-anim.js, 32 partidos de 2x15 maquina contra maquina, con
  los mismos goles): sin animaciones 3:58 min de media (78 s de esperas), con las cortas
  5:50 (como mucho 7:07) y con las completas 7:55 (como mucho 10:03). Por partido salen
  unos 19 focos, 16 tiros y 3,2 goles.
- Pruebas: nueva prueba-g4.js (60 OK: los mismos sucesos, goles y estadisticas con false,
  completas y cortas; cada espera = planAnim().total y `resultado.anim`; las duraciones de
  cada caso de planAnim; la entrada 0,87 / 0; el Director con un motor de mentira (que
  tramo a cada t, la sincronia con una espera que llega a saltos, el plan corto sin
  `anim`); fotos.js "iguales: true" con animaciones; los rotulos, los sonidos y el
  marcador no antes de su tramo; la foto no cambia mientras se elige; Repetir / Reanudar
  solo hacia el saque de centro, tambien con un gol que el Director no ve empezar; Sonido
  sin Director suena como antes). Las de siempre en
  verde (prueba3ds, e1 a e6, o315, g1, g2, g3; fotos "iguales: true"), adaptadas a los
  rotulos nuevos (copias de antes en prueba/*.antes-g4.js).
- Capturas (Chrome headless, juego/cdp/gx_e4.mjs con el reloj del Director parado;
  comparadas con comparar_e4.py en galaxy/comparado/e4_*, Pizarra a la izquierda y Galaxy
  a la derecha) en la ventana de Pizarra de 1366x697 y 1920x1001: las tiras t01, t02, t04
  a t15, t19, t20 y t21 fotograma a fotograma, y m03, a08 a a16, a20, a21, b31, b43, b48,
  p13, p14 y la ★. Con ellas se ajustaron los tamanos (las cifras, el nombre de la
  tecnica, los rotulos de abajo, "¡Tiro debilitado!" enorme medio segundo), los apoyos a
  la altura de a12, la escena de la tecnica que sigue detras al fijar, los estallidos
  azules del bloqueo, el rayo contra la mano y el fuego del balon en la red. Un partido entero con las completas y otro con las cortas jugados solo
  con la tactil (gx_e4_entero.mjs), sin errores en la consola: con las completas (18 min, con prorroga y tanda: la tactil apagada mientras salen, Repetir y Reanudar tras el gol, el marcador de arriba igual al del motor al final; lo que salio mal era del script, que contaba como atasco el tiempo de las animaciones, ya corregido) y con las cortas (9 min, todo bien). Y dos pestanas online en el mismo
  Chrome (gx_e4_online.mjs, unidas por una red de mentira en vez de los servidores
  publicos): valen las cortas del que invita en las dos, las dos con el mismo plan del gol y en su tramo a la vez (1,10 y 1,09 s), el mismo marcador arriba, Repetir / Reanudar en las dos y luego el tiempo de tactica y Jugar, sin errores (13 de 13).
- Lo que no queda igual que Galaxy: arriba un fondo 2D con la cara del jugador en vez de
  la escena 3D (E5); "¡GOL!" en vez de "BUT !"; en la escena del gol sale el que marca (no
  hay modelo del portero caido); tras el vuelo del tiro el negro antes del portero dura
  0,2 s (Galaxy ~0,7: la tabla del diseno); las franjas del bloqueo van en horizontal; el
  tiro no pierde fuerza en el vuelo (la placa se queda fija); y los rotulos que Galaxy no
  tiene: falta, tarjeta, penalti, "¡Fuera!" / "¡Desviado a córner!", el de la tanda
  [NO GALAXY]. El nombre de cada supertecnica entra a los 0,33 s (en Galaxy depende de la
  tecnica: la del muro de t08 a los ~2 s) y las tecnicas duran 4,2 s (Galaxy 5,4-8).
- A confirmar con Aaron: si las animaciones por defecto son las completas (un partido de
  2x15 pasa de 4 a unos 8 minutos) o las cortas (unos 6); Repetir / Reanudar tras cada
  gol; el panel CAMBIOS tambien con tus cambios (tapa la tactil 4,4 s); la cara del que
  marca en el gol.

### O-317 · Quitar una pasiva de gerente o entrenador

- En el juego se le puede quitar una pasiva a un gerente o entrenador y en el
  editor no se podia. Ahora hay un boton "Quitar" junto a "Cambiar" en cada
  pasiva de personal (editor normal y draft: es la misma orden pasiva_personal
  con el id vacio, que el draft ya permitia salvo con la regla sin pasivas).
- `E.quitar_pasiva_personal`: la ranura de la tabla con numero queda a cero
  (id y valor, como un convertido de O-185) y el contador de puestos del manual
  baja uno, asi que vuelve a estar libre en la mochila. Un Diamante no tiene
  manual que devolver. Probado en la partida de Aaron: quitar y volver a ponerla
  deja el contador como estaba.
- Al quitar las cinco se volvian a rellenar: `sincronizar_tabla_pasivas` tomaba la
  tabla vacia por la de un recien fichado. Ahora quitar deja la marca de
  desbloqueada puesta y solo se rellena si esta a cero del todo (marca incluida).
- Aaron: las de un gerente o entrenador DIAMANTE las pone el juego: no se
  quitan ni se cambian. El servidor lo rechaza, la ficha ensena "las pone el
  juego" y, si a alguno le faltaba alguna, se le vuelve a poner su juego.

### O-320 · El juego de partidos: el 3D de arriba como GO Galaxy (E5)

Quinto encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E5; guia 7.2, 8.4-8.8 y 10; O-307 punto 15). En el codigo los
cambios citan esta nota. El motor, la IA, el online (la foto no cambia: VERSION igual), la
tactil y el HUD de E4 no cambian. Retomado tras cortarse a medias (se reinicio el PC).
- Con WebGL, arriba se ve en 3D lo que hasta ahora era un fondo 2D: los duelos eligiendo, cada
  supertecnica, el choque, el tiro, el penalti, la invocacion y el gol, con el HUD de E4 encima
  tal cual (las cifras, la barra, el nombre, los rotulos). Sin WebGL (o con "Campo en 3D"
  quitado) sigue el fondo 2D de O-319.
- web/partido-escenas.js (Escenas, modulo ES): el Estudio, uno por pagina, con el estadio y
  el campo de abajo en mallas nuevas que comparten geometria y material (no sube nada nuevo a
  la grafica), las mismas luces y los ACTORES: un clon del modelo de VR de cada jugador
  (SkeletonUtils: comparte las mallas y las texturas ya reducidas de O-317; solo hace huesos
  nuevos), hecho una vez cuando abajo ya tiene su modelo y guardado (como mucho 22; al empezar
  otro partido se sueltan los que no juegan), y una ficha con su cara mientras llega. Lo unico
  que es solo de arriba: la pista detras de cada porteria (en Galaxy la red de atras da a la
  pista; abajo hay 4 m de cesped que no se ven).
- Cada cuadro, Escenas.componer() decide sin three (la prueba lo cuenta en node) que plano
  se ve, donde va la camara y que hace cada actor; lo llama el Director y lo deja en
  estado.arriba.escena (solo si el 3D esta listo: si no, HudDuelo pinta su fondo 2D); el Mundo
  lo pinta arriba (Mundo.alPintarArriba). Nada nuevo por cuadro: la salida se reutiliza (unos
  2 microsegundos) y en las mallas solo cambian posiciones y uniforms.
- Los planos del duelo (guia 7.2): a +530 ms (+600 en el tiro) la entrada baja (0,9 m)
  delante del que lleva el balon, que corre hacia la camara; a +870 el lateral de los dos
  frente a frente, el tuyo a la izquierda como sus fichas, con un vaiven lento; el tirador de
  frente y a +800 mas cerca; si te tiran, tu portero de frente en su porteria (p09).
- Las plantillas (diseno 6.6; guia 10), una por tipo, con el color y las particulas del
  elemento: el tiro (primer plano de la cara, el plano general subiendo con su aura, el golpe
  con un destello blanco y el balon en vuelo con su estela), el regate (le da la vuelta al
  defensa y se va), la defensa (se lanza y lo tumba), el bloqueo (salta y la cupula
  translucida del color de su elemento, con su shader) y la parada (la mano gigante, dibujada
  una vez). Sin tecnica: el choque en el lateral (al fijarse, el que pierde cae), la patada, el
  muro que salta y el portero que para; la preparacion del tiro y, en el penalti, la carrera
  desde detras y el balon que entra. Cada plantilla se estira o encoge a lo que dura su tramo
  (REGLAS.ANIM, completas y cortas).
- El fondo de las tecnicas: un plano de pantalla con un shader (el degradado radial del
  elemento y las lineas de velocidad que salen de los bordes, 24 cambios por segundo; las
  llamas de la armadura); encima del estadio, solo las lineas. Las particulas: 512 puntos con
  atributos fijos (su semilla) que mueve el shader: llamas que suben (fuego), espirales
  (viento), hojas que giran (bosque), rocas y polvo (montana); en Baja no salen (diseno 7.4).
- El espiritu: la ★ de un foco y las ✦ (tiro, muro, portero) empiezan con la carga (la camara
  sube desde los pies, la espiral de cintas cian que lo envuelve y crece, el fondo pasa al azul
  con lineas) y el espiritu que sale detras: el clon del jugador x3, translucido y del color de
  su familia (hecho una vez por jugador con espiritu); luego lo de su tipo con la silueta
  detras. Invocar sobre el mapa (t17, 4,3 s, sin parar el juego): negro, la carga, el
  espiritu enorme y su nombre (el del HUD). La armadura (t18): destello y el jugador con su
  armadura pegada (la misma silueta a x1,06) sobre llamas radiales.
- El gol (guia 8.6): la mano que se rompe entre fuego, detras del portero que se tira, el
  balon que se clava en la red de atras (desde detras de ella, con la pista debajo) y, tras el
  negro, la escena del portero caido de cerca y bajo con el balon botando delante (el "0 - 1"
  y "¡GOL!" son del HUD). Con las cortas, solo la escena.
- Los clips de VR nuevos (ievr/g4.py, ANIM_PARTIDO y VERSION_MODELO 3) NO se han hecho: falta
  el si de Aaron. partido-3d.js ya tiene el mapa de esos clips (ANIM_VR: regate y robo que
  ganan o pierden, entrada, cargar, testarazo, volea, parar, despejar, el gol encajado, el
  portero caido, celebrar, aturdido, salto): el Estudio usa cada uno si el modelo lo trae y,
  si no (los modelos de hoy), los 4 de siempre movidos a mano (saltos, la caida, tumbado).
- partido-3d.js (solo eso): alPintarArriba, lo fijo del campo y sus luces para el Estudio
  (c.fijas, c.luces) y ANIM_VR. partido-director.js (solo eso): estado.arriba.escena.
  partido-hud-duelo.js: con la escena 3D debajo no pinta su fondo 2D (el degradado, los
  retratos, la porteria y la red dibujadas); el HUD no cambia. partido-galaxy.css: la
  pantalla de arriba deja ver el WebGL de detras.
- Pruebas: nueva prueba-g5.js (66 OK: la plantilla de las 50 combinaciones de tipo, elemento e
  hiper con su color y sus particulas; la cupula, la mano, la silueta y la espiral donde
  tocan; cada plantilla cabe en su tramo con las completas y las cortas (los planos seguidos,
  el ultimo al acabar, ninguno de menos de 0,15 s); la camara de cada plano mira al actor
  correcto y ese actor sale en la pantalla de 400x240 (con three en node): la entrada, el
  lateral con el tuyo a la izquierda, el vaiven, el tirador (a 18 m tambien si chuta de
  cerca), el portero, los ~700 tramos de 4
  partidos maquina contra maquina con completas y cortas, el bloqueo, la ★, el penalti, la
  invocacion, la armadura y el gol; el clip de VR si el modelo lo trae; el Director solo
  compone con el 3D listo; componer reutiliza su salida). Las de siempre en verde (prueba3ds,
  e1 a e6, o315, g1 a g4; fotos "iguales: true" sin animaciones, completas y cortas);
  prueba-g3 lee partido.js sin los CR (desde el 2026-10-08 los ficheros de la pagina estan en
  CRLF), sin quitar nada de lo que mira.
- Capturas (Chrome headless, juego/cdp/gx_e5.mjs con el reloj del Director parado; comparadas
  con galaxy/trabajo/comparar_e5.py en galaxy/comparado/e5_*, Pizarra a la izquierda y Galaxy
  a la derecha) en la ventana de Pizarra de 1366x697 y 1920x1001 (las de un portatil de
  1366x768 y una pantalla de 1920x1080 maximizadas): la entrada a un duelo con el plano bajo y
  el lateral (t01, +533 a +1000 ms), el tiro (t02, p08), el portero (p09), una supertecnica de
  cada elemento (t04 y p10; el nombre contra a17-a19), el bloqueo (t08), la parada (t10), el
  gol (t11, t12, p13), la invocacion (t17), la armadura (t18, a22) y el nombre del espiritu
  (a24). Con ellas se ajustaron: la silueta del espiritu (salia a x2 en vez de x3 y la
  armadura no se veia), la espiral de la carga (cintas cian que crecen, el fondo que pasa al
  azul), la camara de los tres planos del gol (detras del portero, desde dentro de la
  porteria; la red, desde detras de ella) y de la escena del portero caido con el balon a la
  izquierda, la pista detras de la porteria y el regate que se salia del plano al fijarse
  las cifras. En el partido entero salio ademas que un tiro de cerca metia la camara y el
  balon en vuelo dentro de la red: arriba el que chuta se pone a 18 m como poco (no en el
  penalti).
- Memoria y tiempo (diseno 7.5; en el headless, gx_e5.mjs): MUNDO.info() con 187 geometrias y
  588 texturas antes y despues de 20 animaciones seguidas (focos y tiros con y sin tecnicas,
  muro, parada y gol): la memoria no crece (los 22 actores y sus 22 siluetas ya estaban hechos
  y subidos). JS por cuadro en una animacion de tiro, cuadro a cuadro: el Director con
  componer 0,04 ms de media (0,1 como mucho) y lo de Escenas sin el render 0,03 ms (0,2 como
  mucho; el reloj del headless va de 0,1 en 0,1 ms).
- Un partido entero contra la maquina jugado solo con la tactil (gx_e5_entero.mjs, como el de
  O-319 mirando ademas el 3D de arriba): con las completas, 14 min, 37 planos distintos (la
  entrada, el lateral, el portero, el choque, el regate, la defensa, la ★ de
  defensa, la ✦ de tiro, el tiro, el bloqueo con su cupula, la parada con su mano, sin
  tecnica, la preparacion y el gol en sus tres planos y la escena), el marcador de arriba
  igual al del motor, sin errores en la consola; MUNDO.info() acaba con 203 geometrias y 646
  texturas (los dos que entraron del banquillo traen su modelo y su actor). Y otro con las
  cortas (14 min, 38 planos: tambien la ★ de regate y la invocacion sobre el mapa entera),
  con todo lo de la tactil bien (invocar y la tactica en juego, cambios, Repetir y Reanudar,
  el final con [Otro partido]) y sin errores en la consola.
- Lo que no queda igual que Galaxy: las supertecnicas son plantillas por tipo y elemento (en
  Galaxy cada una es una pelicula); los espiritus no tienen modelo (la silueta del jugador x3
  del color de su familia); el portero caido no tiene la pose de Galaxy (tumbado a mano: el clip
  esta en VR, a confirmar); la red es de rombos (la del campo de abajo) y no de hexagonos; el
  estadio es el sencillo de abajo; "¡Armadura!" sale en la tactil (el rotulo de E4) y no
  arriba.
- A confirmar con Aaron: rehacer los modelos con los clips nuevos de VR (VERSION_MODELO 3: cada
  PC los vuelve a convertir una vez, ~1,2 s cada uno; va en el Pizarra.exe siguiente); la
  silueta translucida x3 como espiritu; la pista detras de las porterias solo arriba.

### O-321 · El juego de partidos: rendimiento, acabado y revision de las pantallas como GO Galaxy (E6)

Sexto y ultimo encargo del diseno de las pantallas como Galaxy (scratchpad
juego/galaxy/DISENO_PANTALLAS.md, E6; diseno 7 y 10). En el codigo los cambios citan esta
nota. Las reglas, la IA y la foto del online no cambian (VERSION igual).
- El contador de FPS (la opcion "Ver FPS" de la pestana Pantalla, o /partido?medir para las
  capturas) dice ahora "60 FPS · JS 1,8 ms · 3D 2,9 ms · Media (auto)": las imagenes por
  segundo, lo que tarda cada una en el programa (el motor, el Director, los HUD y la
  tactil) y lo que tarda en mandar el 3D a la grafica, por separado, y la calidad que ha
  puesto la automatica. Es lo que Aaron tiene que mirar en su portatil (abajo, a
  confirmar). Por dentro: el bucle mide cada cuadro (Consola.finCuadro), el Mundo cuenta
  los ms de sus render (msRender) y las llamadas de dibujo de cada pantalla (MUNDO.info()
  las da: llamadasAbajo, llamadasArriba) y Escenas.pintar dice cuanto fue su JS; cada
  medio segundo queda en Consola.rendimiento. El contador pasa de arriba a la derecha de
  la ventana a abajo a la derecha: mas largo, tapaba la esquina del marcador rival en una
  ventana pequena con las pantallas una encima de otra.
- La calidad automatica, ajustada (diseno 7.4): sigue empezando en Media, bajando un
  nivel si el intervalo entre cuadros pasa de 22 ms 3 s seguidos (44 en Baja) y subiendo
  uno, una vez por partido, tras 10 s sin perder cuadros; nunca en mitad de una animacion.
  Lo nuevo: (1) no mide mientras se cargan los modelos o el servidor los convierte (el
  Mundo lo dice cada cuadro, MUNDO.cargando()), ni los 3 primeros s del partido, ni 1 s
  despues de cambiar el tamano de la ventana o el nivel: esos tirones no son de la grafica
  y la bajaban al empezar; (2) no vuelve a subir al nivel del que ya bajo por lento (en el
  headless iba Media -> Baja -> Media -> Baja: el cambio se ve y no sirve de nada). En Baja
  pinta 30 de verdad (30,0 por segundo medidos), tambien en pantallas de 75, 120 o 144 Hz.
- Arreglo: en Baja los modelos de abajo se movian a unas 20 imagenes por segundo y no a 30:
  con el limite de 30 FPS los cuadros llegan cada 33,2 o 33,4 ms y la cuenta "lo que ha
  pasado >= 1/30 s" se saltaba uno de cada tres. Con 4 ms de margen, una por cuadro
  (medido: de 9,4 a 12,9 modelos movidos por cuadro, los que se ven).
- Arreglo: tras un gol a veces no salian [Repetir] / [Reanudar partido]. El reloj del
  Director puede ir hasta 0,25 s por delante del motor (con cuadros lentos el motor pierde
  tiempo y el Director solo se corrige pasado ese margen); si la animacion acababa con el
  motor aun en el gol, el Director daba el gol por visto antes de la espera del saque y no
  ponia los botones. Salio en el partido online de dos pestanas (al que invita). Ahora la
  animacion espera en su ultimo cuadro a que el motor salga (partido-director.js).
- "Cómo se juega" al dia: las animaciones en 3D arriba con los modelos, la invocacion que
  se ve arriba sin parar el juego, los focos automaticos, el online que no responde
  ("Espera unos instantes...", "Dejar el partido") y la pestana Pantalla (las pantallas,
  la calidad, Ver FPS, el campo en 3D).
- Medido en el navegador (Chrome headless con el 3D por software: valen los ms de JS, las
  llamadas y la memoria, no los FPS; juego/cdp/gx_e6_medir.mjs, un partido de 2 x 30 con
  las completas, tu lado tambien a maquina, 1366x697):
  - la carga: los 22 modelos (ya convertidos) en unos 3 s, dos a la vez; al acabar, dos
    cuadros de ~350 ms (se sube y se compila todo de una vez, abajo y arriba), en la espera
    del saque inicial.
  - a los 0, 1 y 5 minutos, 187 geometrias, 587 texturas (~41 MB en la grafica con Media,
    las de los modelos a 256) y 40-42 MB de memoria JS; tras dos cambios (dos modelos y dos
    actores nuevos), 203, 646 (~44 MB) y 44,5 MB, y asi hasta los 10 minutos. Con Alta (a
    512) las texturas son ~131 MB (el presupuesto de 7.3 bis era 130).
  - el JS por cuadro: en juego 1,0-1,6 ms de media (el 95 % por debajo de 3,7); en las
    animaciones 0,9-1,2 ms (el 95 % por debajo de 2,5). Presupuesto: 4 y 6 ms. Lo que pasa
    de 20 ms es una vez: al llegar un modelo nuevo (copiarlo y reducir sus texturas).
  - las llamadas de dibujo: abajo hasta 107 en juego (presupuesto 120); arriba 18-32 en
    casi todos los planos, 38-39 en algunos duelos de los partidos enteros y 46 una vez en
    la medida de 10 minutos (presupuesto 40); el cuadro en que se sube todo, una vez,
    ~340-370.
  - la calidad automatica en el headless (lento a proposito): baja a Baja a los 20-50 s y
    ahi se queda.
- Un partido entero contra la maquina jugado solo con la tactil (gx_e6_entero.mjs, como el
  de O-320, con una medida cada minuto) en la ventana de un portatil de 1366x768 (1366x697)
  y de una pantalla de 1920x1080 (1920x1001) con las pantallas una encima de otra y las
  completas, y otro con las cortas una al lado de otra (1366x697, con prorroga y tanda):
  sin errores en la consola, el marcador de arriba igual al del motor, la memoria JS
  estable (44-45 MB de los 7 a los 13 minutos), las geometrias y texturas solo crecen con
  los que entran del banquillo. Dos comprobaciones salieron mal una vez cada una (invocar
  con el aura y la tactica con TS en juego): un duelo empezo justo despues de abrir el
  panel; probadas aparte con el raton y el motor quieto (gx_e6_ts.mjs), van bien.
- Online con dos pestanas del mismo Chrome (gx_e6_online.mjs, la red de mentira de O-319):
  un partido corto entero (el gol del que invita, Repetir / Reanudar en las dos, luego las
  maquinas del que invita por los dos lados con el reloj adelantado a los 14:40 de cada
  parte, segunda parte y final): las dos con el mismo plan del gol a la vez, el mismo
  marcador (motor y arriba), [Otro partido] al final y sin errores (17 de 17, tras el
  arreglo de Repetir / Reanudar).
- Revision de las 32 pantallas de Galaxy (p01-p32), cada una con la de Pizarra en el mismo
  momento al lado (juego/cdp/gx_e6.mjs y galaxy/trabajo/comparar_e6.py; en
  galaxy/comparado/e6_pNN_<tamano>.png, Pizarra a la izquierda con las dos pantallas como
  el video y Galaxy a la derecha; e6_indice_<tamano>.png, todas juntas) en 1366x697 y
  1920x1001, una al lado de otra en 1366x697 y, algunas, en 1536x795 al 125 % y en
  1366x633 (Chrome). Contra O-307: se juega en el 3D de abajo cerca del balon y arriba esta
  el mapa entero (puntos 1 y 13); la estetica, el layout y las animaciones son las de
  Galaxy (punto 15) con lo de abajo. Lo que NO queda igual que Galaxy (sin cambiar, por
  ser decisiones de otros encargos o grande):
  - Pizarra no tiene objetos, fusion ni auras de animal: en su sitio, Registro (p25), la ★
    de un foco (p30) y el panel de los espiritus en juego (p20).
  - el tiro en vuelo con la tactil sin la columna de iconos (en Galaxy, p11, se ve) y sin
    el numero que baja (a confirmar: 16).
  - en la eleccion del tiro y del portero Galaxy pone una barrita de rayos y mano sobre la
    ficha del portero (p07, p08, p09): Pizarra no (no se sabe que mide).
  - la caja de ayuda sale siempre en la pausa y en el tiempo de tactica (en Galaxy, solo a
    veces); "¡SAQUE!" tapa la tactil 1,6 s al pulsar Jugar.
  - el estadio de arriba es el sencillo (cielo liso, gradas de puntos); la red de rombos.
  - los "¡Aquí!" se encienden y apagan (1,1 s si, 0,6 s no) aunque el juego este quieto.
  - con una supertecnica de tiro lejano la zona de tiro sale desde el medio campo (a
    confirmar: 14).
- Lo grande, apuntado para otro dia: (1) cada modelo de VR son ~7 mallas (7 llamadas de
  dibujo por jugador): juntarlas por material bajaria a la mitad las llamadas de abajo y
  de arriba; (2) que la automatica recuerde el nivel de un partido a otro (hoy empieza en
  Media cada vez y en un ordenador lento tarda unos segundos en bajar); (3) abrir Pizarra
  con la ventana maximizada (maximized=True en lanzador.py, va en el .exe); (4) los clips
  de VR nuevos (O-320).
- Pruebas: nueva prueba-g6.js (21 OK: el limite de FPS a 60, 75 y 144 Hz y en Baja con
  vaiven; la automatica en un ordenador lento (baja a los 6 s y no vuelve a subir), en uno
  rapido (sube a Alta una vez y si va lenta vuelve a Media y ahi se queda), sin medir
  mientras se cargan los modelos o tras cambiar el tamano, nunca en una animacion; el
  contador con el JS y el 3D; lo que dan el Mundo y las Escenas para medir; los
  mezcladores de Baja; y Repetir / Reanudar con el reloj del Director por delante, que con
  el Director de antes falla). Las de siempre en verde (prueba3ds 175, e1 98, e2 68, e3
  88, e4 65, e5 82, e6 85, o315 84, g1 56, g2 58, g3 142, g4 60, g5 66 OK; fotos "iguales:
  true" sin animaciones, con las completas y con las cortas); ninguna se ha tocado.
  medir-vr y medir-anim dan lo mismo que antes de E6, linea a linea (4,08 goles y 14,75
  tiros por partido; 3,19 goles y 16 tiros, 3:58 / 5:50 / 7:55 min).

A confirmar con Aaron (la lista entera del diseno, con lo que fue anadiendo cada encargo):
1. Las pantallas una encima de otra como la 3DS por defecto (en un portatil de 1366x768
   con la ventana maximizada la de abajo, donde se juega, mide 448x336; en 1920x1080,
   649x486) o una al lado de otra, mas grandes (593x445). Y abrir Pizarra ya maximizada.
2. Las letras: bajar las 4 OFL (~0,5 MB de github.com/google/fonts) o seguir con las de
   Windows.
3. Tu equipo siempre azul y a la izquierda, tambien cuando eres el invitado.
4. Los escudos dibujados con las iniciales (no hay emblemas en los datos), la camiseta del
   busto y los colores de las pastillas de posicion (DEL rojo, MED azul, DEF verde, POR
   naranja).
5. Las animaciones "Completas" por defecto (un 2 x 15 pasa de ~4 a ~8 minutos) o "Cortas"
   (~6).
6. [Repetir] / [Reanudar partido] tras cada gol (cada uno en su PC).
7. El panel CAMBIOS tambien con tus cambios (tapa la tactil 4,4 s).
8. La camara vuelve sola al balon a los 1,5 s de soltar las flechas con el balon en juego;
   parado, se queda donde la dejes.
9. Las tacticas y los espiritus en paneles pegados abajo que no paran el juego; en la pausa
   y en la espera del saque, en Táctica > Espíritus.
10. El icono T con la ficha grande arriba; el Menú [Registro] [Equipo] [Táctica] [Atrás] y
    la pausa [Registro] [Equipo] [Táctica] [Seguir] (Registro en el sitio de "Objetos").
11. Equipo con el cambio en dos pasos (uno del campo, uno del banquillo y Cambiar) y el
    segundo clic para salir del partido.
12. Sobre los jugadores: el nombre del elegido y del que lleva el balon, la barra del
    portero (KP) y la del que tiene el espiritu (AURA) (Galaxy no pone nada); los
    triangulos de los que no se ven, de los dos equipos.
13. Los jugadores y los discos del tamano de Galaxy (cabezones, x2,2) o del real.
14. La zona de tiro desde tan lejos (con una supertecnica de tiro lejano sale desde el
    medio campo) o solo cerca del area, como Galaxy.
15. Los textos de la franja del duelo como Chrono Stones en espanol ("¡Esquiva la defensa
    del oponente!" al que lleva el balon) aunque Galaxy los ponga al reves.
16. El tiro en vuelo con el numero fijo (en Galaxy baja con la distancia; en Pizarra el
    tiro no pierde fuerza).
17. Las animaciones de VR que faltan para los duelos, las paradas y los goles: rehacer los
    modelos en cada PC (una vez, ~1,2 s cada uno; va en el Pizarra.exe siguiente).
18. El espiritu como la silueta translucida del jugador x3 del color de su familia; la
    pista detras de las porterias solo arriba.
19. "¡Supertáctica!", "¡Falta!" y las tarjetas con rotulos que no salen en Galaxy (de
    Chrono Stones y GO Light).
20. Que active "Ver FPS" en la pestana Pantalla, juegue un rato en su portatil y diga lo
    que pone (los FPS, los ms de JS y de 3D y la calidad), y si la calidad Automatica le
    va bien o prefiere fijarla.

### O-322 · El juego de partidos: lo que dijo Aaron al probar el rediseno (2026-10-10)

Respuestas: animaciones COMPLETAS, buscando en todos los ficheros del juego las
animaciones reales de VR de cada supertecnica y de cada transformacion (mixi max,
kenshin, alma, modo...); Repetir/Reanudar tras el gol, si; rehacer los modelos con
mas clips de VR, si; va fluido en su PC.
Fallos y como tiene que ser:
1. Al mover a un jugador en un saque, si hay un rival cerca se mueven juntos.
2. Saques (y faltas, etc.): en la pantalla de "Jugar" se puede MOVER a los
   jugadores pero no dibujar flechas. Al dar a Jugar se pueden dibujar flechas pero
   no moverlos. Nadie se mueve (ni los rivales) hasta que el balon esta en
   movimiento (saca uno u otro): hasta entonces solo se ven las flechas. Nada de
   duelos antes del saque.
3. El tiro: el que chuta elige la tecnica y chuta; el balon viaja hacia la
   porteria; si hay un jugador en medio, al llegarle sale elegir el bloqueo; al
   llegar a la porteria, el portero elige su tecnica. Mientras el balon va, se
   pueden dibujar flechas para llevar a los jugadores a rango de bloqueo. (No como
   ahora, que sale el bloqueo y la parada a la vez antes de chutar.)
4. La T de la pantalla es el tiro largo: si tienes un tiro largo, lo usas y va
   como un tiro normal; si no, la T es un pase hacia delante.
5. El boton de espiritus guerreros PARA el juego para elegir (como en Galaxy o
   CS); en esa parada los dos pueden invocar (keshin, alma...), uno cada uno, y
   como mucho 3 en el campo. El boton tiene recarga antes de poder usarlo otra vez.
6. Las invocaciones (keshin, alma, modo, mixi max...) como en el juego: Thaddeus
   no se convertia en Byron ni cambiaba sus tecnicas. Tienen que cambiar el
   modelo, las pasivas, las tecnicas... igual que en VR.
7. Los calculos van raros: el portero saca mucho menos que en el juego. Revisar
   todos los calculos para que cuadren con VR (y con la calculadora de Pizarra).

## SUPUESTO

### S-01 · Los 9 huecos de `0x45E2D879` son ranuras de algo
Se leen `00 02 04 ff ff ff ff ff ff` — tres usados y seis vacios, con `ff` como
vacio. Podrian ser supertecnicas equipadas, equipacion o tacticas. Sin comprobar.

### S-03 · Las ranuras 2, 3 y 4 van en el orden del juego
`0x375EEC34` brazalete, `0x5E786ADF` colgante, `0x4C6B3FE3` especial. Solo se ha
confirmado la 1 (botas). Se resuelve equipando un objeto en cada ranura.

### S-04 · RESUELTO — era una copia desfasada, ver O-02 y O-15.

### S-05 · La fila 10566 es el almacen de tecnicas aprendidas sin equipar
La tecnica retirada a King aparecio ahi. 10566 = 4566 + 6.000. Se comprueba
aprendiendo una tecnica sin equiparla.

### S-06 · Los 60 bytes de `0xBB459017` van por grupos
Al subir de nivel se pusieron a 1 los bytes 9 y 10; al cambiar la tecnica, los
bytes 36 a 40, cinco seguidos. Sin interpretacion.

### S-02 · Los bloques A y B de 30 bytes son tablas paralelas
`3CAEA0BD` empieza por `07` y sigue todo `ff`; `38AFC2B8` empieza por `07` y
sigue todo `00`. Pinta de "lista de X" mas "contador de X". Sin comprobar.

---

## Cosas que NO hay que volver a intentar

Todo esto ya se descarto en el proyecto de referencia, con pruebas:

- Derivar el identificador de un personaje a partir de su nombre interno (ver O-04).
- Los offsets fijos publicados en la comunidad en enero de 2026: muertos en la
  version 7.1.2.
- Los hashes de campo de espiritus `0xAA2D1AF8` y `0xB7C0BE46`: no existen en esta
  partida.
- Buscar las estadisticas mostradas dentro de la partida (ver O-06).

---

## Origen de las reglas de legalidad

Dos sitios distintos, nunca mezclados (regla 6 del CONTEXTO):

- `datos/reglas-extraidas/` — sacadas automaticamente de los ficheros del juego.
- `datos/reglas-del-jugador/` — las que aporta Aaron de cabeza, cada una con su
  nota explicando por que es asi.

Ninguna de las dos carpetas tiene contenido todavia: son de la fase 2.
