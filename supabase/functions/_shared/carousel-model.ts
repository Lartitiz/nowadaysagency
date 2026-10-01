// Carousel writing/review provider boundary, shared for edge bundle isolation.
// Other generators keep their models. No silent provider/model fallback.
import { AnthropicError, sanitizeStyle, sanitizeStyleDeep, type AnthropicOptions, type UsageSink } from "./anthropic.ts";

// Erreur typée avec un code de diagnostic SÛR (aucun secret, aucun message
// fournisseur) : la relecture l'écrit dans editorial_review.error au lieu d'un
// « unavailable » muet (01/10 : 2 relectures sur 2 en échec en < 1 s, cause invisible).
export class CarouselWriterError extends AnthropicError {
  diagnostic: string;
  constructor(message: string, status: number, diagnostic: string) {
    super(message, status);
    this.diagnostic = diagnostic;
  }
}

export function carouselWriterDiagnostic(error: unknown): string {
  if (error instanceof CarouselWriterError) return error.diagnostic;
  if (error instanceof AnthropicError) return `error_${error.status}`;
  return "exception";
}

export const CAROUSEL_WRITER_VERSION = "opus55-astra-medium-v1";
export type CarouselWriterModel = "claude-opus-5" | "claude-opus-5-5" | "gpt-6-astra";
export type CarouselWriterOptions = Omit<AnthropicOptions, "model"> & { model: CarouselWriterModel };

// Rédacteur par défaut : Opus 5.5. `writer_bench: "claude-opus-5"` rejoue l'ancien
// rédacteur pour comparaison ; carousel-ai ne le laisse passer que pour le compte
// QA Camille (champ effacé pour tout autre compte).
export function pickCarouselWriter(body: { quality_max?: boolean; writer_bench?: unknown }): CarouselWriterModel {
  if (body.quality_max) return "gpt-6-astra";
  if (body.writer_bench === "claude-opus-5") return "claude-opus-5";
  return "claude-opus-5-5";
}

// Opus 5.5 refuse `tool_choice` forcé (400) et ne coupe jamais sa réflexion :
// outil en `auto` + consigne explicite, et une marge de max_tokens pour la
// réflexion (qui compte dans le plafond sans être renvoyée).
const OPUS55_MIN_MAX_TOKENS = 16000;

