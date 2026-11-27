// Factor de suelo S (E.030 Tabla 3). Los valores viven en data/normas/e030_factor_s.json (VALIDAR CON INGENIERO).
import { readFileSync } from 'node:fs';

export type Perfil = 'S0' | 'S1' | 'S2' | 'S3';
export const TABLA: { fuente: string; estado: string; Z: Record<string, number>; S: Record<string, Record<Perfil, number>> } =
  JSON.parse(readFileSync(new URL('../../data/normas/e030_factor_s.json', import.meta.url), 'utf8'));

export function factorS(zona: number, perfil: Perfil): number {
  const s = TABLA.S[zona]?.[perfil];
  if (s === undefined) throw new Error(`Sin factor S para zona ${zona} y perfil ${perfil} en E.030 Tabla 3.`);
  return s;
}

/** Zona sísmica a partir del Z de los parámetros (Tabla 1); null si Z no coincide con ninguna zona. */
export function zonaDeZ(Z: number): number | null {
  const z = Object.entries(TABLA.Z).find(([, v]) => Math.abs(v - Z) < 1e-9);
  return z ? Number(z[0]) : null;
}

/** Advertencia si el EMS reporta un S distinto al de la tabla: el ingeniero elige. */
export function discrepanciaS(S_motor: number, S_ems: number | null, perfil: Perfil): string | null {
  if (S_ems === null || Math.abs(S_ems - S_motor) < 0.005) return null;
  return `Discrepancia de S: el EMS reporta S = ${S_ems}, pero E.030 Tabla 3 da S = ${S_motor} para el perfil ${perfil}. El ingeniero elige cuál usar.`;
}
