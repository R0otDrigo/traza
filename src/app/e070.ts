import './e070.css';
import { Escena } from './escena.ts';
import { verificar, simular } from '../e070/engine.ts';
import type { Proyecto, Resultado, Opcion, Rol } from '../e070/types.ts';

type Estado = any; // espejo de src/pipeline.ts → Estado (+ pendientes)
const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let E: Estado | null = null;
const sim = new Set<string>();           // opciones simuladas (solo en el navegador)
let sel: string | null = null;
let ocupado = false;
let ultimoError = '';
const escena = new Escena($('#escena'));
escena.onClick = id => { sel = id; render(); };

async function api(ruta: string, body?: object) {
  const r = await fetch(`/api/${ruta}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
async function accion(ruta: string, body: object = {}, texto = 'Procesando…') {
  if (ocupado) return;
  ocupado = true; ultimoError = ''; $('#ocupado').textContent = texto; document.body.classList.add('busy');
  try { E = await api(ruta, body); if (ruta === 'aplicar' || ruta === 'leer') sim.clear(); }
  catch (e) { ultimoError = (e as Error).message; }
  finally { ocupado = false; document.body.classList.remove('busy'); render(); }
}

/** Mismo criterio que el servidor: rol = decisión del ingeniero ?? propuesta. Luego aplica opciones simuladas. */
function proyecto(): Proyecto | null {
  if (!E?.modelo) return null;
  const simuladas = ((E.resultado?.opciones ?? []) as Opcion[]).filter(o => sim.has(o.id));
  return simular({
    nombre: E.modelo.documento, ...E.parametros, niveles: E.modelo.niveles,
    muros: E.modelo.muros.map((m: any) => ({ ...m, rol: (E.decisiones[m.id] ?? E.clasificacion[m.id]?.rol ?? 'desconocido') as Rol })),
  }, simuladas);
}

function render() {
  const p = proyecto();
  $('#doc').textContent = E?.modelo ? `${E.modelo.documento} · ${E.modelo.muros.length} muros · ${E.modelo.niveles.length} niveles` : 'Sin modelo leído';
  $('#ia').className = `ia ${E?.ia ? 'on' : 'off'}`;
  $('#ia').textContent = E?.ia ? 'IA: Claude activo' : 'IA: modo reglas (sin API key)';
  $('#pend').innerHTML = ultimoError ? `<b class="err">⚠ ${esc(ultimoError)}</b>` : E?.pendientes?.length ? `Pendiente: ${E.pendientes.map(esc).join(' · ')}` : E?.resultado ? 'Verificación oficial vigente' : '';
  pintarParametros();
  pintarMuros();
  if (!p) { $('#barras').innerHTML = '<p class="muted">Lee el modelo de Revit para empezar.</p>'; return; }
  const r = verificar(p);
  escena.dibujar(p, r, new Set((E.resultado?.opciones ?? []).filter((o: Opcion) => sim.has(o.id)).map((o: Opcion) => o.muroId)), sel);
  pintarBarras(r);
  pintarOpciones(r);
  pintarDetalle(p, r);
  $('#log').innerHTML = (E.log ?? []).slice(0, 60).map((l: any) => `<li class="${l.quien}"><time>${new Date(l.t).toLocaleTimeString()}</time><b>${esc(l.quien)}</b> ${esc(l.accion)}<small>${esc(l.detalle)}</small></li>`).join('');
}

function pintarParametros() {
  const pr = E?.parametros ?? { Z: 0.35, U: 1, S: 1.15, aprobados: false };
  const N = E?.modelo?.niveles.length ?? 0;
  for (const k of ['Z', 'U', 'S'] as const) $<HTMLInputElement>(`#${k}`).value = String(pr[k]);
  $('#req').innerHTML = `N = ${N} → Z·U·S·N/56 = <b>${N ? ((pr.Z * pr.U * pr.S * N) / 56).toFixed(6) : '—'}</b>`;
  $('#aprobarParams').textContent = pr.aprobados ? '✓ Aprobados' : 'Aprobar parámetros';
  $('#aprobarParams').classList.toggle('ok', pr.aprobados);
}
for (const k of ['Z', 'U', 'S']) $(`#${k}`).addEventListener('change', () => accion('params', { Z: +$<HTMLInputElement>('#Z').value, U: +$<HTMLInputElement>('#U').value, S: +$<HTMLInputElement>('#S').value, aprobados: false }));
$('#aprobarParams').onclick = () => accion('params', { Z: +$<HTMLInputElement>('#Z').value, U: +$<HTMLInputElement>('#U').value, S: +$<HTMLInputElement>('#S').value, aprobados: true });

function pintarMuros() {
  if (!E?.modelo) { $('#muros').innerHTML = ''; return; }
  const porNivel = new Map<string, any[]>();
  for (const m of E.modelo.muros) porNivel.set(m.nivel, [...(porNivel.get(m.nivel) ?? []), m]);
  $('#muros').innerHTML = [...porNivel].map(([nv, ms]) => `<details ${nv === E.modelo.niveles[0].nombre ? 'open' : ''}><summary>${esc(nv)} <small>${ms.length} muros</small></summary>${ms.map(m => {
    const c = E.clasificacion[m.id], d = E.decisiones[m.id];
    const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1).toFixed(2);
    return `<div class="muro ${m.id === sel ? 'sel' : ''} ${d ? 'dec' : ''}" data-id="${m.id}">
      <div class="mh"><b>${esc(m.marca || m.id)}</b><span>${esc(m.tipoRevit)} · L ${L} · t ${m.t}</span></div>
      <div class="mp"><span class="src ${c?.fuente}">${c?.fuente ?? '-'} ${c ? Math.round(c.confianza * 100) + '%' : ''}</span><i>${esc(c?.razon)}</i></div>
      <div class="rol">${(['portante', 'tabique', 'desconocido'] as Rol[]).map(r => `<button data-rol="${r}" class="${(d ?? c?.rol) === r ? (d ? 'on' : 'prop') : ''}">${r}</button>`).join('')}</div>
    </div>`;
  }).join('')}</details>`).join('');
}
$('#muros').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'), card = (e.target as HTMLElement).closest<HTMLElement>('.muro');
  if (!card) return;
  if (b?.dataset.rol) return accion('decidir', { id: card.dataset.id, rol: b.dataset.rol });
  sel = card.dataset.id!; render();
});
$('#aceptarTodo').onclick = () => accion('aceptar', {}, 'Registrando aprobación…');

