import { describe, it, expect } from 'vitest';
import { AVISO_SUELO, type EstudioSuelo, type ObraPublica } from '../contracts/index.ts';
import { factorS, zonaDeZ, discrepanciaS } from './factorS.ts';
import { haversine, calidad, ordenarPorDistancia } from './cercania.ts';
import { advertenciasSuelo } from './advertencias.ts';
import { decidirCampo, resultadoSuelo, conS, notasS, sueloVacio } from './flujo.ts';

const T = '2026-01-01T00:00:00.000Z';
const c = <T>(valor: T | null, pagina = 3) => ({ valor, cita: valor === null ? null : { pagina, textoLiteral: String(valor), verificada: true }, estado: 'propuesto' as const, por: 'IA' as const, en: T });

/** EMS de ejemplo armado a mano (sin red). */
const estudio: EstudioSuelo = {
  obraId: 'obra-1', fecha: c('marzo 2012'), calicatas: [c({ id: 'C-1', utm: null, profundidad_m: 3, estratos: [] })],
  perfilE030: c('S2' as const), S_reportadoEMS: c(1.2), capacidadPortante_kgcm2: c(1.8), Df_m: c(1.5),
  tipoCimentacionRecomendada: c('cimiento corrido'), nivelFreatico_m: c(2.5), sulfatos_ppm: c(null), cloruros_ppm: c(null),
  salesSolubles_ppm: c(null), cementoRecomendado: c('Tipo I'), riesgos: [c('colapsable' as const)], recomendacionesEMS: [c('Retirar relleno')],
};
const lote = { lat: -16.3988, lon: -71.5369 }; // Plaza de Armas de Arequipa
const obra = (id: string, dLat: number, precision_m = 50): ObraPublica => ({
  id, entidad: 'Municipalidad', nomenclatura: 'AS-1', anio: 2012, objeto: 'Obra', descripcion: `Obra ${id}`, urlFicha: 'https://seace.gob.pe/x', distrito: 'Arequipa',
  ubicacion: { lat: lote.lat + dLat, lon: lote.lon, origen: 'utm_documento', precision_m },
});
const metro = 1 / 111195; // ° de latitud por metro (R = 6371 km)

describe('factor S (E.030 Tabla 3)', () => {
  it('zona 3', () => {
    expect([factorS(3, 'S0'), factorS(3, 'S1'), factorS(3, 'S2'), factorS(3, 'S3')]).toEqual([0.8, 1.0, 1.15, 1.2]);
    expect(zonaDeZ(0.35)).toBe(3);
    expect(zonaDeZ(0.3)).toBeNull();
    expect(() => factorS(9, 'S1')).toThrow();
  });
  it('discrepancia EMS vs tabla', () => {
    expect(discrepanciaS(1.15, 1.2, 'S2')).toMatch(/Discrepancia/);
    expect(discrepanciaS(1.15, 1.15, 'S2')).toBeNull();
    expect(discrepanciaS(1.15, null, 'S2')).toBeNull();
  });
});

describe('cercanía', () => {
  it('haversine: 1° de latitud ≈ 111.2 km', () => expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1));
  it('umbrales configurables', () => {
    expect([calidad(300), calidad(301), calidad(1000), calidad(1001)]).toEqual(['buena', 'cautela', 'cautela', 'lejana']);
    expect(calidad(400, { buena_m: 500, cautela_m: 2000 })).toBe('buena');
  });
  it('ordena por distancia y omite obras sin ubicación', () => {
    const sin = { ...obra('c', 0), ubicacion: null };
    const r = ordenarPorDistancia(lote, [obra('a', 2000 * metro), obra('b', 100 * metro), sin].map(o => ({ obra: o, tieneEMS: true })));
    expect(r.map(x => x.obra.id)).toEqual(['b', 'a']);
    expect(r[0].distancia_m).toBe(100);
  });
});

