/* Escenas (NOTAS O-320; diseno 4.6 y 6.6; guia 7.2, 8.4-8.8 y 10): el 3D de la pantalla
   de ARRIBA en los duelos y en las animaciones, con el HUD de E4 (HudDuelo) encima.
   - El Estudio (uno por pagina; Mundo.escenaEstudio): el estadio y el campo de abajo (las
     mismas geometrias y materiales en mallas nuevas, una vez), sus luces (las mismas que
     abajo: asi valen los mismos shaders) y los ACTORES: un clon del modelo de VR de cada
     jugador (SkeletonUtils comparte la malla y las texturas ya reducidas, 7.3 bis: solo
     hace huesos nuevos), hecho una vez y guardado, uno por id (como mucho 22).
   - Los planos de la guia 7.2 (la entrada al duelo, el lateral, el tirador, el portero) y
     las plantillas de cada tipo de supertecnica (tiro, regate, defensa, bloqueo con
     cupula, parada con mano gigante) con el color y las particulas de su elemento; el
     espiritu (la silueta del jugador x3, translucida: la ★, las ✦, invocar y la
     armadura) y el gol en tres planos (guia 8.6). Cada plantilla se estira o encoge a lo
     que dura su tramo (REGLAS.ANIM).
   - El fondo de lineas de velocidad es un ShaderMaterial y las particulas, 512 puntos con
     atributos fijos que mueve el shader: en cada cuadro solo cambian uniforms (7.3).
   Cada cuadro: componer() decide, sin three (la prueba lo cuenta en node), que plano se
   ve, donde va la camara y que hace cada actor (lo llama el Director, que asi sabe si
   HudDuelo pinta su fondo 2D); pintar() lo pone en las mallas, que se crean una vez, y lo
   pinta. Los modelos traen los clips de VR de los duelos (ievr/g4.py, VERSION_MODELO 3,
   O-323); sin ellos (un modelo de antes) se usan los 4 de siempre movidos a mano.
   - Las animaciones REALES de VR (O-323): cada supertecnica, la ★ y cada invocacion con su
     evento de VR (partido-eventosvr.js: sus cortes, su camara, sus efectos y sus modelos), si
     este PC ya lo ha convertido; si no (o si no llega a tiempo), la plantilla de siempre.
   Este modulo no toca window ni document al cargarse. */
import * as THREE from "./partido-three.module.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";
import { ANIM, ANIM_VR, modeloDe } from "./partido-3d.js";
import { EventoVR } from "./partido-eventosvr.js";

// los actores a x1,45 (los planos de la guia 7.2 se estimaron asi; abajo van a x2,2,
// diseno 5.2). Todo se mide en H, el alto de cada actor hasta lo alto de la cabeza sin
// el pelo (el de punta de VR llega a +0,5 m): su hueso c_head queda a `cabeza` H; sin su
// modelo medido, `alto`. El balon a su escala (la malla del Campo es de 0,35 m). Los dos
// de un duelo de campo, a `separacion` altos uno del otro (t01 +866). Como mucho `max`
// actores (uno por id). El que chuta, arriba nunca a menos de `tiroLejos` m de la porteria
// (salvo en el penalti): si no, la camara de delante y el balon en vuelo atraviesan la red
export const ESTUDIO = { escala: 1.45, alto: 2.45, cabeza: 0.82, max: 22, particulas: 512, estela: 24, balon: 0.62, separacion: 1.15, aspecto: 400 / 240, tiroLejos: 18 };
// las animaciones REALES de VR (O-323). gracia: los s del tramo que se espera a que este
// cargada (mientras, el primer plano de la plantilla: la cara o el negro); luego ya no se
// cambia en ese tramo. guardar: cuantas se quedan cargadas (la que se ve y las siguientes).
// rapido: con las cortas se ven sus ultimos cortes (el golpe, la parada) a como mucho esa
// velocidad. Donde va: en el sitio del que la hace, mirando a la porteria que ataca; el que
// chuta a `lejos` m de la porteria como poco (como la plantilla) y los de campo a `margen`
// m de las bandas y del fondo (si no, la camara de VR acaba dentro de las gradas).
// consulta: cada cuantos ms se pregunta al servidor como va su cola
export const VR_EV = { gracia: 0.6, guardar: 3, rapido: 1.6, lejos: 18, margen: { banda: 9, fondo: 6 }, consulta: 3000 };

// --- las plantillas (diseno 6.6; guia 10) ------------------------------------------------
// Un plano: de-a en s de la duracion nominal de su plantilla (dura). cam: en el marco de
// `en` ("yo", "otro", "medio" (de yo a otro), "balon", "porteria"), en altos del actor (H):
// d = desde y h = hacia, cada uno [a su derecha, arriba, hacia donde mira]; d2, h2 y fov2:
// adonde llega al acabar el plano. yo / otro: su clip (o clips [[clave, desde u]...]: los
// de una vez empiezan ahi) y lo que hacen a mano: salto [H al empezar, al acabar], avance
// [H, H] hacia donde miran, rodea (da la vuelta al otro), sale, cae [rad, rad] (hacia
// atras), gira, tumbado; vr: el clip de VR que lo hace si el modelo lo trae (ANIM_VR; con
// el, sin el salto, la caida ni el tumbado a mano). Los efectos: fondo ("estadio" | "color"
// (su elemento) | "familia" | "gol" | "llamas"), rayas (las lineas de velocidad encima,
// 0..1), blanco (s del destello al empezar), aura, particulas ("yo", "otro", "balon",
// "mano", "espiral"), balon (por donde va), estela, cupula, mano, silueta [alfa, alfa] (el
// espiritu x3 detras) y armadura
const CARA = { de: 0, a: 0.6, nombre: "cara", cam: { en: "yo", d: [0.18, 0.85, 0.84], h: [0.04, 0.8, 0], fov: 30, d2: [0.14, 0.85, 0.72] }, yo: { clip: "parado" }, fondo: "estadio" };
// la carga del espiritu (t17 +233..+1000): la camara sube desde los pies con la espiral
const CARGA = { de: 0, a: 1.0, nombre: "carga", cam: { en: "yo", d: [0.32, 0.06, 0.58], h: [0, 0.12, 0], fov: 46, d2: [0.3, 0.95, 1.7], h2: [0, 0.7, 0], fov2: 52 },
  yo: { clip: "parado" }, particulas: "espiral", fondo: "estadio", fondo2: "familia", cambia: 0.55 };
// el espiritu sale detras, enorme (t17 +2000..+2733)
const SILUETA = { de: 1.0, a: 2.2, nombre: "silueta", cam: { en: "yo", d: [0.2, 0.25, 1.3], h: [0, 2.3, -0.75], fov: 62, d2: [0.1, 0.25, 1.6], h2: [0, 2.0, -0.75] },
  yo: { clip: "parado" }, silueta: [0, 0.8], particulas: "espiral", fondo: "familia" };

const BASE = {
  // el tiro (t04, p10): la cara; el plano general, sube con su aura y sus particulas; el
  // golpe al balon (destello blanco 1 f); el balon en vuelo con su estela
  tiro: { dura: 4.2, planos: [
    CARA,
    { de: 0.6, a: 2.2, nombre: "general", cam: { en: "yo", d: [1.2, 0.3, 1.95], h: [0, 0.7, 0], fov: 44, d2: [1.45, 0.2, 1.8], h2: [0, 1.1, 0] },
      yo: { clip: "parado", salto: [0, 0.7] }, fondo: "estadio", rayas: 0.9, aura: "yo", particulas: "yo", balon: "pie" },
    { de: 2.2, a: 2.7, nombre: "golpe", cam: { en: "yo", d: [1.0, 1.05, 0.9], h: [0, 0.95, 0.25], fov: 42 },
      yo: { clip: "tiro", salto: [0.7, 0.7] }, fondo: "color", blanco: 0.07, aura: "yo", particulas: "yo", balon: "golpe" },
    { de: 2.7, a: 4.2, nombre: "vuelo", cam: { en: "balon", d: [0.35, 0.22, -1.05], h: [0, 0, 1.2], fov: 46 },
      balon: "vuelo", estela: true, particulas: "balon", fondo: "estadio", rayas: 0.85 },
  ] },
  // el regate: corre alrededor del defensa con su efecto y le pasa (el otro se queda
  // girando)
  regate: { dura: 4.2, planos: [
    CARA,
    { de: 0.6, a: 2.6, nombre: "rodea", cam: { en: "medio", d: [2.3, 0.72, -0.1], h: [0, 0.42, 0.12], fov: 46, d2: [2.2, 0.62, 0.2] },
      yo: { clip: "correr", rodea: true }, otro: { clip: "parado" }, fondo: "color", aura: "yo", particulas: "yo", balon: "pie" },
    { de: 2.6, a: 4.2, nombre: "pasa", cam: { en: "medio", d: [2.5, 0.6, 0.5], h: [0, 0.45, 0.6], fov: 44 },
      yo: { clip: "correr", sale: true }, otro: { clip: "parado", gira: true }, fondo: "estadio", rayas: 0.75, particulas: "otro", balon: "pie" },
  ] },
  // la defensa: se lanza a por el que lleva el balon con su efecto y lo tumba
  defensa: { dura: 4.2, planos: [
    CARA,
    { de: 0.6, a: 2.4, nombre: "carga", cam: { en: "medio", d: [2.3, 0.65, -0.2], h: [0, 0.42, 0.1], fov: 46, d2: [2.1, 0.55, 0.05] },
      yo: { clips: [["correr", 0], ["patada", 0.55]], vr: "entrada", avance: [0, 0.7] }, otro: { clip: "correr" }, fondo: "color", aura: "yo", particulas: "yo", balon: "otro" },
    { de: 2.4, a: 4.2, nombre: "impacto", cam: { en: "otro", d: [0.95, 0.42, 1.4], h: [0, 0.36, 0], fov: 46 },
      yo: { clip: "parado", avance: [0.7, 0.7] }, otro: { clip: "parado", cae: [0, 1.2], avance: [0, -0.35] }, fondo: "estadio", rayas: 0.85, particulas: "otro", balon: "yo" },
  ] },
  // el bloqueo (t08): la cara, salta (contrapicado) y, desde arriba, la cupula del color de
  // su elemento entre el y el balon, que se estrella en ella
  bloqueo: { dura: 4.2, planos: [
    CARA,
    { de: 0.6, a: 1.5, nombre: "salta", cam: { en: "yo", d: [0.42, 0.05, 1.15], h: [0, 1.05, 0.05], fov: 50 },
      yo: { clip: "parado", vr: "salto", salto: [0, 0.45] }, aura: "yo", fondo: "estadio" },
    { de: 1.5, a: 4.2, nombre: "cupula", cam: { en: "yo", d: [0.12, 2.15, -0.3], h: [0, 0, 0.3], fov: 56, d2: [0.08, 1.9, -0.2] },
      yo: { clip: "parado", salto: [0.45, 0.1] }, cupula: true, balon: "cupula", particulas: "yo", fondo: "color", rayas: 0.5 },
  ] },
  // la parada (t10): la cara, la mano gigante del color de su elemento delante del portero
  // y el balon que se estrella en ella
  parada: { dura: 4.2, planos: [
    CARA,
    { de: 0.6, a: 2.3, nombre: "mano", cam: { en: "yo", d: [0.7, 0.4, 2.15], h: [0, 0.62, 0.35], fov: 46, d2: [0.82, 0.36, 1.95] },
      yo: { clip: "parado", vr: "parar" }, mano: true, aura: "yo", particulas: "yo", fondo: "color" },
    { de: 2.3, a: 4.2, nombre: "choque", cam: { en: "yo", d: [1.55, 0.5, 1.8], h: [0, 0.62, 0.7], fov: 44 },
      yo: { clip: "parado", vr: "parar" }, mano: true, balon: "mano", estela: true, particulas: "mano", fondo: "estadio", rayas: 0.85 },
  ] },
};

// con espiritu (la ★ de un foco, una ✦ en el tiro, el muro o la porteria; O-310): la
// carga y el espiritu que sale, y luego lo de su tipo (sin la cara) encogido en lo que
// queda, con la silueta detras (diseno 6.5 r)
function conEspiritu(base, dura = 5.0) {
  const resto = base.planos.slice(1), d0 = resto[0].de, k = (dura - SILUETA.a) / (base.dura - d0);
  const r = n => Math.round(n * 1000) / 1000;
  return { dura, espiritu: true, planos: [CARGA, SILUETA].concat(resto.map(q => Object.assign({}, q, {
    de: r(SILUETA.a + (q.de - d0) * k), a: r(SILUETA.a + (q.a - d0) * k), blanco: q.blanco ? q.blanco * k : 0, silueta: [0.55, 0.55] }))) };
}

