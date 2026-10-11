"""Figuras 3D: el visor de modelos del juego para hacerse figuras impresas (NOTAS O-347).

Aaron: "un visor 3d de los modelos, que puedas elegir un personaje de todos los disponibles,
cambiarles el uniforme (de los del juego), la pose (sacadas de las del juego), dorsal y si
quieres que sea capitan o no por la bandana, y un boton para descargar el modelo en esa pose,
ya que tengo un amigo con maquina de impresion 3d".

Todo sale del juego instalado en cada PC, como los modelos del partido (O-293, O-334): los
personajes, la ropa de cada equipacion y las poses se convierten aqui y se quedan en
`datos/modelos3d/` (no se reparten). Lo que hace este modulo:

  personajes()            todos los que tienen modelo, con su nombre (de la base de datos)
  equipaciones()          las equipaciones del juego con su nombre y su dibujo
  ropa(codigo, ...)       el codigo de la ropa de esa equipacion para ese personaje (g4.ropa_de)
  poses(codigo)           las animaciones de su cuerpo, con nombre en espanol y por grupos
  pose_glb(codigo, ...)   un .glb solo con el esqueleto y esa animacion (la pagina la aplica)

Los modelos en si van por la cola de siempre (ievr/modelos3d.py). La pagina es
web/figuras.html; la descarga para imprimir (STL, OBJ con colores, GLB) la hace la pagina con
el modelo ya posado, sin pasar por aqui.
"""
import hashlib
import json
import os
import re
import threading

from ievr import reglas

_cerrojo = threading.Lock()
_juego = None
# Sube si cambia lo que sale en clips.json o en los .glb de las poses: los viejos se rehacen
VERSION_POSES = 3


def _carpeta():
    from ievr import modelos3d as M3
    return os.path.join(M3.carpeta(), "poses")


def _tabla(nombre):
    return reglas._tabla(nombre)


def _juego_abierto():
    """El juego instalado (su indice de piezas de personaje), uno para todas las peticiones."""
    global _juego
    if _juego is None:
        from ievr import g4, rutas
        from ievr import modelos3d as M3
        _juego = g4.Juego(rutas.carpeta_del_juego(), os.path.join(M3.carpeta(), "indice.json"))
    return _juego


# --------------------------------------------------------------------------- personajes
def personajes():
    """[{codigo, nombre, saga, genero, elemento, posicion, rareza_valor, apt, grupo, viste}]:
    cada modelo una vez. Los de la base de datos con su nombre (si varios comparten modelo, el
    de rareza mas baja); sus armaduras de keshin (_5000, _5100...) aparte; las caras que el
    juego trae sin usar (O-239) con el nombre que tengan; y los avatares."""
    def construir():
        from ievr import basedatos as BD
        from ievr import g4
        filas = {f["codigo"]: f for f in _tabla("modelos-personaje.csv")}
        fuera, vistos = [], set()
        por_cara = {}
        for p in BD.personajes():
            c = p.get("cara") or ""
            if c not in filas:
                continue
            ya = por_cara.get(c)
            if ya is None or p["rareza_valor"] < ya["rareza_valor"]:
                por_cara[c] = p

        def pon(codigo, nombre, p=None, grupo="personaje", cara=None):
            f = filas[codigo]
            fuera.append({
                "codigo": codigo, "nombre": nombre, "cara": cara or codigo,
                "saga": (p or {}).get("saga", ""), "genero": (p or {}).get("genero", ""),
                "elemento": (p or {}).get("elemento", ""), "posicion": (p or {}).get("posicion", ""),
                "rareza_valor": (p or {}).get("rareza_valor", 0), "apt": (p or {}).get("apt", ""),
                "equipo": (p or {}).get("equipo", ""), "grupo": grupo,
                # si se le puede poner la ropa de una equipacion (los de cuerpo de persona; los
                # animales, monstruos y armaduras llevan lo suyo: columna vestir, O-334)
                "viste": f.get("vestir") == "1" and bool(f.get("cuerpo", "")),
                "portero": (p or {}).get("posicion") == "POR"})
            vistos.add(codigo)
        for c, p in por_cara.items():
            pon(c, p["nombre"], p)
        # las armaduras de keshin: el cuerpo es otro modelo (g4.rutas_de)
        for codigo in filas:
            base, _, suf = codigo.partition("_")
            if suf.isdigit() and len(suf) == 4 and base in por_cara:
                n = int(suf) // 100 - 49
                pon(codigo, "%s (armadura%s)" % (por_cara[base]["nombre"], " %d" % n if n > 1 else ""),
                    por_cara[base], "armadura", cara=base)
        for f in _tabla("caras-sin-usar.csv"):
            c = f["cara"]
            if c in filas and c not in vistos and f.get("nombre"):
                pon(c, f["nombre"], None, "sin usar")
        for codigo in filas:
            if "edit_avatar" in codigo and codigo not in vistos:
                pon(codigo, "Avatar %d" % (int(re.sub(r"\D", "", codigo.split("avatar")[1]) or 0) + 1),
                    None, "avatar", cara="")
        fuera.sort(key=lambda x: (x["grupo"] != "personaje", x["nombre"].lower()))
        g4  # (solo para que el import falle aqui si falta numpy, no a mitad)
        return fuera
    from ievr import opciones as O
    return O._indice("figuras_personajes", construir)


