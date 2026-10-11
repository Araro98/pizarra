/* Las particulas de VR en las animaciones de VR (NOTAS O-330): las chispas, llamitas sueltas,
   polvo, destellos y las rayas del aura del balon de cada supertecnica. Son los emisores de VR
   (.ptlb del juego) que ievr/g4evento.py deja descifrados en escena.json (particulas[efecto]:
   de que hueso del efecto salen, en que clips y cuando, cuantas por segundo, su vida, su forma,
   su velocidad y gravedad, su tamano, color y transparencia con la vida, su giro y su hoja de
   fotogramas). Un sistema propio: por emisor una malla de quads instanciados (los atributos en
   la grafica, en arrays fijos: nada de objetos nuevos por cuadro) que se mueven en la CPU a
   pasos de como mucho 1/30 s; con tope de particulas vivas para no bajar de 30 FPS.
   Lo usa el reproductor de los eventos (partido-eventosvr.js): ParticulasVR.cargar() con el
   resto del evento, poner(t) en cada cuadro despues de mover los huesos y soltar() al acabar.
   Este modulo no toca window ni document al cargarse. */
import * as THREE from "./partido-three.module.js";

// tope: particulas vivas entre todos los emisores de un evento (se ve uno a la vez);
// porEmisor: las de un emisor (VR dice las suyas, casi siempre menos); paso: el paso mas largo
// de la simulacion
export const PARTICULAS_VR = { tope: 3000, porEmisor: 600, paso: 1 / 30, fps: 60 };
// las que pasan pegadas a la camara (a menos de `cerca` m se apagan; a menos de `pegada`, fuera)
// y ninguna mas grande que `pantalla` del alto de la pantalla: una gota a 2 cm de la camara la
// tapaba entera decenas de veces (Gran tifon: de 1 a 85 ms por cuadro con la grafica de software)
const CERCA = { pegada: 0.15, cerca: 0.8, pantalla: 0.35 };
// el color del aura del balon por elemento si escena.json no lo dice (la rampa de Fuego)
const ELEMENTO_POR_DEFECTO = "Fuego";
const MUESTRAS = 32;

// --- curvas: [[t, v...]...] a una tabla de MUESTRAS + 1 valores (se leen con interpolacion)
function valorEn(c, u, col, defecto) {
  if (!c || !c.length) return defecto;
  if (u <= c[0][0]) return c[0][col];
  for (let i = 1; i < c.length; i++) {
    if (u <= c[i][0]) {
      const a = c[i - 1], b = c[i], d = b[0] - a[0];
      return d > 1e-6 ? a[col] + (b[col] - a[col]) * (u - a[0]) / d : b[col];
    }
  }
  return c[c.length - 1][col];
}
function tabla(c, col, defecto) {
  const t = new Float32Array(MUESTRAS + 1);
  for (let k = 0; k <= MUESTRAS; k++) t[k] = valorEn(c, k / MUESTRAS, col, defecto);
  return t;
}
function leer(t, u) {
  const x = (u <= 0 ? 0 : u >= 1 ? 1 : u) * MUESTRAS, i = Math.min(MUESTRAS - 1, x | 0), f = x - i;
  return t[i] + (t[i + 1] - t[i]) * f;
}
// un azar repetible por particula (asi dos PC no necesitan lo mismo: solo es lo que se ve)
let SEMILLA = 12345;
function azar() { SEMILLA = (SEMILLA * 1664525 + 1013904223) >>> 0; return SEMILLA / 4294967296; }

