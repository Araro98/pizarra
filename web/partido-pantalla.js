/* La pantalla de abajo en 2D (NOTAS O-286, O-294; reserva de O-317): el campo
   visto desde arriba y en VERTICAL como la tactil de 3DS, con tu ataque siempre
   hacia arriba. Desde O-317 se juega en el campo 3D (partido-3d.js); esto es la
   reserva sin WebGL, con "Campo en 3D" quitado o con /partido?2d: la misma camara
   que el 3D (31 m de ancho, cerca del balon, las flechas), los colores de Galaxy y
   solo lo que va DEBAJO de los jugadores (el campo, los discos, el cursor, las
   zonas). Lo de encima (rutas, pases, anillos, nombres, bocadillos, rotulos) lo
   pinta HudAbajo (partido-hud-abajo.js) para las dos vistas.
   Las caras salen de /cara/<id> (las de Pizarra). */
"use strict";

// el aura de la hiper puesta, del color de su familia (O-310): keshin morado,
// armadura gris azulado, miximax amarillo, totem verde, despertar naranja, modo
// rojo y vinculo turquesa. Relleno y borde: el verde del totem, solo relleno, no se
// veia sobre el cesped. La usan tambien el 3D y el HUD (O-317)
const AURA_HIPER = {
  keshin:    ["rgba(160,90,255,.40)", "#c9a2ff"], armadura: ["rgba(150,175,215,.45)", "#dfe8f6"],
  miximax:   ["rgba(255,215,60,.40)", "#ffe14d"], totem:    ["rgba(120,255,140,.35)", "#c8ffb0"],
  despertar: ["rgba(255,150,40,.42)", "#ffb35c"], modo:     ["rgba(240,60,60,.40)", "#ff9a9a"],
  vinculo:   ["rgba(80,220,230,.38)", "#9ff0e6"],
};

