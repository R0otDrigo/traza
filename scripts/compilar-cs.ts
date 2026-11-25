// Compila (sin ejecutar) los scripts C# de /revit dentro de Revit.
import { readFileSync, readdirSync } from 'node:fs';
import { conectar, llamar } from './rvt.ts';

const c = await conectar();
for (const f of readdirSync('revit').filter(f => f.endsWith('.cs'))) {
  try {
    const r = await llamar(c, 'revit_send_code_to_revit', { code: readFileSync(`revit/${f}`, 'utf8'), data: {}, compile_only: true });
    console.log(`✓ ${f}: ${r.slice(0, 300)}`);
  } catch (e) { console.log(`✗ ${f}: ${(e as Error).message.slice(0, 1500)}`); }
}
await c.close();