# --------------------------------------------------------------------------- equipaciones
def equipaciones():
    """[{id (hex), nombre, icono, disenos, obtenible}]: las de la mochila del juego (con su
    nombre en espanol y su dibujo) y las de los equipos de la historia que no son un objeto (con
    el nombre del equipo). Las que no tienen nombre por ningun lado no salen."""
    def construir():
        from ievr import g4
        from ievr import opciones as O
        filas = {}
        for f in _tabla("modelos-equipacion.csv"):
            if not f.get("personaje"):
                filas.setdefault(f["id"].upper(), {})[f["diseno"]] = f
        en_espanol = {f["id"].upper(): O._limpio(f.get("nombre_es") or f.get("nombre_en"))
                      for f in _tabla("nombres-es.csv")}
        nombres, iconos, obtenible = {}, {}, set()
        for f in _tabla("equipo-objetos.csv"):
            if f["tipo"] != "equipacion":
                continue
            v = f["valor_equipo"].upper()
            if v not in filas:
                v = "".join(reversed([v[i:i + 2] for i in range(0, 8, 2)]))
            if v not in filas:
                continue
            nombres[v] = en_espanol.get(f["id_objeto"].upper()) or O._limpio(f.get("nombre") or "")
            iconos[v] = f.get("icono") or ""
            obtenible.add(v)
        for f in _tabla("equipos-juego.csv"):
            v = (f.get("equipacion_crudo") or "").upper()
            if v in filas and v not in nombres and f.get("nombre"):
                nombres[v] = "Equipo %s" % O._limpio(f["nombre"])
        sencilla = "%08X" % g4.EQUIPACION_SENCILLA
        if sencilla in filas:
            nombres.setdefault(sencilla, "Equipación sencilla")
        fuera = []
        for v, por_diseno in filas.items():
            if v not in nombres:
                continue
            campo = (por_diseno.get("0") or next(iter(por_diseno.values())))["campo"]
            icono = iconos.get(v) or ("10_icon_chr/uniform/%s_00_l.png" % campo if campo else "")
            fuera.append({"id": v, "nombre": nombres[v], "icono": icono,
                          "disenos": g4.disenos(int(v, 16)) or ["0"],
                          "obtenible": v in obtenible})
        fuera.sort(key=lambda x: (not x["obtenible"], x["nombre"].lower()))
        return fuera
    from ievr import opciones as O
    return O._indice("figuras_equipaciones", construir)


def ropa(codigo, equipacion, diseno="0", portero=False):
    """El codigo del .glb de la ropa (ropa_...) que lleva `codigo` con esa equipacion (hex), o ""
    si ese personaje lleva siempre lo suyo."""
    from ievr import g4
    if equipacion == "propia":
        return ropa_propia(codigo)
    try:
        uniforme = int(str(equipacion), 16)
    except ValueError:
        return ""
    return g4.ropa_de(codigo, uniforme, str(diseno or "0"), bool(portero))


