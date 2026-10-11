/* Las reglas y numeros del partido (NOTAS O-286), en un solo sitio para
   poder ajustarlos. Las formulas de los duelos son las de Victory Road que
   se conocen (ayuda del propio juego, medidas de Pizarra O-156/O-157 y la
   comunidad japonesa); la forma de jugar (pausa en cada duelo, comandos) es
   la de los Inazuma de DS. Todo determinista salvo el azar, que sale de un
   generador con semilla para que dos PCs online saquen lo mismo. */
"use strict";

const REGLAS = {
  // campo en metros: x de -34 a 34 (ancho), y de -52.5 a 52.5 (largo).
  // El equipo 0 ataca hacia +y y el 1 hacia -y.
  ANCHO: 68, LARGO: 105, PORTERIA: 7.32, AREA_X: 20.16, AREA_Y: 16.5,
  PASO: 1 / 30,                 // la simulacion va a 30 pasos por segundo
  // online: los dos tienen que llevar la misma version del Partido; sube con
  // cada cambio de la foto o de las ordenes (O-308). 3: quien gana y los tiros (O-309).
  // 4: la hiperbarra, los espiritus y las hipertecnicas (O-310). 5: las tarjetas
  // (la foto lleva j[k][11], O-311). 6: el empate, la prorroga y los penaltis (la
  // foto lleva `pn`, el duelo "penalti" y la eleccion {zona, tecnica}, O-312). 7:
  // colocar a los jugadores en los saques (la orden "colocar", O-313). 8: las
  // distancias de cada saque (las zonas de colocar), la tanda a una sola porteria
  // (la tanda lleva `porteria` y cambia el sentido de los equipos en cada penalti) y
  // los cambios como en VR (la foto lleva j[k][12], el refuerzo, y `dc`, el
  // descuento) (O-315). 9: las animaciones de Galaxy (O-319): con ellas las esperas de
  // cada resultado duran lo que su animacion (el resultado lleva `anim`) y `equipos`
  // lleva `animaciones`; un Pizarra de antes no sabria ensenarlas. 10: los saques en dos
  // tiempos (O-324): en la espera solo se coloca (sin rutas, presion ni pase marcado) y
  // tras Jugar nadie se mueve hasta que se saca (la foto lleva `ps`). 11: el tiro que
  // viaja (O-325): cada etapa del tiro es un duelo de un solo lado (`etapa` y los roles
  // "muro" y "cadena"), su resultado lleva `etapa` y la foto lleva `tv`, el tiro en vuelo.
  // 12: el tiempo de invocacion (O-327): la fase "invocacion", la orden "tiempoInvocar", la
  // foto lleva `iv`, 3 hipers puestas por equipo y el modo convierte al jugador en su forma
  // 13: los calculos de VR (O-328): el PP de VR que se gasta con cada parada (la foto lleva
  // la fatiga del portero en j[k][13]), la carga de configuracion, la afinidad y el combo
  // (la foto lleva `cf`, `af` y `co`) y las pasivas del entrenador y los gerentes (`equipos`
  // lleva `personal` y `configuracion`); un Pizarra de antes sacaria otros numeros
  // 14: la pantalla de carga (O-329): el partido no empieza hasta que los dos han cargado todo
  // (cada uno manda "carga" con su %); un Pizarra de antes no lo manda y el otro le esperaria
  // 15: la equipacion del equipo en los modelos (O-334): `equipos` lleva la equipacion de cada
  // equipo y la ropa y el capitan de cada jugador; un Pizarra de antes los veria con la ropa
  // de su equipo de historia y el otro con la del equipo
  // 16: los tiros de O-335: el rango del tiro (el area y un poco mas), el tiro va adonde se
  // apunta (la orden del tiro y la eleccion del chute llevan `x`), el bloqueo entero se lo queda
  // el defensa y el pase marcado se quita tocandolo otra vez; un Pizarra de antes chutaria desde
  // mas lejos y al azar
  // 17: el duelo de O-336: solo la animacion del que gana (el choque de los nombres, "Fallo");
  // un Pizarra de antes sacaria otro plan (otras esperas y la tecnica del que pierde)
  // 18: la invocacion con el juego parado (O-337): la fase "invocando" y la foto lleva `vi`; un
  // Pizarra de antes no sabria que hacer en esa fase (y el ro de la invocacion lleva `vi`)
  // 19: la velocidad de cada jugador (O-340): `equipos` lleva la `velocidad` de cada jugador (y
  // de su forma) y con ella corre; un Pizarra de antes correria con la Agilidad
  // 20: la disputa aerea (O-341): el balon bombeado que cae entre uno de cada equipo se disputa
  // (el resultado "aerea" y su plan); un Pizarra de antes no sabria ensenarlo ni esperarlo
  // 21: los apoyos de O-342 (+4 % cada uno, Doble y Triple, y la entrada al duelo mas larga con
  // ellos); un Pizarra de antes jugaria los focos con los apoyos de antes y sacaria otro plan
  // 22: los arreglos de la vuelta 1 (O-335, O-341, O-342): fuera del rango normal solo el tiro
  // largo, la disputa aerea sin critico y el Doble y el Triple contando al que pelea; un Pizarra de
  // antes dejaria chutar cualquier tiro desde lejos y jugaria las disputas y los apoyos de antes
  // 24: las jugadas sin tecnica con su animacion de VR (O-345): el chute, el portero, el muro, el
  // duelo y la accion normal que gana a una tecnica duran lo de VR (ANIM sinTecnica, fallo y
  // falloDe); un Pizarra de antes sacaria otro plan (otras esperas)
  // 25: la vuelta 1 de O-345: cada jugada sin tecnica dura lo de la suya de VR (JUGADAS_VR, SEG_JUGADA),
  // el muro sin tecnica que no para el tiro sin su bloqueo y el portero que encaja con la suya cortada;
  // un Pizarra de antes sacaria otro plan (otras esperas)
  VERSION: 25,
  // el reloj de 3DS (O-308): partes de 15 o 30 minutos de reloj, a 12 s de reloj
  // por segundo real (videos: 11-12; VR: 12 lento / 14,1 normal). Una parte de
  // 15 son 75 s de juego corriendo
  RELOJ_RITMO: 12,
  PARTES_MINUTOS: [15, 30],     // lo que se puede elegir
  MITAD: 75,                    // s reales de una parte de 15 (por defecto; las pruebas pueden pasar otra)
  // si a las 15:00 el balon esta en juego, la parte sigue hasta que se pare
  // (como en CS y Galaxy: 15:20, 15:43), como mucho estos s de RELOJ; 0 = corta en seco
  FIN_PARTE_EXTRA: 120,
  // si hay empate al final (Aaron, O-307 punto 8: "elegir penaltis, prorroga o
  // nada"; como las reglas A/B/C de GO Light). Se elige al empezar (O-312)
  EMPATE: ["nada", "prorroga", "penaltis", "prorroga-penaltis"],
  // cada parte de la prorroga, un tercio de una normal: 15 -> 5:00, 30 -> 10:00 (VR:
  // soccerExtraTimeDefault 30 de 90). Se cambia de campo en cada parte y hay un
  // cambio mas (vida real). Sin gol de oro
  PRORROGA_FRACCION: 1 / 3, CAMBIOS_PRORROGA: 1,
  // la tanda: 5 cada uno (se acaba antes si uno ya no alcanza) y luego muerte
  // subita por parejas. Cada tiro, el que tira y el portero eligen zona (0 izquierda,
  // 1 centro, 2 derecha, del campo) y una supertecnica si quieren: zona distinta, gol;
  // la misma, gana el numero mayor (90-10). La maquina reparte las zonas con estos
  // pesos. PENALTI_ZONA_X: m del centro de la porteria a donde va cada zona (el cono)
  PENALTIS_TANDA: 5,
  IA_PENALTI: { tiro: [0.4, 0.2, 0.4], parada: [0.35, 0.3, 0.35] },
  PENALTI_ZONA_X: 2.5,
  RADIO_JUGADOR: 0.9,
  DISTANCIA_DUELO: 1.7,         // un rival a menos de esto: se para y hay duelo
  RESPIRO_DUELO: 3.0,           // segundos sin duelo para el que acaba de pelear
  ATURDIDO: 1.2,                // el que pierde un duelo se queda quieto esto
  VEL_PASE: 20, VEL_TIRO: 30,   // metros por segundo del balon
  ROCE: 0.985,                  // lo que frena el balon suelto cada paso
  // hasta donde se chuta (Aaron, O-335: "hay tiros que no son tiros largos que chutan desde
  // demasiado lejos... que el rango sea un poco mas de fuera del area"; antes, a 38 m de la
  // porteria en redondo): un tiro que no es largo, desde el area grande rival o a menos de
  // `fuera` m de ella en todas las direcciones (de frente, hasta 21,5 m de la linea de gol; de
  // lado, hasta 25,2 m del centro del campo). El tiro largo a punto, hasta `largo` m de la
  // porteria, como antes (38 x 1,6, O-326): contiene todo lo del normal (su punto mas lejano,
  // la esquina, esta a 33 m) y llega a 8 m de tu campo
  TIRO_RANGO: { fuera: 5, largo: 60.8 },
  // la TENSION de VR: una barra del equipo (max 300) que pagan las
  // supertecnicas. Su coste es el de VR (consumeTp, la columna `coste` de
  // tecnicas.csv; el "tp" de la tabla era el poder a nivel 1). Como en VR (O-310,
  // antes 120, +0,6 por segundo y +60 en el descanso): empieza en 105 (0,35 x 300)
  // y no sube sola ni en el descanso; ganar un foco o disputa sin tecnica ni hiper
  // +60; perder un foco +30 SIEMPRE (tambien con tecnica o contra una hiper);
  // perder una disputa (Cargar) nada; y +10 al equipo al que le pitan un fuera de
  // juego a favor. Ganar con supertecnica no da (fandom)
  TENSION_MAX: 300, TENSION_INICIO: 105, TENSION_GANA: 60, TENSION_PIERDE: 30,
  TENSION_POR_SEGUNDO: 0, TENSION_DESCANSO: 0, TENSION_DISPUTA_PIERDE: 0, TENSION_FUERA_JUEGO: 10,
  // el PP del portero no se recupera con el tiempo (VR; antes un 2 % por segundo). Solo la
  // hiper de un portero le suma un % de su maximo al invocar, y el descanso lo llena (O-328)
  KP_POR_SEGUNDO: 0,
  // la pausa de 3DS (icono de la mano): para el partido y dibujas rutas a
  // varios jugadores y marcas el pase. Sin limite de veces ni de tiempo (Aaron,
  // O-307): sigue cuando pulsan Seguir los dos (O-308). 0 = sin limite; con un
  // numero el motor sabe contar como antes
  PAUSAS_POR_PARTE: 0, PAUSA_MAX: 0,
  // cambios por partido (O-308: 5, como el futbol de hoy; antes 3). Se eligen
  // cuando quieras y entran al pararse el balon
  CAMBIOS: 5,
  // los cambios como en VR (Aaron, O-307 punto 16; textos de ayuda de VR) (O-315): el
  // que entra, AT y DF +`entra` % durante `segundos` s de juego, y sus companeros de
  // la misma posicion, +`posicion` % el mismo tiempo (se suman si hay varios). Va
  // fuera del tope de las pasivas, como la hiper; la parada del portero no (sube solo
  // con PP, O-304). Cada cambio con la parte en juego (no en el descanso) suma
  // CAMBIO_DESCUENTO s de RELOJ a la parte (VR: uAddAdditionalTimeOfPlayerChange 30;
  // aqui 2,5 s de juego)
  CAMBIO_REFUERZO: { entra: 15, posicion: 5, segundos: 60 }, CAMBIO_DESCUENTO: 30,
  // el descanso espera a que los dos pulsen "Segunda parte" (O-305), sin limite
  // de tiempo (O-308); 0 = sin limite
  DESCANSO: 0,
  // respiro del que saca de banda, de puerta o de corner, como en la falta (O-305)
  RESPIRO_SAQUE: 2.5,
  // el portero con el balon en su area no se disputa estos segundos (O-305; en
  // futbol no se le quita de las manos, y a los 6 s tiene que soltarlo)
  PORTERO_MANOS: 6,
  // cuando chuta la maquina: a menos de `lejos` m, con esta probabilidad en cada
  // decision (cerca de la porteria, con la linea libre o tapada). O-309: en partes
  // de 15 solo hay 150 s corriendo: tira mas (antes 18, 11, 0,15, 0,05, 0) para
  // unos 10 tiros a puerta por partido
  // O-315: y desde mas lejos (hasta `lejano` m, con la linea tapada un tercio) a veces,
  // como en la vida real: muchos de esos se van fuera (saque de puerta) o los para el
  // portero. Tira mas (antes 22, 13, 0,30, 0,12, 0,02) porque ahora despeja, centra y
  // el balon sale: con lo de antes salian 2,5 goles y 0,6 saques de puerta por partido
  // O-328: con el PP de VR (que se gasta con cada parada) y el muro que resta entero, chuta
  // algo mas y mejor (antes 26, 14, 0,6, 0,3, 0,06, 34, 0,3): si su mejor tiro llega a
  // `debil` x lo que le queda al portero rival, chuta con `pDebil` (con la linea libre o
  // cerca, hasta `lejano` m); al chutar usa su mejor supertecnica (si la paga) con
  // `tecnica` (en los focos, la de siempre); y si un muro le quitaria mas que la vaselina,
  // vaselina. Medido (prueba/medir-o328.js, 96 partidos de 2 x 15 con las opciones de la
  // pagina y los 11 equipos de la partida de pruebas): 3,1 goles por partido (el Partido de
  // antes de O-328, 2,45; con estos calculos y la maquina de antes, 2,8)
  // (O-335: y solo desde su rango, TIRO_RANGO, como la persona)
  IA_TIRO: { lejos: 28, cerca: 16, pCerca: 0.8, pLibre: 0.5, pTapado: 0.04, lejano: 38, pLejano: 0.3, debil: 0.6, pDebil: 0.9, tecnica: 0.95 },
  DUELO_MAX: 0,            // online: segundos para elegir en un duelo; 0 = sin limite, como en 3DS (Aaron, O-299)
  // apoyos en un duelo (DS/3DS): cada companero cerca suma, mas si es de su elemento. No
  // son de VR: se quedan hasta que Aaron diga (O-328)
  // Aaron (O-342): "que de un pequeno boost a ese duelo, si son del mismo elemento 2, pondra
  // doble y se potenciara mas, si hay 3 pondra triple". Hasta APOYOS_MAX (los mas cerca, a menos
  // de APOYO_RADIO m) y cada uno +APOYO; si APOYO_DOBLE_DESDE de ellos son del elemento del que
  // pelea, Doble (lo de los apoyos x APOYO_DOBLE) y si son uno mas, Triple (x APOYO_TRIPLE): 1
  // apoyo +4 %, 2 +8 % (Doble +12 %), 3 +12 % (Doble +18 %, Triple +24 %). Con el 90-10 (O-309)
  // el % de ganar sube +2,1 con uno, +6,0 con el Doble de dos y +11,3 con el Triple (medido sobre
  // los 1.344 focos de 80 partidos; antes, +5 % cada uno y +5 % mas si era de su elemento: hasta +13,6).
  // APOYO_ENTRADA: lo que dura de mas la entrada al duelo con Doble o Triple, para verlo
  // O-342, vuelta 1: "si son del mismo elemento 2 ... si hay 3" cuenta al que pelea, como en DS (el
  // manual: "if two players of the same element are nearby, they can double up ... three players of
  // the same element can triple up"; oupo: "si 1 de ellos es del mismo elemento, doble; si 2,
  // triple"). Asi APOYO_DOBLE_DESDE 1: Doble con 1 apoyo de su elemento y Triple con 2 (antes 2 y 3:
  // el Triple pedia 4 de campo del mismo elemento juntos y casi no salia, 0,2 % de los lados).
  // 1 apoyo +4 % (Doble +6 %), 2 +8 % (Doble +12 %, Triple +16 %), 3 +12 % (Doble +18 %, Triple +24 %)
  APOYO_RADIO: 7, APOYO: 0.04, APOYO_DOBLE: 1.5, APOYO_TRIPLE: 2, APOYO_DOBLE_DESDE: 1, APOYOS_MAX: 3, APOYO_ENTRADA: 0.48,
  // la maquina acerca a los suyos a apoyar (Maquina._apoyar, O-342): con un duelo a punto (el que
  // va a pelear a menos de `cerca` m del rival), hasta `max` de los que estan a menos de `desde`
  // m van a `dist` m de el, primero los de su elemento; atacando no se mueven los `atras` mas
  // atrasados. Medido (o342/diag-ia3.js, 80 partidos maquina contra maquina): 0,72 apoyos por lado
  // de cada duelo (sin acercarlos, 0,48) y el Doble en el 2,6 % (1,1 %); goles, tiros, focos y pases
  // igual (4,2 / 17,1 / 18,1 / 59; sin, 4,0 / 17,8 / 18,4 / 58). Con cerca 10 no llegaban a tiempo
  IA_APOYO: { cerca: 18, desde: 20, max: 2, dist: 4.5, atras: 2 },
  // n apoyos, m de ellos del elemento del que pelea -> {factor, doble: 0, 2 (Doble) o 3 (Triple)}
  factorApoyos(n, m) {
    const d = this.APOYO_DOBLE_DESDE, doble = m >= d + 1 ? 3 : m >= d ? 2 : 0;
    return { factor: 1 + n * this.APOYO * (doble === 3 ? this.APOYO_TRIPLE : doble === 2 ? this.APOYO_DOBLE : 1), doble };
  },
  // faltas (3DS: el comando de la derecha arriesga falta): si el defensor gana
  // con "Entrada" o "Cargar", puede ser falta; en el area, penalti
  FALTA_ENTRADA: 0.22, FALTA_CARGA: 0.12, DISTANCIA_BARRERA: 9.15,
  // colocar a los tuyos antes de un saque (Aaron, O-307 punto 14: "donde sea, menos
  // demasiado cerca del balon") (O-313): los rivales del que saca, a esta distancia
  // del balon como poco, la de cada saque como en la vida real (O-315; antes 9,15 m
  // en todos): 2 m en el de banda y 9,15 m en la falta, el corner y el saque de
  // centro. En el penalti, nadie en el area ni en el semicirculo (los 9,15 m del
  // punto de penalti) salvo el que tira y el portero; en el saque de puerta, los
  // rivales fuera del area (regla 16)
  COLOCAR_LEJOS: { banda: 2, falta: 9.15, corner: 9.15, centro: 9.15, penalti: 9.15 },
  colocarLejos(tipo) { return this.COLOCAR_LEJOS[tipo] || this.COLOCAR_LEJOS.falta; },
  // al volver el juego, los colocados se quedan en su sitio hasta que alguien coge
  // el balon, como mucho estos segundos (si no, se iban a su zona al sacar) (O-313;
  // desde O-324, contados desde que se saca)
  COLOCADO_SEGUNDOS: 3,
  // tras pulsar Jugar nadie se mueve hasta que se saca (Aaron, O-322 punto 2): la
  // maquina saca a estos s (el reloj esta parado), para que le de tiempo a la persona
  // a dibujar las flechas de los suyos (en el de centro, tras el rotulo "¡Saque!" de
  // 1,6 s) (O-324)
  SAQUE_MAQUINA: 3.5,
  // las tarjetas (Aaron, O-307 punto 12: como en VR, pero raras) (O-311). En cada
  // falta, una tirada: roja directa, amarilla o nada. Las fuertes (con Entrada o en
  // el area) tienen mas. Dos amarillas son roja, y no se expulsa a nadie de un
  // equipo con menos de 8 en el campo (nunca baja de 7). VR game_param:
  // yellowCardRate 0,2 y enableRedCardMemberNum 8; lo demas, inventado con sentido
  TARJETAS: { amarilla: 0.20, amarillaFuerte: 0.35, roja: 0.005, rojaFuerte: 0.03, minimoParaRoja: 8 },
  // la HIPERBARRA de VR (O-310; Aaron, O-307 punto 7: los espiritus no gastan
  // tension sino hipertension). Una por equipo, de 0 a 200, empieza en 40 y cada
  // hipertecnica (invocar un espiritu) gasta 100. Se llena SOLO usando
  // supertecnicas: lo que cuestan de tension x0,4 un tiro, x0,6 un regate, x0,8
  // una defensa (y el muro) y x1,0 una parada. Las "habilidades reales" (Vaselina,
  // Tiro con efecto...: las de nombre interno rh*) no llenan nada. VR game_param
  HIPER_MAX: 200, HIPER_INICIO: 40, HIPER_COSTE: 100,
  HIPER_LLENA: { Tiro: 0.4, Regate: 0.6, Defensa: 0.8, Parada: 1.0 },
  // como mucho 3 del mismo equipo con la hiper puesta a la vez (Aaron, O-322 punto 5:
  // "que solo puedan haber 3 en campo"; Galaxy: "Activos N/3"; en VR son 2) (O-327), y 15
  // s sin que nadie mas del equipo invoque tras una invocacion (comunidad de VR, desde la
  // 5.0.0). Con la hiper puesta corre un 10 % mas (VR no da el numero)
  HIPER_ACTIVAS_MAX: 3, HIPER_BLOQUEO: 15, HIPER_VELOCIDAD: 10,
  // el tiempo de invocacion (O-327; Aaron, O-322 punto 5): el boton de los espiritus para
  // el juego para invocar y vuelve a los `recarga` s de juego (para los dos: los dos han
  // tenido su parada). Online la parada dura como mucho `limite` s (luego sigue sin mas)
  TIEMPO_INVOCAR: { recarga: 20, limite: 20 },
  // cada familia de hipertecnica (VR: AURA_CMD_INFO_LIST y AURA_CMD_EFFECT_LIST):
  // cuanto dura y cuanto tarda en volver tras acabar (s de juego, sin escalar), el
  // % que suma a AT y DF de los duelos, el % al poder de sus supertecnicas y el %
  // de su PP maximo que le SUMA al PP si es portero, al invocar, y se queda (VR: la unica
  // recuperacion; antes solo mientras duraba, O-328). El totem crece +20 % por
  // foco ganado (35, 55, 75 %) y lo guarda para la siguiente vez. El vinculo no se
  // convierte en el companero: solo sus % (O-310). El modo SI cambia de forma (O-327)
  HIPER_TIPOS: {
    keshin:    { nombre: "Keshin",    rotulo: "invoca",    dura: 45, recarga: 60, atdf: 50, poder: 0,  pp: 15 },
    armadura:  { nombre: "Armadura",  rotulo: "armadura",  dura: 45, recarga: 60, atdf: 30, poder: 50, pp: 15 },
    miximax:   { nombre: "Miximax",   rotulo: "miximax",   dura: 45, recarga: 60, atdf: 50, poder: 20, pp: 15 },
    totem:     { nombre: "Tótem",     rotulo: "totem",     dura: 60, recarga: 60, atdf: 35, porFoco: 20, atdfTope: 75, poder: 0, pp: 15 },
    vinculo:   { nombre: "Vínculo",   rotulo: "vinculo",   dura: 60, recarga: 60, atdf: 10, poder: 20, pp: 0 },
    despertar: { nombre: "Despertar", rotulo: "despertar", dura: 30, recarga: 90, atdf: 30, poder: 30, pp: 0 },
    modo:      { nombre: "Modo",      rotulo: "modo",      dura: 75, recarga: 90, atdf: 60, poder: 0,  pp: 0 },
  },
  // lo propio de dos despertares que no esta en su pasiva (los otros tres ya lo
  // llevan en pasivas-espiritu.csv), por id del espiritu: Determinacion de
  // portero (PP +20 %) y Guardian ferreo (DF +20 % y muro +30 %)
  HIPER_PROPIOS: { "D1A8183F": { pp: 20 }, "47981F48": { df: 20, muro: 30 } },
  // el tipo de hipertecnica de un espiritu: el `tipo` que pone partido.py; si
  // falta (un equipo de antes), por su familia
  tipoHiper(esp) {
    if (!esp) return null;
    if (esp.tipo && this.HIPER_TIPOS[esp.tipo]) return esp.tipo;
    return { kenshin: "keshin", mixi: "miximax", alma: "totem", armadura: "armadura" }[esp.familia] || "despertar";
  },
  // pase bombeado (mantener y soltar): mas lento y no se corta hasta que baja
  VEL_PASE_ALTO: 14, PASE_ALTO_BAJA: 4,
  // lo que hay que mantener pulsado (s) para que el pase salga bombeado (Aaron, O-341: "que tengas
  // que estar menos tiempo pulsando para los pases bombeados, ahora noto que es dificil hacerlos";
  // antes 0,45 s). Un toque normal dura 0,1-0,15 s. Al llegar, la tactil lo ensena (el aro lleno,
  // "Bombeado" y el arco hasta donde cae) y suena
  PASE_ALTO_PULSAR: 0.25,
  // la DISPUTA AEREA de VR (Aaron, O-341: "cuando haces un pase bombeado y hay dos jugadores (uno
  // tuyo y uno del rival) recibiendo el pase, hacen como una pequena animacion peleando por el balon
  // y se la lleva el que mas valor de disputa tiene"; ayuda de VR: "si el balon cae en un lugar con
  // jugadores de ambos equipos, se producira una Disputa"): el balon bombeado (pase, centro, corner,
  // despeje, saque) que baja (le quedan PASE_ALTO_BAJA m) con uno de cada equipo a menos de
  // `alcance` m (sin porteros: el suyo en su area la coge con las manos) se disputa. El del equipo
  // que lo mando, con su AT de disputa (Int + Fis); el otro, con su DF (Int + Pre); con sus pasivas
  // de disputa, el elemento de game_param (x1,05 / x0,95), la hiper y el cambio, sin apoyos (VR no
  // los tiene). Gana el numero mayor salvo un critico (O-307). Tension: +60 al que gana y nada al
  // que pierde (game_param AddTensionPowerVal_Scramble_Win 60 / Lose 0). `espera`: lo que se para
  // el juego sin animaciones (con ellas, lo de su plan: ANIM.aerea). `fin`: donde acaban, desde
  // donde cae (de ahi saltan los dos): lo que mueve la raiz de los clips de VR (el que gana se va
  // 1,77 m hacia delante; el que pierde, 0,65 m a su lado y 0,4 m atras) a la escala de las
  // figuras de abajo (x2,2): asi el motor deja a cada uno donde acaba su animacion
  AEREA: { alcance: 2.2, espera: 0.9, fin: { gana: 3.9, lado: 1.43, atras: 0.88 } },
  // (ya no hay tope general de las pasivas: VR solo tiene el de cada tipo, que ya estaba;
  // antes PASIVAS_TOPE 60 cortaba, p. ej., el AT de tiro de Gafas) (O-328)

  // la CARGA DE CONFIGURACION de VR (O-328; comunidad japonesa, NOTAS O-204): cada equipo
  // tiene la configuracion que mas se repite en sus pasivas (la manda partido.py) y un rango
  // de 1 a 5 que empieza en 1. Las pasivas "Por cada rango de Conf. X, ... +N %" valen N x
  // rango (con su tope por rango), solo las de la configuracion del equipo. Lo que sube y
  // baja el rango de cada una: `cada` s de juego +`sube` (Justicia, sin falta propia),
  // `baja` cada `cadaBaja` s (Contraataque), al robar el balon en campo propio / rival, por
  // falta pitada al equipo, por jugada brusca que sale bien (Entrada o Cargar sin falta),
  // por cada `gasto` de tension gastada (Tension) y por cada 15 % de afinidad gastada
  // (Vinculo). Justicia ademas: PP del equipo +5 % por rango desde el rango 2 (tope 20)
  CARGA_RANGO_MAX: 5,
  CARGA: {
    justicia:     { nombre: "Justicia", cada: 25, sube: 1, falta: -3, ppPorRango: 5, ppDesde: 2, ppTope: 20 },
    contraataque: { nombre: "Contraataque", roboPropio: 4, roboRival: 2, cadaBaja: 15, baja: -1 },
    juego_sucio:  { nombre: "Juego sucio", brusca: 1, falta: -1 },
    tension:      { nombre: "Tensión", gasto: 150, sube: 1, sinGastar: 45, baja: -1 },
    vinculo:      { nombre: "Vínculo", afinidad: 15, sube: 1, perdidas: 2, baja: -1 },
    brecha:       { nombre: "Brecha", cada: 15, sube: 1, critico: -4 },
  },
  // el PODER DE AFINIDAD de VR (O-328; game_param maxKizunaPower 30, addKizunaPowerPass 1,
  // subtractKizunaPowerPerSecond 2): +1 % por pase completado (mas lo de las pasivas "Al
  // hacer un pase, poder de afinidad +N %"), hasta 30 %; sin el balon baja 2 % por segundo y
  // se gasta entero al chutar a puerta (la cadena no lo gasta). El tiro final x(1 + afinidad)
  AFINIDAD: { pase: 1, max: 30, baja: 2 },
  // el COMBO DE TECNICAS de VR (O-328; game_param SoccerTechnicalComboBuffParam): ganar un
  // foco con supertecnica +1 (hasta 3); el siguiente tiro +10/15/20 % (se suma a la
  // afinidad) y las supertecnicas cuestan x0,5/0,25/0,25 de tension
  // (consumeUseSkillTensionPowerRate 50/75/75). Se pierde si el rival coge el balon y se
  // gasta al chutar
  COMBO: { max: 3, tiro: [0, 10, 15, 20], coste: [1, 0.5, 0.25, 0.25] },

  // quien gana un duelo (Aaron, O-307: "90-10"): el numero mayor, salvo un
  // CRITICO. Con numeros parecidos (hasta 1,5 veces) el 10 %; luego baja en linea
  // recta hasta 0 a las 3 veces. El critico es invento de Aaron, no de VR (los
  // "critical" de sus datos son del minijuego RPG). El que gana por critico se
  // queda con el numero del otro x1,05 a x1,20: nunca se ve ganar al pequeno (O-309)
  CRITICO: 0.10, CRITICO_DESDE: 1.5, CRITICO_HASTA: 3.0, CRITICO_SUBE: [1.05, 1.20],
  probCritico(a, b) {
    const r = Math.max(a, b) / Math.max(1, Math.min(a, b));
    if (r <= this.CRITICO_DESDE) return this.CRITICO;
    if (r >= this.CRITICO_HASTA) return 0;
    return this.CRITICO * (this.CRITICO_HASTA - r) / (this.CRITICO_HASTA - this.CRITICO_DESDE);
  },
  // los comandos fuertes pero inestables (Romper, Entrada y la Volea): x0,75 a x1,65
  POTENTE: [0.75, 1.65],
  // los tiros sin supertecnica y las paradas (Aaron, O-307 punto 5; como los
  // botones de 3DS) (O-309). Numeros inventados con sentido, no salen de VR:
  VASELINA: 0.8,                // la vaselina (bombeada) chuta con x0,8...
  PEGADO: 2.5,                  // ...pero pasa por encima del muro si esta a mas de esto (m) del que chuta
  DESPEJAR: 1.25,               // despejar para mas facil (x1,25), pero el balon rebota...
  DESPEJE_ANGULO: 100,          // ...hasta estos grados a cada lado de "hacia el campo"...
  DESPEJE_VEL: [10, 18],        // ...a estos m/s
  // el muro que pierde le resta al tiro su numero ENTERO, como en VR (ayuda del juego: "su
  // AT se reduce en una cantidad equivalente al valor de la DF de muro"; antes la mitad,
  // O-309) (O-328)
  MURO_RESTA: 1,
  // el tiro que viaja (O-325; Aaron, O-322 punto 3: como en Galaxy): el balon va hacia la
  // porteria a `vel` m/s (a 20 m, 1,3 s: da tiempo a dibujar una flecha); el rival al que
  // le pasa a menos de `radio` m lo puede bloquear y el companero con tiro de cadena,
  // encadenarlo (si esta a mas de `cadenaDesde` m de donde se chuto); de los defensas sin
  // flecha, los `cortan` que antes llegan a su camino van a el solos (como iban a por el
  // balon); el portero elige al llegarle el balon (a `portero` m de el o a su altura).
  // `alto`: lo que sube el balon (para pintarlo) con el tiro raso, la vaselina y el remate
  // de un balon alto. Numeros inventados con sentido (Galaxy no da ninguno) y medidos
  // (medir-vuelo.js): con 2 m y 2 que cortan se bloqueaban 4,5 tiros por partido
  VUELO: { vel: 15, radio: 1.6, cortan: 1, portero: 1.6, cadenaDesde: 4, alto: { normal: 0.9, vaselina: 3.4, cabeza: 1.4 } },
  // adonde va el tiro (Aaron, O-335: "haz que siempre vayan donde apuntas... que los tiros no
  // salgan fuera a no ser que hayas apuntado a algun angulo muy raro"): al punto de la linea
  // de gol que pulsaste (`x`, m del centro de la porteria). Entre los palos, ahi (como mucho a
  // `margen` m de un palo: el balon entra); pulsando un poco fuera (hasta `tolera` m del palo),
  // pegado al palo por dentro: un dedo que se va un poco no lo manda fuera. Mas alla es "un
  // angulo muy raro": se va fuera por ahi. Lo que se pulsa vale hasta `max` m del centro (lo
  // que la pagina toma por la porteria)
  APUNTAR: { margen: 0.7, tolera: 1.5, max: 9 },
  // el pase marcado (en la pausa o en un foco) se quita tocando otra vez al companero o el
  // sitio al que va, a menos de `quitar` m (Aaron, O-335); como antes, tambien tocando al que
  // pasa
  PASE_MARCADO: { quitar: 2 },
  // la T de la tactil sin tiro largo: el pase hacia delante (O-326; Aaron, O-322 punto 4).
  // Al companero que este al menos `avance` m por delante, entre `cerca` y `lejos` m (como
  // los pases de la maquina), sin un rival a menos de `linea` m del camino y sin fuera de
  // juego; el mejor: el que mas avanza y mas libre esta (hasta `libre` m cuenta). Si no hay,
  // al hueco: `hueco` m por delante (va el companero que antes llega)
  BOTON_T: { avance: 4, cerca: 5, lejos: 38, linea: 1.6, libre: 10, hueco: 14 },

  // los balones que salen del campo (O-315; Aaron, O-307: "las reglas como en la vida
  // real"). Antes casi nunca salia (0,16 fueras por partido) y apenas habia saques de
  // banda, corners ni de puerta. Numeros inventados con sentido y medidos para unos
  // 6-12 saques de banda, 2-5 corners y 3-6 saques de puerta por partido de 2 x 15:
  // - los pases no son perfectos: el balon va a unos metros de donde se apunta. El
  //   error tipico (m) es base + porMetro x lo largo del pase + presion si tiene a un
  //   rival a menos de `cerca` m (todo a 0 m, menos cuanto mas lejos), x alto en el
  //   bombeado, hasta `tope`. Un pase de 20 m sin nadie encima, ~1,1 m; apretado, ~2 m.
  //   Mas fallo quitaba goles (los centros no llegaban) y casi no sacaba balones: los
  //   pases van al medio, lejos de las lineas
  PASE_ERROR: { base: 0.3, porMetro: 0.04, presion: 1, cerca: 4, alto: 1.5, tope: 8 },
  // - el tiro sin supertecnica a veces se va fuera (saque de puerta): desde `desde` m,
  //   `porMetro` por cada metro mas, y `presion` mas con un rival a menos de `cerca` m;
  //   la volea x`volea`; hasta `tope` (a 20 m, un 48 %; a 30 m, un 75 %; a 11 m, nada
  //   o un 10 % con un rival encima). Con supertecnica va a puerta. Si el muro lo toca
  //   y pierde, se desvia a corner el `muro` de las veces (tambien con supertecnica).
  //   O-335: con el tiro que viaja (el de la pagina) ya no se va fuera al azar: va adonde
  //   se apunta (APUNTAR); `desde`...`tope` quedan para el tiro de antes y `muro` sigue
  TIRO_FUERA: { desde: 12, porMetro: 0.06, presion: 0.1, cerca: 4, volea: 1.4, tope: 0.75, muro: 0.3 },
  // - de los despejes del portero (Despejar o su supertecnica), estos se van directos a
  //   corner (por encima o junto al palo). El tiro que el muro para del todo ya no se va a
  //   corner ni rebota: se lo queda el defensa (Aaron, O-335; antes `bloqueo` 0,6)
  A_CORNER: { despeje: 0.6 },
  // - el balon disputado que se escapa: el defensa que gana un foco sin supertecnica
  //   ni hiper a veces no se queda el balon y sale rodando (ESCAPA_VEL m/s, hasta
  //   ESCAPA_ANGULO grados a cada lado de hacia donde iba el que lo llevaba). Por lo
  //   que eligio el defensa: Tapar, Entrada o Cargar. Pocos: cada uno quitaba goles
  ESCAPA: { normal: 0.06, potente: 0.15, cargar: 0.15 }, ESCAPA_VEL: [10, 16], ESCAPA_ANGULO: 110,
  // - la maquina con el balon cerca de su porteria (a menos de `zona` m) y un rival
  //   encima (a menos de `presion` m) no se la juega: despeja a la banda con esta
  //   probabilidad en cada decision, bombeado y apuntando de `fuera`[0] a `fuera`[1] m
  //   pasada la linea (casi siempre sale: los despejes que se quedaban dentro eran
  //   balones perdidos delante de su area y bajaban los goles de 3,8 a 3,2); a menos de
  //   `corner` m de su linea de fondo y por un lado, a corner el `pCorner` de las veces
  IA_DESPEJE: { zona: 34, presion: 6, p: 0.65, corner: 20, pCorner: 0.6, fuera: [1, 8] },
  // - el balon bombeado del rival (un centro, un despeje) que corta un defensa de
  //   campo a menos de `zona` m de su porteria no se lo queda: lo despeja de cabeza, a
  //   corner el `corner` de las veces y si no hacia el campo (hasta `angulo` grados a
  //   cada lado, a `vel` m/s), suelto
  CABEZA: { zona: 26, corner: 0.5, angulo: 75, vel: [8, 14] },
  // - la maquina centra: con el balon a mas de `banda` m del centro y a menos de
  //   `fondo` m de la linea de fondo rival, con esta probabilidad en cada decision, un
  //   pase bombeado al area (a veces rematado de primeras: `remate`)
  IA_CENTRO: { banda: 14, fondo: 28, p: 0.3, remate: 0.5 },

  // la VELOCIDAD de cada jugador (Aaron, O-340: "la velocidad que hay ahora en los partidos
  // seria el equivalente a mitad de tabla dentro de las stats, haz que se note la diferencia de
  // velocidad en los personajes pero tampoco que sea una barbaridad"; "agilidad no es lo mismo
  // que speed"): corre segun su stat de velocidad (100-600, en campana; partido.py lo manda de
  // velocidad.csv), ya no segun la Agilidad. La mitad de la tabla (`mediana`, 350) corre `media`
  // m/s, lo que corren hoy de media los de campo de los equipos de Aaron (6,98 m/s con la
  // Agilidad); cada 25 puntos, un 2 %: `pct` % de la mitad a cada extremo (600: +20 %, 8,4 m/s;
  // 100: -20 %, 5,6 m/s). Con balon -0,6 m/s, y la hiper, las tacticas y las pasivas encima
  // como antes (_mulVel). Un equipo de antes (sin `velocidad`): la cuenta de antes
  VELOCIDAD: { mediana: 350, media: 7.0, pct: 20, min: 100, max: 600 },
  velocidadBase(j) {
    const V = this.VELOCIDAD, s = Number(j.velocidad);
    if (!(s > 0)) return 6.2 + Math.min(700, j.stats[5]) / 260;
    const k = (Math.max(V.min, Math.min(V.max, s)) - V.mediana) / (V.max - V.mediana);
    return V.media * (1 + V.pct / 100 * k);
  },
  // velocidad de carrera en m/s
  velocidad(j) { return this.velocidadBase(j) - (j.conBalon ? 0.6 : 0); },

  // lo que suma una supertecnica a su nivel (VR; O-328): floor(poder minimo + (poder -
  // poder minimo) x (nivel - 1) / 98), con el poder minimo de tecnicas.csv (`poderMin`, lo
  // manda partido.py). Cuadra exacto con los 5 numeros medidos en VR (O-156: Nv. 22, 200 ->
  // 66 y 640 -> 215; Nv. 40, 440 -> 217, 540 -> 266 y 640 -> 314); el poder x (nivel+15)/112
  // de antes fallaba 3 de 5. A Nv. 99, el poder entero. Sin `poderMin` (un equipo de antes),
  // la cuenta de antes
  poderNivel(t, nivel) {
    const n = Math.max(1, Math.min(99, nivel || 99));
    if (!(t.poderMin > 0)) return t.poder * Math.min(1, (n + 15) / 112);
    return Math.floor(t.poderMin + (t.poder - t.poderMin) * (n - 1) / 98);
  },
  poderTecnica(j, t) {
    if (!t) return 0;
    let p = this.poderNivel(t, j.nivel);
    if (t.elemento && t.elemento === j.elemento) p *= 1.15;     // de su elemento: +15 %
    return p;
  },

  // los cuatro elementos de VR: viento > montana > fuego > bosque > viento
  GANA_A: { Viento: "Montana", Montana: "Fuego", Fuego: "Bosque", Bosque: "Viento" },
  gana(e1, e2) { return !!e1 && this.GANA_A[e1] === e2; },
  // ventaja de elemento de VR (O-328; ayuda del juego "Efectos elementales +20 %" y la
  // comunidad): +20 % si el elemento del JUGADOR gana al del rival y +20 % si el de su
  // TECNICA gana al de la TECNICA del rival (solo si los dos usan supertecnica; antes la
  // tecnica contra el elemento del jugador rival). Se suman y van al final, sobre todo el
  // valor. La desventaja no resta. tRival: la supertecnica del rival (o null); sin saberla
  // aun (el panel antes de que elija el otro), solo la del jugador
  ELEMENTO: 0.2,
  efectoElemental(j, t, rival, tRival) {
    let f = 1;
    if (rival && this.gana(j.elemento, rival.elemento)) f += this.ELEMENTO;
    if (t && tRival && this.gana(t.elemento, tRival.elemento)) f += this.ELEMENTO;
    return f;
  },
  // en la disputa (Cargar) el elemento del jugador vale x1,05 al que gana y x0,95 al que
  // pierde (game_param scrambleCharaMultiplierAdvantage 1.05 / Disadvantage 0.95; antes
  // +20 %). Por confirmar en VR (O-328)
  ELEMENTO_DISPUTA: [1.05, 0.95],
  efectoDisputa(j, rival) {
    if (!rival) return 1;
    if (this.gana(j.elemento, rival.elemento)) return this.ELEMENTO_DISPUTA[0];
    if (this.gana(rival.elemento, j.elemento)) return this.ELEMENTO_DISPUTA[1];
    return 1;
  },

  // stats: [Potencia, Control, Tecnica, Presion, Fisico, Agilidad, Inteligencia]
  atTiro(j)    { const s = j.stats; return s[0] + s[1]; },
  // Testarazo y Volea (rematando de primeras un pase alto): de cabeza o al aire
  // cuenta el Fisico en vez del Control (O-309)
  atCabeza(j)  { const s = j.stats; return s[0] + s[4]; },
  atFoco(j)    { const s = j.stats; return s[2] + s[1] + s[0] / 2; },
  dfFoco(j)    { const s = j.stats; return s[2] + s[6] + s[5] / 2; },
  atDisputa(j) { const s = j.stats; return s[6] + s[4]; },
  dfDisputa(j) { const s = j.stats; return s[6] + s[3]; },
  dfMuro(j)    { const s = j.stats; return s[4] + s[3]; },
  // el PP (KP) del portero, el de VR ENTERO (O-328): Agi x4 + Fis x3 + Pres x2 (game_param
  // calcKP_AGMultiply 4, calcKP_PSMultiply 3, calcKP_PRMultiply 2; O-157: Mark Evans 1427,
  // exacto). Antes x0,30 (KP_ESCALA, O-309): el portero sacaba un tercio de lo de VR. Como
  // en VR es una barra que se GASTA: el tiro solo es gol si pasa de lo que le queda (mas su
  // tecnica); si no, el portero para y el PP baja lo que el tiro pasa de su tecnica
  // (_pararPP). Y se cansa: cada parada, -5 % a la DF de su tecnica de parada, hasta 5
  // veces (game_param gkTiredAttenuation 0.05, gkTiredCountMax 5)
  kpBase(j)    { const s = j.stats; return s[5] * 4 + s[4] * 3 + s[3] * 2; },
  FATIGA: { porParada: 0.05, max: 5 },

  // perdida de potencia del tiro con la distancia (VR la tiene, "Atenuacion de distancia";
  // ley exacta sin conocer: en VR se han visto 14 y 53 de AT en tiros de ~600, un 2-9 %)
  // (O-328): hasta 16 m nada; luego baja hasta un 10 % a 35 m. Los tiros largos no pierden.
  // Antes hasta la mitad a 45 m (a 30 m, -24 %)
  DISTANCIA_PERDIDA: { desde: 16, hasta: 35, max: 0.10 },
  porDistancia(d, larga) {
    const D = this.DISTANCIA_PERDIDA;
    if (larga) return 1;
    return 1 - Math.max(0, Math.min(1, (d - D.desde) / (D.hasta - D.desde))) * D.max;
  },

  // tipos de tecnica de VR (tecnicas.csv) que sirven en cada momento
  sirve(t, que) {
    if (!t) return false;
    if (que === "regate") return t.tipo === "Regate";
    // subtipos de tecnicas.csv: Defensa 16 = bloqueo de tiro; Tiro 4 = tiro
    // largo; Tiro 16 = "bloqueo de tiros" (el contra-tiro de VR)
    if (que === "entrada") return t.tipo === "Defensa" && t.subtipo_valor !== 16;
    if (que === "muro") return (t.tipo === "Defensa" && t.subtipo_valor === 16) || (t.tipo === "Tiro" && t.subtipo_valor === 16);
    if (que === "tiro") return t.tipo === "Tiro";
    if (que === "cadena") return t.tipo === "Tiro" && t.subtipo_valor !== 4;
    if (que === "parada") return t.tipo === "Parada";
    return false;
  },
  // (quien gana: ya no con probabilidad A^3 / (A^3 + D^3) ni la del tiro a la
  // quinta (O-302): gana el numero mayor salvo un critico, probCritico, O-309)
  esLarga(t) { return !!t && (t.subtipo_valor === 4 || /larg|distancia/i.test(t.subtipo || "")); },
  esContra(t) { return !!t && t.tipo === "Tiro" && t.subtipo_valor === 16; },
  // tiro directo (VR): rematar un pase suma el 50 % del AT de tiro del que pasa, solo sin
  // supertecnica (con una deja de ser directo; antes sumaba siempre) (O-328)
  DIRECTO: 0.5,
  // la cadena con una "habilidad real" (rh*: Vaselina, Tiro con efecto...) deja el total
  // del tiro en la mitad (VR desde la 6.0.1) (O-328)
  CADENA_RH: 0.5,

  // --- el tiempo de las animaciones de Galaxy (NOTAS O-319; diseno 6.3; guia 8) ----------
  // Lo que dura cada tramo (s) con las animaciones "completas" (como Galaxy) o "cortas"
  // (mas o menos la mitad). Las supertecnicas de Galaxy duran 5,4-8 s: aqui 4,2. "Cortas"
  // solo acorta lo que se VE: lo que dura la hiper (HIPER_TIPOS) no cambia (O-307 p17)
  ANIM: {
    completas: { entrada: 0.87, choque: 1.4, prepara: 1.0, transicion: 0.2, tecnica: 4.2, hiper: 5.0,
      sinTecnica: { foco: 2.0, tiro: 2.0, muro: 1.1, portero: 1.7 }, fijar: 0.6, vuelta: 0.2, negroTiro: 0.5,
      vuelo: 0.7, bloqueo: 1.7, porEncima: 0.5, fueraTiro: 1.2, destello: 0.3, gol: 10.8, entraPenalti: 1.2,
      tandaRotulo: 1.3, falta: 1.6, tarjeta: 1.6, penaltiRotulo: 1.8, fueraJuego: 2.5, chico: 1.1, penaltis: 2.0,
      nombres: 2.2, fallo: 2.0, falloDe: { portero: 2.7, muro: 1.1 }, golpe: 2.0, invoca: 4.3, aerea: 2.3, pasa: 1.0 },
    cortas: { entrada: 0.87, choque: 0.8, prepara: 0.6, transicion: 0.2, tecnica: 1.6, hiper: 2.0,
      sinTecnica: { foco: 1.0, tiro: 0.8, muro: 0.8, portero: 1.0 }, fijar: 0.5, vuelta: 0.2, negroTiro: 0.2,
      vuelo: 0.5, bloqueo: 0.9, porEncima: 0.4, fueraTiro: 1.0, destello: 0.3, gol: 4.4, entraPenalti: 0.8,
      tandaRotulo: 1.0, falta: 1.2, tarjeta: 1.2, penaltiRotulo: 1.4, fueraJuego: 1.6, chico: 0.8, penaltis: 2.0,
      nombres: 1.4, fallo: 1.2, falloDe: { portero: 1.4, muro: 0.8 }, golpe: 1.2, invoca: 2.5, aerea: 1.5, pasa: 0.7 },
  },
  // O-336 (Aaron: "que solo salga la animacion de quien gana"): nombres, el choque de los nombres
  // de las dos tecnicas (Chrono Stones de Aaron, 29:48: ~2,2 s hasta el negro); fallo, la accion
  // normal del que gana con "Fallo" sobre la tecnica del que pierde; golpe, el final de la tecnica
  // del tiro que gana al muro o al portero (la entera ya se vio al chutar)
  // O-337: invoca, la invocacion con el juego parado sin su animacion de VR (la de Galaxy, t17:
  // ~4,3 s); con las completas y su animacion de VR, lo que dura la suya (`seg`)
  // O-341: aerea, la disputa aerea: los dos saltan a por el balon (el salto de VR, 0,33 s), pelean
  // y el que gana se va con el (1,17 s); con las cortas, la pelea mas corta
  // O-344: pasa, el balon que pasa al muro que no lo para (sigue debilitado)
  // con las completas, una supertecnica (y la ★) dura lo de su animacion REAL de VR: `seg`
  // de cada paso del tiro o `segs` del foco, que el motor apunta en el resultado desde
  // partido.py (eventos-tecnicas.csv). Aaron: "animaciones completas" (O-322; O-307 p17).
  // Como mucho SEG_MAX s; sin `seg` (sin animacion de VR, un equipo de antes), lo de ANIM
  // (O-323)
  SEG_MAX: 12,
  // O-345, vuelta 1 (Aaron: "tiempos"): las jugadas sin tecnica de VR (los eventos ev71 del partido de
  // VR, que ensena Escenas) y lo que dura cada una en VR (s: sus fotogramas a 60 por segundo, de su
  // guion). Cual sale depende solo del resultado (jugadaVR, igual en los dos PCs), asi que el plan dura
  // lo de la que sale: antes duraba lo mismo para todas y las de 2,7 a 5 s se veian aceleradas (la
  // parada normal contra una supertecnica, 31010, a 1,86 veces). Los mismos eventos que JUGADAS_VR de
  // partido-escenas.js (tiro: el chute; portero: la parada; encaja: el portero que se tira a un lado y no
  // llega, para el gol sin tecnica; poder: la parada normal contra una supertecnica, por el color del
  // tiro; muro: el bloqueo con el cuerpo; foco: el duelo por lo que hace el que defiende, _1 gana el del
  // balon y _2 el que defiende; rompe: el que rompe y gana)
  JUGADAS_VR: {
    tiro: { Tirar: ["ev71_20010", "ev71_20020"], Vaselina: ["ev71_21010"], Volea: ["ev71_22010"], Testarazo: ["ev71_23010"] },
    portero: { Parar: ["ev71_30010", "ev71_30030", "ev71_30050"], Despejar: ["ev71_30020", "ev71_30040", "ev71_30060"] },
    encaja: { Parar: ["ev71_30030", "ev71_30050"], Despejar: ["ev71_30040", "ev71_30060"] },
    poder: { Parar: ["ev71_31010", "ev71_31030", "ev71_31050", "ev71_31070", "ev71_31090"], Despejar: ["ev71_31110"] },
    muro: "ev71_33050",
    foco: { Tapar: "ev71_32010", Entrada: "ev71_32020", Cargar: "ev71_32060", "": "ev71_32030" }, rompe: "ev71_40010",
  },
  SEG_JUGADA: {
    ev71_20010: 2.033, ev71_20020: 2.017, ev71_21010: 2.017, ev71_22010: 2.017, ev71_23010: 2.0,
    ev71_30010: 1.683, ev71_30020: 1.667, ev71_30030: 1.7, ev71_30040: 1.683, ev71_30050: 1.683, ev71_30060: 1.683,
    ev71_31010: 5.017, ev71_31030: 4.517, ev71_31050: 4.017, ev71_31070: 3.683, ev71_31090: 3.85, ev71_31110: 2.7,
    ev71_33050: 1.05, ev71_32010_1: 2.033, ev71_32010_2: 2.017, ev71_32020_1: 2.033, ev71_32020_2: 2.017,
    ev71_32030_1: 2.033, ev71_32030_2: 2.017, ev71_32060_1: 2.7, ev71_32060_2: 2.683, ev71_40010: 3.383,
  },
  // el portero que encaja sin tecnica (Aaron: "las animaciones que no son sacadas del juego, se ven
  // raras"; antes se quedaba de pie con la pose de parar mientras entraba el balon): la de VR en la que se
  // tira a un lado, cortada justo antes de que el balon le llegue a las manos (s; medido en las cuatro
  // con el balon y sus huesos, scratchpad juego/aa1/contacto.mjs: el balon entra en su camara en el
  // fotograma 64 y le llega en el 65-70; se corta en el 62, ya en el aire). Luego, el balon en la red
  CORTE_ENCAJA: { ev71_30030: 1.033, ev71_30050: 1.033, ev71_30040: 1.033, ev71_30060: 1.033 },
  // la jugada sin tecnica de VR del tramo q ({que: "sinTecnica" | "fallo", sub, jugador, paso}) del
  // resultado r: el nombre de su evento, o "" si no la hay (el muro sin tecnica que no para el tiro no
  // tiene: su bloqueo de VR sale como si lo parara). ladoDe(id): el lado de un jugador
  jugadaVR(r, q, ladoDe) {
    if (!r || !q) return "";
    const J = this.JUGADAS_VR, hay = v => v !== null && v !== undefined;
    const lado = id => { const l = ladoDe ? ladoDe(id) : undefined; return l === 0 || l === 1 ? l : id < 11 ? 0 : 1; };
    // uno de una lista por un numero (el mismo en los dos PCs)
    const de = (l, n) => l[((Math.round(n || 0) % l.length) + l.length) % l.length];
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") {
      const g = r.tipo === "falta" ? r.defensor : r.ganador;
      if (!hay(g) || !hay(r.atacante) || !hay(r.defensor)) return "";
      const ta = (r.tecnicas && r.tecnicas[lado(r.atacante)]) || "", td = (r.tecnicas && r.tecnicas[lado(r.defensor)]) || "";
      return g === r.atacante && ta === "Romper" ? J.rompe : (J.foco[td] || J.foco[""]) + (g === r.atacante ? "_1" : "_2");
    }
    const ps = r.pasos || [], s = ps[hay(q.paso) ? q.paso : 0] || {}, que = String(s.que || "").replace(/ de primeras$/, "");
    const quien = hay(q.jugador) ? q.jugador : s.quien;
    if (!hay(quien)) return "";
    const n = Math.abs(Math.round(+s.valor || 0)) + quien;
    if (q.sub === "tiro") return de(J.tiro[que] || J.tiro.Tirar, n);
    if (q.sub === "muro") return q.que === "fallo" || r.final === "bloqueado" ? J.muro : "";
    if (q.sub !== "portero") return "";
    const par = /despej/i.test(que) ? "Despejar" : "Parar";
    if (r.final === "gol") return q.que === "fallo" ? "" : de(J.encaja[par], n);
    const tec = ps.find(x => x && x.tecnica && hay(x.quien) && lado(x.quien) !== lado(quien));
    return de((q.que === "fallo" && tec ? J.poder : J.portero)[par], n);
  },
  // lo que dura (s) la jugada de VR del tramo q, o 0 si no la hay (el que encaja, hasta su corte)
  segJugadaVR(r, q, ladoDe) {
    const ev = this.jugadaVR(r, q, ladoDe);
    if (!ev) return 0;
    return (r.final === "gol" && q.sub === "portero" && this.CORTE_ENCAJA[ev]) || this.SEG_JUGADA[ev] || 0;
  },
  // O-344: la tecnica del muro o del portero que no para el tiro dura eso de la suya: la de fallo
  // de VR (_2) dura de mediana 0,95 de la de acierto (231 bloqueos y paradas del juego; scratchpad
  // juego/db3/cortes_fallo.py)
  FALLO_VR: 0.95,
  // la opcion del partido: "completas", "cortas" o false (sin animaciones: como antes)
  modoAnim(m) { return m === "completas" || m === "cortas" ? m : false; },
  // los comandos de un foco (sin supertecnica): en la falta el resultado no trae los
  // elementos y la tecnica del que la recibe se mira por su nombre
  COMANDOS_FOCO: ["Regatear", "Romper", "Tapar", "Entrada", "Cargar"],
  // El plan de la animacion de un resultado (diseno 6.3): los tramos uno detras de otro,
  // {que, de, a, ...datos}, y lo que dura todo. Pura: el motor (la espera) y el Director
  // (lo que se ensena) sacan el mismo plan del mismo resultado, tambien online. entrada:
  // lo que le falta a la entrada al duelo (va delante). ladoDe(id): el lado de un jugador
  // (el orden de las tecnicas de un foco; sin el, los 11 primeros son del lado 0)
  planAnim(r, modo, entrada, ladoDe) {
    const A = this.ANIM[modo] || this.ANIM.cortas, tramos = [];
    const lado = id => { const l = ladoDe ? ladoDe(id) : undefined; return l === 0 || l === 1 ? l : id < 11 ? 0 : 1; };
    const hay = v => v !== null && v !== undefined;
    let t = 0;
    const pon = (que, dura, datos) => {
      if (!(dura > 0)) return;
      tramos.push(Object.assign({ que, de: Math.round(t * 1000) / 1000, a: Math.round((t + dura) * 1000) / 1000 }, datos || {}));
      t += dura;
    };
    // una supertecnica de espiritu (✦) o la hiper (★) duran lo de la hiper
    const durTec = nombre => /[★✦]/.test(nombre || "") ? A.hiper : A.tecnica;
    const queTec = nombre => /[★✦]/.test(nombre || "") ? "hiper" : "tecnica";
    // con las completas, lo de su animacion de VR si se sabe (O-323)
    const deVR = seg => A === this.ANIM.completas && seg > 0 ? Math.min(this.SEG_MAX, Math.round(seg * 1000) / 1000) : 0;
    // y las jugadas sin tecnica, lo de la suya de VR (O-345, vuelta 1); si no la hay, lo de ANIM
    const segJ = (q, base) => deVR(this.segJugadaVR(r, q, lado)) || base;
    // (con Doble o Triple de los apoyos, un poco mas: APOYO_ENTRADA, O-342)
    pon("entrada", Math.max(0, Math.min(A.entrada + (this.APOYO_ENTRADA || 0), entrada || 0)));
    if (!r) return { total: t, tramos };
    if (r.tipo === "fuera") { pon("fueraJuego", A.fueraJuego, { jugador: r.quien }); return { total: t, tramos }; }
    // la disputa aerea (O-341): los dos saltan y pelean (abajo en el campo y arriba en el 3D) y el
    // que gana se lo lleva; la vuelta, al mapa
    if (r.tipo === "aerea") {
      pon("aerea", A.aerea || 2.3, { jugador: r.ganador, pierde: r.ganador === r.atacante ? r.defensor : r.atacante });
      pon("vuelta", A.vuelta);
      return { total: t, tramos };
    }
    // la invocacion con el juego parado (O-337; Aaron: "deberia ser como una supertecnica,
    // mientras sale esa animacion se para el juego para verla hasta que termina"): el fundido, la
    // de cada una (con las completas, la de VR de su espiritu entera; si no, ANIM.invoca), una
    // detras de otra, y la vuelta. id: cual es (Escenas y las voces la deciden una vez)
    if (r.tipo === "invocacion") {
      pon("transicion", A.transicion);
      (r.cola || []).forEach((c, i) => pon("invoca", deVR(c.seg) || A.invoca || 4.3, { jugador: c.j, familia: c.que, id: r.k + "." + i }));
      pon("vuelta", A.vuelta);
      return { total: t, tramos };
    }
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") {
      // el que ataca primero; cada uno con su hiper (★), su supertecnica o nada
      const usa = id => {
        const l = lado(id), n = r.tecnicas ? r.tecnicas[l] : "";
        if ((r.hipers && r.hipers[l]) || /^★/.test(n || "")) return "hiper";
        if (r.elementos && hay(r.elementos[l])) return queTec(n);
        if (r.tipo === "falta" && n && !this.COMANDOS_FOCO.includes(n)) return queTec(n);
        return null;
      };
      pon("choque", A.choque);
      // solo la animacion del que gana (O-336): con tecnica los dos, antes el choque de los
      // nombres; si gana una accion normal a una tecnica, esa accion con "Fallo" sobre la del
      // otro; si gana una tecnica a uno sin ella, directamente la tecnica; sin tecnicas, como
      // antes. Antes salian las dos, la del que ataca primero. En la falta, el defensa: gana el
      // numero con su Entrada o su Cargar y hace falta (O-344; antes salia entera la tecnica del
      // que la recibe, como si le hubiera regateado)
      const g = r.tipo === "falta" && hay(r.defensor) ? r.defensor : hay(r.ganador) ? r.ganador : r.atacante, pd = g === r.atacante ? r.defensor : r.atacante;
      const ug = usa(g), up = usa(pd);
      if (ug) {
        if (up) pon("nombres", A.nombres, { jugador: g, pierde: pd });
        pon("transicion", A.transicion);
        pon(ug, deVR(r.segs ? r.segs[lado(g)] : 0) || (ug === "hiper" ? A.hiper : A.tecnica), { jugador: g });
        pon("fijar", A.fijar);
      } else if (up) pon("fallo", segJ({ que: "fallo", sub: "foco", jugador: g }, A.fallo), { sub: "foco", jugador: g, pierde: pd });
      else pon("sinTecnica", segJ({ que: "sinTecnica", sub: "foco" }, A.sinTecnica.foco), { sub: "foco" });
      pon("vuelta", A.vuelta);
      if (r.tipo === "falta") {
        pon("falta", A.falta);
        if (r.tarjeta) pon("tarjeta", A.tarjeta);
        if (r.penalti) pon("penaltiRotulo", A.penaltiRotulo);
      }
      return { total: t, tramos };
    }
    const pasos = r.pasos || [], n = pasos.length;
    // el tiro o el penalti por su tecnica o sin ella (el boton)
    const tecnica = (k, sub, mas) => {
      const s = pasos[k];
      if (!s) return;
      if (s.tecnica) pon(queTec(s.que), deVR(s.seg) || durTec(s.que), Object.assign({ jugador: s.quien, paso: k }, mas || {}));
      else pon("sinTecnica", segJ({ que: "sinTecnica", sub, jugador: s.quien, paso: k }, A.sinTecnica[sub]), Object.assign({ sub, jugador: s.quien, paso: k }, mas || {}));
    };
    // un duelo del tiro (O-336): el que defiende (paso kD, el muro o el portero) contra el tiro
    // que le llega (paso kT); ganaD: si gana el que defiende. O-344 (Aaron: "cuando estas
    // bloqueando o parando un tiro, no debe salir la animacion esa de las tecnicas chocando entre
    // si ... esas solo tienen sentido en duelos de regate y defensa"): sin el choque de los
    // nombres. Se ve el tiro (en el penalti entero; en el tiro que viaja ya se vio al chutar) y
    // luego lo del que defiende con lo que pase: su tecnica entera si para el tiro; si no, cortada
    // (falla: la de fallo de VR, _2, o la de acierto hasta el contacto; FALLO_VR de lo que dura) y,
    // en el muro, el balon que le pasa (pasa: el tiro sigue debilitado). Sin tecnica el que
    // defiende, como en O-336: si gana a una tecnica, su accion normal con "Fallo" sobre ella; si
    // pierde con la tecnica del tiro ya vista, el final de esa tecnica (golpe)
    const duelo = (kT, kD, ganaD, sub, mas, visto) => {
      const sT = pasos[kT] || {}, sD = pasos[kD] || {}, tT = !!sT.tecnica, tD = !!sD.tecnica;
      const kG = ganaD ? kD : kT, kP = ganaD ? kT : kD;
      const datos = o => Object.assign({ jugador: (pasos[kG] || {}).quien, pierde: (pasos[kP] || {}).quien, paso: kG, pasoPierde: kP, defiende: sD.quien }, o || {});
      const pasa = () => { if (sub === "muro") pon("pasa", A.pasa, { jugador: sD.quien, paso: kD, tiro: kT, muro: true }); };
      if (!visto) { pon("transicion", A.transicion); tecnica(kT, "tiro"); }
      pon("transicion", A.transicion);
      if (tD && ganaD) tecnica(kD, sub, mas);
      else if (tD) {
        pon(queTec(sD.que), (deVR(sD.seg) || durTec(sD.que)) * this.FALLO_VR, Object.assign({ jugador: sD.quien, paso: kD, falla: true }, mas || {}));
        pasa();
      } else if (ganaD && tT) pon("fallo", segJ(datos({ que: "fallo", sub }), (A.falloDe && A.falloDe[sub]) || A.fallo), datos(Object.assign({ sub }, mas)));
      // (O-345, vuelta 1: el muro sin tecnica que no lo para, sin su bloqueo, que sale como si lo parara
      // (Aaron: "si en la animacion sale que ha bloqueado el tiro pero en realidad no, queda raro"): solo
      // el balon que le pasa)
      else if (ganaD || !tT || !visto) { if (ganaD || sub !== "muro") tecnica(kD, sub, mas); if (!ganaD) pasa(); }
      else pon(queTec(sT.que), A.golpe, { jugador: sT.quien, paso: kT, golpe: true });
    };
    if (r.tipo === "penalti") {
      pon("prepara", A.prepara, { jugador: r.tirador });
      if (!r.misma) {
        // el portero se tira a otra zona: la supertecnica del que chuta gana y se ve entera (O-344;
        // Aaron, O-336: "si gana una supertecnica a un jugador que no la usa, que salga
        // directamente la supertecnica"); luego entra
        if ((pasos[0] || {}).tecnica) { pon("transicion", A.transicion); tecnica(0, "tiro"); }
        pon("entraPenalti", A.entraPenalti);
      } else {
        // los dos eligen a la vez: el tiro entero y luego la parada (O-344)
        duelo(0, 1, r.final !== "gol", "portero", { portero: true }, false);
        pon("fijar", A.fijar, { paso: 1 });
      }
      if (r.tanda) pon("tandaRotulo", A.tandaRotulo, { gol: r.final === "gol" });
      else if (r.final === "gol") { pon("destello", A.destello); pon("gol", A.gol); }
      else pon("vuelta", A.vuelta);
      return { total: t, tramos };
    }
    // el tiro que viaja (O-325): una etapa por resultado; el vuelo es el de verdad, en el
    // campo, entre una y otra. El chute (prepara, su tecnica y el negro), la cadena (su
    // tecnica y el negro), el muro (el rotulo, su tecnica y quien gana; si lo desvia, fuera),
    // el portero (su tecnica, la parada o el gol) y el tiro que llega fuera (la llegada)
    if (r.etapa) {
      if (r.etapa === "chute") {
        pon("prepara", A.prepara, { jugador: r.tirador });
        pon("transicion", A.transicion);
        tecnica(0, "tiro");
        pon("negroTiro", A.negroTiro);
      } else if (r.etapa === "cadena") {
        pon("transicion", A.transicion);
        tecnica(n - 1, "tiro", { cadena: true });
        pon("negroTiro", A.negroTiro);
      } else if (r.etapa === "muro") {
        pon("bloqueo", A.bloqueo, { jugador: (pasos[n - 1] || {}).quien, paso: n - 1 });
        // gana el muro solo si lo para del todo: el que lo desvia a corner ha perdido el numero
        // (O-344; antes salia como si hubiera ganado)
        duelo(0, n - 1, r.final === "bloqueado", "muro", { muro: true }, true);
        pon("fijar", A.fijar, { paso: n - 1 });
        if (r.final === "fuera") pon("fueraTiro", A.fueraTiro, { desviado: true });
        pon("vuelta", A.vuelta);
      } else if (r.etapa === "portero") {
        duelo(0, n - 1, r.final !== "gol", "portero", { portero: true }, true);
        pon("fijar", A.fijar, { paso: n - 1 });
        if (r.final === "gol") { pon("destello", A.destello); pon("gol", A.gol); }
        else pon("vuelta", A.vuelta);
      } else {
        pon("fueraTiro", A.fueraTiro, { desviado: false });
        pon("vuelta", A.vuelta);
      }
      return { total: t, tramos };
    }
    // el tiro (diseno 6.3): prepara, la tecnica (y la de la cadena), el negro y el vuelo;
    // el muro (su rotulo, su tecnica: si gana se acaba) o la vaselina por encima; fuera o
    // desviado; el portero; la parada o el gol
    const kC = pasos.findIndex((s, k) => k > 0 && / \(cadena\)$/.test(s.que || ""));
    const kM = pasos.findIndex(s => hay(s.contra) || s.encima);
    const muro = kM >= 0 ? pasos[kM] : null;
    pon("prepara", A.prepara, { jugador: r.tirador });
    pon("transicion", A.transicion);
    tecnica(0, "tiro");
    if (kC > 0) tecnica(kC, "tiro", { cadena: true });
    pon("negroTiro", A.negroTiro);
    pon("vuelo", A.vuelo, { hasta: muro ? "muro" : r.final === "fuera" ? "fuera" : "porteria" });
    if (muro && !muro.encima) {
      pon("bloqueo", A.bloqueo, { jugador: muro.quien, paso: kM });
      // (O-336) el tiro que le llega es el de la cadena si la hubo
      // (O-344: el que lo desvia a corner ha perdido)
      duelo(kC > 0 && kC < kM ? kC : 0, kM, r.final === "bloqueado", "muro", { muro: true }, true);
      if (r.final === "bloqueado") { pon("fijar", A.fijar, { paso: kM }); pon("vuelta", A.vuelta); return { total: t, tramos }; }
      pon("vuelo", A.vuelo, { hasta: r.final === "fuera" ? "fuera" : "porteria", segundo: true });
    }
    if (muro && muro.encima) pon("porEncima", A.porEncima, { jugador: muro.quien });
    if (r.final === "fuera") {
      pon("fueraTiro", A.fueraTiro, { desviado: hay(r.desvia) && r.desvia !== r.tirador });
      pon("vuelta", A.vuelta);
      return { total: t, tramos };
    }
    duelo(kC > 0 ? kC : 0, n - 1, r.final !== "gol", "portero", { portero: true }, true);
    pon("fijar", A.fijar, { paso: n - 1 });
    if (r.final === "gol") { pon("destello", A.destello); pon("gol", A.gol); }
    else pon("vuelta", A.vuelta);
    return { total: t, tramos };
  },
  // las esperas sin resultado nuevo (diseno 6.2): el rotulo del saque de banda, de
  // corner o de puerta ("chico") y el de la tanda de penaltis
  esperaAnim(que, modo) {
    const A = this.ANIM[modo];
    if (!A) return 0;
    return que === "banda" || que === "corner" || que === "puerta" ? A.chico : que === "penaltis" ? A.penaltis : 0;
  },

  // --- la equipacion del equipo en los modelos 3D (O-334) -------------------------------
  // el diseno de cada equipo (indice en equipacion.disenos y en la ropa de cada jugador): el de
  // casa; el de fuera, el otro si los dos van con la misma ropa de campo y la suya tiene otro.
  // O-334, vuelta 2: se mira la ropa (equipacion.campo), no la equipacion: dos distintas pueden
  // llevar la misma ("Uniforme vendaval" y "Colmillo del Norte") y salian iguales; sin `campo`
  // (un Pizarra de antes), la misma equipacion
  disenos(a, b) {
    const ea = (a && a.equipacion) || {}, eb = (b && b.equipacion) || {};
    const ca = (ea.campo || [])[0], cb = (eb.campo || [])[0];
    const iguales = ca && cb ? ca === cb : !!ea.id && ea.id === eb.id;
    return [0, iguales && (eb.disenos || []).length > 1 ? 1 : 0];
  },
  // la ropa (el .glb que convierte el servidor, ievr/g4.py ropa_de) de un jugador con ese
  // diseno, de portero o de campo: r = su `ropa` de partido.py ({campo, portero}: una por
  // diseno); "" si lleva lo suyo (o es de un Pizarra de antes, que no la manda)
  ropaDe(r, k, portero) {
    const l = r && (portero ? r.portero : r.campo);
    return (Array.isArray(l) && (l[k] || l[0])) || "";
  },
  // el modelo vestido (partido-vestir.js): "<codigo>_cuerpo+<ropa>+<dorsal>[c]" (c: capitan);
  // sin ropa, el modelo tal cual (con la de su equipo de historia)
  vestido(cod, ropa, dorsal, capitan) {
    if (!cod || !ropa) return cod || "";
    const n = dorsal === null || dorsal === undefined || dorsal === "" || isNaN(+dorsal) ? "" : Math.max(0, Math.min(99, +dorsal | 0));
    return cod + "_cuerpo+" + ropa + "+" + n + (capitan ? "c" : "");
  },
  // los ficheros que convierte el servidor para un modelo (vestido o no)
  ficheros(cod) {
    const p = String(cod || "").split("+");
    return p.length > 1 ? p.slice(0, 2).filter(Boolean) : (cod ? [String(cod)] : []);
  },
  // si desde (x, y) se llega a la porteria de la linea gy (O-335, TIRO_RANGO): a menos de
  // `fuera` m del area grande (la distancia al rectangulo del area: 0 dentro) o, con un tiro
  // largo a punto (`largo`), a menos de TIRO_RANGO.largo m del centro de la porteria
  enRangoTiro(x, y, gy, largo) {
    const R = this.TIRO_RANGO, s = Math.sign(gy) || 1;
    const dx = Math.max(0, Math.abs(x) - this.AREA_X), dy = Math.max(0, (gy - y) * s - this.AREA_Y);
    return Math.hypot(dx, dy) <= R.fuera || (!!largo && Math.hypot(x, gy - y) <= R.largo);
  },
  // adonde va el tiro que apunta a x (APUNTAR, O-335): {x, fuera}. Sin x (una orden de un
  // Pizarra de antes), null: el motor lo echa a suertes dentro de la porteria
  apunteTiro(x) {
    const A = this.APUNTAR, palo = this.PORTERIA / 2, dentro = palo - A.margen;
    if (typeof x !== "number" || !isFinite(x)) return null;
    x = Math.round(Math.max(-A.max, Math.min(A.max, x)) * 10) / 10;
    if (Math.abs(x) > palo + A.tolera) return { x, fuera: true };
    return { x: Math.max(-dentro, Math.min(dentro, x)), fuera: false };
  },
};

/* Azar con semilla (mulberry32): los dos PCs de un partido online sacan los
   mismos numeros si empiezan con la misma semilla. */
function Azar(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
