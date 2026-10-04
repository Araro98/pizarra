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
  MITAD: 180,                   // segundos de juego por parte
  RADIO_JUGADOR: 0.9,
  DISTANCIA_DUELO: 1.7,         // un rival a menos de esto: se para y hay duelo
  RESPIRO_DUELO: 3.0,           // segundos sin duelo para el que acaba de pelear
  ATURDIDO: 1.2,                // el que pierde un duelo se queda quieto esto
  VEL_PASE: 20, VEL_TIRO: 30,   // metros por segundo del balon
  ROCE: 0.985,                  // lo que frena el balon suelto cada paso
  DISTANCIA_TIRO: 38,           // desde mas lejos no se puede chutar a puerta
  // la TENSION de VR: una barra del equipo (max 300) que pagan las
  // supertecnicas (su coste es la columna "tp" de tecnicas.csv). Se gana en
  // los duelos: +60 al ganar un foco o disputa, +30 al perderlo; ganar con
  // supertecnica no da (fandom). Un poco por segundo para que nunca se atasque.
  TENSION_MAX: 300, TENSION_INICIO: 120, TENSION_GANA: 60, TENSION_PIERDE: 30,
  TENSION_POR_SEGUNDO: 0.6, TENSION_DESCANSO: 60,
  KP_POR_SEGUNDO: 0.02,         // el portero recupera un 2 % de su KP por segundo
  AZAR: 0.10,
  // la pausa de 3DS (icono de la mano): para el partido y dibujas rutas a
  // varios jugadores y marcas el pase. Unas cuantas por parte, como mucho
  // unos segundos cada una (online espera al otro).
  PAUSAS_POR_PARTE: 3, PAUSA_MAX: 20,
  CAMBIOS: 3,              // cambios por partido, en la pausa o en el descanso (O-297)
  // cuando chuta la maquina: a menos de `lejos` m, con esta probabilidad en cada
  // decision (cerca de la porteria, con la linea libre o tapada)
  IA_TIRO: { lejos: 18, cerca: 11, pCerca: 0.15, pLibre: 0.05, pTapado: 0 },
  DUELO_MAX: 0,            // online: segundos para elegir en un duelo; 0 = sin limite, como en 3DS (Aaron, O-299)
  // apoyos en un duelo (DS/3DS): cada companero cerca suma, mas si es de su elemento
  APOYO_RADIO: 7, APOYO: 0.05, APOYO_ELEMENTO: 0.05, APOYOS_MAX: 3,
  // faltas (3DS: el comando de la derecha arriesga falta): si el defensor gana
  // con "Entrada" o "Cargar", puede ser falta; en el area, penalti
  FALTA_ENTRADA: 0.22, FALTA_CARGA: 0.12, DISTANCIA_BARRERA: 9.15,
  // invocar el espiritu (el icono de GO; VR: aura que dura y se recarga)
  INVOCAR_COSTE: 100, AURA_SEGUNDOS: 30, AURA_RECARGA: 60, AURA_BONUS: 25,
  // pase bombeado (mantener y soltar): mas lento y no se corta hasta que baja
  VEL_PASE_ALTO: 14, PASE_ALTO_BAJA: 4,
  PASIVAS_TOPE: 60,             // lo mas que suman las pasivas a un valor (%)                   // +-10 % en cada lado de un duelo (en DS habia suerte)

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
  atFoco(j)    { const s = j.stats; return s[2] + s[1] + s[0] / 2; },
  dfFoco(j)    { const s = j.stats; return s[2] + s[6] + s[5] / 2; },
  atDisputa(j) { const s = j.stats; return s[6] + s[4]; },
  dfDisputa(j) { const s = j.stats; return s[6] + s[3]; },
  dfMuro(j)    { const s = j.stats; return s[4] + s[3]; },
  // KP del portero (VR): Agi x4 + Fis x3 + Pres x2; escalado para que una buena
  // supertecnica de tiro supere su parada y un tiro normal no (ajustable)
  KP_ESCALA: 0.42,         // O-302: antes 0.62; con el tiro a la quinta, la supertecnica cuenta mas
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
  // quien gana un duelo: como en IE3, con probabilidad A^3 / (A^3 + D^3)
  probabilidad(a, d) { a = Math.max(1, a); d = Math.max(1, d); return a ** 3 / (a ** 3 + d ** 3); },
  // el tiro contra el portero, mas tajante (O-302): si tu tiro supera su parada
  // sueles marcar y si se queda corto casi nunca (con AT/DF 1,2 entra el 71 %)
  TIRO_EXPONENTE: 5,
  probabilidadTiro(a, d) { a = Math.max(1, a); d = Math.max(1, d); const e = this.TIRO_EXPONENTE; return a ** e / (a ** e + d ** e); },
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