def ropa_propia(codigo):
    """La ropa de su historia como ropa de equipo (la de serie, columna ropa de
    modelos-personaje.csv, con sus botas y guantes), o "" si no esta en las tablas de ropa.
    El .glb de siempre (<codigo>.glb) lleva esa misma ropa pero sin la piel de debajo: en las de
    manga corta salen sin antebrazos ni manos (O-334). Asi sale con brazos, dorsal y brazalete."""
    import zlib
    from ievr import g4
    f = g4.piezas(codigo)
    if not f or f.get("vestir") != "1" or f.get("cuerpo", "") == "" or not f.get("ropa"):
        return ""
    r, _e = g4._tablas_ropa()
    if f["ropa"] not in r.get("ropa", {}):
        return ""

    def clave(tipo, tex):
        k = "%08x" % (zlib.crc32(tex.encode("ascii")) & 0xFFFFFFFF) if tex else ""
        return k if k in r.get(tipo, {}) else "0"
    return "%s%s_%s_%s_%s" % (g4.PREFIJO_ROPA, f["ropa"], f["cuerpo"], clave("botas", f.get("botas_tex")),
                              clave("guantes", f.get("guantes_tex")))


# --------------------------------------------------------------------------- poses
# El nombre en espanol de cada animacion: el juego las nombra en japones por piezas (戦1 = en el
# partido, シュート = tiro, 左 = izquierda...). Se traduce pieza a pieza; lo que no se conoce se
# queda en japones (el nombre original sale tambien en la pagina).
PIEZAS = [
    # posturas de los menus del juego
    ("ステータスポーズ", "Pose de ficha"), ("アバターポーズ標準", "Pose de avatar normal"),
    ("アバターポーズ", "Pose de avatar"), ("UIポーズ", "Pose de menu"),
    ("VS画面後ポーズ", "Pose de VS de espaldas"), ("VS画面ポーズ", "Pose de VS"),
    ("陽気", "alegre"), ("豪快", "enérgica"), ("クール", "chula"), ("上品", "elegante"),
    ("呼吸有", "respirando"),
    # gestos y celebraciones
    ("キズナエモート", "Gesto:"), ("挨拶", "saludo"), ("飛び跳ね", "saltos"),
    ("のけぞり驚き", "sorpresa"), ("応援立ち", "animando"), ("腕組みうなずき", "brazos cruzados"),
    ("片手ごめん", "perdón"), ("明日人", "de Inamori"),
    ("ゴール後その場喜び", "Celebración de gol"), ("ゴール後走り喜び", "Celebración de gol corriendo"),
    ("ゴール後その場がっかり", "Decepción tras gol"), ("ゴール後走りがっかり", "Decepción tras gol corriendo"),
    ("その場喜び", "Celebración"), ("勝利片膝", "Victoria de rodillas"), ("トロフィー持ち立ち", "Con el trofeo"),
    ("抱き合い喜び", "Abrazo de celebración"), ("喜びガッツ", "Puño en alto"), ("喜び飛び跳ね", "Saltos de alegría"),
    ("ガッツ", "Puño en alto"), ("控えめ喜び老人", "Celebración discreta"),
    ("決めポーズ", "Pose final"), ("キメポーズ", "Pose final"), ("宣言ポーズ", "Pose de anuncio"),
    ("猫ポーズ", "Pose de gato"), ("ゴッドハンドポーズ", "Pose de la Mano Celestial"),
    ("円堂どけポーズ", "Pose de Mark Evans"), ("一之瀬", "de Erik Eagle"), ("真名部", "de Manabe"),
    ("オズロック", "de Ozrock"), ("ガンダレス", "de Gandares"), ("湿川", "de Shimekawa"),
    ("雲明", "de Unmei"), ("弁天", "de Benten"), ("妖士乃", "de Yoshino"), ("伊勢谷", "de Iseya"),
    ("豪炎寺", "de Axel Blaze"), ("鬼道", "de Jude Sharp"), ("神童", "de Riccardo"), ("アフロディ", "de Byron Love"),
    ("円堂", "de Mark Evans"), ("一星", "de Ichihoshi"), ("召喚演出", "Invocación"),
    ("ダンスバトル", "Baile"), ("筋肉アピール", "Presumir de músculos"), ("ホディビル", "Culturista"),
    ("私服", "con ropa de calle"), ("ポケット", "manos en los bolsillos"), ("振り向き", "girándose"),
    ("笑い", "riendo"), ("泣き", "llorando"), ("指示", "dando órdenes"), ("指差し", "señalando"),
    ("両手広げ", "brazos abiertos"), ("腕組み", "brazos cruzados"), ("吠え", "gritando"), ("寝", "durmiendo"),
    ("成功", "(sale bien)"), ("待機", "esperando"), ("控えめ", "discreto"), ("傾", "inclinado"),
    ("ポーズ", "Pose"),
    # el portero
    ("GK", "Portero:"), ("パワーハンドキャッチ", "blocaje con mano de poder"), ("パワーキャッチ", "blocaje potente"),
    ("カルタキャッチ", "manotazo"), ("必殺キャッチ失敗", "parada con técnica fallida"),
    ("キャッチミス", "blocaje fallado"), ("キャッチ予備動作", "preparando el blocaje"), ("キャッチ", "blocaje"),
    ("パンチング", "despeje de puños"), ("前動作", "preparación"), ("構えアイドリング", "en guardia"),
    ("パントキック", "saque de volea"), ("ゴールキック", "saque de puerta"), ("上投げ", "saque por arriba"),
    ("下投げ", "saque por abajo"), ("ブレイクアウェイ", "salida"),
    # tiros
    ("走りゾーンシュート", "Tiro corriendo en la zona"), ("ゾーンシュート", "Tiro en la zona"),
    ("ワザシュート", "Tiro con técnica"), ("バウンドシュート", "Tiro de bote"), ("Hシュート", "Tiro alto"),
    ("シュート", "Tiro"), ("ヘディングパス", "pase de cabeza"), ("ヘディング", "de cabeza"),
    # duelos
    ("スチールダッシュ", "Robo en carrera"), ("インサイドアウト", "Interior-exterior"), ("トンネルドライブ", "Caño"),
    ("ヒールリフト", "Lambretta"), ("フェイントダッシュ", "Amago y arrancada"), ("エラシコ", "Elástica"),
    ("ショルダーチャージ", "Carga con el hombro"), ("ディレイステップ", "Paso retrasado"),
    ("ドローイングカット", "Corte"), ("フリックタッチ", "Toque rápido"), ("マリーシア", "Picardía"),
    ("勝利", "(gana)"), ("敗北", "(pierde)"), ("すりぬけ", "Escurrirse"),
    ("スライディング", "Entrada deslizante"), ("正面ブロック", "Bloqueo de frente"), ("ブロック", "Bloqueo"),
    ("パスカット胸トラップ", "Cortar el pase con el pecho"), ("フェイント", "Amago"), ("突破", "Regate"),
    ("奪い成功", "Robo"), ("キープ", "Proteger el balón"),
    ("フォーカス", "Duelo:"), ("スクランブル", "Disputa"), ("ハイボール", "por alto"), ("グラウンダー", "por bajo"),
    ("競合", "pelea"), ("保持", "se la queda"), ("失敗", "la pierde"), ("必殺前", "antes de la supertécnica"),
    ("必殺戻", "tras la supertécnica"), ("やられ", "derrotado"),
    # pases y controles
    ("パス呼び", "Pedir el balón"), ("走パス", "Pase corriendo"), ("パス", "Pase"), ("スローイン立ち", "Esperando el saque de banda"),
    ("スローイン", "Saque de banda"), ("コーナーキック", "Saque de esquina"), ("フリーキック前旋回", "Girar antes de la falta"),
    ("セットプレイ立ち", "Esperando a balón parado"), ("キック", "Patada"), ("走トラップ", "Control corriendo"),
    ("トラップ", "Control"), ("ボールチェスト立ち", "Balón en el pecho"), ("ボールチェスト", "Balón en el pecho"),
    ("ボール保持指示出し", "Con el balón dando órdenes"), ("ボール保持", "Con el balón"),
    # golpes
    ("ダメージ", "Golpe"), ("コケル", "Tropezar"), ("ヒットバック", "Empujado"), ("吹っ飛び", "Salir despedido"),
    ("仰向けダウン", "En el suelo boca arriba"), ("うつ伏せダウン", "En el suelo boca abajo"), ("スタン", "Aturdido"),
    ("ノックバック", "Retroceder"), ("上昇", "subiendo"), ("中間", "en el aire"), ("下降", "bajando"),
    ("強", "fuerte"), ("弱", "flojo"),
    # moverse
    ("ウォーミングアップ", "Calentando"), ("範囲外", "Fuera del campo:"), ("壁立ち", "En la barrera"),
    ("疲れ走り", "Correr cansado"), ("切返し", "recorte"), ("急ストップ", "Frenar en seco"), ("ストップ", "Frenar"),
    ("ダッシュ", "Sprint"), ("走り", "Correr"), ("歩き", "Andar"), ("ジャンプ", "Salto"), ("ステップ", "Paso"),
    ("旋回", "Girar"), ("ターン", "girar"), ("アイドリング", "esperando"), ("立ち", "De pie"), ("座り", "Sentado"),
    ("会話", "hablando"), ("階段", "escaleras"), ("しゃがみ片膝", "Rodilla en el suelo"), ("片膝", "de rodillas"),
    ("驚き", "Sorpresa"), ("半歩後", "medio paso atrás"), ("警戒立ち", "En guardia"), ("腰手当て立ち", "Manos en la cintura"),
    ("応援", "Animando"), ("手叩き", "aplaudiendo"), ("声かけ", "gritando"), ("見回し", "Mirar alrededor"),
    ("パンチ", "Puñetazo"), ("地面手つき", "Manos en el suelo"), ("胸倉掴まれ", "agarrado del cuello"),
    ("マネージャー", "Gerente:"), ("やる気立ち", "con ganas"), ("キャピキャピ立ち", "pose mona"),
    ("胸", "con el pecho"), ("股", "con el muslo"), ("足", "con el pie"), ("ゾーン", "en la zona"),
    ("その場", "en el sitio"), ("後に", "después"), ("ゴール後", "tras el gol"), ("喜び", "alegría"),
    ("がっかり", "decepción"),
]
# las direcciones van al final, entre parentesis
DIRECCIONES = [("斜左後", "diagonal izquierda atrás"), ("斜右後", "diagonal derecha atrás"),
               ("左上", "izquierda arriba"), ("右上", "derecha arriba"), ("左下", "izquierda abajo"),
               ("右下", "derecha abajo"), ("前上", "frente arriba"), ("前下", "frente abajo"),
               ("左", "izquierda"), ("右", "derecha"), ("前", "frente"), ("後", "atrás"),
               ("上", "arriba"), ("下", "abajo"), ("高", "alto"), ("低", "bajo")]