// --- la camara de abajo (NOTAS O-317; diseno 5.3; guia 7.1) ----------------------------
// El punto del campo que se mira, igual para el 3D y la reserva 2D. Sigue al balon con
// 2,5 m hacia arriba de la pantalla (el balon queda al 58 % del alto, como Galaxy) y
// sin pasar de 24 m a cada lado ni de 50 m a lo largo; las flechas lo mueven a 25 m/s
// (el doble con Mayusculas). Con el balon en juego vuelve sola al balon a los 1,5 s de
// soltarlas; con el juego parado se queda donde la dejes (en la pausa y el tiempo de
// tactica de Galaxy se mira el campo con calma) y vuelve al seguir el juego. Al saltar
// un duelo, corte al portador (o al que chuta); al empezar la espera de un saque,
// viaja al balon (t23). En el penalti, entre el punto y la porteria (diseno 5.3
// CRITICA: sin girar). Pura, sin DOM: la prueba la mueve con tiempos de mentira
const CAMARA_ABAJO = {
  adelante: 2.5, limX: 24, limY: 50,
  suave: 0.2, vuelta: 0.4, viaje: 0.5 / 3, espera: 1.5,      // s (constantes de tiempo del suavizado)
  flechas: 25, rapido: 2,                                     // m/s; x2 con Mayusculas
  penalti: { tiro: 3.8, portero: 4.6 },                       // m del punto hacia la porteria
};
class CamaraAbajo {
  constructor() {
    this.x = 0; this.y = 0; this.h = 1;
    this.libre = false;              // movida a mano (flechas o arrastre): no sigue al balon
    this.teclas = { izq: false, der: false, arriba: false, abajo: false, rapido: false };
    this.t = 0; this.soltadaEn = null; this.suave = CAMARA_ABAJO.suave;
    this.penalti = false; this.lista = false;
    this._fase = null; this._duelo = null; this._conFlechas = false; this._o = { x: 0, y: 0 };
    // el punto a seguir en vez del balon del motor: el de la animacion (el vuelo del tiro,
    // la repeticion del gol), que pone el Director (O-319)
    this.guia = null;
  }
  _limita() {
    const C = CAMARA_ABAJO;
    this.x = Math.max(-C.limX, Math.min(C.limX, this.x));
    this.y = Math.max(-C.limY, Math.min(C.limY, this.y));
  }
  // el que tira el penalti que se ve ahora (la espera, el duelo o su resultado), o null
  tiradorPenalti(p) {
    const sq = p.fase === "saque" && p.esperaSaque && p.esperaSaque.tipo === "penalti" ? p.esperaSaque : null;
    if (sq) return p.jugadores[sq.tirador] || null;
    if (p.fase === "duelo" && p.duelo && p.duelo.tipo === "penalti") return p.jugadores[p.duelo.tirador] || null;
    const r = p.resultado;
    if ((p.fase === "resultado" || p.fase === "gol") && r && r.tipo === "penalti") return p.jugadores[r.tirador] || null;
    return null;
  }
  // a donde mira sola
  objetivo(p, h, o = {}) {
    const C = CAMARA_ABAJO, t = this.tiradorPenalti(p);
    if (t) {
      // detras del que tira mirando a la porteria de arriba, o detras de tu porteria si
      // esta abajo; sin girar la vista (izquierda y derecha de las zonas, O-315)
      const g = p.porteriaRival(t), punto = g.y - t.dir * 11, haciaG = Math.sign(g.y - punto) || 1;
      o.x = 0; o.y = punto + haciaG * ((g.y - punto) * h > 0 ? C.penalti.tiro : C.penalti.portero);
    } else if (this.guia) { o.x = this.guia.x; o.y = this.guia.y + C.adelante * h; }
    else { o.x = p.balon.x; o.y = p.balon.y + C.adelante * h; }
    o.x = Math.max(-C.limX, Math.min(C.limX, o.x)); o.y = Math.max(-C.limY, Math.min(C.limY, o.y));
    return o;
  }
  // m en la pantalla: dx hacia la derecha, dy hacia arriba
  mover(dx, dy) {
    this.x += dx * this.h; this.y += dy * this.h;
    this._limita();
    this.libre = true; this.soltadaEn = null; this.lista = true;
  }
  soltar() { if (this.libre) this.soltadaEn = this.t; }
  centrar() { this.libre = false; this.suave = CAMARA_ABAJO.vuelta; }
  // de golpe al jugador (x, y) del motor, como al balon
  cortarA(x, y) {
    this.x = x; this.y = y + CAMARA_ABAJO.adelante * this.h; this._limita();
    this.libre = false; this.lista = true; this.suave = CAMARA_ABAJO.suave;
  }
  paso(dt, p, h) {
    const C = CAMARA_ABAJO;
    this.t += dt;
    if (h !== this.h) { this.h = h; this.lista = false; }        // el cambio de campo: de golpe
    // las flechas
    const k = this.teclas, tx = (k.der ? 1 : 0) - (k.izq ? 1 : 0), ty = (k.arriba ? 1 : 0) - (k.abajo ? 1 : 0);
    if (tx || ty) { const v = C.flechas * (k.rapido ? C.rapido : 1) * dt; this.mover(tx * v, ty * v); this._conFlechas = true; }
    else if (this._conFlechas) { this._conFlechas = false; this.soltar(); }
    // el penalti: su camara, de golpe
    const pen = !!this.tiradorPenalti(p);
    if (pen !== this.penalti) { this.penalti = pen; this.libre = false; this.lista = false; }
    // un duelo nuevo: corte al portador o al que chuta (guia 8.1, +0)
    const du = p.fase === "duelo" && p.duelo;
    if (du && du.id !== this._duelo) {
      this._duelo = du.id;
      const j = p.jugadores[du.tipo === "foco" ? du.atacante : du.tirador];
      if (j && !pen) this.cortarA(j.x, j.y);
    }
    if (p.fase !== this._fase) {
      const antes = this._fase;
      this._fase = p.fase;
      // la espera de un saque: viaja al balon; vuelve el juego: vuelve al balon
      if (p.fase === "saque" && antes !== null) { this.libre = false; this.suave = C.viaje; }
      else if (p.fase === "juego" && this.libre) { this.libre = false; this.suave = C.vuelta; }
    }
    if (this.libre && p.fase === "juego" && this.soltadaEn !== null && this.t - this.soltadaEn >= C.espera) { this.libre = false; this.suave = C.vuelta; }
    if (!this.libre) {
      const o = this.objetivo(p, h, this._o);
      if (!this.lista) { this.x = o.x; this.y = o.y; this.lista = true; this.suave = C.suave; }
      else {
        const a = dt > 0 ? 1 - Math.exp(-dt / this.suave) : 0;
        this.x += (o.x - this.x) * a; this.y += (o.y - this.y) * a;
        if (this.suave !== C.suave && Math.hypot(o.x - this.x, o.y - this.y) < 0.25) this.suave = C.suave;
      }
    }
    return this;
  }
}
if (typeof window !== "undefined") window.CamaraAbajo = CamaraAbajo;

