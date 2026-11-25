import type { Proyecto, Muro, Tramo, ChequeoDir, Opcion, Resultado, Dir } from './types.ts';

// Verificador DETERMINISTA de densidad mínima de muros — RNE E.070.
// La IA no calcula nada aquí. Criterios que el ingeniero civil debe confirmar:
export const CRITERIOS = {
  Lmin: 1.20,          // E.070 Art. 19.2.b: solo cuentan tramos con L ≥ 1.20 m (verificar redacción)
  divEspesor: 20,      // E.070 Art. 19.1.a: t ≥ h/20 en zonas sísmicas 2, 3 y 4
  tCabeza: 0.23,       // espesor de muro en aparejo de cabeza (ladrillo King Kong)
  tolAngulo: 15,       // ° de tolerancia para asignar dirección X / Y
  tolColineal: 0.10,   // m, para continuidad vertical
  solapeMin: 0.90,     // fracción del tramo que debe apoyarse en un muro inferior
};

const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function direccion(m: Pick<Muro, 'x1' | 'y1' | 'x2' | 'y2'>): Dir | null {
  const a = Math.abs((Math.atan2(m.y2 - m.y1, m.x2 - m.x1) * 180) / Math.PI) % 180;
  if (a <= CRITERIOS.tolAngulo || a >= 180 - CRITERIOS.tolAngulo) return 'X';
  if (Math.abs(a - 90) <= CRITERIOS.tolAngulo) return 'Y';
  return null;
}

/** Divide el muro en tramos macizos entre aberturas. */
export function tramosDe(m: Muro): Omit<Tramo, 'cuenta' | 'motivos' | 'dir'>[] {
  const Lw = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
  const ux = (m.x2 - m.x1) / Lw, uy = (m.y2 - m.y1) / Lw;
  const huecos = [...m.aberturas].sort((a, b) => a.offset - b.offset);
  const out: Omit<Tramo, 'cuenta' | 'motivos' | 'dir'>[] = [];
  let s = 0;
  for (const h of [...huecos, { offset: Lw, ancho: 0 }]) {
    const e = Math.max(s, Math.min(Lw, h.offset));
    if (e - s > 1e-6) out.push({ muroId: m.id, nivel: m.nivel, L: r(e - s), t: m.t, x1: r(m.x1 + ux * s), y1: r(m.y1 + uy * s), x2: r(m.x1 + ux * e), y2: r(m.y1 + uy * e) });
    s = Math.max(s, h.offset + h.ancho);
  }
  return out;
}

function apoyado(t: Omit<Tramo, 'cuenta' | 'motivos'>, abajo: Tramo[]): boolean {
  const ux = (t.x2 - t.x1) / t.L, uy = (t.y2 - t.y1) / t.L;
  let solape = 0;
  for (const b of abajo) {
    if (b.dir !== t.dir || !b.cuenta) continue;
    const d1 = Math.abs((b.x1 - t.x1) * uy - (b.y1 - t.y1) * ux); // distancia perpendicular
    const d2 = Math.abs((b.x2 - t.x1) * uy - (b.y2 - t.y1) * ux);
    if (d1 > CRITERIOS.tolColineal || d2 > CRITERIOS.tolColineal) continue;
    const p1 = (b.x1 - t.x1) * ux + (b.y1 - t.y1) * uy, p2 = (b.x2 - t.x1) * ux + (b.y2 - t.y1) * uy;
    solape += Math.max(0, Math.min(t.L, Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2)));
  }
  return solape >= CRITERIOS.solapeMin * t.L;
}

