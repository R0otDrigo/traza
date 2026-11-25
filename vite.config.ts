import { defineConfig, type Plugin, type ViteDevServer } from 'vitest/config';
import type { IncomingMessage } from 'node:http';

// API local del panel: el navegador nunca habla con Revit ni con la API de Claude directamente.
function trazaApi(): Plugin {
  let server: ViteDevServer;
  let cola = Promise.resolve<unknown>(null); // Revit procesa una orden a la vez
  const cuerpo = (req: IncomingMessage) => new Promise<any>(ok => { let s = ''; req.on('data', d => (s += d)).on('end', () => ok(s ? JSON.parse(s) : {})); });
  return {
    name: 'traza-api',
    configureServer(s) {
      server = s;
      s.middlewares.use('/api', async (req, res) => {
        const P = await server.ssrLoadModule('/src/pipeline.ts');
        const ruta = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const enviar = (code: number, data: unknown, tipo = 'application/json') => { res.statusCode = code; res.setHeader('Content-Type', tipo); res.end(tipo === 'application/json' ? JSON.stringify(data) : data); };
        try {
          if (req.method === 'GET' && ruta === 'estado') { const e = P.leer(); return enviar(200, { ...e, pendientes: P.pendientes(e) }); }
          if (req.method === 'GET' && ruta === 'memoria') { const M = await server.ssrLoadModule('/src/report/memoria.ts'); return enviar(200, M.memoriaHtml(P.leer()), 'text/html; charset=utf-8'); }
          const b = await cuerpo(req);
          const acciones: Record<string, () => unknown> = {
            crear: () => P.crearCasoPrueba(b.caso),
            guardar: () => P.guardarModelo(),
            leer: () => P.leerModelo(),
            params: () => P.fijarParametros(b),
            decidir: () => P.decidir(b.id, b.rol),
            aceptar: () => P.aceptarClasificacion(),
            verificar: () => P.verificarYPintar(b.notas ?? ''),
            aplicar: () => P.aplicarOpcion(b.opcionId),
          };
          if (!acciones[ruta]) return enviar(404, { error: `Ruta desconocida: ${ruta}` });
          const r = (cola = cola.catch(() => null).then(acciones[ruta]));
          const e = await r as any;
          enviar(200, { ...e, pendientes: P.pendientes(e) });
        } catch (err) {
          enviar(400, { error: (err as Error).message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [trazaApi()],
  server: { watch: { ignored: ['**/public/live/**', '**/vendor/**'] } },
  build: { rollupOptions: { input: { main: 'index.html', porticos: 'porticos.html' } } },
  test: { include: ['src/**/*.test.ts'] },
});
