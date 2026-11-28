// Memoria preliminar E.070 trazable (HTML imprimible a PDF).
import type { Estado } from '../pipeline.ts';
import { verificar, CRITERIOS } from '../e070/engine.ts';
import { proyectoDe } from '../pipeline.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const valor = (v: unknown) => v == null ? '<i>no encontrado</i>' : esc(typeof v === 'object' ? JSON.stringify(v) : v);
const cita = (c: { pagina: number; textoLiteral: string; verificada: boolean; motivo?: string } | null) =>
  !c ? '—' : `pág. ${c.pagina}: «${esc(c.textoLiteral.slice(0, 160))}» ${c.verificada ? '✓ verificada' : `⚠ ${esc(c.motivo ?? 'no verificada')}`}`;

/** 2b. Suelo referencial: obra pública de origen, cada dato con su cita y estado, S y su cálculo. */
export function seccionSuelo(e: Estado): string {
  const s = e.suelo;
  if (!s?.estudio) return `<h2>2b. Suelo referencial</h2><p>No se usó un estudio de suelos referencial. S = ${e.parametros.S} (${esc((e.parametros as any).S_fuente ?? 'ingresado por el ingeniero')}).</p>`;
  const est = s.estudio, r = s.resultado;
  const obra = r?.obrasCercanas.find(o => o.obra.id === est.obraId);
  const filas = Object.entries(est as Record<string, any>).filter(([k]) => k !== 'obraId').flatMap(([k, v]): [string, any][] => (Array.isArray(v) ? v.map((c, i) => [`${k} ${i + 1}`, c]) : [[k, v]]))
    .map(([k, c]: any) => `<tr><td>${esc(k)}</td><td>${valor(c.valor)}</td><td>${esc(c.estado)} (${esc(c.por)})</td><td><small>${cita(c.cita)}</small></td></tr>`).join('');
  return `<h2>2b. Suelo referencial</h2>
  <div class="aviso">Dato referencial de una obra pública cercana. No reemplaza el Estudio de Mecánica de Suelos del terreno exigido por la E.050.</div>
  <table><tr><th>Obra</th><td>${esc(obra?.obra.descripcion ?? est.obraId)}</td></tr><tr><th>Entidad</th><td>${esc(obra?.obra.entidad ?? '—')} · ${esc(obra?.obra.nomenclatura ?? '')}</td></tr>
  <tr><th>Fuente</th><td>${obra ? `<a href="${esc(obra.obra.urlFicha)}">${esc(obra.obra.urlFicha)}</a>` : esc(s.documento?.url ?? '—')}</td></tr>
  <tr><th>Distancia al lote</th><td>${r?.distancia_m != null ? `${Math.round(r.distancia_m)} m` : '—'}</td></tr>
  <tr><th>Extracción</th><td>${esc(s.modo ?? '—')} · ${s.documento?.paginas ?? '?'} páginas</td></tr></table>
  <table><tr><th>Campo</th><th>Valor</th><th>Estado</th><th>Cita</th></tr>${filas}</table>
  <p><b>S del motor:</b> ${r?.S_motor ?? '— (perfil no aprobado)'} · fuente: ${esc(r?.S_fuente ?? '—')} · S usado en la verificación: <b>${e.parametros.S}</b></p>
  ${r?.advertencias.length ? `<ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`;
}

/** 5b. BIM: qué se leyó y escribió en el modelo, versiones e IFC. */
export function seccionBim(e: Estado): string {
  const v = e.versiones ?? [], ifc = e.ifc;
  const escrito = e.log.filter(l => l.quien === 'revit' || /parámetros|IFC|Aplicó opción/i.test(l.accion));
  return `<h2>5b. BIM: el modelo como fuente y destino</h2>
  <p><b>Leído del modelo:</b> ${e.modelo ? `${esc(e.modelo.documento)} · ${e.modelo.muros.length} muros (ejes, espesor, altura, tipo, vanos) · ${e.modelo.niveles.length} niveles con área de losas` : '—'}.</p>
  <p><b>Escrito en el modelo</b> (cada operación aprobada y reversible con Deshacer):</p>
  <ul>${escrito.slice(0, 20).map(l => `<li>${esc(new Date(l.t).toLocaleString('es-PE'))} · ${esc(l.accion)}: ${esc(l.detalle)}</li>`).join('') || '<li>Nada escrito todavía.</li>'}</ul>
  <p><b>IFC exportado:</b> ${ifc ? `${esc(ifc.ruta)} · ${ifc.muros} muros, ${ifc.conPset} con Pset NexoBIM · ${ifc.verificado ? 'verificado' : 'sin verificar'}` : 'no exportado'}.</p>
  ${v.length ? `<table><tr><th>Versión del modelo</th><th>Fecha</th><th>Cumplimiento</th><th>Nota</th></tr>${v.slice(0, 10).map(x => `<tr><td><code>${esc(x.huella.slice(0, 12))}</code></td><td>${esc(new Date(x.en).toLocaleString('es-PE'))}</td><td>${x.cumplimiento.map(c => `${esc(c.nivel)} ${c.dir}: ${c.cumple ? '✓' : '✗'}`).join(' · ')}</td><td>${esc(x.nota)}</td></tr>`).join('')}</table>` : ''}`;
}

export function memoriaHtml(e: Estado): string {
  if (!e.resultado || !e.modelo) return '<p>No hay una verificación oficial. Ejecuta “Verificar” primero.</p>';
  const r = verificar(proyectoDe(e)); // se recalcula: la memoria siempre coincide con el motor
  const p = r.parametros;
  const marca = new Map(e.modelo.muros.map(m => [m.id, m.marca || m.id]));
  const fecha = new Date().toLocaleString('es-PE');
  const filasMuros = e.modelo.muros.map(m => {
    const c = e.clasificacion[m.id], d = e.decisiones[m.id];
    const ts = r.tramos.filter(t => t.muroId === m.id);
    const lt = ts.filter(t => t.cuenta).reduce((s, t) => s + t.L * t.t, 0);
    return `<tr><td>${esc(m.nivel)}</td><td>${esc(marca.get(m.id))}<br><small>Id ${esc(m.id)}</small></td><td>${esc(m.tipoRevit)}</td><td>${m.t}</td>
      <td>${esc(c?.rol)} <small>(${esc(c?.fuente)} ${c ? Math.round(c.confianza * 100) + '%' : ''})</small></td><td><b>${esc(d)}</b></td>
      <td>${ts.map(t => `${t.L}${t.cuenta ? '' : '✗'}`).join(' · ')}</td><td>${lt.toFixed(3)}</td><td>${esc([...new Set(ts.flatMap(t => t.motivos))].join('; '))}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Memoria E.070 — ${esc(e.modelo.documento)}</title><style>
  body{font:12px/1.5 "Segoe UI",system-ui,sans-serif;color:#111;max-width:1000px;margin:24px auto;padding:0 20px}
  h1{font-size:20px;margin:0}h2{font-size:14px;border-bottom:2px solid #0e7490;color:#0e7490;margin-top:22px}
  table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #cbd5e1;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f1f5f9}
  .ok{color:#15803d;font-weight:700}.mal{color:#b91c1c;font-weight:700}.aviso{border:2px solid #b45309;background:#fffbeb;padding:8px;margin:10px 0}
  code{background:#f1f5f9;padding:2px 4px}small{color:#64748b}@media print{button{display:none}}</style></head><body>
  <button onclick="print()">Imprimir / PDF</button>
  <h1>Memoria preliminar — Verificación de densidad mínima de muros (RNE E.070)</h1>
  <p>Proyecto: <b>${esc(e.modelo.documento)}</b> · Archivo: ${esc(e.modelo.ruta || '(no guardado)')} · Generado por NexoBIM el ${esc(fecha)}</p>
  <div class="aviso"><b>Prototipo académico.</b> Este documento es un apoyo a la revisión. Ningún resultado es apto para ejecución sin la verificación y firma de un ingeniero civil colegiado. La IA solo clasificó muros y redactó explicaciones; todos los valores numéricos provienen del motor determinista.</div>

  <h2>1. Criterio y fórmula</h2>
  <p><code>${esc(r.formula)}</code> — ${esc(r.norma)}.</p>
  <ul><li>Solo cuentan tramos macizos de muros portantes con L ≥ ${CRITERIOS.Lmin} m (los vanos dividen el muro en tramos).</li>
  <li>Espesor efectivo t ≥ h/${CRITERIOS.divEspesor} (zonas sísmicas 2, 3 y 4).</li>
  <li>Un tramo de un piso superior cuenta solo si se apoya (≥ ${CRITERIOS.solapeMin * 100} % de su longitud, tolerancia ${CRITERIOS.tolColineal} m) en un muro portante del piso inferior (criterio conservador del equipo).</li>
  <li>Direcciones X/Y asignadas con tolerancia de ±${CRITERIOS.tolAngulo}°.</li></ul>

  <h2>2. Parámetros (aprobados por el ingeniero: ${e.parametros.aprobados ? 'sí' : 'NO'})</h2>
  <table><tr><th>Z</th><th>U</th><th>S</th><th>N</th><th>Z·U·S·N/56</th></tr><tr><td>${p.Z}</td><td>${p.U}</td><td>${p.S}</td><td>${p.N}</td><td><b>${p.requerido}</b></td></tr></table>

  ${seccionSuelo(e)}

  <h2>3. Resultados por nivel y dirección</h2>
  <table><tr><th>Nivel</th><th>Dir.</th><th>Σ L·t (m²)</th><th>Ap (m²)</th><th>Densidad</th><th>Requerido</th><th>Estado</th><th>Sustitución</th></tr>
  ${r.chequeos.map(c => `<tr><td>${esc(c.nivel)}</td><td>${c.dir}</td><td>${c.sumaLt}</td><td>${c.Ap}</td><td>${c.densidad}</td><td>${c.requerido}</td><td class="${c.cumple ? 'ok' : 'mal'}">${c.cumple ? 'Cumple' : `No cumple (faltan ${c.deficitLt} m²)`}</td><td><small>${esc(c.sustitucion)}</small></td></tr>`).join('')}</table>

  <h2>4. Muros: clasificación, decisión y aporte</h2>
  <table><tr><th>Nivel</th><th>Muro</th><th>Tipo Revit</th><th>t</th><th>Propuesta</th><th>Decisión ing.</th><th>Tramos L (m)</th><th>L·t que cuenta</th><th>Motivos de exclusión</th></tr>${filasMuros}</table>

  <h2>5. Opciones de mejora</h2>
  <p>${esc(e.explicacion?.resumen)} <small>(redacción: ${esc(e.explicacion?.fuente)})</small></p>
  <table><tr><th>Opción</th><th>Aporte (m²)</th><th>Detalle</th><th>Justificación</th><th>Aplicada</th></tr>
  ${r.opciones.map(o => { const x = e.explicacion?.recomendaciones.find(z => z.opcionId === o.id); return `<tr><td>${esc(o.nivel)} ${o.dir}</td><td>${o.deltaLt}</td><td>${esc(o.detalle)}</td><td>${esc(x?.justificacion ?? '')}</td><td>${e.aplicadas.includes(o.id) ? 'Sí' : ''}</td></tr>`; }).join('') || '<tr><td colspan="5">Sin opciones: el diseño cumple.</td></tr>'}</table>
  ${e.aplicadas.length ? `<p>Opciones ya aplicadas en el modelo: ${e.aplicadas.map(esc).join(', ')}</p>` : ''}

  ${seccionBim(e)}

  <h2>6. Advertencias y límites de uso</h2>
  <ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}
  <li>Solo verifica la densidad mínima (E.070 Art. 19.2.b). No reemplaza el análisis sísmico (E.030), la verificación de esfuerzo axial, el diseño de confinamientos ni de la cimentación.</li>
  <li>El área de planta Ap se toma de las losas del modelo en cada nivel.</li>
  <li>Muros de concreto: la norma pide usar t·Ec/Em; no implementado en esta versión.</li></ul>

  <h2>7. Registro de decisiones (trazabilidad)</h2>
  <table><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Detalle</th></tr>${[...e.log].reverse().map(l => `<tr><td>${esc(new Date(l.t).toLocaleString('es-PE'))}</td><td>${esc(l.quien)}</td><td>${esc(l.accion)}</td><td>${esc(l.detalle)}</td></tr>`).join('')}</table>
  <p style="margin-top:40px">______________________________<br>Ingeniero civil responsable · CIP N.° ________</p>
  </body></html>`;
}
