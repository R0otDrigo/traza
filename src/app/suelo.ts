// Pestaña Suelo: mapa (Leaflet + OSM), obras cercanas, ficha del EMS con citas y aprobación por campo.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AVISO_SUELO, type EstadoSuelo, type EstudioSuelo, type Cita, type Calicata } from '../contracts/index.ts';

type Accion = (ruta: string, body?: object, texto?: string, metodo?: string) => void;
type Campo = { valor: any; cita: Cita | null; estado: string; por: string; en: string };
const $ = (q: string) => document.querySelector<HTMLElement>(q)!;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Colores por SUCS (mismos en la ficha, la leyenda y el 3D). */
export const COLOR_SUCS: Record<string, string> = {
  GW: '#c2410c', GP: '#ea7a2b', GM: '#b45309', GC: '#92400e', SW: '#fcd34d', SP: '#fde68a', SM: '#d6b25e', SC: '#a8893a',
  ML: '#a3a37a', MH: '#7c7c55', CL: '#a1887f', CH: '#795548', OL: '#5b6b3a', OH: '#4a5530', Pt: '#3f3f2f', Relleno: '#8a8580',
};
export const colorSucs = (s: string) => COLOR_SUCS[s] ?? COLOR_SUCS[s.slice(0, 2).toUpperCase()] ?? '#9ca3af';

const ETIQUETA: Record<string, string> = {
  fecha: 'Fecha del EMS', calicatas: 'Calicata', perfilE030: 'Perfil de suelo (E.030)', S_reportadoEMS: 'S reportado en el EMS',
  capacidadPortante_kgcm2: 'Capacidad portante (kg/cm²)', Df_m: 'Profundidad de cimentación Df (m)', tipoCimentacionRecomendada: 'Cimentación recomendada',
  nivelFreatico_m: 'Nivel freático (m)', sulfatos_ppm: 'Sulfatos (ppm)', cloruros_ppm: 'Cloruros (ppm)', salesSolubles_ppm: 'Sales solubles (ppm)',
  cementoRecomendado: 'Cemento recomendado', riesgos: 'Riesgo', recomendacionesEMS: 'Recomendación del EMS',
};
const ESTADO: Record<string, string> = { propuesto: 'Propuesto', aprobado: 'Aprobado', corregido: 'Corregido', rechazado: 'Rechazado' };

const txtCalicata = (c: Calicata) => `${c.id} · ${c.profundidad_m} m · ${c.estratos.map(e => `${e.SUCS} (${e.desde_m}–${e.hasta_m} m)`).join(' / ')}`;
const valorTxt = (k: string, v: any) => v === null || v === undefined ? '<i class="muted">No encontrado en el EMS</i>' : k === 'calicatas' ? esc(txtCalicata(v)) : esc(v);

export function citaBtn(obraId: string, c: Cita | null) {
  if (!c) return '<span class="muted f">sin cita</span>';
  return `<a class="cita" href="/api/suelo/pdf?obraId=${encodeURIComponent(obraId)}#page=${c.pagina}" target="_blank" rel="noopener" title="${esc(c.textoLiteral)}">ver cita (pág. ${c.pagina})</a>${c.verificada ? '' : `<span class="noverif" title="${esc(c.motivo ?? '')}">⚠ cita no verificada${c.motivo ? ': ' + esc(c.motivo) : ''}</span>`}`;
}

/** Filas [clave, índice?, campo] de un estudio, en orden de lectura. */
function filas(es: EstudioSuelo): [string, number | undefined, Campo][] {
  const out: [string, number | undefined, Campo][] = [];
  for (const k of Object.keys(ETIQUETA)) {
    const v = (es as any)[k];
    if (Array.isArray(v)) v.forEach((c, i) => out.push([k, i, c])); else out.push([k, undefined, v]);
  }
  return out;
}

let accion: Accion = () => {};
let suelo: EstadoSuelo | undefined;
let S_actual = 0;

export function pintarSuelo(s: EstadoSuelo | undefined, S: number, fn: Accion) {
  accion = fn; suelo = s; S_actual = S;
  const r = s?.resultado;
  const obras = [...(r?.obrasCercanas ?? [])].sort((a, b) => a.distancia_m - b.distancia_m);
  const elegida = s?.estudio?.obraId ?? r?.estudioElegido?.obraId;
  $('#obras').innerHTML = !s?.lote ? '<li class="vacio">Aún no hay lote. Haz clic en el mapa o sube un EMS propio.</li>'
    : !obras.length ? '<li class="vacio">No se encontraron obras públicas cerca del lote.</li>'
    : obras.map(o => `<li class="${o.obra.id === elegida ? 'elegida' : ''}" data-id="${esc(o.obra.id)}">
      <div class="oh"><b>${(o.distancia_m / 1000).toFixed(2)} km</b><span class="ems ${o.tieneEMS ? 'si' : 'no'}">${o.tieneEMS ? 'con EMS' : 'sin EMS'}</span>${o.obra.ubicacion ? '' : '<em class="muted">sin ubicación en el mapa</em>'}</div>
      <p>${esc(o.obra.descripcion)}</p><small>${esc(o.obra.entidad)} · ${esc(o.obra.nomenclatura)} · ${o.obra.anio} · <a href="${esc(o.obra.urlFicha)}" target="_blank" rel="noopener">ficha SEACE</a></small>
      <div class="row"><span></span>${o.obra.id === elegida ? '<em class="ok">elegida</em>' : `<button class="mini" data-elegir ${o.tieneEMS ? '' : 'disabled title="Esta obra no tiene EMS publicado"'}>Elegir</button>`}</div></li>`).join('');
  pintarFicha(s);
  pintarMapa();
}

