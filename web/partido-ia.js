/* La maquina (NOTAS O-286): decide por un lado del partido como lo haria un
   jugador: con el balon corre, pasa o chuta; en un duelo elige su mejor
   supertecnica si le llegan los PT (y a veces la guarda). Solo da ordenes al
   motor, igual que el raton: asi luego se puede cambiar por un jugador online. */
"use strict";

class Maquina {
  constructor(partido, lado, opciones = {}) {
    this.p = partido; this.lado = lado;
    this.azar = Azar((opciones.semilla || 777) + lado * 101);
    this.cada = opciones.cada || 0.45;        // segundos entre decisiones
    this.siguiente = 0;
    this.gana = opciones.dificultad || 0.75;  // lo que usa sus tecnicas (0..1)
    // el AYUDANTE de "focos automaticos" elige por la persona: la hiperbarra la
    // gasta ella, el no invoca ni saca hipers (O-310)
    this.sinHiper = !!opciones.sinHiper;
  }

  // adonde apunta al chutar j (O-335): al lado de la porteria en el que no esta su portero (si
  // esta en medio, a suertes), de 1 m del centro hasta el margen del palo. Como la persona, el
  // tiro va ahi y nunca fuera
  _apunte(j) {
    const p = this.p, g = p.porteriaRival(j), por = p.portero(1 - j.lado), dentro = REGLAS.PORTERIA / 2 - REGLAS.APUNTAR.margen;
    const s = por && Math.abs(por.x - g.x) > 0.3 ? -Math.sign(por.x - g.x) : this.azar() < 0.5 ? -1 : 1;
    return Math.round(s * (1 + this.azar() * (dentro - 1)) * 10) / 10;
  }

  // la llama el bucle en cada paso
  pensar() {
    const p = this.p;
    if (p.fase === "duelo") return this._elegir();
    // el tiempo de invocacion (O-327): decide una vez si invoca a alguien y sigue
    if (p.fase === "invocacion") return this._enInvocacion();
    if (p.fase === "descanso") {
      // sus cambios y enseguida lista para la segunda parte: el descanso espera
      // a que pulsen los dos (O-305)
      this._cambios();
      p.ordenar({ tipo: "seguir", lado: this.lado });
      return;
    }
    // la espera de un saque: coloca a los suyos (O-313)
    if (p.fase === "saque") return this._colocar();
    if (p.fase !== "juego") return;
    this.siguiente -= REGLAS.PASO;
    if (this.siguiente > 0) return;
    this.siguiente = this.cada;
    const d = p.dueno();
    // el corner que se coloco ya se ha sacado (o lo coge otro): se olvida
    if (this._corner && (!d || d.id !== this._corner.id)) this._corner = null;
    this._tactica(d);
    this._invocar(d);
    // tras pulsar Jugar nadie se mueve hasta que se saca: la maquina saca tras un
    // momento, para que la persona dibuje sus flechas (O-324)
    const ps = p.porSacar;
    if (ps && ps.lado === this.lado && ps.t < REGLAS.SAQUE_MAQUINA) return;
    if (d && d.lado === this.lado) this._conBalon(d);
  }

  // en el descanso (O-297): si en el banquillo hay uno mejor para el mismo
  // puesto, entra por el peor de ese puesto (uno por descanso)
  _cambios() {
    const p = this.p;
    if (this._cambiosEn === p.mitad || !p.puedeCambiar(this.lado)) return;
    this._cambiosEn = p.mitad;
    const banco = p.banquillos[this.lado] || [], usado = p.banquilloUsado[this.lado];
    const valor = d => (d.stats || []).reduce((a, b) => a + Number(b || 0), 0);
    let mejor = null;
    banco.forEach((d, k) => {
      if (usado[k]) return;
      const esPor = d.posicion === "POR";
      const peor = p.equipo(this.lado).filter(j => j.esPortero === esPor && (esPor || j.posicion === d.posicion) && !j.conBalon)
        .sort((a, b) => valor(a) - valor(b))[0];
      if (peor && valor(d) > valor(peor) * 1.05 && (!mejor || valor(d) - valor(peor) > mejor.gana))
        mejor = { k, sale: peor.id, gana: valor(d) - valor(peor) };
    });
    if (mejor) p.ordenar({ tipo: "cambio", lado: this.lado, sale: mejor.sale, entra: mejor.k });
  }

