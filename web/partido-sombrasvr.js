/* Los sombreadores de VR tal cual en los efectos de las animaciones de VR, y las caras (NOTAS
   O-331). Lo carga el reproductor (partido-eventosvr.js).
   - Cada material de efecto de VR lleva en el glb (ievr/g4evento.py) su material entero:
     el sombreador del juego (Effect_T1, Effect_ThresholdGrd, Effect_T3Threshold...), su color
     difuso y ambiente, sus parametros, como se dibuja (mezcla, profundidad, caras) y, por
     ranura, su textura, su juego de UV y su desplazamiento/escala de UV. El sombreador, traducido
     del de VR a GLSL en el PC de cada uno (ievr/sombrasvr.py), viene en sombreadores.json. Aqui
     se monta con eso un THREE.ShaderMaterial que hace las mismas cuentas que VR; cada fotograma
     se le ponen el color, la opacidad, los parametros y las UV animados (escena.json).
   - Las particulas falsas (Effect_FakeParticle*: en VR un sombreador de geometria hace de cada
     triangulo un cuadrado colocado con una textura de posiciones): la malla se repite aqui,
     cada triangulo tantos vertices como emite, y el de vertices traducido hace lo de la
     geometria.
   - La distorsion (Effect_Distortion*: refracta lo de detras): lo ya pintado del cuadro se
     copia a una textura (una vez por cuadro, justo antes de la primera malla que la usa).
   - Las caras: en VR los ojos y la boca son una hoja de 4x2 caras (eye_10M y mouth_10M) y cada
     evento dice cual va en cada fotograma (G4MA tipo 32 del parametro 4, en pistas_<cuerpo>.glb
     asset.extras.caras): grito al chutar, ojos cerrados...
   Sin sombreadores.json (o si un sombreador no se pudo traducir) el material sale como antes
   (las aproximaciones de O-323). Este modulo no toca window ni document al cargarse. */
import * as THREE from "./partido-three.module.js";

// O-331: como en VR, los estados de dibujo de cada material (tabla de G4MD)
const OPERACION = { 1: THREE.AddEquation, 2: THREE.SubtractEquation, 3: THREE.ReverseSubtractEquation, 4: THREE.MinEquation, 5: THREE.MaxEquation };
const FACTOR = { 0: THREE.ZeroFactor, 1: THREE.OneFactor, 2: THREE.SrcColorFactor, 3: THREE.OneMinusSrcColorFactor, 4: THREE.SrcAlphaFactor,
  5: THREE.OneMinusSrcAlphaFactor, 6: THREE.DstAlphaFactor, 7: THREE.OneMinusDstAlphaFactor, 8: THREE.DstColorFactor, 9: THREE.OneMinusDstColorFactor };
// el color del aura del balon (BallAura1: u_grdValue.x elige la columna de la rampa de
// elementos, un pixel cada uno, como las particulas de O-330: Montana, Viento, Fuego, Bosque y
// sin elemento)
const ELEMENTOS = ["Montana", "Viento", "Fuego", "Bosque", ""];
// espejo: las texturas de los efectos de VR se repiten en espejo (las UV de sus mallas van de -1 a
// 1 sobre cuartos de mancha y anillos; repetidas salian bordes rectos: comparado con los videos
// de Tornado de fuego y en Espiral de distorsion, O-331)
export const SOMBRAS_VR = { activas: true, caras: true, espejo: true };

// la matriz de UV de VR (texProj) de una ranura: escala, giro y desplazamiento como los guarda
// el juego (sacado comparando los 5 numeros de la ranura con su matriz en el G4MD, O-331)
function texProj(su, sv, rot, tu, tv, f0, f1) {
  su = su || 1; sv = sv || 1;
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  f0.set(c / su, -s / sv, -tu / su, 0);
  f1.set(s / su, c / sv, 1 - (1 - tv) / sv, 0);
}
// el valor k de una lista por fotograma (las que no cambian llevan uno solo)
const enK = (x, k) => (x ? x[Math.min(k, x.length - 1)] : undefined);

