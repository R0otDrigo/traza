import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { puntajeNombre, puntajeTexto, puntajeEMS } from './ems.ts';
import { parsearResultados, parsearEnlaces, parsearFicha, distrito, tipoArchivo } from './parse.ts';
import * as I from './indice.ts';
import { haversine } from './cercanos.ts';
import { lugar, coincidencia } from './infobras.ts';
import { ObraPublica, DocumentoEMS } from '../contracts/index.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('detector de EMS', () => {
  const ems = `ESTUDIO DE MECÁNICA DE SUELOS CON FINES DE CIMENTACIÓN. Norma E.050. Se excavaron 3 calicatas (C-1, C-2, C-3).
    Clasificación SUCS: GP. Perfil de suelo tipo S1. Capacidad portante admisible 2.1 kg/cm2.`;
  const memoria = 'MEMORIA DESCRIPTIVA. El proyecto comprende la renovación de veredas y señalización en la avenida.';
  it('el texto de un EMS puntúa alto y una memoria descriptiva no', () => {
    expect(puntajeTexto(ems)).toBeGreaterThanOrEqual(15);
    expect(puntajeTexto(memoria)).toBe(0);
  });
  it('el nombre de archivo aporta puntaje', () => {
    expect(puntajeNombre('ESTUDIO_DE_MECANICA_DE_SUELOS.pdf')).toBe(10);
    expect(puntajeNombre('11. ESTUDIOS TECNICOS.pdf')).toBe(3);
    expect(puntajeNombre('9. CRONOGRAMAS.pdf')).toBe(0);
    expect(puntajeEMS('EMS.pdf', ems)).toBeGreaterThan(puntajeEMS('memoria.pdf', memoria));
  });
});

describe('parseo del SEACE (HTML guardado)', () => {
  it('lee la tabla de resultados', () => {
    const r = parsearResultados(fx('resultados.html'));
    expect(r).toHaveLength(5);
    expect(r[0]).toMatchObject({ entidad: 'MUNICIPALIDAD PROVINCIAL DE AREQUIPA', nomenclatura: 'AS-SM-38-2024-MPA-1', objeto: 'Obra' });
  });
  it('lee la cabecera y los documentos de la ficha', () => {
    const f = parsearFicha(fx('ficha.html'));
    expect(f).toMatchObject({ entidad: 'MUNICIPALIDAD PROVINCIAL DE AREQUIPA', nomenclatura: 'AS-SM-38-2024-MPA-1', objeto: 'Obra', fecha: '17/07/2024', tieneExpediente: true });
    expect(f.descripcion).toMatch(/AV\. ANDRES AVELINO CACERES/);
    const docs = parsearEnlaces(fx('ficha.html'));
    expect(docs[0]).toMatchObject({ uuid: '1f03a71f-d606-4a57-86d1-98ce81015cf5', nombre: 'BASES AS 0382024 AVELINO.pdf', kb: 3557 });
    expect(tipoArchivo(docs[0])).toBe('bases');
  });
  it('encuentra el estudio de suelos en el expediente técnico', () => {
    const docs = parsearEnlaces(fx('expediente.html'));
    expect(docs.length).toBe(18);
    const est = docs.find(d => d.seccion === 'Estudios Técnicos')!;
    expect(est).toMatchObject({ uuid: '9d048c14-bb78-4cb5-838e-4c74f0792611', nombre: '11. ESTUDIOS TECNICOS.pdf', kb: 14808.11 });
    expect(est.fila).toMatch(/ESTUDIO DE SUELOS/);
    expect(puntajeNombre(est.fila)).toBe(10);
    expect(tipoArchivo(est)).toBe('expediente');
  });
  it('extrae el distrito de la descripción', () => {
    expect(distrito('OBRA EN LA AV. X, DISTRITO DE JACOBO HUNTER Y DISTRITO DE JOSE LUIS BUSTAMANTE')).toBe('JACOBO HUNTER');
    expect(distrito('PARQUE LAS CONDES, DISTRITO DE AREQUIPA, PROVINCIA DE AREQUIPA')).toBe('AREQUIPA');
    expect(distrito('sin dato')).toBeNull();
  });
});

describe('INFObras: emparejar por lugar', () => {
  const d = 'CONTRATACIÓN DE EJECUCIÓN DE OBRA "MEJORAMIENTO DEL SERVICIO DE PRACTICA DEPORTIVA Y/O RECREATIVA EN EL PARQUE LAS CONDES URB. LA PERLA, DISTRITO DE AREQUIPA';
  it('extrae el lugar de la descripción', () => {
    expect(lugar(d)).toBe('PARQUE LAS CONDES URB. LA PERLA');
    expect(lugar('REPARACIÓN DE CALZADA; EN EL (LA) AV. ANDRES AVELINO CACERES, DISTRITO DE JACOBO HUNTER')).toBe('AV. ANDRES AVELINO CACERES');
  });
  it('mide la coincidencia de nombres', () => {
    expect(coincidencia(d, 'MEJORAMIENTO DEL SERVICIO DE PRÁCTICA DEPORTIVA Y/O RECREATIVA EN PARQUE LAS CONDES, URB. LA PERLA DISTRITO DE AREQUIPA')).toBeGreaterThan(0.8);
    expect(coincidencia(d, 'CONSTRUCCION DE COBERTURA EN LA I.E. 15 DISTRITO DE SANTA MARIA')).toBeLessThan(0.2);
  });
});

describe('índice SQLite', () => {
  it('guarda obras y documentos, y ordena por puntaje', () => {
    I.abrir(join(mkdtempSync(join(tmpdir(), 'nexobim-')), 'indice.db'));
    const id = I.idObra('MUNICIPALIDAD DISTRITAL DE YURA', 'AS-SM-1-2024-MDY-1');
    expect(id).toBe(I.idObra('municipalidad distrital de yura ', 'as-sm-1-2024-mdy-1'));
    const o = ObraPublica.parse({ id, entidad: 'MUNICIPALIDAD DISTRITAL DE YURA', nomenclatura: 'AS-SM-1-2024-MDY-1', anio: 2024, objeto: 'Obra', descripcion: 'x', urlFicha: 'https://prod2.seace.gob.pe/x', distrito: 'YURA', ubicacion: null });
    I.guardarObra(o);
    I.guardarObra({ ...o, descripcion: 'y' }); // idempotente
    expect(I.listarObras()).toEqual([{ obra: { ...o, descripcion: 'y' }, tieneEMS: false }]);
    const d = (archivoLocal: string, puntajeEMS: number) => DocumentoEMS.parse({ obraId: id, url: 'https://alfprod.seace.gob.pe/x', archivoLocal, sha256: 'a'.repeat(64), paginas: 10, paginasEscaneadas: [3], puntajeEMS });
    I.guardarDocumento(d('a.pdf', 5));
    I.guardarDocumento(d('b.pdf', 30));
    expect(I.documentosEMS(id).map(x => x.archivoLocal)).toEqual(['b.pdf', 'a.pdf']);
    expect(I.listarObras()[0].tieneEMS).toBe(true);
    I.actualizarUbicacion(id, { lat: -16.35, lon: -71.6, origen: 'manual', precision_m: 50 });
    expect(I.listarObras()[0].obra.ubicacion?.lat).toBe(-16.35);
  });
  it('haversine en metros', () => {
    expect(haversine(-16.4, -71.5, -16.4, -71.5)).toBe(0);
    expect(Math.round(haversine(-16.4, -71.5, -16.41, -71.5))).toBe(1112);
  });
});
