/* La pantalla del partido (NOTAS O-286, O-294): pinta el campo en un canvas,
   visto desde arriba y en VERTICAL como la pantalla tactil de 3DS. Tu equipo
   (el lado `yo`) ataca siempre hacia arriba, tambien en la segunda parte.
   Las caras salen de /cara/<id> (las de Pizarra). */
"use strict";

class Pantalla {
  constructor(canvas, partido, yo = 0) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.p = partido; this.yo = yo;
    this.caras = {};
    this.trazo = null;          // la ruta que se esta dibujando con el raton
    this.elegido = null;        // el jugador elegido
    this.colores = [{ aro: "#3fe0d0", fondo: "#1b4a8f", texto: "#fff" }, { aro: "#ff7a4d", fondo: "#a3241a", texto: "#fff" }];
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
    // rutas de mi equipo
    for (const j of p.jugadores) {
      if (j.lado !== this.yo || !j.ruta.length) continue;
      this._linea([{ x: j.x, y: j.y }, ...j.ruta], "rgba(255,255,255,.75)", [6, 6]);
    }
    if (this.trazo && this.trazo.puntos.length > 1) this._linea(this.trazo.puntos, "#ffe14d", [8, 5], 3);
    // la linea del fuera de juego, cuando tienes el balon
    const dl = p.dueno();
    if (p.fueraDeJuego && dl && dl.lado === this.yo) {
      const y = p.lineaFueraDeJuego(this.yo) * dl.dir;
      this._linea([{ x: -REGLAS.ANCHO / 2, y }, { x: REGLAS.ANCHO / 2, y }], "rgba(255,225,77,.35)", [10, 8], 2);
    }
    // el pase marcado en la pausa (sale al seguir) y la linea roja de los que presionan (3DS)
    const pm = (p.paseMarcado || [])[this.yo], d0 = p.dueno();
    if (pm && d0) {
      const destino = pm.a !== undefined ? p.jugadores[pm.a] : { x: pm.x, y: pm.y };
      this._linea([{ x: d0.x, y: d0.y }, { x: destino.x, y: destino.y }], "#ffe14d", [4, 4], 4);
    }
    for (const j of p.jugadores) {
      if (j.lado === this.yo && j.presiona !== null && j.presiona !== undefined && d0 && d0.id === j.presiona)
        this._linea([{ x: j.x, y: j.y }, { x: d0.x, y: d0.y }], "rgba(255,80,60,.85)", [], 3);
    }
    // el pase en el aire
    const b = p.balon;
    if (b.pase) {
      const de = this.aPantalla(b.x, b.y), a = this.aPantalla(b.pase.destino.x, b.pase.destino.y);
      ctx.strokeStyle = "rgba(255,225,77,.5)"; ctx.setLineDash([3, 6]); ctx.lineWidth = 2 * this.ppp;
      ctx.beginPath(); ctx.moveTo(de.px, de.py); ctx.lineTo(a.px, a.py); ctx.stroke(); ctx.setLineDash([]);
    }
    // los jugadores: primero los de abajo
    const orden = [...p.jugadores].sort((a, c) => this.aPantalla(a.x, a.y).py - this.aPantalla(c.x, c.y).py);
    for (const j of orden) this._jugador(j);
    this._balon();
    if (p.fase === "duelo" && p.duelo && p.duelo.tipo === "foco") {
      const a = p.jugadores[p.duelo.atacante], d = p.jugadores[p.duelo.defensor];
      const A = this.aPantalla(a.x, a.y), D = this.aPantalla(d.x, d.y);
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 4 * this.ppp;
      ctx.beginPath(); ctx.moveTo(A.px, A.py); ctx.lineTo(D.px, D.py); ctx.stroke();
    }
    if (p.fase === "gol") this._rotuloGol();
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
    const ctx = this.ctx, P = this.aPantalla(j.x, j.y);
    const r = Math.max(13 * this.ppp, 1.5 * this.s);
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
    ctx.lineWidth = (j.id === this.elegido ? 4.5 : 3) * this.ppp;
    ctx.strokeStyle = j.id === this.elegido ? "#ffe14d" : col.aro;
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
      ctx.fillStyle = "#fff"; ctx.fillText(t, P.px, P.py - r - 10.5 * this.ppp);
    }
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
      P.py -= alto; r *= 1 + Math.sin(Math.PI * k) * 0.6;
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
