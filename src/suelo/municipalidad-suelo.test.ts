import { describe, it, expect } from 'vitest';
import { verificar, simular } from '../e070/engine.ts';
import { municipalidad } from '../e070/caso.ts';
import { factorS } from './factorS.ts';
import type { Proyecto } from '../e070/types.ts';

// Cálculo a mano (Ap = 30·24 − 12·8 = 624 m², Z = 0.35, U = 1.5, N = 3):
//  S1: S = 1.00 → requerido = 0.35·1.5·1.00·3/56 = 1.575/56 = 0.028125 → Σ L·t ≥ 0.028125·624 = 17.55 m²
//  S3: S = 1.20 → requerido = 0.35·1.5·1.20·3/56 = 1.890/56 = 0.03375  → Σ L·t ≥ 0.03375·624  = 21.06 m²
//  X = 14.49 (no cumple en ambos); Y = 22.908 (cumple en ambos: 22.908 ≥ 21.06)
//  Plan mínimo: engrosar MX-10A y MX-10B a 23 cm (a 13 cm no cuentan: t < h/20) → X = 14.49 + 2·9·0.23 = 14.49 + 4.14 = 18.63 → cumple S1, NO cumple S3
const base = municipalidad();
const conPerfil = (perfil: 'S1' | 'S3', p: Proyecto = base) => verificar({ ...p, S: factorS(3, perfil) });
const ch = (R: ReturnType<typeof verificar>, d: 'X' | 'Y') => R.chequeos.find(c => c.nivel === 'Nivel 1' && c.dir === d)!;
const plan = verificar(base).opciones.filter(o => o.accion === 'aumentar_espesor' && /MX-10[AB]/.test(o.muroId));
const engrosado = simular(base, plan);

describe('Municipalidad: suelo S1 vs S3', () => {
  it('requerido y Σ L·t mínimo', () => {
    for (const [perfil, req, min] of [['S1', 0.028125, 17.55], ['S3', 0.03375, 21.06]] as const) {
      const R = conPerfil(perfil);
      expect(R.parametros.requerido).toBeCloseTo(req, 6);
      expect(R.parametros.requerido * ch(R, 'X').Ap).toBeCloseTo(min, 4);
    }
  });
  it('X = 14.49 no cumple con S1 ni con S3; Y = 22.908 cumple con ambos', () => {
    for (const perfil of ['S1', 'S3'] as const) {
      const R = conPerfil(perfil);
      expect(ch(R, 'X').sumaLt).toBeCloseTo(14.49, 4);
      expect(ch(R, 'X').cumple).toBe(false);
      expect(ch(R, 'Y').sumaLt).toBeCloseTo(22.908, 4);
      expect(ch(R, 'Y').cumple).toBe(true);
    }
  });
  it('tras engrosar MX-10A y MX-10B (X = 18.63): cumple con S1, NO con S3', () => {
    expect(plan.map(o => o.muroId).sort()).toEqual(['MX-10A-N1', 'MX-10A-N2', 'MX-10A-N3', 'MX-10B-N1', 'MX-10B-N2', 'MX-10B-N3']);
    const s1 = conPerfil('S1', engrosado), s3 = conPerfil('S3', engrosado);
    expect(ch(s1, 'X').sumaLt).toBeCloseTo(18.63, 4);
    expect(ch(s1, 'X').cumple).toBe(true);
    expect(ch(s3, 'X').cumple).toBe(false);
    expect(ch(s3, 'X').deficitLt).toBeCloseTo(21.06 - 18.63, 2); // 2.43 m² faltan con S3
  });
});
