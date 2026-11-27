// Registro de rutas de la API por módulo. Cada fase edita SOLO su archivo (suelo.ts, bim.ts, vigilante.ts).
// Clave = "METODO ruta" sin /api/, p. ej. "POST suelo/lote" o "GET suelo/pdf".
// Un handler devuelve el Estado actualizado (o cualquier JSON); si escribe la respuesta él mismo (PDF, archivos),
// debe dejar res.writableEnded = true y el servidor no responde de nuevo.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { rutas as suelo } from './suelo.ts';
import { rutas as bim } from './bim.ts';
import { rutas as vigilante } from './vigilante.ts';

export interface Contexto { query: URLSearchParams; req: IncomingMessage; res: ServerResponse }
export type Ruta = (cuerpo: any, ctx: Contexto) => unknown | Promise<unknown>;

/** usaRevit: la ruta habla con Revit y debe ir por la cola del único cliente rvt-mcp. */
export interface Def { fn: Ruta; usaRevit?: boolean }

export const rutas: Record<string, Def> = { ...suelo, ...bim, ...vigilante };
