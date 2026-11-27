import { describe, it, expect, vi } from 'vitest';
import { transiciones, conservarRoles, urlNotificacion, cambiosModelo, revisar } from './vigilante.ts';
import { enCola, ocupado } from './revit/bridge.ts';
import { toastXml } from './notificar.ts';

const m = vi.hoisted(() => ({
  huella: vi.fn(async () => ({ huella: 'h1', muros: 1, vanos: 0 })),
  estado: { modelo: {}, resultado: {}, parametros: { aprobados: true }, vigilante: { activo: true, pintarAuto: false, huella: 'h1', eventos: [], notificaciones: [] } },
}));
vi.mock('./revit/bridge.ts', async o => ({ ...(await o<any>()), huella: m.huella }));
vi.mock('./pipeline.ts', async o => ({ ...(await o<any>()), leer: () => m.estado, guardar: (e: unknown) => e }));

describe('vigilante', () => {
  it('detecta cumple ↔ no cumple y arma la URL del panel', () => {
    const n = transiciones(
      [{ nivel: 'Nivel 1', dir: 'X', cumple: true }, { nivel: 'Nivel 1', dir: 'Y', cumple: false }, { nivel: 'Nivel 2', dir: 'X', cumple: true }],
      [{ nivel: 'Nivel 1', dir: 'X', cumple: false }, { nivel: 'Nivel 1', dir: 'Y', cumple: true }, { nivel: 'Nivel 2', dir: 'X', cumple: true }]);
    expect(n.map(x => [x.nivel, x.dir, x.tipo])).toEqual([['Nivel 1', 'X', 'deja_de_cumplir'], ['Nivel 1', 'Y', 'vuelve_a_cumplir']]);
    expect(n[0].url).toBe('http://localhost:5173/#nivel=Nivel%201&dir=X');
    expect(urlNotificacion('Nivel 2', 'Y')).toBe('http://localhost:5173/#nivel=Nivel%202&dir=Y');
  });

  it('conserva roles aprobados; muros nuevos quedan sin rol y los eliminados se descartan', () => {
    expect(conservarRoles({ a: 'portante', b: 'tabique', borrado: 'portante' }, [{ id: 'a' }, { id: 'b' }, { id: 'nuevo' }]))
      .toEqual({ a: 'portante', b: 'tabique' });
  });

  it('describe los cambios de forma legible', () => {
    const muro = { id: '1', nivel: 'Nivel 1', x1: 0, y1: 0, x2: 4, y2: 0, t: 0.13, h: 2.4, tipoRevit: 'KK soga 13', aberturas: [] } as any;
    const a = { documento: 'd', ruta: '', niveles: [], muros: [muro, { ...muro, id: '2' }] };
    const b = { ...a, muros: [{ ...muro, tipoRevit: 'KK cabeza 23', t: 0.23 }, { ...muro, id: '3' }] };
    expect(cambiosModelo(a, b)).toEqual(['muro 1: tipo KK soga 13 → KK cabeza 23', 'muro 3: nuevo (KK soga 13, Nivel 1), rol pendiente de aprobar', 'muro 2: eliminado']);
    expect(cambiosModelo(a, a)).toEqual([]);
  });

  it('no consulta Revit mientras la cola tiene operaciones en curso', async () => {
    let soltar!: () => void;
    const op = enCola(() => new Promise<void>(r => (soltar = r)));
    expect(ocupado()).toBe(true);
    expect(await revisar()).toBeNull();
    expect(m.huella).not.toHaveBeenCalled();
    soltar(); await op;
    expect(ocupado()).toBe(false);
    await revisar();
    expect(m.huella).toHaveBeenCalledOnce();
  });

  it('el toast abre la URL por protocolo y escapa el texto', () => {
    expect(toastXml("O'Higgins <X>", 'a & b', 'http://localhost:5173/#nivel=N%201&dir=X'))
      .toContain('activationType="protocol" launch="http://localhost:5173/#nivel=N%201&#38;dir=X"');
  });
});
