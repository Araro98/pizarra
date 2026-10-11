/* Los efectos de sonido de VR en el partido (NOTAS O-343). Aaron quiere las supertecnicas
   "exactamente las mismas que el vr" (y pidio las voces del juego, O-339).
   ievr/sonidos.py convierte en el PC de cada uno, desde SU juego (nunca se reparte), los efectos
   de cada evento del partido (/api/partido/sonido/<cue>.wav: PCM de 16 bits, mono, 24 kHz) y lo
   que lleva cada evento (sonido/eventos.json: el segundo y la cue de cada efecto). Aqui:
   - La precarga (O-329), como las voces: la pantalla de carga (partido-carga.js) pasa lo que dice
     el servidor (pedido) y llama a tick; cada cue se baja en cuanto esta convertida y se queda tal
     cual (Int16); la pantalla espera a que esten (avance).
   - Suenan, con mirar (desde Sonido.mirar, cada cuadro), con cada animacion de VR de arriba (las
     supertecnicas, la ★, invocar, transformarse y las jugadas sin tecnica, ev71) en el segundo en
     que los pone el juego, a su volumen de VR por SONIDOSVR.volumen (el de las voces: el mismo
     reparto que en VR, donde las voces van a 1 y los efectos a 0,45-0,65) y a la par que la
     animacion: si empieza tarde (las cortas) desde ahi, si va mas deprisa mas deprisa, si se para
     (esperando, en pausa) o se corta (el muro que no para, O-344) se apaga, y al acabar su cola
     suena un poco. Con la plantilla (este PC no tiene esa animacion), no: no irian a la par.
   - El partido: los silbatos, la patada y el publico del gol de VR en vez de los hechos con el
     navegador (partido-sonido.js los pide aqui y, si no estan, hace los suyos). La patada del
     tiro no suena si acaba de sonar una animacion de VR (el chute ya la lleva); el gol con sus
     animaciones de VR (la red y la celebracion) ya trae su silbato y su publico.
   - Con "Sonido" quitado no suena nada; online cada PC los suyos: nada va en la foto (el invitado
     ve el mismo plan del Director).
   Sin three ni modulos. */
"use strict";

const SONIDOSVR = {
  raiz: "/api/partido/sonido/",
  estado: "/api/partido/sonidos/estado",
  consulta: 700,           // ms entre preguntas al servidor mientras convierte
  volumen: 0.75,           // por el de cada cue en VR (como VOCES.volumen)
  pase: 0.7,               // la patada de un pase, mas floja que la de un tiro
  cola: 1.5,               // s que sigue sonando un efecto cuando su animacion acaba
  fundido: 0.12,           // s del fundido al apagar uno
  quieta: 0.15,            // s con la animacion quieta (en pausa o cortada) antes de apagar
  desfase: 0.3,            // s de desfase con la animacion antes de recolocarlo
  velocidad: [0.8, 1.25],  // a que velocidad sigue a la animacion como mucho (mas, se oiria raro)
  // los del partido de VR: los silbatos (sy0312..sy0317, el instrumento del partido normal; cual
  // es cual, por como suenan: uno largo, corto y largo, uno corto, uno medio, dos y tres), la
  // patada (una de 5 al azar; la 1.a, la mas fuerte, en los tiros) y el publico que celebra el
  // gol (el de las celebraciones de VR, ev71_100NN)
  silbatos: { saque: "sy0312", gol: "sy0313", falta: "sy0314", fuera: "sy0315", descanso: "sy0316", final: "sy0317" },
  patada: "sy0310",
  publico: "sy0330",
  golSilbato: 0.5,         // s tras empezar el gol, el silbato (como en VR: ev71_00010)
  golEspera: 0.25,         // s que se espera a ver si el gol sale con sus animaciones de VR
  patadaTras: 0.8,         // s tras una animacion de VR en que la patada del tiro no vuelve a sonar
};

