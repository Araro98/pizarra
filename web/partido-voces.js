/* Las voces de VR en el partido (NOTAS O-339). Aaron: "también añade voces del juego, cuando
   hacen una supertecnica, hay personajes que tienen lineas de voz en esas tecnicas, y en
   general, ya que son suyas del anime".
   ievr/voces.py convierte en el PC de cada uno, desde SU juego (nunca se reparte), el banco de
   voz de cada personaje del partido (/api/partido/voz/<idioma>/<banco>.json y .wav: PCM de 16
   bits, mono, 24 kHz) y las voces de cada animacion de VR (voces/eventos.json: el segundo, la
   linea y quien la dice). Aqui:
   - La precarga (O-329): la pantalla de carga (partido-carga.js) pasa lo que dice el servidor
     (pedido) y llama a tick; cada banco se baja en cuanto esta convertido y se queda tal cual
     (Int16, 0,5-1 MB por personaje); la pantalla espera a que esten (avance).
   - Suenan, con mirar (desde Sonido.mirar, cada cuadro):
     * en cada animacion de VR (supertecnicas, la ★, invocar y transformarse) en el segundo en que
       las pone el juego, cada una en el banco de su actor (el que la hace, el rival, los
       companeros; la del keshin o el alma la dice el que lo invoca). Con la plantilla (este PC
       no tiene esa animacion), igual, con el tiempo de su tramo;
     * sin supertecnica, las de las jugadas del partido de VR (eventos ev71): el que chuta
       (sh010), el portero que para (kp020), despeja (kp030) o encaja (sp150), el que bloquea
       (bt070), el que gana un duelo (regate bt060, robo bt070) y el que lo pierde (sp150), una de
       gol del que marca y el pase (pa010; no todos: como mucho uno cada VOCES.pase s).
   - Con "Sonido" quitado no suena nada (Sonido._listo); online, cada PC las suyas: nada va en la
     foto (el invitado ve el mismo plan del Director).
   - Si un personaje no tiene voz para algo (no esta en su banco, o no tiene banco), no suena nada.
   Sin three ni modulos. */
"use strict";

const VOCES = {
  raiz: "/api/partido/voz/",
  estado: "/api/partido/voces/estado",
  consulta: 700,           // ms entre preguntas al servidor mientras convierte
  volumen: 0.75,
  aLaVez: 4,               // voces sonando a la vez como mucho (se corta la mas vieja)
  pase: { cada: 3, cadaJugador: 8 },   // s: como mucho una voz de pase cada tanto
  // las lineas sin supertecnica (en que punto de su tramo, 0..1): como en los eventos ev71 de VR
  sin: { tiro: 0.45, portero: 0.4, encaja: 0.55, muro: 0.35, gana: 0.35, pierde: 0.6 },
  gol: 0.9,                // s tras empezar el gol, la del que marca
};

