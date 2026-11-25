import { describe, it, expect } from 'vitest';
import { generarEdificio } from '../bim/parametric';
import { HIPOTESIS_BASE, valoresDe } from './criteria';
import { evaluar, areaTributaria } from './engine';

// Valores calculados a mano (reemplazar/ampliar con el Excel del ingeniero civil).
const ed = generarEdificio();
const v = valoresDe(HIPOTESIS_BASE);
const R = evaluar(ed, v);

describe('áreas tributarias', () => {
  it('interior B2 = 5.75 × 5.5', () => {
    const t = areaTributaria(ed, 1, 1);
    expect(t.tipo).toBe('interior');
    expect(t.area).toBeCloseTo(31.625, 6);
  });
  it('esquina A1 = 2.75 × 2.5', () => {
    const t = areaTributaria(ed, 0, 0);
    expect(t.tipo).toBe('esquina');
    expect(t.area).toBeCloseTo(6.875, 6);
  });
});

describe('columnas', () => {
  it('B2 piso 1: P = 31.625·(3·850 + 700) = 102 781.25 kg → Ag = 1087.63 cm²', () => {
    const r = R.get('C-B2-N1')!;
    expect(r.valor).toBeCloseTo(102781.25 / (0.45 * 210), 1);
    expect(r.estado).toBe('revisar'); // 1087.63 / 1200 = 0.906
  });
  it('C3 piso 1 (25×30) no cumple', () => {
    expect(R.get('C-C3-N1')!.estado).toBe('no_cumple');
  });
  it('B2 piso 4 (azotea) solo carga 700 kg/m²', () => {
    expect(R.get('C-B2-N4')!.valor).toBeCloseTo((31.625 * 700) / (0.45 * 210), 1);
  });
});

describe('vigas', () => {
  it('eje 2 (B-C), 6 m entre columnas de 30 cm: Ln = 5.70, h_min = 0.475', () => {
    const r = R.get('V-N1-2(B-C)')!;
    expect(r.valor).toBeCloseTo(0.475, 3);
    expect(r.ratio).toBeCloseTo(0.86, 2);
    expect(r.estado).toBe('cumple');
  });
  it('detecta peralte insuficiente (h = 40 cm)', () => {
    expect(R.get('V-N2-2(B-C)')!.estado).toBe('no_cumple');
  });
  it('detecta ancho menor al mínimo (b = 20 cm)', () => {
    const r = R.get('V-N3-A(1-2)')!;
    expect(r.estado).toBe('no_cumple');
    expect(r.advertencias.join()).toMatch(/Ancho/);
  });
});

describe('losas', () => {
  it('paño central 6×6: Ln = 5.75 → h ≥ 0.23 → propone 25 cm', () => {
    const r = R.get('L-N1-B2')!;
    expect(r.valor).toBeCloseTo(0.23, 2);
    expect(r.propuesto).toBe('h = 25 cm');
    expect(r.estado).toBe('revisar');
  });
  it('detecta losa central de 20 cm en piso 3', () => {
    expect(R.get('L-N3-B2')!.estado).toBe('no_cumple');
  });
});
