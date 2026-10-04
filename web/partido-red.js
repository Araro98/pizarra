/* El online del partido (NOTAS O-287). Usa la misma conexion que el draft
   (web/draft-red.js: MQTT por WebSocket a tres servidores publicos, sin
   cuenta ni puertos), con sus propios temas bajo "partido/":

     partido/conectados/<usuario>   quien esta en Partido (se borra solo)
     partido/buzon/<usuario>        invitaciones y respuestas
     partido/sala/<id>/anfitrion    lo que manda el que invita: los equipos y
                                    unas 10 fotos por segundo del partido
     partido/sala/<id>/invitado     lo que manda el invitado: su equipo, sus
                                    ordenes y que sigue vivo

   El que invita lleva el partido (su PC simula); el invitado manda ordenes y
   pinta las fotos. Cada mensaje llega hasta tres veces (uno por servidor):
   las ordenes van numeradas y las fotos tambien, y lo repetido se tira. */
"use strict";

class RedPartido {
  constructor() {
    this.red = new RedDraft();
    this.yo = null; this.gente = {}; this.presentes = {};
    this.sala = null; this.rol = null; this.rival = null;
    this.alGente = null; this.alInvitacion = null; this.alRespuesta = null;
    this.alSala = null; this.alEstado = null;
    this.ordenesVistas = 0; this.nOrden = 0; this.ultimaFoto = -1;
    this.repetir = {};
    this.red.alMensaje = (t, m, r, k) => this._mensaje(t, m, k);
    this.red.alEstado = e => { if (e === "conectado") this.anunciarme(); if (this.alEstado) this.alEstado(e); };
  }

  entrar(nombre, equipo) {
    const slug = slugUsuario(nombre);
    if (!slug) throw new Error("Escribe un nombre con alguna letra o numero.");
    this.yo = { nombre, slug }; this.equipo = equipo || "";
    this.red.suscribir("partido/conectados/+");
    this.red.suscribir("partido/buzon/" + slug);
    this.red.conectar({ tema: RAIZ_TEMAS + "partido/conectados/" + slug, mensaje: "", retener: true });
    clearInterval(this._presencia);
    this._presencia = setInterval(() => this.anunciarme(), 30000);
    window.addEventListener("beforeunload", () => this.salir());
  }
  anunciarme() {
    if (!this.yo || !this.red.conectado) return;
    this.red.publicar("partido/conectados/" + this.yo.slug, { nombre: this.yo.nombre, ts: Date.now(),
      estado: this.sala ? "jugando" : "libre", equipo: this.equipo }, true);
  }
  salir() {
    if (this.yo && this.red.conectado) this.red.publicar("partido/conectados/" + this.yo.slug, null, true);
    this.red.cerrar();
  }

  // repite un mensaje cada 2 s hasta que se pare (QoS 0: se puede perder)
  _repite(clave, fn, veces = 30) {
    this.para(clave);
    let n = 0;
    fn();
    this.repetir[clave] = setInterval(() => { if (++n >= veces) this.para(clave); else fn(); }, 2000);
  }
  para(clave) { clearInterval(this.repetir[clave]); delete this.repetir[clave]; }

  invitar(slug, nombre) {
    const sala = Math.random().toString(36).slice(2, 10);
    this.pendiente = { slug, nombre, sala };
    this._repite("invita", () => this.red.publicar("partido/buzon/" + slug,
      { tipo: "invita", de: this.yo.slug, nombre: this.yo.nombre, sala, equipo: this.equipo }));
    return sala;
  }
  cancelar() {
    if (!this.pendiente) return;
    this.para("invita");
    this.red.publicar("partido/buzon/" + this.pendiente.slug, { tipo: "cancela", de: this.yo.slug, sala: this.pendiente.sala });
    this.pendiente = null;
  }
  responder(inv, acepta) {
    this.red.publicar("partido/buzon/" + inv.de, { tipo: acepta ? "acepta" : "rechaza", de: this.yo.slug, nombre: this.yo.nombre, sala: inv.sala });
    if (acepta) this._entrarSala(inv.sala, "invitado", { slug: inv.de, nombre: inv.nombre });
  }

