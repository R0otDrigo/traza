// STUB fase 3: lo reemplaza la fase 2
import type { EstudioSuelo, Ubicacion } from '../contracts/index.ts';

export function utmALatLon(este: number, norte: number): { lat: number; lon: number } {
  throw new Error(`UTM → lat/lon no disponible todavía (fase 2): ${este}, ${norte}`);
}
export async function ubicarObra(_estudio: EstudioSuelo, _direccion?: string): Promise<Ubicacion | null> { return null; }
