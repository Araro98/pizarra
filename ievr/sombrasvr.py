"""Los sombreadores de los efectos de VR, tal cual, en la pagina (O-331).

Los efectos de las animaciones de VR (O-323: fuego, remolinos, manos gigantes, auras...) se
pintan en el juego con sus sombreadores (Effect_T1, Effect_ThresholdGrd, Effect_T3Threshold,
Effect_FakeParticle, Effect_DistortionBlur...: unas 40 familias). Estan compilados en el juego
(DXBC de Direct3D 11, dx11/shader/<version>/*.vfxo, *.pfxo y *.gfxo; shader_list.cfg.bin dice
que .fxbin lleva cada uno y el .fxbin que sombreador de vertices, de pixeles y de geometria usa
su tecnica "main"). Aqui se desensamblan con el D3DCompiler_47 de Windows (D3DDisassemble) y el
ensamblador se traduce, instruccion a instruccion, a GLSL ES 3.0 para three.js: asi la pagina
hace exactamente las mismas cuentas que VR (en vez de las aproximaciones de antes, en las que
casi todo sumaba luz). Como lo demas de los eventos, se hace en el PC de cada uno desde SU juego
(eventos/<ev>/sombreadores.json) y nada de esto va al repo.

Lo que no es del material lo pone el motor del juego en sus cbuffers: las matrices
(CBUSE_UB_MATRIX_IDX), la camara, las luces... Aqui se rellenan con las de three, con la
proyeccion pasada al convenio de Direct3D (z de 0 a 1) para que las cuentas de profundidad den
lo mismo; al final se devuelve a la de OpenGL. Lo que en la pagina no hay:
- la profundidad de la escena (in_rtTexDepth, para que los efectos se fundan con el suelo): lee
  "lejos" (1), y asi el efecto sale entero;
- las sombras (in_texShadow): "con luz" (0: en VR el 1 es en sombra);
- la imagen de detras (in_rtTexColor, la distorsion): la pagina copia lo ya pintado a una
  textura (partido-sombrasvr.js).
Los sombreadores de geometria (las particulas falsas: cada triangulo de la malla es una
particula que el sombreador convierte en un cuadrado colocado con una textura de posiciones) no
existen en WebGL: se traducen a una funcion que corre en el de vertices, con la malla ya
repetida por la pagina (cada triangulo, tantos vertices como emite).

Codigo propio (lector del texto de D3DDisassemble y traductor).
"""
import ctypes
import re
import struct

VERSION = 2          # 2: solo las filas del motor que lee y la proyeccion como uniform

# --------------------------------------------------------------------------- desensamblar
_DLL = None


def _dll():
    global _DLL
    if _DLL is None:
        try:
            d = ctypes.WinDLL("d3dcompiler_47.dll")
            d.D3DDisassemble.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_char_p,
                                         ctypes.POINTER(ctypes.c_void_p)]
            d.D3DDisassemble.restype = ctypes.c_long
            _DLL = d
        except (OSError, AttributeError):
            _DLL = False
    return _DLL


def desensamblar(b):
    """El texto de D3DDisassemble de un sombreador DXBC, o None (sin D3DCompiler_47 o roto)."""
    d = _dll()
    if not d or bytes(b[:4]) != b"DXBC":
        return None
    out = ctypes.c_void_p()
    buf = ctypes.create_string_buffer(bytes(b), len(b))
    if d.D3DDisassemble(buf, len(b), 0, None, ctypes.byref(out)) != 0 or not out.value:
        return None
    # ID3DBlob: QueryInterface, AddRef, Release, GetBufferPointer, GetBufferSize
    vt = ctypes.cast(ctypes.cast(out, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))
    puntero = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vt[3])
    tam = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vt[4])
    soltar = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vt[2])
    try:
        return ctypes.string_at(puntero(out), tam(out)).decode("latin-1").replace("\x00", "")
    finally:
        soltar(out)