export function verificar(p: Proyecto): Resultado {
  const N = p.niveles.length;
  const requerido = (p.Z * p.U * p.S * N) / 56;
  const advertencias: string[] = [];
  const tramos: Tramo[] = [];
  const muros: Resultado['muros'] = {};

  for (const [k, nv] of p.niveles.entries()) {
    const abajo = k > 0 ? tramos.filter(t => t.nivel === p.niveles[k - 1].nombre) : [];
    for (const m of p.muros.filter(m => m.nivel === nv.nombre)) {
      const dir = direccion(m);
      if (!dir) advertencias.push(`Muro ${m.id} inclinado: no se asigna a X ni Y.`);
      if (m.rol !== 'portante') { muros[m.id] = { estado: 'tabique', motivos: [m.rol === 'desconocido' ? 'Sin clasificar: no se cuenta' : 'Tabique (no portante)'] }; }
      if (m.material && /concreto/i.test(m.material)) advertencias.push(`Muro ${m.id} de concreto: E.070 pide t·Ec/Em; no implementado, se cuenta con t real.`);
      const motivosMuro = new Set<string>();
      for (const base of tramosDe(m)) {
        const motivos: string[] = [];
        if (m.rol !== 'portante') motivos.push('no portante');
        if (!dir) motivos.push('dirección no ortogonal');
        if (base.L < CRITERIOS.Lmin - 1e-9) motivos.push(`L = ${base.L} m < ${CRITERIOS.Lmin} m`);
        if (m.t < m.h / CRITERIOS.divEspesor - 1e-9) motivos.push(`t = ${m.t} m < h/${CRITERIOS.divEspesor} = ${r(m.h / CRITERIOS.divEspesor)} m`);
        const t0 = { ...base, dir: dir ?? 'X' };
        if (!motivos.length && k > 0 && !apoyado(t0, abajo)) motivos.push('sin continuidad vertical (no se apoya en un muro portante inferior)');
        motivos.forEach(x => m.rol === 'portante' && motivosMuro.add(x));
        tramos.push({ ...t0, cuenta: motivos.length === 0, motivos });
      }
      if (m.rol === 'portante') {
        const cuentaAlgo = tramos.some(t => t.muroId === m.id && t.cuenta);
        muros[m.id] = { estado: cuentaAlgo ? 'cuenta' : 'no_cuenta', motivos: [...motivosMuro] };
      }
    }
  }

  const chequeos: ChequeoDir[] = [];
  for (const nv of p.niveles) for (const dir of ['X', 'Y'] as Dir[]) {
    const ts = tramos.filter(t => t.nivel === nv.nombre && t.dir === dir && t.cuenta);
    const sumaLt = ts.reduce((s, t) => s + t.L * t.t, 0);
    const densidad = sumaLt / nv.area;
    const ratio = requerido / densidad;
    chequeos.push({
      nivel: nv.nombre, dir, sumaLt: r(sumaLt, 4), Ap: r(nv.area, 2), densidad: r(densidad, 5), requerido: r(requerido, 6),
      ratio: r(ratio, 3), cumple: densidad >= requerido - 1e-12, deficitLt: r(Math.max(0, requerido * nv.area - sumaLt), 4),
      sustitucion: `Σ L·t / Ap = ${r(sumaLt, 3)} / ${r(nv.area, 2)} = ${r(densidad, 4)}  vs  Z·U·S·N/56 = ${p.Z}·${p.U}·${p.S}·${N}/56 = ${r(requerido, 4)}`,
    });
  }

  return {
    proyecto: p.nombre,
    parametros: { Z: p.Z, U: p.U, S: p.S, N, requerido: r(requerido, 6) },
    formula: 'Σ (L · t) / Ap  ≥  Z · U · S · N / 56',
    norma: 'RNE E.070 Albañilería, Art. 19.2.b (densidad mínima de muros reforzados); Z, U, S según E.030',
    chequeos, tramos, muros, opciones: opciones(p, tramos, chequeos), advertencias, fecha: new Date().toISOString(),
  };
}

/** Aplica opciones sobre una copia del proyecto (simulación; la misma regla que se ejecuta en Revit). */
export function simular(p: Proyecto, ops: Opcion[]): Proyecto {
  return {
    ...p,
    muros: p.muros.map(m => ops.filter(o => o.muroId === m.id).reduce((x, o) => {
      if (o.accion === 'convertir_tabique') return { ...x, rol: 'portante' as const, t: o.espesor ?? Math.max(x.t, 0.13) };
      if (o.accion === 'aumentar_espesor') return { ...x, t: o.espesor ?? CRITERIOS.tCabeza };
      if (o.mover) return { ...x, x1: x.x1 + o.mover.dx, x2: x.x2 + o.mover.dx, y1: x.y1 + o.mover.dy, y2: x.y2 + o.mover.dy };
      return x;
    }, m)),
  };
}

