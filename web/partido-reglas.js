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
  AZAR: 0.10,                   // +-10 % en cada lado de un duelo (en DS habia suerte)

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
  // KP del portero (VR): Agi x4 + Fis x3 + Pres x2; escalado para que en un
  // duelo A^3/(A^3+D^3) una buena tecnica tenga opciones (ajustable)
  KP_ESCALA: 0.45,
  DESGASTE: 0.45,               // lo que pierde el portero al parar, segun el golpe (VR: todo)
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
    if (que === "entrada") return t.tipo === "Defensa" && !/bloqueo de tiros/i.test(t.subtipo || "");
    if (que === "muro") return t.tipo === "Defensa";
    if (que === "tiro") return t.tipo === "Tiro";
    if (que === "parada") return t.tipo === "Parada";
    return false;
  },
  // quien gana un duelo: como en IE3, con probabilidad A^3 / (A^3 + D^3)
  probabilidad(a, d) { a = Math.max(1, a); d = Math.max(1, d); return a ** 3 / (a ** 3 + d ** 3); },
  esLarga(t) { return !!t && /larga|distancia/i.test(t.subtipo || ""); },
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
