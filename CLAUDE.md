# TRAZA — Verificador E.070 en Revit (Hackathon BIM + IA UNSA 2026, Reto 2)

Fuente de verdad: docs/PLAN_RETO2.md. Prompt para seguir desarrollando: docs/PROMPT_MAESTRO.md.

- Comandos: `npm run dev` (panel :5173 + API), `npm test` (motor), `node scripts/traza.ts <cmd>` (CLI), `node scripts/compilar-cs.ts` (compila C# en Revit).
- Regla de oro: la IA propone y explica (src/ai), el motor calcula (src/e070, funciones puras con tests), el ingeniero decide (aprobaciones en src/pipeline.ts), Revit refleja (revit/*.cs vía rvt-mcp).
- Ningún número sale de la IA. Ningún cambio en Revit sin aprobación explícita; todo queda en el registro de decisiones.
- Scripts C#: `public static McpDynamicScript.Run(UIApplication, JObject)`, siempre enviar `data`; transacciones propias (reversibles con Deshacer).
- Aviso "Prototipo académico — requiere verificación y firma de un ingeniero colegiado" siempre visible.
- Secretos en .env (no se versiona). Usar la skill ponytail: código mínimo.
