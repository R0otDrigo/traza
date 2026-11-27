// Rutas de la API del módulo suelo (ver src/api/index.ts). Solo esta fase edita este archivo.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Def } from './index.ts';
import { leer, guardar, registrar, type Estado } from '../pipeline.ts';
import { DocumentoEMS, ObraPublica } from '../contracts/index.ts';
import { listarObras, documentosEMS, guardarObra, guardarDocumento, actualizarUbicacion } from '../fuentes/indice.ts';
import { leerPdf } from '../suelo/pdf.ts';
import { extraerEstudio } from '../ai/suelo.ts';
import { ubicarObra } from '../suelo/ubicacion.ts';
import { decidirCampo, resultadoSuelo, conS } from '../suelo/flujo.ts';
import { zonaDeZ } from '../suelo/factorS.ts';

function recalcular(e: Estado) {
  e.suelo!.resultado = resultadoSuelo(e.suelo!, listarObras(), zonaDeZ(e.parametros.Z));
  return guardar(e);
}

const mejorEMS = (obraId: string) => documentosEMS(obraId).sort((a, b) => b.puntajeEMS - a.puntajeEMS)[0];

async function extraer(e: Estado, doc: DocumentoEMS, paginas?: string[]) {
  paginas ??= (await leerPdf(doc.archivoLocal)).paginas;
  const { estudio, modo } = await extraerEstudio(doc.obraId, paginas);
  const obra = listarObras().find(o => o.obra.id === doc.obraId)?.obra;
  if (obra && !obra.ubicacion) { const u = await ubicarObra(estudio, obra.distrito ?? undefined); if (u) actualizarUbicacion(obra.id, u); }
  e.suelo = { ...e.suelo!, documento: doc, estudio, modo };
  registrar(e, modo === 'IA' ? 'IA' : 'motor', 'Extrajo estudio de suelos', `${doc.obraId}: ${paginas.length} páginas (${modo}); datos propuestos, pendientes de aprobación del ingeniero`);
  return recalcular(e);
}

export const rutas: Record<string, Def> = {
  'POST suelo/lote': { fn: ({ lat, lon }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lat y lon numéricos requeridos.');
    const e = leer();
    e.suelo!.lote = { lat, lon };
    registrar(e, 'ingeniero', 'Ubicó el lote', `lat ${lat}, lon ${lon}`);
    return recalcular(e);
  } },

  'GET suelo/cercanos': { fn: () => recalcular(leer()).suelo!.resultado?.obrasCercanas ?? [] },

  'POST suelo/elegir': { fn: ({ obraId }) => {
    const doc = mejorEMS(obraId);
    if (!doc) throw new Error(`La obra ${obraId} no tiene EMS descargado.`);
    const e = leer();
    registrar(e, 'ingeniero', 'Eligió estudio de suelos', obraId);
    return extraer(e, doc);
  } },

  'POST suelo/subir': { fn: async ({ archivoLocal, url, lat, lon, entidad, descripcion }) => {
    const sha256 = createHash('sha256').update(readFileSync(archivoLocal)).digest('hex');
    const pdf = await leerPdf(archivoLocal);
    const obra = ObraPublica.parse({
      id: `manual-${sha256.slice(0, 12)}`, entidad: entidad || 'manual', nomenclatura: 'manual', anio: new Date().getFullYear(), objeto: 'Obra',
      descripcion: descripcion || archivoLocal, urlFicha: url || pathToFileURL(archivoLocal).href, distrito: null,
      ubicacion: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, origen: 'manual', precision_m: 0 } : null,
    });
    const doc = DocumentoEMS.parse({ obraId: obra.id, url: obra.urlFicha, archivoLocal, sha256, paginas: pdf.paginas.length, paginasEscaneadas: pdf.escaneadas, puntajeEMS: 0 });
    guardarObra(obra); guardarDocumento(doc);
    const e = leer();
    registrar(e, 'ingeniero', 'Subió EMS (modo manual)', `${archivoLocal} (${obra.id})`);
    return extraer(e, doc, pdf.paginas);
  } },

  'POST suelo/campo': { fn: ({ campo, indice, accion, valor }) => {
    const e = leer();
    if (!e.suelo!.estudio) throw new Error('No hay estudio de suelos elegido.');
    e.suelo!.estudio = decidirCampo(e.suelo!.estudio, campo, accion, valor, indice);
    registrar(e, 'ingeniero', `Suelo: ${accion} campo`, `${campo}${indice !== undefined ? `[${indice}]` : ''}${accion === 'corregir' ? ` → ${JSON.stringify(valor)}` : ''}`);
    return recalcular(e);
  } },

  'POST suelo/usarS': { fn: () => {
    const e = recalcular(leer());
    e.parametros = conS(e.parametros, e.suelo!.resultado);
    registrar(e, 'ingeniero', 'Prellenó S con el suelo de referencia', `S=${e.parametros.S} (${e.parametros.S_fuente}); falta aprobar Z, U, S`);
    return guardar(e);
  } },

  'GET suelo/pdf': { fn: (_b, { query, res }) => {
    const obraId = query.get('obraId') ?? '';
    const doc = mejorEMS(obraId) ?? (leer().suelo?.documento?.obraId === obraId ? leer().suelo!.documento : null);
    if (!doc) throw new Error(`Sin PDF para la obra ${obraId}.`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.end(readFileSync(doc.archivoLocal));
  } },
};
