/* El motor del partido (NOTAS O-286): la simulacion, sin pantalla ni raton.
   Avanza a pasos fijos (REGLAS.PASO) y solo cambia por ordenes (dibujar una
   ruta, pasar, chutar, elegir en un duelo). Con la misma semilla y las mismas
   ordenes en el mismo paso, da lo mismo en cualquier PC: asi se jugara online.

   Como en los Inazuma de DS: los jugadores sin ordenes se colocan solos, y
   cuando un rival se cruza con el que lleva el balon el partido se para y
   cada lado elige que hace (regatear, entrar, cargar o una supertecnica). Al
   chutar se para igual: el que chuta elige tiro, y el que defiende el muro y
   la parada. Los numeros son los de Victory Road (partido-reglas.js). */
"use strict";

class Partido {
  constructor(equipoA, equipoB, opciones = {}) {
    this.R = REGLAS;
    this.azar = Azar(opciones.semilla || 20261004);
    this.duracion = opciones.mitad || REGLAS.MITAD;
    // lados que lleva una persona: su jugador con balon no corre solo (como en DS)
    this.manual = opciones.manual || [false, false];
    this.mitad = 1; this.reloj = 0; this.pasos = 0;
    this.goles = [0, 0];
    this.tension = [REGLAS.TENSION_INICIO, REGLAS.TENSION_INICIO];
    this.nombres = [equipoA.nombre, equipoB.nombre];
    this.jugadores = [];
    [equipoA, equipoB].forEach((eq, lado) => this._crearEquipo(eq, lado));
    this.balon = { x: 0, y: 0, vx: 0, vy: 0, dueno: null, ultimo: 0, pase: null };
    this.fase = "juego"; this.espera = 0;
    this.duelo = null;            // el duelo parado esperando las elecciones
    this.nDuelos = 0;             // cada duelo lleva su numero (para la pantalla)
    this.resultado = null;        // lo que paso en el ultimo duelo (para pintarlo)
    this.eventos = [];            // lo que pasa, para el registro
    this.saque(0);
  }

  // --- montar ---------------------------------------------------------------
  _crearEquipo(eq, lado) {
    const puestos = (eq.formacion && eq.formacion.puestos) || [];
    const dir = lado === 0 ? 1 : -1;
    eq.jugadores.slice(0, 11).forEach((d, k) => {
      const p = puestos.find(q => q.puesto === d.puesto) || puestos[k] || { x: 0, y: 0.5 };
      // la formacion del juego: x -1..1, y 0.9 (porteria propia) .. 0.1 (arriba)
      const u = p.x * 0.85, v = 0.79 - 1.9 * p.y;
      const j = {
        id: this.jugadores.length, lado, dir, puesto: d.puesto, dorsal: d.dorsal,
        nombre: d.nombre, cara: d.cara, elemento: d.elemento, posicion: d.posicion,
        nivel: d.nivel || 99, stats: (d.stats || [0, 0, 0, 0, 0, 0, 0]).map(Number),
        tecnicas: (d.tecnicas || []).filter(t => t.tipo && t.tipo !== "Hipertecnica" && t.poder > 0),
        esPortero: d.puesto === 0 || p.posicion === "POR",
        u, v, x: 0, y: 0, mx: 0, my: dir,
        ruta: [], aturdido: 0, respiro: 0, conBalon: false,
      };
      if (j.esPortero) { j.kpMax = REGLAS.kpBase(j); j.kp = j.kpMax; }
      // lo que puede gastar en tecnicas: la tension de su equipo
      Object.defineProperty(j, "pt", { get: () => this.tension[lado], enumerable: false });
      this.jugadores.push(j);
    });
  }

  equipo(lado) { return this.jugadores.filter(j => j.lado === lado); }
  portero(lado) { return this.jugadores.find(j => j.lado === lado && j.esPortero) || this.equipo(lado)[0]; }
  dueno() { return this.balon.dueno === null ? null : this.jugadores[this.balon.dueno]; }
  apunta(texto, clase) { this.eventos.push({ paso: this.pasos, mitad: this.mitad, reloj: this.reloj, texto, clase }); }
  minuto() { return Math.floor(this.reloj / this.duracion * 45) + (this.mitad === 2 ? 45 : 0); }

