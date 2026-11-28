// Rutas de la API del módulo bim (ver src/api/index.ts). Solo esta fase edita este archivo.
// Fase 4 (ISO 19650): el ingeniero aprueba antes de escribir en el modelo y todo queda en el registro.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Def } from './index.ts';
import * as revit from '../revit/bridge.ts';
import { verificarIfc } from '../bim/ifc.ts';
import { psetNexoBIM } from '../bim/pset.ts';
import { leer, guardar, registrar, type Estado } from '../pipeline.ts';
import type { ValoresNexo } from '../revit/bridge.ts';

const sinNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')) as ValoresNexo;

/** Datos para revit/escribir_parametros.cs desde el último resultado y el estado de suelo/parámetros. */
export function datosParametros(e: Estado, por: string) {
  const r = e.resultado;
  if (!r) throw new Error('Primero verifica el modelo (no hay resultado que escribir).');
  const muros: Record<string, ValoresNexo> = {};
  for (const [id, m] of Object.entries(r.muros)) {
    const tr = r.tramos.filter(t => t.muroId === id);
    const ch = tr[0] && r.chequeos.find(c => c.nivel === tr[0].nivel && c.dir === tr[0].dir);
    muros[id] = sinNulos({
      NexoBIM_Estado: m.estado, NexoBIM_Motivo: m.motivos.join('; ') || '-',
      NexoBIM_Rol: e.decisiones[id] ?? e.clasificacion[id]?.rol ?? 'desconocido',
      NexoBIM_Tramo_Lt: +tr.filter(t => t.cuenta).reduce((s, t) => s + t.L * t.t, 0).toFixed(4),
      NexoBIM_Ratio: ch ? +ch.ratio.toFixed(3) : null,
    });
  }
  const s = e.suelo?.resultado;
  const obra = s?.obrasCercanas.find(o => o.obra.id === s.estudioElegido?.obraId)?.obra;
  const proyecto = sinNulos({
    NexoBIM_Suelo_Obra: obra ? `${obra.entidad} — ${obra.descripcion}` : null, NexoBIM_Suelo_URL: obra?.urlFicha,
    NexoBIM_Suelo_Distancia_m: s?.distancia_m, NexoBIM_Suelo_Perfil: s?.estudioElegido?.perfilE030.valor,
    NexoBIM_S: e.parametros.S, NexoBIM_S_Fuente: s?.S_fuente ?? 'manual', NexoBIM_Z: e.parametros.Z, NexoBIM_U: e.parametros.U,
    NexoBIM_Norma: r.norma, NexoBIM_Fecha_Verificacion: r.fecha, NexoBIM_Aprobado_Por: por,
  });
  return { muros, proyecto };
}

export const rutas: Record<string, Def> = {
  'POST bim/parametros': { usaRevit: true, fn: async (b) => {
    if (b?.aprobado !== true) throw new Error('Escribir parámetros en Revit requiere aprobación explícita del ingeniero ({ aprobado: true }).');
    const e = leer();
    const por = String(b.por ?? 'ingeniero');
    const datos = datosParametros(e, por);
    registrar(e, 'ingeniero', 'Aprobó escribir parámetros NexoBIM_*', `${por} · ${Object.keys(datos.muros).length} muros + información del proyecto`);
    registrar(e, 'revit', 'Escribió parámetros', await revit.escribirParametros(datos));
    return guardar(e);
  } },
  'POST bim/ifc': { usaRevit: true, fn: async () => {
    const e = leer();
    const nombre = (e.modelo?.documento ?? 'modelo').replace(/\.rvt$/i, '').replace(/[^\w-]+/g, '_');
    const ruta = fileURLToPath(new URL(`../../modelos/${nombre}-${new Date().toISOString().replace(/[:.]/g, '-')}.ifc`, import.meta.url));
    registrar(e, 'revit', 'Exportó IFC', await revit.exportarIfc(ruta));
    const g = psetNexoBIM(readFileSync(ruta, 'utf8'));
    if (g.objetos) { writeFileSync(ruta, g.texto); registrar(e, 'motor', 'Agrupó Pset NexoBIM en el IFC', `${g.objetos} objetos (propiedades NexoBIM_* de Revit, valores sin cambios)`); }
    e.ifc = await verificarIfc(ruta);
    registrar(e, 'motor', 'Verificó IFC', `${e.ifc.conPset}/${e.ifc.muros} muros con Pset NexoBIM${e.ifc.verificado ? '' : ' (incompleto)'}`);
    return guardar(e);
  } },
  'GET bim/ifc': { fn: (_b, { res }) => {
    const ruta = leer().ifc?.ruta;
    if (!ruta || !existsSync(ruta)) throw new Error('Aún no hay un IFC exportado.');
    res.setHeader('Content-Type', 'application/x-step');
    res.setHeader('Content-Disposition', `attachment; filename="${basename(ruta)}"`);
    res.end(readFileSync(ruta));
  } },
};
