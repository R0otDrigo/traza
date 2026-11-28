// Extracción del EMS: la IA (o reglas) TRANSCRIBE valores con página + texto literal; el código verifica cada cita.
// Anti-invención: si el texto no está en esa página (o el número no está en el texto), valor null y motivo "no verificable".
// Todo queda 'propuesto': el ingeniero aprueba campo por campo. Ningún número sale de la IA.
import { z } from 'zod';
import { pedirJson, proveedor, modeloIA } from './llm.ts';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Calicata, PerfilE030, Riesgo, type Actor, type Cita, type EstudioSuelo } from '../contracts/index.ts';
import { paginasRelevantes } from '../suelo/markdown.ts';

const PAGINAS_POR_BLOQUE = 15;
const CACHE_IA = join('fixtures', 'ai'); // respuestas de la IA (antes de verificar) para demo sin red

export interface Campo<T> { valor: T | null; cita: Cita | null; estado: 'propuesto'; por: Actor; en: string }
interface Propuesta<T> { valor: T | null; pagina: number | null; textoLiteral: string | null }

// ---------- Verificación (pura) ----------

/** Minúsculas, sin tildes (NFKD: también "²"→"2"), espacios colapsados. */
export const normalizar = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Lectura de un número tal como lo escribe el documento (1.85, 1,85, 1,250). */
export const num = (s: string) => Number(/^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.'));

/** Todos los valores que pueden representar los números escritos en un texto. */
function numerosEn(s: string): number[] {
  return (s.match(/\d+(?:[.,]\d+)*/g) ?? []).flatMap(t => [num(t), Number(t.replace(/[.,]/g, ''))]);
}
function numerosDe(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (v && typeof v === 'object') return Object.values(v).flatMap(numerosDe);
  return [];
}

/**
 * Comprueba que `textoLiteral` exista en la página indicada y que cada número del valor esté escrito:
 * en la cita si el valor es escalar; en el documento si es un objeto (calicata: tabla UTM y estratos pueden ir en páginas distintas).
 */
export function verificarCita(paginas: string[], pagina: number | null, textoLiteral: string | null, valor?: unknown): Cita | null {
  if (pagina === null || !textoLiteral) return null;
  const texto = paginas[pagina - 1];
  const t = normalizar(textoLiteral);
  const enPagina = texto !== undefined && t.length > 0 && normalizar(texto).includes(t);
  const disponibles = numerosEn(typeof valor === 'object' ? paginas.join('\n') : textoLiteral);
  const numerosOk = numerosDe(valor).every(n => disponibles.some(d => Math.abs(d - n) < 1e-9));
  const ok = enPagina && numerosOk;
  return { pagina: Math.max(1, Math.trunc(pagina) || 1), textoLiteral, verificada: ok, ...(ok ? {} : { motivo: 'no verificable' }) };
}

/** Propuesta (IA o reglas) → campo del contrato. Sin cita verificada, el valor queda null. */
export function aCampo<T>(paginas: string[], p: Propuesta<T>, por: Actor, en = new Date().toISOString()): Campo<T> {
  const cita = verificarCita(paginas, p.pagina, p.textoLiteral, p.valor);
  return { valor: cita?.verificada ? p.valor : null, cita, estado: 'propuesto', por, en };
}

// ---------- Respaldo por reglas ----------

type Regla<T> = [RegExp, (m: RegExpMatchArray) => T | null];

function primera<T>(paginas: string[], reglas: Regla<T>[], en: string): Campo<T> {
  for (const [re, conv] of reglas)
    for (let i = 0; i < paginas.length; i++) {
      const m = paginas[i].match(re);
      if (m) return aCampo(paginas, { valor: conv(m), pagina: i + 1, textoLiteral: m[0] }, 'motor', en);
    }
  return { valor: null, cita: null, estado: 'propuesto', por: 'motor', en };
}

const valorNum = (m: RegExpMatchArray) => num(m[1]);
const ppm = (palabra: string): Regla<number>[] => [[new RegExp(`${palabra}[^\\d\\n]{0,40}(\\d[\\d.,]*)\\s*(?:ppm|mg\\s*/\\s*kg)`, 'i'), valorNum]];

const ESTRATO = /(\d+[.,]\d+)\s*(?:a|-|–)\s*(\d+[.,]\d+)\s*m\s*:?\s*([^();]*?)\s*\(([A-Z]{2}(?:-[A-Z]{2})?)\)/g;

function calicatasPorReglas(paginas: string[], en: string): Campo<Calicata>[] {
  const mapa = new Map<string, { utm: Calicata['utm']; prof: number | null; estratos: Calicata['estratos']; pagina: number; texto: string }>();
  const dar = (id: string, pagina: number, texto: string) => mapa.get(id) ?? mapa.set(id, { utm: null, prof: null, estratos: [], pagina, texto }).get(id)!;
  paginas.forEach((p, i) => {
    for (const m of p.matchAll(/\b(C-\d+)\s+(\d{6}(?:\.\d+)?)\s+(\d{7}(?:\.\d+)?)\s+(\d+[.,]\d+)/g)) {
      const c = dar(m[1], i + 1, m[0]);
      Object.assign(c, { utm: { este: num(m[2]), norte: num(m[3]), zona: '19S' as const }, prof: num(m[4]), pagina: i + 1, texto: m[0] });
    }
    for (const b of p.matchAll(/calicata\s+(C-\d+)\b([^]*?)(?=calicata\s+C-\d|$)/gi)) {
      for (const e of b[2].matchAll(ESTRATO)) {
        const c = dar(b[1].toUpperCase(), i + 1, e[0]);
        c.estratos.push({ desde_m: num(e[1]), hasta_m: num(e[2]), SUCS: e[4], descripcion: e[3].replace(/\s+/g, ' ').trim() });
      }
    }
  });
  return [...mapa].map(([id, c]) => aCampo<Calicata>(paginas, {
    valor: { id, utm: c.utm, profundidad_m: c.prof ?? Math.max(0, ...c.estratos.map(e => e.hasta_m)), estratos: c.estratos },
    pagina: c.pagina, textoLiteral: c.texto,
  }, 'motor', en));
}

export function extraerPorReglas(obraId: string, paginas: string[], en = new Date().toISOString()): EstudioSuelo {
  const P = <T>(reglas: Regla<T>[]) => primera(paginas, reglas, en);
  const recomendaciones = paginas.flatMap((p, i) => [...p.matchAll(/recomendaci[oó]n\s*:\s*([^]*?\.)(?=\s|$)/gi)]
    .map(m => aCampo(paginas, { valor: m[1].replace(/\s+/g, ' ').trim(), pagina: i + 1, textoLiteral: m[0] }, 'motor', en)));
  return {
    obraId,
    fecha: P([[/fecha\s*:?\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+del?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i, m => m[1]]]),
    calicatas: calicatasPorReglas(paginas, en),
    perfilE030: P([[/perfil\s+(?:de(?:l)?\s+suelo|s[ií]smico)?\s*(?:tipo\s*)?:?\s*(S[0-3])\b/i, m => m[1].toUpperCase() as 'S0']]),
    S_reportadoEMS: P([[/(?:factor\s+(?:de\s+)?suelo\s*(?:\(?S\)?)?|\bS)\s*[=:]\s*(\d+[.,]\d+)/i, valorNum]]),
    capacidadPortante_kgcm2: P([[/capacidad\s+(?:portante|de\s+carga)[^\d\n]{0,40}(\d+[.,]\d+)\s*kg\s*\/\s*cm\s*(?:2|²)/i, valorNum]]),
    Df_m: P([[/\bD\s*f\s*[=:]\s*(\d+(?:[.,]\d+)?)\s*m\b/i, valorNum]]),
    tipoCimentacionRecomendada: P([[/tipo\s+de\s+cimentaci[oó]n\s*:\s*([^\n.]+)/i, m => m[1].trim()]]),
    nivelFreatico_m: P<number>([
      [/no\s+se\s+(?:encontr[oó]|detect[oó]|registr[oó])\s+(?:el\s+)?nivel\s+fre[aá]tico/i, () => null],
      [/nivel\s+fre[aá]tico[^\d\n]{0,40}(\d+[.,]\d+)\s*m\b/i, valorNum],
    ]),
    sulfatos_ppm: P(ppm('sulfatos?')),
    cloruros_ppm: P(ppm('cloruros?')),
    salesSolubles_ppm: P(ppm('sales\\s+solubles(?:\\s+totales)?')),
    cementoRecomendado: P([[/cemento\s+(?:portland\s+)?tipo\s+(I{1,3}|IV|V|MS|HS|IP|ICo)\b/i, m => `Tipo ${m[1]}`]]),
    riesgos: [], // por reglas no se infieren riesgos (frases negadas); queda para la IA o el ingeniero
    recomendacionesEMS: recomendaciones,
  };
}

// ---------- IA ----------

const Prop = <T extends z.ZodTypeAny>(v: T) => z.object({ valor: v.nullable(), pagina: z.number().int().nullable(), textoLiteral: z.string().nullable() });
const SchemaIA = z.object({
  fecha: Prop(z.string()), calicatas: z.array(Prop(Calicata)), perfilE030: Prop(PerfilE030), S_reportadoEMS: Prop(z.number()),
  capacidadPortante_kgcm2: Prop(z.number()), Df_m: Prop(z.number()), tipoCimentacionRecomendada: Prop(z.string()),
  nivelFreatico_m: Prop(z.number()), sulfatos_ppm: Prop(z.number()), cloruros_ppm: Prop(z.number()), salesSolubles_ppm: Prop(z.number()),
  cementoRecomendado: Prop(z.string()), riesgos: z.array(Prop(Riesgo)), recomendacionesEMS: z.array(Prop(z.string())),
});
type RespuestaIA = z.infer<typeof SchemaIA>;

const SISTEMA = `Eres asistente de un ingeniero estructural peruano. Lees un Estudio de Mecánica de Suelos (EMS) y TRANSCRIBES sus datos.
Para cada dato devuelve valor, pagina (número de página indicado en "=== PÁGINA n ===") y textoLiteral: un fragmento corto (máx. 200 caracteres),
copiado EXACTAMENTE de esa página, que contenga el valor. El código verificará que ese texto exista; si no existe, el dato se descarta.
Reglas: no calcules, no conviertas unidades, no redondees, no deduzcas. Si el dato no está escrito tal cual (p. ej. capacidad portante en kPa
y no en kg/cm²), usa valor, pagina y textoLiteral null. Nivel freático "no encontrado" = valor null con la cita que lo dice.
Calicatas: id (C-1...), UTM solo si el documento dice WGS84 zona 19S (este, norte), profundidad y estratos con SUCS tal como figuran.
Riesgos solo si el EMS afirma que el suelo es colapsable, expansivo o licuable. Recomendaciones: una por elemento, texto del EMS.`;


/** Un bloque de páginas → respuesta de la IA (o caché en fixtures/ai/). null si no hay IA o falla. */
async function pedirBloque(paginas: string[], numeros: number[]): Promise<RespuestaIA | null> {
  const contenido = numeros.map(n => `=== PÁGINA ${n} ===\n${paginas[n - 1]}`).join('\n\n');
  const archivo = join(CACHE_IA, `suelo-${createHash('sha256').update(modeloIA() + SISTEMA + contenido).digest('hex').slice(0, 16)}.json`);
  try { return SchemaIA.parse(JSON.parse(await readFile(archivo, 'utf8'))); } catch { /* sin caché */ }
  const r = await pedirJson(SchemaIA, SISTEMA, contenido);
  if (!r) return null;
  await mkdir(CACHE_IA, { recursive: true });
  await writeFile(archivo, JSON.stringify(r, null, 1));
  return r;
}

/** Fusiona bloques y verifica cada cita. Escalares: el primero verificado; listas: concatenadas. */
export function verificarRespuestas(obraId: string, paginas: string[], bloques: RespuestaIA[], en = new Date().toISOString()): EstudioSuelo {
  const campos = <K extends keyof RespuestaIA>(k: K) => bloques.flatMap(b => [b[k]].flat() as Propuesta<any>[]).map(p => aCampo(paginas, p, 'IA', en));
  const escalar = <K extends keyof RespuestaIA>(k: K) => {
    const cs = campos(k);
    return cs.find(c => c.valor !== null) ?? cs.find(c => c.cita?.verificada) ?? cs.find(c => c.cita) ?? { valor: null, cita: null, estado: 'propuesto' as const, por: 'IA' as const, en };
  };
  const vistas = new Set<string>();
  return {
    obraId,
    fecha: escalar('fecha'),
    calicatas: campos('calicatas').filter(c => !c.valor || !vistas.has(c.valor.id) && !!vistas.add(c.valor.id)),
    perfilE030: escalar('perfilE030'), S_reportadoEMS: escalar('S_reportadoEMS'), capacidadPortante_kgcm2: escalar('capacidadPortante_kgcm2'),
    Df_m: escalar('Df_m'), tipoCimentacionRecomendada: escalar('tipoCimentacionRecomendada'), nivelFreatico_m: escalar('nivelFreatico_m'),
    sulfatos_ppm: escalar('sulfatos_ppm'), cloruros_ppm: escalar('cloruros_ppm'), salesSolubles_ppm: escalar('salesSolubles_ppm'),
    cementoRecomendado: escalar('cementoRecomendado'), riesgos: campos('riesgos'), recomendacionesEMS: campos('recomendacionesEMS'),
  };
}

export async function extraerEstudio(obraId: string, paginas: string[]): Promise<{ estudio: EstudioSuelo; modo: 'IA' | 'reglas' }> {
  // Ahorro de tokens: solo las páginas con datos de suelo (las citas siguen apuntando a la página real).
  const sel = paginasRelevantes(paginas);
  const numeros = sel.length ? sel : paginas.map((_, i) => i + 1).slice(0, PAGINAS_POR_BLOQUE);
  const bloques: RespuestaIA[] = [];
  const porBloque = proveedor() === 'Groq' ? 4 : PAGINAS_POR_BLOQUE; // Groq gratis: ~8k tokens/min por pedido
  for (let i = 0; i < numeros.length; i += porBloque) {
    const r = await pedirBloque(paginas, numeros.slice(i, i + porBloque));
    if (!r) return { estudio: extraerPorReglas(obraId, paginas), modo: 'reglas' };
    bloques.push(r);
  }
  return { estudio: verificarRespuestas(obraId, paginas, bloques), modo: 'IA' };
}
