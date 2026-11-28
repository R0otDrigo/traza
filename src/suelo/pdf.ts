// Lectura de PDF de EMS: texto por página (pdfjs) y OCR (tesseract, 'spa') solo en las páginas escaneadas.
// Caché en data/fuentes/ocr/ (fuera de git): texto OCR por página y spa.traineddata, que tesseract descarga
// una sola vez del CDN. Sin internet y sin caché, la página queda en `noLegibles` con texto vacío.
// El OCR corre con varios workers en paralelo (los EMS reales del SEACE llegan escaneados, hasta 300+ páginas).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const CACHE_OCR = join('data', 'fuentes', 'ocr');
// Decodificadores WASM de pdf.js (JBIG2/JPEG2000): sin esto, las imágenes de los escaneos del SEACE salen en blanco.
export const WASM_PDFJS = fileURLToPath(new URL('../../node_modules/pdfjs-dist/wasm/', import.meta.url)).replaceAll('\\', '/');
const MIN_CARACTERES = 50; // menos texto que esto (sin espacios) = página escaneada
const HILOS = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));

export async function leerPdf(ruta: string, opciones: { ocr?: boolean } = {}): Promise<{ paginas: string[]; escaneadas: number[]; noLegibles: number[] }> {
  const datos = await readFile(ruta);
  const huella = createHash('sha256').update(datos).digest('hex').slice(0, 16);
  const tarea = getDocument({ data: new Uint8Array(datos), verbosity: 0, wasmUrl: WASM_PDFJS });
  const pdf = await tarea.promise;
  const paginas: string[] = [], escaneadas: number[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    const texto = items.map(i => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').trim();
    if (texto.replace(/\s/g, '').length < MIN_CARACTERES) escaneadas.push(n);
    paginas.push(texto);
  }
  const noLegibles: number[] = opciones.ocr === false ? [...escaneadas] : [];
  if (opciones.ocr !== false && escaneadas.length) {
    const ocr = await ocrPaginas(pdf, escaneadas, huella);
    for (const n of escaneadas) {
      const t = ocr.get(n);
      if (t == null) noLegibles.push(n); else paginas[n - 1] = `${paginas[n - 1]}\n${t}`.trim();
    }
  }
  await tarea.destroy();
  return { paginas, escaneadas, noLegibles };
}

/** OCR de varias páginas con un pool de workers. Cada página se guarda en caché apenas termina (reanudable). */
async function ocrPaginas(pdf: any, numeros: number[], huella: string): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  const pendientes: number[] = [];
  for (const n of numeros) {
    try { out.set(n, await readFile(join(CACHE_OCR, `${huella}-p${n}.txt`), 'utf8')); } catch { pendientes.push(n); }
  }
  if (!pendientes.length) return out;
  await mkdir(CACHE_OCR, { recursive: true });
  let workers: import('tesseract.js').Worker[] = [];
  try {
    const { createWorker } = await import('tesseract.js');
    const { createCanvas } = await import('@napi-rs/canvas');
    workers = await Promise.all(Array.from({ length: Math.min(HILOS, pendientes.length) }, () => createWorker('spa', 1, { cachePath: CACHE_OCR })));
    let hechas = 0;
    const cola = [...pendientes];
    await Promise.all(workers.map(async w => {
      for (let n = cola.shift(); n !== undefined; n = cola.shift()) {
        const pag = await pdf.getPage(n);
        const viewport = pag.getViewport({ scale: 2 });
        const canvas = createCanvas(viewport.width, viewport.height);
        await pag.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        const { data } = await w.recognize(canvas.toBuffer('image/png'));
        await writeFile(join(CACHE_OCR, `${huella}-p${n}.txt`), data.text);
        out.set(n, data.text);
        if (++hechas % 10 === 0 || hechas === pendientes.length) console.error(`OCR ${hechas}/${pendientes.length} páginas`);
      }
    }));
  } catch (e) {
    console.error(`OCR no disponible (${(e as Error).message}); las páginas sin texto quedan como no legibles.`);
    for (const n of pendientes) if (!out.has(n)) out.set(n, null);
  } finally {
    await Promise.all(workers.map(w => w.terminate().catch(() => {})));
  }
  return out;
}
