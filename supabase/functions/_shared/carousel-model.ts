// Carousel writing/review provider boundary, shared for edge bundle isolation.
// Other generators keep their models. No silent provider/model fallback.
import { AnthropicError, sanitizeStyle, sanitizeStyleDeep, type AnthropicOptions, type UsageSink } from "./anthropic.ts";

export const CAROUSEL_WRITER_VERSION = "opus5-astra-medium-v1";
export type CarouselWriterModel = "claude-opus-5" | "gpt-6-astra";
export type CarouselWriterOptions = Omit<AnthropicOptions, "model"> & { model: CarouselWriterModel };

export function pickCarouselWriter(body: { quality_max?: boolean }): CarouselWriterModel {
  return body.quality_max ? "gpt-6-astra" : "claude-opus-5";
}

export function writerRequest(options: CarouselWriterOptions): Record<string, unknown> {
  if (options.model === "claude-opus-5") {
    return {
      model: options.model, system: options.system ? [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }] : "",
      messages: options.messages, max_tokens: options.max_tokens || 8192,
      thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      ...(options.tool ? { tools: [options.tool], tool_choice: { type: "tool", name: options.tool.name } } : {}),
    };
  }
  const input = options.messages.map(message => ({
    role: message.role,
    content: typeof message.content === "string" ? message.content : message.content.map(block => {
      if (block.type === "text") return { type: "input_text", text: block.text };
      if (block.type === "image" && block.source?.type === "base64") {
        return { type: "input_image", image_url: `data:${block.source.media_type};base64,${block.source.data}` };
      }
      throw new AnthropicError("Format de contenu non pris en charge pour ce carrousel.", 400);
    }),
  }));
  return {
    model: options.model, instructions: options.system || "", input,
    reasoning: { effort: "medium" }, max_output_tokens: options.max_tokens || 8192,
    store: false, service_tier: "default",
    ...(options.tool ? {
      // Keep the existing optional/free-form fields (strict normalization would
      // make them all required and forbid fields used by the visual pipeline).
      tools: [{ type: "function", name: options.tool.name, description: options.tool.description,
        parameters: options.tool.input_schema, strict: false }],
      tool_choice: { type: "function", name: options.tool.name }, parallel_tool_calls: false,
    } : {}),
  };
}

export function writerResponse(data: any, options: CarouselWriterOptions, sink?: UsageSink): string {
  const openai = options.model === "gpt-6-astra";
  if (data.model !== options.model && !data.model?.startsWith(options.model + "-20")) {
    throw new AnthropicError("Le modèle de rédaction demandé n'a pas été utilisé. Réessaie.", 502);
  }
  if (openai ? data.status !== "completed" : data.stop_reason === "max_tokens") {
    throw new AnthropicError("La génération n'est pas complète. Réessaie.", 422);
  }
  let text: string;
  if (options.tool) {
    const blocks = openai ? data.output : data.content;
    const matches = (blocks || []).filter((b: any) => b.type === (openai ? "function_call" : "tool_use") && b.name === options.tool!.name);
    if (matches.length !== 1) throw new AnthropicError("La réponse structurée du carrousel est absente ou ambiguë. Réessaie.", 502);
    let value: unknown;
    try { value = openai ? JSON.parse(matches[0].arguments) : matches[0].input; }
    catch { throw new AnthropicError("La réponse du carrousel est illisible. Réessaie.", 502); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AnthropicError("La réponse du carrousel est invalide. Réessaie.", 502);
    text = JSON.stringify(options.keepDashes ? value : sanitizeStyleDeep(value));
  } else {
    const blocks = openai ? (data.output || []).filter((b: any) => b.type === "message").flatMap((b: any) => b.content || []) : data.content || [];
    text = blocks.filter((b: any) => b.type === (openai ? "output_text" : "text")).map((b: any) => b.text).join("\n");
    if (!options.keepDashes) text = sanitizeStyle(text);
  }
  if (!text.trim()) throw new AnthropicError("L'IA a renvoyé une réponse vide. Réessaie.", 502);
  const input = data.usage?.input_tokens, output = data.usage?.output_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
    throw new AnthropicError("L'usage de cette génération n'a pas pu être vérifié. Réessaie.", 502);
  }
  const inputTotal = input + (openai ? 0 : (data.usage.cache_read_input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0));
  // Reasoning tokens are already included in output_tokens. Only assign on success.
  if (sink) Object.assign(sink, { model: data.model, input_tokens: inputTotal, output_tokens: output, total_tokens: inputTotal + output });
  return text;
}

export async function callCarouselWriter(options: CarouselWriterOptions, sink?: UsageSink): Promise<string> {
  const openai = options.model === "gpt-6-astra";
  const key = Deno.env.get(openai ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
  if (!key) throw new AnthropicError("Ce modèle de rédaction n'est pas encore configuré. Aucun crédit décompté.", 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.abortTimeoutMs || 120_000);
  try {
    const response = await fetch(openai ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(openai ? { Authorization: `Bearer ${key}` } : { "x-api-key": key, "anthropic-version": "2023-06-01" }) },
      body: JSON.stringify(writerRequest(options)),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AnthropicError(response.status === 429 ? "Le modèle est momentanément saturé. Réessaie dans un instant." : "Le modèle de rédaction est indisponible. Réessaie dans un instant.", response.status === 429 ? 429 : 502);
    }
    return writerResponse(await response.json(), options, sink);
  } catch (error) {
    if (error instanceof AnthropicError) throw error;
    throw new AnthropicError(controller.signal.aborted ? "La rédaction a dépassé le délai prévu. Réessaie." : "La connexion au modèle de rédaction a échoué. Réessaie.", controller.signal.aborted ? 504 : 502);
  } finally { clearTimeout(timer); }
}
