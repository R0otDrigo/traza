// Puente NexoBIM ⇄ Revit vía rvt-mcp. Ejecuta los scripts C# fijos de /revit (no código generado por IA).
import { readFileSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, llamar, fijarInstancia } from '../../scripts/rvt.ts';
import type { Proyecto, Resultado, Opcion, Muro } from '../e070/types.ts';
import type { CasoPrueba } from '../e070/caso.ts';

const dir = fileURLToPath(new URL('../../revit/', import.meta.url));
const cs = (n: string) => readFileSync(dir + n, 'utf8');

export interface MuroRevit extends Omit<Muro, 'rol'> {
  marca: string; estructural: boolean; funcion: string; comentarios: string;
}
export interface ModeloRevit { documento: string; ruta: string; niveles: Proyecto['niveles']; muros: MuroRevit[] }

// Revit atiende a UN cliente rvt-mcp a la vez: todo el proceso (rutas del panel, vigilante) comparte un cliente
// y una cola FIFO. Vive en globalThis para sobrevivir a la recarga en caliente de Vite (ssrLoadModule).
type Cliente = Awaited<ReturnType<typeof conectar>>;
const G: { cliente: Promise<Cliente> | null; cola: Promise<unknown>; enCurso: number } =
  ((globalThis as any).__nexobimRevit ??= { cliente: null, cola: Promise.resolve(), enCurso: 0 });
async function c() { return (G.cliente ??= conectar().catch(e => { G.cliente = null; throw e; })); }
export async function cerrar() { const k = G.cliente; G.cliente = null; await (await k?.catch(() => null))?.close(); }

/** true si hay operaciones con Revit en curso o esperando en la cola. */
export const ocupado = () => G.enCurso > 0;
/** Encola una operación con Revit (FIFO, una a la vez). */
export function enCola<T>(fn: () => Promise<T>): Promise<T> {
  G.enCurso++;
  const r = G.cola.then(fn).finally(() => G.enCurso--);
  G.cola = r.catch(() => {});
  return r;
}
const rvt = (tool: string, args: Record<string, unknown> = {}) => enCola(async () => llamar(await c(), tool, args));

async function ejecutar(archivo: string, data: object = {}): Promise<string> {
  const txt = await rvt('revit_send_code_to_revit', { code: cs(archivo), data, usage_context: 'project' });
  // rvt-mcp envuelve la respuesta; buscamos el valor devuelto por Run().
  try {
    const j = JSON.parse(txt);
    const v = j.result ?? j.Result ?? j.output ?? j.value ?? j;
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch { return txt; }
}

export async function extraer(): Promise<ModeloRevit> {
  return JSON.parse(await ejecutar('extraer_muros.cs'));
}

/** Hash liviano del modelo (muros, vanos, tipos, niveles, losas). Solo lectura. */
export async function huella(): Promise<{ huella: string; muros: number; vanos: number }> {
  return JSON.parse(await ejecutar('huella_modelo.cs'));
}

/** Espera a que un archivo exista y deje de crecer (Revit guarda en segundo plano). */
async function esperarArchivo(ruta: string, maxMs = 300_000) {
  let antes = -1;
  for (const t0 = Date.now(); Date.now() - t0 < maxMs; await new Promise(r => setTimeout(r, 3000))) {
    const n = existsSync(ruta) ? statSync(ruta).size : -1;
    if (n > 1_000_000 && n === antes) return;
    antes = n;
  }
  throw new Error(`Revit no terminó de guardar ${ruta}`);
}

/** Crea un proyecto nuevo en `ruta` (copiando un proyecto base vacío), lo abre en Revit y construye el caso dentro. */
export async function crearModelo(caso: CasoPrueba, ruta: string) {
  const base = join(dirname(ruta), '_base-vacio.rvt');
  if (!existsSync(base)) {
    // Solo la primera vez: guardar la plantilla tarda ~1 min y puede exceder la espera de la llamada.
    await ejecutar('nuevo_proyecto.cs', { ruta: base }).catch(() => {});
    await esperarArchivo(base);
  }
  copyFileSync(base, ruta);
  await rvt('revit_open_model', { path: ruta, activate: true, timeout_seconds: 300 });
  await enCola(async () => fijarInstancia(await c()));
  return ejecutar('crear_modelo.cs', caso);
}

export async function guardar() {
  return ejecutar('guardar.cs');
}

export async function pintar(r: Resultado, opciones: Opcion[] = []) {
  const muros: Record<string, { estado: string; texto: string }> = {};
  for (const [id, m] of Object.entries(r.muros)) {
    muros[id] = { estado: m.estado, texto: `NexoBIM E.070: ${m.estado.replace('_', ' ')}${m.motivos.length ? ' — ' + m.motivos.join('; ') : ''}` };
  }
  for (const o of opciones) muros[o.muroId] = { estado: 'opcion', texto: `NexoBIM E.070: OPCIÓN — ${o.detalle} (+${o.deltaLt} m²)` };
  const niveles: Record<string, string> = {};
  for (const ch of r.chequeos) niveles[ch.nivel] = niveles[ch.nivel] === 'no_cumple' || !ch.cumple ? 'no_cumple' : 'cumple';
  return ejecutar('pintar_resultados.cs', { muros, niveles });
}

export async function limpiar(ids: string[]) {
  return ejecutar('pintar_resultados.cs', { limpiar: true, muros: Object.fromEntries(ids.map(i => [i, { estado: '', texto: '' }])) });
}

export async function aplicar(o: Opcion) {
  return ejecutar('aplicar_opcion.cs', { muroId: o.muroId, accion: o.accion, espesor: o.espesor ?? (o.accion === 'aumentar_espesor' ? 0.23 : 0.13), dx: o.mover?.dx ?? 0, dy: o.mover?.dy ?? 0 });
}

export async function capturar(ruta: string) {
  return rvt('revit_capture_view_image', { output_path: ruta, pixel_size: 1600 });
}
