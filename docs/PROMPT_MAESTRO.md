# Prompt maestro — seguir desarrollando TRAZA E.070

> Pega esto en una sesión nueva de Claude Code abierta en la carpeta del proyecto.
> Antes de empezar: abre Revit 2027 con el modelo e inicia Complementos → RvtMcp. Corre `npm run dev`.

```text
/ponytail full

Lee CLAUDE.md y docs/PLAN_RETO2.md. TRAZA ya funciona de punta a punta:
Revit (rvt-mcp) → IA clasifica muros → ingeniero aprueba → motor E.070 → IA explica → Revit pintado → aplicar opciones.

Reglas: la IA nunca calcula, ningún cambio en Revit sin aprobación, todo queda en el registro de decisiones.
Mantén los tests en verde (npm test) y compila los C# con node scripts/compilar-cs.ts antes de ejecutarlos.

Usa estos subagentes (.claude/agents) en paralelo cuando no toquen los mismos archivos:
- motor-estructural (src/e070): verificación de esfuerzo axial E.070 19.1.b como segundo chequeo, con tests.
- qa-validacion: docs/VALIDACION.md comparando el motor con fixtures/referencia.csv (Excel del ingeniero civil).
- revit-bridge (revit/): botón propio en la cinta de Revit (ToolBaker de rvt-mcp) y revisión en vivo al editar muros.
- ui-trazabilidad (src/app): pulir el panel (frontend-design, dataviz), modo presentación a pantalla completa.
- memoria-presentacion: presentación ejecutiva (skill pptx o artefacto de slides) con capturas de Revit.
Skills: threejs-* para el 3D, claude-api para la IA, traza-e070 para operar el agente.

Primero dime qué falta para la demo del 28/11 según la sección 8 del plan y propón el orden.
```

## Instalado en esta PC
- Node.js 26, GitHub CLI (sesión iniciada), rvt-mcp 2.5.1 (add-in en Revit 2027 + registrado en Claude Code a nivel de usuario).
- Servidor MCP propio `traza` en `.mcp.json` (Claude Code lo ofrece al abrir el proyecto).
- Skills en `.claude/skills`: threejs-* (13), ponytail, ponytail-review, ponytail-audit, traza-e070.
- Ponytail como plugin (opcional, con hooks y contador de tokens), en el cuadro de Claude Code, dos mensajes por separado:
  `/plugin marketplace add DietrichGebert/ponytail` y luego `/plugin install ponytail@ponytail`.

## IA real (opcional pero recomendado para la demo)
Define `ANTHROPIC_API_KEY` en el entorno antes de `npm run dev`. Sin ella, TRAZA clasifica y explica con reglas deterministas y lo indica en pantalla ("IA: modo reglas").
