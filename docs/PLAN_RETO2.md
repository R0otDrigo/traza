# TRAZA — Asistente de predimensionamiento y revisión estructural con BIM + IA

**Hackathon BIM + IA UNSA 2026 · Reto 2: IA para el cálculo estructural**
Jornada: sábado 28/11/2026, 08:00–19:00, Hub JAKU Emprende UNSA (presencial)

> Pregunta guía del reto: *¿Cómo usar IA para reducir tareas repetitivas y mejorar la revisión del cálculo estructural sin perder el control, la trazabilidad ni el juicio profesional del ingeniero?*

---

## 1. Resumen en un párrafo

TRAZA es una aplicación web 3D que lee un modelo BIM (IFC) de un edificio aporticado de concreto armado, extrae con IA la geometría, los usos y las cargas, y predimensiona y revisa automáticamente losas, vigas y columnas según las normas peruanas E.020, E.030 y E.060. La IA no calcula: interpreta datos, propone hipótesis, detecta inconsistencias y explica resultados. Los cálculos los hace un motor determinista y auditable donde cada número muestra su fórmula, la cláusula normativa y los datos de entrada. El modelo 3D se pinta como semáforo según el ratio de cada elemento (verde cumple, ámbar revisar, rojo no cumple). El ingeniero aprueba o rechaza cada hipótesis y cada resultado. Al final se genera una memoria preliminar trazable, comparada contra un cálculo manual de referencia y, si hay tiempo, contra ETABS/SAP2000, con tolerancias y divergencias declaradas.

---

## 2. Qué piden y cómo lo vamos a cumplir

