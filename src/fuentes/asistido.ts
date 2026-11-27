// Modo asistido: una persona navega el SEACE en el Edge visible (y resuelve captchas si aparecen);
// el script captura cada ficha/expediente que se abre y cada documento que se descarga, y los guarda en el índice.
import type { Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { navegador, registrarArchivos, BUSCADOR } from './seace.ts';
import { parsearFicha, distrito } from './parse.ts';
import { idObra, guardarObra, obra as leerObra, marcarObra, actualizarArchivo, DIR_FUENTES } from './indice.ts';
import { analizar } from './proceso.ts';
import { sha256 } from './descargas.ts';

export async function asistido(): Promise<void> {
  const { b, p } = await navegador();
  let actual: string | null = null; // obra de la última ficha vista

  const capturar = async (pg: Page) => {
    if (!/fichaSeleccion\.xhtml|fichaArchivoExpedienteTecnicoObra/.test(pg.url())) return;
    const html = await pg.content();
    const f = parsearFicha(html);
    if (!f.entidad || !f.nomenclatura) return;
    const id = idObra(f.entidad, f.nomenclatura);
    const previa = leerObra(id);
    const anio = Number(/-(20\d\d)-/.exec(f.nomenclatura)?.[1] ?? f.fecha?.slice(-4) ?? new Date().getFullYear());
    guardarObra({ id, entidad: f.entidad, nomenclatura: f.nomenclatura, anio, objeto: f.objeto || 'Obra',
      descripcion: f.descripcion || previa?.descripcion || '', urlFicha: pg.url(), distrito: distrito(f.descripcion), ubicacion: previa?.ubicacion ?? null });
    const n = registrarArchivos(id, html);
    marcarObra(id, 'ficha', `asistido: ${n} archivos listados`);
    actual = id;
    console.log(`✓ ficha ${f.nomenclatura} (${n} archivos)`);
  };

  const vigilar = (pg: Page) => {
    pg.on('load', () => capturar(pg).catch(e => console.log('! ficha:', e.message)));
    pg.on('download', async d => {
      const uuid = /SpacesStore\/([0-9a-f-]{36})/.exec(d.url())?.[1] ?? null;
      const obraId = actual ?? 'sin-obra';
      const dir = join(DIR_FUENTES, obraId);
      mkdirSync(dir, { recursive: true });
      const ruta = join(dir, `${uuid?.slice(0, 8) ?? Date.now()}_${d.suggestedFilename().replace(/[^\w.\- ]+/g, '_')}`);
      await d.saveAs(ruta);
      console.log(`↓ ${d.suggestedFilename()}`);
      if (!uuid || !actual) return console.log('  (sin ficha abierta: guardado, pero no asociado a una obra)');
      actualizarArchivo(obraId, uuid, { estado: 'descargado', archivoLocal: ruta, sha256: sha256(ruta) });
      const a = { obraId, uuid, nombre: d.suggestedFilename(), seccion: '', tipo: 'otro', kb: null, estado: 'descargado', archivoLocal: ruta, sha256: null, nota: null };
      console.log(`  puntaje EMS ${await analizar(a).catch(() => 0)}`);
    });
  };
  p.context().on('page', vigilar);
  vigilar(p);
  await p.goto(BUSCADOR);
  console.log('Modo asistido: navega en la ventana (Buscador de Procedimientos de Selección → ficha → documentos).');
  console.log('Se guardan las fichas abiertas y los documentos descargados. Cierra el navegador para terminar.');
  await new Promise(ok => b.on('disconnected', ok));
}
