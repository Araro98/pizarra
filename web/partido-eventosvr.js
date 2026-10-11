/* Las animaciones REALES de VR en la pantalla de arriba (NOTAS O-323): el reproductor de los
   "eventos" de VR (cada supertecnica, cada invocacion y transformacion) que convierte
   ievr/g4evento.py en el PC de cada uno, desde SU juego (datos/modelos3d/eventos, nunca se
   reparte). Lo usa partido-escenas.js (el Estudio); si un evento aun no esta convertido, alli
   sale la plantilla de antes (O-320).
   Lo que sale del conversor, en /api/partido/evento/<ev>/:
     escena.json         cortes, actores, camara (fov por fotograma), quien se ve y los
                         materiales y mallas de los efectos por fotograma
     escena.glb          los efectos (con sus mallas) y el nodo "camara"; una animacion por corte
     pistas_<cuerpo>.glb solo pistas de los jugadores ("s00|<hueso>") para ese tipo de cuerpo
     pistas_<k/a>.glb    las del keshin o alma (<ASSIGN>, clave "asignado_s00")
     pistas_modelos.glb  las del balon ("b000001_s00") y los modelos fijos
     part_<nombre>.png   las texturas de las particulas (escena.json particulas: los emisores
                         de VR descifrados; las pinta partido-particulasvr.js, O-330)
     sombreadores.json   los sombreadores de VR de sus efectos traducidos a GLSL: con ellos
                         cada material de efecto se pinta como en VR, y las caras de los
                         jugadores cambian como en VR (partido-sombrasvr.js, O-331)
   Cada modelo (el del jugador, el keshin, el balon...) se clona y se le aplican sus pistas sin
   el "<clave>|": la del hueso raiz ("output") ya lleva donde esta el actor en cada fotograma.
   Base: el reproductor probado del conversor (scratchpad animvr/o323/visor), con la cache de
   modelos de la pagina, la colocacion en el campo, los nombres buscados una vez y la subida
   a la grafica antes de verse. Este modulo no toca window ni document al cargarse. */
import * as THREE from "./partido-three.module.js";
import { GLTFLoader } from "./partido-GLTFLoader.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";
import { ParticulasVR } from "./partido-particulasvr.js";
import { SombrasVR, CarasVR, cuadroNuevo, ponerCamara } from "./partido-sombrasvr.js";

export const EVENTO_VR = { fps: 60, raiz: "/api/partido/evento/", cuerpo: "c000101", suma: "pantalla" };

let CARGADOR = null;
function cargarGltf(url) {
  if (!CARGADOR) CARGADOR = new GLTFLoader();
  return new Promise((ok, mal) => CARGADOR.load(url, ok, undefined, mal));
}
async function cargarJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("no esta " + url);
  return r.json();
}
// los clips de un .glb de pistas que son de `clave`, sin el "clave|" (para el modelo clonado)
function clipsDe(gltf, clave) {
  const pre = THREE.PropertyBinding.sanitizeNodeName(clave) + "|";
  const out = {};
  for (const a of gltf.animations) {
    const pistas = a.tracks.filter(t => t.name.startsWith(pre)).map(t => {
      const c = t.clone(); c.name = t.name.slice(pre.length); return c;
    });
    if (pistas.length) out[a.name] = new THREE.AnimationClip(a.name, a.duration, pistas);
  }
  return out;
}
// el tipo de cuerpo de un modelo de jugador (c000101..c000401): lo dice su glb
export function cuerpoDe(gltf) {
  try { return ((gltf.parser.json.asset.extras || {}).piezas || {}).anim || EVENTO_VR.cuerpo; } catch (e) { return EVENTO_VR.cuerpo; }
}
// los sombreadores de VR que no se saben hacer aun (la distorsion de la pantalla y las
// particulas falsas, que van con texturas de posiciones): mejor no pintarlos que pintar
// rectangulos (O-323)
const SIN_PINTAR = /^(Distortion|FakePar)/;
// los de forma y rampa (Grd, Threshold): la intensidad de la forma elige el color y la
// transparencia en la rampa (el extremo fuerte, donde la forma es blanca; lo negro no se ve).
// Antes salian los rectangulos enteros con el degradado y lavaban la imagen de blanco
function conRampa(m, r) {
  const k = "k", c = r.eje === "u" ? (r.alto ? "vec2(" + k + ", 0.5)" : "vec2(1.0 - " + k + ", 0.5)") : (r.alto ? "vec2(0.5, " + k + ")" : "vec2(0.5, 1.0 - " + k + ")");
  m.onBeforeCompile = sh => {
    sh.uniforms.rampa = { value: r.tex };
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D rampa;")
      .replace("#include <map_fragment>", `#ifdef USE_MAP
  vec4 forma = texture2D( map, vMapUv );
  float k = clamp( max( forma.r, max( forma.g, forma.b ) ) * forma.a, 0.0, 1.0 );
  vec4 deRampa = texture2D( rampa, ${c} );
  diffuseColor.rgb *= deRampa.rgb;
  diffuseColor.a *= deRampa.a * smoothstep( 0.0, 0.35, k );
#endif`);
  };
  m.customProgramCacheKey = () => "rampa" + r.eje + r.alto;
  m.needsUpdate = true;
}
// la luz de los efectos que suman (fuego, viento, brillos, cupulas): "pantalla" (lo de detras
// se aclara sin pasar de blanco: con el estadio claro detras, sumar a pelo lavaba la imagen
// entera de blanco, como en Zona de contencion) o "suma" (sumar sin mas)
export function sumar(m, modo = EVENTO_VR.suma) {
  if (modo === "suma") { m.blending = THREE.AdditiveBlending; m.premultipliedAlpha = false; }
  else {
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcColorFactor; m.premultipliedAlpha = true;
  }
  m.needsUpdate = true;
}
// como se dibuja cada material de efecto (el conversor lo deja en userData.mezcla): sumar
// luz (fuego, viento, brillos), normal (los "black", oscurecen), solido (la mano gigante),
// contorno y la mascara de profundidad (un poco detras: si no, rayas contra la malla solida)
function prepararMaterial(m) {
  const u = m.userData || {};
  // los de VR ya vienen montados (partido-sombrasvr.js, O-331)
  if (!u.efecto || u._listo || m.isShaderMaterial) return;
  u._listo = true;
  // (la textura se repite o va en espejo segun su muestreador del glb: los cuartos de mancha,
  // en espejo; ievr/g4evento.es_cuarto)
  if (SIN_PINTAR.test(u.familia || "")) u.oculto = true;
  if (u.rampa && u.rampa.tex && m.map) conRampa(m, u.rampa);
  switch (u.mezcla) {
    case "solido": m.blending = THREE.NormalBlending; m.transparent = false; m.depthWrite = true; m.vertexColors = false; break;
    case "contorno": m.side = THREE.BackSide; m.transparent = false; m.depthWrite = true; m.vertexColors = false;
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 4; break;
    case "profundidad": m.colorWrite = false; m.depthWrite = true;
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 4; break;
    case "normal": m.blending = THREE.NormalBlending; m.transparent = true; m.depthWrite = false; break;
    default: m.transparent = true; m.depthWrite = false; sumar(m);
  }
  u.color0 = m.color.clone();
  u.transparente0 = m.transparent;
}
// el valor k de una lista por fotograma (el ultimo si se pasa)
const enK = (x, k) => (x ? x[Math.min(k, x.length - 1)] : undefined);

