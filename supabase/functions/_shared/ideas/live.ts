import { AnthropicError, sanitizeStyle, type UsageSink } from "../anthropic.ts";

/**
 * Lecture « au fil de l'écriture » des idées (Trouver une idée) : le texte d'une
 * réponse Anthropic en flux, et les valeurs d'un JSON encore incomplet pour
 * montrer une idée pendant qu'elle s'écrit. Même requête, même modèle, mêmes
 * consignes que l'appel classique : seule la façon de recevoir la réponse change.
 */

/** Valeurs (dans l'ordre) d'une clé texte d'un JSON en cours d'écriture. La
 * dernière peut être incomplète (`complete: false`). */
export function partialJsonStrings(text: string, key: string): Array<{ value: string; complete: boolean }> {
  const out: Array<{ value: string; complete: boolean }> = [];
  const re = new RegExp(`"${key}"\\s*:\\s*"`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    let i = re.lastIndex, value = "", complete = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') { complete = true; i++; break; }
      if (ch !== "\\") { value += ch; i++; continue; }
      const next = text[i + 1];
      if (next === undefined) break; // échappement coupé en fin de flux
      if (next === "u") {
        const hex = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
        value += String.fromCharCode(parseInt(hex, 16)); i += 6; continue;
      }
      value += ({ n: "\n", t: "\t", r: "", b: "", f: "" } as Record<string, string>)[next] ?? next; i += 2;
    }
    out.push({ value, complete });
    re.lastIndex = i;
  }
  return out;
}

/** Champs visibles d'une idée en cours d'écriture (ceux du haut de la carte). */
export const DRAFT_FIELDS = ["subject", "insight", "mechanism", "reader_benefit"] as const;
export type DraftFields = Partial<Record<typeof DRAFT_FIELDS[number], string>>;
export function draftFields(text: string): DraftFields {
  const fields: DraftFields = {};
  for (const key of DRAFT_FIELDS) {
    const value = partialJsonStrings(text, key)[0]?.value.trim();
    if (value) fields[key] = sanitizeStyle(value).slice(0, 1200);
  }
  return fields;
}

/**
 * Lit un flux SSE Anthropic : appelle `onText(texteSoFar)` à chaque fragment et
 * rend le texte final, avec les mêmes gardes que l'appel classique (refus,
 * réponse coupée, réponse vide) et le même nettoyage (`sanitizeStyle`).
 */
export async function readAnthropicText(stream: ReadableStream<Uint8Array>, onText: (text: string) => void, usage: UsageSink, model: string, timeoutMs: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", stop = "", input = 0, output = 0;
  const timer = setTimeout(() => { reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (!line.startsWith("data: ")) continue;
        let event: any;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          text += event.delta.text || "";
          try { onText(text); } catch { /* l'affichage ne coupe jamais la génération */ }
        } else if (event.type === "message_start") {
          input = event.message?.usage?.input_tokens || 0;
        } else if (event.type === "message_delta") {
          if (event.usage?.output_tokens != null) output = event.usage.output_tokens;
          if (event.delta?.stop_reason) stop = event.delta.stop_reason;
        } else if (event.type === "error") {
          throw new AnthropicError(event.error?.message || "Erreur du flux de l'IA", 529);
        }
      }
    }
  } finally { clearTimeout(timer); try { reader.releaseLock(); } catch { /* déjà libéré */ } }
  Object.assign(usage, { model, input_tokens: input, output_tokens: output, total_tokens: input + output });
  if (!stop) throw new AnthropicError("Le flux de l'IA s'est arrêté avant la fin.", 504);
  if (stop === "refusal") throw new AnthropicError("Le modèle a refusé cette demande. Reformule-la ou réessaie.", 422);
  if (stop === "max_tokens") throw new AnthropicError("La génération a été coupée car trop longue. Réessaie.", 422);
  const clean = sanitizeStyle(text);
  if (!clean.trim()) throw new AnthropicError("L'IA a renvoyé une réponse vide. Réessaie.", 502);
  return clean;
}
