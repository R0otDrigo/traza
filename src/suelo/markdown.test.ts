import { describe, it, expect } from 'vitest';
import { aTextoMd, paginasDeMd, paginasRelevantes, limpiar } from './markdown.ts';

describe('Markdown de documentos', () => {
  it('ida y vuelta: páginas → md → páginas (con páginas vacías)', () => {
    const md = aTextoMd(['Hola  mundo', '', 'Capacidad portante 1.85 kg/cm2'], 'x.pdf', 'abc');
    expect(paginasDeMd(md)).toEqual(['Hola mundo', '', 'Capacidad portante 1.85 kg/cm2']);
  });
  it('limpia guiones de corte, espacios y líneas vacías', () => {
    expect(limpiar('meca-\nnica   de\n\n\n\nsuelos')).toBe('mecanica de\n\nsuelos');
  });
  it('elige solo las páginas con datos de suelo, en orden', () => {
    const p = ['Índice general', 'Calicata C-1: estrato GP, SUCS', 'Fotos del terreno', 'Capacidad admisible 1.85 kg/cm2. Perfil S2 según E.030', 'Ensayo de granulometría'];
    expect(paginasRelevantes(p)).toEqual([2, 4]);
  });
});
