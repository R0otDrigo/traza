import type { Edificio, Elemento, Seccion } from '../types';

// Plan B / caso de prueba: edificio aporticado de 4 pisos, 3×3 paños.
// Las secciones imitan lo que vendría del IFC e incluyen errores a propósito
// para que el revisor los detecte (marcados con "ERROR").
export interface ParamOpts { lucesX: number[]; lucesY: number[]; pisos: number; altura: number }

export const OPCIONES_CASO: ParamOpts = { lucesX: [5.5, 6.0, 5.5], lucesY: [5.0, 6.0, 5.0], pisos: 4, altura: 3.0 };

const LETRAS = 'ABCDEFGHIJ';
const acum = (ls: number[]) => ls.reduce<number[]>((a, l) => [...a, a[a.length - 1] + l], [0]);

export function generarEdificio(o: ParamOpts = OPCIONES_CASO): Edificio {
  const xs = acum(o.lucesX), ys = acum(o.lucesY);
  const nx = xs.length, ny = ys.length;
  const ed: Edificio = {
    nombre: `Edificio de oficinas ${o.pisos} pisos (paramétrico)`,
    ejesX: xs.map((p, i) => ({ id: LETRAS[i], dir: 'x', pos: p })),
    ejesY: ys.map((p, j) => ({ id: String(j + 1), dir: 'y', pos: p })),
    niveles: Array.from({ length: o.pisos }, (_, k) => ({
      id: `N${k + 1}`, nombre: k === o.pisos - 1 ? `Piso ${k + 1} (azotea)` : `Piso ${k + 1}`,
      z: k * o.altura, altura: o.altura, azotea: k === o.pisos - 1,
    })),
    elementos: [],
  };
  const add = (e: Omit<Elemento, 'guid'>) => ed.elementos.push({ ...e, guid: `TRZ-${e.id}` });
  const interior = (i: number, j: number) => i > 0 && i < nx - 1 && j > 0 && j < ny - 1;

  for (const [k, nv] of ed.niveles.entries()) {
    // Columnas (b en x, h en y)
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      let s: Seccion = interior(i, j) ? { b: 0.30, h: 0.40 } : { b: 0.30, h: 0.30 };
      if (k === 0 && i === 2 && j === 2) s = { b: 0.25, h: 0.30 }; // ERROR: columna C3 subdimensionada
      add({ id: `C-${LETRAS[i]}${j + 1}-${nv.id}`, tipo: 'columna', nivel: nv.id, seccion: s, i, j });
    }
    // Vigas en x
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) {
      let s: Seccion = o.lucesX[i] >= 6 ? { b: 0.25, h: 0.55 } : { b: 0.25, h: 0.50 };
      if (k === 1 && j === 1 && i === 1) s = { b: 0.25, h: 0.40 }; // ERROR: peralte insuficiente
      add({ id: `V-${nv.id}-${j + 1}(${LETRAS[i]}-${LETRAS[i + 1]})`, tipo: 'viga', nivel: nv.id, seccion: s, i, j, i2: i + 1, j2: j });
    }
    // Vigas en y
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny - 1; j++) {
      let s: Seccion = o.lucesY[j] >= 6 ? { b: 0.25, h: 0.55 } : { b: 0.25, h: 0.50 };
      if (k === 2 && i === 0 && j === 0) s = { b: 0.20, h: 0.50 }; // ERROR: ancho menor al mínimo
      add({ id: `V-${nv.id}-${LETRAS[i]}(${j + 1}-${j + 2})`, tipo: 'viga', nivel: nv.id, seccion: s, i, j, i2: i, j2: j + 1 });
    }
    // Losas (paño entre ejes i..i+1, j..j+1)
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      let h = Math.min(o.lucesX[i], o.lucesY[j]) >= 5.5 ? 0.25 : 0.20;
      if (k === 2 && i === 1 && j === 1) h = 0.20; // ERROR: paño central con losa delgada
      add({ id: `L-${nv.id}-${LETRAS[i]}${j + 1}`, tipo: 'losa', nivel: nv.id, seccion: { b: 1, h }, i, j, i2: i + 1, j2: j + 1 });
    }
  }
  return ed;
}
