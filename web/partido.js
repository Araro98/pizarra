/* El juego de partidos (NOTAS O-286): elegir equipos, el bucle, el raton
   como el lapiz de DS y la pausa de cada duelo con sus comandos. */
"use strict";

let YO = 0;                   // tu lado: 0, o 1 si eres el invitado de un partido online
let MODO = "maquina";         // "maquina" | "anfitrion" | "invitado"
let RED = null;               // la conexion online (partido-red.js)
const duelosElegidos = new Set();
let EQUIPOS = [], DATOS = {}, PARTIDO = null, PANTALLA = null, MAQUINA = null, MAQUINA_YO = null, AYUDANTE = null;
let PANTALLA3D = null;        // la pantalla de arriba en 3D, si se ha elegido (O-301)
const DEMO = new URLSearchParams(location.search).has("demo");   // maquina contra maquina, para mirar
let ultimoResultado = null, eventosVistos = 0;

// --- elegir equipos ------------------------------------------------------------
async function cargarEquipos() {
  try {
    EQUIPOS = (await pedir("/api/partido/equipos")).equipos;
  } catch (e) {
    $("#nota-elegir").textContent = "No se pueden leer los equipos: " + e.message + ". Abre antes tu partida en el editor.";
    return;
  }
  if (EQUIPOS.length < 1) {
    $("#nota-elegir").textContent = "Tu partida no tiene ningun equipo con once jugadores en el campo.";
    $("#jugar-maquina").disabled = true;
    return;
  }
  // los dos equipos se recuerdan, como las opciones: "Otro partido" (y F5) ponia
  // siempre los dos primeros. Si el hueco ya no esta, el de siempre (O-305)
  let guardados = [];
  try { guardados = [localStorage.getItem("partido-equipo-a"), localStorage.getItem("partido-equipo-b")]; } catch (e) {}
  for (const [i, sel, k] of [[0, "#equipo-a", 0], [1, "#equipo-b", Math.min(1, EQUIPOS.length - 1)]]) {
    const s = $(sel), g = guardados[i];
    for (const e of EQUIPOS) s.appendChild(el("option", { value: e.hueco, text: e.nombre }));
    s.value = g && EQUIPOS.some(e => String(e.hueco) === g) ? g : EQUIPOS[k].hueco;
    s.onchange = () => {
      try { localStorage.setItem(i ? "partido-equipo-b" : "partido-equipo-a", s.value); } catch (e) {}
      verOnce(i ? "#once-b" : "#once-a", +s.value);
    };
  }
  verOnce("#once-a", +$("#equipo-a").value);
  verOnce("#once-b", +$("#equipo-b").value);
}

// la duracion de cada parte, en segundos (se recuerda)
function duracionElegida() { return +($("#duracion").value || REGLAS.MITAD); }
try { const d = localStorage.getItem("partido-duracion"); if (d) $("#duracion").value = d; } catch (e) {}
$("#duracion").onchange = () => { try { localStorage.setItem("partido-duracion", $("#duracion").value); } catch (e) {} };
try { $("#focos-auto").checked = localStorage.getItem("partido-focos-auto") === "1"; } catch (e) {}
try { $("#vista-3d").checked = localStorage.getItem("partido-vista-3d") === "1"; } catch (e) {}
try { $("#fuera-juego").checked = localStorage.getItem("partido-fuera-juego") !== "0"; } catch (e) {}
try { $("#sonido").checked = localStorage.getItem("partido-sonido") !== "0"; } catch (e) {}
$("#sonido").onchange = () => { try { localStorage.setItem("partido-sonido", $("#sonido").checked ? "1" : "0"); } catch (e) {} };
// el navegador solo deja sonar tras un clic (online el partido empieza sin clic)
document.addEventListener("pointerdown", () => Sonido.despertar());
$("#fuera-juego").onchange = () => { try { localStorage.setItem("partido-fuera-juego", $("#fuera-juego").checked ? "1" : "0"); } catch (e) {} };
$("#vista-3d").onchange = () => { try { localStorage.setItem("partido-vista-3d", $("#vista-3d").checked ? "1" : "0"); } catch (e) {} };
$("#focos-auto").onchange = () => { try { localStorage.setItem("partido-focos-auto", $("#focos-auto").checked ? "1" : "0"); } catch (e) {} };

async function equipoDatos(hueco) {
  if (!DATOS[hueco]) DATOS[hueco] = await pedir("/api/partido/equipo?hueco=" + hueco);
  return DATOS[hueco];
}

async function verOnce(caja, hueco) {
  const c = $(caja);
  c.textContent = "Cargando...";
  try {
    const d = await equipoDatos(hueco);
    c.textContent = "";
    for (const j of d.jugadores) {
      c.appendChild(el("figure", { title: j.nombre + " · " + j.posicion }, [
        el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }),
        el("figcaption", { text: j.nombre })]));
    }
  } catch (e) { c.textContent = e.message; }
}

