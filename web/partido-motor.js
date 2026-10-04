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
    // fuera de juego: lo hay en los de 3DS (Aaron); se puede quitar al elegir (O-296)
    this.fueraDeJuego = opciones.fueraDeJuego !== false;
    // online: segundos para elegir en un duelo; luego va el comando seguro (O-299)
    this.limiteDuelo = opciones.limiteDuelo || 0;
    this.mitad = 1; this.reloj = 0; this.pasos = 0;
    this.goles = [0, 0];
    this.tension = [REGLAS.TENSION_INICIO, REGLAS.TENSION_INICIO];
    this.ultimoRobo = [-1e9, -1e9];   // cuando recupero el balon cada equipo (para "tras recuperar")
    // las tacticas de cada equipo (O-290): la activa y cuando vuelve a estar lista cada una
    this.tacticas = [equipoA.tacticas || [], equipoB.tacticas || []];
    this.tacticaActiva = [null, null];
    this.tacticaLista = [this.tacticas[0].map(() => 0), this.tacticas[1].map(() => 0)];
    this.nombres = [equipoA.nombre, equipoB.nombre];
    // el banquillo de cada equipo y los cambios que quedan (O-297)
    this.banquillos = [(equipoA.banquillo || []).slice(0, 5), (equipoB.banquillo || []).slice(0, 5)];
    this.banquilloUsado = [this.banquillos[0].map(() => false), this.banquillos[1].map(() => false)];
    this.cambiosQuedan = [REGLAS.CAMBIOS, REGLAS.CAMBIOS];
    this.cambios = [];            // [lado, sale, k] en orden, para el online
    this.jugadores = [];
    [equipoA, equipoB].forEach((eq, lado) => this._crearEquipo(eq, lado));
    this.balon = { x: 0, y: 0, vx: 0, vy: 0, dueno: null, ultimo: 0, pase: null };
    this.fase = "juego"; this.espera = 0;
    this.duelo = null;            // el duelo parado esperando las elecciones
    this.nDuelos = 0;             // cada duelo lleva su numero (para la pantalla)
    // la pausa de 3DS (O-294): quien la pidio, cuanto le queda y el pase que
    // cada uno deja marcado para cuando se siga
    this.pausasQuedan = [REGLAS.PAUSAS_POR_PARTE, REGLAS.PAUSAS_POR_PARTE];
    this.pausa = null;
    this.paseMarcado = [null, null];
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
      this.jugadores.push(this._montarJugador(d, lado, this.jugadores.length, u, v, d.puesto === 0 || p.posicion === "POR"));
    });
  }

  // un jugador listo para el partido (al empezar o al entrar del banquillo)
  _montarJugador(d, lado, id, u, v, esPortero) {
    const dir = lado === 0 ? 1 : -1;
    const j = {
      id, lado, dir, puesto: d.puesto, dorsal: d.dorsal,
      nombre: d.nombre, cara: d.cara, elemento: d.elemento, posicion: d.posicion,
      nivel: d.nivel || 99, stats: (d.stats || [0, 0, 0, 0, 0, 0, 0]).map(Number),
      // las de un espiritu (kenshin, mixi max, alma) van marcadas con una estrella (O-291)
      tecnicas: (d.tecnicas || []).filter(t => t.tipo && t.tipo !== "Hipertecnica" && t.poder > 0)
        .map(t => t.espiritu ? Object.assign({}, t, { nombre: t.nombre + " ✦" }) : t),
      // las pasivas con efecto en el partido (O-288): {que, pct, alcance, condicion, n}
      efectos: (d.pasivas || []).map(q => q.efecto).filter(e => e && e.que && e.que[0] !== "stat"),
      pasivas: (d.pasivas || []).map(q => ({ texto: q.texto, abierta: q.abierta, cuenta: !!q.efecto })),
      esPortero,
      u, v, x: 0, y: 0, mx: 0, my: dir,
      ruta: [], aturdido: 0, respiro: 0, conBalon: false,
    };
    if (j.esPortero) { j.kpMax = REGLAS.kpBase(j); j.kp = j.kpMax; }
    // su espiritu (kenshin, mixi max, alma): se invoca en el partido (O-295)
    const te = (d.tecnicas || []).find(t => t.espiritu);
    j.espiritu = te ? { nombre: te.espiritu.nombre, familia: te.espiritu.familia } : null;
    j.aura = 0; j.auraLista = 0;           // segundos de juego: hasta cuando dura / cuando se puede otra vez
    // lo que puede gastar en tecnicas: la tension de su equipo
    Object.defineProperty(j, "pt", { get: () => this.tension[lado], enumerable: false });
    return j;
  }

  // --- los cambios (O-297): en la pausa tecnica o en el descanso, hasta 3 ------
  puedeCambiar(lado) {
    return (this.fase === "pausa" || this.fase === "descanso") && this.cambiosQuedan[lado] > 0;
  }
  // entra el k del banquillo por el jugador `sale`: se queda en su sitio (y con
  // el balon si lo tenia); el que sale ya no vuelve
  cambiar(lado, sale, k, forzado) {
    const fuera = this.jugadores[sale], d = (this.banquillos[lado] || [])[k];
    if (!fuera || fuera.lado !== lado || !d || this.banquilloUsado[lado][k]) return false;
    if (!forzado && !this.puedeCambiar(lado)) return false;
    const j = this._montarJugador(d, lado, fuera.id, fuera.u, fuera.v, fuera.esPortero);
    // con el sentido de esta parte (en la segunda se cambia de campo)
    Object.assign(j, { dir: fuera.dir, x: fuera.x, y: fuera.y, mx: fuera.mx, my: fuera.my, conBalon: fuera.conBalon, puesto: fuera.puesto });
    this.jugadores[fuera.id] = j;
    this.banquilloUsado[lado][k] = true;
    this.cambiosQuedan[lado]--;
    this.cambios.push([lado, sale, k]);
    for (const o of this.jugadores) if (o.presiona === sale) o.presiona = undefined;
    // el invitado online los repite desde la foto: el registro ya le llega del anfitrion
    if (!forzado) this.apunta("Cambio en " + this.nombres[lado] + ": entra " + j.nombre + " por " + fuera.nombre, "tactica");
    return true;
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
    if (o.tipo === "tactica") return this.usarTactica(o.lado, o.k);
    if (o.tipo === "pausa") return this.pausar(o.lado);
    if (o.tipo === "seguir") return this.seguir(o.lado);
    if (o.tipo === "presionar") return this.presionar(o.lado, o.objetivo);
    if (o.tipo === "invocar") return this.invocar(o.jugador);
    if (o.tipo === "cambio") return this.cambiar(o.lado, o.sale, o.entra);
    const j = this.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (!j || this.fase === "final") return false;
    // una ruta vale tambien con el juego parado (online puede llegar justo al
    // empezar un duelo); pasar y chutar, solo con el balon en juego
    if (o.tipo === "ruta") {
      j.ruta = (o.puntos || []).slice(0, 40).map(p => this._dentro(p.x, p.y));
      j.presiona = null;
      return true;
    }
    if (this.fase === "pausa" && (o.tipo === "pase" || o.tipo === "pasePunto")) {
      // en la pausa el pase se marca y sale al seguir (3DS)
      const dl = this.dueno();
      if (!dl || dl.lado !== j.lado) return false;
      this.paseMarcado[j.lado] = Object.assign({}, o);
      return true;
    }
    if (this.fase !== "juego") return false;
    if (o.tipo === "pase") {
      const a = this.jugadores[o.a];
      if (!j.conBalon || !a || a.lado !== j.lado || a.id === j.id) return false;
      this._pasar(j, a, o.alto);
      return true;
    }
    if (o.tipo === "directo") {
      // rematar de primeras el pase que va de camino (DS: tocar la porteria
      // mientras va el pase; VR: tiro directo)
      if (!this.balon.pase || this.jugadores[this.balon.pase.de].lado !== j.lado) return false;
      this.balon.pase.directo = true;
      this.apunta("¡" + this.jugadores[this.balon.pase.a].nombre + " va a rematar de primeras!");
      return true;
    }
    if (o.tipo === "pasePunto") {
      // el pase al hueco: a un punto del campo; va a por el el companero mas cerca
      if (!j.conBalon) return false;
      const destino = this._dentro(o.x, o.y);
      const companeros = this.equipo(j.lado).filter(c => c.id !== j.id && !c.esPortero);
      const a = companeros.sort((p, q) => Math.hypot(p.x - destino.x, p.y - destino.y) - Math.hypot(q.x - destino.x, q.y - destino.y))[0];
      if (!a) return false;
      this._pasarA(j, a, destino, o.alto);
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

  _pasar(de, a, alto) {
    // al hueco: adonde estara el companero cuando llegue el balon
    const d = Math.hypot(a.x - de.x, a.y - de.y);
    const t = d / REGLAS.VEL_PASE;
    const destino = this._dentro(a.x + a.mx * REGLAS.velocidad(a) * t * 0.6, a.y + a.my * REGLAS.velocidad(a) * t * 0.6);
    this._pasarA(de, a, destino, alto);
  }

  _pasarA(de, a, destino, alto) {
    const dd = Math.hypot(destino.x - de.x, destino.y - de.y) || 1;
    const vel = alto ? REGLAS.VEL_PASE_ALTO : REGLAS.VEL_PASE;
    this.soltar();
    this.balon.x = de.x; this.balon.y = de.y;
    this.balon.vx = (destino.x - de.x) / dd * vel;
    this.balon.vy = (destino.y - de.y) / dd * vel;
    this.balon.pase = { de: de.id, a: a.id, destino, queda: dd, total: dd, alto: !!alto,
      fuera: this._enFueraDeJuego(a, de) };
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
      cadena: [{ clave: "nada", nombre: "No encadenar", tipo: "", poder: 0, tp: 0, puede: true }],
    }[que];
    const vistas = new Set();
    const tecs = j.tecnicas.filter(t => REGLAS.sirve(t, que) && (!t.espiritu || this.conAura(j)) && !vistas.has(t.nombre) && vistas.add(t.nombre)).map(t => {
      // las de 2, 3 o 4 jugadores: en VR vale cualquier companero, cerca o no
      // (Aaron); salen los mas cercanos (O-298)
      const n = Math.max(1, Number(t.jugadores) || 1), con = n > 1 ? this.companeros(j, n - 1) : [];
      const listos = con.length >= n - 1;
      return {
        clave: "t" + t.ranura, nombre: t.nombre + (que === "muro" && REGLAS.esContra(t) ? " (contra-tiro)" : ""),
        tipo: t.tipo, elemento: t.elemento, subtipo: t.subtipo,
        interno: t.interno, poder: Math.round(this._poder(j, t)), tp: t.tp, puede: t.tp <= j.pt && listos,
        nota: n === 1 ? undefined : listos ? "con " + con.map(c => c.nombre).join(" y ")
          : "de " + n + ": faltan compañeros",
      };
    });
    return tecs.concat(base);
  }

  // los n companeros mas cerca de j (los que hacen con el una supertecnica de varios)
  companeros(j, n) {
    return this.equipo(j.lado).filter(c => c !== j)
      .map(c => ({ c, d: Math.hypot(c.x - j.x, c.y - j.y) }))
      .sort((a, b) => a.d - b.d).slice(0, n).map(o => o.c);
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

  _empezarTiro(tirador, distancia, pasador, penalti) {
    const rivales = this.equipo(1 - tirador.lado);
    const portero = this.portero(1 - tirador.lado);
    const g = this.porteriaRival(tirador);
    // el muro: el defensa (no portero) mas cerca de la linea de tiro y por delante
    let muro = null, mejor = penalti ? -1 : 3.2;
    for (const r of rivales) {
      if (r.esPortero || r.aturdido > 0) continue;
      const e = this._distanciaALinea(r, tirador, g);
      if (e.delante && e.d < mejor) { mejor = e.d; muro = r; }
    }
    // la cadena: un companero en la linea de tiro, mas cerca de la porteria, con un tiro
    let cadena = null, mc = penalti ? -1 : 3.2;
    for (const c of this.equipo(tirador.lado)) {
      if (c === tirador || c.esPortero || c.aturdido > 0 || !c.tecnicas.some(t => REGLAS.sirve(t, "cadena"))) continue;
      const e = this._distanciaALinea(c, tirador, g);
      if (e.delante && e.d < mc) { mc = e.d; cadena = c; }
    }
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "tiro", tirador: tirador.id, portero: portero.id, muro: muro ? muro.id : null, distancia,
      cadena: cadena ? cadena.id : null, directo: pasador ? pasador.id : null, penalti: !!penalti,
      lados: {
        [tirador.lado]: { rol: "tiro", jugador: tirador.id, opciones: this._opciones(tirador, "tiro"),
          cadena: cadena ? { jugador: cadena.id, opciones: this._opciones(cadena, "cadena") } : null },
        [1 - tirador.lado]: { rol: "porteria", jugador: portero.id, opciones: this._opciones(portero, "parada"),
          muro: muro ? { jugador: muro.id, opciones: this._opciones(muro, "muro") } : null },
      },
      elecciones: {},
    };
    this.apunta(tirador.nombre + (pasador ? " remata de primeras" : " chuta") + " a " + Math.round(distancia) + " m", "tiro");
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

  // lo que se juega si se acaba el tiempo: el comando seguro, sin tecnicas
  eleccionSegura(pend) {
    if (pend.rol === "tiro") return pend.cadena ? { tiro: "normal", cadena: "nada" } : { tiro: "normal" };
    if (pend.rol === "porteria") return pend.muro ? { parada: "normal", muro: "normal" } : { parada: "normal" };
    return "normal";
  }

  // eleccion: en un foco, la clave; en un tiro, {tiro} o {parada, muro}
  elegir(lado, eleccion) {
    if (this.fase !== "duelo" || !this.duelo || !this.duelo.lados[lado]) return false;
    if (this.duelo.elecciones[lado] !== undefined) return false;
    this.duelo.elecciones[lado] = eleccion;
    if (Object.keys(this.duelo.lados).every(l => this.duelo.elecciones[l] !== undefined)) this._resolver();
    return true;
  }

  // --- fuera de juego (O-296) ------------------------------------------------------
  // la linea, medida hacia donde ataca `lado`: la del penultimo rival
  lineaFueraDeJuego(lado) {
    const dir = this.equipo(lado)[0].dir;
    const fondos = this.equipo(1 - lado).map(r => r.y * dir).sort((a, b) => b - a);
    return Math.max(0, fondos[1] !== undefined ? fondos[1] : 0);
  }
  _enFueraDeJuego(receptor, pasador) {
    if (!this.fueraDeJuego || !receptor || receptor === pasador) return false;
    const dir = receptor.dir, y = receptor.y * dir;
    return y > 0 && y > pasador.y * dir + 0.5 && y > this.lineaFueraDeJuego(receptor.lado) + 0.5;
  }
  _pitarFueraDeJuego(j) {
    const r = this.equipo(1 - j.lado).filter(o => !o.esPortero)
      .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y))[0];
    this.apunta("Fuera de juego de " + j.nombre, "mal");
    r.x = j.x; r.y = j.y - j.dir * 1;
    this.coger(r); r.respiro = 2.5;
    for (const o of this.jugadores) o.ruta = [];
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "fuera", quien: j.id };
    this.fase = "resultado"; this.espera = 1.6;
  }

  // --- la pausa y presionar de 3DS (O-294) ---------------------------------------
  pausar(lado) {
    if (this.fase !== "juego" || this.pausasQuedan[lado] <= 0) return false;
    this.pausasQuedan[lado]--;
    this.pausa = { lado, queda: REGLAS.PAUSA_MAX };
    this.fase = "pausa";
    this.apunta("Pausa de " + this.nombres[lado] + ": rutas y pase", "tactica");
    return true;
  }
  seguir(lado) {
    if (this.fase !== "pausa" || !this.pausa || (lado !== undefined && lado !== this.pausa.lado)) return false;
    this.fase = "juego"; this.pausa = null;
    // los pases marcados en la pausa salen ahora
    for (const l of [0, 1]) {
      const o = this.paseMarcado[l];
      this.paseMarcado[l] = null;
      if (o) this.ordenar(o);
    }
    return true;
  }
  // tocar al rival con balon: los dos tuyos mas cerca van a por el (3DS)
  presionar(lado, objetivo) {
    const r = this.jugadores[objetivo], d = this.dueno();
    if (!r || !d || d !== r || r.lado === lado) return false;
    const mios = this.equipo(lado).filter(j => !j.esPortero && j.aturdido <= 0)
      .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y)).slice(0, 2);
    for (const j of mios) { j.presiona = r.id; j.ruta = []; }
    return mios.length > 0;
  }

  // --- espiritus (O-295) ---------------------------------------------------------
  conAura(j) { return j.aura > this.segundosDeJuego(); }
  invocar(id) {
    const j = this.jugadores[id], ahora = this.segundosDeJuego();
    if (!j || !j.espiritu || this.fase !== "juego" || this.conAura(j) || ahora < j.auraLista) return false;
    if (this.tension[j.lado] < REGLAS.INVOCAR_COSTE) return false;
    this.tension[j.lado] -= REGLAS.INVOCAR_COSTE;
    j.aura = ahora + REGLAS.AURA_SEGUNDOS;
    j.auraLista = ahora + REGLAS.AURA_SEGUNDOS + REGLAS.AURA_RECARGA;
    this.apunta("¡" + j.nombre + " invoca a " + j.espiritu.nombre + "!", "tactica");
    return true;
  }

  // --- tacticas (O-290) ---------------------------------------------------------
  usarTactica(lado, k) {
    const t = (this.tacticas[lado] || [])[k];
    if (!t || this.fase !== "juego" || this.tacticaActiva[lado]) return false;
    const ahora = this.segundosDeJuego();
    if (ahora < this.tacticaLista[lado][k]) return false;
    this.tacticaActiva[lado] = { k, hasta: ahora + (t.duracion || 8) };
    this.tacticaLista[lado][k] = ahora + (t.recarga || 90);
    this.apunta("¡Tactica de " + this.nombres[lado] + ": " + t.nombre + "!", "tactica");
    for (const e of t.efectos || []) {
      if (e.especial === "robo") {
        const d = this.dueno();
        if (d && d.lado !== lado) {
          const mio = this.equipo(lado).filter(j => !j.esPortero).sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
          d.aturdido = REGLAS.ATURDIDO;
          this.coger(mio); mio.x = d.x + 1; mio.y = d.y;
          this.ultimoRobo[lado] = ahora;
          this.apunta("¡" + mio.nombre + " le quita el balon a " + d.nombre + "!", "bien");
        }
      }
      if (e.especial === "aturde") {
        for (const r of this.equipo(1 - lado)) if (!r.esPortero && Math.hypot(r.x - this.balon.x, r.y - this.balon.y) < 10) r.aturdido = 2.5;
      }
      if (e.especial === "drena") this.tension[1 - lado] = Math.max(0, this.tension[1 - lado] * (1 - (e.pct || 20) / 100));
    }
    return true;
  }
  _especial(lado, cual) {
    const a = this.tacticaActiva[lado];
    return !!a && (this.tacticas[lado][a.k].efectos || []).some(e => e.especial === cual);
  }
  // los efectos con % de las tacticas activas que tocan a j: los de su equipo y
  // los que el rival le baja
  _efectosTactica(j) {
    const fuera = [];
    for (const lado of [0, 1]) {
      const a = this.tacticaActiva[lado];
      if (!a) continue;
      for (const e of this.tacticas[lado][a.k].efectos || []) {
        if (!e.que) continue;
        if ((e.objetivo === "rival") !== (lado !== j.lado)) continue;
        if (!this._cumpleTactica(e, j, lado)) continue;
        fuera.push(e);
      }
    }
    return fuera;
  }
  _cumpleTactica(e, j, dueno) {
    // el campo, visto desde el equipo que usa la tactica
    const enSuCampo = j.y * this.jugadores.find(q => q.lado === dueno).dir <= 0;
    switch (e.condicion) {
      case null: case undefined: return true;
      case "campo_propio": return enSuCampo;
      case "campo_contrario": return !enSuCampo;
      case "tension": return this.tension[dueno] / REGLAS.TENSION_MAX * 100 >= (e.n || 0);
      case "tension_menor": return this.tension[dueno] / REGLAS.TENSION_MAX * 100 < (e.n || 0);
      case "tras_robo": return this.segundosDeJuego() - this.ultimoRobo[dueno] < (e.n || 0);
      default: return false;
    }
  }
  _poder(j, t) {
    let p = REGLAS.poderTecnica(j, t);
    if (!t) return p;
    let pct = 0;
    for (const e of this._efectosTactica(j)) {
      if (e.que.includes("poder") || (e.que.includes("poder_tiro") && t.tipo === "Tiro") || (e.que.includes("poder_regate") && t.tipo === "Regate")) pct += e.pct;
    }
    return p * (1 + pct / 100);
  }
  _mulVel(j) {
    let pct = 0;
    for (const e of this._efectosTactica(j)) {
      if (e.que.includes("velocidad") || (e.que.includes("vel_regate") && j.conBalon)) pct += e.pct;
    }
    return Math.max(0.4, 1 + pct / 100);
  }

  // --- pasivas (O-288) --------------------------------------------------------
  // El % que suman las pasivas de su equipo a un valor de duelo de `j`:
  // valor = "tiro" | "foco" | "disputa" | "muro" | "kp"; ataca = si es su AT.
  segundosDeJuego() { return (this.mitad - 1) * this.duracion + this.reloj; }
  _cumple(e, h, j) {
    const ax = REGLAS.ANCHO / 2, ay = REGLAS.LARGO / 2;
    switch (e.condicion) {
      case null: case undefined: return true;
      case "campo_contrario": return j.y * j.dir > 0;
      case "campo_propio": return j.y * j.dir <= 0;
      case "fuera_area": return !(Math.abs(j.y) > ay - REGLAS.AREA_Y && Math.abs(j.x) < REGLAS.AREA_X);
      case "mitad1": return this.mitad === 1;
      case "mitad2": return this.mitad === 2;
      case "cerca_mismo": return this.equipo(j.lado).some(o => o !== j && o.elemento === j.elemento && Math.hypot(o.x - j.x, o.y - j.y) < 12);
      case "cerca_otro": return this.equipo(j.lado).some(o => o !== j && o.elemento !== j.elemento && Math.hypot(o.x - j.x, o.y - j.y) < 12);
      case "tension": return this.tension[j.lado] / REGLAS.TENSION_MAX * 100 >= (e.n || 0);
      case "tras_robo": return this.segundosDeJuego() - this.ultimoRobo[j.lado] < (e.n || 0);
      case "no_gana": return this.goles[j.lado] <= this.goles[1 - j.lado];
      default: return false;
    }
  }
  _alcanza(e, h, j) {
    switch (e.alcance) {
      case "propio": return h === j;
      case "mismo_elemento": return h.elemento === j.elemento;
      case "otro_elemento": return h.elemento !== j.elemento;
      case "misma_posicion": return h.posicion === j.posicion;
      case "otra_posicion": return h.posicion !== j.posicion;
      case "cercanos": return Math.hypot(h.x - j.x, h.y - j.y) < 12;
      case "medios": return j.posicion === "MED" || j.posicion === "MC";
      default: return true;               // del equipo
    }
  }
  bonusPasivas(j, valor, ataca) {
    // se suma por tipo de efecto y cada tipo se corta en su tope de equipo (O-292)
    const porTipo = {}, topes = {};
    for (const h of this.equipo(j.lado)) for (const e of h.efectos || []) {
      const vale = e.que.includes(valor) || (ataca && e.que.includes("at") && valor !== "kp" && valor !== "muro")
        || (!ataca && e.que.includes("df") && valor !== "tiro");
      if (!(vale && this._alcanza(e, h, j) && this._cumple(e, h, j))) continue;
      const t = e.tipo || "?";
      porTipo[t] = (porTipo[t] || 0) + e.pct;
      if (e.tope) topes[t] = e.tope;
    }
    let pct = 0;
    for (const t in porTipo) pct += topes[t] ? Math.min(porTipo[t], topes[t]) : porTipo[t];
    if (this.conAura(j)) pct += REGLAS.AURA_BONUS;
    for (const e of this._efectosTactica(j)) {
      const vale = e.que.includes(valor) || (ataca && e.que.includes("at") && valor !== "kp" && valor !== "muro")
        || (!ataca && e.que.includes("df") && valor !== "tiro");
      if (vale) pct += e.pct;
    }
    return 1 + Math.min(pct, REGLAS.PASIVAS_TOPE) / 100;
  }
  _gananciaTension(lado, base) {
    let pct = 0;
    for (const h of this.equipo(lado)) for (const e of h.efectos || []) if (e.que.includes("tension_gana")) pct += e.pct;
    const a = this.tacticaActiva[lado];
    if (a) for (const e of this.tacticas[lado][a.k].efectos || []) if (e.que && e.que.includes("tension_gana") && e.objetivo !== "rival") pct += e.pct;
    return base * (1 + pct / 100);
  }

  // los apoyos de un duelo (DS/3DS): companeros cerca del que pelea
  apoyos(j) {
    const cerca = this.equipo(j.lado).filter(o => o !== j && !o.esPortero && o.aturdido <= 0 &&
      Math.hypot(o.x - j.x, o.y - j.y) < REGLAS.APOYO_RADIO)
      .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y)).slice(0, REGLAS.APOYOS_MAX);
    let f = 1;
    for (const o of cerca) f += REGLAS.APOYO + (o.elemento && o.elemento === j.elemento ? REGLAS.APOYO_ELEMENTO : 0);
    return { n: cerca.length, mismos: cerca.filter(o => o.elemento === j.elemento).length, factor: f };
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
    const apA = this.apoyos(att), apD = this.apoyos(def);
    const pa = this.bonusPasivas(att, cd === "cargar" ? "disputa" : "foco", cd !== "cargar");
    const pd = this.bonusPasivas(def, cd === "cargar" ? "disputa" : "foco", cd === "cargar");
    if (cd === "cargar") {
      // disputa: el que carga usa su AT de disputa contra la DF de disputa del que lleva el balon
      a = (REGLAS.dfDisputa(att) + this._poder(att, ta)) * REGLAS.efectoElemental(att, ta, def) * this.bonusPasivas(att, "disputa", false);
      d = REGLAS.atDisputa(def) * REGLAS.efectoElemental(def, null, att) * this.bonusPasivas(def, "disputa", true);
      como = "disputa";
    } else {
      a = (REGLAS.atFoco(att) + this._poder(att, ta)) * REGLAS.efectoElemental(att, ta, def) * this.bonusPasivas(att, "foco", true);
      d = (REGLAS.dfFoco(def) + this._poder(def, td)) * REGLAS.efectoElemental(def, td, att) * this.bonusPasivas(def, "foco", false);
      como = "foco";
    }
    a *= apA.factor; d *= apD.factor;
    // el comando potente: +35 % pero inestable (DS); luego, como en IE3,
    // gana con probabilidad A^3 / (A^3 + D^3)
    if (ca === "potente") a *= 0.55 + this.azar() * 0.9 + 0.2;
    if (cd === "potente") d *= 0.55 + this.azar() * 0.9 + 0.2;
    const ra = Math.round(a), rd = Math.round(d);
    const gana = this.azar() < REGLAS.probabilidad(ra, rd) ? att : def, pierde = gana === att ? def : att;
    pierde.aturdido = REGLAS.ATURDIDO; pierde.ruta = [];
    gana.respiro = REGLAS.RESPIRO_DUELO; pierde.respiro = REGLAS.RESPIRO_DUELO;
    // falta (3DS): el que entra fuerte o carga y gana puede hacer falta
    let riesgo = gana === def ? (cd === "potente" ? REGLAS.FALTA_ENTRADA : cd === "cargar" ? REGLAS.FALTA_CARGA : 0) : 0;
    // en su area el defensa se la juega menos (si no, salian demasiados penaltis)
    const gA = this.porteriaRival(att);
    if (Math.abs(att.y - gA.y) < REGLAS.AREA_Y && Math.abs(att.x) < REGLAS.AREA_X) riesgo *= 0.4;
    if (riesgo && this.azar() < riesgo) return this._falta(att, def, ra, rd, ta, td, ca, cd);
    if (gana === def) { this.coger(def); this.ultimoRobo[def.lado] = this.segundosDeJuego(); }
    // la tension: +60 al que gana y +30 al que pierde, salvo si gano con tecnica
    const tecGana = gana === att ? ta : td, tecPierde = gana === att ? td : ta;
    if (!tecGana) this._tension(gana.lado, this._gananciaTension(gana.lado, REGLAS.TENSION_GANA));
    if (!tecPierde) this._tension(pierde.lado, REGLAS.TENSION_PIERDE);
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = {
      tipo: como, ganador: gana.id, valores: { [att.lado]: ra, [def.lado]: rd },
      tecnicas: { [att.lado]: ta ? ta.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      atacante: att.id, defensor: def.id,
      elementos: { [att.lado]: ta ? ta.elemento || "" : null, [def.lado]: td ? td.elemento || "" : null },
      pasivas: { [att.lado]: Math.round((pa - 1) * 1000) / 10, [def.lado]: Math.round((pd - 1) * 1000) / 10 },
      apoyos: { [att.lado]: apA, [def.lado]: apD },
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
    let at = (REGLAS.atTiro(tir) + this._poder(tir, tt)) * REGLAS.porDistancia(du.distancia, larga) * this.bonusPasivas(tir, "tiro", true);
    // tiro directo: suma el 50 % del AT de tiro del que paso (VR)
    if (du.directo !== null && du.directo !== undefined) at += REGLAS.atTiro(this.jugadores[du.directo]) * REGLAS.DIRECTO;
    const pasos = [{ quien: tir.id, que: tt ? tt.nombre : (du.directo !== null && du.directo !== undefined ? "Tiro directo" : "Tiro"), valor: Math.round(at), tecnica: !!tt,
      elemento: tt ? tt.elemento || "" : "", pasivas: Math.round((this.bonusPasivas(tir, "tiro", true) - 1) * 1000) / 10 }];
    // la cadena: el companero remata y los AT se suman (VR); el gol es suyo
    let ultimo = tir, tecUltima = tt;
    const ch = du.cadena !== null && du.cadena !== undefined ? this.jugadores[du.cadena] : null;
    if (ch && et && et.cadena && et.cadena !== "nada") {
      let tc = this._tecnica(ch, et.cadena);
      if (tc && tc.tp > ch.pt) tc = null;
      if (tc) {
        this._gastar(ch, tc);
        const g = this.porteriaRival(ch);
        const suma = (REGLAS.atTiro(ch) + this._poder(ch, tc)) * REGLAS.porDistancia(Math.hypot(g.x - ch.x, g.y - ch.y), false) * this.bonusPasivas(ch, "tiro", true);
        at += suma;
        pasos.push({ quien: ch.id, que: tc.nombre + " (cadena)", valor: Math.round(at), tecnica: true, elemento: tc.elemento || "" });
        ultimo = ch; tecUltima = tc;
      }
    }
    // el muro: le resta su DF al tiro (VR); si lo deja en nada, lo para
    if (muro && ed.muro && ed.muro !== "nada") {
      let tm = this._tecnica(muro, ed.muro);
      if (tm && tm.tp > muro.pt) tm = null;
      this._gastar(muro, tm);
      // un contra-tiro frena con la mitad de su tiro (VR); un bloqueo, con su DF del muro
      const base = tm && REGLAS.esContra(tm) ? (REGLAS.atTiro(muro) + this._poder(muro, tm)) * 0.5
                                             : REGLAS.dfMuro(muro) + this._poder(muro, tm);
      const df = this._tirada(base * (tm && REGLAS.gana(tm.elemento, ultimo.elemento) ? 1.2 : 1) * this.bonusPasivas(muro, "muro", false));
      pasos.push({ quien: muro.id, que: tm ? tm.nombre : "Bloqueo", valor: Math.round(df), tecnica: !!tm, elemento: tm ? tm.elemento || "" : "" });
      const r = df / Math.max(1, at);
      if (r > 0.75) at *= 0.7;
      if (r >= 1.25) {
        this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "tiro", final: "bloqueado", pasos, tirador: tir.id };
        this.apunta("¡" + muro.nombre + " bloquea el tiro!", "mal");
        this.soltar();
        this.balon.x = muro.x; this.balon.y = muro.y;
        this.balon.vx = (this.azar() - 0.5) * 8; this.balon.vy = -tir.dir * 6;
        this.balon.ultimo = muro.lado;
        return this._acabarDuelo(2.0);
      }
    }
    at *= REGLAS.efectoElemental(ultimo, tecUltima, por);
    let tp = this._tecnica(por, ed.parada);
    if (tp && tp.tp > por.pt) tp = null;
    this._gastar(por, tp);
    const dfTec = this._poder(por, tp) * (tp && REGLAS.gana(tp.elemento, tir.elemento) ? 1.2 : 1);
    const df = (por.kp + dfTec) * this.bonusPasivas(por, "kp", false);
    pasos.push({ quien: por.id, que: tp ? tp.nombre : "Parada", valor: Math.round(df), tecnica: !!tp, elemento: tp ? tp.elemento || "" : "",
      pasivas: Math.round((this.bonusPasivas(por, "kp", false) - 1) * 1000) / 10 });
    pasos[0].valorFinal = Math.round(at);
    if (this.azar() < REGLAS.probabilidadTiro(at, df)) {
      this.goles[tir.lado]++;
      this.nResultado = (this.nResultado || 0) + 1;
      this.resultado = { tipo: "tiro", final: "gol", pasos, tirador: ultimo.id };
      this.apunta("¡¡GOL de " + ultimo.nombre + "!! (" + Math.round(at) + " contra " + Math.round(df) + ")", "gol");
      this.fase = "gol"; this.espera = 3.0; this.duelo = null;
      this._sacaDespues = 1 - tir.lado;
      return;
    }
    // parada: el portero se desgasta en proporcion al golpe (VR, desde 4.0.1)
    por.kp = Math.max(por.kpMax * 0.25, por.kp * (1 - REGLAS.DESGASTE * Math.min(0.85, at / df)));
    const despeje = tp && /despej|pu.o/i.test(tp.subtipo || "");
    this.nResultado = (this.nResultado || 0) + 1;
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

  // la falta: tiro libre con la barrera a 9 m, o penalti si fue en el area
  _falta(att, def, ra, rd, ta, td, ca, cd) {
    const g = this.porteriaRival(att);
    const enArea = Math.abs(att.y - g.y) < REGLAS.AREA_Y && Math.abs(att.x) < REGLAS.AREA_X;
    att.aturdido = 0; def.aturdido = REGLAS.ATURDIDO;
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = {
      tipo: "falta", penalti: enArea, ganador: att.id, atacante: att.id, defensor: def.id,
      valores: { [att.lado]: ra, [def.lado]: rd },
      tecnicas: { [att.lado]: ta ? ta.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      elementos: { [att.lado]: null, [def.lado]: null }, pasivas: {},
    };
    this.apunta("¡Falta de " + def.nombre + " sobre " + att.nombre + "!" + (enArea ? " ¡PENALTI!" : " Tiro libre."), "mal");
    for (const j of this.jugadores) j.ruta = [];
    if (enArea) {
      // penalti: el que la recibe tira desde el punto; el resto, fuera del area
      att.x = 0; att.y = g.y - att.dir * 11;
      const por = this.portero(1 - att.lado); por.x = 0; por.y = g.y - att.dir * 0.8;
      for (const j of this.jugadores) {
        if (j === att || j === por) continue;
        if (Math.abs(j.y - g.y) < REGLAS.AREA_Y + 1) j.y = g.y - att.dir * (REGLAS.AREA_Y + 2 + Math.abs(j.x) * 0.05);
      }
      this.coger(att);
      this.duelo = null;
      this._penalti = att.id;
      this.fase = "resultado"; this.espera = 2.0;
      return;
    }
    // tiro libre: el balon para el que la recibio y los rivales a 9 m
    this.coger(att);
    att.respiro = 2.5;
    for (const r of this.equipo(def.lado)) {
      const dd = Math.hypot(r.x - att.x, r.y - att.y);
      if (dd < REGLAS.DISTANCIA_BARRERA && !r.esPortero) {
        const k = (REGLAS.DISTANCIA_BARRERA + 0.5) / (dd || 1);
        const c = this._dentro(att.x + (r.x - att.x) * k, att.y + (r.y - att.y) * k);
        r.x = c.x; r.y = c.y;
      }
    }
    this._acabarDuelo(1.8);
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
    if (this.fase === "duelo") {                       // parado hasta que elijan
      if (this.limiteDuelo && this.duelo) {
        this.duelo.reloj = (this.duelo.reloj || 0) + P;
        if (this.duelo.reloj >= this.limiteDuelo) {
          for (const [l, pend] of Object.entries(this.pendientes())) this.elegir(Number(l), this.eleccionSegura(pend));
        }
      }
      return;
    }
    if (this.fase === "pausa") {
      if (this.pausa) { this.pausa.queda -= P; if (this.pausa.queda <= 0) this.seguir(); }
      return;
    }
    if (this.fase === "resultado" || this.fase === "gol" || this.fase === "descanso") {
      this.espera -= P;
      if (this.espera > 0) return;
      if (this.fase === "gol") { this.saque(this._sacaDespues); return; }
      if (this._penalti !== undefined && this._penalti !== null) {
        const t = this.jugadores[this._penalti]; this._penalti = null;
        this.fase = "juego";
        return this._empezarTiro(t, 11, null, true);
      }
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

    for (const l of [0, 1]) {
      this._tension(l, REGLAS.TENSION_POR_SEGUNDO * P);
      const a = this.tacticaActiva[l];
      if (a && this.segundosDeJuego() >= a.hasta) this.tacticaActiva[l] = null;
    }
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
    this.pausasQuedan = [REGLAS.PAUSAS_POR_PARTE, REGLAS.PAUSAS_POR_PARTE];
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
    if (j.presiona !== null && j.presiona !== undefined) {
      if (d && d.id === j.presiona) return { x: d.x, y: d.y, apreton: true };
      j.presiona = null;
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
    if (this.fueraDeJuego && tenemos) {
      const linea = this.lineaFueraDeJuego(j.lado) - 1, bal = b.y * j.dir;
      const vMax = Math.max(linea, bal) / (REGLAS.LARGO / 2);
      if (v > vMax) v = vMax;
    }
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
      const v = Math.min(d, REGLAS.velocidad(j) * this._mulVel(j) * lento * P);
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
      if (b.pase && j.lado !== this.jugadores[b.pase.de].lado && this._especial(this.jugadores[b.pase.de].lado, "sin_intercepcion")) continue;
      if (b.pase && b.pase.alto && b.pase.queda > REGLAS.PASE_ALTO_BAJA) continue;
      const dd = Math.hypot(j.x - b.x, j.y - b.y);
      const radio = b.pase && j.lado !== this.jugadores[b.pase.de].lado ? 1.0 : md;
      if (dd < radio && (!mejor || dd < mejor.d)) mejor = { j, d: dd };
    }
    if (mejor) {
      const j = mejor.j;
      if (b.pase && b.pase.fuera && j.id === b.pase.a) return this._pitarFueraDeJuego(j);
      const directo = b.pase && b.pase.directo && j.lado === this.jugadores[b.pase.de].lado ? this.jugadores[b.pase.de] : null;
      if (b.pase && j.lado !== this.jugadores[b.pase.de].lado) {
        this.apunta("¡" + j.nombre + " corta el pase!", "mal");
        this.ultimoRobo[j.lado] = this.segundosDeJuego();
      }
      this.coger(j);
      if (directo) {
        const g = this.porteriaRival(j), dg = Math.hypot(g.x - j.x, g.y - j.y);
        if (dg <= REGLAS.DISTANCIA_TIRO) this._empezarTiro(j, dg, directo);
      }
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

  // --- online: la foto del partido que el anfitrion manda al invitado --------
  // Solo lo que cambia (posiciones, balon, fase, duelo...); los datos fijos de
  // los jugadores ya los tienen los dos desde el principio.
  foto(ladoRutas = 1) {
    const r1 = v => Math.round(v * 10) / 10;
    return {
      n: this.pasos, f: this.fase, m: this.mitad, r: r1(this.reloj), g: this.goles.slice(),
      t: this.tension.map(Math.round), e: this.espera, ta: this.tacticaActiva, tl: this.tacticaLista,
      pz: this.pausa, pq: this.pausasQuedan, pm: this.paseMarcado,
      j: this.jugadores.map(j => [r1(j.x), r1(j.y), j.dir, j.conBalon ? 1 : 0, j.aturdido > 0 ? 1 : 0,
        j.esPortero ? Math.round(j.kp) : 0, j.lado === ladoRutas ? j.ruta.slice(0, 6).map(p => [r1(p.x), r1(p.y)]) : [],
        r1(j.aura), r1(j.auraLista)]),
      b: [r1(this.balon.x), r1(this.balon.y), this.balon.dueno, this.balon.pase ? [this.balon.pase.a, r1(this.balon.pase.destino.x), r1(this.balon.pase.destino.y),
        this.balon.pase.alto ? 1 : 0, r1(this.balon.pase.total || 0)] : 0],
      d: this.duelo ? JSON.parse(JSON.stringify(this.duelo)) : null,
      re: this.resultado ? Object.assign({ k: this.nResultado || 0 }, this.resultado) : null,
      cb: this.cambios,
      ev: this.eventos.length, ul: this.eventos.slice(-10),
    };
  }

  aplicarFoto(f) {
    if (f.n < this.pasos) return false;              // una foto vieja
    this.pasos = f.n; this.fase = f.f; this.mitad = f.m; this.reloj = f.r; this.goles = f.g;
    this.tension = f.t; this.espera = f.e;
    for (const c of (f.cb || []).slice(this.cambios.length)) this.cambiar(c[0], c[1], c[2], true);
    if (f.ta) { this.tacticaActiva = f.ta; this.tacticaLista = f.tl; }
    if (f.pq) { this.pausa = f.pz; this.pausasQuedan = f.pq; this.paseMarcado = f.pm; }
    f.j.forEach((q, k) => {
      const j = this.jugadores[k];
      j.destX = q[0]; j.destY = q[1];
      if (j.x === 0 && j.y === 0 || Math.hypot(q[0] - j.x, q[1] - j.y) > 12) { j.x = q[0]; j.y = q[1]; }
      j.dir = q[2]; j.conBalon = !!q[3]; j.aturdido = q[4] ? 1 : 0;
      if (j.esPortero) j.kp = q[5];
      j.ruta = q[6].map(p => ({ x: p[0], y: p[1] }));
      if (q.length > 7) { j.aura = q[7]; j.auraLista = q[8]; }
    });
    this.balon.destX = f.b[0]; this.balon.destY = f.b[1]; this.balon.dueno = f.b[2];
    this.balon.pase = f.b[3] ? { a: f.b[3][0], destino: { x: f.b[3][1], y: f.b[3][2] }, alto: !!f.b[3][3], total: f.b[3][4] || 0 } : null;
    this.duelo = f.d;
    if (f.re && (!this.resultado || this.resultado.k !== f.re.k)) this.resultado = f.re;
    // los sucesos que faltan (la foto trae los diez ultimos)
    const primero = f.ev - f.ul.length;
    for (let k = Math.max(this.eventos.length, primero); k < f.ev; k++) this.eventos[k] = f.ul[k - primero];
    return true;
  }

  // el invitado acerca lo pintado a la ultima foto poco a poco (se ve suave)
  suavizar(dt) {
    const a = Math.min(1, dt * 12);
    for (const j of this.jugadores) if (j.destX !== undefined) { j.x += (j.destX - j.x) * a; j.y += (j.destY - j.y) * a; }
    const b = this.balon;
    if (b.destX !== undefined) { b.x += (b.destX - b.x) * Math.min(1, dt * 18); b.y += (b.destY - b.y) * Math.min(1, dt * 18); }
  }

  _mirarDuelos() {
    const d = this.dueno();
    if (!d || d.respiro > 0 || this._especial(d.lado, "ignora_foco")) return;
    let rival = null, md = REGLAS.DISTANCIA_DUELO;
    for (const r of this.jugadores) {
      if (r.lado === d.lado || r.aturdido > 0 || r.respiro > 0 || r.esPortero) continue;
      const dd = Math.hypot(r.x - d.x, r.y - d.y);
      if (dd < md) { md = dd; rival = r; }
    }
    if (rival) this._empezarDuelo(d, rival);
  }
}
