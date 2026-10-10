/* El Director (NOTAS O-319; diseno 1.4, 6.4, 6.5 y 6.7): decide QUE se ensena en cada
   pantalla en este cuadro, desde el motor; los que pintan solo leen Director.estado.
   - La entrada a un duelo con el tiempo de Galaxy (guia 8.1, 8.2): los anillos, el corte
     de arriba a los 530 ms (600 en el tiro), las fichas y la barra de abajo a los 670.
   - La animacion de cada resultado: el plan de REGLAS.planAnim (el mismo que hace esperar
     al motor), tramo a tramo, en las dos pantallas. El tiempo dentro del plan sale de la
     espera del motor (t = total - p.espera); el Director lleva su propio reloj desde que
     ve el resultado y se corrige si se separa mas de 0,25 s (en el invitado la `e` llega
     a saltos con la foto). Un resultado sin `anim` (sin animaciones o un anfitrion de
     antes): el plan corto, que cabe en la espera que haya.
   - Lo que cuenta el resultado no sale antes de su momento (6.7): el marcador
     (estado.goles), los rotulos del plan y sus sonidos.
   - Graba los ultimos 4 s de juego (15 veces por segundo, en arrays fijos) para la
     repeticion del gol, y despues del gol Repetir / Reanudar (local).
   - Los rotulos de Galaxy (guia 8.7) que no son del plan: el saque, las invocaciones,
     la supertactica, los cambios (el panel CAMBIOS), el descanso y el final.
   - El tiro que viaja (O-325): cada etapa (chute, muro, cadena, portero) tiene su plan y,
     entre una y otra, el balon de verdad vuela por el campo con su estela y su placa.
   Su reloj es Director.ahora (sustituible: las capturas y las pruebas lo paran). */
"use strict";

const DIRECTOR = {
  // la entrada al duelo (guia 8.1 y 8.2): corte arriba, fichas, poder de base, barra abajo
  entrada: { foco: { corte: 0.53, fichas: 0.67, base: 0.70, botones: 0.67, anillos: 0.69 },
             tiro: { corte: 0.60, fichas: 0.67, base: 0.67, botones: 0.67, anillos: 0.70 } },
  sincronia: 0.25,                // s que se deja separar el reloj propio de la espera del motor
  rancio: 4,                      // s: un suceso de hace mas (llega tarde por la red) ya no sale
  // la repeticion (6.5 n); paron: un hueco mayor entre dos cuadros grabados es un paron del
  // juego (no cuenta, O-323)
  grabar: { cada: 1 / 15, n: 60, antes: 2.5, vuelo: 0.8, paron: 0.4 },
  invoca: 4.3,                    // la invocacion sobre el mapa (6.5 p); con su animacion de VR, lo que dure (O-323)
  // el descanso (t20): el rotulo, fundido a negro, negro y la pantalla verde con fundido
  descanso: { rotulo: 0.9, largo: 1.8, fundido: 0.15, negro: 1.05 },
  // el final (t21): "Fin del partido" 3,2 s; 1,6 s despues el de tu lado; negro; resultado
  final: { rotulo: 3.2, lado: 4.8, ladoDura: 1.1, negro: 6.0, pantalla: 6.6 },
  cambios: 4.4,                   // el panel CAMBIOS: sube, 3,5 s y baja (t14)
  // las familias de hipertecnica con su rotulo al invocar (REGLAS.HIPER_TIPOS[].rotulo)
  invocaciones: ["invoca", "armadura", "miximax", "totem", "despertar", "modo", "vinculo"],
  trasGol: 0.45,                  // lo que se oscurece el campo con Repetir / Reanudar (b48)
};