function pintarBarras(r: Resultado) {
  const oficial = E.resultado as Resultado | null;
  const niveles = [...new Set(r.chequeos.map(c => c.nivel))];
  $('#barras').innerHTML = niveles.map(nv => `<div class="nv"><span>${esc(nv)}</span>${(['X', 'Y'] as const).map(d => {
    const c = r.chequeos.find(c => c.nivel === nv && c.dir === d)!;
    const o = oficial?.chequeos.find(c => c.nivel === nv && c.dir === d);
    const pct = Math.min(100, (c.densidad / (c.requerido * 2)) * 100);
    return `<div class="barra ${c.cumple ? 'ok' : 'mal'}" title="${esc(c.sustitucion)}"><em>${d}</em><div class="track"><i style="width:${pct}%"></i><u></u>${o && Math.abs(o.densidad - c.densidad) > 1e-9 ? `<s style="left:${Math.min(100, (o.densidad / (o.requerido * 2)) * 100)}%"></s>` : ''}</div><b>${(c.densidad / c.requerido).toFixed(2)}×</b></div>`;
  }).join('')}</div>`).join('') + `<p class="muted f">${esc(r.formula)} · ${esc(r.norma)}. La línea blanca es el mínimo; la marca gris, el último resultado oficial.</p>`;
}

