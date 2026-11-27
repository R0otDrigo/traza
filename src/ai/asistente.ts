// IA de NexoBIM: clasifica muros y ordena/explica opciones. NUNCA calcula densidades.
// Sin credenciales (o si el modelo declina) usa reglas deterministas y lo declara en `fuente`.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MuroRevit } from '../revit/bridge.ts';
import type { Resultado, Opcion, Rol } from '../e070/types.ts';

const MODELO = 'claude-opus-5-5';

export interface Clasificacion { id: string; rol: Rol; confianza: number; razon: string; fuente: 'IA' | 'regla' }

/** Reglas deterministas (respaldo y punto de comparación con la IA). */
export function clasificarPorReglas(m: MuroRevit): Clasificacion {
  const n = `${m.tipoRevit} ${m.material} ${m.comentarios}`.toLowerCase();
  const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
  const r = (rol: Rol, confianza: number, razon: string): Clasificacion => ({ id: m.id, rol, confianza, razon, fuente: 'regla' });
  if (/tabique|pandereta|drywall|yeso|board|partition|panel/.test(n)) return r('tabique', 0.9, 'Nombre o material de tabiquería no portante');
  if (/cortina|curtain|vidrio|glass/.test(n)) return r('tabique', 0.95, 'Muro cortina / vidrio');
  if (m.t < 0.12) return r('tabique', 0.8, `Espesor ${m.t} m menor que un muro portante de soga`);
  if (m.estructural || /kk|king|portante|estructural|albañiler|ladrillo|brick|masonry|concreto|concrete/.test(n))
    return r('portante', L >= 1.2 ? 0.85 : 0.6, m.estructural ? 'Marcado como estructural en Revit' : 'Tipo/material de albañilería portante');
  return r('desconocido', 0.4, 'Sin evidencia suficiente: requiere decisión del ingeniero');
}

let _client: Anthropic | null | undefined;
function cliente(): Anthropic | null {
  if (_client !== undefined) return _client;
  try { _client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null; } catch { _client = null; }
  return _client;
}
export const iaDisponible = () => cliente() !== null;

const SchemaClasif = z.object({
  muros: z.array(z.object({
    id: z.string(),
    rol: z.enum(['portante', 'tabique', 'desconocido']),
    confianza: z.number(),
    razon: z.string(),
  })),
});

const SISTEMA = `Eres asistente de un ingeniero estructural peruano que verifica edificaciones de albañilería confinada (RNE E.070).
Clasificas muros de un modelo de Revit como "portante" (albañilería confinada/armada o placa que resiste sismo, continua en altura),
"tabique" (no portante: pandereta, drywall, muros cortina, parapetos) o "desconocido" si la evidencia no alcanza.
Usa nombre del tipo, material, espesor, longitud, bandera estructural, función y continuidad con el piso inferior (muros con la misma traza).
No inventes datos. Si dudas, usa "desconocido": el ingeniero decide. La razón debe ser breve (≤ 20 palabras) y en español.`;

export async function clasificar(muros: MuroRevit[]): Promise<Clasificacion[]> {
  const reglas = muros.map(clasificarPorReglas);
  const c = cliente();
  if (!c) return reglas;
  const datos = muros.map(m => ({
    id: m.id, marca: m.marca, nivel: m.nivel, tipo: m.tipoRevit, material: m.material, t: m.t,
    L: Math.round(Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * 100) / 100, eje: `${m.x1},${m.y1}→${m.x2},${m.y2}`,
    estructural: m.estructural, funcion: m.funcion, vanos: m.aberturas.length,
  }));
  try {
    const r = await c.messages.parse({
      model: MODELO, max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(SchemaClasif) },
      system: SISTEMA,
      messages: [{ role: 'user', content: `Clasifica estos ${datos.length} muros:\n${JSON.stringify(datos)}` }],
    });
    if (r.stop_reason === 'refusal' || !r.parsed_output) return reglas;
    const porId = new Map(r.parsed_output.muros.map(x => [x.id, x]));
    return reglas.map(base => {
      const x = porId.get(base.id);
      return x ? { id: base.id, rol: x.rol, confianza: Math.max(0, Math.min(1, x.confianza)), razon: x.razon, fuente: 'IA' as const } : base;
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`IA no disponible (${e.status}); se usan reglas.`);
    else throw e;
    return reglas;
  }
}

