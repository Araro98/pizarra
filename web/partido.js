/* El juego de partidos (NOTAS O-286): elegir equipos, el bucle, el raton
   como el lapiz de DS y la pausa de cada duelo con sus comandos. */
"use strict";

let YO = 0;                   // tu lado: 0, o 1 si eres el invitado de un partido online
let MODO = "maquina";         // "maquina" | "anfitrion" | "invitado"
let RED = null;               // la conexion online (partido-red.js)
const duelosElegidos = new Set();
let EQUIPOS = [], DATOS = {}, PARTIDO = null, PANTALLA = null, MAQUINA = null, MAQUINA_YO = null, AYUDANTE = null;
// el campo 3D de abajo (Mundo3D, partido-3d.js): un solo WebGL para las dos pantallas.
// PANTALLA es su vista de abajo o, sin WebGL, la reserva 2D (O-317)
let MUNDO = null;
const DEMO = new URLSearchParams(location.search).has("demo");   // maquina contra maquina, para mirar
const SIN_3D = new URLSearchParams(location.search).has("2d");   // la reserva 2D, para las pruebas (O-317)
let eventosVistos = 0;
// las esperas sin limite (O-308): online, a los RED_ABANDONO s sin noticias del
// rival (o esperando a que pulse) sale "Dejar el partido". No se le da por ido
// solo: el navegador para la pestana oculta y se perderian partidos buenos
const RED_ABANDONO = 60;
let menuAbierto = false, menuDespliega = null;   // el Menu de las esperas (los cambios) y a quien se le ven los suplentes
let miSeguir = null;          // el Seguir/Jugar que he pulsado: {n: numero de la espera, t} (O-308)
let esperandoDesde = 0;       // desde cuando espero a que el rival pulse (O-308)

// --- la consola (O-316): la pagina como una 3DS, con las dos pantallas a escala -----
Consola.montar();
// "Como se juega" en la tactil (elegir); en el partido se lee en Registro (O-318)
$("#ayuda-elegir").appendChild($("#ayuda").content.cloneNode(true));

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
      verOnce(+s.value);
    };
  }
  pintarFilas();
  verOnce(+$("#equipo-a").value);
  verOnce(+$("#equipo-b").value);
}

// la duracion de cada parte en minutos del reloj de 3DS, 15 o 30 (se recuerda).
// Lo guardado de antes (180, 300 o 480 s reales) pasa a 15 (O-308)
function duracionElegida() { const v = +$("#duracion").value; return REGLAS.PARTES_MINUTOS.includes(v) ? v : 15; }
try { const d = localStorage.getItem("partido-duracion"); $("#duracion").value = REGLAS.PARTES_MINUTOS.includes(+d) ? String(+d) : "15"; } catch (e) {}
$("#duracion").onchange = () => { try { localStorage.setItem("partido-duracion", $("#duracion").value); } catch (e) {} };
// que pasa si hay empate: nada (por defecto), prorroga, penaltis o las dos (se
// recuerda; online vale la del que invita) (O-312)
function empateElegido() { const v = $("#empate").value; return REGLAS.EMPATE.includes(v) ? v : "nada"; }
try { const e = localStorage.getItem("partido-empate"); $("#empate").value = REGLAS.EMPATE.includes(e) ? e : "nada"; } catch (e) {}
$("#empate").onchange = () => { try { localStorage.setItem("partido-empate", $("#empate").value); } catch (e) {} };
try { $("#focos-auto").checked = localStorage.getItem("partido-focos-auto") === "1"; } catch (e) {}
try { $("#fuera-juego").checked = localStorage.getItem("partido-fuera-juego") !== "0"; } catch (e) {}
try { $("#sonido").checked = localStorage.getItem("partido-sonido") !== "0"; } catch (e) {}
$("#sonido").onchange = () => { try { localStorage.setItem("partido-sonido", $("#sonido").checked ? "1" : "0"); } catch (e) {} };
// el navegador solo deja sonar tras un clic (online el partido empieza sin clic)
document.addEventListener("pointerdown", () => Sonido.despertar());
$("#fuera-juego").onchange = () => { try { localStorage.setItem("partido-fuera-juego", $("#fuera-juego").checked ? "1" : "0"); } catch (e) {} };
// las de la pestana Pantalla (O-316): solo de este PC (no viajan online). "Campo en 3D"
// sustituye a "Pantalla de arriba en 3D": lo guardado como partido-vista-3d se ignora
const guardarOpcion = (id, k, si) => {
  const m = $(id);
  try { const v = localStorage.getItem(k); if (v !== null) { if (m.type === "checkbox") m.checked = v === "1"; else if ([...m.options].some(o => o.value === v)) m.value = v; } } catch (e) {}
  m.addEventListener("change", () => { try { localStorage.setItem(k, m.type === "checkbox" ? (m.checked ? "1" : "0") : m.value); } catch (e) {} if (si) si(m); });
};
guardarOpcion("#animaciones", "partido-animaciones");
// las animaciones de Galaxy (O-319): "completas" (por defecto) o "cortas". Online vale la
// del que invita: va en el mensaje `equipos`
function animacionesElegidas() { return REGLAS.modoAnim($("#animaciones").value) || "completas"; }
guardarOpcion("#opcion-3d", "partido-campo-3d");
guardarOpcion("#pantallas", "partido-pantallas", m => Consola.ponerModo(m.value));
guardarOpcion("#calidad", "partido-calidad", m => Consola.ponerCalidad(m.value));
guardarOpcion("#opcion-fps", "partido-fps", m => Consola.verFps(m.checked));
$("#focos-auto").onchange = () => { try { localStorage.setItem("partido-focos-auto", $("#focos-auto").checked ? "1" : "0"); } catch (e) {} };

async function equipoDatos(hueco) {
  if (!DATOS[hueco]) DATOS[hueco] = await pedir("/api/partido/equipo?hueco=" + hueco);
  return DATOS[hueco];
}

// las caras y el nivel del equipo, para la pantalla de arriba (O-316)
async function verOnce(hueco) {
  try { await equipoDatos(hueco); } catch (e) { $("#nota-elegir").textContent = e.message; }
  pintarArribaElegir();
}

