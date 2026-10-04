/* La pantalla del partido (NOTAS O-286): pinta el campo en un canvas, visto
   desde arriba como en DS, en horizontal para que quepa en un PC. Tu equipo
   (el lado `yo`) ataca siempre hacia la derecha, tambien en la segunda parte.
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
    // el campo (105 x 68) mas un margen para las porterias
    const ancho = REGLAS.LARGO + 8, alto = REGLAS.ANCHO + 6;
    this.s = Math.min(this.c.width / ancho, this.c.height / alto);
    this.cx = this.c.width / 2; this.cy = this.c.height / 2;
  }

  // hacia donde ataca "yo" en esta parte: +1 si hacia +y
  _sentido() { const j = this.p.jugadores.find(q => q.lado === this.yo); return j ? j.dir : 1; }
  aPantalla(x, y) { const h = this._sentido(); return { px: this.cx + y * h * this.s, py: this.cy + x * h * this.s }; }
  aCampo(px, py) {
    const h = this._sentido();
    const X = px * this.ppp, Y = py * this.ppp;
    return { x: (Y - this.cy) / this.s * h, y: (X - this.cx) / this.s * h };
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
  }

  _campo() {
    const ctx = this.ctx, s = this.s, L = REGLAS.LARGO, A = REGLAS.ANCHO;
    const esq = this.aPantalla(-A / 2, -L / 2), otra = this.aPantalla(A / 2, L / 2);
    const x0 = Math.min(esq.px, otra.px), y0 = Math.min(esq.py, otra.py), w = Math.abs(otra.px - esq.px), h = Math.abs(otra.py - esq.py);
    // fondo y franjas de cesped
    ctx.fillStyle = "#1f7a3a"; ctx.fillRect(0, 0, this.c.width, this.c.height);
    const franjas = 14;
    for (let k = 0; k < franjas; k++) {
      ctx.fillStyle = k % 2 ? "#2b8f47" : "#25843f";
      ctx.fillRect(x0 + w * k / franjas, y0, w / franjas + 1, h);
    }
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(2, 0.22 * s);
    ctx.strokeRect(x0, y0, w, h);
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x0 + w / 2, y0 + h); ctx.stroke();
    ctx.beginPath(); ctx.arc(x0 + w / 2, y0 + h / 2, 9.15 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x0 + w / 2, y0 + h / 2, 0.4 * s, 0, Math.PI * 2); ctx.fill();
    for (const lado of [-1, 1]) {
      const fx = lado < 0 ? x0 : x0 + w;
      const area = (largo, ancho) => {
        ctx.strokeRect(lado < 0 ? fx : fx - largo * s, y0 + h / 2 - ancho * s / 2, largo * s, ancho * s);
      };
      area(REGLAS.AREA_Y, 40.32); area(5.5, 18.32);
      // la porteria, fuera del campo
      ctx.fillStyle = "rgba(255,255,255,.25)";
      const pw = 2.2 * s, ph = REGLAS.PORTERIA * s;
      ctx.fillRect(lado < 0 ? fx - pw : fx, y0 + h / 2 - ph / 2, pw, ph);
      ctx.strokeRect(lado < 0 ? fx - pw : fx, y0 + h / 2 - ph / 2, pw, ph);
      ctx.beginPath(); ctx.arc(lado < 0 ? fx + 11 * s : fx - 11 * s, y0 + h / 2, 0.35 * s, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
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
    const r = Math.max(5 * this.ppp, 0.55 * this.s);
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