| Lo que pide el reto | Cómo lo cubre TRAZA |
|---|---|
| Leer y organizar parámetros geométricos, cargas y datos estructurales de un caso de prueba | Importar IFC → árbol de elementos (vigas, columnas, losas, ejes, niveles) + extracción con IA de datos que no están en el IFC (uso, f'c, sobrecarga) desde un PDF o texto de especificaciones |
| Automatizar o asistir el predimensionamiento, el cálculo elemental, la revisión o las memorias | Motor de reglas de predimensionamiento + metrado de cargas por área tributaria + chequeos elementales (carga axial en columnas, peralte de vigas y losas) + memoria automática |
| Comparar con cálculos independientes o software de referencia, con tolerancias | Panel "Validación": TRAZA vs. Excel manual del ingeniero civil vs. ETABS (CSV importado), con % de diferencia y tolerancia (±5 %) |
| Informe de supuestos, fuentes, normas, advertencias y límites | Cada resultado lleva su hipótesis, fórmula, norma y estado de aprobación. La memoria incluye una sección de límites de uso |
| Sin perder el control ni el juicio profesional | Humano en el bucle: nada pasa a la memoria sin "Aprobar" del ingeniero, y queda un registro (log) de quién aprobó qué y cuándo |

### Rúbricas y nuestra estrategia

**Evaluación de propuestas (pre-selección, mínimo 60/100; se juzga por el video):**
- Integración de BIM e IA (25 pts, también es el primer desempate): el IFC es la fuente de datos y la IA cumple un papel concreto y visible (extraer, detectar, explicar). No es un chatbot pegado encima.
- Identificación del problema (20) y pertinencia (20): el ingeniero civil del equipo narra el dolor real (metrados repetitivos, criterios distintos entre proyectistas, revisión lenta).
- Innovación (20): un modelo 3D que *explica* el cálculo (clic en un elemento → fórmula, norma y cadena de cargas), además de detectar inconsistencias entre el modelo BIM y las reglas.
- Viabilidad (10): alcance acotado a un edificio aporticado de concreto armado y tres tipos de elemento.

**Evaluación final (jurado):** aplicación de BIM + IA 25 %, solidez técnica 20 %, pertinencia 20 %, innovación 15 %, viabilidad 10 %, presentación 10 %. *"Las propuestas exclusivamente conceptuales no reciben una valoración equivalente"*, así que el 28/11 hay que llegar con algo que funcione de punta a punta en un caso de prueba.

**Condición de seguridad técnica:** ningún resultado puede presentarse como diseño apto para ejecución. En la interfaz y en la memoria va siempre la frase *"Prototipo académico — requiere verificación y firma de un ingeniero colegiado"*.

---

## 3. Alcance delimitado (lo que SÍ y lo que NO)

**SÍ (MVP del 28/11):**
1. Edificio aporticado de concreto armado de 3 a 5 pisos, planta regular.
2. Predimensionamiento de:
   - **Losa aligerada en una dirección**: h ≈ Ln/25 (regla práctica).
   - **Vigas**: h ≈ Ln/10 a Ln/12, b ≈ 0.3h a 0.5h, b ≥ 25 cm (E.060).
   - **Columnas**: Ag = P_servicio / (n · f'c), con n ≈ 0.45 en columnas centrales y 0.35 en las de borde o esquina (criterio usual en Perú).
3. Metrado de cargas por área tributaria (CM, CV según E.020) y combinación 1.4CM + 1.7CV (E.060).
4. Revisor de consistencia: compara las secciones que vienen en el IFC con el predimensionamiento y marca las divergencias.
5. Visor 3D con semáforo, panel de trazabilidad y aprobación humana.
6. Memoria preliminar exportable (HTML/PDF/Markdown).
7. Validación contra el cálculo manual del ingeniero civil (Excel) en el mismo caso.

**NO (lo decimos explícitamente como "trabajo futuro"):**
- Análisis sísmico completo E.030 (como mucho, una estimación de la cortante basal estática como extra).
- Diseño de acero de refuerzo, cimentaciones, muros de corte, estructuras metálicas.
- Reemplazar ETABS/SAP2000: TRAZA es la etapa previa y el revisor.

> ⚠️ El ingeniero civil debe confirmar y ajustar todos los coeficientes anteriores (son reglas prácticas de libros como el de Blanco Blasco, no de la norma literal) y citar el artículo exacto de E.020/E.060 en cada caso.

---

## 4. Arquitectura

```
┌──────────────┐   ┌────────────────────┐   ┌───────────────────────┐
│ Modelo IFC   │──▶│ Parser BIM         │──▶│ Modelo estructural    │
│ (Revit/      │   │ (web-ifc /         │   │ normalizado (JSON):   │
│  Blender/    │   │  That Open)        │   │ ejes, niveles, vigas, │
│  generado)   │   └────────────────────┘   │ columnas, losas       │
└──────────────┘                            └──────────┬────────────┘
┌──────────────┐   ┌────────────────────┐              │
│ Especific.   │──▶│ IA – Extractor     │──hipótesis──▶│
│ PDF/texto    │   │ (Claude API, JSON  │  (pendientes │
└──────────────┘   │  con esquema)      │  de aprobar) │
                   └────────────────────┘              ▼
                                         ┌──────────────────────────┐
                                         │ Motor de cálculo         │
                                         │ DETERMINISTA (TS puro,   │
                                         │ con tests): metrado,     │
                                         │ predim., chequeos.       │
                                         │ Cada resultado = {valor, │
                                         │ fórmula, norma, inputs}  │
                                         └──────────┬───────────────┘
              ┌─────────────────────────────────────┼────────────────────┐
              ▼                                     ▼                    ▼
   ┌────────────────────┐             ┌──────────────────────┐  ┌──────────────────┐
   │ Visor 3D (Three.js)│             │ IA – Revisor/Explic. │  │ Validación vs.   │
   │ semáforo, clic →   │◀───────────▶│ detecta incongruen-  │  │ Excel / ETABS    │
   │ traza del cálculo  │             │ cias, explica en     │  │ (% de diferencia,│
   └────────────────────┘             │ lenguaje natural     │  │  tolerancias)    │
                                      └──────────────────────┘  └──────────────────┘
                                                    ▼
                                    ┌──────────────────────────────┐
                                    │ Aprobación humana + log      │
                                    │ → Memoria preliminar (PDF)   │
                                    └──────────────────────────────┘
```

**Principio clave para el jurado:** *la IA propone y explica; el motor determinista calcula; el ingeniero decide.* Esto responde directamente al "sin perder el control, la trazabilidad ni el juicio profesional".

### Revit en el flujo
Revit → exportar IFC (con GUID y material f'c) → TRAZA revisa → `resultados.json` → script Dynamo/pyRevit que escribe los parámetros `TRAZA_Ratio`, `TRAZA_Estado` y `TRAZA_Norma` y aplica un filtro de color en la vista. Así se cierra el ciclo BIM ↔ IA dentro de Revit (hito H3.5). TRAZA sigue funcionando sin Revit (openBIM).

### Stack
- **Frontend:** Vite + TypeScript + Three.js (o React Three Fiber), con lil-gui o un panel propio.
- **BIM:** `web-ifc` / `@thatopen/components` (lectura de IFC en el navegador). Plan B: un generador paramétrico del edificio en Three.js que exporta el mismo JSON, para que la demo no dependa de un IFC.
- **Motor de cálculo:** módulo TypeScript puro + Vitest (tests con los valores del Excel del ingeniero).
- **IA:** Claude API (modelo `claude-sonnet-5-5` para extraer y explicar; salidas JSON con esquema validado por Zod). Modo offline con respuestas cacheadas por si falla internet en el local.
- **Memoria:** HTML → PDF (impresión del navegador) o Markdown.
- **Caso de prueba:** un edificio de 4 pisos, 3×3 paños de 5–6 m, oficinas o vivienda, modelado en Revit o Blender BIM y exportado a IFC 2x3/IFC4.

---

## 5. Experiencia 3D (lo que se ve en la expo)

1. **Intro:** el edificio aparece en vista isométrica, armándose piso por piso (animación).
2. **Lectura BIM:** los elementos se resaltan por tipo mientras un panel cuenta "24 columnas, 48 vigas, 4 losas".
3. **IA extrae hipótesis:** tarjetas como "Uso: oficinas → CV = 250 kg/m² (E.020)", con los botones [Aprobar] / [Editar].
4. **Cálculo:** cada elemento cambia a verde, ámbar o rojo según su ratio. Las áreas tributarias de las columnas se dibujan como polígonos translúcidos en planta.
5. **Clic en una columna:** panel lateral con la cadena completa (áreas → cargas por piso → P → Ag requerida → sección propuesta vs. IFC), la fórmula renderizada y la cita normativa.
6. **Inconsistencias:** "La viga V-203 tiene h = 40 cm; con Ln = 6.2 m se esperan entre 52 y 62 cm" → el elemento parpadea en rojo.
7. **Validación:** gráfico de barras TRAZA vs. Excel vs. ETABS con la banda de tolerancia.
8. **Memoria:** botón "Generar memoria" → documento con log de aprobaciones.

Estética: fondo oscuro tipo plano técnico, retícula de ejes con etiquetas (A, B, C / 1, 2, 3), materiales semitransparentes, buen contraste en el semáforo, postprocesado suave (SSAO/bloom moderado), y que corra fluido en una laptop.

---

## 6. Plan de trabajo

### HOY, 24/11 (cierre de inscripción)
- [ ] Completar el formulario: 3 a 5 integrantes, ≥2 de pregrado UNSA, constancias de matrícula, Reto 2.
- [ ] **Video de máximo 3 minutos** (MP4 o enlace con acceso abierto) con: equipo → problema → solución → uso de BIM e IA → mejora esperada. Se puede grabar con el **mockup 3D conceptual** (visor con edificio paramétrico y semáforo simulado) más este plan narrado.

### 25–27/11 (antes de la jornada)
- [ ] El ingeniero civil prepara el caso de prueba y el **Excel de referencia** con el cálculo manual.
- [ ] Modelar el edificio y exportarlo a IFC; verificar que abre en un visor IFC.
- [ ] Preparar el esqueleto del repo, el visor 3D y el motor con tests. *(Confirmar con la organización si se permite llegar con código preparado; las bases piden que las soluciones sean originales y no prohíben el trabajo previo, pero conviene preguntar.)*
- [ ] Guion de la presentación ejecutiva.

### 28/11 (jornada, por bloques)
| Bloque | Objetivo |
|---|---|
| Apertura / Definición | Congelar el alcance y repartir roles |
| Desarrollo 1 | IFC → JSON → motor → semáforo funcionando de punta a punta |
| Mentoría | Validar criterios normativos con los mentores |
| Desarrollo 2 | IA (extractor y revisor), panel de trazabilidad, aprobación |
| Pruebas / validación | Comparar con el Excel y documentar tolerancias y límites |
| Presentación | Demo en vivo (con video de respaldo) y presentación ejecutiva |

---

## 7. Roles del equipo

| Rol | Responsabilidades |
|---|---|
| **Ingeniero civil (líder técnico estructural)** | Define el caso de prueba, las hipótesis, los coeficientes y las citas normativas. Hace el cálculo manual de referencia. Fija las tolerancias. Valida cada salida del motor. Narra el problema en el video y sustenta ante el jurado. *Es la "firma" del juicio profesional.* |
| **Dev 3D / frontend** | Visor Three.js, semáforo, paneles, animaciones. |
| **Dev BIM / datos** | Parser IFC, JSON normalizado, modelo de prueba, exportación. |
| **Dev IA / backend** | Prompts, esquemas JSON, extractor, revisor, caché offline, memoria. |
| **Presentación / QA** (o rol compartido) | Video, presentación, pruebas, registro de evidencias. |

---

## 8. Lo que hay que tener en cuenta

1. **Plazo:** la inscripción y el video cierran **hoy, 24/11**. La lista de admitidos sale el 25/11.
2. **Requisitos de admisión:** 3 a 5 integrantes, todos de pregrado, ≥2 de la UNSA, un solo reto, video ≤3 min con acceso habilitado.
3. **Funcionalidad sobre concepto:** en la final pesa más la demo real con un caso de prueba que las diapositivas.
4. **Trazabilidad:** cada número tiene que poder rastrearse hasta su entrada, su fórmula y su norma. Esto es el núcleo del reto.
5. **Seguridad técnica:** el aviso de "no apto para ejecución" debe estar en todas partes.
6. **Licencias y propiedad intelectual:** Three.js (MIT), web-ifc (MPL-2.0), That Open (MIT). Citar las normas sin copiar textos extensos. No usar planos de terceros sin autorización.
7. **Internet en el local:** tener un modo offline (respuestas de IA cacheadas) y un video de respaldo de la demo.
8. **API key de Claude:** cada equipo usa su propia clave en `.env`, que **no** se sube a GitHub.
9. **Hardware:** probar el visor 3D en la laptop que se va a usar para presentar.
10. **Riesgos:** IFC mal exportado (plan B: generador paramétrico), IA que inventa datos (validación con esquema y aprobación humana), alcance demasiado grande (congelarlo a las 10:00).

---

## 9. Entregables finales (según las bases)
1. **Prototipo/demostración:** la app web TRAZA.
2. **Presentación ejecutiva:** problema, solución, funcionamiento, tecnologías, resultados y mejoras.
3. **Sustento técnico:** datos de entrada, procedimientos, supuestos, limitaciones, normas y tabla de validación.
4. **Demostración funcional:** el caso de prueba de 4 pisos de punta a punta, con evidencia de las diferencias frente al Excel.

**Métrica de mejora a mostrar:** tiempo del predimensionamiento y metrado manual (lo mide el ingeniero civil con el Excel) contra TRAZA (minutos), número de inconsistencias detectadas y error medio frente a la referencia.
