/* HudAbajo (NOTAS O-317; diseno 5.5 y 5.6): lo que va ENCIMA del campo de abajo, en
   su canvas 2D (#abajo-hud), igual para el campo 3D (partido-3d.js) y para la reserva
   2D (partido-pantalla.js): las rutas, los pases (el bombeado con su altura de
   verdad), la estela del pase del rival, la presion, los anillos del duelo que
   CRECEN como en Galaxy, las ondas donde pulsas, el fantasma de colocar, la linea del
   fuera de juego, los triangulos de los que no se ven, el nombre y las barras sobre
   los jugadores y los bocadillos. Los rotulos son los de Galaxy (partido-rotulos.js, que
   programa el Director, O-319). Lo de DEBAJO de los jugadores (discos, cursor, zonas) va
   en el suelo de cada vista.
   Se dibuja en u (320x240; el ctx de la Consola ya va escalado) proyectando cada
   punto del campo con vista.proyectar(x, y, h): las rayas tienen el grosor de Galaxy
   por lejos que esten. Lo que recuerda de un cuadro a otro (la cola de rotulos, los
   bocadillos, los anillos, la estela) va en vista.hud: cada partido, de cero. */
"use strict";

// "¡Aquí!" sobre los tuyos desmarcados (O-306): sin rival a menos de `libre` m,
// sin rival a menos de `linea` m del camino del pase, entre `cerca` y `lejos` m
// del balon y no mas de `atras` m por detras de el. Como mucho `max` a la vez;
// cada uno dura `dura` s y calla `calla` s antes de volver a salir
const AQUI = { libre: 5, linea: 2, cerca: 5, lejos: 38, atras: 2, max: 2, dura: 1.1, calla: 0.6 };
// los anillos rojos del duelo y del tiro (guia 8.1 y 8.2; t01, t02): DOS alrededor del
// portador (o del que chuta) que nacen con 8 y 16 u de radio y CRECEN hasta `crece` s:
// el de dentro llega a 100 u (casi media pantalla) y el de fuera, siempre el doble, sale
// de ella; desde `apaga` s se van en `fuera` s. Medidos en t01: a los 133, 333 y 466 ms
// el de dentro mide 35, 75 y 95 u (casi lineal, frenando un poco al final). Radios en u
// de la pantalla (los de hoy se cerraban)
const ANILLOS = { r0: [8, 16], r1: [100, 200], foco: { crece: 0.47, apaga: 0.53, fuera: 0.16 }, tiro: { crece: 0.57, apaga: 0.6, fuera: 0.1 } };
// la estela del pase del rival (b10, b53): los ultimos puntos del balon, que se apagan
const ESTELA = { puntos: 12, cada: 0.04, dura: 0.6 };
// el pase marcado que se quita (O-335): la raya roja a trozos y la X (de `x` u) que se apagan
const QUITADO = { dura: 0.9, x: 7, color: "#FF5A48" };

