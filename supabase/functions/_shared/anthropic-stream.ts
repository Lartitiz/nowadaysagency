/**
 * Streaming SSE helper pour Anthropic API.
 * Réutilisé par creative-flow, coaching-module, et tout module qui veut streamer.
 * Pattern copié depuis chat-guide/index.ts (déjà en production).
 */

import { sanitizeStyle, supportsTemperature, stripTrailingAssistant, forcesDisabledThinking, type AnthropicUsage } from "./anthropic.ts";

export async function streamAnthropicSSE(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string | any[] }>,
  temperature: number,
  maxTokens: number,
): Promise<ReadableStream> {
  // Opus 4.8/4.7 rejettent temperature (paramètre d'échantillonnage) ET un prefill
  // (dernier tour assistant) → erreur 400. On retire les deux pour ces modèles, comme
  // le fait le helper non-streaming. Sonnet/Haiku gardent leur comportement habituel.
  const sampled = supportsTemperature(model);
  const finalMessages = sampled ? messages : stripTrailingAssistant(messages as any);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: finalMessages,
      ...(sampled ? { temperature } : {}),
      // Sonnet 5 : thinking adaptatif ON si le champ est omis → blocs thinking
      // qui mangent max_tokens sans produire de text_delta. Même garde que le
      // helper non-streaming (anthropic.ts).
      ...(forcesDisabledThinking(model) ? { thinking: { type: "disabled" } } : {}),
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

/**
 * Variante de `streamAnthropicSSE` qui FORCE un tool (`tool_choice`) — le JSON
 * de sortie est alors garanti valide par l'API elle-même (assemblage des
 * `input_json_delta`), au lieu d'un JSON en texte libre que Sonnet casse par
 * intermittence (saut de ligne ou guillemet non échappé dans une valeur → blob
 * ```json qui fuit au rendu du post ; cf. filets front #511/#524). Même couche
 * de transport que le stream texte : `createClientSSEStream` sait déjà assembler
 * les fragments `input_json_delta` et émettre le JSON complet au client, donc le
 * live « L'IA rédige en temps réel » est préservé (le champ `content` grandit à
 * l'identique côté front). `tool_choice` forcé est compatible avec un thinking
 * DÉSACTIVÉ (adaptatif-ON provoquerait un 400) : on garde donc la même garde.
 */
export async function streamAnthropicToolSSE(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string | any[] }>,
  temperature: number,
  maxTokens: number,
  tool: { name: string; description?: string; input_schema: unknown },
): Promise<ReadableStream> {
  const sampled = supportsTemperature(model);
  const finalMessages = sampled ? messages : stripTrailingAssistant(messages as any);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: finalMessages,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      ...(sampled ? { temperature } : {}),
      ...(forcesDisabledThinking(model) ? { thinking: { type: "disabled" } } : {}),
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

/**
 * Source d'un stream Anthropic : soit un ReadableStream déjà ouvert (pas de
 * relance possible), soit une factory `() => Promise<ReadableStream>` qui
 * permet de RE-ouvrir le stream (relance serveur sur overloaded / complétion
 * vide, avant que le moindre texte n'ait été envoyé au client).
 */
export type AnthropicStreamSource = ReadableStream | (() => Promise<ReadableStream>);

const backoffDelay = (attempt: number) =>
  new Promise<void>((r) => setTimeout(r, Math.min(1500, 300 * 2 ** attempt)));

/**
 * Transforme un stream Anthropic en stream SSE pour le client.
 * Envoie des events { type: "delta", text: "..." } puis { type: "done", full: "..." }
 *
 * Robustesse (bug post IG intermittent 10/07) :
 *  - Anthropic peut émettre un event `error` À L'INTÉRIEUR d'un stream 200
 *    (`overloaded_error`, `api_error`… fréquents en rafale). Avant, cet event
 *    n'était géré par AUCUNE branche → ignoré en silence → le stream se
 *    terminait avec fullText="" → on émettait un `done` vide → le front
 *    affichait « La génération a échoué ». On le détecte désormais.
 *  - On n'émet PLUS JAMAIS un `done` vide : un stream qui se termine sans le
 *    moindre delta est traité comme une erreur explicite (le front peut alors
 *    proposer un vrai « réessaie » au lieu d'un échec muet).
 *  - Si `source` est une factory, on RELANCE côté serveur (jusqu'à
 *    `maxRetries`) tant qu'aucun texte n'a été streamé au client — pour que
 *    l'utilisatrice ne voie quasi jamais l'échec.
 */
export function createClientSSEStream(
  source: AnthropicStreamSource,
  corsHeaders: Record<string, string>,
  onDone?: (fullText: string, usage?: AnthropicUsage) => Promise<void>,
  opts?: {
    maxRetries?: number;
    /**
     * Sortie tool forcé (`streamAnthropicToolSSE`) : le texte assemblé est du
     * JSON dont la validité repose sur la COMPLÉTUDE de l'assemblage. Si le
     * stream se coupe sur `stop_reason: "max_tokens"`, le JSON est tronqué donc
     * invalide → on le traite comme une erreur (jamais un `done` avec un JSON
     * amputé), pendant du garde `extractValidatedToolInput` du helper
     * non-streaming. Sans ce flag, un stream texte tronqué reste renvoyé tel
     * quel (comportement historique inchangé pour les autres consommateurs).
     */
    failOnTruncation?: boolean;
  },
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const canRetry = typeof source === "function";
  const maxRetries = opts?.maxRetries ?? (canRetry ? 2 : 0);
  const openStream = async (): Promise<ReadableStream> =>
    typeof source === "function" ? await source() : source;

  const outputStream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const enqueue = (obj: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      // Usage remonté par le stream Anthropic : input_tokens + modèle dans
      // `message_start`, output_tokens (cumulé) dans les `message_delta`.
      let inputTokens = 0;
      let outputTokens = 0;
      let usageModel = "";
      // Vrai dès qu'on a envoyé un delta au client : au-delà, plus de relance
      // possible (on dupliquerait le texte déjà affiché).
      let emittedDelta = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let fullText = "";          // texte assemblé de CETTE tentative
        let sawDelta = false;       // a-t-on reçu du texte sur cette tentative ?
        let streamError: string | null = null; // event `error` Anthropic dans un 200
        let truncated = false;      // stop_reason "max_tokens" (JSON tool amputé)

        let reader: ReadableStreamDefaultReader<Uint8Array>;
        try {
          reader = (await openStream()).getReader();
        } catch (err) {
          // Échec d'ouverture (streamAnthropicSSE throw sur 429/529…).
          streamError = String((err as any)?.message || err);
          if (canRetry && attempt < maxRetries && !emittedDelta) {
            console.warn(`[SSE] ouverture tentative ${attempt + 1} KO (${streamError}) → retry`);
            await backoffDelay(attempt);
            continue;
          }
          enqueue({ type: "error", error: streamError });
          close();
          return;
        }

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIdx).trim();
              buffer = buffer.slice(newlineIdx + 1);

              if (!line.startsWith("data: ")) continue;
              if (line === "data: [DONE]") continue;

              let event: any;
              try { event = JSON.parse(line.slice(6)); } catch { continue; /* JSON partiel */ }

              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                const text = event.delta.text;
                fullText += text;
                sawDelta = true;
                emittedDelta = true;
                enqueue({ type: "delta", text });
              } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
                // Sortie tool forcé : les fragments `partial_json` s'assemblent
                // en un JSON valide. On les relaie comme des `delta` texte —
                // le front les recolle et `cleanStreamingContent` en extrait le
                // champ `content` qui grandit, EXACTEMENT comme un stream texte.
                const text = event.delta.partial_json || "";
                if (text) {
                  fullText += text;
                  sawDelta = true;
                  emittedDelta = true;
                  enqueue({ type: "delta", text });
                }
              } else if (event.type === "message_start") {
                inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
                usageModel = event.message?.model ?? usageModel;
              } else if (event.type === "message_delta") {
                if (event.usage?.output_tokens != null) {
                  outputTokens = event.usage.output_tokens; // cumulé : on garde la dernière valeur
                }
                if (event.delta?.stop_reason === "max_tokens") truncated = true;
              } else if (event.type === "error") {
                // event `error` DANS un stream 200 (overloaded_error, api_error…)
                streamError = event.error?.message || event.error?.type || "stream_error";
              }
            }
            if (streamError) break;
          }
        } catch (err) {
          streamError = String((err as any)?.message || err);
        } finally {
          try { reader.releaseLock(); } catch { /* déjà libéré */ }
        }

        // ── Troncature d'une sortie tool : JSON amputé = invalide ──
        // On la promeut en erreur explicite (le front propose « Réessaie » au
        // lieu d'afficher un JSON cassé). N'affecte QUE les appelants qui
        // opt-in (post/pinterest en tool forcé) ; les streams texte gardent
        // leur comportement (une complétion tronquée reste renvoyée telle quelle).
        if (opts?.failOnTruncation && truncated && !streamError) {
          streamError = "La génération a été coupée car trop longue. Réessaie.";
        }

        // ── Succès : au moins un delta et pas d'erreur ──
        if (sawDelta && !streamError) {
          const cleanFull = sanitizeStyle(fullText);
          const usage: AnthropicUsage = {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            model: usageModel,
          };
          if (onDone) {
            try { await onDone(cleanFull, usage); } catch (e) { console.error("onDone error:", e); }
          }
          enqueue({ type: "done", full: cleanFull });
          close();
          return;
        }

        // ── Échec de la tentative : event error OU stream vide (0 delta) ──
        const reason = streamError || "completion vide (0 delta)";
        if (canRetry && attempt < maxRetries && !emittedDelta) {
          console.warn(`[SSE] tentative ${attempt + 1} KO (${reason}) → retry`);
          await backoffDelay(attempt);
          continue;
        }

        // Plus de relance possible → vraie erreur, JAMAIS un `done` vide.
        console.error(`[SSE] échec définitif après ${attempt + 1} tentative(s) : ${reason}`);
        enqueue({ type: "error", error: reason });
        close();
        return;
      }
    },
  });

  return new Response(outputStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Callback de progression passé au handler : émet un event SSE
 * `{ type: "status", stage, ...data }` que le client peut afficher
 * (vraies étapes de génération au lieu d'une barre simulée).
 * En mode non-SSE le handler reçoit un no-op — toujours sûr à appeler.
 */
export type StatusEmitter = (stage: string, data?: Record<string, unknown>) => void;

/**
 * Wrap an existing async handler (that returns a normal JSON Response) into
 * an SSE response that emits heartbeats every `intervalMs` ms while the
 * handler is running. When the handler resolves, the JSON body is parsed and
 * re-emitted as a single `done` event whose `full` field is the JSON string.
 * The handler receives a StatusEmitter to surface real progress stages.
 *
 * Goal: keep long-running edge functions alive through proxies/CDNs that
 * close idle connections after ~60s, WITHOUT changing any generation logic.
 */
export function runWithHeartbeatSSE(
  corsHeaders: Record<string, string>,
  work: (emitStatus: StatusEmitter) => Promise<Response>,
  intervalMs = 10000,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try { controller.enqueue(chunk); } catch { /* controller closed */ }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", t: Date.now() })}\n\n`));
      }, intervalMs);

      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", stage: "generating" })}\n\n`));

      const emitStatus: StatusEmitter = (stage, data) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", stage, ...(data || {}) })}\n\n`));
      };

      try {
        const response = await work(emitStatus);
        clearInterval(heartbeat);

        let bodyText = "";
        try { bodyText = await response.text(); } catch { bodyText = ""; }

        if (!response.ok) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: bodyText || `HTTP ${response.status}` })}\n\n`));
          safeClose();
          return;
        }

        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", full: bodyText })}\n\n`));
        safeClose();
      } catch (err) {
        clearInterval(heartbeat);
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: String((err as any)?.message || err) })}\n\n`));
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