  _entrarSala(sala, rol, rival) {
    this.sala = sala; this.rol = rol; this.rival = rival;
    this.ordenesVistas = 0; this.nOrden = 0; this.ultimaFoto = -1;
    this.red.suscribir("partido/sala/" + sala + "/" + (rol === "anfitrion" ? "invitado" : "anfitrion"));
    this.anunciarme();
    if (this.alSala) this.alSala({ tipo: "dentro", rol, rival, sala });
  }
  salirSala() {
    for (const k of Object.keys(this.repetir)) this.para(k);
    if (this.sala) {
      this.mandar({ tipo: "adios" });
      this.red.desuscribir("partido/sala/" + this.sala + "/" + (this.rol === "anfitrion" ? "invitado" : "anfitrion"));
    }
    this.sala = null; this.rol = null; this.rival = null; this.pendiente = null;
    this.anunciarme();
  }

  // a la sala, por mi lado (anfitrion o invitado)
  mandar(msg, retener) {
    if (!this.sala) return;
    this.red.publicar("partido/sala/" + this.sala + "/" + this.rol, msg, retener);
  }
  // el invitado: una orden numerada (el anfitrion tira las repetidas)
  orden(o) { this.mandar({ tipo: "orden", k: ++this.nOrden, o }); }

  _mensaje(tema, msg, servidor) {
    if (tema.startsWith("partido/conectados/")) {
      const s = tema.slice("partido/conectados/".length);
      const p = this.presentes[s] = this.presentes[s] || {};
      if (!msg) delete p[servidor || 0]; else p[servidor || 0] = msg;
      const vistos = Object.values(p).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (vistos.length) this.gente[s] = vistos[0]; else delete this.gente[s];
      if (this.alGente) this.alGente(this.gente);
      return;
    }
    if (this.yo && tema === "partido/buzon/" + this.yo.slug && msg) {
      if (msg.tipo === "invita") { if (this.alInvitacion) this.alInvitacion(msg); return; }
      if (msg.tipo === "cancela") { if (this.alInvitacion) this.alInvitacion(msg); return; }
      if (this.pendiente && msg.sala === this.pendiente.sala) {
        if (msg.tipo === "acepta" && !this.sala) {
          this.para("invita");
          this._entrarSala(msg.sala, "anfitrion", { slug: msg.de, nombre: msg.nombre });
        }
        if (msg.tipo === "rechaza") { this.para("invita"); this.pendiente = null; }
        if (this.alRespuesta) this.alRespuesta(msg);
      }
      return;
    }
    if (this.sala && tema === "partido/sala/" + this.sala + "/" + (this.rol === "anfitrion" ? "invitado" : "anfitrion") && msg) {
      if (msg.tipo === "orden") {
        if (msg.k <= this.ordenesVistas) return;          // repetida (llega por los tres servidores)
        this.ordenesVistas = msg.k;
      }
      if (msg.tipo === "foto") {
        if (msg.foto.n <= this.ultimaFoto) return;
        this.ultimaFoto = msg.foto.n;
      }
      this.vistoRival = Date.now();
      if (this.alSala) this.alSala(msg);
    }
  }
}

/* Lo que viaja de un equipo: solo lo que usa el partido (sin textos largos). */
function equipoParaRed(d) {
  return {
    nombre: d.nombre,
    formacion: { nombre: d.formacion.nombre, puestos: d.formacion.puestos.map(p => ({ puesto: p.puesto, posicion: p.posicion, x: p.x, y: p.y })) },
    jugadores: d.jugadores.map(j => ({
      nombre: j.nombre, cara: j.cara, posicion: j.posicion, elemento: j.elemento, nivel: j.nivel,
      stats: j.stats, puesto: j.puesto, dorsal: j.dorsal,
      tecnicas: (j.tecnicas || []).map(t => ({ ranura: t.ranura, nombre: t.nombre, tipo: t.tipo, subtipo: t.subtipo,
        elemento: t.elemento, poder: t.poder, tp: t.tp, interno: t.interno })),
    })),
  };
}
