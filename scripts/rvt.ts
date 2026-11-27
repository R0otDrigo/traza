// Cliente MCP mínimo hacia rvt-mcp (Revit).
// Uso: node scripts/rvt.ts --list [filtro] | --schema <tool> | <tool> [jsonArgs]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXE = `${process.env.LOCALAPPDATA}\\Bimwright\\rvt-mcp\\server\\current\\rvt-mcp.exe`;

export async function conectar() {
  const c = new Client({ name: 'nexobim', version: '0.2.0' });
  await c.connect(new StdioClientTransport({ command: EXE, args: [], stderr: 'ignore' }));
  await fijarInstancia(c);
  return c;
}

/** rvt-mcp exige confirmar la instancia antes de escribir. Preferimos NEXOBIM_REVIT_PID, luego una instancia con proyecto abierto. */
export async function fijarInstancia(c: Client) {
  let version = (process.env.NEXOBIM_REVIT_PID ?? process.env.TRAZA_REVIT_PID) ? `pid:${process.env.NEXOBIM_REVIT_PID ?? process.env.TRAZA_REVIT_PID}` : 'auto';
  if (version === 'auto') {
    try {
      const t = JSON.parse(await llamar(c, 'revit_list_available_targets')).targets as { pid: number; window_title: string }[];
      const conDoc = t.filter(x => !/\[Home\]|\[Inicio\]/.test(x.window_title));
      if (t.length > 1) version = `pid:${(conDoc[0] ?? t[0]).pid}`;
    } catch { /* sin Revit: se informará al llamar */ }
  }
  await c.callTool({ name: 'revit_switch_target', arguments: { version, verify: true } }).catch(() => {});
}

export async function llamar(c: Client, name: string, args: Record<string, unknown> = {}) {
  const r: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  const txt = (r.content ?? []).map((x: any) => x.text ?? '').join('\n');
  if (/TARGET_BUSY/.test(txt)) throw new Error('Revit está atendiendo a otro cliente (panel, CLI o agente MCP). Usa uno a la vez; al cerrar uno, Revit tarda ~1 min en liberar la conexión.');
  if (/REVIT_REQUEST_NOT_STARTED/.test(txt)) throw new Error('Revit no aceptó la orden: cierra diálogos o comandos activos en Revit (Esc) y reintenta.');
  if (r.isError) throw new Error(`${name}: ${txt}`);
  return txt;
}

if (import.meta.main) {
  const c = await conectar();
  const [, , a, b] = process.argv;
  const { tools } = await c.listTools();
  if (a === '--list') {
    for (const t of tools.filter(t => !b || t.name.includes(b))) console.log(t.name, '—', (t.description ?? '').slice(0, 140).replace(/\s+/g, ' '));
    console.log(`(${tools.length} herramientas)`);
  } else if (a === '--schema') {
    console.log(JSON.stringify(tools.find(t => t.name === b), null, 1));
  } else console.log(await llamar(c, a, b ? JSON.parse(b) : {}));
  await c.close();
}