$("#jugar-maquina").onclick = async () => {
  $("#jugar-maquina").disabled = true;
  try {
    const a = await equipoDatos(+$("#equipo-a").value), b = await equipoDatos(+$("#equipo-b").value);
    empezar(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  } catch (e) { avisa ? avisa(e.message, "mal") : alert(e.message); }
  $("#jugar-maquina").disabled = false;
};

// --- el partido ------------------------------------------------------------------
function empezar(a, b, online) {
  $("#pantalla-elegir").hidden = true;
  $("#pantalla-juego").hidden = false;
  MODO = online ? online.modo : "maquina";
  YO = MODO === "invitado" ? 1 : 0;
  const semilla = online ? online.semilla : (Math.random() * 1e9) | 0;
  const mitad = (online && online.mitad) || duracionElegida();
  const fueraDeJuego = online && online.fueraDeJuego !== undefined ? online.fueraDeJuego : $("#fuera-juego").checked;
  PARTIDO = new Partido(a, b, { semilla, manual: MODO === "maquina" ? [!DEMO, false] : [true, true], mitad, fueraDeJuego,
                                limiteDuelo: online ? REGLAS.DUELO_MAX : 0 });
  // se juega siempre en el campo 2D; la vista 3D (O-293), si se ha elegido y
  // three.js ha cargado, va encima, como la pantalla de arriba de la 3DS (O-301)
  const quiero3d = !!($("#vista-3d").checked && window.Pantalla3D);
  if (PANTALLA3D) { PANTALLA3D.cerrar(); PANTALLA3D = null; }
  $("#pantalla-juego").classList.toggle("con-3d", quiero3d);
  $("#pantalla-arriba").hidden = !quiero3d;
  $("#campo-3d").replaceWith(el("canvas", { id: "campo-3d" }));
  $("#campo").replaceWith(el("canvas", { id: "campo" }));
  PANTALLA = new Pantalla($("#campo"), PARTIDO, YO);
  if (quiero3d) {
    // sin WebGL (tarjeta grafica antigua o desactivada) se juega igual, solo en 2D
    try { PANTALLA3D = new window.Pantalla3D($("#campo-3d"), PARTIDO, YO); }
    catch (e) {
      PANTALLA3D = null;
      $("#pantalla-juego").classList.remove("con-3d"); $("#pantalla-arriba").hidden = true;
      avisa("Este ordenador no puede mostrar la vista 3D: se juega solo con el campo.", "mal");
    }
  }
  MAQUINA = MODO === "maquina" ? new Maquina(PARTIDO, 1 - YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
  MAQUINA_YO = DEMO && MODO === "maquina" ? new Maquina(PARTIDO, YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
  if (MODO === "invitado") {
    // el invitado no simula: sus gestos y elecciones van al anfitrion
    PARTIDO.ordenar = o => { RED.orden(o); return true; };
    // la eleccion dice de que duelo es y se guarda: pausa() la repite si no
    // llega (aqui y no en elegido(), para que valga tambien la del AYUDANTE) (O-305)
    PARTIDO.elegir = (lado, eleccion) => {
      ultimaEleccion = { duelo: PARTIDO.duelo && PARTIDO.duelo.id, lado, eleccion, t: Date.now() };
      RED.orden({ tipo: "elegir", lado, eleccion, duelo: ultimaEleccion.duelo });
      return true;
    };
  }
  duelosElegidos.clear(); ultimaEleccion = null;
  // focos automaticos: una maquina elige por mi en los regates y entradas
  AYUDANTE = $("#focos-auto").checked && !DEMO ? new Maquina(PARTIDO, YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
  $("#nombre-a").textContent = a.nombre; $("#nombre-b").textContent = b.nombre;
  ultimoResultado = null; eventosVistos = 0; mostrando = null;
  $("#registro").textContent = "";
  window.onresize = () => { PANTALLA.ajustar(); if (PANTALLA3D) PANTALLA3D.ajustar(); };
  Sonido.activo = $("#sonido").checked; Sonido._antes = null; Sonido.despertar();
  raton();
  requestAnimationFrame(bucle);
}
// el buffer del campo sigue a su caja aunque cambie sin cambiar la ventana. Uno
// solo para toda la pagina (el canvas se cambia en cada partido, la caja no); con
// el canvas absoluto no hace bucle (O-305)
if (window.ResizeObserver) new ResizeObserver(() => { if (PANTALLA) { PANTALLA.ajustar(); PANTALLA.pintar(); } }).observe($(".campo-caja"));

let antes = null, sobra = 0;
function bucle(ahora) {
  if (!PARTIDO) return;
  // el siguiente cuadro se pide antes de nada: un error al pintar ya no para el
  // partido para siempre (asi se congelaba el invitado tras un corte) (O-305)
  requestAnimationFrame(bucle);
  if (antes === null) antes = ahora;
  sobra += Math.min(0.25, (ahora - antes) / 1000);
  antes = ahora;
  let n = 0;
  if (MODO === "invitado") {
    PARTIDO.suavizar(sobra); sobra = 0;
  } else if (MODO === "anfitrion" && RED && Date.now() - (RED.vistoRival || 0) > 8000) {
    sobra = 0;                                  // sin noticias del rival: se espera
  } else {
    while (sobra >= REGLAS.PASO && n < 8) {
      if (MAQUINA) MAQUINA.pensar();
      if (MAQUINA_YO) MAQUINA_YO.pensar();
      PARTIDO.paso();
      sobra -= REGLAS.PASO; n++;
    }
  }
  if (MODO === "anfitrion") mandarFoto();
  Sonido.mirar(PARTIDO, YO);
  PANTALLA.pintar();
  if (PANTALLA3D) { PANTALLA3D.elegido = PANTALLA.elegido; PANTALLA3D.trazo = PANTALLA.trazo; PANTALLA3D.pintar(); }
  marcador();
  pausa();
  registro();
  fichaElegido();
  pintarTacticas();
  pintarPausa();
}

function marcador() {
  const p = PARTIDO;
  $("#goles").textContent = p.goles[0] + " - " + p.goles[1];
  // el rival se ha ido (cerro la pestana o pulso Inicio): ya no se le espera (O-305)
  if (MODO !== "maquina" && RED && RED.rival && RED.rivalFuera && p.fase !== "final") {
    $("#reloj").textContent = RED.rival.nombre + " ha salido";
    return;
  }
  if (MODO !== "maquina" && RED && RED.rival && p.fase !== "final" && Date.now() - (RED.vistoRival || 0) > 8000) {
    $("#reloj").textContent = "esperando a " + RED.rival.nombre + "...";
    return;
  }
  $("#reloj").textContent = p.fase === "final" ? "Final" : p.fase === "descanso" ? "Descanso" : (p.mitad === 1 ? "1ª " : "2ª ") + p.minuto() + "'";
}

// la pausa de 3DS (O-294): boton y barra espaciadora
function pintarPausa() {
  const p = PARTIDO, b = $("#boton-pausa"), aviso = $("#aviso-pausa");
  if (p.fase === "pausa" && p.pausa) {
    const mia = p.pausa.lado === YO;
    b.textContent = mia ? "Seguir" : "Pausa del rival";
    b.classList.add("seguir"); b.disabled = !mia;
    aviso.hidden = false;
    aviso.textContent = (mia ? "Pausa: dibuja rutas y marca el pase o el tiro · " : "Pausa del rival: puedes dibujar rutas · ")
      + Math.ceil(p.pausa.queda) + " s";
  } else if (p.fase === "descanso") {
    // el descanso, para hacer los cambios con calma: la segunda parte empieza
    // cuando pulsan los dos o al acabarse el tiempo (O-305)
    const listo = !!(p.listos && p.listos[YO]);
    const cambia = p.puedeCambiar(YO) && (p.banquillos[YO] || []).some((d, k) => !p.banquilloUsado[YO][k]);
    b.textContent = listo ? "Esperando al rival" : "Segunda parte";
    b.classList.add("seguir"); b.disabled = listo || DEMO;
    aviso.hidden = false;
    aviso.textContent = "Descanso" + (cambia ? ": pulsa a uno de los tuyos para cambiarlo" : "")
      + " · " + Math.ceil(Math.max(0, p.espera)) + " s";
  } else {
    b.classList.remove("seguir");
    b.textContent = "Pausa (quedan " + p.pausasQuedan[YO] + ")";
    b.disabled = p.fase !== "juego" || p.pausasQuedan[YO] <= 0 || DEMO;
    aviso.hidden = true;
  }
}
$("#boton-pausa").onclick = ev => {
  // el segundo clic de un doble clic no cuenta: pausaba y seguia en el acto y se
  // perdia una pausa (la barra espaciadora llega con detail 0) (O-305)
  if (!PARTIDO || ev.detail > 1) return;
  if (PARTIDO.fase === "pausa" || PARTIDO.fase === "descanso") PARTIDO.ordenar({ tipo: "seguir", lado: YO });
  else PARTIDO.ordenar({ tipo: "pausa", lado: YO });
};
document.addEventListener("keydown", ev => {
  if (ev.code !== "Space" || !PARTIDO || $("#pantalla-juego").hidden || /input|select|textarea/i.test(ev.target.tagName)) return;
  ev.preventDefault();
  // mantener el espacio no alterna pausa y seguir: cada repeticion de la tecla
  // gastaba una pausa (O-305)
  if (ev.repeat) return;
  $("#boton-pausa").click();
});

// las tacticas de mi equipo: un boton cada una, con su recarga (O-290)
let tacticasPintadas = "";
function pintarTacticas() {
  const p = PARTIDO, caja = $("#tacticas"), tac = p.tacticas[YO] || [];
  const ahora = p.segundosDeJuego(), activa = p.tacticaActiva[YO];
  const estado = tac.map((t, k) => (activa && activa.k === k ? "A" + Math.ceil(activa.hasta - ahora)
    : Math.max(0, Math.ceil(p.tacticaLista[YO][k] - ahora)))).join(",") + (p.fase === "juego" ? "j" : "p");
  // con el raton apretado sobre una tactica no se rehacen: si el boton cambiaba
  // entre apretar y soltar, el clic se perdia (O-305)
  if (caja.matches(":active")) return;
  if (estado === tacticasPintadas) return;
  tacticasPintadas = estado;
  caja.textContent = "";
  if (!tac.length) { caja.appendChild(el("span", { class: "ayuda", text: "Tu equipo no lleva tacticas." })); return; }
  tac.forEach((t, k) => {
    const espera = Math.max(0, Math.ceil(p.tacticaLista[YO][k] - ahora));
    // las que el partido aun no sabe aplicar salen apagadas (O-304)
    const esActiva = activa && activa.k === k, sinEfecto = !(t.efectos || []).length;
    const b = el("button", { class: "tactica-btn" + (esActiva ? " activa" : ""), title: t.descripcion + "\n" + t.texto,
      disabled: sinEfecto || esActiva || !!activa || espera > 0 || p.fase !== "juego" },
      [el("span", { text: t.nombre }), el("small", { text: sinEfecto ? "sin efecto en el partido" : esActiva ? "activa " + Math.ceil(activa.hasta - ahora) + " s" : espera > 0 ? espera + " s" : "lista" })]);
    b.onclick = () => PARTIDO.ordenar({ tipo: "tactica", lado: YO, k });
    caja.appendChild(b);
  });
}

function registro() {
  const p = PARTIDO, caja = $("#registro");
  while (eventosVistos < p.eventos.length) {
    const e = p.eventos[eventosVistos++];
    if (!e) continue;              // online, perdido en un corte de red (O-305)
    const min = Math.floor(e.reloj / p.duracion * 45) + (e.mitad === 2 ? 45 : 0);
    caja.prepend(el("div", { text: min + "' " + e.texto, class: e.clase || "" }));
    // lo que no se hace por algo tuyo ("demasiado lejos para chutar") se dice
    // tambien arriba: solo en el registro, pulsar la porteria no hacia nada visible (O-305)
    if (e.clase === "aviso" && e.lado === YO && !DEMO) avisa(e.texto, "mal");
  }
}

let pasivasAbiertas = false;   // las pasivas de la ficha, abiertas o no (O-305)
function fichaElegido() {
  const p = PARTIDO, id = PANTALLA.elegido !== null ? PANTALLA.elegido : (p.dueno() && p.dueno().lado === YO ? p.dueno().id : null);
  const caja = $("#ficha-actual");
  // con el raton apretado sobre la ficha no se rehace: si el boton (Invocar, un
  // suplente) cambiaba entre apretar y soltar, el clic se perdia (O-305)
  if (caja.matches(":active")) return;
  if (id === null || id === undefined) { caja.textContent = "Pulsa o arrastra a uno de tus jugadores."; caja.dataset.id = ""; return; }
  const j = p.jugadores[id];
  // la cuenta del espiritu no baja de 0: sin invocarlo era negativa y la ficha
  // se rehacia cada segundo (O-305)
  const clave = id + ":" + j.nombre + ":" + Math.round(p.tension[YO]) + ":" + (j.espiritu ? Math.max(0, Math.ceil(Math.max(j.aura, j.auraLista) - p.segundosDeJuego())) : "")
    + ":" + (j.lado === YO && p.puedeCambiar(YO) ? p.cambiosQuedan[YO] : "-");
  if (caja.dataset.id === clave) return;
  caja.dataset.id = clave;
  caja._pintado = performance.now();     // para no aceptar un clic que era para la de antes (O-305)
  caja.textContent = "";
  caja.appendChild(el("div", { class: "quien" }, [
    el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }),
    el("div", {}, [el("b", { text: j.nombre }), el("div", { text: j.posicion + " · " + (j.elemento || "") })])]));
  const barra = el("div", { class: "barra-pt", title: "Tension del equipo" }, [el("i")]);
  barra.firstChild.style.width = Math.round(p.tension[YO] / REGLAS.TENSION_MAX * 100) + "%";
  caja.appendChild(el("div", { text: "Tension del equipo " + Math.round(p.tension[YO]) + " / " + REGLAS.TENSION_MAX }));
  caja.appendChild(barra);
  if (j.espiritu && j.lado === YO) {
    const ahora = p.segundosDeJuego(), activo = p.conAura(j), espera = Math.ceil(j.auraLista - ahora);
    const b = el("button", { class: "tactica-btn espiritu", disabled: activo || espera > 0 || p.tension[YO] < REGLAS.INVOCAR_COSTE || p.fase !== "juego" },
      [el("span", { text: "Invocar " + j.espiritu.nombre }),
       el("small", { text: activo ? "activo " + Math.ceil(j.aura - ahora) + " s" : espera > 0 ? espera + " s" : REGLAS.INVOCAR_COSTE + " de tension" })]);
    b.onclick = () => PARTIDO.ordenar({ tipo: "invocar", jugador: j.id });
    caja.appendChild(b);
  }
  // los cambios (O-297): en la pausa tecnica o en el descanso (O-305), quien entra por este jugador
  if (j.lado === YO && p.puedeCambiar(YO) && (p.banquillos[YO] || []).length) {
    caja.appendChild(el("div", { class: "coste", style: "margin-top:6px",
      text: "Cambiar por (quedan " + p.cambiosQuedan[YO] + " cambios):" }));
    const lista = el("div", { class: "banquillo" });
    p.banquillos[YO].forEach((d, k) => {
      if (p.banquilloUsado[YO][k]) return;
      const b = el("button", { class: "suplente", title: "Entra " + d.nombre + " por " + j.nombre }, [
        el("img", { alt: "", src: "/cara/" + encodeURIComponent(d.cara || "") }),
        el("span", { text: d.nombre }), el("small", { text: (d.posicion || "") + " · " + (d.elemento || "") })]);
      // ni el segundo clic de un doble clic ni uno recien rehecha la ficha: caia en
      // el siguiente suplente y se gastaban dos cambios (O-305)
      b.onclick = ev => {
        if (ev.detail > 1 || performance.now() - (caja._pintado || 0) < 300) return;
        PARTIDO.ordenar({ tipo: "cambio", lado: YO, sale: j.id, entra: k }); $("#ficha-actual").dataset.id = "";
      };
      lista.appendChild(b);
    });
    caja.appendChild(lista);
  }
  // una vez cada una: la partida puede tener la misma en varias ranuras
  const vistas = new Set();
  for (const t of j.tecnicas) {
    if (vistas.has(t.nombre)) continue;
    vistas.add(t.nombre);
    caja.appendChild(el("div", { text: "· " + t.nombre + " (" + t.tipo + ", " + t.poder + ", " + t.tp + " de tensión)" }));
  }
  if ((j.pasivas || []).length) {
    // plegadas: con todas a la vista la ficha empujaba las tacticas y el registro
    // fuera de la pantalla. La ficha se rehace a menudo (la tension), asi que se
    // recuerda si estaban abiertas (O-305)
    const d = el("details", { class: "pasivas-ficha" }, [
      el("summary", { class: "coste", text: "Pasivas (" + j.pasivas.length + "; las marcadas cuentan en el partido)" })]);
    for (const q of j.pasivas) d.appendChild(el("div", {
      text: (q.cuenta ? "✓ " : "· ") + q.texto + (q.abierta ? "" : " (cerrada en su arbol)"),
      style: q.cuenta ? "" : "opacity:.55" }));
    d.open = pasivasAbiertas;
    d.ontoggle = () => { pasivasAbiertas = d.open; };
    caja.appendChild(d);
  }
}

// --- el raton: el lapiz de DS ----------------------------------------------------
function raton() {
  const c = $("#campo");
  const pos = ev => { const r = c.getBoundingClientRect(); return { px: ev.clientX - r.left, py: ev.clientY - r.top }; };
  let empezado = null;
  const sePuede = () => PARTIDO && (PARTIDO.fase === "juego" || PARTIDO.fase === "pausa" || PARTIDO.fase === "duelo");
  c.onpointerdown = ev => {
    // en el descanso solo se elige a uno de los tuyos, para cambiarlo; sin
    // ordenes, que pasarian a la segunda parte (O-305)
    if (PARTIDO && PARTIDO.fase === "descanso") {
      const q = pos(ev), j = PANTALLA.jugadorEn(q.px, q.py, YO);
      if (j) PANTALLA.elegido = j.id;
      PANTALLA.pulsar(PANTALLA.aCampo(q.px, q.py));
      return;
    }
    if (!sePuede()) return;
    c.setPointerCapture(ev.pointerId);
    const q = pos(ev);
    // la onda cian donde pulsas, como la mirilla de IE3 (O-306)
    PANTALLA.pulsar(PANTALLA.aCampo(q.px, q.py));
    const j = PANTALLA.jugadorEn(q.px, q.py, YO);
    empezado = { q, j, puntos: [], campo: PANTALLA.aCampo(q.px, q.py), t0: performance.now(), lejos: 0 };
    if (j) { PANTALLA.elegido = j.id; empezado.puntos.push({ x: j.x, y: j.y }); PANTALLA.trazo = empezado; }
  };
  c.onpointermove = ev => {
    if (!empezado) return;
    const q = pos(ev), cp = PANTALLA.aCampo(q.px, q.py);
    // lo mas lejos que ha ido el raton, tambien si no empezo en un jugador (O-305)
    empezado.lejos = Math.max(empezado.lejos, Math.hypot(cp.x - empezado.campo.x, cp.y - empezado.campo.y));
    if (!empezado.j) return;
    const ult = empezado.puntos[empezado.puntos.length - 1];
    if (!ult || Math.hypot(cp.x - ult.x, cp.y - ult.y) > 1.5) empezado.puntos.push(cp);
  };
  c.onpointerup = ev => {
    if (!empezado) return;
    const e = empezado; empezado = null; PANTALLA.trazo = null;
    if (!sePuede()) return;
    const q = pos(ev), fin = PANTALLA.aCampo(q.px, q.py);
    const mov = Math.hypot(fin.x - e.campo.x, fin.y - e.campo.y);
    const d = PARTIDO.dueno();
    const tengo = d && d.lado === YO;
    if (e.j && mov > 2.5 && e.puntos.length > 1) {
      // arrastrar desde un jugador: su ruta (tambien en la pausa y en los duelos)
      PARTIDO.ordenar({ tipo: "ruta", jugador: e.j.id, puntos: e.puntos.slice(1) });
      return;
    }
    // un arrastre que no empezo en un jugador no es "pulsar un punto": salia un
    // pase al hueco (o un tiro) que no se queria (O-305)
    if (!e.j && Math.max(mov, e.lejos) > 2.5) return;
    // en un duelo, solo rutas; en un foco, el que lleva el balon deja marcado el
    // pase o el tiro, como en la pausa: sale si gana el duelo (O-306)
    const marca = PARTIDO.fase === "duelo" && tengo && PARTIDO.duelo && PARTIDO.duelo.tipo === "foco";
    if (PARTIDO.fase === "duelo" && !marca) return;
    const alto = performance.now() - e.t0 > 450;   // mantener pulsado: pase bombeado
    // pulsar al rival que lleva el balon: los tuyos van a presionarle
    if (d && d.lado !== YO) {
      const r = PANTALLA.jugadorEn(q.px, q.py, 1 - YO);
      if (r && r.id === d.id) { PARTIDO.ordenar({ tipo: "presionar", lado: YO, objetivo: r.id }); return; }
    }
    // con un pase mio de camino, pulsar la porteria: el que lo recibe remata de primeras.
    // Un pase sin quien lo da (foto de un anfitrion antiguo) no rompe el clic (O-305)
    const pd = PARTIDO.balon.pase && PARTIDO.jugadores[PARTIDO.balon.pase.de];
    if (!tengo && pd && pd.lado === YO) {
      const rec = PARTIDO.jugadores[PARTIDO.balon.pase.a], g = PARTIDO.porteriaRival(rec);
      // la X del cono del tiro, donde has pulsado (O-306)
      if (Math.abs(fin.y - g.y) < 7 && Math.abs(fin.x) < 9) { PANTALLA.apuntar(fin.x, g.y); PARTIDO.ordenar({ tipo: "directo", de: PARTIDO.balon.pase.de }); return; }
    }
    if (tengo) {
      // pulsar a un companero: pasarle (en la pausa queda marcado). Se mira antes
      // que la porteria: si estaba delante de ella, chutaba el del balon (O-305)
      if (e.j && e.j.id !== d.id) { PARTIDO.ordenar({ tipo: "pase", de: d.id, a: e.j.id, alto }); return; }
      // en la pausa (y en un foco, O-306), pulsar al que lleva el balon quita el
      // pase o el tiro marcado (O-305)
      if (e.j && (PARTIDO.fase === "pausa" || marca)) { PARTIDO.ordenar({ tipo: "pase", de: d.id, a: d.id }); return; }
      // pulsar la porteria rival: chutar. En la pausa el tiro queda marcado y sale
      // al seguir; antes acababa en un pase a la linea de gol (O-305)
      const g = PARTIDO.porteriaRival(d);
      if (Math.abs(fin.y - g.y) < 7 && Math.abs(fin.x) < 9) { PANTALLA.apuntar(fin.x, g.y); PARTIDO.ordenar({ tipo: "tiro", de: d.id }); return; }
      if (e.j) return;
      // pulsar un punto: pase al hueco
      PARTIDO.ordenar({ tipo: "pasePunto", de: d.id, x: fin.x, y: fin.y, alto });
      return;
    }
    // pulsar a uno de los tuyos sin balon solo lo elige (su ficha, cambiarlo):
    // antes le borraba la ruta y lo dejaba quieto donde estaba (O-305)
    if (e.j) return;
    // sin balon: el elegido va a ese punto
    const quien = PANTALLA.elegido !== null ? PARTIDO.jugadores[PANTALLA.elegido] : null;
    if (quien && quien.lado === YO) PARTIDO.ordenar({ tipo: "ruta", jugador: quien.id, puntos: [fin] });
  };
}

// --- la pausa de un duelo ---------------------------------------------------------
// apoyo: los companeros que le ayudan en un foco ({ids, pct}, del motor): sus
// caras pequenas y lo que suman, como la cara del que apoya en CS (O-306)
function cara(j, apoyo) {
  const fig = el("figure", {}, [el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }), el("figcaption", { text: j.nombre })]);
  const quienes = apoyo && apoyo.ids ? apoyo.ids.map(id => PARTIDO.jugadores[id]).filter(Boolean) : [];
  if (quienes.length) {
    const pct = c => Math.round((REGLAS.APOYO + (c.elemento && c.elemento === j.elemento ? REGLAS.APOYO_ELEMENTO : 0)) * 100);
    fig.appendChild(el("div", { class: "apoyos",
      title: "Le apoyan (compañeros a menos de " + REGLAS.APOYO_RADIO + " m; más si son de su elemento): "
        + quienes.map(c => c.nombre + " +" + pct(c) + " %").join(", ") },
      [...quienes.map(c => el("img", { alt: c.nombre, src: "/cara/" + encodeURIComponent(c.cara || "") })),
       el("span", { text: "apoyo +" + apoyo.pct + " %" })]));
  }
  return fig;
}