describe('advertencias', () => {
  const ctx = { hoy: new Date(T), distancia_m: 1500, precision_m: 800, discrepanciaS: 'Discrepancia de S' };
  it('siempre incluye el aviso de suelo', () => expect(advertenciasSuelo(null, ctx)).toEqual([AVISO_SUELO]));
  it('riesgo, antigüedad, freático, distancia, precisión y discrepancia', () => {
    const a = advertenciasSuelo(estudio, ctx).join('\n');
    for (const re of [/colapsable/, /2012.*10 años/, /freático alto: 2.5/, /ADVERTENCIA FUERTE/, /poco precisa/, /Discrepancia/]) expect(a).toMatch(re);
  });
  it('umbral de freático configurable y riesgos rechazados no cuentan', () => {
    const e = decidirCampo(estudio, 'riesgos', 'rechazar', undefined, 0, T);
    const a = advertenciasSuelo(e, { ...ctx, distancia_m: 100, precision_m: 10, discrepanciaS: null }, { aniosEMS: 20, freatico_m: 2, precision_m: 500 });
    expect(a).toEqual([AVISO_SUELO, expect.stringMatching(/buena referencia/)]);
  });
});

describe('flujo de aprobación', () => {
  const obras = [{ obra: obra('obra-1', 200 * metro), tieneEMS: true }];
  const estado = { ...sueloVacio(), lote, estudio };
  it('sin perfil aprobado no hay S del motor (ningún número de la IA entra al cálculo)', () => {
    const r = resultadoSuelo(estado, obras, 3)!;
    expect(r.S_motor).toBeNull();
    expect(r.distancia_m).toBe(200);
    expect(() => conS({ S: 1, aprobados: true }, r)).toThrow(/aprobar/);
  });
  it('aprobar: S de la tabla, discrepancia con el EMS y S prellenado sin aprobar', () => {
    const e = decidirCampo(estudio, 'perfilE030', 'aprobar', undefined, undefined, T);
    expect(e.perfilE030).toMatchObject({ estado: 'aprobado', por: 'ingeniero', en: T });
    const r = resultadoSuelo({ ...estado, estudio: e }, obras, 3)!;
    expect(r.S_motor).toBe(1.15);
    expect(r.S_fuente).toMatch(/perfil S2, aprobado por ingeniero/);
    expect(r.advertencias.join()).toMatch(/Discrepancia de S: el EMS reporta S = 1.2/);
    expect(conS({ Z: 0.35, U: 1.5, S: 1, aprobados: true }, r)).toMatchObject({ S: 1.15, aprobados: false, S_fuente: r.S_fuente });
  });
  it('corregir valida el valor; rechazar anula el perfil', () => {
    expect(() => decidirCampo(estudio, 'perfilE030', 'corregir', 'S5')).toThrow();
    expect(() => decidirCampo(estudio, 'perfilE030', 'corregir')).toThrow(/valor/);
    expect(() => decidirCampo(estudio, 'noExiste', 'aprobar')).toThrow(/desconocido/);
    const e = decidirCampo(estudio, 'perfilE030', 'corregir', 'S3');
    expect(resultadoSuelo({ ...estado, estudio: e }, obras, 3)!.S_motor).toBe(1.2);
    const x = decidirCampo(e, 'perfilE030', 'rechazar');
    expect(resultadoSuelo({ ...estado, estudio: x }, obras, 3)!.S_motor).toBeNull();
  });
  it('notas: el ingeniero sobrescribe S y queda dicho', () => {
    const e = decidirCampo(estudio, 'perfilE030', 'aprobar');
    const s = { ...estado, estudio: e, resultado: resultadoSuelo({ ...estado, estudio: e }, obras, 3) };
    expect(notasS({ S: 1.2, S_fuente: 'manual (ingeniero)' }, s).join()).toMatch(/sobrescribió S: usa 1.2 en lugar de S = 1.15/);
  });
});
