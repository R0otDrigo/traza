// STUB fase 3: lo reemplaza la fase 2
import type { EstudioSuelo } from '../contracts/index.ts';

export async function extraerEstudio(obraId: string, paginas: string[]): Promise<{ estudio: EstudioSuelo; modo: 'IA' | 'reglas' }> {
  throw new Error(`Extracción del EMS no disponible todavía (fase 2): ${obraId}, ${paginas.length} páginas`);
}
