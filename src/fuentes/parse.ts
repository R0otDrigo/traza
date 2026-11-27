// Parseo del HTML del buscador público del SEACE (JSF/PrimeFaces). Funciones puras, con tests sobre HTML guardado.

export const texto = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

export interface FilaResultado { entidad: string; fecha: string; nomenclatura: string; objeto: string; descripcion: string; fila: number }

/** Filas de la tabla de procedimientos (dtProcesos). */
export function parsearResultados(html: string): FilaResultado[] {
  const i = html.indexOf('dtProcesos_data');
  if (i < 0) return [];
  const cuerpo = html.slice(i, html.indexOf('</tbody>', i));
  return [...cuerpo.matchAll(/<tr data-ri="(\d+)"[\s\S]*?<\/tr>/g)].map(m => {
    const c = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => texto(x[1]));
    return { fila: +m[1], entidad: c[1], fecha: c[2], nomenclatura: c[3], objeto: c[5], descripcion: c[6] };
  }).filter(f => f.nomenclatura);
}

export interface Enlace { uuid: string; nombre: string; seccion: string; fila: string; kb: number | null }

/** Todos los archivos descargables (descargaDocGeneral) con la sección (legend o cabecera de tabla) y el texto de su fila. */
export function parsearEnlaces(html: string): Enlace[] {
  const secciones = [...html.matchAll(/<legend[^>]*>([\s\S]*?)<\/legend>|ui-datatable-header[^>]*>([\s\S]*?)<\/div>/g)].map(m => ({ i: m.index!, t: texto(m[1] ?? m[2]) }));
  const out: Enlace[] = [];
  for (const m of html.matchAll(/descargaDocGeneral\('([0-9a-f-]{36})','\d+','([^']*)'\)[\s\S]*?<\/a>([^<]*)/g)) {
    const i = m.index!;
    const ini = html.lastIndexOf('<tr', i), fin = html.indexOf('</tr>', i);
    const fila = texto(html.slice(ini, fin));
    const enlace = texto(m[0].slice(m[0].indexOf('>', m[0].indexOf(')')) + 1));
    const kb = /\(?\s*([\d.,]+)\s*KB\)?/i.exec(enlace + ' ' + m[3]) ?? /([\d.]+)\s*$/.exec(fila);
    out.push({
      uuid: m[1],
      nombre: m[2] || enlace.replace(/\(\s*[\d.,]+\s*KB\s*\)/i, '').trim(),
      seccion: secciones.filter(s => s.i < i).at(-1)?.t ?? '',
      fila, kb: kb ? parseFloat(kb[1].replace(/,/g, '')) : null,
    });
  }
  return out;
}

export interface Ficha { entidad: string; nomenclatura: string; objeto: string; descripcion: string; fecha: string | null; tieneExpediente: boolean }

const campo = (t: string, etiqueta: string, hasta: string[]) => {
  const i = t.indexOf(etiqueta);
  if (i < 0) return '';
  const r = t.slice(i + etiqueta.length);
  const f = Math.min(...hasta.map(h => r.indexOf(h)).filter(x => x >= 0), r.length);
  return r.slice(0, f).trim();
};

/** Cabecera de la ficha de selección o de la página del expediente técnico. */
export function parsearFicha(html: string): Ficha {
  const t = texto(html);
  // la ficha trunca la descripción ("…") y trae la completa en un diálogo oculto
  const dlg = /ui-dialog-content[^>]*>([^<]{20,})</.exec(html.slice(Math.max(0, html.indexOf('Descripción del Objeto:'))))?.[1];
  const desc = dlg ? texto(dlg) : undefined;
  return {
    entidad: campo(t, 'Entidad Convocante:', ['Direccion Legal']) || campo(t, 'Entidad convocante', ['Nomenclatura']),
    nomenclatura: campo(t, 'Nomenclatura:', ['N° Convocatoria']) || campo(t, 'Nomenclatura', ['Nro. de convocatoria']),
    objeto: campo(t, 'Objeto de Contratación:', ['Descripción']) || campo(t, 'Objeto de contratación', ['Descripción']),
    descripcion: desc ?? (campo(t, 'Descripción del objeto', ['N° del Item']) || campo(t, 'Descripción del Objeto:', ['VR / VE'])),
    fecha: /Fecha y Hora Publicación:\s*(\d{2}\/\d{2}\/\d{4})/.exec(t)?.[1] ?? null,
    tieneExpediente: t.includes('Ver Expediente Técnico de Obra'),
  };
}

/** "…DISTRITO DE JACOBO HUNTER Y DISTRITO DE…" → "JACOBO HUNTER". */
export const distrito = (descripcion: string) =>
  /DISTRITO\s+(?:DE\s+)?([A-ZÁÉÍÓÚÑ ]+?)(?:\s*[,\-–;.]|\s+(?:Y|DE LA|PROVINCIA|DEL)\b|$)/i.exec(descripcion)?.[1].trim().toUpperCase() ?? null;

/** Clasifica un archivo por su sección y nombre. */
export function tipoArchivo(e: Pick<Enlace, 'seccion' | 'nombre' | 'fila'>): 'expediente' | 'bases' | 'anexo' | 'otro' {
  const s = (e.seccion + ' ' + e.fila + ' ' + e.nombre).toLowerCase();
  if (/bases/.test(s)) return 'bases';
  if (/anexo/.test(s)) return 'anexo';
  if (/expediente|estudio|memoria|especificaciones|planos|metrados|presupuesto|precios|calendario|f[oó]rmulas|riesgos|gastos|terreno|homologaci|equipamiento|[ií]ndice/.test(s)) return 'expediente';
  return 'otro';
}
