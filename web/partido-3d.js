/* El campo 3D de abajo (NOTAS O-317; diseno de las pantallas como Galaxy, 1.3, 1.6,
   4.6, 5.1-5.5 y 7): se juega EN el 3D, como la tactil de Galaxy (O-307 puntos 1, 13
   y 15). Mundo3D: un solo WebGL para las dos pantallas (canvas #gl, detras de las dos)
   con tijera y dos escenas: Campo (abajo: el partido) y Estudio (arriba: los actores
   de las animaciones; la monta partido-escenas.js, O-320). Los modelos son los del juego de cada PC
   (datos/modelos3d, se sacan de la instalacion de cada uno y nunca se reparten; si no
   estan, una ficha de pie con su cara). three.js (MIT) en local.
   La camara (donde se pone, proyectar, aCampo) va en funciones puras sin DOM: la
   prueba (prueba-g2.js) las cuenta en node. Este modulo no toca window ni document al
   cargarse: solo dentro de Mundo3D.crear. */
import * as THREE from "./partido-three.module.js";
import { GLTFLoader } from "./partido-GLTFLoader.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";
import { mergeGeometries } from "./partido-BufferGeometryUtils.js";
import { prepararRopa, vestir, partesVestido } from "./partido-vestir.js";

// la camara de abajo (guia 7.1; diseno 5.3): 48 grados bajo la horizontal, FOV vertical
// de 25 (casi teleobjetivo: las bandas apenas convergen), 4:3 y a 53 m del punto
// mirado: en la fila del centro se ven 31 m de ancho y el circulo central sale como
// una elipse de razon 0,74. Nunca gira. En el penalti, mas baja y cerca, sin girar
// (b46, p24: estimado)
export const CAM = { inclinacion: 48, fov: 25, aspecto: 4 / 3, distancia: 53, near: 1, far: 260, penalti: { inclinacion: 35, distancia: 25 } };
// los jugadores de abajo, del tamano de los de Galaxy (cabezones de ~25 u en p01/p03,
// diseno 5.2 CRITICA): x2,2 los modelos de VR (de 1,65 a 2,4 m). alto: hasta la cabeza
// (lo usa el HUD). El cilindro invisible del rayo, el disco de los pies (~20x10 u, b50)
// y el cursor del portador (b04, b51), con la misma escala
export const FIGURA = { escala: 2.2, alto: 4.1, cilindro: { radio: 0.9, alto: 1.9 * 2.2 }, disco: 1.0, cursor: 2.1, balon: 0.35 };
// las animaciones de los modelos (las 4 que saca el conversor, ievr/g4.py). El Estudio de
// arriba (partido-escenas.js, O-320) usa las mismas
export const ANIM = { parado: "戦1立ち1L", correr: "戦1走り1L", tiro: "戦1シュート1", patada: "戦1キック1" };
// los clips de VR de los duelos, las paradas y el gol (diseno 6.6; banco del cuerpo de
// modelos3d/clips_c000101.txt). Los trae cada modelo desde VERSION_MODELO 3 (ievr/g4.py,
// O-323: Aaron dijo que si). El Estudio los usa si el modelo los trae (uno de antes, no: los
// 4 de ANIM movidos a mano)
export const ANIM_VR = {
  regateGana: "戦1すりぬけ1勝利", regatePierde: "戦1すりぬけ1敗北", romperGana: "戦1エラシコ1勝利1", romperPierde: "戦1エラシコ1敗北1",
  entrada: "戦1スライディング1", cargarGana: "戦1ショルダーチャージ1勝利1", cargarPierde: "戦1ショルダーチャージ1敗北1",
  robarGana: "戦1スチールダッシュ1勝利1", robarPierde: "戦1スチールダッシュ1敗北1", testarazo: "戦1Hシュート1前上1", volea: "戦1シュート3右",
  parar: "戦1GKキャッチ前", pararDer: "戦1GKキャッチ右", pararIzq: "戦1GKキャッチ左", despejar: "戦1GKパンチング前", encaja: "戦1GKキャッチミス前1",
  caido: "戦1うつ伏せダウン1", celebra: "戦1ゴール後走り喜び1入", lamenta: "戦1ゴール後その場がっかり1入", aturdido: "戦1スタン1", salto: "ジャンプ上1",
};
// el modelo 3D que se ve de un jugador: el de su forma con la hiper puesta (la armadura, el
// mixi max o el personaje del modo, O-327) o el de su cara, vestido con la equipacion de su
// equipo (O-334)
export function modeloDe(j) { return vestidoDe(j, (j && (j.modelo || j.cara)) || ""); }
// el modelo `cod` de un jugador (su cara de siempre, la de la forma de su modo o el de su
// armadura o mixi max) con la ropa que le toca con la equipacion de su equipo, en el diseno
// de su equipo y de portero si lo es (O-334): "<cod>_cuerpo+<ropa>+<dorsal>[c]"
// (partido-vestir.js). Sin ropa (los que llevan lo suyo, o un equipo de un Pizarra de antes),
// el modelo tal cual. j puede ser un jugador del partido o los datos de uno del banquillo
export function vestidoDe(j, cod) {
  if (!j || !cod || typeof REGLAS === "undefined" || !REGLAS.vestido) return cod || "";
  const f = j.formaHiper, base = (j.propio && j.propio.cara) || j.cara;
  const r = cod === base ? j.ropa : f && cod === (f.modelo || f.cara) ? f.ropa : cod === j.modeloHiper ? j.ropaHiper : null;
  const portero = j.esPortero !== undefined ? !!j.esPortero : j.posicion === "POR";
  return REGLAS.vestido(cod, REGLAS.ropaDe(r, j.diseno || 0, portero), j.dorsal, j.capitan);
}
// los ficheros que convierte el servidor de un modelo (vestido: el cuerpo y la ropa)
export function ficherosDe(cod) { return typeof REGLAS !== "undefined" && REGLAS.ficheros ? REGLAS.ficheros(cod) : (cod ? [cod] : []); }
// si estan ya en el servidor (hechos: Set) los ficheros de un modelo
function hechoEn(cod, hechos) { const f = ficherosDe(cod); return f.length > 0 && f.every(x => hechos.has(x)); }
// el keshin (o el alma) detras del que lo tiene puesto (O-327): a esta escala (los de VR miden
// 6-8 m: con la de las figuras taparian medio campo), algo detras y medio transparente, como
// la silueta de Galaxy
export const KESHIN = { escala: 1.0, detras: 1.6, opacidad: 0.55 };
// la calidad (diseno 7.4): el pixelRatio del 3D, las texturas de los modelos (7.3 bis)
// y los mezcladores a 30 por segundo en Baja
const CALIDAD = {
  alta: { ppp: dpr => Math.min(dpr, 1.5), textura: 512, mezcla: 0 },
  media: { ppp: () => 1, textura: 256, mezcla: 0 },
  baja: { ppp: () => 0.8, textura: 256, mezcla: 1 / 30 },
};
// el fondo de fuera de las pantallas (el de la pagina)
const FONDO = 0x0b0d12;

// --- la camara, en funciones puras (para la prueba en node) ------------------------------
const _v = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector2();
const SUELO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _porteria = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

export function nuevaCamara(aspecto = CAM.aspecto) { return new THREE.PerspectiveCamera(CAM.fov, aspecto, CAM.near, CAM.far); }
// la camara mirando al punto (x, y) del motor, con tu ataque (sentido h) hacia arriba.
// Del motor a three, x -> -x e y -> z (O-305): mirando hacia +z, la derecha de la
// pantalla es -x de three = +x del motor, la misma derecha que el 2D
export function ponerCamara(cam, x, y, h = 1, inclinacion = CAM.inclinacion, distancia = CAM.distancia) {
  const a = inclinacion * Math.PI / 180;
  cam.position.set(-x, distancia * Math.sin(a), y - h * distancia * Math.cos(a));
  cam.up.set(0, 1, 0);
  cam.lookAt(-x, 0, y);
  cam.updateMatrixWorld();
  return cam;
}
// del campo (m, h de alto) a la pantalla (px de ancho x alto): {px, py, dentro, detras}
export function proyectar(cam, x, y, h, ancho, alto, o = {}) {
  _v.set(-x, h || 0, y).applyMatrix4(cam.matrixWorldInverse);
  o.detras = _v.z > -cam.near * 0.5;           // detras de la camara: no se puede pintar
  _v.applyMatrix4(cam.projectionMatrix);
  o.px = (_v.x + 1) / 2 * ancho; o.py = (1 - _v.y) / 2 * alto;
  o.dentro = !o.detras && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1;
  return o;
}
// de la pantalla al suelo: el rayo de la camara contra y = 0 (si no lo corta, mirando
// al cielo, el punto del borde)
export function aCampo(cam, rayo, px, py, ancho, alto, o = {}) {
  _n.set(px / ancho * 2 - 1, -(py / alto) * 2 + 1);
  rayo.setFromCamera(_n, cam);
  if (rayo.ray.intersectPlane(SUELO, _q)) { o.x = -_q.x; o.y = _q.z; return o; }
  const d = rayo.ray.direction, l = Math.hypot(d.x, d.z) || 1;
  o.x = -(rayo.ray.origin.x + d.x / l * CAM.far); o.y = rayo.ray.origin.z + d.z / l * CAM.far;
  return o;
}
// la X del tiro (diseno 5.4 CRITICA): pulsar la red o la boca de la porteria (de pie)
// corta el suelo 2-3 m detras de la linea; la X sale de cortar el rayo con el plano de
// la linea de gol (y = gy, de 0 a 2,44 m). Fuera de la porteria, null
export function aPorteria(cam, rayo, px, py, ancho, alto, gy) {
  _n.set(px / ancho * 2 - 1, -(py / alto) * 2 + 1);
  rayo.setFromCamera(_n, cam);
  _porteria.constant = -gy;
  if (!rayo.ray.intersectPlane(_porteria, _q)) return null;
  if (_q.y < 0 || _q.y > 2.44 || Math.abs(_q.x) > REGLAS.PORTERIA / 2 + 0.6) return null;
  return -_q.x;
}

