/* El juego de partidos (NOTAS O-286): elegir equipos, el bucle, el raton
   como el lapiz de DS y la pausa de cada duelo con sus comandos. */
"use strict";

let YO = 0;                   // tu lado: 0, o 1 si eres el invitado de un partido online
let MODO = "maquina";         // "maquina" | "anfitrion" | "invitado"
let RED = null;               // la conexion online (partido-red.js)
const duelosElegidos = new Set();
let EQUIPOS = [], DATOS = {}, PARTIDO = null, PANTALLA = null, MAQUINA = null, MAQUINA_YO = null;
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
  for (const [sel, k] of [["#equipo-a", 0], ["#equipo-b", Math.min(1, EQUIPOS.length - 1)]]) {
    const s = $(sel);
    for (const e of EQUIPOS) s.appendChild(el("option", { value: e.hueco, text: e.nombre }));
    s.value = EQUIPOS[k].hueco;
    s.onchange = () => verOnce(sel === "#equipo-a" ? "#once-a" : "#once-b", +s.value);
  }
  verOnce("#once-a", +$("#equipo-a").value);
  verOnce("#once-b", +$("#equipo-b").value);
}

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
  PARTIDO = new Partido(a, b, { semilla, manual: MODO === "maquina" ? [!DEMO, false] : [true, true], mitad: online && online.mitad });
  PANTALLA = new Pantalla($("#campo"), PARTIDO, YO);
  MAQUINA = MODO === "maquina" ? new Maquina(PARTIDO, 1 - YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
  MAQUINA_YO = DEMO && MODO === "maquina" ? new Maquina(PARTIDO, YO, { semilla: (Math.random() * 1e9) | 0 }) : null;
  if (MODO === "invitado") {
    // el invitado no simula: sus gestos y elecciones van al anfitrion
    PARTIDO.ordenar = o => { RED.orden(o); return true; };
    PARTIDO.elegir = (lado, eleccion) => { RED.orden({ tipo: "elegir", lado, eleccion }); return true; };
  }
  duelosElegidos.clear();
  $("#nombre-a").textContent = a.nombre; $("#nombre-b").textContent = b.nombre;
  ultimoResultado = null; eventosVistos = 0; mostrando = null;
  $("#registro").textContent = "";
  window.onresize = () => PANTALLA.ajustar();
  raton();
  requestAnimationFrame(bucle);
}

let antes = null, sobra = 0;
function bucle(ahora) {
  if (!PARTIDO) return;
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
  PANTALLA.pintar();
  marcador();
  pausa();
  registro();
  fichaElegido();
  requestAnimationFrame(bucle);
}

function marcador() {
  const p = PARTIDO;
  $("#goles").textContent = p.goles[0] + " - " + p.goles[1];
  if (MODO !== "maquina" && RED && RED.rival && Date.now() - (RED.vistoRival || 0) > 8000) {
    $("#reloj").textContent = "esperando a " + RED.rival.nombre + "...";
    return;
  }
  $("#reloj").textContent = p.fase === "final" ? "Final" : p.fase === "descanso" ? "Descanso" : (p.mitad === 1 ? "1ª " : "2ª ") + p.minuto() + "'";
}

function registro() {
  const p = PARTIDO, caja = $("#registro");
  while (eventosVistos < p.eventos.length) {
    const e = p.eventos[eventosVistos++];
    const min = Math.floor(e.reloj / p.duracion * 45) + (e.mitad === 2 ? 45 : 0);
    caja.prepend(el("div", { text: min + "' " + e.texto, class: e.clase || "" }));
  }
}

