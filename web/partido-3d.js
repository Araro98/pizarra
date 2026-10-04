/* La vista 3D del partido (NOTAS O-293). El mismo motor y los mismos gestos
   que la vista 2D (partido-pantalla.js); solo cambia como se pinta: un campo
   en 3D visto desde la banda, como una retransmision, y los jugadores con su
   modelo del juego si este PC lo ha convertido (datos/modelos3d, se saca de
   la instalacion de cada uno y nunca se reparte) o, si no, una ficha de pie
   con su cara. Usa three.js (MIT) en local. */
import * as THREE from "./partido-three.module.js";
import { GLTFLoader } from "./partido-GLTFLoader.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";

const ANIM = { parado: "戦1立ち1L", correr: "戦1走り1L", tiro: "戦1シュート1", patada: "戦1キック1" };

class Pantalla3D {
  constructor(canvas, partido, yo = 0) {
    this.c = canvas; this.p = partido; this.yo = yo;
    this.trazo = null; this.elegido = null;
    this.colores = [0x3fe0d0, 0xff7a4d];
    this.render = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.render.outputColorSpace = THREE.SRGBColorSpace;
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0x0d1a33);
    this.camara = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x406040, 2.2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(-30, 60, 20);
    this.escena.add(sol);
    this.raton = new THREE.Raycaster();
    this.suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._campo();
    this.modelos = {};               // cara -> {gltf} o null (no hay)
    this.figuras = partido.jugadores.map(j => this._figura(j));
    this.balon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    this.escena.add(this.balon);
    this.lineas = new THREE.Group(); this.escena.add(this.lineas);
    this.camX = 0; this.reloj = new THREE.Clock();
    this.ajustar();
  }

  ajustar() {
    const r = this.c.getBoundingClientRect();
    this.ppp = window.devicePixelRatio || 1;
    this.render.setPixelRatio(this.ppp);
    this.render.setSize(Math.max(300, r.width), Math.max(200, r.height), false);
    this.camara.aspect = Math.max(300, r.width) / Math.max(200, r.height);
    this.camara.updateProjectionMatrix();
  }

  // el campo: x del motor -> x de three, y del motor -> z de three
  _sentido() { const j = this.p.jugadores.find(q => q.lado === this.yo); return j ? j.dir : 1; }

  _campo() {
    const L = REGLAS.LARGO, A = REGLAS.ANCHO, esc = 12;
    const lienzo = document.createElement("canvas");
    lienzo.width = (A + 8) * esc; lienzo.height = (L + 8) * esc;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#1f7a3a"; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = k % 2 ? "#2b8f47" : "#25843f";
      ctx.fillRect(4 * esc, 4 * esc + L * esc * k / 14, A * esc, L * esc / 14 + 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 0.18 * esc;
    const X = x => (x + A / 2 + 4) * esc, Y = y => (y + L / 2 + 4) * esc;
    ctx.strokeRect(X(-A / 2), Y(-L / 2), A * esc, L * esc);
    ctx.beginPath(); ctx.moveTo(X(-A / 2), Y(0)); ctx.lineTo(X(A / 2), Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(0), Y(0), 9.15 * esc, 0, Math.PI * 2); ctx.stroke();
    for (const s of [-1, 1]) {
      const fondo = s * L / 2;
      for (const [lar, anc] of [[REGLAS.AREA_Y, 40.32], [5.5, 18.32]]) {
        ctx.strokeRect(X(-anc / 2), s < 0 ? Y(fondo) : Y(fondo - lar), anc * esc, lar * esc);
      }
    }
    const tex = new THREE.CanvasTexture(lienzo);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(A + 8, L + 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2;
    this.escena.add(suelo);
    // porterias: postes y larguero
    const blanco = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const z = s * L / 2, g = new THREE.Group();
      for (const x of [-REGLAS.PORTERIA / 2, REGLAS.PORTERIA / 2]) {
        const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.44), blanco);
        poste.position.set(x, 1.22, z); g.add(poste);
      }
      const lar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, REGLAS.PORTERIA), blanco);
      lar.rotation.z = Math.PI / 2; lar.position.set(0, 2.44, z); g.add(lar);
      const red = new THREE.Mesh(new THREE.BoxGeometry(REGLAS.PORTERIA, 2.44, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
      red.position.set(0, 1.22, z + s * 1); g.add(red);
      this.escena.add(g);
    }
  }

  // la ficha de un jugador: su modelo si lo hay; si no, una ficha con su cara
  _figura(j) {
    const g = new THREE.Group();
    const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.02; g.add(sombra);
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: this.colores[j.lado] }));
    aro.rotation.x = -Math.PI / 2; aro.position.y = 0.03; g.add(aro);
    g.userData = { aro, ficha: this._ficha(j), cuerpo: null, mezcla: null, acciones: {}, ahora: null };
    g.add(g.userData.ficha);
    this.escena.add(g);
    this._cargarModelo(j, g);
    return g;
  }

  _ficha(j) {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 128;
    const ctx = lienzo.getContext("2d");
    const pinta = (img) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save(); ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = "#fff"; ctx.fill(); if (img) { ctx.clip(); ctx.drawImage(img, 6, 6, 116, 116); } ctx.restore();
      ctx.lineWidth = 8; ctx.strokeStyle = "#" + this.colores[j.lado].toString(16).padStart(6, "0");
      ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#1b2f5c"; ctx.beginPath(); ctx.arc(104, 104, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "900 22px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(j.dorsal || ""), 104, 105);
      tex.needsUpdate = true;
    };
    const tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
    pinta(null);
    if (j.cara) { const im = new Image(); im.onload = () => pinta(im); im.src = "/cara/" + encodeURIComponent(j.cara); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    s.scale.set(2.2, 2.2, 1); s.position.y = 1.5;
    return s;
  }

  _cargarModelo(j, g) {
    if (!j.cara) return;
    if (!Pantalla3D.cargador) Pantalla3D.cargador = new GLTFLoader();
    const url = "/api/partido/modelo/" + encodeURIComponent(j.cara) + ".glb";
    if (!Pantalla3D.cache[url]) Pantalla3D.cache[url] = new Promise(ok => Pantalla3D.cargador.load(url, ok, undefined, () => ok(null)));
    Pantalla3D.cache[url].then(gltf => {
      if (!gltf) return;
      const cuerpo = clonarModelo(gltf.scene);
      g.add(cuerpo);
      g.remove(g.userData.ficha);
      g.userData.cuerpo = cuerpo;
      const mezcla = new THREE.AnimationMixer(cuerpo);
      g.userData.mezcla = mezcla;
      for (const [clave, nombre] of Object.entries(ANIM)) {
        const clip = gltf.animations.find(a => a.name === nombre);
        if (clip) g.userData.acciones[clave] = mezcla.clipAction(clip);
      }
      this._anima(g, "parado");
    });
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

  pintar() {
    const p = this.p, dt = Math.min(0.1, this.reloj.getDelta()), h = this._sentido();
    // la camara: en la banda, siguiendo el balon a lo largo
    this.camX += (p.balon.y - this.camX) * Math.min(1, dt * 2.5);
    const z = Math.max(-38, Math.min(38, this.camX));
    this.camara.position.set(-64 * h, 46, z);
    this.camara.lookAt(0, 0, z);
    // jugadores
    p.jugadores.forEach((j, k) => {
      const g = this.figuras[k], u = g.userData;
      const antes = g.position.clone();
      g.position.set(j.x, 0, j.y);
      const v = antes.distanceTo(g.position) / Math.max(dt, 1e-3);
      u.aro.material.color.setHex(j.id === this.elegido ? 0xffe14d : this.colores[j.lado]);
      if (u.cuerpo) {
        u.cuerpo.rotation.y = Math.atan2(j.mx || 0, j.my || j.dir);
        if (!(u.ahora === "tiro" || u.ahora === "patada")) this._anima(g, v > 1.2 ? "correr" : "parado");
        u.mezcla.update(dt);
      }
      u.ficha.material.opacity = j.aturdido > 0 ? 0.5 : 1;
    });
    // el que chuta o pasa, con su animacion
    const r = p.resultado;
    if (r && r !== this._resultadoVisto) {
      this._resultadoVisto = r;
      if (r.tipo === "tiro" && this.figuras[r.tirador]) this._anima(this.figuras[r.tirador], "tiro", true);
    }
    if (p.balon.pase && p.balon.pase !== this._paseVisto) {
      this._paseVisto = p.balon.pase;
      const de = this.figuras[p.balon.pase.de];
      if (de) this._anima(de, "patada", true);
    }
    this.balon.position.set(p.balon.x, 0.35, p.balon.y);
    this._pintarLineas();
    this.render.render(this.escena, this.camara);
  }

  _pintarLineas() {
    this.lineas.clear();
    const linea = (puntos, color) => {
      if (puntos.length < 2) return;
      const geo = new THREE.BufferGeometry().setFromPoints(puntos.map(q => new THREE.Vector3(q.x, 0.08, q.y)));
      this.lineas.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
    };
    for (const j of this.p.jugadores) if (j.lado === this.yo && j.ruta.length) linea([{ x: j.x, y: j.y }, ...j.ruta], 0xffffff);
    if (this.trazo && this.trazo.puntos.length > 1) linea(this.trazo.puntos, 0xffe14d);
  }

  // de un punto de la pantalla (px en CSS) al campo, cortando con el suelo
  aCampo(px, py) {
    const r = this.c.getBoundingClientRect();
    const v = new THREE.Vector2(px / r.width * 2 - 1, -(py / r.height) * 2 + 1);
    this.raton.setFromCamera(v, this.camara);
    const q = new THREE.Vector3();
    if (!this.raton.ray.intersectPlane(this.suelo, q)) return { x: 0, y: 0 };
    return { x: q.x, y: q.z };
  }
  aPantalla(x, y) {
    const r = this.c.getBoundingClientRect();
    const v = new THREE.Vector3(x, 1, y).project(this.camara);
    return { px: (v.x + 1) / 2 * r.width, py: (1 - v.y) / 2 * r.height };
  }
  jugadorEn(px, py, lado) {
    let mejor = null, md = 34;
    for (const j of this.p.jugadores) {
      if (lado !== undefined && j.lado !== lado) continue;
      const q = this.aPantalla(j.x, j.y), d = Math.hypot(q.px - px, q.py - py);
      if (d < md) { md = d; mejor = j; }
    }
    return mejor;
  }
}
Pantalla3D.cache = {};
window.Pantalla3D = Pantalla3D;