const NOMBRE_ELEM = e => e === "Montana" ? "Montaña" : e;
// el poder de base de los dos antes de elegir, como el "Poder de base" de CS o
// la barra de Light (O-306): cada numero bajo su cara (izq. el que ataca) y en
// medio los elementos, con la flecha hacia el que pierde si hay ventaja (+20 %).
// En un foco, debajo, la disputa: si el defensa carga se juega con otros numeros.
// En el tiro el elemento del portero no le suma (solo el de su supertecnica)
function barraBase(du, izq, der, yoIzq) {
  const b = du.base;
  if (!b || b[izq.lado] === undefined) return null;     // un anfitrion anterior no lo manda
  const gI = REGLAS.gana(izq.elemento, der.elemento), gD = du.tipo === "foco" && REGLAS.gana(der.elemento, izq.elemento);
  const lado = (j, clase) => el("div", { class: "base-lado " + clase + (j.lado === 0 ? " azul" : " rojo") },
    [el("small", { text: "Poder de base" }), el("b", { text: String(b[j.lado]) })]);
  const caja = el("div", { class: "base-duelo" }, [
    lado(izq, "izq"),
    el("div", { class: "base-elem", title: gI ? NOMBRE_ELEM(izq.elemento) + " gana a " + NOMBRE_ELEM(der.elemento) + ": " + izq.nombre + " +20 %"
        : gD ? NOMBRE_ELEM(der.elemento) + " gana a " + NOMBRE_ELEM(izq.elemento) + ": " + der.nombre + " +20 %" : "Sin ventaja de elemento" }, [
      izq.elemento ? iconoElemento(izq.elemento, 20) : null,
      el("b", { class: "flecha" + (gI || gD ? " si" : ""), text: gI ? "▶" : gD ? "◀" : "·" }),
      der.elemento ? iconoElemento(der.elemento, 20) : null]),
    lado(der, "der")]);
  if (b.disputa) caja.appendChild(el("div", { class: "base-disputa", title: "Cargar es una disputa: cuentan otros stats (Presión, Físico, Inteligencia)" }, [
    el("b", { text: String(b.disputa[izq.lado]) }),
    el("small", { text: yoIzq ? "si te carga: disputa" : "si cargas: disputa" }),
    el("b", { text: String(b.disputa[der.lado]) })]));
  return caja;
}