/** Opciones deterministas para cubrir déficit. La IA solo las ordena y explica. */
export function opciones(p: Proyecto, tramos: Tramo[], chequeos: ChequeoDir[]): Opcion[] {
  const out: Opcion[] = [];
  const base = tramos.filter(t => t.nivel === p.niveles[0]?.nombre && t.cuenta);
  for (const c of chequeos.filter(c => !c.cumple)) {
    // Muros portantes que solo fallan por continuidad: proponer alinearlos con el eje del muro del primer nivel.
    for (const m of p.muros.filter(m => m.nivel === c.nivel && m.rol === 'portante' && direccion(m) === c.dir)) {
      const ts = tramos.filter(t => t.muroId === m.id);
      const soloCont = ts.filter(t => t.motivos.length === 1 && t.motivos[0].startsWith('sin continuidad'));
      if (!soloCont.length) continue;
      const enX = c.dir === 'X';
      const pos = enX ? m.y1 : m.x1;
      const cand = base.filter(b => b.dir === c.dir).map(b => ({ b, d: (enX ? b.y1 : b.x1) - pos })).filter(x => Math.abs(x.d) > 1e-6 && Math.abs(x.d) <= 2)
        .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
      if (!cand) continue;
      const d = r(cand.d);
      out.push({ id: `${c.nivel}-${c.dir}-alin-${m.id}`, nivel: c.nivel, dir: c.dir, accion: 'alinear_continuidad', muroId: m.id,
        mover: enX ? { dx: 0, dy: d } : { dx: d, dy: 0 }, deltaLt: r(soloCont.reduce((s, t) => s + t.L * t.t, 0), 4),
        detalle: `Alinear muro ${m.id} con el muro del ${p.niveles[0].nombre} (desplazar ${d > 0 ? '+' : ''}${d} m en ${enX ? 'Y' : 'X'}) para recuperar la continuidad vertical` });
    }
    for (const m of p.muros.filter(m => m.nivel === c.nivel && direccion(m) === c.dir)) {
      const ts = tramosDe(m).filter(t => t.L >= CRITERIOS.Lmin);
      const largo = r(ts.reduce((s, t) => s + t.L, 0));
      if (!largo) continue;
      const tMin = m.h / CRITERIOS.divEspesor;
      if (m.rol !== 'portante') {
        // Ladrillo real: soga (0.13) si basta para h/20; si no, cabeza (0.23).
        const t = m.t >= tMin - 1e-9 ? Math.max(m.t, 0.13) : CRITERIOS.tCabeza;
        out.push({ id: `${c.nivel}-${c.dir}-conv-${m.id}`, nivel: c.nivel, dir: c.dir, accion: 'convertir_tabique', muroId: m.id, espesor: t, deltaLt: r(largo * t, 4),
          detalle: `Convertir tabique ${m.id} (${largo} m útiles${t > m.t ? `, con t = ${t} m` : ''}) en muro portante confinado` });
      } else if (m.t < CRITERIOS.tCabeza && CRITERIOS.tCabeza >= tMin) {
        // Tramos que ya cuentan o que solo fallan por espesor: al engrosar, todos cuentan.
        const propios = tramos.filter(x => x.muroId === m.id);
        const antes = propios.filter(x => x.cuenta).reduce((s, x) => s + x.L * x.t, 0);
        const luego = propios.filter(x => x.cuenta || x.motivos.every(mo => mo.startsWith('t ='))).reduce((s, x) => s + x.L * CRITERIOS.tCabeza, 0);
        const largoOk = propios.filter(x => x.cuenta || x.motivos.every(mo => mo.startsWith('t ='))).reduce((s, x) => s + x.L, 0);
        if (luego - antes > 1e-6) out.push({ id: `${c.nivel}-${c.dir}-esp-${m.id}`, nivel: c.nivel, dir: c.dir, accion: 'aumentar_espesor', muroId: m.id, espesor: CRITERIOS.tCabeza, deltaLt: r(luego - antes, 4),
          detalle: `Muro ${m.id}: pasar de t = ${m.t} m a ${CRITERIOS.tCabeza} m (aparejo de cabeza) en ${r(largoOk)} m${antes ? '' : ` — hoy no cuenta porque t < h/${CRITERIOS.divEspesor} = ${r(tMin)} m`}` });
      }
    }
  }
  return out.sort((a, b) => b.deltaLt - a.deltaLt);
}