// --- la pantalla de elegir como Galaxy (O-316; diseno 3) ------------------------------
// ABAJO, filas de casillas cian con flechas que leen y cambian los <select> y casillas
// de siempre (ocultos en partido.html): asi siguen igual localStorage, el online y las
// pruebas. ARRIBA, los dos equipos con sus caras y el resumen (Arriba.pintarElegir)
const FILAS = {
  partido: [
    { que: "Tu equipo", id: "equipo-a", rejilla: "Elige tu equipo" },
    { que: "Rival", id: "equipo-b", rejilla: "Elige el rival" },
    { que: "Duración", id: "duracion" },
    { que: "Si hay empate", id: "empate" },
    { que: "Focos automáticos", id: "focos-auto" },
    { que: "Fuera de juego", id: "fuera-juego" },
  ],
  pantalla: [
    { que: "Animaciones", id: "animaciones" },
    { que: "Campo en 3D", id: "opcion-3d" },
    { que: "Pantallas", id: "pantallas" },
    { que: "Calidad 3D", id: "calidad" },
    { que: "Sonido", id: "sonido" },
    { que: "Ver FPS", id: "opcion-fps" },
  ],
};
// un "change" de verdad: llamar a onchange no basta, #equipo-a tiene ademas el
// addEventListener del online (el equipo que se anuncia)
function cambiarOpcion(m, v) {
  if (m.type === "checkbox") m.checked = v; else m.value = v;
  m.dispatchEvent(new Event("change"));
}
function pintarFilas() {
  for (const [pest, filas] of Object.entries(FILAS)) {
    const caja = $("#filas-" + pest);
    caja.textContent = "";
    for (const f of filas) {
      const m = $("#" + f.id);
      const fila = el("div", { class: "gx-casilla gx-fila", title: m.title || null }, [el("span", { class: "que", text: f.que })]);
      if (m.type === "checkbox") {
        fila.appendChild(el("span", { class: "valor gx-sino" }, [
          el("button", { class: "gx-boton mini" + (m.checked ? "" : " no"), text: "Sí", onclick: () => cambiarOpcion(m, true) }),
          el("button", { class: "gx-boton mini" + (m.checked ? " no" : ""), text: "No", onclick: () => cambiarOpcion(m, false) })]));
      } else {
        const ops = [...m.options], k = m.selectedIndex;
        const paso = d => cambiarOpcion(m, ops[(k + d + ops.length) % ops.length].value);
        const nombre = el("span", { class: "nombre" + (f.rejilla ? " pulsable" : ""), text: ops[k] ? ops[k].text : "—", title: f.rejilla ? "Ver todos los equipos" : null });
        if (f.rejilla) nombre.onclick = () => abrirRejilla(f);
        fila.appendChild(el("span", { class: "valor" }, [
          el("button", { class: "gx-flecha", text: "‹", disabled: ops.length < 2, onclick: () => paso(-1) }), nombre,
          el("button", { class: "gx-flecha", text: "›", disabled: ops.length < 2, onclick: () => paso(1) })]));
      }
      caja.appendChild(fila);
    }
  }
  // sin F11 ni pantalla completa en la ventana de Pizarra (diseno 2.1): si las pantallas
  // salen pequenas, que la maximice
  $("#filas-pantalla").appendChild(el("div", { class: "gx-linea gx-maximiza-linea",
    text: "Maximiza la ventana (doble clic en su barra de arriba) y las pantallas se ven más grandes." }));
}
// al cambiar cualquier opcion (desde una fila o desde fuera), se repintan las dos pantallas
for (const lista of Object.values(FILAS)) for (const f of lista) $("#" + f.id).addEventListener("change", () => { pintarFilas(); pintarArribaElegir(); });

// lo que se ve abajo: las pestanas, la rejilla de equipos, online o la ayuda
let pestana = "partido", rejilla = null;
function verElegir(que) {
  const pest = que === "pestanas";
  $("#pestanas").hidden = !pest;
  $("#filas-partido").hidden = !pest || pestana !== "partido";
  $("#filas-pantalla").hidden = !pest || pestana !== "pantalla";
  $("#rejilla").hidden = que !== "rejilla";
  $("#online").hidden = que !== "online";
  $("#ayuda-elegir").hidden = que !== "ayuda";
  $("#barra-elegir").hidden = !pest;
  $("#barra-atras").hidden = pest;
  $("#pagina-antes").hidden = $("#pagina-despues").hidden = que !== "rejilla";
  // la franja de la nota, no en la pestana Pantalla (su linea de la ventana) ni en la ayuda
  $("#nota-elegir").hidden = (pest && pestana === "pantalla") || que === "ayuda";
  document.querySelectorAll(".gx-pestana").forEach(b => b.classList.toggle("activa", b.dataset.pestana === pestana));
  if (que === "rejilla") pintarRejilla();
  pintarArribaElegir();
}
document.querySelectorAll(".gx-pestana").forEach(b => { b.onclick = () => { pestana = b.dataset.pestana; verElegir("pestanas"); }; });
$("#elegir-atras").onclick = () => verElegir("pestanas");
$("#ver-ayuda").onclick = () => { $("#ayuda-elegir").scrollTop = 0; verElegir("ayuda"); };
// la rejilla de equipos: 2x4 casillas con paginas, como la lista de tecnicas (m05)
function abrirRejilla(f) { rejilla = { f, pagina: Math.floor(Math.max(0, $("#" + f.id).selectedIndex) / 8) }; verElegir("rejilla"); }
function pintarRejilla() {
  const m = $("#" + rejilla.f.id), ops = [...m.options], paginas = Math.max(1, Math.ceil(ops.length / 8));
  rejilla.pagina = Math.max(0, Math.min(paginas - 1, rejilla.pagina));
  $("#rejilla-titulo").textContent = rejilla.f.rejilla;
  $("#rejilla-pagina").textContent = paginas > 1 ? "página " + (rejilla.pagina + 1) + " de " + paginas : "";
  const caja = $("#rejilla-cajas");
  caja.textContent = "";
  for (let k = 0; k < 8; k++) {
    const o = ops[rejilla.pagina * 8 + k];
    if (!o) { caja.appendChild(el("div", { class: "gx-casilla vacia" })); continue; }
    const e = EQUIPOS.find(x => String(x.hueco) === o.value) || {};
    caja.appendChild(el("div", { class: "gx-casilla" + (o.value === m.value ? " elegida" : ""), title: o.text,
      onclick: () => { cambiarOpcion(m, o.value); verElegir("pestanas"); } }, [el("i", { text: GX.iniciales(o.text) }), el("span", { text: o.text }),
      e.cuantos ? el("small", {}, [el("em", { text: "JUG" }), document.createTextNode(String(e.cuantos))]) : null]));
  }
  $("#pagina-antes").disabled = rejilla.pagina <= 0;
  $("#pagina-despues").disabled = rejilla.pagina >= paginas - 1;
}
$("#pagina-antes").onclick = () => { if (rejilla) { rejilla.pagina--; pintarRejilla(); } };
$("#pagina-despues").onclick = () => { if (rejilla) { rejilla.pagina++; pintarRejilla(); } };

