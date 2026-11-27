// ── Réponse Anthropic lue en flux (27/11/2026) ──
// Pour montrer un texte pendant qu'il s'écrit (script du reel : ~30 s d'écran
// vide avant, Loom de Laetitia du 27/11), `callAnthropic` peut demander la
// réponse en flux quand l'appelant passe `onText`. Ce module relit ce flux et
// le reconstruit sous la forme d'une réponse classique : `callAnthropic`
// applique ensuite EXACTEMENT les mêmes contrôles (refus, coupure, texte vide,
// usage). Seul le texte visible part à `onText`, jamais la réflexion du modèle.

/** Erreur de transport pendant le flux (coupure, évènement `error`) : `callAnthropic` réessaie. */
export class AnthropicStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicStreamError";
  }
}

export async function readAnthropicTextStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<any> {
  const reader = body.getReader(), decoder = new TextDecoder();
  const data: any = { usage: {}, content: [] };
  let buffer = "", text = "";
  const mergeUsage = (u: any) => {
    for (const [k, v] of Object.entries(u || {})) if (typeof v === "number") data.usage[k] = v;
  };
  // L'affichage du brouillon ne casse jamais l'écriture.
  const show = () => { try { onText(text); } catch { /* ignoré */ } };
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
      else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        text += event.delta.text || "";
        show();
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) data.stop_reason = event.delta.stop_reason;
        mergeUsage(event.usage);
      } else if (event.type === "error") {
        throw new AnthropicStreamError(`Anthropic stream error: ${String(event.error?.type || "unknown").slice(0, 60)}`);
      }
    }
    if (done) break;
  }
  // Flux coupé avant la fin du message : jamais un texte partiel pris pour la réponse.
  if (!data.stop_reason) throw new AnthropicStreamError("Anthropic stream interrompu avant la fin");
  data.content = [{ type: "text", text }];
  return data;
}
