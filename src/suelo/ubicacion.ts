// Ubicación de la obra: UTM WGS84 zona 19S del EMS (calicatas o memoria descriptiva) → lat/lon con proj4.
// Sin UTM: geocodifica la dirección con Nominatim (máx. 1 pedido/s, User-Agent propio, caché local), precisión baja.
import proj4 from 'proj4';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EstudioSuelo, Ubicacion } from '../contracts/index.ts';

const UTM19S = '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs'; // EPSG:32719
const CACHE_GEO = join('data', 'fuentes', 'geocodificacion.json');
const USER_AGENT = 'NexoBIM/0.1 (hackathon academica)';

export function utmALatLon(este: number, norte: number): { lat: number; lon: number } {
  const [lon, lat] = proj4(UTM19S, 'WGS84', [este, norte]);
  return { lat, lon };
}

const utmValido = (este: number, norte: number) => este > 100000 && este < 900000 && norte > 7e6 && norte < 1e7;

/** "Este 227480 m, Norte 8186300 m" en el texto (memoria descriptiva). */
export function utmEnTexto(paginas: string[]): { este: number; norte: number } | null {
  for (const p of paginas) {
    const m = p.match(/\bE(?:ste)?\s*[:=]?\s*(\d{6}(?:\.\d+)?)\s*m?\b[^\d]{0,20}\bN(?:orte)?\s*[:=]?\s*(\d{7}(?:\.\d+)?)/i);
    if (m && utmValido(+m[1], +m[2])) return { este: +m[1], norte: +m[2] };
  }
  return null;
}

let ultimoPedido = 0;

export async function ubicarObra(estudio: EstudioSuelo, direccion?: string, paginas: string[] = []): Promise<Ubicacion | null> {
  const utms = estudio.calicatas.flatMap(c => c.valor?.utm && utmValido(c.valor.utm.este, c.valor.utm.norte) ? [c.valor.utm] : []);
  const utm = utms.length
    ? { este: utms.reduce((s, u) => s + u.este, 0) / utms.length, norte: utms.reduce((s, u) => s + u.norte, 0) / utms.length }
    : utmEnTexto(paginas);
  if (utm) return { ...utmALatLon(utm.este, utm.norte), origen: 'utm_documento', precision_m: 50 };
  if (!direccion) return null;

  const cache: Record<string, { lat: number; lon: number } | null> = await readFile(CACHE_GEO, 'utf8').then(JSON.parse, () => ({}));
  if (!(direccion in cache)) {
    const espera = ultimoPedido + 1100 - Date.now();
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    ultimoPedido = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(direccion)}`;
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' } });
      if (!r.ok) return null;
      const [x] = await r.json() as { lat: string; lon: string }[];
      cache[direccion] = x ? { lat: +x.lat, lon: +x.lon } : null;
      await mkdir(dirname(CACHE_GEO), { recursive: true });
      await writeFile(CACHE_GEO, JSON.stringify(cache, null, 1));
    } catch { return null; } // sin red: no se cachea el fallo
  }
  const g = cache[direccion];
  return g ? { ...g, origen: 'geocodificado', precision_m: 1000 } : null;
}