  // del marco del equipo (u: ancho -1..1, v: largo -1 propia .. 1 rival) al campo
  aCampo(j, u, v) { return { x: u * REGLAS.ANCHO / 2 * j.dir, y: v * REGLAS.LARGO / 2 * j.dir }; }
  porteriaRival(j) { return { x: 0, y: REGLAS.LARGO / 2 * j.dir }; }

  saque(lado) {
    // todos a su campo, el balon al centro para el que saca
    for (const j of this.jugadores) {
      const c = this.aCampo(j, j.u, Math.min(-0.04, (j.v - 1) / 2));
      j.x = c.x; j.y = c.y; j.ruta = []; j.aturdido = 0; j.respiro = 0; j.conBalon = false;
      j.mx = 0; j.my = j.dir;
    }
    const delanteros = this.equipo(lado).filter(j => !j.esPortero).sort((a, b) => b.v - a.v);
    const saca = delanteros[0];
    saca.x = 0; saca.y = -1.2 * saca.dir;
    this.balon = { x: 0, y: 0, vx: 0, vy: 0, dueno: null, ultimo: lado, pase: null };
    this.coger(saca);
    this.fase = "juego";
  }

  coger(j) {
    for (const o of this.jugadores) o.conBalon = false;
    j.conBalon = true;
    this.balon.dueno = j.id; this.balon.ultimo = j.lado; this.balon.pase = null;
    this.balon.vx = this.balon.vy = 0;
  }
  soltar() {
    const d = this.dueno();
    if (d) d.conBalon = false;
    this.balon.dueno = null;
  }

  // --- ordenes ----------------------------------------------------------------
  // {tipo:"ruta", jugador, puntos:[{x,y}...]} | {tipo:"pase", de, a}
  // {tipo:"tiro", de} | {tipo:"elegir", lado, eleccion}
  ordenar(o) {
    if (o.tipo === "elegir") return this.elegir(o.lado, o.eleccion);
    if (this.fase !== "juego") return false;
    const j = this.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (!j) return false;
    if (o.tipo === "ruta") {
      j.ruta = (o.puntos || []).slice(0, 40).map(p => this._dentro(p.x, p.y));
      return true;
    }
    if (o.tipo === "pase") {
      const a = this.jugadores[o.a];
      if (!j.conBalon || !a || a.lado !== j.lado || a.id === j.id) return false;
      this._pasar(j, a);
      return true;
    }
    if (o.tipo === "pasePunto") {
      // el pase al hueco: a un punto del campo; va a por el el companero mas cerca
      if (!j.conBalon) return false;
      const destino = this._dentro(o.x, o.y);
      const companeros = this.equipo(j.lado).filter(c => c.id !== j.id && !c.esPortero);
      const a = companeros.sort((p, q) => Math.hypot(p.x - destino.x, p.y - destino.y) - Math.hypot(q.x - destino.x, q.y - destino.y))[0];
      if (!a) return false;
      this._pasarA(j, a, destino);
      return true;
    }
    if (o.tipo === "tiro") {
      if (!j.conBalon) return false;
      const g = this.porteriaRival(j);
      const d = Math.hypot(g.x - j.x, g.y - j.y);
      const larga = j.tecnicas.some(t => REGLAS.esLarga(t) && t.tp <= j.pt);
      if (d > REGLAS.DISTANCIA_TIRO && !(larga && d < REGLAS.DISTANCIA_TIRO * 1.6)) {
        this.apunta(j.nombre + " esta demasiado lejos para chutar", "aviso");
        return false;
      }
      this._empezarTiro(j, d);
      return true;
    }
    return false;
  }

  _dentro(x, y) {
    return { x: Math.max(-REGLAS.ANCHO / 2 + 0.5, Math.min(REGLAS.ANCHO / 2 - 0.5, x)),
             y: Math.max(-REGLAS.LARGO / 2 + 0.5, Math.min(REGLAS.LARGO / 2 - 0.5, y)) };
  }

  _pasar(de, a) {
    // al hueco: adonde estara el companero cuando llegue el balon
    const d = Math.hypot(a.x - de.x, a.y - de.y);
    const t = d / REGLAS.VEL_PASE;
    const destino = this._dentro(a.x + a.mx * REGLAS.velocidad(a) * t * 0.6, a.y + a.my * REGLAS.velocidad(a) * t * 0.6);
    this._pasarA(de, a, destino);
  }

