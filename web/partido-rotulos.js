/* Los rotulos de Galaxy (NOTAS O-319; diseno 6.5 o; guia 8.7): los dibuja Rotulos.pintar
   en el HUD de la pantalla de abajo, encima del campo, con la letra de los rotulos (GX
   Rotulo, sesgada) y su degradado y doble contorno. Cuales salen y cuando lo decide el
   Director (estado.rotulos, cada uno con su t); aqui solo como se ven: el ¡SAQUE! con su
   banda cian, el Fuera de juego con sus banderas, el Descanso, el Fin del partido con sus
   estelas, el ¡Bloqueo! con sus estrellas y rayos, la Invocacion con su espiral, la
   supertactica, la falta y las tarjetas, los pequenos (banda, corner, puerta, la tanda)
   y el panel CAMBIOS. Y lo de encima del campo que pone el Director: oscurecido,
   fundidos, negro, la placa "Poder total" del tiro en vuelo y el rotulo "Vídeo". */
"use strict";

// los colores de los rotulos que la guia no trae (en GX: todos los de Galaxy en un sitio,
// diseno 2.5). [NO GALAXY] la falta, las tarjetas y la supertactica (CS, GO Light)
Object.assign(GX.rotulo, {
  empate: { relleno: ["#E8FFFF", "#3FC8D8"], contornos: [["#FFFFFF", 2.2], ["#0A3A5A", 1.4]] },
  tandaGol: { relleno: ["#FFF6A0", "#F8C020"], contornos: [["#FFFFFF", 1.8], ["#3A2A00", 1.2]] },
  tandaParada: { relleno: ["#E8FFFF", "#40D0E0"], contornos: [["#FFFFFF", 1.8], ["#0A2A4A", 1.2]] },
  chico: { relleno: ["#FFFFFF", "#DCE8F4"], contornos: [["#0A1E3A", 1.5]] },
  falta: { relleno: ["#FFFFFF", "#FFE6DC"], contornos: [["#5A0A0A", 1.6]] },
  amarilla: { relleno: ["#FFF6A0", "#F8C820"], contornos: [["#FFFFFF", 1.8], ["#3A2A00", 1.3]] },
  roja: { relleno: ["#FFB8A8", "#E8322A"], contornos: [["#FFFFFF", 1.8], ["#4A0A0A", 1.3]] },
  tactica: { relleno: ["#FFB0A0", "#E01818"], contornos: [["#FFFFFF", 2.2], ["#4A0A0A", 1.4]] },
});
const GX_ROT = {
  banda: ["#1CB6D4", "#188EC8"], bandaDescanso: "rgba(46,200,120,.42)", estelas: "rgba(255,236,120,.9)",
  falta: ["#E8322A", "#A01810"], carta: { amarilla: "#FFE14D", roja: "#E8322A" },
  bloqueo: { estrella: "#FFFFFF", azul: "#2A7BFF", rayo: "#BFE6FF" },
  espiral: ["#35DBF5", "#D22FF3"], tactica: { rejilla: "rgba(255,255,255,.28)", rayo: "#FFFFFF" },
  cambios: { titulo: ["#FFF070", "#F8C020"], sale: "#D84040", entra: "#30B8D0", tabla: "rgba(8,40,22,.82)", borde: "#7AC89A", fila: "rgba(0,0,0,.38)", flechas: "#F7901E" },
  placa: { etiqueta: "#FFFFFF" },
};

