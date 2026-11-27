import { defineConfig, type Plugin, type ViteDevServer } from 'vitest/config';
import type { IncomingMessage } from 'node:http';

// .env (ANTHROPIC_API_KEY, NEXOBIM_REVIT_PID) para el código de servidor; sin .env se trabaja en modo reglas.
try { process.loadEnvFile('.env'); } catch { /* sin .env */ }

// API local del panel: el navegador nunca habla con Revit ni con la API de Claude directamente.
function nexobimApi(): Plugin {
  let server: ViteDevServer;
  let cola = Promise.resolve<unknown>(null); // Revit procesa una orden a la vez
  const cuerpo = (req: IncomingMessage) => new Promise<any>(ok => { let s = ''; req.on('data', d => (s += d)).on('end', () => ok(s ? JSON.parse(s) : {})); });
  return {
    name: 'nexobim-api',
    configureServer(s) {
      server = s;
      s.middlewares.use('/api', async (req, res) => {
        const P = await server.ssrLoadModule('/src/pipeline.ts');
        const ruta = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const enviar = (code: number, data: unknown, tipo = 'application/json') => { res.statusCode = code; res.setHeader('Content-Type', tipo); res.end(tipo === 'application/json' ? JSON.stringify(data) : data); };
        try {
          if (req.method === 'GET' && ruta === 'estado') { const e = P.leer(); return enviar(200, { ...e, pendientes: P.pendientes(e) }); }
          if (req.method === 'GET' && ruta === 'memoria') { const M = await server.ssrLoadModule('/src/report/memoria.ts'); return enviar(200, M.memoriaHtml(P.leer()), 'text/html; charset=utf-8'); }
          const b = req.method === 'GET' ? {} : await cuerpo(req);
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
          // Rutas de los módulos (suelo, bim, vigilante): src/api/*.ts
          const A = await server.ssrLoadModule('/src/api/index.ts');
          const def = A.rutas[`${req.method} ${ruta}`];
          if (def) {
            const ctx = { query: new URL(req.url ?? '', 'http://x').searchParams, req, res };
            const correr = () => def.fn(b, ctx);
            const out = await (def.usaRevit ? (cola = cola.catch(() => null).then(correr)) : correr());
            if (res.writableEnded) return;
            return enviar(200, out && typeof out === 'object' && 'log' in out ? { ...out, pendientes: P.pendientes(out) } : out);
          }
          if (!acciones[ruta]) return enviar(404, { error: `Ruta desconocida: ${req.method} ${ruta}` });
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
  plugins: [nexobimApi()],
  server: { watch: { ignored: ['**/public/live/**', '**/vendor/**'] } },
  build: { rollupOptions: { input: { main: 'index.html', porticos: 'porticos.html' } } },
  test: { include: ['src/**/*.test.ts'] },
});
