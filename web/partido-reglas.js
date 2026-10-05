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
  // colocar a los jugadores en los saques (la orden "colocar", O-313)
  VERSION: 7,
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
  IA_TIRO: { lejos: 22, cerca: 13, pCerca: 0.30, pLibre: 0.12, pTapado: 0.02 },
  DUELO_MAX: 0,            // online: segundos para elegir en un duelo; 0 = sin limite, como en 3DS (Aaron, O-299)
  // apoyos en un duelo (DS/3DS): cada companero cerca suma, mas si es de su elemento
  APOYO_RADIO: 7, APOYO: 0.05, APOYO_ELEMENTO: 0.05, APOYOS_MAX: 3,
  // faltas (3DS: el comando de la derecha arriesga falta): si el defensor gana
  // con "Entrada" o "Cargar", puede ser falta; en el area, penalti
  FALTA_ENTRADA: 0.22, FALTA_CARGA: 0.12, DISTANCIA_BARRERA: 9.15,
  // colocar a los tuyos antes de un saque (Aaron, O-307 punto 14: "donde sea, menos
  // demasiado cerca del balon") (O-313): los rivales del que saca, a esta distancia
  // del balon como poco (en la vida real 9,15 m en la falta, el corner y el saque de
  // centro, y 2 m en el de banda). En el penalti, nadie en el area ni en el
  // semicirculo (9,15 m del punto de penalti) salvo el que tira y el portero
  COLOCAR_LEJOS: 9.15,
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