// O-345: el tinte del cuerpo de VR (las AURA body_aura_* del guion; Aaron: "la tiene que hacer con
// una copia de si mismo pero en oscuro"). Como el sombreador chr_toon_effstatus de VR: el color del
// jugador por `color` (u_charaStatusColor) y un borde, (1 - N.V) a la `potencia`, del color `borde`
// por su a (u_charaStatusRimColor). El clon de Sombra de Orion: negro con el borde rojo oscuro; los de
// Regate multiple, azulados. U: los uniforms del actor (los comparten todos sus materiales)
function tenir(m, U) {
  const antes = m.onBeforeCompile, clave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    if (antes) antes.call(this, sh, r);
    sh.uniforms.tColor = U.tColor; sh.uniforms.tBorde = U.tBorde; sh.uniforms.tPot = U.tPot;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vTBorde;")
      .replace("#include <project_vertex>", `#include <project_vertex>
#if defined( USE_ENVMAP ) || defined( USE_SKINNING )
	vTBorde = 1.0 - clamp( dot( normalize( transformedNormal ), normalize( -mvPosition.xyz ) ), 0.0, 1.0 );
#else
	vTBorde = 1.0 - clamp( dot( normalize( normalMatrix * normal ), normalize( -mvPosition.xyz ) ), 0.0, 1.0 );
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vTBorde;\nuniform vec3 tColor;\nuniform vec4 tBorde;\nuniform float tPot;")
      // (en gamma, como el sombreador de VR, que trabaja con los colores tal cual: aqui el color ya va en
      // lineal y luego se pasa a sRGB, y el borde sumado en lineal salia mucho mas claro: el clon de Sombra
      // de Orion granate en vez de casi negro. O-345, vuelta 1)
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
	gl_FragColor.rgb = pow( max( pow( max( gl_FragColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) ) * tColor + tBorde.rgb * tBorde.a * pow( clamp( vTBorde, 0.0, 1.0 ), max( tPot, 0.01 ) ), 0.0 ), vec3( 2.2 ) );`);
  };
  m.customProgramCacheKey = function () { return (clave ? clave.call(this) : "") + "|tinteVR"; };
  m.needsUpdate = true;
}
// el valor i (1..4) de una animacion de color de VR [[s, r, g, b, a]...] en el s `s`
function valorEn(claves, s, i) {
  if (!claves || !claves.length) return null;
  let k = 0;
  while (k < claves.length - 1 && claves[k + 1][0] <= s) k++;
  const a = claves[k], b = claves[k + 1];
  if (!b || s <= a[0]) return a[i];
  return a[i] + (b[i] - a[i]) * Math.min(1, (s - a[0]) / Math.max(1e-6, b[0] - a[0]));
}
// el tinte de un actor en el s `s` del evento: el ultimo que ha salido (lista [[fotograma, nombre,
// 0 sale / 1 se va]]), con lo que tarda en ponerse (entra) y en quitarse (sale)
export function tinteEn(lista, defs, s, fps = 60) {
  let ini = -1, fin = Infinity, nombre = "";
  for (const [fr, n, on] of lista) {
    const t = fr / fps;
    if (t > s + 1e-6) break;
    if (!on) { ini = t; fin = Infinity; nombre = n; } else if (n === nombre && fin === Infinity) fin = t;
  }
  const d = nombre ? (defs || {})[nombre] : null;
  if (!d || ini < 0) return null;
  let w = d.entra > 0 ? Math.min(1, (s - ini) / d.entra) : 1;
  if (s >= fin) w *= d.sale > 0 ? Math.max(0, 1 - (s - fin) / d.sale) : 0;
  if (!(w > 0)) return null;
  const tt = s - ini, c = i => valorEn(d.color, tt, i) ?? 1, b = i => valorEn(d.borde, tt, i) ?? 0;
  return { nombre, w, color: [1 + (c(1) - 1) * w, 1 + (c(2) - 1) * w, 1 + (c(3) - 1) * w], borde: [b(1), b(2), b(3), b(4) * w], potencia: valorEn(d.potencia, tt, 1) ?? 1 };
}