// --- la vista de abajo: la interfaz PANTALLA (diseno 1.3) --------------------------------
// aCampo, jugadorEn (rayo contra cilindros invisibles), proyectar (para el HUD), pulsar,
// apuntar, elegido, trazo, colocando, la camara (CamaraAbajo de partido-pantalla.js, la
// misma que la reserva 2D), ajustar, pintar y _sentido. Sin DOM: la prueba la usa en node
const MAT_RAYO = new THREE.MeshBasicMaterial({ visible: false });
let GEO_RAYO = null;
export class CampoAbajo3D {
  constructor(partido, yo = 0, op = {}) {
    this.p = partido; this.yo = yo; this.mundo = op.mundo || null;
    this.cam = nuevaCamara();
    this.camara = op.camara || new CamaraAbajo();
    this.rayo = new THREE.Raycaster(); this.rayo.layers.set(1);
    this.elegido = null; this.trazo = null; this.colocando = null;
    this.ondas = []; this.puntoTiro = null; this.quieto = !!op.quieto;
    this.ancho = op.ancho || 320; this.alto = op.alto || 240;
    this.alturaFigura = FIGURA.alto;
    // los cilindros del rayo, en la capa 1 de three (no se pintan), uno por jugador
    if (!GEO_RAYO) GEO_RAYO = new THREE.CylinderGeometry(FIGURA.cilindro.radio, FIGURA.cilindro.radio, FIGURA.cilindro.alto, 12).translate(0, FIGURA.cilindro.alto / 2, 0);
    this.cilindros = partido.jugadores.map(j => { const m = new THREE.Mesh(GEO_RAYO, MAT_RAYO); m.layers.set(1); m.userData.id = j.id; return m; });
    this._lista = []; this._cortes = []; this._a = {}; this._b = {}; this._c = {};
    this.camara.paso(0, partido, this._sentido());
    this.colocarCamara();
  }
  get cx() { return this.ancho / 2; }
  get cy() { return this.alto / 2; }
  // hacia donde ataca "yo": +1 si hacia +y. En la tanda, la porteria de la tanda arriba
  // para los dos, sin girar en cada penalti (O-315)
  _sentido() {
    if (this.p.sentidoPantalla) return this.p.sentidoPantalla(this.yo);
    const j = this.p.jugadores.find(q => q.lado === this.yo); return j ? j.dir : 1;
  }
  ajustar(ancho, alto) {
    if (ancho > 0 && alto > 0) { this.ancho = ancho; this.alto = alto; }
    this.cam.aspect = this.ancho / this.alto; this.cam.updateProjectionMatrix();
    this.colocarCamara();
  }
  colocarCamara() {
    const c = this.camara, pen = c.penalti ? CAM.penalti : CAM;
    ponerCamara(this.cam, c.x, c.y, this._sentido(), pen.inclinacion, pen.distancia);
  }
  actualizar(dt) { this.camara.paso(dt, this.p, this._sentido()); this.colocarCamara(); }
  proyectar(x, y, h = 0, o = {}) { return proyectar(this.cam, x, y, h, this.ancho, this.alto, o); }
  aPantalla(x, y) { return this.proyectar(x, y, 0); }
  aCampo(px, py) { return aCampo(this.cam, this.rayo, px, py, this.ancho, this.alto, {}); }
  aPorteria(px, py, gy) { return aPorteria(this.cam, this.rayo, px, py, this.ancho, this.alto, gy); }
  // el jugador de un lado en un punto de la pantalla (px CSS de #abajo), o null: el rayo
  // contra los cilindros (manda el corte mas cercano a la camara) y, si no corta
  // ninguno, el que tenga su segmento pies-cabeza proyectado a menos de 14 u
  jugadorEn(px, py, lado) {
    const js = this.p.enCampo ? this.p.enCampo() : this.p.jugadores, lista = this._lista;     // al expulsado no se le elige (O-311)
    lista.length = 0;
    for (const j of js) {
      if (lado !== undefined && j.lado !== lado) continue;
      const c = this.cilindros[j.id];
      if (!c) continue;
      c.position.set(-j.x, 0, j.y); c.updateMatrixWorld(); lista.push(c);
    }
    _n.set(px / this.ancho * 2 - 1, -(py / this.alto) * 2 + 1);
    this.rayo.setFromCamera(_n, this.cam);
    this._cortes.length = 0;
    const cortes = this.rayo.intersectObjects(lista, false, this._cortes);
    if (cortes.length) return this.p.jugadores[cortes[0].object.userData.id];
    const lim = 14 * this.ancho / 320;
    let mejor = null, md = lim;
    for (const j of js) {
      if (lado !== undefined && j.lado !== lado) continue;
      const A = this.proyectar(j.x, j.y, 0, this._a), B = this.proyectar(j.x, j.y, this.alturaFigura, this._b);
      if (A.detras) continue;
      const dx = B.px - A.px, dy = B.py - A.py, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - A.px) * dx + (py - A.py) * dy) / l2));
      const d = Math.hypot(A.px + dx * t - px, A.py + dy * t - py);
      if (d < md) { md = d; mejor = j; }
    }
    return mejor;
  }
  // la onda cian donde pulsas (O-306; la pinta HudAbajo)
  pulsar(q) {
    this.ondas.push({ x: q.x, y: q.y, t0: performance.now() / 1000 });
    if (this.ondas.length > 4) this.ondas.shift();
  }
  // donde pulsaste en la porteria al chutar: ahi va la X del tiro (solo se ve aqui)
  apuntar(x, y) {
    // tal cual (hasta lo que se toma por la porteria): la X dice adonde va (O-335)
    const m = REGLAS.APUNTAR ? REGLAS.APUNTAR.max : REGLAS.PORTERIA / 2 - 0.6;
    this.puntoTiro = { x: Math.max(-m, Math.min(m, x)), y, t: performance.now() / 1000 };
  }
  pintar(estado) { if (this.mundo) this.mundo.pintar(estado || {}); }
}

// --- lo que no cambia de un partido a otro: un renderer y el campo, una vez por pagina ----
let RENDER = null, CAMPO = null, CARGADOR = null, NIVEL_TEX = 256;
const CACHE = {};                         // url -> promesa del gltf (o null si no esta)
const COLA = { activos: 0, esperan: [] }; // como mucho 2 .glb cargandose a la vez (diseno 5.1)

function crearRender(canvas) {
  const dpr = window.devicePixelRatio || 1;
  // antialias solo en pantallas de poca densidad (en las de mas no hace falta y cuesta)
  const r = new THREE.WebGLRenderer({ canvas, antialias: dpr <= 1.25, alpha: false, powerPreference: "default" });
  r.outputColorSpace = THREE.SRGBColorSpace;
  // dos vistas por cuadro: las cuentas de 7.5 se ponen a cero a mano (diseno 7.4 CRITICA)
  r.info.autoReset = false;
  return r;
}