// cada rotulo: el texto, lo que dura (s; el Director lo usa), su forma y su estilo
// (GX.rotulo). chico: los pequenos (el juego no se para por ellos)
const ROTULOS_GX = {
  saque:     { texto: "¡SAQUE!", dura: 1.6, forma: "banda", estilo: "saque" },
  fuera:     { texto: "Fuera de juego", dura: 1.35, forma: "deriva", estilo: "fuera", banderas: true },
  descanso:  { texto: "Descanso", dura: 0.9, forma: "aparece", estilo: "descanso" },
  reglamentario: { texto: "Fin del tiempo reglamentario", dura: 1.8, forma: "estelas", estilo: "final" },
  final:     { texto: "Fin del partido", dura: 3.2, forma: "estelas", estilo: "final" },
  victoria:  { texto: "¡Victoria!", dura: 1.1, forma: "lado", estilo: "victoria" },
  derrota:   { texto: "Derrota...", dura: 1.1, forma: "lado", estilo: "derrota" },
  empate:    { texto: "Empate", dura: 1.1, forma: "lado", estilo: "empate" },
  prorroga:  { texto: "¡Prórroga!", dura: 1.8, forma: "estelas", estilo: "final" },
  penaltis:  { texto: "¡Penaltis!", dura: 2.0, forma: "estelas", estilo: "final" },
  penalti:   { texto: "¡Penalti!", dura: 1.8, forma: "estelas", estilo: "final" },
  falta:     { texto: "¡Falta!", dura: 1.6, forma: "falta", estilo: "falta" },
  amarilla:  { texto: "¡Tarjeta amarilla!", dura: 1.6, forma: "tarjeta", estilo: "amarilla" },
  roja:      { texto: "¡Tarjeta roja!", dura: 1.6, forma: "tarjeta", estilo: "roja" },
  bloqueo:   { texto: "¡Bloqueo!", dura: 1.7, forma: "bloqueo", estilo: "bloqueo" },
  porEncima: { texto: "¡Por encima!", dura: 0.5, forma: "encima", estilo: "chico", chico: true },
  fueraTiro: { texto: "¡Fuera!", dura: 1.2, forma: "deriva", estilo: "fuera" },
  desviado:  { texto: "¡Desviado a córner!", dura: 1.2, forma: "deriva", estilo: "fuera" },
  tandaGol:  { texto: "¡Gol!", dura: 1.3, forma: "deriva", estilo: "tandaGol", chico: true },
  tandaParada: { texto: "¡Parada!", dura: 1.3, forma: "deriva", estilo: "tandaParada", chico: true },
  banda:     { texto: "Saque de banda", dura: 1.1, forma: "deriva", estilo: "chico", chico: true },
  corner:    { texto: "¡Córner!", dura: 1.1, forma: "deriva", estilo: "chico", chico: true },
  puerta:    { texto: "Saque de puerta", dura: 1.1, forma: "deriva", estilo: "chico", chico: true },
  tactica:   { texto: "¡Supertáctica!", dura: 1.0, forma: "tactica", estilo: "tactica" },
  // las invocaciones, con el color de su familia (O-310): sin parar el juego
  invoca:    { texto: "¡Invocación!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "keshin" },
  armadura:  { texto: "¡Armadura!", dura: 1.5, forma: "invoca", estilo: "armadura", familia: "armadura" },
  miximax:   { texto: "¡Miximax Trans!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "miximax" },
  totem:     { texto: "¡Tótem!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "totem" },
  despertar: { texto: "¡Despertar!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "despertar" },
  modo:      { texto: "¡Cambio de modo!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "modo" },
  vinculo:   { texto: "¡Vínculo!", dura: 1.5, forma: "invoca", estilo: "invoca", familia: "vinculo" },
  // el panel de los cambios (b43, t14)
  cambios:   { texto: "CAMBIOS", dura: 4.4, forma: "cambios" },
};

const Rotulos = {
  // lo ultimo pintado (para las pruebas): los textos de este cuadro
  vistos: [],
  // ctx: el HUD de abajo (en u, 320x240; HudAbajo ya lo limpio y pinto lo suyo). vista: la
  // de abajo (proyectar), para los rotulos que van encima de un jugador
  pintar(ctx, ctxArriba, estado, vista, p, yo) {
    this.vistos.length = 0;
    if (!ctx || !estado) return;
    const B = estado.abajo || {};
    if (B.modo === "negro") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 320, 240); }
    if (B.oscuro > 0) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, B.oscuro) + ")"; ctx.fillRect(0, 0, 320, 240); }
    if (B.estela && B.modo !== "negro" && vista && vista.proyectar) this._estela(ctx, B.estela, vista);
    if (B.placa && B.modo !== "negro") this._placa(ctx, B.placa, yo);
    for (const r of estado.rotulos || []) {
      this.vistos.push(r.texto);
      try { this._uno(ctx, r, vista, yo); } catch (e) { console.error(e); }
    }
    if (B.video) this._video(ctx);
    if (B.fundido > 0) { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, B.fundido) + ")"; ctx.fillRect(0, 0, 320, 240); }
  },

  _uno(ctx, r, vista, yo) {
    const d = ROTULOS_GX[r.que] || { forma: "deriva", estilo: "chico" };
    const f = this["_" + d.forma];
    if (f) f.call(this, ctx, r, d, vista, yo);
  },
  // el texto de un rotulo con su estilo (GX.rotulo), centrado en (x, y), de alto tam
  _texto(ctx, texto, x, y, tam, estilo, mas) {
    const R = GX.rotulo[estilo] || GX.rotulo.saque;
    return GX.texto(ctx, texto, x, y, Object.assign({ letra: "rotulo", tam, peso: 400, alinea: "center", degradado: R.relleno, contornos: R.contornos, sesgo: -8, ancho: 300 }, mas || {}));
  },
  _sub(ctx, texto, y, alfa) {
    if (!texto) return;
    ctx.save(); ctx.globalAlpha *= alfa === undefined ? 1 : alfa;
    GX.texto(ctx, texto, 160, y, { tam: 10, peso: 800, alinea: "center", color: "#FFFFFF", contornos: [["#0A1E3A", 1.3]], ancho: 290 });
    ctx.restore();
  },

  // "¡SAQUE!" (C'est parti, t13): la banda cian que se abre con un balon dibujado, el
  // texto que entra por la derecha grande y borroso, blanco que pasa a dorado; crece y se va
  _banda(ctx, r, d) {
    const t = r.t, abre = Math.max(0, Math.min(1, (t - 0.1) / 0.07)), alto = 10 + 55 * abre, y0 = 122 - alto / 2;
    if (t > 1.56) return;
    const crece = t > 1.3 ? 1.1 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 0.05);
    ctx.translate(160, 122); ctx.scale(crece, crece); ctx.translate(-160, -122);
    ctx.fillStyle = GX.vertical(ctx, y0, y0 + alto, GX_ROT.banda); ctx.fillRect(-20, y0, 360, alto);
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(-20, y0, 360, 1.4); ctx.fillRect(-20, y0 + alto - 1.4, 360, 1.4);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-20, y0 + 3.5, 360, 0.8); ctx.fillRect(-20, y0 + alto - 4.3, 360, 0.8);
    if (abre > 0.6) { ctx.globalAlpha *= 0.22; this._balon(ctx, 160, 122, 24, 0.4, true); ctx.globalAlpha /= 0.22; }
    if (t >= 0.17) {
      const k = Math.min(1, (t - 0.17) / 0.1), x = 160 + (1 - k) * 230, esc = 1.6 - 0.6 * k;
      ctx.save(); ctx.translate(x, 122); ctx.scale(esc, esc);
      if (k < 1) {
        // borroso al entrar: copias a los lados
        ctx.globalAlpha *= 0.35;
        for (const dx of [-8, 8]) this._texto(ctx, d.texto, dx, 0, 46, "saque");
        ctx.globalAlpha /= 0.35;
      }
      this._texto(ctx, d.texto, 0, 0, 46, "saque");
      // blanco brillante a +300 y pasa a dorado hasta +800
      const blanco = t < 0.3 ? 0.6 : t < 0.33 ? 1 : Math.max(0, 1 - (t - 0.33) / 0.47);
      if (blanco > 0) { ctx.globalAlpha *= blanco; GX.texto(ctx, d.texto, 0, 0, { letra: "rotulo", tam: 46, peso: 400, alinea: "center", color: "#FFFFFF", sesgo: -8, ancho: 300 }); }
      ctx.restore();
    }
    ctx.restore();
  },

  // "Fuera de juego" (t19) y los pequenos: entra por la derecha en 200 ms, deriva despacio
  // a la izquierda y sale por la izquierda en 150 ms. El de fuera de juego con sus
  // banderas a cuadros a los dos lados
  _deriva(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura, entra = Math.min(0.2, D * 0.18), sale = Math.min(0.15, D * 0.12);
    const tam = d.chico ? 26 : 38, y = d.chico ? 116 : 120;
    let x;
    if (t < entra) x = 160 + 10 + (1 - t / entra) * 320;
    else if (t < D - sale) x = 170 - 20 * (t - entra) / Math.max(0.01, D - sale - entra);
    else x = 150 - (t - (D - sale)) / sale * 340;
    ctx.save();
    const w = this._texto(ctx, d.texto, x, y, tam, d.estilo, { ancho: d.banderas ? 230 : 290 });
    if (d.banderas) {
      const im = GX.icono("bandera_fuera");
      if (GX.cargada(im)) for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(x + s * (w / 2 + 14), y); ctx.rotate(s * 0.25 + Math.sin(t * 9) * 0.15);
        ctx.drawImage(im, -13, -12, 26, 23); ctx.restore();
      }
    }
    if (r.sub && !d.chico) this._sub(ctx, r.sub, y + tam * 0.75, 1);
    else if (r.sub) this._sub(ctx, r.sub, y + 17, 1);
    ctx.restore();
  },

  // "Descanso" (t20): con transparencia en 270 ms y dos bandas verdes translucidas
  _aparece(ctx, r, d) {
    const a = Math.min(1, r.t / 0.27);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = GX_ROT.bandaDescanso; ctx.fillRect(0, 96, 320, 7); ctx.fillRect(0, 141, 320, 7);
    this._texto(ctx, d.texto, 160, 121, 42, d.estilo);
    if (r.sub) this._sub(ctx, r.sub, 157, 1);
    ctx.restore();
  },

  // "Fin del partido" (t21; tambien la prorroga, los penaltis y el penalti): de golpe con
  // estelas horizontales amarillas, y se va en 200 ms
  _estelas(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura, a = t > D - 0.2 ? Math.max(0, (D - t) / 0.2) : 1;
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = GX_ROT.estelas; ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const yy = 104 + i * 7 + (i % 2) * 2, l = 40 + ((i * 53) % 50), x0 = ((t * 260 + i * 97) % 380) - 40;
      ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.2; ctx.globalAlpha = a * 0.75;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + l, yy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(320 - x0, yy + 3); ctx.lineTo(320 - x0 - l, yy + 3); ctx.stroke();
    }
    ctx.globalAlpha = a;
    this._texto(ctx, d.texto, 160, 121, d.texto.length > 16 ? 30 : 40, d.estilo);
    if (r.sub) this._sub(ctx, r.sub, 145, 1);
    ctx.restore();
  },

  // "¡Victoria!" / "Derrota..." / "Empate": fundido de 100 ms, ~1 s
  _lado(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura;
    ctx.save(); ctx.globalAlpha = Math.min(1, t / 0.1, Math.max(0, (D - t) / 0.1));
    this._texto(ctx, d.texto, 160, 121, 44, d.estilo);
    ctx.restore();
  },

  // la falta [NO GALAXY, GO Light]: una banda roja con un silbato dibujado
  _falta(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura, k = Math.min(1, t / 0.15), a = Math.min(1, Math.max(0, (D - t) / 0.2));
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = GX.vertical(ctx, 96, 148, GX_ROT.falta); ctx.fillRect(0, 96, 320 * k, 52);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(0, 96, 320 * k, 1.4); ctx.fillRect(0, 146.6, 320 * k, 1.4);
    if (k >= 1) {
      this._silbato(ctx, 62, 118, t);
      this._texto(ctx, d.texto, 172, 117, 36, d.estilo, { ancho: 210 });
      if (r.sub) this._sub(ctx, r.sub, 139, 1);
    }
    ctx.restore();
  },
  _silbato(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3 + Math.sin(t * 30) * 0.05);
    ctx.fillStyle = "#E8ECF0"; ctx.strokeStyle = "#2A2A30"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(-2, -9, 18, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2A2A30"; ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  // las tarjetas [NO GALAXY]: la tarjeta dibujada entra girando, con el nombre debajo
  _tarjeta(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura, k = Math.min(1, t / 0.3), a = Math.min(1, Math.max(0, (D - t) / 0.2));
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 98, 320, 48);
    ctx.save(); ctx.translate(46, 121); ctx.rotate((1 - k) * -2.2 - 0.14); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
    ctx.fillStyle = r.que === "roja" ? GX_ROT.carta.roja : GX_ROT.carta.amarilla; ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 1.5;
    GX.redondo(ctx, -11, -16, 22, 32, 3); ctx.fill(); ctx.stroke();
    ctx.restore();
    this._texto(ctx, d.texto, 178, 115, 30, d.estilo, { ancho: 230 });
    if (r.sub) this._sub(ctx, r.sub, 137, 1);
    ctx.restore();
  },

  // "¡Bloqueo!" (t07, guia 8.5): estallidos de estrella desde las esquinas, franjas en
  // zigzag blanco-azul, el rotulo con rebote y arcos electricos; el oscurecido lo pone
  // el Director. Los tiempos, los de 1,7 s (se estiran o encogen a lo que dure)
  _bloqueo(ctx, r, d) {
    const D = r.dura || d.dura, t = r.t * 1.7 / D;
    if (t > 1.7) return;
    const sale = t > 1.67 ? Math.max(0, 1 - (t - 1.67) / 0.033) : 1, C = GX_ROT.bloqueo;
    ctx.save(); ctx.globalAlpha = sale;
    if (t >= 0.53 && t < 0.93) {
      const k = Math.min(1, (t - 0.53) / 0.12), f = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.13) : 1;
      ctx.save(); ctx.globalAlpha *= f;
      for (const [x, y, s] of [[64, 56, 1], [258, 196, 0.9]]) this._estrella(ctx, x, y, (24 + 30 * k) * s, t * 3 + x);
      ctx.restore();
    }
    if (t >= 0.6) {
      const k = Math.min(1, (t - 0.6) / 0.13);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 320 * k, 240); ctx.clip();
      for (const [y0, h] of [[66, 16], [150, 14]]) this._zigzag(ctx, y0, h, C);
      ctx.restore();
    }
    if (t >= 0.73) {
      const esc = t < 0.8 ? 0.6 + 0.6 * (t - 0.73) / 0.07 : t < 0.87 ? 1.2 - 0.2 * (t - 0.8) / 0.07 : 1;
      this._estrella(ctx, 160, 120, 96 * Math.min(1, esc), t * 2);
      ctx.save(); ctx.translate(160, 120); ctx.scale(esc, esc);
      this._texto(ctx, d.texto, 0, 0, 44, "bloqueo");
      ctx.restore();
      // arcos electricos (un azar de la pantalla: cambian cada cuadro)
      ctx.strokeStyle = C.rayo; ctx.lineWidth = 1.2; ctx.globalAlpha = sale * 0.85;
      for (let i = 0; i < 3; i++) {
        let x = 70 + Math.random() * 40, y = 95 + Math.random() * 50;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += 18 + Math.random() * 14; y += (Math.random() - 0.5) * 22; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  _estrella(ctx, x, y, r, giro) {
    const C = GX_ROT.bloqueo, n = 12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(giro * 0.2);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rr = i % 2 ? r * 0.42 : r; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = C.azul; ctx.globalAlpha *= 0.85; ctx.fill();
    ctx.scale(0.72, 0.72); ctx.fillStyle = C.estrella; ctx.fill();
    // el resplandor: blanco en el centro, cian y azul hacia fuera
    const g = ctx.createRadialGradient ? ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.9) : null;
    if (g && g.addColorStop) {
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(170,235,255,.9)"); g.addColorStop(1, "rgba(40,110,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
  _zigzag(ctx, y0, h, C) {
    ctx.beginPath(); ctx.moveTo(-10, y0);
    for (let x = -10, k = 0; x <= 340; x += 26, k++) ctx.lineTo(x, y0 + (k % 2 ? h : 0));
    for (let x = 340, k = 0; x >= -10; x -= 26, k++) ctx.lineTo(x, y0 + h + 9 + (k % 2 ? h : 0));
    ctx.closePath();
    ctx.save(); ctx.shadowColor = C.azul; ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.azul; ctx.lineWidth = 3; ctx.stroke();
  },

  // "¡Invocación!" (t15): espiral cian y magenta pequena, el texto pequeno dentro, a su
  // tamano a +200 ms, destellos, aguanta y se estira en horizontal al irse.
  // Semitransparente: el juego sigue debajo (O-307 p10)
  _invoca(ctx, r, d) {
    const t = r.t;
    if (t > 1.4) return;
    const esc = t < 0.13 ? 0.3 : t < 0.2 ? 0.5 + 0.5 * (t - 0.13) / 0.07 : 1;
    const estira = t > 1.33 ? 1 + (t - 1.33) / 0.07 * 1.5 : 1;
    const col = (typeof AURA_HIPER !== "undefined" && AURA_HIPER[d.familia]) ? AURA_HIPER[d.familia][1] : GX_ROT.espiral[0];
    const fuera = t > 1.33 ? Math.max(0, 1 - (t - 1.33) / 0.07) : 1;
    ctx.save();
    ctx.fillStyle = "rgba(0,10,20," + (0.45 * fuera * Math.min(1, t / 0.1)) + ")"; ctx.fillRect(0, 0, 320, 240);
    ctx.globalAlpha = 0.9 * fuera;
    ctx.translate(160, 120); ctx.scale(estira * esc, esc);
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const r = 150 - i * 16, a0 = t * 4 + i * 1.7;
      ctx.strokeStyle = i % 2 ? GX_ROT.espiral[1] : i === 2 ? col : GX_ROT.espiral[0]; ctx.lineWidth = 12 - i * 2;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.26, 0, a0, a0 + Math.PI * 1.45); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.26, 0, a0 + 0.2, a0 + Math.PI * 1.2); ctx.stroke();
    }
    ctx.restore();
    if (t >= 0.13) {
      ctx.save(); ctx.globalAlpha = 0.95 * fuera; ctx.translate(160, 120); ctx.scale(estira * esc, esc);
      this._texto(ctx, d.texto, 0, 0, 36, d.estilo);
      if (t >= 0.27 && t < 0.4) { ctx.globalAlpha *= 0.8; GX.texto(ctx, d.texto, 0, 0, { letra: "rotulo", tam: 36, peso: 400, alinea: "center", color: "#FFFFFF", sesgo: -8, ancho: 300 }); }
      ctx.restore();
    }
    if (r.sub && t > 0.2 && t < 1.33) this._sub(ctx, r.sub, 146, 0.95);
  },

  // "¡Supertáctica!" [NO GALAXY, CS]: la tactil se oscurece con una rejilla blanca, un
  // rayo la cruza y el rotulo rojo; el juego sigue
  _tactica(ctx, r, d) {
    const t = r.t, D = r.dura || d.dura, a = Math.min(1, t / 0.08, Math.max(0, (D - t) / 0.15));
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(0, 0, 320, 240);
    ctx.strokeStyle = GX_ROT.tactica.rejilla; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= 320; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, 240); }
    for (let y = 0; y <= 240; y += 20) { ctx.moveTo(0, y); ctx.lineTo(320, y); }
    ctx.stroke();
    const k = Math.min(1, t / 0.3);
    ctx.strokeStyle = GX_ROT.tactica.rayo; ctx.lineWidth = 3; ctx.lineJoin = "miter";
    ctx.beginPath(); ctx.moveTo(0, 30);
    const pts = [[70, 80], [60, 95], [150, 130], [140, 146], [320 * k, 210 * k]];
    for (const [x, y] of pts) if (x <= 320 * k + 1) ctx.lineTo(x, y);
    ctx.stroke();
    this._texto(ctx, d.texto, 160, 116, 36, d.estilo);
    if (r.sub) this._sub(ctx, r.sub, 142, 1);
    ctx.restore();
  },

  // "¡Por encima!" [PIZARRA]: pequeno, encima del defensa que salta la vaselina
  _encima(ctx, r, d, vista) {
    let x = 160, y = 90;
    if (vista && vista.proyectar && r.x !== undefined) {
      const q = vista.proyectar(r.x, r.y, (vista.alturaFigura || 4) + 1, {}), k = 320 / (vista.ancho || 320);
      if (!q.detras) { x = Math.max(50, Math.min(270, q.px * k)); y = Math.max(16, Math.min(220, q.py * k)); }
    }
    const esc = Math.min(1, 0.6 + r.t / 0.1);
    ctx.save(); ctx.translate(x, y); ctx.scale(esc, esc);
    this._texto(ctx, d.texto, 0, 0, 18, d.estilo);
    ctx.restore();
  },

  // el panel CAMBIOS (b43, t14): sube desde abajo (+200 la tabla por abajo, +300 en su
  // sitio, +400-500 el titulo, el escudo y el nombre), aguanta y baja en ~400 ms
  _cambios(ctx, r, d, vista, yo) {
    const t = r.t, D = r.dura || d.dura, C = GX_ROT.cambios;
    if (t < 0.2) return;
    const baja = t > D - 0.4 ? (t - (D - 0.4)) / 0.4 * 240 : 0;
    const tabla = t < 0.3 ? (0.3 - t) / 0.1 * 60 : 0, cab = t < 0.4 ? 999 : t < 0.5 ? (0.5 - t) / 0.1 * 40 : 0;
    const col = GX.color(r.lado, yo);
    ctx.save(); ctx.translate(0, baja);
    if (cab < 900) {
      ctx.save(); ctx.translate(0, cab);
      GX.texto(ctx, "CAMBIOS", 162, 22, { letra: "rotulo", tam: 13, peso: 400, alinea: "center", degradado: C.titulo, contornos: [["#3A2400", 1.2]] });
      ctx.fillStyle = col.base; ctx.fillRect(70, 60, 210, 8);
      GX.escudo(ctx, 48, 52, 38, 48, col, r.equipo || "");
      GX.texto(ctx, r.equipo || "", 162, 56, { tam: 17, peso: 900, alinea: "center", color: "#FFFFFF", contornos: [["#1A1A1A", 1.4]], ancho: 170 });
      ctx.restore();
    }
    ctx.translate(0, tabla);
    GX.redondo(ctx, 18, 85, 282, 95, 6); ctx.fillStyle = C.tabla; ctx.fill();
    ctx.strokeStyle = C.borde; ctx.lineWidth = 1.2; ctx.stroke();
    GX.redondo(ctx, 25, 90, 127, 10, 2); ctx.fillStyle = C.sale; ctx.fill();
    GX.redondo(ctx, 168, 90, 127, 10, 2); ctx.fillStyle = C.entra; ctx.fill();
    GX.texto(ctx, "Sale", 88.5, 95.3, { tam: 8, peso: 800, alinea: "center", color: "#FFFFFF" });
    GX.texto(ctx, "Entra", 231.5, 95.3, { tam: 8, peso: 800, alinea: "center", color: "#FFFFFF" });
    (r.filas || []).slice(0, 3).forEach((f, k) => {
      const y = 102 + k * 23;
      this._celdaCambio(ctx, 25, y, f.sale);
      this._celdaCambio(ctx, 168, y, f.entra);
      ctx.fillStyle = C.flechas;
      for (const dx of [0, 6]) { ctx.beginPath(); ctx.moveTo(155 + dx, y + 4); ctx.lineTo(160.5 + dx, y + 9); ctx.lineTo(155 + dx, y + 14); ctx.closePath(); ctx.fill(); }
    });
    ctx.restore();
  },
  _celdaCambio(ctx, x, y, j) {
    j = j || {};
    GX.redondo(ctx, x, y, 127, 18, 2); ctx.fillStyle = GX_ROT.cambios.fila; ctx.fill();
    const pos = GX.posicionCorta(j.posicion || "");
    GX.redondo(ctx, x + 1, y + 1, 13, 8, 1.5); ctx.fillStyle = GX.posicion[pos] || "#5A6B85"; ctx.fill();
    GX.texto(ctx, pos, x + 7.5, y + 5.2, { tam: 5.5, alinea: "center", color: "#FFFFFF", ancho: 12 });
    const el = { Fuego: "fuego", Viento: "viento", Bosque: "bosque", Montana: "montana" }[j.elemento];
    const ie = el ? GX.icono("elemento_" + el) : null;
    if (ie && GX.cargada(ie)) ctx.drawImage(ie, x + 2, y + 9.5, 11, 8);
    const im = GX.cara(j.cara);
    if (GX.cargada(im)) { ctx.save(); ctx.beginPath(); ctx.arc(x + 24, y + 9, 8, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(im, x + 15, y, 18, 18); ctx.restore(); }
    GX.texto(ctx, j.nombre || "?", x + 36, y + 9.5, { tam: 11.5, peso: 800, color: "#FFFFFF", contornos: [["rgba(0,0,0,.5)", 0.6]], ancho: 88 });
  },

  // la placa "Poder total N" del tiro en vuelo (b31): como la de arriba en pequeno, del
  // lado del que chuta (tuyo abajo a la izquierda, el rival a la derecha)
  _placa(ctx, pl, yo) {
    const der = pl.lado !== yo, col = GX.color(pl.lado, yo), y = 204;
    ctx.save();
    ctx.beginPath();
    if (der) { ctx.moveTo(320, y); ctx.lineTo(276, y); ctx.lineTo(262, y + 12); ctx.lineTo(270, y + 14); ctx.lineTo(254, y + 36); ctx.lineTo(320, y + 36); }
    else { ctx.moveTo(0, y); ctx.lineTo(44, y); ctx.lineTo(58, y + 12); ctx.lineTo(50, y + 14); ctx.lineTo(66, y + 36); ctx.lineTo(0, y + 36); }
    ctx.closePath();
    ctx.fillStyle = col.placa; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    GX.texto(ctx, "Poder total", der ? 316 : 4, y + 6, { tam: 6, peso: 800, alinea: der ? "right" : "left", color: GX_ROT.placa.etiqueta });
    GX.texto(ctx, pl.valor, der ? 314 : 6, y + 23, { letra: "cifras", tam: 17, peso: 700, alinea: der ? "right" : "left", degradado: GX.cifraGana, contornos: [[GX.cifraContorno, 1.2]], sesgo: -10 });
    ctx.restore();
  },

  // la estela del tiro en vuelo (guia 8.5, t09): del balon hacia atras por su trayecto,
  // cada vez mas fina, cian (o del color del elemento de la supertecnica), y un brillo en el
  // balon. Proyectada con la vista (3D o 2D), en u
  _estela(ctx, e, vista) {
    const k = 320 / (vista.ancho || 320), o = this._o || (this._o = {}), pts = this._pts || (this._pts = new Float32Array(20));
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const f = Math.max(0, e.k - i * 0.035);
      const q = vista.proyectar(e.x0 + (e.x1 - e.x0) * f, e.y0 + (e.y1 - e.y0) * f, 0.35 + Math.sin(Math.PI * f) * e.h, o);
      if (q.detras) break;
      pts[n * 2] = q.px * k; pts[n * 2 + 1] = q.py * k; n++;
    }
    if (n < 2) return;
    ctx.save(); ctx.lineCap = "round";
    for (let i = 1; i < n; i++) {
      const a = 1 - i / n;
      ctx.globalAlpha = 0.85 * a;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2 + 7 * a;
      ctx.beginPath(); ctx.moveTo(pts[i * 2 - 2], pts[i * 2 - 1]); ctx.lineTo(pts[i * 2], pts[i * 2 + 1]); ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1 + 2.5 * a;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(pts[0], pts[1], 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  // "Vídeo" arriba a la izquierda en la repeticion del gol (t12)
  _video(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.45)"; GX.redondo(ctx, 3, 3, 46, 13, 3); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(14, 9.5); ctx.lineTo(8, 13); ctx.closePath(); ctx.fill();
    GX.texto(ctx, "Vídeo", 17, 9.8, { tam: 8.5, peso: 800, color: "#FFFFFF" });
    ctx.restore();
  },

  // un balon de futbol dibujado (blanco con pentagonos negros); fantasma: solo la silueta
  _balon(ctx, x, y, r, giro, fantasma) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(giro || 0);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fantasma ? "rgba(255,255,255,.8)" : "#FFFFFF"; ctx.fill();
    ctx.lineWidth = Math.max(0.8, r * 0.06); ctx.strokeStyle = "#1A1A1A"; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = "#1A1A1A";
    const penta = (cx, cy, s) => { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * s, cy + Math.sin(a) * s); } ctx.closePath(); ctx.fill(); };
    penta(0, 0, r * 0.32);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; penta(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3); }
    ctx.restore();
    ctx.restore();
  },
};