// el nombre de la propiedad de la geometria para un juego de UV del juego (GLTFLoader)
const UV = ["uv", "uv1", "uv2", "uv3", "texcoord_4", "texcoord_5"];
function atributo(geo, sem, idx, uvDe, n) {
  if (sem === "POSITION") return geo.getAttribute("position");
  if (sem === "NORMAL") return geo.getAttribute("normal") || new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  if (sem === "COLOR") return geo.getAttribute(idx ? "color_" + idx : "color") || new THREE.BufferAttribute(new Float32Array(n * 4).fill(1), 4);
  if (sem === "TEXCOORD") return geo.getAttribute(UV[uvDe(idx)] || "uv") || geo.getAttribute("uv") || new THREE.BufferAttribute(new Float32Array(n * 2), 2);
  if (sem === "TANGENT" || sem === "BINORMAL") return geo.getAttribute("tangent") || new THREE.BufferAttribute(new Float32Array(n * 4), 4);
  return null;
}
function nombreAtributo(sem, idx, k) {
  const p = k === undefined ? "sv_" : "sv_a" + k + "_";
  if (sem === "POSITION") return k === undefined ? null : p + "pos";
  if (sem === "NORMAL") return k === undefined ? null : p + "nor";
  if (sem === "COLOR") return p + "color" + idx;
  if (sem === "TEXCOORD") return p + "uv" + idx;
  if (sem === "TANGENT" || sem === "BINORMAL") return p + "tangente";
  return null;
}

// lo de una copia de lo ya pintado (la distorsion): una por pagina
const PANTALLA = { tex: null, cuadro: 0, copiado: -1, vp: new THREE.Vector4(), pos: new THREE.Vector2() };
function copiarPantalla(render) {
  if (PANTALLA.copiado === PANTALLA.cuadro) return;
  PANTALLA.copiado = PANTALLA.cuadro;
  render.getCurrentViewport(PANTALLA.vp);
  const w = Math.max(1, PANTALLA.vp.z | 0), h = Math.max(1, PANTALLA.vp.w | 0);
  if (!PANTALLA.tex || PANTALLA.tex.image.width !== w || PANTALLA.tex.image.height !== h) {
    if (PANTALLA.tex) PANTALLA.tex.dispose();
    PANTALLA.tex = new THREE.FramebufferTexture(w, h);
    PANTALLA.tex.minFilter = PANTALLA.tex.magFilter = THREE.LinearFilter;
    for (const u of PANTALLA.usuarios || []) u.value = PANTALLA.tex;
  }
  PANTALLA.pos.set(PANTALLA.vp.x, PANTALLA.vp.y);
  try { render.copyFramebufferToTexture(PANTALLA.pos, PANTALLA.tex); } catch (e) { /* sin copia: lo de antes */ }
}
const TEX_VACIA = new THREE.Texture();
// lo de la camara que leen todos (la proyeccion con la z de Direct3D, de 0 a 1, como la de VR, y
// cerca/lejos/aspecto): uniforms compartidos, una vez por cuadro (antes se calculaba en cada
// vertice y en cada pixel)
const CAMARA = { PD: { value: new THREE.Matrix4() }, cam: { value: new THREE.Vector4(0.05, 600, 1, 0) } };
const A_D3D = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
export function ponerCamara(c) {
  if (!c || !c.projectionMatrix) return;
  CAMARA.PD.value.multiplyMatrices(A_D3D, c.projectionMatrix);
  CAMARA.cam.value.set(c.near ?? 0.05, c.far ?? 600, c.aspect ?? 1, 0);
}

export class SombrasVR {
  // sombreadores.json del evento (o null si no esta: todo como antes)
  static async cargar(url) {
    try {
      const r = await fetch(url + "sombreadores.json");
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.programas ? j.programas : null;
    } catch (e) { return null; }
  }