// un lienzo 2D (solo dentro de crear: en node no hay document)
function lienzo(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function texturaDe(c, repetir) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// un azar con semilla (el moteado y el publico salen siempre igual)
function azar(semilla) { let k = semilla; return () => (k = (k * 16807) % 2147483647) / 2147483647; }

// una cinta plana en el suelo de a a b (three: x, z) de ancho w, en el array de posiciones
function cinta(pos, ax, az, bx, bz, w, y) {
  const l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l * w / 2, nz = (bx - ax) / l * w / 2;
  pos.push(ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz,
    bx + nx, y, bz + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz);
}
function arcoCinta(pos, cx, cz, r, a0, a1, n, w, y) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    cinta(pos, cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r, w, y);
  }
}
function punto(pos, cx, cz, r, y) {
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2;
    pos.push(cx, y, cz, cx + Math.cos(b) * r, y, cz + Math.sin(b) * r, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  }
}
function geoDe(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// el campo de Galaxy (diseno 5.2): cesped moteado, las lineas en UNA malla, la pista
// roja teja, las porterias con su red, el estadio y el cielo. Todo una vez
function construirCampo(render) {
  const L = REGLAS.LARGO, A = REGLAS.ANCHO, escena = new THREE.Scene(), c = {};
  escena.background = new THREE.Color(0x0b0d12);
  // luces para los modelos (hemisferio + sol); sin sombras: los discos hacen de sombra
  escena.add(new THREE.HemisphereLight(0xffffff, 0x406040, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(-30, 60, 20); escena.add(sol);
  const plano = (w, h, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; escena.add(m); return m; };
  // el suelo del estadio, la pista (un anillo de 6 m) y el cesped: 3 m por las bandas y 4
  // por los fondos mas alla de las lineas (guia 3: #49A829 / #3B9B21, sin franjas)
  plano(400, 400, new THREE.MeshBasicMaterial({ color: 0x3a3f4a }), -0.03);
  plano(A + 6 + 12, L + 8 + 12, new THREE.MeshBasicMaterial({ color: new THREE.Color(GX.pista) }), -0.02);
  const cesped = lienzo(256, 256), cc = cesped.getContext("2d"), r1 = azar(11);
  cc.fillStyle = GX.cesped[1]; cc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    cc.globalAlpha = 0.12 + r1() * 0.3; cc.fillStyle = i % 4 ? GX.cesped[0] : "#2F8A1A";
    const x = r1() * 256, y = r1() * 256, w = 2 + r1() * 7, h = 1 + r1() * 4;
    cc.fillRect(x, y, w, h); if (x + w > 256) cc.fillRect(x - 256, y, w, h); if (y + h > 256) cc.fillRect(x, y - 256, w, h);
  }
  cc.globalAlpha = 1;
  const tc = texturaDe(cesped, true);
  tc.repeat.set((A + 6) / 8, (L + 8) / 8);
  tc.anisotropy = Math.min(8, render.capabilities.getMaxAnisotropy());
  c.cesped = plano(A + 6, L + 8, new THREE.MeshBasicMaterial({ map: tc }), -0.01);
  // las lineas: cintas planas de 0,16 m en una sola malla, nitidas a cualquier distancia
  const pos = [], w = 0.16, y = 0.012, X = x => -x;
  const linea = (x0, y0, x1, y1) => cinta(pos, X(x0), y0, X(x1), y1, w, y);
  linea(-A / 2, -L / 2, A / 2, -L / 2); linea(A / 2, -L / 2, A / 2, L / 2); linea(A / 2, L / 2, -A / 2, L / 2); linea(-A / 2, L / 2, -A / 2, -L / 2);
  linea(-A / 2, 0, A / 2, 0);
  arcoCinta(pos, 0, 0, 9.15, 0, Math.PI * 2, 64, w, y);
  punto(pos, 0, 0, 0.25, y);
  for (const s of [-1, 1]) {
    const f = s * L / 2;
    for (const [ax, ay] of [[REGLAS.AREA_X, REGLAS.AREA_Y], [9.16, 5.5]]) {
      linea(-ax, f, -ax, f - s * ay); linea(ax, f, ax, f - s * ay); linea(-ax, f - s * ay, ax, f - s * ay);
    }
    punto(pos, 0, f - s * 11, 0.2, y);
    // el semicirculo: lo que queda fuera del area
    const ang = Math.acos((REGLAS.AREA_Y - 11) / 9.15), base = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    arcoCinta(pos, 0, f - s * 11, 9.15, base - ang, base + ang, 24, w, y);
    // los cuartos de circulo de las esquinas, hacia dentro del campo
    for (const e of [-1, 1]) {
      const a = e > 0 ? 0 : Math.PI;
      let b = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (Math.abs(b - a) > Math.PI) b += b < a ? 2 * Math.PI : -2 * Math.PI;
      arcoCinta(pos, X(e * A / 2), f, 1, a, b, 8, w, y);
    }
  }
  escena.add(new THREE.Mesh(geoDe(pos), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })));
  // las porterias: postes y larguero blancos y la red de malla (un lienzo repetido)
  const blanco = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 });
  const palos = [], P = REGLAS.PORTERIA / 2, H = 2.44, F = 2;
  for (const s of [-1, 1]) {
    const z = s * L / 2;
    for (const x of [-P, P]) palos.push(new THREE.CylinderGeometry(0.09, 0.09, H, 10).translate(x, H / 2, z));
    palos.push(new THREE.CylinderGeometry(0.09, 0.09, 2 * P + 0.18, 10).rotateZ(Math.PI / 2).translate(0, H, z));
    // los de atras, mas finos
    for (const x of [-P, P]) palos.push(new THREE.CylinderGeometry(0.04, 0.04, H, 6).translate(x, H / 2, z + s * F));
  }
  escena.add(new THREE.Mesh(mergeGeometries(palos), blanco));
  const red = lienzo(64, 64), rc = red.getContext("2d");
  rc.strokeStyle = "rgba(255,255,255,.95)"; rc.lineWidth = 5;
  rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(64, 64); rc.moveTo(64, 0); rc.lineTo(0, 64); rc.stroke();
  const tr = texturaDe(red, true);
  const caras = [];
  const cara = (g, u, v) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u / 0.24, uv.getY(i) * v / 0.24); return g; };
  for (const s of [-1, 1]) {
    const z = s * L / 2;
    caras.push(cara(new THREE.PlaneGeometry(2 * P, H), 2 * P, H).translate(0, H / 2, z + s * F));
    caras.push(cara(new THREE.PlaneGeometry(2 * P, F), 2 * P, F).rotateX(Math.PI / 2).translate(0, H, z + s * F / 2));
    for (const x of [-P, P]) caras.push(cara(new THREE.PlaneGeometry(F, H), F, H).rotateY(Math.PI / 2).translate(x, H / 2, z + s * F / 2));
  }
  escena.add(new THREE.Mesh(mergeGeometries(caras), new THREE.MeshBasicMaterial({ map: tr, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
  // el estadio: un muro oscuro tras la pista y cuatro gradas inclinadas con publico (una
  // malla por material), un techo con focos y el cielo
  const publico = lienzo(512, 128), pc = publico.getContext("2d"), r2 = azar(5);
  pc.fillStyle = "#2a3350"; pc.fillRect(0, 0, 512, 128);
  const tonos = ["#e8e8f0", "#f0c060", "#d04040", "#4070d0", "#60b060", "#f08040", "#c0c0c8", "#303848", "#f0d0b0"];
  for (let i = 0; i < 1800; i++) { pc.fillStyle = tonos[(r2() * tonos.length) | 0]; pc.beginPath(); pc.ellipse(r2() * 512, r2() * 128, 2 + r2() * 1.5, 2.5 + r2() * 2, 0, 0, Math.PI * 2); pc.fill(); }
  const tp = texturaDe(publico, true);
  const borde = { x: A / 2 + 3 + 6 + 3, z: L / 2 + 4 + 6 + 3 }, gradas = [], muros = [], techos = [], focos = [];
  const lado = (largo, giro, dx, dz) => {
    const muro = new THREE.PlaneGeometry(largo, 2.2).translate(0, 1.1, 0);
    const grada = new THREE.PlaneGeometry(largo, 30).rotateX(-Math.PI / 3).translate(0, 2.2 + 15 * Math.sin(Math.PI / 6), -15 * Math.cos(Math.PI / 6));
    const uv = grada.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * largo / 16, uv.getY(i) * 30 / 4);
    const techo = new THREE.PlaneGeometry(largo + 30, 14).rotateX(Math.PI / 2).translate(0, 26, -33);
    for (const g of [muro, grada, techo]) g.rotateY(giro).translate(dx, 0, dz);
    muros.push(muro); gradas.push(grada); techos.push(techo);
    for (let i = -2; i <= 2; i++) focos.push(new THREE.BoxGeometry(2.4, 0.6, 1.2).translate(i * largo / 5.5, 25.6, -27).rotateY(giro).translate(dx, 0, dz));
  };
  lado(2 * borde.x, 0, 0, -borde.z); lado(2 * borde.x, Math.PI, 0, borde.z);
  lado(2 * borde.z, Math.PI / 2, -borde.x, 0); lado(2 * borde.z, -Math.PI / 2, borde.x, 0);
  // las gradas miran hacia dentro: el muro y la grada de cada lado, de cara al campo
  escena.add(new THREE.Mesh(mergeGeometries(muros), new THREE.MeshBasicMaterial({ color: 0x14306a, side: THREE.DoubleSide })));
  c.gradas = new THREE.Mesh(mergeGeometries(gradas), new THREE.MeshBasicMaterial({ map: tp, side: THREE.DoubleSide }));
  escena.add(c.gradas);
  escena.add(new THREE.Mesh(mergeGeometries(techos), new THREE.MeshBasicMaterial({ color: 0x22283a, side: THREE.DoubleSide })));
  escena.add(new THREE.Mesh(mergeGeometries(focos), new THREE.MeshBasicMaterial({ color: 0xfff8e0 })));
  c.publico = tp;
  const cielo = lienzo(1, 256), kc = cielo.getContext("2d"), gc = kc.createLinearGradient(0, 0, 0, 256);
  gc.addColorStop(0, "#1a3a8a"); gc.addColorStop(0.55, "#5aa0e8"); gc.addColorStop(1, "#cfe8ff");
  kc.fillStyle = gc; kc.fillRect(0, 0, 1, 256);
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 12), new THREE.MeshBasicMaterial({ map: texturaDe(cielo), side: THREE.BackSide, depthWrite: false }));
  escena.add(esfera);
  // lo fijo (suelo, pista, cesped, lineas, porterias, estadio y cielo) y las luces: el
  // Estudio de arriba los repite en mallas nuevas con la misma geometria y material, sin
  // subir nada mas a la grafica (O-320; diseno 4.6)
  c.fijas = escena.children.filter(o => o.isMesh);
  c.luces = escena.children.filter(o => o.isLight);
  // --- lo de debajo de los jugadores, fijo: se mueve y se escala cada cuadro (7.3) ---
  // los discos de los pies (b50): 22 circulos blancos (el borde) y 22 del color de su
  // lado encima, cada uno con su color (InstancedMesh: dos llamadas para los 22)
  const disco = (r) => new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2);
  c.bordes = new THREE.InstancedMesh(disco(FIGURA.disco), new THREE.MeshBasicMaterial({ color: 0xffffff }), 26);
  c.discos = new THREE.InstancedMesh(disco(FIGURA.disco * 0.86), new THREE.MeshBasicMaterial({ color: 0xffffff }), 26);
  for (const m of [c.bordes, c.discos]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; escena.add(m); }
  c.bordes.position.y = 0.02; c.discos.position.y = 0.024;
  for (let i = 0; i < 26; i++) c.discos.setColorAt(i, new THREE.Color(0xffffff));
  // el cursor del elegido o del tuyo con balon (b04, b51): aro azul a trozos con tres
  // pestanas blancas, dibujado una vez desde arriba; gira una vuelta por segundo
  const cur = lienzo(256, 256), ku = cur.getContext("2d");
  ku.translate(128, 128);
  for (let i = 0; i < 3; i++) {
    const a0 = i * Math.PI * 2 / 3 + 0.24, a1 = a0 + Math.PI * 2 / 3 - 0.48;
    ku.beginPath(); ku.arc(0, 0, 100, a0, a1);
    ku.strokeStyle = "#04206A"; ku.lineWidth = 42; ku.stroke();
    ku.strokeStyle = "#0A4BF1"; ku.lineWidth = 32; ku.stroke();
    ku.strokeStyle = "rgba(190,225,255,.9)"; ku.lineWidth = 5; ku.beginPath(); ku.arc(0, 0, 96, a0 + 0.05, a1 - 0.05); ku.stroke();
    ku.save(); ku.rotate(a0 - 0.24);
    ku.fillStyle = "#ffffff"; ku.strokeStyle = "#04206A"; ku.lineWidth = 5;
    ku.beginPath(); ku.moveTo(80, -19); ku.lineTo(124, -14); ku.lineTo(124, 14); ku.lineTo(80, 19); ku.closePath(); ku.fill(); ku.stroke();
    ku.restore();
  }
  c.cursor = new THREE.Mesh(new THREE.PlaneGeometry(2 * FIGURA.cursor, 2 * FIGURA.cursor).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texturaDe(cur), transparent: true, depthWrite: false }));
  c.cursor.position.y = 0.03; c.cursor.renderOrder = 1; escena.add(c.cursor);
  // la zona de tiro (b28): el cono cian a los dos palos (3 vertices que se mueven), la
  // linea amarilla con su borde oscuro hasta la X, la X y el rombo azul
  const cono = new THREE.BufferGeometry();
  cono.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3).setUsage(THREE.DynamicDrawUsage));
  c.cono = new THREE.Mesh(cono, new THREE.MeshBasicMaterial({ color: new THREE.Color(GX.cono), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  c.cono.frustumCulled = false; c.cono.position.y = 0.028; c.cono.renderOrder = 1; escena.add(c.cono);
  const tira = (color, alfa, orden) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: alfa, depthWrite: false })); m.renderOrder = orden; escena.add(m); return m; };
  c.lineaBorde = tira(GX.triangulo[1], 0.85, 2); c.lineaBorde.position.y = 0.032;
  c.linea = tira(GX.lineaTiro[0], 1, 3); c.linea.position.y = 0.034;
  const eq = lienzo(64, 64), ke = eq.getContext("2d");
  ke.lineCap = "round";
  for (const [col, g] of [["#6A4A00", 17], [GX.lineaTiro[1], 10]]) { ke.strokeStyle = col; ke.lineWidth = g; ke.beginPath(); ke.moveTo(12, 12); ke.lineTo(52, 52); ke.moveTo(52, 12); ke.lineTo(12, 52); ke.stroke(); }
  c.equis = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaDe(eq), depthWrite: false }));
  c.equis.scale.set(1.6, 1.3, 1); c.equis.renderOrder = 4; escena.add(c.equis);
  c.rombo = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), new THREE.MeshLambertMaterial({ color: new THREE.Color(GX.rombo), emissive: 0x0a2a80, flatShading: true }));
  c.rombo.scale.set(1, 1.15, 1); escena.add(c.rombo);
  // el destino del pase: un circulo cian en el suelo (guia 2; b53)
  c.destino = new THREE.Group();
  c.destino.add(new THREE.Mesh(new THREE.RingGeometry(0.78, 1.12, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a3a8a, transparent: true, opacity: 0.5, depthWrite: false })));
  const anillo = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.04, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(GX.paseAlto), transparent: true, depthWrite: false }));
  anillo.position.y = 0.004; c.destino.add(anillo);
  c.destino.position.y = 0.036; c.destino.renderOrder = 2; escena.add(c.destino);
  // la zona del saque (O-313, O-315): un plano con un lienzo que solo se repinta al
  // empezar la espera o un arrastre
  c.zonaLienzo = lienzo(512, 512);
  c.zona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texturaDe(c.zonaLienzo), transparent: true, depthWrite: false }));
  c.zona.position.y = 0.026; c.zona.renderOrder = 1; c.zona.visible = false; escena.add(c.zona);
  // el balon (una textura de balon) y su sombra
  const bl = lienzo(128, 64), kb = bl.getContext("2d");
  kb.fillStyle = "#ffffff"; kb.fillRect(0, 0, 128, 64);
  kb.fillStyle = "#1a1a1a";
  for (const [x, y] of [[16, 16], [48, 40], [80, 16], [112, 40], [16, 52], [80, 52], [48, 8], [112, 8]]) { kb.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; kb.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 6); } kb.closePath(); kb.fill(); }
  c.balon = new THREE.Mesh(new THREE.SphereGeometry(FIGURA.balon, 20, 14), new THREE.MeshLambertMaterial({ map: texturaDe(bl), emissive: 0x404040 }));
  escena.add(c.balon);
  c.sombra = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  c.sombra.position.y = 0.03; escena.add(c.sombra);
  // el balon de la animacion (O-319; diseno 5.2): otro igual (la misma malla y material),
  // oculto salvo en el vuelo del tiro y la repeticion del gol; el del motor se esconde
  c.balonAnim = new THREE.Mesh(c.balon.geometry, c.balon.material); c.balonAnim.visible = false; escena.add(c.balonAnim);
  c.sombraAnim = new THREE.Mesh(c.sombra.geometry, c.sombra.material); c.sombraAnim.visible = false; escena.add(c.sombraAnim);
  // el aura de la hiper (O-310): un brillo del color de su familia detras del jugador
  const au = lienzo(64, 64), ka = au.getContext("2d"), ga = ka.createRadialGradient(32, 32, 2, 32, 32, 31);
  ga.addColorStop(0, "rgba(255,255,255,.95)"); ga.addColorStop(0.45, "rgba(255,255,255,.55)"); ga.addColorStop(1, "rgba(255,255,255,0)");
  ka.fillStyle = ga; ka.fillRect(0, 0, 64, 64);
  c.texAura = texturaDe(au);
  c.escena = escena;
  return c;
}