# --------------------------------------------------------------------------- leer el texto
class Asm:
    """Un sombreador desensamblado: cbuffers (nombre -> registro y variables), recursos,
    firmas de entrada y salida, declaraciones e instrucciones."""

    def __init__(self, texto):
        self.texto = texto
        self.tipo = None                 # "vs", "ps", "gs"
        self.cb = {}                     # "cb4" -> {"nombre", "vars": {var: (fila, filas)}, "tam"}
        self.cb_por_nombre = {}
        self.texturas = {}               # "t0" -> nombre
        self.entradas = []               # [(semantica, indice, mascara, registro, sysvalue)]
        self.salidas = []
        self.temps = 0
        self.gs = {}                     # primitiva de entrada, topologia, maxout
        self.ins = []                    # [(opcode, [operandos])]
        self._leer()

    @staticmethod
    def _tabla(lineas, i):
        """Las filas de una tabla de firma ("// Name Index Mask Register SysValue Format Used")
        desde la linea i (la cabecera): por columnas, con la linea de guiones."""
        while i < len(lineas) and not lineas[i].startswith("// ---"):
            i += 1
        if i >= len(lineas):
            return [], i
        guiones = lineas[i][3:]
        cols, p = [], 0
        for trozo in guiones.split(" "):
            cols.append((p, p + len(trozo)))
            p += len(trozo) + 1
        filas = []
        i += 1
        while i < len(lineas) and lineas[i].startswith("// ") and lineas[i].strip() != "//":
            s = lineas[i][3:]
            campos = [s[a:b].strip() if a < len(s) else "" for a, b in cols]
            mascara = s[cols[2][0]:cols[2][1]] if len(cols) > 2 else ""
            filas.append((campos, mascara))
            i += 1
        return filas, i

    def _leer(self):
        lineas = self.texto.splitlines()
        cb_actual = None
        i = 0
        while i < len(lineas):
            l = lineas[i]
            m = re.match(r"// cbuffer (\w+)", l)
            if m:
                cb_actual = {"nombre": m.group(1), "vars": {}}
                self.cb_por_nombre[m.group(1)] = cb_actual
            m = re.match(r"//\s+(row_major |column_major )?(\w+) (\w+)(\[(\d+)\])?;\s+// Offset:\s+(\d+) Size:\s+(\d+)", l)
            if m and cb_actual is not None:
                off, tam = int(m.group(6)), int(m.group(7))
                cb_actual["vars"][m.group(3)] = (off // 16, (tam + 15) // 16, m.group(2), int(m.group(5) or 1),
                                                 "unused" not in l)
            m = re.match(r"// (\w+)\s+(texture|cbuffer|sampler|sampler_c)\s+\S+\s+\S+\s+(\w+)\s+\d+", l)
            if m:
                if m.group(2) == "texture":
                    self.texturas[m.group(3)] = m.group(1)
                elif m.group(2) == "cbuffer" and m.group(1) in self.cb_por_nombre:
                    self.cb[m.group(3)] = self.cb_por_nombre[m.group(1)]
            if l.startswith("// Input signature") or l.startswith("// Output signature"):
                filas, i = self._tabla(lineas, i)
                lista = self.entradas if "Input" in l else self.salidas
                for campos, mascara in filas:
                    if len(campos) < 5 or not campos[3].isdigit():
                        continue
                    comps = "".join(c for c in mascara if c in "xyzw")
                    usada = "".join(c for c in (campos[6] if len(campos) > 6 else "xyzw") if c in "xyzw")
                    if lista is self.entradas and not usada and campos[4] == "NONE":
                        continue          # una entrada que el codigo no lee: no se pide
                    lista.append((campos[0], int(campos[1] or 0), comps, int(campos[3]), campos[4]))
                continue
            if re.match(r"^(vs|ps|gs)_5_0$", l.strip()):
                self.tipo = l.strip()[:2]
                self._codigo(lineas[i + 1:])
                break
            i += 1

    def _codigo(self, lineas):
        for l in lineas:
            l = l.strip()
            if not l or l.startswith("//"):
                continue
            op, _, resto = l.partition(" ")
            # los de muestreo llevan "(texture2d)(float,float,float,float)" pegado
            m = re.match(r"^(\w+)((\([^)]*\))*)$", op)
            if m and m.group(2):
                op = m.group(1)
                if "texture3d" in m.group(2):
                    op += "_3d"
            if op.startswith("dcl_"):
                self._dcl(op, resto)
                continue
            self.ins.append((op, _operandos(resto)))

    def _dcl(self, op, resto):
        if op == "dcl_temps":
            self.temps = int(resto)
        elif op == "dcl_inputprimitive":
            self.gs["entrada"] = resto.strip()
        elif op == "dcl_outputtopology":
            self.gs["topologia"] = resto.strip()
        elif op == "dcl_maxout":
            self.gs["maxout"] = int(resto)
        elif op == "dcl_constantbuffer":
            m = re.match(r"CB(\d+)\[(\d+)\]", resto)
            if m:
                cb = self.cb.setdefault("cb" + m.group(1), {"nombre": "?", "vars": {}})
                cb["tam"] = int(m.group(2))
        elif op == "dcl_indexableTemp":
            raise ValueError("temporales indexables (sin traducir)")


def _operandos(s):
    """Separa los operandos por comas que no esten dentro de () ni []."""
    out, nivel, cur = [], 0, ""
    for c in s:
        if c in "([":
            nivel += 1
        elif c in ")]":
            nivel -= 1
        if c == "," and nivel == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += c
    if cur.strip():
        out.append(cur.strip())
    return out


# --------------------------------------------------------------------------- traducir
def _bits(x):
    """Los 32 bits de un literal del ensamblador ("1.000000", "-0.5", "0x3f800000", "-1")."""
    if x.startswith(("0x", "-0x")):
        return int(x, 16) & 0xFFFFFFFF
    if re.fullmatch(r"-?\d+", x):
        return int(x) & 0xFFFFFFFF
    if re.fullmatch(r"-?\d+\.\d+(e[-+]?\d+)?", x):
        return struct.unpack("<I", struct.pack("<f", float(x)))[0]
    raise ValueError("literal raro: " + x)


def _flt(x):
    """Un float de GLSL a partir del texto de un literal (los enteros y los hex con sus bits)."""
    if re.fullmatch(r"-?\d+\.\d+(e[-+]?\d+)?", x):
        return x
    b = _bits(x)
    if b == 0:
        return "0.0"
    e = (b >> 23) & 0xFF
    if 0 < e < 255:
        f = struct.unpack("<f", struct.pack("<I", b))[0]
        return repr(f) if "e" not in repr(f) else "%.9e" % f
    return "uintBitsToFloat(%du)" % b


def _ent(x, tipo):
    """Un literal como int (tipo i) o uint (tipo u) de GLSL, por sus bits."""
    b = _bits(x)
    if tipo == "u":
        return "%du" % b
    v = b - (1 << 32) if b & 0x80000000 else b
    return str(v) if v != -2147483648 else "(-2147483647 - 1)"


