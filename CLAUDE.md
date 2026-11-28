# NexoBIM — Verificador E.070 en Revit (Hackathon BIM + IA UNSA 2026, Reto 2)

Fuente de verdad: docs/PLAN_RETO2.md. Prompt para seguir desarrollando: docs/PROMPT_MAESTRO.md.

- Comandos: `npm run dev` (panel :5173 + API), `npm test` (motor), `node scripts/nexobim.ts <cmd>` (CLI), `node scripts/compilar-cs.ts` (compila C# en Revit).
- Regla de oro: la IA propone y explica (src/ai), el motor calcula (src/e070, funciones puras con tests), el ingeniero decide (aprobaciones en src/pipeline.ts), Revit refleja (revit/*.cs vía rvt-mcp).
- Ningún número sale de la IA. Ningún cambio en Revit sin aprobación explícita; todo queda en el registro de decisiones.
- Scripts C#: `public static McpDynamicScript.Run(UIApplication, JObject)`, siempre enviar `data`; transacciones propias (reversibles con Deshacer).
- Aviso "Prototipo académico — requiere verificación y firma de un ingeniero colegiado" siempre visible.
- Secretos en .env (no se versiona; ANTHROPIC_API_KEY o GROQ_API_KEY, sin clave = modo reglas). Usar la skill ponytail: código mínimo.
- Revit atiende a UN cliente rvt-mcp: panel, vigilante y CLI comparten uno con cola (vite.config.ts). Con `npm run dev` corriendo, la CLI y compilar-cs dan TARGET_BUSY.
- Suelo: `node scripts/nexobim.ts suelo:buscar|descargar|md|ubicar|cercanos|estado`. Los PDF se pasan a Markdown una vez (data/fuentes/md); a la IA solo van las páginas relevantes y cada cita se verifica (src/ai/suelo.ts).
- Fuentes públicas: sin saltar captchas ni logins, pausas de 2–3 s. Aviso de suelo: "Dato referencial de una obra pública cercana. No reemplaza el Estudio de Mecánica de Suelos del terreno exigido por la E.050."
