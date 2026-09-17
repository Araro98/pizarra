# Pizarra

*La pizarra del entrenador para Inazuma Eleven: Victory Road.*

Editor de partidas de *Inazuma Eleven: Victory Road* que **no deja hacer nada que
el juego no pueda producir jugando**, mas una base de datos del juego y una
calculadora de poder. Todo funciona en tu ordenador, sin conexion.

## Como se abre

Doble clic en **`Pizarra.exe`** (en esta misma carpeta): se abre como un
programa, en su propia ventana, con el **menu de inicio**, hecho como la
pantalla de titulo del juego. (`herramientas\abrir-editor.bat` sigue valiendo:
hace lo mismo pero en el navegador, en `http://127.0.0.1:8765/`.) Las opciones:

| Opcion | Que es |
|---|---|
| **Editor de partida** | Tus jugadores, tu mochila y tus equipos. Cada cambio pasa por las reglas del juego: si el juego no lo dejaria, aqui tampoco sale. |
| **Base de datos** | Todos los personajes del juego con sus stats por nivel y rareza, su arbol, sus tecnicas y sus pasivas; y aparte supertecnicas, espiritus, pasivas y objetos. No toca tu partida. |
| **Calculadora de poder** | Cuanto saca un jugador en cada jugada (tiro, foco, disputa, muro) con sus stats, su supertecnica y las bonificaciones. Con jugadores de tu partida, del juego o a mano; si eliges un equipo tuyo, sus pasivas se suman solas. |

El editor trabaja sobre **una copia** de tu partida (`partidas/para-editar`, que hace el `.bat` al arrancar). Cuando
guardas, deja la partida editada en una carpeta nueva y te dice cual.

## Lo que nunca hay que hacer

1. **No renombrar el fichero de la partida.** Su nombre es literalmente la clave
   de cifrado. Renombrado, no lo abre ni el juego ni nosotros.
2. **Salir completamente de Steam antes de devolver una partida editada.** Si
   Steam sigue abierto, la nube la sobrescribe y parece que el editor no
   funciona. (Copiar *desde* el juego hacia aqui es seguro con Steam abierto.)
3. **Guardar dentro del juego** antes de sacar el fichero. Lo que no esta
   guardado no esta en el fichero.
4. **Guardar siempre una copia intacta** de la partida original. Esta en
   `partidas/original/` y no se toca nunca.

## Que hay en cada carpeta

| Carpeta | Que es |
|---|---|
| `partidas/` | Tus partidas: `original/` intacta, `actual/` la que se edita, `editadas/` lo que sale del editor. |
| `ievr/` | El codigo: leer y escribir la partida, las reglas, el servidor. |
| `web/` | Las pantallas: `inicio.html`, `editor.html`, `basedatos.html`, `calculadora.html`; `comun.js` y `comun.css` es lo que comparten. |
| `datos/reglas-extraidas/` | Tablas sacadas de los ficheros del juego (stats, tecnicas, pasivas, iconos...). |
| `datos/reglas-del-jugador/` | Reglas que aporta Aaron de cabeza, con su explicacion. |
| `datos/iconos/` | Los dibujos del juego, ya recortados. |
| `herramientas/` | Los `.bat` que abres tu, y los scripts que reconstruyen las tablas desde el juego. |
| `pruebas/` | Comprobaciones automaticas. |
| `referencia/` | Proyectos de otra gente que hemos consultado, y el volcador de tablas. |
| `NOTAS.md` | Todo lo que se ha ido descubriendo, numerado (O-1, O-2...), con su nivel de confianza. |
| `CONTEXTO.md` | Las reglas de trabajo del proyecto. |

## Pasarselo a alguien

`py herramientas\empaquetar.py` deja `Pizarra-portable.zip` (medio giga: casi todo
son los dibujos del juego). Quien lo reciba lo descomprime donde quiera y abre
`Pizarra.exe`, sin instalar nada: el programa busca su partida en su Steam solo
(la de la cuenta que haya jugado mas recientemente) y trabaja sobre una copia.
Cada cuenta de Steam tiene su propio nombre de partida (`XXXXXXXX-USERDATALIVE`)
y el programa lo respeta, porque ese nombre es la clave de cifrado.

Ojo: el zip lleva dibujos que son del juego. Es para pasarselo a alguien que lo
tenga, no para colgarlo en publico.

## Actualizaciones

El .exe mira al arrancar si hay una version nueva y, si quien lo abre dice que
si, la baja y la instala sola (se cierra y se vuelve a abrir). Para eso hace
falta un sitio publico donde dejar las versiones (un repositorio de GitHub con
"releases") y que en la raiz haya un fichero `actualizaciones.url` con la
direccion del `version.json` publicado. Sin ese fichero no busca nada.

Publicar una version (solo cuando Aaron lo diga):

```
py herramientas\publicar.py 2026.09.16 "Que cambia, en una linea"
```

Construye el .exe, empaqueta `pizarra-datos.zip` (pantallas, tablas y dibujos
recortados: lo que cambia entre versiones), escribe `version.json` y, si `gh`
esta instalada, sube la release; si no, deja los tres ficheros en `publicar/`
para subirlos a mano. Los dibujos grandes del juego no van en las
actualizaciones: van solo en el zip portable.

## Si el juego se actualiza

Los datos del programa salen de los ficheros del juego, asi que si sale una
version nueva hay que volver a extraerlos y comparar: `extraer_datos_juego.py`,
los `construir_*.py` de la lista de abajo y `comparar.py` sobre la partida
nueva. Lo que suele cambiar: personajes nuevos, tecnicas y pasivas nuevas, y
a veces el formato de la partida (que es lo delicado: se comprueba con las
pruebas).

## Comprobar que todo sigue bien

```
py -m pruebas.test_basico
py -m pruebas.test_escritura
```

Las dos tienen que decir "Todas las pruebas pasan". Lo importante que comprueban:
abrir tu partida y volver a guardarla sin tocar nada da un fichero identico, y
todo lo que el editor rechaza no ha tocado la partida.

## Volver a sacar las tablas del juego

Solo hace falta si el juego se actualiza. Cada script de `herramientas/` explica
arriba que hace y que fichero deja:

```
py herramientas\construir_personajes.py
py herramientas\construir_tecnicas.py
py herramientas\construir_stats.py
py herramientas\construir_arbol.py
py herramientas\recortar_g4tx.py --todas
py herramientas\construir_iconos_mochila.py
py herramientas\construir_iconos_pasivas.py
py herramientas\construir_valores_pasivas.py
py herramientas\construir_rareza_pasivas.py
py herramientas\construir_cuerpos.py
py herramientas\construir_hombros.py
py herramientas\construir_formaciones.py
py herramientas\construir_pasivas_fijas.py
py herramientas\construir_pasivas_personal.py
py herramientas\construir_tableros_diamante.py
py herramientas\construir_tableros.py
py herramientas\construir_tecnicas_origen.py
py herramientas\construir_duenos_espiritus.py
py herramientas\construir_pasivas_espiritu.py
py herramientas\construir_pasivas_limites.py
py herramientas\construir_sinergias.py
py herramientas\construir_anillos.py partidas\original
```

Y para volver a hacer el `.exe` (solo si cambia el codigo):

```
py herramientas\construir_exe.py
```