// ARRIBA mientras se elige: tu equipo y el rival con sus 11 caras, VS y el resumen.
// Sin bucle: se repinta al cambiar algo, al llegar una cara o las letras
function equipoElegido(sel) {
  const s = $(sel), o = s.selectedOptions[0];
  if (!o) return null;
  const js = DATOS[s.value] ? DATOS[s.value].jugadores.slice(0, 11) : [];
  return { nombre: o.text, caras: js.map(j => j.cara), nivel: js.length ? Math.round(js.reduce((n, j) => n + (+j.nivel || 99), 0) / js.length) : 0 };
}
// online: a la derecha el equipo del amigo cuando se sabe (al que invitas o el que te
// invita); si no, "?"
function equipoAmigo() {
  if (!RED) return null;
  const pend = RED.pendiente && RED.gente && RED.gente[RED.pendiente.slug], inv = Object.values(invitaciones)[0];
  const quien = pend || inv;
  return quien && quien.equipo ? { nombre: quien.equipo, caras: [], nota: "de " + quien.nombre } : null;
}
function pintarArribaElegir() {
  if (PARTIDO || !Consola.arriba || $("#pantalla-elegir").hidden) return;
  const dur = $("#duracion").selectedOptions[0], emp = $("#empate").selectedOptions[0];
  const resumen = [dur ? dur.text : "", "Empate: " + (emp ? emp.text.toLowerCase() : "nada"), $("#fuera-juego").checked ? "Fuera de juego" : "Sin fuera de juego"].join(" · ");
  Arriba.pintarElegir(Consola.arriba.ctx, { a: equipoElegido("#equipo-a"), b: $("#online").hidden ? equipoElegido("#equipo-b") : equipoAmigo(), resumen });
}
GX.alCargar(pintarArribaElegir);
Consola.alCambiar(pintarArribaElegir);

