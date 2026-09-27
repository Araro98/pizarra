/* La conexion del modo draft (NOTAS O-247): un cliente MQTT 3.1.1 minimo por
   WebSocket, escrito aqui para no depender de nada de fuera. Habla con un
   servidor de mensajes publico y gratuito (sin cuenta): cada Pizarra se
   conecta, se apunta a unos "temas" y se pasan mensajes JSON al momento.

   Temas (todos bajo pizarra-draft/v1/):
     conectados/<usuario>   quien esta dentro (se borra solo al desconectarse)
     buzon/<usuario>        invitaciones y respuestas
     sala/<id>/estado       el estado del draft, lo publica el anfitrion
     sala/<id>/acciones     lo que elige el invitado
   Solo se usa QoS 0: si un mensaje se pierde, el anfitrion vuelve a mandar
   el estado cada pocos segundos y el invitado repite su accion hasta verla. */
const BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
  "wss://test.mosquitto.org:8081/",
];
const RAIZ_TEMAS = "pizarra-draft/v1/";

function slugUsuario(nombre) {
  return String(nombre || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}

class ConexionMQTT {
  constructor(url, clientId) {
    this.url = url; this.ws = null; this.buffer = new Uint8Array(0); this.idPaquete = 1;
    this.suscripciones = new Set(); this.alMensaje = null; this.alEstado = null;
    this.conectado = false; this.broker = url; this.ping = null; this.reintento = 0;
    this.will = null; this.clientId = clientId;
    this.parado = false;
  }
  // --- codificacion MQTT
  static cad(t) { const b = new TextEncoder().encode(t); return [b.length >> 8, b.length & 255, ...b]; }
  // el cuerpo puede venir en trozos (listas o Uint8Array): se juntan sin
  // "...", que con mensajes grandes revienta la pila del navegador
  static paquete(tipo, ...trozos) {
    let n = trozos.reduce((a, t) => a + t.length, 0);
    const lon = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; lon.push(b); } while (n);
    const total = 1 + lon.length + trozos.reduce((a, t) => a + t.length, 0);
    const out = new Uint8Array(total);
    out[0] = tipo; out.set(lon, 1);
    let p = 1 + lon.length;
    for (const t of trozos) { out.set(t, p); p += t.length; }
    return out;
  }
  enviar(bytes) { if (this.ws && this.ws.readyState === 1) this.ws.send(bytes); }
  // --- conexion, con los brokers en orden y reintentos
  conectar(will) {
    this.will = will || null; this.parado = false;
    this._abrir(0);
  }
  _abrir(i) {
    if (this.parado) return;
    const url = this.url;
    let ws;
    try { ws = new WebSocket(url, "mqtt"); } catch (e) { return this._reintentar(i); }
    ws.binaryType = "arraybuffer";
    this.ws = ws; this.buffer = new Uint8Array(0);
    const plazo = setTimeout(() => { if (!this.conectado) { try { ws.close(); } catch (e) {} } }, 12000);
    ws.onopen = () => {
      let flags = 0x02;            // sesion limpia
      const cuerpo = [...ConexionMQTT.cad("MQTT"), 4];
      const payload = [...ConexionMQTT.cad(this.clientId)];
      let will = [];
      if (this.will) {
        flags |= 0x04 | (this.will.retener ? 0x20 : 0);
        const m = new TextEncoder().encode(this.will.mensaje || "");
        will = [...ConexionMQTT.cad(this.will.tema), m.length >> 8, m.length & 255, ...m];
      }
      cuerpo.push(flags, 0, 30);   // keepalive 30 s
      this.enviar(ConexionMQTT.paquete(0x10, cuerpo, payload, will));
    };
    ws.onmessage = ev => this._recibir(new Uint8Array(ev.data), i, plazo);
    ws.onclose = () => {
      clearTimeout(plazo);
      const estaba = this.conectado;
      this.conectado = false; clearInterval(this.ping);
      if (this.alEstado) this.alEstado("desconectado");
      if (!this.parado) this._reintentar(i);
    };
    ws.onerror = () => {};
  }
  _reintentar(i) {
    this.reintento = Math.min(this.reintento + 1, 10);
    setTimeout(() => this._abrir(i), 1000 * this.reintento);
  }
  _recibir(datos, i, plazo) {
    const b = new Uint8Array(this.buffer.length + datos.length);
    b.set(this.buffer); b.set(datos, this.buffer.length); this.buffer = b;
    while (this.buffer.length >= 2) {
      let mult = 1, lon = 0, k = 1, byte;
      do {
        if (k >= this.buffer.length) return;      // falta la longitud entera
        byte = this.buffer[k++]; lon += (byte & 127) * mult; mult *= 128;
      } while (byte & 128);
      if (this.buffer.length < k + lon) return;   // falta el cuerpo
      const tipo = this.buffer[0], cuerpo = this.buffer.slice(k, k + lon);
      this.buffer = this.buffer.slice(k + lon);
      this._paquete(tipo, cuerpo, i, plazo);
    }
  }
  _paquete(tipo, cuerpo, i, plazo) {
    const t = tipo >> 4;
    if (t === 2) {                                  // CONNACK
      clearTimeout(plazo);
      if (cuerpo[1] !== 0) { try { this.ws.close(); } catch (e) {} return; }
      this.conectado = true; this.reintento = 0;
      this.ping = setInterval(() => this.enviar(new Uint8Array([0xC0, 0])), 20000);
      for (const tema of this.suscripciones) this._suscribir(tema);
      if (this.alEstado) this.alEstado("conectado");
    } else if (t === 3) {                           // PUBLISH
      const qos = (tipo >> 1) & 3, retenido = !!(tipo & 1);
      const ltema = (cuerpo[0] << 8) | cuerpo[1];
      const tema = new TextDecoder().decode(cuerpo.slice(2, 2 + ltema));
      let p = 2 + ltema;
      if (qos > 0) p += 2;
      const texto = new TextDecoder().decode(cuerpo.slice(p));
      let msg = null;
      if (texto) { try { msg = JSON.parse(texto); } catch (e) { msg = null; } }
      if (this.alMensaje) this.alMensaje(tema.slice(RAIZ_TEMAS.length), msg, retenido);
    }
  }
  _suscribir(tema) {
    const id = this.idPaquete++ & 0xFFFF || 1;
    this.enviar(ConexionMQTT.paquete(0x82, [id >> 8, id & 255], ConexionMQTT.cad(RAIZ_TEMAS + tema), [0]));
  }
  suscribir(tema) { this.suscripciones.add(tema); if (this.conectado) this._suscribir(tema); }
  desuscribir(tema) {
    this.suscripciones.delete(tema);
    const id = this.idPaquete++ & 0xFFFF || 1;
    if (this.conectado) this.enviar(ConexionMQTT.paquete(0xA2, [id >> 8, id & 255], ConexionMQTT.cad(RAIZ_TEMAS + tema)));
  }
  publicar(tema, msg, retener) {
    const datos = msg === null || msg === undefined ? new Uint8Array(0)
                : new TextEncoder().encode(JSON.stringify(msg));
    this.enviar(ConexionMQTT.paquete(0x30 | (retener ? 1 : 0), ConexionMQTT.cad(RAIZ_TEMAS + tema), datos));
  }
  cerrar() {
    this.parado = true; clearInterval(this.ping);
    if (this.ws && this.ws.readyState === 1) { this.enviar(new Uint8Array([0xE0, 0])); this.ws.close(); }
  }
}

