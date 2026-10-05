/* La pantalla del partido (NOTAS O-286, O-294): pinta el campo en un canvas,
   visto desde arriba y en VERTICAL como la pantalla tactil de 3DS. Tu equipo
   (el lado `yo`) ataca siempre hacia arriba, tambien en la segunda parte.
   Las caras salen de /cara/<id> (las de Pizarra). */
"use strict";

// Los rotulos grandes del campo, como los de CS, Galaxy, Light e IE3 (O-306):
// el texto, el color de las letras y los segundos que dura. Los de jugada
// (chico) son mas pequenos y cortos: el juego no se para por ellos (O-307)
const ROTULOS_CAMPO = {
  saque:    { texto: "¡Saque!", color: "#ffffff", dura: 1.4 },
  descanso: { texto: "Fin de la 1.ª parte", color: "#ffe14d", dura: 2.4 },
  final:    { texto: "Fin del partido", color: "#ffe14d", dura: 1.8 },
  fuera:    { texto: "¡Fuera de juego!", color: "#9ff0e6", dura: 1.6 },
  falta:    { texto: "¡Falta!", color: "#ffffff", dura: 1.6 },
  penalti:  { texto: "¡Penalti!", color: "#ffe14d", dura: 1.8 },
  banda:    { texto: "Fuera de banda", color: "#ffffff", dura: 1.1, chico: true },
  corner:   { texto: "¡Córner!", color: "#ffffff", dura: 1.2, chico: true },
  puerta:   { texto: "Saque de puerta", color: "#ffffff", dura: 1.1, chico: true },
  bloqueo:  { texto: "¡Bloqueo!", color: "#ff8cc6", dura: 1.4 },
  invoca:   { texto: "¡Invocación!", color: "#ffa6f7", dura: 1.3, chico: true },
  miximax:  { texto: "¡Miximax Trans!", color: "#ffe14d", dura: 1.3, chico: true },
  tactica:  { texto: "¡Supertáctica!", color: "#ffd27a", dura: 1.3, chico: true },
};
// la banda, del color del equipo al que le toca (el de sus aros y su dorsal);
// la de nadie (descanso, final), azul oscuro
const BANDA_ROTULO = ["rgba(27,74,143,.85)", "rgba(163,36,26,.85)", "rgba(13,26,51,.82)"];
// "¡Aquí!" sobre los tuyos desmarcados (O-306): sin rival a menos de `libre` m,
// sin rival a menos de `linea` m del camino del pase, entre `cerca` y `lejos` m
// del balon y no mas de `atras` m por detras de el. Como mucho `max` a la vez;
// cada uno dura `dura` s y calla `calla` s antes de volver a salir
const AQUI = { libre: 5, linea: 2, cerca: 5, lejos: 38, atras: 2, max: 2, dura: 1.1, calla: 0.6 };