  _pasarA(de, a, destino) {
    const dd = Math.hypot(destino.x - de.x, destino.y - de.y) || 1;
    this.soltar();
    this.balon.x = de.x; this.balon.y = de.y;
    this.balon.vx = (destino.x - de.x) / dd * REGLAS.VEL_PASE;
    this.balon.vy = (destino.y - de.y) / dd * REGLAS.VEL_PASE;
    this.balon.pase = { de: de.id, a: a.id, destino, queda: dd };
    this.balon.ultimo = de.lado;
    de.respiro = 0.6;
    a.ruta = [destino];
    this.apunta(de.nombre + " pasa a " + a.nombre);
  }

  // --- duelos -------------------------------------------------------------------
  // Opciones de cada lado: [{clave, nombre, tipo, poder, tp, puede}]
  _opciones(j, que) {
    const base = {
      regate: [{ clave: "normal", nombre: "Regatear", nota: "seguro", tipo: "Regate", poder: 0, tp: 0, puede: true },
               { clave: "potente", nombre: "Romper", nota: "fuerte pero inestable", tipo: "Regate", poder: 0, tp: 0, puede: true }],
      entrada: [{ clave: "normal", nombre: "Tapar", nota: "seguro", tipo: "Defensa", poder: 0, tp: 0, puede: true },
                { clave: "potente", nombre: "Entrada", nota: "fuerte pero inestable", tipo: "Defensa", poder: 0, tp: 0, puede: true },
                { clave: "cargar", nombre: "Cargar", nota: "disputa: fisico", tipo: "Defensa", poder: 0, tp: 0, puede: true }],
      tiro: [{ clave: "normal", nombre: "Tiro normal", tipo: "Tiro", poder: 0, tp: 0, puede: true }],
      parada: [{ clave: "normal", nombre: "Parar", tipo: "Parada", poder: 0, tp: 0, puede: true }],
      muro: [{ clave: "normal", nombre: "Bloquear", tipo: "Defensa", poder: 0, tp: 0, puede: true },
             { clave: "nada", nombre: "Dejar pasar", tipo: "", poder: 0, tp: 0, puede: true }],
    }[que];
    const tecs = j.tecnicas.filter(t => REGLAS.sirve(t, que)).map(t => ({
      clave: "t" + t.ranura, nombre: t.nombre, tipo: t.tipo, elemento: t.elemento, subtipo: t.subtipo,
      interno: t.interno, poder: Math.round(REGLAS.poderTecnica(j, t)), tp: t.tp, puede: t.tp <= j.pt,
    }));
    return tecs.concat(base);
  }

  _tecnica(j, clave) {
    if (!clave || clave[0] !== "t") return null;
    return j.tecnicas.find(t => "t" + t.ranura === clave) || null;
  }

