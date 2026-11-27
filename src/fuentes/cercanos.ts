// Obras del índice cercanas a un punto (haversine local; la fase 3 tiene la oficial).
import { listarObras } from './indice.ts';

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180, R = 6371000;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const cercanos = (lat: number, lon: number, max = 10) => listarObras()
  .filter(x => x.obra.ubicacion)
  .map(x => ({ ...x, distancia_m: Math.round(haversine(lat, lon, x.obra.ubicacion!.lat, x.obra.ubicacion!.lon)) }))
  .sort((a, b) => a.distancia_m - b.distancia_m).slice(0, max);
