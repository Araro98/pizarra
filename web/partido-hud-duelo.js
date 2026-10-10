/* HudDuelo (NOTAS O-319; diseno 4.4 y 6.5; guia 2 "ARRIBA - duelo / tiro" y "animacion de
   supertecnica", m03, a08-a21): la pantalla de ARRIBA en los duelos y en las animaciones,
   sobre un fondo 2D de Galaxy (el degradado del elemento o del lado con las lineas de
   velocidad y los retratos grandes de los que juegan: sin WebGL es lo que se ve siempre;
   E5 pondra la escena 3D detras del mismo HUD).
   - Eligiendo: las fichas de los dos (la tuya a la izquierda), el cuadro de los elementos
     con la flecha del que tiene ventaja, los apoyos con su "+5 %", el "Poder de base" en
     las esquinas y "Talento" con lo que suman las pasivas.
   - En la animacion: el "Poder total" que RUEDA (un numero al azar cada cuadro) y se FIJA
     (el que gana amarillo, el que pierde morado), "¡Crítico!", la ★ de la hipertecnica, la
     barra del centro (TEN con lo que gasta en rojo; HIP si es de espiritu; en la parada el
     rayo contra la mano), el nombre de la tecnica que entra por la derecha, "¡Tiro
     debilitado!" / "¡Tiro bloqueado!", las zonas del penalti y la secuencia del gol.
   - La invocacion sobre el mapa (6.5 p).
   Lo que dice el tramo lo pone el Director (estado.arriba.tramo). Todo en u (400x240).
   Con WebGL (O-320) la escena es el 3D del Estudio (partido-escenas.js), que el Director
   deja en estado.arriba.escena: entonces aqui no se pinta el fondo 2D (el degradado, los
   retratos, la porteria y la red dibujadas), solo el HUD encima, sin cambios. */
"use strict";

const HUD_DUELO = {
  rueda: [0.3, 1.7],             // entre cuanto ruedan las cifras (x su valor)
  nombre: { entra: 0.33, dura: 0.08 },   // el nombre de la tecnica: a +330 ms, en 2-3 f
  retrato: 150,                   // u de alto de los retratos grandes
  // los colores del fondo 2D que no son de un elemento ni de un lado (la hiper, el gol)
  hiper: ["#F2A0FF", "#5A1080"], gol: ["#FFD27A", "#B8340A"], mano: "#F07020", porteria: "#E8EEF4",
  red: "rgba(255,255,255,.5)",
};

