/* Piezas pequenas que comparten las pantallas nuevas (menu, base de datos,
   calculadora). El editor lleva las suyas dentro de editor.html. */
const $ = s => document.querySelector(s);

function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n[k] = v;
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) if (h) n.appendChild(h);
  return n;
}

async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  const d = await r.json().catch(() => ({error:"respuesta ilegible"}));
  if (!r.ok) throw new Error(d.error || ("error " + r.status));
  return d;
}

const COLOR_ELEM = {Fuego:"#e8503a", Viento:"#4fc3f7", Montana:"#e8a33d",
                    "Montaña":"#e8a33d", Bosque:"#5cc46a"};
const COLOR_POS = {POR:"#ffd34d", DF:"#7fb2ff", DEF:"#7fb2ff", MC:"#ffab45",
                   MED:"#ffab45", DC:"#ff7a7a", DEL:"#ff7a7a"};
const COLOR_RAREZA = ["#51d447", "#4b99f0", "#a64be7", "#f4e03b", "#dd7206",
                      "#9e0a02", "#8fabbe", "#ef4fe3", "#bdbfd4"];

const ICONO_TIPO = {
  Tiro:"icon_sp_area01", Regate:"icon_sp_area02",
  Defensa:"icon_sp_area03", Parada:"icon_sp_area04", Hipertecnica:"icon_sp_area05",
};
const BARRA_ELEM = {
  Fuego:["#8e2417", "#e8503a"], Bosque:["#1f6b2c", "#5cc46a"],
  Viento:["#15567e", "#4fc3f7"], Montana:["#8a5410", "#e8a33d"], "Montaña":["#8a5410", "#e8a33d"],
};
const BARRA_SIN = ["#3b5064", "#7f9bb2"];
const BARRA_ESPIRITU = ["#3b2a66", "#8b6fd6"];
const ICONO_STAT = {
  "Potencia":"01", "Control":"02", "Tecnica":"03", "Técnica":"03",
  "Inteligencia":"04", "Presion":"05", "Presión":"05", "Fisico":"06", "Físico":"06", "Agilidad":"07",
};
const ICONO_JUDIA = {
  "Potencia":"tr000001", "Control":"tr000002", "Tecnica":"tr000003", "Técnica":"tr000003",
  "Presion":"tr000004", "Presión":"tr000004", "Fisico":"tr000005", "Físico":"tr000005",
  "Agilidad":"tr000006", "Inteligencia":"tr000007",
};

function iconoElemento(nombre, tam) {
  const caja = el("span", {class:"elem", title:nombre});
  if (tam) { caja.style.width = tam + "px"; caja.style.height = tam + "px"; }
  caja.style.background = COLOR_ELEM[nombre] || "#9ab";
  const img = el("img", {alt:nombre, loading:"lazy",
    src:"/elemento/" + encodeURIComponent((nombre || "").replace("ñ", "n"))});
  img.onerror = () => img.remove();
  caja.appendChild(img);
  return caja;
}
function iconoTipo(tipo, tam) {
  const n = ICONO_TIPO[tipo];
  if (!n) return null;
  const img = el("img", {class:"ico-tipo", alt:tipo, title:tipo, loading:"lazy",
                         src:"/icono/icon_common/" + n + ".png"});
  if (tam) { img.style.width = tam + "px"; img.style.height = tam + "px"; }
  img.onerror = () => img.remove();
  return img;
}
function iconoStat(nombre, tam, tono) {
  const n = ICONO_STAT[nombre];
  if (!n) return null;
  const img = el("img", {class:"ico-stat", alt:nombre, title:nombre, loading:"lazy",
    src:"/icono/icon_common/icon_btl0" + (tono || 2) + "_parameter" + n + ".png"});
  if (tam) { img.style.width = tam + "px"; img.style.height = tam + "px"; }
  img.onerror = () => img.remove();
  return img;
}
function iconoJudia(nombre, tam) {
  const n = ICONO_JUDIA[nombre];
  if (!n) return null;
  const img = el("img", {class:"ico-judia", alt:nombre, title:"Judia de " + nombre,
    loading:"lazy", src:"/icono/icon_item10/" + n + ".png"});
  if (tam) { img.style.width = tam + "px"; img.style.height = tam + "px"; }
  img.onerror = () => img.remove();
  return img;
}
function fondoBarra(elemento, tipo) {
  const c = BARRA_ELEM[elemento] || (tipo === "Hipertecnica" ? BARRA_ESPIRITU : BARRA_SIN);
  return "linear-gradient(90deg," + c[0] + " 0%," + c[1] + " 62%," + c[1] + " 100%)";
}
/* Una tecnica con la pinta del juego: icono del tipo, barra del color de su
   afinidad, nombre, nivel, TP y AT/DF. */