// los modelos: como mucho 2 cargandose a la vez; cache por URL (el mismo gltf para
// todos los partidos de la pagina). Si no esta (404) o no se puede leer, la promesa se
// olvida: asi se vuelve a pedir cuando la cola del servidor lo haya convertido.
// Uno vestido (O-334): el cuerpo y la ropa por separado (en la cache, compartidos) y,
// con los dos, el jugador vestido (otra cache, por su codigo con el dorsal)
const VESTIDOS = {};
function pedirModelo(cara) {
  const v = partesVestido(cara);
  if (v) {
    if (!VESTIDOS[cara]) {
      VESTIDOS[cara] = Promise.all([pedirModelo(v.cuerpo), pedirModelo(v.ropa).then(g => (g ? prepararRopa(g) : null))])
        .then(([c, r]) => (c && r ? vestir(c, r, v) : null))
        .catch(e => { console.warn(e); return null; })
        .then(g => { if (!g) delete VESTIDOS[cara]; return g; });
    }
    return VESTIDOS[cara];
  }
  const url = "/api/partido/modelo/" + encodeURIComponent(cara) + ".glb";
  if (!CACHE[url]) {
    CACHE[url] = new Promise(ok => { COLA.esperan.push({ url, ok }); siguienteModelo(); })
      .then(g => { if (!g) delete CACHE[url]; return g; });
  }
  return CACHE[url];
}
function siguienteModelo() {
  while (COLA.activos < 2 && COLA.esperan.length) {
    const t = COLA.esperan.shift();
    COLA.activos++;
    if (!CARGADOR) CARGADOR = new GLTFLoader();
    const fin = g => { COLA.activos--; t.ok(g); siguienteModelo(); };
    CARGADOR.load(t.url, g => { try { reducirTexturas(g, NIVEL_TEX); } catch (e) { console.warn(e); } fin(g); }, undefined, () => fin(null));
  }
}
// las texturas de los modelos, a 512 (Alta) o 256 (Media y Baja) antes de subirlas: los
// 22 con las de 1024 eran ~410 MB en la grafica, que en un portatil es RAM (7.3 bis)
function reducirTexturas(gltf, max) {
  const hechas = new Map(), vistas = new Set();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of ["map", "normalMap", "emissiveMap", "roughnessMap", "metalnessMap", "aoMap", "alphaMap"]) {
        const t = m && m[k];
        if (!t || vistas.has(t)) continue;
        vistas.add(t);
        const im = t.image;
        if (!im || !im.width || !im.height) continue;
        if (hechas.has(im)) { t.image = hechas.get(im); t.needsUpdate = true; continue; }
        if (Math.max(im.width, im.height) <= max) continue;
        const f = max / Math.max(im.width, im.height), c = lienzo(Math.max(1, Math.round(im.width * f)), Math.max(1, Math.round(im.height * f)));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        hechas.set(im, c);
        t.image = c; t.needsUpdate = true;
      }
    }
  });
  for (const im of hechas.keys()) if (im.close) im.close();
}

