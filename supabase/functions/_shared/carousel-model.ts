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

export const CAROUSEL_WRITER_VERSION = "opus55-fable51-medium-v2";
export type CarouselWriterModel = "claude-opus-5" | "claude-opus-5-5" | "claude-fable-5-1" | "gpt-6-astra";
export type CarouselWriterOptions = Omit<AnthropicOptions, "model"> & {
  model: CarouselWriterModel;
  /**
   * Texte reçu jusqu'ici, à chaque morceau (07/10/2026 : slides montrées en
   * brouillon pendant l'écriture). Réponse en flux, Anthropic seulement ; avec
   * un outil (08/10/2026, carrousels photo et mixte), c'est le JSON de l'outil
   * en cours d'écriture. Astra : ignoré. Le résultat final reste contrôlé à
   * l'identique.
   */
  onText?: (text: string) => void;
};

// Mode Max : Claude Fable 5.1 (le modèle Anthropic le plus capable) depuis le
// 02/10 ; Astra (OpenAI) le faisait avant et tombait avec le crédit OpenAI.
// Retour arrière SANS code : secret `CAROUSEL_MAX_WRITER` = "gpt-6-astra" (ou
// "claude-opus-5-5"), lu à chaque requête.
export const CAROUSEL_MAX_WRITER_DEFAULT = "claude-fable-5-1" as const;
export function carouselMaxWriter(): CarouselWriterModel {
  const override = Deno.env.get("CAROUSEL_MAX_WRITER");
  return override === "gpt-6-astra" || override === "claude-opus-5-5" ? override : CAROUSEL_MAX_WRITER_DEFAULT;
}

// Rédacteur par défaut : Opus 5.5. `writer_bench: "claude-opus-5"` rejoue l'ancien
// rédacteur pour comparaison ; carousel-ai ne le laisse passer que pour le compte
// QA Camille (champ effacé pour tout autre compte).
export function pickCarouselWriter(body: { quality_max?: boolean; writer_bench?: unknown }): CarouselWriterModel {
  if (body.quality_max) return carouselMaxWriter();
  if (body.writer_bench === "claude-opus-5") return "claude-opus-5";
  return "claude-opus-5-5";
}

// Opus 5.5 et Fable 5.1 refusent `tool_choice` forcé (400) et ne coupent jamais
// leur réflexion : outil en `auto` + consigne explicite, et une marge de
// max_tokens pour la réflexion (qui compte dans le plafond sans être renvoyée).
const NO_FORCED_TOOL_MIN_MAX_TOKENS = 16000;
const noForcedTool = (model: CarouselWriterModel) => model === "claude-opus-5-5" || model === "claude-fable-5-1";

