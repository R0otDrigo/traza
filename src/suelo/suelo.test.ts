// EMS ficticio: lectura de PDF (sin OCR para no depender de red), reglas con citas verificadas, anti-invención y UTM.
import { describe, it, expect, beforeAll } from 'vitest';
import { leerPdf } from './pdf.ts';
import { utmALatLon, ubicarObra, utmEnTexto } from './ubicacion.ts';
import { extraerPorReglas, verificarCita, aCampo, normalizar, verificarRespuestas } from '../ai/suelo.ts';
import { EstudioSuelo } from '../contracts/index.ts';

let paginas: string[];
beforeAll(async () => {
  const r = await leerPdf('fixtures/ems_ejemplo.pdf', { ocr: false });
  paginas = r.paginas;
  expect(r.escaneadas).toEqual([3]);
  expect(r.noLegibles).toEqual([3]);
});

describe('normalización', () => {
  it('ignora tildes, mayúsculas, espacios y superíndices', () => {
    expect(normalizar('  Nivel   FREÁTICO\n no  encontrado ')).toBe('nivel freatico no encontrado');
    expect(normalizar('1.85 kg/cm²')).toBe('1.85 kg/cm2');
  });
});

describe('extracción por reglas sobre el fixture', () => {
  it('extrae lo esencial con citas verificadas', () => {
    const e = EstudioSuelo.parse(extraerPorReglas('obra-x', paginas));
    const v = (c: { valor: unknown; cita: { verificada: boolean } | null; estado: string; por: string }) => {
      expect(c.cita?.verificada).toBe(true);
      expect([c.estado, c.por]).toEqual(['propuesto', 'motor']);
      return c.valor;
    };
    expect(v(e.perfilE030)).toBe('S2');
    expect(v(e.S_reportadoEMS)).toBe(1.15);
    expect(v(e.capacidadPortante_kgcm2)).toBe(1.85);
    expect(v(e.Df_m)).toBe(1.5);
    expect(v(e.nivelFreatico_m)).toBeNull(); // "No se encontró nivel freático", con cita
    expect(v(e.sulfatos_ppm)).toBe(420);
    expect(v(e.cloruros_ppm)).toBe(310);
    expect(v(e.salesSolubles_ppm)).toBe(1250);
    expect(v(e.cementoRecomendado)).toBe('Tipo I');
    expect(v(e.fecha)).toBe('15 de marzo de 2025');
    expect(e.capacidadPortante_kgcm2.cita?.pagina).toBe(5);
    expect(e.calicatas.map(c => v(c) && c.valor!.id)).toEqual(['C-1', 'C-2', 'C-3']);
    const c1 = e.calicatas[0].valor!;
    expect(c1.utm).toEqual({ este: 227450, norte: 8186320, zona: '19S' });
    expect(c1.estratos.map(s => s.SUCS)).toEqual(['SM', 'GP']);
    expect(e.recomendacionesEMS).toHaveLength(3);
  });

  it('toma estratos de una página OCR', () => {
    const ocr = 'REGISTRO DE EXCAVACIÓN — CALICATA C-3\nProfundidad total: 2.50 m\n0.00 a 0.50 m: arena limosa (SM).\n0.50 a 2.50 m: grava (GP).';
    const e = extraerPorReglas('x', [paginas[1], ocr]);
    expect(e.calicatas.find(c => c.valor?.id === 'C-3')!.valor!.estratos.map(s => s.SUCS)).toEqual(['SM', 'GP']);
  });
});

describe('anti-invención', () => {
  const pags = ['Factor de suelo S = 1.15', 'Capacidad portante admisible: 1.85 kg/cm2'];
  it('acepta una cita literal aunque cambien tildes y espacios', () => {
    expect(verificarCita(pags, 2, 'capacidad  portante ADMISIBLE: 1.85 kg/cm²', 1.85)?.verificada).toBe(true);
  });
  it('cita que no está en la página → null con motivo', () => {
    const c = aCampo(pags, { valor: 3.2, pagina: 2, textoLiteral: 'Capacidad portante admisible: 3.2 kg/cm2' }, 'IA');
    expect(c.valor).toBeNull();
    expect(c.cita).toMatchObject({ verificada: false, motivo: 'no verificable' });
  });
  it('cita real en otra página → no verificable', () => {
    expect(aCampo(pags, { valor: 1.15, pagina: 2, textoLiteral: 'Factor de suelo S = 1.15' }, 'IA').valor).toBeNull();
  });
  it('cita real pero número distinto al escrito → no verificable', () => {
    expect(aCampo(pags, { valor: 1.2, pagina: 1, textoLiteral: 'Factor de suelo S = 1.15' }, 'IA').valor).toBeNull();
  });
  it('respuesta de la "IA" fusionada: solo pasa lo verificable', () => {
    const vacio = { valor: null, pagina: null, textoLiteral: null };
    const bloque = {
      fecha: vacio, calicatas: [], perfilE030: { valor: 'S2' as const, pagina: 1, textoLiteral: 'Perfil de suelo: S2' },
      S_reportadoEMS: { valor: 1.15, pagina: 1, textoLiteral: 'S = 1.15' }, capacidadPortante_kgcm2: { valor: 4, pagina: 2, textoLiteral: 'qadm = 4 kg/cm2' },
      Df_m: vacio, tipoCimentacionRecomendada: vacio, nivelFreatico_m: vacio, sulfatos_ppm: vacio, cloruros_ppm: vacio, salesSolubles_ppm: vacio,
      cementoRecomendado: vacio, riesgos: [], recomendacionesEMS: [],
    };
    const e = EstudioSuelo.parse(verificarRespuestas('x', pags, [bloque]));
    expect(e.S_reportadoEMS).toMatchObject({ valor: 1.15, por: 'IA', estado: 'propuesto' });
    expect(e.perfilE030.valor).toBeNull(); // "Perfil de suelo: S2" no está en la página 1
    expect(e.capacidadPortante_kgcm2.cita?.motivo).toBe('no verificable');
  });
});

describe('ubicación', () => {
  it('UTM 19S → lat/lon en un punto conocido (meridiano central, ecuador)', () => {
    const p = utmALatLon(500000, 10000000);
    expect(p.lat).toBeCloseTo(0, 6);
    expect(p.lon).toBeCloseTo(-69, 6);
  });
  it('calicatas del fixture caen en Arequipa, sin pedir a Nominatim', async () => {
    const u = await ubicarObra(extraerPorReglas('x', paginas));
    expect(u?.origen).toBe('utm_documento');
    expect(u!.lat).toBeGreaterThan(-16.45); expect(u!.lat).toBeLessThan(-16.35);
    expect(u!.lon).toBeGreaterThan(-71.65); expect(u!.lon).toBeLessThan(-71.5);
    expect(utmEnTexto(paginas)).toEqual({ este: 227480, norte: 8186300 });
  });
});