export const PLANTILLAS = {
  tiro: BASE.tiro, regate: BASE.regate, defensa: BASE.defensa, bloqueo: BASE.bloqueo, parada: BASE.parada,
  "espiritu.tiro": conEspiritu(BASE.tiro), "espiritu.regate": conEspiritu(BASE.regate), "espiritu.defensa": conEspiritu(BASE.defensa),
  "espiritu.bloqueo": conEspiritu(BASE.bloqueo), "espiritu.parada": conEspiritu(BASE.parada),
  // sin supertecnica (diseno 6.5 g y l): el choque de los dos en el plano lateral y las
  // cifras rodando; la patada del tirador; el muro que salta; el portero que la para
  "sin.foco": { dura: 1.4, planos: [{ de: 0, a: 1.4, nombre: "choque", cam: { en: "medio", d: [1.65, 0.48, 0.3], h: [0, 0.45, -0.05], fov: 38 },
    yo: { clip: "correr", avance: [0, 0.42], pierde: [0.43, 0.9] }, otro: { clip: "correr", avance: [0, 0.42], pierde: [0.43, 0.9] }, balon: "pie", rayas: 0.4, fondo: "estadio" }] },
  "sin.tiro": { dura: 1.2, planos: [{ de: 0, a: 1.2, nombre: "patada", cam: { en: "yo", d: [0.62, 0.28, 1.45], h: [0, 0.48, 0.2], fov: 42 },
    yo: { clips: [["parado", 0], ["tiro", 0.25]] }, balon: "golpe", estela: true, fondo: "estadio" }] },
  "sin.muro": { dura: 1.2, planos: [{ de: 0, a: 1.2, nombre: "salta", cam: { en: "yo", d: [0.9, 0.38, 1.6], h: [0, 0.5, 0.3], fov: 44 },
    yo: { clip: "parado", vr: "salto", salto: [0, 0.3] }, balon: "cuerpo", estela: true, fondo: "estadio" }] },
  "sin.portero": { dura: 1.4, planos: [{ de: 0, a: 1.4, nombre: "para", cam: { en: "yo", d: [0.72, 0.45, 2.2], h: [0, 0.55, 0.5], fov: 44 },
    yo: { clip: "parado", vr: "parar" }, balon: "manos", estela: true, fondo: "estadio" }] },
  // el choque de un foco (8.4, t06): en el plano lateral corren el uno hacia el otro
  choque: { dura: 1.4, planos: [{ de: 0, a: 1.4, nombre: "choque", cam: { en: "medio", d: [1.65, 0.48, 0.3], h: [0, 0.45, -0.05], fov: 38 },
    yo: { clip: "correr", avance: [0, 0.42] }, otro: { clip: "correr", avance: [0, 0.42] }, balon: "pie", fondo: "estadio" }] },
  // el tirador se prepara (8.2: el plano cercano) y, en el penalti, la carrera desde detras
  prepara: { dura: 1.0, planos: [{ de: 0, a: 1.0, nombre: "prepara", cam: { en: "yo", d: [0.42, 0.25, 1.5], h: [0, 0.52, 0], fov: 40, d2: [0.4, 0.25, 1.4] },
    yo: { clips: [["parado", 0], ["patada", 0.55]] }, balon: "pie", fondo: "estadio" }] },
  "prepara.penalti": { dura: 1.0, planos: [{ de: 0, a: 1.0, nombre: "carrera", cam: { en: "yo", d: [0.35, 0.5, -1.75], h: [0, 0.3, 2.5], fov: 40 },
    yo: { clip: "correr", avance: [-1.1, -0.25] }, otro: { clip: "parado" }, balon: "punto", fondo: "estadio" }] },
  "entra.penalti": { dura: 1.2, planos: [{ de: 0, a: 1.2, nombre: "entra", cam: { en: "yo", d: [0.35, 0.5, -1.75], h: [0, 0.3, 2.5], fov: 40 },
    yo: { clip: "tiro", avance: [-0.25, -0.15] }, otro: { clip: "parado", tirada: true }, balon: "penalti", estela: true, fondo: "estadio" }] },
  // invocar sobre el mapa (6.5 p; t17), 4,3 s: negro, la carga, el espiritu que sale y su
  // nombre (HUD) con el espiritu enorme detras
  invoca: { dura: 4.3, planos: [
    { de: 0, a: 0.6, nombre: "negro", negro: true },
    Object.assign({}, CARGA, { de: 0.6, a: 1.8 }),
    { de: 1.8, a: 2.7, nombre: "sale", cam: { en: "yo", d: [0.2, 0.25, 1.2], h: [0, 2.4, -0.75], fov: 62, d2: [0.1, 0.25, 1.35] },
      yo: { clip: "parado" }, silueta: [0, 0.8], particulas: "espiral", fondo: "familia" },
    { de: 2.7, a: 4.3, nombre: "nombre", cam: { en: "yo", d: [0, 0.2, 1.75], h: [0, 1.75, -0.75], fov: 64, d2: [0, 0.2, 1.65] },
      yo: { clip: "parado" }, silueta: [0.8, 0.8], fondo: "familia", rayas: 0.5 },
  ] },
  // la armadura (6.5 q; t18): destello blanco y el jugador con su armadura sobre llamas
  // radiales del color de su espiritu
  armadura: { dura: 4.3, planos: [
    { de: 0, a: 0.6, nombre: "destello", cam: { en: "yo", d: [0.1, 0.6, 1.4], h: [0, 0.6, 0], fov: 42 },
      yo: { clip: "parado" }, armadura: true, blanco: 0.3, fondo: "color", rayas: 0.6 },
    { de: 0.6, a: 4.3, nombre: "armadura", cam: { en: "yo", d: [0, 0.52, 1.95], h: [0, 0.5, 0], fov: 42, d2: [0, 0.52, 1.8] },
      yo: { clip: "parado" }, armadura: true, blanco: 0.3, fondo: "llamas" },
  ] },
  // el gol (guia 8.6; t11, t12; 6.5 n), en s del tramo "gol" (completas): el balon rompe la
  // mano entre fuego, detras del portero (que se tira), el balon que se clava en la red de
  // atras (desde detras de ella, con la pista debajo, t12 +2400), negro y la escena del
  // portero caido de cerca y bajo, con el balon botando delante (p13; el "0 - 1" y "¡GOL!"
  // son del HUD)
  gol: { dura: 10.8, planos: [
    { de: 0, a: 0.1, nombre: "blanco", negro: true },
    { de: 0.1, a: 0.4, nombre: "rompe", cam: { en: "yo", d: [0.22, 0.62, 1.1], h: [0, 0.58, 0], fov: 48, d2: [0.18, 0.6, 0.95] },
      yo: { clip: "parado" }, mano: "rompe", balon: "rompe", particulas: "balon", fondo: "gol", rayas: 0.9 },
    { de: 0.4, a: 0.9, nombre: "detras", cam: { en: "porteria", d: [0.1, 0.62, -0.62], h: [0, 0.3, 1.6], fov: 52 },
      yo: { clip: "parado", tirada: true }, balon: "entra", estela: true, particulas: "balon", fondo: "estadio" },
    { de: 0.9, a: 2.4, nombre: "red", cam: { en: "porteria", d: [0, 0.85, -1.25], h: [0, 0.18, -0.35], fov: 50 },
      balon: "red", particulas: "balon", fondo: "estadio" },
    { de: 2.4, a: 3.73, nombre: "negro", negro: true },
    { de: 3.73, a: 6.6, nombre: "escena", cam: { en: "yo", d: [-0.55, 0.26, 1.0], h: [0.02, 0.14, 0.82], fov: 48 },
      yo: { clip: "parado", vr: "caido", tumbado: true }, balon: "bota", bota: [-0.25, 1.05], fondo: "estadio", rayas: 0.6 },
    { de: 6.6, a: 10.8, nombre: "negro", negro: true },
  ] },
};

// los planos del duelo eligiendo (guia 7.2, 8.1 y 8.2; t en s desde que salta el duelo):
// la entrada (+530..+870, baja, el portador corre hacia ella y el otro aun no se ve), el
// lateral de los dos (desde +870, con un vaiven de 0,15 m/s), el tirador de frente-abajo
// (+600, y a +800 mas cerca) y el portero de frente en su porteria (p09)
export const DUELO = {
  corte: { foco: 0.53, tiro: 0.60 }, alLateral: 0.87, cerca: 0.80, vaiven: { amplitud: 0.4, velocidad: 0.375 },
  entrada: { de: 0, a: 1, nombre: "entrada", cam: { en: "yo", d: [1.0, 0.36, 2.6], h: [0.75, 0.42, 0.2], fov: 40 }, yo: { clip: "correr", avance: [-0.7, 0] }, otro: { clip: "parado" }, balon: "pie", fondo: "estadio" },
  lateral: { de: 0, a: 1, nombre: "lateral", cam: { en: "medio", d: [1.65, 0.48, 0.3], h: [0, 0.45, -0.05], fov: 38 }, yo: { clip: "parado" }, otro: { clip: "parado" }, balon: "duelo", fondo: "estadio" },
  tiro: { de: 0, a: 1, nombre: "tirador", cam: { en: "yo", d: [0.6, 0.2, 2.3], h: [0.18, 0.36, 0], fov: 40 }, yo: { clip: "parado" }, balon: "pie", fondo: "estadio" },
  tiroCerca: { de: 0, a: 1, nombre: "tiradorCerca", cam: { en: "yo", d: [0.44, 0.17, 1.55], h: [0.13, 0.37, 0], fov: 40 }, yo: { clip: "parado" }, balon: "pie", fondo: "estadio" },
  portero: { de: 0, a: 1, nombre: "portero", cam: { en: "yo", d: [0.6, 0.5, 2.5], h: [0, 0.45, 0], fov: 40 }, yo: { clip: "parado" }, fondo: "estadio" },
};

// las particulas de cada elemento (diseno 6.6): fuego, llamas que suben; viento, espirales;
// bosque, hojas que giran; montana, rocas y polvo. Sin elemento, la espiral blanca
const PARTICULAS = { Fuego: 0, Viento: 1, Bosque: 2, Montana: 3 };
// lo que deja ver la escena de antes (el fundido, la vuelta, el destello) o sigue detras
// (las cifras que se fijan: t05 +4700)
const VER_ANTES = new Set(["transicion", "vuelta", "destello", "fijar"]);
const ESCENAS = new Set(["choque", "prepara", "tecnica", "hiper", "sinTecnica", "entraPenalti"]);

// --- cuentas pequenas, sin crear nada ----------------------------------------------------
const lerp = (a, b, k) => a + (b - a) * k;
const suave = k => k * k * (3 - 2 * k);
const sale = k => 1 - (1 - k) * (1 - k);
const corta = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// el color de los efectos: la paleta de la pagina (GX, guia 3: nadie escribe un color de
// Galaxy fuera de ella) y el aura de cada familia (AURA_HIPER, O-310)
function paleta() { return typeof GX !== "undefined" ? GX : null; }
export function coloresElemento(el) {
  const g = paleta(), k = g && g.elemento[el] ? el : "ninguno";
  return g ? { claro: g.elementoTexto[k], oscuro: g.elemento[k] } : { claro: "#DDE6F5", oscuro: "#3A4A66" };
}
function colorFamilia(tipo) {
  const a = typeof AURA_HIPER !== "undefined" ? AURA_HIPER[tipo] || AURA_HIPER.keshin : null;
  return a ? a[1] : "#C9A2FF";
}

// lo que sale de componer (se reutiliza cada cuadro)
function nuevaVista() {
  const actor = () => ({ id: -1, x: 0, y: 0, z: 0, giro: 0, tumbado: 0, ladeado: 0, clip: "parado", tiempo: 0, bucle: true });
  return {
    hay: false, plantilla: "", plano: "", u: 0, t: 0, tipo: "", elemento: "", hiper: false,
    cam: { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, fov: 40, mira: -1 },
    actores: [actor(), actor(), actor()], n: 0,
    fondo: "estadio", claro: "#FFFFFF", oscuro: "#000000", efecto: "#FFFFFF", rayas: 0, blanco: 0,
    particulas: { tipo: -1, x: 0, y: 0, z: 0, radio: 1, alto: 2, color: "#FFFFFF" },
    aura: { ver: false, x: 0, y: 0, z: 0, alto: 2 },
    balon: { ver: false, x: 0, y: 0, z: 0, llamas: false, estela: false, giro: 0, beh: "", u: 0 },
    cupula: { ver: false, x: 0, y: 0, z: 0, radio: 1 },
    mano: { ver: false, x: 0, y: 0, z: 0, tam: 1, alfa: 1, giro: 0 },
    silueta: { id: -1, alfa: 0, x: 0, y: 0, z: 0, giro: 0, escala: 3, color: "#FFFFFF", armadura: false },
    espiral: { ver: false, x: 0, y: 0, z: 0, radio: 1, alto: 2, alfa: 1, color: "#35DBF5" },
    // la animacion de VR de este cuadro (O-323), o null: cual (clave), en que s del evento y
    // donde va (el sitio y hacia donde mira el que la hace)
    vr: null, _vr: { clave: "", evento: "", t: 0, x: 0, z: 0, giro: 0 },
  };
}
// un actor del montaje: su base (x, z de three), hacia donde mira (fx, fz), su alto y
// donde esta ahora (cx, cy, cz) con lo que hace en el plano
function nuevoSitio() { return { id: -1, bx: 0, bz: 0, fx: 0, fz: 1, H: ESTUDIO.alto, cx: 0, cy: 0, cz: 0, giro: 0 }; }

