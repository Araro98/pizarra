/* Figuras 3D (NOTAS O-347). Aaron: "un visor 3d de los modelos, que puedas elegir un personaje de
   todos los disponibles, cambiarles el uniforme (de los del juego), la pose (sacadas de las del
   juego), dorsal y si quieres que sea capitan o no por la bandana y cuando acabes de configurar
   todo eso que haya un boton para descargar el modelo en esa pose, ya que tengo un amigo con
   maquina de impresion 3d".
   - Los modelos salen del juego de cada uno, como en el partido: el servidor convierte el
     personaje sin ropa y la ropa de la equipacion (ievr/modelos3d.py, O-334) y aqui se viste
     (partido-vestir.js: dorsal y brazalete). Su ropa de siempre tambien va asi (la ropa de serie
     con la piel de debajo: el .glb de siempre sale sin antebrazos en las de manga corta).
   - Las poses son las animaciones del juego de su cuerpo (ievr/figuras.py): un .glb con el
     esqueleto y la animacion que se aplica por el nombre de los huesos; en las que se mueven se
     elige el momento.
   - La descarga se hace aqui con el modelo posado: cada vertice con su piel aplicada, en
     milimetros y de pie (Z arriba), con peana y con grosor en las piezas finas. STL para la
     impresora; OBJ (en un .zip con las texturas) y GLB con los colores. */
import * as THREE from "./partido-three.module.js";
import { GLTFLoader } from "./partido-GLTFLoader.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";
import { vestir, prepararRopa, esPlacaNombre } from "./partido-vestir.js";
import { EventoVR, EVENTO_VR } from "./partido-eventosvr.js";
import { ponerCamara } from "./partido-sombrasvr.js";

const CLAVE = "pizarra-figuras";
const E = Object.assign({
  codigo: "c01000010", equipacion: "propia", diseno: "0", portero: false, dorsal: 10, conDorsal: true,
  capitan: false, pose: null, momento: 0.5, altura: 100, peana: true, grosor: true, suavizar: true, girar: false, gris: false,
  forma: "", formaDe: "", keshin: "", kesTam: 1.5, kesAltura: 0.8, kesDist: 0, kesAura: true,
  efectos: true, balon: false, efectosDescarga: false, tecOtros: {}, ojos: null, boca: null,
}, leerGuardado());
function leerGuardado() { try { return JSON.parse(localStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { return {}; } }
function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch (e) { /* sin almacen: da igual */ } }
const esperar = ms => new Promise(ok => setTimeout(ok, ms));
const POST = (url, datos) => pedir(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });

let PERSONAJES = [], EQUIPACIONES = [], PERSONAJE = null;

// --------------------------------------------------------------------------- el escenario
const lienzo = document.createElement("canvas");
$("#escenario").prepend(lienzo);
const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, preserveDrawingBuffer: true });
render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(28, 1, 0.02, 60);
// las luces solo cuentan en "Como impresa" (los modelos del juego van sin luz, como en VR)
escena.add(new THREE.HemisphereLight(0xffffff, 0x445577, 1.6));
const sol = new THREE.DirectionalLight(0xffffff, 2.2);
sol.position.set(1.5, 3, 2.5);
escena.add(sol);
const contra = new THREE.DirectionalLight(0x9fc4ff, 1.0);
contra.position.set(-2, 1.5, -2);
escena.add(contra);

// la peana de la vista (la de verdad, a escala, si se descarga con peana) y una sombra suave
const peana = new THREE.Group();
escena.add(peana);
const matPeana = new THREE.MeshStandardMaterial({ color: 0x1b2f5c, roughness: 0.55, metalness: 0.1 });
const matAro = new THREE.MeshBasicMaterial({ color: 0x3fe0d0 });
const sombra = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const k = c.getContext("2d"), g = k.createRadialGradient(64, 64, 4, 64, 64, 63);
  g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  k.fillStyle = g; k.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  escena.add(m);
  return m;
})();

// mover la camara a mano: girar alrededor, acercar y desplazar
const ORBITA = { objetivo: new THREE.Vector3(0, 0.75, 0), dist: 3.6, theta: 0.35, phi: 1.38 };
function colocarCamara() {
  const o = ORBITA, s = Math.sin(o.phi);
  camara.position.set(o.objetivo.x + o.dist * s * Math.sin(o.theta), o.objetivo.y + o.dist * Math.cos(o.phi),
    o.objetivo.z + o.dist * s * Math.cos(o.theta));
  camara.lookAt(o.objetivo);
}
(() => {
  let arr = null;
  const punteros = new Map();
  lienzo.addEventListener("contextmenu", e => e.preventDefault());
  lienzo.addEventListener("pointerdown", e => {
    lienzo.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arr = { x: e.clientX, y: e.clientY, mover: e.button === 2 || e.shiftKey, dist: null };
  });
  lienzo.addEventListener("pointermove", e => {
    if (!arr || !punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2) {         // dos dedos: acercar
      const [a, b] = [...punteros.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (arr.dist) acercar(arr.dist / d);
      arr.dist = d;
      return;
    }
    const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
    arr.x = e.clientX; arr.y = e.clientY;
    if (arr.mover) {
      const f = ORBITA.dist * 0.0016, der = new THREE.Vector3().setFromMatrixColumn(camara.matrix, 0),
        arriba = new THREE.Vector3().setFromMatrixColumn(camara.matrix, 1);
      ORBITA.objetivo.addScaledVector(der, -dx * f).addScaledVector(arriba, dy * f);
    } else {
      ORBITA.theta -= dx * 0.008;
      ORBITA.phi = Math.min(Math.PI - 0.05, Math.max(0.05, ORBITA.phi - dy * 0.008));
    }
  });
  const suelta = e => { punteros.delete(e.pointerId); if (!punteros.size) arr = null; };
  lienzo.addEventListener("pointerup", suelta);
  lienzo.addEventListener("pointercancel", suelta);
  lienzo.addEventListener("wheel", e => { e.preventDefault(); acercar(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
})();
function acercar(f) { ORBITA.dist = Math.min(20, Math.max(0.25, ORBITA.dist * f)); }

function ajustarTamano() {
  const r = lienzo.getBoundingClientRect();
  if (!r.width || !r.height) return;
  render.setSize(r.width, r.height, false);
  camara.aspect = r.width / r.height;
  camara.updateProjectionMatrix();
  pintarFondo(Math.min(2048, Math.round(r.width)), Math.min(2048, Math.round(r.height)));
}
// el fondo del escenario dentro del 3D (el mismo que el de la pagina: azul marino con la trama de
// hexagonos y un foco): los efectos de VR que suman luz escriben la transparencia del lienzo y con
// el fondo de la pagina detras salia negro. Asi tambien sale en la foto
function pintarFondo(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const k = c.getContext("2d");
  const lin = k.createLinearGradient(0, 0, 0, h);
  lin.addColorStop(0, "#27407a"); lin.addColorStop(0.55, "#1b2f5c"); lin.addColorStop(1, "#0f1d3d");
  k.fillStyle = lin; k.fillRect(0, 0, w, h);
  const rad = k.createRadialGradient(w / 2, h * 0.32, 0, w / 2, h * 0.32, Math.max(w, h) * 0.55);
  rad.addColorStop(0, "rgba(120,190,255,.38)"); rad.addColorStop(1, "rgba(120,190,255,0)");
  k.fillStyle = rad; k.fillRect(0, 0, w, h);
  k.strokeStyle = "rgba(160,200,255,.10)"; k.lineWidth = 2;
  for (let y0 = -146; y0 < h + 146; y0 += 146) for (let x0 = -84; x0 < w + 84; x0 += 84) {
    for (const [dx, dy] of [[0, 0], [-42, 73]]) {
      const x = x0 + 42 + dx, y = y0 + 2 + dy;
      k.beginPath(); k.moveTo(x, y); k.lineTo(x + 38, y + 22); k.lineTo(x + 38, y + 66); k.lineTo(x, y + 88);
      k.lineTo(x - 38, y + 66); k.lineTo(x - 38, y + 22); k.closePath(); k.stroke();
    }
  }
  if (escena.background && escena.background.dispose) escena.background.dispose();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  escena.background = t;
}
new ResizeObserver(ajustarTamano).observe($("#escenario"));

let ultimo = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - ultimo) / 1000);
  ultimo = ahora;
  if (E.girar) ORBITA.theta += dt * 0.5;
  if (REPRODUCIENDO && TRAMOS.length) {
    const dur = duracion() || 1;
    E.momento = ((E.momento * dur + dt) % dur) / dur;
    ponerMomento(E.momento, true);
    pintarMomento();
  }
  colocarCamara();
  if (EVENTO) { camara.updateMatrixWorld(); ponerCamara(camara); }
  render.render(escena, camara);
  requestAnimationFrame(bucle);
}

// --------------------------------------------------------------------------- avisos en el escenario
function estado(titulo, detalle, mal) {
  const caja = $("#estado");
  if (!titulo) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.classList.toggle("mal", !!mal);
  $("#estado-t").textContent = titulo;
  $("#estado-d").textContent = detalle || "";
  $("#estado-barra").hidden = !!mal;
}

// --------------------------------------------------------------------------- los modelos
const cargador = new GLTFLoader();
const GLB = new Map();             // codigo -> promesa del gltf
function cargarGlb(url) {
  if (!GLB.has(url)) {
    GLB.set(url, new Promise((ok, mal) => cargador.load(url, ok, undefined, mal))
      .catch(e => { GLB.delete(url); throw e; }));
  }
  return GLB.get(url);
}
const urlModelo = c => "/api/figuras/modelo/" + encodeURIComponent(c) + ".glb";

// que el servidor tenga convertidos esos codigos (desde el juego de este PC)
async function asegurar(codigos, tok) {
  let e = await POST("/api/figuras/preparar", { codigos });
  let vueltas = 0;
  for (;;) {
    if (tok !== TOKEN) return false;
    if (e.error) throw new Error(e.error);
    for (const c of codigos) if (e.errores && e.errores[c]) throw new Error(e.errores[c]);
    const faltan = codigos.filter(c => !(e.hechos || []).includes(c));
    if (!faltan.length) return true;
    estado("Sacando el modelo de tu juego...", faltan.some(c => c.startsWith("ropa_"))
      ? "El personaje y la equipación se convierten una sola vez; luego salen al momento."
      : "Se convierte una sola vez; luego sale al momento.");
    await esperar(600);
    // si otra pagina (el partido) vacia la cola, se vuelve a pedir
    e = (++vueltas % 15) ? await pedir("/api/figuras/estado") : await POST("/api/figuras/preparar", { codigos });
  }
}

// los ojos y la boca en su cara normal (como caraNormal de partido-3d.js, O-332)
function caraNormal(gltf) {
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      const n = m && m.userData ? m.userData.cara : undefined;
      if (!n || !m.map || m.userData._cara) continue;
      m.userData._cara = true;
      m.map = m.map.clone(); m.map.matrixAutoUpdate = true;
      const im = m.map.image || {}, ancho = im.width || 2048, alto = im.height || 1024;
      m.map.offset.set((n % 4) / 4, Math.floor(n / 4) / 4 * ancho / alto);
    }
  });
  return gltf;
}