const Voces = {
  bancos: new Map(),       // banco -> {idioma, estado: "cola"|"cargando"|"listo"|"mal", lineas, pcm, fs}
  eventos: null,           // {ev: [[segundo, linea, quien]]} (voces/eventos.json)
  necesarios: new Set(),   // los bancos de este partido
  srv: null,               // lo ultimo que ha dicho el servidor
  pedidoHecho: false,
  dichas: [],              // las ultimas que han sonado (para las pruebas)
  _sonando: [],
  _inst: null,             // la animacion (o el tramo) que se esta oyendo
  _ids: typeof WeakMap !== "undefined" ? new WeakMap() : null,
  _nId: 0,
  _pase: null,
  _pases: {},
  _t: 0,
  _consultando: false,
  _eventosPedidos: false,

  // --- la precarga ----------------------------------------------------------------------
  // lo que dice el servidor al pedir el partido (POST /api/partido/eventos/preparar: "voces");
  // sin el (un Pizarra de antes, sin juego) no hay nada que esperar
  pedido(v) {
    this.pedidoHecho = true;
    this.necesarios = new Set();
    if (v && !v.error && v.bancos) for (const b of Object.values(v.bancos)) if (b) this.necesarios.add(b);
    // los de otro partido se sueltan (la memoria)
    for (const b of [...this.bancos.keys()]) if (!this.necesarios.has(b)) this.bancos.delete(b);
    this.srv = v || null;
    if (v) this.alEstado(v);
  },
  // como va la cola del servidor: lo convertido se baja
  alEstado(e) {
    if (!e) return;
    this.srv = Object.assign({}, this.srv || {}, e);
    for (const [b, idioma] of Object.entries(e.hechos || {})) {
      if (!this.necesarios.has(b)) continue;
      const x = this.bancos.get(b);
      if (!x) { this.bancos.set(b, { idioma, estado: "cola" }); this._bajar(b); }
    }
    if (e.eventos && !this.eventos && !this._eventosPedidos) this._bajarEventos();
  },
  // cada cuadro de la pantalla de carga: si el servidor aun convierte, se le pregunta
  tick() {
    const ahora = Date.now();
    if (!this.pedidoHecho || this._consultando || ahora - this._t < VOCES.consulta || typeof fetch === "undefined") return;
    if (this._faltaServidor()) {
      this._consultando = true; this._t = ahora;
      fetch(VOCES.estado).then(r => (r.ok ? r.json() : null)).then(e => this.alEstado(e)).catch(() => {}).finally(() => { this._consultando = false; });
    }
  },
  _faltaServidor() {
    const s = this.srv;
    if (!s || s.error) return false;
    const hechos = s.hechos || {}, sin = new Set(s.sin || []), mal = s.errores || {};
    const banco = [...this.necesarios].some(b => !(b in hechos) && !sin.has(b) && !(b in mal));
    return banco || (!s.eventos && !mal.eventos);
  },
  // -> {listos, total, listo}: los bancos bajados (o que no vendran) y eventos.json
  avance() {
    if (!this.pedidoHecho) return { listos: 0, total: 0, listo: true };
    const s = this.srv || {}, sin = new Set(s.sin || []), mal = s.errores || {};
    if (!s || s.error || !this.necesarios.size) return { listos: 0, total: 0, listo: true };
    let listos = 0;
    for (const b of this.necesarios) {
      const x = this.bancos.get(b);
      if (sin.has(b) || (b in mal) || (x && (x.estado === "listo" || x.estado === "mal"))) listos++;
    }
    const ev = !!this.eventos || !!mal.eventos || this._eventosMal;
    const total = this.necesarios.size + 1;
    listos += ev ? 1 : 0;
    return { listos, total, listo: listos >= total };
  },
  _bajar(b) {
    const x = this.bancos.get(b);
    if (!x || typeof fetch === "undefined") return;
    x.estado = "cargando";
    const url = VOCES.raiz + x.idioma + "/" + b;
    Promise.all([fetch(url + ".json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
                 fetch(url + ".wav").then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })])
      .then(([j, wav]) => {
        if (this.bancos.get(b) !== x) return;
        const pcm = this.pcmDeWav(wav);
        if (!pcm) throw new Error("wav");
        x.lineas = j.lineas || {}; x.fs = pcm.fs || j.fs || 24000; x.pcm = pcm.datos; x.estado = "listo";
      }).catch(() => { x.estado = "mal"; });
  },
  _bajarEventos() {
    if (typeof fetch === "undefined") return;
    this._eventosPedidos = true;
    fetch(VOCES.raiz + "eventos.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(j => { this.eventos = j.eventos || {}; }).catch(() => { this._eventosMal = true; });
  },
  // las muestras de un WAV PCM de 16 bits (el de ievr/voces.py): {datos: Int16Array, fs}
  pcmDeWav(buf) {
    try {
      const v = new DataView(buf);
      if (v.getUint32(0, false) !== 0x52494646 || v.getUint32(8, false) !== 0x57415645) return null;
      let p = 12, fs = 24000;
      while (p + 8 <= v.byteLength) {
        const id = v.getUint32(p, false), n = v.getUint32(p + 4, true);
        if (id === 0x666d7420) { fs = v.getUint32(p + 12, true); if (v.getUint16(p + 22, true) !== 16) return null; }
        else if (id === 0x64617461) return { datos: new Int16Array(buf.slice(p + 8, p + 8 + (n & ~1))), fs };
        p += 8 + n + (n & 1);
      }
    } catch (e) { /* sin voz */ }
    return null;
  },

  // --- quien dice que -------------------------------------------------------------------
  // el banco de un codigo de modelo o de una cara ("c01000010_5000", "c01000010_cuerpo+..."):
  // la voz va con la cara (ievr/voces.banco_de)
  banco(cod) { const m = /c\d{8}/.exec(cod || ""); return m ? m[0] : ""; },
  // el de un jugador: el de su forma con la hiper puesta (el personaje del modo), si tiene voz;
  // si no, el suyo
  bancoDe(j) {
    if (!j) return "";
    const f = this.banco(j.modelo), b = this.banco((j.propio && j.propio.cara) || j.cara);
    return f && f !== b && this._tiene(f) ? f : b;
  },
  _tiene(b) { const x = this.bancos.get(b); return !!(x && x.estado === "listo"); },
  hay(b, linea) { const x = this.bancos.get(b); return !!(x && x.estado === "listo" && x.lineas[linea] && x.lineas[linea].length); },

  // --- que suene --------------------------------------------------------------------------
  _ctx() {
    const S = typeof Sonido !== "undefined" ? Sonido : null;
    return S && S._listo && S._listo() ? S.ctx : null;
  },
  // la linea `linea` del banco `b` (una de sus variantes al azar). -> si ha sonado
  decir(b, linea) {
    if (!b || !linea || !this.hay(b, linea)) return false;
    const x = this.bancos.get(b), vs = x.lineas[linea], [ini, n] = vs[Math.floor(Math.random() * vs.length)];
    this.dichas.push([b, linea]);
    if (this.dichas.length > 60) this.dichas.shift();
    const c = this._ctx();
    if (!c || !(n > 0)) return false;
    try {
      const buf = c.createBuffer(1, n, x.fs), d = buf.getChannelData(0), pcm = x.pcm;
      for (let i = 0; i < n; i++) d[i] = pcm[ini + i] / 32768;
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = buf; g.gain.value = VOCES.volumen;
      s.connect(g); g.connect(c.destination);
      // como mucho VOCES.aLaVez: se corta la mas vieja
      while (this._sonando.length >= VOCES.aLaVez) { const v = this._sonando.shift(); try { v.stop(); } catch (e) { /* ya acabada */ } }
      this._sonando.push(s);
      s.onended = () => { const k = this._sonando.indexOf(s); if (k >= 0) this._sonando.splice(k, 1); };
      s.start();
      return true;
    } catch (e) { return false; }
  },

  // --- cada cuadro (desde Sonido.mirar) -----------------------------------------------------
  mirar(p) {
    if (!p) return;
    const D = typeof Director !== "undefined" ? Director : null, A = D && D.estado ? D.estado.arriba : null;
    this._mirarTramo(p, A);
    this._mirarPase(p);
  },
  _id(o) {
    if (!o || typeof o !== "object" || !this._ids) return 0;
    if (!this._ids.has(o)) this._ids.set(o, ++this._nId);
    return this._ids.get(o);
  },
  // la animacion de arriba de este cuadro: la de VR (su segundo), la plantilla de una
  // supertecnica o invocacion (el de su tramo) o un tramo sin tecnica, con lo que se dice en
  // ella; y lo que toca decir desde el cuadro anterior
  _mirarTramo(p, A) {
    const tr = A && A.tramo, es = A && A.escena;
    if (!tr || (es && es.esperaVR)) { if (!tr) this._inst = null; return; }
    const clave = tr.que === "invoca" ? "i" + tr.t0 + "|" + tr.jugador : tr.res ? "r" + this._id(tr.res) + "|" + tr.k : "";
    if (!clave) { this._inst = null; return; }
    const vr = es && es.vr && es.vr.evento ? es.vr : null;
    let I = this._inst;
    if (!I || I.clave !== clave || (vr && I.clave2 !== vr.clave)) {
      I = this._inst = this._programa(p, tr, vr, clave);
      if (!I) return;
    }
    if (!I.lista.length) return;
    const t = vr ? vr.t : tr.t + I.desfase;
    // (vuelve atras: la de VR sale otra vez desde su principio tras esperarla)
    if (t < I.ultimo - 0.25) I.ultimo = t - 0.05;
    // (los segundos de eventos.json van redondeados al milesimo: cada una en su fotograma)
    for (const x of I.lista) if (x[0] - 0.002 > I.ultimo && x[0] - 0.002 <= t) this._decirDe(p, I, x);
    I.ultimo = Math.max(I.ultimo, t);
  },
  // que se dice en este tramo: [[segundo, linea, quien]] y de quien es cada "quien"
  _programa(p, tr, vr, clave) {
    const I = { clave, clave2: vr ? vr.clave : "", lista: [], quien: {}, asignado: "", ultimo: 0, desfase: 0 };
    const ev = vr ? vr.evento : null;
    if (vr) {
      // los actores, de la clave de la animacion (partido-escenas claveVR: evento|s00,s01..|asignado)
      const partes = String(vr.clave || "").split("|"), cods = (partes[1] || "").split(",");
      cods.forEach((c, i) => { I.quien["s" + String(i).padStart(2, "0")] = this.banco(c); });
      I.asignado = partes[2] || "";
      this._formaS00(p, tr, I);
      I.lista = (this.eventos && this.eventos[ev]) || [];
      I.ultimo = vr.t - 0.05;
      return I;
    }
    if (tr.que === "tecnica" || tr.que === "hiper" || tr.que === "invoca") {
      // la plantilla: lo mismo que su animacion de VR, con el tiempo del tramo (las cortas, su final)
      const info = this._info(p, tr);
      if (info && info.evento) {
        for (const [k, c] of Object.entries(info.actores || {})) I.quien[k] = this.banco(c);
        I.asignado = info.asignado || "";
        this._formaS00(p, tr, I);
        I.lista = (this.eventos && this.eventos[info.evento]) || [];
        const seg = this._segundos(info.evento);
        I.desfase = seg > 0 ? Math.max(0, seg - (tr.dura || seg)) : 0;
      }
      I.ultimo = tr.t + I.desfase - 0.05;
      return I;
    }
    // sin supertecnica: las de las jugadas de VR (ev71)
    const R = tr.res, r = R && R.r, q = tr.q, dura = tr.dura || 1, S = VOCES.sin;
    const J = id => (id !== undefined && id !== null ? p.jugadores[id] : null);
    const pon = (k, linea, j) => { if (j) { const n = "j" + j.id; I.quien[n] = this.bancoDe(j); I.lista.push([k, linea, n]); } };
    // (la accion normal del que gana a una tecnica, "fallo", como sin tecnica: O-336)
    if ((tr.que === "sinTecnica" || tr.que === "fallo") && r && q) {
      const j = J(q.jugador);
      if (q.sub === "tiro") pon(S.tiro * dura, "sh010", j);
      else if (q.sub === "muro") pon(S.muro * dura, "bt070", j);
      else if (q.sub === "portero") {
        const paso = (r.pasos || [])[q.paso !== undefined ? q.paso : (r.pasos || []).length - 1] || {};
        if (r.final === "gol") pon(S.encaja * dura, "sp150", j);
        else pon(S.portero * dura, /despej/i.test(paso.que || "") ? "kp030" : "kp020", j);
      } else if (q.sub === "foco") {
        const gana = J(r.ganador), pierde = gana && gana.id === r.atacante ? J(r.defensor) : J(r.atacante);
        if (gana) pon(S.gana * dura, gana.id === r.atacante ? "bt060" : "bt070", gana);
        if (pierde && gana) pon(S.pierde * dura, "sp150", pierde);
      }
    } else if (tr.que === "gol" && r) {
      const ps = r.pasos || [], tir = J(r.tirador !== undefined ? r.tirador : (ps[0] || {}).quien);
      const b = this.bancoDe(tir), x = this.bancos.get(b);
      const goles = x && x.lineas ? Object.keys(x.lineas).filter(k => /^gl0\d\d$/.test(k)) : [];
      if (tir && goles.length) pon(VOCES.gol, goles[Math.floor(Math.random() * goles.length)], tir);
    }
    I.lista.sort((a, b) => a[0] - b[0]);
    I.ultimo = tr.t - 0.05;
    return I;
  },
  // en la invocacion s00 es el jugador como era (el s01, en lo que se convierte)
  _formaS00(p, tr, I) {
    if (I.quien.s00) return;
    const q = tr.q, j = p.jugadores[q && q.jugador !== undefined ? q.jugador : tr.jugador];
    if (j) I.quien.s00 = this.banco((j.propio && j.propio.cara) || j.cara);
  },
  // la animacion de VR que llevaria este tramo (la misma que elige Escenas)
  _info(p, tr) {
    const E = typeof Consola !== "undefined" && Consola._modulos ? Consola._modulos.Escenas : null;
    if (!E || !E.vr) return null;
    try {
      if (tr.que === "invoca") { const j = p.jugadores[tr.jugador]; return j && E._vrInfoInvoca ? E._vrInfoInvoca(p, tr, j) : null; }
      return tr.res && tr.res.plan && E._vrInfosPlan ? E._vrInfosPlan(p, tr.res)[tr.k] : null;
    } catch (e) { return null; }
  },
  // lo que dura una animacion de VR (las tablas que manda el servidor: tecnicas y espiritus)
  _segundos(ev) {
    const V = typeof Carga !== "undefined" && Carga.vr ? Carga.vr : null;
    if (!V) return 0;
    for (const t of Object.values(V.tecnicas || {})) if (t.evento === ev || t.evento_fallo === ev) return +t.segundos || 0;
    for (const t of Object.values(V.espiritus || {})) if (t.evento === ev) return +t.segundos || 0;
    return 0;
  },
  _decirDe(p, I, x) {
    const [, linea, quien] = x;
    if (quien === "a") {
      // la del keshin o el alma (<ASSIGN_SND>_inc): la dice el que lo invoca
      if (!I.asignado) return;
      this.decir(I.quien.s00, linea.replace("<ASSIGN_SND>", I.asignado));
      return;
    }
    this.decir(I.quien[quien], linea);
  },
  // el pase en juego: el que pasa (pa010), no todos
  _mirarPase(p) {
    const b = p.balon, pase = b && b.pase ? b.pase.de + ":" + b.pase.a + ":" + b.pase.destino.x + ":" + b.pase.destino.y : "";
    const antes = this._pase;
    this._pase = pase;
    if (!pase || pase === antes || p.fase !== "juego" || antes === null) return;
    const t = Date.now() / 1000, j = p.jugadores[b.pase.de];
    if (!j || t - (this._pases.todos || 0) < VOCES.pase.cada || t - (this._pases[j.id] || 0) < VOCES.pase.cadaJugador) return;
    if (this.decir(this.bancoDe(j), "pa010")) { this._pases.todos = t; this._pases[j.id] = t; }
  },
};
if (typeof window !== "undefined") window.Voces = Voces;