export const Escenas = {
  ESTUDIO, PLANTILLAS, DUELO,
  vista: nuevaVista(),
  ms: 0,                      // los ms de JS del ultimo cuadro pintado (sin el render)
  _M: { yo: nuevoSitio(), otro: nuevoSitio(), hayOtro: false, gx: 0, gz: 0, gfx: 0, gfz: 1, H: ESTUDIO.alto, tiroX: 0, zona: 1, zonaP: 1, lleva: -1, finalGol: false },
  _E: null,                   // las mallas del Estudio (una vez por pagina)
  _tiene: null,               // (id, clave): si el actor trae ese clip (solo en el navegador)
  _v3: { x: 0, y: 0, z: 0 }, _b: { x: 0, y: 0, z: 0 }, _ra: [0, 0], _rb: [0, 0], _pe: {}, _tGol: 0,

  // el alto de un actor (m): el de su modelo si ya esta, si no el de siempre
  altoDe(id) { const a = this._porId && this._porId[id]; return a && a.alto ? a.alto : ESTUDIO.alto; },

  // --- que plantilla (puro) --------------------------------------------------------------
  // el tipo de una supertecnica por su tramo: en un foco, regate el que ataca y defensa el
  // que defiende; en el tiro, el bloqueo del muro y la parada del portero
  tipoDe(r, q) {
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") return q.jugador === r.atacante ? "regate" : "defensa";
    return q.muro ? "bloqueo" : q.portero ? "parada" : "tiro";
  },
  elementoDe(p, r, q) {
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") {
      const j = p.jugadores[q.jugador];
      return j && r.elementos ? r.elementos[j.lado] || "" : "";
    }
    const s = (r.pasos || [])[q.paso !== undefined ? q.paso : 0];
    return s ? s.elemento || "" : "";
  },
  // la plantilla de un tipo, un elemento y si es de espiritu: {clave, base, elemento,
  // particulas, claro, oscuro} (hecha una vez y guardada)
  plantilla(tipo, elemento, hiper) {
    const clave = (hiper ? "espiritu." : "") + tipo, el = PARTICULAS[elemento] !== undefined ? elemento : "";
    const k = clave + "|" + el;
    const cache = this._cache || (this._cache = new Map());
    let pl = cache.get(k);
    if (!pl) {
      const c = coloresElemento(el);
      pl = { clave, base: PLANTILLAS[clave] || PLANTILLAS[tipo], tipo, elemento: el, hiper: !!hiper,
             particulas: el ? PARTICULAS[el] : 1, claro: c.claro, oscuro: c.oscuro, efecto: c.claro };
      cache.set(k, pl);
    }
    return pl;
  },
  // el plano de una plantilla a los t s de un tramo que dura `dura`: {plano, u, s (en su
  // tiempo nominal), tp (s reales dentro del plano)}
  planoEn(base, t, dura, o = {}) {
    const f = base.dura / Math.max(0.001, dura), s = Math.max(0, t) * f, ps = base.planos;
    let k = 0;
    while (k < ps.length - 1 && s >= ps[k].a) k++;
    const q = ps[k];
    o.plano = q; o.k = k; o.s = s; o.u = corta((s - q.de) / Math.max(1e-6, q.a - q.de)); o.tp = Math.max(0, s - q.de) / f;
    return o;
  },

  // --- componer: que se ve en este cuadro (puro, sin three) -------------------------------
  // A: estado.arriba del Director (su modo y su tramo). Si no hay nada 3D que ensenar (un
  // plano negro, sin jugadores), out.hay es false y HudDuelo pinta lo suyo
  componer(p, A, yo, out = this.vista) {
    out.hay = false; out.n = 0; out.plantilla = ""; out.plano = ""; out.tipo = ""; out.elemento = ""; out.hiper = false; out.vr = null;
    if (!p || !A || !A.tramo) return out;
    const tr = A.tramo;
    if (tr.que === "duelo") this._duelo(p, tr, yo, out);
    else if (tr.que === "invoca") this._invoca(p, tr, out);
    else if (A.modo === "gol") this._gol(p, tr, out);
    else if (tr.res && tr.res.r) this._anim(p, tr, yo, out);
    return out;
  },

  // el duelo eligiendo: la entrada y el lateral (foco), el tirador o el portero (tiro)
  _duelo(p, tr, yo, out) {
    const du = tr.duelo && tr.duelo.obj, t = tr.t;
    if (!du) return;
    const M = this._M;
    if (du.tipo === "foco") {
      const a = p.jugadores[du.atacante], d = p.jugadores[du.defensor];
      if (!a || !d) return;
      M.lleva = a.id;
      if (t < DUELO.alLateral) {
        this._montarFoco(p, a, d, a);
        return this._plano(p, DUELO.entrada, corta((t - DUELO.corte.foco) / (DUELO.alLateral - DUELO.corte.foco)), t, "duelo", out);
      }
      // el tuyo a la izquierda, como sus fichas del HUD
      this._montarFoco(p, a, d, a.lado === yo ? a : d);
      const pl = this._plano(p, DUELO.lateral, 0, t, "duelo", out);
      // el vaiven (guia 7.2): la camara va y viene despacio a lo largo de los dos
      const V = DUELO.vaiven, s = V.amplitud * Math.sin((t - DUELO.alLateral) * V.velocidad);
      const fx = M.otro.bx - M.yo.bx, fz = M.otro.bz - M.yo.bz, l = Math.hypot(fx, fz) || 1;
      out.cam.x += fx / l * s; out.cam.z += fz / l * s; out.cam.hx += fx / l * s; out.cam.hz += fz / l * s;
      return pl;
    }
    const s = p.jugadores[du.tirador], k = p.jugadores[du.portero];
    if (!s) return;
    // el tiro que viaja (O-325): en el chute, el que chuta (para los dos: el portero aun no
    // elige); al muro y al que encadena, ellos en su sitio; el portero, en su porteria
    if (du.etapa === "muro" || du.etapa === "cadena") {
      const m = p.jugadores[du.etapa === "muro" ? du.muro : du.cadena];
      if (!m) return;
      // el que encadena, como uno que chuta (mirando a la porteria); el muro, mirando al tiro
      if (du.etapa === "cadena") { this._montarTiro(p, m, k, m, du); return this._plano(p, DUELO.tiroCerca, 0, t, "duelo", out); }
      this._montarTiro(p, s, m, m, du);
      return this._plano(p, DUELO.portero, 0, t, "duelo", out);
    }
    if ((s.lado === yo || !k || du.etapa === "chute") && !(du.etapa === "portero" && k)) {
      this._montarTiro(p, s, k, s, du);
      return this._plano(p, t < DUELO.cerca ? DUELO.tiro : DUELO.tiroCerca, 0, t, "duelo", out);
    }
    // te tiran: el portero en su porteria (p09)
    this._montarTiro(p, s, k, k, du);
    return this._plano(p, DUELO.portero, 0, t, "duelo", out);
  },

  // la invocacion sobre el mapa (y la armadura)
  _invoca(p, tr, out) {
    const j = p.jugadores[tr.jugador];
    if (!j) return;
    // la de VR (O-323): la invocacion o la transformacion de verdad, si esta
    if (this.vr) {
      const info = this._vrInfoInvoca(p, tr, j);
      const d = info && this._vrDecide("i" + tr.jugador + "@" + tr.t0, 0, info, tr.t);
      if (d && this._vrPon(info, d, tr.t, tr.dura || 4.3, false, out)) return out;
    }
    const arm = tr.familia === "armadura" || j.hiperTipo === "armadura", base = PLANTILLAS[arm ? "armadura" : "invoca"];
    this._montarSolo(p, j);
    const P = this.planoEn(base, tr.t, base.dura, this._pe);
    out.claro = out.oscuro = colorFamilia(j.hiperTipo);
    this._plano(p, P.plano, P.u, P.tp, arm ? "armadura" : "invoca", out, { familia: j.hiperTipo });
  },

  // el gol: los tres planos y la escena del portero caido; las cortas, solo la escena
  // (como el HUD: HudDuelo._gol)
  _gol(p, tr, out) {
    const R = tr.res, r = (R && R.r) || {}, ps = r.pasos || [];
    const tir = p.jugadores[r.tirador] || p.jugadores[(ps[0] || {}).quien];
    if (!tir) return;
    const pf = ps[ps.length - 1];
    let k = r.portero !== undefined ? p.jugadores[r.portero] : pf && pf.quien !== undefined && p.jugadores[pf.quien] && p.jugadores[pf.quien].lado !== tir.lado ? p.jugadores[pf.quien] : null;
    if (!k && p.portero) k = p.portero(1 - tir.lado);
    let t = tr.t;
    if (tr.completas === false) {
      const f = tr.dura / 4.4, ts = t / f;
      if (ts >= 2.8) return;
      t = 3.73 + Math.max(0, ts - 0.2) * 1.1;
    }
    this._tGol = t;
    this._montarPorteria(p, tir, k, r);
    const base = PLANTILLAS.gol, P = this.planoEn(base, t, base.dura, this._pe);
    const g = paleta(), c = (typeof HUD_DUELO !== "undefined" && HUD_DUELO.gol) || ["#FFD27A", "#B8340A"];
    out.claro = c[0]; out.oscuro = c[1];
    this._plano(p, P.plano, P.u, P.tp, "gol", out, { fuego: true, efecto: g ? g.elementoTexto.Fuego : "#E6550F" });
  },

  // un tramo del plan (el choque, la preparacion, cada supertecnica, sin tecnica, el
  // penalti); en el fundido, la vuelta, el destello y al fijar, la escena de antes
  _anim(p, tr, yo, out) {
    const R = tr.res, r = R.r, ts = R.plan.tramos;
    let q = tr.q, t = tr.t, extra = 0, kq = tr.k;
    if (!q) return;
    if (VER_ANTES.has(q.que)) {
      let i = tr.k - 1;
      while (i >= 0 && !ESCENAS.has(ts[i].que)) i--;
      if (i < 0) return;
      extra = q.que === "fijar" ? t : 0;
      q = ts[i]; t = q.a - q.de; kq = i;
    }
    const dura = Math.max(0.001, q.a - q.de), foco = r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta";
    // la supertecnica (o la ★) con su animacion de VR, si esta (O-323); al fijar se queda en
    // su ultimo cuadro
    if ((q.que === "tecnica" || q.que === "hiper") && this.vr) {
      const info = this._vrInfosPlan(p, R)[kq];
      const d = info && this._vrDecide(R, kq, info, t + extra);
      // con las cortas (o el plan corto de un anfitrion sin animaciones), solo el final
      const cortas = !!(R.corto || (r.anim && r.anim.modo === "cortas"));
      if (d && this._vrPon(info, d, t + extra, dura, cortas, out)) return;
    }
    const ps = r.pasos || [], tir = foco ? null : p.jugadores[(ps[0] || {}).quien !== undefined ? ps[0].quien : r.tirador];
    const portero = foco ? null : r.portero !== undefined ? p.jugadores[r.portero] : this._porteroDe(p, r, tir);
    this._M.finalGol = r.final === "gol";
    let base, clave, pl = null, elem = "";
    if (foco) {
      const a = p.jugadores[r.atacante], d = p.jugadores[r.defensor];
      if (!a || !d) return;
      this._M.lleva = a.id;
      if (q.que === "tecnica" || q.que === "hiper") {
        const j = p.jugadores[q.jugador] || a;
        this._montarFoco(p, a, d, j);
      } else this._montarFoco(p, a, d, a.lado === yo ? a : d);
    } else if (!tir) return;
    if (q.que === "choque") { base = PLANTILLAS.choque; clave = "choque"; }
    else if (q.que === "prepara") {
      const pen = r.tipo === "penalti";
      base = PLANTILLAS[pen ? "prepara.penalti" : "prepara"]; clave = pen ? "prepara.penalti" : "prepara";
      this._montarTiro(p, tir, portero, tir, r);
    } else if (q.que === "entraPenalti") {
      base = PLANTILLAS["entra.penalti"]; clave = "entra.penalti";
      this._montarTiro(p, tir, portero, tir, r);
    } else if (q.que === "sinTecnica") {
      clave = "sin." + (q.sub || "foco"); base = PLANTILLAS[clave] || PLANTILLAS["sin.foco"];
      if (!foco) this._montarDeTiro(p, r, q, tir, portero);
    } else if (q.que === "tecnica" || q.que === "hiper") {
      const tipo = this.tipoDe(r, q);
      elem = this.elementoDe(p, r, q);
      pl = this.plantilla(tipo, elem, q.que === "hiper" || /[★✦]/.test(this._nombreDe(r, q, p)));
      base = pl.base; clave = pl.clave;
      if (!foco) this._montarDeTiro(p, r, q, tir, portero);
    } else return;
    const P = this.planoEn(base, t + extra, dura, this._pe);
    const c = coloresElemento(elem);
    out.claro = c.claro; out.oscuro = c.oscuro;
    const j = p.jugadores[q.jugador] || tir;
    this._plano(p, P.plano, P.u, P.tp, clave, out, { pl, familia: j ? j.hiperTipo : null, gana: foco ? r.ganador : null });
    out.tipo = pl ? pl.tipo : ""; out.elemento = elem; out.hiper = !!(pl && pl.hiper);
  },
  // el nombre de la tecnica de un tramo (para la ✦ de las de espiritu)
  _nombreDe(r, q, p) {
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") { const j = p.jugadores[q.jugador]; return j && r.tecnicas ? r.tecnicas[j.lado] || "" : ""; }
    const s = (r.pasos || [])[q.paso !== undefined ? q.paso : 0];
    return s ? s.que || "" : "";
  },
  _porteroDe(p, r, tir) {
    const ps = r.pasos || [], pf = ps[ps.length - 1];
    if (pf && tir && p.jugadores[pf.quien] && p.jugadores[pf.quien].lado !== tir.lado && p.jugadores[pf.quien].esPortero) return p.jugadores[pf.quien];
    return tir && p.portero ? p.portero(1 - tir.lado) : null;
  },
  // --- las animaciones de VR (O-323): cual va en cada tramo (puro, sin three) ----------------
  // vr: lo que dice el servidor de este partido (POST /api/partido/eventos/preparar): el
  // evento de cada supertecnica (por su nombre interno) y de cada espiritu, y los que este PC
  // ya tiene convertidos (hechos). Sin el (node, sin servidor) todo es plantilla
  vr: null,
  // la de cada tramo de un plan (una vez por plan): {clave, evento, actores {s00: modelo...},
  // asignado, x, z, giro} o null
  _vrInfosPlan(p, R) {
    const c = this._vrPC;
    if (c && c.R === R) return c.infos;
    const infos = R.plan.tramos.map(q => (q.que === "tecnica" || q.que === "hiper") && R.r ? this._vrInfoTramo(p, R.r, q) : null);
    this._vrPC = { R, infos };
    return infos;
  },
  _vrInfoTramo(p, r, q) {
    const V = this.vr, j = p.jugadores[q.jugador];
    if (!V || !j) return null;
    const foco = r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta", nombre = this._nombreDe(r, q, p) || "";
    // la ★ (invocar en el duelo): la invocacion de su espiritu
    if (/^★/.test(nombre) || (foco && r.hipers && r.hipers[j.lado])) return this._vrInfoEspiritu(p, j);
    const n = nombre.replace(/ \(cadena\)$/, ""), busca = l => (l || []).find(x => x.nombre === n);
    const t = busca(j.tecnicas) || (j.propio && busca(j.propio.tecnicas));
    const e = t && t.interno ? V.tecnicas[t.interno] : null;
    if (!e || !e.evento) return null;
    // la parada que acaba en gol y el muro que no para el tiro: el evento de fallo (_2)
    const falla = q.portero ? r.final === "gol" : q.muro ? !(r.final === "bloqueado" || (r.final === "fuera" && r.desvia !== undefined && r.desvia !== r.tirador)) : false;
    const evento = falla && e.evento_fallo ? e.evento_fallo : e.evento;
    // los personajes del evento: el que la hace, sus companeros (las de 2 o 3) y el rival
    const actores = { s00: modeloDe(j) }, n0 = Math.max(1, +e.jugadores || 1);
    if (n0 > 1) {
      const lista = this._vrCerca(p, j, j.lado, Math.min(n0, Math.max(1, +t.jugadores || 1)) - 1, []);
      const rival = this._vrRival(p, r, q, j);
      if (rival && lista.length < n0 - 1) lista.push(rival);
      this._vrCerca(p, j, 1 - j.lado, n0 - 1 - lista.length, lista);
      lista.forEach((x, i) => { actores["s" + String(i + 1).padStart(2, "0")] = modeloDe(x); });
    }
    const esp = j.espiritu && V.espiritus[j.espiritu.id];
    const asignado = e.asignado ? (esp && esp.asignado) || j.keshinHiper || null : null;
    // el que chuta, lejos de la porteria (no el muro ni el portero)
    return this._vrInfo(p, j, evento, actores, asignado, !foco && !q.muro && !q.portero);
  },
  // la invocacion (o la ★): s00 el jugador como era y s01 en lo que se convierte (armadura,
  // mixi max, modo); asignado, su keshin o alma
  _vrInfoEspiritu(p, j) {
    const V = this.vr, e = V && j.espiritu ? V.espiritus[j.espiritu.id] : null;
    if (!e || !e.evento) return null;
    const actores = { s00: (j.propio && j.propio.cara) || j.cara }, forma = e.cara_a || j.modelo || "";
    if (forma) actores.s01 = forma;
    return this._vrInfo(p, j, e.evento, actores, e.asignado || j.keshinHiper || null, false);
  },
  _vrInfoInvoca(p, tr, j) {
    const c = this._vrIC;
    if (c && c.t0 === tr.t0 && c.id === tr.jugador) return c.info;
    const info = this._vrInfoEspiritu(p, j);
    this._vrIC = { t0: tr.t0, id: tr.jugador, info };
    return info;
  },
  // donde va: en el sitio del que la hace, mirando a la porteria que ataca (VR_EV)
  _vrInfo(p, j, evento, actores, asignado, tiro) {
    const g = p.porteriaRival ? p.porteriaRival(j) : { x: 0, y: 52.5 * (j.dir || 1) };
    const gx = -g.x, gz = g.y;
    let x = -j.x, z = j.y;
    if (!j.esPortero) {
      const M = VR_EV.margen, bx = (typeof REGLAS !== "undefined" ? REGLAS.ANCHO : 68) / 2 - M.banda, bz = (typeof REGLAS !== "undefined" ? REGLAS.LARGO : 105) / 2 - M.fondo;
      x = corta(x, -bx, bx); z = corta(z, -bz, bz);
      const d = Math.hypot(x - gx, z - gz);
      if (tiro && d < VR_EV.lejos && d > 0.01) { x = gx + (x - gx) / d * VR_EV.lejos; z = gz + (z - gz) / d * VR_EV.lejos; }
    }
    const caras = Object.keys(actores).sort().map(k => actores[k]).join(",");
    return { clave: evento + "|" + caras + "|" + (asignado || ""), evento, actores, asignado, x, z, giro: Math.atan2(gx - x, gz - z) };
  },
  // los n mas cerca de j de ese lado (sin el portero si hay otros), anadidos a `lista`
  _vrCerca(p, j, lado, n, lista) {
    if (n <= 0) return lista;
    const ds = p.jugadores.filter(x => x.lado === lado && x !== j && !x.expulsado && !lista.includes(x))
      .sort((a, b) => (a.esPortero - b.esPortero) || (Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y)));
    for (const x of ds.slice(0, n)) lista.push(x);
    return lista;
  },
  // el rival de una tecnica: el del foco, el que chuta (al muro y al portero) o el portero
  _vrRival(p, r, q, j) {
    const J = id => (id !== undefined && id !== null ? p.jugadores[id] : null);
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") return J(j.id === r.atacante ? r.defensor : r.atacante);
    if (q.muro || q.portero) return J(r.tirador);
    return J(r.portero) || (p.portero ? p.portero(1 - j.lado) : null);
  },
  // la animacion de VR del tramo `k` del plan R (o de una invocacion): se decide una vez por
  // tramo. Si ya esta cargada al empezar (o en los VR_EV.gracia s primeros), la de VR desde
  // ahi; si no, la plantilla todo el tramo. -> {desde} o null
  _vrDecide(R, k, info, t) {
    let dec = this._vrDec;
    if (!dec || dec.R !== R) dec = this._vrDec = { R, k: [] };
    let x = dec.k[k];
    const e = this._vrEv ? this._vrEv.get(info.clave) : null, lista = !!(e && e.ev);
    if (!x) x = dec.k[k] = { desde: -1, no: false };
    if (x.desde < 0 && !x.no) {
      // (cuantas salen de VR y cuantas no, y por que: para las pruebas y "Ver FPS")
      const C = this._vrCuenta || (this._vrCuenta = { vr: 0, tarde: 0, sinConvertir: 0 });
      // (si ya estaba al verse el tramo, desde su principio aunque se vea tarde: un cuadro
      // lento, al fijar; si se ha esperado, desde ahora)
      if (lista) { x.desde = x.espera && t >= 0.05 ? t : 0; C.vr++; }
      else if (!this._vrPuede(info)) { x.no = true; C.sinConvertir++; }
      else if (t > VR_EV.gracia) { x.no = true; C.tarde++; }
      else x.espera = true;
    }
    return x.desde >= 0 && lista ? x : null;
  },
  // si se puede tener: este PC lo ha convertido y no ha fallado al cargarlo (hace menos de 30 s)
  _vrPuede(info) {
    const V = this.vr, e = this._vrEv ? this._vrEv.get(info.clave) : null;
    return !!(V && V.hechos && V.hechos.has(info.evento) && (!e || e.estado !== "mal" || (this._ahora && this._ahora() > e.hasta)));
  },
  // el cuadro de VR: en que s del evento va (lo que queda del tramo, entero; con las cortas,
  // sus ultimos cortes) y donde
  _vrPon(info, d, t, dura, cortas, out) {
    const e = this._vrEv.get(info.clave), ev = e && e.ev;
    if (!ev) return false;
    const D = ev.duracion, resto = Math.max(0.001, dura - d.desde);
    let ini = 0;
    if (cortas) {
      // el ultimo corte (o los ultimos) que cabe a como mucho VR_EV.rapido
      ini = Math.max(0, D - resto * VR_EV.rapido);
      for (let i = ev.cortes.length - 1; i >= 0; i--) { const c0 = ev.cortes[i].ini / 60; if (c0 >= ini) { ini = c0; if (D - c0 >= resto * 0.7) break; } }
    }
    const v = out._vr;
    v.clave = info.clave; v.evento = info.evento; v.x = info.x; v.z = info.z; v.giro = info.giro;
    v.t = corta(ini + Math.max(0, t - d.desde) * (D - ini) / resto, 0, D);
    e.usado = this._ahora ? this._ahora() : 0;
    out.vr = v; out.hay = true; out.plantilla = "vr"; out.plano = info.evento; out.t = t; out.u = corta(t / Math.max(0.001, dura));
    return true;
  },

  // en un tiro, quien hace el tramo: el que chuta (o encadena), el muro o el portero
  _montarDeTiro(p, r, q, tir, portero) {
    const j = p.jugadores[q.jugador] || tir;
    if (q.muro) this._montarTiro(p, tir, j, j, r);
    else if (q.portero || (j && portero && j.id === portero.id)) this._montarTiro(p, tir, portero || j, portero || j, r);
    else this._montarTiro(p, j, portero, j, r);
  },

  // --- el montaje: donde estan los actores (en el sitio de los de verdad) -------------------
  _pon(S, j, x, z, fx, fz) {
    const l = Math.hypot(fx, fz) || 1;
    S.id = j.id; S.bx = x; S.bz = z; S.fx = fx / l; S.fz = fz / l; S.H = this.altoDe(j.id);
    if (!(Math.hypot(fx, fz) > 1e-6)) { S.fx = 0; S.fz = 1; }
    S.cx = x; S.cy = 0; S.cz = z; S.giro = Math.atan2(S.fx, S.fz);
  },
  // un foco: los dos frente a frente en el punto medio, a `separacion` altos; yo = quien
  // hace el tramo (o el tuyo en el lateral)
  _montarFoco(p, a, d, quien) {
    const M = this._M, ax = -a.x, az = a.y, dx = -d.x, dz = d.y;
    let fx = dx - ax, fz = dz - az;
    if (Math.hypot(fx, fz) < 0.1) { fx = 0; fz = a.dir || 1; }
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    const mx = (ax + dx) / 2, mz = (az + dz) / 2, h = ESTUDIO.separacion * (this.altoDe(a.id) + this.altoDe(d.id)) / 4;
    const [y, o] = quien === d ? [d, a] : [a, d], s = quien === d ? -1 : 1;
    this._pon(M.yo, y, mx - s * fx * h, mz - s * fz * h, s * fx, s * fz);
    this._pon(M.otro, o, mx + s * fx * h, mz + s * fz * h, -s * fx, -s * fz);
    M.hayOtro = true; this._porteriaDe(p, a);
  },
  // un tiro: el que chuta mirando a la porteria y el portero mirandole; yo = quien se ve
  // (el que chuta, el muro o el portero)
  _montarTiro(p, tir, por, quien, r) {
    const M = this._M;
    this._porteriaDe(p, tir);
    let tx = -tir.x, tz = tir.y;
    const dx = tx - M.gx, dz = tz - M.gz, d = Math.hypot(dx, dz);
    if (!(r && r.tipo === "penalti") && d < ESTUDIO.tiroLejos && d > 0.01) { tx = M.gx + dx / d * ESTUDIO.tiroLejos; tz = M.gz + dz / d * ESTUDIO.tiroLejos; }
    if (quien === tir || !quien) {
      this._pon(M.yo, tir, tx, tz, M.gx - tx, M.gz - tz);
      M.hayOtro = !!por;
      if (por) this._pon(M.otro, por, -por.x, por.y, tx + por.x, tz - por.y);
    } else {
      this._pon(M.yo, quien, -quien.x, quien.y, tx + quien.x, tz - quien.y);
      this._pon(M.otro, tir, tx, tz, M.gx - tx, M.gz - tz);
      M.hayOtro = true;
    }
    // el penalti: adonde va cada uno (zonas de la porteria, como el Director)
    M.zona = 1; M.zonaP = 1;
    if (r && r.zonas && por) { M.zona = r.zonas[tir.lado]; M.zonaP = r.zonas[por.lado]; }
  },
  _montarSolo(p, j) {
    const M = this._M;
    this._pon(M.yo, j, -j.x, j.y, 0, j.dir || 1);
    M.hayOtro = false; this._porteriaDe(p, j);
  },
  // el gol: el portero que lo encaja delante de su porteria (yo) y el que marca
  _montarPorteria(p, tir, por, r) {
    const M = this._M;
    this._porteriaDe(p, tir);
    if (por) this._pon(M.yo, por, M.gx + M.gfx * 0.45 * ESTUDIO.alto, M.gz + M.gfz * 0.45 * ESTUDIO.alto, M.gfx, M.gfz);
    else this._pon(M.yo, tir, M.gx + M.gfx * 0.45 * ESTUDIO.alto, M.gz + M.gfz * 0.45 * ESTUDIO.alto, M.gfx, M.gfz);
    this._pon(M.otro, tir, -tir.x, tir.y, M.gx + tir.x, M.gz - tir.y);
    M.hayOtro = false;
    // por donde entra (el mismo azar de pantalla que la repeticion del Director)
    M.tiroX = ((((r && r.k) || 3) * 37) % 9 - 4) * 0.5;
    // el portero se tira al otro lado del balon
    M.zona = M.tiroX >= 0 ? 0 : 2; M.zonaP = 1;
  },
  // la porteria a la que tira j: su centro en el suelo y hacia el campo
  _porteriaDe(p, j) {
    const M = this._M, g = p.porteriaRival ? p.porteriaRival(j) : { x: 0, y: 52.5 * (j.dir || 1) };
    M.gx = -g.x; M.gz = g.y; M.gfx = 0; M.gfz = -Math.sign(g.y || 1); M.H = ESTUDIO.alto;
  },

  // --- un plano: los actores, la camara y los efectos (puro) ------------------------------
  // q: el plano; u: 0..1 dentro de el; tp: s reales dentro de el; clave: su plantilla
  _plano(p, q, u, tp, clave, out, o = {}) {
    const M = this._M, ue = suave(u);
    out.plantilla = clave; out.plano = q.nombre; out.u = u; out.t = tp;
    if (q.negro) { out.hay = false; return out; }
    out.hay = true;
    // el color del fondo y de los efectos: el elemento (lo puso quien llama), la familia
    // del espiritu, el del gol
    const famCol = o.familia ? colorFamilia(o.familia) : null;
    // fondo2: el fondo cambia a mitad del plano (la carga: del estadio al azul, t17 +1233)
    const fq = q.fondo2 && u >= q.cambia ? q.fondo2 : q.fondo;
    out.fondo = fq === "llamas" ? "llamas" : fq === "familia" || fq === "gol" ? "color" : fq || "estadio";
    if (fq === "familia" && famCol) { out.claro = "#2E62D8"; out.oscuro = "#050C3A"; }
    if (fq === "llamas" && famCol) { out.claro = famCol; out.oscuro = "#B02A06"; }
    if (q.armadura && fq === "color") { out.claro = "#4A2A1A"; out.oscuro = "#0A0505"; }
    out.efecto = o.efecto || (o.pl ? o.pl.efecto : out.claro);
    out.rayas = fq === q.fondo && q.rayas ? q.rayas : out.fondo !== "estadio" ? 1 : 0;
    out.blanco = q.blanco ? corta(1 - tp / q.blanco) : 0;
    // los actores: donde estan ahora
    out.n = 0;
    const H = M.yo.H;
    if (q.yo) this._actor(M.yo, q.yo, u, ue, tp, out, o, M.hayOtro ? M.otro : null, true);
    if (q.otro && M.hayOtro) this._actor(M.otro, q.otro, u, ue, tp, out, o, M.yo, false);
    // el balon
    const b = out.balon;
    b.ver = !!q.balon; b.estela = !!q.estela;
    b.llamas = !!(o.fuego && q.particulas === "balon") || !!(o.pl && o.pl.elemento === "Fuego" && (q.balon === "vuelo" || q.balon === "golpe" || q.balon === "mano" || q.balon === "cupula"));
    b.beh = q.balon || ""; b.u = u; M.bota = q.bota || null;
    if (b.ver) { this.balonEn(q.balon, u, tp, this._b); b.x = this._b.x; b.y = this._b.y; b.z = this._b.z; b.giro = tp * 14; }
    // la camara, en su marco
    this._camara(q.cam, ue, out);
    // los efectos
    const pa = out.particulas;
    pa.tipo = -1;
    if (q.particulas) {
      const enBalon = q.particulas === "balon", enMano = q.particulas === "mano", espiral = q.particulas === "espiral";
      const S = q.particulas === "otro" ? M.otro : M.yo;
      pa.tipo = espiral ? 1 : o.fuego ? 0 : o.pl ? o.pl.particulas : 1;
      // la espiral de la carga: el cian de la de Galaxy (t17; el de los rotulos)
      pa.color = espiral ? (typeof GX_ROT !== "undefined" ? GX_ROT.espiral[0] : "#35DBF5") : out.efecto;
      if (enBalon && b.ver) { pa.x = b.x; pa.y = b.y - 0.1 * H; pa.z = b.z; pa.radio = 0.22 * H; pa.alto = 0.7 * H; }
      else if (enMano) { this._punto(M.yo, 0, 0.62, 0.62, this._v3); pa.x = this._v3.x; pa.y = this._v3.y - 0.3 * H; pa.z = this._v3.z; pa.radio = 0.45 * H; pa.alto = 0.9 * H; }
      else { pa.x = S.cx; pa.y = S.cy; pa.z = S.cz; pa.radio = (espiral ? 0.42 : 0.55) * S.H; pa.alto = (espiral ? 1.2 : 1.35) * S.H; }
    }
    // las cintas cian en espiral de la carga del espiritu (t17 +500..+1733: suben desde los
    // pies y lo envuelven); con las particulas de la espiral
    const es = out.espiral;
    es.ver = q.particulas === "espiral";
    if (es.ver) {
      // crece con el plano: en los pies, pegada; al final envuelve al jugador entero
      const ce = q.silueta ? 1 : ue;
      es.x = M.yo.cx; es.y = M.yo.cy; es.z = M.yo.cz; es.radio = (0.3 + 0.45 * ce) * H; es.alto = (0.75 + 0.75 * ce) * H;
      es.alfa = corta(u / 0.15) * (q.silueta ? 1 - 0.6 * corta(u / 0.6) : 1);
      es.color = typeof GX_ROT !== "undefined" ? GX_ROT.espiral[0] : "#35DBF5";
    }
    const au = out.aura;
    au.ver = q.aura === "yo";
    if (au.ver) { au.x = M.yo.cx; au.y = M.yo.cy + 0.5 * H; au.z = M.yo.cz; au.alto = H; }
    const cu = out.cupula;
    cu.ver = !!q.cupula;
    if (cu.ver) { this._punto(M.yo, 0, 0, 0.35, this._v3); cu.x = this._v3.x; cu.y = 0; cu.z = this._v3.z; cu.radio = 1.75 * H * sale(corta(u / 0.3)); }
    const ma = out.mano;
    ma.ver = !!q.mano;
    if (ma.ver) {
      this._punto(M.yo, 0, 0.62, 0.62, this._v3); ma.x = this._v3.x; ma.y = this._v3.y; ma.z = this._v3.z;
      if (q.mano === "rompe") { ma.tam = 1.35 * H * (1 + u); ma.alfa = 1 - u; ma.giro = u * 0.6; }
      else { ma.tam = 1.35 * H * (q.nombre === "mano" ? sale(corta(u / 0.4)) : 1); ma.alfa = 1; ma.giro = q.nombre === "choque" ? Math.sin(tp * 40) * 0.04 : 0; }
    }
    const si = out.silueta;
    si.id = -1; si.armadura = false;
    if ((q.silueta || q.armadura) && famCol) {
      si.id = M.yo.id; si.color = famCol; si.giro = M.yo.giro;
      if (q.armadura) { si.armadura = true; si.escala = 1.06; si.alfa = 0.22 + 0.1 * Math.sin(tp * 6); si.x = M.yo.cx; si.y = M.yo.cy - 0.03 * H; si.z = M.yo.cz; }
      else {
        si.escala = 3; si.alfa = lerp(q.silueta[0], q.silueta[1], corta(u / 0.6));
        this._punto(M.yo, 0, 0, -0.75, this._v3); si.x = this._v3.x; si.y = M.yo.cy - 0.15 * H * (1 - corta(u / 0.6)); si.z = this._v3.z;
      }
    }
    return out;
  },
  // la vuelta al otro (rodea) o pasarle de largo (sale): adelante (f) y a la derecha (r) en
  // la u del plano, en m
  _vuelta(spec, d, H, u, o) {
    const rho = 0.5 * H;
    // se va de largo, sin salirse del plano (al fijar las cifras se le sigue viendo)
    if (spec.sale) { o[0] = d + rho + 0.95 * H * u; o[1] = 0; return o; }
    if (u < 0.3) { o[0] = (d - rho) * suave(u / 0.3); o[1] = 0; return o; }
    const th = Math.PI * suave((u - 0.3) / 0.7);
    o[0] = d - rho * Math.cos(th); o[1] = rho * Math.sin(th) * 1.4;
    return o;
  },
  // un actor en el plano: donde esta (avance, salto, la vuelta al otro, se va, cae), su
  // clip y su tiempo
  _actor(S, spec, u, ue, tp, out, o, otro, esYo) {
    const a = out.actores[out.n++], H = S.H;
    // con el clip de VR que lo hace (si el modelo lo trae), sin lo de a mano
    const vr = !!(spec.vr && this._tiene && this._tiene(S.id, spec.vr));
    let f = 0, r = 0, y = 0, giro = S.giro, tumbado = 0, ladeado = 0;
    if (spec.avance) f += lerp(spec.avance[0], spec.avance[1], ue) * H;
    if (spec.salto && !vr) y += lerp(spec.salto[0], spec.salto[1], sale(u)) * H;
    if ((spec.rodea || spec.sale) && otro) {
      const d = Math.hypot(otro.bx - S.bx, otro.bz - S.bz);
      const A = this._vuelta(spec, d, H, u, this._ra), B = this._vuelta(spec, d, H, Math.min(1, u + 0.02), this._rb);
      f = A[0]; r = A[1];
      // hacia donde corre: la diferencia (adelante y a la derecha) llevada al campo
      const df = B[0] - A[0], dr = B[1] - A[1];
      if (Math.abs(df) + Math.abs(dr) > 1e-6) giro = Math.atan2(S.fx * df - S.fz * dr, S.fz * df + S.fx * dr);
    }
    if (spec.cae && !vr) tumbado = -lerp(spec.cae[0], spec.cae[1], sale(u));
    if (spec.gira) giro += u * Math.PI * 3;
    if (spec.tumbado && !vr) { tumbado = Math.PI / 2; y = 0.05 * H; ladeado = 0.25; }
    if (spec.pierde && o.gana !== undefined && o.gana !== null && S.id !== o.gana && u > spec.pierde[0]) tumbado = -0.55 * sale(corta((u - spec.pierde[0]) / (spec.pierde[1] - spec.pierde[0])));
    if (spec.tirada) {
      // el portero se tira: en el penalti a su zona; en el gol, al otro lado del balon
      const M = this._M, z = esYo ? (M.zona === 1 ? 2 : 2 - M.zona) : M.zonaP, lado = z === 1 ? 0 : z === 0 ? 1 : -1;
      ladeado = -lado * 1.1 * sale(corta(u / 0.5)); r += lado * 0.45 * H * sale(corta(u / 0.5)); y += Math.abs(lado) * 0.15 * H * Math.sin(Math.PI * corta(u / 0.6));
    }
    S.cx = S.bx + S.fx * f - S.fz * r; S.cz = S.bz + S.fz * f + S.fx * r; S.cy = y;
    a.id = S.id; a.x = S.cx; a.y = S.cy; a.z = S.cz; a.giro = giro; a.tumbado = tumbado; a.ladeado = ladeado;
    // el clip: los que se repiten con el tiempo del plano; los de una vez desde que empiezan
    let clip = spec.clip || "parado", desde = 0;
    if (spec.clips) for (const [c, u0] of spec.clips) if (u >= u0) { clip = c; desde = u0; }
    if (vr) { clip = spec.vr; desde = 0; }
    a.clip = clip; a.bucle = clip === "parado" || clip === "correr";
    a.tiempo = a.bucle ? tp : Math.max(0, tp - (u > 0 ? desde / u * tp : 0));
  },
  // un punto en el marco de un actor (r a su derecha, y arriba, f adelante, en H)
  _punto(S, r, y, f, o) {
    const H = S.H;
    o.x = S.cx - S.fz * r * H + S.fx * f * H; o.y = S.cy + y * H; o.z = S.cz + S.fx * r * H + S.fz * f * H;
    return o;
  },
  // la camara en el marco de `en`, de d a d2 (y de h a h2) con la u suave
  _camara(c, ue, out) {
    const M = this._M, C = out.cam;
    let ox, oy = 0, oz, fx, fz, H;
    if (c.en === "otro") { const S = M.otro; ox = S.cx; oz = S.cz; fx = S.fx; fz = S.fz; H = S.H; C.mira = S.id; }
    else if (c.en === "medio" && M.hayOtro) {
      const a = M.yo, b = M.otro; ox = (a.cx + b.cx) / 2; oz = (a.cz + b.cz) / 2;
      fx = b.bx - a.bx; fz = b.bz - a.bz; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; H = (a.H + b.H) / 2; C.mira = -2;
    } else if (c.en === "balon") { const b = out.balon; ox = b.x; oy = b.y; oz = b.z; fx = M.yo.fx; fz = M.yo.fz; H = M.yo.H; C.mira = -3; }
    else if (c.en === "porteria") { ox = M.gx; oz = M.gz; fx = M.gfx; fz = M.gfz; H = M.H; C.mira = -4; }
    else { const S = M.yo; ox = S.cx; oz = S.cz; fx = S.fx; fz = S.fz; H = S.H; C.mira = S.id; }
    const d = c.d, h = c.h, d2 = c.d2 || d, h2 = c.h2 || h;
    const dr = lerp(d[0], d2[0], ue) * H, dy = lerp(d[1], d2[1], ue) * H, df = lerp(d[2], d2[2], ue) * H;
    const hr = lerp(h[0], h2[0], ue) * H, hy = lerp(h[1], h2[1], ue) * H, hf = lerp(h[2], h2[2], ue) * H;
    // a la derecha del marco: (-fz, fx)
    C.x = ox - fz * dr + fx * df; C.y = oy + dy; C.z = oz + fx * dr + fz * df;
    C.hx = ox - fz * hr + fx * hf; C.hy = oy + hy; C.hz = oz + fx * hr + fz * hf;
    C.fov = lerp(c.fov, c.fov2 || c.fov, ue);
  },
  // por donde va el balon en un plano (u: 0..1; tp: s reales): a los pies, en el golpe,
  // en vuelo, contra la cupula, contra la mano, por la red...
  balonEn(beh, u, tp, o) {
    const M = this._M, Y = M.yo, H = Y.H, rb = 0.35 * ESTUDIO.balon;
    const pie = S => this._punto(S, 0.05, 0, 0.3, o);
    switch (beh) {
      case "pie": case "yo": pie(Y); o.y = Y.cy + rb; break;
      case "otro": pie(M.otro); o.y = M.otro.cy + rb; break;
      case "duelo": {
        // a los pies del que lo lleva (el lateral pone al tuyo de "yo")
        const lleva = M.otro.id === M.lleva ? M.otro : Y;
        pie(lleva); o.y = lleva.cy + rb; break;
      }
      case "golpe": {
        pie(Y); o.y = Y.cy + rb + 0.08 * H;
        const k = corta((u - 0.45) / 0.55);
        if (k > 0) { o.x += Y.fx * k * 4 * H; o.z += Y.fz * k * 4 * H; o.y += k * 0.5 * H; }
        break;
      }
      case "vuelo": {
        this._punto(Y, 0, 0, 0.6, o);
        o.x += Y.fx * u * 6.5 * H; o.z += Y.fz * u * 6.5 * H; o.y = lerp(0.82 * H, 0.3 * H, u);
        break;
      }
      case "cupula": {
        const k = corta(u / 0.45);
        this._punto(Y, 0, 0, lerp(3.6, 0.35 + 1.3 * 0.9, sale(k)), o); o.y = 0.42 * H;
        if (k >= 1) { o.x += Math.sin(tp * 50) * 0.03; o.y += Math.cos(tp * 47) * 0.03; }
        break;
      }
      case "mano": {
        const k = corta(u / 0.55);
        this._punto(Y, 0, 0.62, lerp(5, 0.72, sale(k)), o);
        if (k >= 1) o.x += Math.sin(tp * 50) * 0.03;
        break;
      }
      case "cuerpo": { const k = corta(u / 0.6); this._punto(Y, 0, lerp(0.35, 0.5, k), lerp(4, 0.3, k), o); break; }
      case "manos": {
        const k = corta(u / 0.6), gol = M.finalGol;
        this._punto(Y, gol ? lerp(0, 0.7, k) : 0, lerp(0.45, 0.5, k), lerp(5, gol ? -0.6 : 0.28, k), o);
        break;
      }
      case "punto": o.x = Y.bx + Y.fx * 0.3 * H; o.z = Y.bz + Y.fz * 0.3 * H; o.y = rb; break;
      case "penalti": {
        // del punto a su zona de la porteria (las zonas del campo, como las mira el motor)
        const k = corta((u - 0.15) / 0.55), x0 = Y.bx + Y.fx * 0.3 * H, z0 = Y.bz + Y.fz * 0.3 * H;
        const zx = -((M.zona === 0 || M.zona === 2 ? M.zona : 1) - 1) * (typeof REGLAS !== "undefined" ? REGLAS.PENALTI_ZONA_X : 2.5);
        o.x = lerp(x0, M.gx + zx, k); o.z = lerp(z0, M.gz - M.gfz * 0.5, k); o.y = rb + Math.sin(Math.PI * k) * 0.5 + k * 0.6;
        break;
      }
      case "rompe": this._punto(Y, 0.04, lerp(0.6, 0.58, u), lerp(0.95, -0.25, u), o); break;
      case "entra": this._punto(Y, lerp(0.45, 0.3, u), lerp(0.42, 0.38, u), lerp(5, -0.55, u), o); break;
      case "red": {
        const k = corta(u / 0.35);
        o.x = M.gx - M.gfz * M.tiroX; o.z = M.gz + M.gfz * lerp(0.3, -0.8, sale(k)) * M.H; o.y = 0.42 * M.H;
        if (k >= 1) o.z += M.gfz * Math.sin(tp * 30) * 0.03;
        break;
      }
      case "bota": {
        // fuera de la vista hasta 3,93 (cruza el de llamas, del HUD); cae y bota delante del
        // portero caido, a la izquierda de la camara
        const t = this._tGol || 0, bo = M.bota || [0.3, 1.1];
        this._punto(Y, bo[0], 0, bo[1], o);
        if (t < 3.93) o.y = 6 * H;
        else if (t < 4.07) o.y = lerp(0.6 * H, rb, (t - 3.93) / 0.14);
        else o.y = rb + 0.12 * H * Math.abs(Math.sin((t - 4.07) * 5)) * Math.exp(-(t - 4.07) * 1.4);
        break;
      }
      default: pie(Y); o.y = rb;
    }
    return o;
  },
};

