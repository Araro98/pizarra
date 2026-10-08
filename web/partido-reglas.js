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
  // lleva `animaciones`; un Pizarra de antes no sabria ensenarlas
  VERSION: 9,
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
  DISTANCIA_TIRO: 38,           // desde mas lejos no se puede chutar a puerta
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
  KP_POR_SEGUNDO: 0.02,         // el portero recupera un 2 % de su KP por segundo
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
  IA_TIRO: { lejos: 26, cerca: 14, pCerca: 0.6, pLibre: 0.3, pTapado: 0.06, lejano: 34, pLejano: 0.3 },
  DUELO_MAX: 0,            // online: segundos para elegir en un duelo; 0 = sin limite, como en 3DS (Aaron, O-299)
  // apoyos en un duelo (DS/3DS): cada companero cerca suma, mas si es de su elemento
  APOYO_RADIO: 7, APOYO: 0.05, APOYO_ELEMENTO: 0.05, APOYOS_MAX: 3,
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
  // el balon, como mucho estos segundos (si no, se iban a su zona al sacar) (O-313)
  COLOCADO_SEGUNDOS: 3,
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
  // como mucho 2 del mismo equipo con la hiper puesta a la vez, y 15 s sin que
  // nadie mas del equipo invoque tras una invocacion (comunidad de VR, desde la
  // 5.0.0). Con la hiper puesta corre un 10 % mas (VR no da el numero)
  HIPER_ACTIVAS_MAX: 2, HIPER_BLOQUEO: 15, HIPER_VELOCIDAD: 10,
  // cada familia de hipertecnica (VR: AURA_CMD_INFO_LIST y AURA_CMD_EFFECT_LIST):
  // cuanto dura y cuanto tarda en volver tras acabar (s de juego, sin escalar), el
  // % que suma a AT y DF de los duelos, el % al poder de sus supertecnicas y el %
  // de su KP maximo que suma a la parada si es portero. El totem crece +20 % por
  // foco ganado (35, 55, 75 %) y lo guarda para la siguiente vez. El vinculo no se
  // convierte en el companero ni el modo cambia de forma: solo sus % (O-310)
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
  PASIVAS_TOPE: 60,             // lo mas que suman las pasivas a un valor (%)

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
  // el muro que pierde no se queda en nada: le resta al tiro la mitad de su numero
  // (VR: el bloqueo resta al tiro)
  MURO_RESTA: 0.5,

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
  //   y pierde, se desvia a corner el `muro` de las veces (tambien con supertecnica)
  TIRO_FUERA: { desde: 12, porMetro: 0.06, presion: 0.1, cerca: 4, volea: 1.4, tope: 0.75, muro: 0.3 },
  // - de los despejes del portero (Despejar o su supertecnica) y de los bloqueos del
  //   muro, estos se van directos a corner (por encima o junto al palo)
  A_CORNER: { despeje: 0.6, bloqueo: 0.6 },
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

  // velocidad de carrera en m/s segun la Agilidad (stats a nivel 99 de 150 a 700)
  velocidad(j) { return 6.2 + Math.min(700, j.stats[5]) / 260 - (j.conBalon ? 0.6 : 0); },

  // lo que suma una supertecnica a su nivel (Pizarra O-156): poder x (nivel+15)/112, tope 1
  factorTecnica(nivel) { return Math.min(1, ((nivel || 99) + 15) / 112); },
  poderTecnica(j, t) {
    if (!t) return 0;
    let p = t.poder * this.factorTecnica(j.nivel);
    if (t.elemento && t.elemento === j.elemento) p *= 1.15;     // de su elemento: +15 %
    return p;
  },

  // los cuatro elementos de VR: viento > montana > fuego > bosque > viento
  GANA_A: { Viento: "Montana", Montana: "Fuego", Fuego: "Bosque", Bosque: "Viento" },
  gana(e1, e2) { return !!e1 && this.GANA_A[e1] === e2; },
  // ventaja de elemento: +20 % por el del jugador y +20 % por el de la tecnica
  efectoElemental(j, t, rival) {
    let f = 1;
    if (this.gana(j.elemento, rival.elemento)) f += 0.2;
    if (t && this.gana(t.elemento, rival.elemento)) f += 0.2;
    return f;
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
  // KP del portero (VR): Agi x4 + Fis x3 + Pres x2; escalado para que una buena
  // supertecnica de tiro supere su parada y un tiro normal no (ajustable)
  // O-302: antes 0.62; con el tiro a la quinta, la supertecnica cuenta mas. O-309:
  // 0.30 (antes 0.42): con el 90-10 el tiro tiene que pasar de la parada y asi un
  // tercio de los tiros la pasa (3-4 goles por partido de 2 x 15)
  KP_ESCALA: 0.30,
  DESGASTE: 0.4,                // lo que pierde el portero al parar, segun el golpe (VR: todo)
  kpBase(j)    { const s = j.stats; return (s[5] * 4 + s[4] * 3 + s[3] * 2) * this.KP_ESCALA; },

  // perdida de potencia del tiro con la distancia (VR la tiene; ley exacta sin
  // conocer): hasta 16 m nada; luego baja hasta la mitad a 45 m. Un tiro de
  // larga distancia pierde la mitad de eso.
  porDistancia(d, larga) {
    const perdida = Math.max(0, Math.min(1, (d - 16) / 29)) * 0.5 * (larga ? 0.5 : 1);
    return 1 - perdida;
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
  // tiro directo (VR): rematar un pase suma el 50 % del AT de tiro del que pasa
  DIRECTO: 0.5,

  // --- el tiempo de las animaciones de Galaxy (NOTAS O-319; diseno 6.3; guia 8) ----------
  // Lo que dura cada tramo (s) con las animaciones "completas" (como Galaxy) o "cortas"
  // (mas o menos la mitad). Las supertecnicas de Galaxy duran 5,4-8 s: aqui 4,2. "Cortas"
  // solo acorta lo que se VE: lo que dura la hiper (HIPER_TIPOS) no cambia (O-307 p17)
  ANIM: {
    completas: { entrada: 0.87, choque: 1.4, prepara: 1.0, transicion: 0.2, tecnica: 4.2, hiper: 5.0,
      sinTecnica: { foco: 1.4, tiro: 1.2, muro: 1.2, portero: 1.4 }, fijar: 0.6, vuelta: 0.2, negroTiro: 0.5,
      vuelo: 0.7, bloqueo: 1.7, porEncima: 0.5, fueraTiro: 1.2, destello: 0.3, gol: 10.8, entraPenalti: 1.2,
      tandaRotulo: 1.3, falta: 1.6, tarjeta: 1.6, penaltiRotulo: 1.8, fueraJuego: 2.5, chico: 1.1, penaltis: 2.0 },
    cortas: { entrada: 0.87, choque: 0.8, prepara: 0.6, transicion: 0.2, tecnica: 1.6, hiper: 2.0,
      sinTecnica: { foco: 1.0, tiro: 0.8, muro: 0.8, portero: 1.0 }, fijar: 0.5, vuelta: 0.2, negroTiro: 0.2,
      vuelo: 0.5, bloqueo: 0.9, porEncima: 0.4, fueraTiro: 1.0, destello: 0.3, gol: 4.4, entraPenalti: 0.8,
      tandaRotulo: 1.0, falta: 1.2, tarjeta: 1.2, penaltiRotulo: 1.4, fueraJuego: 1.6, chico: 0.8, penaltis: 2.0 },
  },
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
    pon("entrada", Math.max(0, Math.min(A.entrada, entrada || 0)));
    if (!r) return { total: t, tramos };
    if (r.tipo === "fuera") { pon("fueraJuego", A.fueraJuego, { jugador: r.quien }); return { total: t, tramos }; }
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
      const ua = usa(r.atacante), ud = usa(r.defensor);
      if (ua || ud) {
        pon("transicion", A.transicion);
        if (ua) pon(ua, ua === "hiper" ? A.hiper : A.tecnica, { jugador: r.atacante });
        if (ud) pon(ud, ud === "hiper" ? A.hiper : A.tecnica, { jugador: r.defensor });
        pon("fijar", A.fijar);
      } else pon("sinTecnica", A.sinTecnica.foco, { sub: "foco" });
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
      if (s.tecnica) pon(queTec(s.que), durTec(s.que), Object.assign({ jugador: s.quien, paso: k }, mas || {}));
      else pon("sinTecnica", A.sinTecnica[sub], Object.assign({ sub, jugador: s.quien, paso: k }, mas || {}));
    };
    if (r.tipo === "penalti") {
      pon("prepara", A.prepara, { jugador: r.tirador });
      if (!r.misma) pon("entraPenalti", A.entraPenalti);
      else {
        pon("transicion", A.transicion);
        tecnica(0, "tiro");
        pon("transicion", A.transicion);
        tecnica(1, "portero", { portero: true });
        pon("fijar", A.fijar, { paso: 1 });
      }
      if (r.tanda) pon("tandaRotulo", A.tandaRotulo, { gol: r.final === "gol" });
      else if (r.final === "gol") { pon("destello", A.destello); pon("gol", A.gol); }
      else pon("vuelta", A.vuelta);
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
      pon("transicion", A.transicion);
      tecnica(kM, "muro", { muro: true });
      if (r.final === "bloqueado") { pon("fijar", A.fijar, { paso: kM }); pon("vuelta", A.vuelta); return { total: t, tramos }; }
      pon("vuelo", A.vuelo, { hasta: r.final === "fuera" ? "fuera" : "porteria", segundo: true });
    }
    if (muro && muro.encima) pon("porEncima", A.porEncima, { jugador: muro.quien });
    if (r.final === "fuera") {
      pon("fueraTiro", A.fueraTiro, { desviado: hay(r.desvia) && r.desvia !== r.tirador });
      pon("vuelta", A.vuelta);
      return { total: t, tramos };
    }
    pon("transicion", A.transicion);
    tecnica(n - 1, "portero", { portero: true });
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
