// Verifica un IFC exportado por NexoBIM: cuántos muros hay y cuántos llevan el Pset "NexoBIM" con NexoBIM_Estado.
import { readFileSync } from 'node:fs';
import * as W from 'web-ifc';
import type { ArchivoIFC } from '../contracts/index.ts';

export async function verificarIfc(ruta: string): Promise<ArchivoIFC> {
  const api = new W.IfcAPI();
  await api.Init();
  const m = api.OpenModel(new Uint8Array(readFileSync(ruta)));
  const ids = (t: number) => { const v = api.GetLineIDsWithType(m, t); return Array.from({ length: v.size() }, (_, i) => v.get(i)); };
  const muros = new Set([...ids(W.IFCWALL), ...ids(W.IFCWALLSTANDARDCASE)]);
  const conPset = new Set<number>();
  for (const r of ids(W.IFCRELDEFINESBYPROPERTIES)) {
    const rel = api.GetLine(m, r, true);
    const ps = rel.RelatingPropertyDefinition;
    if (ps?.Name?.value !== 'NexoBIM' || !ps.HasProperties?.some((p: any) => p?.Name?.value === 'NexoBIM_Estado')) continue;
    for (const o of rel.RelatedObjects ?? []) if (muros.has(o.expressID)) conPset.add(o.expressID);
  }
  api.CloseModel(m);
  return { ruta, en: new Date().toISOString(), verificado: muros.size > 0 && conPset.size === muros.size, muros: muros.size, conPset: conPset.size };
}
