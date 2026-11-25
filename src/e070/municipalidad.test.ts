import { describe, it, expect } from 'vitest';
import { verificar, simular, tramosDe } from './engine.ts';
import { municipalidad } from './caso.ts';

// Cálculo manual: Ap = 30·24 − 12·8 = 624 m²; requerido = 0.35·1.5·1.0·3/56 = 0.028125 → Σ L·t ≥ 17.55 m²
const p = municipalidad();
const R = verificar(p);
const ch = (n: string, d: 'X' | 'Y') => R.chequeos.find(c => c.nivel === n && c.dir === d)!;

describe('Municipalidad (simulación)', () => {
  it('requerido y área', () => {
    expect(R.parametros.requerido).toBeCloseTo(0.028125, 6);
    expect(ch('Nivel 1', 'X').Ap).toBe(624);
  });
  it('portal: 8 arcos de 3 m dejan 9 pilares de 0.667 m que no cuentan', () => {
    const t = tramosDe(p.muros.find(m => m.id === 'MX-PORTAL-N1')!);
    expect(t).toHaveLength(9);
    expect(t.every(x => x.L < 1.2)).toBe(true);
    expect(R.muros['MX-PORTAL-N1'].estado).toBe('no_cuenta');
  });
  it('X: (24 + 9 + 9 + 21)·0.23 = 14.49 m² en todos los niveles → no cumple', () => {
    for (const n of ['Nivel 1', 'Nivel 2', 'Nivel 3']) {
      expect(ch(n, 'X').sumaLt).toBeCloseTo(14.49, 4);
      expect(ch(n, 'X').cumple).toBe(false);
    }
  });
  it('fachada de pisos altos sobre el portal: sin continuidad vertical', () => {
    expect(R.muros['MX-FACHADA-N2'].motivos.join()).toMatch(/continuidad/);
  });
  it('muros de soga con h = 3.0 m: t = 0.13 < h/20 = 0.15', () => {
    expect(R.muros['MX-10A-N1'].motivos.join()).toMatch(/h\/20/);
  });
  it('Y: 2·24·0.23 + 2·19·0.23 + 2·6.8·0.23 = 22.908 m² → cumple', () => {
    expect(ch('Nivel 1', 'Y').sumaLt).toBeCloseTo(22.908, 4);
    expect(ch('Nivel 1', 'Y').cumple).toBe(true);
  });
  it('opciones: engrosar MX-10A y MX-10B a 23 cm aporta 2·9·0.23 = 4.14 y cubre el déficit de 3.06', () => {
    const o = R.opciones.filter(o => o.nivel === 'Nivel 1' && o.dir === 'X' && o.accion === 'aumentar_espesor' && /MX-10[AB]/.test(o.muroId));
    expect(o).toHaveLength(2);
    expect(o[0].deltaLt).toBeCloseTo(2.07, 4);
    const tab = R.opciones.find(o => o.muroId === 'TX-14A-N1')!;
    expect(tab.espesor).toBe(0.23); // la soga no alcanza h/20 → se convierte en cabeza
    const tras = verificar(simular(p, R.opciones.filter(o => /MX-10[AB]/.test(o.muroId))));
    expect(tras.chequeos.every(c => c.cumple)).toBe(true);
  });
});
