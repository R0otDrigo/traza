// Descargas del gestor documental del SEACE (Alfresco, el mismo mecanismo público que usa el navegador),
// caché en data/fuentes/, sha256, reintentos con backoff, límite de tamaño y descompresión con el tar de Windows.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DIR_FUENTES } from './indice.ts';

const ECM = 'https://alfprod.seace.gob.pe/alfresco';
const ECM_OP = 'https://prodcont2.seace.gob.pe/alfresco';
/** URL estable (sin ticket) con la que se cita el documento. */
export const urlDocumento = (uuid: string) => `${ECM}/service/osce/downloadDoc?id=${uuid}`;

export const pausa = (min = 2000, max = 3000) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
export const sha256 = (ruta: string) => createHash('sha256').update(readFileSync(ruta)).digest('hex');

async function conReintentos<T>(fn: () => Promise<T>, intentos = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= intentos - 1 || (e as any).definitivo) throw e;
      await pausa(3000 * 2 ** i, 4000 * 2 ** i);
    }
  }
}

const definitivo = (msg: string) => Object.assign(new Error(msg), { definitivo: true });

/** Descarga un documento del SEACE por su uuid a data/fuentes/<obraId>/. Devuelve la ruta (caché si ya existe). */
export async function descargar(uuid: string, obraId: string, nombre: string, maxMB = Number(process.env.NEXOBIM_MAX_MB ?? 60)): Promise<{ ruta: string; sha256: string }> {
  const dir = join(DIR_FUENTES, obraId);
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `${uuid.slice(0, 8)}_${nombre.replace(/[^\w.\- ]+/g, '_').trim() || 'documento'}`);
  if (existsSync(ruta) && statSync(ruta).size > 0) return { ruta, sha256: sha256(ruta) };
  await conReintentos(async () => {
    const cb = 'c' + Math.floor(Math.random() * 1e8);
    const j = await fetch(`${urlDocumento(uuid)}&doc=${cb}&guest=false`, { signal: AbortSignal.timeout(30000) }).then(r => r.text());
    const m = /"result"\s*:\s*"?(\d+)"?[\s\S]*?"downloadUrl"\s*:\s*"([^"]*)"/.exec(j);
    if (!m) throw new Error(`respuesta inesperada del gestor documental: ${j.slice(0, 120)}`);
    if (m[1] !== '200' && !(m[1] === '201' && m[2])) throw definitivo(`gestor documental respondió ${m[1]}`);
    const r = await fetch((m[1] === '200' ? ECM : ECM_OP) + m[2], { signal: AbortSignal.timeout(10 * 60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const largo = Number(r.headers.get('content-length') ?? 0);
    if (largo > maxMB * 1e6) { await r.body?.cancel(); throw definitivo(`supera el límite de ${maxMB} MB (${(largo / 1e6).toFixed(1)} MB)`); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxMB * 1e6) throw definitivo(`supera el límite de ${maxMB} MB`);
    writeFileSync(ruta, buf);
  });
  return { ruta, sha256: sha256(ruta) };
}

const TAR = existsSync('C:\\Windows\\System32\\tar.exe') ? 'C:\\Windows\\System32\\tar.exe' : 'tar'; // bsdtar: zip, rar, 7z
export const esArchivoComprimido = (ruta: string) => ['.zip', '.rar', '.7z'].includes(extname(ruta).toLowerCase());

/** Descomprime en <ruta>_x/ y devuelve todos los archivos extraídos (recursivo). */
export function descomprimir(ruta: string): string[] {
  const dest = ruta + '_x';
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    try { execFileSync(TAR, ['-xf', ruta, '-C', dest], { stdio: 'pipe' }); } catch (e) {
      const err = String((e as any).stderr ?? e).trim();
      if (!readdirSync(dest).length) throw new Error(`tar no pudo descomprimir ${extname(ruta)}: ${err.slice(0, 200)}`);
    }
  }
  const lista = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? lista(join(d, e.name)) : [join(d, e.name)]);
  return lista(dest);
}
