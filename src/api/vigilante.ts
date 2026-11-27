// Rutas de la API del módulo vigilante (ver src/api/index.ts). Solo esta fase edita este archivo.
import type { Def } from './index.ts';
import * as P from '../pipeline.ts';
import { iniciar } from '../vigilante.ts';

iniciar(); // un solo setInterval por proceso (singleton en globalThis)

export const rutas: Record<string, Def> = {
  'POST vigilante': { fn: (b: { activo?: boolean; pintarAuto?: boolean }) => {
    const e = P.leer(), v = e.vigilante!;
    if (typeof b.activo === 'boolean') v.activo = b.activo;
    if (typeof b.pintarAuto === 'boolean') v.pintarAuto = b.pintarAuto;
    P.registrar(e, 'ingeniero', 'Configuró vigilante', `activo=${v.activo} pintarAuto=${v.pintarAuto}`);
    return P.guardar(e);
  } },
  'POST vigilante/vistas': { fn: () => { const e = P.leer(); e.vigilante!.notificaciones = []; return P.guardar(e); } },
};