// lo que se marca en el suelo de las dos vistas (O-317; diseno 5.5): quien chuta, la X
// del tiro y el destino del pase. El 3D (partido-3d.js) y la reserva 2D lo sacan de aqui
const SueloAbajo = {
  // el que chuta: el del duelo de tiro, o tu jugador con balon a tiro de porteria o con el
  // tiro marcado (b28: al acercarse a la porteria rival ya se ven el cono, la linea y la X)
  tirador(p, yo) {
    const du = p.fase === "duelo" && p.duelo;
    if (du && (du.tipo === "tiro" || du.tipo === "penalti")) return p.jugadores[du.tirador] || null;
    const d = p.dueno();
    if (!d || d.lado !== yo || !(p.fase === "juego" || p.parado())) return null;
    const pm = (p.paseMarcado || [])[yo];
    // en el saque de centro, no (desde el centro casi todos llegan con un tiro largo)
    if (p.fase === "saque" && p.esperaSaque && p.esperaSaque.tipo === "centro" && !(pm && pm.tipo === "tiro")) return null;
    if (pm && pm.tipo === "tiro") return d;
    const g = p.porteriaRival(d);
    return p._alcanceTiro && Math.hypot(g.x - d.x, g.y - d.y) <= p._alcanceTiro(d) ? d : null;
  },
  // la X del tiro: donde pulsaste (si es de esta porteria y de hace poco) o en medio
  equis(p, j, t) {
    const g = p.porteriaRival(j), vale = t && Math.abs(t.y - g.y) < 0.5 && performance.now() / 1000 - t.t < 30;
    return { x: vale ? t.x : 0, y: g.y };
  },
  // el destino del pase en el aire o del marcado (un jugador o un punto), o null
  destino(p, yo) {
    const b = p.balon;
    if (b.pase && b.pase.destino) return b.pase.destino;
    const pm = (p.paseMarcado || [])[yo], d0 = p.dueno();
    if (pm && d0 && pm.tipo !== "tiro") return pm.a !== undefined ? p.jugadores[pm.a] || null : { x: pm.x, y: pm.y };
    return null;
  },
};

// --- la zona del saque (O-313, O-315) ---------------------------------------------------
// lo que no pueden pisar los tuyos (del motor, zonaSaque): rojo claro con el borde a
// rayas. El circulo alrededor del balon (el radio de cada saque); en el penalti, el
// area y el semicirculo (el trozo del circulo que queda dentro del area no se raya);
// en el saque de puerta, el area sola. fuerte: arrastrando. P(x, y) lleva del campo al
// lienzo (px) y m son px por metro: la usan la reserva 2D (su canvas) y el 3D (la
// textura del suelo, que se repinta solo al empezar la espera o un arrastre, O-317)
function pintarZonaSaque(ctx, z, fuerte, P, m, ppp, ancho, alto) {
  if (!z || (!z.circulo && !z.penalti)) return;
  const R = REGLAS.COLOCAR_LEJOS.penalti;
  const circulo = (c, r) => { const C = P(c.x, c.y); ctx.moveTo(C.px + r * m, C.py); ctx.arc(C.px, C.py, r * m, 0, Math.PI * 2); };
  let area = null;
  if (z.penalti) {
    const pe = z.penalti, A = P(-REGLAS.AREA_X, pe.y), B = P(REGLAS.AREA_X, pe.y + pe.s * REGLAS.AREA_Y);
    area = [Math.min(A.px, B.px), Math.min(A.py, B.py), Math.abs(B.px - A.px), Math.abs(B.py - A.py)];
  }
  ctx.save();
  // relleno: todo junto (el area y el circulo se suman, no se ve doble)
  ctx.beginPath();
  if (z.circulo) circulo(z.circulo, z.circulo.r);
  const punto = z.penalti && z.penalti.punto;     // en el saque de puerta no hay
  if (area) { ctx.rect(...area); if (punto) circulo(punto, R); }
  ctx.fillStyle = fuerte ? "rgba(255,50,40,.36)" : "rgba(255,50,40,.22)"; ctx.fill("nonzero");
  ctx.setLineDash([8 * ppp, 6 * ppp]); ctx.lineWidth = 2 * ppp; ctx.strokeStyle = fuerte ? "rgba(255,225,220,.95)" : "rgba(255,225,220,.7)";
  if (z.circulo) { ctx.beginPath(); circulo(z.circulo, z.circulo.r); ctx.stroke(); }
  if (area) {
    ctx.beginPath(); ctx.rect(...area); ctx.stroke();
    // el semicirculo, solo lo que queda fuera del area
    if (punto) {
      ctx.beginPath(); ctx.rect(0, 0, ancho, alto); ctx.rect(...area); ctx.clip("evenodd");
      ctx.beginPath(); circulo(punto, R); ctx.stroke();
    }
  }
  ctx.restore();
}