let TOKEN = 0, MODELO = null, REPOSO = null;
// las mascaras de piel de la ropa por su imagen (para la descarga con colores: la piel se tinta
// como en el sombreador de partido-vestir.js) y el material de color de cada malla (el gris de
// "Como impresa" lo cambia)
const MASCARAS = new Map(), MAT_COLOR = new WeakMap();
// un personaje con su ropa: la de esa equipacion (vestido) o la suya. op: {equipacion, diseno,
// portero, dorsal (null = sin numero), capitan}. -> {gltf (como el de un .glb: scene, animations,
// parser), ropa} o null si ya no hace falta (tok)
async function modeloDe(codigo, op, tok) {
  const r = await pedir("/api/figuras/ropa?" + new URLSearchParams({ codigo, equipacion: op.equipacion || "propia",
    diseno: op.diseno || "0", portero: op.portero ? "1" : "0" }));
  const ropa = r.ropa || "";
  const codigos = ropa ? [codigo + "_cuerpo", ropa] : [codigo];
  if (!await asegurar(codigos, tok)) return null;
  const glbs = await Promise.all(codigos.map(c => cargarGlb(urlModelo(c))));
  caraNormal(glbs[0]);
  let gltf;
  if (ropa) {
    await prepararRopa(glbs[1]);
    glbs[1].scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData && m.userData.mascaraTex && m.map) MASCARAS.set(m.map.image, m.userData.mascaraTex); });
    gltf = vestir(glbs[0], glbs[1], { dorsal: op.dorsal, capitan: op.capitan });
  } else {
    gltf = { scene: clonarModelo(glbs[0].scene), animations: glbs[0].animations, parser: glbs[0].parser, asset: glbs[0].asset };
  }
  const piel = pielDe(glbs[0]);
  gltf.scene.traverse(o => { if (o.isMesh) o.userData.piel = piel; });
  return { gltf, ropa };
}
// el modelo que se ve: el personaje o la forma elegida (armadura, mixi max, modo)
const codigoModelo = () => (PERSONAJE && E.forma && E.formaDe === PERSONAJE.codigo) ? E.forma : PERSONAJE ? PERSONAJE.codigo : "";
async function montar() {
  const tok = ++TOKEN, p = PERSONAJE;
  if (!p) return;
  pintarEncabezado();
  try {
    const r = await modeloDe(codigoModelo(), Object.assign({}, E, { dorsal: E.conDorsal ? E.dorsal : null }), tok);
    if (!r || tok !== TOKEN) return;
    $("#nota-ropa").hidden = !(p.viste && !r.ropa && E.equipacion !== "propia");
    $("#nota-ropa").textContent = "Esta equipación no tiene ropa para el cuerpo de este personaje: sale con la suya.";
    ponerModelo(r.gltf.scene);
    estado(null);
    await cargarEspiritus(tok);
    await cargarKeshin(tok);
    await cargarPoses(tok);
  } catch (e) {
    if (tok === TOKEN) estado("No se ha podido sacar el modelo", e.message || String(e), true);
  }
}
function pielDe(gltf) {
  let h = "";
  try { const x = gltf.parser.json.asset.extras || {}; h = x.piel || (x.piezas || {}).piel || ""; } catch (e) { h = ""; }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = "FED6BA";
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

const CAJA = new THREE.Box3(), V = new THREE.Vector3();
let ALTO_DE_PIE = 1.4;
function ponerModelo(obj) {
  const habia = !!MODELO;
  if (MODELO) escena.remove(MODELO);
  if (MIXER) { MIXER.stopAllAction(); MIXER.uncacheRoot(MIXER.getRoot()); }
  MIXER = null; ACCION = null; TRAMOS = []; TRAMO = -1;
  quitarEvento(); quitarKeshin();
  MODELO = new THREE.Group();
  MODELO.add(obj);
  escena.add(MODELO);
  obj.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  // el reposo de cada hueso, para volver a el al cambiar de pose
  REPOSO = [];
  obj.traverse(o => { if (o.isBone || o.type === "Object3D") REPOSO.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  // la escala de la figura sale de su altura de pie (la del modelo sin pose): asi una pose
  // agachada o tumbada sale a la misma escala que las demas, como las figuras de coleccion
  const c = cajaDe(obj);
  ALTO_DE_PIE = c.isEmpty() ? 1.4 : Math.max(0.2, c.max.y - c.min.y);
  prepararCara(obj);
  aplicarGris();
  if (!habia) encuadrar();
}
function volverAlReposo() {
  for (const [o, p, q, s] of REPOSO || []) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
}

// la caja de lo que se ve (con la piel aplicada), en el espacio de la escena
function cajaDe(obj, caja = CAJA) {
  obj.updateMatrixWorld(true);
  caja.makeEmpty();
  obj.traverseVisible(o => {
    if (!o.isMesh || esParticula(o)) return;
    const pos = o.geometry.attributes.position, paso = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += paso) { o.getVertexPosition(i, V); V.applyMatrix4(o.matrixWorld); caja.expandByPoint(V); }
  });
  return caja;
}
const esParticula = o => o.isInstancedMesh || o.isPoints || o.isSprite || /^particulas/.test(o.name || "");
// la figura de pie sobre la peana: lo mas bajo a la altura de su cara de arriba y centrada. Lo
// que va con ella (la animacion de VR: efectos, los demas jugadores; el keshin) se mueve igual
function recolocar() {
  if (!MODELO) return;
  const hijo = MODELO.children[0];
  hijo.position.set(0, 0, 0);
  if (EVENTO) EVENTO.ev.raiz.position.set(0, 0, 0);
  const c = cajaDe(hijo);
  if (c.isEmpty()) return;
  const alto = c.max.y - c.min.y;
  const p = medirPeana(hijo, c);
  hijo.position.set(-p.cx, -c.min.y + (E.peana ? p.alto - p.hundir : 0), -p.cz);
  if (EVENTO) EVENTO.ev.raiz.position.copy(hijo.position);
  const fig = cajaDe(hijo, new THREE.Box3());
  colocarKeshin(fig);
  // con keshin detras, la peana llega tambien debajo de el (si no, la figura se iria para atras)
  if (KESHIN && E.peana) {
    const kz = KESHIN.raiz.position.z + KESHIN.centroZ * KESHIN.raiz.scale.z;
    const medio = Math.min(0, kz / 2);
    p.cz2 = medio;
    p.radio = Math.min(ALTO_DE_PIE * 0.9, Math.max(p.radio, Math.abs(medio) + p.radio * 0.8));
  }
  peana.clear();
  peana.position.set(0, 0, p.cz2 || 0);
  if (E.peana) {
    const g = new THREE.CylinderGeometry(p.radio - p.bisel, p.radio, p.alto, 72, 1);
    const m = new THREE.Mesh(g, matPeana);
    m.position.y = p.alto / 2;
    peana.add(m);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(p.radio - p.bisel * 0.5, p.alto * 0.08, 6, 96), matAro);
    aro.rotation.x = Math.PI / 2; aro.position.y = p.alto - p.bisel * 0.5;
    peana.add(aro);
  }
  const r = E.peana ? p.radio : Math.max(c.max.x - c.min.x, c.max.z - c.min.z) * 0.6;
  sombra.scale.set(r * 2.6, r * 2.6, 1);
  sombra.position.set(0, 0.001, p.cz2 || 0);
  // las medidas, con todo lo que se imprime (la figura y el keshin con su aura)
  const todo = fig.clone();
  if (KESHIN) { todo.union(cajaDe(KESHIN.raiz, new THREE.Box3())); if (AURA) todo.union(new THREE.Box3().setFromObject(AURA)); }
  MEDIDAS = { alto: todo.max.y - todo.min.y, base: todo.min.y, ancho: todo.max.x - todo.min.x, fondo: todo.max.z - todo.min.z, peana: p };
  pintarMedidas();
}
// la peana: debajo de los pies (lo mas bajo de la figura) y proporcionada a su altura. En
// unidades del modelo; la descarga la escala con todo lo demas
function medirPeana(obj, c) {
  const alto = c.max.y - c.min.y, mm = ALTO_DE_PIE / E.altura, corte = c.min.y + alto * 0.06;
  let sx = 0, sz = 0, n = 0;
  const pies = [];
  obj.traverseVisible(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, paso = Math.max(1, Math.floor(pos.count / 3000));
    for (let i = 0; i < pos.count; i += paso) {
      o.getVertexPosition(i, V); V.applyMatrix4(o.matrixWorld);
      if (V.y <= corte) { sx += V.x; sz += V.z; n++; pies.push(V.x, V.z); }
    }
  });
  const cx = n ? sx / n : (c.min.x + c.max.x) / 2, cz = n ? sz / n : (c.min.z + c.max.z) / 2;
  let lejos = 0;
  for (let i = 0; i < pies.length; i += 2) lejos = Math.max(lejos, Math.hypot(pies[i] - cx, pies[i + 1] - cz));
  const radio = Math.min(ALTO_DE_PIE * 0.6, Math.max(lejos + 4 * mm, ALTO_DE_PIE * 0.27));
  return { cx, cz, radio, alto: Math.max(2.5, E.altura * 0.035) * mm, bisel: 0.8 * mm, hundir: 0.4 * mm, mm, cz2: 0 };
}
let MEDIDAS = null;
function pintarMedidas() {
  const m = MEDIDAS, caja = $("#medidas");
  if (!m) { caja.textContent = ""; return; }
  const cm = x => (x / m.peana.mm / 10).toLocaleString("es", { maximumFractionDigits: 1 });
  const total = E.peana ? m.alto + m.base : m.alto;
  caja.innerHTML = "";
  caja.append(el("b", { text: cm(total) + " cm" }), el("br"),
    el("span", { text: "de alto" + (E.peana ? " con la peana" : "") }), el("br"),
    el("span", { text: cm(Math.max(m.ancho, E.peana ? m.peana.radio * 2 : 0)) + " × " + cm(Math.max(m.fondo, E.peana ? m.peana.radio * 2 : 0)) + " cm de base" }), el("br"),
    el("span", { text: "escala: " + (E.altura / 10).toLocaleString("es") + " cm de pie" }));
}
// la camara a la figura entera (con `mantener`, sin cambiar desde donde se mira)
function encuadrar(mantener) {
  if (!MODELO) return;
  recolocar();
  const c = cajaDe(MODELO.children[0], new THREE.Box3());
  if (KESHIN) c.union(cajaDe(KESHIN.raiz, new THREE.Box3()));
  const alto = Math.max(0.3, c.max.y - c.min.y);
  const tam = Math.max(alto, (c.max.x - c.min.x) * 0.8, (c.max.z - c.min.z) * 0.8);
  ORBITA.objetivo.set((c.min.x + c.max.x) / 2, c.min.y + alto * 0.5, (c.min.z + c.max.z) / 2);
  ORBITA.dist = tam * 0.5 / Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * 1.55;
  if (!mantener) { ORBITA.theta = KESHIN ? 0.75 : 0.35; ORBITA.phi = 1.42; }
}

// "Como impresa": todo gris con luz, respetando lo que es transparente y el corte del keshin
const GRIS = new WeakMap();
function materialGris(m) {
  if (!GRIS.has(m)) {
    const g = new THREE.MeshStandardMaterial({ color: 0xd4d8de, roughness: 0.62, metalness: 0.0, map: m.map || null,
      alphaTest: m.alphaTest || 0, transparent: false, side: m.side, clippingPlanes: m.clippingPlanes || null });
    g.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n\tdiffuseColor.rgb = vec3( 0.66 );"); };
    g.customProgramCacheKey = () => "figura-gris";
    GRIS.set(m, g);
  }
  return GRIS.get(m);
}
function aplicarGris() {
  if (!MODELO) return;
  const raices = [MODELO.children[0], KESHIN && KESHIN.raiz, AURA].filter(Boolean);
  for (const r of raices) r.traverse(o => {
    if (!o.isMesh || esParticula(o)) return;
    if (!MAT_COLOR.has(o)) MAT_COLOR.set(o, o.material);
    const mc = MAT_COLOR.get(o);
    o.material = E.gris ? (Array.isArray(mc) ? mc.map(materialGris) : materialGris(mc)) : mc;
  });
  // la animacion de VR: sus jugadores tambien; los efectos, sin ellos
  if (EVENTO) {
    for (const a of Object.values(EVENTO.ev.actores)) if (a.nodo && a.tipo !== "efecto") a.nodo.traverse(o => {
      if (!o.isMesh) return;
      if (!MAT_COLOR.has(o)) MAT_COLOR.set(o, o.material);
      const mc = MAT_COLOR.get(o);
      o.material = E.gris ? (Array.isArray(mc) ? mc.map(materialGris) : materialGris(mc)) : mc;
    });
    ponerVisiblesEvento();
  }
  $("#b-gris").classList.toggle("activo", E.gris);
}


// --------------------------------------------------------------------------- la cara
// Aaron: "que se puedan cambiar las expresiones de la cara". En VR los ojos y la boca son una hoja
// de 4x2 caras (eye_10M y mouth_10M usan la misma; O-331, O-332): se elige la celda de cada uno.
// Los materiales de la cara se copian para cada modelo (los de la cache los comparten los demas).
const MAT_OJOS = /^eye_\d0M$/, MAT_BOCA = /^mouth_\d0M$/;
let CARA = { ojos: [], boca: [], hoja: null };
function prepararCara(obj) {
  CARA = { ojos: [], boca: [], hoja: null };
  obj.traverse(o => {
    if (!o.isMesh) return;
    const ms = [].concat(o.material).map(m => {
      const es = m && m.map && (MAT_OJOS.test(m.name) ? "ojos" : MAT_BOCA.test(m.name) ? "boca" : null);
      if (!es) return m;
      const c = m.clone();
      c.map = m.map.clone(); c.map.matrixAutoUpdate = true; c.map.needsUpdate = false;
      CARA[es].push(c);
      CARA.hoja = CARA.hoja || c.map.image;
      return c;
    });
    o.material = Array.isArray(o.material) ? ms : ms[0];
  });
  ponerCara();
}
function celdaCara(m, n) {
  const im = m.map.image || {};
  m.map.offset.set((n % 4) / 4, Math.floor(n / 4) / 4 * (im.width || 2048) / (im.height || 1024));
}
function ponerCara() {
  for (const m of CARA.ojos) celdaCara(m, E.ojos !== null && E.ojos !== undefined ? E.ojos : (m.userData.cara || 0));
  for (const m of CARA.boca) celdaCara(m, E.boca !== null && E.boca !== undefined ? E.boca : (m.userData.cara || 0));
  pintarCara();
}
function pintarCara() {
  const hay = !!CARA.hoja && (CARA.ojos.length || CARA.boca.length);
  $("#nota-cara").textContent = hay ? "" : "Este modelo no cambia de cara.";
  for (const [id, parte, k, normal] of [["#caras-ojos", "ojos", "ojos", CARA.ojos], ["#caras-boca", "boca", "boca", CARA.boca]]) {
    const caja = $(id);
    caja.innerHTML = "";
    caja.parentNode.hidden = !hay || !normal.length;
    if (!hay || !normal.length) continue;
    const im = CARA.hoja, cw = im.width / 4, ch = im.height / 2;
    const de = normal[0].userData.cara || 0, actual = E[k] !== null && E[k] !== undefined ? E[k] : de;
    for (let n = 0; n < 8; n++) {
      const c = document.createElement("canvas"); c.width = 96; c.height = 48;
      const x = (n % 4) * cw, y = Math.floor(n / 4) * ch;
      // los ojos en la mitad de arriba de la celda y la boca abajo
      if (parte === "ojos") c.getContext("2d").drawImage(im, x + cw * 0.04, y + ch * 0.06, cw * 0.92, ch * 0.46, 0, 0, 96, 48);
      else c.getContext("2d").drawImage(im, x + cw * 0.2, y + ch * 0.5, cw * 0.6, ch * 0.3, 0, 0, 96, 48);
      caja.append(el("button", { type: "button", "aria-pressed": String(n === actual), title: n === de ? "La de siempre" : "Cara " + (n + 1),
        onclick: () => { E[k] = n === de ? null : n; guardar(); ponerCara(); } }, [c]));
    }
  }
}