// --- el 3D (solo en el navegador) ----------------------------------------------------------
// el fondo de las tecnicas (guia 4 y t04): el degradado radial del elemento con las lineas
// de velocidad que salen de los bordes (cambian 24 veces por segundo, como el manga) o las
// llamas radiales de la armadura (t18); y, encima del estadio, solo las lineas
const VS_PANTALLA = `varying vec2 vP;
void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS_FONDO = `uniform vec3 uClaro; uniform vec3 uOscuro; uniform float uT; uniform float uRayas; uniform float uModo; uniform float uFondo; uniform float uAspecto;
varying vec2 vP;
float azar(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  vec2 p = vec2(vP.x * uAspecto, vP.y);
  float r = length(p);
  float a = atan(p.y, p.x) / 6.2831853 + 0.5;
  vec3 col = mix(uClaro, uOscuro, smoothstep(0.05, 1.5, r));
  if (uModo > 0.5) {
    float l1 = 0.0; float l2 = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      l1 += sin(a * 6.2831853 * (5.0 + fi * 4.0) + uT * (3.0 + fi) + fi * 2.1) / (fi + 1.0);
      l2 += sin(a * 6.2831853 * (9.0 + fi * 5.0) - uT * (4.0 + fi) + fi) / (fi + 1.0);
    }
    float b1 = 0.95 + 0.25 * l1; float b2 = 0.45 + 0.15 * l2;
    vec3 rojo = vec3(0.92, 0.3, 0.03); vec3 nar = vec3(1.0, 0.62, 0.1); vec3 ama = vec3(1.0, 0.95, 0.6);
    col = mix(rojo, uOscuro, smoothstep(b1 + 0.35, b1 + 0.8, r));
    col = mix(mix(nar, uClaro, 0.2), col, smoothstep(b1 - 0.06, b1 + 0.08, r));
    col = mix(ama, col, smoothstep(b2 - 0.05, b2 + 0.12, r));
  }
  float f = floor(uT * 24.0); float N = 64.0; float k = floor(a * N);
  float z1 = azar(k * 7.13 + f * 1.71); float z2 = azar(k * 3.71 + f * 9.13 + 4.0); float z3 = azar(k * 1.37 + f * 2.9 + 8.0);
  float d = abs(fract(a * N) - (0.2 + 0.6 * z2));
  float ancho = (0.05 + 0.2 * z1) * smoothstep(0.3, 1.7, r);
  float r0 = 0.55 + 0.55 * z3;
  float linea = (1.0 - smoothstep(ancho * 0.55, ancho, d)) * smoothstep(r0, r0 + 0.3, r) * step(0.3, z1) * uRayas;
  gl_FragColor = vec4(mix(col, vec3(1.0), linea * 0.9), max(uFondo, linea * 0.9));
}`;
// las particulas: 512 puntos con su semilla fija; el shader los mueve con el tiempo y el
// tipo (0 fuego, 1 viento / espiral, 2 bosque, 3 montana) desde el centro de su efecto
const VS_PARTICULAS = `attribute vec4 semilla;
uniform float uT; uniform float uTipo; uniform float uRadio; uniform float uAlto; uniform float uTam; uniform float uDensidad; uniform vec3 uCentro;
varying float vVida;
void main() {
  if (fract(semilla.x * 7.31 + semilla.y * 3.17) > uDensidad) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vVida = 1.0; return; }
  float vida = fract(uT * (0.5 + 0.7 * semilla.w) + semilla.x);
  float ang = semilla.y * 6.2831853;
  vec3 q;
  if (uTipo < 0.5) {
    float r = uRadio * (0.25 + 0.75 * semilla.z) * (1.0 - 0.75 * vida);
    q = vec3(cos(ang + vida * 1.5) * r, vida * uAlto * (0.6 + 0.5 * semilla.w), sin(ang + vida * 1.5) * r);
  } else if (uTipo < 1.5) {
    float a = ang + vida * 9.0;
    float r = uRadio * (0.6 + 0.4 * semilla.z) * (1.0 - 0.35 * vida);
    q = vec3(cos(a) * r, vida * uAlto, sin(a) * r);
  } else if (uTipo < 2.5) {
    float a = ang + uT * (1.0 + semilla.z * 1.5);
    float r = uRadio * (0.45 + 0.8 * semilla.z);
    q = vec3(cos(a) * r, uAlto * (0.15 + 0.85 * fract(1.0 - vida + semilla.w)), sin(a) * r);
  } else {
    float r = uRadio * (0.3 + 1.4 * vida * semilla.z);
    q = vec3(cos(ang) * r, uAlto * 1.8 * vida * (1.0 - vida) * (0.3 + semilla.w), sin(ang) * r);
  }
  vVida = vida;
  vec4 mv = modelViewMatrix * vec4(uCentro + q, 1.0);
  gl_Position = projectionMatrix * mv;
  float tam = uTipo < 0.5 ? 1.4 - vida : uTipo < 1.5 ? 0.9 : uTipo < 2.5 ? 0.8 : 0.45 + semilla.w * 0.7;
  gl_PointSize = uTam * tam / max(0.2, -mv.z);
}`;
const FS_PARTICULAS = `uniform sampler2D uAtlas; uniform vec3 uColor; uniform float uTipo; uniform float uAlfa;
varying float vVida;
void main() {
  float cx = mod(uTipo, 2.0); float cy = floor(uTipo / 2.0);
  vec4 s = texture2D(uAtlas, vec2((cx + gl_PointCoord.x) * 0.5, 1.0 - (cy + gl_PointCoord.y) * 0.5));
  vec3 c = uColor;
  if (uTipo < 0.5) c = mix(vec3(1.0, 0.82, 0.3), uColor, smoothstep(0.0, 0.45, vVida));
  else if (uTipo < 1.5) c = mix(vec3(1.0), uColor, 0.6);
  else if (uTipo < 2.5) c = mix(uColor, vec3(0.25, 0.75, 0.2), 0.45) * (0.8 + 0.4 * s.r);
  else c = mix(vec3(0.5, 0.36, 0.22), uColor, 0.25) * (0.7 + 0.5 * s.r);
  float al = s.a * uAlfa * (uTipo < 0.5 ? 0.55 * (1.0 - vVida) : uTipo < 1.5 ? (1.0 - vVida) : smoothstep(1.0, 0.75, vVida));
  gl_FragColor = vec4(c, al);
}`;
// la cupula del bloqueo: translucida, mas brillante en el borde, con bandas que suben
const VS_CUPULA = `varying vec3 vN; varying vec3 vV; varying float vY;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`;
const FS_CUPULA = `uniform vec3 uColor; uniform float uT; uniform float uAlfa;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 n = normalize(vN);
  float remolino = 0.5 + 0.5 * sin(atan(n.z, n.x) * 9.0 + vY * 14.0 - uT * 8.0);
  float bandas = 0.5 + 0.5 * sin(vY * 22.0 - uT * 7.0);
  float al = (0.35 + 0.6 * fr + 0.18 * remolino) * uAlfa;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 + 0.45 * remolino * (1.0 - fr)) * (0.75 + 0.5 * fr) + vec3(fr * fr * 0.5) + vec3(0.08 * bandas), al);
}`;
// las cintas de la espiral (t17): cada punto sabe por donde va de su cinta (s, 0..1) y de
// que borde es (l, -1..1); el brillo corre cinta arriba con el tiempo
const VS_ESPIRAL = `attribute vec2 cinta; varying vec2 vC;
void main() { vC = cinta; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS_ESPIRAL = `uniform vec3 uColor; uniform float uT; uniform float uAlfa;
varying vec2 vC;
void main() {
  float s = vC.x, e = abs(vC.y);
  float f = fract(s * 1.4 - uT * 1.1);
  float largo = (0.3 + 0.7 * pow(f, 1.6)) * smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.82, 1.0, s));
  float ancho = 1.0 - smoothstep(0.55, 1.0, e);
  vec3 c = mix(uColor * 0.6, uColor, smoothstep(0.95, 0.4, e));
  c = mix(c, vec3(1.0), 0.55 * (1.0 - smoothstep(0.0, 0.4, e)) + 0.35 * pow(f, 6.0));
  gl_FragColor = vec4(c, min(1.0, largo * ancho * uAlfa * 1.1));
}`;

// cuantas particulas de las 512 y de que tamano (m a 1 m) por tipo: fuego, viento, bosque,
// montana (con todas, el fuego aditivo salia blanco y las hojas y las rocas lo tapaban todo)
const DENSIDAD = [0.45, 0.6, 0.3, 0.22], TAM_PARTICULA = [0.22, 0.24, 0.18, 0.2];
function lienzo(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function textura(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
// el atlas de 2x2 de las particulas (diseno 6.6), dibujado una vez: la llama, la raya del
// viento, la hoja y la roca (en gris: el color lo pone el shader)
function atlasParticulas() {
  const c = lienzo(128, 128), k = c.getContext("2d");
  // la llama: una gota blanda
  let g = k.createRadialGradient(32, 38, 2, 32, 34, 28);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  k.fillStyle = g; k.beginPath(); k.moveTo(32, 2); k.quadraticCurveTo(58, 34, 32, 62); k.quadraticCurveTo(6, 34, 32, 2); k.fill();
  // la raya del viento: una elipse larga y blanda (el degradado, ya en su sitio)
  k.save(); k.translate(96, 32); k.rotate(-0.6); k.scale(1, 0.28);
  g = k.createRadialGradient(0, 0, 1, 0, 0, 30);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
  k.fillStyle = g; k.beginPath(); k.arc(0, 0, 30, 0, Math.PI * 2); k.fill(); k.restore();
  // la hoja, con su nervio
  k.fillStyle = "#ffffff"; k.save(); k.translate(32, 96); k.rotate(0.5);
  k.beginPath(); k.moveTo(0, -26); k.quadraticCurveTo(20, -4, 0, 26); k.quadraticCurveTo(-20, -4, 0, -26); k.fill();
  k.strokeStyle = "rgba(120,120,120,.8)"; k.lineWidth = 2; k.beginPath(); k.moveTo(0, -22); k.lineTo(0, 22); k.stroke(); k.restore();
  // la roca: un poligono con su cara clara
  k.fillStyle = "#9a9a9a"; k.beginPath();
  [[96, 70], [118, 84], [122, 106], [104, 122], [80, 116], [72, 92]].forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.closePath(); k.fill();
  k.fillStyle = "#e0e0e0"; k.beginPath(); k.moveTo(96, 72); k.lineTo(116, 86); k.lineTo(98, 96); k.lineTo(78, 92); k.closePath(); k.fill();
  return textura(c);
}
// la mano gigante de la parada (diseno 6.6): blanca con su brillo; el color de su elemento
// lo pone el material
function texturaMano() {
  const c = lienzo(256, 256), k = c.getContext("2d");
  const dedo = (x, y, l, a, w) => { k.save(); k.translate(x, y); k.rotate(a); k.beginPath(); k.roundRect(-w / 2, -l, w, l + 14, w / 2); k.restore(); };
  const forma = () => {
    k.beginPath(); k.moveTo(-56, 0); k.quadraticCurveTo(-60, 66, 0, 86); k.quadraticCurveTo(60, 66, 56, 0); k.closePath(); k.fill();
    for (const [x, l, a] of [[-42, 74, -0.2], [-14, 94, -0.06], [14, 92, 0.06], [41, 72, 0.19]]) { dedo(x, 4, l, a, 26); k.fill(); }
    dedo(-52, 44, 58, -1.05, 28); k.fill();
  };
  k.translate(128, 132);
  k.shadowColor = "rgba(255,255,255,.95)"; k.shadowBlur = 22;
  k.fillStyle = "rgba(255,255,255,.55)"; forma();
  k.shadowBlur = 0;
  const g = k.createRadialGradient(0, 30, 10, 0, 10, 120);
  g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(255,255,255,.55)");
  k.fillStyle = g; forma();
  k.strokeStyle = "rgba(255,255,255,1)"; k.lineWidth = 3;
  for (const [x, y] of [[-30, 40], [30, 40]]) { k.beginPath(); k.arc(x, y, 18, Math.PI * 1.1, Math.PI * 1.9); k.stroke(); }
  return textura(c);
}
// un color de three desde un "#RRGGBB" de la paleta, solo si cambia (sin crear nada)
function ponColor(c, s) { if (c._s !== s) { c.set(s); c._s = s; } return c; }

// el Estudio: lo fijo del Campo en mallas nuevas (mismas geometrias y materiales), sus
// luces, el fondo y lo de encima en sus escenitas de pantalla, y los efectos, una vez
function construirEstudio(m) {
  const c = m.c, E = { escena: new THREE.Scene(), estadio: new THREE.Group(), actores: new THREE.Group() };
  E.escena.background = null;
  for (const o of c.fijas || []) {
    const n = new THREE.Mesh(o.geometry, o.material);
    n.position.copy(o.position); n.rotation.copy(o.rotation); n.scale.copy(o.scale); n.renderOrder = o.renderOrder;
    E.estadio.add(n);
  }
  // solo arriba: la pista detras de cada porteria (en Galaxy la red de atras da a la pista,
  // t12 +2400; abajo hay 4 m de cesped que no se ven), una malla para las dos
  {
    const L = REGLAS.LARGO, w = REGLAS.PORTERIA + 10, g = [];
    for (const s of [-1, 1]) g.push(new THREE.PlaneGeometry(w, 3.85).rotateX(-Math.PI / 2).translate(0, 0.004, s * (L / 2 + 0.15 + 3.85 / 2)));
    const pista = new THREE.BufferGeometry();
    const pos = new Float32Array(g[0].attributes.position.count * 6);
    pos.set(g[0].attributes.position.array, 0); pos.set(g[1].attributes.position.array, g[0].attributes.position.count * 3);
    pista.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const n0 = g[0].attributes.position.count, i0 = Array.from(g[0].index.array);
    pista.setIndex(i0.concat(i0.map(i => i + n0)));
    for (const x of g) x.dispose();
    E.estadio.add(new THREE.Mesh(pista, new THREE.MeshBasicMaterial({ color: new THREE.Color(typeof GX !== "undefined" ? GX.pista : "#BA562E") })));
  }
  E.escena.add(E.estadio);
  for (const l of c.luces || []) { const n = l.clone(); E.escena.add(n); if (n.target) { n.target.position.copy(l.target.position); E.escena.add(n.target); } }
  E.escena.add(E.actores);
  // el fondo y lo de encima: un rectangulo de pantalla entera con el shader
  E.orto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);
  const uniFondo = () => ({ uClaro: { value: new THREE.Color() }, uOscuro: { value: new THREE.Color() }, uT: { value: 0 }, uRayas: { value: 1 }, uModo: { value: 0 }, uFondo: { value: 1 }, uAspecto: { value: ESTUDIO.aspecto } });
  const matFondo = s => new THREE.ShaderMaterial({ uniforms: uniFondo(), vertexShader: VS_PANTALLA, fragmentShader: FS_FONDO, transparent: true, depthTest: false, depthWrite: false });
  E.fondo = new THREE.Mesh(quad, matFondo()); E.fondo.frustumCulled = false;
  E.fondoEsc = new THREE.Scene(); E.fondoEsc.add(E.fondo);
  E.rayas = new THREE.Mesh(quad, matFondo()); E.rayas.frustumCulled = false; E.rayas.material.uniforms.uFondo.value = 0;
  E.blanco = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }));
  E.blanco.frustumCulled = false; E.blanco.renderOrder = 2;
  E.encimaEsc = new THREE.Scene(); E.encimaEsc.add(E.rayas, E.blanco);
  // las particulas: 512 puntos con su semilla (atributo fijo); dos sistemas que comparten
  // la geometria: el del efecto y las llamas del balon
  const N = ESTUDIO.particulas, sem = new Float32Array(N * 4), pos = new Float32Array(N * 3);
  let z = 7;
  const az = () => (z = (z * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * 4; i++) sem[i] = az();
  const gp = new THREE.BufferGeometry();
  gp.setAttribute("position", new THREE.BufferAttribute(pos, 3)); gp.setAttribute("semilla", new THREE.BufferAttribute(sem, 4));
  const atlas = atlasParticulas();
  const matP = () => new THREE.ShaderMaterial({ vertexShader: VS_PARTICULAS, fragmentShader: FS_PARTICULAS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAtlas: { value: atlas }, uColor: { value: new THREE.Color() }, uT: { value: 0 }, uTipo: { value: 0 }, uRadio: { value: 1 }, uAlto: { value: 2 }, uTam: { value: 100 }, uAlfa: { value: 1 }, uDensidad: { value: 1 }, uCentro: { value: new THREE.Vector3() } } });
  E.part = new THREE.Points(gp, matP()); E.partBalon = new THREE.Points(gp, matP());
  for (const q of [E.part, E.partBalon]) { q.frustumCulled = false; q.renderOrder = 3; E.escena.add(q); }
  E.partBalon.material.uniforms.uTipo.value = 0; E.partBalon.material.uniforms.uDensidad.value = 0.22;
  ponColor(E.partBalon.material.uniforms.uColor.value, "#FF5A10");
  // el balon (la malla y el material del Campo) y su estela: una cinta de 24 puntos que se
  // reescribe cada cuadro
  E.balon = new THREE.Mesh(c.balon.geometry, c.balon.material); E.balon.scale.setScalar(ESTUDIO.balon); E.escena.add(E.balon);
  const ne = ESTUDIO.estela, ge = new THREE.BufferGeometry(), idx = [];
  ge.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ne * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  ge.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ne * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < ne - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  ge.setIndex(idx);
  E.estela = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  E.estela.frustumCulled = false; E.estela.renderOrder = 2; E.escena.add(E.estela);
  E.estelaP = new Float32Array(ne * 3);
  // el aura del elemento detras del jugador (la textura del aura del Campo)
  E.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: c.texAura, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  E.aura.renderOrder = 1; E.escena.add(E.aura);
  // la cupula del bloqueo (media esfera) y la mano gigante de la parada
  E.cupula = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.ShaderMaterial({ vertexShader: VS_CUPULA, fragmentShader: FS_CUPULA, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uAlfa: { value: 1 } } }));
  E.cupula.renderOrder = 2; E.escena.add(E.cupula);
  E.mano = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texturaMano(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  E.mano.rotation.order = "YXZ"; E.mano.renderOrder = 2; E.escena.add(E.mano);
  // la espiral de la carga del espiritu: 3 cintas que suben dando vuelta y media, cada vez
  // mas abiertas (radio 1 y alto 1: se escala al jugador), hechas una vez
  {
    const N = 72, vueltas = 1.35, ancho = 0.07, pos = [], cin = [], idx = [];
    for (let c = 0; c < 3; c++) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const s = i / N, a = c * Math.PI * 2 / 3 + s * vueltas * Math.PI * 2, r = 0.75 + 0.45 * s, y = s * (1 - ancho) + ancho / 2;
        for (const l of [-1, 1]) { pos.push(Math.cos(a) * r, y + l * ancho / 2 + l * 0.04 * Math.sin(a * 2), Math.sin(a) * r); cin.push(s, l); }
        if (i < N) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("cinta", new THREE.Float32BufferAttribute(cin, 2)); g.setIndex(idx);
    E.espiral = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VS_ESPIRAL, fragmentShader: FS_ESPIRAL, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uAlfa: { value: 1 } } }));
    E.espiral.renderOrder = 2; E.espiral.frustumCulled = false; E.espiral.visible = false; E.escena.add(E.espiral);
  }
  // la silueta del espiritu (un material para todas: solo se ve una a la vez)
  E.matSilueta = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, transparent: true, opacity: 0.5 });
  return E;
}

