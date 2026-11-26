# Pitch NexoBim · 2 min 50 s · por diapositiva

Presentan Rodrigo y José. Unas 430 palabras a ritmo normal de exposición; los tiempos son una guía. Cada bloque también está en las notas del orador de su diapositiva.

| Diapositiva | Quién | Tiempo |
|---|---|---|
| 1 · Portada | Rodrigo | 0:00 – 0:07 |
| 2 · Equipo | Rodrigo | 0:07 – 0:22 |
| 3 · El problema | José | 0:22 – 1:00 |
| 4 · La solución | Rodrigo | 1:00 – 1:45 |
| 5 · BIM e IA | Rodrigo | 1:45 – 2:08 |
| 6 · Resultado | José | 2:08 – 2:50 |

---

## 1 · Portada · Rodrigo (0:00 – 0:07)

Buenas tardes. Somos NexoBim, un copiloto sísmico para Revit.

## 2 · Equipo · Rodrigo (0:07 – 0:22)

Yo soy Rodrigo Estefanero, de Ingeniería de Sistemas, y conmigo está José Fernando Arango, de Ingeniería Civil. El equipo lo completa Christian Taipe, también de Sistemas. Elegimos el Reto 2: IA para el cálculo estructural.

## 3 · El problema · José (0:22 – 1:00)

En Arequipa, la mayoría de viviendas y colegios de hasta cuatro pisos son de albañilería confinada. La norma E.070 exige una densidad mínima de muros en cada dirección, según la zona, el uso, el suelo y el número de pisos.

La fórmula es corta. Lo que toma tiempo es decidir qué muro es portante, descontar puertas y ventanas, descartar los tramos de menos de 1.20 metros y revisar la continuidad entre pisos. Y cada vez que arquitectura mueve una ventana, hay que volver a hacerlo a mano. Además, en muchas viviendas no se estudia el suelo y el factor S se asume.

## 4 · La solución · Rodrigo (1:00 – 1:45)

Empezamos por el suelo: la idea es que la IA busque obras públicas cercanas en el portal del OSCE y tome de sus estudios un perfil de suelo referencial; esa parte está en desarrollo. Luego NexoBim lee el diseño en Revit: los muros, los vanos, los niveles y el área de cada losa.

La IA propone qué muros son portantes y explica por qué. Después la propuesta va al ingeniero, que responde sí o no. Si dice que no, corrige los roles o los parámetros sísmicos y lo vuelve a enviar; si dice que sí, recién se calcula.

Un motor de cálculo, sin IA y probado contra cálculos a mano, verifica tramo por tramo y pinta el modelo en Revit: verde lo que cuenta, rojo lo que no. Si falta muro, propone opciones con su aporte exacto, que se simulan y se aplican en Revit con un clic.

## 5 · BIM e IA · Rodrigo (1:45 – 2:08)

El modelo BIM es la fuente de datos y donde se ven los resultados. La IA tiene tareas acotadas: clasificar muros cuando los nombres del modelo no ayudan y ordenar las opciones según el impacto en la arquitectura. Ningún número sale de la IA. Y el ingeniero puede preguntarle a un agente si el edificio cumple.

## 6 · Resultado · José (2:08 – 2:50)

¿Qué esperamos lograr? Primero, ahorrar tiempo y retrabajo: que la verificación sísmica pase de horas a segundos cada vez que arquitectura cambia un vano o un tabique, sin volver a contar muros en planos 2D.

Segundo, detectar temprano la falta de densidad de muros en viviendas y colegios de hasta cuatro pisos, en una ciudad sísmica como Arequipa. En la siguiente versión sumaremos la irregularidad por torsión en planta.

Y tercero, un reporte auditable, con el antes y el después de cada recomendación, que ayude al proyectista a decidir y a la municipalidad a pre-revisar expedientes. Todo queda listo para que un ingeniero colegiado lo revise y lo firme. Gracias.