export function writerRequest(options: CarouselWriterOptions): Record<string, unknown> {
  if (options.model !== "gpt-6-astra") {
    const autoTool = noForcedTool(options.model);
    const system = options.system && options.tool && autoTool
      ? options.system + `\n\nLivre ta réponse uniquement en appelant l'outil \`${options.tool.name}\`, une seule fois.`
      : options.system;
    const maxTokens = options.max_tokens || 8192;
    return {
      model: options.model, system: system ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : "",
      messages: options.messages, max_tokens: autoTool ? Math.max(maxTokens, NO_FORCED_TOOL_MIN_MAX_TOKENS) : maxTokens,
      thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      ...(streamsText(options) ? { stream: true } : {}),
      ...(options.tool ? {
        tools: [options.tool],
        tool_choice: autoTool ? { type: "auto", disable_parallel_tool_use: true } : { type: "tool", name: options.tool.name },
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

const streamsText = (options: CarouselWriterOptions) => !!options.onText && options.model !== "gpt-6-astra";

/**
 * Relit une réponse Anthropic en flux et la reconstruit sous la forme d'une
 * réponse classique : `writerResponse` applique ensuite les MÊMES contrôles
 * (modèle, refus, coupure, outil, usage). Seul le texte visible (ou, avec
 * `toolName`, le JSON de cet outil en cours d'écriture) est transmis à
 * `onText` ; la réflexion du modèle ne l'est jamais.
 */
export async function readWriterStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void, toolName?: string): Promise<any> {
  const reader = body.getReader(), decoder = new TextDecoder();
  const data: any = { usage: {} };
  const blocks: any[] = [];
  let buffer = "", text = "", textBlocks = 0;
  const mergeUsage = (u: any) => {
    for (const [k, v] of Object.entries(u || {})) if (typeof v === "number") data.usage[k] = v;
  };
  const show = (value: string) => { try { onText(value); } catch { /* l'affichage du brouillon ne casse jamais l'écriture */ } };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() + "\n\n" : decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const line = buffer.slice(0, end).split("\n").find((l) => l.startsWith("data:"));
      buffer = buffer.slice(end + 2);
      if (!line) continue;
      let event: any;
      try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (event.type === "message_start") { data.model = event.message?.model; mergeUsage(event.message?.usage); }
      else if (event.type === "content_block_start" && event.content_block?.type === "text") {
        if (textBlocks++ > 0) text += "\n";
        blocks[event.index] = { type: "text" };
      } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        blocks[event.index] = { type: "tool_use", id: event.content_block.id, name: event.content_block.name, json: "" };
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        text += event.delta.text || "";
        if (!toolName) show(text);
      } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        const block = blocks[event.index];
        if (block?.type === "tool_use") {
          block.json += event.delta.partial_json || "";
          if (block.name === toolName) show(block.json);
        }
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) data.stop_reason = event.delta.stop_reason;
        mergeUsage(event.usage);
      } else if (event.type === "error") {
        const type = typeof event.error?.type === "string" && /^[a-z_]{1,60}$/.test(event.error.type) ? event.error.type : "unknown";
        throw new CarouselWriterError(type === "overloaded_error" ? "Le modèle est momentanément saturé. Réessaie dans un instant." : "Le modèle de rédaction est indisponible. Réessaie dans un instant.", type === "overloaded_error" ? 429 : 502, `anthropic_stream_${type}`);
      }
    }
    if (done) break;
  }
  // Les arguments d'un outil arrivent en morceaux de JSON : relus en entier à la
  // fin. Illisibles → pas d'entrée, et writerResponse refuse comme d'habitude.
  const tools = blocks.filter((b) => b?.type === "tool_use").map((b) => {
    let input: unknown;
    try { input = b.json.trim() ? JSON.parse(b.json) : {}; } catch { input = undefined; }
    return { type: "tool_use", id: b.id, name: b.name, input };
  });
  data.content = [{ type: "text", text }, ...tools];
  return data;
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
      throw new CarouselWriterError(response.status === 429 ? (exhausted ? `Le budget du fournisseur de rédaction est épuisé. ${openai ? "Le mode Max est indisponible ; tu peux utiliser le mode standard." : "La génération de carrousels est indisponible."} Aucun crédit décompté.` : "Le fournisseur refuse momentanément la génération (limite 429). Réessaie plus tard. Aucun crédit décompté.") : "Le modèle de rédaction est indisponible. Réessaie dans un instant.", response.status === 429 ? 429 : 502, `${openai ? "openai" : "anthropic"}_http_${response.status}${code ? "_" + code : type ? "_" + type : ""}`);
    }
    const data = streamsText(options) && response.body
      ? await readWriterStream(response.body, options.onText!, options.tool?.name)
      : await response.json();
    // Opus 5.5 : l'outil n'est plus forcé. S'il répond sans l'appeler, on relance
    // UNE fois (même modèle, jamais de repli silencieux vers un autre).
    if (noForcedTool(options.model) && options.tool && data.stop_reason === "end_turn"
      && !(data.content || []).some((b: any) => b.type === "tool_use" && b.name === options.tool!.name)) {
      console.log(JSON.stringify({ type: "carousel_writer_tool_retry", model: options.model }));
      const retry = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        // Relance sans flux : le brouillon déjà affiché reste jusqu'au texte final.
        body: JSON.stringify(writerRequest({ ...options, onText: undefined })),
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
