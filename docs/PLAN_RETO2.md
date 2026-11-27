# NexoBIM — Verificador de densidad de muros E.070 dentro de Revit (BIM + IA)

**Hackathon BIM + IA UNSA 2026 · Reto 2: IA para el cálculo estructural**
Jornada: sábado 28/11/2026, 08:00–19:00, Hub JAKU Emprende UNSA (presencial)

> *¿Cómo podríamos usar IA para reducir tareas repetitivas y mejorar la revisión del cálculo estructural sin perder el control, la trazabilidad ni el juicio profesional del ingeniero?*

---

## 1. La idea en un párrafo

En Perú, la mayoría de viviendas y colegios de hasta 4 pisos son de **albañilería confinada**, y cada vez que arquitectura mueve una puerta o una ventana alguien tiene que volver a verificar a mano si quedan suficientes muros portantes en X y en Y (densidad mínima, **RNE E.070 Art. 19.2.b**: Σ L·t / Ap ≥ Z·U·S·N / 56). **NexoBIM** hace esa revisión **dentro de Revit** y la deja trazable:
1. Lee los muros, los vanos, los niveles y el área techada del modelo real.
2. Una **IA (Claude)** propone qué muros son portantes y cuáles son tabiques, y el **ingeniero aprueba** esa clasificación y los parámetros Z, U y S.
3. Un **motor determinista** calcula la densidad tramo por tramo: los vanos parten el muro, no cuentan los tramos menores de 1.20 m ni los espesores menores de h/20, y se revisa la continuidad vertical.
4. Revit se **pinta** con el resultado: muros que cuentan, muros que no cuentan, tabiques y opciones propuestas, más una losa de color por cada piso.
5. Se calculan **opciones de refuerzo** con su aporte exacto: convertir un tabique, engrosar un muro o realinear un muro desplazado. La IA las **ordena y las explica** según el impacto en la arquitectura.
6. El ingeniero las **simula al instante** y las **aplica en Revit con un clic**, y se puede deshacer con Ctrl+Z.

Todo queda en un **registro de decisiones** y en una **memoria preliminar** lista para firmar. Además, un servidor **MCP** permite hacer toda la revisión conversando con Claude, que opera Revit con herramientas verificables.

---

## 2. Qué pide el reto y cómo lo cumplimos

| Resultado sugerido por el reto | Cómo lo cumple NexoBIM |
|---|---|
| Lectura y organización de parámetros geométricos, cargas o datos estructurales | `revit/extraer_muros.cs` lee del modelo vivo los muros (eje, espesor, altura, tipo, material, bandera estructural), los vanos (puertas, ventanas y huecos) y el área de losas por nivel. |
| Automatización del predimensionamiento, el cálculo elemental, la revisión o las memorias | El motor E.070 calcula Σ L·t por nivel y dirección y genera opciones con su aporte. La memoria se genera sola. |
| Comparación con cálculos independientes o de referencia, con tolerancias | 19 tests contrastan el motor con el cálculo a mano del caso de prueba (por ejemplo, Σ L·t = 1.963 m² y requerido = 0.02875). Falta comparar con el **Excel del ingeniero civil** (pendiente). |
| Informe de supuestos, fuentes, normas, advertencias y límites | La memoria trae los criterios, los parámetros aprobados, la sustitución numérica, los motivos de exclusión de cada tramo, los límites de uso y el registro de decisiones. |
| Sin perder el control, la trazabilidad ni el juicio profesional | No se verifica sin la aprobación de Z, U, S y de los roles. La IA nunca calcula. Cada cambio en Revit requiere confirmación y se deshace con Ctrl+Z. Todo queda registrado indicando quién hizo cada cosa (ingeniero, IA, motor o Revit). |

### Encaje con las rúbricas

- **Aplicación de BIM + IA (25 %)**
  - Es BIM real: se lee y se escribe en Revit 2027 con MCP.
  - La IA tiene dos papeles concretos que se pueden evaluar: clasificar los muros (que hoy se hace "a ojo") y priorizar y explicar los refuerzos.
  - También hay un agente conversacional con herramientas deterministas.