function barraTecnica(t, extra) {
  const barra = el("div", {class:"tec-barra"});
  barra.style.background = fondoBarra(t.elemento, t.tipo);
  const ico = t.icono ? el("img", {class:"ico-tipo", loading:"lazy", alt:"",
                                    src:"/espiritu/" + t.icono}) : iconoTipo(t.tipo);
  if (ico) barra.appendChild(ico);
  barra.appendChild(el("span", {class:"nom", text:t.nombre}));
  if (extra) barra.appendChild(extra);
  if (t.nivel) barra.appendChild(el("span", {class:"niv", text:"Nv. " + t.nivel}));
  if (t.tp) barra.appendChild(el("span", {class:"tp", text:"TP " + t.tp}));
  if (t.poder) {
    barra.appendChild(el("span", {class:"clase",
      text:t.tipo === "Parada" || t.tipo === "Defensa" ? "DF" : "AT"}));
    barra.appendChild(el("span", {class:"pot", text:String(t.poder)}));
  }
  return barra;
}

/* Las capas de un retrato: la cara, el busto encima y la cara otra vez cortada
   a la altura de los hombros. Asi el pelo largo queda DETRAS de la camiseta y
   la cara y el cuello DELANTE, que es como lo pinta el juego (NOTAS O-149). */
const SILUETA = "/icono/icon_common/icon_body_type05.png";
function capasRetrato(j, perezoso) {
  const extra = perezoso ? {loading:"lazy"} : {};
  const capas = [];
  const conCuerpo = !!(j.cara && j.cuerpo);
  if (conCuerpo) {
    const pelo = el("img", Object.assign({class:"pelo", alt:"", src:"/cara/" + j.cara}, extra));
    const cuerpo = el("img", Object.assign({class:"cuerpo", alt:"", src:"/cuerpo/" + j.cuerpo}, extra));
    cuerpo.onerror = () => { cuerpo.remove(); pelo.remove(); cara.style.clipPath = ""; };
    capas.push(pelo, cuerpo);
  }
  const cara = el("img", Object.assign({alt:"", src:j.cara ? "/cara/" + j.cara : SILUETA}, extra));
  if (conCuerpo) cara.style.clipPath = "inset(0 0 " + (100 - (j.hombro || 75)) + "% 0)";
  capas.push(cara);
  return capas;
}

/* La tarjeta de un personaje, calcada de la del editor: fondo del color de la
   rareza, la cara encima, nivel arriba (si lo hay), afinidad y posicion abajo,
   poder abajo a la derecha. Si no hay cara, una silueta del juego y el nombre. */