export class EventoVR {
  // ev: "ev60_00030". modelo(codigo) -> promesa del gltf (la cache de partido-3d: el jugador,
  // el balon, el keshin...; null si no esta). actores: {s00: codigo, s01: codigo...} de los
  // jugadores; asignado: el keshin o alma que pone el juego (<ASSIGN>), o null; elemento: el
  // de la tecnica (el color del aura del balon; si no, el que dice escena.json)
  static async cargar(ev, { modelo, actores = {}, asignado = null, base = EVENTO_VR.raiz, elemento = null } = {}) {
    const url = base + ev + "/";
    const j = await cargarJson(url + "escena.json");
    // los sombreadores de VR (O-331): si no estan, los materiales como antes
    const [escena, programas] = await Promise.all([cargarGltf(url + "escena.glb"), SombrasVR.cargar(url)]);
    // las rampas de los materiales de forma y rampa (una por textura, sin repetirse)
    const rampas = new Map(), conR = [];
    escena.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { const r = m.userData && m.userData.rampa; if (r && r.textura !== undefined) conR.push(r); } });
    for (const r of conR) if (!rampas.has(r.textura)) rampas.set(r.textura, escena.parser.getDependency("texture", r.textura).then(t => {
      const c = t.clone(); c.colorSpace = THREE.SRGBColorSpace; c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping; c.needsUpdate = true; return c;
    }).catch(() => null));
    for (const r of conR) r.tex = await rampas.get(r.textura);
    // los modelos de los actores (los que no esten, se quedan fuera) y su tipo de cuerpo
    const modelos = {}, cuerpos = {};
    await Promise.all(Object.entries(j.actores).map(async ([clave, a]) => {
      const cod = a.tipo === "personaje" ? actores[clave] : a.tipo === "asignado" ? asignado : (a.tipo === "balon" || a.tipo === "modelo") ? a.modelo : null;
      if (!cod || !modelo) return;
      let g = null;
      try { g = await modelo(cod); } catch (e) { g = null; }
      if (!g) return;
      modelos[clave] = g;
      if (a.tipo === "personaje") cuerpos[clave] = cuerpoDe(g);
    }));
    const pistas = {}, quiero = new Set();
    for (const [clave, a] of Object.entries(j.actores)) {
      if (!modelos[clave]) continue;
      if (a.tipo === "personaje") quiero.add("pistas_" + cuerpos[clave] + ".glb");
      else if (a.tipo === "asignado") quiero.add("pistas_" + asignado + ".glb");
      else if (a.tipo === "modelo" || a.tipo === "balon") quiero.add("pistas_modelos.glb");
    }
    // las que no estan (faltan) y, de esas, las que no tienen ni las del c000101 en su lugar
    // (sinPistas: ese actor no se moveria): Escenas la vuelve a leer si el servidor aun las
    // estaba haciendo (O-334, vuelta 2)
    const faltan = [], sinPistas = [];
    await Promise.all([...quiero].map(async f => {
      try { pistas[f] = await cargarGltf(url + f); }
      catch (e) {
        faltan.push(f);
        // un tipo de cuerpo sin convertir: las del c000101 (los huesos se llaman igual)
        if (f.startsWith("pistas_c000") && f !== "pistas_c000101.glb") {
          try { pistas[f] = await cargarGltf(url + "pistas_c000101.glb"); } catch (e2) {}
        }
        if (!pistas[f]) sinPistas.push(f);
      }
    }));
    let sombras = null;
    if (programas) {
      sombras = new SombrasVR(escena, programas, elemento || j.elemento || "");
      const conVR = [];
      escena.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData && m.userData.vr) conVR.push(m); });
      await sombras.texturasDe(conVR);
    }
    const e = new EventoVR(ev, j, escena, pistas, modelos, cuerpos, asignado, sombras);
    e.faltan = faltan.sort(); e.sinPistas = sinPistas.sort();
    // las particulas (O-330): con el resto, antes de verse; si fallan, el evento sin ellas
    try { e.particulas = await ParticulasVR.cargar(e, url, { elemento }); } catch (err) { e.particulas = null; }
    return e;
  }

  constructor(ev, j, escena, pistas, modelos, cuerpos, asignado, sombras = null) {
    this.ev = ev; this.j = j;
    this.sombras = sombras;
    this.raiz = new THREE.Group(); this.raiz.name = "evento_" + ev;
    this.escena = escena;
    this.raiz.add(escena.scene);
    this.duracion = j.duracion;
    this.cortes = j.cortes;
    this.fin = this.cortes[this.cortes.length - 1].fin;
    this.camara = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 600);
    this.nodoCamara = escena.scene.getObjectByName("camara");
    this.mezcla = new THREE.AnimationMixer(escena.scene);
    this.clips = Object.fromEntries(escena.animations.map(a => [a.name, a]));
    // los materiales de efecto por nombre y los nodos por nombre (buscados una vez)
    this.mats = {}; this.todos = []; this.nodos = new Map();
    escena.scene.traverse(o => {
      if (o.name && !this.nodos.has(o.name)) this.nodos.set(o.name, o);
      if (!o.isMesh) return;
      o.frustumCulled = false;
      // con su sombreador de VR (O-331); si no, como antes
      if (sombras) sombras.montar(o);
      for (const m of [].concat(o.material)) {
        prepararMaterial(m);
        if (m.userData.efecto && !this.todos.includes(m)) this.todos.push(m);
        (this.mats[m.name] = this.mats[m.name] || new Set()).add(m);
      }
    });
    // los actores con modelo: un clon de cada uno en el origen del evento, con sus pistas
    this.actores = {};
    for (const [clave, a] of Object.entries(j.actores)) {
      if (a.tipo === "efecto") {
        this.actores[clave] = { tipo: "efecto", nodo: this.nodos.get(THREE.PropertyBinding.sanitizeNodeName(clave)) || null };
        continue;
      }
      const gltf = modelos[clave];
      const f = a.tipo === "personaje" ? "pistas_" + (cuerpos[clave] || EVENTO_VR.cuerpo) + ".glb"
        : a.tipo === "asignado" ? "pistas_" + asignado + ".glb" : "pistas_modelos.glb";
      if (!gltf || !pistas[f]) continue;
      const clips = clipsDe(pistas[f], clave);
      if (!Object.keys(clips).length) continue;
      const nodo = clonarModelo(gltf.scene);
      nodo.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.raiz.add(nodo);
      this.actores[clave] = { tipo: a.tipo, nodo, mezcla: new THREE.AnimationMixer(nodo), clips };
      // las caras de VR (O-331): los ojos y la boca de cada fotograma; el numero de cada uno va
      // desde que empieza el clip del actor en el corte (su primera pista)
      if (a.tipo === "personaje") {
        let caras = null;
        try { caras = ((pistas[f].parser.json.asset.extras || {}).caras || {})[clave]; } catch (e) { caras = null; }
        if (caras) {
          const actor = this.actores[clave];
          actor.caras = new CarasVR(nodo, caras);
          actor.inicio = {};
          for (const [nc, cl] of Object.entries(clips)) actor.inicio[nc] = Math.min(...cl.tracks.map(t => t.times[0]));
        }
      }
    }
    // el tinte del cuerpo de VR de cada actor que lo lleva (O-345): sus materiales, propios (los del
    // modelo los comparten los demas jugadores, y su original si es una copia del mismo jugador)
    this._tintes = [];
    for (const [clave, lista] of Object.entries(j.auras_cuerpo || {})) {
      const a = this.actores[clave], defs = j.auras_def || {}, mia = (lista || []).filter(x => defs[x[1]]).sort((x, y) => x[0] - y[0]);
      if (!a || !a.nodo || !mia.length) continue;
      const U = { tColor: { value: new THREE.Color(1, 1, 1) }, tBorde: { value: new THREE.Vector4(0, 0, 0, 0) }, tPot: { value: 1 } };
      const deCaras = new Set(a.caras ? a.caras.partes.map(x => x.mat) : []), copias = new Map(), propios = [];
      a.nodo.traverse(o => {
        if (!o.isMesh) return;
        const nuevos = [].concat(o.material).map(m => {
          if (!m || deCaras.has(m) || copias.has(m)) return m ? copias.get(m) || m : m;
          const c = m.clone();
          c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
          tenir(c, U); copias.set(m, c); propios.push(c);
          return c;
        });
        o.material = Array.isArray(o.material) ? nuevos : nuevos[0];
      });
      for (const m of deCaras) tenir(m, U);
      this._tintes.push({ clave, U, lista: mia, propios });
    }
    // las listas por fotograma de escena.json, una vez: [clave, actor, lista] de quien se ve;
    // por corte, [materiales, desde, datos] y [nodos, desde, lista] de los efectos
    this._visible = Object.entries(j.visible || {}).map(([clave, lista]) => [this.actores[clave], lista]).filter(x => x[0] && x[0].nodo);
    this._mat = {}; this._mallas = {};
    for (const c of this.cortes) {
      const desde = clave => (((j.actores[clave] || {}).clips || {})[c.nombre] || {}).desde || 0;
      this._mat[c.nombre] = [];
      for (const [clave, porMat] of Object.entries((j.materiales || {})[c.nombre] || {}))
        for (const [nm, d] of Object.entries(porMat)) if (this.mats[nm]) this._mat[c.nombre].push([this.mats[nm], desde(clave), d]);
      this._mallas[c.nombre] = [];
      for (const [clave, porMalla] of Object.entries((j.mallas || {})[c.nombre] || {})) {
        const info = j.actores[clave] || {};
        for (const [malla, lista] of Object.entries(porMalla)) {
          const nodos = ((info.mallas || {})[malla] || []).map(n => this.nodos.get(n)).filter(Boolean);
          if (nodos.length) this._mallas[c.nombre].push([nodos, desde(clave), lista]);
        }
      }
    }
    // el destello blanco de pantalla entera de VR (las mallas "whiteout": un cuadradito delante de la
    // camara de VR que tapa la pantalla; aqui salia como un cuadrado blanco en medio, O-337 vuelta 1):
    // no se pintan en 3D; su opacidad de cada fotograma va en `blanco` (0..1) y Escenas pinta encima
    // la pantalla en blanco (como el destello de las plantillas). Las "whiteout_kage_black" son negras
    this._blancos = [];
    for (const [nombre, o] of this.nodos) {
      if (!o.isMesh || !/whiteout/i.test(nombre) || /black|kage/i.test(nombre)) continue;
      this._blancos.push({ o, mats: new Set([].concat(o.material)) });
    }
    this.blanco = 0;
    this.corte = null;
    this.particulas = null;
    // las texturas que corren en bucle (O-332: escena.json uv_bucle): [materiales, ranura, eje, vel, curva]
    this._uvBucle = [];
    for (const lista of Object.values(j.uv_bucle || {})) for (const b of lista || []) if (this.mats[b.material] && b.curva && b.curva.length > 1)
      this._uvBucle.push([this.mats[b.material], b.ranura || 0, b.eje, +b.vel || 0, b.curva]);
  }

  // donde esta y hacia donde mira el que hace la tecnica (s00; en algunas de defensa s01, O-336)
  // al empezar, en el marco del evento: para ponerlo en su sitio del campo. null si no sale
  ancla(clave = "s00") {
    this._anclas = this._anclas || {};
    if (this._anclas[clave] !== undefined) return this._anclas[clave];
    this._anclas[clave] = null;
    const a = this.actores[clave];
    if (!a || !a.clips) return null;
    const c = a.clips[this.cortes[0].nombre] || Object.values(a.clips)[0];
    if (!c) return null;
    const pos = c.tracks.find(t => t.name === "output.position"), rot = c.tracks.find(t => t.name === "output.quaternion");
    if (!pos) return null;
    const f = new THREE.Vector3(0, 0, 1);
    if (rot) f.applyQuaternion(new THREE.Quaternion(rot.values[0], rot.values[1], rot.values[2], rot.values[3]));
    this._anclas[clave] = { x: pos.values[0], z: pos.values[2], giro: Math.hypot(f.x, f.z) > 1e-3 ? Math.atan2(f.x, f.z) : 0 };
    return this._anclas[clave];
  }

  // O-345: donde esta el actor al empezar por su pose (la pelvis, c_c_1_0), en el marco del evento, y hacia
  // donde mira el evento (+Z, o lo que diga su raiz). En las jugadas sin tecnica de VR (ev71) la raiz del
  // actor no lleva donde esta (lo lleva c_global) y ancla() no lo sabe: el que chutaba salia 20 m por
  // delante, junto a la porteria
  anclaPuesta(clave = "s00") {
    this._anclasP = this._anclasP || {};
    if (this._anclasP[clave] !== undefined) return this._anclasP[clave];
    const a = this.actores[clave];
    let r = null;
    if (a && a.nodo) {
      const p0 = this.raiz.position.clone(), r0 = this.raiz.rotation.y;
      this.raiz.position.set(0, 0, 0); this.raiz.rotation.set(0, 0, 0);
      this.corte = null; this.poner(0);
      const b = a.nodo.getObjectByName("c_c_1_0") || a.nodo, w = new THREE.Vector3(), an = this.ancla(clave);
      this.raiz.updateMatrixWorld(true); b.getWorldPosition(w);
      r = { x: w.x, z: w.z, giro: an ? an.giro : 0 };
      this.raiz.position.copy(p0); this.raiz.rotation.set(0, r0, 0); this.corte = null;
    }
    this._anclasP[clave] = r;
    return r;
  }

  // el elemento de la tecnica (el color de las particulas del aura del balon): los eventos que
  // comparten tecnicas de varios elementos (24, las de keshin y alma) lo necesitan; en los demas
  // ya viene en escena.json (O-330)
  elemento(el) { if (this.particulas) this.particulas.ponerElemento(el); if (this.sombras) this.sombras.elemento(el); }

  // el fotograma g (del evento entero) -> el corte
  cortePara(g) {
    let c = this.cortes[0];
    for (const x of this.cortes) if (x.ini <= g) c = x;
    return c;
  }

  // pone todo en el instante t (segundos desde el principio del evento); tPart: el de las
  // particulas, si va aparte (el aura del campo: su bucle vuelve atras y las vaciaria, O-332)
  poner(t, tPart) {
    const g = Math.max(0, Math.min(Math.round(t * EVENTO_VR.fps), this.fin));
    const c = this.cortePara(g), f = g - c.ini;
    const tl = f / EVENTO_VR.fps;
    cuadroNuevo();
    if (this.corte !== c.nombre) {
      this.corte = c.nombre;
      this._acciones = [];
      this.mezcla.stopAllAction();
      if (this.clips[c.nombre]) {
        const ac = this.mezcla.clipAction(this.clips[c.nombre]);
        ac.clampWhenFinished = true; ac.setLoop(THREE.LoopOnce, 1); ac.play(); this._acciones.push(ac);
      }
      for (const a of Object.values(this.actores)) {
        if (!a.mezcla) continue;
        a.mezcla.stopAllAction();
        const clip = a.clips[c.nombre];
        if (a.nodo) a.nodo.visible = !!clip;
        if (clip) { const ac = a.mezcla.clipAction(clip); ac.clampWhenFinished = true; ac.setLoop(THREE.LoopOnce, 1); ac.play(); this._acciones.push(ac); }
      }
    }
    // (sin la pausa del final: la accion de una vez que llega a su final se queda en pausa
    // (clampWhenFinished) y setTime ya no la movia: la segunda vez que salia una animacion de un solo
    // corte (las jugadas ev71), los jugadores y la camara se quedaban en su primer cuadro. O-345, vuelta 1)
    for (const ac of this._acciones || []) ac.paused = false;
    this.mezcla.setTime(tl);
    for (const a of Object.values(this.actores)) if (a.mezcla && a.clips[c.nombre]) a.mezcla.setTime(tl);
    // el tinte del cuerpo de VR de este fotograma (O-345)
    for (const T of this._tintes) {
      const x = tinteEn(T.lista, this.j.auras_def, g / EVENTO_VR.fps, EVENTO_VR.fps), U = T.U;
      if (!x) { U.tColor.value.setRGB(1, 1, 1); U.tBorde.value.set(0, 0, 0, 0); continue; }
      U.tColor.value.setRGB(x.color[0], x.color[1], x.color[2]); U.tBorde.value.set(x.borde[0], x.borde[1], x.borde[2], x.borde[3]); U.tPot.value = x.potencia;
    }
    // las caras de VR de este fotograma (O-331)
    for (const a of Object.values(this.actores)) {
      if (a.caras && a.clips[c.nombre]) a.caras.poner(c.nombre, Math.round((tl - (a.inicio[c.nombre] || 0)) * EVENTO_VR.fps));
    }
    // quien se ve (VISIBLE del guion, por fotograma del evento entero)
    for (const [a, lista] of this._visible) {
      let v = 1;
      for (const [fr, val] of lista) if (fr <= g) v = val;
      a.nodo.visible = !!v && (!a.mezcla || !!a.clips[c.nombre]);
    }
    // materiales de los efectos: opacidad, color y desplazamiento de UV por fotograma
    for (const m of this.todos) {
      // con su sombreador de VR: sus valores fijos (O-331)
      if (m.isShaderMaterial) { this.sombras.ponerBase(m); continue; }
      m.opacity = 1; m.visible = !m.userData.oculto; m.transparent = !!m.userData.transparente0;
      if (m.userData.color0) m.color.copy(m.userData.color0);
      if (m.map) m.map.offset.set(0, 0);
    }
    for (const [ms, desde, d] of this._mat[c.nombre] || []) {
      const k = Math.max(0, f - desde);
      for (const m of ms) {
        if (m.isShaderMaterial) { this.sombras.aplicar(m, d, k); continue; }
        // los de antes con lo de O-331 (d: difuso; t: desplazamiento de la textura de su ranura)
        if (d.d && !d.opacidad) {
          const o = enK(d.d[3], k);
          if (o !== undefined && o !== null) { m.opacity = o; m.visible = o > 0.001 && !m.userData.oculto; if (!m.transparent && o < 0.99) m.transparent = true; }
          if (d.d[0] || d.d[1] || d.d[2]) m.color.setRGB(enK(d.d[0], k) ?? 1, enK(d.d[1], k) ?? 1, enK(d.d[2], k) ?? 1);
        }
        if (m.map && d.t && d.t[m.userData.ranura || 0]) {
          const tt = d.t[m.userData.ranura || 0];
          m.map.offset.set(-(enK(tt.tu, k) || 0), enK(tt.tv, k) || 0);
        }
        if (d.opacidad) { const o = enK(d.opacidad, k); m.opacity = o; m.visible = o > 0.001 && !m.userData.oculto; if (!m.transparent && o < 0.99) m.transparent = true; }
        if (d.r || d.g || d.b) m.color.setRGB(enK(d.r, k) ?? 1, enK(d.g, k) ?? 1, enK(d.b, k) ?? 1);
        if (m.map && (d.u || d.v)) m.map.offset.set(enK(d.u, k) || 0, enK(d.v, k) || 0);
      }
    }
    // las texturas que corren en bucle (O-332): su curva (60 por segundo) a vel vueltas por segundo,
    // con el tiempo seguido (el de las particulas si va aparte)
    for (const [ms, n, eje, vel, curva] of this._uvBucle) {
      const x = (((tPart !== undefined ? tPart : t) * vel) % 1 + 1) % 1 * (curva.length - 1), i = Math.min(curva.length - 2, Math.floor(x));
      const d = curva[i] + (curva[i + 1] - curva[i]) * (x - i);
      for (const m of ms) {
        if (m.isShaderMaterial) this.sombras.desplazarUV(m, n, eje, d);
        else if (m.map) { if (eje === "u") m.map.offset.x -= d; else m.map.offset.y += d; }
      }
    }
    // (el whiteout se esconde tras mirarlo: aqui, como si se viera, O-337 vuelta 1)
    for (const b of this._blancos) b.o.visible = true;
    // mallas de los efectos que se ven o no (G4VS)
    for (const [nodos, desde, lista] of this._mallas[c.nombre] || []) {
      const v = !!lista[Math.min(Math.max(0, f - desde), lista.length - 1)];
      for (const o of nodos) o.visible = v;
    }
    // la camara de VR: el nodo "camara" (posicion y giro ya puestos) y su fov vertical
    this.raiz.updateMatrixWorld(true);
    // el destello blanco (whiteout): su opacidad de este fotograma (la del material en el corte; sin
    // datos en el corte, no sale), si se ve (el y los suyos visibles y su hueso sin escala 0), y la
    // malla escondida (O-337, vuelta 1)
    this.blanco = 0;
    for (const b of this._blancos) {
      let a = 0, ve = true;
      for (let x = b.o; x && x !== this.raiz; x = x.parent) if (!x.visible) { ve = false; break; }
      if (ve && Math.abs(b.o.matrixWorld.determinant()) < 1e-12) ve = false;
      if (ve) for (const [ms, desde, d] of this._mat[c.nombre] || []) {
        if (![...ms].some(m => b.mats.has(m))) continue;
        const k = Math.max(0, f - desde), al = d.d && d.d[3] ? enK(d.d[3], k) : d.opacidad ? enK(d.opacidad, k) : null;
        if (typeof al === "number" && isFinite(al)) a = Math.max(a, al);
      }
      this.blanco = Math.max(this.blanco, Math.min(1, a));
      b.o.visible = false;
    }
    if (this.nodoCamara) {
      this.nodoCamara.matrixWorld.decompose(this.camara.position, this.camara.quaternion, this.camara.scale);
      this.camara.scale.set(1, 1, 1);
      const cam = (this.j.camara || {})[c.nombre];
      if (cam && cam.fov) { const fv = cam.fov[Math.min(f, cam.fov.length - 1)]; if (fv > 0 && fv !== this.camara.fov) { this.camara.fov = fv; this.camara.updateProjectionMatrix(); } }
      this.camara.updateMatrixWorld(true);
    }
    // la proyeccion para los sombreadores de VR (O-331); el aura del campo, la del campo (O-332)
    if (this.sombras && !this.sinCamara) ponerCamara(this.camara);
    // las particulas de VR, con los huesos del efecto ya en su sitio (O-330)
    if (this.particulas) this.particulas.poner(tPart !== undefined ? tPart : Math.max(0, Math.min(t, this.fin / EVENTO_VR.fps)));
    return c.nombre;
  }

  // sube a la grafica lo suyo antes de verse (los shaders y las texturas): el primer cuadro
  // del evento no se atasca. escena: la del Estudio (sus luces)
  preparar(render, escena) {
    try {
      this.poner(0);
      render.compile(this.raiz, this.camara, escena);
      const vistas = new Set();
      this.raiz.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) for (const tx of [m.map, m.alphaMap, m.emissiveMap, m.userData.rampa && m.userData.rampa.tex]) {
          if (tx && !vistas.has(tx)) { vistas.add(tx); render.initTexture(tx); }
        }
      });
      if (this.particulas) for (const tx of this.particulas.texturas.values()) render.initTexture(tx);
      if (this.sombras) for (const tx of this.sombras.texturasParaSubir()) render.initTexture(tx);
    } catch (e) { console.warn(e); }
    // con los sombreadores de VR (O-331), una pasada a 1x1 con todo a la vista: sube a la grafica
    // sus mallas (las de las particulas falsas, repetidas, son grandes) y no hay tirones cuando
    // aparecen a mitad de la animacion (medido: cuadros de 40-90 ms sin ella)
    // (en un pixel de donde pinte ahora, como el calentado del Estudio: en otro destino three
    // compilaria otros programas)
    if (this.sombras && render && typeof render.setScissorTest === "function" && typeof render.render === "function") {
      const ocultos = [], vp = new THREE.Vector4(), ti = new THREE.Vector4(), conTijera = render.getScissorTest(), borrar = render.autoClear;
      let padre = null;
      render.getViewport(vp); render.getScissor(ti);
      try {
        this.raiz.traverse(o => {
          if (!o.visible) { ocultos.push(o); o.visible = true; }
          if (o.isMesh) for (const m of [].concat(o.material)) if (!m.visible) { ocultos.push(m); m.visible = true; }
        });
        render.setViewport(vp.x, vp.y, 1, 1); render.setScissor(vp.x, vp.y, 1, 1); render.setScissorTest(true);
        render.autoClear = false;
        // dentro de la escena donde se vera (sus luces y su niebla: los mismos programas)
        padre = this.raiz.parent;
        if (escena && escena.isScene && padre !== escena) escena.add(this.raiz);
        render.render(escena && escena.isScene ? escena : this.raiz, this.camara);
      } catch (e) { console.warn(e); }
      finally {
        if (escena && escena.isScene && padre !== escena) { if (padre) padre.add(this.raiz); else this.raiz.removeFromParent(); }
        render.autoClear = borrar;
        render.setViewport(vp); render.setScissor(ti); render.setScissorTest(conTijera);
        for (const o of ocultos) o.visible = false;
        this.corte = null; this.poner(0);
      }
    }
  }

  // suelta lo suyo: los clones de los modelos comparten mallas y texturas con la cache (no
  // se tocan); lo de escena.glb y los huesos de los clones, si
  soltar() {
    this.soltado = true;
    if (this.particulas) { this.particulas.soltar(); this.particulas = null; }
    this.mezcla.stopAllAction();
    for (const a of Object.values(this.actores)) {
      if (a.mezcla) a.mezcla.stopAllAction();
      if (a.nodo && a.mezcla) a.nodo.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
      if (a.caras) a.caras.soltar();
    }
    // las copias de los materiales de los actores tenidos (O-345)
    for (const T of this._tintes || []) {
      for (const m of T.propios) m.dispose();
    }
    // los materiales de VR y lo suyo; los del glb que sustituyeron, con sus texturas (O-331)
    if (this.sombras) {
      for (const sm of this.sombras.materiales.values()) {
        const b = sm.userData.base;
        if (b) { for (const k of ["map", "alphaMap", "emissiveMap"]) if (b[k]) b[k].dispose(); b.dispose(); }
      }
      this.sombras.soltar();
    }
    this.raiz.removeFromParent();
    const texturas = new Set();
    this.escena.scene.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        for (const k of ["map", "alphaMap", "emissiveMap"]) if (m[k]) texturas.add(m[k]);
        if (m.userData.rampa && m.userData.rampa.tex) texturas.add(m.userData.rampa.tex);
        m.dispose();
      }
    });
    for (const tx of texturas) tx.dispose();
  }
}

