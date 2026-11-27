import { describe, it, expect } from 'vitest';
import { EstudioSuelo, ObraPublica, Notificacion } from './index.ts';

const prop = <T>(valor: T, pagina = 3, texto = 'texto') => ({ valor, cita: { pagina, textoLiteral: texto, verificada: true }, estado: 'propuesto' as const, por: 'IA' as const, en: '2026-11-27T10:00:00Z' });
const nulo = { valor: null, cita: null, estado: 'propuesto' as const, por: 'IA' as const, en: '2026-11-27T10:00:00Z' };

describe('contratos', () => {
  it('EstudioSuelo acepta un estudio completo con citas y campos no encontrados', () => {
    const e = {
      obraId: 'obra-1', fecha: prop('2021-05-10'),
      calicatas: [prop({ id: 'C-1', utm: { este: 229500, norte: 8186000, zona: '19S' }, profundidad_m: 3, estratos: [{ desde_m: 0, hasta_m: 3, SUCS: 'GP', descripcion: 'Grava mal graduada' }] })],
      perfilE030: prop('S1'), S_reportadoEMS: prop(1.0), capacidadPortante_kgcm2: prop(2.5), Df_m: prop(1.5),
      tipoCimentacionRecomendada: prop('Zapatas aisladas'), nivelFreatico_m: nulo, sulfatos_ppm: prop(120),
      cloruros_ppm: prop(80), salesSolubles_ppm: prop(400), cementoRecomendado: prop('Tipo I'),
      riesgos: [], recomendacionesEMS: [prop('Cimentar sobre terreno natural')],
    };
    expect(EstudioSuelo.parse(e).perfilE030.valor).toBe('S1');
  });
  it('rechaza perfiles fuera de la E.030 y UTM de otra zona', () => {
    expect(() => EstudioSuelo.shape.perfilE030.parse(prop('S4'))).toThrow();
    expect(() => EstudioSuelo.shape.calicatas.parse([prop({ id: 'C', utm: { este: 1, norte: 1, zona: '18S' }, profundidad_m: 1, estratos: [] })])).toThrow();
  });
  it('ObraPublica sin ubicación todavía y Notificacion con link al nivel', () => {
    expect(ObraPublica.parse({ id: 'x', entidad: 'Municipalidad Distrital de Cayma', nomenclatura: 'AS-SM-1-2023-MDC-1', anio: 2023, objeto: 'Obra', descripcion: 'Mejoramiento', urlFicha: 'https://prod2.seace.gob.pe/ficha', distrito: 'Cayma', ubicacion: null }).ubicacion).toBeNull();
    expect(Notificacion.parse({ nivel: 'Nivel 2', dir: 'X', tipo: 'deja_de_cumplir', mensaje: 'Nivel 2 X ya no cumple', url: 'http://localhost:5173/#nivel=Nivel%202&dir=X' }).tipo).toBe('deja_de_cumplir');
  });
});