class Traductor:
    """Traduce un Asm a GLSL. `nombres` dice como se llama en GLSL cada registro que no es
    temporal (entradas, salidas, cbuffers, texturas)."""

    def __init__(self, asm, cbs, texturas, pantalla, prefijo="", motor=(), dinamicos=()):
        self.asm = asm
        self.cbs = cbs            # "cb4" -> nombre del array GLSL
        self.tex = texturas       # "t0" -> nombre del sampler GLSL o None (constante)
        self.pantalla = pantalla  # registros de textura de pantalla (y al reves)
        self.p = prefijo          # para los nombres de la funcion de geometria
        self.emits = 0
        # los cbuffers del motor: una variable por fila que lee (nombre_fila); los que se
        # indexan con un registro (dinamicos), un array entero
        self.motor, self.dinamicos = set(motor), set(dinamicos)
        self.filas = {}

    def reg(self, nombre):
        """El nombre GLSL de un registro r/v/o (sin componentes)."""
        m = re.fullmatch(r"v\[(\d+)\]\[(\d+)\]", nombre)
        if m:
            return "gi%s[%s]" % (m.group(1), m.group(2))
        m = re.fullmatch(r"([rvo])(\d+)", nombre)
        if m:
            return self.p + m.group(1) + m.group(2)
        raise ValueError("registro raro: " + nombre)

    def fuente(self, op, tipo="f"):
        """Un operando fuente como expresion vec4 GLSL (de tipo `tipo`: f float, i int, u uint).
        Los enteros se leen de los bits del float (en VR los registros no tienen tipo)."""
        neg = absol = False
        if op.startswith("-"):
            neg, op = True, op[1:]
        if op.startswith("|") and op.endswith("|"):
            absol, op = True, op[1:-1]
        elif op.startswith("|"):
            m = re.match(r"\|(.*)\|(\.[xyzw]+)?$", op)
            if m:
                absol, op = True, m.group(1) + (m.group(2) or "")
        if op.startswith("l("):
            vals = [x.strip() for x in op[2:-1].split(",")]
            if 1 < len(vals) < 4:
                vals = (vals + vals[-1:] * 4)[:4]
            if tipo == "f":
                e = "vec4(%s)" % ", ".join(_flt(v) for v in vals)
            else:
                e = "%s(%s)" % ("ivec4" if tipo == "i" else "uvec4", ", ".join(_ent(v, tipo) for v in vals))
            if neg:
                e = "(-%s)" % e
            return e
        m = re.fullmatch(r"(.*?)(\.([xyzw]{1,4}))?", op)
        base, sw = m.group(1), m.group(3) or "xyzw"
        e = self._base(base)
        if len(sw) == 1:
            e = "vec4(%s.%s)" % (e, sw)
        else:
            e = "%s.%s" % (e, (sw + sw[-1] * 4)[:4])
        if absol:
            e = "abs(%s)" % e
        if neg:
            e = "(-%s)" % e
        if tipo == "i":
            return "floatBitsToInt(%s)" % e
        if tipo == "u":
            return "floatBitsToUint(%s)" % e
        return e

    def _base(self, base):
        m = re.fullmatch(r"cb(\d+)\[(.+)\]", base)
        if m:
            arr = self.cbs.get("cb" + m.group(1))
            if arr is None:
                raise ValueError("cbuffer sin datos: cb" + m.group(1))
            idx = m.group(2).strip()
            if not idx.isdigit():
                m2 = re.fullmatch(r"(r\d+)\.([xyzw])(\s*\+\s*(\d+))?", idx)
                if not m2:
                    raise ValueError("indice raro: " + idx)
                idx = "floatBitsToInt(%s.%s)%s" % (self.reg(m2.group(1)), m2.group(2),
                                                   (" + " + m2.group(4)) if m2.group(4) else "")
                if arr in self.motor:
                    self.filas[arr] = None
            elif arr in self.motor and arr not in self.dinamicos:
                if self.filas.get(arr, set()) is not None:
                    self.filas.setdefault(arr, set()).add(int(idx))
                return "%s_%s" % (arr, idx)
            return "%s[%s]" % (arr, idx)
        return self.reg(base)

    def destino(self, op):
        """(nombre, mascara) de un operando destino; (None, None) si es null."""
        if op == "null":
            return None, None
        m = re.fullmatch(r"(.*?)\.([xyzw]{1,4})", op)
        if m:
            return self.reg(m.group(1)), m.group(2)
        return self.reg(op), "xyzw"

    def poner(self, op, expr, sat=False, tipo="f"):
        """`dest.mascara = (expr).mascara;` (expr vec4 de `tipo`)."""
        d, mk = self.destino(op)
        if d is None:
            return ""
        if tipo == "i":
            expr = "intBitsToFloat(%s)" % expr
        elif tipo == "u":
            expr = "uintBitsToFloat(%s)" % expr
        if sat:
            expr = "clamp(%s, 0.0, 1.0)" % expr
        return "%s.%s = (%s).%s;" % (d, mk, expr, mk)

    def mascara_bool(self, bexpr):
        """De un bvec4 a 0xFFFFFFFF / 0 en float (como los de VR)."""
        return "uintBitsToFloat(uvec4(%s) * 0xFFFFFFFFu)" % bexpr

    def textura(self, t, coord, lod=None, dims=2):
        reg = t.split(".")[0]
        sw = t.split(".")[1] if "." in t else "xyzw"
        sw = (sw + sw[-1] * 4)[:4]
        nombre = self.tex.get(reg)
        if nombre is None or dims != 2:
            # la profundidad de la escena: "lejos"; lo que no hay (y las 3D): blanco
            return "vec4(1.0).%s" % sw
        c = "(%s).xy" % coord if dims == 2 else "(%s).xyz" % coord
        if reg in self.pantalla:
            c = "vec2((%s).x, 1.0 - (%s).y)" % (coord, coord)
        if lod is None:
            return "texture(%s, %s).%s" % (nombre, c, sw)
        return "textureLod(%s, %s, %s).%s" % (nombre, c, lod, sw)

    def instruccion(self, op, a):
        sat = op.endswith("_sat")
        if sat:
            op = op[:-4]
        F = self.fuente
        P = lambda e, tipo="f": self.poner(a[0], e, sat, tipo)
        bin_f = {"add": "%s + %s", "mul": "%s * %s", "div": "%s / %s", "min": "min(%s, %s)", "max": "max(%s, %s)"}
        if op in bin_f:
            return P("(" + bin_f[op] % (F(a[1]), F(a[2])) + ")")
        if op == "mov":
            return P(F(a[1]))
        if op == "mad":
            return P("(%s * %s + %s)" % (F(a[1]), F(a[2]), F(a[3])))
        if op in ("dp2", "dp3", "dp4"):
            n = {"dp2": "xy", "dp3": "xyz", "dp4": "xyzw"}[op]
            return P("vec4(dot((%s).%s, (%s).%s))" % (F(a[1]), n, F(a[2]), n))
        uno = {"sqrt": "sqrt(%s)", "rsq": "inversesqrt(%s)", "exp": "exp2(%s)", "log": "log2(%s)", "frc": "fract(%s)",
               "round_z": "trunc(%s)", "round_ne": "roundEven(%s)", "round_ni": "floor(%s)", "round_pi": "ceil(%s)",
               "deriv_rtx_coarse": "dFdx(%s)", "deriv_rtx_fine": "dFdx(%s)", "deriv_rtx": "dFdx(%s)",
               "deriv_rty_coarse": "(-dFdy(%s))", "deriv_rty_fine": "(-dFdy(%s))", "deriv_rty": "(-dFdy(%s))"}
        if op in uno:
            return P(uno[op] % F(a[1]))
        if op == "sincos":
            out = []
            if a[0] != "null":
                out.append(self.poner(a[0], "sin(%s)" % F(a[2]), sat))
            if a[1] != "null":
                out.append(self.poner(a[1], "cos(%s)" % F(a[2]), sat))
            return " ".join(out)
        cmp_f = {"lt": "lessThan", "ge": "greaterThanEqual", "eq": "equal", "ne": "notEqual"}
        if op in cmp_f:
            return P(self.mascara_bool("%s(%s, %s)" % (cmp_f[op], F(a[1]), F(a[2]))))
        cmp_i = {"ilt": ("lessThan", "i"), "ige": ("greaterThanEqual", "i"), "ieq": ("equal", "i"),
                 "ine": ("notEqual", "i"), "ult": ("lessThan", "u"), "uge": ("greaterThanEqual", "u")}
        if op in cmp_i:
            f, t = cmp_i[op]
            return P(self.mascara_bool("%s(%s, %s)" % (f, F(a[1], t), F(a[2], t))))
        bits = {"and": "&", "or": "|", "xor": "^"}
        if op in bits:
            return P("(%s %s %s)" % (F(a[1], "u"), bits[op], F(a[2], "u")), "u")
        if op == "not":
            return P("(~%s)" % F(a[1], "u"), "u")
        enteros = {"iadd": ("%s + %s", "i"), "ishl": ("%s << (%s & 31)", "i"), "ishr": ("%s >> (%s & 31)", "i"),
                   "ushr": ("%s >> (%s & 31u)", "u"), "imin": ("min(%s, %s)", "i"), "imax": ("max(%s, %s)", "i"),
                   "umin": ("min(%s, %s)", "u"), "umax": ("max(%s, %s)", "u")}
        if op in enteros:
            f, t = enteros[op]
            return P("(" + f % (F(a[1], t), F(a[2], t)) + ")", t)
        if op == "ineg":
            return P("(-%s)" % F(a[1], "i"), "i")
        if op == "imul":
            return self.poner(a[1], "(%s * %s)" % (F(a[2], "i"), F(a[3], "i")), sat, "i")
        if op == "umul":
            return self.poner(a[1], "(%s * %s)" % (F(a[2], "u"), F(a[3], "u")), sat, "u")
        if op == "udiv":
            out = []
            if a[0] != "null":
                out.append(self.poner(a[0], "(%s / max(%s, uvec4(1u)))" % (F(a[2], "u"), F(a[3], "u")), sat, "u"))
            if a[1] != "null":
                out.append(self.poner(a[1], "(%s %% max(%s, uvec4(1u)))" % (F(a[2], "u"), F(a[3], "u")), sat, "u"))
            return " ".join(out)
        if op == "imad":
            return P("(%s * %s + %s)" % (F(a[1], "i"), F(a[2], "i"), F(a[3], "i")), "i")
        if op == "utof":
            return P("vec4(%s)" % F(a[1], "u"))
        if op == "itof":
            return P("vec4(%s)" % F(a[1], "i"))
        if op == "ftoi":
            return P("ivec4(%s)" % F(a[1]), "i")
        if op == "ftou":
            return P("uvec4(max(%s, vec4(0.0)))" % F(a[1]), "u")
        if op == "movc":
            return P("mix(%s, %s, notEqual(%s, uvec4(0u)))" % (F(a[3]), F(a[2]), F(a[1], "u")))
        if op in ("discard_nz", "discard_z"):
            c = "!=" if op == "discard_nz" else "=="
            return "if (%s.x %s 0u) discard;" % (F(a[0], "u"), c)
        if op in ("if_nz", "if_z"):
            c = "!=" if op == "if_nz" else "=="
            return "if (%s.x %s 0u) {" % (F(a[0], "u"), c)
        if op == "else":
            return "} else {"
        if op == "endif":
            return "}"
        if op == "loop":
            return "for (int _k = 0; _k < 256; _k++) {"
        if op == "endloop":
            return "}"
        if op == "break":
            return "break;"
        if op in ("breakc_nz", "breakc_z"):
            c = "!=" if op == "breakc_nz" else "=="
            return "if (%s.x %s 0u) break;" % (F(a[0], "u"), c)
        if op == "ret":
            return "return;"
        if op in ("retc_nz", "retc_z"):
            c = "!=" if op == "retc_nz" else "=="
            return "if (%s.x %s 0u) return;" % (F(a[0], "u"), c)
        if op in ("sample_indexable", "sample", "sample_indexable_3d"):
            return P(self.textura(a[2], F(a[1]), dims=3 if op.endswith("_3d") else 2))
        if op in ("sample_l_indexable", "sample_l", "sample_l_indexable_3d"):
            return P(self.textura(a[2], F(a[1]), lod="(%s).x" % F(a[4]), dims=3 if op.endswith("_3d") else 2))
        if op in ("sample_b_indexable", "sample_b"):
            return P(self.textura(a[2], F(a[1])))
        if op in ("sample_d_indexable", "sample_d"):
            return P(self.textura(a[2], F(a[1])))
        if op in ("sample_c_indexable", "sample_c_lz_indexable", "sample_c", "sample_c_lz"):
            # las sombras: con luz (en VR el 1 es "en sombra": suman las 5 muestras y van hacia
            # el color de sombra)
            return P("vec4(0.0)")
        if op in ("ld_indexable", "ld"):
            reg = a[2].split(".")[0]
            nombre = self.tex.get(reg)
            sw = (a[2].split(".")[1] if "." in a[2] else "xyzw")
            sw = (sw + sw[-1] * 4)[:4]
            if nombre is None:
                return P("vec4(1.0).%s" % sw)
            return P("texelFetch(%s, (%s).xy, 0).%s" % (nombre, F(a[1], "i"), sw))
        if op == "emit_stream" or op == "emit":
            self.emits += 1
            return "%semitir(%d);" % (self.p, self.emits - 1)
        if op in ("cut_stream", "cut", "nop"):
            return ""
        raise ValueError("instruccion sin traducir: " + op)

    def cuerpo(self):
        return "\n".join("  " + x for x in (self.instruccion(op, a) for op, a in self.asm.ins) if x)