// total: el de este boton si no es el suyo (la cadena cambia con el tiro elegido)
function botonComando(o, j, alElegir, total) {
  // a la derecha, lo que suma la supertecnica y el total con el que quedarias
  // (O-306); Romper y Entrada, de cuanto a cuanto (son inestables), y Cargar,
  // su numero de disputa. Sin el (anfitrion anterior), como antes
  const t = total !== undefined ? total : o.total;
  const cifra = (o.clave === "nada" && total === undefined) || t === undefined ? null
    : o.min !== undefined ? "de " + o.min + " a " + o.max
    : o.clave === "cargar" ? "disputa " + t : "total " + t;
  const b = el("button", { class: "comando", disabled: !o.puede }, [
    o.tipo ? iconoTipo(o.tipo, 22) : null,
    o.elemento ? iconoElemento(o.elemento, 20) : null,
    el("span", {}, [el("span", { text: o.nombre }), o.nota ? el("div", { class: "coste", text: o.nota }) : null,
      o.tp ? el("div", { class: "coste", text: o.tp + " de tension (tienes " + Math.round(j.pt) + ")" }) : null]),
    o.poder || cifra ? el("span", { class: "cifras" }, [
      o.poder ? el("span", { class: "poder", text: "+" + o.poder }) : null,
      cifra ? el("small", { class: "total", text: cifra }) : null]) : null]);
  // ni el segundo clic de un doble clic ni uno recien rehecha la lista: caia en
  // el boton nuevo de debajo (la parada tras el muro, la cadena tras el tiro) (O-305)
  b.onclick = ev => {
    if (ev.detail > 1 || performance.now() - ((b.parentNode && b.parentNode._pintado) || 0) < 300) return;
    alElegir(o.clave);
  };
  return b;
}

