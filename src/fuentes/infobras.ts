// Ubicación de obras con la API JSON pública del mapa de INFObras (Contraloría). Ver docs/FUENTES.md.
// Se busca la obra por el lugar de su descripción y se acepta solo si el nombre coincide lo suficiente.
import type { ObraPublica, Ubicacion } from '../contracts/index.ts';
import { pausa } from './descargas.ts';

const API = 'https://infobras.contraloria.gob.pe/InfobrasWeb/Mapa/MapaEstadistico';
const VACIAS = new Set('DE DEL LA LAS EL LOS EN Y A AL CON PARA POR SU E O U'.split(' '));
const GENERICAS = new Set('CONTRATACION EJECUCION OBRA MEJORAMIENTO SERVICIO SERVICIOS CREACION AMPLIACION REPARACION RENOVACION DISTRITO PROVINCIA DEPARTAMENTO AREQUIPA'.split(' '));

const palabras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !VACIAS.has(w));

/** Lugar de la obra en su descripción: "… EN EL PARQUE LAS CONDES URB. LA PERLA, DISTRITO …" → "PARQUE LAS CONDES URB. LA PERLA". */
export function lugar(descripcion: string): string | null {
  const d = descripcion.toUpperCase().replace(/\(LA\)|\(EL\)/g, ' ');
  const m = /\bEN\s+(?:EL|LA|LOS|LAS)?\s*((?:AV|AVENIDA|CALLE|JR|JIRON|PARQUE|PLAZA|URB|ASOC|PJ|PASAJE|I\.?E|INSTITUCION|MERCADO|LOSA|ESTADIO|COLISEO|LOCAL|CENTRO)\b[^,;]*?)(?:\s*[,;]|\s+DISTRITO|$)/.exec(d);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/** Fracción de palabras significativas de `a` que aparecen en `b`. */
export function coincidencia(a: string, b: string): number {
  const wa = palabras(a).filter(w => !GENERICAS.has(w)), wb = new Set(palabras(b));
  return wa.length ? wa.filter(w => wb.has(w)).length / wa.length : 0;
}

const get = async (url: string) => {
  await pausa();
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`INFObras HTTP ${r.status}`);
  return (await r.json()).Result as any[];
};

/** Devuelve la ubicación de INFObras (código + coordenadas) o null si no hay coincidencia confiable. */
export async function ubicarEnInfobras(o: ObraPublica, departamento = 'AREQUIPA'): Promise<{ codigo: number; nombre: string; ubicacion: Ubicacion } | null> {
  const l = lugar(o.descripcion);
  if (!l) return null;
  // INFObras busca la frase literal: primero las 3 primeras palabras del lugar, luego sin abreviaturas (AV., URB.)
  const crudas = l.split(/\s+/);
  const consultas = [...new Set([crudas.slice(0, 3).join(' '), crudas.filter(w => w.length > 3 && !w.endsWith('.')).slice(0, 3).join(' ')])].filter(Boolean);
  for (const q of consultas) {
    const res = await get(`${API}/BusquedaSimple?nombre=${encodeURIComponent(q)}&codigo=&valor=&estado=&orderBy=en_ejecucion&pageNumber=1&pageSize=20`);
    const mejor = res.filter(r => palabras(r.NombreObra).includes(departamento))
      .map(r => ({ r, s: coincidencia(o.descripcion, r.NombreObra) })).sort((a, b) => b.s - a.s)[0];
    if (!mejor || mejor.s < 0.5) continue;
    const [c] = await get(`${API}/GraficarObraMapa?param=${encodeURIComponent(`'${mejor.r.Codigo}'`)}`);
    if (!c) continue;
    // ¡ojo! INFObras devuelve la longitud en "Latitud" y viceversa; en el Perú |lat| < 19 < 68 < |lon|
    const a = Number(c.Latitud), b = Number(c.Longitud);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) continue;
    const [lat, lon] = Math.abs(a) < Math.abs(b) ? [a, b] : [b, a];
    return { codigo: mejor.r.Codigo, nombre: mejor.r.NombreObra, ubicacion: { lat, lon, origen: 'geocodificado', precision_m: 500 } };
  }
  return null;
}
