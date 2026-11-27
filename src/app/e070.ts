import './e070.css';
import { Escena } from './escena.ts';
import { verificar, simular } from '../e070/engine.ts';
import { pintarSuelo, mostrarMapa, recomendacionesSuelo, colorSucs, esc } from './suelo.ts';
import { AVISO_PROTOTIPO } from '../contracts/index.ts';
import type { Proyecto, Resultado, Opcion, Rol } from '../e070/types.ts';

type Estado = any; // espejo de src/pipeline.ts → Estado (+ pendientes)
const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
const DEMO = new URLSearchParams(location.search).has('demo');

let E: Estado | null = null;
const sim = new Set<string>();           // opciones simuladas (solo en el navegador)
let sel: string | null = null;
let ocupado = false;
let ultimoError = '';
let foco: { nivel: string; dir: string } | null = null; // barra enlazada desde el vigilante (#nivel=…&dir=…)
const vistas = new Set<string>();        // notificaciones cerradas en este navegador
const escena = new Escena($('#escena'));
escena.onClick = id => { sel = id; render(); };
$('#aviso').textContent = AVISO_PROTOTIPO;

async function api(ruta: string, body?: object, metodo = body ? 'POST' : 'GET') {
  let r: Response;
  try { r = await fetch(`/api/${ruta}`, metodo === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) } : undefined); }
  catch { throw new Error('Sin conexión con el servidor de NexoBIM (npm run dev).'); }
  const j = await r.json().catch(() => ({ error: `Respuesta no válida del servidor (${r.status}).` }));
  if (r.status === 404) throw new Error(`Función aún no disponible en el servidor: ${metodo} /api/${ruta}.`);
  if (!r.ok) throw new Error(j.error);
  return j;
}
async function accion(ruta: string, body: object = {}, texto = 'Procesando…', metodo = 'POST') {
  if (ocupado) return;
  if (DEMO) { ultimoError = `Modo demo: "${metodo} /api/${ruta}" no se envía al servidor.`; return render(); }
  ocupado = true; ultimoError = ''; $('#ocupado').textContent = texto; document.body.classList.add('busy');
  try {
    const j = await api(ruta, body, metodo);
    E = j && typeof j === 'object' && 'log' in j ? j : await api('estado'); // algunas rutas no devuelven el Estado
    if (ruta === 'aplicar' || ruta === 'leer') sim.clear();
  }
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
  $('#ia').textContent = (DEMO ? 'MODO DEMO · ' : '') + (E?.ia ? 'IA: Claude activo' : 'IA: modo reglas (sin API key)');
  $('#pend').innerHTML = ultimoError ? `<b class="err">⚠ ${esc(ultimoError)}</b>` : E?.pendientes?.length ? `Pendiente: ${E.pendientes.map(esc).join(' · ')}` : E?.resultado ? 'Verificación oficial vigente' : '';
  pintarParametros();
  pintarMuros();
  pintarSuelo(E?.suelo, E?.parametros?.S ?? 0, accion);
  pintarVigilante();
  if (!p) { $('#barras').innerHTML = '<p class="muted">Lee el modelo de Revit para empezar.</p>'; $('#recom').innerHTML = recomendaciones(null); return; }
  const r = verificar(p);
  const es = E.suelo?.estudio ?? E.suelo?.resultado?.estudioElegido;
  const cal = (es?.calicatas ?? []).filter((c: any) => c.valor && c.estado !== 'rechazado').map((c: any) => c.valor);
  escena.dibujar(p, r, new Set((E.resultado?.opciones ?? []).filter((o: Opcion) => sim.has(o.id)).map((o: Opcion) => o.muroId)), sel,
    cal.length ? { calicatas: cal, perfil: es.perfilE030.valor, S: E.suelo?.resultado?.S_motor ?? null } : undefined);
  const sucs = [...new Set(cal.flatMap((c: any) => c.estratos.map((e: any) => e.SUCS)))] as string[];
  $('#leySuelo').hidden = !sucs.length;
  $('#leySuelo').innerHTML = `<b>Estratos (SUCS)</b>${sucs.map(s => `<span><i style="background:${colorSucs(s)}"></i>${esc(s)}</span>`).join('')}`;
  pintarBarras(r);
  $('#recom').innerHTML = recomendaciones(r);
  pintarOpciones(r);
  pintarDetalle(p, r);
  $('#log').innerHTML = (E.log ?? []).slice(0, 60).map((l: any) => `<li class="${l.quien}"><time>${new Date(l.t).toLocaleTimeString()}</time><b>${esc(l.quien)}</b> ${esc(l.accion)}<small>${esc(l.detalle)}</small></li>`).join('');
}