/** Combinación mínima determinista (greedy por aporte) que cubre el déficit de cada nivel/dirección. */
export function planMinimo(r: Resultado): Record<string, Opcion[]> {
  const out: Record<string, Opcion[]> = {};
  for (const ch of r.chequeos.filter(c => !c.cumple)) {
    const ops = r.opciones.filter(o => o.nivel === ch.nivel && o.dir === ch.dir);
    const usados = new Set<string>(), plan: Opcion[] = [];
    let falta = ch.deficitLt;
    for (const o of ops) {
      if (falta <= 1e-9) break;
      if (usados.has(o.muroId)) continue;
      plan.push(o); usados.add(o.muroId); falta -= o.deltaLt;
    }
    out[`${ch.nivel}|${ch.dir}`] = plan;
  }
  return out;
}

const SchemaExpl = z.object({
  resumen: z.string(),
  recomendaciones: z.array(z.object({ opcionId: z.string(), orden: z.number(), justificacion: z.string(), impactoArquitectonico: z.string() })),
});

export interface Explicacion { resumen: string; recomendaciones: { opcionId: string; orden: number; justificacion: string; impactoArquitectonico: string }[]; fuente: 'IA' | 'regla' }

/** La IA ordena y explica las opciones YA calculadas; no cambia ningún número. */
export async function explicar(r: Resultado, notasArquitectura = ''): Promise<Explicacion> {
  const plan = planMinimo(r);
  const fallos = r.chequeos.filter(c => !c.cumple);
  const base: Explicacion = {
    resumen: fallos.length
      ? `No cumple la densidad mínima en ${fallos.map(f => `${f.nivel} ${f.dir} (faltan ${f.deficitLt} m² de L·t)`).join(', ')}. Se proponen las opciones de mayor aporte hasta cubrir el déficit.`
      : 'Cumple la densidad mínima de muros en X e Y en todos los niveles.',
    recomendaciones: Object.values(plan).flat().map((o, i) => ({ opcionId: o.id, orden: i + 1, justificacion: `${o.detalle}: aporta ${o.deltaLt} m² de L·t.`, impactoArquitectonico: 'Por evaluar con arquitectura.' })),
    fuente: 'regla',
  };
  const c = cliente();
  if (!c || !fallos.length) return base;
  try {
    const resp = await c.messages.parse({
      model: MODELO, max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(SchemaExpl) },
      system: `${SISTEMA}
Ahora recibes el resultado del motor determinista E.070 y opciones de mejora con su aporte (deltaLt) ya calculado.
Ordena las opciones para cubrir cada déficit con el menor impacto arquitectónico (no tapar fachadas ni circulaciones), explica por qué
y advierte lo que el ingeniero debe verificar (confinamiento, continuidad vertical, cimentación). No recalcules ni cambies números.
Solo puedes citar opcionId que existan en la lista.`,
      messages: [{ role: 'user', content: JSON.stringify({ chequeosQueFallan: fallos, opciones: r.opciones, planMinimoDeterminista: plan, notasArquitectura }) }],
    });
    if (resp.stop_reason === 'refusal' || !resp.parsed_output) return base;
    const ids = new Set(r.opciones.map(o => o.id));
    return { ...resp.parsed_output, recomendaciones: resp.parsed_output.recomendaciones.filter(x => ids.has(x.opcionId)), fuente: 'IA' };
  } catch (e) {
    if (e instanceof Anthropic.APIError) return base;
    throw e;
  }
}