- **Solidez técnica (20 %):**
  - motor puro con tests;
  - scripts C# compilados dentro de Revit;
  - el ciclo completo se probó en un modelo real: Nivel 1 X pasó de 1.963 a 3.713 m² (mínimo 3.68 m²) tras aplicar 2 opciones, tal como predijo el motor.
- **Pertinencia (20 %):** es el sistema estructural más común en Arequipa, y el problema (cada cambio de arquitectura obliga a repetir la verificación) es real y frecuente.
- **Innovación (15 %):**
  - un *what-if* instantáneo en el navegador;
  - el ciclo completo Revit → IA → motor → Revit;
  - opciones calculadas, no inventadas por la IA;
  - un agente MCP que opera el modelo con aprobación humana.
- **Viabilidad (10 %):**
  - funciona con cualquier modelo de Revit que tenga muros y losas;
  - el alcance está acotado a la densidad mínima;
  - si no hay API key, cae a reglas deterministas sin romperse.

**Condición de seguridad técnica:** en el panel, en la memoria y en los comentarios de Revit aparece siempre *"Prototipo académico — requiere verificación y firma de un ingeniero colegiado"*.

---

## 3. Arquitectura

```
 Revit 2027 (modelo vivo)
   ▲   │  rvt-mcp (add-in + servidor MCP, Apache-2.0)
   │   ▼
 revit/*.cs  ── scripts C# FIJOS: extraer · crear caso · pintar · aplicar opción
   ▲   │
   │   ▼
 src/revit/bridge.ts ──► src/pipeline.ts (orquestador + registro de decisiones)
                              │            │                 │
                              ▼            ▼                 ▼
                 src/ai/asistente.ts   src/e070/engine.ts   src/report/memoria.ts
                 IA: clasifica muros,  MOTOR DETERMINISTA:  memoria trazable
                 ordena y explica      tramos, Σ L·t, Z·U·S·N/56,
                 (Claude, salidas JSON continuidad, opciones
                 validadas; respaldo   con aporte exacto
                 por reglas)
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
   Panel web (Vite, :5173)              Servidor MCP "nexobim" (mcp/nexobim-server.ts)
   3D + barras + simulación             El ingeniero conversa con Claude, que
   + aprobaciones + aplicar             usa herramientas verificables
```

**Regla de oro:** *la IA propone y explica, el motor calcula, el ingeniero decide y Revit refleja.*

### Archivos clave
| Archivo | Qué hace |
|---|---|
| `src/e070/engine.ts` | Verificación E.070 y opciones (funciones puras) |
| `src/e070/engine.test.ts` | Casos calculados a mano |
| `src/e070/caso.ts` | Caso de prueba (vivienda de 4 pisos con errores reales) |
| `revit/*.cs` | Lectura y escritura en Revit (compilados en Revit 2027) |
| `src/ai/asistente.ts` | Clasificación y explicación con Claude, con respaldo por reglas |
| `src/pipeline.ts` | Flujo, aprobaciones y registro de decisiones (`public/live/estado.json`) |
| `index.html` + `src/app/*` | Panel de control 3D |
| `src/report/memoria.ts` | Memoria preliminar imprimible |
| `mcp/nexobim-server.ts` + `.claude/skills/nexobim-e070` | Agente conversacional |
| `porticos.html` | Concepto anterior (pórticos de concreto), queda como "módulo 2" |

---

