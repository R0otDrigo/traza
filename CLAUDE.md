# TRAZA — Hackathon BIM + IA UNSA 2026, Reto 2

Fuente de verdad: docs/PLAN_RETO2.md. Prompt de trabajo: docs/PROMPT_MAESTRO.md.

- Comandos: `npm run dev` (visor), `npm test` (motor), `npm run build`.
- Regla de oro: la IA propone y explica, el motor (src/engine) calcula y el ingeniero decide. Nada de cálculo dentro de src/ai.
- Cada número del motor es un `ResultadoTrazable` (fórmula, sustitución, norma, inputs).
- Coeficientes solo en src/engine/criteria.ts; los valida el ingeniero civil.
- El aviso "Prototipo académico — requiere verificación y firma de un ingeniero colegiado" siempre visible.
- Secretos en .env (no se versiona). Usar la skill ponytail: código mínimo.