Object.assign(Escenas, {
  _mundo: null, _porId: [], _actores: new Map(), _gltf: new Map(), _pedidos: new Set(), _calentado: false, _desde: 0,
  _e: { x: 0, y: 0, z: 0 },
  // las animaciones de VR cargadas (O-323): clave -> {estado "cargando" | "listo" | "mal",
  // ev (EventoVR), usado, hasta}; la que se ve ahora (su raiz, en la escena del Estudio)
  _vrEv: new Map(), _vrActivo: null, _vrCargando: 0,
  _ahora: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),

  // con un Mundo vivo y el Estudio hecho: el Director compone y HudDuelo no pinta su fondo
  listo() { return !!(this._E && this._mundo && !this._mundo.cerrado && this._mundo.alPintarArriba); },

  // al crear cada Mundo (partido-3d.js): el Estudio una vez por pagina; los actores de los
  // que no juegan este partido se sueltan (como mucho los 22 de ahora)
  preparar(m) {
    if (!this._E) this._E = construirEstudio(m);
    this._mundo = m; m.escenaEstudio = this._E.escena;
    // (con el modelo de su forma, si la tiene puesta: O-327)
    const caras = new Set(m.p.jugadores.map(j => modeloDe(j)).filter(Boolean));
    for (const [cara, a] of this._actores) if (!caras.has(cara)) this._soltar(a);
    // las fichas de los que aun no tenian modelo (su textura es de abajo, que ya la solto)
    for (const a of this._porId) if (a && a.sprite) { this._E.actores.remove(a.grupo); a.sprite.material.dispose(); }
    this._porId = []; this._calentado = false; this._desde = performance.now();
    this._tiene = (id, clave) => { const a = this._porId[id]; return !!(a && a.acciones && a.acciones[clave]); };
    m.alPintarArriba = (mm, A) => this.pintar(mm, A);
    // la pantalla de arriba deja ver el WebGL de detras (lo 2D de arriba la tapa entera)
    const ar = typeof document !== "undefined" && document.querySelector("#arriba");
    if (ar) ar.classList.add("con-3d");
    // las animaciones de VR de este partido: las de antes se sueltan y se piden las de los 22
    // (detras de sus modelos en la cola del servidor) (O-323)
    this._vrSoltarTodo();
    this.vr = { tecnicas: {}, espiritus: {}, hechos: new Set(), pend: 0, t: 0, visto: 0, caras: new Set(), pidiendo: false };
    this._vrPedirPartido(m);
  },

  // --- las animaciones de VR (O-323): pedirlas, cargarlas y pintarlas --------------------
  // al servidor: los 22 (como son, con sus tecnicas y su espiritu), luego las formas de los
  // modos (sus tecnicas, con su cuerpo) y el banquillo, en otra peticion (como mucho 40)
  _vrPedirPartido(m) {
    const p = m.p, de = (cara, tecnicas, esp) => ({ cara: cara || "", tecnicas: (tecnicas || []).map(t => t.interno || t.id).filter(Boolean).slice(0, 16), espiritu: esp || "" });
    const espDe = d => { const t = (d.tecnicas || []).find(x => x.espiritu), e = d.espiritu || (t && t.espiritu); return e && e.id ? String(e.id) : ""; };
    const uno = [], dos = [];
    for (const j of p.jugadores) { const pr = j.propio || j; uno.push(de(pr.cara, pr.tecnicas, j.espiritu && j.espiritu.id)); this.vr.caras.add(pr.cara); }
    for (const j of p.jugadores) if (j.formaHiper && j.formaHiper.tecnicas) dos.push(de(j.formaHiper.modelo || j.formaHiper.cara, j.formaHiper.tecnicas, ""));
    for (const b of p.banquillos || []) for (const d of b || []) if (d && d.cara) { dos.push(de(d.cara, d.tecnicas, espDe(d))); this.vr.caras.add(d.cara); }
    this._vrPedir(m, uno.slice(0, 40)).then(() => { if (dos.length && this._mundo === m) this._vrPedir(m, dos.slice(0, 40)); });
  },
  _vrPedir(m, jugadores) {
    if (typeof fetch === "undefined" || !jugadores.length) return Promise.resolve();
    return fetch("/api/partido/eventos/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jugadores }) })
      .then(r => r.json()).then(e => {
        const V = this.vr;
        if (!V || this._mundo !== m) return;
        Object.assign(V.tecnicas, e.tecnicas || {}); Object.assign(V.espiritus, e.espiritus || {});
        this._vrEstado(e);
      }).catch(() => {});
  },
  // como va la cola del servidor: los eventos que ya estan
  _vrEstado(e) {
    const V = this.vr, ev = e && e.eventos;
    if (!V || !ev) return;
    for (const x of ev.hechos || []) V.hechos.add(x);
    V.pend = (ev.pendientes || []).length + (ev.actual ? 1 : 0);
  },
  // cada cuadro: los que entran de un cambio, como va la cola (cada VR_EV.consulta ms
  // mientras queden) y lo que va a hacer falta (las tecnicas del plan, la invocacion)
  _vrMirar(m, A) {
    const V = this.vr;
    if (!V) return;
    const ahora = this._ahora();
    if (ahora - V.visto > 1000) {
      V.visto = ahora;
      const nuevos = m.p.jugadores.filter(j => !V.caras.has((j.propio || j).cara));
      for (const j of nuevos) V.caras.add((j.propio || j).cara);
      if (nuevos.length) this._vrPedir(m, nuevos.map(j => ({ cara: j.cara, tecnicas: (j.tecnicas || []).map(t => t.interno || t.id).filter(Boolean), espiritu: j.espiritu ? j.espiritu.id : "" })));
    }
    if (V.pend > 0 && !V.pidiendo && ahora - V.t > VR_EV.consulta && typeof fetch !== "undefined") {
      V.pidiendo = true; V.t = ahora;
      fetch("/api/partido/modelos/estado").then(r => r.json()).then(e => this._vrEstado(e)).catch(() => {}).finally(() => { V.pidiendo = false; });
    }
    const R = A && A.plan;
    if (R && R.r && R.plan) for (const info of this._vrInfosPlan(m.p, R)) if (info) this._vrCargar(info);
    const tr = A && A.tramo;
    if (tr && tr.que === "invoca") { const j = m.p.jugadores[tr.jugador], info = j && this._vrInfoInvoca(m.p, tr, j); if (info) this._vrCargar(info); }
  },
  // carga una (si este PC la tiene y aun no esta): sus modelos de la cache de abajo, y la sube
  // a la grafica antes de verse
  _vrCargar(info) {
    const m = this._mundo;
    if (!m || !this._E || !this._vrPuede(info)) return;
    let e = this._vrEv.get(info.clave);
    if (e) { if (e.estado !== "mal") return; this._vrEv.delete(info.clave); }
    e = { clave: info.clave, estado: "cargando", ev: null, usado: this._ahora(), hasta: 0 };
    this._vrEv.set(info.clave, e);
    this._vrCargando++;
    const t0 = this._ahora();
    EventoVR.cargar(info.evento, { modelo: c => m.modelo(c), actores: info.actores, asignado: info.asignado })
      .then(ev => {
        if (this._vrEv.get(info.clave) !== e || m.cerrado || this._mundo !== m) { ev.soltar(); return; }
        ev.camara.aspect = ESTUDIO.aspecto; ev.camara.updateProjectionMatrix();
        ev.preparar(m.render, this._E.escena);
        e.ev = ev; e.estado = "listo"; e.usado = this._ahora();
        // lo que tardan en cargarse (las ultimas 20, en ms)
        (this._vrTiempos || (this._vrTiempos = [])).push(Math.round(this._ahora() - t0));
        if (this._vrTiempos.length > 20) this._vrTiempos.shift();
        // (la subida a la grafica no cuenta para la calidad automatica, O-321)
        if (typeof Consola !== "undefined" && Consola.esperarCalidad) Consola.esperarCalidad(1500);
        this._vrRecortar();
      })
      .catch(err => { e.estado = "mal"; e.hasta = this._ahora() + 30000; console.warn("animación de VR " + info.evento + ":", err && err.message); })
      .finally(() => { this._vrCargando--; });
  },
  // como mucho VR_EV.guardar cargadas: fuera las que hace mas que no se ven (ni la de ahora
  // ni las del plan de ahora)
  _vrRecortar() {
    const vivos = [...this._vrEv.values()].filter(e => e.ev);
    let n = vivos.length;
    if (n <= VR_EV.guardar) return;
    const quiero = new Set((this._vrPC ? this._vrPC.infos : []).filter(Boolean).map(i => i.clave));
    vivos.sort((a, b) => a.usado - b.usado);
    for (const e of vivos) {
      if (n <= VR_EV.guardar) break;
      if (e === this._vrActivo || quiero.has(e.clave)) continue;
      e.ev.soltar(); this._vrEv.delete(e.clave); n--;
    }
  },
  _vrSoltarTodo() {
    for (const e of this._vrEv.values()) if (e.ev) e.ev.soltar();
    this._vrEv.clear(); this._vrActivo = null; this._vrPC = null; this._vrDec = null; this._vrIC = null;
  },
  // el cuadro de VR: su raiz en la escena del Estudio, en su sitio del campo, y lo de las
  // plantillas escondido
  _aplicarVR(m, v) {
    const E = this._E, e = this._vrEv.get(v.vr.clave), ev = e.ev;
    if (this._vrActivo !== e) {
      if (this._vrActivo && this._vrActivo.ev) this._vrActivo.ev.raiz.removeFromParent();
      this._vrActivo = e; E.escena.add(ev.raiz);
    }
    // el que la hace (s00 al empezar) en su sitio, mirando adonde toca
    const an = ev.ancla() || { x: 0, z: 0, giro: 0 }, a = v.vr.giro - an.giro, c = Math.cos(a), s = Math.sin(a);
    ev.raiz.rotation.set(0, a, 0);
    ev.raiz.position.set(v.vr.x - (c * an.x + s * an.z), 0, v.vr.z - (-s * an.x + c * an.z));
    ev.poner(v.vr.t);
    E.actores.visible = false;
    for (const o of [E.balon, E.estela, E.part, E.partBalon, E.aura, E.cupula, E.mano, E.espiral]) o.visible = false;
  },
  _renderVR(m) {
    const E = this._E, R = m.render, ac = R.autoClear, ev = this._vrActivo.ev;
    R.autoClear = false;
    R.setClearColor(0x000000, 1); R.clear(true, true, false);
    E.estadio.visible = true;
    R.render(E.escena, ev.camara);
    R.autoClear = ac;
  },
  // fuera la de VR de la escena (vuelve una plantilla)
  _vrQuitar() {
    if (this._vrActivo && this._vrActivo.ev) this._vrActivo.ev.raiz.removeFromParent();
    this._vrActivo = null;
    if (this._E) this._E.actores.visible = true;
  },
  _soltar(a) {
    this._actores.delete(a.cara);
    for (const o of [a.grupo, a.sil]) if (o) { o.parent && o.parent.remove(o); o.traverse(n => { if (n.isSkinnedMesh && n.skeleton) n.skeleton.dispose(); }); }
    if (a.mezcla) a.mezcla.stopAllAction();
    if (a.mezclaSil) a.mezclaSil.stopAllAction();
    if (a.sprite) a.sprite.material.dispose();
  },

  // los actores de este partido: el clon del modelo de cada uno cuando abajo ya lo tiene
  // (el gltf esta en la cache: no se baja nada) y, mientras, una ficha con su cara (la
  // misma textura de abajo). Cada cuadro, pero solo mira (22 comparaciones)
  _mirarActores(m) {
    const js = m.p.jugadores, E = this._E;
    let faltan = 0;
    for (let k = 0; k < js.length; k++) {
      // cod: el modelo que se ve (el de su forma con la hiper puesta, O-327)
      const j = js[k], fig = m.figuras[k], u = fig && fig.userData, cod = modeloDe(j);
      let a = this._porId[k];
      if (a && (a.cara !== cod || (a.sprite && u && !u.ficha))) {
        // un cambio (O-297) o el modelo que llega: fuera la ficha (su textura la suelta abajo)
        if (a.sprite) { E.actores.remove(a.grupo); a.sprite.material.dispose(); }
        a = this._porId[k] = null;
      }
      if (a && a.sprite) faltan++;
      if (a || !cod || !u) continue;
      // (con el cuerpo de abajo ya de ese modelo: el gltf esta en la cache)
      if (u.cuerpo && (u.codCuerpo === undefined || u.codCuerpo === cod)) {
        const g = this._gltf.get(cod);
        if (g) { this._porId[k] = this._crearActor(j, g); if (this._calentado) this._recalentar = true; continue; }
        if (!this._pedidos.has(cod)) { const cara = cod; this._pedidos.add(cara); m.modelo(cara).then(x => { this._pedidos.delete(cara); if (x) this._gltf.set(cara, x); }); }
        faltan++;
      } else if (u.ficha && u.ficha.material.map) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: u.ficha.material.map }));
        s.scale.set(1.6, 1.6, 1); s.position.y = 1.5;
        const grupo = new THREE.Group(); grupo.add(s); grupo.visible = false; E.actores.add(grupo);
        this._porId[k] = { cara: cod, grupo, sprite: s, alto: ESTUDIO.alto, acciones: null };
        faltan++;
      } else faltan++;
    }
    // con todos (o a los 20 s), una pasada para subir a la grafica todo lo del Estudio: la
    // memoria no crece despues en las animaciones (diseno 7.5)
    if ((!this._calentado && (!faltan || performance.now() - this._desde > 20000)) || this._recalentar) { this._recalentar = false; this._calentar(m); }
  },
  // el actor de un jugador (y la silueta de su espiritu, si tiene), una vez por cara
  _crearActor(j, gltf) {
    const cod = modeloDe(j);
    let a = this._actores.get(cod);
    if (a) return a;
    const E = this._E;
    const cuerpo = clonarModelo(gltf.scene);
    cuerpo.scale.setScalar(ESTUDIO.escala);
    const grupo = new THREE.Group(); grupo.rotation.order = "YXZ"; grupo.add(cuerpo); grupo.visible = false; E.actores.add(grupo);
    const mezcla = new THREE.AnimationMixer(cuerpo), acciones = {};
    for (const [clave, nombre] of Object.entries(Object.assign({}, ANIM, ANIM_VR))) {
      const clip = gltf.animations.find(x => x.name === nombre);
      if (clip) acciones[clave] = mezcla.clipAction(clip);
    }
    // el alto del modelo (una vez por gltf): por su cabeza (el hueso c_head en reposo); sin
    // el, lo de arriba de su caja
    if (gltf._alto === undefined) {
      gltf._alto = 0;
      try {
        gltf.scene.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        gltf.scene.traverse(o => { if (o.isBone && o.name === "c_head_1_0") gltf._alto = o.getWorldPosition(v).y / ESTUDIO.cabeza; });
        if (!(gltf._alto > 0.5 && gltf._alto < 4)) { const b = new THREE.Box3().setFromObject(gltf.scene); gltf._alto = b.max.y > 0.5 && b.max.y < 4 ? b.max.y * 0.88 : 0; }
      } catch (e) { gltf._alto = 0; }
    }
    a = { cara: cod, grupo, cuerpo, mezcla, acciones, ahora: null, alto: gltf._alto ? gltf._alto * ESTUDIO.escala : ESTUDIO.alto, sil: null, mezclaSil: null, accionesSil: null, ahoraSil: null };
    if (j.espiritu) {
      // a la escala del actor: la silueta.escala (x3, la armadura x1,06) es sobre el actor
      const sil = clonarModelo(gltf.scene);
      sil.scale.setScalar(ESTUDIO.escala);
      sil.traverse(n => { if (n.isMesh) { n.material = E.matSilueta; n.renderOrder = 1; } });
      const gs = new THREE.Group(); gs.rotation.order = "YXZ"; gs.add(sil); gs.visible = false; E.actores.add(gs);
      a.sil = gs; a.mezclaSil = new THREE.AnimationMixer(sil); a.accionesSil = {};
      for (const [clave, nombre] of Object.entries(ANIM)) { const clip = gltf.animations.find(x => x.name === nombre); if (clip) a.accionesSil[clave] = a.mezclaSil.clipAction(clip); }
    }
    this._actores.set(cod, a);
    return a;
  },
  // la pose de un clip a un tiempo dado (el mismo cuadro a la misma t: las capturas con el
  // reloj parado salen iguales)
  _pose(a, mezcla, acciones, cual, clave, tiempo, bucle) {
    if (!mezcla || !acciones) return;
    const ac = acciones[clave] || acciones.parado;
    if (!ac) return;
    if (a[cual] !== ac) { if (a[cual]) a[cual].stop(); ac.reset(); ac.setLoop(THREE.LoopRepeat, Infinity); ac.play(); a[cual] = ac; }
    const d = ac.getClip().duration || 1;
    ac.time = bucle ? tiempo % d : Math.min(tiempo, d - 0.001);
    mezcla.update(0);
  },
  // todo visible un momento en un rectangulo de 1x1 (lo tapa el HUD de arriba): los shaders
  // compilados y las texturas de los huesos hechas
  _calentar(m) {
    this._calentado = true;
    const E = this._E, R = m.render, me = m.medidas;
    if (!me) return;
    const ocultos = [], sinRecorte = [];
    E.escena.traverse(o => {
      if (!o.visible) { o.visible = true; ocultos.push(o); }
      if ((o.isMesh || o.isPoints || o.isSprite) && o.frustumCulled) { o.frustumCulled = false; sinRecorte.push(o); }
    });
    const cam = m.camArriba, r = me.arriba, y = me.alto - r.y - r.h;
    cam.position.set(0, 30, -70); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const ac = R.autoClear;
    try {
      R.setViewport(r.x, y, 1, 1); R.setScissor(r.x, y, 1, 1);
      R.compile(E.escena, cam);
      R.render(E.fondoEsc, E.orto); R.render(E.escena, cam); R.render(E.encimaEsc, E.orto);
    } catch (e) { console.warn(e); }
    R.autoClear = ac;
    for (const o of ocultos) o.visible = false;
    for (const o of sinRecorte) o.frustumCulled = true;
    R.setViewport(r.x, y, r.w, r.h); R.setScissor(r.x, y, r.w, r.h);
  },

  // --- cada cuadro (Mundo.alPintarArriba, con la vista y la tijera de arriba puestas) ------
  // Devuelve los ms de su JS (sin el render): el Mundo los separa del render (O-321)
  pintar(m, A) {
    const t0 = performance.now();
    if (!this._E || m.cerrado) return 0;
    this._mirarActores(m);
    this._vrMirar(m, A);
    const v = A && A.escena;
    if (!v || !v.hay) return performance.now() - t0;
    // la animacion de VR (O-323)
    if (v.vr) {
      const e = this._vrEv.get(v.vr.clave);
      if (!e || !e.ev) return performance.now() - t0;
      this._aplicarVR(m, v);
      this.ms = performance.now() - t0;
      this._renderVR(m);
      return this.ms;
    }
    if (this._vrActivo) this._vrQuitar();
    this._aplicar(m, v);
    this.ms = performance.now() - t0;
    this._render(m, v);
    return this.ms;
  },

  _aplicar(m, v) {
    const E = this._E, cam = m.camArriba, M = this._M;
    // los actores
    for (const a of this._porId) if (a) { a.grupo.visible = false; if (a.sil) a.sil.visible = false; }
    for (let i = 0; i < v.n; i++) {
      const s = v.actores[i], a = this._porId[s.id];
      if (!a) continue;
      a.grupo.visible = true;
      a.grupo.position.set(s.x, s.y, s.z); a.grupo.rotation.set(s.tumbado, s.giro, s.ladeado);
      if (a.sprite) a.sprite.scale.set(1.6 * (a.alto / ESTUDIO.alto), 1.6, 1);
      this._pose(a, a.mezcla, a.acciones, "ahora", s.clip, s.tiempo, s.bucle);
    }
    // la silueta del espiritu: la pose del jugador, x3 detras (o pegada: la armadura)
    const si = v.silueta, as = si.id >= 0 ? this._porId[si.id] : null;
    if (as && as.sil) {
      const s0 = v.actores[0];
      as.sil.visible = si.alfa > 0.01;
      as.sil.position.set(si.x, si.y, si.z); as.sil.rotation.set(0, si.giro, 0); as.sil.scale.setScalar(si.escala);
      const ms = E.matSilueta;
      if (ms._s !== si.color) { ms.color.set(si.color).multiplyScalar(0.7); ms.emissive.set(si.color); ms._s = si.color; }
      ms.opacity = si.alfa;
      this._pose(as, as.mezclaSil, as.accionesSil, "ahoraSil", si.armadura && s0 ? s0.clip : "parado", si.armadura && s0 ? s0.tiempo : v.t, true);
    }
    // el balon y su estela
    const b = v.balon;
    E.balon.visible = b.ver;
    if (b.ver) { E.balon.position.set(b.x, b.y, b.z); E.balon.rotation.set(b.giro, b.giro * 0.6, 0); }
    this._estela(m, v);
    const bajo = m.nivel === "baja";
    const pb = E.partBalon;
    pb.visible = b.ver && b.llamas && !bajo;
    if (pb.visible) { const U = pb.material.uniforms, rb = 0.35 * ESTUDIO.balon; U.uCentro.value.set(b.x, b.y - rb, b.z); U.uRadio.value = rb * 1.3; U.uAlto.value = rb * 6; U.uT.value = v.t; }
    // las particulas del efecto (en Baja no hay, diseno 7.4)
    const pa = v.particulas, pp = E.part;
    pp.visible = pa.tipo >= 0 && !bajo;
    if (pp.visible) {
      const U = pp.material.uniforms;
      U.uCentro.value.set(pa.x, pa.y, pa.z); U.uRadio.value = pa.radio; U.uAlto.value = pa.alto; U.uTipo.value = pa.tipo; U.uT.value = v.t;
      // cuantas: el fuego y el viento, la mitad; las hojas y las rocas, menos (tapan)
      U.uDensidad.value = DENSIDAD[pa.tipo] * (pa.radio < 0.3 * ESTUDIO.alto ? 0.5 : 1);
      ponColor(U.uColor.value, pa.color);
      pp.material.blending = pa.tipo >= 2 ? THREE.NormalBlending : THREE.AdditiveBlending;
    }
    // el tamano de los puntos: los px de la pantalla de arriba por metro a 1 m
    const ph = (m.medidas ? m.medidas.arriba.h : 240) * m.render.getPixelRatio(), tam = ph / (2 * Math.tan(v.cam.fov * Math.PI / 360));
    pp.material.uniforms.uTam.value = tam * TAM_PARTICULA[pa.tipo >= 0 ? pa.tipo : 0]; pb.material.uniforms.uTam.value = tam * 0.16;
    // el aura, la cupula y la mano
    const au = v.aura;
    E.aura.visible = au.ver;
    if (au.ver) { E.aura.position.set(au.x, au.y, au.z); E.aura.scale.set(0.95 * au.alto, 1.5 * au.alto, 1); ponColor(E.aura.material.color, v.efecto); }
    const cu = v.cupula;
    E.cupula.visible = cu.ver && cu.radio > 0.01;
    if (E.cupula.visible) { E.cupula.position.set(cu.x, cu.y, cu.z); E.cupula.scale.setScalar(cu.radio); const U = E.cupula.material.uniforms; ponColor(U.uColor.value, v.efecto); U.uT.value = v.t; }
    const ma = v.mano;
    E.mano.visible = ma.ver && ma.tam > 0.01 && ma.alfa > 0.01;
    if (E.mano.visible) { E.mano.position.set(ma.x, ma.y, ma.z); E.mano.rotation.set(0, M.yo.giro, ma.giro); E.mano.scale.set(ma.tam, ma.tam, 1); E.mano.material.opacity = ma.alfa; ponColor(E.mano.material.color, v.efecto); }
    const es = v.espiral;
    E.espiral.visible = es.ver && es.alfa > 0.01;
    if (E.espiral.visible) {
      E.espiral.position.set(es.x, es.y, es.z); E.espiral.scale.set(es.radio, es.alto, es.radio); E.espiral.rotation.y = -v.t * 4.2;
      const U = E.espiral.material.uniforms; U.uT.value = v.t; U.uAlfa.value = es.alfa; ponColor(U.uColor.value, es.color);
    }
    // la camara
    const C = v.cam;
    cam.position.set(C.x, C.y, C.z); cam.up.set(0, 1, 0); cam.lookAt(C.hx, C.hy, C.hz);
    if (cam.fov !== C.fov || cam.aspect !== ESTUDIO.aspecto) { cam.fov = C.fov; cam.aspect = ESTUDIO.aspecto; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  },
  // la estela del balon: por donde ha ido en los ultimos 0,3 s del plano (la misma cuenta,
  // hacia atras: sale igual con el reloj parado), en una cinta de cara a la camara
  _estela(m, v) {
    const E = this._E, b = v.balon, n = ESTUDIO.estela, me = E.estela;
    me.visible = b.ver && b.estela && v.t > 0.02;
    if (!me.visible) return;
    const P = E.estelaP, du = v.u / Math.max(0.001, v.t), cam = m.camArriba.position, e = this._e;
    for (let k = 0; k < n; k++) {
      const atras = 0.3 * k / (n - 1);
      this.balonEn(b.beh, Math.max(0, v.u - du * atras), Math.max(0, v.t - atras), e);
      P[k * 3] = e.x; P[k * 3 + 1] = e.y; P[k * 3 + 2] = e.z;
    }
    // el balon de verdad es el punto 0 (balonEn ha vuelto a mover el montaje, no el balon)
    const pos = me.geometry.attributes.position.array, col = me.geometry.attributes.color.array, rb = 0.35 * ESTUDIO.balon;
    const c = ponColor(this._colEstela || (this._colEstela = new THREE.Color()), b.llamas ? "#FF7A20" : v.efecto);
    for (let k = 0; k < n; k++) {
      const i = Math.min(k, n - 2), dx = P[i * 3] - P[(i + 1) * 3], dy = P[i * 3 + 1] - P[(i + 1) * 3 + 1], dz = P[i * 3 + 2] - P[(i + 1) * 3 + 2];
      const vx = cam.x - P[k * 3], vy = cam.y - P[k * 3 + 1], vz = cam.z - P[k * 3 + 2];
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
      const l = Math.hypot(sx, sy, sz) || 1, w = rb * 1.15 * (1 - k / n);
      sx = sx / l * w; sy = sy / l * w; sz = sz / l * w;
      pos[k * 6] = P[k * 3] + sx; pos[k * 6 + 1] = P[k * 3 + 1] + sy; pos[k * 6 + 2] = P[k * 3 + 2] + sz;
      pos[k * 6 + 3] = P[k * 3] - sx; pos[k * 6 + 4] = P[k * 3 + 1] - sy; pos[k * 6 + 5] = P[k * 3 + 2] - sz;
      const al = Math.pow(1 - k / n, 1.5) * 0.9;
      for (const o of [k * 8, k * 8 + 4]) { col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; col[o + 3] = al; }
    }
    me.geometry.attributes.position.needsUpdate = true; me.geometry.attributes.color.needsUpdate = true;
  },
  // el fondo (el degradado y las lineas, o las llamas), la escena y encima las lineas sobre
  // el estadio y el destello blanco
  _render(m, v) {
    const E = this._E, R = m.render, ac = R.autoClear;
    R.autoClear = false;
    R.setClearColor(0x000000, 1); R.clear(true, true, false);
    const color = v.fondo !== "estadio";
    E.estadio.visible = !color;
    const t = v.t + (v.plano ? v.plano.length * 0.37 : 0);
    if (color) {
      const U = E.fondo.material.uniforms;
      ponColor(U.uClaro.value, v.claro); ponColor(U.uOscuro.value, v.oscuro);
      U.uT.value = t; U.uRayas.value = v.rayas; U.uModo.value = v.fondo === "llamas" ? 1 : 0;
      R.render(E.fondoEsc, E.orto);
    }
    R.render(E.escena, m.camArriba);
    const rayas = !color && v.rayas > 0, blanco = v.blanco > 0.01;
    if (rayas || blanco) {
      E.rayas.visible = rayas; E.blanco.visible = blanco;
      if (rayas) { const U = E.rayas.material.uniforms; U.uT.value = t; U.uRayas.value = v.rayas; }
      if (blanco) E.blanco.material.opacity = v.blanco;
      R.render(E.encimaEsc, E.orto);
    }
    R.autoClear = ac;
  },
  // para las pruebas en el navegador: cuantos actores y siluetas hay
  info() {
    let actores = 0, siluetas = 0;
    for (const a of this._actores.values()) { actores++; if (a.sil) siluetas++; }
    // las animaciones de VR (O-323): cargadas, la que se ve, las que este PC tiene
    const vr = { cargadas: [...this._vrEv.values()].filter(e => e.ev).map(e => e.clave), activa: this._vrActivo ? this._vrActivo.clave : null,
                 cargando: this._vrCargando, hechos: this.vr ? this.vr.hechos.size : 0, pendientes: this.vr ? this.vr.pend : 0,
                 cuenta: Object.assign({}, this._vrCuenta || {}), ms: (this._vrTiempos || []).slice() };
    return { actores, siluetas, calentado: this._calentado, ms: this.ms, vr };
  },
});

// la pagina la espera con Consola.modulo("Escenas") (este modulo va despues de partido.js)
if (typeof Consola !== "undefined" && Consola.registrar) Consola.registrar("Escenas", Escenas);
