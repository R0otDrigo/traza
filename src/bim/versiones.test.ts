import { test, expect } from 'vitest';
import { huella, agregarVersion } from './versiones.ts';
import type { ModeloRevit } from '../revit/bridge.ts';
import type { Resultado } from '../e070/types.ts';

const muro = (id: string, t = 0.13) => ({ id, nivel: 'N1', x1: 0, y1: 0, x2: 4, y2: 0, t, h: 2.6, aberturas: [], marca: '', estructural: true, funcion: '', comentarios: '' });
const modelo = (muros: any[]): ModeloRevit => ({ documento: 'd', ruta: '', niveles: [], muros });

test('la huella no depende del orden y cambia con el espesor', () => {
  expect(huella(modelo([muro('1'), muro('2')]))).toBe(huella(modelo([muro('2'), muro('1')])));
  expect(huella(modelo([muro('1'), muro('2', 0.23)]))).not.toBe(huella(modelo([muro('1'), muro('2')])));
});

test('guarda cumplimiento por nivel y dirección, máx. 30 versiones', () => {
  const r = { fecha: '2026-11-28', chequeos: [{ nivel: 'N1', dir: 'X', cumple: false }, { nivel: 'N1', dir: 'Y', cumple: true }] } as Resultado;
  let v = agregarVersion([], modelo([muro('1')]), r, 'a');
  expect(v[0].cumplimiento).toEqual([{ nivel: 'N1', dir: 'X', cumple: false }, { nivel: 'N1', dir: 'Y', cumple: true }]);
  for (let i = 0; i < 40; i++) v = agregarVersion(v, modelo([muro('1')]), r);
  expect(v).toHaveLength(30);
});