  // escena: el gltf de escena.glb; programas: los de sombreadores.json; elemento: el de la
  // tecnica (el color del aura del balon)
  constructor(escena, programas, elemento = "") {
    this.escena = escena; this.programas = programas || {};
    this.materiales = new Map();   // material del glb -> ShaderMaterial
    this.texturas = new Set();     // las copias de textura que son suyas
    this.geometrias = new Set();   // las mallas repetidas de las particulas falsas
    this.elementoActual = elemento || "";
    this._tex = new Map();
  }

  // las texturas de las ranuras, antes de montar (async: el parser las carga si hace falta)
  async texturasDe(materiales) {
    const quiero = new Set();
    for (const m of materiales) for (const r of ((m.userData.vr || {}).ranuras || [])) if (r.textura >= 0) quiero.add(r.textura);
    await Promise.all([...quiero].map(async i => {
      try {
        const t = await this.escena.parser.getDependency("texture", i);
        // los sombreadores de VR leen la textura tal cual (sin pasarla de sRGB a lineal)
        const c = t.clone(); c.colorSpace = THREE.NoColorSpace; c.needsUpdate = true;
        if (SOMBRAS_VR.espejo) c.wrapS = c.wrapT = THREE.MirroredRepeatWrapping;
        this._tex.set(i, c); this.texturas.add(c);
      } catch (e) { this._tex.set(i, null); }
    }));
  }

  // el ShaderMaterial de VR de un material del glb (uno por material), o null
  material(m, skinned) {
    const vr = m.userData && m.userData.vr;
    if (!SOMBRAS_VR.activas || !vr) return null;
    const p = this.programas[vr.sombreador];
    if (!p || p.error || !p.vs) return null;
    const clave = m.uuid + (skinned ? "s" : "");
    if (this.materiales.has(clave)) return this.materiales.get(clave);
    const uniforms = {};
    for (const [g, u] of Object.entries(p.uniformes || {})) uniforms[g] = { value: Array.from({ length: u.tam }, () => new THREE.Vector4()) };
    (p.texturas || []).forEach((_n, k) => {
      const r = (vr.ranuras || [])[k];
      uniforms["sv_tex" + k] = { value: (r && this._tex.get(r.textura)) || TEX_VACIA };
    });
    if (p.pantalla) { uniforms.sv_pantalla = { value: PANTALLA.tex || TEX_VACIA }; (PANTALLA.usuarios = PANTALLA.usuarios || new Set()).add(uniforms.sv_pantalla); }
    uniforms.sv_pantallaVP = { value: new THREE.Vector4(0, 0, 1, 1) };
    uniforms.sv_PD = CAMARA.PD; uniforms.sv_camara = CAMARA.cam;
    const s = new THREE.ShaderMaterial({ name: m.name, vertexShader: p.vs, fragmentShader: p.fs, uniforms });
    s.userData = { efecto: true, vr, prog: p, base: m, material: uniforms.u_model_material ? uniforms.u_model_material.value : null,
      usuario: uniforms.u_user_data01 ? uniforms.u_user_data01.value : null, ranuras: (vr.ranuras || []).length };
    const e = vr.estados || {};
    // como se dibuja: la mezcla, la profundidad y las caras de VR
    if (e["6"]) {
      s.transparent = true; s.blending = THREE.CustomBlending;
      s.blendEquation = OPERACION[e["7"]] ?? THREE.AddEquation;
      s.blendSrc = FACTOR[e["9"]] ?? THREE.SrcAlphaFactor; s.blendDst = FACTOR[e["10"]] ?? THREE.OneMinusSrcAlphaFactor;
    } else { s.transparent = false; s.blending = THREE.NoBlending; }
    s.depthTest = e["4"] !== 0; s.depthWrite = e["5"] === 1;
    s.side = e["14"] === 1 ? THREE.FrontSide : THREE.DoubleSide;
    s.userData.transparente0 = s.transparent;
    // la distorsion, al final (refracta lo ya pintado)
    if (p.pantalla) s.userData.pantalla = true;
    this.ponerBase(s);
    this.materiales.set(clave, s);
    return s;
  }