// O-332: el aura del keshin en el campo, como en VR (battle/common/ega_kNNNNNNa: llamas del color
// del keshin alrededor del jugador y el keshin de luz, de medio cuerpo, encima; mientras dura).
// ievr/g4evento.convertir_aura la deja como un evento de un efecto sin camara con tres cortes
// seguidos: "in" (sale, 0,33 s), "loop" (en bucle) y "out" (se va, 0,5 s). Aqui: EventoVR con sus
// sombreadores y sus particulas de VR; el tiempo de los cortes va en bucle y el de las particulas
// seguido (si no, cada vuelta las vaciaria), que emiten mientras dura y paran al irse.
export class AuraVR {
  static async cargar(codigo, { base = EVENTO_VR.raiz } = {}) {
    return new AuraVR(await EventoVR.cargar(codigo, { base }));
  }

  constructor(ev) {
    this.ev = ev; this.raiz = ev.raiz;
    // (la proyeccion la pone quien pinta el campo, con su camara)
    ev.sinCamara = true;
    const corte = n => ev.cortes.find(c => c.nombre === n) || null, fps = EVENTO_VR.fps;
    const dur = c => (c ? (c.fin - c.ini) / fps : 0);
    this.cIn = corte("in"); this.cBucle = corte("loop"); this.cOut = corte("out");
    this.dIn = dur(this.cIn); this.dBucle = dur(this.cBucle); this.dOut = dur(this.cOut);
    this.t0 = null; this.tSale = null; this.acabada = false;
    if (ev.particulas) for (const e of ev.particulas.emisores) e.ventanas = e.ventanas.length ? [[0, Infinity]] : [];
    // el keshin de luz: los huesos _NNN_chara_NN del aura (en VR los pone donde esta el keshin,
    // FollowKeshinAuraEffectComponent; en el efecto estan en el suelo, en medio, con escala 0,12) y
    // lo que mide su malla
    this.bustos = [];
    for (const [nombre, o] of ev.nodos) if (/\|_\d+_chara_\d+$/.test(nombre) && !o.isMesh) this.bustos.push({ o, escala: o.scale.x || 1 });
    let alto = 0;
    for (const [nombre, o] of ev.nodos) if (o.isMesh && /_chara_/.test(nombre) && o.geometry) { o.geometry.computeBoundingBox(); alto = Math.max(alto, o.geometry.boundingBox.max.y); }
    this.altoBusto = alto || 7.4;
  }
  // el keshin de luz en (x, y, z) del aura, mirando a giro, de alto `alto` (en las medidas del aura)
  ponerBusto(x, y, z, giro, alto) {
    for (const b of this.bustos) { b.o.position.set(x, y, z); b.o.rotation.set(0, giro, 0); b.o.scale.setScalar(alto / this.altoBusto); }
  }

