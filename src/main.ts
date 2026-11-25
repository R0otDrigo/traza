import './style.css';
import type { Hipotesis, ResultadoTrazable, Estado } from './types';
import { generarEdificio } from './bim/parametric';
import { HIPOTESIS_BASE, valoresDe } from './engine/criteria';
import { evaluar } from './engine/engine';
import { Visor } from './viewer/viewer';

const ed = generarEdificio();
const hs: Hipotesis[] = structuredClone(HIPOTESIS_BASE);
let res: Map<string, ResultadoTrazable> | null = null;
let semaforo = true;
let sel: string | null = null;
const log: { t: string; accion: string; detalle: string }[] = [];
const decision = new Map<string, 'aceptado' | 'corregir'>();

const $ = <T extends HTMLElement>(q: string) => document.querySelector<T>(q)!;
const visor = new Visor($('#visor'), ed);
visor.onSelect = id => { sel = id; trazar(); };

const ETQ: Record<Estado, string> = { cumple: 'Cumple', revisar: 'Revisar', no_cumple: 'No cumple' };
const registrar = (accion: string, detalle: string) => {
  log.unshift({ t: new Date().toLocaleTimeString(), accion, detalle });
  $('#log').innerHTML = log.map(l => `<li><time>${l.t}</time> <b>${l.accion}</b> ${l.detalle}</li>`).join('');
  $('#nlog').textContent = String(log.length);
};

// ---------- Hipótesis (humano en el bucle) ----------
function pintarHipotesis() {
  const pend = hs.filter(h => h.aprobada !== true).length;
  $('#hpend').textContent = pend ? `${pend} pendientes` : 'todas aprobadas';
  $<HTMLButtonElement>('#calcular').disabled = pend > 0;
  $('#hipotesis').innerHTML = hs.map((h, k) => `
    <li class="hip ${h.aprobada === true ? 'ok' : h.aprobada === false ? 'rech' : ''}">
      <div class="hd"><span>${h.descripcion}</span><span class="src ${h.fuente}">${h.fuente}</span></div>
      <div class="row">
        <input data-k="${k}" type="number" step="any" value="${h.valor}"><span class="u">${h.unidad}</span>
        <button data-ap="${k}" title="Aprobar">✓</button><button data-re="${k}" title="Rechazar">✕</button>
      </div>
      <div class="norma">${h.norma}</div>
    </li>`).join('');
}
$('#hipotesis').addEventListener('click', e => {
  const b = e.target as HTMLElement;
  const ap = b.dataset.ap, re = b.dataset.re;
  if (ap == null && re == null) return;
  const h = hs[Number(ap ?? re)];
  h.aprobada = ap != null;
  registrar(h.aprobada ? 'Aprobó' : 'Rechazó', `${h.descripcion} = ${h.valor} ${h.unidad}`);
  pintarHipotesis();
});
$('#hipotesis').addEventListener('change', e => {
  const i = e.target as HTMLInputElement;
  const h = hs[Number(i.dataset.k)];
  registrar('Editó', `${h.descripcion}: ${h.valor} → ${i.value} ${h.unidad}`);
  h.valor = Number(i.value);
  h.aprobada = null;
  res = null;
  visor.pintar(null);
  resumen();
  pintarHipotesis();
});
$('#aprobarTodas').onclick = () => {
  hs.forEach(h => (h.aprobada = true));
  registrar('Aprobó', `todas las hipótesis (${hs.length})`);
  pintarHipotesis();
};

// ---------- Cálculo ----------
$('#calcular').onclick = () => {
  res = evaluar(ed, valoresDe(hs));
  registrar('Calculó', `${res.size} elementos con el motor determinista`);
  semaforo = true;
  visor.pintar(res);
  resumen();
  trazar();
};
$('#vista').onclick = () => {
  semaforo = !semaforo;
  visor.pintar(semaforo ? res : null);
  $('#vista').textContent = semaforo ? 'Ver modelo BIM' : 'Ver semáforo';
};
$('#armar').onclick = () => visor.armar();

function resumen() {
  const cont = { cumple: 0, revisar: 0, no_cumple: 0 };
  res?.forEach(r => cont[r.estado]++);
  const n = (t: string) => ed.elementos.filter(e => e.tipo === t).length / ed.niveles.length;
  $('#stats').innerHTML = `
    <span>${ed.niveles.length} pisos · ${n('columna')} col · ${n('viga')} vigas · ${n('losa')} paños por piso</span>
    ${res ? `<span class="pill cumple">${cont.cumple} cumple</span><span class="pill revisar">${cont.revisar} revisar</span><span class="pill no_cumple">${cont.no_cumple} no cumple</span>` : '<span class="muted">Sin calcular</span>'}`;
  const malos = res ? [...res.values()].filter(r => r.estado === 'no_cumple') : [];
  $('#inconsist').innerHTML = malos.length
    ? malos.map(r => `<li data-id="${r.elementoId}"><b>${r.elementoId}</b> ratio ${r.ratio}<br><small>${r.advertencias[0] ?? ''}</small></li>`).join('')
    : `<li class="muted">${res ? 'Sin inconsistencias' : 'Aprueba las hipótesis y calcula'}</li>`;
}
$('#inconsist').addEventListener('click', e => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li?.dataset.id) return;
  sel = li.dataset.id;
  visor.seleccionar(sel, true);
  trazar();
});

// ---------- Traza del elemento seleccionado ----------
function trazar() {
  const el = ed.elementos.find(e => e.id === sel);
  const box = $('#traza');
  if (!el) { box.innerHTML = '<p class="muted">Haz clic en un elemento del modelo 3D.</p>'; return; }
  const r = res?.get(el.id);
  const cab = `<h3>${el.id}</h3><p class="muted">${el.tipo} · ${el.nivel} · GUID ${el.guid}</p>`;
  if (!r) { box.innerHTML = cab + '<p class="muted">Calcula para ver la traza.</p>'; return; }
  const d = decision.get(el.id);
  box.innerHTML = cab + `
    <div class="estado ${r.estado}">${ETQ[r.estado]} · ratio ${r.ratio}</div>
    <div class="bar"><i style="width:${Math.min(100, r.ratio * 100)}%" class="${r.estado}"></i><em></em></div>
    <h4>${r.magnitud}: ${r.valor} ${r.unidad}</h4>
    <code>${r.formula}</code><code class="sub">${r.sustitucion}</code>
    <table>${Object.entries(r.inputs).map(([k, x]) => `<tr><td>${k}</td><td>${x.valor} ${x.unidad}</td><td><span class="src ${x.fuente}">${x.fuente}</span></td></tr>`).join('')}</table>
    <div class="cmp"><div><small>Modelo BIM</small><b>${r.modelo}</b></div><div><small>Propuesto</small><b>${r.propuesto}</b></div></div>
    ${r.advertencias.map(a => `<p class="adv">⚠ ${a}</p>`).join('')}
    <p class="norma">${r.norma}</p>
    <div class="row">
      <button id="acep" class="${d === 'aceptado' ? 'on' : ''}">Aceptar resultado</button>
      <button id="corr" class="${d === 'corregir' ? 'on' : ''}">Marcar para corregir</button>
    </div>`;
  $('#acep').onclick = () => { decision.set(el.id, 'aceptado'); registrar('Aceptó', `${el.id} (${r.propuesto})`); trazar(); };
  $('#corr').onclick = () => { decision.set(el.id, 'corregir'); registrar('Marcó corregir', `${el.id}: ${r.modelo} → ${r.propuesto}`); trazar(); };
}

pintarHipotesis();
resumen();
trazar();