# --------------------------------------------------------------------------- el motor
# Lo que pone el motor del juego en sus cbuffers, con las cosas de three (por nombre de
# variable: una expresion vec4 por fila). PD: la proyeccion de three con la z de Direct3D
_MATRICES = {
    "u_mtxLW": "modelMatrix", "u_mtxLV": "(viewMatrix * modelMatrix)", "u_mtxLP": "(PD * viewMatrix * modelMatrix)",
    "u_mtxWV": "viewMatrix", "u_mtxWP": "(PD * viewMatrix)", "u_mtxVP": "PD", "u_mtxVW": "inverse(viewMatrix)",
    "u_eyeMtxWV": "viewMatrix", "u_eyeMtxVP": "PD", "u_eyeMtxWP": "(PD * viewMatrix)",
    "u_eyeMtxVW": "inverse(viewMatrix)", "u_eyeMtxPV": "inverse(PD)", "u_eyeMtxPW": "inverse(PD * viewMatrix)",
    "u_mtxLVOld": "(viewMatrix * modelMatrix)", "u_mtxVPOld": "PD",
}
_VECTORES = {
    "u_eyePos": "vec4(cameraPosition, 1.0)",
    "u_eyeDir": "vec4(-normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])), 0.0)",
    "u_eyeUpDir": "vec4(normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1])), 0.0)",
    # (cerca, lejos, 1, 1/aspecto): z y w son un vector de pantalla cuadrada (la distorsion y
    # T3ThresholdF lo usan asi; los nombres dicen "InvAspect"; sin confirmar)
    "u_eyeNearFarInvAspect": "vec4(sv_cerca, sv_lejos, 1.0, 1.0 / max(sv_camara.z, 0.01))",
    "u_softParticleParam": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_lightDir": "vec4(normalize(vec3(-0.35, -0.8, -0.45)), 0.0)",
    "u_shadowColor": "vec4(0.7, 0.7, 0.78, 1.0)",
    "u_effectLightParam": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_effectShadowParam": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_charaAmbient": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_charaShadowParam": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_charaAmbLightParam": "vec4(0.0, 0.0, 0.0, 1.0)",
    "u_lightProb1": "vec4(1.0, 1.0, 1.0, 1.0)",
    "u_shadowSampleParams": "vec4(0.0, 0.0, 0.0005, 0.0005)",
}
# los cbuffers que rellena la pagina por material (el material y los datos de usuario)
CB_MATERIAL = "CBUSE_UB_MODEL_MATERIAL_IDX"
CB_PAGINA = (CB_MATERIAL, "CBUSE_UB_USER_DATA00_IDX", "CBUSE_UB_USER_DATA01_IDX", "CBUSE_UB_USER_DATA02_IDX")
# texturas que pone el motor (no el material): la pagina pone la imagen de detras; las demas
# son constantes
_TEX_MOTOR = {"in_rtTexColor": "sv_pantalla"}


