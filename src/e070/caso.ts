import type { Proyecto, Muro, Abertura } from './types.ts';

// Casos de prueba. Son la MISMA fuente que usa revit/crear_modelo.cs para construir el modelo en Revit.
export type Punto = [number, number];
export interface CasoPrueba extends Proyecto {
  alturaPiso: number;                                   // m, piso a piso (= altura de muro en Revit)
  losa: { exterior: Punto[]; huecos: Punto[][] };      // planta de la losa de cada nivel
  descripcion: string;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Punto[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Vivienda multifamiliar 4 pisos, lote 8 × 16 m. */
export function vivienda4p(): CasoPrueba {
  const niveles = [1, 2, 3, 4].map(k => ({ nombre: `Nivel ${k}`, elevacion: (k - 1) * 2.6, area: 128 }));
  const muros: Muro[] = [];
  for (const nv of niveles) {
    const k = Number(nv.nombre.split(' ')[1]);
    const n = (id: string) => `${id}-N${k}`;
    const base = { nivel: nv.nombre, h: 2.4, material: 'albañilería', aberturas: [] as Abertura[] };
    muros.push(
      { ...base, id: n('MY-A'), x1: 0, y1: 0, x2: 0, y2: 16, t: 0.23, rol: 'portante', tipoRevit: 'Muro KK cabeza 23' },
      { ...base, id: n('MY-B'), x1: 8, y1: 0, x2: 8, y2: 16, t: 0.23, rol: 'portante', tipoRevit: 'Muro KK cabeza 23' },
      { ...base, id: n('MX-1'), x1: 0, y1: 0, x2: 8, y2: 0, t: 0.13, rol: 'portante', tipoRevit: 'Muro KK soga 13',
        aberturas: k === 1 ? [{ offset: 1.0, ancho: 1.0, tipo: 'puerta' }, { offset: 3.5, ancho: 3.0, tipo: 'ventana' }] : [{ offset: 1.0, ancho: 1.0, tipo: 'ventana' }, { offset: 3.5, ancho: 3.0, tipo: 'ventana' }] },
      { ...base, id: n('MX-16'), x1: 0, y1: 16, x2: 8, y2: 16, t: 0.13, rol: 'portante', tipoRevit: 'Muro KK soga 13', aberturas: [{ offset: 2.5, ancho: 3.0, tipo: 'ventana' }] },
      { ...base, id: n('MX-INT'), x1: 0, y1: k >= 3 ? 7 : 6, x2: 8, y2: k >= 3 ? 7 : 6, t: 0.13, rol: 'portante', tipoRevit: 'Muro KK soga 13', aberturas: [{ offset: 3.5, ancho: 0.9, tipo: 'puerta' }] },
      { ...base, id: n('TX-11'), x1: 0, y1: 11, x2: 8, y2: 11, t: 0.13, rol: 'tabique', tipoRevit: 'Tabique pandereta 13' },
      { ...base, id: n('MX-CORTO'), x1: 0, y1: 8.5, x2: 1.0, y2: 8.5, t: 0.13, rol: 'portante', tipoRevit: 'Muro KK soga 13' },
    );
  }
  // Arequipa: zona 3 (Z = 0.35), vivienda (U = 1.0), suelo intermedio S2 (S = 1.15). Verificar con E.030 vigente y EMS.
  return { nombre: 'Vivienda multifamiliar 4 pisos — Arequipa (caso de prueba)', descripcion: 'Lote 8 × 16 m, 4 pisos', Z: 0.35, U: 1.0, S: 1.15, niveles, muros, alturaPiso: 2.6, losa: { exterior: rect(0, 0, 8, 16), huecos: [] } };
}

/**
 * SIMULACIÓN inspirada en el Palacio Municipal del Portal Municipal (Plaza de Armas de Arequipa):
 * frente de 30 m hacia la plaza con portal de 8 arcos (galería de 4 m), patio central de 12 × 8 m, 3 pisos.
 * NO es el plano real ni su sistema real (sillar sin confinar): es un edificio de albañilería confinada
 * con esa organización espacial, para mostrar problemas típicos de edificios con portales:
 *  - los pilares del portal (0.67 m) no cuentan → la fachada de los pisos altos queda sin continuidad vertical;
 *  - muros interiores de soga (13 cm) con h = 3.0 m incumplen t ≥ h/20 = 0.15 m;
 *  - la arquería tiene un tipo de muro ambiguo: el ingeniero debe decidir su rol.
 */
export function municipalidad(): CasoPrueba {
  const H = 3.0, A = 30, F = 24;
  const niveles = [1, 2, 3].map(k => ({ nombre: `Nivel ${k}`, elevacion: (k - 1) * H, area: A * F - 12 * 8 }));
  const muros: Muro[] = [];
  const vanos = (offs: number[], ancho: number, tipo: string): Abertura[] => offs.map(offset => ({ offset, ancho, tipo }));
  const pilar = (A - 8 * 3) / 9; // 0.667 m
  for (const nv of niveles) {
    const k = Number(nv.nombre.split(' ')[1]);
    const w = (id: string, x1: number, y1: number, x2: number, y2: number, t: number, rol: Muro['rol'], tipoRevit: string, aberturas: Abertura[] = []): Muro =>
      ({ id: `${id}-N${k}`, nivel: nv.nombre, x1, y1, x2, y2, t, h: H, rol, tipoRevit, material: rol === 'tabique' ? 'pandereta' : 'albañilería', aberturas });
    const KK23 = 'Muro KK cabeza 23', KK13 = 'Muro KK soga 13', TAB = 'Tabique pandereta 13';
    muros.push(
      // Dirección Y (perpendicular a la plaza)
      w('MY-0', 0, 0, 0, F, 0.23, 'portante', KK23),
      w('MY-30', A, 0, A, F, 0.23, 'portante', KK23),
      w('MY-5', 5, 4, 5, F, 0.23, 'portante', KK23, vanos([2], 1.0, 'puerta')),
      w('MY-25', 25, 4, 25, F, 0.23, 'portante', KK23, vanos([2], 1.0, 'puerta')),
      w('MY-9P', 9, 10, 9, 18, 0.23, 'portante', KK23, vanos([3.4], 1.2, 'puerta')),
      w('MY-21P', 21, 10, 21, 18, 0.23, 'portante', KK23, vanos([3.4], 1.2, 'puerta')),
      w('MY-15', 15, 18, 15, F, 0.13, 'portante', KK13),
      w('TY-12', 12, 4, 12, 10, 0.13, 'tabique', TAB),
      w('TY-18', 18, 4, 18, 10, 0.13, 'tabique', TAB),
      // Dirección X (paralela a la plaza)
      k === 1
        ? w('MX-PORTAL', 0, 0, A, 0, 0.23, 'portante', 'Arquería portal 23', vanos([0, 1, 2, 3, 4, 5, 6, 7].map(i => pilar + i * (3 + pilar)), 3.0, 'arco'))
        : w('MX-FACHADA', 0, 0, A, 0, 0.23, 'portante', KK23, vanos([0, 1, 2, 3, 4, 5, 6, 7].map(i => 2 + i * 3.5), 1.5, 'balcón')),
      w('MX-4', 0, 4, A, 4, 0.23, 'portante', KK23, vanos([4, 14, 24], 2.0, k === 1 ? 'puerta' : 'ventana')),
      w('MX-10P', 9, 10, 21, 10, 0.23, 'portante', KK23, vanos([2.5, 8.0], 1.5, 'ventana')),
      w('MX-18P', 9, 18, 21, 18, 0.23, 'portante', KK23, vanos([2.5, 8.0], 1.5, 'ventana')),
      w('MX-24', 0, F, A, F, 0.23, 'portante', KK23, vanos([0, 1, 2, 3, 4, 5].map(i => 2.25 + i * 4.75), 1.5, 'ventana')),
      w('MX-10A', 0, 10, 9, 10, 0.13, 'portante', KK13),
      w('MX-10B', 21, 10, A, 10, 0.13, 'portante', KK13),
      w('TX-14A', 0, 14, 5, 14, 0.13, 'tabique', TAB),
      w('TX-14B', 25, 14, A, 14, 0.13, 'tabique', TAB),
    );
  }
  // Centro histórico de Arequipa: zona 3 (Z = 0.35); sede de gobierno local → categoría A2 (U = 1.5, VERIFICAR con E.030);
  // suelo de grava (S1, S = 1.0, verificar con EMS).
  return {
    nombre: 'Municipalidad — Plaza de Armas de Arequipa (SIMULACIÓN)', descripcion: 'Planta simulada inspirada en el Palacio Municipal: portal de 8 arcos, patio central, 3 pisos',
    Z: 0.35, U: 1.5, S: 1.0, niveles, muros, alturaPiso: H,
    losa: { exterior: rect(0, 0, A, F), huecos: [rect(9, 10, 21, 18)] },
  };
}

export const CASOS = { municipalidad, vivienda: vivienda4p } as const;
export type NombreCaso = keyof typeof CASOS;
