// Distancia lote ↔ obra pública con EMS (haversine) y calidad de la referencia.
import type { ObraPublica } from '../contracts/index.ts';

export interface LatLon { lat: number; lon: number }
export const UMBRALES = { buena_m: 300, cautela_m: 1000 };

export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function calidad(d: number, u = UMBRALES): 'buena' | 'cautela' | 'lejana' {
  return d <= u.buena_m ? 'buena' : d <= u.cautela_m ? 'cautela' : 'lejana';
}

export function textoDistancia(d: number, u = UMBRALES): string {
  const m = Math.round(d);
  return {
    buena: `EMS a ${m} m del lote: buena referencia (≤ ${u.buena_m} m).`,
    cautela: `EMS a ${m} m del lote: usar con cautela (entre ${u.buena_m} m y ${u.cautela_m} m).`,
    lejana: `ADVERTENCIA FUERTE: EMS a ${m} m del lote (> ${u.cautela_m} m); el suelo puede ser distinto.`,
  }[calidad(d, u)];
}

/** Obras con ubicación conocida, de la más cercana a la más lejana. */
export function ordenarPorDistancia(lote: LatLon, obras: { obra: ObraPublica; tieneEMS: boolean }[]) {
  return obras.filter(o => o.obra.ubicacion)
    .map(o => ({ ...o, distancia_m: Math.round(haversine(lote, o.obra.ubicacion!)) }))
    .sort((a, b) => a.distancia_m - b.distancia_m);
}