const VERT = `
attribute vec3 iCentro;
attribute vec3 iEje;
attribute vec2 iTam;
attribute vec4 iColor;
attribute vec2 iGiroCuadro;
uniform vec2 rejilla;
uniform float orienta;
uniform vec3 cerca;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4( iCentro, 1.0 );
  float z = -mv.z;
  // pegadas a la camara (o detras): fuera; cerca, se apagan; y como mucho cerca.z de la pantalla
  float tope = cerca.z * 2.0 * max( z, 0.0 ) / projectionMatrix[ 1 ][ 1 ];
  vec2 tam = min( iTam, vec2( tope ) ) * step( cerca.x, z );
  vec2 c = position.xy * tam;
  if ( orienta > 1.5 ) {
    // a lo largo de su velocidad (chispas, rayas): el alto del quad va por la direccion en
    // pantalla, desde la particula hacia delante (asi salen en estrella de donde nacen, como
    // las rayas del aura del balon contra la mano en VR)
    vec2 d = ( modelViewMatrix * vec4( iEje, 0.0 ) ).xy;
    float l = length( d );
    d = l > 1e-5 ? d / l : vec2( 0.0, 1.0 );
    mv.xy += vec2( d.y, -d.x ) * c.x + d * ( c.y + 0.5 * tam.y );
  } else {
    float s = sin( iGiroCuadro.x ), k = cos( iGiroCuadro.x );
    mv.xy += vec2( k * c.x - s * c.y, s * c.x + k * c.y );
  }
  gl_Position = projectionMatrix * mv;
  float col = mod( iGiroCuadro.y, rejilla.x ), fila = floor( iGiroCuadro.y / rejilla.x + 0.001 );
  vUv = ( vec2( col, rejilla.y - 1.0 - fila ) + position.xy + 0.5 ) / rejilla;
  vColor = vec4( iColor.rgb, iColor.a * smoothstep( cerca.x, cerca.y, z ) );
}`;
const FRAG = `
uniform sampler2D mapa;
uniform float conAlfa;
uniform float suma;
uniform float conRampa;
uniform vec3 rampa[ 8 ];
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 tx = texture2D( mapa, vUv );
  float k = max( tx.r, max( tx.g, tx.b ) );
  float a = ( conAlfa > 0.5 ? tx.a : k ) * vColor.a;
  vec3 rgb = tx.rgb;
  if ( conRampa > 0.5 ) {
    // el aura del balon: la forma (gris) elige el color en la rampa de su elemento (blanco en
    // el centro, el color del elemento en los bordes)
    float x = clamp( 1.0 - k, 0.0, 1.0 ) * 7.0;
    int i = int( floor( x ) );
    vec3 r0 = rampa[ 0 ], r1 = rampa[ 0 ];
    for ( int j = 0; j < 7; j++ ) if ( j == i ) { r0 = rampa[ j ]; r1 = rampa[ j + 1 ]; }
    if ( i >= 7 ) { r0 = rampa[ 7 ]; r1 = rampa[ 7 ]; }
    rgb = mix( r0, r1, fract( x ) );
    a = k * vColor.a;
  }
  rgb *= vColor.rgb;
  if ( a < 0.004 ) discard;
  // sumar luz "en pantalla" como los efectos (no pasa de blanco) o mezcla normal
  gl_FragColor = suma > 0.5 ? vec4( clamp( rgb * a, 0.0, 1.0 ), 1.0 ) : vec4( rgb, a );
  #include <colorspace_fragment>
}`;

// las cuentas de cada cuadro, sin crear objetos
const M = new THREE.Matrix4(), INV = new THREE.Matrix4(), V = new THREE.Vector3(), D = new THREE.Vector3();
const ZANCADA = 14, K = new THREE.Color();

