# Prompt maestro — TRAZA (Reto 2, Hackathon BIM + IA UNSA 2026)

> Copia todo el bloque de abajo en una sesión nueva de Claude Code abierta en `C:\Users\Koco_Ghost\Documents\bim-ia`.
> Requisitos previos: Node.js LTS instalado, `gh auth status` en OK y el plugin Ponytail instalado (sección final).

---

```text
/ponytail full

Contexto: lee docs/PLAN_RETO2.md completo antes de hacer nada. Es la fuente de verdad del proyecto TRAZA
(Hackathon BIM + IA UNSA 2026, Reto 2: IA para el cálculo estructural). No cambies el alcance sin preguntarme.

OBJETIVO DE ESTA SESIÓN
Construir el prototipo TRAZA: una app web 3D que lee un edificio aporticado de concreto armado (IFC o un generador
paramétrico), predimensiona y revisa losas aligeradas, vigas y columnas (E.020 / E.060, coeficientes en
src/engine/criteria.ts para que el ingeniero civil los ajuste), pinta el modelo como semáforo según el ratio,
muestra la traza completa de cada cálculo al hacer clic, pide la aprobación humana de cada hipótesis y genera una
memoria preliminar. La IA (Claude API) solo extrae datos, propone hipótesis, detecta inconsistencias y explica.
NUNCA calcula: los cálculos los hace el motor determinista.

REGLAS
- Ponytail: el código mínimo que resuelva la tarea completa, sin abstracciones especulativas ni dependencias
  innecesarias. Las respuestas son cortas y terminan con lo que no se verificó.
- Cada resultado del motor es un objeto { valor, unidad, formula, norma, inputs, estado }. Ningún número sale sin
  traza.
- Aviso visible y permanente: "Prototipo académico — requiere verificación y firma de un ingeniero colegiado".
- Los secretos van en .env (ANTHROPIC_API_KEY), con .env en .gitignore. Hay un modo offline con respuestas de IA
  cacheadas en /fixtures.
- Modelo de IA: claude-sonnet-5-5, salidas JSON validadas con Zod.
- Commits pequeños por hito. Repo privado en GitHub con `gh repo create traza --private`, pero pregúntame antes de
  hacer push.

STACK
Vite + TypeScript + Three.js (usa las skills threejs-* de .claude/skills), web-ifc o @thatopen/components para
el IFC, Vitest para el motor y lil-gui o un panel HTML propio. Sin backend salvo un proxy mínimo (Vite middleware o
un servidor Node pequeño) para no exponer la API key.

SUBAGENTES
Créalos como archivos en .claude/agents/*.md, cada uno con su descripción, herramientas y la regla de no tocar
archivos de otro agente:
1. arquitecto: crea el esqueleto del repo, los contratos de datos (src/types.ts: Edificio, Nivel, Eje, Elemento,
   ResultadoTrazable, Hipotesis) y la integración final. Es el único que edita types.ts.
2. bim-ifc: src/bim/ (parser IFC → JSON normalizado) y src/bim/parametric.ts (generador del edificio de prueba
   de 4 pisos, 3×3 paños de 5–6 m) como plan B. Exporta fixtures/edificio.json.
3. motor-estructural: src/engine/ (metrado por área tributaria, combinaciones 1.4CM+1.7CV, predim. de losa,
   viga y columna, chequeos de consistencia IFC vs. reglas). Funciones puras, 100 % testeadas con Vitest usando
   los valores del Excel de referencia (fixtures/referencia.csv). No inventa coeficientes: los lee de criteria.ts.
4. visor-3d: src/viewer/ (escena, ejes con etiquetas, animación de armado por piso, semáforo, polígonos de área
   tributaria, selección por clic, postprocesado moderado, rendimiento fluido en laptop). Skills: threejs-fundamentals,
   threejs-materials, threejs-lighting, threejs-interaction, threejs-animation, threejs-postprocessing,
   threejs-performance, threejs-loaders.
5. ia-asistente: src/ai/ (extractor de hipótesis desde el texto o PDF de especificaciones, revisor de
   inconsistencias, explicador en lenguaje natural, caché offline). Usa la skill claude-api.
6. ui-trazabilidad: src/ui/ (panel de hipótesis con Aprobar/Editar/Rechazar, panel de traza con fórmulas
   renderizadas con KaTeX, log de aprobaciones, panel de validación con gráfico TRAZA vs. Excel vs. ETABS y banda de
   tolerancia). Skills: frontend-design, dataviz.
7. qa-validacion: corre los tests, compara contra fixtures/referencia.csv, genera docs/VALIDACION.md (tabla de
   elemento, referencia, TRAZA, %dif, tolerancia, estado) y revisa con /ponytail-review antes de cada commit.
8. memoria-presentacion: genera la memoria preliminar (HTML imprimible a PDF con supuestos, normas, advertencias,
   límites y log) y la presentación ejecutiva (skill pptx o artefacto de slides).

ORDEN DE TRABAJO (hitos verificables)
H0 – Esqueleto del repo, types.ts, edificio paramétrico visible en 3D con ejes y niveles.
H1 – Motor: metrado y predim. con tests en verde contra la referencia.
H2 – Semáforo 3D + clic → panel de traza.
H3 – IFC real cargando el mismo JSON (si falla en 45 min, seguir con el paramétrico).
H3.5 – revit-bridge: script Dynamo/pyRevit que lee resultados.json (por GUID) y escribe los parámetros
       TRAZA_Ratio, TRAZA_Estado y TRAZA_Norma, más un filtro de vista con color en Revit.
H4 – IA: extractor de hipótesis con aprobación humana + detector de inconsistencias.
H5 – Validación + memoria + modo offline.
H6 – Pulido visual (animación de intro, postprocesado), presentación ejecutiva y guion de la demo.
Los subagentes independientes (bim-ifc, motor-estructural, visor-3d) corren en paralelo después de H0.
Al cerrar cada hito: muéstrame cómo correrlo y qué falta. Cuando haya UI, verifícala en el navegador integrado.

PRIMER PASO AHORA: ejecuta H0 y dime qué datos necesitas del ingeniero civil (Excel de referencia, coeficientes,
caso de prueba).
```

