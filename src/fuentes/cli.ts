// Comandos suelo:* de scripts/nexobim.ts. Los tres modos (automático, asistido, manual) alimentan el mismo índice.
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { idObra, guardarObra, listarObras, documentosEMS, archivos, obra as leerObra, marcarObra, DIR_FUENTES } from './indice.ts';
import { descargarObra, obrasPorDescargar, indexar, analizarPdf } from './proceso.ts';
import { cercanos } from './cercanos.ts';
import { distrito } from './parse.ts';

const ENTIDADES: { nombre: string }[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/fuentes/entidades.json', import.meta.url)), 'utf8')).entidades;

const resolverEntidades = (e: string) => e === 'todas' ? ENTIDADES.map(x => x.nombre)
  : [ENTIDADES.find(x => x.nombre.includes(e.toUpperCase()))?.nombre ?? e.toUpperCase()];

export async function suelo(cmd: string, argv: string[]): Promise<void> {
  const { values: v } = parseArgs({ args: argv, strict: false, options: {
    entidad: { type: 'string' }, anios: { type: 'string' }, max: { type: 'string' }, obra: { type: 'string' }, 'max-mb': { type: 'string' },
    lat: { type: 'string' }, lon: { type: 'string' }, pdf: { type: 'string' }, url: { type: 'string' }, nomenclatura: { type: 'string' },
    anio: { type: 'string' }, descripcion: { type: 'string' }, precision: { type: 'string' } } });
  const s = (k: string) => v[k] as string | undefined;

  switch (cmd) {
    case 'suelo:buscar': {
      const { navegador, buscarYProcesar } = await import('./seace.ts');
      const [a0, a1] = (s('anios') ?? '2018-2026').split('-').map(Number);
      const max = s('max') ? +s('max')! : Infinity;
      const { b, p } = await navegador();
      try {
        for (const ent of resolverEntidades(s('entidad') ?? 'todas'))
          for (let anio = a1 ?? a0; anio >= a0; anio--) {
            console.log(`${ent} — ${anio}`);
            const r = await buscarYProcesar(p, ent, anio, max);
            console.log(`  ${r.filas} obras listadas, ${r.procesadas} fichas procesadas`);
          }
      } finally { await b.close(); }
      break;
    }
    case 'suelo:descargar': {
      const ids = s('obra') ? [s('obra')!] : obrasPorDescargar();
      for (const id of ids) { console.log(`${leerObra(id)?.nomenclatura ?? id}`); await descargarObra(id, s('max-mb') ? +s('max-mb')! : undefined); }
      break;
    }
    case 'suelo:indexar': console.log(`${await indexar()} archivos re-analizados`); break;
    case 'suelo:asistido': await (await import('./asistido.ts')).asistido(); break;
    case 'suelo:manual': {
      const pdf = resolve(s('pdf') ?? ''), entidad = (s('entidad') ?? 'MANUAL').toUpperCase();
      if (!s('pdf') || !s('url') || !s('lat') || !s('lon')) throw new Error('Uso: suelo:manual --pdf <ruta> --url <origen> --lat <lat> --lon <lon> --entidad <nombre> [--nomenclatura --anio --descripcion --precision]');
      const nomen = s('nomenclatura') ?? basename(pdf);
      const id = idObra(entidad, nomen);
      const desc = s('descripcion') ?? '';
      guardarObra({ id, entidad, nomenclatura: nomen, anio: +(s('anio') ?? new Date().getFullYear()), objeto: 'Obra', descripcion: desc,
        urlFicha: s('url')!, distrito: distrito(desc), ubicacion: { lat: +s('lat')!, lon: +s('lon')!, origen: 'manual', precision_m: +(s('precision') ?? 50) } });
      const dir = join(DIR_FUENTES, id); mkdirSync(dir, { recursive: true });
      const dest = join(dir, basename(pdf)); copyFileSync(pdf, dest);
      const p = await analizarPdf(id, dest, s('url')!);
      marcarObra(id, 'manual');
      console.log(`✓ obra ${id} guardada; ${basename(pdf)} puntaje EMS ${p}`);
      break;
    }
    case 'suelo:ubicar': { // coordenadas desde INFObras para obras sin ubicación
      const { ubicarEnInfobras } = await import('./infobras.ts');
      const { actualizarUbicacion } = await import('./indice.ts');
      for (const { obra: o } of listarObras().filter(x => !x.obra.ubicacion && (!s('obra') || x.obra.id === s('obra')))) {
        const u = await ubicarEnInfobras(o).catch(e => (console.log(`  ! ${o.nomenclatura}: ${e.message}`), null));
        if (u) actualizarUbicacion(o.id, u.ubicacion);
        console.log(u ? `✓ ${o.nomenclatura} → INFObras ${u.codigo} (${u.ubicacion.lat}, ${u.ubicacion.lon})` : `  ${o.nomenclatura}: sin coincidencia en INFObras`);
      }
      break;
    }
    case 'suelo:cercanos': {
      if (!s('lat') || !s('lon')) throw new Error('Uso: suelo:cercanos --lat <lat> --lon <lon>');
      const r = cercanos(+s('lat')!, +s('lon')!);
      if (!r.length) console.log('Ninguna obra del índice tiene ubicación todavía.');
      for (const x of r) console.log(`${String(x.distancia_m).padStart(7)} m  ${x.tieneEMS ? 'EMS' : '   '}  ${x.obra.nomenclatura}  ${x.obra.entidad}`);
      break;
    }
    default: { // suelo:estado
      const obras = listarObras();
      console.log(`${obras.length} obras, ${obras.filter(o => o.tieneEMS).length} con EMS detectado`);
      for (const { obra: o, tieneEMS } of obras) {
        const a = archivos(o.id), d = documentosEMS(o.id)[0];
        console.log(`${tieneEMS ? 'EMS' : '   '} ${o.nomenclatura}  ${o.distrito ?? ''}  [${leerObra(o.id)?.estado}] ${a.length} archivos${d ? `  mejor: ${basename(d.archivoLocal)} (${d.puntajeEMS})` : ''}`);
      }
    }
  }
}
