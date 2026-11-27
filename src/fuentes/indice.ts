// Índice local (SQLite, node:sqlite) de obras públicas, documentos del SEACE y candidatos a EMS. Reanudable.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { ObraPublica, DocumentoEMS, Ubicacion } from '../contracts/index.ts';

export const DIR_FUENTES = process.env.NEXOBIM_FUENTES ?? fileURLToPath(new URL('../../data/fuentes/', import.meta.url));

let db: DatabaseSync | null = null;

/** Abre (o cambia) la base. Los tests pasan una ruta temporal. */
export function abrir(ruta = DIR_FUENTES + 'indice.db'): DatabaseSync {
  db?.close();
  mkdirSync(dirname(ruta), { recursive: true });
  db = new DatabaseSync(ruta);
  db.exec(`
    CREATE TABLE IF NOT EXISTS obras (id TEXT PRIMARY KEY, json TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'listada', nota TEXT);
    CREATE TABLE IF NOT EXISTS archivos (
      obraId TEXT NOT NULL, uuid TEXT NOT NULL, nombre TEXT, seccion TEXT, tipo TEXT, kb REAL,
      estado TEXT NOT NULL DEFAULT 'pendiente', archivoLocal TEXT, sha256 TEXT, nota TEXT,
      PRIMARY KEY (obraId, uuid));
    CREATE TABLE IF NOT EXISTS ems (obraId TEXT NOT NULL, archivoLocal TEXT NOT NULL, json TEXT NOT NULL, puntaje REAL NOT NULL,
      PRIMARY KEY (obraId, archivoLocal));`);
  return db;
}
const base = () => db ?? abrir();

export const idObra = (entidad: string, nomenclatura: string) =>
  createHash('sha256').update(`${entidad.trim().toUpperCase()}|${nomenclatura.trim().toUpperCase()}`).digest('hex').slice(0, 16);

// ---------- API pública (la usan otras fases) ----------

export function guardarObra(o: ObraPublica): void {
  base().prepare(`INSERT INTO obras (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`).run(o.id, JSON.stringify(o));
}

export function guardarDocumento(d: DocumentoEMS): void {
  base().prepare(`INSERT OR REPLACE INTO ems (obraId, archivoLocal, json, puntaje) VALUES (?, ?, ?, ?)`).run(d.obraId, d.archivoLocal, JSON.stringify(d), d.puntajeEMS);
}

export function listarObras(): { obra: ObraPublica; tieneEMS: boolean }[] {
  return base().prepare(`SELECT o.json, EXISTS(SELECT 1 FROM ems e WHERE e.obraId = o.id AND e.puntaje >= ?) AS t FROM obras o`)
    .all(UMBRAL_EMS).map((r: any) => ({ obra: JSON.parse(r.json), tieneEMS: !!r.t }));
}

export function documentosEMS(obraId: string): DocumentoEMS[] {
  return base().prepare(`SELECT json FROM ems WHERE obraId = ? ORDER BY puntaje DESC`).all(obraId).map((r: any) => JSON.parse(r.json));
}

export function actualizarUbicacion(obraId: string, u: Ubicacion): void {
  const r = base().prepare(`SELECT json FROM obras WHERE id = ?`).get(obraId) as any;
  if (!r) throw new Error(`Obra ${obraId} no está en el índice`);
  guardarObra({ ...JSON.parse(r.json), ubicacion: u });
}

/** Puntaje mínimo para considerar que un documento es un EMS. */
export const UMBRAL_EMS = 10;

// ---------- Estado de procesamiento (interno del módulo) ----------

export interface Archivo { obraId: string; uuid: string; nombre: string; seccion: string; tipo: string; kb: number | null; estado: string; archivoLocal: string | null; sha256: string | null; nota: string | null }

export function marcarObra(id: string, estado: string, nota: string | null = null): void {
  base().prepare(`UPDATE obras SET estado = ?, nota = ? WHERE id = ?`).run(estado, nota, id);
}
export const obra = (id: string): (ObraPublica & { estado: string }) | null => {
  const r = base().prepare(`SELECT json, estado FROM obras WHERE id = ?`).get(id) as any;
  return r ? { ...JSON.parse(r.json), estado: r.estado } : null;
};
export const obrasEn = (estado: string): string[] => base().prepare(`SELECT id FROM obras WHERE estado = ?`).all(estado).map((r: any) => r.id);

/** Registra un archivo listado en la ficha; no pisa el estado de uno ya descargado. */
export function listarArchivo(a: Pick<Archivo, 'obraId' | 'uuid' | 'nombre' | 'seccion' | 'tipo' | 'kb'>): void {
  base().prepare(`INSERT INTO archivos (obraId, uuid, nombre, seccion, tipo, kb) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(obraId, uuid) DO UPDATE SET nombre = excluded.nombre, seccion = excluded.seccion, tipo = excluded.tipo, kb = excluded.kb`)
    .run(a.obraId, a.uuid, a.nombre, a.seccion, a.tipo, a.kb);
}
export function actualizarArchivo(obraId: string, uuid: string, c: Partial<Pick<Archivo, 'estado' | 'archivoLocal' | 'sha256' | 'nota'>>): void {
  const k = Object.keys(c) as (keyof typeof c)[];
  base().prepare(`UPDATE archivos SET ${k.map(x => `${x} = ?`).join(', ')} WHERE obraId = ? AND uuid = ?`).run(...k.map(x => c[x] ?? null), obraId, uuid);
}
export const archivos = (obraId?: string): Archivo[] =>
  (obraId ? base().prepare(`SELECT * FROM archivos WHERE obraId = ?`).all(obraId) : base().prepare(`SELECT * FROM archivos`).all()) as any;