// --- Mundo3D (diseno 1.6) -----------------------------------------------------------------
class Mundo {
  constructor(canvas, partido, yo, op) {
    if (!RENDER || RENDER.domElement !== canvas) RENDER = crearRender(canvas);   // lanza si no hay WebGL
    this.render = RENDER;
    this.p = partido; this.yo = yo;
    if (!CAMPO) CAMPO = construirCampo(RENDER);
    this.c = CAMPO;
    this.escenaCampo = CAMPO.escena;
    // arriba: el estudio de las animaciones (Escenas.preparar pone aqui el suyo, que es
    // uno por pagina, O-320)
    this.escenaEstudio = new THREE.Scene();
    this.camArriba = new THREE.PerspectiveCamera(40, 400 / 240, 0.3, 300);
    this.posiciones = null;          // E4: en la repeticion, las posiciones grabadas
    this.alPintarArriba = null;      // Escenas.pintar(m, estado.arriba) (O-320)
    // los ms del render de cada cuadro y las llamadas de dibujo de cada pantalla (el
    // contador de FPS y las medidas de diseno 7.5; O-321)
    this.msRender = 0; this.llamadas = { abajo: 0, arriba: 0 };
    this.quieto = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.abajo = new CampoAbajo3D(partido, yo, { mundo: this, quieto: this.quieto });
    this.camAbajo = this.abajo.cam;
    this.cerrado = false;
    this._t = null; this._fase = undefined; this._saque = 0;
    this._frustum = new THREE.Frustum(); this._m4 = new THREE.Matrix4(); this._esfera = new THREE.Sphere(new THREE.Vector3(), 3.2);
    this._mat = new THREE.Matrix4(); this._col = new THREE.Color(); this._zonaClave = "";
    this.figuras = partido.jugadores.map(j => this._figura(j));
    CAMPO.bordes.count = CAMPO.discos.count = Math.min(26, partido.jugadores.length);
    this._colores();
    this.calidad(op.calidad || "media");
    this._prepararModelos();
    // arriba, el Estudio (partido-escenas.js, otro modulo que llega despues): al estar,
    // pone alPintarArriba (O-320)
    if (typeof Consola !== "undefined" && Consola.modulo) Consola.modulo("Escenas").then(E => { if (!this.cerrado && E && E.preparar) E.preparar(this); });
  }

  // los colores de los discos: el tuyo azul, el rival rojo (GX.color, diseno 2.3)
  _colores() {
    this.p.jugadores.forEach((j, k) => this.c.discos.setColorAt(k, this._col.set(GX.color(j.lado, this.yo).disco)));
    this.c.discos.instanceColor.needsUpdate = true;
  }

  // donde cae cada pantalla (Consola.medidas): el lienzo entero y la vista de abajo
  ajustar(m) {
    if (!m) return;
    this.medidas = m;
    this.render.setSize(m.ancho, m.alto, false);
    this.abajo.ajustar(m.abajo.w, m.abajo.h);
  }
  // la calidad (diseno 7.4): el pixelRatio, el publico liso en Baja, las texturas de los
  // modelos que lleguen y los mezcladores
  calidad(nivel) {
    const q = CALIDAD[nivel] || CALIDAD.media;
    this.nivel = CALIDAD[nivel] ? nivel : "media";
    NIVEL_TEX = q.textura;
    this.render.setPixelRatio(q.ppp(window.devicePixelRatio || 1));
    if (this.medidas) this.render.setSize(this.medidas.ancho, this.medidas.alto, false);
    const g = this.c.gradas.material, liso = this.nivel === "baja";
    if (liso !== !g.map) { g.map = liso ? null : this.c.publico; g.color.set(liso ? 0x3a4466 : 0xffffff); g.needsUpdate = true; }
  }
  info() {
    const i = this.render.info;
    return { geometrias: i.memory.geometries, texturas: i.memory.textures, llamadas: i.render.calls, triangulos: i.render.triangles,
             llamadasAbajo: this.llamadas.abajo, llamadasArriba: this.llamadas.arriba };
  }
  // cargando modelos (o convirtiendolos el servidor, que tira de la CPU): la calidad
  // automatica no mide entonces (O-321)
  cargando() { return COLA.activos > 0 || COLA.esperan.length > 0 || !!this._calentar || !!this._convirtiendo; }
  figura(id) { return this.figuras[id] || null; }
  modelo(cara) { return pedirModelo(cara); }

  // la figura de un jugador: su modelo si lo hay; si no, una ficha con su cara. El aura
  // y la tarjetita, una vez
  _figura(j) {
    // j: el jugador (otro objeto tras un cambio); cara: el modelo que lleva o pide (O-327)
    const g = new THREE.Group(), u = { j, cara: modeloDe(j), cuerpo: null, codCuerpo: null, mezcla: null, acciones: {}, ahora: null, cargando: false, vel: 0, mira: undefined, px: -j.x, pz: j.y, acum: 0, keshin: null };
    g.userData = u;
    u.ficha = this._ficha(j); g.add(u.ficha);
    u.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.c.texAura, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    u.aura.scale.set(3.6, 5.6, 1); u.aura.position.y = FIGURA.alto * 0.48; u.aura.visible = false; g.add(u.aura);
    g.position.set(-j.x, 0, j.y);
    this.escenaCampo.add(g);
    return g;            // el modelo lo pone _verModelos cuando el servidor lo tiene
  }
  _ficha(j) {
    const c = lienzo(128, 128), ctx = c.getContext("2d"), col = GX.color(j.lado, this.yo);
    const tex = texturaDe(c);
    const pinta = im => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save(); ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = "#fff"; ctx.fill(); if (im) { ctx.clip(); ctx.drawImage(im, 6, 6, 116, 116); } ctx.restore();
      ctx.lineWidth = 8; ctx.strokeStyle = col.base;
      ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.stroke();
      tex.needsUpdate = true;
    };
    pinta(null);
    if (j.cara) { const im = new Image(); im.onload = () => pinta(im); im.src = "/cara/" + encodeURIComponent(j.cara); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    s.scale.set(2.8, 2.8, 1); s.position.y = 2.1;
    return s;
  }

  // el modelo que toca (u.cara: el de su forma con la hiper puesta, O-327). Si ya lleva otro
  // cuerpo (al transformarse o al volver), se cambia cuando llegue el nuevo, sin ficha
  _cargarModelo(j, g) {
    const u = g.userData, cod = u.cara;
    if (!cod || u.cargando === cod || (u.cuerpo && u.codCuerpo === cod)) return;
    u.cargando = cod;
    pedirModelo(cod).then(gltf => {
      if (u.cargando === cod) u.cargando = false;
      if (!gltf || u.cara !== cod || (u.cuerpo && u.codCuerpo === cod) || this.cerrado || !this.figuras.includes(g)) return;
      const cuerpo = clonarModelo(gltf.scene);
      cuerpo.scale.setScalar(FIGURA.escala);
      g.add(cuerpo);
      if (u.cuerpo) { g.remove(u.cuerpo); if (u.mezcla) u.mezcla.stopAllAction(); }
      if (u.ficha) { g.remove(u.ficha); u.ficha.material.map.dispose(); u.ficha.material.dispose(); u.ficha = null; }
      u.cuerpo = cuerpo; u.codCuerpo = cod;
      const mezcla = new THREE.AnimationMixer(cuerpo);
      u.mezcla = mezcla; u.acciones = {}; u.ahora = null;
      // (y el de VR de ganar el balon: el defensa que para el tiro del todo, O-335; el salto de
      // VR dura 0,03 s, una pose)
      for (const [clave, nombre] of Object.entries(Object.assign({ bloquea: ANIM_VR.robarGana }, ANIM))) {
        const clip = gltf.animations.find(a => a.name === nombre);
        if (clip) u.acciones[clave] = mezcla.clipAction(clip);
      }
      this._anima(g, "parado");
      // cuando estan todos, se compilan los shaders: el primer duelo no se atasca
      if (!this._compilado && this.figuras.every(f => f.userData.cuerpo || !f.userData.cara)) {
        this._compilado = true;
        try { this.render.compile(this.escenaCampo, this.camAbajo); } catch (e) {}
        this._calentar = true;
      }
    });
  }

