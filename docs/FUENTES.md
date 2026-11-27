# Fuentes públicas: obras y Estudios de Mecánica de Suelos (fase 1)

Módulo `src/fuentes/`. Busca obras de las municipalidades de Arequipa Metropolitana en el SEACE, lista sus documentos,
descarga los candidatos a EMS, los puntúa y los guarda en un índice SQLite local (`data/fuentes/indice.db`, fuera de git).
Relevado el 27/11/2026. Ningún dato sale de la IA: todo es lectura de portales públicos.

## Comandos

```bash
node scripts/nexobim.ts suelo:buscar --entidad "PROVINCIAL DE AREQUIPA" --anios 2024 --max 3   # automático (Edge visible)
node scripts/nexobim.ts suelo:buscar --entidad todas --anios 2018-2026                          # las 18 entidades
node scripts/nexobim.ts suelo:descargar [--obra <id>] [--max-mb 60]   # candidatos a EMS de las fichas procesadas
node scripts/nexobim.ts suelo:indexar                                  # re-puntúa lo descargado
node scripts/nexobim.ts suelo:ubicar [--obra <id>]                     # coordenadas desde INFObras
node scripts/nexobim.ts suelo:cercanos --lat -16.40 --lon -71.53       # haversine local
node scripts/nexobim.ts suelo:asistido                                 # una persona navega; se capturan fichas y descargas
node scripts/nexobim.ts suelo:manual --pdf ems.pdf --url <origen> --lat <lat> --lon <lon> --entidad "<nombre>" [--nomenclatura --anio --descripcion --precision]
node scripts/nexobim.ts suelo:estado
```

Todo es reanudable: `suelo:buscar` salta las fichas ya procesadas y `suelo:descargar` solo baja archivos en estado `pendiente`.
Variables: `NEXOBIM_FUENTES` (carpeta de caché/índice), `NEXOBIM_MAX_MB` (límite de descarga, 60 por defecto).

API para otras fases (`src/fuentes/indice.ts`): `listarObras()`, `documentosEMS(obraId)`, `guardarObra(o)`,
`guardarDocumento(d)`, `actualizarUbicacion(obraId, u)`. Una obra `tieneEMS` si algún documento tiene puntaje ≥ 10 (`UMBRAL_EMS`).

## SEACE — Buscador Público (JSF/PrimeFaces)

URL: `https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml` (prod1 tiene el mismo path).

- **Pestañas**: Anuncio de Contratación Futura · **Buscador de Procedimientos de Selección** (la que usamos) · Expresiones de
  Interés · Difusión de Requerimientos · Órdenes de Compra y de Servicio · Condiciones de Contratación.
- **Formulario** (procedimientos): Nombre o Sigla de Entidad (se elige con la lupa: diálogo "Buscar Entidad" con Nombre / RUC /
  Sigla, hasta 300 coincidencias, clic en el nombre), Tipo de Selección, **Objeto de Contratación** (Bien, Consultoría de Obra,
  **Obra**, Servicio), Nro. Selección, Descripción del Objeto, **Año de la Convocatoria** (obligatorio, 2004–2026), Versión SEACE
  (Seace 3 por defecto; Seace 2 para procesos antiguos), Código SNIP, CUI. "Búsqueda Avanzada" agrega departamento/provincia/distrito.
- **Verificación**: el botón Buscar visible (`btnBuscarSelToken`) obtiene un token **reCAPTCHA Enterprise invisible** y dispara el
  botón oculto `btnBuscarSel`. En las pruebas no apareció ningún desafío. Si aparece (iframe `bframe` visible) o un "código de
  verificación", el script **no lo resuelve**: avisa en consola y espera a que una persona lo resuelva en la ventana.
- **Sincronización**: se espera la respuesta AJAX por `javax.faces.source` y luego a que PrimeFaces reemplace el elemento marcado
  (la respuesta llega antes que el cambio del DOM). El diálogo de entidades carga su lista inicial por AJAX y puede pisar lo
  escrito: se reintenta hasta ver la entidad. Pausas de 2–3 s entre pedidos.
- **Resultados**: tabla `dtProcesos` (N°, Entidad, Fecha y Hora de Publicación, Nomenclatura, Reiniciado Desde, Objeto,
  Descripción, SNIP, CUI, VR/VE, Moneda, Versión, Acciones). Paginación PrimeFaces (10/15/20 por página, botones
  primero/anterior/siguiente/último). Ejemplo: Municipalidad Provincial de Arequipa, Obra, 2024 → 5 procedimientos.
- **Ficha**: el ícono "Ficha de selección" (`grafichaSel`) hace un submit completo a
  `fichaSeleccion/fichaSeleccion.xhtml?id=<uuid>&ptoRetorno=LOCAL`. **Ese id depende de la sesión** (abrirlo en otra sesión no
  muestra la ficha), así que para volver a la tabla se repite la búsqueda. `urlFicha` guarda ese enlace como referencia.
  La ficha trae información general, cronograma y la tabla **Lista de Documentos** (`dtDocumentos`, 5 por página: Bases
  Administrativas, Pliego de absolución, Bases Integradas, ofertas, evaluación, buena pro) y el enlace **"Ver Expediente Técnico de
  Obra"** → `fichaArchivoExpedienteTecnicoObra.xhtml`, con 4 secciones en la misma página: aprobación, índice, memoria,
  especificaciones, planos, metrados, presupuesto, ACU, insumos, cronograma, fórmula polinómica, **Estudios Técnicos** (con
  "Nombre del estudio", p. ej. "ESTUDIO DE SUELOS - TOPOGRÁFICO - TRÁNSITO"), riesgos, gastos generales, disponibilidad del
  terreno y **Otros documentos** (suele ser el expediente completo en .rar de 50–60 MB).