// --------------------------------------------------------------------------- el espiritu: la forma y el keshin detras
// Punto 4 de Aaron: "poder poner los keshins detras, armaduras en caso de que los personajes las
// lleven. Los keshins fieles a como son en la serie y en los juegos, que se vea detras cortado".
// La forma (armadura, mixi max, modo) cambia el modelo. El keshin (o el alma) sale detras, mas
// grande y cortado por la cintura, como cuando sale en el anime; para imprimirlo, su aura lo une
// con la espalda del personaje (un tubo cerrado del color del aura).
let ESPIRITUS = null, KESHIN = null, AURA = null;
const ESPIRITUS_DE = new Map();
const PLANO_CORTE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
render.localClippingEnabled = true;
// (mas fuerte cerca del keshin y casi nada en la espalda: el color de cada vertice lleva su alfa)
const matAura = new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, vertexColors: true, depthWrite: false,
  side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
async function cargarEspiritus(tok) {
  const c = PERSONAJE.codigo;
  if (!ESPIRITUS_DE.has(c)) ESPIRITUS_DE.set(c, await pedir("/api/figuras/espiritus?codigo=" + encodeURIComponent(c)).catch(() => ({ keshins: [], formas: [] })));
  if (tok !== TOKEN) return;
  ESPIRITUS = ESPIRITUS_DE.get(c);
  pintarEspiritu();
}
function quitarKeshin() {
  if (KESHIN) { KESHIN.raiz.removeFromParent(); if (KESHIN.mixer) KESHIN.mixer.stopAllAction(); }
  if (AURA) { AURA.removeFromParent(); AURA.geometry.dispose(); }
  KESHIN = null; AURA = null;
}
async function cargarKeshin(tok) {
  quitarKeshin();
  if (!E.keshin || !MODELO) { recolocar(); return; }
  try {
    estado("Sacando el keshin de tu juego...", "Solo la primera vez.");
    if (!await asegurar([E.keshin], tok)) return;
    const g = await cargarGlb(urlModelo(E.keshin));
    if (tok !== TOKEN) return;
    estado(null);
    const obj = clonarModelo(g.scene);
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const ms = [].concat(o.material).map(m => { const c = m.clone(); c.clippingPlanes = [PLANO_CORTE]; return c; });
      o.material = Array.isArray(o.material) ? ms : ms[0];
    });
    const raiz = new THREE.Group();
    raiz.name = "keshin";
    raiz.add(obj);
    let mixer = null;
    // su pose de keshin (化身立ち1L), la que trae el modelo
    if (g.animations.length) { mixer = new THREE.AnimationMixer(obj); mixer.clipAction(g.animations[0]).play(); mixer.update(0.5); }
    const caja = cajaDe(obj, new THREE.Box3());
    let cintura = caja.min.y + (caja.max.y - caja.min.y) * 0.45;
    const pelvis = obj.getObjectByName("c_c_1_0") || obj.getObjectByName("c_c_1_1");
    if (pelvis) { const w = pelvis.getWorldPosition(new THREE.Vector3()).y; if (w > caja.min.y && w < caja.max.y) cintura = w; }
    KESHIN = { codigo: E.keshin, raiz, obj, mixer, caja, cintura, centroX: (caja.min.x + caja.max.x) / 2, centroZ: (caja.min.z + caja.max.z) / 2 };
    MODELO.add(raiz);
    aplicarGris();
    encuadrar(true);
  } catch (e) {
    estado(null);
    avisa("No se ha podido sacar el keshin: " + (e.message || e), "mal");
  }
}
// el keshin detras de la figura ya colocada (fig: su caja): cortado a `kesAltura` de su altura de
// pie, lo de encima del corte `kesTam` veces su altura, a `kesDist` por detras
function colocarKeshin(fig) {
  if (AURA) { AURA.removeFromParent(); AURA.geometry.dispose(); AURA = null; }
  if (!KESHIN) return;
  const H = ALTO_DE_PIE, k = KESHIN, yCorte = fig.min.y + E.kesAltura * H;
  const s = E.kesTam * H / Math.max(0.01, k.caja.max.y - k.cintura);
  k.raiz.scale.setScalar(s);
  k.raiz.position.set((fig.min.x + fig.max.x) / 2 - s * k.centroX, yCorte - s * k.cintura, fig.min.z - E.kesDist * H - s * k.caja.max.z);   // su frente a kesDist de la espalda
  PLANO_CORTE.set(new THREE.Vector3(0, 1, 0), -yCorte);
  k.yCorte = yCorte;
  if (E.kesAura) {
    AURA = new THREE.Mesh(tuboAura(yCorte, H), matAura);
    AURA.name = "aura";
    AURA.frustumCulled = false;
    MODELO.add(AURA);
    if (E.gris) { MAT_COLOR.set(AURA, matAura); AURA.material = materialGris(matAura); }
  }
}
// el aura que une al keshin con su dueno: de un ovalo en la espalda (a la altura del pecho) al
// corte del keshin, ensanchandose como una llama. Cerrado (con tapas): se imprime macizo
function tuboAura(yCorte, H) {
  const hijo = MODELO.children[0];
  hijo.updateMatrixWorld(true); KESHIN.raiz.updateMatrixWorld(true);
  // la seccion del keshin justo por encima del corte (sus puntos en planta)
  const sec = [], banda = 0.06 * H;
  KESHIN.raiz.traverseVisible(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, paso = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += paso) {
      o.getVertexPosition(i, V); V.applyMatrix4(o.matrixWorld);
      if (V.y >= yCorte && V.y < yCorte + banda) sec.push([V.x, V.z]);
    }
  });
  // la espalda: los puntos del personaje a la altura del pecho, el de mas atras
  const fig = cajaDe(hijo, new THREE.Box3()), yPecho = fig.min.y + Math.min(E.kesAltura * 0.85, 0.62) * (fig.max.y - fig.min.y);
  let bx = 0, n = 0, bz = Infinity;
  hijo.traverseVisible(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, paso = Math.max(1, Math.floor(pos.count / 3000));
    for (let i = 0; i < pos.count; i += paso) {
      o.getVertexPosition(i, V); V.applyMatrix4(o.matrixWorld);
      if (Math.abs(V.y - yPecho) < 0.05 * H) { bx += V.x; n++; bz = Math.min(bz, V.z); }
    }
  });
  bx = n ? bx / n : (fig.min.x + fig.max.x) / 2;
  if (!isFinite(bz)) bz = fig.min.z;
  bz += 0.04 * H;                            // un poco dentro de la espalda
  const N = 48, ANILLOS = 14;
  // el anillo de arriba: el contorno de la seccion del keshin visto desde su centro (o un ovalo)
  let cx = 0, cz = 0;
  for (const [x, z] of sec) { cx += x; cz += z; }
  if (sec.length) { cx /= sec.length; cz /= sec.length; } else { cx = KESHIN.raiz.position.x; cz = KESHIN.raiz.position.z; }
  const arriba = [];
  for (let j = 0; j < N; j++) {
    const a = j / N * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let r = 0;
    for (const [x, z] of sec) {
      const px = x - cx, pz = z - cz, d = Math.hypot(px, pz);
      if (d > 1e-6 && (px * dx + pz * dz) / d > 0.96) r = Math.max(r, d);
    }
    arriba.push(r || 0.12 * H);
  }
  // sin huecos: cada radio, como poco la mitad de la media de sus vecinos
  const media = arriba.reduce((s, x) => s + x, 0) / N;
  for (let j = 0; j < N; j++) arriba[j] = Math.max(arriba[j], media * 0.6) * 0.92;
  // el tubo sigue una curva que sale de la espalda y acaba subiendo en vertical hasta el corte; cada
  // anillo, perpendicular a la curva (con anillos horizontales, un tramo casi horizontal quedaba en
  // una lamina fina que no se imprime)
  const yArriba = yCorte + 0.03 * H;
  const P0 = new THREE.Vector3(bx, yPecho, bz), P2 = new THREE.Vector3(cx, yArriba, cz);
  const P1 = new THREE.Vector3(cx, yPecho + 0.35 * Math.max(0, yArriba - yPecho), cz);
  const enCurva = t => new THREE.Vector3().copy(P0).multiplyScalar((1 - t) * (1 - t))
    .addScaledVector(P1, 2 * t * (1 - t)).addScaledVector(P2, t * t);
  const tangente = t => new THREE.Vector3().subVectors(P1, P0).multiplyScalar(2 * (1 - t))
    .addScaledVector(new THREE.Vector3().subVectors(P2, P1), 2 * t).normalize();
  const pos = [], idx = [], X = new THREE.Vector3(), Z = new THREE.Vector3();
  for (let i = 0; i <= ANILLOS; i++) {
    const t = i / ANILLOS, C = enCurva(t), T = tangente(t);
    X.set(1, 0, 0).addScaledVector(T, -T.x).normalize();
    Z.crossVectors(X, T).normalize();
    for (let j = 0; j < N; j++) {
      const a = j / N * Math.PI * 2;
      const r0x = 0.14 * H, r0z = 0.1 * H;
      const rx = r0x + (arriba[j] - r0x) * Math.pow(t, 0.8), rz = r0z + (arriba[j] - r0z) * Math.pow(t, 0.8);
      const llama = 1 + 0.08 * Math.sin(5 * a + 7 * t) * Math.sin(Math.PI * t);
      const q = C.clone().addScaledVector(X, Math.cos(a) * rx * llama).addScaledVector(Z, Math.sin(a) * rz * llama);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < ANILLOS; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = i * N + (j + 1) % N, c = a + N, d = b + N;
    idx.push(a, c, b, b, c, d);
  }
  const c0 = pos.length / 3; pos.push(P0.x, P0.y, P0.z);
  const c1 = pos.length / 3; pos.push(P2.x, P2.y, P2.z);
  for (let j = 0; j < N; j++) {
    idx.push(c0, j, (j + 1) % N);
    idx.push(c1, ANILLOS * N + (j + 1) % N, ANILLOS * N + j);
  }
  const col = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const t = Math.min(1, Math.max(0, (pos[i * 3 + 1] - yPecho) / Math.max(1e-6, yCorte - yPecho)));
    col.push(0.55 + 0.45 * t, 0.4 + 0.3 * t, 1, 0.15 + 0.6 * t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function pintarEspiritu() {
  const sf = $("#forma"), sk = $("#keshin");
  const es = ESPIRITUS || { keshins: [], formas: [] };
  sf.innerHTML = "";
  sf.append(el("option", { value: "", text: "Normal" }));
  for (const f of es.formas) sf.append(el("option", { value: f.codigo, text: f.nombre }));
  sf.value = E.formaDe === (PERSONAJE && PERSONAJE.codigo) && es.formas.some(f => f.codigo === E.forma) ? E.forma : "";
  sf.disabled = !es.formas.length;
  $("#nota-forma").textContent = es.formas.length ? "" : "Este personaje no tiene armadura, mixi max ni modo propios.";
  sk.innerHTML = "";
  sk.append(el("option", { value: "", text: "Ninguno" }));
  let grupo = null, og = null;
  for (const k of es.keshins) {
    const g = k.suyo ? "Los suyos" : k.familia === "kenshin" ? "Keshin" : "Almas";
    if (g !== grupo) { grupo = g; og = el("optgroup", { label: g }); sk.append(og); }
    og.append(el("option", { value: k.codigo, text: k.nombre }));
  }
  sk.value = es.keshins.some(k => k.codigo === E.keshin) ? E.keshin : "";
  $("#ajustes-keshin").hidden = !E.keshin;
  for (const [id, k] of [["#r-kes-tam", "kesTam"], ["#r-kes-alto", "kesAltura"], ["#r-kes-dist", "kesDist"]]) $(id).value = String(E[k]);
  $("#c-kes-aura").checked = !!E.kesAura;
}

// --------------------------------------------------------------------------- las poses
// Dos clases: las animaciones de su cuerpo (un .glb con esa animacion, ievr/figuras.py) y las
// supertecnicas (la animacion de VR del evento, O-323: las pistas del que la hace en cada corte;
// el momento recorre los cortes seguidos, como se ven en el juego)
let POSES = null, MIXER = null, ACCION = null, REPRODUCIENDO = false, TRAMOS = [], TRAMO = -1;
const POSES_DE = new Map();         // cuerpo -> datos de /api/figuras/poses
const TECNICAS_DE = new Map();      // codigo -> datos de /api/figuras/tecnicas
const GRUPO_SUYAS = "Sus supertécnicas", GRUPO_OTRAS = "Otras supertécnicas";
const claveDe = x => !x || x === "reposo" ? "reposo" : x.tipo === "tecnica" ? "ev:" + x.evento : x.banco.slice(-4) + ":" + x.clip;
async function cargarPoses(tok) {
  const p = PERSONAJE;
  let datos = [...POSES_DE.values()].find(d => d._codigos && d._codigos.has(codigoModelo()));
  if (!datos) {
    $("#poses").innerHTML = "";
    $("#poses").append(el("li", { class: "vacio", text: "Leyendo las poses de este cuerpo en tu juego... (solo la primera vez, unos segundos)" }));
    try {
      datos = await pedir("/api/figuras/poses?codigo=" + encodeURIComponent(codigoModelo()));
    } catch (e) {
      datos = { poses: [], grupos: [], defecto: null, error: e.message };
    }
    if (POSES_DE.has(datos.cuerpo)) datos = POSES_DE.get(datos.cuerpo);
    else if (datos.cuerpo) POSES_DE.set(datos.cuerpo, datos);
    (datos._codigos = datos._codigos || new Set()).add(codigoModelo());
  }
  if (!TECNICAS_DE.has(p.codigo)) {
    const t = await pedir("/api/figuras/tecnicas?codigo=" + encodeURIComponent(p.codigo)).catch(() => ({ tipo: "", tecnicas: [] }));
    TECNICAS_DE.set(p.codigo, t);
  }
  if (tok !== TOKEN) return;
  const tec = TECNICAS_DE.get(p.codigo);
  const tecnicas = tec.tecnicas.map(t => Object.assign({}, t, { tipo: "tecnica", categoria: t.tipo,
    grupo: t.suya ? GRUPO_SUYAS : GRUPO_OTRAS, original: t.evento, cuerpo: datos.cuerpo,
    tipoCuerpo: /^c000\d01$/.test(datos.cuerpo || "") ? "0" + datos.cuerpo[4] : tec.tipo }));
  POSES = { cuerpo: datos.cuerpo, error: datos.error, defecto: datos.defecto,
    poses: datos.poses.length ? [...tecnicas, ...datos.poses] : [],
    grupos: [GRUPO_SUYAS, GRUPO_OTRAS, ...(datos.grupos || [])] };
  // la pose elegida, si este personaje la tiene; si no, la de la ficha
  const k = claveDe(E.pose), igual = POSES.poses.find(x => claveDe(x) === k);
  if (igual) E.pose = igual;
  else if (E.pose !== "reposo") E.pose = datos.defecto ? datos.poses.find(x => x.clip === datos.defecto.clip) || null : null;
  pintarGruposPose();
  pintarPoses();
  await aplicarPose(tok);
}
function pintarGruposPose() {
  const s = $("#f-pose"), antes = s.value;
  s.innerHTML = "";
  s.append(el("option", { value: "", text: "Todas (" + POSES.poses.length + ")" }));
  for (const g of POSES.grupos) {
    const n = POSES.poses.filter(x => x.grupo === g).length;
    if (n) s.append(el("option", { value: g, text: g + " (" + n + ")" }));
  }
  // el grupo de la pose elegida (si no, el que estaba o las posturas del juego)
  const quiere = E.pose && E.pose !== "reposo" ? E.pose.grupo : antes || "Posturas del juego";
  s.value = [...s.options].some(o => o.value === quiere) ? quiere : "";
}
function pintarPoses() {
  // lo que se busca, en todos los grupos
  const ul = $("#poses"), txt = $("#buscar-pose").value.trim().toLowerCase(), g = txt ? "" : $("#f-pose").value;
  ul.innerHTML = "";
  if (!POSES) return;
  if (POSES.error) { ul.append(el("li", { class: "vacio", text: "No se han podido leer las poses: " + POSES.error })); return; }
  const actual = claveDe(E.pose);
  if (!txt && (!g || g === "Posturas del juego")) {
    const b = el("button", { type: "button", "aria-current": E.pose === "reposo" ? "true" : "false",
      onclick: () => elegirPose("reposo") }, [el("span", { text: "Pose de referencia (la del modelo, sin animar)" })]);
    ul.append(el("li", {}, [b]));
  }
  let grupo = "", n = 0;
  for (const x of POSES.poses) {
    if (g && x.grupo !== g) continue;
    if (txt && !(x.nombre.toLowerCase().includes(txt) || x.original.includes(txt))) continue;
    // sin filtro, de las otras supertecnicas solo las que se buscan (son casi 900)
    if (!g && !txt && x.grupo === GRUPO_OTRAS) continue;
    if (!g && x.grupo !== grupo) { grupo = x.grupo; ul.append(el("li", { class: "grupo-pose", text: grupo })); }
    const ico = x.tipo === "tecnica" && x.elemento ? iconoElemento(x.elemento, 16) : null;
    if (ico) ico.classList.add("ico-pose");
    const b = el("button", { type: "button", title: x.tipo === "tecnica" ? "Supertécnica" + (x.categoria ? " de " + x.categoria.toLowerCase() : "") : x.original,
      "aria-current": claveDe(x) === actual ? "true" : "false", onclick: () => elegirPose(x) }, [ico, el("span", { text: x.nombre }),
      x.segundos > 0.05 ? el("small", { text: x.segundos.toLocaleString("es", { maximumFractionDigits: 1 }) + " s" }) : null]);
    ul.append(el("li", {}, [b]));
    n++;
  }
  if (!g && !txt && POSES.poses.some(x => x.grupo === GRUPO_OTRAS))
    ul.append(el("li", { class: "vacio", text: "Las demás supertécnicas del juego están en el grupo «" + GRUPO_OTRAS + "» o buscándolas por su nombre." }));
  else if (!n) ul.append(el("li", { class: "vacio", text: "Ninguna pose con eso." }));
  // la elegida a la vista, moviendo solo la lista (no la pagina)
  const cur = ul.querySelector('[aria-current="true"]');
  if (cur && (cur.offsetTop < ul.scrollTop || cur.offsetTop + cur.offsetHeight > ul.scrollTop + ul.clientHeight))
    ul.scrollTop = cur.offsetTop - ul.clientHeight / 2;
}
async function elegirPose(x) {
  E.pose = x;
  if (x !== "reposo") E.momento = x.tipo === "tecnica" ? 0.4 : x.bucle ? 0 : 0.5;
  REPRODUCIENDO = false;
  guardar();
  pintarPoses();
  await aplicarPose(TOKEN);
  encuadrar(true);
}
// que el servidor tenga convertida la animacion de una supertecnica para su tipo de cuerpo
async function asegurarEvento(x, tok, tipos, asignados) {
  const pide = { evento: x.evento, tipos: tipos || [x.tipoCuerpo], asignados: asignados || [] };
  let e = await POST("/api/figuras/evento", pide);
  for (let vueltas = 1; ; vueltas++) {
    if (tok !== TOKEN || E.pose !== x) return false;
    if (e.error) throw new Error(e.error);
    const ev = e.eventos || {};
    if ((ev.errores || {})[x.evento]) throw new Error(ev.errores[x.evento]);
    if ((ev.hechos || []).includes(x.evento)) return true;
    estado("Sacando la supertécnica de tu juego...", "Solo la primera vez; luego sale al momento.");
    await esperar(800);
    e = vueltas % 15 ? await pedir("/api/figuras/estado") : await POST("/api/figuras/evento", pide);
  }
}
// los cortes de la supertecnica en los que sale el que la hace, con sus pistas
async function tramosDeTecnica(x, tok) {
  if (!await asegurarEvento(x, tok)) return null;
  estado("Cargando la supertécnica...", "");
  const base = "/api/figuras/evento/" + encodeURIComponent(x.evento) + "/";
  const [esc, g] = await Promise.all([pedir(base + "escena.json"), cargarGlb(base + "pistas_" + x.cuerpo + ".glb")]);
  estado(null);
  const pref = x.actor + "|", vis = (esc.visible || {})[x.actor], fps = esc.fps || 60;
  const seVe = f => { if (!vis) return true; let v = false; for (const [fr, si] of vis) if (fr <= f) v = !!si; return v; };
  const tramos = [];
  for (const c of esc.cortes || []) {
    const clip = g.animations.find(a => a.name === c.nombre);
    if (!clip) continue;
    const pistas = clip.tracks.filter(t => t.name.startsWith(pref)).map(t => { const n = t.clone(); n.name = t.name.slice(pref.length); return n; });
    let visto = false;
    for (let f = c.ini; f < c.fin && !visto; f += 3) visto = seVe(f + 1);
    if (!pistas.length || !visto) continue;
    const dur = Math.max(1, c.fin - c.ini) / fps;
    tramos.push({ clip: new THREE.AnimationClip(c.nombre, dur, pistas), dur, ini: c.ini / (esc.fps || EVENTO_VR.fps) });
  }
  if (!tramos.length) throw new Error("en esta supertécnica no sale quien la hace");
  return tramos;
}
async function aplicarPose(tok) {
  if (!MODELO) return;
  const root = MODELO.children[0];
  if (MIXER) { MIXER.stopAllAction(); MIXER.uncacheRoot(root); }
  MIXER = null; ACCION = null; TRAMOS = []; TRAMO = -1;
  quitarEvento();
  volverAlReposo();
  const x = E.pose;
  pintarTecnica();
  if (!x || x === "reposo" || !PERSONAJE) { pintarMomento(); recolocar(); return; }
  try {
    let tramos;
    if (x.tipo === "tecnica") {
      tramos = await tramosDeTecnica(x, tok);
      if (!tramos) return;
    } else {
      const g = await cargarGlb("/api/figuras/pose?" + new URLSearchParams({ codigo: codigoModelo(), banco: x.banco, clip: x.clip }));
      const clip = g.animations[0];
      if (!clip) throw new Error("la animación está vacía");
      tramos = [{ clip, dur: clip.duration }];
    }
    if (tok !== TOKEN || E.pose !== x) return;
    MIXER = new THREE.AnimationMixer(root);
    TRAMOS = tramos;
    if (x.tipo === "tecnica") {
      try { await cargarEvento(x, tok); } catch (e) { avisa("No se han podido poner los efectos: " + (e.message || e), "mal"); }
      if (tok !== TOKEN || E.pose !== x) return;
    }
    ponerMomento(E.momento);
  } catch (e) {
    estado(null);
    avisa("No se ha podido poner esa pose: " + (e.message || e), "mal");
  }
  pintarMomento();
}
const duracion = () => TRAMOS.reduce((s, t) => s + t.dur, 0);
// el tramo y el segundo dentro de el de un momento (0..1) de toda la animacion
function tramoEn(f) {
  let t = f * duracion(), i = 0;
  while (i < TRAMOS.length - 1 && t > TRAMOS[i].dur) { t -= TRAMOS[i].dur; i++; }
  return [i, Math.min(TRAMOS[i].dur, Math.max(0, t))];
}
let ultimaCaja = 0;
function ponerMomento(f, rapido) {
  if (!MIXER || !TRAMOS.length) return;
  const [i, t] = tramoEn(f);
  if (i !== TRAMO) {
    MIXER.stopAllAction();
    volverAlReposo();
    ACCION = MIXER.clipAction(TRAMOS[i].clip);
    ACCION.play();
    TRAMO = i;
  }
  ACCION.time = t;
  MIXER.update(0);
  if (EVENTO) ponerEvento((TRAMOS[i].ini || 0) + t, rapido);
  // mientras se reproduce, la figura se recoloca de vez en cuando (medirla entera cuesta)
  const ahora = performance.now();
  if (!rapido || ahora - ultimaCaja > 250) { ultimaCaja = ahora; recolocar(); }
}
function pintarMomento() {
  const dur = duracion();
  $("#momento").hidden = !(dur > 0.05);
  $("#r-momento").value = String(Math.round(E.momento * 1000));
  const parte = TRAMOS.length > 1 ? "parte " + (tramoEn(E.momento)[0] + 1) + "/" + TRAMOS.length + " · " : "";
  $("#o-momento").textContent = parte + (E.momento * dur).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " s";
  $("#b-play").textContent = REPRODUCIENDO ? "❚❚" : "▶";
}

// --------------------------------------------------------------------------- la supertecnica entera
// Puntos 2 y 3 de Aaron: "que en las animaciones de tecnicas salgan tambien los efectos, que sean
// opcionales (en escudo barbaro sale un escudo)" y "en las supertecnicas combinadas, poder elegir si
// sale tambien el otro jugador y elegir al otro jugador". Con el reproductor de las animaciones de
// VR del partido (partido-eventosvr.js, O-323): sus efectos, el balon, el keshin de la tecnica y
// los demas jugadores del guion, en el mismo marco que la figura (que sigue posada aqui).
let EVENTO = null;
function quitarEvento() {
  if (EVENTO) { try { EVENTO.ev.soltar(); } catch (e) { console.warn(e); } }
  EVENTO = null;
}
const otrosDe = x => (x && x.roles || []).filter(r => r.actor !== x.actor);
const rolDe = x => ((x.roles || []).find(r => r.actor === x.actor) || {}).rol || "h0";
// lo elegido para un jugador del guion (se recuerda por tecnica): {on, codigo}; codigo "" = una
// copia del que la hace (el clon de Sombra de Orion)
function otroConf(x, r, i) {
  const t = E.tecOtros[x.evento] || (E.tecOtros[x.evento] = {});
  if (!t[r.actor]) {
    const copia = r.rol === rolDe(x), rival = r.rol.startsWith("r");
    // los que la tienen en su arbol: primero los jugadores del mismo juego que el
    const peso = c => { const p = PERSONAJES.find(z => z.codigo === c); return !p ? 9 : (p.saga === PERSONAJE.saga ? 0 : 2) + (p.apt === "jugador" ? 0 : 1) + (p.grupo === "personaje" ? 0 : 4); };
    const suyos = (x.con || []).filter(c => PERSONAJES.some(p => p.codigo === c)).sort((a, b) => peso(a) - peso(b));
    const otro = (PERSONAJES.find(p => p.codigo === "c01000010" && p.codigo !== PERSONAJE.codigo) || PERSONAJES.find(p => p.codigo !== PERSONAJE.codigo) || {}).codigo;
    t[r.actor] = { on: copia, codigo: copia ? "" : rival ? otro : (suyos[i] || suyos[0] || otro) };
  }
  return t[r.actor];
}
const nombreRol = (x, r) => r.rol === rolDe(x) ? "Su copia" : r.rol.startsWith("r") ? "Rival" + (r.rol.length > 2 || r.rol !== "r0" ? " " + (Number(r.rol.slice(1)) + 1) : "")
  : "Compañero" + (otrosDe(x).filter(z => z.rol.startsWith("h") && z.rol !== rolDe(x)).length > 1 ? " " + r.rol.slice(1) : "");
const quiereEvento = x => !!x && x.tipo === "tecnica" && (E.efectos || E.balon || otrosDe(x).some((r, i) => otroConf(x, r, i).on));
// el keshin de una tecnica de keshin: el de detras, el suyo o uno cualquiera
const keshinDeTecnica = () => E.keshin || (((ESPIRITUS || {}).keshins || []).find(k => k.suyo) || ((ESPIRITUS || {}).keshins || [])[0] || {}).codigo || null;
async function cargarEvento(x, tok) {
  quitarEvento();
  if (!quiereEvento(x) || !MODELO) return;
  const actores = {}, tipos = new Set([x.tipoCuerpo]);
  otrosDe(x).forEach((r, i) => {
    const o = otroConf(x, r, i);
    if (!o.on) return;
    const cod = o.codigo || codigoModelo();
    actores[r.actor] = "fig:" + (!o.codigo ? "yo" : r.rol.startsWith("r") ? "rival" : "comp" + i) + ":" + cod;
    const p = PERSONAJES.find(z => z.codigo === cod);
    tipos.add(p && p.tc ? p.tc : x.tipoCuerpo);
  });
  const asignado = x.asignado && E.efectos ? keshinDeTecnica() : null;
  if (!await asegurarEvento(x, tok, [...tipos], asignado ? [asignado] : [])) return;
  if (asignado && !await asegurar([asignado], tok)) return;
  estado("Montando la supertécnica...", "");
  const modelo = async cod => {
    if (cod.startsWith("fig:")) {
      const [, papel, c] = cod.split(":");
      const op = papel === "yo" ? Object.assign({}, E, { dorsal: E.conDorsal ? E.dorsal : null })
        : papel === "rival" ? { equipacion: "propia", dorsal: null }
        : Object.assign({}, E, { portero: false, capitan: false, dorsal: E.conDorsal ? (E.dorsal + 1 + Number(papel.slice(4))) % 100 : null });
      const r = await modeloDe(c, op, tok);
      return r && r.gltf;
    }
    if (!await asegurar([cod], tok)) return null;
    return cargarGlb(urlModelo(cod));
  };
  try {
    const ev = await EventoVR.cargar(x.evento, { modelo, actores, asignado, base: "/api/figuras/evento/", elemento: x.elemento || null });
    if (tok !== TOKEN || E.pose !== x || !MODELO) { ev.soltar(); return; }
    ev.sinCamara = true;
    ev.camara.aspect = camara.aspect;
    EVENTO = { ev, x };
    MODELO.add(ev.raiz);
    ev.raiz.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    // el fondo que pone la supertecnica detras (_000_bg, _050_c02_back_b2: mallas de decenas de
    // metros que oscurecen la pantalla en VR): en una figura no va
    ev.poner(0);
    ev.raiz.updateMatrixWorld(true);
    EVENTO.fondos = [];
    ev.escena.scene.traverse(o => {
      if (!o.isMesh) return;
      const t = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      if (/(^|[_|])bg($|[_\d])|_back_[a-z]\d|sky|dome/i.test(o.name) || Math.max(t.x, t.y, t.z) > 8 * ALTO_DE_PIE) EVENTO.fondos.push(o);
    });
    aplicarGris();
  } finally { estado(null); }
}
// lo que se ve de la animacion segun lo elegido (el reproductor lo vuelve a poner en cada cuadro)
function ponerVisiblesEvento() {
  if (!EVENTO) return;
  const ev = EVENTO.ev, efectos = !!E.efectos && !E.gris;
  ev.escena.scene.visible = efectos;
  for (const o of EVENTO.fondos || []) o.visible = false;
  if (ev.particulas) ev.particulas.raiz.visible = efectos;
  for (const a of Object.values(ev.actores)) {
    if (!a.nodo) continue;
    if (a.tipo === "balon" && !E.balon) a.nodo.visible = false;
    if ((a.tipo === "modelo" || a.tipo === "asignado") && !E.efectos) a.nodo.visible = false;
  }
}
// el instante tEv (s) de la animacion; las particulas de VR se simulan desde un poco antes (al
// saltar empiezan vacias)
function ponerEvento(tEv, rapido) {
  const ev = EVENTO.ev;
  if (!rapido && ev.particulas && E.efectos) for (let s = Math.max(0, tEv - 1.2); s < tEv - 1e-4; s += 1 / 30) ev.poner(s);
  ev.poner(tEv);
  ponerVisiblesEvento();
}
// los jugadores de la supertecnica, debajo de la lista de poses
function pintarTecnica() {
  const x = E.pose, caja = $("#tecnica-extras");
  caja.hidden = !(x && x.tipo === "tecnica");
  if (caja.hidden) return;
  $("#c-efectos").checked = !!E.efectos; $("#c-balon").checked = !!E.balon;
  const lista = $("#otros-jugadores");
  lista.innerHTML = "";
  otrosDe(x).forEach((r, i) => {
    const o = otroConf(x, r, i);
    const p = o.codigo ? PERSONAJES.find(z => z.codigo === o.codigo) : null;
    const chk = el("input", { type: "checkbox" });
    chk.checked = !!o.on;
    chk.onchange = () => { o.on = chk.checked; guardar(); aplicarPose(TOKEN); };
    const quien = o.codigo ? el("button", { class: "quien", type: "button", title: "Elegir quién sale", onclick: () => elegirOtro(x, r, i) }, [
      el("img", { src: p && p.cara ? "/cara/" + p.cara : SILUETA, alt: "" }), el("span", { text: p ? p.nombre : o.codigo }), el("small", { text: "Cambiar" })])
      : el("span", { class: "quien", text: "El mismo personaje" });
    lista.append(el("div", { class: "fila-conf" }, [el("label", { class: "et", text: nombreRol(x, r) }),
      el("label", { class: "interruptor" }, [chk]), quien]));
  });
  if (!otrosDe(x).length) lista.append(el("p", { class: "nota", text: "En esta supertécnica solo sale él." }));
}
// elegir al otro jugador (como la lista de personajes, en una ventana)
function elegirOtro(x, r, i) {
  const busca = el("input", { type: "search", placeholder: "Buscar personaje o equipo..." });
  const rejilla = el("div", { class: "rejilla lista-otros" });
  const caja = el("div", { class: "modal otros" }, [
    el("div", { class: "cab" }, [el("h3", { text: nombreRol(x, r) + " en " + x.nombre }),
      el("p", { text: "Primero los que la tienen en su árbol." })]),
    el("div", { class: "busca" }, [busca]), rejilla,
    el("div", { class: "pie" }, [el("span", { text: "" }), el("button", { class: "btn", type: "button", text: "Cerrar", onclick: () => cerrar() })])]);
  const fondo = el("div", { class: "fondo-modal", onclick: e => { if (e.target === fondo) cerrar(); } }, [caja]);
  const antes = document.onkeydown;
  function cerrar() { fondo.remove(); document.onkeydown = antes; }
  document.onkeydown = e => { if (e.key === "Escape") cerrar(); };
  const suyos = new Set(x.con || []);
  const orden = [...PERSONAJES.filter(p => suyos.has(p.codigo)), ...PERSONAJES.filter(p => !suyos.has(p.codigo) && p.grupo !== "avatar")];
  function pintar() {
    const t = busca.value.trim().toLowerCase();
    rejilla.innerHTML = "";
    for (const p of orden.filter(p => !t || p.nombre.toLowerCase().includes(t) || (p.equipo || "").toLowerCase().includes(t)).slice(0, 150))
      rejilla.append(fichaMini(p, () => { cerrar(); const o = otroConf(x, r, i); o.codigo = p.codigo; o.on = true; guardar(); pintarTecnica(); aplicarPose(TOKEN); }));
  }
  busca.oninput = pintar;
  pintar();
  document.body.append(fondo);
  busca.focus();
}

// --------------------------------------------------------------------------- la lista de personajes
let MOSTRAR = 120;
function filtrados() {
  const txt = $("#buscar").value.trim().toLowerCase(), g = $("#f-grupo").value, s = $("#f-saga").value;
  const deTipo = p => !g || (g === "jugable" ? p.jugable : g === "nojugable" ? !p.jugable && !["armadura", "avatar"].includes(p.grupo) : p.grupo === g);
  return PERSONAJES.filter(p => deTipo(p) && (!s || p.saga === s) &&
    (!txt || p.nombre.toLowerCase().includes(txt) || (p.equipo || "").toLowerCase().includes(txt) || p.codigo.includes(txt)));
}
function pintarLista() {
  const lista = $("#lista"), todos = filtrados();
  lista.innerHTML = "";
  $("#contador").textContent = todos.length.toLocaleString("es") + " modelos";
  for (const p of todos.slice(0, MOSTRAR)) {
    const f = fichaMini(p, elegirPersonaje);
    if (PERSONAJE && p.codigo === PERSONAJE.codigo) f.setAttribute("aria-current", "true");
    lista.append(f);
  }
  if (todos.length > MOSTRAR)
    lista.append(el("button", { class: "btn chico mas", type: "button", text: "Mostrar más (" + (todos.length - MOSTRAR) + ")",
      onclick: () => { MOSTRAR += 240; pintarLista(); } }));
}
function elegirPersonaje(p) {
  if (PERSONAJE && PERSONAJE.codigo !== p.codigo) { E.forma = ""; E.keshin = ""; E.ojos = null; E.boca = null; }
  PERSONAJE = p;
  E.codigo = p.codigo;
  if (p.portero !== undefined && E.equipacion !== "propia") E.portero = !!p.portero;
  guardar();
  document.querySelectorAll("#lista .ficha-mini[aria-current]").forEach(x => x.removeAttribute("aria-current"));
  pintarLista();
  pintarConfig();
  if (MODELO) { escena.remove(MODELO); MODELO = null; }
  peana.clear();
  MEDIDAS = null; pintarMedidas();
  montar().then(() => encuadrar());
}
function pintarEncabezado() {
  const p = PERSONAJE;
  $("#nombre-fig").textContent = p ? p.nombre : "Figuras 3D";
  const eq = E.equipacion === "propia" || !p || !p.viste ? (p && p.viste ? "Con su ropa de siempre" : "Con lo suyo")
    : (EQUIPACIONES.find(x => x.id === E.equipacion) || {}).nombre || "";
  $("#sub-fig").textContent = [p && p.saga, eq, p && p.viste && E.conDorsal ? "Dorsal " + E.dorsal : "", p && p.viste && E.capitan ? "Capitán" : ""]
    .filter(Boolean).join(" · ");
}

// --------------------------------------------------------------------------- la equipacion, el dorsal y el capitan
function pintarConfig() {
  const p = PERSONAJE || {}, viste = !!p.viste;
  const eq = EQUIPACIONES.find(x => x.id === E.equipacion);
  const propia = E.equipacion === "propia" || !eq;
  $("#eq-nombre").textContent = !viste ? "Lleva siempre lo suyo" : propia ? "Su ropa de siempre" : eq.nombre;
  $("#eq-sub").textContent = !viste ? "Este modelo no se puede vestir con otra ropa" : propia ? "La de su equipo en la historia" : eq.obtenible ? "Equipación del juego" : "Equipación de un equipo de la historia";
  const ico = $("#eq-icono");
  ico.src = !propia && viste && eq.icono ? "/icono/" + eq.icono : (p.cara ? "/cara/" + p.cara : SILUETA);
  ico.onerror = () => { ico.onerror = null; ico.src = SILUETA; };
  $("#b-equipacion").disabled = !viste;
  const disenos = propia ? ["0"] : eq.disenos;
  document.querySelectorAll("#disenos button").forEach(b => {
    b.disabled = !viste || !disenos.includes(b.dataset.d);
    b.setAttribute("aria-pressed", String(b.dataset.d === (disenos.includes(E.diseno) ? E.diseno : "0")));
  });
  $("#c-portero").checked = !!E.portero; $("#c-portero").disabled = !viste || propia;
  $("#dorsal").value = String(E.dorsal); $("#c-dorsal").checked = !!E.conDorsal;
  for (const x of ["#dorsal", "#dorsal-menos", "#dorsal-mas"]) $(x).disabled = !viste || !E.conDorsal;
  $("#c-dorsal").disabled = !viste;
  $("#c-capitan").checked = !!E.capitan; $("#c-capitan").disabled = !viste;
  $("#altura").value = String(E.altura); $("#c-peana").checked = !!E.peana; $("#c-grosor").checked = !!E.grosor; $("#c-suavizar").checked = !!E.suavizar; $("#c-efectos-descarga").checked = !!E.efectosDescarga;
  $("#b-girar").classList.toggle("activo", !!E.girar);
  pintarEncabezado();
}
let esperaVestir = null;
function cambiar(campos, sinMontar) {
  Object.assign(E, campos);
  guardar();
  pintarConfig();
  if (sinMontar) return;
  clearTimeout(esperaVestir);           // el dorsal se escribe: se espera a que acabe
  esperaVestir = setTimeout(() => montar(), 180);
}
function ventanaEquipaciones() {
  const busca = el("input", { type: "search", placeholder: "Buscar equipación o equipo..." });
  const ul = el("ul");
  const caja = el("div", { class: "modal equipaciones" }, [
    el("div", { class: "cab" }, [el("h3", { text: "Equipación" }), el("p", { text: "Todas las del juego: las de la mochila y las de los equipos de la historia." })]),
    el("div", { class: "busca" }, [busca]), ul,
    el("div", { class: "pie" }, [el("span", { text: EQUIPACIONES.length + " equipaciones" }),
      el("button", { class: "btn", type: "button", text: "Cerrar", onclick: () => cerrar() })])]);
  const fondo = el("div", { class: "fondo-modal", onclick: e => { if (e.target === fondo) cerrar(); } }, [caja]);
  const antes = document.onkeydown;
  function cerrar() { fondo.remove(); document.onkeydown = antes; }
  document.onkeydown = e => { if (e.key === "Escape") cerrar(); };
  const elegir = id => { cerrar(); cambiar({ equipacion: id, diseno: "0", portero: id === "propia" ? false : !!(PERSONAJE && PERSONAJE.portero) }); };
  function pintar() {
    const t = busca.value.trim().toLowerCase();
    ul.innerHTML = "";
    const item = (id, nombre, icono) => el("li", {}, [el("button", { type: "button", "aria-current": String(E.equipacion === id),
      onclick: () => elegir(id) }, [el("img", { src: icono, alt: "", loading: "lazy", onerror: function () { this.onerror = null; this.src = SILUETA; } }),
      el("span", { text: nombre })])]);
    if (!t || "su ropa de siempre".includes(t)) ul.append(item("propia", "Su ropa de siempre", PERSONAJE && PERSONAJE.cara ? "/cara/" + PERSONAJE.cara : SILUETA));
    let seccion = null;
    for (const x of EQUIPACIONES) {
      if (t && !x.nombre.toLowerCase().includes(t)) continue;
      const s = x.obtenible ? "De la mochila" : "De los equipos de la historia";
      if (s !== seccion) { seccion = s; ul.append(el("li", { class: "seccion-eq seccion-nav" }, [el("h4", { text: s })])); }
      ul.append(item(x.id, x.nombre, x.icono ? "/icono/" + x.icono : SILUETA));
    }
  }
  busca.oninput = pintar;
  pintar();
  document.body.append(fondo);
  busca.focus();
  const cur = ul.querySelector('[aria-current="true"]');
  if (cur) cur.scrollIntoView({ block: "center" });
}

// --------------------------------------------------------------------------- la descarga
// Cada malla visible con su piel aplicada (la pose de ahora), en el espacio de la escena; las
// caras de las partes transparentes del todo (puntas de pelo recortadas) fuera.
const PIXELES = new WeakMap();
function pixelesDe(tex) {
  const im = tex && tex.image;
  if (!im || !im.width) return null;
  if (!PIXELES.has(im)) {
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const k = c.getContext("2d", { willReadFrequently: true });
    k.drawImage(im, 0, 0);
    PIXELES.set(im, { w: im.width, h: im.height, d: k.getImageData(0, 0, im.width, im.height).data, lienzo: c });
  }
  return PIXELES.get(im);
}
function alfaEn(px, u, v) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(px.w - 1, Math.floor(u * px.w)), y = Math.min(px.h - 1, Math.floor(v * px.h));
  return px.d[(y * px.w + x) * 4 + 3] / 255;
}
// lo que se descarga: la figura, el keshin (cortado) con su aura y, de la animacion de VR, los
// demas jugadores, el balon si se ve y los efectos si se piden ("Efectos en la descarga")
function raicesDescarga() {
  const r = [{ o: MODELO.children[0] }];
  if (KESHIN) r.push({ o: KESHIN.raiz, corte: KESHIN.yCorte });
  if (AURA) r.push({ o: AURA });
  if (EVENTO) {
    for (const a of Object.values(EVENTO.ev.actores)) if (a.nodo && a.tipo !== "efecto") r.push({ o: a.nodo });
    if (E.efectos && E.efectosDescarga) r.push({ o: EVENTO.ev.escena.scene, efecto: true });
  }
  return r;
}
// se ve de verdad (el y todos los de encima)
function seVe(o, hasta) {
  for (let x = o; x && x !== hasta; x = x.parent) if (!x.visible) return false;
  return true;
}
// un triangulo cortado por la altura y (se queda lo de encima): 0, 1 o 2 triangulos de vertices
// nuevos [x, y, z, u, v]
function cortarTriangulo(t, y) {
  const fuera = [];
  for (let i = 0; i < 3; i++) {
    const a = t[i], b = t[(i + 1) % 3], da = a[1] - y, db = b[1] - y;
    if (da >= 0) fuera.push(a);
    if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); fuera.push(a.map((v, j) => v + (b[j] - v) * k)); }
  }
  const tri = [];
  for (let i = 1; i + 1 < fuera.length; i++) tri.push([fuera[0], fuera[i], fuera[i + 1]]);
  return tri;
}
function hornear() {
  MODELO.updateMatrixWorld(true);
  const piezas = [];
  for (const R of raicesDescarga()) {
    R.o.traverse(o => {
      if (!o.isMesh || esParticula(o) || !seVe(o, MODELO)) return;
      const geo = o.geometry, pos = geo.attributes.position, uvA = geo.attributes.uv;
      if (!pos) return;
      const mc = MAT_COLOR.get(o) || o.material;
      const mats = [].concat(mc);
      const grupos = Array.isArray(mc) && geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
      const p = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, V); V.applyMatrix4(o.matrixWorld); p[i * 3] = V.x; p[i * 3 + 1] = V.y; p[i * 3 + 2] = V.z; }
      for (const gr of grupos) {
        const m = mats[gr.materialIndex] || mats[0];
        if (!m || m.visible === false || esPlacaNombre(m)) continue;
        if (R.efecto && m.transparent && m.opacity < 0.15) continue;
        // los efectos con su sombreador de VR: el material de antes, para el color
        const mt0 = m.isShaderMaterial && m.userData && m.userData.base ? m.userData.base : m;
        // la UV con el desplazamiento de su textura (el dorsal, la cara de los ojos y la boca)
        let uv = null;
        if (uvA) {
          uv = new Float32Array(pos.count * 2);
          const mt = mt0.map ? (mt0.map.updateMatrix(), mt0.map.matrix) : null, w = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            w.set(uvA.getX(i), uvA.getY(i), 1);
            if (mt) w.applyMatrix3(mt);
            uv[i * 2] = w.x; uv[i * 2 + 1] = w.y;
          }
        }
        const px = uv && mt0.map && (mt0.alphaTest > 0 || mt0.transparent) && !R.efecto ? pixelesDe(mt0.map) : null;
        const idx = [];
        for (let k = gr.start; k < gr.start + gr.count; k += 3) {
          const a = geo.index ? geo.index.getX(k) : k, b = geo.index ? geo.index.getX(k + 1) : k + 1, c = geo.index ? geo.index.getX(k + 2) : k + 2;
          if (px) {
            const corte = Math.max(0.5, mt0.alphaTest || 0.5);
            const cu = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, cv = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
            if (alfaEn(px, uv[a * 2], uv[a * 2 + 1]) < corte && alfaEn(px, uv[b * 2], uv[b * 2 + 1]) < corte &&
                alfaEn(px, uv[c * 2], uv[c * 2 + 1]) < corte && alfaEn(px, cu, cv) < corte) continue;
          }
          idx.push(a, b, c);
        }
        if (!idx.length) continue;
        let pieza = { nombre: o.name || "pieza", pos: p, uv, idx: Uint32Array.from(idx), mat: mt0, piel: o.userData.piel || null };
        // el keshin, cortado por la cintura como se ve
        if (R.corte !== undefined) pieza = cortarPieza(pieza, R.corte);
        if (pieza.idx.length) piezas.push(pieza);
      }
    });
  }
  return piezas;
}
function cortarPieza(pz, y) {
  const P = [], U = [], I = [], conUV = !!pz.uv;
  const vert = i => conUV ? [pz.pos[i * 3], pz.pos[i * 3 + 1], pz.pos[i * 3 + 2], pz.uv[i * 2], pz.uv[i * 2 + 1]]
    : [pz.pos[i * 3], pz.pos[i * 3 + 1], pz.pos[i * 3 + 2]];
  for (let k = 0; k < pz.idx.length; k += 3) {
    const t = [vert(pz.idx[k]), vert(pz.idx[k + 1]), vert(pz.idx[k + 2])];
    for (const tri of (t[0][1] >= y && t[1][1] >= y && t[2][1] >= y) ? [t] : cortarTriangulo(t, y)) {
      for (const v of tri) { I.push(P.length / 3); P.push(v[0], v[1], v[2]); if (conUV) U.push(v[3], v[4]); }
    }
  }
  return Object.assign({}, pz, { pos: Float32Array.from(P), uv: conUV ? Float32Array.from(U) : null, idx: Uint32Array.from(I) });
}

