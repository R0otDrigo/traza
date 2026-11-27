// Orquestador NexoBIM E.070 (Node). Lo usan el panel web (vía Vite) y el servidor MCP.
// Revit → extraer → IA clasifica → ingeniero aprueba → motor determinista → IA explica → Revit (colores + comentarios)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as revit from './revit/bridge.ts';
import { clasificar, explicar, planMinimo, iaDisponible, type Clasificacion, type Explicacion } from './ai/asistente.ts';
import { verificar } from './e070/engine.ts';
import { CASOS, type NombreCaso } from './e070/caso.ts';
import type { Proyecto, Resultado, Rol } from './e070/types.ts';
import type { ModeloRevit } from './revit/bridge.ts';
import type { Actor, EstadoSuelo, EstadoVigilante, VersionModelo, ArchivoIFC } from './contracts/index.ts';

const DIR = fileURLToPath(new URL('../public/live/', import.meta.url));
mkdirSync(DIR, { recursive: true });
const RUTA = DIR + 'estado.json';

export interface Parametros { Z: number; U: number; S: number; aprobados: boolean }
export interface Evento { t: string; quien: Actor; accion: string; detalle: string }
export interface Estado {
  suelo?: EstadoSuelo;                      // fase 3
  vigilante?: EstadoVigilante;              // fase 5
  versiones?: VersionModelo[];              // fase 4
  ifc?: ArchivoIFC | null;                  // fase 4
  modelo: ModeloRevit | null;
  parametros: Parametros;
  clasificacion: Record<string, Clasificacion>;
  decisiones: Record<string, Rol>;          // rol aprobado/corregido por el ingeniero
  resultado: Resultado | null;
  explicacion: Explicacion | null;
  plan: Record<string, string[]>;           // nivel|dir → ids de opción
  aplicadas: string[];
  log: Evento[];
  ia: boolean;
}

export function leer(): Estado {
  const e: Estado = existsSync(RUTA) ? JSON.parse(readFileSync(RUTA, 'utf8'))
    : { modelo: null, parametros: { Z: 0.35, U: 1.0, S: 1.15, aprobados: false }, clasificacion: {}, decisiones: {}, resultado: null, explicacion: null, plan: {}, aplicadas: [], log: [], ia: iaDisponible() };
  e.vigilante ??= { activo: true, pintarAuto: false, huella: null, eventos: [], notificaciones: [] };
  return e;
}
/** Persiste el estado (los módulos de las fases lo usan tras modificar su bloque). */
export function guardar(e: Estado) { e.ia = iaDisponible(); writeFileSync(RUTA, JSON.stringify(e)); return e; }
/** Registro de decisiones: todo cambio deja quién, qué y cuándo. */
export function registrar(e: Estado, quien: Evento['quien'], accion: string, detalle = '') { log(e, quien, accion, detalle); }
function log(e: Estado, quien: Evento['quien'], accion: string, detalle = '') {
  e.log.unshift({ t: new Date().toISOString(), quien, accion, detalle });
  e.log = e.log.slice(0, 300);
}

/** Proyecto para el motor: rol = decisión del ingeniero ?? clasificación (IA o regla). */
export function proyectoDe(e: Estado): Proyecto {
  if (!e.modelo) throw new Error('Primero lee el modelo de Revit.');
  const { Z, U, S } = e.parametros;
  return {
    nombre: e.modelo.documento, Z, U, S, niveles: e.modelo.niveles,
    muros: e.modelo.muros.map(m => ({ ...m, rol: e.decisiones[m.id] ?? e.clasificacion[m.id]?.rol ?? 'desconocido' })),
  };
}

export async function leerModelo() {
  const e = leer();
  e.modelo = await revit.extraer();
  log(e, 'revit', 'Leyó modelo', `${e.modelo.documento}: ${e.modelo.muros.length} muros, ${e.modelo.niveles.length} niveles`);
  const cl = await clasificar(e.modelo.muros);
  e.clasificacion = Object.fromEntries(cl.map(c => [c.id, c]));
  const vivos = new Set(e.modelo.muros.map(m => m.id));
  e.decisiones = Object.fromEntries(Object.entries(e.decisiones).filter(([id]) => vivos.has(id)));
  const n = (r: Rol) => cl.filter(c => c.rol === r).length;
  log(e, cl[0]?.fuente === 'IA' ? 'IA' : 'motor', 'Clasificó muros', `${n('portante')} portantes, ${n('tabique')} tabiques, ${n('desconocido')} por decidir (${cl[0]?.fuente ?? '-'})`);
  e.resultado = null; e.explicacion = null; e.plan = {};
  return guardar(e);
}