function pintarOpciones(r: Resultado) {
  const ops: Opcion[] = E.resultado?.opciones ?? [];
  const plan = new Set(Object.values(E.plan ?? {}).flat() as string[]);
  const ex = E.explicacion;
  const rec = new Map<string, any>((ex?.recomendaciones ?? []).map((x: any) => [x.opcionId, x]));
  $('#resumen').innerHTML = ex ? `<span class="src ${ex.fuente}">${ex.fuente}</span> ${esc(ex.resumen)}` : '<span class="muted">Verifica para obtener opciones.</span>';
  const fallan = new Set(r.chequeos.filter(c => !c.cumple).map(c => `${c.nivel}|${c.dir}`));
  $('#opciones').innerHTML = ops.map(o => {
    const x = rec.get(o.id);
    return `<li class="${sim.has(o.id) ? 'sim' : ''} ${plan.has(o.id) ? 'plan' : ''} ${E.aplicadas?.includes(o.id) ? 'hecha' : ''}" data-id="${o.id}" data-muro="${o.muroId}">
      <div class="oh"><b>${esc(o.nivel)} ${o.dir}</b><span>+${o.deltaLt} m²</span>${plan.has(o.id) ? '<em>plan mínimo</em>' : ''}${fallan.has(`${o.nivel}|${o.dir}`) ? '' : '<em class="ok">ya cubierto</em>'}</div>
      <p>${esc(o.detalle)}</p>${x ? `<small><b>${esc(ex.fuente)}:</b> ${esc(x.justificacion)} ${x.impactoArquitectonico ? '· ' + esc(x.impactoArquitectonico) : ''}</small>` : ''}
      <div class="row"><label><input type="checkbox" data-sim ${sim.has(o.id) ? 'checked' : ''}> Simular</label><button data-aplicar>Aplicar en Revit</button></div></li>`;
  }).join('');
}
$('#opciones').addEventListener('click', e => {
  const t = e.target as HTMLElement, li = t.closest<HTMLElement>('li');
  if (!li) return;
  if (t.matches('[data-sim]')) { (t as HTMLInputElement).checked ? sim.add(li.dataset.id!) : sim.delete(li.dataset.id!); return render(); }
  if (t.matches('[data-aplicar]')) { if (confirm(`¿Aplicar en el modelo de Revit?\n\n${li.querySelector('p')!.textContent}\n\n(Se puede deshacer con Ctrl+Z en Revit.)`)) accion('aplicar', { opcionId: li.dataset.id }, 'Aplicando en Revit y re-verificando…'); return; }
  sel = li.dataset.muro!; render();
});
$('#simPlan').onclick = () => { for (const id of Object.values(E?.plan ?? {}).flat() as string[]) sim.add(id); render(); };
$('#simNada').onclick = () => { sim.clear(); render(); };

function pintarDetalle(p: Proyecto, r: Resultado) {
  const m = p.muros.find(m => m.id === sel);
  if (!m) { $('#detalle').innerHTML = '<p class="muted">Haz clic en un muro del 3D o de la lista.</p>'; return; }
  const ts = r.tramos.filter(t => t.muroId === m.id);
  const c = E.clasificacion[m.id];
  $('#detalle').innerHTML = `<h3>${esc((m as any).marca || m.id)} <small>${esc(m.nivel)} · Id Revit ${esc(m.id)}</small></h3>
    <p>${esc(m.tipoRevit)} · t = ${m.t} m · h = ${m.h} m · rol <b>${m.rol}</b> ${E.decisiones[m.id] ? '(aprobado)' : '(propuesto)'}</p>
    ${c ? `<p class="muted"><span class="src ${c.fuente}">${c.fuente}</span> ${esc(c.razon)}</p>` : ''}
    <table><tr><th>Tramo</th><th>L (m)</th><th>L·t (m²)</th><th>¿Cuenta?</th></tr>${ts.map((t, i) => `<tr class="${t.cuenta ? 'ok' : 'mal'}"><td>${i + 1}</td><td>${t.L}</td><td>${(t.L * t.t).toFixed(3)}</td><td>${t.cuenta ? 'Sí' : esc(t.motivos.join('; '))}</td></tr>`).join('')}</table>`;
}

$('#btnCrear').onclick = () => {
  const caso = $<HTMLSelectElement>('#caso').value;
  if (confirm(`Se creará un proyecto NUEVO en Revit (en la carpeta modelos/) con el caso "${caso}" y se reiniciará el registro de TRAZA. El proyecto abierto no se modifica. ¿Continuar?`)) { sel = null; accion('crear', { caso }, 'Creando proyecto y construyendo el modelo en Revit…'); }
};
$('#btnGuardar').onclick = () => accion('guardar', {}, 'Guardando modelo…');
$('#btnLeer').onclick = () => accion('leer', {}, 'Leyendo Revit y clasificando muros…');
$('#btnVerificar').onclick = () => accion('verificar', { notas: $<HTMLInputElement>('#notas').value }, 'Verificando E.070 y pintando Revit…');
$('#btnMemoria').onclick = () => open('/api/memoria', '_blank');

api('estado').then(e => { E = e; render(); }).catch(() => render());
setInterval(async () => { if (ocupado) return; try { const e = await api('estado'); if (JSON.stringify(e.log?.[0]) !== JSON.stringify(E?.log?.[0])) { E = e; render(); } } catch {} }, 3000);