function pintarFicha(s: EstadoSuelo | undefined) {
  const es = s?.estudio ?? s?.resultado?.estudioElegido ?? null, r = s?.resultado;
  const aviso = `<p class="aviso-suelo">${esc(AVISO_SUELO)}</p>`;
  if (!es) { $('#ficha').innerHTML = `<h2>Estudio de mecánica de suelos</h2>${aviso}<p class="vacio">Elige una obra con EMS de la lista (o sube uno) para ver sus datos con cita y aprobarlos campo por campo.</p>`; return; }
  const obra = r?.obrasCercanas.find(o => o.obra.id === es.obraId)?.obra;
  const ok = r?.S_motor != null;
  $('#ficha').innerHTML = `<h2>Estudio de mecánica de suelos</h2>${aviso}
    <h3>${esc(obra?.descripcion ?? es.obraId)}</h3>
    <p class="muted">${r?.distancia_m != null ? `A ${Math.round(r.distancia_m)} m del lote · ` : ''}${s?.documento ? `${s.documento.paginas} páginas · ` : ''}extraído en modo ${esc(s?.modo ?? '—')}</p>
    <div class="sbox ${ok ? '' : 'pend'}"><div><span class="muted">S calculado por el motor (E.030)</span><b>${ok ? r!.S_motor : '—'}</b><small>${esc(r?.S_fuente || 'Aprueba el perfil de suelo para que el motor calcule S.')}</small></div>
      <button id="usarS" ${ok ? '' : 'disabled'}>${ok && r!.S_motor === S_actual ? '✓ S en uso' : 'Usar S en los parámetros'}</button></div>
    ${(r?.advertencias ?? []).map(a => `<p class="adv">⚠ ${esc(a)}</p>`).join('')}
    <table class="campos"><thead><tr><th>Dato</th><th>Valor y cita</th><th>Estado</th></tr></thead><tbody>${filas(es).map(([k, i, c]) => `
      <tr class="${c.estado}" data-campo="${k}" ${i === undefined ? '' : `data-indice="${i}"`}>
        <td>${ETIQUETA[k]}${i === undefined ? '' : ` ${i + 1}`}</td>
        <td>${valorTxt(k, c.valor)}${k === 'calicatas' && c.valor ? `<div class="estratos">${(c.valor as Calicata).estratos.map(e => `<i style="background:${colorSucs(e.SUCS)};flex:${Math.max(0.1, e.hasta_m - e.desde_m)}" title="${esc(`${e.SUCS}: ${e.descripcion}`)}">${esc(e.SUCS)}</i>`).join('')}</div>` : ''}<div>${citaBtn(es.obraId, c.cita)}</div></td>
        <td><span class="est ${c.estado}">${ESTADO[c.estado] ?? c.estado}</span><small class="muted">${esc(c.por)}</small>
          <div class="acc"><button class="mini" data-a="aprobar" title="Aprobar">✓</button><button class="mini sec" data-a="corregir" title="Corregir">✎</button><button class="mini sec" data-a="rechazar" title="Rechazar">✕</button></div></td>
      </tr>`).join('')}</tbody></table>`;
}

$('#ficha').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.id === 'usarS') return accion('suelo/usarS', {}, 'Pasando S a los parámetros…');
  const tr = b.closest<HTMLElement>('tr'), a = b.dataset.a;
  if (!tr || !a) return;
  const body: any = { campo: tr.dataset.campo, accion: a };
  if (tr.dataset.indice) body.indice = +tr.dataset.indice;
  if (a === 'corregir') {
    const es: any = suelo?.estudio ?? suelo?.resultado?.estudioElegido;
    const actual = body.indice === undefined ? es?.[body.campo]?.valor : es?.[body.campo]?.[body.indice]?.valor;
    const objeto = actual !== null && typeof actual === 'object';
    const v = prompt(`Valor corregido para "${ETIQUETA[body.campo]}"${objeto ? ' (JSON)' : ''}:`, objeto ? JSON.stringify(actual) : String(actual ?? ''));
    if (v === null) return;
    try { body.valor = objeto ? JSON.parse(v) : /_m$|_ppm$|_kgcm2$|^S_/.test(body.campo) ? +v : v; }
    catch { return alert('JSON no válido: no se envió la corrección.'); }
    if (Number.isNaN(body.valor)) return alert('Se esperaba un número: no se envió la corrección.');
  }
  accion('suelo/campo', body, 'Registrando decisión…');
});
$('#obras').addEventListener('click', e => {
  const t = e.target as HTMLElement, li = t.closest<HTMLElement>('li[data-id]');
  if (li && t.matches('[data-elegir]')) accion('suelo/elegir', { obraId: li.dataset.id }, 'Descargando y extrayendo el EMS…');
});
$('#btnCercanos').onclick = () => accion('suelo/cercanos', undefined, 'Buscando obras cercanas…', 'GET');
$('#formSubir').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  if (!f.archivoLocal && !f.url) return alert('Indica la ruta local o la URL del PDF.');
  accion('suelo/subir', { ...f, lat: +f.lat, lon: +f.lon }, 'Subiendo y extrayendo el EMS…');
});

