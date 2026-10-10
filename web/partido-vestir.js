/* La equipacion del equipo en los modelos del partido (NOTAS O-334). Aaron: "los modelos se ven
   sin brazos o raros muchas veces y no llevan el uniforme del equipo en el que estan, sino el
   suyo de su equipo en la historia".
   - Como en VR, cada uno lleva la equipacion del equipo con el que juega: el servidor convierte
     una "ropa" por diseno, papel (campo o portero) y cuerpo (ievr/g4.py convertir_ropa:
     camiseta y pantalon, la PIEL del cuello, los brazos y las manos que faltaban desde O-293,
     el dorsal, el brazalete de capitan, las botas y los guantes del portero), compartida por
     todos los que la llevan, y el personaje sin su ropa (`<codigo>_cuerpo`).
   - Aqui se viste: las mallas de la ropa se atan a los huesos del jugador por su nombre (los
     de VR se llaman igual en todos los esqueletos) con las matrices de enlace de la ropa; la
     piel se tinta con la del jugador (la mascara de piel va aparte en el .glb, extras
     mascaraPiel); el dorsal mueve la UV a su numero en la hoja de 10x10, y el brazalete solo
     lo lleva el capitan. La placa del nombre (encima del dorsal en 10 equipaciones, como la
     sencilla) aun no se pinta: fuera (O-334, vuelta 2).
   - El modelo vestido se pide con un codigo compuesto "<cuerpo>+<ropa>+<dorsal>[c]" (c: el
     capitan): lo arma partido-3d.js (pedirModelo) y vale igual abajo, en el Estudio de arriba
     y en las animaciones de VR (los actores son clones de lo que da m.modelo).
   Este modulo no toca window ni document al cargarse. */
import * as THREE from "./partido-three.module.js";
import { clone as clonarModelo } from "./partido-SkeletonUtils.js";

// el tinte de la piel: VR la multiplica en su color (sRGB); el sombreador de three trabaja en
// lineal, asi que el factor va elevado a 2,2 (lo mismo que hornea ievr/g4.py componer_color)
export const VESTIR = { gamma: 2.2, pielPorDefecto: "FED6BA", hoja: 10 };
// las piezas de la ropa (nombres de los nodos que pone ievr/g4.py convertir_ropa)
const PIEZAS = new Set(["ropa", "piel", "dorsal", "capitan", "botas", "guantes"]);

// el codigo compuesto (lo arma REGLAS.vestido): {cuerpo, ropa, dorsal, capitan} o null si no
// es de un vestido
export function partesVestido(cod) {
  const p = String(cod || "").split("+");
  if (p.length < 2 || !p[0] || !p[1]) return null;
  const m = /^(\d*)(c?)$/.exec(p[2] || "");
  return { cuerpo: p[0], ropa: p[1], dorsal: m && m[1] !== "" ? +m[1] : null, capitan: !!(m && m[2]) };
}

// las mascaras de piel de una ropa (texturas que no van en ninguna ranura de material): se
// leen una vez, al llegar el .glb
export async function prepararRopa(g) {
  if (!g || g._ropa) return g;
  const pend = [];
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      const i = m && m.userData ? m.userData.mascaraPiel : undefined;
      if (i === undefined || m.userData.mascaraTex) continue;
      pend.push(g.parser.getDependency("texture", i).then(t => { m.userData.mascaraTex = t; }, () => {}));
    }
  });
  await Promise.all(pend);
  g._ropa = true;
  return g;
}

