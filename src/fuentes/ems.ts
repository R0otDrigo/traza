// Detector de Estudios de Mecánica de Suelos (EMS): puntaje por nombre de archivo + texto de las primeras páginas.
import { readFileSync } from 'node:fs';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// [patrón, peso]. Sobre texto sin tildes y en minúsculas.
const CLAVES_TEXTO: [RegExp, number][] = [
  [/mecanica de suelos/g, 5],
  [/estudio de suelos?/g, 4],
  [/capacidad (portante|admisible)/g, 4],
  [/calicata/g, 3],
  [/\bsucs\b/g, 2],
  [/e\.?\s?050/g, 3],
  [/perfil (de|del) suelo/g, 3],
  [/granulometri/g, 1],
  [/limites? de (atterberg|consistencia)/g, 1],
  [/nivel freatico/g, 1],
];
const CLAVES_NOMBRE: [RegExp, number][] = [
  [/mecanica.{0,5}suelo|\bems\b|estudio.{0,5}suelo|geotecni/, 10],
  [/suelo|calicata|capacidad.{0,3}portante/, 6],
  [/estudios? tecnicos?|estudios? basicos?/, 3],
];

/** Puntaje del nombre de archivo o etiqueta (sección, "Nombre del estudio"…). */
export function puntajeNombre(nombre: string): number {
  const n = sinTildes(nombre).replace(/[_\-.]+/g, ' ');
  for (const [re, p] of CLAVES_NOMBRE) if (re.test(n)) return p;
  return 0;
}

/** Puntaje del texto: cada clave suma su peso por aparición, con tope de 3 apariciones por clave. */
export function puntajeTexto(texto: string): number {
  const t = sinTildes(texto);
  let s = 0;
  for (const [re, p] of CLAVES_TEXTO) s += p * Math.min(3, t.match(re)?.length ?? 0);
  return s;
}

export const puntajeEMS = (nombre: string, texto: string) => puntajeNombre(nombre) + puntajeTexto(texto);

export interface TextoPdf { paginas: number; paginasEscaneadas: number[]; texto: string }

/** Lee el texto de las primeras `max` páginas con pdfjs. Escaneada = menos de 30 caracteres de texto. */
export async function leerPdf(ruta: string, max = 15): Promise<TextoPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const tarea = pdfjs.getDocument({ data: new Uint8Array(readFileSync(ruta)), verbosity: 0 });
  const doc = await tarea.promise;
  const paginasEscaneadas: number[] = [];
  let texto = '';
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const pag = await doc.getPage(i);
      const t = (await pag.getTextContent()).items.map((x: any) => x.str ?? '').join(' ');
      if (t.replace(/\s/g, '').length < 30) paginasEscaneadas.push(i);
      if (i <= max) texto += t + '\n';
      pag.cleanup();
    }
    return { paginas: doc.numPages, paginasEscaneadas, texto };
  } finally { await tarea.destroy(); }
}