def _motor(cb, nombre_glsl, tam, leidas=None):
    """(declaraciones, lineas GLSL) que rellenan el cbuffer `cb` del motor: las filas `leidas`
    (variables nombre_fila) o, si es None, el array entero nombre[tam]."""
    if leidas is None:
        decl = ["vec4 %s[%d];" % (nombre_glsl, tam)]
        out = ["  for (int k = 0; k < %d; k++) %s[k] = vec4(0.0);" % (tam, nombre_glsl)]
        fila_de = lambda f: "%s[%d]" % (nombre_glsl, f)
        quiero = set(range(tam))
    else:
        decl = ["vec4 %s_%d;" % (nombre_glsl, f) for f in sorted(leidas)]
        out = ["  %s_%d = vec4(0.0);" % (nombre_glsl, f) for f in sorted(leidas)]
        fila_de = lambda f: "%s_%d" % (nombre_glsl, f)
        quiero = set(leidas)
    for var, (fila, filas, tipo, n, _usada) in cb["vars"].items():
        if var in _MATRICES and quiero & set(range(fila, fila + 4)):
            out.append("  { mat4 m = transpose(%s); %s }" % (_MATRICES[var], " ".join(
                "%s = m[%d];" % (fila_de(fila + k), k) for k in range(4) if fila + k in quiero)))
        elif var in _VECTORES and fila in quiero:
            out.append("  %s = %s;" % (fila_de(fila), _VECTORES[var]))
    return decl, out


_COMUN = """
uniform vec4 sv_pantallaVP;
// la proyeccion de la camara con la z de Direct3D (de 0 a 1), como la de VR, y (cerca, lejos):
// la pone la pagina una vez por cuadro (partido-sombrasvr.js ponerCamara)
uniform mat4 sv_PD;
uniform vec4 sv_camara;
#define PD sv_PD
#define sv_cerca sv_camara.x
#define sv_lejos sv_camara.y
void sv_motor() {}
"""


def _vars_glsl(lista, cual):
    return ["vec4 %s%d;" % (cual, i) for i in lista]


def _registros(asm):
    """Los registros v# y o# que usa (por las firmas y el codigo)."""
    vs, os_ = set(), set()
    for _s, _i, _m, r, _sv in asm.entradas:
        vs.add(r)
    for _s, _i, _m, r, _sv in asm.salidas:
        os_.add(r)
    for _op, ops in asm.ins:
        for o in ops:
            for m in re.finditer(r"(?<![\w\[])([vo])(\d+)(?![\w\]])", o):
                (vs if m.group(1) == "v" else os_).add(int(m.group(2)))
    return sorted(vs), sorted(os_)


def _sem(s, i):
    """El nombre GLSL de una semantica (TEXCOORD 5 -> sv_TEXCOORD5)."""
    return "sv_%s%d" % (s, i)


# atributos de three para las entradas de los vertices (la pagina pone uvN de cada ranura)
def _atributo(sem, idx):
    if sem == "POSITION":
        return "vec4(transformed, 1.0)"
    if sem == "NORMAL":
        return "vec4(objectNormal, 1.0)"
    if sem == "COLOR":
        return "sv_color%d" % idx
    if sem == "TEXCOORD":
        return "vec4(sv_uv%d, 0.0, 1.0)" % idx
    if sem == "TANGENT":
        return "sv_tangente"
    if sem == "BINORMAL":
        return "vec4(cross(objectNormal, sv_tangente.xyz) * sv_tangente.w, 1.0)"
    return "vec4(0.0, 0.0, 0.0, 1.0)"


def _nombre_pagina(cb):
    """El nombre del uniform de un cbuffer que pone la pagina (CBUSE_UB_MODEL_MATERIAL_IDX ->
    u_model_material)."""
    return "u_" + cb.replace("CBUSE_UB_", "").replace("_IDX", "").lower()


def _tam(cb):
    return cb.get("tam") or max([v[0] + v[1] for v in cb["vars"].values()] or [1])


def _cbs(asm, prefijo_motor):
    """({"cbN": nombre GLSL}, {nombre GLSL: cbuffer} de los del motor, nombres de los
    uniformes de la pagina que usa)."""
    nombres, motor, usa = {}, {}, set()
    for reg, cb in sorted(asm.cb.items()):
        if cb["nombre"] in CB_PAGINA:
            g = _nombre_pagina(cb["nombre"])
            nombres[reg] = g
            usa.add(g)
        else:
            g = "%s_%s" % (prefijo_motor, reg)
            nombres[reg] = g
            motor[g] = cb
    return nombres, motor, usa


