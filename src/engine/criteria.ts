import type { Hipotesis } from '../types';

// Hipótesis y coeficientes por defecto. El INGENIERO CIVIL debe revisarlos y
// confirmar la cita normativa exacta. Las marcadas "criterio práctico" no son
// texto literal de la norma.
export const HIPOTESIS_BASE: Hipotesis[] = [
  { clave: 'fc', descripcion: "Resistencia del concreto f'c", valor: 210, unidad: 'kg/cm²', fuente: 'criterio', norma: 'E.060 — concreto estructural (verificar art.)', aprobada: null },
  { clave: 'cv', descripcion: 'Sobrecarga oficinas', valor: 250, unidad: 'kg/m²', fuente: 'criterio', norma: 'E.020 Tabla 1 — oficinas', aprobada: null },
  { clave: 'cvAzotea', descripcion: 'Sobrecarga azotea', valor: 100, unidad: 'kg/m²', fuente: 'criterio', norma: 'E.020 — techos (verificar art.)', aprobada: null },
  { clave: 'pesoLosa', descripcion: 'Peso losa aligerada h=0.20', valor: 300, unidad: 'kg/m²', fuente: 'criterio', norma: 'E.020 Anexo 1', aprobada: null },
  { clave: 'acabados', descripcion: 'Piso terminado', valor: 100, unidad: 'kg/m²', fuente: 'criterio', norma: 'E.020 Anexo 1 (verificar)', aprobada: null },
  { clave: 'tabiqueria', descripcion: 'Tabiquería equivalente', valor: 100, unidad: 'kg/m²', fuente: 'criterio', norma: 'E.020 — tabiquería móvil (verificar)', aprobada: null },
  { clave: 'ppVigasCol', descripcion: 'Peso propio vigas y columnas (estimado)', valor: 100, unidad: 'kg/m²', fuente: 'criterio', norma: 'Criterio práctico', aprobada: null },
  { clave: 'nInterior', descripcion: 'Coef. n columna interior', valor: 0.45, unidad: '—', fuente: 'criterio', norma: 'Criterio práctico (Blanco Blasco)', aprobada: null },
  { clave: 'nBorde', descripcion: 'Coef. n columna borde/esquina', valor: 0.35, unidad: '—', fuente: 'criterio', norma: 'Criterio práctico (Blanco Blasco)', aprobada: null },
  { clave: 'divLosa', descripcion: 'Losa aligerada h ≥ Ln / k', valor: 25, unidad: '—', fuente: 'criterio', norma: 'Criterio práctico', aprobada: null },
  { clave: 'divVigaMin', descripcion: 'Viga h ≥ Ln / k (mínimo)', valor: 12, unidad: '—', fuente: 'criterio', norma: 'Criterio práctico', aprobada: null },
  { clave: 'divVigaMax', descripcion: 'Viga h ≈ Ln / k (holgado)', valor: 10, unidad: '—', fuente: 'criterio', norma: 'Criterio práctico', aprobada: null },
  { clave: 'bMinViga', descripcion: 'Ancho mínimo de viga sísmica', valor: 0.25, unidad: 'm', fuente: 'criterio', norma: 'E.060 cap. 21 (verificar art.)', aprobada: null },
  { clave: 'umbralRevisar', descripcion: 'Ratio desde el que se marca "revisar"', valor: 0.9, unidad: '—', fuente: 'criterio', norma: 'Criterio del equipo', aprobada: null },
];

export type Valores = Record<string, number>;

export const valoresDe = (hs: Hipotesis[]): Valores =>
  Object.fromEntries(hs.map(h => [h.clave, h.valor]));