## 4. Caso principal: Municipalidad — Plaza de Armas de Arequipa (SIMULACIÓN)
Planta **simulada** inspirada en el Palacio Municipal del Portal Municipal. **No es el plano real ni su sistema estructural real** (los edificios históricos de la plaza son de sillar sin confinar, y la E.070 no les aplica tal cual). Es un edificio de albañilería confinada con esa organización espacial, pensado para mostrar problemas reales de los edificios con portales:
- **Geometría:** frente de 30 m hacia la plaza, portal de 8 arcos de 3 m, galería de 4 m, patio central de 12 × 8 m, 3 pisos de 3.0 m. Ap = 30·24 − 12·8 = 624 m².
- **Parámetros propuestos (los aprueba el ingeniero):** Z = 0.35, U = 1.5 (sede de gobierno, categoría A2: **verificar**), S = 1.0 (grava, S1: verificar con EMS). Requerido = 0.028125, es decir Σ L·t ≥ 17.55 m² por dirección.
- **Lo que detecta NexoBIM:**
  1. Los 9 pilares del portal miden 0.67 m, menos de 1.20 m, así que **no cuentan**.
  2. La fachada de los pisos 2 y 3 se apoya sobre los arcos, así que **no tiene continuidad vertical**.
  3. Los muros interiores de soga (13 cm) con h = 3.0 m tienen **t < h/20 = 0.15 m**.
  4. La arquería tiene un tipo de muro ambiguo, y **el ingeniero debe decidir su rol** (la IA lo marca como "desconocido").
- **Resultado:**
  - X: Σ L·t = 14.49 m² en los 3 niveles, menos de los 17.55 requeridos, así que **no cumple** (faltan 3.06 m²).
  - Y: 22.908 m², así que **cumple**.
- **Plan mínimo:** engrosar a 23 cm los dos muros del eje 10 (MX-10A y MX-10B): +2 × 2.07 = 4.14 m². Con eso cumplen todos los niveles.
- **Tests:** `src/e070/municipalidad.test.ts`, con 7 casos calculados a mano.

## 4b. Caso secundario: vivienda de 4 pisos (Arequipa)
Vivienda multifamiliar de 4 pisos en un lote de 8 × 16 m (Ap = 128 m²). Muros de cabeza de 23 cm en Y (medianeras) y muros de soga de 13 cm en X. Z = 0.35 (zona 3), U = 1.0 (vivienda), S = 1.15 (S2), de modo que se requiere 0.02875 (Σ L·t mínimo = 3.68 m²).

Problemas que incluye, todos típicos de obra:
1. **Dirección X débil:** la fachada tiene vanos grandes. Σ L·t en X = 1.963 m², menos que los 3.68 m² requeridos.
2. **Un muro de 1.0 m** que no cuenta, porque es menor de 1.20 m.
3. **Pisos 3 y 4:** arquitectura movió el muro interior del eje 6 al eje 7, así que no tiene continuidad vertical y no cuenta.

**Solución mínima que propone NexoBIM:**
- **Piso 1:** convertir el tabique del eje 11 (+1.04 m²) y engrosar el muro interior a 23 cm (+0.71 m²). Resultado: 3.713 m², cumple.
- **Pisos 3 y 4:** además, **devolver el muro al eje 6** (+0.923 m²).

---

## 5. Guion de la demo (5 minutos)
1. **Problema (40 s):** el ingeniero civil cuenta cuánto se demora repetir la verificación cada vez que cambia la arquitectura.
2. **Revit:** el edificio está abierto. En el panel se pulsa **"Leer modelo de Revit"**. La IA clasifica los 28 muros y muestra la razón de cada uno, y el ingeniero corrige uno y aprueba Z, U y S.
3. **"Verificar y pintar Revit":** Revit se pinta (rojo: no cuenta; azul: opción propuesta) y el panel muestra los pisos 2–4 en rojo en la dirección X.
4. **Clic en el muro rojo del piso 3:** aparece *"sin continuidad vertical"*. El ingeniero lo explica.
5. **"Simular plan mínimo":** las barras se ponen en verde al instante, sin tocar Revit.
6. **"Aplicar en Revit"** sobre dos opciones: el modelo cambia (tipo de muro y posición), se vuelve a verificar y el registro muestra quién hizo qué.
7. **Memoria:** se abre el PDF con la fórmula sustituida, los motivos de exclusión y la línea de firma del ingeniero.
8. **Opcional, el efecto "wow":** en Claude Code se escribe *"¿cumple el edificio? propón el refuerzo de menor impacto, sin tocar la fachada"* y el agente usa las herramientas `nexobim_*`.

Plan B: video grabado de la demo y `estado.json` guardado, para que el panel funcione sin Revit.

---

## 6. Lo que hay que tener en cuenta