  // Los modelos de los 22: el servidor convierte en segundo plano los que este PC aun no
  // tiene (ievr/modelos3d.py) y aqui se mira cada 2 s como va; cada ficha se cambia por
  // su modelo en cuanto esta (O-293)
  _prepararModelos() {
    // detras de los 22, lo que se ve al invocar: la armadura, el mixi max, la forma del modo
    // y el keshin o el alma (O-327), para que esten cuando hagan falta
    // (vestidos con la equipacion: el cuerpo y la ropa de cada uno, O-334)
    const formas = this.p.jugadores.map(j => [j.modeloHiper && vestidoDe(j, j.modeloHiper), j.formaHiper && j.formaHiper.modelo && vestidoDe(j, j.formaHiper.modelo), j.keshinHiper]).flat();
    const codigos = [...new Set(this.p.jugadores.map(j => vestidoDe(j, j.cara)).concat(formas).filter(Boolean).flatMap(ficherosDe))];
    if (!codigos.length) return;
    fetch("/api/partido/modelos/preparar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos }),
    }).then(r => r.json()).then(e => this._verModelos(e))
      .catch(() => this.figuras.forEach((g, k) => this._cargarModelo(this.p.jugadores[k], g)));
  }
  _verModelos(e) {
    if (this.cerrado) return;           // ya es otro partido
    const hechos = new Set(e.hechos || []), errores = e.errores || {};
    this.p.jugadores.forEach((j, k) => { if (hechoEn(modeloDe(j), hechos) && this.figuras[k]) this._cargarModelo(j, this.figuras[k]); });
    const enCola = new Set([...(e.pendientes || []), e.actual].filter(Boolean));
    // se cuenta sobre los que juegan ahora: tras un cambio salia "23 de 24"
    // contando tambien al que se fue (O-305)
    const ahora = [...new Set(this.p.jugadores.map(j => modeloDe(j)).filter(Boolean))];
    const quedan = ahora.filter(c => ficherosDe(c).some(x => enCola.has(x))).length;
    const listos = ahora.filter(c => hechoEn(c, hechos)).length;
    const fallan = ahora.filter(c => ficherosDe(c).some(x => errores[x])).length;
    // sin juego no se convierte nada, pero los que ya estaban hechos se ven: solo se avisa si falta alguno
    if (e.error) return this._avisar(listos < ahora.length ? e.error : "", 9000);
    this._convirtiendo = quedan > 0;
    if (quedan) {
      this._avisar(`Preparando modelos 3D: ${listos} de ${ahora.length}`);
      clearTimeout(this._espera);
      this._espera = setTimeout(() => fetch("/api/partido/modelos/estado").then(r => r.json())
        .then(x => this._verModelos(x)).catch(() => this._avisar("")), 2000);
    } else {
      this._avisar(fallan ? `Modelos 3D: ${listos} de ${ahora.length} (${fallan} se quedan con ficha)` : "",
        fallan ? 6000 : 0);
    }
  }
  // el aviso pequeno de abajo a la derecha de la pantalla de arriba (#aviso-3d); "" lo quita
  _avisar(texto, ms) {
    const a = document.getElementById("aviso-3d");
    if (!a) return;
    clearTimeout(this._quitaAviso);
    a.textContent = texto; a.hidden = !texto;
    if (texto && ms) this._quitaAviso = setTimeout(() => { if (!this.cerrado) a.hidden = true; }, ms);
  }

  // un cambio (O-297): la figura del que entra, con su modelo si lo hay o en cuanto la
  // cola lo tenga
  _cambiarFigura(j, k) {
    const vieja = this.figuras[k];
    this._soltar(vieja);
    const g = this._figura(j);
    this.figuras[k] = g;
    if (!j.cara) return;
    this._pedirModelo(j, g);
  }
  // el modelo que toca a la cola del servidor (si este PC ya lo tiene, enseguida)
  _pedirModelo(j, g) {
    fetch("/api/partido/modelos/preparar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos: ficherosDe(g.userData.cara) }),
    }).then(r => r.json()).then(e => this._verModelos(e)).catch(() => this._cargarModelo(j, g));
  }
  // el keshin o el alma detras del que lo tiene puesto (O-327): su modelo (k######, con su
  // pose de VR en bucle), medio transparente; se pide una vez y se queda en la figura
  _keshin(g, j, si) {
    const u = g.userData, cod = j.keshinHiper;
    if (!cod) return;
    if (!u.keshin) {
      if (!si) return;
      const k = u.keshin = { cod, grupo: null, mezcla: null };
      pedirModelo(cod).then(gltf => {
        if (this.cerrado || !this.figuras.includes(g) || u.keshin !== k) return;
        if (!gltf) {
          // aun no esta en este PC: a la cola, y se vuelve a mirar en la proxima invocacion
          u.keshin = null;
          fetch("/api/partido/modelos/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigos: [cod] }) }).catch(() => {});
          return;
        }
        const cuerpo = clonarModelo(gltf.scene);
        cuerpo.scale.setScalar(KESHIN.escala);
        cuerpo.traverse(o => {
          if (!o.isMesh) return;
          const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => { const c = m.clone(); c.transparent = true; c.opacity = KESHIN.opacidad; c.depthWrite = false; return c; });
          o.material = mats.length === 1 ? mats[0] : mats;
          o.renderOrder = -1;
        });
        k.grupo = new THREE.Group(); k.grupo.add(cuerpo); k.grupo.visible = false; g.add(k.grupo);
        k.mezcla = new THREE.AnimationMixer(cuerpo);
        if (gltf.animations[0]) k.mezcla.clipAction(gltf.animations[0]).play();
      });
    }
    if (u.keshin.grupo) u.keshin.grupo.visible = !!si;
  }
  // lo de una figura que no es del gltf (que se queda en la cache): su ficha, su aura y la tarjetita
  _soltar(g) {
    const u = g.userData;
    this.escenaCampo.remove(g);
    if (u.mezcla) u.mezcla.stopAllAction();
    for (const s of [u.ficha, u.aura, u.carta]) if (s) { if (s !== u.aura && s.material.map) s.material.map.dispose(); s.material.dispose(); }
    // el keshin de detras: sus materiales son copias (O-327)
    if (u.keshin && u.keshin.grupo) {
      u.keshin.mezcla.stopAllAction();
      u.keshin.grupo.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) m.dispose(); });
    }
  }

  // al acabar el partido (o empezar otro): suelta lo de este partido. El renderer, el
  // campo y los modelos se quedan para el siguiente
  cerrar() {
    this.cerrado = true;
    clearTimeout(this._espera); clearTimeout(this._quitaAviso);
    for (const g of this.figuras) this._soltar(g);
    this.figuras = [];
  }

  _anima(g, cual, unaVez) {
    const u = g.userData, a = u.acciones[cual];
    if (!a || u.ahora === cual) return;
    const antes = u.acciones[u.ahora];
    a.reset();
    a.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat);
    a.clampWhenFinished = !!unaVez;
    a.play();
    if (antes) antes.crossFadeTo(a, 0.15, false);
    u.ahora = cual;
    if (unaVez) setTimeout(() => { if (u.ahora === cual) { u.ahora = null; this._anima(g, "parado"); } }, a.getClip().duration * 1000);
  }

  // --- cada cuadro (el paso 5 del bucle, diseno 1.8) -----------------------------------------
  pintar(estado = {}) {
    if (this.cerrado) return;
    const ahora = performance.now() / 1000, dt = this._t === null ? 0 : Math.min(0.1, Math.max(0, ahora - this._t));
    this._t = ahora;
    const R = this.render, m = this.medidas;
    R.info.reset();
    const ab = estado.abajo || {};
    this.abajo.actualizar(dt);
    this._jugadores(dt, ahora);
    this._balon(ab);
    this._suelo(ahora);
    if (!m) return;
    // todo el lienzo con el fondo de la pagina (los huecos entre pantallas) y luego cada
    // vista en su rectangulo, con la tijera (contado desde abajo)
    R.setScissorTest(false);
    R.setClearColor(FONDO, 1); R.clear();
    R.setScissorTest(true);
    // mientras llegan modelos, la calidad automatica no mide (O-321)
    if (typeof Consola !== "undefined" && Consola.esperarCalidad && this.cargando()) Consola.esperarCalidad(1500);
    if (this._calentar) this._pasadaEntera(m);
    if (ab.modo !== "negro") {
      const r = m.abajo, y = m.alto - r.y - r.h;
      R.setViewport(r.x, y, r.w, r.h); R.setScissor(r.x, y, r.w, r.h);
      const r0 = performance.now();
      R.render(this.escenaCampo, this.camAbajo);
      this.msRender += performance.now() - r0;
    }
    this.llamadas.abajo = R.info.render.calls;
    // arriba, solo si su modo pide 3D (E5); Escenas.pintar dice cuanto fue su JS (O-321)
    if (this.alPintarArriba && estado.arriba) {
      const r = m.arriba, y = m.alto - r.y - r.h;
      R.setViewport(r.x, y, r.w, r.h); R.setScissor(r.x, y, r.w, r.h);
      const r0 = performance.now(), js = this.alPintarArriba(this, estado.arriba);
      this.msRender += Math.max(0, performance.now() - r0 - (+js || 0));
    }
    this.llamadas.arriba = R.info.render.calls - this.llamadas.abajo;
    R.setScissorTest(false);
  }

  // una vez, con todos los modelos: pinta todas las figuras y marcas aunque no se vean
  // (sin recortar por la vista y con lo escondido a la vista: el aura, la zona del saque,
  // la X...) en un rectangulo de 1x1 que el cuadro tapa enseguida. Asi todo sube a la
  // grafica de una vez y la memoria no crece despues (diseno 7.5)
  _pasadaEntera(m) {
    this._calentar = false;
    const sinRecorte = [], escondidos = [], c = this.c;
    for (const g of this.figuras) g.traverse(o => { if ((o.isMesh || o.isSprite) && o.frustumCulled) { o.frustumCulled = false; sinRecorte.push(o); } });
    for (const o of [c.zona, c.equis, c.cursor, c.cono, c.linea, c.lineaBorde, c.rombo, c.destino, ...this.figuras.map(g => g.userData.aura)]) {
      if (o && !o.visible) { o.visible = true; escondidos.push(o); }
    }
    const r = m.abajo, y = m.alto - r.y - r.h;
    this.render.setViewport(r.x, y, 1, 1); this.render.setScissor(r.x, y, 1, 1);
    try { this.render.render(this.escenaCampo, this.camAbajo); } catch (e) {}
    for (const o of sinRecorte) o.frustumCulled = true;
    for (const o of escondidos) o.visible = false;
  }

  _jugadores(dt, ahora) {
    const p = this.p, h = this.abajo._sentido(), c = this.c, cam = this.camAbajo;
    // los que han entrado del banquillo (O-297): otro jugador en ese sitio. Y el que se
    // transforma o vuelve con su hiper (O-327): el mismo, con otro modelo
    p.jugadores.forEach((j, k) => {
      const g = this.figuras[k];
      if (!g) return;
      if (g.userData.j !== j) return this._cambiarFigura(j, k);
      const cod = modeloDe(j);
      if (g.userData.cara === cod) return;
      g.userData.cara = cod;
      if (cod) this._pedirModelo(j, g);
    });
    // al sacar de centro (al empezar, tras un gol y en la 2a parte) todos miran un
    // momento al frente, como en el motor, aunque se recoloquen (O-305). Y al salir de
    // la espera de cada saque, al pulsar Jugar (O-308)
    if (this._fase === undefined || (this._fase !== p.fase && (this._fase === "gol" || this._fase === "descanso" || this._fase === "saque"))) this._saque = 0.5;
    else if (this._saque > 0) this._saque -= dt;
    this._fase = p.fase;
    this._frustum.setFromProjectionMatrix(this._m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const pasoMezcla = (CALIDAD[this.nivel] || CALIDAD.media).mezcla, t = ahora;
    const pos = this.posiciones;
    p.jugadores.forEach((j, k) => {
      const g = this.figuras[k];
      if (!g) return;
      const u = g.userData;
      // el expulsado no se ve (sigue en el array: su id no cambia) (O-311); ni su disco
      g.visible = !j.expulsado;
      if (j.expulsado) {
        this._mat.makeScale(0, 0, 0); c.bordes.setMatrixAt(k, this._mat); c.discos.setMatrixAt(k, this._mat);
        return;
      }
      const x = pos ? pos[k * 2] : j.x, y = pos ? pos[k * 2 + 1] : j.y;
      g.position.set(-x, 0, y);        // x cambiada de signo: sin espejo (O-305)
      this._mat.makeTranslation(-x, 0, y); c.bordes.setMatrixAt(k, this._mat); c.discos.setMatrixAt(k, this._mat);
      // con amarilla, una tarjetita amarilla junto a la cabeza (O-311), a su izquierda en
      // la pantalla
      if (j.amarillas && !u.carta) {
        u.carta = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffe14d }));
        u.carta.scale.set(0.7, 1.0, 1);
        g.add(u.carta);
      }
      if (u.carta) { u.carta.visible = !!j.amarillas; u.carta.position.set(1.1 * h, FIGURA.alto - 0.4, 0); }
      // el aura de la hiper puesta (O-310): del color de su familia, un poco detras de el
      // (lo tapa su modelo) y latiendo
      const aura = p.conAura && p.conAura(j);
      u.aura.visible = !!aura;
      // el keshin o el alma detras de el (O-327)
      if (j.keshinHiper) this._keshin(g, j, aura);
      if (u.keshin && u.keshin.grupo && aura) {
        u.keshin.grupo.position.set(0, 0, KESHIN.detras * h);
        u.keshin.grupo.rotation.y = Math.atan2(0, j.dir);
        u.keshin.mezcla.update(dt);
      }
      if (aura) {
        const col = (AURA_HIPER[j.hiperTipo] || AURA_HIPER.keshin)[1];
        u.aura.material.color.set(col); u.aura.material.opacity = this.quieto ? 0.7 : 0.6 + 0.2 * Math.sin(t * 4 + k);
        u.aura.position.z = 0.9 * h;
      }
      // hacia donde mira y si corre, de lo que se mueve la figura: la foto del invitado no
      // trae hacia donde mira cada uno. La velocidad va suavizada: con 30 pasos por
      // segundo del motor, la mitad de los cuadros salian quietos y la animacion de
      // correr empezaba de nuevo en cada uno (O-305)
      const dx = g.position.x - u.px, dz = g.position.z - u.pz, paso = Math.hypot(dx, dz);
      u.px = g.position.x; u.pz = g.position.z;
      if (paso > 3 || this._saque > 0) { u.vel = 0; u.mira = undefined; }     // un salto o el saque: no es correr
      else if (dt > 0) {
        u.vel += (paso / dt - u.vel) * Math.min(1, dt * 8);
        if (paso > 0.005 && u.vel > 1.2) u.mira = Math.atan2(dx, dz);
      }
      if (u.cuerpo) {
        u.cuerpo.rotation.y = u.mira !== undefined ? u.mira : Math.atan2(0, j.dir);
        if (!(u.ahora === "tiro" || u.ahora === "patada" || u.ahora === "bloquea")) this._anima(g, u.vel > 1.2 ? "correr" : "parado");
        // solo los que se ven (y en Baja, 30 veces por segundo): los demas se quedan en
        // su pose hasta que entran (diseno 7.4). Con 4 ms de margen: a 30 FPS los cuadros
        // llegan a 33,2 o 33,4 ms y sin el se saltaba uno de cada tres (O-321)
        this._esfera.center.set(g.position.x, 1.8, g.position.z);
        u.acum += dt;
        if (this._frustum.intersectsSphere(this._esfera) && u.acum >= pasoMezcla - 0.004) { u.mezcla.update(u.acum); u.acum = 0; }
        else if (u.acum > 1) u.acum = 1;
      } else u.ficha.material.opacity = j.aturdido > 0 ? 0.5 : 1;
    });
    c.bordes.instanceMatrix.needsUpdate = true; c.discos.instanceMatrix.needsUpdate = true;
    // el que chuta o pasa, con su animacion
    const r = p.resultado;
    if (r && r !== this._resultadoVisto) {
      this._resultadoVisto = r;
      // el penalti tambien (O-312). En el tiro que viaja (O-325), solo al chutar y al
      // encadenar (el que lo hace: `chuta`), no en el muro ni en el portero
      const chuta = r.etapa ? (r.etapa === "chute" || r.etapa === "cadena" ? r.chuta : null) : r.tirador;
      if ((r.tipo === "tiro" || r.tipo === "penalti") && chuta !== null && chuta !== undefined && this.figuras[chuta]) this._anima(this.figuras[chuta], "tiro", true);
      // el defensa que para el tiro del todo se queda el balon (Aaron, O-335): su clip de VR de
      // ganar el balon, que se ve con el "¡Bloqueo!" sobre el campo
      const pm = r.tipo === "tiro" && r.final === "bloqueado" ? (r.pasos || []).find(s => s.contra !== undefined && s.contra !== null) : null;
      if (pm && this.figuras[pm.quien]) this._anima(this.figuras[pm.quien], "bloquea", true);
    }
    if (p.balon.pase && p.balon.pase !== this._paseVisto) {
      this._paseVisto = p.balon.pase;
      const de = this.figuras[p.balon.pase.de];
      if (de) this._anima(de, "patada", true);
    }
  }

  _balon(ab) {
    const p = this.p, b = p.balon, c = this.c;
    // el pase bombeado va por el aire (O-294); la sombra, en el suelo
    let alto = FIGURA.balon;
    const pa = b.pase;
    if (pa && pa.alto && pa.total) {
      const queda = Math.hypot(pa.destino.x - b.x, pa.destino.y - b.y);
      alto += Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - queda / pa.total))) * 5;
    }
    // el tiro en vuelo, a su altura (la vaselina, alta) (O-325)
    if (p.tiro && p.alturaTiro && !this.posiciones) alto = Math.max(alto, p.alturaTiro());
    const x = this.posiciones ? this.posiciones[44] : b.x, y = this.posiciones ? this.posiciones[45] : b.y;
    const dX = -x - c.balon.position.x, dZ = y - c.balon.position.z;
    c.balon.position.set(-x, alto, y);
    // rueda con lo que se mueve
    if (Math.abs(dX) + Math.abs(dZ) < 3) { c.balon.rotation.x += dZ / FIGURA.balon; c.balon.rotation.z -= dX / FIGURA.balon; }
    c.balon.visible = c.sombra.visible = !ab.ocultarBalon;
    c.sombra.position.set(-x, 0.03, y);
    c.sombra.scale.setScalar(1 - Math.min(0.5, (alto - FIGURA.balon) / 12));
    // el de la animacion (estado.abajo.balonAnim, del Director): por el cono, por encima del
    // muro, a la red en la repeticion (O-319)
    const a = ab.balonAnim;
    c.balonAnim.visible = c.sombraAnim.visible = !!a;
    if (a) {
      const dA = Math.hypot(-a.x - c.balonAnim.position.x, a.y - c.balonAnim.position.z);
      c.balonAnim.position.set(-a.x, Math.max(FIGURA.balon, a.h || 0), a.y);
      if (dA < 3) c.balonAnim.rotation.x += dA / FIGURA.balon;
      c.sombraAnim.position.set(-a.x, 0.03, a.y);
    }
  }

  // lo del suelo (diseno 5.5): el cursor, la zona de tiro, el destino del pase y la zona
  // del saque. Las mallas son fijas: aqui solo se mueven, se escalan o se repintan
  _suelo(ahora) {
    const p = this.p, ab = this.abajo, c = this.c, h = ab._sentido();
    // el cursor del elegido o del tuyo con balon
    const e = ab.elegido, d0 = p.dueno();
    const actual = e !== null && e !== undefined && p.jugadores[e] && !p.jugadores[e].expulsado ? p.jugadores[e] : d0 && d0.lado === this.yo ? d0 : null;
    // en la repeticion del gol (posiciones grabadas) no se marca nada del motor (O-319)
    c.cursor.visible = !!actual && !this.posiciones;
    if (actual) { c.cursor.position.set(-actual.x, 0.03, actual.y); c.cursor.rotation.y = this.quieto ? 0 : -(ahora % 1) * Math.PI * 2 * h; }
    // la zona de tiro (b28): cono a los dos palos; la linea, la X y el rombo, en el tuyo
    const tir = this.posiciones ? null : SueloAbajo.tirador(p, this.yo);
    // el tiro en vuelo (O-325; guia 8.5: el balon vuela por el cono): el cono desde donde se
    // chuto y la X donde va, para los dos
    const T = this.posiciones ? null : p.tiro;
    c.cono.visible = !!tir || !!T;
    const mio = !!tir && tir.lado === this.yo;
    c.linea.visible = c.lineaBorde.visible = c.rombo.visible = mio;
    c.equis.visible = mio || !!T;
    if (T && !tir) {
      const gy = Math.sign(T.ty || 1) * REGLAS.LARGO / 2, m = REGLAS.PORTERIA / 2, a = c.cono.geometry.attributes.position;
      a.setXYZ(0, -T.x0, 0, T.y0); a.setXYZ(1, m, 0, gy); a.setXYZ(2, -m, 0, gy); a.needsUpdate = true;
      c.cono.geometry.computeBoundingSphere();
      c.equis.position.set(-T.tx, 0.7, T.ty);
      // (roja si va fuera, O-335)
      c.equis.material.color.setHex(Math.abs(T.tx) > REGLAS.PORTERIA / 2 ? 0xff5a48 : 0xffffff);
    }
    if (tir) {
      const g = p.porteriaRival(tir), m = REGLAS.PORTERIA / 2, a = c.cono.geometry.attributes.position;
      a.setXYZ(0, -tir.x, 0, tir.y); a.setXYZ(1, m, 0, g.y); a.setXYZ(2, -m, 0, g.y); a.needsUpdate = true;
      c.cono.geometry.computeBoundingSphere();
      if (mio) {
        const X = SueloAbajo.equis(p, tir, ab.puntoTiro), dx = -X.x - -tir.x, dz = X.y - tir.y, l = Math.hypot(dx, dz) || 1, giro = Math.atan2(dx, dz);
        for (const [ms, ancho] of [[c.lineaBorde, 0.6], [c.linea, 0.36]]) { ms.position.x = -tir.x; ms.position.z = tir.y; ms.rotation.y = giro; ms.scale.set(ancho, 1, l); }
        c.equis.position.set(-X.x, 0.7, X.y);
        // roja si apuntas muy fuera: el tiro se ira por ahi (O-335)
        c.equis.material.color.setHex(X.fuera ? 0xff5a48 : 0xffffff);
        c.rombo.position.set(-tir.x, FIGURA.alto + 1.9 + (this.quieto ? 0 : Math.sin(ahora * 4) * 0.15), tir.y);
        c.rombo.rotation.y = this.quieto ? 0 : ahora * 1.5;
      }
    }
    // el destino del pase: el circulo cian
    const dp = this.posiciones ? null : SueloAbajo.destino(p, this.yo);
    c.destino.visible = !!dp;
    if (dp) c.destino.position.set(-dp.x, 0.036, dp.y);
    // la zona del saque: el lienzo se repinta solo si cambia la espera o el arrastre
    const z = p.fase === "saque" && p.zonaSaque ? p.zonaSaque(this.yo) : null;
    c.zona.visible = !!(z && (z.circulo || z.penalti));
    if (c.zona.visible) {
      const clave = p.nEspera + ":" + !!ab.colocando + ":" + this.yo + ":" + JSON.stringify(z);
      if (clave !== this._zonaClave) { this._zonaClave = clave; this._pintarZona(z, !!ab.colocando); }
    } else this._zonaClave = "";
  }
  _pintarZona(z, fuerte) {
    const c = this.c, lz = c.zonaLienzo, ctx = lz.getContext("2d"), N = lz.width;
    // la caja del suelo que hay que pintar: el circulo o el area con su semicirculo
    let x0, x1, y0, y1;
    if (z.circulo) { x0 = z.circulo.x - z.circulo.r - 1; x1 = z.circulo.x + z.circulo.r + 1; y0 = z.circulo.y - z.circulo.r - 1; y1 = z.circulo.y + z.circulo.r + 1; }
    if (z.penalti) {
      const pe = z.penalti, ya = pe.y - pe.s * 0.5, yb = pe.y + pe.s * (pe.punto ? 21.5 : REGLAS.AREA_Y + 1);
      x0 = Math.min(x0 === undefined ? Infinity : x0, -REGLAS.AREA_X - 1); x1 = Math.max(x1 === undefined ? -Infinity : x1, REGLAS.AREA_X + 1);
      y0 = Math.min(y0 === undefined ? Infinity : y0, ya, yb); y1 = Math.max(y1 === undefined ? -Infinity : y1, ya, yb);
    }
    const D = Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, k = N / D;
    ctx.clearRect(0, 0, N, N);
    // del campo al lienzo: el plano tumbado (rotateX -90) pone la fila de arriba del
    // lienzo hacia -z de three y su izquierda hacia -x de three (+x del motor)
    pintarZonaSaque(ctx, z, fuerte, (x, y) => ({ px: (mx - x + D / 2) * k, py: (y - my + D / 2) * k }), k, 1.6, N, N);
    c.zona.material.map.needsUpdate = true;
    c.zona.position.set(-mx, 0.026, my); c.zona.scale.set(D, 1, D);
  }
}

export const Mundo3D = {
  crear(canvas, partido, yo, op = {}) { return new Mundo(canvas, partido, yo, op); },
  CAM, FIGURA, CampoAbajo3D, ponerCamara, proyectar, aCampo, aPorteria, nuevaCamara,
  cache: CACHE,
};
// la pagina lo espera con Consola.modulo("Mundo3D") (este modulo va despues de partido.js)
if (typeof Consola !== "undefined" && Consola.registrar) Consola.registrar("Mundo3D", Mundo3D);
