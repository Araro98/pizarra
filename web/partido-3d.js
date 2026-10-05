/* La vista 3D del partido (NOTAS O-293, O-301): la pantalla de ARRIBA, como en
   la 3DS. Se juega siempre en el campo 2D de abajo (partido-pantalla.js); aqui
   solo se pinta: un campo en 3D visto desde la banda, como una retransmision,
   que se acerca a los dos de cada duelo, y los jugadores con su
   modelo del juego si este PC lo ha convertido (datos/modelos3d, se saca de
   la instalacion de cada uno y nunca se reparte) o, si no, una ficha de pie
   con su cara. Usa three.js (MIT) en local. */
import * as THREE from "./partido-three.module.js";
import { GLTFLoader } from "./partido-GLTFLoader.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";

// la camara y el tamano de los modelos (ajustables)
const ESCENA = { distancia: 30, altura: 19, escalaModelo: 1.45, dueloDistancia: 12, dueloAltura: 5.5 };
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
    this.camara = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
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
    this.matRuta = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.matTrazo = new THREE.LineBasicMaterial({ color: 0xffe14d });
    this.camX = 0; this.reloj = new THREE.Clock();
    this.ajustar();
    this._prepararModelos();
  }

  ajustar() {
    const r = this.c.getBoundingClientRect();
    this.ppp = window.devicePixelRatio || 1;
    this.render.setPixelRatio(this.ppp);
    this.render.setSize(Math.max(300, r.width), Math.max(200, r.height), false);
    this.camara.aspect = Math.max(300, r.width) / Math.max(200, r.height);
    this.camara.updateProjectionMatrix();
  }

  // el campo: x del motor -> -x de three, y del motor -> z de three. Con x sin
  // cambiar de signo la 3D salia en espejo del campo de abajo (tu banda izquierda
  // cerca de la camara); asi es el campo de abajo girado (O-305)
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
    // cesped tambien fuera del campo: con el balon pegado a la banda de cerca la
    // camara sale del campo y abajo se veia el fondo azul (O-305)
    const fuera = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 1 }));
    fuera.rotation.x = -Math.PI / 2; fuera.position.y = -0.05;
    this.escena.add(fuera);
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
    g.userData = { cara: j.cara, aro, ficha: this._ficha(j), cuerpo: null, mezcla: null, acciones: {}, ahora: null, cargando: false };
    g.add(g.userData.ficha);
    this.escena.add(g);
    return g;            // el modelo lo pone _verModelos cuando el servidor lo tiene
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
    if (!j.cara || g.userData.cuerpo || g.userData.cargando) return;
    if (!Pantalla3D.cargador) Pantalla3D.cargador = new GLTFLoader();
    const url = "/api/partido/modelo/" + encodeURIComponent(j.cara) + ".glb";
    // si no esta (404) o no se puede leer, la promesa se olvida: asi se vuelve a
    // pedir cuando la cola del servidor lo haya convertido
    if (!Pantalla3D.cache[url]) {
      Pantalla3D.cache[url] = new Promise(ok => Pantalla3D.cargador.load(url, ok, undefined,
        () => { delete Pantalla3D.cache[url]; ok(null); }));
    }
    g.userData.cargando = true;
    Pantalla3D.cache[url].then(gltf => {
      g.userData.cargando = false;
      if (!gltf || g.userData.cuerpo) return;
      const cuerpo = clonarModelo(gltf.scene);
      cuerpo.scale.setScalar(ESCENA.escalaModelo);
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

  // Los modelos de los 22: el servidor convierte en segundo plano los que este
  // PC aun no tiene (ievr/modelos3d.py) y aqui se mira cada 2 s como va; cada
  // ficha se cambia por su modelo en cuanto esta (O-293).
  _prepararModelos() {
    this.codigos = [...new Set(this.p.jugadores.map(j => j.cara).filter(Boolean))];
    if (!this.codigos.length) return;
    fetch("/api/partido/modelos/preparar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos: this.codigos }),
    }).then(r => r.json()).then(e => this._verModelos(e))
      .catch(() => this.figuras.forEach((g, k) => this._cargarModelo(this.p.jugadores[k], g)));
  }

  _verModelos(e) {
    if (!this.c.isConnected) return;           // ya es otro partido
    const hechos = new Set(e.hechos || []), errores = e.errores || {};
    this.p.jugadores.forEach((j, k) => { if (hechos.has(j.cara)) this._cargarModelo(j, this.figuras[k]); });
    const enCola = new Set([...(e.pendientes || []), e.actual].filter(Boolean));
    // se cuenta sobre los que juegan ahora: tras un cambio salia "23 de 24"
    // contando tambien al que se fue (O-305)
    const ahora = [...new Set(this.p.jugadores.map(j => j.cara).filter(Boolean))];
    const quedan = ahora.filter(c => enCola.has(c)).length;
    const listos = ahora.filter(c => hechos.has(c)).length;
    const fallan = ahora.filter(c => errores[c]).length;
    // sin juego no se convierte nada, pero los que ya estaban hechos se ven: solo se avisa si falta alguno
    if (e.error) return this._avisar(listos < ahora.length ? e.error : "", 9000);
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

  // el aviso pequeno de abajo a la izquierda del campo; "" lo quita
  _avisar(texto, ms) {
    const a = document.getElementById("aviso-3d");
    if (!a) return;
    clearTimeout(this._quitaAviso);
    a.textContent = texto; a.hidden = !texto;
    if (texto && ms) this._quitaAviso = setTimeout(() => { if (this.c.isConnected) a.hidden = true; }, ms);
  }

  // un cambio (O-297): la figura del que entra, con su modelo si lo hay o en
  // cuanto la cola lo tenga
  _cambiarFigura(j, k) {
    const vieja = this.figuras[k];
    this.escena.remove(vieja);
    const g = this._figura(j);
    g.position.copy(vieja.position);
    this.figuras[k] = g;
    if (!j.cara) return;
    fetch("/api/partido/modelos/preparar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos: [j.cara] }),
    }).then(r => r.json()).then(e => this._verModelos(e)).catch(() => this._cargarModelo(j, g));
  }

  // al acabar el partido (o empezar otro): suelta la tarjeta grafica
  cerrar() {
    clearTimeout(this._espera); clearTimeout(this._quitaAviso);
    for (const l of this.lineas.children) l.geometry.dispose();
    this.matRuta.dispose(); this.matTrazo.dispose();
    try { this.render.dispose(); } catch (e) {}
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
    // los que han entrado del banquillo (O-297)
    p.jugadores.forEach((j, k) => { if (this.figuras[k].userData.cara !== j.cara) this._cambiarFigura(j, k); });
    // la camara: desde la banda, siguiendo el balon a lo largo y un poco a lo
    // ancho (como la retransmision de VR); en un duelo se acerca a los dos, y
    // en un tiro al que chuta (el corte de la pantalla de arriba de la 3DS)
    // fx ya en la x de three, cambiada de signo (O-305)
    let fx = -p.balon.x, fz = p.balon.y, cerca = 0;
    const du = p.fase === "duelo" && p.duelo;
    if (du) {
      const a = p.jugadores[du.tipo === "foco" ? du.atacante : du.tirador];
      const b = p.jugadores[du.tipo === "foco" ? du.defensor : du.portero];
      if (a && b) { fx = -(du.tipo === "foco" ? (a.x + b.x) / 2 : a.x); fz = du.tipo === "foco" ? (a.y + b.y) / 2 : a.y; cerca = 1; }
    }
    const v = Math.min(1, dt * (du ? 4 : 2.5));
    this.camX += (fz - this.camX) * v;
    this.camY = (this.camY || 0) + (fx - (this.camY || 0)) * v;
    this.zoom = (this.zoom || 0) + (cerca - (this.zoom || 0)) * Math.min(1, dt * 3);
    const dist = ESCENA.distancia + (ESCENA.dueloDistancia - ESCENA.distancia) * this.zoom;
    const alt = ESCENA.altura + (ESCENA.dueloAltura - ESCENA.altura) * this.zoom;
    const lim = 42 + 8 * this.zoom;
    const z = Math.max(-lim, Math.min(lim, this.camX));
    // en la mitad del ancho de la banda de la camara, la camara va entera con el
    // balon, sin recortar a 24 m ni inclinarse: pegados a esa banda el balon y los
    // del duelo quedaban por debajo de la imagen. En la otra mitad, como antes; en
    // el centro las dos coinciden (O-305)
    let mira;
    if (this.camY * h < 0) {
      mira = this.camY;
      this.camara.position.set(mira - dist * h, alt, z);
    } else {
      const x = Math.max(-24, Math.min(24, this.camY));
      mira = x * (0.6 + 0.4 * this.zoom);
      this.camara.position.set(x * (0.4 + 0.6 * this.zoom) - dist * h, alt, z);
    }
    this.camara.lookAt(mira, this.zoom, z);
    // al sacar de centro (al empezar, tras un gol y en la 2a parte) todos miran
    // un momento al frente, como en el motor, aunque se recoloquen (O-305)
    if (this._fase === undefined || (this._fase !== p.fase && (this._fase === "gol" || this._fase === "descanso"))) this._saque = 0.5;
    else if (this._saque > 0) this._saque -= dt;
    this._fase = p.fase;
    // jugadores
    p.jugadores.forEach((j, k) => {
      const g = this.figuras[k], u = g.userData;
      const antes = g.position.clone();
      g.position.set(-j.x, 0, j.y);        // x cambiada de signo: sin espejo (O-305)
      // hacia donde mira y si corre, de lo que se mueve la figura: la foto del
      // invitado no trae hacia donde mira cada uno (miraban siempre al frente de
      // la 1a parte). La velocidad va suavizada: con 30 pasos por segundo del
      // motor, la mitad de los cuadros salian quietos y la animacion de correr
      // empezaba de nuevo en cada uno (O-305)
      const dx = g.position.x - antes.x, dz = g.position.z - antes.z, paso = Math.hypot(dx, dz);
      if (paso > 3 || this._saque > 0) { u.vel = 0; u.mira = undefined; }     // un salto o el saque: no es correr
      else {
        u.vel = (u.vel || 0) + (paso / Math.max(dt, 1e-3) - (u.vel || 0)) * Math.min(1, dt * 8);
        if (paso > 0.005 && u.vel > 1.2) u.mira = Math.atan2(dx, dz);
      }
      u.aro.material.color.setHex(j.id === this.elegido ? 0xffe14d : this.colores[j.lado]);
      if (u.cuerpo) {
        u.cuerpo.rotation.y = u.mira !== undefined ? u.mira : Math.atan2(0, j.dir);
        if (!(u.ahora === "tiro" || u.ahora === "patada")) this._anima(g, u.vel > 1.2 ? "correr" : "parado");
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
    // el pase bombeado va por el aire (O-294)
    let alto = 0.35;
    const pa = p.balon.pase;
    if (pa && pa.alto && pa.total) {
      const queda = Math.hypot(pa.destino.x - p.balon.x, pa.destino.y - p.balon.y);
      alto += Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - queda / pa.total))) * 5;
    }
    this.balon.position.set(-p.balon.x, alto, p.balon.y);
    this._pintarLineas();
    this.render.render(this.escena, this.camara);
  }

  _pintarLineas() {
    // las lineas se rehacen en cada cuadro: sin soltar la geometria de las de
    // antes, three.js las guardaba todo el partido (memoria de video que solo
    // crecia). Los dos materiales son fijos (O-305)
    for (const l of this.lineas.children) l.geometry.dispose();
    this.lineas.clear();
    const linea = (puntos, mat) => {
      if (puntos.length < 2) return;
      const geo = new THREE.BufferGeometry().setFromPoints(puntos.map(q => new THREE.Vector3(-q.x, 0.08, q.y)));
      this.lineas.add(new THREE.Line(geo, mat));
    };
    for (const j of this.p.jugadores) if (j.lado === this.yo && j.ruta.length) linea([{ x: j.x, y: j.y }, ...j.ruta], this.matRuta);
    if (this.trazo && this.trazo.puntos.length > 1) linea(this.trazo.puntos, this.matTrazo);
  }

  // de un punto de la pantalla (px en CSS) al campo, cortando con el suelo
  aCampo(px, py) {
    const r = this.c.getBoundingClientRect();
    const v = new THREE.Vector2(px / r.width * 2 - 1, -(py / r.height) * 2 + 1);
    this.raton.setFromCamera(v, this.camara);
    const q = new THREE.Vector3();
    if (!this.raton.ray.intersectPlane(this.suelo, q)) return { x: 0, y: 0 };
    return { x: -q.x, y: q.z };
  }
  aPantalla(x, y) {
    const r = this.c.getBoundingClientRect();
    const v = new THREE.Vector3(-x, 1, y).project(this.camara);
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
