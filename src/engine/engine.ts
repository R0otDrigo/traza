import type { Edificio, Elemento, Estado, ResultadoTrazable, Dato } from '../types';
import type { Valores } from './criteria';

// Motor DETERMINISTA. La IA nunca entra aquí: solo funciones puras con traza.

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const cm = (m: number) => Math.round(m * 100);
const LOSAS_STD = [0.17, 0.20, 0.25, 0.30, 0.35];

const crit = (v: number, u: string, norma: string): Dato => ({ valor: v, unidad: u, fuente: 'criterio', norma });
const bim = (v: number | string, u: string): Dato => ({ valor: v, unidad: u, fuente: 'BIM' });

export function estadoDe(ratio: number, umbral: number): Estado {
  return ratio > 1 ? 'no_cumple' : ratio >= umbral ? 'revisar' : 'cumple';
}

const luces = (ejes: { pos: number }[]) => ejes.slice(1).map((e, k) => e.pos - ejes[k].pos);

export type TipoColumna = 'interior' | 'borde' | 'esquina';

export function areaTributaria(ed: Edificio, i: number, j: number) {
  const lx = luces(ed.ejesX), ly = luces(ed.ejesY);
  const izq = i > 0 ? lx[i - 1] / 2 : 0, der = i < lx.length ? lx[i] / 2 : 0;
  const abj = j > 0 ? ly[j - 1] / 2 : 0, arr = j < ly.length ? ly[j] / 2 : 0;
  const bordes = Number(i === 0 || i === lx.length) + Number(j === 0 || j === ly.length);
  const tipo: TipoColumna = bordes === 0 ? 'interior' : bordes === 1 ? 'borde' : 'esquina';
  const x = ed.ejesX[i].pos, y = ed.ejesY[j].pos;
  return { ax: izq + der, ay: abj + arr, area: (izq + der) * (abj + arr), tipo, rect: { x0: x - izq, x1: x + der, y0: y - abj, y1: y + arr } };
}

export function evaluarColumna(ed: Edificio, el: Elemento, v: Valores): ResultadoTrazable {
  const t = areaTributaria(ed, el.i, el.j);
  const k0 = ed.niveles.findIndex(n => n.id === el.nivel);
  const encima = ed.niveles.slice(k0);
  const cm_ = v.pesoLosa + v.acabados + v.tabiqueria + v.ppVigasCol;
  const sumaW = encima.reduce((s, n) => s + cm_ + (n.azotea ? v.cvAzotea : v.cv), 0);
  const sumaWu = encima.reduce((s, n) => s + 1.4 * cm_ + 1.7 * (n.azotea ? v.cvAzotea : v.cv), 0);
  const P = t.area * sumaW;
  const Pu = t.area * sumaWu;
  const n = t.tipo === 'interior' ? v.nInterior : v.nBorde;
  const agReq = P / (n * v.fc);                 // cm² (P en kg, f'c en kg/cm²)
  const agMod = el.seccion.b * el.seccion.h * 1e4;
  const lado = Math.max(25, Math.ceil(Math.sqrt(agReq) / 5) * 5);
  const ratio = agReq / agMod;
  return {
    elementoId: el.id, magnitud: 'Área bruta requerida Ag', valor: r2(agReq), unidad: 'cm²',
    formula: "Ag = P_serv / (n · f'c),  P_serv = A_trib · Σ(CM + CV)",
    sustitucion: `Ag = ${r2(P)} / (${n} · ${v.fc}) = ${r2(agReq)} cm²   [A_trib = ${r2(t.ax)} × ${r2(t.ay)} = ${r2(t.area)} m², ${encima.length} pisos, Σw = ${r2(sumaW)} kg/m²]`,
    norma: 'Predimensionamiento por carga axial (criterio práctico); CM/CV según E.020',
    inputs: {
      'Tipo de columna': { valor: t.tipo, unidad: '', fuente: 'BIM' },
      'Área tributaria': bim(r2(t.area), 'm²'),
      'Pisos que soporta': bim(encima.length, ''),
      'CM por piso': crit(cm_, 'kg/m²', 'E.020'),
      'CV típica': crit(v.cv, 'kg/m²', 'E.020 Tabla 1'),
      'CV azotea': crit(v.cvAzotea, 'kg/m²', 'E.020'),
      n: crit(n, '—', 'Criterio práctico'),
      "f'c": crit(v.fc, 'kg/cm²', 'E.060'),
      'P servicio': { valor: r2(P), unidad: 'kg', fuente: 'criterio' },
      'Pu (1.4CM+1.7CV)': { valor: r2(Pu), unidad: 'kg', fuente: 'criterio', norma: 'E.060 9.2.1' },
    },
    propuesto: `${lado}×${lado} cm (Ag = ${lado * lado} cm²)`,
    modelo: `${cm(el.seccion.b)}×${cm(el.seccion.h)} cm (Ag = ${r2(agMod)} cm²)`,
    ratio: r2(ratio), estado: estadoDe(ratio, v.umbralRevisar),
    advertencias: ratio > 1 ? [`La sección del modelo cubre el ${Math.round(100 / ratio)} % del área requerida.`] : [],
  };
}

function columnaEn(ed: Edificio, nivel: string, i: number, j: number) {
  return ed.elementos.find(e => e.tipo === 'columna' && e.nivel === nivel && e.i === i && e.j === j);
}