/* La red del draft: se conecta a los tres servidores a la vez y lo manda todo
   por los tres. Asi dos amigos se encuentran aunque uno de los servidores les
   falle a alguno (si cada uno cayera en uno distinto no se verian). Los
   mensajes repetidos no hacen dano: el estado va numerado y el resto se
   repite igual. */
class RedDraft {
  constructor() {
    this.clientId = "pz" + Math.random().toString(36).slice(2, 12);
    this.conexiones = BROKERS.map((u, k) => new ConexionMQTT(u, this.clientId + "-" + k));
    this.alMensaje = null; this.alEstado = null;
    this.conexiones.forEach((c, k) => {
      // el cuarto dato dice por cual de los servidores llego
      c.alMensaje = (t, m, r) => { if (this.alMensaje) this.alMensaje(t, m, r, k); };
      c.alEstado = () => { if (this.alEstado) this.alEstado(this.conectado ? "conectado" : "desconectado"); };
    });
  }
  get conectado() { return this.conexiones.some(c => c.conectado); }
  get broker() { return this.conexiones.filter(c => c.conectado).map(c => c.url.split("/")[2]).join(", "); }
  conectar(will) { for (const c of this.conexiones) c.conectar(will); }
  suscribir(t) { for (const c of this.conexiones) c.suscribir(t); }
  desuscribir(t) { for (const c of this.conexiones) c.desuscribir(t); }
  publicar(t, m, r) { for (const c of this.conexiones) c.publicar(t, m, r); }
  cerrar() { for (const c of this.conexiones) c.cerrar(); }
}