export function decidir(id: string, rol: Rol) {
  const e = leer();
  e.decisiones[id] = rol;
  log(e, 'ingeniero', 'Decidió rol', `${id} → ${rol}`);
  return guardar(e);
}

export function aceptarClasificacion() {
  const e = leer();
  for (const [id, c] of Object.entries(e.clasificacion)) if (!(id in e.decisiones) && c.rol !== 'desconocido') e.decisiones[id] = c.rol;
  log(e, 'ingeniero', 'Aceptó clasificación propuesta', `${Object.keys(e.decisiones).length} muros con rol aprobado`);
  return guardar(e);
}

export function fijarParametros(p: Partial<Parametros>) {
  const e = leer();
  e.parametros = { ...e.parametros, ...p };
  log(e, 'ingeniero', p.aprobados ? 'Aprobó parámetros' : 'Editó parámetros', `Z=${e.parametros.Z} U=${e.parametros.U} S=${e.parametros.S}`);
  return guardar(e);
}

export function pendientes(e: Estado): string[] {
  const faltan: string[] = [];
  if (!e.modelo) faltan.push('leer el modelo');
  if (!e.parametros.aprobados) faltan.push('aprobar Z, U, S');
  const sinRol = e.modelo?.muros.filter(m => !(m.id in e.decisiones)).length ?? 0;
  if (sinRol) faltan.push(`${sinRol} muros sin rol aprobado`);
  return faltan;
}

export async function verificarYPintar(notasArquitectura = '') {
  const e = leer();
  const falta = pendientes(e);
  if (falta.length) throw new Error(`Falta aprobación del ingeniero: ${falta.join(', ')}.`);
  e.resultado = verificar(proyectoDe(e));
  const malos = e.resultado.chequeos.filter(c => !c.cumple);
  log(e, 'motor', 'Verificó E.070', malos.length ? `No cumple: ${malos.map(c => `${c.nivel} ${c.dir}`).join(', ')}` : 'Cumple en X e Y');
  e.explicacion = await explicar(e.resultado, notasArquitectura);
  const plan = planMinimo(e.resultado);
  e.plan = Object.fromEntries(Object.entries(plan).map(([k, ops]) => [k, ops.map(o => o.id)]));
  log(e, e.explicacion.fuente === 'IA' ? 'IA' : 'motor', 'Propuso opciones', e.explicacion.resumen);
  await revit.pintar(e.resultado, Object.values(plan).flat());
  log(e, 'revit', 'Pintó resultados', 'Vista 3D "NexoBIM E.070" y parámetro Comentarios');
  return guardar(e);
}

export async function aplicarOpcion(opcionId: string) {
  const e = leer();
  const o = e.resultado?.opciones.find(x => x.id === opcionId);
  if (!o) throw new Error(`Opción ${opcionId} no existe en el último resultado.`);
  const msg = await revit.aplicar(o);
  e.aplicadas.push(opcionId);
  if (o.accion === 'convertir_tabique') e.decisiones[o.muroId] = 'portante';
  log(e, 'ingeniero', 'Aplicó opción en Revit', msg);
  guardar(e);
  await leerModeloConservando();
  return verificarYPintar();
}

async function leerModeloConservando() {
  const e = leer();
  e.modelo = await revit.extraer();
  log(e, 'revit', 'Releyó modelo', `${e.modelo.muros.length} muros`);
  return guardar(e);
}

/** Crea un proyecto NUEVO en Revit con el caso de prueba y reinicia el estado (los parámetros quedan propuestos, no aprobados). */
export async function crearCasoPrueba(nombre: NombreCaso = 'municipalidad') {
  const caso = CASOS[nombre]();
  const ruta = fileURLToPath(new URL(`../modelos/${nombre}-${Date.now()}.rvt`, import.meta.url));
  const msg = await revit.crearModelo(caso, ruta);
  const e: Estado = { ...leer(), modelo: null, clasificacion: {}, decisiones: {}, resultado: null, explicacion: null, plan: {}, aplicadas: [], log: [],
    parametros: { Z: caso.Z, U: caso.U, S: caso.S, aprobados: false } };
  log(e, 'revit', 'Creó proyecto de prueba', `${caso.nombre} → ${ruta}. ${msg}`);
  return guardar(e);
}

export async function guardarModelo() {
  const e = leer();
  log(e, 'revit', 'Guardó modelo', await revit.guardar());
  return guardar(e);
}
