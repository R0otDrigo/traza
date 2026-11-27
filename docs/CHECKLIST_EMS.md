# Checklist para probar un EMS real (fase 2)

Prototipo académico — requiere verificación y firma de un ingeniero colegiado.

## Cómo correrlo

```sh
# extracción (IA si hay ANTHROPIC_API_KEY en el entorno; si no, reglas) + ubicación
node --input-type=module -e "
import { leerPdf } from './src/suelo/pdf.ts';
import { extraerEstudio } from './src/ai/suelo.ts';
import { ubicarObra } from './src/suelo/ubicacion.ts';
const { paginas, escaneadas, noLegibles } = await leerPdf(process.argv[1]);
const r = await extraerEstudio('obra', paginas);
console.log({ escaneadas, noLegibles, modo: r.modo });
console.log(JSON.stringify(r.estudio, null, 1));
console.log(await ubicarObra(r.estudio, undefined, paginas));
" data/fuentes/<archivo>.pdf
```

- OCR: la primera vez tesseract descarga `spa.traineddata` (~3 MB) a `data/fuentes/ocr/`; el texto OCR de cada página queda allí (`<hash>-p<n>.txt`). Sin red ni caché, la página sale en `noLegibles`.
- Respuestas de la IA: caché en `fixtures/ai/suelo-<hash>.json` (permite repetir la demo sin red). Se borra para forzar una nueva consulta.
- Regenerar el fixture: `node fixtures/generar-ems.ts` (usa Edge con Playwright).

## Lectura del PDF

- [ ] Número de páginas igual al del visor de PDF.
- [ ] `escaneadas` = las páginas que realmente son imagen (planos, ensayos firmados, anexos escaneados).
- [ ] Abrir 1–2 páginas OCR en `data/fuentes/ocr/` y comparar con el PDF: números (comas/puntos), "kg/cm2", códigos SUCS.
- [ ] Si una página clave quedó en `noLegibles`, cargar el dato a mano (el ingeniero lo "corrige" en el panel).

## Campo por campo (valor, página, texto literal)

Para cada campo: abrir la página citada y confirmar que el texto literal está ahí y que dice ese valor.

- [ ] **fecha**: fecha del informe, no de un ensayo ni de un anexo.
- [ ] **perfilE030**: S0–S3 tal como lo escribe el EMS (no deducido del tipo de suelo).
- [ ] **S_reportadoEMS**: factor S escrito en el EMS. NexoBIM no lo usa directo: S lo calcula el motor (E.030) a partir del perfil y la zona.
- [ ] **capacidadPortante_kgcm2**: solo si el EMS la da en kg/cm². Si está en kPa o t/m², debe quedar null (la IA no convierte).
- [ ] **Df_m**: profundidad de cimentación recomendada, no la profundidad de la calicata.
- [ ] **tipoCimentacionRecomendada**: texto del EMS.
- [ ] **nivelFreatico_m**: número, o null con la cita "no se encontró nivel freático". Null sin cita = no se encontró nada: revisar.
- [ ] **sulfatos / cloruros / sales solubles (ppm)**: revisar unidades (ppm o mg/kg; si está en % debe quedar null).
- [ ] **cementoRecomendado**: tipo de cemento (I, II, V, MS, HS…).
- [ ] **calicatas**: id, UTM (este 6 cifras, norte 7 cifras, zona 19S declarada), profundidad y estratos con SUCS. Si las UTM están en otro datum (PSAD56), no deben usarse.
- [ ] **riesgos** (solo IA): colapsable/expansivo/licuable solo si el EMS lo afirma, no si lo descarta.
- [ ] **recomendacionesEMS**: una por recomendación, sin parafrasear.

## Citas y anti-invención

- [ ] Todo campo con `cita.verificada = false` tiene `valor = null` y `motivo = "no verificable"`.
- [ ] Ningún valor con cita verificada contradice el PDF (la verificación comprueba existencia del texto y del número, no el sentido).
- [ ] Comparar modo IA vs. reglas en el mismo PDF: diferencias = revisar a mano.
- [ ] Todos los campos quedan `estado = "propuesto"`; nada se usa hasta que el ingeniero aprueba.

## Ubicación

- [ ] `origen = "utm_documento"`: el punto cae en el distrito de la obra (verlo en el mapa del panel).
- [ ] `origen = "geocodificado"`: precisión baja (1 km); confirmar o fijar a mano (`manual`).
- [ ] Nominatim: máx. 1 pedido/s, User-Agent propio, caché en `data/fuentes/geocodificacion.json`.
