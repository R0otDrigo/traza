// Versiones del modelo (ISO 19650): huella del modelo extraído + cumplimiento por nivel/dirección. Datos para el antes/después.
import { createHash } from 'node:crypto';
import type { VersionModelo } from '../contracts/index.ts';
import type { ModeloRevit } from '../revit/bridge.ts';
import type { Resultado } from '../e070/types.ts';

/** sha256 de los muros ordenados por id (id, coordenadas, espesor, tipo, vanos). */
export function huella(m: ModeloRevit): string {
  const muros = [...m.muros].sort((a, b) => a.id.localeCompare(b.id))
    .map(w => [w.id, w.x1, w.y1, w.x2, w.y2, w.t, w.tipoRevit ?? '', w.aberturas.map(a => [a.offset, a.ancho])]);
  return createHash('sha256').update(JSON.stringify(muros)).digest('hex');
}

/** Agrega la versión al inicio (más reciente primero), máx. 30. */
export function agregarVersion(versiones: VersionModelo[] = [], m: ModeloRevit, r: Resultado, nota = ''): VersionModelo[] {
  const v = { huella: huella(m), en: r.fecha, nota, cumplimiento: r.chequeos.map(c => ({ nivel: c.nivel, dir: c.dir, cumple: c.cumple })) };
  return [v, ...versiones].slice(0, 30);
}