// a milimetros y de pie (Z arriba, como en los programas de las impresoras). La altura 0 del
// modelo es el suelo (recolocar() pone la figura encima de la peana) y la figura esta centrada en
// el origen. -> {piezas (con mm), peana (malla en mm) o null}
function aMilimetros(piezas) {
  const s = E.altura / ALTO_DE_PIE;
  const pz = MEDIDAS ? MEDIDAS.peana : null;
  for (const p of piezas) {
    const q = new Float32Array(p.pos.length);
    for (let i = 0; i < p.pos.length; i += 3) {
      q[i] = p.pos[i] * s; q[i + 1] = -p.pos[i + 2] * s; q[i + 2] = p.pos[i + 1] * s;     // Y arriba -> Z arriba
    }
    p.mm = q;
  }
  const base = E.peana && pz ? cilindro(0, -(pz.cz2 || 0) * s, pz.radio * s, pz.alto * s, 0.8) : null;
  return { piezas, base };
}
// la peana: un cilindro con el borde de arriba biselado (cerrado: tapa, lado, bisel y fondo)
function cilindro(cx, cy, r, h, bisel) {
  const n = 96, pos = [], idx = [];
  const anillo = (rr, z) => { const i0 = pos.length / 3; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; pos.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a), z); } return i0; };
  const abajo = anillo(r, 0), medio = anillo(r, h - bisel), arriba = anillo(r - bisel, h);
  const cAbajo = pos.length / 3; pos.push(cx, cy, 0);
  const cArriba = pos.length / 3; pos.push(cx, cy, h);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    idx.push(cAbajo, abajo + k1, abajo + k);                                   // fondo (mira abajo)
    idx.push(abajo + k, abajo + k1, medio + k1, abajo + k, medio + k1, medio + k); // lado
    idx.push(medio + k, medio + k1, arriba + k1, medio + k, arriba + k1, arriba + k); // bisel
    idx.push(cArriba, arriba + k, arriba + k1);                                // tapa
  }
  return { mm: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

// Para imprimir (O-347): las mallas del juego son superficies pensadas para verse, no para
// imprimirse. Cada pieza se suelda (el juego duplica los vertices en las costuras de la textura)
// y se separa en trozos conexos; a cada trozo:
// - suavizar: dos pasadas de subdivision de Loop. Los modelos de VR tienen pocos triangulos
//   (la cabeza de Mark, unos 1.100) y a 10 cm se verian las facetas;
// - grosor: lo que no encierra volumen (puntas de pelo, pestanas, flecos: mucho borde abierto o
//   diminuto) no se imprime; se convierte en una lamina cerrada de GROSOR mm, dos copias
//   desplazadas por su normal (media a cada lado) y una pared en el borde.
const GROSOR = 0.8;
function soldar(pos, idx) {
  const clave = new Map(), sold = new Int32Array(pos.length / 3), P = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const k = Math.round(pos[i * 3] * 500) + "," + Math.round(pos[i * 3 + 1] * 500) + "," + Math.round(pos[i * 3 + 2] * 500);
    let j = clave.get(k);
    if (j === undefined) { j = P.length / 3; clave.set(k, j); P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); }
    sold[i] = j;
  }
  const T = [];
  for (let k = 0; k < idx.length; k += 3) {
    const a = sold[idx[k]], b = sold[idx[k + 1]], c = sold[idx[k + 2]];
    if (a !== b && b !== c && a !== c) T.push(a, b, c);
  }
  return { P, T };
}
// los trozos conexos (por vertices compartidos), cada uno con sus vertices renumerados
function trozos({ P, T }) {
  const nv = P.length / 3, padre = new Int32Array(nv).map((_, i) => i);
  const raizDe = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  for (let k = 0; k < T.length; k += 3) {
    const a = raizDe(T[k]);
    padre[raizDe(T[k + 1])] = a;
    padre[raizDe(T[k + 2])] = a;
  }
  const grupos = new Map();
  for (let k = 0; k < T.length; k += 3) {
    const r = raizDe(T[k]);
    let g = grupos.get(r);
    if (!g) grupos.set(r, g = { P: [], T: [], mapa: new Map() });
    for (let e = 0; e < 3; e++) {
      const v = T[k + e];
      let j = g.mapa.get(v);
      if (j === undefined) { j = g.P.length / 3; g.mapa.set(v, j); g.P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
      g.T.push(j);
    }
  }
  return [...grupos.values()];
}
// las aristas: clave -> {a, b, op: [los vertices de enfrente]}
function aristasDe({ P, T }) {
  const nv = P.length / 3, A = new Map();
  for (let k = 0; k < T.length; k += 3) for (let e = 0; e < 3; e++) {
    const a = T[k + e], b = T[k + (e + 1) % 3], c = T[k + (e + 2) % 3], kk = a < b ? a * nv + b : b * nv + a;
    const x = A.get(kk);
    if (x) x.op.push(c); else A.set(kk, { a, b, op: [c] });
  }
  return A;
}
function esFino(m) {
  const A = aristasDe(m);
  let borde = 0;
  for (const x of A.values()) if (x.op.length === 1) borde++;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.P.length; i += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], m.P[i + d]); mx[d] = Math.max(mx[d], m.P[i + d]); }
  return borde / A.size > 0.15 || Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) < GROSOR * 2;
}
// una pasada de Loop: cada triangulo en cuatro; los vertices viejos se acercan a sus vecinos y los
// nuevos (uno por arista) salen de los dos de la arista y los dos de enfrente. En el borde (y en
// las aristas con mas de dos triangulos) solo cuentan los del borde
function loop(m) {
  const { P, T } = m, nv = P.length / 3, A = aristasDe(m);
  const vecinos = Array.from({ length: nv }, () => new Set()), borde = new Map();
  for (const x of A.values()) {
    vecinos[x.a].add(x.b); vecinos[x.b].add(x.a);
    if (x.op.length !== 2) {
      if (!borde.has(x.a)) borde.set(x.a, []);
      if (!borde.has(x.b)) borde.set(x.b, []);
      borde.get(x.a).push(x.b); borde.get(x.b).push(x.a);
    }
  }
  const Q = new Array(P.length);
  for (let v = 0; v < nv; v++) {
    const b = borde.get(v);
    for (let d = 0; d < 3; d++) {
      let r;
      if (b) r = b.length === 2 ? 0.75 * P[v * 3 + d] + 0.125 * (P[b[0] * 3 + d] + P[b[1] * 3 + d]) : P[v * 3 + d];
      else {
        const n = vecinos[v].size, beta = n > 3 ? 3 / (8 * n) : 3 / 16;
        let suma = 0;
        for (const w of vecinos[v]) suma += P[w * 3 + d];
        r = (1 - n * beta) * P[v * 3 + d] + beta * suma;
      }
      Q[v * 3 + d] = r;
    }
  }
  const medio = new Map();
  for (const [kk, x] of A) {
    const i = Q.length / 3;
    for (let d = 0; d < 3; d++)
      Q.push(x.op.length === 2 ? 0.375 * (P[x.a * 3 + d] + P[x.b * 3 + d]) + 0.125 * (P[x.op[0] * 3 + d] + P[x.op[1] * 3 + d])
        : 0.5 * (P[x.a * 3 + d] + P[x.b * 3 + d]));
    medio.set(kk, i);
  }
  const M = (a, b) => medio.get(a < b ? a * nv + b : b * nv + a), U = [];
  for (let k = 0; k < T.length; k += 3) {
    const a = T[k], b = T[k + 1], c = T[k + 2], ab = M(a, b), bc = M(b, c), ca = M(c, a);
    U.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { P: Q, T: U };
}
// la lamina cerrada de un trozo abierto
function lamina({ P, T }, g) {
  const nv = P.length / 3, A = aristasDe({ P, T }), N = new Float64Array(P.length);
  for (let k = 0; k < T.length; k += 3) {
    const a = T[k] * 3, b = T[k + 1] * 3, c = T[k + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const i of [a, b, c]) { N[i] += n[0]; N[i + 1] += n[1]; N[i + 2] += n[2]; }
  }
  const Q = new Array(P.length * 2), h = g / 2;
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    for (let d = 0; d < 3; d++) {
      Q[v * 3 + d] = P[v * 3 + d] + N[v * 3 + d] / l * h;              // fuera: v
      Q[(nv + v) * 3 + d] = P[v * 3 + d] - N[v * 3 + d] / l * h;       // dentro: nv + v
    }
  }
  const U = [];
  for (let k = 0; k < T.length; k += 3) {
    const a = T[k], b = T[k + 1], c = T[k + 2];
    U.push(a, b, c, nv + a, nv + c, nv + b);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      if (A.get(x < y ? x * nv + y : y * nv + x).op.length !== 1) continue;
      U.push(y, x, nv + x, y, nv + x, nv + y);       // la pared, en el sentido del triangulo
    }
  }
  return { P: Q, T: U };
}
function paraImprimir(pos, idx, op) {
  const P = [], T = [];
  for (let m of trozos(soldar(pos, idx))) {
    const fino = op.grosor && esFino(m);
    if (op.suavizar) for (let i = 0; i < 2 && m.T.length < 60000; i++) m = loop(m);
    if (fino) m = lamina(m, GROSOR);
    const o = P.length / 3;
    for (const x of m.P) P.push(x);
    for (const x of m.T) T.push(x + o);
  }
  return { mm: Float32Array.from(P), idx: Uint32Array.from(T) };
}

