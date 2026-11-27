// Advertencias del suelo de referencia. Conservador: usa todo dato no rechazado (aunque aún no esté aprobado).
import { AVISO_SUELO, type EstudioSuelo } from '../contracts/index.ts';
import { textoDistancia, UMBRALES } from './cercania.ts';

export const LIMITES = { aniosEMS: 10, freatico_m: 3, precision_m: 500 };

type Campo<T> = { valor: T | null; estado: string };
/** Valor del campo si no fue rechazado por el ingeniero. */
export const vivo = <T>(c: Campo<T>): T | null => (c.estado === 'rechazado' ? null : c.valor);

export interface Contexto { hoy: Date; distancia_m: number | null; precision_m: number | null; discrepanciaS: string | null }

export function advertenciasSuelo(e: EstudioSuelo | null, c: Contexto, lim = LIMITES, umbrales = UMBRALES): string[] {
  const a = [AVISO_SUELO];
  if (!e) return a;
  for (const r of new Set(e.riesgos.map(vivo).filter(Boolean))) a.push(`El EMS reporta suelo ${r}: requiere tratamiento según el EMS y la E.050.`);
  const anio = Number(vivo(e.fecha)?.match(/(19|20)\d{2}/)?.[0]);
  if (anio && c.hoy.getFullYear() - anio > lim.aniosEMS) a.push(`EMS de ${anio}: más de ${lim.aniosEMS} años de antigüedad.`);
  const nf = vivo(e.nivelFreatico_m);
  if (nf !== null && nf <= lim.freatico_m) a.push(`Nivel freático alto: ${nf} m (≤ ${lim.freatico_m} m).`);
  if (c.distancia_m !== null) a.push(textoDistancia(c.distancia_m, umbrales));
  if (c.precision_m !== null && c.precision_m > lim.precision_m) a.push(`Ubicación de la obra poco precisa (± ${Math.round(c.precision_m)} m > ${lim.precision_m} m).`);
  if (c.discrepanciaS) a.push(c.discrepanciaS);
  return a;
}
