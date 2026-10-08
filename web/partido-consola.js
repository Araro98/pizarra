/* La consola (NOTAS O-316; diseno de las pantallas como Galaxy, 1.2 y 2): la pagina
   del Partido como una 3DS. Dos pantallas a escala, ARRIBA (400x240 px de 3DS, "u")
   y ABAJO (320x240 u), una encima de otra como la consola o una al lado de otra
   (mas grandes). Cada pantalla tiene un canvas 2D encima (hud, se dibuja en u) y
   una capa HTML de 400x240 / 320x240 u con `zoom` (letras nitidas y el raton cae
   donde se ve). Detras de las dos, un solo canvas WebGL (E2).
   Y GX: la paleta y las ayudas de dibujo de Galaxy (guia 3, 4 y 5). Nadie escribe
   un color de Galaxy fuera de GX: si Aaron quiere otro, se cambia aqui. */
"use strict";

const Consola = {
  S: 1, dpr: 1, modo: "encima",
  gl: null, arriba: null, abajo: null, medidas: null,
  letrasListas: null, letrasVersion: 0,
  calidad: "auto", nivel: "media",
  // lo que se ha medido en el ultimo medio segundo (el contador y las capturas, O-321):
  // {fps, ms (entre cuadros pintados), js, gl (ms del render del 3D), jsMax, nivel}
  rendimiento: null, _gracia: 0, _graciaPend: 0,
  _fns: [], _fnsCalidad: [], _modulos: {}, _esperan: {}, _clave: "",

  // pura, sin DOM (la prueba la llama con numeros): la escala S (px CSS por u) y donde
  // cae cada pantalla. W y H: el sitio de la consola (la ventana, menos el aside de los
  // paneles mientras exista), 8 px de margen a cada lado. Encima: 240 + 6 de bisagra +
  // 240; al lado: 400 + 8 + 320. S fraccionaria: con los canvas a la resolucion real no
  // hay pixel art que estropear
  escala(W, H, modo) {
    const lado = modo === "lado";
    const S = Math.max(0.05, lado ? Math.min((W - 16) / 728, (H - 16) / 240) : Math.min((W - 16) / 400, (H - 16) / 486));
    const r = (x, y, w, h) => ({ x: Math.round(x * S), y: Math.round(y * S), w: Math.round(w * S), h: Math.round(h * S) });
    return {
      S, modo: lado ? "lado" : "encima",
      ancho: Math.round((lado ? 728 : 400) * S), alto: Math.round((lado ? 240 : 486) * S),
      arriba: r(0, 0, 400, 240), abajo: lado ? r(408, 0, 320, 240) : r(40, 246, 320, 240),
      // ventana diminuta: solo el aviso. Pequena: "Maximiza la ventana..." (sin F11 ni
      // pantalla completa: la ventana de Pizarra no los tiene, diseno 2.1)
      pequena: S < 0.8, maximiza: S < 1.4,
    };
  },

  // una vez: coge #consola, #arriba, #abajo y sus capas
  montar() {
    if (this.arriba) return;
    const q = s => document.querySelector(s);
    this.caja = q("#consola"); this.sitio = q("#sitio") || document.body; this.gl = q("#gl");
    const capa = cual => ({ caja: q("#" + cual), hud: q("#" + cual + "-hud"), ctx: null, dom: q("#" + cual + "-dom"), rect: null, cliente: null });
    this.arriba = capa("arriba"); this.abajo = capa("abajo");
    for (const c of [this.arriba, this.abajo]) c.ctx = c.hud.getContext("2d");
    try { this.modo = localStorage.getItem("partido-pantallas") === "lado" ? "lado" : "encima"; } catch (e) {}
    try { const c = localStorage.getItem("partido-calidad"); if (["auto", "alta", "media", "baja"].includes(c)) this.calidad = c; } catch (e) {}
    this.nivel = this.calidad === "auto" ? "media" : this.calidad;
    this.letrasListas = this._cargarLetras();
    // solo al cambiar de tamano, nunca en cada cuadro (diseno 2.2)
    const medir = () => this.medir();
    window.addEventListener("resize", medir);
    if (window.ResizeObserver) new ResizeObserver(medir).observe(this.sitio);
    this.medir();
    // el contador de FPS: con la opcion "Ver FPS" (la ventana de Pizarra no tiene barra
    // de direcciones) o con ?medir para las capturas (diseno 7.4)
    let ver = new URLSearchParams(location.search).has("medir");
    try { ver = ver || localStorage.getItem("partido-fps") === "1"; } catch (e) {}
    this.verFps(ver);
  },

  ponerModo(m) { this.modo = m === "lado" ? "lado" : "encima"; this.medir(true); },

  medir(forzar) {
    if (!this.caja) return;
    const W = this.sitio.clientWidth || window.innerWidth, H = this.sitio.clientHeight || window.innerHeight, dpr = window.devicePixelRatio || 1;
    const clave = W + "x" + H + ":" + dpr + ":" + this.modo;
    if (clave === this._clave && !forzar) { this._clientes(); return; }
    this._clave = clave;
    this.esperarCalidad(1000);
    const m = this.escala(W, H, this.modo);
    this.medidas = m; this.S = m.S; this.dpr = dpr;
    this.caja.classList.toggle("lado", m.modo === "lado");
    this.caja.style.width = m.ancho + "px"; this.caja.style.height = m.alto + "px";
    // centrada en px enteros: medio pixel emborrona los canvas y las letras
    this.caja.style.left = Math.max(0, Math.floor((W - m.ancho) / 2)) + "px"; this.caja.style.top = Math.max(0, Math.floor((H - m.alto) / 2)) + "px";
    this.caja.style.visibility = m.pequena ? "hidden" : "";
    const aviso = document.querySelector("#aviso-pequena");
    if (aviso) aviso.hidden = !m.pequena;
    document.body.classList.toggle("gx-maximiza", m.maximiza);
    for (const [c, r] of [[this.arriba, m.arriba], [this.abajo, m.abajo]]) {
      const st = c.caja.style;
      st.left = r.x + "px"; st.top = r.y + "px"; st.width = r.w + "px"; st.height = r.h + "px";
      c.rect = r;
      // el canvas a la resolucion real (dpr) y el dibujo en u
      c.hud.width = Math.max(1, Math.round(r.w * dpr)); c.hud.height = Math.max(1, Math.round(r.h * dpr));
      c.hud.style.width = r.w + "px"; c.hud.style.height = r.h + "px";
      c.ctx.setTransform(m.S * dpr, 0, 0, m.S * dpr, 0, 0);
      c.dom.style.zoom = String(m.S);
    }
    if (this.gl) { this.gl.style.width = m.ancho + "px"; this.gl.style.height = m.alto + "px"; }
    this._clientes();
    for (const fn of this._fns) { try { fn(m); } catch (e) { console.error(e); } }
  },
  // donde estan en la ventana (para el raton): se mira al cambiar de tamano
  _clientes() {
    for (const c of [this.arriba, this.abajo]) if (c && c.caja) c.cliente = c.caja.getBoundingClientRect();
  },

  // {u, v} del raton en u de esa pantalla
  aNativo(ev, cual) {
    const c = this[cual] || this.abajo, r = c.cliente || c.caja.getBoundingClientRect();
    return { u: (ev.clientX - r.left) / this.S, v: (ev.clientY - r.top) / this.S };
  },

  alCambiar(fn) { this._fns.push(fn); },
  alCalidad(fn) { this._fnsCalidad.push(fn); },

  // las cuatro letras (o las de reserva de Windows, partido-letras.css): los lienzos
  // que guardan fondos con texto se rehacen al llegar (letrasVersion)
  _cargarLetras() {
    if (typeof document === "undefined" || !document.fonts || !document.fonts.load) return Promise.resolve(false);
    const muestra = "Áñ¡¿ª·×09";
    const todas = Promise.all(['900 12px "GX Redonda"', '700 12px "GX Cifras"', '400 12px "GX Nombre"', '400 12px "GX Rotulo"']
      .map(f => document.fonts.load(f, muestra).catch(() => null)));
    return Promise.race([todas, new Promise(r => setTimeout(r, 3000))]).then(() => {
      this.letrasVersion++;
      for (const fn of this._fns) { try { fn(this.medidas); } catch (e) { console.error(e); } }
      return true;
    });
  },

  // los modulos ES (partido-3d.js, partido-escenas.js) se ejecutan DESPUES de
  // partido.js: se registran aqui y partido.js los espera
  registrar(nombre, valor) {
    this._modulos[nombre] = valor;
    for (const r of this._esperan[nombre] || []) r(valor);
    delete this._esperan[nombre];
  },
  modulo(nombre) {
    if (nombre in this._modulos) return Promise.resolve(this._modulos[nombre]);
    return new Promise(r => (this._esperan[nombre] = this._esperan[nombre] || []).push(r));
  },

  // --- el limite de FPS y la calidad (diseno 7.4, con sus CRITICAS) -----------------
  // pinta si desde el ultimo cuadro pintado han pasado 1000/FPS - 2 ms, sumando el
  // objetivo y no el ahora (asi no deriva y en una pantalla de 120 o 144 Hz pinta 60,
  // no 144). La calidad automatica mira el INTERVALO entre cuadros pintados: baja un
  // nivel si su media pasa de 22 ms (44 en Baja) 3 s seguidos; sube uno si en 10 s no
  // pierde ninguno, como mucho una vez por partido y nunca al nivel del que ya bajo por
  // lento (O-321). Nunca en mitad de una animacion
  cuadro(ahora) {
    const q = this._q || (this._q = { objetivo: null, ultimo: null, media: 16.7, malos: 0, buenos: 0, subidas: 0, fpsT: 0, fpsN: 0, vJs: 0, vGl: 0, vN: 0, vMax: 0 });
    const fps = this.nivel === "baja" ? 30 : 60, paso = 1000 / fps;
    if (this._graciaPend) { this._gracia = Math.max(this._gracia, ahora + this._graciaPend); this._graciaPend = 0; }
    if (q.objetivo === null) q.objetivo = ahora - paso;
    if (ahora - q.objetivo < paso - 2) return { pinta: false, dt: 0 };
    q.objetivo += paso;
    if (ahora - q.objetivo > paso) q.objetivo = ahora;        // se habia quedado atras (pestana oculta)
    const dt = q.ultimo === null ? 0 : ahora - q.ultimo;
    q.ultimo = ahora;
    if (dt > 0 && dt < 250) {
      q.media += (dt - q.media) * 0.1;
      this._mirarCalidad(dt, paso, ahora);
      q.fpsN++;
      if (ahora - q.fpsT > 500) {
        // cada medio segundo: los FPS y la media de los ms de JS y del 3D (finCuadro) (O-321)
        const n = q.vN || 1;
        this.rendimiento = { fps: q.fpsN * 1000 / (ahora - q.fpsT), ms: q.media, js: q.vJs / n, gl: q.vGl / n, jsMax: q.vMax, nivel: this.nivel };
        this._pintarFps(this.rendimiento);
        q.fpsT = ahora; q.fpsN = 0; q.vJs = q.vGl = q.vN = q.vMax = 0;
      }
    }
    return { pinta: true, dt: dt / 1000 };
  },
  // al acabar cada cuadro pintado (el bucle de partido.js): lo que ha tardado entero y lo
  // que fue el render del 3D (Mundo.msRender). El JS es lo demas: el motor, el Director,
  // los HUD y la tactil (diseno 7.4 y 7.5; O-321)
  finCuadro(total, gl) {
    const q = this._q;
    if (!q) return;
    const js = Math.max(0, total - (gl || 0));
    q.vJs += js; q.vGl += gl || 0; q.vN++;
    if (js > q.vMax) q.vMax = js;
  },
  // la calidad automatica no mide estos ms: los tirones de cargar un modelo, de cambiar el
  // tamano o el nivel no son de la grafica, y sin esto la bajaban al empezar el partido
  // (y con una sola subida por partido se quedaba abajo) (O-321). Se apunta aqui y pasa al
  // reloj de los cuadros en el siguiente
  esperarCalidad(ms) { if (ms > this._graciaPend) this._graciaPend = ms; },
  _mirarCalidad(dt, paso, ahora) {
    const q = this._q;
    if (this.calidad !== "auto") return;
    if (ahora < this._gracia) { q.malos = 0; q.buenos = 0; return; }
    const quieto = typeof Director === "undefined" || !Director.estado || Director.estado.arriba.modo === "mapa";
    const lento = q.media > (this.nivel === "baja" ? 44 : 22), bien = q.media < (this.nivel === "baja" ? 36 : 18);
    q.malos = lento ? q.malos + dt : 0;
    q.buenos = bien ? q.buenos + dt : 0;
    const orden = ["baja", "media", "alta"], k = orden.indexOf(this.nivel);
    // techo: el nivel que ya fue lento en este partido (subir a el lo volveria a bajar)
    if (q.malos > 3000 && k > 0 && quieto) { q.techo = k; this._ponerNivel(orden[k - 1]); q.malos = 0; q.buenos = 0; }
    else if (q.buenos > 10000 && k < 2 && q.subidas < 1 && quieto && !(q.techo <= k + 1)) { this._ponerNivel(orden[k + 1]); q.subidas++; q.buenos = 0; }
  },
  _ponerNivel(n) {
    if (n === this.nivel) return;
    this.nivel = n;
    this.esperarCalidad(1000);
    for (const fn of this._fnsCalidad) { try { fn(n); } catch (e) { console.error(e); } }
  },
  // la calidad elegida en la pantalla de elegir ("auto", "alta", "media" o "baja")
  ponerCalidad(c) {
    this.calidad = ["auto", "alta", "media", "baja"].includes(c) ? c : "auto";
    this._ponerNivel(this.calidad === "auto" ? "media" : this.calidad);
  },
  // al empezar cada partido: la automatica vuelve a empezar (una subida por partido)
  reiniciarCuadros() {
    this._q = null; this.rendimiento = null; this._gracia = 0;
    if (this.calidad === "auto") this._ponerNivel("media");
    // los primeros cuadros compilan y suben todo (O-321)
    this.esperarCalidad(3000);
  },

  // el contador pequeno de FPS, fuera de la consola, con el nivel que ha puesto la
  // automatica (para que Aaron pueda decir "pone Baja")
  verFps(si) {
    if (typeof document === "undefined") return;
    let c = document.querySelector("#gx-fps");
    if (!si) { if (c) c.hidden = true; return; }
    if (!c) { c = document.createElement("div"); c.id = "gx-fps"; c.className = "gx-fps"; document.body.appendChild(c); }
    c.hidden = false;
    c.textContent = "— FPS";
  },
  // "60 FPS · JS 1,8 ms · 3D 2,9 ms · Media (auto)": el JS por un lado y el render por otro
  // (diseno 7.4; O-321). Con una grafica de verdad el "3D" es lo que tarda el ordenador en
  // mandarle el trabajo: si no llega, lo que baja son los FPS
  _pintarFps(r) {
    const c = typeof document !== "undefined" && document.querySelector("#gx-fps");
    if (!c || c.hidden) return;
    const nombre = { alta: "Alta", media: "Media", baja: "Baja" }[this.nivel];
    const ms = x => x.toFixed(1).replace(".", ",");
    c.textContent = Math.round(r.fps) + " FPS · JS " + ms(r.js) + " ms · 3D " + ms(r.gl) + " ms · " + nombre + (this.calidad === "auto" ? " (auto)" : "");
  },
};