- **Descargas**: cada enlace llama a `descargaDocGeneral('<uuid>','3',nombre)` → `jsCmsSeaceUtil.descargaPriv(uuid)`: un GET JSONP
  público a `https://alfprod.seace.gob.pe/alfresco/service/osce/downloadDoc?id=<uuid>&doc=<callback>&guest=false` devuelve
  `downloadUrl` (con ticket temporal) y se descarga de `alfprod` (result 200) o `prodcont2` (201). El módulo usa ese mismo
  mecanismo con `fetch` (sin navegador), con reintentos y backoff, límite de tamaño y sha256. Se cita el documento con la URL
  estable `…/downloadDoc?id=<uuid>` (y `#ruta/interna` si viene de un comprimido).
- **Comprimidos**: `C:\Windows\System32\tar.exe` (bsdtar 3.8) descomprimió bien un .rar real del SEACE. Si falla, el archivo
  queda en estado `pendiente_descompresion` (7-Zip no está instalado).

## Entidades (`data/fuentes/entidades.json`)

Nombres exactos confirmados en el diálogo del SEACE, con RUC. Ojo con: "MUNICIPALIDAD DISTRITAL DE LA VILLA DE CAYMA",
"MUNICIPALIDAD DISTRITAL DE JACOBO HUNTER", "MUNICIPALIDAD DISTRITAL DE MIRAFLORES - AREQUIPA" y que "YURA" también encuentra
Yuracmarca, Pucyura y Yuracyacu (se elige por nombre exacto).

## Detector de EMS (`src/fuentes/ems.ts`)

Puntaje = nombre/etiqueta (sección + nombre del estudio: "mecánica de suelos", "estudio de suelos", "geotecnia" → 10; "suelo",
"calicata", "capacidad portante" → 6; "estudios técnicos/básicos" → 3) + texto de las 15 primeras páginas con pdfjs
("mecánica de suelos" 5, "estudio de suelos" 4, "capacidad portante/admisible" 4, "calicata" 3, "E.050" 3, "perfil de suelo" 3,
"SUCS" 2, granulometría/límites/nivel freático 1; tope de 3 apariciones por clave). `paginasEscaneadas` = páginas con < 30
caracteres de texto. Se guardan solo documentos con puntaje > 0.

**Hallazgo de la prueba real**: los 4 PDF de "Estudios Técnicos" descargados (167, 227, 17 y 303 páginas) son **100 % escaneados**
(sin fuentes, solo imágenes): el texto no aporta y el puntaje sale de la etiqueta del SEACE. Para leer los datos del EMS hará
falta OCR (tesseract.js ya está instalado) en la fase de extracción.

## INFObras (Contraloría) — ubicación

Sí da coordenadas, mediante la API JSON pública que usa su mapa (`https://infobras.contraloria.gob.pe/InfobrasWeb/Mapa/...`):

- `MapaEstadistico/BusquedaSimple?nombre=<frase>&codigo=&valor=&estado=&orderBy=en_ejecucion&pageNumber=1&pageSize=20` →
  `Result[]` con `Codigo` (INFObras), `CUI`, `NombreObra`, `Ubicacion` (dirección), `Estado`. Busca la frase literal.
- `MapaEstadistico/GraficarObraMapa?param='<codigo>','<codigo>'` → `{Codigo, Latitud, Longitud}`. **Los campos vienen
  intercambiados** ("Latitud" trae la longitud); el código ordena por magnitud (en el Perú |lat| < 19 < 68 < |lon|).
- Ficha pública: `Mapa/Sumario?ObraId=<codigo>`. Datos abiertos (XLS nacional de obras) en `InfobrasWeb/DataSets` (no descargado).

`suelo:ubicar` toma el lugar de la descripción del SEACE ("EN EL PARQUE LAS CONDES URB. LA PERLA"), consulta INFObras, exige
"AREQUIPA" en el nombre y ≥ 50 % de palabras coincidentes, y guarda `origen: 'geocodificado'`, `precision_m: 500` (la
precisión real de INFObras no está documentada). Prueba: 3 de 5 obras ubicadas.

## Buscador Público de Contratos (mapa interactivo del SEACE)

No se pudo relevar en esta sesión. Para la ubicación, INFObras resolvió la necesidad.

## Modos

- **Automático** (`suelo:buscar` + `suelo:descargar`): descrito arriba.
- **Asistido** (`suelo:asistido`): abre Edge en el buscador; cada vez que la persona abre una ficha o el expediente técnico se
  guardan la obra y sus archivos, y cada descarga se guarda en la caché, se asocia a la última ficha vista y se puntúa. Sirve
  también si el SEACE pide un captcha. Termina al cerrar el navegador.
- **Manual** (`suelo:manual`): un PDF de EMS conseguido por otra vía, con su origen y coordenadas.