  // empieza (sale con su "in") en el instante t (s, el reloj de quien la pinta)
  empezar(t) { this.t0 = t; this.tSale = null; this.acabada = false; if (this.ev.particulas) this.ev.particulas.vaciar(); }
  // se va con su "out" desde t (las particulas dejan de salir)
  salir(t) {
    if (this.tSale !== null || this.t0 === null) return;
    this.tSale = t;
    if (this.ev.particulas) for (const e of this.ev.particulas.emisores) e.ventanas = [];
  }
  // en el instante t: el corte que toca y las particulas con el tiempo seguido
  poner(t) {
    if (this.t0 === null) this.empezar(t);
    const s = Math.max(0, t - this.t0), fps = EVENTO_VR.fps;
    let te;
    if (this.tSale !== null) {
      const u = Math.max(0, t - this.tSale);
      if (u >= this.dOut) this.acabada = true;
      te = (this.cOut ? this.cOut.ini / fps : 0) + Math.min(u, Math.max(0, this.dOut - 1e-3));
    } else if (s < this.dIn || !this.cBucle || this.dBucle <= 0) te = Math.min(s, this.dIn);
    else te = this.cBucle.ini / fps + ((s - this.dIn) % this.dBucle);
    this.ev.poner(te, s);
    return te;
  }
  soltar() { this.ev.soltar(); }
}
