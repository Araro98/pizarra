/* La pantalla de ARRIBA en 2D (NOTAS O-316; diseno 4.2, 4.3 y 4.5; guia 2): como la de
   arriba de Galaxy. En juego, el MAPA: el marcador (tu equipo a la izquierda en azul),
   la pestana del reloj, el campo entero en vertical con un punto por jugador, los
   paneles de goles y la ficha del jugador. La ficha grande (el icono T, E3). El
   descanso y el final: la pantalla verde con el marcador grande (a25, a26). Y la
   pantalla de elegir equipos. Todo en u (400x240, px de 3DS); la consola pone la
   escala. Lo que no cambia se pinta una vez en un lienzo aparte. */
"use strict";

const Arriba = {
  visto: {},                 // lo ultimo que se pinto (para las pruebas): modo, reloj, goles, ficha...
  _fondo: null, _claveFondo: "",
  _niveles: typeof WeakMap !== "undefined" ? new WeakMap() : null,

  // estado: Director.estado (1.4). ver: {elegido, red} de la pagina (el elegido de la
  // pantalla de abajo y lo del online para la pestana del reloj)
  pintar(ctx, p, yo, estado, ver = {}) {
    const ea = (estado && estado.arriba) || {}, modo = ea.modo || "mapa";
    const g = (estado && estado.goles) || p.goles;
    const goles = [g[yo], g[1 - yo]];       // en perspectiva: los tuyos a la izquierda
    this.visto = { modo, goles, reloj: "", ficha: null, fichaLado: null, lineas: [[], []], tanda: null };
    this._nivelesDe(p);
    if (modo === "descanso" || modo === "final") this._verde(ctx, p, yo, modo, goles);
    else if (modo === "ficha") this._fichaGrande(ctx, p, yo, ver);
    else this._mapa(ctx, p, yo, estado, ver, goles);
    // los fundidos del Director (E4): negro y blanco por encima
    if (ea.fundido > 0) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, ea.fundido) + ")"; ctx.fillRect(0, 0, 400, 240); }
    if (ea.blanco > 0) { ctx.fillStyle = "rgba(255,255,255," + Math.min(1, ea.blanco) + ")"; ctx.fillRect(0, 0, 400, 240); }
  },

  // --- el reloj (la logica del marcador() de antes, O-308 y O-312) ----------------
  // "1.ª 07:32 +0:30" (el descuento de los cambios, O-315); en la prorroga "1.ª pr.";
  // en la tanda "Penaltis 4-2"; "Descanso", "Final". Online, en lugar del reloj:
  // "esperando a X...", "X no responde", "X ha salido", "fuera del partido".
  // red: {modo, rival, fuera, dejado, sinVer (ms), callado} o null contra la maquina
  PARTES: ["1.ª", "2.ª", "1.ª pr.", "2.ª pr."],
  textoReloj(p, yo, red) {
    if (red && red.modo && red.modo !== "maquina" && p.fase !== "final") {
      // el rival se ha ido (cerro la pestana o pulso Inicio), o lo has dejado tu (O-305, O-308)
      if (red.fuera && (red.rival || red.dejado)) return { aviso: red.dejado ? "fuera del partido" : red.rival + " ha salido" };
      // al minuto, que lo sepa: puede esperar o dejar el partido (O-308)
      if (red.rival && red.sinVer > 8000) return { aviso: red.callado ? red.rival + " no responde" : "esperando a " + red.rival + "..." };
    }
    if (p.fase === "final") return { parte: "Final", color: GX.reloj.aviso };
    if (p.fase === "descanso") return { parte: "Descanso", color: GX.reloj.aviso };
    if (p.tanda) { const t = p.golesTanda(); return { parte: "Penaltis", color: GX.reloj.prorroga, reloj: t[yo] + "-" + t[1 - yo] }; }
    const m = p.mitad || 1, dc = p.descuentoParte ? p.descuentoParte() : 0;
    const desc = dc > 0 ? " +" + Math.floor(dc / 60) + ":" + String(Math.round(dc % 60)).padStart(2, "0") : "";
    return { parte: this.PARTES[m - 1] || m + ".ª", color: m === 1 ? GX.reloj.parte1 : m === 2 ? GX.reloj.parte2 : GX.reloj.prorroga, reloj: p.relojTexto(), desc: desc.trim() };
  },

  // de quien es la ficha: el elegido y, si no hay, el que lleva el balon (de cualquier
  // equipo). En el tiempo de tactica (la espera del saque) Galaxy ensena el mapa SIN
  // ficha (tapa la esquina del minimapa): ahi solo la del elegido (diseno 4.2)
  quienFicha(p, yo, elegido) {
    const e = elegido !== null && elegido !== undefined ? p.jugadores[elegido] : null;
    if (e && !e.expulsado) return e;
    if (p.fase === "saque") return null;
    const d = p.dueno ? p.dueno() : null;
    return d && !d.expulsado ? d : null;
  },

  // la media de los niveles de los 11 que empezaron, de cada equipo ("Nivel del
  // equipo" de a25 y a26). Se mira la primera vez que se ve el partido: los cambios
  // ponen al que entra en el sitio del que sale
  _nivelesDe(p) {
    if (!this._niveles) return [99, 99];
    let n = this._niveles.get(p);
    if (!n) {
      n = [0, 1].map(l => { const js = p.jugadores.filter(j => j.lado === l); return js.length ? Math.round(js.reduce((s, j) => s + (+j.nivel || 99), 0) / js.length) : 99; });
      this._niveles.set(p, n);
    }
    return n;
  },

  // --- el fondo del juego (verde con franjas) -------------------------------------
  _franjas(ctx) {
    ctx.fillStyle = GX.fondoArriba; ctx.fillRect(0, 0, 400, 240);
    for (let y = 0, k = 0; y < 240; y += 18, k++) { ctx.fillStyle = GX.franjas[k % 2]; ctx.fillRect(0, y, 400, 18); }
  },

  // --- el MAPA (guia 2, "ARRIBA - juego", m01) -----------------------------------
  _mapa(ctx, p, yo, estado, ver, goles) {
    this._fondoMapa(ctx, p, yo);
    // los goles en las cajas negras (x82 / x318)
    const cifra = { letra: "cifras", tam: 40, peso: 700, alinea: "center", degradado: ["#FFFFFF", "#FFFFFF", "#D8DCE0"], contornos: [["#000", 0.6]] };
    GX.texto(ctx, goles[0], 82.5, 24, cifra);
    GX.texto(ctx, goles[1], 317.5, 24, cifra);
    this._reloj(ctx, p, yo, ver.red);
    this._puntos(ctx, p, yo);
    if (p.tanda) this._tablerosTanda(ctx, p, yo);
    else this._lineasGoles(ctx, p, yo, estado);
    const j = this.quienFicha(p, yo, ver.elegido);
    if (j) this._ficha(ctx, p, yo, j);
  },

  // lo que no cambia: franjas, marcadores, la pestana, la tarjeta del minimapa con sus
  // lineas y los paneles vacios. Una vez en un lienzo aparte; se rehace al cambiar de
  // tamano, de equipos o al llegar las letras (diseno 4.2, "Coste")
  _fondoMapa(ctx, p, yo) {
    const c = ctx.canvas, m = c && c.width && ctx.getTransform ? ctx.getTransform() : null;
    if (!m) { this._dibujarFondoMapa(ctx, p, yo); return; }
    const clave = c.width + "x" + c.height + ":" + m.a.toFixed(4) + ":" + p.nombres.join("|") + ":" + yo + ":" + (typeof Consola !== "undefined" ? Consola.letrasVersion : "");
    if (clave !== this._claveFondo || !this._fondo) {
      const l = this._fondo && this._fondo.width === c.width && this._fondo.height === c.height ? this._fondo : GX.lienzo(c.width, c.height);
      if (!l) { this._dibujarFondoMapa(ctx, p, yo); return; }
      const f = l.getContext("2d");
      f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, l.width, l.height);
      f.setTransform(m);
      this._dibujarFondoMapa(f, p, yo);
      this._fondo = l; this._claveFondo = clave;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._fondo, 0, 0); ctx.restore();
  },
  _dibujarFondoMapa(ctx, p, yo) {
    this._franjas(ctx);
    this._tarjetaMinimapa(ctx);
    this._panelGoles(ctx, 2, 57);
    this._panelGoles(ctx, 280, 57);
    // la pestana del reloj, entre las dos cajas y pegada arriba
    GX.redondo(ctx, 113, -2, 174, 16, [0, 0, 5, 5]); ctx.fillStyle = GX.reloj.fondo; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 0.8; ctx.stroke();
    this._cajaMarcador(ctx, 0, GX.tuyo, p.nombres[yo]);
    this._cajaMarcador(ctx, 1, GX.rival, p.nombres[1 - yo]);
  },
  // la caja del marcador: bisel (borde oscuro y linea clara) y degradado fuerte, el
  // escudo y la caja negra de los goles. lado 0: la izquierda (0-115); 1: la derecha
  _cajaMarcador(ctx, lado, col, nombre) {
    const x = lado ? 285 : 0, w = 115;
    GX.redondo(ctx, x - (lado ? 0 : 6), -6, w + 6, 52, lado ? [0, 0, 0, 7] : [0, 0, 7, 0]);
    ctx.fillStyle = col.oscuro; ctx.fill();
    GX.redondo(ctx, x + (lado ? 2 : -6), -6, w + 4 - 2, 50, lado ? [0, 0, 0, 6] : [0, 0, 6, 0]);
    ctx.fillStyle = GX.vertical(ctx, 0, 44, [col.claro, col.base]); ctx.fill();
    ctx.strokeStyle = col.linea; ctx.lineWidth = 1; ctx.stroke();
    // brillo de arriba
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(x + (lado ? 3 : 0), 1, w - 3, 14);
    // la caja negra de los goles
    const gx = lado ? 290 : 55;
    GX.redondo(ctx, gx, 5, 55, 36, 5); ctx.fillStyle = GX.cajaGoles.fondo; ctx.fill();
    ctx.strokeStyle = GX.cajaGoles.borde; ctx.lineWidth = 1; ctx.stroke();
    GX.redondo(ctx, gx + 2, 7, 51, 14, [4, 4, 0, 0]); ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fill();
    GX.escudo(ctx, lado ? 372.5 : 26, 24, 26, 33, col, nombre);
  },
  _panelGoles(ctx, x, y) {
    GX.redondo(ctx, x, y, 118, 116, 6);
    ctx.fillStyle = GX.vertical(ctx, y, y + 116, [GX.panelGoles.arriba, GX.panelGoles.abajo]); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = GX.panelGoles.franja;
    for (let yy = y + 10; yy < y + 116; yy += 22) ctx.fillRect(x, yy, 118, 11);
    ctx.restore();
    GX.redondo(ctx, x + 0.75, y + 0.75, 116.5, 114.5, 5.5);
    ctx.strokeStyle = GX.panelGoles.borde; ctx.lineWidth = 1.5; ctx.stroke();
  },
  // la tarjeta del minimapa (122-278 x 16-208) y el campo (136-263 x 26-196)
  CAMPO: { x0: 136, x1: 263, y0: 26, y1: 196 },
  _tarjetaMinimapa(ctx) {
    const M = GX.minimapa;
    // el bisel: la tarjeta tiene canto (mas oscuro) y las esquinas de abajo en chaflan
    ctx.beginPath();
    ctx.moveTo(122, 16); ctx.lineTo(278, 16); ctx.lineTo(278, 200); ctx.lineTo(270, 208); ctx.lineTo(130, 208); ctx.lineTo(122, 200); ctx.closePath();
    ctx.fillStyle = M.bisel; ctx.fill();
    ctx.strokeStyle = M.marco; ctx.lineWidth = 1.2; ctx.stroke();
    // las franjas, mas oscuras hacia abajo
    ctx.save();
    ctx.beginPath(); ctx.rect(125, 16, 150, 189); ctx.clip();
    for (let y = 16, k = 0; y < 206; y += 17, k++) {
      const f = (y - 16) / 190, a = M.franjas[k % 2], b = M.franjasAbajo[k % 2];
      ctx.fillStyle = Arriba._mezcla(a, b, f);
      ctx.fillRect(125, y, 150, 17);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(125.5, 16); ctx.lineTo(125.5, 204); ctx.moveTo(274.5, 16); ctx.lineTo(274.5, 204); ctx.stroke();
    this._lineasCampo(ctx);
  },
  _mezcla(a, b, f) {
    const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    const A = h(a), B = h(b);
    return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(",") + ")";
  },
  // del campo (metros del motor) al minimapa: tu ataque hacia arriba (sentidoPantalla)
  _aMapa(p, yo, x, y) {
    const C = this.CAMPO, an = (typeof REGLAS !== "undefined" && REGLAS.ANCHO) || 68, la = (typeof REGLAS !== "undefined" && REGLAS.LARGO) || 105;
    const h = p.sentidoPantalla ? p.sentidoPantalla(yo) : 1;
    return { x: (C.x0 + C.x1) / 2 + x * h * (C.x1 - C.x0) / an, y: (C.y0 + C.y1) / 2 - y * h * (C.y1 - C.y0) / la };
  },
  _lineasCampo(ctx) {
    const C = this.CAMPO, an = 68, la = 105, sx = (C.x1 - C.x0) / an, sy = (C.y1 - C.y0) / la;
    const cx = (C.x0 + C.x1) / 2, cy = (C.y0 + C.y1) / 2;
    ctx.save();
    // las redes de las porterias, fuera de las lineas, a cuadros
    for (const [y, h] of [[C.y0 - 8, 8], [C.y1, 8]]) {
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(cx - 13, y, 26, h);
      ctx.strokeStyle = GX.minimapa.red; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let xx = cx - 13; xx <= cx + 13.01; xx += 2.6) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
      for (let yy = y; yy <= y + h + 0.01; yy += 2.67) { ctx.moveTo(cx - 13, yy); ctx.lineTo(cx + 13, yy); }
      ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeRect(cx - 13, y, 26, h);
    }
    ctx.strokeStyle = GX.minimapa.lineas; ctx.lineWidth = 1.6;
    ctx.strokeRect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0);
    ctx.beginPath(); ctx.moveTo(C.x0, cy); ctx.lineTo(C.x1, cy); ctx.stroke();
    const r = 9.15 * (sx + sy) / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = GX.minimapa.lineas; ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, Math.PI * 2); ctx.fill();
    for (const s of [1, -1]) {
      const yl = s > 0 ? C.y0 : C.y1;
      // area grande, area pequena, el semicirculo y el punto de penalti
      ctx.strokeRect(cx - 20.16 * sx, s > 0 ? yl : yl - 16.5 * sy, 40.32 * sx, 16.5 * sy);
      ctx.strokeRect(cx - 9.16 * sx, s > 0 ? yl : yl - 5.5 * sy, 18.32 * sx, 5.5 * sy);
      const yp = yl + s * 11 * sy, ya = yl + s * 16.5 * sy, d = Math.abs(ya - yp);
      if (d < r) {
        const a = Math.acos(d / r);
        ctx.beginPath();
        if (s > 0) ctx.arc(cx, yp, r, Math.PI / 2 - a, Math.PI / 2 + a); else ctx.arc(cx, yp, r, -Math.PI / 2 - a, -Math.PI / 2 + a);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, yp, 1, 0, Math.PI * 2); ctx.fill();
      // las esquinas
      for (const xs of [C.x0, C.x1]) {
        const dx = xs === C.x0 ? 1 : -1;
        ctx.beginPath();
        ctx.arc(xs, yl, 4, s > 0 ? (dx > 0 ? 0 : Math.PI / 2) : (dx > 0 ? -Math.PI / 2 : Math.PI), s > 0 ? (dx > 0 ? Math.PI / 2 : Math.PI) : (dx > 0 ? 0 : -Math.PI / 2));
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  // un punto de ~5 u por jugador del campo (azul tuyo, rojo el rival, borde blanco;
  // morado con la hiper puesta) y el balon blanco con borde azul. Sin rectangulo de
  // la camara (Galaxy no lo pone)
  _puntos(ctx, p, yo) {
    const js = p.enCampo ? p.enCampo() : p.jugadores;
    for (const j of js) {
      const q = this._aMapa(p, yo, j.x, j.y), col = GX.color(j.lado, yo), hiper = p.conAura && p.conAura(j);
      if (hiper) { ctx.fillStyle = "rgba(192,76,240,.45)"; ctx.beginPath(); ctx.arc(q.x, q.y, 4.6, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(q.x, q.y, 2.7, 0, Math.PI * 2);
      ctx.fillStyle = col.punto; ctx.fill();
      ctx.strokeStyle = hiper ? GX.puntos.hiper : GX.puntos.borde; ctx.lineWidth = hiper ? 1.2 : 0.9; ctx.stroke();
    }
    const b = p.balon, q = this._aMapa(p, yo, b.x, b.y);
    ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = GX.puntos.balon; ctx.fill();
    ctx.strokeStyle = GX.puntos.balonBorde; ctx.lineWidth = 1; ctx.stroke();
  },
  // la pestana: "1.ª" verde (2.ª naranja, prorroga morado) y "07 : 32"; el descuento
  // pequeno detras; online, lo que pasa con el rival en lugar del reloj
  _reloj(ctx, p, yo, red) {
    const r = this.textoReloj(p, yo, red);
    if (r.aviso) {
      this.visto.reloj = r.aviso;
      GX.texto(ctx, r.aviso, 200, 7.2, { tam: 9, alinea: "center", color: GX.reloj.aviso, ancho: 164 });
      return;
    }
    this.visto.reloj = [r.parte, r.reloj, r.desc].filter(Boolean).join(" ");
    if (!r.reloj) { GX.texto(ctx, r.parte, 200, 7.4, { letra: "cifras", tam: 11, peso: 700, alinea: "center", color: r.color }); return; }
    const pr = r.parte.length > 4;
    GX.texto(ctx, r.parte, pr ? 160 : 169, 7.6, { letra: "cifras", tam: pr ? 11 : 13, peso: 700, alinea: "center", color: r.color, contornos: [["#000", 0.5]], ancho: pr ? 40 : 26 });
    GX.texto(ctx, r.reloj.replace(":", " : "), 220, 7.6, { letra: "cifras", tam: 15.5, peso: 700, alinea: "center", color: GX.reloj.cifras });
    if (r.desc) GX.texto(ctx, r.desc, 254, 8, { letra: "cifras", tam: 9, peso: 700, alinea: "left", color: GX.reloj.aviso });
  },
  // una linea por gol de cada lado: la insignia de la parte y "21' Zanark", como mucho
  // las 5 ultimas. Los goles que el Director aun no ensena (E4) no salen
  _lineasGoles(ctx, p, yo, estado) {
    const es = p.estadisticas, todos = (es && es.goles) || [];
    const vistos = (estado && estado.goles) || p.goles;
    for (const [k, lado] of [[0, yo], [1, 1 - yo]]) {
      const suyos = todos.filter(g => g[0] === lado).slice(0, vistos[lado]).slice(-5);
      const x = k ? 280 : 2;
      suyos.forEach((g, n) => {
        const y = 66 + n * 22;
        this._insignia(ctx, x + 3, y, g[1]);
        const min = g[2] + "'";
        const w = GX.texto(ctx, min, x + 26, y + 6.5, { tam: 10.5, color: GX.golLinea.minuto, peso: 700 });
        GX.texto(ctx, g[3], x + 30 + w, y + 6.5, { tam: 10.5, color: GX.golLinea.nombre, peso: 700, ancho: 84 - w });
        this.visto.lineas[k].push(this.PARTES[g[1] - 1] + " " + min + " " + g[3]);
      });
    }
  },
  _insignia(ctx, x, y, mitad) {
    const c = mitad === 1 ? GX.insignia.p1 : mitad === 2 ? GX.insignia.p2 : GX.insignia.pr;
    GX.redondo(ctx, x, y, 18, 13, 2);
    ctx.fillStyle = GX.vertical(ctx, y, y + 13, ["#FFFFFF", c, c]); ctx.fill();
    ctx.globalAlpha = 0.65; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 0.6; ctx.stroke();
    GX.texto(ctx, mitad >= 3 ? "P" + (mitad - 2) : mitad + ".ª", x + 9, y + 6.8, { tam: 7.5, alinea: "center", color: "#FFFFFF", contornos: [["rgba(0,0,0,.45)", 0.7]], ancho: 16 });
  },
  // la tanda [NO GALAXY, como GO Light]: en vez de los goles, el tablero de cada equipo
  // en su panel (balon = gol, X roja = fallo; 5 casillas o las de la muerte subita)
  _tablerosTanda(ctx, p, yo) {
    const t = p.tanda, R = typeof REGLAS !== "undefined" ? REGLAS.PENALTIS_TANDA || 5 : 5;
    if (!t || !t.tiros) return;
    const n = Math.max(R, t.tiros[0].length, t.tiros[1].length);
    this.visto.tanda = [t.tiros[yo].filter(Boolean).length, t.tiros[1 - yo].filter(Boolean).length];
    for (const [k, lado] of [[0, yo], [1, 1 - yo]]) {
      const x = k ? 280 : 2, tiros = t.tiros[lado];
      GX.texto(ctx, "Penaltis", x + 59, 68, { tam: 9, alinea: "center", color: GX.golLinea.nombre });
      for (let i = 0; i < n; i++) {
        const cx = x + 17 + (i % 5) * 21, cy = 88 + Math.floor(i / 5) * 22, v = tiros[i];
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
        if (v === 1) { const im = GX.icono("balon_portador"); if (GX.cargada(im)) ctx.drawImage(im, cx - 7, cy - 7, 14, 14); else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); } }
        else if (v === 0) { const im = GX.icono("marca_x"); if (GX.cargada(im)) ctx.drawImage(im, cx - 7, cy - 7, 14, 14); else GX.texto(ctx, "X", cx, cy, { tam: 11, alinea: "center", color: "#F20208" }); }
      }
      GX.texto(ctx, tiros.filter(Boolean).length, x + 59, 150, { letra: "cifras", tam: 22, peso: 700, alinea: "center", color: "#FFFFFF", contornos: [["#0A3A2A", 1]] });
    }
  },

  // --- la ficha pequena (guia 2, tabla "ficha"; m10, a05-a07) ------------------------
  // la tuya abajo a la izquierda; la del rival abajo a la derecha y en espejo
  _ficha(ctx, p, yo, j) {
    const der = j.lado !== yo, dx = der ? 171 : 0;
    const el = GX.elemento[j.elemento] ? j.elemento : "ninguno";
    this.visto.ficha = j.id; this.visto.fichaLado = der ? "derecha" : "izquierda";
    GX.placa(ctx, der ? 228 : 0, 202, 172, 38, GX.elemento[el], der ? "izq" : "der", GX.elementoBorde[el]);
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(der ? 236 : 0, 203, 164, 15);
    // el retrato, que sobresale por arriba de la placa, sin marco: la cara de Pizarra es
    // solo la cabeza, asi que debajo va su camiseta del color de su equipo (el busto de Galaxy)
    const cx = der ? 369 : 31, im = GX.cara(j.cara);
    this._camiseta(ctx, cx, GX.color(j.lado, yo));
    if (GX.cargada(im)) ctx.drawImage(im, cx - 35, 176, 70, 70);
    else { ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.arc(cx, 205, 22, 0, Math.PI * 2); ctx.fill(); }
    // el balon si lo lleva
    if (j.conBalon || (p.balon && p.balon.dueno === j.id)) {
      const b = GX.icono("balon_portador");
      if (GX.cargada(b)) ctx.drawImage(b, der ? 383 : 1, 222, 16, 16);
    }
    // su tarjeta amarilla junto a la cara (O-311)
    if (j.amarillas) {
      ctx.save(); ctx.translate(der ? 342 : 56, 186); ctx.rotate(-0.15);
      ctx.fillStyle = "#FFE14D"; ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 0.8;
      ctx.fillRect(-3.5, -5, 7, 10); ctx.strokeRect(-3.5, -5, 7, 10); ctx.restore();
    }
    // icono de elemento y, en lugar del de sexo, la pastilla de la posicion [PIZARRA]
    const ie = GX.icono("elemento_" + (el === "ninguno" ? "viento" : el.toLowerCase()));
    if (el !== "ninguno" && GX.cargada(ie)) ctx.drawImage(ie, 63 + dx, 204, 14, 14);
    const pos = GX.posicionCorta(j.posicion);
    GX.redondo(ctx, 79 + dx, 204.5, 19, 13, 2); ctx.fillStyle = GX.posicion[pos] || "#5A6B85"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 0.8; ctx.stroke();
    GX.texto(ctx, pos, 88.5 + dx, 211.3, { tam: 7.5, alinea: "center", color: "#FFFFFF", ancho: 17 });
    GX.texto(ctx, j.nombre, 101 + dx, 211.5, { tam: 13.5, peso: 700, color: "#E4E8FF", contornos: [["rgba(10,20,40,.5)", 0.7]], ancho: 66 });
    // las dos filas de barra, con los nombres de VR [PIZARRA]: TEN (la tension del equipo)
    // y HIP (la hiperbarra, con la raya de la mitad = una invocacion); el portero KP y
    // TEN; con la hiper puesta, AURA (lo que le queda) y PODER (solo el numero)
    const R = typeof REGLAS !== "undefined" ? REGLAS : { TENSION_MAX: 300, HIPER_MAX: 200, HIPER_TIPOS: {} };
    const ten = { et: "TEN", col: GX.barraTen, v: p.tension[j.lado] / R.TENSION_MAX, n: Math.round(p.tension[j.lado]) };
    const hip = { et: "HIP", col: [GX.barraHip, GX.barraHip], v: p.hiper[j.lado] / R.HIPER_MAX, n: Math.floor(p.hiper[j.lado]), mitad: true };
    let filas = [ten, hip];
    if (p.conAura && p.conAura(j)) {
      const T = R.HIPER_TIPOS[j.hiperTipo] || { dura: 45 }, queda = Math.max(0, j.aura - p.segundosDeJuego());
      const poder = p._factorHiper ? Math.round((p._factorHiper(j, "foco", false) - 1) * 100) : (T.atdf || 0);
      filas = [{ et: "AURA", col: [GX.barraHip, GX.barraHip], v: p.tanda ? 1 : queda / (T.dura || 45), n: p.tanda ? "" : Math.ceil(queda) },
               { et: "PODER", poder: "+" + poder + " %" }];
    } else if (j.esPortero && j.kpMax) filas = [{ et: "KP", col: [GX.barraKp, GX.barraKp], v: j.kp / j.kpMax, n: Math.round(j.kp) }, ten];
    filas.forEach((f, k) => {
      const y = k ? 230 : 221;
      if (f.poder) {
        GX.texto(ctx, f.et, 64 + dx, y + 3.6, { tam: 7.5, color: GX.etiquetaPoder[0], degradado: GX.etiquetaPoder, contornos: [["#3A1A00", 0.7]] });
        GX.texto(ctx, f.poder, 166 + dx, y + 3.8, { letra: "cifras", tam: 9.5, peso: 700, alinea: "right", degradado: GX.etiquetaPoder, contornos: [["#3A1A00", 0.7]] });
        return;
      }
      GX.texto(ctx, f.et, 64 + dx, y + 3.6, { tam: 7.5, color: f.col[0], contornos: [["rgba(0,0,0,.6)", 0.7]], ancho: 16 });
      const bx = 81 + dx, by = y + 1, bw = 61;
      ctx.fillStyle = GX.barraVacia; ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = GX.vertical(ctx, by, by + 4, f.col); ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, f.v)), 4);
      if (f.mitad) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(bx + bw / 2 - 0.4, by - 0.5, 0.8, 5); }
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 0.5; ctx.strokeRect(bx, by, bw, 4);
      GX.texto(ctx, f.n, 166 + dx, y + 3.8, { letra: "cifras", tam: 9.5, peso: 700, alinea: "right", color: f.col[0], contornos: [["rgba(0,0,0,.6)", 0.7]] });
    });
    // el que acaba de entrar: "+15 %" pequeno (O-315)
    const rf = p.refuerzo ? p.refuerzo(j) : null;
    if (rf) GX.texto(ctx, "+" + rf.pct + " %", der ? 236 : 164, 196, { tam: 8, alinea: der ? "left" : "right", color: "#9FF0E6", contornos: [["#0A2A3A", 0.9]] });
  },

  // la camiseta del busto de la ficha: hombros redondos y el cuello en pico
  _camiseta(ctx, cx, col) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 30, 241); ctx.lineTo(cx - 28, 229);
    ctx.quadraticCurveTo(cx - 25, 220, cx - 12, 218); ctx.lineTo(cx + 12, 218);
    ctx.quadraticCurveTo(cx + 25, 220, cx + 28, 229); ctx.lineTo(cx + 30, 241); ctx.closePath();
    ctx.fillStyle = GX.vertical(ctx, 218, 240, [col.claro, col.base]); ctx.fill();
    ctx.strokeStyle = col.oscuro; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 9, 218); ctx.lineTo(cx, 228); ctx.lineTo(cx + 9, 218);
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  },

  // --- la ficha grande (diseno 4.3; como la de arriba de p26) -----------------------
  _fichaGrande(ctx, p, yo, ver) {
    this._franjas(ctx);
    const d = p.dueno ? p.dueno() : null;
    const j = this.quienFicha(p, yo, ver.elegido) || (d && d.lado === yo ? d : null);
    if (!j) { GX.texto(ctx, "Pulsa a uno de tus jugadores", 200, 120, { tam: 12, alinea: "center" }); return; }
    this.visto.ficha = j.id; this.visto.fichaLado = "grande";
    const el = GX.elemento[j.elemento] ? j.elemento : "ninguno", R = typeof REGLAS !== "undefined" ? REGLAS : null;
    // el retrato en un cuadro del color de su elemento
    GX.redondo(ctx, 6, 6, 92, 92, 6); ctx.fillStyle = GX.elemento[el]; ctx.fill();
    ctx.strokeStyle = GX.elementoBorde[el]; ctx.lineWidth = 1.5; ctx.stroke();
    const im = GX.cara(j.cara);
    if (GX.cargada(im)) { ctx.save(); GX.redondo(ctx, 7, 7, 90, 90, 5); ctx.clip(); ctx.drawImage(im, 7, 7, 90, 90); ctx.restore(); }
    // la cabecera: nombre, dorsal, posicion y elemento
    GX.redondo(ctx, 104, 6, 290, 24, 5); ctx.fillStyle = "rgba(4,40,26,.85)"; ctx.fill();
    ctx.strokeStyle = GX.panelGoles.borde; ctx.lineWidth = 1; ctx.stroke();
    GX.texto(ctx, j.nombre, 112, 18.5, { tam: 15, color: "#FFFFFF", ancho: 196 });
    const pos = GX.posicionCorta(j.posicion);
    GX.redondo(ctx, 316, 11, 24, 14, 2); ctx.fillStyle = GX.posicion[pos] || "#5A6B85"; ctx.fill();
    GX.texto(ctx, pos, 328, 18.3, { tam: 8, alinea: "center", ancho: 22 });
    const ie = GX.icono("elemento_" + (el === "ninguno" ? "viento" : el.toLowerCase()));
    if (el !== "ninguno" && GX.cargada(ie)) ctx.drawImage(ie, 344, 11, 14, 14);
    if (j.dorsal !== undefined && j.dorsal !== null) GX.texto(ctx, j.dorsal, 388, 18.5, { letra: "cifras", tam: 15, peso: 700, alinea: "right", color: "#F8E070" });
    // nivel, tension e hiperbarra del equipo (o el KP del portero)
    const fila2 = ["Nv. " + (j.nivel || 99)];
    if (j.esPortero && j.kpMax) fila2.push("KP " + Math.round(j.kp) + " / " + Math.round(j.kpMax));
    if (R) fila2.push("TEN " + Math.round(p.tension[j.lado]) + " / " + R.TENSION_MAX, "HIP " + Math.floor(p.hiper[j.lado]) + " / " + R.HIPER_MAX);
    GX.texto(ctx, fila2.join("   "), 108, 40, { letra: "cifras", tam: 10, peso: 700, color: "#E8F4F0", ancho: 284 });
    // el espiritu: su familia, su nombre y como esta
    let y = 52;
    if (j.espiritu) {
      const ph = p.puedeHiper ? p.puedeHiper(j) : { porque: "" }, activo = p.conAura && p.conAura(j);
      const estado = activo ? (p.tanda ? "activo en este penalti" : "activo " + Math.ceil(j.aura - p.segundosDeJuego()) + " s") : ph.si ? (R ? R.HIPER_COSTE : 100) + " de hiperbarra" : ph.porque;
      GX.redondo(ctx, 104, y, 290, 16, 4); ctx.fillStyle = GX.vertical(ctx, y, y + 16, GX.auras.tarjeta); ctx.fill();
      const fam = R && R.HIPER_TIPOS[j.hiperTipo] ? R.HIPER_TIPOS[j.hiperTipo].nombre : "Espíritu";
      GX.texto(ctx, fam, 110, y + 8.3, { tam: 8, color: "#FFE070", contornos: [["#3A0A5A", 0.8]], ancho: 50 });
      GX.texto(ctx, j.espiritu.nombre, 164, y + 8.3, { letra: "nombre", tam: 11, peso: 400, color: "#FFFFFF", contornos: [["#2A0A40", 1]], ancho: 100 });
      GX.texto(ctx, estado, 390, y + 8.3, { tam: 7.5, peso: 700, alinea: "right", color: "#FFFFFF", ancho: 120 });
      y += 20;
    }
    // las tarjetas y el refuerzo del cambio (O-311, O-315)
    const notas = [];
    if (j.amarillas) notas.push("Tarjeta amarilla: otra sería roja");
    const rf = p.refuerzo ? p.refuerzo(j) : null;
    if (rf) notas.push((rf.entro ? "Recién entrado" : "Cambio en su posición") + ": AT y DF +" + rf.pct + " % (" + Math.ceil(rf.queda) + " s)");
    if (notas.length) { GX.texto(ctx, notas.join(" · "), 108, y + 6, { tam: 8.5, color: "#FFE14D", ancho: 284 }); }
    // los 7 stats de VR con su barra
    const nombres = ["Potencia", "Control", "Técnica", "Presión", "Físico", "Agilidad", "Inteligencia"];
    const st = j.stats || [], tope = Math.max(300, ...st.map(Number));
    GX.redondo(ctx, 6, 104, 140, 132, 5); ctx.fillStyle = "rgba(4,40,26,.7)"; ctx.fill();
    nombres.forEach((n, k) => {
      const yy = 110 + k * 18;
      GX.texto(ctx, n, 12, yy + 5, { tam: 8.5, color: "#E8F4F0", ancho: 70 });
      GX.texto(ctx, st[k] || 0, 140, yy + 5, { letra: "cifras", tam: 10, peso: 700, alinea: "right", color: "#FFFFFF" });
      ctx.fillStyle = GX.barraVacia; ctx.fillRect(12, yy + 11, 128, 3);
      ctx.fillStyle = GX.vertical(ctx, yy + 11, yy + 14, ["#FFC040", "#E8701C"]); ctx.fillRect(12, yy + 11, 128 * Math.min(1, (+st[k] || 0) / tope), 3);
    });
    // las supertecnicas: su tipo, nombre, poder y lo que cuestan; las del espiritu con ✦
    GX.redondo(ctx, 152, 104, 242, 132, 5); ctx.fillStyle = "rgba(4,40,26,.7)"; ctx.fill();
    const tipos = { Tiro: ["TIRO", "#D8262A"], Regate: ["REGATE", "#1E4FD8"], Defensa: ["DEFENSA", "#1F8F3A"], Parada: ["PARADA", "#E8901C"] };
    const vistas = new Set(), tecs = (j.tecnicas || []).filter(t => !vistas.has(t.nombre) && vistas.add(t.nombre)).slice(0, 6);
    tecs.forEach((t, k) => {
      const yy = 108 + k * 14, tp = tipos[t.tipo] || [String(t.tipo || "").toUpperCase().slice(0, 7), "#5A6B85"];
      GX.redondo(ctx, 156, yy, 38, 11, 2); ctx.fillStyle = tp[1]; ctx.fill();
      GX.texto(ctx, tp[0], 175, yy + 5.8, { tam: 6.5, alinea: "center", ancho: 36 });
      GX.texto(ctx, t.nombre, 198, yy + 5.8, { tam: 8.5, color: t.espiritu ? "#E8B8FF" : "#FFFFFF", ancho: 120 });
      GX.texto(ctx, t.poder, 352, yy + 5.8, { letra: "cifras", tam: 9, peso: 700, alinea: "right", color: "#F8E070" });
      GX.texto(ctx, "TEN " + t.tp, 390, yy + 5.8, { letra: "cifras", tam: 8, peso: 700, alinea: "right", color: GX.barraTen[0] });
    });
    // las pasivas (✓ las que cuentan); las que no caben, "+N más"
    const pas = j.pasivas || [], y0 = 108 + Math.max(1, tecs.length) * 14 + 4;
    const caben = Math.max(0, Math.floor((234 - y0) / 10.5)), lista = pas.slice(0, caben);
    lista.forEach((q, k) => {
      const sobran = pas.length - lista.length;
      const texto = (k === lista.length - 1 && sobran > 0) ? "+" + (sobran + 1) + " más" : (q.cuenta ? "✓ " : "· ") + q.texto;
      GX.texto(ctx, texto, 156, y0 + k * 10.5 + 4, { tam: 7.5, peso: 700, color: q.cuenta ? "#CFF5E0" : "rgba(220,235,230,.55)", ancho: 234 });
    });
  },

  // --- el descanso y el final: la pantalla verde (a25, a26; diseno 4.5) -------------
  _verde(ctx, p, yo, modo, goles) {
    const D = GX.descanso;
    ctx.fillStyle = GX.vertical(ctx, 0, 240, D.fondo); ctx.fillRect(0, 0, 400, 240);
    ctx.fillStyle = "rgba(255,255,255,.04)";
    for (let y = 0; y < 240; y += 16) ctx.fillRect(0, y, 400, 8);
    // los hexagonos claros de las esquinas
    ctx.strokeStyle = D.hexagono; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2;
    for (const [hx, hy, r] of [[14, 6, 22], [52, 28, 20], [10, 48, 16], [386, 6, 22], [348, 28, 20], [390, 48, 16]]) {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; ctx[k ? "lineTo" : "moveTo"](hx + r * Math.cos(a), hy + r * Math.sin(a)); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // la banda clara del marcador, con sus lineas
    ctx.fillStyle = GX.vertical(ctx, 58, 138, D.banda); ctx.fillRect(0, 58, 400, 80);
    ctx.fillStyle = D.linea; ctx.fillRect(0, 58, 400, 1.2); ctx.fillRect(0, 136.8, 400, 1.2);
    ctx.fillStyle = GX.vertical(ctx, 59, 80, ["rgba(255,255,255,.28)", "rgba(255,255,255,0)"]); ctx.fillRect(0, 59, 400, 21);
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(0, 140, 400, 20);
    // el titulo: "Descanso" blanco-lavanda; "Fin del partido" amarillo
    const titulo = modo === "final" ? "Fin del partido" : p.mitad === 2 ? "Fin del tiempo reglamentario" : p.mitad === 3 ? "Descanso de la prórroga" : "Descanso";
    const R = modo === "final" ? GX.rotulo.final : GX.rotulo.descanso;
    GX.texto(ctx, titulo, 200, 29, { letra: "rotulo", tam: titulo.length > 16 ? 15 : 19, peso: 400, alinea: "center", degradado: R.relleno, contornos: R.contornos, ancho: 360 });
    // los escudos y el marcador grande, en perspectiva
    GX.escudo(ctx, 50, 98, 40, 48, GX.tuyo, p.nombres[yo]);
    GX.escudo(ctx, 350, 98, 40, 48, GX.rival, p.nombres[1 - yo]);
    const cifra = { letra: "cifras", tam: 66, peso: 700, alinea: "center", degradado: ["#FFFFFF", "#FFFFFF", "#DDE8E4"], contornos: [["#0A5A48", 1.6]] };
    GX.texto(ctx, goles[0], 134, 99, cifra);
    GX.texto(ctx, "-", 200, 96, Object.assign({}, cifra, { tam: 46 }));
    GX.texto(ctx, goles[1], 266, 99, cifra);
    if (p.tanda) {
      const t = p.golesTanda();
      GX.texto(ctx, "(" + t[yo] + "-" + t[1 - yo] + " pen.)", 200, 128, { letra: "cifras", tam: 11, peso: 700, alinea: "center", color: "#FFF4A0", contornos: [["#0A5A48", 1]] });
    }
    // la banda negra con los nombres y el VS
    ctx.fillStyle = "rgba(10,12,14,.9)"; ctx.fillRect(0, 162, 400, 31);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(0, 162, 400, 0.8); ctx.fillRect(0, 192.2, 400, 0.8);
    GX.texto(ctx, p.nombres[yo], 98, 177.5, { tam: 16, peso: 700, alinea: "center", color: "#F4F4F4", ancho: 150 });
    GX.texto(ctx, p.nombres[1 - yo], 302, 177.5, { tam: 16, peso: 700, alinea: "center", color: "#F4F4F4", ancho: 150 });
    GX.texto(ctx, "VS", 200, 178, { letra: "rotulo", tam: 27, peso: 400, alinea: "center", degradado: D.vs, contornos: [["#3A1400", 1.2]], sesgo: -12 });
    // "Nivel del equipo" a cada lado: la media de los 11 que empezaron
    const nv = this._nivelesDe(p);
    const et = { tam: 7.5, color: D.nivel, contornos: [["#0A4A3A", 0.8]] }, num = { letra: "cifras", tam: 11, peso: 700, color: "#FFFFFF", contornos: [["#0A4A3A", 0.8]] };
    const w = GX.texto(ctx, "Nivel del equipo", 8, 206, et);
    GX.texto(ctx, nv[yo], 12 + w, 206, num);
    GX.texto(ctx, nv[1 - yo], 392, 206, Object.assign({}, num, { alinea: "right" }));
    GX.texto(ctx, "Nivel del equipo", 372, 206, Object.assign({}, et, { alinea: "right" }));
    this.visto.reloj = titulo; this.visto.niveles = [nv[yo], nv[1 - yo]];
  },

  // --- la pantalla de elegir (diseno 3, ARRIBA): solo se mira ------------------------
  // d: {a: {nombre, caras, nivel}, b: {...} o null (online, aun no se sabe), resumen}
  pintarElegir(ctx, d) {
    this._franjas(ctx);
    // el rotulo "PARTIDO" sobre la banda cian, como el de "C'est parti" (guia 3)
    ctx.fillStyle = GX.vertical(ctx, 6, 34, ["#1CB6D4", "#188EC8"]); ctx.fillRect(0, 6, 400, 28);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(0, 7, 400, 1); ctx.fillRect(0, 32, 400, 1);
    GX.texto(ctx, "PARTIDO", 200, 20.5, { letra: "rotulo", tam: 21, peso: 400, alinea: "center", degradado: GX.rotulo.saque.relleno, contornos: GX.rotulo.saque.contornos, sesgo: -8 });
    // cada equipo en su placa (el tuyo a la izquierda en azul) con sus 11 caras
    this._placaEquipo(ctx, 8, d.a, GX.tuyo);
    this._placaEquipo(ctx, 224, d.b, GX.rival);
    // la banda negra con los nombres y el VS, como la del descanso (a25)
    ctx.fillStyle = "rgba(10,12,14,.9)"; ctx.fillRect(0, 160, 400, 31);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(0, 160, 400, 0.8); ctx.fillRect(0, 190.2, 400, 0.8);
    const nom = { tam: 15, peso: 700, alinea: "center", color: "#F4F4F4", ancho: 150 };
    GX.texto(ctx, d.a ? d.a.nombre : "", 98, 175.5, nom);
    GX.texto(ctx, d.b ? d.b.nombre : "?", 302, 175.5, nom);
    GX.texto(ctx, "VS", 200, 176, { letra: "rotulo", tam: 27, peso: 400, alinea: "center", degradado: GX.descanso.vs, contornos: [["#3A1400", 1.2]], sesgo: -12 });
    // y debajo, como "Nivel del equipo": el nivel de cada uno y el resumen de las opciones
    const et = { tam: 7.5, color: GX.descanso.nivel, contornos: [["#0A3A2A", 0.8]] }, num = { letra: "cifras", tam: 11, peso: 700, color: "#FFFFFF", contornos: [["#0A3A2A", 0.8]] };
    if (d.a && d.a.nivel) { const w = GX.texto(ctx, "Nivel del equipo", 8, 204, et); GX.texto(ctx, d.a.nivel, 12 + w, 204, num); }
    if (d.b && d.b.nivel) { GX.texto(ctx, d.b.nivel, 392, 204, Object.assign({}, num, { alinea: "right" })); GX.texto(ctx, "Nivel del equipo", 372, 204, Object.assign({}, et, { alinea: "right" })); }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 214, 400, 20);
    GX.texto(ctx, d.resumen || "", 200, 224.5, { tam: 10, peso: 700, alinea: "center", color: "#F4F4F4", ancho: 384 });
    this.visto = { modo: "elegir", resumen: d.resumen };
  },
  // la placa de un equipo: su escudo y sus 11 caras en dos filas de 6 y 5 (22x22 u)
  _placaEquipo(ctx, x, e, col) {
    const y = 42, w = 168, h = 110;
    GX.redondo(ctx, x, y, w, h, 7); ctx.fillStyle = col.oscuro; ctx.fill();
    GX.redondo(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 6); ctx.fillStyle = GX.vertical(ctx, y, y + h, [col.claro, col.base, col.base]); ctx.fill();
    ctx.strokeStyle = col.linea; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(x + 3, y + 3, w - 6, 14);
    if (!e) {
      GX.texto(ctx, "?", x + w / 2, y + h / 2 - 6, { letra: "rotulo", tam: 46, peso: 400, alinea: "center", color: "#FFFFFF", contornos: [[col.oscuro, 1.5]] });
      GX.texto(ctx, "Aún no se sabe", x + w / 2, y + h - 12, { tam: 9, alinea: "center", color: "#E8EEFF" });
      return;
    }
    GX.escudo(ctx, x + w / 2, y + 20, 26, 32, col, e.nombre);
    (e.caras || []).slice(0, 11).forEach((c, k) => {
      const fila = k < 6 ? 0 : 1, n = fila ? k - 6 : k;
      const fx = x + 6 + n * 26 + (fila ? 13 : 0), fy = y + 40 + fila * 32;
      GX.redondo(ctx, fx, fy, 24, 24, 4); ctx.fillStyle = "#DCE6F2"; ctx.fill();
      const im = GX.cara(c);
      if (GX.cargada(im)) { ctx.save(); GX.redondo(ctx, fx + 1, fy + 1, 22, 22, 3); ctx.clip(); ctx.drawImage(im, fx + 1, fy + 1, 22, 22); ctx.restore(); }
      GX.redondo(ctx, fx, fy, 24, 24, 4); ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1; ctx.stroke();
    });
    if (e.nota) GX.texto(ctx, e.nota, x + w / 2, y + h - 10, { tam: 8.5, alinea: "center", color: "#E8EEFF", ancho: w - 12 });
  },
};