const Director = {
  estado: null,
  fichaGrande: false,         // la ficha grande arriba (el icono T y Equipo, O-318)
  yo: 0,
  ahora: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  sonidos: [],                // los ultimos que ha mandado sonar (para las pruebas)
  _s: null,

  reiniciar(o = {}) {
    if (o.yo === 0 || o.yo === 1) this.yo = o.yo;
    const G = DIRECTOR.grabar, N = 24 * 2;
    this.estado = {
      arriba: { modo: "mapa", fundido: 0, blanco: 0, tramo: null, invoca: null, escena: null, plan: null },
      abajo: { modo: "campo", fundido: 0, oscuro: 0, botones: true, anillos: null, balonAnim: null, ocultarBalon: false, placa: null,
               posiciones: null, camara: null, tactil: true, trasGol: false, video: false, esconde: false, repetir: false, estela: null },
      rotulos: [], programa: [], goles: [0, 0],
    };
    this._s = {
      p: null, t: null, fase: null, saqueTipo: null, evVistos: 0, nCambios: 0, quien: [],
      duelo: null, res: null, kVisto: null, faseRes: false, seq: null, invoca: null, trasGol: null,
      cola: [], sueltos: [], pendSaque: false, cambiosEspera: [],
      grab: { buf: new Float32Array(G.n * N), t: new Float64Array(G.n), i: 0, n: 0, ultimo: -1e9 },
      repe: { buf: new Float32Array(G.n * N), t: new Float64Array(G.n), n: 0, duelo: null, tirador: null, x: 0, y: 0, ok: false },
      pos: new Float32Array(N), bAnim: { x: 0, y: 0, h: 0 }, cam: { x: 0, y: 0 },
      estela: { x0: 0, y0: 0, x1: 0, y1: 0, h: 0, k: 0, color: "" },
    };
    this.fichaGrande = false;
    this.sonidos = [];
    return this.estado;
  },

  // --- cada cuadro (paso 3 del bucle, diseno 1.8) -------------------------------------
  tick(p) {
    if (!this._s) this.reiniciar();
    const S = this._s, e = this.estado, t = this.ahora() / 1000;
    S.t = t;
    if (!p) return e;
    if (S.p !== p) this._nuevo(p);
    this._grabar(p, t);
    this._mirarDuelo(p, t);
    this._mirarFases(p, t);
    this._mirarSucesos(p, t);
    this._mirarCambios(p, t);
    this._mirarResultado(p, t);
    this._componer(p, t);
    return e;
  },

  // un partido nuevo: de cero (los sucesos de antes no salen)
  _nuevo(p) {
    const yo = this.yo, fg = this.fichaGrande;
    this.reiniciar({ yo });
    this.fichaGrande = fg;
    const S = this._s;
    S.p = p; S.nCambios = (p.cambios || []).length;
    this._fotoQuien(p);
  },
  // quien es cada id ahora (el que sale de un cambio ya no esta en p.jugadores)
  _fotoQuien(p) {
    const q = this._s.quien;
    p.jugadores.forEach((j, k) => { if (!q[k] || q[k].cara !== j.cara || q[k].nombre !== j.nombre) q[k] = { nombre: j.nombre, cara: j.cara, posicion: j.posicion, elemento: j.elemento, lado: j.lado }; });
  },
  _sonar(que, ...a) {
    this.sonidos.push([que].concat(a));
    if (this.sonidos.length > 40) this.sonidos.shift();
    if (typeof Sonido !== "undefined" && Sonido && typeof Sonido[que] === "function") { try { Sonido[que](...a); } catch (e) {} }
  },

  // --- la repeticion: graba los ultimos 4 s del juego en arrays fijos (6.4) -----------
  _grabar(p, t) {
    const g = this._s.grab, G = DIRECTOR.grabar;
    if (p.fase !== "juego" || t - g.ultimo < G.cada) return;
    g.ultimo = t;
    const o = g.i * 48, js = p.jugadores, n = Math.min(22, js.length);
    for (let k = 0; k < n; k++) { g.buf[o + k * 2] = js[k].x; g.buf[o + k * 2 + 1] = js[k].y; }
    g.buf[o + 44] = p.balon.x; g.buf[o + 45] = p.balon.y;
    g.t[g.i] = t;
    g.i = (g.i + 1) % G.n; g.n = Math.min(G.n, g.n + 1);
  },
  // al empezar un tiro: lo grabado de los ultimos 2,5 s DE JUEGO pasa a la repeticion (en
  // orden). Los parones (la animacion del chute del tiro que viaja, que con las de VR dura 5-9 s,
  // un duelo) no cuentan: se quitan y la jugada sale seguida; antes, al llegar al portero solo
  // quedaba el vuelo (o nada) y la repeticion duraba menos de 1 s o no salia Repetir (O-323)
  _guardarRepeticion(p, du, t) {
    const S = this._s, g = S.grab, r = S.repe, G = DIRECTOR.grabar;
    r.n = 0; r.ok = false; r.duelo = du.id; r.tirador = du.tirador;
    // hacia atras desde lo ultimo grabado, sumando el tiempo de juego (un hueco de mas de
    // `paron` s cuenta como un cuadro)
    let juego = 0, m = 1;
    for (; m < g.n; m++) {
      const i = (g.i - m + G.n * 2) % G.n, j = (g.i - m - 1 + G.n * 2) % G.n, dt = g.t[i] - g.t[j];
      juego += dt > G.paron ? G.cada : dt;
      if (juego > G.antes) break;
    }
    // m: cuantos cuadros (los ultimos). Sus tiempos, seguidos
    let tt = 0;
    for (let k = m; k >= 1; k--) {
      const i = (g.i - k + G.n * 2) % G.n;
      if (k < m) { const j = (g.i - k - 1 + G.n * 2) % G.n, dt = g.t[i] - g.t[j]; tt += dt > G.paron ? G.cada : dt; }
      r.buf.set(g.buf.subarray(i * 48, i * 48 + 48), r.n * 48);
      r.t[r.n] = tt; r.n++;
    }
    if (!g.n) r.n = 0;
    const tir = p.jugadores[du.tirador], gol = du.gy !== undefined ? { x: 0, y: du.gy } : tir ? p.porteriaRival(tir) : { x: 0, y: 52.5 };
    // adonde va el balon: en el penalti a su zona; si no, cerca del centro de la porteria (en
    // el tiro que viaja, adonde iba de verdad, O-325)
    r.x = du.gx !== undefined ? du.gx : ((du.id * 37) % 9 - 4) * 0.6; r.y = gol.y + Math.sign(gol.y || 1) * 0.9;
    r.ok = r.n >= 2;
  },
  // la repeticion en el momento tr (s) de una que dura `dura`: las posiciones grabadas
  // (las ultimas que caben) y luego el balon de la animacion hasta la red
  _repeticion(p, tr, dura) {
    const S = this._s, r = S.repe, B = this.estado.abajo, G = DIRECTOR.grabar;
    if (!r.ok) return false;
    const vuelo = Math.min(G.vuelo, dura * 0.45), largo = Math.min(r.t[r.n - 1], dura - vuelo), desde = r.t[r.n - 1] - largo;
    const tg = desde + Math.min(tr, largo);
    let k = 0;
    while (k < r.n - 2 && r.t[k + 1] < tg) k++;
    const a = r.t[k], b = r.t[k + 1], f = b > a ? Math.max(0, Math.min(1, (tg - a) / (b - a))) : 0;
    for (let i = 0; i < 48; i++) S.pos[i] = r.buf[k * 48 + i] + (r.buf[(k + 1) * 48 + i] - r.buf[k * 48 + i]) * f;
    B.modo = "repeticion"; B.video = true; B.posiciones = S.pos;
    const bx = S.pos[44], by = S.pos[45];
    if (tr > largo) {
      // el tiro, por el cono hasta la red
      const tir = r.tirador !== null && r.tirador < 22 ? r.tirador : null;
      const x0 = tir !== null ? S.pos[tir * 2] : bx, y0 = tir !== null ? S.pos[tir * 2 + 1] : by;
      const k2 = Math.min(1, (tr - largo) / vuelo);
      this._balonEn(x0, y0, r.x, r.y, k2, 1.6);
      B.ocultarBalon = true;
      S.cam.x = S.bAnim.x; S.cam.y = S.bAnim.y;
    } else { S.cam.x = bx; S.cam.y = by; }
    B.camara = S.cam;
    return true;
  },
  // el balon de la animacion de (x0, y0) a (x1, y1) en k (0..1), con un arco de alto h
  _balonEn(x0, y0, x1, y1, k, h) {
    const b = this._s.bAnim;
    b.x = x0 + (x1 - x0) * k; b.y = y0 + (y1 - y0) * k; b.h = 0.35 + Math.sin(Math.PI * k) * h;
    this.estado.abajo.balonAnim = b;
    return b;
  },

  // --- lo que mira en el motor --------------------------------------------------------
  // un duelo nuevo: desde ahora su entrada (los anillos, el corte de arriba, la barra)
  _mirarDuelo(p, t) {
    const S = this._s, du = p.fase === "duelo" ? p.duelo : null;
    if (!du) return;
    if (!S.duelo || S.duelo.id !== du.id) {
      const tiro = du.tipo !== "foco";
      // en el tiro que viaja (O-325), quien elige en esta etapa: el muro, el que encadena o
      // el portero (los anillos, en el)
      const quien = !tiro ? du.atacante : du.etapa === "muro" ? du.muro : du.etapa === "cadena" ? du.cadena : du.etapa === "portero" ? du.portero : du.tirador;
      S.duelo = { id: du.id, t0: t, tiro, tipo: du.tipo, etapa: du.etapa || null, quien, obj: du };
      // un duelo corta la invocacion de arriba (6.5 p) y Repetir / Reanudar
      S.invoca = null; S.trasGol = null;
      // la repeticion: al empezar el tiro; en el que viaja, al llegar al portero (lo grabado
      // lleva el vuelo de verdad y acaba desde donde esta el balon)
      if (tiro && !du.etapa) this._guardarRepeticion(p, du, t);
      else if (du.etapa === "portero" && p.tiro) this._guardarRepeticion(p, { id: du.id, tirador: null, gx: p.tiro.tx, gy: p.tiro.ty }, t);
      // el duelo nuevo: la animacion de antes ya no se ensena
      if (S.res && !S.res.motor) S.res = null;
    }
    S.duelo.obj = du;          // el invitado recibe uno nuevo en cada foto: el ultimo
  },

  _mirarFases(p, t) {
    const S = this._s, antes = S.fase;
    if (p.fase === "saque" && p.esperaSaque) S.saqueTipo = p.esperaSaque.tipo;
    if (p.fase === antes) return;
    S.fase = p.fase;
    if (p.fase === "descanso") {
      S.seq = { que: "descanso", t0: t, mitad: p.mitad }; S.cola.length = 0; S.res = null; S.invoca = null; S.trasGol = null;
    } else if (p.fase === "final") {
      S.seq = { que: "final", t0: t }; S.cola.length = 0; S.res = null; S.invoca = null; S.trasGol = null; S.cambiosEspera.length = 0;
    } else if (antes === "descanso") {
      S.seq = null;
      // los cambios del descanso, al volver (en el descanso la tactil es la de las estadisticas)
      for (const c of S.cambiosEspera) S.cola.push(c);
      S.cambiosEspera.length = 0;
    }
    // "¡SAQUE!" al pasar de la espera del saque (o del descanso) al juego (6.5 o)
    if (p.fase === "juego" && S.pendSaque) { S.pendSaque = false; S.cola.push(this._rotulo("saque")); }
    if (p.fase !== "saque" && antes === "saque") S.trasGol = null;
  },

  // los sucesos con rotulo (ro) que no son de un plan: salen al llegar (6.7)
  _mirarSucesos(p, t) {
    const S = this._s, ev = p.eventos;
    if (S.evVistos > ev.length) S.evVistos = 0;
    while (S.evVistos < ev.length) {
      const e = ev[S.evVistos++];
      if (!e || !e.ro) continue;
      const ro = e.ro, que = ro.que;
      const rancio = p.pasos - e.paso > DIRECTOR.rancio / REGLAS.PASO;
      if (que === "saque") { if (!rancio) { if (p.fase === "juego") S.cola.push(this._rotulo("saque", ro)); else S.pendSaque = true; } continue; }
      if (que === "descanso" || que === "final" || que === "reglamentario") continue;      // los dice su secuencia
      if (rancio) continue;
      if (que === "banda" || que === "corner" || que === "puerta" || que === "penaltis") { S.chico = { que, ro, n: S.evVistos }; continue; }
      if (que === "prorroga") { S.cola.push(this._rotulo("prorroga", ro)); continue; }
      if (que === "tactica") { S.sueltos.push(Object.assign(this._rotulo("tactica", ro), { de: t })); continue; }
      // la vaselina que pasa por encima de un rival con el tiro en vuelo (O-325): sobre el
      if (que === "porEncima") { S.sueltos.push(Object.assign(this._rotulo("porEncima", ro), { de: t, x: ro.x, y: ro.y })); continue; }
      if (DIRECTOR.invocaciones.includes(que)) {
        // la invocacion: el rotulo encima del juego y, arriba, el espiritu sobre el mapa
        S.sueltos.push(Object.assign(this._rotulo(que, ro), { de: t }));
        const nombre = String(ro.sub || "").split(" · ")[0];
        // por su id (O-327: con un modo, al llegar aqui ya se llama como su forma)
        const j = (typeof ro.jugador === "number" && p.jugadores[ro.jugador]) || p.jugadores.find(x => x.lado === ro.lado && x.nombre === nombre);
        // lo que dura: lo de su animacion de VR (partido.py, O-323) o la de Galaxy
        if (j && p.fase !== "duelo") S.invoca = { jugador: j.id, t0: t, familia: que, dura: (j.espiritu && j.espiritu.seg > 0 ? Math.min(REGLAS.SEG_MAX || 12, j.espiritu.seg) : DIRECTOR.invoca) };
      }
      // los demas (bloqueo, critico, falta, tarjetas, penalti, fuera, la tanda, la ★) los
      // pone el plan de su resultado en su tramo
    }
  },

  // los cambios nuevos (p.cambios): el panel CAMBIOS de su equipo (b43), uno por equipo
  _mirarCambios(p, t) {
    const S = this._s, cb = p.cambios || [];
    if (cb.length > S.nCambios) {
      const nuevos = cb.slice(S.nCambios);
      S.nCambios = cb.length;
      for (const lado of [0, 1]) {
        const suyos = nuevos.filter(c => c[0] === lado);
        if (!suyos.length || p.fase === "final") continue;
        const filas = suyos.slice(-3).map(([l, sale, k]) => {
          const fuera = S.quien[sale] || {}, d = (p.banquillos[l] || [])[k] || {};
          return { sale: { nombre: fuera.nombre, cara: fuera.cara, posicion: fuera.posicion, elemento: fuera.elemento },
                   entra: { nombre: d.nombre, cara: d.cara, posicion: d.posicion, elemento: d.elemento } };
        });
        const r = Object.assign(this._rotulo("cambios"), { lado, equipo: p.nombres[lado], filas });
        // en el descanso la tactil es la de las estadisticas: al volver el juego
        if (p.fase === "descanso") S.cambiosEspera.push(r); else S.cola.push(r);
      }
    }
    this._fotoQuien(p);
  },

  // un resultado nuevo: su plan; sin resultado nuevo en una espera (banda, corner,
  // puerta, la tanda), el plan chico. Y la sincronia con la espera del motor
  _mirarResultado(p, t) {
    const S = this._s, enRes = p.fase === "resultado" || p.fase === "gol";
    if (!enRes) {
      if (S.res && S.res.motor) {
        // el motor ya ha salido: lo que queda se acaba enseguida (online llega a saltos)
        S.res.motor = false;
        S.res.fin = Math.min(S.res.total, t - S.res.t0 + 0.15);
      }
      S.faseRes = false; S.chico = null;
      return;
    }
    const r = p.resultado, k = r ? (r.k !== undefined ? r.k : p.nResultado) : null;
    if (r && k !== S.kVisto) {
      S.kVisto = k; S.chico = null;
      this._empezarPlan(p, t, r, k);
    } else if (S.chico && (!S.res || S.res.chicoN !== S.chico.n)) {
      this._empezarChico(p, t, S.chico);
    }
    S.faseRes = true;
    const R = S.res;
    if (R && R.motor) {
      const esperado = R.total - p.espera, local = t - R.t0;
      if (Math.abs(local - esperado) > DIRECTOR.sincronia) R.t0 = t - esperado;
    }
  },

  _empezarPlan(p, t, r, k) {
    const S = this._s, lado = id => (p.jugadores[id] || {}).lado;
    let plan, corto = false;
    if (r.anim && REGLAS.ANIM[r.anim.modo]) plan = REGLAS.planAnim(r, r.anim.modo, r.anim.entrada, lado);
    else {
      // sin `anim` (sin animaciones o un anfitrion de antes): el plan de las cortas sin la
      // entrada, encogido a la espera que haya (6.4)
      plan = REGLAS.planAnim(r, "cortas", 0, lado);
      const e0 = Math.max(0.3, p.espera + REGLAS.PASO), f = Math.min(1, e0 / plan.total);
      if (f < 1) for (const q of plan.tramos) { q.de *= f; q.a *= f; }
      plan.total = Math.min(plan.total, e0);
      corto = true;
    }
    const total = r.anim ? Math.max(plan.total, r.anim.total) : plan.total;
    const tirador = r.tirador !== undefined ? p.jugadores[r.tirador] : null;
    const gol = (r.tipo === "tiro" || r.tipo === "penalti") && r.final === "gol" && !r.tanda;
    const golLado = gol && tirador ? tirador.lado : null;
    // un gol de un tiro que el Director no vio empezar (se resolvio entre dos fotos del
    // invitado, o en el mismo cuadro): la repeticion se guarda ahora, con lo grabado hasta
    // que se paro el juego
    if (gol) {
      const dv = S.duelo, visto = dv && dv.tiro && S.repe.ok && S.repe.duelo === dv.id && t - dv.t0 < 90;
      if (!visto) {
        const g = S.grab, G = DIRECTOR.grabar;
        this._guardarRepeticion(p, { id: -1, tirador: r.tirador }, g.n ? g.t[(g.i - 1 + G.n) % G.n] : t);
      }
    }
    const golesAntes = p.goles.slice();
    if (golLado !== null) golesAntes[golLado] = Math.max(0, golesAntes[golLado] - 1);
    const du = S.duelo && (r.tipo !== "fuera") ? S.duelo.obj : null;
    S.res = { k, r, plan, total, fin: total, t0: t - (total - p.espera), motor: true, corto, golLado, golesAntes, gol, du,
              hechos: new Uint8Array(plan.tramos.length), tramo: { que: null, t: 0, dura: 0, q: null, res: null, k: -1 }, rot: {} };
    S.res.tramo.res = S.res;
    S.cola.length = 0;
    S.sueltos.length = 0;
  },
  _empezarChico(p, t, c) {
    const S = this._s, m = p.animaciones;
    const total = m ? REGLAS.esperaAnim(c.que, m) : Math.max(0.3, p.espera + REGLAS.PASO);
    const plan = { total, tramos: [{ que: "chico", de: 0, a: total, rotulo: c.que, ro: c.ro }] };
    S.res = { k: null, r: null, plan, total, fin: total, t0: t - (total - p.espera), motor: true, corto: !m, golLado: null, golesAntes: p.goles.slice(),
              gol: false, du: null, chicoN: c.n, hechos: new Uint8Array(1), tramo: { que: null, t: 0, dura: 0, q: null, res: null, k: -1 }, rot: {} };
    S.res.tramo.res = S.res;
  },

  // --- lo que se ensena -----------------------------------------------------------------
  _componer(p, t) {
    const S = this._s, e = this.estado, A = e.arriba, B = e.abajo;
    A.modo = p.fase === "descanso" ? "descanso" : p.fase === "final" ? "final" : this.fichaGrande ? "ficha" : "mapa";
    A.fundido = 0; A.blanco = 0; A.tramo = null; A.invoca = null; A.escena = null; A.plan = null;
    B.modo = "campo"; B.fundido = 0; B.oscuro = 0; B.botones = true; B.anillos = null; B.balonAnim = null; B.ocultarBalon = false;
    B.placa = null; B.posiciones = null; B.camara = null; B.tactil = true; B.trasGol = false; B.video = false; B.esconde = false; B.repetir = false; B.estela = null;
    e.goles[0] = p.goles[0]; e.goles[1] = p.goles[1];
    e.rotulos.length = 0; e.programa.length = 0;
    // la entrada del duelo: los anillos (desde el duelo, aunque ya se haya elegido)
    const du = S.duelo, tDu = du ? t - du.t0 : 1e9, E = du ? DIRECTOR.entrada[du.tiro ? "tiro" : "foco"] : null;
    if (du && tDu < E.anillos) B.anillos = { ids: [du.quien], t: tDu, tiro: du.tiro };
    if (p.fase === "duelo" && du && p.duelo && p.duelo.id === du.id) {
      B.botones = tDu >= E.botones;
      if (tDu >= E.corte) { A.modo = "duelo"; A.tramo = this._tramoDuelo(du, tDu); }
    }
    // el plan del resultado
    let R = S.res;
    if (R) {
      const tp = t - R.t0;
      // si el motor aun no ha salido del resultado o del gol (este reloj puede ir hasta 0,25 s
      // por delante: con cuadros lentos el motor pierde tiempo), se espera en el ultimo
      // cuadro: acabado antes, tras el gol no salian Repetir / Reanudar (O-321)
      const espera = R.motor && (p.fase === "resultado" || p.fase === "gol");
      if ((tp >= R.fin && !espera) || (!R.motor && p.fase === "duelo")) {
        // acabado: tras el gol que lleva a la espera del saque, Repetir / Reanudar (6.5 n)
        if (R.gol && p.fase === "saque" && p.esperaSaque && p.esperaSaque.tipo === "centro") S.trasGol = { t0: t, rep: null };
        S.res = R = null;
      } else this._plan(p, t, R, Math.max(0, Math.min(tp, R.fin - 0.001)));
    }
    // el plan entero: arriba se cargan antes las animaciones de VR de sus tecnicas (O-323)
    A.plan = R;
    // el tiro en vuelo de verdad (O-325; guia 8.5): la patada al salir (y al encadenar), la
    // estela por su camino y la placa "Poder total" con lo que lleva (baja si un muro le
    // quita). La pelota es la del motor (con su altura) y la camara la sigue
    const T = p.tiro;
    if (T && p.fase === "juego") {
      if (T.id !== S.vueloVisto) { S.vueloVisto = T.id; this._sonar("patada", true); }
      if (!R) {
        const es = S.estela, tot = T.total || 1, el = T.paso && T.paso.tecnica ? T.paso.elemento : "";
        es.x0 = T.x0; es.y0 = T.y0; es.x1 = T.tx; es.y1 = T.ty; es.h = T.h || 0;
        es.k = Math.max(0, Math.min(1, Math.hypot(p.balon.x - T.x0, p.balon.y - T.y0) / tot));
        es.color = el && typeof GX !== "undefined" && GX.elementoTexto[el] ? GX.elementoTexto[el] : "#35E8F5";
        B.estela = es;
        const pl = S.placa || (S.placa = { valor: 0, lado: 0 });
        pl.valor = Math.round(T.at); pl.lado = T.lado;
        B.placa = pl;
      }
    }
    // el descanso y el final
    if (S.seq) this._secuencia(p, t, S.seq);
    // la invocacion sobre el mapa, sin parar el juego (6.5 p)
    if (S.invoca) {
      const ti = t - S.invoca.t0, dura = S.invoca.dura || DIRECTOR.invoca;
      if (ti >= dura || p.fase === "duelo" || S.seq || p.fase === "final") S.invoca = null;
      else if (!R && A.modo === "mapa") {
        A.invoca = S.invoca;
        A.modo = "anim";
        const tr = S.trInvoca || (S.trInvoca = { que: "invoca", t: 0, dura: DIRECTOR.invoca, res: null, q: null, k: -1 });
        // t0: cual es (arriba, su animacion de VR se decide una vez por invocacion, O-323)
        tr.t = ti; tr.dura = dura; tr.t0 = S.invoca.t0; tr.jugador = S.invoca.jugador; tr.familia = S.invoca.familia;
        A.tramo = tr;
      }
    }
    // Repetir / Reanudar
    if (S.trasGol && !R) {
      if (p.fase !== "saque") S.trasGol = null;
      else {
        const tg = S.trasGol, rep = tg.rep;
        if (rep && t - rep.t0 < rep.dura) { if (!this._repeticion(p, t - rep.t0, rep.dura)) tg.rep = null; B.tactil = false; }
        else {
          tg.rep = null;
          B.trasGol = true; B.repetir = S.repe.ok;
          B.oscuro = DIRECTOR.trasGol * Math.min(1, (t - tg.t0) / 0.1);
        }
      }
    }
    // el 3D de arriba (O-320): con WebGL, el plano de este tramo lo compone Escenas (puro) y
    // lo pinta el Mundo; HudDuelo va encima sin su fondo 2D. Sin WebGL (o en un plano
    // negro), escena null: el fondo 2D de siempre
    A.escena = null;
    const Es = this._escenas();
    if (Es && A.tramo && (A.modo === "duelo" || A.modo === "anim" || A.modo === "gol")) {
      const v = Es.componer(p, A, this.yo);
      if (v && v.hay) A.escena = v;
    }
    this._cola(p, t, !!R || !!S.seq);
  },
  // Escenas (partido-escenas.js, un modulo que llega despues), si hay un Mundo con su Estudio
  _escenas() {
    const E = typeof Consola !== "undefined" && Consola._modulos ? Consola._modulos.Escenas : null;
    return E && E.listo && E.listo() ? E : null;
  },

  // Repetir y Reanudar de la tactil (b48): solo en este PC
  repetir() {
    const S = this._s;
    if (!S || !S.trasGol || !S.repe.ok) return false;
    S.trasGol.rep = { t0: this.ahora() / 1000, dura: Math.min(4, S.repe.t[S.repe.n - 1] + DIRECTOR.grabar.vuelo) };
    return true;
  },
  reanudar() { if (this._s) this._s.trasGol = null; },

  // el duelo eligiendo (modo "duelo"): lo que lleva y lo que ya se ve
  _tramoDuelo(du, tDu) {
    const tr = this._s.trDuelo || (this._s.trDuelo = { que: "duelo", t: 0, dura: 0, res: null, q: null, k: -1 });
    tr.t = tDu; tr.duelo = du; tr.tiro = du.tiro;
    const E = DIRECTOR.entrada[du.tiro ? "tiro" : "foco"];
    tr.fichas = tDu >= E.fichas; tr.base = tDu >= E.base;
    return tr;
  },

  // un tramo del plan en las dos pantallas (6.5)
  _plan(p, t, R, tp) {
    const S = this._s, e = this.estado, A = e.arriba, B = e.abajo, ts = R.plan.tramos;
    let k = 0;
    while (k < ts.length - 1 && tp >= ts[k].a) k++;
    const q = ts[k], tt = Math.max(0, tp - q.de), dura = Math.max(0.001, q.a - q.de);
    // lo que empieza en este tramo (los de antes que se ha saltado, sin sonido si es tarde)
    for (let i = 0; i <= k; i++) if (!R.hechos[i]) { R.hechos[i] = 1; this._alEmpezar(p, R, i, tp - ts[i].de < 0.3); }
    // lo que aun no se ve (el marcador y los bocadillos) espera a que acabe
    B.esconde = true;
    e.goles[0] = R.golesAntes[0]; e.goles[1] = R.golesAntes[1];
    B.botones = false;
    const tr = R.tramo;
    tr.que = q.que; tr.t = tt; tr.dura = dura; tr.q = q; tr.k = k; tr.tp = tp;
    const ant = k > 0 ? ts[k - 1] : null;
    const negroAbajo = x => x && (x.que === "tecnica" || x.que === "hiper" || (x.que === "sinTecnica" && x.sub !== "foco") || x.que === "transicion" || x.que === "negroTiro" || x.que === "destello");
    // los rotulos del plan, para las pruebas y para quien quiera ver lo que viene
    for (const x of ts) { const r = this._rotuloPlan(p, R, x); if (r) e.programa.push(r); }
    const sale = r => { if (r) { r.t = tt; e.rotulos.push(r); } };
    switch (q.que) {
      case "entrada": {
        const du = S.duelo, tDu = du ? t - du.t0 : 0, E = du ? DIRECTOR.entrada[du.tiro ? "tiro" : "foco"] : null;
        if (du && tDu >= E.corte) { A.modo = "duelo"; A.tramo = this._tramoDuelo(du, tDu); }
        break;
      }
      case "choque": case "prepara":
        A.modo = "anim"; A.tramo = tr;
        break;
      case "transicion": {
        // desde el campo (tras el vuelo, el bloqueo, por encima) arriba se funde el mapa; si
        // no, la escena de antes (t04, t09)
        const delCampo = ant && (ant.que === "vuelo" || ant.que === "bloqueo" || ant.que === "porEncima" || ant.que === "fueraTiro");
        if (!delCampo) { A.modo = "anim"; A.tramo = tr; }
        const f = Math.min(1, tt / 0.067);
        A.fundido = f; B.fundido = f;
        if (tt >= 0.067 || negroAbajo(ant)) B.modo = "negro";
        break;
      }
      case "tecnica": case "hiper": A.modo = "anim"; A.tramo = tr; B.modo = "negro"; break;
      case "sinTecnica": A.modo = "anim"; A.tramo = tr; if (q.sub !== "foco") B.modo = "negro"; break;
      case "fijar": A.modo = "anim"; A.tramo = tr; if (negroAbajo(ant)) B.modo = "negro"; break;
      case "vuelta": {
        const m = dura / 2;
        if (tt < m) { A.modo = "anim"; A.tramo = tr; A.fundido = B.fundido = tt / m; if (negroAbajo(ant)) B.modo = "negro"; }
        else { A.fundido = B.fundido = Math.max(0, 1 - (tt - m) / m); }
        break;
      }
      case "negroTiro": A.modo = "negro"; B.modo = "negro"; break;
      case "vuelo": {
        A.fundido = B.fundido = Math.max(0, 1 - tt / 0.1);
        const v = this._vuelo(p, R, q, Math.min(1, tt / dura));
        this._estela(R, q, Math.min(1, tt / dura));
        B.ocultarBalon = true; B.camara = S.cam; S.cam.x = v.x; S.cam.y = v.y;
        const pl = this._placa(p, R, q);
        if (pl) B.placa = pl;
        break;
      }
      case "bloqueo": {
        // t07: a +270 ms el campo se oscurece (2 f) y a +1700 se aclara
        const f = tt / dura;
        B.oscuro = f < 0.16 ? 0 : f < 0.2 ? (f - 0.16) / 0.04 * 0.5 : f < 0.98 ? 0.5 : 0.5 * (1 - (f - 0.98) / 0.02);
        const m = p.jugadores[q.jugador];
        if (m) { this._balonEn(m.x, m.y, m.x, m.y, 0, 0); B.ocultarBalon = true; S.cam.x = m.x; S.cam.y = m.y; B.camara = S.cam; }
        sale(this._rotuloPlan(p, R, q));
        break;
      }
      case "porEncima": {
        const v = this._vuelo(p, R, q, Math.min(1, tt / dura));
        this._estela(R, q, Math.min(1, tt / dura));
        B.ocultarBalon = true; S.cam.x = v.x; S.cam.y = v.y; B.camara = S.cam;
        const r = this._rotuloPlan(p, R, q);
        const m = p.jugadores[q.jugador];
        if (r && m) { r.x = m.x; r.y = m.y; }
        sale(r);
        break;
      }
      case "fueraTiro": {
        // en el tiro que viaja el balon ya esta donde se va: solo el rotulo (O-325)
        if (R.r && R.r.etapa) { sale(this._rotuloPlan(p, R, q)); break; }
        const v = this._vuelo(p, R, q, Math.min(1, tt / (dura * 0.5)));
        this._estela(R, q, Math.min(1, tt / (dura * 0.5)));
        B.ocultarBalon = true; S.cam.x = v.x; S.cam.y = v.y; B.camara = S.cam;
        sale(this._rotuloPlan(p, R, q));
        break;
      }
      case "destello":
        A.modo = "anim"; A.tramo = tr; A.blanco = Math.min(1, tt / dura); B.modo = "negro";
        break;
      case "gol": this._gol(p, t, R, q, tt, dura); break;
      case "entraPenalti": {
        A.modo = "anim"; A.tramo = tr;
        const v = this._vuelo(p, R, q, Math.min(1, tt / (dura * 0.6)));
        this._estela(R, q, Math.min(1, tt / (dura * 0.6)));
        B.ocultarBalon = true; S.cam.x = v.x; S.cam.y = v.y;
        break;
      }
      case "tandaRotulo": case "falta": case "tarjeta": case "penaltiRotulo": case "chico":
        sale(this._rotuloPlan(p, R, q));
        break;
      case "fueraJuego": {
        // t19: el rotulo 1,35 s, fundido 67 ms y negro hasta el saque
        const f1 = dura * 0.54, f0 = dura * 0.64, f2 = f0 + 0.067;
        if (tt < f1) sale(this._rotuloPlan(p, R, q));
        else if (tt < f0) { /* el campo, ya sin el rotulo */ }
        else if (tt < f2) { B.fundido = (tt - f0) / 0.067; }
        else B.modo = "negro";
        break;
      }
    }
  },

  // al empezar un tramo: los sonidos que van con el (6.7). El del tiro, al salir el balon
  // por el cono; el del penalti, al acabar la carrera
  _alEmpezar(p, R, i, aTiempo) {
    const ts = R.plan.tramos, q = ts[i], r = R.r;
    if (!aTiempo) return;
    if (q.que === "vuelo" && !q.segundo) this._sonar("patada", true);
    else if (r && r.tipo === "penalti" && i > 0 && ts[i - 1].que === "prepara") this._sonar("patada", true);
    else if (q.que === "falta") this._sonar("silbato", 1, 0.4);
    else if (q.que === "fueraJuego") this._sonar("silbato", 1, 0.22);
    else if (q.que === "gol" && r) { const tir = p.jugadores[r.tirador]; this._sonar("gol", !tir || tir.lado === this.yo); }
    else if (q.que === "tandaRotulo" && r && r.final === "gol") { const tir = p.jugadores[r.tirador]; this._sonar("gol", !tir || tir.lado === this.yo); }
  },

  // el balon de la animacion en el vuelo del tiro (por el cono), por encima del muro, al
  // irse fuera o al entrar el penalti. k: 0..1 de ese tramo. Cada tramo sale de donde
  // acabo el anterior (el trayecto se saca una vez por plan: en el resultado nadie se
  // mueve)
  _vuelo(p, R, q, k) {
    if (!R.trayecto) R.trayecto = this._trayecto(p, R);
    const s = R.trayecto[R.plan.tramos.indexOf(q)];
    if (!s) return this._balonEn(p.balon.x, p.balon.y, p.balon.x, p.balon.y, 0, 0);
    return this._balonEn(s[0], s[1], s[2], s[3], k, s[4]);
  },
  // la estela del balon de la animacion (guia 8.5: cian, o del color del elemento si fue
  // una supertecnica): el tramo del trayecto y por donde va; la pinta Rotulos
  _estela(R, q, k) {
    if (!R.trayecto) return;
    const s = R.trayecto[R.plan.tramos.indexOf(q)];
    if (!s) return;
    const e = this._s.estela, r = R.r || {}, p0 = (r.pasos || [])[0] || {};
    e.x0 = s[0]; e.y0 = s[1]; e.x1 = s[2]; e.y1 = s[3]; e.h = s[4]; e.k = k;
    e.color = p0.tecnica && p0.elemento && typeof GX !== "undefined" && GX.elementoTexto[p0.elemento] ? GX.elementoTexto[p0.elemento] : "#35E8F5";
    this.estado.abajo.estela = e;
  },
  _trayecto(p, R) {
    const r = R.r || {}, tir = p.jugadores[r.tirador], out = [];
    if (!tir) return out;
    const g = p.porteriaRival(tir), s = Math.sign(g.y) || 1, gx = (((R.k || 3) * 37) % 9 - 4) * 0.5;
    const m = (r.pasos || []).find(x => (x.contra !== undefined && x.contra !== null) || x.encima), mj = m ? p.jugadores[m.quien] : null;
    const ancho = (gx >= 0 ? 1 : -1) * (REGLAS.PORTERIA / 2 + 1.8);
    let x = tir.x, y = tir.y;
    R.plan.tramos.forEach((q, i) => {
      let x1 = null, y1 = null, h = 1.2;
      if (q.que === "vuelo") {
        if (q.hasta === "muro" && mj) { x1 = mj.x; y1 = mj.y; h = 0.6; }
        else if (q.hasta === "fuera") { x1 = ancho; y1 = g.y + s * 1.5; }
        else { x1 = gx; y1 = g.y - s * 0.8; }
      } else if (q.que === "porEncima") { x1 = gx; y1 = g.y - s * 0.8; h = 3.2; }
      else if (q.que === "fueraTiro") { x1 = ancho * 1.3; y1 = g.y + s * 3; h = 0.8; }
      else if (q.que === "entraPenalti") {
        const z = r.zonas ? r.zonas[tir.lado] : 1;
        x1 = ((z === 0 || z === 2 ? z : 1) - 1) * REGLAS.PENALTI_ZONA_X; y1 = g.y + s * 0.7; h = 1.0;
      }
      if (x1 === null) return;
      out[i] = [x, y, x1, y1, h];
      x = x1; y = y1;
    });
    return out;
  },
  // la placa "Poder total N" del tiro en vuelo (b31): fija (en Pizarra el tiro no pierde
  // fuerza; baja solo lo que le quita el muro, 6.5 h)
  _placa(p, R, q) {
    const r = R.r, tir = r && p.jugadores[r.tirador];
    if (!tir || !r.pasos) return null;
    const pm = r.pasos.find(x => x.contra !== undefined && x.contra !== null);
    let valor = r.pasos[0].valorFinal !== undefined ? r.pasos[0].valorFinal : r.pasos[0].valor;
    if (q.hasta === "muro" && pm) valor = pm.critico === tir.lado && pm.antes ? pm.antes : pm.contra;
    const pl = this._s.placa || (this._s.placa = { valor: 0, lado: 0 });
    pl.valor = valor; pl.lado = tir.lado;
    return valor === null || valor === undefined ? null : pl;
  },

  // la secuencia del gol (guia 8.6; 6.5 n): arriba la escena (HudDuelo), abajo negro y la
  // repeticion "Vídeo" de 7,8 a 9,63 s (completas)
  _gol(p, t, R, q, tt, dura) {
    const e = this.estado, A = e.arriba, B = e.abajo, tr = R.tramo;
    const completas = !R.corto && R.r && R.r.anim && R.r.anim.modo === "completas";
    A.modo = "gol"; A.tramo = tr; B.modo = "negro";
    tr.completas = completas;
    if (!completas) {
      // cortas (y el plan corto): la escena 2,5 s, fundido y negro; el mapa al final
      const f = dura / 4.4;
      if (tt >= 2.8 * f && tt < 3.8 * f) A.modo = "negro";
      else if (tt >= 3.8 * f) { A.modo = "mapa"; A.fundido = Math.max(0, 1 - (tt - 3.8 * f) / (0.1 * f)); }
      return;
    }
    if (tt >= 7.8 && tt < 9.77) {
      // el HUD con el marcador viejo arriba y la repeticion abajo
      A.modo = "mapa";
      A.fundido = tt < 7.9 ? 1 - (tt - 7.8) / 0.1 : tt > 9.63 ? (tt - 9.63) / 0.14 : 0;
      if (tt < 9.63) this._repeticion(p, tt - 7.8, 1.83);
      B.fundido = A.fundido;
    } else if (tt >= 9.77) {
      A.modo = "negro";
      if (tt > 10.7) { A.modo = "mapa"; A.fundido = 1 - (tt - 10.7) / 0.1; }
    }
  },

  // el descanso y el final (6.5 t y u)
  _secuencia(p, t, q) {
    const e = this.estado, A = e.arriba, B = e.abajo, ts = t - q.t0;
    B.tactil = false;
    if (q.que === "descanso") {
      const D = DIRECTOR.descanso, largo = q.mitad === 2, ro = largo ? D.largo : D.rotulo;
      const r = q.r || (q.r = this._rotulo(largo ? "reglamentario" : "descanso", { sub: q.mitad === 3 ? "prórroga" : "" }));
      r.de = 0; r.dura = ro;
      e.programa.push(r);
      if (ts < ro) {
        A.modo = "mapa";
        r.t = ts; e.rotulos.push(r);
        if (ts > ro - D.fundido) A.fundido = B.fundido = (ts - (ro - D.fundido)) / D.fundido;
      } else if (ts < ro + D.negro) { A.modo = "negro"; B.modo = "negro"; }
      else if (ts < ro + D.negro + D.fundido) { A.fundido = 1 - (ts - ro - D.negro) / D.fundido; B.tactil = true; }
      else B.tactil = true;
      return;
    }
    const F = DIRECTOR.final;
    if (!q.r) {
      const g = p.ganador ? p.ganador() : (p.goles[0] === p.goles[1] ? null : p.goles[0] > p.goles[1] ? 0 : 1);
      q.r = Object.assign(this._rotulo("final"), { de: 0, dura: F.rotulo });
      q.r2 = Object.assign(this._rotulo(g === this.yo ? "victoria" : g === null ? "empate" : "derrota"), { de: F.lado, dura: F.ladoDura });
    }
    e.programa.push(q.r, q.r2);
    if (ts < F.negro) {
      A.modo = "mapa";
      if (ts < F.rotulo) { q.r.t = ts; e.rotulos.push(q.r); }
      if (ts >= F.lado && ts < F.lado + F.ladoDura) { q.r2.t = ts - F.lado; e.rotulos.push(q.r2); }
      if (ts > F.negro - 0.1) A.fundido = B.fundido = (ts - (F.negro - 0.1)) / 0.1;
    } else if (ts < F.pantalla) { A.modo = "negro"; B.modo = "negro"; }
    else { B.tactil = true; if (ts < F.pantalla + 0.1) A.fundido = 1 - (ts - F.pantalla) / 0.1; }
  },

  // la cola de los rotulos que no son del plan (uno detras de otro) y los sueltos
  // (invocacion, supertactica: encima del juego, a la vez)
  _cola(p, t, ocupado) {
    const S = this._s, e = this.estado;
    let r = S.cola[0];
    while (r && r.de !== undefined && t - r.de > r.dura) { S.cola.shift(); r = S.cola[0]; }
    // que no se acumulen: el que se ve y los dos ultimos
    while (S.cola.length > 3) S.cola.splice(1, 1);
    if (r && r.de === undefined && !ocupado) r.de = t;
    if (r && r.de !== undefined) {
      r.t = t - r.de; e.rotulos.push(r); e.programa.push(r);
      if (r.que === "cambios" || r.que === "saque") e.abajo.tactil = false;
    }
    for (let i = S.sueltos.length - 1; i >= 0; i--) {
      const s = S.sueltos[i];
      if (t - s.de > s.dura) { S.sueltos.splice(i, 1); continue; }
      s.t = t - s.de; e.rotulos.push(s);
    }
  },

  // un rotulo (ROTULOS_GX de partido-rotulos.js) con sus datos
  _rotulo(que, ro) {
    const d = (typeof ROTULOS_GX !== "undefined" && ROTULOS_GX[que]) || { texto: que, dura: 1.2 };
    return { que, texto: d.texto, dura: d.dura, sub: (ro && ro.sub) || "", lado: ro && (ro.lado === 0 || ro.lado === 1) ? ro.lado : null, t: 0 };
  },
  // el rotulo de un tramo del plan (uno por tramo, guardado), o null
  _rotuloPlan(p, R, q) {
    const i = R.plan.tramos.indexOf(q);
    if (i < 0) return null;
    if (R.rot[i] !== undefined) return R.rot[i];
    const r = R.r || {}, J = id => p.jugadores[id] || {};
    let ro = null;
    if (q.que === "bloqueo") ro = Object.assign(this._rotulo("bloqueo"), { lado: J(q.jugador).lado });
    else if (q.que === "porEncima") ro = this._rotulo("porEncima");
    else if (q.que === "fueraTiro") ro = this._rotulo(q.desviado ? "desviado" : "fueraTiro");
    else if (q.que === "tandaRotulo") ro = Object.assign(this._rotulo(q.gol ? "tandaGol" : "tandaParada"), { sub: J(q.gol ? r.tirador : r.portero).nombre || "" });
    else if (q.que === "falta") ro = Object.assign(this._rotulo("falta"), { sub: J(r.defensor).nombre ? "de " + J(r.defensor).nombre + " sobre " + J(r.atacante).nombre : "" });
    else if (q.que === "tarjeta" && r.tarjeta) ro = Object.assign(this._rotulo(r.tarjeta.que === "roja" ? "roja" : "amarilla"), { sub: (J(r.tarjeta.quien).nombre || "") + (r.tarjeta.segunda ? " · segunda amarilla" : "") });
    else if (q.que === "penaltiRotulo") ro = Object.assign(this._rotulo("penalti"), { sub: "Para " + (p.nombres[J(r.atacante).lado] || "") });
    else if (q.que === "fueraJuego") ro = Object.assign(this._rotulo("fuera"), { sub: J(r.quien).nombre || "" });
    else if (q.que === "chico") ro = this._rotulo(q.rotulo, q.ro);
    if (ro) { ro.de = q.de; ro.a = q.a; ro.dura = q.a - q.de; }
    R.rot[i] = ro;
    return ro;
  },
};
Director.reiniciar();
