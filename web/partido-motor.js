/* El motor del partido (NOTAS O-286): la simulacion, sin pantalla ni raton.
   Avanza a pasos fijos (REGLAS.PASO) y solo cambia por ordenes (dibujar una
   ruta, pasar, chutar, elegir en un duelo). Con la misma semilla y las mismas
   ordenes en el mismo paso, da lo mismo en cualquier PC: asi se jugara online.

   Como en los Inazuma de DS: los jugadores sin ordenes se colocan solos, y
   cuando un rival se cruza con el que lleva el balon el partido se para y
   cada lado elige que hace (regatear, entrar, cargar o una supertecnica). Al
   chutar se para igual: el que chuta elige tiro, y el que defiende el muro y
   la parada. Con la opcion `vuelo` (la pagina), como en Galaxy: el que chuta
   elige y el balon viaja; el muro, la cadena y el portero eligen al llegarles
   (O-325). Los numeros son los de Victory Road (partido-reglas.js). */
"use strict";

class Partido {
  constructor(equipoA, equipoB, opciones = {}) {
    this.R = REGLAS;
    this.azar = Azar(opciones.semilla || 20261004);
    // partes de 15 o 30 minutos de reloj de 3DS (O-308): 15 -> 75 s reales, 30 ->
    // 150 s. `mitad` (s reales) queda para las pruebas
    const minutos = REGLAS.PARTES_MINUTOS.includes(Number(opciones.minutos)) ? Number(opciones.minutos) : 15;
    this.duracion = opciones.mitad || minutos * 60 / REGLAS.RELOJ_RITMO;
    this.minutosParte = this.duracion * REGLAS.RELOJ_RITMO / 60;
    // esperas antes de cada saque ([Jugar] y [Menu], O-308). Sin la opcion (las
    // pruebas viejas y las medidas) se saca en el acto, como antes; la pagina la pone
    this.esperas = !!opciones.esperas;
    this.prolonga = false;        // la parte ha pasado de las 15:00 y sigue hasta que se pare el balon (O-308)
    // si hay empate al final: "nada", "prorroga", "penaltis" o "prorroga-penaltis"
    // (Aaron, O-307 punto 8). `prorroga`: ya se juega (un cambio mas). `tanda`: la de
    // penaltis, si la hay: {orden, tiros, empieza, gana} (O-312)
    this.empate = REGLAS.EMPATE.includes(opciones.empate) ? opciones.empate : "nada";
    this.prorroga = false;
    this.tanda = null;
    // lados que lleva una persona: su jugador con balon no corre solo (como en DS)
    this.manual = opciones.manual || [false, false];
    // fuera de juego: lo hay en los de 3DS (Aaron); se puede quitar al elegir (O-296)
    this.fueraDeJuego = opciones.fueraDeJuego !== false;
    // online: segundos para elegir en un duelo; luego va el comando seguro (O-299)
    this.limiteDuelo = opciones.limiteDuelo || 0;
    // las animaciones de Galaxy (O-319): "completas", "cortas" o false (por defecto: todo
    // como antes). Con ellas las esperas de cada resultado duran lo que su animacion
    // (_retener). _edadDuelo: los s que lleva abierto el duelo _edadId (fuera de
    // this.duelo, que viaja entero en la foto: con un contador dentro iria una foto por
    // paso mientras se elige)
    this.animaciones = REGLAS.modoAnim ? REGLAS.modoAnim(opciones.animaciones) : false;
    this._edadDuelo = 0; this._edadId = null;
    // el tiro que viaja (O-325; Aaron, O-322 punto 3): el que chuta elige y chuta, y el
    // balon va de verdad hacia la porteria (this.tiro); el muro, la cadena y el portero
    // eligen al llegarles. Sin la opcion (las pruebas viejas y las medidas), el tiro de
    // antes: todos eligen a la vez y se resuelve de golpe. La pagina la pone
    this.vuelo = !!opciones.vuelo;
    this.tiro = null;
    // el TIEMPO DE INVOCACION (O-327; Aaron, O-322 punto 5): el boton de los espiritus para
    // el juego para elegir, como en Galaxy y CS, y en esa parada invocan los dos (uno cada
    // uno). Con balon en juego ya no se invoca sin parar. `tiempoInvocar`: la parada de
    // ahora ({lado que la pidio, hechos: [id o -1 por lado], t: s que lleva}) e
    // `invocarLista`: desde cuando (s de juego) puede pedir otra cada lado. Sin la opcion
    // (las pruebas viejas y las medidas), invocar sin parar, como antes. La pagina la pone
    this.conTiempoInvocar = !!opciones.tiempoInvocar;
    this.tiempoInvocar = null;
    this.invocarLista = [0, 0];
    this.mitad = 1; this.reloj = 0; this.pasos = 0;
    this.goles = [0, 0];
    this.tension = [REGLAS.TENSION_INICIO, REGLAS.TENSION_INICIO];
    // la hiperbarra de cada equipo (VR: 0-200, empieza en 40) y hasta cuando (s de
    // juego) no puede invocar otro del mismo equipo tras una invocacion (O-310)
    this.hiper = [REGLAS.HIPER_INICIO, REGLAS.HIPER_INICIO];
    this.hiperBloqueo = [0, 0];
    this.ultimoRobo = [-1e9, -1e9];
    this.faltasRecibidas = [0, 0];      // para "hasta que el equipo reciba una falta" (O-304)   // cuando recupero el balon cada equipo (para "tras recuperar")
    // las tacticas de cada equipo (O-290): la activa y cuando vuelve a estar lista cada una
    this.tacticas = [equipoA.tacticas || [], equipoB.tacticas || []];
    // los calculos de VR (O-328): las pasivas del entrenador y los gerentes (cuentan como del
    // equipo; no estan en el campo), la carga de configuracion de cada equipo ({tipo, rango
    // 1-5, t: s que lleva su cuenta, n: lo gastado que lleva, p: balones perdidos}), el
    // poder de afinidad (0-30 %) y el combo de tecnicas (0-3)
    this.personal = [this._montarPersonal(equipoA), this._montarPersonal(equipoB)];
    this.carga = [equipoA, equipoB].map(eq => this._cargaDe(eq));
    this.afinidad = [0, 0];
    this.combo = [0, 0];
    this.tacticaActiva = [null, null];
    this.tacticaLista = [this.tacticas[0].map(() => 0), this.tacticas[1].map(() => 0)];
    this.nombres = [equipoA.nombre, equipoB.nombre];
    // el banquillo de cada equipo y los cambios que quedan (O-297)
    this.banquillos = [(equipoA.banquillo || []).slice(0, 5), (equipoB.banquillo || []).slice(0, 5)];
    this.banquilloUsado = [this.banquillos[0].map(() => false), this.banquillos[1].map(() => false)];
    this.cambiosQuedan = [REGLAS.CAMBIOS, REGLAS.CAMBIOS];
    this.cambios = [];            // [lado, sale, k] en orden, para el online
    // el descuento de cada parte (1 a 4) en s de reloj: 30 por cambio (O-315)
    this.descuento = [0, 0, 0, 0, 0];
    // los elegidos en la pausa, que entran al pararse el balon: {sale, entra} (O-308)
    this.cambiosPendientes = [[], []];
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
    // en las esperas (pausa, saque y descanso), quien ya ha pulsado Seguir, Jugar
    // o "Segunda parte" (O-305, O-308); cada espera lleva su numero, para que un
    // "Jugar" que llega tarde por la red no cuente en la siguiente (O-308)
    this.listos = [false, false];
    this.nEspera = 0;
    this.esperaSaque = null;      // el saque que se espera: {tipo, lado, tirador?} (O-308)
    // tras pulsar Jugar, el saque que aun no se ha hecho: {id del que saca, lado, tipo, t
    // (s que lleva)}. Hasta que saca nadie se mueve (O-324)
    this.porSacar = null;
    this.resultado = null;        // lo que paso en el ultimo duelo (para pintarlo)
    this.eventos = [];            // lo que pasa, para el registro
    // lo que se ensena en el descanso y al final, como en los juegos (O-306):
    // tiros, supertecnicas usadas, pasos con el balon (la posesion) y los goles
    // ([lado, mitad, minuto, quien]). Va en la foto: el invitado ve lo mismo.
    // Y los duelos ganados con un critico de cada equipo (O-309) y las
    // hipertecnicas (invocaciones) de cada uno (O-310), y sus tarjetas (O-311)
    this.estadisticas = { tiros: [0, 0], tecnicas: [0, 0], posesion: [0, 0], goles: [], criticos: [0, 0], hiper: [0, 0], amarillas: [0, 0], rojas: [0, 0] };
    this.saque(0);
    this._esperarSaque("centro", 0);    // [Jugar] antes del saque inicial (O-308)
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
      // las pasivas con efecto en el partido (O-288): {que, pct, alcance, condicion, n}.
      // La del espiritu lleva su marca en el efecto, que es lo que mira el motor: en
      // VR solo cuenta con la hiper puesta (O-310). Un equipo de antes no la marca:
      // se reconoce por su ranura
      efectos: (d.pasivas || []).filter(q => q.efecto && q.efecto.que && q.efecto.que[0] !== "stat")
        .map(q => q.espiritu || q.ranura === "espiritu" ? Object.assign({}, q.efecto, { espiritu: true }) : q.efecto),
      pasivas: (d.pasivas || []).map(q => ({ texto: q.texto, abierta: q.abierta, cuenta: !!q.efecto, espiritu: !!(q.espiritu || q.ranura === "espiritu") })),
      esPortero,
      u, v, x: 0, y: 0, mx: 0, my: dir,
      ruta: [], aturdido: 0, respiro: 0, conBalon: false,
    };
    if (j.esPortero) { j.kpMax = REGLAS.kpBase(j); j.kp = j.kpMax; }
    // las paradas que lleva el portero: cada una, -5 % a su tecnica de parada (O-328)
    j.fatiga = 0;
    // su espiritu (kenshin, mixi max, alma): se invoca en el partido (O-295),
    // tenga o no supertecnica (O-304)
    const te = (d.tecnicas || []).find(t => t.espiritu), esp = d.espiritu || (te && te.espiritu);
    // con su id (lo propio de cada despertar) y su tipo de hipertecnica (keshin,
    // totem, despertar...: duracion, recarga y mejoras, REGLAS.HIPER_TIPOS) (O-310)
    j.espiritu = esp ? { nombre: esp.nombre, familia: esp.familia, id: String(esp.id || "").toUpperCase(), tipo: REGLAS.tipoHiper(esp) } : null;
    // lo que dura su animacion de VR al invocar (partido.py; la ★ de un foco, O-323)
    if (esp && esp.seg > 0) j.espiritu.seg = +esp.seg;
    j.hiperTipo = j.espiritu ? j.espiritu.tipo : null;
    // en lo que se convierte con la hiper puesta (O-327; partido.py): la forma del modo
    // (otro personaje entero: nombre, cara, elemento, stats y tecnicas), el modelo de la
    // armadura o el mixi max y el keshin o alma que sale detras (lo pinta la pagina)
    this._prepararForma(j, esp);
    j.aura = 0; j.auraLista = 0;           // segundos de juego: hasta cuando dura / cuando se puede otra vez
    j.totem = 0;                           // focos ganados con el totem puesto (0-2): lo guarda para la siguiente (O-310)
    // sus tarjetas (O-311): una amarilla (0 o 1) y si le han expulsado. El que
    // entra del banquillo empieza sin ninguna
    j.amarillas = 0; j.expulsado = false;
    // los refuerzos de los cambios (O-315): [{pct, hasta}] (hasta: s de juego)
    j.refuerzos = [];
    // lo que puede gastar en tecnicas: la tension de su equipo
    Object.defineProperty(j, "pt", { get: () => this.tension[lado], enumerable: false });
    return j;
  }
  // el entrenador y los gerentes (O-328; partido.py manda `personal`, como las Pasivas de
  // equipo de Pizarra, O-193/O-185/O-228): sus pasivas cuentan como del equipo. No estan en
  // el campo: las de "propio" o "jugadores cercanos" no les valen (sin x ni y). Un equipo
  // de antes no lo trae: ninguno
  _montarPersonal(eq) {
    return (eq.personal || []).map(d => ({
      id: -1, personal: true, nombre: d.nombre, elemento: d.elemento, posicion: d.posicion, x: NaN, y: NaN,
      efectos: (d.pasivas || []).filter(q => q.efecto && q.efecto.que && q.efecto.que[0] !== "stat").map(q => q.efecto),
    }));
  }
  // la carga de configuracion del equipo (O-328): la configuracion que manda partido.py
  // (EQ.configuracion_de_equipo, O-204) si el partido la conoce (REGLAS.CARGA); si no
  // (Libertad, un empate o un equipo de antes), sin carga
  _cargaDe(eq) {
    const c = eq.configuracion, tipo = c && REGLAS.CARGA[c.tipo] ? c.tipo : null;
    return { tipo, rango: tipo ? 1 : 0, t: 0, n: 0, p: 0 };
  }
  // las pasivas del equipo de `lado`: [quien, efecto] de los del campo y del personal
  _efectosEquipo(lado) {
    const fuera = [];
    for (const h of this.equipo(lado).concat(this.personal ? this.personal[lado] : [])) for (const e of h.efectos || []) fuera.push([h, e]);
    return fuera;
  }

  // --- los cambios (O-297): se eligen en la pausa, en la espera del saque o en el
  // descanso. En la pausa, con el balon en juego, quedan pendientes y entran en la
  // siguiente parada, como en la vida real (Aaron, O-307); en el saque y en el
  // descanso, en el acto (O-308)
  puedeCambiar(lado) {
    return (this.parado() || this.fase === "descanso") && this.cambiosQuedan[lado] - this.cambiosPendientes[lado].length > 0;
  }
  // la pausa o la espera de un saque: el juego parado esperando a los dos (O-308)
  parado() { return this.fase === "pausa" || this.fase === "saque"; }
  // entra el k del banquillo por el jugador `sale` (orden "cambio")
  cambiar(lado, sale, k) {
    const fuera = this.jugadores[sale], d = (this.banquillos[lado] || [])[k], pend = this.cambiosPendientes[lado];
    if (!fuera || fuera.lado !== lado || !d || this.banquilloUsado[lado][k]) return false;
    // al expulsado no se le cambia: su equipo juega con uno menos (O-311)
    if (fuera.expulsado || !this.puedeCambiar(lado)) return false;
    // ni el que sale ni el que entra pueden estar ya en otro cambio pendiente (O-308)
    if (pend.some(c => c.sale === sale || c.entra === k)) return false;
    if (this.fase === "pausa") {
      pend.push({ sale, entra: k });
      // solo lo ve su equipo (la pagina no lo ensena al rival), como en la vida
      // real hasta que se hace (O-308)
      const e = this.apunta("Cambio preparado: entrará " + d.nombre + " por " + fuera.nombre + " cuando se pare el balón", "tactica", lado);
      e.privado = true;
      return true;
    }
    return this._hacerCambio(lado, sale, k);
  }
  // quita un cambio pendiente (el boton Quitar del Menu) (O-308)
  quitarCambio(lado, sale) {
    const pend = this.cambiosPendientes[lado] || [], k = pend.findIndex(c => c.sale === sale);
    if (k < 0) return false;
    pend.splice(k, 1);
    return true;
  }
  // los pendientes entran todos: al esperar un saque y en el descanso (O-308)
  _aplicarCambiosPendientes() {
    for (const lado of [0, 1]) {
      const pend = this.cambiosPendientes[lado];
      this.cambiosPendientes[lado] = [];
      for (const c of pend) this._hacerCambio(lado, c.sale, c.entra);
    }
  }
  // el cambio de verdad: el que entra se queda en su sitio (y con el balon si lo
  // tenia); el que sale ya no vuelve. silencioso: el invitado online lo repite
  // desde la foto y el registro ya le llega del anfitrion
  _hacerCambio(lado, sale, k, silencioso) {
    const fuera = this.jugadores[sale], d = (this.banquillos[lado] || [])[k];
    if (!fuera || fuera.lado !== lado || fuera.expulsado || !d || this.banquilloUsado[lado][k]) return false;     // O-311
    const j = this._montarJugador(d, lado, fuera.id, fuera.u, fuera.v, fuera.esPortero);
    // con el sentido de esta parte (en la segunda se cambia de campo). Y con su
    // respiro: si entra por el que saca, no le salen al paso nada mas sacar (O-308)
    Object.assign(j, { dir: fuera.dir, x: fuera.x, y: fuera.y, mx: fuera.mx, my: fuera.my, conBalon: fuera.conBalon, puesto: fuera.puesto, respiro: fuera.respiro });
    this.jugadores[fuera.id] = j;
    this.banquilloUsado[lado][k] = true;
    this.cambiosQuedan[lado]--;
    this.cambios.push([lado, sale, k]);
    // como en VR (O-315): el que entra, AT y DF +15 % un minuto de juego, y los de su
    // posicion +5 %; y la parte se alarga 30 s de reloj (no en el descanso: en la
    // vida real el descuento es por el tiempo que se pierde jugando). El invitado lo
    // repite y la foto lo deja igual que en el anfitrion
    const C = REGLAS.CAMBIO_REFUERZO, ahora = this.segundosDeJuego(), hasta = ahora + C.segundos;
    j.refuerzos = [{ pct: C.entra, hasta }];
    for (const o of this.equipo(lado)) if (o !== j && o.posicion === j.posicion) {
      o.refuerzos = (o.refuerzos || []).filter(r => r.hasta > ahora).concat([{ pct: C.posicion, hasta }]);
    }
    if (this.fase !== "descanso" && !this.tanda) this._sumarDescuento(REGLAS.CAMBIO_DESCUENTO);
    // el pase marcado al que sale no se lo lleva el que entra (O-305)
    if (this.paseMarcado[lado] && this.paseMarcado[lado].a === sale) this.paseMarcado[lado] = null;
    for (const o of this.jugadores) if (o.presiona === sale) o.presiona = undefined;
    // el rotulo pequeno "Cambio" en el campo (O-308)
    if (!silencioso) this.apunta("Cambio en " + this.nombres[lado] + ": entra " + j.nombre + " por " + fuera.nombre, "tactica").ro =
      { que: "cambio", lado, sub: "Entra " + j.nombre + " · sale " + fuera.nombre };
    return true;
  }

  // los expulsados (O-311) se quedan en `jugadores` (su id es su sitio en el array:
  // la foto, los cambios y las ordenes lo usan), pero ya no estan en el campo: ni en
  // su equipo (apoyos, companeros, muro, cadena, pasivas, fuera de juego, la
  // maquina...) ni en lo que se mueve, coge el balon o tiene duelos
  enCampo() { return this.jugadores.filter(j => !j.expulsado); }
  equipo(lado) { return this.jugadores.filter(j => j.lado === lado && !j.expulsado); }
  portero(lado) { return this.jugadores.find(j => j.lado === lado && j.esPortero) || this.equipo(lado)[0]; }
  dueno() { return this.balon.dueno === null ? null : this.jugadores[this.balon.dueno]; }
  // lado: de quien es el suceso; con el, la pagina avisa a ese jugador de los
  // "aviso" (demasiado lejos...). Va en la foto y un Pizarra anterior lo ignora (O-305)
  // Devuelve el suceso: al de un momento con rotulo grande en el campo se le pone
  // `ro` = {que, lado, sub} (lado: el equipo al que le toca; va en la foto con el
  // suceso y un Pizarra anterior no lo mira) (O-306)
  apunta(texto, clase, lado) {
    const e = { paso: this.pasos, mitad: this.mitad, reloj: this.reloj, texto, clase };
    if (lado !== undefined) e.lado = lado;
    this.eventos.push(e);
    return e;
  }
  // --- el reloj de 3DS (O-308) ----------------------------------------------------
  // `reloj` son los s reales de juego de la parte; el que se ve va a RELOJ_RITMO.
  // Cada parte empieza en 00:00 (como en 3DS) y puede pasar de 15:00 (la parte
  // sigue hasta que se pare el balon). El 1e-6: 150 pasos de 1/30 no suman 5 justos
  relojTexto(reloj = this.reloj) {
    const s = Math.floor(reloj * REGLAS.RELOJ_RITMO + 1e-6), dos = n => String(n).padStart(2, "0");
    return dos(Math.floor(s / 60)) + ":" + dos(s % 60);
  }
  // el minuto DENTRO de la parte (antes 0-90 del partido entero)
  minuto(reloj = this.reloj) { return Math.floor(reloj * REGLAS.RELOJ_RITMO / 60 + 1e-6); }
  // "1ª", "2ª" y, en la prorroga, "1ª pr." y "2ª pr." (O-312)
  etiquetaParte(m = this.mitad) { return ["1ª", "2ª", "1ª pr.", "2ª pr."][m - 1] || m + "ª"; }
  // los s reales de la parte m: las de la prorroga (3 y 4), un tercio (5:00 en
  // partes de 15) (O-312)
  duracionParte(m = this.mitad) { return m >= 3 ? this.duracion * REGLAS.PRORROGA_FRACCION : this.duracion; }
  // el descuento de la parte m, en s de RELOJ: lo que suman sus cambios (O-315)
  descuentoParte(m = this.mitad) { return (this.descuento && this.descuento[m]) || 0; }
  // los s reales en que acaba la parte m (sin lo que se alarga si el balon sigue en
  // juego): su duracion y su descuento
  _finParte(m = this.mitad) { return this.duracionParte(m) + this.descuentoParte(m) / REGLAS.RELOJ_RITMO; }
  _sumarDescuento(s) {
    this.descuento[this.mitad] = this.descuentoParte() + s;
    // si ya se alargaba tras las 15:00 y con el descuento aun queda tiempo, vuelve a
    // ser tiempo de la parte (no se acaba en la siguiente parada)
    if (this.prolonga && this.reloj < this._finParte()) this.prolonga = false;
  }

  // --- quien gana (O-312) -----------------------------------------------------------
  // por goles; con empate, el de la tanda de penaltis si la hubo; si no, null
  ganador() {
    if (this.goles[0] !== this.goles[1]) return this.goles[0] > this.goles[1] ? 0 : 1;
    const t = this.tanda;
    return t && (t.gana === 0 || t.gana === 1) ? t.gana : null;
  }
  // los goles de la tanda de cada equipo
  golesTanda() { return this.tanda ? this.tanda.tiros.map(x => x.filter(Boolean).length) : [0, 0]; }
  // "1 - 1" y, con tanda, "1 - 1 (4-2 pen.)"
  marcadorTexto() {
    const s = this.goles[0] + " - " + this.goles[1];
    return this.tanda ? s + " (" + this.golesTanda().join("-") + " pen.)" : s;
  }

  // hacia donde se pinta el ataque de `lado` en su pantalla (y en la 3D): su sentido
  // (+1 si ataca hacia +y). En la tanda, la porteria de la tanda arriba para los dos:
  // el sentido de los equipos cambia en cada penalti y la pantalla no debe girar (O-315)
  sentidoPantalla(lado) {
    const t = this.tanda;
    if (t && (t.porteria === 1 || t.porteria === -1)) return t.porteria;
    const j = this.jugadores.find(q => q.lado === lado);
    return j ? j.dir : 1;
  }

  // del marco del equipo (u: ancho -1..1, v: largo -1 propia .. 1 rival) al campo
  aCampo(j, u, v) { return { x: u * REGLAS.ANCHO / 2 * j.dir, y: v * REGLAS.LARGO / 2 * j.dir }; }
  porteriaRival(j) { return { x: 0, y: REGLAS.LARGO / 2 * j.dir }; }

  saque(lado) {
    // todos a su campo, el balon al centro para el que saca (el expulsado no vuelve, O-311)
    for (const j of this.enCampo()) {
      const c = this.aCampo(j, j.u, Math.min(-0.04, (j.v - 1) / 2));
      j.x = c.x; j.y = c.y; j.ruta = []; j.aturdido = 0; j.respiro = 0; j.conBalon = false;
      j.mx = 0; j.my = j.dir;
    }
    const delanteros = this.equipo(lado).filter(j => !j.esPortero).sort((a, b) => b.v - a.v);
    const saca = delanteros[0];
    saca.x = 0; saca.y = -1.2 * saca.dir;
    this.balon = { x: 0, y: 0, vx: 0, vy: 0, dueno: null, ultimo: lado, pase: null };
    this.tiro = null;     // O-325
    this.coger(saca);
    saca.respiro = REGLAS.RESPIRO_SAQUE;     // el saque de centro, sin que le salgan al paso
    // la fase ya no la pone el saque: la pone quien lo llama (la espera de
    // "Jugar" o el juego directo tras el descanso) (O-308)
    // "¡Saque!" al empezar cada parte y tras un gol, como en CS y Galaxy. No
    // empieza por "Saque de": eso son los fueras (lo cuentan las medidas) (O-306)
    this.apunta("Saca de centro " + this.nombres[lado]).ro = { que: "saque", lado, sub: this.nombres[lado] };
  }

  coger(j) {
    // el rival pierde su combo de tecnicas; y si el balon era suyo, lo ha perdido (la carga
    // de Vinculo) (O-328)
    if (this.combo) {
      this.combo[1 - j.lado] = 0;
      if (this.balon && this.balon.ultimo === 1 - j.lado) this._cargaPerdida(1 - j.lado);
    }
    for (const o of this.jugadores) o.conBalon = false;
    j.conBalon = true;
    this.balon.dueno = j.id; this.balon.ultimo = j.lado; this.balon.pase = null;
    this.balon.vx = this.balon.vy = 0;
    // cualquier toque acaba la jugada del pase: ya no queda fuera de juego que pitar (O-305)
    this.balon.fueraDe = null;
    // el saque sin fuera de juego solo vale para el pase del que saca (O-305)
    if (this._saque && this._saque.id !== j.id) this._saque = null;
    // cualquier toque le quita el balon de las manos al portero: solo lo tiene
    // tras una parada o en su saque de puerta, no en un pase atras (O-305)
    this._manos = null;
    // en cuanto alguien coge el balon, los colocados en el saque vuelven a moverse
    // solos (O-313)
    if (this._finColocados) { for (const o of this.jugadores) o.colocado = null; this._finColocados = 0; }
    // si lo coge otro (o lo vuelve a coger), el saque ya no espera (O-324)
    this.porSacar = null;
    // y el tiro que iba en vuelo se acaba (O-325)
    this.tiro = null;
  }
  _aManos(por) { this._manos = { id: por.id, hasta: this.segundosDeJuego() + REGLAS.PORTERO_MANOS }; }
  soltar() {
    const d = this.dueno();
    if (d) d.conBalon = false;
    this.balon.dueno = null;
    this.porSacar = null;      // O-324
  }

  // --- ordenes ----------------------------------------------------------------
  // {tipo:"ruta", jugador, puntos:[{x,y}...]} | {tipo:"pase", de, a}
  // {tipo:"tiro", de} | {tipo:"elegir", lado, eleccion}
  ordenar(o) {
    if (o.tipo === "elegir") return this.elegir(o.lado, o.eleccion);
    if (o.tipo === "tactica") return this.usarTactica(o.lado, o.k);
    if (o.tipo === "pausa") return this.pausar(o.lado);
    // `espera`: el numero de la espera en que se pulso (O-308); sin el, vale siempre
    if (o.tipo === "seguir") return this.seguir(o.lado, o.espera);
    if (o.tipo === "presionar") return this.presionar(o.lado, o.objetivo);
    if (o.tipo === "invocar") return this.invocar(o.jugador);
    // el boton de los espiritus: para el juego para invocar (O-327)
    if (o.tipo === "tiempoInvocar") return this.pedirInvocacion(o.lado);
    if (o.tipo === "cambio") return this.cambiar(o.lado, o.sale, o.entra);
    if (o.tipo === "quitarCambio") return this.quitarCambio(o.lado, o.sale);     // O-308
    // poner a uno de los tuyos en un sitio, en la espera de un saque (O-313)
    if (o.tipo === "colocar") return this.colocar(o.jugador, o.x, o.y, o.lado);
    const j = this.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (!j || this.fase === "final") return false;
    // nada para un expulsado ni un pase a el (O-311): online puede llegar de una
    // pantalla de antes de la roja
    if (j.expulsado || (o.a !== undefined && this.jugadores[o.a] && this.jugadores[o.a].expulsado)) return false;
    // una ruta vale tambien con el juego parado (online puede llegar justo al
    // empezar un duelo); pasar y chutar, solo con el balon en juego
    if (o.tipo === "ruta") {
      // en la espera de un saque solo se coloca: las flechas, tras pulsar Jugar (Aaron,
      // O-322 punto 2; O-324)
      if (this.fase === "saque") return false;
      j.ruta = (o.puntos || []).slice(0, 40).map(p => this._dentro(p.x, p.y));
      j.presiona = null;
      j.colocado = null;     // con su carrera ya no se queda quieto donde se le coloco (O-313)
      // la carrera del que saca: se va conduciendo, el balon ya esta en juego (O-324)
      if (j.ruta.length) this._sacar(j);
      return true;
    }
    // en un foco tambien se marca, como en la pausa: sale si gana el duelo el que
    // lleva el balon y se borra si lo pierde (CS: el pase programado) (O-306)
    const enFoco = this.fase === "duelo" && this.duelo && this.duelo.tipo === "foco";
    if ((this.parado() || enFoco) && (o.tipo === "pase" || o.tipo === "pasePunto" || o.tipo === "tiro")) {
      // en la pausa el pase se marca y sale al seguir (3DS); el tiro tambien:
      // pulsar la porteria acababa en un pase a la linea de gol (O-305). En la
      // espera de un saque ya no se marca (O-308 lo dejaba): alli solo se coloca y el
      // que saca saca tras pulsar Jugar, con el pase o el tiro (Aaron, O-322 punto 2;
      // O-324)
      const dl = this.dueno();
      if (!dl || dl.lado !== j.lado) return false;
      if (this.fase === "saque") return false;
      // un pase al mismo que lo da quita lo marcado: pulsar al del balon (O-305)
      if (o.tipo === "pase" && o.a === o.de) { this.paseMarcado[j.lado] = null; return true; }
      if (o.tipo === "tiro") {
        if (j !== dl) return false;
        // si no llega se dice ya, no al seguir
        const g = this.porteriaRival(j);
        if (Math.hypot(g.x - j.x, g.y - j.y) > this._alcanceTiro(j)) {
          this.apunta(j.nombre + " está demasiado lejos para chutar", "aviso", j.lado);
          return false;
        }
      }
      this.paseMarcado[j.lado] = Object.assign({}, o);
      return true;
    }
    // el remate de primeras solo marca el pase que va de camino: vale tambien en
    // la pausa y se cumple al seguir (antes no hacia nada) (O-305)
    if (this.fase !== "juego" && !(this.fase === "pausa" && o.tipo === "directo")) return false;
    if (o.tipo === "pase") {
      const a = this.jugadores[o.a];
      if (!j.conBalon || !a || a.lado !== j.lado || a.id === j.id) return false;
      this._sacar(j);     // si es el que saca, el balon ya esta en juego (O-324)
      this._pasar(j, a, o.alto);
      return true;
    }
    if (o.tipo === "directo") {
      // rematar de primeras el pase que va de camino (DS: tocar la porteria
      // mientras va el pase; VR: tiro directo)
      if (!this.balon.pase || this.jugadores[this.balon.pase.de].lado !== j.lado) return false;
      // si desde donde llega el pase no se alcanza la porteria, no se anuncia un
      // remate que luego no pasa (O-305)
      const rec = this.jugadores[this.balon.pase.a], gr = this.porteriaRival(rec), dest = this.balon.pase.destino;
      if (Math.hypot(gr.x - dest.x, gr.y - dest.y) > this._alcanceTiro(rec)) {
        this.apunta(rec.nombre + " está demasiado lejos para rematar de primeras", "aviso", rec.lado);
        return false;
      }
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
      this._sacar(j);     // O-324
      this._pasarA(j, a, destino, o.alto);
      return true;
    }
    if (o.tipo === "despeje") {
      // despejar (O-315): un balon bombeado hacia un punto que puede estar fuera del
      // campo (la banda: como en la vida real, mejor un saque de banda que un gol); va
      // a por el el companero mas cerca, como en el pase al hueco. Lo usa la maquina
      if (!j.conBalon || typeof o.x !== "number" || typeof o.y !== "number" || !isFinite(o.x) || !isFinite(o.y)) return false;
      const ax = REGLAS.ANCHO / 2 + 8, ay = REGLAS.LARGO / 2 + 8;
      const destino = { x: Math.max(-ax, Math.min(ax, o.x)), y: Math.max(-ay, Math.min(ay, o.y)) };
      const a = this.equipo(j.lado).filter(c => c.id !== j.id && !c.esPortero)
        .sort((p, q) => Math.hypot(p.x - destino.x, p.y - destino.y) - Math.hypot(q.x - destino.x, q.y - destino.y))[0];
      if (!a) return false;
      this._sacar(j);     // O-324
      this._pasarA(j, a, destino, true, true);
      return true;
    }
    if (o.tipo === "tiro") {
      if (!j.conBalon) return false;
      const g = this.porteriaRival(j);
      const d = Math.hypot(g.x - j.x, g.y - j.y);
      if (d > this._alcanceTiro(j)) {
        this.apunta(j.nombre + " está demasiado lejos para chutar", "aviso", j.lado);
        return false;
      }
      this._sacar(j);     // el tiro de la falta (O-324)
      // `largo`: el de la T de la tactil, con su tiro largo (O-326); un Pizarra anterior lo
      // ignora y es un tiro como los demas
      this._empezarTiro(j, d, null, false, false, !!o.largo);
      return true;
    }
    return false;
  }

  // hasta donde puede chutar j: mas lejos si tiene a punto un tiro largo. La
  // misma regla para el tiro y para el remate de primeras (O-305)
  _alcanceTiro(j) {
    const larga = j.tecnicas.some(t => REGLAS.esLarga(t) && this.coste(j, t) <= j.pt && (!t.espiritu || this.conAura(j)));
    return REGLAS.DISTANCIA_TIRO * (larga ? 1.6 : 1);
  }

  // --- la T de la tactil (O-326; Aaron, O-322 punto 4) ---------------------------------
  // La T es el tiro largo: si j (el que lleva el balon) tiene una supertecnica de tiro
  // largo que puede usar ya (la paga; la del espiritu, con el aura; la de varios, con
  // companeros) y llega a la porteria (_alcanceTiro), chuta con ella y va como un tiro
  // normal (elige su tiro largo, el balon viaja, los muros, el portero). Si no, la T es un
  // pase hacia delante: al companero mejor colocado por delante o, si no hay, al hueco. En
  // el saque de banda no se chuta (es con las manos): pase. Sin azar: lo que dice la
  // tactil es lo que pasa. Devuelve { que: "tiro" | "pase" | "hueco" | null, orden (la de
  // ordenar), porque (si null), sinTiro (por que no chuta), tecnicas, a, x, y }
  botonT(j) {
    if (!j || j.expulsado || !j.conBalon || this.balon.dueno !== j.id) return { que: null, porque: "La T es del que lleva el balón: su tiro largo o, si no tiene, un pase hacia delante" };
    if (this.fase !== "juego") return { que: null, porque: "Con el balón en juego" };
    const g = this.porteriaRival(j), d = Math.hypot(g.x - j.x, g.y - j.y);
    const banda = !!this.porSacar && this.porSacar.tipo === "banda";
    const largos = this._opcionesLargas(j), vale = largos.filter(o => o.puede);
    if (!banda && vale.length && d <= this._alcanceTiro(j))
      return { que: "tiro", tecnicas: largos, distancia: Math.round(d), orden: { tipo: "tiro", de: j.id, largo: true } };
    const faltan = largos.find(o => o.nota && /faltan/.test(o.nota));
    const sinTiro = banda ? "en el saque de banda no se chuta" : !largos.length ? j.nombre + " no tiene tiro largo"
      : !vale.length ? (faltan && largos.every(o => o.tp <= j.pt) ? "a su tiro largo le faltan compañeros" : "no le llega la tensión para su tiro largo (TEN " + Math.min(...largos.map(o => o.tp)) + ")")
      : "está demasiado lejos para su tiro largo";
    const a = this._paseAdelante(j);
    if (a) return { que: "pase", a: a.id, sinTiro, orden: { tipo: "pase", de: j.id, a: a.id } };
    const h = this._huecoAdelante(j);
    return { que: "hueco", x: h.x, y: h.y, a: h.a, sinTiro, orden: { tipo: "pasePunto", de: j.id, x: h.x, y: h.y } };
  }
  // las supertecnicas de tiro largo de j que salen al chutar (las que paga y las que no)
  _opcionesLargas(j) {
    return this._opciones(j, "tiro").filter(o => o.clave[0] === "t" && REGLAS.esLarga(this._tecnica(j, o.clave)));
  }
  // las opciones del que chuta; con la T (`largo`), solo sus tiros largos (O-326). Si ya no
  // puede usar ninguno (online, la tension ha cambiado al llegar la orden), las de siempre
  _opcionesChute(j, alto, largo) {
    const ops = this._opciones(j, "tiro", alto);
    if (!largo || alto) return { ops, largo: false };
    const l = ops.filter(o => o.clave[0] === "t" && REGLAS.esLarga(this._tecnica(j, o.clave)));
    return l.some(o => o.puede) ? { ops: l, largo: true } : { ops, largo: false };
  }
  // el pase hacia delante de la T: el companero (no el portero) por delante, a tiro de pase,
  // sin un rival en el camino ni fuera de juego, que mas avanza y mas libre esta (la nota
  // de los pases de la maquina, con el avance primero)
  _paseAdelante(j) {
    const B = REGLAS.BOTON_T, rivales = this.equipo(1 - j.lado);
    let mejor = null, nota = -1e9;
    for (const c of this.equipo(j.lado)) {
      if (c === j || c.esPortero || c.aturdido > 0) continue;
      const avance = (c.y - j.y) * j.dir, dist = Math.hypot(c.x - j.x, c.y - j.y);
      if (avance < B.avance || dist < B.cerca || dist > B.lejos || this.fueraEnPase(c, j)) continue;
      if (rivales.some(r => { const e = this._distanciaALinea(r, j, c); return e.delante && e.d < B.linea; })) continue;
      const libre = Math.min(B.libre, ...rivales.map(r => Math.hypot(r.x - c.x, r.y - c.y)));
      const n = avance * 0.6 + libre * 1.2 - dist * 0.1;
      if (n > nota) { nota = n; mejor = c; }
    }
    return mejor;
  }
  // el hueco de la T: `hueco` m por delante de j (un poco hacia el centro, dentro del campo y
  // sin pasar del area pequena); va a por el el companero (no el portero) que mas cerca
  // esta, como en el pase al hueco de siempre
  _huecoAdelante(j) {
    const B = REGLAS.BOTON_T, fondo = REGLAS.LARGO / 2 - 6;
    const p = this._dentro(j.x * 0.8, Math.max(-fondo, Math.min(fondo, j.y + j.dir * B.hueco)));
    const a = this.equipo(j.lado).filter(c => c !== j && !c.esPortero)
      .sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y) || u.id - v.id)[0];
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, a: a ? a.id : null };
  }

  _dentro(x, y) {
    return { x: Math.max(-REGLAS.ANCHO / 2 + 0.5, Math.min(REGLAS.ANCHO / 2 - 0.5, x)),
             y: Math.max(-REGLAS.LARGO / 2 + 0.5, Math.min(REGLAS.LARGO / 2 - 0.5, y)) };
  }

  _pasar(de, a, alto) {
    // si le has dibujado una carrera (el desmarque de la pausa), el pase va al
    // punto de su ruta donde le alcanza el balon y la ruta se cumple: antes se
    // apuntaba hacia donde iba y se le borraba. Solo los humanos: la maquina
    // pasa como antes (O-305)
    if (a.ruta.length && this.manual[a.lado]) {
      const ruta = a.ruta;
      this._pasarA(de, a, this._encuentro(de, a, alto), alto);
      a.ruta = ruta;
      return;
    }
    // al colocado en el saque, que esta quieto en su sitio: al pie. Al hueco iba
    // varios metros hacia donde mira (el balon) y se perdia el sitio (O-313)
    if (a.colocado && this.segundosDeJuego() < (this._finColocados || 0)) return this._pasarA(de, a, this._dentro(a.x, a.y), alto);
    // al hueco: adonde estara el companero cuando llegue el balon
    const d = Math.hypot(a.x - de.x, a.y - de.y);
    const t = d / REGLAS.VEL_PASE;
    const destino = this._dentro(a.x + a.mx * REGLAS.velocidad(a) * t * 0.6, a.y + a.my * REGLAS.velocidad(a) * t * 0.6);
    this._pasarA(de, a, destino, alto);
  }
  // el primer punto de la ruta de a en que el balon, saliendo de de, llega a la
  // vez que el; si no le alcanza, el final de la ruta (O-305)
  _encuentro(de, a, alto) {
    const vb = alto ? REGLAS.VEL_PASE_ALTO : REGLAS.VEL_PASE, vj = REGLAS.velocidad(a) * this._mulVel(a);
    let x = a.x, y = a.y, t = 0;
    for (const q of a.ruta) {
      const s = Math.hypot(q.x - x, q.y - y);
      // f(k) >= 0: al punto k del tramo el balon llega antes que el
      const f = k => t + s * k / vj - Math.hypot(x + (q.x - x) * k - de.x, y + (q.y - y) * k - de.y) / vb;
      if (s > 0.01 && f(1) >= 0) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 20; n++) { const m = (lo + hi) / 2; if (f(m) >= 0) hi = m; else lo = m; }
        return this._dentro(x + (q.x - x) * hi, y + (q.y - y) * hi);
      }
      t += s / vj; x = q.x; y = q.y;
    }
    return this._dentro(x, y);
  }

  // despeje: el de la maquina (O-315), que dice "despeja" y no "pasa a"
  _pasarA(de, a, objetivo, alto, despeje) {
    // el pase no es perfecto (O-315): el balon va a unos metros de donde se apunta
    // (`objetivo`, que se guarda para las pruebas), y puede irse fuera del campo
    const destino = this._errorPase(de, objetivo, alto);
    const dd = Math.hypot(destino.x - de.x, destino.y - de.y) || 1;
    const vel = alto ? REGLAS.VEL_PASE_ALTO : REGLAS.VEL_PASE;
    this.soltar();
    this.balon.x = de.x; this.balon.y = de.y;
    this.balon.vx = (destino.x - de.x) / dd * vel;
    this.balon.vy = (destino.y - de.y) / dd * vel;
    this.balon.pase = { de: de.id, a: a.id, destino, objetivo, queda: dd, total: dd, alto: !!alto,
      fuera: this.fueraEnPase(a, de) };
    // la marca sigue aunque el pase se acabe antes de que llegue el (O-305)
    this.balon.fueraDe = this.balon.pase.fuera ? a.id : null;
    this._saque = null;
    this.balon.ultimo = de.lado;
    de.respiro = 0.6;
    // el que lo recibe va adonde va el balon de verdad (sin salirse del campo)
    a.ruta = [this._dentro(destino.x, destino.y)];
    this.apunta(despeje ? de.nombre + " despeja" : de.nombre + " pasa a " + a.nombre);
  }
  // adonde va de verdad un pase que apunta a `p` (O-315): el error tipico crece con lo
  // largo del pase y con un rival encima del que pasa, y mas en el bombeado
  // (REGLAS.PASE_ERROR); a lo largo y de lado, como una normal (la suma de tres
  // numeros del azar del partido: sale lo mismo en los dos PCs)
  _errorPase(de, p, alto) {
    const E = REGLAS.PASE_ERROR, d = Math.hypot(p.x - de.x, p.y - de.y);
    if (d < 0.01) return { x: p.x, y: p.y };
    const cerca = Math.min(99, ...this.equipo(1 - de.lado).map(r => Math.hypot(r.x - de.x, r.y - de.y)));
    const s = Math.min(E.tope, (E.base + E.porMetro * d + E.presion * Math.max(0, 1 - cerca / E.cerca)) * (alto ? E.alto : 1));
    const normal = () => (this.azar() + this.azar() + this.azar() - 1.5) * 2;
    const ux = (p.x - de.x) / d, uy = (p.y - de.y) / d;
    // a lo largo, como mucho hasta la mitad hacia atras (no sale hacia el que pasa)
    const largo = Math.max(-d / 2, normal() * s), lado = normal() * s;
    return { x: p.x + ux * largo - uy * lado, y: p.y + uy * largo + ux * lado };
  }

  // --- duelos -------------------------------------------------------------------
  // Opciones de cada lado: [{clave, nombre, tipo, poder, tp, puede}]. alto: el
  // tiro remata de primeras un pase bombeado (Testarazo y Volea, O-309)
  _opciones(j, que, alto) {
    const base = {
      regate: [{ clave: "normal", nombre: "Regatear", nota: "seguro", tipo: "Regate", poder: 0, tp: 0, puede: true },
               { clave: "potente", nombre: "Romper", nota: "fuerte pero inestable", tipo: "Regate", poder: 0, tp: 0, puede: true }],
      entrada: [{ clave: "normal", nombre: "Tapar", nota: "seguro", tipo: "Defensa", poder: 0, tp: 0, puede: true },
                { clave: "potente", nombre: "Entrada", nota: "fuerte pero inestable", tipo: "Defensa", poder: 0, tp: 0, puede: true },
                { clave: "cargar", nombre: "Cargar", nota: "disputa: fisico", tipo: "Defensa", poder: 0, tp: 0, puede: true }],
      // los botones de 3DS sin supertecnica (Aaron, O-307 punto 5): con el balon en
      // el suelo [Tirar] [Vaselina]; rematando un pase alto [Testarazo] [Volea]; el
      // portero [Parar] [Despejar] (O-309)
      tiro: alto
        ? [{ clave: "normal", nombre: "Testarazo", nota: "de cabeza: cuenta el Físico", tipo: "Tiro", poder: 0, tp: 0, puede: true },
           { clave: "volea", nombre: "Volea", nota: "fuerte pero inestable (cuenta el Físico)", tipo: "Tiro", poder: 0, tp: 0, puede: true }]
        : [{ clave: "normal", nombre: "Tirar", tipo: "Tiro", poder: 0, tp: 0, puede: true },
           { clave: "vaselina", nombre: "Vaselina", nota: "bombeada: ×0,8, pero pasa por encima del defensa si no está pegado", tipo: "Tiro", poder: 0, tp: 0, puede: true }],
      parada: [{ clave: "normal", nombre: "Parar", nota: "se la queda", tipo: "Parada", poder: 0, tp: 0, puede: true },
               { clave: "despejar", nombre: "Despejar", nota: "×1,25, pero el balón rebota a cualquier sitio", tipo: "Parada", poder: 0, tp: 0, puede: true }],
      muro: [{ clave: "normal", nombre: "Bloquear", tipo: "Defensa", poder: 0, tp: 0, puede: true },
             { clave: "nada", nombre: "Dejar pasar", tipo: "", poder: 0, tp: 0, puede: true }],
      cadena: [{ clave: "nada", nombre: "No encadenar", tipo: "", poder: 0, tp: 0, puede: true }],
    }[que];
    const vistas = new Set();
    // en VR "Vaselina" es tambien una supertecnica de verdad (rhs10010): con el
    // mismo nombre que un boton sale como "Vaselina (técnica)" (O-309)
    const comandos = new Set(base.map(o => o.nombre.toLowerCase()));
    // la hipertecnica en un foco (O-310): con espiritu y sin la hiper puesta, un
    // boton mas al final que gana el duelo (salvo otra hiper). `puede` y `porque`
    // (lo que falta), de puedeHiper; se mira otra vez al resolver
    if ((que === "regate" || que === "entrada") && j.espiritu && !this.conAura(j)) {
      const ph = this.puedeHiper(j);
      base.push({ clave: "hiper", nombre: "★ " + j.espiritu.nombre, tipo: "Hipertecnica", hiper: true,
        nota: "gana el duelo · " + REGLAS.HIPER_COSTE + " de hiperbarra", poder: 0, tp: 0, puede: ph.si, porque: ph.porque });
    }
    const tecs = j.tecnicas.filter(t => REGLAS.sirve(t, que) && (!t.espiritu || this.conAura(j)) && !vistas.has(t.nombre) && vistas.add(t.nombre)).map(t => {
      // las de 2, 3 o 4 jugadores: en VR vale cualquier companero, cerca o no
      // (Aaron); salen los mas cercanos (O-298)
      const n = Math.max(1, Number(t.jugadores) || 1), con = n > 1 ? this.companeros(j, n - 1) : [];
      const listos = con.length >= n - 1;
      return {
        clave: "t" + t.ranura, nombre: t.nombre + (que === "muro" && REGLAS.esContra(t) ? " (contra-tiro)" : "")
          + (comandos.has(String(t.nombre).toLowerCase()) ? " (técnica)" : ""),
        tipo: t.tipo, elemento: t.elemento, subtipo: t.subtipo,
        // tp: lo que cuesta ahora (con el combo, menos; O-328)
        interno: t.interno, poder: Math.round(this._poder(j, t)), tp: this.coste(j, t), puede: this.coste(j, t) <= j.pt && listos,
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
    this._saque = null;            // tras un duelo ya no es el pase del saque (O-305)
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "foco", atacante: att.id, defensor: def.id,
      lados: {
        [att.lado]: { rol: "ataque", jugador: att.id, opciones: this._opciones(att, "regate") },
        [def.lado]: { rol: "defensa", jugador: def.id, opciones: this._opciones(def, "entrada") },
      },
      elecciones: {},
    };
    this._previo(this.duelo);          // los numeros antes de elegir (O-306)
    this.apunta("¡" + def.nombre + " sale al paso de " + att.nombre + "!", "duelo");
  }

  // alto: remata de primeras un pase bombeado (Testarazo y Volea, O-309). largo: el de la
  // T, que solo elige entre sus tiros largos (O-326)
  _empezarTiro(tirador, distancia, pasador, penalti, alto, largo) {
    // el tiro que viaja (O-325): primero solo elige el que chuta
    if (this.vuelo && !penalti) return this._empezarChute(tirador, distancia, pasador, alto, largo);
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
      // la del espiritu solo vale con el aura puesta, como en _opciones (O-305)
      if (c === tirador || c.esPortero || c.aturdido > 0 || !c.tecnicas.some(t => REGLAS.sirve(t, "cadena") && (!t.espiritu || this.conAura(c)))) continue;
      const e = this._distanciaALinea(c, tirador, g);
      if (e.delante && e.d < mc) { mc = e.d; cadena = c; }
    }
    this.fase = "duelo";
    // con la T, solo sus tiros largos (O-326)
    const oc = this._opcionesChute(tirador, !!alto, largo && !penalti);
    this.duelo = {
      id: ++this.nDuelos, tipo: "tiro", tirador: tirador.id, portero: portero.id, muro: muro ? muro.id : null, distancia,
      cadena: cadena ? cadena.id : null, directo: pasador ? pasador.id : null, penalti: !!penalti,
      // O-309: el balon alto (Testarazo/Volea) y si el del muro esta pegado al que
      // chuta (entonces para tambien la vaselina). Van en la foto con el duelo
      alto: !!alto, muroPegado: !!muro && Math.hypot(muro.x - tirador.x, muro.y - tirador.y) <= REGLAS.PEGADO,
      lados: {
        [tirador.lado]: { rol: "tiro", jugador: tirador.id, opciones: oc.ops,
          cadena: cadena ? { jugador: cadena.id, opciones: this._opciones(cadena, "cadena") } : null },
        [1 - tirador.lado]: { rol: "porteria", jugador: portero.id, opciones: this._opciones(portero, "parada"),
          muro: muro ? { jugador: muro.id, opciones: this._opciones(muro, "muro") } : null },
      },
      elecciones: {},
    };
    if (oc.largo) this.duelo.largo = this.duelo.lados[tirador.lado].largo = true;
    this._previo(this.duelo);          // los numeros antes de elegir (O-306)
    this.estadisticas.tiros[tirador.lado]++;     // cada tiro a puerta, tambien el penalti (O-306)
    this.apunta(tirador.nombre + (pasador ? " remata de primeras" : oc.largo ? " chuta de lejos" : " chuta") + " a " + Math.round(distancia) + " m", "tiro");
  }

  // --- el penalti (O-312) ------------------------------------------------------------
  // El del partido y los de la tanda, igual (como los penaltis de GO Light): el que
  // tira y el portero eligen a la vez una zona (0 izquierda, 1 centro, 2 derecha, del
  // campo) y, si quieren, una supertecnica (de tiro o de parada). Sus opciones: las
  // supertecnicas que sirven y, al final, sin ninguna (Tirar o Parar)
  _opcionesPenalti(j, que) {
    const ops = this._opciones(j, que).filter(o => o.clave[0] === "t");
    ops.push({ clave: "normal", nombre: que === "tiro" ? "Tirar" : "Parar", nota: "sin supertécnica", tipo: que === "tiro" ? "Tiro" : "Parada", poder: 0, tp: 0, puede: true });
    return ops;
  }
  // el duelo "penalti": desde 11 m, sin muro ni cadena (lo que miran las cuentas del
  // tiro, _valorTiro y _previo, va puesto). enTanda: uno de la tanda, que no cuenta
  // en los tiros del partido (va en estadisticas.penaltis)
  _empezarPenalti(t, enTanda) {
    const por = this.portero(1 - t.lado);
    this._saque = null;
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "penalti", tirador: t.id, portero: por.id, distancia: 11, tanda: !!enTanda,
      muro: null, cadena: null, directo: null, penalti: true, alto: false, muroPegado: false,
      lados: {
        [t.lado]: { rol: "penalti_tiro", jugador: t.id, opciones: this._opcionesPenalti(t, "tiro") },
        [por.lado]: { rol: "penalti_parada", jugador: por.id, opciones: this._opcionesPenalti(por, "parada") },
      },
      elecciones: {},
    };
    this._previo(this.duelo);          // los numeros antes de elegir, como en el tiro
    if (!enTanda) this.estadisticas.tiros[t.lado]++;
    this.apunta(enTanda ? "Penaltis: tira " + t.nombre + " (" + this.nombres[t.lado] + ")" : t.nombre + " tira el penalti", "tiro");
  }

  _distanciaALinea(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    return { d: Math.hypot(p.x - cx, p.y - cy), delante: t > 0.05 && t < 0.92 };
  }

  // --- el tiro que viaja (O-325; Aaron, O-322 punto 3) ----------------------------------
  // Como en Galaxy: el que chuta elige su tiro y chuta; el balon VIAJA hacia la porteria
  // (this.tiro) con el juego en marcha: se dibujan flechas y los defensas que llegan a su
  // camino lo pueden bloquear. Al llegarle a un rival se para y ese elige su bloqueo (uno
  // detras de otro si hay varios); a un companero con tiro de cadena, si encadena; al
  // llegar a la porteria, el portero su parada. Cada etapa es un duelo de UN lado
  // (`etapa`: chute, muro, cadena, portero) con su resultado (con la misma `etapa`) y su
  // animacion. Las cuentas son las de siempre (_valorTiro, _valorMuro, _valorCadena,
  // _valorParada y _decidir)
  _empezarChute(tir, distancia, pasador, alto, largo) {
    const por = this.portero(1 - tir.lado), g = this.porteriaRival(tir);
    // con la T, solo sus tiros largos (O-326)
    const oc = this._opcionesChute(tir, !!alto, largo);
    // el defensa en la linea de tiro (el muro de antes): solo para la ayuda y la maquina
    // (la vaselina le pasa por encima si no esta pegado al que chuta, O-309)
    let muro = null, mejor = 3.2;
    for (const r of this.equipo(1 - tir.lado)) {
      if (r.esPortero || r.aturdido > 0) continue;
      const e = this._distanciaALinea(r, tir, g);
      if (e.delante && e.d < mejor) { mejor = e.d; muro = r; }
    }
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "tiro", etapa: "chute", tirador: tir.id, portero: por.id, muro: muro ? muro.id : null, distancia,
      cadena: null, directo: pasador ? pasador.id : null, penalti: false,
      alto: !!alto, muroPegado: !!muro && Math.hypot(muro.x - tir.x, muro.y - tir.y) <= REGLAS.PEGADO,
      lados: { [tir.lado]: { rol: "tiro", jugador: tir.id, opciones: oc.ops } },
      elecciones: {},
    };
    if (oc.largo) this.duelo.largo = this.duelo.lados[tir.lado].largo = true;
    this._previo(this.duelo);          // los numeros antes de elegir (O-306)
    this.estadisticas.tiros[tir.lado]++;
    this.apunta(tir.nombre + (pasador ? " remata de primeras" : oc.largo ? " chuta de lejos" : " chuta") + " a " + Math.round(distancia) + " m", "tiro");
  }
  // la etapa `etapa` (muro, cadena o portero) del tiro en vuelo para j: el balon parado
  // donde le llega y solo elige j. du.tirador es el ultimo que lo ha chutado (el de la
  // cadena, si la hubo) y du.origen el que chuto primero
  _etapaVuelo(etapa, j) {
    const T = this.tiro, por = this.portero(1 - T.lado);
    this.fase = "duelo";
    this.duelo = {
      id: ++this.nDuelos, tipo: "tiro", etapa, tirador: T.ultimo, origen: T.tirador, portero: por.id,
      muro: etapa === "muro" ? j.id : null, cadena: etapa === "cadena" ? j.id : null,
      distancia: T.distancia, directo: null, penalti: false, alto: !!T.alto,
      // el que esta a la salida del tiro para tambien la vaselina (O-309)
      muroPegado: etapa === "muro" && T.recorrido <= REGLAS.PEGADO + REGLAS.VUELO.radio,
      lados: { [j.lado]: { rol: etapa === "portero" ? "porteria" : etapa, jugador: j.id, opciones: this._opciones(j, etapa === "portero" ? "parada" : etapa) } },
      elecciones: {},
    };
    this._previo(this.duelo);
    this.apunta(etapa === "muro" ? "¡" + j.nombre + " se pone delante del tiro!" : etapa === "cadena" ? "¡El tiro le llega a " + j.nombre + "!"
      : "¡El tiro llega a " + j.nombre + "!", "duelo");
  }
  // los numeros de una etapa del tiro en vuelo, como _previo: el tiro como va (ante el
  // portero, con su elemento) y el total de cada boton del que elige
  _previoVuelo(du) {
    const R = Math.round, T = this.tiro;
    if (!T) return;
    const ult = this.jugadores[T.ultimo], por = this.jugadores[du.portero], tu = this._tecUltima();
    const l = Object.values(du.lados)[0], j = this.jugadores[l.jugador];
    if (du.etapa === "muro") {
      du.base = { [ult.lado]: R(T.at), [j.lado]: R(this._valorMuro(j, null, ult, tu)) };
      for (const o of l.opciones) {
        if (o.clave === "nada") continue;
        const t = this._tecnica(j, o.clave);
        o.total = R(this._trasPagar(j.lado, this.coste(j, t), () => this._valorMuro(j, t, ult, tu)));
      }
      return;
    }
    // (el portero aun no ha elegido: el tiro con el elemento de los jugadores, O-328)
    const vale = R(T.at * REGLAS.efectoElemental(ult, tu, por, null));
    du.base = { [ult.lado]: vale, [por.lado]: R(this._valorParada(por, null, ult)) };
    for (const o of l.opciones) {
      const t = this._tecnica(j, o.clave);
      if (du.etapa === "cadena") o.total = t ? R(this._trasPagar(j.lado, this.coste(j, t), () => this._sumaCadena(T.at, j, t, T.kiz) * REGLAS.efectoElemental(j, t, por, null))) : vale;
      else {
        o.total = R(this._trasPagar(por.lado, this.coste(por, t), () => this._valorParada(por, t, ult, o.clave, tu)));
        // si la tecnica del tiro gana a la de esta parada, el tiro trae +20 % (VR,
        // tecnica contra tecnica): lo que traeria contra ella (O-328)
        const contra = R(T.at * REGLAS.efectoElemental(ult, tu, por, t));
        if (contra !== vale) o.contra = contra;
      }
    }
  }
  // la ultima supertecnica del tiro en vuelo (la del que chuto o la de la cadena), o null
  _tecUltima() {
    const T = this.tiro;
    return T && T.tec ? this._tecnica(this.jugadores[T.tec.quien], T.tec.clave) : null;
  }
  // el paso del tiro tal como va, para los numeros de un resultado
  _pasoDelTiro() {
    const T = this.tiro;
    return Object.assign({ quien: T.ultimo, valor: Math.round(T.at) }, T.paso);
  }
  // adonde va el tiro desde donde esta el balon: a un punto de la porteria (el azar del
  // partido) o, si se va fuera, junto a un palo pasada la linea de fondo
  _apuntarTiro() {
    const T = this.tiro, b = this.balon, g = this.porteriaRival(this.jugadores[T.ultimo]), s = Math.sign(g.y) || 1;
    if (T.fuera) { const palo = this.azar() < 0.5 ? -1 : 1; T.tx = palo * (REGLAS.PORTERIA / 2 + 0.6 + this.azar() * 4.5); T.ty = g.y + s * 0.8; }
    else { T.tx = (this.azar() * 2 - 1) * (REGLAS.PORTERIA / 2 - 0.7); T.ty = g.y; }
    T.gy = g.y; T.x0 = b.x; T.y0 = b.y; T.recorrido = 0;
    T.total = Math.max(0.5, Math.hypot(T.tx - b.x, T.ty - b.y));
    b.vx = (T.tx - b.x) / T.total * T.vel; b.vy = (T.ty - b.y) / T.total * T.vel;
    b.pase = null; b.fueraDe = null; b.ultimo = T.lado;
  }
  // lo alto que va el balon del tiro en vuelo (m) por lo que lleva recorrido, para
  // pintarlo (la estela de la pagina hace la misma cuenta). Sin tiro, 0
  alturaTiro() {
    const T = this.tiro, b = this.balon;
    if (!T || !(T.total > 0)) return 0;
    const f = Math.max(0, Math.min(1, Math.hypot(b.x - T.x0, b.y - T.y0) / T.total));
    return 0.35 + Math.sin(Math.PI * f) * (T.h || 0);
  }
  // la primera fraccion (0..1) del tramo (x0,y0)-(x1,y1) en que el balon pasa a menos de r
  // de j, o -1 si no
  _enTramo(j, x0, y0, x1, y1, r) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, fx = j.x - x0, fy = j.y - y0;
    if (fx * fx + fy * fy <= r * r) return 0;
    if (l2 < 1e-9) return -1;
    const t = (fx * dx + fy * dy) / l2, cx = dx * t - fx, cy = dy * t - fy, d2 = cx * cx + cy * cy;
    if (d2 > r * r) return -1;
    const k = t - Math.sqrt((r * r - d2) / l2);
    return k >= 0 && k <= 1 ? k : -1;
  }
  // si j puede encadenar ahora: una supertecnica de cadena que pague (la del espiritu,
  // con el aura puesta; la de varios, con companeros), como en _opciones
  _puedeEncadenar(j) { return this._opciones(j, "cadena").some(o => o.clave[0] === "t" && o.puede); }

  // un paso del balon del tiro en vuelo: avanza hacia su punto; al llegarle a un rival (o
  // a un companero con tiro de cadena) en el camino de este paso, se para ahi y ese elige;
  // al llegar a la porteria (a la altura del portero), elige el portero; si iba fuera, sale
  // por el fondo
  _volarTiro(P) {
    const T = this.tiro, b = this.balon, V = REGLAS.VUELO;
    const x0 = b.x, y0 = b.y, queda = Math.hypot(T.tx - x0, T.ty - y0), paso = Math.min(queda, T.vel * P);
    const ux = queda > 1e-6 ? (T.tx - x0) / queda : 0, uy = queda > 1e-6 ? (T.ty - y0) / queda : 0;
    const x1 = x0 + ux * paso, y1 = y0 + uy * paso;
    // los que le salen al paso en este tramo, el primero antes
    const cand = [];
    for (const j of this.enCampo()) {
      if (j.esPortero || j.aturdido > 0 || T.hechos.includes(j.id)) continue;
      const k = this._enTramo(j, x0, y0, x1, y1, V.radio);
      if (k >= 0) cand.push({ j, k });
    }
    cand.sort((a, c) => a.k - c.k || a.j.id - c.j.id);
    for (const { j, k } of cand) {
      const hecho = T.recorrido + paso * k;
      if (j.lado !== T.lado) {
        // la vaselina va por alto: solo la para el que esta a su salida (pegado al que
        // chuta, O-309); a los demas les pasa por encima ("¡Por encima!" sobre el)
        if (T.vaselina && hecho > REGLAS.PEGADO + V.radio) {
          T.hechos.push(j.id);
          this.apunta("¡El balón pasa por encima de " + j.nombre + "!").ro =
            { que: "porEncima", lado: T.lado, sub: j.nombre, x: Math.round(j.x * 10) / 10, y: Math.round(j.y * 10) / 10 };
          continue;
        }
      } else if (T.vaselina || hecho < V.cadenaDesde || !this._puedeEncadenar(j)) { T.hechos.push(j.id); continue; }
      b.x = x0 + ux * paso * k; b.y = y0 + uy * paso * k;
      T.recorrido = hecho;
      return this._etapaVuelo(j.lado !== T.lado ? "muro" : "cadena", j);
    }
    b.x = x1; b.y = y1; T.recorrido += paso;
    b.vx = ux * T.vel; b.vy = uy * T.vel;
    if (T.fuera) {
      if (Math.abs(b.y) > REGLAS.LARGO / 2 || queda - paso < 0.01) this._tiroLlegaFuera();
      return;
    }
    // el portero: al llegar el balon a su altura (si ha salido mucho, como mucho a 5 m de
    // la linea) o a su lado
    const por = this.portero(1 - T.lado), s = Math.sign(T.gy) || 1;
    const dLinea = (T.gy - b.y) * s, prof = por ? Math.max(0.6, Math.min(5, (T.gy - por.y) * s)) : 0.6;
    if (queda - paso < 0.01 || dLinea <= prof + 0.3 || (por && Math.hypot(por.x - b.x, por.y - b.y) < V.portero)) this._etapaVuelo("portero", por);
  }
  // con el tiro en vuelo, adonde va cada defensa que llega a cortarlo: los VUELO.cortan que
  // antes llegan a su camino van al primer punto al que llegan antes que el balon (a radio de
  // bloqueo). Los de la maquina y los tuyos sin flecha, igual (como iban a por el balon)
  _calcCortes() {
    const T = this.tiro, b = this.balon, V = REGLAS.VUELO, out = {};
    const queda = Math.hypot(T.tx - b.x, T.ty - b.y);
    // la vaselina que ya va por alto no la corta nadie
    if (queda < 0.5 || (T.vaselina && T.recorrido > REGLAS.PEGADO + V.radio)) return out;
    const ux = (T.tx - b.x) / queda, uy = (T.ty - b.y) / queda, cand = [];
    // (la vaselina, solo donde aun va baja)
    const hastaS = T.vaselina ? Math.min(queda, REGLAS.PEGADO + V.radio - T.recorrido) : queda;
    for (const j of this.equipo(1 - T.lado)) {
      if (j.esPortero || j.aturdido > 0 || T.hechos.includes(j.id)) continue;
      const vj = REGLAS.velocidad(j) * this._mulVel(j);
      for (let s = 0; s <= hastaS; s += 1) {
        const qx = b.x + ux * s, qy = b.y + uy * s;
        const tj = Math.max(0, Math.hypot(qx - j.x, qy - j.y) - V.radio * 0.8) / vj;
        if (tj <= s / T.vel) { cand.push({ j, x: qx, y: qy, tj }); break; }
      }
    }
    cand.sort((a, c) => a.tj - c.tj || a.j.id - c.j.id);
    for (const c of cand.slice(0, V.cortan)) out[c.j.id] = { x: c.x, y: c.y };
    return out;
  }

  _resolverEtapa(du) {
    if (du.etapa === "chute") return this._resolverChute(du);
    // sin tiro en vuelo (no deberia pasar): vuelve el juego
    if (!this.tiro) { this.duelo = null; this.fase = "juego"; return; }
    if (du.etapa === "muro") return this._resolverMuroVuelo(du);
    if (du.etapa === "cadena") return this._resolverCadenaVuelo(du);
    return this._resolverPorteroVuelo(du);
  }
  // el chute: paga su supertecnica, su AT (la cuenta del panel, O-306) y el balon sale.
  // Sin supertecnica, desde lejos o con un rival encima, a veces va fuera (O-315): se sabe
  // al chutar y el balon va junto a un palo
  _resolverChute(du) {
    const tir = this.jugadores[du.tirador], V = REGLAS.VUELO;
    const et = du.elecciones[tir.lado] || {};
    const clave = typeof et === "object" ? et.tiro : et;
    let tt = this._tecnica(tir, clave);
    if (tt && this.coste(tir, tt) > tir.pt) tt = null;
    this._gastar(tir, tt);
    // sin supertecnica (o sin tension para ella), el boton: Tirar o Vaselina; con el balon
    // alto, Testarazo o Volea (fuerte pero inestable, como Romper) (O-309)
    const boton = tt ? null : clave === "vaselina" || clave === "volea" ? clave : "normal";
    let at = this._valorTiro(tir, tt, du, boton);
    if (boton === "volea") at = this._potente(at);
    const directo = du.directo !== null && du.directo !== undefined;
    const que = tt ? tt.nombre : du.alto ? (boton === "volea" ? "Volea" : "Testarazo") : (boton === "vaselina" ? "Vaselina" : "Tirar") + (directo ? " de primeras" : "");
    const pf = tt ? 0 : this._probFuera(tir, du, boton, null);
    // la afinidad y el combo ya van en su AT (_valorTiro): se gastan al chutar y la cadena
    // suma con el mismo x (O-328)
    const kiz = this._multTiro(tir.lado), paso = this._pasoTiro(tir, tt, que);
    this._gastarAfinidad(tir.lado);
    this.tiro = {
      id: du.id, lado: tir.lado, tirador: tir.id, ultimo: tir.id, at, tec: tt ? { quien: tir.id, clave } : null, paso, kiz,
      vaselina: boton === "vaselina", alto: !!du.alto, fuera: pf > 0 && this.azar() < pf, distancia: du.distancia, vel: V.vel,
      h: boton === "vaselina" ? V.alto.vaselina : du.alto ? V.alto.cabeza : V.alto.normal, hechos: [tir.id],
    };
    this.soltar();
    this._apuntarTiro();
    tir.respiro = 0.6;
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "tiro", etapa: "chute", final: "vuela", pasos: [this._pasoDelTiro()], tirador: tir.id, chuta: tir.id, critico: null, antes: null };
    this.apunta(tir.nombre + ": " + que + " (" + Math.round(at) + ")", "tiro");
    this._acabarDuelo(0.4);
  }
  // el bloqueo (O-309) con el balon en vuelo: gana el numero mayor salvo un critico. Si
  // gana el muro, lo para (rebota hacia el campo o se va a corner); si pierde, le quita al
  // tiro su numero entero (VR, O-328; antes la mitad) y el balon sigue, salvo que lo desvie
  // a corner (O-315). "Dejar pasar": el balon sigue
  _resolverMuroVuelo(du) {
    const T = this.tiro, muro = this.jugadores[du.muro], ult = this.jugadores[T.ultimo];
    const e = du.elecciones[muro.lado], c = e && typeof e === "object" ? e.muro : e;
    T.hechos.push(muro.id);
    if (c === "nada") {
      this.apunta(muro.nombre + " deja pasar el tiro");
      this.duelo = null; this.fase = "juego";
      return;
    }
    let tm = this._tecnica(muro, c);
    if (tm && this.coste(muro, tm) > muro.pt) tm = null;
    this._gastar(muro, tm);
    // un contra-tiro frena con la mitad de su tiro (VR); un bloqueo, con su DF del muro
    // (con su tecnica, el elemento contra la del tiro, O-328)
    const dm = this._valorMuro(muro, tm, ult, this._tecUltima()), rm = this._decidir(dm, T.at);
    const pt = this._pasoDelTiro();
    // contra: el numero del tiro contra el muro (con un critico del tiro, por encima)
    const pm = { quien: muro.id, que: tm ? tm.nombre : "Bloqueo", valor: rm.a, contra: rm.d, tecnica: !!tm, elemento: tm ? tm.elemento || "" : "" };
    if (rm.critico) { pm.critico = rm.ganaA ? muro.lado : T.lado; pm.antes = rm.antes; this.estadisticas.criticos[pm.critico]++; }
    const pasos = [pt, pm];
    this.nResultado = (this.nResultado || 0) + 1;
    if (rm.ganaA) {
      this.tiro = null;
      this.resultado = { tipo: "tiro", etapa: "muro", final: "bloqueado", pasos, tirador: T.tirador, critico: rm.critico ? muro.lado : null, antes: rm.critico ? rm.antes : null };
      this.apunta("¡" + muro.nombre + " bloquea el tiro!" + (rm.critico ? " (¡crítico!)" : ""), "mal").ro = { que: "bloqueo", lado: muro.lado, sub: muro.nombre };
      if (this.azar() < REGLAS.A_CORNER.bloqueo) this._alFondo(muro, muro.lado);
      else {
        this.soltar();
        this.balon.x = muro.x; this.balon.y = muro.y;
        this.balon.vx = (this.azar() - 0.5) * 8; this.balon.vy = -ult.dir * 6;
        this.balon.ultimo = muro.lado;
      }
      return this._acabarDuelo(2.0);
    }
    const resta = this._restaMuro(dm, T.at, rm.critico);
    T.at -= resta;
    pm.resta = Math.round(resta);          // lo que le quito al tiro, para el panel
    if (this.azar() < REGLAS.TIRO_FUERA.muro) {
      this.tiro = null;
      this.resultado = { tipo: "tiro", etapa: "muro", final: "fuera", pasos, tirador: T.tirador, critico: null, antes: null, desvia: muro.id };
      this.apunta("¡" + muro.nombre + " desvía el tiro de " + ult.nombre + " a córner!", "mal");
      this._alFondo(muro, muro.lado);
      return this._acabarDuelo(2.0);
    }
    this.resultado = { tipo: "tiro", etapa: "muro", final: "vuela", pasos, tirador: T.tirador, critico: null, antes: null };
    this.apunta("¡" + muro.nombre + " frena el tiro! (" + pt.valor + " → " + Math.round(T.at) + ")", "mal");
    this._acabarDuelo(1.2);
  }
  // la cadena (VR): el companero remata el tiro que le llega y los AT se suman; el balon
  // sale de el hacia la porteria (con supertecnica, a puerta) y el gol seria suyo. "No
  // encadenar" (o sin tension para la suya): el balon sigue
  _resolverCadenaVuelo(du) {
    const T = this.tiro, ch = this.jugadores[du.cadena];
    const e = du.elecciones[ch.lado], c = e && typeof e === "object" ? e.cadena : e;
    T.hechos.push(ch.id);
    let tc = this._tecnica(ch, c);
    if (tc && this.coste(ch, tc) > ch.pt) tc = null;
    if (!tc) { this.duelo = null; this.fase = "juego"; return; }
    this._gastar(ch, tc);
    const pt = this._pasoDelTiro();
    // los AT se suman con la afinidad y el combo del chute; con una habilidad real, la mitad (O-328)
    T.at = this._sumaCadena(T.at, ch, tc, T.kiz);
    T.ultimo = ch.id; T.tec = { quien: ch.id, clave: c }; T.id = du.id;
    T.paso = this._pasoTiro(ch, tc, tc.nombre + " (cadena)", true);
    T.fuera = false; T.vaselina = false; T.alto = false; T.h = REGLAS.VUELO.alto.normal;
    this._apuntarTiro();
    ch.respiro = 0.6;
    const pc = this._pasoDelTiro();
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "tiro", etapa: "cadena", final: "vuela", pasos: [pt, pc], tirador: T.tirador, chuta: ch.id, critico: null, antes: null };
    this.apunta("¡" + ch.nombre + " encadena el tiro: " + tc.nombre + "! (" + pc.valor + ")", "tiro");
    this._acabarDuelo(0.4);
  }
  // el portero (O-309) con el balon que le llega: Parar, Despejar (x1,25, pero rebota) o
  // su supertecnica contra el tiro como viene (con su elemento); gana el numero mayor salvo
  // un critico. El gol es del ultimo que chuto (el de la cadena, si la hubo). Con el PP de
  // VR (O-328): el tiro contra lo que le queda al portero mas su tecnica; si para, el PP
  // baja (_pararPP)
  _resolverPorteroVuelo(du) {
    const T = this.tiro, por = this.jugadores[du.portero], ult = this.jugadores[T.ultimo];
    const ed = du.elecciones[por.lado] || {}, tu = this._tecUltima();
    let tp = this._tecnica(por, ed.parada);
    if (tp && this.coste(por, tp) > por.pt) tp = null;
    this._gastar(por, tp);
    // el elemento: jugador contra jugador y tecnica contra tecnica (O-328)
    const at = T.at * REGLAS.efectoElemental(ult, tu, por, tp);
    const despejar = !tp && ed.parada === "despejar";
    const df = this._valorParada(por, tp, ult, despejar ? "despejar" : null, tu);     // la cuenta del panel (O-306)
    const rp = this._decidir(at, df);
    const pt = Object.assign(this._pasoDelTiro(), { valor: Math.round(at), valorFinal: rp.a }, this._ventajaPaso(ult, tu, por, tp));
    const pp = Object.assign({ quien: por.id, que: tp ? tp.nombre : despejar ? "Despejar" : "Parar", valor: rp.d, tecnica: !!tp, elemento: tp ? tp.elemento || "" : "",
      pasivas: Math.round((this.bonusPasivas(por, "kp", false) - 1) * 1000) / 10 }, this._ventajaPaso(por, tp, ult, tu));
    const pasos = [pt, pp];
    const critico = rp.critico ? (rp.ganaA ? ult.lado : por.lado) : null, antes = rp.critico ? rp.antes : null;
    if (critico !== null) { this.estadisticas.criticos[critico]++; pp.critico = critico; pp.antes = antes; this._cargaCritico(critico); }
    const cifras = " (" + rp.a + " contra " + rp.d + (rp.critico ? ", ¡crítico!" : "") + ")";
    const gy = T.gy, tx = T.tx, origen = T.tirador;
    this.tiro = null;
    this.nResultado = (this.nResultado || 0) + 1;
    if (rp.ganaA) {
      this.goles[ult.lado]++;
      // el gol con su minuto de dentro de la parte y quien lo marca (O-306, O-308)
      this.estadisticas.goles.push([ult.lado, this.mitad, this.minuto(), ult.nombre]);
      this.resultado = { tipo: "tiro", etapa: "portero", final: "gol", pasos, tirador: ult.id, critico, antes };
      this.apunta("¡¡GOL de " + ult.nombre + "!!" + cifras, "gol");
      // el balon, dentro de la porteria
      this.soltar();
      Object.assign(this.balon, { x: tx, y: gy + (Math.sign(gy) || 1) * 0.8, vx: 0, vy: 0, pase: null });
      this.fase = "gol"; this.duelo = null; this._retener(3.0, "duelo");     // O-319
      this._sacaDespues = 1 - ult.lado;
      return;
    }
    // parada: el PP baja lo que el tiro pasa de su tecnica y se cansa (VR, O-328; antes
    // perdia hasta un 34 % y nunca bajaba del 25 %). Lo que le queda, en el paso
    this._pararPP(por, at, tp, ult, tu, rp.critico);
    pp.pp = Math.round(por.kp);
    // despeja con Despejar o con una supertecnica de despeje o de puno (O-309)
    const despeje = despejar || (!!tp && /despej|pu.o/i.test(tp.subtipo || ""));
    this.resultado = { tipo: "tiro", etapa: "portero", final: despeje ? "despeje" : "parada", pasos, tirador: origen, critico, antes };
    const ev = this.apunta((despeje ? "¡Despeja " : "¡Para ") + por.nombre + "!" + cifras, "mal");
    if (rp.critico) ev.ro = { que: "critico", lado: por.lado, sub: por.nombre };
    if (despeje) this._rebote(por);
    else {
      this.coger(por); this._aManos(por);
      por.respiro = REGLAS.RESPIRO_SAQUE;   // tras blocar, un respiro para sacar (O-305)
    }
    this._acabarDuelo(2.0);
  }
  // el tiro que iba fuera llega a la linea de fondo (O-315): no juega el portero y, al
  // volver el juego, _fuera pita el saque de puerta (el ultimo que lo toco es el que chuto)
  _tiroLlegaFuera() {
    const T = this.tiro, ult = this.jugadores[T.ultimo], por = this.portero(1 - T.lado), b = this.balon;
    const pt = Object.assign(this._pasoDelTiro(), { valorFinal: Math.round(T.at * REGLAS.efectoElemental(ult, this._tecUltima(), por)) });
    const pasos = [pt, { quien: por.id, que: "Se va fuera", valor: null, tecnica: false, elemento: "", fuera: true }];
    if (Math.abs(b.y) <= REGLAS.LARGO / 2) b.y = T.gy + (Math.sign(T.gy) || 1) * 0.6;
    b.vx = b.vy = 0; b.ultimo = T.lado;
    const origen = T.tirador;
    this.tiro = null;
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "tiro", etapa: "llegada", final: "fuera", pasos, tirador: origen, critico: null, antes: null, desvia: ult.id };
    this.apunta("¡El tiro de " + ult.nombre + " se va fuera!", "mal");
    this.fase = "resultado"; this._retener(1.2, "vuelo");
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
    // el de la T no tiene Tirar: su primer tiro largo que pague (O-326)
    const tiro = pend.largo ? ((pend.opciones || []).find(o => o.puede) || { clave: "normal" }).clave : "normal";
    if (pend.rol === "tiro") return pend.cadena ? { tiro, cadena: "nada" } : { tiro };
    if (pend.rol === "porteria") return pend.muro ? { parada: "normal", muro: "normal" } : { parada: "normal" };
    // el penalti (O-312): al centro y sin supertecnica
    if (pend.rol === "penalti_tiro" || pend.rol === "penalti_parada") return { zona: 1, tecnica: null };
    // el tiro que viaja (O-325): el muro bloquea sin supertecnica; la cadena, no encadena
    if (pend.rol === "cadena") return "nada";
    return "normal";
  }

  // eleccion: en un foco, la clave; en un tiro, {tiro, cadena} o {parada, muro}
  elegir(lado, eleccion) {
    if (this.fase !== "duelo" || !this.duelo || !this.duelo.lados[lado]) return false;
    if (this.duelo.elecciones[lado] !== undefined) return false;
    this.duelo.elecciones[lado] = this._eleccionValida(this.duelo.lados[lado], eleccion);
    if (Object.keys(this.duelo.lados).every(l => this.duelo.elecciones[l] !== undefined)) this._resolver();
    return true;
  }
  // cada clave tiene que estar en SUS opciones del duelo; la que no, vale como la
  // de eleccionSegura. Online puede llegar una de una pantalla vieja o de otro
  // duelo (una Volea sin balon alto, un Despejar en un foco...) (O-309)
  _eleccionValida(pend, e) {
    const hay = (ops, c) => typeof c === "string" && (ops || []).some(o => o.clave === c);
    const segura = this.eleccionSegura(pend);
    if (pend.rol === "tiro") {
      const t = e && typeof e === "object" ? e.tiro : e, fuera = { tiro: hay(pend.opciones, t) ? t : segura.tiro };
      // tras una vaselina no se encadena
      if (pend.cadena) fuera.cadena = fuera.tiro !== "vaselina" && e && hay(pend.cadena.opciones, e.cadena) ? e.cadena : "nada";
      return fuera;
    }
    if (pend.rol === "porteria") {
      const c = e && typeof e === "object" ? e.parada : e, fuera = { parada: hay(pend.opciones, c) ? c : "normal" };
      if (pend.muro) fuera.muro = e && hay(pend.muro.opciones, e.muro) ? e.muro : segura.muro;
      return fuera;
    }
    // el penalti (O-312): la zona 0, 1 o 2 (si no, al centro) y la supertecnica, solo
    // una de las suyas que sirva (las de tiro o las de parada: las del duelo); online
    // puede llegar cualquier cosa. La tension se mira al resolver, como en el tiro
    if (pend.rol === "penalti_tiro" || pend.rol === "penalti_parada") {
      const o = e && typeof e === "object" ? e : {}, z = o.zona;
      const t = typeof o.tecnica === "string" && o.tecnica[0] === "t" && hay(pend.opciones, o.tecnica) ? o.tecnica : null;
      return { zona: z === 0 || z === 1 || z === 2 ? z : 1, tecnica: t };
    }
    // el muro y la cadena del tiro que viaja (O-325): la clave sola o {muro} / {cadena}
    if (pend.rol === "muro" || pend.rol === "cadena") {
      const c = e && typeof e === "object" ? e[pend.rol] : e;
      return hay(pend.opciones, c) ? c : segura;
    }
    return hay(pend.opciones, e) ? e : segura;
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
  // el pase que sale directo de un saque de banda, de puerta o de corner no es
  // fuera de juego (regla 11), si el que saca no se ha ido con el balon (O-305)
  fueraEnPase(receptor, pasador) {
    const s = this._saque;
    if (s && s.id === pasador.id && Math.hypot(pasador.x - s.x, pasador.y - s.y) < 1.5) return false;
    return this._enFueraDeJuego(receptor, pasador);
  }
  _pitarFueraDeJuego(j) {
    const r = this.equipo(1 - j.lado).filter(o => !o.esPortero)
      .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y))[0];
    // el rotulo, del color del que se queda el balon (O-306)
    this.apunta("Fuera de juego de " + j.nombre, "mal").ro = { que: "fuera", lado: r.lado, sub: j.nombre };
    // al equipo al que le pitan el fuera de juego a favor, +10 de tension (VR) (O-310)
    this._tension(r.lado, REGLAS.TENSION_FUERA_JUEGO);
    r.x = j.x; r.y = j.y - j.dir * 1;
    this.coger(r); r.respiro = 2.5;
    for (const o of this.jugadores) o.ruta = [];
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "fuera", quien: j.id };
    this.fase = "resultado"; this._retener(1.6, "fuera");     // O-319
    this._saquePendiente = { tipo: "falta", lado: r.lado };     // tiro libre para el rival, tras su [Jugar] (O-308)
  }

  // --- las esperas: pausa, saque y descanso (O-308) --------------------------------
  // El juego sigue cuando los dos lados han pulsado (Seguir, Jugar o "Segunda
  // parte"), sin limite de tiempo (Aaron, O-307). Los lados que no lleva una
  // persona (la maquina, la demo, las pruebas) se dan por listos en el primer
  // paso de la espera: antes tienen un pensar() (la maquina hace sus cambios en
  // el descanso). Cada espera lleva su numero (va en la foto como `ne`)
  _esperar(fase) {
    this.fase = fase;
    this.listos = [false, false];
    this.nEspera++;
  }
  // antes de CADA saque (centro, banda, corner, puerta, falta, fuera de juego y
  // penalti): [Jugar] y [Menu] con los jugadores colocados. Si la parte ya pasaba
  // de las 15:00, aqui se acaba (salvo el penalti, que se tira antes)
  _esperarSaque(tipo, lado, tirador) {
    if (this.prolonga && tipo !== "penalti") return this._finDeParte();
    this.esperaSaque = { tipo, lado };
    if (tirador !== undefined && tirador !== null) this.esperaSaque.tirador = tirador;
    // los cambios elegidos en la pausa entran ahora, con el balon parado
    this._aplicarCambiosPendientes();
    // sin la opcion `esperas` (pruebas viejas y medidas) se saca en el acto
    if (!this.esperas) return this._reanudar();
    // el balon, a los pies del que saca: se quedaba donde salio del campo y en
    // la espera se veia alli (el de centro ya esta en su sitio)
    const d = this.dueno();
    if (d && tipo === "penalti") {
      // en el penalti, el que tira detras del punto mirando a la porteria y el balon
      // en el punto (a sus pies salia hacia donde iba corriendo) (O-313)
      const g = this.porteriaRival(d);
      d.x = 0; d.y = g.y - d.dir * 11.7; d.mx = 0; d.my = d.dir;
      this.balon.x = 0; this.balon.y = g.y - d.dir * 11;
    } else if (d && tipo !== "centro") { const c = this._dentro(d.x + d.mx * 0.7, d.y + d.my * 0.7); this.balon.x = c.x; this.balon.y = c.y; }
    // los que ya estan donde no se les deja colocar (O-313), a un sitio que valga; y
    // lo que se coloco en la espera anterior ya no cuenta
    for (const j of this.jugadores) j.colocado = null;
    // en la espera solo se coloca: sin las flechas, la presion ni el pase marcado de
    // antes de la parada (las flechas se dibujan tras pulsar Jugar y el que saca saca
    // entonces) (O-324)
    for (const j of this.jugadores) { j.ruta = []; j.presiona = null; }
    this.paseMarcado = [null, null];
    this.porSacar = null;
    this._apartarDelSaque();
    this._esperar("saque");
  }
  // se sale de una pausa o de la espera de un saque: vuelve el juego y salen los
  // pases (o tiros) marcados, si el que los marco sigue con el balon. Tras la
  // espera del penalti, el penalti
  _reanudar() {
    const sq = this.esperaSaque;
    this.pausa = null; this.esperaSaque = null; this.listos = [false, false];
    this.fase = "juego";
    if (sq) {
      // tras pulsar Jugar nadie se mueve hasta que el que saca pone el balon en juego
      // (el pase, el tiro, el despeje o su carrera): solo se dibujan las flechas, y la
      // maquina saca tras un momento (Aaron, O-322 punto 2; O-324). Sin las esperas
      // (pruebas viejas y medidas) se saca en el acto, como antes
      const d = this.dueno();
      if (this.esperas && sq.tipo !== "penalti" && d) this.porSacar = { id: d.id, lado: d.lado, tipo: sq.tipo, t: 0 };
      else this._quietosAlSacar(d);
    }
    if (sq && sq.tipo === "penalti") {
      this.paseMarcado = [null, null];
      const t = this.jugadores[sq.tirador];
      // el penalti del partido, como los de la tanda: zona y supertecnica (O-312)
      if (t && !t.expulsado) return this._empezarPenalti(t, false);
    }
    for (const l of [0, 1]) {
      const o = this.paseMarcado[l], j = o && this.jugadores[o.de];
      this.paseMarcado[l] = null;
      if (j && j.conBalon) this.ordenar(o);
    }
  }
  // j saca (O-324): si es el que saca y aun no lo habia hecho, el balon ya esta en juego.
  // Va antes de soltar el balon: el pase al colocado lo mira (_pasar)
  _sacar(j) {
    if (!this.porSacar || !j || j.id !== this.porSacar.id) return;
    this.porSacar = null;
    this._quietosAlSacar(this.dueno());
  }
  // los colocados en el saque se quedan en su sitio hasta que alguien coja el balon o
  // el que saca se vaya con el, como mucho COLOCADO_SEGUNDOS desde que se saca (O-313;
  // desde O-324 cuenta al sacar, no al pulsar Jugar)
  _quietosAlSacar(d) {
    this._finColocados = this.segundosDeJuego() + REGLAS.COLOCADO_SEGUNDOS;
    this._sacador = d ? { id: d.id, x: d.x, y: d.y } : null;
  }
  // los dos listos: del descanso, a la parte siguiente; si no, vuelve el juego
  _salirEspera() {
    if (this.fase === "descanso") this._siguienteParte();
    // tras el tiempo de invocacion, el juego sigue donde estaba (O-327)
    else if (this.fase === "invocacion") { this.tiempoInvocar = null; this.listos = [false, false]; this.fase = "juego"; }
    else this._reanudar();
  }

  // --- colocar a los jugadores en los saques (O-313; Aaron, O-307 punto 14) --------
  // En la espera de un saque cada uno pone a los suyos donde quiera, arrastrandolos
  // (no es una ruta: se ponen ahi), salvo demasiado cerca del balon. Al volver el
  // juego se quedan en su sitio hasta que alguien coge el balon (si no, se iban
  // corriendo a su zona en cuanto se sacaba y colocarlos no servia de nada).
  // Lo que no puede pisar `lado` en esta espera, o null si nada: los rivales del que
  // saca, el circulo alrededor del balon (la distancia de cada saque, como en la vida
  // real: 2 m en la banda, 9,15 en la falta, el corner y el de centro; O-315); en el
  // saque de centro, ademas, cada equipo en su campo; en el penalti, todos fuera del
  // area y del semicirculo, y en el saque de puerta, los rivales fuera del area (y: la
  // linea de gol, s: hacia el campo; punto: el de penalti, null en el de puerta). Lo
  // pinta tambien la pantalla
  zonaSaque(lado) {
    const sq = this.esperaSaque;
    if (!sq) return null;
    if (sq.tipo === "penalti") {
      const t = this.jugadores[sq.tirador];
      if (!t) return null;
      const g = this.porteriaRival(t);
      return { circulo: null, campo: false, penalti: { y: g.y, s: -t.dir, punto: { x: 0, y: g.y - t.dir * 11 } } };
    }
    const rival = lado !== sq.lado, R = REGLAS.colocarLejos(sq.tipo);
    if (sq.tipo === "centro") return { circulo: rival ? { x: 0, y: 0, r: R } : null, campo: true, penalti: null };
    if (sq.tipo === "puerta") {
      // el area del que saca: su linea de gol y hacia el campo
      const dir = (this.equipo(sq.lado)[0] || { dir: 1 }).dir;
      return rival ? { circulo: null, campo: false, penalti: { y: -REGLAS.LARGO / 2 * dir, s: dir, punto: null } } : null;
    }
    return rival ? { circulo: { x: this.balon.x, y: this.balon.y, r: R }, campo: false, penalti: null } : null;
  }
  // por que j no puede estar en (x, y) en esta espera, o null si puede
  _fueraDeZona(j, x, y) {
    const z = this.zonaSaque(j.lado);
    if (!z) return null;
    if (z.campo && y * j.dir > -0.5) return "En el saque de centro, cada equipo en su campo";
    const c = z.circulo, pe = z.penalti;
    if (c && Math.hypot(x - c.x, y - c.y) < c.r) return "Muy cerca del balón";
    if (pe && (y - pe.y) * pe.s < REGLAS.AREA_Y && Math.abs(x) < REGLAS.AREA_X) return pe.punto ? "Muy cerca del balón" : "En el saque de puerta, fuera del área";
    if (pe && pe.punto && Math.hypot(x - pe.punto.x, y - pe.punto.y) < REGLAS.COLOCAR_LEJOS.penalti) return "Muy cerca del balón";
    return null;
  }
  // el que no se mueve en la espera (por que), o null: el que saca (lleva el balon) y,
  // en el penalti, el portero (en su linea)
  _fijoEnSaque(j) {
    const sq = this.esperaSaque;
    if (!sq) return "";
    if (this.balon.dueno === j.id) return j.nombre + " saca: no se le puede mover";
    if (sq.tipo === "penalti" && j.lado !== sq.lado && j.esPortero) return "En el penalti el portero se queda en su línea";
    return null;
  }
  // si se puede arrastrar a j ahora (la pagina: arrastrarle lo coloca)
  colocable(j) { return !!j && !j.expulsado && this.fase === "saque" && this._fijoEnSaque(j) === null; }
  // si j se puede poner en (x, y) ahora: {si, porque} y, si si, el punto (dentro del campo)
  puedeColocar(j, x, y) {
    const no = porque => ({ si: false, porque });
    if (!j || j.expulsado) return no("");
    if (this.fase !== "saque" || !this.esperaSaque) return no("Solo se coloca a los jugadores antes de un saque");
    const fijo = this._fijoEnSaque(j);
    if (fijo !== null) return no(fijo);
    if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) return no("");
    const c = this._dentro(x, y), porque = this._fueraDeZona(j, c.x, c.y);
    return porque ? no(porque) : { si: true, porque: "", x: c.x, y: c.y };
  }
  // la orden "colocar": j pasa a (x, y) en el acto, sin ruta y mirando al balon. Si
  // ahi no puede ("Muy cerca del balon"), no se mueve y se le dice solo a su equipo
  colocar(id, x, y, lado) {
    const j = this.jugadores[id];
    if (!j || (lado !== undefined && lado !== null && lado !== j.lado)) return false;
    const r = this.puedeColocar(j, x, y);
    if (!r.si) {
      if (r.porque && this.fase === "saque") this.apunta(r.porque, "aviso", j.lado).privado = true;
      return false;
    }
    j.x = r.x; j.y = r.y; j.ruta = []; j.presiona = null;
    j.colocado = { x: r.x, y: r.y };
    const dx = this.balon.x - j.x, dy = this.balon.y - j.y, d = Math.hypot(dx, dy);
    if (d > 0.1) { j.mx = dx / d; j.my = dy / d; }
    return true;
  }
  // el sitio que vale mas cerca de (x, y) para j en esta espera, o null: el mismo
  // punto si vale; si no, a su campo, fuera del circulo (por el radio o alrededor) o
  // fuera del area y del semicirculo del penalti. Lo usan el motor al empezar la
  // espera y la maquina
  sitioValido(j, x, y) {
    const c0 = this._dentro(x, y);
    if (!this._fueraDeZona(j, c0.x, c0.y)) return c0;
    const z = this.zonaSaque(j.lado), cand = [];
    let bx = c0.x, by = c0.y;
    if (z.campo && by * j.dir > -0.5) by = -j.dir;
    cand.push({ x: bx, y: by });
    const c = z.circulo, pe = z.penalti;
    if (c) {
      // el radio de este saque (O-315), un poco mas
      const R = c.r + 0.4, dx = bx - c.x, dy = by - c.y, d = Math.hypot(dx, dy);
      if (d > 0.01) cand.push({ x: c.x + dx / d * R, y: c.y + dy / d * R });
      for (let k = 0; k < 24; k++) cand.push({ x: c.x + Math.cos(k * Math.PI / 12) * R, y: c.y + Math.sin(k * Math.PI / 12) * R });
    }
    if (pe) {
      // fuera del area y, en el penalti, del semicirculo (en el saque de puerta no hay)
      const R = REGLAS.COLOCAR_LEJOS.penalti + 0.4;
      const fuera = pe.punto ? Math.max(REGLAS.AREA_Y + 0.6, 11 + Math.sqrt(Math.max(0, R * R - bx * bx))) : REGLAS.AREA_Y + 0.6;
      cand.push({ x: bx, y: pe.y + pe.s * fuera });
      for (const s of [-1, 1]) cand.push({ x: s * (REGLAS.AREA_X + 0.6), y: by });
    }
    let mejor = null, md = Infinity;
    for (const q of cand) {
      const d = this._dentro(q.x, q.y);
      if (Math.abs(d.x - q.x) > 1e-9 || Math.abs(d.y - q.y) > 1e-9 || this._fueraDeZona(j, d.x, d.y)) continue;
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < md) { md = dd; mejor = d; }
    }
    return mejor;
  }
  // al empezar la espera de un saque, los que ya estan donde no se les dejaria
  // colocar (los rivales cerca del balon, o en el area del penalti) van al sitio que
  // vale mas cerca: si no, uno se quedaba a 3 m del que saca de banda y al otro no
  // le dejaban poner al suyo alli
  _apartarDelSaque() {
    for (const j of this.enCampo()) {
      if (this._fijoEnSaque(j) !== null || !this._fueraDeZona(j, j.x, j.y)) continue;
      const c = this.sitioValido(j, j.x, j.y);
      if (c) { j.x = c.x; j.y = c.y; j.ruta = []; }
    }
  }

  // --- la pausa y presionar de 3DS (O-294) ---------------------------------------
  // Sin limite de veces ni de tiempo (O-308; con PAUSAS_POR_PARTE o PAUSA_MAX
  // en REGLAS volveria a contar)
  pausar(lado) {
    if (this.fase !== "juego" || (lado !== 0 && lado !== 1)) return false;
    if (REGLAS.PAUSAS_POR_PARTE > 0) {
      if (this.pausasQuedan[lado] <= 0) return false;
      this.pausasQuedan[lado]--;
    }
    this.pausa = { lado, queda: REGLAS.PAUSA_MAX };
    this._esperar("pausa");
    this.apunta("Pausa de " + this.nombres[lado] + ": rutas, pase y cambios", "tactica");
    return true;
  }
  // Seguir, Jugar o "Segunda parte": en una espera, ese lado ya esta; con los dos
  // se sigue. `espera`: si es de otra espera (un clic o una orden online que
  // llega tarde) no cuenta (O-308)
  seguir(lado, espera) {
    // (y el tiempo de invocacion: Seguir sin invocar, O-327)
    if (!this.parado() && this.fase !== "descanso" && this.fase !== "invocacion") return false;
    if (lado !== 0 && lado !== 1) return false;
    if (espera !== undefined && espera !== null && espera !== this.nEspera) return false;
    this.listos[lado] = true;
    if (this.listos[0] && this.listos[1]) this._salirEspera();
    return true;
  }
  // tocar al rival con balon: los dos tuyos mas cerca van a por el (3DS)
  presionar(lado, objetivo) {
    // en la espera de un saque solo se coloca; tras pulsar Jugar, si (O-324)
    if (this.fase === "saque") return false;
    const r = this.jugadores[objetivo], d = this.dueno();
    if (!r || !d || d !== r || r.lado === lado) return false;
    const mios = this.equipo(lado).filter(j => !j.esPortero && j.aturdido <= 0)
      .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y)).slice(0, 2);
    for (const j of mios) { j.presiona = r.id; j.ruta = []; j.colocado = null; }     // el colocado deja su sitio (O-313)
    return mios.length > 0;
  }

  // --- espiritus (O-295) e hipertecnicas con la hiperbarra (O-310) -----------------
  // `aura`: hasta cuando (s de juego) tiene la hiper puesta
  conAura(j) { return j.aura > this.segundosDeJuego(); }
  hiperActivas(lado) { return this.equipo(lado).filter(j => this.conAura(j)).length; }
  // si j puede invocar ya: {si, porque}. porque: lo que dice el boton cuando no
  // (VR: una hiper por jugador, 2 del equipo a la vez y 15 s entre una y otra)
  puedeHiper(j) {
    const no = porque => ({ si: false, porque });
    if (!j || !j.espiritu) return no("sin espíritu");
    if (j.expulsado) return no("expulsado");
    const ahora = this.segundosDeJuego(), l = j.lado;
    // en la tanda el reloj esta parado: la hiper vale para ese penalti (O-312)
    if (this.conAura(j)) return no(this.tanda ? "activo en este penalti" : "activo " + Math.ceil(j.aura - ahora) + " s");
    if (ahora < j.auraLista) return no("vuelve en " + Math.ceil(j.auraLista - ahora) + " s");
    if (this.hiper[l] < REGLAS.HIPER_COSTE) return no("faltan " + Math.ceil(REGLAS.HIPER_COSTE - this.hiper[l]) + " de hiperbarra");
    if (this.hiperActivas(l) >= REGLAS.HIPER_ACTIVAS_MAX) return no("ya hay " + REGLAS.HIPER_ACTIVAS_MAX + " activos");
    if (ahora < this.hiperBloqueo[l]) return no("espera " + Math.ceil(this.hiperBloqueo[l] - ahora) + " s (acaba de invocar un compañero)");
    return { si: true, porque: "" };
  }
  // invocar cuando quieras, sin parar el juego (Aaron, O-307 punto 10): en juego, en
  // la pausa y en la espera de un saque. En un duelo, solo el que chuta y el portero
  // de un tiro que aun no han elegido: no gana solo (en VR la victoria automatica es
  // de los focos), pero se rehacen sus opciones y sus numeros (la supertecnica del
  // espiritu, la parada +15 %...) y `v` sube para que la pagina repinte el panel.
  // En un foco se invoca con el boton de la hiper (_resolverFoco)
  invocar(id) {
    const j = this.jugadores[id];
    if (!j || !this.puedeHiper(j).si) return false;
    // en el tiempo de invocacion (O-327): uno por lado y parada; al invocar ya esta listo
    // (en Galaxy el panel se cierra) y, con los dos listos, sigue el juego
    if (this.fase === "invocacion") {
      const ti = this.tiempoInvocar;
      if (!ti || ti.hechos[j.lado] >= 0 || this.listos[j.lado]) return false;
      this._activarHiper(j);
      ti.hechos[j.lado] = j.id;
      this.listos[j.lado] = true;
      if (this.listos[0] && this.listos[1]) this._salirEspera();
      return true;
    }
    if (this.fase === "duelo") {
      const du = this.duelo, yo = du && du.lados[j.lado];
      if (!du || (du.tipo !== "tiro" && du.tipo !== "penalti") || !yo || yo.jugador !== j.id || du.elecciones[j.lado] !== undefined) return false;
      this._activarHiper(j);
      this._rehacerTiro(du, j.lado);
      return true;
    }
    if (this.fase !== "juego" && !this.parado()) return false;
    // con el balon en juego se invoca en el tiempo de invocacion, no sin parar (Aaron,
    // O-322 punto 5; O-327). En la pausa y en la espera del saque el juego ya esta parado:
    // alli si, como antes (uno por equipo y parada: el bloqueo de 15 s no corre parado)
    if (this.fase === "juego" && this.conTiempoInvocar) return false;
    this._activarHiper(j);
    return true;
  }

  // --- el tiempo de invocacion (O-327; Aaron, O-322 punto 5) ------------------------
  // El boton de los espiritus PARA el juego, como en Galaxy y CS (guia 8.8: el panel de
  // auras sube y es la ventana para responder). En la parada invocan los dos, uno cada
  // uno (la maquina tambien decide); como mucho REGLAS.HIPER_ACTIVAS_MAX puestas por
  // equipo. Tras cada parada el boton vuelve a los TIEMPO_INVOCAR.recarga s de juego,
  // para los dos (los dos han tenido su ventana). Si `lado` puede pedirla ya: {si, porque}
  puedeTiempoInvocar(lado) {
    const no = porque => ({ si: false, porque });
    if (!this.conTiempoInvocar) return no("ahora no");
    if (this.fase !== "juego" || this.tanda) return no("con el balón en juego");
    const ahora = this.segundosDeJuego();
    if (ahora < this.invocarLista[lado]) return no("vuelve en " + Math.ceil(this.invocarLista[lado] - ahora) + " s");
    const con = this.equipo(lado).filter(j => j.espiritu);
    if (!con.length) return no("nadie de tu equipo tiene espíritu");
    if (con.some(j => this.puedeHiper(j).si)) return { si: true, porque: "" };
    return no(this.puedeHiper(con.find(j => !this.conAura(j)) || con[0]).porque);
  }
  pedirInvocacion(lado) {
    if ((lado !== 0 && lado !== 1) || !this.puedeTiempoInvocar(lado).si) return false;
    const ahora = this.segundosDeJuego();
    this.tiempoInvocar = { lado, hechos: [-1, -1], t: 0 };
    this.invocarLista = [ahora + REGLAS.TIEMPO_INVOCAR.recarga, ahora + REGLAS.TIEMPO_INVOCAR.recarga];
    this._esperar("invocacion");
    this.apunta("¡Tiempo de invocación! (" + this.nombres[lado] + ")", "tactica");
    return true;
  }

  // --- en lo que se convierte con la hiper puesta (O-327; Aaron, O-322 punto 6) -------
  // Como en VR: con un MODO es otro personaje entero mientras dura (Thaddeus -> Byron
  // Love: su nombre, su cara y modelo, su elemento, sus stats y sus tecnicas; partido.py
  // las saca de modos.csv, O-225) y al acabar vuelve; la armadura y el mixi max cambian su
  // modelo (lo demas son sus %, O-310); el keshin y el alma salen detras de el (la
  // pagina). Las pasivas son las del jugador (las del espiritu ya cuentan solo con la
  // hiper puesta). `modelo`: el modelo 3D que se ve (null: el de su cara)
  _prepararForma(j, esp) {
    j.modelo = null; j.transformado = false; j.propio = null;
    j.formaHiper = null; j.modeloHiper = null; j.keshinHiper = null; j.auraHiper = null;
    if (!esp) return;
    const f = esp.forma;
    if (f && (f.nombre || f.cara)) {
      const st = Array.isArray(f.stats) && f.stats.length === 7 ? f.stats.map(Number) : null;
      // sus tecnicas como las del jugador, y las ✦ del espiritu (si las hay) se quedan
      const tecs = (f.tecnicas || []).filter(t => t.tipo && t.tipo !== "Hipertecnica" && t.poder > 0);
      j.formaHiper = { nombre: f.nombre || j.nombre, cara: f.cara || j.cara, elemento: f.elemento || j.elemento, stats: st,
        tecnicas: tecs.length ? tecs.concat(j.tecnicas.filter(t => t.espiritu)) : null, modelo: f.modelo || f.cara || null };
    }
    if (esp.modelo) j.modeloHiper = String(esp.modelo);
    if (esp.keshin) j.keshinHiper = String(esp.keshin);
    if (esp.aura) j.auraHiper = String(esp.aura);
  }
  // pone (si) o quita la forma de j. callado: sin apuntarlo (el invitado, la cuenta "como
  // si ya tuviera la hiper puesta")
  _transformar(j, si, callado) {
    const h = j.formaHiper;
    if (!!j.transformado === !!si || !(h || j.modeloHiper)) return;
    // el portero que cambia de stats conserva la parte de su KP que le queda
    const parte = j.esPortero && j.kpMax > 0 ? j.kp / j.kpMax : null;
    if (si) {
      j.propio = { nombre: j.nombre, cara: j.cara, elemento: j.elemento, stats: j.stats, tecnicas: j.tecnicas };
      if (h) {
        j.nombre = h.nombre; j.cara = h.cara; j.elemento = h.elemento;
        if (h.stats) j.stats = h.stats.slice();
        if (h.tecnicas) j.tecnicas = h.tecnicas;
      }
      j.modelo = h ? h.modelo : j.modeloHiper;
    } else {
      Object.assign(j, j.propio || {});
      j.propio = null; j.modelo = null;
    }
    j.transformado = !!si;
    if (parte !== null && h && h.stats) { j.kpMax = REGLAS.kpBase(j); j.kp = j.kpMax * parte; }
    if (callado || !h) return;
    const nombre = j.propio ? j.propio.nombre : j.nombre, igual = nombre === this._nombreForma(j);
    if (si) this.apunta(igual ? "¡" + nombre + " cambia de forma! (" + j.espiritu.nombre + ")" : "¡" + nombre + " se convierte en " + j.nombre + "! (" + j.espiritu.nombre + ")", "tactica");
    else this.apunta(igual ? j.nombre + " vuelve a su forma" : this._nombreForma(j) + " vuelve a ser " + j.nombre, "tactica");
  }
  _nombreForma(j) { return (j.formaHiper && j.formaHiper.nombre) || j.nombre; }
  // cada uno como le toca por su hiper: con ella puesta, transformado; sin ella, el suyo.
  // En cada paso (al acabarse la hiper vuelve), al invocar y en el invitado con la foto
  _formas(callado) {
    for (const j of this.jugadores) if (j.formaHiper || j.modeloHiper) this._transformar(j, this.conAura(j), callado);
  }
  // paga 100 de hiperbarra (nada de tension), la hiper dura lo de su familia y
  // luego se recarga, y nadie mas del equipo invoca en HIPER_BLOQUEO s. El rotulo
  // pequeno de su familia ("¡Invocación!", "¡Miximax Trans!", "¡Armadura!"...);
  // enFoco: la que gana un foco, que ya lleva el suyo ("¡Hipertécnica!")
  _activarHiper(j, enFoco) {
    const T = REGLAS.HIPER_TIPOS[j.hiperTipo] || REGLAS.HIPER_TIPOS.keshin, ahora = this.segundosDeJuego(), l = j.lado;
    const antes = this.hiper[l];
    this.hiper[l] = Math.max(0, antes - REGLAS.HIPER_COSTE);
    j.aura = ahora + T.dura;
    j.auraLista = j.aura + T.recarga;
    this.hiperBloqueo[l] = ahora + REGLAS.HIPER_BLOQUEO;
    this.estadisticas.hiper[l]++;
    // el portero: su PP sube un % de su maximo y se queda (VR: la unica recuperacion; antes
    // solo mientras duraba) (O-328)
    const pp = this._ppHiper(j);
    if (pp > 0) j.kp += pp;
    const e = this.apunta("¡" + j.nombre + " invoca a " + j.espiritu.nombre + "! (hiperbarra " + Math.round(antes) + " → " + Math.round(this.hiper[l]) + ")"
      + (pp > 0 ? " PP +" + Math.round(pp) : ""), "tactica");
    if (!enFoco) e.ro = { que: T.rotulo, lado: l, sub: j.nombre + " · " + j.espiritu.nombre, jugador: j.id };
    // y se convierte en lo que toque (el modo, otro personaje entero) (O-327)
    this._transformar(j, true);
    return e;
  }
  // tras invocar dentro de un tiro: las opciones de los dos lados (el tiro, la
  // cadena, la parada y el muro) y sus numeros, otra vez. `v` cuenta las veces y
  // `vLado` dice quien invoco, para que la pagina avise al otro
  _rehacerTiro(du, lado) {
    const tir = this.jugadores[du.tirador], por = this.jugadores[du.portero];
    // una etapa del tiro en vuelo (O-325): las opciones del unico que elige y sus numeros
    if (du.etapa && du.etapa !== "chute") {
      const l = Object.values(du.lados)[0];
      l.opciones = this._opciones(this.jugadores[l.jugador], du.etapa === "portero" ? "parada" : du.etapa);
      this._previo(du);
      du.v = (du.v || 0) + 1; du.vLado = lado;
      return;
    }
    const lt = du.lados[tir.lado], lp = du.lados[por.lado];
    // en un penalti, sus opciones (las supertecnicas y sin ella) (O-312)
    if (du.tipo === "penalti") {
      lt.opciones = this._opcionesPenalti(tir, "tiro");
      lp.opciones = this._opcionesPenalti(por, "parada");
      this._previo(du);
      du.v = (du.v || 0) + 1; du.vLado = lado;
      return;
    }
    // (el de la T, sus tiros largos, O-326)
    const oc = this._opcionesChute(tir, !!du.alto, !!lt.largo);
    lt.opciones = oc.ops;
    if (lt.largo && !oc.largo) { delete lt.largo; delete du.largo; }
    if (lt.cadena) lt.cadena.opciones = this._opciones(this.jugadores[lt.cadena.jugador], "cadena");
    // (en el chute del tiro que viaja solo esta el que chuta, O-325)
    if (lp) lp.opciones = this._opciones(por, "parada");
    if (lp && lp.muro) lp.muro.opciones = this._opciones(this.jugadores[lp.muro.jugador], "muro");
    this._previo(du);
    du.v = (du.v || 0) + 1; du.vLado = lado;
  }
  // la cuenta de j como si ya tuviera la hiper puesta (el total del boton de la
  // hiper y la hiper contra hiper): se pone un momento y se quita, como _trasPagar
  _conHiperSimulada(j, fn) {
    if (this.conAura(j)) return fn();
    const antes = j.aura;
    j.aura = this.segundosDeJuego() + 1;
    // con su forma, si la tiene (un modo cuenta con los stats de la forma, O-327)
    this._transformar(j, true, true);
    try { return fn(); } finally { j.aura = antes; this._transformar(j, false, true); }
  }
  // lo que suma la hiper puesta a un valor de duelo (O-310): el % de su familia a
  // AT y DF (el totem, +20 % por foco ganado, hasta 75 %) y lo propio de dos
  // despertares (Guardian ferreo: DF +20 % y muro +30 %). Va fuera del tope de las
  // pasivas. que: "foco" | "disputa" | "tiro" | "muro"; defiende: es su DF
  _factorHiper(j, que, defiende) {
    if (!this.conAura(j)) return 1;
    const T = REGLAS.HIPER_TIPOS[j.hiperTipo];
    if (!T) return 1;
    let pct = T.atdf;
    if (T.porFoco) pct = Math.min(T.atdfTope || pct, pct + T.porFoco * (j.totem || 0));
    const pr = REGLAS.HIPER_PROPIOS[j.espiritu && j.espiritu.id] || {};
    if (defiende && pr.df) pct += pr.df;
    if (que === "muro" && pr.muro) pct += pr.muro;
    return 1 + pct / 100;
  }
  // lo que suman los refuerzos de los cambios (O-315) al AT y DF de j: los que no han
  // acabado, sumados. Como la hiper, en focos, disputas, tiro, cadena y muro (no en la
  // parada del portero, O-304) y fuera del tope de las pasivas
  _factorCambio(j) {
    const ahora = this.segundosDeJuego();
    let pct = 0;
    for (const r of j.refuerzos || []) if (r.hasta > ahora) pct += r.pct;
    return 1 + pct / 100;
  }
  // el refuerzo de j que dura ahora: {pct, queda (s de juego que le quedan al que mas
  // dura), entro (si es el suyo de entrar)}, o null. Para la ficha (O-315)
  refuerzo(j) {
    const ahora = this.segundosDeJuego(), activos = (j.refuerzos || []).filter(r => r.hasta > ahora);
    if (!activos.length) return null;
    return { pct: activos.reduce((s, r) => s + r.pct, 0), queda: Math.max(...activos.map(r => r.hasta)) - ahora,
      entro: activos.some(r => r.pct === REGLAS.CAMBIO_REFUERZO.entra) };
  }
  // lo que suma al PP del portero su hiper al invocar: un % de su PP maximo (VR: +15 %; con
  // Determinacion de portero, +20 % mas). Se suma una vez y se queda (O-328)
  _ppHiper(por) {
    if (!por.esPortero) return 0;
    const T = REGLAS.HIPER_TIPOS[por.hiperTipo] || {}, pr = REGLAS.HIPER_PROPIOS[por.espiritu && por.espiritu.id] || {};
    return (por.kpMax || 0) * ((T.pp || 0) + (pr.pp || 0)) / 100;
  }

  // --- tacticas (O-290) ---------------------------------------------------------
  usarTactica(lado, k) {
    const t = (this.tacticas[lado] || [])[k];
    // una tactica que el partido aun no sabe aplicar no se activa: no bloquea a
    // las otras ni gasta la recarga (O-304)
    if (!t || !(t.efectos || []).length || this.tacticaActiva[lado]) return false;
    // tambien en la pausa y en la espera de un saque, sin parar el juego (Aaron,
    // O-307 punto 10; en el saque es el "Tactica" del Menu de 3DS), no en un duelo.
    // Las que quitan el balon o aturden, solo con el balon en juego: en una espera
    // se lo quitarian al que va a sacar. Su tiempo cuenta al volver el juego (O-310)
    if (this.fase !== "juego" && !(this.parado() && !this.tacticaSoloEnJuego(t))) return false;
    // antes de que se saque el balon no esta en juego (O-324)
    if (this.porSacar && this.tacticaSoloEnJuego(t)) return false;
    const ahora = this.segundosDeJuego();
    if (ahora < this.tacticaLista[lado][k]) return false;
    this.tacticaActiva[lado] = { k, hasta: ahora + (t.duracion || 8) };
    this.tacticaLista[lado][k] = ahora + (t.recarga || 90);
    this.apunta("¡Tactica de " + this.nombres[lado] + ": " + t.nombre + "!", "tactica").ro = { que: "tactica", lado, sub: t.nombre };   // O-306
    for (const e of t.efectos || []) {
      if (e.especial === "robo") {
        const d = this.dueno();
        if (d && d.lado !== lado) {
          const mio = this.equipo(lado).filter(j => !j.esPortero).sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
          d.aturdido = REGLAS.ATURDIDO;
          this.coger(mio); mio.x = d.x + 1; mio.y = d.y;
          this._robo(mio);     // (y la carga de Contraataque, O-328)
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
  tacticaSoloEnJuego(t) { return (t.efectos || []).some(e => e.especial === "robo" || e.especial === "aturde"); }
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
    // con la hiper puesta, el % de su familia al poder de sus supertecnicas
    // (armadura +50 %, despertar +30 %...) (O-310)
    const T = this.conAura(j) && REGLAS.HIPER_TIPOS[j.hiperTipo];
    return p * (1 + pct / 100) * (T ? 1 + (T.poder || 0) / 100 : 1);
  }
  _mulVel(j) {
    // con la hiper puesta corre mas (VR no da el numero) (O-310)
    let pct = this.conAura(j) ? REGLAS.HIPER_VELOCIDAD : 0;
    for (const e of this._efectosTactica(j)) {
      if (e.que.includes("velocidad") || (e.que.includes("vel_regate") && j.conBalon)) pct += e.pct;
    }
    return Math.max(0.4, 1 + pct / 100);
  }

  // --- pasivas (O-288) --------------------------------------------------------
  // El % que suman las pasivas de su equipo a un valor de duelo de `j`:
  // valor = "tiro" | "foco" | "disputa" | "muro" | "kp"; ataca = si es su AT.
  // el tiempo de juego del partido entero (auras, tacticas, "tras robo", manos
  // del portero). A cada parte ya jugada se le suma lo mas que pudo alargarse
  // tras las 15:00: asi nunca va hacia atras al empezar la siguiente (O-308)
  segundosDeJuego() {
    let s = this.reloj;
    // (y su descuento por los cambios, O-315)
    for (let m = 1; m < this.mitad; m++) s += this._finParte(m) + REGLAS.FIN_PARTE_EXTRA / REGLAS.RELOJ_RITMO;
    return s;
  }
  _cumple(e, h, j) {
    const ax = REGLAS.ANCHO / 2, ay = REGLAS.LARGO / 2;
    switch (e.condicion) {
      case null: case undefined: return true;
      case "campo_contrario": return j.y * j.dir > 0;
      case "campo_propio": return j.y * j.dir <= 0;
      case "fuera_area": return !(Math.abs(j.y) > ay - REGLAS.AREA_Y && Math.abs(j.x) < REGLAS.AREA_X);
      case "mitad1": return this.mitad === 1;
      // la de "en la segunda parte" sigue en la prorroga (O-312)
      case "mitad2": return this.mitad >= 2;
      case "cerca_mismo": return this.equipo(j.lado).some(o => o !== j && o.elemento === j.elemento && Math.hypot(o.x - j.x, o.y - j.y) < 12);
      case "cerca_otro": return this.equipo(j.lado).some(o => o !== j && o.elemento !== j.elemento && Math.hypot(o.x - j.x, o.y - j.y) < 12);
      case "tension": return this.tension[j.lado] / REGLAS.TENSION_MAX * 100 >= (e.n || 0);
      case "tras_robo": return this.segundosDeJuego() - this.ultimoRobo[j.lado] < (e.n || 0);
      case "no_gana": return this.goles[j.lado] <= this.goles[1 - j.lado];
      case "sin_falta": return !this.faltasRecibidas[j.lado];       // "hasta que el equipo reciba una falta" (O-304)
      // "Por cada rango de Conf. X": solo con la configuracion X del equipo (O-328)
      case "rango": return this.rangoCarga(j.lado, e.conf) > 0;
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
  // valor "parada": la parte de la TECNICA del portero, que sube con el DF general (VR); el
  // PP ("kp") solo con las de PP (O-328)
  bonusPasivas(j, valor, ataca) {
    // se suma por tipo de efecto y cada tipo se corta en su tope de equipo (O-292)
    const porTipo = {}, topes = {}, rango = {};
    // el AT general vale para todo ataque menos parar; el DF general, para toda
    // defensa menos el tiro y el PP del portero, que sube solo con PP (O-304, O-328)
    const vale = e => e.que.includes(valor) || (ataca && e.que.includes("at") && valor !== "kp" && valor !== "muro" && valor !== "parada")
      || (!ataca && e.que.includes("df") && valor !== "tiro" && valor !== "kp");
    // las del campo y las del entrenador y los gerentes (O-328)
    for (const [h, e] of this._efectosEquipo(j.lado)) {
      // la pasiva de un espiritu solo cuenta con su hiper puesta (VR) (O-310)
      if (e.espiritu && !this.conAura(h)) continue;
      if (!(vale(e) && this._alcanza(e, h, j) && this._cumple(e, h, j))) continue;
      const t = e.tipo || "?";
      porTipo[t] = (porTipo[t] || 0) + e.pct;
      if (e.tope) topes[t] = e.tope;
      // "Por cada rango de Conf. X": su suma (con su tope por rango) x el rango (O-328)
      if (e.condicion === "rango") rango[t] = this.rangoCarga(j.lado, e.conf);
    }
    let pct = 0;
    for (const t in porTipo) pct += (topes[t] ? Math.min(porTipo[t], topes[t]) : porTipo[t]) * (rango[t] !== undefined ? rango[t] : 1);
    // (el +25 % del aura de antes ya no va aqui: la hiper suma lo de su familia
    // fuera del tope, _factorHiper, O-310)
    for (const e of this._efectosTactica(j)) if (vale(e)) pct += e.pct;
    // la carga de Justicia: PP del equipo +5 % por rango desde el 2 (O-328)
    if (valor === "kp") pct += this._ppCarga(j.lado);
    // (sin el tope general del 60 % de antes: VR solo tiene el de cada tipo, O-328)
    return 1 + pct / 100;
  }
  _gananciaTension(lado, base) {
    let pct = 0;
    for (const [h, e] of this._efectosEquipo(lado)) if (e.que.includes("tension_gana") && !(e.espiritu && !this.conAura(h))) pct += e.pct;     // la del espiritu, con su hiper (O-310)
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
    // ids: quienes son, para ensenar sus caras en el panel del duelo (O-306)
    return { n: cerca.length, mismos: cerca.filter(o => o.elemento === j.elemento).length, factor: f, ids: cerca.map(o => o.id) };
  }

  // --- lo que se ensena antes de elegir (O-306) ----------------------------------
  // Las mismas cuentas que el duelo, en un sitio: asi el numero del panel es el
  // que luego se usa. Sin azar (no toca la semilla); el comando potente (y la
  // volea) aun multiplica despues por x0,75 a x1,65. El muro ya no lleva su +-10 %:
  // el numero del panel es el que se juega (O-309).
  // Foco o disputa de j contra rival con la supertecnica t (o sin ella). En la
  // disputa (el defensa carga) el del balon defiende con su DF de disputa.
  // tRival: la supertecnica del rival si ya se sabe (al resolver): tecnica contra tecnica
  // +20 % (O-328). En la disputa el elemento es el de game_param (x1,05 / x0,95)
  _valorFoco(j, rival, t, ataca, disputa, tRival) {
    const stat = disputa ? (ataca ? REGLAS.dfDisputa(j) : REGLAS.atDisputa(j)) : (ataca ? REGLAS.atFoco(j) : REGLAS.dfFoco(j));
    const esAt = disputa ? !ataca : ataca;
    const elem = disputa ? REGLAS.efectoDisputa(j, rival) : REGLAS.efectoElemental(j, t, rival, tRival);
    // y la hiper puesta, fuera del tope de las pasivas (O-310)
    return (stat + this._poder(j, t)) * elem
      * this.bonusPasivas(j, disputa ? "disputa" : "foco", esAt) * this.apoyos(j).factor * this._factorHiper(j, disputa ? "disputa" : "foco", !esAt)
      * this._factorCambio(j);     // el refuerzo del cambio (O-315)
  }
  // el AT del tiro (sin el elemento, que va al final por si hay cadena). clave:
  // el boton sin supertecnica (O-309): con el balon alto, Testarazo y Volea
  // cuentan Potencia + Fisico; la vaselina, x0,8 (la volea se tira al resolver)
  _valorTiro(tir, t, du, clave) {
    const stat = du.alto && !t ? REGLAS.atCabeza(tir) : REGLAS.atTiro(tir);
    let at = (stat + this._poder(tir, t)) * REGLAS.porDistancia(du.distancia, REGLAS.esLarga(t)) * this.bonusPasivas(tir, "tiro", true)
      * this._factorHiper(tir, "tiro", false) * this._factorCambio(tir);     // la hiper puesta (O-310) y el cambio (O-315)
    // tiro directo: suma el 50 % del AT de tiro del que paso, solo sin supertecnica (VR, O-328)
    if (!t && du.directo !== null && du.directo !== undefined) at += REGLAS.atTiro(this.jugadores[du.directo]) * REGLAS.DIRECTO;
    if (clave === "vaselina" && !t) at *= REGLAS.VASELINA;
    // el poder de afinidad y el combo de tecnicas (VR; en el penalti no) (O-328)
    if (!du.penalti) at *= this._multTiro(tir.lado);
    return at;
  }
  // lo que suma el que encadena (con la afinidad y el combo del tiro, `mult`; sin el, los
  // de ahora)
  _valorCadena(ch, t, mult) {
    const g = this.porteriaRival(ch);
    return (REGLAS.atTiro(ch) + this._poder(ch, t)) * REGLAS.porDistancia(Math.hypot(g.x - ch.x, g.y - ch.y), false) * this.bonusPasivas(ch, "tiro", true)
      * this._factorHiper(ch, "tiro", false) * this._factorCambio(ch)     // la hiper puesta (O-310) y el cambio (O-315)
      * (mult || this._multTiro(ch.lado));
  }
  // el tiro que lleva `at` tras encadenarlo ch con t: los AT se suman y, si la de la cadena
  // es una habilidad real (rh*: Vaselina, Tiro con efecto...), el total x0,5 (VR 6.0.1) (O-328)
  _sumaCadena(at, ch, t, mult) {
    return (at + this._valorCadena(ch, t, mult)) * (t && /^rh/.test(t.interno || "") ? REGLAS.CADENA_RH : 1);
  }
  // el muro: un contra-tiro frena con la mitad de su tiro (VR); un bloqueo, con su DF del
  // muro. Sin supertecnica no tiene elemento; con ella, el de los jugadores y el de su
  // tecnica contra la del tiro (tTiro), sobre todo (O-328; antes su tecnica contra el
  // jugador que chuta)
  _valorMuro(muro, t, ultimo, tTiro) {
    const base = t && REGLAS.esContra(t) ? (REGLAS.atTiro(muro) + this._poder(muro, t)) * 0.5
                                         : REGLAS.dfMuro(muro) + this._poder(muro, t);
    return base * (t ? REGLAS.efectoElemental(muro, t, ultimo, tTiro) : 1) * this.bonusPasivas(muro, "muro", false)
      * this._factorHiper(muro, "muro", true) * this._factorCambio(muro);     // la hiper puesta (O-310) y el cambio (O-315)
  }
  // lo que le quita al tiro el muro que pierde: su numero entero (VR, O-328). Si el tiro le
  // gana por critico, lo atraviesa sin perder nada (la "perforacion de muro" de VR)
  _restaMuro(dm, at, critico) {
    if (critico) return 0;
    return REGLAS.MURO_RESTA * Math.min(dm, at);
  }
  // la parada del portero (VR, O-328): el PP que le QUEDA con las pasivas de PP (y la carga
  // de Justicia) mas su supertecnica con el DF general, la fatiga y el elemento (jugador
  // contra jugador y su tecnica contra la del tiro, tTiro: solo en la parte de la tecnica).
  // clave "despejar": x1,25, pero no se la queda (O-309). La hiper del portero ya no suma
  // aqui: le sube el PP al invocar
  _valorParada(por, t, tir, clave, tTiro) {
    const pp = (por.kp || 0) * this.bonusPasivas(por, "kp", false);
    return (pp + this._parteTecnica(por, t, tir, tTiro)) * (clave === "despejar" && !t ? REGLAS.DESPEJAR : 1);
  }
  _parteTecnica(por, t, tir, tTiro) {
    if (!t) return 0;
    const F = REGLAS.FATIGA;
    return this._poder(por, t) * this.bonusPasivas(por, "parada", false) * (1 - F.porParada * Math.min(F.max, por.fatiga || 0))
      * REGLAS.efectoElemental(por, t, tir, tTiro) * this._factorHiper(por, "parada", true) * this._factorCambio(por);
  }
  // el portero ha parado el tiro `at` (O-328): con un critico es la "parada" de VR y el PP no
  // baja; si no, baja lo que el tiro pasa de su tecnica (la tecnica se gasta primero; con
  // Despejar no hay tecnica: el x1,25 no es un escudo de PP). Y se cansa una vez mas (salvo
  // en la tanda: sinFatiga)
  _pararPP(por, at, t, tir, tTiro, critico, sinFatiga) {
    if (!critico) {
      const b = this.bonusPasivas(por, "kp", false), tec = this._parteTecnica(por, t, tir, tTiro);
      por.kp = Math.max(0, (por.kp || 0) - Math.max(0, at - tec) / Math.max(0.01, b));
    }
    if (!sinFatiga) por.fatiga = Math.min(REGLAS.FATIGA.max, (por.fatiga || 0) + 1);
  }
  // si la tecnica de j gana a la del rival (los dos con supertecnica), en su paso: {ventaja:
  // 20} (el "Efectos elementales +20 %" de VR) (O-328)
  _ventajaPaso(j, t, rival, tRival) {
    return t && tRival && REGLAS.gana(t.elemento, tRival.elemento) ? { ventaja: Math.round(REGLAS.ELEMENTO * 100) } : {};
  }

  // --- la tension que cuesta, la afinidad y el combo (O-328) ------------------------------
  // lo que cuesta ahora la supertecnica t de j: con el combo de su equipo, x0,5 / 0,25
  coste(j, t) {
    if (!t) return 0;
    const k = REGLAS.COMBO.coste[this.combo ? this.combo[j.lado] : 0];
    return Math.round((t.tp || 0) * (k === undefined ? 1 : k));
  }
  // lo que multiplica al tiro de `lado`: la afinidad (%) y el combo (+10/15/20 %)
  _multTiro(lado) {
    const a = this.afinidad ? this.afinidad[lado] : 0, c = this.combo ? REGLAS.COMBO.tiro[this.combo[lado]] || 0 : 0;
    return 1 + (a + c) / 100;
  }
  // al chutar a puerta se gastan la afinidad (la carga de Vinculo la cuenta) y el combo
  _gastarAfinidad(lado) {
    if (!this.afinidad) return;
    const a = this.afinidad[lado];
    this.afinidad[lado] = 0; this.combo[lado] = 0;
    const c = this.carga[lado], V = REGLAS.CARGA.vinculo;
    if (c && c.tipo === "vinculo" && a > 0) {
      c.n += a;
      while (c.n >= V.afinidad) { c.n -= V.afinidad; this._subirCarga(lado, V.sube); }
    }
  }
  // un pase completado: +1 % de afinidad y lo de las pasivas "Al hacer un pase, poder de
  // afinidad +N %" (con su tope), hasta 30 %. que "afinidad_falta": la falta que le hacen
  // (solo lo de sus pasivas)
  _pase(lado, que = "afinidad_pase") {
    if (!this.afinidad) return;
    const A = REGLAS.AFINIDAD;
    let extra = 0, tope = null;
    for (const [h, e] of this._efectosEquipo(lado)) if (e.que.includes(que) && !(e.espiritu && !this.conAura(h))) { extra += e.pct; if (e.tope) tope = e.tope; }
    if (tope !== null) extra = Math.min(extra, tope);
    this.afinidad[lado] = Math.min(A.max, this.afinidad[lado] + (que === "afinidad_pase" ? A.pase : 0) + extra);
  }
  // el paso del tiro de j (con t o con el boton `que`) para el resultado: sus pasivas y, si
  // los lleva, la afinidad y el combo
  _pasoTiro(j, t, que, cadena) {
    const paso = { que, tecnica: !!t, elemento: t ? t.elemento || "" : "", pasivas: Math.round((this.bonusPasivas(j, "tiro", true) - 1) * 1000) / 10 };
    if (!cadena && this.afinidad) {
      const a = Math.round(this.afinidad[j.lado]), c = this.combo[j.lado];
      if (a > 0) paso.afinidad = a;
      if (c > 0) paso.combo = c;
    }
    return paso;
  }

  // --- la carga de configuracion (O-328) --------------------------------------------------
  // el rango de la configuracion `conf` de `lado` (0 si su configuracion es otra)
  rangoCarga(lado, conf) {
    const c = this.carga && this.carga[lado];
    return c && c.tipo && c.tipo === conf ? c.rango : 0;
  }
  // la carga de Justicia: PP del equipo +5 % por rango desde el 2 (tope 20)
  _ppCarga(lado) {
    const J = REGLAS.CARGA.justicia, r = this.rangoCarga(lado, "justicia");
    return r ? Math.min(J.ppTope, J.ppPorRango * Math.max(0, r - J.ppDesde + 1)) : 0;
  }
  // sube (d > 0) o baja el rango de `lado`, de 1 a 5; al subir se apunta
  _subirCarga(lado, d) {
    const c = this.carga && this.carga[lado];
    if (!c || !c.tipo || !d) return;
    const antes = c.rango;
    c.rango = Math.max(1, Math.min(REGLAS.CARGA_RANGO_MAX, c.rango + d));
    if (c.rango > antes) this.apunta("Configuración " + REGLAS.CARGA[c.tipo].nombre + " de " + this.nombres[lado] + ": rango " + c.rango, "tactica");
  }
  // lo que pasa con el tiempo de juego (el reloj en marcha): Justicia +1 cada 25 s sin
  // falta, Contraataque -1 cada 15 s, Tension -1 tras 45 s sin gastar, Brecha +1 cada 15 s
  _pasoCarga(P) {
    for (const lado of [0, 1]) {
      const c = this.carga[lado], C = c && c.tipo ? REGLAS.CARGA[c.tipo] : null;
      if (!C) continue;
      const cada = C.cada || C.cadaBaja || C.sinGastar;
      if (!cada) continue;
      c.t += P;
      while (c.t >= cada) {
        c.t -= cada;
        this._subirCarga(lado, c.tipo === "contraataque" ? C.baja : c.tipo === "tension" ? C.baja : C.sube);
      }
    }
  }
  // le pitan una falta a `lado`: Justicia -3 (y vuelve a contar), Juego sucio -1
  _cargaFalta(lado) {
    const c = this.carga && this.carga[lado];
    if (!c || !c.tipo || REGLAS.CARGA[c.tipo].falta === undefined) return;
    this._subirCarga(lado, REGLAS.CARGA[c.tipo].falta);
    if (c.tipo === "justicia") c.t = 0;
  }
  // una jugada brusca que sale bien (gana con Entrada o Cargar sin falta): Juego sucio +1
  _cargaBrusca(lado) { if (this.rangoCarga(lado, "juego_sucio")) this._subirCarga(lado, REGLAS.CARGA.juego_sucio.brusca); }
  // `lado` pierde el balon: Vinculo -1 cada dos
  _cargaPerdida(lado) {
    const c = this.carga && this.carga[lado];
    if (!c || c.tipo !== "vinculo") return;
    c.p = (c.p || 0) + 1;
    if (c.p >= REGLAS.CARGA.vinculo.perdidas) { c.p = 0; this._subirCarga(lado, REGLAS.CARGA.vinculo.baja); }
  }
  // una brecha o una parada (los criticos del tiro y del portero) de `lado`: Brecha -4
  _cargaCritico(lado) { if (this.rangoCarga(lado, "brecha")) { this._subirCarga(lado, REGLAS.CARGA.brecha.critico); this.carga[lado].t = 0; } }
  // j recupera el balon (robo, pase cortado, tactica): "tras recuperar" y Contraataque +4
  // en campo propio / +2 en el rival
  _robo(j) {
    this.ultimoRobo[j.lado] = this.segundosDeJuego();
    if (!this.rangoCarga(j.lado, "contraataque")) return;
    const C = REGLAS.CARGA.contraataque;
    this._subirCarga(j.lado, j.y * j.dir <= 0 ? C.roboPropio : C.roboRival);
  }
  // con la tension que le quedaria tras pagar `gasto`: las pasivas y tacticas
  // "con la tension a x %" se miran despues de pagar la tecnica
  _trasPagar(lado, gasto, fn) {
    const antes = this.tension[lado];
    this.tension[lado] = Math.max(0, antes - (gasto || 0));
    try { return fn(); } finally { this.tension[lado] = antes; }
  }
  // Al empezar un duelo: el poder de base de cada lado (sin comando ni tecnica),
  // los apoyos y el total de cada boton. Va dentro del duelo, que viaja entero
  // en la foto: el invitado ve lo mismo (uno anterior no lo trae y no se ensena)
  _previo(du) {
    const R = Math.round;
    if (du.tipo === "foco") {
      const att = this.jugadores[du.atacante], def = this.jugadores[du.defensor];
      const apA = this.apoyos(att), apD = this.apoyos(def);
      du.base = {
        [att.lado]: R(this._valorFoco(att, def, null, true, false)), [def.lado]: R(this._valorFoco(def, att, null, false, false)),
        // si el defensa carga se juega la disputa, con otros numeros
        disputa: { [att.lado]: R(this._valorFoco(att, def, null, true, true)), [def.lado]: R(this._valorFoco(def, att, null, false, true)) },
        apoyos: { [att.lado]: { ids: apA.ids, pct: R((apA.factor - 1) * 100) }, [def.lado]: { ids: apD.ids, pct: R((apD.factor - 1) * 100) } },
      };
      for (const [j, rival, ataca] of [[att, def, true], [def, att, false]]) {
        for (const o of du.lados[j.lado].opciones) {
          const t = this._tecnica(j, o.clave);
          if (o.clave === "cargar") { o.total = du.base.disputa[j.lado]; continue; }
          // la hiper: su valor de foco sin tecnica como si ya la tuviera puesta (lo que
          // cuenta si el rival saca otra hiper) (O-310)
          if (o.clave === "hiper") { o.total = R(this._conHiperSimulada(j, () => this._valorFoco(j, rival, null, ataca, false))); continue; }
          const v = this._trasPagar(j.lado, this.coste(j, t), () => this._valorFoco(j, rival, t, ataca, false));
          o.total = R(v);
          // Romper y Entrada: x0,75 a x1,65 al resolver (REGLAS.POTENTE, O-309)
          if (o.clave === "potente") { o.min = R(v * REGLAS.POTENTE[0]); o.max = R(v * REGLAS.POTENTE[1]); }
        }
      }
      return;
    }
    // una etapa del tiro en vuelo, sus numeros (O-325)
    if (du.etapa && du.etapa !== "chute") return this._previoVuelo(du);
    const tir = this.jugadores[du.tirador], por = this.jugadores[du.portero];
    du.base = {
      [tir.lado]: R(this._valorTiro(tir, null, du) * REGLAS.efectoElemental(tir, null, por)),
      [por.lado]: R(this._valorParada(por, null, tir)),
    };
    const lt = du.lados[tir.lado], lp = du.lados[por.lado];
    const crudo = {};             // el AT de cada tiro antes del elemento, para la cadena
    const [p0, p1] = REGLAS.POTENTE;
    for (const o of lt.opciones) {
      const t = this._tecnica(tir, o.clave);
      crudo[o.clave] = { at: this._trasPagar(tir.lado, this.coste(tir, t), () => this._valorTiro(tir, t, du, o.clave)), tp: this.coste(tir, t) };
      o.total = R(crudo[o.clave].at * REGLAS.efectoElemental(tir, t, por));
      // la volea, de cuanto a cuanto, como Romper (O-309)
      if (o.clave === "volea") { o.min = R(o.total * p0); o.max = R(o.total * p1); }
      // lo que se puede ir fuera sin supertecnica, en % (O-315): lo dice el boton
      const pf = this._probFuera(tir, du, o.clave, t);
      if (pf > 0) o.fuera = R(pf * 100);
    }
    if (lt.cadena) {
      // con cada tiro el total cambia: uno por tiro, con la cadena el elemento es el
      // suyo. Tras una vaselina no se encadena; con la volea, de cuanto a cuanto (O-309)
      const ch = this.jugadores[lt.cadena.jugador];
      for (const o of lt.cadena.opciones) {
        const t = this._tecnica(ch, o.clave);
        o.totales = {};
        for (const k in crudo) {
          if (k === "vaselina") continue;
          const suma = t ? this._trasPagar(tir.lado, crudo[k].tp + this.coste(ch, t), () => this._valorCadena(ch, t)) : 0;
          const el = t ? REGLAS.efectoElemental(ch, t, por) : REGLAS.efectoElemental(tir, this._tecnica(tir, k), por);
          // (con una habilidad real en la cadena, el total x0,5, O-328)
          const rh = t && /^rh/.test(t.interno || "") ? REGLAS.CADENA_RH : 1;
          o.totales[k] = R((crudo[k].at + suma) * rh * el);
          if (k === "volea") o.rangos = { volea: [R((crudo[k].at * p0 + suma) * rh * el), R((crudo[k].at * p1 + suma) * rh * el)] };
        }
      }
    }
    // (en el chute del tiro que viaja el portero aun no elige: no esta, O-325)
    if (!lp) return;
    for (const o of lp.opciones) {
      const t = this._tecnica(por, o.clave);
      o.total = R(this._trasPagar(por.lado, this.coste(por, t), () => this._valorParada(por, t, tir, o.clave)));
    }
    if (lp.muro) {
      const muro = this.jugadores[lp.muro.jugador];
      for (const o of lp.muro.opciones) {
        if (o.clave === "nada") continue;
        const t = this._tecnica(muro, o.clave);
        o.total = R(this._trasPagar(por.lado, this.coste(muro, t), () => this._valorMuro(muro, t, tir)));
      }
    }
  }

  // --- quien gana (Aaron, O-307: "90-10") (O-309) ----------------------------------
  // Una sola regla para focos, disputas, muro y portero: gana el numero mayor,
  // salvo un critico (REGLAS.probCritico: 10 % con numeros parecidos, nada a
  // partir del triple). a y d se redondean (los del panel). Devuelve {ganaA,
  // critico, a, d, antes}: a y d son los que se ensenan; el que gana por critico
  // se queda con el numero del otro x1,05 a x1,20 (nunca se ve ganar al pequeno)
  // y `antes` es el suyo de verdad
  _decidir(a, d) {
    a = Math.round(a); d = Math.round(d);
    if (a === d) return { ganaA: this.azar() < 0.5, critico: false, a, d };
    const critico = this.azar() < REGLAS.probCritico(a, d);
    const ganaA = (a > d) !== critico;
    if (!critico) return { ganaA, critico, a, d };
    const s = REGLAS.CRITICO_SUBE, k = s[0] + this.azar() * (s[1] - s[0]);
    return ganaA ? { ganaA, critico, a: Math.max(d + 1, Math.round(d * k)), d, antes: a }
                 : { ganaA, critico, a, d: Math.max(a + 1, Math.round(a * k)), antes: d };
  }
  // la probabilidad de que el tiro de tir con el boton `clave` se vaya fuera (O-315):
  // sin supertecnica (t), desde lejos o con un rival encima (REGLAS.TIRO_FUERA; la
  // volea, mas). Sin azar: la misma en el panel y al resolver (en el duelo nadie se
  // mueve). El penalti va siempre a puerta
  _probFuera(tir, du, clave, t) {
    if (t || du.tipo === "penalti" || du.penalti) return 0;
    const F = REGLAS.TIRO_FUERA;
    const cerca = Math.min(99, ...this.equipo(1 - tir.lado).filter(r => !r.esPortero).map(r => Math.hypot(r.x - tir.x, r.y - tir.y)));
    const p = (Math.max(0, (du.distancia || 0) - F.desde) * F.porMetro + F.presion * Math.max(0, 1 - cerca / F.cerca)) * (clave === "volea" ? F.volea : 1);
    return Math.max(0, Math.min(F.tope, p));
  }
  // el comando fuerte pero inestable (Romper, Entrada y la Volea): x0,75 a x1,65
  _potente(v) { const [p0, p1] = REGLAS.POTENTE; return v * (p0 + this.azar() * (p1 - p0)); }
  // se gasta lo de cada supertecnica que se usa de verdad: ahi se cuenta (O-306). Y
  // llena la hiperbarra de su equipo (VR): lo que cuesta x0,4 un tiro (tambien la
  // cadena y el contra-tiro), x0,6 un regate, x0,8 una defensa (y el bloqueo) y x1,0
  // una parada; las habilidades reales (rh*: Vaselina, Tiro con efecto...), nada (O-310)
  // (lo que cuesta de verdad: con el combo, menos; y la carga de Tension lo cuenta, O-328)
  _gastar(j, t) {
    if (!t) return;
    const coste = this.coste(j, t);
    this.tension[j.lado] = Math.max(0, this.tension[j.lado] - coste);
    this.estadisticas.tecnicas[j.lado]++;
    if (!/^rh/.test(t.interno || "")) this.hiper[j.lado] = Math.min(REGLAS.HIPER_MAX, this.hiper[j.lado] + (REGLAS.HIPER_LLENA[t.tipo] || 0) * coste);
    const c = this.carga && this.carga[j.lado], CT = REGLAS.CARGA.tension;
    if (c && c.tipo === "tension" && coste > 0) {
      c.t = 0; c.n += coste;
      while (c.n >= CT.gasto) { c.n -= CT.gasto; this._subirCarga(j.lado, CT.sube); }
    }
  }
  _tension(lado, mas) { this.tension[lado] = Math.min(REGLAS.TENSION_MAX, this.tension[lado] + mas); }

  _resolver() {
    const du = this.duelo;
    if (du.tipo === "foco") return this._resolverFoco(du);
    if (du.tipo === "penalti") return this._resolverPenalti(du);     // O-312
    if (du.etapa) return this._resolverEtapa(du);                    // el tiro que viaja (O-325)
    return this._resolverTiro(du);
  }

  _resolverFoco(du) {
    const att = this.jugadores[du.atacante], def = this.jugadores[du.defensor];
    let ca = du.elecciones[att.lado], cd = du.elecciones[def.lado];
    // la hipertecnica (O-310): solo si se puede pagar AL RESOLVER (online puede llegar
    // de una pantalla vieja, o elegida sin barra); si no, vale como el comando seguro,
    // igual que una supertecnica que no se puede pagar
    const hA = ca === "hiper" && this.puedeHiper(att).si, hD = cd === "hiper" && this.puedeHiper(def).si;
    if (ca === "hiper" && !hA) ca = "normal";
    if (cd === "hiper" && !hD) cd = "normal";
    const yaA = this.conAura(att), yaD = this.conAura(def);
    let ta = this._tecnica(att, ca), td = this._tecnica(def, cd);
    if (ta && this.coste(att, ta) > att.pt) ta = null;
    if (td && this.coste(def, td) > def.pt) td = null;
    this._gastar(att, ta); this._gastar(def, td);
    // la hiper contra lo que no sea otra hiper (ni una ya puesta) gana siempre, aunque
    // el otro use una supertecnica, tambien la de un keshin ya invocado (VR: "las
    // hipertecnicas usadas en una batalla de foco la ganan automaticamente"; Aaron,
    // O-307 punto 7). Contra Cargar tambien
    if ((hA && !hD && !yaD) || (hD && !hA && !yaA)) return this._ganaHiper(att, def, hA ? att : def, ta, td, ca, cd);
    const apA = this.apoyos(att), apD = this.apoyos(def);
    // disputa: el que carga usa su AT de disputa contra la DF de disputa del que
    // lleva el balon. Con los apoyos; la cuenta es la del panel (_valorFoco, O-306)
    const como = cd === "cargar" ? "disputa" : "foco";
    // hiper contra hiper (o contra una ya puesta): un duelo de poder, cada hiper con
    // su valor sin tecnica como si ya la tuviera; el que ya la tenia juega lo que
    // eligio (con Cargar, la disputa). Gana el numero mayor con el 90-10 (O-310)
    const sim = (j, h, fn) => h ? this._conHiperSimulada(j, fn) : fn();
    const pa = sim(att, hA, () => this.bonusPasivas(att, como, como !== "disputa"));
    const pd = sim(def, hD, () => this.bonusPasivas(def, como, como === "disputa"));
    // con la tecnica del otro ya sabida: tecnica contra tecnica +20 % (VR, O-328)
    let a = sim(att, hA, () => this._valorFoco(att, def, ta, true, como === "disputa", td)), d = sim(def, hD, () => this._valorFoco(def, att, td, false, como === "disputa", ta));
    // el comando potente: +35 % pero inestable (DS); luego gana el numero mayor
    // salvo un critico (antes, con probabilidad A^3 / (A^3 + D^3)) (O-309)
    if (ca === "potente") a = this._potente(a);
    if (cd === "potente") d = this._potente(d);
    const ra = Math.round(a), rd = Math.round(d);
    const dec = this._decidir(a, d);
    const gana = dec.ganaA ? att : def, pierde = gana === att ? def : att;
    pierde.aturdido = REGLAS.ATURDIDO; pierde.ruta = [];
    gana.respiro = REGLAS.RESPIRO_DUELO; pierde.respiro = REGLAS.RESPIRO_DUELO;
    // falta (3DS): el que entra fuerte o carga y gana puede hacer falta
    let riesgo = gana === def ? (cd === "potente" ? REGLAS.FALTA_ENTRADA : cd === "cargar" ? REGLAS.FALTA_CARGA : 0) : 0;
    // en su area el defensa se la juega menos (si no, salian demasiados penaltis)
    const gA = this.porteriaRival(att);
    if (Math.abs(att.y - gA.y) < REGLAS.AREA_Y && Math.abs(att.x) < REGLAS.AREA_X) riesgo *= 0.4;
    // en la falta salen los numeros de verdad: la falta manda sobre el critico
    if (riesgo && this.azar() < riesgo) return this._falta(att, def, ra, rd, ta, td, ca, cd);
    if (dec.critico) this.estadisticas.criticos[gana.lado]++;
    // el balon disputado que se escapa (O-315): el defensa que gana sin supertecnica
    // ni hiper a veces no se lo queda (REGLAS.ESCAPA, por lo que eligio)
    const escapa = gana === def && !td && !hD && this.azar() < (REGLAS.ESCAPA[cd] || 0);
    if (escapa) {
      this._escapa(att, def);
      this.paseMarcado[att.lado] = null;
    } else if (gana === def) {
      this.coger(def); this._robo(def);
      this.paseMarcado[att.lado] = null;     // perdio el balon: lo marcado se borra (O-306)
    }
    // el que gana con su hiper la activa (paga 100 de hiperbarra); el que pierde no
    // paga la suya (VR). El totem que ya estaba puesto crece con cada foco ganado (O-310)
    const hGana = gana === att ? hA : hD;
    if (hGana) this._activarHiper(gana, true);
    else if ((gana === att ? yaA : yaD) && gana.hiperTipo === "totem") gana.totem = Math.min(2, (gana.totem || 0) + 1);
    // la tension como en VR (O-310): +60 al que gana sin tecnica ni hiper; al que
    // pierde, +30 en un foco SIEMPRE (tambien si uso tecnica o hiper) y nada en una
    // disputa (antes +30, y nada si uso tecnica)
    const tecGana = gana === att ? ta : td;
    // el combo de tecnicas de VR: ganar con supertecnica +1 (hasta 3); y la carga de Juego
    // sucio: la jugada brusca (Entrada o Cargar) que sale bien (O-328)
    if (tecGana && this.combo) this.combo[gana.lado] = Math.min(REGLAS.COMBO.max, this.combo[gana.lado] + 1);
    if (gana === def && (cd === "potente" || cd === "cargar")) this._cargaBrusca(def.lado);
    if (!tecGana && !hGana) this._tension(gana.lado, this._gananciaTension(gana.lado, REGLAS.TENSION_GANA));
    this._tension(pierde.lado, como === "disputa" ? REGLAS.TENSION_DISPUTA_PIERDE : REGLAS.TENSION_PIERDE);
    this.nResultado = (this.nResultado || 0) + 1;
    // valores: los que se ensenan (con un critico, el del que gana pasa por encima
    // del otro); critico: el lado que gano por critico y antes, su numero de
    // verdad (O-309)
    this.resultado = {
      tipo: como, ganador: gana.id, valores: { [att.lado]: dec.a, [def.lado]: dec.d },
      critico: dec.critico ? gana.lado : null, antes: dec.critico ? dec.antes : null,
      tecnicas: { [att.lado]: hA ? "★ " + att.espiritu.nombre : ta ? ta.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: hD ? "★ " + def.espiritu.nombre : td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      atacante: att.id, defensor: def.id,
      elementos: { [att.lado]: ta ? ta.elemento || "" : null, [def.lado]: td ? td.elemento || "" : null },
      pasivas: { [att.lado]: Math.round((pa - 1) * 1000) / 10, [def.lado]: Math.round((pd - 1) * 1000) / 10 },
      apoyos: { [att.lado]: apA, [def.lado]: apD },
    };
    // quien jugo una hiper en el duelo de poder (O-310)
    if (hA || hD) this.resultado.hipers = { [att.lado]: hA, [def.lado]: hD };
    if (escapa) this.resultado.suelto = true;     // el balon se escapa (O-315)
    // la tecnica que gana en elemento a la del otro: "Elemento +20 %" (O-328)
    if (como === "foco") {
      const vA = this._ventajaPaso(att, ta, def, td).ventaja, vD = this._ventajaPaso(def, td, att, ta).ventaja;
      if (vA || vD) this.resultado.ventaja = { [att.lado]: vA || 0, [def.lado]: vD || 0 };
    }
    const nom = (h, j, t) => h ? "★ " + j.espiritu.nombre + ": " : t ? t.nombre + ": " : "";
    const ev = this.apunta(nom(hA, att, ta) + att.nombre + " " + dec.a + " contra " + nom(hD, def, td) + def.nombre + " " + dec.d +
      " → " + (gana === att ? "¡se va!" : escapa ? "¡" + def.nombre + " se la quita, pero el balón se escapa!" : "¡roba " + def.nombre + "!")
      + (dec.critico ? " (¡crítico!)" : ""), gana === att ? "bien" : "mal");
    // el rotulo pequeno "¡Crítico!" en el campo, del color del que gana (O-309); si
    // gano con su hiper, "¡Hipertécnica!" (O-310)
    if (hGana) ev.ro = { que: "hiper", lado: gana.lado, sub: gana.nombre + " · " + gana.espiritu.nombre };
    else if (dec.critico) ev.ro = { que: "critico", lado: gana.lado, sub: gana.nombre };
    // quien pierde el balon, para su "¡Uy!" en el campo; va en la foto con el
    // suceso y un Pizarra anterior no lo mira (O-306)
    if (gana === def) ev.pierde = att.id;
    this._acabarDuelo(1.6);
  }

  // el balon que se escapa de un foco (O-315): sale rodando a ESCAPA_VEL m/s hacia
  // donde iba el que lo llevaba (hasta ESCAPA_ANGULO grados a cada lado), desde 2 m de
  // entre los dos (si no, lo cogia el defensa en el acto). Lo toco el defensa: si sale,
  // el saque es del otro
  _escapa(att, def) {
    const ang = (this.azar() * 2 - 1) * REGLAS.ESCAPA_ANGULO * Math.PI / 180;
    const [v0, v1] = REGLAS.ESCAPA_VEL, vel = v0 + this.azar() * (v1 - v0);
    const ml = Math.hypot(att.mx, att.my), mx = ml > 0.01 ? att.mx / ml : 0, my = ml > 0.01 ? att.my / ml : att.dir;
    const ux = mx * Math.cos(ang) - my * Math.sin(ang), uy = mx * Math.sin(ang) + my * Math.cos(ang);
    this.soltar();
    this.balon.x = (att.x + def.x) / 2 + ux * 2; this.balon.y = (att.y + def.y) / 2 + uy * 2;
    this.balon.vx = ux * vel; this.balon.vy = uy * vel;
    this.balon.pase = null; this.balon.ultimo = def.lado;
  }

  // si j esta a menos de m metros de su porteria (O-315)
  _cercaDeSuPorteria(j, m) { return Math.hypot(j.x, j.y + REGLAS.LARGO / 2 * j.dir) < m; }
  // el despeje de cabeza del defensa que corta un balon bombeado (O-315): a corner
  // (REGLAS.CABEZA.corner) o hacia el campo, hasta CABEZA.angulo grados a cada lado, a
  // CABEZA.vel m/s y suelto, desde 1,5 m de el. Lo toco el: si sale, saque del otro
  _despejeCabeza(j) {
    const C = REGLAS.CABEZA;
    if (this.azar() < C.corner) return this._alFondo(j, j.lado);
    const ang = (this.azar() * 2 - 1) * C.angulo * Math.PI / 180, [v0, v1] = C.vel, vel = v0 + this.azar() * (v1 - v0);
    const ux = Math.sin(ang), uy = Math.cos(ang) * j.dir;
    this.soltar();
    this.balon.x = j.x + ux * 1.5; this.balon.y = j.y + uy * 1.5;
    this.balon.vx = ux * vel; this.balon.vy = uy * vel;
    this.balon.pase = null; this.balon.fueraDe = null; this.balon.ultimo = j.lado;
  }

  // el foco que gana una hipertecnica, sin numeros (O-310): el que la saca la activa
  // (paga 100 de hiperbarra), gana siempre, no puede ser falta y no cobra tension; el
  // otro se lleva +30 (VR, tambien si uso supertecnica, que si paga). En el
  // resultado, `hiper` = el lado que gano asi y su valor null (la estrella)
  _ganaHiper(att, def, gana, ta, td, ca, cd) {
    const pierde = gana === att ? def : att;
    const apA = this.apoyos(att), apD = this.apoyos(def);
    // el numero del que pierde, el de su boton en el panel (sin el azar de Romper o Entrada)
    const vp = Math.round(pierde === att ? this._valorFoco(att, def, ta, true, false) : this._valorFoco(def, att, td, false, cd === "cargar"));
    const pa = this.bonusPasivas(att, "foco", true), pd = this.bonusPasivas(def, cd === "cargar" ? "disputa" : "foco", cd === "cargar");
    this._activarHiper(gana, true);
    pierde.aturdido = REGLAS.ATURDIDO; pierde.ruta = [];
    gana.respiro = REGLAS.RESPIRO_DUELO; pierde.respiro = REGLAS.RESPIRO_DUELO;
    if (gana === def) {
      this.coger(def); this._robo(def);
      this.paseMarcado[att.lado] = null;     // perdio el balon: lo marcado se borra (O-306)
    }
    this._tension(pierde.lado, REGLAS.TENSION_PIERDE);
    this.nResultado = (this.nResultado || 0) + 1;
    const esp = gana.espiritu.nombre;
    this.resultado = {
      tipo: "foco", ganador: gana.id, valores: { [gana.lado]: null, [pierde.lado]: vp },
      critico: null, antes: null, hiper: gana.lado, hipers: { [gana.lado]: true, [pierde.lado]: false },
      tecnicas: { [att.lado]: gana === att ? "★ " + esp : ta ? ta.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: gana === def ? "★ " + esp : td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      atacante: att.id, defensor: def.id,
      elementos: { [att.lado]: gana !== att && ta ? ta.elemento || "" : null, [def.lado]: gana !== def && td ? td.elemento || "" : null },
      pasivas: { [att.lado]: Math.round((pa - 1) * 1000) / 10, [def.lado]: Math.round((pd - 1) * 1000) / 10 },
      apoyos: { [att.lado]: apA, [def.lado]: apD },
    };
    const ev = this.apunta("¡Hipertécnica de " + gana.nombre + " (" + esp + ")! " + (gana === att ? "Se va de " + def.nombre : "Le roba el balón a " + att.nombre)
      + (pierde === att ? (ta ? " (" + ta.nombre + ")" : "") : (td ? " (" + td.nombre + ")" : "")), gana === att ? "bien" : "mal");
    ev.ro = { que: "hiper", lado: gana.lado, sub: gana.nombre + " · " + esp };
    if (gana === def) ev.pierde = att.id;
    this._acabarDuelo(1.6);
  }

  _resolverTiro(du) {
    const tir = this.jugadores[du.tirador], por = this.jugadores[du.portero];
    const muro = du.muro !== null ? this.jugadores[du.muro] : null;
    const et = du.elecciones[tir.lado] || {}, ed = du.elecciones[por.lado] || {};
    const clave = typeof et === "object" ? et.tiro : et;
    let tt = this._tecnica(tir, clave);
    if (tt && this.coste(tir, tt) > tir.pt) tt = null;
    this._gastar(tir, tt);
    // sin supertecnica (o sin tension para ella), el boton: Tirar o Vaselina; con
    // el balon alto, Testarazo o Volea (O-309)
    const boton = tt ? null : clave === "vaselina" || clave === "volea" ? clave : "normal";
    // con la distancia, las pasivas y el tiro directo: la cuenta del panel (O-306)
    let at = this._valorTiro(tir, tt, du, boton);
    // la volea: fuerte pero inestable, como Romper (O-309)
    if (boton === "volea") at = this._potente(at);
    const directo = du.directo !== null && du.directo !== undefined;
    const que = tt ? tt.nombre : du.alto ? (boton === "volea" ? "Volea" : "Testarazo")
      : (boton === "vaselina" ? "Vaselina" : "Tirar") + (directo ? " de primeras" : "");
    const pasos = [Object.assign({ quien: tir.id, valor: Math.round(at) }, this._pasoTiro(tir, tt, que))];
    // la afinidad y el combo ya van en su AT; la cadena suma con el mismo x y se gastan (O-328)
    const kiz = this._multTiro(tir.lado);
    // la cadena: el companero remata y los AT se suman (VR); el gol es suyo. Tras
    // una vaselina no se encadena (O-309)
    let ultimo = tir, tecUltima = tt;
    const ch = du.cadena !== null && du.cadena !== undefined ? this.jugadores[du.cadena] : null;
    if (ch && boton !== "vaselina" && et.cadena && et.cadena !== "nada") {
      let tc = this._tecnica(ch, et.cadena);
      if (tc && this.coste(ch, tc) > ch.pt) tc = null;
      if (tc) {
        this._gastar(ch, tc);
        at = this._sumaCadena(at, ch, tc, kiz);
        pasos.push({ quien: ch.id, que: tc.nombre + " (cadena)", valor: Math.round(at), tecnica: true, elemento: tc.elemento || "" });
        ultimo = ch; tecUltima = tc;
      }
    }
    this._gastarAfinidad(tir.lado);
    // el muro (O-309): gana el numero mayor salvo un critico. Si gana el muro, lo
    // bloquea; si pierde, le resta al tiro la mitad de su numero (VR: el bloqueo
    // resta). La vaselina pasa por encima si no esta pegado al que chuta: no juega
    // ni paga su tecnica
    // desvia: quien manda el tiro fuera (O-315), el muro que lo toca (corner) o el que
    // chuta (saque de puerta)
    let desvia = null;
    if (muro && ed.muro && ed.muro !== "nada") {
      if (boton === "vaselina" && !du.muroPegado) {
        pasos.push({ quien: muro.id, que: "¡Por encima!", valor: null, tecnica: false, elemento: "", encima: true });
      } else {
        let tm = this._tecnica(muro, ed.muro);
        if (tm && this.coste(muro, tm) > muro.pt) tm = null;
        this._gastar(muro, tm);
        // un contra-tiro frena con la mitad de su tiro (VR); un bloqueo, con su DF
        // del muro (_valorMuro, la cuenta del panel, O-306)
        const dm = this._valorMuro(muro, tm, ultimo, tecUltima), rm = this._decidir(dm, at);
        // contra: el numero del tiro contra el muro, el que se ensena (si el tiro
        // pasa con un critico, por encima del del muro)
        const pm = { quien: muro.id, que: tm ? tm.nombre : "Bloqueo", valor: rm.a, contra: rm.d, tecnica: !!tm, elemento: tm ? tm.elemento || "" : "" };
        // critico: el lado que gano este paso por critico (el muro o el tiro) y antes, su numero
        if (rm.critico) { pm.critico = rm.ganaA ? muro.lado : tir.lado; pm.antes = rm.antes; this.estadisticas.criticos[pm.critico]++; }
        pasos.push(pm);
        if (rm.ganaA) {
          this.nResultado = (this.nResultado || 0) + 1;
          this.resultado = { tipo: "tiro", final: "bloqueado", pasos, tirador: tir.id,
            critico: rm.critico ? muro.lado : null, antes: rm.critico ? rm.antes : null };
          this.apunta("¡" + muro.nombre + " bloquea el tiro!" + (rm.critico ? " (¡crítico!)" : ""), "mal").ro = { que: "bloqueo", lado: muro.lado, sub: muro.nombre };   // O-306
          // a veces se va directo a corner (O-315); si no, rebota hacia el campo
          if (this.azar() < REGLAS.A_CORNER.bloqueo) this._alFondo(muro, muro.lado);
          else {
            this.soltar();
            this.balon.x = muro.x; this.balon.y = muro.y;
            this.balon.vx = (this.azar() - 0.5) * 8; this.balon.vy = -tir.dir * 6;
            this.balon.ultimo = muro.lado;
          }
          return this._acabarDuelo(2.0);
        }
        const resta = this._restaMuro(dm, at, rm.critico);     // (entero, O-328)
        at -= resta;
        pm.resta = Math.round(resta);          // lo que le quito al tiro, para el panel
        // el muro lo ha tocado: a veces se desvia a corner (O-315)
        if (this.azar() < REGLAS.TIRO_FUERA.muro) desvia = muro;
      }
    }
    // el tiro sin supertecnica (tampoco la del que encadena) desde lejos o con un
    // rival encima a veces no va a puerta (O-315; la cuenta del panel, _probFuera)
    if (!desvia && !tecUltima) {
      const pf = this._probFuera(tir, du, boton, null);
      if (pf > 0 && this.azar() < pf) desvia = tir;
    }
    if (desvia) {
      // no juega el portero (ni paga su supertecnica): el balon sale por la linea de
      // fondo junto a un palo y, al volver el juego, _fuera pita el saque de puerta o,
      // si lo toco el muro, el corner. En el panel, "¡Fuera!" sin numero del portero
      pasos[0].valorFinal = Math.round(at * REGLAS.efectoElemental(ultimo, tecUltima, por));
      pasos.push({ quien: por.id, que: desvia === tir ? "Se va fuera" : "Desviado a córner", valor: null, tecnica: false, elemento: "", fuera: true });
      this.nResultado = (this.nResultado || 0) + 1;
      this.resultado = { tipo: "tiro", final: "fuera", pasos, tirador: tir.id, critico: null, antes: null, desvia: desvia.id };
      this.apunta(desvia === tir ? "¡El tiro de " + tir.nombre + " se va fuera!" : "¡" + desvia.nombre + " desvía el tiro de " + tir.nombre + " a córner!", "mal");
      this._alFondo(por, desvia.lado);
      return this._acabarDuelo(2.0);
    }
    let tp = this._tecnica(por, ed.parada);
    if (tp && this.coste(por, tp) > por.pt) tp = null;
    this._gastar(por, tp);
    // el elemento: jugador contra jugador y tecnica contra tecnica (O-328)
    at *= REGLAS.efectoElemental(ultimo, tecUltima, por, tp);
    // Parar o Despejar (x1,25, pero rebota) (O-309)
    const despejar = !tp && ed.parada === "despejar";
    const df = this._valorParada(por, tp, ultimo, despejar ? "despejar" : null, tecUltima);     // la cuenta del panel (O-306)
    // el portero: gana el numero mayor salvo un critico (antes, con probabilidad
    // AT^5 / (AT^5 + DF^5), O-302). Los numeros que se ensenan son los de rp (O-309)
    const rp = this._decidir(at, df);
    const pp = Object.assign({ quien: por.id, que: tp ? tp.nombre : despejar ? "Despejar" : "Parar", valor: rp.d, tecnica: !!tp, elemento: tp ? tp.elemento || "" : "",
      pasivas: Math.round((this.bonusPasivas(por, "kp", false) - 1) * 1000) / 10 }, this._ventajaPaso(por, tp, ultimo, tecUltima));
    pasos.push(pp);
    pasos[0].valorFinal = rp.a;
    Object.assign(pasos[0], this._ventajaPaso(ultimo, tecUltima, por, tp));
    const critico = rp.critico ? (rp.ganaA ? tir.lado : por.lado) : null, antes = rp.critico ? rp.antes : null;
    // como en el paso del muro: quien gano este paso por critico y su numero de verdad
    if (critico !== null) { this.estadisticas.criticos[critico]++; pp.critico = critico; pp.antes = antes; this._cargaCritico(critico); }
    const cifras = " (" + rp.a + " contra " + rp.d + (rp.critico ? ", ¡crítico!" : "") + ")";
    if (rp.ganaA) {
      this.goles[tir.lado]++;
      // el gol con su minuto (el del registro) y quien lo marca: el nombre, que
      // tras un cambio el mismo numero es otro jugador (O-306). El minuto es el
      // de dentro de la parte, como el reloj de 3DS (O-308)
      this.estadisticas.goles.push([tir.lado, this.mitad, this.minuto(), ultimo.nombre]);
      this.nResultado = (this.nResultado || 0) + 1;
      this.resultado = { tipo: "tiro", final: "gol", pasos, tirador: ultimo.id, critico, antes };
      this.apunta("¡¡GOL de " + ultimo.nombre + "!!" + cifras, "gol");
      this.fase = "gol"; this.duelo = null; this._retener(3.0, "duelo");     // O-319
      this._sacaDespues = 1 - tir.lado;
      return;
    }
    // parada: el PP baja lo que el tiro pasa de su tecnica y se cansa (VR, O-328)
    this._pararPP(por, at, tp, ultimo, tecUltima, rp.critico);
    pp.pp = Math.round(por.kp);
    // despeja con Despejar o con una supertecnica de despeje o de puno: el mismo
    // rebote (O-309)
    const despeje = despejar || (!!tp && /despej|pu.o/i.test(tp.subtipo || ""));
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "tiro", final: despeje ? "despeje" : "parada", pasos, tirador: tir.id, critico, antes };
    const ev = this.apunta((despeje ? "¡Despeja " : "¡Para ") + por.nombre + "!" + cifras, "mal");
    // el rotulo pequeno "¡Crítico!" en el campo; en el gol no (ya esta el suyo) (O-309)
    if (rp.critico) ev.ro = { que: "critico", lado: por.lado, sub: por.nombre };
    if (despeje) this._rebote(por);
    else {
      this.coger(por); this._aManos(por);
      por.respiro = REGLAS.RESPIRO_SAQUE;   // tras blocar, un respiro para sacar (O-305)
    }
    this._acabarDuelo(2.0);
  }

  // el despeje (Despejar o una supertecnica de despeje o de puno): el balon sale
  // rebotado hacia el campo con un angulo al azar de hasta DESPEJE_ANGULO grados a
  // cada lado y DESPEJE_VEL m/s. Sale desde 1,5 m del portero en esa direccion
  // (asi no se lo vuelve a quedar el); puede caerle a un rival o irse fuera, y si
  // cruza su linea de fondo, _fuera ya da corner. Antes iba siempre hacia
  // delante (O-309)
  _rebote(por) {
    // a veces la manda directa a corner, por encima o junto al palo (O-315)
    if (this.azar() < REGLAS.A_CORNER.despeje) return this._alFondo(por, por.lado);
    const ang = (this.azar() * 2 - 1) * REGLAS.DESPEJE_ANGULO * Math.PI / 180;
    const [v0, v1] = REGLAS.DESPEJE_VEL, vel = v0 + this.azar() * (v1 - v0);
    const ux = Math.sin(ang), uy = Math.cos(ang) * por.dir;
    this.soltar();
    const c = this._dentro(por.x + ux * 1.5, por.y + uy * 1.5);
    this.balon.x = c.x; this.balon.y = c.y;
    this.balon.vx = ux * vel; this.balon.vy = uy * vel;
    this.balon.pase = null; this.balon.ultimo = por.lado;
  }
  // el balon, por la linea de fondo de la porteria de j (la suya), a 0,5-6 m de un
  // palo, tocado el ultimo por `ultimo`: al volver el juego, _fuera pita el corner o el
  // saque de puerta. Los despejes y bloqueos que se van a corner y los tiros que se
  // van fuera (O-315)
  _alFondo(j, ultimo) {
    const y = -REGLAS.LARGO / 2 * j.dir, palo = this.azar() < 0.5 ? -1 : 1;
    this.soltar();
    this.balon.x = palo * (REGLAS.PORTERIA / 2 + 0.5 + this.azar() * 5.5);
    this.balon.y = y + (Math.sign(y) || 1) * 0.6;
    this.balon.vx = this.balon.vy = 0; this.balon.pase = null; this.balon.ultimo = ultimo;
  }

  // el penalti (O-312): si el portero se tira a otra zona, gol; si acierta, gana el
  // numero mayor salvo un critico (_decidir, como el tiro). Las supertecnicas se
  // pagan (si llega la tension) y llenan la hiperbarra. En la tanda se apunta el tiro
  // y, tras el rotulo, paso() mira si se ha acabado; en el partido, el gol de siempre
  // o el portero se la queda
  _resolverPenalti(du) {
    const tir = this.jugadores[du.tirador], por = this.jugadores[du.portero];
    const et = du.elecciones[tir.lado] || {}, ep = du.elecciones[por.lado] || {};
    const zt = et.zona === 0 || et.zona === 2 ? et.zona : 1, zp = ep.zona === 0 || ep.zona === 2 ? ep.zona : 1;
    let tt = this._tecnica(tir, et.tecnica), tp = this._tecnica(por, ep.tecnica);
    if (tt && this.coste(tir, tt) > tir.pt) tt = null;
    if (tp && this.coste(por, tp) > por.pt) tp = null;
    this._gastar(tir, tt); this._gastar(por, tp);
    // las cuentas del panel: el tiro desde 11 m con su elemento, la parada sin despejar
    // (el elemento: jugador contra jugador y tecnica contra tecnica, O-328)
    const at = this._valorTiro(tir, tt, du, "normal") * REGLAS.efectoElemental(tir, tt, por, tp);
    const df = this._valorParada(por, tp, tir, null, tt);
    const misma = zt === zp, dec = misma ? this._decidir(at, df) : null, gol = !misma || dec.ganaA;
    const pasos = [
      { quien: tir.id, que: tt ? tt.nombre : "Tirar", valor: dec ? dec.a : Math.round(at), tecnica: !!tt, elemento: tt ? tt.elemento || "" : "",
        pasivas: Math.round((this.bonusPasivas(tir, "tiro", true) - 1) * 1000) / 10 },
      { quien: por.id, que: tp ? tp.nombre : "Parar", valor: dec ? dec.d : Math.round(df), tecnica: !!tp, elemento: tp ? tp.elemento || "" : "",
        pasivas: Math.round((this.bonusPasivas(por, "kp", false) - 1) * 1000) / 10 },
    ];
    pasos[0].valorFinal = pasos[0].valor;
    // el que gana por critico: su paso lleva su lado y su numero de verdad (como el tiro)
    const critico = dec && dec.critico ? (dec.ganaA ? tir.lado : por.lado) : null, antes = critico !== null ? dec.antes : null;
    if (critico !== null) { const ps = pasos[dec.ganaA ? 0 : 1]; ps.critico = critico; ps.antes = antes; if (!du.tanda) this.estadisticas.criticos[critico]++; }
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = { tipo: "penalti", final: gol ? "gol" : "parada", tanda: !!du.tanda, tirador: tir.id, portero: por.id,
      zonas: { [tir.lado]: zt, [por.lado]: zp }, misma, pasos, critico, antes };
    // en el campo: el portero se tira a su zona y el balon va a la del tiro (el cono
    // de la pantalla sale hacia ella)
    const g = this.porteriaRival(tir), zx = z => (z - 1) * REGLAS.PENALTI_ZONA_X, dentro = Math.sign(g.y) * 1.0;
    por.x = zx(zp) * 0.8;
    const cifras = misma ? " (" + dec.a + " contra " + dec.d + (dec.critico ? ", ¡crítico!" : "") + ")" : " (" + por.nombre + " se tira al otro lado)";
    this.duelo = null;
    if (du.tanda) {
      const t = this.tanda;
      t.tiros[tir.lado].push(gol ? 1 : 0);
      const gt = this.golesTanda();
      this.estadisticas.penaltis = gt;
      this.soltar();
      if (gol) { this.balon.x = zx(zt); this.balon.y = g.y + dentro; } else { this.balon.x = por.x; this.balon.y = por.y; }
      // el rotulo pequeno "¡Gol!" o "¡Parada!", del color del que se lo lleva
      this.apunta((gol ? "Penaltis: ¡gol de " + tir.nombre + "!" : "Penaltis: ¡" + por.nombre + " para el tiro de " + tir.nombre + "!") + cifras
        + " · " + gt.join("-"), gol ? "bien" : "mal").ro = gol ? { que: "tandaGol", lado: tir.lado, sub: tir.nombre + " · " + gt.join("-") }
        : { que: "tandaParada", lado: por.lado, sub: por.nombre + " · " + gt.join("-") };
      this.fase = "resultado"; this._retener(2.2, "duelo");     // O-319
      return;
    }
    if (gol) {
      this.goles[tir.lado]++;
      this.estadisticas.goles.push([tir.lado, this.mitad, this.minuto(), tir.nombre]);
      this.soltar(); this.balon.x = zx(zt); this.balon.y = g.y + dentro;
      this.apunta("¡¡GOL de " + tir.nombre + "!! De penalti" + cifras, "gol");
      this.fase = "gol"; this._retener(3.0, "duelo");     // O-319
      this._sacaDespues = 1 - tir.lado;
      return;
    }
    // parada: se la queda (y su PP baja y se cansa, como en el tiro, O-328)
    this._pararPP(por, at, tp, tir, tt, critico !== null);
    this.coger(por); this._aManos(por);
    this.balon.x = por.x; this.balon.y = por.y;
    por.respiro = REGLAS.RESPIRO_SAQUE;
    const ev = this.apunta("¡" + por.nombre + " para el penalti!" + cifras, "mal");
    if (critico !== null) ev.ro = { que: "critico", lado: por.lado, sub: por.nombre };
    this._acabarDuelo(2.0);
  }

  // la falta: tiro libre con la barrera a 9 m, o penalti si fue en el area
  _falta(att, def, ra, rd, ta, td, ca, cd) {
    const g = this.porteriaRival(att);
    const enArea = Math.abs(att.y - g.y) < REGLAS.AREA_Y && Math.abs(att.x) < REGLAS.AREA_X;
    att.aturdido = 0; def.aturdido = REGLAS.ATURDIDO;
    this.faltasRecibidas[att.lado]++;
    this._cargaFalta(def.lado);     // la carga de Justicia o de Juego sucio (O-328)
    this._pase(att.lado, "afinidad_falta");     // "Cuando el rival comete una falta, poder de afinidad +N %" (O-328)
    this.nResultado = (this.nResultado || 0) + 1;
    this.resultado = {
      tipo: "falta", penalti: enArea, ganador: att.id, atacante: att.id, defensor: def.id,
      valores: { [att.lado]: ra, [def.lado]: rd },
      // el que saco su hiper contra una ya puesta y le hacen falta: su estrella (O-310)
      tecnicas: { [att.lado]: ta ? ta.nombre : ca === "hiper" ? "★ " + att.espiritu.nombre : (ca === "potente" ? "Romper" : "Regatear"),
                  [def.lado]: td ? td.nombre : ({ cargar: "Cargar", potente: "Entrada" }[cd] || "Tapar") },
      elementos: { [att.lado]: null, [def.lado]: null }, pasivas: {},
    };
    this.apunta("¡Falta de " + def.nombre + " sobre " + att.nombre + "!" + (enArea ? " ¡PENALTI!" : " Tiro libre."), "mal").ro =
      { que: enArea ? "penalti" : "falta", lado: att.lado, sub: (enArea ? "Para " : "Tiro libre para ") + this.nombres[att.lado] };   // O-306
    // la tarjeta, si la hay, detras de la falta (su rotulo sale despues). Las
    // fuertes: con Entrada o en el area (O-311). Va en el resultado para el panel
    const tarjeta = this._tarjeta(def, cd === "potente" || enArea);
    if (tarjeta) this.resultado.tarjeta = tarjeta;
    for (const j of this.jugadores) j.ruta = [];
    if (enArea) {
      // penalti: el que la recibe tira desde el punto; el resto, fuera del area
      att.x = 0; att.y = g.y - att.dir * 11;
      const por = this.portero(1 - att.lado); por.x = 0; por.y = g.y - att.dir * 0.8;
      for (const j of this.enCampo()) {     // el expulsado no vuelve al campo (O-311)
        if (j === att || j === por) continue;
        if (Math.abs(j.y - g.y) < REGLAS.AREA_Y + 1) j.y = g.y - att.dir * (REGLAS.AREA_Y + 2 + Math.abs(j.x) * 0.05);
      }
      this.coger(att);
      this.duelo = null;
      // tras el rotulo, la espera del saque del penalti y, al pulsar Jugar, el tiro (O-308)
      this._saquePendiente = { tipo: "penalti", lado: att.lado, tirador: att.id };
      this.paseMarcado[att.lado] = null;     // tira el penalti: no sale lo marcado en el duelo (O-306)
      this.fase = "resultado"; this._retener(2.0, "duelo");     // O-319
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
    this._saquePendiente = { tipo: "falta", lado: att.lado };     // y luego su [Jugar] (O-308)
  }

  // --- las tarjetas (O-311; Aaron, O-307 punto 12) -----------------------------------
  // Una tirada por falta (REGLAS.TARJETAS): roja directa, amarilla o nada; las
  // fuertes tienen mas. Con una amarilla ya, la segunda es roja. La roja solo si su
  // equipo tiene 8 o mas en el campo (VR): si no, se queda en amarilla y se dice.
  // Devuelve {que: "amarilla" | "roja", quien, segunda?} o null
  _tarjeta(j, fuerte) {
    const T = REGLAS.TARJETAS, x = this.azar(), l = j.lado;
    const pr = fuerte ? T.rojaFuerte : T.roja, pa = fuerte ? T.amarillaFuerte : T.amarilla;
    if (x >= pr + pa) return null;
    const segunda = x >= pr && j.amarillas > 0;
    let roja = x < pr || segunda;
    const quedan = this.equipo(l).length, sinRoja = roja && quedan < T.minimoParaRoja;
    if (sinRoja) roja = false;
    if (!roja) {
      j.amarillas = 1;
      this.estadisticas.amarillas[l]++;
      this.apunta("Tarjeta amarilla para " + j.nombre + (sinRoja ? " (sería roja, pero " + this.nombres[l] + " ya juega con " + quedan
        + " y no se expulsa a nadie más)" : ""), "amarilla").ro = { que: "amarilla", lado: l, sub: j.nombre };
      return { que: "amarilla", quien: j.id };
    }
    // la segunda amarilla cuenta tambien como amarilla, como en las estadisticas del futbol
    if (segunda) this.estadisticas.amarillas[l]++;
    this.estadisticas.rojas[l]++;
    this.apunta((segunda ? "¡Segunda amarilla para " + j.nombre + ": tarjeta roja!" : "¡Tarjeta roja para " + j.nombre + "!")
      + " Expulsado: " + this.nombres[l] + " juega con " + (quedan - 1), "roja").ro =
      { que: "roja", lado: l, sub: j.nombre + (segunda ? " · segunda amarilla" : "") };
    this._expulsar(j);
    return segunda ? { que: "roja", quien: j.id, segunda: true } : { que: "roja", quien: j.id };
  }
  // el expulsado sale del campo y se queda en `jugadores` con su id (O-311). Sin
  // azar: el invitado online lo repite desde la foto (silencioso, sin apuntar: los
  // sucesos le llegan del anfitrion) y le tiene que salir el mismo portero nuevo
  _expulsar(j, silencioso) {
    if (!j || j.expulsado) return;
    const eraPortero = j.esPortero;
    // sin esPortero: portero() y _fuera() lo buscan entre todos los jugadores
    j.expulsado = true; j.esPortero = false;
    if (this.balon.dueno === j.id) this.soltar();
    j.conBalon = false; j.ruta = []; j.presiona = null; j.aturdido = 0; j.respiro = 0;
    // fuera de la banda de su lado (no se pinta, pero que no quede en el campo)
    j.x = (j.lado === 0 ? -1 : 1) * (REGLAS.ANCHO / 2 + 4); j.y = 0; j.mx = 0; j.my = j.dir;
    // a un expulsado no se le cambia: su cambio pendiente se quita; nadie le
    // presiona y no sale lo que tenia marcado ni un pase marcado a el
    this.cambiosPendientes[j.lado] = (this.cambiosPendientes[j.lado] || []).filter(c => c.sale !== j.id);
    for (const o of this.jugadores) if (o.presiona === j.id) o.presiona = null;
    const pm = this.paseMarcado[j.lado];
    if (pm && (pm.de === j.id || pm.a === j.id)) this.paseMarcado[j.lado] = null;
    if (!eraPortero) return;
    // si era el portero, se pone el de campo con mejor parada (el mayor KP; con el
    // mismo, el de menor id) en su sitio, con su KP lleno
    const nuevo = this.equipo(j.lado).filter(o => !o.esPortero)
      .sort((a, b) => REGLAS.kpBase(b) - REGLAS.kpBase(a) || a.id - b.id)[0];
    if (!nuevo) return;
    nuevo.esPortero = true; nuevo.kpMax = REGLAS.kpBase(nuevo); nuevo.kp = nuevo.kpMax; nuevo.fatiga = 0;
    nuevo.u = j.u; nuevo.v = j.v; nuevo.ruta = [];
    // a su porteria, salvo que lleve el balon (el balon va con el)
    if (!nuevo.conBalon) { nuevo.x = 0; nuevo.y = (-REGLAS.LARGO / 2 + 1.5) * nuevo.dir; }
    if (!silencioso) this.apunta(nuevo.nombre + " se pone de portero en " + this.nombres[j.lado], "aviso");
  }

  _acabarDuelo(segundos) {
    this.duelo = null;
    this.fase = "resultado";
    this._retener(segundos, "duelo");     // O-319
  }
  // la espera de un resultado, de un gol o de un saque (O-319; diseno 6.2). Sin
  // animaciones, la de siempre; con ellas, lo que dure su animacion si es mas
  // (REGLAS.planAnim). En "resultado" y "gol" paso() no toca el azar, el reloj ni las
  // posiciones: el partido es el mismo, solo se espera mas. que: "duelo" (el resultado de
  // un duelo; lleva lo que le falta a la entrada al duelo, del contador de paso(), que
  // no se borra con this.duelo), "fuera" (el fuera de juego) o "banda" | "corner" |
  // "puerta" | "penaltis" (sin resultado nuevo: REGLAS.esperaAnim). "vuelo": un resultado
  // del tiro en vuelo que no cierra un duelo (el que llega fuera, O-325): sin entrada
  _retener(segundos, que) {
    const m = this.animaciones;
    if (!m) { this.espera = segundos; return; }
    if (que !== "duelo" && que !== "fuera" && que !== "vuelo") { this.espera = Math.max(segundos, REGLAS.esperaAnim(que, m)); return; }
    const A = REGLAS.ANIM[m];
    // (en ms enteros: el invitado saca el plan con la misma que viaja en `anim`)
    const entrada = que === "duelo" ? Math.round(Math.max(0, A.entrada - (this._edadId === this.nDuelos ? this._edadDuelo : 0)) * 1000) / 1000 : 0;
    this._segAnim(this.resultado);
    const plan = REGLAS.planAnim(this.resultado, m, entrada, id => (this.jugadores[id] || {}).lado);
    this.espera = Math.max(segundos, plan.total);
    // va en la foto con el resultado (`re`): el invitado saca el mismo plan
    if (this.resultado) this.resultado.anim = { modo: m, entrada, total: this.espera };
  }
  // lo que dura la animacion de VR de cada supertecnica del resultado (`seg` de partido.py,
  // eventos-tecnicas.csv), apuntado en el propio resultado: con las completas su tramo dura
  // eso y el invitado, con la foto, saca el mismo plan (O-323). En el tiro, `seg` en cada
  // paso con tecnica; en el foco, `segs` por lado. La ★ (invocar en el duelo), lo de su
  // espiritu
  _segAnim(r) {
    if (!r) return;
    const seg = (id, nombre) => {
      const j = this.jugadores[id];
      if (!j || !nombre) return 0;
      if (/^★/.test(nombre)) return (j.espiritu && j.espiritu.seg) || 0;
      const n = nombre.replace(/ \(cadena\)$/, ""), t = (j.tecnicas || []).find(x => x.nombre === n);
      return (t && t.seg) || 0;
    };
    if (r.pasos) for (const s of r.pasos) if (s.tecnica && s.seg === undefined) { const v = seg(s.quien, s.que); if (v > 0) s.seg = v; }
    if (r.tecnicas && !r.segs && (r.tipo === "foco" || r.tipo === "disputa" || r.tipo === "falta")) {
      const segs = [0, 1].map(l => {
        const id = [r.atacante, r.defensor].find(i => (this.jugadores[i] || {}).lado === l);
        return id === undefined ? 0 : seg(id, r.hipers && r.hipers[l] && !/^★/.test(r.tecnicas[l] || "") ? "★" : r.tecnicas[l]);
      });
      if (segs[0] > 0 || segs[1] > 0) r.segs = segs;
    }
  }

  // --- un paso de simulacion ---------------------------------------------------
  paso() {
    const P = REGLAS.PASO;
    this.pasos++;
    // al acabarse la hiper, cada uno vuelve a su forma (O-327)
    this._formas();
    // el tiempo de invocacion (O-327): parado hasta que los dos invocan o siguen. Los
    // lados sin persona ya han decidido (la maquina piensa antes del paso); online, como
    // mucho TIEMPO_INVOCAR.limite s (como el duelo, para que nadie lo cuelgue)
    if (this.fase === "invocacion") {
      const ti = this.tiempoInvocar;
      if (ti) ti.t += P;
      if (ti && this.limiteDuelo && ti.t >= REGLAS.TIEMPO_INVOCAR.limite) this.listos = [true, true];
      for (const l of [0, 1]) if (!this.manual[l]) this.listos[l] = true;
      if (this.listos[0] && this.listos[1]) this._salirEspera();
      return;
    }
    if (this.fase === "duelo") {                       // parado hasta que elijan
      // con animaciones, lo que lleva abierto este duelo (la entrada de _retener, O-319)
      if (this.animaciones && this.duelo) {
        if (this._edadId !== this.duelo.id) { this._edadId = this.duelo.id; this._edadDuelo = 0; }
        this._edadDuelo += P;
      }
      if (this.limiteDuelo && this.duelo) {
        this.duelo.reloj = (this.duelo.reloj || 0) + P;
        if (this.duelo.reloj >= this.limiteDuelo) {
          for (const [l, pend] of Object.entries(this.pendientes())) this.elegir(Number(l), this.eleccionSegura(pend));
        }
      }
      return;
    }
    if (this.parado() || this.fase === "descanso") {
      // las esperas (O-308): sin limite; con PAUSA_MAX o DESCANSO en REGLAS se
      // acabarian solas, como antes
      if (this.fase === "pausa" && this.pausa && REGLAS.PAUSA_MAX > 0) {
        this.pausa.queda -= P;
        if (this.pausa.queda <= 0) this.listos = [true, true];
      }
      if (this.fase === "descanso" && REGLAS.DESCANSO > 0) {
        this.espera -= P;
        if (this.espera <= 0) this.listos = [true, true];
      }
      // la maquina ya esta lista; y si la persona pulso antes de este paso, se
      // sale ahora (si no, con [persona, maquina] no se salia nunca)
      for (const l of [0, 1]) if (!this.manual[l]) this.listos[l] = true;
      if (this.listos[0] && this.listos[1]) this._salirEspera();
      return;
    }
    if (this.fase === "resultado" || this.fase === "gol") {
      this.espera -= P;
      if (this.espera > 0) return;
      // en la tanda de penaltis, tras el rotulo de cada tiro: se acaba o el siguiente (O-312)
      if (this.tanda) {
        const gana = this._tandaAcabada();
        if (gana !== null) { this.tanda.gana = gana; return this._final(); }
        return this._siguientePenalti();
      }
      // tras el gol, el saque de centro y su espera; con la parte alargada tras
      // las 15:00, la parte se acaba aqui (O-308)
      if (this.fase === "gol") {
        if (this.prolonga) return this._finDeParte();
        this.saque(this._sacaDespues);
        return this._esperarSaque("centro", this._sacaDespues);
      }
      // tras el rotulo de un fuera, una falta, un fuera de juego o un penalti: la
      // espera de su saque (O-308)
      if (this._saquePendiente) {
        const s = this._saquePendiente; this._saquePendiente = null;
        return this._esperarSaque(s.tipo, s.lado, s.tirador);
      }
      // con la parte alargada, si el portero se ha quedado el balon en las manos
      // (una parada), la parte se acaba (O-308)
      if (this.prolonga && this._enManos(this.dueno())) return this._finDeParte();
      this.fase = "juego";
      // el pase o el tiro marcado durante un foco sale en cuanto vuelve el juego,
      // si el que lo marco sigue con el balon (O-306)
      for (const l of [0, 1]) {
        const o = this.paseMarcado[l], j = o && this.jugadores[o.de];
        this.paseMarcado[l] = null;
        if (j && j.conBalon) this.ordenar(o);
      }
      return;
    }
    if (this.fase === "final") return;
    // tras pulsar Jugar, hasta que el que saca pone el balon en juego: nadie se mueve
    // (ni la maquina), no hay duelos y el reloj no corre, como en la espera; solo se
    // dibujan las flechas (Aaron, O-322 punto 2; O-324). `t`: para la maquina
    if (this.porSacar) { this.porSacar.t += P; return; }

    this.reloj += P;
    this._formas();      // (la hiper que se acaba en este paso, O-327)
    // con el descuento de los cambios (O-315): 15:00 y 30 s por cambio
    const dura = this._finParte();
    if (this.reloj >= dura) {
      // a las 15:00 (o 30:00) con el balon en juego, la parte sigue hasta que se
      // pare (fuera, falta, gol, fuera de juego o el portero la coge), como mucho
      // FIN_PARTE_EXTRA s de reloj mas (O-308). Con el portero ya con el balon en
      // las manos, se acaba ya
      const extra = REGLAS.FIN_PARTE_EXTRA / REGLAS.RELOJ_RITMO;
      if (extra <= 0 || this.reloj >= dura + extra - 1e-9 || this._enManos(this.dueno())) { this._finDeParte(); return; }
      this.prolonga = true;
    }
    // la posesion: cada paso con el reloj en marcha es del ultimo equipo que
    // toco el balon (el que lo lleva, o el que lo paso o lo despejo) (O-306)
    this.estadisticas.posesion[this.balon.ultimo]++;

    for (const l of [0, 1]) {
      this._tension(l, REGLAS.TENSION_POR_SEGUNDO * P);
      const a = this.tacticaActiva[l];
      if (a && this.segundosDeJuego() >= a.hasta) this.tacticaActiva[l] = null;
    }
    // la carga de configuracion con el tiempo y la afinidad del que no tiene el balon (el
    // ultimo que lo toco es del otro) baja (O-328)
    this._pasoCarga(P);
    for (const l of [0, 1]) if (this.balon.ultimo !== l) this.afinidad[l] = Math.max(0, this.afinidad[l] - REGLAS.AFINIDAD.baja * P);
    for (const j of this.jugadores) {
      // (VR no recupera el PP con el tiempo: KP_POR_SEGUNDO 0, O-328)
      if (j.esPortero && REGLAS.KP_POR_SEGUNDO > 0 && j.kp < j.kpMax) j.kp = Math.min(j.kpMax, j.kp + j.kpMax * REGLAS.KP_POR_SEGUNDO * P);
      if (j.aturdido > 0) j.aturdido -= P;
      if (j.respiro > 0) j.respiro -= P;
    }
    // con el tiro en vuelo, los defensas que llegan a su camino van a cortarlo (O-325)
    this._cortes = this.tiro ? this._calcCortes() : null;
    this._mover(P);
    this._moverBalon(P);
    this._mirarDuelos();
  }

  // --- el fin de cada parte (O-308) ---------------------------------------------
  // El UNICO sitio que decide que viene tras una parte. Con empate y lo elegido al
  // empezar (O-312): tras la 2.ª, la prorroga (dos partes con su descanso) o la
  // tanda de penaltis; tras la 2.ª de la prorroga, la tanda si se eligio
  _finDeParte() {
    this.prolonga = false;
    if (this.mitad === 1) return this._descanso(2);
    if (this.mitad === 3) return this._descanso(4);
    const empate = this.goles[0] === this.goles[1], e = this.empate;
    if (this.mitad === 2 && empate && (e === "prorroga" || e === "prorroga-penaltis")) return this._descanso(3);
    if (empate && (e === "penaltis" || e === "prorroga-penaltis")) return this._empezarTanda();
    return this._final();
  }
  // el descanso: espera a que los dos pulsen "Segunda parte" (O-305), sin limite
  // (O-308). Los cambios pendientes entran ahora. Antes de la prorroga (siguiente 3)
  // es el "Fin del tiempo reglamentario" y hay un cambio mas para cada uno; entre
  // sus dos partes, otro descanso igual (O-312)
  _descanso(siguiente) {
    this.fase = "descanso"; this.siguiente = siguiente; this.espera = REGLAS.DESCANSO;
    this.duelo = null; this.pausa = null; this.esperaSaque = null; this._saquePendiente = null; this.porSacar = null;
    this.tiro = null;     // O-325
    // el pase marcado en un foco que acaba en falta con la parte ya alargada no pasa
    // a la parte siguiente: se veia en el descanso y podia salir en la otra (O-314)
    this.paseMarcado = [null, null];
    const g = this.goles[0] + " - " + this.goles[1];
    if (siguiente === 3) {
      this.prorroga = true;
      for (const l of [0, 1]) this.cambiosQuedan[l] += REGLAS.CAMBIOS_PRORROGA;
      this.apunta("Fin del tiempo reglamentario: " + g + ". ¡Prórroga!", "fin").ro = { que: "reglamentario", sub: g + " · ¡prórroga!" };
    } else {
      // "Fin de la 1.ª parte" en el campo (O-306); en la prorroga, con "prórroga" debajo
      this.apunta((siguiente === 4 ? "Descanso de la prórroga: " : "Descanso: ") + g, "fin").ro = { que: "descanso", sub: siguiente === 4 ? g + " · prórroga" : g };
    }
    this._aplicarCambiosPendientes();
    this._esperar("descanso");
  }
  _final() {
    this.fase = "final"; this.duelo = null; this.pausa = null; this.esperaSaque = null; this._saquePendiente = null; this.porSacar = null;
    this.tiro = null;     // O-325
    // "Fin del partido" en el campo (O-306), con la tanda si la hubo: "1 - 1 (4-2 pen.)" (O-312)
    const t = this.tanda, g = this.ganador();
    this.apunta("Final: " + this.marcadorTexto() + (t && g !== null ? ". Gana " + this.nombres[g] + " en los penaltis" : ""), "fin").ro =
      { que: "final", sub: this.marcadorTexto() };
  }

  // --- la tanda de penaltis (O-312) -------------------------------------------------
  // Tras el tiempo (o la prorroga) con empate, si se eligio. El orden es automatico:
  // los de campo con mas tiro primero (su AT de tiro y su mejor supertecnica de tiro)
  // y el portero el ultimo, sin expulsados y los mismos de cada equipo (los del que
  // tiene mas se quedan fuera). Empieza el que sale en un sorteo. Los porteros, con
  // el KP lleno; sin tacticas ni cambios. Antes del primero, el rotulo "¡Penaltis!"
  _empezarTanda() {
    this.prolonga = false;
    this.duelo = null; this.pausa = null; this.esperaSaque = null; this._saquePendiente = null; this.porSacar = null;
    this.tiro = null;     // O-325
    this.paseMarcado = [null, null]; this.cambiosPendientes = [[], []];
    this.tacticaActiva = [null, null];
    const n = Math.min(this.equipo(0).length, this.equipo(1).length);
    const tiro = j => REGLAS.atTiro(j) + Math.max(0, ...j.tecnicas.filter(t => REGLAS.sirve(t, "tiro") && !t.espiritu).map(t => REGLAS.poderTecnica(j, t)));
    const orden = [0, 1].map(l => {
      const por = this.portero(l);
      const campo = this.equipo(l).filter(j => j !== por).sort((a, b) => tiro(b) - tiro(a) || a.id - b.id);
      return campo.slice(0, n - 1).map(j => j.id).concat([por.id]);
    });
    // a una sola porteria, como en la vida real (O-315; antes cada uno a la que
    // atacaba): la sortea el arbitro. `porteria`: hacia donde esta, +1 o -1 (su y)
    this.tanda = { orden, tiros: [[], []], empieza: this.azar() < 0.5 ? 0 : 1, gana: null };
    this.tanda.porteria = this.azar() < 0.5 ? 1 : -1;
    this.estadisticas.penaltis = [0, 0];
    for (const l of [0, 1]) { const p = this.portero(l); if (p.kpMax) { p.kp = p.kpMax; p.fatiga = 0; } }
    this.apunta("Empate: " + this.goles[0] + " - " + this.goles[1] + ". ¡Tanda de penaltis! Empieza " + this.nombres[this.tanda.empieza], "fin").ro =
      { que: "penaltis", sub: "Empieza " + this.nombres[this.tanda.empieza] };
    this._colocarPenalti(this._tiradorTanda(this.tanda.empieza));
    this.fase = "resultado"; this._retener(2.0, "penaltis");     // O-319
  }
  // el que le toca tirar a `lado`: el siguiente de su orden (en la muerte subita
  // vuelven a empezar)
  _tiradorTanda(lado) {
    const t = this.tanda, lista = t.orden[lado].filter(id => this.jugadores[id] && !this.jugadores[id].expulsado);
    return this.jugadores[lista[t.tiros[lado].length % lista.length]];
  }
  // el siguiente penalti: alternan desde el que empieza. El reloj esta parado en la
  // tanda, asi que cada penalti empieza sin hipers puestas ni esperas de invocar: una
  // invocacion vale para ese penalti y la limita la hiperbarra
  _siguientePenalti() {
    const t = this.tanda, k = t.tiros[0].length + t.tiros[1].length;
    const lado = k % 2 === 0 ? t.empieza : 1 - t.empieza, tir = this._tiradorTanda(lado);
    for (const j of this.jugadores) { j.aura = 0; j.auraLista = 0; }
    this._formas();      // (y sin la forma de su modo, O-327)
    this.hiperBloqueo = [0, 0];
    this._colocarPenalti(tir);
    this._empezarPenalti(tir, true);
  }
  // el que tira, en el punto de penalti; el portero rival, en su linea; los demas,
  // en el centro del campo (cada equipo en una fila) mirando a esa porteria. Todos a
  // la porteria de la tanda (O-315): el equipo que tira ataca hacia ella y el otro la
  // defiende (su sentido cambia en cada penalti; asi porteriaRival, la porteria del
  // portero y las pasivas de "campo contrario" valen como siempre). La pantalla no
  // gira: la de la tanda queda arriba para los dos (sentidoPantalla)
  _colocarPenalti(tir) {
    const s = this.tanda && (this.tanda.porteria === 1 || this.tanda.porteria === -1) ? this.tanda.porteria : 0;
    if (s) for (const j of this.jugadores) j.dir = j.lado === tir.lado ? s : -s;
    const por = this.portero(1 - tir.lado), g = this.porteriaRival(tir), mira = Math.sign(g.y) || 1;
    for (const j of this.jugadores) { j.ruta = []; j.aturdido = 0; j.respiro = 0; j.conBalon = false; j.presiona = null; j.mx = 0; j.my = mira; }
    for (const l of [0, 1]) {
      const fila = this.equipo(l).filter(j => j !== tir && j !== por);
      fila.forEach((j, k) => { j.x = (k - (fila.length - 1) / 2) * 3.4; j.y = (l === 0 ? -3 : 3); });
    }
    tir.x = 0; tir.y = g.y - tir.dir * 11.7;
    por.x = 0; por.y = g.y - tir.dir * 0.8; por.my = -mira;
    this.balon = { x: 0, y: g.y - tir.dir * 11, vx: 0, vy: 0, dueno: null, ultimo: tir.lado, pase: null };
    this.coger(tir);
  }
  // quien ha ganado la tanda (0 o 1) o null si sigue. Cinco cada uno, y se acaba antes
  // si uno ya no alcanza al otro ni marcando todos los que le quedan; si siguen
  // empatados, muerte subita: por parejas, hasta que una pareja difiere
  _tandaAcabada() {
    const t = this.tanda, n = REGLAS.PENALTIS_TANDA;
    const k = t.tiros.map(x => x.length), g = t.tiros.map(x => x.filter(Boolean).length);
    if (k[0] <= n && k[1] <= n) {
      for (const l of [0, 1]) if (g[l] + (n - k[l]) < g[1 - l]) return 1 - l;
      if (k[0] === n && k[1] === n && g[0] !== g[1]) return g[0] > g[1] ? 0 : 1;
      return null;
    }
    return k[0] === k[1] && g[0] !== g[1] ? (g[0] > g[1] ? 0 : 1) : null;
  }
  // la parte siguiente: se cambia de campo en cada parte y el portero llena su KP.
  // Saca de centro sin otra espera: el descanso ya fue la de "Jugar" (O-308)
  _siguienteParte() {
    this.mitad = this.siguiente || this.mitad + 1; this.reloj = 0; this.prolonga = false;
    this.pausasQuedan = [REGLAS.PAUSAS_POR_PARTE, REGLAS.PAUSAS_POR_PARTE];
    this.listos = [false, false];
    // (el PP lleno y sin fatiga: en VR sin confirmar, O-328)
    for (const j of this.jugadores) {
      if (j.esPortero) { j.kp = j.kpMax; j.fatiga = 0; }
      j.dir = -j.dir;
    }
    for (const l of [0, 1]) this._tension(l, REGLAS.TENSION_DESCANSO);
    const e = this.apunta("Empieza la " + (["segunda parte", "primera parte de la prórroga", "segunda parte de la prórroga"][this.mitad - 2] || "parte " + this.mitad), "fin");
    // al empezar la prorroga, "¡Prórroga!" en el campo (antes que el "¡Saque!") (O-312)
    if (this.mitad === 3) e.ro = { que: "prorroga", sub: "2 partes de " + this.relojTexto(this.duracionParte(3)) };
    this.saque((this.mitad - 1) % 2);
    this.fase = "juego";
    // como tras pulsar Jugar: nadie se mueve hasta que se saca (O-324)
    const d = this.dueno();
    if (this.esperas && d) this.porSacar = { id: d.id, lado: d.lado, tipo: "centro", t: 0 };
  }

  // adonde quiere ir cada uno si no tiene ruta (la colocacion automatica de DS)
  _objetivo(j) {
    const b = this.balon, d = this.dueno(), T = this.tiro;
    // con el tiro en vuelo es "nuestro" el balon del que chuto (O-325)
    const tenemos = (d && d.lado === j.lado) || (!!T && T.lado === j.lado);
    if (j.conBalon) {
      if (this.manual[j.lado]) return { x: j.x, y: j.y };
      const g = this.porteriaRival(j);
      return { x: j.x + (g.x - j.x) * 0.15, y: j.y + j.dir * 8, lento: 0.75 };
    }
    // el colocado en la espera del saque se queda donde lo pusieron hasta que alguien
    // coge el balon (coger() lo suelta), el que saca se va conduciendo (si no, los
    // defensas se quedaban quietos mientras se les venia encima) o pasan
    // COLOCADO_SEGUNDOS (O-313)
    if (j.colocado) {
      const s = this._sacador, conduce = !!(s && d && d.id === s.id && Math.hypot(d.x - s.x, d.y - s.y) > 1.5);
      if (!conduce && this.segundosDeJuego() < (this._finColocados || 0)) return j.colocado;
      j.colocado = null;
    }
    if (j.presiona !== null && j.presiona !== undefined) {
      // al portero con el balon en las manos se le espera en la zona (O-305)
      if (d && d.id === j.presiona) { if (!this._enManos(d)) return { x: d.x, y: d.y, apreton: true }; }
      else j.presiona = null;
    }
    // el tiro en vuelo (O-325): el portero, a su linea frente adonde va el balon; los
    // defensas que llegan a cortarlo, a su camino (_calcCortes); los demas, a su zona
    if (T) {
      if (j.esPortero && j.lado !== T.lado) return { x: Math.max(-3, Math.min(3, T.tx * 0.8)), y: (-REGLAS.LARGO / 2 + 1.2) * j.dir };
      const c = this._cortes && this._cortes[j.id];
      if (c) return c;
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
    // nadie se tira encima del portero con el balon en las manos: lo empujaba
    // por detras de su linea (O-305)
    if (!T && !tenemos && (cerca[0] === j || (!d && cerca[1] === j)) && !this._enManos(d)) return { x: b.x, y: b.y, apreton: true };
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
    const js = this.enCampo();       // el expulsado no se mueve ni empuja (O-311)
    for (const j of js) {
      if (j.aturdido > 0) continue;
      let obj, lento = 1;
      if (j.ruta.length) {
        obj = j.ruta[0];
        // un punto tapado (otro jugador encima, y la separacion no deja llegar a
        // 0,6 m) vale como alcanzado si ya esta tan cerca como se puede: si no,
        // se quedaba clavado con la ruta y sin ir a por el balon. El que va a
        // recibir un pase sigue hasta el (O-305)
        const dr = Math.hypot(obj.x - j.x, obj.y - j.y), m = REGLAS.RADIO_JUGADOR * 1.6;
        const tapado = dr < m + 0.6 && !(this.balon.pase && this.balon.pase.a === j.id)
          && js.some(o => o !== j && Math.hypot(o.x - obj.x, o.y - obj.y) < m - 0.5);
        if (dr < 0.6 || tapado) { j.ruta.shift(); obj = j.ruta[0]; }
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
    for (let a = 0; a < js.length; a++) for (let c = a + 1; c < js.length; c++) {
      const p = js[a], q = js[c];
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = REGLAS.RADIO_JUGADOR * 1.6;
      if (d > 0.001 && d < m) {
        const e = (m - d) / 2;
        p.x -= dx / d * e; p.y -= dy / d * e; q.x += dx / d * e; q.y += dy / d * e;
      }
    }
    // y que el empujon no saque a nadie del campo (O-305)
    for (const j of js) { const c = this._dentro(j.x, j.y); j.x = c.x; j.y = c.y; }
  }

  _moverBalon(P) {
    // el tiro en vuelo va a lo suyo: nadie lo coge, le sale al paso (O-325)
    if (this.tiro) return this._volarTiro(P);
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
    for (const j of this.enCampo()) {      // el expulsado no la coge (O-311)
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
      // se pita al recibir, tambien si el balon llego al punto antes que el (O-305)
      if (b.fueraDe === j.id) return this._pitarFueraDeJuego(j);
      const directo = b.pase && b.pase.directo && j.lado === this.jugadores[b.pase.de].lado ? this.jugadores[b.pase.de] : null;
      // si el pase venia bombeado, el remate es de cabeza o de volea: se mira antes
      // de coger(), que borra el pase (O-309)
      const alto = !!(b.pase && b.pase.alto);
      // el balon bombeado (un centro, un despeje) que corta un defensa de campo cerca
      // de su porteria no se lo queda: lo despeja de cabeza, como en la vida real, y a
      // veces se va a corner (O-315)
      if (alto && j.lado !== this.jugadores[b.pase.de].lado && !j.esPortero && this._cercaDeSuPorteria(j, REGLAS.CABEZA.zona)) {
        const de = b.pase.de;
        this.apunta("¡" + j.nombre + " despeja de cabeza!", "mal").pierde = de;
        return this._despejeCabeza(j);
      }
      // el pase completado de un companero: poder de afinidad (O-328)
      if (b.pase && j.lado === this.jugadores[b.pase.de].lado) this._pase(j.lado);
      if (b.pase && j.lado !== this.jugadores[b.pase.de].lado) {
        // el que dio el pase lo pierde: su "¡Uy!" en el campo (O-306)
        this.apunta("¡" + j.nombre + " corta el pase!", "mal").pierde = b.pase.de;
        this._robo(j);
      }
      this.coger(j);
      if (directo) {
        const g = this.porteriaRival(j), dg = Math.hypot(g.x - j.x, g.y - j.y);
        if (dg <= this._alcanceTiro(j)) this._empezarTiro(j, dg, directo, false, alto);
        // el remate anunciado no se queda en nada sin decirlo (O-305)
        else this.apunta(j.nombre + " está demasiado lejos para rematar", "aviso", j.lado);
      }
    }
  }

  _fuera() {
    const b = this.balon, ax = REGLAS.ANCHO / 2, ay = REGLAS.LARGO / 2;
    const contra = 1 - b.ultimo;
    let tipo = "banda";
    if (Math.abs(b.y) > ay) {
      // por el fondo: si la toco el que ataca hacia ahi, saque de puerta; si no, corner
      const fondoDe = this.jugadores.find(j => j.esPortero && Math.sign(-j.dir) === Math.sign(b.y)) || this.portero(contra);
      tipo = fondoDe.lado !== b.ultimo ? "puerta" : "corner";
      // los rotulos del color del que saca (O-306)
      if (fondoDe.lado !== b.ultimo) {
        this.apunta("Saque de puerta").ro = { que: "puerta", lado: fondoDe.lado, sub: "Para " + this.nombres[fondoDe.lado] };
        fondoDe.x = 0; fondoDe.y = Math.sign(b.y) * (ay - 5);
        this.coger(fondoDe); this._sacando(fondoDe);
      } else {
        const ataca = this.equipo(contra).filter(j => !j.esPortero)
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        this.apunta("Corner para " + this.nombres[contra]).ro = { que: "corner", lado: contra, sub: "Para " + this.nombres[contra] };
        ataca.x = Math.sign(b.x || 1) * (ax - 0.6); ataca.y = Math.sign(b.y) * (ay - 0.6);
        this.coger(ataca); this._sacando(ataca);
      }
    } else {
      const saca = this.equipo(contra).filter(j => !j.esPortero)
        .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      this.apunta("Saque de banda para " + this.nombres[contra]).ro = { que: "banda", lado: contra, sub: "Saque para " + this.nombres[contra] };
      saca.x = Math.sign(b.x) * (ax - 0.5); saca.y = Math.max(-ay + 1, Math.min(ay - 1, b.y));
      this.coger(saca); this._sacando(saca);
    }
    for (const j of this.jugadores) j.ruta = [];
    // sin resultado nuevo: el de antes se queda (con su misma k) (O-319)
    this.fase = "resultado"; this._retener(0.8, tipo);
    // tras el rotulo, la espera de su saque (O-308)
    this._saquePendiente = { tipo, lado: this.dueno().lado };
  }
  // el que saca: un respiro, como en la falta (si no, un rival pegado le sacaba
  // un duelo al volver el juego), y su pase no es fuera de juego (O-305)
  _sacando(j) {
    j.respiro = REGLAS.RESPIRO_SAQUE;
    if (j.esPortero) this._aManos(j);
    this._saque = { id: j.id, x: j.x, y: j.y };
  }

  // --- online: la foto del partido que el anfitrion manda al invitado --------
  // Solo lo que cambia (posiciones, balon, fase, duelo...); los datos fijos de
  // los jugadores ya los tienen los dos desde el principio.
  foto(ladoRutas = 1) {
    const r1 = v => Math.round(v * 10) / 10;
    return {
      n: this.pasos, f: this.fase, m: this.mitad, r: r1(this.reloj), g: this.goles.slice(),
      t: this.tension.map(Math.round), e: this.espera, ta: this.tacticaActiva, tl: this.tacticaLista,
      pz: this.pausa, pq: this.pausasQuedan, pm: this.paseMarcado, ls: this.listos,
      j: this.jugadores.map(j => [r1(j.x), r1(j.y), j.dir, j.conBalon ? 1 : 0, j.aturdido > 0 ? 1 : 0,
        j.esPortero ? Math.round(j.kp) : 0, j.lado === ladoRutas ? j.ruta.slice(0, 6).map(p => [r1(p.x), r1(p.y)]) : [],
        r1(j.aura), r1(j.auraLista),
        // a por quien va a presionar, para la linea roja del invitado (-1: nadie) (O-305)
        j.lado === ladoRutas && j.presiona !== null && j.presiona !== undefined ? j.presiona : -1,
        // el totem: focos ganados con el puesto, 0-2 (O-310)
        j.totem || 0,
        // las tarjetas: 0 nada, 1 amarilla, 2 expulsado (O-311)
        j.expulsado ? 2 : j.amarillas ? 1 : 0,
        // los refuerzos de los cambios: [[pct, hasta]] (O-315)
        (j.refuerzos || []).map(r => [r.pct, r1(r.hasta)]),
        // la fatiga del portero: paradas que lleva, 0-5 (O-328)
        j.fatiga || 0]),
      // el pase lleva al final quien lo da: sin el, el invitado no podia rematar
      // de primeras ni se veia la patada en la 3D (O-305)
      b: [r1(this.balon.x), r1(this.balon.y), this.balon.dueno, this.balon.pase ? [this.balon.pase.a, r1(this.balon.pase.destino.x), r1(this.balon.pase.destino.y),
        this.balon.pase.alto ? 1 : 0, r1(this.balon.pase.total || 0), this.balon.pase.de] : 0],
      d: this.duelo ? JSON.parse(JSON.stringify(this.duelo)) : null,
      re: this.resultado ? Object.assign({ k: this.nResultado || 0 }, this.resultado) : null,
      cb: this.cambios,
      ev: this.eventos.length, ul: this.eventos.slice(-10),
      // al final: las estadisticas del descanso y del final (O-306), copiadas
      es: JSON.parse(JSON.stringify(this.estadisticas)),
      // O-308: el saque que se espera, el numero de la espera y los cambios
      // pendientes del lado del invitado (los del anfitrion no se le ensenan,
      // como en la vida real hasta que se hacen)
      sq: this.esperaSaque ? Object.assign({}, this.esperaSaque) : null, ne: this.nEspera,
      pc: { l: ladoRutas, c: (this.cambiosPendientes[ladoRutas] || []).map(c => ({ sale: c.sale, entra: c.entra })) },
      // O-310: la hiperbarra de los dos y hasta cuando no puede invocar cada equipo
      hb: this.hiper.map(r1), hk: this.hiperBloqueo.map(r1),
      // O-312: la tanda de penaltis (orden, tiros, quien empieza y quien gana) o null
      pn: this.tanda ? JSON.parse(JSON.stringify(this.tanda)) : null,
      // O-315: el descuento de cada parte por los cambios (s de reloj)
      dc: this.descuento.slice(),
      // O-324: el saque que aun no se ha hecho tras pulsar Jugar (la ayuda de la tactil)
      ps: this.porSacar ? { id: this.porSacar.id, lado: this.porSacar.lado, tipo: this.porSacar.tipo } : null,
      // O-325: el tiro en vuelo (de donde salio, adonde va, lo alto, lo que lleva y quien lo
      // chuto), para que el invitado pinte su estela, su placa y su altura
      tv: this.tiro ? this._fotoTiro(r1) : null,
      // O-327: el tiempo de invocacion (quien lo pidio, quien ha invocado, lo que lleva) y
      // desde cuando puede pedir otro cada lado
      iv: { ti: this.tiempoInvocar ? { lado: this.tiempoInvocar.lado, hechos: this.tiempoInvocar.hechos.slice(), t: r1(this.tiempoInvocar.t) } : null,
            il: this.invocarLista.map(r1) },
      // O-328: la carga de configuracion de cada equipo ([rango, t, n, p]), el poder de
      // afinidad y el combo de tecnicas
      cf: this.carga.map(c => [c.rango, r1(c.t), r1(c.n), c.p || 0]),
      af: this.afinidad.map(r1), co: this.combo.slice(),
    };
  }
  _fotoTiro(r1) {
    const T = this.tiro;
    return { id: T.id, lado: T.lado, tirador: T.tirador, ultimo: T.ultimo, x0: r1(T.x0), y0: r1(T.y0), tx: r1(T.tx), ty: r1(T.ty),
             total: r1(T.total), h: T.h, at: Math.round(T.at), vaselina: T.vaselina ? 1 : 0, paso: T.paso };
  }

  aplicarFoto(f) {
    if (f.n < this.pasos) return false;              // una foto vieja
    this.pasos = f.n; this.fase = f.f; this.mitad = f.m; this.reloj = f.r; this.goles = f.g;
    this.tension = f.t; this.espera = f.e;
    for (const c of (f.cb || []).slice(this.cambios.length)) this._hacerCambio(c[0], c[1], c[2], true);
    if (f.ta) { this.tacticaActiva = f.ta; this.tacticaLista = f.tl; }
    if (f.pq) { this.pausa = f.pz; this.pausasQuedan = f.pq; this.paseMarcado = f.pm; }
    if (f.ls) this.listos = f.ls;       // quien ha pulsado ya en el descanso (O-305)
    // las tarjetas (O-311), tras los cambios (el que entra puede ser el expulsado
    // despues) y antes que lo demas: la roja se repite con _expulsar (silencioso), que
    // quita esPortero (no va en la foto) y pone al mismo portero nuevo que el
    // anfitrion; asi su KP ya se lee abajo. Un anfitrion anterior no la manda
    f.j.forEach((q, k) => {
      const j = this.jugadores[k];
      if (!j || q.length <= 11) return;
      if (q[11] === 0 || q[11] === 1) j.amarillas = q[11];
      else if (q[11] === 2 && !j.expulsado) this._expulsar(j, true);
    });
    f.j.forEach((q, k) => {
      const j = this.jugadores[k];
      j.destX = q[0]; j.destY = q[1];
      if (j.x === 0 && j.y === 0 || Math.hypot(q[0] - j.x, q[1] - j.y) > 12) { j.x = q[0]; j.y = q[1]; }
      j.dir = q[2]; j.conBalon = !!q[3]; j.aturdido = q[4] ? 1 : 0;
      if (j.esPortero) j.kp = q[5];
      j.ruta = q[6].map(p => ({ x: p[0], y: p[1] }));
      if (q.length > 7) { j.aura = q[7]; j.auraLista = q[8]; }
      if (q.length > 9) j.presiona = q[9] >= 0 ? q[9] : null;     // 0 es un jugador (O-305)
      if (q.length > 10) j.totem = q[10] || 0;                        // O-310
      // los refuerzos de los cambios (O-315): los del anfitrion, que mandan sobre los
      // que se dio el invitado al repetir el cambio
      if (q.length > 12 && Array.isArray(q[12])) j.refuerzos = q[12].filter(r => Array.isArray(r) && r.length === 2).map(r => ({ pct: Number(r[0]) || 0, hasta: Number(r[1]) || 0 }));
      if (q.length > 13) j.fatiga = Number(q[13]) || 0;     // O-328
    });
    // O-315: el descuento de cada parte (si falta o no tiene su forma, como estaba)
    if (Array.isArray(f.dc) && f.dc.length === this.descuento.length) this.descuento = f.dc.map(v => Number(v) || 0);
    this.balon.destX = f.b[0]; this.balon.destY = f.b[1]; this.balon.dueno = f.b[2];
    // mientras sea el mismo pase se deja el mismo objeto: la 3D mira si es otro
    // para que el que pasa patee una vez, no en cada foto (O-305)
    const bp = f.b[3], vp = this.balon.pase;
    this.balon.pase = !bp ? null
      : vp && vp.de === bp[5] && vp.a === bp[0] && vp.destino.x === bp[1] && vp.destino.y === bp[2] ? vp
      : { de: bp[5], a: bp[0], destino: { x: bp[1], y: bp[2] }, alto: !!bp[3], total: bp[4] || 0 };
    this.duelo = f.d;
    if (f.re && (!this.resultado || this.resultado.k !== f.re.k)) this.resultado = f.re;
    // los sucesos que faltan (la foto trae los diez ultimos). Tras un corte largo
    // faltan mas: se dice una vez y el resto queda en null, que el registro
    // salta; antes quedaban huecos que congelaban al invitado (O-305)
    const primero = f.ev - f.ul.length;
    if (this.eventos.length < primero) {
      const u = f.ul[0] || {};
      this.eventos.push({ paso: f.n, mitad: u.mitad || f.m, reloj: u.reloj !== undefined ? u.reloj : f.r,
        texto: "(se han perdido " + (primero - this.eventos.length) + " sucesos por un corte de la red)", clase: "aviso" });
      while (this.eventos.length < primero) this.eventos.push(null);
    }
    for (let k = Math.max(this.eventos.length, primero); k < f.ev; k++) this.eventos[k] = f.ul[k - primero];
    // las estadisticas (O-306); un anfitrion anterior no las manda: se quedan a 0
    // y la pagina no las ensena (mira si hubo algun paso de posesion)
    if (f.es && f.es.tiros && f.es.posesion) this.estadisticas = f.es;
    // O-308: la espera del saque, su numero (para que el "Jugar" del invitado sea
    // de esta espera) y sus cambios pendientes; si falta algo, se deja como estaba
    this.esperaSaque = f.sq || null;
    if (typeof f.ne === "number") this.nEspera = f.ne;
    if (f.pc && Array.isArray(f.pc.c) && (f.pc.l === 0 || f.pc.l === 1)) {
      this.cambiosPendientes = [[], []];
      this.cambiosPendientes[f.pc.l] = f.pc.c.map(c => ({ sale: c.sale, entra: c.entra }));
    }
    // O-310: la hiperbarra y el bloqueo de invocar (para los botones del invitado)
    if (Array.isArray(f.hb) && f.hb.length === 2) this.hiper = f.hb.slice();
    if (Array.isArray(f.hk) && f.hk.length === 2) this.hiperBloqueo = f.hk.slice();
    // O-312: la tanda de penaltis (null: no la hay); si falta o no tiene su forma, se
    // deja como estaba
    if (f.pn === null) this.tanda = null;
    else if (f.pn && Array.isArray(f.pn.orden) && Array.isArray(f.pn.tiros) && f.pn.orden.length === 2 && f.pn.tiros.length === 2) this.tanda = f.pn;
    // la prorroga, que el invitado no ve empezar (no pasa por _descanso): el descanso
    // tras la 2.ª parte o una parte 3 o 4. Su cambio de mas, una vez. En un descanso,
    // la parte que viene es siempre la siguiente
    if (!this.prorroga && (f.m >= 3 || (f.f === "descanso" && f.m === 2))) {
      this.prorroga = true;
      this.cambiosQuedan = this.cambiosQuedan.map(c => c + REGLAS.CAMBIOS_PRORROGA);
    }
    if (this.fase === "descanso") this.siguiente = this.mitad + 1;
    // O-324: el saque por hacer (un anfitrion anterior no lo manda: ninguno)
    const ps = f.ps;
    this.porSacar = ps && typeof ps.id === "number" && this.jugadores[ps.id] ? { id: ps.id, lado: ps.lado, tipo: ps.tipo, t: 0 } : null;
    // O-325: el tiro en vuelo (el invitado no lo mueve: solo lo pinta)
    const tv = f.tv;
    this.tiro = tv && (tv.lado === 0 || tv.lado === 1) && this.jugadores[tv.ultimo] && isFinite(tv.total)
      ? Object.assign({ hechos: [], recorrido: 0, vel: REGLAS.VUELO.vel, tec: null, paso: {} }, tv, { vaselina: !!tv.vaselina }) : null;
    // O-327: el tiempo de invocacion y la recarga del boton (un anfitrion anterior no lo
    // manda: ninguno); y cada uno con la forma que le toca por su hiper (el modo)
    const iv = f.iv || {}, ti = iv.ti;
    this.tiempoInvocar = ti && (ti.lado === 0 || ti.lado === 1) && Array.isArray(ti.hechos) && ti.hechos.length === 2
      ? { lado: ti.lado, hechos: ti.hechos.map(x => (typeof x === "number" ? x : -1)), t: Number(ti.t) || 0 } : null;
    if (Array.isArray(iv.il) && iv.il.length === 2) this.invocarLista = iv.il.map(v => Number(v) || 0);
    // O-328: la carga, la afinidad y el combo (un anfitrion anterior no los manda: como estaban)
    if (Array.isArray(f.cf) && f.cf.length === 2) f.cf.forEach((q, l) => { if (Array.isArray(q)) Object.assign(this.carga[l], { rango: Number(q[0]) || 0, t: Number(q[1]) || 0, n: Number(q[2]) || 0, p: Number(q[3]) || 0 }); });
    if (Array.isArray(f.af) && f.af.length === 2) this.afinidad = f.af.map(v => Number(v) || 0);
    if (Array.isArray(f.co) && f.co.length === 2) this.combo = f.co.map(v => Number(v) || 0);
    this._formas(true);
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
    // si en este paso ya se ha parado el juego (remate de primeras, saque, fuera
    // de juego), no se monta un duelo encima (O-305)
    if (this.fase !== "juego") return;
    const d = this.dueno();
    if (!d || d.respiro > 0 || this._especial(d.lado, "ignora_foco") || this._enManos(d)) return;
    let rival = null, md = REGLAS.DISTANCIA_DUELO;
    for (const r of this.enCampo()) {      // sin duelos con un expulsado (O-311)
      if (r.lado === d.lado || r.aturdido > 0 || r.respiro > 0 || r.esPortero) continue;
      const dd = Math.hypot(r.x - d.x, r.y - d.y);
      if (dd < md) { md = dd; rival = r; }
    }
    if (rival) this._empezarDuelo(d, rival);
  }

  // el portero con el balon en su area: en futbol no se le quita de las manos.
  // Solo los primeros segundos, para que no se pueda perder tiempo (O-305)
  _enManos(d) {
    const m = this._manos;
    return !!d && d.esPortero && !!m && m.id === d.id && this.segundosDeJuego() < m.hasta
      && Math.abs(d.y + d.dir * REGLAS.LARGO / 2) < REGLAS.AREA_Y && Math.abs(d.x) < REGLAS.AREA_X;
  }
}