PREFIJOS = [("戦1", ""), ("Tイベ", "Historia: "), ("Bイベ", "Historia: "), ("FB", ""), ("サブクエ", "Misión: "),
            ("特訓", "Entreno: "), ("NPC", "NPC: "), ("イベント", "Escena: ")]

GRUPOS = ["Posturas del juego", "Celebraciones y gestos", "Tiros", "Regates y defensa", "Portero",
          "Pases y controles", "Correr y saltar", "Caídas y golpes", "Partido (otras)", "Otras animaciones"]


def _grupo(n):
    """El grupo de una animacion por su nombre japones."""
    if re.search(r"ステータスポーズ|アバターポーズ|UIポーズ|VS画面", n):
        return "Posturas del juego"
    if re.search(r"喜び|がっかり|勝利片膝|トロフィー|キズナエモート|ガッツ|ポーズ", n):
        return "Celebraciones y gestos"
    if not n.startswith(("戦1", "Tイベ", "Bイベ")) and not re.search(r"ボール", n):
        return "Otras animaciones"
    if re.search(r"GK", n):
        return "Portero"
    if re.search(r"シュート", n):
        return "Tiros"
    if re.search(r"勝利|敗北|スライディング|ブロック|フェイント|突破|奪い|キープ|すりぬけ|パスカット|フォーカス", n):
        return "Regates y defensa"
    if re.search(r"パス|キック|スローイン|トラップ|ボール|コーナー|セットプレイ|スクランブル", n):
        return "Pases y controles"
    if re.search(r"ダメージ|吹っ飛び|ダウン|スタン|コケル|ヒットバック|ノックバック", n):
        return "Caídas y golpes"
    if re.search(r"走り|ダッシュ|歩き|ジャンプ|ステップ|旋回|立ち|ストップ|ウォーミング", n):
        return "Correr y saltar"
    return "Partido (otras)"


