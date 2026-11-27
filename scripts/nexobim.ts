// CLI de NexoBIM E.070. Uso: node scripts/nexobim.ts <crear|leer|aceptar|params Z U S|verificar|aplicar <opcionId>|estado>
import * as P from '../src/pipeline.ts';
import { cerrar } from '../src/revit/bridge.ts';

const [, , cmd, ...a] = process.argv;
// suelo:buscar | suelo:descargar | suelo:indexar | suelo:asistido | suelo:manual | suelo:cercanos | suelo:estado (ver docs/FUENTES.md)
if (cmd?.startsWith('suelo:')) { await (await import('../src/fuentes/cli.ts')).suelo(cmd, a); process.exit(0); }
try {
  let e: P.Estado;
  switch (cmd) {
    case 'crear': e = await P.crearCasoPrueba((a[0] as any) || 'municipalidad'); break;
    case 'guardar': e = await P.guardarModelo(); break;
    case 'leer': e = await P.leerModelo(); break;
    case 'aceptar': e = P.aceptarClasificacion(); break;
    case 'params': e = P.fijarParametros({ Z: +a[0], U: +a[1], S: +a[2], aprobados: true }); break;
    case 'verificar': e = await P.verificarYPintar(a.join(' ')); break;
    case 'aplicar': e = await P.aplicarOpcion(a[0]); break;
    default: e = P.leer();
  }
  for (const l of e.log.slice(0, 6).reverse()) console.log(`[${l.quien}] ${l.accion}: ${l.detalle}`);
  if (e.resultado) for (const c of e.resultado.chequeos) console.log(`${c.cumple ? '✓' : '✗'} ${c.nivel} ${c.dir}  ΣLt=${c.sumaLt}  densidad=${c.densidad} / req=${c.requerido}`);
  if (e.explicacion) console.log(`\n${e.explicacion.resumen}`), e.explicacion.recomendaciones.forEach(r => console.log(` ${r.orden}. ${r.opcionId}: ${r.justificacion}`));
  const p = P.pendientes(e); if (p.length) console.log(`\nPendiente: ${p.join(', ')}`);
} finally { await cerrar(); }