/* --- GX: la paleta y las ayudas de dibujo de Galaxy (guia 3, 4 y 5) --------------- */
const GX = {
  // las letras (partido-letras.css): siempre por estas familias, con la reserva detras
  letras: {
    redonda: '"GX Redonda", "Segoe UI Black", "Segoe UI", system-ui, sans-serif',
    cifras: '"GX Cifras", "Bahnschrift", "Impact", sans-serif',
    nombre: '"GX Nombre", "Impact", sans-serif',
    rotulo: '"GX Rotulo", "Arial Black", sans-serif',
  },

  // tu equipo azul y a la izquierda, el rival rojo (guia, convenciones; diseno 2.3)
  tuyo: { base: "#0F31B7", claro: "#2D7FEE", oscuro: "#0F182F", linea: "#1F50A8", disco: "#0A4BF1", punto: "#0E3DBD", placa: "#0B2CD4" },
  rival: { base: "#A91112", claro: "#E93537", oscuro: "#2F1013", linea: "#C83A3C", disco: "#DC1519", punto: "#B10F21", placa: "#D71D22" },
  // las placas de la ficha por elemento (con su borde 1 u mas claro)
  elemento: { Fuego: "#9E302D", Viento: "#1C439A", Bosque: "#045C1D", Montana: "#994816", ninguno: "#3A4A66" },
  elementoBorde: { Fuego: "#D0605A", Viento: "#5A80D8", Bosque: "#3A9A50", Montana: "#D88A50", ninguno: "#8A9AB8" },
  elementoTexto: { Fuego: "#E6550F", Viento: "#25CAD5", Bosque: "#4CD060", Montana: "#F0B030", ninguno: "#DDE6F5" },
  // las pastillas de la posicion (como las de la tabla de cambios, b43) [PIZARRA: en
  // lugar del icono de sexo, que Pizarra no tiene]
  posicion: { DEL: "#D8262A", MED: "#1E4FD8", DEF: "#1F8F3A", POR: "#E8901C" },

  fondoArriba: "#016C4D", franjas: ["#017554", "#045D44"],
  panelGoles: { arriba: "#077049", abajo: "#066042", borde: "#2BAF69", franja: "#0A7A50" },
  cajaGoles: { fondo: "#1F1F22", borde: "#5A5A60", cifra: "#FFFFFF" },
  reloj: { fondo: "#1A1A1A", parte1: "#40BE58", parte2: "#C59D4A", prorroga: "#B57AF0", cifras: "#CFD2D6", aviso: "#F8D040" },
  insignia: { p1: "#27BC1A", p2: "#F48B1A", pr: "#8B4FD8" },
  golLinea: { minuto: "#9FE3F0", nombre: "#EAF6F0" },
  minimapa: { franjas: ["#0EA96B", "#0A9460"], franjasAbajo: ["#0F8D65", "#0C7B5B"], lineas: "#BDF0DB", marco: "#6FC7A4", bisel: "#0C8A5E", red: "#E8F8F0" },
  puntos: { borde: "#FFFFFF", balon: "#FFFFFF", balonBorde: "#0A4BF1", hiper: "#C04CF0" },
  barraKp: "#EDBE35", barraTen: ["#7AE34B", "#5AD32D"], barraHip: "#DD41E8", barraVacia: "#1A1A1A", etiquetaPoder: ["#F8E070", "#E89A20"],
  valorIzq: "#0B2CD4", valorDer: "#D71D22",
  cifraGana: ["#F8D040", "#CB9533"], cifraContorno: "#3A1A00", cifraPierde: ["#B047BD", "#7F10B2"],
  cesped: ["#49A829", "#3B9B21"], pista: "#BA562E",
  anillo: ["#F20208", "#5A1A08"], cono: "#00FFE0", lineaTiro: ["#F8E848", "#F8D838"], rombo: "#0A4BF1",
  ruta: ["#11B7F2", "#0A3A8A"], paseAlto: "#0DE1FE", paseRival: "#EB271F", triangulo: ["#F8CB1F", "#7A4A00"],
  bocadillo: { crema: "#F3EFD1", borde: "#8A8A70", bien: "#1555EC", aPorEllos: "#0A46CA" },
  franjaTexto: "#1A1A1A",
  barraDuelo: ["#0E1F44", "#0E0D61"], botonDuelo: ["#0334F6", "#0418C4", "#8A9AB0"],
  rayo: { hexagono: ["#E04818", "#730F0B"], borde: "#E5B954", rayo: "#FCFA6E" }, flechas: "#F7901E",
  // los botones de menu: borde claro de 2 u, linea oscura de 1 u y brillo partido al 50 %
  boton: {
    borde: "#C8DCC4", linea: "#3A4E2A",
    verde: ["#A6E030", "#7FCB0A", "#62A90C", "#56990A"], azul: ["#2AA8D8", "#0689BA", "#036A9A", "#035E89"],
    apagado: ["#5E8410", "#4E7902", "#3A6A04", "#33620A"], pulsado: ["#FFD040", "#F8A800", "#F09000", "#E07800"],
    texto: "#FFFFFF", textoApagado: "#A8B098", contorno: "#203010",
  },
  lista: { casilla: ["#12BDF6", "#068AFB"], brillo: "#72E9F3", borde: "#648EB6", elegida: "#DCC84B", fondo: "#052A92", vacia: "#0A2E8A", vaciaBorde: "#2A50B0", texto: "#0A1E5A", cifras: "#E8D060" },
  auras: { tarjeta: ["#9440D8", "#D593F7"], total: "#9038E5", cabecera: "#1C4B66" },
  estadisticas: { panel: ["#02B476", "#07BF80"], franjas: "#0B8D5C" },
  posesion: ["#0A5BE9", "#F5383D"],
  // la pantalla verde del descanso y del final (a25, a26)
  descanso: { fondo: ["#04B08B", "#029A79"], franja: "#22B8A3", banda: ["#46EAD0", "#14C2A2"], linea: "#9AF0DC", hexagono: "#5FD6BE", vs: ["#FFE030", "#F07010"], nivel: "#F8E070" },
  // los rotulos: relleno de arriba a abajo y contornos de fuera a dentro (guia 3)
  rotulo: {
    saque: { relleno: ["#F1C41E", "#D37A18"], contornos: [["#FFFFFF", 2.2], ["#37290E", 1.4]] },
    gol: { relleno: ["#F9FF51", "#FD5209"], contornos: [["#FFFFFF", 2.2], ["#931D1E", 1.4]] },
    final: { relleno: ["#F9DB11", "#E7940B"], contornos: [["#000000", 1.6]] },
    descanso: { relleno: ["#FFFFFF", "#8286CC"], contornos: [["#000000", 1.6]] },
    derrota: { relleno: ["#E0E0E0", "#808080"], contornos: [["#FFFFFF", 2.2], ["#000000", 1.4]] },
    victoria: { relleno: ["#F1C41E", "#D37A18"], contornos: [["#37290E", 1.6]] },
    fuera: { relleno: ["#C8FAFF", "#09959B"], contornos: [["#0A1E5A", 1.6]] },
    invoca: { relleno: ["#FFFFFF", "#35DBF5"], contornos: [["#6A1A9A", 1.6]] },
    bloqueo: { relleno: ["#FF8CC0", "#EF0970"], contornos: [["#FFFFFF", 2.2], ["#7A0A3A", 1.4]] },
    debilitado: { relleno: ["#A0F0FF", "#2060E0"], contornos: [["#0A1E5A", 1.6]] },
    armadura: { relleno: ["#FFF0A0", "#E0A020"], contornos: [["#4A2A00", 1.6]] },
  },

  // azul si el lado es el tuyo (en cada PC, tambien en el invitado), rojo si no
  color(lado, yo) {
    const y = yo !== undefined ? yo : (typeof YO !== "undefined" ? YO : 0);
    return lado === y ? GX.tuyo : GX.rival;
  },
  posicionCorta(pos) {
    return { DEL: "DEL", DL: "DEL", MC: "MED", MED: "MED", DF: "DEF", DEF: "DEF", POR: "POR" }[pos] || (pos || "").slice(0, 3).toUpperCase();
  },

  // la letra en canvas: nunca por debajo de 9 px CSS (diseno 2.1)
  fuente(letra, tam, peso, estilo) {
    const S = (typeof Consola !== "undefined" && Consola.S) || 1;
    return (estilo ? estilo + " " : "") + (peso || 900) + " " + Math.max(tam, 9 / S).toFixed(2) + "px " + (GX.letras[letra] || letra || GX.letras.redonda);
  },
  // el texto de Galaxy (guia 5): contornos de fuera a dentro con las esquinas redondas
  // y el relleno con un degradado vertical; sesgo en grados (-8 en los rotulos).
  // o: {letra, tam, peso, alinea, base, color, degradado: [c0, c1...], contornos:
  // [[color, ancho]...], sesgo, ancho (lo mas que puede medir: se estrecha)}
  texto(ctx, t, x, y, o = {}) {
    t = String(t);
    const tam = o.tam || 10;
    ctx.save();
    ctx.font = GX.fuente(o.letra || "redonda", tam, o.peso, o.estilo);
    ctx.textAlign = o.alinea || "left";
    ctx.textBaseline = o.base || "middle";
    ctx.lineJoin = "round";
    ctx.translate(x, y);
    if (o.sesgo) ctx.transform(1, 0, Math.tan(o.sesgo * Math.PI / 180), 1, 0, 0);
    const mt = ctx.measureText && ctx.measureText(t), mide = (mt && mt.width) || 0;
    if (o.ancho && mide > o.ancho) ctx.scale(o.ancho / mide, 1);
    for (const [c, w] of o.contornos || []) {
      ctx.strokeStyle = c; ctx.lineWidth = w * 2;
      ctx.strokeText(t, 0, 0);
    }
    ctx.fillStyle = o.degradado ? GX.vertical(ctx, -tam * 0.55, tam * 0.45, o.degradado) : o.color || "#FFFFFF";
    ctx.fillText(t, 0, 0);
    ctx.restore();
    return Math.min(mide, o.ancho || mide);
  },

  // un rectangulo redondeado (camino); r puede ser [arriba-izq, arriba-dcha, abajo-dcha, abajo-izq]
  redondo(ctx, x, y, w, h, r) {
    const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + a, y);
    ctx.lineTo(x + w - b, y); if (b) ctx.arcTo(x + w, y, x + w, y + b, b); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - c); if (c) ctx.arcTo(x + w, y + h, x + w - c, y + h, c); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + d, y + h); if (d) ctx.arcTo(x, y + h, x, y + h - d, d); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + a); if (a) ctx.arcTo(x, y, x + a, y, a); else ctx.lineTo(x, y);
    ctx.closePath();
  },
  // degradado vertical (o una sola tinta en el ctx de mentira de las pruebas)
  vertical(ctx, y0, y1, colores) {
    const g = ctx.createLinearGradient && ctx.createLinearGradient(0, y0, 0, y1);
    if (!g || !g.addColorStop) return colores[0];
    colores.forEach((c, k) => g.addColorStop(colores.length > 1 ? k / (colores.length - 1) : 0, c));
    return g;
  },

  // los botones de menu (guia 3 y 4, iconos/boton_*.svg): borde claro de 2 u, linea
  // oscura de 1 u, esquinas de 6 u y el brillo partido al 50 %. En la capa HTML son
  // clases CSS (.gx-boton.verde...), esto es para los canvas
  boton(ctx, x, y, w, h, tipo, texto, tam) {
    const B = GX.boton, c = B[tipo] || B.verde;
    ctx.save();
    GX.redondo(ctx, x, y, w, h, 6); ctx.fillStyle = B.borde; ctx.fill();
    GX.redondo(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 5); ctx.fillStyle = B.linea; ctx.fill();
    GX.redondo(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 4.2);
    const g = ctx.createLinearGradient && ctx.createLinearGradient(0, y + 2.5, 0, y + h - 2.5);
    if (g && g.addColorStop) { g.addColorStop(0, c[0]); g.addColorStop(0.49, c[1]); g.addColorStop(0.51, c[2]); g.addColorStop(1, c[3]); ctx.fillStyle = g; }
    else ctx.fillStyle = c[1];
    ctx.fill();
    ctx.restore();
    if (texto) GX.texto(ctx, texto, x + w / 2, y + h / 2 + 0.5, { tam: tam || h * 0.45, alinea: "center", color: tipo === "apagado" ? B.textoApagado : B.texto,
      contornos: [[B.contorno, 1.2]], ancho: w - 10 });
  },

  // la placa con la esquina de arriba de dentro cortada en diagonal (la ficha, m10).
  // corte: "der" (ficha de la izquierda: el corte a la derecha) o "izq"
  placa(ctx, x, y, w, h, color, corte, borde) {
    const k = 8;
    ctx.beginPath();
    if (corte === "izq") { ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + k); }
    else if (corte === "der") { ctx.moveTo(x, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + k); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
    else { ctx.rect(x, y, w, h); }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.stroke(); }
  },

  // el escudo dibujado [A CONFIRMAR: Pizarra no tiene emblemas de equipo]: forma de
  // escudo del color del lado con las iniciales del equipo
  escudo(ctx, cx, cy, w, h, col, nombre) {
    const x = cx - w / 2, y = cy - h / 2;
    const camino = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.08);
      ctx.quadraticCurveTo(cx, y - h * 0.06, x + w, y + h * 0.08);
      ctx.lineTo(x + w, y + h * 0.5);
      ctx.quadraticCurveTo(x + w, y + h * 0.82, cx, y + h);
      ctx.quadraticCurveTo(x, y + h * 0.82, x, y + h * 0.5);
      ctx.closePath();
    };
    ctx.save();
    camino(); ctx.fillStyle = "#F4E7B0"; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = "#3A2A08"; ctx.stroke();
    ctx.translate(cx, cy); ctx.scale(0.8, 0.8); ctx.translate(-cx, -cy);
    camino(); ctx.fillStyle = GX.vertical(ctx, y, y + h, [col.claro, col.base]); ctx.fill();
    ctx.restore();
    const ini = GX.iniciales(nombre);
    GX.texto(ctx, ini, cx, cy + h * 0.02, { tam: h * (ini.length > 1 ? 0.36 : 0.46), alinea: "center", letra: "rotulo", color: "#FFFFFF", contornos: [["#1A1A1A", 1.2]], ancho: w * 0.7 });
  },
  iniciales(nombre) {
    const p = String(nombre || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
  },

  // los iconos SVG propios (partido-iconos.js) como Image, una vez cada uno
  _iconos: {},
  iconoUrl(nombre) {
    const s = typeof ICONOS_GX !== "undefined" && ICONOS_GX[nombre];
    return s ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s) : "";
  },
  icono(nombre) {
    if (GX._iconos[nombre]) return GX._iconos[nombre];
    if (typeof Image === "undefined") return null;
    const im = new Image();
    im.onload = () => GX._cargado();
    im.src = GX.iconoUrl(nombre);
    return (GX._iconos[nombre] = im);
  },
  // las caras de Pizarra (/cara/<id>), una vez cada una
  _caras: {},
  cara(id) {
    if (!id) return null;
    if (GX._caras[id]) return GX._caras[id];
    if (typeof Image === "undefined") return null;
    const im = new Image();
    im.onload = () => GX._cargado();
    im.src = "/cara/" + encodeURIComponent(id);
    return (GX._caras[id] = im);
  },
  cargada(im) { return !!(im && im.complete && im.naturalWidth > 0); },
  // quien quiera repintar cuando llega una imagen (la pantalla de elegir no tiene bucle)
  _alCargar: [],
  alCargar(fn) { GX._alCargar.push(fn); },
  _cargado() { for (const fn of GX._alCargar) { try { fn(); } catch (e) { console.error(e); } } },
  // un lienzo fuera de pantalla (o null en node: se pinta directo)
  lienzo(w, h) {
    if (typeof document === "undefined" || !document.createElement) return null;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  },
};