  // los valores fijos del material (lo que no se anima o al empezar cada fotograma)
  ponerBase(s) {
    const u = s.userData, vr = u.vr, M = u.material;
    if (M) {
      const e = vr.estados || {}, c = vr.color || [];
      // u_ubParam.w: la referencia de la prueba de alfa (si la hay)
      M[0].set(0, 0, 0, e["1"] ? (e["3"] || 0) / 255 : 0);
      if (M[1]) M[1].set(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c[3] ?? 1);
      if (M[2]) M[2].set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, c[7] ?? 1);
      if (M[3]) M[3].set(c[8] ?? 0, c[9] ?? 0, c[10] ?? 0, c[11] ?? 0);
      (vr.ranuras || []).forEach((r, k) => {
        if (M[5 + 2 * k]) texProj(r.smp[0], r.smp[1], r.smp[2], r.smp[3], r.smp[4], M[4 + 2 * k], M[5 + 2 * k]);
      });
      (vr.params || []).forEach((q, k) => { if (M[22 + k]) M[22 + k].set(q[0], q[1], q[2], q[3]); });
    }
    if (u.usuario) this._usuario(s);
    s.visible = true;
  }

  _usuario(s) {
    const U = s.userData.usuario, vars = ((s.userData.prog.uniformes || {}).u_user_data01 || {}).vars || {};
    for (const v of U) v.set(0, 0, 0, 0);
    for (const [n, [fila]] of Object.entries(vars)) {
      if (!U[fila]) continue;
      if (n === "u_grdValue") {
        // la rampa de los elementos (BallAura0010, 128x32): un pixel de ancho por elemento
        const i = Math.max(0, ELEMENTOS.indexOf(this.elementoActual)), t = s.uniforms.sv_tex0 && s.uniforms.sv_tex0.value;
        U[fila].set((i + 0.5) / ((t && t.image && t.image.width) || 128), 0, 0, 0);
      }
      else if (n === "u_attachScale" || n === "objectScale") U[fila].set(1, 1, 1, 1);
    }
  }

  elemento(el) {
    if (el === undefined || el === null || el === this.elementoActual) return;
    this.elementoActual = el;
    for (const s of this.materiales.values()) if (s.userData.usuario) this._usuario(s);
  }

  // un fotograma de la animacion del material (escena.json: d difuso, a ambiente, p parametros,
  // t ranuras de textura; las de antes, opacidad/r/g/b/u/v, tambien)
  aplicar(s, d, k) {
    const M = s.userData.material;
    if (!M) return;
    const vec = (v, lista) => { if (!lista) return; for (let i = 0; i < 4; i++) { const x = enK(lista[i], k); if (x !== undefined && x !== null) v.setComponent(i, x); } };
    if (d.d && M[1]) vec(M[1], d.d);
    if (d.a && M[2]) vec(M[2], d.a);
    if (d.p) for (const [n, lista] of Object.entries(d.p)) if (M[22 + +n]) vec(M[22 + +n], lista);
    if (d.t) {
      for (const [n, t] of Object.entries(d.t)) {
        const r = (s.userData.vr.ranuras || [])[+n];
        if (!r || !M[5 + 2 * n]) continue;
        const v = (c, i) => { const x = enK(t[c], k); return x === undefined ? r.smp[i] : x; };
        texProj(v("su", 0), v("sv", 1), v("rot", 2), v("tu", 3), v("tv", 4), M[4 + 2 * n], M[5 + 2 * n]);
      }
    }
    // los de antes (escena.json de O-323/O-330, o las pruebas)
    if (d.opacidad) M[1].w = enK(d.opacidad, k);
    if (d.r || d.g || d.b) M[1].set(enK(d.r, k) ?? 1, enK(d.g, k) ?? 1, enK(d.b, k) ?? 1, M[1].w);
    // sin alfa no se ve (en VR se mezcla con el alfa): fuera, mas barato
    const e = s.userData.vr.estados || {};
    if (e["6"] && e["9"] === 4 && M[1].w <= 0.001) s.visible = false;
  }

  // pone el material de VR en una malla del glb (y la malla repetida si es de particulas falsas)
  montar(o) {
    const mats = [].concat(o.material);
    const nuevos = mats.map(m => this.material(m, o.isSkinnedMesh) || m);
    if (nuevos.every((m, i) => m === mats[i])) return false;
    const s = nuevos.find(m => m.isShaderMaterial);
    const p = s.userData.prog, vr = s.userData.vr;
    const uvDe = n => (((vr.ranuras || [])[n]) || {}).uv || 0;
    if (p.gs) {
      const g = this._repetir(o.geometry, p.gs, p.entradas, uvDe);
      if (!g) return false;
      o.geometry = g; this.geometrias.add(g);
    } else {
      // los nombres que leen los sombreadores traducidos: sv_uvN (el juego de UV de la ranura
      // N), sv_colorN y sv_tangente; la geometria de GLTFLoader puede ser de mas de una malla
      let geo = o.geometry;
      const n = geo.getAttribute("position").count;
      const quiero = {};
      for (const [sem, idx] of p.entradas || []) {
        const nom = nombreAtributo(sem, idx);
        if (nom) quiero[nom] = atributo(geo, sem, idx, uvDe, n);
      }
      if (Object.entries(quiero).some(([k, a]) => geo.getAttribute(k) && geo.getAttribute(k) !== a)) {
        const g2 = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(geo.attributes)) g2.setAttribute(k, a);
        g2.setIndex(geo.index); g2.groups = geo.groups; geo = g2; o.geometry = g2; this.geometrias.add(g2);
      }
      for (const [k, a] of Object.entries(quiero)) geo.setAttribute(k, a);
    }
    o.material = Array.isArray(o.material) ? nuevos : nuevos[0];
    if (nuevos.some(m => m.userData && m.userData.prog && (m.userData.prog.pantalla || m.userData.prog.posicion))) {
      // la copia de lo pintado (la distorsion) y el cuadro en pixeles (SV_Position)
      o.renderOrder = Math.max(o.renderOrder, s.userData.pantalla ? 1000 : 0);
      const antes = o.onBeforeRender;
      o.onBeforeRender = function (render, escena, camara, geometria, material) {
        if (material && material.userData && material.userData.prog) {
          if (material.userData.prog.pantalla) copiarPantalla(render);
          render.getCurrentViewport(material.uniforms.sv_pantallaVP.value);
        }
        if (antes) antes.apply(this, arguments);
      };
    }
    return true;
  }

  // cada triangulo (o punto/linea) de la malla, tantos vertices como emite el de geometria de
  // VR: en cada uno los atributos de los vertices de la primitiva original y su esquina
  _repetir(geo, gs, entradas, uvDe) {
    const pos = geo.getAttribute("position");
    if (!pos) return null;
    const idx = geo.index ? geo.index.array : Array.from({ length: pos.count }, (_x, i) => i);
    const nv = gs.vertices, N = gs.emite, P = Math.floor(idx.length / nv);
    if (!N || !P) return null;
    const g = new THREE.BufferGeometry(), total = P * N;
    const solo = new Set(gs.solo_posicion || []);
    for (let k = 0; k < nv; k++) {
      for (const [sem, i] of entradas) {
        if (solo.has(k) && sem !== "POSITION") continue;
        const fuente = atributo(geo, sem, i, uvDe, pos.count), nom = nombreAtributo(sem, i, k);
        if (!fuente || !nom || g.getAttribute(nom)) continue;
        const t = sem === "POSITION" ? 4 : fuente.itemSize, out = new Float32Array(total * t);
        for (let p = 0; p < P; p++) {
          const v = idx[p * nv + k];
          for (let c = 0; c < N; c++) {
            const o = (p * N + c) * t;
            for (let j = 0; j < fuente.itemSize && j < t; j++) out[o + j] = fuente.getComponent(v, j);
            if (sem === "POSITION") out[o + 3] = k === 0 ? c : 0;
          }
        }
        g.setAttribute(nom, new THREE.BufferAttribute(out, t));
      }
    }
    // "position" (three la quiere): la del vertice 0
    const a0 = g.getAttribute("sv_a0_pos");
    const p3 = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) { p3[i * 3] = a0.array[i * 4]; p3[i * 3 + 1] = a0.array[i * 4 + 1]; p3[i * 3 + 2] = a0.array[i * 4 + 2]; }
    g.setAttribute("position", new THREE.BufferAttribute(p3, 3));
    const ind = [];
    for (let p = 0; p < P; p++) {
      for (const tira of gs.tiras || []) {
        for (let i = 0; i + 2 < tira.length; i++) {
          const a = p * N + tira[i], b = p * N + tira[i + 1], c = p * N + tira[i + 2];
          if (i % 2 === 0) ind.push(a, b, c); else ind.push(b, a, c);
        }
      }
    }
    g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
    return g;
  }

  // las texturas suyas, para subirlas a la grafica antes de verse
  texturasParaSubir() { return [...this.texturas]; }

  soltar() {
    for (const s of this.materiales.values()) {
      s.dispose();
      if (PANTALLA.usuarios && s.uniforms.sv_pantalla) PANTALLA.usuarios.delete(s.uniforms.sv_pantalla);
    }
    for (const t of this.texturas) t.dispose();
    for (const g of this.geometrias) g.dispose();
    this.materiales.clear(); this.texturas.clear(); this.geometrias.clear();
  }
}