const SonidosVR = {
  cues: new Map(),         // cue -> {estado: "cargando"|"listo"|"mal", variantes, bucle, pcm, fs, dur}
  eventos: null,           // {ev: [[segundo, cue]]} (sonido/eventos.json)
  necesarios: null,        // las cues de este partido (null: el servidor aun no lo sabe)
  srv: null,               // lo ultimo que ha dicho el servidor
  pedidoHecho: false,
  tocados: [],             // los ultimos que han sonado (para las pruebas): [cue, desde s]
  _sonando: [],
  _inst: null,             // la animacion de VR que se esta oyendo
  _ids: typeof WeakMap !== "undefined" ? new WeakMap() : null,
  _nId: 0,
  _t: 0,
  _consultando: false,
  _eventosPedidos: false,
  _eventosMal: false,
  _ultimoVR: -1e9,         // cuando sono por ultima vez un efecto de una animacion de VR
  _gol: null,              // el publico y el silbato del gol, si no salen con las de VR
  _patada: null,           // la del tiro, si no sale con su animacion de VR

  // el reloj (s): el de la pagina; las pruebas lo cambian
  ahora() { return Date.now() / 1000; },

  // --- la precarga ----------------------------------------------------------------------
  // lo que dice el servidor al pedir el partido (POST /api/partido/eventos/preparar: "sonidos");
  // sin el (un Pizarra de antes, sin juego) no hay nada que esperar
  pedido(v) {
    this.pedidoHecho = true;
    this.srv = v || null;
    this.necesarios = v && !v.error && v.necesarios ? new Set(v.necesarios) : null;
    // los de otro partido se sueltan (la memoria)
    if (this.necesarios) for (const c of [...this.cues.keys()]) if (!this.necesarios.has(c)) this.cues.delete(c);
    if (v) this.alEstado(v);
  },
  // como va la cola del servidor: lo convertido se baja
  alEstado(e) {
    if (!e) return;
    this.srv = Object.assign({}, this.srv || {}, e);
    if (e.necesarios && !this.srv.error) {
      this.necesarios = new Set(e.necesarios);
      for (const c of [...this.cues.keys()]) if (!this.necesarios.has(c)) this.cues.delete(c);
    }
    if (this.necesarios) {
      for (const [c, info] of Object.entries(e.hechos || {})) {
        if (!this.necesarios.has(c) || this.cues.has(c) || !info) continue;
        this.cues.set(c, { estado: "cargando", variantes: info.variantes || [], bucle: !!info.bucle });
        this._bajar(c);
      }
    }
    if (e.eventos && !this.eventos && !this._eventosPedidos) this._bajarEventos();
  },
  // cada cuadro de la pantalla de carga: si el servidor aun convierte, se le pregunta
  tick() {
    const ahora = Date.now();
    if (!this.pedidoHecho || this._consultando || ahora - this._t < SONIDOSVR.consulta || typeof fetch === "undefined") return;
    if (this._faltaServidor()) {
      this._consultando = true; this._t = ahora;
      fetch(SONIDOSVR.estado).then(r => (r.ok ? r.json() : null)).then(e => this.alEstado(e)).catch(() => {}).finally(() => { this._consultando = false; });
    }
  },
  _faltaServidor() {
    const s = this.srv;
    if (!s || s.error) return false;
    if (!this.necesarios) return true;
    const hechos = s.hechos || {}, sin = new Set(s.sin || []), mal = s.errores || {};
    return [...this.necesarios].some(c => !(c in hechos) && !sin.has(c) && !(c in mal)) || !s.eventos;
  },
  // -> {listos, total, listo}: las cues bajadas (o que no vendran) y eventos.json
  avance() {
    const s = this.srv;
    if (!this.pedidoHecho || !s || s.error) return { listos: 0, total: 0, listo: true };
    // (el servidor aun no sabe cuales: esta leyendo los guiones)
    if (!this.necesarios) return { listos: 0, total: 1, listo: false };
    const sin = new Set(s.sin || []), mal = s.errores || {};
    let listos = 0;
    for (const c of this.necesarios) {
      const x = this.cues.get(c);
      if (sin.has(c) || (c in mal) || (x && (x.estado === "listo" || x.estado === "mal"))) listos++;
    }
    listos += this.eventos || this._eventosMal ? 1 : 0;
    const total = this.necesarios.size + 1;
    return { listos, total, listo: listos >= total };
  },
  _bajar(c) {
    const x = this.cues.get(c);
    if (!x || typeof fetch === "undefined") return;
    fetch(SONIDOSVR.raiz + c + ".wav").then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(wav => {
        if (this.cues.get(c) !== x) return;
        const pcm = this.pcmDeWav(wav);
        if (!pcm) throw new Error("wav");
        x.pcm = pcm.datos; x.fs = pcm.fs; x.estado = "listo";
        x.dur = x.variantes.length ? x.variantes[0][1] / x.fs : 0;
      }).catch(() => { x.estado = "mal"; });
  },
  _bajarEventos() {
    if (typeof fetch === "undefined") return;
    this._eventosPedidos = true;
    fetch(SONIDOSVR.raiz + "eventos.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(j => { this.eventos = j.eventos || {}; }).catch(() => { this._eventosMal = true; });
  },
  // las muestras de un WAV PCM de 16 bits (el de ievr/sonidos.py): {datos: Int16Array, fs}
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
    } catch (e) { /* sin el */ }
    return null;
  },
  hay(c) { const x = this.cues.get(c); return !!(x && x.estado === "listo"); },

  // --- que suene --------------------------------------------------------------------------
  _ctx() {
    const S = typeof Sonido !== "undefined" ? Sonido : null;
    return S && S._listo && S._listo() ? S.ctx : null;
  },
  // la cue c desde `desde` s (su variante k; null: una al azar) a vol por su volumen de VR, a la
  // velocidad rate. -> lo que suena (para pararlo) o null
  tocar(c, desde = 0, vol = 1, k = 0, rate = 1) {
    const x = this.cues.get(c);
    if (!x || x.estado !== "listo" || !x.variantes.length) return null;
    const vs = x.variantes, i = k === null ? Math.floor(Math.random() * vs.length) : Math.min(k, vs.length - 1);
    const [ini, n, v] = vs[i], d0 = Math.max(0, Math.floor(desde * x.fs));
    if (d0 >= n) return null;
    this.tocados.push([c, Math.round(desde * 1000) / 1000]);
    if (this.tocados.length > 60) this.tocados.shift();
    const ctx = this._ctx();
    if (!ctx) return null;
    try {
      const m = n - d0, buf = ctx.createBuffer(1, m, x.fs), d = buf.getChannelData(0), pcm = x.pcm;
      for (let j = 0; j < m; j++) d[j] = pcm[ini + d0 + j] / 32768;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol * (v || 1);
      s.connect(g); g.connect(ctx.destination);
      const h = { c, s, g, t0: ctx.currentTime, desde: d0 / x.fs, rate, dur: n / x.fs, fin: false };
      s.onended = () => { h.fin = true; const q = this._sonando.indexOf(h); if (q >= 0) this._sonando.splice(q, 1); };
      this._sonando.push(h);
      s.start();
      return h;
    } catch (e) { return null; }
  },
  // lo apaga (con un fundido corto; `en` s mas tarde, si se dice)
  _parar(h, en = 0) {
    if (!h || h.fin) return;
    const ctx = this._ctx();
    h.fin = true;
    try {
      if (!ctx) { h.s.stop(); return; }
      const t = ctx.currentTime + en, F = SONIDOSVR.fundido;
      h.g.gain.setValueAtTime(h.g.gain.value, t);
      h.g.gain.linearRampToValueAtTime(0, t + F);
      h.s.stop(t + F + 0.02);
    } catch (e) { /* ya acabado */ }
  },
  // por donde va (s del audio) lo que suena
  _pos(h) { const ctx = this._ctx(); return ctx ? h.desde + (ctx.currentTime - h.t0) * h.rate : h.desde; },

  // --- cada cuadro (desde Sonido.mirar) -----------------------------------------------------
  mirar(p) {
    const D = typeof Director !== "undefined" ? Director : null, A = D && D.estado ? D.estado.arriba : null;
    const tr = A && A.tramo, es = A && A.escena, ahora = this.ahora();
    // (mientras se espera la de VR no hay ninguna: lo que sonaba se apaga y vuelve desde su
    // principio cuando esta; si se espera un momento a media animacion, en el mismo tramo, como en
    // pausa: sigue donde iba)
    const espera = !!(es && es.esperaVR);
    const vr = tr && es && !espera && es.vr && es.vr.evento ? es.vr : null;
    const clave = vr ? this._clave(tr, vr) : "";
    let I = this._inst;
    if (I && !vr && espera && I.tr === tr) { this._seguir(I, I.t, ahora, null); this._mirarPatada(ahora); this._mirarGol(ahora); return; }
    if (I && I.clave !== clave) { this._acabar(I, ahora); I = this._inst = null; }
    if (vr) {
      if (!I) I = this._inst = this._programa(vr, clave, ahora);
      I.tr = tr;
      this._seguir(I, vr.t, ahora, tr);
    }
    this._mirarPatada(ahora);
    this._mirarGol(ahora);
  },
  _id(o) {
    if (!o || typeof o !== "object" || !this._ids) return 0;
    if (!this._ids.has(o)) this._ids.set(o, ++this._nId);
    return this._ids.get(o);
  },
  // cual es: la invocacion, o el resultado (al fijar y en la vuelta se sigue viendo la animacion de
  // su tramo: es la misma), y la animacion (en el gol, la red y la celebracion van en el mismo tramo)
  _clave(tr, vr) {
    const base = tr.que === "invoca" ? "i" + tr.t0 + "|" + tr.jugador : tr.res ? "r" + this._id(tr.res) : "t" + this._id(tr);
    return base + "#" + vr.clave;
  },
  // lo que lleva esa animacion: [{s, c}] (el keshin o el alma, el suyo)
  _programa(vr, clave, ahora) {
    const lista = (this.eventos && this.eventos[vr.evento]) || [];
    const items = [];
    for (const [s, c0] of lista) {
      const c = c0.indexOf("<ASSIGN_SND>") >= 0 ? (vr.asignado ? c0.replace("<ASSIGN_SND>", vr.asignado) : "") : c0;
      if (c) items.push({ s, c, h: null, fin: false });
    }
    return { clave, ev: vr.evento, D: this._duracion(vr), items, t: vr.t, quieto: ahora, rate: 1, anc: null };
  },
  // lo que dura la animacion de VR (la que tiene Escenas leida), o 0
  _duracion(vr) {
    const E = typeof Consola !== "undefined" && Consola._modulos ? Consola._modulos.Escenas : null;
    try { const e = E && E._vrEv ? E._vrEv.get(vr.clave) : null; return e && e.ev ? +e.ev.duracion || 0 : 0; } catch (e) { return 0; }
  },
  // cada cuadro de una animacion de VR, en su segundo t
  _seguir(I, t, ahora, tr) {
    // (vuelve atras: la de VR sale otra vez desde su principio tras esperarla)
    if (t < I.t - 0.25) { for (const x of I.items) { this._parar(x.h); x.h = null; x.fin = false; x.reanudar = null; } I.anc = null; }
    if (t !== I.t) I.quieto = ahora;
    // a que velocidad va (las cortas, mas deprisa): lo que avanza su segundo con el tiempo de su
    // tramo (los dos del Director: sin el baile de los cuadros de este PC), desde que empieza. Si no
    // va a 1, el efecto tambien, pero como mucho de 0,8 a 1,25 (mas, se oiria raro: se queda atras)
    const A = I.anc, tt = tr && typeof tr.t === "number" ? tr.t : null, V = SONIDOSVR.velocidad;
    if (tt === null || !A || A.tr !== tr || t < A.t) I.anc = tt === null ? null : { tr, t, tt };
    else if (t !== I.t && tt - A.tt >= 0.4) { const v = (t - A.t) / (tt - A.tt); I.rate = Math.abs(v - 1) < 0.1 ? 1 : Math.max(V[0], Math.min(V[1], v)); I.atras = I.rate === v || I.rate === 1 ? 0 : 1; }
    // quieta: en pausa o cortada (se apaga, y sigue donde iba si vuelve a andar); al fijar en su
    // ultimo cuadro, que acabe
    const quieta = ahora - I.quieto > SONIDOSVR.quieta, alFinal = I.D > 0 && t >= I.D - 0.1;
    for (const x of I.items) {
      const info = this.cues.get(x.c);
      if (!info || info.estado !== "listo") continue;
      const pos = t - x.s;
      if (x.h && x.h.fin) { x.fin = true; x.h = null; }
      if (x.h) {
        const real = this._pos(x.h), d = real - pos;
        if (quieta) { if (!alFinal) { this._parar(x.h); x.h = null; x.reanudar = real; } continue; }
        if (Math.abs(x.h.rate - I.rate) < 0.05 && d <= SONIDOSVR.desfase && d >= -SONIDOSVR.desfase - (I.atras || 0)) continue;
        // (por delante: un paron de este PC deja atras la animacion (el reloj del partido no corre
        // entero); se calla hasta que llegue ahi, sin repetir lo que ya ha sonado. Por detras, o a otra
        // velocidad: desde donde va)
        this._parar(x.h); x.h = null;
        if (d > SONIDOSVR.desfase) x.reanudar = real;
      }
      // (cada una en su fotograma, como las voces)
      if (quieta || x.fin || pos < -0.002 || pos >= info.dur - 0.05) continue;
      if (x.reanudar !== undefined && x.reanudar !== null) { if (pos < x.reanudar - 0.02) continue; x.reanudar = null; }
      x.h = this.tocar(x.c, pos < 0.06 ? 0 : pos, SONIDOSVR.volumen, 0, I.rate);
      if (!x.h) x.fin = true;
    }
    if (I.items.some(x => x.h)) this._ultimoVR = ahora;
    I.t = t;
  },
  // la animacion se va: si no llego al final (cortada, o se paso a otra) o es un ambiente en
  // bucle, se apaga; si no, su cola suena un poco
  _acabar(I, ahora) {
    const cortada = I.D > 0 && I.t < I.D - 0.25;
    for (const x of I.items) {
      if (!x.h) continue;
      const info = this.cues.get(x.c);
      this._parar(x.h, cortada || (info && info.bucle) ? 0 : SONIDOSVR.cola);
      this._ultimoVR = ahora;
    }
  },

  // --- el partido (los pide partido-sonido.js: si estan, true y no hace los suyos) --------------
  silbato(veces = 1, largo = 0.32) {
    const S = SONIDOSVR.silbatos;
    const c = veces >= 3 ? S.final : veces === 2 ? S.descanso : largo >= 0.38 ? S.falta : largo <= 0.25 ? S.fuera : S.saque;
    if (!this.hay(c)) return false;
    this.tocar(c, 0, SONIDOSVR.volumen);
    return true;
  },
  // la de un tiro se mira en el cuadro siguiente (mirar): el chute con su animacion de VR ya la lleva
  patada(fuerte) {
    if (!this.hay(SONIDOSVR.patada)) return false;
    if (fuerte) this._patada = { t: this.ahora() };
    else this.tocar(SONIDOSVR.patada, 0, SONIDOSVR.volumen * SONIDOSVR.pase, null);
    return true;
  },
  _mirarPatada(ahora) {
    if (!this._patada) return;
    this._patada = null;
    if (this._inst || ahora - this._ultimoVR < SONIDOSVR.patadaTras) return;
    this.tocar(SONIDOSVR.patada, 0, SONIDOSVR.volumen, 0);
  },
  // el gol: si no sale con sus animaciones de VR (que traen su silbato y su publico), los de VR
  // un poco despues (mirar)
  gol(mio) {
    if (!this.hay(SONIDOSVR.publico)) return false;
    this._gol = { t: this.ahora(), silbato: false, publico: false, mio };
    return true;
  },
  _mirarGol(ahora) {
    const G = this._gol;
    if (!G) return;
    const d = ahora - G.t;
    if (d < SONIDOSVR.golEspera) {
      if (this._inst && /^ev71_(000|100)/.test(this._inst.ev)) this._gol = null;
      return;
    }
    if (!G.publico) { G.publico = true; this.tocar(SONIDOSVR.publico, 0, SONIDOSVR.volumen); }
    if (!G.silbato && d >= SONIDOSVR.golSilbato) { G.silbato = true; this.tocar(SONIDOSVR.silbatos.gol, 0, SONIDOSVR.volumen); }
    if (G.silbato) this._gol = null;
  },
};
if (typeof window !== "undefined") window.SonidosVR = SonidosVR;
