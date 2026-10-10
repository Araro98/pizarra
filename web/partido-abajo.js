/* La tactil como GO Galaxy (NOTAS O-318; diseno 5.8; guia 2 "ABAJO", 8.3, 8.8 y 8.9).
   Todo lo que antes iba en los paneles de al lado, dentro de la pantalla de abajo: la
   columna de hexagonos (Pausa, TS, Aura con su numero, T), las tacticas y los espiritus
   en paneles que no paran el juego, la pausa y el tiempo de tactica con sus botones, el
   Menu, Equipo (los cambios, como la formacion de p26), Registro, el duelo (franja,
   barra de tres botones, lista 2x4, franja morada del espiritu y caja de ayuda), el
   penalti, la espera, las estadisticas y los avisos.
   Abajo.que(p, yo, ctx) decide QUE se ensena, sin DOM (la prueba la llama); pintar() lo
   pone en #pantalla-juego (dentro de #abajo-dom, 320x240 u con zoom) solo cuando cambia
   su clave, con las defensas de los clics de siempre (O-305): el segundo clic de un
   doble clic no cuenta, ni un clic en algo que acaba de salir (300 ms), y no se rehace
   con el raton apretado. Las ordenes van por Abajo.acc (las pone partido.js). */
"use strict";

// los sitios de la guia, en u [x, y, ancho, alto]: la fila del Menu (b13, m07), Jugar y
// Menu del tiempo de tactica (b15, m06), el "Oui" de las estadisticas (b44, mas ancho:
// "Segunda parte" no cabe en 68 u), el Atras de la espera (b18) y los de la lista (b27)
const ABAJO_FILA4 = [[6, 200, 68, 35], [87, 200, 70, 35], [166, 200, 70, 35], [246, 200, 70, 35]];
const ABAJO_SAQUE = [[72, 198, 71, 32], [176, 198, 70, 32]];
const ABAJO_OUI = [204, 206, 114, 32];
const ABAJO_IZQ = [2, 206, 72, 32];
const ABAJO_ATRAS = [268, 208, 50, 30];
const ABAJO_OK = [110, 206, 97, 30];
// Repetir (azul) y Reanudar partido (verde) tras el gol (b48), en medio del campo
const ABAJO_TRASGOL = [[118, 62, 84, 30], [104, 142, 112, 30]];
const ABAJO_SAQUES = { centro: "Saque de centro", banda: "Saque de banda", corner: "Córner", puerta: "Saque de puerta", falta: "Tiro libre", penalti: "Penalti" };
// lo que dice la franja del duelo en cada paso (CS espanol; guia 9) [A CONFIRMAR: Galaxy
// pone al reves la del que lleva el balon]. Muro, cadena y el tiro largo de la T (O-326)
// son de Pizarra
const ABAJO_FRANJA = { ataque: "¡Esquiva la defensa del oponente!", defensa: "¡Detén el regate del oponente!", tiro: "¡Elige un tiro!",
  cadena: "¿Encadenas el tiro?", muro: "¡Bloquea el tiro!", portero: "¡Defiende la portería!", largo: "¡Elige un tiro largo!" };
const ABAJO_TIPO = { ataque: "regate", defensa: "defensa", tiro: "tiro", cadena: "tiro para encadenar", muro: "bloqueo", portero: "parada" };
const ABAJO_PARTES = ["1.ª", "2.ª", "1.ª pr.", "2.ª pr."];
const ABAJO_PASA = "Como en Victory Road: el que entra tiene AT y DF +";