  // en la espera de un saque (O-313; Aaron, O-307 punto 14): coloca a los suyos con
  // sentido, como una persona arrastrandolos. Defendiendo: barrera en las faltas
  // cerca de su area y marcas a los que esperan en su area (faltas y corners) o cerca
  // del balon (banda), y uno al palo en el corner. Atacando un corner o una falta
  // cerca del area: a los suyos al area (en la falta, sin fuera de juego). Sin azar
  // (sale lo mismo cada vez) y UNA vez, al empezar la espera: antes se repetia toda la
  // espera y seguia a los que mueve el rival, y al colocar a uno se movia con el su
  // marca, como si fueran juntos (Aaron, O-322 punto 1; O-324). Lo que ya esta en su
  // sitio no se toca. Quien va a cada sitio se elige por donde estaba al empezar la espera
  _colocar() {
    const p = this.p, sq = p.esperaSaque;
    if (!sq || !p.colocable) return;
    if (this._casa && this._casa.n === p.nEspera) return;
    this._casa = { n: p.nEspera, sitio: {} };
    for (const j of p.equipo(this.lado)) this._casa.sitio[j.id] = { x: j.x, y: j.y };
    const sitios = sq.lado === this.lado ? this._sitiosAtaque(sq) : this._sitiosDefensa(sq);
    for (const [id, s] of sitios) {
      const j = p.jugadores[id];
      if (!p.colocable(j)) continue;
      const c = p.sitioValido(j, s.x, s.y);
      if (!c || Math.hypot(c.x - j.x, c.y - j.y) < 0.5) continue;
      p.ordenar({ tipo: "colocar", lado: this.lado, jugador: id, x: c.x, y: c.y });
    }
  }
  // los de campo que se pueden colocar y una funcion que da, de los que quedan, el que
  // estaba mas cerca de un punto al empezar la espera (y lo quita). Los `deja` mas
  // adelantados (atacando, los mas atrasados) no se tocan: por si hay contraataque
  _reparto(deja, atras) {
    const p = this.p, casa = j => this._casa.sitio[j.id] || j;
    const mios = p.equipo(this.lado).filter(j => !j.esPortero && p.colocable(j));
    const dir = (p.equipo(this.lado)[0] || { dir: 1 }).dir;
    const orden = [...mios].sort((a, b) => (casa(b).y - casa(a).y) * dir * (atras ? -1 : 1) || a.id - b.id);
    const libres = new Set(orden.slice(Math.min(deja, orden.length)).map(j => j.id));
    return (x, y) => {
      let m = null, md = Infinity;
      for (const j of mios) {
        if (!libres.has(j.id)) continue;
        const c = casa(j), d = Math.hypot(c.x - x, c.y - y);
        if (d < md) { md = d; m = j; }
      }
      if (m) libres.delete(m.id);
      return m;
    };
  }
  _sitiosDefensa(sq) {
    const p = this.p, R = REGLAS, b = p.balon, sitios = [];
    const dir = (p.equipo(this.lado)[0] || { dir: 1 }).dir, g = { x: 0, y: -R.LARGO / 2 * dir };
    const coge = this._reparto(2, false);
    // la barrera: en una falta a menos de 32 m de su porteria, de 2 a 4 en linea a
    // 9,15 m del balon (y un poco mas), tapando el palo cercano (el portero, el otro)
    if (sq.tipo === "falta") {
      const dg = Math.hypot(b.x - g.x, b.y - g.y), n = dg < 21 ? 4 : dg < 26 ? 3 : dg < 32 ? 2 : 0;
      const ax = Math.abs(b.x) < 3 ? 0 : Math.sign(b.x) * R.PORTERIA / 4;
      const ux = ax - b.x, uy = g.y - b.y, ul = Math.hypot(ux, uy) || 1, dx = ux / ul, dy = uy / ul, D = R.COLOCAR_LEJOS.falta + 0.5;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * 1.5, x = b.x + dx * D - dy * o, y = b.y + dy * D + dx * o, j = coge(x, y);
        if (j) sitios.push([j.id, { x, y }]);
      }
    }
    // las marcas: 1,6 m por delante de cada uno, hacia su porteria. En faltas y
    // corners, a los que esperan en su area o cerca; en la banda, a los que estan
    // cerca del balon. Primero los mas peligrosos (los mas cerca de su porteria)
    const dentro = q => (q.y - g.y) * dir;
    const rivales = p.equipo(1 - this.lado).filter(r => !r.esPortero && r.id !== b.dueno);
    const peligro = sq.tipo === "corner" || sq.tipo === "falta" ? rivales.filter(r => dentro(r) < R.AREA_Y + 8 && Math.abs(r.x) < R.AREA_X + 6)
      : sq.tipo === "banda" ? rivales.filter(r => Math.hypot(r.x - b.x, r.y - b.y) < 22) : [];
    peligro.sort((r, s) => Math.hypot(r.x - g.x, r.y - g.y) - Math.hypot(s.x - g.x, s.y - g.y) || r.id - s.id);
    for (const r of peligro.slice(0, 6)) {
      const vx = g.x - r.x, vy = g.y - r.y, vl = Math.hypot(vx, vy) || 1;
      const x = r.x + vx / vl * 1.6, y = r.y + vy / vl * 1.6, j = coge(x, y);
      if (j) sitios.push([j.id, { x, y }]);
    }
    // en el corner, uno al palo cercano
    if (sq.tipo === "corner") {
      const x = Math.sign(b.x || 1) * (R.PORTERIA / 2 + 0.5), y = g.y + dir * 1.2, j = coge(x, y);
      if (j) sitios.push([j.id, { x, y }]);
    }
    return sitios;
  }
  _sitiosAtaque(sq) {
    const p = this.p, R = REGLAS, b = p.balon, d = p.dueno();
    if (!d || d.lado !== this.lado) return [];
    const g = p.porteriaRival(d), dir = d.dir, ns = Math.sign(b.x || 1);
    // a `fondo` m de la linea de gol rival
    const P = (x, fondo) => ({ x, y: g.y - dir * fondo });
    let puntos = [];
    if (sq.tipo === "corner") puntos = [P(ns * 3, 5.5), P(-ns * 4, 6.5), P(0, 10.5), P(-ns * 7, 16)];
    else if (sq.tipo === "falta" && Math.hypot(b.x - g.x, b.y - g.y) < 32) {
      // en la falta hay fuera de juego: no mas alla del penultimo defensa (con 0,8 m
      // de margen), y nadie encima del que saca
      const fondo = Math.max(11, R.LARGO / 2 - (p.lineaFueraDeJuego(this.lado) - 0.8));
      puntos = [P(-8, fondo), P(0, fondo), P(8, fondo)].filter(q => Math.hypot(q.x - b.x, q.y - b.y) > 4);
    }
    const coge = this._reparto(2, true), sitios = [];
    for (const q of puntos) { const j = coge(q.x, q.y); if (j) sitios.push([j.id, q]); }
    // el corner lo saca hacia uno de estos (el mas libre al volver el juego)
    if (sq.tipo === "corner") this._corner = { id: d.id, ids: sitios.map(s => s[0]) };
    return sitios;
  }

  _conBalon(d) {
    const p = this.p;
    // el portero no sale conduciendo: saca en cuanto puede, al companero mejor
    // colocado o en largo hacia arriba, y sin ruta. Con la ruta del ataque se
    // iba hasta el area rival y dejaba su porteria vacia (O-305)
    if (d.esPortero) {
      const m = this._mejorPase(d, p.equipo(1 - this.lado));
      if (m) p.ordenar({ tipo: "pase", de: d.id, a: m.id });
      // en largo, hacia una banda, como los porteros de verdad (O-315; antes por el
      // medio): a veces se va fuera
      else p.ordenar({ tipo: "pasePunto", de: d.id, x: (this.azar() < 0.5 ? -1 : 1) * (18 + this.azar() * 12), y: d.y + d.dir * 35, alto: true });
      p.ordenar({ tipo: "ruta", jugador: d.id, puntos: [] });
      return;
    }
    // el corner: bombeado al que este mas libre de los que coloco en el area (si no,
    // salia conduciendo desde el banderin) (O-313)
    const cs = this._corner;
    if (cs && cs.id === d.id) {
      this._corner = null;
      const rivales = p.equipo(1 - this.lado);
      const libre = c => Math.min(...rivales.map(r => Math.hypot(r.x - c.x, r.y - c.y)));
      const a = cs.ids.map(id => p.jugadores[id]).filter(c => c && !c.expulsado && c.lado === this.lado && c.id !== d.id)
        .sort((x, y) => libre(y) - libre(x) || x.id - y.id)[0];
      if (a) {
        p.ordenar({ tipo: "pase", de: d.id, a: a.id, alto: true });
        // y a veces lo remata de primeras, como un centro (O-315)
        if (REGLAS.IA_CENTRO && this.azar() < REGLAS.IA_CENTRO.remate) p.ordenar({ tipo: "directo", de: d.id, x: this._apunte(a) });
        return;
      }
    }
    const g = p.porteriaRival(d);
    const rivales = p.equipo(1 - this.lado);
    const presion = Math.min(...rivales.map(r => Math.hypot(r.x - d.x, r.y - d.y)));
    // apretado cerca de su porteria, despeja hacia la banda mas cerca, arriba (O-315):
    // como en la vida real, mejor un saque de banda que perderla delante del area
    // (REGLAS.IA_DESPEJE). Apunta pasada la linea: casi siempre sale
    const D = REGLAS.IA_DESPEJE, fondo = d.y * d.dir + REGLAS.LARGO / 2;     // m hasta su linea de fondo
    if (Math.hypot(d.x, d.y + REGLAS.LARGO / 2 * d.dir) < D.zona && presion < D.presion && this.azar() < D.p) {
      const banda = Math.sign(d.x) || (this.azar() < 0.5 ? -1 : 1);
      // pegado a su linea de fondo y por un lado, a veces la manda a corner
      if (fondo < (D.corner || 0) && Math.abs(d.x) > REGLAS.AREA_X / 2 && this.azar() < (D.pCorner || 0)) {
        p.ordenar({ tipo: "despeje", de: d.id, x: banda * (REGLAS.PORTERIA / 2 + 6 + this.azar() * 20), y: -d.dir * (REGLAS.LARGO / 2 + 2 + this.azar() * 4) });
        return;
      }
      const [f0, f1] = D.fuera;
      p.ordenar({ tipo: "despeje", de: d.id, x: banda * (REGLAS.ANCHO / 2 + f0 + this.azar() * (f1 - f0)), y: d.y + d.dir * (14 + this.azar() * 14) });
      return;
    }
    const aPuerta = Math.hypot(g.x - d.x, g.y - d.y);
    // chutar: cerca de la porteria, mas cuanto mas cerca. Solo desde donde se puede, como la
    // persona (el area y un poco mas; con un tiro largo a punto, mas lejos; O-335), y adonde
    // apunta (_apunte)
    const llega = p.enRangoTiro ? p.enRangoTiro(d) : true;
    const libre = !p.equipo(1 - this.lado).some(r => !r.esPortero && p._distanciaALinea(r, d, g).delante && p._distanciaALinea(r, d, g).d < 2.5);
    const T = REGLAS.IA_TIRO;
    // el portero rival tocado (O-328): con el PP de VR, que se gasta con cada parada, cuando
    // su mejor tiro ya llega a lo que le queda chuta casi siempre, tambien desde mas lejos
    // (hasta `lejano`) y con la linea libre
    if (llega && aPuerta < (T.lejano || T.lejos) && (libre || aPuerta < T.cerca) && this.azar() < (T.pDebil || 0) && this._porteroTocado(d, aPuerta)) {
      p.ordenar({ tipo: "tiro", de: d.id, x: this._apunte(d) });
      return;
    }
    if (llega && aPuerta < T.lejos && this.azar() < (aPuerta < T.cerca ? T.pCerca : libre ? T.pLibre : T.pTapado)) {
      p.ordenar({ tipo: "tiro", de: d.id, x: this._apunte(d) });
      return;
    }
    // el tiro lejano (O-315): con la linea tapada, un tercio
    if (llega && aPuerta >= T.lejos && aPuerta < (T.lejano || 0) && this.azar() < (T.pLejano || 0) * (libre ? 1 : 1 / 3)) {
      p.ordenar({ tipo: "tiro", de: d.id, x: this._apunte(d) });
      return;
    }
    // el centro (O-315): por la banda cerca del area rival, bombeado al area, como en
    // la vida real (antes iba siempre por el medio): a una zona (primer palo, segundo
    // palo o punto de penalti), la mas cerca del companero del area mas libre; va a por
    // el el que este mas cerca y a veces lo remata de primeras (testarazo o volea).
    // Puede irse de largo (saque de puerta) o cortarlo un defensa (REGLAS.IA_CENTRO)
    const CE = REGLAS.IA_CENTRO;
    if (CE && Math.abs(d.x) > CE.banda && (g.y - d.y) * d.dir < CE.fondo && this.azar() < CE.p) {
      const s = Math.sign(d.x), zonas = [[s * 2.5, 5], [-s * 3.5, 6], [-s * 1, 11]].map(([x, f]) => ({ x, y: g.y - d.dir * f }));
      const libreDe = c => Math.min(...rivales.map(r => Math.hypot(r.x - c.x, r.y - c.y)));
      const enArea = p.equipo(this.lado).filter(c => c !== d && !c.esPortero && c.aturdido <= 0 && Math.abs(c.x) < REGLAS.AREA_X
        && (g.y - c.y) * d.dir < REGLAS.AREA_Y + 2 && !p.fueraEnPase(c, d));
      const a = enArea.sort((x, y) => libreDe(y) - libreDe(x) || x.id - y.id)[0];
      const z = a ? zonas.sort((u, v) => Math.hypot(u.x - a.x, u.y - a.y) - Math.hypot(v.x - a.x, v.y - a.y))[0] : zonas[1];
      p.ordenar({ tipo: "pasePunto", de: d.id, x: z.x, y: z.y, alto: true });
      if (a && this.azar() < CE.remate) p.ordenar({ tipo: "directo", de: d.id, x: this._apunte(a) });
      return;
    }
    // presionado: pasar al companero mejor colocado
    if (presion < 6 && this.azar() < 0.7) {
      const mejor = this._mejorPase(d, rivales);
      if (mejor) {
        p.ordenar({ tipo: "pase", de: d.id, a: mejor.id });
        // si el companero queda cerca de la porteria, a veces remata de primeras
        const gm = p.porteriaRival(mejor);
        if (Math.hypot(gm.x - mejor.x, gm.y - mejor.y) < 16 && this.azar() < 0.2) p.ordenar({ tipo: "directo", de: d.id, x: this._apunte(mejor) });
        return;
      }
    }
    // el pase al hueco: a la espalda de la defensa, para el que esta en la linea
    const hueco = this._alHueco(d, rivales);
    if (hueco && this.azar() < 0.3) {
      p.ordenar({ tipo: "pasePunto", de: d.id, x: hueco.x, y: hueco.y });
      return;
    }
    // correr hacia la porteria, con un poco de zigzag
    const lado = (this.azar() - 0.5) * 10;
    p.ordenar({ tipo: "ruta", jugador: d.id, puntos: [{ x: d.x + lado, y: d.y + d.dir * 9 }, { x: g.x * 0.3 + lado * 0.5, y: g.y - d.dir * 10 }] });
  }

  // una tactica cuando viene bien: defensiva si el rival ataca en mi campo,
  // ofensiva si ataco yo en el suyo (y a veces sin mas)
  _tactica(d) {
    const p = this.p, tac = p.tacticas[this.lado] || [];
    if (!tac.length || p.tacticaActiva[this.lado]) return;
    const ahora = p.segundosDeJuego();
    // las que no tienen efecto en el partido no cuentan: el motor no las activa
    // (O-304) y, siempre listas, tapaban a las demas (O-305)
    const listas = tac.map((t, k) => k).filter(k => (tac[k].efectos || []).length && ahora >= p.tacticaLista[this.lado][k]);
    if (!listas.length) return;
    // de ataque tambien las de disputa, velocidad de regate y poder (Ataque en
    // tres frentes no salia nunca) (O-305)
    const tiene = (t, re) => (t.efectos || []).some(e => e.que && e.que.some(q => re.test(q)));
    const def = t => (t.efectos || []).some(e => e.especial === "robo" || e.especial === "aturde") || tiene(t, /^(df|kp|muro)$/);
    const ata = t => (t.efectos || []).some(e => e.especial === "ignora_foco" || e.especial === "sin_intercepcion") || tiene(t, /^(at|tiro|foco|disputa|vel_regate|poder)/);
    const b = p.balon, miCampo = b.y * p.equipo(this.lado)[0].dir < 0;
    let quiero = null;
    if (d && d.lado !== this.lado && miCampo) quiero = listas.find(k => def(tac[k]));
    else if (d && d.lado === this.lado && !miCampo) quiero = listas.find(k => ata(tac[k]));
    // "sin mas", una cualquiera de las listas: con la primera siempre, la
    // tercera no llegaba nunca (Monte Fuji) (O-305)
    if (quiero === undefined || quiero === null) { if (this.azar() < 0.02) quiero = listas[Math.floor(this.azar() * listas.length)]; else return; }
    if (this.azar() < 0.35) p.ordenar({ tipo: "tactica", lado: this.lado, k: quiero });
  }

  // invoca el espiritu del que lleva el balon cerca del area, o del que defiende.
  // Con la hiperbarra (O-310): solo quien puede ya (puedeHiper: barra, recarga, 2
  // activos y los 15 s del equipo; uno bloqueado le quitaba la invocacion a un
  // companero, O-305). Si tiene la supertecnica de su espiritu, cuando le llega la
  // tension para usarla (si no, invocaba y casi nunca podia, O-305); si no la tiene,
  // solo con la barra llena: si no, se quedaba sin hiper para los focos
  _invocar(d) {
    const p = this.p;
    if (this.sinHiper || !d || this.azar() > 0.3) return;
    const quien = this._quienInvoca(d);
    if (!quien) return;
    // con el tiempo de invocacion (O-327) primero para el juego (si su boton esta listo)
    // y en la parada invoca a ese; sin el, invoca sin parar, como antes
    if (p.conTiempoInvocar) {
      if (p.ordenar({ tipo: "tiempoInvocar", lado: this.lado })) this._enInvocacion(quien);
      return;
    }
    p.ordenar({ tipo: "invocar", jugador: quien.id });
  }
  // a quien invocaria ahora (o null): el del balon cerca del area, o el que defiende cerca
  // del balon. Si tiene la supertecnica de su espiritu, cuando le llega la tension para
  // usarla; si no, solo con la barra llena
  _quienInvoca(d) {
    const p = this.p;
    if (!d) return null;
    const g = p.porteriaRival(d);
    const puede = j => p.puedeHiper(j).si;
    let quien = null;
    if (d.lado === this.lado && puede(d) && Math.hypot(g.x - d.x, g.y - d.y) < 30) quien = d;
    if (d.lado !== this.lado) quien = p.equipo(this.lado).find(j => puede(j) && Math.hypot(j.x - d.x, j.y - d.y) < 8) || null;
    if (!quien) return null;
    const te = this._tecEspiritu(quien);
    if (te ? p.tension[this.lado] < p.coste(quien, te) : p.hiper[this.lado] < REGLAS.HIPER_MAX) return null;     // (con el combo, menos, O-328)
    return quien;
  }
  // en el tiempo de invocacion (O-327), una vez por parada: invoca a `quien` (el suyo, si
  // la pidio ella) o al que invocaria ahora y, si no, sigue sin invocar. El AYUDANTE no
  // decide por la persona (la hiperbarra la gasta ella)
  _enInvocacion(quien) {
    const p = this.p;
    if (this.sinHiper || p.fase !== "invocacion" || p.listos[this.lado] || this._invocoEn === p.nEspera) return;
    this._invocoEn = p.nEspera;
    const j = quien || this._quienInvoca(p.dueno());
    if (j && p.ordenar({ tipo: "invocar", jugador: j.id })) return;
    p.ordenar({ tipo: "seguir", lado: this.lado, espera: p.nEspera });
  }

  // la supertecnica del espiritu de j que sirve en su puesto (la de parar, solo
  // si es portero), o null
  _tecEspiritu(j) {
    return j.tecnicas.find(t => t.espiritu && (j.esPortero ? t.tipo === "Parada" : t.tipo !== "Parada")) || null;
  }

  // un punto a la espalda de la defensa al que llega antes un companero que esta
  // en la linea (sin fuera de juego al salir el pase) que cualquier rival (O-303)
  _alHueco(d, rivales) {
    const p = this.p, dir = d.dir, linea = p.lineaFueraDeJuego(this.lado);
    if (d.y * dir < -10) return null;                       // desde mi campo, no
    let mejor = null, nota = -1e9;
    for (const c of p.equipo(this.lado)) {
      if (c === d || c.esPortero || c.aturdido > 0) continue;
      const yc = c.y * dir;
      if (yc < linea - 5 || yc <= d.y * dir + 4 || p.fueraEnPase(c, d)) continue;   // en un saque no hay fuera de juego (O-305)
      const fondo = REGLAS.LARGO / 2 - 7;
      const destino = { x: Math.max(-REGLAS.ANCHO / 2 + 4, Math.min(REGLAS.ANCHO / 2 - 4, c.x * 0.85)), y: Math.min(fondo, yc + 8) * dir };
      const mio = Math.hypot(destino.x - c.x, destino.y - c.y);
      const suyo = Math.min(...rivales.filter(r => !r.esPortero).map(r => Math.hypot(destino.x - r.x, destino.y - r.y)));
      if (suyo < mio + 1.5) continue;                         // llegan antes ellos
      const cortado = rivales.some(r => !r.esPortero && p._distanciaALinea(r, d, destino).d < 1.6 && p._distanciaALinea(r, d, destino).delante);
      if (cortado) continue;
      const n = (suyo - mio) + yc * 0.2;
      if (n > nota) { nota = n; mejor = destino; }
    }
    return mejor;
  }

  // lo que le quitaria al tiro de tir el muro m: su DF del muro con su mejor supertecnica
  // de bloqueo que pague su equipo (sin ella, la de sin tecnica) (O-328)
  _muroEstimado(m, tir) {
    const p = this.p;
    if (!m || !p._valorMuro) return 0;
    let v = p._valorMuro(m, null, tir, null);
    for (const t of m.tecnicas) if (REGLAS.sirve(t, "muro") && !(t.espiritu && !p.conAura(m)) && p.coste(m, t) <= p.tension[m.lado]) v = Math.max(v, p._valorMuro(m, t, tir, null));
    return v;
  }
  // si el mejor tiro que d puede hacer ahora desde `dist` m (su mejor supertecnica que
  // pague, o Tirar) llega a IA_TIRO.debil x lo que le queda al portero rival (su PP con las
  // pasivas, sin tecnica) (O-328)
  _porteroTocado(d, dist) {
    const p = this.p, por = p.portero(1 - this.lado);
    if (!por || !por.kpMax || !p._valorParada) return false;
    const du = { distancia: dist, directo: null, alto: false, penalti: false };
    let mejor = p._valorTiro(d, null, du, "normal");
    for (const t of d.tecnicas) {
      if (!REGLAS.sirve(t, "tiro") || (t.espiritu && !p.conAura(d)) || p.coste(d, t) > p.tension[this.lado]) continue;
      if (Math.max(1, Number(t.jugadores) || 1) > 1) continue;
      mejor = Math.max(mejor, p._valorTiro(d, t, du, "normal"));
    }
    return mejor * REGLAS.efectoElemental(d, null, por) >= p._valorParada(por, null, d) * (REGLAS.IA_TIRO.debil || 1);
  }

  _mejorPase(d, rivales) {
    let mejor = null, nota = -1e9;
    for (const c of this.p.equipo(this.lado)) {
      if (c.id === d.id || c.esPortero || c.aturdido > 0) continue;
      const dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (dist < 6 || dist > 38) continue;
      const libre = Math.min(...rivales.map(r => Math.hypot(r.x - c.x, r.y - c.y)));
      // el pase no puede pasar rozando a un rival
      const cortado = rivales.some(r => !r.esPortero && this.p._distanciaALinea(r, d, c).d < 1.6 && this.p._distanciaALinea(r, d, c).delante);
      if (cortado) continue;
      // no pasa a quien esta en fuera de juego (casi nunca se le escapa)
      if (this.p.fueraEnPase(c, d) && this.azar() < 0.92) continue;   // en un saque no hay (O-305)
      const avance = (c.y - d.y) * d.dir;
      const n = libre * 1.2 + avance * 0.6 - dist * 0.1;
      if (n > nota) { nota = n; mejor = c; }
    }
    return mejor;
  }

  _elegir() {
    const p = this.p, pend = p.pendientes()[this.lado];
    if (!pend) return;
    const j = p.jugadores[pend.jugador];
    // con un companero con el aura puesta se guarda lo que cuesta la tecnica de
    // su espiritu, y si sale la del espiritu (la de la estrella, tambien en
    // "... (contra-tiro)") se usa: si no, gastaba la tension en otras y no
    // llegaba a usarla (O-305)
    const reserva = Math.max(0, ...p.equipo(this.lado).filter(c => p.conAura(c)).map(c => { const t = this._tecEspiritu(c); return t ? p.coste(c, t) : 0; }));
    // uso: lo que usa sus tecnicas (en el tiro, mas: IA_TIRO.tecnica, O-328)
    const escoge = (ops, uso = this.gana) => {
      const esp = ops.find(o => o.clave[0] === "t" && o.puede && / \u2726/.test(o.nombre));
      if (esp) return esp.clave;
      const tecs = ops.filter(o => o.clave[0] === "t" && o.puede && p.tension[this.lado] - o.tp >= reserva).sort((a, b) => b.poder - a.poder);
      if (tecs.length && this.azar() < uso) return tecs[0].clave;
      // en defensa, cargar si tiene mas fisico que tecnica
      if (ops.some(o => o.clave === "cargar") && j.stats[4] + j.stats[3] > j.stats[2] + j.stats[5]) return "cargar";
      // el defensa con amarilla entra fuerte la mitad de veces: otra falta seria
      // roja (O-311)
      if (ops.some(o => o.clave === "potente") && this.azar() < (pend.rol === "defensa" && j.amarillas ? 0.2 : 0.4)) return "potente";
      return "normal";
    };
    // la segunda tecnica (cadena o muro) solo si la tension llega para las dos:
    // el motor cobra una y anulaba la otra sin decir nada (O-305). Con copias,
    // para no tocar las opciones del duelo
    const gastoDe = (ops, c) => (ops.find(o => o.clave === c) || {}).tp || 0;
    const caben = (ops, gasto) => ops.map(o => Object.assign({}, o, { puede: o.puede && o.tp + gasto <= p.tension[this.lado] }));
    const du = p.duelo;
    // la hipertecnica (O-310). En un foco: si el duelo importa (defiende en su tercio
    // o ataca a menos de 30 m de la porteria rival) y su mejor total no llega al poder
    // de base del rival x1,05, el 60 % de las veces (el 80 % con la barra llena). En
    // un tiro (no gana sola): el portero invoca si el poder de base del tiro pasa de
    // su mejor parada; el que chuta, si tiene el tiro de su espiritu y tension para
    // el. Invoca y elige en el siguiente pensar(), con los numeros nuevos. El
    // AYUDANTE nunca: la hiperbarra la gasta la persona
    if (!this.sinHiper) {
      const rival = du.base ? du.base[1 - this.lado] : undefined;
      const mejor = ops => Math.max(0, ...ops.filter(o => o.puede && o.clave !== "hiper" && o.clave !== "cargar" && typeof o.total === "number").map(o => o.total));
      if (du.tipo === "foco") {
        const oh = pend.opciones.find(o => o.clave === "hiper" && o.puede);
        if (oh && rival !== undefined) {
          const g = p.porteriaRival(j);
          const importa = pend.rol === "ataque" ? Math.hypot(g.x - j.x, g.y - j.y) < 30 : Math.abs(j.y + g.y) < REGLAS.LARGO / 3;
          if (importa && mejor(pend.opciones) < rival * 1.05 && this.azar() < (p.hiper[this.lado] >= REGLAS.HIPER_MAX ? 0.8 : 0.6)) return p.elegir(this.lado, "hiper");
        }
      } else if (pend.rol !== "muro" && pend.rol !== "cadena" && p.puedeHiper(j).si) {     // (el muro y la cadena del tiro que viaja, no: O-325)
        // (el portero de un penalti, igual que el de un tiro, O-312)
        const quiere = pend.rol === "porteria" || pend.rol === "penalti_parada" ? rival !== undefined && rival > mejor(pend.opciones)
          : j.tecnicas.some(t => t.espiritu && REGLAS.sirve(t, "tiro") && p.coste(j, t) <= p.tension[this.lado]);
        if (quiere && p.ordenar({ tipo: "invocar", jugador: j.id })) return;
      }
    }
    // el penalti (O-312): la zona al azar con los pesos de IA_PENALTI (izquierda,
    // centro, derecha) y la supertecnica como siempre (la mejor que pueda pagar, a
    // veces ninguna)
    if (pend.rol === "penalti_tiro" || pend.rol === "penalti_parada") {
      const pesos = REGLAS.IA_PENALTI[pend.rol === "penalti_tiro" ? "tiro" : "parada"];
      let x = this.azar(), zona = 0;
      while (zona < 2 && x >= pesos[zona]) { x -= pesos[zona]; zona++; }
      const c = escoge(pend.opciones);
      return p.elegir(this.lado, { zona, tecnica: c[0] === "t" ? c : null });
    }
    // el tiro que viaja (O-325): al muro le llega el balon y bloquea con su mejor
    // supertecnica (o sin ella); al companero con tiro de cadena, encadena con la mejor que
    // pague si se la juega (como antes con el tiro), si no lo deja pasar
    if (pend.rol === "muro") return p.elegir(this.lado, { muro: escoge(pend.opciones.filter(o => o.clave !== "nada")) });
    if (pend.rol === "cadena") {
      const c = pend.opciones.filter(o => o.clave[0] === "t" && o.puede && p.tension[this.lado] - o.tp >= reserva).sort((a, b) => b.poder - a.poder)[0];
      return p.elegir(this.lado, { cadena: c && this.azar() < this.gana ? c.clave : "nada" });
    }
    if (pend.rol === "tiro") {
      const e = { tiro: escoge(pend.opciones, Math.max(this.gana, REGLAS.IA_TIRO.tecnica || 0)) };
      // sin supertecnica (O-309): con un defensa en la linea que no esta pegado, la
      // vaselina le pasa por encima (a veces); con el balon alto, la volea a veces
      if (e.tiro === "normal") {
        // (y siempre que el muro de VR le quitaria mas que la vaselina, O-328)
        const vas = pend.opciones.find(o => o.clave === "vaselina"), nor = pend.opciones.find(o => o.clave === "normal");
        const mejorVas = () => vas && nor && typeof vas.total === "number" && vas.total > nor.total - this._muroEstimado(p.jugadores[du.muro], j);
        if (du.muro !== null && du.muro !== undefined && !du.muroPegado && (this.azar() < 0.6 || mejorVas())) e.tiro = "vaselina";
        else if (du.alto && this.azar() < 0.4) e.tiro = "volea";
      } else if (du.muro !== null && du.muro !== undefined && !du.muroPegado && !pend.cadena) {
        // con supertecnica y un defensa en la linea (no pegado): el muro de VR le quita su
        // numero entero (O-328); si la vaselina llega con mas, la vaselina
        const vas = pend.opciones.find(o => o.clave === "vaselina"), tec = pend.opciones.find(o => o.clave === e.tiro);
        if (vas && tec && typeof vas.total === "number" && vas.total > tec.total - this._muroEstimado(p.jugadores[du.muro], j)) e.tiro = "vaselina";
      }
      // tras una vaselina no se encadena
      if (pend.cadena && e.tiro !== "vaselina") {
        const c = caben(pend.cadena.opciones, gastoDe(pend.opciones, e.tiro)).filter(o => o.clave !== "nada" && o.puede).sort((a, b) => b.poder - a.poder)[0];
        e.cadena = c && this.azar() < this.gana ? c.clave : "nada";
      } else if (pend.cadena) e.cadena = "nada";
      return p.elegir(this.lado, e);
    }
    if (pend.rol === "porteria") {
      const e = { parada: escoge(pend.opciones) };
      // sin supertecnica: si el tiro viene fuerte (su poder de base pasa del 90 % de
      // su Parar), despeja (x1,25, pero no se la queda) (O-309)
      if (e.parada === "normal") {
        const parar = (pend.opciones.find(o => o.clave === "normal") || {}).total, tiro = du.base && du.base[1 - this.lado];
        if (parar && tiro > parar * 0.9 && pend.opciones.some(o => o.clave === "despejar")) e.parada = "despejar";
      }
      // primero la parada del portero, y el muro con lo que quede
      if (pend.muro) e.muro = escoge(caben(pend.muro.opciones.filter(o => o.clave !== "nada"), gastoDe(pend.opciones, e.parada)));
      return p.elegir(this.lado, e);
    }
    return p.elegir(this.lado, escoge(pend.opciones));
  }
}
