// Automatización del Buscador Público del SEACE con Playwright (Edge visible). Ver docs/FUENTES.md.
// Reglas: pausas de 2–3 s entre pedidos, sincronización por respuestas AJAX, y si aparece un captcha se espera a una persona.
import type { Browser, Page } from 'playwright';
import { parsearResultados, parsearEnlaces, parsearFicha, distrito, tipoArchivo, type FilaResultado } from './parse.ts';
import { idObra, guardarObra, listarArchivo, marcarObra, obra as leerObra } from './indice.ts';
import { pausa } from './descargas.ts';
import type { ObraPublica } from '../contracts/index.ts';

export const BUSCADOR = 'https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml';
const id = (sufijo: string) => `[id="tbBuscador:idFormBuscarProceso:${sufijo}"]`;

export async function navegador(): Promise<{ b: Browser; p: Page }> {
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ channel: 'msedge', headless: false });
  const p = await b.newPage({ acceptDownloads: true });
  p.setDefaultTimeout(60000);
  return { b, p };
}

/** Espera la respuesta AJAX de PrimeFaces cuyo javax.faces.source contiene `fuente`. */
const ajax = (p: Page, fuente: string, timeout = 60000) => p.waitForResponse(r => r.request().method() === 'POST' &&
  (new URLSearchParams(r.request().postData() ?? '').get('javax.faces.source') ?? '').includes(fuente), { timeout });

/** Si hay un captcha o código de verificación visible, avisa y espera (sin límite) a que una persona lo resuelva. */
export async function esperarCaptcha(p: Page): Promise<void> {
  const hay = () => p.evaluate(() => {
    // desafío de reCAPTCHA visible (su iframe "bframe" existe siempre, oculto) o un código de verificación
    const reto = [...document.querySelectorAll('iframe')].some(f => {
      const r = f.getBoundingClientRect();
      return /bframe|hcaptcha/i.test(f.src) && r.height > 100 && r.top > -1000 && getComputedStyle(f.closest('div[style]') ?? f).visibility !== 'hidden';
    });
    return reto || /c[oó]digo de verificaci[oó]n/i.test(document.body.innerText);
  }).catch(() => false);
  if (!(await hay())) return;
  console.log('\n⚠ Captcha o código de verificación en el SEACE: resuélvelo en la ventana del navegador; el script continúa solo.');
  while (await hay()) await p.waitForTimeout(1000); // sondeo del estado de la ventana (no sincroniza AJAX)
}

/** Marca el elemento `sel`, ejecuta `accion`, espera la respuesta AJAX de `fuente` y luego a que PrimeFaces
 *  reemplace el elemento marcado (la respuesta llega antes de que se actualice el DOM). */
async function tras(p: Page, sel: string, fuente: string, accion: () => Promise<unknown>, timeout = 60000) {
  await p.locator(sel).first().evaluate(e => e.setAttribute('data-nx', '1')).catch(() => {});
  const r = ajax(p, fuente, timeout).then(() => true);
  await accion();
  // mientras no llega la respuesta se vigila si apareció un desafío (sondeo de la ventana, no sincronización)
  while (!(await Promise.race([r, p.waitForTimeout(5000).then(() => false)]))) await esperarCaptcha(p);
  await p.locator(`${sel}:not([data-nx])`).first().waitFor({ state: 'attached' });
}
const filaProcesos = '[id="tbBuscador:idFormBuscarProceso:dtProcesos_data"] > tr';
const filaDocs = '[id="tbFicha:dtDocumentos_data"] > tr';

async function abrirBuscador(p: Page) {
  await p.goto(BUSCADOR, { waitUntil: 'networkidle' });
  await p.getByText('Buscador de Procedimientos de Selección', { exact: true }).click();
  await p.locator(id('nombreEntidad')).waitFor();
}

async function elegirEntidad(p: Page, entidad: string) {
  await p.locator(id('nombreEntidad')).locator('xpath=following::img[contains(@src,"btnLupa")][1]').click();
  const dlg = p.locator(id('frmBuscarEntidad'));
  await dlg.waitFor();
  // el diálogo carga su lista inicial por AJAX y puede pisar lo escrito: se reintenta hasta ver la entidad
  for (let i = 0; i < 4; i++) {
    await pausa();
    await p.locator(id('txtNombreEntidad')).fill(entidad);
    await tras(p, '[id="tbBuscador:idFormBuscarProceso:dataTable_data"] > tr', 'btnBuscarEntidad', () => p.locator(id('btnBuscarEntidad')).click());
    if (await dlg.getByText(entidad, { exact: true }).count()) break;
  }
  await tras(p, id('nombreEntidad'), 'ajaxEntidad', () => dlg.getByText(entidad, { exact: true }).first().click());
  const elegida = await p.locator(id('nombreEntidad')).inputValue();
  if (elegida.trim() !== entidad) throw new Error(`El SEACE no tiene la entidad "${entidad}" (se obtuvo "${elegida}")`);
}

async function elegir(p: Page, etiqueta: string, valor: string) {
  const menu = p.locator(`xpath=//form[@id="tbBuscador:idFormBuscarProceso"]//td[starts-with(normalize-space(), "${etiqueta}")]/following::div[contains(@class,"ui-selectonemenu")][1]`).first();
  const mid = await menu.getAttribute('id');
  await menu.click();
  await p.locator(`[id="${mid}_panel"] li`).filter({ hasText: new RegExp(`^${valor}$`) }).click();
}