class Pantalla {
  constructor(canvas, partido, yo = 0) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.p = partido; this.yo = yo;
    this.caras = {};
    this.trazo = null;          // la ruta que se esta dibujando con el raton
    this.elegido = null;        // el jugador elegido
    this.colores = [{ aro: "#3fe0d0", fondo: "#1b4a8f", texto: "#fff" }, { aro: "#ff7a4d", fondo: "#a3241a", texto: "#fff" }];
    // los rotulos grandes (O-306): los sucesos ya mirados y los que esperan
    this.vistos = 0; this.cola = [];
    this.quieto = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    // lo que se pinta como en 3DS (O-306): las ondas donde pulsas, la X del tiro,
    // los anillos del duelo que acaba de saltar y los bocadillos de los tuyos
    this.ondas = []; this.puntoTiro = null; this.anillos = null; this.dueloVisto = null;
    this.bocadillos = {}; this.proxAqui = 0; this._techo = {}; this._nombres = [];
    for (const j of partido.jugadores) this._cara(j.cara);
    this.ajustar();
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
    this.c.width = Math.max(300, r.width * ppp); this.c.height = Math.max(200, r.height * ppp);
    this.ppp = ppp;
    // el campo en vertical (68 de ancho x 105 de largo) mas un margen para las porterias
    const ancho = REGLAS.ANCHO + 6, alto = REGLAS.LARGO + 8;
    this.s = Math.min(this.c.width / ancho, this.c.height / alto);
    this.cx = this.c.width / 2; this.cy = this.c.height / 2;
    // con otro tamano, el rotulo que se ve (el del final se queda) se recoloca (O-306)
    for (const r of this.cola) r.y = undefined;
  }

  // hacia donde ataca "yo" en esta parte: +1 si hacia +y
  _sentido() { const j = this.p.jugadores.find(q => q.lado === this.yo); return j ? j.dir : 1; }
  // del campo a la pantalla: el largo en vertical, mi ataque hacia arriba
  aPantalla(x, y) { const h = this._sentido(); return { px: this.cx + x * h * this.s, py: this.cy - y * h * this.s }; }
  aCampo(px, py) {
    const h = this._sentido();
    const X = px * this.ppp, Y = py * this.ppp;
    return { x: (X - this.cx) / this.s * h, y: -(Y - this.cy) / this.s * h };
  }

  pintar() {
    const ctx = this.ctx, p = this.p;
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    this._campo();
    const ahora = performance.now() / 1000;
    this._nombres = [];          // donde van los nombres: los bocadillos no los tapan (O-306)
    // rutas de mi equipo: flechas azules gruesas con punta, como en CS y Galaxy;
    // la que se esta dibujando, en azul claro (O-306)
    for (const j of p.jugadores) {
      if (j.lado !== this.yo || !j.ruta.length) continue;
      this._flecha([{ x: j.x, y: j.y }, ...j.ruta], "#2f8fff");
    }
    if (this.trazo && this.trazo.puntos.length > 1) this._flecha(this.trazo.puntos, "#9fdcff");
    // la linea del fuera de juego, cuando tienes el balon
    const dl = p.dueno();
    if (p.fueraDeJuego && dl && dl.lado === this.yo) {
      const y = p.lineaFueraDeJuego(this.yo) * dl.dir;
      this._linea([{ x: -REGLAS.ANCHO / 2, y }, { x: REGLAS.ANCHO / 2, y }], "rgba(255,225,77,.35)", [10, 8], 2);
    }
    // el pase o el tiro marcado (sale al seguir o al ganar el foco), como en 3DS
    // (O-306): el raso, una linea cian; el bombeado, un arco cian con su sombra; y
    // la X donde cae. El tiro, un cono cian hasta la porteria con la X donde
    // pulsaste (antes, lineas discontinuas amarilla y naranja)
    const pm = (p.paseMarcado || [])[this.yo], d0 = p.dueno(), aire = [];
    if (pm && d0) {
      if (pm.tipo === "tiro") this._cono(d0, true);
      else {
        const destino = pm.a !== undefined ? p.jugadores[pm.a] : { x: pm.x, y: pm.y };
        if (destino) {
          if (pm.alto) { this._linea([d0, destino], "rgba(0,0,0,.28)", [], 3); aire.push([d0, destino, 0]); }
          else this._paseRaso(d0, destino);
          this._equis(destino.x, destino.y);
        }
      }
    }
    // el tiro que se esta eligiendo, con el mismo cono; la X, solo en el tuyo
    const du = p.fase === "duelo" && p.duelo, tir = du && du.tipo === "tiro" ? p.jugadores[du.tirador] : null;
    if (tir) this._cono(tir, tir.lado === this.yo);
    // la linea roja de los que presionan (3DS) y, en el rival al que presionas, la
    // marca naranja con pinchos de CS (O-306)
    let presionado = false;
    for (const j of p.jugadores) {
      if (j.lado === this.yo && j.presiona !== null && j.presiona !== undefined && d0 && d0.id === j.presiona) {
        this._linea([{ x: j.x, y: j.y }, { x: d0.x, y: d0.y }], "rgba(255,80,60,.85)", [], 3);
        presionado = true;
      }
    }
    if (presionado) this._marcaPresion(d0, ahora);
    // el pase en el aire (O-306): el raso, linea cian; el bombeado, su sombra en
    // el suelo y el arco por encima de los jugadores; y la X amarilla donde cae,
    // como en IE3
    const b = p.balon;
    if (b.pase) {
      const dest = b.pase.destino, queda = Math.hypot(dest.x - b.x, dest.y - b.y);
      if (b.pase.alto && b.pase.total) {
        // de donde salio: hacia atras desde el destino, por donde viene el balon
        // (asi vale tambien en el invitado, que no tiene el punto de salida)
        if (queda > 0.3) {
          const k = Math.max(0, Math.min(1, 1 - queda / b.pase.total));
          const ini = { x: dest.x - (dest.x - b.x) / queda * b.pase.total, y: dest.y - (dest.y - b.y) / queda * b.pase.total };
          this._linea([b, dest], "rgba(0,0,0,.28)", [], 3);
          aire.push([ini, dest, k]);
        }
      } else this._paseRaso(b, dest);
      this._equis(dest.x, dest.y);
    }
    // el elegido y el tuyo con el balon: el aro azul en el suelo (antes, el aro
    // amarillo); el rombo va encima, despues de los jugadores (O-306)
    const actual = this._actual();
    for (const j of p.jugadores) if (j.id === actual || (j.conBalon && j.lado === this.yo)) this._aroAzul(j, ahora);
    // los jugadores: primero los de abajo
    const orden = [...p.jugadores].sort((a, c) => this.aPantalla(a.x, a.y).py - this.aPantalla(c.x, c.y).py);
    for (const j of orden) this._jugador(j);
    for (const [de, a, k] of aire) this._arcoPase(de, a, k);
    this._balon();
    if (p.fase === "duelo" && p.duelo && p.duelo.tipo === "foco") {
      const a = p.jugadores[p.duelo.atacante], d = p.jugadores[p.duelo.defensor];
      const A = this.aPantalla(a.x, a.y), D = this.aPantalla(d.x, d.y);
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 4 * this.ppp;
      ctx.beginPath(); ctx.moveTo(A.px, A.py); ctx.lineTo(D.px, D.py); ctx.stroke();
    }
    // los anillos rojos del duelo que acaba de saltar, el rombo del elegido, los
    // bocadillos de los tuyos y la onda donde pulsas (O-306)
    this._anillos(ahora);
    if (actual !== null && p.jugadores[actual]) this._rombo(p.jugadores[actual], ahora);
    this._mirarBocadillos(ahora);
    this._bocadillos(ahora);
    this._ondas(ahora);
    // los demas rotulos, encima de todo; durante el del gol no se pintan (O-306)
    this._mirarRotulos();
    if (p.fase === "gol") this._rotuloGol();
    else this._rotulos();
  }

  // el gol, con letras grandes en el campo mientras se celebra (O-300)
  _rotuloGol() {
    const ctx = this.ctx, p = this.p, r = p.resultado;
    const tir = r && r.tirador !== undefined ? p.jugadores[r.tirador] : null;
    const mio = tir && tir.lado === this.yo;
    const k = Math.max(0, Math.min(1, (3 - p.espera) / 0.3));          // entra en 0,3 s
    const tam = Math.round(this.c.width * 0.22 * (0.55 + 0.45 * k));
    const x = this.c.width / 2, y = this.c.height * 0.46;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.font = "italic 900 " + tam + 'px system-ui, "Segoe UI", sans-serif';
    ctx.lineWidth = tam * 0.14; ctx.strokeStyle = "#0d1a33";
    ctx.fillStyle = mio ? "#ffe14d" : "#ff7a5c";
    ctx.strokeText("¡GOL!", x, y); ctx.fillText("¡GOL!", x, y);
    if (tir) {
      const t2 = Math.round(tam * 0.24);
      ctx.font = "italic 800 " + t2 + 'px system-ui, "Segoe UI", sans-serif';
      ctx.lineWidth = t2 * 0.28; ctx.fillStyle = "#fff";
      ctx.strokeText(tir.nombre, x, y + tam * 0.66); ctx.fillText(tir.nombre, x, y + tam * 0.66);
    }
    ctx.restore();
  }

  // --- los demas rotulos grandes (O-306) ------------------------------------------
  // Como el del gol, cruzan el campo en una banda 1-2 s: el saque, el fin de cada
  // parte (y Victoria, Empate o Derrota desde tu lado), el fuera de juego, la
  // falta y el penalti, la banda, el corner y el saque de puerta, el bloqueo del
  // muro, la invocacion y la supertactica. Salen de los sucesos del motor que
  // llevan `ro`; van en la foto, asi que el invitado los ve igual (los de un
  // anfitrion anterior no lo llevan y no salen). Solo en el campo: el panel de
  // los duelos va en su columna y no se tapa.
  _mirarRotulos() {
    const p = this.p, ev = p.eventos, nuevos = [];
    while (this.vistos < ev.length) {
      const e = ev[this.vistos++];          // online, null si se perdio en un corte
      // uno de hace mas de 4 s (llega tarde, tras un corte de la red) ya no sale
      if (e && e.ro && ROTULOS_CAMPO[e.ro.que] && !(p.pasos - e.paso > 4 / REGLAS.PASO)) nuevos.push(e.ro);
      // "¡Uy!" sobre el tuyo que pierde el balon (O-306); uno que llega tarde, no
      if (e && e.pierde !== undefined && !(p.pasos - e.paso > 2 / REGLAS.PASO)) this._uy(e.pierde);
    }
    // muchos de golpe: solo los dos ultimos
    for (const ro of nuevos.slice(-2)) {
      const d = ROTULOS_CAMPO[ro.que];
      // al acabar una parte, lo de la jugada que quedaba por ensenar sobra
      if (ro.que === "descanso" || ro.que === "final") this.cola = [];
      const fondo = BANDA_ROTULO[ro.lado === 0 || ro.lado === 1 ? ro.lado : 2];
      const r = { texto: d.texto, color: d.color, dura: d.dura, chico: !!d.chico, sub: ro.sub || "", fondo };
      // el bloqueo sale cuando el panel dice "¡Bloqueado!" (partido.js,
      // mostrarResultado: 450 ms por paso y 200 mas): antes lo destripaba
      if (ro.que === "bloqueo") {
        const pasos = p.resultado && p.resultado.pasos;
        r.retardo = pasos ? pasos.length * 0.45 + 0.2 : 1.1;
      }
      this.cola.push(r);
      // y luego, desde tu lado, el resultado, que se queda en el campo
      if (ro.que === "final") {
        const mios = p.goles[this.yo], suyos = p.goles[1 - this.yo];
        this.cola.push({ texto: mios > suyos ? "¡Victoria!" : mios === suyos ? "Empate" : "Derrota",
          color: mios > suyos ? "#ffd23f" : mios === suyos ? "#3fe0d0" : "#b4c2ff", sub: ro.sub || "", fondo, fijo: true });
      }
    }
    // que no se acumulen: el que se ve y los dos ultimos
    while (this.cola.length > 3) this.cola.splice(1, 1);
  }

  _rotulos() {
    const ahora = performance.now() / 1000;
    let r = this.cola[0];
    // el que ha acabado deja sitio al siguiente
    while (r && r.t0 !== undefined && !r.fijo && ahora - r.t0 > r.dura) { this.cola.shift(); r = this.cola[0]; }
    if (!r) return;
    if (r.t0 === undefined) r.t0 = ahora + (r.retardo || 0);
    if (ahora >= r.t0) this._pintarRotulo(r, ahora - r.t0);
  }

  // donde va la banda: en medio, como en los juegos, salvo que tape el balon (el
  // juego sigue en el saque, la banda, una tactica...): entonces arriba o abajo
  _sitioRotulo(alto) {
    const H = this.c.height, b = this.aPantalla(this.p.balon.x, this.p.balon.y).py;
    const hueco = alto / 2 + Math.max(18 * this.ppp, 2.6 * this.s);
    const sitios = [0.46, 0.26, 0.72].map(f => f * H);
    const libre = sitios.find(y => Math.abs(y - b) > hueco);
    return libre !== undefined ? libre : sitios.sort((a, c) => Math.abs(c - b) - Math.abs(a - b))[0];
  }

  _pintarRotulo(r, t) {
    const ctx = this.ctx, W = this.c.width, ppp = this.ppp;
    const fuente = 'px system-ui, "Segoe UI", sans-serif';
    ctx.save();
    // las letras, tan grandes como quepan a lo ancho del campo
    ctx.font = "italic 900 100" + fuente;
    const ancho = Math.max(1, ctx.measureText(r.texto).width);
    const tam = Math.round(Math.min(W * (r.chico ? 0.085 : 0.13), W * 0.86 * 100 / ancho));
    const t2 = r.sub ? Math.max(Math.round(13 * ppp), Math.round(tam * (r.chico ? 0.42 : 0.34))) : 0;
    const alto = tam * 1.3 + (t2 ? t2 * 1.6 : 0);
    if (r.y === undefined) r.y = this._sitioRotulo(alto);
    // entra por la izquierda (0,22 s), las letras crecen un poco y al final se apaga
    const k = this.quieto ? 1 : Math.min(1, t / 0.22), suave = 1 - Math.pow(1 - k, 3);
    const apaga = r.fijo ? 1 : Math.max(0, Math.min(1, (r.dura - t) / 0.3));
    ctx.globalAlpha = (this.quieto ? 1 : Math.min(1, t / 0.1)) * apaga;
    const x = -W * (1 - suave), y0 = r.y - alto / 2;
    ctx.fillStyle = r.fondo; ctx.fillRect(x, y0, W, alto);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillRect(x, y0, W, 2 * ppp); ctx.fillRect(x, y0 + alto - 2 * ppp, W, 2 * ppp);
    const esc = this.quieto ? 1 : 0.8 + 0.2 * Math.min(1, t / 0.25), cx = x + W / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.font = "italic 900 " + Math.round(tam * esc) + fuente;
    ctx.lineWidth = tam * 0.14; ctx.strokeStyle = "#0d1a33"; ctx.fillStyle = r.color;
    ctx.strokeText(r.texto, cx, y0 + tam * 0.66); ctx.fillText(r.texto, cx, y0 + tam * 0.66);
    if (t2) {
      // debajo, quien o para quien (un nombre largo se estrecha, no se sale)
      ctx.font = "italic 800 " + t2 + fuente;
      ctx.lineWidth = t2 * 0.28; ctx.fillStyle = "#fff";
      const ys = y0 + tam * 1.25 + t2 * 0.7;
      ctx.strokeText(r.sub, cx, ys, W * 0.9); ctx.fillText(r.sub, cx, ys, W * 0.9);
    }
    ctx.restore();
  }

  // --- lo que se pinta como en 3DS (O-306) ------------------------------------------
  _radio() { return Math.max(13 * this.ppp, 1.5 * this.s); }
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

  // una ruta como flecha azul gruesa con punta y un borde oscuro que se ve sobre
  // el cesped (antes, linea blanca discontinua)
  _flecha(puntos, color) {
    const ctx = this.ctx, q = [];
    for (const c of puntos) {
      const P = this.aPantalla(c.x, c.y), u = q[q.length - 1];
      if (!u || Math.hypot(P.px - u[0], P.py - u[1]) > 1) q.push([P.px, P.py]);
    }
    if (q.length < 2) return;
    const g = Math.max(5 * this.ppp, 0.75 * this.s), n = q.length, [fx, fy] = q[n - 1];
    // la punta mira como el final de la ruta (el ultimo tramo puede ser muy corto)
    let k = n - 2;
    while (k > 0 && Math.hypot(fx - q[k][0], fy - q[k][1]) < g * 2) k--;
    const l = Math.hypot(fx - q[k][0], fy - q[k][1]) || 1, ux = (fx - q[k][0]) / l, uy = (fy - q[k][1]) / l;
    const largo = Math.min(g * 2.4, l), an = g * 1.35, bx = fx - ux * largo, by = fy - uy * largo;
    const cuerpo = q.slice(0, k + 1).concat([[fx - ux * largo * 0.8, fy - uy * largo * 0.8]]);
    const punta = [[fx, fy], [bx - uy * an, by + ux * an], [bx + uy * an, by - ux * an]];
    const trazar = (pts, cierra) => {
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (cierra) ctx.closePath();
    };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [col, borde] of [["rgba(8,30,80,.55)", 3 * this.ppp], [color, 0]]) {
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = g + borde; trazar(cuerpo); ctx.stroke();
      trazar(punta, true); ctx.fill();
      if (borde) { ctx.lineWidth = borde; ctx.stroke(); }
    }
    ctx.restore();
  }

  // el pase raso: una linea cian con un borde oscuro
  _paseRaso(de, a) {
    this._linea([de, a], "rgba(13,26,51,.35)", [], 5);
    this._linea([de, a], "#5ff3ff", [], 3);
  }

  // el bombeado: un arco cian de k0 (por donde va el balon) a donde cae, con la
  // altura del balon que pinta _balon
  _arcoPase(de, a, k0) {
    const ctx = this.ctx, H = 5 * this.s, pts = [], n = this._alzado(de, a);
    for (let i = 0; i <= 24; i++) {
      const k = k0 + (1 - k0) * i / 24, P = this.aPantalla(de.x + (a.x - de.x) * k, de.y + (a.y - de.y) * k);
      pts.push([P.px + n.x * Math.sin(Math.PI * k) * H, P.py + n.y * Math.sin(Math.PI * k) * H]);
    }
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [col, g] of [["rgba(13,26,51,.35)", 5], ["#5ff3ff", 3]]) {
      ctx.strokeStyle = col; ctx.lineWidth = g * this.ppp;
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    ctx.restore();
  }

  // hacia donde se pinta la altura de un bombeado (el arco y el balon): de lado
  // al pase y hacia arriba de la pantalla. Solo hacia arriba, un pase hacia
  // delante (el mas normal) dejaba el arco encima de su sombra y no se veia
  _alzado(de, a) {
    const A = this.aPantalla(de.x, de.y), B = this.aPantalla(a.x, a.y);
    const l = Math.hypot(B.px - A.px, B.py - A.py);
    if (l < 1) return { x: 0, y: -1 };
    let x = (B.py - A.py) / l, y = -(B.px - A.px) / l;
    if (y > 0 || (y === 0 && x < 0)) { x = -x; y = -y; }
    return { x, y };
  }

  // la X amarilla donde cae el pase (o adonde apuntas el tiro)
  _equis(x, y) {
    const ctx = this.ctx, P = this.aPantalla(x, y), t = Math.max(5 * this.ppp, 0.75 * this.s);
    ctx.save(); ctx.lineCap = "round";
    for (const [col, g] of [["rgba(13,26,51,.7)", 6], ["#ffe14d", 3]]) {
      ctx.strokeStyle = col; ctx.lineWidth = g * this.ppp;
      ctx.beginPath();
      ctx.moveTo(P.px - t, P.py - t); ctx.lineTo(P.px + t, P.py + t);
      ctx.moveTo(P.px + t, P.py - t); ctx.lineTo(P.px - t, P.py + t);
      ctx.stroke();
    }
    ctx.restore();
  }

  // el tiro: un cono cian del que chuta a los dos palos; con conX, la X donde
  // pulsaste en la porteria (si no se sabe, en medio)
  _cono(j, conX) {
    const ctx = this.ctx, g = this.p.porteriaRival(j), m = REGLAS.PORTERIA / 2;
    const A = this.aPantalla(j.x, j.y), B = this.aPantalla(-m, g.y), C = this.aPantalla(m, g.y);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(A.px, A.py); ctx.lineTo(B.px, B.py); ctx.lineTo(C.px, C.py); ctx.closePath();
    ctx.fillStyle = "rgba(95,243,255,.22)"; ctx.fill();
    ctx.strokeStyle = "rgba(95,243,255,.85)"; ctx.lineWidth = 2 * this.ppp; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
    if (!conX) return;
    const t = this.puntoTiro, vale = t && Math.abs(t.y - g.y) < 0.5 && performance.now() / 1000 - t.t < 30;
    this._equis(vale ? t.x : 0, g.y);
  }

  // el aro azul del elegido y del tuyo con balon, a trozos que giran, como el de CS
  _aroAzul(j, ahora) {
    const ctx = this.ctx, P = this.aPantalla(j.x, j.y), r = this._radio();
    const vuelta = 2 * Math.PI * r * 1.45, tramo = vuelta / 6;
    ctx.save();
    ctx.fillStyle = "rgba(47,143,255,.3)";
    ctx.beginPath(); ctx.arc(P.px, P.py, r * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2f8fff"; ctx.lineWidth = 3.5 * this.ppp;
    ctx.setLineDash([tramo * 0.72, tramo * 0.28]);
    ctx.lineDashOffset = this.quieto ? 0 : -(ahora * tramo * 0.8) % vuelta;
    ctx.beginPath(); ctx.arc(P.px, P.py, r * 1.45, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // la marca naranja con pinchos del rival al que presionas, como en CS (22:36)
  _marcaPresion(j, ahora) {
    const ctx = this.ctx, P = this.aPantalla(j.x, j.y), r = this._radio(), R1 = r * 1.4, R2 = r * 1.85, n = 8;
    const giro = this.quieto ? 0 : ahora * 1.2;
    ctx.save();
    ctx.fillStyle = "rgba(255,140,26,.25)";
    ctx.beginPath(); ctx.arc(P.px, P.py, R1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff8c1a"; ctx.lineWidth = 3 * this.ppp; ctx.stroke();
    ctx.fillStyle = "#ff8c1a";
    for (let i = 0; i < n; i++) {
      const a = giro + i * Math.PI * 2 / n, e = 0.16;
      ctx.beginPath();
      ctx.moveTo(P.px + Math.cos(a - e) * R1, P.py + Math.sin(a - e) * R1);
      ctx.lineTo(P.px + Math.cos(a) * R2, P.py + Math.sin(a) * R2);
      ctx.lineTo(P.px + Math.cos(a + e) * R1, P.py + Math.sin(a + e) * R1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // el rombo azul que flota sobre el jugador de la ficha, como en CS
  _rombo(j, ahora) {
    const ctx = this.ctx, P = this.aPantalla(j.x, j.y), ppp = this.ppp;
    const techo = this._techo[j.id] !== undefined ? this._techo[j.id] : P.py - this._radio();
    const h = 18 * ppp, w = 14 * ppp, sube = this.quieto ? 0 : (1 + Math.sin(ahora * 4)) * 1.5 * ppp;
    const x = P.px, y = techo - 5 * ppp - h / 2 - sube;
    const lado = dx => { ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x + dx, y); ctx.lineTo(x, y + h / 2); ctx.closePath(); };
    ctx.save(); ctx.lineJoin = "round";
    // dos caras, clara y oscura, para que parezca de bulto
    ctx.fillStyle = "#6fb6ff"; lado(-w / 2); ctx.fill();
    ctx.fillStyle = "#1f5fd0"; lado(w / 2); ctx.fill();
    ctx.strokeStyle = "#0b2a66"; ctx.lineWidth = 1.5 * ppp;
    ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x - w / 2, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.stroke();
    ctx.restore();
    // sus bocadillos, por encima del rombo (sin bailar con el)
    this._techo[j.id] = techo - 8 * ppp - h;
  }

  // --- los anillos rojos del duelo (O-306) -------------------------------------------
  // Cuando salta un foco o un tiro, dos anillos rojos se cierran en ~0,4 s sobre
  // los dos (o sobre el que chuta), como en CS, Light, Galaxy e IE3. No avisan a
  // distancia: en los videos salen cuando el juego ya se ha parado (lo corrigio
  // la critica). El duelo va en la foto: el invitado los ve igual
  _anillos(ahora) {
    const ctx = this.ctx, p = this.p, du = p.fase === "duelo" && p.duelo;
    if (du && du.id !== this.dueloVisto) {
      this.dueloVisto = du.id;
      this.anillos = { t0: ahora, ids: du.tipo === "foco" ? [du.atacante, du.defensor] : [du.tirador] };
    }
    const a = this.anillos, CIERRA = 0.4, APAGA = 0.15;
    if (!a) return;
    const t = ahora - a.t0, js = a.ids.map(id => p.jugadores[id]).filter(Boolean);
    if (t > CIERRA + APAGA || !js.length) { this.anillos = null; return; }
    const x = js.reduce((s, j) => s + j.x, 0) / js.length, y = js.reduce((s, j) => s + j.y, 0) / js.length;
    // se quedan justo por fuera de los dos
    const fin = Math.max(...js.map(j => Math.hypot(j.x - x, j.y - y))) + 2.6;
    const k = this.quieto ? 1 : Math.min(1, t / CIERRA), falta = Math.pow(1 - k, 2);
    const P = this.aPantalla(x, y), s = this.s, ppp = this.ppp;
    ctx.save();
    ctx.globalAlpha = t > CIERRA ? Math.max(0, 1 - (t - CIERRA) / APAGA) : 0.45 + 0.55 * k;
    for (const R of [fin + falta * 8, fin + 1.6 + falta * 15]) {
      ctx.beginPath(); ctx.arc(P.px, P.py, R * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,43,43,.3)"; ctx.lineWidth = Math.max(8 * ppp, 1.2 * s); ctx.stroke();
      ctx.strokeStyle = "#ff2b2b"; ctx.lineWidth = Math.max(3 * ppp, 0.45 * s); ctx.stroke();
    }
    ctx.restore();
  }

  // --- los bocadillos de tu equipo (O-306) -------------------------------------------
  // "¡Aquí!" sobre los tuyos desmarcados cuando llevas el balon, como el "Here!" o
  // el "Ici !" de Light, CS y Galaxy (ver AQUI), y "¡Uy!" sobre el tuyo que pierde
  // el balon. Solo los tuyos: los del rival no se ven. Salen de las posiciones y
  // de los sucesos, asi que el invitado los ve igual
  // los tuyos a los que se puede pasar ahora, el mas adelantado primero
  _libres(d) {
    const p = this.p, rivales = p.jugadores.filter(r => r.lado !== d.lado), out = [];
    for (const j of p.jugadores) {
      if (j.lado !== d.lado || j === d || j.esPortero || j.aturdido > 0) continue;
      const dx = j.x - d.x, dy = j.y - d.y, dist = Math.hypot(dx, dy), avanza = dy * d.dir;
      if (dist < AQUI.cerca || dist > AQUI.lejos || avanza < -AQUI.atras) continue;
      if (rivales.some(r => Math.hypot(r.x - j.x, r.y - j.y) < AQUI.libre)) continue;
      // la linea de pase: ningun rival cerca del camino del balon (el que esta
      // pegado al del balon no cuenta: el pase sale por su lado)
      if (rivales.some(r => {
        const t = ((r.x - d.x) * dx + (r.y - d.y) * dy) / (dist * dist);
        return t > 0.05 && t < 1 && Math.hypot(d.x + dx * t - r.x, d.y + dy * t - r.y) < AQUI.linea;
      })) continue;
      out.push({ id: j.id, avanza });
    }
    return out.sort((a, b) => b.avanza - a.avanza).map(o => o.id);
  }

  _mirarBocadillos(ahora) {
    const p = this.p, d = p.dueno(), bo = this.bocadillos;
    // con el balon en juego, en la pausa y en tu foco (ahi se marca el pase)
    const juega = !!d && d.lado === this.yo && (p.fase === "juego" || p.fase === "pausa"
      || (p.fase === "duelo" && !!p.duelo && p.duelo.tipo === "foco"));
    for (const id in bo) {
      const b = bo[id], t = ahora - b.t0;
      // los viejos se olvidan; los "¡Aquí!" se callan si ya no llevas el balon
      if (t > b.dura + AQUI.calla || (b.aqui && !juega)) delete bo[id];
    }
    if (!juega || ahora < this.proxAqui) return;
    this.proxAqui = ahora + 0.25;
    const libres = this._libres(d);
    let hablan = 0;
    for (const id in bo) {
      const b = bo[id];
      if (!b.aqui || ahora - b.t0 >= b.dura) continue;
      // el que ya no esta libre se calla enseguida
      if (!libres.includes(+id)) b.dura = Math.min(b.dura, ahora - b.t0 + 0.2);
      else hablan++;
    }
    for (const id of libres) {
      if (hablan >= AQUI.max) break;
      if (bo[id]) continue;          // hablando, o callado un momento
      bo[id] = { texto: "¡Aquí!", t0: ahora, dura: AQUI.dura, aqui: true };
      hablan++;
    }
  }

  _uy(id) {
    const j = this.p.jugadores[id];
    if (!j || j.lado !== this.yo) return;
    this.bocadillos[id] = { texto: "¡Uy!", t0: performance.now() / 1000, dura: 1.4, uy: true };
  }

  _bocadillos(ahora) {
    const ctx = this.ctx, p = this.p, ppp = this.ppp, W = this.c.width;
    const fs = Math.round(11 * ppp), alto = fs + 7 * ppp, cola = 5 * ppp;
    ctx.save();
    ctx.font = "italic 900 " + fs + 'px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    for (const id in this.bocadillos) {
      const b = this.bocadillos[id], t = ahora - b.t0, j = p.jugadores[id];
      if (!j || t < 0 || t > b.dura) continue;
      const P = this.aPantalla(j.x, j.y), techo = this._techo[id] !== undefined ? this._techo[id] : P.py - this._radio();
      const ancho = ctx.measureText(b.texto).width + 12 * ppp;
      // encima de la cabeza (y del nombre o del rombo), sin salirse del campo
      const x = Math.max(2 * ppp, Math.min(W - ancho - 2 * ppp, P.px - ancho / 2));
      let y = Math.max(2 * ppp, techo - 3 * ppp - cola - alto);
      // si tapa el nombre de otro (el del balon, pegado en un duelo) u otro
      // bocadillo, sube por encima
      for (let n = 0; n < 4; n++) {
        const o = this._nombres.find(q => x < q.x + q.w && q.x < x + ancho && y < q.y + q.h && q.y < y + alto + cola);
        if (!o || o.y - 2 * ppp - cola - alto < 2 * ppp) break;
        y = o.y - 2 * ppp - cola - alto;
      }
      this._nombres.push({ x, y, w: ancho, h: alto + cola });
      const cx = Math.max(x + 10 * ppp, Math.min(x + ancho - 10 * ppp, P.px));
      ctx.globalAlpha = Math.max(0, Math.min(1, (b.dura - t) / 0.25));
      ctx.save();
      // sale creciendo desde la punta de la cola
      const crece = this.quieto ? 1 : 0.6 + 0.4 * Math.min(1, t / 0.12), oy = y + alto + cola;
      ctx.translate(cx, oy); ctx.scale(crece, crece); ctx.translate(-cx, -oy);
      this._globo(x, y, ancho, alto, cola, cx);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = "#0d1a33"; ctx.lineWidth = 1.5 * ppp; ctx.stroke();
      ctx.fillStyle = b.uy ? "#c23a2a" : "#0d1a33";
      ctx.fillText(b.texto, x + ancho / 2, y + alto / 2 + 0.5 * ppp);
      ctx.restore();
    }
    ctx.restore();
  }

  // el contorno del bocadillo: caja redondeada con la cola hacia abajo en cx
  _globo(x, y, w, h, cola, cx) {
    const ctx = this.ctx, r = Math.min(6 * this.ppp, h / 2), c = 4 * this.ppp;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(cx + c, y + h); ctx.lineTo(cx, y + h + cola); ctx.lineTo(cx - c, y + h);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // la onda cian donde pulsas: se abre y se apaga en ~0,45 s
  _ondas(ahora) {
    const ctx = this.ctx, ppp = this.ppp, DURA = 0.45;
    this.ondas = this.ondas.filter(o => ahora - o.t0 < DURA);
    if (!this.ondas.length) return;
    ctx.save();
    for (const o of this.ondas) {
      const k = Math.max(0, (ahora - o.t0) / DURA), P = this.aPantalla(o.x, o.y);
      const r = (this.quieto ? 16 : 5 + 20 * (1 - Math.pow(1 - k, 2))) * ppp;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(P.px, P.py, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(13,26,51,.5)"; ctx.lineWidth = 5 * ppp; ctx.stroke();
      ctx.strokeStyle = "#5ff3ff"; ctx.lineWidth = 3 * ppp; ctx.stroke();
    }
    ctx.restore();
  }

  _campo() {
    // todo se pinta en metros del campo y pasa por aPantalla: vale en vertical
    const ctx = this.ctx, s = this.s, L = REGLAS.LARGO, A = REGLAS.ANCHO;
    const P = (x, y) => this.aPantalla(x, y);
    const caja = (x0, y0, x1, y1) => {
      const a = P(x0, y0), b = P(x1, y1);
      return [Math.min(a.px, b.px), Math.min(a.py, b.py), Math.abs(b.px - a.px), Math.abs(b.py - a.py)];
    };
    ctx.fillStyle = "#1f7a3a"; ctx.fillRect(0, 0, this.c.width, this.c.height);
    // franjas de cesped a lo ancho
    const franjas = 14;
    for (let k = 0; k < franjas; k++) {
      ctx.fillStyle = k % 2 ? "#2b8f47" : "#25843f";
      const [x, y, w, h] = caja(-A / 2, -L / 2 + L * k / franjas, A / 2, -L / 2 + L * (k + 1) / franjas);
      ctx.fillRect(x, y, w, h + 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(2, 0.22 * s);
    ctx.strokeRect(...caja(-A / 2, -L / 2, A / 2, L / 2));
    const m1 = P(-A / 2, 0), m2 = P(A / 2, 0);
    ctx.beginPath(); ctx.moveTo(m1.px, m1.py); ctx.lineTo(m2.px, m2.py); ctx.stroke();
    const c = P(0, 0);
    ctx.beginPath(); ctx.arc(c.px, c.py, 9.15 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.px, c.py, 0.4 * s, 0, Math.PI * 2); ctx.fill();
    for (const lado of [-1, 1]) {
      const f = lado * L / 2;
      ctx.strokeRect(...caja(-40.32 / 2, f, 40.32 / 2, f - lado * REGLAS.AREA_Y));
      ctx.strokeRect(...caja(-18.32 / 2, f, 18.32 / 2, f - lado * 5.5));
      const pen = P(0, f - lado * 11);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pen.px, pen.py, 0.35 * s, 0, Math.PI * 2); ctx.fill();
      // la porteria, fuera del campo
      ctx.fillStyle = "rgba(255,255,255,.25)";
      const pt = caja(-REGLAS.PORTERIA / 2, f, REGLAS.PORTERIA / 2, f + lado * 2.2);
      ctx.fillRect(...pt); ctx.strokeRect(...pt);
    }
  }

  _linea(puntos, color, discontinua, grosor = 2) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = grosor * this.ppp; ctx.setLineDash((discontinua || []).map(v => v * this.ppp));
    ctx.beginPath();
    puntos.forEach((q, k) => { const P = this.aPantalla(q.x, q.y); k ? ctx.lineTo(P.px, P.py) : ctx.moveTo(P.px, P.py); });
    ctx.stroke(); ctx.setLineDash([]);
  }

  _jugador(j) {
    // la cara del que entra en un cambio (tuyo, de la maquina o por la foto): solo
    // se pedian las de los 22 del principio y el suplente salia sin cara (O-305)
    this._cara(j.cara);
    const ctx = this.ctx, P = this.aPantalla(j.x, j.y);
    const r = this._radio();
    const col = this.colores[j.lado];
    // el aura de un espiritu invocado (O-295)
    if (this.p.conAura && this.p.conAura(j)) {
      const t = performance.now() / 300;
      ctx.fillStyle = "rgba(160,90,255,.35)";
      ctx.beginPath(); ctx.arc(P.px, P.py, r * (1.55 + 0.12 * Math.sin(t)), 0, Math.PI * 2); ctx.fill();
    }
    // sombra
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(P.px + r * 0.15, P.py + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    // circulo con la cara
    ctx.save();
    ctx.beginPath(); ctx.arc(P.px, P.py, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill();
    const im = this.caras[j.cara];
    if (im && im.complete && im.naturalWidth) { ctx.clip(); ctx.drawImage(im, P.px - r, P.py - r, r * 2, r * 2); }
    ctx.restore();
    // el aro del color de su equipo: el elegido lleva ahora el aro azul y el rombo (O-306)
    ctx.lineWidth = 3 * this.ppp;
    ctx.strokeStyle = col.aro;
    ctx.beginPath(); ctx.arc(P.px, P.py, r, 0, Math.PI * 2); ctx.stroke();
    if (j.aturdido > 0) { ctx.fillStyle = "rgba(20,30,60,.45)"; ctx.beginPath(); ctx.arc(P.px, P.py, r, 0, Math.PI * 2); ctx.fill(); }
    // dorsal
    const dr = r * 0.48;
    ctx.fillStyle = col.fondo; ctx.beginPath(); ctx.arc(P.px + r * 0.72, P.py + r * 0.72, dr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * this.ppp; ctx.stroke();
    ctx.fillStyle = col.texto; ctx.font = `900 ${Math.round(dr * 1.15)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(j.dorsal || "", P.px + r * 0.72, P.py + r * 0.74);
    // nombre del que lleva el balon o del elegido
    if (j.conBalon || j.id === this.elegido) {
      ctx.font = `800 ${Math.round(11 * this.ppp)}px system-ui, sans-serif`;
      const t = j.nombre, tw = ctx.measureText(t).width + 10 * this.ppp;
      ctx.fillStyle = "rgba(10,20,45,.8)"; ctx.fillRect(P.px - tw / 2, P.py - r - 18 * this.ppp, tw, 15 * this.ppp);
      this._nombres.push({ x: P.px - tw / 2, y: P.py - r - 18 * this.ppp, w: tw, h: 15 * this.ppp });
      ctx.fillStyle = "#fff"; ctx.fillText(t, P.px, P.py - r - 10.5 * this.ppp);
    }
    // hasta donde llega por arriba: el rombo y los bocadillos van encima (O-306)
    this._techo[j.id] = P.py - r - (j.conBalon || j.id === this.elegido ? 18 * this.ppp : 0);
    // la barra de KP del portero
    if (j.esPortero && j.kpMax) {
      const bw = r * 2.4, bh = 5 * this.ppp, by = P.py + r + 5 * this.ppp;
      ctx.fillStyle = "rgba(10,20,45,.85)"; ctx.fillRect(P.px - bw / 2, by, bw, bh);
      ctx.fillStyle = j.kp / j.kpMax > 0.5 ? "#3fe0d0" : j.kp / j.kpMax > 0.3 ? "#ffd04d" : "#ff6a4d";
      ctx.fillRect(P.px - bw / 2, by, bw * j.kp / j.kpMax, bh);
    }
  }

  _balon() {
    const ctx = this.ctx, b = this.p.balon, P = this.aPantalla(b.x, b.y);
    let r = Math.max(5 * this.ppp, 0.55 * this.s);
    // un pase bombeado va por el aire: la sombra en el suelo y el balon arriba
    if (b.pase && b.pase.alto && b.pase.total) {
      // lo que le queda, medido desde donde va el balon (vale igual en el invitado online)
      const queda = Math.hypot(b.pase.destino.x - b.x, b.pase.destino.y - b.y);
      const k = Math.max(0, Math.min(1, 1 - queda / b.pase.total));
      const alto = Math.sin(Math.PI * k) * 5 * this.s;
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(P.px, P.py, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // por el arco cian, que se abre de lado si el pase va hacia arriba (O-306)
      const n = this._alzado(b, b.pase.destino);
      P.px += n.x * alto; P.py += n.y * alto; r *= 1 + Math.sin(Math.PI * k) * 0.6;
    }
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(P.px + r * 0.3, P.py + r * 0.6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5 * this.ppp;
    ctx.beginPath(); ctx.arc(P.px, P.py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(P.px, P.py, r * 0.38, 0, Math.PI * 2); ctx.fill();
  }

  // el jugador de un lado que hay en un punto de la pantalla (o null)
  jugadorEn(px, py, lado) {
    const q = this.aCampo(px, py);
    let mejor = null, md = Math.max(2.2, 18 / this.s * this.ppp);
    for (const j of this.p.jugadores) {
      if (lado !== undefined && j.lado !== lado) continue;
      const d = Math.hypot(j.x - q.x, j.y - q.y);
      if (d < md) { md = d; mejor = j; }
    }
    return mejor;
  }
}