def _texturas(asm, ref_de):
    """({"tN": nombre GLSL o None}, registros de pantalla). ref_de(nombre): el numero de la
    textura del material, o None."""
    out, pantalla = {}, set()
    for reg, nombre in asm.texturas.items():
        if nombre in _TEX_MOTOR:
            out[reg] = _TEX_MOTOR[nombre]
            pantalla.add(reg)
        elif nombre.startswith(("in_", "ro_")):
            out[reg] = None
        else:
            k = ref_de(nombre)
            out[reg] = ("sv_tex%d" % k) if k is not None else None
    return out, pantalla


def texturas_del_material(*asms):
    """Las texturas que pone el material, en el orden en que el juego las asigna (por numero de
    registro, juntando las de todas las etapas): [nombre]."""
    regs = {}
    for a in asms:
        if a is None:
            continue
        for reg, nombre in a.texturas.items():
            if not nombre.startswith(("in_", "ro_")):
                regs[int(reg[1:])] = nombre
    return [regs[k] for k in sorted(regs)]


def _relleno_ceros(n):
    return "" if n >= 4 else ", " + ", ".join(["0.0"] * (4 - n))


class _Etapa:
    """Lo comun de una etapa ya leida: sus cbuffers, texturas, registros y su traduccion."""

    def __init__(self, asm, prefijo_motor, ref_de, prefijo=""):
        self.asm = asm
        self.nombres, motor, self.usa = _cbs(asm, prefijo_motor)
        self.tex, self.pantalla = _texturas(asm, ref_de)
        self.vin, self.vout = _registros(asm)
        self.tr = Traductor(asm, self.nombres, self.tex, self.pantalla, prefijo, motor=motor)
        self.codigo = self.tr.cuerpo()
        dinamicos = {g for g, f in self.tr.filas.items() if f is None}
        if dinamicos:
            # alguno se indexa con un registro: ese, entero
            self.tr = Traductor(asm, self.nombres, self.tex, self.pantalla, prefijo, motor=motor, dinamicos=dinamicos)
            self.codigo = self.tr.cuerpo()
        self.decl, self.relleno = [], []
        for g, cb in sorted(motor.items()):
            if g not in self.tr.filas and g not in dinamicos:
                continue
            d, r = _motor(cb, g, _tam(cb), None if g in dinamicos else self.tr.filas[g])
            self.decl += d
            self.relleno += r

    def samplers(self):
        return {x for x in self.tex.values() if x}


def traducir(vs, ps, gs=None):
    """{"vs", "fs", "texturas", "uniformes", "entradas", "gs", "pantalla", "posicion"} de los
    textos desensamblados. Lanza ValueError si algo no se sabe traducir."""
    A_vs, A_ps = Asm(vs), Asm(ps)
    A_gs = Asm(gs) if gs else None
    texs = texturas_del_material(A_vs, A_gs, A_ps)

    def ref_de(nombre):
        return texs.index(nombre) if nombre in texs else None
    # los cbuffers de la pagina: el mismo tamano en todas las etapas (si no, no enlaza)
    pagina = {}
    for a in (A_vs, A_gs, A_ps):
        if a is None:
            continue
        for cb in a.cb.values():
            if cb["nombre"] in CB_PAGINA:
                g = _nombre_pagina(cb["nombre"])
                tam, vs_ = pagina.get(g, (0, {}))
                vs_.update({v: [x[0], x[1]] for v, x in cb["vars"].items()})
                pagina[g] = (max(tam, _tam(cb)), vs_)

    def uni(usa):
        return ["uniform vec4 %s[%d];" % (g, pagina[g][0]) for g in sorted(usa)]
    E_vs = _Etapa(A_vs, "sv_v", ref_de)
    E_gs = _Etapa(A_gs, "sv_g", ref_de, prefijo="g") if A_gs else None
    E_ps = _Etapa(A_ps, "sv_p", ref_de)
    entradas = [[s, i] for s, i, m, r, sv in A_vs.entradas]
    if E_gs is None:
        lineas, salidas, geo = _solo_vertices(E_vs, entradas, uni)
    else:
        lineas, salidas, geo = _con_geometria(E_vs, E_gs, entradas, uni)
    # ---- pixeles
    fs = ["// O-331: traducido del sombreador de VR (no se reparte)",
          "uniform mat4 modelMatrix;", "uniform mat4 projectionMatrix;"]
    fs += uni(E_ps.usa)
    fs += ["uniform sampler2D %s;" % t for t in sorted(E_ps.samplers())]
    disponibles = {_sem(s, i) for s, i in salidas}
    pos = False
    ini = []
    for s, i, m, r, sv in A_ps.entradas:
        if sv == "POS":
            pos = True
            # SV_Position de Direct3D: pixeles desde arriba a la izquierda del cuadro, z de 0 a
            # 1 y w la de la camara
            ini.append("  v%d = vec4(gl_FragCoord.x - sv_pantallaVP.x, sv_pantallaVP.w - (gl_FragCoord.y - sv_pantallaVP.y),"
                       " gl_FragCoord.z, 1.0 / gl_FragCoord.w);" % r)
        elif s == "SV_IsFrontFace" or sv == "FFACE":
            ini.append("  v%d = vec4(uintBitsToFloat(gl_FrontFacing ? 0xFFFFFFFFu : 0u));" % r)
        elif _sem(s, i) in disponibles:
            ini.append("  v%d.%s = %s.%s;" % (r, m, _sem(s, i), "xyzw"[:len(m)]))
    fs += ["in vec4 %s;" % n for n in sorted(disponibles)]
    fs += ["#include <common>", _COMUN]
    fs += E_ps.decl + _vars_glsl(E_ps.vin, "v") + _vars_glsl(E_ps.vout, "o") + ["vec4 r%d;" % k for k in range(A_ps.temps)]
    fs += ["void sv_cuerpo() {", E_ps.codigo, "}"]
    fs += ["void main() {", "  sv_motor();"] + E_ps.relleno
    fs += ["  v%d = vec4(0.0);" % k for k in E_ps.vin] + ini
    fs += ["  r%d = vec4(0.0);" % k for k in range(A_ps.temps)] + ["  o%d = vec4(0.0);" % k for k in E_ps.vout]
    fs += ["  sv_cuerpo();", "  gl_FragColor = o0;" if 0 in E_ps.vout else "  gl_FragColor = vec4(0.0);", "}"]
    pant = bool(E_ps.pantalla or E_vs.pantalla or (E_gs and E_gs.pantalla))
    return {"version": VERSION, "vs": "\n".join(lineas), "fs": "\n".join(fs), "texturas": texs,
            "uniformes": {g: {"tam": t, "vars": v} for g, (t, v) in sorted(pagina.items())},
            "entradas": entradas, "gs": geo, "pantalla": pant, "posicion": pos or pant}


