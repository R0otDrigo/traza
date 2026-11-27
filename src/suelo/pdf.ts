// Lectura de PDF de EMS: texto por página (pdfjs) y OCR (tesseract, 'spa') solo en las páginas escaneadas.
// Caché en data/fuentes/ocr/ (fuera de git): texto OCR por página y spa.traineddata, que tesseract descarga
// una sola vez del CDN. Sin internet y sin caché, la página queda en `noLegibles` con texto vacío.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const CACHE_OCR = join('data', 'fuentes', 'ocr');
const MIN_CARACTERES = 50; // menos texto que esto (sin espacios) = página escaneada

export async function leerPdf(ruta: string, opciones: { ocr?: boolean } = {}): Promise<{ paginas: string[]; escaneadas: number[]; noLegibles: number[] }> {
  const datos = await readFile(ruta);
  const huella = createHash('sha256').update(datos).digest('hex').slice(0, 16);
  const tarea = getDocument({ data: new Uint8Array(datos), verbosity: 0 });
  const pdf = await tarea.promise;
  const paginas: string[] = [], escaneadas: number[] = [], noLegibles: number[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pag = await pdf.getPage(n);
    const { items } = await pag.getTextContent();
    let texto = items.map(i => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').trim();
    if (texto.replace(/\s/g, '').length < MIN_CARACTERES) {
      escaneadas.push(n);
      const ocr = opciones.ocr === false ? null : await ocrPagina(pag, `${huella}-p${n}`);
      if (ocr === null) noLegibles.push(n);
      else texto = `${texto}\n${ocr}`.trim();
    }
    paginas.push(texto);
  }
  await tarea.destroy();
  await cerrarOcr();
  return { paginas, escaneadas, noLegibles };
}

let worker: import('tesseract.js').Worker | null = null;

async function ocrPagina(pag: any, clave: string): Promise<string | null> {
  const archivo = join(CACHE_OCR, `${clave}.txt`);
  try { return await readFile(archivo, 'utf8'); } catch { /* sin caché */ }
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const viewport = pag.getViewport({ scale: 2.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await pag.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    await mkdir(CACHE_OCR, { recursive: true });
    if (!worker) {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('spa', 1, { cachePath: CACHE_OCR });
    }
    const { data } = await worker.recognize(canvas.toBuffer('image/png'));
    await writeFile(archivo, data.text);
    return data.text;
  } catch (e) {
    console.error(`OCR no disponible para la página (${(e as Error).message}); se marca como no legible.`);
    await cerrarOcr();
    return null;
  }
}

async function cerrarOcr() { await worker?.terminate().catch(() => {}); worker = null; }
