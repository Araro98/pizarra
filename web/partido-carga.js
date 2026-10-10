/* La pantalla de carga del partido (NOTAS O-329). Aaron: "no he visto las animaciones de las
   supertecnicas, me salian las estandar ... que todo cargue al iniciar el partido".
   - En cuanto se saben los dos equipos (al elegirlos) se piden al servidor, que convierte en
     segundo plano desde el juego de este PC (ievr/modelos3d.py) los modelos de los 22 y del
     banquillo, sus formas (modo, armadura, mixi max, keshin, alma, el aura del campo) y las
     animaciones de VR de todas sus supertecnicas (tambien las de las formas) y de sus
     espiritus, y los rotulos. Sin limites que dejen algo fuera.
   - Al empezar el partido, antes del primer saque, la pantalla de carga en las dos pantallas:
     "Preparando el partido" con lo que va de verdad (Modelos 3D x de N, Animaciones de VR x de
     N y la barra). La pagina baja los modelos a su cache y lee, sube a la grafica y compila las
     animaciones fijas (Escenas.avancePrecarga: las que en el partido no tendrian tiempo de
     leerse); las demas se leen al empezar cada duelo. No se juega hasta que esta todo.
   - Online cada PC convierte y carga lo suyo y el partido no empieza hasta que estan los dos
     (mensaje "carga" con el %; REGLAS.VERSION 14): "Esperando a X: 45 %".
   - Si este Pizarra no sabe convertir las animaciones (un .exe de antes: la ruta de los eventos
     da 404) o no esta el juego, lo dice y se juega con las plantillas (tras pulsar Seguir).
   Sin three ni modulos: arriba lo pinta Arriba.pintarCarga (partido.js) y abajo su DOM. */
"use strict";

const CARGA = {
  consulta: 700,      // ms entre las preguntas al servidor por como va su cola
  anticipo: 700,      // ms tras elegir un equipo hasta pedirlo (se cambia de equipo deprisa)
  red: 1000,          // ms entre los mensajes de como vas al rival (online)
  pinta: 100,         // ms entre repintados de la pantalla de carga
  // codigos de modelos por peticion: el servidor acepta 160 (O-329). Con la ropa de equipo
  // (O-334) un partido pide unos 70-90 (cuerpos y ropas): en una sola peticion, porque la
  // primera de varias quita de la cola lo de las demas (solo) y una consulta en medio los
  // daria por fallados
  trozo: 160,
  quieto: 180,        // s sin avanzar nada: se deja seguir (algo se ha quedado colgado)
};

