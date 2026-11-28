import { test, expect } from 'vitest';

test('guardia: la IA no puede introducir números que el motor no dio', async () => {
  const { filtrarExplicacion } = await import('./asistente.ts');
  const opciones = [{ id: 'o1', nivel: 'N1', dir: 'X', muroId: 'm', tipo: 'espesor', detalle: 'Engrosar MX-1', deltaLt: 2.07 }] as any;
  const base = { resumen: 'Base', recomendaciones: [{ opcionId: 'o1', orden: 1, justificacion: 'Engrosar MX-1: aporta 2.07 m² de L·t.', impactoArquitectonico: 'Por evaluar con arquitectura.' }], fuente: 'regla' as const };
  const datos = JSON.stringify({ deficit: 3.06, opciones });
  const r = filtrarExplicacion({ resumen: 'Suman 3.22 > 3.06', recomendaciones: [
    { opcionId: 'o1', orden: 1, justificacion: 'Aporta 2.07 y cubre 3.06', impactoArquitectonico: 'Interior, sin fachada' },
    { opcionId: 'inventada', orden: 2, justificacion: 'x', impactoArquitectonico: 'x' }] }, base, opciones, datos);
  expect(r.resumen).toBe('Base');
  expect(r.recomendaciones).toEqual([{ opcionId: 'o1', orden: 1, justificacion: 'Aporta 2.07 y cubre 3.06', impactoArquitectonico: 'Interior, sin fachada' }]);
});
