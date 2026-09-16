#!/usr/bin/env python3
"""Monta una pagina para ver todos los iconos sacados del juego.

    py herramientas\\galeria_iconos.py

Deja `datos/iconos/galeria.html`. Se abre con doble clic y funciona sin internet:
las imagenes son las que hay al lado, en las mismas carpetas que usa el juego.

Aaron pidio verlas todas, **tambien las que no cuadran con ningun personaje**. Asi
que aqui no se esconde nada: las caras salen con el nombre de quien son cuando se
sabe, y cuando no se sabe salen igual, marcadas como sin identificar.
"""
import collections
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

ICONOS = os.path.join(RAIZ, "datos", "iconos")
SALIDA = os.path.join(ICONOS, "galeria.html")

# Como se llama en cristiano cada carpeta del juego.
NOMBRES = {
    "10_icon_chr/face": "Caras de personaje",
    "10_icon_chr/uniform": "Equipaciones",
    "10_icon_chr/aura_armed": "Espiritus armados",
    "10_icon_chr/aura_soul": "Espiritus",
    "10_icon_chr/aura_fs": "Espiritus (fusion)",
    "10_icon_chr/aura_mixi": "Miximax",
    "10_icon_chr/spirit_type": "Tipos de espiritu",
    "10_icon_chr/coach": "Entrenadores",
    "01_icon_emblem": "Emblemas",
    "02_icon_item": "Objetos",
    "05_icon_rarity": "Rarezas",
    "06_icon_class": "Clases",
    "07_icon_rank": "Rangos",
    "21_icon_avatar": "Avatares",
    "22_icon_town": "Ciudad",
    "25_icon_nameplate": "Placas de nombre",
    "26_icon_nm_season": "Temporadas",
    "100_num": "Numeros",
}


def nombres_de_personaje():
    """{nombre del fichero de cara: nombre del personaje}."""
    try:
        from ievr import reglas
    except ImportError:
        return {}
    fuera = {}
    for f in reglas._tabla("jugadores.csv"):
        sid = (f.get("string_id") or "").strip()
        nombre = (f.get("nombre") or "").strip()
        if sid and nombre:
            fuera.setdefault(sid + "_l", (nombre, f.get("posicion") or "",
                                          f.get("elemento") or "",
                                          f.get("equipo") or ""))
    return fuera


def recoger():
    """{carpeta: [(ruta relativa, nombre del fichero)]}."""
    grupos = collections.defaultdict(list)
    for raiz, _, ficheros in os.walk(ICONOS):
        for f in sorted(ficheros):
            if not f.lower().endswith(".png"):
                continue
            rel = os.path.relpath(os.path.join(raiz, f), ICONOS).replace(os.sep, "/")
            clave = rel.split("200_icon/")[-1].rsplit("/", 1)[0] if "200_icon/" in rel else "otros"
            grupos[clave].append((rel, os.path.splitext(f)[0]))
    return grupos


def main():
    if not os.path.isdir(ICONOS):
        raise SystemExit("no encuentro %s. Saca antes los iconos con "
                         "herramientas/extraer_iconos.py" % ICONOS)
    quien = nombres_de_personaje()
    grupos = recoger()
    if not grupos:
        raise SystemExit("no hay ningun PNG en %s todavia" % ICONOS)

    datos = []
    for clave in sorted(grupos, key=lambda k: (-len(grupos[k]), k)):
        items = []
        for rel, base in grupos[clave]:
            info = quien.get(base)
            items.append({"r": rel, "n": base,
                          "q": info[0] if info else "",
                          "d": " · ".join(x for x in info[1:] if x) if info else ""})
        datos.append({"clave": clave, "titulo": NOMBRES.get(clave, clave),
                      "items": items})
    total = sum(len(g["items"]) for g in datos)
    con_nombre = sum(1 for g in datos for i in g["items"] if i["q"])

    with open(SALIDA, "w", encoding="utf-8") as fh:
        fh.write(PLANTILLA.replace("__DATOS__", json.dumps(datos, ensure_ascii=False))
                 .replace("__TOTAL__", str(total))
                 .replace("__CON__", str(con_nombre)))
    print("Escrita %s con %d iconos (%d identificados)." % (SALIDA, total, con_nombre))
    print("Abrela con doble clic.")
    return 0