function fichaElegido() {
  const p = PARTIDO, id = PANTALLA.elegido !== null ? PANTALLA.elegido : (p.dueno() && p.dueno().lado === YO ? p.dueno().id : null);
  const caja = $("#ficha-actual");
  if (id === null || id === undefined) { caja.textContent = "Pulsa o arrastra a uno de tus jugadores."; caja.dataset.id = ""; return; }
  const j = p.jugadores[id];
  const clave = id + ":" + Math.round(p.tension[YO]);
  if (caja.dataset.id === clave) return;
  caja.dataset.id = clave;
  caja.textContent = "";
  caja.appendChild(el("div", { class: "quien" }, [
    el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }),
    el("div", {}, [el("b", { text: j.nombre }), el("div", { text: j.posicion + " · " + (j.elemento || "") })])]));
  const barra = el("div", { class: "barra-pt", title: "Tension del equipo" }, [el("i")]);
  barra.firstChild.style.width = Math.round(p.tension[YO] / REGLAS.TENSION_MAX * 100) + "%";
  caja.appendChild(el("div", { text: "Tension del equipo " + Math.round(p.tension[YO]) + " / " + REGLAS.TENSION_MAX }));
  caja.appendChild(barra);
  for (const t of j.tecnicas) caja.appendChild(el("div", { text: "· " + t.nombre + " (" + t.tipo + ", " + t.poder + ", " + t.tp + " de tension)" }));
}

// --- el raton: el lapiz de DS ----------------------------------------------------
function raton() {
  const c = $("#campo");
  const pos = ev => { const r = c.getBoundingClientRect(); return { px: ev.clientX - r.left, py: ev.clientY - r.top }; };
  let empezado = null;
  c.onpointerdown = ev => {
    if (!PARTIDO || PARTIDO.fase !== "juego") return;
    c.setPointerCapture(ev.pointerId);
    const q = pos(ev);
    const j = PANTALLA.jugadorEn(q.px, q.py, YO);
    empezado = { q, j, puntos: [], campo: PANTALLA.aCampo(q.px, q.py) };
    if (j) { PANTALLA.elegido = j.id; empezado.puntos.push({ x: j.x, y: j.y }); PANTALLA.trazo = empezado; }
  };
  c.onpointermove = ev => {
    if (!empezado || !empezado.j) return;
    const q = pos(ev), cp = PANTALLA.aCampo(q.px, q.py);
    const ult = empezado.puntos[empezado.puntos.length - 1];
    if (!ult || Math.hypot(cp.x - ult.x, cp.y - ult.y) > 1.5) empezado.puntos.push(cp);
  };
  c.onpointerup = ev => {
    if (!empezado) return;
    const e = empezado; empezado = null; PANTALLA.trazo = null;
    if (!PARTIDO || PARTIDO.fase !== "juego") return;
    const q = pos(ev), fin = PANTALLA.aCampo(q.px, q.py);
    const mov = Math.hypot(fin.x - e.campo.x, fin.y - e.campo.y);
    const d = PARTIDO.dueno();
    const tengo = d && d.lado === YO;
    if (e.j && mov > 2.5 && e.puntos.length > 1) {
      // arrastrar desde un jugador: su ruta
      PARTIDO.ordenar({ tipo: "ruta", jugador: e.j.id, puntos: e.puntos.slice(1) });
      return;
    }
    if (tengo) {
      // pulsar la porteria rival: chutar
      const g = PARTIDO.porteriaRival(d);
      if (Math.abs(fin.y - g.y) < 7 && Math.abs(fin.x) < 9) { PARTIDO.ordenar({ tipo: "tiro", de: d.id }); return; }
      // pulsar a un companero: pasarle
      if (e.j && e.j.id !== d.id) { PARTIDO.ordenar({ tipo: "pase", de: d.id, a: e.j.id }); return; }
      if (e.j && e.j.id === d.id) return;
      // pulsar un punto: pase al hueco
      PARTIDO.ordenar({ tipo: "pasePunto", de: d.id, x: fin.x, y: fin.y });
      return;
    }
    // sin balon: el elegido (o el mas cerca) va a ese punto
    const quien = e.j || (PANTALLA.elegido !== null ? PARTIDO.jugadores[PANTALLA.elegido] : null);
    if (quien && quien.lado === YO) PARTIDO.ordenar({ tipo: "ruta", jugador: quien.id, puntos: [fin] });
  };
}

// --- la pausa de un duelo ---------------------------------------------------------
function cara(j) {
  return el("figure", {}, [el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || "") }), el("figcaption", { text: j.nombre })]);
}

