// Documento → Markdown en caché (una sola vez, con OCR incluido) para no releer PDFs ni gastar tokens.
// data/fuentes/md/<sha16>.md: "## Página N" por página. La IA recibe solo las páginas relevantes del Markdown.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { leerPdf } from './pdf.ts';

export const CACHE_MD = join('data', 'fuentes', 'md');
const SEP = /^## Página (\d+)\s*$/m;

/** Limpia el texto de una página: une palabras cortadas por guion, quita espacios repetidos y líneas vacías de más. */
export function limpiar(t: string): string {
  return t.replace(/(\p{L})-\n(\p{L})/gu, '$1$2').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function aTextoMd(paginas: string[], fuente: string, sha: string): string {
  return `<!-- NexoBIM md v1 · ${fuente} · sha256 ${sha} -->\n\n` + paginas.map((p, i) => `## Página ${i + 1}\n\n${limpiar(p)}`).join('\n\n') + '\n';
}

export function paginasDeMd(md: string): string[] {
  const partes = md.split(SEP); // [cabecera, n1, texto1, n2, texto2, ...]
  const out: string[] = [];
  for (let i = 1; i < partes.length; i += 2) out[Number(partes[i]) - 1] = partes[i + 1].trim();
  return Array.from(out, p => p ?? '');
}

/** Convierte (o lee de caché) un PDF a Markdown. Devuelve las páginas como texto y la ruta del .md. */
export async function aMarkdown(ruta: string): Promise<{ paginas: string[]; rutaMd: string; desdeCache: boolean; escaneadas: number[] }> {
  const sha = createHash('sha256').update(await readFile(ruta)).digest('hex');
  const rutaMd = join(CACHE_MD, `${sha.slice(0, 16)}.md`);
  try { const md = await readFile(rutaMd, 'utf8'); return { paginas: paginasDeMd(md), rutaMd, desdeCache: true, escaneadas: [] }; } catch { /* sin caché */ }
  const { paginas, escaneadas } = await leerPdf(ruta);
  await mkdir(CACHE_MD, { recursive: true });
  await writeFile(rutaMd, aTextoMd(paginas, ruta, sha));
  return { paginas: paginas.map(limpiar), rutaMd, desdeCache: false, escaneadas };
}

// Palabras que delatan una página con datos que extraemos (peso = cuán específica es).
const CLAVES: [RegExp, number][] = [
  [/calicata/i, 3], [/\bSUCS\b|\b(GP|GW|GM|GC|SP|SW|SM|SC|ML|CL|MH|CH)\b/, 2], [/capacidad\s+(portante|admisible)/i, 4],
  [/perfil\s+(de\s+suelo|tipo)|\bS[0-3]\b/i, 3], [/E\.?\s?030|factor\s+de\s+suelo|\bS\s*=\s*[01][.,]\d/i, 4],
  [/(nivel|napa)\s+fre[aá]tic/i, 3], [/sulfat|clorur|sales\s+solubles/i, 3], [/cemento\s+(tipo|portland)/i, 3],
  [/profundidad\s+de\s+(cimentaci|desplante)|\bDf\b/i, 3], [/conclusion|recomendacion/i, 3], [/UTM|coordenadas|WGS/i, 2],
  [/colapsab|expansiv|licuac|licuefac/i, 2], [/estudio\s+de\s+(mec[aá]nica\s+de\s+)?suelos/i, 1],
];

/** Números de página (1..n) más relevantes, en orden de lectura. Recorta lo que la IA no necesita (anexos, ensayos repetidos). */
export function paginasRelevantes(paginas: string[], max = 20): number[] {
  const puntaje = paginas.map((t, i) => ({ n: i + 1, p: CLAVES.reduce((s, [re, w]) => s + (re.test(t) ? w : 0), 0) }));
  return puntaje.filter(x => x.p >= 3).sort((a, b) => b.p - a.p).slice(0, max).map(x => x.n).sort((a, b) => a - b);
}
