// STUB fase 3: lo reemplaza la fase 1
import type { ObraPublica, DocumentoEMS, Ubicacion } from '../contracts/index.ts';

const obras = new Map<string, ObraPublica>(), docs: DocumentoEMS[] = [];
export const listarObras = (): { obra: ObraPublica; tieneEMS: boolean }[] => [...obras.values()].map(obra => ({ obra, tieneEMS: docs.some(d => d.obraId === obra.id) }));
export const documentosEMS = (obraId: string): DocumentoEMS[] => docs.filter(d => d.obraId === obraId);
export const guardarObra = (o: ObraPublica): void => { obras.set(o.id, o); };
export const guardarDocumento = (d: DocumentoEMS): void => { docs.push(d); };
export const actualizarUbicacion = (obraId: string, u: Ubicacion): void => { const o = obras.get(obraId); if (o) o.ubicacion = u; };
