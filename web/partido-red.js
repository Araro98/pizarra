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
   las ordenes van numeradas y las fotos tambien, y lo repetido se tira.

   La version del Partido (REGLAS.VERSION, O-308) va en la presencia, en la
   invitacion y en la respuesta: con otra version no se juega (sin `v` es la 1). */
"use strict";

// la version del Partido de un mensaje: sin `v`, un Pizarra anterior (la 1) (O-308)
function versionDe(m) { return (m && Number(m.v)) || 1; }
function otraVersion(m) { return versionDe(m) !== REGLAS.VERSION; }

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
      estado: this.sala ? "jugando" : "libre", equipo: this.equipo, v: REGLAS.VERSION }, true);
  }
  salir() {
    // al cerrar la pestana o pulsar Inicio a mitad de partido, el rival se
    // entera; antes se quedaba en "esperando a..." para siempre (O-305)
    if (this.sala) this.mandar({ tipo: "adios" });
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
      { tipo: "invita", de: this.yo.slug, nombre: this.yo.nombre, sala, equipo: this.equipo, v: REGLAS.VERSION }));
    return sala;
  }
  cancelar() {
    if (!this.pendiente) return;
    this.para("invita");
    this.red.publicar("partido/buzon/" + this.pendiente.slug, { tipo: "cancela", de: this.yo.slug, sala: this.pendiente.sala });
    this.pendiente = null;
  }
  responder(inv, acepta) {
    this.red.publicar("partido/buzon/" + inv.de, { tipo: acepta ? "acepta" : "rechaza", de: this.yo.slug, nombre: this.yo.nombre, sala: inv.sala, v: REGLAS.VERSION });
    if (acepta) this._entrarSala(inv.sala, "invitado", { slug: inv.de, nombre: inv.nombre });
  }

  _entrarSala(sala, rol, rival) {
    this.sala = sala; this.rol = rol; this.rival = rival; this.rivalFuera = false;
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
        if (msg.tipo === "acepta" && !this.sala && otraVersion(msg)) {
          // otra version del Partido: no se entra. Un Pizarra anterior no mira la
          // version y ya esta en la sala esperando los equipos: se le dice adios
          // en el tema que escucha (O-305 ya sabe ensenarlo) (O-308)
          this.para("invita");
          this.red.publicar("partido/sala/" + msg.sala + "/anfitrion", { tipo: "adios" });
          this.pendiente = null;
          if (this.alRespuesta) this.alRespuesta(Object.assign({}, msg, { otraVersion: true }));
          return;
        }
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
      // la eleccion de un duelo no pasa por este filtro: lleva su duelo, se repite
      // hasta que llega y el anfitrion no aplica dos del mismo lado. Aqui se tiraba
      // si llegaba por un servidor lento detras de otra orden posterior (O-305)
      if (msg.tipo === "orden" && !(msg.o && msg.o.tipo === "elegir" && msg.o.duelo !== undefined)) {
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
    tacticas: d.tacticas || [],
    jugadores: d.jugadores.map(jugadorParaRed),
    // el banquillo, para los cambios (O-297)
    banquillo: (d.banquillo || []).slice(0, 5).map(jugadorParaRed),
    // el entrenador y los gerentes (sus pasivas cuentan) y la configuracion del equipo (la
    // carga) (O-328)
    personal: (d.personal || []).map(s => ({ nombre: s.nombre, elemento: s.elemento, posicion: s.posicion,
      pasivas: (s.pasivas || []).map(q => ({ texto: q.texto, efecto: q.efecto })) })),
    configuracion: d.configuracion || null,
    // la equipacion del equipo para los modelos 3D (O-334)
    equipacion: d.equipacion || null,
  };
}
function jugadorParaRed(j) {
  return {
      nombre: j.nombre, cara: j.cara, posicion: j.posicion, elemento: j.elemento, nivel: j.nivel,
      stats: j.stats, puesto: j.puesto, dorsal: j.dorsal,
      tecnicas: (j.tecnicas || []).map(t => ({ ranura: t.ranura, nombre: t.nombre, tipo: t.tipo, subtipo: t.subtipo,
        elemento: t.elemento, poder: t.poder, poderMin: t.poderMin, tp: t.tp, interno: t.interno, subtipo_valor: t.subtipo_valor, espiritu: t.espiritu,
        // lo que dura su animacion de VR: el plan de las completas, igual en los dos (O-323)
        jugadores: t.jugadores, seg: t.seg })),
      // las pasivas viajan con su efecto (O-288) y la del espiritu con su marca: solo
      // cuenta con la hiper puesta (O-310)
      pasivas: (j.pasivas || []).map(q => ({ texto: q.texto, abierta: q.abierta, efecto: q.efecto, espiritu: !!(q.espiritu || q.ranura === "espiritu") })),
      // entero: con su id y su tipo de hipertecnica (keshin, totem, despertar...) (O-310)
      espiritu: j.espiritu || null,
      // su ropa con la equipacion del equipo y el brazalete (O-334)
      ropa: j.ropa || null, capitan: !!j.capitan,
  };
}