  _empezarDuelo(att, def) {
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "foco", atacante: att.id, defensor: def.id,
      lados: {
        [att.lado]: { rol: "ataque", jugador: att.id, opciones: this._opciones(att, "regate") },
        [def.lado]: { rol: "defensa", jugador: def.id, opciones: this._opciones(def, "entrada") },
      },
      elecciones: {},
    };
    this.apunta("¡" + def.nombre + " sale al paso de " + att.nombre + "!", "duelo");
  }

  _empezarTiro(tirador, distancia) {
    const rivales = this.equipo(1 - tirador.lado);
    const portero = this.portero(1 - tirador.lado);
    const g = this.porteriaRival(tirador);
    // el muro: el defensa (no portero) mas cerca de la linea de tiro y por delante
    let muro = null, mejor = 3.2;
    for (const r of rivales) {
      if (r.esPortero || r.aturdido > 0) continue;
      const e = this._distanciaALinea(r, tirador, g);
      if (e.delante && e.d < mejor) { mejor = e.d; muro = r; }
    }
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "tiro", tirador: tirador.id, portero: portero.id, muro: muro ? muro.id : null, distancia,
      lados: {
        [tirador.lado]: { rol: "tiro", jugador: tirador.id, opciones: this._opciones(tirador, "tiro") },
        [1 - tirador.lado]: { rol: "porteria", jugador: portero.id, opciones: this._opciones(portero, "parada"),
          muro: muro ? { jugador: muro.id, opciones: this._opciones(muro, "muro") } : null },
      },
      elecciones: {},
    };
    this.apunta(tirador.nombre + " chuta a " + Math.round(distancia) + " m", "tiro");
  }

  _distanciaALinea(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    return { d: Math.hypot(p.x - cx, p.y - cy), delante: t > 0.05 && t < 0.92 };
  }

  // lo que falta por elegir: {lado: datos} de los que aun no han elegido
  pendientes() {
    if (this.fase !== "duelo" || !this.duelo) return {};
    const fuera = {};
    for (const lado of [0, 1]) {
      if (this.duelo.lados[lado] && this.duelo.elecciones[lado] === undefined) fuera[lado] = this.duelo.lados[lado];
    }
    return fuera;
  }

  // eleccion: en un foco, la clave; en un tiro, {tiro} o {parada, muro}
  elegir(lado, eleccion) {
    if (this.fase !== "duelo" || !this.duelo || !this.duelo.lados[lado]) return false;
    if (this.duelo.elecciones[lado] !== undefined) return false;
    this.duelo.elecciones[lado] = eleccion;
    if (Object.keys(this.duelo.lados).every(l => this.duelo.elecciones[l] !== undefined)) this._resolver();
    return true;
  }

  _tirada(v) { return v * (1 + (this.azar() * 2 - 1) * REGLAS.AZAR); }
  _gastar(j, t) { if (t) this.tension[j.lado] = Math.max(0, this.tension[j.lado] - t.tp); }
  _tension(lado, mas) { this.tension[lado] = Math.min(REGLAS.TENSION_MAX, this.tension[lado] + mas); }

  _resolver() {
    const du = this.duelo;
    if (du.tipo === "foco") return this._resolverFoco(du);
    return this._resolverTiro(du);
  }

  _resolverFoco(du) {
    const att = this.jugadores[du.atacante], def = this.jugadores[du.defensor];
    const ca = du.elecciones[att.lado], cd = du.elecciones[def.lado];
    let ta = this._tecnica(att, ca), td = this._tecnica(def, cd);
    if (ta && ta.tp > att.pt) ta = null;
    if (td && td.tp > def.pt) td = null;
    this._gastar(att, ta); this._gastar(def, td);
    let a, d, como;
    if (cd === "cargar") {
      // disputa: el que carga usa su AT de disputa contra la DF de disputa del que lleva el balon
      a = (REGLAS.dfDisputa(att) + REGLAS.poderTecnica(att, ta)) * REGLAS.efectoElemental(att, ta, def);
      d = REGLAS.atDisputa(def) * REGLAS.efectoElemental(def, null, att);
      como = "disputa";
    } else {
      a = (REGLAS.atFoco(att) + REGLAS.poderTecnica(att, ta)) * REGLAS.efectoElemental(att, ta, def);
      d = (REGLAS.dfFoco(def) + REGLAS.poderTecnica(def, td)) * REGLAS.efectoElemental(def, td, att);
      como = "foco";
    }
    // el comando potente: +35 % pero inestable (DS); luego, como en IE3,
    // gana con probabilidad A^3 / (A^3 + D^3)
    if (ca === "potente") a *= 0.55 + this.azar() * 0.9 + 0.2;
    if (cd === "potente") d *= 0.55 + this.azar() * 0.9 + 0.2;
    const ra = Math.round(a), rd = Math.round(d);
    const gana = this.azar() < REGLAS.probabilidad(ra, rd) ? att : def, pierde = gana === att ? def : att;
    pierde.aturdido = REGLAS.ATURDIDO; pierde.ruta = [];
    gana.respiro = REGLAS.RESPIRO_DUELO; pierde.respiro = REGLAS.RESPIRO_DUELO;
    if (gana === def) this.coger(def);
    // la tension: +60 al que gana y +30 al que pierde, salvo si gano con tecnica
    const tecGana = gana === att ? ta : td, tecPierde = gana === att ? td : ta;
    if (!tecGana) this._tension(gana.lado, REGLAS.TENSION_GANA);
    if (!tecPierde) this._tension(pierde.lado, REGLAS.TENSION_PIERDE);
    this.resultado = {
      tipo: como, ganador: gana.id, valores: { [att.lado]: ra, [def.lado]: rd },
      tecnicas: { [att.lado]: ta ? ta.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      atacante: att.id, defensor: def.id,
    };
    this.apunta((ta ? ta.nombre + ": " : "") + att.nombre + " " + ra + " contra " + (td ? td.nombre + ": " : "") + def.nombre + " " + rd +
      " → " + (gana === att ? "¡se va!" : "¡roba " + def.nombre + "!"), gana === att ? "bien" : "mal");
    this._acabarDuelo(1.6);
  }

  _resolverTiro(du) {
    const tir = this.jugadores[du.tirador], por = this.jugadores[du.portero];
    const muro = du.muro !== null ? this.jugadores[du.muro] : null;
    const et = du.elecciones[tir.lado], ed = du.elecciones[por.lado] || {};
    let tt = this._tecnica(tir, et && et.tiro !== undefined ? et.tiro : et);
    if (tt && tt.tp > tir.pt) tt = null;
    this._gastar(tir, tt);
    const larga = REGLAS.esLarga(tt);
    let at = (REGLAS.atTiro(tir) + REGLAS.poderTecnica(tir, tt)) * REGLAS.porDistancia(du.distancia, larga);
    const pasos = [{ quien: tir.id, que: tt ? tt.nombre : "Tiro", valor: Math.round(at) }];
    // el muro: le resta su DF al tiro (VR); si lo deja en nada, lo para
    if (muro && ed.muro && ed.muro !== "nada") {
      let tm = this._tecnica(muro, ed.muro);
      if (tm && tm.tp > muro.pt) tm = null;
      this._gastar(muro, tm);
      const df = this._tirada((REGLAS.dfMuro(muro) + REGLAS.poderTecnica(muro, tm)) * (tm && REGLAS.gana(tm.elemento, tir.elemento) ? 1.2 : 1));
      pasos.push({ quien: muro.id, que: tm ? tm.nombre : "Bloqueo", valor: Math.round(df) });
      const r = df / Math.max(1, at);
      if (r > 0.75) at *= 0.7;
      if (r >= 1.25) {
        this.resultado = { tipo: "tiro", final: "bloqueado", pasos, tirador: tir.id };
        this.apunta("¡" + muro.nombre + " bloquea el tiro!", "mal");
        this.soltar();
        this.balon.x = muro.x; this.balon.y = muro.y;
        this.balon.vx = (this.azar() - 0.5) * 8; this.balon.vy = -tir.dir * 6;
        this.balon.ultimo = muro.lado;
        return this._acabarDuelo(2.0);
      }
    }
    at *= REGLAS.efectoElemental(tir, tt, por);
    let tp = this._tecnica(por, ed.parada);
    if (tp && tp.tp > por.pt) tp = null;
    this._gastar(por, tp);
    const dfTec = REGLAS.poderTecnica(por, tp) * (tp && REGLAS.gana(tp.elemento, tir.elemento) ? 1.2 : 1);
    const df = por.kp + dfTec;
    pasos.push({ quien: por.id, que: tp ? tp.nombre : "Parada", valor: Math.round(df) });
    pasos[0].valorFinal = Math.round(at);
    if (this.azar() < REGLAS.probabilidad(at, df)) {
      this.goles[tir.lado]++;
      this.resultado = { tipo: "tiro", final: "gol", pasos, tirador: tir.id };
      this.apunta("¡¡GOL de " + tir.nombre + "!! (" + Math.round(at) + " contra " + Math.round(df) + ")", "gol");
      this.fase = "gol"; this.espera = 3.0; this.duelo = null;
      this._sacaDespues = 1 - tir.lado;
      return;
    }
    // parada: el portero se desgasta en proporcion al golpe (VR, desde 4.0.1)
    por.kp = Math.max(por.kpMax * 0.25, por.kp * (1 - REGLAS.DESGASTE * Math.min(0.85, at / df)));
    const despeje = tp && /despej|pu.o/i.test(tp.subtipo || "");
    this.resultado = { tipo: "tiro", final: despeje ? "despeje" : "parada", pasos, tirador: tir.id };
    this.apunta("¡Para " + por.nombre + "! (" + Math.round(at) + " contra " + Math.round(df) + ")", "mal");
    if (despeje) {
      this.soltar();
      this.balon.x = por.x; this.balon.y = por.y + por.dir * 2;
      this.balon.vx = (this.azar() - 0.5) * 12; this.balon.vy = por.dir * 16;
      this.balon.ultimo = por.lado;
    } else {
      this.coger(por);
    }
    this._acabarDuelo(2.0);
  }

  _acabarDuelo(segundos) {
    this.duelo = null;
    this.fase = "resultado";
    this.espera = segundos;
  }

  // --- un paso de simulacion ---------------------------------------------------
  paso() {
    const P = REGLAS.PASO;
    this.pasos++;
    if (this.fase === "duelo") return;                 // parado hasta que elijan
    if (this.fase === "resultado" || this.fase === "gol" || this.fase === "descanso") {
      this.espera -= P;
      if (this.espera > 0) return;
      if (this.fase === "gol") { this.saque(this._sacaDespues); return; }
      if (this.fase === "descanso") { this._segundaParte(); return; }
      this.fase = "juego";
      return;
    }
    if (this.fase === "final") return;

    this.reloj += P;
    if (this.reloj >= this.duracion) {
      if (this.mitad === 1) {
        this.fase = "descanso"; this.espera = 3;
        this.apunta("Descanso: " + this.goles[0] + " - " + this.goles[1], "fin");
      } else {
        this.fase = "final";
        this.apunta("Final: " + this.goles[0] + " - " + this.goles[1], "fin");
      }
      return;
    }

    for (const l of [0, 1]) this._tension(l, REGLAS.TENSION_POR_SEGUNDO * P);
    for (const j of this.jugadores) {
      if (j.esPortero) j.kp = Math.min(j.kpMax, j.kp + j.kpMax * REGLAS.KP_POR_SEGUNDO * P);
      if (j.aturdido > 0) j.aturdido -= P;
      if (j.respiro > 0) j.respiro -= P;
    }
    this._mover(P);
    this._moverBalon(P);
    this._mirarDuelos();
  }

  _segundaParte() {
    this.mitad = 2; this.reloj = 0;
    for (const j of this.jugadores) {
      if (j.esPortero) j.kp = j.kpMax;
      // en la segunda parte se cambia de campo
      j.dir = -j.dir;
    }
    for (const l of [0, 1]) this._tension(l, REGLAS.TENSION_DESCANSO);
    this.apunta("Empieza la segunda parte", "fin");
    this.saque(1);
  }

  // adonde quiere ir cada uno si no tiene ruta (la colocacion automatica de DS)
  _objetivo(j) {
    const b = this.balon, d = this.dueno();
    const tenemos = d && d.lado === j.lado;
    if (j.conBalon) {
      if (this.manual[j.lado]) return { x: j.x, y: j.y };
      const g = this.porteriaRival(j);
      return { x: j.x + (g.x - j.x) * 0.15, y: j.y + j.dir * 8, lento: 0.75 };
    }
    // balon suelto o rival con balon: los dos mas cerca de cada equipo van a por el
    const cerca = this.equipo(j.lado).filter(o => !o.esPortero && o.aturdido <= 0)
      .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
    if (j.esPortero) {
      const g = { x: 0, y: -REGLAS.LARGO / 2 * j.dir };
      const enArea = Math.abs(b.y - g.y) < REGLAS.AREA_Y && Math.abs(b.x) < REGLAS.AREA_X / 2;
      if (!d && enArea) return { x: b.x, y: b.y };
      return { x: Math.max(-3, Math.min(3, b.x * 0.15)), y: g.y + 1.5 * j.dir };
    }
    if (!tenemos && (cerca[0] === j || (!d && cerca[1] === j))) return { x: b.x, y: b.y, apreton: true };
    // los demas, a su zona, movida con el balon (como en DS)
    const bv = (b.y / (REGLAS.LARGO / 2)) * j.dir, bu = (b.x / (REGLAS.ANCHO / 2)) * j.dir;
    let v = j.v + Math.max(-0.35, Math.min(0.35, bv * 0.45)) + (tenemos ? 0.12 : -0.08);
    let u = j.u * 0.9 + bu * 0.22;
    if (tenemos && j.v > 0.2) v += 0.08;
    v = Math.max(-0.9, Math.min(0.85, v));
    return this.aCampo(j, u, v);
  }

  _mover(P) {
    for (const j of this.jugadores) {
      if (j.aturdido > 0) continue;
      let obj, lento = 1;
      if (j.ruta.length) {
        obj = j.ruta[0];
        if (Math.hypot(obj.x - j.x, obj.y - j.y) < 0.6) { j.ruta.shift(); obj = j.ruta[0]; }
      }
      if (!obj) { const o = this._objetivo(j); obj = o; lento = o.lento || 1; }
      if (!obj) continue;
      const dx = obj.x - j.x, dy = obj.y - j.y, d = Math.hypot(dx, dy);
      if (d < 0.15) continue;
      const v = Math.min(d, REGLAS.velocidad(j) * lento * P);
      j.x += dx / d * v; j.y += dy / d * v;
      j.mx = dx / d; j.my = dy / d;
      const c = this._dentro(j.x, j.y); j.x = c.x; j.y = c.y;
    }
    // que no se monten unos encima de otros
    for (let a = 0; a < this.jugadores.length; a++) for (let c = a + 1; c < this.jugadores.length; c++) {
      const p = this.jugadores[a], q = this.jugadores[c];
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = REGLAS.RADIO_JUGADOR * 1.6;
      if (d > 0.001 && d < m) {
        const e = (m - d) / 2;
        p.x -= dx / d * e; p.y -= dy / d * e; q.x += dx / d * e; q.y += dy / d * e;
      }
    }
  }

  _moverBalon(P) {
    const b = this.balon, d = this.dueno();
    if (d) {
      b.x = d.x + d.mx * 0.7; b.y = d.y + d.my * 0.7;
      return;
    }
    b.x += b.vx * P; b.y += b.vy * P;
    if (b.pase) {
      b.pase.queda -= Math.hypot(b.vx, b.vy) * P;
      if (b.pase.queda <= 0) { b.pase = null; b.vx *= 0.35; b.vy *= 0.35; }
    } else {
      b.vx *= REGLAS.ROCE; b.vy *= REGLAS.ROCE;
    }
    // fuera del campo: banda, fondo o porteria
    const ax = REGLAS.ANCHO / 2, ay = REGLAS.LARGO / 2;
    if (Math.abs(b.x) > ax || Math.abs(b.y) > ay) return this._fuera();
    // alguien la coge: el mas cercano que este libre (el pase va al que se le da)
    let mejor = null, md = 1.25;
    for (const j of this.jugadores) {
      if (j.aturdido > 0) continue;
      if (b.pase && j.id === b.pase.de) continue;
      const dd = Math.hypot(j.x - b.x, j.y - b.y);
      const radio = b.pase && j.lado !== this.jugadores[b.pase.de].lado ? 1.0 : md;
      if (dd < radio && (!mejor || dd < mejor.d)) mejor = { j, d: dd };
    }
    if (mejor) {
      const j = mejor.j;
      if (b.pase && j.lado !== this.jugadores[b.pase.de].lado) this.apunta("¡" + j.nombre + " corta el pase!", "mal");
      this.coger(j);
    }
  }

  _fuera() {
    const b = this.balon, ax = REGLAS.ANCHO / 2, ay = REGLAS.LARGO / 2;
    const contra = 1 - b.ultimo;
    if (Math.abs(b.y) > ay) {
      // por el fondo: si la toco el que ataca hacia ahi, saque de puerta; si no, corner
      const fondoDe = this.jugadores.find(j => j.esPortero && Math.sign(-j.dir) === Math.sign(b.y)) || this.portero(contra);
      if (fondoDe.lado !== b.ultimo) {
        this.apunta("Saque de puerta");
        fondoDe.x = 0; fondoDe.y = Math.sign(b.y) * (ay - 5);
        this.coger(fondoDe);
      } else {
        const ataca = this.equipo(contra).filter(j => !j.esPortero)
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        this.apunta("Corner para " + this.nombres[contra]);
        ataca.x = Math.sign(b.x || 1) * (ax - 0.6); ataca.y = Math.sign(b.y) * (ay - 0.6);
        this.coger(ataca);
      }
    } else {
      const saca = this.equipo(contra).filter(j => !j.esPortero)
        .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      this.apunta("Saque de banda para " + this.nombres[contra]);
      saca.x = Math.sign(b.x) * (ax - 0.5); saca.y = Math.max(-ay + 1, Math.min(ay - 1, b.y));
      this.coger(saca);
    }
    for (const j of this.jugadores) j.ruta = [];
    this.fase = "resultado"; this.espera = 0.8;
  }

  _mirarDuelos() {
    const d = this.dueno();
    if (!d || d.respiro > 0) return;
    let rival = null, md = REGLAS.DISTANCIA_DUELO;
    for (const r of this.jugadores) {
      if (r.lado === d.lado || r.aturdido > 0 || r.respiro > 0 || r.esPortero) continue;
      const dd = Math.hypot(r.x - d.x, r.y - d.y);
      if (dd < md) { md = dd; rival = r; }
    }
    if (rival) this._empezarDuelo(d, rival);
  }
}