function pintarParametros() {
  const pr = E?.parametros ?? { Z: 0.35, U: 1, S: 1.15, aprobados: false };
  const N = E?.modelo?.niveles.length ?? 0;
  for (const k of ['Z', 'U', 'S'] as const) $<HTMLInputElement>(`#${k}`).value = String(pr[k]);
  $('#req').innerHTML = `N = ${N} → Z·U·S·N/56 = <b>${N ? ((pr.Z * pr.U * pr.S * N) / 56).toFixed(6) : '—'}</b>`;
  const rs = E?.suelo?.resultado;
  $('#sFuente').textContent = rs?.S_motor != null ? `Suelo: S = ${rs.S_motor} · ${rs.S_fuente}${rs.S_motor === pr.S ? '' : ' (aún no usado en los parámetros)'}` : 'S sin estudio de suelos: valor asumido (ver pestaña Suelo).';
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
    return `<div class="barra ${c.cumple ? 'ok' : 'mal'} ${foco?.nivel === nv && foco.dir === d ? 'foco' : ''}" title="${esc(c.sustitucion)}"><em>${d}</em><div class="track"><i style="width:${pct}%"></i><u></u>${o && Math.abs(o.densidad - c.densidad) > 1e-9 ? `<s style="left:${Math.min(100, (o.densidad / (o.requerido * 2)) * 100)}%"></s>` : ''}</div><b>${(c.densidad / c.requerido).toFixed(2)}×</b></div>`;
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

function recomendaciones(r: Resultado | null) {
  let dens = '<p class="muted">Lee el modelo de Revit para ver qué falta.</p>';
  if (r) {
    const malos = r.chequeos.filter(c => !c.cumple);
    const ops = new Map<string, Opcion>((E.resultado?.opciones ?? []).map((o: Opcion) => [o.id, o]));
    dens = !malos.length ? '<p class="ok-txt">✓ Cumple la densidad mínima en todos los niveles y direcciones.</p>' : malos.map(c => {
      const plan = ((E.plan?.[`${c.nivel}|${c.dir}`] ?? []) as string[]).map(id => ops.get(id)).filter(Boolean) as Opcion[];
      const suma = plan.reduce((a, o) => a + o.deltaLt, 0);
      return `<div class="rec-d"><div><b>${esc(c.nivel)} ${c.dir}</b> <span class="muted">faltan ${c.deficitLt.toFixed(2)} m² de L·t</span></div>
        <ul>${plan.map(o => `<li>${esc(o.detalle.split(' — ')[0])} <b>+${o.deltaLt} m²</b></li>`).join('') || '<li class="muted">Sin opciones del motor: pulsa «Verificar».</li>'}</ul>
        ${plan.length ? `<small class="${suma >= c.deficitLt - 1e-9 ? 'ok-txt' : 'adv'}">Aporte del plan mínimo: ${suma.toFixed(2)} m² ${suma >= c.deficitLt - 1e-9 ? '≥' : '<'} déficit</small>` : ''}</div>`;
    }).join('');
  }
  return `<h4>Densidad <small>(opciones del motor E.070)</small></h4>${dens}<h4>Cimentación y cemento <small>(textos del EMS)</small></h4>${recomendacionesSuelo(E?.suelo)}`;
}

const hora = (t: string) => new Date(t).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
function pintarVigilante() {
  const v = E?.vigilante;
  const ns = (v?.notificaciones ?? []).filter((n: any) => !vistas.has(n.mensaje));
  $('#vigia').hidden = !ns.length;
  $('#vigia').innerHTML = ns.map((n: any) => `<div class="${n.tipo === 'deja_de_cumplir' ? 'mal' : 'ok'}">
    <b>${n.tipo === 'deja_de_cumplir' ? '✗ Deja de cumplir' : '✓ Vuelve a cumplir'}</b><span>${esc(n.mensaje)}</span>
    <a href="#${esc(n.url.split('#')[1] ?? '')}">Ver ${esc(n.nivel)} · ${esc(n.dir)}</a><button class="mini sec" data-cerrar="${esc(n.mensaje)}" aria-label="Cerrar aviso">✕</button></div>`).join('');
  $<HTMLInputElement>('#vigActivo').checked = !!v?.activo;
  $<HTMLInputElement>('#vigPintar').checked = !!v?.pintarAuto;
  const f = E?.ifc;
  $('#ifcInfo').innerHTML = f ? `IFC: ${esc(f.ruta)} · ${hora(f.en)} · ${f.conPset}/${f.muros} muros con Pset ${f.verificado ? '<span class="ok-txt">✓ verificado</span>' : '<span class="adv">sin verificar</span>'} · <a href="/api/bim/ifc" target="_blank" rel="noopener">descargar</a>` : 'Aún no se exportó el IFC.';
  const flip = (ev: any) => ev.cumplimientoDespues.filter((d: any) => ev.cumplimientoAntes.find((a: any) => a.nivel === d.nivel && a.dir === d.dir)?.cumple !== d.cumple)
    .map((d: any) => `<em class="${d.cumple ? 'ok' : 'mal'}">${esc(d.nivel)} ${d.dir}: ${d.cumple ? 'vuelve a cumplir' : 'deja de cumplir'}</em>`).join('');
  const ev = (v?.eventos ?? []).slice(0, 10), vs = (E?.versiones ?? []).slice(0, 10);
  $('#historial').innerHTML = !ev.length && !vs.length ? '<li class="muted">Sin cambios registrados. Activa la vigilancia para detectar cambios del modelo en Revit.</li>'
    : ev.map((x: any) => `<li><time>${hora(x.en)}</time><b>Cambio</b>${x.cambios.map((c: string) => `<small>${esc(c)}</small>`).join('')}${flip(x)}</li>`).join('')
    + vs.map((x: any) => `<li class="ver"><time>${hora(x.en)}</time><b>Versión ${esc(x.huella)}</b> <span class="muted">${x.cumplimiento.filter((c: any) => c.cumple).length}/${x.cumplimiento.length} cumplen</span><small>${esc(x.nota)}</small></li>`).join('');
}
$('#vigia').addEventListener('click', e => { const c = (e.target as HTMLElement).dataset.cerrar; if (c) { vistas.add(c); pintarVigilante(); } });
$<HTMLInputElement>('#vigActivo').onchange = e => accion('vigilante', { activo: (e.target as HTMLInputElement).checked }, 'Cambiando vigilancia…');
$<HTMLInputElement>('#vigPintar').onchange = e => accion('vigilante', { pintarAuto: (e.target as HTMLInputElement).checked }, 'Cambiando pintado automático…');
$('#btnVistas').onclick = () => accion('vigilante/vistas', {}, 'Creando vistas en Revit…');
$('#btnParamRevit').onclick = () => { if (confirm('¿Escribir los parámetros NexoBIM_* (resultado E.070 y datos de suelo aprobados) en los muros del modelo de Revit?\n\nSe puede deshacer con Ctrl+Z en Revit y queda en el registro de decisiones.')) accion('bim/parametros', { aprobado: true }, 'Escribiendo parámetros en Revit…'); };
$('#btnIfc').onclick = () => accion('bim/ifc', {}, 'Exportando IFC…');

function tab(t: string) {
  document.querySelectorAll<HTMLElement>('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
  $('#vistaE070').hidden = t !== 'e070';
  $('#vistaSuelo').hidden = t !== 'suelo';
  document.body.dataset.tab = t;
  if (t === 'suelo') mostrarMapa();
}
document.querySelectorAll<HTMLElement>('.tabs button').forEach(b => (b.onclick = () => tab(b.dataset.tab!)));
tab(new URLSearchParams(location.search).get('tab') === 'suelo' ? 'suelo' : 'e070');

/** Enlace del vigilante: #nivel=<n>&dir=<X|Y> resalta esa barra. */
function leerHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  foco = h.get('nivel') ? { nivel: h.get('nivel')!, dir: h.get('dir') ?? 'X' } : null;
  if (foco) tab('e070');
  render();
  document.querySelector('.barra.foco')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
addEventListener('hashchange', leerHash);

function presentar() {
  const on = document.body.classList.toggle('presentacion');
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
}
$('#btnPres').onclick = presentar;
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as HTMLElement).matches('input, textarea, select')) presentar(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('presentacion'); });