$("#jugar-maquina").onclick = async () => {
  $("#jugar-maquina").disabled = true;
  try {
    const a = await equipoDatos(+$("#equipo-a").value), b = await equipoDatos(+$("#equipo-b").value);
    empezar(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  } catch (e) { Abajo.aviso(e.message); }
  $("#jugar-maquina").disabled = false;
};

// --- el partido ------------------------------------------------------------------
function empezar(a, b, online) {
  $("#pantalla-elegir").hidden = true;
  // la tactil del partido (O-318): dentro de la pantalla de abajo, sin paneles al lado
  $("#pantalla-juego").hidden = false;
  Consola.medir();
  MODO = online ? online.modo : "maquina";
  YO = MODO === "invitado" ? 1 : 0;
  const semilla = online ? online.semilla : (Math.random() * 1e9) | 0;
  const minutos = (online && online.minutos) || duracionElegida();
  const fueraDeJuego = online && online.fueraDeJuego !== undefined ? online.fueraDeJuego : $("#fuera-juego").checked;
  // si hay empate: online, la del que invita (O-312)
  const empate = online ? online.empate || "nada" : empateElegido();
  // las animaciones (O-319): online, las del que invita (sin ellas, false: como antes)
  const animaciones = online ? REGLAS.modoAnim(online.animaciones) : animacionesElegidas();
  // esperas: [Jugar] antes de cada saque (O-308). vuelo: el tiro viaja y el muro, la
  // cadena y el portero eligen al llegarles, como en Galaxy (O-325). tiempoInvocar: el
  // aura para el juego y en la parada invocan los dos (O-327)
  PARTIDO = new Partido(a, b, { semilla, manual: MODO === "maquina" ? [!DEMO, false] : [true, true], minutos, fueraDeJuego, empate,
                                limiteDuelo: online ? REGLAS.DUELO_MAX : 0, esperas: true, animaciones, vuelo: true, tiempoInvocar: true });
  menuAbierto = false; menuDespliega = null; miSeguir = null; esperandoDesde = 0;
  // abajo se juega en el campo 3D (O-317); la vista se crea al final (prepararVista)
  if (MUNDO) { MUNDO.cerrar(); MUNDO = null; }
  PANTALLA = null;
  MAQUINA =MODO === "maquina" ? new Maquina(PARTIDO, 1 - YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
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
  // focos automaticos: una maquina elige por mi en los regates y entradas. Sin
  // hipertecnicas: la hiperbarra la gasta la persona (O-310)
  AYUDANTE = $("#focos-auto").checked && !DEMO ? new Maquina(PARTIDO, YO, { semilla: (Math.random() * 1e9) | 0, sinHiper: true }) : null;
  eventosVistos = 0;
  // la tactil empieza de cero; el nombre de la formacion de cada uno, para Equipo (p26)
  Abajo.reiniciar({ enPartido: true, formaciones: [a, b].map(e => (e.formacion && e.formacion.nombre) || "") });
  // el Director (O-319): lo que se ensena en cada pantalla desde tu lado; los sonidos de
  // cada resultado los manda el en su momento
  Director.reiniciar({ yo: YO }); Consola.reiniciarCuadros();
  Sonido.activo = $("#sonido").checked; Sonido._antes = null; Sonido.director = true; Sonido.despertar();
  raton();
  prepararVista(() => requestAnimationFrame(bucle));
}

// la vista de abajo (O-317; diseno 1.3 y 5.7): el campo 3D (Mundo3D) o, sin WebGL, con
// "Campo en 3D" quitado o con ?2d, la reserva 2D cercana en #campo. Los modulos se
// ejecutan despues de partido.js: si Mundo3D aun no ha llegado se espera, 5 s como mucho
function prepararVista(listo) {
  let hecho = false;
  const sigue = M => {
    if (hecho) return;
    hecho = true;
    if (M) {
      try {
        MUNDO = M.crear(Consola.gl, PARTIDO, YO, { calidad: Consola.nivel });
        MUNDO.ajustar(Consola.medidas);
        PANTALLA = MUNDO.abajo;
      } catch (e) { console.warn("Sin el campo 3D, el plano:", e); if (MUNDO) MUNDO.cerrar(); MUNDO = null; }
    }
    $("#abajo").classList.toggle("con-3d", !!MUNDO);
    $("#abajo").classList.add("con-campo");
    if (!MUNDO) {
      $("#campo").replaceWith(el("canvas", { id: "campo" }));
      PANTALLA = new Pantalla($("#campo"), PARTIDO, YO);
    }
    listo();
  };
  if (!$("#opcion-3d").checked || SIN_3D) return sigue(null);
  Consola.modulo("Mundo3D").then(sigue);
  setTimeout(() => sigue(null), 5000);
}
// abajo, cada cuadro (pasos 5 y 6 del bucle, diseno 1.8): el campo y lo de encima. En la
// repeticion del gol, las posiciones grabadas; la camara sigue al balon de la animacion
// (O-319)
function pintarAbajo() {
  const e = Director.estado, ab = e.abajo;
  if (MUNDO) MUNDO.posiciones = ab.posiciones;
  if (PANTALLA.camara) PANTALLA.camara.guia = ab.camara;
  PANTALLA.pintar(e);
  HudAbajo.pintar(Consola.abajo.ctx, PARTIDO, YO, PANTALLA, e);
  Rotulos.pintar(Consola.abajo.ctx, Consola.arriba.ctx, e, PANTALLA, PARTIDO, YO);
}
// arriba (paso 7): el mapa, la ficha grande o la pantalla verde (Arriba), o el duelo, la
// animacion y el gol (HudDuelo, O-319)
const ARRIBA_2D = new Set(["mapa", "ficha", "descanso", "final"]);
function pintarArriba() {
  const e = Director.estado;
  if (ARRIBA_2D.has(e.arriba.modo)) Arriba.pintar(Consola.arriba.ctx, PARTIDO, YO, e, { elegido: PANTALLA.elegido, red: marcador() });
  else HudDuelo.pintar(Consola.arriba.ctx, PARTIDO, YO, e.arriba);
}
// el campo sigue a la pantalla de abajo: la consola avisa al cambiar de tamano o de
// modo (O-305, O-316), y de calidad (el pixelRatio del 3D, diseno 7.4)
Consola.alCambiar(m => {
  if (!PANTALLA) return;
  if (MUNDO) MUNDO.ajustar(m || Consola.medidas); else PANTALLA.ajustar();
  pintarAbajo();
});
Consola.alCalidad(n => { if (MUNDO) MUNDO.calidad(n); });

let antes = null, sobra = 0;
function bucle(ahora) {
  if (!PARTIDO) return;
  // el siguiente cuadro se pide antes de nada: un error al pintar ya no para el
  // partido para siempre (asi se congelaba el invitado tras un corte) (O-305)
  requestAnimationFrame(bucle);
  if (!PANTALLA) return;          // la vista de abajo aun no esta (prepararVista)
  // lo que tarda el cuadro entero, para el contador de FPS (O-321)
  const t0 = performance.now();
  if (antes === null) antes = ahora;
  sobra += Math.min(0.25, (ahora - antes) / 1000);
  antes = ahora;
  let n = 0;
  if (MODO === "invitado") {
    PARTIDO.suavizar(sobra); sobra = 0;
  } else if (MODO === "anfitrion" && RED && (RED.dejado || Date.now() - (RED.vistoRival || 0) > 8000)) {
    sobra = 0;                                  // sin noticias del rival (o has dejado el partido): se espera
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
  // lo que no es pintar, antes del corte de FPS: repetir la eleccion y el Seguir del
  // invitado, el AYUDANTE, los avisos (diseno 1.8, paso 2b; O-318)
  vigilar();
  // lo que se ensena lo decide el Director cada cuadro (sigue la espera del motor, tambien
  // en el invitado) (O-319); lo que se pinta, con el limite de FPS de la consola (diseno
  // 1.8 y 7.4): abajo el campo, lo de encima y los rotulos; arriba el mapa o el duelo
  Director.tick(PARTIDO, ahora);
  const c = Consola.cuadro(ahora);
  if (!c.pinta) return;
  if (MUNDO) MUNDO.msRender = 0;
  pintarAbajo();
  pintarArriba();
  // la tactil (O-318; paso 8): solo se rehace si cambia lo que ensena
  Abajo.pintar(PARTIDO, YO, Director.estado);
  // el JS de este cuadro y el render del 3D, por separado (diseno 7.4; O-321)
  Consola.finCuadro(performance.now() - t0, MUNDO ? MUNDO.msRender : 0);
}

// el marcador y el reloj se pintan arriba (Arriba, O-316): aqui solo lo del online
// para la pestana del reloj ("esperando a X...", "X no responde", "X ha salido") (O-305, O-308)
function marcador() {
  if (MODO === "maquina" || !RED) return null;
  return { modo: MODO, rival: RED.rival ? RED.rival.nombre : null, fuera: !!RED.rivalFuera, dejado: !!RED.dejado,
           sinVer: Date.now() - (RED.vistoRival || 0), callado: sinNoticias() > 0 };
}

// --- el empate: prorroga y penaltis (O-312) ----------------------------------------
// el boton del descanso: antes de la 2.ª parte "Segunda parte", antes de la prorroga
// "Prórroga" y entre sus dos partes "Seguir"
function botonDescanso(p) { const s = p.mitad + 1; return s === 3 ? "Prórroga" : s === 4 ? "Seguir" : "Segunda parte"; }
// las zonas del penalti como se ven en TU pantalla: tu ataque va siempre hacia
// arriba y la pantalla pinta x * sentido, asi que con sentido -1 (la tanda: tras la
// 2.ª parte o la 4.ª) la izquierda de la pantalla es la derecha del campo. Vale para
// ir y volver (de la pantalla al campo y del campo a la pantalla)
function zonaCampo(z) { return PANTALLA && PANTALLA._sentido() === -1 ? 2 - z : z; }

// online: los s que lleva el rival sin dar senales, si pasan de RED_ABANDONO; si no, 0 (O-308)
function sinNoticias() {
  if (MODO === "maquina" || !RED || !RED.rival || RED.rivalFuera || !RED.vistoRival || PARTIDO.fase === "final") return 0;
  const s = (Date.now() - RED.vistoRival) / 1000;
  return s > RED_ABANDONO ? s : 0;
}
function nombreRival() { return MODO === "maquina" ? "la máquina" : RED && RED.rival ? RED.rival.nombre : "el rival"; }
// ya he pulsado Seguir/Jugar/Segunda parte en esta espera: el invitado lo sabe
// antes de que llegue la foto (O-308)
function yaListo(p) { return !!(p.listos && p.listos[YO]) || (!!miSeguir && miSeguir.n === p.nEspera); }

// lo que se dice arriba a la izquierda en cada espera (O-308)
function textoEspera(p) {
  if (p.fase === "pausa") {
    // los cambios, en Equipo: en la pausa la fila es [Registro] [Equipo] [Tactica] [Seguir] (O-318)
    return "Pausa de " + (p.pausa ? p.nombres[p.pausa.lado] : "") + ": dibuja rutas, marca el pase o el tiro y prepara cambios (Equipo) · Seguir cuando estés";
  }
  // antes de la prorroga y entre sus partes, con su boton (O-312)
  if (p.fase === "descanso") return (p.mitad === 2 ? "Fin del tiempo reglamentario, ¡prórroga!" : p.mitad === 3 ? "Descanso de la prórroga" : "Descanso")
    + ": los cambios, en el Menú · «" + botonDescanso(p) + "» cuando estés";
  const s = p.esperaSaque || {}, mio = s.lado === YO;
  const que = { centro: "Saque de centro", banda: "Saque de banda", corner: "Córner", puerta: "Saque de puerta", falta: "Tiro libre", penalti: "Penalti" }[s.tipo] || "Saque";
  // colocar a los tuyos arrastrandolos, salvo muy cerca del balon (O-313). Las flechas y
  // el saque, tras pulsar Jugar (antes se marcaba aqui el pase) (O-324)
  const como = s.tipo === "penalti" ? "arrástralos fuera del área" + (mio ? "; al pulsar Jugar se tira" : "")
    : s.tipo === "centro" ? (mio ? "arrástralos, en tu campo; luego sacas" : "arrástralos, en tu campo y fuera del círculo")
    : mio ? "arrástralos; luego, las carreras y sacas"
    // en el saque de puerta, los rivales fuera del area (O-315)
    : s.tipo === "puerta" ? "arrástralos, fuera de su área" : "arrástralos, no muy cerca del balón";
  return que + " para " + (p.nombres[s.lado] || "") + ". Coloca a tus jugadores y pulsa Jugar (" + como + ")";
}
// tras pulsar Jugar, hasta que se saca (Aaron, O-322 punto 2; O-324): nadie se mueve y
// solo se dibujan las flechas. Lo que se dice arriba
function textoSacar(p) {
  const s = p.porSacar, que = { centro: "Saque de centro", banda: "Saque de banda", corner: "Córner", puerta: "Saque de puerta", falta: "Tiro libre" }[s.tipo] || "Saque";
  if (s.lado !== YO) return que + " de " + (p.nombres[s.lado] || "") + ": dibuja las carreras de los tuyos. Nadie se mueve hasta que saque";
  return que + ": dibuja las carreras de los tuyos y saca: pulsa a un compañero o un sitio" + (s.tipo === "falta" ? " (o la portería)" : "") + ". Nadie se mueve hasta que saques";
}
// con el tiro en vuelo (Aaron, O-322 punto 3; O-325): lo que se puede hacer mientras va
function textoVuelo(p) {
  const T = p.tiro, j = p.jugadores[T.ultimo] || {};
  if (T.lado === YO) return "¡Tiro de " + j.nombre + "! Si llevas a un compañero con tiro de cadena a su camino (con una flecha), puede encadenarlo";
  return "¡Te chuta " + j.nombre + "! Lleva a tus defensas a su camino con flechas para bloquearlo; luego elige tu portero";
}

// la pausa de 3DS (O-294) con la barra espaciadora: pulsa el boton que toca en la tactil
// (el hexagono de la mano en juego; Seguir, Jugar o "Segunda parte" en las esperas,
// O-308), que lleva el id #boton-pausa (O-318)
document.addEventListener("keydown", ev => {
  if (ev.code !== "Space" || !PARTIDO || $("#pantalla-juego").hidden || /input|select|textarea/i.test(ev.target.tagName)) return;
  ev.preventDefault();
  // mantener el espacio no alterna pausa y seguir: cada repeticion de la tecla
  // gastaba una pausa (O-305)
  if (ev.repeat) return;
  const b = $("#boton-pausa");
  if (b) b.click();
});
// las flechas del teclado mueven la camara de abajo, x2 con Mayusculas (O-307 punto 1;
// O-317): con el partido en marcha y fuera de los cuadros de texto (el nombre del
// online). Sin preventDefault desplazarian la pagina. La camara las lee cada cuadro
const FLECHAS = { ArrowLeft: "izq", ArrowRight: "der", ArrowUp: "arriba", ArrowDown: "abajo" };
function teclaCamara(ev, si) {
  const k = FLECHAS[ev.key];
  if (!PANTALLA || !PARTIDO || $("#pantalla-juego").hidden || /input|select|textarea/i.test(ev.target.tagName)) return;
  const t = PANTALLA.camara.teclas;
  t.rapido = ev.shiftKey;
  if (!k) return;
  ev.preventDefault();
  t[k] = si;
}
document.addEventListener("keydown", ev => teclaCamara(ev, true));
document.addEventListener("keyup", ev => teclaCamara(ev, false));
// si la ventana pierde el foco con una flecha apretada, no se queda moviendose
window.addEventListener("blur", () => { if (PANTALLA) { const t = PANTALLA.camara.teclas; for (const k in t) t[k] = false; } });

// cada cuadro, antes del corte de FPS (diseno 1.8, paso 2b; O-318): lo que hacia pausa()
// y no es pintar. La tactil (Abajo.pintar) solo se rehace al cambiar su clave: si esto
// fuera alli, el invitado dejaria de repetir y se colgaria un duelo online
function vigilar() {
  const p = PARTIDO;
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
  // igual con el Seguir/Jugar del invitado: se repite cada 1,5 s mientras la foto
  // siga en esa espera sin el listo (con su numero, el anfitrion no lo cuenta en
  // otra) (O-308)
  const ms = miSeguir;
  if (MODO === "invitado" && ms && ms.n === p.nEspera && (p.parado() || p.fase === "descanso" || p.fase === "invocacion") && !(p.listos && p.listos[YO])
      && Date.now() - ms.t > 1500 && RED && !RED.rivalFuera) {
    ms.t = Date.now();
    RED.orden({ tipo: "seguir", lado: YO, espera: ms.n });
  }
  // online, desde cuando espero a que el rival pulse (para "Dejar el partido", O-308)
  // (y a que elija en el tiempo de invocacion, O-327)
  const espera = p.parado() || p.fase === "descanso" || p.fase === "invocacion";
  // (y a que saque, tras pulsar Jugar: nadie se mueve hasta entonces, O-324)
  const noSaca = p.fase === "juego" && !!p.porSacar && p.porSacar.lado !== YO;
  if ((espera && yaListo(p) && !(p.listos && p.listos[1 - YO])) || noSaca) { if (!esperandoDesde) esperandoDesde = Date.now(); }
  else esperandoDesde = 0;
  // lo que no se hace por algo tuyo ("demasiado lejos para chutar") y el cambio que
  // preparas se dicen en la franja oscura de abajo (b47; O-305, O-308)
  while (eventosVistos < p.eventos.length) {
    const e = p.eventos[eventosVistos++];
    if (!e || e.lado !== YO || DEMO) continue;
    if (e.clase === "aviso" || (e.privado && /^Cambio preparado/.test(e.texto))) Abajo.aviso(e.texto);
  }
  // y cuando a uno de los tuyos se le acaba el espiritu (b47)
  Abajo.vigilar(p, YO);
  // el rival se ha ido a mitad de partido (o lo has dejado tu): lo dice la tactil (O-305, O-308)
  if (MODO !== "maquina" && RED && RED.rivalFuera && p.fase !== "final") return;
  if (AYUDANTE && p.fase === "duelo" && p.duelo && p.duelo.tipo === "foco" && p.pendientes()[YO] && !duelosElegidos.has(p.duelo.id)) {
    duelosElegidos.add(p.duelo.id);
    AYUDANTE._elegir();
  }
  // (el duelo y su resultado arriba los ensena el Director con HudDuelo, O-319)
}

// lo que la tactil necesita saber de la pagina (Abajo.que, diseno 5.8; O-318)
function contexto() {
  const p = PARTIDO;
  return {
    demo: DEMO, modo: MODO, listo: !!p && (p.parado() || p.fase === "descanso" || p.fase === "invocacion") && yaListo(p),
    elegidos: duelosElegidos, ayudante: !!AYUDANTE, elegido: PANTALLA ? PANTALLA.elegido : null,
    espera: p && (p.parado() || p.fase === "descanso") ? textoEspera(p) : "", boton: p ? botonDescanso(p) : "",
    // tras pulsar Jugar, hasta que se saca (O-324)
    sacar: p && p.fase === "juego" && p.porSacar ? textoSacar(p) : "",
    // con el tiro en vuelo (O-325)
    vuelo: p && p.fase === "juego" && p.tiro ? textoVuelo(p) : "",
    libres: p ? suplentesLibres(p, YO) : [], rival: nombreRival(), red: estadoRed(),
  };
}
// online: el rival que se ha ido, que no responde o que no pulsa (O-305, O-308)
function estadoRed() {
  if (MODO === "maquina" || !RED) return {};
  const callado = sinNoticias();
  const noPulsa = !!(RED.rival && !RED.rivalFuera && esperandoDesde && Date.now() - esperandoDesde > RED_ABANDONO * 1000);
  return { fuera: !!RED.rivalFuera, dejado: !!RED.dejado, rival: RED.rival ? RED.rival.nombre : null, callado: callado > 0 ? Math.max(1, Math.floor(callado / 60)) : 0, noPulsa };
}
Abajo.contexto = contexto;
// las ordenes de la tactil: todas por PARTIDO.ordenar (online, el invitado las manda al
// anfitrion), con las defensas de siempre (O-305, O-308)
Abajo.acc = {
  ordenar: o => { if (PARTIDO) PARTIDO.ordenar(o); },
  elegir: e => elegido(e),
  pausa: () => { if (PARTIDO && PARTIDO.fase === "juego") PARTIDO.ordenar({ tipo: "pausa", lado: YO }); },
  // Seguir, Jugar o "Segunda parte": con el numero de esta espera, un clic que llega tarde
  // no cuenta en la siguiente y no se salta un saque (O-308)
  seguir: () => {
    const p = PARTIDO;
    // (tambien Seguir sin invocar en el tiempo de invocacion, O-327)
    if (!p || !(p.parado() || p.fase === "descanso" || p.fase === "invocacion") || yaListo(p)) return;
    miSeguir = { n: p.nEspera, t: Date.now() };
    p.ordenar({ tipo: "seguir", lado: YO, espera: p.nEspera });
  },
  // Invocar en el tiempo de invocacion ya es elegir (O-327): el invitado lo sabe antes de
  // que llegue la foto (y si la orden se pierde, su Seguir repetido sigue sin invocar)
  invocarEnParada: id => {
    const p = PARTIDO;
    if (!p || p.fase !== "invocacion" || yaListo(p)) return;
    if (MODO === "invitado") miSeguir = { n: p.nEspera, t: Date.now() };
    p.ordenar({ tipo: "invocar", jugador: id });
  },
  // online: dejar el partido si el rival no responde o no pulsa (O-308). Manda "adios",
  // como Inicio: al otro le sale que has salido
  dejar: () => { if (!RED) return; RED.salirSala(); RED.rivalFuera = true; RED.dejado = true; },
  otro: () => { if (RED) RED.salirSala(); location.href = "/partido"; },
  salir: () => { if (RED) RED.salirSala(); location.href = "/partido"; },
  apuntar: (x, y) => { if (PANTALLA) PANTALLA.apuntar(x, y); },
  zonaCampo: z => zonaCampo(z),
  elegirJugador: id => { if (PANTALLA) PANTALLA.elegido = id; },
  // tras el gol (b48; O-319): solo en este PC
  repetir: () => Director.repetir(),
  reanudar: () => Director.reanudar(),
};

// --- el raton: el lapiz de DS ----------------------------------------------------
function raton() {
  // el raton lo escucha la pantalla de abajo entera (O-317; diseno 2.2): el 3D va en el
  // WebGL de detras y la reserva 2D en #campo. Donde cae, de la Consola (se mide solo
  // al cambiar de tamano)
  const c = $("#abajo");
  const pos = ev => { const r = Consola.abajo.cliente || c.getBoundingClientRect(); return { px: ev.clientX - r.left, py: ev.clientY - r.top }; };
  let empezado = null;
  // tambien en la espera de un saque, como en la pausa (O-308)
  const sePuede = () => PARTIDO && (PARTIDO.fase === "juego" || PARTIDO.parado() || PARTIDO.fase === "duelo");
  // con el juego parado (pausa, espera del saque, duelo eligiendo, descanso, y tras pulsar
  // Jugar hasta que se saca, O-324), arrastrar en vacio mueve la camara, como el lapiz en
  // Galaxy (diseno 5.3); con el balon en juego no
  const parado = () => PARTIDO && (PARTIDO.parado() || PARTIDO.fase === "duelo" || PARTIDO.fase === "descanso" || !!PARTIDO.porSacar);
  c.onpointerdown = ev => {
    // un control de la tactil (botones, listas) no es un gesto del campo
    if (!PANTALLA || (ev.target.closest && ev.target.closest(".gx-control, .gx-elegir"))) return;
    // en el descanso solo se elige a uno de los tuyos, para cambiarlo; sin
    // ordenes, que pasarian a la segunda parte (O-305). En vacio, la camara
    if (PARTIDO && PARTIDO.fase === "descanso") {
      const q = pos(ev), j = PANTALLA.jugadorEn(q.px, q.py, YO);
      if (j) PANTALLA.elegido = j.id;
      PANTALLA.pulsar(PANTALLA.aCampo(q.px, q.py));
      if (!j) { c.setPointerCapture(ev.pointerId); empezado = { q, j: null, puntos: [], campo: PANTALLA.aCampo(q.px, q.py), ancla: PANTALLA.aCampo(q.px, q.py), t0: performance.now(), lejos: 0, px: 0, soloCamara: true }; }
      return;
    }
    if (!sePuede()) return;
    c.setPointerCapture(ev.pointerId);
    const q = pos(ev);
    // la onda cian donde pulsas, como la mirilla de IE3 (O-306)
    PANTALLA.pulsar(PANTALLA.aCampo(q.px, q.py));
    const j = PANTALLA.jugadorEn(q.px, q.py, YO);
    // en la espera de un saque, arrastrar a uno de los tuyos lo coloca (O-313), y nada
    // mas: las flechas, tras pulsar Jugar (O-324)
    const enEspera = PARTIDO.fase === "saque";
    empezado = { q, j, puntos: [], campo: PANTALLA.aCampo(q.px, q.py), t0: performance.now(), lejos: 0, px: 0, enEspera,
                 colocar: !!(j && enEspera && PARTIDO.colocable && PARTIDO.colocable(j)) };
    // el punto del campo que se agarra para mover la camara
    if (!j && parado()) empezado.ancla = empezado.campo;
    if (j) {
      PANTALLA.elegido = j.id; empezado.puntos.push({ x: j.x, y: j.y }); PANTALLA.trazo = empezado;
      // de donde se le ha cogido a sus pies: en el 3D se le coge por el cuerpo, que esta
      // encima de los pies; al colocarlo, sus pies van ahi y no bajo el raton (O-317)
      empezado.agarre = { x: j.x - empezado.campo.x, y: j.y - empezado.campo.y };
    }
  };
  c.onpointermove = ev => {
    if (!empezado) return;
    const q = pos(ev);
    // lo que se ha movido el raton en la pantalla (px CSS)
    empezado.px = Math.max(empezado.px, Math.hypot(q.px - empezado.q.px, q.py - empezado.q.py));
    // arrastrar en vacio con el juego parado: la camara, para que el punto agarrado siga
    // bajo el raton (O-317)
    if (empezado.ancla && empezado.px > 4 && parado()) {
      const cp = PANTALLA.aCampo(q.px, q.py), h = PANTALLA._sentido();
      PANTALLA.camara.mover((empezado.ancla.x - cp.x) * h, (empezado.ancla.y - cp.y) * h);
      empezado.camara = true;
      return;
    }
    const cp = PANTALLA.aCampo(q.px, q.py);
    // lo mas lejos que ha ido el raton, tambien si no empezo en un jugador (O-305)
    empezado.lejos = Math.max(empezado.lejos, Math.hypot(cp.x - empezado.campo.x, cp.y - empezado.campo.y));
    if (!empezado.j) return;
    // en la espera de un saque, arrastrar a uno de los tuyos lo coloca: no es una
    // ruta, se pone ahi (Aaron, O-307 punto 14); mientras, el jugador sale donde lo
    // soltarias (en rojo si ahi no puede) (O-313). Alli no se dibujan carreras (antes,
    // manteniendolo pulsado): se dibujan tras pulsar Jugar, cuando ya no se coloca
    // (Aaron, O-322 punto 2; O-324). Al que no se mueve (el que saca), nada
    if (empezado.modo === undefined && empezado.lejos > 1) empezado.modo = !empezado.enEspera ? "ruta" : empezado.colocar ? "colocar" : "nada";
    if (empezado.modo === "nada") { PANTALLA.trazo = null; return; }
    if (empezado.modo === "colocar") {
      const x = cp.x + empezado.agarre.x, y = cp.y + empezado.agarre.y, r = PARTIDO.puedeColocar(empezado.j, x, y);
      PANTALLA.trazo = null;
      PANTALLA.colocando = { id: empezado.j.id, x: r.si ? r.x : x, y: r.si ? r.y : y, vale: r.si, porque: r.porque };
      return;
    }
    const ult = empezado.puntos[empezado.puntos.length - 1];
    if (!ult || Math.hypot(cp.x - ult.x, cp.y - ult.y) > 1.5) empezado.puntos.push(cp);
  };
  c.onpointerup = ev => {
    if (!empezado) return;
    const e = empezado; empezado = null; PANTALLA.trazo = null; PANTALLA.colocando = null;
    // la camara arrastrada se queda donde la dejes (vuelve al seguir el juego)
    if (e.camara) { PANTALLA.camara.soltar(); return; }
    if (e.soloCamara || !sePuede()) return;
    const q = pos(ev), fin = PANTALLA.aCampo(q.px, q.py);
    // la X del tiro: cortando el rayo con la linea de gol de pie, no con el suelo de
    // detras de la red (diseno 5.4 CRITICA); fuera de la porteria, el suelo
    const xTiro = g => { const x = PANTALLA.aPorteria ? PANTALLA.aPorteria(q.px, q.py, g.y) : null; return x !== null ? x : fin.x; };
    const mov = Math.hypot(fin.x - e.campo.x, fin.y - e.campo.y);
    const d = PARTIDO.dueno();
    const tengo = d && d.lado === YO;
    // colocar (O-313): si ahi no puede, se dice ("Muy cerca del balón") y no se mueve.
    // Si se ha acabado la espera mientras lo arrastrabas (online, el rival ha
    // pulsado Jugar), no pasa nada. Volver casi al mismo sitio, tampoco
    if (e.j && e.modo === "colocar") {
      if (PARTIDO.fase !== "saque" || mov < 1) return;
      fin.x += e.agarre.x; fin.y += e.agarre.y;
      const r = PARTIDO.puedeColocar(e.j, fin.x, fin.y);
      if (!r.si) { if (r.porque) Abajo.aviso(r.porque); return; }
      PARTIDO.ordenar({ tipo: "colocar", lado: YO, jugador: e.j.id, x: r.x, y: r.y });
      return;
    }
    // en la espera de un saque solo se coloca y se elige (O-324): arrastrar al que no se
    // mueve dice por que; pulsar un sitio o la porteria con el balon, que se saca tras
    // pulsar Jugar (antes se marcaba el pase)
    if (e.enEspera) {
      if (e.j && e.modo === "nada") { const r = PARTIDO.puedeColocar(e.j, fin.x, fin.y); if (r.porque) Abajo.aviso(r.porque); }
      else if (!e.j && tengo && Math.max(mov, e.lejos) <= 2.5 && PARTIDO.esperaSaque && PARTIDO.esperaSaque.tipo !== "penalti")
        Abajo.aviso("Primero pulsa Jugar; luego sacas: pulsa a un compañero, un sitio o la portería");
      return;
    }
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
      if (Math.abs(fin.y - g.y) < 7 && Math.abs(fin.x) < 9) { PANTALLA.apuntar(xTiro(g), g.y); PARTIDO.ordenar({ tipo: "directo", de: PARTIDO.balon.pase.de }); return; }
    }
    if (tengo) {
      // pulsar a un companero: pasarle (en la pausa queda marcado). Se mira antes
      // que la porteria: si estaba delante de ella, chutaba el del balon (O-305)
      if (e.j && e.j.id !== d.id) { PARTIDO.ordenar({ tipo: "pase", de: d.id, a: e.j.id, alto }); return; }
      // en la pausa y en la espera de un saque (O-308) (y en un foco, O-306),
      // pulsar al que lleva el balon quita el pase o el tiro marcado (O-305)
      if (e.j && (PARTIDO.parado() || marca)) { PARTIDO.ordenar({ tipo: "pase", de: d.id, a: d.id }); return; }
      // pulsar la porteria rival: chutar. En la pausa (y en el saque) el tiro queda
      // marcado y sale al seguir; antes acababa en un pase a la linea de gol (O-305)
      const g = PARTIDO.porteriaRival(d);
      if (Math.abs(fin.y - g.y) < 7 && Math.abs(fin.x) < 9) { PANTALLA.apuntar(xTiro(g), g.y); PARTIDO.ordenar({ tipo: "tiro", de: d.id }); return; }
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

// --- el duelo: la eleccion de la persona (la manda la tactil, O-318) -------------------
let ultimaEleccion = null;     // online, la ultima eleccion del invitado (O-305)
function elegido(eleccion) {
  if (PARTIDO.duelo) duelosElegidos.add(PARTIDO.duelo.id);
  PARTIDO.elegir(YO, eleccion);
}

// los del banquillo que aun pueden entrar: ni usados ni en un cambio pendiente (O-308)
function suplentesLibres(p, lado) {
  const pend = p.cambiosPendientes[lado] || [];
  return (p.banquillos[lado] || []).map((d, k) => ({ d, k })).filter(o => !p.banquilloUsado[lado][o.k] && !pend.some(c => c.entra === o.k));
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

// online, en la tactil en lugar de las pestanas, con [Atras] (O-316)
$("#jugar-online").onclick = () => {
  verElegir($("#online").hidden ? "online" : "pestanas");
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
  catch (e) { Abajo.aviso(e.message); RED = null; return; }
  try { localStorage.setItem("draft-nombre", JSON.stringify(RED.yo)); } catch (e) {}
  RED.alEstado = e => {
    const b = $("#estado-red");
    b.classList.toggle("si", e === "conectado");
    b.textContent = e === "conectado" ? "conectado" : "conectando...";
  };
  RED.alGente = pintarGente;
  RED.alInvitacion = alInvitacion;
  RED.alRespuesta = m => {
    if (m.otraVersion) Abajo.aviso(m.nombre + " tiene otra versión del Partido: actualizad Pizarra los dos.");     // O-308
    else if (m.tipo === "rechaza") Abajo.aviso(m.nombre + " no puede jugar ahora.");
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
    caja.appendChild(el("span", { class: "nota izq", text: "Nadie más en Partido ahora mismo. Dile a tu amigo que abra Pizarra y entre en Partido > Online." }));
    pintarArribaElegir();
    return;
  }
  for (const [s, g] of otros) {
    const esperando = RED && RED.pendiente && RED.pendiente.slug === s;
    // con otra version del Partido no se puede jugar (O-308)
    const otra = otraVersion(g);
    caja.appendChild(el("div", { class: "persona" }, [
      el("b", { text: g.nombre }), el("small", { text: otra ? "otra versión del Partido" : (g.equipo ? g.equipo + " · " : "") + (g.estado || "") }),
      esperando
        ? el("button", { class: "btn-mini gris", text: "Cancelar", onclick: () => { RED.cancelar(); pintarGente(RED.gente); } })
        : el("button", { class: "btn-mini", text: "Invitar", disabled: otra || g.estado === "jugando" || !!RED.sala,
            title: otra ? "Tiene otra versión del Partido: actualizad Pizarra los dos" : "",
            onclick: () => { RED.invitar(s, g.nombre); Abajo.aviso("Invitación mandada a " + g.nombre + "."); pintarGente(RED.gente); } })]));
  }
  pintarArribaElegir();     // el equipo del amigo, arriba a la derecha (O-316)
}

const invitaciones = {};
function alInvitacion(m) {
  if (m.tipo === "cancela") delete invitaciones[m.sala];
  else if (m.tipo === "invita" && !RED.sala) invitaciones[m.sala] = m;
  const caja = $("#invitaciones");
  caja.textContent = "";
  for (const inv of Object.values(invitaciones)) {
    // de otra version del Partido: se dice y solo se puede decir que no (O-308)
    const otra = otraVersion(inv);
    caja.appendChild(el("div", { class: "invitacion" }, [
      el("b", { text: otra ? inv.nombre + " tiene otra versión del Partido: actualizad Pizarra los dos"
        : inv.nombre + " te reta" + (inv.equipo ? " con " + inv.equipo : "") }),
      otra ? null : el("button", { class: "btn-mini", text: "Aceptar", onclick: () => {
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
  pintarArribaElegir();     // el equipo del que te invita, arriba a la derecha (O-316)
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
    // la duracion va en minutos de reloj (15 o 30), la del que invita (O-308)
    // y lo del empate, tambien la del que invita (O-312)
    // y las animaciones, las del que invita (O-319)
    equiposOnline = { tipo: "equipos", a: mio, b: m.datos, semilla: (Math.random() * 1e9) | 0, minutos: duracionElegida(),
                      fueraDeJuego: $("#fuera-juego").checked, empate: empateElegido(), animaciones: animacionesElegidas() };
    RED._repite("equipos", () => RED.mandar(equiposOnline));
    empezar(JSON.parse(JSON.stringify(mio)), JSON.parse(JSON.stringify(m.datos)),
            { modo: "anfitrion", semilla: equiposOnline.semilla, minutos: equiposOnline.minutos, fueraDeJuego: equiposOnline.fueraDeJuego, empate: equiposOnline.empate,
              animaciones: equiposOnline.animaciones });
    return;
  }
  if (m.tipo === "equipos" && RED.rol === "invitado" && !PARTIDO) {
    RED.para("equipo");
    RED._repite("listo", () => RED.mandar({ tipo: "listo" }), 5);
    // las animaciones, leidas con cuidado: sin ellas (o raras), false (O-319)
    empezar(m.a, m.b, { modo: "invitado", semilla: m.semilla, minutos: m.minutos, fueraDeJuego: m.fueraDeJuego, empate: REGLAS.EMPATE.includes(m.empate) ? m.empate : "nada",
                        animaciones: ["completas", "cortas"].includes(m.animaciones) ? m.animaciones : false });
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
    // seguir lleva el numero de su espera; quitarCambio, el de un pendiente (O-308)
    if (o.tipo === "pausa" || o.tipo === "seguir" || o.tipo === "presionar" || o.tipo === "cambio" || o.tipo === "quitarCambio") { if (o.lado === 1) PARTIDO.ordenar(o); return; }
    if (o.tipo === "invocar") { const jj = PARTIDO.jugadores[o.jugador]; if (jj && jj.lado === 1) PARTIDO.ordenar(o); return; }
    // el aura del invitado: para el juego para invocar (O-327)
    if (o.tipo === "tiempoInvocar") { if (o.lado === 1) PARTIDO.ordenar(o); return; }
    // colocar en la espera de un saque, solo a los suyos (O-313): se ve en la foto
    if (o.tipo === "colocar") { const jj = PARTIDO.jugadores[o.jugador]; if (o.lado === 1 && jj && jj.lado === 1) PARTIDO.ordenar(o); return; }
    const j = PARTIDO.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (j && j.lado === 1) PARTIDO.ordenar(o);
    return;
  }
  if (m.tipo === "adios") {
    // llega por los tres servidores: se avisa una vez y queda marcado (O-305)
    if (RED.rivalFuera) return;
    RED.rivalFuera = true;
    Abajo.aviso(RED.rival ? RED.rival.nombre + " ha salido del partido." : "El rival ha salido.");
  }
}

cargarEquipos().then(() => { if (DEMO && EQUIPOS.length) $("#jugar-maquina").click(); });
