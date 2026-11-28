// Un solo punto de llamada a la IA, con salida JSON validada por zod. Proveedor según .env:
// ANTHROPIC_API_KEY → Claude; si no, GROQ_API_KEY → Groq (API compatible con OpenAI); si no, null → modo reglas.
// La IA solo propone/transcribe: quien llama verifica (citas, ids) y el motor calcula.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const CLAUDE = 'claude-opus-5-5';
const GROQ = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

export type Proveedor = 'Claude' | 'Groq';
export function proveedor(): Proveedor | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'Claude';
  if (process.env.GROQ_API_KEY) return 'Groq';
  return null;
}
/** Identifica modelo y proveedor (para la caché de respuestas). */
export const modeloIA = () => proveedor() === 'Groq' ? `groq:${GROQ()}` : CLAUDE;

let _claude: Anthropic | undefined;
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Pide JSON que cumpla `schema`. null si no hay IA, se niega, falla la red o la respuesta no valida. */
export async function pedirJson<T extends z.ZodType>(schema: T, sistema: string, usuario: string, esfuerzo: 'low' | 'medium' = 'medium'): Promise<z.infer<T> | null> {
  const p = proveedor();
  if (!p) return null;
  try {
    if (p === 'Claude') {
      _claude ??= new Anthropic();
      const r = await _claude.messages.parse({
        model: CLAUDE, max_tokens: 16000,
        output_config: { effort: esfuerzo, format: zodOutputFormat(schema) },
        system: sistema, messages: [{ role: 'user', content: usuario }],
      });
      return r.stop_reason === 'refusal' ? null : (r.parsed_output ?? null);
    }
    const cuerpo = JSON.stringify({
      model: GROQ(), temperature: 0, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${sistema}\n\nResponde SOLO con un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}` },
        { role: 'user', content: usuario },
      ],
    });
    for (let intento = 1; ; intento++) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', body: cuerpo,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      });
      if (r.status === 429 && intento < 4) { await espera(1000 * Math.min(60, +(r.headers.get('retry-after') ?? 10))); continue; } // límite por minuto
      if (!r.ok) { console.error(`IA (Groq) no disponible (${r.status} ${(await r.text()).slice(0, 200)}); se usan reglas.`); return null; }
      const texto = (await r.json()).choices?.[0]?.message?.content ?? '';
      const ok = schema.safeParse(JSON.parse(texto));
      if (!ok.success) { console.error(`IA (Groq) devolvió JSON fuera del esquema; se usan reglas. ${ok.error.message.slice(0, 200)}`); return null; }
      return ok.data;
    }
  } catch (e) {
    if (p === 'Claude' && !(e instanceof Anthropic.AnthropicError)) throw e;
    console.error(`IA (${p}) no disponible (${(e as Error).message}); se usan reglas.`);
    return null;
  }
}
