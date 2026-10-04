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
    if (p.fase === "descanso") return this._cambios();
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
    const listas = tac.map((t, k) => k).filter(k => ahora >= p.tacticaLista[this.lado][k]);
    if (!listas.length) return;
    const def = t => (t.efectos || []).some(e => e.especial === "robo" || e.especial === "aturde" || (e.que && (e.que.includes("df") || e.que.includes("kp") || e.que.includes("muro"))));
    const ata = t => (t.efectos || []).some(e => e.especial === "ignora_foco" || (e.que && (e.que.includes("at") || e.que.includes("tiro") || e.que.includes("foco"))));
    const b = p.balon, miCampo = b.y * p.equipo(this.lado)[0].dir < 0;
    let quiero = null;
    if (d && d.lado !== this.lado && miCampo) quiero = listas.find(k => def(tac[k]));
    else if (d && d.lado === this.lado && !miCampo) quiero = listas.find(k => ata(tac[k]));
    if (quiero === undefined || quiero === null) { if (this.azar() < 0.02) quiero = listas[0]; else return; }
    if (this.azar() < 0.35) p.ordenar({ tipo: "tactica", lado: this.lado, k: quiero });
  }

  // invoca el espiritu del que lleva el balon cerca del area, o del que defiende
  _invocar(d) {
    const p = this.p;
    if (!d || p.tension[this.lado] < REGLAS.INVOCAR_COSTE + 40 || this.azar() > 0.3) return;
    const g = p.porteriaRival(d);
    let quien = null;
    if (d.lado === this.lado && d.espiritu && Math.hypot(g.x - d.x, g.y - d.y) < 30) quien = d;
    if (d.lado !== this.lado) quien = p.equipo(this.lado).find(j => j.espiritu && Math.hypot(j.x - d.x, j.y - d.y) < 8) || null;
    if (quien) p.ordenar({ tipo: "invocar", jugador: quien.id });
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
      if (this.p._enFueraDeJuego(c, d) && this.azar() < 0.92) continue;
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
    const escoge = (ops) => {
      const tecs = ops.filter(o => o.clave[0] === "t" && o.puede).sort((a, b) => b.poder - a.poder);
      if (tecs.length && this.azar() < this.gana) return tecs[0].clave;
      // en defensa, cargar si tiene mas fisico que tecnica
      if (ops.some(o => o.clave === "cargar") && j.stats[4] + j.stats[3] > j.stats[2] + j.stats[5]) return "cargar";
      if (ops.some(o => o.clave === "potente") && this.azar() < 0.4) return "potente";
      return "normal";
    };
    if (pend.rol === "tiro") {
      const e = { tiro: escoge(pend.opciones) };
      if (pend.cadena) {
        const c = pend.cadena.opciones.filter(o => o.clave !== "nada" && o.puede).sort((a, b) => b.poder - a.poder)[0];
        e.cadena = c && this.azar() < this.gana ? c.clave : "nada";
      }
      return p.elegir(this.lado, e);
    }
    if (pend.rol === "porteria") {
      const e = { parada: escoge(pend.opciones) };
      if (pend.muro) e.muro = escoge(pend.muro.opciones.filter(o => o.clave !== "nada"));
      return p.elegir(this.lado, e);
    }
    return p.elegir(this.lado, escoge(pend.opciones));
  }
}