class Emisor {
  constructor(sis, d, nodo, textura, rampa, ventanas, borrar) {
    this.sis = sis; this.d = d; this.nodo = nodo; this.ventanas = ventanas; this.borrar = borrar;
    const cap = this.cap = Math.max(1, Math.min(PARTICULAS_VR.porEmisor, Math.ceil((d.max || 20) * 1.25) + 2));
    // por particula: posicion, velocidad inicial, la de la gravedad, edad, vida y sus azares
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.g = new Float32Array(cap); this.edad = new Float32Array(cap); this.vida = new Float32Array(cap);
    this.esc = new Float32Array(cap * 3); this.mix = new Float32Array(cap * 3);
    this.giro = new Float32Array(cap); this.vgiro = new Float32Array(cap); this.cuadro0 = new Float32Array(cap);
    this.n = 0; this.acum = 0;
    // las curvas, a tablas
    const pe = d.esc_por_eje;
    this.tAlfa = tabla(d.alfa, 1, 1); this.tAlfa2 = tabla(d.alfa, 2, 1);
    this.tR = tabla(d.rgb, 1, 1); this.tG = tabla(d.rgb, 2, 1); this.tB = tabla(d.rgb, 3, 1);
    this.tR2 = tabla(d.rgb, 4, 1); this.tG2 = tabla(d.rgb, 5, 1); this.tB2 = tabla(d.rgb, 6, 1);
    this.tEx = tabla(d.escala, 1, 1); this.tEy = tabla(d.escala, pe ? 2 : 1, 1);
    this.tEx2 = tabla(d.escala, 4, 1); this.tEy2 = tabla(d.escala, pe ? 5 : 4, 1);
    this.tVel = tabla(d.vel_curva, 1, 1); this.tRitmo = tabla(d.ritmo_curva, 1, 1);
    const uv = d.uv || [0, 1, 1, 1, 0];
    this.modoUv = uv[0]; this.cols = uv[0] ? uv[1] : 1; this.filas = uv[0] ? uv[2] : 1; this.vueltas = uv[3] || 1; this.filaAzar = !!uv[4];
    // la malla: un quad instanciado
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    // los atributos de cada particula juntos en un solo buffer (centro 3, eje 3, tamano 2, color
    // 4, giro y cuadro 2): una sola subida a la grafica por emisor y cuadro
    this.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * ZANCADA), ZANCADA);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    for (const [nombre, n, o] of [["iCentro", 3, 0], ["iEje", 3, 3], ["iTam", 2, 6], ["iColor", 4, 8], ["iGiroCuadro", 2, 12]])
      geo.setAttribute(nombre, new THREE.InterleavedBufferAttribute(this.buf, n, o));
    // (para quitar una sin crear arrays: los de 3 y los de 1 por particula)
    this._de3 = [this.p, this.v, this.esc, this.mix];
    this._de1 = [this.g, this.edad, this.vida, this.giro, this.vgiro, this.cuadro0];
    geo.instanceCount = 0;
    const suma = d.mezcla !== "normal";
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      uniforms: {
        mapa: { value: textura }, rejilla: { value: new THREE.Vector2(this.cols, this.filas) },
        orienta: { value: d.orienta === 2 ? 2 : 1 }, conAlfa: { value: d.textura_alfa ? 1 : 0 },
        cerca: { value: new THREE.Vector3(CERCA.pegada, CERCA.cerca, CERCA.pantalla) },
        suma: { value: suma ? 1 : 0 }, conRampa: { value: rampa ? 1 : 0 },
        rampa: { value: Array.from({ length: 8 }, () => new THREE.Vector3(1, 1, 1)) },
      },
    });
    this._u = mat.uniforms;
    if (suma) {
      mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcColorFactor;
    }
    this.ponerRampa(rampa);
    this.malla = new THREE.Mesh(geo, mat);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = 5;
    this.malla.name = "particulas_" + (d.nodo || "");
  }

  // los colores del aura del balon (8, de blanco al del elemento; null: sin rampa). La rampa
  // viene de un PNG: a lineal, como las texturas
  ponerRampa(rampa) {
    const U = this._u;
    U.conRampa.value = rampa ? 1 : 0;
    if (rampa) for (let i = 0; i < 8; i++) { const c = rampa[Math.min(i, rampa.length - 1)]; K.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); U.rampa.value[i].set(K.r, K.g, K.b); }
  }

  vaciar() { this.sis.vivas -= this.n; this.n = 0; this.acum = 0; this.malla.geometry.instanceCount = 0; }

  // cuantas salen entre t0 y t1 (segundos del evento)
  _cuantas(t0, t1, dist) {
    const d = this.d;
    let n = 0;
    for (const [ini, fin] of this.ventanas) {
      const a = Math.max(t0, ini), b = Math.min(t1, fin);
      if (b <= a) continue;
      if (d.por_metro) n += d.ritmo * dist * (b - a) / Math.max(1e-6, t1 - t0);
      else {
        const u = d.dur > 0 ? ((a + b) / 2 - ini) / d.dur : 0;
        n += d.ritmo * leer(this.tRitmo, d.bucle ? u % 1 : u) * (b - a);
      }
    }
    return n;
  }

  // una nueva en la posicion del hueso (M: su matriz en el marco del evento); f: donde estaba
  // el hueso en el paso de antes (las estelas no salen a saltos)
  _nacer(f, x0, y0, z0) {
    if (this.n >= this.cap || this.sis.vivas >= PARTICULAS_VR.tope) return;
    const d = this.d, i = this.n++, fo = d.forma || {}, e = M.elements;
    this.sis.vivas++;
    // la forma: bola (hacia fuera), aro (en el plano XZ, hacia fuera) o cono (por +Y)
    let dx, dy, dz, r = fo.radio || 0;
    if (fo.tipo === 2) {
      const ca = Math.cos((fo.angulo || 0) * Math.PI / 180), c = 1 - azar() * (1 - ca), s = Math.sqrt(Math.max(0, 1 - c * c)), fi = azar() * 2 * Math.PI;
      dx = s * Math.cos(fi); dy = c; dz = s * Math.sin(fi);
    } else if (fo.tipo === 1) {
      const fi = azar() * 2 * Math.PI; dx = Math.cos(fi); dy = 0; dz = Math.sin(fi);
    } else {
      const z = azar() * 2 - 1, fi = azar() * 2 * Math.PI, s = Math.sqrt(1 - z * z);
      dx = s * Math.cos(fi); dy = z; dz = s * Math.sin(fi); r *= Math.cbrt(azar());
    }
    const es = fo.escala || [1, 1, 1];
    V.set(dx * r * es[0], dy * r * es[1], dz * r * es[2]).applyMatrix4(M);
    const p = this.p, k = i * 3;
    p[k] = V.x + (x0 - e[12]) * (1 - f); p[k + 1] = V.y + (y0 - e[13]) * (1 - f); p[k + 2] = V.z + (z0 - e[14]) * (1 - f);
    D.set(dx, dy, dz).transformDirection(M);
    const vel = d.vel[0] + (d.vel[1] - d.vel[0]) * azar();
    this.v[k] = D.x * vel; this.v[k + 1] = D.y * vel; this.v[k + 2] = D.z * vel;
    this.g[i] = 0; this.edad[i] = 0;
    this.vida[i] = Math.max(0.02, d.vida[0] + (d.vida[1] - d.vida[0]) * azar());
    const a0 = azar(), mn = d.esc_min, mx = d.esc_max;
    for (let j = 0; j < 3; j++) { const a = d.esc_mismo_azar ? a0 : azar(); this.esc[k + j] = mn[j] + (mx[j] - mn[j]) * a; }
    this.mix[k] = d.alfa_azar ? azar() : 0; this.mix[k + 1] = d.rgb_azar ? azar() : 0; this.mix[k + 2] = d.esc_curvas_azar ? azar() : 0;
    this.giro[i] = (d.giro[0] + azar() * d.giro[1]) * Math.PI / 180;
    this.vgiro[i] = (d.giro_vel[0] + (d.giro_vel[1] - d.giro_vel[0]) * azar()) * Math.PI / 180;
    const nc = this.cols * this.filas;
    this.cuadro0[i] = this.modoUv === 1 ? Math.floor(azar() * nc) : this.modoUv === 2 && this.filaAzar ? Math.floor(azar() * this.filas) * this.cols : 0;
  }

  // mueve las vivas h segundos (y quita las que se acaban)
  _mover(h) {
    const grav = this.d.gravedad || 0, p = this.p, v = this.v;
    for (let i = 0; i < this.n; i++) {
      const e = (this.edad[i] += h);
      if (e >= this.vida[i]) { this._quitar(i); i--; continue; }
      const k = i * 3, sv = leer(this.tVel, e / this.vida[i]);
      this.g[i] -= grav * h;
      p[k] += v[k] * sv * h; p[k + 1] += (v[k + 1] * sv + this.g[i]) * h; p[k + 2] += v[k + 2] * sv * h;
      this.giro[i] += this.vgiro[i] * h;
    }
  }
  _quitar(i) {
    const u = --this.n;
    this.sis.vivas--;
    if (i === u) return;
    for (const a of this._de3) { a[i * 3] = a[u * 3]; a[i * 3 + 1] = a[u * 3 + 1]; a[i * 3 + 2] = a[u * 3 + 2]; }
    for (const a of this._de1) a[i] = a[u];
  }

  // los atributos de la grafica con las vivas
  _escribir() {
    const d = this.d, n = this.n, o = this.buf.array;
    const nc = this.cols * this.filas, w = d.tam[0], hh = d.tam[1];
    for (let i = 0; i < n; i++) {
      const k = i * 3, q = i * ZANCADA, u = this.edad[i] / this.vida[i], m0 = this.mix[k], m1 = this.mix[k + 1], m2 = this.mix[k + 2];
      o[q] = this.p[k]; o[q + 1] = this.p[k + 1]; o[q + 2] = this.p[k + 2];
      const sv = leer(this.tVel, u);
      o[q + 3] = this.v[k] * sv; o[q + 4] = this.v[k + 1] * sv + this.g[i]; o[q + 5] = this.v[k + 2] * sv;
      let ex = leer(this.tEx, u), ey = leer(this.tEy, u);
      if (m2) { ex += (leer(this.tEx2, u) - ex) * m2; ey += (leer(this.tEy2, u) - ey) * m2; }
      o[q + 6] = w * this.esc[k] * ex; o[q + 7] = hh * this.esc[k + 1] * ey;
      let a = leer(this.tAlfa, u), r = leer(this.tR, u), g = leer(this.tG, u), b = leer(this.tB, u);
      if (m0) a += (leer(this.tAlfa2, u) - a) * m0;
      if (m1) { r += (leer(this.tR2, u) - r) * m1; g += (leer(this.tG2, u) - g) * m1; b += (leer(this.tB2, u) - b) * m1; }
      o[q + 8] = r; o[q + 9] = g; o[q + 10] = b; o[q + 11] = a < 0 ? 0 : a > 1 ? 1 : a;
      o[q + 12] = this.giro[i];
      o[q + 13] = this.modoUv === 2
        ? (this.filaAzar ? this.cuadro0[i] + Math.min(this.cols - 1, Math.floor(u * this.cols * this.vueltas) % this.cols)
          : Math.min(nc - 1, Math.floor(u * nc * this.vueltas) % nc))
        : this.cuadro0[i];
    }
    const geo = this.malla.geometry;
    geo.instanceCount = n;
    if (!n) return;
    // el buffer entero (es pequeno): subir solo un trozo (addUpdateRange) hacia en Chrome cuadros
    // de 1 a 7 s de vez en cuando con muchos efectos delante (Gran tifon, medido)
    this.buf.needsUpdate = true;
  }
}