function nombreFichero(ext) {
  const p = PERSONAJE ? PERSONAJE.nombre : "figura";
  const pose = E.pose && E.pose !== "reposo" ? E.pose.nombre : "referencia";
  return (p + " - " + pose).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._-]+/g, "").replace(/\s+/g, "_").slice(0, 80) + "." + ext;
}
// guardar lo descargado donde se elija, con la misma ventana de carpetas que al guardar la partida
// (Aaron: "que te pregunte la ruta donde guardarlo, como hace pizarra con guardar la partida").
// -> promesa de la ruta guardada (o null si se cancela)
function bajar(blob, nombre, aviso) {
  return new Promise(ok => {
    let hecho = false;
    elegirCarpeta("Guardar " + nombre, async carpeta => {
      hecho = true;
      try {
        const r = await fetch("/api/figuras/guardar?" + new URLSearchParams({ carpeta, nombre }), { method: "POST", body: blob });
        const d = await r.json().catch(() => ({ error: "respuesta ilegible" }));
        if (!r.ok) throw new Error(d.error || "error " + r.status);
        avisa((aviso ? aviso + " " : "") + "Guardado en " + d.ruta, "bien");
        ok(d.ruta);
      } catch (e) { avisa("No se ha podido guardar: " + e.message, "mal"); ok(null); }
    }, "Guardar aquí", false, "figuras");
    // (si se cierra la ventana sin elegir, no queda esperando para siempre)
    const fondo = document.querySelector(".fondo-modal:last-of-type");
    if (fondo) new MutationObserver((_, ob) => { if (!document.body.contains(fondo)) { ob.disconnect(); if (!hecho) ok(null); } }).observe(document.body, { childList: true });
  });
}
async function conAviso(boton, texto, tarea) {
  if (!MODELO) return avisa("Elige antes un personaje.", "mal");
  const antes = boton.textContent;
  boton.disabled = true; boton.textContent = texto;
  await esperar(30);                   // que se pinte el texto antes de ponerse a calcular
  try { await tarea(); } catch (e) { console.error(e); avisa("No se ha podido preparar la descarga: " + (e.message || e), "mal"); }
  boton.disabled = false; boton.textContent = antes;
}