$('#btnCrear').onclick = () => {
  const caso = $<HTMLSelectElement>('#caso').value;
  if (confirm(`Se creará un proyecto NUEVO en Revit (en la carpeta modelos/) con el caso "${caso}" y se reiniciará el registro de NexoBIM. El proyecto abierto no se modifica. ¿Continuar?`)) { sel = null; accion('crear', { caso }, 'Creando proyecto y construyendo el modelo en Revit…'); }
};
$('#btnGuardar').onclick = () => accion('guardar', {}, 'Guardando modelo…');
$('#btnLeer').onclick = () => accion('leer', {}, 'Leyendo Revit y clasificando muros…');
$('#btnVerificar').onclick = () => accion('verificar', { notas: $<HTMLInputElement>('#notas').value }, 'Verificando E.070 y pintando Revit…');
$('#btnMemoria').onclick = () => open('/api/memoria', '_blank');

const firma = (e: Estado) => JSON.stringify([e?.log?.[0], e?.vigilante?.notificaciones, e?.vigilante?.huella]);
(DEMO ? fetch('/fixtures/estado_demo.json').then(r => r.json()) : api('estado'))
  .then(e => { E = e; leerHash(); })
  .catch(e => { ultimoError = (e as Error).message; render(); });
if (!DEMO) setInterval(async () => { if (ocupado) return; try { const e = await api('estado'); if (firma(e) !== firma(E)) { E = e; render(); } } catch {} }, 3000);