def nombre_pose(n):
    """El nombre en espanol de una animacion (戦1GKキャッチ左上高 -> "Portero: blocaje (izquierda
    arriba alto)")."""
    resto, cab = n, ""
    for p, es in PREFIJOS:
        if resto.startswith(p):
            resto, cab = resto[len(p):], es
            break
    entra = resto.endswith("入")
    resto = re.sub(r"[L入]$", "", resto)
    trozos, dirs, raro = [], [], ""
    i = 0
    while i < len(resto):
        hallado = next(((p, es, False) for p, es in PIEZAS if resto.startswith(p, i)), None) or \
            next(((p, es, True) for p, es in DIRECCIONES if resto.startswith(p, i)), None)
        m = re.match(r"\d+", resto[i:]) if not hallado else None
        if hallado or m:
            if raro:                      # lo que no se conoce, junto y tal cual
                trozos.append(raro)
                raro = ""
            if m:
                trozos.append(m.group(0))
                i += len(m.group(0))
            else:
                (dirs if hallado[2] else trozos).append(hallado[1])
                i += len(hallado[0])
        else:
            raro += resto[i]
            i += 1
    if raro:
        trozos.append(raro)
    texto = " ".join(trozos)
    texto = re.sub(r"\s+", " ", texto).strip()
    if dirs:
        texto += " (" + " ".join(dirs) + ")"
    if entra:
        texto += " · entrada"
    texto = cab + texto
    return texto[:1].upper() + texto[1:] if texto else n