// ---------- Mapa ----------
let mapa: L.Map | null = null;
const capa = L.layerGroup();
const AREQUIPA: L.LatLngTuple = [-16.3989, -71.5369];

export function mostrarMapa() {
  if (!mapa) {
    mapa = L.map('mapa', { zoomControl: true }).setView(AREQUIPA, 15);
    const aviso = () => { const p = $('#mapaAviso'); p.hidden = false; p.textContent = 'Sin conexión: no se pudieron cargar las teselas de OpenStreetMap. La lista de obras sigue funcionando.'; };
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>' })
      .on('tileerror', aviso).on('tileload', () => ($('#mapaAviso').hidden = true)).addTo(mapa);
    if (!navigator.onLine) aviso();
    capa.addTo(mapa);
    mapa.on('click', e => accion('suelo/lote', { lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) }, 'Buscando obras cercanas al lote…'));
    pintarMapa(true);
  }
  setTimeout(() => mapa!.invalidateSize(), 0);
}

function pintarMapa(centrar = false) {
  if (!mapa) return;
  capa.clearLayers();
  const lote = suelo?.lote, elegida = suelo?.estudio?.obraId ?? suelo?.resultado?.estudioElegido?.obraId;
  if (!lote) return;
  const c: L.LatLngTuple = [lote.lat, lote.lon];
  L.circle(c, { radius: 1000, color: '#38bdf8', weight: 1, dashArray: '4 4', fillOpacity: 0.03 }).bindTooltip('1 km').addTo(capa);
  L.circle(c, { radius: 300, color: '#38bdf8', weight: 1.5, fillOpacity: 0.07 }).bindTooltip('300 m').addTo(capa);
  for (const o of suelo?.resultado?.obrasCercanas ?? []) {
    const u = o.obra.ubicacion;
    if (!u) continue;
    L.circleMarker([u.lat, u.lon], { radius: o.obra.id === elegida ? 9 : 7, color: '#0a1020', weight: 2, fillColor: o.obra.id === elegida ? '#38bdf8' : o.tieneEMS ? '#22c55e' : '#94a3b8', fillOpacity: 1 })
      .bindTooltip(`${esc(o.obra.descripcion)}<br>${Math.round(o.distancia_m)} m · ${o.tieneEMS ? 'con EMS' : 'sin EMS'}`).addTo(capa);
  }
  L.circleMarker(c, { radius: 8, color: '#fff', weight: 3, fillColor: '#f59e0b', fillOpacity: 1 }).bindTooltip('Lote', { permanent: true, direction: 'top', offset: [0, -8] }).addTo(capa);
  if (centrar) mapa.setView(c, 15);
}

/** Tarjeta "Cimentación y cemento": solo textos del EMS con su cita (nunca generados). */
export function recomendacionesSuelo(s: EstadoSuelo | undefined) {
  const es = s?.estudio ?? s?.resultado?.estudioElegido;
  if (!es) return '<p class="muted">Sin estudio de suelos elegido: ve a la pestaña Suelo.</p>';
  const items: [string, Campo][] = [
    ['tipoCimentacionRecomendada', es.tipoCimentacionRecomendada], ['Df_m', es.Df_m], ['capacidadPortante_kgcm2', es.capacidadPortante_kgcm2],
    ['cementoRecomendado', es.cementoRecomendado], ...es.recomendacionesEMS.map(c => ['recomendacionesEMS', c] as [string, Campo]),
  ].filter(([, c]) => (c as Campo).valor !== null && (c as Campo).estado !== 'rechazado') as [string, Campo][];
  if (!items.length) return '<p class="muted">El EMS elegido no trae recomendaciones de cimentación ni de cemento.</p>';
  return `<ul class="rec-ems">${items.map(([k, c]) => `<li><small class="muted">${ETIQUETA[k]} · <span class="est ${c.estado}">${ESTADO[c.estado]}</span></small><p>${esc(c.valor)}</p>${citaBtn(es.obraId, c.cita)}</li>`).join('')}</ul><p class="muted f">Textos literales del EMS de una obra cercana; ${esc(AVISO_SUELO)}</p>`;
}