// STL binario: lo que abre cualquier programa de impresora
function descargarSTL() {
  const { piezas, base } = aMilimetros(hornear());
  const mallas = piezas.map(p => E.grosor || E.suavizar ? paraImprimir(p.mm, p.idx, E) : { mm: p.mm, idx: p.idx });
  if (base) mallas.push(base);
  const n = mallas.reduce((s, m) => s + m.idx.length / 3, 0);
  const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const cab = "Pizarra - figura de Inazuma Eleven Victory Road (mm)";
  for (let i = 0; i < cab.length; i++) dv.setUint8(i, cab.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const m of mallas) {
    const p = m.mm, ix = m.idx;
    for (let k = 0; k < ix.length; k += 3) {
      const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      o += 12;
      for (const q of [a, b, c]) { dv.setFloat32(o, p[q], true); dv.setFloat32(o + 4, p[q + 1], true); dv.setFloat32(o + 8, p[q + 2], true); o += 12; }
      dv.setUint16(o, 0, true); o += 2;
    }
  }
  bajar(new Blob([buf], { type: "model/stl" }), nombreFichero("stl"),
    "Figura para imprimir: " + n.toLocaleString("es") + " triángulos" + (MEDIDAS ? ", " + $("#medidas b").textContent + " de alto" : "") + ".");
}