// el color de piel de un jugador (el que uso el conversor para su cara)
function pielDe(cuerpo) {
  let h = "";
  try { const x = cuerpo.parser.json.asset.extras || {}; h = x.piel || (x.piezas || {}).piel || ""; } catch (e) { h = ""; }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = VESTIR.pielPorDefecto;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

// un material de la ropa con la piel de ese color (uno por material y color: los de la misma
// piel lo comparten) o con su dorsal
const CACHE_MAT = new WeakMap();
function materialCon(m, clave, hacer) {
  let porClave = CACHE_MAT.get(m);
  if (!porClave) CACHE_MAT.set(m, porClave = new Map());
  if (!porClave.has(clave)) porClave.set(clave, hacer());
  return porClave.get(clave);
}
function conPiel(m, piel) {
  const tex = m.userData && m.userData.mascaraTex;
  if (!tex) return m;
  return materialCon(m, "piel:" + piel.join(","), () => {
    const c = m.clone();
    const color = new THREE.Vector3(...piel);
    c.onBeforeCompile = sh => {
      sh.uniforms.mascaraPiel = { value: tex };
      sh.uniforms.colorPiel = { value: color };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D mascaraPiel;\nuniform vec3 colorPiel;")
        .replace("#include <map_fragment>", "#include <map_fragment>\n#ifdef USE_MAP\n\tdiffuseColor.rgb *= pow( mix( vec3( 1.0 ), colorPiel, texture2D( mascaraPiel, vMapUv ).r ), vec3( " + VESTIR.gamma.toFixed(1) + " ) );\n#endif");
    };
    c.customProgramCacheKey = () => "ropa-piel";
    return c;
  });
}
function conDorsal(m, n) {
  if (!m.map) return m;
  return materialCon(m, "dorsal:" + n, () => {
    const c = m.clone(), t = m.map.clone();
    t.offset.set((n % VESTIR.hoja) / VESTIR.hoja, (Math.floor(n / VESTIR.hoja) % VESTIR.hoja) / VESTIR.hoja);
    t.needsUpdate = false;
    c.map = t;
    return c;
  });
}

// la placa del nombre (material name_10M del dorsal n000201): VR pone ahi el nombre del
// jugador con una hoja de letras. Hasta pintarlo, no sale: antes se tomaba por el dorsal y salia
// un trozo del abecedario movido segun el numero. Las ropas convertidas antes la traen marcada
// como dorsal: se conoce por el nombre del material (O-334, vuelta 2)
export function esPlacaNombre(m) {
  return !!m && (!!(m.userData && m.userData.nombre) || /^name_/.test(m.name || ""));
}

// la pieza de la ropa de una malla (su nodo o el de encima)
function piezaDe(o) {
  for (let x = o; x; x = x.parent) if (PIEZAS.has(x.name)) return x.name;
  return "";
}

// el jugador `cuerpo` (gltf de <codigo>_cuerpo) con la ropa `ropa` (gltf de ropa_..., ya con
// prepararRopa) puesta: {scene, animations, parser, asset} como un gltf (lo clonan los demas)
export function vestir(cuerpo, ropa, op = {}) {
  const escena = clonarModelo(cuerpo.scene);
  const huesos = new Map();
  let raiz = null;
  escena.traverse(o => { if (o.isBone && !huesos.has(o.name)) { huesos.set(o.name, o); if (!raiz) raiz = o; } });
  const recambio = huesos.get("c_c_1_1") || huesos.get("c_head_1_0") || raiz;
  const piel = pielDe(cuerpo);
  ropa.scene.updateMatrixWorld(true);
  const mallas = [];
  ropa.scene.traverse(o => { if (o.isSkinnedMesh) mallas.push(o); });
  for (const o of mallas) {
    const pieza = piezaDe(o);
    if (pieza === "capitan" && !op.capitan) continue;
    if (pieza === "dorsal" && (op.dorsal === null || op.dorsal === undefined)) continue;
    if ([].concat(o.material).some(esPlacaNombre)) continue;
    const mats = [].concat(o.material).map(m => (pieza === "dorsal" && m.userData && m.userData.dorsal) ? conDorsal(m, op.dorsal) : conPiel(m, piel));
    const malla = new THREE.SkinnedMesh(o.geometry, Array.isArray(o.material) ? mats : mats[0]);
    malla.name = "ropa:" + (pieza || o.name);
    // los huesos del jugador por nombre; las matrices de enlace, las de la ropa (cada talla
    // esta hecha para su esqueleto comun: en uno propio sigue a sus huesos)
    const bs = o.skeleton.bones.map(b => huesos.get(b.name) || recambio);
    malla.bind(new THREE.Skeleton(bs, o.skeleton.boneInverses), o.bindMatrix);
    malla.frustumCulled = o.frustumCulled;
    malla.renderOrder = o.renderOrder;
    escena.add(malla);
  }
  return { scene: escena, scenes: [escena], animations: cuerpo.animations, parser: cuerpo.parser, asset: cuerpo.asset,
           userData: { vestido: true }, _vestido: true };
}