export function evaluarViga(ed: Edificio, el: Elemento, v: Valores): ResultadoTrazable {
  const enX = el.j === el.j2;
  const p1 = enX ? ed.ejesX[el.i].pos : ed.ejesY[el.j].pos;
  const p2 = enX ? ed.ejesX[el.i2!].pos : ed.ejesY[el.j2!].pos;
  const L = Math.abs(p2 - p1);
  const dim = (c?: Elemento) => (c ? (enX ? c.seccion.b : c.seccion.h) : 0);
  const c1 = dim(columnaEn(ed, el.nivel, el.i, el.j)), c2 = dim(columnaEn(ed, el.nivel, el.i2!, el.j2!));
  const Ln = L - c1 / 2 - c2 / 2;
  const hMin = Ln / v.divVigaMin, hHolg = Ln / v.divVigaMax;
  const { b, h } = el.seccion;
  const ratioH = hMin / h, ratioB = v.bMinViga / b;
  const ratio = ratioB > 1 ? Math.max(ratioH, ratioB) : ratioH; // b mínimo: pasa / no pasa
  const hProp = Math.ceil(hMin * 20) / 20;
  const bProp = Math.max(v.bMinViga, Math.ceil(hProp * 0.5 * 20) / 20);
  const adv: string[] = [];
  if (ratioH > 1) adv.push(`Peralte ${cm(h)} cm < Ln/${v.divVigaMin} = ${cm(hMin)} cm.`);
  if (ratioB > 1) adv.push(`Ancho ${cm(b)} cm < mínimo ${cm(v.bMinViga)} cm para vigas sísmicas.`);
  return {
    elementoId: el.id, magnitud: 'Peralte mínimo h', valor: r3(hMin), unidad: 'm',
    formula: `h ≥ Ln / ${v.divVigaMin}  (holgado: Ln / ${v.divVigaMax}),  b ≥ b_min`,
    sustitucion: `Ln = ${r2(L)} − ${r2(c1)}/2 − ${r2(c2)}/2 = ${r2(Ln)} m  →  h ∈ [${r2(hMin)}, ${r2(hHolg)}] m`,
    norma: 'Criterio práctico de predimensionamiento; ancho mínimo E.060 cap. 21',
    inputs: {
      'Luz entre ejes L': bim(r2(L), 'm'),
      'Luz libre Ln': bim(r2(Ln), 'm'),
      'Sección modelo b×h': bim(`${cm(b)}×${cm(h)}`, 'cm'),
      'k mínimo': crit(v.divVigaMin, '—', 'Criterio práctico'),
      'b mínimo': crit(v.bMinViga, 'm', 'E.060 cap. 21'),
    },
    propuesto: `${cm(bProp)}×${cm(hProp)} cm`,
    modelo: `${cm(b)}×${cm(h)} cm`,
    ratio: r2(ratio), estado: estadoDe(ratio, v.umbralRevisar), advertencias: adv,
  };
}

export function evaluarLosa(ed: Edificio, el: Elemento, v: Valores): ResultadoTrazable {
  const Lx = ed.ejesX[el.i2!].pos - ed.ejesX[el.i].pos;
  const Ly = ed.ejesY[el.j2!].pos - ed.ejesY[el.j].pos;
  const Ls = Math.min(Lx, Ly);
  const Ln = Ls - v.bMinViga;
  const hReq = Ln / v.divLosa;
  const h = el.seccion.h;
  const hProp = LOSAS_STD.find(x => x >= hReq - 1e-9) ?? LOSAS_STD[LOSAS_STD.length - 1];
  const ratio = hReq / h;
  const adv: string[] = [];
  if (ratio > 1) adv.push(`Espesor ${cm(h)} cm < Ln/${v.divLosa} = ${cm(hReq)} cm.`);
  if (Math.abs(h - 0.20) > 1e-9) adv.push('El peso de losa asumido en el metrado corresponde a h = 0.20 m.');
  return {
    elementoId: el.id, magnitud: 'Espesor mínimo losa aligerada', valor: r3(hReq), unidad: 'm',
    formula: `h ≥ Ln / ${v.divLosa}  (armada en la dirección corta)`,
    sustitucion: `Ln = min(${r2(Lx)}, ${r2(Ly)}) − ${r2(v.bMinViga)} = ${r2(Ln)} m  →  h ≥ ${r2(hReq)} m`,
    norma: 'Criterio práctico para losas aligeradas en una dirección',
    inputs: {
      'Paño Lx × Ly': bim(`${r2(Lx)} × ${r2(Ly)}`, 'm'),
      'Luz libre Ln': bim(r2(Ln), 'm'),
      'Espesor modelo': bim(r2(h), 'm'),
      'k': crit(v.divLosa, '—', 'Criterio práctico'),
    },
    propuesto: `h = ${cm(hProp)} cm`,
    modelo: `h = ${cm(h)} cm`,
    ratio: r2(ratio), estado: estadoDe(ratio, v.umbralRevisar), advertencias: adv,
  };
}

export function evaluar(ed: Edificio, v: Valores): Map<string, ResultadoTrazable> {
  const f = { columna: evaluarColumna, viga: evaluarViga, losa: evaluarLosa } as const;
  return new Map(ed.elementos.map(el => [el.id, f[el.tipo](ed, el, v)]));
}