// La textura de color de un material tal y como se ve: la piel de la ropa tintada con la del
// jugador (partido-vestir.js lo hace en el sombreador). -> canvas
let TEXTURAS = new Map();         // imagen -> {con, sin} (con o sin la piel tintada)
function texturaDe(m, piel) {
  if (!m.map || !m.map.image) return null;
  const masc = MASCARAS.get(m.map.image), clave = masc ? "con" + (piel || [1, 1, 1]).join() : "sin";
  if (!TEXTURAS.has(m.map.image)) TEXTURAS.set(m.map.image, {});
  const ya = TEXTURAS.get(m.map.image);
  if (ya[clave]) return ya[clave];
  const px = pixelesDe(m.map);
  if (!px) return null;
  const c = document.createElement("canvas"); c.width = px.w; c.height = px.h;
  const ctx = c.getContext("2d");
  const datos = new ImageData(new Uint8ClampedArray(px.d), px.w, px.h);
  if (masc && masc.image) {
    const mp = pixelesDe(masc);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const mx = Math.min(mp.w - 1, Math.floor(x * mp.w / px.w)), my = Math.min(mp.h - 1, Math.floor(y * mp.h / px.h));
      const f = mp.d[(my * mp.w + mx) * 4] / 255, i = (y * px.w + x) * 4;
      for (let ch = 0; ch < 3; ch++) datos.data[i + ch] *= 1 + ((piel || [1, 1, 1])[ch] - 1) * f;
    }
  }
  ctx.putImageData(datos, 0, 0);
  return (ya[clave] = c);
}
const aPNG = c => new Promise(ok => c.toBlob(b => b.arrayBuffer().then(x => ok(new Uint8Array(x))), "image/png"));

// las piezas con sus materiales agrupados por textura (cada textura una vez)
async function piezasConColor() {
  const { piezas, base } = aMilimetros(hornear());
  const texs = [], porLienzo = new Map();
  for (const p of piezas) {
    const c = texturaDe(p.mat, p.piel);
    if (!c) { p.tex = -1; continue; }
    if (!porLienzo.has(c)) { porLienzo.set(c, texs.length); texs.push({ lienzo: c, alfa: p.mat.alphaTest > 0 || p.mat.transparent }); }
    p.tex = porLienzo.get(c);
  }
  for (const t of texs) t.png = await aPNG(t.lienzo);
  return { piezas, base, texs };
}

