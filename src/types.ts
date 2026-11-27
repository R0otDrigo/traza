// Contratos de datos de NexoBIM. Unidades: m, kg, kg/m², kg/cm², cm².

export type TipoElemento = 'columna' | 'viga' | 'losa';
export type Estado = 'cumple' | 'revisar' | 'no_cumple';
export type Fuente = 'criterio' | 'IA' | 'usuario' | 'BIM';

export interface Nivel { id: string; nombre: string; z: number; altura: number; azotea: boolean }
export interface Eje { id: string; dir: 'x' | 'y'; pos: number }

export interface Seccion { b: number; h: number } // m. En losas solo cuenta h.

export interface Elemento {
  id: string;
  guid: string;          // GUID del IFC (en el paramétrico es sintético)
  tipo: TipoElemento;
  nivel: string;
  seccion: Seccion;      // sección del modelo BIM
  // Columna: nodo de la retícula. Viga: tramo entre dos nodos. Losa: paño.
  i: number; j: number;
  i2?: number; j2?: number;
}

export interface Edificio {
  nombre: string;
  ejesX: Eje[];          // ejes A, B, C... (posición en x)
  ejesY: Eje[];          // ejes 1, 2, 3... (posición en y)
  niveles: Nivel[];
  elementos: Elemento[];
}

export interface Dato { valor: number | string; unidad: string; fuente: Fuente; norma?: string }

export interface ResultadoTrazable {
  elementoId: string;
  magnitud: string;               // p. ej. "Área bruta requerida"
  valor: number;
  unidad: string;
  formula: string;                // fórmula simbólica
  sustitucion: string;            // fórmula con los números sustituidos
  norma: string;
  inputs: Record<string, Dato>;
  propuesto: string;              // texto de la sección que se propone
  modelo: string;                 // texto de la sección del BIM
  ratio: number;                  // demanda / capacidad (>1 = no cumple)
  estado: Estado;
  advertencias: string[];
}

export interface Hipotesis {
  clave: string;
  descripcion: string;
  valor: number;
  unidad: string;
  fuente: Fuente;
  norma: string;
  aprobada: boolean | null;       // null = pendiente
}