const HudDuelo = {
  visto: { modo: null, que: null, textos: [] },
  _3d: false,                     // debajo esta el 3D de arriba (O-320): sin fondo 2D

  pintar(ctx, p, yo, A) {
    const tr = A ? A.tramo : null;
    this.visto = { modo: A ? A.modo : null, que: tr ? tr.que : null, textos: [] };
    if (!ctx || !p || !A) return;
    this._3d = !!(A.escena && A.escena.hay);
    ctx.save();
    // el lienzo del HUD, transparente encima del 3D
    if (this._3d) ctx.clearRect(0, 0, 400, 240);
    if (A.modo === "negro") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240); }
    else if (A.modo === "gol" && tr) this._gol(ctx, p, yo, tr);
    else if (tr && tr.que === "invoca") this._invoca(ctx, p, yo, tr);
    else if (tr && tr.que === "duelo") this._eligiendo(ctx, p, yo, tr);
    else if (tr && tr.res) this._anim(ctx, p, yo, tr);
    else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240); }
    ctx.restore();
    if (A.fundido > 0) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, A.fundido) + ")"; ctx.fillRect(0, 0, 400, 240); }
    if (A.blanco > 0) { ctx.fillStyle = "rgba(255,255,255," + Math.min(1, A.blanco) + ")"; ctx.fillRect(0, 0, 400, 240); }
  },
  // el texto de Galaxy, apuntado (las pruebas miran lo que se ha escrito)
  _t(ctx, t, x, y, o) { this.visto.textos.push(String(t)); return GX.texto(ctx, t, x, y, o); },

  // --- el fondo 2D (guia 4 y t04): degradado radial y lineas de velocidad ---------------
  _fondo(ctx, claro, oscuro, t, lineas = 44) {
    if (this._3d) return;
    const g = ctx.createRadialGradient ? ctx.createRadialGradient(200, 120, 10, 200, 120, 240) : null;
    if (g && g.addColorStop) { g.addColorStop(0, claro); g.addColorStop(1, oscuro); ctx.fillStyle = g; } else ctx.fillStyle = oscuro;
    ctx.fillRect(0, 0, 400, 240);
    // las lineas que salen de los bordes hacia el centro, como un manga (cambian cada cuadro)
    const f = Math.floor((t || 0) * 24);
    ctx.save(); ctx.strokeStyle = "#FFFFFF"; ctx.lineCap = "round";
    for (let i = 0; i < lineas; i++) {
      const h = Math.sin(i * 12.9898 + f * 78.233) * 43758.5453, r = h - Math.floor(h);
      const a = i / lineas * Math.PI * 2 + r * 0.12, r0 = 120 + r * 90, r1 = 330;
      ctx.globalAlpha = 0.25 + r * 0.55; ctx.lineWidth = 0.6 + r * 2;
      ctx.beginPath(); ctx.moveTo(200 + Math.cos(a) * r0, 120 + Math.sin(a) * r0 * 0.75); ctx.lineTo(200 + Math.cos(a) * r1, 120 + Math.sin(a) * r1 * 0.75); ctx.stroke();
    }
    ctx.restore();
  },
  _colorElemento(el) { return GX.elemento[el] ? [GX.elementoTexto[el], GX.elemento[el]] : null; },
  // el retrato grande de un jugador: su cara con su camiseta, de pie en (x, abajo)
  _retrato(ctx, j, x, abajo, h, espejo, yo) {
    if (!j || this._3d) return;
    const col = GX.color(j.lado, yo), im = GX.cara(j.cara), w = h;
    ctx.save(); ctx.translate(x, abajo); if (espejo) ctx.scale(-1, 1);
    // los hombros y la camiseta (las caras de Pizarra son solo la cabeza)
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, 4); ctx.lineTo(-w * 0.5, -h * 0.2);
    ctx.quadraticCurveTo(-w * 0.42, -h * 0.36, -w * 0.16, -h * 0.38); ctx.lineTo(w * 0.16, -h * 0.38);
    ctx.quadraticCurveTo(w * 0.42, -h * 0.36, w * 0.5, -h * 0.2); ctx.lineTo(w * 0.55, 4); ctx.closePath();
    ctx.fillStyle = GX.vertical(ctx, -h * 0.4, 0, [col.claro, col.base, col.oscuro]); ctx.fill();
    ctx.strokeStyle = col.oscuro; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.12, -h * 0.38); ctx.lineTo(0, -h * 0.25); ctx.lineTo(w * 0.12, -h * 0.38);
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.5; ctx.stroke();
    if (GX.cargada(im)) ctx.drawImage(im, -w * 0.42, -h * 1.02, w * 0.84, w * 0.84);
    else { ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.arc(0, -h * 0.62, h * 0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },

  // --- las piezas del HUD -------------------------------------------------------------
  // la placa-rayo del valor en una esquina (a08, a14): "Poder de base" / "Poder total"
  // y la cifra. estilo: "rueda" | "gana" | "pierde"
  _valor(ctx, der, col, etiqueta, valor, estilo) {
    ctx.save();
    if (der) { ctx.translate(400, 0); ctx.scale(-1, 1); }
    ctx.beginPath();
    ctx.moveTo(0, 10); ctx.lineTo(40, 10); ctx.lineTo(46, 4); ctx.lineTo(44, 14); ctx.lineTo(60, 12); ctx.lineTo(48, 24); ctx.lineTo(50, 18); ctx.lineTo(30, 30); ctx.lineTo(0, 30); ctx.closePath();
    const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 64, 0) : null;
    if (g && g.addColorStop) { g.addColorStop(0, col.placa); g.addColorStop(0.7, col.placa + "B0"); g.addColorStop(1, col.placa + "00"); ctx.fillStyle = g; } else ctx.fillStyle = col.placa;
    ctx.fill();
    ctx.restore();
    this._t(ctx, etiqueta, der ? 398 : 2, 6, { tam: 8, peso: 800, alinea: der ? "right" : "left", color: "#E8EEFF", contornos: [["rgba(0,0,0,.5)", 0.7]] });
    if (valor === null || valor === undefined) return;
    if (valor === "★") {
      this._t(ctx, "★", der ? 372 : 28, 22, { letra: "redonda", tam: 22, alinea: "center", degradado: GX.cifraGana, contornos: [[GX.cifraContorno, 1.4]] });
      return;
    }
    const deg = estilo === "pierde" ? GX.cifraPierde : GX.cifraGana;
    this._t(ctx, String(valor), der ? 396 : 4, 22, { letra: "cifras", tam: 22, peso: 700, alinea: der ? "right" : "left", degradado: deg, contornos: [[GX.cifraContorno, 1.5]], sesgo: -10, ancho: 76 });
  },
  // "Talento +30 %" y la flecha naranja bajo el valor del que suma pasivas (a13) [PIZARRA:
  // con el numero; con una tactica del rival puede restar, O-314]
  _talento(ctx, der, pct) {
    if (!pct) return;
    const t = "Talento " + (pct > 0 ? "+" : "") + pct + " %", x = der ? 386 : 14;
    this._t(ctx, t, x + (der ? -2 : 2), 36, { tam: 7, peso: 800, alinea: der ? "right" : "left", color: "#FFFFFF", contornos: [["#3A1A00", 0.8]] });
    const ax = der ? 392 : 8, s = pct > 0 ? 1 : -1;
    ctx.save(); ctx.fillStyle = GX.flechas;
    ctx.beginPath(); ctx.moveTo(ax, 36 - 4 * s); ctx.lineTo(ax + 3.5, 36); ctx.lineTo(ax + 1.2, 36); ctx.lineTo(ax + 1.2, 36 + 3.5 * s); ctx.lineTo(ax - 1.2, 36 + 3.5 * s); ctx.lineTo(ax - 1.2, 36); ctx.lineTo(ax - 3.5, 36); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  // "Elemento +20 %" bajo el Talento del que gana en elemento con su supertecnica a la del
  // otro (los "Efectos elementales" de VR, O-328)
  _ventaja(ctx, der, pct) {
    if (!pct) return;
    this._t(ctx, "Elemento +" + pct + " %", der ? 386 : 14, 46, { tam: 7, peso: 800, alinea: der ? "right" : "left", color: "#FFF2A0", contornos: [["#3A2A00", 0.8]] });
  },
  // el cuadro de los 4 elementos (a11) con la flecha amarilla hacia el que pierde la ventaja
  _elementos(ctx, izq, der) {
    const im = GX.icono("cuadro_elementos");
    if (GX.cargada(im)) ctx.drawImage(im, 180, 202, 38, 38);
    else { GX.redondo(ctx, 180, 202, 38, 38, 4); ctx.fillStyle = "rgba(18,58,18,.8)"; ctx.fill(); }
    const gI = izq && der && REGLAS.gana(izq.elemento, der.elemento), gD = izq && der && REGLAS.gana(der.elemento, izq.elemento);
    if (!gI && !gD) return;
    ctx.save(); ctx.translate(199, 197); if (gD) ctx.scale(-1, 1);
    ctx.fillStyle = "#F8E040"; ctx.strokeStyle = "#3A2A00"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(3, -2); ctx.lineTo(3, -5); ctx.lineTo(9, 0); ctx.lineTo(3, 5); ctx.lineTo(3, 2); ctx.lineTo(-9, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  // los apoyos (a12): la cara del companero sobre una placa de su color, pegada a su borde,
  // encima de la ficha; mas de uno, apilados. Y lo que suman
  _apoyos(ctx, p, yo, j, ap) {
    if (!j || !ap || !ap.ids || !ap.ids.length) return;
    const der = j.lado !== yo, col = GX.color(j.lado, yo);
    ap.ids.slice(0, 3).forEach((id, k) => {
      const c = p.jugadores[id];
      if (!c) return;
      const y = 102 - k * 40, x = der ? 336 : 0;
      ctx.save();
      ctx.beginPath();
      if (der) { ctx.moveTo(400, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x, y + 38); ctx.lineTo(400, y + 38); }
      else { ctx.moveTo(0, y); ctx.lineTo(58, y); ctx.lineTo(64, y + 6); ctx.lineTo(64, y + 38); ctx.lineTo(0, y + 38); }
      ctx.closePath(); ctx.fillStyle = col.base; ctx.fill(); ctx.strokeStyle = col.oscuro; ctx.lineWidth = 1; ctx.stroke();
      const el = { Fuego: "fuego", Viento: "viento", Bosque: "bosque", Montana: "montana" }[c.elemento];
      const ie = el ? GX.icono("elemento_" + el) : null;
      const im = GX.cara(c.cara);
      if (GX.cargada(im)) ctx.drawImage(im, der ? 358 : 20, y - 4, 42, 42);
      if (ie && GX.cargada(ie)) ctx.drawImage(ie, der ? 340 : 4, y + 4, 13, 13);
      ctx.restore();
    });
    const pct = ap.pct !== undefined ? ap.pct : Math.round(((ap.factor || 1) - 1) * 100);
    // lo que suman, junto a la placa de abajo (encima no cabe con tres: la cifra de arriba)
    if (pct) this._t(ctx, "+" + pct + " %", der ? 332 : 68, 136, { tam: 10, peso: 900, alinea: der ? "right" : "left", color: "#9FF0E6", contornos: [["#0A2A3A", 1]] });
  },
  // la barra del centro (a14): TEN (verde lo que queda, rojo lo que gasta esta tecnica) o
  // HIP (magenta) si es de espiritu
  _barra(ctx, et, queda, gasta, max, hip) {
    GX.redondo(ctx, 146, 6, 106, 12, 3); ctx.fillStyle = "rgba(170,240,150,.92)"; ctx.fill();
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1; ctx.stroke();
    GX.redondo(ctx, 148, 7.5, 18, 9, 2); ctx.fillStyle = hip ? GX.barraHip : GX.barraTen[1]; ctx.fill();
    this._t(ctx, et, 157, 12.3, { tam: 6.5, peso: 900, alinea: "center", color: "#FFFFFF", contornos: [["#1A3A10", 0.7]], ancho: 16 });
    const x0 = 169, w = 80, f = v => Math.max(0, Math.min(1, v / max));
    ctx.fillStyle = "#3A2A20"; ctx.fillRect(x0, 9, w, 6);
    ctx.fillStyle = hip ? GX.barraHip : GX.vertical(ctx, 9, 15, GX.barraTen); ctx.fillRect(x0, 9, w * f(queda), 6);
    if (gasta > 0) { ctx.fillStyle = "#E81818"; ctx.fillRect(x0 + w * f(queda), 9, w * (f(queda + gasta) - f(queda)), 6); }
  },
  // la parada (a16): el rayo amarillo del tiro que empuja contra la mano naranja del
  // portero, repartidos segun los dos numeros; el rayo siempre se ve largo (a16: con 1158
  // contra 9744 llega casi a la mitad)
  _rayoMano(ctx, tiro, por, tiroIzq) {
    const k = 0.35 + 0.5 * Math.max(0, Math.min(1, tiro / Math.max(1, tiro + por))), corte = tiroIzq ? 146 + 130 * k : 254 - 130 * k;
    ctx.save();
    if (!tiroIzq) { ctx.translate(400, 0); ctx.scale(-1, 1); }
    const c = tiroIzq ? corte : 400 - corte;
    ctx.beginPath(); ctx.moveTo(146, 12);
    for (let x = 146, s = 0; x < c - 4; x += 9, s++) ctx.lineTo(x + 4.5, s % 2 ? 3 : 18);
    ctx.lineTo(c - 2, 11); ctx.lineTo(c - 2, 16);
    for (let x = c - 7, s = 0; x > 146; x -= 9, s++) ctx.lineTo(x, s % 2 ? 8 : 22);
    ctx.closePath();
    ctx.fillStyle = "#F8D838"; ctx.fill(); ctx.strokeStyle = "#A06000"; ctx.lineWidth = 0.8; ctx.stroke();
    const im = GX.icono("icono_mano");
    if (GX.cargada(im)) ctx.drawImage(im, c - 3, -1, 24, 26);
    else { ctx.fillStyle = HUD_DUELO.mano; ctx.beginPath(); ctx.arc(c + 8, 11, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
  // el nombre de la tecnica (a17-a19): Anton sesgado del color de su elemento con contorno
  // negro grueso; entra desde la derecha a +330 ms con un poco de rebote. En el bloqueo,
  // centrado a media altura con zoom de 130 % a 100 % en 270 ms
  _nombre(ctx, nombre, el, t, centrado, hiper) {
    if (!nombre || t < HUD_DUELO.nombre.entra) return;
    const k = Math.min(1, (t - HUD_DUELO.nombre.entra) / HUD_DUELO.nombre.dura), rebote = k < 1 ? 0 : Math.max(0, 6 * (1 - (t - HUD_DUELO.nombre.entra - HUD_DUELO.nombre.dura) / 0.12));
    const color = hiper ? HUD_DUELO.hiper : GX.elemento[el] ? [GX.elementoTexto[el], GX.elementoTexto[el]] : ["#FFFFFF", "#DDE6F5"];
    const o = { letra: "nombre", tam: 32, peso: 400, degradado: [color[0], color[0], color[1]], contornos: [["#000000", 3]], sesgo: -8, ancho: 330 };
    if (centrado) {
      const z = Math.max(1, 1.3 - 0.3 * Math.min(1, (t - HUD_DUELO.nombre.entra) / 0.27));
      ctx.save(); ctx.translate(200, 132); ctx.scale(z, z);
      this._t(ctx, nombre, 0, 0, Object.assign(o, { alinea: "center" }));
      ctx.restore();
      return;
    }
    const x = 8 + (1 - k) * 400 - rebote;
    this._t(ctx, nombre, x, 213, Object.assign(o, { alinea: "left" }));
  },
  // la cifra que rueda: un numero al azar cada cuadro (el azar de la pantalla, no el del motor)
  _rueda(v) {
    const [a, b] = HUD_DUELO.rueda;
    return Math.max(1, Math.round((v || 100) * (a + Math.random() * (b - a))));
  },

  // --- el duelo eligiendo (m03; guia 8.1) ---------------------------------------------
  _eligiendo(ctx, p, yo, tr) {
    const du = tr.duelo && tr.duelo.obj;
    if (!du) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240); return; }
    // en el tiro que viaja (O-325): el tiro contra el muro, el que encadena contra el portero
    const [a, b] = du.tipo === "foco" ? this._dos(p, du.atacante, du.defensor)
      : du.etapa === "muro" ? this._dos(p, du.tirador, du.muro) : du.etapa === "cadena" ? this._dos(p, du.cadena, du.portero)
      : this._dos(p, du.tirador, du.portero);
    const izq = a && a.lado === yo ? a : b, der = izq === a ? b : a;
    this._fondoDuelo(ctx, p, yo, izq, der, tr.t);
    if (!tr.fichas) return;
    const ap = (du.base && du.base.apoyos) || {};
    if (du.tipo === "foco") { this._apoyos(ctx, p, yo, izq, ap[izq.lado]); this._apoyos(ctx, p, yo, der, ap[der.lado]); }
    this._fichas(ctx, p, yo, izq, der);
    if (!tr.base || !du.base) return;
    for (const j of [izq, der]) {
      const d = j.lado !== yo;
      this._valor(ctx, d, GX.color(j.lado, yo), "Poder de base", du.base[j.lado], "gana");
      this._talento(ctx, d, this._pasivas(p, du, j));
    }
  },
  _dos(p, a, b) { return [p.jugadores[a], p.jugadores[b]]; },
  // lo que suman las pasivas a j en este duelo, en %, para "Talento" (la misma cuenta del motor)
  _pasivas(p, du, j) {
    if (!p.bonusPasivas || !j) return 0;
    const que = du.tipo === "foco" ? "foco" : j.esPortero && du.portero === j.id ? "kp" : du.muro === j.id && du.etapa === "muro" ? "muro" : "tiro";
    const ataca = du.tipo === "foco" ? j.id === du.atacante : j.id === du.tirador || j.id === du.cadena;
    try { return Math.round((p.bonusPasivas(j, que, ataca) - 1) * 100); } catch (e) { return 0; }
  },
  // el fondo de dos: tu lado a la izquierda, el rival a la derecha, con sus retratos
  _fondoDuelo(ctx, p, yo, izq, der, t, acerca = 0) {
    if (this._3d) return;
    const ci = GX.color(izq ? izq.lado : yo, yo), cd = GX.color(der ? der.lado : 1 - yo, yo);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 200, 240); ctx.clip(); this._fondo(ctx, ci.claro, ci.oscuro, t, 30); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(200, 0, 200, 240); ctx.clip(); this._fondo(ctx, cd.claro, cd.oscuro, t + 0.5, 30); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(199, 0, 2, 240);
    const h = HUD_DUELO.retrato;
    this._retrato(ctx, izq, 120 + acerca * 40, 214, h, false, yo);
    this._retrato(ctx, der, 280 - acerca * 40, 214, h, true, yo);
  },
  _fichas(ctx, p, yo, izq, der) {
    const visto = Arriba.visto;
    if (izq) Arriba._ficha(ctx, p, yo, izq);
    if (der) Arriba._ficha(ctx, p, yo, der);
    Arriba.visto = visto;
    this._elementos(ctx, izq, der);
  },

  // --- la animacion de un resultado (6.5 e-m) -----------------------------------------
  _anim(ctx, p, yo, tr) {
    const R = tr.res, r = R.r || {}, q = tr.q || {}, t = tr.t;
    if (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta") return this._animFoco(ctx, p, yo, tr, R, r, q, t);
    if (r.tipo === "tiro" || r.tipo === "penalti") return this._animTiro(ctx, p, yo, tr, R, r, q, t);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240);
  },

  // el foco: el choque (sin HUD), las tecnicas una detras de otra con las cifras rodando,
  // y al fijar el que gana amarillo y el que pierde morado
  _animFoco(ctx, p, yo, tr, R, r, q, t) {
    const att = p.jugadores[r.atacante], def = p.jugadores[r.defensor];
    if (!att || !def) return;
    const izq = att.lado === yo ? att : def, der = izq === att ? def : att;
    const que = tr.que === "transicion" || tr.que === "vuelta" ? this._antes(R, tr.k) : tr.que;
    if (que === "choque" || que === "entrada" || que === "transicion") {
      this._fondoDuelo(ctx, p, yo, izq, der, t, Math.min(1, t / Math.max(0.3, tr.dura)));
      return;
    }
    if (que === "tecnica" || que === "hiper") {
      const j = p.jugadores[q.jugador] || att, l = j.lado, nombre = r.tecnicas ? r.tecnicas[l] : "", hip = que === "hiper";
      const c = hip ? HUD_DUELO.hiper : this._colorElemento(r.elementos ? r.elementos[l] : "") || [GX.color(l, yo).claro, GX.color(l, yo).oscuro];
      this._fondo(ctx, c[0], c[1], t);
      this._retrato(ctx, j, 200, 236 + Math.max(0, 0.3 - t) * 40, 190 + t * 6, j.lado !== yo, yo);
      for (const k of [izq, der]) this._valor(ctx, k.lado !== yo, GX.color(k.lado, yo), "Poder total", r.hiper === k.lado ? "★" : this._rueda(r.valores[k.lado]), "rueda");
      if (hip) this._barra(ctx, "HIP", p.hiper[l], r.hiper === l ? REGLAS.HIPER_COSTE : 0, REGLAS.HIPER_MAX, true);
      else this._barra(ctx, "TEN", p.tension[l], this._coste(R, l, nombre), REGLAS.TENSION_MAX);
      this._nombre(ctx, nombre, r.elementos ? r.elementos[l] : "", t, false, hip);
      return;
    }
    // sin tecnicas (GO Light): las dos cifras rodando 0,6 s y fijandose; o el tramo de fijar.
    // Al fijar tras una tecnica su escena sigue detras (t05 +4700: su fondo y quien la hizo)
    const qt = que === "fijar" || que === "vuelta" ? this._ultimaTec(R, tr.k) : null;
    if (qt) {
      const j = p.jugadores[qt.jugador] || att, l = j.lado, hip = qt.que === "hiper";
      const c = hip ? HUD_DUELO.hiper : this._colorElemento(r.elementos ? r.elementos[l] : "") || [GX.color(l, yo).claro, GX.color(l, yo).oscuro];
      this._fondo(ctx, c[0], c[1], 5 + t);
      this._retrato(ctx, j, 200, 236, 190 + (qt.a - qt.de) * 6, j.lado !== yo, yo);
    } else this._fondoDuelo(ctx, p, yo, izq, der, t, 1);
    const fija = que === "fijar" || que === "vuelta" || (que === "sinTecnica" && t >= tr.dura * 0.43);
    const tf = que === "sinTecnica" ? t - tr.dura * 0.43 : que === "vuelta" ? 1 : t;
    for (const k of [izq, der]) {
      const d = k.lado !== yo, col = GX.color(k.lado, yo), gana = r.ganador === k.id || (r.tipo === "falta" && k.id === r.atacante);
      let v = r.valores ? r.valores[k.lado] : null, critico = false;
      if (r.hiper === k.lado) v = "★";
      else if (r.critico === k.lado && r.antes !== null && r.antes !== undefined) { critico = tf >= 0.25; if (!critico) v = r.antes; }
      this._valor(ctx, d, col, "Poder total", fija ? v : (v === "★" ? "★" : this._rueda(v)), fija ? (gana ? "gana" : "pierde") : "rueda");
      if (fija) this._talento(ctx, d, r.pasivas ? Math.round(r.pasivas[k.lado] || 0) : 0);
      if (fija && r.ventaja) this._ventaja(ctx, d, r.ventaja[k.lado] || 0);     // O-328
      if (fija && critico && gana) this._marca(ctx, d, "¡Crítico!");
      if (fija && r.hiper === k.lado) this._marca(ctx, d, "¡Hipertécnica!");
    }
    if (fija && r.apoyos) for (const k of [izq, der]) { const ap = r.apoyos[k.lado]; if (ap && ap.ids && ap.ids.length) this._apoyos(ctx, p, yo, k, ap); }
  },
  // la ultima tecnica (o hipertecnica) antes del tramo k
  _ultimaTec(R, k) {
    const ts = R.plan.tramos;
    for (let i = k - 1; i >= 0; i--) if (ts[i].que === "tecnica" || ts[i].que === "hiper") return ts[i];
    return null;
  },
  // el tramo de antes de una transicion o una vuelta (para pintar lo que se funde)
  _antes(R, k) {
    const ts = R.plan.tramos;
    for (let i = k - 1; i >= 0; i--) if (ts[i].que !== "transicion" && ts[i].que !== "vuelta") return ts[i].que;
    return "choque";
  },
  // "¡Crítico!" / "¡Hipertécnica!" amarillo junto a la cifra (guia 8.4; O-309, O-310)
  _marca(ctx, der, texto) {
    this._t(ctx, texto, der ? 330 : 70, 18, { letra: "rotulo", tam: 13, peso: 400, alinea: der ? "right" : "left", degradado: ["#FFF6A0", "#F8C020"], contornos: [["#3A1A00", 1.3]], sesgo: -8 });
  },
  // lo que cuesta la tecnica `nombre` del lado l (sus opciones en el duelo), para la barra
  _coste(R, l, nombre) {
    const du = R.du, lp = du && du.lados && du.lados[l];
    if (!lp || !nombre) return 0;
    const n = String(nombre).replace(/ \(cadena\)$/, "");
    const ops = [].concat(lp.opciones || [], lp.cadena ? lp.cadena.opciones || [] : [], lp.muro ? lp.muro.opciones || [] : []);
    const o = ops.find(x => x.nombre && x.nombre.indexOf(n) === 0);
    return o ? o.tp || 0 : 0;
  },

  // el tiro (y el penalti): el que chuta se prepara; su tecnica con su cifra rodando; el
  // muro con "¡Tiro debilitado!" o "¡Tiro bloqueado!"; el portero con el rayo contra la
  // mano; al fijar, quien gana. En el penalti, adonde tira cada uno
  _animTiro(ctx, p, yo, tr, R, r, q, t) {
    const ps = r.pasos || [], tir = p.jugadores[r.tirador] || p.jugadores[(ps[0] || {}).quien], k0 = ps[0] ? p.jugadores[ps[0].quien] : tir;
    const que = tr.que === "transicion" || tr.que === "vuelta" || tr.que === "destello" ? this._antes(R, tr.k) : tr.que;
    const lt = (k0 || tir || { lado: 0 }).lado;
    const kM = ps.findIndex(s => s.contra !== undefined && s.contra !== null), pm = kM >= 0 ? ps[kM] : null, pf = ps[ps.length - 1] || {};
    const etapa = q.paso !== undefined ? q.paso : tr.que === "vuelta" || tr.que === "transicion" || tr.que === "destello" ? this._pasoAntes(R, tr.k) : 0;
    const sPaso = ps[etapa] || ps[0] || {};
    const j = p.jugadores[sPaso.quien] || tir;
    if (!j) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240); return; }
    // (la cadena del tiro que viaja va la ultima y no es el portero, O-325)
    const muro = !!(pm && etapa === kM), portero = etapa === ps.length - 1 && etapa > 0 && !pf.fuera && !(pm && etapa === kM) && !/ \(cadena\)$/.test(sPaso.que || "");
    // el fondo: el color del elemento de la tecnica o del lado
    // al fijar, la escena de la tecnica sigue (su color y su nombre ya en su sitio)
    const fijando = que === "fijar";
    const tec = que === "tecnica" || que === "hiper" || (fijando && !!sPaso.tecnica);
    const hip = que === "hiper" || (fijando && /[★✦]/.test(sPaso.que || ""));
    const tn = fijando ? 9 : t;
    const c = hip ? HUD_DUELO.hiper : (tec && this._colorElemento(sPaso.elemento)) || [GX.color(j.lado, yo).claro, GX.color(j.lado, yo).oscuro];
    if (que === "prepara" || que === "entraPenalti" || que === "entrada" || que === "choque") {
      const cl = GX.color(lt, yo);
      this._fondo(ctx, cl.claro, cl.oscuro, t);
      this._retrato(ctx, tir, 200, 236, 170 + t * 10, tir && tir.lado !== yo, yo);
      if (r.tipo === "penalti" && (que === "entraPenalti" || r.misma === false)) this._zonas(ctx, p, yo, r, que === "entraPenalti");
      return;
    }
    this._fondo(ctx, c[0], c[1], t);
    this._retrato(ctx, j, 200, 236 + Math.max(0, 0.3 - t) * 40, 190 + t * 5, j.lado !== yo, yo);
    const ladoT = lt, dT = ladoT !== yo, colT = GX.color(ladoT, yo);
    const fija = que === "fijar" || tr.que === "vuelta";
    const vf = ps[0] && ps[0].valorFinal !== undefined ? ps[0].valorFinal : (ps[0] || {}).valor;
    if (!muro && !portero) {
      // el que chuta (o el que encadena): solo su cifra, rodando
      const v = ps[etapa] ? ps[etapa].valor : vf;
      this._valor(ctx, dT, colT, "Poder total", this._rueda(v), "rueda");
      if (tec) this._barra(ctx, "TEN", p.tension[ladoT], this._coste(R, ladoT, sPaso.que), REGLAS.TENSION_MAX);
      this._nombre(ctx, tec ? String(sPaso.que || "").replace(/ \(cadena\)$/, "") : "", sPaso.elemento, tn, false, hip);
      if (!tec && sPaso.que) this._t(ctx, sPaso.que, 200, 213, { letra: "rotulo", tam: 22, peso: 400, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.6]], sesgo: -8 });
      return;
    }
    const otro = p.jugadores[sPaso.quien] || j, dO = otro.lado !== yo, colO = GX.color(otro.lado, yo);
    if (muro) {
      // el muro (a20): arriba la cifra del tiro, que baja lo que le quita; la del muro solo
      // si lo para (critico: la del que gana salta)
      const gana = r.final === "bloqueado";
      const vT0 = pm.critico === ladoT && pm.antes ? pm.antes : pm.contra;
      const vM0 = pm.critico === otro.lado && pm.antes ? pm.antes : pm.valor;
      let vT = vT0, sT = "gana", vM = fija ? vM0 : this._rueda(pm.valor), sM = "rueda";
      // "¡Tiro debilitado!" (a20): entra grande por abajo a la derecha y encoge bajo el
      // nombre mientras la cifra del tiro baja lo que le quita el muro (O-309)
      const tDeb = Math.max(0.5, tr.dura * 0.62);
      if (!gana && pm.resta && que !== "fijar" && t >= tDeb) {
        const k = Math.min(1, (t - tDeb) / 0.5);
        vT = Math.round(vT0 - pm.resta * k);
        // enorme medio segundo (t08 +3000..+3267) y encoge
        const e = Math.min(1, Math.max(0, (t - tDeb - 0.3) / 0.35));
        const z = 2.7 - 1.7 * e, x = 200 + 60 * (1 - e) * Math.max(0, 1 - (t - tDeb) / 0.12), y = 178 + 30 * (1 - e);
        ctx.save(); ctx.translate(x, y); ctx.scale(z, z);
        this._t(ctx, "¡Tiro debilitado!", 0, 0, { letra: "rotulo", tam: 20, peso: 400, alinea: "center", degradado: GX.rotulo.debilitado.relleno, contornos: GX.rotulo.debilitado.contornos, sesgo: -8 });
        ctx.restore();
        if (k > 0.2) this._t(ctx, "le quita " + pm.resta, dT ? 396 : 4, 36, { tam: 7, peso: 800, alinea: dT ? "right" : "left", color: "#BFE6FF", contornos: [["#0A1E5A", 0.8]] });
      }
      if (fija && gana) {
        sT = "pierde"; sM = "gana";
        if (pm.critico === otro.lado && pm.antes) { vM = t >= 0.2 ? pm.valor : pm.antes; if (t >= 0.2) this._marca(ctx, dO, "¡Crítico!"); }
        this._t(ctx, "¡Tiro bloqueado!", 200, 178, { letra: "rotulo", tam: 22, peso: 400, alinea: "center", degradado: GX.rotulo.debilitado.relleno, contornos: GX.rotulo.debilitado.contornos, sesgo: -8 });
      }
      this._valor(ctx, dT, colT, "Poder total", vT, sT);
      if (fija && gana) this._valor(ctx, dO, colO, "Poder total", vM, sM);
      if (tec) this._barra(ctx, "TEN", p.tension[otro.lado], this._coste(R, otro.lado, pm.que), REGLAS.TENSION_MAX);
      this._nombre(ctx, tec ? pm.que : "", pm.elemento, tn, true, hip);
      if (!tec) this._t(ctx, pm.que || "Bloqueo", 200, 132, { letra: "rotulo", tam: 20, peso: 400, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.6]], sesgo: -8 });
      return;
    }
    // el portero: su cifra rueda en su lado y la del tiro fija; en medio el rayo contra la
    // mano; al fijar, el que gana amarillo (critico: salta por encima del otro)
    const gol = r.final === "gol";
    const vTr = pf.critico === ladoT && pf.antes ? pf.antes : vf;
    let vT = vTr, vP = fija ? (pf.critico === otro.lado && pf.antes ? pf.antes : pf.valor) : this._rueda(pf.valor);
    if (fija && t >= 0.2) {
      if (gol && pf.critico === ladoT && pf.antes) { vT = vf; this._marca(ctx, dT, "¡Crítico!"); }
      if (!gol && pf.critico === otro.lado && pf.antes) { vP = pf.valor; this._marca(ctx, dO, "¡Crítico!"); }
    }
    if (r.tipo === "penalti" && !r.misma) vP = null;
    this._valor(ctx, dT, colT, "Poder total", vT, fija ? (gol ? "gana" : "pierde") : "gana");
    this._valor(ctx, dO, colO, "Poder total", vP, fija ? (gol ? "pierde" : "gana") : "rueda");
    if (fija) { this._talento(ctx, dT, Math.round((ps[0] || {}).pasivas || 0)); this._talento(ctx, dO, Math.round(pf.pasivas || 0)); }
    if (fija) { this._ventaja(ctx, dT, (ps[0] || {}).ventaja || 0); this._ventaja(ctx, dO, pf.ventaja || 0); }     // O-328
    if (vP !== null && typeof vP === "number") this._rayoMano(ctx, vT, vP, !dT);
    this._nombre(ctx, tec ? pf.que : "", pf.elemento, tn, false, hip);
    if (!tec && pf.que) this._t(ctx, pf.que, 200, 213, { letra: "rotulo", tam: 22, peso: 400, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.6]], sesgo: -8 });
    if (r.tipo === "penalti" && fija) this._zonas(ctx, p, yo, r, true);
  },
  _pasoAntes(R, k) {
    const ts = R.plan.tramos;
    for (let i = k - 1; i >= 0; i--) if (ts[i].paso !== undefined) return ts[i].paso;
    return 0;
  },
  // el penalti (O-312; 4.4 CRITICA): la porteria de 3 casillas de b46 en pequeno con el
  // balon en la del tiro y la mano naranja en la del portero, y adonde tira cada uno
  // (como se ve en TU pantalla: zonaCampo)
  _zonas(ctx, p, yo, r, conTexto) {
    const tir = p.jugadores[r.tirador], por = p.jugadores[r.portero];
    if (!tir || !por || !r.zonas) return;
    const zc = z => (typeof zonaCampo === "function" ? zonaCampo(z) : z);
    const zt = zc(r.zonas[tir.lado]), zp = zc(r.zonas[por.lado]);
    const x0 = 140, y0 = 128, w = 120, h = 40;
    ctx.save();
    ctx.fillStyle = "rgba(10,20,30,.7)"; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = HUD_DUELO.red; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let x = x0; x <= x0 + w; x += 6) { ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); }
    for (let y = y0; y <= y0 + h; y += 6) { ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); }
    ctx.stroke();
    ctx.fillStyle = "rgba(11,179,150,.55)"; ctx.fillRect(x0 + zp * w / 3, y0, w / 3, h);
    ctx.strokeStyle = HUD_DUELO.porteria; ctx.lineWidth = 2.5; ctx.strokeRect(x0, y0, w, h);
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.6)";
    for (const k of [1, 2]) { ctx.beginPath(); ctx.moveTo(x0 + k * w / 3, y0); ctx.lineTo(x0 + k * w / 3, y0 + h); ctx.stroke(); }
    const mano = GX.icono("icono_mano");
    if (GX.cargada(mano)) ctx.drawImage(mano, x0 + zp * w / 3 + w / 6 - 10, y0 + 8, 20, 22);
    Rotulos._balon(ctx, x0 + zt * w / 3 + w / 6 + (zt === zp ? 8 : 0), y0 + h / 2 + 6, 7, 0.3);
    ctx.restore();
    if (!conTexto) return;
    const aZ = z => z === 1 ? "al centro" : z === 0 ? "a la izquierda" : "a la derecha";
    const texto = tir.nombre + " tira " + aZ(zt) + " · " + por.nombre + (r.misma ? " acierta" : " se tira " + aZ(zp));
    this._t(ctx, texto, 200, 178, { tam: 10, peso: 800, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.3]], ancho: 380 });
  },

  // --- el gol (guia 8.6; t11, t12, a21): la secuencia de arriba -------------------------
  _gol(ctx, p, yo, tr) {
    const t = tr.t, R = tr.res, r = (R && R.r) || {}, tir = p.jugadores[r.tirador];
    const goles = [p.goles[yo], p.goles[1 - yo]];
    if (tr.completas === false) {
      // cortas: la escena del gol (el "0 - 1" y "¡GOL!") 2,5 s entre un destello y el negro
      const f = tr.dura / 4.4, ts = t / f;
      this._escenaGol(ctx, p, yo, goles, 3.73 + Math.max(0, (ts - 0.2)) * 1.1, tir);
      if (ts < 0.2) { ctx.fillStyle = "rgba(255,255,255," + (1 - ts / 0.2) + ")"; ctx.fillRect(0, 0, 400, 240); }
      if (ts > 2.7) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, (ts - 2.7) / 0.1) + ")"; ctx.fillRect(0, 0, 400, 240); }
      return;
    }
    if (t < 0.1) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, 400, 240); return; }
    // los tres planos (rompe la mano, detras del portero, la red) son del 3D
    if (t < 2.4 && this._3d) return;
    if (t < 0.4) {
      // el balon rompe la mano entre fuego
      this._fondo(ctx, HUD_DUELO.gol[0], HUD_DUELO.gol[1], t);
      const k = (t - 0.1) / 0.3, mano = GX.icono("icono_mano");
      if (GX.cargada(mano)) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.drawImage(mano, 140 - k * 40, 60 - k * 20, 120 + k * 80, 130 + k * 80); ctx.restore(); }
      Rotulos._balon(ctx, 200, 125, 30 + k * 40, t * 8);
      return;
    }
    if (t < 0.9) {
      // detras del portero: el balon entra
      const k = (t - 0.4) / 0.5;
      this._porteria(ctx, false);
      Rotulos._balon(ctx, 200 + k * 10, 150 - k * 50, 40 - k * 28, t * 10);
      return;
    }
    if (t < 2.4) {
      // desde dentro de la porteria: el balon se clava en la red
      const k = Math.min(1, (t - 0.9) / 0.4);
      ctx.fillStyle = "#3A8A30"; ctx.fillRect(0, 0, 400, 240);
      ctx.fillStyle = GX.vertical(ctx, 0, 240, ["#BA562E", "#7A3818"]); ctx.fillRect(0, 150, 400, 90);
      Rotulos._balon(ctx, 200, 120, 18 + k * 34, t * 6);
      this._columna(ctx, 200, 120, 20 + k * 30, t, Math.max(0, 1 - (t - 1.1) / 0.4));
      this._red(ctx, k);
      return;
    }
    if (t < 3.73) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240);
      if (t < 2.5) { ctx.fillStyle = "rgba(0,0,0,1)"; ctx.fillRect(0, 0, 400, 240); }
      return;
    }
    this._escenaGol(ctx, p, yo, goles, t, tir);
    if (t > 6.5) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, (t - 6.5) / 0.1) + ")"; ctx.fillRect(0, 0, 400, 240); }
  },
  // la escena del gol (desde +3,73 s): el "0 - 1" enorme abajo, el balon en llamas que
  // cruza, la explosion blanca y "¡GOL!" que sale de ella, salta y se va
  _escenaGol(ctx, p, yo, goles, t, tir) {
    this._fondo(ctx, "#8FD0FF", "#1A5A9A", t, 36);
    if (!this._3d) { ctx.fillStyle = GX.vertical(ctx, 150, 240, ["#49A829", "#2E7A18"]); ctx.fillRect(0, 160, 400, 80); }
    if (tir) this._retrato(ctx, tir, 300, 236, 150, tir.lado !== yo, yo);
    // el balon en llamas de derecha a izquierda (3,73-3,93) y el bote (3,93-4,07)
    if (t < 3.93) {
      const k = (t - 3.73) / 0.2, x = 440 - k * 480;
      ctx.save(); ctx.lineCap = "round";
      for (const [dy, a, w] of [[-16, 0.7, 5], [-6, 0.95, 9], [6, 0.95, 9], [16, 0.7, 5]]) {
        ctx.strokeStyle = "rgba(240,60,20," + a + ")"; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x + 24, 120 + dy); ctx.lineTo(x + 260, 120 + dy); ctx.stroke();
        ctx.strokeStyle = "rgba(255,220,90," + a + ")"; ctx.lineWidth = w * 0.4; ctx.stroke();
      }
      ctx.restore();
      this._llamas(ctx, x, 120, 40, t);
      Rotulos._balon(ctx, x, 120, 30, t * 12);
    } else if (!this._3d) {
      // el bote (en el 3D bota el balon de verdad, junto al portero caido)
      const k = Math.min(1, (t - 3.93) / 0.14), y = 198 - Math.sin(k * Math.PI) * 30;
      Rotulos._balon(ctx, 74, y, 54, 0.3);
    }
    // el marcador nuevo, enorme y fijo
    GX.texto(ctx, goles[0] + " - " + goles[1], 200, 205, { letra: "cifras", tam: 46, peso: 700, alinea: "center", degradado: ["#FBFE3F", "#FFF6C8", "#FD5209"], contornos: [["#000000", 2.2]], sesgo: -6 });
    this.visto.textos.push(goles[0] + " - " + goles[1]);
    // la explosion blanca horizontal (4,07-4,33)
    if (t >= 4.07 && t < 4.6) {
      const k = Math.min(1, (t - 4.07) / 0.26), a = t < 4.33 ? 1 : Math.max(0, 1 - (t - 4.33) / 0.27);
      // una banda de luz con los bordes naranjas, que se abre desde el centro
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 84, 0, 156) : null;
      if (g && g.addColorStop) {
        g.addColorStop(0, "rgba(255,120,30,0)"); g.addColorStop(0.18, "rgba(255,150,40,.85)"); g.addColorStop(0.35, "#FFFFFF");
        g.addColorStop(0.65, "#FFFFFF"); g.addColorStop(0.82, "rgba(255,150,40,.85)"); g.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = g;
      } else ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.ellipse(200, 120, 230 * k, 36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // "¡GOL!": blanco a 4,37, con sus colores a 4,47, salta al 180 % hacia arriba a la
    // izquierda (5,07-5,13) y se va (5,17)
    if (t >= 4.37 && t < 5.17) {
      const salto = t >= 5.07 ? Math.min(1, (t - 5.07) / 0.06) : 0, z = 1 + 0.8 * salto;
      ctx.save(); ctx.translate(200 - salto * 90, 100 - salto * 50); ctx.scale(z, z);
      ctx.globalAlpha = t > 5.13 ? Math.max(0, 1 - (t - 5.13) / 0.04) : 1;
      if (t < 4.47) this._t(ctx, "¡GOL!", 0, 0, { letra: "rotulo", tam: 74, peso: 400, alinea: "center", color: "#FFFFFF", contornos: [["#FFFFFF", 2.4]], sesgo: -8 });
      else this._t(ctx, "¡GOL!", 0, 0, { letra: "rotulo", tam: 74, peso: 400, alinea: "center", degradado: GX.rotulo.gol.relleno, contornos: GX.rotulo.gol.contornos, sesgo: -8 });
      ctx.restore();
    }
  },
  // la porteria vista desde detras del portero (el palo, el larguero y la red)
  _porteria(ctx) {
    ctx.fillStyle = GX.vertical(ctx, 0, 240, ["#2A5A8A", "#0A1A2A"]); ctx.fillRect(0, 0, 400, 240);
    ctx.fillStyle = "#3A9A30"; ctx.fillRect(0, 170, 400, 70);
    ctx.strokeStyle = HUD_DUELO.porteria; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(70, 172); ctx.lineTo(70, 40); ctx.lineTo(330, 40); ctx.lineTo(330, 172); ctx.stroke();
    ctx.strokeStyle = HUD_DUELO.red; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let x = 74; x < 330; x += 10) { ctx.moveTo(x, 44); ctx.lineTo(x, 170); }
    for (let y = 44; y < 170; y += 10) { ctx.moveTo(72, y); ctx.lineTo(328, y); }
    ctx.stroke();
  },
  // la red en primer plano (hexagonos), que se abomba con el balon
  _red(ctx, k) {
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.4;
    const r = 11;
    for (let y = -r, f = 0; y < 250; y += r * 1.5, f++) for (let x = (f % 2) * r * 0.87 - r; x < 410; x += r * 1.73) {
      const dx = x - 200, dy = y - 120, d = Math.hypot(dx, dy), em = Math.max(0, 1 - d / 140) * 16 * k;
      const cx = x + dx / (d || 1) * em, cy = y + dy / (d || 1) * em;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  },
  // la columna de fuego del balon en la red: lenguas que suben hasta arriba (amarillas por
  // dentro, naranjas por fuera) y, al clavarse (halo de 1 a 0), un anillo dorado
  _columna(ctx, x, y, r, t, halo) {
    ctx.save();
    if (halo > 0) {
      ctx.globalAlpha = halo;
      const g = ctx.createRadialGradient ? ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 1.7) : null;
      if (g && g.addColorStop) {
        g.addColorStop(0, "rgba(255,240,150,.85)"); g.addColorStop(0.8, "rgba(255,200,60,.55)"); g.addColorStop(1, "rgba(255,170,30,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 1.45, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,210,60,.9)"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 1.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,200,.9)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 8; i++) {
      const s = (t * 1.6 + i / 8) % 1, yy = y + r * 0.3 - s * (y + r), w = r * (1.05 - s * 0.4), h = r * (0.9 + s * 0.7);
      ctx.globalAlpha = 0.8 * (1 - s * 0.7);
      for (const [c, f] of [["rgba(255,150,30,.7)", 1], ["rgba(255,240,140,.85)", 0.6]]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x, yy - h * f);
        ctx.bezierCurveTo(x + w * f, yy - h * 0.2 * f, x + w * f * 0.8, yy + h * 0.5 * f, x, yy + h * 0.55 * f);
        ctx.bezierCurveTo(x - w * f * 0.8, yy + h * 0.5 * f, x - w * f, yy - h * 0.2 * f, x, yy - h * f);
        ctx.fill();
      }
    }
    ctx.restore();
  },
  _llamas(ctx, x, y, r, t) {
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + t * 4, rr = r * (0.8 + 0.4 * Math.sin(t * 20 + i));
      ctx.fillStyle = i % 2 ? "rgba(255,140,20,.6)" : "rgba(255,220,60,.55)";
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, rr * 0.5, rr * 0.3, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // --- la invocacion sobre el mapa (6.5 p; t17): negro, el jugador se carga con un aura
  // en espiral del color de su familia, sale el espiritu y su nombre con zoom ---------------
  _invoca(ctx, p, yo, tr) {
    // fin: lo que dura (con la animacion de VR, la suya: el nombre y el fundido van al final, O-323)
    const t = tr.t, j = p.jugadores[tr.jugador], fin = tr.dura || 4.3;
    if (!this._3d) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 400, 240); }
    if (!j || t < 0.6) return;
    const col = (typeof AURA_HIPER !== "undefined" && AURA_HIPER[j.hiperTipo]) ? AURA_HIPER[j.hiperTipo][1] : "#C9A2FF";
    this._fondo(ctx, col, "#120A28", t, 36);
    // el espiritu: su silueta grande detras, del color de su familia (en el 3D, el clon x3)
    if (t >= 1.8 && !this._3d) {
      ctx.save(); ctx.globalAlpha = Math.min(0.55, (t - 1.8) / 0.4 * 0.55);
      this._retrato(ctx, j, 200, 300, 330, j.lado !== yo, yo);
      ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = col; ctx.fillRect(0, 0, 400, 240);
      ctx.restore();
    }
    // el aura en espiral alrededor del jugador (en el 3D, las particulas)
    if (!this._3d) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(200, 180 - i * 30 - (t * 40) % 30, 80 - i * 8, 18, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    const sube = Math.max(0, 1.8 - t) * 30;
    this._retrato(ctx, j, 200, 236 + sube, 170, j.lado !== yo, yo);
    // el nombre del espiritu en dos lineas, abajo, con zoom (130 % -> 100 % en 200 ms) y su
    // familia en dorado (en Galaxy "Ω")
    if (t >= fin - 1.6 && j.espiritu) {
      const z = Math.max(1, 1.3 - 0.3 * (t - (fin - 1.6)) / 0.2);
      ctx.save(); ctx.translate(200, 200); ctx.scale(z, z);
      this._t(ctx, j.espiritu.nombre, 0, 0, { letra: "nombre", tam: 24, peso: 400, alinea: "center", degradado: ["#E8FFFF", "#35C8F5"], contornos: [["#000000", 2.4]], sesgo: -8, ancho: 360 });
      const fam = REGLAS.HIPER_TIPOS[j.hiperTipo] ? REGLAS.HIPER_TIPOS[j.hiperTipo].nombre : "";
      this._t(ctx, fam.toUpperCase(), 0, 22, { letra: "rotulo", tam: 11, peso: 400, alinea: "center", degradado: ["#FFF0A0", "#E0A020"], contornos: [["#3A2400", 1]] });
      ctx.restore();
    }
    if (t > fin - 0.1) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, (t - (fin - 0.1)) / 0.1) + ")"; ctx.fillRect(0, 0, 400, 240); }
  },
};
