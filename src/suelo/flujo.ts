// Flujo de suelo (funciones puras): lote → obras cercanas → estudio → aprobación campo por campo → S del motor.
// Ningún número de la IA entra al cálculo: S_motor solo sale de un perfil APROBADO o CORREGIDO por el ingeniero.
import { EstudioSuelo, AVISO_SUELO, type EstadoSuelo, type ObraPublica, type ResultadoSuelo } from '../contracts/index.ts';
import { factorS, discrepanciaS, type Perfil } from './factorS.ts';
import { haversine, ordenarPorDistancia } from './cercania.ts';
import { advertenciasSuelo, vivo } from './advertencias.ts';

export type Accion = 'aprobar' | 'corregir' | 'rechazar';
const ESTADO = { aprobar: 'aprobado', corregir: 'corregido', rechazar: 'rechazado' } as const;

export const sueloVacio = (): EstadoSuelo => ({ lote: null, documento: null, estudio: null, resultado: null, modo: null });

/** Decisión del ingeniero sobre un campo (o un elemento de calicatas/riesgos/recomendacionesEMS con indice). */
export function decidirCampo(e: EstudioSuelo, campo: string, accion: Accion, valor?: unknown, indice?: number, en = new Date().toISOString()): EstudioSuelo {
  const copia: any = structuredClone(e);
  const x = campo === 'obraId' ? undefined : copia[campo];
  const c = Array.isArray(x) ? x[indice ?? -1] : x;
  if (!c || typeof c !== 'object' || !('estado' in c)) throw new Error(`Campo desconocido: ${campo}${indice !== undefined ? `[${indice}]` : ''}.`);
  if (!ESTADO[accion]) throw new Error(`Acción desconocida: ${accion}.`);
  if (accion === 'corregir') { if (valor === undefined) throw new Error('Corregir requiere un valor.'); c.valor = valor; }
  Object.assign(c, { estado: ESTADO[accion], por: 'ingeniero', en });
  return EstudioSuelo.parse(copia); // valida el valor corregido (p. ej. perfil S0..S3)
}

export function perfilDecidido(e: EstudioSuelo | null): Perfil | null {
  const p = e?.perfilE030;
  return p && (p.estado === 'aprobado' || p.estado === 'corregido') ? p.valor : null;
}

export function resultadoSuelo(s: EstadoSuelo, obras: { obra: ObraPublica; tieneEMS: boolean }[], zona: number | null, hoy = new Date()): ResultadoSuelo | null {
  if (!s.lote) return null;
  const est = s.estudio;
  const obra = est ? obras.find(o => o.obra.id === est.obraId)?.obra ?? null : null;
  const distancia_m = obra?.ubicacion ? Math.round(haversine(s.lote, obra.ubicacion)) : null;
  const perfil = perfilDecidido(est);
  const S_motor = perfil && zona ? factorS(zona, perfil) : null;
  const advertencias = advertenciasSuelo(est, {
    hoy, distancia_m, precision_m: obra?.ubicacion?.precision_m ?? null,
    discrepanciaS: S_motor && perfil ? discrepanciaS(S_motor, vivo(est!.S_reportadoEMS), perfil) : null,
  });
  if (est && distancia_m === null) advertencias.push('Ubicación de la obra del EMS desconocida: no se puede medir la distancia al lote.');
  if (perfil && !zona) advertencias.push('Z no corresponde a una zona de la E.030 Tabla 1: no se calcula S.');
  return {
    lote: s.lote, obrasCercanas: ordenarPorDistancia(s.lote, obras), estudioElegido: est, distancia_m, S_motor,
    S_fuente: S_motor ? `EMS ${obra ? `${obra.entidad} — ${obra.descripcion}` : est!.obraId} (perfil ${perfil}, ${est!.perfilE030.estado} por ingeniero; E.030 Tabla 3, zona ${zona})`
      : est ? 'sin perfil E.030 aprobado por el ingeniero' : 'sin estudio de suelos',
    advertencias,
  };
}

/** Prellena S con el del motor (sin aprobar: el ingeniero aprueba Z, U, S). */
export function conS<P extends { S: number; aprobados: boolean }>(p: P, r: ResultadoSuelo | null): P & { S_fuente: string } {
  if (!r?.S_motor) throw new Error('No hay S del motor: el ingeniero debe aprobar o corregir el perfil E.030 del estudio.');
  return { ...p, S: r.S_motor, S_fuente: r.S_fuente, aprobados: false };
}

/** Notas para el resultado de la verificación: qué S se usó y si el ingeniero sobrescribió el del motor. */
export function notasS(p: { S: number; S_fuente?: string }, s?: EstadoSuelo): string[] {
  const n = [`S = ${p.S} (${p.S_fuente ?? 'propuesto del caso, verificar con EMS'}).`];
  const Sm = s?.resultado?.S_motor;
  if (Sm && Sm !== p.S) n.push(`El ingeniero sobrescribió S: usa ${p.S} en lugar de S = ${Sm} del suelo de referencia.`);
  if (Sm) n.push(AVISO_SUELO);
  return n;
}
