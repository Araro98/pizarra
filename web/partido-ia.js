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
  }

  // la llama el bucle en cada paso
  pensar() {
    const p = this.p;
    if (p.fase === "duelo") return this._elegir();
    if (p.fase === "descanso") {
      // sus cambios y enseguida lista para la segunda parte: el descanso espera
      // a que pulsen los dos (O-305)
      this._cambios();
      p.ordenar({ tipo: "seguir", lado: this.lado });
      return;
    }
    if (p.fase !== "juego") return;
    this.siguiente -= REGLAS.PASO;
    if (this.siguiente > 0) return;
    this.siguiente = this.cada;
    const d = p.dueno();
    this._tactica(d);
    this._invocar(d);
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

  _conBalon(d) {
    const p = this.p;
    // el portero no sale conduciendo: saca en cuanto puede, al companero mejor
    // colocado o en largo hacia arriba, y sin ruta. Con la ruta del ataque se
    // iba hasta el area rival y dejaba su porteria vacia (O-305)
    if (d.esPortero) {
      const m = this._mejorPase(d, p.equipo(1 - this.lado));
      if (m) p.ordenar({ tipo: "pase", de: d.id, a: m.id });
      else p.ordenar({ tipo: "pasePunto", de: d.id, x: d.x, y: d.y + d.dir * 35, alto: true });
      p.ordenar({ tipo: "ruta", jugador: d.id, puntos: [] });
      return;
    }
    const g = p.porteriaRival(d);
    const aPuerta = Math.hypot(g.x - d.x, g.y - d.y);
    // chutar: cerca de la porteria, mas cuanto mas cerca
    const libre = !p.equipo(1 - this.lado).some(r => !r.esPortero && p._distanciaALinea(r, d, g).delante && p._distanciaALinea(r, d, g).d < 2.5);
    const T = REGLAS.IA_TIRO;
    if (aPuerta < T.lejos && this.azar() < (aPuerta < T.cerca ? T.pCerca : libre ? T.pLibre : T.pTapado)) {
      p.ordenar({ tipo: "tiro", de: d.id });
      return;
    }
    // presionado: pasar al companero mejor colocado
    const rivales = p.equipo(1 - this.lado);
    const presion = Math.min(...rivales.map(r => Math.hypot(r.x - d.x, r.y - d.y)));
    if (presion < 6 && this.azar() < 0.7) {
      const mejor = this._mejorPase(d, rivales);
      if (mejor) {
        p.ordenar({ tipo: "pase", de: d.id, a: mejor.id });
        // si el companero queda cerca de la porteria, a veces remata de primeras
        const gm = p.porteriaRival(mejor);
        if (Math.hypot(gm.x - mejor.x, gm.y - mejor.y) < 16 && this.azar() < 0.2) p.ordenar({ tipo: "directo", de: d.id });
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

  // invoca el espiritu del que lleva el balon cerca del area, o del que defiende
  _invocar(d) {
    const p = this.p;
    if (!d || this.azar() > 0.3) return;
    const g = p.porteriaRival(d);
    // solo quien puede invocar ya (sin aura ni recargando): uno bloqueado le
    // quitaba la invocacion a un companero (O-305)
    const puede = j => j.espiritu && !p.conAura(j) && p.segundosDeJuego() >= j.auraLista;
    let quien = null;
    if (d.lado === this.lado && puede(d) && Math.hypot(g.x - d.x, g.y - d.y) < 30) quien = d;
    if (d.lado !== this.lado) quien = p.equipo(this.lado).find(j => puede(j) && Math.hypot(j.x - d.x, j.y - d.y) < 8) || null;
    if (!quien) return;
    // invoca si luego le queda tension para la supertecnica del espiritu: si
    // no, invocaba y casi nunca podia usarla (O-305)
    const te = this._tecEspiritu(quien);
    if (p.tension[this.lado] < REGLAS.INVOCAR_COSTE + (te ? te.tp : 40)) return;
    p.ordenar({ tipo: "invocar", jugador: quien.id });
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
    const reserva = Math.max(0, ...p.equipo(this.lado).filter(c => p.conAura(c)).map(c => { const t = this._tecEspiritu(c); return t ? t.tp : 0; }));
    const escoge = (ops) => {
      const esp = ops.find(o => o.clave[0] === "t" && o.puede && / \u2726/.test(o.nombre));
      if (esp) return esp.clave;
      const tecs = ops.filter(o => o.clave[0] === "t" && o.puede && p.tension[this.lado] - o.tp >= reserva).sort((a, b) => b.poder - a.poder);
      if (tecs.length && this.azar() < this.gana) return tecs[0].clave;
      // en defensa, cargar si tiene mas fisico que tecnica
      if (ops.some(o => o.clave === "cargar") && j.stats[4] + j.stats[3] > j.stats[2] + j.stats[5]) return "cargar";
      if (ops.some(o => o.clave === "potente") && this.azar() < 0.4) return "potente";
      return "normal";
    };
    // la segunda tecnica (cadena o muro) solo si la tension llega para las dos:
    // el motor cobra una y anulaba la otra sin decir nada (O-305). Con copias,
    // para no tocar las opciones del duelo
    const gastoDe = (ops, c) => (ops.find(o => o.clave === c) || {}).tp || 0;
    const caben = (ops, gasto) => ops.map(o => Object.assign({}, o, { puede: o.puede && o.tp + gasto <= p.tension[this.lado] }));
    if (pend.rol === "tiro") {
      const e = { tiro: escoge(pend.opciones) };
      if (pend.cadena) {
        const c = caben(pend.cadena.opciones, gastoDe(pend.opciones, e.tiro)).filter(o => o.clave !== "nada" && o.puede).sort((a, b) => b.poder - a.poder)[0];
        e.cadena = c && this.azar() < this.gana ? c.clave : "nada";
      }
      return p.elegir(this.lado, e);
    }
    if (pend.rol === "porteria") {
      const e = { parada: escoge(pend.opciones) };
      // primero la parada del portero, y el muro con lo que quede
      if (pend.muro) e.muro = escoge(caben(pend.muro.opciones.filter(o => o.clave !== "nada"), gastoDe(pend.opciones, e.parada)));
      return p.elegir(this.lado, e);
    }
    return p.elegir(this.lado, escoge(pend.opciones));
  }
}