function botonComando(o, j, alElegir) {
  const b = el("button", { class: "comando", disabled: !o.puede }, [
    o.tipo ? iconoTipo(o.tipo, 22) : null,
    o.elemento ? iconoElemento(o.elemento, 20) : null,
    el("span", {}, [el("span", { text: o.nombre }), o.nota ? el("div", { class: "coste", text: o.nota }) : null,
      o.tp ? el("div", { class: "coste", text: o.tp + " de tension (tienes " + Math.round(j.pt) + ")" }) : null]),
    o.poder ? el("span", { class: "poder", text: "+" + o.poder }) : null]);
  b.onclick = () => alElegir(o.clave);
  return b;
}

let mostrando = null;          // "duelo:<id>" o "resultado"
function pausa() {
  const p = PARTIDO, capa = $("#pausa");
  // el resultado de un duelo que acaba de pasar: se ensena un momento
  if (p.resultado && p.resultado !== ultimoResultado) {
    ultimoResultado = p.resultado;
    mostrarResultado(p.resultado);
    return;
  }
  if (mostrando === "resultado") return;
  if (p.fase === "final") { if (mostrando !== "final") mostrarFinal(); return; }
  const pend = p.fase === "duelo" && !DEMO && !duelosElegidos.has(p.duelo.id) ? p.pendientes()[YO] : null;
  if (!pend) { if (mostrando) { mostrando = null; capa.hidden = true; } return; }
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
  if (du.tipo === "foco") {
    const att = p.jugadores[du.atacante], def = p.jugadores[du.defensor];
    caja.appendChild(el("div", { class: "titulo-duelo", text: pend.rol === "ataque" ? "¡Te sale al paso!" : "¡A por el balon!" }));
    caja.appendChild(el("div", { class: "cara-a-cara" }, [cara(att), el("b", { text: "VS" }), cara(def)]));
    const j = p.jugadores[pend.jugador];
    for (const o of pend.opciones) lista.appendChild(botonComando(o, j, clave => elegido(clave)));
  } else {
    const tir = p.jugadores[du.tirador], por = p.jugadores[du.portero];
    caja.appendChild(el("div", { class: "titulo-duelo", text: pend.rol === "tiro" ? "¡Tiro a puerta!" : "¡Te chutan!" }));
    caja.appendChild(el("div", { class: "cara-a-cara" }, [cara(tir), el("b", { text: "VS" }), cara(por)]));
    if (pend.rol === "tiro") {
      for (const o of pend.opciones) lista.appendChild(botonComando(o, tir, clave => elegido({ tiro: clave })));
    } else {
      // defiendes: primero el muro (si hay alguien en la linea) y luego el portero
      const pideParada = (muro) => {
        lista.textContent = "";
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

function mostrarFinal() {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  mostrando = "final";
  caja.textContent = "";
  const gano = p.goles[YO] > p.goles[1 - YO], empate = p.goles[0] === p.goles[1];
  caja.appendChild(el("div", { class: "titulo-duelo", text: empate ? "¡Empate!" : gano ? "¡Has ganado!" : "Has perdido" }));
  caja.appendChild(el("div", { class: "resultado", text: p.nombres[0] + "  " + p.goles[0] + " - " + p.goles[1] + "  " + p.nombres[1] }));
  const goles = p.eventos.filter(e => e.clase === "gol").map(e => {
    const min = Math.floor(e.reloj / p.duracion * 45) + (e.mitad === 2 ? 45 : 0);
    return min + "' " + e.texto.replace(/ \(.*\)$/, "");
  });
  if (goles.length) caja.appendChild(el("div", { class: "registro", text: goles.join("\n"), style: "white-space:pre-line;max-height:160px" }));
  caja.appendChild(el("button", { class: "grande", onclick: () => { if (RED) RED.salirSala(); location.href = "/partido"; } }, [el("span", { text: "Otro partido" })]));
  capa.hidden = false;
}

function mostrarResultado(r) {
  const p = PARTIDO, caja = $("#pausa-caja"), capa = $("#pausa");
  caja.textContent = "";
  if (r.tipo === "tiro") {
    const tir = p.jugadores[r.tirador];
    caja.appendChild(el("div", { class: "titulo-duelo", text: r.final === "gol" ? "¡¡GOOOL!!" : r.final === "bloqueado" ? "¡Bloqueado!" : r.final === "despeje" ? "¡Despeje!" : "¡Parada!" }));
    for (const paso of r.pasos) {
      const j = p.jugadores[paso.quien];
      caja.appendChild(el("div", { class: "comando" }, [el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || ""), style: "width:34px;height:34px;border-radius:50%;background:#fff" }),
        el("span", { text: j.nombre + " · " + paso.que }), el("span", { class: "poder", text: String(paso.valorFinal || paso.valor) })]));
    }
    caja.appendChild(el("div", { class: "resultado", text: r.final === "gol" ? "Gol de " + tir.nombre : "" }));
  } else {
    const att = p.jugadores[r.atacante], def = p.jugadores[r.defensor], gan = p.jugadores[r.ganador];
    caja.appendChild(el("div", { class: "titulo-duelo", text: r.tipo === "disputa" ? "Disputa" : "Foco" }));
    for (const j of [att, def]) caja.appendChild(el("div", { class: "comando" }, [el("img", { alt: "", src: "/cara/" + encodeURIComponent(j.cara || ""), style: "width:34px;height:34px;border-radius:50%;background:#fff" }),
      el("span", { text: j.nombre + " · " + r.tecnicas[j.lado] }), el("span", { class: "poder", text: String(r.valores[j.lado]) })]));
    caja.appendChild(el("div", { class: "resultado", text: gan.lado === YO ? "¡Bien! Gana " + gan.nombre : "Gana " + gan.nombre }));
  }
  capa.hidden = false;
  mostrando = "resultado";
  setTimeout(() => { if (mostrando === "resultado") { mostrando = null; capa.hidden = true; } }, r.tipo === "tiro" ? 1900 : 1500);
}

/* --- online (O-287) ----------------------------------------------------------- */
let ultimaFoto = 0, fotoPasos = -1;
function mandarFoto() {
  const ahora = Date.now(), parado = PARTIDO.fase !== "juego";
  // 10 fotos por segundo jugando; parado en un duelo, una por segundo si nada cambia
  if (ahora - ultimaFoto < (parado && fotoPasos === PARTIDO.pasos ? 1000 : 100)) return;
  ultimaFoto = ahora; fotoPasos = PARTIDO.pasos;
  RED.mandar({ tipo: "foto", foto: PARTIDO.foto(1) });
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
    equiposOnline = { tipo: "equipos", a: mio, b: m.datos, semilla: (Math.random() * 1e9) | 0, mitad: REGLAS.MITAD };
    RED._repite("equipos", () => RED.mandar(equiposOnline));
    empezar(JSON.parse(JSON.stringify(mio)), JSON.parse(JSON.stringify(m.datos)),
            { modo: "anfitrion", semilla: equiposOnline.semilla, mitad: equiposOnline.mitad });
    return;
  }
  if (m.tipo === "equipos" && RED.rol === "invitado" && !PARTIDO) {
    RED.para("equipo");
    RED._repite("listo", () => RED.mandar({ tipo: "listo" }), 5);
    empezar(m.a, m.b, { modo: "invitado", semilla: m.semilla, mitad: m.mitad });
    return;
  }
  if (m.tipo === "listo" && RED.rol === "anfitrion") { RED.para("equipos"); return; }
  if (m.tipo === "foto" && MODO === "invitado" && PARTIDO) { PARTIDO.aplicarFoto(m.foto); return; }
  if (m.tipo === "orden" && MODO === "anfitrion" && PARTIDO) {
    const o = m.o || {};
    if (o.tipo === "elegir") { if (o.lado === 1) PARTIDO.elegir(1, o.eleccion); return; }
    const j = PARTIDO.jugadores[o.jugador !== undefined ? o.jugador : o.de];
    if (j && j.lado === 1) PARTIDO.ordenar(o);
    return;
  }
  if (m.tipo === "adios") avisa(RED.rival ? RED.rival.nombre + " ha salido del partido." : "El rival ha salido.", "mal");
}

cargarEquipos().then(() => { if (DEMO && EQUIPOS.length) $("#jugar-maquina").click(); });
