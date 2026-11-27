// CLI de NexoBIM E.070. Uso: node scripts/nexobim.ts <crear|leer|aceptar|params Z U S|verificar|aplicar <opcionId>|revit:botones|estado>
import * as P from '../src/pipeline.ts';
import { cerrar } from '../src/revit/bridge.ts';

const [, , cmd, ...a] = process.argv;
try {
  let e: P.Estado;
  switch (cmd) {
    case 'crear': e = await P.crearCasoPrueba((a[0] as any) || 'municipalidad'); break;
    case 'guardar': e = await P.guardarModelo(); break;
    case 'leer': e = await P.leerModelo(); break;
    case 'aceptar': e = P.aceptarClasificacion(); break;
    case 'params': e = P.fijarParametros({ Z: +a[0], U: +a[1], S: +a[2], aprobados: true }); break;
    case 'verificar': e = await P.verificarYPintar(a.join(' ')); break;
    case 'aplicar': e = await P.aplicarOpcion(a[0]); break;
    case 'revit:botones': {
      // ToolBaker solo hornea desde sugerencias adaptativas: se repite el script (en seco) para que rvt-mcp lo sugiera
      // y se acepta con output_choice=ribbon_plus_mcp (botón en la cinta). Aceptar código send_code requiere ANTHROPIC_API_KEY.
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const { llamar, fijarInstancia } = await import('./rvt.ts');
      const { readFileSync } = await import('node:fs');
      try { process.loadEnvFile('.env'); } catch { /* sin .env */ }
      const k = new Client({ name: 'nexobim-botones', version: '0.1.0' });
      await k.connect(new StdioClientTransport({ command: `${process.env.LOCALAPPDATA}\\Bimwright\\rvt-mcp\\server\\current\\rvt-mcp.exe`,
        args: ['--toolsets', 'all', '--enable-adaptive-bake', '--cache-send-code-bodies'], env: process.env as Record<string, string>, stderr: 'ignore' }));
      try {
        await fijarInstancia(k);
        const botones = [['nexobim_verificar', 'NexoBIM: verificar', 'boton_verificar.cs', 'NEXOBIM_BOTON_VERIFICAR'], ['nexobim_panel', 'Abrir panel', 'boton_panel.cs', 'NEXOBIM_BOTON_PANEL']];
        for (const [, , f] of botones) for (let i = 0; i < 3; i++) await llamar(k, 'revit_send_code_to_revit', { code: readFileSync(`revit/${f}`, 'utf8'), data: { seco: true }, usage_context: 'project' });
        const sug: any[] = JSON.parse(await llamar(k, 'revit_list_bake_suggestions', { limit: 500 })).suggestions ?? [];
        for (const [name, display, , marca] of botones) {
          const s = sug.find(x => JSON.stringify(x).includes(marca));
          if (!s) { console.log(`✗ ${display}: rvt-mcp aún no lo sugiere (ToolBaker solo hornea sugerencias adaptativas). Reintenta más tarde o acéptalo en la Bake Inbox de Revit.`); continue; }
          console.log(`✓ ${display}: ${await llamar(k, 'revit_accept_bake_suggestion', { id: s.id, name, output_choice: 'ribbon_plus_mcp', params_schema: '{}' })}`);
        }
        console.log(await llamar(k, 'revit_list_baked_tools', { nameFilter: 'nexobim' }));
      } finally { await k.close(); }
      e = P.leer(); break;
    }
    default: e = P.leer();
  }
  for (const l of e.log.slice(0, 6).reverse()) console.log(`[${l.quien}] ${l.accion}: ${l.detalle}`);
  if (e.resultado) for (const c of e.resultado.chequeos) console.log(`${c.cumple ? '✓' : '✗'} ${c.nivel} ${c.dir}  ΣLt=${c.sumaLt}  densidad=${c.densidad} / req=${c.requerido}`);
  if (e.explicacion) console.log(`\n${e.explicacion.resumen}`), e.explicacion.recomendaciones.forEach(r => console.log(` ${r.orden}. ${r.opcionId}: ${r.justificacion}`));
  const p = P.pendientes(e); if (p.length) console.log(`\nPendiente: ${p.join(', ')}`);
} finally { await cerrar(); }