export class ParticulasVR {
  // las particulas de un evento ya cargado (EventoVR: su escena.json, sus nodos y su raiz):
  // sus texturas (part_<nombre>.png de la carpeta del evento). elemento: el del aura del balon
  // (si no, el de escena.json)
  static async cargar(ev, url, { elemento } = {}) {
    const j = ev.j, defs = [];
    for (const [efecto, lista] of Object.entries(j.particulas || {})) for (const d of lista || []) if (d && d.textura && d.vel) defs.push([efecto, d]);
    if (!defs.length) return null;
    const cargador = new THREE.TextureLoader(), texturas = new Map();
    await Promise.all([...new Set(defs.map(([, d]) => d.textura))].map(f => new Promise(ok => cargador.load(url + f, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; texturas.set(f, t); ok();
    }, undefined, () => ok()))));
    return new ParticulasVR(ev, defs, texturas, elemento || j.elemento || ELEMENTO_POR_DEFECTO);
  }

  constructor(ev, defs, texturas, elemento) {
    this.ev = ev; this.raiz = new THREE.Group(); this.raiz.name = "particulas_vr";
    this.texturas = texturas; this.emisores = []; this.t = null; this.pos = new Map(); this.vivas = 0; this.elemento = elemento;
    const j = ev.j, fps = PARTICULAS_VR.fps;
    for (const [efecto, d] of defs) {
      const tex = texturas.get(d.textura);
      const nodo = ev.nodos.get(THREE.PropertyBinding.sanitizeNodeName(efecto + "|" + d.nodo)) || ev.nodos.get(THREE.PropertyBinding.sanitizeNodeName(efecto));
      if (!tex || !nodo) continue;
      // cuando emite (segundos del evento): en cada corte en que el efecto toca uno de sus
      // clips, desde su retraso, lo que dure (en bucle, hasta que acaba el corte); y cuando se
      // borran las que queden (y deja de emitir)
      const ventanas = [], borrar = [], clips = ((j.actores || {})[efecto] || {}).clips || {};
      for (const c of j.cortes) {
        const cl = clips[c.nombre];
        if (!cl) continue;
        const t0 = (c.ini + (cl.desde || 0)) / fps, fin = c.fin / fps;
        if (d.clips.includes(cl.clip)) {
          const a = t0 + (d.retraso || 0), b = d.bucle ? fin : Math.min(fin, a + Math.max(d.dur || 0, 1 / fps));
          if (b > a) ventanas.push([a, b]);
        }
        for (const [clip, s] of d.parar || []) if (clip === cl.clip) borrar.push(t0 + s);
      }
      for (const v of ventanas) for (const tb of borrar) if (tb > v[0] && tb < v[1]) v[1] = tb;
      if (!ventanas.some(v => v[1] > v[0])) continue;
      const e = new Emisor(this, d, nodo, tex, this._rampa(d, elemento), ventanas, borrar);
      this.emisores.push(e);
      this.raiz.add(e.malla);
    }
    ev.raiz.add(this.raiz);
  }

  // la rampa del aura del balon de ese elemento (si no la hay, la de Fuego)
  _rampa(d, elemento) { return d.rampas ? (d.rampas[elemento] || d.rampas[ELEMENTO_POR_DEFECTO] || null) : null; }

  // otro elemento en un evento ya cargado (el color del aura del balon): para los eventos que
  // comparten tecnicas de varios elementos (24, las de keshin y alma), sin volver a leerlo
  ponerElemento(elemento) {
    if (!elemento || elemento === this.elemento) return;
    this.elemento = elemento;
    for (const e of this.emisores) if (e.d.rampas) e.ponerRampa(this._rampa(e.d, elemento));
  }

  // todas a cero (al volver atras o saltar)
  vaciar() {
    for (const e of this.emisores) e.vaciar();
    this.t = null;
  }

  // en el instante t del evento (segundos), con los huesos ya puestos (ev.raiz.updateMatrixWorld)
  poner(t) {
    INV.copy(this.ev.raiz.matrixWorld).invert();
    let cambia = false;
    if (this.t === null || t < this.t - 1e-4 || t - this.t > 0.5) {
      cambia = true;
      // volver atras o saltar (al empezar las cortas): se empieza de cero aqui
      this.vaciar();
      this.t = t;
      this._apuntar();
    }
    const dt = t - this.t;
    if (dt > 1e-6) {
      cambia = true;
      const pasos = Math.max(1, Math.ceil(dt / PARTICULAS_VR.paso)), h = dt / pasos;
      for (const e of this.emisores) {
        // donde estaba el hueso en el cuadro de antes y donde esta ahora: las que nacen en
        // medio, en medio (las estelas de un balon rapido no salen a saltos)
        const prev = this.pos.get(e.nodo);
        M.multiplyMatrices(INV, e.nodo.matrixWorld);
        const x0 = prev[0], y0 = prev[1], z0 = prev[2];
        const dist = Math.hypot(M.elements[12] - x0, M.elements[13] - y0, M.elements[14] - z0);
        for (let s = 0; s < pasos; s++) {
          const a = this.t + s * h, b = a + h;
          e._mover(h);
          e.acum += e._cuantas(a, b, dist / pasos);
          while (e.acum >= 1) { e.acum -= 1; e._nacer((s + azar()) / pasos, x0, y0, z0); }
          // (despues de nacer: las de este paso hasta ese momento tambien se van)
          for (const tb of e.borrar) if (tb > a && tb <= b) e.vaciar();
        }
      }
      this.t = t;
      this._apuntar();
    }
    // (con el reloj parado no se sube nada a la grafica)
    if (cambia) for (const e of this.emisores) e._escribir();
  }

  // donde esta ahora el hueso de cada emisor (en el marco del evento)
  _apuntar() {
    for (const e of this.emisores) {
      M.multiplyMatrices(INV, e.nodo.matrixWorld);
      let p = this.pos.get(e.nodo);
      if (!p) { p = new Float32Array(3); this.pos.set(e.nodo, p); }
      p[0] = M.elements[12]; p[1] = M.elements[13]; p[2] = M.elements[14];
    }
  }

  soltar() {
    this.vaciar();
    this.raiz.removeFromParent();
    for (const e of this.emisores) { e.malla.geometry.dispose(); e.malla.material.dispose(); }
    for (const t of this.texturas.values()) t.dispose();
    this.emisores = [];
  }
}