PLANTILLA = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iconos de Victory Road</title>
<style>
  :root {
    --fondo: #f4f5f7; --papel: #ffffff; --tinta: #1b1d21; --suave: #6b7280;
    --linea: #dcdfe4; --acento: #1f6feb;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fondo: #14161a; --papel: #1c1f24; --tinta: #e8eaed; --suave: #9aa1ab;
      --linea: #2c3036; --acento: #58a6ff;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fondo); color: var(--tinta);
         font: 15px/1.5 system-ui, "Segoe UI", Roboto, sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: var(--papel);
           border-bottom: 1px solid var(--linea); padding: 14px 20px;
           display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  h1 { font-size: 17px; margin: 0; font-weight: 650; }
  .cuenta { color: var(--suave); font-size: 13px; }
  input[type=search] { flex: 1; min-width: 220px; padding: 8px 12px;
    border: 1px solid var(--linea); border-radius: 8px; background: var(--fondo);
    color: var(--tinta); font-size: 14px; }
  nav { padding: 10px 20px 0; display: flex; gap: 8px; flex-wrap: wrap; }
  nav button { border: 1px solid var(--linea); background: var(--papel);
    color: var(--tinta); border-radius: 999px; padding: 5px 12px; cursor: pointer;
    font-size: 13px; }
  nav button[aria-pressed=true] { background: var(--acento); color: #fff;
    border-color: var(--acento); }
  main { padding: 16px 20px 60px; }
  section { margin-bottom: 26px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em;
       color: var(--suave); margin: 0 0 10px; font-weight: 650; }
  .rejilla { display: grid; gap: 10px;
             grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
  figure { margin: 0; background: var(--papel); border: 1px solid var(--linea);
           border-radius: 10px; padding: 8px; text-align: center; }
  figure img { width: 100%; height: 78px; object-fit: contain;
               image-rendering: auto; display: block; }
  figcaption { margin-top: 6px; font-size: 11px; line-height: 1.35;
               word-break: break-word; }
  .quien { font-weight: 600; }
  .detalle, .fichero { color: var(--suave); font-size: 10px; }
  .anonimo .quien { color: var(--suave); font-style: italic; font-weight: 500; }
  .vacio { color: var(--suave); padding: 30px 0; }
</style>
</head>
<body>
<header>
  <h1>Iconos de Victory Road</h1>
  <span class="cuenta">__TOTAL__ imagenes · __CON__ con personaje identificado</span>
  <input type="search" id="buscar" placeholder="Buscar por nombre, equipo o fichero...">
</header>
<nav id="filtros"></nav>
<main id="salida"></main>
<script>
const DATOS = __DATOS__;
let grupoActivo = null, texto = "";

function pinta() {
  const salida = document.getElementById("salida");
  salida.textContent = "";
  let mostrados = 0;
  for (const g of DATOS) {
    if (grupoActivo && g.clave !== grupoActivo) continue;
    const items = g.items.filter(i => !texto ||
      (i.q + " " + i.d + " " + i.n).toLowerCase().includes(texto));
    if (!items.length) continue;
    mostrados += items.length;
    const sec = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = g.titulo + " (" + items.length + ")";
    sec.appendChild(h2);
    const rej = document.createElement("div");
    rej.className = "rejilla";
    for (const i of items.slice(0, 1200)) {
      const fig = document.createElement("figure");
      if (!i.q) fig.className = "anonimo";
      const img = document.createElement("img");
      img.loading = "lazy"; img.src = i.r; img.alt = i.q || i.n;
      const cap = document.createElement("figcaption");
      const q = document.createElement("div");
      q.className = "quien"; q.textContent = i.q || "sin identificar";
      cap.appendChild(q);
      if (i.d) { const d = document.createElement("div");
                 d.className = "detalle"; d.textContent = i.d; cap.appendChild(d); }
      const f = document.createElement("div");
      f.className = "fichero"; f.textContent = i.n; cap.appendChild(f);
      fig.appendChild(img); fig.appendChild(cap); rej.appendChild(fig);
    }
    if (items.length > 1200) {
      const aviso = document.createElement("div");
      aviso.className = "vacio";
      aviso.textContent = "Se ensenan las primeras 1200 de " + items.length +
                          ". Busca algo para acotar.";
      sec.appendChild(rej); sec.appendChild(aviso); salida.appendChild(sec); continue;
    }
    sec.appendChild(rej); salida.appendChild(sec);
  }
  if (!mostrados) {
    const v = document.createElement("p");
    v.className = "vacio"; v.textContent = "No hay ninguna que encaje.";
    salida.appendChild(v);
  }
}

const nav = document.getElementById("filtros");
function boton(texto, clave) {
  const b = document.createElement("button");
  b.textContent = texto;
  b.setAttribute("aria-pressed", String(grupoActivo === clave));
  b.onclick = () => { grupoActivo = clave; dibujaFiltros(); pinta(); };
  return b;
}
function dibujaFiltros() {
  nav.textContent = "";
  nav.appendChild(boton("Todo", null));
  for (const g of DATOS) nav.appendChild(boton(g.titulo, g.clave));
}
document.getElementById("buscar").addEventListener("input", e => {
  texto = e.target.value.trim().toLowerCase(); pinta();
});
dibujaFiltros(); pinta();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    raise SystemExit(main())
