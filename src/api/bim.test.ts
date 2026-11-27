import { test, expect } from 'vitest';
import { rutas, datosParametros } from './bim.ts';
import type { Estado } from '../pipeline.ts';

test('escribir parámetros sin aprobación se rechaza', async () => {
  await expect(rutas['POST bim/parametros'].fn({}, {} as any)).rejects.toThrow(/aprobación/);
});

test('arma parámetros de muros y proyecto desde el último resultado', () => {
  const e = {
    parametros: { Z: 0.35, U: 1, S: 1.15, aprobados: true }, decisiones: { '7': 'portante' }, clasificacion: {},
    resultado: {
      norma: 'RNE E.070 Art. 19.2.b', fecha: '2026-11-28T10:00:00Z',
      muros: { '7': { estado: 'cuenta', motivos: [] } },
      tramos: [{ muroId: '7', nivel: 'N1', dir: 'X', L: 2, t: 0.23, cuenta: true }, { muroId: '7', nivel: 'N1', dir: 'X', L: 1, t: 0.23, cuenta: false }],
      chequeos: [{ nivel: 'N1', dir: 'X', ratio: 0.8 }],
    },
  } as unknown as Estado;
  const d = datosParametros(e, 'Ing. Prueba');
  expect(d.muros['7']).toEqual({ NexoBIM_Estado: 'cuenta', NexoBIM_Motivo: '-', NexoBIM_Rol: 'portante', NexoBIM_Tramo_Lt: 0.46, NexoBIM_Ratio: 0.8 });
  expect(d.proyecto).toMatchObject({ NexoBIM_Z: 0.35, NexoBIM_U: 1, NexoBIM_S: 1.15, NexoBIM_S_Fuente: 'manual', NexoBIM_Aprobado_Por: 'Ing. Prueba', NexoBIM_Norma: 'RNE E.070 Art. 19.2.b' });
  expect(d.proyecto).not.toHaveProperty('NexoBIM_Suelo_URL');
});