// OBJ + MTL + las texturas, en un .zip
async function descargarOBJ() {
  const { piezas, base, texs } = await piezasConColor();
  const f = (x) => (Math.round(x * 10000) / 10000).toString();
  const obj = ["# Pizarra - figura de Inazuma Eleven Victory Road (milimetros, Z arriba)", "mtllib figura.mtl"];
  let v0 = 1, t0 = 1;
  for (const p of piezas) {
    obj.push("o " + (p.nombre || "pieza").replace(/\s+/g, "_"));
    for (let i = 0; i < p.mm.length; i += 3) obj.push("v " + f(p.mm[i]) + " " + f(p.mm[i + 1]) + " " + f(p.mm[i + 2]));
    const conUV = p.uv && p.tex >= 0;
    if (conUV) for (let i = 0; i < p.uv.length; i += 2) obj.push("vt " + f(p.uv[i]) + " " + f(1 - p.uv[i + 1]));
    obj.push("usemtl " + (p.tex >= 0 ? "textura" + p.tex : "liso"));
    for (let k = 0; k < p.idx.length; k += 3) {
      const a = p.idx[k], b = p.idx[k + 1], c = p.idx[k + 2];
      obj.push(conUV ? "f " + (v0 + a) + "/" + (t0 + a) + " " + (v0 + b) + "/" + (t0 + b) + " " + (v0 + c) + "/" + (t0 + c)
        : "f " + (v0 + a) + " " + (v0 + b) + " " + (v0 + c));
    }
    v0 += p.mm.length / 3;
    if (conUV) t0 += p.uv.length / 2;
  }
  if (base) {
    obj.push("o peana", "usemtl peana");
    for (let i = 0; i < base.mm.length; i += 3) obj.push("v " + f(base.mm[i]) + " " + f(base.mm[i + 1]) + " " + f(base.mm[i + 2]));
    for (let k = 0; k < base.idx.length; k += 3) obj.push("f " + (v0 + base.idx[k]) + " " + (v0 + base.idx[k + 1]) + " " + (v0 + base.idx[k + 2]));
  }
  const mtl = ["# Pizarra", "newmtl liso", "Kd 0.8 0.8 0.8", "illum 1", "newmtl peana", "Kd 0.106 0.184 0.361", "illum 1"];
  texs.forEach((t, i) => mtl.push("newmtl textura" + i, "Kd 1 1 1", "illum 1", "map_Kd textura" + i + ".png"));
  const txt = s => new TextEncoder().encode(s);
  const zip = hacerZip([["figura.obj", txt(obj.join("\n") + "\n")], ["figura.mtl", txt(mtl.join("\n") + "\n")],
    ...texs.map((t, i) => ["textura" + i + ".png", t.png])]);
  bajar(new Blob([zip], { type: "application/zip" }), nombreFichero("zip"), "Figura con colores (OBJ con sus texturas, en un .zip).");
}

// GLB con colores (sin luz, como en el juego), en metros y de pie con Y arriba como pide glTF
async function descargarGLB() {
  const { piezas, base, texs } = await piezasConColor();
  const j = { asset: { version: "2.0", generator: "Pizarra - figuras 3D" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [],
    materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors: [], bufferViews: [], buffers: [], extensionsUsed: ["KHR_materials_unlit"] };
  const trozos = [];
  let largo = 0;
  const vista = (bytes, target) => {
    const pad = (4 - largo % 4) % 4; if (pad) { trozos.push(new Uint8Array(pad)); largo += pad; }
    j.bufferViews.push(Object.assign({ buffer: 0, byteOffset: largo, byteLength: bytes.byteLength }, target ? { target } : {}));
    trozos.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); largo += bytes.byteLength;
    return j.bufferViews.length - 1;
  };
  const acc = (arr, tipo, comp, target, mm) => {
    const a = { bufferView: vista(arr, target), componentType: comp, count: arr.length / { SCALAR: 1, VEC2: 2, VEC3: 3 }[tipo], type: tipo };
    if (mm) { const n = 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < arr.length; i += n) for (let d = 0; d < n; d++) { mn[d] = Math.min(mn[d], arr[i + d]); mx[d] = Math.max(mx[d], arr[i + d]); }
      a.min = mn; a.max = mx; }
    j.accessors.push(a); return j.accessors.length - 1;
  };
  texs.forEach(t => { j.images.push({ bufferView: vista(t.png), mimeType: "image/png" }); j.textures.push({ sampler: 0, source: j.images.length - 1 }); });
  const matDe = new Map();
  const material = (tex) => {
    if (!matDe.has(tex)) {
      const m = { name: tex >= 0 ? "textura" + tex : "liso", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } };
      if (tex >= 0) { m.pbrMetallicRoughness.baseColorTexture = { index: tex }; if (texs[tex].alfa) { m.alphaMode = "MASK"; m.alphaCutoff = 0.5; } }
      else m.pbrMetallicRoughness.baseColorFactor = tex === -2 ? [0.011, 0.028, 0.107, 1] : [0.6, 0.6, 0.6, 1];   // (en lineal: el azul de Pizarra)
      j.materials.push(m); matDe.set(tex, j.materials.length - 1);
    }
    return matDe.get(tex);
  };
  const aGl = mm => { const q = new Float32Array(mm.length); for (let i = 0; i < mm.length; i += 3) { q[i] = mm[i] / 1000; q[i + 1] = mm[i + 2] / 1000; q[i + 2] = -mm[i + 1] / 1000; } return q; };
  const prims = [];
  for (const p of piezas) {
    const at = { POSITION: acc(aGl(p.mm), "VEC3", 5126, 34962, true) };
    if (p.uv && p.tex >= 0) at.TEXCOORD_0 = acc(p.uv, "VEC2", 5126, 34962);
    prims.push({ attributes: at, indices: acc(p.idx, "SCALAR", 5125, 34963), material: material(p.uv ? p.tex : -1) });
  }
  if (base) prims.push({ attributes: { POSITION: acc(aGl(base.mm), "VEC3", 5126, 34962, true) }, indices: acc(base.idx, "SCALAR", 5125, 34963), material: material(-2) });
  j.meshes.push({ name: "figura", primitives: prims });
  j.nodes.push({ name: PERSONAJE ? PERSONAJE.nombre : "figura", mesh: 0 });
  j.scenes[0].nodes.push(0);
  const bin = new Uint8Array(largo + (4 - largo % 4) % 4);
  let o = 0; for (const t of trozos) { bin.set(t, o); o += t.byteLength; }
  j.buffers.push({ byteLength: bin.byteLength });
  let js = new TextEncoder().encode(JSON.stringify(j));
  const jsPad = new Uint8Array(js.length + (4 - js.length % 4) % 4).fill(0x20); jsPad.set(js); js = jsPad;
  const total = 12 + 8 + js.length + 8 + bin.length, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004E4942, true); out.set(bin, 28 + js.length);
  bajar(new Blob([out], { type: "model/gltf-binary" }), nombreFichero("glb"), "Figura con colores (GLB).");
}

// un .zip sin comprimir (los PNG ya lo estan), sin librerias
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function hacerZip(ficheros) {
  const partes = [], centro = [];
  let o = 0;
  for (const [nombre, datos] of ficheros) {
    const n = new TextEncoder().encode(nombre), crc = crc32(datos);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(8, 0, true);
    cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true); cab.setUint32(22, datos.length, true);
    cab.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, o, true);
    partes.push(new Uint8Array(cab.buffer), n, datos);
    centro.push(new Uint8Array(c.buffer), n);
    o += 30 + n.length + datos.length;
  }
  const tamCentro = centro.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, ficheros.length, true); fin.setUint16(10, ficheros.length, true);
  fin.setUint32(12, tamCentro, true); fin.setUint32(16, o, true);
  return new Blob([...partes, ...centro, new Uint8Array(fin.buffer)]);
}

// --------------------------------------------------------------------------- los mandos
$("#buscar").oninput = () => { MOSTRAR = 120; pintarLista(); };
$("#f-grupo").onchange = $("#f-saga").onchange = () => { MOSTRAR = 120; pintarLista(); };
$("#b-equipacion").onclick = ventanaEquipaciones;
document.querySelectorAll("#disenos button").forEach(b => { b.onclick = () => cambiar({ diseno: b.dataset.d }); });
$("#c-portero").onchange = e => cambiar({ portero: e.target.checked });
const ponDorsal = n => cambiar({ dorsal: Math.max(0, Math.min(99, Math.round(Number(n) || 0))) });
$("#dorsal").oninput = e => { if (e.target.value !== "") ponDorsal(e.target.value); };
$("#dorsal-menos").onclick = () => ponDorsal(E.dorsal - 1);
$("#dorsal-mas").onclick = () => ponDorsal(E.dorsal + 1);
$("#c-dorsal").onchange = e => cambiar({ conDorsal: e.target.checked });
$("#c-capitan").onchange = e => cambiar({ capitan: e.target.checked });
$("#f-pose").onchange = pintarPoses;
$("#buscar-pose").oninput = pintarPoses;
$("#r-momento").oninput = e => { REPRODUCIENDO = false; E.momento = Number(e.target.value) / 1000; ponerMomento(E.momento); pintarMomento(); };
$("#r-momento").onchange = () => { recolocar(); guardar(); };
$("#b-play").onclick = () => { REPRODUCIENDO = !REPRODUCIENDO; if (!REPRODUCIENDO) { recolocar(); guardar(); } pintarMomento(); };
$("#altura").onchange = e => { cambiar({ altura: Number(e.target.value) }, true); recolocar(); };
$("#c-peana").onchange = e => { cambiar({ peana: e.target.checked }, true); recolocar(); };
$("#c-grosor").onchange = e => cambiar({ grosor: e.target.checked }, true);
$("#c-suavizar").onchange = e => cambiar({ suavizar: e.target.checked }, true);
// el espiritu: la forma cambia el modelo; el keshin se pone detras
$("#forma").onchange = e => { E.forma = e.target.value; E.formaDe = PERSONAJE ? PERSONAJE.codigo : ""; guardar(); montar(); };
$("#keshin").onchange = e => { E.keshin = e.target.value; guardar(); pintarEspiritu(); cargarKeshin(TOKEN).then(() => { if (EVENTO && E.pose && E.pose.asignado) aplicarPose(TOKEN); }); };
for (const [id, k] of [["#r-kes-tam", "kesTam"], ["#r-kes-alto", "kesAltura"], ["#r-kes-dist", "kesDist"]]) {
  $(id).oninput = e => { E[k] = Number(e.target.value); recolocar(); };
  $(id).onchange = () => { guardar(); encuadrar(true); };
}
$("#c-kes-aura").onchange = e => { E.kesAura = e.target.checked; guardar(); recolocar(); };
// la supertecnica: sus efectos, el balon y los demas jugadores
$("#c-efectos").onchange = e => { E.efectos = e.target.checked; guardar(); aplicarPose(TOKEN); };
$("#c-balon").onchange = e => { E.balon = e.target.checked; guardar(); if (EVENTO) { ponerVisiblesEvento(); } else aplicarPose(TOKEN); };
$("#c-efectos-descarga").onchange = e => { E.efectosDescarga = e.target.checked; guardar(); };
$("#b-girar").onclick = () => cambiar({ girar: !E.girar }, true);
$("#b-gris").onclick = () => { E.gris = !E.gris; guardar(); aplicarGris(); };
$("#b-centrar").onclick = encuadrar;
$("#b-foto").onclick = () => { render.render(escena, camara); lienzo.toBlob(b => bajar(b, nombreFichero("png"), "Foto."), "image/png"); };
$("#b-stl").onclick = e => conAviso(e.currentTarget, "Preparando la figura...", descargarSTL);
$("#b-obj").onclick = e => conAviso(e.currentTarget, "Preparando...", descargarOBJ);
$("#b-glb").onclick = e => conAviso(e.currentTarget, "Preparando...", descargarGLB);

// --------------------------------------------------------------------------- arranque
(async function () {
  ajustarTamano();
  requestAnimationFrame(bucle);
  estado("Preparando el visor...", "");
  try {
    const [pj, eq] = await Promise.all([pedir("/api/figuras/personajes"), pedir("/api/figuras/equipaciones")]);
    PERSONAJES = pj.personajes; EQUIPACIONES = eq.equipaciones;
  } catch (e) {
    estado("No se ha podido abrir el visor", e.message || String(e), true);
    return;
  }
  const sagas = [...new Set(PERSONAJES.map(p => p.saga).filter(Boolean))];
  const orden = Object.keys(CHAPA_SAGA);
  sagas.sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));
  for (const s of sagas) $("#f-saga").append(el("option", { value: s, text: s }));
  const pedido = new URLSearchParams(location.search).get("p");
  if (E.equipacion !== "propia" && !EQUIPACIONES.some(x => x.id === E.equipacion)) E.equipacion = "propia";
  const p = PERSONAJES.find(x => x.codigo === (pedido || E.codigo)) || PERSONAJES.find(x => x.codigo === "c01000010") || PERSONAJES[0];
  estado(null);
  pintarLista();
  if (p) elegirPersonaje(p);
})();

// para las pruebas (como PARTIDO en el partido): el estado y lo que se descargaria
window.FIGURAS = { E, hornear: () => hornear(), modelo: () => MODELO, accion: () => ACCION, tramos: () => TRAMOS,
  evento: () => EVENTO, keshin: () => KESHIN, orbita: ORBITA };