function fichaMini(j, alPulsar) {
  const t = el("button", {class:"ficha-mini",
    title:j.nombre + " — " + (j.rareza_nombre || j.rareza || "") + (j.equipo ? " — " + j.equipo : ""),
    onclick:() => alPulsar && alPulsar(j)});
  t.style.background = COLOR_RAREZA[j.rareza_valor] || "#5d7590";
  // la cara, el busto y la cara cortada a los hombros (NOTAS O-148, O-149)
  const capas = capasRetrato(j, true);
  const img = capas[capas.length - 1];
  img.onerror = () => { img.src = SILUETA; img.style.clipPath = ""; img.onerror = null; t.classList.remove("con-cara"); };
  if (j.cara) t.classList.add("con-cara");
  for (const c of capas) t.appendChild(c);
  if (j.nivel) t.appendChild(el("div", {class:"nv", html:"<small>Nv.</small> " + j.nivel}));
  t.appendChild(el("div", {class:"nombre-mini", text:j.nombre}));
  const abajo = el("div", {class:"abajo"});
  if (j.elemento) abajo.appendChild(iconoElemento(j.elemento));
  if (j.posicion) {
    const pp = el("span", {class:"pos", text:j.posicion});
    pp.style.color = COLOR_POS[j.posicion] || "#fff";
    abajo.appendChild(pp);
  }
  if (j.poder) t.appendChild(el("div", {class:"poder", text:String(j.poder), title:"Suma de los siete stats base a nivel 99"}));
  t.appendChild(abajo);
  return t;
}
/* Filtros genericos: un desplegable por campo con los valores que hay. */
function montaFiltros(caja, datos, campos, estado, alCambiar) {
  caja.textContent = "";
  for (const c of campos) {
    const cuenta = new Map();
    for (const d of datos) {
      const v = String(c.valor ? c.valor(d) : (d[c.campo] ?? ""));
      if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    }
    if (cuenta.size < 2) continue;
    const orden = [...cuenta.keys()].sort(c.numerico
      ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b));
    const sel = el("select");
    sel.appendChild(el("option", {value:"", text:c.etiqueta + ": todos"}));
    for (const v of orden)
      sel.appendChild(el("option", {value:v, text:(c.nombre ? c.nombre(v) : v) + "  (" + cuenta.get(v) + ")"}));
    sel.value = estado[c.campo] || "";
    sel.onchange = () => { estado[c.campo] = sel.value; alCambiar(); };
    caja.appendChild(el("label", {class:"filtro"}, [el("span", {text:c.etiqueta}), sel]));
  }
  if (caja.children.length)
    caja.appendChild(el("button", {class:"btn chico", text:"Limpiar filtros",
      onclick:() => { for (const k in estado) delete estado[k]; alCambiar(); }}));
}
function pasaFiltros(d, campos, estado) {
  for (const c of campos) {
    const q = estado[c.campo];
    if (!q) continue;
    const v = String(c.valor ? c.valor(d) : (d[c.campo] ?? ""));
    if (v !== q) return false;
  }
  return true;
}

/* Un aviso arriba, en vez del alert() del navegador. */
function avisa(texto, clase) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = el("div", {class:"toast " + (clase || "bien"), text:texto, onclick:() => t.remove()});
  document.body.appendChild(t);
  setTimeout(() => t.remove(), clase === "mal" ? 9000 : 4000);
}
/* Ventanas propias en vez de prompt()/confirm(): devuelven una promesa. */
function ventanaPregunta(titulo, texto, cuerpo, botones) {
  return new Promise(resolve => {
    const pie = el("div", {class:"pie"});
    const caja = el("div", {class:"modal pregunta"}, [
      el("div", {class:"cab"}, [el("h3", {text:titulo}), texto ? el("p", {text:texto}) : null]),
      cuerpo ? el("div", {class:"busca"}, [cuerpo]) : null, pie]);
    const fondo = el("div", {class:"fondo-modal",
      onclick:e => { if (e.target === fondo) cerrar(null); }}, [caja]);
    const antes = document.onkeydown;
    function cerrar(v) { fondo.remove(); document.onkeydown = antes; resolve(v); }
    document.onkeydown = e => {
      if (e.key === "Escape") cerrar(null);
      if (e.key === "Enter") botones[botones.length - 1].accion(cerrar);
    };
    for (const b of botones)
      pie.appendChild(el("button", {class:"btn " + (b.clase || ""), text:b.texto,
                                    onclick:() => b.accion(cerrar)}));
    document.body.appendChild(fondo);
    const inp = caja.querySelector("input");
    if (inp) { inp.focus(); inp.select(); }
  });
}
function confirma(titulo, texto) {
  return ventanaPregunta(titulo, texto, null, [
    {texto:"No, dejalo", accion:c => c(false)},
    {texto:"Si, sigue", clase:"verde", accion:c => c(true)}]);
}
function pideNumero(titulo, texto, valor, min, max) {
  const inp = el("input", {type:"number", min:String(min), max:String(max), value:String(valor),
                           class:"numero-grande"});
  const leer = () => Math.max(min, Math.min(max, Number(inp.value) || min));
  return ventanaPregunta(titulo, texto, inp, [
    {texto:"Cancelar", accion:c => c(null)},
    {texto:"Vale", clase:"verde", accion:c => c(leer())}]);
}
/* Elegir una carpeta del disco (la misma ventana que usa el editor): se navega,
   se ve que carpetas tienen partida dentro y hay atajos a los sitios de siempre. */
