// Datos de entrada/salida del verificador E.070. Unidades: m, m².

export type Dir = 'X' | 'Y';
export type Rol = 'portante' | 'tabique' | 'desconocido';

export interface Abertura { id?: string; offset: number; ancho: number; tipo?: string } // offset desde el inicio del muro

export interface Muro {
  id: string;               // ElementId de Revit (o sintético)
  nivel: string;            // nombre del nivel donde nace
  x1: number; y1: number; x2: number; y2: number;
  t: number;                // espesor (m)
  h: number;                // altura libre (m)
  rol: Rol;                 // clasificación (la propone la IA, la aprueba el ingeniero)
  material?: string;        // 'albañilería' | 'concreto' ...
  tipoRevit?: string;
  aberturas: Abertura[];
}

export interface Nivel { nombre: string; elevacion: number; area: number } // área techada (m²)

export interface Proyecto {
  nombre: string;
  Z: number; U: number; S: number;  // E.030
  niveles: Nivel[];                 // de abajo hacia arriba
  muros: Muro[];
}

export interface Tramo { muroId: string; nivel: string; dir: Dir; L: number; t: number; cuenta: boolean; motivos: string[]; x1: number; y1: number; x2: number; y2: number }

export interface ChequeoDir {
  nivel: string; dir: Dir;
  sumaLt: number;           // Σ L·t (m²)
  Ap: number;               // área de planta (m²)
  densidad: number;         // Σ L·t / Ap
  requerido: number;        // Z·U·S·N / 56
  ratio: number;            // requerido / densidad (>1 = no cumple)
  cumple: boolean;
  deficitLt: number;        // m² de L·t que faltan (0 si cumple)
  sustitucion: string;
}

export interface Opcion {
  id: string; nivel: string; dir: Dir;
  accion: 'convertir_tabique' | 'aumentar_espesor' | 'alinear_continuidad';
  muroId: string;
  mover?: { dx: number; dy: number };   // solo alinear_continuidad (m)
  espesor?: number;                     // espesor final (m) en convertir/aumentar
  deltaLt: number;          // aporte a Σ L·t (m²)
  detalle: string;
}

export interface Resultado {
  proyecto: string;
  parametros: { Z: number; U: number; S: number; N: number; requerido: number };
  formula: string;
  norma: string;
  chequeos: ChequeoDir[];
  tramos: Tramo[];
  muros: Record<string, { estado: 'cuenta' | 'no_cuenta' | 'tabique'; motivos: string[] }>;
  opciones: Opcion[];
  advertencias: string[];
  fecha: string;
}
