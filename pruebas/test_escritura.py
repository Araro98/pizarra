#!/usr/bin/env python3
"""Comprueba que las defensas del editor rechazan lo ilegal y dejan pasar lo legal.

    py pruebas\\test_escritura.py

No escribe nada en disco: llama a las funciones directamente sobre la partida
descifrada en memoria. Lo que comprueba es que **una operacion ilegal levanta
`Ilegal` y no toca ni un byte**, que es la garantia que sostiene todo el
proyecto.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ievr import codec, escribir, inventario, jugador as J, reglas

PARTIDA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "partidas", "rondas", "15-tras-primera-escritura",
                       "002AB8F4-USERDATALIVE")
KING = 4566
fallos = []


def comprobar(titulo, condicion, detalle=""):
    print(("  OK    " if condicion else "  FALLA") + "  " + titulo
          + (" - " + detalle if detalle else ""))
    if not condicion:
        fallos.append(titulo)


def rechaza(titulo, plain, funcion, *args):
    try:
        funcion(plain, *args)
    except escribir.Ilegal as e:
        comprobar(titulo, True, str(e).split("\n")[0][:72])
        return
    comprobar(titulo, False, "DEJO pasar algo que no deberia")


def acepta(titulo, plain, funcion, *args):
    try:
        nuevo, _ = funcion(plain, *args)
    except escribir.Ilegal as e:
        comprobar(titulo, False, "rechazo algo legal: " + str(e).split("\n")[0][:60])
        return plain
    comprobar(titulo, nuevo != plain, "%d bytes cambiados"
              % sum(1 for a, b in zip(plain, nuevo) if a != b))
    return nuevo


def numeros_de_fila_cuadran(plain):
    """Que ninguna fila del inventario tenga un numero que no le toque.

    Vale la pena comprobarlo entero y no solo la fila nueva: si al crear una se
    repitiera un numero, la equipacion de algun jugador pasaria a apuntar a otra
    cosa sin que nada avisara.
    """
    filas = sorted(inventario.todas_las_filas(plain), key=lambda f: f["slot_off"])
    vistos, principios = set(), {}
    for i, f in enumerate(filas):
        if f["slot"] == 0:
            continue
        if f["slot"] in vistos:
            return False
        vistos.add(f["slot"])
        clase, tipo, pos = inventario.descomponer_slot(f["slot"])
        if principios.setdefault((clase, tipo), i - pos) != i - pos:
            return False
        if f["slot"] != inventario.componer_slot(clase, tipo, pos):
            return False
    return True


def jugador_coherente(plain, detalle=False):
    """Que el ultimo jugador creado tenga puestas todas sus partes.

    Un jugador vive en cinco sitios a la vez, y rellenar unos si y otros no deja
    una ficha a medias que el juego ensena rara. Esto comprueba que estan todos.
    """
    base = codec.load(PARTIDA)
    antes = J.array(base, J.ARRAY_IDENTIDAD)
    ahora = J.array(plain, J.ARRAY_IDENTIDAD)
    nuevas = [i for i in range(6000) if antes[i] == 0 and ahora[i] != 0]
    if len(nuevas) != 1:
        return "hay %d filas nuevas, deberia haber 1" % len(nuevas) if detalle else False
    i = nuevas[0]
    fallos = []
    if J.array(plain, J.ARRAY_NIVEL)[i] < 1:
        fallos.append("sin nivel")
    if not reglas.quien_es(ahora[i])[0]:
        fallos.append("identidad que no es de nadie")
    tec = J.ocurrencias(plain, *J.ANCLA_TECNICAS)
    c, _ = J._campos_de(plain, tec[i], set(J.RANURAS_TECNICAS))
    puestas = sum(1 for h in J.RANURAS_TECNICAS
                  if int.from_bytes(c.get(h, b""), "little"))
    if puestas < 1:
        fallos.append("sin ninguna supertecnica")
    ref = inventario.por_slot(plain)
    for h in J.RANURAS_TECNICAS:
        v = int.from_bytes(c.get(h, b""), "little")
        if v and v not in ref:
            fallos.append("una supertecnica apunta a una fila que no existe")
            break
    return (", ".join(fallos) or "bien") if detalle else not fallos


def main():
    if not os.path.isfile(PARTIDA):
        raise SystemExit("no encuentro la partida en %s" % PARTIDA)
    plain = codec.load(PARTIDA)

    print("Equipacion")
    rechaza("un colgante no entra en la ranura de botas", plain,
            escribir.poner_equipacion, KING, 1, "Colgante medalla")
    rechaza("un objeto que no existe se rechaza", plain,
            escribir.poner_equipacion, KING, 1, "Botas del apocalipsis")
    rechaza("no hay ranura 5 de equipacion", plain,
            escribir.poner_equipacion, KING, 5, "Botas Pequenos Gigantes")
    acepta("unas botas si entran en la ranura de botas", plain,
                escribir.poner_equipacion, KING, 1, "Botas Pequeños Gigantes")

    print("\nSupertecnicas")
    rechaza("un tiro no entra en una ranura de parada", plain,
            escribir.poner_tecnica, KING, 1, "Triángulo letal")
    acepta("una parada si entra en una ranura de parada", plain,
                escribir.poner_tecnica, KING, 4, "Mano celestial")
    acepta("en una ranura LIBRE entra cualquier cosa", plain,
                escribir.poner_tecnica, KING, 9, "Triángulo letal")
    rechaza("una tecnica que no se tiene se rechaza", plain,
            escribir.poner_tecnica, KING, 4, "Campo de fuerza")

    print("\nPasivas heredadas")
    # El tope son 3 **ranuras**. Los nombres se cogen de las propias opciones
    # para que la prueba no se rompa cuando cambien las tablas.
    from ievr import opciones as O
    tres = []
    for o in O.heredadas(plain, KING)["opciones"]:
        if o["nombre"] not in tres:
            tres.append(o["nombre"])
        if len(tres) == 4:
            break
    p4 = acepta("la primera heredada entra", plain,
                escribir.poner_heredada, KING, 1, tres[0])
    p5, _ = escribir.poner_heredada(p4, KING, 2, tres[1])
    p6, _ = escribir.poner_heredada(p5, KING, 3, tres[2])
    rechaza("la cuarta heredada se rechaza (el tope son 3)", p6,
            escribir.poner_heredada, KING, 4, tres[3])
    diamante = next((f for f in range(6000)
                     if J.array(plain, J.ARRAY_RAREZA)[f] == 8
                     and J.array(plain, J.ARRAY_NIVEL)[f] > 1), None)
    if diamante is not None:
        rechaza("a un Diamante no se le hereda nada", plain,
                escribir.poner_heredada, diamante, 1, "PP del equipo")

    print("\nNivel")
    rechaza("nivel 0 no existe", plain, escribir.poner_nivel, KING, 0)
    rechaza("nivel 120 pasa del tope", plain, escribir.poner_nivel, KING, 120)
    acepta("subir de nivel dentro del tope", plain, escribir.poner_nivel, KING, 50)

    print("\nRareza")
    rechaza("no se convierte un normal en Idolo", plain,
            escribir.poner_rareza, KING, "Idolo (roja)")
    rechaza("no se convierte un normal en Diamante", plain,
            escribir.poner_rareza, KING, "Diamante")
    acepta("bajar de Leyenda a Estrella si", plain,
           escribir.poner_rareza, KING, "Futbolista estrella")
    idolo = next((f for f in range(6000)
                  if J.array(plain, J.ARRAY_RAREZA)[f] in (5, 6, 7)
                  and J.array(plain, J.ARRAY_NIVEL)[f] > 1), None)
    if idolo is not None:
        rechaza("a un Idolo no se le cambia la rareza", plain,
                escribir.poner_rareza, idolo, "Leyenda del futbol")

    print("\nPasivas normales")
    rechaza("una pasiva que ese personaje no puede sacar", plain,
            escribir.poner_pasiva, KING, 1, "AT propio de tiro en campo contrario")
    rechaza("una pasiva de otro arquetipo en la ranura 3", plain,
            escribir.poner_pasiva, KING, 3, "PP del equipo")

    print("\nPartidos jugados")
    rechaza("no existen los partidos negativos", plain, escribir.poner_partidos, KING, -1)
    rechaza("10000 partidos pasa del tope", plain, escribir.poner_partidos, KING, 10000)
    acepta("30 partidos si (abre las dos insignias)", plain,
           escribir.poner_partidos, KING, 30)

    print("\nInventario")
    rechaza("un objeto que no existe se rechaza", plain,
            escribir.poner_cantidad, "Botas del apocalipsis", 5)
    rechaza("la cantidad no pasa del tope", plain,
            escribir.poner_cantidad, "Botas lisas", 100000)
    acepta("cambiar cuantas Botas lisas tengo", plain,
           escribir.poner_cantidad, "Botas lisas", 500)
    rechaza("no se crea algo que ya se tiene", plain,
            escribir.anadir_objeto, "Botas lisas", 10)
    rechaza("no se crea un objeto inventado", plain,
            escribir.anadir_objeto, "Botas del apocalipsis", 10)
    p7 = acepta("crear unas botas que no tengo", plain,
                escribir.anadir_objeto, "Botas Génesis", 10)
    comprobar("y ahora constan como mias",
              "DE0B995A" in inventario.filas_poseidas(p7),
              "antes %s" % ("DE0B995A" in inventario.filas_poseidas(plain)))
    comprobar("con un numero de fila coherente", numeros_de_fila_cuadran(p7))

    print("\nCrear jugadores")
    MARK = "3055CF22"        # Mark Evans normal
    IDOLO = "9634AFB0"       # Axel Blaze Idolo, del que Aaron tiene una copia
    rechaza("un personaje que no existe", plain,
            escribir.anadir_jugador, "Pepito Palotes")
    rechaza("un nombre que llevan varios personajes", plain,
            escribir.anadir_jugador, "Mark Evans")
    rechaza("un futbolista normal no nace Diamante", plain,
            escribir.anadir_jugador, MARK, "Diamante")
    rechaza("un futbolista normal no nace Idolo", plain,
            escribir.anadir_jugador, MARK, "Idolo (roja)")
    rechaza("un arquetipo que no existe", plain,
            escribir.anadir_jugador, MARK, None, "Ninguno")
    rechaza("a un Idolo no se le elige la rareza", plain,
            escribir.anadir_jugador, IDOLO, "Idolo (rosa)")
    p8 = acepta("crear un futbolista normal", plain,
                escribir.anadir_jugador, MARK, "Leyenda del futbol", "Tension")
    p9 = acepta("crear un Idolo (copia su rareza y arquetipo)", plain,
                escribir.anadir_jugador, IDOLO)
    comprobar("el nuevo sale entero al leerlo", jugador_coherente(p8),
              "%s" % (jugador_coherente(p8, True),))
    comprobar("el Idolo lleva la rareza que le toca, no la elegida",
              J.array(p9, J.ARRAY_RAREZA)[escribir._fila_libre_de_jugador(plain)] in (5, 6, 7))

    print("\nJudias y arquetipo (ya probados en el juego)")
    rechaza("mas judias de las que permite el nivel", plain,
            escribir.poner_judias, KING, 1, 999)
    rechaza("no se repite tipo de judia en dos ranuras", plain,
            escribir.poner_tipo_judia, KING, 3, "Potencia", 2)
    rechaza("un arquetipo que no existe", plain,
            escribir.poner_arquetipo, KING, "Ninguno")

    print("\nNada de lo rechazado toco la partida")
    comprobar("la partida de partida sigue intacta", plain == codec.load(PARTIDA))

    print()
    if fallos:
        print("FALLAN %d: %s" % (len(fallos), ", ".join(fallos)))
        return 1
    print("Todas las pruebas pasan.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