def _decl_entradas(entradas):
    out = set()
    for sem, idx in entradas:
        if sem == "COLOR":
            out.add("in vec4 sv_color%d;" % idx)
        elif sem == "TEXCOORD":
            out.add("in vec2 sv_uv%d;" % idx)
        elif sem in ("TANGENT", "BINORMAL"):
            out.add("in vec4 sv_tangente;")
    return sorted(out)


def _solo_vertices(E, entradas, uni):
    A = E.asm
    lineas = ["// O-331: traducido del sombreador de VR (no se reparte)"]
    lineas += _decl_entradas(entradas) + uni(E.usa) + ["uniform sampler2D %s;" % t for t in sorted(E.samplers())]
    salidas = [(s, i) for s, i, m, r, sv in A.salidas if sv != "POS"]
    lineas += ["out vec4 %s;" % _sem(s, i) for s, i in salidas]
    lineas += ["#include <common>", "#include <skinning_pars_vertex>", _COMUN]
    lineas += E.decl + _vars_glsl(E.vin, "v") + _vars_glsl(E.vout, "o") + ["vec4 r%d;" % k for k in range(A.temps)]
    lineas += ["void sv_cuerpo() {", E.codigo, "}"]
    lineas += ["void main() {", "  sv_motor();",
               "  vec3 transformed = vec3(position); vec3 objectNormal = vec3(normal);",
               "#include <skinbase_vertex>", "#include <skinnormal_vertex>", "#include <skinning_vertex>"]
    lineas += E.relleno
    lineas += ["  v%d = vec4(0.0);" % k for k in E.vin]
    lineas += ["  v%d = %s;" % (r, _atributo(s, i)) for s, i, m, r, sv in A.entradas]
    lineas += ["  r%d = vec4(0.0);" % k for k in range(A.temps)] + ["  o%d = vec4(0.0);" % k for k in E.vout]
    lineas += ["  sv_cuerpo();"]
    for s, i, m, r, sv in A.salidas:
        if sv == "POS":
            lineas.append("  gl_Position = o%d;" % r)
        else:
            lineas.append("  %s = vec4(o%d.%s%s);" % (_sem(s, i), r, m, _relleno_ceros(len(m))))
    lineas += ["  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;", "}"]
    return lineas, salidas, None


def _atributo_de(k, sem, idx):
    """La entrada `sem` del vertice k de la primitiva (geometria)."""
    if sem == "POSITION":
        return "vec4(sv_a%d_pos.xyz, 1.0)" % k
    if sem == "NORMAL":
        return "vec4(sv_a%d_nor, 1.0)" % k
    if sem == "COLOR":
        return "sv_a%d_color%d" % (k, idx)
    if sem == "TEXCOORD":
        return "vec4(sv_a%d_uv%d, 0.0, 1.0)" % (k, idx)
    if sem in ("TANGENT", "BINORMAL"):
        return "sv_a%d_tangente" % k
    return "vec4(0.0, 0.0, 0.0, 1.0)"


def _con_geometria(E, G, entradas, uni):
    """El de vertices con el de geometria dentro: cada vertice que pone la pagina es la esquina
    `sv_esquina` (en sv_a0_pos.w) de lo que emite el de geometria para su primitiva; los
    vertices de la primitiva original van en atributos sv_a0_*, sv_a1_*, sv_a2_*."""
    A, AG = E.asm, G.asm
    prim = AG.gs.get("entrada", "triangle")
    nv = {"point": 1, "line": 2, "triangle": 3}.get(prim)
    if nv is None:
        raise ValueError("primitiva de geometria rara: " + prim)
    if any(op in ("loop", "if_nz", "if_z") for op, _a in AG.ins):
        raise ValueError("geometria con bucles o condiciones (sin traducir)")
    lineas = ["// O-331: traducido del sombreador de VR (no se reparte)"]
    # que registros de entrada lee de cada vertice
    lee = {}
    for _op, ops in AG.ins:
        for o in ops:
            for m in re.finditer(r"v\[(\d+)\]\[(\d+)\]", o):
                lee.setdefault(int(m.group(1)), set()).add(int(m.group(2)))
    pos_gs = {r for s, i, m, r, sv in AG.entradas if sv == "POS"}

    def solo_pos(k):
        return k > 0 and lee.get(k, set()) <= pos_gs

    def de_vertice(k):
        return [(s, i) for s, i in entradas if not solo_pos(k) or s == "POSITION"]
    atrs = set()
    for k in range(nv):
        for sem, idx in de_vertice(k):
            atrs.add({"POSITION": "in vec4 sv_a%d_pos;" % k, "NORMAL": "in vec3 sv_a%d_nor;" % k,
                      "COLOR": "in vec4 sv_a%d_color%d;" % (k, idx), "TEXCOORD": "in vec2 sv_a%d_uv%d;" % (k, idx),
                      "TANGENT": "in vec4 sv_a%d_tangente;" % k, "BINORMAL": "in vec4 sv_a%d_tangente;" % k}.get(sem, ""))
    lineas += sorted(x for x in atrs if x)
    lineas += uni(E.usa | G.usa)
    lineas += ["uniform sampler2D %s;" % t for t in sorted(E.samplers() | G.samplers())]
    salidas = [(s, i) for s, i, m, r, sv in AG.salidas if sv != "POS"]
    lineas += ["out vec4 %s;" % _sem(s, i) for s, i in salidas]
    lineas += ["#include <common>", _COMUN]
    lineas += E.decl + G.decl
    lineas += _vars_glsl(E.vin, "v") + _vars_glsl(E.vout, "o") + ["vec4 r%d;" % k for k in range(A.temps)]
    lineas += ["void sv_cuerpo() {", E.codigo, "}"]
    gin = sorted({r for s, i, m, r, sv in AG.entradas})
    n_gin = (max(gin) + 1) if gin else 1
    lineas += ["vec4 gi%d[%d];" % (k, n_gin) for k in range(nv)]
    lineas += _vars_glsl(G.vout, "go") + ["vec4 gr%d;" % k for k in range(AG.temps)]
    lineas += ["float sv_esquina;"] + ["vec4 sv_sal%d;" % k for k in G.vout]
    lineas += ["void gemitir(int k) {", "  if (float(k) == sv_esquina) {"]
    lineas += ["    sv_sal%d = go%d;" % (k, k) for k in G.vout] + ["  }", "}"]
    lineas += ["void sv_geometria() {", G.codigo, "}"]
    lineas += ["void main() {", "  sv_motor();"] + E.relleno + G.relleno
    lineas += ["  sv_esquina = sv_a0_pos.w;"]
    por_sem = {(s, i): (r, m) for s, i, m, r, sv in A.salidas}
    pos_vs = next(((r, m) for s, i, m, r, sv in A.salidas if sv == "POS"), None)
    for k in range(nv):
        lineas += ["  v%d = vec4(0.0);" % j for j in E.vin]
        lineas += ["  v%d = %s;" % (r, _atributo_de(k, s, i)) for s, i, m, r, sv in A.entradas
                   if [s, i] in [list(x) for x in de_vertice(k)]]
        lineas += ["  r%d = vec4(0.0);" % j for j in range(A.temps)] + ["  o%d = vec4(0.0);" % j for j in E.vout]
        lineas.append("  sv_cuerpo();")
        lineas.append("  for (int j = 0; j < %d; j++) gi%d[j] = vec4(0.0);" % (n_gin, k))
        for s, i, m, r, sv in AG.entradas:
            src = pos_vs if sv == "POS" else por_sem.get((s, i))
            if src is None:
                continue
            rr, mm = src
            n = min(len(m), len(mm))
            # la semantica va en las componentes mm de la salida y en las m de la entrada
            lineas.append("  gi%d[%d].%s = o%d.%s;" % (k, r, m[:n], rr, mm[:n]))
    lineas += ["  gr%d = vec4(0.0);" % j for j in range(AG.temps)] + ["  go%d = vec4(0.0);" % j for j in G.vout]
    lineas += ["  sv_sal%d = vec4(0.0);" % j for j in G.vout]
    lineas.append("  sv_geometria();")
    for s, i, m, r, sv in AG.salidas:
        if sv == "POS":
            lineas.append("  gl_Position = sv_sal%d;" % r)
        else:
            lineas.append("  %s = vec4(sv_sal%d.%s%s);" % (_sem(s, i), r, m, _relleno_ceros(len(m))))
    lineas += ["  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;", "}"]
    # las tiras que emite (la pagina hace los triangulos): los numeros de emit de cada una
    tiras, actual, k = [], [], 0
    for op, _a in AG.ins:
        if op in ("emit_stream", "emit"):
            actual.append(k)
            k += 1
        elif op in ("cut_stream", "cut") and actual:
            tiras.append(actual)
            actual = []
    if actual:
        tiras.append(actual)
    return lineas, salidas, {"vertices": nv, "emite": k, "tiras": tiras,
                             "solo_posicion": [k for k in range(nv) if solo_pos(k)]}