const HudAbajo = {
  // lo que recuerda cada vista (un partido nuevo, una vista nueva: de cero)
  de(vista) {
    if (vista.hud) return vista.hud;
    const n = 26;
    return (vista.hud = {
      vistos: 0, bocadillos: {}, proxAqui: 0, anillos: null, dueloVisto: null, resVisto: null, pasoLibre: -1e9,
      rutas: {}, faseAntes: null,
      // por jugador, en u: los pies, lo de arriba de la cabeza y si se ve
      piesX: new Float32Array(n), piesY: new Float32Array(n), techo: new Float32Array(n), ve: new Uint8Array(n),
      nombres: [],
      // los triangulos de este cuadro (para las pruebas)
      triN: 0, triId: new Int16Array(n), triX: new Float32Array(n), triY: new Float32Array(n),
      estela: { x: new Float32Array(ESTELA.puntos), y: new Float32Array(ESTELA.puntos), t: new Float64Array(ESTELA.puntos), n: 0, i: 0, ultimo: -1 },
      q: [{}, {}, {}, {}], buf: new Float32Array(2 * 130),
    });
  },

  pintar(ctx, p, yo, vista, estado) {
    const s = this.de(vista), ahora = performance.now() / 1000;
    s.ctx = ctx; s.p = p; s.yo = yo; s.vista = vista; s.k = 320 / (vista.ancho || 320); s.ahora = ahora;
    ctx.clearRect(0, 0, 320, 240);
    const ab = estado && estado.abajo;
    // en negro y en la repeticion del gol (las posiciones grabadas, no las del motor), nada
    // (O-319); el "Vídeo" lo pone Rotulos
    if (!p || (ab && (ab.modo === "negro" || ab.modo === "repeticion"))) return;
    // lo que cuenta un resultado (el "¡Bien!", el "¡Uy!", el penalti tirado) espera a que
    // acabe su animacion (diseno 6.7): mientras el Director la ensena, no se leen sucesos
    s.esconde = !!(ab && ab.esconde);
    if (s.esconde) s.escondido = true;
    else if (s.escondido) { s.escondido = false; s.pasoLibre = p.pasos; s.revela = true; }
    s.ab = ab;
    const js = p.enCampo ? p.enCampo() : p.jugadores;
    this._medir(s, js);
    // de abajo a arriba: el fuera de juego, las rutas, los pases, la presion...
    this._fueraDeJuego(s);
    this._rutas(s, js);
    this._pases(s);
    this._previaT(s);
    this._estela(s);
    this._presion(s, js);
    if (vista.colocando && p.fase === "saque") this._fantasma(s, vista.colocando);
    if (!s.esconde) this._penaltiTirado(s);
    this._anillos(s);
    // ...lo de encima de cada jugador, los que no se ven y los bocadillos
    this._encima(s, js);
    this._triangulos(s, js);
    this._mirarBocadillos(s);
    this._bocadillos(s);
    this._ondas(s);
    if (!s.esconde) this._mirarSucesos(s);
    s.revela = false;
  },

  // del campo a la pantalla, en u (o: un objeto que se reutiliza)
  _P(s, x, y, h, o) { s.vista.proyectar(x, y, h || 0, o); o.x = o.px * s.k; o.y = o.py * s.k; return o; },

  _medir(s, js) {
    const v = s.vista, q = s.q[0], alto = v.alturaFigura || 4;
    s.ve.fill(0);
    for (const j of js) {
      this._P(s, j.x, j.y, 0, q);
      s.piesX[j.id] = q.x; s.piesY[j.id] = q.y;
      const delante = !q.detras;
      this._P(s, j.x, j.y, alto, q);
      s.techo[j.id] = q.y;
      s.ve[j.id] = delante && s.piesX[j.id] > -10 && s.piesX[j.id] < 330 && s.piesY[j.id] > -10 && q.y < 250 ? 1 : 0;
    }
  },

  // el jugador de la ficha: el elegido o, si no hay, el tuyo que lleva el balon
  _actual(s) {
    const e = s.vista.elegido;
    if (e !== null && e !== undefined) return e;
    const d = s.p.dueno();
    return d && d.lado === s.yo ? d.id : null;
  },

  // --- las marcas (diseno 5.5) ------------------------------------------------------
  // la linea del fuera de juego con el balon (O-296), amarilla a trozos
  _fueraDeJuego(s) {
    const p = s.p, d = p.dueno();
    if (!p.fueraDeJuego || !d || d.lado !== s.yo || !p.lineaFueraDeJuego) return;
    const y = p.lineaFueraDeJuego(s.yo) * d.dir, a = this._P(s, -REGLAS.ANCHO / 2, y, 0, s.q[0]), b = this._P(s, REGLAS.ANCHO / 2, y, 0, s.q[1]);
    const ctx = s.ctx;
    ctx.save(); ctx.setLineDash([7, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,225,77,.45)";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  },

  // las rutas de los tuyos: flecha #11B7F2 de ~5 u con borde #0A3A8A y punta grande que
  // sigue el trazo (guia 2; p03); la que estas dibujando, mas clara
  _rutas(s, js) {
    for (const j of js) {
      if (j.lado !== s.yo || !j.ruta || !j.ruta.length) continue;
      this._flecha(s, j.x, j.y, j.ruta, GX.ruta[0]);
    }
    const t = s.vista.trazo;
    if (t && t.puntos && t.puntos.length > 1) this._flecha(s, t.puntos[0].x, t.puntos[0].y, t.puntos, "#8FE0FF", 1);
  },
  // la flecha por los puntos del suelo (x0, y0 y luego pts desde `desde`)
  _flecha(s, x0, y0, pts, color, desde = 0) {
    const ctx = s.ctx, b = s.buf, q = s.q[0];
    let n = 0;
    const mete = (x, y) => {
      this._P(s, x, y, 0, q);
      if (q.detras) return;
      if (n && Math.hypot(q.x - b[2 * n - 2], q.y - b[2 * n - 1]) < 0.8) return;
      if (n < 128) { b[2 * n] = q.x; b[2 * n + 1] = q.y; n++; }
    };
    mete(x0, y0);
    for (let i = desde; i < pts.length; i++) mete(pts[i].x, pts[i].y);
    if (n < 2) return;
    const g = 5.6, fx = b[2 * n - 2], fy = b[2 * n - 1];
    // la punta mira como el final de la ruta (el ultimo tramo puede ser muy corto)
    let k = n - 2;
    while (k > 0 && Math.hypot(fx - b[2 * k], fy - b[2 * k + 1]) < g * 2.2) k--;
    const l = Math.hypot(fx - b[2 * k], fy - b[2 * k + 1]) || 1, ux = (fx - b[2 * k]) / l, uy = (fy - b[2 * k + 1]) / l;
    const largo = Math.min(g * 2.6, l), an = g * 1.5, bx = fx - ux * largo, by = fy - uy * largo;
    const cuerpo = () => {
      ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      for (let i = 1; i <= k; i++) ctx.lineTo(b[2 * i], b[2 * i + 1]);
      ctx.lineTo(fx - ux * largo * 0.8, fy - uy * largo * 0.8);
    };
    const punta = () => { ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(bx - uy * an, by + ux * an); ctx.lineTo(bx + uy * an, by - ux * an); ctx.closePath(); };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    // el borde oscuro y encima el color, con un brillo claro por el medio
    ctx.strokeStyle = GX.ruta[1]; ctx.fillStyle = GX.ruta[1];
    ctx.lineWidth = g + 2; cuerpo(); ctx.stroke();
    punta(); ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = g; cuerpo(); ctx.stroke(); punta(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.2; cuerpo(); ctx.stroke();
    ctx.restore();
  },

  // el pase marcado (sale al seguir o al ganar el foco) y el pase en el aire: el raso,
  // una linea cian; el bombeado, un arco #0DE1FE mas fino con su altura de verdad y su
  // sombra en el suelo (b11). El destino, un circulo cian en el suelo de la vista
  _pases(s) {
    const p = s.p, pm = (p.paseMarcado || [])[s.yo], d0 = p.dueno(), b = p.balon;
    this._quitado(s, pm, d0);
    if (pm && d0 && pm.tipo !== "tiro") {
      const dest = pm.a !== undefined ? p.jugadores[pm.a] : { x: pm.x, y: pm.y };
      if (dest) { if (pm.alto) this._arco(s, d0, dest, 0); else this._raso(s, d0, dest); }
    }
    if (b.pase && b.pase.destino) {
      const dest = b.pase.destino, queda = Math.hypot(dest.x - b.x, dest.y - b.y);
      // el del rival no: deja su estela (b10)
      const de = p.jugadores[b.pase.de], rival = de && de.lado !== s.yo;
      if (b.pase.alto && b.pase.total) {
        // de donde salio: hacia atras desde el destino, por donde viene el balon
        // (asi vale tambien en el invitado, que no tiene el punto de salida)
        if (queda > 0.3 && !rival) {
          const ini = { x: dest.x - (dest.x - b.x) / queda * b.pase.total, y: dest.y - (dest.y - b.y) / queda * b.pase.total };
          this._arco(s, ini, dest, Math.max(0, Math.min(1, 1 - queda / b.pase.total)));
        }
      } else if (!rival) this._raso(s, b, dest);
    }
  },
  // el pase marcado que se quita con el juego parado (tocando otra vez su destino o al que
  // pasa, Aaron, O-335) se ve: su raya se pone roja y se apaga en QUITADO.dura s con una X
  // donde iba. Si sale (vuelve el juego y el balon va), nada. Vale tambien online: se mira lo
  // marcado de la foto
  _quitado(s, pm, d0) {
    const p = s.p, du = p.duelo;
    const parado = (p.parado && p.parado()) || p.fase === "invocacion" || (p.fase === "duelo" && du && du.tipo === "foco");
    if (pm && d0 && pm.tipo !== "tiro") {
      const a = pm.a !== undefined ? p.jugadores[pm.a] : { x: pm.x, y: pm.y };
      s.pmAntes = a ? { x0: d0.x, y0: d0.y, x1: a.x, y1: a.y } : null;
    } else {
      if (s.pmAntes && !pm && parado) s.quitado = Object.assign({ t0: s.ahora }, s.pmAntes);
      s.pmAntes = null;
    }
    const q = s.quitado;
    if (!q) return;
    const k = (s.ahora - q.t0) / QUITADO.dura;
    if (k >= 1 || k < 0) { s.quitado = null; return; }
    const ctx = s.ctx, A = this._P(s, q.x0, q.y0, 0, s.q[0]), B = this._P(s, q.x1, q.y1, 0, s.q[1]);
    if (A.detras && B.detras) return;
    const t = QUITADO.x * (1 + 0.3 * k);
    ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(60,10,10,.55)"; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.strokeStyle = QUITADO.color; ctx.lineWidth = 2.6; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    for (const [col, g] of [["rgba(60,10,10,.8)", 5], [QUITADO.color, 3]]) {
      ctx.strokeStyle = col; ctx.lineWidth = g; ctx.beginPath();
      ctx.moveTo(B.x - t, B.y - t * 0.8); ctx.lineTo(B.x + t, B.y + t * 0.8); ctx.moveTo(B.x + t, B.y - t * 0.8); ctx.lineTo(B.x - t, B.y + t * 0.8); ctx.stroke();
    }
    ctx.restore();
  },
  // con el raton encima de la T (O-326), adonde iria, a rayas: el tiro largo a la porteria
  // (amarillo), el pase al companero o al hueco (cian), con un aro donde acaba
  _previaT(s) {
    const p = s.p, d = p.dueno();
    if (p.fase !== "juego" || !d || d.lado !== s.yo || !p.botonT || typeof Abajo === "undefined" || !Abajo.encimaT || !Abajo.encimaT()) return;
    const b = p.botonT(d), a = b.que === "pase" ? p.jugadores[b.a] : b.que === "hueco" ? { x: b.x, y: b.y } : b.que === "tiro" ? p.porteriaRival(d) : null;
    if (!a) return;
    const ctx = s.ctx, A = this._P(s, d.x, d.y, 0, s.q[0]), B = this._P(s, a.x, a.y, b.que === "tiro" ? 1.2 : 0, s.q[1]);
    if (A.detras && B.detras) return;
    const color = b.que === "tiro" ? "#F8D040" : "#8FE0FF";
    ctx.save(); ctx.lineCap = "round"; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -s.ahora * 20;
    ctx.strokeStyle = "rgba(10,30,90,.6)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.setLineDash([]); ctx.translate(B.x, B.y); ctx.scale(1, 0.6);
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },
  _raso(s, de, a) {
    const ctx = s.ctx, A = this._P(s, de.x, de.y, 0, s.q[0]), B = this._P(s, a.x, a.y, 0, s.q[1]);
    ctx.save(); ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(10,58,138,.55)"; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.strokeStyle = GX.paseAlto; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.restore();
  },
  // de k0 (por donde va el balon) a donde cae; la altura del balon del motor (O-294)
  _arco(s, de, a, k0) {
    const ctx = s.ctx, q = s.q[0], b = s.buf, N = 24;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const sombra of [true, false]) {
      let n = 0;
      for (let i = 0; i <= N; i++) {
        const k = k0 + (1 - k0) * i / N;
        this._P(s, de.x + (a.x - de.x) * k, de.y + (a.y - de.y) * k, sombra ? 0 : 0.35 + Math.sin(Math.PI * k) * 5, q);
        if (q.detras) continue;
        b[2 * n] = q.x; b[2 * n + 1] = q.y; n++;
      }
      if (n < 2) continue;
      ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      for (let i = 1; i < n; i++) ctx.lineTo(b[2 * i], b[2 * i + 1]);
      if (sombra) { ctx.strokeStyle = "rgba(20,30,20,.4)"; ctx.lineWidth = 4; ctx.stroke(); }
      else {
        ctx.strokeStyle = "rgba(10,58,138,.4)"; ctx.lineWidth = 5.4; ctx.stroke();
        ctx.strokeStyle = GX.paseAlto; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    ctx.restore();
  },

  // la estela roja del pase del rival (#EB271F, b10 y b53): los ultimos puntos del balon
  // en un array fijo, que se apagan en 0,6 s
  _estela(s) {
    const p = s.p, b = p.balon, e = s.estela, N = ESTELA.puntos, ahora = s.ahora;
    const de = b.pase && p.jugadores[b.pase.de];
    if (de && de.lado !== s.yo && ahora - e.ultimo >= ESTELA.cada) {
      e.x[e.i] = b.x; e.y[e.i] = b.y; e.t[e.i] = ahora; e.i = (e.i + 1) % N; e.n = Math.min(N, e.n + 1); e.ultimo = ahora;
    }
    if (!e.n) return;
    const ctx = s.ctx, A = s.q[0], B = s.q[1];
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = GX.paseRival;
    // de la mas vieja a la mas nueva
    for (let m = 1; m < e.n; m++) {
      const i0 = (e.i - e.n + m - 1 + 2 * N) % N, i1 = (i0 + 1) % N, edad = ahora - e.t[i0];
      if (edad > ESTELA.dura) continue;
      this._P(s, e.x[i0], e.y[i0], 0.3, A); this._P(s, e.x[i1], e.y[i1], 0.3, B);
      if (A.detras || B.detras) continue;
      ctx.globalAlpha = 0.85 * (1 - edad / ESTELA.dura);
      ctx.lineWidth = 7.5; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    ctx.restore();
    // la ultima ya vieja: se vacia
    const ult = (e.i - 1 + N) % N;
    if (ahora - e.t[ult] > ESTELA.dura) e.n = 0;
  },

  // la linea roja de los que presionan (3DS) y, en el rival al que presionas, la marca
  // naranja con pinchos de CS (O-306)
  _presion(s, js) {
    const p = s.p, d0 = p.dueno();
    if (!d0 || d0.lado === s.yo) return;
    const ctx = s.ctx, D = this._P(s, d0.x, d0.y, 0, s.q[1]);
    let hay = false;
    for (const j of js) {
      if (j.lado !== s.yo || j.presiona !== d0.id) continue;
      const A = this._P(s, j.x, j.y, 0, s.q[0]);
      ctx.strokeStyle = "rgba(255,80,60,.85)"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(D.x, D.y); ctx.stroke();
      hay = true;
    }
    if (!hay) return;
    const r = 9, R1 = r * 1.4, R2 = r * 1.85, n = 8, giro = s.vista.quieto ? 0 : s.ahora * 1.2;
    ctx.save();
    ctx.translate(D.x, D.y); ctx.scale(1, 0.74);
    ctx.fillStyle = "rgba(255,140,26,.25)";
    ctx.beginPath(); ctx.arc(0, 0, R1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff8c1a"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#ff8c1a";
    for (let i = 0; i < n; i++) {
      const a = giro + i * Math.PI * 2 / n, e = 0.16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - e) * R1, Math.sin(a - e) * R1); ctx.lineTo(Math.cos(a) * R2, Math.sin(a) * R2); ctx.lineTo(Math.cos(a + e) * R1, Math.sin(a + e) * R1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },

  // el que arrastras en la espera de un saque (O-313), donde lo soltarias: su cara medio
  // transparente y una linea a rayas desde donde esta; si ahi no puede, en rojo con
  // una X y el porque encima
  _fantasma(s, c) {
    const p = s.p, j = p.jugadores[c.id];
    if (!j) return;
    const ctx = s.ctx, A = this._P(s, j.x, j.y, 0, s.q[0]), B = this._P(s, c.x, c.y, 0, s.q[1]), r = 10, cy = B.y - r * 0.9;
    const color = c.vale ? GX.color(j.lado, s.yo).claro : "#ff4d4d";
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = c.vale ? "rgba(255,255,255,.85)" : "rgba(255,90,80,.95)";
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.6;
    ctx.save();
    ctx.beginPath(); ctx.arc(B.x, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill();
    const im = GX.cara(j.cara);
    if (GX.cargada(im)) { ctx.clip(); ctx.drawImage(im, B.x - r, cy - r, r * 2, r * 2); }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(B.x, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (!c.vale) {
      const t = r * 0.55;
      ctx.lineWidth = 2.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(B.x - t, cy - t); ctx.lineTo(B.x + t, cy + t); ctx.moveTo(B.x + t, cy - t); ctx.lineTo(B.x - t, cy + t); ctx.stroke();
      if (c.porque) {
        ctx.font = GX.fuente("redonda", 9, 800); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        // encima del jugador, sin salirse por los lados
        const tw = ctx.measureText(c.porque).width + 10, h = 13, y = Math.max(h / 2 + 1, cy - r - 9);
        const x = Math.max(tw / 2 + 2, Math.min(318 - tw / 2, B.x));
        ctx.fillStyle = "rgba(122,20,14,.92)"; ctx.fillRect(x - tw / 2, y - h / 2, tw, h);
        ctx.fillStyle = "#fff"; ctx.fillText(c.porque, x, y + 0.5);
      }
    }
    ctx.restore();
  },

  // el penalti que se acaba de tirar (O-312): en la porteria (dentro de la red, que el
  // portero no lo tape) la zona a la que se tiro el portero, en naranja, y el cono del
  // tiro hacia la suya con la X; amarillo si fue gol. Solo el de ahora (con el que tiro
  // aun en el punto de penalti): uno de antes (el penalti del partido) sigue en
  // p.resultado al empezar la tanda
  _penaltiTirado(s) {
    const p = s.p, rp = p.resultado;
    const rt = rp && rp.tipo === "penalti" && rp.zonas && !!rp.tanda === !!p.tanda && (p.fase === "resultado" || p.fase === "gol") ? p.jugadores[rp.tirador] : null;
    if (!rt || !(Math.abs(Math.abs(p.porteriaRival(rt).y - rt.y) - 11.35) < 1.5 && Math.abs(rt.x) < 1.5)) return;
    const po = p.jugadores[rp.portero];
    this._conoZona(s, rt, rp.zonas[rt.lado], po ? rp.zonas[po.lado] : null, rp.final === "gol");
  },
  _conoZona(s, j, zt, zp, gol) {
    const ctx = s.ctx, p = s.p, g = p.porteriaRival(j), Z = REGLAS.PENALTI_ZONA_X, a = REGLAS.PORTERIA / 6, fondo = Math.sign(g.y) || 1;
    const q = s.q;
    if (zp === 0 || zp === 1 || zp === 2) {
      const x = (zp - 1) * Z, P1 = this._P(s, x - a, g.y, 0, q[0]), P2 = this._P(s, x + a, g.y + fondo * 2.2, 0, q[1]);
      const P3 = this._P(s, x + a, g.y, 0, q[2]), P4 = this._P(s, x - a, g.y + fondo * 2.2, 0, q[3]);
      ctx.save();
      ctx.fillStyle = "rgba(255,122,77,.55)"; ctx.strokeStyle = "#ff7a4d"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(P1.x, P1.y); ctx.lineTo(P3.x, P3.y); ctx.lineTo(P2.x, P2.y); ctx.lineTo(P4.x, P4.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const x = (zt - 1) * Z, y = g.y + fondo * 1.1, A = this._P(s, j.x, j.y, 0, q[0]), B = this._P(s, x - 0.8, y, 0, q[1]), C = this._P(s, x + 0.8, y, 0, q[2]);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.closePath();
    ctx.fillStyle = gol ? "rgba(255,225,77,.30)" : "rgba(0,255,224,.30)"; ctx.fill();
    ctx.strokeStyle = gol ? "#ffe14d" : GX.cono; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
    const E = this._P(s, x, y, 0, q[3]), t = 5;
    ctx.lineCap = "round";
    for (const [col, w] of [["#6A4A00", 3.6], [GX.lineaTiro[1], 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(E.x - t, E.y - t * 0.8); ctx.lineTo(E.x + t, E.y + t * 0.8); ctx.moveTo(E.x + t, E.y - t * 0.8); ctx.lineTo(E.x - t, E.y + t * 0.8); ctx.stroke();
    }
    ctx.restore();
  },

  // los anillos rojos del duelo o del tiro que acaba de saltar: salen cuando el duelo
  // YA salta (no avisan a distancia). El duelo va en la foto: el invitado los ve igual
  _anillos(s) {
    const p = s.p, du = p.fase === "duelo" && p.duelo, ab = s.ab;
    // los programa el Director (O-319): con el, su reloj (que las capturas paran) y siguen
    // aunque el duelo ya se haya resuelto (la entrada)
    if (ab && ab.anillos !== undefined) {
      const d = ab.anillos;
      if (!d) { s.anillos = null; return; }
      s.anillos = s.anillos && s.anillos.ids[0] === d.ids[0] && s.anillos.tiro === d.tiro ? s.anillos : { t0: 0, ids: [d.ids[0]], tiro: d.tiro, radios: [0, 0], alfa: 1 };
      s.anillos.t0 = s.ahora - d.t;
    } else if (du && du.id !== s.dueloVisto) {
      s.dueloVisto = du.id;
      const tiro = du.tipo !== "foco";
      s.anillos = { t0: s.ahora, ids: [tiro ? du.tirador : du.atacante], tiro, radios: [0, 0], alfa: 1 };
    }
    const a = s.anillos;
    if (!a) return;
    const T = a.tiro ? ANILLOS.tiro : ANILLOS.foco, t = s.ahora - a.t0, j = p.jugadores[a.ids[0]];
    if (!j || t > T.apaga + T.fuera) { s.anillos = null; return; }
    // u de la pantalla por metro donde esta: los radios van en u
    const A = this._P(s, j.x, j.y, 0, s.q[0]), B = this._P(s, j.x + 1, j.y, 0, s.q[1]), uPorM = Math.max(0.5, Math.hypot(B.x - A.x, B.y - A.y));
    const k = s.vista.quieto ? 1 : Math.min(1, t / T.crece), e = k * (1.1 - 0.1 * k);
    const alfa = t > T.apaga ? Math.max(0, 1 - (t - T.apaga) / T.fuera) : 1;
    a.alfa = alfa;
    const ctx = s.ctx;
    ctx.save(); ctx.globalAlpha = alfa;
    for (let i = 0; i < 2; i++) {
      const r = ANILLOS.r0[i] + (ANILLOS.r1[i] - ANILLOS.r0[i]) * e;
      a.radios[i] = r;
      this._circuloSuelo(s, j.x, j.y, r / uPorM);
      // el borde oscuro difuminado y el rojo encima (guia 3)
      ctx.strokeStyle = "rgba(90,26,8,.22)"; ctx.lineWidth = 12; ctx.stroke();
      ctx.strokeStyle = "rgba(90,26,8,.5)"; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = GX.anillo[0]; ctx.lineWidth = 6; ctx.stroke();
    }
    ctx.restore();
  },
  // un circulo del suelo proyectado (48 puntos, arrays reutilizados): deja el camino
  _circuloSuelo(s, x, y, r) {
    const ctx = s.ctx, q = s.q[2], N = 48;
    ctx.beginPath();
    let empieza = true;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      this._P(s, x + Math.cos(a) * r, y + Math.sin(a) * r, 0, q);
      if (q.detras) { empieza = true; continue; }
      if (empieza) { ctx.moveTo(q.x, q.y); empieza = false; } else ctx.lineTo(q.x, q.y);
    }
  },

  // --- encima de los jugadores (diseno 5.6) [PIZARRA: Galaxy solo lleva los discos] ---
  // la barra del portero (KP, amarilla) y la del que tiene la hiper puesta (AURA, magenta:
  // lo que le queda), de 22x2 u con su etiqueta de 5 u (b49), y el nombre del elegido y
  // del que lleva el balon (8 u, blanco con contorno, sin caja)
  _encima(s, js) {
    const p = s.p, ctx = s.ctx, actual = this._actual(s), ahora = p.segundosDeJuego ? p.segundosDeJuego() : 0;
    // tu tirador lleva encima el rombo azul de la zona de tiro (b28): sin su nombre (lo
    // tapaba; el rombo ya dice quien es) y sus barras, mas arriba
    const tir = typeof SueloAbajo !== "undefined" ? SueloAbajo.tirador(p, s.yo) : null;
    s.nombres.length = 0;
    for (const j of js) {
      if (!s.ve[j.id]) continue;
      const x = s.piesX[j.id];
      let y = s.techo[j.id] - 2 - (tir === j && j.lado === s.yo ? 14 : 0);
      const barras = [];
      if (j.esPortero && j.kpMax) barras.push(["PP", GX.barraKp, Math.max(0, Math.min(1, j.kp / j.kpMax))]);     // el PP de VR (O-328)
      if (p.conAura && p.conAura(j)) {
        const T = REGLAS.HIPER_TIPOS && REGLAS.HIPER_TIPOS[j.hiperTipo], dura = (T && T.dura) || 45;
        barras.push(["AURA", GX.barraHip, Math.max(0, Math.min(1, (j.aura - ahora) / dura))]);
      }
      for (const [et, col, f] of barras) {
        const bx = x - 9, by = y - 3;
        ctx.fillStyle = "#1A1A1A"; ctx.fillRect(bx - 1, by - 0.5, 24, 3);
        ctx.fillStyle = col; ctx.fillRect(bx, by, 22 * f, 2);
        GX.texto(ctx, et, bx - 1.5, by + 1, { tam: 5, alinea: "right", color: col, contornos: [["#1A1A1A", 0.9]] });
        y -= 5;
      }
      if ((j.id === actual || j.conBalon) && !(tir === j && j.lado === s.yo)) {
        GX.texto(ctx, j.nombre, x, y - 4, { tam: 8, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.3]], ancho: 90 });
        s.nombres.push({ x: x - 30, y: y - 9, w: 60, h: 10 });
        y -= 10;
      }
      s.techo[j.id] = y;
    }
  },

  // los triangulos amarillos (b03): por cada jugador del campo que no se ve, uno de
  // 12x8 u pegado al borde donde lo corta la recta del centro al jugador, apuntando
  // hacia fuera. De los dos equipos [A CONFIRMAR]
  _triangulos(s, js) {
    const ctx = s.ctx, q = s.q[0], alto = (s.vista.alturaFigura || 4) / 2;
    s.triN = 0;
    ctx.save(); ctx.lineJoin = "round";
    for (const j of js) {
      this._P(s, j.x, j.y, alto, q);
      let dx = q.x - 160, dy = q.y - 120;
      // detras de la camara: la direccion, de un punto mas cerca del centro de la vista
      if (q.detras) {
        const c = s.vista.camara || { x: 0, y: 0 };
        this._P(s, c.x + (j.x - c.x) * 0.3, c.y + (j.y - c.y) * 0.3, 0, q);
        dx = q.x - 160; dy = q.y - 120;
        if (!q.detras && dx * dx + dy * dy < 1) continue;
      } else if (q.x >= 0 && q.x <= 320 && q.y >= 0 && q.y <= 240) continue;
      const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      // donde la recta corta el borde (5 u hacia dentro)
      const kx = ux ? (ux > 0 ? 155 : -155) / ux : Infinity, ky = uy ? (uy > 0 ? 115 : -115) / uy : Infinity, kk = Math.min(Math.abs(kx), Math.abs(ky));
      const x = 160 + ux * kk, y = 120 + uy * kk;
      if (s.triN < s.triId.length) { s.triId[s.triN] = j.id; s.triX[s.triN] = x; s.triY[s.triN] = y; s.triN++; }
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -4.4); ctx.lineTo(6, 3.6); ctx.lineTo(-6, 3.6); ctx.closePath();
      ctx.fillStyle = GX.triangulo[0]; ctx.fill(); ctx.strokeStyle = GX.triangulo[1]; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  // --- los bocadillos de tu equipo (O-306; b05-b09) --------------------------------------
  // "¡Aquí!" sobre los tuyos desmarcados cuando llevas el balon (ver AQUI), "¡Uy!" sobre el
  // tuyo que pierde el balon, "¡Bien!" sobre el tuyo que gana un foco, "¡A por ellos!" al
  // soltar una ruta en la pausa (t22) y "¡Atrás!" sobre el que esta en fuera de juego con
  // tu balon. Solo los tuyos. Salen de las posiciones y de los sucesos, asi que el
  // invitado los ve igual
  // los tuyos a los que se puede pasar ahora, el mas adelantado primero
  _libres(s, d) {
    // sin los expulsados: le salia un "¡Aquí!" al de fuera de la banda (O-311)
    const p = s.p, js = p.enCampo ? p.enCampo() : p.jugadores, rivales = js.filter(r => r.lado !== d.lado), out = [];
    for (const j of js) {
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
  },

  _mirarBocadillos(s) {
    const p = s.p, d = p.dueno(), bo = s.bocadillos, ahora = s.ahora;
    // el tuyo que gana un foco: "¡Bien!" (Joli !)
    const r = p.resultado;
    if (r && r !== s.resVisto && !s.esconde) {
      s.resVisto = r;
      const g = r.tipo === "foco" || r.tipo === "disputa" ? p.jugadores[r.ganador] : null;
      if (g && g.lado === s.yo && (p.fase === "resultado" || s.revela)) bo[g.id] = { texto: "¡Bien!", t0: ahora, dura: 1.3, bien: true };
    }
    // las rutas que sueltas en la pausa (y tras pulsar Jugar, hasta que se saca, O-324):
    // "¡A por ellos!" (En force !). Por lo que tiene cada ruta, no por el objeto: al
    // invitado le llegan nuevas en cada foto
    if (p.fase !== s.faseAntes) { s.faseAntes = p.fase; s.rutas = {}; for (const j of p.jugadores) s.rutas[j.id] = this._firma(j); }
    else if (p.fase === "pausa" || p.porSacar) {
      for (const j of p.jugadores) {
        if (j.lado !== s.yo || j.expulsado) continue;
        const f = this._firma(j);
        if (f !== s.rutas[j.id]) { s.rutas[j.id] = f; if (j.ruta && j.ruta.length) bo[j.id] = { texto: "¡A por ellos!", t0: ahora, dura: 1.2, fuerza: true }; }
      }
    }
    // con el balon en juego, en la pausa, en la espera de tu saque (O-308) y en tu
    // foco (ahi se marca el pase)
    const juega = !!d && d.lado === s.yo && (p.fase === "juego" || p.fase === "pausa" || p.fase === "saque"
      || (p.fase === "duelo" && !!p.duelo && p.duelo.tipo === "foco"));
    for (const id in bo) {
      const b = bo[id], t = ahora - b.t0;
      // los viejos se olvidan; los "¡Aquí!" y "¡Atrás!" se callan si ya no llevas el balon
      if (t > b.dura + (b.atras ? 2 : AQUI.calla) || ((b.aqui || b.atras) && !juega)) delete bo[id];
    }
    if (!juega || ahora < s.proxAqui) return;
    s.proxAqui = ahora + 0.25;
    const libres = this._libres(s, d);
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
    // el que esta en fuera de juego con tu balon en juego: "¡Atrás!" (Reculez !), uno
    if (p.fase === "juego" && p.fueraDeJuego && p._enFueraDeJuego && !Object.values(bo).some(b => b.atras)) {
      const f = (p.enCampo ? p.enCampo() : p.jugadores).find(j => j.lado === s.yo && j !== d && !bo[j.id] && p._enFueraDeJuego(j, d));
      if (f) bo[f.id] = { texto: "¡Atrás!", t0: ahora, dura: 1.1, atras: true };
    }
  },
  _firma(j) { const r = j.ruta || [], u = r[r.length - 1]; return r.length + (u ? ":" + Math.round(u.x * 10) + "," + Math.round(u.y * 10) : ""); },

  _uy(s, id) {
    const j = s.p.jugadores[id];
    if (!j || j.lado !== s.yo) return;
    s.bocadillos[id] = { texto: "¡Uy!", t0: s.ahora, dura: 1.4, uy: true };
  },

  _bocadillos(s) {
    const ctx = s.ctx, p = s.p, ahora = s.ahora, alto = 19, cola = 5;
    ctx.save();
    ctx.font = GX.fuente("redonda", 12, 900);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    for (const id in s.bocadillos) {
      const b = s.bocadillos[id], t = ahora - b.t0, j = p.jugadores[id];
      if (!j || j.expulsado || t < 0 || t > b.dura || !s.ve[id]) continue;     // O-311
      const px = s.piesX[id], techo = s.techo[id];
      const ancho = ctx.measureText(b.texto).width + 16;
      // encima de la cabeza (y del nombre), sin salirse de la pantalla
      const x = Math.max(2, Math.min(318 - ancho, px - ancho / 2));
      let y = Math.max(2, techo - 2 - cola - alto);
      // si tapa el nombre de otro (el del balon, pegado en un duelo) u otro
      // bocadillo, sube por encima
      for (let n = 0; n < 4; n++) {
        const o = s.nombres.find(q => x < q.x + q.w && q.x < x + ancho && y < q.y + q.h && q.y < y + alto + cola);
        if (!o || o.y - 2 - cola - alto < 2) break;
        y = o.y - 2 - cola - alto;
      }
      s.nombres.push({ x, y, w: ancho, h: alto + cola });
      // donde ha salido (para las capturas)
      b.caja = [x, y, ancho, alto + cola];
      const cx = Math.max(x + 8, Math.min(x + ancho - 8, px));
      ctx.globalAlpha = Math.max(0, Math.min(1, (b.dura - t) / 0.25));
      ctx.save();
      // sale creciendo desde la punta de la cola
      const crece = s.vista.quieto ? 1 : 0.6 + 0.4 * Math.min(1, t / 0.12), oy = y + alto + cola;
      ctx.translate(cx, oy); ctx.scale(crece, crece); ctx.translate(-cx, -oy);
      if (b.fuerza) {
        // "¡A por ellos!": solo el texto azul claro con su borde y una flechita azul
        ctx.strokeStyle = GX.bocadillo.aPorEllos; ctx.lineWidth = 3.2; ctx.strokeText(b.texto, x + ancho / 2, y + alto / 2);
        ctx.fillStyle = "#DCE8FF"; ctx.fillText(b.texto, x + ancho / 2, y + alto / 2);
        ctx.fillStyle = GX.bocadillo.aPorEllos; ctx.beginPath(); ctx.moveTo(cx - 4, y + alto); ctx.lineTo(cx + 4, y + alto); ctx.lineTo(cx, y + alto + cola + 1); ctx.closePath(); ctx.fill();
      } else {
        this._globo(ctx, x, y, ancho, alto, cola, cx);
        ctx.fillStyle = b.bien ? GX.bocadillo.bien : GX.bocadillo.crema; ctx.fill();
        ctx.strokeStyle = b.bien ? "#0A2A8A" : GX.bocadillo.borde; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = b.bien ? "#FFF6B8" : b.uy ? "#A01818" : "#18264A";
        ctx.fillText(b.texto, x + ancho / 2, y + alto / 2 + 0.4);
      }
      ctx.restore();
    }
    ctx.restore();
  },

  // el contorno del bocadillo: caja redondeada con la cola hacia abajo en cx
  _globo(ctx, x, y, w, h, cola, cx) {
    const r = Math.min(5, h / 2), c = 4;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(cx + c, y + h); ctx.lineTo(cx, y + h + cola); ctx.lineTo(cx - c, y + h);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // la onda cian donde pulsas (la llama partido.js con vista.pulsar): se abre y se apaga
  // en ~0,45 s, en el suelo
  _ondas(s) {
    const v = s.vista, ctx = s.ctx, DURA = 0.45;
    if (!v.ondas || !v.ondas.length) return;
    v.ondas = v.ondas.filter(o => s.ahora - o.t0 < DURA);
    ctx.save();
    for (const o of v.ondas) {
      const k = Math.max(0, (s.ahora - o.t0) / DURA), P = this._P(s, o.x, o.y, 0, s.q[0]);
      if (P.detras) continue;
      const r = v.quieto ? 11 : 3.5 + 14 * (1 - Math.pow(1 - k, 2));
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(P.x, P.y, r, r * 0.74, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(13,26,51,.5)"; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = GX.paseAlto; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  },

  // --- los sucesos de encima del campo -------------------------------------------------
  // "¡Uy!" sobre el tuyo que pierde el balon (O-306). Los rotulos de antes se fueron: son
  // los de Galaxy (Rotulos y el Director, O-319). Uno que llega tarde (tras un corte de la
  // red) no sale; los que esperaron a su animacion cuentan desde que acabo (pasoLibre)
  _mirarSucesos(s) {
    const p = s.p, ev = p.eventos;
    while (s.vistos < ev.length) {
      const e = ev[s.vistos++];          // online, null si se perdio en un corte
      if (e && e.pierde !== undefined && !(p.pasos - Math.max(e.paso, s.pasoLibre) > 2 / REGLAS.PASO)) this._uy(s, e.pierde);
    }
  },
};
