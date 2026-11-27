import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { verificarIfc } from './ifc.ts';

test('cuenta muros y los que tienen el Pset NexoBIM', async () => {
  const r = await verificarIfc(fileURLToPath(new URL('../../fixtures/minimo.ifc', import.meta.url)));
  expect(r).toMatchObject({ muros: 2, conPset: 1, verificado: false });
});
