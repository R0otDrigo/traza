// Contratos de NexoBIM (fase 0.2). Todo módulo nuevo (fuentes, suelo, IA, vigilante, panel) los respeta.
// Claves en ASCII (anio, descripcion, ubicacion) para evitar problemas de codificación entre TS, JSON, SQLite y C#.
import { z } from 'zod';

/** Quién hizo algo: va al registro de decisiones. */
export const Actor = z.enum(['ingeniero', 'IA', 'motor', 'revit', 'vigilante']);
export type Actor = z.infer<typeof Actor>;

const Fecha = z.string(); // ISO 8601

// ---------- Fuentes públicas (SEACE) ----------

export const Ubicacion = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  origen: z.enum(['utm_documento', 'geocodificado', 'manual']),
  precision_m: z.number().nonnegative(),
});
export type Ubicacion = z.infer<typeof Ubicacion>;

export const ObraPublica = z.object({
  id: z.string(),                  // id estable propio (p. ej. hash de entidad + nomenclatura)
  entidad: z.string(),
  nomenclatura: z.string(),        // nomenclatura del procedimiento en el SEACE
  anio: z.number().int(),
  objeto: z.string(),              // "Obra"
  descripcion: z.string(),
  urlFicha: z.string().url(),
  distrito: z.string().nullable(),
  ubicacion: Ubicacion.nullable(), // null hasta extraerla del EMS o geocodificarla
});
export type ObraPublica = z.infer<typeof ObraPublica>;

export const DocumentoEMS = z.object({
  obraId: z.string(),
  url: z.string().url(),
  archivoLocal: z.string(),        // ruta en data/fuentes/ (fuera de git)
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  paginas: z.number().int().nonnegative(),
  paginasEscaneadas: z.array(z.number().int().positive()),
  puntajeEMS: z.number(),          // detector: nombre de archivo + palabras clave de las primeras páginas
});
export type DocumentoEMS = z.infer<typeof DocumentoEMS>;

// ---------- Estudio de suelos extraído (cada dato con cita y aprobación) ----------

export const Cita = z.object({
  pagina: z.number().int().positive(),
  textoLiteral: z.string(),
  verificada: z.boolean(),         // el código comprobó que el texto existe en esa página
  motivo: z.string().optional(),   // p. ej. "no verificable"
});
export type Cita = z.infer<typeof Cita>;

export const EstadoCampo = z.enum(['propuesto', 'aprobado', 'corregido', 'rechazado']);

/** Un dato del EMS: valor + cita + estado de aprobación (ISO 19650: se aprueba antes de usarse). */
export const campo = <T extends z.ZodTypeAny>(valor: T) => z.object({
  valor: valor.nullable(),         // null si no se encontró o no se pudo verificar
  cita: Cita.nullable(),
  estado: EstadoCampo,
  por: Actor,                      // quién propuso o decidió el estado actual
  en: Fecha,
});

export const PerfilE030 = z.enum(['S0', 'S1', 'S2', 'S3']);
export const Riesgo = z.enum(['colapsable', 'expansivo', 'licuable', 'otro']);

export const Estrato = z.object({
  desde_m: z.number().nonnegative(),
  hasta_m: z.number().nonnegative(),
  SUCS: z.string(),                // GP, SM, ML, CL...
  descripcion: z.string(),
});

export const Calicata = z.object({
  id: z.string(),                  // C-1, C-2...
  utm: z.object({ este: z.number(), norte: z.number(), zona: z.literal('19S') }).nullable(),
  profundidad_m: z.number().nonnegative(),
  estratos: z.array(Estrato),
});
export type Calicata = z.infer<typeof Calicata>;

export const EstudioSuelo = z.object({
  obraId: z.string(),
  fecha: campo(z.string()),
  calicatas: z.array(campo(Calicata)),
  perfilE030: campo(PerfilE030),
  S_reportadoEMS: campo(z.number()),
  capacidadPortante_kgcm2: campo(z.number()),
  Df_m: campo(z.number()),
  tipoCimentacionRecomendada: campo(z.string()),
  nivelFreatico_m: campo(z.number()),        // valor null = no encontrado
  sulfatos_ppm: campo(z.number()),
  cloruros_ppm: campo(z.number()),
  salesSolubles_ppm: campo(z.number()),
  cementoRecomendado: campo(z.string()),
  riesgos: z.array(campo(Riesgo)),
  recomendacionesEMS: z.array(campo(z.string())),
});
export type EstudioSuelo = z.infer<typeof EstudioSuelo>;

export const ResultadoSuelo = z.object({
  lote: z.object({ lat: z.number(), lon: z.number() }),
  obrasCercanas: z.array(z.object({ obra: ObraPublica, distancia_m: z.number().nonnegative(), tieneEMS: z.boolean() })),
  estudioElegido: EstudioSuelo.nullable(),
  distancia_m: z.number().nonnegative().nullable(),
  S_motor: z.number().positive().nullable(),  // calculado por el motor (E.030), nunca por la IA
  S_fuente: z.string(),                       // p. ej. "EMS obra X (perfil S2, aprobado por ingeniero)" o "manual"
  advertencias: z.array(z.string()),
});
export type ResultadoSuelo = z.infer<typeof ResultadoSuelo>;

// ---------- Vigilante en vivo ----------

export const Dir = z.enum(['X', 'Y']);
export const Cumplimiento = z.array(z.object({ nivel: z.string(), dir: Dir, cumple: z.boolean() }));

export const EventoVigilante = z.object({
  en: Fecha,
  huellaAnterior: z.string(),
  huellaNueva: z.string(),
  cambios: z.array(z.string()),   // legibles: "muro 1245588: tipo KK soga 13 → KK cabeza 23"
  cumplimientoAntes: Cumplimiento,
  cumplimientoDespues: Cumplimiento,
});
export type EventoVigilante = z.infer<typeof EventoVigilante>;

export const Notificacion = z.object({
  nivel: z.string(),               // nivel del edificio ("Nivel 2")
  dir: Dir,
  tipo: z.enum(['deja_de_cumplir', 'vuelve_a_cumplir']),
  mensaje: z.string(),
  url: z.string(),                 // http://localhost:5173/#nivel=<n>&dir=<X|Y>
});
export type Notificacion = z.infer<typeof Notificacion>;

// ---------- Textos obligatorios ----------
export const AVISO_PROTOTIPO = 'Prototipo académico — requiere verificación y firma de un ingeniero colegiado';
export const AVISO_SUELO = 'Dato referencial de una obra pública cercana. No reemplaza el Estudio de Mecánica de Suelos del terreno exigido por la E.050.';