export function writerRequest(options: CarouselWriterOptions): Record<string, unknown> {
  if (options.model === "claude-opus-5" || options.model === "claude-opus-5-5") {
    const opus55 = options.model === "claude-opus-5-5";
    const system = options.system && options.tool && opus55
      ? options.system + `\n\nLivre ta réponse uniquement en appelant l'outil \`${options.tool.name}\`, une seule fois.`
      : options.system;
    const maxTokens = options.max_tokens || 8192;
    return {
      model: options.model, system: system ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : "",
      messages: options.messages, max_tokens: opus55 ? Math.max(maxTokens, OPUS55_MIN_MAX_TOKENS) : maxTokens,
      thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      ...(options.tool ? {
        tools: [options.tool],
        tool_choice: opus55 ? { type: "auto", disable_parallel_tool_use: true } : { type: "tool", name: options.tool.name },
      } : {}),
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
    throw new CarouselWriterError("Le modèle de rédaction demandé n'a pas été utilisé. Réessaie.", 502, "wrong_model");
  }
  if (!openai && data.stop_reason === "refusal") {
    throw new CarouselWriterError("Le modèle a refusé cette demande. Reformule le sujet ou réessaie.", 422, "refusal");
  }
  if (openai ? data.status !== "completed" : data.stop_reason === "max_tokens") {
    throw new CarouselWriterError("La génération n'est pas complète. Réessaie.", 422, "incomplete");
  }
  let text: string;
  if (options.tool) {
    const blocks = openai ? data.output : data.content;
    const matches = (blocks || []).filter((b: any) => b.type === (openai ? "function_call" : "tool_use") && b.name === options.tool!.name);
    if (matches.length !== 1) throw new CarouselWriterError("La réponse structurée du carrousel est absente ou ambiguë. Réessaie.", 502, "tool_missing");
    let value: unknown;
    try { value = openai ? JSON.parse(matches[0].arguments) : matches[0].input; }
    catch { throw new CarouselWriterError("La réponse du carrousel est illisible. Réessaie.", 502, "tool_unreadable"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CarouselWriterError("La réponse du carrousel est invalide. Réessaie.", 502, "tool_invalid");
    text = JSON.stringify(options.keepDashes ? value : sanitizeStyleDeep(value));
  } else {
    const blocks = openai ? (data.output || []).filter((b: any) => b.type === "message").flatMap((b: any) => b.content || []) : data.content || [];
    text = blocks.filter((b: any) => b.type === (openai ? "output_text" : "text")).map((b: any) => b.text).join("\n");
    if (!options.keepDashes) text = sanitizeStyle(text);
  }
  if (!text.trim()) throw new CarouselWriterError("L'IA a renvoyé une réponse vide. Réessaie.", 502, "empty");
  const input = data.usage?.input_tokens, output = data.usage?.output_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
    throw new CarouselWriterError("L'usage de cette génération n'a pas pu être vérifié. Réessaie.", 502, "usage_unverified");
  }
  const inputTotal = input + (openai ? 0 : (data.usage.cache_read_input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0));
  // Reasoning tokens are already included in output_tokens. Only assign on success.
  if (sink) Object.assign(sink, { model: data.model, input_tokens: inputTotal, output_tokens: output, total_tokens: inputTotal + output });
  return text;
}

export async function callCarouselWriter(options: CarouselWriterOptions, sink?: UsageSink): Promise<string> {
  const openai = options.model === "gpt-6-astra";
  const key = Deno.env.get(openai ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
  if (!key) throw new CarouselWriterError("Ce modèle de rédaction n'est pas encore configuré. Aucun crédit décompté.", 503, "missing_key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.abortTimeoutMs || 120_000);
  try {
    const response = await fetch(openai ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(openai ? { Authorization: `Bearer ${key}` } : { "x-api-key": key, "anthropic-version": "2023-06-01" }) },
      body: JSON.stringify(writerRequest(options)),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      const safeCode = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
      const code = safeCode(failure?.error?.code), type = safeCode(failure?.error?.type);
      const retry = response.headers.get("retry-after");
      console.warn(JSON.stringify({event:"carousel_writer_failure",status:response.status,provider:openai?"openai":"anthropic",code,type,retry_after:retry && /^\d{1,6}$/.test(retry)?retry:null}));
      const exhausted = type === "insufficient_quota" || code === "insufficient_quota" || code === "credit_balance_exhausted";
      throw new CarouselWriterError(response.status === 429 ? (exhausted ? `Le budget du fournisseur de rédaction est épuisé. ${openai ? "Le mode Max est indisponible ; tu peux utiliser le mode standard." : "Le mode standard est indisponible."} Aucun crédit décompté.` : "Le fournisseur refuse momentanément la génération (limite 429). Réessaie plus tard. Aucun crédit décompté.") : "Le modèle de rédaction est indisponible. Réessaie dans un instant.", response.status === 429 ? 429 : 502, `${openai ? "openai" : "anthropic"}_http_${response.status}${code ? "_" + code : type ? "_" + type : ""}`);
    }
    const data = await response.json();
    // Opus 5.5 : l'outil n'est plus forcé. S'il répond sans l'appeler, on relance
    // UNE fois (même modèle, jamais de repli silencieux vers un autre).
    if (options.model === "claude-opus-5-5" && options.tool && data.stop_reason === "end_turn"
      && !(data.content || []).some((b: any) => b.type === "tool_use" && b.name === options.tool!.name)) {
      console.log(JSON.stringify({ type: "carousel_writer_tool_retry", model: options.model }));
      const retry = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(writerRequest(options)),
      });
      if (!retry.ok) {
        await retry.body?.cancel();
        throw new CarouselWriterError(retry.status === 429 ? "Le modèle est momentanément saturé. Réessaie dans un instant." : "Le modèle de rédaction est indisponible. Réessaie dans un instant.", retry.status === 429 ? 429 : 502, `anthropic_http_${retry.status}`);
      }
      return writerResponse(await retry.json(), options, sink);
    }
    return writerResponse(data, options, sink);
  } catch (error) {
    if (error instanceof AnthropicError) throw error;
    throw new CarouselWriterError(controller.signal.aborted ? "La rédaction a dépassé le délai prévu. Réessaie." : "La connexion au modèle de rédaction a échoué. Réessaie.", controller.signal.aborted ? 504 : 502, controller.signal.aborted ? "timeout" : "network");
  } finally { clearTimeout(timer); }
}