def _ruta_banco(anim, banco):
    return "common/chr/{0}/{1}.g4pk".format(anim, banco)


def poses(codigo):
    """{"cuerpo": anim, "poses": [{banco, clip, nombre, original, grupo, segundos, bucle}],
    "grupos": [...], "defecto": {banco, clip}} de las animaciones del cuerpo de `codigo`. La
    lista se saca una vez por cuerpo (leer los 27 bancos tarda ~15 s) y se guarda en
    datos/modelos3d/poses/<cuerpo>/clips.json."""
    from ievr import g4, g4anim
    f = g4.piezas(codigo)
    if not f:
        raise LookupError("no conozco ese personaje")
    anim = f.get("anim") or ""
    if not anim:
        return {"cuerpo": "", "poses": [], "grupos": GRUPOS, "defecto": None}
    ruta = os.path.join(_carpeta(), anim, "clips.json")
    try:
        with open(ruta, encoding="utf-8") as fh:
            d = json.load(fh)
        if d.get("version") == VERSION_POSES:
            return d["datos"]
    except (OSError, ValueError, KeyError):
        pass
    with _cerrojo:
        j = _juego_abierto()
        bancos = sorted(r for r in j.ficheros if r.startswith("common/chr/%s/" % anim) and r.endswith(".g4pk"))
        lista, nombres = [], set()
        for r in bancos:
            banco = os.path.splitext(os.path.basename(r))[0]
            try:
                mts = g4anim.bancos_de(j.leer(r))
            except Exception:        # un banco raro no deja sin las demas
                continue
            todos = {c["nombre"] for mt in mts for c in mt["clips"]}
            for mt in mts:
                for c in mt["clips"]:
                    n = c["nombre"]
                    # fuera: las aditivas (necesitan otra debajo), las vueltas (戻), las T de
                    # referencia, las repetidas en otro banco y la entrada si esta la quieta
                    if (c["flags"] & 1 or "加算" in n or n.endswith("戻") or n in nombres or re.fullmatch(r"(Tイベ|FB)?[tT](ポーズ)?", n)
                            or (n.endswith("入") and n[:-1] + "L" in todos) or n.startswith("ev")):
                        continue
                    nombres.add(n)
                    fps = c["fps"] or 60
                    lista.append({"banco": banco, "clip": n, "nombre": nombre_pose(n), "original": n,
                                  "grupo": _grupo(n), "segundos": round((c["fin"] - c["ini"]) / fps, 3),
                                  "bucle": n.endswith("L")})
    # dos con el mismo nombre (la de un golpe y la quieta, 戦1Hシュート1前上1 y ...1L): la quieta se dice
    cuantos = {}
    for x in lista:
        cuantos[x["nombre"]] = cuantos.get(x["nombre"], 0) + 1
    for x in lista:
        if cuantos[x["nombre"]] > 1 and x["bucle"]:
            x["nombre"] += " (quieta)"
    orden = {g: i for i, g in enumerate(GRUPOS)}
    lista.sort(key=lambda x: (orden[x["grupo"]], x["nombre"]))
    defecto = next(({"banco": x["banco"], "clip": x["clip"]} for x in lista if x["clip"] == "ステータスポーズ1L"),
                   None)
    datos = {"cuerpo": anim, "poses": lista, "grupos": GRUPOS, "defecto": defecto}
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as fh:
        json.dump({"version": VERSION_POSES, "datos": datos}, fh, ensure_ascii=False)
    os.replace(ruta + ".tmp", ruta)
    return datos


