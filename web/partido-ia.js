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
    if (p.fase !== "juego") return;
    this.siguiente -= REGLAS.PASO;
    if (this.siguiente > 0) return;
    this.siguiente = this.cada;
    const d = p.dueno();
    if (d && d.lado === this.lado) this._conBalon(d);
  }

  _conBalon(d) {
    const p = this.p;
    const g = p.porteriaRival(d);
    const aPuerta = Math.hypot(g.x - d.x, g.y - d.y);
    // chutar: cerca de la porteria, mas cuanto mas cerca
    const libre = !p.equipo(1 - this.lado).some(r => !r.esPortero && p._distanciaALinea(r, d, g).delante && p._distanciaALinea(r, d, g).d < 2.5);
    if (aPuerta < 22 && this.azar() < (aPuerta < 13 ? 0.3 : libre ? 0.12 : 0.02)) {
      p.ordenar({ tipo: "tiro", de: d.id });
      return;
    }
    // presionado: pasar al companero mejor colocado
    const rivales = p.equipo(1 - this.lado);
    const presion = Math.min(...rivales.map(r => Math.hypot(r.x - d.x, r.y - d.y)));
    if (presion < 6 && this.azar() < 0.7) {
      const mejor = this._mejorPase(d, rivales);
      if (mejor) { p.ordenar({ tipo: "pase", de: d.id, a: mejor.id }); return; }
    }
    // correr hacia la porteria, con un poco de zigzag
    const lado = (this.azar() - 0.5) * 10;
    p.ordenar({ tipo: "ruta", jugador: d.id, puntos: [{ x: d.x + lado, y: d.y + d.dir * 9 }, { x: g.x * 0.3 + lado * 0.5, y: g.y - d.dir * 10 }] });
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
    if (pend.rol === "tiro") return p.elegir(this.lado, { tiro: escoge(pend.opciones) });
    if (pend.rol === "porteria") {
      const e = { parada: escoge(pend.opciones) };
      if (pend.muro) e.muro = escoge(pend.muro.opciones.filter(o => o.clave !== "nada"));
      return p.elegir(this.lado, e);
    }
    return p.elegir(this.lado, escoge(pend.opciones));
  }
}