async function elegirCarpeta(titulo, aceptar, textoBoton, soloConPartida) {
  let ruta = "";
  const lista = el("ul");
  const camino = el("div", {class:"ruta-actual"});
  const atajos = el("div", {class:"atajos"});
  const pie = el("div", {class:"pie"});
  const caja = el("div", {class:"modal"}, [
    el("div", {class:"cab"}, [el("h3", {text:titulo}),
      el("p", {text:soloConPartida ? "Entra en la carpeta que tenga la partida"
                                   : "Entra donde quieras guardarla"})]),
    el("div", {class:"busca"}, [atajos, camino]), lista, pie]);
  const fondo = el("div", {class:"fondo-modal",
    onclick:e => { if (e.target === fondo) cerrar(); }}, [caja]);
  document.body.appendChild(fondo);
  const antes = document.onkeydown;
  function cerrar() { fondo.remove(); document.onkeydown = antes; }
  document.onkeydown = e => { if (e.key === "Escape") cerrar(); };

  async function ir(destino) {
    let d;
    try { d = await pedir("/api/carpetas?ruta=" + encodeURIComponent(destino || "")); }
    catch (e) { avisa(e.message, "mal"); return; }
    ruta = d.ruta;
    camino.textContent = d.ruta;
    atajos.textContent = "";
    for (const a of d.atajos)
      atajos.appendChild(el("button", {class:"btn", text:a.nombre, onclick:() => ir(a.ruta)}));
    lista.textContent = "";
    if (d.padre)
      lista.appendChild(el("li", {}, [el("button", {text:"\u2b06  Subir", onclick:() => ir(d.padre)})]));
    for (const c of d.carpetas)
      lista.appendChild(el("li", {}, [el("button", {onclick:() => ir(c.ruta)}, [
        el("span", {class:"carpeta"}, [
          el("span", {text:"\ud83d\udcc1  " + c.nombre}),
          c.partida ? el("span", {class:"marca-si", text:"tiene partida"}) : null])])]));
    if (!d.carpetas.length && !d.padre)
      lista.appendChild(el("li", {}, [el("div", {class:"vacio", text:"Vacia."})]));
    pie.textContent = "";
    const vale = soloConPartida ? d.partida_aqui : true;
    pie.appendChild(el("span", {text: soloConPartida
      ? (d.partida_aqui ? "Aqui hay una partida" : "Aqui no hay ninguna partida")
      : "Se guardara en esta carpeta"}));
    pie.appendChild(el("button", {class:"btn verde", text:textoBoton, disabled:!vale,
      onclick:() => { cerrar(); aceptar(ruta); }}));
  }
  ir("");
}

/* El texto de una pasiva con el numero de la rareza que se este mirando. */
function textoPasiva(x, rareza) {
  if (x.por_rareza && rareza !== null && rareza !== undefined && x.por_rareza[rareza] && x.plantilla)
    return x.plantilla.replace("<VALUE>", String(Number(x.por_rareza[rareza].valor))).replace(/\s+/g, " ");
  return x.texto;
}