// cada cuadro nuevo (lo llama EventoVR.poner): la copia de lo pintado se hace una vez por cuadro
export function cuadroNuevo() { PANTALLA.cuadro++; }

// ------------------------------------------------------------------------- las caras
// O-331: los ojos y la boca de VR son una hoja de 4 columnas x 2 filas (la textura de la cara,
// 2048x1024: cada cara cuadrada) y el evento dice el numero de cara de cada fotograma
// (G4MA tipo 32 del parametro 4 de eye_10M y mouth_10M; el sombreador de la cara de VR,
// Chr_ToonVariable, le suma (columna/4, fila * (1/4) / (alto/ancho)) a la UV)
export const CARAS_VR = { columnas: 4, materiales: ["eye_10M", "mouth_10M", "eye_00M", "mouth_00M"] };

export class CarasVR {
  // nodo: el clon del jugador en el evento; caras: {corte: {material: {"32": [numero por
  // fotograma]}}} de ese actor (pistas_<cuerpo>.glb asset.extras.caras[clave])
  constructor(nodo, caras) {
    this.caras = caras || {};
    this.partes = [];
    if (!SOMBRAS_VR.caras || !Object.keys(this.caras).length) return;
    nodo.traverse(o => {
      if (!o.isMesh) return;
      const mats = [].concat(o.material);
      let cambia = false;
      const nuevos = mats.map(m => {
        if (!m || !CARAS_VR.materiales.includes(m.name) || !m.map) return m;
        // una copia de su material y de su textura (comparte la imagen): los demas jugadores
        // con este modelo no cambian de cara
        const c = m.clone(); c.map = m.map.clone(); c.map.needsUpdate = false;
        c.map.matrixAutoUpdate = true;
        this.partes.push({ nombre: m.name, mat: c, tex: c.map });
        cambia = true;
        return c;
      });
      if (cambia) o.material = Array.isArray(o.material) ? nuevos : nuevos[0];
    });
  }

  // la cara del fotograma k del corte (contado desde que empieza el clip del actor)
  poner(corte, k) {
    const c = this.caras[corte] || {};
    for (const p of this.partes) {
      const lista = (c[p.nombre] || {})["32"] || (c[p.nombre] || {})[32];
      const n = lista ? Math.max(0, Math.round(enK(lista, Math.max(0, k)) || 0)) : 0;
      const img = p.tex.image || {}, alto = img.height || 1024, ancho = img.width || 2048;
      const col = n % CARAS_VR.columnas, fila = Math.floor(n / CARAS_VR.columnas);
      const w = 1 / CARAS_VR.columnas;
      p.tex.offset.set(col * w, fila * w * ancho / alto);
    }
  }

  soltar() {
    for (const p of this.partes) { p.mat.dispose(); p.tex.dispose(); }
    this.partes = [];
  }
}
