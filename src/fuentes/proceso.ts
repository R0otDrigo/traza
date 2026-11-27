// Descarga y análisis de los archivos listados de cada obra: elige candidatos a EMS, descarga, descomprime y puntúa.
import { basename, extname, relative } from 'node:path';
import { statSync } from 'node:fs';
import { archivos, actualizarArchivo, guardarDocumento, marcarObra, obrasEn, type Archivo } from './indice.ts';
import { descargar, descomprimir, esArchivoComprimido, urlDocumento, sha256, pausa } from './descargas.ts';
import { leerPdf, puntajeNombre, puntajeEMS } from './ems.ts';

const etiqueta = (a: Archivo) => `${a.nombre} ${a.seccion}`;

/** Candidatos a EMS: nombre o sección que sugiere suelos/estudios, o el comprimido del expediente completo. */
export const esCandidato = (a: Archivo) =>
  puntajeNombre(etiqueta(a)) > 0 || (a.tipo === 'expediente' && esArchivoComprimido(a.nombre));

/** Puntúa un PDF y lo guarda en el índice como DocumentoEMS. */
export async function analizarPdf(obraId: string, ruta: string, url: string, etiquetaExtra = ''): Promise<number> {
  const t = await leerPdf(ruta);
  const puntaje = puntajeEMS(`${basename(ruta)} ${etiquetaExtra}`, t.texto);
  guardarDocumento({ obraId, url, archivoLocal: ruta, sha256: sha256(ruta), paginas: t.paginas, paginasEscaneadas: t.paginasEscaneadas, puntajeEMS: puntaje });
  return puntaje;
}

/** Analiza un archivo ya descargado (PDF o comprimido). Devuelve el mejor puntaje. */
export async function analizar(a: Archivo): Promise<number> {
  const ruta = a.archivoLocal!;
  const url = urlDocumento(a.uuid);
  if (extname(ruta).toLowerCase() === '.pdf') return analizarPdf(a.obraId, ruta, url, a.seccion);
  if (!esArchivoComprimido(ruta)) return 0;
  let dentro: string[];
  try { dentro = descomprimir(ruta); } catch (e) {
    actualizarArchivo(a.obraId, a.uuid, { estado: 'pendiente_descompresion', nota: (e as Error).message });
    return 0;
  }
  const pdfs = dentro.filter(f => extname(f).toLowerCase() === '.pdf');
  // dentro de un expediente completo se analizan los PDF cuyo nombre sugiere suelos; si no hay, todos los < 40 MB
  const sel = pdfs.filter(f => puntajeNombre(relative(ruta + '_x', f)) > 0);
  let mejor = 0;
  for (const f of sel.length ? sel : pdfs.filter(f => statSync(f).size < 40e6)) {
    try { mejor = Math.max(mejor, await analizarPdf(a.obraId, f, `${url}#${encodeURIComponent(relative(ruta + '_x', f).replace(/\\/g, '/'))}`)); }
    catch (e) { console.log(`    ! no se pudo leer ${basename(f)}: ${(e as Error).message}`); }
  }
  return mejor;
}

/** Descarga los candidatos de una obra (de mayor a menor puntaje de nombre) y los analiza. */
export async function descargarObra(obraId: string, maxMB?: number): Promise<void> {
  const cand = archivos(obraId).filter(a => esCandidato(a) && a.estado === 'pendiente')
    .sort((x, y) => puntajeNombre(etiqueta(y)) - puntajeNombre(etiqueta(x)));
  for (const a of cand) {
    try {
      await pausa();
      const { ruta, sha256 } = await descargar(a.uuid, obraId, a.nombre || a.uuid, maxMB);
      actualizarArchivo(obraId, a.uuid, { estado: 'descargado', archivoLocal: ruta, sha256 });
      const p = await analizar({ ...a, archivoLocal: ruta });
      console.log(`  ↓ ${a.nombre}  puntaje EMS ${p}`);
    } catch (e) {
      const msg = (e as Error).message;
      actualizarArchivo(obraId, a.uuid, { estado: /límite/.test(msg) ? 'omitido' : 'error', nota: msg });
      console.log(`  ! ${a.nombre}: ${msg}`);
    }
  }
  marcarObra(obraId, 'descargada', `${cand.length} candidatos`);
}

/** Obras con ficha procesada y sin descargar. */
export const obrasPorDescargar = () => obrasEn('ficha');

/** Re-analiza todo lo descargado (p. ej. tras cambiar el detector). */
export async function indexar(): Promise<number> {
  let n = 0;
  for (const a of archivos().filter(a => a.archivoLocal && ['descargado', 'pendiente_descompresion'].includes(a.estado))) {
    try { await analizar(a); n++; } catch (e) { console.log(`  ! ${a.nombre}: ${(e as Error).message}`); }
  }
  return n;
}
