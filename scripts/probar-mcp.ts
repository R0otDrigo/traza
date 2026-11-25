// Prueba del servidor MCP "traza" como lo usaría Claude: leer Revit → verificar → simular.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const c = new Client({ name: 'prueba', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: ['mcp/traza-server.ts'], env: { ...process.env } as Record<string, string> }));
const llamar = async (name: string, args = {}) => {
  const r: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};
console.log('herramientas:', (await c.listTools()).tools.map(t => t.name).join(', '));
const leido = await llamar('traza_leer_modelo');
console.log('leer_modelo →', leido.muros.length, 'muros; pendientes:', leido.pendientes);
const v = await llamar('traza_verificar', { notasArquitectura: 'No tocar la fachada hacia la plaza' });
console.log('verificar →', v.chequeos.map((x: any) => `${x.nivel} ${x.dir} ${x.cumple ? 'cumple' : 'NO'}`).join(' · '));
console.log('explicación →', v.explicacion.fuente, '·', v.explicacion.resumen);
await c.close();