const Carga = {
  activa: false,      // la pantalla de carga esta puesta (de empezar al primer saque)
  vr: null,           // lo que se sabe de las animaciones de VR de este partido (Escenas lo comparte)
  p: null,
  _anticipado: "",

  // lo que se pide de dos equipos (los datos de /api/partido/equipo o los del online): los
  // jugadores (titulares, banquillo y las formas de los modos con sus tecnicas) y los modelos
  // (sus caras, la forma, la armadura o el mixi max y el keshin o el alma). b puede faltar
  lista(a, b) {
    const jugadores = [], formas = [], codigos = [];
    const tec = ts => (ts || []).map(t => t.interno || t.id).filter(Boolean).map(String);
    const pon = (lista, x) => { if (x && !lista.includes(x)) lista.push(x); };
    // los modelos vestidos con la equipacion de su equipo (O-334): su cuerpo y su ropa, en el
    // diseno de su equipo y de portero el que lo es (como en el partido)
    const R = typeof REGLAS !== "undefined" && REGLAS.vestido ? REGLAS : null;
    const ks = R ? R.disenos(a, b) : [0, 0];
    const vestidos = (d, cod, ropa, k, portero) => R ? R.ficheros(R.vestido(cod, R.ropaDe(ropa, k, portero), d.dorsal, d.capitan)) : [cod];
    [a, b].forEach((e, lado) => {
      if (!e) return;
      const puestos = (e.formacion && e.formacion.puestos) || [];
      (e.jugadores || []).slice(0, 11).concat((e.banquillo || []).slice(0, 5)).forEach((d, i) => {
        if (!d || !d.cara) return;
        const pu = i < 11 ? puestos.find(q => q.puesto === d.puesto) : null;
        const portero = i < 11 ? d.puesto === 0 || !!(pu && pu.posicion === "POR") : d.posicion === "POR";
        const esp = d.espiritu || ((d.tecnicas || []).find(t => t.espiritu) || {}).espiritu || null;
        jugadores.push({ cara: d.cara, tecnicas: tec(d.tecnicas), espiritu: esp && esp.id ? String(esp.id) : "" });
        for (const c of vestidos(d, d.cara, d.ropa, ks[lado], portero)) pon(codigos, c);
        const fo = esp && esp.forma;
        if (fo && (fo.tecnicas || []).length) formas.push({ cara: fo.modelo || fo.cara || "", tecnicas: tec(fo.tecnicas), espiritu: "" });
        if (fo && (fo.modelo || fo.cara)) for (const c of vestidos(d, String(fo.modelo || fo.cara), fo.ropa, ks[lado], portero)) pon(codigos, c);
        if (esp && esp.modelo) for (const c of vestidos(d, String(esp.modelo), esp.ropa_modelo, ks[lado], portero)) pon(codigos, c);
        if (esp) for (const c of [esp.keshin, esp.aura]) pon(codigos, c ? String(c) : "");
      });
    });
    // las formas detras: un Pizarra de antes solo mira los 40 primeros
    return { jugadores: jugadores.concat(formas.filter(f => f.cara)), codigos };
  },

  // al elegir equipos: que el servidor vaya convirtiendo (solo lo de estos dos: lo pendiente de
  // otros equipos que se miraron antes se quita de su cola)
  anticipar(a, b) {
    clearTimeout(this._tAnticipo);
    this._tAnticipo = setTimeout(() => {
      if (this.activa) return;
      const l = this.lista(a, b), clave = JSON.stringify(l);
      if (clave === this._anticipado) return;
      this._anticipado = clave;
      this._pedir(l, true).catch(() => {});
    }, CARGA.anticipo);
  },

  // las peticiones al servidor: los modelos (por trozos) y las animaciones de VR. -> la
  // respuesta de los eventos (con su mapa) o null si este Pizarra no las sabe hacer (404)
  async _pedir(l, solo) {
    const post = (url, cuerpo) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    for (let k = 0; k < l.codigos.length; k += CARGA.trozo) {
      const r = await post("/api/partido/modelos/preparar", { codigos: l.codigos.slice(k, k + CARGA.trozo), solo: solo && k === 0 });
      if (!r.ok) throw new Error("modelos " + r.status);
    }
    if (!l.jugadores.length) return { tecnicas: {}, espiritus: {}, modelos: [] };
    const r = await post("/api/partido/eventos/preparar", { jugadores: l.jugadores, solo });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("eventos " + r.status);
    return r.json();
  },

  // --- el partido -----------------------------------------------------------------------
  // op: {p (el Partido), a, b (los datos de los equipos), modo, rival (su nombre, online),
  // tresD (si hay campo 3D: sin el no hay nada que cargar)}
  empezar(op) {
    clearTimeout(this._tAnticipo);
    this.activa = true;
    this.p = op.p; this.modo = op.modo || "maquina"; this.rivalNombre = op.rival || "el rival";
    this.tresD = op.tresD !== false;
    this.equipos = [op.a, op.b].map(e => e ? { nombre: e.nombre || "", caras: (e.jugadores || []).slice(0, 11).map(j => j.cara) } : null);
    this.t0 = Date.now(); this.tAvance = Date.now(); this.firma = "";
    this.listo = false; this.seguido = false; this.aviso = ""; this.sinVR = false; this.sinJuego = false; this.fallo = "";
    this.conv = { m: 0, e: 0, pend: 1 }; this.av = null; this.pct = 0; this.rival = { pct: 0, listo: false, visto: 0 };
    this.eventos = new Set(); this.modelos = new Set(); this._tPinta = 0; this._tRed = 0; this._tConsulta = 0; this._consultando = false; this._nPrecarga = -1;
    this.vr = { tecnicas: {}, espiritus: {}, hechos: new Set(), pend: 0, t: 0, visto: 0, caras: new Set(), pidiendo: false,
                mapa: false, modelosHechos: new Set(), modelosMal: new Set(), eventosMal: new Set(), pendientes: new Set(), sinCola: false };
    this.lista_ = this.lista(op.a, op.b);
    for (const j of this.lista_.jugadores) this.vr.caras.add(j.cara);
    for (const c of this.lista_.codigos) this.modelos.add(c);
    this._dom();
    if (!this.tresD) { this.vr = null; this._miLista(); return; }
    this._pedir(this.lista_, true).then(e => {
      if (!this.activa) return;
      if (!e) {
        // un Pizarra.exe de antes de O-323: los modelos si, las animaciones de VR no
        this.sinVR = true;
        if (typeof Voces !== "undefined" && Voces.pedido) Voces.pedido(null);
        this.aviso = "Tu Pizarra no tiene aún las animaciones de VR: cierra Pizarra y ábrelo con la versión nueva. Mientras, se juega con las animaciones de siempre.";
        this.vr.mapa = true;
        return this._consultar();
      }
      Object.assign(this.vr.tecnicas, e.tecnicas || {}); Object.assign(this.vr.espiritus, e.espiritus || {});
      this.vr.mapa = true;
      for (const c of e.modelos || []) this.modelos.add(c);
      // los eventos de este partido: los de sus tecnicas y los de sus espiritus (el de fallo ya no:
      // el que pierde no ensena su tecnica, O-336)
      const internos = new Set(this.lista_.jugadores.flatMap(j => j.tecnicas));
      for (const [k, t] of Object.entries(e.tecnicas || {})) if ((internos.has(k) || internos.has(String(t.id || ""))) && t.evento) this.eventos.add(t.evento);
      for (const s of Object.values(e.espiritus || {})) if (s.evento) this.eventos.add(s.evento);
      this._estado(e);
      // las voces de VR de los jugadores (O-339): las convierte el servidor y las baja Voces
      if (typeof Voces !== "undefined" && Voces.pedido) Voces.pedido(e.voces || null);
    }).catch(err => {
      if (!this.activa) return;
      this.fallo = "No se ha podido pedir al servidor lo del partido (" + (err && err.message) + ").";
    });
  },
  // lo comparte Escenas (partido-escenas.js) si es de este partido
  vrDe(p) { return this.vr && p === this.p ? this.vr : null; },

  // como va la cola del servidor (GET /api/partido/modelos/estado)
  _consultar() {
    if (this._consultando || !this.vr) return;
    this._consultando = true;
    fetch("/api/partido/modelos/estado").then(r => r.json()).then(e => this._estado(e))
      .catch(() => {}).finally(() => { this._consultando = false; this._tConsulta = Date.now(); });
  },
  _estado(e) {
    const V = this.vr;
    if (!V || !e) return;
    for (const c of e.hechos || []) V.modelosHechos.add(c);
    for (const c of Object.keys(e.errores || {})) V.modelosMal.add(c);
    const ev = e.eventos || {};
    for (const x of ev.hechos || []) V.hechos.add(x);
    // lo que el servidor ha vuelto a poner en su cola ya no esta hecho: un evento hecho para el
    // equipo que se miro antes vuelve a la cola si al de ahora le falta su keshin o su tipo de
    // cuerpo; si no, se leia a medias (los 404 de pistas_*.glb) y se quedaba asi el partido
    // entero (O-334, vuelta 2)
    for (const x of [...(ev.pendientes || []), ev.actual]) if (x) V.hechos.delete(x);
    for (const x of Object.keys(ev.errores || {})) V.eventosMal.add(x);
    V.pend = (ev.pendientes || []).length + (ev.actual ? 1 : 0);
    // sin el juego (o sin poder leerlo) no se convierte nada: se dice y lo que ya estaba vale
    if (e.error) { V.sinCola = true; this.sinJuego = true; if (!this.aviso) this.aviso = e.error + " Se juega con las animaciones de siempre."; }
    const pend = new Set([...(e.pendientes || []), e.actual, ...(ev.pendientes || []), ev.actual].filter(Boolean));
    V.pendientes = pend;
    // lo que no esta hecho ni en la cola ya no va a venir (un codigo que el servidor no acepta,
    // o quitado de su cola): cuenta como fallado, y sale con la ficha o la plantilla
    for (const c of this.modelos) if (!V.modelosHechos.has(c) && !pend.has(c)) V.modelosMal.add(c);
    if (V.mapa && !this.sinVR) for (const x of this.eventos) if (!V.hechos.has(x) && !pend.has(x)) V.eventosMal.add(x);
    this.conv = {
      m: [...this.modelos].filter(c => V.modelosHechos.has(c) || V.modelosMal.has(c)).length,
      e: [...this.eventos].filter(x => V.hechos.has(x) || V.eventosMal.has(x)).length,
      pend: [...this.modelos].filter(c => pend.has(c)).length + [...this.eventos].filter(x => pend.has(x)).length,
    };
  },

  // cada cuadro mientras esta la pantalla (partido.js): la cola del servidor, lo de la pagina
  // (Escenas), el % y el rival. mundo: el Mundo3D o null (sin 3D); vista: si ya se sabe cual
  tick(mundo, vista, red) {
    if (!this.activa) return;
    const ahora = Date.now();
    const V = this.vr;
    if (V && ahora - this._tConsulta > CARGA.consulta && this.conv.pend + (this.modelos.size - this.conv.m) + (this.eventos.size - this.conv.e) > 0) this._consultar();
    // la pagina: la cache de modelos y las animaciones fijas (Escenas, un modulo)
    const E = typeof Consola !== "undefined" && Consola._modulos ? Consola._modulos.Escenas : null;
    if (vista && mundo && E && E.precargar && V) {
      // (los modelos que llegan con la respuesta de los eventos se suman)
      if (E._mundo === mundo && E.vr === V) {
        if (this._nPrecarga !== this.modelos.size) { E.precargar(mundo, [...this.modelos]); this._nPrecarga = this.modelos.size; }
        this.av = E.avancePrecarga();
      }
    }
    // las voces (O-339): lo que va convirtiendo el servidor se baja
    if (typeof Voces !== "undefined" && Voces.tick) Voces.tick();
    this._calcular(mundo, vista);
    if (red && ahora - this._tRed > CARGA.red) { this._tRed = ahora; red.mandar({ tipo: "carga", pct: this.pct, listo: this.listo }); }
    if (ahora - this._tPinta > CARGA.pinta) { this._tPinta = ahora; this._pintarDom(); }
  },
  _miLista() { this.listo = true; this.pct = 100; },
  _calcular(mundo, vista) {
    if (this.listo && (!this.aviso || this.seguido)) return;
    const V = this.vr, av = this.av;
    const Nm = this.modelos.size, Ne = this.eventos.size;
    const mCarg = av ? av.modelos[0] : 0, fOk = av ? av.fijas[0] : 0, Nf = av ? av.fijas[1] : 0;
    // sin 3D (o sin WebGL) no hay nada que cargar
    const sin3D = !this.tresD || (vista && !mundo);
    let hecho = sin3D;
    // las voces de VR (O-339): los bancos de los jugadores bajados y lo que dice cada animacion
    const vz = !sin3D && typeof Voces !== "undefined" && Voces.avance ? Voces.avance() : { listos: 0, total: 0, listo: true };
    this.voces = vz;
    if (!hecho && V) {
      const conv = (this.conv.m >= Nm || V.sinCola) && (this.conv.e >= Ne || this.sinVR || V.sinCola) && V.mapa;
      hecho = conv && !!av && av.listo && vz.listo;
    }
    if (this.fallo) hecho = true;
    const tot = 2 * Nm + Ne + Nf + vz.total;
    // (hasta saber que animaciones lleva el partido, el % no dice nada)
    const pct = sin3D ? 100 : tot && (!V || V.mapa) ? Math.floor(100 * (this.conv.m + mCarg + this.conv.e + fOk + vz.listos) / tot) : 0;
    const firma = [this.conv.m, this.conv.e, mCarg, fOk, vz.listos].join();
    if (firma !== this.firma) { this.firma = firma; this.tAvance = Date.now(); }
    // colgado: se deja seguir
    if (!hecho && Date.now() - this.tAvance > CARGA.quieto * 1000) { hecho = true; this.fallo = this.fallo || "La carga no avanza desde hace un rato: puedes seguir (lo que falte saldrá con las animaciones de siempre)."; }
    this.pct = hecho ? 100 : Math.min(99, pct);
    this.listo = hecho;
    this.cuentas = { m: [sin3D ? Nm : mCarg, Nm], e: [this.eventosListos(av), Ne], f: [fOk, Nf] };
  },
  // las animaciones de VR listas en este PC: convertidas y, las fijas, ya en la grafica
  eventosListos(av) {
    const V = this.vr;
    if (!V) return this.eventos.size;
    const pend = av && av.fijasPend ? av.fijasPend : null;
    return [...this.eventos].filter(x => (V.hechos.has(x) || V.eventosMal.has(x)) && !(pend && pend.has(x))).length;
  },
  // si ya se puede jugar: lo mio listo (y el aviso leido) y, online, lo del rival
  terminada() {
    if (!this.activa) return true;
    if (!this.listo) return false;
    if ((this.aviso || this.fallo) && !this.seguido) return false;
    if (this.modo !== "maquina" && !this.rival.listo) return false;
    return true;
  },
  // al empezar el juego: fuera la pantalla. Online se repite un rato que estoy listo (un
  // mensaje se puede perder)
  acabar(red) {
    if (!this.activa) return;
    this.activa = false;
    const s = document.getElementById("pantalla-carga");
    if (s) s.hidden = true;
    document.body.classList.remove("cargando-partido");
    if (red && red._repite) red._repite("carga", () => red.mandar({ tipo: "carga", pct: 100, listo: true }), 6);
    if (typeof Consola !== "undefined" && Consola.esperarCalidad) Consola.esperarCalidad(3000);
  },
  // online: como va el rival
  alRival(m) {
    if (!m) return;
    this.rival = { pct: Math.max(0, Math.min(100, Math.round(+m.pct || 0))), listo: !!m.listo, visto: Date.now() };
  },
  seguir() { if (this.listo) this.seguido = true; },

  // --- lo que se ve ----------------------------------------------------------------------
  // los textos de las dos pantallas
  textos() {
    const c = this.cuentas || { m: [0, this.modelos.size], e: [0, this.eventos.size], f: [0, 0] };
    let nota = "";
    const enCola = this.conv && this.conv.pend > 0;
    if (this.fallo) nota = this.fallo;
    else if (this.aviso) nota = this.aviso;
    else if (this.listo && this.modo !== "maquina" && !this.rival.listo) nota = "Esperando a " + this.rivalNombre + ": " + this.rival.pct + " %";
    else if (enCola) nota = "Convirtiendo desde tu juego (solo la primera vez: tarda unos minutos).";
    // (O-339) lo ultimo que falta son las voces
    else if (!this.listo && this.voces && !this.voces.listo && !(this.av && !this.av.listo)) nota = "Preparando las voces de los jugadores…";
    else if (!this.listo) nota = "Preparando las animaciones en la gráfica…";
    const s = Math.floor((Date.now() - this.t0) / 1000);
    const sabido = !this.vr || this.vr.mapa;
    return { titulo: "Preparando el partido", modelos: "Modelos 3D " + c.m[0] + " de " + c.m[1], eventos: "Animaciones de VR " + (this.sinVR ? "—" : sabido ? c.e[0] + " de " + c.e[1] : "…"),
             fm: c.m[1] ? c.m[0] / c.m[1] : 1, fe: this.sinVR || !sabido ? 0 : c.e[1] ? c.e[0] / c.e[1] : 1, pct: this.pct, nota,
             reloj: Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"), seguir: this.listo && !!(this.aviso || this.fallo) && !this.seguido,
             aviso: !!(this.aviso || this.fallo), rival: this.modo !== "maquina" ? { nombre: this.rivalNombre, pct: this.rival.pct, listo: this.rival.listo } : null };
  },
  // arriba (Arriba.pintarCarga): los dos equipos y lo mismo que abajo
  datosArriba() { return Object.assign({ a: this.equipos && this.equipos[0], b: this.equipos && this.equipos[1] }, this.textos()); },
  // abajo: su seccion en la tactil (encima de todo; como control, el raton no llega al campo)
  _dom() {
    let s = document.getElementById("pantalla-carga");
    if (!s) {
      const dom = document.getElementById("abajo-dom");
      if (!dom) return;
      s = document.createElement("section");
      s.id = "pantalla-carga"; s.className = "gx-carga gx-control";
      s.innerHTML = '<div class="cab"><span>Preparando el partido</span><b id="carga-reloj">0:00</b></div>' +
        '<div class="gx-casilla fila uno"><span class="que">Modelos 3D</span><b id="carga-modelos"></b><i class="raya"><i id="carga-raya-m"></i></i></div>' +
        '<div class="gx-casilla fila dos"><span class="que">Animaciones de VR</span><b id="carga-eventos"></b><i class="raya"><i id="carga-raya-e"></i></i></div>' +
        '<div class="total"><i id="carga-total"></i><b id="carga-pct">0 %</b></div>' +
        '<p class="nota" id="carga-nota"></p>' +
        '<div class="gx-barra"><span class="vueltas" id="carga-vueltas"></span><button class="gx-boton derecha" id="carga-seguir" hidden>Seguir</button></div>';
      dom.appendChild(s);
      s.querySelector("#carga-seguir").onclick = () => this.seguir();
    }
    s.hidden = false;
    document.body.classList.add("cargando-partido");
    this._pintarDom();
  },
  _pintarDom() {
    const s = document.getElementById("pantalla-carga");
    if (!s) return;
    const x = this.textos(), $id = i => document.getElementById(i);
    const pon = (id, v) => { const n = $id(id); if (n && n.textContent !== v) n.textContent = v; };
    pon("carga-modelos", x.modelos.replace("Modelos 3D ", ""));
    pon("carga-eventos", x.eventos.replace("Animaciones de VR ", ""));
    pon("carga-pct", x.pct + " %"); pon("carga-nota", x.nota); pon("carga-reloj", x.reloj);
    const ancho = (id, f) => { const n = $id(id), w = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10 + "%"; if (n && n.style.width !== w) n.style.width = w; };
    ancho("carga-raya-m", x.fm); ancho("carga-raya-e", x.fe); ancho("carga-total", x.pct / 100);
    const b = $id("carga-seguir");
    if (b && b.hidden !== !x.seguir) b.hidden = !x.seguir;
    s.classList.toggle("aviso", x.aviso);
    s.classList.toggle("listo", this.listo);
  },
};