def pose_glb(codigo, banco, clip):
    """La ruta de un .glb con el esqueleto de `codigo` y la animacion `clip` del banco `banco`
    de su cuerpo (sin avance: el personaje se queda en su sitio). Los nodos se llaman como los
    huesos del modelo, asi la pagina la aplica al personaje (vestido o no) por nombre."""
    from ievr import g4, g4anim
    f = g4.piezas(codigo)
    if not f or not f.get("anim"):
        raise LookupError("ese personaje no tiene animaciones")
    if not re.fullmatch(r"%s_p\d{3}" % re.escape(f["anim"]), banco or ""):
        raise LookupError("ese banco de animaciones no es de su cuerpo")
    esq = f["esqueleto"]
    clave = hashlib.sha1(("%d|%s|%s|%s" % (VERSION_POSES, esq, banco, clip)).encode("utf-8")).hexdigest()[:16]
    ruta = os.path.join(_carpeta(), re.sub(r"[^A-Za-z0-9_]", "_", esq), clave + ".glb")
    if os.path.isfile(ruta):
        return ruta
    with _cerrojo:
        j = _juego_abierto()
        rb = _ruta_banco(f["anim"], banco)
        if not j.hay(rb):
            raise LookupError("el juego no trae ese banco de animaciones")
        if rb not in j.objetos:
            j.objetos[rb] = g4anim.bancos_de(j.leer(rb))
        mts = j.objetos[rb]
        g = g4.Glb()
        sk = g4.leer_g4sk(j.leer("common/chr/" + esq))
        reposo, _ = g4._esqueleto(g, sk, lambda *_: None)
        g.j["skins"] = []
        if not g4anim.anadir_animacion(g, sk, reposo, 0, banco, mts, clip):
            raise LookupError("esa animacion no se puede usar como pose")
        g.j["asset"]["extras"] = {"version": VERSION_POSES, "pose": clip, "banco": banco}
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        g.guardar(ruta)
    return ruta


# --------------------------------------------------------------------------- las supertecnicas
def tecnicas(codigo):
    """Las supertecnicas como poses (sus animaciones de VR, O-323): [{evento, nombre, actor,
    segundos, tipo, elemento, suya}] de las que tienen animacion para su tipo de cuerpo; primero
    las de su arbol (de cualquiera de sus versiones con ese modelo) y luego todas las demas, una
    vez por evento. actor: el que la hace en el guion (s00 casi siempre; en algunas defensas el
    s01, con el rival de s00: columna roles, O-345)."""
    from ievr import basedatos as BD
    from ievr import g4evento as GE
    tipo = GE._tipo_de_cara(codigo)
    if not tipo:
        return {"tipo": "", "tecnicas": []}
    por_id = {t["id"].upper(): t for t in BD.tecnicas()}
    suyas = set()
    cara = codigo.split("_")[0] if re.search(r"_\d{4}$", codigo) else codigo
    idents = {p["identidad"] for p in BD.personajes() if p.get("cara") == cara}
    for f in _tabla("personajes.csv"):
        if f["identidad"].upper() in idents:
            suyas |= {f.get("tec%d" % i, "").upper() for i in range(1, 10)} - {""}
    fuera, vistos = [], set()
    for f in _tabla("eventos-tecnicas.csv"):
        ev, idh = f.get("evento") or "", (f.get("id") or "").upper()
        t = por_id.get(idh)
        if not ev or not t or tipo not in (f.get("tipos_cuerpo") or "01 02 03 04").split():
            continue
        suya = idh in suyas
        if ev in vistos:
            if suya:                       # la variante de su arbol manda
                for x in fuera:
                    if x["evento"] == ev:
                        x["suya"], x["nombre"] = True, t["nombre"]
            continue
        vistos.add(ev)
        actor = next((r.split("=")[0] for r in (f.get("roles") or "").split() if r.endswith("=h0")), "s00")
        fuera.append({"evento": ev, "nombre": t["nombre"], "actor": actor, "segundos": float(f.get("segundos") or 0),
                      "tipo": t.get("tipo") or "", "elemento": t.get("elemento") or "", "suya": suya})
    fuera.sort(key=lambda x: (not x["suya"], x["nombre"].lower()))
    return {"tipo": tipo, "tecnicas": fuera}