let mostrando = null;          // "duelo:<id>", "resultado", "final" o "fuera"
let ultimaEleccion = null;     // online, la ultima eleccion del invitado (O-305)
function pausa() {
  const p = PARTIDO, capa = $("#pausa");
  $("#duelos-vacio").hidden = !capa.hidden;
  // online, la eleccion del invitado va una sola vez y sin acuse, y el duelo no
  // tiene limite de tiempo: si se perdia, el partido se quedaba parado. Mientras
  // la foto siga esperandola se repite cada 1,5 s; el anfitrion no aplica dos
  // del mismo lado ni una de otro duelo (O-305)
  const ue = ultimaEleccion;
  if (MODO === "invitado" && ue && p.fase === "duelo" && p.duelo && p.duelo.id === ue.duelo && p.pendientes()[YO]
      && Date.now() - ue.t > 1500) {
    ue.t = Date.now();
    RED.orden({ tipo: "elegir", lado: ue.lado, eleccion: ue.eleccion, duelo: ue.duelo });
  }
  // el rival se ha ido a mitad de partido: se dice y se puede empezar otro (O-305)
  if (MODO !== "maquina" && RED && RED.rivalFuera && p.fase !== "final") {
    if (mostrando !== "fuera") mostrarRivalFuera();
    return;
  }
  if (AYUDANTE && p.fase === "duelo" && p.duelo && p.duelo.tipo === "foco" && p.pendientes()[YO] && !duelosElegidos.has(p.duelo.id)) {
    duelosElegidos.add(p.duelo.id);
    AYUDANTE._elegir();
  }
  // el resultado de un duelo que acaba de pasar: se ensena un momento
  if (p.resultado && p.resultado !== ultimoResultado) {
    ultimoResultado = p.resultado;
    mostrarResultado(p.resultado);
    return;
  }
  if (mostrando === "resultado") return;
  if (p.fase === "final") { if (mostrando !== "final") mostrarFinal(); return; }
  // el descanso: el marcador y las estadisticas de la 1.ª parte (O-306)
  if (p.fase === "descanso") { if (mostrando !== "descanso") mostrarDescanso(); return; }
  const pend = p.fase === "duelo" && !DEMO && !duelosElegidos.has(p.duelo.id) ? p.pendientes()[YO] : null;
  if (!pend) { if (mostrando) { mostrando = null; capa.hidden = true; } return; }
  // online, lo que queda para elegir (luego va el comando seguro)
  const cuenta = $("#cuenta-duelo");
  if (cuenta) cuenta.textContent = p.limiteDuelo ? "Te quedan " + Math.max(0, Math.ceil(p.limiteDuelo - (p.duelo.reloj || 0))) + " s para elegir" : "";
  if (mostrando === "duelo:" + p.duelo.id) return;
  mostrando = "duelo:" + p.duelo.id;
  pintarEleccion(p, pend);
}

function elegido(eleccion) {
  if (PARTIDO.duelo) duelosElegidos.add(PARTIDO.duelo.id);
  PARTIDO.elegir(YO, eleccion);
  mostrando = null; $("#pausa").hidden = true;
}

