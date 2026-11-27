// Vigilante en vivo (fase 5): corre en el proceso del panel. Cada ~5 s consulta la huella del modelo SOLO si hay
// una verificación aprobada, está activo y la cola de Revit está libre (nunca interrumpe una operación).
// Si cambia: re-extrae → conserva roles aprobados (muros nuevos = 'desconocido') → motor (sin IA) → evento + log.
import * as P from './pipeline.ts';
import * as revit from './revit/bridge.ts';
import { verificar } from './e070/engine.ts';
import { planMinimo } from './ai/asistente.ts';
import { notificar } from './notificar.ts';
import type { ModeloRevit } from './revit/bridge.ts';
import type { Resultado, Rol, Dir } from './e070/types.ts';
import type { EventoVigilante, Notificacion } from './contracts/index.ts';

type Cumpl = EventoVigilante['cumplimientoAntes'];

export const urlNotificacion = (nivel: string, dir: Dir) => `http://localhost:5173/#nivel=${encodeURIComponent(nivel)}&dir=${dir}`;

export const cumplimiento = (r: Resultado | null): Cumpl => (r?.chequeos ?? []).map(c => ({ nivel: c.nivel, dir: c.dir, cumple: c.cumple }));

/** Niveles/direcciones que pasan de cumple ↔ no cumple. */
export function transiciones(antes: Cumpl, despues: Cumpl): Notificacion[] {
  return despues.flatMap(d => {
    const a = antes.find(x => x.nivel === d.nivel && x.dir === d.dir);
    if (!a || a.cumple === d.cumple) return [];
    return [{ nivel: d.nivel, dir: d.dir, tipo: d.cumple ? 'vuelve_a_cumplir' : 'deja_de_cumplir',
      mensaje: `${d.nivel} ${d.dir}: ${d.cumple ? 'vuelve a cumplir' : 'deja de cumplir'} la densidad de muros (E.070)`, url: urlNotificacion(d.nivel, d.dir) }];
  });
}

/** Solo los roles aprobados de muros que siguen existiendo; los nuevos quedan sin decisión ('desconocido'). */
export const conservarRoles = (decisiones: Record<string, Rol>, muros: { id: string }[]) =>
  Object.fromEntries(muros.filter(m => m.id in decisiones).map(m => [m.id, decisiones[m.id]]));

/** Cambios legibles entre dos extracciones. */
export function cambiosModelo(a: ModeloRevit | null, b: ModeloRevit): string[] {
  const A = new Map((a?.muros ?? []).map(m => [m.id, m]));
  const out: string[] = [];
  for (const m of b.muros) {
    const o = A.get(m.id); A.delete(m.id);
    if (!o) { out.push(`muro ${m.id}: nuevo (${m.tipoRevit}, ${m.nivel}), rol pendiente de aprobar`); continue; }
    if (o.tipoRevit !== m.tipoRevit) out.push(`muro ${m.id}: tipo ${o.tipoRevit} → ${m.tipoRevit}`);
    else if (o.t !== m.t) out.push(`muro ${m.id}: espesor ${o.t} → ${m.t} m`);
    if (o.nivel !== m.nivel) out.push(`muro ${m.id}: nivel ${o.nivel} → ${m.nivel}`);
    if ([o.x1, o.y1, o.x2, o.y2].join() !== [m.x1, m.y1, m.x2, m.y2].join()) out.push(`muro ${m.id}: se movió o cambió de largo`);
    if (JSON.stringify(o.aberturas) !== JSON.stringify(m.aberturas)) out.push(`muro ${m.id}: vanos ${o.aberturas.length} → ${m.aberturas.length}${o.aberturas.length === m.aberturas.length ? ' (modificados)' : ''}`);
  }
  for (const id of A.keys()) out.push(`muro ${id}: eliminado`);
  if (JSON.stringify(a?.niveles) !== JSON.stringify(b.niveles)) out.push('niveles o áreas de losa modificados');
  return out;
}

export const debeConsultar = (e: P.Estado, ocupado: boolean) =>
  !ocupado && !!e.vigilante?.activo && !!e.resultado && !!e.modelo && e.parametros.aprobados;

// Singleton del proceso: un solo setInterval aunque Vite recargue el módulo (llama siempre a la última versión).
const G: { timer?: ReturnType<typeof setInterval>; revisando?: boolean; revisar?: () => Promise<unknown> } =
  ((globalThis as any).__nexobimVigilante ??= {});

export async function revisar(): Promise<EventoVigilante | null> {
  if (G.revisando || !debeConsultar(P.leer(), revit.ocupado())) return null;
  G.revisando = true;
  try {
    const { huella } = await revit.huella();
    let e = P.leer();
    if (huella === e.vigilante!.huella) return null;
    if (e.vigilante!.huella === null) { e.vigilante!.huella = huella; P.guardar(e); return null; } // línea base
    const modelo = await revit.extraer();
    e = P.leer(); // releer: otra ruta pudo escribir mientras Revit respondía
    const v = e.vigilante!, cambios = cambiosModelo(e.modelo, modelo), antes = cumplimiento(e.resultado);
    if (!cambios.length) { v.huella = huella; P.guardar(e); return null; } // ya reflejado (p. ej. tras aplicar una opción)
    e.modelo = modelo;
    e.decisiones = conservarRoles(e.decisiones, modelo.muros);
    e.resultado = verificar(P.proyectoDe(e));
    e.explicacion = null;
    e.plan = Object.fromEntries(Object.entries(planMinimo(e.resultado)).map(([k, ops]) => [k, ops.map(o => o.id)]));
    const ev: EventoVigilante = { en: new Date().toISOString(), huellaAnterior: v.huella!, huellaNueva: huella, cambios, cumplimientoAntes: antes, cumplimientoDespues: cumplimiento(e.resultado) };
    const notifs = transiciones(ev.cumplimientoAntes, ev.cumplimientoDespues);
    v.huella = huella;
    v.eventos = [ev, ...v.eventos].slice(0, 50);
    v.notificaciones.push(...notifs);
    const malos = ev.cumplimientoDespues.filter(c => !c.cumple).map(c => `${c.nivel} ${c.dir}`);
    P.registrar(e, 'vigilante', 'Detectó cambio y re-verificó (motor, sin IA)', `${cambios.join('; ')}. ${malos.length ? 'No cumple: ' + malos.join(', ') : 'Cumple en X e Y'}`);
    P.guardar(e);
    for (const n of notifs) notificar('NexoBIM E.070', n.mensaje, n.url);
    if (v.pintarAuto) {
      await revit.pintar(e.resultado);
      const f = P.leer(); P.registrar(f, 'vigilante', 'Repintó Revit', 'pintarAuto activo'); P.guardar(f);
    }
    return ev;
  } catch { return null; } // Revit cerrado u ocupado por otro cliente: se reintenta en el siguiente ciclo
  finally { G.revisando = false; }
}

export function iniciar(ms = 5000) {
  G.revisar = revisar;
  G.timer ??= setInterval(() => void G.revisar!().catch(() => {}), ms);
  G.timer.unref?.(); // no retiene procesos de prueba o CLI
}