/** Ejecuta la búsqueda (entidad + Obra + año) y devuelve todas las filas (todas las páginas). */
export async function buscar(p: Page, entidad: string, anio: number): Promise<FilaResultado[]> {
  await abrirBuscador(p);
  await elegirEntidad(p, entidad);
  await elegir(p, 'Objeto de Contratación', 'Obra');
  await elegir(p, 'Año de la Convocatoria', String(anio));
  await pausa();
  await esperarCaptcha(p);
  // el botón visible pide un token reCAPTCHA (invisible) y luego dispara el botón oculto btnBuscarSel
  await tras(p, filaProcesos, 'idFormBuscarProceso:btnBuscarSel', () => p.locator(id('btnBuscarSelToken')).click(), 0);
  const filas: FilaResultado[] = [];
  for (;;) {
    filas.push(...parsearResultados(await p.content()));
    const sig = p.locator(`${id('dtProcesos')} .ui-paginator-next`).first();
    if (!(await sig.count()) || (await sig.getAttribute('class'))!.includes('ui-state-disabled')) break;
    await pausa();
    await tras(p, filaProcesos, 'dtProcesos', () => sig.click());
  }
  return filas;
}

export function aObra(f: FilaResultado, anio: number, urlFicha = BUSCADOR): ObraPublica {
  return { id: idObra(f.entidad, f.nomenclatura), entidad: f.entidad, nomenclatura: f.nomenclatura, anio, objeto: f.objeto,
    descripcion: f.descripcion, urlFicha, distrito: distrito(f.descripcion), ubicacion: null };
}

/** Registra los archivos de una página (ficha o expediente) en el índice. */
export function registrarArchivos(obraId: string, html: string): number {
  const docs = parsearEnlaces(html);
  for (const d of docs) listarArchivo({ obraId, uuid: d.uuid, nombre: d.nombre, seccion: `${d.seccion} | ${d.fila}`.slice(0, 250), tipo: tipoArchivo(d), kb: d.kb });
  return docs.length;
}

/** Desde la tabla de resultados ya cargada: abre la ficha de `fila`, lista sus documentos y los del expediente técnico. */
export async function procesarFicha(p: Page, f: FilaResultado, anio: number): Promise<ObraPublica> {
  const icono = p.locator(`[id$="dtProcesos:${f.fila}:grafichaSel"]`);
  // buscar() deja la tabla en su última página: se vuelve a la primera y se avanza hasta la fila
  const pag = (c: string) => p.locator(`${id('dtProcesos')} .ui-paginator-${c}`).first();
  if (!(await icono.count()) && !(await pag('first').getAttribute('class'))?.includes('ui-state-disabled')) {
    await pausa(); await tras(p, filaProcesos, 'dtProcesos', () => pag('first').click());
  }
  while (!(await icono.count())) { await pausa(); await tras(p, filaProcesos, 'dtProcesos', () => pag('next').click()); }
  await pausa();
  await Promise.all([p.waitForURL(/fichaSeleccion\.xhtml/), icono.click()]);
  await p.waitForLoadState('networkidle');
  await esperarCaptcha(p);
  const o = { ...aObra(f, anio, p.url()) };
  guardarObra(o);
  // documentos de la ficha: 15 por página y se recorren las páginas
  const rpp = p.locator('[id="tbFicha:dtDocumentos"] select.ui-paginator-rpp-options').first();
  if (await rpp.count()) { await pausa(); await tras(p, filaDocs, 'dtDocumentos', () => rpp.selectOption('15')); }
  let n = 0;
  for (;;) {
    n += registrarArchivos(o.id, await p.content());
    const sig = p.locator('[id="tbFicha:dtDocumentos"] .ui-paginator-next').first();
    if (!(await sig.count()) || (await sig.getAttribute('class'))!.includes('ui-state-disabled')) break;
    await pausa();
    await tras(p, filaDocs, 'dtDocumentos', () => sig.click());
  }
  const exp = p.getByText('Ver Expediente Técnico de Obra', { exact: true });
  if (await exp.count()) {
    await pausa();
    await Promise.all([p.waitForURL(/fichaArchivoExpedienteTecnicoObra/), exp.click()]);
    await p.waitForLoadState('networkidle');
    n += registrarArchivos(o.id, await p.content());
  }
  marcarObra(o.id, 'ficha', `${n} archivos listados`);
  return o;
}

/** Busca obras de una entidad en un año y procesa hasta `max` fichas nuevas (reanudable: salta las ya procesadas). */
export async function buscarYProcesar(p: Page, entidad: string, anio: number, max = Infinity): Promise<{ filas: number; procesadas: number }> {
  const filas = await buscar(p, entidad, anio);
  for (const f of filas) { const o = aObra(f, anio); if (!leerObra(o.id)) guardarObra(o); }
  let procesadas = 0;
  for (const f of filas) {
    if (procesadas >= max) break;
    if (leerObra(aObra(f, anio).id)?.estado !== 'listada') continue;
    // volver a la tabla: se repite la búsqueda (el enlace de la ficha depende de la sesión)
    if (procesadas > 0) await buscar(p, entidad, anio);
    const o = await procesarFicha(p, f, anio);
    console.log(`  ✓ ${o.nomenclatura}  ${o.distrito ?? ''}`);
    procesadas++;
  }
  return { filas: filas.length, procesadas };
}
