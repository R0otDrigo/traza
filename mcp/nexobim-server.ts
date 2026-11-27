// Servidor MCP de NexoBIM: herramientas verificables para que un agente (Claude) revise E.070 en Revit.
// Las herramientas que calculan son deterministas; las que escriben en Revit exigen aprobación previa.
// Registro en Claude Code:  claude mcp add nexobim -- node <ruta>/mcp/nexobim-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as P from '../src/pipeline.ts';
import { verificar, simular } from '../src/e070/engine.ts';

const srv = new McpServer({ name: 'nexobim', version: '0.3.0' });
const txt = (o: unknown) => ({ content: [{ type: 'text' as const, text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] });

function resumen(e: P.Estado) {
  return {
    documento: e.modelo?.documento, parametros: e.parametros, pendientes: P.pendientes(e),
    chequeos: e.resultado?.chequeos.map(c => ({ nivel: c.nivel, dir: c.dir, densidad: c.densidad, requerido: c.requerido, cumple: c.cumple, deficitLt: c.deficitLt, sustitucion: c.sustitucion })),
    opciones: e.resultado?.opciones.map(o => ({ id: o.id, accion: o.accion, deltaLt: o.deltaLt, detalle: o.detalle, enPlanMinimo: Object.values(e.plan).flat().includes(o.id) })),
    explicacion: e.explicacion, aplicadas: e.aplicadas,
  };
}

srv.registerTool('nexobim_leer_modelo', {
  description: 'Lee muros, vanos, niveles y áreas del modelo abierto en Revit y propone el rol de cada muro (portante/tabique). No modifica Revit.',
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => {
  const e = await P.leerModelo();
  return txt({ muros: e.modelo!.muros.map(m => ({ id: m.id, marca: m.marca, nivel: m.nivel, tipo: m.tipoRevit, t: m.t, propuesta: e.clasificacion[m.id] })), niveles: e.modelo!.niveles, pendientes: P.pendientes(e) });
});

srv.registerTool('nexobim_registrar_decision', {
  description: 'Registra una decisión DEL INGENIERO: parámetros sísmicos aprobados o el rol de un muro. Úsalo solo con valores que el usuario confirmó explícitamente en la conversación.',
  inputSchema: {
    Z: z.number().optional(), U: z.number().optional(), S: z.number().optional(), aprobarParametros: z.boolean().optional(),
    muroId: z.string().optional(), rol: z.enum(['portante', 'tabique', 'desconocido']).optional(),
    aceptarTodaLaPropuesta: z.boolean().optional(),
  },
}, async a => {
  let e = P.leer();
  if (a.Z !== undefined || a.U !== undefined || a.S !== undefined || a.aprobarParametros) e = P.fijarParametros({ ...(a.Z !== undefined && { Z: a.Z }), ...(a.U !== undefined && { U: a.U }), ...(a.S !== undefined && { S: a.S }), aprobados: !!a.aprobarParametros });
  if (a.muroId && a.rol) e = P.decidir(a.muroId, a.rol);
  if (a.aceptarTodaLaPropuesta) e = P.aceptarClasificacion();
  return txt({ parametros: e.parametros, pendientes: P.pendientes(e) });
});

srv.registerTool('nexobim_verificar', {
  description: 'Ejecuta el motor determinista E.070 (densidad mínima de muros), genera opciones de mejora con su aporte calculado, pide a la IA ordenarlas y pinta el resultado en la vista 3D "NexoBIM E.070" de Revit (reversible con Deshacer). Requiere parámetros y roles aprobados.',
  inputSchema: { notasArquitectura: z.string().optional().describe('Restricciones de arquitectura a considerar al ordenar opciones') },
}, async a => txt(resumen(await P.verificarYPintar(a.notasArquitectura ?? ''))));

srv.registerTool('nexobim_simular', {
  description: 'Simula (sin tocar Revit) el efecto de aplicar un conjunto de opciones sobre la densidad de cada nivel. Determinista.',
  inputSchema: { opcionIds: z.array(z.string()) }, annotations: { readOnlyHint: true },
}, async ({ opcionIds }) => {
  const e = P.leer();
  if (!e.resultado) return txt('Primero ejecuta nexobim_verificar.');
  const p = simular(P.proyectoDe(e), e.resultado.opciones.filter(o => opcionIds.includes(o.id)));
  return txt(verificar(p).chequeos.map(c => ({ nivel: c.nivel, dir: c.dir, densidad: c.densidad, requerido: c.requerido, cumple: c.cumple })));
});

srv.registerTool('nexobim_aplicar_opcion', {
  description: 'Aplica en el modelo de Revit UNA opción de mejora ya calculada (cambiar tipo de muro o desplazarlo) y re-verifica. Modifica el modelo (reversible con Deshacer en Revit). Úsalo solo si el ingeniero aprobó esa opción explícitamente.',
  inputSchema: { opcionId: z.string() }, annotations: { destructiveHint: true },
}, async ({ opcionId }) => txt(resumen(await P.aplicarOpcion(opcionId))));

srv.registerTool('nexobim_estado', {
  description: 'Devuelve el último resultado oficial, las opciones, la explicación y el registro de decisiones.',
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => { const e = P.leer(); return txt({ ...resumen(e), log: e.log.slice(0, 20) }); });

srv.registerTool('nexobim_crear_caso_prueba', {
  description: 'SOLO DEMO: crea un proyecto NUEVO en Revit (no toca el abierto) con un caso de prueba: "municipalidad" (simulación inspirada en el Palacio Municipal de la Plaza de Armas de Arequipa, 3 pisos con portal y patio) o "vivienda" (4 pisos).',
  inputSchema: { caso: z.enum(['municipalidad', 'vivienda']).default('municipalidad') },
}, async ({ caso }) => txt((await P.crearCasoPrueba(caso)).log[0]));

await srv.connect(new StdioServerTransport());
