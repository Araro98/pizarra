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
    this.corte = null;
    this.particulas = null;
  }

  // donde esta y hacia donde mira el que hace la tecnica (s00) al empezar, en el marco del
  // evento: para ponerlo en su sitio del campo. null si no sale
  ancla() {
    if (this._ancla !== undefined) return this._ancla;
    this._ancla = null;
    const a = this.actores.s00;
    if (!a || !a.clips) return null;
    const c = a.clips[this.cortes[0].nombre] || Object.values(a.clips)[0];
    if (!c) return null;
    const pos = c.tracks.find(t => t.name === "output.position"), rot = c.tracks.find(t => t.name === "output.quaternion");
    if (!pos) return null;
    const f = new THREE.Vector3(0, 0, 1);
    if (rot) f.applyQuaternion(new THREE.Quaternion(rot.values[0], rot.values[1], rot.values[2], rot.values[3]));
    this._ancla = { x: pos.values[0], z: pos.values[2], giro: Math.hypot(f.x, f.z) > 1e-3 ? Math.atan2(f.x, f.z) : 0 };
    return this._ancla;
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

  // pone todo en el instante t (segundos desde el principio del evento)
  poner(t) {
    const g = Math.max(0, Math.min(Math.round(t * EVENTO_VR.fps), this.fin));
    const c = this.cortePara(g), f = g - c.ini;
    const tl = f / EVENTO_VR.fps;
    cuadroNuevo();
    if (this.corte !== c.nombre) {
      this.corte = c.nombre;
      this.mezcla.stopAllAction();
      if (this.clips[c.nombre]) {
        const ac = this.mezcla.clipAction(this.clips[c.nombre]);
        ac.clampWhenFinished = true; ac.setLoop(THREE.LoopOnce, 1); ac.play();
      }
      for (const a of Object.values(this.actores)) {
        if (!a.mezcla) continue;
        a.mezcla.stopAllAction();
        const clip = a.clips[c.nombre];
        if (a.nodo) a.nodo.visible = !!clip;
        if (clip) { const ac = a.mezcla.clipAction(clip); ac.clampWhenFinished = true; ac.setLoop(THREE.LoopOnce, 1); ac.play(); }
      }
    }
    this.mezcla.setTime(tl);
    for (const a of Object.values(this.actores)) if (a.mezcla && a.clips[c.nombre]) a.mezcla.setTime(tl);
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
    // mallas de los efectos que se ven o no (G4VS)
    for (const [nodos, desde, lista] of this._mallas[c.nombre] || []) {
      const v = !!lista[Math.min(Math.max(0, f - desde), lista.length - 1)];
      for (const o of nodos) o.visible = v;
    }
    // la camara de VR: el nodo "camara" (posicion y giro ya puestos) y su fov vertical
    this.raiz.updateMatrixWorld(true);
    if (this.nodoCamara) {
      this.nodoCamara.matrixWorld.decompose(this.camara.position, this.camara.quaternion, this.camara.scale);
      this.camara.scale.set(1, 1, 1);
      const cam = (this.j.camara || {})[c.nombre];
      if (cam && cam.fov) { const fv = cam.fov[Math.min(f, cam.fov.length - 1)]; if (fv > 0 && fv !== this.camara.fov) { this.camara.fov = fv; this.camara.updateProjectionMatrix(); } }
      this.camara.updateMatrixWorld(true);
    }
    // la proyeccion para los sombreadores de VR (O-331)
    if (this.sombras) ponerCamara(this.camara);
    // las particulas de VR, con los huesos del efecto ya en su sitio (O-330)
    if (this.particulas) this.particulas.poner(Math.max(0, Math.min(t, this.fin / EVENTO_VR.fps)));
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
    if (this.particulas) { this.particulas.soltar(); this.particulas = null; }
    this.mezcla.stopAllAction();
    for (const a of Object.values(this.actores)) {
      if (a.mezcla) a.mezcla.stopAllAction();
      if (a.nodo && a.mezcla) a.nodo.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
      if (a.caras) a.caras.soltar();
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