function pintarEleccion(p, pend) {
  const caja = $("#pausa-caja"), capa = $("#pausa"), du = p.duelo;
  caja.textContent = "";
  const lista = el("div", { class: "comandos" });
  lista._pintado = performance.now();   // cuando se lleno, para el doble clic (O-305)
  if (du.tipo === "foco") {
    const att = p.jugadores[du.atacante], def = p.jugadores[du.defensor];
    caja.appendChild(el("div", { class: "titulo-duelo", text: pend.rol === "ataque" ? "¡Te sale al paso!" : "¡A por el balón!" }));
    if (p.limiteDuelo) caja.appendChild(el("div", { class: "coste", id: "cuenta-duelo" }));
    const ap = (du.base && du.base.apoyos) || {};
    caja.appendChild(el("div", { class: "cara-a-cara" }, [cara(att, ap[att.lado]), el("b", { text: "VS" }), cara(def, ap[def.lado])]));
    const barra = barraBase(du, att, def, pend.rol === "ataque");
    if (barra) caja.appendChild(barra);
    // con el balon, el pase o el tiro se puede dejar marcado ya (O-306). Online,
    // un anfitrion anterior (sin base) no lo acepta: entonces no se dice
    if (pend.rol === "ataque" && du.base) caja.appendChild(el("div", { class: "pista",
      text: "Ya puedes marcar en el campo el pase o el tiro: sale si ganas." }));
    const j = p.jugadores[pend.jugador];
    for (const o of pend.opciones) lista.appendChild(botonComando(o, j, clave => elegido(clave)));
  } else {
    const tir = p.jugadores[du.tirador], por = p.jugadores[du.portero];
    caja.appendChild(el("div", { class: "titulo-duelo", text: pend.rol === "tiro" ? "¡Tiro a puerta!" : "¡Te chutan!" }));
    if (p.limiteDuelo) caja.appendChild(el("div", { class: "coste", id: "cuenta-duelo" }));
    caja.appendChild(el("div", { class: "cara-a-cara" }, [cara(tir), el("b", { text: "VS" }), cara(por)]));
    const barra = barraBase(du, tir, por, pend.rol === "tiro");
    if (barra) caja.appendChild(barra);
    if (pend.rol === "tiro") {
      for (const o of pend.opciones) lista.appendChild(botonComando(o, tir, clave => {
        if (!pend.cadena) return elegido({ tiro: clave });
        // un companero en la linea de tiro: ¿encadena?
        const ch = p.jugadores[pend.cadena.jugador];
        const gasto = (pend.opciones.find(x => x.clave === clave) || {}).tp || 0;
        lista.textContent = ""; lista._pintado = performance.now();
        lista.appendChild(el("div", { class: "coste", text: ch.nombre + " esta en la linea de tiro: ¿encadena el tiro?" }));
        for (const oc of pend.cadena.opciones) {
          const op = Object.assign({}, oc, { puede: oc.puede && oc.tp + gasto <= p.tension[YO] });
          // el total del tiro con esta cadena (y sin ella), segun el tiro elegido (O-306)
          lista.appendChild(botonComando(op, ch, c2 => elegido({ tiro: clave, cadena: c2 }), oc.totales ? oc.totales[clave] : undefined));
        }
      }));
    } else {
      // defiendes: primero el muro (si hay alguien en la linea) y luego el portero
      const pideParada = (muro) => {
        lista.textContent = ""; lista._pintado = performance.now();
        lista.appendChild(el("div", { class: "coste", text: "Portero: " + por.nombre }));
        // la tension que ya se lleva el bloqueo no la tiene el portero
        const gastoMuro = ((pend.muro && pend.muro.opciones.find(o => o.clave === muro)) || {}).tp || 0;
        for (const o of pend.opciones) {
          const op = Object.assign({}, o, { puede: o.puede && o.tp + gastoMuro <= p.tension[YO] });
          lista.appendChild(botonComando(op, por, clave => elegido({ parada: clave, muro })));
        }
      };
      if (pend.muro) {
        const m = p.jugadores[pend.muro.jugador];
        lista.appendChild(el("div", { class: "coste", text: m.nombre + " esta en la linea de tiro: ¿bloquea?" }));
        for (const o of pend.muro.opciones) lista.appendChild(botonComando(o, m, clave => pideParada(clave)));
      } else pideParada(null);
    }
  }
  caja.appendChild(lista);
  capa.hidden = false;
}

