import { describe, it, expect } from 'vitest';
import { verificar, tramosDe, direccion } from './engine.ts';
import { vivienda4p } from './caso.ts';

// Cálculo manual de referencia (a contrastar con el Excel del ingeniero civil):
// requerido = 0.35·1.0·1.15·4/56 = 0.02875 → Σ L·t mínimo = 0.02875·128 = 3.68 m²
const p = vivienda4p();
const R = verificar(p);
const ch = (nivel: string, dir: 'X' | 'Y') => R.chequeos.find(c => c.nivel === nivel && c.dir === dir)!;

describe('geometría', () => {
  it('asigna direcciones', () => {
    expect(direccion({ x1: 0, y1: 0, x2: 8, y2: 0 })).toBe('X');
    expect(direccion({ x1: 0, y1: 0, x2: 0, y2: 5 })).toBe('Y');
    expect(direccion({ x1: 0, y1: 0, x2: 3, y2: 3 })).toBeNull();
  });
  it('fachada con puerta 1.0 y ventana 3.0: tramos 1.0, 1.5, 1.5', () => {
    const m = p.muros.find(m => m.id === 'MX-1-N1')!;
    expect(tramosDe(m).map(t => t.L)).toEqual([1.0, 1.5, 1.5]);
  });
});

describe('densidad E.070', () => {
  it('Z·U·S·N/56 = 0.02875', () => expect(R.parametros.requerido).toBeCloseTo(0.02875, 6));
  it('Nivel 1 Y: 2·16·0.23 = 7.36 m² → cumple', () => {
    expect(ch('Nivel 1', 'Y').sumaLt).toBeCloseTo(7.36, 4);
    expect(ch('Nivel 1', 'Y').cumple).toBe(true);
  });
  it('Nivel 1 X: (3.0 + 5.0 + 7.1)·0.13 = 1.963 m² → no cumple, déficit 1.717', () => {
    const c = ch('Nivel 1', 'X');
    expect(c.sumaLt).toBeCloseTo(1.963, 4);
    expect(c.cumple).toBe(false);
    expect(c.deficitLt).toBeCloseTo(3.68 - 1.963, 4);
  });
  it('Nivel 3 X: el muro movido al eje 7 no cuenta → (3.0 + 5.0)·0.13 = 1.04', () => {
    expect(ch('Nivel 3', 'X').sumaLt).toBeCloseTo(1.04, 4);
    expect(R.muros['MX-INT-N3'].motivos.join()).toMatch(/continuidad/);
  });
  it('muro corto (1.0 m) y tabique no cuentan', () => {
    expect(R.muros['MX-CORTO-N1'].estado).toBe('no_cuenta');
    expect(R.muros['TX-11-N1'].estado).toBe('tabique');
  });
});

describe('opciones', () => {
  it('Nivel 3 X: propone devolver el muro del eje 7 al eje 6 (−1 m en Y), aporta 7.1·0.13 = 0.923', () => {
    const o = R.opciones.find(o => o.accion === 'alinear_continuidad' && o.muroId === 'MX-INT-N3')!;
    expect(o.mover).toEqual({ dx: 0, dy: -1 });
    expect(o.deltaLt).toBeCloseTo(0.923, 4);
  });
  it('Nivel 1 X: convertir tabique eje 11 aporta 8·0.13 = 1.04 y es la mejor', () => {
    const o = R.opciones.filter(o => o.nivel === 'Nivel 1' && o.dir === 'X');
    expect(o[0].muroId).toBe('TX-11-N1');
    expect(o[0].deltaLt).toBeCloseTo(1.04, 4);
    // tabique (1.04) + engrosar muro interior a 0.23 (7.1·0.10 = 0.71) cubren el déficit de 1.717
    const esp = o.find(x => x.muroId === 'MX-INT-N1')!;
    expect(esp.deltaLt).toBeCloseTo(0.71, 4);
    expect(o[0].deltaLt + esp.deltaLt).toBeGreaterThan(ch('Nivel 1', 'X').deficitLt);
  });
});