1. **Ingeniero civil:**
   - validar los criterios de `src/e070/engine.ts` (L ≥ 1.20 m, t ≥ h/20, criterio de continuidad, uso de Ap) y las citas normativas;
   - preparar el **Excel de referencia**;
   - confirmar Z, U y S con la E.030 vigente;
   - definir cómo tratar las placas de concreto (t·Ec/Em, no implementado).
2. **API key de Claude:** sin `ANTHROPIC_API_KEY` el sistema funciona con reglas, pero para mostrar IA de verdad hay que ponerla en `.env` o en el entorno. **No se sube al repo.**
3. **Revit en la laptop de la demo:**
   - Revit 2027 con el add-in rvt-mcp instalado;
   - iniciar RvtMcp desde Complementos;
   - probar en esa máquina un día antes.
4. **Código previo:** las bases no prohíben llegar con código preparado, pero conviene confirmarlo con la organización. El día 28 se pueden desarrollar las mejoras de la sección 8.
5. **Licencias:** Three.js (MIT), rvt-mcp (Apache-2.0), MCP SDK (MIT), Anthropic SDK (MIT). El modelo de prueba es propio.
6. **Video de inscripción** (vence el 24/11): problema → esta solución → uso de BIM e IA → mejora esperada (minutos frente a horas, menos errores de criterio).

---

## 7. Cómo ejecutarlo
```powershell
npm install
npm test                 # motor E.070 (19 tests)
npm run dev              # panel en http://localhost:5173
node scripts/nexobim.ts leer | params 0.35 1 1.15 | aceptar | verificar | aplicar <id>   # CLI
node scripts/compilar-cs.ts   # compila los scripts C# dentro de Revit (sin ejecutar)
```
En Revit: abrir un proyecto, ir a Complementos → RvtMcp → iniciar. Para la demo, en un proyecto vacío, pulsar "0 · Crear caso de prueba".

---

### Prueba real realizada (24/11, Revit 2027.4)
Todo esto se hizo desde el panel, con clics:
1. Se creó un proyecto nuevo con la Municipalidad: 54 muros, 3 niveles + techo, portal de 8 arcos y patio.
2. Se leyó el modelo: el área de 624 m² se leyó de las losas de Revit, con el patio descontado.
3. Se aprobaron Z, U, S y la clasificación.
4. Se verificó: X = 14.49 m² (no cumple) e Y = 22.908 m² (cumple), igual al cálculo manual.
5. Revit se pintó con los resultados.
6. Se aplicaron 6 opciones en Revit. El ejemplo de Nivel 1 X: 14.49 → 16.56 → 18.63 m². Al final **cumplen los 3 niveles**.
7. Se guardó el `.rvt` y se generó la memoria.

Después se probó el **agente MCP** contra el mismo modelo: leyó, verificó y confirmó que cumple. Revit registró 18 operaciones, 0 fallidas.

### Notas de operación
- Revit atiende **a un cliente a la vez** (el panel, la CLI o el agente MCP). Al cerrar uno, el siguiente debe esperar ~1 min.
- Si Revit tiene un comando activo (por ejemplo "Colocar muro") o un diálogo abierto, no acepta órdenes: hay que presionar Esc.
- Con dos Revit abiertos, NexoBIM usa el que tiene un proyecto abierto. Para forzar uno, ejecuta `$env:NEXOBIM_REVIT_PID = "<pid>"` antes de `npm run dev`.
- La primera vez se crea `modelos/_base-vacio.rvt` (tarda ~1 min). Después, cada caso nuevo se crea en segundos.

## 8. Siguientes pasos (para el 28/11)
- [ ] Excel del ingeniero y tabla de validación (`docs/VALIDACION.md`).
- [ ] Probar con un modelo de vivienda real del equipo o de un proyecto académico.
- [ ] Botón propio en la cinta de Revit (ToolBaker de rvt-mcp) para lanzar la verificación sin salir de Revit.
- [ ] Revisión en vivo: volver a verificar automáticamente cuando cambia un muro.
- [ ] Verificación de esfuerzo axial (E.070 Art. 19.1.b) como segundo chequeo.
