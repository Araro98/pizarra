/* Los sonidos del partido (NOTAS O-300): hechos con el propio navegador
   (WebAudio), sin ficheros: silbato, patada, el aviso de un duelo, el publico
   en los goles. Se pueden quitar al elegir equipos. `Sonido.mirar(p)` se llama
   en cada cuadro y suena lo que ha cambiado desde el anterior, asi vale igual
   para el anfitrion que para el invitado online (que solo ve fotos). */
"use strict";

const Sonido = {
  activo: true,
  ctx: null,
  _antes: null,

  // el navegador solo deja sonar despues de un clic: se llama al empezar
  despertar() {
    if (!this.activo) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) { this.ctx = null; }
  },

  _listo() { return this.activo && this.ctx && this.ctx.state === "running"; },

  _ruido(segundos) {
    const c = this.ctx, n = Math.floor(c.sampleRate * segundos);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    return s;
  },

  // un pitido de silbato: tono alto con un temblor rapido
  silbato(veces = 1, largo = 0.32) {
    if (!this._listo()) return;
    const c = this.ctx;
    for (let k = 0; k < veces; k++) {
      const t0 = c.currentTime + k * (largo + 0.12);
      const o = c.createOscillator(), lfo = c.createOscillator(), prof = c.createGain(), g = c.createGain();
      o.type = "sine"; o.frequency.value = 2650;
      lfo.frequency.value = 32; prof.gain.value = 160;
      lfo.connect(prof); prof.connect(o.frequency);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
      g.gain.setValueAtTime(0.09, t0 + largo - 0.05);
      g.gain.linearRampToValueAtTime(0, t0 + largo);
      o.connect(g); g.connect(c.destination);
      o.start(t0); lfo.start(t0); o.stop(t0 + largo); lfo.stop(t0 + largo);
    }
  },

  // la patada: un golpe sordo y un chasquido; fuerte para los tiros
  patada(fuerte) {
    if (!this._listo()) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(fuerte ? 150 : 190, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
    g.gain.setValueAtTime(fuerte ? 0.5 : 0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.15);
    const r = this._ruido(0.05), f = c.createBiquadFilter(), gr = c.createGain();
    f.type = "highpass"; f.frequency.value = 1800;
    gr.gain.setValueAtTime(fuerte ? 0.22 : 0.12, t0); gr.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    r.connect(f); f.connect(gr); gr.connect(c.destination); r.start(t0);
  },

  // el aviso de un duelo (el partido se para): dos notas que suben
  duelo() {
    if (!this._listo()) return;
    const c = this.ctx;
    [[660, 0], [990, 0.07]].forEach(([fr, d]) => {
      const t0 = c.currentTime + d, o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = fr;
      g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.13);
    });
  },

  // el publico: un rugido que sube y se apaga
  gol(mio) {
    if (!this._listo()) return;
    const c = this.ctx, t0 = c.currentTime, largo = mio ? 2.6 : 1.6;
    const r = this._ruido(largo), f = c.createBiquadFilter(), g = c.createGain();
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(mio ? 0.35 : 0.18, t0 + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + largo);
    r.connect(f); f.connect(g); g.connect(c.destination); r.start(t0);
  },

  // lo que ha cambiado desde el cuadro anterior
  mirar(p, yo) {
    if (!p) return;
    const b = p.balon, pase = b.pase ? b.pase.a + ":" + b.pase.destino.x + ":" + b.pase.destino.y : "";
    const ahora = { fase: p.fase, mitad: p.mitad, goles: p.goles[0] + p.goles[1], pase,
                    duelo: p.duelo ? p.duelo.id + ":" + p.duelo.tipo : "", resultado: p.resultado };
    const a = this._antes; this._antes = ahora;
    if (!a) return this.silbato(1);
    if (ahora.pase && ahora.pase !== a.pase) this.patada(false);
    if (ahora.duelo && ahora.duelo !== a.duelo) this.duelo();
    if (ahora.resultado && ahora.resultado !== a.resultado) {
      const t = ahora.resultado.tipo;
      if (t === "tiro") this.patada(true);
      else if (t === "falta" || t === "fuera") this.silbato(1, t === "falta" ? 0.4 : 0.22);
    }
    if (ahora.goles > a.goles) {
      const r = p.resultado, tir = r && r.tirador !== undefined ? p.jugadores[r.tirador] : null;
      this.gol(!tir || tir.lado === yo);
    }
    if (ahora.fase !== a.fase) {
      if (ahora.fase === "descanso") this.silbato(2, 0.28);
      else if (ahora.fase === "final") this.silbato(3, 0.3);
      else if (a.fase === "descanso" || a.fase === "gol") setTimeout(() => this.silbato(1), 150);
    }
  },
};
window.Sonido = Sonido;