const Abajo = {
  ui: null,                 // lo que ha abierto la persona (paneles, pestanas, lo marcado)
  acc: {},                  // las ordenes (partido.js): ordenar, elegir, pausa, seguir, dejar, otro, salir, apuntar, zonaCampo, elegirJugador
  contexto: null,           // partido.js: () => lo que Abajo necesita saber de la pagina (ver que())
  ultimoAviso: "",          // el ultimo aviso de la franja (para las pruebas)
  _raiz: null, _clave: "", _forma: "", _formaT: -1e9, _v: null, _auras: {}, _franja: null, _avisoT: null, _cuenta: null,

  reiniciar(o = {}) {
    this.ui = { fase: null, panel: null, menu: false, sub: null, subDe: null, pestTactica: "tacticas", pestRegistro: "pasa",
      aura: null, tac: null, eqCampo: null, eqBanco: null, lista: false, pagina: 0, marcada: null,
      duelo: null, paso: null, penal: "normal", vAviso: false, salir: 0, formaciones: o.formaciones || ["", ""] };
    this.enPartido = !!o.enPartido;
    this._clave = ""; this._forma = ""; this._auras = {}; this._v = null;
    return this.ui;
  },

  // ---------------------------------------------------------------------------------
  // QUE se ensena. ctx (de partido.js, o de la prueba): { demo, modo ("maquina" |
  // "anfitrion" | "invitado"), listo (ya pulsaste Jugar/Seguir en esta espera), elegidos
  // (Set de los duelos ya elegidos), ayudante (focos automaticos), elegido (el de abajo),
  // espera (textoEspera(p)), boton (botonDescanso(p)), libres (suplentesLibres), rival
  // (su nombre), red: { fuera, dejado, rival, callado (min sin noticias), noPulsa } }.
  // Devuelve { vista, botones: [{id, texto, color, si, porque, pulsado, pos, accion}],
  // columna, panel, rotulo, ayuda, duelo, lista, penalti, equipo, registro, tactica,
  // estadisticas, fuera, espera, franja }
  que(p, yo, ctx = {}) {
    const u = this.ui || this.reiniciar();
    const v = { vista: "nada", botones: [] };
    this._yo = yo; this._p = p;      // (el partido, para la T al pulsarla, O-326)
    if (!p) return v;
    // al cambiar de fase se cierra lo que era de la anterior (el compacto, el Menu...)
    if (u.fase !== p.fase) {
      u.fase = p.fase; u.panel = null; u.menu = false; u.sub = null; u.eqCampo = null; u.eqBanco = null; u.tac = null;
    }
    const red = ctx.red || {};
    // el rival se ha ido (o lo has dejado tu): ya no hay nada que pulsar (O-305, O-308)
    if (red.fuera && p.fase !== "final") return this._fuera(v, p, yo, ctx);
    // mientras el Director ensena el descanso o el final (el rotulo, el negro), la tactil
    // aun no sale (O-319)
    if (ctx.tactil === false) { v.vista = "anim"; return v; }
    if (p.fase === "final") return this._estad(v, p, yo, ctx, true);
    if (p.fase === "descanso") {
      if (!ctx.demo && u.sub) return this._sub(v, p, yo, ctx);
      this._estad(v, p, yo, ctx, false);
      if (!ctx.demo && u.menu) this._menu4(v, p, yo, ctx);
      return this._red(v, ctx);
    }
    // maquina contra maquina (?demo): sin columna ni botones, como antes
    if (ctx.demo) { v.vista = p.fase === "juego" ? "juego" : "anim"; return v; }
    if (p.fase === "duelo" && p.duelo) return this._duelo(v, p, yo, ctx);
    // el tiempo de invocacion: el panel de auras en toda la tactil (O-327)
    if (p.fase === "invocacion") return this._red(this._tiempoInvocar(v, p, yo, ctx), ctx);
    // tras el gol, en la espera del saque de centro: Repetir / Reanudar (b48; O-319)
    if (ctx.trasGol && p.fase === "saque") return this._trasGol(v, ctx);
    if (p.parado()) {
      if (u.sub) return this._sub(v, p, yo, ctx);
      this._esperaSaque(v, p, yo, ctx);
      if (p.fase === "saque" && u.menu) this._menu4(v, p, yo, ctx);
      return this._red(v, ctx);
    }
    if (p.fase === "juego") return this._juego(v, p, yo, ctx);
    // el resultado de un duelo y el gol: el campo sin columna ni botones (Galaxy pone la
    // tactil en negro durante las animaciones: E4)
    v.vista = "anim";
    return this._red(v, ctx);
  },

  // un boton de menu de Galaxy (b13, b15): verde o azul; apagado con su porque; pulsado
  // (naranja) cuando ya se ha pulsado y se espera al otro
  _b(id, texto, color, si, porque, pos, accion, mas) {
    return Object.assign({ id, texto, color: color || "verde", si: !!si, porque: si ? "" : porque || "", pos, accion }, mas || {});
  },
  _cap(t) { t = String(t || ""); return t ? t[0].toUpperCase() + t.slice(1) : t; },

  // online: el rival sin noticias (O-308); da igual lo que se este ensenando
  _red(v, ctx) {
    const red = ctx.red || {};
    if (red.callado && !v.espera) v.espera = { texto: "Espera unos instantes...", linea: (red.rival || "El rival") + " no responde desde hace " + red.callado + " min: puedes esperarle o dejar el partido", dejar: true };
    return v;
  },

  // --- en juego: la columna y los paneles compactos -----------------------------------
  _juego(v, p, yo, ctx) {
    const u = this.ui;
    v.vista = "juego";
    v.columna = this._columna(p, yo, ctx);
    if (u.panel === "tacticas") v.panel = { que: "tacticas", tacticas: this._tacticas(p, yo) };
    else if (u.panel === "espiritus") v.panel = Object.assign({ que: "espiritus" }, this._espiritus(p, yo, ctx));
    // tras pulsar Jugar, hasta que se saca: que nadie se mueve y como se saca (O-324);
    // online, si el rival no saca en un minuto, esperarle o dejar el partido
    else if (ctx.sacar) v.ayuda = { lineas: this._dosLineas(ctx.sacar) };
    // con el tiro en vuelo: llevar a los tuyos a su camino (O-325)
    else if (ctx.vuelo) v.ayuda = { lineas: this._dosLineas(ctx.vuelo) };
    const red = ctx.red || {};
    if (ctx.sacar && red.noPulsa && p.porSacar && p.porSacar.lado !== yo)
      v.espera = { texto: "Espera unos instantes...", linea: (red.rival || "El rival") + " aún no ha sacado: puedes esperarle o dejar el partido", dejar: true };
    return this._red(v, ctx);
  },

  // la columna de hexagonos (m02, b01, b02): sin relleno = se puede; relleno verde oscuro
  // = no ahora (con su porque). El numero del aura: las invocaciones que se pueden hacer
  // ya (la hiperbarra, el limite de 2 activos y los 15 s entre una y otra, O-310)
  _columna(p, yo, ctx) {
    const pausas = REGLAS.PAUSAS_POR_PARTE > 0;
    const mano = { si: !pausas || p.pausasQuedan[yo] > 0, porque: "No te quedan pausas en esta parte" };
    const tac = this._tacticas(p, yo), activa = p.tacticaActiva[yo];
    const vuelve = tac.find(t => /^vuelve en/.test(t.estado));
    const ts = { si: tac.some(t => t.si), porque: !tac.length ? "Tu equipo no lleva tácticas"
      : activa && tac[activa.k] ? "Táctica activa: " + tac[activa.k].nombre + " (" + tac[activa.k].estado + ")"
      : "Ninguna táctica lista" + (vuelve ? ": " + vuelve.nombre + " " + vuelve.estado : "") };
    const au = this._contarAura(p, yo);
    let aura = { si: au.n > 0, n: au.n, porque: au.porque };
    // con el tiempo de invocacion (O-327) el aura PARA el juego para invocar; apagada
    // mientras vuelve ("Vuelve en 12 s") o si no se puede invocar a nadie
    if (p.conTiempoInvocar) {
      const ti = p.puedeTiempoInvocar(yo);
      aura = { si: au.n > 0 && ti.si, n: au.n, porque: ti.si ? au.porque : this._cap(ti.porque), parar: true };
    }
    return { mano, ts, aura, t: this._botonT(p, yo) };
  },
  // el aura con el tiempo de invocacion: para el juego (orden "tiempoInvocar", O-327)
  pedirInvocacion() {
    const p = this._p, yo = this._yo;
    if (!p) return;
    const r = p.puedeTiempoInvocar(yo);
    if (!r.si) return this.aviso(this._cap(r.porque));
    if (this.acc.ordenar) this.acc.ordenar({ tipo: "tiempoInvocar", lado: yo });
  },
  // la T (O-326; Aaron, O-322 punto 4): el tiro largo del tuyo que lleva el balon o, si no
  // tiene (o no le llega), un pase hacia delante. Lo que hara se lee debajo (etiqueta) y en
  // su titulo; la orden se saca otra vez al pulsar (Partido.botonT), aqui solo los nombres:
  // con las coordenadas del hueco la tactil se rehacia en cada cuadro. Antes la T ponia la
  // ficha grande arriba: ahora sale en Equipo
  _botonT(p, yo) {
    const d = p.dueno();
    const b = d && d.lado === yo && p.botonT ? p.botonT(d) : { que: null, porque: "La T es del que lleva el balón: su tiro largo o, si no tiene, un pase hacia delante" };
    if (!b.que) return { si: false, que: null, etiqueta: [], porque: b.porque };
    const a = b.a !== null && b.a !== undefined ? p.jugadores[b.a] : null, sin = b.sinTiro ? " (" + b.sinTiro + ")" : "";
    if (b.que === "tiro") return { si: true, que: "tiro", etiqueta: ["Tiro", "largo"],
      titulo: "Tiro largo de " + d.nombre + " a " + b.distancia + " m: " + b.tecnicas.filter(o => o.puede).map(o => o.nombre + " (TEN " + o.tp + ")").join(", ") + ". Va como un tiro normal" };
    if (b.que === "pase") return { si: true, que: "pase", etiqueta: ["Pase", "adelante"], titulo: "Pase hacia delante a " + a.nombre + sin };
    return { si: true, que: "hueco", etiqueta: ["Pase", "al hueco"], titulo: "Pase al hueco, hacia delante" + (a ? " (va " + a.nombre + ")" : "") + sin };
  },
  // si el raton esta encima de la T (el HUD de abajo pinta adonde iria, O-326)
  encimaT() {
    try { return typeof document !== "undefined" && !!document.querySelector("#boton-t:hover"); } catch (e) { return false; }
  },
  // pulsar la T: lo que diga el motor ahora (el tiro largo con su X en el centro de la
  // porteria, el pase o el pase al hueco)
  pulsarT() {
    const p = this._p, yo = this._yo, d = p && p.dueno();
    const b = d && d.lado === yo && p.botonT ? p.botonT(d) : null;
    if (!b || !b.que) return this.aviso(b ? b.porque : "La T es del que lleva el balón: su tiro largo o, si no tiene, un pase hacia delante");
    if (b.que === "tiro" && this.acc.apuntar) this.acc.apuntar(0, p.porteriaRival(d).y);
    if (this.acc.ordenar) this.acc.ordenar(b.orden);
  },
  _contarAura(p, yo) {
    const con = p.equipo(yo).filter(j => j.espiritu);
    if (!con.length) return { n: 0, porque: "Nadie de tu equipo tiene espíritu" };
    const pueden = con.filter(j => p.puedeHiper(j).si).length;
    const n = Math.max(0, Math.min(pueden, Math.floor(p.hiper[yo] / REGLAS.HIPER_COSTE), REGLAS.HIPER_ACTIVAS_MAX - p.hiperActivas(yo)));
    const quien = con.find(j => !p.conAura(j)) || con[0];
    return { n, porque: n > 0 ? "" : this._cap(p.puedeHiper(quien).porque) };
  },

  // las tacticas de tu equipo con su estado (lo de pintarTacticas de antes, O-290, O-304,
  // O-310): tambien en la pausa y en la espera de un saque, salvo las que quitan el balon
  // o aturden (solo con el balon en juego)
  _tacticas(p, yo) {
    const tac = p.tacticas[yo] || [], ahora = p.segundosDeJuego(), activa = p.tacticaActiva[yo];
    // (antes de que se saque, el balon tampoco esta en juego, O-324)
    const parado = p.parado() || !!p.porSacar, vale = p.fase === "juego" || parado;
    return tac.map((t, k) => {
      const espera = Math.max(0, Math.ceil(p.tacticaLista[yo][k] - ahora));
      const esActiva = !!activa && activa.k === k, sinEfecto = !(t.efectos || []).length, soloJuego = parado && p.tacticaSoloEnJuego(t);
      const estado = sinEfecto ? "sin efecto en el partido" : esActiva ? "activa " + Math.ceil(activa.hasta - ahora) + " s"
        : espera > 0 ? "vuelve en " + espera + " s" : soloJuego ? "solo con el balón en juego" : activa ? "hay otra activa" : !vale ? "ahora no" : "lista";
      const si = !(sinEfecto || esActiva || !!activa || espera > 0 || !vale || soloJuego);
      return { k, nombre: t.nombre, estado, si, activa: esActiva, texto: [t.descripcion, t.texto].filter(Boolean).join(" · ") };
    });
  },

  // lo que da la hipertecnica de j (O-310), para la tarjeta del espiritu
  textoHiper(j) {
    const T = REGLAS.HIPER_TIPOS[j.hiperTipo];
    if (!T) return "";
    const pr = REGLAS.HIPER_PROPIOS[j.espiritu && j.espiritu.id] || {};
    return T.nombre + ": dura " + T.dura + " s y vuelve a los " + T.recarga + " s · AT y DF +" + T.atdf + " %"
      + (T.porFoco ? " (+" + T.porFoco + " % por foco ganado, hasta " + T.atdfTope + " %)" : "")
      + (T.poder ? " · poder de sus supertécnicas +" + T.poder + " %" : "") + (T.pp || pr.pp ? " · de portero, parada +" + ((T.pp || 0) + (pr.pp || 0)) + " %" : "")
      + (pr.df ? " · DF +" + pr.df + " %" : "") + (pr.muro ? " · muro +" + pr.muro + " %" : "") + " · corre más";
  },

  // el panel de auras (p19, m09, b39-b41) con los datos de O-310: las 11 caras de los
  // tuyos (los que no tienen espiritu, apagados), la tarjeta del elegido, el mensaje y
  // si se puede invocar. Se invoca cuando quieras sin parar el juego (O-307 punto 10)
  _espiritus(p, yo, ctx) {
    const u = this.ui;
    const mios = p.equipo(yo);
    const vale = j => j && j.lado === yo && !j.expulsado && j.espiritu;
    let sel = u.aura !== null ? p.jugadores[u.aura] : null;
    if (!vale(sel)) {
      const e = ctx.elegido !== null && ctx.elegido !== undefined ? p.jugadores[ctx.elegido] : null;
      // el elegido si puede invocar; si no, el primero que puede (y si nadie, el elegido)
      sel = (vale(e) && p.puedeHiper(e).si ? e : null) || mios.find(j => j.espiritu && p.puedeHiper(j).si) || (vale(e) ? e : null) || mios.find(j => j.espiritu) || null;
    }
    u.aura = sel ? sel.id : null;
    const caras = mios.map(j => ({ id: j.id, cara: j.cara, nombre: j.nombre, con: !!j.espiritu, activo: p.conAura(j), sel: j === sel }));
    const hb = Math.floor(p.hiper[yo]);
    if (!sel) return { activos: p.hiperActivas(yo), max: REGLAS.HIPER_ACTIVAS_MAX, caras, tarjeta: null, hiper: hb,
      mensaje: "Nadie de tu equipo tiene espíritu", invocar: { si: false, porque: "Nadie de tu equipo tiene espíritu" } };
    const T = REGLAS.HIPER_TIPOS[sel.hiperTipo] || REGLAS.HIPER_TIPOS.keshin, activo = p.conAura(sel), ahora = p.segundosDeJuego();
    // en el tiempo de invocacion, uno por parada; con el balon en juego, solo parando el
    // juego con el aura (O-327)
    const ti = p.tiempoInvocar, enParada = p.fase === "invocacion";
    const ph = p.puedeHiper(sel), cuando = enParada ? !!ti && ti.hechos[yo] < 0 && !(p.listos && p.listos[yo]) : (p.fase === "juego" && !p.conTiempoInvocar) || p.parado();
    const porque = !ph.si ? ph.porque : !cuando ? (enParada ? "ya has elegido en esta parada"
      : p.fase === "juego" && p.conTiempoInvocar ? "pulsa el aura: el juego se para para invocar" : "con el juego en marcha, en la pausa o en el saque") : "";
    return {
      activos: p.hiperActivas(yo), max: REGLAS.HIPER_ACTIVAS_MAX, caras, hiper: hb, jugador: sel.id, nombre: sel.nombre,
      tarjeta: { espiritu: sel.espiritu.nombre, familia: T.nombre.toUpperCase(), elemento: sel.elemento || "", cara: sel.cara,
        hip: REGLAS.HIPER_COSTE, atdf: "+" + T.atdf + " %", dura: T.dura + " s", activo, queda: activo ? Math.ceil(sel.aura - ahora) : 0,
        texto: this.textoHiper(sel) },
      mensaje: activo ? sel.nombre + " tiene su espíritu activo (" + Math.ceil(sel.aura - ahora) + " s)" : ph.si && cuando ? "¡Se puede invocar!" : this._cap(porque) + " (hiperbarra " + hb + ")",
      invocar: { si: ph.si && cuando, porque: this._cap(porque) },
    };
  },

  // --- el tiempo de invocacion (O-327; Aaron, O-322 punto 5; guia 8.8) -----------------
  // El juego parado y el panel de auras (p19) en toda la tactil: eliges a quien invocas
  // y [Invocar], o [Seguir] sin invocar. Los dos a la vez, uno cada uno; arriba, quien la
  // ha pedido y lo que ha invocado el rival. Online, la caja de espera y la cuenta
  _tiempoInvocar(v, p, yo, ctx) {
    const ti = p.tiempoInvocar || { lado: yo, hechos: [-1, -1], t: 0 }, listo = !!ctx.listo;
    const e = this._espiritus(p, yo, ctx), rival = ctx.rival || "el rival";
    const J = id => (id >= 0 ? p.jugadores[id] : null), suyo = J(ti.hechos[1 - yo]), mio = J(ti.hechos[yo]);
    const nombre = j => (j.propio ? j.propio.nombre : j.nombre);
    v.vista = "invocacion";
    v.invocacion = Object.assign({}, e, {
      titulo: "¡Tiempo de invocación!",
      quien: suyo ? this._cap(rival) + " invoca: " + nombre(suyo) + " · " + (suyo.espiritu || {}).nombre
        : ti.lado === yo ? "Lo has pedido tú" : "Lo ha pedido " + rival,
      cuenta: p.limiteDuelo ? Math.max(0, Math.ceil(REGLAS.TIEMPO_INVOCAR.limite - (ti.t || 0))) + " s" : "",
    });
    if (mio) v.invocacion.mensaje = "Has invocado a " + mio.espiritu.nombre + (listo && ctx.modo && ctx.modo !== "maquina" ? ": esperando a " + rival : "");
    else if (listo) v.invocacion.mensaje = "Sigues sin invocar: esperando a " + rival;
    v.botones = [
      this._b("invocar", "Invocar", "verde", e.invocar.si && !listo, listo ? "Ya has elegido: esperando a " + rival : e.invocar.porque, ABAJO_FILA4[0],
        () => this.acc.invocarEnParada ? this.acc.invocarEnParada(e.jugador) : this.acc.ordenar && this.acc.ordenar({ tipo: "invocar", jugador: e.jugador })),
      this._b("boton-pausa", "Seguir", "azul", !listo, "Ya has elegido: esperando a " + rival, ABAJO_FILA4[3],
        () => this.acc.seguir && this.acc.seguir(), { pulsado: listo, titulo: "Seguir sin invocar (barra espaciadora)" }),
    ];
    if (listo && ctx.modo && ctx.modo !== "maquina") v.espera = this._cajaEspera(ctx);
    return v;
  },

  // --- la pausa y el tiempo de tactica (t22, b12-b16, m06, m07) ------------------------
  _esperaSaque(v, p, yo, ctx) {
    const u = this.ui, saque = p.fase === "saque", listo = !!ctx.listo, s = p.esperaSaque || {};
    v.vista = saque ? "saque" : "pausa";
    v.rotulo = saque ? { texto: "Tiempo de táctica", caja: ABAJO_SAQUES[s.tipo] || "Saque" } : { texto: "Pausa", caja: p.pausa ? "de " + p.nombres[p.pausa.lado] : "" };
    v.ayuda = { camara: true, lineas: this._dosLineas(ctx.espera || "") };
    // en el saque, como se coloca el que has elegido (o por que no se mueve) (O-313)
    const j = ctx.elegido !== null && ctx.elegido !== undefined ? p.jugadores[ctx.elegido] : null;
    // Las carreras, tras pulsar Jugar (O-324)
    if (saque && j && j.lado === yo && !j.expulsado && p.colocable) v.ayuda.extra = p.colocable(j)
      ? j.nombre + ": arrástralo para colocarlo donde quieras, menos muy cerca del balón. Su carrera, tras pulsar Jugar."
      : (p._fijoEnSaque(j) || j.nombre + " no se mueve") + (p.balon.dueno === j.id && s.tipo !== "penalti" ? ". Saca tras pulsar Jugar." : "");
    const seguir = this._b("boton-pausa", saque ? "Jugar" : "Seguir", saque ? "verde" : "azul", !listo, "Ya has pulsado: esperando a " + (ctx.rival || "el rival"),
      saque ? ABAJO_SAQUE[0] : ABAJO_FILA4[3], () => this.acc.seguir && this.acc.seguir(), { pulsado: listo, titulo: "Barra espaciadora" });
    if (saque) v.botones = [seguir, this._b("menu", "Menú", "verde", true, "", ABAJO_SAQUE[1], () => { u.menu = true; })];
    else v.botones = this._fila(p, yo, ctx, "pausa").concat([seguir]);
    // online, tras pulsar: "Espera unos instantes..." hasta que pulse el otro (O-308)
    if (listo && ctx.modo && ctx.modo !== "maquina") v.espera = this._cajaEspera(ctx);
    return v;
  },
  // "Corner para Raimon. Coloca a tus jugadores..." en dos lineas (b16)
  _dosLineas(t) {
    const m = String(t).match(/^(.*?[.:])\s+(.*)$/);
    return m ? [m[1], m[2]] : [String(t)];
  },
  // la fila del Menu (b13): [Registro] [Equipo] [Tactica] y el cuarto (Seguir o Atras)
  _fila(p, yo, ctx, de) {
    const u = this.ui, libres = ctx.libres || [], abre = sub => () => { u.subDe = u.menu ? "menu" : null; u.sub = sub; u.menu = false; };
    const pend = p.cambiosPendientes[yo] || [];
    const cambia = p.puedeCambiar(yo) && libres.length > 0;
    return [
      this._b("registro", "Registro", "verde", true, "", ABAJO_FILA4[0], abre("registro")),
      this._b("equipo", "Equipo", "verde", cambia || pend.length > 0, p.cambiosQuedan[yo] - pend.length <= 0 ? "No te quedan cambios" : "No quedan suplentes", ABAJO_FILA4[1], abre("equipo")),
      this._b("tactica", "Táctica", "verde", de !== "descanso", "En el descanso no hay tácticas ni espíritus", ABAJO_FILA4[2], abre("tactica")),
    ];
  },
  // el Menu de 4 (m07): en la espera del saque y en el descanso
  _menu4(v, p, yo, ctx) {
    const u = this.ui;
    v.fondo = v.vista; v.vista = "menu";
    v.botones = this._fila(p, yo, ctx, p.fase === "descanso" ? "descanso" : "saque")
      .concat([this._b("atras", "Atrás", "azul", true, "", ABAJO_FILA4[3], () => { u.menu = false; })]);
    return v;
  },
  _cajaEspera(ctx) {
    const red = ctx.red || {};
    return { texto: "Espera unos instantes...", linea: red.noPulsa ? (red.rival || "El rival") + " aún no ha pulsado: puedes esperarle o dejar el partido" : "", dejar: !!red.noPulsa };
  },

  // --- Registro, Equipo y Tactica (la tactil entera) ---------------------------------
  _sub(v, p, yo, ctx) {
    const u = this.ui;
    const atras = this._b("atras", "Atrás", "azul", true, "", ABAJO_FILA4[3], () => { u.sub = null; u.menu = u.subDe === "menu"; u.eqCampo = null; u.eqBanco = null; });
    if (u.sub === "equipo") return this._equipo(v, p, yo, ctx, atras);
    if (u.sub === "registro") return this._registro(v, p, yo, ctx, atras);
    return this._tactica(v, p, yo, ctx, atras);
  },

  // Registro: "Lo que pasa" (se pinta de p.eventos al abrirlo) y "Como se juega"; Salir
  // del partido (online manda "adios", O-305) con un segundo clic para no salir sin
  // querer; y "Dejar el partido" cuando el rival no responde (O-308)
  _registro(v, p, yo, ctx, atras) {
    const u = this.ui, red = ctx.red || {};
    v.vista = "registro";
    v.registro = { pest: u.pestRegistro, n: p.eventos.length };
    const seguro = Date.now() - u.salir < 3000;
    v.botones = [this._b("salir", seguro ? "¿Salir? Otra vez" : "Salir del partido", "verde", true, "", [6, 200, 110, 35],
      () => { if (Date.now() - u.salir < 3000) this.acc.salir && this.acc.salir(); else u.salir = Date.now(); }, { pulsado: seguro })];
    if (red.callado || red.noPulsa) v.botones.push(this._b("dejar", "Dejar el partido", "verde", true, "", [122, 200, 116, 35], () => this.acc.dejar && this.acc.dejar()));
    v.botones.push(atras);
    return v;
  },

  // Equipo (p26) [Galaxy "Equip."]: el mini campo con las caras en los PUESTOS de la
  // formacion (el que entra ocupa el del que salio), el banquillo, los recursos del
  // equipo (tension e hiperbarra, en el cuadro "Coach") y los cambios: se elige uno del
  // campo y uno del banquillo y [Cambiar]. En la pausa entra al pararse el balon (O-308)
  _equipo(v, p, yo, ctx, atras) {
    const u = this.ui, pend = p.cambiosPendientes[yo] || [], banco = p.banquillos[yo] || [];
    v.vista = "equipo";
    const total = REGLAS.CAMBIOS + (p.prorroga ? REGLAS.CAMBIOS_PRORROGA : 0), quedan = p.cambiosQuedan[yo] - pend.length;
    const puede = p.puedeCambiar(yo);
    let campo = u.eqCampo !== null ? p.jugadores[u.eqCampo] : null;
    if (!campo || campo.lado !== yo || campo.expulsado) { campo = null; u.eqCampo = null; }
    const libre = k => !p.banquilloUsado[yo][k] && !pend.some(c => c.entra === k);
    if (u.eqBanco !== null && !libre(u.eqBanco)) u.eqBanco = null;
    const suCambio = campo ? pend.find(c => c.sale === campo.id) : null;
    const refuerzo = j => { const r = p.refuerzo ? p.refuerzo(j) : null; return r ? { pct: r.pct, queda: Math.ceil(r.queda), entro: r.entro } : null; };
    const jugadores = p.jugadores.filter(j => j.lado === yo).map(j => {
      const c = pend.find(x => x.sale === j.id);
      return { id: j.id, nombre: j.nombre, cara: j.cara, u: j.u || 0, v: j.v || 0, sel: !!campo && campo.id === j.id, expulsado: !!j.expulsado,
        amarilla: !j.expulsado && j.amarillas > 0, refuerzo: refuerzo(j), entra: c ? (banco[c.entra] || {}).nombre || "?" : null };
    });
    const suplentes = banco.map((d, k) => ({ k, nombre: d.nombre, cara: d.cara, posicion: d.posicion || "", elemento: d.elemento || "",
      usado: !!p.banquilloUsado[yo][k], pendiente: pend.some(c => c.entra === k), sel: u.eqBanco === k }));
    const quien = u.eqBanco !== null ? banco[u.eqBanco] : campo;
    const ficha = quien ? { nombre: quien.nombre, cara: quien.cara, linea: [GX.posicionCorta(quien.posicion), quien.elemento === "Montana" ? "Montaña" : quien.elemento].filter(Boolean).join(" · "),
      notas: [] } : null;
    if (ficha && campo && quien === campo) {
      const rf = refuerzo(campo);
      if (rf) ficha.notas.push((rf.entro ? "Recién entrado" : "Cambio en su posición") + ": AT y DF +" + rf.pct + " % (" + rf.queda + " s)");
      if (campo.amarillas) ficha.notas.push("Tarjeta amarilla: otra sería roja");
      if (suCambio) ficha.notas.push("Sale por " + ((banco[suCambio.entra] || {}).nombre || "?"));
    }
    if (ficha && u.eqBanco !== null) ficha.notas.push("En el banquillo");
    const R = REGLAS.CAMBIO_REFUERZO;
    const mensaje = !puede && !pend.length ? (quedan <= 0 ? "No te quedan cambios" : "Ahora no se puede cambiar")
      : suCambio ? "Entrará " + ((banco[suCambio.entra] || {}).nombre || "?") + " por " + campo.nombre + " cuando se pare el balón"
      : campo && u.eqBanco !== null ? "Entra " + banco[u.eqBanco].nombre + " por " + campo.nombre + (p.fase === "pausa" ? " cuando se pare el balón" : "") + ": pulsa Cambiar"
      : campo ? campo.nombre + ": elige en el banquillo quién entra"
      : u.eqBanco !== null ? "Elige en el campo a quién cambias"
      : "Elige a uno del campo y a uno del banquillo";
    v.equipo = {
      formacion: (u.formaciones && u.formaciones[yo]) || "", equipo: p.nombres[yo], jugadores, suplentes, ficha, mensaje,
      tension: [Math.round(p.tension[yo]), REGLAS.TENSION_MAX], hiper: [Math.floor(p.hiper[yo]), REGLAS.HIPER_MAX],
      cambios: quedan > 0 ? "Cambios: te quedan " + quedan + " de " + total : "Cambios: no te quedan",
      reglas: R ? ABAJO_PASA + R.entra + " % durante " + R.segundos + " s de juego y los de su misma posición +" + R.posicion
        + " %. Cada cambio suma " + REGLAS.CAMBIO_DESCUENTO + " s de descuento a la parte (en el descanso, no). El que sale ya no vuelve."
        + (p.fase === "pausa" ? " En la pausa, el cambio entra cuando se pare el balón." : "") : "",
      pendientes: pend.map(c => "Entrará " + ((banco[c.entra] || {}).nombre || "?") + " por " + ((p.jugadores[c.sale] || {}).nombre || "?")),
      expulsado: "Expulsado (roja): no se le puede cambiar",
    };
    const okCambio = puede && !!campo && !suCambio && u.eqBanco !== null && quedan > 0;
    v.botones = [
      this._b("cambiar", "Cambiar", "verde", okCambio, !puede ? v.equipo.mensaje : !campo ? "Elige a uno del campo" : suCambio ? "Ya tiene un cambio preparado" : "Elige a uno del banquillo", ABAJO_FILA4[0],
        () => { const sale = campo.id, entra = u.eqBanco; u.eqBanco = null; this.acc.ordenar && this.acc.ordenar({ tipo: "cambio", lado: yo, sale, entra }); }),
      this._b("quitar", "Quitar", "verde", !!suCambio, "No tiene ningún cambio preparado", ABAJO_FILA4[1],
        () => this.acc.ordenar && this.acc.ordenar({ tipo: "quitarCambio", lado: yo, sale: campo.id })),
      atras,
    ];
    return v;
  },
  // pulsar en Equipo: uno del campo (ARRIBA su ficha grande, diseno 4.3) o del banquillo
  elegirCampo(id) {
    const u = this.ui;
    u.eqCampo = u.eqCampo === id ? null : id;
    if (u.eqCampo !== null && this.acc.elegirJugador) this.acc.elegirJugador(id);
  },
  elegirBanco(k) { const u = this.ui; u.eqBanco = u.eqBanco === k ? null : k; },

  // Tactica (desde la pausa o el Menu): dos pestanas, como las de p26: Tacticas y
  // Espiritus (el panel de p19 entero): sin un quinto boton se invoca tambien en la
  // pausa y en la espera del saque (O-310)
  _tactica(v, p, yo, ctx, atras) {
    const u = this.ui;
    v.vista = "tactica";
    if (u.pestTactica === "espiritus") {
      const e = this._espiritus(p, yo, ctx);
      v.tactica = Object.assign({ pest: "espiritus" }, e);
      v.botones = [this._b("invocar", "Invocar", "verde", e.invocar.si, e.invocar.porque, ABAJO_FILA4[0],
        () => this.acc.ordenar && this.acc.ordenar({ tipo: "invocar", jugador: e.jugador })), atras];
      return v;
    }
    const tac = this._tacticas(p, yo);
    if (u.tac === null || !tac[u.tac]) u.tac = (tac.find(t => t.si) || tac[0] || { k: null }).k;
    const m = u.tac !== null ? tac[u.tac] : null;
    v.tactica = { pest: "tacticas", tacticas: tac.map(t => Object.assign({}, t, { sel: t.k === u.tac })), cabecera: m ? m.nombre + " · " + m.estado : "Tu equipo no lleva tácticas", texto: m ? m.texto : "" };
    v.botones = [this._b("usar", "¡Usar!", "verde", !!m && m.si, m ? this._cap(m.estado) : "Tu equipo no lleva tácticas", ABAJO_OK,
      () => this.acc.ordenar && this.acc.ordenar({ tipo: "tactica", lado: yo, k: m.k })), Object.assign({}, atras, { pos: ABAJO_ATRAS })];
    return v;
  },

  // --- el duelo (m04, b19-b23; guia 8.1-8.3) ------------------------------------------
  _duelo(v, p, yo, ctx) {
    const u = this.ui, du = p.duelo;
    // lo marcado (el paso, la lista, la tecnica del penalti) es de este duelo; si alguien
    // invoca (v), los numeros cambian y se vuelve a la primera eleccion (O-310)
    const idv = du.id + ":" + (du.v || 0);
    if (u.duelo !== idv) {
      const mismo = !!u.duelo && u.duelo.split(":")[0] === String(du.id);
      u.vAviso = mismo && du.vLado !== undefined && du.vLado !== yo;
      u.duelo = idv; u.paso = null; u.lista = false; u.pagina = 0; u.marcada = null; u.penal = "normal";
    }
    const ya = ctx.elegidos && ctx.elegidos.has && ctx.elegidos.has(du.id);
    const pend = ya ? null : p.pendientes()[yo] || null;
    // tras elegir (o con los focos automaticos, O-292): la barra azul vacia y, online, la
    // caja "Espera unos instantes..." hasta que el otro elija (m08). La eleccion no se
    // cambia, como siempre
    if (!pend || (ctx.ayudante && du.tipo === "foco")) {
      v.vista = "espera";
      v.botones = [this._b("atras", "Atrás", "azul", false, "La elección ya está hecha", ABAJO_ATRAS)];
      if (ctx.modo && ctx.modo !== "maquina" && !(ctx.ayudante && du.tipo === "foco" && pend)) v.espera = this._cajaEspera(ctx);
      return this._red(v, ctx);
    }
    if (ctx.botones === false) { v.vista = "anim"; return this._red(v, ctx); }
    if (du.tipo === "penalti") return this.pintarPenalti(v, p, yo, pend, ctx);
    const m = this._mapaDuelo(p, yo, pend, ctx);
    v.duelo = m;
    if (u.lista) this._vistaLista(v, m.tecnicas, m.paso);
    else v.vista = "duelo";
    return this._red(v, ctx);
  },

  // las opciones del motor (pendientes(), claves de siempre) en los botones de la tabla de
  // 5.8. Dos pasos que no se pueden perder: defendiendo un tiro con alguien en la linea,
  // primero el muro y luego el portero (al portero se le apagan las tecnicas que no paga
  // con la tension que se lleva el bloqueo); tirando con un companero en la linea, tras el
  // tiro la cadena con el total de cada una segun el tiro elegido (y "de X a Y" con la
  // volea). Tras una vaselina no se encadena. La eleccion se manda entera al final
  _mapaDuelo(p, yo, pend, ctx) {
    const u = this.ui, du = p.duelo, ten = p.tension[yo];
    const op = (ops, c) => (ops || []).find(o => o.clave === c) || null;
    let paso, ops, accion;
    if (pend.rol === "ataque" || pend.rol === "defensa") {
      paso = pend.rol; ops = pend.opciones; accion = c => this.acc.elegir && this.acc.elegir(c);
    } else if (pend.rol === "muro" || pend.rol === "cadena") {
      // el tiro que viaja (O-325): al llegarle el balon, el muro (Bloquear, Dejar pasar o su
      // supertecnica) o el companero que puede encadenar (No encadenar o su tiro, con el
      // total del tiro con el)
      paso = pend.rol;
      ops = pend.rol === "cadena" ? pend.opciones.map(o => o.clave === "nada" ? o : Object.assign({}, o, { _total: o.total })) : pend.opciones;
      accion = c => this.acc.elegir && this.acc.elegir({ [pend.rol]: c });
    } else if (pend.rol === "tiro") {
      if (u.paso && u.paso.tiro && pend.cadena) {
        paso = "cadena";
        const tiro = u.paso.tiro, gasto = (op(pend.opciones, tiro) || {}).tp || 0;
        ops = pend.cadena.opciones.map(oc => {
          const o = Object.assign({}, oc, { puede: oc.puede && oc.tp + gasto <= ten });
          if (oc.puede && !o.puede) o.porque = "no te llega la tensión (el tiro gasta " + gasto + ")";
          const rg = oc.rangos && oc.rangos[tiro];
          if (rg) Object.assign(o, { min: rg[0], max: rg[1] });
          // el total del tiro con esta cadena (y sin ella), segun el tiro elegido (O-306)
          o._total = oc.totales ? oc.totales[tiro] : undefined;
          return o;
        });
        accion = c => this.acc.elegir && this.acc.elegir({ tiro, cadena: c });
      } else {
        paso = "tiro"; ops = pend.opciones;
        accion = c => {
          if (!pend.cadena || c === "vaselina") return this.acc.elegir && this.acc.elegir({ tiro: c });
          u.paso = { tiro: c }; u.lista = false; u.marcada = null; u.pagina = 0;
        };
      }
    } else {
      if (pend.muro && !(u.paso && "muro" in u.paso)) {
        paso = "muro"; ops = pend.muro.opciones;
        accion = c => { u.paso = { muro: c }; u.lista = false; u.marcada = null; u.pagina = 0; };
      } else {
        paso = "portero";
        const muro = u.paso && "muro" in u.paso ? u.paso.muro : null;
        // la tension que ya se lleva el bloqueo no la tiene el portero
        const gastoMuro = ((pend.muro && op(pend.muro.opciones, muro)) || {}).tp || 0;
        ops = pend.opciones.map(o => {
          const q = Object.assign({}, o, { puede: o.puede && o.tp + gastoMuro <= ten });
          if (o.puede && !q.puede) q.porque = "no te llega la tensión (el bloqueo gasta " + gastoMuro + ")";
          return q;
        });
        accion = c => this.acc.elegir && this.acc.elegir({ parada: c, muro });
      }
    }
    const bt = (o, flecha) => o ? this._opBoton(o, accion, flecha) : null;
    // el tiro largo de la T (O-326): sin Tirar ni Vaselina; a los lados sus tiros largos (el
    // primero que paga a la izquierda) y todos en el rayo
    const largos = paso === "tiro" && pend.largo ? ops.filter(o => o.clave[0] === "t").sort((a, b) => (b.puede ? 1 : 0) - (a.puede ? 1 : 0)) : null;
    const izq = largos ? bt(largos[0]) : bt(op(ops, { cadena: "nada" }[paso] || "normal"), paso === "ataque" ? "izq" : null);
    // el boton partido de la defensa: Entrada | Cargar, como el "Volee Tir" de Galaxy
    const der = largos ? bt(largos[1]) : paso === "ataque" ? bt(op(ops, "potente"), "der")
      : paso === "defensa" ? [bt(op(ops, "potente")), bt(op(ops, "cargar"))].filter(Boolean)
      : paso === "tiro" ? bt(op(ops, "vaselina") || op(ops, "volea"))
      : paso === "muro" ? bt(op(ops, "nada")) : paso === "portero" ? bt(op(ops, "despejar")) : null;
    const tecnicas = ops.filter(o => o.clave[0] === "t").map(o => this._casilla(o, ten, accion));
    const rayo = { si: tecnicas.some(c => c.si), n: tecnicas.length,
      porque: !tecnicas.length ? "Sin supertécnicas de " + ABAJO_TIPO[paso] : "Ninguna se puede ahora: " + (tecnicas[0].porque || "") };
    // la caja de ayuda (b16) con lo de antes de pintarEleccion
    const ayuda = [];
    if (u.vAviso) ayuda.push("El rival ha invocado: los números han cambiado.");
    if (paso === "ataque" && du.base) ayuda.push("Ya puedes marcar el pase o el tiro: sale si ganas.");
    const mu = du.muro !== null && du.muro !== undefined ? p.jugadores[du.muro] : null;
    if (paso === "tiro") {
      // el poder de afinidad y el combo de tecnicas de VR (O-328): ya van en el total
      const af = p.afinidad ? Math.round(p.afinidad[yo]) : 0, co = p.combo ? p.combo[yo] : 0, cp = co ? (REGLAS.COMBO.tiro[co] || 0) : 0;
      if (af > 0 || co > 0) ayuda.push((af > 0 ? "Poder de afinidad +" + af + " %" : "") + (af > 0 && co > 0 ? " y " : "") + (co > 0 ? "combo ×" + co + " (+" + cp + " %)" : "") + ": ya van en el total y se gastan al chutar.");
      if (largos) ayuda.push("Tiro largo desde " + Math.round(du.distancia) + " m: va como un tiro normal (el balón viaja hacia la portería).");
      // el tiro va adonde apuntas y se puede afinar (O-335)
      if (du.etapa === "chute") ayuda.push("El tiro va a la X: pulsa dentro de la portería para afinar adónde va.");
      if (du.alto) ayuda.push("Balón alto: remata de cabeza (Testarazo) o al aire (Volea); cuenta el Físico.");
      if (mu) ayuda.push(du.muroPegado ? mu.nombre + " está pegado a ti: también para la vaselina." : mu.nombre + " está en la línea de tiro: la vaselina le pasa por encima.");
    }
    if (du.etapa && du.etapa !== "chute") {
      // el tiro que viaja (O-325): a quien le ha llegado y lo que trae
      const tv = du.base ? du.base[(p.jugadores[du.tirador] || {}).lado] : null, de = (p.jugadores[du.tirador] || {}).nombre || "";
      if (paso === "muro") ayuda.push("¡El tiro de " + de + " te llega! Bloquéalo: si ganas, lo paras; si no, le quitas fuerza" + (tv ? " (trae " + tv + ")" : ""));
      if (paso === "cadena") ayuda.push("El tiro de " + de + " le llega a " + p.jugadores[pend.jugador].nombre + ": ¿lo encadena? Suma su tiro y el gol sería suyo");
      if (paso === "portero") ayuda.push("¡El tiro de " + de + " llega a la portería!" + (tv ? " Trae " + tv + "." : ""));
    } else {
      if (paso === "cadena") ayuda.push(p.jugadores[pend.cadena.jugador].nombre + " está en la línea de tiro: ¿encadena el tiro?");
      if (paso === "muro") ayuda.push(p.jugadores[pend.muro.jugador].nombre + " está en la línea de tiro: ¿bloquea? " + (du.muroPegado ? "(está pegado: para también la vaselina)" : "(si es vaselina, pasa por encima)"));
      if (paso === "portero" && pend.muro) ayuda.push("Ahora el portero: " + p.jugadores[pend.jugador].nombre);
    }
    return { paso, rol: pend.rol, franja: largos ? ABAJO_FRANJA.largo : ABAJO_FRANJA[paso], izq, der, rayo, tecnicas, ayuda, morada: this._morada(p, yo, pend, paso, accion), cuenta: !!p.limiteDuelo };
  },
  // la franja morada del espiritu (b23) [PIZARRA en el contenido]: en un foco, la
  // hipertecnica ★ (gana el duelo, O-310); en el tiro y el penalti, Invocar (sube tus
  // numeros, no gana solo)
  _morada(p, yo, pend, paso, accion) {
    const j = p.jugadores[pend.jugador];
    if (!j || !j.espiritu) return null;
    const T = REGLAS.HIPER_TIPOS[j.hiperTipo] || {}, hb = Math.floor(p.hiper[yo]);
    const base = { familia: (T.nombre || "").toUpperCase(), espiritu: j.espiritu.nombre };
    if (paso === "ataque" || paso === "defensa") {
      const o = (pend.opciones || []).find(x => x.clave === "hiper");
      if (!o) return Object.assign(base, { texto: "activo", boton: null, activo: true });
      return Object.assign(base, { texto: "gana el duelo · " + REGLAS.HIPER_COSTE + " de hiperbarra (tienes " + hb + ")" + (o.total !== undefined ? " · contra hiper " + o.total : ""),
        boton: { texto: "★ Usar", si: !!o.puede, porque: this._cap(o.porque || ""), accion: () => accion("hiper") } });
    }
    if (paso === "muro" || paso === "cadena") return null;
    if (p.conAura(j)) return Object.assign(base, { texto: "¡Activo!", boton: null, activo: true });
    const ph = p.puedeHiper(j);
    return Object.assign(base, { texto: "sube tus números · " + REGLAS.HIPER_COSTE + " (tienes " + hb + ")",
      boton: { texto: "Invocar", si: ph.si, porque: this._cap(ph.porque), accion: () => this.acc.ordenar && this.acc.ordenar({ tipo: "invocar", jugador: j.id }) } });
  },
  // un comando en su boton: debajo del nombre, en pequeno, lo de antes de cada uno: "total
  // 1234", "de 900 a 1980" (Romper, Entrada, Volea), "disputa 870" (Cargar) y, en rojo,
  // lo que se puede ir fuera (O-306, O-309, O-315)
  _opBoton(o, accion, flecha) {
    return { clave: o.clave, texto: o.nombre, cifra: this._cifra(o), fuera: o.fuera > 0 ? "puede irse fuera: " + o.fuera + " %" : "",
      si: !!o.puede, porque: o.puede ? "" : this._cap(o.porque || ""), nota: o.nota || "", flecha: flecha || null, accion: () => accion(o.clave) };
  },
  _cifra(o) {
    const t = o._total !== undefined ? o._total : o.total;
    if ((o.clave === "nada" && o._total === undefined) || t === undefined) return "";
    // contra: lo que trae el tiro contra esta parada si su tecnica le gana en elemento (O-328)
    if (o.contra !== undefined) return "total " + t + " · el tiro " + o.contra;
    return o.min !== undefined ? "de " + o.min + " a " + o.max : o.clave === "cargar" ? "disputa " + t : o.hiper ? "contra hiper " + t : "total " + t;
  },
  // una casilla de la lista (b25): la tecnica, su elemento, ✦ si es de espiritu, su coste
  // en tension (TEN) y lo que da; la `nota` ("con X y Y", O-298) y su porque si esta apagada
  _casilla(o, ten, accion) {
    const faltan = o.nota && /faltan/.test(o.nota);
    return { clave: o.clave, nombre: o.nombre.replace(/ ✦$/, ""), espiritu: / ✦$/.test(o.nombre), elemento: o.elemento || "", tp: o.tp || 0,
      poder: o.poder || 0, cifra: this._cifra(o), si: !!o.puede, nota: faltan ? "" : o.nota || "",
      porque: o.puede ? "" : this._cap(o.porque || (faltan ? o.nota : "TEN " + o.tp + ": tienes " + Math.round(ten))), accion: () => accion(o.clave) };
  },
  // la lista de supertecnicas (m05, b24-b27, t03): 2x4 casillas y paginas; se marca una y
  // [Aceptar] (dos pasos, como Galaxy); [Atras] vuelve a la barra
  _vistaLista(v, tecnicas, paso, alAceptar) {
    const u = this.ui;
    v.vista = "lista";
    const paginas = Math.max(1, Math.ceil(tecnicas.length / 8));
    u.pagina = Math.max(0, Math.min(paginas - 1, u.pagina));
    const enPagina = tecnicas.slice(u.pagina * 8, u.pagina * 8 + 8);
    let m = enPagina.find(c => c.clave === u.marcada) || enPagina[0] || null;
    u.marcada = m ? m.clave : null;
    const casillas = [];
    for (let k = 0; k < 8; k++) { const c = enPagina[k]; casillas.push(c ? Object.assign({}, c, { sel: c === m }) : { vacia: true }); }
    v.lista = { paso, casillas, pagina: u.pagina, paginas, n: tecnicas.length,
      cabecera: m ? { potencia: m.poder, cifra: m.cifra, tp: m.tp, extra: m.si ? m.nota : m.porque } : null };
    v.botones = [];
    if (paginas > 1) v.botones.push(
      this._b("antes", "‹", "verde", u.pagina > 0, "Es la primera página", [4, 208, 30, 28], () => { u.pagina--; u.marcada = null; }, { chico: true }),
      this._b("despues", "›", "verde", u.pagina < paginas - 1, "Es la última página", [38, 208, 30, 28], () => { u.pagina++; u.marcada = null; }, { chico: true }));
    v.botones.push(this._b("aceptar", "¡Aceptar!", "verde", !!m && m.si, m ? m.porque : "No hay ninguna", ABAJO_OK,
      () => { u.lista = false; if (alAceptar) alAceptar(m); else m.accion(); }),
      this._b("atras", "Atrás", "azul", true, "", ABAJO_ATRAS, () => { u.lista = false; }));
    return v;
  },
  // marcar una casilla de la lista (el primer paso)
  marcar(clave) { this.ui.marcada = clave; },

  // --- el penalti (b46, p24; O-312) ---------------------------------------------------
  // "PK" y la porteria dibujada de frente con 3 casillas: pulsar una zona ELIGE (como se
  // ve en tu pantalla: zonaCampo; la X del cono si tiras). Antes, si quieres, una
  // supertecnica (la barra [Tirar o Parar] [rayo] [—]; la marcada se recuerda)
  pintarPenalti(v, p, yo, pend, ctx) {
    const u = this.ui, du = p.duelo, tiro = pend.rol === "penalti_tiro", ten = p.tension[yo];
    const tecnicas = pend.opciones.filter(o => o.clave[0] === "t").map(o => this._casilla(o, ten, c => { u.penal = c; }));
    const normal = pend.opciones.find(o => o.clave === "normal") || { clave: "normal", nombre: tiro ? "Tirar" : "Parar", puede: true };
    if (u.penal !== "normal" && !tecnicas.some(c => c.clave === u.penal && c.si)) u.penal = "normal";
    const marcada = tecnicas.find(c => c.clave === u.penal) || null;
    const tir = p.jugadores[du.tirador];
    const zona = z => {
      const zc = this.acc.zonaCampo ? this.acc.zonaCampo(z) : z;
      // la X del cono, en la zona (solo la ves tu)
      if (tiro && this.acc.apuntar) this.acc.apuntar((zc - 1) * REGLAS.PENALTI_ZONA_X, p.porteriaRival(tir).y);
      if (this.acc.elegir) this.acc.elegir({ zona: zc, tecnica: u.penal === "normal" ? null : u.penal });
    };
    v.penalti = { tiro, tanda: !!du.tanda, tecnica: marcada ? marcada.nombre : null,
      zonas: ["Izquierda", "Centro", "Derecha"].map((texto, z) => ({ z, texto, titulo: (tiro ? "Tirar " : "Tirarte ") + (z === 1 ? "al centro" : "a la " + texto.toLowerCase()), accion: () => zona(z) })) };
    const izq = Object.assign(this._opBoton(normal, () => { u.penal = "normal"; }), { sel: u.penal === "normal" });
    v.duelo = { paso: tiro ? "penalti_tiro" : "penalti_parada", rol: pend.rol, franja: tiro ? "¡Elige dónde tirar!" : "¡Elige dónde parar!", izq, der: null,
      rayo: { si: tecnicas.some(c => c.si), n: tecnicas.length, sel: !!marcada, porque: !tecnicas.length ? "Sin supertécnicas de " + (tiro ? "tiro" : "parada") : "Ninguna se puede ahora: " + (tecnicas[0].porque || "") },
      tecnicas, morada: this._morada(p, yo, pend, "penalti", null), cuenta: !!p.limiteDuelo,
      explica: tiro ? "Marca una supertécnica si quieres y elige zona: si el portero se tira a otro lado, es gol; si acierta, gana el número mayor."
        : "Marca una supertécnica si quieres y elige adónde te tiras: si aciertas la zona, gana el número mayor; si no, es gol.",
      ayuda: [u.vAviso ? "El rival ha invocado: los números han cambiado." : null,
        marcada ? "Con " + marcada.nombre + " (TEN " + marcada.tp + ")" + (marcada.cifra ? " · " + marcada.cifra : "") : "Sin supertécnica" + (izq.cifra ? " · " + izq.cifra : "")].filter(Boolean) };
    if (u.lista) this._vistaLista(v, tecnicas, v.duelo.paso, c => { if (c) u.penal = c.clave; });
    else v.vista = "penalti";
    return this._red(v, ctx);
  },

  // --- tras el gol: Repetir / Reanudar partido (b48, p14; O-319) ---------------------
  // Solo en este PC: el motor ya esta en la espera del saque de centro. Reanudar quita los
  // botones y deja el tiempo de tactica (la barra espaciadora lo pulsa: lleva el id de
  // la pausa); Repetir vuelve a pasar la repeticion. El otro puede pulsar Jugar mientras
  _trasGol(v, ctx) {
    v.vista = "trasgol";
    v.botones = [
      this._b("repetir", "Repetir", "azul", ctx.repetir !== false, "No hay repetición de este gol", ABAJO_TRASGOL[0], () => this.acc.repetir && this.acc.repetir()),
      this._b("boton-pausa", "Reanudar partido", "verde", true, "", ABAJO_TRASGOL[1], () => this.acc.reanudar && this.acc.reanudar(), { titulo: "Barra espaciadora" }),
    ];
    return this._red(v, ctx);
  },

  // --- el descanso y el final: las estadisticas (b44, b45; O-306...) ----------------
  _estad(v, p, yo, ctx, final) {
    v.vista = final ? "final" : "descanso";
    const es = p.estadisticas || {}, po = es.posesion, filas = [];
    const f = (que, arr, title) => { if (arr) filas.push({ que, a: arr[yo], b: arr[1 - yo], title }); };
    // con los que se van fuera (O-315); criticos (O-309), hipertecnicas (O-310), tarjetas
    // (O-311, si las hay) y la tanda (O-312)
    f("Tiros", es.tiros, "Tiros, también los que se van fuera, los bloqueados y los penaltis del partido (los de la tanda, no)");
    f("Supertécnicas", es.tecnicas, "Supertécnicas usadas en regates, entradas, tiros, bloqueos y paradas");
    f("Críticos", es.criticos, "Duelos ganados con un crítico: el número más bajo que gana (pasa en 1 de cada 10 duelos parejos)");
    f("Hipertécnicas", es.hiper, "Espíritus invocados (cada uno gasta 100 de hiperbarra), también los que ganan un duelo con ★");
    if (es.amarillas && es.amarillas[0] + es.amarillas[1] > 0) f("Amarillas", es.amarillas, "Tarjetas amarillas (la segunda de un jugador cuenta también: con ella es roja)");
    if (es.rojas && es.rojas[0] + es.rojas[1] > 0) f("Rojas", es.rojas, "Expulsados (roja directa o dos amarillas)");
    if (es.penaltis) f("Penaltis", es.penaltis, "Goles en la tanda de penaltis");
    const tot = po ? po[0] + po[1] : 0, pc = tot > 0 ? Math.round(po[yo] / tot * 100) : null;
    if (pc !== null) filas.push({ que: "Posesión", a: pc + " %", b: (100 - pc) + " %", title: "Tiempo de juego con el balón (del último que lo tocó)" });
    // los goles de cada lado (tuyos a la izquierda): como mucho 4 y "+N" (el resto, en Registro)
    const goles = [yo, 1 - yo].map(l => (es.goles || []).filter(g => g[0] === l).map(g => ({ parte: ABAJO_PARTES[g[1] - 1] || g[1] + ".ª", mitad: g[1], texto: g[2] + "' " + g[3] })));
    v.estadisticas = { titulo: final ? "Resultado" : "Estadísticas", filas, posesion: pc, goles: goles.map(g => g.slice(0, 4)), mas: goles.map(g => Math.max(0, g.length - 4)) };
    const listo = !!ctx.listo;
    if (final) {
      // quien gana: por goles o, con empate, en la tanda (O-312)
      const g = p.ganador(), pen = p.tanda ? " en los penaltis" : "";
      v.franja = g === null ? "¡Empate!" : g === yo ? "¡Has ganado" + pen + "!" : "Has perdido" + pen;
      v.botones = [this._b("otro", "Otro partido", "verde", true, "", ABAJO_OUI, () => this.acc.otro && this.acc.otro())];
      return v;
    }
    // antes de la prorroga, lo de siempre (O-312)
    if (p.mitad === 2) v.franja = "¡Empate! Se juega la prórroga: dos partes de " + p.relojTexto(p.duracionParte(3))
      + (p.empate === "prorroga-penaltis" ? " y, si sigue el empate, penaltis" : "") + "."
      + (REGLAS.CAMBIOS_PRORROGA > 0 ? " Cada uno tiene " + (REGLAS.CAMBIOS_PRORROGA === 1 ? "un cambio" : REGLAS.CAMBIOS_PRORROGA + " cambios") + " más." : "");
    if (ctx.demo) return v;
    const boton = ctx.boton || "Segunda parte";
    if (!v.franja) v.franja = (p.puedeCambiar(yo) && (ctx.libres || []).length ? "Los cambios, en el Menú (Equipo). " : "") + "«" + boton + "» cuando estés.";
    v.botones = [this._b("menu", "Menú", "verde", true, "", ABAJO_IZQ, () => { this.ui.menu = true; }),
      this._b("boton-pausa", boton, "verde", !listo, "Ya has pulsado: esperando a " + (ctx.rival || "el rival"), ABAJO_OUI, () => this.acc.seguir && this.acc.seguir(), { pulsado: listo, titulo: "Barra espaciadora" })];
    if (listo && ctx.modo && ctx.modo !== "maquina") v.espera = this._cajaEspera(ctx);
    return v;
  },

  // el rival se ha ido (mostrarRivalFuera de antes, O-305, O-308): la caja de espera con
  // quien se ha ido, el marcador y [Otro partido]
  _fuera(v, p, yo, ctx) {
    const red = ctx.red || {};
    v.vista = "fuera";
    v.fuera = { titulo: red.dejado ? "Has dejado el partido" : (red.rival || "El rival") + " ha salido del partido",
      marcador: p.nombres[yo] + "  " + p.goles[yo] + " - " + p.goles[1 - yo] + "  " + p.nombres[1 - yo] };
    v.botones = [this._b("otro", "Otro partido", "verde", true, "", [104, 150, 112, 32], () => this.acc.otro && this.acc.otro())];
    return v;
  },

  // ---------------------------------------------------------------------------------
  // cada cuadro (paso 2b del bucle, diseno 1.8): lo que no es pintar. b47 en Pizarra: el
  // aviso de que a uno de los tuyos se le acaba el espiritu (se mira en local, sin tocar
  // el motor). En la tanda cada invocacion vale solo para su penalti: ahi no
  vigilar(p, yo) {
    if (!p) return;
    for (const j of p.jugadores) {
      if (j.lado !== yo || !j.espiritu) continue;
      // (con su nombre de siempre: con un modo se llama como su forma, O-327)
      const activo = p.conAura(j), antes = this._auras[j.id], nom = j.propio ? j.propio.nombre : j.nombre;
      if (antes && antes.nombre === nom && antes.activo && !activo && !j.expulsado && !p.tanda) {
        const n = Math.max(0, Math.ceil(j.auraLista - p.segundosDeJuego()));
        this.aviso(nom + " se queda sin su espíritu" + (n ? " (vuelve en " + n + " s)" : ""), nom);
      }
      this._auras[j.id] = { nombre: nom, activo };
    }
  },

  // la franja oscura de abajo (b47): 2,5 s con letra blanca (y el nombre en amarillo).
  // Fuera de un partido, en la franja de la pantalla de elegir (diseno 3)
  aviso(texto, resalta) {
    this.ultimoAviso = String(texto || "");
    if (typeof document === "undefined") return;
    if (!this.enPartido) { const n = document.querySelector("#nota-elegir"); if (n) n.textContent = texto; return; }
    const dom = document.querySelector("#abajo-dom");
    if (!dom) return;
    let f = this._franja;
    if (!f || !f.isConnected) { f = this._franja = el("div", { class: "gx-aviso" }); dom.appendChild(f); }
    f.textContent = "";
    const t = String(texto), k = resalta ? t.indexOf(resalta) : -1;
    if (k >= 0) f.append(t.slice(0, k), el("b", { text: resalta }), t.slice(k + resalta.length)); else f.textContent = t;
    // encima de los botones y de la barra del duelo, si los hay
    const v = this._v, bajo = v && (v.botones.length || v.duelo || v.estadisticas), entera = v && /^(equipo|registro|tactica|invocacion)$/.test(v.vista);
    f.classList.toggle("alto", !!bajo && !entera);
    // en la tactil entera, por encima de su linea de mensajes
    f.classList.toggle("entera", !!entera);
    f.hidden = false;
    clearTimeout(this._avisoT);
    this._avisoT = setTimeout(() => { f.hidden = true; }, 2500);
  },

  // ---------------------------------------------------------------------------------
  // pintar (paso 8 del bucle): solo se rehace si cambia la clave
  pintar(p, yo, estado) {
    if (typeof document === "undefined") return;
    const raiz = this._raiz && this._raiz.isConnected ? this._raiz : (this._raiz = document.querySelector("#pantalla-juego"));
    if (!raiz || !p) return;
    // un panel compacto se cierra al pulsar fuera de el (en el campo: el gesto sigue) o la
    // mano (diseno 5.8). Se escucha una vez, antes que el raton del campo
    if (!this._escucha) {
      const abajo = document.querySelector("#abajo");
      if (abajo) {
        this._escucha = true;
        abajo.addEventListener("pointerdown", ev => {
          const u = this.ui;
          if (!u || !u.panel || !ev.target || !ev.target.closest) return;
          if (ev.target.closest(".gx-compacto, .gx-hex")) return;
          u.panel = null; this._clave = "";
        }, true);
      }
    }
    const ctx = this.contexto ? this.contexto() : {};
    // la barra del duelo sale cuando el Director lo dice (a los 670 ms de entrar, guia 8.1:
    // E4); el de mentira de E1 la deja siempre
    ctx.botones = !(estado && estado.abajo && estado.abajo.botones === false);
    // y lo demas del Director (O-319): la tactil escondida mientras ensena el descanso o el
    // final, y Repetir / Reanudar tras el gol
    const ab = (estado && estado.abajo) || {};
    ctx.tactil = ab.tactil !== false; ctx.trasGol = !!ab.trasGol; ctx.repetir = ab.repetir !== false;
    const v = this.que(p, yo, ctx), u = this.ui;
    // la ficha grande arriba: en Equipo, la del que eliges (diseno 4.3; la T ya no, es el
    // tiro largo, O-326)
    if (typeof Director !== "undefined") Director.fichaGrande = !!(v.vista === "equipo" && u.eqCampo !== null);
    this._v = v;
    this._vivos(p, v);
    const clave = JSON.stringify(v);
    if (clave === this._clave) return;
    const forma = [v.vista, v.fondo, v.panel && v.panel.que, u.pestTactica, u.pestRegistro, v.duelo && v.duelo.paso, v.lista && v.lista.pagina, !!v.espera].join("|");
    // con el raton apretado sobre un control no se rehace (O-305): el boton cambiaba entre
    // apretar y soltar y el clic se perdia. Si cambia lo que se ensena, si
    if (forma === this._forma && raiz.querySelector(".gx-control:active")) return;
    this._clave = clave;
    const nueva = forma !== this._forma, antes = this._forma.split("|")[0];
    if (nueva) { this._forma = forma; this._formaT = performance.now(); }
    raiz.textContent = "";
    raiz.appendChild(this._construir(v, p, yo, nueva, nueva ? antes : null));
    this._vivos(p, v);
  },
  // lo que cambia cada segundo sin rehacer nada: la cuenta del duelo online (O-299)
  _vivos(p, v) {
    const c = this._cuenta;
    if (!c || !c.isConnected) return;
    const t = p.limiteDuelo && p.duelo ? "Te quedan " + Math.max(0, Math.ceil(p.limiteDuelo - (p.duelo.reloj || 0))) + " s para elegir" : "";
    if (c.textContent !== t) c.textContent = t;
  },

  // el clic de cada boton, con las defensas de siempre (O-305)
  _pulsa(b, accion) {
    return ev => {
      if (ev && ev.detail > 1) return;                                   // el 2.o clic de un doble clic
      if (performance.now() - this._formaT < 300) return;                // algo que acaba de salir
      if (ev && ev.currentTarget && ev.currentTarget.blur) ev.currentTarget.blur();   // que la barra espaciadora no lo repita
      if (!b.si) { if (b.porque) this.aviso(b.porque); return; }
      (accion || b.accion)();
      this._clave = "";
    };
  },
  _boton(b, clase) {
    const [x, y, w, h] = b.pos || [0, 0, 60, 30];
    const n = el("button", { class: "gx-boton gx-control abs" + (b.color === "azul" ? " azul" : "") + (b.pulsado ? " pulsado" : !b.si ? " apagado" : "") + (b.chico ? " chico" : "") + (clase ? " " + clase : ""),
      id: /^boton-/.test(b.id) ? b.id : null, "data-b": b.id, title: b.porque || b.titulo || null, text: b.texto });
    Object.assign(n.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    n.onclick = this._pulsa(b);
    return n;
  },
  _cara(id, clase, titulo) {
    const c = el("i", { class: "gx-cara" + (clase ? " " + clase : ""), title: titulo || null });
    if (id) c.style.backgroundImage = "url(\"/cara/" + encodeURIComponent(id) + "\")";
    return c;
  },
  _icono(nombre, clase) {
    const i = el("i", { class: "gx-ico" + (clase ? " " + clase : "") });
    const url = GX.iconoUrl(nombre);
    if (url) i.style.backgroundImage = "url(\"" + url + "\")";
    return i;
  },
  _elem(e) { return this._icono("elemento_" + ({ Fuego: "fuego", Viento: "viento", Bosque: "bosque", Montana: "montana", "Montaña": "montana" }[e] || "viento"), "elem" + (e ? "" : " vacio")); },

  _construir(v, p, yo, nueva, antes) {
    const caja = el("div", { class: "gx-tactil v-" + v.vista + (v.fondo ? " f-" + v.fondo : "") + (nueva ? " entra" : "") });
    this._cuenta = null;
    const fondo = v.fondo || v.vista;
    if (v.columna) caja.appendChild(this._domColumna(v.columna));
    if (v.panel) caja.appendChild(v.panel.que === "tacticas" ? this._domTacticasCompacto(v.panel) : this._domEspiritus(v.panel, true));
    if (v.rotulo) caja.appendChild(this._domRotulo(v.rotulo));
    if (v.ayuda) caja.appendChild(this._domAyuda(v.ayuda));
    if (v.vista === "duelo" || v.vista === "penalti") caja.appendChild(this._domDuelo(v.duelo, v.vista === "penalti" ? v.penalti : null));
    if (v.vista === "lista") {
      // al abrirla desde la barra (t03, guia 8.3): la barra de comandos sigue 67 ms y sus
      // botones salen por los lados mientras el panel sube; luego sube la de [Aceptar]
      if ((antes === "duelo" || antes === "penalti") && v.duelo) {
        const sale = this._domDuelo(Object.assign({}, v.duelo, { morada: null, ayuda: [], cuenta: false }), null);
        sale.classList.add("saliendo");
        caja.appendChild(sale);
      }
      caja.appendChild(this._domLista(v.lista, v.duelo));
      // encima del campo que asoma: el aviso de que el rival ha invocado y la cuenta online
      const d = v.duelo || {}, avisoV = (d.ayuda || []).filter(t => /^El rival ha invocado/.test(t));
      if (avisoV.length || d.cuenta) caja.appendChild(this._domAyuda({ lineas: avisoV, cuenta: d.cuenta }));
    }
    if (v.vista === "equipo") caja.appendChild(this._domEquipo(v.equipo));
    if (v.vista === "registro") caja.appendChild(this._domRegistro(v.registro, p, yo));
    if (v.vista === "tactica") caja.appendChild(this._domTactica(v.tactica));
    if (v.vista === "invocacion") caja.appendChild(this._domInvocacion(v.invocacion));
    if (v.estadisticas && (fondo === "descanso" || fondo === "final")) caja.appendChild(this._domEstad(v.estadisticas, !!v.franja));
    if (v.franja && !v.duelo) caja.appendChild(el("div", { class: "gx-franja-abajo", text: v.franja }));
    if (v.vista === "espera") caja.appendChild(el("div", { class: "gx-barra-azul gx-control" }));
    if (v.fuera) caja.appendChild(el("div", { class: "gx-espera gx-fuera" }, [el("div", { text: v.fuera.titulo }), el("b", { text: v.fuera.marcador })]));
    for (const b of v.botones) caja.appendChild(this._boton(b));
    if (v.espera) caja.appendChild(this._domEspera(v.espera));
    return caja;
  },

  // la columna: los hexagonos con su icono; el numero del aura abajo a la derecha
  _domColumna(c) {
    const u = this.ui, col = el("div", { class: "gx-columna" });
    const hex = (cual, d, top, icono, titulo, accion, id) => {
      const n = el("button", { class: "gx-hex gx-control " + cual + (d.si ? "" : " apagado") + (d.activo ? " activo" : ""), id: id || null, title: d.si ? titulo : titulo + ": " + d.porque });
      n.style.top = top + "px";
      n.style.backgroundImage = "url(\"" + GX.iconoUrl(icono) + "\"), url(\"" + GX.iconoUrl(d.si ? "hex_marco" : "hex_marco_apagado") + "\")";
      // apagado se puede pulsar igual: dice por que no (o abre el panel para mirar)
      n.onclick = this._pulsa({ si: true }, () => { if (!d.si && accion.soloSi) return this.aviso(d.porque); accion(); });
      if (cual === "aura" && d.n > 0) n.appendChild(el("b", { class: "n", text: String(d.n) }));
      return n;
    };
    const mano = () => this.acc.pausa && this.acc.pausa();
    mano.soloSi = true;
    const ts = () => { u.panel = u.panel === "tacticas" ? null : "tacticas"; };
    // con el tiempo de invocacion, para el juego (O-327); si no, el compacto de siempre
    const aura = () => { if (c.aura.parar) return this.pedirInvocacion(); u.panel = u.panel === "espiritus" ? null : "espiritus"; };
    aura.soloSi = !!c.aura.parar;
    // la T: el tiro largo o el pase hacia delante (O-326); debajo, lo que hara
    const t = () => this.pulsarT();
    t.soloSi = true;
    col.append(hex("mano", c.mano, 4, "icono_mano", "Pausa (barra espaciadora)", mano, "boton-pausa"),
      hex("ts", c.ts, 33, "icono_ts", "Tácticas", ts), hex("aura", c.aura, 62, "icono_aura", c.aura.parar ? "Espíritus: para el juego para invocar" : "Espíritus", aura),
      hex("t", c.t, 100, "icono_t", c.t.titulo || "Tiro largo", t, "boton-t"));
    if (c.t.si) col.appendChild(el("div", { class: "gx-hex-que " + c.t.que, title: c.t.titulo }, [el("b", { text: c.t.etiqueta[0] }), el("small", { text: c.t.etiqueta[1] })]));
    return col;
  },

  // las tacticas en juego: compacto PEGADO ABAJO (lo de delante del balon queda libre,
  // diseno 5.8 CRITICA); pulsar una la lanza y cierra
  _domTacticasCompacto(pn) {
    const u = this.ui, caja = el("div", { class: "gx-compacto gx-control" });
    caja.appendChild(el("div", { class: "cab" }, [el("b", { text: "Tácticas" }), el("small", { text: "sin parar el juego" })]));
    const lista = el("div", { class: "tacs" });
    if (!pn.tacticas.length) lista.appendChild(el("div", { class: "nada", text: "Tu equipo no lleva tácticas." }));
    for (const t of pn.tacticas) {
      const c = el("div", { class: "gx-casilla tac" + (t.si ? "" : " apagada") + (t.activa ? " elegida" : ""), title: t.texto || null },
        [el("span", { class: "nom", text: t.nombre }), el("small", { text: t.estado })]);
      c.onclick = this._pulsa({ si: t.si, porque: this._cap(t.estado) }, () => { this.acc.ordenar && this.acc.ordenar({ tipo: "tactica", lado: this._yo, k: t.k }); u.panel = null; });
      lista.appendChild(c);
    }
    caja.appendChild(lista);
    return caja;
  },

  // el panel de auras: compacto en juego (pegado abajo) o la tactil entera (p19)
  _domEspiritus(e, compacto) {
    const u = this.ui;
    const caja = el("div", { class: compacto ? "gx-compacto gx-auras chico gx-control" : "gx-auras" });
    caja.appendChild(el("div", { class: "cab" }, [el("b", { text: e.nombre || "Espíritus" }), el("span", { class: "act" }, [el("em", { text: "Activos" }), el("b", { text: e.activos + "/" + e.max })])]));
    const fila = el("div", { class: "caras" });
    for (const c of e.caras) {
      const n = this._cara(c.cara, (c.sel ? "sel" : "") + (c.con ? "" : " sin") + (c.activo ? " activo" : ""), c.nombre + (c.con ? "" : ": sin espíritu"));
      n.classList.add("gx-control");
      if (c.con) n.onclick = this._pulsa({ si: true }, () => { u.aura = c.id; });
      fila.appendChild(n);
    }
    caja.appendChild(fila);
    if (e.tarjeta) {
      const t = e.tarjeta;
      const tarjeta = el("div", { class: "tarjeta" + (t.activo ? " activa" : "") }, [
        this._cara(t.cara, "retrato"),
        t.activo ? el("em", { class: "sello", text: "¡Activo!" }) : null,
        el("div", { class: "arriba" }, [this._elem(t.elemento), el("span", { class: "fam", text: t.familia }), el("b", { class: "nom", text: t.espiritu })]),
        el("div", { class: "cuentas" }, [
          el("span", { class: "cj" }, [el("em", { text: "HIP" }), el("b", { text: String(t.hip) })]), el("i", { text: "+" }),
          el("span", { class: "cj" }, [el("em", { text: "AT/DF" }), el("b", { text: t.atdf })]), el("i", { text: "=" }),
          el("span", { class: "cj total" }, [el("em", { text: t.activo ? "QUEDA" : "DURA" }), el("b", { text: t.activo ? t.queda + " s" : t.dura })])])]);
      caja.appendChild(tarjeta);
      if (!compacto) caja.appendChild(el("div", { class: "texto", text: t.texto }));
    }
    caja.appendChild(el("div", { class: "mensaje" + (e.invocar.si ? " si" : ""), text: e.mensaje }));
    if (compacto) {
      const inv = this._b("invocar", "Invocar", "verde", e.invocar.si, e.invocar.porque, [178, 68, 54, 20],
        () => { this.acc.ordenar && this.acc.ordenar({ tipo: "invocar", jugador: e.jugador }); u.panel = null; }, { chico: true });
      const atras = this._b("atras", "Atrás", "azul", true, "", [236, 68, 40, 20], () => { u.panel = null; }, { chico: true });
      caja.append(this._boton(inv, "rel"), this._boton(atras, "rel"));
    }
    return caja;
  },

  // el tiempo de invocacion (O-327): la franja de arriba (el rotulo, quien la ha pedido o
  // lo que ha invocado el rival y la cuenta online) y el panel de auras entero
  _domInvocacion(t) {
    const caja = el("div", { class: "gx-invocacion gx-control" });
    caja.appendChild(el("div", { class: "cab-inv" }, [el("b", { text: t.titulo }), el("span", { text: t.quien }), t.cuenta ? el("em", { text: t.cuenta }) : null]));
    caja.appendChild(this._domEspiritus(t, false));
    return caja;
  },

  // "Tiempo de tactica" / "Pausa" con su cajita (b14)
  _domRotulo(r) {
    return el("div", { class: "gx-rotulo" }, [el("b", { text: r.texto }), r.caja ? el("span", { text: r.caja }) : null]);
  },
  // la caja de ayuda (b16): la cruceta (aqui las flechas) y el texto en dos lineas
  _domAyuda(a) {
    const caja = el("div", { class: "gx-ayuda-caja" + (a.camara ? "" : " sola") + (a.morada ? " bajo" : "") });
    if (a.camara) caja.appendChild(el("div", { class: "cam" }, [el("i", { class: "cruz" }), el("span", {}, [el("small", { text: "← ↑ → ↓" }), document.createTextNode("Cámara")])]));
    const txt = el("div", { class: "txt" });
    for (const l of a.lineas || []) if (l) txt.appendChild(el("div", { text: l }));
    if (a.extra) txt.appendChild(el("div", { class: "extra", text: a.extra }));
    if (a.cuenta) { this._cuenta = el("div", { class: "cuenta" }); txt.appendChild(this._cuenta); }
    caja.appendChild(txt);
    return caja;
  },

  // el duelo: la franja morada (si tiene espiritu), la caja de ayuda, la franja del
  // objetivo y la barra [izq] [rayo] [dcha]; en el penalti, ademas, "PK" y la porteria
  _domDuelo(d, pk) {
    const u = this.ui, caja = el("div", { class: "gx-duelo" });
    if (d.morada) caja.appendChild(this._domMorada(d.morada));
    if (pk) {
      caja.appendChild(el("div", { class: "gx-pk", text: "PK" }));
      const port = el("div", { class: "gx-porteria gx-control", title: d.explica || null });
      for (const z of pk.zonas) {
        const mano = el("i", { class: "mano" });
        mano.style.backgroundImage = "url(\"" + GX.iconoUrl("icono_mano") + "\")";
        const b = el("button", { class: "zona", title: z.titulo }, [mano, el("span", { text: z.texto })]);
        b.onclick = this._pulsa({ si: true }, z.accion);
        port.appendChild(b);
      }
      caja.appendChild(port);
    }
    if ((d.ayuda && d.ayuda.length) || d.cuenta) {
      const a = this._domAyuda({ lineas: d.ayuda, cuenta: d.cuenta, morada: !!d.morada });
      if (pk) a.classList.add("pk");
      caja.appendChild(a);
    }
    caja.appendChild(el("div", { class: "gx-franja-duelo", text: d.franja }));
    const barra = el("div", { class: "gx-barra-duelo gx-control" });
    const cmd = (b, clase) => {
      const n = el("button", { class: "gx-cmd " + clase + (b.si ? "" : " apagado") + (b.sel ? " sel" : ""), title: [b.nota, b.porque].filter(Boolean).join(" · ") || null });
      if (b.flecha) n.appendChild(this._icono("flecha_izq", "flecha " + b.flecha));
      const linea = b.si ? [b.cifra, b.fuera].filter(Boolean) : [];
      n.appendChild(el("span", { class: "dentro" }, [el("b", { text: b.texto }),
        b.si ? (linea.length ? el("small", {}, [b.cifra ? document.createTextNode(b.cifra + (b.fuera ? " · " : "")) : null, b.fuera ? el("em", { class: "fuera", text: b.fuera }) : null]) : null)
          : el("small", { class: "no", text: b.porque })]));
      n.onclick = this._pulsa(b);
      return n;
    };
    if (d.izq) barra.appendChild(cmd(d.izq, "izq"));
    else barra.appendChild(el("div", { class: "gx-cmd izq apagado vacio" }));
    const rayo = el("button", { class: "gx-rayo" + (d.rayo.si ? "" : " apagado") + (d.rayo.sel ? " sel" : ""), title: d.rayo.si ? "Supertécnicas (" + d.rayo.n + ")" : d.rayo.porque });
    rayo.style.backgroundImage = "url(\"" + GX.iconoUrl("boton_rayo") + "\")";
    rayo.onclick = this._pulsa({ si: d.rayo.si, porque: d.rayo.porque }, () => { u.lista = true; u.pagina = 0; u.marcada = null; });
    barra.appendChild(rayo);
    if (Array.isArray(d.der)) {
      const partido = el("div", { class: "gx-cmd der partido" });
      d.der.forEach((b, k) => partido.appendChild(cmd(b, "mitad m" + k)));
      barra.appendChild(partido);
    } else if (d.der) barra.appendChild(cmd(d.der, "der"));
    else barra.appendChild(el("div", { class: "gx-cmd der apagado vacio" }, [el("span", { class: "dentro" }, [el("b", { text: "—" })])]));
    caja.appendChild(barra);
    return caja;
  },
  _domMorada(m) {
    // una linea pequena: lo que da o, si no se puede, por que (en rojo)
    const no = m.boton && !m.boton.si;
    const caja = el("div", { class: "gx-morada" + (m.activo ? " activa" : ""), title: m.texto }, [
      el("span", { class: "fam", text: m.familia }), el("b", { class: "nom", text: m.espiritu }), el("small", { class: no ? "porque" : "", text: no ? m.boton.porque : m.texto })]);
    if (m.boton) {
      const b = el("button", { class: "acc gx-control" + (m.boton.si ? "" : " apagado"), title: m.boton.porque || null }, [el("span", { text: m.boton.texto })]);
      b.onclick = this._pulsa(m.boton, m.boton.accion);
      caja.appendChild(b);
    }
    return caja;
  },

  // la lista de supertecnicas (m05): el campo asoma arriba (y0-40), la cabecera, la
  // rejilla 2x4 y la barra con [Aceptar] y [Atras] (los botones van en v.botones)
  _domLista(l, d) {
    const caja = el("div", { class: "gx-lista gx-control" });
    const cab = el("div", { class: "cab" });
    if (l.cabecera) {
      const c = l.cabecera;
      cab.append("Potencia ", el("b", { text: String(c.potencia) }), " · TEN ", el("b", { text: String(c.tp) }));
      if (c.cifra) cab.append(" · " + c.cifra.replace(/^total /, "Total "));
      if (c.extra) cab.appendChild(el("small", { text: " · " + c.extra }));
    } else cab.textContent = "Sin supertécnicas";
    // la cabecera y el panel suben dentro de una caja que acaba en y203: por debajo se sigue
    // viendo la barra de comandos que sale (t03, +67 ms)
    const sube = el("div", { class: "sube" }, [cab]);
    caja.appendChild(sube);
    const panel = el("div", { class: "panel" });
    l.casillas.forEach((c, k) => {
      const n = el("div", { class: "gx-casilla tec c" + (k % 2) + " f" + Math.floor(k / 2) + (c.vacia ? " vacia" : "") + (c.sel ? " elegida" : "") + (c.si || c.vacia ? "" : " apagada"),
        title: c.vacia ? null : [c.nombre, c.nota, c.porque].filter(Boolean).join(" · ") });
      if (!c.vacia) {
        n.append(this._elem(c.elemento), el("span", { class: "nom" }, [document.createTextNode(c.nombre), c.espiritu ? el("em", { text: "✦" }) : null]),
          el("span", { class: "coste" }, [el("small", { text: "TEN" }), el("b", { text: String(c.tp) })]));
        n.onclick = this._pulsa({ si: true }, () => this.marcar(c.clave));
      }
      panel.appendChild(n);
    });
    if (l.paginas > 1) panel.appendChild(el("div", { class: "pag", text: "página " + (l.pagina + 1) + " de " + l.paginas }));
    sube.appendChild(panel);
    caja.appendChild(el("div", { class: "barra" }));
    // la caja de ayuda del duelo encima del campo que asoma (el aviso del rival, la cuenta)
    return caja;
  },

  // Equipo (p26)
  _domEquipo(q) {
    const u = this.ui, caja = el("div", { class: "gx-equipo gx-control" });
    caja.appendChild(el("div", { class: "pestana", text: "EQUIPO" }));
    caja.appendChild(el("div", { class: "eq-nom", text: q.equipo }));
    caja.appendChild(el("div", { class: "cab f", text: "Formación" }));
    caja.appendChild(el("div", { class: "caja-nom f", text: q.formacion || "—" }));
    const campo = el("div", { class: "mini" }, [el("i", { class: "l medio" }), el("i", { class: "l circ" }), el("i", { class: "l area a" }), el("i", { class: "l area b" })]);
    // los puestos de la formacion (u, v del motor: -0,85..0,85 y -0,92 tu porteria .. 0,6
    // delante); tu ataque hacia arriba
    for (const j of q.jugadores) {
      const x = 3 + (Math.max(-0.95, Math.min(0.95, j.u)) + 0.95) / 1.9 * 100, y = 3 + (0.66 - Math.max(-0.95, Math.min(0.66, j.v))) / 1.61 * 118;
      const c = this._cara(j.cara, (j.sel ? "sel" : "") + (j.expulsado ? " expulsado" : "") + (j.entra ? " sale" : ""),
        j.expulsado ? j.nombre + " · " + q.expulsado : j.nombre + (j.entra ? " · entrará " + j.entra : ""));
      c.style.left = x.toFixed(1) + "px"; c.style.top = y.toFixed(1) + "px";
      if (j.amarilla) c.appendChild(el("u", { class: "amarilla" }));
      if (j.refuerzo) c.appendChild(el("small", { class: "rf", text: "+" + j.refuerzo.pct + " %" }));
      if (j.entra) c.appendChild(el("small", { class: "cambio", text: "⇄" }));
      if (!j.expulsado) { c.classList.add("gx-control"); c.onclick = this._pulsa({ si: true }, () => this.elegirCampo(j.id)); }
      campo.appendChild(c);
    }
    caja.appendChild(campo);
    const banco = el("div", { class: "banco" });
    for (const s of q.suplentes) {
      const c = this._cara(s.cara, (s.sel ? "sel" : "") + (s.usado ? " usado" : "") + (s.pendiente ? " pendiente" : ""),
        s.nombre + " (" + [GX.posicionCorta(s.posicion), s.elemento].filter(Boolean).join(" · ") + ")" + (s.usado ? ": ya ha jugado" : s.pendiente ? ": entrará" : ""));
      if (!s.usado && !s.pendiente) { c.classList.add("gx-control"); c.onclick = this._pulsa({ si: true }, () => this.elegirBanco(s.k)); }
      banco.appendChild(c);
    }
    caja.appendChild(banco);
    caja.appendChild(el("div", { class: "cab r", text: "Recursos" }));
    caja.appendChild(el("div", { class: "caja-nom r", text: q.ficha ? q.ficha.nombre : "—" }));
    const info = el("div", { class: "info" });
    if (q.ficha) info.appendChild(el("div", { class: "quien" }, [this._cara(q.ficha.cara, "grande"), el("div", {}, [el("small", { text: q.ficha.linea }),
      ...q.ficha.notas.map(t => el("div", { class: "nota", text: t }))])]));
    const barra = (et, [a, m], clase) => el("div", { class: "rec " + clase }, [el("span", {}, [el("em", { text: et }), el("b", { text: a + " / " + m })]),
      el("div", { class: "bar" }, [el("i", { style: "width:" + Math.round(Math.max(0, Math.min(1, a / m)) * 100) + "%" })])]);
    info.append(barra("Tensión", q.tension, "ten"), barra("Hiperbarra", q.hiper, "hip"), el("div", { class: "cambios", text: q.cambios, title: q.reglas }));
    for (const t of q.pendientes) info.appendChild(el("div", { class: "pend", text: t }));
    info.appendChild(el("div", { class: "reglas", text: q.reglas }));
    caja.appendChild(info);
    caja.appendChild(el("div", { class: "gx-franja-abajo eq", text: q.mensaje }));
    return caja;
  },

  // Registro: dos pestanas
  _domRegistro(r, p, yo) {
    const u = this.ui, caja = el("div", { class: "gx-registro gx-control" });
    const pest = (k, t) => { const b = el("button", { class: "gx-pestana" + (r.pest === k ? " activa" : ""), text: t }); b.onclick = this._pulsa({ si: true }, () => { u.pestRegistro = k; }); return b; };
    caja.appendChild(el("div", { class: "gx-pestanas" }, [pest("pasa", "Lo que pasa"), pest("ayuda", "Cómo se juega")]));
    const cuerpo = el("div", { class: "cuerpo" });
    if (r.pest === "ayuda") {
      const t = document.querySelector("#ayuda");
      if (t) cuerpo.appendChild(t.content.cloneNode(true));
      cuerpo.classList.add("ayuda");
    } else {
      // lo ultimo arriba, sin los perdidos en un corte de red ni los privados del rival
      // (el cambio que prepara no se ve hasta que se hace, O-308)
      for (let k = p.eventos.length - 1; k >= 0; k--) {
        const e = p.eventos[k];
        if (!e || (e.privado && e.lado !== yo)) continue;
        cuerpo.appendChild(el("div", { class: "ev " + (e.clase || ""), text: p.etiquetaParte(e.mitad) + " " + p.minuto(e.reloj) + "' " + e.texto }));
      }
      if (!cuerpo.firstChild) cuerpo.appendChild(el("div", { class: "ev", text: "Aún no ha pasado nada." }));
    }
    caja.appendChild(cuerpo);
    return caja;
  },

  // Tactica: pestanas Tacticas / Espiritus
  _domTactica(t) {
    const u = this.ui, caja = el("div", { class: "gx-tacticas gx-control p-" + t.pest });
    const pest = (k, x) => { const b = el("button", { class: "gx-pestana" + (t.pest === k ? " activa" : ""), text: x }); b.onclick = this._pulsa({ si: true }, () => { u.pestTactica = k; }); return b; };
    caja.appendChild(el("div", { class: "gx-pestanas" }, [pest("tacticas", "Tácticas"), pest("espiritus", "Espíritus")]));
    if (t.pest === "espiritus") { caja.appendChild(this._domEspiritus(t, false)); return caja; }
    caja.appendChild(el("div", { class: "cab" }, [el("b", { text: t.cabecera }), t.texto ? el("small", { text: t.texto }) : null]));
    const panel = el("div", { class: "panel" });
    if (!t.tacticas.length) panel.appendChild(el("div", { class: "nada", text: "Tu equipo no lleva tácticas." }));
    t.tacticas.forEach((x, k) => {
      const n = el("div", { class: "gx-casilla tac c" + (k % 2) + " f" + Math.floor(k / 2) + (x.sel ? " elegida" : "") + (x.si ? "" : " apagada"), title: x.texto || null },
        [el("span", { class: "nom", text: x.nombre }), el("small", { text: x.estado })]);
      n.onclick = this._pulsa({ si: true }, () => { u.tac = x.k; });
      panel.appendChild(n);
    });
    caja.append(panel, el("div", { class: "barra" }));
    return caja;
  },

  // las estadisticas (b44, b45): cifras blancas a los lados (tuyas a la izquierda), la
  // etiqueta amarilla en medio, la barra de posesion y los goles. Con mas de 4 filas,
  // filas mas bajas (Galaxy cabe con 3; Pizarra puede tener 8)
  _domEstad(s, conFranja) {
    const caja = el("div", { class: "gx-estad-todo gx-control" + (conFranja ? " corta" : "") });
    caja.appendChild(el("div", { class: "titulo", text: s.titulo }));
    const panel = el("div", { class: "gx-estad" });
    const alto = Math.min(26, Math.floor(84 / Math.max(1, s.filas.length))), tam = Math.max(10, Math.min(20, alto - 2));
    const filas = el("div", { class: "filas" });
    for (const f of s.filas) {
      // el "%" pequeno junto a la cifra, como b44
      const cifra = x => { const m = String(x).match(/^(.*) %$/); return m ? el("b", {}, [document.createTextNode(m[1]), el("small", { text: "%" })]) : el("b", { text: String(x) }); };
      const fila = el("div", { class: "fila", title: f.title, style: "height:" + alto + "px;font-size:" + tam + "px" },
        [cifra(f.a), el("span", { text: f.que }), cifra(f.b)]);
      filas.appendChild(fila);
    }
    panel.appendChild(filas);
    if (s.posesion !== null && s.posesion !== undefined) panel.appendChild(el("div", { class: "pos" }, [el("i", { style: "width:" + s.posesion + "%" })]));
    s.goles.forEach((g, k) => {
      const c = el("div", { class: "goles g" + k });
      for (const x of g) c.appendChild(el("div", {}, [el("em", { class: "p" + x.mitad, text: x.parte }), el("span", { text: x.texto })]));
      if (s.mas[k]) c.appendChild(el("div", { class: "mas", text: "+" + s.mas[k] + " más (en Registro)" }));
      panel.appendChild(c);
    });
    panel.appendChild(el("div", { class: "et-goles", text: "Goles" }));
    caja.appendChild(panel);
    return caja;
  },

  // "Espera unos instantes..." (m08, b17) y, si el rival no responde, [Dejar el partido]
  _domEspera(e) {
    const caja = el("div", { class: "gx-espera" + (e.linea ? " larga" : "") }, [el("div", { text: e.texto }), e.linea ? el("small", { text: e.linea }) : null]);
    if (e.dejar) {
      const b = this._b("dejar", "Dejar el partido", "verde", true, "", [0, 0, 110, 22], () => this.acc.dejar && this.acc.dejar(), { chico: true });
      caja.appendChild(this._boton(b, "rel"));
    }
    return caja;
  },
};