# --------------------------------------------------------------------------- del juego
class Biblioteca:
    """Los sombreadores del juego (shader_list.cfg.bin -> .fxbin -> los .vfxo/.pfxo/.gfxo de la
    tecnica main), traducidos una vez por proceso. `leer(ruta)` da los bytes de un fichero del
    juego (rutas como dx11/shader/<version>/...) o lanza; `hay(ruta)`."""

    def __init__(self, leer, hay, ficheros=()):
        self.leer, self.hay = leer, hay
        self.carpeta = None
        for r in ficheros:
            m = re.match(r"(dx11/shader/[^/]+/)shader_list\.cfg\.bin$", r)
            if m:
                self.carpeta = m.group(1)
        self._fx = None
        self._hechos = {}

    def _lista(self):
        if self._fx is None:
            from ievr import cfgbin
            self._fx = {}
            if self.carpeta and self.hay(self.carpeta + "shader_list.cfg.bin"):
                for n, v in cfgbin.leer(self.leer(self.carpeta + "shader_list.cfg.bin")):
                    if n == "SHADERFX" and len(v) > 1 and isinstance(v[1], str):
                        self._fx[v[0]] = v[1].split("/")[-1]
        return self._fx

    def nombre_de_crc(self, h):
        """El nombre del sombreador cuyo crc32 lleva un material ("8b1f..." o int), o None."""
        if not hasattr(self, "_crc"):
            import zlib
            self._crc = {zlib.crc32(n.encode("utf-8")) & 0xFFFFFFFF: n for n in self._lista()}
        return self._crc.get(int(h, 16) if isinstance(h, str) else h)

    def tecnica(self, nombre):
        """{"VS", "PS", "GS"?} de la tecnica main (sin piel: la piel la pone three)."""
        from ievr import cfgbin
        fx = self._lista().get(nombre)
        if not fx or not self.hay(self.carpeta + fx):
            return None
        tecs, cur = [], None
        for n, v in cfgbin.leer(self.leer(self.carpeta + fx)):
            if n == "TEC_BGN":
                cur = {"tec": v[0]}
            elif n in ("VS", "PS", "GS") and cur is not None and v:
                cur[n] = v[0]
            elif n == "TEC_END" and cur:
                tecs.append(cur)
                cur = None
        for t in tecs:
            if t["tec"] == "main" and not t.get("VS", "").endswith("_vb"):
                return t
        return tecs[0] if tecs else None

    def programa(self, nombre):
        """El programa traducido del sombreador `nombre` (Effect_T1...) o {"error": ...}."""
        if nombre in self._hechos:
            return self._hechos[nombre]
        try:
            t = self.tecnica(nombre)
            if not t or "VS" not in t or "PS" not in t:
                raise ValueError("sin tecnica main")
            textos = {}
            for k, ext in (("VS", ".vfxo"), ("PS", ".pfxo"), ("GS", ".gfxo")):
                if k in t:
                    ruta = self.carpeta + t[k] + ext
                    if not self.hay(ruta):
                        raise ValueError("falta " + t[k] + ext)
                    s = desensamblar(self.leer(ruta))
                    if s is None:
                        raise ValueError("no se pudo desensamblar (sin D3DCompiler_47?)")
                    textos[k] = s
            p = traducir(textos["VS"], textos["PS"], textos.get("GS"))
            p["tecnica"] = {k: t[k] for k in ("VS", "PS", "GS") if k in t}
        except (ValueError, KeyError, IndexError, OSError) as e:
            p = {"error": "%s: %s" % (type(e).__name__, e)}
        self._hechos[nombre] = p
        return p