// la reserva 2D ve lo mismo que la camara 3D en la fila del centro: 31 m de ancho en los
// 320 u (el 46 % del campo). alto: lo que se acorta lo que sube (el 3D mira a 48 grados)
const VISTA_2D = { ancho: 31, alto: 0.74, disco: 1.0, cursor: 2.1 };

class Pantalla {
  constructor(canvas, partido, yo = 0, opciones = {}) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.p = partido; this.yo = yo;
    this.caras = {};
    this.trazo = null;          // la ruta que se esta dibujando con el raton
    this.colocando = null;      // el que se arrastra en la espera de un saque: {id, x, y, vale, porque} (O-313)
    this.elegido = null;        // el jugador elegido
    this.quieto = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    // las ondas donde pulsas y la X del tiro (O-306): las pinta HudAbajo
    this.ondas = []; this.puntoTiro = null;
    this.camara = opciones.camara || new CamaraAbajo();
    this._t = null; this._tmp = { px: 0, py: 0, dentro: true };
    for (const j of partido.jugadores) this._cara(j.cara);
    this.ajustar();
    // la camara ya en su sitio (las pruebas pintan sin reloj)
    this.camara.paso(0, partido, this._sentido());
  }

  _cara(id) {
    if (!id || this.caras[id]) return;
    const im = new Image();
    im.src = "/cara/" + encodeURIComponent(id);
    this.caras[id] = im;
  }

  ajustar() {
    const r = this.c.getBoundingClientRect();
    const ppp = window.devicePixelRatio || 1;
    this.ancho = Math.max(1, r.width); this.alto = Math.max(1, r.height);        // px CSS de #abajo
    this.c.width = Math.max(1, Math.round(this.ancho * ppp)); this.c.height = Math.max(1, Math.round(this.alto * ppp));
    this.ppp = ppp;
    this.s = this.c.width / VISTA_2D.ancho;            // px del canvas por metro
    this.cx = this.ancho / 2; this.cy = this.alto / 2;  // el centro, en px CSS (como proyectar)
    // la cara, de pie sobre su disco: lo alto que se ve (para el HUD: nombres y bocadillos)
    this.alturaFigura = this._radio() * 1.8 / (this.s * VISTA_2D.alto);
  }

  // hacia donde ataca "yo" en esta parte: +1 si hacia +y. En la tanda, la porteria de
  // la tanda arriba para los dos, sin girar en cada penalti (del motor, O-315)
  _sentido() {
    if (this.p.sentidoPantalla) return this.p.sentidoPantalla(this.yo);
    const j = this.p.jugadores.find(q => q.lado === this.yo); return j ? j.dir : 1;
  }
  // del campo (m) a la pantalla (px CSS de #abajo), con la camara: el largo en vertical,
  // mi ataque hacia arriba. h: la altura (m), que sube en la pantalla como en el 3D
  proyectar(x, y, h = 0, o = {}) {
    const k = this._sentido(), c = this.camara, s = this.s / this.ppp;
    o.px = this.cx + (x - c.x) * k * s;
    o.py = this.cy - (y - c.y) * k * s - h * s * VISTA_2D.alto;
    o.dentro = o.px >= 0 && o.px <= this.ancho && o.py >= 0 && o.py <= this.alto;
    return o;
  }
  aPantalla(x, y) { return this.proyectar(x, y, 0); }
  aCampo(px, py) {
    const k = this._sentido(), c = this.camara, s = this.s / this.ppp;
    return { x: c.x + (px - this.cx) / s * k, y: c.y - (py - this.cy) / s * k };
  }
  // en px del canvas (para pintar)
  _dp(x, y, h = 0) { const q = this.proyectar(x, y, h, this._tmp); return { px: q.px * this.ppp, py: q.py * this.ppp }; }

  // estado: Director.estado (O-319): en negro no se pinta el campo; en la repeticion del
  // gol, las posiciones grabadas (estado.abajo.posiciones, como Mundo.posiciones del 3D); el
  // balon de la animacion en vez del del motor
  pintar(estado) {
    const ctx = this.ctx, p = this.p, ab = (estado && estado.abajo) || {};
    const ahora = performance.now() / 1000, dt = this._t === null ? 0 : Math.min(0.1, Math.max(0, ahora - this._t));
    this._t = ahora;
    this.camara.paso(dt, p, this._sentido());
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    if (ab.modo === "negro") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.c.width, this.c.height); return; }
    const pos = ab.posiciones || null;
    if (pos) {
      // las de la repeticion: se ponen un momento y se dejan como estaban
      const g = this._guardado || (this._guardado = new Float32Array(48));
      p.jugadores.forEach((j, k) => { if (k < 22) { g[k * 2] = j.x; g[k * 2 + 1] = j.y; j.x = pos[k * 2]; j.y = pos[k * 2 + 1]; } });
      try { this._pintarCampo(ctx, p, ahora, ab, true); }
      finally { p.jugadores.forEach((j, k) => { if (k < 22) { j.x = g[k * 2]; j.y = g[k * 2 + 1]; } }); }
      return;
    }
    this._pintarCampo(ctx, p, ahora, ab, false);
  }
  _pintarCampo(ctx, p, ahora, ab, repe) {
    this._campo();
    // el expulsado no se pinta ni se le marca nada (O-311): solo los del campo
    const js = p.enCampo ? p.enCampo() : p.jugadores;
    // en la espera de un saque, donde no puedes colocar a los tuyos (muy cerca del
    // balon, o el area en el penalti); mas fuerte mientras arrastras a uno (O-313)
    if (p.fase === "saque" && p.zonaSaque) this._zonaSaque(p.zonaSaque(this.yo), !!this.colocando);
    // en el suelo, como en Galaxy (O-317): la zona de tiro (b28), el destino del pase
    // (un circulo cian, b53) y el cursor del elegido o del tuyo con balon (b04, b51). En la
    // repeticion, nada de eso (O-319)
    if (!repe) {
      this._zonaTiro();
      this._destinoPase();
      const actual = this._actual();
      for (const j of js) if (j.id === actual || (j.conBalon && j.lado === this.yo)) this._cursor(j, ahora);
    }
    // los jugadores: primero los de arriba (los de abajo tapan)
    const orden = [...js].sort((a, c) => this.aPantalla(a.x, a.y).py - this.aPantalla(c.x, c.y).py);
    for (const j of orden) this._jugador(j);
    if (!ab.ocultarBalon) this._balon(repe ? { x: ab.posiciones[44], y: ab.posiciones[45] } : null);
    if (ab.balonAnim) this._balon(ab.balonAnim, true);
  }

  _radio() { return Math.max(11 * this.ppp, 1.15 * this.s); }
  // el jugador de la ficha: el elegido o, si no hay, el tuyo que lleva el balon
  _actual() {
    if (this.elegido !== null && this.elegido !== undefined) return this.elegido;
    const d = this.p.dueno();
    return d && d.lado === this.yo ? d.id : null;
  }
  // la onda cian donde pulsas, como la mirilla de IE3 (la llama partido.js)
  pulsar(q) {
    this.ondas.push({ x: q.x, y: q.y, t0: performance.now() / 1000 });
    if (this.ondas.length > 4) this.ondas.shift();
  }
  // donde pulsaste en la porteria al chutar: ahi va la X del cono (solo se ve aqui)
  apuntar(x, y) {
    const m = REGLAS.PORTERIA / 2 - 0.6;
    this.puntoTiro = { x: Math.max(-m, Math.min(m, x)), y, t: performance.now() / 1000 };
  }
  // --- en el suelo (O-317) ----------------------------------------------------------------
  // la zona de tiro (b28): cono cian a los dos palos, la linea amarilla con borde oscuro
  // hasta la X y el rombo azul; la linea, la X y el rombo solo en el tuyo
  _zonaTiro() {
    const j = SueloAbajo.tirador(this.p, this.yo);
    if (!j) return;
    const ctx = this.ctx, p = this.p, g = p.porteriaRival(j), m = REGLAS.PORTERIA / 2, ppp = this.ppp;
    const A = this._dp(j.x, j.y), B = this._dp(-m, g.y), C = this._dp(m, g.y);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(A.px, A.py); ctx.lineTo(B.px, B.py); ctx.lineTo(C.px, C.py); ctx.closePath();
    ctx.globalAlpha = 0.45; ctx.fillStyle = GX.cono; ctx.fill(); ctx.globalAlpha = 1;
    if (j.lado === this.yo) {
      const X = SueloAbajo.equis(p, j, this.puntoTiro), E = this._dp(X.x, X.y);
      ctx.lineCap = "round";
      for (const [col, w] of [[GX.triangulo[1], 6], [GX.lineaTiro[0], 3.6]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * ppp;
        ctx.beginPath(); ctx.moveTo(A.px, A.py); ctx.lineTo(E.px, E.py); ctx.stroke();
      }
      this._equis(E.px, E.py);
      // el rombo, encima de su cabeza (como en b04 y b28)
      const R = this._dp(j.x, j.y, this.alturaFigura * 1.25), w = 6 * ppp, h = 8 * ppp;
      ctx.beginPath(); ctx.moveTo(R.px, R.py - h); ctx.lineTo(R.px + w, R.py); ctx.lineTo(R.px, R.py + h); ctx.lineTo(R.px - w, R.py); ctx.closePath();
      ctx.fillStyle = GX.rombo; ctx.fill(); ctx.strokeStyle = "#04206A"; ctx.lineWidth = 1.2 * ppp; ctx.stroke();
    }
    ctx.restore();
  }
  // la X amarilla del tiro (marca_x de los iconos)
  _equis(x, y) {
    const ctx = this.ctx, t = 6 * this.ppp;
    ctx.save(); ctx.lineCap = "round";
    for (const [col, g] of [["#6A4A00", 4.4], [GX.lineaTiro[1], 2.6]]) {
      ctx.strokeStyle = col; ctx.lineWidth = g * this.ppp;
      ctx.beginPath(); ctx.moveTo(x - t, y - t * 0.8); ctx.lineTo(x + t, y + t * 0.8); ctx.moveTo(x + t, y - t * 0.8); ctx.lineTo(x - t, y + t * 0.8); ctx.stroke();
    }
    ctx.restore();
  }
  // el destino del pase: un circulo cian en el suelo (guia 2; b53)
  _destinoPase() {
    const d = SueloAbajo.destino(this.p, this.yo);
    if (!d) return;
    const ctx = this.ctx, P = this._dp(d.x, d.y), r = 1.0 * this.s;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(P.px, P.py, r, r * VISTA_2D.alto, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(10,58,138,.5)"; ctx.lineWidth = 3.5 * this.ppp; ctx.stroke();
    ctx.strokeStyle = GX.paseAlto; ctx.lineWidth = 2 * this.ppp; ctx.stroke();
    ctx.restore();
  }
  // el cursor del elegido y del tuyo con balon (b04, b51): aro azul a trozos con tres
  // pestanas blancas que gira una vuelta por segundo
  _cursor(j, ahora) {
    const ctx = this.ctx, P = this._dp(j.x, j.y), r = VISTA_2D.cursor * this.s, ppp = this.ppp;
    const giro = this.quieto ? 0 : (ahora % 1) * Math.PI * 2;
    ctx.save();
    ctx.translate(P.px, P.py); ctx.scale(1, VISTA_2D.alto);
    for (let i = 0; i < 3; i++) {
      const a0 = giro + i * Math.PI * 2 / 3 + 0.22, a1 = a0 + Math.PI * 2 / 3 - 0.44;
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1);
      ctx.strokeStyle = "#04206A"; ctx.lineWidth = 8 * ppp; ctx.stroke();
      ctx.strokeStyle = "#0A4BF1"; ctx.lineWidth = 6 * ppp; ctx.stroke();
      ctx.strokeStyle = "rgba(190,225,255,.9)"; ctx.lineWidth = 1 * ppp; ctx.stroke();
      // la pestana blanca, en el hueco
      const a = a0 - 0.22;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#04206A"; ctx.lineWidth = 0.8 * ppp;
      ctx.beginPath(); ctx.rect(r - 4 * ppp, -2.5 * ppp, 8 * ppp, 5 * ppp); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _zonaSaque(z, fuerte) {
    pintarZonaSaque(this.ctx, z, fuerte, (x, y) => this._dp(x, y), this.s, this.ppp, this.c.width, this.c.height);
  }

  // el campo de Galaxy (guia 3): la pista roja teja, el cesped moteado sin franjas y
  // las lineas blancas; las porterias con su red
  _campo() {
    const ctx = this.ctx, s = this.s, L = REGLAS.LARGO, A = REGLAS.ANCHO;
    const caja = (x0, y0, x1, y1) => {
      const a = this._dp(x0, y0), b = this._dp(x1, y1);
      return [Math.min(a.px, b.px), Math.min(a.py, b.py), Math.abs(b.px - a.px), Math.abs(b.py - a.py)];
    };
    ctx.fillStyle = GX.pista; ctx.fillRect(0, 0, this.c.width, this.c.height);
    // el cesped: 3 m por las bandas y 4 m por los fondos mas alla de las lineas
    ctx.fillStyle = this._cesped() || GX.cesped[0];
    const c = caja(-A / 2 - 3, -L / 2 - 4, A / 2 + 3, L / 2 + 4);
    const P0 = this._dp(0, 0);
    ctx.save(); ctx.translate(P0.px, P0.py); ctx.fillRect(c[0] - P0.px, c[1] - P0.py, c[2], c[3]); ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = Math.max(1.5 * this.ppp, 0.16 * s);
    ctx.strokeRect(...caja(-A / 2, -L / 2, A / 2, L / 2));
    const m1 = this._dp(-A / 2, 0), m2 = this._dp(A / 2, 0);
    ctx.beginPath(); ctx.moveTo(m1.px, m1.py); ctx.lineTo(m2.px, m2.py); ctx.stroke();
    const cc = this._dp(0, 0);
    ctx.beginPath(); ctx.arc(cc.px, cc.py, 9.15 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cc.px, cc.py, 0.3 * s, 0, Math.PI * 2); ctx.fill();
    for (const lado of [-1, 1]) {
      const f = lado * L / 2;
      ctx.strokeRect(...caja(-REGLAS.AREA_X, f, REGLAS.AREA_X, f - lado * REGLAS.AREA_Y));
      ctx.strokeRect(...caja(-18.32 / 2, f, 18.32 / 2, f - lado * 5.5));
      const pen = this._dp(0, f - lado * 11);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pen.px, pen.py, 0.25 * s, 0, Math.PI * 2); ctx.fill();
      // el semicirculo del area: lo que queda fuera
      const ang = Math.acos((REGLAS.AREA_Y - 11) / 9.15), base = lado * this._sentido() > 0 ? Math.PI / 2 : -Math.PI / 2;
      ctx.beginPath(); ctx.arc(pen.px, pen.py, 9.15 * s, base - ang, base + ang, false); ctx.stroke();
      // la porteria, fuera del campo, con la red
      ctx.fillStyle = "rgba(255,255,255,.28)";
      const pt = caja(-REGLAS.PORTERIA / 2, f, REGLAS.PORTERIA / 2, f + lado * 2.2);
      ctx.fillRect(...pt); ctx.strokeRect(...pt);
    }
  }
  // el moteado del cesped: un lienzo pequeno de ruido, una vez (sin navegador, liso)
  _cesped() {
    if (this._patron !== undefined) return this._patron;
    this._patron = null;
    const lz = GX.lienzo(128, 128);
    if (!lz) return null;
    const c = lz.getContext("2d");
    c.fillStyle = GX.cesped[1]; c.fillRect(0, 0, 128, 128);
    let k = 7;
    const azar = () => (k = (k * 16807) % 2147483647) / 2147483647;
    c.fillStyle = GX.cesped[0];
    for (let i = 0; i < 900; i++) { c.globalAlpha = 0.12 + azar() * 0.3; c.fillRect(azar() * 128, azar() * 128, 1 + azar() * 3, 1 + azar() * 2); }
    c.globalAlpha = 1;
    this._patron = this.ctx.createPattern(lz, "repeat");
    return this._patron;
  }

  _jugador(j) {
    // la cara del que entra en un cambio (tuyo, de la maquina o por la foto): solo
    // se pedian las de los 22 del principio y el suplente salia sin cara (O-305)
    this._cara(j.cara);
    const ctx = this.ctx, P = this._dp(j.x, j.y), ppp = this.ppp;
    const r = this._radio(), cy = P.py - r * 0.9;
    const col = GX.color(j.lado, this.yo);
    // el aura de un espiritu invocado (O-295), del color de su familia (O-310)
    if (this.p.conAura && this.p.conAura(j)) {
      const t = performance.now() / 300;
      const au = AURA_HIPER[j.hiperTipo] || AURA_HIPER.keshin;
      ctx.fillStyle = au[0];
      ctx.beginPath(); ctx.arc(P.px, cy, r * (1.55 + 0.12 * Math.sin(t)), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = au[1]; ctx.lineWidth = 2 * ppp; ctx.stroke();
    }
    // el disco de los pies del color de su equipo, con su borde blanco (b50)
    const dr = VISTA_2D.disco * this.s;
    ctx.beginPath(); ctx.ellipse(P.px, P.py, dr, dr * VISTA_2D.alto, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(P.px, P.py, dr * 0.86, dr * 0.86 * VISTA_2D.alto, 0, 0, Math.PI * 2);
    ctx.fillStyle = col.disco; ctx.fill();
    // de pie: la cara en su circulo
    ctx.save();
    ctx.beginPath(); ctx.arc(P.px, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill();
    const im = this.caras[j.cara];
    if (im && im.complete && im.naturalWidth) { ctx.clip(); ctx.drawImage(im, P.px - r, cy - r, r * 2, r * 2); }
    ctx.restore();
    ctx.lineWidth = 2.5 * ppp;
    ctx.strokeStyle = col.base;
    ctx.beginPath(); ctx.arc(P.px, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (j.aturdido > 0) { ctx.fillStyle = "rgba(20,30,60,.45)"; ctx.beginPath(); ctx.arc(P.px, cy, r, 0, Math.PI * 2); ctx.fill(); }
    // con amarilla, una tarjetita amarilla arriba a la izquierda de la cara (O-311)
    if (j.amarillas) {
      const w = r * 0.5, h = r * 0.7;
      ctx.save();
      ctx.translate(P.px - r * 0.78, cy - r * 0.62); ctx.rotate(-0.22);
      ctx.fillStyle = "#ffe14d"; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "#0d1a33"; ctx.lineWidth = 1.5 * ppp; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // el balon del motor (o, con `en`, uno en ese punto: el de la repeticion o el de la
  // animacion, que trae su altura h)
  _balon(en, anim) {
    const ctx = this.ctx, b = en || this.p.balon, P = this._dp(b.x, b.y);
    let r = Math.max(4 * this.ppp, 0.4 * this.s), alto = anim ? Math.max(0, (b.h || 0.4) - 0.4) : 0;
    // un pase bombeado va por el aire: la sombra en el suelo y el balon arriba, con su
    // altura de verdad (sube en la pantalla, como en el 3D)
    if (!en && b.pase && b.pase.alto && b.pase.total) {
      // lo que le queda, medido desde donde va el balon (vale igual en el invitado online)
      const queda = Math.hypot(b.pase.destino.x - b.x, b.pase.destino.y - b.y);
      alto = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - queda / b.pase.total))) * 5;
    }
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(P.px, P.py, r * 1.1, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    const Q = this._dp(b.x, b.y, alto + 0.4);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#222"; ctx.lineWidth = 1.2 * this.ppp;
    ctx.beginPath(); ctx.arc(Q.px, Q.py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(Q.px, Q.py, r * 0.38, 0, Math.PI * 2); ctx.fill();
  }

  // el jugador de un lado que hay en un punto de la pantalla (px CSS), o null: su cara
  // (de pie sobre el disco) o, si no, el mas cerca de sus pies
  jugadorEn(px, py, lado) {
    const ppp = this.ppp, X = px * ppp, Y = py * ppp, r = this._radio();
    let mejor = null, md = Infinity;
    for (const j of this.p.enCampo ? this.p.enCampo() : this.p.jugadores) {     // al expulsado no se le elige (O-311)
      if (lado !== undefined && j.lado !== lado) continue;
      const P = this._dp(j.x, j.y), cara = Math.hypot(P.px - X, P.py - r * 0.9 - Y), pies = Math.hypot(P.px - X, P.py - Y);
      const d = Math.min(cara, pies);
      if (d < r * 1.25 && d < md) { md = d; mejor = j; }
    }
    return mejor;
  }
}