// con la 3D encima, el panel de los duelos quedaba por debajo de la columna en un
// portatil: ningun boton a la vista y, sin limite para elegir, el partido parado.
// Cada vez que cambia lo que se ensena (la eleccion, la lista que se rehace, el
// rotulo, el final), la columna del centro baja lo justo para verlo entero sin
// perder su principio. Solo la columna, no la ventana: el campo no se mueve (O-305)
function verPausa() {
  const col = document.querySelector(".duelos"), capa = $("#pausa");
  if (!col || capa.hidden) return;
  const r = $("#pausa-caja").getBoundingClientRect(), rc = col.getBoundingClientRect();
  const baja = Math.min(r.bottom - rc.bottom + 6, r.top - rc.top);
  if (baja > 0) col.scrollTop += baja;
}
new MutationObserver(verPausa).observe($("#pausa"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

function mostrarFinal() {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  mostrando = "final";
  caja.textContent = "";
  const gano = p.goles[YO] > p.goles[1 - YO], empate = p.goles[0] === p.goles[1];
  caja.appendChild(el("div", { class: "titulo-duelo", text: empate ? "¡Empate!" : gano ? "¡Has ganado!" : "Has perdido" }));
  // con estadisticas, el marcador de colores y debajo ellas, con los goles de
  // cada equipo (O-306); sin ellas (anfitrion anterior), como antes
  const est = bloqueEstadisticas(p);
  if (est) { caja.appendChild(marcadorFinal(p)); caja.appendChild(est); }
  else {
    caja.appendChild(el("div", { class: "resultado", text: p.nombres[0] + "  " + p.goles[0] + " - " + p.goles[1] + "  " + p.nombres[1] }));
    const goles = p.eventos.filter(e => e && e.clase === "gol").map(e => {
      const min = Math.floor(e.reloj / p.duracion * 45) + (e.mitad === 2 ? 45 : 0);
      return min + "' " + e.texto.replace(/ \(.*\)$/, "");
    });
    if (goles.length) caja.appendChild(el("div", { class: "registro", text: goles.join("\n"), style: "white-space:pre-line;max-height:160px" }));
  }
  caja.appendChild(el("button", { class: "grande", onclick: () => { if (RED) RED.salirSala(); location.href = "/partido"; } }, [el("span", { text: "Otro partido" })]));
  capa.hidden = false;
}

// el descanso, como el "Fin de la 1.ª parte" de CS o el "Half Time" de Light: el
// marcador y las estadisticas. Sin botones: los cambios se hacen en el campo y
// en la ficha de la derecha, y la 2.ª parte empieza con "Segunda parte", el de
// siempre (O-305). Va en la columna de los duelos, que en el descanso esta libre (O-306)
function mostrarDescanso() {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  mostrando = "descanso";
  caja.textContent = "";
  caja.appendChild(el("div", { class: "titulo-duelo", text: "Fin de la 1.ª parte" }));
  caja.appendChild(marcadorFinal(p));
  const est = bloqueEstadisticas(p);
  if (est) caja.appendChild(est);
  // como el aviso del campo: lo de cambiar, solo si quedan cambios y suplentes
  const cambia = p.puedeCambiar(YO) && (p.banquillos[YO] || []).some((d, k) => !p.banquilloUsado[YO][k]);
  if (!DEMO) caja.appendChild(el("div", { class: "pista", text: (cambia ? "Pulsa a uno de los tuyos en el campo para cambiarlo. Cuando acabes, " : "Cuando estés listo, ")
    + "«Segunda parte» (a la derecha)." }));
  capa.hidden = false;
}

// el marcador grande del descanso y del final: cada equipo de su color (azul el
// de la izquierda, rojo el de la derecha, como el marcador de 3DS) (O-306)
function marcadorFinal(p) {
  return el("div", { class: "marcador-final" }, [
    el("span", { class: "eq azul", text: p.nombres[0], title: p.nombres[0] }),
    el("b", { text: p.goles[0] + " - " + p.goles[1] }),
    el("span", { class: "eq rojo", text: p.nombres[1], title: p.nombres[1] })]);
}

// las estadisticas, como en los cinco juegos (CS, Galaxy, Light, IE3): tiros,
// supertecnicas, posesion en % con la barra de los dos colores y los goles de
// cada equipo con su minuto. Las cuenta el motor y van en la foto (O-306); las
// de un anfitrion anterior no llegan (posesion a 0) y no se ensenan
function bloqueEstadisticas(p) {
  const es = p.estadisticas, po = es && es.posesion;
  if (!po || !(po[0] + po[1] > 0)) return null;
  const pc = Math.round(po[0] / (po[0] + po[1]) * 100);
  const caja = el("div", { class: "estadisticas" }, [el("div", { class: "est-titulo", text: "Estadísticas" })]);
  const fila = (a, que, b, title) => [el("b", { text: String(a) }), el("span", { class: "est-que", text: que, title }), el("b", { text: String(b) })]
    .forEach(c => caja.appendChild(c));
  fila(es.tiros[0], "Tiros", es.tiros[1], "Tiros a puerta, también los bloqueados y los penaltis");
  fila(es.tecnicas[0], "Supertécnicas", es.tecnicas[1], "Supertécnicas usadas en regates, entradas, tiros, bloqueos y paradas");
  fila(pc + " %", "Posesión", (100 - pc) + " %", "Tiempo de juego con el balón (del último que lo tocó)");
  const barra = el("div", { class: "est-barra", title: "Posesión: " + p.nombres[0] + " " + pc + " % · " + p.nombres[1] + " " + (100 - pc) + " %" }, [el("i")]);
  barra.firstChild.style.width = pc + "%";
  caja.appendChild(barra);
  // los goles: la parte (como el marcador, 1ª o 2ª), el minuto y quien
  const goles = lado => el("div", { class: "est-goles" }, (es.goles || []).filter(g => g[0] === lado).map(g =>
    el("div", { title: g[1] + "ª parte, " + g[2] + "' " + g[3] }, [el("small", { class: "parte p" + g[1], text: g[1] + "ª" }), el("span", { text: g[2] + "' " + g[3] })])));
  [goles(0), el("span", { class: "est-que", text: "Goles" }), goles(1)].forEach(c => caja.appendChild(c));
  return caja;
}

// online: el rival ha cerrado o ha salido a mitad de partido (O-305)
function mostrarRivalFuera() {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  mostrando = "fuera";
  caja.textContent = "";
  caja.appendChild(el("div", { class: "titulo-duelo", text: (RED.rival ? RED.rival.nombre : "El rival") + " ha salido del partido" }));
  caja.appendChild(el("div", { class: "resultado", text: p.nombres[0] + "  " + p.goles[0] + " - " + p.goles[1] + "  " + p.nombres[1] }));
  caja.appendChild(el("button", { class: "grande", onclick: () => { RED.salirSala(); location.href = "/partido"; } }, [el("span", { text: "Otro partido" })]));
  capa.hidden = false;
}

/* El resultado de un duelo, como un rotulo del juego: la cara, la
   supertecnica en una tarjeta del color de su elemento y el numero que saca
   cada uno (con lo que le suman las pasivas). */
function filaDuelo(j, nombre, esTecnica, elemento, valor, pasivas, gana, retardo, apoyo) {
  const fila = el("div", { class: "rotulo" + (gana ? " gana" : ""), style: "animation-delay:" + retardo + "ms" });
  fila.appendChild(el("img", { class: "rotulo-cara", alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }));
  // "(cadena)" va con el nombre del jugador: detras de la supertecnica la partia
  // en tres lineas (O-305)
  const cadena = / \(cadena\)$/.test(nombre);
  if (cadena) nombre = nombre.replace(/ \(cadena\)$/, "");
  const centro = el("div", { class: "rotulo-centro" }, [el("small", { text: j.nombre + (cadena ? " · en cadena" : "") })]);
  if (esTecnica) {
    // el nombre entero tambien al pasar el raton (O-305)
    const t = el("div", { class: "rotulo-tecnica" }, [elemento ? iconoElemento(elemento, 20) : null, el("b", { text: nombre, title: nombre })]);
    const c = BARRA_ELEM[elemento] || BARRA_SIN;
    t.style.background = "linear-gradient(90deg, " + c[0] + ", " + c[1] + ")";
    centro.appendChild(t);
  } else centro.appendChild(el("b", { class: "rotulo-comando", text: nombre }));
  // y lo que suman los apoyos en un foco, como en el panel (O-306)
  const suma = [pasivas ? "pasivas +" + pasivas + " %" : "", apoyo ? "apoyo +" + apoyo + " %" : ""].filter(Boolean).join(" · ");
  if (suma) centro.appendChild(el("small", { class: "rotulo-pasivas", text: suma }));
  fila.appendChild(centro);
  const num = el("span", { class: "rotulo-valor", text: "0" });
  fila.appendChild(num);
  // el numero sube poco a poco, como en el juego
  const t0 = performance.now() + retardo;
  const sube = ahora => {
    const k = Math.max(0, Math.min(1, (ahora - t0) / 600));
    num.textContent = String(Math.round(valor * k));
    if (k < 1) requestAnimationFrame(sube);
  };
  requestAnimationFrame(sube);
  setTimeout(() => { num.textContent = String(valor); }, retardo + 700);
  return fila;
}

// cada resultado tiene su turno: el temporizador de uno anterior (un foco, 2,2 s)
// escondia el siguiente (un fuera de juego) a los pocos ms (O-306)
let turnoResultado = 0;
function mostrarResultado(r) {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  const turno = ++turnoResultado;
  const esconder = () => { if (mostrando === "resultado" && turno === turnoResultado) { mostrando = null; capa.hidden = true; } };
  caja.textContent = "";
  let dura = 1600;
  if (r.tipo === "fuera") {
    const j = p.jugadores[r.quien];
    caja.appendChild(el("div", { class: "titulo-duelo", text: "¡Fuera de juego!" }));
    caja.appendChild(el("div", { class: "resultado", text: j.nombre + " estaba por delante del penúltimo rival" }));
    capa.hidden = false; mostrando = "resultado";
    setTimeout(esconder, 1500);
    return;
  }
  if (r.tipo === "tiro") {
    const tir = p.jugadores[r.tirador];
    const final = r.final === "gol" ? "¡¡GOOOL!!" : r.final === "bloqueado" ? "¡Bloqueado!" : r.final === "despeje" ? "¡Despeje!" : "¡Parada!";
    // kAt: la ultima fila del que ataca (la cadena, si la hay). El AT final del
    // tiro va en ella y no en la del primero (salian los dos con el total), y en
    // un gol se marca al que marca; en un bloqueo, solo al muro (O-305)
    const ladoAt = p.jugadores[r.pasos[0].quien].lado;
    let kAt = 0;
    r.pasos.forEach((s, k) => { if (p.jugadores[s.quien].lado === ladoAt) kAt = k; });
    r.pasos.forEach((paso, k) => {
      const j = p.jugadores[paso.quien];
      const ultimo = k === r.pasos.length - 1;
      const gana = r.final === "gol" ? k === kAt : ultimo;
      const valor = k === kAt && r.pasos[0].valorFinal ? r.pasos[0].valorFinal : paso.valor;
      caja.appendChild(filaDuelo(j, paso.que, paso.tecnica, paso.elemento, valor, paso.pasivas, gana, k * 450));
    });
    caja.appendChild(el("div", { class: "titulo-duelo final-duelo", text: final, style: "animation-delay:" + (r.pasos.length * 450 + 200) + "ms" }));
    if (r.final === "gol") caja.appendChild(el("div", { class: "resultado", text: "Gol de " + tir.nombre }));
    dura = r.pasos.length * 450 + 1900;
  } else {
    const att = p.jugadores[r.atacante], def = p.jugadores[r.defensor], gan = p.jugadores[r.ganador];
    caja.appendChild(el("div", { class: "titulo-duelo", text: r.tipo === "falta" ? (r.penalti ? "¡Falta! ¡Penalti!" : "¡Falta! Tiro libre") : r.tipo === "disputa" ? "Disputa" : "Foco" }));
    [att, def].forEach((j, k) => {
      const elem = r.elementos ? r.elementos[j.lado] : null;
      const ap = r.apoyos && r.apoyos[j.lado];
      caja.appendChild(filaDuelo(j, r.tecnicas[j.lado], elem !== null && elem !== undefined, elem || "", r.valores[j.lado],
        r.pasivas ? r.pasivas[j.lado] : 0, j === gan, k * 350, ap ? Math.round((ap.factor - 1) * 100) : 0));
    });
    caja.appendChild(el("div", { class: "resultado final-duelo", style: "animation-delay:900ms",
      text: r.tipo === "falta" ? "Falta de " + def.nombre : gan.lado === YO ? "¡Bien! Gana " + gan.nombre : "Gana " + gan.nombre }));
    dura = 2200;
  }
  capa.hidden = false;
  mostrando = "resultado";
  setTimeout(esconder, dura);
}

/* --- online (O-287) ----------------------------------------------------------- */
let ultimaFoto = 0, fotoClave = "";
function mandarFoto() {
  const ahora = Date.now();
  if (ahora - ultimaFoto < 100) return;
  // 10 fotos por segundo; si nada cambia (duelo sin elegir, final, rival sin
  // noticias), una por segundo. Se mira la foto sin su numero de paso: los
  // pasos cuentan tambien parados y antes salian siempre 10 (O-305)
  const foto = PARTIDO.foto(1), clave = JSON.stringify(Object.assign({}, foto, { n: 0 }));
  if (clave === fotoClave && ahora - ultimaFoto < 1000) return;
  ultimaFoto = ahora; fotoClave = clave;
  RED.mandar({ tipo: "foto", foto });
}

function nombreEquipoA() {
  const sel = $("#equipo-a");
  return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "tu equipo";
}

$("#jugar-online").onclick = () => {
  $("#online").hidden = !$("#online").hidden;
  $("#online-equipo").textContent = nombreEquipoA();
  try { $("#nombre").value = $("#nombre").value || (JSON.parse(localStorage.getItem("draft-nombre") || "null") || {}).nombre || ""; } catch (e) {}
};
$("#equipo-a").addEventListener("change", () => {
  $("#online-equipo").textContent = nombreEquipoA();
  if (RED) { RED.equipo = nombreEquipoA(); RED.anunciarme(); }
});
$("#entrar").onclick = entrarOnline;
$("#nombre").onkeydown = e => { if (e.key === "Enter") entrarOnline(); };

function entrarOnline() {
  const nombre = $("#nombre").value.trim();
  if (RED) { RED.salir(); RED = null; }
  RED = new RedPartido();
  try { RED.entrar(nombre, nombreEquipoA()); }
  catch (e) { avisa(e.message, "mal"); RED = null; return; }
  try { localStorage.setItem("draft-nombre", JSON.stringify(RED.yo)); } catch (e) {}
  RED.alEstado = e => {
    const b = $("#estado-red");
    b.classList.toggle("si", e === "conectado");
    b.textContent = e === "conectado" ? "conectado" : "conectando...";
  };
  RED.alGente = pintarGente;
  RED.alInvitacion = alInvitacion;
  RED.alRespuesta = m => {
    if (m.tipo === "rechaza") avisa(m.nombre + " no puede jugar ahora.", "mal");
    pintarGente(RED.gente);
  };
  RED.alSala = alSala;
  $("#estado-red").textContent = "conectando...";
  pintarGente({});
}

function pintarGente(gente) {
  const caja = $("#gente");
  caja.textContent = "";
  const otros = Object.entries(gente).filter(([s]) => !RED || s !== RED.yo.slug);
  if (!otros.length) {
    caja.appendChild(el("span", { class: "nota izq", text: "Nadie mas en Partido ahora mismo. Dile a tu amigo que abra Pizarra y entre en Partido > Jugar online." }));
    return;
  }
  for (const [s, g] of otros) {
    const esperando = RED && RED.pendiente && RED.pendiente.slug === s;
    caja.appendChild(el("div", { class: "persona" }, [
      el("b", { text: g.nombre }), el("small", { text: (g.equipo ? g.equipo + " · " : "") + (g.estado || "") }),
      esperando
        ? el("button", { class: "btn-mini gris", text: "Cancelar", onclick: () => { RED.cancelar(); pintarGente(RED.gente); } })
        : el("button", { class: "btn-mini", text: "Invitar", disabled: g.estado === "jugando" || !!RED.sala,
            onclick: () => { RED.invitar(s, g.nombre); avisa("Invitacion mandada a " + g.nombre + ".", "bien"); pintarGente(RED.gente); } })]));
  }
}

const invitaciones = {};
function alInvitacion(m) {
  if (m.tipo === "cancela") delete invitaciones[m.sala];
  else if (m.tipo === "invita" && !RED.sala) invitaciones[m.sala] = m;
  const caja = $("#invitaciones");
  caja.textContent = "";
  for (const inv of Object.values(invitaciones)) {
    caja.appendChild(el("div", { class: "invitacion" }, [
      el("b", { text: inv.nombre + " te reta" + (inv.equipo ? " con " + inv.equipo : "") }),
      el("button", { class: "btn-mini", text: "Aceptar", onclick: () => {
        for (const k in invitaciones) delete invitaciones[k];
        caja.textContent = "";
        RED.responder(inv, true);
      } }),
      el("button", { class: "btn-mini gris", text: "No", onclick: () => {
        delete invitaciones[inv.sala];
        RED.responder(inv, false);
        alInvitacion({});
      } })]));
  }
}

let equiposOnline = null;
async function alSala(m) {
  if (m.tipo === "dentro") {
    $("#nota-elegir").textContent = "Partido contra " + m.rival.nombre + ": preparando los equipos...";
    if (m.rol === "invitado") {
      // el invitado manda su equipo hasta que el anfitrion monte el partido
      const mio = equipoParaRed(await equipoDatos(+$("#equipo-a").value));
      RED._repite("equipo", () => RED.mandar({ tipo: "equipo", datos: mio }));
      RED._repite("vivo", () => RED.mandar({ tipo: "vivo" }), 100000);
    }
    return;
  }
  if (m.tipo === "equipo" && RED.rol === "anfitrion" && !equiposOnline) {
    const mio = equipoParaRed(await equipoDatos(+$("#equipo-a").value));
    equiposOnline = { tipo: "equipos", a: mio, b: m.datos, semilla: (Math.random() * 1e9) | 0, mitad: duracionElegida(),
                      fueraDeJuego: $("#fuera-juego").checked };
    RED._repite("equipos", () => RED.mandar(equiposOnline));
    empezar(JSON.parse(JSON.stringify(mio)), JSON.parse(JSON.stringify(m.datos)),
            { modo: "anfitrion", semilla: equiposOnline.semilla, mitad: equiposOnline.mitad, fueraDeJuego: equiposOnline.fueraDeJuego });
    return;
  }
  if (m.tipo === "equipos" && RED.rol === "invitado" && !PARTIDO) {
    RED.para("equipo");
    RED._repite("listo", () => RED.mandar({ tipo: "listo" }), 5);
    empezar(m.a, m.b, { modo: "invitado", semilla: m.semilla, mitad: m.mitad, fueraDeJuego: m.fueraDeJuego });
    return;
  }
  if (m.tipo === "listo" && RED.rol === "anfitrion") { RED.para("equipos"); return; }
  if (m.tipo === "foto" && MODO === "invitado" && PARTIDO) { PARTIDO.aplicarFoto(m.foto); return; }
  if (m.tipo === "orden" && MODO === "anfitrion" && PARTIDO) {
    const o = m.o || {};
    // solo en el duelo en que se eligio: una copia que llega tarde no cae en el
    // siguiente (sin duelo, un invitado con un Pizarra anterior) (O-305)
    if (o.tipo === "elegir") {
      if (o.lado === 1 && PARTIDO.duelo && (o.duelo === undefined || o.duelo === PARTIDO.duelo.id)) PARTIDO.elegir(1, o.eleccion);
      return;
    }
    if (o.tipo === "tactica") { if (o.lado === 1) PARTIDO.usarTactica(1, o.k); return; }
    if (o.tipo === "pausa" || o.tipo === "seguir" || o.tipo === "presionar" || o.tipo === "cambio") { if (o.lado === 1) PARTIDO.ordenar(o); return; }
    if (o.tipo === "invocar") { const jj = PARTIDO.jugadores[o.jugador]; if (jj && jj.lado === 1) PARTIDO.ordenar(o); return; }
    const j = PARTIDO.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (j && j.lado === 1) PARTIDO.ordenar(o);
    return;
  }
  if (m.tipo === "adios") {
    // llega por los tres servidores: se avisa una vez y queda marcado (O-305)
    if (RED.rivalFuera) return;
    RED.rivalFuera = true;
    avisa(RED.rival ? RED.rival.nombre + " ha salido del partido." : "El rival ha salido.", "mal");
  }
}

cargarEquipos().then(() => { if (DEMO && EQUIPOS.length) $("#jugar-maquina").click(); });