---

## Instalación pendiente (una sola vez)

1. **Node.js LTS** (necesario para Vite y para los hooks de Ponytail):
   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e --source winget
   ```
2. **Ponytail como plugin**, con los hooks y el contador de tokens. Envía estos dos mensajes por separado en el cuadro de Claude Code:
   ```
   /plugin marketplace add DietrichGebert/ponytail
   ```
   ```
   /plugin install ponytail@ponytail
   ```
   (Las skills `ponytail`, `ponytail-review` y `ponytail-audit` ya están copiadas en `.claude/skills`, así que funcionan aunque no instales el plugin.)
3. **Skills 3D**, ya instaladas en `.claude/skills/threejs-*` (repo `cloudai-x/threejs-skills`, MIT).
4. **GitHub CLI:** `gh auth status` debe decir *Logged in*.

## Skills que usará el proyecto
| Skill | Para qué |
|---|---|
| `ponytail`, `ponytail-review`, `ponytail-audit` | Código mínimo y menos tokens. Revisión antes de cada commit |
| `threejs-*` (13 skills) | Escena, materiales, luces, interacción, animación, postprocesado, rendimiento, carga de modelos |
| `frontend-design` | Dirección visual de los paneles y la UI |
| `dataviz` | Gráficos de validación (TRAZA vs. referencia) |
| `claude-api` | Integración correcta con Claude (modelos, JSON estructurado, caché de prompts) |
| `pptx` / artefacto de slides | Presentación ejecutiva |
| `pdf` | Leer el PDF de especificaciones del caso de prueba |
